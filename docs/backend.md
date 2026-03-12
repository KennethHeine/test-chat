# Backend Documentation

The backend is a single Express.js server written in TypeScript (`server.ts`), executed directly via `tsx` without a compile step. It manages per-user Copilot clients, sessions, custom tools, and streams responses as SSE.

## Files

| File | Purpose |
|------|---------|
| `server.ts` | Express backend — API routes, SDK integration, SSE streaming |
| `tools.ts` | GitHub API tools factory — 9 tools bound to user's token (read + write) |
| `storage.ts` | Storage abstraction — Azure Table/Blob + in-memory fallback for sessions |
| `planning-types.ts` | Planning data model interfaces — `Goal`, `ResearchItem`, `Milestone`, `IssueDraft`, `FileRef` |
| `planning-store.ts` | `PlanningStore` interface + `InMemoryPlanningStore` + `AzurePlanningStore` implementations |
| `planning-tools.ts` | Planning tools factory — 12 tools for goal definition, research, milestones, and issue drafts |

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | None | Health check — returns server status, connected clients, active sessions, storage backend |
| `GET` | `/api/models` | Bearer token | Lists available AI models from the Copilot SDK |
| `GET` | `/api/sessions` | Bearer token | Lists all sessions for the authenticated user |
| `DELETE` | `/api/sessions/:id` | Bearer token | Deletes a session and its messages |
| `GET` | `/api/sessions/:id/messages` | Bearer token | Gets chat messages for a session |
| `PUT` | `/api/sessions/:id/messages` | Bearer token | Saves chat messages for a session |
| `POST` | `/api/chat` | Bearer token | Sends a chat message and streams the response via SSE |
| `POST` | `/api/chat/abort` | Bearer token | Aborts a streaming response mid-stream |
| `POST` | `/api/chat/input` | Bearer token | Submits a user answer to a pending agent input request |
| `POST` | `/api/chat/model` | Bearer token | Switches the model for an active session via `session.setModel()` |
| `GET` | `/api/quota` | Bearer token | Returns the user's premium request quota via `client.rpc.account.getQuota()` |
| `GET` | `/api/goals` | Bearer token | Lists all goals for the authenticated user across all their sessions |
| `GET` | `/api/goals/:id` | Bearer token | Gets a specific goal by ID, scoped to the authenticated user |
| `GET` | `/api/goals/:id/research` | Bearer token | Lists all research items for a goal, scoped to the authenticated user |
| `PATCH` | `/api/goals/:goalId/research/:itemId` | Bearer token | Updates a research item's findings, decision, or status |
| `GET` | `/api/goals/:id/milestones` | Bearer token | Lists all milestones for a goal in order, scoped to the authenticated user |
| `GET` | `/api/milestones/:id/issues` | Bearer token | Lists all issue drafts for a milestone in order, scoped to the authenticated user |
| `PATCH` | `/api/milestones/:milestoneId/issues/:issueId` | Bearer token | Updates an issue draft's fields or status |
| `POST` | `/api/milestones/:id/push-to-github` | Bearer token | Pushes a planning milestone to GitHub as a real milestone (idempotent) |
| `POST` | `/api/milestones/:milestoneId/issues/:issueId/push-to-github` | Bearer token | Pushes a ready issue draft to GitHub as a real issue (idempotent) |

### `POST /api/chat` — Chat with Streaming

**Request:**
```json
{
  "message": "What is 2 + 2?",
  "sessionId": "optional-session-id",
  "model": "gpt-4.1",
  "reasoningEffort": "medium"
}
```

- `reasoningEffort` — Optional. One of `low`, `medium`, `high`, `xhigh`. Only applicable/meaningful for models where `capabilities.supports.reasoningEffort === true` (e.g., `o4-mini`). Returns `400` if an invalid value is supplied.

**Response:** Server-Sent Events (SSE) stream

```
Content-Type: text/event-stream

data: {"type":"delta","content":"The"}
data: {"type":"delta","content":" answer"}
data: {"type":"delta","content":" is"}
data: {"type":"delta","content":" 4"}
data: {"type":"tool_start","tool":"list_repos"}
data: {"type":"tool_complete"}
data: {"type":"title","title":"Math Question"}
data: {"type":"usage","usage":{"model":"gpt-4.1","inputTokens":100,"outputTokens":50}}
data: {"type":"done","sessionId":"abc123"}
```

### `POST /api/chat/abort`

**Request:** `{ "sessionId": "abc-123" }`

### `POST /api/chat/input`

Submits the user's answer to a pending `onUserInputRequest` from the agent.

**Request:**
```json
{
  "requestId": "uuid-of-the-pending-input-request",
  "answer": "Option A",
  "wasFreeform": false
}
```

- `requestId` — Required string. The UUID sent in the `user_input_request` SSE event.
- `answer` — Required non-empty string. The user's answer.
- `wasFreeform` — Required boolean. `true` if the answer was typed; `false` if a choice was selected.

**Response:** `{ "ok": true }` on success, or `404` if the request has already been resolved/timed out.

**SSE event sent before the user answers:**
```json
{ "type": "user_input_request", "requestId": "...", "question": "Which approach do you prefer?", "choices": ["Option A", "Option B"], "allowFreeform": true }
```

**Timeout:** Requests automatically reject after `USER_INPUT_TIMEOUT_MS` ms (default 120000 / 2 minutes). Configurable via env var.

**Cleanup:** When the SSE connection closes, all pending inputs from that connection are rejected so the agent receives an error instead of hanging indefinitely.

### `POST /api/chat/model`

**Request:** `{ "sessionId": "abc-123", "model": "claude-sonnet-4" }`

**Response:** `{ "switched": true, "sessionId": "abc-123", "model": "claude-sonnet-4" }`

### `GET /api/health`

**Response:**
```json
{
  "status": "ok",
  "storage": "memory",
  "planningStorage": "memory",
  "clients": { "total": 2, "connected": 2 },
  "activeSessions": 3
}
```

### `GET /api/quota`

**Response:** `{ "quota": { ... } }`

## Middleware

```
Request → express.json() → express.static('public') → Route Handler
```

- `express.json()` parses incoming JSON request bodies
- `express.static('public')` serves the frontend files (HTML, JS, CSS)

## Per-User Client Management

Each unique GitHub token gets its own `CopilotClient` instance, stored in an in-memory `Map<string, CopilotClient>`:

```
Token A ──► CopilotClient A ──► Copilot CLI process A
Token B ──► CopilotClient B ──► Copilot CLI process B
```

When a request arrives, the server:
1. Extracts the token from the `Authorization: Bearer <token>` header
2. Checks if a `CopilotClient` already exists for that token
3. If not, creates one via `new CopilotClient({ githubToken })` and calls `client.start()`
4. Caches the client in the Map for subsequent requests

## Session Management

Chat sessions maintain conversation context across multiple turns. Sessions are keyed by `"token:sessionId"` in a `Map<string, CopilotSession>`:

```
"tokenA:uuid-1" ──► CopilotSession (conversation history for user A, chat 1)
"tokenA:uuid-2" ──► CopilotSession (conversation history for user A, chat 2)
"tokenB:uuid-3" ──► CopilotSession (conversation history for user B, chat 1)
```

- **New chat** → server creates a new session with `crypto.randomUUID()` as the session ID
- **Follow-up message** → client sends the existing `sessionId`, server reuses that session
- **Session resumption** → `resolveSession()` checks for a stored `sdkSessionId` and attempts `client.resumeSession()` before falling back to `createSession()`
- **Custom tools** → Each session is created with GitHub API tools (from `tools.ts`) and planning tools (from `planning-tools.ts`) bound to the user's token
- **Session hooks** → `onPreToolUse`, `onPostToolUse`, `onSessionStart`, `onSessionEnd`, `onErrorOccurred` hooks are registered on every session

## Custom Tools (tools.ts)

GitHub API tools are defined in `tools.ts` by constructing `Tool` objects directly with JSON Schema definitions. Each tool is bound to the user's GitHub token for API authentication. Tools are created per-session via `createGitHubTools(token, planningStore?)` and passed to `createSession()`.

### Read Tools (5 tools)

| Tool | Description |
|------|-------------|
| `list_repos` | List repositories for a user or organization |
| `get_repo_structure` | Get the file tree of a repository |
| `read_repo_file` | Read a specific file from a repository |
| `list_issues` | List issues in a repository |
| `search_code` | Search code across repositories using GitHub search syntax |

### GitHub Write Tools (4 tools)

| Tool | Description |
|------|-------------|
| `create_github_milestone` | Create a GitHub Milestone from a planning `Milestone`. Idempotent — reuses existing milestones with the same title and stores the GitHub milestone number and URL on the record |
| `create_github_issue` | Create a real GitHub issue from an `IssueDraft`. Formats the body as Markdown with structured R9-quality fields. Idempotent — if the draft is already `status: "created"`, returns the stored `githubIssueNumber` and `githubIssueUrl` |
| `create_github_branch` | Create a GitHub branch from a full commit SHA. Sanitizes the branch name (alphanumerics, dots, hyphens, underscores, slashes) |
| `manage_github_labels` | Create or get labels in a repository. Validates hex color format. Returns `name`, `color`, `alreadyExists`, and `url` |

`GITHUB_TOOL_NAMES` is exported from `tools.ts` and used by the permission handler to auto-approve tool calls.

### GitHub Write Architecture

The `githubWrite()` internal helper wraps all GitHub REST write calls:

- Sends `POST`/`PATCH` requests with the user's token in the `Authorization` header
- Monitors `x-ratelimit-remaining` and sleeps 1 second when it drops below 10 (proactive rate-limit protection)
- Returns `null` for `204 No Content` responses
- Throws a descriptive error for any non-2xx response

#### Idempotency Pattern

Both `create_github_milestone` and `create_github_issue` implement idempotency:

1. Check if the planning record already has a `githubNumber` / `githubIssueNumber` — if so, return the stored value immediately
2. Call `GET` to list existing GitHub milestones/issues and match by title
3. If a match exists, store its ID/URL on the planning record and return it
4. If no match exists, call `POST` to create it, then store the result

This ensures re-running tools after a partial failure never creates duplicates.

## Planning Tools (planning-tools.ts)

Twelve planning workflow tools are defined in `planning-tools.ts` and created via `createPlanningTools(token, planningStore)`. They guide the agent through a structured workflow: define goal → research → milestones → issue drafts.

| Tool | Description |
|------|-------------|
| `define_goal` | Conversational tool to help users refine their goal intent. Guides problem/value/outcome definition |
| `save_goal` | Persist a `Goal` to the planning store with all refined fields |
| `get_goal` | Retrieve a `Goal` by ID from the planning store |
| `generate_research_checklist` | Auto-generate `ResearchItem`s across 8 categories (domain, architecture, security, infrastructure, integration, data_model, operational, ux) for a given goal |
| `suggest_research` | Detect research triggers from goal/milestone/issue text. Scans for external APIs, infrastructure concerns, security patterns, data model complexity, and scope uncertainty |
| `update_research_item` | Update a `ResearchItem`'s `status`, `findings`, `decision`, and `sourceUrl`. Sets `resolvedAt` when `status` becomes `"resolved"` |
| `get_research` | List all `ResearchItem`s for a goal in creation order |
| `create_milestone_plan` | Batch-create up to 20 `Milestone`s for a goal in one call |
| `update_milestone` | Update a `Milestone`'s name, goal, scope, order, status, dependencies, and acceptance/exit criteria |
| `get_milestones` | List all `Milestone`s for a goal, ordered by `order` ascending |
| `generate_issue_drafts` | Batch-create up to 50 `IssueDraft`s for a milestone in one call |
| `update_issue_draft` | Update an `IssueDraft`'s fields, status, dependencies, `researchLinks`, `filesToModify`, `filesToRead`, `securityChecklist`, and `verificationCommands` |

`PLANNING_TOOL_NAMES` is exported from `planning-tools.ts` and used by the permission handler.

## Planning Data Model (planning-types.ts)

The planning workflow is structured around four entities with strict field-length limits:

### Goal

Top-level entity representing a refined project objective.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | UUID |
| `sessionId` | `string` | Owning chat session |
| `intent` | `string` | Raw user description (≤2000 chars) |
| `goal` | `string` | Refined actionable statement (≤500 chars) |
| `problemStatement` | `string` | Specific gap addressed (≤1000 chars) |
| `businessValue` | `string` | Why this matters (≤500 chars) |
| `targetOutcome` | `string` | What success looks like (≤500 chars) |
| `successCriteria` | `string[]` | Measurable conditions |
| `assumptions` | `string[]` | Premises taken as true |
| `constraints` | `string[]` | Non-negotiable limits |
| `risks` | `string[]` | Known risks |
| `createdAt` / `updatedAt` | `string` | ISO 8601 timestamps |

### ResearchItem

An open question that must be answered before planning can proceed.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | UUID |
| `goalId` | `string` | Parent goal |
| `category` | `string` | One of: `domain`, `architecture`, `security`, `infrastructure`, `integration`, `data_model`, `operational`, `ux` |
| `question` | `string` | Research question (≤500 chars) |
| `status` | `string` | `open` → `researching` → `resolved` |
| `findings` | `string` | What was learned (≤2000 chars) |
| `decision` | `string` | What was decided based on findings (≤1000 chars) |
| `resolvedAt` | `string?` | ISO timestamp when resolved |
| `sourceUrl` | `string?` | Reference URL (http/https) |

### Milestone

An ordered delivery phase within a goal.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | UUID |
| `goalId` | `string` | Parent goal |
| `name` | `string` | Milestone name (≤100 chars) |
| `goal` | `string` | What this milestone delivers (≤500 chars) |
| `scope` | `string` | Work in/out of scope (≤1000 chars) |
| `order` | `number` | 1-based, unique per goal |
| `dependencies` | `string[]` | IDs of milestones that must complete first |
| `acceptanceCriteria` / `exitCriteria` | `string[]` | Completion conditions |
| `status` | `string` | `draft` → `ready` → `in-progress` → `complete` |
| `githubNumber` | `number?` | GitHub milestone number (set after push) |
| `githubUrl` | `string?` | GitHub milestone HTML URL (set after push) |

### IssueDraft

An implementation-ready GitHub issue definition with structured context.

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | UUID |
| `milestoneId` | `string` | Parent milestone |
| `title` | `string` | GitHub issue title (≤256 chars) |
| `purpose` | `string` | Why this issue exists (≤500 chars) |
| `problem` | `string` | Specific gap addressed (≤1000 chars) |
| `expectedOutcome` | `string` | What success looks like (≤500 chars) |
| `scopeBoundaries` | `string` | In/out of scope (≤1000 chars) |
| `technicalContext` | `string` | Background and patterns (≤2000 chars) |
| `dependencies` | `string[]` | IDs of issue drafts that must complete first |
| `acceptanceCriteria` / `securityChecklist` / `verificationCommands` | `string[]` | Completion and verification |
| `testingExpectations` | `string` | How to test this issue (≤1000 chars) |
| `researchLinks` | `string[]` | IDs of resolved `ResearchItem`s |
| `order` | `number` | 1-based within milestone |
| `status` | `string` | `draft` → `ready` → `created` |
| `githubIssueNumber` | `number?` | GitHub issue number (set after push) |
| `githubIssueUrl` | `string?` | GitHub issue URL (set after push) |
| `filesToModify` / `filesToRead` | `FileRef[]` | File references with path (≤256 chars) and reason (≤500 chars) |
| `patternReference` | `string?` | Existing file/pattern as implementation reference |

## Planning Store Architecture (planning-store.ts)

Planning data is persisted via a `PlanningStore` interface with two implementations, selected by `createPlanningStore(accountName?)`:

| Implementation | Backend | When Used |
|---------------|---------|-----------|
| `InMemoryPlanningStore` | JavaScript `Map` objects | Default (no Azure storage configured) |
| `AzurePlanningStore` | Azure Table Storage (4 tables) | When `AZURE_STORAGE_ACCOUNT_NAME` is set |

`AzurePlanningStore` uses four Azure Table Storage tables:

| Table | Stores |
|-------|--------|
| `plangoals` | `Goal` records, partition key = `sessionId` |
| `planresearch` | `ResearchItem` records, partition key = `goalId` |
| `planmilestones` | `Milestone` records, partition key = `goalId` |
| `planissues` | `IssueDraft` records, partition key = `milestoneId` |

The server initializes a `PlanningStore` on startup in `startServer()`, falling back to `InMemoryPlanningStore` if Azure Table Storage is unavailable. The active backend type is reported in `GET /api/health` as `planningStorage`.

### Goal Ownership

Planning endpoints enforce ownership by verifying that the goal's `sessionId` belongs to the requesting user. The shared `getOwnedGoal(token, goalId)` helper calls `sessionStore.listSessions(hashToken(token))` and checks that the goal's `sessionId` is in the list — returning `403` if not.

## Permission Handler

The server uses a custom `safePermissionHandler` instead of `approveAll`. It auto-approves only `custom-tool` and `read` permission kinds, denying `shell`, `write`, etc. by default.

## Storage Architecture (storage.ts)

Session metadata and chat messages are persisted via a `SessionStore` interface, with two implementations:

| Implementation | Backend | When Used |
|---------------|---------|-----------|
| `InMemorySessionStore` | JavaScript `Map` objects | Default (no Azure storage configured) |
| `AzureSessionStore` | Azure Table Storage + Blob Storage | When `AZURE_STORAGE_ACCOUNT_NAME` is set |

**Azure Table Storage** stores session metadata (partition key = hashed token, row key = session ID), enabling fast per-user lookups. **Azure Blob Storage** stores chat message history as JSON files (`{tokenHash}/{sessionId}.json`).

Authentication to Azure Storage uses **managed identity** (`DefaultAzureCredential`), not connection strings.

### SessionMetadata Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Session UUID |
| `title` | `string` | Session title (AI-generated or from first message) |
| `model` | `string` | Model name (e.g., `gpt-4.1`) |
| `createdAt` | `string` | ISO timestamp of session creation |
| `updatedAt` | `string` | ISO timestamp of last update |
| `sdkSessionId` | `string?` | Optional SDK internal session ID for session resumption |

### Token Hashing

User tokens are hashed using SHA-256 before being used as partition keys in Azure Table Storage. This ensures user isolation without storing raw tokens server-side.

## SSE Streaming Pipeline

The `/api/chat` endpoint translates SDK events into Server-Sent Events:

1. Frontend sends `POST /api/chat`
2. Backend creates/retrieves session, calls `session.send({ prompt })`
3. SDK fires `assistant.message_delta` events → backend writes SSE `delta` events
4. SDK fires `tool.execution_start/complete` → backend writes SSE `tool_start/tool_complete`
5. SDK fires `session.title_changed` → backend writes SSE `title`
6. SDK fires `assistant.usage` → backend writes SSE `usage`
7. SDK fires `session.mode_changed` → backend writes SSE `planning_start` (entering plan mode) or `plan_ready` (exiting plan mode)
8. SDK fires `assistant.intent` → backend writes SSE `intent` with current agent activity description
9. SDK fires `subagent.started/completed/failed` → backend writes SSE `subagent_start`/`subagent_end`
10. SDK fires `session.compaction_start/complete` → backend writes SSE `compaction` (on `session.compaction_complete` the payload includes `tokensRemoved` as a number, defaulting to 0 when unavailable)
11. SDK calls `onUserInputRequest` → backend writes SSE `user_input_request` and blocks until `POST /api/chat/input` resolves it (or timeout)
12. SDK fires `session.idle` → backend writes SSE `done` and closes stream

Event listener cleanup (unsubscribe functions) runs when the response ends or the client disconnects. Pending user input requests from the disconnected connection are also rejected at cleanup time.

## Graceful Shutdown

On `SIGINT` or `SIGTERM`, the server iterates over all cached `CopilotClient` instances and calls `client.stop()` to cleanly shut down Copilot CLI processes.

## Related Documentation

- [Architecture](architecture.md) — System overview and data flow
- [Backend Testing](backend-testing.md) — Storage unit tests and integration tests
- [Frontend](frontend.md) — UI that consumes the API
- [SDK Reference](sdk-reference.md) — Copilot SDK deep dive and feature inventory
- [Deployment](deployment.md) — Azure infrastructure and deployment
