# Orchestrating Agents

> How the orchestrator agent and its sub-agents collaborate to drive staged implementation work through the full PR lifecycle.

---

## Overview

This repository uses a set of custom GitHub Copilot coding agents to orchestrate multi-issue, multi-stage implementation work. The **orchestrator** agent sits at the top and delegates specific responsibilities to five specialized sub-agents. Together, they automate the entire workflow from planning through merge — without writing any code directly.

**Core principle:** All code is written by the Copilot coding agent (assigned to individual issues). The orchestrator and its sub-agents manage the lifecycle: creating branches, filing issues, assigning the coding agent, reviewing PRs, validating CI, and merging.

---

## Agent Hierarchy

```
                    ┌──────────────────┐
                    │   orchestrator   │
                    │  (top-level)     │
                    └────────┬─────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
   ┌────────▼───────┐ ┌─────▼──────┐ ┌───────▼────────┐
   │  stage-setup   │ │  issue-    │ │ stage-finalize  │
   │                │ │  lifecycle │ │                 │
   └────────────────┘ └─────┬──────┘ └────────────────┘
                            │
                    ┌───────▼────────┐
                    │ gather-context │
                    └────────────────┘

                    ┌────────────────┐
                    │ retrospective  │  ← invoked after stage completion
                    └────────────────┘
```

---

## Agent Descriptions

### orchestrator

**Role:** Top-level stage orchestration agent.

**What it does:**
- Drives the full PR lifecycle for a stage — creates issues, assigns the coding agent, manages reviews, validates CI, and merges PRs.
- Coordinates the sub-agents by invoking them at the right points in the stage lifecycle.
- Does **not** write code directly.

**When to invoke:** Assign to a GitHub issue that describes a stage of work (e.g., "Stage 2: Research Workflow"). The orchestrator reads the stage plan and executes it end-to-end.

**Delegates to:**
| Sub-agent | When |
|-----------|------|
| `stage-setup` | At the start — to create the stage branch and all issues |
| `issue-lifecycle` | For each issue — to drive it through assign → PR → review → CI → merge |
| `stage-finalize` | After all issues are merged — to create and manage the full-stage PR |
| `retrospective` | After stage completion — to analyze what went well and what to improve |
| `gather-context` | As needed — to read plan documents and extract stage-specific context |

---

### stage-setup

**Role:** Creates the stage branch and all issues for a stage.

**What it does:**
- Creates a dedicated stage branch from `main` (e.g., `stage-2/research-workflow`).
- Creates all GitHub issues for the stage, using the structured issue template (parent context, purpose, scope, acceptance criteria, testing expectations, security checklist, etc.).
- Returns the created issue numbers so the orchestrator can process them in order.

**Does not:** Assign agents to issues or manage PRs.

**Inputs:** Stage number, stage description, and the list of issues to create (from the project plan).

**Outputs:** Stage branch name and list of issue numbers.

---

### issue-lifecycle

**Role:** Handles one issue end-to-end through the full PR lifecycle.

**What it does:**
1. **Assigns** the Copilot coding agent to the issue.
2. **Waits** for the coding agent to complete (polls via GitHub timeline events).
3. **Marks the PR ready** for review (converts from draft).
4. **Requests** a Copilot code review.
5. **Reads** review comments and posts `@copilot` fix instructions if needed.
6. **Waits** for fixes to be applied.
7. **Validates CI** by adding trigger labels (`run-e2e`, `deploy-ephemeral`) and polling workflow runs.
8. **Handles CI failures** — fetches logs, posts fix instructions, re-triggers CI.
9. **Merges** the PR to the stage branch (squash merge).

**Returns:** Status after each advancement step, so the orchestrator can track progress.

**Delegates to:**
| Sub-agent | When |
|-----------|------|
| `gather-context` | Before assigning the coding agent — to provide implementation context |

---

### stage-finalize

**Role:** Creates the full-stage PR and manages its review and CI.

**What it does:**
- Creates a PR from the stage branch to `main` (e.g., "Stage 2: Research Workflow").
- Requests a Copilot code review on the combined changes.
- Addresses review comments via `@copilot` fix instructions.
- Triggers and validates CI workflows on the full-stage PR.
- Reports back when the PR is ready for the user to merge.

**Does not:** Merge to `main` — that requires manual user approval since it's a high-impact operation on the production branch.

---

### gather-context

**Role:** Reads plan documents and repo conventions, returns structured context.

**What it does:**
- Reads project plan documents (e.g., `docs/next-version-plan/project-plan.md`, `docs/next-version-plan/issue-breakdown.md`).
- Extracts stage-specific information: deliverables, dependencies, technical context, acceptance criteria.
- Returns a structured JSON summary that other agents can consume.

**Does not:** Modify any files.

**Used by:** `orchestrator`, `issue-lifecycle`, and `stage-setup` to get planning context before taking action.

---

### retrospective

**Role:** Post-stage analysis agent.

**What it does:**
- Analyzes orchestrator observations from a completed stage (timing, failures, review cycles, CI results).
- Identifies process problems and recurring patterns.
- Proposes concrete improvements for future stages.

**Does not:** Modify any files — read-only analysis only.

**When invoked:** After a stage is fully complete (all issues merged, stage PR created or merged).

---

## Stage Lifecycle

The orchestrator drives each stage through this lifecycle:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Stage Lifecycle                              │
│                                                                     │
│  1. gather-context → read stage plan                                │
│  2. stage-setup → create branch + issues                            │
│  3. For each issue (in dependency order):                           │
│     ┌─────────────────────────────────────────────────────────┐     │
│     │  issue-lifecycle:                                       │     │
│     │  a. Assign Copilot coding agent to issue                │     │
│     │  b. Wait for coding agent to complete                   │     │
│     │  c. Mark PR ready for review                            │     │
│     │  d. Request Copilot code review                         │     │
│     │  e. Wait for review comments                            │     │
│     │  f. Post @copilot fix instructions (if needed)          │     │
│     │  g. Wait for fixes to be applied                        │     │
│     │  h. Validate CI workflows pass                          │     │
│     │     - If CI fails → post fix instructions, re-trigger   │     │
│     │     - Repeat until CI passes                            │     │
│     │  i. Merge PR to stage branch (squash)                   │     │
│     └─────────────────────────────────────────────────────────┘     │
│  4. stage-finalize → create PR stage branch → main                  │
│     - Copilot review on full-stage changes                          │
│     - Address review comments                                       │
│     - Validate CI on combined changes                               │
│     - Hand off to user for manual merge                             │
│  5. retrospective → analyze stage, propose improvements             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Helper Scripts

The agents use shell scripts in `scripts/orchestrator/` to automate polling and CI interaction. Each script is available in both Bash (`.sh`) and PowerShell (`.ps1`) variants.

| Script | Purpose | Exit Codes |
|--------|---------|------------|
| `wait-for-agent.sh` | Poll GitHub timeline events until the Copilot coding agent finishes work on an issue. Detects `copilot_work_started`, `copilot_work_finished`, and `copilot_work_finished_failure` events. | `0` = success, `1` = timeout/failure |
| `wait-for-review.sh` | Poll PR reviews until a Copilot review bot completes its review. Reports reviewer identity, review state, and comment count. | `0` = review complete, `1` = timeout |
| `trigger-ci-label.sh` | Add CI trigger labels (`run-e2e`, `deploy-ephemeral`) to a PR and wait for the resulting workflow runs to complete. Labels are auto-removed after the workflow runs. | `0` = all passed, `1` = failure, `2` = timeout |
| `trigger-and-wait-ci.sh` | Trigger CI workflows via `workflow_dispatch` on a specific branch and wait for completion. Alternative to label-based triggering. | `0` = all passed, `1` = failure, `2` = timeout |
| `get-ci-failure-summary.sh` | Fetch failing job details and log excerpts from a workflow run. Output is formatted as a `@copilot` comment ready to post on a PR. | `0` = summary generated, `1` = error |

**Common environment variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `POLL_INTERVAL` | `20` | Seconds between status checks |
| `POLL_TIMEOUT` | Varies (600–1800) | Maximum seconds to wait before timing out |

---

## GitHub MCP Tools Used

The agents interact with GitHub through these MCP tools:

| Tool | Purpose |
|------|---------|
| `issue_write` (create) | Create issues with full context |
| `assign_copilot_to_issue` | Start the coding agent on an issue |
| `get_copilot_job_status` | Poll coding agent progress |
| `update_pull_request` | Mark PR ready (`draft: false`), update target branch |
| `request_copilot_review` | Trigger Copilot code review on a PR |
| `pull_request_read` (get_reviews) | Check if a review is complete |
| `pull_request_read` (get_review_comments) | Read inline review feedback |
| `add_issue_comment` | Post `@copilot` fix instructions on PRs |
| `issue_write` (update) | Add labels to PRs to trigger CI |
| `actions_list` (list_workflow_runs) | Check CI workflow status |
| `actions_get` (get_workflow_run) | Get details of a specific run |
| `get_job_logs` | Get logs from failing CI jobs for error context |
| `merge_pull_request` | Merge issue PRs to stage branch (squash) |
| `create_branch` | Create the stage branch |
| `create_pull_request` | Create the full-stage PR to main |

---

## Related Documentation

- [Agent Orchestration Process](./next-version-plan/agent-orchestration-process.md) — detailed step-by-step process, issue template, and lessons learned
- [Project Plan](./next-version-plan/project-plan.md) — staged delivery plan with all stages and deliverables
- [Feedback Cycles](./next-version-plan/feedback-cycles.md) — how feedback is collected and integrated at each stage
- [Issue Breakdown](./next-version-plan/issue-breakdown.md) — implementation-ready issues organized by stage
