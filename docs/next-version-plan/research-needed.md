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

### R1: GitHub REST API for Write Operations

**Question:** What GitHub REST API endpoints exist for creating Issues, Milestones, Labels, and Branches? What request format, permissions, and rate limits apply?

**Why it matters:** The web app needs to push planning data to GitHub. The current `tools.ts` only has read tools. We need write tools using the same `githubFetch(token, path)` pattern.

**What to research:**
- `POST /repos/{owner}/{repo}/issues` — create issue (body format, labels, milestone, assignees)
- `POST /repos/{owner}/{repo}/milestones` — create milestone (title, description, due date)
- `POST /repos/{owner}/{repo}/labels` — create label (name, color, description)
- `POST /repos/{owner}/{repo}/git/refs` — create branch (ref name, SHA)
- `PUT /repos/{owner}/{repo}/issues/{number}` — update issue (add to milestone, change labels)
- Rate limits: requests per hour, secondary rate limits for creation endpoints
- Error handling: duplicate names, permission denied, not found
- What PAT scopes are needed for each operation

**Research approach:** Read GitHub REST API docs, test with curl against a test repo, document exact request/response shapes.

**Estimated effort:** 2-4 hours

---

### R2: GitHub Projects v2 (GraphQL API)

**Question:** How do you create and manage GitHub Projects v2 programmatically? Projects v2 uses GraphQL, not REST — what are the mutations, and what permissions are required?

**Why it matters:** The plan calls for creating GitHub Projects to track milestones. Projects v2 is the current GitHub project management system, but it only has a GraphQL API — no REST endpoints.

**What to research:**
- `createProjectV2` mutation — create a project on an org or user
- `addProjectV2ItemById` mutation — add issues to a project
- `updateProjectV2ItemFieldValue` mutation — set status, priority, custom fields
- Project field types: single select (status), text, number, date, iteration
- Authentication: does a fine-grained PAT with `project` scope work?
- Rate limits: GraphQL API has a different rate limit model (point-based)
- Whether the `@octokit/graphql` package should be added, or use raw fetch

**Research approach:** Read GitHub GraphQL API docs for Projects v2, test mutations with GraphQL Explorer, document the full project creation workflow.

**Estimated effort:** 4-6 hours

**Decision point:** If Projects v2 GraphQL is too complex for MVP, we could:
- (A) Skip Projects entirely and use Milestones + Labels for tracking
- (B) Create Projects v2 with basic fields only (title + issues, no custom fields)
- (C) Use the classic Projects REST API (deprecated but simpler)

---

### R3: How to Bridge Web App → Agent Orchestration

**Question:** How does the web app trigger the agent orchestration process? The web app can't use MCP tools (`assign_copilot_to_issue`, `create_branch`, etc.) — those are only available in the GitHub agent runtime.

**Why it matters:** This is the fundamental architecture question. Without answering this, the execution phase (Stage 5) can't be built.

**What to research — three possible approaches:**

#### Option A: Web App Uses GitHub REST API Directly

The web app uses `githubFetch()` to call GitHub REST API for everything:
- Create issues: `POST /repos/{owner}/{repo}/issues`
- Create branches: `POST /repos/{owner}/{repo}/git/refs`
- But **how to assign Copilot coding agent?** There may be no public REST API for this.
- But **how to request Copilot review?** Also possibly no public REST API.

**Key question:** Is there a REST API endpoint to assign the Copilot coding agent to an issue? Or to request Copilot code review on a PR?

#### Option B: Web App Triggers GitHub Actions Workflow

The web app triggers a GitHub Actions workflow via REST API (`POST /repos/{owner}/{repo}/actions/workflows/{id}/dispatches`), passing the milestone/issue data as inputs. The workflow then runs the orchestrator agent.

**Pros:** The orchestrator already works as a GitHub agent. Reuse existing infrastructure.
**Cons:** Less real-time control. Harder to show execution progress in the web UI.

#### Option C: Hybrid — Web App Does Writes, Actions Does Orchestration

The web app creates GitHub Issues and Milestones using REST API. Then it triggers a GitHub Actions workflow that runs the orchestrator for execution (assign agent → review → CI → merge loop). The web app monitors progress by polling GitHub API.

**Pros:** Clean separation — planning in app, execution in Actions. 
**Cons:** Two systems to maintain. Polling for status updates.

**Research approach:** 
1. Search GitHub API docs for "assign copilot to issue" REST endpoint
2. Search for "request copilot review" REST endpoint
3. Test `workflow_dispatch` API to trigger a parameterized workflow
4. Evaluate SSE/webhooks for real-time progress from Actions to web app

**Estimated effort:** 6-8 hours

**This is the most important research item. The entire Stage 5 architecture depends on this decision.**

---

### R4: Copilot Coding Agent API

**Question:** What is the public API surface for interacting with the GitHub Copilot coding agent? Can it be assigned to issues via REST API, or only through the agent runtime's MCP tools?

**Why it matters:** The orchestration loop's core primitive is `assign_copilot_to_issue`. If this is only available as an MCP tool in the agent runtime, the web app can't directly orchestrate execution.

**What to research:**
- Is `assign_copilot_to_issue` a public REST API endpoint or only an MCP tool?
- GitHub's documentation on Copilot coding agent API (if any)
- The Copilot workspace/agent API surface — what's public, what's internal
- Whether posting `@copilot` on an issue works (current docs say it doesn't — verify)
- Whether the `copilot_work_started` / `copilot_work_finished` timeline events are documented
- What happens if you assign the Copilot bot user to an issue (does it trigger the agent?)

**Research approach:** Search GitHub docs, Copilot changelog, GitHub blog posts, and developer forums. Test against a real repo with Copilot enabled.

**Estimated effort:** 4-6 hours

---

### R5: Persistent Planning Storage

**Question:** How should planning data be persisted? The current `InMemoryPlanningStore` loses all data on server restart.

**Why it matters:** For a real project management app, users need planning data to survive server restarts, deployments, and scaling events.

**What to research:**
- Can the existing Azure Table/Blob pattern (from `storage.ts`) be extended for planning entities?
- Table Storage: one table per entity type or one unified table with partition keys?
- Blob Storage: store large fields (technical context, findings) as blobs?
- Indexing: how to efficiently query milestones by goalId, issues by milestoneId?
- Migration: how to migrate from in-memory to Azure Storage without data loss?
- Alternative: `node:sqlite` (since Node.js 22 supports it natively) — already used by the Copilot SDK internally

**Research approach:** Review the existing `storage.ts` pattern, design the table schema, test with Azure Storage Emulator (Azurite).

**Estimated effort:** 3-4 hours

---

## INFORMING Research (Improves Quality, Can Parallel)

### R6: GitHub Copilot SDK — Unused Features

**Question:** Which unused Copilot SDK features could improve the planning experience?

**Why it matters:** The SDK has many unused capabilities that could enhance the user experience.

**What to research:**
- **User input requests** — could the SDK ask the user structured questions during goal definition (instead of free-form chat)?
- **File/image attachments** — could users attach architecture diagrams or wireframes to goals?
- **Reasoning effort control** — could `o1`/`o3` models improve research quality?
- **Planning events** (`planning.started/end`) — could these improve the UX during milestone creation?
- **MCP server integration** — the SDK supports connecting to MCP servers. Could we use this to give the chat agent access to GitHub write tools?

**Key insight:** If the SDK supports MCP server integration, we could potentially create a custom MCP server that wraps GitHub REST API calls. This would let the chat agent create issues, branches, etc. through MCP — bridging the gap identified in R3.

**Research approach:** Read SDK docs, test MCP server integration, evaluate which features are production-ready.

**Estimated effort:** 4-6 hours

---

### R7: GitHub Actions Workflow Dispatch

**Question:** How do you trigger a GitHub Actions workflow programmatically and pass parameters? How do you monitor its progress?

**Why it matters:** If Option B or C from R3 is chosen, the web app needs to trigger and monitor GitHub Actions workflows.

**What to research:**
- `POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches` — what inputs can be passed?
- How to get the run ID of a triggered workflow (it's not returned by the dispatch endpoint)
- How to monitor workflow progress: `GET /repos/{owner}/{repo}/actions/runs/{run_id}`
- How to read workflow logs: `GET /repos/{owner}/{repo}/actions/runs/{run_id}/logs`
- Whether webhooks could push status updates to the web app (instead of polling)
- Fine-grained PAT scopes needed for workflow dispatch

**Research approach:** Read GitHub Actions API docs, test workflow dispatch with a simple workflow, measure latency.

**Estimated effort:** 2-3 hours

---

### R8: Real-Time Progress Updates

**Question:** How can the web app show real-time progress of autonomous execution?

**Why it matters:** Users need visibility into what's happening during a 20+ issue execution chain.

**What to research:**
- **Polling approach:** Web app polls GitHub API for issue/PR status changes. What's the latency? Rate limit cost?
- **Webhook approach:** GitHub sends webhooks on issue/PR events. Requires a public endpoint. Security implications?
- **GitHub Actions approach:** The workflow writes status to a known location (file in repo, issue comment, workflow artifact) that the web app reads.
- **SSE from web app:** The web app's SSE endpoint could stream execution status. How to feed data from GitHub into this stream?

**Research approach:** Prototype each approach, compare latency/complexity/reliability.

**Estimated effort:** 3-4 hours

---

### R9: IssueDraft Quality — What Makes a Good Coding Agent Issue?

**Question:** What issue format produces the best results from the Copilot coding agent? What information does the agent need to succeed?

**Why it matters:** The entire value proposition depends on generating issues that the coding agent can execute without asking questions.

**What to research:**
- Analyze issues from stages 0-3 that the coding agent successfully completed — what made them work?
- Analyze issues where the agent struggled — what was missing?
- Compare issue template fields against what the agent actually used
- Talk to GitHub's Copilot agent documentation about best practices
- Test with varying levels of detail: does more context always help or does it overwhelm?

**Research approach:** Review completed PR history from stages 0-3, analyze agent success/failure patterns.

**Estimated effort:** 2-3 hours

---

### R10: MCP Server Architecture

**Question:** Should the web app expose its planning tools as an MCP server? Could this enable the chat agent to use GitHub write operations?

**Why it matters:** The Copilot SDK supports MCP server connections. If the web app runs an MCP server, the SDK session could potentially access GitHub write tools through it — solving the R3 problem entirely.

**What to research:**
- How does the Copilot SDK connect to MCP servers? (documented in sdk-reference.md as unused feature)
- Can an MCP server expose GitHub REST API wrappers as tools?
- What's the MCP protocol overhead? Latency? Reliability?
- Security: how to scope MCP tool permissions per user?
- Whether this approach is production-ready or experimental in the SDK

**Research approach:** Read MCP specification, test with a minimal MCP server, evaluate SDK integration.

**Estimated effort:** 6-8 hours

---

## Research Priority Matrix

| ID | Topic | Urgency | Blocks | Effort | Recommended Order |
|---|---|---|---|---|---|
| **R1** | GitHub REST API writes | BLOCKING | Stage 4 | 2-4h | **1st** — needed immediately |
| **R4** | Copilot coding agent API | BLOCKING | Stage 5 | 4-6h | **2nd** — determines architecture |
| **R3** | Web app → orchestration bridge | BLOCKING | Stage 5 | 6-8h | **3rd** — depends on R4 findings |
| **R2** | GitHub Projects v2 GraphQL | BLOCKING | Stage 4 | 4-6h | **4th** — or decide to skip |
| **R5** | Persistent storage | BLOCKING | Stage 4 | 3-4h | **5th** — needed for production |
| **R6** | SDK unused features | INFORMING | — | 4-6h | Parallel with R1-R5 |
| **R10** | MCP server architecture | INFORMING | — | 6-8h | Parallel — could change R3 answer |
| **R7** | Actions workflow dispatch | INFORMING | — | 2-3h | After R3 decision |
| **R8** | Real-time progress | INFORMING | — | 3-4h | After R3 decision |
| **R9** | Issue quality analysis | INFORMING | — | 2-3h | Anytime |

**Total estimated research effort:** 35-50 hours

---

## Recommended Research Sprint

Before writing code for Stage 4, spend a focused research sprint:

### Week 1: Critical Path
1. **R1** — GitHub REST API writes (test CRUD for issues, milestones, labels, branches)
2. **R4** — Copilot coding agent API surface (is there a REST endpoint?)
3. **R5** — Persistent storage schema design

### Week 2: Architecture Decision
4. **R3** — Bridge architecture (depends on R4 findings)
5. **R2** — GitHub Projects v2 (decide include/skip)
6. **R10** — MCP server feasibility (could change everything)

### Parallel (During Weeks 1-2)
7. **R6** — SDK feature evaluation
8. **R9** — Issue quality analysis from previous stages

### After Architecture Decision
9. **R7** — Actions workflow dispatch (only if Option B/C chosen)
10. **R8** — Real-time progress approach

---

## Decision Gates

After research, the following decisions must be made before Stage 4 begins:

| Decision | Options | Depends On |
|---|---|---|
| **How does the web app create GitHub resources?** | REST API (custom tools) vs. MCP server vs. SDK MCP integration | R1, R10 |
| **Include GitHub Projects v2?** | Yes (GraphQL) / Partial (basic fields only) / No (use Milestones+Labels) | R2 |
| **How does execution connect to the web app?** | Direct REST / Actions workflow / Hybrid | R3, R4 |
| **What storage backend for planning data?** | Azure Table+Blob / node:sqlite / Both with fallback | R5 |
| **Should the SDK use MCP for GitHub writes?** | Yes (MCP server bridge) / No (REST tools only) | R6, R10 |
