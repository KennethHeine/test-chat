# R3: How to Bridge Web App → Agent Orchestration

> **Status:** COMPLETE  
> **Date:** 2026-03-11  
> **Blocks:** Stage 5 (Execution Orchestration Bridge)  
> **Summary:** The web app **can** orchestrate execution directly via GitHub REST API. GitHub has published public REST and GraphQL APIs for assigning the Copilot coding agent to issues (`copilot-swe-agent[bot]`) and requesting Copilot code review. This eliminates the need for a GitHub Actions workflow bridge. **Option A (direct REST API) is the recommended approach.**

---

## Critical Finding: Copilot Agent Has Public APIs

The biggest assumption in the original R3 question — that `assign_copilot_to_issue` is MCP-only — **is wrong**. GitHub has published documented REST and GraphQL APIs for Copilot coding agent assignment.

| Operation | API Available? | Method |
|-----------|---------------|--------|
| Assign Copilot to issue | ✅ **REST + GraphQL** | Assign `copilot-swe-agent[bot]` as issue assignee |
| Request Copilot code review | ✅ **REST** | Add Copilot as reviewer via standard requested_reviewers API |
| Request Copilot PR fixes | ✅ **REST** | Post `@copilot` comment on PR |
| Monitor agent progress | ✅ **REST** | Poll issue/PR timeline for `copilot_work_*` events |
| Monitor code review | ✅ **REST** | Poll PR reviews for bot reviewer |

**This means Option A (Web App Uses REST API Directly) is fully viable.** The web app can run the entire orchestration loop without GitHub Actions as a middleman.

---

## 1. Copilot Coding Agent Assignment via REST API

> Source: [GitHub Docs — Asking GitHub Copilot to create a pull request](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/create-a-pr)

### REST API Endpoints

Three REST endpoints support Copilot assignment:

#### Add assignee to existing issue

```
POST /repos/{owner}/{repo}/issues/{issue_number}/assignees
```

```json
{
  "assignees": ["copilot-swe-agent[bot]"],
  "agent_assignment": {
    "target_repo": "OWNER/REPO",
    "base_branch": "main",
    "custom_instructions": "",
    "custom_agent": "",
    "model": ""
  }
}
```

#### Create issue with Copilot assigned

```
POST /repos/{owner}/{repo}/issues
```

```json
{
  "title": "Implement feature X",
  "body": "## Context\n...\n## Acceptance Criteria\n...",
  "assignees": ["copilot-swe-agent[bot]"],
  "agent_assignment": {
    "target_repo": "OWNER/REPO",
    "base_branch": "stage-4/github-integration",
    "custom_instructions": "Follow existing patterns in tools.ts",
    "custom_agent": "",
    "model": ""
  }
}
```

#### Update existing issue to assign Copilot

```
PATCH /repos/{owner}/{repo}/issues/{issue_number}
```

```json
{
  "assignees": ["copilot-swe-agent[bot]"],
  "agent_assignment": {
    "target_repo": "OWNER/REPO",
    "base_branch": "main",
    "custom_instructions": "",
    "custom_agent": "",
    "model": ""
  }
}
```

### Agent Assignment Parameters

| Parameter | REST Key | GraphQL Key | Required | Description |
|-----------|----------|-------------|----------|-------------|
| Target repository | `target_repo` | `targetRepositoryId` | No | Repo where Copilot works (defaults to issue's repo) |
| Base branch | `base_branch` | `baseRef` | No | Branch to branch from (defaults to default branch) |
| Custom instructions | `custom_instructions` | `customInstructions` | No | Extra context for the agent |
| Custom agent | `custom_agent` | `customAgent` | No | Named custom agent (from `.github/agents/`) |
| Model | `model` | `model` | No | AI model to use |

### PAT Permissions Required

Fine-grained PAT needs:
- **Read access** to metadata
- **Read and write access** to actions, contents, issues, and pull requests

Classic PAT needs the `repo` scope.

### GraphQL API Alternative

```graphql
# Assign existing issue to Copilot
mutation {
  addAssigneesToAssignable(input: {
    assignableId: "ISSUE_ID",
    assigneeIds: ["BOT_ID"],
    agentAssignment: {
      targetRepositoryId: "REPOSITORY_ID",
      baseRef: "stage-4/github-integration",
      customInstructions: "Follow existing patterns",
      customAgent: "",
      model: ""
    }
  }) {
    assignable {
      ... on Issue {
        id
        title
        assignees(first: 10) { nodes { login } }
      }
    }
  }
}
```

**Required header:** `GraphQL-Features: issues_copilot_assignment_api_support,coding_agent_model_selection`

**Bot ID discovery:** Query `repository.suggestedActors(capabilities: [CAN_BE_ASSIGNED])` — the bot login is `copilot-swe-agent` and you need its GraphQL `id`.

---

## 2. Copilot Code Review via REST API

Copilot code review uses the **standard GitHub review request mechanism**:

### Request Review

```
POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers
```

Copilot appears as a reviewer in the standard "Reviewers" dropdown on pull requests. The review is requested the same way as any other reviewer. The identifier to use:

| Bot Name | Context |
|----------|---------|
| `copilot-pull-request-reviewer[bot]` | Appears in completed reviews |
| `copilot-pull-request-review[bot]` | Alternative name seen in some contexts |

### Monitor Review Completion

```
GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews
```

Poll for reviews where `user.login` matches one of the bot names above. The review always has type `"COMMENTED"` (never `"APPROVED"` or `"CHANGES_REQUESTED"`).

### Request PR Fixes via Comment

Posting `@copilot` as a comment on a **PR** (not an issue) triggers Copilot to make fixes:

```
POST /repos/{owner}/{repo}/issues/{pull_number}/comments
```

```json
{
  "body": "@copilot Please fix the following:\n1. Update error handling in line 42\n2. Add missing test for edge case"
}
```

**Important:** `@copilot` comments work on PRs but **NOT on issues**. For issues, use the assignee API above.

---

## 3. Monitoring Agent Progress via REST API

### Issue Timeline Events

```
GET /repos/{owner}/{repo}/issues/{issue_number}/timeline
```

Events to watch for:

| Event | Meaning |
|-------|---------|
| `cross-referenced` | Agent created a PR (find PR number in `source.issue.pull_request`) |
| `copilot_work_started` | Agent began working |
| `copilot_work_finished` | Agent completed successfully |
| `copilot_work_finished_failure` | Agent failed |

### Polling Pattern (proven in existing codebase)

The existing `wait-for-agent.ps1` script uses this exact pattern:

1. Poll issue timeline every **20 seconds** for `cross-referenced` event → find linked PR
2. Poll PR timeline for `copilot_work_finished` / `copilot_work_finished_failure`
3. Timeout after **30 minutes** (configurable)

### Rate Limit Budget

At 20-second polling intervals:
- 180 API calls/hour per monitored issue
- GitHub allows 5,000 calls/hour for authenticated requests
- **Budget:** Can monitor ~27 issues simultaneously before hitting rate limits
- For typical usage (1 issue at a time), this is well within limits

---

## 4. Architecture Evaluation: Three Options

### Option A: Web App Uses REST API Directly ✅ RECOMMENDED

```
┌─────────────────────────────────────────────────────────────┐
│ Browser                                                      │
│  └─ "Execute Milestone" button                              │
└──────────────┬──────────────────────────────────────────────┘
               │ POST /api/execute (SSE)
┌──────────────▼──────────────────────────────────────────────┐
│ Express Server (server.ts)                                   │
│  ├─ Create issues via REST API                              │
│  ├─ Assign Copilot via POST .../assignees                   │
│  ├─ Poll timeline for agent completion                      │
│  ├─ Request review via POST .../requested_reviewers         │
│  ├─ Poll for review completion                              │
│  ├─ Post @copilot fix comments if needed                    │
│  ├─ Trigger CI via label (existing pattern)                 │
│  ├─ Merge PR via PUT .../merge                              │
│  └─ Stream progress to browser via SSE                      │
└──────────────┬──────────────────────────────────────────────┘
               │ GitHub REST API (user's PAT)
┌──────────────▼──────────────────────────────────────────────┐
│ GitHub                                                       │
│  ├─ Issues, PRs, Reviews, Timeline Events                   │
│  └─ Copilot coding agent (runs in GitHub's infrastructure)  │
└─────────────────────────────────────────────────────────────┘
```

**Pros:**
- Single system — no Actions workflow bridge needed
- Real-time progress via existing SSE infrastructure
- User's PAT handles all auth (existing pattern)
- Full control over execution flow (pause, resume, skip, retry)
- Extends existing `githubFetch()` pattern from `tools.ts`
- Existing polling patterns from `scripts/orchestrator/` translate directly

**Cons:**
- Server must stay running during long execution chains (hours)
- Rate limiting at high concurrency (but fine for single-user)
- No crash recovery unless state is persisted (needs R5: persistent storage)

**Verdict:** Best option. Simplest architecture, reuses existing patterns, and now proven viable with Copilot REST APIs.

### Option B: Web App Triggers GitHub Actions Workflow

```
Web App → POST .../actions/workflows/orchestrator.yml/dispatches → Actions runs orchestrator
```

**Pros:**
- Orchestrator already exists as an agent
- Execution survives web app restarts
- Actions handles retries/timeouts

**Cons:**
- Requires creating a new `orchestrator.yml` workflow with `workflow_dispatch` inputs
- No real-time progress (must poll Actions run status + GitHub API)
- Can't pause/resume from web UI
- Two systems to maintain
- Dispatch API doesn't return run ID (must correlate via timestamp)

**Verdict:** Overcomplicated now that REST API is available. Would only make sense if the web app can't stay running long enough.

### Option C: Hybrid — Web App Does Setup, Actions Does Execution

```
Web App → Creates issues + milestones via REST → Triggers Actions → Polls for progress
```

**Pros:**
- Clean separation: planning in app, execution in Actions

**Cons:**
- All downsides of Option B plus additional complexity
- Data synchronization between two systems

**Verdict:** Not recommended. Option A is simpler and more capable.

---

## 5. Recommended Architecture: Option A Implementation Plan

### New REST API Write Helper

Extend the existing `githubFetch()` in `tools.ts` with a write variant:

```typescript
async function githubWrite(
  token: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "copilot-agent-orchestrator",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub API ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}
```

### New Execution Service (server-side)

```typescript
// Orchestration loop for one issue
async function executeIssue(token: string, owner: string, repo: string, issueNumber: number, baseBranch: string): Promise<ExecutionResult> {
  // 1. Assign Copilot to issue
  await githubWrite(token, "POST",
    `/repos/${owner}/${repo}/issues/${issueNumber}/assignees`,
    {
      assignees: ["copilot-swe-agent[bot]"],
      agent_assignment: { target_repo: `${owner}/${repo}`, base_branch: baseBranch }
    }
  );

  // 2. Poll for PR creation + agent completion
  const pr = await pollForAgentCompletion(token, owner, repo, issueNumber);

  // 3. Request Copilot code review
  await githubWrite(token, "POST",
    `/repos/${owner}/${repo}/pulls/${pr.number}/requested_reviewers`,
    { reviewers: ["copilot-pull-request-reviewer[bot]"] }
    // Note: reviewer identity may need testing — see Open Questions
  );

  // 4. Poll for review completion
  const review = await pollForReviewCompletion(token, owner, repo, pr.number);

  // 5. If review has actionable comments, post @copilot fix request
  if (review.hasActionableComments) {
    await githubWrite(token, "POST",
      `/repos/${owner}/${repo}/issues/${pr.number}/comments`,
      { body: `@copilot Please address the review comments:\n${review.commentSummary}` }
    );
    await pollForAgentCompletion(token, owner, repo, issueNumber);
  }

  // 6. Merge PR
  await githubWrite(token, "PUT",
    `/repos/${owner}/${repo}/pulls/${pr.number}/merge`,
    { merge_method: "squash" }
  );

  return { issueNumber, prNumber: pr.number, status: "merged" };
}
```

### New SSE Execution Endpoint

```typescript
// POST /api/execute — SSE stream of execution progress
app.post("/api/execute", async (req, res) => {
  // SSE headers (same pattern as /api/chat)
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const { owner, repo, milestoneId, issues } = req.body;

  for (const issue of issues) {
    res.write(`data: ${JSON.stringify({ type: "issue-start", issueNumber: issue.number })}\n\n`);

    try {
      const result = await executeIssue(token, owner, repo, issue.number, baseBranch);
      res.write(`data: ${JSON.stringify({ type: "issue-complete", ...result })}\n\n`);
    } catch (err) {
      res.write(`data: ${JSON.stringify({ type: "issue-error", issueNumber: issue.number, error: err.message })}\n\n`);
      // Escalate to user — pause execution
      res.write(`data: ${JSON.stringify({ type: "escalation", message: "Issue failed — waiting for user decision" })}\n\n`);
      break;
    }
  }

  res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
  res.end();
});
```

---

## 6. Integration with Existing Codebase

### Existing Patterns to Reuse

| Pattern | Source | Reuse For |
|---------|--------|-----------|
| `githubFetch(token, path)` | `tools.ts` | Extend to `githubWrite()` |
| SSE streaming | `server.ts` `/api/chat` endpoint | New `/api/execute` endpoint |
| Event cleanup with unsubscribers | `server.ts` chat handler | Execution cleanup on abort |
| `request.kind === "custom-tool"` permission | `server.ts` `safePermissionHandler` | Permission for execution tools |
| Timeline polling | `scripts/orchestrator/wait-for-agent.ps1` | Translate to TypeScript |
| Review polling | `scripts/orchestrator/wait-for-review.ps1` | Translate to TypeScript |
| CI trigger via labels | `scripts/orchestrator/trigger-ci-label.ps1` | REST API equivalent |

### What Changes

| Component | Change |
|-----------|--------|
| `tools.ts` | Export `githubWrite()` helper; add write tools (create_issue, assign_copilot, etc.) |
| `server.ts` | Add `/api/execute` SSE endpoint; add `/api/execute/abort` endpoint |
| `public/app.js` | Add execution UI — start button, progress feed, pause/resume controls |
| New: `execution.ts` | Execution orchestration logic (issue loop, polling, error handling) |
| R5 dependency | Execution state must be persisted for crash recovery |

### Token Scope Requirements

Existing users may need to upgrade their fine-grained PAT permissions:

| Current Permissions | Additional Needed |
|--------------------|-------------------|
| (varies per user) | **actions**: read+write |
| | **contents**: read+write |
| | **issues**: read+write |
| | **pull_requests**: read+write |
| | **metadata**: read |

The web UI should check permissions and prompt users to create a new PAT with the required scopes.

---

## 7. Open Questions (to verify during implementation)

| Question | Impact | How to Verify |
|----------|--------|---------------|
| Exact reviewer identity for Copilot code review via REST API | May need `copilot-pull-request-reviewer[bot]` or a team slug | Test with real PR |
| Does `agent_assignment.custom_agent` work with agents in `.github/agents/`? | Could use custom orchestrator agent | Test with real issue |
| Rate limiting on `agent_assignment` endpoints | May have secondary rate limits for agent assignment | Test with multiple rapid assignments |
| Can review request be made before PR is non-draft? | Affects timing of review request | Test with real PR |
| REST API feature flag status | Documented as "public preview" — may change | Monitor GitHub changelog |
| Does `copilot-swe-agent[bot]` login work with fine-grained PATs? | PAT scope validation | Test with minimal-scope PAT |

---

## 8. Decision: Option A — Direct REST API

### Recommendation

**Use Option A: Web App Uses REST API Directly.**

The discovery that GitHub has public REST APIs for Copilot coding agent assignment **eliminates the need for a GitHub Actions workflow bridge**. The web app can:

1. Create issues and milestones (R1 — already researched)
2. Assign Copilot coding agent to issues (this research)
3. Monitor agent progress via timeline events (proven pattern)
4. Request Copilot code review (standard review request API)
5. Post fix requests via `@copilot` comments
6. Trigger CI via labels (existing pattern)
7. Merge PRs (standard merge API)
8. Stream all progress to the browser via SSE (existing pattern)

### What This Enables

- **Stage 5** can be built as a set of REST API tools + an execution endpoint
- **No new infrastructure** — reuses Express server, SSE, and user PATs
- **No GitHub Actions dependency** — the web app is fully self-contained
- **Existing orchestrator agents** become optional — useful for CLI/GitHub-native workflows but not required for web app execution

### What This Also Answers (R4)

This research **also resolves R4** (Copilot Coding Agent API):
- `assign_copilot_to_issue` **is available** as a REST API via standard issue assignee endpoints
- The bot login is `copilot-swe-agent[bot]`
- The `agent_assignment` body field controls base branch, custom instructions, and model selection
- GraphQL alternative exists with `addAssigneesToAssignable` mutation (requires feature flag header)

### Next Steps

1. **Implement `githubWrite()` helper** in `tools.ts` (R1 already documented the endpoints)
2. **Test Copilot assignment** via REST API against a real repo
3. **Test Copilot review request** via REST API to confirm reviewer identity
4. **Build `execution.ts`** with the orchestration loop (translate PowerShell patterns to TypeScript)
5. **Resolve R5** (persistent storage) for execution state crash recovery
6. **Build execution UI** in `public/app.js`
