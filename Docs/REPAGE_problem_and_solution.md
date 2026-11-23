# REPAGE Reading-Window Algorithm — Problem and Solution

**Part I** reproduces the mathematical formalization of the REPAGE algorithm (the problem).
**Part II** gives worked solutions to the six optimization targets listed in its §7, with an honest scorecard of what each one actually buys.

---

# PART I — THE PROBLEM

# REPAGE Reading-Window Algorithm — Mathematical Formalization

> Purpose of this document: strip the engineering/Android detail out of the
> REPAGE spec and expose the actual mathematical objects underneath it, so
> that a math background can be brought to bear on where it is
> over-engineered, statistically inefficient, or could be replaced by a
> cleaner closed-form solution. The system is, underneath the Kotlin, a
> **contextual bandit with a hand-coded safety policy layered on top of an
> online Bayesian classifier**. Section 7 lists concrete places a 30–80%
> improvement (in compute, data-efficiency, or convergence speed) plausibly
> lives — that's the part worth putting in front of a lecturer.

---

## 1. The problem as a sequential decision process

At each discrete decision time $t$ (event-triggered, roughly every 15–45
minutes of wall-clock time), the system observes a context vector
$x_t \in \mathbb{R}^d$ ($d \approx 30$ after one-hot expansion), and must
choose an action

$$
a_t \in \{\text{hold},\ \text{passive},\ \text{active}\}
$$

An action other than "hold" produces a stochastic outcome $y_t$ (defined in
§4), and the system updates its internal parameters $w_t \to w_{t+1}$ from
$(x_t, a_t, y_t)$.

This is a **contextual bandit** with:
- a single evolving policy (no separate arms to compare — action is a
  thresholded scalar score),
- **delayed, graded, not-fully-observed rewards** (an "ignored" outcome only
  resolves after a fixed 5-hour censoring window),
- a **hard constraint set** (§5) that overrides the learned policy entirely
  in certain states — i.e. a *constrained* bandit, where the constraints are
  not learned and not soft-penalized, but literally zero out the action
  space.

The stated objective (§1 of the source doc) is **not** expected reward
maximization in the usual bandit sense. It is asymmetric:

$$
\max_{w} \; \mathbb{E}[\text{continuation}] \quad \text{subject to} \quad
\mathbb{E}[\text{dismissal}] \le \epsilon
$$

for some implicit small $\epsilon$, with a dismissal treated as a much larger
negative event than a success is a positive one (see the $2\times$ sample
weight in §4, and the "closes the channel for the day" rule in §5.3). This is
closer to a **chance-constrained optimization** or a **risk-sensitive bandit
(CVaR-style)** than to plain expected-value maximization, but the source
implements the risk-sensitivity as a set of manual rules rather than as a
term in an objective function. That gap — "risk aversion as hard rules" vs.
"risk aversion as a term you can tune" — is probably the single most
promising thing to hand a mathematician.

---

## 2. Feature vector and normalization

$x \in \mathbb{R}^{15}$ core features (§5.1 of source) plus 5 cyclic/harmonic
features (§5.2) plus up to 8 consent-gated one-hots (§5.4). Each raw feature
$f$ is transformed:

$$
x'_f = \frac{\log(1+f) - \mu_f}{\sigma_f} \quad \text{(log-scaled features)}
\qquad\qquad
x'_f = \frac{f - \mu_f}{\sigma_f} \quad \text{(others)}
$$

with $\mu_f, \sigma_f$ maintained **online per user** via **Welford's
algorithm** (streaming mean/variance, no stored history):

$$
n \leftarrow n+1, \qquad
\delta \leftarrow f - \mu_f, \qquad
\mu_f \leftarrow \mu_f + \delta/n, \qquad
M_2 \leftarrow M_2 + \delta\,(f - \mu_f), \qquad
\sigma_f^2 = M_2 / (n-1)
$$

Missing values are mapped to $x'_f = 0$ (the neutral point post-normalization)
rather than imputed.

**Temporal features** are a 2-harmonic truncated Fourier basis on the
day/week cycle instead of a 24×7 histogram:

$$
\phi(h) = \big(\sin\tfrac{2\pi h}{24},\ \cos\tfrac{2\pi h}{24},\
\sin\tfrac{4\pi h}{24},\ \cos\tfrac{4\pi h}{24}\big)
$$

i.e. a rank-4 truncation of the Fourier series that would fully represent an
arbitrary 24-hour function. This is a **modeling choice with a clear
bias–variance trade-off** (fewer parameters, faster cold start, but caps
expressiveness at 2 harmonics) — a natural thing to ask a lecturer to
quantify: *how much of the true weekly signal's variance is lost by
truncating at 2 harmonics vs. 3, and is there a principled stopping rule
(e.g. based on expected sample size before overfitting a 3rd harmonic)
instead of the fixed choice of 2?*

---

## 3. The estimator: online Bayesian logistic regression + bootstrap ensemble

### 3.1 Model

$$
P(\text{continuation} \mid x) = \sigma(w^\top x), \qquad \sigma(z) = \frac{1}{1+e^{-z}}
$$

### 3.2 Prior

Each coefficient has an independent Gaussian prior:

$$
w_j \sim \mathcal{N}(\mu_j^{\text{prior}}, \tau^2)
$$

with $\mu_j^{\text{prior}}$ set from domain heuristics (Table in §6.3 of
source, e.g. $+0.5$ for "fresh unlock", $-0.4$ for "low battery"), and a
single shared $\tau^2$ controlling shrinkage strength for all features
uniformly.

### 3.3 Uncertainty: 5-model bootstrap ensemble

Rather than a closed-form posterior covariance, the system maintains **5
bootstrap-resampled logistic models** and estimates uncertainty empirically:

$$
\hat p = \frac{1}{5}\sum_{k=1}^{5} \sigma(w_k^\top x), \qquad
\sigma_{\text{ens}} = \sqrt{\frac{1}{5}\sum_{k=1}^{5}\big(\sigma(w_k^\top x)-\hat p\big)^2}
$$

### 3.4 The conservative (decision-facing) score

$$
p_{\text{LCB}} = \hat p - 0.84\,\sigma_{\text{ens}}
$$

using $0.84 \approx z_{0.20}$, i.e. treating the ensemble spread as if it
were a normal sampling distribution and taking a one-sided 20th-percentile
lower confidence bound.

**This is the single largest candidate for optimization.** A 5-particle
bootstrap ensemble is a crude, high-variance estimator of a *predictive*
uncertainty that has a much cheaper, lower-variance closed-form
approximation available: since this is (regularized) Bayesian logistic
regression, a **Laplace approximation** to the posterior gives

$$
\Sigma^{-1} \approx \tau^{-2} I + \sum_i \hat p_i(1-\hat p_i)\, x_i x_i^\top
$$

(the Hessian of the negative log-posterior at the MAP estimate), from which
the predictive variance at a new point is directly

$$
\text{Var}(w^\top x) = x^\top \Sigma x
$$

and $p_{\text{LCB}}$ can be computed **without training 5 separate models,
without bootstrap resampling, and without the discretization noise of only
5 samples**. This is exactly the kind of thing worth asking a lecturer to
formalize and bound the approximation error on — and it plausibly *is* the
30–80% compute reduction, since the ensemble is retrained/updated on every
single outcome (§8.2), 5× over.

### 3.5 Online update

On every outcome, with time-decay $\gamma^{\Delta \text{days}}$ ($\gamma
\approx 0.98$) applied to existing sufficient statistics, each ensemble
member takes one gradient step (regularized logistic regression online
update) with a per-outcome sample weight $s \in \{0.5, 1, 2\}$ (§4). This is
a standard weighted online Bayesian update; the open question is whether the
decay and the weighting can be unified into a single **exponentially
weighted Kalman-filter-style** update on $w$ directly, instead of decaying
"all weights" as a separate operation from the gradient step.

### 3.6 Exploration

$\approx 5\%$ of decisions are made by **Thompson sampling**: draw
$w \sim \mathcal{N}(\hat w, \Sigma)$ and act on the sampled model rather than
the mean. Under the Laplace-approximation reframing above, this becomes a
direct, cheap multivariate normal draw instead of a fixed discrete choice
among 5 pre-fit models — again potentially cheaper *and* better-calibrated
(continuous exploration instead of 5 fixed points in weight space).

---

## 4. The reward / label function

Outcomes are mapped to a graded label $y$ and a sample weight $s$:

| Outcome | $y$ | $s$ |
|---|---|---|
| Dismissed | 0.0 | 2.0 |
| Ignored (5h censor) | 0.25 | 1.0 |
| Opened late (> 2h) | 0.5 | 1.0 |
| Opened | 0.6 | 1.0 |
| Continuation (opened + >60s engagement) | 1.0 | 1.0 |
| Spontaneous session (no dose sent) | +0.5 | 0.5 |

This is a **hand-built loss reweighting scheme**, not derived from any
stated statistical principle. It is worth asking:

- Is $(y, s)$ jointly equivalent to some proper scoring rule under a
  different (single) generative assumption about user receptiveness — e.g.
  could this whole table collapse into a single continuous function of
  "time-to-open" and "engagement duration," fit rather than hand-set?
- The $2\times$ weight on dismissal plus separate hard-budget lockout (§5.3)
  double-counts the same risk-aversion in two different mechanisms (loss
  weighting *and* action-space constraint). Is that intentional
  regularization or redundant?

---

## 5. The discipline layer as constrained optimization

### 5.1 Hard gates

A function $G(x) \in \{0,1\}$ (DND, low battery, driving, overnight
charging, cooldown) that **zeroes the feasible action set** regardless of
$p_{\text{LCB}}$. Formally this restricts the domain of the decision rule
rather than penalizing it — a hard constraint, not a soft one.

### 5.2 Thresholds and the "double key"

$$
a_t = \text{active} \iff p_{\text{LCB}} \ge \theta_{\text{active}} \ \text{and}\
\text{runway}(t) \ge \text{doseLength} + 2
$$
$$
a_t = \text{passive} \iff p_{\text{LCB}} \ge \theta_{\text{passive}}
$$

with $\theta_{\text{active}} = 0.65$, $\theta_{\text{passive}} = 0.35$, fixed
constants adjusted only by a small rule ($-0.02$ after 10 consecutive
successes). **This is a manually chosen operating point on an ROC-style
curve.** The natural mathematical reframing: given the asymmetric cost
structure in §4 (dismissal costs more than a success earns), the
*optimal* threshold is not a fixed constant at all but the solution to a
**Bayes-risk minimization**:

$$
\theta^* = \arg\min_\theta \; \mathbb{E}\big[c_{\text{FP}} \cdot \mathbb{1}[p_{\text{LCB}}\ge\theta,\ y=0] +
c_{\text{FN}} \cdot \mathbb{1}[p_{\text{LCB}}<\theta,\ y=1]\big]
$$

where $c_{\text{FP}}, c_{\text{FN}}$ can be derived directly from the
existing label weights in §4 instead of being separately hand-tuned as
$0.65$/$0.35$. This is a concrete, boundable optimization problem a
lecturer could actually solve in closed form given the empirical outcome
distribution, rather than the current fixed-constant-plus-nudge heuristic.

### 5.3 Budget as a knapsack / resource-constrained bandit

- 1 active dose/day, capacity increases to 3 based on a trailing hit-rate
  $\ge 0.70$ over the last 10 outcomes.
- Any dismissal closes the active channel for the rest of the day.
- "Survival mode" auto-engages when the trailing 7-day dismissal rate
  $> 0.20$, tightening the budget to 1/day and raising $\theta_{\text{active}}$
  to 0.75.

This is a **resource-constrained (budgeted) bandit** where the budget itself
is a step function of a trailing statistic, rather than the output of an
explicit optimization (e.g. a Lagrangian relaxation of "maximize
continuations subject to expected dismissals per week $\le k$", which would
produce a *continuously* adapting budget/threshold pair instead of the
current discrete mode-switch between "normal" and "survival mode"). Worth
asking: does a soft Lagrangian formulation dominate the two-regime switch,
and can the multiplier be updated online instead of thresholded?

### 5.4 The runway estimator

$$
\text{runway}(t) = \mathbb{E}[\text{remaining gap} \mid \text{state}_t] +
P(\text{next gap within 30 min}) \cdot \mathbb{E}[\text{next gap length}]
$$

An empirical mixture estimate from historical gap-length distributions by
hour (§5.5, §9 `gap_stats`). This is effectively **survival analysis**
(time-to-next-interruption) approximated by empirical hour-conditional
means rather than a fitted hazard/survival function — a natural place to
ask whether a parametric hazard model (e.g. Weibull or log-normal gap
lengths, fit per hour-of-day or via the same harmonic basis as §2) gives a
better-calibrated runway estimate with far less stored state than raw
`gap_stats` histograms.

---

## 6. Full decision function (single expression)

$$
a_t =
\begin{cases}
\text{hold} & \text{if } G(x_t) = 1 \text{ or budget exhausted} \\[4pt]
\text{active} & \text{if } p_{\text{LCB}}(x_t) \ge \theta_{\text{active}} \ \text{and} \ \text{runway}(t) \ge L+2 \\[4pt]
\text{passive} & \text{if } p_{\text{LCB}}(x_t) \ge \theta_{\text{passive}} \\[4pt]
\text{hold} & \text{otherwise}
\end{cases}
$$

with $p_{\text{LCB}}(x_t) = \hat p(x_t) - 0.84\,\sigma_{\text{ens}}(x_t)$,
$\hat p(x_t) = \sigma(w^\top x_t)$, and $w$ updated online per §3.5–§4.

---

## 7. Candidate optimization targets (ranked by likely payoff)

These are the concrete questions worth putting in front of a lecturer,
roughly ordered by expected impact:

1. **Replace the 5-model bootstrap ensemble with a Laplace-approximated
   Gaussian posterior** (§3.4). Likely the largest single win: same
   $p_{\text{LCB}}$ semantics, $O(d^2)$ closed-form update instead of 5×
   independent model fits, and a *continuous* (rather than 5-point-sampled)
   uncertainty estimate. This is where a 60–80% reduction in per-outcome
   compute plausibly lives.
2. **Derive $\theta_{\text{active}}, \theta_{\text{passive}}$ from the
   existing label-cost table as a Bayes-risk minimizer** (§5.2) instead of
   fixed constants with an ad hoc nudge rule — removes a whole class of
   manual tuning and gives thresholds that automatically track a changing
   outcome distribution.
3. **Reformulate the budget/survival-mode switch as a Lagrangian-constrained
   bandit** (§5.3): one continuously-adapting multiplier instead of a
   discrete mode flip, with the current "raise threshold to 0.75, budget to
   1/day" replaced by whatever the multiplier implies at the current
   dismissal rate.
4. **Fit the runway estimator as a hazard/survival model** (§5.4) on the
   existing harmonic time basis instead of maintaining raw per-hour gap
   histograms — smaller state, principled extrapolation to hours with
   little data yet.
5. **Justify or replace the fixed 2-harmonic truncation** (§2) with a
   data-driven choice of harmonic count (e.g. cross-validated or via an
   information criterion), especially since the system already tracks
   enough outcome history to test this per user cohort.
6. **Unify time-decay + online Bayesian update into a single recursive
   (Kalman-filter-style) update** (§3.5) rather than two separate
   mechanisms (decay step, then gradient step).

Sections 3.4 and 5.2 are the two to lead with — they are self-contained,
don't require touching the Android/systems layer at all, and are the most
likely source of the 30–80% the request is aiming for (3.4 on compute,
5.2 on data-efficiency / policy quality).

---

# PART II — THE SOLUTION

Each subsection below answers the correspondingly numbered target in §7 of the problem. Where the "30–80%" framing does not survive a complexity audit, that is stated explicitly.

## 8.1 Replacing the bootstrap ensemble (§3.4)

### The real issue is dimensionality, not just speed

**Five bootstrap particles estimating a covariance in $d\approx30$ dimensions is a rank-deficient estimator.** An empirical covariance from $n$ samples has rank $\le n-1$, so the 5-particle ensemble can represent uncertainty along at most 4 directions of a 30-dimensional space. It is structurally blind to variance in the other 26. Whatever $\sigma_{\text{ens}}$ reports, it is not really "the model's uncertainty"; it is the spread of 5 arbitrarily seeded points in a space they cannot span.

### Fix: Laplace approximation, mean-field (diagonal) version

For independent Gaussian priors $w_j\sim\mathcal N(\mu_j^{\text{prior}},\tau^2)$ and an observation with weight $s$, keep a per-coordinate precision $\Lambda_j$ and update:

$$
\Lambda_j \;\leftarrow\; \gamma\Lambda_j + s\,\hat p(1-\hat p)\,x_j^2,\qquad
w_j \;\leftarrow\; w_j + \Lambda_j^{-1}x_j\,s\,(y-\hat p)
$$

$$
\text{Var}(w^\top x)\;\approx\;\sum_j x_j^2/\Lambda_j
$$

This is $O(d)$ per update, the same order as a single bootstrap member. Going from 5 sequential $O(d)$ updates to 1 is a genuine ~80% reduction in per-outcome work, and the uncertainty estimate is better conditioned than 5 particles in 30-D.

### Why not the full-covariance version in §3.4?

The full Laplace approximation

$$
\Sigma^{-1}\approx\tau^{-2}I+\sum_i \hat p_i(1-\hat p_i)x_ix_i^\top
$$

costs $O(d^2)$ per update even with a Sherman–Morrison rank-1 update (which avoids the naive $O(d^3)$ re-inversion):

$$
\Sigma_t = \Sigma_{t|t-1} - \frac{s\hat p(1-\hat p)\,\Sigma_{t|t-1}xx^\top\Sigma_{t|t-1}}{1+s\hat p(1-\hat p)\,x^\top\Sigma_{t|t-1}x}
$$

For $d\approx30$: $d^2=900 \gg 5d=150$. **The full-covariance version is asymptotically more expensive than the bootstrap it replaces.** It only pays off if cross-feature correlations are actually needed, which 5 particles could not estimate reliably anyway. Recommendation: diagonal by default; keep Sherman–Morrison for a small dense feature subset, or if consent-gated feature pruning shrinks $d$ substantially.

### Computing $p_{\text{LCB}}$ from the Gaussian belief

With $z=w^\top x\sim\mathcal N(m,\,v)$ where $m=\hat w^\top x$ and $v=\text{Var}(w^\top x)$, the classic sigmoid–Gaussian approximations give

$$
\mathbb E[\sigma(z)] \approx \sigma\!\left(\frac{m}{\sqrt{1+\pi v/8}}\right),\qquad
\text{Var}(\sigma(z))\approx \big[\sigma(m)(1-\sigma(m))\big]^2\, v
$$

(probit approximation for the mean; delta method for the variance). Substituting into $p_{\text{LCB}}=\hat p-0.84\,\sigma_{\text{ens}}$ reproduces the existing decision-facing quantity with no bootstrap, no retraining, and a continuous rather than 5-point uncertainty.

### Optional: switch to a probit link

The approximation above exists because logistic-sigmoid plus Gaussian is not conjugate. With a probit link $\Phi(w^\top x)$ the Gaussian-belief update is *exactly* closed-form. This is the design of Microsoft's **AdPredictor** (Graepel, Quiñonero Candela, Borchert & Herbrich, ICML 2010, "Web-Scale Bayesian Click-Through Rate Prediction for Sponsored Search Advertising in Microsoft's Bing Search Engine"): a probit regression model, factorizing Gaussian beliefs over weights, and closed-form online updates from approximate message passing. REPAGE §3–§3.6 is structurally a re-derivation of this family of systems, which makes it useful prior art to cite.

### Thompson sampling (§3.6)

Once $(\hat w,\Lambda^{-1})$ is maintained, draw $w\sim\mathcal N(\hat w,\text{diag}(\Lambda^{-1}))$ directly. This replaces "pick one of 5 fixed particles" with continuous exploration.

## 8.2 Thresholds as a Bayes-risk minimizer (§5.2)

For a calibrated $p=P(y=1\mid x)$ with false-positive cost $c_{FP}$ (act, but $y=0$) and false-negative cost $c_{FN}$ (hold, but $y=1$ would have occurred), the risk-minimizing rule acts iff $(1-p)\,c_{FP} < p\,c_{FN}$, i.e.

$$
\theta^\* = \frac{c_{FP}}{c_{FP}+c_{FN}}
$$

Identifying $c_{FP},c_{FN}$ with the label weights in §4 (a modeling choice: it equates "learning emphasis" with "decision cost", which is parsimonious and testable but not automatic): dismissal weight $s=2.0$, continuation weight $s=1.0$ gives

$$
\theta_{\text{active}}^\* = \frac{2}{2+1} \approx 0.667
$$

This is within 2.5% of the hand-tuned $0.65$. The constant was roughly right, and deriving it means it tracks any change to the cost table automatically, replacing the $-0.02$-after-10-successes nudge rule.

**$\theta_{\text{passive}}=0.35$.** The source does not split cost by action type, so this cannot be derived from the existing table. If a passive dismissal carries no lockout penalty (cost $\approx 1$) and a passive success is worth about 2, then $\theta^\*=1/(1+2)\approx0.33$, close to $0.35$, but this is a post-hoc rationalization, not a derivation. The real fix is to log outcomes by action type and estimate $c_{FP},c_{FN}$ empirically per action.

## 8.3 Budget and survival mode as Lagrangian relaxation (§5.3)

Constrained objective: maximize $\sum_t\mathbb E[\text{reward}_t]$ subject to $\frac1N\sum_t \mathbb E[\text{dismiss}_t]\le k$ (here $k=0.20$, the current survival-mode trigger).

$$
\mathcal L(\theta,\lambda) = \sum_t\mathbb E[\text{reward}_t] - \lambda\Big(\tfrac1N\sum_t\mathbb E[\text{dismiss}_t]-k\Big)
$$

At fixed $\lambda$ the per-decision optimum is the §8.2 rule with an inflated false-positive cost, $c_{FP}^{\text{eff}}=c_{FP}+\lambda$:

$$
\theta(\lambda) = \frac{c_{FP}+\lambda}{c_{FP}+\lambda+c_{FN}}
$$

which is monotonically increasing in $\lambda$. Update the multiplier by projected dual (sub)gradient ascent, using the trailing dismissal-rate estimate $\hat d_t$ the system already computes:

$$
\lambda_{t+1} = \big[\lambda_t + \eta\,(\hat d_t - k)\big]_+
$$

This replaces the binary survival-mode flag with a shadow price that rises smoothly as the dismissal rate approaches $k$ and relaxes smoothly as it falls, instead of snapping to $\theta=0.75$ and 1 dose/day. The 1-vs-3 dose capacity is a second resource constraint: give it its own multiplier $\mu_t$ and fold both in via $c_{FP}^{\text{eff}}=c_{FP}+\lambda_t+\mu_t$, so a single formula governs both the risk cap and the daily budget.

## 8.4 Runway as mean residual life (§5.4)

The existing runway formula is an ad hoc discretization of a **mean residual life** (MRL) computation from survival analysis. Model the gap hazard with the harmonic basis from §2:

$$
\lambda(h)=\exp\big(\beta^\top\phi(h)\big)
$$

If the hazard is locally constant (memoryless), the remaining wait is exponential and the runway has a trivial closed form:

$$
\text{runway}(t) = \frac{1}{\lambda(h(t))}
$$

No mixture and no "within 30 min" special case. For a heavier or lighter tail, use a Weibull gap model:

$$
S(u)=e^{-(u/\lambda)^k},\qquad
\text{MRL}(a) = \frac{1}{S(a)}\int_a^\infty S(u)\,du
$$

computable via the upper incomplete gamma function. At a 15–45 minute decision cadence the exponential case is likely sufficient, and the added complexity is probably not worth it.

Fit $\beta$ online with the same recursive machinery as §8.6. Stored state drops from a per-hour histogram (`gap_stats`, roughly $24\times3\approx70$ numbers) to $2K{+}1\approx5$ coefficients, a reduction of over 90%, with principled extrapolation to hours that have little data.

## 8.5 Data-driven harmonic truncation (§2)

- **Model selection.** Fit $K=1,2,3$ harmonics by recursive least squares and choose $K^\*=\arg\min_K \text{AIC}(K)$, where $\text{AIC}(K)=2(2K{+}1)-2\log L(K)$. Use BIC for a more conservative penalty as history accumulates.
- **Soft truncation.** Place a decaying-variance prior on harmonic amplitude, $\beta_k\sim\mathcal N(0,\,c/k^2)$ (an ARD-style smoothness prior). Higher harmonics are damped toward zero rather than hard-excluded, and the effective order grows gracefully with data, with no fixed cutoff to choose.

## 8.6 Unification: decay and update as one state-space model (§3.5)

The 5-model ensemble, the "decay all weights" step, and the "gradient step" collapse into **one recursive filter**:

$$
\textbf{Predict:}\quad \Sigma_{t|t-1}=\Sigma_{t-1}/\gamma
$$

$$
\textbf{Update:}\quad K_t=\frac{\Sigma_{t|t-1}x_t}{x_t^\top\Sigma_{t|t-1}x_t + R_t},\qquad R_t=\frac{1}{s_t\hat p_t(1-\hat p_t)}
$$

$$
\hat w_t = \hat w_{t-1} + K_t(y_t-\hat p_t),\qquad \Sigma_t=(I-K_tx_t^\top)\Sigma_{t|t-1}
$$

This is the standard dynamic-generalized-linear-model / assumed-density-filtering construction. With $\Sigma$ diagonal it costs $O(d)$, matching the §8.1 recommendation. §3.4, §3.5 and §6 of the problem are not three separate problems; they are one filter described three times.

## 9. Revised decision function (replaces §6)

$$
a_t =
\begin{cases}
\text{hold} & \text{if } G(x_t) = 1 \text{ or budget exhausted} \\[4pt]
\text{active} & \text{if } p_{\text{LCB}}(x_t) \ge \theta^\*(\lambda_t,\mu_t) \ \text{and} \ \dfrac{1}{\lambda(h_t)} \ge L+2 \\[8pt]
\text{passive} & \text{if } p_{\text{LCB}}(x_t) \ge \theta_{\text{passive}}^\* \\[4pt]
\text{hold} & \text{otherwise}
\end{cases}
$$

with

$$
\theta^\*(\lambda_t,\mu_t)=\frac{c_{FP}+\lambda_t+\mu_t}{c_{FP}+\lambda_t+\mu_t+c_{FN}},\qquad
p_{\text{LCB}}=\mathbb E[\sigma(z)]-0.84\sqrt{\text{Var}(\sigma(z))}
$$

where $(\hat w,\Lambda)$ are maintained by the single filter in §8.6 and $\lambda_t,\mu_t$ by dual ascent per §8.3. Hard gates $G(x)$ are unchanged.

## 10. Scorecard

| Item | What it actually saves | Magnitude | Caveat |
|---|---|---|---|
| Diagonal Laplace vs. 5-model bootstrap | Per-outcome compute | ~80% (5×→1×, same $O(d)$ order) | Full-covariance version is *worse* at $d\approx30$ |
| Bayes-risk threshold | Manual tuning; self-adjusting | Data-efficiency / maintainability, not flops | Treats $s$ as both learning weight and decision cost |
| Lagrangian budget | Removes discrete mode-switch | Policy quality, not compute | Needs a tuned dual step size $\eta$ |
| Hazard-model runway | Stored state | >90% (~70 numbers → ~5) | Check exponential assumption against real gap tails |
| Harmonic model selection | Removes a hand-picked constant | Marginal compute; mainly rigor | AIC needs enough per-user history to be stable |
| Unified filter (8.6) | 3 mechanisms → 1 | Structural, not a % | The point to lead with |

**Bottom line.** The defensible version of the "30–80%" claim is *diagonal* Laplace, not the full-covariance Laplace the source proposes. The larger prize is structural: one filter instead of three mechanisms, thresholds derived rather than hand-set, and a continuous Lagrangian multiplier instead of a mode flip.
