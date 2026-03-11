# Research Needed Before Continuing

> This document identifies specific research that must be completed before implementing Stages 4 and 5. Each item has a clear question, why it matters, and a suggested research approach.
>
> Research is categorized by urgency: **BLOCKING** (must resolve before starting the stage) vs. **INFORMING** (improves quality, can be done in parallel).

---

## Critical Finding: Two Disconnected Systems

The biggest architectural gap right now is that **the web app and the agent orchestration are two separate systems**:

| System | Runs Where | Can Do |
|---|---|---|
| **Web app** (server.ts) | Express server, Copilot SDK sessions | Chat, planning tools, GitHub REST API (read only) |
| **Agent orchestration** (.github/agents/) | GitHub Copilot agent runtime | MCP tools: create branches, issues, assign coding agent, request reviews, merge PRs |

The MCP tools (`assign_copilot_to_issue`, `create_branch`, `issue_write`, `request_copilot_review`, `merge_pull_request`) are **only available in the GitHub agent runtime** — not in the web app's Copilot SDK session.

**This means the web app cannot directly start execution.** The current orchestration process works when invoked as a GitHub Copilot agent (e.g., through `@orchestrator` in a comment or issue), but the web app has no way to trigger it.

This is the #1 question to resolve.

---

## BLOCKING Research (Must Complete Before Stage 4)

### R1: GitHub REST API for Write Operations ✅ COMPLETE

> **Status:** COMPLETE — 2026-03-11. See [R1-github-rest-api-writes.md](./research/R1-github-rest-api-writes.md) for full findings.

**Question:** What GitHub REST API endpoints exist for creating Issues, Milestones, Labels, and Branches? What request format, permissions, and rate limits apply?

**Why it matters:** The web app needs to push planning data to GitHub. The current `tools.ts` only has read tools. We need write tools using the same `githubFetch(token, path)` pattern.

**Key Findings:**
- All needed endpoints exist as standard REST API — no GraphQL required for write operations
- Only **2 PAT permissions** needed: Issues (write) + Contents (write)
- Labels return `422` with `already_exists` code on duplicate — handle idempotently
- Branch creation is 2-step: GET base SHA, then POST ref
- `labels`/`assignees` on issue update **REPLACE** entirely — must include full desired set
- Silent failures when lacking push access — always verify response matches expectations
- Rate limits generous for typical planning exports (~40 requests well within 5,000/hr primary and 500/hr secondary)
- The existing `githubFetch()` needs a small extension: add a `githubWrite()` helper with method + body support
- 5 new tools proposed: `create_issue`, `create_milestone`, `create_label`, `create_branch`, `update_issue`

**Decision:** Use REST API custom tools via a new `githubWrite()` helper in `tools.ts`, following the existing `createGitHubTools(token)` factory pattern.

**Estimated effort:** 2-4 hours (actual: ~30 minutes using sub-agent delegation)

---

### R2: GitHub Projects v2 (GraphQL API) ✅ COMPLETE

> **Status:** COMPLETE — 2026-03-11. See [R2-github-projects-v2-graphql.md](./research/R2-github-projects-v2-graphql.md) for full findings.

**Question:** How do you create and manage GitHub Projects v2 programmatically? Projects v2 uses GraphQL, not REST — what are the mutations, and what permissions are required?

**Why it matters:** The plan calls for creating GitHub Projects to track milestones. Projects v2 is the current GitHub project management system, but it only has a GraphQL API — no REST endpoints.

**Key Findings:**
- **Fine-grained PATs (`github_pat_`) cannot access user-owned Projects v2** — documented GitHub limitation, no timeline for resolution
- Fine-grained PATs **do** work for organization Projects v2 with `organization_projects` permission
- All GraphQL mutations exist for full CRUD: `createProjectV2`, `addProjectV2ItemById`, `updateProjectV2ItemFieldValue`, `createProjectV2Field`
- Rate limits are generous — typical planning scenario (42 mutations) uses <1% of hourly budget
- Raw `fetch` is the right approach — `githubGraphQL()` helper matches existing `githubFetch()` pattern, zero new dependencies
- Cannot update Assignees/Labels/Milestone via project field API — must use separate REST mutations
- All patterns documented for future implementation if PAT limitation is resolved

**Decision:** **(A) Skip Projects v2 for MVP** — use Milestones + Labels for tracking. The fine-grained PAT limitation is a blocker for personal repos (the primary use case). Milestones + Labels cover the core tracking need via REST-only approach (confirmed by R1). GraphQL patterns are documented in the research file for future use.

**Estimated effort:** 4-6 hours (actual: ~30 minutes using sub-agent delegation)

---

### R3: How to Bridge Web App → Agent Orchestration ✅ COMPLETE

> **Status:** COMPLETE — 2026-03-11. See [R3-web-app-orchestration-bridge.md](./research/R3-web-app-orchestration-bridge.md) for full findings.

**Question:** How does the web app trigger the agent orchestration process? The web app can't use MCP tools (`assign_copilot_to_issue`, `create_branch`, etc.) — those are only available in the GitHub agent runtime.

**Why it matters:** This is the fundamental architecture question. Without answering this, the execution phase (Stage 5) can't be built.

**Critical Finding:** The original assumption that `assign_copilot_to_issue` is MCP-only was **wrong**. GitHub has published **public REST and GraphQL APIs** for Copilot coding agent assignment. This eliminates the need for a GitHub Actions workflow bridge.

**Key Findings:**
- **GitHub has public REST APIs for Copilot coding agent assignment** — `copilot-swe-agent[bot]` is the bot login, used with standard issue assignee endpoints plus an `agent_assignment` body parameter
- **Option A (direct REST API) is viable and recommended** — the web app can orchestrate the entire execution loop without GitHub Actions as a bridge
- **Copilot code review uses standard review request API** — select Copilot from reviewers, same as human reviewers
- **All monitoring patterns already exist** in the codebase (`wait-for-agent.ps1`, `wait-for-review.ps1`) and translate directly to TypeScript
- **MCP server bridge is unnecessary** — REST API covers all needs
- **PAT permissions need upgrading** — users need actions, contents, issues, and pull_requests read+write
- **`@copilot` comments work on PRs** (trigger fixes) but **NOT on issues** (use assignee API for issues)
- Rate budget: 180 API calls/hour per monitored issue at 20s polling; can monitor ~27 issues simultaneously

**Decision:** **Option A — Web App Uses REST API Directly.** No GitHub Actions workflow bridge needed. The web app orchestrates via `githubWrite()` with user's PAT. New components: `execution.ts`, `POST /api/execute` (SSE), `POST /api/execute/abort`.

**Also resolves:** R4 (Copilot Coding Agent API) — the full API surface for Copilot agent assignment was documented within R3.

**Open questions for implementation:**
- Exact reviewer identity for Copilot code review (`copilot-pull-request-reviewer[bot]` vs alternative) — needs live testing
- Does `copilot-swe-agent[bot]` work with fine-grained PATs? — needs live testing
- Does `agent_assignment.custom_agent` work with agents in `.github/agents/`? — needs live testing

**Estimated effort:** 6-8 hours (actual: ~45 minutes using sub-agent delegation)

---

### R4: Copilot Coding Agent API ✅ COMPLETE

> **Status:** COMPLETE — 2026-03-11. See [R4-copilot-coding-agent-api.md](./research/R4-copilot-coding-agent-api.md) for the full deep-dive. R3 research covered the core API surface; R4 added detailed schemas, polling strategy, agent limitations, and code examples.

**Question:** What is the public API surface for interacting with the GitHub Copilot coding agent? Can it be assigned to issues via REST API, or only through the agent runtime's MCP tools?

**Why it matters:** The orchestration loop's core primitive is `assign_copilot_to_issue`. If this is only available as an MCP tool in the agent runtime, the web app can't directly orchestrate execution.

**Key Findings (R3 + R4 combined):**
- `copilot-swe-agent[bot]` is the bot login for the Copilot coding agent
- Assignment via REST: `POST /repos/{owner}/{repo}/issues/{n}/assignees` with `{ assignees: ["copilot-swe-agent[bot]"], agent_assignment: { target_repo, base_branch, custom_instructions, custom_agent, model } }`
- `agent_assignment` fields: `target_repo` (string, optional), `base_branch` (string, optional), `custom_instructions` (string, optional), `custom_agent` (string, optional — references `.github/agents/`), `model` (string, optional)
- Also supports: PATCH (update existing issue), POST (create issue with assignee)
- GraphQL alternative: `addAssigneesToAssignable` with `agentAssignment` (requires `GraphQL-Features` header) — REST recommended for simplicity
- **Two-phase monitoring** — Phase 1: poll *issue* timeline for `cross-referenced` event to discover PR number; Phase 2: poll *PR* timeline for `copilot_work_finished` or `copilot_work_finished_failure` (these events appear on the PR, not the issue)
- **No webhook alternative** — `copilot_work_*` events have no webhook type; polling is the only approach
- **Draft PR as alternative signal** — agent creates draft PRs while working, marks non-draft when done; `copilot_work_finished` is authoritative
- **Review bot identity** — `copilot-pull-request-reviewer[bot]` (primary) or `copilot-pull-request-review[bot]` (alternative); match both for robustness
- **Reviews always COMMENTED** — Copilot never posts APPROVED or CHANGES_REQUESTED; reviews don't block merging
- `@copilot` comments on PRs trigger fixes; on issues, use assignee API
- PAT needs 5 fine-grained permissions: metadata (read), actions (r/w), contents (r/w), issues (r/w), pull_requests (r/w)
- **API is Public Preview** — subject to change; implementation should be defensive
- **Agent limitations**: single repo only, `copilot/` branch prefix, cannot merge/approve PRs, cannot push to main/master
- `copilot_work_*` timeline event schemas are not officially documented — derived from working codebase scripts

**Decision:** REST API is fully available. No MCP bridge or Actions trigger needed for Copilot agent assignment.

**Open questions (verify during Stage 5 implementation):**
- Exact reviewer bot login (match both for safety)
- Does `custom_agent` in REST `agent_assignment` reference `.github/agents/` files?
- Rate limiting on rapid `agent_assignment` calls
- Can review be requested before PR is non-draft?
- Does `model` parameter work via REST API?

**Estimated effort:** 4-6 hours (actual: ~0 additional beyond R3 for core findings; R4 deep-dive added ~30min for schemas and code examples)

---

### R5: Persistent Planning Storage ✅ COMPLETE

> **Status:** COMPLETE — 2026-03-11. See [R5-persistent-planning-storage.md](./research/R5-persistent-planning-storage.md) for full findings.

**Question:** How should planning data be persisted? The current `InMemoryPlanningStore` loses all data on server restart.

**Why it matters:** For a real project management app, users need planning data to survive server restarts, deployments, and scaling events.

**Key Findings:**
- **Azure Table Storage is the clear choice** — zero additional infrastructure, proven pattern in `storage.ts`, all fields fit within limits
- **Separate tables per entity type** with foreign key PartitionKeys: `plangoals` (PK=sessionId), `planresearch` (PK=goalId), `planmilestones` (PK=goalId), `planissues` (PK=milestoneId)
- **All fields fit in Table Storage** — no blob offload needed (worst case ~80 KB per entity, limit is 1 MiB; largest string property ~15 KB, limit is 64 KiB)
- **Array properties** (successCriteria, assumptions, etc.) serialized as JSON strings
- **node:sqlite eliminated** — data lost on scale-to-zero, SQLite on Azure Files SMB is risky, architectural inconsistency with existing Table Storage usage
- **Zero interface changes** — `PlanningStore` interface stays the same; add `AzurePlanningStore` class + `createPlanningStore()` factory following `storage.ts` pattern
- **Per-user isolation** handled at API layer via `getOwnedGoal()` — no `tokenHash` in PlanningStore needed
- **Cost negligible** — <$0.01/month for typical planning operations
- **No Bicep changes required** — existing storage account supports unlimited tables

**Decision:** Use **Azure Table Storage** with separate tables per entity type and composite PartitionKeys for efficient foreign key queries. Follow the `AzureSessionStore` → `InMemorySessionStore` pattern exactly.

---

## INFORMING Research (Improves Quality, Can Parallel)

### R6: GitHub Copilot SDK — Unused Features ✅ COMPLETE

> **Status:** COMPLETE — 2026-03-11. See [R6-sdk-unused-features.md](./research/R6-sdk-unused-features.md) for full findings.

**Question:** Which unused Copilot SDK features could improve the planning experience?

**Why it matters:** The SDK has many unused capabilities that could enhance the user experience.

**Key Findings:**
- **MCP Server Integration: Skip** — native `Tool` handlers in `tools.ts` are simpler, faster (no IPC), and already proven. MCP adds separate-process complexity without proportional benefit. Revisit only if tools need to be shared across MCP clients (VS Code, Claude Desktop).
- **User Input Requests: Implement** (High value, Medium effort ~100 lines) — `onUserInputRequest` callback enables structured choices mid-conversation via the `ask_user` built-in tool. Requires SSE↔POST bridge: new `POST /api/chat/input` endpoint + pending-Promise pattern on the server + choice/freeform UI on the frontend.
- **Session Resumption: Improve fallback** — already partially implemented (`resolveSession()` + `resumeSession()`). Gap: Docker ephemeral filesystem kills CLI state. Fix: message replay into fresh sessions when `resumeSession` fails. Also add `session.disconnect()` for idle cleanup.
- **Reasoning Effort Control: Implement** (Medium value, Low effort ~50 lines) — `o4-mini` supports 4 levels (`low`/`medium`/`high`/`xhigh`). Show conditional dropdown when model supports `reasoningEffort`. Pass in `createSession()` config. Stream `assistant.reasoning_delta` as collapsible "Thinking..." section. Costs premium requests — users should be aware.
- **File/Image Attachments: Defer** — server-side file paths only (no inline/base64). Full upload needs multipart endpoint + temp file management. Use code-paste (selection attachment) as MVP instead.
- **BYOK & Custom Agents: Skip** — gpt-4.1 at 0 premium requests is unbeatable. Custom agents add abstraction without proportional value over system message + tool gating.
- **Planning Events: Implement** (High value, Low effort ~85 lines) — **Critical correction:** `planning.started/end` events listed in sdk-reference.md **don't exist**. Real events: `session.mode_changed`, `session.plan_changed`, `exit_plan_mode.requested`, `assistant.intent`, `subagent.*`, `session.compaction_start/complete`. All follow the existing `session.on()` → SSE pattern.
- **sdk-reference.md Section 8 is outdated** — 7 entries list features as "unused" that are now implemented (custom tools, hooks, events, system message, session resumption, permission handler). Needs update.

**Decisions:**
- Tier 1 (Implement Now): Planning/intent events, reasoning effort control, compaction events
- Tier 2 (Implement Soon): User input requests, session disconnect + idle timeout, message replay fallback
- Tier 3 (Defer): File attachments, reasoning delta streaming UI
- Tier 4 (Skip): MCP, BYOK, custom agents, fleet mode

**Also resolves:** R10 (MCP Server Architecture) — R6 confirmed MCP is not the right approach for GitHub write tools.

**Estimated effort:** 4-6 hours (actual: ~30 minutes using sub-agent delegation)

---

### R7: GitHub Actions Workflow Dispatch ✅ COMPLETE

> **Status:** COMPLETE — 2026-03-11. See [R7-github-actions-workflow-dispatch.md](./research/R7-github-actions-workflow-dispatch.md) for full findings.

**Question:** How do you trigger a GitHub Actions workflow programmatically and pass parameters? How do you monitor its progress?

**Why it matters:** Supplementary capability — R3 chose Option A (direct REST API), so workflow dispatch is not needed for core orchestration. Findings are useful for CI triggering and potential batch/long-running operations.

**Key Findings:**
- `workflow_dispatch` returns 204 with no body — **no run ID returned**. Max 10 string-only inputs.
- `repository_dispatch` allows nested JSON payloads and multi-workflow fan-out — **preferred over `workflow_dispatch`** for programmatic use
- Run ID correlation requires a `correlation_id` UUID input + polling — only race-condition-free approach
- Run monitoring: poll `GET .../actions/runs/{id}` — statuses: `queued`→`in_progress`→`completed`; 6 conclusions including `failure`, `cancelled`, `timed_out`
- Logs: `GET .../runs/{id}/logs` → 302 redirect to zip. Artifacts: list + download by ID.
- PAT scopes: `actions:read` for monitoring, `actions:write` for dispatch
- Rate limits: 5,000 req/hr; can monitor ~20 concurrent runs at 15s polling (~10 recommended with 50% headroom)
- `workflow_run` webhook event provides push-based monitoring (eliminates polling but requires public endpoint)
- Existing codebase has proven patterns in `scripts/orchestrator/` (timestamp correlation, CI failure extraction)

**Decision:** Workflow dispatch is a **supplementary capability**, not a core dependency. Primary orchestration uses direct REST API (R3 Option A). If dispatch is ever needed for batch/long-running tasks, use `repository_dispatch` with correlation IDs.

**Estimated effort:** 2-3 hours (actual: ~30 minutes using sub-agent delegation)

---

### R8: Real-Time Progress Updates ✅ COMPLETE

> **Status:** COMPLETE — 2026-03-11. See [R8-real-time-progress-updates.md](./research/R8-real-time-progress-updates.md) for full findings.

**Question:** How can the web app show real-time progress of autonomous execution?

**Why it matters:** Users need visibility into what's happening during a 20+ issue execution chain.

**Key Findings:**
- **Polling + SSE is the primary approach** — server polls GitHub API at adaptive intervals (30s idle / 15s active / 60s for no-PR issues), feeds results into SSE stream to the browser using the existing `/api/chat` pattern
- **Webhooks are optional and additive** — reduce latency from ~20s to ~1s but add infrastructure complexity (HMAC-SHA256 verification, public endpoint, webhook registration per repo). Not needed for MVP.
- **Adaptive polling is the optimal strategy** — start at 30s, decrease to 15s when `copilot_work_started` detected, increase to 60s for idle issues; supports ~12 concurrent issues within rate limits
- **Rate budget:** ~540 req/hr/issue at 20s interval; 8+ concurrent issues at 20s, ~12 with adaptive polling
- **Heartbeats essential:** Azure Container Apps has 240s idle timeout; 30s SSE heartbeats prevent disconnection
- **14 SSE event types defined:** `issue-start`, `agent-assigned`, `agent-working`, `pr-created`, `agent-complete`, `review-requested`, `review-complete`, `ci-running`, `ci-result`, `merge-complete`, `issue-complete`, `issue-error`, `escalation`, `heartbeat`, `checkpoint`, `done`
- **Execution state model defined:** `ExecutionStep` type (8 steps + done/failed), `ExecutionState` interface (per-issue), `ExecutionRun` interface (per-milestone-execution)
- **Crash recovery via checkpoints + cursor:** client saves last checkpoint to localStorage, reconnects with cursor parameter; server resumes from persisted step per issue
- **Azure Table Storage for execution state:** `executionruns` table, PK=tokenHash, RK=runId; ~7 writes per issue (on step transitions only)
- **Async generator + AbortSignal** pattern recommended for the server-side execution loop
- **Frontend UI components:** view tabs (Chat/Execution), summary header, milestone accordion, issue cards with step pipeline, event log, control bar (pause/resume/skip/abort), escalation banner

**Decision:** **Polling + SSE (primary), Webhooks (optional enhancement).** Extends existing codebase patterns, requires no new infrastructure, supports crash recovery. Webhooks can be layered on later when latency reduction justifies the setup cost.

**Estimated effort:** 3-4 hours (actual: ~30 minutes using sub-agent delegation)

---

### R9: IssueDraft Quality — What Makes a Good Coding Agent Issue? ✅ COMPLETE

> **Status:** COMPLETE — 2026-03-11. See [R9-issue-draft-quality.md](./research/R9-issue-draft-quality.md) for full findings.

**Question:** What issue format produces the best results from the Copilot coding agent? What information does the agent need to succeed?

**Why it matters:** The entire value proposition depends on generating issues that the coding agent can execute without asking questions.

**Key Findings:**
- **`filesToModify` and `filesToRead` are the most impactful missing IssueDraft fields** — every source (GitHub docs, lifecycle analysis, stage review, industry practices) converged on this
- **Pattern references are the strongest predictor of clean first-pass code** — empirically validated by comparing Issue 2 (with `storage.ts` pattern reference) to frontend issues (6, 9, 12) that lacked one
- **Acceptance criteria must be machine-testable** — "works correctly" causes CI loops; "runs `npx tsc --noEmit` with zero errors" does not
- **Issue scope should target ≤3 hours of human-equivalent work** — larger scopes cause agent timeouts
- **Research context from `researchLinks` is silently dropped** — the issue template has no slot for rendering resolved research
- **Security checklist prevents review fix loops** — specific per-issue validation rules are more effective than generic checkboxes
- **5 new fields recommended for IssueDraft:** `filesToModify: FileRef[]`, `filesToRead: FileRef[]`, `patternReference?: string`, `securityChecklist: string[]`, `verificationCommands: string[]`
- **New `FileRef` interface needed:** `{ path: string, reason: string }`
- **Issue quality checklist defined** for validating drafts before marking as `ready`

**Decision:** Extend the `IssueDraft` interface with 5 new fields + new `FileRef` interface before implementing Issue 4.6 (`generate_issue_drafts`). Add a Research Context section to the issue template in `stage-setup.agent.md` to render `researchLinks`.

**Estimated effort:** 2-3 hours (actual: ~30 minutes using sub-agent delegation)

---

### R10: MCP Server Architecture — CLOSED (resolved by R6, confirmed by dedicated R10 research)

> **Status:** CLOSED — 2026-03-11. R6 research confirmed MCP is not the right approach; dedicated R10 research validated this with deeper analysis. See [R10-mcp-server-architecture.md](./research/R10-mcp-server-architecture.md) for full findings and [R6-sdk-unused-features.md](./research/R6-sdk-unused-features.md) SQ1.

**Question:** Should the web app expose its planning tools as an MCP server? Could this enable the chat agent to use GitHub write operations?

**Resolution:** MCP adds subprocess/HTTP complexity without proportional benefit over native `Tool` handlers. The existing `createGitHubTools(token)` pattern is simpler, faster (zero IPC overhead vs ~1-5ms per MCP tool call), and already proven. R3 confirmed REST API is sufficient for execution; R6 SQ1 confirmed native tools beat MCP for this use case.

**Key R10 findings (confirming R6):**
- The **official GitHub MCP Server** (`github/github-mcp-server`, 28k stars, v0.32, Go) covers ~90% of needed write operations including `assign_copilot_to_issue` and `request_copilot_review`, but is **missing milestone creation**, requires Docker as runtime dependency, and cannot host planning tools
- SDK has production-ready MCP support via `SessionConfig.mcpServers` (local stdio + remote HTTP transports)
- Local MCP transport spawns one process per session (O(n) processes) — not ideal for scale-to-zero Container App
- MCP permission model (`kind: "mcp"` with `readOnly` flag) is more granular than custom tool blanket approval — pattern worth adopting in `safePermissionHandler`

**Reconsider MCP if any of these become true:**
1. Cross-client reuse needed (tools shared with VS Code Copilot, Claude Desktop, Cursor)
2. Scale beyond ~50 concurrent users (remote MCP server more efficient than per-user closures)
3. Process isolation required (untrusted/experimental tools that shouldn't crash Express server)
4. Team boundary (separate team maintains GitHub tools independently)
5. GitHub MCP Server adds milestone creation (then covers 100% of write needs with zero custom code)

**Estimated effort:** 6-8 hours (actual: ~30 minutes using sub-agent delegation — research completed but confirmed no implementation needed)

---

## Research Priority Matrix

| ID | Topic | Urgency | Blocks | Effort | Recommended Order |
|---|---|---|---|---|---|
| **R1** | GitHub REST API writes | ✅ COMPLETE | Stage 4 | ~30min | **1st** — ✅ completed 2026-03-11 |
| **R4** | Copilot coding agent API | ✅ COMPLETE | Stage 5 | ~30min (deep-dive beyond R3) | **2nd** — ✅ completed 2026-03-11 (R3 core + R4 deep-dive) |
| **R3** | Web app → orchestration bridge | ✅ COMPLETE | Stage 5 | ~45min | **3rd** — ✅ completed 2026-03-11, decision: Option A (direct REST API) |
| **R2** | GitHub Projects v2 GraphQL | ✅ COMPLETE | Stage 4 | ~30min | **4th** — ✅ completed 2026-03-11, decision: skip for MVP |
| **R5** | Persistent storage | ✅ COMPLETE | Stage 4 | ~30min | **5th** — ✅ completed 2026-03-11, decision: Azure Table Storage (separate tables, FK PartitionKeys) |
| **R6** | SDK unused features | ✅ COMPLETE | — | ~30min | ✅ completed 2026-03-11, findings: implement planning events + user input + reasoning effort; skip MCP/BYOK |
| **R10** | MCP server architecture | ✅ CLOSED (by R6, confirmed by R10) | — | ~30min | ✅ closed 2026-03-11 — R6 confirmed MCP not needed; dedicated R10 research validated with deeper analysis (official GitHub MCP Server covers ~90% but requires Docker + missing milestones; reconsider triggers documented) |
| **R7** | Actions workflow dispatch | ✅ COMPLETE | — | ~30min | ✅ completed 2026-03-11, supplementary capability — `repository_dispatch` preferred; no run ID returned (use correlation_id); R8 can reference webhook findings |
| **R8** | Real-time progress | ✅ COMPLETE | Stage 5 UX | ~30min | ✅ completed 2026-03-11, decision: Polling + SSE (primary), Webhooks (optional) |
| **R9** | Issue quality analysis | ✅ COMPLETE | Issue 4.6 | ~30min | ✅ completed 2026-03-11, findings: 5 new IssueDraft fields + FileRef interface + quality checklist |

**Total estimated research effort:** 35-50 hours

---

## Recommended Research Sprint

Before writing code for Stage 4, spend a focused research sprint:

### Week 1: Critical Path
1. **R1** — GitHub REST API writes ✅ completed
2. **R4** — Copilot coding agent API surface ✅ resolved by R3
3. **R5** — Persistent storage schema design ✅ completed (Azure Table Storage with separate tables)

### Week 2: Architecture Decision
4. **R3** — Bridge architecture ✅ completed (Option A: direct REST API)
5. **R2** — GitHub Projects v2 — ✅ completed (decision: skip for MVP, use Milestones + Labels)
6. **R10** — MCP server feasibility (deprioritized by R3 — REST API sufficient)

### Parallel (During Weeks 1-2)
7. **R6** — SDK feature evaluation ✅ completed
8. **R9** — Issue quality analysis ✅ completed

### After Architecture Decision
9. **R7** — Actions workflow dispatch ✅ completed (supplementary — `repository_dispatch` preferred over `workflow_dispatch`; `workflow_run` webhook noted for R8)
10. **R8** — Real-time progress approach (R3 established 20s polling baseline; R8 can evaluate alternatives)

---

## Decision Gates

After research, the following decisions must be made before Stage 4 begins:

| Decision | Options | Depends On |
|---|---|---|
| **How does the web app create GitHub resources?** | ✅ **REST API (custom tools)** — R1 confirmed all endpoints exist. New `githubWrite()` helper + 5 tools in `tools.ts`. Only Issues (write) + Contents (write) PAT scopes needed. | R1 ✅, R10 |
| **Include GitHub Projects v2?** | ✅ **Skip for MVP** — R2 confirmed fine-grained PATs can't access user-owned Projects v2. Use Milestones + Labels instead. | R2 ✅ |
| **How does execution connect to the web app?** | ✅ **Direct REST API (Option A)** — R3 confirmed Copilot agent has public REST APIs. Web app orchestrates directly via `githubWrite()`. No Actions bridge needed. R4 confirmed two-phase polling (issue timeline → PR timeline), no webhook alternative, API is Public Preview. | R3 ✅, R4 ✅ |
| **What storage backend for planning data?** | Azure Table+Blob / node:sqlite / Both with fallback | R5 |
| **Should the SDK use MCP for GitHub writes?** | ✅ **No (REST tools only)** — R3 confirmed REST API is sufficient for execution bridge. R6 confirmed native `Tool` handlers are simpler and faster than MCP. R10 validated with deeper analysis: official GitHub MCP Server covers ~90% but requires Docker + missing milestones; custom tools win on performance (~0ms vs ~1-5ms IPC), token isolation, and resource efficiency. Reconsider if cross-client reuse needed or >50 concurrent users. | R6 ✅, R10 ✅ (closed by R6, confirmed by R10) |
| **Which SDK features to adopt?** | ✅ **Tier 1: planning/intent events + reasoning effort + compaction events. Tier 2: user input requests + session disconnect. Defer: file attachments. Skip: MCP, BYOK, custom agents.** — R6 confirmed priority ordering by value/effort ratio. Critical correction: `planning.started/end` events don't exist; use `session.mode_changed`, `assistant.intent`, `subagent.*` instead. | R6 ✅ |
| **How does the web app show real-time execution progress?** | ✅ **Polling + SSE (primary), Webhooks (optional)** — R8 confirmed server-side polling of GitHub API at adaptive intervals (30s idle / 15s active) feeding SSE stream to browser. Extends existing `/api/chat` SSE pattern. Heartbeats (30s) prevent Azure Container Apps timeout. Checkpoints + cursor enable crash recovery. Webhooks can be layered later for ~1s latency. | R8 ✅ |
| **What makes a good coding agent issue?** | ✅ **6 elements: clear problem, file paths, pattern references, scope boundaries, testable acceptance criteria, verification commands.** R9 found `filesToModify`/`filesToRead` are the most impactful missing fields; pattern references are the strongest predictor of clean first-pass code. 5 new IssueDraft fields + `FileRef` interface + quality validation checklist. | R9 ✅ |
