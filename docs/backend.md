# Backend Documentation

The backend is a single Express.js server written in TypeScript (`server.ts`), executed directly via `tsx` without a compile step. It manages per-user Copilot clients, sessions, custom tools, and streams responses as SSE.

## Files

| File | Purpose |
|------|---------|
| `server.ts` | Express backend — API routes, SDK integration, SSE streaming |
| `tools.ts` | GitHub API tools factory — 6 tools bound to user's token (including `create_github_milestone`) |
| `storage.ts` | Storage abstraction — Azure Table/Blob + in-memory fallback |

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
| `POST` | `/api/chat/model` | Bearer token | Switches the model for an active session via `session.setModel()` |
| `GET` | `/api/quota` | Bearer token | Returns the user's premium request quota via `client.rpc.account.getQuota()` |
| `GET` | `/api/goals` | Bearer token | Lists all goals for the authenticated user across all their sessions |
| `GET` | `/api/goals/:id` | Bearer token | Gets a specific goal by ID, scoped to the authenticated user |
| `GET` | `/api/goals/:id/research` | Bearer token | Lists all research items for a goal, scoped to the authenticated user |
| `GET` | `/api/goals/:id/milestones` | Bearer token | Lists all milestones for a goal in order, scoped to the authenticated user |

### `POST /api/chat` — Chat with Streaming

**Request:**
```json
{
  "message": "What is 2 + 2?",
  "sessionId": "optional-session-id",
  "model": "gpt-4.1"
}
```

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

### `POST /api/chat/model`

**Request:** `{ "sessionId": "abc-123", "model": "claude-sonnet-4" }`

**Response:** `{ "switched": true, "sessionId": "abc-123", "model": "claude-sonnet-4" }`

### `GET /api/health`

**Response:**
```json
{
  "status": "ok",
  "storage": "memory",
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
- **Custom tools** → Each session is created with 5 GitHub API tools (from `tools.ts`) bound to the user's token
- **Session hooks** → `onPreToolUse`, `onPostToolUse`, `onSessionStart`, `onSessionEnd`, `onErrorOccurred` hooks are registered on every session

## Custom Tools (tools.ts)

Five GitHub API tools are defined in `tools.ts` by constructing `Tool` objects directly with JSON Schema definitions. Each tool is bound to the user's GitHub token for API authentication:

| Tool | Description |
|------|-------------|
| `list_repos` | List repositories for a user or organization |
| `get_repo_structure` | Get the file tree of a repository |
| `read_repo_file` | Read a specific file from a repository |
| `list_issues` | List issues in a repository |
| `search_code` | Search code across repositories |

Tools are created per-session via `createGitHubTools(token)` and passed to `createSession()`.

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
7. SDK fires `session.idle` → backend writes SSE `done` and closes stream

Event listener cleanup (unsubscribe functions) runs when the response ends or the client disconnects.

## Graceful Shutdown

On `SIGINT` or `SIGTERM`, the server iterates over all cached `CopilotClient` instances and calls `client.stop()` to cleanly shut down Copilot CLI processes.

## Related Documentation

- [Architecture](architecture.md) — System overview and data flow
- [Backend Testing](backend-testing.md) — Storage unit tests and integration tests
- [Frontend](frontend.md) — UI that consumes the API
- [SDK Reference](sdk-reference.md) — Copilot SDK deep dive and feature inventory
- [Deployment](deployment.md) — Azure infrastructure and deployment
