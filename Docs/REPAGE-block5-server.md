# REPAGE — Block 5: Semantic Analysis (simplified pipeline) — Server Runbook

> Branch `block3/docling-extraction`. The redesigned analysis stage: chapter = analysis unit, one structured LLM call per unit, arithmetic size check, heuristic split (no embeddings). Deploys on the existing queue infrastructure.

## What was deployed

### Migration `block5_sections`
- **`sections` table** (§9/§11 shape): `chapter_id`, `order_index`, `adapted_text` (NOT NULL), `clear_explanation`, `sentence_curve jsonb` (compact `[difficulty, valence, arousal]` tuples per sentence), `theme`, `concepts`, `entities`, `importance`, `audio_description`, `continuity_summary`, `size_class`, `fact_check_flag`, `schema_version`. RLS: owner read.
- **`chapters`** += `summary`, `key_concepts`, `parent_chapter_id`, `segment_index`, `end_arousal`, `end_valence` (the chaining contract between units).
- **`claim_analyze_job(instance_id)`** — SKIP LOCKED, and **enforces in-order chaining in SQL**: a unit is claimable only when no earlier chapter/segment in the book lacks a `summary`. No job can run ahead of its predecessor's output.
- **`finalize_analysis(...)`** — atomic: insert sections → chapter `slides_ready` (+ summary/key_concepts/end states) → finish job → **book flips `completed` when the depth-policy count of top-level chapters is `slides_ready`** (C.2 — the user starts reading while later chapters still process).
- Cron `drain-analyze-jobs` (every minute) → POSTs the Edge Function with the Vault-backed `x-worker-key`, 120s timeout.
- Vault `pipeline_analyze_url` → `.../functions/v1/pipeline-analyze`.

### Edge Function `pipeline-analyze` (v3, deployed & smoke-tested)
`supabase/functions/pipeline-analyze/index.ts`:
1. **Auth**: Vault-backed `x-worker-key`, constant-time compare. No key → `401` (verified live, 2.7s).
2. **Claim** (`claim_analyze_job`) → fetch unit data (chapter text slice via offsets + previous unit's summary/end-states for chaining, `LEFT JOIN LATERAL`).
3. **Size check — arithmetic, no model**: `tokens ≈ chars/4`, `slides ≈ words/250`. Ceiling: 9k tokens / 10 slides per unit.
4. **Split (rare path)**: cut at the paragraph boundary nearest the midpoint (`\n\n` scan), iterated with a 6-segment cap. No embeddings, no coherence scoring.
5. **ONE OpenRouter call per segment**: `temperature: 0`, **strict `json_schema` response format** (`response_format.json_schema.strict: true`), model default `google/gemini-2.5-flash-lite` (overridable via `OPENROUTER_MODEL` secret), 120s abort timeout.
6. **Defensive parse**: fence-strip → JSON.parse → per-slide coercion (`sentence_curve` objects→tuples), `adapted_text` required. **One retry with the parse error fed back** for non-transient parse failures.
7. **Free fact-check flags**: a slide citing digit sequences absent from the source text is flagged `fact_check_flag = true` — never auto-dropped.
8. **Finalize** via `finalize_analysis` RPC. Heartbeat every 20s during LLM calls. Transient errors requeue ≤3 attempts; permanent → chapter `error`.
9. **Missing-key behavior**: `OPENROUTER_API_KEY` absent → releases claimed jobs, returns `503 {"reason":"openrouter key missing"}` — **verified live**. Jobs are never lost, just paused.

### Reading-goal & cache boundary (documented decision)
`reading_goal` enters the **analyze** prompt → analysis is per-user, per-book. The `book_content_master` cache covers extraction + enrichment only (the shared, deterministic parts). **Do not extend the master cache to sections** — slides are goal-aware and per-user by design.

### Concurrency constraint (documented decision)
Chaining means chapter N+1's call needs chapter N's output. `claim_analyze_job` enforces the order in SQL; the drain loop therefore effectively serializes within a book and parallelizes across books.

## ⚠️ Action required — enable OpenRouter
1. Create a key at openrouter.ai.
2. Dashboard → **Edge Functions → Secrets** (or CLI `supabase secrets set`) → `OPENROUTER_API_KEY=<key>`. Optionally `OPENROUTER_MODEL` (default `google/gemini-2.5-flash-lite`).
3. Until then, analyze jobs queue safely (cron POSTs get the 503 release every minute — harmless).

## Full chain now (end to end)
```
uploading → validating (Block 2 cron) → extracting (Kaggle agent)
  → chapters detected + wave planned (depth+2) → analyzing
  → enrich (Kaggle agent: OL + heuristics) → finalize_enrichment
  → analyze jobs enqueued per chapter → cron → pipeline-analyze → sections
  → book 'completed' at initial_depth  ← user starts reading here
```
## Verified live (this build)
- Endpoint: `401` without key; with Vault key → `503 openrouter key missing` (jobs released, none lost).
- Trigger chain: book re-primed `error → extracting` auto-enqueued a fresh extract job (idempotent dedup held against the old `done` job).
- TTL sweep confirmed working (it swept a primed book left without heartbeat — re-primed successfully; the sweep is the safety net, not a bug).
