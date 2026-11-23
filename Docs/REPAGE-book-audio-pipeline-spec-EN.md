# REPAGE — Book Pipeline & Audio Engine: Technical Specification

> Reference document produced from an in-depth design session. Covers the entire book-processing pipeline and the adaptive audio engine. Expected to evolve — not to be treated as final.

---

## 1. Pipeline Overview

```
UPLOAD
  ↓
VALIDATION (format, size, page count)
  ↓
DOCLING (structured parsing — unified extraction + OCR)
  ↓
CATEGORY ROUTING (narrative_nonfiction / fiction / technical_dense)
  ↓
CHAPTER DETECTION (two-signal cross-validation)
  ↓
CHAPTER CHUNKING → ProcessingBlock (semantic segmentation via embeddings)
  ↓
SEMANTIC ANALYSIS → Section (SlideData)
  ↓
VALIDATION (schema + decompose-then-verify)
  ↓
SLIDE GENERATION (progressive, based on subscription + reading progress)
  ↓
AUDIO ENGINE (consumes the tags/valence/arousal produced by the pipeline)
```

Object hierarchy: **Book → Chapter → ProcessingBlock → Section**

### 1.1 Fundamental Rule

> **Every pipeline stage must produce a verifiable result before handing off to the next stage.**

No transition should be silent — even the ones where the pipeline "hopes" it's fine. This rule formalizes what was already being applied case by case (chapter-detection confidence thresholds, JSON validation, deterministic checks): it becomes a general law, not a one-off exception tied to particular stages.

---

## 2. Supported Formats (V1)

- **PDF** (native text and scanned)
- **EPUB**

**Explicitly excluded in V1**: TXT, DOCX.

Limit: 300–500 pages per book.

---

## 3. Ingestion — Docling

**Chosen tool**: Docling (IBM Research / Linux Foundation), open source, **MIT license** (permissive, safe for commercial use), self-hosted, free, runs on CPU.

**Why Docling instead of custom code**:
- Handles native-text PDF, scanned PDF (automatic internal OCR fallback), and EPUB in **a single tool**.
- Replaces three components that would otherwise have to be coded separately (PDF extraction, OCR, EPUB parsing).
- Structured output: every page element is typed (`heading`, `body_text`, `marginalia`, `caption`, `table`...) with an individual confidence score.

**Alternative rejected**: Marker — comparable quality, but GPL-3.0 + RAIL-M license that restricts commercial use beyond a certain revenue threshold. A legal risk to avoid for a commercial product that needs to scale.

**V1 product decision**: only `body_text` and `heading` elements are kept as the main source. `marginalia` and `caption` elements (images, sidebars, marginal illustrations) are **ignored in V1** — not shown on slides. Decision consistent with the product's positioning (careful text restructuring, not magazine-style visual richness).

### 3.1 Docling Is Not an Absolute Truth

Docling can misread a document. Its output must be treated as a **candidate structure**, not a final result:

```
Docling → candidate structure → validation
```

**Concrete example of an anomaly to detect automatically**: Docling detects only one chapter, while the raw text clearly contains the patterns "Chapter 2", "Chapter 3", "Chapter 4" — an obvious mismatch between the proposed structure and the actual content. This kind of inconsistency must trigger a check before proceeding, to prevent an extraction error from cascading and contaminating the rest of the pipeline (chapters, blocks, sections).

### 3.2 User Experience During Processing

Don't show a generic indicator ("Processing..."). Show the pipeline's actual stages, wired to `processing_status`:

```
Import           ✓ Book received
Analysis         ✓ Structure detected
Preparation      ● Building chapters
Intelligence     ○ Preparing the first sections
Audio            ○ Preparing the ambiance
```

Turns a technical wait into a product moment — consistent with the care requirement already established for the rest of the experience.

---

## 4. Routing by Content Category

Two very different categories of books that need to be handled differently:

- **`narrative_nonfiction` / `fiction`** — the main target (self-development, essays, novels, history). Full pipeline, audio experience at full power.
- **`technical_dense`** — textbooks with equations, diagrams, mathematical notation (physics, medicine, engineering).

**V1 handling for `technical_dense`**: book accepted, text restructured normally, but audio ambiance **cleanly disabled** (little sense on a mathematical demonstration) with a clear message to the user rather than a silent failure.

**V2 planned**: rendering equations in Markdown/LaTeX in the slides — a separate project (image extraction, formula recognition, rendering), not stacked onto the MVP.

### 4.1 Category = Multi-Dimensional Profile, Not Just an Audio Switch

Rather than `technical_dense → audio OFF` as the only effect, the category should produce a **processing profile** that influences several engines at once:

```json
{
  "audio": "limited",
  "visual_complexity": "high",
  "explanation": "technical",
  "retention": "high"
}
```

This profile independently governs: the allowed level of audio ambiance, tolerance for visual complexity (diagrams/equations), the expected explanation style from the model, and the default intensity of the retention algorithm for this book.

---

## 5. `Book` Object

```json
{
  "book_id": "bk_8f3a2c",
  "user_id": "usr_1a2b3c",
  "title": "Atomic Habits",
  "author": null,
  "file_type": "epub",
  "language": "en",
  "language_confidence": 0.97,
  "upload_date": "2026-09-04T10:15:00Z",
  "page_count_estimated": 288,
  "processing_status": "structuring",
  "user_reading_goal": null,
  "subscription_tier_at_upload": "free",
  "content_category": "narrative_nonfiction",
  "category_confidence": 0.91,
  "has_heavy_visuals": false
}
```

| Field | Role |
|---|---|
| `title` | Required. Falls back to the file name if metadata is absent. |
| `author` | Optional, `null` accepted — display "Unknown author" rather than crashing. |
| `language` / `language_confidence` | If confidence is low, ask the user to confirm rather than silently guessing wrong. |
| `processing_status` | `uploading` → `validating` → `extracting` → `structuring` → `ready` → `error`. |
| `user_reading_goal` | Optional free text, injected into the restructuring prompt. |
| `subscription_tier_at_upload` | Locked in at upload so the processing budget stays consistent even if the subscription changes later. |
| `content_category` / `category_confidence` | Detected at extraction time (image density, mathematical notation, paragraph length). Routes to the appropriate processing. |

---

## 6. `Chapter` Object

```json
{
  "chapter_id": "ch_3f9a1d",
  "book_id": "bk_8f3a2c",
  "order": 3,
  "title": "The Habit Loop",
  "start_offset": 48210,
  "end_offset": 71450,
  "detection_method": "toc",
  "detection_confidence": 0.98,
  "cross_validation_agreement": true,
  "status": "pending",
  "summary": null,
  "key_concepts": []
}
```

**Boundary detection**: free technical signals first (table of contents, "Chapter X" patterns, typography, page breaks) — no LLM call by default.

**Identified and fixed problem**: a PDF's table of contents often gives an approximate page number (offset caused by front matter, uncounted images). The ToC is used as a **starting point**, then the actual title pattern is searched for in a window of a few pages around that position.

**Cross-validation (a safeguard against "confident but wrong")**: two independent detection methods run in parallel (e.g., Docling heading vs. "Chapter X" regex pattern). If they agree → real confidence. If they diverge → `cross_validation_agreement: false`, automatically triggering a model-based check, **regardless of the individual confidence score reported by each method**. Principle: never trust a single self-reported score — always cross-check against an independent signal.

`summary` / `key_concepts`: empty at first, filled in after semantic analysis — serve as a short-term memory injected into the processing of subsequent chapters (no need to re-inject all the preceding text).

---

## 7. `ProcessingBlock` Object

```json
{
  "block_id": "blk_a91cd2",
  "chapter_id": "ch_3f9a1d",
  "order": 1,
  "start_offset": 48210,
  "end_offset": 56900,
  "token_count_estimated": 6200,
  "chunking_method": "semantic_embedding",
  "semantic_coherence_score": 0.89,
  "status": "pending"
}
```

**Semantic chunking via embeddings** rather than naive token-count-based splitting:
1. Split into sentences.
2. Compute an embedding per sentence (small model, no call to the large LLM — minimal cost).
3. Compare embeddings sentence by sentence: a large embedding gap = a natural topic boundary.
4. Cut at that point rather than at an arbitrary token count.

**Safeguard**: forced minimum/maximum size to avoid micro-blocks if the text changes topic too often. Target: 4,000–8,000 tokens (adjustable depending on the model used).

**Escalation**: if `semantic_coherence_score` is low or the result is inconsistent with the headings detected by Docling → `chunking_method: "llm_verified"` (chunking handed to the large model, more expensive but more reliable). Same threshold principle as for `Chapter`.

**Priority rule (structure > semantics)**: a title/heading detected by Docling always forces a break, even if semantic embedding suggests the topic "continues." The document's explicit structure takes priority over pure semantic similarity — combining both signals makes chunking far more robust than a single isolated criterion.

---

## 8. `Section` Object (= SlideData — one slide shown to the user)

```json
{
  "section_id": "ch3_s2",
  "chapter_id": "ch_3f9a1d",
  "block_id": "blk_a91cd2",
  "order": 2,

  "adapted_text": "Every habit follows the same basic pattern: a cue triggers...",
  "clear_explanation": "In plain terms: your brain spots a cue, feels a craving, acts, then feels rewarded.",

  "theme": "behavioral neuroscience",
  "concepts": ["habit loop", "cue-craving-response-reward"],
  "entities": ["James Clear"],
  "importance": 0.88,

  "sentence_curve": [
    { "index": 0, "difficulty": 0.3, "valence": 0.6, "arousal": 0.1, "word_count": 12 },
    { "index": 1, "difficulty": 0.35, "valence": 0.55, "arousal": 0.15, "word_count": 18 },
    { "index": 2, "difficulty": 0.7, "valence": 0.5, "arousal": 0.3, "word_count": 22 },
    { "index": 3, "difficulty": 0.55, "valence": 0.5, "arousal": 0.4, "word_count": 15 }
  ],

  "audio_description": "Calm, focused interior, hushed studious ambiance",

  "continuity_summary": "Explains the habit-loop mechanism in 4 steps.",

  "status": "generated",
  "schema_version": 1,
  "liked": false,
  "starred": false
}
```

**`schema_version`** — basic engineering hygiene: allows the `Section` structure to evolve later without breaking the display of books already processed under an earlier schema version.

**The two content layers** (validated on the initial mockup):
- `adapted_text` — rewritten text, keeps the same intellectual depth as the author, reformulated to breathe as a slide. **This is not the author's raw word-for-word text** — it's a readaptation that may change the phrasing while preserving the rigor of the argument.
- `clear_explanation` — a plain-language version with common analogies, a visually discreet secondary layer, **never on a separate slide** (presenting the complex version alone first would discourage the user).

**`sentence_curve`** — replaces a single `difficulty` value per slide. Difficulty, valence, and arousal vary sentence by sentence (a sentence can be a complexity peak in the middle of an otherwise simple slide). `word_count` per sentence is used to estimate reading position (see section 11).

**`importance`** remains a single number per slide (not per sentence — a slide's overall importance is more meaningful than importance at the individual-sentence level).

**`audio_description`** — free text, no vocabulary restriction (no closed tag list) — turned into a CLAP embedding at matching time against the sound library (see section 10).

**`continuity_summary`** — becomes the continuity context received by the next section (see section 9), both for the narrative thread and as the starting point for the next audio arc.

---

## 8.1 Slide Sizing by Screen Size

**Starting constraint**: no slide should ever require scrolling inside the app — the reading experience must stay continuous and should never reveal that these are technically "slides" (cf. the UX constraint set out in section 11.5).

**Option rejected**: sending each user's exact screen dimensions to the model so it generates custom content per device. Rejected for cost reasons: this could generate potentially dozens of different versions of the same book depending on the device, blowing up the API budget — exactly the problem being avoided everywhere else in the pipeline.

**Solution adopted**: define 2–3 standard **size classes** (e.g., small phone / standard phone / tablet), each associated with a target word count for `adapted_text` + `clear_explanation` (e.g., ~150 words for a small screen, ~250 words for standard). The model generates content targeting the length of the class requested by the app, never down to the pixel.

```json
{
  "target_size_class": "standard_phone",
  "target_word_count": 250
}
```

**Why this is enough**: within a given class, Jetpack Compose already handles fine adaptation well (margins, font size) without the content itself needing to change. The app simply chooses which class to request based on the detected device — one generated piece of content per class, not per individual device.

---

## 8.2 Rewriting Rule (for the System Prompt)

Guiding principle to explicitly inject into the model's system prompt: **reduce linguistic complexity, never the intellectual complexity necessary for understanding.** This rule applies differently depending on the layer:

**For `adapted_text` (readaptation)** — strict application, no compromise: the language is lightened so it breathes as a slide, but none of the author's argumentative nuance is lost.

> ❌ To avoid: *"Kennan said war should be avoided."* (impoverishes the idea)
> ✅ Expected: *"Kennan believed Soviet expansion should be curbed indirectly, by strengthening the states capable of resisting it."* (same complexity, better readability)

**For `clear_explanation` (plain-language version)** — the rule deliberately loosens: analogies and everyday language allowed, further simplification accepted — but the idea must never become false or emptied of its meaning, only more accessible.

> *"In plain terms: rather than attacking the USSR directly, the idea was to gradually prevent it from expanding."*

In summary: both layers respect "never betray the author," at different, deliberately distinct degrees of simplification.

---

## 9. What Is Sent to the Model (input to the semantic pipeline)

```json
{
  "book_context": {
    "title": "Atomic Habits",
    "content_category": "narrative_nonfiction",
    "overall_tone": "practical, motivational"
  },
  "chapter_context_summary": "This chapter explores how habits form via a neurological loop...",
  "previous_section_summary": "The previous section introduced the concept of 'habit stacking'.",
  "narrative_memory": {
    "established": ["a habit follows a 4-step pattern", "the cue triggers the behavior"],
    "open_questions": ["how to make a habit more attractive?"]
  },
  "previous_section_end_arousal": 0.4,
  "previous_section_end_valence": 0.5,
  "current_block_text": "[raw text of the block being processed]",
  "user_reading_goal": "Build a sustainable exercise routine"
}
```

**Memory principle**: the model never receives the entire book as context. It receives a hierarchy of condensed summaries (book summary, chapter summary, previous section summary) — not the full preceding text. This is what allows for coherence without exploding the token count.

**Audio continuity constraint**: `previous_section_end_arousal`/`end_valence` force the model to generate a `sentence_curve` whose first point naturally connects to the previous slide's end point — creating a continuous emotional graph across the whole book rather than jumps between independent slides.

**`narrative_memory`** — enriches `previous_section_summary` with an explicit structure rather than a simple free-text summary: `established` lists what has already been established as given, `open_questions` lists what the text hasn't yet answered. This lets the model explicitly know whether it should answer a question left open in the current section, giving the impression of an ongoing conversation with the book rather than a succession of independent summaries.

---

## 10. Validation of Model Output

Never run a systematic, expensive check every time (model A generates, model B verifies on every pass). Progressive cascade:

1. **Automatic, free structural validation**: JSON schema respected, required fields present, consistent lengths, valid IDs, consistent ordering.
2. **Free, deterministic checks, before any additional model call**: direct text search (not an LLM) for dates, proper names, numbers, percentages, and quotes present in the source text, compared against what `adapted_text`/`clear_explanation` displays. A discrepancy (e.g., source says "1947," the rewrite says "1948") immediately triggers suspicion — much cheaper than calling a second model to catch it.
3. **Targeted semantic verification** ("decompose-then-verify"): the generated text is broken down into atomic claims, checked against the source text to detect subtler hallucinations — applied only to suspicious cases flagged by steps 1 and 2, not systematically.
4. Only suspicious cases go in front of a more powerful model.

---

## 11. Audio Engine — Full Architecture

### 11.0 Non-Negotiable Constraints on the Sound Library

- **Strictly instrumental** — never any voice or lyrics, not even as an option. Research (see 11.10) shows that lyrics directly interfere with language processing during reading — a channel conflict, not just a distraction.
- **User toggle**: `audio_enabled`, **on by default**, can be disabled at any time without breaking the rest of the pipeline — `sentence_curve`/`audio_description` continue to be generated normally (useful for other purposes), the audio engine simply ignores consuming them if disabled.

### 11.1 The 5 Layers

| Layer | Role |
|---|---|
| Environment | Background sound scenery (rain, forest, city) |
| Atmosphere | Emotional color (continuous pad — mysterious, tense, soothing) |
| Events | One-off effects tied to precise events (deferred — see 11.7) |
| Music | Melodic/harmonic layer |
| Silence | Deliberate absence, driven by the Cognitive Load Controller — an active choice, not a void |

**MVP scope**: 2–3 active layers max (Environment + Music, Silence optional). Events and learning-based personalization deferred to V2.

### 11.2 Representing Emotion — the Valence-Arousal Model

Replaces a free-text `mood` field (non-interpolable) with the adaptive-audio industry standard (video games, Spotify, Apple Music): **Russell's Circumplex Model**.

- **Valence**: 0 (negative/dark) → 1 (positive/bright)
- **Arousal**: 0 (calm) → 1 (intense/energetic)

Two continuous numbers allow mathematical interpolation between two states — impossible with free text.

### 11.3 Cognitive Load Controller — a Continuous Ceiling

The audio ceiling is not a fixed point per slide, but a **continuous curve**, derived from `difficulty`/`importance`:

```
cognitive_load(t) = difficulty(t) × importance(slide)
max_intensity(t) = 1 − cognitive_load(t)
final_arousal(t) = if audio_enabled == false → 0
                    else → min(continuous_arousal(t), max_intensity(t), audio_intensity_ceiling)
```

`audio_intensity_ceiling` comes from the user's `processing_profile` (see section 17) — the subscription tier can cap the maximum reachable intensity, in addition to the cognitive ceiling. `audio_enabled` (user toggle, see 11.0) cuts everything off upstream of the formula.

The ceiling applies to **arousal** only (sound intensity/complexity), not to **valence** (which continues to follow the text freely, without restriction).

**Non-negotiable architectural rule**: any concrete audio parameter (volume, per-layer intensity, mix richness, number of active layers) must derive from `final_arousal(t)` — **never directly from the raw arousal produced by the model**. This guarantees that the ceiling automatically propagates to any new parameter added later, without having to duplicate the check every time.

```
volume(t)                 = f(final_arousal(t))
environment_intensity(t)  = g(final_arousal(t))
music_intensity(t)        = h(final_arousal(t))
active_layer_count(t)     = k(final_arousal(t))
```

### 11.4 Transitions Between Slides — Weighted Smoothing

Principle inspired by attention (weighting of several points, not just 2-point interpolation), implemented simply without training a model:

```
weight(j) = β^(N−j)                                    (β ≈ 0.5, a window of a few slides)
target_audio(N) = Σ [weight(j) × effective_arousal(j)] / Σ weight(j)
```

The more recent a slide, the higher its weight. Result: tension rises/falls feel gradual and anticipated, not abrupt steps.

**Slide-change mechanics**: regardless of direction (forward swipe, backward swipe, auto-swipe), the event received by the audio engine is always the same — *"the user is now on slide X."* The target changes **immediately**, the crossfade (2–3 seconds) absorbs the perceptual transition. Symmetric in both directions.

**Rapid swipe**: if the time between two slides is shorter than the ongoing crossfade duration, the previous fade is interrupted and a new fade starts directly toward the last slide the user landed on — no playing through all intermediate transitions.

### 11.5 Continuous Arc Within a Slide — `sentence_curve`

Rather than a single point per slide, `difficulty`/`valence`/`arousal` are per-sentence curves (see section 8). The Cognitive Load Controller applies continuously, even in the middle of a slide — the audio can go quiet precisely on a dense sentence, then pick back up right after.

**Estimated reading position within the slide** (no scrolling — the internal UX must never reveal that these are "slides"):

```
cumulative_words(k) = sum of word_count for sentences 0 to k
expected_time(k) = cumulative_words(k) / v_effective
```

- **Manual swipe mode**: `v_effective = v_average` (smoothed overall reading speed, see 11.6)
- **Auto-swipe mode**: `v_effective = total_words_in_slide / user_set_delay` (more precise, delay known in advance)

At any moment `t`, the system infers the sentence likely being read and interpolates `difficulty`/`valence`/`arousal` at that position.

### 11.6 Reading Speed Estimation

Every slide swipe is a **free** data point (no popup asked of the user — the normal navigation gesture IS the data point). Principle drawn from a documented mechanism ("Soundtrack for electronic text" patents — to be checked for freedom to operate before any commercial launch of the Events feature).

```
v_N = (number of words in slide N) / (time spent on slide N)
v_average(N) = α × v_N + (1 − α) × v_average(N−1)          (α ≈ 0.3)
```

Weighted moving average: recent reading counts more than history, without over-reacting to a one-off pause.

**Collected from V1**: even without the Events feature, this speed data is collected starting at launch — so the future feature benefits immediately from months/years of accumulated data (no cold start).

### 11.7 "Events" Feature (Layer 3) — Deferred

Sound effects precisely synced to words/sentences actually being read in real time ("audiobook in your head"). Technically validated by research (existing patents on estimating reading position without eye-tracking), but the complexity and prior-art risk need to be checked before any commercial launch of this specific feature. **Deferred to V2**, once reading-speed data has accumulated in V1.

### 11.8 Auto-Swipe

Feature where slides advance automatically after a user-adjustable delay (like a camera self-timer). Advantages:
- Delay known **exactly and in advance** (not an estimate) → precise audio timing.
- Calibration signals: swiping back before the delay ends = "delay too short" (correlates with `difficulty`); advancing manually before the delay ends = "delay too long".
- The audio engine treats this mode exactly like manual swipe (same "arrived on slide X" event), with no dedicated logic.

### 11.9 Sound Selection — CLAP + Valence-Arousal Matching

**No need to build a sound library from scratch**: index an existing, free library (e.g., Freesound.org), filtered to keep only commercially usable licenses (CC0/CC-BY, excluding CC-BY-NC). An embedding is computed once per sound, stored in a vector database.

**CLAP (Contrastive Language-Audio Pretraining)**: places text and audio in a shared numerical space. `audio_description` (free, unrestricted text) is turned into an embedding and compared against already-indexed sounds by similarity — no exact word matching, so the model has full freedom of expression without losing matching reliability.

**Combined selection score**:
```
score(sound) = (meaning_weight × CLAP_distance) + (emotion_weight × valence_arousal_distance)
```
Combines semantic relevance (CLAP) and emotional relevance (the sound's valence/arousal, precomputed once for the whole library) — prevents a "semantically" correct but emotionally mismatched sound (or the reverse) from being chosen.

**Variety**: top 5–10 candidates, weighted random draw avoiding recently played sounds — not always the raw top score.

**Duration handling**: short ambient sounds looped (imperceptible loop point); music continues into the next slide if the mood stays consistent, otherwise crossfade.

### 11.10 What the Research Says About Sound and Comprehension — an Honest Note

Recent studies (EEG, 2020–2026) show that background music, even at low intensity, **measurably increases the mental effort required for semantic integration** during reading (the so-called "seductive detail" / "irrelevant sound effect") — a more pronounced brain signal (N400) with music than in silence, regardless of whether the music is calm or energetic.

**Consequences for REPAGE, to be honestly acknowledged:**
- This **validates and reinforces** the Cognitive Load Controller and the Silence layer — these are not merely cautious aesthetic choices, but a response to a real, documented cognitive cost. The system can legitimately be *more* aggressive about reducing audio on dense/important passages, not only on emotionally intense passages.
- **Product positioning not to exceed**: never claim that audio "improves comprehension" — the research actually points the other way for pure comprehension. The honest, solid argument is **engagement and reading enjoyment** (immersion, desire to keep going), not a cognitive improvement in comprehension itself.

---

## 12. Retention Algorithm (FSRS-6) — a Separate System

The book pipeline produces data (concepts, importance, theme); the retention algorithm **consumes** it, but remains a distinct system, not merged with the book pipeline or the audio engine.

- Can be toggled on/off **per book**, not just globally (e.g., fully active on a medical textbook, disabled on an evening novel).
- On by default, can be disabled in settings.
- **Likes on a slide** feed a **preference/taste** signal (preferred explanation style, density, tone) — distinct from the **recall/memorization** signal FSRS uses. Two different algorithms sharing common usage data, not the same logic.

### 12.1 Two Distinct Interaction Buttons, Two Different Effects

**Important reminder**: no emoji in the UI — sober outline-style icons (consistent with the branding already established), no colored pictograms.

| Interaction (outline icon) | Signal | Effect |
|---|---|---|
| "Heart" icon (like) | Preference/taste | Feeds style/tone/density learning — does not affect FSRS |
| "Star" icon (favorite) | Explicit intent to retain ("I want to remember this") | Forces a review priority in the FSRS schedule for this section's `concepts`, independent of the already-computed `importance` score |

Corresponding fields on `Section`: `liked: bool` and `starred: bool`, with two clearly separate downstream effects — the like feeds personalization, the star directly affects the FSRS review calendar.

---

## 13. Reading Window & Engagement

### 13.1 Principle

Few people have a consistent reading habit — many start a book enthusiastically and then abandon it. Social networks aggressively optimize to capture attention at all times; REPAGE must play on different ground: capture the user **at the right moment**, not constantly.

Established field: "Send-Time Optimization" (used across the push-notification industry) — track each user's historically strong engagement moments, weight recent data more than old, and rely on population averages for new users without history.

### 13.2 Collection — Strictly On-Device

Non-negotiable privacy rule, to be explicitly spelled out in the terms of use: processing of `UsageStatsManager` (screen on/off time, which app is active) happens **entirely on the device**, never transmitted raw to the server.

```
UsageStatsManager (raw data, on-device)
        ↓
Local computation of the "reading window" score (WorkManager, background task)
        ↓
Only the result (e.g., "favorable moment detected") triggers a local action
        ↓
Nothing raw ever leaves the phone
```

### 13.3 The Window Score — a State Proxy, Not Just a Time of Day

Time of day alone isn't enough. Local signals used as a proxy (never a real measure of biological fatigue — to be phrased that way internally, not oversold):

| Signal (local, never transmitted) | What it suggests |
|---|---|
| Long, continuous session in an entertainment app | Probably not available to read right now |
| Transition between two apps (just after closing one) | Often a good capture moment — a flicker of attention |
| Time historically associated with real past REPAGE sessions | Strong, personal signal, takes priority over everything else |
| Screen off for a long time then turned back on | An opening moment, to be observed without overinterpreting |

### 13.4 Cold Start

Same mechanism as everywhere else in the pipeline: before there's enough personal history, fall back on `initial_reading_time_preference` (collected during onboarding) + reasonable population-level defaults. The score gradually shifts toward a user-specific model as real sessions accumulate.

### 13.5 Media Session vs. Notifications — Two Different Roles

- **Media session** — passive, frictionless presence, for someone already inclined to read. It doesn't build the desire, it serves it once it already exists.
- **Three-tier notifications** (recall / call-out / conversion) — the active mechanism that builds that desire at the right moment, triggered by the reading-window score, not by a fixed schedule.

**Message variation**: a pool of variants per tier, drawn in rotation rather than a fixed text — avoids fatigue and disengagement (habitual notification dismissal), a documented risk in the 2026 push industry.

### 13.6 Complementary System Settings

- **Adaptive volume / audio ducking** — standard Android `AudioFocus`/`AudioManager` API, a well-documented native feature, not a hack.
- **Dolby Atmos** — **cannot** be enabled by the app itself; it's handled at the system/hardware level. The app can provide compatible audio, but not trigger activation.
- **Adaptive brightness** — deferred, not urgent to detail now.

### 13.7 Media Session — Which Book to Show When Several Are in Progress

Android only shows **one active media session at a time** — not a ranking/recommendation problem, exactly like a classic music player.

**Principle**: the session follows the **most recently opened book**, not "the best book in the library":

```
User opens Book A → media session = Book A
User opens Book B the next day → media session switches to Book B
Book A stays "paused" in the background, like a song you stopped listening to
```

**Releasing the session**: if no book has been opened for a reasonable period, the session releases rather than staying indefinitely displayed on an abandoned book — consistent with the active reading-window principle (13.1), no unjustified permanent presence.

**Doses follow the same rule** (Block 6+): the dose always comes from the **last book opened** — the card header names the book, and there is no dose-time book picker (friction kills the moment). Switching books = opening another book in the app; the active book follows, like a music player switching tracks. Books in progress keep their per-book chapter state and depth policy, so several books progress in parallel and the dose simply flows to the most recently opened. A "rotate books" preference is a V2 option — the event store (21) will supply the evidence before it's ever built.

### 13.8 Media Session When Audio Is Disabled (`audio_enabled = false`)

Two distinct behaviors, chosen by the user, not a single one forced by default:

- **By default** — no media session. The "Now Playing" widget is an extension of the audio experience; it's consistent for it to disappear if audio is turned off. Honest behavior, no store-compliance risk.
- **Explicit secondary option** — a separate toggle (*"Keep reading mode active on the lock screen"*) that enables a minimal, genuinely audible functional sound (a discreet texture, never silent at 0%) only if the user requests it — avoids generalizing by default the tradeoff mentioned in section 3.2 about the risk of store rejection tied to abuse of artificial audio sessions.

### 13.9 Streak & Reward Hook

Reference framework: the Hook Model (Trigger → Action → Variable Reward → Investment). The three-tier notifications (13.5) are already the "Trigger"; this module adds the streak coupling.

**Important correction compared to a classic streak**: habit-formation research (Lally et al., UCL) shows that missing a single day doesn't significantly affect habit formation — the products that handle this best don't brutally reset the counter to zero. Design adopted, with grace rather than reset:

```json
{
  "streak_count": 12,
  "streak_grace_used_this_week": false,
  "last_active_date": "2026-09-04"
}
```

**Coupling with notifications** — one more variable in the same template as `processing_profile` (17.3):

```
{{#if streak_count > 0}}
"You're at Day {{streak_count}} — keep reading today."
{{else}}
"Now's a good time to pick your reading back up."
{{/if}}
```

**Non-negotiable points of caution**:
- Messages **informative and encouraging**, never guilt-inducing — the FTC has sanctioned loss/guilt "dark patterns" ($2.5 billion against Amazon), and several U.S. states are now writing this into law.
- **Sober** visual execution, consistent with the branding already established (no flashy badges, no emoji, no "pointsification") — a discreet number, not a showy gamification layer.

---

## 14. Progressive Generation & Subscription Tiers

Slides for an entire book are never all generated at once. Generated in batches, processed as a background task **server-side**, not on the device.

**Refined trigger** — not just the number of remaining unread slides, but a combination:
```
trigger = remaining_slides + estimated_time_before_exhaustion (via v_average) + current_server_load + subscription_tier
```
A fast reader (high `v_average`) triggers generation of the next batch earlier than a slow reader, so as never to be caught short — without generating too far ahead and wasting compute. Current server load can also slightly delay a non-urgent generation if the system is under heavy pressure.

**Processing budget by tier** (rather than a simple quantity limit — limits *depth*, not just length, for more strategic conversion):

| Tier | Depth |
|---|---|
| Free | 2 initial chapters, basic analysis, limited audio intelligence |
| Plus | More chapters, deeper analysis, personalized audio |
| Pro | Entire book, advanced contextual analysis, enhanced adaptation |

---

## 15. Learning & Continuous Adaptation — Cross-Cutting Summary

### 15.1 The "Experience Model" Layer

Rather than letting each engine (slides, audio, retention) learn in isolation, a central layer receives user feedback and redistributes it to all three:

```
BOOK
  │
  ▼
BOOK UNDERSTANDING (theme, emotion, concepts)
  │
  ▼
EXPERIENCE MODEL
  │
  ├──→ SLIDES
  ├──→ AUDIO
  └──→ RETENTION
  │
  ▼
USER
  │
  ▼
FEEDBACK (reading speed, likes, stars, navigation)
  │
  └──────────► EXPERIENCE MODEL (continuous loop)
```

REPAGE shouldn't only answer "what does the book say?" — it should progressively answer "how should this book be presented to this person, at this precise moment?" The table below details the individual data loops feeding this layer.

The system learns and adjusts at several independent levels, each with its own data loop:

| Subsystem | What it learns | Source signal |
|---|---|---|
| Reading speed (`v_average`) | The user's actual reading pace | Time spent per slide (manual swipe) or set delay (auto-swipe) |
| Optimal auto-swipe delay | The right setting per user/content type | Premature backward swipe (too short) / premature manual advance (too long), correlated with `difficulty` |
| Content preferences | Preferred explanation style, density, tone | Likes on slides (taste signal, separate from FSRS) |
| Retention (FSRS-6) | When to bring back a concept for this specific book | Reading time, swipe speed, backtracking |
| Audio selection | Perceived variety, avoiding repetition | History of recently played sounds per user |
| Structure detection (chapters, blocks) | Relative reliability of each detection method | Agreement/disagreement between independent methods (cross-validation) |
| Optimal reading window | The moments the user is actually available to read | Local usage signals (`UsageStatsManager`), never transmitted raw — see section 13 |

**Common principle across all these loops**: start with a simple heuristic and a reasonable threshold in V1, collect data from launch even when a feature doesn't yet fully exploit that data (e.g., reading speed collected before the "Events" feature exists), then refine with real usage volume — never the other way around (don't block launch waiting for a perfect model with no data).

---

## 16. Scalability — Architecture to Support Growth

**Honest starting principle**: don't over-optimize for a billion users before having 100 — a classic trap that slows development for a problem that doesn't exist yet. But lay down now the separations that avoid a full rewrite later.

### 16.1 Separating the Fast Path (Synchronous) From the Slow Path (Asynchronous)

**Synchronous path** (must respond in milliseconds, never blocking):
- Authentication, reading already-generated slides, navigation, media session, UI interactions.

**Asynchronous path** (can take seconds to minutes, runs as a background task):
- The entire book-processing pipeline (Docling → chapter detection → chunking → semantic analysis → validation → slide generation).
- The client must **never** wait for a synchronous response from the pipeline — it uploads, receives a `book_id` with `processing_status: "uploading"`, then **polls** or receives a notification (push/websocket) when `status` switches to `ready` for the first chapters.

### 16.2 Job Queue

The processing pipeline must be architected as a **chain of queued tasks**, not one long sequential function call:

```
Upload → [Queue: extraction] → [Queue: chapter detection] → [Queue: chunking]
       → [Queue: semantic analysis] → [Queue: validation] → [Queue: slide ready]
```

Each stage is an **independent, stateless worker**, which can be horizontally replicated (multiple instances running in parallel) depending on load — if many users upload at once, add workers, no need to rewrite the logic.

**Direct benefit for progressive generation**: the same queue serves both the initial processing and the subsequent batches generated as the user advances through their reading — one mechanism, not two different systems.

### 16.3 Priority by Subscription Tier

The queue can have **priority levels** — a Pro user's book gets processed before a Free user's during heavy load, without completely blocking free users (just a longer delay). Consistent with the "processing budget" already defined per tier.

### 16.4 Costs and External Calls (Docling, LLM, CLAP)

These calls (especially the restructuring LLM) are the costliest and slowest bottleneck. Plan for:
- **Batch processing** when the LLM provider allows it (reduced rates, already mentioned).
- **Concurrency limiting** (rate limiting) per user and globally, to prevent a spike of simultaneous uploads from blowing up the bill or saturating the provider's API.
- **Embedding caching** (CLAP for the sound library, chunking embeddings) — computed once, never recomputed on every request.

### 16.5 Database

- The `Book`/`Chapter`/`ProcessingBlock`/`Section` objects must be indexed by `user_id` and by status (`processing_status`/`status`) so that "which slides are ready for this user" queries stay fast even with millions of records.
- Clearly separate **relational** data (book structure, user metadata — a good fit for Postgres/Supabase, already chosen) from **vector** data (CLAP embeddings, semantic chunking embeddings — need a dedicated extension or vector search service).

### 16.6 What Remains to Be Decided Later (Not Urgent Now)

- Exact choice of queueing tool (e.g., managed queue system vs. self-hosted solution).
- Sharding/partitioning strategy if the book volume becomes very large.
- CDN for distributing the sound library's audio files.

These points are noted for the record but should not block MVP implementation — the layered architecture (repositories, stateless workers, sync/async separation) laid out above already provides a sound foundation that doesn't rule out these evolutions later.

---

## 17. Subscription Model & Pipeline Integration

### 17.1 Economic Principle

Don't sell access to reading — sell the **depth, personalization, and continuity** of the experience. Free must remain a real REPAGE experience, never a broken demo.

- **Free** — discover REPAGE: full reading, standard processing, limited audio, basic FSRS.
- **Plus** — live REPAGE: deep processing, full adaptive audio, personalization, full FSRS.
- **Pro** — get the most out of REPAGE: entire book, advanced contextual analysis, processing priority.

**Absolute rule**: never a paywall that interrupts an in-progress reading session. No popup mid-slide, no aggressive lockout in the middle of a chapter. The upgrade prompt appears after a session, or when a premium feature is explicitly requested.

**Explicitly deferred for now**: the "Ask REPAGE" feature (free-form chat querying of the book) — not in V1 scope.

### 17.2 Conversion Strategy: Reverse Trial

Rather than limiting features from day one, every new user gets the **full Plus experience for a limited period (14 days)**, before smoothly downgrading to Free limits.

**Why this choice**: 2026 data shows the reverse trial converts markedly better (15–30%) than classic freemium (2–5%) — the user discovers the product's real value before deciding, instead of guessing what they're missing.

**Conditions for it to work, to be respected**:
- Long enough for the user to genuinely **adopt** the premium feature into their actual usage (14–21 days, not 2–3 days).
- The switch to Free must be communicated **clearly in advance**, not a surprise.
- The Free tier after the switch must remain genuinely usable — never a deliberately broken product to force conversion.

### 17.3 `processing_profile` Object — How the Pipeline "Knows" Who It's Working For

```json
{
  "processing_profile": {
    "tier": "free",
    "trial_active": true,
    "trial_expires_at": "2026-09-19T00:00:00Z",
    "effective_tier": "plus",
    "analysis_depth": "deep",
    "audio_intensity_ceiling": 1.0,
    "model_tier": "premium"
  }
}
```

**Central principle**: the actual tier (`tier`) and the **effective** tier (`effective_tier`, which accounts for an ongoing trial) are two separate fields. The rest of the pipeline **never** reads `tier` directly — only `effective_tier`.

**Propagation in the system prompt** — a template with variables, not a different prompt hardcoded per tier:

```
You are generating a slide with a {{analysis_depth}} level of analysis.
{{#if analysis_depth == "deep"}}
Include a deep, cross-section contextual analysis.
{{else}}
Analyze the section independently, without strong reliance on cross-chapter context.
{{/if}}
```

**Propagation in the audio engine** — `audio_intensity_ceiling` integrates directly into the Cognitive Load Controller formula (see 11.3), as one additional ceiling among others, not a separate system.

**`model_tier`** — the tier can also determine which LLM processes the request (economical for Free, more advanced for Plus/Pro), consistent with the cost logic already established in section 16.4.

### 17.4 Upload: Limits & Queue

Multi-upload is allowed (the user can upload several books in a row, processed via the asynchronous queue — consistent with the architecture in section 16.2), but bounded by a daily quota tied to the tier, to prevent cost abuse:

```json
{
  "processing_profile": {
    "daily_upload_limit": 3,
    "uploads_today": 1
  }
}
```

Exact figure to be tested, not fixed.

### 17.5 To Be Decided Later (Not Urgent)

- Exact pricing (starting hypotheses to test: Plus ≈ $5.99–8.99/month, Pro ≈ $12.99–19.99/month — never validated until the real cost per book is calculated).
- Exact chapter/depth limits per tier after the trial ends.
- Consumables/credits for heavy users — to be reassessed once the real cost per book is known (Docling + LLM + audio, for 300/500/1000-page books).
- Special handling case for the Bible (exceeds the standard page limit — ingestion by sections/books, progressive generation, no "unlimited everywhere" rule).

---

## 18. First Launch & Progressive Discovery

### 18.1 Empty-State Flow

Sequence: onboarding → authentication → empty app → first call-to-action = upload a book (triggers the pipeline). Permission requests (usage stats, notifications) arrive gradually, never all at once on first open.

### 18.2 Cold Start — Which Book to Suggest When Several Are Ready, None Yet Read

No behavioral signal exists yet for these books — no ranking to build, a simple, honest rule: **first ready, first suggested**. The book whose processing finished first (chronological order) is the one pushed via notification/media session. As soon as the user opens any book, it becomes "active" and takes over the media session (rule 13.7).

### 18.3 Coach Marks — Guiding Without Intrusion

Pattern: an overlay that dims the screen except for the targeted element, a contextual explanation bubble, sequenced step by step, skippable at any time. Progressive triggering, tied to actual behavior rather than showing everything on first launch.

Existing Compose libraries to evaluate rather than reinventing the mechanism: `Reveal` (cross-platform, mature) or `Lumen` (transparent cutouts, more recent).

---

## 19. Reading Surfaces & Dual-Renderer Architecture

### 19.0 The Product Pivot

> **REPAGE is a dispenser of reading doses. The slide isn't a feature of the app — it IS the product. The app is an optional deep-dive.**

The dose (one slide) is delivered wherever the user already is — lock screen, or layered over whatever they're doing — at the moment detected by the reading window (section 20). Opening the app is optional, not required to read.

### 19.1 The Four Objects Not to Confuse

1. **Media session** — the system object representing an ongoing audio playback.
2. **MediaStyle notification** — a system template (title, image, buttons) attached to an *active* session. Never long text, never a slide.
3. **Custom notification (RemoteViews)** — a template where the app defines the content: real short text, its own buttons.
4. **`showWhenLocked`** (`Activity.setShowWhenLocked(true)`) — an app activity that displays **over the lock screen**, receives taps without unlocking. The alarm-clock-app mechanism — a public API, Play Store compliant, used for years.

**Officially confirmed**: tapping a notification is a sanctioned trigger for launching an activity even from the background/lock screen — the app gets a window of a few seconds after the tap to start an activity. This is not a workaround.

### 19.2 The Real Surfaces, Capabilities and Limits

| Surface | Content | Without unlocking | Limit |
|---|---|---|---|
| **Custom notification card** | Chapter·section header + hook (1-3 sentences), real text | Buttons: next / heart / star / open | No gesture swipe, no scroll, ~15-25 words |
| **MediaStyle card** (if an audio session is active) | Title + hook + transport controls | next/prev drive the slides, headset buttons | System template, no long text |
| **`showWhenLocked` activity** | The full slide — both layers, emphasis, everything | Real swipe, like, star, auto-swipe, audio | Requires a tap from the card to appear |
| **Heads-up** (user in another app) | The card overlays for 4-6s, then stays in the shade | Preview + buttons, expand by gesture | Ephemeral — the overlay sanctioned by Android |

**Explicitly ruled out**:
- **Full-screen intent** (full-screen appearance without a tap) — reserved for calls/alarms, restricted on Android 14+, requires a special permission (`canUseFullScreenIntent`). No.
- **Third-party lock-screen widgets** — dead since Android 5. No.
- **`SYSTEM_ALERT_WINDOW`** (forced overlay on top of other apps without a gesture) — technically exists, but a special-access permission, fragile Play declaration, frequent rejections. If kept at all: **opt-in mode only** ("capture mode" for power users), never the product's core mechanism.

**Guiding principle**: the tap isn't a bug to eliminate, it's a micro-consent that protects the product — an app that takes over the screen without permission gets uninstalled within three days.

### 19.3 The Full Journey of a Dose

```
1. The reading window (section 20) detects a favorable moment
2. The card (custom notification, or MediaStyle if audio is active) is posted
   — while the screen is off, it simply waits for the wake-up
3. Phone wakes up, locked: the card is already there (header, hook, buttons)
4. The user can like/star/advance directly from the card — that alone can be the whole dose
5. Tap on the card → the showWhenLocked activity appears over the lock screen
   → full slide, real swipe, plain-language layer, everything — WITHOUT ever entering the passcode
6. Re-lock → the audio engine has followed along (cognitive ceiling included),
   telemetry has recorded everything → the reading window recalibrates
```

If the user is in another app rather than the screen being off: the heads-up replaces step 3, the rest follows the same sequence.

**Silence layer and the persistent card**: when audio is off (`audio_enabled = false`), the Silence layer (section 11.1) can legitimately keep the session active to keep the card present — this is the concrete implementation of the decision already made in 13.8 (a genuinely audible functional sound, never silent at 0%, only if the user has enabled the "keep reading mode active on the lock screen" option).

### 19.4 Dual-Renderer Architecture

`Section` remains the single object produced by the pipeline. Two renderers consume it differently — never two separate generation pipelines:

**SlideRenderer** (the "dose" mode — card, lock activity, in-app slide mode)
- Two layers on a single slide (`adapted_text` + `clear_explanation`), never scrolling.
- "Plain terms": a one-tap reveal button per slide (already validated on the mockup).
- Heart / star / audio-toggle buttons, visible.
- Auto-swipe active — dose-based pacing makes sense here.
- Never full screen — centered card, visible margins, capped width (~45-75 characters/line, cf. 19.5).

**BookRenderer** (the "continuous book" in-app mode, default when opening a book)
- Continuous scrolling, no card, no swipe per idea.
- "Plain terms" becomes an **expandable inline annotation**, directly at the point in the text it concerns — same data (`clear_explanation`), different presentation. Can appear anywhere in the text, not confined to one slot per screen.
- Heart / star apply to the `Section` **currently visible at the center of the screen** (same position-estimation mechanism as 11.5, reused).
- Audio-toggle global to the session, not per section.
- **No auto-swipe** — no card-based pacing in a continuous flow.

**Mandatory new telemetry tag**: `renderer_mode: "slide" | "book"`, in addition to the `surface` tag (`card` / `lock_full` / `heads_up` / `in_app`, see section 21). Without this distinction, the Experience Model would confuse dose-paced reading with continuous reading in `v_average` — the same trap as card vs. actual reading.

**Entering the app from a slide**: the header ("chapter 3 · section 2 of 5") serves as the tap zone that opens the app to the exact spot — no extra icon.

### 19.5 Sizing — the Official `WindowSizeClass`

Replaces the improvised approach in section 8.1 with the official Compose API: three classes, **width AND height counted separately** (insufficient height in landscape is a real risk, not just a width to manage).

| Class | Width | Context |
|---|---|---|
| **Compact** | <600dp | Phone in portrait |
| **Medium** | 600-840dp | Phone in landscape, small tablet |
| **Expanded** | >840dp | Tablet/open foldable |

**Adaptation rules**:
- The slide **never** occupies the full available width — text width is capped (~45-75 characters/line, standard typography), extra space becomes margin, not more content.
- In landscape (Medium), the reduced height requires more compact chrome (smaller header), not more text.
- The target length of generated text (`target_word_count`, section 8.1) remains tied to the class, not the pixel — unchanged on this point.

### 19.6 Font, Theme, Texture

- **Font**: not user-controllable in V1 — default size tied to `WindowSizeClass`, an optional alternate font (Crimson Pro) in addition to the default.
- **Theme**: light/dark already handled by `MaterialTheme` derived from the seed color (already established in branding).
- **Brightness-adaptive texture**: a warm filter that intensifies as ambient brightness drops (ambient light sensor or system brightness), e-reader-style comfort mode — enriches section 13.6 (adaptive brightness), not a separate system.
- Applies identically to both renderers — a property of the display, not the reading mode.

### 19.7 Emphasis Tags (`emphasis_spans`)

The model can flag important words/passages (key concepts, quotes) via a structured span array, never markup inserted into the text itself:

```json
"emphasis_spans": [
  { "start": 45, "end": 58, "style": "bold", "reason": "key_term" },
  { "start": 102, "end": 140, "style": "highlight", "reason": "citation" }
]
```

- Rendered via `AnnotatedString` (Compose), identical in both renderers.
- **Strictly moderate usage** — explicit rule in the Phase 2 system prompt (section 9): only genuinely key concepts or direct quotes, never decorative, never systematic.
- **Granular retention interaction**: a tap/long-press on an emphasized span offers a micro-action "remember this concept" — feeds FSRS **at the precise concept level** (`concepts`, section 8), finer-grained than the whole-slide star (12.1).

### 19.8 Sharing — Never the Content

**Entering the app: yes, frictionless** (19.4). **Sharing: yes, but never the text.** Reminder of the legal foundation (section 22): REPAGE's defense rests on strictly private use. A share button exports a **link** (book title + REPAGE), never the readapted text — exporting the text would be a public redistribution of a derivative work, contrary to what section 22's legal posture promises.

---

## 20. Reading Window — Full Algorithm

### 20.0 Theoretical Framework

Established field: *just-in-time adaptive intervention* (academic literature) — the problem isn't finding moments, it's **not wasting the attention budget**. Contextual bandits, confidence quantiles, probing budget — standard, proven building blocks, no exotic research needed.

**Three strict separations**:
1. **Estimate / Decide / Learn** kept separate — the estimator stays honest; all caution lives in the decision policy.
2. **Two channels, two costs** — the passive card (posted while the screen is off) disturbs no one; the heads-up (in another app) costs attention. Two thresholds, one budget protecting the costly channel.
3. **Explore through observation, not through interruption** — a session opened spontaneously by the user teaches just as much as a sent dose, without ever interrupting anyone.

### 20.1 Module 1 — The Estimator `P(receptive | x)`

**Model**: one Bayesian logistic regression, trained **on-device** (UsageStats never leaves the phone — 13.2, 21.1), updated online after every outcome:

```
P(receptive | x) = σ(w · x)
```

~30–40 features, microseconds of computation, zero deep learning. **The full A→W inventory (section 21) is wired in** — every collected signal has its feature; a signal without a feature would be collection without use.

| Source (inventory) | Feature | Encoding |
|---|---|---|
| L (temporal) | Time of day | sin/cos, 2 harmonics (cyclic 24h) |
| L | Weekend | binary |
| M (device) | Battery | ordinal by range |
| M | Headphones connected | binary |
| M/T | Minutes since last unlock | log |
| T (with consent) | Duration of previous session in an entertainment app | log |
| T (with consent) | Previous app category | one-hot (entertainment / social / productive / none) |
| E (velocity) | Normalized vAtHour | continuous |
| S (fatigue proxy) | Current fatigue score | continuous |
| U (engagement) | Active streak, days of activity | continuous |
| B/J (doses) | Outcome of the last dose | −1 / +1 |
| B/J | Hours since last dose | log |
| B/J | Doses sent over 7 days | continuous |
| A (content) | Category of the dosed book | one-hot (fiction / essay / technical) |
| — | Days since installation (novelty) | continuous |

**The key to safety — shrinkage priors**: every coefficient starts with a Gaussian prior centered (almost) at zero. Structural consequence: a feature with no evidence → coefficient ≈ 0 → present in the model but without influence (automatic humility); evidence accumulates → the coefficient wakes up. No manual "activate after N observations" rules — the model allocates confidence on its own, continuously.

**Nothing is thrown away**: every heuristic from the previous cell design becomes a prior mean instead of a hard rule. The "screen turned back on after ≥45 min" bonus (+0.10) is `w₀ ≈ +0.5` in logit space for its feature; population reading patterns (commuting, breaks, evening) are the priors of the hourly harmonics; the onboarding `initial_reading_time_preference` weights those same priors. Everything becomes revisable by the data. Note the content-category row: "fiction at night, essay in the morning" is not a hand-built interaction — it's a shrinkage feature that only activates when the evidence justifies it.

**Labels and training — the distinction that protects everything**:
- **Primary training data: dose outcomes only** (module 20.3) — the only unbiased data for the question "what happens if I interrupt?". Graded: dismissal = 0 (weight ×2), ignored = 0.25, opened = 0.6, opened + deep reading (>60s) = 1. A delayed opening (>2h) = 0.5 — a passive dose that succeeds on a long horizon is not a failure.
- **Voluntary in-app sessions**: weighted pseudo-observations (λ = 0.5, capped label) that inform the priors — a user who opens REPAGE voluntarily at 8 AM three days in a row informs the model, but as weaker evidence: voluntarily choosing to read ≠ accepting an interruption.

**Uncertainty**: a bootstrap ensemble of 5 models (5 trainings on subsamples) → standard deviation σ between their predictions. Simple, robust, no Laplace computation. **Cautious score**:

```
p_LCB = p̂ − 0.84 × σ      → thresholds unchanged (20.2): θ_passive = 0.35, θ_active = 0.65
```

At cold start σ is large → p_LCB is low → the algorithm is cautious **by construction**, and loosens up automatically as σ tightens. Caution is no longer a setting: it is an emergent property of uncertainty.

**Exploration**: ~5% of doses selected via Thompson sampling (sample a w from the posterior, choose the timing on that sample) — causal coverage of the feature space, impossible by grid exploration, trivial through posterior sampling over naturally occurring contexts.

### 20.2 Module 2 — The Decision Policy

Periodic tick (WorkManager, ~30 min):

```
S = q_c + event_bonus    (bonuses capped, +0.18 max total)
```

**Real-time events** (60-min window, `UsageStatsManager` + `PowerManager`):

| Event | Bonus | Logic |
|---|---|---|
| Screen turned back on after ≥45 min away | +0.10 | Attention freshly available — the card is already there |
| Exit from a ≥20-min session in an entertainment app | +0.08 | End of episode/scroll = natural transition |
| Headset connected | +0.03 | An audio dose is more relevant |

**Hard gates** (multiply to 0, no exceptions): DND active, battery <20% or power-saving mode (active channel only), cooldown active.

**Thresholds and budget**:

| Parameter | Initial value | Role |
|---|---|---|
| `θ_active` | 0.65 | Heads-up threshold. Slow decrease (−0.02) after 10 consecutive successes |
| `θ_passive` | 0.35 | Silent-card threshold — low, near-zero cost |
| Active budget/day | 1 | +1 if hit-rate ≥0.7 over the last 10; max 3 |
| After active dismissal | end of day | The active channel shuts off for the day, regardless of score |
| Passive card | max 1 live, `setTimeoutAfter` ≈5h | Never accumulating in the shade |
| Survival mode | auto if 7-day dismissal-rate >20% | 1 dose/day, top-1 cell, θ raised to 0.75 |

**Key rule**: a dismissal costs more than a success earns — it cuts off the rest of the day, not just that cell's score. **The ultimate metric is neither hit-rate nor streak: it's the survival of the notification channel** (the user who never turns off REPAGE notifications).

### 20.3 Module 3 — Memory (Outcomes)

- **Opened** (`contentIntent` fired) → `α_c += 1`. Depth measured: slides read, time >60s = deep success.
- **Dismissed** (`deleteIntent` fired) → `β_c += 2` — double weight: a dismissal is a more informative observation of non-receptiveness than an ignored card (importance weighting, not a bias).
- **Ignored** (expires without either of the two signals above) → `β_c += 1`.
- **Opened late** (>2h after posting) → weight 0.5 — not a failure, a successful passive delivery on a long horizon. Without this rule, we'd be punishing the behavior we want to create.
- **Spontaneous in-app session** → `α_c += 0.5` in the starting cell — free, ongoing evidence.

### 20.4 The Timeline (no fixed observation period)

1. **Day 1: the model already runs.** It learns from voluntary sessions and usage patterns (if `UsageStats` consent given), but σ is huge → **passive card only**, guided by the priors. Reading outside the app starts immediately — only the interruption channel stays cautious, because only it costs attention.
2. **~Month 1 (~30 doses)**: the model is essentially "hourly harmonics + previous outcome + priors" — continuous, already richer than a discrete cell grid.
3. **Months 2–4**: device / previous-app / fatigue features wake one by one, each at the pace of its own evidence. The book-category feature activates around then if the content interaction is genuinely present for that user.
4. **Continuously**: every silent feature remains recorded and ready — nothing collected is ever wasted; everything eventually feeds into the model. A residual ~5% Thompson sampling (20.1) maintains causal coverage over the months, not just correlational observation.

**Implication for block ordering**: in-app experience (Block 6) remains critical and a priority from day one — during the cautious period it IS the product, and it is also the free evidence source (spontaneous sessions) that feeds the estimator.

### 20.5 Tick Pseudocode

```kotlin
fun tick(now: Instant) {
    if (dndActive() || batteryLow() || cooldownActive()) return

    val x = featuresOf(now)                    // full context vector (20.1)
    val (pHat, sigma) = ensemble.predictWithUncertainty(x)
    val pLCB = pHat - 0.84 * sigma
    val S = pLCB + realTimeBonuses(window = 60.min)

    when {
        S >= θ_ACTIVE && budget.today > 0 ->
            deliverActiveDose(size = estimatedWindow(now) × vAtHour(now))
        pLCB >= θ_PASSIVE && noLiveCard() ->
            postPassiveCard(timeoutAfter = 5.h)
    }
}
// featuresOf: assembles every §21 signal into the model's feature vector
// estimatedWindow: plausible minutes of the window (session prior at this hour)
// vAtHour: reading speed by hour — sizes the dose (window × speed = number of slides)
```

### 20.6 What We Deliberately DON'T Do in V1 — and Why It's the Right Call

- **No per-user deep learning, no high-order feature interactions (feature × feature) before sufficient volume, and never learning the safety gates** — these three things don't become better by waiting. The current estimator (20.1) already delivers what linUCB would have offered: continuous features, evidence-gated activation through shrinkage priors — V2 changes the estimator's capacity, not the architecture, which is what makes it safe to launch small.
- **No wake-time prediction model** — the "minutes since last unlock" feature covers the same need with less risk; the passive card can be posted broadly (zero cost).

### 20.7 V1 refinements — normative, see the dedicated reference

The reading-window algorithm now has a **complete engineering reference**:
[`REPAGE-reading-window-algorithm.md`](./REPAGE-reading-window-algorithm.md)
(every feature, every function, every prior, every gate, the glossary, and the
implementation phases). Where this section and that document disagree, the
reference wins and this section is to be updated in the same commit.

The refinements it fixes, superseding the details above:

1. **Feature normalization is mandatory** — z-score per feature (running μ/σ,
   Welford, seeded with population defaults) before the estimator; missing ⇒
   normalized 0 (= no influence, matching the shrinkage prior).
2. **2-harmonic cyclic time, not a 168-cell heatmap** — 4 harmonic features +
   `is_weekend` capture ~95% of the weekly pattern and remove the cold-start
   delay.
3. **No attention-residue / glance-vs-wandering classification** — replaced by
   observable quantities (`minutes_since_last_unlock`,
   `unlock_duration_seconds`, `screen_on_minutes_60`, `velocity_5min`); the
   shrinkage prior learns their weight instead of us guessing intent.
4. **Event-driven evaluation, never polling** — `BroadcastReceiver`
   (screen-on/unlock, power) + `AudioDeviceCallback` + a 30–45 min
   `WorkManager` heartbeat.
5. **Driving / car-audio hard gate** — with A2DP car audio (or speed > 25 km/h
   where the permission already exists), the visual active score is forced to
   0; audio-only or hold.
6. **5-hour expiry rule** — an unopened, undismissed dose is auto-cancelled and
   labeled `ignored` (0.25, weight 1.0); nothing lingers on the lock screen and
   no dose escapes training.
7. **No scheduled cold-start blackout** — the model runs from day one;
   "passive only" early is σ-driven and relaxes as evidence arrives (first
   active doses typically days 3–5, not week 3).
8. **Labels and weights per the reference** — graded labels
   (dismissed 0.0 ×2, ignored 0.25, opened-late 0.5, opened 0.6,
   continuation 1.0, spontaneous session +0.5 at weight 0.5) replace the
   α/β counter increments described in 20.3; the online update applies time
   decay γ then one weighted step per ensemble member.

---

## 21. Full Inventory of Collected Data

**Guiding principle** (to be respected for every new data point considered): *"We collect raw observations. We then derive metrics. Only after that do we build the profile."* Never store an interpretation directly ("prefers short texts") — always the raw event with its context, derive later. Every collected data point must be tied to a specific decision it helps improve — never collection without an identified use.

**Technical architecture**: a **generic event log** (`RawEventStore`), not separate tables per signal type — avoids a schema migration for every new signal. Every event carries: `event_id`, `timestamp`, `session_id`, `book_id`/`chapter_id`/`section_id`, `event_type`, `payload`, **and the context at the moment of the event** (section difficulty/importance, estimated reading speed, audio state, etc.) — the same raw event (e.g., a "like") doesn't mean the same thing depending on its context.

```
ACTUAL BEHAVIOR → RAW EVENTS (+ context) → DERIVED METRICS → PREFERENCES/HABITS → USER PROFILE → REPAGE ADAPTATION
```

### A. Content Identity (generated by the pipeline, context for everything else)

| Data | Use |
|---|---|
| `difficulty`, `importance`, `theme`, `concepts` per Section | Context for every behavioral event — without it, time spent or a backtrack means nothing |
| `sentence_curve` | Reference for sentence-by-sentence speed and the Cognitive Load Controller |

### B. Raw Navigation — the Most Central Data

```json
{
  "event": "slide_navigation",
  "book_id": "...", "chapter_id": "...", "section_id": "...",
  "from_section": "...", "to_section": "...",
  "direction": "forward | back | jump | abandon | direct_open | book_close | book_resume",
  "elapsed_ms": 38200,
  "navigation_mode": "manual_swipe | auto_swipe",
  "renderer_mode": "slide | book",
  "surface": "card | lock_full | heads_up | in_app"
}
```

Direction and timing (e.g., 18s→next, 12s→next, 45s→back, 31s→next) often tell more than a simple average speed.

### C. Time by Level of Granularity

Slide, chapter, total session, average, before abandonment, before backtracking, before a setting change, pause, between two sessions. **V1: entry/exit of a section is enough**, no second-by-second tracking.

### D. Backtracking — a Signal of Real Difficulty

`backtrack_rate`, `revisit_rate`, `revisit_distance`, `repeated_section_count` — distinct from theoretical content `difficulty`, calibrates a user-specific `slowdown_threshold`/`backtracking_threshold`.

### E. Reading Speed — Beyond the Simple Average

Per transition: `words`, `elapsed_ms`, `difficulty_mean`, `difficulty_peak`, `importance`. Derived: mean, median, standard deviation, percentiles, recent speed, **speed by content type** (novel/essay/technical), by time of day, by session length. A user might read a novel at 310 wpm and a technical text at 145 wpm — not a single "user speed" value.

### F. Behavior Facing Difficulty

Time spent / backtracking correlated with the section's real `difficulty` → user-specific `difficulty_tolerance`, `preferred_density` — richer than "fast/slow".

### G. Explicit Signals

`like`/`unlike`, `star`/`unstar` (already in spec, 12.1); in addition: `save`, `share`, `copy`, `highlight`, `open_explanation`/`close_explanation`, `expand`/`collapse`. Optional, lightweight, never a permanently visible forced button: "I didn't understand" / "already knew this" / "skip" — a strong explicit signal, especially when cross-referenced with `difficulty`.

### H. Settings Changed — With Context, Not Just the Final Value

```json
{
  "event": "reading_setting_changed",
  "setting": "font_size", "from": 1.0, "to": 1.15,
  "section_id": "ch4_s8", "time_since_open_ms": 18300
}
```

The context of the change (which section, how long after opening) is more useful than the value alone.

### I. Audio Telemetry

`audio_on`/`audio_off`, volume changes, track start/stop/skip/replay, per-layer activation (environment/music/silence). Per played sound: `duration_played_ms`, `skipped`, `replayed`, `volume`, `arousal`, `valence` at the time. Silence itself becomes behavioral data (e.g., volume lowered on a dense passage, raised again afterward).

### J. Auto-Swipe Calibration (already in spec, 11.8)

Backward swipe before expiration (delay too short) / manual advance before expiration (delay too long) / no adjustment (delay close to optimal) — learning `optimal_delay_user`, `optimal_delay_by_content_type`, `optimal_delay_by_difficulty`.

### K. Sessions (aggregate object)

```json
{
  "session_id": "...", "started_at": "...", "ended_at": "...", "book_id": "...",
  "sections_opened": 27, "sections_completed": 21, "backtracks": 4,
  "audio_enabled": true, "auto_swipe": false
}
```

Derived: average/median duration, sections per session, frequency, completion rate, abandonment rate. **Session structure matters** — 5 sessions of 10 min ≠ 2 sessions of 90 min, very different usage patterns of the product.

### L. Temporal Context

Start time, day of week, session duration → locally derived into morning/afternoon/evening/night, weekday/weekend. Directly feeds the reading window (section 20). Never needs precise GPS.

### M. Device Context

Device class, `WindowSizeClass` (width/height), density, orientation, system font scale, OS/app version, battery level (by tier), headset connected, audio output (speaker/headset/Bluetooth). Allows distinguishing real reading slowness from a technical cause (small screen, reading via speaker, enlarged system font).

### N. Technical Performance — Never Mixed With User Behavior

`time_to_first_slide`, image render time, audio latency, generation time, dropped frames, errors, retries. **Separate, mandatory category**: without it, a slide taking 2.4s to load would be wrongly interpreted as "the user is bored and leaving quickly."

### O. Errors and Frustration

Rapid repeated taps, failed navigation, retry, cancellation, return after an error — a tap/tap/tap/wait/back pattern signals frustration without ever having to ask "are you frustrated?"

### P. Feature Usage Depth

For each feature: viewed / clicked / used / used repeatedly / retained. Distinguishes a feature just tried once from one truly adopted.

### Q. Content × Behavior Relationship (derived)

Per Section: reading time, completed, backtracked, liked, starred, audio used/changed, explanation opened — cross-referenced with that Section's characteristics (theme, difficulty, importance). Enables fine-grained preferences ("stays longer on conceptual passages, tolerates more density when importance is high") rather than crude labels.

### R. Evolution Over Time (behavioral delta)

Speed / audio usage / auto-swipe delay **before vs. after** several sessions — often more revealing than the absolute value, shows real learning.

### S. Session Fatigue Proxy (never a real measurement)

Speed ↓, time between actions ↑, backtracking ↑, abandonment ↑, audio disabled, font enlarged → a combination named `session_friction`/`reading_fatigue_proxy`. **Always called a "proxy," never presented as a real measure of mental state** — same discipline as for the reading window.

### T. Reading Window (already in spec, 13.2-13.3, detailed in section 20)

`UsageStatsManager` (screen on/off, active app) — **never leaves the device**, local computation only.

### U. Engagement (already in spec, 13.9)

`streak_count`, `streak_grace_used_this_week`, `last_active_date`.

### V. Subscription (already in spec, 17.3-17.4)

`tier`, `trial_active`, `daily_upload_limit`, `uploads_today`.

### W. What We NEVER Collect

Precise GPS, contacts, messages, microphone, personal photos, history of other applications, unnecessary advertising identifiers. Absolute caution on anything that would allow inferring health, religion, political opinion, or real psychological state — not necessary for extraordinarily fine-grained personalization based solely on in-REPAGE behavior.

### 21.1 What Stays Strictly Local vs. What Syncs

- **`UsageStatsManager`** (activity outside REPAGE) → **strictly local**, never leaves the device (non-negotiable rule, 13.2).
- **Reading behavior *within* REPAGE** (speed, backtracking, likes, sessions) → first-party data about usage of the product itself. **Derived metrics** (not raw events one by one) sync to the server — necessary for the Experience Model to influence server-side generation (section 15) and for multi-device continuity.

### 21.2 `USER_PROFILE` Separation

```
UserProfile
├── ReadingProfile          (speed, session/navigation patterns, difficulty tolerance)
├── ContentPreferenceProfile (density, tone, explanation style, preferred content types)
├── AudioProfile             (music/environment preference, silence tolerance, volume, intensity)
├── InterfaceProfile         (font, theme, spacing, auto-swipe)
├── RetentionProfile         (review behavior, star usage, revisit patterns)
└── SessionProfile           (preferred moments, typical duration, frequency)
```

---

## 22. Copyright & Terms of Use

**The problem**: a clause saying "the user is responsible, they grant us the right to readapt" organizes liability between REPAGE and the user — it does not bind the book's publisher. A publisher whose work is reformulated at scale by a commercial platform sues the platform, not the user who checked a box. Claiming a license the user has no power to grant can even look like bad faith in a dispute.

**The stronger framing adopted**:
1. **Service license, not content license** — "processing your file to provide you the experience," never a license on the work itself.
2. **Strictly private use** — no sharing, no redistribution, per-user library, no shared catalog between users (the cross-user compute cache from section D.1 of the scalability addendum remains a compute cache, never visible content sharing).
3. **Refuse DRM files** at validation — technically simple, demonstrates good faith.
4. **Responsiveness to takedown requests** — a process to document before it's needed.
5. **No model training** on the content of uploaded books.
6. **Real IP legal advice before enabling any revenue** — the reverse trial (17.2) creates rapid commercial exposure, not to be underestimated.

This posture seriously mitigates the risk ("private tool"), it doesn't eliminate it.

---

## 23. Privacy — the Exact Wording

**Mistake to avoid**: "your data never leaves your phone" is too broad a promise — true only for usage of *other* apps (`UsageStatsManager`, section 21.1). Interactions with REPAGE itself (speed, likes, sessions) must reach the server for progressive generation (section 14) and the Experience Model to function.

**Wording to use in the privacy policy**:

> *"Your usage of other apps never leaves your device. Your interactions with REPAGE are synced to power your experience."*

An overly broad promise is a flaw, not a protection.

**Implementation reminder**: `UsageStats` access is requested via the system "Usage Access" screen (Settings), never a standard runtime popup — accompanied by an honest explanation of why (already noted, section 13).

---

*Document generated from an in-depth design session covering REPAGE's book-processing pipeline and adaptive audio engine.*