# REPAGE — Block 3: Docling Extraction — Server Runbook

> Implementation record for Block 3 (extraction stage), branch `block3/docling-extraction`. Guarantees on exit: raw extracted text + typed structural markers + image list exist; normalized-hash computed; `book_content_master` written; the cross-user gate ran. No interpretation, no LLM — only deterministic outputs (`has_heavy_visuals`, page-count cross-check).

## What was deployed

### Migration `block3_extraction`
- `pipeline_jobs` += `payload`, `parent_job_id`, `batch_index` (**fan-out-ready columns** — the layer itself is Block 3b), **`claim_heartbeat_at`**, `claimed_by`.
- `book_content_master` += `extracted_text` (TOAST-compressed; §6/§7 offsets point into it), `docling_items` (whitelist-filtered items with per-item offsets + page provenance, `schema_version: 1`), `confidence` (Docling's `mean_grade`/`low_grade` + component scores), `docling_page_count`, `pictures_count`, `tables_count`, `docling_version`.
- `books.master_hash` — the governing master for this book (its own raw hash, or another edition's when the normalized hash matched first).
- **`requeue_stale_pipeline_jobs` rewritten**: claims go stale only when the **claim heartbeat** stops (5 min validate / 10 min extract) — fixed wall-clock windows were correct only for the seconds-long validate stage. Books in `extracting` TTL-kill at 30 min without heartbeat.
- **Admission**: trigger on `status → 'extracting'` (Block 2's worker success transition) enqueues the `extract` job — the client can never inject or skip the stage.
- **Agent RPCs** (SECURITY DEFINER, revoked from `anon`/`authenticated` — service role only): `claim_extract_jobs(instance_id, batch)` (SKIP LOCKED + claimed_by stamp), `touch_extract_heartbeat(job_id)` (jobs + books), `settle_extraction(...)` (the **Block 3→4 gate**: `pg_advisory_xact_lock(hashtext(normalized_hash))`; a different-edition master with the same normalized hash is **linked, never duplicated**; otherwise upsert the master under the lock; advance book to `structuring`; finish job — all atomic).

### The agent — `pipeline/agent/repage_extract.py` (canonical)
- Thin HTTP client: claims via RPC, downloads from Storage (service key), converts **in-process** with Docling, gates via `settle_extraction`. Ledger atomicity never leaves SQL.
- **Fast path at claim**: raw `content_hash` hit on a `done` master → skip Docling entirely, jump to `structuring` (identical file ⇒ identical normalized text).
- Docling request policy (researched): `do_ocr=true`, `do_table_structure=false` (regions still detected → `technical_dense` signal), `do_pdf_heading_hierarchy=true` (+parsed pages), CPU/AUTO accelerator, `document_timeout=900s`, `max_num_pages=500`, `max_file_size=50MB`.
- Label whitelist (real Docling labels, not the spec's informal names): headings `title`/`section_header`, body `text`/`paragraph`/`list_item`; `content_layer='body'` only. Normalization: NFKC + whitespace collapse → SHA-256 = `normalized_hash`.
- `has_heavy_visuals` heuristic (deterministic): pictures/page ≥ 1.5 (min 8) or ≥ 40 total. Constants documented, adjustable.
- Failures: transient (`storage_unavailable`, timeouts) → requeue ≤3 attempts; permanent → `error` + user-safe message. Heartbeat thread (30 s) covers multi-minute conversions.
- Legacy guard: books without `content_hash` (pre-Fix-1.1 rows) fail permanently with an actionable message.

### Test harness — `pipeline/kaggle/REPAGE_Block3_Kaggle_Agent.ipynb`
Self-contained Kaggle notebook embedding the canonical module (generated from it — keep in sync during the test phase). GPU test bench (T4/P100) while the Oracle card situation is unresolved; the agent backend is swappable by config (`SUPABASE_URL` + service key only). HF Spaces (2 vCPU/16 GB, Docker) is the standing-endpoint alternative; Kaggle GPU quota (30 h/week) beats Colab.

## Live verification (2026-09-11)
- **Caught & fixed a real Block 2 bug**: the drain cron had been failing every minute — pg_net's timeout parameter is `timeout_milliseconds`, not `timeout_msec` (migration `block3_cron_fix`). Discovered because a real user upload sat queued.
- **Live hand-off verified with that upload**: `validate` → done (attempt 1, no errors) → book `extracting` → **new trigger enqueued the `extract` job** (queued, awaiting the Kaggle agent).
- RPC probes: empty claim returns cleanly; all 5 pipeline functions present; search_path pinned.

## What the user must run on Kaggle (test phase)
1. Open the notebook → Settings → Accelerator → **GPU T4 x2**.
2. Add-ons → Secrets: add `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (service_role).
3. Run cells 1–5 (install, secrets, GPU check, module, warm-up).
4. Cell 6: `run_agent(max_books=1)` — one book (the queued extract job above is waiting).
5. Cell 7: `run_agent()` — continuous drain while the session lives.
6. Verify: `SELECT status, master_hash FROM books;` → `structuring`; `SELECT length(extracted_text), docling_page_count, confidence->>'mean_grade' FROM book_content_master;`
7. Cache test: add a second book row with the same `content_hash` → re-run → log shows `CACHE HIT`, no re-extraction.

## Deferred (Block 3b)
Fan-out page-batching: columns shipped, logic not built. Trigger: > ~250 pages + idle fleet capacity; `page_range` children + assembler job + overlap dedup (rapidfuzz) + hierarchy rebuild (pypdf bookmarks).

## Icons note (recorded for Block 5 UI)
Lucide-style outline icons only — heart (like), star (favorite), volume-off (audio toggle), `book-open` (replaces the mockup's emoji). No emoji anywhere (§12).
