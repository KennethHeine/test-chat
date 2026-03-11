# Stage 4: Research Sprint + GitHub Integration + Planning Dashboard

> **Parent:** [issue-breakdown.md](../issue-breakdown.md) | [project-plan-v2.md](../project-plan-v2.md#stage-4-research-sprint--github-integration--planning-dashboard)

---

> **Goal:** Build GitHub write tools, implement IssueDraft generation, add persistent storage, SDK enhancements, and create a planning dashboard.
>
> **Effort:** 21 implementation issues | **Prerequisite:** Stages 0–3 ✅, Research R1–R5 ✅
>
> **See [project-plan-v2.md](./project-plan-v2.md#stage-4-research-sprint--github-integration--planning-dashboard) for stage overview, security table, and feedback checkpoint.**

### Orchestrator Sequence (Stage 4)

> **Branch:** `stage-4/github-integration-dashboard`
> **Stage goal:** Build GitHub write tools, IssueDraft generation, persistent storage, SDK enhancements, and planning dashboard.
>
> This table defines the **linear execution order** for the orchestrator. All research (4.1–4.5) is complete and 4.11 is skipped — only implementation issues below.

| Seq | Original | Title | Type | Depends On (seq) | Files to Modify | Files to Read |
|-----|----------|-------|------|-------------------|-----------------|---------------|
| 1 | 4.6a | Extend `IssueDraft` interface with R9 fields + `FileRef` | Code + Tests | None | `planning-types.ts`, `planning-store.ts`, `planning-store.test.ts` | `docs/next-version-plan/data-model.md`, `docs/next-version-plan/research/R9-issue-draft-quality.md` |
| 2 | 4.10 | Create `create_github_milestone` tool + `githubWrite()` helper | Code + Tests | None | `tools.ts`, `server.ts` | `docs/next-version-plan/research/R1-github-rest-api-writes.md`, `planning-tools.ts` |
| 3 | 4.6 | Create `generate_issue_drafts` tool | Code + Tests | 1 | `planning-tools.ts`, `server.ts` | `planning-types.ts`, `planning-store.ts`, `docs/next-version-plan/research/R9-issue-draft-quality.md` |
| 4 | 4.7 | Create `update_issue_draft` tool | Code + Tests | 3 | `planning-tools.ts`, `server.ts` | `planning-types.ts`, `planning-store.ts` |
| 5 | 4.8 | Create `GET /api/milestones/:id/issues` endpoint | Code + Tests | 3 | `server.ts` | `planning-store.ts`, `planning-types.ts` |
| 6 | 4.9 | Create `create_github_issue` tool | Code + Tests | 2, 3 | `tools.ts`, `server.ts` | `planning-types.ts`, `docs/next-version-plan/research/R1-github-rest-api-writes.md` |
| 7 | 4.12 | Create `create_github_branch` + `manage_github_labels` tools | Code + Tests | 2 | `tools.ts`, `server.ts` | `docs/next-version-plan/research/R1-github-rest-api-writes.md` |
| 8 | 4.13 | Implement `AzurePlanningStore` persistent backend | Code + Tests | None | `planning-store.ts`, `planning-store.test.ts`, `server.ts` | `storage.ts`, `docs/next-version-plan/research/R5-persistent-planning-storage.md` |
| 9 | 4.23 | Add planning/intent/subagent event forwarding to SSE | Code + Tests | None | `server.ts`, `public/app.js` | `docs/next-version-plan/research/R6-sdk-unused-features.md` |
| 10 | 4.24 | Add reasoning effort control (conditional UI + session config) | Code + Tests | None | `server.ts`, `public/app.js`, `public/index.html` | `docs/next-version-plan/research/R6-sdk-unused-features.md` |
| 11 | 4.25 | Implement user input requests (`onUserInputRequest` + POST endpoint) | Code + Tests | None | `server.ts`, `public/app.js`, `public/index.html` | `docs/next-version-plan/research/R6-sdk-unused-features.md` |
| 12 | 4.14 | Planning dashboard layout | Code | None | `public/index.html`, `public/app.js` | `docs/frontend.md` |
| 13 | 4.15 | Goal overview page | Code | 12 | `public/app.js`, `public/index.html` | `server.ts` (goal endpoints) |
| 14 | 4.16 | Research tracker page | Code | 12 | `public/app.js`, `public/index.html` | `server.ts` (research endpoints) |
| 15 | 4.17 | Milestone timeline page | Code | 12 | `public/app.js`, `public/index.html` | `server.ts` (milestone endpoints) |
| 16 | 4.18 | Issue draft manager page | Code | 3, 12 | `public/app.js`, `public/index.html` | `server.ts`, `planning-types.ts` |
| 17 | 4.19 | GitHub push approval workflow | Code | 6, 7, 16 | `public/app.js`, `public/index.html` | `tools.ts`, `server.ts` |
| 18 | 4.20 | Enhance AI research suggestions | Code + Tests | None | `planning-tools.ts` | `planning-types.ts`, `planning-store.ts` |
| 19 | 4.21 | Integration tests for GitHub write tools | Tests | 6, 7 | `test.ts` | `tools.ts`, `server.ts` |
| 20 | 4.26 | Update `sdk-reference.md` Sections 8-9 | Docs | 9 | `docs/sdk-reference.md` | `docs/next-version-plan/research/R6-sdk-unused-features.md`, `server.ts` |
| 21 | 4.22 | Stage 4 documentation | Docs | All | `docs/backend.md`, `docs/frontend.md`, `AGENTS.md` | All Stage 4 files |

### Research Phase (Issues 4.1–4.5) — ALL COMPLETE ✅

> Research issues produced documentation, not code. All resolved — findings integrated into implementation issues above. **The orchestrator should skip these.**

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
