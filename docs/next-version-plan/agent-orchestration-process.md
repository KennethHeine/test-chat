# Agent Orchestration Process

> Reusable process for orchestrating GitHub Copilot coding agents through staged implementation work. Each stage follows the same branch → issue → PR → review → fix → merge cycle.

> **Custom agents available:** This process is encoded as a set of custom Copilot agents in [`.github/agents/`](../../.github/agents/). The **orchestrator** is a thin coordination agent that dispatches **5 sub-agents** — it never writes code or interacts with GitHub directly (except to read state). Helper scripts for automated polling and CI are in [`scripts/orchestrator/`](../../scripts/orchestrator/).

---

## Overview

This document defines the end-to-end process for using a **sub-agent architecture** to drive GitHub Copilot coding agents through multi-issue implementation stages. The **orchestrator** is a thin coordinator that reads state, dispatches the right sub-agent, updates state, and repeats. It never writes code directly.

**Core principle:** All code is written by the Copilot coding agent. The orchestrator ensures quality through sub-agent delegation, state tracking, reviews, CI validation, and structured branching.

### Sub-Agent Architecture

Each sub-agent is a dedicated `.agent.md` file in `.github/agents/` with its own tools, instructions, and context window. The orchestrator invokes them via `runSubagent` with JSON payloads.

| Sub-Agent | File | Purpose | When |
|-----------|------|---------|------|
| **gather-context** | `gather-context.agent.md` | Reads plan docs, returns structured JSON summary | Before stage-setup |
| **stage-setup** | `stage-setup.agent.md` | Creates stage branch + all issues | Once per stage |
| **issue-lifecycle** | `issue-lifecycle.agent.md` | Advances one issue through the PR lifecycle | Per-issue, per-status-transition |
| **stage-finalize** | `stage-finalize.agent.md` | Creates full-stage PR → review → CI → notify user | After all issues merged |
| **retrospective** | `retrospective.agent.md` | Analyzes observations, identifies patterns, proposes improvements | At checkpoints + stage end |

**Context is precious.** The orchestrator may run for hours. It never reads plan documents or repo files directly — it delegates to sub-agents and consumes only their returned JSON summaries.

---

## Prerequisites

Before using this process, ensure the repository is configured correctly:

### CI Labels Must Exist

The orchestrator triggers CI workflows by adding labels to PRs. Ensure these labels exist in the repository:

| Label | Workflow | Purpose |
|-------|----------|---------|
| `run-e2e` | `e2e-local.yml` | Triggers local E2E tests against the PR's head commit |
| `deploy-ephemeral` | `deploy-ephemeral.yml` | Triggers ephemeral env deploy + E2E tests |

Both labels are automatically removed after the workflow completes, allowing them to be re-added to re-trigger.

### Automatic CI Triggers

- `e2e-local.yml` runs automatically on PRs targeting `main` (no label needed)
- `deploy-ephemeral.yml` teardown runs automatically when a PR is closed or merged

---

## Process Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Stage Lifecycle                              │
│                                                                     │
│  1. Orchestrator reads/creates state file                           │
│  2. Dispatch gather-context → returns stage JSON                    │
│  3. Dispatch stage-setup → creates branch + issues                  │
│  4. For each issue (in dependency order):                           │
│     ┌─────────────────────────────────────────────────────────┐     │
│     │  Dispatch issue-lifecycle with issue status:             │     │
│     │                                                         │     │
│     │  pending → assign agent, wait-for-agent.ps1             │     │
│     │  agent-timeout → extended wait (60 min)                 │     │
│     │  pr-ready → undraft PR, verify base branch              │     │
│     │  review-requested → request review, wait-for-review.ps1 │     │
│     │  review-fixes-needed → @copilot fix, wait-for-agent.ps1 │     │
│     │  ci-ready → trigger-ci-label.ps1                        │     │
│     │  ci-failed → @copilot fix, wait, re-trigger CI          │     │
│     │  ci-passed → pre-merge review check, squash merge       │     │
│     │                                                         │     │
│     │  Terminal states: merged, escalated                     │     │
│     └─────────────────────────────────────────────────────────┘     │
│  5. Dispatch stage-finalize → creates PR to main, review, CI       │
│  6. Dispatch retrospective → analyzes observations                  │
│  7. Notify user: stage PR ready for manual merge                    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## State File: `.github/orchestrator-state.json`

The state file is the **single source of truth** for crash recovery and inter-agent communication. The orchestrator reads it at every invocation and updates it after every sub-agent completes.

### Schema (v2)

```json
{
  "version": 2,
  "owner": "KennethHeine",
  "repo": "test-chat",
  "stage": {
    "number": 1,
    "name": "Goal Definition",
    "branch": "stage-1/goal-definition",
    "status": "in-progress"
  },
  "issues": [
    {
      "sequence": 1,
      "title": "Define planning data model",
      "issueNumber": 42,
      "status": "merged",
      "prNumber": 45,
      "ciRuns": [],
      "reviewFixAttempts": 0,
      "ciFixAttempts": 0
    }
  ],
  "stagePR": {
    "prNumber": null,
    "status": "not-started",
    "reviewFixAttempts": 0,
    "ciFixAttempts": 0
  },
  "retryLimits": {
    "maxReviewFixAttempts": 3,
    "maxCiFixAttempts": 3,
    "maxAgentTimeouts": 2
  },
  "heartbeat": {
    "timestamp": "2026-03-10T12:00:00Z",
    "currentAction": "Dispatching issue-lifecycle for issue #43",
    "iterationCount": 5
  },
  "checkpoint": {
    "lastCheckpointAt": 0,
    "checkpointInterval": 8
  },
  "observations": [],
  "retrospectives": [],
  "lastUpdated": "2026-03-10T12:00:00Z",
  "lastAction": "issue-lifecycle completed for issue #42 → merged as PR #45"
}
```

### Issue Status Values

| Status | Meaning | Next Action |
|--------|---------|-------------|
| `pending` | Issue created, not yet assigned | Dispatch `issue-lifecycle` |
| `agent-working` | Coding agent assigned, waiting | Dispatch `issue-lifecycle` (will wait) |
| `agent-timeout` | Wait script timed out | Dispatch `issue-lifecycle` (extended timeout) |
| `pr-ready` | PR exists, needs review setup | Dispatch `issue-lifecycle` (undraft + set base) |
| `review-requested` | Review requested, waiting | Dispatch `issue-lifecycle` (wait for review) |
| `review-fixes-needed` | Review has actionable comments | Dispatch `issue-lifecycle` (post fixes) |
| `ci-ready` | Review passed, CI not yet triggered | Dispatch `issue-lifecycle` (trigger CI) |
| `ci-failed` | CI failed | Dispatch `issue-lifecycle` (post fix + wait) |
| `ci-passed` | All CI green | Dispatch `issue-lifecycle` (merge) |
| `merged` | PR merged to stage branch | Done — move to next issue |
| `escalated` | Hit retry limit, needs human | Skip — notify user |

### Stage PR Status Values

| Status | Meaning |
|--------|---------|
| `not-started` | Not all issues merged yet |
| `pr-created` | Full-stage PR exists |
| `review-fixes-needed` | Review has comments |
| `ci-ready` | Review passed, CI not triggered |
| `ci-failed` | CI failed on stage PR |
| `ready-for-user` | All checks passed, waiting for manual merge |
| `escalated` | Hit retry limit, needs human |

---

## Detailed Steps

### Step 1: Startup and State Recovery

Every time the orchestrator is invoked:

1. **Read the state file** (`.github/orchestrator-state.json`)
2. **If no state file exists:** Ask the user which stage to start, then dispatch `gather-context` → `stage-setup`
3. **If state file exists:** Resume from current state using the resume logic:
   - Find the first issue (by sequence) with status NOT in `["merged", "escalated"]`
   - Check retry limits before dispatching
   - Dispatch `issue-lifecycle` with that issue's current status
   - If all issues are done, dispatch `stage-finalize`
   - If stage PR is `ready-for-user`, notify user and stop

### Step 2: Gather Context (Sub-Agent)

The orchestrator dispatches `gather-context` with a stage number. This sub-agent:

1. Reads `AGENTS.md`, `.github/copilot-instructions.md`, plan docs
2. Returns a structured JSON summary with stage name, branch name, issues, conventions, and test commands
3. The orchestrator passes this JSON (unmodified) to `stage-setup`

### Step 3: Stage Setup (Sub-Agent)

The orchestrator dispatches `stage-setup` with the context JSON. This sub-agent:

1. **Creates the stage branch** from `main` using `create_branch`
2. **Creates all issues** using the issue template (see Issue Template section below)
3. Returns issue numbers in a JSON response

**Naming convention:** `stage-{N}/{short-description}`

All issue PRs target this branch, not `main`.

### Step 4: Issue Lifecycle (Sub-Agent)

For each issue, the orchestrator dispatches `issue-lifecycle` with the issue's current status. The sub-agent advances through the lifecycle using **helper scripts for all waiting** (never MCP tool polling loops).

#### `pending` → Assign and wait for agent

1. `assign_copilot_to_issue` — **note: this only assigns, the agent is NOT done yet**
2. Run `./scripts/orchestrator/wait-for-agent.ps1 {owner} {repo} {issueNumber}`
   - The script waits for `copilot_work_finished` / `copilot_work_finished_failure` timeline events
   - Exit 0 → return `pr-ready`
   - Exit 1 → return `agent-timeout`

#### `agent-timeout` → Extended wait

1. Run with extended timeout: `$env:POLL_TIMEOUT=3600; ./scripts/orchestrator/wait-for-agent.ps1 ...`
2. Exit 0 → return `pr-ready`
3. Exit 1 → return `agent-timeout` (orchestrator will check timeout count and may escalate)

#### `pr-ready` → Prepare for review

1. Verify PR is non-draft, update if needed
2. Verify PR targets the stage branch — update base branch if needed
3. Return `review-requested`

#### `review-requested` → Request and wait for review

1. `request_copilot_review` on the PR
2. Run `./scripts/orchestrator/wait-for-review.ps1 {owner} {repo} {prNumber}`
3. **Validate the review is substantive:**
   - If review says "couldn't review any files" or similar → **INVALID**, return `review-requested` to re-try
   - If no actionable comments → return `ci-ready`
   - If actionable comments → return `review-fixes-needed`

**Important:** Only ONE review per PR. After review fixes, go directly to CI — do NOT re-request a review.

#### `review-fixes-needed` → Post fix instructions

1. Check retry limit: if `reviewFixAttempts >= 3` → return `escalated`
2. Post `@copilot` comment on PR with **explicit** fix instructions (line numbers, quotes, expected behavior)
3. Run `wait-for-agent.ps1` to wait for fixes
4. Return `ci-ready`, increment `reviewFixAttempts`

**Important:** Never post `@copilot` as a comment on an **issue** — always use `assign_copilot_to_issue` for issues. `@copilot` comments only work on **PRs**.

#### `ci-ready` → Trigger CI

1. Run `./scripts/orchestrator/trigger-ci-label.ps1 {owner} {repo} {prNumber} -E2e`
   - **Use `-E2e` for issue PRs** (targeting stage branch)
   - **Use `-All` only for the final stage PR** (targeting main)
2. Exit 0 → return `ci-passed`
3. Exit 1 → extract failing run IDs, get failure logs via `get-ci-failure-summary.ps1`, return `ci-failed`
4. Exit 2 (timeout) → return `ci-failed` with timeout summary

#### `ci-failed` → Fix CI failures

1. Check retry limit: if `ciFixAttempts >= 3` → return `escalated`
2. Post `@copilot` comment on PR with failure summary and fix instructions
3. Run `wait-for-agent.ps1` to wait for fixes
4. Return `ci-ready` (will re-run CI), increment `ciFixAttempts`

#### `ci-passed` → Merge

1. **Pre-merge validation:** Verify the PR has at least one substantive Copilot review. If not, return `review-requested` instead of merging.
2. `merge_pull_request` with squash merge into the stage branch
3. Return `merged`

### Step 5: Stage Finalize (Sub-Agent)

After all issues are merged, the orchestrator dispatches `stage-finalize`. This sub-agent:

1. **Creates a PR** from the stage branch to `main`
   - Title: `Stage {N}: {Stage Name}`
   - Body: summary of all merged issues/PRs
2. **Requests Copilot review** and waits via `wait-for-review.ps1`
3. **Applies review fixes directly** — unlike issue lifecycle which posts `@copilot` comments, stage-finalize checks out the branch and edits files itself (since there's no coding agent assigned)
4. **Triggers CI** with `trigger-ci-label.ps1 ... -All` (both E2E and ephemeral)
5. **Applies CI fixes directly** if needed
6. Returns status `ready-for-user` when all checks pass

**The orchestrator never merges to main.** The final merge is for the user to do manually.

### Step 6: Retrospective (Sub-Agent)

At checkpoints (every 8 iterations by default) and at stage end, the orchestrator dispatches `retrospective` with:
- All observations collected since last retrospective
- Computed metrics (iterations, fix attempts, timeouts, etc.)
- Issue outcomes (final status, attempts used)

The retrospective agent analyzes along 5 dimensions:
1. **Recurring failures** — same types of review/CI issues across issues
2. **Bottlenecks** — which lifecycle phases take the most iterations
3. **Process gaps** — missing info in issue templates
4. **Agent quality** — do fixes actually resolve issues or introduce new ones
5. **Self-improvement** — proposed changes to agents, scripts, templates, or limits

Returns a JSON with patterns, proposals, lessons learned, and a health score.

> **Why manual merge to main?** The final merge to `main` is a high-impact, hard-to-reverse operation that affects the production branch. The user should make this decision after reviewing the full-stage PR summary, Copilot review results, and CI status.

---

## Helper Scripts

All waiting and CI validation is handled by PowerShell scripts in `scripts/orchestrator/`. **Agents must never poll with MCP tools in a loop** — always use these scripts.

| Script | Purpose | Default Timeout | Exit Codes |
|--------|---------|-----------------|------------|
| `wait-for-agent.ps1` | Wait for coding agent via timeline events (`copilot_work_finished`) | 1800s (30 min) | 0=done, 1=timeout/failure |
| `wait-for-review.ps1` | Wait for Copilot review completion | 600s (10 min) | 0=done, 1=timeout |
| `trigger-ci-label.ps1` | Add CI labels (`run-e2e`, `deploy-ephemeral`) and wait for workflow completion | 1200s (20 min) | 0=pass, 1=fail, 2=timeout |
| `trigger-and-wait-ci.ps1` | Trigger workflows via `workflow_dispatch` and wait | 1200s (20 min) | 0=pass, 1=fail, 2=timeout |
| `get-ci-failure-summary.ps1` | Extract failure logs from a workflow run | N/A | 0=summary generated, 1=error |

All scripts support `POLL_INTERVAL` (default 20s) and `POLL_TIMEOUT` environment variable overrides.

### Agent Completion Detection

`wait-for-agent.ps1` detects completion via GitHub timeline events on the PR linked to the issue:
- `copilot_work_started` — agent is working
- `copilot_work_finished` — agent completed successfully
- `copilot_work_finished_failure` — agent failed

### CI Label Triggers

Label-based triggers use `pull_request_target` events, giving the workflow direct PR context:
- `run-e2e` label → triggers `e2e-local.yml` (local E2E tests)
- `deploy-ephemeral` label → triggers `deploy-ephemeral.yml` (ephemeral env deploy + E2E tests)
- Labels are automatically removed after the workflow runs, so they can be re-added to re-trigger
- **Use `-E2e` for issue PRs** targeting the stage branch
- **Use `-All` for the final stage PR** targeting main

---

## Retry Limits and Escalation

Enforced by both the orchestrator and sub-agents. If a sub-agent returns `escalated`, the orchestrator accepts it. If a sub-agent doesn't enforce limits, the orchestrator enforces them before dispatching.

| Counter | Limit | Escalation |
|---------|-------|------------|
| `reviewFixAttempts` | 3 | Issue → `escalated`, notify user, skip to next issue |
| `ciFixAttempts` | 3 | Issue → `escalated`, notify user, skip to next issue |
| Agent timeout count | 2 | After initial + 1 extended retry → `escalated` |

---

## Heartbeat and Checkpoints

### Heartbeat

The orchestrator updates the `heartbeat` section of the state file **before every sub-agent dispatch**, enabling external monitoring:

```json
{
  "heartbeat": {
    "timestamp": "2026-03-10T12:34:56Z",
    "currentAction": "Dispatching issue-lifecycle for issue #43 (status: ci-failed, attempt 2/3)",
    "iterationCount": 7
  }
}
```

### Checkpoints

Every `checkpoint.checkpointInterval` iterations (default: 8), the orchestrator:
1. Writes a checkpoint summary to the user with stage progress
2. Dispatches the `retrospective` sub-agent with observations since the last checkpoint
3. Appends the retrospective result to `state.retrospectives[]`
4. Presents high-priority improvement proposals to the user
5. Continues processing (does not stop unless user asks)

This provides visibility, an escape hatch if context degrades, and continuous process improvement.

### Observations

After every sub-agent returns, the orchestrator appends a brief observation to `state.observations[]`:
- Status transitions indicating problems: `review-fixes-needed`, `ci-failed`, `agent-timeout`, `escalated`
- Successful terminal transitions: `merged`, `ci-passed`
- Routine transitions (`pending` → `agent-working`) are NOT recorded

---

## Issue Template

```markdown
## Parent Context

This is **Issue {X} of {Y}** in **Stage {N}: {Stage Name}** of the [Next Version Plan](docs/next-version-plan/project-plan.md).

**Stage branch:** `stage-{N}/{short-description}` — PRs target this branch, not `main`.
**Stage goal:** {one-line description}
**Depends on:** {list dependencies or "None"}

---

## Purpose

{What this issue achieves in 1-2 sentences}

## Problem to Solve

{What gap or need this addresses}

## Expected Outcome

- {Concrete deliverable 1}
- {Concrete deliverable 2}

## Scope Boundaries

- **In scope:** {what's included}
- **Out of scope:** {what's excluded}

## Technical Context

### Files to create/modify

| File | Purpose |
|------|---------|
| `path/to/file.ts` | {description} |

### Files to read (for context)

| File | Why |
|------|-----|
| `path/to/file.ts` | {what context it provides} |

### Patterns to follow

- {Existing pattern name} in `{file}` — {what to replicate}

## Acceptance Criteria

- [ ] {Criterion 1}
- [ ] {Criterion 2}

## Testing Expectations

- {What tests to add/update}
- {Which test commands to run: `npx tsc --noEmit`, `npm test`, etc.}

## Security Checklist

- [ ] No secrets, tokens, or real user data in code or examples
- [ ] Input validation at system boundaries — list each input and its validation rules
- [ ] All user-provided string fields sanitized before storage
- [ ] Resource ownership verified — user can only access their own data (e.g., goals scoped to user token)
- [ ] API error responses use correct HTTP status codes (400 for invalid input, 401 for missing auth, 403 for forbidden, 404 for not found)
- [ ] URL fields validated if accepted

## Documentation Standards

- [ ] Update relevant docs in `docs/` when behavior, configuration, or API changes
- [ ] Update `README.md` if user-facing behavior changed
- [ ] Update `AGENTS.md` Project Map if new files are added

## Process Tracking

- **Stage:** {N} — {Stage Name}
- **Issue:** {X} of {Y}
- **Depends on:** {issue refs}
- **Blocks:** {what this unblocks}
- **PR target branch:** `stage-{N}/{short-description}`
```

---

## Lessons Learned

These observations come from orchestrating Stages 0–3:

1. **Copilot reviews catch real issues.** PR #34 review found shallow copy bugs (`structuredClone` needed), validation mismatches (0-based vs 1-based order), and missing doc updates. PR #35 review found 3 documentation accuracy issues. Always run reviews.

2. **Be explicit in `@copilot` fix comments.** Reference specific line numbers, quote the review suggestion, and explain what the correct behavior should be. Vague instructions lead to incomplete fixes.

3. **Mark PRs ready before requesting review.** Copilot review doesn't work on draft PRs. Always set `draft: false` first.

4. **Helper scripts are mandatory.** Never poll with MCP tools in a loop — always use the PowerShell scripts in `scripts/orchestrator/`. They handle edge cases (timeline event parsing, workflow filtering by start time, etc.).

5. **Documentation-only PRs still benefit from review.** PR #35 (docs) had 3 accuracy errors caught by Copilot review — wrong immutability claims, incorrect field descriptions.

6. **CI failures should be caught per-PR, not at the end.** Fixing CI issues in the PR where they're introduced is much easier than debugging failures in a full-stage PR.

7. **Only ONE review per PR.** After review fixes, go directly to CI. Do NOT re-request another review — this wastes time and can produce contradictory feedback.

8. **Validate reviews are substantive.** Reviews that say "couldn't review any files" or "unable to review" are invalid — the review happened before code was ready. Return to `review-requested` to re-try.

9. **Never merge without a substantive review.** Even if CI passes, the pre-merge check must verify a real Copilot review exists.

10. **`assign_copilot_to_issue` is not `@copilot` on an issue.** Commenting `@copilot` on an issue does NOT work. Use the MCP tool `assign_copilot_to_issue`. `@copilot` comments only work on PRs.

11. **`-E2e` for issue PRs, `-All` for stage PRs.** Issue PRs targeting the stage branch only need E2E tests. The full-stage PR targeting main needs both E2E and ephemeral deployment tests.

12. **Stage-finalize applies fixes directly.** Unlike issue PRs where `@copilot` comments trigger the coding agent, the stage-finalize sub-agent checks out the branch and edits files itself (no coding agent is assigned to the stage PR).

---

## Tools Used

The orchestrator system uses these tools, distributed across sub-agents:

### Orchestrator (coordination only)
| Tool | Purpose |
|------|---------|
| `runSubagent` | Dispatch sub-agents |
| `readFile` | Read state file |
| `createFile` / `editFiles` | Write state file |
| `list_issues` / `list_pull_requests` | Read GitHub state |

### issue-lifecycle
| Tool | Purpose |
|------|---------|
| `assign_copilot_to_issue` | Start the coding agent on an issue |
| `request_copilot_review` | Trigger Copilot code review |
| `pull_request_read` | Check review status and comments |
| `update_pull_request` | Mark PR ready (`draft: false`), update target branch |
| `add_issue_comment` | Post `@copilot` fix instructions on PRs |
| `merge_pull_request` | Merge issue PRs to stage branch (squash) |
| `runInTerminal` | Execute helper scripts |

### stage-setup
| Tool | Purpose |
|------|---------|
| `create_branch` | Create the stage branch |
| `issue_write` | Create issues with full context |

### stage-finalize
| Tool | Purpose |
|------|---------|
| `create_pull_request` | Create the full-stage PR to main |
| `request_copilot_review` | Review the stage PR |
| `editFiles` | Apply review/CI fixes directly |
| `runInTerminal` | Execute helper scripts |

### gather-context
| Tool | Purpose |
|------|---------|
| `readFile` / `textSearch` | Read plan docs and repo conventions |

### retrospective
| Tool | Purpose |
|------|---------|
| `readFile` / `textSearch` | Read agent files for analysis |
