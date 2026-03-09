# Project Plan: Next Version — AI Project Management & Delivery Orchestration

> **Parent issue:** Research and Planning for Next Version Vision: Stepwise Build, Feedback, and Maintenance
>
> This plan breaks the next-version vision into staged, incremental deliverables. Each stage produces code, tests, and documentation. Every step addresses security and includes a feedback checkpoint before advancing.

---

## Table of Contents

- [Vision Summary](#vision-summary)
- [Current State](#current-state)
- [Architectural Direction](#architectural-direction)
- [Staged Delivery Plan](#staged-delivery-plan)
  - [Stage 0: Data Model Foundation](#stage-0-data-model-foundation)
  - [Stage 1: Goal Definition](#stage-1-goal-definition)
  - [Stage 2: Research Workflow](#stage-2-research-workflow)
  - [Stage 3: Milestone Planning](#stage-3-milestone-planning)
  - [Stage 4: GitHub Issue Generation](#stage-4-github-issue-generation)
  - [Stage 5: GitHub Execution Structure](#stage-5-github-execution-structure)
  - [Stage 6: Orchestration & Review Loop](#stage-6-orchestration--review-loop)
- [Research & Uncertainty Areas](#research--uncertainty-areas)
- [Security Considerations per Stage](#security-considerations-per-stage)
- [Test & Documentation Strategy](#test--documentation-strategy)

---

## Vision Summary

Build a system that uses **GitHub as the operational backend for project execution**. The system supports the full flow from strategy to delivery: defining long-term goals, breaking them into milestones, creating GitHub Projects, generating repository issues, and identifying what research must be completed before coding begins.

**Core principle:** This is an orchestration tool built on top of GitHub — not a replacement for GitHub project management. All features available in GitHub (Projects, Issues, Milestones, Branches, PRs, Labels, Actions, Workflows) are preferred over building custom alternatives. The app handles planning, research, and orchestration; GitHub handles execution and tracking.

**Long-term goal:** Transform a high-level product or system goal into a structured, research-backed, milestone-driven GitHub execution plan that can be completed with **minimal human involvement during delivery**. Each milestone consists of a long execution chain (e.g., 20+ issues), all completed sequentially and merged into a single milestone branch, resulting in one larger PR for that milestone.

**Core workflow:**
1. User defines a goal → system conducts detailed research → creates GitHub milestone plan → generates implementation-ready GitHub issues
2. System creates a dedicated branch per milestone → uses GitHub Actions/Workflows to assign issues to GitHub Copilot coding agent one by one
3. Each issue: coding agent implements → opens PR → Copilot review → review comments addressed by a new coding agent → merge to milestone branch → next issue (automated loop)
4. Milestone complete → validation → final PR to main

**Key requirement:** The planning phase must be **extremely detailed**. All necessary research, analysis, and task definition must be completed before implementation starts, so the generated work is high quality and the coding agent has the context it needs to succeed.

**MVP success criteria** (from [mvp-scope.md](./mvp-scope.md)):
1. A user can define a product/system goal in chat
2. The system generates a research-backed milestone plan
3. Each milestone gets detailed issue drafts created as real GitHub Issues
4. Work is tracked via GitHub Projects and Milestones — not custom dashboards
5. The output is good enough to start implementation in GitHub with minimal manual rewriting

**Post-MVP success criteria:**
6. The system can orchestrate coding agent execution through an entire milestone with minimal human intervention
7. The system suggests MCP servers/tools that could extend automation and reduce human touchpoints
8. The system can deploy ephemeral environments and run tests autonomously

---

## Current State

Phases 1 and 2 from [roadmap.md](../roadmap.md) are **complete**:

| Completed Capability | Status |
|---------------------|--------|
| Custom orchestrator system message | ✅ |
| Session abort (stop button) | ✅ |
| Tool execution events (agent activity) | ✅ |
| AI-generated session titles | ✅ |
| Token usage tracking | ✅ |
| Health monitoring | ✅ |
| 5 GitHub API tools (list_repos, get_repo_structure, read_repo_file, list_issues, search_code) | ✅ |
| Session resumption with sdkSessionId | ✅ |
| Session hooks (pre/post tool, lifecycle, errors) | ✅ |
| Model switching mid-conversation | ✅ |
| Quota monitoring | ✅ |
| Persistent storage (Azure Table/Blob + in-memory fallback) | ✅ |

The **next version** builds on this foundation to add the planning workflow described in [planning-workflow.md](./planning-workflow.md) and the execution model in [github-execution-model.md](./github-execution-model.md).

---

## Architectural Direction

### Key Decisions (from [system-overview.md](./system-overview.md))

| Decision | Rationale |
|----------|-----------|
| **GitHub-first** | Use GitHub Projects, Issues, Milestones, Labels, and Actions natively — don't rebuild what GitHub already provides |
| Web-based orchestration tool | Accessible, no install required — sits on top of GitHub |
| Azure-first architecture | Enterprise support, managed identity, compliance |
| GitHub as execution backend | Issues, milestones, branches, PRs, workflows, code review |
| Per-user GitHub identity | Users authenticate with their own PAT and Copilot subscription |
| Research before coding | High-quality planning prevents bad implementation |
| Milestone branch model | Issue-by-issue control, traceability, lower risk |
| Multi-step task splitting | Big tasks are broken into multiple GitHub Issues, each a step in a larger build |

### New Components Required

**Design principle:** Prefer GitHub native features over custom implementations. The app is an orchestration layer — planning and research happen in the app, but all execution artifacts (issues, milestones, projects, branches, PRs) live in GitHub.

```
┌──────────────────────────────────┐
│  Browser — Orchestration UI      │
│  ├─ Chat Interface (existing)    │
│  ├─ Goal & Research Editor (new) │
│  └─ GitHub Preview (new)         │
│     (preview before creating     │
│      GitHub Issues/Milestones)   │
└────────────┬─────────────────────┘
             │ HTTP/SSE
┌────────────▼─────────────────────┐
│  Express Server — Orchestrator   │
│  ├─ Planning API (new)           │
│  ├─ PlanningStore (new)          │
│  │  (goals, research, drafts —   │
│  │   pre-GitHub planning data)   │
│  ├─ GitHub Write Tools (new)     │
│  └─ Existing chat + tools        │
└────────────┬─────────────────────┘
             │ GitHub REST API
┌────────────▼─────────────────────┐
│  GitHub — Source of Truth        │
│  ├─ Projects (task tracking)     │
│  ├─ Issues (implementation tasks)│
│  ├─ Milestones (delivery phases) │
│  ├─ Branches (code isolation)    │
│  ├─ Labels (categorization)      │
│  └─ Actions (CI/CD, automation)  │
└──────────────────────────────────┘
```

**What lives where:**
- **In the app (PlanningStore):** Goals, research checklists, issue drafts — pre-GitHub planning data that hasn't been pushed to GitHub yet
- **In GitHub (source of truth):** Issues, Milestones, Projects, Branches, PRs, Labels — once created, GitHub is the authoritative source
- **Not built custom:** Task boards (use GitHub Projects), progress dashboards (use GitHub Projects), issue management (use GitHub Issues)

---

## Staged Delivery Plan

Each stage is designed to be **independently valuable**, testable, and deployable. Stages build on each other but each one produces a working increment.

### Stage 0: Data Model Foundation

> **Goal:** Define and implement the core data model for goals, research, milestones, and issues.
>
> **Effort:** Small — 3 issues
>
> **Prerequisite:** None

#### Deliverables

| # | Task | Type |
|---|------|------|
| 0.1 | Define TypeScript interfaces for Goal, Research, Milestone, IssueDraft | Code |
| 0.2 | Define PlanningStore interface with goal/milestone CRUD methods (separate from SessionStore) | Code |
| 0.3 | Implement InMemoryPlanningStore with full CRUD | Code |
| 0.4 | Unit tests for InMemoryPlanningStore (all CRUD operations) | Tests |
| 0.5 | Document data model in `docs/next-version-plan/data-model.md` | Docs |

#### Data Model

```typescript
interface Goal {
  id: string;
  sessionId: string;
  intent: string;
  goal: string;
  problemStatement: string;
  businessValue: string;
  targetOutcome: string;
  successCriteria: string[];
  assumptions: string[];
  constraints: string[];
  risks: string[];
  createdAt: string;
  updatedAt: string;
}

interface ResearchItem {
  id: string;
  goalId: string;
  category: 'domain' | 'architecture' | 'security' | 'infrastructure' | 'integration' | 'data_model' | 'operational' | 'ux';
  question: string;
  status: 'open' | 'researching' | 'resolved';
  findings: string;
  decision: string;
  resolvedAt?: string;
}

interface Milestone {
  id: string;
  goalId: string;
  name: string;
  goal: string;
  scope: string;
  order: number;
  dependencies: string[];
  acceptanceCriteria: string[];
  exitCriteria: string[];
  status: 'draft' | 'ready' | 'in-progress' | 'complete';
}

interface IssueDraft {
  id: string;
  milestoneId: string;
  title: string;
  purpose: string;
  problem: string;
  expectedOutcome: string;
  scopeBoundaries: string;
  technicalContext: string;
  dependencies: string[];
  acceptanceCriteria: string[];
  testingExpectations: string;
  researchLinks: string[];
  order: number;
  status: 'draft' | 'ready' | 'created';
  githubIssueNumber?: number;
}
```

#### Security

- Input validation on all fields (string length limits, enum validation)
- No sensitive data stored in planning records
- All planning data scoped to user session

#### Feedback Checkpoint

- [ ] Data model review — are the interfaces sufficient for the planning workflow?
- [ ] Storage tests pass with >90% coverage of CRUD operations
- [ ] Types compile cleanly with `npx tsc --noEmit`

---

### Stage 1: Goal Definition

> **Goal:** Enable users to define structured goals through the chat interface.
>
> **Effort:** Medium — 2-3 issues
>
> **Prerequisite:** Stage 0

#### Deliverables

| # | Task | Type |
|---|------|------|
| 1.1 | Create `define_goal` tool — agent helps user articulate intent, goal, problem, success criteria | Code |
| 1.2 | Create `save_goal` tool — persists the structured goal record | Code |
| 1.3 | Create `GET /api/goals` and `GET /api/goals/:id` endpoints | Code |
| 1.4 | Update system message to guide users through goal definition flow | Code |
| 1.5 | Integration tests for goal definition tools and endpoints | Tests |
| 1.6 | Frontend: display goal summary card in chat | Code |
| 1.7 | Document goal definition workflow in `docs/next-version-plan/goal-definition.md` | Docs |

#### How It Works

1. User describes what they want to build in chat
2. Agent (guided by system message) asks clarifying questions to fill in the Goal structure
3. Agent calls `save_goal` tool to persist the structured goal
4. Server returns goal ID for subsequent stages
5. Frontend displays a goal summary card

#### Security

- Goal data validated against schema before storage
- Goals are scoped to the user's session/token — no cross-user access
- No PII collection beyond what users voluntarily provide

#### Feedback Checkpoint

- [ ] User can describe a goal and get a structured summary back
- [ ] Goal persists across page refresh (via backend storage)
- [ ] Integration tests verify tool invocation and data round-trip

---

### Stage 2: Research Workflow

> **Goal:** Enable the system to identify unknowns and generate a research checklist before coding starts.
>
> **Effort:** Medium — 2-3 issues
>
> **Prerequisite:** Stage 1

#### Deliverables

| # | Task | Type |
|---|------|------|
| 2.1 | Create `generate_research_checklist` tool — analyzes goal and produces categorized research items | Code |
| 2.2 | Create `update_research_item` tool — marks items as researching/resolved with findings | Code |
| 2.3 | Create `GET /api/goals/:id/research` endpoint | Code |
| 2.4 | Update system message to include research workflow guidance | Code |
| 2.5 | Integration tests for research tools and endpoints | Tests |
| 2.6 | Frontend: research checklist display with status indicators | Code |
| 2.7 | Document research workflow in `docs/next-version-plan/research-workflow.md` | Docs |

#### Research Categories (from [planning-workflow.md](./planning-workflow.md))

| Category | Description |
|----------|-------------|
| Domain | Business logic unknowns |
| Architecture | System design decisions |
| Security | Auth, permissions, compliance questions |
| Infrastructure | Hosting, scaling, resource requirements |
| Integration | Third-party APIs, dependencies |
| Data model | Schema design, storage decisions |
| Operational | Monitoring, logging, alerting needs |
| UX | User experience decisions |

#### Security

- Research items may reference external URLs — validate and sanitize all URLs
- Research findings may contain code snippets — ensure proper escaping in frontend
- Security-category research items should be flagged for human review

#### Feedback Checkpoint

- [ ] Given a goal, the agent generates relevant research questions across all categories
- [ ] User can mark items as resolved with findings
- [ ] Research state persists and is accessible via API

---

### Stage 3: Milestone Planning

> **Goal:** Break a goal into ordered milestones with scope, dependencies, and acceptance criteria.
>
> **Effort:** Medium — 2-3 issues
>
> **Prerequisite:** Stage 2

#### Deliverables

| # | Task | Type |
|---|------|------|
| 3.1 | Create `create_milestone_plan` tool — decomposes goal into milestones using research context | Code |
| 3.2 | Create `update_milestone` tool — edit scope, order, criteria | Code |
| 3.3 | Create `GET /api/goals/:id/milestones` endpoint | Code |
| 3.4 | Integration tests for milestone tools and endpoints | Tests |
| 3.5 | Frontend: milestone timeline/list view | Code |
| 3.6 | Document milestone planning in `docs/next-version-plan/milestone-planning.md` | Docs |

#### Milestone Structure (from [planning-workflow.md](./planning-workflow.md))

Each milestone includes: name, goal, scope, dependencies, acceptance criteria, exit criteria, estimated issue list.

#### Security

- Milestone ordering validated to prevent circular dependencies
- Milestone data scoped to user and goal — no cross-goal access
- Milestone names sanitized to be safe as GitHub milestone titles

#### Feedback Checkpoint

- [ ] Given a goal with completed research, the agent creates a logical milestone breakdown
- [ ] Milestones have clear scope boundaries and dependencies
- [ ] User can review and edit milestones before proceeding

---

### Stage 4: GitHub Issue Generation

> **Goal:** Generate implementation-ready issue drafts and push them to GitHub as real Issues, Milestones, and Project items.
>
> **Effort:** Medium-Large — 3-4 issues
>
> **Prerequisite:** Stage 3

#### Deliverables

| # | Task | Type |
|---|------|------|
| 4.1 | Create `generate_issue_drafts` tool — creates detailed issues for a milestone | Code |
| 4.2 | Create `update_issue_draft` tool — edit any field of an issue draft | Code |
| 4.3 | Create `GET /api/milestones/:id/issues` endpoint | Code |
| 4.4 | Add `create_issue` GitHub API tool in tools.ts — creates real GitHub issue from draft | Code |
| 4.5 | Add `create_milestone` GitHub API tool — creates GitHub milestone | Code |
| 4.6 | Add `create_project` GitHub API tool — creates GitHub Project and adds issues to it | Code |
| 4.7 | Integration tests for issue generation tools and GitHub API tools | Tests |
| 4.8 | Frontend: issue preview cards with approve/edit/create workflow | Code |
| 4.9 | Document issue generation in `docs/next-version-plan/issue-generation.md` | Docs |

#### GitHub-First Principle

Once issue drafts are approved, they become **real GitHub Issues** tracked in a **GitHub Project** with a **GitHub Milestone**. The app does not maintain its own task board or progress dashboard — GitHub Projects is the task tracking UI. The app is the orchestration layer that creates and manages these GitHub resources.

#### Issue Quality (from [planning-workflow.md](./planning-workflow.md), Phase 5)

Each issue contains: title, purpose, problem to solve, expected outcome, scope boundaries, technical context, dependencies, acceptance criteria, testing expectations, links to research and decisions.

#### Security

- GitHub API calls use the user's own PAT — no elevated permissions
- Issue creation requires explicit user approval (not auto-created)
- Issue content sanitized before GitHub API submission
- Validate that user has write access to target repository before attempting creation

#### Feedback Checkpoint

- [ ] Generated issues are detailed enough to be implementation-ready
- [ ] User can preview, edit, and approve issues before GitHub creation
- [ ] Created GitHub issues match the approved drafts

---

### Stage 5: GitHub Execution Structure

> **Goal:** Prepare the GitHub infrastructure for milestone execution (branches, labels, ordering).
>
> **Effort:** Medium — 2-3 issues
>
> **Prerequisite:** Stage 4

#### Deliverables

| # | Task | Type |
|---|------|------|
| 5.1 | Add `create_branch` GitHub API tool — creates milestone integration branches | Code |
| 5.2 | Add `manage_labels` GitHub API tool — creates/assigns labels | Code |
| 5.3 | Create execution plan generator — produces branch naming, issue ordering, label scheme | Code |
| 5.4 | Create `GET /api/milestones/:id/execution-plan` endpoint | Code |
| 5.5 | Integration tests for GitHub structure tools | Tests |
| 5.6 | Frontend: execution plan preview with links to GitHub Project/Milestone views | Code |
| 5.7 | Document execution structure in `docs/next-version-plan/execution-structure.md` | Docs |

#### Branch Model (from [github-execution-model.md](./github-execution-model.md))

- One dedicated integration branch per milestone (e.g., `prx-milestone-auth-foundation`)
- All issue-level PRs target the milestone branch
- Final milestone PR merges into main

#### Security

- Branch creation validated — ensure branch name follows safe naming conventions
- Verify user has branch creation permissions before attempting
- Label names sanitized to prevent injection

#### Feedback Checkpoint

- [ ] Execution plan includes correct branch naming, issue ordering, and labels
- [ ] User can review and approve before any GitHub mutations
- [ ] Branch creation succeeds and is correctly targeted

---

### Stage 6: Orchestration & Review Loop

> **Goal:** Enable the platform to orchestrate full milestone execution through GitHub Copilot coding agent with minimal human intervention.
>
> **Effort:** Large — 6-8 issues
>
> **Prerequisite:** Stage 5
>
> **Note:** This stage extends beyond MVP scope and contains significant research areas. It is the core of the long-term vision.

#### Deliverables

| # | Task | Type |
|---|------|------|
| 6.1 | Research GitHub Copilot coding agent integration path (API, workflow triggers, MCP) | Research |
| 6.2 | Create `assign_to_agent` tool — assigns issue to coding agent via GitHub Actions workflow | Code |
| 6.3 | Create `monitor_execution` tool — tracks issue implementation progress, detects completion | Code |
| 6.4 | Implement the milestone execution loop — sequential issue processing with auto-advance | Code |
| 6.5 | Implement AI-assisted PR review classification (valid/optional/irrelevant) | Code |
| 6.6 | Implement review comment fix loop — new coding agent addresses valid review comments | Code |
| 6.7 | Implement human stop gates — pause execution when human input is needed | Code |
| 6.8 | Create milestone completion flow — validate, summarize, final PR to main | Code |
| 6.9 | Research and suggest MCP servers/tools for extended automation | Research |
| 6.10 | Integration tests for orchestration workflow | Tests |
| 6.11 | Frontend: orchestration controls with links to GitHub Project for progress tracking | Code |
| 6.12 | Document orchestration in `docs/next-version-plan/orchestration.md` | Docs |

#### Milestone Execution Loop (from [github-execution-model.md](./github-execution-model.md))

A milestone consists of a **long execution chain** (potentially 20+ issues) that runs with minimal human involvement:

```
┌─────────────────────────────────────────────────────────────┐
│  MILESTONE EXECUTION LOOP                                   │
│                                                             │
│  For each issue in milestone (sequential order):            │
│                                                             │
│  1. Select next ready issue                                 │
│  2. Assign to Copilot coding agent (via GitHub Actions)     │
│  3. Agent creates work branch from milestone branch         │
│  4. Agent implements the issue                              │
│  5. Agent opens PR targeting milestone branch               │
│  6. CI checks run automatically                             │
│  7. Copilot review reviews the PR                           │
│  8. Review comments classified (valid/optional/irrelevant)  │
│  9. Valid comments → new coding agent applies fixes         │
│  10. Re-review if needed (max 2 cycles)                     │
│  11. Merge PR into milestone branch                         │
│  12. → Next issue (loop back to step 1)                     │
│                                                             │
│  STOP CONDITIONS (pause and request human input):           │
│  • CI checks fail after fix attempt                         │
│  • Review cycle exceeds max retries                         │
│  • Agent reports it cannot complete the task                 │
│  • Conflicting changes detected                             │
│  • Security-sensitive changes flagged                        │
│                                                             │
│  ON MILESTONE COMPLETE:                                     │
│  1. Validate integrated milestone state                     │
│  2. Run full test suite against milestone branch             │
│  3. Generate milestone summary                              │
│  4. Open final PR from milestone branch → main              │
│  5. Human review and merge                                  │
└─────────────────────────────────────────────────────────────┘
```

#### Human Stop Gates

The system must know when to stop and ask for human input:
- **Build failures** that can't be resolved by the agent
- **Review loops** that exceed the maximum retry count (2 cycles)
- **Scope ambiguity** — agent reports the issue is unclear
- **Security-sensitive changes** — flagged for human review
- **Dependency conflicts** — agent detects merge conflicts it can't resolve
- **Test failures** — tests fail after implementation and fix attempts

When stopped, the system provides a clear summary of what happened, what was attempted, and what input is needed.

#### MCP & Tool Suggestions for Extended Automation

The system should suggest MCP servers and tools that could extend its automation capabilities and reduce human touchpoints. Examples:
- **Ephemeral deployment MCP** — deploy the system to a temporary environment and run integration tests against it autonomously
- **Test runner MCP** — execute test suites and report results back to the orchestration loop
- **Code analysis MCP** — run static analysis, linting, security scanning before PR review
- **Notification MCP** — alert humans via Slack/Teams/email when stop gates are triggered
- **Documentation MCP** — auto-generate documentation from code changes

Research in Stage 6.9 should identify which MCP servers already exist and which need to be built.

#### Security

- All autonomous actions logged in audit trail with full context
- Human approval required before merge-to-main (milestone PR)
- Human stop gates enforced at every failure point — system never retries silently
- Rate limiting on GitHub API calls to prevent abuse
- Review comment classification must err on the side of caution (flag uncertain items for human review)
- MCP server integrations must be sandboxed — no unrestricted system access
- Ephemeral deployments must be time-limited and automatically torn down

#### Feedback Checkpoint

- [ ] Orchestration can execute a single issue end-to-end with human oversight
- [ ] Review loop correctly classifies comments and applies fixes via new agent
- [ ] Human stop gates trigger correctly on failure conditions
- [ ] Milestone completion produces a clean summary PR to main
- [ ] System can run through a multi-issue milestone (5+ issues) with minimal human intervention

---

## Research & Uncertainty Areas

These questions (from [open-questions.md](./open-questions.md)) must be resolved through research during the relevant stages.

### Product Questions — Resolve in Stages 3-4

| Question | Recommended Resolution | Resolve By |
|----------|----------------------|------------|
| Should the platform create GitHub Projects automatically or optionally? | **Yes, create GitHub Projects** — the platform is an orchestration layer on top of GitHub; Projects are the native way to track work | Stage 4 |
| Should milestone execution always be sequential? | **Yes for v1** — sequential execution is simpler and safer | Stage 3 |
| Should one milestone be limited to one repository in v1? | **Yes** — single repo per milestone in v1, multi-repo in future | Stage 3 |
| Should users approve milestone plans before issue creation? | **Yes** — explicit approval required at every stage | Stage 4 |

### Technical Questions — Resolve in Stages 5-6

| Question | Recommended Resolution | Resolve By |
|----------|----------------------|------------|
| What is the exact Copilot coding agent integration path? | **Research in Stage 6.1** — investigate GitHub API, workflow triggers, MCP integration | Stage 6 |
| How to trigger coding agent on issues via GitHub Actions? | **Research in Stage 6.1** — investigate workflow_dispatch, issue assignment triggers | Stage 6 |
| Event-driven, workflow-driven, or hybrid orchestration? | **Start workflow-driven** — GitHub Actions for v1, events for v2 | Stage 6 |
| How should review comments be classified? | **Conservative classification** — flag uncertain items for human review | Stage 6 |
| How should failed issues be retried or escalated? | **Escalate to human** after 1-2 retry attempts with clear context summary | Stage 6 |
| How to address PR review comments automatically? | **New coding agent instance** addresses valid review comments, then re-review | Stage 6 |
| What MCP servers/tools could extend automation? | **Research in Stage 6.9** — identify existing MCP servers, plan custom ones | Stage 6 |
| Can the system deploy ephemeral environments for testing? | **Research in Stage 6.9** — investigate container-based ephemeral deployments | Stage 6 |
| How long can an execution chain run without human input? | **Start with 5-10 issues per uninterrupted chain**, increase as confidence grows | Stage 6 |

### Architecture Questions — Resolve in Stage 0

| Question | Recommended Resolution | Resolve By |
|----------|----------------------|------------|
| Cosmos DB or Azure SQL for planning data? | **Start with in-memory + Azure Table/Blob** (existing pattern), evaluate Cosmos DB later | Stage 0 |
| Entra ID only, or Entra ID + GitHub OAuth? | **GitHub PAT only for v1** (existing pattern), add Entra ID later | Stage 0 |
| What audit model is required? | **Session hooks + structured logging** (existing pattern), formalize in Stage 6 | Stage 6 |
| What permissions are needed? | **Document minimum PAT scopes** per stage as tools are added | Each Stage |

### Safety Questions — Cross-cutting, Address in Every Stage

| Question | Resolution |
|----------|-----------|
| What actions require human approval? | **All GitHub write operations** (create issue, create branch, merge PR) require approval in v1 |
| When should the system stop autonomous execution? | **On any failure** — escalate to human with clear context, never retry silently |
| How to handle dependency conflicts? | **Sequential execution** prevents most conflicts; flag remaining ones for human review |
| How long should the system run without human check-in? | **Configurable per milestone** — suggest stop gates every N issues for early stages |
| What is the maximum review cycle count? | **2 cycles** — after 2 review-fix rounds, escalate to human |

---

## Security Considerations per Stage

| Stage | Security Focus |
|-------|---------------|
| Stage 0 | Input validation, data scoping, no PII in planning records |
| Stage 1 | Goal data schema validation, session-scoped access |
| Stage 2 | URL sanitization in research items, code snippet escaping |
| Stage 3 | Circular dependency detection, milestone name sanitization |
| Stage 4 | User PAT permission verification, explicit approval for GitHub writes, content sanitization |
| Stage 5 | Branch name validation, label sanitization, permission checks |
| Stage 6 | Audit trail for all autonomous actions, human stop gates, rate limiting, conservative review classification, MCP sandboxing, ephemeral environment cleanup |

**Cross-cutting security principles:**
- All data scoped to the authenticated user's session and token
- No persistent server-side token storage; tokens only exist in browser localStorage and in-memory Maps during active sessions
- All GitHub API calls use the user's own PAT
- All GitHub write operations require explicit user approval
- Input validation on all user-provided data
- Structured logging for audit trails

---

## Planning Phase: Why Extreme Detail Matters

The key to successful autonomous execution is **extremely detailed upfront planning**. The system must ensure that all necessary research, analysis, and task definition are completed before implementation starts. This is what enables a coding agent to succeed:

### What the Agent Needs to Succeed

Each generated issue must contain enough context for a coding agent to implement it without asking clarifying questions:
- **Clear problem statement** — what needs to be built and why
- **Exact scope boundaries** — what's in scope and explicitly out of scope
- **Technical context** — which files to modify, which patterns to follow, which APIs to use
- **Dependencies** — what must exist before this issue can be started
- **Acceptance criteria** — testable conditions that define "done"
- **Testing expectations** — which tests to write, which test patterns to follow
- **Security considerations** — what to validate, sanitize, or gate

### Research Must Be Complete Before Coding

The research phase (Stage 2) exists because incomplete research leads to:
- Agents making wrong architectural decisions
- Issues that need to be reworked after implementation
- Wasted execution cycles
- Cascading failures through dependent issues

A milestone should not begin execution until all research items for its issues are marked as resolved.

### Quality Gate: Planning Completeness Check

Before a milestone enters the execution loop, validate:
- [ ] All research items resolved
- [ ] All issues have complete acceptance criteria
- [ ] All dependencies between issues are satisfied
- [ ] Technical context references existing code patterns
- [ ] No ambiguous scope boundaries
- [ ] Security considerations documented per issue

---

## Test & Documentation Strategy

### Testing Approach per Stage

| Test Type | When | Tools | Coverage Target |
|-----------|------|-------|----------------|
| **Unit tests** | Every stage | `npx tsx` (storage.test.ts pattern) | All CRUD operations, data validation |
| **Integration tests** | Stages 1-6 | `npx tsx test.ts` pattern | Tool invocation, API endpoints, data round-trips |
| **E2E tests** | Stages with UI changes | Playwright | User workflows, approval flows |
| **Typecheck** | Every commit | `npx tsc --noEmit` | Zero errors |

### Documentation per Stage

Each stage produces:
1. **Implementation doc** in `docs/next-version-plan/` — detailed design for the stage
2. **Updated architecture.md** — if new components are added
3. **Updated README.md** — if new API endpoints or user-facing features are added
4. **Inline code documentation** — for complex logic

### Maintaining Tests and Docs

Agents working on each stage should:
1. **Write tests first** — define expected behavior before implementation
2. **Run existing tests** — ensure no regressions (`npm run test:storage`, `npx tsc --noEmit`)
3. **Update docs alongside code** — never merge code without corresponding doc updates
4. **Include security validation** — test input validation, access control, error handling
5. **Document decisions** — record why choices were made in the relevant stage doc
