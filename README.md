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
{ "status": "ok", "copilotCli": true }
```

### `GET /api/models`

Returns available models. Requires `Authorization: Bearer <token>` header.

```json
{ "models": [{ "id": "gpt-4.1", ... }, ...] }
```

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
|------|------------------|
| **SDK connect & ping** | Client connects to Copilot CLI subprocess, gets a timestamped ping response |
| **SDK list models** | `listModels()` returns a non-empty array containing GPT models |
| **SDK chat (single turn)** | Creates a session, sends a prompt, verifies streaming `assistant.message_delta` events arrive and contain the expected response |
| **SDK chat (multi-turn recall)** | Turn 1: tells Copilot to remember a code. Turn 2: asks it to recall. Verifies session memory works across turns. |

#### Server API Tests (full HTTP stack)

These tests spawn the Express server on port 3099 and hit the HTTP API:

| Test | What it verifies |
|------|------------------|
| **Server health check** | `GET /api/health` returns `{ status: "ok" }` |
| **Server models endpoint** | `GET /api/models` with auth header returns a non-empty model list |
| **Server chat (SSE streaming)** | `POST /api/chat` with auth header → parses SSE stream → verifies delta events, done event with session ID, and correct response content |

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

Tests use the same auth method: `COPILOT_GITHUB_TOKEN` from `.env` if set, otherwise `gh` CLI credentials. Server API tests send the token via `Authorization` header.

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
| `Failed to list models: 400` | Token lacks Copilot scope. Use a fine-grained PAT (`github_pat_`) with Copilot permission. |
| `401 Missing token` | Enter your GitHub token in the web UI header and click "Save Token", or set `COPILOT_GITHUB_TOKEN` in `.env`. |
| `EADDRINUSE` | Kill leftover node processes: `Stop-Process -Name node -Force` (Windows) or `pkill node` (macOS/Linux). |
| Server starts but chat fails | Check `GET /api/health` — verify `copilotCli: true`. Ensure your token is valid. |
| Streaming stops mid-response | Network or token issue. Refresh the page and try again. |
