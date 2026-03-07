# Copilot Chat Web App

A minimal web application that provides a chat interface to **GitHub Copilot**, using the official [`@github/copilot-sdk`](https://github.com/github/copilot-sdk). Every message uses the same Copilot engine as github.com and counts toward your premium request quota.

**Multi-user support:** Each user provides their own GitHub token via the web UI. Tokens are stored in the browser's localStorage and sent to the server per-request — the server never stores tokens globally.

## Architecture

```
┌─────────────┐     HTTP/SSE      ┌──────────────────┐    JSON-RPC     ┌─────────────┐        ┌─────────────────┐
│   Browser    │  ◄──────────►    │  Express Server   │  ◄──────────►  │ Copilot CLI  │  ◄──►  │ GitHub Copilot  │
│  (HTML/JS)   │   /api/chat      │  (server.ts)      │   via SDK      │ (per-token)  │        │ Backend (cloud) │
│  Token in    │  Authorization:  │  Per-user clients  │                │              │        │                 │
│  localStorage│  Bearer <token>  │  in Map<token,     │                │              │        │                 │
│              │                  │  CopilotClient>   │                │              │        │                 │
└─────────────┘                   └──────────────────┘                 └─────────────┘        └─────────────────┘
```

### Components

| Component | File(s) | Role |
|-----------|---------|------|
| **Frontend** | `public/index.html`, `public/app.js` | GitHub dark-themed chat UI. Users enter their token in the header, which is saved to localStorage and sent as `Authorization: Bearer <token>` on every API request. |
| **Express Server** | `server.ts` | Hosts static files, creates a separate `CopilotClient` per user token, manages sessions keyed by `token:sessionId`, streams responses as SSE. |
| **Copilot SDK** | `@github/copilot-sdk` | Official TypeScript SDK. Communicates with the Copilot CLI process over JSON-RPC. |
| **Copilot CLI** | System binary | Headless server mode. Managed automatically by the SDK — one instance per user token. |

### Data Flow

1. User enters their GitHub token in the web UI header and clicks "Save Token"
2. Token is stored in `localStorage` — never sent to the server except as an auth header
3. User types a message; frontend sends `POST /api/chat` with `Authorization: Bearer <token>` header
4. Server extracts the token, gets or creates a `CopilotClient` for that token
5. Server creates or retrieves a `CopilotSession` from the session map (keyed by `token:sessionId`)
6. SDK fires `assistant.message_delta` events → server writes SSE `delta` events
7. SDK fires `session.idle` → server writes SSE `done` event with session ID
8. Frontend parses SSE stream, appends tokens to the chat bubble in real time

### Session Management

- Clients stored in a `Map<string, CopilotClient>` — one per unique user token
- Sessions stored in a `Map<string, CopilotSession>` — keyed by `token:sessionId`
- Each session maintains full conversation history (managed by SDK/CLI)
- New chat = new session; follow-up messages reuse the same session ID
- All clients cleaned up on server shutdown

### Persistent Storage

Session metadata and chat messages can optionally be persisted to **Azure Storage**:

| Storage | Data | Purpose |
|---------|------|---------|
| **Table Storage** | Session metadata (id, title, model, timestamps) | Fast key-value lookups per user |
| **Blob Storage** | Chat message history (JSON per session) | Stores full conversation text |

When `AZURE_STORAGE_ACCOUNT_NAME` is set, the server uses Azure Storage with managed identity (DefaultAzureCredential). Otherwise, it falls back to **in-memory storage** (data lost on restart). If Azure Storage initialization fails at startup, the server automatically falls back to in-memory storage.

The frontend caches sessions in `localStorage` for instant rendering and syncs with the backend on load and after saving a token. Messages are persisted to the backend asynchronously after each chat response.

## Prerequisites

- **Node.js 18+** — `node --version`
- **GitHub Copilot subscription** (Free, Pro, or Pro+)
- **GitHub token** — each user needs their own fine-grained PAT with Copilot scope

## Setup

```bash
# Install dependencies
npm install

# (Optional) Set a fallback token for testing/CI
cp .env.example .env
# Edit .env and add COPILOT_GITHUB_TOKEN

# Start the server
npm start

# Open http://localhost:3000 and enter your token in the header
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `COPILOT_GITHUB_TOKEN` | No | — | Server-side fallback token for testing/CI. In normal use, each user provides their own token via the web UI. |
| `PORT` | No | `3000` | Server port |
| `AZURE_STORAGE_ACCOUNT_NAME` | No | — | Azure Storage account name for persistent sessions. Uses managed identity (DefaultAzureCredential). When empty, uses in-memory storage. |

### Authentication

Each user provides their own GitHub token through the web UI:

1. Create a **fine-grained PAT** at https://github.com/settings/tokens with the `copilot` scope
2. Open the app in your browser
3. Paste the token in the input field and click **Save Token**
4. The token is stored in your browser's `localStorage` and sent as `Authorization: Bearer <token>` on each API request

> **Note:** Classic PATs (`ghp_`) may not have the required Copilot scope — use fine-grained tokens (`github_pat_`).

The server also accepts `COPILOT_GITHUB_TOKEN` in `.env` as a fallback (used when no `Authorization` header is present). This is useful for automated testing and CI.

## API Endpoints

### `GET /api/health`

Returns server status and CLI availability. No auth required.

```json
{ "status": "ok", "copilotCli": true, "storage": "memory" }
```

### `GET /api/models`

Returns available models. Requires `Authorization: Bearer <token>` header.

```json
{ "models": [{ "id": "gpt-4.1", ... }, ...] }
```

### `GET /api/sessions`

List all sessions for the authenticated user. Requires `Authorization: Bearer <token>` header.

```json
{ "sessions": [{ "id": "...", "title": "...", "model": "gpt-4.1", "createdAt": "...", "updatedAt": "..." }] }
```

### `DELETE /api/sessions/:id`

Delete a session and its messages. Requires `Authorization: Bearer <token>` header.

### `GET /api/sessions/:id/messages`

Get chat messages for a session. Requires `Authorization: Bearer <token>` header.

```json
{ "messages": [{ "role": "user", "text": "Hello" }, { "role": "assistant", "text": "Hi!" }] }
```

### `PUT /api/sessions/:id/messages`

Save chat messages for a session. Requires `Authorization: Bearer <token>` header.

### `POST /api/chat`

Send a message and receive a streaming SSE response. Requires `Authorization: Bearer <token>` header.

**Request:**
```json
{ "message": "Hello", "sessionId": "optional-id", "model": "gpt-4.1" }
```

**SSE Response:**
```
data: {"type":"delta","content":"Hi"}
data: {"type":"delta","content":" there!"}
data: {"type":"tool_start","tool":"read_file"}
data: {"type":"tool_complete"}
data: {"type":"title","title":"AI-generated title"}
data: {"type":"usage","usage":{"model":"gpt-4.1","inputTokens":100,"outputTokens":50}}
data: {"type":"done","sessionId":"abc-123"}
```

### `POST /api/chat/abort`

Abort a streaming response. Requires `Authorization: Bearer <token>` header.

**Request:**
```json
{ "sessionId": "abc-123" }
```

## Testing

Tests use `gpt-4.1` which costs **0 premium requests** on paid plans, so they are safe to run repeatedly.

### Storage Unit Tests (`npm run test:storage`)

Fast, offline tests for the session storage module. No external services needed.

```bash
npm run test:storage
```

### Integration Tests (`npm test`)

SDK-level and HTTP API tests against the Copilot API. Requires `COPILOT_GITHUB_TOKEN`.

```bash
npm test
```

### E2E Tests (`npm run test:e2e`)

Playwright browser tests that run against the live production site. They enter the token via the UI, load models, send chat messages, and verify streamed responses — exactly like a real user.

```bash
COPILOT_GITHUB_TOKEN=github_pat_... npm run test:e2e
```

| Test | What it verifies |
|------|------------------|
| **page loads and shows connected status** | Site is up, status dot is green |
| **save token and load models** | Token input works, model dropdown populates with GPT models |
| **send message and receive streamed response** | Full chat round-trip with SSE streaming |
| **multi-turn conversation retains context** | Session memory works across turns |
| **new chat button clears conversation** | UI resets correctly |

See **[TESTING.md](TESTING.md)** for full details on prerequisites, CI setup, configuration, and debugging.

## File Structure

```
test-chat/
├── server.ts              # Express backend — CopilotClient, session management, SSE streaming
├── storage.ts             # Storage abstraction — Azure Table/Blob Storage + in-memory fallback
├── storage.test.ts        # Unit tests for storage module
├── test.ts                # Integration tests — SDK direct + server HTTP tests
├── e2e/
│   └── chat.spec.ts       # Playwright E2E tests — browser tests against live site
├── playwright.config.ts   # Playwright configuration (base URL, timeouts, browser)
├── public/
│   ├── index.html         # Chat UI — GitHub dark theme, model selector, session sidebar
│   └── app.js             # Frontend logic — fetch, SSE parsing, streaming render, session mgmt
├── infra/
│   └── main.bicep         # Azure infrastructure (Container Apps + SWA + Storage Account)
├── package.json           # Dependencies & scripts
├── tsconfig.json          # TypeScript config (ES2022, bundler resolution)
├── .env.example           # Environment variable template
├── .env                   # Local config (gitignored)
├── .gitignore             # node_modules, .env, dist
├── docs.md                # Detailed project documentation
├── ARCHITECTURE.md        # Application architecture overview
├── TESTING.md             # E2E and integration test documentation
└── README.md              # This file
```

## Available Models

Models are fetched dynamically from the Copilot API. Pricing depends on your plan:

| Model | Premium Requests (Paid Plan) |
|-------|------------------------------|
| gpt-4.1 | **0** (included) |
| gpt-4o | **0** (included) |
| gpt-5-mini | **0** (included) |
| claude-sonnet-4 | 1 |
| gpt-5.1 | 1 |
| claude-opus-4.5 | 3 |

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Failed to list models: 400` | Token lacks Copilot scope. Use a fine-grained PAT (`github_pat_`) with Copilot permission. |
| `401 Missing token` | Enter your GitHub token in the web UI header and click "Save Token", or set `COPILOT_GITHUB_TOKEN` in `.env`. |
| `EADDRINUSE` | Kill leftover node processes: `Stop-Process -Name node -Force` (Windows) or `pkill node` (macOS/Linux). |
| Server starts but chat fails | Check `GET /api/health` — verify `copilotCli: true`. Ensure your token is valid. |
| Streaming stops mid-response | Network or token issue. Refresh the page and try again. |
