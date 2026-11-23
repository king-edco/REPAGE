# REPAGE — Addendum: Scalability & Robustness Concerns

> Complement to `REPAGE-book-audio-pipeline-spec.md`. This document consolidates issues identified during a cross-review of the pipeline against classic large-scale distributed systems patterns (starting point: the classic "presence system" problem — how WhatsApp handles "online"/"last seen" for 3 billion users). Each item cites the relevant section of the main spec.

---

## A. State synchronization & session end without a clean signal

### A.1 — Cross-device reading-progress sync (`current_section_id`)

**Problem**: syncing reading position on every swipe/scroll to enable "resume where you left off" on another device would write to the database at an absurd frequency at scale.

**Important clarification**: this does **not** concern `arousal_final(t)` or the cognitive-load calculation — those computations remain strictly local to the device (section 13.2), nothing is sent to the server for that.

**Recommended solution**:
- Immediate, free local write (Room) on every change.
- **Debounced** server sync: every 30s during active reading, OR on section change, OR when going to background — never on every scroll. Tiny payload (`section_id` + timestamp).
- Multi-device conflict: no CRDT (over-engineering here — a single user, never real concurrent editing). **Last-writer-wins with optimistic versioning**: a `version` column incremented on every write, conditional update `WHERE version = expected_version`, silent rejection if another device has already written a more recent version. Avoids the classic client-timestamp bug (clocks out of sync between two phones).

### A.2 — Generalize the TTL principle to any session without a clean close

**Problem**: you can never guarantee a "clean" close event will arrive (app killed, battery pulled, network lost mid-session). Waiting for that signal to finalize state can block the system indefinitely in some cases.

**Already partially in place**: section 13.7 applies this principle to the media session ("the session is released after an inactivity delay rather than waiting for a close event"). To be generalized.

**Recommended solution**: one principle, several applications — every periodic sync (A.1) **is** the heartbeat. No heartbeat within a window X = session considered ended server-side, without depending on an explicit close signal. Implementation: a key with `EXPIRE` (Redis) or a `last_synced_at` field + a stale-session sweep job.

---

## B. Fanout & reading at scale — never scan/read proportionally to the total number of users

### B.1 — FSRS-6 reminder fanout (section 12)

**Problem**: potentially millions of users each have a review scheduled at a precise time. A naive database scan ("who's due right now?") every minute explodes at scale.

**Recommended solution**:
- Index on `next_review_at`, sliding-window processing: `WHERE next_review_at <= now() AND next_review_at > last_watermark` — cost proportional to cards due, not to the whole database.
- **Thundering herd** (reminders clustering — everyone reviewing around 8pm at home): add random **jitter** (±15-30 min) to the computed `next_review_at`.
- At large scale, consider a sorted set (score = due timestamp, `ZRANGEBYSCORE` to poll) rather than hitting Postgres directly — a pattern used by deferred-job schedulers (Sidekiq, BullMQ).
- Batch FCM sends rather than N individual calls.

### B.2 — Polling `processing_status` (section 16.1)

**Problem**: the spec proposes "the client polls or receives a notification" as two equivalent options. Polling, if hundreds of thousands of users use it simultaneously while their book is processing, recreates the same problem as WhatsApp presence — repeated reads of a state that rarely changes.

**Recommended solution**: settle on a clear hierarchy, not two equal options — push (targeted WebSocket or FCM data message) as the **primary** mechanism, polling only as a fallback if the push connection fails, with **exponential backoff client-side** (1s → 2s → 4s…, capped), never a fixed interval.

---

## C. Idempotence & data consistency

### C.1 — Idempotence of webhooks & pipeline retries (section 16.2)

**Problem**: Play Billing webhooks (subscription status) and pipeline stage retries are "at-least-once" by nature — the same event can arrive twice. Without protection, risk of double-processing a chapter or mishandling a duplicate subscription change.

**Recommended solution**:
- **Idempotency key** on webhooks: extract a unique identifier from the notification (the RTDN's `messageId`, or the `purchaseToken`+`notificationType` combo), stored with a `UNIQUE` constraint, `INSERT ... ON CONFLICT DO NOTHING` before any processing. Pattern recommended by Stripe for their own webhooks.
- Underlying rule: "exactly-once" delivery doesn't exist in distributed systems — only "at-least-once + idempotent processing."
- For pipeline retries: each stage must produce a result keyed on `(chapter_id, processing_version)` — a re-run overwrites/no-ops, never duplicates.

### C.2 — Failure granularity in the multi-stage pipeline

**Problem**: `processing_status` (section 5) is defined as a linear sequence on `Book` (`uploading → validating → extracting → structuring → ready → error`), but the queue (16.2) processes stages **per chapter/block**. If semantic analysis fails on 1 block out of 40, nothing specifies whether the whole book flips to error or just that block.

**Recommended solution**: **hierarchical** state, not a single field on `Book`. Each `Chapter`/`ProcessingBlock` carries its own status; `Book.processing_status` becomes a computed aggregate (`ready` as soon as the number of chapters required for the user's tier — section 14 — are ready, even if a later chapter is failed/retrying). Aligns directly with the progressive generation already in place.

### C.3 — Consistency between Postgres and the vector store (section 16.5)

**Problem**: the relational store (Postgres) and the vector store (CLAP + chunking embeddings) are correctly separated, but nothing guarantees they stay in sync. If a `Chapter` is deleted or reprocessed, the associated orphaned embeddings may never get cleaned up on the vector side — a dual write with no transaction across two systems, a source of silent drift.

**Recommended solution**: a version reference (`processing_version`) on both sides + a periodic reconciliation job (compare live IDs in Postgres vs. the vector store). Failing that, explicitly document orphaned embeddings as conscious V1 debt rather than an oversight.

---

## D. Cache & compute costs

### D.1 — Content-addressed cache (section 3, semantic pipeline)

**Problem**: if two users each upload their own copy of the same book (e.g., *Meditations*, already in the Library mockup), reprocessing Docling + chunking + semantic analysis twice for identical content wastes the most expensive line item in the system's cost.

**Recommended solution**:
- **Composite cache key**, not just the book hash: `hash(post-Docling normalized text) + user_reading_goal` (+ any other parameter influencing generation, section 5) — forgetting a parameter that influences the output is the most classic caching bug.
- Hash on the **post-Docling normalized text**, not the raw file (two uploads of the same book may differ in formatting without being different content). Unicode + whitespace normalization before SHA-256 hashing; fuzzy-matching between different editions is a V2 topic.
- **Cache stampede**: a lock per `content_hash` (Postgres advisory lock, or a `status: PENDING/DONE` row with a unique constraint) to prevent two simultaneous uploads of the same book from triggering two parallel processing runs — the second one to arrive waits/polls.
- Cloning via a targeted `INSERT ... SELECT` on `Chapter`/`ProcessingBlock`/`Section` only — never on user-specific data (progress, likes, stars).
- **Legal nuance**: this is a compute cache, not content redistribution — each user has uploaded their own legal copy; only the AI work behind it is being optimized.

---

## E. Resilience against external dependencies

### E.1 — No explicit resilience against an external LLM outage/latency spike (section 16.4)

**Problem**: the spec covers rate limiting and batch processing, but not an outright outage. The entire pipeline (advanced chunking, semantic analysis) depends on a critical external LLM call — if the provider goes down or responds with 10x latency, no protection mechanism is in place.

**Recommended solution**: a **circuit breaker** (opens after N consecutive failures, stops trying for a window, tests periodically) to avoid flooding the whole queue with jobs doomed to fail the same way, combined with exponential-backoff retry for transient failures. Standard pattern (Polly, resilience4j) — nothing exotic needed.

---

## F. Security

### F.1 — Unvalidated arbitrary file uploads (sections 2, 3)

**Problem**: no security validation mentioned for uploaded PDFs/EPUBs. An EPUB is a ZIP — a zip bomb (a few KB of compressed file that balloons to gigabytes on decompression) can exhaust a worker's memory. A PDF can also target the OCR/parsing process itself. A real attack surface at a million-user scale.

**Recommended solution**:
- A strict limit on the **decompressed** size, not just the uploaded file size.
- A hard timeout on Docling per job.
- Ideally process in an isolated/sandboxed environment (an ephemeral container per job) rather than directly in the worker's context.

---

## Recommended prioritization

| Priority | Items | Why |
|---|---|---|
| **To lay as foundation while building the pipeline** | D.1 (content cache), C.1 (idempotence), C.2 (failure granularity) | Fix an implicit design assumption rather than being an after-the-fact patch — expensive to retrofit once the pipeline is in production. |
| **Before opening up at large scale** | B.2 (polling), E.1 (circuit breaker), F.1 (upload security) | Not blocking at low volume, but become critical as soon as there's real load or public exposure. |
| **Once the relevant module is built** | A.1/A.2 (progress sync), B.1 (FSRS fanout), C.3 (vector consistency) | Depend on features not yet implemented — to integrate at design time, not patch in afterward. |

---

*Document generated from a robustness/scalability review cross-referenced with `REPAGE-book-audio-pipeline-spec.md`. Meant to evolve alongside the main spec — not to be treated as final.*
