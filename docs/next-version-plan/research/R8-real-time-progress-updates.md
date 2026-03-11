# R8: Real-Time Progress Updates

> **Status:** COMPLETE  
> **Date:** 2026-03-11  
> **Blocks:** Stage 5 UX (Execution visibility for autonomous agent chains)  
> **Summary:** The web app should use **polling + SSE** for real-time execution progress. An async polling loop on the Express server feeds GitHub API status into an SSE stream to the browser using the existing `/api/chat` pattern. Webhooks are optional and additive — they reduce latency but add infrastructure complexity. Execution state must be persisted for crash recovery.

---

## Findings Summary

| Approach | Latency | Complexity | Rate Limit Cost | Recommendation |
|----------|---------|------------|-----------------|----------------|
| **Polling + SSE** | 10–30s | Low | ~540 req/hr/issue | **Primary — use this** |
| **Webhooks + SSE** | ~1–3s | Moderate | 0 req/hr | **Optional enhancement** |
| **Actions artifacts** | Minutes | High | Moderate | **Not recommended** |
| **Polling only (client)** | 10–30s | Low | Duplicated per browser tab | **Not recommended** |

**Decision: Polling + SSE (Option 1) is the primary approach.** It extends existing codebase patterns, requires no new infrastructure, and supports crash recovery. Webhooks can be layered on later to reduce latency.

---

## 1. Polling Approach: Endpoints & Rate Limits

### GitHub REST API Endpoints for Progress Monitoring

| Endpoint | Method | Returns | Rate Limit Cost |
|----------|--------|---------|-----------------|
| `/repos/{o}/{r}/issues/{n}/timeline` | GET | Timeline events (cross-referenced, copilot_work_*, labeled) | 1 req (paginated) |
| `/repos/{o}/{r}/pulls/{n}/reviews` | GET | Reviews with `user.login`, `state`, `submitted_at` | 1 req/page |
| `/repos/{o}/{r}/pulls/{n}/comments` | GET | Review-level inline comments | 1 req/page |
| `/repos/{o}/{r}/actions/runs?branch={b}&per_page=5` | GET | Workflow runs with `status`, `conclusion` | 1 req |
| `/repos/{o}/{r}/commits/{ref}/check-runs` | GET | Check runs (CI status per commit) | 1 req/page |
| `/repos/{o}/{r}/commits/{ref}/status` | GET | Combined commit status | 1 req |
| `/rate_limit` | GET | Rate limit remaining/reset | **0 cost** |

### Copilot-Specific Timeline Events

| Event | Appears On | Meaning |
|-------|-----------|---------|
| `cross-referenced` | Issue timeline | PR linked to issue (`.source.issue.pull_request` present) |
| `copilot_work_started` | PR timeline | Copilot agent began working |
| `copilot_work_finished` | PR timeline | Agent completed successfully |
| `copilot_work_finished_failure` | PR timeline | Agent failed |

These events are not documented in public GitHub REST API docs — they are discovered empirically and confirmed by the existing polling scripts.

### Rate Limit Budget

- **GitHub PAT limit:** 5,000 requests/hour
- **Per issue, full poll cycle** (20s interval): ~3 endpoints × 180 polls/hr = **540 req/hr/issue**
- **Reserve ~500 req/hr** for other API calls (creating issues, merging PRs, etc.)

| Polling Interval | Max Concurrent Issues | Budget Used |
|------------------|-----------------------|-------------|
| 30s (conservative) | 13 | ~4,680/hr |
| 20s (balanced) | 8 (with 500 reserve) | ~4,320/hr |
| 15s (aggressive) | 6 (with 500 reserve) | ~4,320/hr |
| Adaptive (30s idle / 15s active) | ~12 | ~4,500/hr |

**Recommended: Adaptive polling.** Start at 30s; decrease to 15s once `copilot_work_started` detected; increase to 60s for idle issues with no PR linked yet.

### TypeScript Polling Function

```typescript
const COPILOT_EVENTS = [
  'copilot_work_started',
  'copilot_work_finished',
  'copilot_work_finished_failure',
] as const;

interface PollState {
  issueNumber: number;
  prNumber: number | null;
  status: 'waiting_for_pr' | 'agent_working' | 'agent_done' | 'agent_failed' | 'review_done';
  lastEvent: string | null;
}

async function pollIssueProgress(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  onProgress: (state: PollState) => void,
  signal: AbortSignal,
  intervalMs = 20_000,
): Promise<PollState> {
  const state: PollState = {
    issueNumber, prNumber: null, status: 'waiting_for_pr', lastEvent: null,
  };

  while (!signal.aborted) {
    // Step 1: Find linked PR via cross-reference
    if (!state.prNumber) {
      const events = await githubFetch(token,
        `/repos/${owner}/${repo}/issues/${issueNumber}/timeline?per_page=100`
      ) as any[];
      const crossRef = events
        .filter((e: any) => e.event === 'cross-referenced' && e.source?.issue?.pull_request)
        .pop();
      if (crossRef) state.prNumber = crossRef.source.issue.number;
    }

    if (state.prNumber) {
      // Step 2: Check Copilot work events on PR timeline
      const prEvents = await githubFetch(token,
        `/repos/${owner}/${repo}/issues/${state.prNumber}/timeline?per_page=100`
      ) as any[];
      const copilotEvent = prEvents
        .filter((e: any) => COPILOT_EVENTS.includes(e.event))
        .pop();

      if (copilotEvent?.event === 'copilot_work_finished') {
        state.status = 'agent_done';
      } else if (copilotEvent?.event === 'copilot_work_finished_failure') {
        state.status = 'agent_failed';
        onProgress(state);
        return state;
      } else if (copilotEvent?.event === 'copilot_work_started') {
        state.status = 'agent_working';
      }
    }

    onProgress(state);
    if (state.status === 'agent_done') return state;

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return state;
}
```

---

## 2. Webhooks: Optional Enhancement

### Relevant Webhook Events

| Event | Trigger | Key Payload Fields |
|-------|---------|-------------------|
| `issues` | Issue opened/closed/labeled/assigned | `action`, `issue.number`, `issue.state`, `issue.labels` |
| `pull_request` | PR opened/closed/merged/review_requested | `action`, `pull_request.number`, `pull_request.merged` |
| `pull_request_review` | Review submitted/dismissed | `action`, `review.state`, `pull_request.number` |
| `workflow_run` | Workflow starts/completes | `action`, `workflow_run.conclusion`, `workflow_run.name` |
| `check_suite` | Suite of checks completes | `action`, `check_suite.conclusion` |

### Security Requirements

| Requirement | Detail |
|-------------|--------|
| Shared secret | Random ≥32 chars, stored as `WEBHOOK_SECRET` env var |
| Signature verification | `X-Hub-Signature-256` + `crypto.timingSafeEqual` |
| HTTPS required | GitHub rejects HTTP endpoints |
| Raw body for HMAC | Must use `express.raw()` on webhook route (not `express.json()`) |
| Replay protection | Use `X-GitHub-Delivery` UUID to deduplicate |

### Express Webhook Handler

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET!;

// Use express.raw() to preserve exact bytes for HMAC verification
app.post("/api/webhooks/github",
  express.raw({ type: "application/json" }),
  (req: Request, res: Response) => {
    const signature = req.headers["x-hub-signature-256"] as string | undefined;
    if (!signature) { res.status(401).send("Missing signature"); return; }

    const expected = "sha256=" + createHmac("sha256", WEBHOOK_SECRET)
      .update(req.body)
      .digest("hex");

    const sig = Buffer.from(signature);
    const exp = Buffer.from(expected);
    if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) {
      res.status(403).send("Invalid signature");
      return;
    }

    const event = req.headers["x-github-event"] as string;
    const payload = JSON.parse(req.body.toString());

    // Relay to connected SSE execution streams
    broadcastExecutionEvent(event, payload);
    res.status(200).send("ok");
  }
);
```

### Polling vs Webhooks Comparison

| Aspect | Polling | Webhooks |
|--------|---------|----------|
| Latency | 10–30s | ~1–3s |
| API quota cost | ~540 req/hr/issue | 0 |
| Complexity | Low | Moderate |
| Infrastructure | None additional | Webhook registration per repo, secret management |
| Scale-to-zero | Compatible | Problematic (cold start may miss 10s timeout) |
| Offline gaps | Catches up on next poll | Missed after 3 retries |
| Multi-repo | Works with any repo PAT has access to | Must register per repo |
| Setup effort | None | Register webhooks per repo (API or UI) |

**Recommendation:** Start with polling. Add webhooks later when latency reduction justifies the setup cost. Webhooks can replace some polling to reduce API quota usage.

---

## 3. SSE Bridge Architecture

### Architecture

```
┌──────────────┐    POST /api/execute     ┌──────────────────────┐
│              │ ──────────────────────── │   Express Server     │
│   Browser    │ ◄─── SSE event stream ── │                      │
│  (fetch +    │                          │  ┌────────────────┐  │
│   reader)    │    POST /api/execute/    │  │ ExecutionLoop  │  │
│              │ ────── abort ──────────► │  │  (async fn)    │  │
└──────────────┘                          │  └───────┬────────┘  │
                                          │          │ for each  │
                                          │          │ issue     │
                                          │  ┌───────▼────────┐  │
                                          │  │ Poll GitHub API │◄── 20s interval
                                          │  │  /timeline      │  │
                                          │  │  /pulls         │  │
                                          │  │  /check-runs    │  │
                                          │  └───────┬────────┘  │
                                          │          │            │
                                          │          ▼            │
                                          │  res.write(SSE event) │
                                          └──────────────────────┘
```

### SSE Event Type Definitions

| Event Type | Payload Fields | When Emitted |
|---|---|---|
| `issue-start` | `issueNumber`, `title`, `index`, `total` | Issue execution begins |
| `agent-assigned` | `issueNumber` | Copilot agent assigned |
| `agent-working` | `issueNumber`, `prNumber`, `elapsed` | Poll confirms agent active |
| `pr-created` | `issueNumber`, `prNumber`, `prUrl` | PR linked to issue detected |
| `agent-complete` | `issueNumber`, `prNumber` | `copilot_work_finished` detected |
| `review-requested` | `prNumber` | Code review requested |
| `review-complete` | `prNumber`, `state` | Review submitted |
| `ci-running` | `prNumber`, `runId` | CI workflow detected |
| `ci-result` | `prNumber`, `conclusion` | CI passed/failed |
| `merge-complete` | `issueNumber`, `prNumber` | PR merged |
| `issue-complete` | `issueNumber`, `result` | Issue fully processed |
| `issue-error` | `issueNumber`, `error`, `recoverable` | Error during processing |
| `escalation` | `issueNumber`, `reason`, `options[]` | Needs user decision |
| `heartbeat` | `timestamp` | Every 30s (keep-alive) |
| `checkpoint` | `milestoneId`, `completedIssues[]`, `cursor` | Recovery bookmark |
| `done` | `milestoneId`, `summary` | All issues processed |

### Server-Side: Async Generator Pattern

The recommended pattern is **async generator + AbortSignal**, which matches the sequential issue-by-issue flow and is naturally cancellable:

```typescript
app.post("/api/execute", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) { res.status(401).json({ error: "Missing token" }); return; }

  const { owner, repo, milestoneId, issues, cursor = 0 } = req.body;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const ac = new AbortController();
  req.on("close", () => ac.abort());

  const emit = (event: Record<string, unknown>) =>
    res.write(`data: ${JSON.stringify(event)}\n\n`);

  // Heartbeat prevents proxy/LB timeout (Azure Container Apps: 240s default)
  const heartbeat = setInterval(
    () => emit({ type: "heartbeat", timestamp: Date.now() }),
    30_000
  );

  try {
    const remaining = issues.slice(cursor);
    for (let i = 0; i < remaining.length; i++) {
      if (ac.signal.aborted) break;
      const issue = remaining[i];
      emit({ type: "issue-start", issueNumber: issue.number,
             title: issue.title, index: cursor + i, total: issues.length });

      await executeIssuePipeline(token, owner, repo, issue.number, emit, ac.signal);

      // Checkpoint after each issue for crash recovery
      emit({ type: "checkpoint", milestoneId,
        completedIssues: issues.slice(0, cursor + i + 1).map((x: any) => x.number),
        cursor: cursor + i + 1 });
    }
    emit({ type: "done", milestoneId, summary: { total: issues.length } });
  } catch (err: any) {
    if (!ac.signal.aborted) {
      emit({ type: "issue-error", error: err.message, recoverable: false });
    }
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});
```

### Client-Side: Extending Existing Pattern

Uses the same `fetch` + `ReadableStream.getReader()` pattern from the existing chat SSE consumer:

```javascript
async function streamExecution(milestoneId, issues, owner, repo, cursor = 0) {
  const controller = new AbortController();
  const res = await fetch("/api/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ owner, repo, milestoneId, issues, cursor }),
    signal: controller.signal,
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const event = JSON.parse(line.slice(6));
      handleExecutionEvent(event);      // dispatch to UI
      if (event.type === "checkpoint")
        saveCheckpoint(event);           // persist to localStorage
    }
  }

  return { abort: () => controller.abort() };
}
```

---

## 4. Connection Resilience & Crash Recovery

### Recovery Scenarios

| Scenario | Lost State | Recovery Strategy |
|----------|-----------|-------------------|
| **Browser tab closed** | SSE stream | `req.on("close")` → abort polling. On reopen, read checkpoint from localStorage, POST `/api/execute` with `cursor` |
| **Network drop** | SSE stream | Client detects heartbeat miss (>45s), reconnects with last `cursor` |
| **Server restart** | In-memory polling | Load `ExecutionRun` from storage; resume from persisted step per issue |
| **Rate limit hit** | None (step unchanged) | Increment retryCount, exponential backoff, resume same step |
| **Agent failure** | Agent session | Set `lastError`; retry if `retryCount < 3`; escalate to user otherwise |
| **Proxy timeout** | SSE stream | 30s heartbeats prevent idle timeout (Azure Container Apps: 240s) |

### Execution State Model

Minimal state needed for crash recovery:

```typescript
type ExecutionStep =
  | 'assign_agent' | 'wait_pr' | 'request_review'
  | 'wait_review' | 'fix_review' | 'wait_ci' | 'merge'
  | 'done' | 'failed';

interface ExecutionState {
  goalId: string;
  milestoneId: string;
  issueId: string;
  githubIssueNumber: number;
  step: ExecutionStep;
  retryCount: number;
  prNumber?: number;
  updatedAt: string;
  lastError?: string;
}

interface ExecutionRun {
  id: string;
  goalId: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
  issues: Record<string, ExecutionState>;
  createdAt: string;
  updatedAt: string;
}
```

### Azure Table Storage Design

| Property | Value |
|----------|-------|
| Table name | `executionruns` |
| PartitionKey | `tokenHash` (same pattern as sessions) |
| RowKey | `runId` |
| Data | `ExecutionRun` serialized as JSON |

State is persisted **on every step transition** (not polling ticks) — approximately 7 writes per issue.

### Resume Protocol

1. **On server start:** Scan `executionruns` for `status === 'running'`. Resume polling loops.
2. **On SSE connect:** Client sends `runId`. Server pushes full state snapshot, then streams deltas.
3. **On step completion:** Update `ExecutionState.step`, reset `retryCount`, persist, emit SSE event.
4. **Idempotency:** Each step checks actual GitHub state before acting (e.g., `wait_pr` detects existing PR).

---

## 5. Frontend Execution Progress UI

### UI Components

| Component | Purpose |
|-----------|---------|
| **View Tabs** | Toggle between Chat and Execution views |
| **Summary Header** | "3/8 issues merged · Milestone 1 of 3" |
| **Milestone Accordion** | Collapsible section per milestone with progress bar |
| **Issue Card** | Title, current step, status badge |
| **Step Pipeline** | Horizontal: assigned → working → PR → review → CI → merged |
| **Event Log** | Scrollable timeline of events with timestamps |
| **Control Bar** | Pause / Resume / Skip / Abort buttons |
| **Escalation Banner** | Inline banner when user decision needed |

### User Interactions

| Action | API Call |
|--------|----------|
| Click **Execution** tab | `GET /api/execution/:runId` (load state) |
| Click **Pause** | `POST /api/execution/pause` |
| Click **Resume** | `POST /api/execution/resume` |
| Click **Skip** | `POST /api/execution/skip` |
| Click **Abort** | `POST /api/execution/abort` |
| Escalation **Retry** | `POST /api/execution/escalation/:id/retry` |
| Escalation **Skip** | `POST /api/execution/escalation/:id/skip` |

### Event-to-UI Mapping

| SSE Event | UI Element Updated | Visual Change |
|-----------|--------------------|---------------|
| `issue-start` | Issue card | New card appears with "assigned" step active |
| `agent-working` | Step pipeline | "working" step highlighted blue |
| `pr-created` | Step pipeline | "PR" step highlighted blue |
| `review-complete` | Step pipeline | "review" step turns green |
| `ci-result` | Step pipeline | "CI" step turns green/red |
| `merge-complete` | Issue card + summary counter | Card turns green, counter increments |
| `issue-error` | Issue card + escalation banner | Card turns red, banner appears |
| `escalation` | Escalation banner | Decision buttons rendered |
| `done` | Summary header | Shows "Complete" state |

### HTML Structure Sketch

```html
<div id="view-tabs" style="display:none">
  <button class="view-tab active" data-view="chat">Chat</button>
  <button class="view-tab" data-view="execution">Execution</button>
</div>

<div id="execution-panel" style="display:none">
  <div id="exec-summary">
    <span id="exec-status-badge" class="exec-badge running">Running</span>
    <span id="exec-progress-text">0/0 issues merged</span>
  </div>

  <div id="exec-milestones">
    <div class="exec-milestone" data-milestone-id="">
      <div class="exec-milestone-header">
        <span class="exec-milestone-name">#1 — Milestone Name</span>
        <span class="exec-milestone-progress">0/3</span>
      </div>
      <div class="exec-milestone-body">
        <div class="exec-issue-card" data-issue-id="">
          <div class="exec-issue-title">Issue title</div>
          <div class="exec-step-pipeline">
            <span class="exec-step done">assigned</span>
            <span class="exec-step active">working</span>
            <span class="exec-step">PR</span>
            <span class="exec-step">review</span>
            <span class="exec-step">CI</span>
            <span class="exec-step">merged</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div id="exec-event-log"></div>

  <div id="exec-control-bar">
    <button id="exec-pause-btn">Pause</button>
    <button id="exec-resume-btn" style="display:none">Resume</button>
    <button id="exec-skip-btn">Skip Issue</button>
    <button id="exec-abort-btn">Abort</button>
  </div>
</div>
```

---

## 6. Integration with Existing Codebase

### Patterns to Reuse

| Pattern | Source | Reuse For |
|---------|--------|-----------|
| `githubFetch(token, path)` | [tools.ts](../../tools.ts) | All GitHub API polling calls |
| SSE headers + `res.write()` | [server.ts](../../server.ts) `/api/chat` | New `/api/execute` endpoint |
| `req.on("close", cleanup)` | [server.ts](../../server.ts) chat handler | Abort polling on disconnect |
| `fetch` + `getReader()` SSE parsing | [public/app.js](../../public/app.js) `sendMessage()` | Execution stream consumer |
| Timeline polling (20s interval) | [wait-for-agent.ps1](../../scripts/orchestrator/wait-for-agent.ps1) | Translate to TypeScript |
| Review polling | [wait-for-review.ps1](../../scripts/orchestrator/wait-for-review.ps1) | Translate to TypeScript |
| CI label trigger | [trigger-ci-label.ps1](../../scripts/orchestrator/trigger-ci-label.ps1) | REST API equivalent |
| Azure Table Storage | [storage.ts](../../storage.ts) | Execution state persistence |

### New Components Needed

| Component | Description |
|-----------|-------------|
| `execution.ts` | Execution loop: issue pipeline, polling, state management |
| `/api/execute` endpoint | SSE streaming execution (in `server.ts`) |
| `/api/execute/abort` endpoint | Abort execution (in `server.ts`) |
| `/api/execution/:id` endpoint | Get execution state for reconnection |
| Execution UI in `public/app.js` | View tabs, issue cards, step pipeline, control bar |
| Execution styles in `public/index.html` | CSS for execution panel components |

---

## 7. Recommended Implementation Order

1. **Polling functions** — translate `wait-for-agent.ps1` and `wait-for-review.ps1` to TypeScript in `execution.ts`
2. **`POST /api/execute` SSE endpoint** — async loop emitting events (reuse `/api/chat` SSE pattern)
3. **Execution state persistence** — extend Azure Table Storage for `ExecutionRun` (depends on R5)
4. **Frontend execution panel** — view tabs, issue cards, step pipeline, event log
5. **Control endpoints** — pause, resume, skip, abort
6. **Connection resilience** — heartbeat, checkpoint, reconnection with cursor
7. **Webhooks (optional)** — add later to reduce polling latency and API quota usage

---

## 8. Decision: Polling + SSE (Primary), Webhooks (Optional Enhancement)

### Why Polling + SSE

- **Extends existing patterns** — same `githubFetch`, same SSE streaming, same `fetch` + reader
- **No new infrastructure** — no webhook registration, no secret management, no public endpoint concerns
- **Crash recoverable** — persisted execution state + checkpoints enable resume from any point
- **Rate limits are sufficient** — 8+ concurrent issues at 20s polling within 5,000 req/hr
- **Scale-to-zero compatible** — polling is server-initiated, not dependent on incoming webhook delivery

### When to Add Webhooks

Add webhooks when:
- Latency improvement from 20s → 1s justifies the setup cost
- Multiple repos are monitored simultaneously (saves API quota)
- The app scales beyond single-user (webhook-driven is more efficient at scale)

### What This Enables

- The `/api/execute` endpoint can be built immediately using polling
- The frontend gets real-time visibility into 7-step issue lifecycle
- Users can pause/resume/abort long-running execution chains
- Server crashes are recoverable via persisted state + idempotent GitHub API calls
