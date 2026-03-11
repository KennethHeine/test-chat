# R1: GitHub REST API for Write Operations

> **Status:** COMPLETE  
> **Date:** 2026-03-11  
> **Blocks:** Stage 4 (GitHub resource creation from web app)  
> **Summary:** All needed write endpoints exist in the GitHub REST API and can be used with the existing `githubFetch()` pattern from `tools.ts`. Fine-grained PATs with **Issues (write)** and **Contents (write)** permissions cover all operations.

---

## Endpoints Summary

| Operation | Method | Endpoint | Success | PAT Permission |
|-----------|--------|----------|---------|----------------|
| Create issue | POST | `/repos/{owner}/{repo}/issues` | 201 | Issues: write |
| Create milestone | POST | `/repos/{owner}/{repo}/milestones` | 201 | Issues: write |
| Update milestone | PATCH | `/repos/{owner}/{repo}/milestones/{number}` | 200 | Issues: write |
| Create label | POST | `/repos/{owner}/{repo}/labels` | 201 | Issues: write |
| Get branch SHA | GET | `/repos/{owner}/{repo}/git/ref/heads/{branch}` | 200 | Contents: read |
| Create branch | POST | `/repos/{owner}/{repo}/git/refs` | 201 | Contents: write |
| Update issue | PATCH | `/repos/{owner}/{repo}/issues/{issue_number}` | 200 | Issues: write |

---

## 1. Create Issue

**`POST /repos/{owner}/{repo}/issues`** → `201 Created`

### Required

| Parameter | Location | Type |
|-----------|----------|------|
| `owner` | path | string |
| `repo` | path | string |
| `title` | body | string |

### Optional (body)

| Parameter | Type | Notes |
|-----------|------|-------|
| `body` | string | Markdown content |
| `assignees` | string[] | User logins (requires push access) |
| `labels` | array | Label names or objects |
| `milestone` | number \| null | Milestone **number** (not ID) |

### Example Request

```json
{
  "title": "Implement session persistence",
  "body": "## Context\nSessions are lost on restart.\n\n## Acceptance Criteria\n- Sessions survive restart",
  "labels": ["stage-4", "enhancement"],
  "assignees": ["octocat"],
  "milestone": 3
}
```

### Key Response Fields

```json
{
  "id": 1,
  "number": 1347,
  "html_url": "https://github.com/owner/repo/issues/1347",
  "state": "open",
  "created_at": "2026-03-11T10:00:00Z"
}
```

---

## 2. Create Milestone

**`POST /repos/{owner}/{repo}/milestones`** → `201 Created`

### Required

| Parameter | Location | Type |
|-----------|----------|------|
| `owner` | path | string |
| `repo` | path | string |
| `title` | body | string |

### Optional (body)

| Parameter | Type | Notes |
|-----------|------|-------|
| `state` | string | `open` (default) or `closed` |
| `description` | string | Markdown description |
| `due_on` | string | ISO 8601: `YYYY-MM-DDTHH:MM:SSZ` |

### Example Request

```json
{
  "title": "Stage 4: GitHub Integration",
  "description": "Push planning data to GitHub as issues, milestones, and labels",
  "due_on": "2026-04-15T00:00:00Z"
}
```

### Key Response Fields

```json
{
  "number": 1,
  "id": 1002604,
  "html_url": "https://github.com/owner/repo/milestone/1",
  "state": "open",
  "open_issues": 0,
  "closed_issues": 0
}
```

### Update Milestone

**`PATCH /repos/{owner}/{repo}/milestones/{milestone_number}`** → `200 OK`

All body parameters are optional: `title`, `state`, `description`, `due_on`.

---

## 3. Create Label

**`POST /repos/{owner}/{repo}/labels`** → `201 Created`

### Required

| Parameter | Location | Type |
|-----------|----------|------|
| `owner` | path | string |
| `repo` | path | string |
| `name` | body | string |

### Optional (body)

| Parameter | Type | Notes |
|-----------|------|-------|
| `color` | string | Hex color **without** `#` prefix (e.g., `f29513`) |
| `description` | string | Max 100 characters |

### Example Request

```json
{
  "name": "stage-4",
  "color": "0075ca",
  "description": "Stage 4: GitHub Integration"
}
```

### Duplicate Handling

Creating a label that already exists returns **`422 Validation Failed`** with:
```json
{
  "message": "Validation Failed",
  "errors": [{ "resource": "Label", "field": "name", "code": "already_exists" }]
}
```

**Recommended pattern:** Attempt to create, catch 422 with `already_exists` code, and treat as success (idempotent).

---

## 4. Create Branch

Two-step process: get base SHA, then create ref.

### Step 1: Get base branch SHA

**`GET /repos/{owner}/{repo}/git/ref/heads/{branch}`** → `200 OK`

```json
// Response
{
  "ref": "refs/heads/main",
  "object": {
    "type": "commit",
    "sha": "aa218f56b14c9653891f9e74264a383fa43fefbd"
  }
}
```

### Step 2: Create new ref

**`POST /repos/{owner}/{repo}/git/refs`** → `201 Created`

### Required (body)

| Parameter | Type | Notes |
|-----------|------|-------|
| `ref` | string | Must start with `refs/` (e.g., `refs/heads/my-branch`) |
| `sha` | string | Commit SHA from step 1 |

### Example Request

```json
{
  "ref": "refs/heads/stage-4/github-integration",
  "sha": "aa218f56b14c9653891f9e74264a383fa43fefbd"
}
```

### Duplicate Handling

Creating a ref that already exists returns **`422 Validation Failed`**.

**Recommended pattern:** Check if branch exists first with GET, or catch 422.

---

## 5. Update Issue

**`PATCH /repos/{owner}/{repo}/issues/{issue_number}`** → `200 OK`

### Important Behaviors

| Field | Behavior |
|-------|----------|
| `labels` | **REPLACES all labels** — include every label you want to keep |
| `assignees` | **REPLACES all assignees** — include every assignee you want to keep |
| `milestone` | Pass milestone **number** (not ID). Pass `null` to remove. |
| `state` | `"open"` or `"closed"` |
| `state_reason` | `"completed"`, `"not_planned"`, `"duplicate"`, `"reopened"` |

### Example: Add to milestone and set labels

```json
{
  "milestone": 3,
  "labels": ["bug", "priority:high", "stage-4"]
}
```

### Silent Failures

Without push access, changes to `milestone`, `labels`, `assignees`, and `type` are **silently dropped** — no error is returned. Always verify the response reflects the expected changes.

---

## Required PAT Permissions Summary

| Permission | Level | Operations Covered |
|------------|-------|-------------------|
| **Issues** | write | Create/update issues, create/update milestones, create labels |
| **Contents** | write | Create branches (git refs), read branch SHAs |

A fine-grained PAT with these two permissions covers all R1 operations.

---

## Rate Limits

### Primary

- **5,000 requests/hour** for authenticated PAT requests

### Secondary (Content Creation)

| Constraint | Limit |
|------------|-------|
| Content-creation requests per minute | **80/min** |
| Content-creation requests per hour | **500/hr** |
| Write operations point cost | **5 points** each (vs 1 for GET) |
| Points per minute per endpoint | **900 pts/min** |

### Headers to Monitor

| Header | Purpose |
|--------|---------|
| `x-ratelimit-remaining` | Requests left in window |
| `x-ratelimit-reset` | UTC epoch when window resets |
| `retry-after` | Seconds to wait (on 403/429) |

### Practical Guidance

For a typical planning export (~20 issues + 5 milestones + 10 labels + 5 branches = ~40 write requests):
- Well within both primary (5,000/hr) and secondary (500/hr) limits
- Add **1-second delay** between creation requests to avoid secondary limits
- For larger batches, check `x-ratelimit-remaining` after each response

---

## Error Handling

### Error Response Format

```json
{
  "message": "Validation Failed",
  "errors": [
    { "resource": "Issue", "field": "title", "code": "missing_field" }
  ],
  "documentation_url": "https://docs.github.com/rest/..."
}
```

### Error Codes in `errors[]`

| Code | Meaning | Action |
|------|---------|--------|
| `already_exists` | Resource with same unique key exists | Treat as success (idempotent) |
| `missing_field` | Required parameter not provided | Fix request body |
| `missing` | Referenced resource doesn't exist | Verify IDs/numbers |
| `invalid` | Parameter format is wrong | Fix parameter format |
| `unprocessable` | General validation failure | Check `message` field |

### Retry Matrix

| Status | Retryable | Strategy |
|--------|-----------|----------|
| 403 (rate limit) | Yes | Wait for `retry-after` header |
| 429 | Yes | Wait for `retry-after` header |
| 503 | Yes | Exponential backoff |
| 400, 404, 422 | No | Fix request |
| 409 (conflict) | Maybe | Re-fetch, resolve, retry |

---

## Integration with Existing Codebase

### Current Pattern (`tools.ts`)

The existing `githubFetch()` helper only supports GET (no body). Write operations need a new helper:

```typescript
async function githubWrite(
  token: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body: Record<string, unknown>
): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "copilot-agent-orchestrator",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${errorBody.slice(0, 200)}`);
  }
  return res.json();
}
```

### Proposed New Tools

| Tool Name | Operation | Parameters |
|-----------|-----------|------------|
| `create_issue` | POST issue | owner, repo, title, body, labels?, assignees?, milestone? |
| `create_milestone` | POST milestone | owner, repo, title, description?, due_on? |
| `create_label` | POST label | owner, repo, name, color?, description? |
| `create_branch` | GET SHA + POST ref | owner, repo, branch_name, base_branch? |
| `update_issue` | PATCH issue | owner, repo, issue_number, title?, body?, state?, labels?, assignees?, milestone? |

These follow the existing `createGitHubTools(token)` factory pattern, using the user's token for authorization.

---

## Decision: Ready for Implementation

All endpoints are standard GitHub REST API. No GraphQL needed. No special SDK required.

**Required changes to implement:**
1. Add `githubWrite()` helper to `tools.ts`
2. Add 5 new tool definitions to `createGitHubTools()`
3. Update `GITHUB_TOOL_NAMES` constant
4. Update `safePermissionHandler` if needed
5. Document new PAT permission requirements in README
