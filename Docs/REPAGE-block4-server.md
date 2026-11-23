# REPAGE — Block 4: Gatekeeper (enrichment) — Server Runbook

> Branch `block3/docling-extraction`. The LLM-free enrichment cascade: Layer 1 (file metadata) → Layer 1.5 (Open Library) → Layer 2 (structural heuristic) → Layer 3 (merge tree). **No LLM call in this build** — OpenRouter documented below, plugs in later behind flags.

## What was deployed

### Migration `block4_gatekeeper`
- `book_content_master` += `enrichment jsonb` (canonical per-content result + full provenance), `file_metadata jsonb` (Layer 1, captured at extraction while the agent holds the bytes).
- `claim_enrich_job(instance_id, batch)` — SKIP LOCKED, same family as extract claims.
- `finalize_enrichment(job, book, raw_hash, enrichment)` — atomic: advisory lock on the content hash → master already enriched? **copy** (`copied`) : store fresh (`written`) → update the book's `language(±)`, `content_category(±)`, canonical `title`/`author` (verified matches only) → mark wave chapters `enriched` → finish the job. **Per-content cache: Open Library is paid once per content, never per user.**

### The cascade (in `pipeline/agent/repage_extract.py`)
| Layer | Source | Cost |
|---|---|---|
| 1 | EPUB OPF (zipfile, pure Python) / PDF properties (pypdf, lazy) — captured at extraction | free |
| 1.5 | Open Library `/search.json` (verified live: Atomic Habits → James Clear, Self-Help/Psychology/Business subjects), title-similarity ≥ 0.8 match, author verification, `User-Agent: REPAGE/1.0` | 1 request per content |
| 2 | Math-notation density (regex, per 1000 words, threshold 0.5) + pictures/page ratio | free |
| 3 | Merge tree (§6 principle): agree → high; disagree → trust bibliographic + flag 0.3; OL-only → accept; structural-only high → accept; ambiguous → default `narrative_nonfiction` + `disagreement: true` | free |
| LLM | **Not built.** Flagged `layer3_llm_pending: true` in the enrichment blob | later |

### OpenRouter — how to enable later (documented, not built)
1. Create a key at openrouter.ai → store in Vault (`openrouter_api_key`).
2. Layer 3 becomes the cascade's last resort: trigger only when `disagreement` is true (rare). Endpoint: `POST https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer <key>`, economical model.
3. The enrich consumer checks the flag before defaulting — one branch, behind the existing flags.

## Status flow after this block
`extracting → structuring → analyzing` (wave-1 chapters enriched; book rests at `analyzing` until Block 5 delivers slides — `ready` arrives when there's something to read).

## Known caveats (noted, by design)
- **Open Library concurrency**: single-agent V1 is fine; per-service rate limiting arrives with multi-instance (§16.4).
- **Network failure vs. not-found** both degrade to Layer 2 — if a day shows a spike of heuristic-only classifications, check Open Library health in the logs first.
- Books TTL-kill after 30 min without heartbeat — don't leave primed test books unattended; the cron is doing its job.

## Verified live
- Migration applied; both RPCs present; Open Library search returns the expected shape for Atomic Habits (118 results, top = James Clear with SELF-HELP/Psychology/Business subjects → scores `narrative_nonfiction` 3:0:0 in the keyword table).
- Book re-primed fresh (`extracting`, heartbeat set) — the notebook's dual-stage drain picks it up.
