# REPAGE — Addendum: Operational Excellence (Observability, Rollout, Disaster Recovery)

> Complement to `REPAGE-book-audio-pipeline-spec.md` and `REPAGE-scalability-addendum.md`. Those two documents cover architecture; this one covers what lets you **detect and react quickly** when something breaks in production — the difference between a 5-minute incident and a 5-hour incident is almost never the architecture, it's the operational tooling around it.
>
> **Starting principle, same honesty as the other two documents**: no enterprise SRE theater for an app that's just starting out. The goal is discipline, not infrastructure — WhatsApp ran a billion users with 50 engineers because every decision was deliberately simple to operate, not because they had a sophisticated control tower.

---

## A. Observability — knowing what's happening before a user reports it

### A.1 — Structured logs from the MVP onward

**Problem avoided**: unstructured free-text logs are impossible to filter/search effectively once there's volume — and migrating to structured logs after the fact means rewriting every existing log point.

**Recommendation**: JSON format from the very first log written, never free text. Systematic fields on every entry: `timestamp`, `level`, `service`/`worker`, `book_id`/`user_id` where relevant, `message`. Near-zero implementation cost if done from the start, high migration cost later.

### A.2 — A `correlation_id` that runs through the whole pipeline

**Problem avoided**: a book goes through upload → extraction → chapter detection → chunking → semantic analysis → validation, each potentially on a different worker. Without a shared identifier, debugging "why is this particular book stuck" means manually cross-referencing separate logs.

**Recommendation**: generate a `correlation_id` (can be the `book_id` itself, or a per-processing-run ID if a book is reprocessed) and propagate it into **every** log at **every** stage. No need for a full distributed tracing system (Jaeger/Zipkin) at launch — a simple, filterable identifier in the logs is plenty at this stage.

### A.3 — Metrics: the bare minimum needed, not everything

**Recommendation**: three categories, no more, to start with:
- **Latency/throughput per pipeline stage** (average extraction time, average semantic analysis time) — to spot which one is drifting before it blocks everything.
- **Error rate per stage** — not a single global "pipeline errors" figure, but per stage, so you know where it's breaking.
- **Cost per book processed** (LLM calls, Docling, CLAP) — directly tied to section 16.4/17.4 of the main spec (the real cost per book is still unknown; these metrics are what let you calculate it instead of guessing).

**Not to do right now**: exhaustive dashboards on everything measurable. A dashboard nobody looks at is worthless — 5 metrics checked every week beat 50 that are ignored.

### A.4 — Threshold-based alerting, not just passive dashboards

**Problem avoided**: a dashboard doesn't actively warn anyone — someone has to look at it to discover a problem, often after users have already noticed.

**Minimal recommendation**: alerts (Slack/email/SMS depending on severity) on a small number of critical thresholds:
- A pipeline stage's error rate exceeds X% over a sliding window.
- The queue keeps growing without draining (a sign workers can't keep pace).
- Daily LLM cost exceeds a pre-defined threshold (protection against a bug that loops calls).
- The circuit breaker (E.1 of the scalability addendum) opens — that's a signal an external dependency is down, not just another metric.

---

## B. Feature flags & progressive rollout — never deploy a risky change to 100% at once

### B.1 — A flagging mechanism, even a simple one

**Recommendation**: no need for a dedicated tool (LaunchDarkly, etc.) at launch — a Supabase table (`feature_flags`: name, rollout percentage, enabled/disabled) is plenty. What matters isn't the tool, it's **having a switch** for any feature that touches the processing pipeline or the audio engine.

### B.2 — Progressive rollout for pipeline changes

**Direct application to REPAGE**: a change to the restructuring system prompt, a new version of the semantic chunking algorithm, a Cognitive Load Controller adjustment — all of that must be testable on a small percentage of newly processed books before being rolled out broadly, never deployed straight to 100% of users. A bad prompt that degrades restructuring quality across 100% of processed books before anyone notices is expensive to fix (mass reprocessing).

### B.3 — Kill switch for any at-risk component

**Recommendation**: the audio engine, in particular, must be killable globally (not just per-user via `audio_enabled`, section 11.0) in case of a production bug — an emergency switch separate from the normal user toggle, actionable without a redeploy.

---

## C. Backup & disaster recovery

### C.1 — Tested backups, not just configured ones

**The most common trap, to explicitly avoid**: turning on automatic backups (Supabase already does this by default on Postgres) and considering the matter closed. A backup that's never been restored in a test is only a hypothesis, not a guarantee — restoration can silently fail for months without anyone knowing until the day it's actually needed.

**Recommendation**: a real, scheduled restore test (e.g., quarterly), not just a one-off at setup time.

### C.2 — RPO/RTO defined, even approximately

**Recommendation**: answer two simple questions, even with rough answers at first:
- **RPO** (Recovery Point Objective) — how much data loss is acceptable in the event of an outage (1 hour of lost data? 1 day?).
- **RTO** (Recovery Time Objective) — how much downtime is acceptable before it becomes a serious business problem.

These two numbers don't need to be perfect — they just need to exist, so technical decisions (backup frequency, recovery architecture) have a concrete target rather than being guessed at during the incident.

### C.3 — The vector store also needs a backup plan

**Link to the scalability addendum (C.3)**: if Postgres and the vector store are two separate systems, each needs its own backup plan — losing only the CLAP/chunking embeddings without losing the relational data would be an easy-to-forget partial-failure scenario, but it still breaks an entire book (audio and chunking depend on those embeddings).

### C.4 — Version the processing, not just the data

**Direct application to REPAGE**: if a prompt bug corrupts the restructuring quality of a batch of books, being able to roll back to the previous version of the generated `Chapter`/`Section` (via `processing_version`, already introduced in the scalability addendum C.1/C.2) is a form of disaster recovery at the product level, not just the infrastructure level.

---

## D. Incident management

### D.1 — Minimal runbooks for predictable failures

**Recommendation**: not an exhaustive manual — a short sheet (a few lines) per predictable failure identified in the other two addenda: LLM provider down (circuit breaker open), queue exploding, Supabase unavailable. Each sheet answers a single question: "what do we do in the first 10 minutes?"

### D.2 — On-call proportional to team size

**Realistic recommendation**: at this stage, "on-call" probably means an alert going straight to the founder(s)' phone for critical thresholds (A.4) — not a team rotation system. What matters isn't the sophistication of the on-call system, it's that **a critical outage can't go unnoticed** for hours for lack of an active alert.

### D.3 — Blameless post-mortem after every notable incident

**Recommendation**: after every incident that affected users, a short document — not to assign blame, but to avoid repeating it: what broke, why, what changes so it doesn't happen the same way again. A habit worth building early, before incident volume makes it hard to keep up as a discipline.

### D.4 — A minimal status page

**Recommendation**: even a very simple page (could be a plain social media post/a static site) to communicate during an outage visible to users — honest, fast communication beats silence that leaves people guessing.

---

## E. Ongoing operational security

### E.1 — Secret/API key rotation

**Direct link to what we've already been through in this conversation**: `google.webClientId`, Supabase keys — all secrets must be regeneratable/rotatable without breaking the service, and that procedure must be documented before it's needed in an emergency (typically after a suspected leak), not improvised on the spot.

### E.2 — Anti-abuse rate limiting at the API level

**Distinct from the cost-related rate limiting already in place (main spec section 16.4)**: that one protects the LLM budget; this one protects the API itself against abusive use (scraping, account spam, credential-stuffing attempts against auth) — two different concerns that can share the same technical mechanism but not the same threshold policy.

### E.3 — Audit logs on sensitive actions

**Recommendation**: subscription tier change, account deletion, email change — actions that must leave a queryable trail, separate from normal application logs, useful both for user support and for a security investigation.

---

## Recommended prioritization

| Priority | Items | Why |
|---|---|---|
| **Before any public launch, even beta** | A.1, A.2 (structured logs + correlation_id), C.1 (tested backups), D.1 (runbooks for predictable failures) | The cost of having these from the start is near zero; the cost of debugging a real incident without them is high and hits at the worst possible time. |
| **As soon as the pipeline processes real volume** | A.3/A.4 (metrics + alerting), B.1/B.2 (feature flags, progressive rollout) | Become necessary as soon as a change can affect more than a handful of books at a time. |
| **Can follow growth** | C.2/C.3/C.4, D.2/D.3/D.4, E.1/E.2/E.3 | Useful early but not blocking — to formalize as the team/volume grows, not to over-build in advance. |

---

*Document generated as a complement to `REPAGE-book-audio-pipeline-spec.md` and `REPAGE-scalability-addendum.md`. Same principle as the other two: meant to evolve, not to be treated as final.*
