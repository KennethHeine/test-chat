# System Architecture

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
├── tools.ts               # GitHub API tools factory — 5 tools bound to user's token
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

## SSE Event Flow

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

| SDK Event | SSE Event Sent | Purpose |
|-----------|---------------|---------|
| `assistant.message_delta` | `{"type":"delta","content":"..."}` | Each token chunk from the model |
| `tool.execution_start` | `{"type":"tool_start","tool":"..."}` | Agent started executing a tool |
| `tool.execution_complete` | `{"type":"tool_complete"}` | Tool execution finished |
| `session.title_changed` | `{"type":"title","title":"..."}` | AI-generated session title |
| `assistant.usage` | `{"type":"usage","usage":{...}}` | Token usage (model, inputTokens, outputTokens) |
| `session.mode_changed` (→ plan) | `{"type":"planning_start"}` | Agent entered planning mode |
| `session.mode_changed` (← plan) | `{"type":"plan_ready"}` | Agent exited planning mode |
| `assistant.intent` | `{"type":"intent","intent":"..."}` | Current agent intent/activity description |
| `subagent.started` | `{"type":"subagent_start","name":"..."}` | Sub-agent began |
| `subagent.completed` | `{"type":"subagent_end","name":"...","success":true}` | Sub-agent finished successfully |
| `subagent.failed` | `{"type":"subagent_end","name":"...","success":false,"error":"..."}` | Sub-agent failed |
| `session.compaction_start` | `{"type":"compaction","started":true}` | Context compaction began |
| `session.compaction_complete` | `{"type":"compaction","started":false,"tokensRemoved":N}` | Context compaction finished |
| `session.idle` | `{"type":"done","sessionId":"..."}` | Streaming complete — includes session ID for follow-ups |
| `session.error` | `{"type":"error","message":"..."}` | Error during generation |

## Infrastructure

### Docker

The application runs in a minimal Docker container:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json server.ts storage.ts tools.ts ./
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
| **Storage Account** | Persists session metadata (Table) and chat messages (Blob) | Standard LRS |
| **Log Analytics** | Collects logs from Container Apps | PerGB2018, 30-day retention |

### CI/CD Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `deploy-infra.yml` | Push to `main` changing `infra/**` | Deploys Azure Bicep templates |
| `deploy-app.yml` | Push to `main` changing app files | Builds Docker → GHCR → deploys Container App + SWA |
| `deploy-ephemeral.yml` | PRs targeting `main` (excl. Dependabot) | Deploys/tears down ephemeral preview environments |
| `e2e-tests.yml` | After `deploy-app` on `main` | Runs Playwright E2E tests against production |
| `e2e-local.yml` | PRs and non-main pushes | Runs Playwright E2E tests against local server |

## Key Dependencies

| Package | Purpose |
|---------|---------|
| [`@github/copilot-sdk`](https://github.com/github/copilot-sdk) | Official SDK for communicating with GitHub Copilot |
| [`express`](https://expressjs.com/) | Web server framework |
| [`@azure/data-tables`](https://github.com/Azure/azure-sdk-for-js) | Azure Table Storage client for session metadata |
| [`@azure/storage-blob`](https://github.com/Azure/azure-sdk-for-js) | Azure Blob Storage client for chat message history |
| [`@azure/identity`](https://github.com/Azure/azure-sdk-for-js) | DefaultAzureCredential for managed identity auth to Storage |
| [`dotenv`](https://github.com/motdotla/dotenv) | Loads environment variables from `.env` |
| [`tsx`](https://github.com/privatenumber/tsx) | Runs TypeScript directly without a compile step |
| [`typescript`](https://www.typescriptlang.org/) | Type checking (`npx tsc --noEmit`) |
| [`@playwright/test`](https://playwright.dev/) | Browser-based E2E testing |

## Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Express server listen port |
| `NODE_ENV` | No | `development` | Set to `production` in Docker/Azure |
| `COPILOT_GITHUB_TOKEN` | No | — | Fallback token when no `Authorization` header (for CI/testing) |
| `AZURE_STORAGE_ACCOUNT_NAME` | No | — | Azure Storage account name for persistent sessions (uses managed identity) |

## Related Documentation

- [Frontend](frontend.md) — UI components, state management, session persistence
- [Backend](backend.md) — Express server, SDK integration, API endpoints, storage
- [Frontend Testing](frontend-testing.md) — Playwright E2E tests
- [Backend Testing](backend-testing.md) — Storage unit tests and integration tests
- [Deployment](deployment.md) — Azure infrastructure and deployment guide
- [SDK Reference](sdk-reference.md) — Copilot SDK deep dive and feature inventory
