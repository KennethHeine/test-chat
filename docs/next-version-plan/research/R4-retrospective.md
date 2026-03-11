# R4 Research Retrospective

> **Research item:** R4 — Copilot Coding Agent API  
> **Date:** 2026-03-11  
> **Method:** Sub-agent delegation with structured prompts

## What Went Well

- **R3 provided a strong foundation** — the R3 research (Web App → Orchestration Bridge) already covered the core Copilot assignment API. This allowed R4 to focus on deepening and completing the documentation rather than starting from scratch.
- **Existing codebase scripts were invaluable** — `wait-for-agent.ps1` and `wait-for-review.ps1` provided proven polling patterns that sub-agents could reference, giving confidence in the timeline event approach.
- **All 5 sub-agents returned structured, usable results** — the output format specifications (tables, code examples) produced data that required minimal reformatting during synthesis.
- **Clear answer emerged quickly** — the fundamental question ("is there a REST API?") was answered definitively: yes, using standard endpoints with an additive `agent_assignment` field.

## What Could Be Improved

- **Some GitHub docs pages returned HTTP 429** — rate limiting during sub-agent web fetches meant some endpoint reference pages couldn't be verified. Findings for those sections are inferred from R3 research and codebase patterns rather than primary documentation.
- **Bot identity ambiguity remains** — two possible reviewer bot logins exist (`copilot-pull-request-reviewer[bot]` vs `copilot-pull-request-review[bot]`). This can only be resolved by testing against a real PR. Matching both is the safe workaround.
- **`copilot_work_*` timeline events are not officially documented** — their schema is derived from working codebase scripts, not from GitHub's REST API reference. This is a minor risk if GitHub changes the event format.
- **Overlap with R3** — approximately 40% of R4's findings were already covered in R3. Future research items should check for overlap before dispatching to avoid redundant work.

## Key Findings

1. **REST API is sufficient** — no need for GraphQL. All Copilot operations work via standard REST endpoints.
2. **No special feature flags for REST** — the `agent_assignment` field works on standard `2022-11-28` API version.
3. **Public Preview status** — APIs are documented but subject to change. Implementation should be defensive.
4. **Two-phase polling is the only monitoring approach** — no webhook alternative exists for Copilot events.
5. **Fine-grained PAT needs 5 permissions** — metadata (read), actions (r/w), contents (r/w), issues (r/w), pull_requests (r/w).
6. **Copilot reviews are always COMMENTED** — they don't block merging or count toward required approvals.
7. **Agent can only push to `copilot/` branches** — cannot push to main/master directly.

## Process Metrics

| Metric | Value |
|--------|-------|
| Sub-agents dispatched | 5 |
| Parallel batches | 1 (all 5 independent) |
| Files created | 2 (R4 doc + retrospective) |
| Existing research leveraged | R3-web-app-orchestration-bridge.md |
| Codebase files reviewed | 4 (tools.ts, server.ts, orchestrator.agent.md, issue-lifecycle.agent.md) |

## Recommendations for Next Research

- **R5 (Persistent Storage)** should proceed next — execution state persistence is needed for crash recovery during the orchestration loop.
- **Test the open questions empirically** during Stage 5 implementation rather than as separate research — bot identity, `custom_agent` behavior, and error messages all require a real repo.
- **Consider consolidating R3 + R4** into a single reference document for implementers — they cover the same API surface from different angles.
