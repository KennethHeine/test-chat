# R9 Research Retrospective

> **Research item:** IssueDraft Quality — What Makes a Good Coding Agent Issue?
> **Date:** 2026-03-11
> **Method:** Sub-agent delegation with structured prompts

## What Went Well

- **Codebase-first approach paid off** — reading `planning-types.ts`, `stage-setup.agent.md`, `issue-lifecycle.agent.md`, and `issue-breakdown.md` before dispatching sub-agents meant every sub-question was grounded in the actual system, not hypothetical patterns.
- **SQ1 (template vs. IssueDraft gap analysis) was the highest-value sub-question** — it produced a concrete field mapping table that directly informs implementation.
- **Cross-referencing sub-agent results revealed convergence** — all 5 sub-agents independently identified `filesToModify` as the most impactful missing field. This triangulation increases confidence in the recommendation.
- **SQ5 (completed issue analysis) provided empirical validation** — Issue 2 (with a pattern reference to `storage.ts`) was the strongest issue across all 12, confirming the theoretical recommendations from SQ2–SQ4.
- **Structured output format worked well** — tables and checklists were more useful than prose for this topic.

## What Could Be Improved

- **SQ2 (GitHub docs) hit rate limits** — the fetch_webpage tool got 429'd on one URL. Future research should try to batch web fetches or have fallback URLs ready.
- **SQ4 (industry practices) had limited external sources** — Sweep AI is apparently defunct. The sub-agent synthesized from training knowledge, which is reasonable but less verifiable.
- **No access to actual GitHub issue bodies from the repo** — the issue-breakdown.md has abbreviated summaries, not the full issue bodies that were actually created by stage-setup. Comparing what was *defined* vs. what was *created* vs. what was *implemented* would have been more rigorous.
- **Could have added SQ6: "What does the coding agent's PR description reveal about what it understood/missed?"** — analyzing PR descriptions from Stages 0-3 would show what context the agent actually used.

## Key Findings

1. **`filesToModify` and `filesToRead` are the most impactful missing IssueDraft fields** — every source (GitHub docs, lifecycle analysis, stage review, industry practices) converged on this.
2. **Pattern references are the strongest predictor of clean first-pass code** — empirically validated by comparing Issue 2 to frontend issues.
3. **Acceptance criteria must be machine-testable** — "works correctly" causes CI loops; "runs `npx tsc --noEmit` with zero errors" does not.
4. **Issue scope should target ≤3 hours of human-equivalent work** — larger scopes cause agent timeouts.
5. **Research context from `researchLinks` is currently silently dropped** — the template has no slot for it.

## Process Metrics

| Metric | Value |
|--------|-------|
| Sub-agents dispatched | 5 |
| Parallel batches | 2 (1 for SQ1 sequential with codebase reads, 4 for SQ2-SQ5 parallel) |
| Files created | 2 (research doc + retrospective) |
| Codebase files read | 8 (planning-types.ts, planning-tools.ts, issue-breakdown.md, stage-setup.agent.md, issue-lifecycle.agent.md, orchestrator process doc, goal.md, project-plan-v2.md) |
| External sources attempted | 4 (GitHub docs ×2, Devin docs, Sweep docs) |
| External sources successfully fetched | 2 |

## Recommendations for Next Research

- **R6 (SDK unused features)** should investigate whether `MCP server integration` could let the SDK session render research context when generating issues — this would close the `researchLinks` rendering gap.
- **When implementing Issue 4.6 (`generate_issue_drafts`)**, use the Issue Quality Checklist from the research doc as the validation gate before marking drafts as `ready`.
- **Consider adding a `FileRef` interface** to `planning-types.ts` as a prerequisite before Issue 4.6, since multiple new IssueDraft fields depend on it.
