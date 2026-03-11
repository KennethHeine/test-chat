# R8 Research Retrospective

> **Research item:** R8 — Real-Time Progress Updates  
> **Date:** 2026-03-11  
> **Method:** Sub-agent delegation with structured prompts

## What Went Well

- **Codebase-first approach paid off** — reading the existing SSE pattern in `server.ts`, polling scripts in `scripts/orchestrator/`, and frontend `app.js` before dispatching sub-agents meant every sub-question was grounded in real code patterns
- **R3 findings provided critical context** — R3's discovery that Option A (direct REST API) is the recommended approach shaped the entire R8 architecture. The polling + SSE approach directly extends R3's recommendation.
- **Sub-question decomposition was clean** — the 5 sub-questions (polling endpoints, webhooks, SSE bridge, crash recovery, frontend UI) were truly independent and covered all aspects
- **Existing PowerShell scripts were a goldmine** — `wait-for-agent.ps1` and `wait-for-review.ps1` provided a proven polling pattern that translates directly to TypeScript

## What Could Be Improved

- **Some sub-agent results overlapped** — SQ3 (SSE bridge) and SQ4 (crash recovery) had some overlap in execution state design. Could have been one sub-question.
- **GitHub docs were rate-limited for sub-agents** — some sub-agents couldn't fetch live docs (HTTP 429). The results were still accurate from knowledge, but live verification would have been better.
- **Frontend UI research (SQ5) is more design than research** — the UI component sketch is useful but closer to design work than technical research. Future research items should separate "what's technically possible" from "what should the UX look like."

## Key Findings

1. **Polling is viable and sufficient** — 8+ concurrent issues at 20s intervals within rate limits
2. **Adaptive polling is the optimal strategy** — 30s idle / 15s active reduces waste
3. **Webhooks are additive, not required** — they reduce latency from ~20s to ~1s but add infrastructure complexity
4. **Heartbeats are essential** — Azure Container Apps has a 240s idle timeout; 30s heartbeats prevent disconnection
5. **Checkpoints + cursor enable stateless reconnection** — the client saves the last checkpoint to localStorage and reconnects with a cursor parameter
6. **The existing SSE pattern extends naturally** — same headers, same `res.write()`, same `fetch` + `getReader()` on the client
7. **Execution state needs only ~7 writes per issue** — persisted on step transitions, not polling ticks

## Process Metrics

| Metric | Value |
|--------|-------|
| Sub-agents dispatched | 5 |
| Parallel batches | 1 (all 5 independent) |
| Files created | 2 (R8 doc + retrospective) |
| Codebase files read | 7 (server.ts, tools.ts, app.js, wait-for-agent.ps1, wait-for-review.ps1, trigger-ci-label.ps1, R3 doc) |
| Existing research leveraged | R3 (web app → orchestration bridge) |

## Recommendations for Next Research

- **R5 (Persistent Storage) is a direct dependency** — the execution state model defined here needs R5's storage schema to be implemented
- **Prototype the polling loop early** — translate `wait-for-agent.ps1` to TypeScript as a standalone module before integrating with SSE
- **Test Azure Container Apps SSE duration limits** — the heartbeat addresses idle timeout, but a hard ceiling on total connection duration may exist
- **Consider `EventSource` API for the execution stream** — if the endpoint is changed to GET (with query params), the browser's native `EventSource` handles auto-reconnection. However, POST with fetch+reader matches the existing chat pattern better.
