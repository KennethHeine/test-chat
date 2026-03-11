# R5: Persistent Planning Storage

> **Status:** COMPLETE
> **Date:** 2026-03-11
> **Blocks:** Stage 4 (planning data must survive restarts for production use)
> **Summary:** Azure Table Storage is the clear choice — zero additional infrastructure, proven pattern in the codebase, and all planning fields fit comfortably within limits. Use separate tables per entity type with composite PartitionKeys for efficient foreign key queries and per-user isolation. The `PlanningStore` interface requires no changes.

---

## Findings Summary

| Sub-Question | Finding |
|---|---|
| SQ1: Table schema design | Single table vs separate tables — both viable; **separate tables recommended** for clearer schema and optimal PartitionKey strategy per entity |
| SQ2: Blob vs Table for large fields | **All fields fit in Table Storage** — no blob offload needed with current char limits |
| SQ3: Query patterns & indexing | **Composite PartitionKey** (`foreignKey` or `tokenHash:foreignKey`) enables efficient partition scans for all list queries |
| SQ4: node:sqlite alternative | **Not viable** — data lost on scale-to-zero; SQLite on Azure Files SMB is risky; adds architectural inconsistency |
| SQ5: Migration strategy | **Zero interface changes** — add `AzurePlanningStore` class + factory function following existing `storage.ts` pattern |
| SQ6: Limits & transactions | No limits at risk; **batch transactions available** within same PartitionKey; cost negligible (<$0.01/month) |

---

## SQ1: Azure Table Storage Schema Design

### Design Decision: Separate Tables

While a single `planning` table with entity-type prefixed RowKeys is viable, **separate tables** work better because each entity type has a different optimal PartitionKey:

| Entity | Table Name | PartitionKey | RowKey |
|---|---|---|---|
| Goal | `plangoals` | `{sessionId}` | `{goalId}` |
| ResearchItem | `planresearch` | `{goalId}` | `{itemId}` |
| Milestone | `planmilestones` | `{goalId}` | `{milestoneId}` |
| IssueDraft | `planissues` | `{milestoneId}` | `{draftId}` |

**Why PartitionKey = foreignKey (not tokenHash):**
- List queries become pure **partition scans** (e.g., `listMilestones(goalId)` → `PartitionKey eq '{goalId}'`)
- Get-by-ID requires the parent FK, which is naturally available in all navigation flows
- Per-user isolation is enforced at the **API layer** (`server.ts` already validates ownership via `getOwnedGoal()`)
- No interface changes needed — the PlanningStore doesn't take `tokenHash` and shouldn't

### Property Mapping

Array properties (no native array type in Table Storage) must be JSON-serialized:

```typescript
// Write: serialize arrays to JSON strings
await tableClient.upsertEntity({
  partitionKey: goal.sessionId,
  rowKey: goal.id,
  intent: goal.intent,
  goal: goal.goal,
  // ... scalar fields ...
  successCriteria: JSON.stringify(goal.successCriteria),
  assumptions: JSON.stringify(goal.assumptions),
  constraints: JSON.stringify(goal.constraints),
  risks: JSON.stringify(goal.risks),
  createdAt: goal.createdAt,
  updatedAt: goal.updatedAt,
}, "Merge");

// Read: parse JSON strings back to arrays
const entity = await tableClient.getEntity(sessionId, goalId);
const goal: Goal = {
  id: entity.rowKey as string,
  sessionId: entity.partitionKey as string,
  successCriteria: JSON.parse(entity.successCriteria as string),
  // ... etc
};
```

---

## SQ2: Blob vs Table for Large Fields

### Field Size Analysis

| Entity | Largest Field | Max Chars | Max UTF-8 Bytes | Fits 64 KiB? |
|---|---|---|---|---|
| Goal | intent | 2000 | ~6 KB | Yes |
| Goal | successCriteria[] (serialized) | ~5000 | ~15 KB | Yes |
| ResearchItem | findings | 2000 | ~6 KB | Yes |
| Milestone | acceptanceCriteria[] (serialized) | ~5000 | ~15 KB | Yes |
| IssueDraft | technicalContext | 2000 | ~6 KB | Yes |

**Worst-case entity size:** ~80 KB (well under 1 MiB limit)

### Decision: Table Storage Only

All current fields fit comfortably within Azure Table Storage limits:
- **64 KiB per string property** — largest field is ~15 KB serialized
- **1 MiB per entity** — worst case is ~80 KB
- **252 custom properties** — most complex entity (Goal) has ~12 properties

**No blob offload needed.** If char limits are removed in the future, blob offload can be added then.

---

## SQ3: Query Patterns & Indexing

### Query Performance by Design

| Operation | OData Filter | Query Type | Performance |
|---|---|---|---|
| `listGoals(sessionId)` | `PartitionKey eq '{sessionId}'` | Partition scan | Fast |
| `listResearchItems(goalId)` | `PartitionKey eq '{goalId}'` | Partition scan | Fast |
| `listMilestones(goalId)` | `PartitionKey eq '{goalId}'` | Partition scan | Fast |
| `listIssueDrafts(milestoneId)` | `PartitionKey eq '{milestoneId}'` | Partition scan | Fast |
| `getGoal(goalId)` | Requires sessionId → point query | Needs lookup | See below |

### Get-by-ID Challenge

The `getGoal(goalId)` pattern requires knowing the `sessionId` (PartitionKey) to perform a point query. Two solutions:

**Option A: Caller provides context** — Most callers already have the sessionId from the request context. The API layer in `server.ts` already resolves this.

**Option B: Table scan fallback** — For the rare case where only the goalId is known, use a filter on RowKey across all partitions. With low data volume (<50 goals per deployment), this is acceptable.

**Recommended: Option A** for get operations, with Option B as fallback. The `AzurePlanningStore` can internally scan when the partition key isn't provided:

```typescript
async getGoal(goalId: string): Promise<Goal | null> {
  // Scan across partitions filtering by RowKey
  const iter = this.goalTable.listEntities({
    queryOptions: { filter: `RowKey eq '${goalId}'` },
  });
  for await (const entity of iter) {
    return this.entityToGoal(entity);
  }
  return null;
}
```

**Note:** This is a table scan, but with <50 goals it completes in <100ms. If performance becomes a concern, add an index table later.

---

## SQ4: node:sqlite Alternative — Not Recommended

### Key Problems

| Problem | Impact |
|---|---|
| **Data lost on scale-to-zero** | Container filesystem is ephemeral; all planning data destroyed when Container App scales to zero |
| **SQLite on Azure Files SMB** | SQLite's POSIX file locking doesn't work reliably over SMB; risk of database corruption |
| **Architectural inconsistency** | Two different storage backends (Table Storage for sessions, SQLite for planning) doubles maintenance |
| **Still release candidate** | `node:sqlite` stability is 1.2 (RC), not yet stable (2.0) |
| **Additional infra required** | Azure Files share + mount config in Bicep; more deployment complexity |

### Comparison

| Criterion | node:sqlite | Azure Table Storage |
|---|---|---|
| Already in use | No | **Yes** |
| Additional infra | Azure Files share + mount | **None** |
| Persistence on scale-to-zero | Requires volume mount | **Native** |
| Multi-replica safety | **Dangerous** (single-writer) | **Safe** |
| Query capability | Full SQL, JOINs | PK/RK filters, OData |
| Cost | Storage account charges | **Included** in existing account |

### Decision: Use Azure Table Storage

node:sqlite is eliminated. Azure Table Storage requires zero additional infrastructure and is already proven for session storage in this codebase.

---

## SQ5: Migration Strategy

### Zero Interface Changes Required

The `PlanningStore` interface needs **no modifications**. The migration follows the exact pattern from `storage.ts`:

| Component | Session Store (existing) | Planning Store (new) |
|---|---|---|
| Interface | `SessionStore` | `PlanningStore` (already exists) |
| In-memory | `InMemorySessionStore` | `InMemoryPlanningStore` (already exists) |
| Azure | `AzureSessionStore` | `AzurePlanningStore` (to build) |
| Factory | `createSessionStore()` | `createPlanningStore()` (to add) |
| Server init | `createSessionStore(accountName)` | `createPlanningStore(accountName)` |

### Per-User Isolation

The PlanningStore doesn't need `tokenHash` because:
1. `Goal.sessionId` links to sessions that are already user-scoped
2. `server.ts` already validates ownership via `getOwnedGoal()` (fetches goal → lists user sessions → checks membership)
3. Azure Table Storage gets isolation via PartitionKey = `sessionId`/`goalId`/`milestoneId` — all naturally scoped to a user

### Implementation Skeleton

```typescript
// planning-store.ts additions

export class AzurePlanningStore implements PlanningStore {
  private goalTable: TableClient;
  private researchTable: TableClient;
  private milestoneTable: TableClient;
  private issueDraftTable: TableClient;

  constructor(accountName: string) {
    const credential = new DefaultAzureCredential();
    const url = `https://${accountName}.table.core.windows.net`;
    this.goalTable = new TableClient(url, "plangoals", credential);
    this.researchTable = new TableClient(url, "planresearch", credential);
    this.milestoneTable = new TableClient(url, "planmilestones", credential);
    this.issueDraftTable = new TableClient(url, "planissues", credential);
  }

  async initialize(): Promise<void> {
    await Promise.all([
      this.goalTable.createTable().catch(ignoreConflict),
      this.researchTable.createTable().catch(ignoreConflict),
      this.milestoneTable.createTable().catch(ignoreConflict),
      this.issueDraftTable.createTable().catch(ignoreConflict),
    ]);
  }

  // ... 20+ methods implementing PlanningStore interface
}

function ignoreConflict(err: any) {
  if (err?.statusCode !== 409) throw err;
}

export function createPlanningStore(accountName?: string): PlanningStore {
  if (accountName) {
    return new AzurePlanningStore(accountName);
  }
  return new InMemoryPlanningStore();
}
```

### Server.ts Changes

```typescript
// Before:
const planningStore: PlanningStore = new InMemoryPlanningStore();

// After:
const planningStore: PlanningStore = createPlanningStore(storageAccountName || undefined);

// Initialization (after session store init):
if (planningStore instanceof AzurePlanningStore) {
  await (planningStore as AzurePlanningStore).initialize();
}
```

### Testing Strategy

1. **Existing tests** (`planning-store.test.ts`) continue testing `InMemoryPlanningStore`
2. **New integration tests** for `AzurePlanningStore` — gated by env var (like session store tests)
3. **Shared test suite** — extract test cases into a function that accepts any `PlanningStore`, run against both implementations

---

## SQ6: Limits, Transactions & Batches

### Relevant Limits

| Limit | Value | Planning Store Risk |
|---|---|---|
| Max entity size | 1 MiB | None (worst case ~80 KB) |
| Max properties | 252 custom | None (max 12 per entity) |
| Max string property | 64 KiB | None (max ~15 KB) |
| Batch size | 100 entities | None (typical goal tree: ~41 entities) |
| Batch constraint | Same PartitionKey | Limits cross-entity batches |

### Batch Opportunities

| Operation | Batchable? | Reason |
|---|---|---|
| Create goal + research items | **No** — different tables | Separate table creates |
| Create milestones for a goal | **Yes** — same PK in `planmilestones` | All share `goalId` as PK |
| Create issues for a milestone | **Yes** — same PK in `planissues` | All share `milestoneId` as PK |
| Cascade delete goal children | **Partial** — per table | Batch delete within each table |

### Concurrency

- **Optimistic concurrency** via ETag on every entity
- Use `If-Match: *` for upsert/force-overwrite (current pattern with `"Merge"` mode)
- Planning data has low concurrent write contention (single user editing their own plan)

### Cost

Planning data operations are negligible:
- Typical planning session: ~50-100 transactions total
- At $0.000036 per transaction: **< $0.01/month**

---

## Integration with Existing Codebase

### What Already Works

| Component | Status | Impact on R5 |
|---|---|---|
| `PlanningStore` interface | Complete — 20+ methods | No changes needed |
| `InMemoryPlanningStore` | Complete with validation | Remains as dev fallback |
| `planning-types.ts` | Complete — 4 entity types | No changes needed |
| `planning-store.test.ts` | Complete for in-memory | Extend for Azure store |
| `@azure/data-tables` dependency | Already in `package.json` | Reuse directly |
| `AzureSessionStore` pattern | Working in production | Copy pattern exactly |
| `AZURE_STORAGE_ACCOUNT_NAME` env var | Already set in Container App | No infra changes |
| `server.ts` ownership checks | `getOwnedGoal()` validates user access | Provides per-user isolation |

### What's Needed

| New Component | Estimated Scope |
|---|---|
| `AzurePlanningStore` class | ~300 lines (20 methods + serialization helpers) |
| `createPlanningStore()` factory | ~5 lines |
| `server.ts` init changes | ~3 lines |
| Integration tests for Azure store | ~200 lines (reuse existing test patterns) |

### No Infrastructure Changes Required

The existing Azure Storage account (provisioned in `infra/main.bicep`) supports unlimited tables. The `AzurePlanningStore.initialize()` method creates the 4 new tables on first run. No Bicep changes needed.

---

## Decision: Ready for Implementation

### Storage Backend: Azure Table Storage

- **4 separate tables**: `plangoals`, `planresearch`, `planmilestones`, `planissues`
- **PartitionKey = parent foreign key**: `sessionId` for goals, `goalId` for research/milestones, `milestoneId` for issues
- **RowKey = entity ID**: direct point query when parent FK is known
- **Arrays serialized as JSON strings**: no blob offload needed

### Alternatives Eliminated

| Alternative | Reason Eliminated |
|---|---|
| node:sqlite | Data lost on scale-to-zero; not safe on SMB; adds complexity |
| Single planning table | Suboptimal PartitionKey strategy per entity type |
| Blob offload for large fields | All fields fit within Table Storage limits |
| Interface changes for tokenHash | Unnecessary — API layer already handles isolation |

### Implementation Ready

All findings confirm the implementation can proceed with:
1. Add `AzurePlanningStore` class to `planning-store.ts`
2. Add `createPlanningStore()` factory function
3. Update `server.ts` to use factory
4. Add integration tests
5. No infrastructure changes needed
