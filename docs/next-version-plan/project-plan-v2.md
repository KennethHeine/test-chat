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
3. System pushes approved plans to GitHub as real Issues, Milestones, and Labels
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
| **No persistent storage** for planning data (only InMemoryPlanningStore) | Data lost on server restart | Stage 4 (R5 resolved: Azure Table Storage) |
| **No planning dashboard UI** (goals/research/milestones only visible in chat) | Poor UX for reviewing plans | Stage 4 |
| **No execution bridge** between web app and agent orchestration | Can't start autonomous execution from the web app | Stage 5 |
| **No real-time execution monitoring** | Can't see what the coding agent is doing | Stage 5 |
| **Two disconnected systems** (web app vs. GitHub agent runtime) | Architecture gap | Stage 5 |

---

## Architectural Direction

### Key Decisions (Updated)

| Decision | Rationale |
|---|---|
| **GitHub-first** | Use GitHub Issues, Milestones, Labels, Actions natively. Projects v2 deferred — fine-grained PATs can't access user-owned Projects (R2 finding) |
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

Layer 2: Custom REST Tools (tools.ts)  [Web App]
├─ Read tools: repos, files, issues, code search (existing)
├─ Write tools: create issues, milestones, labels, branches (Stage 4 — NEW)
│  └─ New `githubWrite(token, method, path, body)` helper (R1 confirmed)
│     PAT scopes: Issues (write) + Contents (write)
├─ Projects v2: DEFERRED for MVP (R2 — fine-grained PATs can't access user-owned Projects)
│  └─ GraphQL patterns documented in research/R2 for future implementation
└─ Pattern: githubFetch(token, path) for reads, githubWrite() for writes

Layer 3: MCP Tools (via .github/agents/)  [GitHub Agent Runtime]
├─ assign_copilot_to_issue, request_copilot_review, merge_pull_request
├─ Used by the orchestrator agent during autonomous execution
└─ NOT accessible from the web app (different runtime)

Execution Bridge (Stage 5 — NEW) — R3 RESOLVED: Option A (Direct REST API)
├─ Web app orchestrates execution directly via GitHub REST API
├─ Assign Copilot coding agent: POST .../issues/{n}/assignees with copilot-swe-agent[bot]
├─   agent_assignment fields: target_repo, base_branch, custom_instructions, custom_agent, model
├─ Request Copilot review: POST .../pulls/{n}/requested_reviewers
├─   Reviewer: copilot-pull-request-reviewer[bot] (also match copilot-pull-request-review[bot])
├─   Reviews always COMMENTED — never APPROVED/CHANGES_REQUESTED; don't block merging
├─ Post fix requests: POST @copilot comment on PRs
├─ Monitor progress: Two-phase polling (R4 detail):
│  ├─ Phase 1: Poll *issue* timeline for `cross-referenced` event → discover PR number
│  └─ Phase 2: Poll *PR* timeline for `copilot_work_finished` / `copilot_work_finished_failure`
│  (Note: copilot_work_* events appear on PR timeline, NOT issue timeline)
├─ No webhook alternative — polling is the only supported approach (R4 confirmed)
├─ Draft PR detection as backup signal (agent marks non-draft when done)
├─ No GitHub Actions workflow bridge needed
├─ New execution service: execution.ts + POST /api/execute (SSE)
├─ PAT scopes: metadata (read), actions, contents, issues, pull_requests (read+write)
├─ API is Public Preview — implementation should be defensive (R4 finding)
├─ Real-time progress via SSE (R8 decision: Polling + SSE primary, Webhooks optional)
│  ├─ Adaptive polling: 30s idle / 15s active / 60s no-PR
│  ├─ 14 SSE event types: issue-start, agent-assigned, agent-working, pr-created, agent-complete,
│  │  review-requested, review-complete, ci-running, ci-result, merge-complete, issue-complete,
│  │  issue-error, escalation, heartbeat, checkpoint, done
│  ├─ Heartbeats every 30s (Azure Container Apps 240s idle timeout)
│  ├─ Checkpoint events after each issue for crash recovery (cursor-based reconnect)
│  └─ Async generator + AbortSignal pattern for execution loop
├─ Execution state persistence: `executionruns` Azure Table (PK=tokenHash, RK=runId)
└─ Webhooks optional enhancement — add later for ~1s latency (requires HMAC-SHA256 verification)
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
│  ├─ Execution Engine (Stage 5)      │
│  │  ├─ execution.ts (orchestration)  │
│  │  ├─ POST /api/execute (SSE)       │
│  │  ├─ POST /api/execute/abort       │
│  │  ├─ Copilot agent assignment      │
│  │  ├─ Copilot review requests       │
│  │  └─ Timeline polling (20s)        │
│  └─ Chat + SSE (existing)           │
└────────────┬─────────────────────────┘
             │ GitHub REST API (user's PAT)
┌────────────▼─────────────────────────┐
│  GitHub — Source of Truth            │
│  ├─ Issues (implementation tasks)    │
│  ├─ Milestones (delivery phases)     │
│  ├─ Labels (categorization)          │
│  ├─ Branches (code isolation)        │
│  ├─ Actions (CI/CD)                 │
│  └─ Copilot coding agent            │
│     (runs in GitHub infrastructure)  │
└──────────────────────────────────────┘

> **R3/R4 decision:** The web app orchestrates execution directly via REST API (Option A).
> R4 confirmed: two-phase polling (issue → PR timeline), no webhook alternative, API is Public Preview.
> Existing agent orchestration (.github/agents/) remains useful for CLI/GitHub-native
> workflows but is not required for web app execution.
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
> **Effort:** Large — 22-26 issues
>
> **Prerequisite:** Stages 0–3 (complete), Research R1-R5 (resolved during this stage), R6 (informing), R9 (informing — IssueDraft quality findings)
>
> **Why this stage is big:** The agent orchestration process can handle 20+ issue chains. This stage combines what was previously Stages 4 and 5 plus the research sprint, because they're tightly coupled — you need write tools to push to GitHub, and you need the dashboard to approve before pushing.

#### Research Phase (Issues 4.1–4.5)

These research issues produce documentation, not code. They must be resolved before implementation issues begin.

| # | Task | Type | Research ID | Blocks |
|---|------|------|---|---|
| 4.1 | Research GitHub REST API for write operations (issues, milestones, labels, branches) | Research | R1 | 4.6-4.10 |
| 4.2 | Research GitHub Projects v2 GraphQL API — decide include/skip/partial for MVP | Research | R2 | 4.11 | ✅ Complete (decision: skip for MVP) |
| 4.3 | Research Copilot coding agent API surface — is there a REST endpoint for assignment? | Research | R4 | Stage 5 | ✅ Complete (R3 core + R4 deep-dive: detailed schemas, two-phase polling, agent limitations) |
| 4.4 | Research web app → orchestration bridge architecture — decide approach | Research | R3 | Stage 5 | ✅ Complete (decision: Option A, direct REST API) |
| 4.5 | Research persistent storage approach — Azure Table/Blob schema design | Research | R5 | 4.13 | ✅ Complete (decision: Azure Table Storage, separate tables, FK PartitionKeys) |

**Research deliverables:** Each research issue produces a document in `docs/next-version-plan/research/` with findings, decision, and implications for the implementation plan.

**Decision gate after research:** Review R1-R5 findings and confirm:
- Which GitHub write operations to implement (REST API vs. MCP bridge)
- ~~Include/skip/partial for GitHub Projects v2~~ → **RESOLVED: Skip for MVP** (R2 — fine-grained PAT limitation blocks user-owned Projects)
- ~~Storage backend choice (Azure Table/Blob, node:sqlite, or hybrid)~~ → **RESOLVED: Azure Table Storage** (R5 — separate tables per entity type, FK PartitionKeys, zero additional infra, follows `storage.ts` pattern)
- ~~Execution bridge architecture (informs Stage 5 structure)~~ → **RESOLVED: Option A, direct REST API** (R3 — Copilot agent has public REST APIs, no Actions bridge needed)

#### IssueDraft Generation (Issues 4.6–4.8)

| # | Task | Type | Dependencies |
|---|------|------|---|
| 4.6a | Extend `IssueDraft` interface — add `filesToModify`, `filesToRead`, `patternReference`, `securityChecklist`, `verificationCommands` fields + new `FileRef` interface (R9 prerequisite) | Code + Tests | Stage 0 |
| 4.6 | Create `generate_issue_drafts` tool — generates detailed, implementation-ready issues from a milestone, with research context baked in | Code + Tests | 4.1, 4.6a, Stage 3 |
| 4.7 | Create `update_issue_draft` tool — edit any field of an issue draft | Code + Tests | 4.6 |
| 4.8 | Create `GET /api/milestones/:id/issues` endpoint — list issue drafts | Code + Tests | 4.6 |

**IssueDraft quality gate (R9):** Generated issues must contain:
- Clear problem statement, exact scope, technical context (files, patterns, APIs)
- **Structured file references** — `filesToModify` (files to create/edit) and `filesToRead` (context files) with per-file reasons (R9: most impactful missing fields)
- **Pattern reference** — existing file to use as implementation template (R9: strongest predictor of clean first-pass code)
- Dependencies, acceptance criteria, testing expectations
- **Machine-testable acceptance criteria** — specific commands, not prose (R9: "runs `npx tsc --noEmit` with zero errors" not "works correctly")
- **Verification commands** — exact commands for agent self-check (R9)
- **Security checklist** — per-issue validation rules, not generic checkboxes (R9: prevents review fix loops)
- Research links (resolved ResearchItems whose findings are relevant)
- **Scope ≤3 hours human-equivalent work** — larger issues cause agent timeouts (R9)
- Enough detail that a coding agent can implement without asking questions

> **R9 prerequisite:** The `IssueDraft` interface must be extended with 5 new fields (`filesToModify`, `filesToRead`, `patternReference`, `securityChecklist`, `verificationCommands`) + new `FileRef` interface before implementing Issue 4.6. See Issue 4.6a in [issue-breakdown.md](./issue-breakdown.md).

#### GitHub Write Tools (Issues 4.9–4.12)

| # | Task | Type | Dependencies |
|---|------|------|---|
| 4.9 | Create `create_github_issue` tool — push an approved IssueDraft to GitHub as a real issue | Code + Tests | 4.1, 4.6 |
| 4.10 | Create `create_github_milestone` tool — create a GitHub Milestone from a planning Milestone | Code + Tests | 4.1 |
| 4.11 | ~~Create `create_github_project` tool~~ — **SKIPPED** (R2: fine-grained PATs can't access user-owned Projects v2; use Milestones + Labels instead) | ~~Code + Tests~~ | 4.2 |
| 4.12 | Create `create_github_branch` and `manage_github_labels` tools — set up milestone execution infrastructure | Code + Tests | 4.1 |

**Key constraint:** All write tools require explicit user approval. The tools validate permissions before attempting creation. All use the user's own PAT via a new `githubWrite(token, method, path, body)` helper (R1 confirmed pattern). Required PAT scopes: **Issues (write)** + **Contents (write)**. Rate limits: add 1-second delay between creation requests to avoid secondary limits (80/min content-creation cap). GitHub Projects v2 is skipped for MVP (R2 — fine-grained PATs can't access user Projects v2).

#### Persistent Storage (Issue 4.13)

| # | Task | Type | Dependencies |
|---|------|------|---|
| 4.13 | Implement `AzurePlanningStore` — Azure Table Storage backend with 4 separate tables (`plangoals`, `planresearch`, `planmilestones`, `planissues`) and `createPlanningStore()` factory (R5 decision) | Code + Tests | 4.5 ✅ |

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

#### SDK Feature Enhancements (Issues 4.23–4.26)

> R6 research identified SDK features that improve planning UX. Tier 1 features are low effort and high value — they follow the existing `session.on()` → SSE pattern with no architectural changes.

| # | Task | Type | Dependencies |
|---|------|------|---|
| 4.23 | Add planning/intent/subagent event forwarding — `session.mode_changed`, `assistant.intent`, `subagent.*`, `session.compaction_start/complete` → SSE events (~85 lines, follows existing event handler pattern) | Code + Tests | None |
| 4.24 | Add reasoning effort control — conditional UI dropdown when model supports `reasoningEffort`; pass in `createSession()` config (~50 lines backend + frontend) | Code + Tests | None |
| 4.25 | Implement user input requests — `onUserInputRequest` callback + `POST /api/chat/input` endpoint + pending-Promise pattern + frontend choice/freeform UI (~100 lines) | Code + Tests | None |
| 4.26 | Update `sdk-reference.md` Sections 8-9 — correct outdated "unused" entries; replace non-existent `planning.started/end` with real events (`session.mode_changed`, `session.plan_changed`, `exit_plan_mode.requested`) | Docs | 4.23 |

#### Security — Stage 4

| Concern | Mitigation |
|---|---|
| GitHub write operations | Validate PAT has required scopes before attempting; explicit user approval for every mutation |
| Content injection | Sanitize all text before GitHub API submission (issue titles, labels, milestone names) |
| Permission escalation | Tools use user's own PAT — no elevated permissions |
| Rate limiting | Respect GitHub API rate limits; implement backoff for 403/429 responses |
| Storage security | Planning data scoped via PartitionKey hierarchy (sessionId→goalId→milestoneId); per-user isolation enforced at API layer via `getOwnedGoal()` (R5) |
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
- [ ] SDK event forwarding works (planning, intent, subagent, compaction events visible in frontend)
- [ ] Reasoning effort dropdown appears for supported models and affects session config
- [ ] All integration tests pass against a real GitHub test repo
- [ ] `npx tsc --noEmit` passes

---

### Stage 5: Execution Orchestration Bridge

> **Goal:** Connect the web app to the existing agent orchestration process, enabling users to start, monitor, and control autonomous milestone execution from the browser.
>
> **Effort:** Large — 20-25 issues
>
> **Prerequisite:** Stage 4 (complete) + Research R3, R4, R8 resolved (determines architecture and real-time progress approach)
>
> **Why this stage is big:** This is the core of the product — the execution loop that processes 20+ issues sequentially. It requires bridging two separate systems (web app + GitHub agent runtime), real-time monitoring, and robust failure handling.
>
> **Architecture decided (R3):** The web app uses **Option A: direct REST API** to orchestrate execution. GitHub has public REST APIs for Copilot coding agent assignment (`copilot-swe-agent[bot]` as assignee) and code review requests (standard `requested_reviewers` API). No GitHub Actions workflow bridge is needed. The issue list below reflects this decision.

#### Research Finalization (Issues 5.1–5.3)

| # | Task | Type | Dependencies |
|---|------|------|---|
| 5.1 | Document execution bridge architecture based on R3/R4 findings — create `docs/next-version-plan/execution-architecture.md` documenting Option A (direct REST API) with sequence diagrams | Docs | R3 ✅, R4 ✅ |
| 5.2 | Research real-time progress update mechanism — polling (20s interval proven in R3) vs. webhooks vs. SSE relay (R8) | Research | 5.1 | ✅ Complete (decision: Polling + SSE primary; Webhooks optional enhancement; adaptive polling 30s/15s/60s; heartbeats 30s; checkpoint+cursor crash recovery) |
| 5.3 | ~~Research MCP server integration for SDK ↔ GitHub write bridge (R10)~~ — **CLOSED** (R6 confirmed native tools are better than MCP for this project; R3 confirmed REST API for execution; dedicated R10 research validated — official GitHub MCP Server covers ~90% but requires Docker + missing milestones) | ~~Research~~ | R10 ✅ (closed by R6, confirmed by R10) |

#### Execution Engine Core (Issues 5.4–5.8)

| # | Task | Type | Dependencies |
|---|------|------|---|
| 5.4 | Create execution state model — `ExecutionStep` type (assign_agent/wait_pr/request_review/wait_review/fix_review/wait_ci/merge/done/failed), `ExecutionState` per-issue, `ExecutionRun` per-execution. Persisted in Azure Table Storage (`executionruns` table, PK=tokenHash, RK=runId). ~7 writes per issue on step transitions. (R8 design) | Code + Tests | 5.1 |
| 5.5 | Create `POST /api/execute` SSE endpoint — initializes milestone execution, creates GitHub infrastructure (branch, labels), runs execution loop (assign agent → poll → review → fix → CI → merge) streaming progress via SSE. Uses async generator + AbortSignal pattern (R8). Emits 14 event types including heartbeats (30s keep-alive for Azure Container Apps 240s timeout) and checkpoints (cursor-based crash recovery). Adaptive polling: 30s idle / 15s active / 60s no-PR. | Code + Tests | 5.1, Stage 4 |
| 5.6 | Create execution state machine — tracks each issue through: pending → agent-working → pr-ready → review-requested → review-fixes-needed → ci-ready → ci-passed → merged (mirrors orchestrator states) | Code + Tests | 5.4 |
| 5.7 | Create `GET /api/executions/:milestoneId/status` endpoint — returns current execution state for all issues in the milestone | Code + Tests | 5.4 |
| 5.8 | Create `POST /api/executions/:milestoneId/pause` and `/resume` endpoints — control execution flow | Code + Tests | 5.5 |

#### REST API Execution Tools (Issues 5.9–5.12)

| # | Task | Type | Dependencies |
|---|------|------|---|
| 5.9 | Create `assign_copilot_agent` tool — `POST /repos/{owner}/{repo}/issues/{n}/assignees` with `copilot-swe-agent[bot]` + `agent_assignment` body (base branch, custom instructions, model) | Code + Tests | 5.1 |
| 5.10 | Create `request_copilot_review` tool — `POST /repos/{owner}/{repo}/pulls/{n}/requested_reviewers` with Copilot reviewer bot | Code + Tests | 5.9 |
| 5.11 | Implement execution progress polling — poll issue timeline every 20s for `copilot_work_started/finished` events and `cross-referenced` (PR creation), poll PR reviews for Copilot review completion | Code + Tests | 5.7 |
| 5.12 | Create `post_copilot_fix` tool — post `@copilot` comment on PRs with fix instructions for review comments or CI failures | Code + Tests | 5.11 |

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
| 5.22 | Execution monitor page — view tabs (Chat/Execution), summary header, milestone accordion with progress bars, issue cards with 6-step pipeline (assigned → working → PR → review → CI → merged), scrollable event log, escalation banners (R8 UI design) | Code | 5.7, 5.11 |
| 5.23 | Execution controls — Start, Pause, Resume, Skip Issue, Abort buttons with confirmation dialogs. Control bar maps to: `POST /api/execution/pause`, `/resume`, `/skip`, `/abort` (R8 design) | Code | 5.5, 5.8 |
| 5.24 | Escalation inbox — list of issues needing human input, with context and resolution form | Code | 5.18, 5.19 |
| 5.25 | Execution history — completed milestones with summary, timeline, and link to final PR | Code | 5.20 |
| 5.26 | Real-time SSE integration — execution status streams to frontend via SSE (same `fetch` + `getReader()` pattern as chat). Client saves checkpoints to localStorage for crash recovery; reconnects with cursor parameter. Heartbeat miss detection (>45s) triggers auto-reconnect. (R8) | Code | 5.22 |

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
| ~~Workflow dispatch~~ | ~~Validate workflow exists and user has permissions before triggering~~ (removed — no Actions bridge) |
| ~~MCP sandboxing~~ | ~~If MCP bridge is used, scope tool permissions per user~~ (removed — no MCP bridge) |
| PAT scope validation | Verify user PAT has actions+contents+issues+pull_requests (read+write) + metadata (read) before starting execution |
| Copilot agent identity | Verify `copilot-swe-agent[bot]` assignee identity with live API test before first execution |
| Agent scope constraints | Agent can only push to `copilot/` branches; cannot merge PRs, approve reviews, or push to main/master (R4) |
| Public Preview API | Copilot agent REST API is Public Preview — implement defensively, validate response fields, handle schema changes (R4) |
| Escalation security | Escalation messages don't leak tokens, internal state, or other users' data |
| SSE heartbeat / timeout | 30s heartbeats prevent Azure Container Apps 240s idle timeout; checkpoint events enable crash recovery without data loss (R8) |
| Webhook security (if added) | HMAC-SHA256 signature verification via `X-Hub-Signature-256` + `crypto.timingSafeEqual`; `express.raw()` for raw body; replay protection via `X-GitHub-Delivery` UUID dedup (R8) |

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
| **How to create GitHub resources from web app?** | ✅ **REST API tools** — R1 confirmed all endpoints exist. `githubWrite()` helper + 5 tools. PAT: Issues (write) + Contents (write). | R1 ✅, R10 ✅ (closed by R6) | Stage 4 architecture |
| **Include GitHub Projects v2?** | Full (GraphQL) / Partial (basic) / Skip (use Milestones+Labels) | R2 | Stage 4 scope |
| **How does web app connect to orchestration?** | ✅ **Direct REST API (Option A)** — R3 confirmed all Copilot agent APIs are public REST endpoints. Web app orchestrates directly. No Actions bridge needed. | R3 ✅, R4 ✅ | Stage 5 architecture |
| **How does the web app assign Copilot to issues?** | ✅ **REST API** — Assign `copilot-swe-agent[bot]` via `POST .../issues/{n}/assignees` with `agent_assignment` body (target_repo, base_branch, custom_instructions, custom_agent, model). PAT needs metadata (read) + actions+contents+issues+pull_requests (read+write). API is Public Preview. Agent limited to `copilot/` branches. Two-phase polling for monitoring (issue → PR timeline). | R4 ✅ (deep-dive, builds on R3) | Stage 5 core mechanism |
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
| GitHub write mechanism | REST API custom tools via `githubWrite()` helper in `tools.ts`. PAT needs Issues (write) + Contents (write). 5 new tools: `create_issue`, `create_milestone`, `create_label`, `create_branch`, `update_issue`. | R1 |
| Real-time progress mechanism | Polling + SSE (primary). Server polls GitHub API at adaptive intervals (30s idle / 15s active / 60s no-PR), feeds into SSE stream. Heartbeats (30s) for Azure timeout. Checkpoint+cursor crash recovery. Webhooks optional enhancement. ~12 concurrent issues with adaptive polling. | R8 |
| SDK feature adoption | Tier 1: planning/intent/subagent event forwarding + reasoning effort control + compaction events. Tier 2: user input requests. Defer: file attachments. Skip: MCP, BYOK, custom agents. `planning.started/end` events don't exist — use `session.mode_changed`, `assistant.intent`, `subagent.*` instead. | R6 |
| Workflow dispatch role | Supplementary capability only (R3 chose direct REST API). If ever needed for batch/long-running tasks, use `repository_dispatch` (nested JSON, multi-workflow fan-out) with correlation IDs for run tracking. Neither dispatch mechanism returns a run ID. `workflow_run` webhook available for push-based monitoring. | R7 |
| MCP server for GitHub writes | Skip — native `Tool` handlers are simpler and faster (~0ms vs ~1-5ms IPC overhead per call) than MCP for direct GitHub REST API integration. Official GitHub MCP Server (`github/github-mcp-server`, 28k stars, v0.32) covers ~90% of write operations but requires Docker, missing milestone creation, can't host planning tools. Reconsider if: cross-client reuse needed, >50 concurrent users, process isolation required, team boundary, or GitHub MCP Server adds milestones. MCP `readOnly` permission flag is more granular than custom tool blanket approval — consider adopting in `safePermissionHandler`. | R6, R10 |
| Execution bridge | Direct REST API (Option A). Web app orchestrates via `githubWrite()`. Copilot agent assigned via `copilot-swe-agent[bot]` assignee + `agent_assignment` body (fields: target_repo, base_branch, custom_instructions, custom_agent, model). Review via `copilot-pull-request-reviewer[bot]` (match both bot logins). Reviews always COMMENTED. Monitor via two-phase timeline polling: issue timeline → PR timeline (20s interval). No webhook alternative. API is Public Preview. Agent limited to `copilot/` branches, single repo, can't merge/approve. | R3, R4 |

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
| **Stage 4** | `docs/next-version-plan/research/` (5 research docs), `docs/next-version-plan/github-integration.md`, updated `docs/backend.md`, `docs/frontend.md`, updated `sdk-reference.md` Sections 8-9 (R6) |
| **Stage 5** | `docs/next-version-plan/execution-orchestration.md`, updated `docs/architecture.md`, updated `AGENTS.md`, updated `README.md` |

---

## Stage Comparison: Old vs. New Plan

| Old Plan | Issues | New Plan | Issues | Change |
|---|---|---|---|---|
| Stage 0: Data Model ✅ | 3 | (unchanged) | 3 | — |
| Stage 1: Goal Definition ✅ | 3 | (unchanged) | 3 | — |
| Stage 2: Research Workflow ✅ | 3 | (unchanged) | 3 | — |
| Stage 3: Milestone Planning ✅ | 3 | (unchanged) | 3 | — |
| Stage 4: Issue Generation | 4 | **Stage 4: Research + GitHub Integration + Dashboard** | **~26** | Merged old 4+5, added research sprint, dashboard, persistent storage, SDK enhancements (R6) |
| Stage 5: Execution Structure | 3 | (merged into Stage 4) | — | — |
| Stage 6: Orchestration | 8 | **Stage 5: Execution Orchestration Bridge** | **~28** | Expanded with execution bridge, real-time monitoring, full UI |
| **Total old** | **27** | **Total new** | **~66** | More issues, fewer stages, bigger chains |

**Why:** The agent orchestration process can now handle 20+ issue chains. Bigger stages with more issues mean fewer context switches, fewer stage setup/finalize cycles, and more cohesive feature delivery.
