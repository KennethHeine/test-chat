# Issue Breakdown: Implementation-Ready Issues for Next Version

> **Status:** Stages 0–3 complete (12 issues). Stages 4–5 in per-stage files (~47 implementation issues).
>
> **Parent docs:** [goal.md](./goal.md) — Product vision | [project-plan-v2.md](./project-plan-v2.md) — Stage definitions | [research-needed.md](./research-needed.md) — Research items
>
> **Stage details:** [Stage 4](./issues/stage-4.md) (21 issues) | [Stage 5](./issues/stage-5.md) (25+1 issues)
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


## Stage 4: GitHub Integration + Planning Dashboard

> **21 implementation issues** | Stages 0–3 ✅, Research R1–R5 ✅
>
> **Full details:** [issues/stage-4.md](./issues/stage-4.md)

## Stage 5: Execution Orchestration Bridge

> **25 implementation issues** | Stage 4 ✅ + Research R3, R4, R8 ✅
>
> **Full details:** [issues/stage-5.md](./issues/stage-5.md)
