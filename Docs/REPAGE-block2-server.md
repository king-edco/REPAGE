# REPAGE — Block 2: Security Validation (Server) — Runbook

> Implementation record for Block 2 (pre-Docling security validation), applied to project `zjohneqzixghzawruuzy` via tracked migrations. Block 2 never calls a model and never reads the file's meaning — binary shape only.

## What was deployed

### Migrations (tracked in `supabase_migrations.schema_migrations`)
1. **`block1_upload_fixes`** — had never been run on the live DB: `has_heavy_visuals` default dropped, per-user raw-hash unique index, `check_book_duplicate(p_hash)` SECURITY DEFINER RPC.
2. **`block2_security_validation`**:
   - `books` += `error_stage`, `error_message`, `last_heartbeat_at`; indexes `(status) WHERE status IN ('uploading','validating')` and `(owner_id, status)`.
   - **`pipeline_jobs`** — the durable job queue (ledger): `FOR UPDATE SKIP LOCKED` claim, partial unique index `UNIQUE (book_id, stage) WHERE status IN ('queued','processing')` for idempotent enqueue, `attempts`/`last_error` for observability.
     - *pgmq was evaluated and deliberately not used*: its visibility/archive mechanics duplicate what this ledger already provides, and the pipeline chain (spec §16.2) is book-bound. One source of truth.
   - **`book_content_master`** — cross-user compute-cache registry, **schema-ready but unwritten in Block 2** (Block 3→4 gate owns it). `content_hash` = raw-file key (Block 1), `normalized_hash` = post-Docling key (Block 3).
   - Trigger `trg_books_enqueue_pipeline` — on `status → 'validating'` (insert or update), enqueues a `validate` job. **The client can never inject or skip a stage; only the row transition can.**
   - `requeue_stale_pipeline_jobs()` — reclaims claims whose worker died (10 min, ≤5 attempts), fails exhausted jobs onto the book, TTL-kills books whose `last_heartbeat_at` is >15 min stale (heartbeat principle, scalability A.2 — no wall-clock guessing on live work).
   - `sweep_expired_books()` rewritten — client-stage (`uploading`) wall-clock rule kept; server-stage rows governed by heartbeat.
   - pg_cron (every minute): `drain-pipeline-jobs` → HTTP-invokes the worker; `requeue-stale-pipeline-jobs` → recovery pass.
   - Vault secrets: `pipeline_worker_secret`, `pipeline_worker_url` — read at execution time, never inlined in SQL.

### Edge Function: `pipeline-worker` (v3)
- `supabase/functions/_shared/validation.ts` — pure validation (deno-testable):
  - PDF: sequential stream scan, O(1) memory, boundary-aware `/Type /Page` marker counting + `/Pages /Count` fallback + `/Encrypt` detection;
  - EPUB: central-directory walk (no full decompress), per-entry 10 MB cap, 20 MB total budget, 20k entry cap, zip64 rejected, only `mimetype`/`container.xml`/OPF inflated;
  - page limit: > 500 → reject (spec §2); spine `<itemref>` count for EPUB; marker count for PDF (null when object-stream packed → allowed, Block 3 cross-checks);
  - `VALIDATION_TIMEOUT_MS = 60_000` hard timeout via `AbortSignal`.
- `supabase/functions/pipeline-worker/index.ts` — auth (Vault-backed `x-worker-key` header, constant-time-enough compare), claim → heartbeat (30 s) → validate → advance:
  - ok → `page_count_estimated` filled, `status='extracting'` (Block 3 hand-off; its migration will consume it exactly like this stage consumed `'validating'`);
  - permanent failure → `status='error'`, `error_stage='validate'`, `error_message` = user-safe sentence;
  - transient failure (`storage_unavailable`, `validation_timeout`) → requeue, ≤3 attempts.
- `verify_jwt=false` is deliberate: pg_net cannot mint Supabase JWTs — the Vault-backed shared header IS the gate. The worker's DB/storage access uses the platform-injected `SUPABASE_SERVICE_ROLE_KEY` (never leaves the server).

## Smoke-test results (live, 2026-09-10)
| Path | Result |
|---|---|
| No auth header | `401` ✅ |
| Real 6.15 MB PDF (Atomic Habits) | claimed → `status='extracting'`, `page_count_estimated=285`, heartbeat set, job done attempt 1 ✅ |
| Missing storage object | claimed → `error_stage='validate'`, user-safe message, job failed ✅ (after catching Storage's 400-not-404 missing-object quirk — now handled by body inspection) |
| First run's 4-byte head sniff bug | found & fixed (8-byte sniff for the 5-byte `%PDF-` magic) ✅ |

## Operational notes
- **Security posture (advisor-verified)**: `pipeline_jobs`/`book_content_master` are RLS deny-by-default with all grants revoked from `anon`/`authenticated` — server-internal only. `enqueue_pipeline_job()` is not API-callable at all. `check_book_duplicate(p_hash)` is executable by **authenticated only** (intentional — the client's server-mirror duplicate lookup; internally scoped by `auth.uid()` so it can only ever return the caller's own rows). Accepted residual WARNs: pg_graphql discoverability of `books`/`processing_profiles` (RLS already restricts actual rows; the app needs authenticated SELECT), `pg_net` in the public schema (Supabase-managed placement), and leaked-password protection (Dashboard → Auth toggle).
- **Cron cadence 1 min, batch 3** — the admission-control knobs. Tune batch up as real volume grows; the ledger paces everything.
- **Secret rotation**: rotate by `vault.update_secret` on `pipeline_worker_secret` + redeploy nothing (worker reads Vault live, cached per isolate).
- **Deploying**: Supabase Dashboard/CLI/MCP `deploy_edge_function` with `index.ts` + `_shared/validation.ts` (relative import).
- **i18n note**: `error_message` is currently English server-side; if the app ships multiple languages, persist the machine `ValidationReason` code instead and translate client-side (string resources already mirror the mapping).
- **Block 3 consumes**: `status='extracting'` → Docling workers; on exit compute `normalized_hash`, run the `book_content_master` gate (advisory lock + clone-or-process).