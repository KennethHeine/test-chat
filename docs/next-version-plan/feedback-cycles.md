# Feedback Cycles: How to Integrate Feedback at Every Stage

> **Parent issue:** Research and Planning for Next Version Vision: Stepwise Build, Feedback, and Maintenance
>
> This document defines how feedback should be collected, evaluated, and incorporated at each stage of the next-version delivery plan.

---

## Principles

1. **Every stage produces a reviewable artifact** — code, tests, docs, or a combination.
2. **No stage advances without passing its feedback checkpoint** — defined per stage in [project-plan.md](./project-plan.md).
3. **Fast feedback over perfect feedback** — prefer automated checks that run in seconds over manual reviews that take days.
4. **Feedback is actionable** — every feedback item results in a specific change or an explicit decision to defer.
5. **GitHub-first tracking** — work is tracked via GitHub Issues and Projects, not custom dashboards. Use GitHub's native features for progress visibility.

---

## Feedback Layers

### Layer 1: Automated Checks (Seconds)

These run on every commit and provide immediate feedback.

| Check | Command | What It Validates |
|-------|---------|-------------------|
| TypeScript typecheck | `npx tsc --noEmit` | Type safety, interface compliance |
| Storage unit tests | `npm run test:storage` | Data model CRUD, validation logic |
| Integration tests | `npm test` | Tool invocation, API endpoints, data round-trips |
| E2E tests | `npm run test:e2e:local` | User workflows, UI behavior |

**When to run:**
- Typecheck: every commit (fast, no dependencies)
- Unit tests: every commit touching storage or data model
- Integration tests: every commit touching server or tools (requires `COPILOT_GITHUB_TOKEN`)
- E2E tests: every commit touching frontend or API (requires Playwright + token)

### Layer 2: PR Review (Minutes to Hours)

Every stage produces a pull request that is reviewed before merge.

**PR review checklist:**
- [ ] Code changes match the stage scope — no scope creep
- [ ] Tests added for all new behavior
- [ ] Tests pass locally (`npx tsc --noEmit` + relevant test suites)
- [ ] Documentation updated if behavior changed
- [ ] Security considerations addressed (see [project-plan.md](./project-plan.md) security table)
- [ ] No hardcoded secrets or tokens
- [ ] Input validation present for all user-provided data
- [ ] Error handling covers failure cases

### Layer 3: Stage Checkpoint (Hours)

At the end of each stage, before advancing to the next one, validate the stage's deliverables against its feedback checkpoint (defined in [project-plan.md](./project-plan.md)).

**Checkpoint process:**
1. Run all automated checks
2. Manually test the user-facing workflow
3. Review the stage documentation for completeness
4. Verify security considerations were addressed
5. Create a brief checkpoint summary (pass/fail per item)

### Layer 4: Milestone Review (Days)

After completing a group of related stages, conduct a broader review.

**Milestone review triggers:**
- After Stage 0+1 (data model + goal definition) — "Can users define goals?"
- After Stage 2+3 (research + milestones) — "Can the system plan work?"
- After Stage 4+5 (issues + execution structure) — "Can we prepare GitHub?"
- After Stage 6 (orchestration) — "Can we execute?"

**Milestone review includes:**
- End-to-end walkthrough of the full workflow up to that point
- Performance review — are API calls responsive?
- Security review — are write operations properly gated?
- UX review — is the workflow intuitive?
- Open questions review — which were resolved, which remain?

---

## Feedback Integration Methods

### For Code Feedback

| Source | How to Integrate |
|--------|-----------------|
| Typecheck errors | Fix immediately — zero-error policy |
| Test failures | Fix before merge — no broken tests |
| PR review comments | Address each comment: fix, discuss, or explicitly defer |
| Security findings | Fix immediately if high/critical; document and plan for medium/low |
| CI/CD failures | Investigate using workflow logs; fix before merge |

### For Design Feedback

| Source | How to Integrate |
|--------|-----------------|
| Data model review | Update TypeScript interfaces and tests |
| Workflow feedback | Update system message guidance and tool behavior |
| UX feedback | Update frontend components and user flows |
| Architecture feedback | Document decision in relevant stage doc, update architecture.md |

### For Planning Feedback

| Source | How to Integrate |
|--------|-----------------|
| Open question resolution | Update [open-questions.md](./open-questions.md) with decision and rationale |
| Scope change | Update [project-plan.md](./project-plan.md) and affected stage deliverables |
| Priority change | Reorder stages if dependencies allow, update plan |
| New risk identified | Add to relevant stage security section and cross-cutting concerns |

---

## Feedback Cadence by Stage

| Stage | Primary Feedback Method | Cadence |
|-------|------------------------|---------|
| Stage 0: Data Model | Unit tests + typecheck + data model review | Per-commit + end of stage |
| Stage 1: Goal Definition | Integration tests + manual chat testing | Per-commit + demo walkthrough |
| Stage 2: Research | Integration tests + research quality review | Per-commit + research output review |
| Stage 3: Milestones | Integration tests + milestone structure review | Per-commit + plan quality review |
| Stage 4: Issue Generation | Integration tests + issue quality review + GitHub API testing | Per-commit + generated issue review |
| Stage 5: Execution Structure | Integration tests + GitHub structure validation | Per-commit + branch/label verification |
| Stage 6: Orchestration | Full integration tests + end-to-end execution testing + autonomous loop validation | Per-commit + supervised execution run + stop gate verification |

---

## Autonomous Execution Feedback

When the system is running autonomously through a milestone's execution loop, feedback takes a different form:

### During Autonomous Execution

| Feedback Source | How It's Captured |
|----------------|-------------------|
| CI check results | GitHub Actions reports pass/fail — system monitors via API |
| PR review comments | Copilot review generates comments — system classifies and acts |
| Agent completion status | GitHub API reports issue/PR status — system detects success/failure |
| Merge conflicts | Git reports conflicts — system escalates to human |

### Human Stop Gates as Feedback

When the system pauses execution, the stop event IS the feedback:
- **What stopped:** Which issue, which step in the loop
- **Why it stopped:** The specific failure condition
- **What was tried:** Any automated fix attempts
- **What's needed:** Clear description of human input required
- **How to resume:** Instructions for continuing after the issue is resolved

### Fast Delivery During Autonomous Execution

The system should deliver often during autonomous execution:
- Each merged PR is a delivery increment
- Each completed issue in the milestone is a feedback checkpoint
- The milestone branch at any point represents the current integrated state
- Human review of the final milestone PR is the last gate before delivery to main

---

## Issue-Level Feedback

Every implementation issue (created as a GitHub issue) should include:

1. **Acceptance criteria** — testable conditions for "done"
2. **Testing expectations** — which test types and what coverage
3. **Review instructions** — what reviewers should focus on
4. **Security checklist** — stage-specific security items to verify

This ensures that feedback for individual issues is structured and consistent.

---

## Continuous Improvement

After each milestone review, update:
- This feedback cycles document with lessons learned
- The project plan with any scope or priority adjustments
- The open questions document with newly resolved or newly discovered questions
- The test strategy if gaps were identified
