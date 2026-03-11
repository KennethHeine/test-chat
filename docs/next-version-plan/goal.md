# Product Goal: AI-Assisted Project Management on GitHub

> Single source of truth for what this system is, who it's for, and what success looks like.

---

## One-Line Vision

**An AI-assisted web app for project management that uses GitHub as the operational backend — from strategy to autonomous delivery.**

---

## What This System Is

A web application where users define high-level product goals and the system:

1. **Helps define the goal** — through structured AI-guided conversation
2. **Suggests research** — identifies unknowns, integration points, framework decisions, and architectural questions that should be resolved before coding
3. **Creates a detailed plan** — milestones, ordered issues, dependencies, acceptance criteria
4. **Pushes to GitHub** — creates real Issues, Milestones, Projects, branches, and labels
5. **Orchestrates execution** — assigns the GitHub Copilot coding agent to issues one-by-one, manages the PR lifecycle (review → fix → CI → merge), and auto-advances through the milestone
6. **Escalates intelligently** — pauses and asks for human input when it can't proceed safely

### The Core Workflow

```
Define Goal → Research → Plan → Create GitHub Artifacts → Execute → Deliver
     ↓            ↓         ↓              ↓                  ↓          ↓
  AI guides    AI suggests  AI breaks    Push to GitHub    Copilot    Milestone
  user through  research    into         as real Issues,   coding     PR to main
  structured   areas based  milestones   Milestones,       agent      (human
  goal form    on what the  & issues     Projects,         executes   merges)
               plan demands              branches          sequentially
```

### What It Is NOT

- **Not a replacement for GitHub Projects** — it creates and uses GitHub Projects, Issues, Milestones natively
- **Not a code editor** — the Copilot coding agent writes code; this system orchestrates
- **Not a CI/CD system** — it triggers and monitors GitHub Actions; it doesn't replace them
- **Not a dashboard** — progress is tracked in GitHub Projects; the app provides planning and orchestration

---

## Who It's For

**Software engineers and technical leads** who want to:
- Turn a product idea into a structured, research-backed implementation plan
- Have the AI suggest what needs more research before coding begins (e.g., "You mention Stripe integration — should we research their webhooks API first?")
- Generate high-quality GitHub Issues that a coding agent can execute without asking clarifying questions
- Run long autonomous execution chains (20+ issues per milestone) with minimal human involvement
- Maintain full traceability from goal → research → milestone → issue → PR → merge

---

## The Planning Phase (Why It Matters)

The key insight: **the quality of autonomous execution depends entirely on the quality of the planning phase.**

A coding agent succeeds when it has:
- Clear problem statement (what to build and why)
- Exact scope boundaries (what's in and explicitly out)
- Technical context (which files, patterns, APIs)
- Dependencies (what must exist first)
- Acceptance criteria (testable "done" conditions)
- Testing expectations (which tests to write)

The AI's role during planning is to:
1. Ask probing questions to fill gaps in the user's description
2. **Suggest research areas** — "Your plan requires OAuth integration. Should we research the GitHub OAuth flow before planning implementation issues?"
3. Identify where more detail is needed before the coding agent can succeed
4. Break large goals into milestones of manageable scope (5-25 issues each)
5. Order issues to resolve dependencies correctly

### Research Suggestions (AI-Driven)

The system should actively suggest research topics based on what the plan demands:

| Plan Mentions... | System Suggests Research On... |
|---|---|
| External API integration | API rate limits, authentication, webhook support, SDK availability |
| Database changes | Schema migration strategy, data model validation, backup approach |
| New framework/library | Version compatibility, bundle size, maintenance status, alternatives |
| Authentication changes | OAuth flow, token refresh, session management, security implications |
| Infrastructure changes | Scaling requirements, cost estimates, deployment strategy |
| Breaking changes | Migration path, backward compatibility, rollback plan |

---

## Success Criteria

### MVP (Stages 0–4)

| # | Criterion | Measurable? |
|---|-----------|-------------|
| 1 | User can define a structured goal through chat conversation | ✅ — goal record created with all fields |
| 2 | System generates categorized research items and suggests additional research based on plan demands | ✅ — research items cover all 8 categories + AI-suggested extras |
| 3 | System creates milestone plan with dependencies and acceptance criteria | ✅ — milestones have all required fields |
| 4 | System generates implementation-ready issue drafts | ✅ — issues pass quality gate (all fields populated, clear scope) |
| 5 | User can preview and approve before any GitHub mutations | ✅ — approval required for every write operation |
| 6 | Approved drafts become real GitHub Issues, Milestones, and Projects | ✅ — GitHub resources created with correct associations |
| 7 | Planning data persists across sessions (not just in-memory) | ✅ — Azure Storage backend |
| 8 | Planning is viewable in a dashboard, not just inside chat messages | ✅ — dedicated planning views |

### Post-MVP (Stages 5+)

| # | Criterion | Measurable? |
|---|-----------|-------------|
| 9 | System can orchestrate Copilot coding agent through a full milestone (20+ issues) | ✅ — milestone branch with all issues merged |
| 10 | PR review loop runs automatically (request review → classify → fix → merge) | ✅ — review-fix cycles tracked and counted |
| 11 | System pauses on failures and provides clear escalation context | ✅ — stop gates trigger correctly |
| 12 | Execution progress visible in real-time via the web app | ✅ — status updates stream to frontend |
| 13 | One milestone = one PR to main (clean, squashed) | ✅ — final milestone PR created |

---

## Architectural Principles

| Principle | Rationale |
|-----------|-----------|
| **GitHub-first** | Use GitHub's native features (Projects, Issues, Milestones, Actions) — don't rebuild what exists |
| **Planning in the app, execution in GitHub** | The app handles goal→plan→research→issues. Once pushed to GitHub, GitHub is the source of truth |
| **Per-user identity** | Users authenticate with their own GitHub PAT. No shared tokens, no elevated permissions |
| **Research before coding** | Incomplete research leads to bad implementation. The system enforces research completion before execution |
| **Human approval at write boundaries** | Every GitHub mutation (create issue, merge PR, create branch) requires explicit user approval |
| **Escalate, don't retry silently** | When autonomous execution fails, stop and explain — never hide failures |
| **AI suggests, human decides** | The AI suggests research areas, issue breakdowns, and milestone structure. The human approves or adjusts |

---

## What Already Exists (Stages 0–3 Complete)

| Capability | Status |
|---|---|
| Data model (Goal, ResearchItem, Milestone, IssueDraft) | ✅ Implemented |
| InMemoryPlanningStore with full CRUD + validation | ✅ Implemented |
| 9 planning tools (define_goal, save_goal, research, milestones) | ✅ Implemented |
| 5 GitHub read tools (repos, files, issues, search) | ✅ Implemented |
| Chat UI with SSE streaming | ✅ Implemented |
| Agent orchestration process (6 agents + PowerShell scripts) | ✅ Implemented |
| Session management with SDK resumption | ✅ Implemented |

---

## What Needs to Be Built

| Gap | Needed For |
|---|---|
| **GitHub write tools** (create issues, milestones, branches, labels, projects) | Pushing plans to GitHub |
| **IssueDraft generation tool** | Creating implementation-ready issues from milestones |
| **Planning dashboard UI** | Viewing goals/research/milestones outside of chat |
| **Persistent planning storage** (Azure Table/Blob) | Surviving server restarts |
| **GitHub Projects v2 integration** (GraphQL API) | Native project tracking in GitHub |
| **Execution bridge** — connecting web app to agent orchestration | Starting autonomous execution |
| **Real-time execution monitoring** | Watching the coding agent work |
| **Execution controls** (start, pause, resume, stop) | Human oversight during autonomous execution |
