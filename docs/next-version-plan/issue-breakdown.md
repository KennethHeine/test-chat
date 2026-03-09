# Issue Breakdown: Implementation-Ready Issues for Next Version

> **Parent issue:** Research and Planning for Next Version Vision: Stepwise Build, Feedback, and Maintenance
>
> Each issue below is designed to be assigned to a GitHub Copilot coding agent. Issues are ordered by dependency and grouped by stage. All issues reference the parent planning issue.
>
> **GitHub-first principle:** This app is an orchestration tool built on top of GitHub. All features available in GitHub (Projects, Issues, Milestones, Labels, Actions) should be preferred over building custom alternatives. The app handles planning and research; GitHub handles execution and tracking.

---

## Issue Index

| # | Stage | Issue Title | Type | Dependencies |
|---|-------|------------|------|-------------|
| 1 | 0 | Define planning data model interfaces | Code + Tests | None |
| 2 | 0 | Implement InMemoryPlanningStore | Code + Tests | #1 |
| 3 | 0 | Document data model | Docs | #1 |
| 4 | 1 | Create goal definition tools | Code + Tests | #2 |
| 5 | 1 | Create goal API endpoints | Code + Tests | #2 |
| 6 | 1 | Frontend goal summary display | Code + Tests | #5 |
| 7 | 2 | Create research workflow tools | Code + Tests | #4 |
| 8 | 2 | Create research API endpoints | Code + Tests | #2 |
| 9 | 2 | Frontend research checklist display | Code + Tests | #8 |
| 10 | 3 | Create milestone planning tools | Code + Tests | #7 |
| 11 | 3 | Create milestone API endpoints | Code + Tests | #2 |
| 12 | 3 | Frontend milestone timeline view | Code + Tests | #11 |
| 13 | 4 | Create issue generation tools | Code + Tests | #10 |
| 14 | 4 | Add GitHub write tools (create_issue, create_milestone, create_project) | Code + Tests | #2 |
| 15 | 4 | Create issue draft API endpoints | Code + Tests | #2 |
| 16 | 4 | Frontend issue preview and approval workflow | Code + Tests | #15 |
| 17 | 5 | Add GitHub structure tools (create_branch, manage_labels) | Code + Tests | #14 |
| 18 | 5 | Create execution plan generator | Code + Tests | #10, #13 |
| 19 | 5 | Frontend execution plan preview | Code + Tests | #18 |
| 20 | 6 | Research Copilot coding agent integration and MCP tools | Research | None |
| 21 | 6 | Implement milestone execution loop (sequential issue processing) | Code + Tests | #17, #18, #20 |
| 22 | 6 | Implement coding agent assignment via GitHub Actions | Code + Tests | #21 |
| 23 | 6 | Implement AI-assisted PR review and fix loop | Code + Tests | #22 |
| 24 | 6 | Implement human stop gates and escalation | Code + Tests | #21 |
| 25 | 6 | Implement milestone completion flow (validate, summarize, final PR) | Code + Tests | #21, #23 |
| 26 | 6 | Frontend orchestration controls | Code + Tests | #21 |

---

## Stage 0: Data Model Foundation

### Issue 1: Define planning data model interfaces

**Purpose:** Establish the TypeScript interfaces that all planning features build upon.

**Problem to solve:** The system needs structured types for goals, research items, milestones, and issue drafts to ensure type safety across the planning workflow.

**Expected outcome:**
- New file `planning-types.ts` with exported interfaces: `Goal`, `ResearchItem`, `Milestone`, `IssueDraft`
- Each interface has JSDoc comments explaining fields
- All fields use strict types (no `any`)

**Scope boundaries:**
- Only type definitions — no implementation logic
- No storage or API changes

**Technical context:**
- Follow the existing TypeScript strict mode (`tsconfig.json` with `strict: true`)
- Use string literal union types for status fields (e.g., `'draft' | 'ready' | 'created'`)
- Use ISO 8601 strings for dates (consistent with existing `SessionMetadata.createdAt`)

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] All interfaces exported and importable from `planning-types.ts`
- [ ] Each field has a JSDoc comment
- [ ] No `any` types used

**Testing expectations:**
- Typecheck only — no runtime tests needed for type definitions

**Security checklist:**
- [ ] No sensitive data fields (tokens, passwords) in interfaces
- [ ] String length constraints documented in JSDoc comments

---

### Issue 2: Implement InMemoryPlanningStore

**Purpose:** Provide an in-memory implementation of the planning data storage for development and testing.

**Problem to solve:** Planning data (goals, research, milestones, issues) needs CRUD operations with proper validation and scoping.

**Expected outcome:**
- New file `planning-store.ts` with `PlanningStore` interface and `InMemoryPlanningStore` class
- Full CRUD for all four entity types: Goal, ResearchItem, Milestone, IssueDraft
- Input validation on create/update operations

**Scope boundaries:**
- In-memory only — no Azure Storage implementation (follows existing `InMemorySessionStore` pattern)
- No API endpoints — just the store

**Technical context:**
- Follow the pattern in `storage.ts` with `InMemorySessionStore`
- Use `Map<string, Entity>` for in-memory storage
- Validate required fields on create, optional fields on update

**Dependencies:**
- Issue #1 (planning data model interfaces)

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` passes
- [ ] All CRUD operations implemented for Goal, ResearchItem, Milestone, IssueDraft
- [ ] Input validation rejects invalid data with descriptive errors
- [ ] Data scoped by goalId/milestoneId (no cross-entity access)

**Testing expectations:**
- Unit tests in `planning-store.test.ts` following the `storage.test.ts` pattern
- Test all CRUD operations (create, read, update, delete, list) for each of the 4 entity types
- Test input validation (missing required fields, invalid enums)
- Test scoping (list research items by goalId, list issues by milestoneId)
- Target: full CRUD coverage across all entity types, plus validation and scoping scenarios

**Security checklist:**
- [ ] Input validation on all fields
- [ ] No ability to access data across different goals/milestones without correct IDs
- [ ] Descriptive but safe error messages (no stack traces or internal state)

---

### Issue 3: Document data model

**Purpose:** Document the planning data model for developers working on subsequent stages.

**Problem to solve:** Future contributors need to understand the data model, its constraints, and design decisions.

**Expected outcome:**
- New file `docs/next-version-plan/data-model.md`
- Documents all interfaces with field descriptions
- Includes entity relationship diagram
- Documents validation rules
- Explains design decisions

**Scope boundaries:**
- Documentation only — no code changes

**Dependencies:**
- Issue #1 (interfaces must be finalized)

**Acceptance criteria:**
- [ ] All four entity types documented
- [ ] Validation rules listed per entity
- [ ] Entity relationship diagram included (text-based)
- [ ] Links to relevant source files

---

## Stage 1: Goal Definition

### Issue 4: Create goal definition tools

**Purpose:** Enable the Copilot agent to help users define structured goals through the chat interface.

**Problem to solve:** Users need a guided workflow to articulate their intent, goals, problems, and success criteria in a structured format.

**Expected outcome:**
- New tools in `tools.ts` (or separate `planning-tools.ts`): `define_goal`, `save_goal`, `get_goal`
- `define_goal` takes user's raw input and returns a structured goal template
- `save_goal` validates and persists the goal via PlanningStore
- `get_goal` retrieves a goal by ID

**Scope boundaries:**
- Tool definitions only — no API endpoints (those are Issue #5)
- No frontend changes (those are Issue #6)

**Technical context:**
- Follow the existing tool pattern in `tools.ts` using raw JSON Schema
- Tools are created per-session with the user's token via a factory function
- Tools are passed to `buildSessionConfig()` for inclusion in sessions

**Dependencies:**
- Issue #2 (InMemoryPlanningStore)

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` passes
- [ ] `define_goal` returns a structured goal template from unstructured input
- [ ] `save_goal` validates all required fields before saving
- [ ] `get_goal` returns the correct goal by ID
- [ ] Tools follow the existing JSON Schema pattern

**Testing expectations:**
- Integration tests verifying tool registration and invocation
- Test validation: missing required fields rejected
- Test data round-trip: save → get returns same data

**Security checklist:**
- [ ] Input validation on all goal fields
- [ ] String length limits enforced (prevent large payload attacks)
- [ ] Goal IDs are random UUIDs (not sequential/guessable)

---

### Issue 5: Create goal API endpoints

**Purpose:** Expose planning goals via REST API for frontend consumption.

**Problem to solve:** The frontend needs to read goals to display them in the UI, independent of the chat flow.

**Expected outcome:**
- `GET /api/goals` — list all goals for the authenticated user
- `GET /api/goals/:id` — get a specific goal

**Scope boundaries:**
- Read-only API — goals are created via tools, not direct API calls
- No frontend changes (those are Issue #6)

**Technical context:**
- Follow the existing API pattern in `server.ts` (Bearer token auth, error handling)
- Goals are scoped to the user's token

**Dependencies:**
- Issue #2 (InMemoryPlanningStore)

**Acceptance criteria:**
- [ ] `npx tsc --noEmit` passes
- [ ] Both endpoints return correct data
- [ ] Endpoints require authentication (401 without token)
- [ ] Non-existent goal returns 404

**Testing expectations:**
- Integration tests following the `test.ts` pattern
- Test authentication enforcement
- Test 404 for missing goals

**Security checklist:**
- [ ] Authentication required on all endpoints
- [ ] Users can only access their own goals
- [ ] Error responses don't leak internal state

---

### Issue 6: Frontend goal summary display

**Purpose:** Show the user's defined goals in the chat interface.

**Problem to solve:** After defining a goal through chat, users need to see a structured summary they can review and reference.

**Expected outcome:**
- Goal summary card rendered in the chat when `save_goal` tool completes
- Card shows: intent, goal, problem statement, success criteria
- Card is non-editable (view only)

**Scope boundaries:**
- Display only — no editing, no creation via UI
- Chat-embedded display (not a separate page)

**Technical context:**
- Follow existing chat message rendering in `public/app.js`
- Use existing CSS patterns from `public/index.html`
- Handle the tool completion event to trigger card rendering

**Dependencies:**
- Issue #5 (goal API endpoints)

**Acceptance criteria:**
- [ ] Goal card renders correctly in the chat flow
- [ ] Card displays all key goal fields
- [ ] Card is styled consistently with existing chat UI
- [ ] Works with dark theme

**Testing expectations:**
- E2E test verifying goal card appears after tool invocation
- Visual verification screenshot

**Security checklist:**
- [ ] Goal content properly escaped before rendering (XSS prevention)
- [ ] No token data displayed in the card

---

## Stage 2: Research Workflow

### Issue 7: Create research workflow tools

**Purpose:** Enable the agent to generate and manage research checklists for a defined goal.

**Expected outcome:**
- `generate_research_checklist` tool — analyzes goal and produces categorized research items
- `update_research_item` tool — updates status and findings for a research item
- `get_research` tool — retrieves research items for a goal

**Dependencies:**
- Issue #4 (goal definition tools — need an existing goal to research)

**Acceptance criteria:**
- [ ] Research items generated across all 8 categories (domain, architecture, security, infrastructure, integration, data_model, operational, ux)
- [ ] Items can be updated from 'open' → 'researching' → 'resolved'
- [ ] Resolved items include findings and optional decision text

**Testing expectations:**
- Integration tests for tool invocation and data persistence
- Test category coverage (all 8 categories represented)

**Security checklist:**
- [ ] Research findings content sanitized
- [ ] URL fields validated if present

---

### Issue 8: Create research API endpoints

**Purpose:** Expose research data via REST API.

**Expected outcome:**
- `GET /api/goals/:id/research` — list research items for a goal

**Dependencies:**
- Issue #2 (InMemoryPlanningStore)

**Acceptance criteria:**
- [ ] Endpoint returns research items scoped to the goal
- [ ] Authentication required
- [ ] Empty list returned for goals with no research items

**Testing expectations:**
- Integration tests following `test.ts` patterns

**Security checklist:**
- [ ] Authentication enforced
- [ ] Goal access scoped to user

---

### Issue 9: Frontend research checklist display

**Purpose:** Show research progress in the chat interface.

**Expected outcome:**
- Research checklist rendered in chat with status indicators (open/researching/resolved)
- Visual distinction between categories

**Dependencies:**
- Issue #8 (research API endpoints)

**Acceptance criteria:**
- [ ] Checklist renders with correct status per item
- [ ] Categories visually grouped
- [ ] Dark theme compatible

**Testing expectations:**
- E2E test verifying checklist rendering

**Security checklist:**
- [ ] Content escaped before rendering

---

## Stage 3: Milestone Planning

### Issue 10: Create milestone planning tools

**Purpose:** Enable the agent to decompose goals into structured milestones.

**Expected outcome:**
- `create_milestone_plan` tool — decomposes a goal into ordered milestones using research context
- `update_milestone` tool — edit milestone fields
- `get_milestones` tool — retrieve milestones for a goal

**Dependencies:**
- Issue #7 (research tools — milestones informed by research)

**Acceptance criteria:**
- [ ] Milestones include all fields from planning-workflow.md (name, goal, scope, dependencies, acceptance criteria, exit criteria)
- [ ] Milestones have correct ordering
- [ ] Dependencies between milestones are validated

**Testing expectations:**
- Integration tests for tool invocation
- Test ordering and dependency validation

**Security checklist:**
- [ ] Milestone names safe for GitHub API use (sanitized)
- [ ] No circular dependencies allowed

---

### Issue 11: Create milestone API endpoints

**Purpose:** Expose milestone data via REST API.

**Expected outcome:**
- `GET /api/goals/:id/milestones` — list milestones for a goal

**Dependencies:**
- Issue #2 (InMemoryPlanningStore)

**Acceptance criteria:**
- [ ] Milestones returned in order
- [ ] Authentication required

**Testing expectations:**
- Integration tests

**Security checklist:**
- [ ] Authentication enforced, goal-scoped access

---

### Issue 12: Frontend milestone timeline view

**Purpose:** Display milestones in the chat interface.

**Expected outcome:**
- Milestone timeline/list rendered in chat showing name, status, and dependencies

**Dependencies:**
- Issue #11 (milestone API endpoints)

**Acceptance criteria:**
- [ ] Timeline shows milestones in order with status indicators
- [ ] Dependencies visually indicated

**Testing expectations:**
- E2E test

**Security checklist:**
- [ ] Content escaped

---

## Stage 4: GitHub Issue Generation

### Issue 13: Create issue generation tools

**Purpose:** Generate implementation-ready issue drafts for each milestone.

**Expected outcome:**
- `generate_issue_drafts` tool — creates detailed issues for a milestone
- `update_issue_draft` tool — edit issue fields
- `get_issue_drafts` tool — retrieve issues for a milestone

**Dependencies:**
- Issue #10 (milestone tools — issues belong to milestones)

**Acceptance criteria:**
- [ ] Issues contain all fields from planning-workflow.md Phase 5
- [ ] Issues reference research items where relevant
- [ ] Issues have correct ordering within milestone

**Testing expectations:**
- Integration tests
- Test issue quality (all required fields populated)

**Security checklist:**
- [ ] Issue content safe for GitHub API submission
- [ ] No internal system data leaked into issue content

---

### Issue 14: Add GitHub write tools (create_issue, create_milestone, create_project)

**Purpose:** Enable the platform to create real GitHub Issues, Milestones, and Projects from approved drafts. These are the core GitHub-first tools — once planning is done in the app, everything moves to GitHub.

**Expected outcome:**
- `create_issue` tool in `tools.ts` — creates a GitHub issue using the REST API
- `create_milestone` tool in `tools.ts` — creates a GitHub milestone
- `create_project` tool in `tools.ts` — creates a GitHub Project and adds issues to it
- All require explicit parameters (no auto-creation)

**Dependencies:**
- Issue #2 (planning store for tracking created issues)

**Acceptance criteria:**
- [ ] Tools create correct GitHub resources (Issues, Milestones, Projects)
- [ ] Created issue/milestone numbers stored back in draft records
- [ ] GitHub Project created with correct issue associations
- [ ] Tools handle GitHub API errors gracefully
- [ ] Tools validate user has write access before attempting creation

**Testing expectations:**
- Integration tests with real GitHub API calls (requires token with repo scope)
- Test error handling for permission denied
- Test Project creation and issue linking

**Security checklist:**
- [ ] User's own PAT used for all API calls
- [ ] Write operations logged in session hooks
- [ ] Input sanitized before GitHub API submission
- [ ] Permission validation before write attempts

---

### Issue 15: Create issue draft API endpoints

**Purpose:** Expose issue drafts via REST API.

**Expected outcome:**
- `GET /api/milestones/:id/issues` — list issue drafts for a milestone

**Dependencies:**
- Issue #2 (InMemoryPlanningStore)

**Acceptance criteria:**
- [ ] Issues returned in order
- [ ] Authentication required

**Testing expectations:**
- Integration tests

**Security checklist:**
- [ ] Authentication enforced, milestone-scoped access

---

### Issue 16: Frontend issue preview and approval workflow

**Purpose:** Let users preview, edit, and approve issue drafts before GitHub creation.

**Expected outcome:**
- Issue draft cards rendered in chat
- Each card has "Approve & Create" button
- Approval calls the create_issue tool

**Dependencies:**
- Issue #15 (issue draft API endpoints)

**Acceptance criteria:**
- [ ] Issue cards show all key fields
- [ ] Approval workflow requires explicit click
- [ ] Created issues show GitHub issue number/link

**Testing expectations:**
- E2E test for approval workflow

**Security checklist:**
- [ ] Approval action requires confirmation
- [ ] Content escaped before rendering

---

## Stage 5: GitHub Execution Structure

### Issue 17: Add GitHub structure tools (create_branch, manage_labels)

**Purpose:** Prepare GitHub repository infrastructure for milestone execution.

**Expected outcome:**
- `create_branch` tool — creates a milestone integration branch
- `manage_labels` tool — creates and assigns labels for milestone/issue tracking

**Dependencies:**
- Issue #14 (GitHub write tools pattern)

**Acceptance criteria:**
- [ ] Branch created with correct naming convention (e.g., `prx-milestone-{name}`)
- [ ] Labels created with consistent color scheme
- [ ] Both tools handle existing resources gracefully (idempotent)

**Testing expectations:**
- Integration tests with real GitHub API

**Security checklist:**
- [ ] Branch names sanitized (no special characters)
- [ ] Label names sanitized
- [ ] Permission validation before operations

---

### Issue 18: Create execution plan generator

**Purpose:** Generate a complete execution plan for a milestone.

**Expected outcome:**
- Tool that produces: branch strategy, issue execution order, label scheme, PR targets

**Dependencies:**
- Issue #10 (milestones), Issue #13 (issues)

**Acceptance criteria:**
- [ ] Plan includes all elements from github-execution-model.md
- [ ] Issue ordering respects dependencies
- [ ] Branch naming follows convention

**Testing expectations:**
- Unit tests for plan generation logic
- Integration tests for full plan output

**Security checklist:**
- [ ] All generated names safe for GitHub API use

---

### Issue 19: Frontend execution plan preview

**Purpose:** Display the execution plan before GitHub infrastructure creation.

**Expected outcome:**
- Execution plan visualization in chat
- Shows branch strategy, issue order, labels

**Dependencies:**
- Issue #18 (execution plan generator)

**Acceptance criteria:**
- [ ] Plan clearly displayed
- [ ] User can review before approving execution

**Testing expectations:**
- E2E test

**Security checklist:**
- [ ] Content escaped

---

## Stage 6: Orchestration & Review Loop

### Issue 20: Research Copilot coding agent integration and MCP tools

**Purpose:** Investigate how to programmatically assign GitHub issues to the Copilot coding agent, trigger execution via GitHub Actions/Workflows, and identify MCP servers/tools that could extend automation.

**Problem to solve:** The orchestration loop requires programmatic control of coding agent assignment and monitoring. We also need to identify what MCP servers or tools could make the system run longer without human input (e.g., ephemeral deployment, autonomous testing, code analysis).

**Expected outcome:**
- Research document in `docs/next-version-plan/agent-integration-research.md`
- Documents: API endpoints, workflow triggers, authentication requirements, limitations, recommended approach
- MCP tool landscape assessment: what exists, what needs to be built, what could enable ephemeral deployment + test
- Recommended architecture for the execution loop

**Scope boundaries:**
- In scope: Copilot coding agent API, GitHub Actions triggers, MCP server research, ephemeral deployment options
- Out of scope: Implementing any of the tools (just research)

**Dependencies:**
- None (can start in parallel with other stages)

**Acceptance criteria:**
- [ ] Coding agent integration path documented (API, workflow, or hybrid)
- [ ] GitHub Actions workflow trigger approach documented
- [ ] MCP server landscape assessed (existing vs. needs-building)
- [ ] Ephemeral deployment options documented (containers, cloud, etc.)
- [ ] Recommended approach proposed with pros/cons
- [ ] Security boundaries of agent execution identified

**Testing expectations:**
- No code tests — research deliverable only

**Security checklist:**
- [ ] Document permission requirements for agent assignment
- [ ] Identify security boundaries of agent execution
- [ ] Document MCP server sandboxing requirements

---

### Issue 21: Implement milestone execution loop (sequential issue processing)

**Purpose:** Build the core orchestration engine that processes milestone issues sequentially, managing the lifecycle of each issue from assignment to merge.

**Problem to solve:** A milestone may consist of 20+ issues that need to be executed sequentially, each building on the previous. The system needs to manage this chain automatically, advancing to the next issue after each successful merge into the milestone branch.

**Expected outcome:**
- Orchestration engine that processes issues in order within a milestone
- State machine tracking each issue through: pending → assigned → in-progress → review → merged
- Auto-advance to next issue on successful merge
- Status tracking for the overall milestone execution

**Scope boundaries:**
- In scope: Sequential issue processing, state management, auto-advance logic
- Out of scope: Agent assignment mechanism (Issue #22), review classification (Issue #23), human stop gates (Issue #24)

**Technical context:**
- Follow existing tool patterns in `tools.ts`
- Store execution state in PlanningStore (from Issue #2)
- Use GitHub API to monitor PR status and merge events

**Dependencies:**
- Issue #17 (GitHub structure tools), Issue #18 (execution plan), Issue #20 (research)

**Acceptance criteria:**
- [ ] Can execute a milestone's issues in sequential order
- [ ] State tracked at each step for every issue
- [ ] Auto-advances to next issue after successful merge
- [ ] Handles the full chain (tested with 5+ issues)
- [ ] Audit trail maintained for all actions

**Testing expectations:**
- Integration tests for orchestration lifecycle
- Test sequential processing with mock GitHub API
- Test state transitions for each issue lifecycle phase

**Security checklist:**
- [ ] All autonomous actions logged with full context
- [ ] Rate limiting on GitHub API calls
- [ ] Execution state scoped to user session

---

### Issue 22: Implement coding agent assignment via GitHub Actions

**Purpose:** Enable the system to assign issues to the Copilot coding agent and trigger execution via GitHub Actions workflows.

**Problem to solve:** The execution loop needs a mechanism to assign each issue to the coding agent and kick off implementation. This should use GitHub Actions workflows as the trigger mechanism, allowing the system to start a coding agent on an issue against the milestone branch.

**Expected outcome:**
- `assign_to_agent` tool that triggers coding agent on a specific issue
- GitHub Actions workflow template for agent execution
- Monitoring of agent progress (in-progress, completed, failed)

**Scope boundaries:**
- In scope: Agent assignment, workflow trigger, progress monitoring
- Out of scope: Review classification (Issue #23), stop gates (Issue #24)

**Technical context:**
- Follow tool patterns in `tools.ts`
- Use GitHub Actions API to trigger workflows
- Based on research from Issue #20

**Dependencies:**
- Issue #21 (milestone execution loop)

**Acceptance criteria:**
- [ ] Can assign an issue to the coding agent
- [ ] Agent starts working on the issue (verified via GitHub API)
- [ ] Progress tracked (in-progress, completed, failed)
- [ ] Works against a milestone branch (not main)

**Testing expectations:**
- Integration tests with real GitHub API calls (requires token with repo/actions scope)
- Test error handling for agent assignment failures

**Security checklist:**
- [ ] User's own PAT used for all API calls
- [ ] Workflow triggers validated before execution
- [ ] Agent execution scoped to correct repository and branch

---

### Issue 23: Implement AI-assisted PR review and fix loop

**Purpose:** Classify PR review comments and orchestrate a new coding agent to apply fixes for valid comments, enabling an automated review-fix cycle.

**Problem to solve:** When a coding agent opens a PR, it gets reviewed by Copilot review. Valid review comments need to be addressed by a new coding agent instance. This creates a review → fix → re-review loop that should run automatically with a maximum cycle count.

**Expected outcome:**
- Review comment classification: valid (must fix), optional (nice to have), irrelevant (ignore)
- Mechanism to trigger a new coding agent to address valid review comments
- Review cycle management (max 2 cycles before escalation)
- Only implement comments that make sense — ignore irrelevant suggestions

**Scope boundaries:**
- In scope: Comment classification, fix agent trigger, cycle management
- Out of scope: Initial PR creation (handled by coding agent in Issue #22)

**Technical context:**
- Use GitHub PR review API to read comments
- Classification can use the Copilot SDK for analysis
- Fix agent uses same mechanism as Issue #22

**Dependencies:**
- Issue #22 (coding agent assignment)

**Acceptance criteria:**
- [ ] Comments correctly classified (valid/optional/irrelevant)
- [ ] Valid fixes applied by new coding agent
- [ ] Optional comments documented but not auto-fixed
- [ ] Irrelevant comments ignored
- [ ] Max 2 review-fix cycles before human escalation
- [ ] Uncertain items flagged for human review

**Testing expectations:**
- Unit tests for classification logic
- Integration tests for fix application
- Test cycle count enforcement

**Security checklist:**
- [ ] Conservative classification (err on human review side)
- [ ] Fix application limited to safe operations
- [ ] All review actions logged with classification reasoning

---

### Issue 24: Implement human stop gates and escalation

**Purpose:** Build the mechanism for the system to pause autonomous execution and request human input when it cannot proceed safely.

**Problem to solve:** The system must know when to stop running autonomously and ask a human for help. This includes build failures, review loops that exceed max retries, security-sensitive changes, scope ambiguity, and dependency conflicts.

**Expected outcome:**
- Stop gate detection for all failure conditions
- Clear escalation messages with context (what happened, what was tried, what input is needed)
- Pause/resume mechanism for the execution loop
- Notification to the user (via the chat UI and optionally external notifications)

**Scope boundaries:**
- In scope: Stop gate detection, escalation messages, pause/resume
- Out of scope: External notification integrations (future MCP tool)

**Technical context:**
- Integrate with the milestone execution loop (Issue #21)
- Stop conditions: CI failure, review loop exceeded, agent failure, conflicts, security flags

**Dependencies:**
- Issue #21 (milestone execution loop)

**Acceptance criteria:**
- [ ] System pauses on each defined stop condition
- [ ] Clear escalation message provided with full context
- [ ] User can resume execution after addressing the issue
- [ ] System suggests what input is needed
- [ ] All stop events logged in audit trail

**Testing expectations:**
- Integration tests for each stop condition
- Test pause/resume lifecycle
- Test escalation message quality

**Security checklist:**
- [ ] Stop gates cannot be bypassed
- [ ] Escalation messages don't leak sensitive data
- [ ] Resume requires re-authentication

---

### Issue 25: Implement milestone completion flow

**Purpose:** Handle the end-of-milestone process: validate the integrated state, run the full test suite, generate a summary, and open the final PR to main.

**Problem to solve:** After all issues in a milestone are merged into the milestone branch, the system needs to validate that everything works together, generate a completion summary, and create the final PR targeting main.

**Expected outcome:**
- Milestone validation (all issues merged, tests pass against milestone branch)
- Milestone summary generation (what was built, what changed, test results)
- Final PR from milestone branch → main
- Human review gate before merge to main

**Scope boundaries:**
- In scope: Validation, summary, final PR creation
- Out of scope: Automated merge to main (requires human approval)

**Technical context:**
- Use GitHub API to check issue/PR status
- Use GitHub Actions to run tests against milestone branch
- Summary can be generated using Copilot SDK

**Dependencies:**
- Issue #21 (milestone execution loop), Issue #23 (review loop — all issues must be reviewed)

**Acceptance criteria:**
- [ ] Validates all milestone issues are merged
- [ ] Runs test suite against milestone branch
- [ ] Generates comprehensive milestone summary
- [ ] Opens final PR with summary as description
- [ ] Milestone summary includes: issues completed, PRs merged, test results, changes summary

**Testing expectations:**
- Integration tests for completion flow
- Test validation logic (incomplete milestones should not proceed)

**Security checklist:**
- [ ] Final PR requires human review
- [ ] Summary does not include sensitive data
- [ ] Test results sanitized before including in PR description

---

### Issue 26: Frontend orchestration controls

**Purpose:** Provide controls for starting/stopping/pausing orchestration and link to GitHub Project for progress tracking. Progress visibility is handled by GitHub Projects — the app only provides orchestration controls and escalation handling.

**Expected outcome:**
- Start/stop/pause orchestration controls in chat
- Links to GitHub Project board for progress tracking
- Status summary showing which issues are in progress and milestone progress
- Deep links to GitHub Issues and PRs being worked on
- Escalation display — when the system stops, show the reason and what input is needed
- Suggested MCP tools that could extend automation

**Scope boundaries:**
- In scope: Orchestration controls, status display, escalation handling, GitHub links
- Out of scope: Custom dashboards (use GitHub Projects), custom issue management (use GitHub Issues)

**Dependencies:**
- Issue #21 (orchestration workflow)

**Acceptance criteria:**
- [ ] Can start, stop, and pause orchestration from the UI
- [ ] Links to GitHub Project for full progress view
- [ ] Shows current orchestration status (running/paused/stopped/idle)
- [ ] Displays escalation reason when stopped
- [ ] Deep links to active GitHub Issues and PRs
- [ ] Shows milestone progress (N of M issues complete)

**Testing expectations:**
- E2E test for orchestration controls
- Test GitHub link generation
- Test escalation display

**Security checklist:**
- [ ] No token data displayed
- [ ] Content escaped
- [ ] Escalation messages sanitized
