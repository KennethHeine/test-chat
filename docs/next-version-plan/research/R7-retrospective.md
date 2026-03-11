# R7 Research Retrospective

> **Research item:** GitHub Actions Workflow Dispatch  
> **Date:** 2026-03-11  
> **Method:** Sub-agent delegation with structured prompts

## What Went Well

- **Codebase-first approach** — reading existing workflows (`deploy-app.yml`, `e2e-local.yml`, `deploy-ephemeral.yml`) and PowerShell scripts (`trigger-and-wait-ci.ps1`, `get-ci-failure-summary.ps1`) before dispatching sub-agents provided critical context. The existing patterns directly informed the recommendations.
- **R3 cross-reference** — leveraging the R3 findings (Option A: direct REST API) properly scoped R7 as a supplementary/informational research item rather than a critical dependency.
- **Parallel dispatch** — all 6 sub-questions were independent, allowing full parallel execution in a single batch.
- **Practical code examples** — all sub-agents returned TypeScript implementations using the existing `githubFetch()` pattern, making the findings directly usable.

## What Could Be Improved

- **GitHub docs rate limiting** — all sub-agents reported HTTP 429 from docs.github.com, requiring reliance on API knowledge rather than live documentation verification. Consider caching or pre-fetching docs in future research sessions.
- **SQ4 used Octokit** — the log/artifact download sub-agent initially used `@octokit/rest` in its example, which conflicts with the project's pattern of using raw `fetch()`. This was corrected in the synthesis phase.

## Key Findings

1. **Neither dispatch mechanism returns a run ID** — this is the fundamental limitation. The unique input marker (correlation_id) approach is the only reliable solution.
2. **`repository_dispatch` > `workflow_dispatch`** for programmatic use — nested JSON payloads and multi-workflow fan-out make it more flexible.
3. **Rate limits are generous** — 5,000 req/hr allows monitoring ~20 concurrent runs at 15s intervals. Not a bottleneck for this project's scale.
4. **Existing codebase already has proven patterns** — the PowerShell scripts in `scripts/orchestrator/` implement timestamp correlation polling that translates directly to TypeScript.
5. **Dispatch is a supplementary capability, not a core need** — R3's Option A (direct REST API) is the primary orchestration strategy.

## Process Metrics

| Metric | Value |
|--------|-------|
| Sub-agents dispatched | 6 |
| Parallel batches | 1 (all 6 independent) |
| Files created | 2 (R7 doc + retrospective) |
| Codebase files read | 9 (server.ts, tools.ts, 6 workflows, R3 doc) |
| Total sub-questions | 6 |
| Sub-questions fully answered | 6 |

## Recommendations for Next Research

- **R8 (Real-Time Progress)** can now reference R7's webhook findings — the `workflow_run` webhook event provides push-based monitoring that eliminates polling.
- **No additional research needed** for workflow dispatch — the topic is fully covered for the project's needs.
