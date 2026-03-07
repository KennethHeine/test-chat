# Copilot Chat Web App — Project Documentation

## Overview

A minimal web application that provides a chat interface to **GitHub Copilot**, using the official [`@github/copilot-sdk`](https://github.com/github/copilot-sdk). Every message sent through this app uses the same Copilot engine as the chat on github.com and counts toward your **premium request** quota.

### Architecture

```
┌─────────────┐     HTTP/SSE      ┌──────────────────┐    JSON-RPC     ┌─────────────┐        ┌─────────────────┐
│   Browser    │  ◄──────────►    │  Express Server   │  ◄──────────►  │ Copilot CLI  │  ◄──►  │ GitHub Copilot  │
│  (HTML/JS)   │   /api/chat      │  (server.ts)      │   via SDK      │ (server mode)│        │ Backend (cloud) │
└─────────────┘                   └──────────────────┘                 └─────────────┘        └─────────────────┘
```

- **Browser**: Vanilla HTML/JS chat UI. Sends messages to the backend, reads streaming responses via SSE.
- **Express Server**: Hosts the frontend, manages Copilot sessions, proxies chat messages through the SDK.
- **Copilot SDK** (`@github/copilot-sdk`): Official TypeScript SDK. Communicates with the Copilot CLI process over JSON-RPC.
- **Copilot CLI**: The `copilot` CLI binary running in headless server mode. Managed automatically by the SDK.
- **GitHub Copilot Backend**: Cloud service that runs inference. Handles auth, model selection, billing.

### How Billing Works

Each prompt sent through the SDK is billed identically to using Copilot Chat on github.com:

| Model | Premium Request Multiplier (Paid Plan) | Free Plan |
|-------|---------------------------------------|-----------|
| GPT-4.1 | **0** (included) | 1 |
| GPT-4o | **0** (included) | 1 |
| GPT-5 mini | **0** (included) | 1 |
| Claude Sonnet 4 | 1 | N/A |
| Claude Opus 4.5 | 3 | N/A |
| GPT-5.1 | 1 | N/A |

On paid plans, GPT-4.1, GPT-4o, and GPT-5 mini are **free** (0 premium requests). Other models consume premium requests per the multiplier.

---

## Prerequisites

### 1. Node.js 18+

Verify: `node --version` (must be ≥ 18.0.0)

### 2. GitHub Copilot CLI

The SDK requires the Copilot CLI binary installed and available on your PATH.

**Install via npm (recommended):**
```bash
npm install -g @anthropic-ai/copilot  # or check latest install method
```

**Or follow the official guide:**
https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli

**Verify:**
```bash
copilot --version
```

### 3. GitHub Copilot Subscription

Any Copilot plan works:
- **Copilot Free**: 50 premium requests/month, limited models
- **Copilot Pro**: 300 premium requests/month + unlimited included models
- **Copilot Pro+**: 1500 premium requests/month + all models

### 4. Authentication Token

You need a GitHub token with Copilot access. Two options:

**Option A — Environment Variable (recommended for this app):**
Create a GitHub PAT (Personal Access Token) at https://github.com/settings/tokens and set it in `.env`.

**Option B — CLI Login:**
Run `copilot auth login` to authenticate interactively. The SDK will use stored credentials automatically (no env var needed).

---

## Setup & Running

### Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure authentication
cp .env.example .env
# Edit .env and add your GITHUB_TOKEN

# 3. Start the server
npm start

# 4. Open in browser
# http://localhost:3000
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `COPILOT_GITHUB_TOKEN` | No | — | Server-side fallback token for testing/CI. In normal use, each user provides their own token via the web UI. |
| `PORT` | No | `3000` | Server port |
| `AZURE_STORAGE_ACCOUNT_NAME` | No | — | Azure Storage account name for persistent sessions. Uses managed identity (DefaultAzureCredential). When empty, uses in-memory storage. |

### npm Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm start` | `npx tsx server.ts` | Start the web server |
| `npm test` | `npx tsx test.ts` | Run integration tests (requires `COPILOT_GITHUB_TOKEN`) |
| `npm run test:storage` | `npx tsx storage.test.ts` | Run storage unit tests (offline, no token needed) |
| `npm run test:e2e` | `npx playwright test` | Run Playwright E2E tests |
| `npm run test:e2e:local` | `npx playwright test --project=local` | E2E tests against local server |
| `npm run test:e2e:prod` | `npx playwright test --project=prod` | E2E tests against production |

---

## API Reference

### `POST /api/chat`

Send a chat message and receive a streaming response.

**Request Body:**
```json
{
  "message": "What is 2 + 2?",
  "sessionId": "optional-session-id",
  "model": "gpt-4.1"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `message` | string | Yes | — | The user's message |
| `sessionId` | string | No | auto-generated | Session ID for conversation continuity |
| `model` | string | No | `gpt-4.1` | Model to use |

**Response:** Server-Sent Events (SSE) stream

```
Content-Type: text/event-stream

data: {"type":"delta","content":"The"}
data: {"type":"delta","content":" answer"}
data: {"type":"delta","content":" is"}
data: {"type":"delta","content":" 4"}
data: {"type":"done","sessionId":"abc123"}
```

| Event Type | Fields | Description |
|------------|--------|-------------|
| `delta` | `content` | Incremental text chunk from the assistant |
| `tool_start` | `tool` | Agent started executing a tool (e.g., `read_file`, `list_repos`) |
| `tool_complete` | — | Tool execution finished |
| `title` | `title` | AI-generated session title |
| `usage` | `usage` (object with `model`, `inputTokens`, `outputTokens`) | Token usage for the response |
| `done` | `sessionId` | Stream complete; includes the session ID for follow-up messages |
| `error` | `message` | Error occurred |

### `GET /api/health`

Health check endpoint. Returns server status, connected client info, and active session count.

**Response:**
```json
{
  "status": "ok",
  "storage": "memory",
  "clients": { "total": 2, "connected": 2 },
  "activeSessions": 3
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | string | `"ok"` if server is running |
| `storage` | string | `"memory"` or `"azure"` — which storage backend is active |
| `clients.total` | number | Total number of active `CopilotClient` instances |
| `clients.connected` | number | Number of clients in `"connected"` state |
| `activeSessions` | number | Number of active in-memory SDK sessions |

### `GET /api/models`

Lists available AI models. Requires `Authorization: Bearer <token>` header.

### `GET /api/sessions`

Lists all sessions for the authenticated user. Requires `Authorization: Bearer <token>` header.

### `DELETE /api/sessions/:id`

Deletes a session and its messages. Returns 404 if the session doesn't exist.

### `GET /api/sessions/:id/messages`

Gets chat messages for a session.

### `PUT /api/sessions/:id/messages`

Saves chat messages for a session.

### `POST /api/chat/abort`

Abort a streaming response. Requires `Authorization: Bearer <token>` header.

**Request:**
```json
{ "sessionId": "abc-123" }
```

### `POST /api/chat/model`

Switch the model for an active session mid-conversation. Calls `session.setModel()` under the hood — no new session is created.

**Request:**
```json
{ "sessionId": "abc-123", "model": "claude-sonnet-4" }
```

**Response:**
```json
{ "switched": true, "sessionId": "abc-123", "model": "claude-sonnet-4" }
```

### `GET /api/quota`

Get the user's premium request quota via `client.rpc.account.getQuota()`. Requires `Authorization: Bearer <token>` header.

**Response:**
```json
{ "quota": { ... } }
```

---

## File Structure

```
test-chat/
├── server.ts              # Express backend — API routes, SDK integration, SSE streaming
├── tools.ts               # GitHub API tools factory — 5 tools using defineTool() pattern
├── storage.ts             # Storage abstraction — Azure Table/Blob + in-memory fallback
├── storage.test.ts        # Unit tests for storage module (15 tests)
├── public/
│   ├── index.html         # Chat UI — GitHub dark theme, model selector, session sidebar
│   ├── app.js             # Frontend logic — token management, SSE parsing, session management
│   └── staticwebapp.config.json  # Azure SWA routing config
├── test.ts                # Integration tests — SDK direct + server HTTP tests (16 tests)
├── e2e/
│   └── chat.spec.ts       # Playwright E2E tests
├── infra/
│   └── main.bicep         # Azure infrastructure (Container Apps + SWA + Storage Account)
├── package.json           # Dependencies & scripts
├── tsconfig.json          # TypeScript config (ES2022, strict, bundler resolution)
├── Dockerfile             # Production container (node:22-alpine)
├── .env.example           # Environment variable template
├── .gitignore             # node_modules, .env
├── ARCHITECTURE.md        # Application architecture overview
├── TESTING.md             # Test documentation
├── AZURE_DEPLOYMENT.md    # Azure deployment guide
├── SCALING.md             # Container App scaling guide
└── README.md              # Setup instructions
```

---

## Technical Details

### SDK Usage (server.ts)

The backend creates a per-user `CopilotClient` instance. Each conversation is a `CopilotSession` with custom tools, hooks, and session resumption support:

```typescript
// Per-user clients (one per unique token)
const clients = new Map<string, CopilotClient>();
const client = new CopilotClient({ githubToken: token });
await client.start();

// Per conversation — with tools (Phase 2.1), hooks (Phase 2.4), system message (Phase 1.1)
import { createGitHubTools } from "./tools.ts";

const session = await client.createSession({
  model: "gpt-4.1",
  streaming: true,
  onPermissionRequest: approveAll,
  systemMessage: { content: "You are a coding task orchestrator..." },
  tools: createGitHubTools(token),  // 5 GitHub API tools bound to user's token
  hooks: {
    onPreToolUse: async (input) => { /* log tool start */ },
    onPostToolUse: async (input) => { /* log tool result */ },
    onSessionStart: async (input) => { /* log session start */ },
    onSessionEnd: async (input) => { /* log session end */ },
    onErrorOccurred: async (input) => { /* log errors */ },
  },
});

// Session resumption (Phase 2.3) — try resumeSession() before createSession()
const resumed = await client.resumeSession(sdkSessionId, { ...config });

// Streaming events
session.on("assistant.message_delta", (event) => {
  // event.data.deltaContent — incremental text
});
session.on("tool.execution_start", (event) => {
  // event.data.name — tool being executed
});
session.on("session.title_changed", (event) => {
  // event.data.title — AI-generated title
});
session.on("assistant.usage", (event) => {
  // event.data — { model, inputTokens, outputTokens }
});
session.on("session.idle", () => {
  // Response complete
});

// Model switching mid-conversation (Phase 2.5)
await session.setModel("claude-sonnet-4");

// Quota monitoring (Phase 2.6)
const quota = await client.rpc.account.getQuota();

// Send message
await session.send({ prompt: "Hello!" });
```

### Custom Tools (tools.ts)

Five GitHub API tools are defined in `tools.ts` using the SDK's `defineTool()` pattern. Each tool is bound to the user's GitHub token for API authentication:

| Tool | Description |
|------|-------------|
| `list_repos` | List repositories for a user or organization |
| `get_repo_structure` | Get the file tree of a repository |
| `read_repo_file` | Read a specific file from a repository |
| `list_issues` | List issues in a repository |
| `search_code` | Search code across repositories |

Tools are created per-session via `createGitHubTools(token)` and passed to `createSession()`.

### Session Management

- Sessions are stored in a `Map<string, CopilotSession>` in server memory (for active SDK sessions)
- Session metadata and chat messages are persisted via the `SessionStore` interface (`storage.ts`)
- **SDK session ID persistence** — The SDK's internal session ID (`session.sessionId`) is stored in session metadata as `sdkSessionId`. On reconnect, `resolveSession()` tries `client.resumeSession(sdkSessionId)` before falling back to `createSession()`.
- **Azure mode**: Uses Table Storage for metadata and Blob Storage for messages (when `AZURE_STORAGE_ACCOUNT_NAME` is set, authenticates via managed identity / `DefaultAzureCredential`)
- **Memory mode**: Falls back to in-memory Maps (data lost on restart). If Azure init fails at startup, the server automatically falls back to memory mode.
- The frontend caches sessions in `localStorage` for instant UI rendering, and syncs with the backend on load
- Creating a new chat = creating a new session
- Sessions are cleaned up when the server stops (`client.stop()`)

### Streaming (SSE)

The backend translates SDK events into Server-Sent Events:

1. Frontend sends `POST /api/chat` with `Accept: text/event-stream`
2. Backend creates/retrieves session, calls `session.send({ prompt })`
3. SDK fires `assistant.message_delta` events → backend writes `data: {"type":"delta","content":"..."}` lines
4. SDK fires `tool.execution_start` events → backend writes `data: {"type":"tool_start","tool":"..."}` lines
5. SDK fires `tool.execution_complete` events → backend writes `data: {"type":"tool_complete"}` lines
6. SDK fires `session.title_changed` events → backend writes `data: {"type":"title","title":"..."}` lines
7. SDK fires `assistant.usage` events → backend writes `data: {"type":"usage","usage":{...}}` lines
8. SDK fires `session.idle` → backend writes `data: {"type":"done","sessionId":"..."}` and closes stream

### Aborting a Response

Send `POST /api/chat/abort` with `{ "sessionId": "..." }` to cancel a streaming response mid-stream.

### Model Switching Mid-Conversation

Send `POST /api/chat/model` with `{ "sessionId": "...", "model": "..." }` to switch models without creating a new session. The frontend fires this automatically when the user changes the model dropdown during an active session.

### Frontend Streaming

The frontend uses the Fetch API with `ReadableStream` to read SSE:

```javascript
const response = await fetch("/api/chat", { method: "POST", body, headers });
const reader = response.body.getReader();
const decoder = new TextDecoder();
// Read chunks, parse SSE lines, extract delta content, append to UI
```

### Available Models

Models available depend on your Copilot plan. Common models:

| Model | Tier | Notes |
|-------|------|-------|
| `gpt-4.1` | Included (paid) | Default, good balance |
| `gpt-4o` | Included (paid) | Fast |
| `gpt-5-mini` | Included (paid) | Budget |
| `gpt-5` | Premium (1x) | Most capable GPT |
| `claude-sonnet-4.5` | Premium (1x) | Good for code |
| `claude-opus-4.5` | Premium (3x) | Most capable Claude |

---

## Testing

### Automated Tests (`npm test`)

The test script performs:

1. **Health Check**: Starts server, hits `GET /api/health`, verifies response
2. **CLI Check**: Verifies Copilot CLI is available
3. **Chat Test** (if token available): Sends a test message, verifies streaming response contains content

**Exit codes:**
- `0` — All tests passed
- `1` — One or more tests failed

**Output example:**
```
✓ Health check passed
✓ Copilot CLI detected
✓ Chat test passed (received streaming response)
All tests passed!
```

### Manual Testing

1. Start: `npm start`
2. Open: `http://localhost:3000`
3. Select a model from the dropdown
4. Type a message and click Send (or press Enter)
5. Watch the response stream in token-by-token
6. Try "New Chat" to start a fresh conversation

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| `copilot: command not found` | Copilot CLI not installed | Install per prerequisites |
| `401 Unauthorized` | Invalid or missing token | Check `.env` has valid `GITHUB_TOKEN`, or run `copilot auth login` |
| `No models available` | Token lacks Copilot access | Ensure your GitHub account has a Copilot subscription |
| `ECONNREFUSED on port 3000` | Server not running | Run `npm start` first |
| `Rate limited` | Too many requests | Wait and retry; paid plans have higher limits |
| Streaming stops mid-response | Network or token issue | Refresh page and try again |

---

## Agent Instructions

For AI agents running this app autonomously:

1. **Install**: `npm ci` in the project root
2. **Configure**: Ensure `COPILOT_GITHUB_TOKEN` is set in `.env` (or as env var)
3. **Verify prerequisites**: Run `copilot --version` to check CLI
4. **Test**: Run `npm run test:storage` (offline), or `npm test` (requires token) — check exit code 0
5. **Start**: Run `npm start` — server listens on port 3000
6. **Interact**: Send POST to `http://localhost:3000/api/chat` with JSON body and `Authorization: Bearer <token>` header
7. **Stop**: Ctrl+C or kill the process

**Minimal API test (curl):**
```bash
curl -N -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-github-token>" \
  -d '{"message":"Say hello in one word","model":"gpt-4.1"}'
```
