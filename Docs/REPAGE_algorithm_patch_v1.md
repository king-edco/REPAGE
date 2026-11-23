# REPAGE Reading-Window Algorithm — Part III: V1 Patch

> **Status**: amends `REPAGE-reading-window-algorithm.md` (the normative
> reference) and builds on Part II of `REPAGE_problem_and_solution.md`.
> **Rule**: until these changes are merged into the reference document,
> this patch wins where they disagree. After merging, delete the
> corresponding patch item.
> **Goal**: fix the issues that threaten V1's *learning quality* (cold-start
> uncertainty, label bias, data starvation) before spending effort on further
> mathematical refinement.

---

## 0. Summary

| ID | Patch | Fixes | Touches (reference doc) | V1? |
|---|---|---|---|---|
| P1 | Replace the 5-model bootstrap with a diagonal Gaussian posterior; exact-quantile `p_LCB` | Day-1 σ is not actually large; rank-deficient uncertainty | §3, §6.4, §6.5, §8.2, §9, §10, §15 | **Yes** |
| P2 | Censor "ignored" when the card was never exposed | Teaches the model that sleeping = not receptive | §7.4, §8 | **Yes** |
| P3 | Log propensities in `decision_log` | Selection bias; no way to evaluate other policies later | §9, §11 | **Yes** |
| P4 | Anti-starvation monitoring | Caution → no data → caution loop | §7, §11, §12 | **Yes** |
| P5 | Tag spontaneous sessions as secondary evidence | Positive-only data inflates calibration | §8 | **Yes** |
| P6 | Derive `θ_active` from the cost table | Hand-tuned constant plus ad hoc nudge | §7.2 | **Yes** |
| P7 | Baseline policy and randomized baseline days | No way to know if the model beats a trivial rule | §11, §16 | **Yes** |
| P8 | Explicitly deferred items | Premature optimization | §13, §14 | Deferred |
| P9 | Exact text edits to the reference doc | Doc/code drift | all | **Yes** |

Expected data regime (state it in the reference doc, §12): about 1–3 doses
per day gives roughly **30–90 labeled outcomes per month** against about
30 features. For the first months the priors and the discipline layer *are*
the algorithm; the model only nudges them. Compute is not a constraint at
$d\approx 30$ (microseconds), so no patch here is motivated by CPU savings.

---

## P1 — Diagonal Gaussian posterior replaces the bootstrap ensemble

### Problem

Reference §6.4 claims that at cold start σ is large, so `p_LCB` is low and
the system is cautious "by construction". With the 5-member bootstrap this is
**not guaranteed**: all members start from the same prior means, so they
agree with each other, σ ≈ 0, and `p_LCB ≈ p̂`. The system would be
*confident* on day 1 while knowing nothing about the user. Five particles
also span at most 4 directions of a ~30-dimensional space, so even later the
spread is not a faithful uncertainty estimate.

### Specification

State per feature $j$: mean $w_j$ and precision $\Lambda_j$ (diagonal
covariance).

**Initialization**

$$
w_j = \mu_j^{\text{prior}},\qquad \Lambda_j = \tau^{-2}
$$

**Prediction** for a normalized feature vector $x$:

$$
m = \sum_j w_j x_j,\qquad v = \sum_j \frac{x_j^2}{\Lambda_j},\qquad z = w^\top x \sim \mathcal N(m, v)
$$

Mean probability (for logging and diagnostics):

$$
\hat p = \sigma\!\left(\frac{m}{\sqrt{1+\pi v/8}}\right)
$$

**Conservative score (changed from Part II).** Because $\sigma(\cdot)$ is
monotone, quantiles of $z$ map exactly to quantiles of the probability. Use
the exact 20th percentile instead of "mean − 0.84·sd" with a delta-method
variance:

$$
p_{\text{LCB}} = \sigma\!\big(m - 0.84\sqrt{v}\big)
$$

This needs no delta-method approximation (which becomes unreliable exactly
when $v$ is large, i.e. at cold start), always stays in $[0,1]$, and keeps
the same semantic as the reference ("20th-percentile lower bound"). Part II's
formula $\hat p - 0.84\sqrt{\mathrm{Var}(\sigma(z))}$ remains acceptable as a
fallback but is not preferred.

**Update** on outcome $(x, y, s)$, after decay (below), with $p=\sigma(m)$:

$$
\Lambda_j \leftarrow \Lambda_j + s\,p(1-p)\,x_j^2,\qquad
w_j \leftarrow w_j + \frac{s\,x_j\,(y-p)}{\Lambda_j}
$$

Fractional labels $y\in[0,1]$ are fine: this is the gradient of the
cross-entropy with soft targets (quasi-likelihood).

**Time decay (changed from Part II).** Decay precision *toward the prior
precision*, not toward zero, so a long-inactive user returns to the prior
instead of to infinite uncertainty:

$$
\Lambda_j \leftarrow \tau^{-2} + \gamma^{\Delta d}\,\big(\Lambda_j - \tau^{-2}\big),\qquad \gamma\approx 0.98
$$

**Thompson sampling (≈5% of decisions).** Draw
$\tilde w_j \sim \mathcal N(w_j, 1/\Lambda_j)$ independently and decide on
$\tilde z=\tilde w^\top x$. Note $\tilde z\sim\mathcal N(m,v)$ exactly, which
makes the propensities in P3 analytic.

### Known limitation (document it)

The diagonal posterior ignores correlations between features
(e.g. `unlock_duration_seconds` and `screen_on_minutes_60`;
`hours_awake` and the circadian terms). In correlated directions $v$ is
**under-estimated**, so `p_LCB` is somewhat over-confident. V1 mitigation:
multiply $v$ by a tunable inflation factor $c\ge 1$ (start at 1, revisit with
data). A full or block-diagonal covariance is deferred (P8): at $d\approx30$
the full version costs $O(d^2)=900$ per update versus $O(d)$, i.e. *more*
than the 5-member bootstrap it replaces.

### Initialization acceptance test (mandatory)

Choose $\tau^2$ and the prior means by simulation so that, **at
initialization, for a representative set of "good moment" feature vectors**:

- `p_LCB` stays below $\theta_{\text{active}}$ (no active dose on day 1), and
- `p_LCB` can reach $\theta_{\text{passive}}$ for a good moment (the passive
  card works from day 1, as the reference §12 promises).

If $\tau$ is too large, even passive cards are blocked on day 1 (v is huge).
If it is too small, the system is overconfident again. This test replaces the
sentence "σ is large at cold start" with something *verified*.

### Replaces

Reference §6.4 (ensemble), §6.5 (decay/Thompson), §8.2 (update loop),
§9 `model_ensemble` → `model_posterior` (per feature: `w`, `Λ`,
`prior_mean`, `evidence_count`), §10 `Ensemble.*` contracts, and the glossary
entries for `σ` and `p̂`.

---

## P2 — Censoring for "ignored"

### Problem

Reference §7.4 labels any dose that receives no signal within 5 hours as
`ignored` (y = 0.25, s = 1). If the phone was in a pocket, off, or the user
was asleep, the card was never *seen*. The model then learns "this hour is
not receptive" from a user who was simply not there.

### Specification

Track **exposure**: the number of screen-on intervals during which the dose
was live and visible (not suppressed by DND). At expiry:

| Situation | Outcome | Label | Weight | Update? |
|---|---|---|---|---|
| ≥ 1 exposure, no `contentIntent`, no `deleteIntent` | `ignored` | 0.25 | 1.0 | Yes |
| 0 exposures | `expired_unseen` | — | — | **No** (log only) |

- `expired_unseen` is written to `outcome_log` with `label = NULL` and must
  leave the posterior, `feature_stats`, and budget state **unchanged**.
- Add `exposure_count` to `dose_log`.
- Active (heads-up) doses are shown while the screen is on, so they are
  exposed by construction; the rule matters mainly for passive cards.
- V2 option: scale the weight of `ignored` with the number of exposures
  (more chances to react → stronger evidence of disinterest). Not in V1.

---

## P3 — Propensity logging (selection bias)

### Problem

The model only observes outcomes where it acted. It therefore learns
$P(\text{continuation}\mid x,\ \text{acted})$, not $P(\text{continuation}\mid x)$.
`hold` ticks carry no label. Without the probability of each action, no later
off-policy evaluation of a different policy is possible, and it **cannot be
reconstructed retroactively**.

### Specification

Every tick's `decision_log` row gains:

| Field | Meaning |
|---|---|
| `action` | `hold` / `passive` / `active` |
| `propensity` | $\pi(\text{action}\mid x)$ under the policy as run |
| `is_exploration` | action came from the Thompson branch |
| `greedy_action` | what the deterministic rule would have chosen |
| `m`, `v` | posterior snapshot for this $x$ (allows recomputing counterfactual `p`) |
| `policy_version` | model/threshold version, for replay |
| `gate` | blocking hard gate, if any (these ticks are *not* part of the learnable policy) |

**Computing the propensity** (conditional on no hard gate and an available
budget). Let $q_a=\Phi\!\big((m-\operatorname{logit}\theta_{\text{active}})/\sqrt v\big)$
and $q_p=\Phi\!\big((m-\operatorname{logit}\theta_{\text{passive}})/\sqrt v\big)$
(requires $\theta_{\text{active}}>\theta_{\text{passive}}$). The Thompson
branch picks each action with probability:

| | active feasible (runway OK) | active infeasible |
|---|---|---|
| active | $q_a$ | 0 |
| passive | $q_p-q_a$ | $q_p$ |
| hold | $1-q_p$ | $1-q_p$ |

With $\varepsilon=0.05$:

$$
\pi(a\mid x) = (1-\varepsilon)\,\mathbb 1[a=\text{greedy}(x)] + \varepsilon\,P_{\text{TS}}(a)
$$

Exploration stays **inside** the discipline layer (gates, budget, double
key). Do not add uniform exploration for the active channel; Thompson
sampling already concentrates exploration near the decision boundary.

Hard-gated and budget-exhausted ticks are logged with `gate`/`budget` set and
excluded from propensity-based analysis.

---

## P4 — Anti-starvation: caution must not stop the learning

### Problem

Several conservative mechanisms stack: LCB (biased low on purpose), the 2×
dismissal weight, the double key, the daily budget, cooldown, and survival
mode. If all of them push toward `hold`, few labels arrive, σ stays large,
`p_LCB` stays low, and so on.

### Specification

1. **Metric.** Weekly, in the weekly summary and the diagnostic screen:

$$
\text{active\_rate} = \frac{\#\text{active doses}}{\#\text{eligible ticks}}
$$

where an *eligible tick* has no hard gate, budget available, and
`runway ≥ doseLength + 2`. Also report `passive_rate` the same way.
2. **Flag.** If `active_rate` stays below a floor for 14 consecutive days
   (suggested starting floor: 1% of eligible ticks; tune with data), mark it
   in the weekly log as *possible self-lock*.
3. **Diagnosis order** (never relax a hard gate):
   1. read `decision_log`: how far is `p_LCB` below $\theta_{\text{active}}$
      for the best ticks?
   2. is $\tau$ too large or the prior too pessimistic (P1 acceptance test)?
   3. is the variance inflation $c$ too high?
   4. optional, **default off**: use a smaller $z$ for the passive channel
      only (passive costs almost nothing), keeping 0.84 for active.
4. **Passive is the learning channel.** `θ_passive` stays low on purpose; it
   is where most early labels come from. Do not tighten it without checking
   `passive_rate`.
5. **Document the stacked conservatism.** The derived threshold in P6 assumes
   a calibrated $p$, but decisions use `p_LCB`, which is deliberately lower.
   The effective operating point is stricter than $\theta^\*$. This is an
   intentional choice; record it and monitor it through the metrics above.

---

## P5 — Spontaneous sessions are secondary evidence

### Problem

A spontaneous session (user opens REPAGE on their own) is a positive-only
observation with no matching negatives. It tells you the user *likes to open
the app* at that hour, not that a *notification* would land well there.

### Specification

- Keep the label (y = +0.5, s = 0.5) but set `source = spontaneous` on the
  outcome row.
- **Exclude** spontaneous sessions from: hit-rate, the budget's trailing
  window, survival-mode statistics, and any calibration check.
- Once enough dose-based labels exist, run an ablation (model with versus
  without spontaneous updates) and keep them only if they do not hurt
  calibration or continuation per dose.

---

## P6 — Derived `θ_active`

Adopt Part II §8.2. For a calibrated $p$ the risk-minimizing rule acts iff
$(1-p)\,c_{FP} < p\,c_{FN}$:

$$
\theta_{\text{active}} = \frac{c_{FP}}{c_{FP}+c_{FN}}
$$

Identify $c_{FP}$ with the dismissal weight and $c_{FN}$ with the
continuation weight from the label table (a modeling choice: it equates
"learning emphasis" with "decision cost").

- `θ_active` is computed from the cost table in code (initial value
  $2/(2+1)\approx 0.667$, close to the previous 0.65), so changing the table
  changes the threshold automatically.
- **Remove** the "−0.02 after 10 consecutive successes" nudge in V1: it is a
  hidden drift that makes behavior harder to reason about and to replay.
- Survival mode keeps its discrete flip (θ_active = 0.75, 1 dose/day).
- `θ_passive = 0.35` stays a constant: the reference doc does not split cost
  by channel, so it cannot be derived yet. To fix this, add `channel` to
  `outcome_log` (already implied by `dose_log`) and estimate per-channel
  costs from data later.

---

## P7 — Baseline policy and randomized baseline days

The only convincing evidence that the model is worth its complexity is a
comparison with a trivial rule.

**Baseline B0** (passive only):

```text
if screen unlocked
   and ≥ 45 min since last unlock
   and no hard gate
   and no live card
→ post one passive card
```

**Protocol**

1. Run B0 in **shadow mode** every tick: log `baseline_would_act` (no effect
   on behavior).
2. Randomly assign a small fraction of days (suggested starting point: 10–20%)
   to **B0-live**: B0 decides instead of the model. Log `arm = baseline`
   versus `arm = model` per day.
3. B0-live decisions are independent of the model's `p`, so their labels are
   also valuable for the model: they reduce selection bias. Feed them to the
   update normally.
4. Compare, per arm: continuations per dose, dismissal rate, and opened rate.
   Aggregate across users using the already-allowed derived metrics (never raw
   usage data).

**Success criterion**: the model must beat B0 on continuations per dose
**without** a higher dismissal rate. If it does not, the added complexity is
not paying for itself yet, and that finding is itself valuable.

---

## P8 — Explicitly deferred (add to reference §13)

| Item (Part II ref.) | Reason deferred | Revisit when |
|---|---|---|
| Full-covariance Laplace / Sherman–Morrison (§8.1) | $O(d^2)$ exceeds the bootstrap it replaces at $d\approx30$; correlations not estimable with this little data | $d$ shrinks substantially, or evidence shows diagonal under-coverage |
| Lagrangian budget / dual ascent (§8.3) | Needs a stable dismissal-rate estimate; the discrete survival-mode flip is adequate and auditable | Enough dismissals per user/cohort to estimate the rate; start at cohort level |
| Hazard / mean-residual-life runway (§8.4) | `gap_stats` is only ~70 numbers; an exponential (memoryless) runway **ignores how long the current gap has already lasted**, which today's estimator uses | Storage or sparse-hour extrapolation becomes a real problem; if adopted, prefer a Weibull and check tail shape against real gaps |
| AIC/BIC harmonic count, ARD prior (§8.5) | Per-user history too short for stable model selection; the "≈95% of the weekly pattern" claim is unverified | Cohort-level fit once there is enough history; verify the 95% figure first |
| Unified Kalman-style filter with full $\Sigma$ (§8.6) | The diagonal version in P1 already unifies decay and update | Same as full covariance |

---

## P9 — Exact edits to the reference document

1. **§3 diagram, Layer 3**: replace "bootstrap ensemble (5) → σ → conservative
   score `p_LCB = p̂ − 0.84σ`" with "diagonal Gaussian posterior →
   `p_LCB = σ(m − 0.84√v)`".
2. **§6.4**: replace the ensemble paragraph with P1. Keep the sentence about
   cautious-by-construction **only together with** the initialization
   acceptance test.
3. **§6.5**: decay toward the prior precision; Thompson draws from
   $\mathcal N(w, \operatorname{diag}(1/\Lambda))$.
4. **§7.2**: `θ_active` computed from the cost table (P6); remove the −0.02
   nudge.
5. **§7.4 and §8 label table**: add `expired_unseen` (no update); `ignored`
   requires ≥ 1 exposure (P2). Add `source` to the spontaneous-session row
   (P5).
6. **§8.2 pseudocode** replace with:

```text
onDoseOutcome(doseId, outcome):
    if outcome == EXPIRED_UNSEEN:
        outcome_log.append(doseId, outcome, label = null)
        return                                   # no state change at all
    y, s = label(outcome)
    posterior.decayTowardPrior(daysSinceLastUpdate)     # Λ_j ← 1/τ² + γ^Δ(Λ_j − 1/τ²)
    p = sigmoid(w · x_dose)
    for j: Λ_j += s · p(1−p) · x_j²
           w_j += s · x_j · (y − p) / Λ_j
    feature_stats.update(x_dose)                 # Welford, feeds normalization
    if outcome.source != SPONTANEOUS: budget.record(outcome)
    decision_log.append(...)                     # incl. propensity, m, v (P3)
```

7. **§9**: `model_ensemble` → `model_posterior`; extend `decision_log` with the
   P3 fields; add `exposure_count` to `dose_log`; add `arm` and
   `baseline_would_act` (P7).
8. **§10 contracts**:

```kotlin
data class Prediction(val m: Double, val v: Double, val pHat: Double, val pLcb: Double)

fun Posterior.predict(x: FeatureVector): Prediction
fun Posterior.update(x: FeatureVector, y: Double, sampleWeight: Double)
fun Posterior.decayTowardPrior(days: Double)
fun Posterior.thompsonSample(rng: Random): DoubleArray

/** Probability of each feasible action under the policy as actually run (P3). */
fun actionPropensity(
    pred: Prediction,
    runwayOk: Boolean,
    thetaActive: Double,
    thetaPassive: Double,
    epsilon: Double = 0.05,
): Map<Action, Double>
```

9. **§11**: add `active_rate`, `passive_rate`, per-feature evidence count and
   posterior std (`1/√Λ_j` versus prior std), arm comparison (P7).
10. **§12**: add the expected data regime (30–90 labels/month, priors
    dominate) and a link to the initialization acceptance test.
11. **§13**: add the P8 table rows.
12. **§15 glossary**: `σ` now means $\sqrt v$ (standard deviation of the
    logit, not an ensemble spread); add `Λ`, `m`, `v`, `propensity`,
    `exposure`, `expired_unseen`.

---

## Revised V1 decision function (replaces Part II §9)

$$
a_t=
\begin{cases}
\text{hold} & G(x_t)=1\ \text{or budget exhausted}\\[4pt]
\text{active} & p_{\text{LCB}}\ge\theta_{\text{active}}\ \text{and}\ \text{runway}\ge L+2\\[4pt]
\text{passive} & p_{\text{LCB}}\ge\theta_{\text{passive}}\\[4pt]
\text{hold} & \text{otherwise}
\end{cases}
\qquad p_{\text{LCB}}=\sigma\!\big(m-0.84\sqrt{v}\big)
$$

with probability 0.05 the Thompson branch replaces $p_{\text{LCB}}$ by
$\sigma(\tilde w^\top x)$ in the same rule. Hard gates, budget, and the double
key are unchanged and are never bypassed by exploration.

---

## Test plan

1. **Init test (P1)**: at initialization, `p_LCB < θ_active` for all
   representative vectors, and a "good moment" reaches `θ_passive`.
2. **Posterior invariants**: $\Lambda_j\ge\tau^{-2}$ always; after a long gap
   with no updates the posterior returns to the prior.
3. **Censoring (P2)**: processing `expired_unseen` leaves the entire model,
   `feature_stats`, and budget state byte-identical.
4. **Propensities (P3)**: for any tick, propensities over feasible actions sum
   to 1; every taken action has propensity > 0.
5. **Replay**: given a `decision_log` row (`m`, `v`, gates, budget, runway,
   `policy_version`), the greedy decision is reproduced exactly.
6. **Spontaneous exclusion (P5)**: spontaneous sessions do not change
   hit-rate, budget window, or survival-mode state.
7. **Threshold derivation (P6)**: changing a cost-table weight changes
   `θ_active` accordingly.

---

## Open parameters (set with data, not guessed)

| Parameter | Start | Set by |
|---|---|---|
| $\tau^2$ and prior means | per P1 init test | simulation |
| Variance inflation $c$ | 1 | calibration once labels exist |
| Exposure definition (min screen-on seconds) | any screen-on while live | observation |
| Active-rate floor | 1% of eligible ticks | observed baseline rate |
| Baseline-day fraction | 10–20% | how fast comparison data is needed |
| $\varepsilon$ (Thompson share) | 5% | exploration vs dismissal cost |
