# Project Plan: Next Version — AI Project Management & Delivery Orchestration

> **Parent:** [goal.md](./goal.md) — Product vision and success criteria
>
> **Research:** [research-needed.md](./research-needed.md) — Required research before continuing
>
> This plan breaks the next-version vision into staged, incremental deliverables. Each stage produces code, tests, and documentation. Every step addresses security and includes a feedback checkpoint before advancing.
>
> **Updated 2026-03-11:** Restructured from 7 small stages (0-6) to 5 stages with longer execution chains per stage. Stages 0-3 are complete. New Stage 4 (research + GitHub integration) and Stage 5 (execution orchestration) replace the previous Stages 4-6.

---

## Table of Contents

- [Vision Summary](#vision-summary)
- [Current State](#current-state)
- [Architectural Direction](#architectural-direction)
- [Staged Delivery Plan](#staged-delivery-plan)
  - [Stage 0: Data Model Foundation ✅](#stage-0-data-model-foundation)
  - [Stage 1: Goal Definition ✅](#stage-1-goal-definition)
  - [Stage 2: Research Workflow ✅](#stage-2-research-workflow)
  - [Stage 3: Milestone Planning ✅](#stage-3-milestone-planning)
  - [Stage 4: Research Sprint + GitHub Integration + Planning Dashboard](#stage-4-research-sprint--github-integration--planning-dashboard)
  - [Stage 5: Execution Orchestration Bridge](#stage-5-execution-orchestration-bridge)
- [Research & Uncertainty Areas](#research--uncertainty-areas)
- [Security Considerations per Stage](#security-considerations-per-stage)
- [Test & Documentation Strategy](#test--documentation-strategy)

---

## Vision Summary

Build an **AI-assisted web app for project management**, using **GitHub as the operational backend** for project execution. The system supports the full flow from strategy to delivery: defining long-term goals, conducting AI-guided research, creating detailed plans, pushing to GitHub as real Issues/Milestones/Projects, and orchestrating the GitHub Copilot coding agent to execute work end-to-end.

**See [goal.md](./goal.md) for the full product vision, success criteria, and architectural principles.**

**Core workflow:**
1. User defines a goal → AI guides research → system creates milestone plan → generates implementation-ready issues
2. AI **suggests research areas** based on what the plan demands (e.g., "Your plan requires Stripe integration — should we research their webhook API?")
3. System pushes approved plans to GitHub as real Issues, Milestones, and Projects
4. System orchestrates Copilot coding agent through milestone execution (20+ issues per chain)
5. Review loop: coding agent → PR → Copilot review → fix comments → CI → merge → next issue
6. Milestone complete → validation → final PR to main (human merges)

**Core principle:** This is an orchestration tool built on top of GitHub — not a replacement for GitHub project management. The app handles planning, research, and orchestration; GitHub handles execution and tracking.

---

## Current State

### Completed (Stages 0–3)

| Capability | Status | Stage |
|---|---|---|
| Data model: Goal, ResearchItem, Milestone, IssueDraft interfaces | ✅ | 0 |
| InMemoryPlanningStore with full CRUD + validation + circular dependency detection | ✅ | 0 |
| 9 planning tools (define_goal, save_goal, get_goal, generate_research_checklist, update_research_item, get_research, create_milestone_plan, update_milestone, get_milestones) | ✅ | 1-3 |
| 5 GitHub read tools (list_repos, get_repo_structure, read_repo_file, list_issues, search_code) | ✅ | Existing |
| Chat UI with SSE streaming, session management, token auth | ✅ | Existing |
| Agent orchestration process (6 agents: orchestrator, gather-context, stage-setup, issue-lifecycle, stage-finalize, retrospective) | ✅ | Existing |
| PowerShell wait scripts (wait-for-agent, wait-for-review, trigger-ci, get-ci-failure-summary) | ✅ | Existing |
| Session resumption with SDK sessionId | ✅ | Existing |
| Planning API endpoints (goals, research, milestones) | ✅ | 1-3 |
| Unit tests for PlanningStore | ✅ | 0 |
| Data model documentation | ✅ | 0 |

### Not Yet Built (Identified Gaps)

| Gap | Impact | Blocks |
|---|---|---|
| **No GitHub write tools** in the web app (issues, milestones, branches, labels) | Can't push plans to GitHub | Stage 4 |
| **No IssueDraft generation tool** | Can't create implementation-ready issues from milestones | Stage 4 |
| **No persistent storage** for planning data (only InMemoryPlanningStore) | Data lost on server restart | Stage 4 |
| **No planning dashboard UI** (goals/research/milestones only visible in chat) | Poor UX for reviewing plans | Stage 4 |
| **No execution bridge** between web app and agent orchestration | Can't start autonomous execution from the web app | Stage 5 |
| **No real-time execution monitoring** | Can't see what the coding agent is doing | Stage 5 |
| **Two disconnected systems** (web app vs. GitHub agent runtime) | Architecture gap | Stage 5 |

---

## Architectural Direction

### Key Decisions (Updated)

| Decision | Rationale |
|---|---|
| **GitHub-first** | Use GitHub Projects, Issues, Milestones, Labels, Actions natively |
| **Web app = planning + monitoring** | Planning and research happen in the app; execution happens in GitHub |
| **GitHub = execution backend** | Issues, milestones, branches, PRs, workflows, code review |
| **Per-user GitHub identity** | Users authenticate with their own PAT |
| **Research before coding** | AI suggests research areas; all research must be resolved before execution starts |
| **AI suggests, human decides** | The AI suggests research, milestones, issues — the human approves |
| **Approval at every write boundary** | Every GitHub mutation requires explicit user approval |
| **Milestone branch model** | One branch per milestone; all issue PRs target it; one PR to main |

### Architecture — Three-Layer GitHub Integration

```
Layer 1: Copilot SDK (@github/copilot-sdk)  [Web App]
├─ Chat, planning tools, session management
├─ Streaming events (deltas, tool calls, usage)
└─ LIMITATION: Cannot create GitHub resources directly

Layer 2: Custom REST/GraphQL Tools (tools.ts)  [Web App]
├─ Read tools: repos, files, issues, code search (existing)
├─ Write tools: create issues, milestones, labels, branches (Stage 4 — NEW)
├─ GraphQL: GitHub Projects v2 (Stage 4 — NEW, pending research R2)
└─ Pattern: githubFetch(token, path) wrapper

Layer 3: MCP Tools (via .github/agents/)  [GitHub Agent Runtime]
├─ assign_copilot_to_issue, request_copilot_review, merge_pull_request
├─ Used by the orchestrator agent during autonomous execution
└─ NOT accessible from the web app (different runtime)

Execution Bridge (Stage 5 — NEW)
├─ Connects web app to agent orchestration
├─ Approach TBD by research (R3): REST API / Actions workflow / Hybrid
└─ Real-time progress via SSE (polling GitHub API or webhook relay)
```

### New Components — Updated Architecture Diagram

```
┌──────────────────────────────────────┐
│  Browser — AI Project Management UI  │
│  ├─ Chat Interface (existing)        │
│  ├─ Planning Dashboard (Stage 4)     │
│  │  ├─ Goal overview                 │
│  │  ├─ Research tracker              │
│  │  ├─ Milestone timeline            │
│  │  └─ Issue draft manager           │
│  ├─ GitHub Preview & Approval (S4)   │
│  └─ Execution Monitor (Stage 5)     │
│     ├─ Live status feed              │
│     ├─ Start / Pause / Stop controls │
│     └─ Escalation inbox              │
└────────────┬─────────────────────────┘
             │ HTTP/SSE
┌────────────▼─────────────────────────┐
│  Express Server — Orchestrator       │
│  ├─ Planning API (existing)          │
│  ├─ PlanningStore (existing: memory) │
│  │  └─ Azure Storage (Stage 4)      │
│  ├─ GitHub Read Tools (existing)     │
│  ├─ GitHub Write Tools (Stage 4)     │
│  ├─ Execution API (Stage 5)         │
│  └─ Chat + SSE (existing)           │
└────────────┬─────────────────────────┘
             │ GitHub REST/GraphQL API
┌────────────▼─────────────────────────┐
│  GitHub — Source of Truth            │
│  ├─ Issues (implementation tasks)    │
│  ├─ Milestones (delivery phases)     │
│  ├─ Projects v2 (tracking boards)   │
│  ├─ Branches (code isolation)        │
│  ├─ Labels (categorization)          │
│  └─ Actions (CI/CD + agent trigger) │
└────────────┬─────────────────────────┘
             │ (Stage 5: bridge)
┌────────────▼─────────────────────────┐
│  Agent Orchestration (existing)      │
│  ├─ orchestrator agent               │
│  ├─ issue-lifecycle agent            │
│  ├─ stage-setup / finalize agents    │
│  └─ PowerShell wait scripts          │
└──────────────────────────────────────┘
```

---

## Staged Delivery Plan

### Stages 0–3: COMPLETE ✅

Stages 0–3 are fully implemented. See the original plan sections below for reference. **Do not modify — these are historical records.**

<details>
<summary>Stage 0: Data Model Foundation ✅ (3 issues — COMPLETE)</summary>

**Delivered:** TypeScript interfaces for Goal, ResearchItem, Milestone, IssueDraft. PlanningStore interface. InMemoryPlanningStore with full CRUD + validation. Unit tests. Data model docs.

**Files:** `planning-types.ts`, `planning-store.ts`, `planning-store.test.ts`, `docs/next-version-plan/data-model.md`
</details>

<details>
<summary>Stage 1: Goal Definition ✅ (3 issues — COMPLETE)</summary>

**Delivered:** `define_goal`, `save_goal`, `get_goal` tools. Goal API endpoints. System message updates. Frontend goal summary cards. Integration tests.

**Files:** `planning-tools.ts` (tools), `server.ts` (endpoints + integration)
</details>

<details>
<summary>Stage 2: Research Workflow ✅ (3 issues — COMPLETE)</summary>

**Delivered:** `generate_research_checklist`, `update_research_item`, `get_research` tools. Research API endpoints. Frontend research display.

**Files:** `planning-tools.ts` (tools), `server.ts` (endpoints)
</details>

<details>
<summary>Stage 3: Milestone Planning ✅ (3 issues — COMPLETE)</summary>

**Delivered:** `create_milestone_plan`, `update_milestone`, `get_milestones` tools. Milestone API endpoints. Circular dependency detection. Frontend milestone display.

**Files:** `planning-tools.ts` (tools), `planning-store.ts` (DFS circular detection)
</details>

---

### Stage 4: Research Sprint + GitHub Integration + Planning Dashboard

> **Goal:** Complete critical research, build GitHub write tools, implement IssueDraft generation, add persistent storage, and create a planning dashboard that lets users manage the full goal→research→milestone→issue workflow outside of chat.
>
> **Effort:** Large — 18-22 issues
>
> **Prerequisite:** Stages 0–3 (complete), Research R1-R5 (resolved during this stage)
>
> **Why this stage is big:** The agent orchestration process can handle 20+ issue chains. This stage combines what was previously Stages 4 and 5 plus the research sprint, because they're tightly coupled — you need write tools to push to GitHub, and you need the dashboard to approve before pushing.

#### Research Phase (Issues 4.1–4.5)

These research issues produce documentation, not code. They must be resolved before implementation issues begin.

| # | Task | Type | Research ID | Blocks |
|---|------|------|---|---|
| 4.1 | Research GitHub REST API for write operations (issues, milestones, labels, branches) | Research | R1 | 4.6-4.10 |
| 4.2 | Research GitHub Projects v2 GraphQL API — decide include/skip/partial for MVP | Research | R2 | 4.11 |
| 4.3 | Research Copilot coding agent API surface — is there a REST endpoint for assignment? | Research | R4 | Stage 5 |
| 4.4 | Research web app → orchestration bridge architecture — decide approach | Research | R3 | Stage 5 |
| 4.5 | Research persistent storage approach — Azure Table/Blob schema design | Research | R5 | 4.13 |

**Research deliverables:** Each research issue produces a document in `docs/next-version-plan/research/` with findings, decision, and implications for the implementation plan.

**Decision gate after research:** Review R1-R5 findings and confirm:
- Which GitHub write operations to implement (REST API vs. MCP bridge)
- Include/skip/partial for GitHub Projects v2
- Storage backend choice (Azure Table/Blob, node:sqlite, or hybrid)
- Execution bridge architecture (informs Stage 5 structure)

#### IssueDraft Generation (Issues 4.6–4.8)

| # | Task | Type | Dependencies |
|---|------|------|---|
| 4.6 | Create `generate_issue_drafts` tool — generates detailed, implementation-ready issues from a milestone, with research context baked in | Code + Tests | 4.1, Stage 3 |
| 4.7 | Create `update_issue_draft` tool — edit any field of an issue draft | Code + Tests | 4.6 |
| 4.8 | Create `GET /api/milestones/:id/issues` endpoint — list issue drafts | Code + Tests | 4.6 |

**IssueDraft quality gate:** Generated issues must contain:
- Clear problem statement, exact scope, technical context (files, patterns, APIs)
- Dependencies, acceptance criteria, testing expectations
- Research links (resolved ResearchItems whose findings are relevant)
- Enough detail that a coding agent can implement without asking questions

#### GitHub Write Tools (Issues 4.9–4.12)

| # | Task | Type | Dependencies |
|---|------|------|---|
| 4.9 | Create `create_github_issue` tool — push an approved IssueDraft to GitHub as a real issue | Code + Tests | 4.1, 4.6 |
| 4.10 | Create `create_github_milestone` tool — create a GitHub Milestone from a planning Milestone | Code + Tests | 4.1 |
| 4.11 | Create `create_github_project` tool — create a GitHub Project v2 and add issues (OR: skip, depending on R2 decision) | Code + Tests | 4.2 |
| 4.12 | Create `create_github_branch` and `manage_github_labels` tools — set up milestone execution infrastructure | Code + Tests | 4.1 |

**Key constraint:** All write tools require explicit user approval. The tools validate permissions before attempting creation. All use the user's own PAT via the existing `githubFetch()` pattern.

#### Persistent Storage (Issue 4.13)

| # | Task | Type | Dependencies |
|---|------|------|---|
| 4.13 | Implement persistent PlanningStore backend (Azure Table/Blob or node:sqlite, based on R5 decision) | Code + Tests | 4.5 |

#### Planning Dashboard UI (Issues 4.14–4.19)

| # | Task | Type | Dependencies |
|---|------|------|---|
| 4.14 | Planning dashboard layout — sidebar navigation for Goals, Research, Milestones, Issues (separate from chat) | Code | None |
| 4.15 | Goal overview page — view all goals, drill into one, see research/milestone/issue counts | Code | 4.14 |
| 4.16 | Research tracker page — view research items by category, status indicators, edit findings | Code | 4.14 |
| 4.17 | Milestone timeline page — ordered milestones with dependencies, status, issue counts | Code | 4.14 |
| 4.18 | Issue draft manager page — view/edit/reorder issues, approve for GitHub push, preview GitHub format | Code | 4.14, 4.6 |
| 4.19 | GitHub push approval workflow — user reviews all planned GitHub mutations, confirms, system executes batch | Code | 4.9-4.12, 4.18 |

**Design principle:** The dashboard is an alternative view of the same data the chat creates. Users can switch between chat (AI-guided creation) and dashboard (manual review/editing). No new data model — everything uses the existing PlanningStore.

#### AI Research Suggestions (Issue 4.20)

| # | Task | Type | Dependencies |
|---|------|------|---|
| 4.20 | Enhance `generate_research_checklist` to suggest research based on plan content — detect integration mentions, framework references, infrastructure requirements, and create targeted research items | Code + Tests | Stage 2 |

**Example behavior:** If the user's goal mentions "Stripe payments" and the milestone plan includes an issue about webhook handling, the system should suggest: "Your plan requires Stripe webhook integration. Suggested research: What is Stripe's webhook verification flow? What events should we listen to? What's the retry policy?"

#### Documentation & Integration Tests (Issues 4.21–4.22)

| # | Task | Type | Dependencies |
|---|------|------|---|
| 4.21 | Integration tests for all GitHub write tools (create issue, milestone, branch, labels) | Tests | 4.9-4.12 |
| 4.22 | Documentation: update `docs/backend.md`, `docs/frontend.md`, create `docs/next-version-plan/github-integration.md` | Docs | All Stage 4 |

#### Security — Stage 4

| Concern | Mitigation |
|---|---|
| GitHub write operations | Validate PAT has required scopes before attempting; explicit user approval for every mutation |
| Content injection | Sanitize all text before GitHub API submission (issue titles, labels, milestone names) |
| Permission escalation | Tools use user's own PAT — no elevated permissions |
| Rate limiting | Respect GitHub API rate limits; implement backoff for 403/429 responses |
| Storage security | Planning data scoped to user session hash; no cross-user data access |
| XSS in dashboard | Escape all user-generated content in dashboard rendering |

#### Feedback Checkpoint — Stage 4

- [ ] Research decisions documented and confirmed (R1-R5)
- [ ] User can define goal → research → milestones → issue drafts through chat
- [ ] Issue drafts pass quality gate (all fields populated, clear scope, research links)
- [ ] User can review all planned GitHub mutations in the dashboard before approval
- [ ] Approved drafts become real GitHub Issues with milestone associations
- [ ] Planning data survives server restart (persistent storage)
- [ ] Dashboard shows goals, research, milestones, and issues independently of chat
- [ ] AI suggests research areas based on plan content
- [ ] All integration tests pass against a real GitHub test repo
- [ ] `npx tsc --noEmit` passes

---

### Stage 5: Execution Orchestration Bridge

> **Goal:** Connect the web app to the existing agent orchestration process, enabling users to start, monitor, and control autonomous milestone execution from the browser.
>
> **Effort:** Large — 20-25 issues
>
> **Prerequisite:** Stage 4 (complete) + Research R3, R4 resolved (determines architecture)
>
> **Why this stage is big:** This is the core of the product — the execution loop that processes 20+ issues sequentially. It requires bridging two separate systems (web app + GitHub agent runtime), real-time monitoring, and robust failure handling.
>
> **Note:** The exact architecture depends on research decisions from Stage 4 (R3: bridge approach, R4: Copilot agent API). The issue list below uses the likely "hybrid" approach (web app creates GitHub resources, Actions runs orchestration). This will be adjusted based on research findings.

#### Research Finalization (Issues 5.1–5.3)

| # | Task | Type | Dependencies |
|---|------|------|---|
| 5.1 | Finalize execution bridge architecture based on R3/R4 findings — document in `docs/next-version-plan/execution-architecture.md` | Research | R3, R4 from Stage 4 |
| 5.2 | Research real-time progress update mechanism — polling vs. webhooks vs. Actions hybrid (R8) | Research | 5.1 |
| 5.3 | Research MCP server integration for SDK ↔ GitHub write bridge (R10) — decide if this changes the bridge architecture | Research | R10 |

#### Execution Engine Core (Issues 5.4–5.8)

| # | Task | Type | Dependencies |
|---|------|------|---|
| 5.4 | Create execution state model — extends orchestrator-state.json schema for web app tracking (milestone execution status, issue progress, error log) | Code + Tests | 5.1 |
| 5.5 | Create `start_execution` API endpoint — initializes milestone execution, creates GitHub infrastructure (branch, labels), triggers orchestration | Code + Tests | 5.1, Stage 4 |
| 5.6 | Create execution state machine — tracks each issue through: pending → agent-working → pr-ready → review-requested → review-fixes-needed → ci-ready → ci-passed → merged (mirrors orchestrator states) | Code + Tests | 5.4 |
| 5.7 | Create `GET /api/executions/:milestoneId/status` endpoint — returns current execution state for all issues in the milestone | Code + Tests | 5.4 |
| 5.8 | Create `POST /api/executions/:milestoneId/pause` and `/resume` endpoints — control execution flow | Code + Tests | 5.5 |

#### GitHub Actions Integration (Issues 5.9–5.12)

| # | Task | Type | Dependencies |
|---|------|------|---|
| 5.9 | Create parameterized GitHub Actions workflow for milestone execution — accepts milestone data as `workflow_dispatch` inputs, runs the orchestrator agent | Code | 5.1 |
| 5.10 | Create `trigger_execution` tool — calls GitHub Actions workflow dispatch API to start the orchestrator | Code + Tests | 5.9 |
| 5.11 | Implement execution progress polling — web app polls GitHub API (issue timeline, PR status, CI status) to track what the orchestrator is doing | Code + Tests | 5.7 |
| 5.12 | Implement coding agent assignment mechanism — either direct REST API, or delegated to the Actions workflow (based on R4 decision) | Code + Tests | 5.1, R4 |

#### Review & CI Loop (Issues 5.13–5.16)

| # | Task | Type | Dependencies |
|---|------|------|---|
| 5.13 | Implement PR review monitoring — detect when Copilot review is complete, classify comments (valid/optional/irrelevant) | Code + Tests | 5.11 |
| 5.14 | Implement review fix posting — post `@copilot` comments on PRs with explicit fix instructions for valid review comments | Code + Tests | 5.13 |
| 5.15 | Implement CI status monitoring — detect workflow completion, extract failure logs, classify failures | Code + Tests | 5.11 |
| 5.16 | Implement CI fix posting — post `@copilot` comments on PRs with failure context and fix instructions | Code + Tests | 5.15 |

#### Human Stop Gates & Escalation (Issues 5.17–5.19)

| # | Task | Type | Dependencies |
|---|------|------|---|
| 5.17 | Implement stop gate detection — CI failure after retries, review loops exceeded, agent timeout, scope ambiguity, merge conflicts, security flags | Code + Tests | 5.6 |
| 5.18 | Create escalation message system — clear, structured messages explaining what happened, what was tried, what input is needed, how to resume | Code + Tests | 5.17 |
| 5.19 | Create `POST /api/executions/:milestoneId/resolve` endpoint — human provides resolution for an escalated issue, execution resumes | Code + Tests | 5.17 |

#### Milestone Completion (Issues 5.20–5.21)

| # | Task | Type | Dependencies |
|---|------|------|---|
| 5.20 | Implement milestone completion flow — detect all issues merged, validate integrated state, generate summary, create final PR from milestone branch → main | Code + Tests | 5.6 |
| 5.21 | Create milestone summary generator — produces a structured summary of what was built, issues completed, reviews/fixes, CI runs, for the final PR body | Code + Tests | 5.20 |

#### Frontend Execution UI (Issues 5.22–5.26)

| # | Task | Type | Dependencies |
|---|------|------|---|
| 5.22 | Execution monitor page — live status feed showing current issue, agent status, PR status, CI status | Code | 5.7, 5.11 |
| 5.23 | Execution controls — Start, Pause, Resume, Stop buttons with confirmation dialogs | Code | 5.5, 5.8 |
| 5.24 | Escalation inbox — list of issues needing human input, with context and resolution form | Code | 5.18, 5.19 |
| 5.25 | Execution history — completed milestones with summary, timeline, and link to final PR | Code | 5.20 |
| 5.26 | Real-time SSE integration — execution status streams to frontend via SSE (reusing existing SSE infrastructure) | Code | 5.22 |

#### Documentation & Tests (Issues 5.27–5.28)

| # | Task | Type | Dependencies |
|---|------|------|---|
| 5.27 | End-to-end execution test — run a small milestone (3-5 issues) through the full loop, from start to final PR | Tests | All execution issues |
| 5.28 | Documentation: create `docs/next-version-plan/execution-orchestration.md`, update `docs/architecture.md`, update `AGENTS.md` | Docs | All Stage 5 |

#### Security — Stage 5

| Concern | Mitigation |
|---|---|
| Autonomous code execution | Human stop gates at every failure point; never retry silently |
| Review classification | Conservative classification — flag uncertain items for human review |
| Agent scope | Coding agent constrained to milestone branch; cannot push to main |
| Rate limiting | Respect GitHub API rate limits during polling; exponential backoff |
| Audit trail | All autonomous actions logged with full context (who, what, when, why) |
| Workflow dispatch | Validate workflow exists and user has permissions before triggering |
| MCP sandboxing | If MCP bridge is used, scope tool permissions per user |
| Escalation security | Escalation messages don't leak tokens, internal state, or other users' data |

#### Feedback Checkpoint — Stage 5

- [ ] Milestone execution can be started from the web UI
- [ ] A 5-issue milestone runs through the full loop with minimal human intervention
- [ ] Real-time execution status visible in the browser
- [ ] Stop gates trigger correctly on each failure condition
- [ ] Escalation messages provide sufficient context for human resolution
- [ ] Pause/Resume controls work correctly
- [ ] Milestone completion produces a clean summary PR to main
- [ ] A 20-issue milestone can execute with the human only intervening on genuine failures
- [ ] All execution tests pass
- [ ] `npx tsc --noEmit` passes

---

## Research & Uncertainty Areas

> **Full research details:** See [research-needed.md](./research-needed.md)

### Critical Decision Points

These decisions must be resolved during Stage 4's research phase (issues 4.1–4.5) before implementation begins:

| Decision | Options | Research ID | Impact |
|---|---|---|---|
| **How to create GitHub resources from web app?** | REST API tools / MCP server bridge / SDK MCP integration | R1, R10 | Stage 4 architecture |
| **Include GitHub Projects v2?** | Full (GraphQL) / Partial (basic) / Skip (use Milestones+Labels) | R2 | Stage 4 scope |
| **How does web app connect to orchestration?** | Direct REST / Actions workflow / Hybrid | R3, R4 | Stage 5 architecture |
| **How does the web app assign Copilot to issues?** | REST API / Actions trigger / MCP bridge | R4 | Stage 5 core mechanism |
| **What storage backend for planning data?** | Azure Table+Blob / node:sqlite / Hybrid | R5 | Stage 4 implementation |

### Resolved Decisions (Stages 0–3)

| Decision | Resolution | Stage |
|---|---|---|
| Storage pattern for planning data | InMemoryPlanningStore (matches InMemorySessionStore); Azure migration planned | 0 |
| Authentication model | Per-user GitHub PAT (existing pattern) | 0 |
| Data model scope | 4 entities: Goal, ResearchItem, Milestone, IssueDraft | 0 |
| Tool architecture | Factory pattern, per-session tool instances | 1 |
| Research categories | 8 fixed categories (domain, architecture, security, etc.) | 2 |
| Milestone ordering | Sequential execution, 1-based ordering | 3 |

### Open Questions (Resolve in Stage 5)

| Question | Recommended Resolution | Research ID |
|---|---|---|
| How should review comments be classified? | Conservative — flag uncertain items for human review | R9 |
| How long can an execution chain run without human input? | Start with 5-10 issues, increase as confidence grows | — |
| Should the system suggest MCP tools for extended automation? | Defer to post-Stage 5; focus on core loop first | — |
| Can the system deploy ephemeral test environments? | Defer to post-Stage 5 | — |

---

## Security Considerations per Stage

| Stage | Security Focus |
|---|---|
| Stage 0 ✅ | Input validation, data scoping, no PII |
| Stage 1 ✅ | Goal schema validation, session-scoped access |
| Stage 2 ✅ | URL sanitization, code snippet escaping |
| Stage 3 ✅ | Circular dependency detection, milestone name sanitization |
| **Stage 4** | **PAT scope validation, GitHub write approval gate, content sanitization for GitHub API, rate limiting, persistent storage access control, XSS prevention in dashboard** |
| **Stage 5** | **Audit trail for all autonomous actions, human stop gates, conservative review classification, agent scope constraints (milestone branch only), workflow dispatch validation, escalation data hygiene** |

**Cross-cutting principles (unchanged):**
- All data scoped to authenticated user's session and token
- No persistent server-side token storage
- All GitHub API calls use the user's own PAT
- All GitHub write operations require explicit user approval
- Input validation on all user-provided data
- Structured logging for audit trails

---

## Test & Documentation Strategy

### Testing per Stage

| Stage | Test Types | Commands |
|---|---|---|
| Stage 0-3 ✅ | Unit tests, integration tests, typecheck | `npm run test:planning`, `npm test`, `npx tsc --noEmit` |
| **Stage 4** | Unit tests (storage), integration tests (GitHub API), E2E tests (dashboard), typecheck | `npm run test:planning`, `npm test`, `npm run test:e2e:local`, `npx tsc --noEmit` |
| **Stage 5** | Integration tests (execution engine), E2E tests (execution UI), execution acceptance test (3-5 issue milestone), typecheck | `npm test`, `npm run test:e2e:local`, `npx tsc --noEmit` |

### Documentation per Stage

| Stage | Documentation Updates |
|---|---|
| **Stage 4** | `docs/next-version-plan/research/` (5 research docs), `docs/next-version-plan/github-integration.md`, updated `docs/backend.md`, `docs/frontend.md` |
| **Stage 5** | `docs/next-version-plan/execution-orchestration.md`, updated `docs/architecture.md`, updated `AGENTS.md`, updated `README.md` |

---

## Stage Comparison: Old vs. New Plan

| Old Plan | Issues | New Plan | Issues | Change |
|---|---|---|---|---|
| Stage 0: Data Model ✅ | 3 | (unchanged) | 3 | — |
| Stage 1: Goal Definition ✅ | 3 | (unchanged) | 3 | — |
| Stage 2: Research Workflow ✅ | 3 | (unchanged) | 3 | — |
| Stage 3: Milestone Planning ✅ | 3 | (unchanged) | 3 | — |
| Stage 4: Issue Generation | 4 | **Stage 4: Research + GitHub Integration + Dashboard** | **~22** | Merged old 4+5, added research sprint, dashboard, persistent storage |
| Stage 5: Execution Structure | 3 | (merged into Stage 4) | — | — |
| Stage 6: Orchestration | 8 | **Stage 5: Execution Orchestration Bridge** | **~28** | Expanded with execution bridge, real-time monitoring, full UI |
| **Total old** | **27** | **Total new** | **~62** | More issues, fewer stages, bigger chains |

**Why:** The agent orchestration process can now handle 20+ issue chains. Bigger stages with more issues mean fewer context switches, fewer stage setup/finalize cycles, and more cohesive feature delivery.
