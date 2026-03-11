# R4: Copilot Coding Agent API

> **Status:** COMPLETE  
> **Date:** 2026-03-11  
> **Blocks:** Stage 5 (Execution Orchestration) — determines whether the web app can directly orchestrate Copilot  
> **Summary:** The Copilot coding agent has a **public REST API** for assignment, monitoring, review, and fix requests. All operations use standard GitHub REST endpoints with an additive `agent_assignment` field. No special REST feature flags are needed. The web app can fully orchestrate the coding agent using the user's fine-grained PAT.

---

## Findings Summary

| Operation | API Available | Method | Bot Identity |
|-----------|:------------:|--------|--------------|
| Assign agent to issue | ✅ | REST: `POST .../assignees` with `agent_assignment` | `copilot-swe-agent[bot]` |
| Create issue with agent | ✅ | REST: `POST .../issues` with `agent_assignment` | `copilot-swe-agent[bot]` |
| Monitor agent progress | ✅ | REST: Poll issue/PR timeline events | — |
| Request code review | ✅ | REST: `POST .../requested_reviewers` | `copilot-pull-request-reviewer[bot]` |
| Request PR fixes | ✅ | REST: Post `@copilot` comment on PR | — |
| Merge agent's PR | ✅ | REST: `PUT .../pulls/{n}/merge` | — |

**Key finding:** All Copilot coding agent operations are available via standard GitHub REST API. The `assign_copilot_to_issue` MCP tool used by the GitHub agent runtime is simply a wrapper around these REST endpoints. The web app can call them directly.

---

## 1. Assignment REST API — Complete Specification

### Endpoints

| Method | Endpoint | Use Case |
|--------|----------|----------|
| `POST` | `/repos/{owner}/{repo}/issues/{issue_number}/assignees` | Assign Copilot to existing issue |
| `POST` | `/repos/{owner}/{repo}/issues` | Create issue with Copilot assigned |
| `PATCH` | `/repos/{owner}/{repo}/issues/{issue_number}` | Update existing issue to assign Copilot |

All require headers: `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`.

### `agent_assignment` Parameter Schema

| Field | Type | Required | Default | Description |
|-------|------|:--------:|---------|-------------|
| `target_repo` | string | No | Issue's repo | `"OWNER/REPO"` where Copilot works |
| `base_branch` | string | No | Default branch | Branch Copilot branches from |
| `custom_instructions` | string | No | `""` | Extra context/constraints for the agent |
| `custom_agent` | string | No | `""` | Named custom agent from `.github/agents/` |
| `model` | string | No | `""` | AI model to use (depends on org policy) |

The `assignees` array must include `"copilot-swe-agent[bot]"`.

### Response

Standard GitHub Issue object. Key fields: `id`, `number`, `title`, `assignees[]`, `state`, `html_url`.

### Error Codes

| Code | Condition |
|------|-----------|
| 401 | Missing or invalid authentication |
| 403 | PAT lacks required permissions (or rate limited) |
| 404 | Repo or issue not found (also returned when PAT can't "see" the resource) |
| 422 | Agent not available (Copilot not enabled, invalid assignee, or invalid `agent_assignment` fields) |

### Code Example — Assign to Existing Issue

```typescript
async function assignCopilotToIssue(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  baseBranch = "main",
  instructions = ""
): Promise<unknown> {
  const res = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/assignees`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assignees: ["copilot-swe-agent[bot]"],
        agent_assignment: {
          target_repo: `${owner}/${repo}`,
          base_branch: baseBranch,
          custom_instructions: instructions,
          custom_agent: "",
          model: "",
        },
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Assign Copilot failed ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}
```

### GraphQL Alternative

Four mutations supported, all requiring header `GraphQL-Features: issues_copilot_assignment_api_support,coding_agent_model_selection`:

| Mutation | Use Case |
|----------|----------|
| `createIssue` | Create + assign in one call |
| `updateIssue` | Overwrite assignees on existing |
| `addAssigneesToAssignable` | Add Copilot while keeping existing assignees |
| `replaceActorsForAssignable` | Replace all assignees with Copilot |

GraphQL uses `agentAssignment` input with fields: `targetRepositoryId`, `baseRef`, `customInstructions`, `customAgent`, `model`. The bot's GraphQL `id` is discoverable via `repository.suggestedActors(capabilities: [CAN_BE_ASSIGNED])`.

**Recommendation:** Use REST API for simplicity. GraphQL adds feature flag complexity with no benefit for our use case.

---

## 2. Monitoring Agent Progress — Timeline Events

### Timeline Endpoint

```
GET /repos/{owner}/{repo}/issues/{issue_number}/timeline
```

Parameters: `per_page` (max 100, default 30), `page` (default 1).

### Event Types

| Event | Appears On | Meaning |
|-------|-----------|---------|
| `cross-referenced` | **Issue** timeline | Agent created a PR linking back to the issue |
| `copilot_work_started` | **PR** timeline | Agent began working |
| `copilot_work_finished` | **PR** timeline | Agent completed successfully |
| `copilot_work_finished_failure` | **PR** timeline | Agent failed |

**Critical:** Copilot work events appear on the **PR** timeline, not the issue timeline. Use the `cross-referenced` event on the issue timeline to discover the PR number.

### Event Schema Examples

**`cross-referenced` (issue timeline) — discover the PR:**
```json
{
  "event": "cross-referenced",
  "source": {
    "issue": {
      "number": 42,
      "title": "Implement feature X",
      "pull_request": {
        "url": "https://api.github.com/repos/OWNER/REPO/pulls/42",
        "html_url": "https://github.com/OWNER/REPO/pull/42"
      }
    }
  }
}
```

**`copilot_work_finished` (PR timeline) — agent done:**
```json
{
  "event": "copilot_work_finished",
  "created_at": "2026-03-11T10:05:30Z"
}
```

### Polling Strategy (Proven in Codebase)

| Setting | Value | Rationale |
|---------|-------|-----------|
| Poll interval | **20 seconds** | 180 calls/hr per issue — well within rate limits |
| Timeout | **30 minutes** | Configurable via env var; most tasks complete in 5-15 min |
| Rate budget | ~27 simultaneous issues | At 5,000 calls/hr authenticated limit |

**Two-phase polling loop:**

1. **Phase 1 — Find PR:** Poll *issue* timeline for `cross-referenced` event where `source.issue.pull_request` exists. Extract PR number.
2. **Phase 2 — Wait for completion:** Poll *PR* timeline for `copilot_work_finished` or `copilot_work_finished_failure`. The last matching event determines status.

### Draft PR Detection (Alternative Signal)

The agent creates PRs as **draft** while working, then marks them **non-draft** when done. Check via:

```
GET /repos/{owner}/{repo}/pulls/{pull_number}
```

When `response.draft` transitions `true → false`, the agent has finished. However, `copilot_work_finished` is the **authoritative** signal.

### No Webhook Alternative

There is no `copilot_work_*` webhook event type. Polling the timeline endpoint is the **only supported approach**.

---

## 3. Code Review — Bot Identity & API

### Bot Identity

| Bot Login | Context |
|-----------|---------|
| `copilot-pull-request-reviewer[bot]` | **Primary** — appears in completed reviews |
| `copilot-pull-request-review[bot]` | **Alternative** — seen in some API responses |

**Match both logins** for robustness (the existing `wait-for-review.ps1` already does this).

Copilot always leaves a `"COMMENTED"` review — **never** `"APPROVED"` or `"CHANGES_REQUESTED"`. This means Copilot reviews do not block merging and don't count toward required approvals.

### Request Review

```
POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers
```

```json
{
  "reviewers": ["copilot-pull-request-reviewer[bot]"]
}
```

Response: `201 Created` with full PR object.

### Monitor Review Completion

```
GET /repos/{owner}/{repo}/pulls/{pull_number}/reviews
```

Poll for reviews where `user.login` matches one of the bot names. Review always has `state: "COMMENTED"`.

### Review Response Schema

```json
{
  "id": 80,
  "user": { "login": "copilot-pull-request-reviewer[bot]", "type": "Bot" },
  "body": "Review summary...",
  "state": "COMMENTED",
  "submitted_at": "2026-03-11T10:10:00Z"
}
```

### Request Fix via @copilot Comment

```
POST /repos/{owner}/{repo}/issues/{pull_number}/comments
```

```json
{
  "body": "@copilot Please fix the following:\n1. Update error handling\n2. Add missing test"
}
```

**Works on PRs ✅ | Does NOT work on issues ❌** — for issues, use the assignee API.

### Code Example — Request & Monitor Review

```typescript
const COPILOT_REVIEWER_LOGINS = [
  "copilot-pull-request-reviewer[bot]",
  "copilot-pull-request-review[bot]",
];

async function requestCopilotReview(
  token: string, owner: string, repo: string, prNumber: number
): Promise<void> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        reviewers: ["copilot-pull-request-reviewer[bot]"],
      }),
    }
  );
  if (!res.ok) throw new Error(`Request review failed: ${res.status}`);
}

async function pollForCopilotReview(
  token: string, owner: string, repo: string, prNumber: number,
  intervalMs = 20_000, timeoutMs = 600_000
): Promise<{ body: string; hasActionableComments: boolean }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
      { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" } }
    );
    const reviews: Array<{ user: { login: string }; body: string; state: string }> = await res.json();
    const botReview = reviews.find(r => COPILOT_REVIEWER_LOGINS.includes(r.user.login));
    if (botReview) {
      const invalid = /wasn't able to review|couldn't review any files|unable to review/i.test(botReview.body);
      return { body: botReview.body, hasActionableComments: !invalid && botReview.body.length > 50 };
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Copilot review timeout after ${timeoutMs}ms`);
}
```

---

## 4. Agent Capabilities & Limitations

### Prerequisites

| Requirement | Details |
|-------------|---------|
| **Plan** | Copilot Pro, Pro+, Business, or Enterprise |
| **Admin enablement** | Business/Enterprise require admin policy enablement |
| **Repository** | Must be hosted on GitHub |
| **Branch rules** | "Require signed commits" blocks the agent (add Copilot as bypass actor via rulesets) |
| **Runners** | Uses GitHub-hosted Actions runners; self-hosted: Ubuntu x64 or Windows 64-bit only |
| **Write access** | Only users with write access can assign tasks |
| **Setup file** | `copilot-setup-steps.yml` recommended for pre-installing dependencies |

### Capabilities

- Fix bugs, implement features, improve test coverage, update docs, address tech debt
- Multi-file changes within a single repository
- Runs automated tests/linters in ephemeral Actions-powered environment
- Opens a draft PR, writes commit messages, PR title/body
- Iterates on PR comments via `@copilot` mentions
- Built-in security scanning (CodeQL, secret scanning, dependency advisory checks)
- Reads `.github/copilot-instructions.md`, `**/AGENTS.md`, instruction files
- Supports custom agents and MCP servers (GitHub MCP + Playwright MCP enabled by default)

### Limitations

| Limitation | Detail |
|------------|--------|
| Single repo only | Cannot make cross-repository changes |
| Single PR per task | One PR per assigned issue |
| Branch prefix | Can only push to `copilot/` prefixed branches |
| No merge/approve | Cannot merge PRs or mark them ready for review |
| Content exclusions | Does not honor Copilot content exclusion settings |
| Secrets access | Only `copilot` environment secrets — no org/repo Actions secrets |
| Internet access | Firewall-controlled sandbox; restricted outbound |
| Signed commits | Cannot comply with "Require signed commits" rule |
| Max image size | 3.00 MiB for attached screenshots |

### Model Options

- Model is selectable when starting a task (depends on entry point and org policy)
- Configured via org/enterprise policy under "Models" settings
- The `model` field in `agent_assignment` may not be publicly documented — test empirically

### Custom Agents

- Defined as Markdown files with YAML frontmatter in `.github/agents/`
- Can be selected via the `custom_agent` parameter in `agent_assignment`
- Inherit repository MCP servers by default; can restrict to specific tools
- Work with coding agent, Copilot CLI, and VS Code agent mode

### Best Practices for Issue Templates

- Clear problem description — treat the issue as an AI prompt
- Complete acceptance criteria ("include unit tests", "update README")
- Specify files that need to change
- Start with simpler tasks to calibrate expectations
- Add `.github/copilot-instructions.md` with build/test/lint commands
- Use `copilot-setup-steps.yml` to pre-install dependencies

---

## 5. PAT Permissions & API Status

### Fine-Grained PAT Permissions Required

| Permission | Access Level | Used For |
|-----------|:-----------:|----------|
| `metadata` | Read | Required baseline for all API access |
| `actions` | Read + Write | Trigger/monitor CI workflows |
| `contents` | Read + Write | Branch creation, file access |
| `issues` | Read + Write | Create/update issues, assign Copilot, read timeline |
| `pull_requests` | Read + Write | Request reviewers, merge PRs, monitor status |

Classic PAT: `repo` scope covers everything.

### API Version & Feature Flags

| API | Version/Flag Required |
|-----|----------------------|
| REST API | `X-GitHub-Api-Version: 2022-11-28` (standard — no special flag) |
| GraphQL API | Header: `GraphQL-Features: issues_copilot_assignment_api_support,coding_agent_model_selection` |

**REST API needs no feature flags.** The `agent_assignment` field is an additive, non-breaking change to existing endpoints.

### Preview Status

| Feature | Status |
|---------|--------|
| Copilot coding agent (overall) | **Public Preview** |
| Issue assignment via REST API | **Public Preview** (documented, subject to change) |
| Issue assignment via GraphQL | **Public Preview** (requires feature flag header) |
| Copilot code review request | **GA** (uses standard `requested_reviewers` API) |

### Error Behavior

| Scenario | HTTP Code | Notes |
|----------|:---------:|-------|
| PAT lacks permissions | 403 or 404 | GitHub returns 404 to hide resource existence |
| Copilot not enabled | 422 | `copilot-swe-agent[bot]` is not a valid assignee |
| No Copilot subscription | 422 | Agent bot not available |
| Rate limit exceeded | 403 or 429 | `Retry-After` header included |
| Invalid/expired PAT | 401 | `Bad credentials` message |

**Defensive pattern:** Before assigning, query `suggestedActors(capabilities: [CAN_BE_ASSIGNED])` via GraphQL to confirm Copilot is available — avoids cryptic 422 errors.

---

## 6. Integration with Existing Codebase

### What Exists Already

| Component | Pattern | Reuse For |
|-----------|---------|-----------|
| `githubFetch(token, path)` | GET helper in `tools.ts` | Extend to write helper |
| `wait-for-agent.ps1` | Two-phase polling (issue timeline → PR draft status) | Translate to TypeScript |
| `wait-for-review.ps1` | Poll PR reviews for bot login | Translate to TypeScript |
| `issue-lifecycle.agent.md` | Full lifecycle: assign → review → CI → merge | Blueprint for TypeScript execution service |
| SSE streaming | `/api/chat` endpoint in `server.ts` | New `/api/execute` endpoint |

### What This Research Enables

The complete API surface documented here enables building:

1. **`execution.ts`** — TypeScript execution service with:
   - `assignCopilotToIssue()` — assign via REST API
   - `pollForAgentCompletion()` — two-phase timeline polling
   - `requestCopilotReview()` — request review via REST API
   - `pollForCopilotReview()` — poll for review completion
   - `requestCopilotFix()` — post `@copilot` comment on PR
   - `executeIssue()` — full lifecycle loop for one issue

2. **`POST /api/execute`** — SSE endpoint for execution progress streaming

3. **PAT scope validation** — check user's PAT has required permissions before starting execution

---

## 7. Open Questions (To Verify During Implementation)

| Question | Priority | How to Verify |
|----------|:--------:|---------------|
| Exact reviewer bot login — `copilot-pull-request-reviewer[bot]` vs alternative | Medium | Test with real PR; match both for safety |
| Does `custom_agent` in REST `agent_assignment` reference `.github/agents/` files? | Low | Test with real issue and named agent |
| Rate limiting on rapid `agent_assignment` calls | Medium | Test with multiple quick assignments |
| Can review be requested before PR is non-draft? | Medium | Test timing |
| Exact 422 error messages when Copilot is not enabled | Low | Test with repo that lacks Copilot |
| Does `model` parameter actually work via REST API? | Low | Test with explicit model name |
| `copilot_work_*` event schema beyond `event` and `created_at` | Low | Inspect real timeline response |

---

## 8. Decision: Ready for Implementation

The Copilot coding agent has a **complete, public REST API** that covers every operation needed for web app orchestration:

- **Assignment:** `POST .../assignees` with `agent_assignment` body
- **Monitoring:** Timeline event polling (proven pattern from existing scripts)
- **Review:** Standard `requested_reviewers` endpoint
- **Fixes:** `@copilot` comments on PRs
- **Merge:** Standard PR merge endpoint

**No architectural blockers.** The web app can orchestrate the full issue lifecycle (assign → monitor → review → fix → merge) using REST API calls authenticated with the user's fine-grained PAT.

### Next Steps

1. Build `execution.ts` translating the patterns from `issue-lifecycle.agent.md` and `wait-for-agent.ps1` to TypeScript
2. Add PAT scope validation endpoint to warn users about missing permissions
3. Test each API call against a real repo to verify bot identities and error behavior
4. Build execution UI with SSE progress streaming
