# Application Architecture

This document describes the architecture of the Copilot Chat Web App — a minimal multi-user web application that provides a browser-based chat interface to GitHub Copilot using the official [`@github/copilot-sdk`](https://github.com/github/copilot-sdk).

## System Overview

```
┌─────────────┐     HTTP/SSE      ┌──────────────────┐    JSON-RPC     ┌─────────────┐        ┌─────────────────┐
│   Browser    │  ◄──────────►    │  Express Server   │  ◄──────────►  │ Copilot CLI  │  ◄──►  │ GitHub Copilot  │
│  (HTML/JS)   │   /api/chat      │  (server.ts)      │   via SDK      │ (per-token)  │        │ Backend (cloud) │
│  Token in    │  Authorization:  │  Per-user clients  │                │              │        │                 │
│  localStorage│  Bearer <token>  │  in Map<token,     │                │              │        │                 │
│              │                  │  CopilotClient>   │                │              │        │                 │
└─────────────┘                   └──────────────────┘                 └─────────────┘        └─────────────────┘
```

The application follows a layered architecture with four main tiers:

1. **Browser** — Vanilla HTML/JS chat UI. Users enter their GitHub token, send messages, and see streamed responses.
2. **Express Server** — Hosts static files, manages per-user Copilot clients, proxies chat through the SDK, and streams responses as SSE.
3. **Copilot SDK** — Official TypeScript SDK that communicates with the Copilot CLI process over JSON-RPC.
4. **GitHub Copilot Backend** — Cloud service that runs model inference, handles auth, model selection, and billing.

## Project Structure

```
test-chat/
├── server.ts              # Express backend — API routes, SDK integration, SSE streaming
├── storage.ts             # Storage abstraction — Azure Table/Blob + in-memory fallback
├── storage.test.ts        # Unit tests for storage module
├── public/                # Frontend (served as static files)
│   ├── index.html         #   Chat UI — GitHub dark theme, model selector, session sidebar
│   ├── app.js             #   Frontend logic — token management, SSE parsing, session management
│   └── staticwebapp.config.json  # Azure SWA routing config
├── infra/
│   └── main.bicep         # Azure infrastructure (Container Apps + SWA + Storage Account)
├── test.ts                # Integration tests — SDK direct + server HTTP tests
├── e2e/
│   └── chat.spec.ts       # Playwright E2E tests — browser tests against live site
├── playwright.config.ts   # Playwright configuration (base URL, timeouts, browser)
├── package.json           # Dependencies & scripts
├── tsconfig.json          # TypeScript config (ES2022, strict, bundler resolution)
├── Dockerfile             # Production container (node:22-alpine)
├── .env.example           # Environment variable template
└── .github/workflows/
    ├── deploy-app.yml     # Build Docker image → GHCR → deploy to Azure
    ├── deploy-infra.yml   # Deploy Bicep templates to Azure
    ├── e2e-tests.yml      # E2E tests against production (post-deploy)
    └── e2e-local.yml      # E2E tests against local server (PRs)
```

## Backend Architecture

The backend is a single Express.js server written in TypeScript (`server.ts`), executed directly via `tsx` without a compile step.

### Middleware

```
Request → express.json() → express.static('public') → Route Handler
```

- `express.json()` parses incoming JSON request bodies
- `express.static('public')` serves the frontend files (HTML, JS, CSS)

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/health` | None | Health check — returns server status, Copilot CLI availability, storage backend |
| `GET` | `/api/models` | Bearer token | Lists available AI models from the Copilot SDK |
| `GET` | `/api/sessions` | Bearer token | Lists all sessions for the authenticated user |
| `DELETE` | `/api/sessions/:id` | Bearer token | Deletes a session and its messages |
| `GET` | `/api/sessions/:id/messages` | Bearer token | Gets chat messages for a session |
| `PUT` | `/api/sessions/:id/messages` | Bearer token | Saves chat messages for a session |
| `POST` | `/api/chat` | Bearer token | Sends a chat message and streams the response via SSE |

### Per-User Client Management

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

### Session Management

Chat sessions maintain conversation context across multiple turns. Sessions are keyed by `"token:sessionId"` in a `Map<string, CopilotSession>`:

```
"tokenA:uuid-1" ──► CopilotSession (conversation history for user A, chat 1)
"tokenA:uuid-2" ──► CopilotSession (conversation history for user A, chat 2)
"tokenB:uuid-3" ──► CopilotSession (conversation history for user B, chat 1)
```

- **New chat** → server creates a new session with `crypto.randomUUID()` as the session ID
- **Follow-up message** → client sends the existing `sessionId`, server reuses that session
- **New Chat button** → frontend resets `sessionId` to `null`, forcing a new session on next message

### Persistent Storage

Session metadata and chat messages are persisted via a `SessionStore` interface (`storage.ts`), with two implementations:

| Implementation | Backend | When Used |
|---------------|---------|-----------|
| `InMemorySessionStore` | JavaScript `Map` objects | Default (no Azure connection string) |
| `AzureSessionStore` | Azure Table Storage + Blob Storage | When `AZURE_STORAGE_CONNECTION_STRING` is set |

**Azure Table Storage** stores session metadata (partition key = hashed token, row key = session ID), enabling fast per-user lookups. **Azure Blob Storage** stores chat message history as JSON files (`{tokenHash}/{sessionId}.json`), allowing large conversation histories.

The frontend also caches sessions in `localStorage` for instant UI rendering, with the backend as the persistent source of truth.

### SSE Streaming

The `/api/chat` endpoint uses Server-Sent Events to stream responses token-by-token:

```
Client                          Server                          Copilot SDK
  │                               │                                 │
  │  POST /api/chat               │                                 │
  │──────────────────────────────►│                                 │
  │                               │  session.send({ prompt })       │
  │                               │────────────────────────────────►│
  │                               │                                 │
  │  data: {"type":"delta",       │  assistant.message_delta event  │
  │         "content":"Hello"}    │◄────────────────────────────────│
  │◄──────────────────────────────│                                 │
  │                               │                                 │
  │  data: {"type":"delta",       │  assistant.message_delta event  │
  │         "content":" world"}   │◄────────────────────────────────│
  │◄──────────────────────────────│                                 │
  │                               │                                 │
  │  data: {"type":"done",        │  session.idle event             │
  │         "sessionId":"uuid"}   │◄────────────────────────────────│
  │◄──────────────────────────────│                                 │
```

The server sets standard SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`) and registers three event listeners on the SDK session:

| SDK Event | SSE Event Sent | Purpose |
|-----------|---------------|---------|
| `assistant.message_delta` | `{"type":"delta","content":"..."}` | Each token chunk from the model |
| `session.idle` | `{"type":"done","sessionId":"..."}` | Streaming complete — includes session ID for follow-ups |
| `session.error` | `{"type":"error","message":"..."}` | Error during generation |

Event listener cleanup (unsubscribe functions) runs when the response ends or the client disconnects.

### Graceful Shutdown

On `SIGINT` or `SIGTERM`, the server iterates over all cached `CopilotClient` instances and calls `client.stop()` to cleanly shut down Copilot CLI processes.

## Frontend Architecture

The frontend is vanilla HTML, CSS, and JavaScript — no frameworks, no build step.

### UI Layout

```
┌─────────────────────────────────────────────────────────┐
│  Header                                                 │
│  [Token input] [Save Token]  [Model ▾]  [New Chat]     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Messages Area                                          │
│  ┌─────────────────────────────────────────────┐        │
│  │ You: What is TypeScript?            (blue) ──┤       │
│  │                                              │       │
│  │ ├── Copilot: TypeScript is...       (dark)   │       │
│  │ │   ▌ (typing indicator while streaming)     │       │
│  └─────────────────────────────────────────────┘        │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  [Message input textarea              ] [Send]          │
├─────────────────────────────────────────────────────────┤
│  ● Connected                                            │
└─────────────────────────────────────────────────────────┘
```

**Theme:** GitHub dark mode (`#0d1117` background, `#e6edf3` text).

### Application State

The frontend manages minimal state in two variables:

| Variable | Type | Purpose |
|----------|------|---------|
| `sessionId` | `string \| null` | Current session ID for multi-turn conversations. Reset to `null` on "New Chat". |
| `isStreaming` | `boolean` | Prevents double-sending while a response is being streamed. |

### Token Management

Tokens are stored client-side in `localStorage` and sent as `Authorization: Bearer <token>` on every API request:

1. User pastes their GitHub PAT into the token input field
2. Clicks "Save Token" → stored in `localStorage["copilot_github_token"]`
3. UI updates: placeholder shows "Token saved ✓", button changes to "Clear Token"
4. On page load, if a token exists, the app automatically loads available models

The server never persists tokens — they exist only in the browser and in-flight request headers.

### SSE Stream Consumption

The frontend reads the SSE stream using the Fetch API's `ReadableStream`:

1. `POST /api/chat` returns a streaming response
2. Frontend reads chunks via `response.body.getReader()`
3. Chunks are decoded and split into SSE lines (`data: {...}\n`)
4. Each `delta` event appends content to the assistant's message bubble in real time
5. The `done` event stores the `sessionId` for follow-up messages
6. Typing indicator is removed when streaming completes

Buffering handles partial lines that may arrive split across network chunks.

## Authentication Model

```
┌──────────────┐          ┌──────────────┐          ┌──────────────┐
│    User's     │  stored  │   Browser    │  Bearer   │   Express    │
│  GitHub PAT   │────────►│  localStorage │────────►│   Server     │
│ (copilot      │          │              │  header   │              │
│  scope)       │          │              │           │ Per-token    │
│               │          │              │           │ CopilotClient│
└──────────────┘          └──────────────┘          └──────────────┘
```

**Key design decisions:**

- **No global server token** — each user authenticates with their own GitHub PAT
- **Per-user isolation** — each token gets its own `CopilotClient` and sessions are keyed by `token:sessionId`
- **No server-side token storage** — tokens exist only in browser localStorage and in-memory Maps during active sessions
- **CI/testing fallback** — the server falls back to `COPILOT_GITHUB_TOKEN` env var if no `Authorization` header is present

## Infrastructure

### Docker

The application runs in a minimal Docker container:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json server.ts ./
COPY public ./public
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "--import", "tsx", "server.ts"]
```

No TypeScript compilation step — `tsx` transpiles on the fly at runtime.

### Azure Deployment

```
Internet
   │
   ▼
┌─────────────────────────┐         ┌──────────────────────────────┐
│  Azure Static Web Apps  │  /api/* │  Azure Container Apps        │
│  (Standard tier)        │────────►│  (Consumption plan)          │
│                         │  proxy  │                              │
│  Serves: public/        │         │  Express.js API server       │
│  Domain: test-chat.     │         │  Scale: 0–3 replicas         │
│    kscloud.io           │         │  0.25 vCPU · 0.5 Gi memory   │
└─────────────────────────┘         └──────────────────────────────┘
```

| Resource | Purpose | Tier |
|----------|---------|------|
| **Static Web Apps** | Serves frontend files, proxies `/api/*` to backend | Standard |
| **Container Apps** | Runs the Express server in a Docker container | Consumption (scale-to-zero) |
| **Container Apps Environment** | Shared hosting environment for Container Apps | Consumption |
| **Storage Account** | Persists session metadata (Table) and chat messages (Blob) | Standard LRS |
| **Log Analytics** | Collects logs from Container Apps | PerGB2018, 30-day retention |

**Scaling:** Replicas scale from 0 to 3 based on concurrent HTTP requests (20 per replica). Scale-to-zero means no cost when idle. See [SCALING.md](SCALING.md) for details.

### CI/CD Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `deploy-infra.yml` | Push to `main` changing `infra/**` | Deploys Azure Bicep templates |
| `deploy-app.yml` | Push to `main` changing app files | Builds Docker → GHCR → deploys Container App + SWA |
| `e2e-tests.yml` | After `deploy-app` on `main` | Runs Playwright E2E tests against production |
| `e2e-local.yml` | PRs and non-main pushes | Runs Playwright E2E tests against local server |

## Key Dependencies

| Package | Purpose |
|---------|---------|
| [`@github/copilot-sdk`](https://github.com/github/copilot-sdk) | Official SDK for communicating with GitHub Copilot |
| [`express`](https://expressjs.com/) | Web server framework |
| [`@azure/data-tables`](https://github.com/Azure/azure-sdk-for-js) | Azure Table Storage client for session metadata |
| [`@azure/storage-blob`](https://github.com/Azure/azure-sdk-for-js) | Azure Blob Storage client for chat message history |
| [`dotenv`](https://github.com/motdotla/dotenv) | Loads environment variables from `.env` |
| [`tsx`](https://github.com/privatenumber/tsx) | Runs TypeScript directly without a compile step |
| [`typescript`](https://www.typescriptlang.org/) | Type checking (`npx tsc --noEmit`) |
| [`@playwright/test`](https://playwright.dev/) | Browser-based E2E testing |

## Data Flow

### Chat Message Lifecycle

```
1. User types message in textarea, clicks Send (or presses Enter)
                    │
2. Frontend: sendMessage()
   ├─ Displays user message bubble (blue, right-aligned)
   ├─ Creates assistant placeholder with typing indicator
   └─ POSTs to /api/chat with { message, sessionId, model }
                    │
3. Server: POST /api/chat handler
   ├─ Extracts token from Authorization header
   ├─ Gets or creates CopilotClient for token
   ├─ Gets existing session (by sessionId) or creates new one
   ├─ Sets SSE headers, registers event listeners
   └─ Calls session.send({ prompt: message })
                    │
4. Copilot SDK → CLI → GitHub Copilot Backend
   └─ Model generates response tokens
                    │
5. SDK fires events back to server
   ├─ assistant.message_delta → server writes SSE delta event
   ├─ (repeats for each token)
   └─ session.idle → server writes SSE done event, closes response
                    │
6. Frontend: SSE reader loop
   ├─ Parses each delta → appends content to assistant bubble
   ├─ Auto-scrolls to bottom
   └─ On done → stores sessionId, removes typing indicator
                    │
7. User sees complete response, can send follow-up (reuses sessionId)
```

### Multi-Turn Context

When the user sends a follow-up message, the frontend includes the `sessionId` from the previous response. The server looks up the existing `CopilotSession` for that ID, which maintains full conversation history via the SDK. This allows the model to reference earlier messages in the conversation.

Clicking "New Chat" resets `sessionId` to `null`, which causes the server to create a fresh session on the next message.

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Express server listen port |
| `NODE_ENV` | No | `development` | Set to `production` in Docker/Azure |
| `COPILOT_GITHUB_TOKEN` | No | — | Fallback token when no `Authorization` header (for CI/testing) |
| `AZURE_STORAGE_CONNECTION_STRING` | No | — | Azure Storage connection string for persistent sessions |

For local development, copy `.env.example` to `.env` and fill in the values.

## Related Documentation

- [README.md](README.md) — Setup, usage, and quick start
- [docs.md](docs.md) — Detailed technical documentation
- [TESTING.md](TESTING.md) — Integration and E2E test guide
- [AZURE_DEPLOYMENT.md](AZURE_DEPLOYMENT.md) — Azure infrastructure and deployment
- [SCALING.md](SCALING.md) — Container App scaling configuration
