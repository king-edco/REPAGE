# REPAGE Client Pipeline Notes

## Roadmap

| Block | Feature | Status |
| :--- | :--- | :--- |
| **Block 1** | **Upload Flow & Book Ingestion** | **Done (+ Fixes 1.1–1.5)** |
| **Block 2** | **Security Validation (pre-Docling, server)** | **Done** |
| **Block 3** | **Docling Extraction + cache gate** | **Done (Kaggle test harness; fan-out = 3b)** |
| Block 4 | Gatekeeper (post-Docling enrichment) | Planned |
| Block 5 | Chapter detection → semantic analysis → Reading UI | Planned |
| Block 6 | Offline Sync (Room) | Planned |

### Reading Experience roadmap (Blocks A–G)

A separate track from the pipeline blocks above — the slide-based reading UI that consumes the pipeline's output. Per the agreed plan, a Section **is** a slide (no new slides table).

| Block | Feature | Status |
| :--- | :--- | :--- |
| **A** | **Retention foundation: `retention_cards` (FSRS-6) + `sections.slide_kind`** | **Done** |
| **B** | **Book Detail screen (progress header, mode-remembering CTA, cache management)** | **Done** |
| **C** | **Immersive reading shell (hidden chrome, tap-to-reveal bar, dose pager)** | **Done** |
| D | SlideRenderer — dose mode (star → FSRS wiring, auto-swipe, visuals) | Planned |
| E | BookRenderer — continuous scroll mode | Planned |
| F | Room cache as source of truth (sync + eviction; starred never evicted) | Planned |
| G | Outside-app dose surfaces (notification → lock-screen → heads-up) | Planned |

---

## Block 1: Upload Flow & Book Ingestion

### Goals
- Resilient file transfer surviving process death and flaky network.
- Industrial-grade validation (signature-based, not just extension).
- No orphaned rows in DB.
- Idempotent retries.

### Key Decisions & Principles

1.  **WorkManager for Byte Transfer (Mantra 9):** Ensures the upload completes even if the user backgrounds the app. Uses `enqueueUniqueWork` with `KEEP` to prevent duplicates (Mantra 4).
2.  **Insert Row FIRST (Mantra 1):** The `Book` record is created with `status=uploading` before the storage upload starts. This provides a correlation ID (`book_id`) for all subsequent logs and makes the session recoverable.
3.  **Signature Validation (Mantra 3):** Uses `ContentResolver` to read magic bytes (`%PDF-`, `PK\x03\x04`) and bounded ZIP entry check for EPUB mimetype. Prevents basic zip-bombing and invalid file uploads early.
4.  **Persistable URI Permissions (Requirement 7):** Uses `takePersistableUriPermission` to allow WorkManager to read the file after process death without re-prompting the user.
5.  **Streamed SHA-256 (Mantra 5):** Hash computed during the single upload read pass. Sets up the content-addressed cache for the future.

### Block 1 Fixes (refactor/architecture-cleanup)

Applied on top of the original Block 1, per the restructured pipeline plan (Fixes 1.1–1.5, Block 1 only — nothing reads file meaning beyond binary hashing):

1. **Fix 1.1 — Pre-upload duplicate check (raw-file hash).** `ContentHasher` (streamed SHA-256, `data/util`) runs at file selection; `UploadViewModel` checks `repository.checkDuplicateByHash()` (plain PostgREST select — the books RLS policy scopes it to the user's own rows). Match → Cancel-Upload-styled dialog: **Upload anyway** / **Choose another file**. The precomputed hash travels in `createPendingBook` (row born with a real hash) and `KEY_HASH` into `BookUploadWorker` (no second digest pass). Server mirror in `docs/supabase-migration-block1.sql`: partial unique index `UNIQUE (owner_id, content_hash) WHERE content_hash IS NOT NULL AND status <> 'error'` + `check_book_duplicate(p_hash)` SECURITY DEFINER RPC. Note: this is the **raw-file** hash — the post-Docling normalized-text hash planned for cross-user reuse (Block 3→4 gate) is a different value with a different job.
2. **Fix 1.2 — No falsy placeholders for unknown values.** `content_hash`: `""` → nullable everywhere (domain `Book`, `BookDto`, `BookEntity` + Room v3→v4 destructive migration, `BookInsert`). `has_heavy_visuals`: SQL `DEFAULT false` dropped (unknown ≠ false — a visual-heavy book must never be silently misclassified). Same class of bug fixed in `UploadDataStore`: pending URI is only written when real; `getPendingUri` maps blank → absent (retry path can no longer read a bogus `""` URI).
3. **Fix 1.3 — Connectivity correctness.** `NetworkMonitorImpl` rewritten: tracks ALL internet-capable networks (not just the default), online = any `VALIDATED` network exists; active reachability probe (HEAD to Supabase `/auth/v1/health`) on offline→online flips + on demand; probe failure calls `reportNetworkConnectivity(network, false)` so the OS revalidates stale flags. New reactive `isMetered` from `NET_CAPABILITY_NOT_METERED` — replaces the one-shot `isActiveNetworkMetered` check that froze the metered banner at screen load.
4. **Fix 1.4 — Pipeline actions bound to connectivity.** Confirm-while-offline defers (`isWaitingForNetwork` + ONGOING banner "upload resumes automatically") because `createPendingBook` performs a live insert before the WorkManager constraint can defer anything; auto-proceeds when online returns. Metered banner requires `isOnline`. Status polling pauses while offline (`observeProcessingStatus` gates on `isOnline`).
5. **Fix 1.5 — Structured JSON logging.** `REPAGE_Log` emits one JSON line per entry (`ts`, `level`, `service`, `correlation_id`, `msg`, optional `err`). `book_id` is the correlation id from the first insert; selection-time logs use a `sel:` scoped id; service tags: `upload_vm`, `book_repo`, `upload_worker`, `file_validator`, `content_hasher`.

### SQL / Backend Setup

```sql
-- Books table schema
CREATE TABLE books (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID REFERENCES auth.users NOT NULL,
    title TEXT NOT NULL,
    author TEXT,
    file_name TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    content_type TEXT NOT NULL,
    content_hash TEXT,
    status TEXT NOT NULL DEFAULT 'uploading',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    reading_goal TEXT,
    language TEXT,
    cover_url TEXT,
    is_duplicate BOOLEAN DEFAULT false
);

-- RLS: Owner-only access
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own books" ON books
    FOR ALL USING (auth.uid() = owner_id);

-- TTL Sweep for stuck uploads (Mantra 1)
-- Recommended to run every 10 mins via pg_cron
-- Step 1: Mark uploads as error if storage object exists (status lost but upload succeeded)
UPDATE books 
SET status = 'error', updated_at = now()
WHERE status = 'uploading' 
AND created_at < now() - interval '2 hours'
AND EXISTS (
    SELECT 1 FROM storage.objects 
    WHERE bucket_id = 'books' AND name = books.id
);

-- Step 2: Delete truly orphaned rows (no storage object = never uploaded or already cleaned up)
DELETE FROM books 
WHERE status = 'uploading' 
AND created_at < now() - interval '2 hours'
AND NOT EXISTS (
    SELECT 1 FROM storage.objects 
    WHERE bucket_id = 'books' AND name = books.id
);

-- Processing profiles (quota tracking)
CREATE TABLE IF NOT EXISTS processing_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) NOT NULL,
    daily_upload_limit INT NOT NULL DEFAULT 3,
    uploads_today INT NOT NULL DEFAULT 0
);

ALTER TABLE processing_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own profile" ON processing_profiles
    FOR ALL USING (auth.uid() = user_id);

-- Storage bucket: create 'books' bucket via Supabase Dashboard → Storage → New bucket.
-- Files are stored at path = bookId (no prefix, no extension).
```

### Deferred Items
- **OPF Metadata Prefill:** EPUB title/author extraction deferred to minimize client-side ZIP complexity for Block 1.
- **Cross-user Cache:** Pipeline output reuse depends on server-side implementation.
- **Push Notifications:** Polling used for status updates in Block 1; WebSocket/Push planned for Block 2.
- **Server-side Security:** Quota enforcement and size guards must be mirrored on the server before public release.

### Block 1 Regression Checklist

After any change touching the upload flow, verify:

1. **Serialization:** `BookDto` serializes to snake_case keys (unit test `BookSerializationTest`); `content_hash` roundtrips as null when unknown.
2. **ProcessingStatus:** Enum values serialize to lowercase strings.
3. **File validation:** PDF magic bytes (`%PDF-`), EPUB mimetype entry, 50 MB size cap, zip bomb protection.
4. **Content hashing:** streamed SHA-256 matches JDK digest (`ContentHasherTest`); hashing state disables the confirm button until resolved.
5. **Pre-upload duplicate:** hash match → dialog (Upload anyway / Choose another file), never silent, never auto-block; "upload anyway" proceeds with the same hash; unique index backs it server-side.
6. **Nullability:** `content_hash` and `has_heavy_visuals` are NULL until genuinely known — never `""`/`false` placeholders.
7. **createPendingBook:** Inserts Supabase row (with real hash when available), upserts Room, persists DataStore — all with structured logs.
8. **WorkManager:** Upload worker starts with `KEEP` policy, survives process death, receives `KEY_HASH` (no re-digest).
9. **Connectivity:** offline confirm → ONGOING banner + auto-resume on reconnect; metered banner only while online; polling pauses offline.
10. **Reading goal:** Optional field saved to `reading_goal` column.
11. **TTL sweep:** `sweep_expired_books()` cleans orphaned uploads > 1 hour old.

---

## Reading Experience Block A: Retention Foundation (FSRS-6)

### Goals
- Server table `retention_cards` carrying the FSRS-6 scheduling state for starred sections (spec §6, §12.1).
- `sections.slide_kind` discriminator so a Section can act as a slide in either renderer — content vs. client-synthesized system slides — without a new slides table.
- A pure, reference-verified FSRS-6 engine in Kotlin (`domain/retention/Fsrs6.kt`) plus the `ReviewScheduleRepository` data layer (spec §8 names it) with offline-first semantics identical to `setStarred`.
- Unit tests everywhere: golden vectors generated from the reference implementation, serialization contract, repository local behavior, and the pure sync planner.

### Key Decisions & Principles
1. **FSRS-6, per spec.** Spec §6/§12 mandate FSRS-6 (not SM-2/FSRS-4.5). The engine is a faithful port of py-fsrs 6.3.2 (`open-spaced-repetition/py-fsrs`) with default weights (21 params, learned decay w20), mean-reversion anchor D0(Easy), the FSRS-6 forget-stability short-term cap, and short-term (same-day) stability.
2. **Day-granularity configuration.** Reviews are reading-session events, not flashcard flips: learning/relearning steps are DISABLED (first review goes `new → review` directly; a lapse re-derives stability without minute steps), and fuzzing is OFF so schedules are deterministic and testable. At the 0.9 desired retention, the interval equals the stability in days — the designed FSRS invariant, covered by a test.
3. **Client-side scheduling, server-side state durability.** The app runs the scheduler in Kotlin and pushes card state; the server stores state under RLS and never computes FSRS. The scalability addendum's B.1 "FSRS fanout" therefore stays a pure notification concern for Block G.
4. **Section = slide (no new table).** `slide_kind` (`content` | `system_offline` | `system_paywall`) discriminates rendering. System slides are synthesized on-device and live ONLY in the Room mirror — the sync path never uploads them. Unknown future server kinds degrade to content rendering (the §5 STRUCTURING lesson), mirroring `EmphasisStyle.fromServerValue`.
5. **`concept` sentinel `''` = whole-section card.** V1 stars create whole-section cards; the §19.7 concept-level interaction later fills real concept strings. A plain `UNIQUE (user_id, section_id, concept)` (not NULL, not an expression index) keeps PostgREST upsert/ON CONFLICT working and avoids SQLite's "NULLs are distinct" trap in the Room mirror.
6. **Local-first §12.1 contract, same as `setStarred`.** Room is written before any network call; the returned `Result` reflects the remote best-effort outcome and is never a reason to roll local state back. On insert conflict (reinstall / second device) the repository adopts the server row instead of diverging on duplicate keys.
7. **LWW sync by natural key.** `planCardSync` (pure, unit-tested) merges remote cards into Room keyed by (sectionId, concept), id-aware: a newer remote row replaces a stale local twin even when ids differ.
8. **Unknown ≠ 0.** `stability`/`difficulty` are NULL until the first review (Fix 1.2 lesson). `reps`/`lapses` (ts-fsrs-style bookkeeping) are maintained by the repository; a lapse counts only for AGAIN from a review/relearning state.
9. **No pipeline changes.** `finalize_analysis` inserts sections without naming `slide_kind`, so the column DEFAULT backfills every new row; existing rows backfill on migration. Nothing to redeploy.
10. **Room v8 → v9, destructive migration** (local cache only) — consistent with every prior bump.

### SQL / Backend Setup
Migration: `SQL/supabase-migration-blockA.sql` (idempotent — safe to re-run in the SQL Editor).
- `retention_cards`: FSRS-6 state columns + `fsrs_version`, `UNIQUE (user_id, section_id, concept)`, `(user_id, due)` and `(book_id)` indexes, RLS with `"Users can manage their own retention cards" FOR ALL USING (auth.uid() = user_id)`, and the shared `update_updated_at()` trigger.
- `sections.slide_kind TEXT NOT NULL DEFAULT 'content'` + `sections_slide_kind_check` (DO-guarded).

### Deferred Items
- **Review-log table** — the FSRS optimizer needs full review history to tune per-user weights; add when parameter optimization ships (V1 runs default weights, `fsrs_version` column is the upgrade seam).
- **Per-book retention toggle** (§12: on by default, off per book) — lands with the Profile/settings work in Block D; the ProfileScreen's existing retention toggle becomes real then.
- **Concept-level cards** (§19.7 "remember this concept" on emphasized spans) — schema ready (`concept` column), UI later.
- **Due-notification fanout** (addendum B.1) — Block G.
- **Tier differentiation** (§16 basic vs. full FSRS) — subscription work.

### Block A Regression Checklist
After any change touching the retention engine or its schema, verify:
1. **Golden vectors:** `Fsrs6SchedulerTest` all green — the 117 vectors (63 reviews + 54 retrievability points) come from py-fsrs 6.3.2 configured exactly like `Fsrs6`. Any scheduler change either keeps them passing or regenerates them with a documented reason: `pip install fsrs==6.3.2` then `python3 tools/generate_fsrs_goldens.py` (emits `FsrsGoldenVectors.kt` — anchor 2026-01-01T12:00:00Z, epoch-millis offsets).
2. **Serialization:** `RetentionCardSerializationTest` — snake_case wire keys, `''` concept sentinel roundtrip, NULL-able scheduling fields, `slide_kind` lenient decode (missing/unknown → `CONTENT`).
3. **Repository local behavior:** `ReviewScheduleRepositoryImplTest` — star idempotency, FSRS review persistence, lapse counting, unstar removal, due-card filtering, `planCardSync` LWW cases.
4. **RLS:** in the SQL Editor, `retention_cards` must be invisible to a second user (policy scopes `auth.uid() = user_id`).
5. **Room v9:** destructive migration accepted on upgrade (local cache only — same contract as v3→v8 before it).
6. **Pipeline safety:** `pipeline-analyze` still inserts sections (default `slide_kind='content'`) — no edge-function deploy required by this block.

---

## Reading Experience Block B: Book Detail Screen

### Goals
- The Book Detail screen the Library routes to once a book is COMPLETED: book identity + progress header, mode-remembering CTA, Today's dose, offline/cache management (the approved mockup's four areas).
- Device-local reading state with a **real** Room migration: per-book renderer memory, "keep on device" pin, reading position, cache freshness.
- Pure, unit-tested domain calculators for everything the header shows: progress, streak (§13.9 grace model), and the day-one dose heuristic.

### Key Decisions & Principles
1. **Room v10 is a real migration, not destructive.** Every earlier bump only reshaped a server-cache mirror, so wiping it was free. v10 introduces state no server can restore — `books.readingMode/pinned/lastReadAt/lastSyncAt`, `sections.readAt`. A destructive fallback here would silently reset reading progress on upgrade (data loss, not a cache refresh). All future migrations stay real while local-only state exists.
2. **Mode memory is per book and device-local.** `ReadingMode` (DOSE default — the product's dose-first identity; lenient decode like every server vocabulary) persists the instant a segment is tapped. The CTA additionally stamps `lastReadAt` — the §13.7 "most recently opened book" the dose will follow.
3. **Reading position survives re-sync.** `syncReadingData` upserts with REPLACE, but `readAt` is device-local: the sync path now snapshots existing read markers and re-applies them. The status-polling merge likewise preserves mode/pin/position from the local row — a poll can never reset a pin.
4. **Honest counts only.** Chapter/section numbers appear only when the local structure exists (`structureReady`); otherwise the progress card says the structure is still being prepared — per the agreed rule, never a fabricated count. Streak reads `session_log` and stays hidden at zero until reading sessions exist (Blocks D+ own session lifecycle — Block B does not fake engagement).
5. **Dose planning is the §13 day-one heuristic.** `DailyDosePlanner` parses the free-text reading goal ("20 minutes", "2 chapters") into a bounded slide budget (3–10, default 6) at a 40 s/slide cold-start pace, honest ceiling-rounded duration labels. The reading-window engine replaces it once real sessions calibrate `v_average`.
6. **Due reviews come from Block A.** The dose card counts `retention_cards` with a past `due` and a non-null `lastReview` — the FSRS-6 review calendar already live in the server schema.
7. **Cache management is forward-wired for Block F.** "Keep on device" writes `pinned`; content size is the honest on-device byte sum of the cached feed; `lastSyncAt` stamps every successful sync. The eviction order (completed → unstarted overflow → inactive → unpinned; starred sections never evicted) is Block F's to implement — the pin it consumes already exists.
8. **Delete is local-first everywhere.** Confirmed delete removes the local mirror first (a ghost row is worse than a retry-able remote delete), then the server row (FK-cascades chapters/sections/retention cards), storage object, and thumbnail — each step independent, the `cancelUpload` pattern. The screen pops itself when the Room flow emits null; only failures surface a snackbar.
9. **Icons stay Material outlined.** The plan noted Lucide, but the app's established iconography is Material outline (§12.1 "consistent with the branding already established") — consistency wins; a global icon-library swap would be a separate sweep.
10. **Reader route is a marked scaffold.** The CTA navigates to `reader/{bookId}?mode=` backed by a placeholder screen (Home-shell precedent) so navigation, mode memory, and the opened stamp are real from day one; Blocks C–E replace the placeholder.

### Room v10 Schema
- `books`: `readingMode TEXT NULL` ("dose"/"continuous", lenient decode), `pinned INTEGER NOT NULL DEFAULT 0`, `lastReadAt INTEGER NULL`, `lastSyncAt INTEGER NULL` — all device-local, never in `BookDto`.
- `sections`: `readAt INTEGER NULL` (null = unread; unknown ≠ 0).
- Migration: `REPAGEStore.MIGRATION_9_10` (additive ALTER TABLEs), registered in `AppModule` before the destructive fallback.

### Block B Regression Checklist
After any change touching the Book Detail screen or the local reading state:
1. **Room v9 → v10 upgrade:** real migration path — pins, mode memory, and read positions must survive an app update (destructive fallback only fires below v9).
2. **Sync preserves position:** a re-sync of an already-read book must not reset `sections.readAt` or the books-row local fields (the polling-merge copy).
3. **Counts gate on structure:** with no cached sections the progress card shows the awaiting-structure hint, never "Chapter 0 of 0".
4. **Mode memory:** tapping a segment persists immediately; the CTA re-stamps it plus `lastReadAt` and opens the reader in that mode.
5. **Plurals:** every count string uses `<plurals>` (lint PluralsCandidate stays at zero new).
6. **Delete:** local mirror + server row + storage + thumbnail all cleaned; success pops the screen, failure keeps it with a snackbar.
7. **Streak:** pure `ReadingStreak` tests stay green — one forgiven day per rolling week, no premature reset while today is quiet.

## Reading Experience Block C: Immersive Reading Shell

Replaces the reader-route placeholder with the real shell — the container both renderers (D: SlideRenderer, E: BookRenderer) live in. Designed against the approved 4-frame mockup (`blockC-immersive-shell-mockup.png`).

### Key Decisions
1. **The shell owns the chrome; the renderer owns the card.** Edge-to-edge canvas with system bars hidden (transient reveal by swipe, restored on exit), a tap-to-reveal bar (back · book + live position · overflow) over a soft scrim, a whole-card `HorizontalPager` with a fixed single-card snap, and the segmented dose footer. Everything on the card's interior — emphasis, FSRS star, heart, share, auto-swipe timer — is Block D's, delivered as the marked stand-in `ReadingSlideCard` (validated reference layout, minimal interactions: the plain-terms one-tap reveal only).
2. **One tap toggles; a few idle seconds fades.** The bar auto-hides after 4 s (pinned while the overflow menu is open); the tap detector only fires on unconsumed gestures, so swiping the pager, expanding plain terms, or using the menu never toggles the chrome. The coach mark (§18.3) shows on the first reading session only, self-dismisses after 6 s, and persists seen in `reader_preferences`.
3. **Overflow holds display-level settings only (§19.6).** Crimson Pro (bundled variable font, OFL) and the warm reading filter are properties of the display, not of a mode — they apply identically to both renderers. Mode switching stays on Book Detail (Block B's remembered segment). "Book details" pops back. The warm filter is a static amber scrim in C; ambient-brightness adaptation is a later refinement on the same seam.
4. **The pager pages the dose, not the book.** `DoseSelector` (pure) windows the ordered feed: start at the first unread slide (resume), take the planner's budget (Block B's goal heuristic), allow a short final dose, fall back to the last window when everything is read (today's completed dose, revisitable). Footer segments = the dose; the card header carries the §19.4 position ("Chapter N · Section M of K"), degrading to a book-wide label when the chapter can't be resolved.
5. **The invisible payload starts here.** `ReadingTracker` opens the first real `session_log` rows (§21.K — the streak's fuel; `audioEnabled=false`, honestly, until the audio engine ships), logs `session_start`/`session_end`/`nav_forward`/`nav_back` raw events with the §19.4-mandated `surface=in_app` + `renderer_mode=slide|book` context, and stamps `sections.readAt` as slides are crossed. All writes are fire-and-forget on a tracker-owned scope so `endSession` survives `onCleared`'s cancelled scope.
6. **`sectionsOpened` counts unique sections.** The tracker deduplicates re-visits within a session before bumping the store.
7. **Honest states everywhere.** No feed → structure-pending pane (never a fabricated position); continuous mode → explicit pending pane pointing back to dose (Block E ships the scroll). Loading shows only the paper canvas.
8. **§19.5 width cap on the slide card** (~520 dp max, centered; extra space becomes margin, not more characters) and system serif stays the default reading font — Crimson Pro is opt-in, per §19.6.
9. **Cold deep-link into the reader syncs quietly** (online + empty cache guard) — the same policy as Book Detail; Block F owns the background refresh that replaces both.
10. **No schema changes.** Room v10 suffices (`readAt` was already Block B's); the new state is DataStore preferences. Zero server work.

### Block C Regression Checklist
After any change touching the reader shell:
1. **Immersive lifecycle:** bars hidden while the shell shows, restored on exit — including via system Back.
2. **Tap semantics:** empty-canvas tap toggles chrome; pager swipe / plain-terms / menu interaction never does.
3. **Dose window:** resume-from-first-unread, short-final-dose, all-read fallback, and chapter-label degradation stay green (`DoseSelectorTest`).
4. **Telemetry:** slide crossings produce readAt stamps + nav events with surface/renderer_mode context; sessions open once and close on exit.
5. **Prefs:** font/warm-filter toggles persist across process death; coach mark never returns after first dismissal.
6. **Structure-pending:** a book with no cached sections shows the pending pane, not a pager.
