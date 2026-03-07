# Copilot Chat Web App

A minimal web application that provides a chat interface to **GitHub Copilot**, using the official [`@github/copilot-sdk`](https://github.com/github/copilot-sdk). Every message uses the same Copilot engine as github.com and counts toward your premium request quota.

## Architecture

```
┌─────────────┐     HTTP/SSE      ┌──────────────────┐    JSON-RPC     ┌─────────────┐        ┌─────────────────┐
│   Browser    │  ◄──────────►    │  Express Server   │  ◄──────────►  │ Copilot CLI  │  ◄──►  │ GitHub Copilot  │
│  (HTML/JS)   │   /api/chat      │  (server.ts)      │   via SDK      │ (server mode)│        │ Backend (cloud) │
└─────────────┘                   └──────────────────┘                 └─────────────┘        └─────────────────┘
```

### Components

| Component | File(s) | Role |
|-----------|---------|------|
| **Frontend** | `public/index.html`, `public/app.js` | GitHub dark-themed chat UI. Sends messages via fetch, reads streaming responses via SSE, renders tokens incrementally. |
| **Express Server** | `server.ts` | Hosts static files, manages Copilot sessions, proxies chat through SDK, streams responses as Server-Sent Events. |
| **Copilot SDK** | `@github/copilot-sdk` | Official TypeScript SDK. Communicates with the Copilot CLI process over JSON-RPC. |
| **Copilot CLI** | System binary | Headless server mode. Managed automatically by the SDK — spawned on first use, stopped on shutdown. |

### Data Flow

1. User types a message in the browser
2. Frontend sends `POST /api/chat` with `{ message, sessionId, model }`
3. Server creates or retrieves a `CopilotSession` from the in-memory session map
4. SDK fires `assistant.message_delta` events → server writes SSE `delta` events
5. SDK fires `session.idle` → server writes SSE `done` event with session ID
6. Frontend parses SSE stream, appends tokens to the chat bubble in real time

### Session Management

- Sessions stored in a `Map<string, CopilotSession>` in server memory
- Each session maintains full conversation history (managed by SDK/CLI)
- New chat = new session; follow-up messages reuse the same session ID
- Sessions cleaned up on server shutdown via `client.stop()`

## Prerequisites

- **Node.js 18+** — `node --version`
- **GitHub Copilot subscription** (Free, Pro, or Pro+)
- **Authentication** — one of:
  - `gh` CLI logged in (`gh auth login`) — **recommended**
  - GitHub fine-grained PAT with Copilot scope in `.env`

## Setup

```bash
# Install dependencies
npm install

# Configure (optional — skip if using gh CLI auth)
cp .env.example .env
# Edit .env and add GITHUB_TOKEN if not using gh CLI

# Start the server
npm start

# Open http://localhost:3000
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GITHUB_TOKEN` | No | — | GitHub fine-grained PAT with Copilot scope. If empty, falls back to `gh` CLI auth. |
| `PORT` | No | `3000` | Server port |

### Authentication

The app supports two authentication methods:

1. **`gh` CLI auth (recommended)** — Run `gh auth login` once. The SDK detects stored credentials automatically. No token needed in `.env`.
2. **Fine-grained PAT** — Create a token at https://github.com/settings/tokens with the `copilot` scope. Set it as `GITHUB_TOKEN` in `.env`. Classic PATs (`ghp_`) may not have the required scope — use fine-grained tokens (`github_pat_`).

## API Endpoints

### `GET /api/health`

Returns server status, CLI availability, and auth state.

```json
{ "status": "ok", "copilotCli": true, "authenticated": true }
```

### `GET /api/models`

Returns available models fetched from `client.listModels()`.

```json
{ "models": [{ "id": "gpt-4.1", ... }, ...] }
```

### `POST /api/chat`

Send a message and receive a streaming SSE response.

**Request:**
```json
{ "message": "Hello", "sessionId": "optional-id", "model": "gpt-4.1" }
```

**SSE Response:**
```
data: {"type":"delta","content":"Hi"}
data: {"type":"delta","content":" there!"}
data: {"type":"done","sessionId":"abc-123"}
```

## Testing

### Overview

The test suite (`test.ts`) runs real integration tests against the live Copilot API. Tests use `gpt-4.1` which costs **0 premium requests** on paid plans, so they're safe to run repeatedly.

```bash
npm test
```

### Test Structure

The suite has two layers:

#### SDK Direct Tests (no server needed)

These tests create a `CopilotClient` directly and talk to Copilot:

| Test | What it verifies |
|------|-----------------|
| **SDK connect & ping** | Client connects to Copilot CLI subprocess, gets a timestamped ping response |
| **SDK list models** | `listModels()` returns a non-empty array containing GPT models |
| **SDK chat (single turn)** | Creates a session, sends a prompt, verifies streaming `assistant.message_delta` events arrive and contain the expected response |
| **SDK chat (multi-turn recall)** | Turn 1: tells Copilot to remember a code. Turn 2: asks it to recall. Verifies session memory works across turns. |

#### Server API Tests (full HTTP stack)

These tests spawn the Express server on port 3099 and hit the HTTP API:

| Test | What it verifies |
|------|-----------------|
| **Server health check** | `GET /api/health` returns `{ status: "ok", authenticated: true }` |
| **Server models endpoint** | `GET /api/models` returns a non-empty model list from the Copilot API |
| **Server chat (SSE streaming)** | `POST /api/chat` → parses SSE stream → verifies delta events, done event with session ID, and correct response content |

### Test Output

```
═══════════════════════════════════════════════
  Copilot Chat — Integration Tests
  Model: gpt-4.1 (0x premium requests)
═══════════════════════════════════════════════

── SDK Direct Tests ──

✓ SDK connect & ping (641ms)
  Found 17 models: claude-sonnet-4.6, gpt-4.1, ...
✓ SDK list models (1535ms)
  Response: "COPILOT_TEST_OK"
✓ SDK chat (single turn) (3829ms)
  Recall: "ALPHA_7749"
✓ SDK chat (multi-turn recall) (5016ms)

── Server API Tests ──

✓ Server health check (966ms)
  Server returned 17 models
✓ Server models endpoint (1531ms)
  Server response: "SERVER_TEST_OK" (session: a7fec105...)
✓ Server chat (SSE streaming) (2352ms)

═══════════════════════════════════════════════
  7 tests: 7 passed, 0 failed
═══════════════════════════════════════════════
```

### Test Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_PORT` | `3099` | Port for the test server (avoids conflict with dev server on 3000) |

Tests use the same auth method as the app: `GITHUB_TOKEN` from `.env` if set, otherwise `gh` CLI credentials.

## File Structure

```
test-chat/
├── server.ts          # Express backend — CopilotClient, session management, SSE streaming
├── test.ts            # Integration tests — SDK direct + server HTTP tests
├── public/
│   ├── index.html     # Chat UI — GitHub dark theme, model selector, message area
│   └── app.js         # Frontend logic — fetch, SSE parsing, streaming render
├── package.json       # Dependencies & scripts
├── tsconfig.json      # TypeScript config (ES2022, bundler resolution)
├── .env.example       # Environment variable template
├── .env               # Local config (gitignored)
├── .gitignore         # node_modules, .env, dist
├── docs.md            # Detailed project documentation
└── README.md          # This file
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
| `Failed to list models: 400` | Token lacks Copilot scope. Use a fine-grained PAT (`github_pat_`) with Copilot permission, or switch to `gh` CLI auth. |
| `Not authenticated` | Set `GITHUB_TOKEN` in `.env` or run `gh auth login`. |
| `EADDRINUSE` | Kill leftover node processes: `Stop-Process -Name node -Force` (Windows) or `pkill node` (macOS/Linux). |
| Server starts but chat fails | Check `GET /api/health` — verify `authenticated: true` and `copilotCli: true`. |
| Streaming stops mid-response | Network or token issue. Refresh the page and try again. |