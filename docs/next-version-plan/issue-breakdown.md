# Issue Breakdown: Implementation-Ready Issues for Next Version

> **Status:** Stages 0–3 complete (12 issues). Stages 4–5 defined below (~50 issues).
>
> **Parent docs:** [goal.md](./goal.md) — Product vision | [project-plan-v2.md](./project-plan-v2.md) — Stage definitions | [research-needed.md](./research-needed.md) — Research items
>
> Each issue below is designed to be assigned to a GitHub Copilot coding agent. Issues are ordered by dependency and grouped by stage. All issues reference the parent planning issue.
>
> **GitHub-first principle:** This app is an orchestration tool built on top of GitHub. All features available in GitHub (Projects, Issues, Milestones, Labels, Actions) should be preferred over building custom alternatives. The app handles planning and research; GitHub handles execution and tracking.
>
> **Updated 2026-03-11:** Restructured from 26 issues (stages 0-6) to ~62 issues (stages 0-5). Old stages 4-6 replaced with new stages 4-5 to match [project-plan-v2.md](./project-plan-v2.md).

---

## Issue Index

### Stages 0–3: COMPLETE ✅

| # | Stage | Issue Title | Type | Status |
|---|-------|------------|------|--------|
| 1 | 0 | Define planning data model interfaces | Code + Tests | ✅ Complete |
| 2 | 0 | Implement InMemoryPlanningStore | Code + Tests | ✅ Complete |
| 3 | 0 | Document data model | Docs | ✅ Complete |
| 4 | 1 | Create goal definition tools | Code + Tests | ✅ Complete |
| 5 | 1 | Create goal API endpoints | Code + Tests | ✅ Complete |
| 6 | 1 | Frontend goal summary display | Code + Tests | ✅ Complete |
| 7 | 2 | Create research workflow tools | Code + Tests | ✅ Complete |
| 8 | 2 | Create research API endpoints | Code + Tests | ✅ Complete |
| 9 | 2 | Frontend research checklist display | Code + Tests | ✅ Complete |
| 10 | 3 | Create milestone planning tools | Code + Tests | ✅ Complete |
| 11 | 3 | Create milestone API endpoints | Code + Tests | ✅ Complete |
| 12 | 3 | Frontend milestone timeline view | Code + Tests | ✅ Complete |

### Stage 4: Research Sprint + GitHub Integration + Planning Dashboard

| # | Stage | Issue Title | Type | Dependencies |
|---|-------|------------|------|-------------|
| 4.1 | 4 | Research GitHub REST API for write operations | Research | None | ✅ Complete |
| 4.2 | 4 | Research GitHub Projects v2 GraphQL API | Research | None | ✅ Complete (skip for MVP) |
| 4.3 | 4 | Research Copilot coding agent API surface | Research | None | ✅ Complete (R3 core + R4 deep-dive) |
| 4.4 | 4 | Research web app → orchestration bridge architecture | Research | None | ✅ Complete (Option A: direct REST API) |
| 4.5 | 4 | Research persistent storage approach | Research | None | ✅ Complete (Azure Table Storage, separate tables, FK PartitionKeys) |
| 4.6a | 4 | Extend `IssueDraft` interface with R9 fields + `FileRef` | Code + Tests | Stage 0 |
| 4.6 | 4 | Create `generate_issue_drafts` tool | Code + Tests | 4.1, 4.6a, Stage 3 |
| 4.7 | 4 | Create `update_issue_draft` tool | Code + Tests | 4.6 |
| 4.8 | 4 | Create `GET /api/milestones/:id/issues` endpoint | Code + Tests | 4.6 |
| 4.9 | 4 | Create `create_github_issue` tool | Code + Tests | 4.1, 4.6 |
| 4.10 | 4 | Create `create_github_milestone` tool | Code + Tests | 4.1 |
| 4.11 | 4 | ~~Create `create_github_project` tool~~ (SKIPPED) | ~~Code + Tests~~ | 4.2 |
| 4.12 | 4 | Create `create_github_branch` and `manage_github_labels` tools | Code + Tests | 4.1 |
| 4.13 | 4 | Implement persistent PlanningStore backend | Code + Tests | 4.5 |
| 4.14 | 4 | Planning dashboard layout | Code | None |
| 4.15 | 4 | Goal overview page | Code | 4.14 |
| 4.16 | 4 | Research tracker page | Code | 4.14 |
| 4.17 | 4 | Milestone timeline page | Code | 4.14 |
| 4.18 | 4 | Issue draft manager page | Code | 4.14, 4.6 |
| 4.19 | 4 | GitHub push approval workflow | Code | 4.9–4.12, 4.18 |
| 4.20 | 4 | Enhance AI research suggestions | Code + Tests | Stage 2 |
| 4.21 | 4 | Integration tests for GitHub write tools | Tests | 4.9–4.12 |
| 4.22 | 4 | Stage 4 documentation | Docs | All Stage 4 |
| 4.23 | 4 | Add planning/intent/subagent event forwarding to SSE | Code + Tests | None |
| 4.24 | 4 | Add reasoning effort control (conditional UI + session config) | Code + Tests | None |
| 4.25 | 4 | Implement user input requests (`onUserInputRequest` + POST endpoint) | Code + Tests | None |
| 4.26 | 4 | Update `sdk-reference.md` Sections 8-9 (correct outdated entries) | Docs | 4.23 |

### Stage 5: Execution Orchestration Bridge

| # | Stage | Issue Title | Type | Dependencies |
|---|-------|------------|------|-------------|
| 5.1 | 5 | Document execution bridge architecture (Option A: direct REST API) | Docs | R3 ✅, R4 ✅ |
| 5.2 | 5 | Research real-time progress update mechanism | Research | 5.1 | ✅ Complete (Polling + SSE primary; Webhooks optional; R8) |
| 5.3 | 5 | ~~Research MCP server integration~~ (CLOSED by R6, confirmed by R10) | ~~Research~~ | R10 ✅ (closed, confirmed) |
| 5.4 | 5 | Create execution state model | Code + Tests | 5.1 |
| 5.5 | 5 | Create `start_execution` API endpoint (POST /api/execute, SSE) | Code + Tests | 5.1, Stage 4 |
| 5.6 | 5 | Create execution state machine | Code + Tests | 5.4 |
| 5.7 | 5 | Create `GET /api/executions/:milestoneId/status` endpoint | Code + Tests | 5.4 |
| 5.8 | 5 | Create pause/resume execution endpoints | Code + Tests | 5.5 |
| 5.9 | 5 | Create `assign_copilot_agent` tool (REST API) | Code + Tests | 5.1 |
| 5.10 | 5 | Create `request_copilot_review` tool (REST API) | Code + Tests | 5.9 |
| 5.11 | 5 | Implement execution progress polling (timeline events) | Code + Tests | 5.7 |
| 5.12 | 5 | Create `post_copilot_fix` tool (@copilot comments) | Code + Tests | 5.11 |
| 5.13 | 5 | Implement PR review monitoring | Code + Tests | 5.11 |
| 5.14 | 5 | Implement review fix posting | Code + Tests | 5.13 |
| 5.15 | 5 | Implement CI status monitoring | Code + Tests | 5.11 |
| 5.16 | 5 | Implement CI fix posting | Code + Tests | 5.15 |
| 5.17 | 5 | Implement stop gate detection | Code + Tests | 5.6 |
| 5.18 | 5 | Create escalation message system | Code + Tests | 5.17 |
| 5.19 | 5 | Create resolve endpoint for escalated issues | Code + Tests | 5.17 |
| 5.20 | 5 | Implement milestone completion flow | Code + Tests | 5.6 |
| 5.21 | 5 | Create milestone summary generator | Code + Tests | 5.20 |
| 5.22 | 5 | Execution monitor page | Code | 5.7, 5.11 |
| 5.23 | 5 | Execution controls UI | Code | 5.5, 5.8 |
| 5.24 | 5 | Escalation inbox UI | Code | 5.18, 5.19 |
| 5.25 | 5 | Execution history page | Code | 5.20 |
| 5.26 | 5 | Real-time SSE integration for execution | Code | 5.22 |
| 5.27 | 5 | End-to-end execution test | Tests | All execution issues |
| 5.28 | 5 | Stage 5 documentation | Docs | All Stage 5 |

---

## Stages 0–3: COMPLETE ✅

> **Do not modify** — these are historical records of implemented issues.

<details>
<summary>Stage 0: Data Model Foundation (3 issues — COMPLETE)</summary>

### Issue 1: Define planning data model interfaces

**Purpose:** Establish the TypeScript interfaces that all planning features build upon.

**Expected outcome:**
- New file `planning-types.ts` with exported interfaces: `Goal`, `ResearchItem`, `Milestone`, `IssueDraft`
- Each interface has JSDoc comments explaining fields
- All fields use strict types (no `any`)

**Dependencies:** None

**Acceptance criteria:**
- [x] `npx tsc --noEmit` passes with zero errors
- [x] All interfaces exported and importable from `planning-types.ts`
- [x] Each field has a JSDoc comment
- [x] No `any` types used

---

### Issue 2: Implement InMemoryPlanningStore

**Purpose:** Provide an in-memory implementation of the planning data storage for development and testing.

**Expected outcome:**
- New file `planning-store.ts` with `PlanningStore` interface and `InMemoryPlanningStore` class
- Full CRUD for all four entity types: Goal, ResearchItem, Milestone, IssueDraft
- Input validation on create/update operations

**Dependencies:** Issue #1

**Acceptance criteria:**
- [x] Full CRUD operations for Goal, ResearchItem, Milestone, IssueDraft
- [x] Input validation prevents creating entities with missing required fields
- [x] Circular dependency detection for milestones
- [x] Unit tests pass

---

### Issue 3: Document data model

**Purpose:** Create documentation for the planning data model.

**Expected outcome:**
- `docs/next-version-plan/data-model.md` documenting all interfaces and relationships

**Dependencies:** Issue #1

**Acceptance criteria:**
- [x] All four entity types documented with field descriptions
- [x] Entity relationships documented
- [x] Data model diagram included

</details>

<details>
<summary>Stage 1: Goal Definition (3 issues — COMPLETE)</summary>

### Issue 4: Create goal definition tools

**Purpose:** Enable the agent to guide users through structured goal definition.

**Expected outcome:**
- `define_goal` tool — structured goal definition through conversation
- `save_goal` tool — persist goal to PlanningStore
- `get_goal` tool — retrieve a saved goal

**Dependencies:** Issue #2

**Acceptance criteria:**
- [x] Tools registered in Copilot SDK session
- [x] Goal saved with all required fields
- [x] Integration tests pass

---

### Issue 5: Create goal API endpoints

**Purpose:** Expose goal data via REST API.

**Expected outcome:**
- `GET /api/goals` and `GET /api/goals/:id` endpoints

**Dependencies:** Issue #2

**Acceptance criteria:**
- [x] Goals returned with all fields
- [x] Authentication enforced

---

### Issue 6: Frontend goal summary display

**Purpose:** Show goal summary card in the chat interface.

**Expected outcome:**
- Goal summary card rendered in chat after `save_goal` completes
- Card shows: intent, goal, problem statement, success criteria

**Dependencies:** Issue #5

**Acceptance criteria:**
- [x] Goal card renders correctly in chat
- [x] Content properly escaped (XSS prevention)
- [x] Works with dark theme

</details>

<details>
<summary>Stage 2: Research Workflow (3 issues — COMPLETE)</summary>

### Issue 7: Create research workflow tools

**Purpose:** Enable the agent to generate and manage research checklists.

**Expected outcome:**
- `generate_research_checklist` tool — creates research items for a goal
- `update_research_item` tool — update findings and status
- `get_research` tool — retrieve research items

**Dependencies:** Issue #4

**Acceptance criteria:**
- [x] Research items generated with appropriate categories
- [x] Items can be updated with findings
- [x] Integration tests pass

---

### Issue 8: Create research API endpoints

**Purpose:** Expose research data via REST API.

**Expected outcome:**
- `GET /api/goals/:id/research` endpoint

**Dependencies:** Issue #2

**Acceptance criteria:**
- [x] Research items returned grouped by category
- [x] Authentication enforced

---

### Issue 9: Frontend research checklist display

**Purpose:** Show research items in the chat interface.

**Expected outcome:**
- Research checklist rendered in chat with status indicators

**Dependencies:** Issue #8

**Acceptance criteria:**
- [x] Research items display with status
- [x] Content properly escaped

</details>

<details>
<summary>Stage 3: Milestone Planning (3 issues — COMPLETE)</summary>

### Issue 10: Create milestone planning tools

**Purpose:** Enable the agent to decompose goals into structured milestones.

**Expected outcome:**
- `create_milestone_plan` tool — decomposes goal into ordered milestones
- `update_milestone` tool — edit milestone fields
- `get_milestones` tool — retrieve milestones for a goal

**Dependencies:** Issue #7

**Acceptance criteria:**
- [x] Milestones have correct ordering
- [x] Dependencies validated
- [x] Circular dependencies detected and rejected

---

### Issue 11: Create milestone API endpoints

**Purpose:** Expose milestone data via REST API.

**Expected outcome:**
- `GET /api/goals/:id/milestones` endpoint

**Dependencies:** Issue #2

**Acceptance criteria:**
- [x] Milestones returned in order
- [x] Authentication enforced

---

### Issue 12: Frontend milestone timeline view

**Purpose:** Display milestones in the chat interface.

**Expected outcome:**
- Milestone timeline rendered showing name, status, dependencies

**Dependencies:** Issue #11

**Acceptance criteria:**
- [x] Timeline shows milestones in order with status
- [x] Dependencies visually indicated

</details>

---

## Stage 4: Research Sprint + GitHub Integration + Planning Dashboard

> **Goal:** Complete critical research, build GitHub write tools, implement IssueDraft generation, add persistent storage, and create a planning dashboard.
>
> **Effort:** ~26 issues | **Prerequisite:** Stages 0–3 ✅
>
> **See [project-plan-v2.md](./project-plan-v2.md#stage-4-research-sprint--github-integration--planning-dashboard) for stage overview, security table, and feedback checkpoint.**

### Research Phase (Issues 4.1–4.5)

> These research issues produce documentation, not code. They must be resolved before implementation issues begin.

---

### Issue 4.1: Research GitHub REST API for write operations ✅ COMPLETE

**Purpose:** Document the GitHub REST API endpoints needed for creating Issues, Milestones, Labels, and Branches from the web app.

**Research ID:** R1 (✅ COMPLETE) — see [R1-github-rest-api-writes.md](./research/R1-github-rest-api-writes.md)

**Expected outcome:**
- Research document in `docs/next-version-plan/research/R1-github-rest-api-writes.md`
- Documents: endpoint URLs, request/response formats, required PAT scopes, rate limits, error handling patterns

**Scope:**
- `POST /repos/{owner}/{repo}/issues` — create issue
- `POST /repos/{owner}/{repo}/milestones` — create milestone
- `POST /repos/{owner}/{repo}/labels` — create label
- `POST /repos/{owner}/{repo}/git/refs` — create branch
- `PATCH /repos/{owner}/{repo}/issues/{number}` — update issue
- Rate limits and secondary rate limits for creation endpoints

**Dependencies:** None

**Acceptance criteria:**
- [x] All endpoints documented with exact request/response formats
- [x] PAT scope requirements listed per endpoint (Issues write + Contents write)
- [x] Rate limit strategy documented (1s delay between writes, monitor `x-ratelimit-remaining`)
- [x] Error handling for duplicate names, permission denied, not found
- [x] `githubWrite()` helper pattern proposed for `tools.ts`

**Testing expectations:** Research deliverable only — no code tests

**Security checklist:**
- [x] Required PAT scopes documented (Issues write + Contents write — principle of least privilege)
- [x] Rate limit thresholds documented (5,000/hr primary, 80/min + 500/hr secondary for writes)

---

### Issue 4.2: Research GitHub Projects v2 GraphQL API ✅ COMPLETE

**Purpose:** Determine whether to include GitHub Projects v2 support in MVP, and if so, document the required GraphQL mutations.

**Research ID:** R2 (✅ COMPLETE) — see [R2-github-projects-v2-graphql.md](./research/R2-github-projects-v2-graphql.md)

**Expected outcome:**
- Research document in `docs/next-version-plan/research/R2-github-projects-v2-graphql.md`
- Decision: Full (GraphQL project management) / Partial (basic project creation + issue linking) / Skip (use Milestones + Labels only)
- If include: document GraphQL mutations, authentication, rate limits

**Key Findings:**
- Fine-grained PATs (`github_pat_`) cannot access user-owned Projects v2 — documented GitHub limitation, no timeline for resolution
- All GraphQL mutations exist for full CRUD (`createProjectV2`, `addProjectV2ItemById`, `updateProjectV2ItemFieldValue`)
- Rate limits generous — 42 mutations uses <1% of hourly budget
- Raw `githubGraphQL()` helper pattern documented for future use

**Decision:** **(A) Skip Projects v2 for MVP** — use Milestones + Labels for tracking. Fine-grained PAT limitation blocks personal repos (primary use case). Patterns documented for future implementation.

**Acceptance criteria:**
- [x] Clear include/skip/partial decision with rationale
- [x] GraphQL mutations documented (in research file, for future reference)
- [x] Complexity assessment (how much code does this add?)
- [x] Impact on Stage 4 scope documented (Issue 4.11 skipped)

**Testing expectations:** Research deliverable only

**Security checklist:**
- [ ] GraphQL-specific rate limiting documented
- [ ] Scope requirements for Projects v2 access

---

### Issue 4.3: Research Copilot coding agent API surface ✅ COMPLETE (resolved by R3, deep-dive in R4)

**Purpose:** Investigate whether there's a REST API endpoint for programmatically assigning the Copilot coding agent to issues, outside of MCP tools.

**Research ID:** R4 (✅ COMPLETE) — see [R4-copilot-coding-agent-api.md](./research/R4-copilot-coding-agent-api.md) for detailed API schemas, code examples, and agent limitations. Core findings first established in [R3-web-app-orchestration-bridge.md](./research/R3-web-app-orchestration-bridge.md).

**Key Findings:**
- GitHub has **public REST APIs** for Copilot coding agent assignment
- Assign `copilot-swe-agent[bot]` via standard issue assignee endpoints with `agent_assignment` body
- `agent_assignment` schema (R4): `target_repo` (string, optional), `base_branch` (string, optional), `custom_instructions` (string, optional), `custom_agent` (string, optional), `model` (string, optional)
- PAT needs 5 fine-grained permissions: metadata (read), actions (r/w), contents (r/w), issues (r/w), pull_requests (r/w)
- GraphQL alternative also exists (`addAssigneesToAssignable` with `agentAssignment`) — REST recommended for simplicity
- Two-phase monitoring (R4): poll issue timeline for `cross-referenced` → PR number, then poll PR timeline for `copilot_work_finished`/`copilot_work_finished_failure`
- No webhook alternative exists; polling is the only monitoring approach (R4)
- Reviews always COMMENTED — never APPROVED/CHANGES_REQUESTED; dual reviewer bot identity: match both logins (R4)
- Agent limitations: single repo, `copilot/` branch prefix, cannot merge/approve PRs (R4)
- API is Public Preview — implementation should be defensive (R4)

**Decision:** REST API is fully available. No MCP bridge or Actions trigger needed.

**Acceptance criteria:**
- [x] REST API endpoints documented (in R3 research file)
- [x] Alternative approaches documented (GraphQL, MCP bridge — not needed)
- [x] Authentication requirements documented
- [x] Recommended approach for Stage 5 with pros/cons

---

### Issue 4.4: Research web app → orchestration bridge architecture ✅ COMPLETE

**Purpose:** Determine how the web app (Express server) will connect to the existing agent orchestration process (.github/agents/) to trigger and monitor autonomous execution.

**Research ID:** R3 (✅ COMPLETE) — see [R3-web-app-orchestration-bridge.md](./research/R3-web-app-orchestration-bridge.md)

**Key Findings:**
- GitHub has **public REST APIs** for Copilot coding agent assignment and code review — the original assumption that these were MCP-only was wrong
- **Option A (direct REST API) is the recommended approach** — simplest architecture, reuses existing patterns
- Option B (Actions workflow) is overcomplicated now that REST API is available
- Option C (Hybrid) adds no benefit over Option A
- All monitoring patterns exist in the codebase (`wait-for-agent.ps1`, `wait-for-review.ps1`) and translate directly to TypeScript
- New components: `execution.ts`, `POST /api/execute` (SSE endpoint), `POST /api/execute/abort`

**Decision:** **Option A — Web App Uses REST API Directly.** The web app orchestrates the entire execution loop: create issues, assign Copilot agent, poll for completion, request Copilot review, post fix requests, trigger CI via labels, merge PRs. All via REST API using the user's PAT. Progress streamed to browser via SSE.

**Impact on Stage 5:**
- Issues 5.9-5.12 changed from "GitHub Actions Integration" to "REST API Execution Tools"
- No `execute-milestone.yml` workflow needed
- No `trigger_execution` tool needed (replaced by `assign_copilot_agent`)
- Issue 5.3 (MCP server research) deprioritized
- PAT scopes expanded: actions+contents+issues+pull_requests (read+write)

**Acceptance criteria:**
- [x] All three options evaluated with pros/cons
- [x] Recommended approach documented with rationale
- [x] Architecture diagram for the recommended approach
- [x] Impact on Stage 5 issue structure documented

---

### Issue 4.5: Research persistent storage approach ✅ COMPLETE

**Purpose:** Decide on the persistent storage backend for planning data (replacing InMemoryPlanningStore).

**Research ID:** R5 (✅ COMPLETE) — see [R5-persistent-planning-storage.md](./research/R5-persistent-planning-storage.md)

**Key Findings:**
- **Azure Table Storage** is the clear choice — zero additional infrastructure, proven pattern in `storage.ts`
- **Separate tables per entity type:** `plangoals` (PK=sessionId, RK=goalId), `planresearch` (PK=goalId, RK=itemId), `planmilestones` (PK=goalId, RK=milestoneId), `planissues` (PK=milestoneId, RK=draftId)
- **All fields fit in Table Storage** — no blob offload needed (worst-case entity ~80 KB, limit 1 MiB)
- **Array properties** (successCriteria, assumptions, etc.) serialized as JSON strings
- **node:sqlite eliminated** — data lost on scale-to-zero, SMB locking risks, architectural inconsistency
- **Zero interface changes** — add `AzurePlanningStore` class + `createPlanningStore()` factory
- **Per-user isolation** enforced at API layer via `getOwnedGoal()`; PartitionKey hierarchy (sessionId→goalId→milestoneId) naturally scopes data
- **No Bicep changes** — existing storage account supports unlimited tables
- **Cost:** <$0.01/month

**Decision:** Azure Table Storage with separate tables and foreign key PartitionKeys.

**Dependencies:** None

**Acceptance criteria:**
- [x] Options evaluated with pros/cons (cost, complexity, scalability)
- [x] Schema design for chosen approach
- [x] Migration plan from InMemoryPlanningStore interface
- [x] Data scoping strategy (per-user isolation)

**Testing expectations:** Research deliverable only

**Security checklist:**
- [x] Data isolation between users (API-layer ownership via `getOwnedGoal()`, PartitionKey hierarchy)
- [x] Encryption at rest (Azure Storage default)
- [x] Access control model (DefaultAzureCredential, user's PAT not stored in table)

---

### IssueDraft Generation (Issues 4.6–4.8)

---

### Issue 4.6a: Extend `IssueDraft` interface with R9 quality fields

**Purpose:** Add the 5 new fields identified by R9 research to the `IssueDraft` interface, plus a new `FileRef` interface. These fields are prerequisites for generating high-quality coding agent issues in Issue 4.6.

**Research ID:** R9 (✅ COMPLETE) — see [R9-issue-draft-quality.md](./research/R9-issue-draft-quality.md)

**Expected outcome:**
- New `FileRef` interface in `planning-types.ts`: `{ path: string, reason: string }`
- 5 new fields on `IssueDraft` interface:
  - `filesToModify: FileRef[]` — files to create or modify, with per-file reasons (R9: most impactful missing field)
  - `filesToRead: FileRef[]` — context files to read before implementation (R9: agent orientation)
  - `patternReference?: string` — existing file/pattern to follow (R9: strongest predictor of clean first-pass code)
  - `securityChecklist: string[]` — per-issue security validation rules (R9: prevents review fix loops)
  - `verificationCommands: string[]` — exact self-check commands (R9: enables agent self-verification)
- `PlanningStore` validation updated: `filesToModify`/`filesToRead` elements require non-empty `path` and `reason`
- `InMemoryPlanningStore` handles new fields
- Existing unit tests updated; new tests for `FileRef` validation
- `data-model.md` already updated (done during R9 integration)

**Files to modify:**
- `planning-types.ts` — add `FileRef` interface + 5 new `IssueDraft` fields
- `planning-store.ts` — update validation for new fields
- `planning-store.test.ts` — add tests for new fields and `FileRef` validation

**Pattern to follow:** Follow the existing field addition pattern in `planning-types.ts` and validation pattern in `planning-store.ts`.

**Dependencies:** Stage 0 (existing IssueDraft interface)

**Acceptance criteria:**
- [ ] `FileRef` interface exported from `planning-types.ts`
- [ ] All 5 new fields present on `IssueDraft` interface with JSDoc comments
- [ ] `PlanningStore.createIssueDraft` validates `FileRef` elements have non-empty `path` and `reason`
- [ ] Existing unit tests still pass
- [ ] New unit tests for `FileRef` validation
- [ ] `npx tsc --noEmit` passes

**Testing expectations:**
- Unit tests in `planning-store.test.ts`

**Security checklist:**
- [ ] `FileRef.path` validated (no path traversal patterns)

---

### Issue 4.6: Create `generate_issue_drafts` tool

**Purpose:** Generate detailed, implementation-ready issue drafts from a milestone, with research context baked in.

**Expected outcome:**
- `generate_issue_drafts` tool registered in Copilot SDK session
- Tool accepts a milestone ID and generates `IssueDraft` entities
- Each draft contains: clear problem statement, exact scope, technical context (files, patterns, APIs), dependencies, acceptance criteria, testing expectations, research links
- **R9 quality requirements:** Each draft also contains `filesToModify`, `filesToRead`, `patternReference` (where applicable), `securityChecklist`, and `verificationCommands`
- Tool validates generated drafts against the **Issue Quality Checklist** (R9) before saving:
  - Has clear problem statement (`problem` non-empty, <1000 chars)
  - Has acceptance criteria (≥1 criterion, each testable)
  - Has file references (`filesToModify` ≥1 file with reason)
  - Has scope boundaries (includes "Out of scope" items)
  - Has test expectations (names specific test commands)
  - Has verification commands (≥1 runnable command)
  - Appropriate scope (≤5 files modified, ≤1 layer: backend OR frontend)
  - Pattern reference (optional but strongly recommended)
  - Research context (required if research was conducted)
  - Security checklist (required if accepting user input)

**Dependencies:** Issue 4.1, Issue 4.6a (R9 interface extension), Stage 3 (milestones)

**Acceptance criteria:**
- [ ] Generates issue drafts with all required IssueDraft fields populated (including R9 fields: `filesToModify`, `filesToRead`, `patternReference`, `securityChecklist`, `verificationCommands`)
- [ ] Generated drafts pass R9 Issue Quality Checklist validation
- [ ] Research item findings baked into relevant issues (rendered in `technicalContext` and `researchLinks`)
- [ ] Issue ordering respects dependency chains
- [ ] Each issue is self-contained enough for a coding agent to implement without asking questions
- [ ] Integration test verifies tool invocation and output structure

**Testing expectations:**
- Integration tests for tool invocation
- Test that generated issues pass the quality gate (all fields populated, dependencies valid, R9 checklist passes)

**Security checklist:**
- [ ] Content sanitized for GitHub API submission
- [ ] No token or credential data in generated issues

---

### Issue 4.7: Create `update_issue_draft` tool

**Purpose:** Allow users to edit any field of a generated issue draft before pushing to GitHub.

**Expected outcome:**
- `update_issue_draft` tool — accepts issue draft ID and partial update
- Updates stored in PlanningStore
- Supports updating all IssueDraft fields including R9 fields (`filesToModify`, `filesToRead`, `patternReference`, `securityChecklist`, `verificationCommands`)

**Dependencies:** Issue 4.6

**Acceptance criteria:**
- [ ] Can update any IssueDraft field (including R9 fields)
- [ ] `FileRef` elements validated on update (non-empty `path` and `reason`)
- [ ] Validates updated content
- [ ] Integration test for update operation

**Testing expectations:**
- Integration tests

**Security checklist:**
- [ ] Input validation on all user-provided fields
- [ ] Content sanitized

---

### Issue 4.8: Create `GET /api/milestones/:id/issues` endpoint

**Purpose:** Expose issue drafts via REST API for the planning dashboard.

**Expected outcome:**
- `GET /api/milestones/:id/issues` — returns issue drafts for a milestone
- Returns drafts ordered by sequence, includes all fields

**Dependencies:** Issue 4.6

**Acceptance criteria:**
- [ ] Returns issue drafts in correct order
- [ ] Authentication required
- [ ] Empty array for milestones with no drafts

**Testing expectations:**
- Integration tests

**Security checklist:**
- [ ] Authentication enforced, milestone-scoped access

---

### GitHub Write Tools (Issues 4.9–4.12)

---

### Issue 4.9: Create `create_github_issue` tool

**Purpose:** Push an approved IssueDraft to GitHub as a real issue.

**Expected outcome:**
- `create_github_issue` tool — calls `POST /repos/{owner}/{repo}/issues` (201 Created)
- Takes an IssueDraft id, formats it for GitHub, creates the issue
- Returns the created GitHub issue `number` and `html_url`
- Updates the IssueDraft status to `created` with the GitHub issue number

**R1 Technical Details:**
- Request body: `{ title, body, labels?, assignees?, milestone? }` — milestone is the GitHub milestone **number** (not ID)
- Labels/assignees on update **REPLACE** entirely — always include the full desired set
- Response: `{ id, number, html_url, state, created_at }`
- Without push access, changes to `milestone`, `labels`, `assignees` are **silently dropped** — verify response matches expectations
- Uses new `githubWrite(token, "POST", path, body)` helper (created in Issue 4.10)

**Dependencies:** Issue 4.1 ✅, Issue 4.6, Issue 4.10 (for `githubWrite()` helper)

**Acceptance criteria:**
- [ ] Creates a real GitHub issue from an IssueDraft
- [ ] Issue body contains all relevant fields formatted as Markdown (including R9 fields: file references, pattern reference, security checklist, verification commands)
- [ ] **Research Context** section rendered in issue body from `researchLinks` (R9 finding: template currently drops this)
- [ ] Milestone association set if GitHub Milestone exists (uses milestone `number`)
- [ ] Labels applied if configured
- [ ] IssueDraft status updated to `created`
- [ ] Handles duplicate creation gracefully (idempotent)
- [ ] Verifies response fields match expected values (silent failure detection)

**Testing expectations:**
- Integration tests against a real GitHub test repo

**Security checklist:**
- [ ] Requires explicit user approval before creation
- [ ] Uses user's own PAT (no elevated permissions)
- [ ] Content sanitized before API submission
- [ ] Rate limit handling (backoff on 403/429)

---

### Issue 4.10: Create `create_github_milestone` tool

**Purpose:** Create a GitHub Milestone from a planning Milestone. **Also introduces the `githubWrite()` helper** used by all subsequent write tools.

**Expected outcome:**
- New `githubWrite(token, method, path, body)` helper added to `tools.ts` (R1 confirmed pattern)
- `create_github_milestone` tool — calls `POST /repos/{owner}/{repo}/milestones` (201 Created)
- Takes a planning milestone ID, creates the GitHub Milestone
- Returns the GitHub milestone `number` (stored back on the planning Milestone for issue association)

**R1 Technical Details:**
- Request body: `{ title, description?, due_on? }` — `due_on` is ISO 8601 format
- Response: `{ number, id, html_url, state, open_issues, closed_issues }`
- Update via `PATCH /repos/{owner}/{repo}/milestones/{number}` (200 OK) — all body params optional
- The `number` field is critical: issues reference milestones by `number`, not `id`

**Dependencies:** Issue 4.1 ✅

**Acceptance criteria:**
- [ ] `githubWrite()` helper created in `tools.ts` with method + body support
- [ ] Creates a GitHub Milestone with title, description, due date
- [ ] Handles existing milestones gracefully (idempotent)
- [ ] Milestone `number` and `html_url` stored back on the planning Milestone entity

**Testing expectations:**
- Integration tests against a real GitHub test repo

**Security checklist:**
- [ ] Requires explicit user approval
- [ ] Milestone names sanitized
- [ ] Uses user's own PAT

---

### Issue 4.11: ~~Create `create_github_project` tool~~ — SKIPPED

**Purpose:** ~~Create a GitHub Project v2 and add issues to it.~~

**Status:** SKIPPED — R2 research determined that fine-grained PATs (`github_pat_`) cannot access user-owned Projects v2. Since this app requires fine-grained PATs and the primary audience uses personal repos, Projects v2 is not viable for MVP. Use Milestones + Labels for tracking instead.

**Future:** If GitHub resolves the fine-grained PAT limitation, all GraphQL patterns are documented in [R2-github-projects-v2-graphql.md](./research/R2-github-projects-v2-graphql.md) — including `createProjectV2`, `addProjectV2ItemById`, `updateProjectV2ItemFieldValue` mutations, a ready-to-use `githubGraphQL()` helper, and rate limit analysis.

**Dependencies:** Issue 4.2 ✅

**Acceptance criteria:**
- [x] Decision from R2 implemented (Skip)
- [x] Issue closed with rationale

---

### Issue 4.12: Create `create_github_branch` and `manage_github_labels` tools

**Purpose:** Set up GitHub repository infrastructure (milestone branches and tracking labels).

**Expected outcome:**
- `create_github_branch` tool — two-step process (R1 confirmed):
  1. `GET /repos/{owner}/{repo}/git/ref/heads/{base_branch}` to get base SHA
  2. `POST /repos/{owner}/{repo}/git/refs` with `{ ref: "refs/heads/{name}", sha }` (201 Created)
- `manage_github_labels` tool — `POST /repos/{owner}/{repo}/labels` with `{ name, color?, description? }` (201 Created)
  - Color is hex **without** `#` prefix (e.g., `f29513`)
- Both handle existing resources gracefully (idempotent)

**R1 Technical Details:**
- Branch duplicate: creating an existing ref returns `422 Validation Failed` — catch and treat as success
- Label duplicate: returns `422` with `errors[].code === "already_exists"` — catch and treat as success
- Uses `githubWrite()` helper from Issue 4.10

**Dependencies:** Issue 4.1 ✅, Issue 4.10 (for `githubWrite()` helper)

**Acceptance criteria:**
- [ ] Branch created from specified base SHA with naming convention (e.g., `milestone/{name}`)
- [ ] Labels created with consistent color scheme
- [ ] Both tools handle duplicates without error (422 `already_exists` caught)
- [ ] Branch names sanitized (no special characters)

**Testing expectations:**
- Integration tests against a real GitHub test repo

**Security checklist:**
- [ ] Branch names sanitized
- [ ] Label names sanitized
- [ ] Requires explicit user approval

---

### Persistent Storage (Issue 4.13)

---

### Issue 4.13: Implement `AzurePlanningStore` backend

**Purpose:** Replace InMemoryPlanningStore with Azure Table Storage so planning data survives server restarts.

**Expected outcome (R5 confirmed):**
- New `AzurePlanningStore` class in `planning-store.ts` implementing `PlanningStore` interface
- 4 separate Azure tables: `plangoals` (PK=sessionId, RK=goalId), `planresearch` (PK=goalId, RK=itemId), `planmilestones` (PK=goalId, RK=milestoneId), `planissues` (PK=milestoneId, RK=draftId)
- Array properties (successCriteria, assumptions, constraints, risks, acceptanceCriteria, exitCriteria, dependencies, researchLinks, securityChecklist, verificationCommands) serialized as JSON strings
- Object array properties (`filesToModify`, `filesToRead`) serialized as JSON strings (each element is a `FileRef` object)
- `createPlanningStore(accountName?)` factory function — returns `AzurePlanningStore` if `accountName` is provided, else `InMemoryPlanningStore`
- `initialize()` method creates all 4 tables (ignore 409 conflict)
- `getGoal(goalId)` uses RowKey filter across all partitions as fallback (acceptable at low volume <50 goals)
- Server.ts changes: `createPlanningStore(storageAccountName || undefined)` + call `initialize()` if Azure
- No Bicep changes — existing storage account supports unlimited tables

**Implementation pattern:** Follow `AzureSessionStore` in `storage.ts` exactly:
- Constructor takes `accountName`, creates 4 `TableClient` instances via `DefaultAzureCredential`
- `initialize()` calls `createTable()` + catch 409 for all 4 tables
- Upsert with `"Merge"` mode, delete with 404 catch
- Entity-to-type mapping helpers (serialize arrays with `JSON.stringify`, deserialize with `JSON.parse`)

**Dependencies:** Issue 4.5 ✅

**Acceptance criteria:**
- [ ] Implements full `PlanningStore` interface (20+ methods)
- [ ] Data survives server restart
- [ ] Per-user isolation via PartitionKey hierarchy + API-layer `getOwnedGoal()` checks
- [ ] Existing unit tests pass with new backend (extract shared test suite)
- [ ] Fallback to InMemoryPlanningStore when `accountName` not provided
- [ ] Array properties correctly round-trip through JSON serialization

**Testing expectations:**
- Extract shared test suite from `planning-store.test.ts` into a function that accepts any `PlanningStore`
- Run shared suite against both `InMemoryPlanningStore` and `AzurePlanningStore`
- Integration tests for Azure backend gated by env var (like session store)

**Security checklist:**
- [ ] Data isolation between users (API-layer ownership checks)
- [ ] No plaintext tokens in storage (tokens never stored; PK hierarchy uses sessionId/goalId/milestoneId)
- [ ] Connection via `DefaultAzureCredential` (no connection strings in code)

---

### Planning Dashboard UI (Issues 4.14–4.19)

---

### Issue 4.14: Planning dashboard layout

**Purpose:** Create the top-level dashboard layout with sidebar navigation for Goals, Research, Milestones, and Issues — separate from the chat interface.

**Expected outcome:**
- Dashboard accessible from a navigation toggle (chat ↔ dashboard)
- Sidebar with sections: Goals, Research, Milestones, Issues
- Content area for each section
- Consistent with existing dark theme

**Dependencies:** None

**Acceptance criteria:**
- [ ] Dashboard layout renders with sidebar navigation
- [ ] Can toggle between chat and dashboard
- [ ] Dark theme consistent with existing UI
- [ ] Responsive layout

**Testing expectations:**
- E2E test for navigation

**Security checklist:**
- [ ] No token data displayed
- [ ] Content areas escape all user content

---

### Issue 4.15: Goal overview page

**Purpose:** View all goals, drill into one, see research/milestone/issue counts.

**Expected outcome:**
- Goal list showing all goals with status and counts
- Detail view for a single goal with summary, success criteria, linked milestones

**Dependencies:** Issue 4.14

**Acceptance criteria:**
- [ ] Goal list displays all goals
- [ ] Detail view shows all goal fields
- [ ] Milestone/research/issue counts accurate
- [ ] Data loads from existing API endpoints

**Testing expectations:**
- E2E test

**Security checklist:**
- [ ] Content escaped

---

### Issue 4.16: Research tracker page

**Purpose:** View research items by category with status indicators and edit findings.

**Expected outcome:**
- Research items grouped by category
- Status indicators (not-started, in-progress, resolved)
- Inline editing of findings field

**Dependencies:** Issue 4.14

**Acceptance criteria:**
- [ ] Research items displayed grouped by category
- [ ] Status indicators visible
- [ ] Edit findings and save

**Testing expectations:**
- E2E test

**Security checklist:**
- [ ] Content escaped
- [ ] Edit submissions validated

---

### Issue 4.17: Milestone timeline page

**Purpose:** View ordered milestones with dependencies, status, and issue counts.

**Expected outcome:**
- Milestones displayed in order
- Dependency arrows/connections between milestones
- Issue count per milestone
- Status indicators

**Dependencies:** Issue 4.14

**Acceptance criteria:**
- [ ] Milestones in correct order
- [ ] Dependencies visually indicated
- [ ] Issue counts accurate

**Testing expectations:**
- E2E test

**Security checklist:**
- [ ] Content escaped

---

### Issue 4.18: Issue draft manager page

**Purpose:** View, edit, reorder issues, approve for GitHub push, preview GitHub format.

**Expected outcome:**
- Issue list for a selected milestone
- Expandable issue cards with all fields
- Edit fields inline
- Preview how the issue will look on GitHub
- Approve individual issues or batch-approve

**Dependencies:** Issue 4.14, Issue 4.6

**Acceptance criteria:**
- [ ] Issue drafts listed in order
- [ ] All fields viewable and editable
- [ ] GitHub preview renders Markdown correctly
- [ ] Approve/batch-approve updates issue status

**Testing expectations:**
- E2E test

**Security checklist:**
- [ ] Content escaped (both display and preview)
- [ ] Approval requires explicit action

---

### Issue 4.19: GitHub push approval workflow

**Purpose:** Let users review all planned GitHub mutations, confirm, and execute the batch push.

**Expected outcome:**
- Summary page showing all GitHub mutations that will be created (issues, milestone, labels, branch)
- Diff-like view: "These N issues will be created, this milestone will be created..."
- Confirm button executes the batch
- Progress indicator showing which mutations completed
- Rollback information if partial failure

**Dependencies:** Issues 4.9–4.12, Issue 4.18

**Acceptance criteria:**
- [ ] All planned mutations listed with details
- [ ] User must explicitly confirm before execution
- [ ] Progress shown during batch execution
- [ ] Partial failures handled gracefully (report what succeeded, what failed)
- [ ] Created GitHub resources linked back to planning entities

**Testing expectations:**
- E2E test for the approval workflow
- Integration test for batch creation

**Security checklist:**
- [ ] Confirmation required — no silent creation
- [ ] Rate limiting respected during batch
- [ ] Uses user's own PAT

---

### AI Research Suggestions (Issue 4.20)

---

### Issue 4.20: Enhance AI research suggestions

**Purpose:** Make `generate_research_checklist` smarter by detecting integration mentions, framework references, and infrastructure requirements in the user's goal and milestone plan, then suggesting targeted research items.

**Expected outcome:**
- Enhanced `generate_research_checklist` tool that analyzes plan content
- Detects: API mentions (e.g., "Stripe"), framework references, infrastructure needs, integration points
- Generates targeted research suggestions (e.g., "Your plan requires Stripe integration — should we research their webhook API?")

**Dependencies:** Stage 2 (existing research tools)

**Acceptance criteria:**
- [ ] Detects at least 3 categories of research triggers (API, framework, infrastructure)
- [ ] Suggestions include specific research questions
- [ ] Suggestions are relevant to the plan content (not generic)
- [ ] Integration test verifies suggestion quality

**Testing expectations:**
- Integration tests with sample plans that trigger different suggestion types

**Security checklist:**
- [ ] Suggestions don't expose system internals
- [ ] Plan content not sent to external services (uses Copilot SDK only)

---

### Documentation & Integration Tests (Issues 4.21–4.22)

---

### Issue 4.21: Integration tests for all GitHub write tools

**Purpose:** Ensure all GitHub write tools work correctly against a real GitHub test repo.

**Expected outcome:**
- Integration tests for: `create_github_issue`, `create_github_milestone`, `create_github_branch`, `manage_github_labels`
- Tests create real GitHub resources and verify they exist
- Cleanup: tests clean up created resources after verification

**Dependencies:** Issues 4.9–4.12

**Acceptance criteria:**
- [ ] Each GitHub write tool tested against real API
- [ ] Tests verify resource creation and field accuracy
- [ ] Tests handle rate limits gracefully
- [ ] Tests clean up after themselves

**Testing expectations:**
- Requires `COPILOT_GITHUB_TOKEN` with write scopes

**Security checklist:**
- [ ] Tests use a dedicated test repo, not production
- [ ] Tests do not leave stale resources

---

### Issue 4.22: Stage 4 documentation

**Purpose:** Update all relevant documentation for Stage 4 changes.

**Expected outcome:**
- Update `docs/backend.md` with new tools and endpoints
- Update `docs/frontend.md` with dashboard documentation
- Create `docs/next-version-plan/github-integration.md` documenting the GitHub write tool architecture
- Update `AGENTS.md` project map if new files were added

**Dependencies:** All Stage 4

**Acceptance criteria:**
- [ ] All new tools documented
- [ ] All new endpoints documented
- [ ] Dashboard documented with screenshots or descriptions
- [ ] GitHub integration architecture documented

**Testing expectations:** Documentation review

**Security checklist:**
- [ ] No tokens or secrets in documentation
- [ ] Security considerations documented

---

### SDK Feature Enhancements (Issues 4.23–4.26)

> R6 research identified SDK features that improve planning UX with minimal effort. These follow the existing `session.on()` → SSE pattern in `server.ts` and require no architectural changes.

---

### Issue 4.23: Add planning/intent/subagent event forwarding to SSE

**Purpose:** Forward SDK planning, intent, subagent, and compaction events to the browser via SSE, enabling real-time status indicators during agent operations.

**Research ID:** R6 SQ7 — see [R6-sdk-unused-features.md](./research/R6-sdk-unused-features.md)

**Expected outcome:**
- New `session.on()` listeners in `POST /api/chat` for: `session.mode_changed`, `assistant.intent`, `subagent.started`, `subagent.completed`, `subagent.failed`, `session.compaction_start`, `session.compaction_complete`
- SSE events emitted: `planning_start` (→"plan" mode), `plan_ready` (exit plan mode), `intent` (status text), `subagent_start`, `subagent_end`, `compaction`
- Frontend renders: "Planning..." spinner, status text ("Exploring codebase..."), sub-agent progress counter, "Optimizing context..." badge

**R6 Critical Correction:** `planning.started` and `planning.end` events listed in `sdk-reference.md` **do not exist in the SDK**. The real events are `session.mode_changed` (with `previousMode`/`newMode` fields), `session.plan_changed`, and `exit_plan_mode.requested` (with `summary`, `planContent`, `actions[]`, `recommendedAction`).

**Implementation:** ~85 lines total. Each event is ~5 lines following the identical `session.on()` → `res.write(SSE)` pattern already established for `tool.execution_start`, `session.title_changed`, and `assistant.usage`.

**Dependencies:** None

**Acceptance criteria:**
- [ ] All 7 event types forwarded to SSE
- [ ] Frontend displays appropriate status indicators
- [ ] Unsubscribe cleanup follows existing pattern (no memory leaks)
- [ ] Integration test verifies SSE event emission

**Testing expectations:**
- Integration tests for event forwarding
- E2E test for frontend indicator rendering

**Security checklist:**
- [ ] Event data sanitized before SSE emission
- [ ] No internal state leaked in event payloads

---

### Issue 4.24: Add reasoning effort control

**Purpose:** Allow users to select reasoning effort level for models that support it (e.g., `o4-mini`), improving research quality with an explicit cost/quality trade-off.

**Research ID:** R6 SQ4 — see [R6-sdk-unused-features.md](./research/R6-sdk-unused-features.md)

**Expected outcome:**
- Backend: `buildSessionConfig()` accepts `reasoningEffort` parameter; passed to `createSession()` config
- Frontend: Conditional `<select>` dropdown shown when selected model has `capabilities.supports.reasoningEffort === true`
- Levels: `low`, `medium`, `high`, `xhigh` (from `supportedReasoningEfforts` array on model metadata)
- Default: `defaultReasoningEffort` from model metadata
- `/api/models` response already includes model capabilities — frontend reads `supportedReasoningEfforts` field

**Implementation:** ~30 lines backend (accept parameter, pass to config) + ~20 lines frontend (conditional dropdown, pass with chat request).

**Dependencies:** None

**Acceptance criteria:**
- [ ] Dropdown appears only for models with reasoning support
- [ ] Selected effort level passed to session config
- [ ] Default matches model's `defaultReasoningEffort`
- [ ] Integration test verifies reasoning effort in session config

**Testing expectations:**
- Integration test with a reasoning-capable model
- E2E test for conditional dropdown rendering

**Security checklist:**
- [ ] Effort level validated against allowed values from model metadata (not user-arbitrary strings)

---

### Issue 4.25: Implement user input requests

**Purpose:** Enable the Copilot agent to ask structured questions mid-conversation (e.g., multiple-choice selections during goal definition), bridging the SDK's `ask_user` tool to the SSE-based frontend.

**Research ID:** R6 SQ2 — see [R6-sdk-unused-features.md](./research/R6-sdk-unused-features.md)

**Expected outcome:**
- Backend: `onUserInputRequest` callback added to `buildSessionConfig()` return object
- Backend: New `POST /api/chat/input` endpoint to receive user answers (resolves pending Promise)
- Backend: `pendingInputs` Map scoped per SSE connection with timeout handling
- SSE event: `{ type: "user_input_request", requestId, question, choices?, allowFreeform? }`
- Frontend: Renders choice buttons or freeform text input; POSTs answer to `/api/chat/input`

**Flow:**
1. Agent invokes `ask_user` → SDK calls `onUserInputRequest` → server blocks (Promise)
2. Server sends SSE event with question/choices to browser
3. Browser renders UI, user selects/types answer
4. Browser POSTs to `/api/chat/input` → server resolves Promise → agent continues

**Implementation:** ~15 lines `onUserInputRequest` handler + ~20 lines POST endpoint + ~50 lines frontend UI + timeout handling.

**Dependencies:** None

**Acceptance criteria:**
- [ ] Agent can request user input via `ask_user` tool
- [ ] Choices and freeform questions both supported
- [ ] Answer delivered back to agent, conversation continues
- [ ] Timeout after configurable duration (prevents hanging sessions)
- [ ] Pending requests cleaned up on SSE disconnect

**Testing expectations:**
- Integration test for the POST endpoint and Promise resolution
- E2E test for the full flow (agent asks → user answers → agent continues)

**Security checklist:**
- [ ] `requestId` validated (UUID format, exists in pending map)
- [ ] Answer content sanitized
- [ ] Pending request map cleaned up on disconnect (no memory leaks)

---

### Issue 4.26: Update `sdk-reference.md` Sections 8-9

**Purpose:** Correct outdated "unused feature" entries in `sdk-reference.md` that no longer reflect the codebase state, and fix incorrect event names.

**Research ID:** R6 — see [R6-sdk-unused-features.md](./research/R6-sdk-unused-features.md) "Codebase Correction" section

**Expected outcome:**
- Section 8 updated: mark custom tools, session hooks, system message, tool events, title events, usage events, session resumption, and permission handler as **implemented**
- Section 8 event table: remove non-existent `planning.started`/`planning.end`; replace with `session.mode_changed`, `session.plan_changed`, `exit_plan_mode.requested`
- Section 9 recommendations: mark already-implemented items as complete
- Add new "Remaining Unused Features" list: MCP, user input requests, reasoning effort, file attachments, BYOK, custom agents, fleet mode, planning/intent/subagent events, compaction events, reasoning delta events, `session.disconnect()`

**Dependencies:** Issue 4.23 (so the newly implemented events are reflected)

**Acceptance criteria:**
- [ ] All 7 outdated entries corrected (R6 finding)
- [ ] Non-existent event names removed
- [ ] Remaining unused features listed accurately
- [ ] Section reflects current codebase state

**Testing expectations:** Documentation review only

**Security checklist:**
- [ ] No secrets or tokens in documentation

---

## Stage 5: Execution Orchestration Bridge

> **Goal:** Connect the web app to the existing agent orchestration process, enabling users to start, monitor, and control autonomous milestone execution from the browser.
>
> **Effort:** ~28 issues | **Prerequisite:** Stage 4 ✅ + Research R3, R4 resolved
>
> **See [project-plan-v2.md](./project-plan-v2.md#stage-5-execution-orchestration-bridge) for stage overview, security table, and feedback checkpoint.**
>
> **Architecture decided (R3, deepened by R4):** The web app uses **Option A: direct REST API** to orchestrate execution. No GitHub Actions workflow bridge needed. Copilot coding agent is assigned via `copilot-swe-agent[bot]` assignee + `agent_assignment` REST body (target_repo, base_branch, custom_instructions, custom_agent, model). Review via `copilot-pull-request-reviewer[bot]` (match both bot logins; reviews always COMMENTED). Progress via two-phase timeline polling: issue timeline → PR timeline (20s). No webhook alternative. API is Public Preview. Issues below reflect this decision.

### Research Finalization (Issues 5.1–5.3)

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
