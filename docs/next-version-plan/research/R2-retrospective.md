# R2 Research Retrospective

> **Research item:** R2 — GitHub Projects v2 (GraphQL API)  
> **Date:** 2026-03-11  
> **Method:** Sub-agent delegation with structured prompts

## What Went Well

- **Sub-question decomposition worked cleanly** — 6 independent questions covered the full scope without overlap
- **Critical finding surfaced early** — the fine-grained PAT limitation (SQ3) was the most impactful finding and came back clearly
- **Code examples are ready-to-use** — the `githubGraphQL()` helper and mutation patterns can be copy-pasted into the codebase if Projects v2 is ever needed
- **Decision was clear** — the auth limitation made the recommendation straightforward rather than a subjective tradeoff

## What Could Be Improved

- **SQ3 (auth) should have been prioritized** — if dispatched first and the blocker found early, remaining sub-agents could have been scoped differently (e.g., focus on workarounds rather than full API documentation)
- **No empirical testing** — findings are documentation-based, not verified against a live repo. The fine-grained PAT limitation should be confirmed with a real token before finalizing the decision
- **SQ6 could have been skipped** — given the blocker finding, the implementation approach analysis was unnecessary for the immediate decision (though useful for future reference)

## Key Findings

1. **Fine-grained PATs (`github_pat_`) cannot access user-owned Projects v2** — documented GitHub limitation, no timeline for resolution
2. **All GraphQL mutations exist** for full Projects v2 CRUD — `createProjectV2`, `addProjectV2ItemById`, `updateProjectV2ItemFieldValue`, `createProjectV2Field`
3. **Rate limits are generous** — a typical planning scenario (42 mutations) uses <1% of hourly budget
4. **Raw fetch is the right implementation approach** — zero dependencies, matches existing `githubFetch` pattern
5. **Milestones + Labels (from R1) cover the MVP need** without requiring GraphQL

## Process Metrics

| Metric | Value |
|--------|-------|
| Sub-agents dispatched | 6 |
| Parallel batches | 1 (all 6 independent) |
| Files created | 2 (research doc + retrospective) |
| Critical blockers found | 1 (fine-grained PAT limitation) |
| Decision outcome | Skip Projects v2 for MVP (Option A) |

## Recommendations for Next Research

- **R3 (Web App → Orchestration Bridge)** benefits from this finding — confirms that the REST-only approach (Option A in R3) is preferred since we're already staying REST-only for tracking
- **Verify empirically** — before permanently closing this option, test a fine-grained PAT against the GraphQL API to confirm the limitation still exists
- **Monitor GitHub changelog** — if fine-grained PAT support for user Projects v2 is added, this research provides everything needed to implement it
