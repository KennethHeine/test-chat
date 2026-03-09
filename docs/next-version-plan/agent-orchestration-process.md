# Agent Orchestration Process

> Reusable process for orchestrating GitHub Copilot coding agents through staged implementation work. Each stage follows the same branch → issue → PR → review → fix → merge cycle.

---

## Overview

This document defines the end-to-end process for using a **Copilot Chat agent as an orchestrator** to drive GitHub Copilot coding agents through multi-issue implementation stages. The orchestrator never writes code directly — it creates issues, assigns agents, manages reviews, validates CI, and merges PRs.

**Core principle:** All code is written by the Copilot coding agent. The orchestrator's job is to ensure quality through reviews, CI validation, and structured branching.

---

## Prerequisites

Before using this process, ensure the repository is configured correctly:

### CI Workflows Must Support `workflow_dispatch`

The Copilot coding agent runs as a GitHub App bot. Workflow runs triggered by bot PRs often have `action_required` status, requiring manual approval in the GitHub UI. The MCP GitHub Actions tools **do not support approving pending workflow runs** — there is no `approve_workflow_run` method.

**Solution:** Add `workflow_dispatch` as a trigger to all CI workflows that need to run on PRs. This allows the orchestrator to trigger workflows directly on the PR's head branch using `run_workflow`, bypassing the approval requirement entirely.

```yaml
# Example: add workflow_dispatch to your CI workflow
on:
  pull_request:
    branches: [main, 'stage-*/**']
  workflow_dispatch:  # ← Required for orchestrator to trigger directly
```

Workflows that the orchestrator needs to trigger directly:
- **E2E tests** (`e2e-local.yml`) — validates functionality
- **Any test/lint workflows** — validates code quality

Workflows that don't need `workflow_dispatch` (deployment-only):
- **Deploy workflows** — only run on main branch merges
- **Ephemeral environment deploys** (`deploy-ephemeral.yml`) — triggers on PRs to `main` and `stage-*/**` branches. Includes an automatic E2E test job (`e2e-ephemeral`) that runs Playwright tests against the deployed ephemeral container after deploy completes. The orchestrator should trigger this via `workflow_dispatch` and monitor the E2E results alongside local E2E tests.

---

## Process Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Stage Lifecycle                              │
│                                                                     │
│  1. Create stage branch from main                                   │
│  2. Create all issues for the stage                                 │
│  3. For each issue (in dependency order):                           │
│     ┌─────────────────────────────────────────────────────────┐     │
│     │  a. Assign Copilot coding agent to issue                │     │
│     │  b. Wait for coding agent to complete                   │     │
│     │  c. Mark PR ready for review                            │     │
│     │  d. Request Copilot code review                         │     │
│     │  e. Wait for review comments                            │     │
│     │  f. Post @copilot comment with fix instructions         │     │
│     │  g. Wait for fixes to be applied                        │     │
│     │  h. Validate CI workflows pass                          │     │
│     │     - If CI fails → @copilot fix with workflow run link │     │
│     │     - Repeat until CI passes                            │     │
│     │  i. Merge PR to stage branch (squash)                   │     │
│     └─────────────────────────────────────────────────────────┘     │
│  4. Create PR from stage branch → main                              │
│  5. Request Copilot review on full-stage PR                         │
│  6. Address any review comments                                     │
│  7. Validate CI on full-stage PR                                    │
│  8. Manual merge of stage PR to main                                │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Steps

### Step 1: Create Stage Branch

Before creating any issues, create a dedicated branch for the stage:

```
main → stage-0/data-model-foundation
```

**Naming convention:** `stage-{N}/{short-description}`

All PRs for the stage target this branch, not `main`. This isolates stage work and enables a full-stage review at the end.

### Step 2: Create Issues

Create all issues for the stage upfront. Each issue should include:

- **Parent context** — which stage, issue number (e.g., "Issue 2 of 3 in Stage 0"), dependencies
- **Purpose** — what the issue achieves
- **Problem to solve** — what gap it fills
- **Expected outcome** — concrete deliverables
- **Scope boundaries** — what's in/out of scope
- **Technical context** — code patterns to follow, files to read, existing conventions
- **Acceptance criteria** — checkboxes for done definition
- **Testing expectations** — what tests to add/update, which commands to run
- **Security checklist** — no secrets in code, input validation, etc.
- **Documentation standards** — what docs to update
- **Process tracking** — stage number, issue sequence, dependencies, what it blocks

**Important:** Explicitly state that PRs should target the stage branch, not `main`.

### Step 3: Assign Copilot Coding Agent

For each issue (respecting dependency order):

1. **Assign Copilot** to the issue
2. **Poll status** with ~20-second intervals until the coding agent completes
3. The agent creates a PR automatically

### Step 4: Mark PR Ready for Review

The coding agent creates PRs as drafts. Before requesting review:

1. **Mark the PR as ready** (`draft: false`)
2. Verify the PR targets the **stage branch** (not `main`)

### Step 5: Request Copilot Code Review

1. **Request Copilot review** on the PR
2. **Poll for review completion** with ~20-second intervals
3. **Read review comments** — both the summary review and inline comments

### Step 6: Address Review Comments

If the review has actionable feedback:

1. **Post a `@copilot` comment** on the PR with clear fix instructions
   - Reference each review comment specifically
   - Include the suggested changes or describe what needs to change
   - Be explicit — the coding agent needs clear, unambiguous instructions
2. **Wait for the coding agent** to pick up the comment and apply fixes
3. **Poll status** with ~20-second intervals until complete

If the review has no actionable comments, skip to CI validation.

### Step 7: Validate CI Workflows

**Critical: Do not start CI validation until review fixes are complete.**

After review fixes are applied:

1. **Trigger CI workflows directly** using `run_workflow` on the PR's head branch
   - `e2e-local.yml` — runs E2E tests against a local server
   - `deploy-ephemeral.yml` — deploys an ephemeral container and runs E2E tests against it (validates Docker build, Azure config, and routing)
   - Use the workflow file name and the PR's head branch ref
   - This avoids the `action_required` approval issue with bot-triggered PRs
2. **Monitor workflow status** by polling `list_workflow_runs` filtered to the branch
3. **Wait until all triggered workflows complete** — both local and ephemeral E2E tests must pass

#### Why `run_workflow` Instead of Waiting for PR-Triggered Runs

Workflow runs triggered by the Copilot bot's PR pushes often get `action_required` status (GitHub requires approval for first-time contributor/bot workflows). The MCP tools have no `approve_workflow_run` method. By triggering workflows via `workflow_dispatch` directly, the orchestrator runs them under its own authority — no approval needed.

#### Handling CI Failures

If any workflow fails:

1. **Get the failing workflow run URL** from the workflow runs list
2. **Get the job logs** using `get_job_logs` for the failing job to understand the error
3. **Post a `@copilot` comment** on the PR:
   ```
   @copilot The CI workflow failed. Please investigate and fix the issue.
   
   Failing workflow run: https://github.com/{owner}/{repo}/actions/runs/{run_id}
   
   Error summary: {brief description of the failure from logs}
   
   Check the workflow logs for the specific error and apply a fix.
   ```
4. **Wait for the coding agent** to apply fixes
5. **Re-trigger CI** using `run_workflow` after fixes are pushed
6. **Repeat** until all workflows pass

This ensures problems are caught and fixed quickly within each PR, before they compound.

### Step 8: Merge PR to Stage Branch

Once CI passes and review fixes are applied:

1. **Squash merge** the PR into the stage branch
2. Move to the next issue in the stage

### Step 9: Full-Stage PR and Review

After all issues in the stage are merged to the stage branch:

1. **Create a PR** from the stage branch to `main`
   - Title: `Stage {N}: {Stage Name}`
   - Body: Summary of all changes across the stage, listing each issue/PR that was merged
2. **Request Copilot review** on the full-stage PR
   - This gives a holistic review of all changes together, catching cross-cutting issues that per-issue reviews might miss
3. **Address any review comments** using the same `@copilot` fix flow
4. **Trigger CI** on the full-stage PR using `run_workflow` (all tests should pass against the combined changes)
5. **Hand off to user for manual merge** — the orchestrator notifies the user that the stage PR is ready for final review and merge. The user merges to `main` manually (merge commit, not squash, to preserve stage history)

> **Why manual merge to main?** The final merge to `main` is a high-impact, hard-to-reverse operation that affects the production branch. The user should make this decision after reviewing the full-stage PR summary, Copilot review results, and CI status.

---

## Polling Strategy

- **Interval:** 20 seconds between status checks
- **What to poll:**
  - `get_copilot_job_status` — for coding agent completion
  - `get_reviews` — for Copilot review completion
  - `list_workflow_runs` / `get_check_runs` — for CI status
- **Timeout:** If a job hasn't progressed in 10+ minutes, investigate manually

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
- [ ] Input validation at system boundaries
- [ ] {Domain-specific security items}

## Documentation Standards

- Update {relevant doc files} when behavior changes
- {Any specific doc requirements}

## Process Tracking

- **Stage:** {N} — {Stage Name}
- **Issue:** {X} of {Y}
- **Depends on:** {issue refs}
- **Blocks:** {what this unblocks}
- **PR target branch:** `stage-{N}/{short-description}`
```

---

## Lessons Learned (Stage 0)

These observations come from orchestrating Stage 0 (3 issues, 3 PRs):

1. **Copilot reviews catch real issues.** PR #34 review found shallow copy bugs (`structuredClone` needed), validation mismatches (0-based vs 1-based order), and missing doc updates. PR #35 review found 3 documentation accuracy issues. Always run reviews.

2. **Be explicit in `@copilot` fix comments.** Reference specific line numbers, quote the review suggestion, and explain what the correct behavior should be. Vague instructions lead to incomplete fixes.

3. **Mark PRs ready before requesting review.** Copilot review doesn't work on draft PRs. Always set `draft: false` first.

4. **20-second polling is a good balance.** Shorter intervals waste API calls; longer intervals slow the feedback loop.

5. **Documentation-only PRs still benefit from review.** PR #35 (docs) had 3 accuracy errors caught by Copilot review — wrong immutability claims, incorrect field descriptions.

6. **CI failures should be caught per-PR, not at the end.** Fixing CI issues in the PR where they're introduced is much easier than debugging failures in a full-stage PR.

---

## Tools Used

The orchestrator uses these GitHub MCP tools:

| Tool | Purpose |
|------|---------|
| `issue_write` (create) | Create issues with full context |
| `assign_copilot_to_issue` | Start the coding agent on an issue |
| `get_copilot_job_status` | Poll coding agent progress |
| `update_pull_request` | Mark PR ready (`draft: false`), update target branch |
| `request_copilot_review` | Trigger Copilot code review |
| `pull_request_read` (get_reviews) | Check if review is complete |
| `pull_request_read` (get_review_comments) | Read inline review feedback |
| `add_issue_comment` | Post `@copilot` fix instructions on PRs |
| `actions_run_trigger` (run_workflow) | Trigger CI workflows on PR branch via `workflow_dispatch` |
| `actions_list` (list_workflow_runs) | Check CI workflow status |
| `actions_get` (get_workflow_run) | Get details of a specific run |
| `get_job_logs` | Get logs from failing CI jobs for error context |
| `merge_pull_request` | Merge issue PRs to stage branch (squash) |
| `create_branch` | Create the stage branch |
| `create_pull_request` | Create the full-stage PR to main |
