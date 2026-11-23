# REPAGE — Product Specification

> Reference document for the team and coding agents. Summarizes the vision, architecture, and decisions made so far. Meant to evolve.

---

## 1. Vision

REPAGE is **neither a book-summary app nor a raw reader app**. It's an app that **restructures** the content of a user-uploaded book into a daily, immersive, paced reading experience — built for people who don't naturally read much but spend a lot of time on their phone.

**What REPAGE is not:**
- Not a summary (loses depth, nuance, argumentation) — unlike Blinkist/Headway.
- Not raw text simply re-paginated — zero added value.
- Not an interactivity tool with quizzes/exercises (unlike Brilliant) — the goal is **immersion**, not active manipulation of the content.

**What REPAGE is:**
- A pipeline that restructures text while preserving its richness and depth, while making it more "consumable" in small daily units.
- An ambient experience inspired by music players (Now Playing / media session) rather than classic notifications.
- An active habit and retention system, not a static catalog to browse.

## 2. Competitive landscape (market state)

| App | What it does | Limitation vs. REPAGE |
|---|---|---|
| Headway | Personalized 30-day plan, spaced-repetition flashcards, streaks | Summaries, no real user-uploaded book |
| Blinkist | Library of 8000+ summaries | No strong automated habit/retention system |
| BeFreed | Hyper-personalized AI journey (podcast, flashcards, video) | Closed catalog, no user upload |
| Moodreads / Bibliobeats | Adaptive soundtrack based on book genre | Title-based matching, no real NLP analysis of the uploaded text |
| Chunks | Chapter recaps + reminders at calculated intervals | Human-written content on a fixed catalog, not on the user's own book |

**The identified gap:** no player combines personal book upload + two-layer restructuring + content-adaptive ambiance + FSRS retention + attention capture via media session. The differentiation is in the combination, not in any single isolated piece.

## 3. Content pipeline

### Input constraints
- Size limit: roughly 300 to 500 pages per book to avoid saturating the pipeline.
- Supported formats to be defined (native text, EPUB, PDF, scans requiring OCR/preprocessing).
- Handling of non-text elements within chapters (images, links) to be defined.

### Phase 1 — Segmentation
- Splitting the book into chapters, then into coherent sections (not by arbitrary length).
- Structural task, low cost: can run on an economical model.

### Phase 2 — Readaptation
Each segmented section becomes a **two-layer slide**:

1. **Readapted text** (primary layer) — not the author's raw text word-for-word, but a rewrite that keeps the same level of intellectual depth and rigor, reformulated to breathe in slide format rather than a dense paragraph. Based on rhetorical structure analysis (argumentative structure: thesis → evidence → example → conclusion) rather than arbitrary chunking.
2. **"In plain terms" version** (secondary layer, visible on the same slide, visually understated style) — a simplified reformulation with common analogies, which dilutes and eases understanding without replacing the primary layer.

**Key presentation rule:** both layers appear **on the same slide**, never on two separate slides — presenting the complex version alone first would discourage the user.

### Models / costs
- Avoid on-device models (too limited in quality) — go through an API.
- Phase 1 (segmentation): an economical model is sufficient (a few cents per book).
- Phase 2 (readaptation): mid-tier model to be tested empirically (quality vs. cost) on a real chapter before locking in the choice.
- Batch processing (asynchronous, not real-time) to benefit from providers' reduced rates.
- Rough estimate: a few cents to ~$1-2 per processed book depending on the chosen model.
- **To do:** test 2-3 models on a real chapter to judge readaptation quality before choosing.

## 4. UX & Design

- **Slide format:** presented as a "book in slices," sober visual continuity, no UI chrome that gives an "app-like" impression — the goal is to preserve the feeling of reading.
- **No emojis.** Sober, professional icons, Lucide/outline style (no colored or decorative pictograms).
- **Design system: Material Design 3** via Jetpack Compose (`MaterialTheme` as the central entry point for colors/typography/shapes).
- Validated mockup reference: readapted text given visual priority at the top, thin divider, "in plain terms" layer below with a discreet icon + text label (no emoji), swipe navigation with a minimal progress indicator.

## 5. Adaptive ambiance

- Section analysis (tone, setting, tension) to automatically trigger:
  - Adapted background music (user can also upload their own music).
  - System settings: adaptive brightness, possibly Dolby Atmos if available on the device.
- Goal: reinforce immersion without intrusive notifications — the sensory comfort should stay subtle (no overly present sound).

## 6. Retention — FSRS-6

- Each key idea extracted from a section becomes a card in an FSRS-6 spaced-repetition system (successor to SM-2/Anki).
- Models 3 variables per card: difficulty, stability, retrievability — targets ~90% recall probability at review time.
- Usage signals for calibration: time spent on a slide, swipe speed, going back to previous slides.
- Ideas resurface at the optimal moment, not on a fixed schedule.

## 7. Attention capture & engagement

### Contextual media session
- Uses `androidx.media3` (Android media session API) to display slides "Now Playing"-style on the lock screen.
- **Key difference from a real music app:** the session should not run permanently in the background, only during an active **reading window** — otherwise unnecessary battery cost and higher risk of store rejection.
- Technical solution chosen to keep the session active: playing a looping background sound (near-inaudible track, or a light functional sound like white noise/ambiance) — see section 9 (risks) for implications.

### Detecting favorable windows
- Uses the `UsageStatsManager` API (with explicit user consent) to spot moments when the user is active on their phone but not reading.
- Goal: offer the reading window at a genuinely favorable moment, not on a fixed universal schedule.

### 3-stage notification system
1. **Reminder** — soft signal.
2. **Call-to-action** — explicit prompt to open the app.
3. **Conversion** — last nudge before the user drops the day's cycle.

Initial calibration on simple fixed schedules, refined later with real per-user usage data.

## 8. Technical architecture

**Stack chosen:** Native Android, Kotlin, Jetpack Compose, Material Design 3.

**minSdk: API 28 (Android 9)** — covers the vast majority of active devices without extra compatibility overhead.

**3-layer architecture (official Android recommendation):**

```
UI Layer (Compose + ViewModel, state as StateFlow, unidirectional data flow)
        ↓
Domain Layer (use cases)
        ↓
Data Layer (repositories + data sources)
```

**Main repositories (Data layer):**
- `BookRepository` — upload, local storage (Room), API call for segmentation/readaptation.
- `SlideRepository` — generated slides and their reading status.
- `ReviewScheduleRepository` — FSRS-6 state per key idea.
- `UsageStatsDataSource` — wrapper around `UsageStatsManager`.
- `SubscriptionRepository` — subscription status via Play Billing.

**Main use cases (Domain layer):**
- `SegmentBookUseCase`
- `GenerateSlideUseCase`
- `ScheduleNextReviewUseCase`
- `FindBestReadingWindowUseCase`
- `TriggerAmbianceUseCase`

**Technical building blocks:**
- **Room** — local database.
- **WorkManager** — background book processing (long API calls).
- **Hilt** — dependency injection.
- **Retrofit/Ktor** — communication with the LLM API.

## 9. Risks / points of caution

- **Inaudible-sound technique to keep the media session alive:** technically works, but Google Play has rules against abusing background audio playback for non-media apps — risk of rejection/account suspension if flagged during review. Safer alternative: a low-volume functional sound (white noise, ambiance) that gives a legitimate product justification rather than a pure hack. Not a legal issue, but a structural business risk if the app grows.
- **Stacking risks:** avoid combining several store-rule workarounds at once (e.g., silent audio + ads slipped into the content flow) — increases the surface for rejection.
- **Variable API costs:** dependent on the number of books processed per user; monitor closely once in real usage to adjust subscription pricing.

## 10. Monetization

- **Approach at launch: simple freemium by quota**, no ads — e.g., 1-2 free books, unlimited on paid.
- No ads planned at launch: risk of harming the immersive experience, plus added technical complexity (especially if combined with the media session).
- Ads via slides to be reconsidered later if the quota-based freemium model isn't enough — not a launch priority.
- Adjust subscription pricing based on real API costs observed after the first months of usage.

## 11. Roadmap / next steps

- [ ] Test 2-3 LLM models on a real chapter to choose the Phase 2 model.
- [ ] Precisely define supported upload file formats (including scan/OCR handling).
- [ ] Build the first Compose screen (two-layer slide) to validate the technical setup.
- [ ] Set up the `data/ domain/ ui/` folder structure in the project.
- [ ] Prototype the contextual media session (reading window, not 24/7).
- [ ] Define the "best moment" scoring model (simple version with no data, to be refined with real usage).
- [ ] Implement FSRS-6 on key-idea cards.
- [ ] Validate the name **REPAGE** (Play Store availability, domain, social handles).

---

*App name: **REPAGE***
*Last updated: document generated from the initial design discussions.*
