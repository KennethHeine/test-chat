# R5 Research Retrospective

> **Research item:** Persistent Planning Storage
> **Date:** 2026-03-11
> **Method:** Sub-agent delegation with structured prompts

## What Went Well

- **Codebase-first approach worked perfectly**: Reading `storage.ts`, `planning-store.ts`, and `planning-types.ts` before dispatching sub-agents meant every sub-question was grounded in existing patterns, not hypothetical
- **Parallel sub-agent dispatch**: All 6 sub-questions were independent — full parallel execution, no sequential bottlenecks
- **Clear decision emerged quickly**: Azure Table Storage was the obvious answer from sub-agent results; no ambiguity or need for follow-up research
- **Existing patterns made the answer easy**: The `AzureSessionStore` → `InMemorySessionStore` pattern is directly replicable for planning storage, making the migration strategy straightforward

## What Could Be Improved

- **SQ3 and SQ1 had overlapping scope**: PartitionKey strategy was researched in both; could have been a single sub-question
- **SQ6 batch findings were partially academic**: The planning store interface doesn't have batch methods and the data volumes are too low for batching to matter — this sub-question could have been scoped smaller
- **node:sqlite sub-question (SQ4) was mostly confirmatory**: The elimination was obvious from the scale-to-zero constraint alone; the full research was more than needed

## Key Findings

1. **Azure Table Storage — zero additional infra**: The existing storage account supports unlimited tables; no Bicep changes needed
2. **Separate tables with foreign key PartitionKeys**: Most efficient query pattern for the list operations the PlanningStore interface requires
3. **No interface changes**: The PlanningStore API stays the same; per-user isolation is already handled at the API layer via `getOwnedGoal()`
4. **All fields fit in Table Storage**: No blob offload needed with current char limits (worst case ~80 KB per entity, limit is 1 MiB)
5. **node:sqlite eliminated**: Data loss on scale-to-zero, SMB locking risks, architectural inconsistency

## Process Metrics

| Metric | Value |
|--------|-------|
| Sub-agents dispatched | 6 |
| Parallel batches | 1 (all 6 dispatched together) |
| Follow-up sub-agents | 0 |
| Files created | 2 (research doc + retrospective) |
| Source files read | 6 (storage.ts, planning-store.ts, planning-types.ts, planning-store.test.ts, storage.test.ts, main.bicep) |

## Recommendations for Next Research

- **R5 is ready for implementation** — no further research needed; all sub-questions fully answered
- The `AzurePlanningStore` implementation should be a straightforward coding task (~300 lines) following the `AzureSessionStore` pattern
- Consider combining the planning store integration tests with the existing storage tests in a shared test runner
