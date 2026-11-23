# REPAGE — Agent Instructions

This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, security, scalability, and cross-platform compatibility. Use the best current standard for every decision.

## What REPAGE is

A **reading-distribution system**, not a reader app. A user uploads a book; the server restructures it into small **doses** of **two-layer slides** (readapted text + a visually understated "Plain terms" layer on the same slide). A **reading-window algorithm** learns the moment the user is most likely to read and delivers a dose into their day. **FSRS-6** brings key ideas back at the right time. Success metric: **continuation** (the user opens a dose and keeps reading), not clicks.

Core product loop: `upload → server pipeline → slides → dose delivery (reading window) → reading → retention`.

## Workflow (mandatory, in this order)

1. **Clarify the problem** before proposing any solution. If the request is ambiguous, ask one focused question.
2. **Plan.** State the goal, constraints, and what will not be touched.
3. **Consult official documentation** (and research papers where relevant) for every API, library, or algorithm involved. Cite what was consulted. Never answer from memory for Expo, EAS, React Native, Supabase, or Apple/Google platform APIs.
4. **Design** before implementing: data shapes, states (default, empty, loading, error, offline), module boundaries, failure modes, security implications. Wait for approval on non-trivial designs.
5. **Implement** in small, reviewable steps.
6. **Test**, then **verify** that the result matches the design and the relevant regression checklist (see Definition of done).

Do not skip ahead. Do not implement while the design is still open.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present). The dev machine is **Windows** (PowerShell): use PowerShell syntax (`$env:VAR`), not bash.

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Environment

- Dev machine: Windows. Android SDK installed (`ANDROID_HOME` set), JDK 17 (`JAVA_HOME`). **Test on a physical Android phone over USB; do not rely on the emulator.**
- No local iOS builds (no Xcode on Windows). iOS builds go through EAS cloud. Native iOS code (Swift) cannot be run locally — design it to be thin and testable in isolation.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`). Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Native code rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:android` locally (USB phone), or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
- **Custom core modules** (Kotlin on Android, Swift on iOS) are allowed only where JS cannot do the job: platform signal collection and exact notification scheduling for the reading window, and background-reliable file transfer if the JS options prove insufficient. Everything else — including the whole decision algorithm — stays in shared TypeScript. Build native modules with the Expo Modules API; read its docs first.

## Scope

**Omitted from V1 (do not build, do not plan around):**
- The entire **audio engine**: sound library, CLAP matching, valence-arousal mapping, cognitive-load controller, `sentence_curve` usage, `audio_description` usage, audio transitions, and any audio-based media session (including looping/near-silent sound to keep a session alive). The audio docs are outdated.
- The server may still return audio-related fields on sections. The client ignores them. Do not delete server columns. Telemetry records `audio_enabled = false`.

**To confirm before building (not decided):** continuous-scroll renderer, subscriptions/billing, cross-device sync, outside-app lock-screen surfaces, push vs polling for status. Ask; do not assume.

## Architecture

- Layers: **UI → domain (pure logic, use cases) → data (repositories, local DB, remote)**. Unidirectional data flow. Domain code is pure TypeScript with no React or platform imports, so it is unit-testable.
- **Offline-first.** Local DB is the source of truth for the reader. Writes go local first, then best-effort remote; a failed remote call never rolls back local state. Merge by natural key, last-writer-wins with versioning; no CRDTs.
- **Unknown is not zero.** Never use `""`, `0`, or `false` as a placeholder for an unknown value. Use `null`. Decode server enums leniently (unknown value → safe default).
- **A Section is a slide.** No separate slides table. `slide_kind` (`content` | `system_offline` | `system_paywall`) discriminates rendering; system slides are synthesized on-device and never synced.
- **Local migrations must be real** once local-only state exists (read positions, pins, mode memory). Never ship a destructive local reset that would erase reading progress.
- **Structured JSON logging** from the first line of code: `ts`, `level`, `service`, `correlation_id` (= `book_id` once it exists), `msg`, optional `err`. No free-text logs.
- **Idempotency**: retries must never duplicate work; use idempotency keys and unique constraints.
- Any value that varies with screen width uses window size classes; slide text width is capped (≈520 dp equivalent) — extra space becomes margin, not more characters per line.

## Server contract (Supabase)

The server pipeline already exists and is **not** being rewritten. Treat the runbooks (`REPAGE-block2…5-server.md`) as the contract, and verify against the live schema before relying on a detail.

- Book status flow: `uploading → validating → extracting → structuring → analyzing → completed`, plus `error`. (Older docs say `ready`; the Block 5 runbook says `completed` — verify live.)
- **The client can never inject or skip a pipeline stage.** After upload, stages advance only by server-side row transitions and workers. The client reads status; it does not drive it. Client-side transitions are limited to the upload stage.
- **The client uses the anon key + the user's JWT only.** Never ship, log, or commit the `service_role` key or any worker secret. Secrets live in Supabase Vault / EAS secrets, never in source.
- Rely on RLS (owner-only) for all user tables; never trust client-supplied ownership.
- Upload rules: insert the `books` row **first** (`status=uploading`) so there is a correlation id; validate by **magic bytes**, not extension (`%PDF-`, ZIP `PK\x03\x04` + EPUB mimetype); compute **streamed SHA-256** during the single upload pass; pre-upload duplicate check against the raw-file hash (dialog: upload anyway / choose another file — never silent, never auto-block); size cap 50 MB; bounded decompression.
- Status polling pauses while offline and uses exponential backoff. Push is the intended primary mechanism later.
- Connectivity: online means a **validated** network exists, confirmed by an active reachability probe; track metered state reactively.
- Analysis is per-user and goal-aware; the shared compute cache covers extraction and enrichment only. Do not assume slides are shareable across users.

## Reading experience

- Modes: **dose** (default, the product's identity) and **continuous**. Mode is remembered per book, on-device.
- Reader shell owns chrome (immersive, tap-to-reveal bar that auto-hides after a few idle seconds); the renderer owns the card. Swiping, expanding "Plain terms", or using a menu never toggles chrome.
- The pager pages the **dose**, not the book. Dose window: start at first unread slide, size from the daily-dose planner, short final dose allowed.
- Both layers of a slide appear **on the same slide**, never on two.
- Honest states only: never display a fabricated count or position; show an explicit "structure pending" state instead.
- Reading telemetry (`session_start`, `session_end`, `nav_forward`, `nav_back`, with `surface` and `renderer_mode` context) is the dense learning signal. Collection is strictly on-device; only the minimum syncs. Never collect what the spec lists under "What We NEVER Collect".

## Retention (FSRS-6)

- FSRS-6 only (not SM-2/FSRS-4.5). Scheduling runs **client-side**; the server stores state under RLS and never computes FSRS.
- Day-granularity configuration: no learning/relearning steps, fuzzing off, so schedules are deterministic and testable.
- Whole-section cards use the `concept = ''` sentinel; unique key `(user_id, section_id, concept)`.
- The reference implementation is the existing Kotlin port of py-fsrs 6.3.2 with golden vectors (117). Any TypeScript port must pass the same vectors, or regenerate them with a documented reason. Choosing a library vs. porting is a design-phase decision: read the docs first.

## Reading window (the core of the product)

Reference docs: `REPAGE-reading-window-algorithm.md`, `REPAGE_problem_and_solution.md`, `REPAGE_algorithm_patch_v1.md`.

- Layers 3–5 (estimator, decision policy with discipline, label maker) are **pure shared TypeScript** over a `FeatureVector`, doses, and outcomes. Layer 1 (signal collection) and the tick are per-platform native.
- **Android:** full design, with usage access only under explicit user consent.
- **iOS:** a degraded regime. No screen-state or usage events; no reliable background tick. Delivery is pre-scheduled local notifications from a learned time model; if exposure to a notification cannot be observed, treat expiry as unseen and do not update the model from it. Do not plan around Apple's Screen Time API (approval-gated, built for parental controls).
- Patch V1 is normative: posterior with uncertainty (lower confidence bound), propensity logging in `decision_log`, exposure-aware labels, cold-start priors, and the baseline policy comparison. Known open points to resolve in the design phase: no intercept term, soft-label vs. threshold calibration, decay of the mean after long inactivity, normalization stats updated on every eligible tick.
- Never add notification frequency for its own sake. Notification-channel survival matters more than any single dose's success rate.

## Design system

- **No hardcoded values in screens.** Everything comes from tokens. `DESIGN_SYSTEM.md` is the single source of truth (most values still blank — fill the section a screen needs before building that screen).
- Colors come from `material-theme.json` (Material Theme Builder export, seed `#1F7A4D`). Every color exists in light and dark. Reading themes (paper, dark, etc.) are separate from UI themes.
- **No emojis anywhere.** Sober outline icons. Icon set is **not decided** for React Native (earlier docs conflict: Lucide-style vs. Material outlined) — confirm before adding icons.
- Reading font: system serif by default; bundled serif (Crimson Pro) is opt-in. Support OS text scaling.
- Each screen exposes a `XxxUiState` and `XxxActions` contract and ships a short "To wire" note; logic code does not edit UI-owned files.
- Accessibility: touch targets ≥ 48 dp, contrast per WCAG, information never carried by color alone, screen-reader labels, respect reduce-motion.

## Security & privacy

- Validate all external input at the boundary. Treat uploaded files as hostile.
- Copyright: each user uploads their own copy; do not build any feature that shares book content between users. Sharing never shares the content itself.
- Privacy wording and data inventory follow spec §21/§23. Behavioral data stays on-device unless explicitly listed as syncing.
- Secrets rotation must be possible without breaking the service; document it before it is needed.

## Definition of done

A task is done only when all hold:

1. Design was approved before implementation.
2. `npx expo lint` and `npx tsc --noEmit` pass; `npx expo-doctor` is clean.
3. Pure domain logic has unit tests (including golden vectors where a reference implementation exists).
4. Every screen exists in all required states: default, empty, loading, error, offline.
5. Verified in light and dark, at large text scale, and on a **real phone**.
6. The relevant regression checklist was re-run (upload flow, retention engine, reader shell). Add new checklist items when a bug is found.
7. No new hardcoded styles, no secrets, no emojis, no placeholder values standing in for unknowns.

## Reference documents

Server runbooks: `REPAGE-block2/3/4/5-server.md`. Product: `REPAGE-spec-en.md`. Pipeline spec: `REPAGE-book-audio-pipeline-spec-EN.md` (**audio sections outdated**; sections on reading window, surfaces, data inventory, and subscriptions still apply unless revised). Robustness: `REPAGE-scalability-addendum.md`, `REPAGE-operational-excellence-addendum.md`. Client history: `REPAGE-client-pipeline-notes.md` (Kotlin client; the **behavioral reference** for the React Native rewrite, not code to copy). If a document conflicts with this file, ask — do not guess.