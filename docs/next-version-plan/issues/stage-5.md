# Stage 5: Execution Orchestration Bridge

> **Parent:** [issue-breakdown.md](../issue-breakdown.md) | [project-plan-v2.md](../project-plan-v2.md#stage-5-execution-orchestration-bridge)

---

> **Goal:** Connect the web app to the existing agent orchestration process, enabling users to start, monitor, and control autonomous milestone execution from the browser.
>
> **Effort:** 25 implementation issues | **Prerequisite:** Stage 4 ✅ + Research R3, R4, R8 resolved ✅
>
> **See [project-plan-v2.md](./project-plan-v2.md#stage-5-execution-orchestration-bridge) for stage overview, security table, and feedback checkpoint.**
>
> **Architecture decided (R3, deepened by R4):** The web app uses **Option A: direct REST API** to orchestrate execution. No GitHub Actions workflow bridge needed. Copilot coding agent is assigned via `copilot-swe-agent[bot]` assignee + `agent_assignment` REST body (target_repo, base_branch, custom_instructions, custom_agent, model). Review via `copilot-pull-request-reviewer[bot]` (match both bot logins; reviews always COMMENTED). Progress via two-phase timeline polling: issue timeline → PR timeline (20s). No webhook alternative. API is Public Preview. Issues below reflect this decision.

### Orchestrator Sequence (Stage 5)

> **Branch:** `stage-5/execution-orchestration`
> **Stage goal:** Build execution engine, GitHub Copilot agent integration, real-time monitoring, escalation system, and execution UI.
>
> Research 5.2 is complete, 5.3 is closed. Only implementation issues below.

| Seq | Original | Title | Type | Depends On (seq) | Files to Modify | Files to Read |
|-----|----------|-------|------|-------------------|-----------------|---------------|
| 1 | 5.1 | Document execution bridge architecture | Docs | None | `docs/next-version-plan/execution-architecture.md` | `docs/next-version-plan/research/R3-web-app-orchestration-bridge.md`, `docs/next-version-plan/research/R4-copilot-coding-agent-api.md`, `docs/next-version-plan/research/R8-real-time-progress-updates.md` |
| 2 | 5.4 | Create execution state model | Code + Tests | 1 | `planning-types.ts`, `planning-store.ts`, `planning-store.test.ts` | `docs/next-version-plan/research/R8-real-time-progress-updates.md` |
| 3 | 5.6 | Create execution state machine | Code + Tests | 2 | `planning-store.ts`, `planning-store.test.ts` | `planning-types.ts` |
| 4 | 5.9 | Create `assign_copilot_agent` tool (REST API) | Code + Tests | 1 | `tools.ts`, `server.ts` | `docs/next-version-plan/research/R4-copilot-coding-agent-api.md`, `docs/next-version-plan/research/R1-github-rest-api-writes.md` |
| 5 | 5.10 | Create `request_copilot_review` tool (REST API) | Code + Tests | 4 | `tools.ts`, `server.ts` | `docs/next-version-plan/research/R4-copilot-coding-agent-api.md` |
| 6 | 5.12 | Create `post_copilot_fix` tool (@copilot comments) | Code + Tests | 4 | `tools.ts`, `server.ts` | `docs/next-version-plan/research/R4-copilot-coding-agent-api.md` |
| 7 | 5.7 | Create `GET /api/executions/:milestoneId/status` endpoint | Code + Tests | 2 | `server.ts` | `planning-store.ts`, `planning-types.ts` |
| 8 | 5.11 | Implement execution progress polling (timeline events) | Code + Tests | 4, 7 | `server.ts` | `tools.ts`, `docs/next-version-plan/research/R4-copilot-coding-agent-api.md`, `docs/next-version-plan/research/R8-real-time-progress-updates.md` |
| 9 | 5.5 | Create `POST /api/execute` SSE endpoint | Code + Tests | 2, 3, 4, 5, 6, 8 | `server.ts` | `planning-store.ts`, `tools.ts`, `docs/next-version-plan/research/R8-real-time-progress-updates.md` |
| 10 | 5.8 | Create pause/resume execution endpoints | Code + Tests | 9 | `server.ts` | `planning-store.ts`, `planning-types.ts` |
| 11 | 5.13 | Implement PR review monitoring | Code + Tests | 5, 8 | `server.ts` | `tools.ts`, `docs/next-version-plan/research/R4-copilot-coding-agent-api.md` |
| 12 | 5.14 | Implement review fix posting | Code + Tests | 6, 11 | `server.ts` | `tools.ts` |
| 13 | 5.15 | Implement CI status monitoring | Code + Tests | 8 | `server.ts` | `tools.ts`, `docs/next-version-plan/research/R7-github-actions-workflow-dispatch.md` |
| 14 | 5.16 | Implement CI fix posting | Code + Tests | 6, 13 | `server.ts` | `tools.ts` |
| 15 | 5.17 | Implement stop gate detection | Code + Tests | 3 | `server.ts` | `planning-types.ts`, `planning-store.ts` |
| 16 | 5.18 | Create escalation message system | Code + Tests | 15 | `server.ts` | `planning-types.ts` |
| 17 | 5.19 | Create resolve endpoint for escalated issues | Code + Tests | 15 | `server.ts` | `planning-store.ts`, `planning-types.ts` |
| 18 | 5.20 | Implement milestone completion flow | Code + Tests | 3, 9 | `server.ts` | `tools.ts`, `planning-store.ts` |
| 19 | 5.21 | Create milestone summary generator | Code + Tests | 18 | `server.ts` | `planning-types.ts` |
| 20 | 5.22 | Execution monitor page | Code | 7, 8 | `public/app.js`, `public/index.html` | `server.ts`, `docs/next-version-plan/research/R8-real-time-progress-updates.md` |
| 21 | 5.23 | Execution controls UI | Code | 9, 10 | `public/app.js`, `public/index.html` | `server.ts` |
| 22 | 5.24 | Escalation inbox UI | Code | 16, 17 | `public/app.js`, `public/index.html` | `server.ts` |
| 23 | 5.25 | Execution history page | Code | 18 | `public/app.js`, `public/index.html` | `server.ts` |
| 24 | 5.26 | Real-time SSE integration for execution | Code | 20 | `public/app.js` | `server.ts`, `docs/next-version-plan/research/R8-real-time-progress-updates.md` |
| 25 | 5.27 | End-to-end execution test | Tests | All | `test.ts`, `e2e/chat.spec.ts` | All Stage 5 files |
| 26 | 5.28 | Stage 5 documentation | Docs | All | `docs/architecture.md`, `docs/backend.md`, `docs/frontend.md`, `AGENTS.md` | All Stage 5 files |

### Research Finalization (Issues 5.1–5.3) — 5.2 COMPLETE ✅, 5.3 CLOSED ✅

---

### Issue 5.1: Document execution bridge architecture

**Purpose:** Document the finalized Option A (direct REST API) architecture for the execution bridge, as determined by R3/R4 research.

**Expected outcome:**
- `docs/next-version-plan/execution-architecture.md` with finalized architecture
- Sequence diagrams for: assign Copilot → poll completion → request review → post fixes → merge
- API contracts for `POST /api/execute` (SSE) and `POST /api/execute/abort`
- `githubWrite()` usage patterns for all Copilot agent interactions

**Dependencies:** R3 ✅, R4 ✅ (both complete)

**Acceptance criteria:**
- [ ] Option A architecture documented with diagrams
- [ ] API contracts defined for `/api/execute` SSE endpoint
- [ ] Copilot agent assignment REST API documented with examples (from R4 code examples)
- [ ] `agent_assignment` parameter schema documented: target_repo, base_branch, custom_instructions, custom_agent, model (R4)
- [ ] Two-phase timeline polling pattern documented: Phase 1 on issue timeline (find PR via `cross-referenced`), Phase 2 on PR timeline (`copilot_work_finished`/`copilot_work_finished_failure`) (R4)
- [ ] Timeline polling pattern documented (20s interval, events to watch)
- [ ] No webhook alternative documented — polling is the only approach (R4)
- [ ] Agent limitations documented: single repo, `copilot/` branch prefix, can't merge/approve, Public Preview API (R4)
- [ ] PAT scope requirements documented: metadata (read), actions+contents+issues+pull_requests (read+write)
- [ ] Security boundaries documented

**Testing expectations:** Research deliverable only

**Security checklist:**
- [ ] Authentication flow between systems documented
- [ ] Permission boundaries defined

---

### Issue 5.2: Research real-time progress update mechanism ✅ COMPLETE

**Purpose:** Determine how execution progress reaches the browser — polling GitHub API, webhook relay, or Actions-based hybrid.

**Research ID:** R8 (✅ COMPLETE) — see [R8-real-time-progress-updates.md](./research/R8-real-time-progress-updates.md)

**Key Findings:**
- **Polling + SSE is the primary approach** — server polls GitHub API at adaptive intervals (30s idle / 15s active / 60s no-PR), feeds results into SSE stream using existing `/api/chat` pattern
- **Webhooks are optional enhancement** — reduce latency from ~20s to ~1s but add HMAC-SHA256 verification, public endpoint, and per-repo webhook registration
- **Adaptive polling** is optimal: ~12 concurrent issues within rate limits
- **14 SSE event types** defined (issue-start through done, plus heartbeat and checkpoint)
- **Heartbeats essential** — 30s keep-alive prevents Azure Container Apps 240s idle timeout
- **Crash recovery via checkpoints + cursor** — client saves checkpoint to localStorage, reconnects with cursor
- **Execution state model** — `ExecutionStep` type, `ExecutionState` per-issue, `ExecutionRun` per-execution; persisted in Azure Table `executionruns` (PK=tokenHash, RK=runId); ~7 writes per issue
- **Async generator + AbortSignal** pattern for server-side execution loop
- **Frontend UI components** — view tabs, milestone accordion, issue cards with step pipeline, event log, control bar, escalation banner

**Decision:** **Polling + SSE (primary), Webhooks (optional enhancement).** Extends existing codebase patterns, requires no new infrastructure, supports crash recovery.

**Impact on Stage 5:**
- Issue 5.4: execution state model uses R8's `ExecutionStep`/`ExecutionState`/`ExecutionRun` types
- Issue 5.5: `/api/execute` uses async generator + AbortSignal, emits 14 SSE event types, includes 30s heartbeats
- Issue 5.11: uses adaptive polling (30s/15s/60s), not fixed 20s
- Issue 5.22: UI components follow R8's view tabs + milestone accordion + step pipeline design
- Issue 5.26: checkpoint/cursor reconnection, heartbeat miss detection (>45s)

**Acceptance criteria:**
- [x] Options evaluated with latency and complexity
- [x] Recommended approach documented
- [x] Impact on frontend implementation documented
- [x] Execution state model defined
- [x] SSE event types defined
- [x] Crash recovery protocol defined

---

### Issue 5.3: ~~Research MCP server integration for SDK ↔ GitHub bridge~~ — CLOSED (resolved by R6, confirmed by R10)

**Purpose:** ~~Investigate whether the Copilot SDK can use MCP servers directly, potentially simplifying the bridge between the web app and GitHub write operations.~~

**Status:** CLOSED — R6 research (SQ1) confirmed that native `Tool` handlers are simpler, faster (no IPC overhead), and already proven for this project. Dedicated R10 research validated this conclusion with deeper analysis: the official GitHub MCP Server (`github/github-mcp-server`, 28k stars, v0.32) covers ~90% of needed write operations but requires Docker, is missing milestone creation, and cannot host planning tools. Custom `Tool[]` wins on simplicity, performance (~0ms vs ~1-5ms IPC per call), token isolation (closure binding vs env var injection), and resource efficiency (no extra process per session). See [R10-mcp-server-architecture.md](./research/R10-mcp-server-architecture.md) and [R6-sdk-unused-features.md](./research/R6-sdk-unused-features.md).

**Research ID:** R10 — closed by R6, confirmed by dedicated R10 research

**Acceptance criteria:**
- [x] Decision from R3 implemented (MCP bridge not needed for execution)
- [x] Decision confirmed by R6 SQ1 (native tools > MCP for this use case)
- [x] Decision validated by R10 (detailed comparison, official GitHub MCP Server evaluation, future reconsider triggers documented)

---

### Execution Engine Core (Issues 5.4–5.8)

---

### Issue 5.4: Create execution state model

**Purpose:** Define the data model for tracking milestone execution state, enabling crash recovery and real-time progress streaming.

**Expected outcome:**
- `ExecutionStep` literal-union type: `assign_agent` | `wait_pr` | `request_review` | `wait_review` | `fix_review` | `wait_ci` | `merge` | `done` | `failed` (R8 design)
- `ExecutionState` interface: per-issue tracking with `goalId`, `milestoneId`, `issueId`, `githubIssueNumber`, `step`, `retryCount`, `prNumber?`, `updatedAt`, `lastError?`
- `ExecutionRun` interface: per-execution with `id`, `goalId`, `status` (running/paused/completed/failed), `issues` (Record<string, ExecutionState>), `createdAt`, `updatedAt`
- Persisted in Azure Table Storage: `executionruns` table, PK=`tokenHash`, RK=`runId`
- State persisted on every step transition (~7 writes per issue, not on polling ticks)

**Dependencies:** Issue 5.1

**Acceptance criteria:**
- [ ] All issue lifecycle states represented
- [ ] Execution events logged with timestamps
- [ ] State transitions validated
- [ ] Unit tests for state model

**Testing expectations:**
- Unit tests for state transitions and validation

**Security checklist:**
- [ ] No token data in execution state
- [ ] State scoped to user session

---

### Issue 5.5: Create `POST /api/execute` SSE endpoint

**Purpose:** Initialize milestone execution and run the execution loop, streaming progress to the browser via Server-Sent Events.

**Expected outcome:**
- `POST /api/execute` SSE endpoint (same headers pattern as `/api/chat`)
- Creates milestone branch and labels (using Stage 4 tools)
- Runs execution loop using **async generator + AbortSignal** pattern (R8): for each issue → assign Copilot → poll for PR → request review → post fixes → CI → merge
- Streams 14 SSE event types (R8): `issue-start`, `agent-assigned`, `agent-working`, `pr-created`, `agent-complete`, `review-requested`, `review-complete`, `ci-running`, `ci-result`, `merge-complete`, `issue-complete`, `issue-error`, `escalation`, `heartbeat`, `checkpoint`, `done`
- **30s heartbeat** interval prevents Azure Container Apps 240s idle timeout (R8)
- **Checkpoint events** emitted after each issue with `milestoneId`, `completedIssues[]`, `cursor` for crash recovery (R8)
- `POST /api/execute/abort` endpoint to stop execution
- `req.on("close")` triggers AbortController to clean up polling on disconnect

**R3 Technical Details:**
- Reuses SSE headers pattern from `/api/chat` endpoint
- Uses `githubWrite()` for all GitHub API calls
- Polling at 20s intervals for agent completion (proven pattern from R3)
- Error handling: stream error event and pause for user decision
- Server must stay running during execution chains (hours) — persistent state needed (R5 dependency)

**Dependencies:** Issue 5.1, Stage 4

**Acceptance criteria:**
- [ ] GitHub infrastructure created (branch, labels)
- [ ] Orchestration triggered
- [ ] Execution state initialized and persisted
- [ ] Returns execution ID for status polling
- [ ] Validates all issues are pushed to GitHub before allowing start

**Testing expectations:**
- Integration tests

**Security checklist:**
- [ ] Requires explicit user approval to start
- [ ] Validates PAT has required scopes
- [ ] Rate limit on execution starts

---

### Issue 5.6: Create execution state machine

**Purpose:** Track each issue through its lifecycle, processing state transitions and maintaining the execution timeline.

**Expected outcome:**
- State machine that processes transitions: pending → agent-working → pr-ready → review-requested → review-fixes-needed → ci-ready → ci-passed → merged
- Terminal states: merged, escalated
- Retry tracking per issue (review fix attempts, CI fix attempts)

**Dependencies:** Issue 5.4

**Acceptance criteria:**
- [ ] All valid state transitions implemented
- [ ] Invalid transitions rejected with error
- [ ] Retry counts tracked and limits enforced
- [ ] Escalation triggered when limits exceeded
- [ ] Unit tests for all transitions

**Testing expectations:**
- Unit tests for every state transition (valid and invalid)

**Security checklist:**
- [ ] State transitions logged for audit

---

### Issue 5.7: Create `GET /api/executions/:milestoneId/status` endpoint

**Purpose:** Return the current execution state for all issues in the milestone.

**Expected outcome:**
- Returns: overall milestone status, per-issue status, current action, event timeline
- Supports pagination for event timeline

**Dependencies:** Issue 5.4

**Acceptance criteria:**
- [ ] Returns all issue statuses
- [ ] Timeline includes recent events
- [ ] Authentication enforced
- [ ] Efficient query (not loading all events every time)

**Testing expectations:**
- Integration tests

**Security checklist:**
- [ ] User can only see their own executions
- [ ] No internal state leaked

---

### Issue 5.8: Create pause/resume execution endpoints

**Purpose:** Allow users to pause and resume execution from the web UI.

**Expected outcome:**
- `POST /api/executions/:milestoneId/pause` — pauses after current issue completes
- `POST /api/executions/:milestoneId/resume` — resumes from paused state

**Dependencies:** Issue 5.5

**Acceptance criteria:**
- [ ] Pause stops execution after current issue finishes (not mid-issue)
- [ ] Resume continues from where it paused
- [ ] State updated immediately (pause intent recorded)

**Testing expectations:**
- Integration tests

**Security checklist:**
- [ ] Only execution owner can pause/resume

---

### REST API Execution Tools (Issues 5.9–5.12)

> R3 finding: GitHub has public REST APIs for Copilot coding agent assignment and code review. No GitHub Actions workflow bridge needed.

---

### Issue 5.9: Create `assign_copilot_agent` tool

**Purpose:** Assign the Copilot coding agent to an issue via REST API, triggering autonomous implementation.

**Expected outcome:**
- `assign_copilot_agent` tool — calls `POST /repos/{owner}/{repo}/issues/{issue_number}/assignees`
- Body: `{ assignees: ["copilot-swe-agent[bot]"], agent_assignment: { target_repo, base_branch, custom_instructions, model } }`
- Agent assignment tracked in execution state
- Timeout detection (agent doesn't start within expected timeframe)

**R3/R4 Technical Details:**
- Three REST endpoints support assignment: POST (add assignee), PATCH (update issue), POST (create issue with assignee)
- `agent_assignment` parameter schema (R4): `target_repo` (string, optional — defaults to issue's repo), `base_branch` (string, optional — defaults to default branch), `custom_instructions` (string, optional), `custom_agent` (string, optional — references `.github/agents/`), `model` (string, optional — depends on org policy)
- Error codes: 401 (bad auth), 403 (missing perms/rate limited), 404 (not found/hidden), 422 (agent not available/not enabled)
- GraphQL alternative: `addAssigneesToAssignable` with `agentAssignment` field (requires `GraphQL-Features` header) — REST recommended
- PAT needs 5 fine-grained permissions: metadata (read), actions (r/w), contents (r/w), issues (r/w), pull_requests (r/w)
- API is Public Preview — implementation should be defensive, validate response fields
- Agent can only push to `copilot/` prefixed branches; cannot merge PRs or mark them ready for review

**Dependencies:** Issue 5.1

**Acceptance criteria:**
- [ ] Can assign Copilot coding agent to a specific issue via REST API
- [ ] `agent_assignment` body includes base branch (milestone branch)
- [ ] Assignment confirmed (tracked in execution state)
- [ ] Timeout detection for assignments that don't start
- [ ] Error handling for assignment failures (permissions, rate limits)

**Testing expectations:**
- Integration tests (requires Copilot access + PAT with required scopes)
- <!-- TODO: Verify `copilot-swe-agent[bot]` identity works with fine-grained PATs before implementation -->

**Security checklist:**
- [ ] Agent scoped to milestone branch via `base_branch`
- [ ] Uses user's own PAT
- [ ] Custom instructions sanitized

---

### Issue 5.10: Create `request_copilot_review` tool

**Purpose:** Request Copilot code review on a PR via the standard GitHub review request API.

**Expected outcome:**
- `request_copilot_review` tool — calls `POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers`
- Copilot appears as a reviewer in the standard reviewer mechanism
- Poll for review completion via `GET .../pulls/{n}/reviews`

**R3/R4 Technical Details:**
- Copilot reviewer bot identity: `copilot-pull-request-reviewer[bot]` (primary) or `copilot-pull-request-review[bot]` (alternative) — match both for robustness (R4)
- Reviews always have state `"COMMENTED"` (never `"APPROVED"` or `"CHANGES_REQUESTED"`) — reviews don't block merging and don't count toward required approvals (R4)
- `@copilot` comments on PRs trigger Copilot to make fixes (but NOT on issues)
- Request review: `POST .../pulls/{n}/requested_reviewers` with `{ reviewers: ["copilot-pull-request-reviewer[bot]"] }` → 201 Created
- Poll reviews: `GET .../pulls/{n}/reviews` — look for `user.login` matching either bot name
- Invalid review detection: check body for "wasn't able to review", "couldn't review any files", "unable to review" patterns (R4)

**Dependencies:** Issue 5.9

**Acceptance criteria:**
- [ ] Can request Copilot code review on a PR
- [ ] Review completion detected via polling
- [ ] Review comments parsed and classified
- [ ] Error handling for review request failures
- <!-- TODO: Verify exact reviewer identity string with live API test -->

**Testing expectations:**
- Integration tests with real PRs

**Security checklist:**
- [ ] Uses user's own PAT
- [ ] Conservative review classification

---

### Issue 5.11: Implement execution progress polling

**Purpose:** Poll GitHub API to track Copilot coding agent progress and detect state changes.

**Expected outcome:**
- Polling service that checks GitHub API at configurable intervals (default: 20s, proven in R3)
- Uses issue timeline events: `copilot_work_started`, `copilot_work_finished`, `copilot_work_finished_failure`, `cross-referenced` (PR creation)
- Updates execution state based on timeline events, PR status, CI status
- Feeds updates into execution state machine and SSE stream

**R3/R4 Technical Details:**
- `GET /repos/{owner}/{repo}/issues/{issue_number}/timeline` — watch for `cross-referenced` events (Phase 1)
- **Adaptive polling (R8)** — start at 30s; decrease to 15s when `copilot_work_started` detected; increase to 60s for issues with no PR linked yet. Supports ~12 concurrent issues within rate limits.
- **Two-phase polling (R4 critical detail):**
  - Phase 1: Poll *issue* timeline for `cross-referenced` event where `source.issue.pull_request` exists → extract PR number
  - Phase 2: Poll *PR* timeline for `copilot_work_finished` or `copilot_work_finished_failure` (last matching event determines status)
  - **Important:** `copilot_work_*` events appear on the PR timeline, NOT the issue timeline
- **Draft PR alternative signal:** Agent creates PRs as draft while working, marks non-draft when done; `copilot_work_finished` is the authoritative signal
- **No webhook alternative** — no `copilot_work_*` webhook event type exists; polling is the only approach (R4 confirmed)
- `copilot_work_*` event schemas are not officially documented — derived from working codebase scripts (risk if GitHub changes format)
- Rate: 180 API calls/hour per monitored issue at 20s interval (well within 5,000/hr limit); adaptive polling (R8) reduces to ~120 req/hr/issue and supports ~12 concurrent issues
- Can monitor ~27 issues simultaneously before hitting rate limits (fixed interval); ~12 with adaptive (R8 recommended)
- Existing patterns: `wait-for-agent.ps1` (poll timeline → find PR → poll for completion)

**Dependencies:** Issue 5.7

**Acceptance criteria:**
- [ ] Polls at configurable interval (default: adaptive — 30s idle / 15s active / 60s no-PR per R8)
- [ ] Detects all major events (agent started, agent finished, PR created, review completed, CI pass/fail, merge)
- [ ] Updates execution state correctly
- [ ] Respects GitHub API rate limits
- [ ] Timeout after configurable duration (default: 30 minutes)

**Testing expectations:**
- Integration tests with mock GitHub API responses
- Test rate limit handling

**Security checklist:**
- [ ] Polling uses user's PAT
- [ ] Exponential backoff on errors

---

### Issue 5.12: Create `post_copilot_fix` tool

**Purpose:** Post `@copilot` comments on PRs to request code fixes for review comments or CI failures.

**Expected outcome:**
- `post_copilot_fix` tool — calls `POST /repos/{owner}/{repo}/issues/{pull_number}/comments`
- Body: `{ body: "@copilot Please fix the following:\n..." }`
- Used for both review fix requests and CI failure fixes
- Tracks fix attempts per issue

**R3 Technical Details:**
- `@copilot` comments work on PRs but **NOT on issues** — for issues, use the assignee API
- After posting, poll for agent completion (same as initial assignment)
- Fix instructions should include: specific items to fix, quoted code, expected behavior

**Dependencies:** Issue 5.11

**Acceptance criteria:**
- [ ] Posts `@copilot` fix comments on PRs (not issues)
- [ ] Fix instructions are clear and specific
- [ ] Fix attempt count tracked per issue
- [ ] Max fix attempts respected (escalate when exceeded)
- [ ] Agent re-completion detected after fix

**Testing expectations:**
- Integration tests

**Security checklist:**
- [ ] Fix instructions don't expose system internals
- [ ] Only posts on PRs (never on issues)
- [ ] Uses user's own PAT

---

### Review & CI Loop (Issues 5.13–5.16)

---

### Issue 5.13: Implement PR review monitoring

**Purpose:** Detect when Copilot review is complete and classify the outcome.

**Expected outcome:**
- Monitors PR reviews via GitHub API
- Classifies review comments: valid (must fix), optional (nice to have), irrelevant (ignore)
- Uses Copilot SDK for classification analysis

**Dependencies:** Issue 5.11

**Acceptance criteria:**
- [ ] Detects review completion
- [ ] Comments classified correctly (conservative — err on human review side)
- [ ] Classification reasoning logged
- [ ] Uncertain items flagged for human review

**Testing expectations:**
- Unit tests for classification logic
- Integration tests with real reviews

**Security checklist:**
- [ ] Conservative classification (safety first)
- [ ] Classification reasoning logged for audit

---

### Issue 5.14: Implement review fix posting

**Purpose:** Post `@copilot` comments on PRs with explicit fix instructions for valid review comments.

**Expected outcome:**
- Posts fix instructions as `@copilot` comment on PRs
- Instructions include: line numbers, quoted code, expected behavior
- Tracks fix attempts per issue

**Dependencies:** Issue 5.13

**Acceptance criteria:**
- [ ] Fix instructions are clear and specific
- [ ] Only valid comments addressed (not optional/irrelevant)
- [ ] Fix attempt count tracked
- [ ] Max fix attempts respected (escalate when exceeded)

**Testing expectations:**
- Integration tests

**Security checklist:**
- [ ] Fix instructions don't expose system internals
- [ ] Only posts on PRs (never on issues)

---

### Issue 5.15: Implement CI status monitoring

**Purpose:** Detect when CI workflows complete and extract failure information.

**Expected outcome:**
- Monitors GitHub Actions workflow runs for the PR
- Detects pass/fail completion
- Extracts failure logs for diagnosis

**R7 Technical Details (CI monitoring via GitHub Actions API):**
- Poll run status: `GET /repos/{owner}/{repo}/actions/runs/{run_id}` — statuses: `queued`, `in_progress`, `completed`, `waiting`, `requested`, `pending`
- Run conclusions: `success`, `failure`, `cancelled`, `skipped`, `timed_out`, `action_required`, `stale`, `neutral`, `startup_failure`
- Job-level detail: `GET .../runs/{run_id}/jobs` returns `jobs[]` with per-step `status`/`conclusion`
- Download logs: `GET .../runs/{run_id}/logs` → 302 redirect to zip (timestamped per-step text files)
- List/download artifacts: `GET .../runs/{run_id}/artifacts` + `GET .../artifacts/{id}/zip`
- PAT scope: `actions:read` sufficient for all monitoring operations
- Recommended polling interval: 30s for budget-friendly monitoring; use `x-ratelimit-remaining` header for adaptive polling
- Existing pattern: `scripts/orchestrator/get-ci-failure-summary.ps1` uses `gh api` for job-level failure extraction — translatable to TypeScript

**Dependencies:** Issue 5.11

**Acceptance criteria:**
- [ ] Detects workflow completion (pass/fail) via run status + conclusion polling
- [ ] Failure logs extracted and summarized (download zip, parse per-step logs)
- [ ] Handles multiple workflow runs per PR
- [ ] Job-level failure detail extracted (not just run-level)

**Testing expectations:**
- Integration tests

**Security checklist:**
- [ ] Logs sanitized before including in escalation messages

---

### Issue 5.16: Implement CI fix posting

**Purpose:** Post `@copilot` comments on PRs with CI failure context and fix instructions.

**Expected outcome:**
- Extracts failure summary from CI logs
- Posts `@copilot` comment with failure context and fix guidance
- Tracks CI fix attempts per issue

**Dependencies:** Issue 5.15

**Acceptance criteria:**
- [ ] CI failure context included in fix instructions
- [ ] Fix attempt count tracked
- [ ] Max CI fix attempts respected
- [ ] Clear, actionable fix instructions

**Testing expectations:**
- Integration tests

**Security checklist:**
- [ ] CI logs sanitized (no secrets)
- [ ] Only posts on PRs

---

### Human Stop Gates & Escalation (Issues 5.17–5.19)

---

### Issue 5.17: Implement stop gate detection

**Purpose:** Detect all conditions that should pause autonomous execution and require human intervention.

**Expected outcome:**
- Stop gate detection for: CI failure after max retries, review loops exceeded, agent timeout after extended wait, merge conflicts, security-flagged changes, scope ambiguity
- Each stop gate produces a structured escalation event

**Dependencies:** Issue 5.6

**Acceptance criteria:**
- [ ] All defined stop conditions detected
- [ ] Structured escalation event produced
- [ ] Execution paused (not terminated) on stop gate
- [ ] Each stop condition tested individually

**Testing expectations:**
- Unit tests for each stop condition
- Integration test for pause behavior

**Security checklist:**
- [ ] Stop gates cannot be bypassed
- [ ] All stop events logged

---

### Issue 5.18: Create escalation message system

**Purpose:** Generate clear, structured messages explaining what happened, what was tried, what input is needed, and how to resume.

**Expected outcome:**
- Escalation messages include: failed issue, failure type, steps tried, specific input needed, resume instructions
- Messages stored in execution state for UI display

**Dependencies:** Issue 5.17

**Acceptance criteria:**
- [ ] Messages provide sufficient context for resolution
- [ ] Messages include specific resume instructions
- [ ] Messages don't leak tokens or internal state
- [ ] Different message templates for each stop condition

**Testing expectations:**
- Unit tests for message generation
- Review message quality for each stop condition

**Security checklist:**
- [ ] No tokens, PATs, or internal URLs in messages
- [ ] User data sanitized

---

### Issue 5.19: Create `POST /api/executions/:milestoneId/resolve` endpoint

**Purpose:** Accept human resolution for an escalated issue and resume execution.

**Expected outcome:**
- Endpoint accepts: issue ID, resolution type, resolution details
- Validates resolution is appropriate for the escalation type
- Updates execution state and resumes from where it stopped

**Dependencies:** Issue 5.17

**Acceptance criteria:**
- [ ] Resolution applied to the correct issue
- [ ] Execution resumes from the paused state
- [ ] Resolution logged in execution timeline
- [ ] Invalid resolutions rejected

**Testing expectations:**
- Integration tests for resolve + resume flow

**Security checklist:**
- [ ] Only execution owner can resolve
- [ ] Resolution input validated

---

### Milestone Completion (Issues 5.20–5.21)

---

### Issue 5.20: Implement milestone completion flow

**Purpose:** Handle end-of-milestone: validate integrated state, run test suite, create final PR from milestone branch to main.

**Expected outcome:**
- Detects when all issues in milestone are merged to milestone branch
- Validates integrated state (tests pass against milestone branch)
- Creates final PR from milestone branch → main
- Human review gate before merge to main

**Dependencies:** Issue 5.6

**Acceptance criteria:**
- [ ] Detects milestone completion (all issues merged)
- [ ] Tests pass against milestone branch
- [ ] Final PR created with milestone summary
- [ ] PR requires human review and approval
- [ ] Incomplete milestones cannot generate a final PR

**Testing expectations:**
- Integration tests for completion flow

**Security checklist:**
- [ ] Final PR requires human review
- [ ] Test results sanitized in PR description

---

### Issue 5.21: Create milestone summary generator

**Purpose:** Produce a structured summary of the milestone execution for the final PR body.

**Expected outcome:**
- Summary includes: issues completed, PRs merged, review/fix stats, CI runs, changes summary
- Formatted as Markdown for GitHub PR body

**Dependencies:** Issue 5.20

**Acceptance criteria:**
- [ ] Summary covers all completed issues
- [ ] Stats accurate (fix attempts, CI runs)
- [ ] Formatted as clean Markdown
- [ ] Links to each merged PR

**Testing expectations:**
- Unit tests for summary generation

**Security checklist:**
- [ ] No sensitive data in summary
- [ ] Test results sanitized

---

### Frontend Execution UI (Issues 5.22–5.26)

---

### Issue 5.22: Execution monitor page

**Purpose:** Display live execution status with real-time updates showing current issue, agent status, PR status, CI status.

**Expected outcome (R8 UI design):**
- **View Tabs** — toggle between Chat and Execution views
- **Summary Header** — status badge (running/paused/completed/failed) + progress text ("3/8 issues merged · Milestone 1 of 3")
- **Milestone Accordion** — collapsible section per milestone with progress bar
- **Issue Cards** — title, current step, status badge + **6-step pipeline** visualization: assigned → working → PR → review → CI → merged (each step highlighted based on `ExecutionStep`)
- **Event Log** — scrollable timeline of events with timestamps
- **Escalation Banner** — inline banner when user decision needed, with action buttons

**SSE Event-to-UI Mapping (R8):**
- `issue-start` → new issue card appears with "assigned" step active
- `agent-working` → "working" step highlighted
- `pr-created` → "PR" step highlighted, link to GitHub PR
- `review-complete` → "review" step turns green
- `ci-result` → "CI" step turns green/red
- `merge-complete` → card turns green, summary counter increments
- `issue-error` / `escalation` → card turns red, escalation banner appears

**Dependencies:** Issues 5.7, 5.11

**Acceptance criteria:**
- [ ] Status display updates in real time
- [ ] All lifecycle states represented visually
- [ ] Event timeline shows recent events
- [ ] Deep links to GitHub Issues and PRs

**Testing expectations:**
- E2E test

**Security checklist:**
- [ ] No token data displayed
- [ ] Content escaped

---

### Issue 5.23: Execution controls UI

**Purpose:** Start, Pause, Resume, Stop buttons with confirmation dialogs.

**Expected outcome:**
- Control buttons: Start Execution, Pause, Resume, Stop
- Confirmation dialog before destructive actions (Start, Stop)
- Button states reflect current execution status

**Dependencies:** Issues 5.5, 5.8

**Acceptance criteria:**
- [ ] All controls work correctly
- [ ] Confirmation required for Start and Stop
- [ ] Button states update with execution status
- [ ] Disabled during state transitions

**Testing expectations:**
- E2E test

**Security checklist:**
- [ ] Confirmation prevents accidental starts
- [ ] Controls respect user authorization

---

### Issue 5.24: Escalation inbox UI

**Purpose:** List all issues needing human input, with context and resolution form.

**Expected outcome:**
- List of escalated issues with escalation reason
- Expandable detail view showing full context
- Resolution form with appropriate inputs per escalation type
- Submit resolution and resume

**Dependencies:** Issues 5.18, 5.19

**Acceptance criteria:**
- [ ] All escalated issues listed
- [ ] Context clearly displayed
- [ ] Resolution form validates input
- [ ] Submit triggers resolve endpoint

**Testing expectations:**
- E2E test

**Security checklist:**
- [ ] Escalation context sanitized
- [ ] Resolution input validated

---

### Issue 5.25: Execution history page

**Purpose:** Show completed milestones with summary, timeline, and link to final PR.

**Expected outcome:**
- List of completed milestone executions
- Summary per milestone (issues, PRs, stats)
- Link to the final PR on GitHub

**Dependencies:** Issue 5.20

**Acceptance criteria:**
- [ ] Completed executions listed
- [ ] Summary accurate
- [ ] Links to GitHub PRs

**Testing expectations:**
- E2E test

**Security checklist:**
- [ ] Content escaped

---

### Issue 5.26: Real-time SSE integration for execution

**Purpose:** Stream execution status updates to the frontend via Server-Sent Events, reusing existing SSE infrastructure.

**Expected outcome (R8 design):**
- Uses same `fetch` + `ReadableStream.getReader()` pattern from existing chat SSE consumer in `app.js`
- Client-side `streamExecution(milestoneId, issues, owner, repo, cursor)` function
- Parses SSE `data:` lines, dispatches events to `handleExecutionEvent()` for UI updates
- **Checkpoint persistence** — `checkpoint` events saved to `localStorage` for crash recovery
- **Heartbeat miss detection** — if no heartbeat received within 45s, triggers auto-reconnect with last `cursor` from saved checkpoint
- **Network drop recovery** — on reconnect, POST `/api/execute` with `cursor` parameter to resume from last completed issue
- **AbortController** — exposed for user-initiated abort via control bar

**Dependencies:** Issue 5.22

**Acceptance criteria:**
- [ ] Status changes arrive in browser within seconds
- [ ] Reconnection handled gracefully
- [ ] SSE unsubscribe cleanup (no memory leaks)

**Testing expectations:**
- Integration test for SSE delivery

**Security checklist:**
- [ ] SSE authenticated (same pattern as chat SSE)
- [ ] No internal state leaked in events

---

### Documentation & Tests (Issues 5.27–5.28)

---

### Issue 5.27: End-to-end execution test

**Purpose:** Run a small milestone (3-5 issues) through the full execution loop, from start to final PR.

**Expected outcome:**
- E2E test that creates a milestone with 3-5 small issues
- Starts execution from the web UI
- Verifies: issues assigned, PRs created, reviews processed, CI runs, merges, final PR
- Non-trivial: tests the actual orchestration loop, not mocks

**Dependencies:** All execution issues

**Acceptance criteria:**
- [ ] Full loop completes with minimal human intervention
- [ ] All lifecycle states observed
- [ ] Final PR created correctly
- [ ] Test cleans up GitHub resources

**Testing expectations:**
- Requires `COPILOT_GITHUB_TOKEN` with full scopes
- Uses a dedicated test repo

**Security checklist:**
- [ ] Test uses dedicated test repo
- [ ] Cleanup ensures no stale resources

---

### Issue 5.28: Stage 5 documentation

**Purpose:** Document the execution orchestration architecture, API, and user workflows.

**Expected outcome:**
- Create `docs/next-version-plan/execution-orchestration.md`
- Update `docs/architecture.md` with execution flow
- Update `docs/backend.md` with execution API endpoints
- Update `docs/frontend.md` with execution UI
- Update `AGENTS.md` project map

**Dependencies:** All Stage 5

**Acceptance criteria:**
- [ ] Architecture documented with diagrams
- [ ] All endpoints documented
- [ ] User workflow documented
- [ ] Escalation handling documented

**Testing expectations:** Documentation review

**Security checklist:**
- [ ] No tokens or secrets in documentation
- [ ] Security considerations documented