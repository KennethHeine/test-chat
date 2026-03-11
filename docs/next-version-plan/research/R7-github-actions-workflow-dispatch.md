# R7: GitHub Actions Workflow Dispatch

> **Status:** COMPLETE  
> **Date:** 2026-03-11  
> **Blocks:** Informational — needed if Option B/C from R3 is ever revisited  
> **Summary:** GitHub provides two dispatch mechanisms (`workflow_dispatch` and `repository_dispatch`) for triggering workflows from external apps. Neither returns a run ID — correlation requires polling or a unique input marker. Per R3 findings, **direct REST API orchestration (Option A) is preferred**, making workflow dispatch a fallback option for batch/long-running operations only.

---

## Findings Summary

| Sub-Question | Key Finding |
|---|---|
| SQ1: `workflow_dispatch` API | `POST .../workflows/{id}/dispatches` — returns 204 with no body. Max 10 string-only inputs. |
| SQ2: Get run ID after dispatch | Dispatch returns no run ID. Best approach: pass a `correlation_id` UUID as input, poll runs and match. |
| SQ3: Monitor run progress | Poll `GET .../actions/runs/{id}` — statuses: `queued`→`in_progress`→`completed`. 6 possible conclusions. |
| SQ4: Logs and artifacts | Logs: `GET .../runs/{id}/logs` → 302 redirect to zip. Artifacts: list then download by ID. |
| SQ5: PAT scopes & rate limits | `actions:read` for monitoring, `actions:write` for dispatch. 5,000 req/hr, ~20 concurrent runs at 15s polling. |
| SQ6: Alternatives | `repository_dispatch` offers nested JSON payloads; webhooks eliminate polling. Neither dispatch returns run ID. |

---

## 1. Triggering a Workflow: `workflow_dispatch` API

### Endpoint

| Detail | Value |
|--------|-------|
| Method | `POST` |
| Path | `/repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches` |
| `workflow_id` | Workflow file name (e.g., `orchestrator.yml`) or numeric ID |
| Success | `204 No Content` (empty body — **no run ID returned**) |

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ref` | string | **Yes** | Branch or tag to run the workflow on |
| `inputs` | object | No | Key-value pairs matching workflow's `inputs:` definition |

### Input Constraints

| Constraint | Value |
|-----------|-------|
| Max inputs per workflow | **10** |
| Input value type | **String only** (booleans/numbers must be stringified) |
| Max input value length | ~65,535 characters |
| Unrecognized keys | Silently ignored |

### TypeScript Example

```typescript
async function triggerWorkflowDispatch(
  token: string,
  owner: string,
  repo: string,
  workflowFile: string,
  ref: string,
  inputs?: Record<string, string>,
): Promise<void> {
  const path = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/${encodeURIComponent(workflowFile)}/dispatches`;
  const res = await fetch(`https://api.github.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "copilot-agent-orchestrator",
    },
    body: JSON.stringify({ ref, inputs }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }
  // 204 No Content — no body to parse
}
```

### Error Codes

| Status | Meaning | Common Cause |
|--------|---------|-------------|
| 204 | Success | Dispatch accepted |
| 404 | Not Found | Workflow doesn't exist, repo not found, or insufficient permissions |
| 422 | Validation failed | `ref` doesn't exist, or inputs fail schema validation |

---

## 2. Getting the Run ID After Dispatch

The `workflow_dispatch` endpoint returns **204 No Content** with no body, no `Location` header — nothing to correlate the dispatch with its resulting run. This is a well-known GitHub API limitation.

### Approach Comparison

| Approach | Reliability | Race Condition Risk | Implementation |
|----------|------------|-------------------|----------------|
| **Timestamp correlation** | Medium | Concurrent dispatches collide | Low effort |
| **Unique input marker** | **High** | **None** | Medium effort (needs workflow YAML change) |
| **List runs + multi-filter** | Medium | Same as timestamp | Low effort |

### Recommended: Unique Input Marker

Pass a `correlation_id` UUID as a workflow input. After dispatch, poll runs and match on the input value. This is the **only race-condition-free approach**.

**Workflow YAML requirement:**

```yaml
on:
  workflow_dispatch:
    inputs:
      correlation_id:
        description: 'Unique ID for API correlation'
        required: false
        default: ''
```

**TypeScript implementation:**

```typescript
import { randomUUID } from 'node:crypto';

async function triggerAndGetRunId(
  token: string,
  owner: string,
  repo: string,
  workflowFile: string,
  ref: string,
  inputs: Record<string, string> = {},
): Promise<number> {
  const correlationId = randomUUID();
  const timestampBefore = new Date().toISOString();

  // 1. Dispatch with correlation_id
  await triggerWorkflowDispatch(token, owner, repo, workflowFile, ref, {
    ...inputs,
    correlation_id: correlationId,
  });

  // 2. Poll for the run (GitHub takes 2-10s to create the run)
  const maxAttempts = 15;
  const pollInterval = 2_000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, pollInterval));

    const params = new URLSearchParams({
      event: 'workflow_dispatch',
      created: `>=${timestampBefore}`,
      per_page: '10',
    });
    const runsPath = `/repos/${owner}/${repo}/actions/workflows/${workflowFile}/runs?${params}`;
    const runsRes = await fetch(`https://api.github.com${runsPath}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!runsRes.ok) continue;

    const { workflow_runs } = await runsRes.json();

    for (const run of workflow_runs) {
      // Get run details (includes inputs)
      const detailRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/runs/${run.id}`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } },
      );
      if (!detailRes.ok) continue;
      const detail = await detailRes.json();
      if (detail.inputs?.correlation_id === correlationId) {
        return run.id;
      }
    }
  }

  throw new Error(`Timed out waiting for workflow run (correlation: ${correlationId})`);
}
```

### Existing Pattern

The codebase already uses timestamp correlation in `scripts/orchestrator/trigger-and-wait-ci.ps1`:

```powershell
$startTime = (Get-Date).ToUniversalTime()
# trigger...
$recent = $runs | Where-Object { $_.createdAt -ge $startTime } | Select-Object -First 1
```

This is simpler but has collision risk with concurrent dispatches.

---

## 3. Monitoring Workflow Run Progress

### Get Run Status

```
GET /repos/{owner}/{repo}/actions/runs/{run_id}
```

### Run Statuses

| Status | Meaning |
|--------|---------|
| `queued` | Waiting for a runner |
| `in_progress` | Currently executing |
| `completed` | Finished — check `conclusion` |
| `waiting` | Waiting for approval/environment protection |
| `requested` | Run requested but not yet queued |
| `pending` | Pending processing |

### Run Conclusions

| Conclusion | Meaning |
|------------|---------|
| `success` | All jobs passed |
| `failure` | One or more jobs failed |
| `cancelled` | Run was cancelled |
| `skipped` | Run was skipped |
| `timed_out` | Run exceeded time limit |
| `action_required` | Requires manual approval |
| `stale` | Run became stale |
| `neutral` | Completed without pass/fail |
| `startup_failure` | Failed to start |

### Job-Level Monitoring

```
GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs
```

Returns `jobs[]` with `status`, `conclusion`, `name`, and `steps[]` (each step has its own `status`, `conclusion`, `name`). The existing `scripts/orchestrator/get-ci-failure-summary.ps1` uses this to extract failing jobs.

### TypeScript Polling Function

```typescript
interface RunResult {
  id: number;
  status: string;
  conclusion: string | null;
  html_url: string;
}

async function pollWorkflowRun(
  token: string,
  owner: string,
  repo: string,
  runId: number,
  options: { interval?: number; timeout?: number; onStatus?: (status: string) => void } = {},
): Promise<RunResult> {
  const { interval = 15_000, timeout = 1_200_000, onStatus } = options;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`;
  const start = Date.now();
  let lastStatus = '';

  while (Date.now() - start < timeout) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const run = (await res.json()) as RunResult;

    if (run.status !== lastStatus) {
      lastStatus = run.status;
      onStatus?.(run.status);
    }

    if (run.status === 'completed') return run;
    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error(`Timed out after ${timeout / 1000}s waiting for run ${runId}`);
}
```

**Recommended interval:** 30 seconds for budget-friendly monitoring.

---

## 4. Downloading Logs and Artifacts

### Workflow Run Logs

```
GET /repos/{owner}/{repo}/actions/runs/{run_id}/logs
```

Returns a `302` redirect to a temporary URL serving a **zip file**. The zip contains one text file per job step:

```
<job-name>/
  1_Set up job.txt
  2_Run actions/checkout@v4.txt
  3_Run npm ci.txt
```

Each line is timestamped: `2026-03-11T12:00:00.0000000Z [message]`.

### Artifacts

| Operation | Endpoint |
|-----------|----------|
| List artifacts | `GET /repos/{owner}/{repo}/actions/runs/{run_id}/artifacts` |
| Download artifact | `GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}/zip` |

Artifacts expire after 90 days by default. Download requires following a `302` redirect.

### TypeScript Example

```typescript
async function downloadRunLogs(
  token: string,
  owner: string,
  repo: string,
  runId: number,
): Promise<ArrayBuffer> {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/logs`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Download logs failed: ${res.status}`);
  return res.arrayBuffer(); // zip file contents
}

async function listRunArtifacts(
  token: string,
  owner: string,
  repo: string,
  runId: number,
): Promise<Array<{ id: number; name: string; size_in_bytes: number; expired: boolean }>> {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) throw new Error(`List artifacts failed: ${res.status}`);
  const data = await res.json();
  return data.artifacts;
}
```

---

## 5. PAT Permissions and Rate Limits

### Fine-Grained PAT Permissions

| Operation | Permission | Access Level |
|-----------|------------|-------------|
| Trigger dispatch | **Actions** | Read & Write |
| List/get workflow runs | **Actions** | Read |
| List/get run jobs | **Actions** | Read |
| Download logs | **Actions** | Read |
| List/download artifacts | **Actions** | Read |

**Minimum:** `actions:read` for all monitoring. `actions:write` only needed to trigger dispatch.

### Classic PAT Fallback

| Context | Scope |
|---------|-------|
| Public repos | `public_repo` |
| Private repos | `repo` |

### Rate Limits

| Limit Type | Value | Notes |
|------------|-------|-------|
| Primary (PAT) | 5,000 req/hour | Per authenticated user |
| Primary (GHEC) | 15,000 req/hour | Enterprise Cloud |
| Secondary — per minute | 900 points/min | GET=1pt, POST/PUT/DELETE=5pt |
| Secondary — content creation | 80/min, 500/hour | Dispatch counts as creation |
| Secondary — concurrent | 100 requests | Shared across REST + GraphQL |

### Polling Budget

| Scenario | Calculation | Result |
|----------|-------------|--------|
| Single run @ 15s polling | 240 req/hr | 4.8% of budget |
| Single run @ 30s polling | 120 req/hr | 2.4% of budget |
| Max concurrent @ 15s | 5,000 ÷ 240 | ~20 runs |
| Recommended safe limit | 50% headroom | **~10 concurrent runs** |

**Recommendation:** Poll at **30-second intervals** to leave headroom for dispatch + log/artifact downloads.

Use the `x-ratelimit-remaining` response header for adaptive polling — increase interval when budget is low.

---

## 6. `workflow_dispatch` vs `repository_dispatch` vs Webhooks

### Comparison

| Feature | `workflow_dispatch` | `repository_dispatch` | Webhooks |
|---------|--------------------|-----------------------|----------|
| Trigger target | Specific workflow | Any matching listener | N/A (receives events) |
| API endpoint | `.../workflows/{id}/dispatches` | `.../dispatches` | N/A |
| Payload | Flat string inputs (max 10) | Nested JSON `client_payload` (max 10 keys) | N/A |
| UI visibility | ✅ "Run workflow" button | ❌ API only | N/A |
| Multi-workflow | ❌ One workflow only | ✅ Multiple listeners | N/A |
| Returns run ID | ❌ | ❌ | ✅ (in payload) |
| PAT scope | `actions:write` | `contents:write` | N/A |
| Real-time status | Polling required | Polling required | Push-based |

### `repository_dispatch` Example

```bash
curl -X POST \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/OWNER/REPO/dispatches \
  -d '{"event_type":"orchestrate-stage","client_payload":{"goalId":"G1","stageIndex":4}}'
```

```yaml
on:
  repository_dispatch:
    types: [orchestrate-stage]
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - run: echo "${{ github.event.client_payload.goalId }}"
```

### Webhook-Based Monitoring

GitHub can push `workflow_run` events (status changes: `requested`, `in_progress`, `completed`) to a public HTTPS endpoint. This eliminates polling but:

- Requires a **publicly accessible endpoint** (or tunnel for local dev)
- Requires **webhook secret validation** (HMAC-SHA256)
- Only relevant for *monitoring* — doesn't help with triggering

**Hybrid approach:** Dispatch to trigger + webhook to monitor provides the best UX but adds infrastructure complexity.

### Recommendation

Per R3 findings, **direct REST API orchestration (Option A) is preferred** — the web app calls GitHub REST APIs directly to create issues, assign Copilot, monitor progress, and merge PRs. This eliminates the need for any dispatch mechanism.

If dispatch is ever needed (e.g., batch operations, long-running tasks that must survive server restarts), **`repository_dispatch` is preferred** over `workflow_dispatch` because:

1. Nested JSON payloads suit complex orchestration parameters
2. Multiple workflows can react to the same event type
3. No need to hardcode workflow file IDs

---

## Integration with Existing Codebase

### Existing Patterns

| Pattern | Location | Relevance |
|---------|----------|-----------|
| `githubFetch()` helper | `tools.ts` | Extend with `githubWrite()` for POST/PATCH |
| Timestamp correlation polling | `scripts/orchestrator/trigger-and-wait-ci.ps1` | Proven polling pattern, directly translatable |
| CI failure log extraction | `scripts/orchestrator/get-ci-failure-summary.ps1` | Uses `gh api` for job-level failure analysis |
| `workflow_dispatch` trigger | `deploy-app.yml`, `e2e-tests.yml` | Already configured on existing workflows |
| Label-based triggering | `deploy-ephemeral.yml`, `e2e-local.yml` | Alternative trigger pattern using `pull_request_target` |

### How This Fits R3's Architecture Decision

R3 concluded that **Option A (direct REST API)** is the recommended architecture — the web app uses `githubFetch()` / `githubWrite()` to orchestrate directly. This makes workflow dispatch a supplementary tool, not a core dependency. Specific use cases where dispatch might still be valuable:

1. **Long-running batch execution** — trigger a workflow that processes an entire milestone (survives server restarts)
2. **CI triggering** — already done via labels in the existing codebase
3. **Scheduled maintenance** — workflow_dispatch for manual operational tasks

---

## Decision: Ready for Implementation (as supplementary capability)

The R7 research confirms that workflow dispatch is **well-documented and straightforward** but has a meaningful limitation (no returned run ID). The recommended approach for this project:

1. **Primary orchestration:** Direct REST API (Option A from R3) — no dispatch needed
2. **CI triggering:** Continue using the existing label-based pattern
3. **Optional dispatch wrapper:** If needed later, use `repository_dispatch` with correlation IDs for reliable run tracking
4. **No additional dependencies needed** — standard `fetch()` is sufficient (no `@octokit/*` packages required)
