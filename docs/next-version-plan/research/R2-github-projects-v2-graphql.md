# R2: GitHub Projects v2 (GraphQL API)

> **Status:** COMPLETE  
> **Date:** 2026-03-11  
> **Blocks:** Stage 4 (project board creation for milestone tracking)  
> **Summary:** Projects v2 GraphQL API is fully capable but **fine-grained PATs (`github_pat_`) cannot access user-owned Projects v2** — only organization projects are supported. This is a documented GitHub limitation with no timeline for resolution. **Recommendation: Skip Projects v2 for MVP and use Milestones + Labels for tracking (Decision Option A).**

---

## Findings Summary

| Finding | Impact |
|---------|--------|
| Fine-grained PATs can't access user Projects v2 | **BLOCKER** for user-owned repos |
| Fine-grained PATs work for org Projects v2 | Only viable for org contexts |
| GraphQL API is complete for CRUD | All needed mutations exist |
| Rate limits are generous for our use case | 41 mutations < 1% of budget |
| Raw fetch matches existing codebase pattern | Zero new dependencies needed |
| Cannot update Assignees/Labels/Milestone via project API | Must use separate REST mutations |

---

## 1. Critical Authentication Limitation

### The Problem

This app **requires fine-grained PATs** (`github_pat_` prefix) — classic PATs (`ghp_`) are explicitly unsupported (see AGENTS.md). However:

| Token Type | User Projects v2 | Org Projects v2 |
|------------|------------------|-----------------|
| Classic PAT (`ghp_`) | `project` scope — **works** | `project` scope — **works** |
| Fine-grained PAT (`github_pat_`) | **NOT SUPPORTED** | `organization_projects: write` — **works** |

This is a documented GitHub limitation. GitHub states it "will be solved over time" but provides no timeline.

### Impact

- Users working on **personal repos** (the primary use case for this app) **cannot use Projects v2**
- Users working on **organization repos** can use Projects v2 with `organization_projects` permission
- Requiring users to switch to classic PATs would break the existing auth model

### Required Fine-Grained PAT Permissions (Org Only)

| Permission | Level | Grants |
|------------|-------|--------|
| `organization_projects` | `read` | Query projects/items |
| `organization_projects` | `write` | Add/update/delete items |
| `organization_projects` | `admin` | Create/delete projects |

---

## 2. GraphQL API Surface

### Mutations

| Operation | Mutation | Input | Returns |
|-----------|----------|-------|---------|
| Create project | `createProjectV2` | `ownerId`, `title` | `projectV2 { id }` |
| Add custom field | `createProjectV2Field` | `projectId`, `name`, `dataType`, `singleSelectOptions?` | `projectV2Field { id }` |
| Add issue to project | `addProjectV2ItemById` | `projectId`, `contentId` | `item { id }` |
| Update field value | `updateProjectV2ItemFieldValue` | `projectId`, `itemId`, `fieldId`, `value` | `projectV2Item { id }` |

### Default Fields (Auto-Created)

| Field | Type | Notes |
|-------|------|-------|
| Title | Text | Mirrors issue title |
| Status | SingleSelect | Default options: Todo, In Progress, Done |
| Assignees | Read-only | Mirrors issue assignees |
| Labels | Read-only | Mirrors issue labels |
| Milestone | Read-only | Mirrors issue milestone |

### Custom Field Types

| `ProjectV2CustomFieldType` | Value for Updates | Example |
|-----------------------------|-------------------|---------|
| `TEXT` | `{ text: "..." }` | Notes |
| `NUMBER` | `{ number: 1.0 }` | Story points |
| `DATE` | `{ date: "2024-01-15" }` | Due date |
| `SINGLE_SELECT` | `{ singleSelectOptionId: "ID" }` | Priority |
| `ITERATION` | `{ iterationId: "ID" }` | Sprint |

### Key Constraint

**Cannot update** Assignees, Labels, Milestone, or Repository via project field API — these mirror issue/PR properties and must be updated via REST (`addLabelsToLabelable`, etc.).

---

## 3. Query Operations

### List Projects

```graphql
# User projects
query { user(login: "USER") { projectsV2(first: 20) { nodes { id title number } } } }

# Org projects
query { organization(login: "ORG") { projectsV2(first: 20) { nodes { id title number } } } }

# Specific project
query { user(login: "USER") { projectV2(number: 5) { id title } } }
```

### Get Field IDs (Required Before Mutations)

```graphql
query {
  node(id: "PROJECT_ID") {
    ... on ProjectV2 {
      fields(first: 20) {
        nodes {
          ... on ProjectV2Field { id name }
          ... on ProjectV2SingleSelectField { id name options { id name } }
          ... on ProjectV2IterationField { id name configuration { iterations { id startDate } } }
        }
      }
    }
  }
}
```

### Node ID Lookups

Issue node IDs (needed for `addProjectV2ItemById`) are available from:
- GraphQL: `repository(owner:name:) { issue(number:) { id } }`
- REST: `GET /repos/{owner}/{repo}/issues/{number}` → `node_id` field in response

| ID Prefix | Entity |
|-----------|--------|
| `PVT_` | Project |
| `PVTI_` | Project item |
| `PVTF_` | Text/Number/Date field |
| `PVTSSF_` | SingleSelect field |
| `I_` | Issue |

---

## 4. Complete Workflow Example

```typescript
// Step 1: Create project (org only with fine-grained PAT)
const project = await githubGraphQL(token, `
  mutation($ownerId: ID!, $title: String!) {
    createProjectV2(input: { ownerId: $ownerId, title: $title }) {
      projectV2 { id }
    }
  }
`, { ownerId: ORG_NODE_ID, title: "v2.0 Milestones" });

// Step 2: Query field IDs
const fields = await githubGraphQL(token, `
  query($projectId: ID!) {
    node(id: $projectId) {
      ... on ProjectV2 { fields(first: 20) { nodes {
        ... on ProjectV2SingleSelectField { id name options { id name } }
        ... on ProjectV2Field { id name }
      } } }
    }
  }
`, { projectId: project.createProjectV2.projectV2.id });

// Step 3: Add issue to project
const item = await githubGraphQL(token, `
  mutation($projectId: ID!, $contentId: ID!) {
    addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
      item { id }
    }
  }
`, { projectId: PROJECT_ID, contentId: ISSUE_NODE_ID });

// Step 4: Set status on item
await githubGraphQL(token, `
  mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
      value: { singleSelectOptionId: $optionId }
    }) { projectV2Item { id } }
  }
`, { projectId: PROJECT_ID, itemId: ITEM_ID, fieldId: STATUS_FIELD_ID, optionId: TODO_OPTION_ID });
```

---

## 5. Rate Limits

| Limit | Value | Notes |
|-------|-------|-------|
| Primary (points/hour) | 5,000 | Mutations cost 1 point each |
| Secondary (points/min) | 2,000 | Mutations cost 5 secondary points |
| Content creation | 80/min, 500/hour | Binding constraint for batches |
| Concurrent requests | 100 | |

### Planning Scenario: 1 Project + 20 Issues + 20 Status Updates

| Step | API Calls | Primary Points | Secondary Points |
|------|-----------|---------------|-----------------|
| Create project | 1 | 1 | 5 |
| Query fields | 1 | 1 | 1 |
| Add 20 items | 20 | 20 | 100 |
| Set status ×20 | 20 | 20 | 100 |
| **Total** | **42** | **42** | **206** |

**Budget used: 0.8% of hourly primary limit.** Rate limits are not a concern for this use case. Recommended pacing: ≥1 second between mutations.

---

## 6. Implementation Approach

**Recommendation: Raw fetch** (no new dependencies).

A `githubGraphQL()` helper function mirrors the existing `githubFetch()` pattern:

```typescript
async function githubGraphQL(
  token: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "copilot-agent-orchestrator",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub GraphQL HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    data?: unknown;
    errors?: Array<{ message: string; type?: string; path?: string[] }>;
  };
  if (json.errors?.length) {
    throw new Error(`GitHub GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  return json.data;
}
```

**Key design note:** GitHub returns HTTP 200 even when queries fail — errors are in `response.body.errors[]`. The helper handles this.

### Why Raw Fetch Over @octokit/graphql

| Aspect | Raw Fetch | @octokit/graphql |
|--------|-----------|------------------|
| New dependencies | 0 | 3 packages (~50KB) |
| Matches existing pattern | Yes — identical header/error style | Different API surface |
| Response type safety | `unknown` | `unknown` (same without codegen) |
| GraphQL error handling | ~5 lines manual | Automatic |

---

## 7. Integration with Existing Codebase

| Existing Pattern | Projects v2 Integration |
|-----------------|------------------------|
| `githubFetch(token, path)` in `tools.ts` | Add `githubGraphQL(token, query, vars)` alongside |
| Read-only tools (list_repos, etc.) | Add project tools: `create_project`, `add_issue_to_project` |
| `IssueDraft.status` in `planning-types.ts` | Map to project Status field (Todo → draft/ready, In Progress → created) |
| REST API `node_id` in issue responses | Use as `contentId` for `addProjectV2ItemById` |
| Fine-grained PAT auth model | **Limits Projects v2 to org repos only** |

---

## Decision: Skip Projects v2 for MVP (Option A)

### Recommendation

**Use Milestones + Labels for tracking. Do not implement Projects v2 for the initial release.**

### Reasoning

1. **Fine-grained PAT limitation is a blocker** — the app requires `github_pat_` tokens, which cannot access user-owned Projects v2. Most individual developers (the primary audience) use personal repos.
2. **Milestones + Labels cover the core need** — R1 research confirmed all write operations work with fine-grained PATs (`Issues: write` permission). Milestones provide grouping, labels provide categorization.
3. **Lower complexity** — REST-only approach avoids GraphQL, avoids needing to query field IDs before mutations, avoids managing project state.
4. **Future-proof** — when GitHub resolves the fine-grained PAT limitation, Projects v2 can be added as an enhancement. The `githubGraphQL` helper and mutation patterns documented here are ready to implement.

### What Milestones + Labels Provide

| Need | Milestones Solution | Projects v2 Would Add |
|------|--------------------|-----------------------|
| Group issues by phase | Milestone per phase | Board view with columns |
| Track progress | Milestone % complete | Custom status fields |
| Categorize issues | Labels (priority, type) | Custom single-select fields |
| Order issues | Issue body/title convention | Drag-and-drop ordering |
| Visual board | GitHub milestone view | Kanban board view |

### If Projects v2 Is Added Later

The research documented here provides everything needed:
- All mutation/query patterns (Sections 2-4)
- Rate limit analysis (Section 5)
- Implementation helper code (Section 6)
- Auth requirements: requires org context or classic PATs (Section 1)
