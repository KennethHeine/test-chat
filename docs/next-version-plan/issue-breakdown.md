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
| 4.1 | 4 | Research GitHub REST API for write operations | Research | None |
| 4.2 | 4 | Research GitHub Projects v2 GraphQL API | Research | None |
| 4.3 | 4 | Research Copilot coding agent API surface | Research | None |
| 4.4 | 4 | Research web app → orchestration bridge architecture | Research | None |
| 4.5 | 4 | Research persistent storage approach | Research | None |
| 4.6 | 4 | Create `generate_issue_drafts` tool | Code + Tests | 4.1, Stage 3 |
| 4.7 | 4 | Create `update_issue_draft` tool | Code + Tests | 4.6 |
| 4.8 | 4 | Create `GET /api/milestones/:id/issues` endpoint | Code + Tests | 4.6 |
| 4.9 | 4 | Create `create_github_issue` tool | Code + Tests | 4.1, 4.6 |
| 4.10 | 4 | Create `create_github_milestone` tool | Code + Tests | 4.1 |
| 4.11 | 4 | Create `create_github_project` tool | Code + Tests | 4.2 |
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

### Stage 5: Execution Orchestration Bridge

| # | Stage | Issue Title | Type | Dependencies |
|---|-------|------------|------|-------------|
| 5.1 | 5 | Finalize execution bridge architecture | Research | R3, R4 |
| 5.2 | 5 | Research real-time progress update mechanism | Research | 5.1 |
| 5.3 | 5 | Research MCP server integration for SDK ↔ GitHub bridge | Research | R10 |
| 5.4 | 5 | Create execution state model | Code + Tests | 5.1 |
| 5.5 | 5 | Create `start_execution` API endpoint | Code + Tests | 5.1, Stage 4 |
| 5.6 | 5 | Create execution state machine | Code + Tests | 5.4 |
| 5.7 | 5 | Create `GET /api/executions/:milestoneId/status` endpoint | Code + Tests | 5.4 |
| 5.8 | 5 | Create pause/resume execution endpoints | Code + Tests | 5.5 |
| 5.9 | 5 | Create GitHub Actions workflow for milestone execution | Code | 5.1 |
| 5.10 | 5 | Create `trigger_execution` tool | Code + Tests | 5.9 |
| 5.11 | 5 | Implement execution progress polling | Code + Tests | 5.7 |
| 5.12 | 5 | Implement coding agent assignment mechanism | Code + Tests | 5.1, R4 |
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
> **Effort:** ~22 issues | **Prerequisite:** Stages 0–3 ✅
>
> **See [project-plan-v2.md](./project-plan-v2.md#stage-4-research-sprint--github-integration--planning-dashboard) for stage overview, security table, and feedback checkpoint.**

### Research Phase (Issues 4.1–4.5)

> These research issues produce documentation, not code. They must be resolved before implementation issues begin.

---

### Issue 4.1: Research GitHub REST API for write operations

**Purpose:** Document the GitHub REST API endpoints needed for creating Issues, Milestones, Labels, and Branches from the web app.

**Research ID:** R1 (BLOCKING) — see [research-needed.md](./research-needed.md)

**Expected outcome:**
- Research document in `docs/next-version-plan/research/github-rest-write-api.md`
- Documents: endpoint URLs, request/response formats, required PAT scopes, rate limits, error handling patterns
- Tested with curl against a test repo

**Scope:**
- `POST /repos/{owner}/{repo}/issues` — create issue
- `POST /repos/{owner}/{repo}/milestones` — create milestone
- `POST /repos/{owner}/{repo}/labels` — create label
- `POST /repos/{owner}/{repo}/git/refs` — create branch
- `PUT /repos/{owner}/{repo}/issues/{number}` — update issue
- Rate limits and secondary rate limits for creation endpoints

**Dependencies:** None

**Acceptance criteria:**
- [ ] All endpoints documented with exact request/response formats
- [ ] PAT scope requirements listed per endpoint
- [ ] Rate limit strategy documented
- [ ] Error handling for duplicate names, permission denied, not found
- [ ] Tested against a test repo with curl

**Testing expectations:** Research deliverable only — no code tests

**Security checklist:**
- [ ] Document required PAT scopes (principle of least privilege)
- [ ] Document rate limit thresholds to avoid abuse

---

### Issue 4.2: Research GitHub Projects v2 GraphQL API

**Purpose:** Determine whether to include GitHub Projects v2 support in MVP, and if so, document the required GraphQL mutations.

**Research ID:** R2 (BLOCKING) — see [research-needed.md](./research-needed.md)

**Expected outcome:**
- Research document in `docs/next-version-plan/research/github-projects-v2.md`
- Decision: Full (GraphQL project management) / Partial (basic project creation + issue linking) / Skip (use Milestones + Labels only)
- If include: document GraphQL mutations, authentication, rate limits

**Dependencies:** None

**Acceptance criteria:**
- [ ] Clear include/skip/partial decision with rationale
- [ ] If include: GraphQL mutations documented and tested
- [ ] Complexity assessment (how much code does this add?)
- [ ] Impact on Stage 4 scope documented

**Testing expectations:** Research deliverable only

**Security checklist:**
- [ ] GraphQL-specific rate limiting documented
- [ ] Scope requirements for Projects v2 access

---

### Issue 4.3: Research Copilot coding agent API surface

**Purpose:** Investigate whether there's a REST API endpoint for programmatically assigning the Copilot coding agent to issues, outside of MCP tools.

**Research ID:** R4 (BLOCKING) — see [research-needed.md](./research-needed.md)

**Expected outcome:**
- Research document in `docs/next-version-plan/research/copilot-agent-api.md`
- Documents: available APIs, authentication, limitations
- Clear answer: Can we assign Copilot to an issue from a REST call?

**Dependencies:** None

**Acceptance criteria:**
- [ ] REST API endpoints documented (if they exist)
- [ ] Alternative approaches documented (GitHub Actions, MCP bridge)
- [ ] Authentication requirements for each approach
- [ ] Recommended approach for Stage 5 with pros/cons

**Testing expectations:** Research deliverable only

**Security checklist:**
- [ ] Document permission boundaries for agent assignment
- [ ] Document what the agent can/cannot access

---

### Issue 4.4: Research web app → orchestration bridge architecture

**Purpose:** Determine how the web app (Express server) will connect to the existing agent orchestration process (.github/agents/) to trigger and monitor autonomous execution.

**Research ID:** R3 (BLOCKING) — see [research-needed.md](./research-needed.md)

**Expected outcome:**
- Research document in `docs/next-version-plan/research/execution-bridge.md`
- Evaluates three approaches: Option A (REST API direct), Option B (Actions workflow trigger), Option C (Hybrid)
- Recommended approach with architecture diagram

**Dependencies:** None (but informed by Issue 4.3)

**Acceptance criteria:**
- [ ] All three options evaluated with pros/cons
- [ ] Recommended approach documented with rationale
- [ ] Architecture diagram for the recommended approach
- [ ] Impact on Stage 5 issue structure documented

**Testing expectations:** Research deliverable only

**Security checklist:**
- [ ] Document security boundaries between systems
- [ ] Document authentication flow for cross-system calls

---

### Issue 4.5: Research persistent storage approach

**Purpose:** Decide on the persistent storage backend for planning data (replacing InMemoryPlanningStore).

**Research ID:** R5 (BLOCKING) — see [research-needed.md](./research-needed.md)

**Expected outcome:**
- Research document in `docs/next-version-plan/research/persistent-storage.md`
- Evaluates: Azure Table + Blob (production), node:sqlite (lightweight), Hybrid
- Schema design for the chosen approach
- Migration strategy from InMemoryPlanningStore

**Dependencies:** None

**Acceptance criteria:**
- [ ] Options evaluated with pros/cons (cost, complexity, scalability)
- [ ] Schema design for chosen approach
- [ ] Migration plan from InMemoryPlanningStore interface
- [ ] Data scoping strategy (per-user isolation)

**Testing expectations:** Research deliverable only

**Security checklist:**
- [ ] Data isolation between users
- [ ] Encryption at rest
- [ ] Access control model

---

### IssueDraft Generation (Issues 4.6–4.8)

---

### Issue 4.6: Create `generate_issue_drafts` tool

**Purpose:** Generate detailed, implementation-ready issue drafts from a milestone, with research context baked in.

**Expected outcome:**
- `generate_issue_drafts` tool registered in Copilot SDK session
- Tool accepts a milestone ID and generates `IssueDraft` entities
- Each draft contains: clear problem statement, exact scope, technical context (files, patterns, APIs), dependencies, acceptance criteria, testing expectations, research links

**Dependencies:** Issue 4.1, Stage 3 (milestones)

**Acceptance criteria:**
- [ ] Generates issue drafts with all required IssueDraft fields populated
- [ ] Research item findings baked into relevant issues
- [ ] Issue ordering respects dependency chains
- [ ] Each issue is self-contained enough for a coding agent to implement without asking questions
- [ ] Integration test verifies tool invocation and output structure

**Testing expectations:**
- Integration tests for tool invocation
- Test that generated issues pass the quality gate (all fields populated, dependencies valid)

**Security checklist:**
- [ ] Content sanitized for GitHub API submission
- [ ] No token or credential data in generated issues

---

### Issue 4.7: Create `update_issue_draft` tool

**Purpose:** Allow users to edit any field of a generated issue draft before pushing to GitHub.

**Expected outcome:**
- `update_issue_draft` tool — accepts issue draft ID and partial update
- Updates stored in PlanningStore

**Dependencies:** Issue 4.6

**Acceptance criteria:**
- [ ] Can update any IssueDraft field
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
- `create_github_issue` tool — calls `POST /repos/{owner}/{repo}/issues`
- Takes an IssueDraft id, formats it for GitHub, creates the issue
- Returns the created GitHub issue number and URL
- Updates the IssueDraft status to `created` with the GitHub issue number

**Dependencies:** Issue 4.1, Issue 4.6

**Acceptance criteria:**
- [ ] Creates a real GitHub issue from an IssueDraft
- [ ] Issue body contains all relevant fields formatted as Markdown
- [ ] Milestone association set if GitHub Milestone exists
- [ ] Labels applied if configured
- [ ] IssueDraft status updated to `created`
- [ ] Handles duplicate creation gracefully (idempotent)

**Testing expectations:**
- Integration tests against a real GitHub test repo

**Security checklist:**
- [ ] Requires explicit user approval before creation
- [ ] Uses user's own PAT (no elevated permissions)
- [ ] Content sanitized before API submission
- [ ] Rate limit handling (backoff on 403/429)

---

### Issue 4.10: Create `create_github_milestone` tool

**Purpose:** Create a GitHub Milestone from a planning Milestone.

**Expected outcome:**
- `create_github_milestone` tool — calls `POST /repos/{owner}/{repo}/milestones`
- Takes a planning milestone ID, creates the GitHub Milestone
- Returns the GitHub milestone number

**Dependencies:** Issue 4.1

**Acceptance criteria:**
- [ ] Creates a GitHub Milestone with title, description, due date
- [ ] Handles existing milestones gracefully (idempotent)
- [ ] Milestone number stored back on the planning Milestone entity

**Testing expectations:**
- Integration tests against a real GitHub test repo

**Security checklist:**
- [ ] Requires explicit user approval
- [ ] Milestone names sanitized
- [ ] Uses user's own PAT

---

### Issue 4.11: Create `create_github_project` tool

**Purpose:** Create a GitHub Project v2 and add issues to it (scope depends on R2 research decision).

**Expected outcome:**
- If R2 = Full: `create_github_project` tool using GraphQL mutations
- If R2 = Partial: basic project creation + issue linking
- If R2 = Skip: this issue is skipped entirely

**Dependencies:** Issue 4.2

**Acceptance criteria:**
- [ ] Decision from R2 implemented
- [ ] If implemented: project created with issues linked
- [ ] If skipped: issue closed with rationale

**Testing expectations:**
- Integration tests if implemented; n/a if skipped

**Security checklist:**
- [ ] GraphQL mutations use user's own PAT
- [ ] Requires explicit user approval

---

### Issue 4.12: Create `create_github_branch` and `manage_github_labels` tools

**Purpose:** Set up GitHub repository infrastructure (milestone branches and tracking labels).

**Expected outcome:**
- `create_github_branch` tool — calls `POST /repos/{owner}/{repo}/git/refs` to create a milestone branch
- `manage_github_labels` tool — creates labels for milestone/issue categorization
- Both handle existing resources gracefully (idempotent)

**Dependencies:** Issue 4.1

**Acceptance criteria:**
- [ ] Branch created from specified base SHA with naming convention (e.g., `milestone/{name}`)
- [ ] Labels created with consistent color scheme
- [ ] Both tools handle duplicates without error
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

### Issue 4.13: Implement persistent PlanningStore backend

**Purpose:** Replace InMemoryPlanningStore with a persistent storage backend so planning data survives server restarts.

**Expected outcome:**
- New storage implementation (Azure Table+Blob, node:sqlite, or hybrid — based on R5 decision)
- Implements the existing `PlanningStore` interface
- Drop-in replacement for InMemoryPlanningStore
- Migration path: environment variable selects backend

**Dependencies:** Issue 4.5

**Acceptance criteria:**
- [ ] Implements full `PlanningStore` interface
- [ ] Data survives server restart
- [ ] Data scoped to authenticated user (no cross-user access)
- [ ] Existing unit tests pass with new backend
- [ ] Fallback to InMemoryPlanningStore when storage is unavailable

**Testing expectations:**
- Unit tests (same suite as InMemoryPlanningStore)
- Integration tests for persistence across restart

**Security checklist:**
- [ ] Data isolation between users
- [ ] No plaintext tokens in storage
- [ ] Connection strings via environment variables

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
- Summary page showing all GitHub mutations that will be created (issues, milestone, labels, branch, project)
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
- If R2 = include: tests for `create_github_project`
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

## Stage 5: Execution Orchestration Bridge

> **Goal:** Connect the web app to the existing agent orchestration process, enabling users to start, monitor, and control autonomous milestone execution from the browser.
>
> **Effort:** ~28 issues | **Prerequisite:** Stage 4 ✅ + Research R3, R4 resolved
>
> **See [project-plan-v2.md](./project-plan-v2.md#stage-5-execution-orchestration-bridge) for stage overview, security table, and feedback checkpoint.**
>
> **Note:** The exact architecture depends on research decisions from Stage 4 (R3: bridge approach, R4: Copilot agent API). Issues below use the likely "hybrid" approach. This will be adjusted based on research findings.

### Research Finalization (Issues 5.1–5.3)

---

### Issue 5.1: Finalize execution bridge architecture

**Purpose:** Based on R3/R4 research findings from Stage 4, finalize and document the architecture for connecting the web app to the agent orchestration process.

**Expected outcome:**
- `docs/next-version-plan/execution-architecture.md` with finalized architecture
- Sequence diagrams for: start execution, monitor progress, pause/resume, escalation
- API contract between web app and orchestration layer

**Dependencies:** R3, R4 from Stage 4

**Acceptance criteria:**
- [ ] Architecture documented with diagrams
- [ ] API contracts defined
- [ ] Security boundaries documented
- [ ] Decision rationale captured

**Testing expectations:** Research deliverable only

**Security checklist:**
- [ ] Authentication flow between systems documented
- [ ] Permission boundaries defined

---

### Issue 5.2: Research real-time progress update mechanism

**Purpose:** Determine how execution progress reaches the browser — polling GitHub API, webhook relay, or Actions-based hybrid.

**Research ID:** R8 — see [research-needed.md](./research-needed.md)

**Expected outcome:**
- Research document with recommended approach
- Latency analysis for each option
- Implementation complexity comparison

**Dependencies:** Issue 5.1

**Acceptance criteria:**
- [ ] Options evaluated with latency and complexity
- [ ] Recommended approach documented
- [ ] Impact on frontend implementation documented

**Testing expectations:** Research deliverable only

**Security checklist:**
- [ ] Webhook security (if using webhooks)

---

### Issue 5.3: Research MCP server integration for SDK ↔ GitHub bridge

**Purpose:** Investigate whether the Copilot SDK can use MCP servers directly, potentially simplifying the bridge between the web app and GitHub write operations.

**Research ID:** R10 — see [research-needed.md](./research-needed.md)

**Expected outcome:**
- Research document on MCP integration possibilities
- Decision: does this change the bridge architecture?

**Dependencies:** R10

**Acceptance criteria:**
- [ ] MCP server integration capability documented
- [ ] Impact on bridge architecture assessed
- [ ] Recommendation documented

**Testing expectations:** Research deliverable only

**Security checklist:**
- [ ] MCP sandboxing requirements documented

---

### Execution Engine Core (Issues 5.4–5.8)

---

### Issue 5.4: Create execution state model

**Purpose:** Extend the data model to track milestone execution state, mirroring the orchestrator-state.json schema for web app consumption.

**Expected outcome:**
- Execution state types: `ExecutionState`, `IssueExecution`, `ExecutionEvent`
- Tracks each issue through: pending → agent-working → pr-ready → review-requested → review-fixes-needed → ci-ready → ci-passed → merged
- Persisted in PlanningStore (or dedicated execution store)

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

### Issue 5.5: Create `start_execution` API endpoint

**Purpose:** Initialize milestone execution — creates GitHub infrastructure and triggers the orchestration process.

**Expected outcome:**
- `POST /api/executions/:milestoneId/start` endpoint
- Creates milestone branch and labels (using Stage 4 tools)
- Triggers the orchestration process (via Actions workflow or direct API based on R3)
- Returns execution ID

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

### GitHub Actions Integration (Issues 5.9–5.12)

---

### Issue 5.9: Create GitHub Actions workflow for milestone execution

**Purpose:** Create a parameterized `workflow_dispatch` workflow that runs the orchestrator agent for a milestone.

**Expected outcome:**
- `.github/workflows/execute-milestone.yml` workflow
- Accepts inputs: milestone ID, branch name, issue list
- Runs the orchestrator agent with the provided context

**Dependencies:** Issue 5.1

**Acceptance criteria:**
- [ ] Workflow triggered via `workflow_dispatch` API
- [ ] Inputs validated
- [ ] Orchestrator agent runs with correct context
- [ ] Workflow logs accessible for debugging

**Testing expectations:**
- Manual test of workflow dispatch

**Security checklist:**
- [ ] Workflow permissions scoped to minimum required
- [ ] Input sanitization in workflow

---

### Issue 5.10: Create `trigger_execution` tool

**Purpose:** Call the GitHub Actions `workflow_dispatch` API to start the orchestrator workflow.

**Expected outcome:**
- `trigger_execution` tool — calls `POST /repos/{owner}/{repo}/actions/workflows/{id}/dispatches`
- Passes milestone data as workflow inputs
- Returns workflow run ID

**Dependencies:** Issue 5.9

**Acceptance criteria:**
- [ ] Workflow triggered successfully
- [ ] Correct inputs passed
- [ ] Run ID returned for monitoring
- [ ] Error handling for missing workflow or permissions

**Testing expectations:**
- Integration tests (requires token with Actions scope)

**Security checklist:**
- [ ] Validates workflow exists before triggering
- [ ] Uses user's own PAT

---

### Issue 5.11: Implement execution progress polling

**Purpose:** Poll GitHub API to track what the orchestrator is doing — issue timeline events, PR status, CI status.

**Expected outcome:**
- Polling service that checks GitHub API at regular intervals
- Updates execution state based on: issue timeline events, PR status changes, CI workflow completions
- Feeds updates into the execution state machine

**Dependencies:** Issue 5.7

**Acceptance criteria:**
- [ ] Polls at configurable interval (default: 30 seconds)
- [ ] Detects all major events (agent assigned, PR opened, review completed, CI pass/fail, merge)
- [ ] Updates execution state correctly
- [ ] Respects GitHub API rate limits

**Testing expectations:**
- Integration tests with mock GitHub API responses
- Test rate limit handling

**Security checklist:**
- [ ] Polling uses user's PAT
- [ ] Exponential backoff on errors

---

### Issue 5.12: Implement coding agent assignment mechanism

**Purpose:** Enable the web app to assign the Copilot coding agent to an issue, using whatever mechanism R4 research determined.

**Expected outcome:**
- Based on R4 decision: REST API call, Actions workflow trigger, or MCP bridge
- Agent assignment tracked in execution state
- Timeout detection (agent doesn't start within expected timeframe)

**Dependencies:** Issue 5.1, R4

**Acceptance criteria:**
- [ ] Can assign Copilot coding agent to a specific issue
- [ ] Assignment confirmed (tracked in execution state)
- [ ] Timeout detection for hung assignments
- [ ] Error handling for assignment failures

**Testing expectations:**
- Integration tests (requires Copilot access)

**Security checklist:**
- [ ] Agent scoped to milestone branch
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

**Dependencies:** Issue 5.11

**Acceptance criteria:**
- [ ] Detects workflow completion (pass/fail)
- [ ] Failure logs extracted and summarized
- [ ] Handles multiple workflow runs per PR

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

**Purpose:** Display live execution status — current issue, agent status, PR status, CI status.

**Expected outcome:**
- Real-time status display for the active execution
- Shows: current issue being worked on, agent status, PR status, CI status
- Event timeline showing recent actions

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

**Expected outcome:**
- Execution status changes streamed via SSE
- Frontend auto-updates without polling
- Reuses the existing SSE endpoint pattern

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
