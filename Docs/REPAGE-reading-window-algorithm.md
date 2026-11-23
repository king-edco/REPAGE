# REPAGE — Reading-Window Algorithm: Complete Engineering Reference

> **Audience**: any engineer joining the project, present or future.
> **Status**: normative for V1. Where this document and
> `REPAGE-book-audio-pipeline-spec-EN.md` §20 disagree, this document wins and
> §20 is to be updated to match.
> **Scope**: everything that decides *when* REPAGE offers a reading dose,
> *what* it offers, *how it learns* from the outcome, and *what it refuses to
> do*. Slides, audio and FSRS are consumers of this system, not parts of it.

---

## 0. How to read this document

The algorithm is documented in six passes, each answering a different question:

| Section | Question it answers |
|---|---|
| 1–2 | Why does this exist, and what is it optimizing? |
| 3 | What are the moving parts? |
| 4–8 | What exactly happens, layer by layer, variable by variable? |
| 9–10 | Where does state live, and what does each function promise? |
| 11–12 | How do we observe it, and how does it behave on day 1? |
| 13–16 | What we deliberately don't do, what comes next, and the glossary. |

---

## 1. The four principles (everything below serves these)

1. **Estimate honestly, decide conservatively.**
   The estimator is never biased toward caution; all prudence lives in the
   decision layer (lower confidence bound, double key, budgets). The system
   knows where it stands before it acts.
2. **Fill measured gaps, never create interruptions.**
   The question is not "is the user receptive right now?" but "is there a gap
   large enough for a dose, now or in twenty minutes?" A dose delivered into a
   predicted gap is a service, not an interruption — and it is *sized* to the
   gap.
3. **The notification channel is the only artery — its survival is the
   ultimate metric.** Not hit-rate, not streaks: the fact that the user never
   turns REPAGE notifications off. A dismissal costs more than a success earns.
4. **Power ≠ frequency.** TikTok maximizes time spent and interruptions.
   REPAGE maximizes timing precision and habit formation. An app that takes
   over the screen without permission gets uninstalled within three days; ours
   is a good assistant — rarely wrong rather than constantly present.

**The one-sentence essence**: REPAGE is a reading-dose delivery system that
learns, for each user, the exact moment when a dose becomes a *continuation* —
and earns the right to be confident by being wrong as little as possible.

**The reward function** guiding all learning is **continuation**: the user
opens the dose and keeps going on their own — slide after slide, past the
first minute, with nothing holding them there. Not clicks, not opens.

---

## 2. Product framing (why the algorithm is shaped this way)

The slide is not an app feature — it is the product, delivered outside the
app, at a moment when attention is genuinely available. The app is the optional
deep dive. The reading window is therefore the **distribution brain**: without
it, generated slides have no moment to arrive in.

The two channels and their costs:

| Channel | Cost to the user | Threshold |
|---|---|---|
| Passive card (posted while the screen is off) | None — it waits for the wake-up | low (`θ_passive`) |
| Active dose (heads-up, overlays another app) | Attention, interruption | high (`θ_active`) |

Two channels, two thresholds, one budget protecting the expensive one.

---

## 3. Architecture at a glance

```
┌─ 1. INGESTION  (local only; BroadcastReceiver + WorkManager ticks)
│     UsageStatsManager · AudioManager · BatteryManager · PowerManager
│        ↓ raw observations, timestamped, context attached
├─ 2. BEHAVIORAL STATE ENGINE  (feature extraction, local)
│     velocity · T75 · 2-gram transitions · unlock metrics
│     circadian harmonics · hours awake · 3h screen time · fatigue proxy
│     → FeatureVector (normalized) + RunwayEstimate
│        ↓
├─ 3. ESTIMATOR  P(continuation | x)   (on-device)
│     Bayesian logistic regression under shrinkage priors
│     bootstrap ensemble (5) → σ → conservative score  p_LCB = p̂ − 0.84σ
│     time decay γ^t · ~5% Thompson sampling
│        ↓ a number, never a decision
├─ 4. DISCIPLINE  (the constitution — never learned, never negotiated)
│     hard gates · double key · budgets · survival mode · expiry
│        ↓ the decision: post a card, deliver an active dose, or hold
└─ 5. LABEL MAKER  (the learning loop)
      outcome → graded label + weight → online update
      credit allocation (timing vs content) · free evidence from
      spontaneous in-app sessions
```

**Hard architectural rule**: layer 3 produces *only* a probability and its
uncertainty. Every act of caution (thresholds, budgets, gates, expiries) lives
in layer 4. Never let a model learn a safety rule.

---

## 4. Layer 1 — Ingestion

### 4.1 What triggers a computation (never a polling loop)

Continuous background loops are killed by Android 12+ Doze and by aggressive
OEMs (One UI, MIUI). Tick frequency is therefore event-driven plus one bounded
periodic job:

| Trigger | Mechanism | Typical use |
|---|---|---|
| Screen on / unlocked | `BroadcastReceiver` (`ACTION_SCREEN_ON`, `ACTION_USER_PRESENT`) | Re-evaluate right after the wake-up — the passive card is already waiting |
| Power connected / disconnected | `BroadcastReceiver` (`ACTION_POWER_CONNECTED`, `ACTION_POWER_DISCONNECTED`) | Charging context, battery-gate recovery |
| Audio route change | `AudioDeviceCallback` (via `AudioManager`) | Headphones/car BT connected → audio dose relevance |
| Periodic evaluation | `WorkManager` periodic, 30–45 min, constraint-aware | The baseline heartbeat |
| Dose outcome | notification `contentIntent` / `deleteIntent`, in-app session end | Label maker (layer 5) |
| App foreground | App lifecycle | Free evidence (spontaneous session) |

`WorkManager`'s floor is 15 minutes; we use 30–45 because the model works in
~20-minute horizons and finer ticks only cost battery.

### 4.2 Sources and what each provides

| Source (all local) | Provides | Leaves device? |
|---|---|---|
| `UsageStatsManager` | screen on/off intervals, unlocks, per-app foreground sessions, transitions | never |
| `AudioManager` | wired/Bluetooth headset, A2DP (car audio), current route | never |
| `BatteryManager` / `PowerManager` | battery level, charging, power-save, Doze, interactive | never |
| `NotificationManager` | `getCurrentInterruptionFilter()` → DND / silent | never |
| Room (REPAGE-internal) | dose history, outcomes, sessions, model state | derived metrics only |

**Consent boundary**: `UsageStatsManager` needs the system "Usage access"
permission (`PACKAGE_USAGE_STATS` declared in the manifest, granted via
Settings — see `PermissionCenter`). Without it, every UsageStats-derived
feature is simply *absent*, and absence has a defined meaning (§5.4).

---

## 5. Layer 2 — Behavioral State Engine

Turns raw observations into a **FeatureVector** (fixed order, normalized) plus
a **RunwayEstimate**. It decides nothing.

### 5.1 Core features (V1)

| # | Feature | Definition / computation | Range before normalization | Missing → |
|---|---|---|---|---|
| 1 | `minutes_since_last_unlock` | now − last `ACTION_USER_PRESENT` | 0…1440+, log | 0 |
| 2 | `unlock_duration_seconds` | duration of the current screen-on session | 0…600, winsorized | 0 |
| 3 | `screen_on_minutes_60` | screen-on minutes in the last 60 min | 0…60 | 0 |
| 4 | `velocity_5min` | app foreground switches in the last 5 min (attention churn) | 0…40 | 0 |
| 5 | `session_t75_seconds` | 75th percentile of recent app-session durations | 0…3600, log | population default |
| 6 | `bigram_entertainment_exit` | 1 if the last transition was *out of* an entertainment app | 0/1 | 0 |
| 7 | `hours_since_last_dose` | time since last dose | 0…168, log | 24 (neutral) |
| 8 | `last_dose_outcome` | last outcome score mapped to −1…+1 (§8) | −1…+1 | 0 |
| 9 | `doses_sent_7d` | doses in 7 days | 0…21 | 0 |
| 10 | `streak_days` | consecutive active days (grace-based) | 0…365, log | 0 |
| 11 | `battery_level` | ordinal 0 (<20%) / 1 (20–50%) / 2 (50–80%) / 3 (>80%) | 0…3 | 3 |
| 12 | `headphones_connected` | wired or BT audio output active | 0/1 | 0 |
| 13 | `car_bt_connected` | A2DP route matching a car profile | 0/1 | 0 |
| 14 | `is_charging` | charging now | 0/1 | 0 |
| 15 | `hours_awake` | time since the day's detected wake-up (Process-S proxy) | 0…20 | circadian estimate |

**Deliberately absent (V1)**: "attention residue" and glance/wandering/
purposeful pickup classification. Inferring intent from raw `UsageStats`
before any labels exist injects noise; features 1–4 measure the same territory
with observable quantities, and the shrinkage prior learns their weight.

### 5.2 Temporal features (2-harmonic cyclic model, not a 168-cell grid)

A 24×7 heatmap is sparse for weeks and delays cold start. The cyclic model
captures ~95% of the weekly pattern with five parameters:

| # | Feature | Computation |
|---|---|---|
| 16 | `sin_1`, `cos_1` | `sin(2π·h/24)`, `cos(2π·h/24)` — daily rhythm |
| 17 | `sin_2`, `cos_2` | second harmonic — morning/evening shoulders |
| 18 | `is_weekend` | binary |

Harmonics start at population-shaped values (commute, lunch, evening
wind-down), weighted by the onboarding `initial_reading_time_preference`, then
bend toward the individual.

### 5.3 Fatigue proxy — three named accumulators

| # | Accumulator | Meaning | Computation |
|---|---|---|---|
| 19 | `stim_load_3h` | recent stimulation | screen-on minutes in 3h, weighted by `velocity_5min` |
| 20 | `wake_debt` | hours awake beyond a personal norm | `max(0, hours_awake − norm_hours_awake)` |
| 21 | `circadian_prior` | the time-of-day prior itself | population coefficients over `sin_1`/`cos_1` |

`fatigue_proxy = w₁·stim_load_3h + w₂·wake_debt + w₃·circadian_prior` —
always called a **proxy**, never a mental-state measurement, never shown to
the user.

### 5.4 Consent-gated and content features

| # | Feature | Requires / note |
|---|---|---|
| 22–25 | `prev_app_category` one-hot (entertainment / social / productive / none) | Usage access |
| 26 | `prev_app_session_minutes` (log) | Usage access |
| 27–29 | `dose_book_category` one-hot (fiction / essay / technical) | "Novel in the evening, essay in the morning" as an evidence-gated feature, never a hand-built rule |

Absence is never imputed with invented values: normalized 0 = "contributes
nothing", which is exactly the shrinkage prior's default. Without Usage
access the system degrades gracefully into a time+device+engagement model.

### 5.5 The Runway (bridge to the discipline layer)

```
runwayEstimate(now) → minutes of likely uninterrupted time
  = expected remaining time in the current gap
  + probability-weighted length of the next gap within 30 min
```

Built from the same gap statistics the features use (session T75, current
screen state, historical gap lengths at this hour). Layer 4 uses it to size a
dose (`window × vAtHour = slides`) and to satisfy the double key.

---

## 6. Layer 3 — The Estimator

### 6.1 Model

```
P(continuation | x) = σ(w · x)        σ = logistic function
```

One **Bayesian logistic regression**, trained **on-device**, updated online
after every outcome. ~30 numeric inputs after expansion (one-hots count as
several), microseconds of computation, no deep learning, no server round-trip.

### 6.2 Feature normalization (mandatory, not optional)

Shrinkage priors assume comparable scales: an un-normalized
`minutes_since_last_unlock = 450` would be penalized against
`velocity_5min = 0.2` purely by magnitude. Therefore:

```
x' = (x − μ_f) / σ_f        z-score, per feature
```

- `μ_f`, `σ_f` are maintained **per user, locally**, as running statistics
  (Welford), seeded with population defaults.
- Log-scaled features are logged first, then z-scored.
- Binary features are used as-is (0/1).
- **Missing ⇒ 0 after normalization**, i.e. neutral — never a fabricated value.

### 6.3 Priors and shrinkage (how the model stays humble)

Each coefficient starts at a Gaussian prior centred (almost) at zero,
`w_j ~ N(μ_j^prior, τ²)`:

- **No evidence → coefficient ≈ 0** → the feature exists but has no influence.
  This is automatic humility, not a manual "activate after N observations" rule.
- **Evidence → the coefficient moves.** Features wake up one by one, at the
  pace of their own evidence.
- **Every earlier heuristic survives as a prior mean**, not a hard rule:
  the "screen back on after ≥45 min" bonus becomes `μ^prior ≈ +0.5` (logit
  space) on `minutes_since_last_unlock`'s transformed feature; population
  reading rhythms seed the harmonic means; onboarding
  `initial_reading_time_preference` weights those same means.

Prior means (initial values, all revisable):

| Feature | Prior mean (logit) | Rationale |
|---|---|---|
| `minutes_since_last_unlock` (log) | +0.5 | A fresh unlock is the best-studied moment |
| `velocity_5min` | −0.3 | High churn = not settled |
| `bigram_entertainment_exit` | +0.4 | End of an episode/scroll = natural transition |
| `headphones_connected` | +0.2 | Audio dose more relevant |
| `car_bt_connected` | 0.0 (gate handles safety) | Safety is not learned (§7.1) |
| `battery_level` (low) | −0.4 | Low battery = avoid |
| `sin_1`/`cos_1` | population curve | Rhythm seeded by onboarding preference |
| `last_dose_outcome` | +0.3 | Momentum is real |
| `hours_since_last_dose` (log) | +0.1 | Spacing matters mildly |
| `days_since_install` | +0.2 → decays | Novelty effect |

### 6.4 Uncertainty and the conservative score

A **bootstrap ensemble of 5 models** trained on subsamples; σ = standard
deviation across their predictions.

```
p_LCB = p̂ − 0.84 × σ        (0.84 ≈ 20th percentile of the normal)
```

At cold start σ is large ⇒ `p_LCB` is low ⇒ the system is cautious **by
construction**. Caution is not a setting; it is an emergent property of
uncertainty, and it relaxes automatically as σ tightens.

### 6.5 Adaptation

- **Time decay** `γ^t` (γ ≈ 0.98 per day): recent outcomes weigh more.
- **Thompson sampling ≈ 5%** of decisions: sample `w` from the posterior and
  decide on the sample → causal coverage of the feature space over months,
  impossible with a tuned threshold alone.

### 6.6 What the estimator may never do

Produce a decision. Touch a safety gate. See the notification budget. Its
entire output is `(p̂, σ)`.

---

## 7. Layer 4 — Discipline (the constitution)

**Nothing in this section is learned, tuned by the model, or negotiable.**

### 7.1 Hard gates (score forced to 0, no exceptions)

| Gate | Detection | Reason |
|---|---|---|
| DND / silent | `NotificationManager.getCurrentInterruptionFilter() != INTERRUPTION_FILTER_ALL` | Respect explicit intent |
| Battery low / power save | `< 20%` or `isPowerSaveMode` (**active channel only**; passive card unaffected) | Never drain a dying phone |
| **Driving / car audio** | `AudioManager.isBluetoothA2dpConnected()` to a car profile, or location speed > 25 km/h *if permission already exists* | A visual dose while driving is a hazard; route to hands-free audio or hold |
| Overnight charging | charging + sleep window | Nobody reads at 3 a.m. during recharge |
| Cooldown | after any dismissal | See 7.4 |

### 7.2 Thresholds and the double key

| Parameter | Initial value | Role |
|---|---|---|
| `θ_active` | 0.65 | Active (heads-up) threshold; −0.02 after 10 consecutive successes |
| `θ_passive` | 0.35 | Passive card threshold — near-zero cost, so low |

**Double key**: an active dose requires **both** `p_LCB ≥ θ_active` **and** an
independent structural signal — `runwayEstimate(now) ≥ doseLength + 2 min`.
A high probability with no room to read is not an opportunity; it is noise.

### 7.3 Budgets

| Rule | Value |
|---|---|
| Active doses/day | 1, earns +1 (max 3) when hit-rate over the last 10 ≥ 0.70 |
| After any active dismissal | active channel closed for the rest of the day |
| Passive card | max 1 live at a time; `setTimeoutAfter` 5 h |
| Survival mode | auto-engages if the 7-day dismissal rate > 20%: 1 dose/day, only the single highest-scoring moment of the day, `θ_active` raised to 0.75 |

### 7.4 The 5-hour expiry rule

If a posted dose receives neither `contentIntent` (opened) nor `deleteIntent`
(dismissed) within **5 hours**: auto-cancel it and record the outcome
`ignored` (label 0.25, weight 1.0). No dose is left on the lock screen
indefinitely, and no unlabeled dose is lost from training.

### 7.5 Why the channel's survival is the metric

A dismissal costs more than a success earns (it closes the day), because a
dead channel can no longer deliver any victories. Hit-rate is a diagnostic,
not the objective.

---

## 8. Layer 5 — The Label Maker (the learning loop)

Every delivered dose becomes a training example. Labels are **graded**, not
binary, because "opened and read deeply" and "swiped away" are vastly
different evidence about receptiveness.

| Outcome | Detection | Label `y` | Weight | Note |
|---|---|---|---|---|
| Dismissed | `deleteIntent` fired | 0.0 | **×2** | Most informative observation of non-receptiveness |
| Ignored | 5-hour expiry, no signal (§7.4) | 0.25 | ×1 | Absence of a reaction is weak evidence, not a failure |
| Opened late | `contentIntent` > 2 h after posting | 0.5 | ×1 | A passive dose succeeding on a long horizon — the behaviour we want, so never punished |
| Opened | `contentIntent` fired | 0.6 | ×1 | Attention granted |
| **Continuation** | opened **and** > 60 s of real reading (slides advanced, or session > 60 s) | **1.0** | ×1 | The reward function (§1) |
| Spontaneous session | user opens REPAGE on their own | +0.5 | ×0.5 | **Free evidence**: informs the priors without counting as accepting an interruption |

### 8.1 Credit allocation (timing vs content)

A continuation can mean "the timing was right" *or* "the content was
irresistible". The model must not let either take all the credit:

- Each dose records the section's `difficulty`, `importance` and the book's
  `dose_book_category` alongside the outcome.
- Those covariates enter the feature vector (content features, §5.4), so a
  high-difficulty section that still produced a continuation teaches the model
  something about the reader, and a low-difficulty section that produced a
  dismissal does not unfairly punish the hour.

### 8.2 Online update

```
onDoseOutcome(doseId, outcome):
    y, s = label(outcome)                 # label, sample weight (§8)
    decayAllWeights(γ = 0.98 ^ daysSinceLastUpdate)
    for m in ensemble: m.update(x_dose, y, sampleWeight = s)
    feature_stats.update(x_dose)          # Welford, feeds normalization
    budget.record(outcome)
    decision_log.append(x_dose, p̂, σ, gates, outcome, topFeatures)
```

Updates are local, immediate, and cheap (a handful of gradient steps per
model). No server round trip is required to learn; derived metrics sync later
for multi-device continuity (pipeline spec §21.1).

---

## 9. State and persistence (all local, Room)

| Store | Contents | Why separate |
|---|---|---|
| `feature_stats` | per-feature `μ`, `σ`, sample count | Normalization must survive restarts |
| `model_ensemble` | 5 × (weights, prior means, τ) | The estimator's state |
| `dose_log` | dose id, posted-at, channel, section, features, predicted p̂/σ, gates | Post-hoc verification and credit allocation |
| `outcome_log` | dose id, outcome type, timestamp, label, weight | Training history (immutable) |
| `decision_log` | every tick's decision (posted / held / gated) + why + top features | The diagnostic dashboard (§11) — the interpretability the ensemble costs us |
| `budget_state` | active doses today, hit-rate window, dismissal flag, survival-mode flag | Discipline state |
| `session_log` | in-app sessions (start, end, sections, backtracks) | Free evidence + Experience Model |
| `gap_stats` | gap-length distributions by hour (for the runway) | Structural signal for the double key |

Everything above is **local**. Only derived metrics (not raw usage) may sync.

---

## 10. Function reference (contracts)

```kotlin
// --- Orchestration -------------------------------------------------------

/** The single entry point. Called by BroadcastReceivers and WorkManager. */
fun tick(now: Instant, trigger: Trigger)

/**
 * Steps of tick():
 *  1. gates = hardGates(now)          → if any hard gate → log & return
 *  2. x     = featuresOf(now)         → normalize → FeatureVector
 *  3. (pHat, sigma) = ensemble.predict(x)
 *  4. pLCB  = pHat - 0.84 * sigma
 *  5. runway = runwayEstimate(now)
 *  6. decide(now, pLCB, runway, budget)
 */

// --- Layer 2 ------------------------------------------------------------

/** Pure: reads system + Room state, returns the normalized feature vector. */
fun featuresOf(now: Instant): FeatureVector

/** Expected uninterrupted minutes available now (or in the next ~30 min). */
fun runwayEstimate(now: Instant): Int

/** Slides that fit a window, using the user's speed at this hour. */
fun doseSize(windowMinutes: Int, vAtHour: Double): Int

// --- Layer 3 ------------------------------------------------------------

/** Pure inference. Returns probability and its uncertainty. Never decides. */
fun Ensemble.predict(x: FeatureVector): Pair<Double, Double>

/** Applies time decay, then one weighted update per ensemble member. */
fun Ensemble.update(x: FeatureVector, y: Double, sampleWeight: Double)

/** 5% of decisions: sample weights from the posterior, act on the sample. */
fun Ensemble.thompsonSample(): DoubleArray

// --- Layer 4 ------------------------------------------------------------

/** Returns the first blocking gate, or null. Never learned, never tuned. */
fun hardGates(now: Instant): Gate?

/** The constitution: thresholds, double key, budgets, survival mode. */
fun decide(now: Instant, pLCB: Double, runwayMinutes: Int, budget: Budget): Decision

/** Auto-cancels unlabeled doses older than 5 h and labels them `ignored`. */
fun expireDoses(now: Instant)

// --- Layer 5 ------------------------------------------------------------

/** Maps a raw outcome to (label, weight) per §8. Single source of truth. */
fun label(outcome: DoseOutcome): Pair<Double, Double>

/** Entry point for every real outcome signal (notification or in-app). */
fun onDoseOutcome(doseId: String, outcome: DoseOutcome)
```

---

## 11. Observability (non-negotiable, because the ensemble costs interpretability)

An ensemble cannot be read like counters, so the system logs its reasoning:

- **Every tick** writes a `decision_log` row: features used, `p̂`, `σ`,
  `p_LCB`, gate results, runway, budget state, the decision, and the
  **top three features that pushed it**.
- **Every dose** is correlated with its outcome and the section it carried.
- A **diagnostic screen** (debug builds) shows: current features and their
  normalized form, the weight vector with each feature's evidence count
  (which features have "woken up"), the last 20 decisions with outcomes,
  budget/survival state, and the hit-rate window.
- Weekly summary log: doses sent, opened, continuations, dismissals,
  hit-rate, mean σ (the confidence trend), and the gate that blocked most
  often.

Without this, a model that makes a mistake cannot be diagnosed — the
dashboard is part of the algorithm, not a nice-to-have.

---

## 12. Cold start — no scheduled blackout

There is **no fixed observation period**. The model runs from day one; the
only thing small early is its confidence.

| When | What actually happens | Why |
|---|---|---|
| Day 1 | The model predicts, but σ is large ⇒ `p_LCB` stays below `θ_active` in practice ⇒ **passive card only**. Reading outside the app works from day one. | Caution is emergent from uncertainty (§6.4), not scheduled |
| Days ~3–5 | With a handful of spontaneous sessions and the first outcomes, σ tightens and the **first active doses** can pass the double key | Harmonics + priors need far less data than a 168-cell grid |
| ~Month 1 | Behaviour is essentially "harmonic hours + recent outcomes + priors" | Already richer than a cell model |
| Months 2–4 | Device, previous-app, fatigue and content features wake individually, each at its own evidence pace | Shrinkage (§6.3) |
| Continuously | Time decay keeps recent behaviour dominant; ~5% Thompson sampling keeps exploring | Adaptation and causal coverage (§6.5) |

**If logs show zero active doses in the first two weeks, that is σ — not a
rule.** Do not add a wait: read `decision_log` and compare `p_LCB` against
`θ_active`; a large gap means the *features* need attention, not the calendar.

---

## 13. Deliberately not done in V1 (with the reasons)

| Not done | Reason | What it would cost |
|---|---|---|
| Attention residue & glance/wandering/purposeful pickup classification | Intent cannot be reliably inferred from raw `UsageStats` before labels exist; the heuristic would enter the model as if it were signal | A confidently wrong feature is worse than no feature |
| 24×7 gap heatmap (168 cells) | Sparse for weeks at cold start | Delays the first useful prediction |
| Continuous background polling | Android 12+ Doze and OEM killers terminate it; `WorkManager`'s floor is 15 min | Battery drain, unreliable ticks |
| Per-user deep learning | Not enough data per user; uninterpretable failure modes | Overfitted timing, unexplainable dismissals |
| Feature × feature interactions before volume | Sparse support early | Confident nonsense |
| Learning the safety gates | A safety rule is not something you hand to a model | One learned "exception" can burn the channel |
| Content-type as a hard scheduling rule ("fiction evenings") | Ruled out as a rule; kept as a shrinkage feature (§5.4) | Multiplies evidence requirements per rule |
| Wake-time prediction model | `minutes_since_last_unlock` covers the need at lower risk | Complexity without measured benefit |
| Per-device generated content | Cost explosion (many variants per book) | The `WindowSizeClass` approach (pipeline §19.5) suffices |

---

## 14. Planned upgrades (V2+, each behind evidence)

1. **Richer estimator** — linUCB-style or shallow non-linear models *once
   per-user volume supports it*; the architecture (features → estimator →
   discipline) does not change, which is what makes it safe to launch small.
2. **Full gap inventory** — replace `gap_stats` distributions with an
   hour×day inventory once observation counts are dense.
3. **Content × time interactions** — promote content features to explicit
   interactions once each combination has support.
4. **Events layer for audio** (pipeline §11.7) — reading-speed data collected
   in V1 makes this possible without a cold start.
5. **Cross-device profile continuity** — sync derived metrics only, never raw
   `UsageStats`.
6. **Multi-book dose rotation** — only if the event store shows users want it
   (pipeline §13.7).

---

## 15. Glossary (every symbol and term)

| Term | Meaning |
|---|---|
| `x` | normalized feature vector for one decision |
| `w_j` | coefficient (weight) of feature *j* |
| `τ²` | prior variance of the weights (how strongly we shrink toward zero) |
| `σ(·)` | the logistic function — distinct from `σ` alone, which is the ensemble's standard deviation (context disambiguates) |
| `p̂` | ensemble mean predicted probability of continuation |
| `σ` | standard deviation across the 5 ensemble members (uncertainty) |
| `p_LCB` | `p̂ − 0.84σ` — the conservative score decisions are made on |
| `θ_active` | 0.65 — active (heads-up) threshold |
| `θ_passive` | 0.35 — passive card threshold |
| `γ` | time-decay factor ≈ 0.98 per day |
| `y` | graded outcome label ∈ {0, 0.25, 0.5, 0.6, 1.0} |
| `s` | sample weight ∈ {0.5, 1.0, 2.0} |
| `T75` | 75th percentile of app-session durations ("settled" yardstick) |
| `velocity_5min` | app-switch count in the last 5 minutes |
| `runway` | expected uninterrupted minutes available |
| `dose` | one delivered unit (passive card or active heads-up) |
| `continuation` | the reward — opened **and** > 60 s of real reading |
| `survival mode` | protective regime after a 7-day dismissal rate > 20% |
| `double key` | active dose requires `p_LCB ≥ θ_active` **and** `runway ≥ doseLength + 2 min` |
| `free evidence` | spontaneous in-app sessions (weight 0.5) |
| `proxy` | any inferred state (fatigue, window) — never presented to the user as a measurement |

---

## 16. Implementation phases

| Phase | Contents | Rough size |
|---|---|---|
| **Depth** | Ingestion (receivers + WorkManager), feature extraction, normalization, 3-accumulator fatigue proxy, gap stats | ~2 weeks |
| **Prediction** | Estimator (weights, priors, ensemble, LCB), runway + double key, decision policy, budgets and gates | ~1 week |
| **Verification** | Label maker, 5-hour expiry, time decay, `decision_log` + diagnostic screen | ~1 week |
| **Refinement** | Threshold tuning with real volume, progressive feature awakening, V2 upgrades | ongoing |

### The privacy contract this algorithm obeys

> *Your usage of other apps never leaves your device. Your interactions with
> REPAGE are synced to power your experience.*

Layers 1, 2, 3, 4 and 5 all run on the phone. The server receives derived
metrics and REPAGE-internal events — never raw `UsageStats`, never another
app's identity, never anything from the "never collect" list (pipeline §21 W).

---

*This document is the algorithm's single source of truth. When behaviour and
documentation disagree, fix one of them in the same commit.*

