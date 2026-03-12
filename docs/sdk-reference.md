# Backend Architecture & GitHub Copilot SDK Deep Dive

This document provides a comprehensive, detailed reference for how the backend works and how the [`@github/copilot-sdk`](https://github.com/github/copilot-sdk) is integrated. It also catalogs every SDK feature — marking which ones we use, which ones we don't, and whether adopting them would benefit this project.

---

## Table of Contents

- [1. High-Level Architecture](#1-high-level-architecture)
- [2. Backend Deep Dive (server.ts)](#2-backend-deep-dive-serverts)
  - [2.1 Server Bootstrap](#21-server-bootstrap)
  - [2.2 Middleware Pipeline](#22-middleware-pipeline)
  - [2.3 Authentication Flow](#23-authentication-flow)
  - [2.4 Per-User Client Management](#24-per-user-client-management)
  - [2.5 Session Management](#25-session-management)
  - [2.6 API Endpoints](#26-api-endpoints)
  - [2.7 SSE Streaming Pipeline](#27-sse-streaming-pipeline)
  - [2.8 Graceful Shutdown](#28-graceful-shutdown)
- [3. Storage Architecture (storage.ts)](#3-storage-architecture-storagets)
  - [3.1 SessionStore Interface](#31-sessionstore-interface)
  - [3.2 InMemorySessionStore](#32-inmemorysessionstore)
  - [3.3 AzureSessionStore](#33-azuresessionstore)
  - [3.4 Token Hashing and User Isolation](#34-token-hashing-and-user-isolation)
- [4. How the Copilot SDK Works](#4-how-the-copilot-sdk-works)
  - [4.1 SDK Architecture](#41-sdk-architecture)
  - [4.2 CopilotClient Lifecycle](#42-copilotclient-lifecycle)
  - [4.3 CopilotSession Lifecycle](#43-copilotsession-lifecycle)
  - [4.4 Event System](#44-event-system)
  - [4.5 JSON-RPC Protocol](#45-json-rpc-protocol)
  - [4.6 Permission System](#46-permission-system)
- [5. SDK Integration in This Project](#5-sdk-integration-in-this-project)
  - [5.1 Client Creation](#51-client-creation)
  - [5.2 Session Creation](#52-session-creation)
  - [5.3 Message Sending and Streaming](#53-message-sending-and-streaming)
  - [5.4 Event Listener Cleanup](#54-event-listener-cleanup)
  - [5.5 Model Listing](#55-model-listing)
- [6. Data Flow: Complete Request Lifecycle](#6-data-flow-complete-request-lifecycle)
- [7. Session Context: How Conversation State Is Managed](#7-session-context-how-conversation-state-is-managed)
  - [7.1 The Three Context Layers](#71-the-three-context-layers)
  - [7.2 SDK Internal Context (The Authoritative Layer)](#72-sdk-internal-context-the-authoritative-layer)
  - [7.3 Backend Context: Session Reuse vs. Creation](#73-backend-context-session-reuse-vs-creation)
  - [7.4 Frontend Context: localStorage and Session Switching](#74-frontend-context-localstorage-and-session-switching)
  - [7.5 Context Synchronization Between Layers](#75-context-synchronization-between-layers)
  - [7.6 Context Behavior in Key Scenarios](#76-context-behavior-in-key-scenarios)
  - [7.7 Context Window Management and Compaction](#77-context-window-management-and-compaction)
  - [7.8 Known Context Gaps and Limitations](#78-known-context-gaps-and-limitations)
- [8. Unused SDK Features — Complete Inventory](#8-unused-sdk-features--complete-inventory)
  - [8.1 Client-Level Features](#81-client-level-features)
  - [8.2 Session-Level Features](#82-session-level-features)
  - [8.3 Tool System](#83-tool-system)
  - [8.4 System Message Customization](#84-system-message-customization)
  - [8.5 Infinite Sessions and Context Compaction](#85-infinite-sessions-and-context-compaction)
  - [8.6 Session Hooks](#86-session-hooks)
  - [8.7 User Input Requests](#87-user-input-requests)
  - [8.8 BYOK (Bring Your Own Key)](#88-byok-bring-your-own-key)
  - [8.9 MCP Server Integration](#89-mcp-server-integration)
  - [8.10 Custom Agents](#810-custom-agents)
  - [8.11 File and Image Attachments](#811-file-and-image-attachments)
  - [8.12 Reasoning Effort Control](#812-reasoning-effort-control)
  - [8.13 Additional Unused Events](#813-additional-unused-events)
  - [8.14 RPC Methods](#814-rpc-methods)
- [9. Recommendations: Which Unused Features to Adopt](#9-recommendations-which-unused-features-to-adopt)

---

## 1. High-Level Architecture

```
┌─────────────┐     HTTP/SSE      ┌──────────────────┐    JSON-RPC     ┌─────────────┐        ┌─────────────────┐
│   Browser    │  ◄──────────►    │  Express Server   │  ◄──────────►  │ Copilot CLI  │  ◄──►  │ GitHub Copilot  │
│  (HTML/JS)   │   /api/chat      │  (server.ts)      │   via SDK      │ (per-token)  │        │ Backend (cloud) │
│  Token in    │  Authorization:  │  Per-user clients  │                │              │        │                 │
│  localStorage│  Bearer <token>  │  in Map<token,     │                │              │        │                 │
│              │                  │  CopilotClient>   │                │              │        │                 │
└─────────────┘                   └──────────────────┘                 └─────────────┘        └─────────────────┘
                                         │
                                         ▼
                                  ┌──────────────────┐
                                  │  Storage Layer    │
                                  │  (storage.ts)     │
                                  │  ┌──────────────┐ │
                                  │  │ InMemoryStore│ │  ← Default (data lost on restart)
                                  │  └──────────────┘ │
                                  │  ┌──────────────┐ │
                                  │  │ AzureStore   │ │  ← When AZURE_STORAGE_ACCOUNT_NAME set
                                  │  │ Table + Blob │ │
                                  │  └──────────────┘ │
                                  └──────────────────┘
```

The system has four layers:

1. **Browser** — Vanilla HTML/JS chat UI. Users paste their GitHub PAT (Personal Access Token), pick a model, and chat. Responses stream in real time via Server-Sent Events (SSE).
2. **Express Server (`server.ts`)** — The backend. Hosts the frontend as static files, manages per-user Copilot SDK clients, proxies chat messages through the SDK, and translates SDK events into SSE for the browser.
3. **Copilot SDK (`@github/copilot-sdk`)** — Official TypeScript SDK. Manages the Copilot CLI process, communicates over JSON-RPC, and exposes a high-level event-driven API.
4. **GitHub Copilot Backend (cloud)** — The cloud service that runs model inference. Handles auth, model selection, billing, and tool orchestration.

Between the Express server and the browser, there's also a **storage layer** (`storage.ts`) that persists session metadata and chat messages — either in-memory or in Azure Table Storage + Blob Storage.

---

## 2. Backend Deep Dive (server.ts)

The entire backend is a single TypeScript file (`server.ts`, ~330 lines) executed directly via `tsx` without a compile step.

### 2.1 Server Bootstrap

```typescript
import express from "express";
import { CopilotClient, CopilotSession, approveAll } from "@github/copilot-sdk";
import { config } from "dotenv";

config(); // Load .env file

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);
```

The server:
1. Loads environment variables from `.env` via `dotenv`
2. Creates an Express app
3. Reads the port from `PORT` env var (defaults to 3000)

At the bottom of the file, `startServer()` initializes the storage layer and starts listening:

```typescript
async function startServer() {
  // Initialize Azure storage if configured (with fallback to in-memory)
  if (sessionStore instanceof AzureSessionStore) {
    try {
      await sessionStore.initialize();
    } catch (err) {
      sessionStore = new InMemorySessionStore(); // Fallback
    }
  }

  const server = app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });

  // Register SIGINT/SIGTERM handlers for graceful shutdown
}
```

### 2.2 Middleware Pipeline

```
Incoming Request
    ↓
express.json()          → Parses JSON request bodies
    ↓
express.static('public') → Serves frontend files (index.html, app.js)
    ↓
Route Handler            → One of the 7 API endpoints
```

There are only two middleware functions — JSON body parsing and static file serving. No CORS, rate limiting, or request logging middleware is configured.

### 2.3 Authentication Flow

Every authenticated endpoint extracts the user's GitHub token from the `Authorization` header:

```typescript
function extractToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  // Fallback to env var for testing/CI
  return process.env.COPILOT_GITHUB_TOKEN || undefined;
}
```

**How it works:**
1. The browser stores the user's GitHub PAT in `localStorage`
2. On every API request, the frontend includes `Authorization: Bearer <token>`
3. The backend extracts the raw token string
4. If no header is present, it falls back to `COPILOT_GITHUB_TOKEN` env var (for testing/CI)
5. If no token is found at all, the endpoint returns 401

**Security model:** The server never stores tokens to disk. Tokens exist only in memory — in the `Map<string, CopilotClient>` and as keys in `Map<string, CopilotSession>`. The storage layer only sees a SHA-256 hash of the token for user isolation.

### 2.4 Per-User Client Management

Each unique GitHub token gets its own `CopilotClient` instance. This is critical because each client spawns a separate Copilot CLI process authenticated as that user.

```typescript
const clients = new Map<string, CopilotClient>();

async function getClientForToken(token: string): Promise<CopilotClient> {
  if (clients.has(token)) {
    return clients.get(token)!;
  }
  const client = new CopilotClient({ githubToken: token });
  await client.start();
  clients.set(token, client);
  return client;
}
```

**What happens under the hood when `client.start()` is called:**
1. The SDK locates the `copilot` CLI binary on the system PATH
2. It spawns the CLI in headless server mode as a child process
3. The CLI starts a JSON-RPC server (over stdio by default)
4. The SDK establishes a JSON-RPC connection to the CLI
5. The CLI authenticates with GitHub using the provided `githubToken`
6. The client is ready to create sessions and list models

**Memory implications:** Each user gets their own CLI process. For N concurrent users, there will be N CLI processes running. The `clients` Map is never pruned — once created, a client lives until the server shuts down.

```
Map<token, CopilotClient>
  ├─ "github_pat_user1_xxx" → CopilotClient → CLI process (PID 1234)
  ├─ "github_pat_user2_yyy" → CopilotClient → CLI process (PID 1235)
  └─ "github_pat_user3_zzz" → CopilotClient → CLI process (PID 1236)
```

### 2.5 Session Management

Sessions represent individual conversations. They are keyed by a composite of the user's token and a session UUID:

```typescript
const sessions = new Map<string, CopilotSession>();

function sessionKey(token: string, sessionId: string): string {
  return `${token}:${sessionId}`;
}
```

**Two layers of session state exist:**

| Layer | Storage | Lifetime | Contains |
|-------|---------|----------|----------|
| **SDK sessions** (in `sessions` Map) | In-memory | Until server restart | Live `CopilotSession` objects with conversation context |
| **Persisted sessions** (in `sessionStore`) | In-memory or Azure | Survives restart (Azure only) | Session metadata (title, model, timestamps) + chat messages |

When a new chat is started:
1. A UUID is generated for the session
2. A new `CopilotSession` is created via the SDK
3. The session object is stored in the `sessions` Map
4. Session metadata (title, model, timestamps) is saved to the `sessionStore`

When an existing chat continues:
1. The frontend sends the `sessionId` with the message
2. The backend looks up the `CopilotSession` in the `sessions` Map
3. If found, it reuses the session (maintaining conversation context in the SDK)
4. If not found (e.g., after server restart), it creates a new SDK session (conversation context is lost, but persisted messages are still available)

### 2.6 API Endpoints

#### `GET /api/health` — Health Check (No Auth)

Returns server status, Copilot CLI availability, and which storage backend is active.

```json
{ "status": "ok", "copilotCli": true, "storage": "memory" }
```

The CLI check runs `copilot --version` via `execSync`. This is a synchronous shell execution — it blocks the event loop briefly but is only called on health check requests.

#### `GET /api/models` — List Available Models (Auth Required)

Fetches the list of AI models available to the user from the Copilot SDK:

```typescript
const c = await getClientForToken(token);
const models = await c.listModels();
res.json({ models });
```

The SDK caches model lists internally, so subsequent calls are fast.

#### `GET /api/sessions` — List User Sessions (Auth Required)

Lists all persisted sessions for the authenticated user:

```typescript
const tHash = await hashToken(token);
const userSessions = await sessionStore.listSessions(tHash);
```

Sessions are identified by token hash, ensuring users can only see their own sessions.

#### `DELETE /api/sessions/:id` — Delete Session (Auth Required)

Removes a session from both the in-memory SDK sessions Map and the persistent store:

```typescript
sessions.delete(sessionKey(token, sid));        // Remove SDK session
await sessionStore.deleteSession(tHash, sid);    // Remove persisted data
```

Returns 404 if the session doesn't exist in either layer.

#### `GET /api/sessions/:id/messages` — Get Messages (Auth Required)

Returns persisted chat messages for a session from the storage layer.

#### `PUT /api/sessions/:id/messages` — Save Messages (Auth Required)

Saves chat messages to the storage layer. The frontend calls this after each assistant response to persist the conversation.

#### `POST /api/chat` — Chat with Streaming (Auth Required)

The core endpoint. This is the most complex route — see [Section 2.7](#27-sse-streaming-pipeline) for the full breakdown.

### 2.7 SSE Streaming Pipeline

The chat endpoint uses Server-Sent Events (SSE) to stream the assistant's response token-by-token to the browser.

**Step-by-step flow:**

```
Browser                          Express Server                    Copilot SDK / CLI
  │                                    │                                  │
  │  POST /api/chat                    │                                  │
  │  { message, sessionId, model }     │                                  │
  │  Authorization: Bearer <token>     │                                  │
  │ ──────────────────────────────►    │                                  │
  │                                    │                                  │
  │    ◄── SSE Headers ──────────────  │                                  │
  │    Content-Type: text/event-stream │                                  │
  │                                    │                                  │
  │                                    │  getClientForToken(token)        │
  │                                    │  ────────────────────────►       │
  │                                    │  ◄── CopilotClient ──────       │
  │                                    │                                  │
  │                                    │  createSession() or reuse       │
  │                                    │  ────────────────────────►       │
  │                                    │  ◄── CopilotSession ─────       │
  │                                    │                                  │
  │                                    │  Register event listeners:       │
  │                                    │  • assistant.message_delta       │
  │                                    │  • session.idle                  │
  │                                    │  • session.error                 │
  │                                    │                                  │
  │                                    │  session.send({ prompt })        │
  │                                    │  ────────────────────────►       │
  │                                    │                                  │
  │                                    │  ◄── message_delta event ──      │
  │  ◄── data: {"type":"delta"} ────   │                                  │
  │                                    │  ◄── message_delta event ──      │
  │  ◄── data: {"type":"delta"} ────   │                                  │
  │                                    │  ...repeats...                   │
  │                                    │                                  │
  │                                    │  ◄── session.idle event ───      │
  │  ◄── data: {"type":"done"} ─────   │                                  │
  │                                    │  cleanup() + res.end()           │
  │                                    │                                  │
```

**The SSE response format:**

```
data: {"type":"delta","content":"The"}

data: {"type":"delta","content":" answer"}

data: {"type":"delta","content":" is"}

data: {"type":"delta","content":" 4."}

data: {"type":"done","sessionId":"abc-123-def"}
```

Each `data:` line is a JSON object with one of three types:
- **`delta`** — An incremental text chunk from the assistant
- **`done`** — The response is complete; includes the session ID for follow-up messages
- **`error`** — An error occurred during processing

**Event listener management:**

The backend carefully manages event listeners to prevent memory leaks:

```typescript
const unsubscribers: (() => void)[] = [];

const cleanup = () => {
  for (const unsub of unsubscribers) unsub();
  unsubscribers.length = 0;
};

// Each .on() returns an unsubscribe function
unsubscribers.push(
  session.on("assistant.message_delta", (event) => { /* ... */ })
);
unsubscribers.push(
  session.on("session.idle", () => { cleanup(); res.end(); })
);
unsubscribers.push(
  session.on("session.error", (event) => { cleanup(); res.end(); })
);

// Also cleanup if client disconnects mid-stream
req.on("close", cleanup);
```

This pattern ensures that:
1. Listeners are removed after the response completes (idle or error)
2. Listeners are removed if the client disconnects (browser tab closed)
3. No listeners accumulate across multiple messages in the same session

### 2.8 Graceful Shutdown

On `SIGINT` (Ctrl+C) or `SIGTERM` (container stop), the server:

```typescript
async function shutdown() {
  // Stop all Copilot CLI processes
  const stopPromises = [...clients.values()].map((c) =>
    c.stop().catch(() => {})
  );
  await Promise.all(stopPromises);
  server.close();
  process.exit(0);
}
```

1. Iterates over all `CopilotClient` instances
2. Calls `client.stop()` on each (gracefully shuts down the CLI process)
3. Closes the HTTP server
4. Exits the process

---

## 3. Storage Architecture (storage.ts)

The storage layer provides persistent session metadata and chat message storage, abstracted behind a `SessionStore` interface.

### 3.1 SessionStore Interface

```typescript
interface SessionStore {
  listSessions(tokenHash: string): Promise<SessionMetadata[]>;
  getSession(tokenHash: string, sessionId: string): Promise<SessionMetadata | null>;
  saveSession(tokenHash: string, meta: SessionMetadata): Promise<void>;
  deleteSession(tokenHash: string, sessionId: string): Promise<boolean>;
  getMessages(tokenHash: string, sessionId: string): Promise<ChatMessage[]>;
  saveMessages(tokenHash: string, sessionId: string, messages: ChatMessage[]): Promise<void>;
}
```

**Data types:**

```typescript
interface SessionMetadata {
  id: string;        // UUID
  title: string;     // First 50 chars of first message
  model: string;     // e.g., "gpt-4.1"
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
}

interface ChatMessage {
  role: "user" | "assistant" | "error";
  text: string;
}
```

### 3.2 InMemorySessionStore

The default storage backend. Uses two JavaScript `Map` objects:

```typescript
class InMemorySessionStore implements SessionStore {
  private sessions = new Map<string, SessionMetadata>();  // Key: "tokenHash:sessionId"
  private messages = new Map<string, ChatMessage[]>();    // Key: "tokenHash:sessionId"
}
```

**Characteristics:**
- Zero configuration required
- Data lost on server restart
- O(n) session listing (scans all entries by prefix)
- No size limits — grows with usage
- Suitable for development and testing

### 3.3 AzureSessionStore

Activated when `AZURE_STORAGE_ACCOUNT_NAME` is set. Uses two Azure Storage services:

| Service | Resource | Purpose | Key Structure |
|---------|----------|---------|---------------|
| **Azure Table Storage** | `sessions` table | Session metadata (title, model, timestamps) | PartitionKey = tokenHash, RowKey = sessionId |
| **Azure Blob Storage** | `chatmessages` container | Chat messages as JSON files | Blob path = `{tokenHash}/{sessionId}.json` |

**Authentication:** Uses `DefaultAzureCredential` from `@azure/identity` — supports managed identity in Azure, Azure CLI locally, and other credential chain methods. No connection strings or keys are stored.

**Initialization:**

```typescript
constructor(accountName: string) {
  const credential = new DefaultAzureCredential();
  const tableUrl = `https://${accountName}.table.core.windows.net`;
  const blobUrl = `https://${accountName}.blob.core.windows.net`;
  this.tableClient = new TableClient(tableUrl, "sessions", credential);
  this.containerClient = blobService.getContainerClient("chatmessages");
}

async initialize(): Promise<void> {
  await this.tableClient.createTable();         // Idempotent (ignores 409)
  await this.containerClient.createIfNotExists();
}
```

**Fallback behavior:** If Azure initialization fails at startup (e.g., missing permissions, wrong account name), the server automatically falls back to `InMemorySessionStore` and logs a warning.

### 3.4 Token Hashing and User Isolation

User tokens are never stored directly. Instead, a SHA-256 hash is computed:

```typescript
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

This hash is used as a partition key in Azure Table Storage and as a directory prefix in Blob Storage, ensuring:
- Users can only access their own sessions
- The raw token is never persisted to storage
- The token hash is validated as hex-only before use in OData queries (preventing injection attacks)

---

## 4. How the Copilot SDK Works

### 4.1 SDK Architecture

The `@github/copilot-sdk` (v0.1.32) is a TypeScript wrapper around the Copilot CLI. Its architecture:

```
@github/copilot-sdk (your code uses this)
    │
    ├── CopilotClient          → Manages CLI process lifecycle + JSON-RPC connection
    │   ├── start()            → Spawns CLI, establishes RPC
    │   ├── stop()             → Graceful shutdown
    │   ├── createSession()    → Creates conversation via RPC
    │   ├── resumeSession()    → Resumes existing conversation
    │   └── listModels()       → Queries available models
    │
    ├── CopilotSession         → Represents a single conversation
    │   ├── send()             → Sends user message via RPC
    │   ├── on()               → Subscribes to events (streaming, idle, error, etc.)
    │   ├── abort()            → Cancels in-progress message
    │   └── disconnect()       → Releases session resources
    │
    ├── defineTool()           → Helper to create type-safe tool definitions
    ├── approveAll()           → Pre-built permission handler (approves everything)
    │
    └── @github/copilot (dependency)
        └── index.js           → The actual Copilot CLI binary (16 MB compiled JS)
            ├── JSON-RPC server
            ├── Agent runtime (planning, tool invocation, file edits)
            ├── Built-in tools (shell, file read/write, web search, etc.)
            └── Model inference via GitHub Copilot Backend
```

**Key insight:** The SDK doesn't run AI inference itself. It controls the Copilot CLI, which is a full-featured agent runtime. The CLI handles:
- Planning and reasoning
- Tool invocation (shell commands, file edits, web requests)
- Context window management
- Token counting and billing
- Multi-turn conversation state

### 4.2 CopilotClient Lifecycle

```
new CopilotClient({ githubToken })
    │
    ▼
client.start()
    │  1. Locate `copilot` binary (PATH or cliPath option)
    │  2. Spawn CLI process: `copilot --stdio` (or TCP)
    │  3. Establish JSON-RPC connection
    │  4. Authenticate with GitHub using the token
    │  5. State transitions: disconnected → connecting → connected
    ▼
[Client Ready]
    │
    ├── client.createSession()  → New conversation
    ├── client.listModels()     → Available models
    ├── client.ping()           → Health check
    ├── client.getState()       → "connected" | "disconnected" | etc.
    │
    ▼
client.stop()
    │  1. Close all active sessions
    │  2. Send shutdown signal to CLI process
    │  3. Wait for process exit
    │  4. State: connected → disconnected
    ▼
[Client Stopped]
```

**Connection options (from `CopilotClientOptions`):**

| Option | Default | Description |
|--------|---------|-------------|
| `githubToken` | — | GitHub PAT for authentication |
| `cliPath` | `"copilot"` | Path to CLI binary |
| `cliUrl` | — | Connect to existing CLI server instead of spawning |
| `port` | `0` (random) | TCP port for RPC (when not using stdio) |
| `useStdio` | `true` | Use stdio transport (faster, no port needed) |
| `logLevel` | `"info"` | CLI log level |
| `autoStart` | `true` | Auto-start CLI on first use |
| `autoRestart` | `true` | Auto-restart CLI if it crashes |
| `useLoggedInUser` | `true` | Use `copilot auth` credentials (overridden when `githubToken` is set) |

### 4.3 CopilotSession Lifecycle

```
client.createSession({ model, streaming, onPermissionRequest, ... })
    │
    │  1. Send "session.create" RPC to CLI
    │  2. CLI allocates conversation state
    │  3. SDK wraps response in CopilotSession object
    │  4. Session has a unique sessionId
    ▼
[Session Active]
    │
    ├── session.send({ prompt })
    │       │  1. Send "message.send" RPC
    │       │  2. CLI processes with model
    │       │  3. Events stream back:
    │       │     • assistant.message_delta (streaming tokens)
    │       │     • tool.execution_start/complete (if tools used)
    │       │     • assistant.message (final complete message)
    │       │     • session.idle (processing done)
    │       ▼
    │
    ├── session.on(eventType, handler)
    │       Returns () => void (unsubscribe function)
    │
    ├── session.abort()
    │       Cancels in-progress message
    │
    ▼
session.disconnect()
    │  1. Release event listeners
    │  2. Free resources on CLI side
    │  3. Session data preserved on disk for resumption
    ▼
[Session Disconnected]
```

### 4.4 Event System

The SDK uses an event-driven model. Sessions emit events during message processing:

| Event | When | Data |
|-------|------|------|
| `user.message` | User message sent | `{ content }` |
| `assistant.turn_start` | Agent starts responding | — |
| `assistant.message_delta` | Streaming token chunk | `{ deltaContent }` |
| `assistant.message` | Complete response | `{ content }` |
| `assistant.reasoning_delta` | Reasoning chunk (thinking models) | `{ deltaContent }` |
| `assistant.reasoning` | Complete reasoning | `{ content }` |
| `assistant.usage` | Token usage metrics | `{ promptTokens, completionTokens, totalTokens }` |
| `tool.call` | Model wants to call a tool | `{ toolName, toolArgs }` |
| `tool.execution_start` | Tool execution begins | `{ toolName }` |
| `tool.execution_progress` | Tool progress update | `{ progress }` |
| `tool.execution_complete` | Tool execution done | `{ toolName, result }` |
| `tool.result` | Tool result sent to model | `{ result }` |
| `permission.requested` | Permission needed | `{ kind, toolCallId }` |
| `permission.completed` | Permission resolved | `{ approved }` |
| `user_input.requested` | Agent asks user a question | `{ question, choices }` |
| `user_input.completed` | User answered | `{ answer }` |
| `session.idle` | Session done processing | `{ backgroundTasks }` |
| `session.error` | Error occurred | `{ message }` |
| `session.title_changed` | Title auto-generated | `{ title }` |
| `session.model_change` | Model switched | `{ model }` |
| `session.truncation` | Context truncated | — |
| `session.compaction_start` | Context compaction began | — |
| `session.compaction_complete` | Context compaction done | `{ tokensSaved }` |
| `planning.started` | Planning phase began | — |
| `planning.end` | Planning phase done | — |
| `subagent.started` | Sub-agent launched | — |
| `subagent.completed` | Sub-agent done | — |
| `subagent.failed` | Sub-agent error | — |
| `skill.invoked` | Skill injected | — |
| `hook.start` / `hook.end` | Hook execution | — |

**This project uses only 3 of these events:** `assistant.message_delta`, `session.idle`, and `session.error`.

### 4.5 JSON-RPC Protocol

The SDK communicates with the CLI over JSON-RPC 2.0. The protocol supports both request/response and notification patterns:

**Server-scoped RPC methods (no session required):**

| Method | Purpose |
|--------|---------|
| `ping` | Health check |
| `models.list` | List available models |
| `tools.list` | List available tools |
| `account.getQuota` | Get premium request quota |

**Session-scoped RPC methods:**

| Method | Purpose |
|--------|---------|
| `model.getCurrent` / `model.switchTo` | Get/change model |
| `mode.get` / `mode.set` | Get/change agent mode |
| `plan.read` / `plan.update` / `plan.delete` | Manage plans |
| `workspace.listFiles` / `workspace.readFile` / `workspace.createFile` | File operations |
| `fleet.start` | Launch fleet of sub-agents |
| `agent.list` / `agent.getCurrent` / `agent.select` / `agent.deselect` | Agent management |
| `compaction.compact` | Trigger context compaction |
| `tools.handlePendingToolCall` | Resolve pending tool call |
| `permissions.handlePendingPermissionRequest` | Resolve pending permission |

### 4.6 Permission System

When the Copilot agent wants to perform an action (run a shell command, write a file, etc.), it requests permission. The SDK provides a callback mechanism:

```typescript
// The permission handler receives:
interface PermissionRequest {
  kind: "shell" | "write" | "read" | "mcp" | "url" | "memory" | "custom-tool";
  toolCallId?: string;
  // Additional fields vary by kind
}

// And must return:
interface PermissionRequestResult {
  kind: "approved" | "denied" | "modified";
  // For "modified": includes modified arguments
}
```

**This project uses `approveAll`** — a built-in handler that automatically approves every permission request. This is equivalent to running the CLI with `--allow-all`.

---

## 5. SDK Integration in This Project

### 5.1 Client Creation

```typescript
// server.ts line 44
const client = new CopilotClient({ githubToken: token });
await client.start();
```

**What we configure:**
- `githubToken` — The user's GitHub PAT

**What we use defaults for:**
- `cliPath` — Default `"copilot"` from PATH
- `useStdio` — Default `true` (stdio transport)
- `autoStart` — Default `true`
- `autoRestart` — Default `true`
- `logLevel` — Default `"info"`

### 5.2 Session Creation

```typescript
// server.ts lines 219-223
session = await c.createSession({
  model: model || "gpt-4.1",
  streaming: true,
  onPermissionRequest: approveAll,
});
```

**What we configure:**
- `model` — User-selected or default `"gpt-4.1"`
- `streaming` — Always `true` for real-time SSE
- `onPermissionRequest` — `approveAll` (auto-approve everything)

**What we don't configure (all defaults):**
- `sessionId` — Auto-generated by SDK
- `tools` — No custom tools
- `systemMessage` — Default Copilot persona
- `reasoningEffort` — Not set
- `infiniteSessions` — Enabled by default (SDK default)
- `hooks` — None
- `onUserInputRequest` — Not set (ask_user tool disabled)
- `provider` — Not set (uses GitHub Copilot backend)

### 5.3 Message Sending and Streaming

```typescript
// Register listeners
session.on("assistant.message_delta", (event) => {
  const content = event.data.deltaContent;
  if (content) {
    res.write(`data: ${JSON.stringify({ type: "delta", content })}\n\n`);
  }
});

session.on("session.idle", () => {
  res.write(`data: ${JSON.stringify({ type: "done", sessionId: sid })}\n\n`);
  cleanup();
  res.end();
});

session.on("session.error", (event) => {
  res.write(`data: ${JSON.stringify({ type: "error", message: event.data.message })}\n\n`);
  cleanup();
  res.end();
});

// Send the message (non-blocking — events fire as response generates)
await session.send({ prompt: message });
```

**Key pattern:** `session.send()` returns immediately after queuing the message. The actual response arrives asynchronously via events. The `session.idle` event signals that all processing is complete.

### 5.4 Event Listener Cleanup

```typescript
const unsubscribers: (() => void)[] = [];

const cleanup = () => {
  for (const unsub of unsubscribers) unsub();
  unsubscribers.length = 0;
};

unsubscribers.push(session.on("assistant.message_delta", handler));
unsubscribers.push(session.on("session.idle", handler));
unsubscribers.push(session.on("session.error", handler));

// Cleanup on client disconnect too
req.on("close", cleanup);
```

Each `session.on()` call returns an unsubscribe function. These are collected and called together when:
- The response completes (`session.idle`)
- An error occurs (`session.error`)
- The client disconnects (`req.on("close")`)

This prevents listener accumulation — critical because the same `CopilotSession` object is reused across multiple messages in the same conversation.

### 5.5 Model Listing

```typescript
const models = await c.listModels();
```

Returns an array of `ModelInfo` objects containing:
- `id` — Model identifier (e.g., `"gpt-4.1"`)
- `name` — Display name
- `capabilities` — Vision support, reasoning effort support, token limits
- `billing` — Premium request multiplier
- `policy` — Whether the model is enabled for the user

The frontend populates the model dropdown from this data.

---

## 6. Data Flow: Complete Request Lifecycle

Here is the complete flow for a chat message, from user keystroke to rendered response:

```
1. USER TYPES MESSAGE AND PRESSES ENTER
   │
   ▼
2. FRONTEND (app.js)
   │  • Reads message from input box
   │  • Gets sessionId from current session (or null for new chat)
   │  • Gets model from dropdown
   │  • Gets token from localStorage
   │  • Adds user message to UI immediately (optimistic)
   │  • Sends POST /api/chat with { message, sessionId, model }
   │    Headers: Authorization: Bearer <token>
   │
   ▼
3. EXPRESS SERVER (server.ts — POST /api/chat)
   │  • extractToken() → gets token from Authorization header
   │  • Validates message is a non-empty string
   │  • Sets SSE response headers
   │  • flushHeaders() → sends headers immediately
   │
   ▼
4. CLIENT LOOKUP
   │  • getClientForToken(token)
   │  • If new user: new CopilotClient({ githubToken }) → client.start()
   │    └── Spawns Copilot CLI process, establishes JSON-RPC
   │  • If returning user: reuses cached client
   │
   ▼
5. SESSION LOOKUP/CREATION
   │  • If sessionId provided and session exists in Map: reuse it
   │  • Otherwise:
   │    • Generate UUID (or use provided sessionId)
   │    • client.createSession({ model, streaming: true, onPermissionRequest: approveAll })
   │    • Store in sessions Map
   │    • Persist metadata to sessionStore (title = first 50 chars of message)
   │
   ▼
6. REGISTER SSE EVENT LISTENERS
   │  • session.on("assistant.message_delta") → writes SSE delta events
   │  • session.on("session.idle") → writes SSE done event, ends response
   │  • session.on("session.error") → writes SSE error event, ends response
   │  • req.on("close") → cleanup on client disconnect
   │
   ▼
7. SEND MESSAGE
   │  • session.send({ prompt: message })
   │  • SDK sends JSON-RPC "message.send" to CLI
   │  • CLI forwards to GitHub Copilot Backend
   │
   ▼
8. COPILOT BACKEND PROCESSES (cloud)
   │  • Model inference runs
   │  • Tokens stream back to CLI
   │  • CLI emits events to SDK
   │
   ▼
9. SDK EVENTS → SSE EVENTS
   │  • Each "assistant.message_delta" → res.write('data: {"type":"delta","content":"..."}\n\n')
   │  • "session.idle" → res.write('data: {"type":"done","sessionId":"..."}\n\n') + res.end()
   │
   ▼
10. FRONTEND RECEIVES SSE STREAM (app.js)
    │  • Reads response.body as ReadableStream
    │  • Parses SSE lines: data: {...}
    │  • For "delta" events: appends content to assistant message bubble
    │  • For "done" event: saves sessionId, persists messages to backend
    │  • Calls PUT /api/sessions/:id/messages to save conversation
    │
    ▼
11. USER SEES STREAMED RESPONSE
```

---

## 7. Session Context: How Conversation State Is Managed

Understanding how conversation context flows through the system is critical. This project has **three independent layers** of session state, each with different lifetimes, scopes, and roles. They are loosely coupled — not tightly synchronized — which has important implications for the user experience.

### 7.1 The Three Context Layers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        THREE LAYERS OF SESSION CONTEXT                      │
│                                                                             │
│  Layer 1: Frontend localStorage                                             │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │  • Full chat messages (user + assistant + error)                   │     │
│  │  • Session metadata (id, title, model, timestamps)                │     │
│  │  • Last active session ID                                          │     │
│  │  • Lifetime: Survives page refresh, survives server restart        │     │
│  │  • Role: Instant UI rendering, offline cache                       │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│  Layer 2: Backend SessionStore (storage.ts)                                 │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │  • Session metadata in Azure Table / in-memory Map                 │     │
│  │  • Chat messages as JSON in Azure Blob / in-memory Map             │     │
│  │  • Lifetime: Permanent (Azure) or until restart (in-memory)        │     │
│  │  • Role: Cross-device sync, source of truth for persistence        │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                             │
│  Layer 3: SDK CopilotSession (in-memory on server)                          │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │  • Full conversation context (messages, tool calls, reasoning)     │     │
│  │  • Internal context window with token counting                     │     │
│  │  • Managed by Copilot CLI process via JSON-RPC                     │     │
│  │  • Lifetime: Until server restart or session disconnect            │     │
│  │  • Role: AUTHORITATIVE source for AI conversation continuity       │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key insight:** The SDK session (Layer 3) is the **only** layer that the AI model actually uses. Layers 1 and 2 store messages for display and persistence, but they have no influence on the model's behavior. When the SDK session is lost (e.g., server restart), the model starts fresh — even though the messages are still visible in the UI.

### 7.2 SDK Internal Context (The Authoritative Layer)

The `CopilotSession` object inside the SDK is the true source of conversation context. It maintains:

- **Full message history** — Every user message and assistant response
- **Tool call records** — What tools were invoked and their results
- **System message** — The base instructions for the model
- **Token count** — How much of the context window is used
- **Context window management** — Automatic compaction when the window fills up

**How the SDK manages context internally:**

```
Message 1 → [user: "Hello"]
                ↓
         Context Window: [system_prompt, user: "Hello"]
                ↓
         Model processes → generates response
                ↓
Message 1 Response → [assistant: "Hi! How can I help?"]
                ↓
         Context Window: [system_prompt, user: "Hello", assistant: "Hi! How can I help?"]

Message 2 → [user: "What is TypeScript?"]
                ↓
         Context Window: [system_prompt, user: "Hello", assistant: "Hi!...", user: "What is TypeScript?"]
                ↓
         Model sees FULL conversation → generates contextually aware response
                ↓
         ...and so on, accumulating context with each turn
```

The SDK session object maintains this full context and sends it to the model with every new message. This is why:
- Multi-turn conversations work (the model remembers what you said earlier)
- The same session produces better responses over time (more context available)
- Losing the SDK session means losing this accumulated context

**How to access SDK context:**

```typescript
// Returns all events (messages, tool calls, etc.) from the session
const events = await session.getMessages();
// Note: This project does NOT call this method
```

### 7.3 Backend Context: Session Reuse vs. Creation

The backend's decision to reuse an existing SDK session or create a new one is the single most important factor for context continuity:

```typescript
// server.ts — POST /api/chat handler
let session: CopilotSession;
let sid = sessionId;
const key = sid ? sessionKey(token, sid) : "";

if (sid && sessions.has(key)) {
  // ✅ REUSE: Same CopilotSession object → full context preserved
  session = sessions.get(key)!;
} else {
  // ❌ NEW: Fresh CopilotSession → no conversation history
  sid = sid || generateSessionId();
  session = await c.createSession({
    model: model || "gpt-4.1",
    streaming: true,
    onPermissionRequest: approveAll,
  });
  sessions.set(sessionKey(token, sid), session);
}
```

**When is the session reused?**
- The frontend sends a `sessionId` **AND** the server has that session in its `sessions` Map
- This only works if the server has not restarted since the session was created
- When reused, the model has full awareness of all previous messages in the conversation

**When is a new session created?**
- First message in a new chat (no `sessionId` sent)
- The server restarted and the `sessions` Map was cleared
- The `sessionId` is unknown to the server (e.g., from a different server instance)

**What happens to context when a new session is created for an existing conversation:**
- The model starts fresh — it has **no memory** of previous messages
- The frontend still displays old messages (loaded from localStorage/storage)
- The user sees the full conversation history, but the model does not
- This creates a **visible context discontinuity**: the user can reference earlier messages, but the model won't understand the references

### 7.4 Frontend Context: localStorage and Session Switching

The frontend maintains its own session state for instant UI rendering:

**Active session tracking:**

```javascript
// app.js — global state
let sessionId = null;  // Currently active session ID
```

**Saving messages after each response:**

```javascript
// After receiving "done" SSE event:
// 1. Update localStorage immediately
saveCurrentSessionMessages();

// 2. Persist to backend (fire-and-forget)
persistMessagesToBackend(sessionId, messages);
```

**Session switching flow:**

```javascript
function switchToSession(sid) {
  // Step 1: Save current session's messages
  if (sessionId && sessionId !== sid) {
    saveCurrentSessionMessages();
  }

  // Step 2: Load target session from localStorage
  const sessions = loadSavedSessions();
  const target = sessions.find((s) => s.id === sid);
  if (!target) return;

  // Step 3: Set as active and restore messages to DOM
  sessionId = sid;
  localStorage.setItem("copilot_last_session", sid);
  clearMessagesOnly();
  for (const msg of target.messages) {
    appendMessage(msg.role, msg.text);
  }
}
```

**Key detail:** When switching sessions, the frontend loads messages from localStorage — it does NOT reload from the backend. The backend's SDK session may or may not exist for the target session.

**New chat flow:**

```javascript
newChatBtn.addEventListener("click", () => {
  if (sessionId) {
    saveCurrentSessionMessages();  // Save before clearing
  }
  sessionId = null;                // Clear session ID → next message creates new session
  localStorage.removeItem("copilot_last_session");
  clearChatUI();
});
```

Setting `sessionId = null` means the next `POST /api/chat` will send `sessionId: null`, and the backend will generate a new UUID and create a fresh SDK session.

### 7.5 Context Synchronization Between Layers

The three layers synchronize at specific moments, but they can diverge:

```
┌──────────────────┐   ┌───────────────────┐   ┌──────────────────┐
│  localStorage     │   │  Backend Store     │   │  SDK Session     │
│  (frontend)       │   │  (server)          │   │  (server memory) │
└────────┬─────────┘   └────────┬──────────┘   └────────┬─────────┘
         │                      │                        │
  ON SEND MESSAGE:              │                        │
         │──── POST /api/chat ──┼────────────────────────▶ session.send()
         │                      │                        │  (context grows)
         │                      │                        │
  ON RECEIVE RESPONSE:          │                        │
         │◄── SSE deltas ───────┼────────────────────────│
         │                      │                        │
  AFTER RESPONSE COMPLETE:      │                        │
         │── save to            │                        │
         │   localStorage       │                        │
         │                      │                        │
         │── PUT /api/sessions  │                        │
         │   /:id/messages ────▶│ saveMessages()         │
         │   (fire-and-forget)  │                        │
         │                      │                        │
  ON PAGE LOAD:                 │                        │
         │── restore from       │                        │
         │   localStorage       │                        │
         │                      │                        │
         │── GET /api/sessions ▶│                        │
         │◄── merge metadata ───│                        │
         │                      │                        │
  ON SERVER RESTART:            │                        │
         │  (unchanged)         │  (Azure: unchanged)    │  ❌ LOST
         │                      │  (memory: LOST)        │
```

**Sync points:**

| Moment | localStorage → Backend | Backend → localStorage | SDK ↔ Others |
|--------|----------------------|----------------------|--------------|
| After chat response | ✅ `PUT /api/sessions/:id/messages` | — | Not synced |
| Page load/refresh | — | ✅ `GET /api/sessions` → merge | — |
| Session switch | — | — | — |
| Server restart | — | — | ❌ SDK lost |

**Key observation:** The SDK session never syncs with the other two layers. It is an independent, authoritative context that exists only in server memory. When it's gone, it's gone.

### 7.6 Context Behavior in Key Scenarios

#### Scenario A: Normal Multi-Turn Conversation

```
Turn 1: User sends "Hello"
  → Backend creates new SDK session (context: [])
  → SDK sends to model: [system_prompt, "Hello"]
  → Model responds: "Hi! How can I help?"
  → Context: [system_prompt, "Hello", "Hi! How can I help?"]
  → Frontend saves to localStorage + backend

Turn 2: User sends "What is TypeScript?"
  → Backend REUSES SDK session (same session in Map)
  → SDK sends to model: [system_prompt, "Hello", "Hi!...", "What is TypeScript?"]
  → Model responds with full context awareness
  → Context grows with each turn

Turn 3: User sends "Can you give me an example?"
  → Model understands "example" refers to TypeScript (from turn 2)
  → Full context preserved across all turns
```

**Result:** ✅ Perfect context continuity. The model maintains full conversation awareness.

#### Scenario B: Server Restarts Mid-Conversation

```
Before restart:
  sessions Map = { "token:abc-123" → CopilotSession (3 turns of context) }
  sessionStore = { session metadata + messages persisted }
  localStorage = { session "abc-123" with 3 turns of messages }

Server restarts...

After restart:
  sessions Map = {} (empty)
  sessionStore = { session metadata + messages still persisted (Azure) }
  localStorage = { session "abc-123" with 3 turns still visible }

User sends Turn 4: "Can you explain that further?"
  → Frontend sends sessionId: "abc-123"
  → Backend: sessions.has("token:abc-123") → false (Map was cleared)
  → Backend: creates NEW SDK session (fresh context!)
  → SDK sends to model: [system_prompt, "Can you explain that further?"]
  → Model has NO IDEA what "that" refers to — context is lost!
  → Model may respond: "Could you clarify what you'd like me to explain?"
```

**Result:** ⚠️ Context discontinuity. Messages are visible in the UI, but the model has lost all context. The user sees their conversation history but the model can't reference it.

#### Scenario C: User Switches Between Sessions

```
Session A is active (3 turns of context in SDK)
User clicks Session B in sidebar:
  → Frontend: switchToSession("session-b")
  → Frontend loads Session B messages from localStorage
  → Frontend sets sessionId = "session-b"

User sends a message in Session B:
  → Backend checks: sessions.has("token:session-b")
  → If session-b was previously used (and server hasn't restarted):
    → REUSE: full Session B context preserved ✅
  → If session-b's SDK session doesn't exist:
    → NEW: fresh context, no history ⚠️

User switches back to Session A:
  → Frontend loads Session A messages from localStorage
  → Next message reuses Session A's SDK session (if still in Map) ✅
```

**Result:** Switching between sessions works at the UI level. SDK sessions persist in the Map independently, so switching back to a session picks up where you left off — as long as the server hasn't restarted.

#### Scenario D: Browser Page Refresh

```
Before refresh:
  localStorage = { sessions, last active session ID }
  SDK session = alive on server

After refresh:
  1. restoreLastSession() → loads messages from localStorage (instant)
  2. loadSessionsFromBackend() → fetches metadata from backend (async)
  3. Merge: if backend has newer sessions, update localStorage
  4. sessionId = last active session from localStorage

Next message:
  → Frontend sends the same sessionId
  → Backend checks sessions Map → SDK session still exists (server didn't restart)
  → REUSE: full context preserved ✅
```

**Result:** ✅ No context loss. The SDK session survives page refreshes because it lives on the server, not in the browser.

#### Scenario E: Very Long Conversation (Context Window Exceeded)

```
Turns 1-50: Context accumulates normally
  → Context window fills to ~80% capacity

At ~80% capacity: SDK triggers BACKGROUND COMPACTION
  → Older messages summarized into a compact representation
  → Recent messages kept verbatim
  → Events: session.compaction_start → session.compaction_complete
  → Context usage drops (e.g., from 80% to 40%)

Turns 51-100: More messages added
  → Context fills again → another compaction cycle

At ~95% capacity: SDK BLOCKS until compaction completes
  → Ensures the context window never overflows
  → The user may experience a brief delay
```

**Result:** ✅ The SDK handles this transparently. The model always has room for new messages. Older context is summarized, not lost entirely. The backend and frontend are unaware of compaction — they just see normal responses.

**Note:** This project does not listen to compaction events (`session.compaction_start`, `session.compaction_complete`), so there's no UI indication when compaction occurs.

### 7.7 Context Window Management and Compaction

The SDK uses "Infinite Sessions" (enabled by default) to manage context windows:

```
┌─────────────────────────────────────────────────────────────┐
│                    MODEL CONTEXT WINDOW                       │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  System Prompt (fixed, always present)                │    │
│  ├──────────────────────────────────────────────────────┤    │
│  │  Compacted Summary of older messages                  │    │
│  │  (created by compaction when context fills up)        │    │
│  ├──────────────────────────────────────────────────────┤    │
│  │  Recent Messages (verbatim)                           │    │
│  │  ┌────────────────────────────────────────────────┐  │    │
│  │  │ user: "What is TypeScript?"                    │  │    │
│  │  │ assistant: "TypeScript is a typed superset..." │  │    │
│  │  │ user: "Show me an example"                     │  │    │
│  │  │ assistant: "Here's a simple example..."        │  │    │
│  │  │ user: "Can you add error handling?"            │  │    │
│  │  └────────────────────────────────────────────────┘  │    │
│  ├──────────────────────────────────────────────────────┤    │
│  │  ← Current message being processed                    │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  [=============================================---------]     │
│   0%                                    80%  ↑    95%  100%   │
│                              background     blocking          │
│                              compaction     compaction         │
│                              threshold      threshold          │
└─────────────────────────────────────────────────────────────┘
```

**Default thresholds (from SDK):**
- `backgroundCompactionThreshold: 0.80` — Start compacting in background at 80%
- `bufferExhaustionThreshold: 0.95` — Block new messages at 95% until compaction completes

**What compaction does:**
1. Takes older messages from the conversation
2. Summarizes them into a compact representation
3. Replaces the verbose messages with the summary
4. Frees up context window space for new messages
5. Preserves recent messages verbatim for immediate relevance

**Workspace persistence (when infinite sessions are active):**
- The SDK creates a workspace at `~/.copilot/session-state/{sessionId}/`
- Contains: `checkpoints/` (recovery points), `plan.md`, `files/`
- Enables session resumption via `client.resumeSession()`

**This project's usage:** Infinite sessions are enabled by default (we don't override the setting), so compaction runs automatically. However, we don't:
- Configure custom compaction thresholds
- Use the workspace path
- Resume sessions after restart

### 7.8 Known Context Gaps and Limitations

| Gap | Description | Impact | Potential Fix |
|-----|-------------|--------|---------------|
| **Server restart loses SDK context** | The `sessions` Map is cleared on restart. New SDK sessions have no conversation history. | Model loses all conversation awareness. User sees old messages but model can't reference them. | Use `client.resumeSession()` with stored SDK session IDs |
| **No context replay** | When a new SDK session is created for an existing conversation, old messages are not replayed into it. | Model starts fresh even though messages are displayed. | Replay persisted messages into new sessions via `session.send()` calls, or use `resumeSession()` |
| **Frontend-backend message divergence** | localStorage and sessionStore can hold different messages if the fire-and-forget `PUT` fails. | Messages visible in one browser tab may not appear in another. | Add retry logic or confirmation for message persistence |
| **SDK context ≠ displayed messages** | The SDK's internal context (via `getMessages()`) returns `SessionEvent[]` which includes tool calls, reasoning, etc. Our storage only saves `ChatMessage[]` (role + text). | Tool call details and reasoning are lost in persistence. | Store full SDK events instead of simplified messages |
| **Compaction visibility** | The SDK compacts context silently. Users receive a `compaction` SSE event when compaction starts or completes, but no UI indicator is shown yet. | Long conversations may have subtly degraded recall of earlier topics with no visual feedback. | Show a "Optimizing context..." badge in the UI on `compaction` SSE events |
| **No cross-device context** | SDK sessions are per-server-instance. A user on device A has a different SDK context than on device B, even for the same session ID. | Inconsistent model behavior across devices. | Would require a shared CLI server or session replay from storage |

---

## 8. Unused SDK Features — Complete Inventory

This section catalogs every SDK feature that this project does **not** currently use, organized by category. Each entry includes the feature, what it does, and whether we should consider adopting it.

### 8.1 Client-Level Features

| Feature | SDK Method | What It Does | Used? |
|---------|-----------|--------------|-------|
| Resume sessions | `client.resumeSession(id, config)` | Would reconnect to an existing CLI-side session, preserving full conversation context after restart | ❌ |
| List SDK sessions | `client.listSessions(filter?)` | Lists sessions managed by the CLI (not our storage layer) | ❌ |
| Delete SDK sessions | `client.deleteSession(id)` | Deletes a session and its data from the CLI's disk storage | ❌ |
| Ping | `client.ping(message?)` | Health check — verifies RPC connection is alive | ❌ |
| Connection state | `client.getState()` | Returns `"disconnected"`, `"connecting"`, `"connected"`, or `"error"` | ❌ |
| Auth status | `client.getAuthStatus()` | Checks if the token is valid and what access it has | ❌ |
| CLI status | `client.getStatus()` | Returns CLI version and protocol version info | ❌ |
| Force stop | `client.forceStop()` | Kills CLI process immediately without graceful cleanup | ❌ |
| Last session ID | `client.getLastSessionId()` | Returns the most recently updated session ID | ❌ |
| Lifecycle events | `client.on("session.created", ...)` | Listen for session created/deleted/updated/foreground/background events | ❌ |

### 8.2 Session-Level Features

| Feature | SDK Method | What It Does | Used? |
|---------|-----------|--------------|-------|
| Send and wait | `session.sendAndWait(options, timeout?)` | Sends a message and blocks until session is idle (returns complete response) | ❌ |
| Abort | `session.abort()` | Cancels the currently processing message | ✅ |
| Get messages | `session.getMessages()` | Returns full conversation history from the CLI's internal state | ❌ |
| Set model | `session.setModel(model)` | Changes the model for subsequent messages (without creating a new session) | ✅ |
| Disconnect | `session.disconnect()` | Properly releases session resources while preserving data for resumption | ❌ |
| Register tools | `session.registerTools(tools)` | Dynamically adds custom tools after session creation | ❌ |
| Register permission handler | `session.registerPermissionHandler(handler)` | Dynamically changes the permission handler | ❌ |
| Register user input handler | `session.registerUserInputHandler(handler)` | Dynamically enables the ask_user tool | ❌ |
| Register hooks | `session.registerHooks(hooks)` | Dynamically adds lifecycle hooks | ❌ |
| Get tool handler | `session.getToolHandler(name)` | Retrieves a registered tool by name | ❌ |
| Async dispose | `await using session = ...` | Auto-cleanup via `Symbol.asyncDispose` | ❌ |

### 8.3 Tool System

**What it is:** The SDK's tool system lets you define custom functions that the AI agent can call. When the model decides it needs information or an action that a tool provides, it invokes the tool — the SDK runs your handler and feeds the result back to the model.

**SDK API:**

```typescript
import { defineTool } from "@github/copilot-sdk";
import { z } from "zod";

const myTool = defineTool("lookup_issue", {
  description: "Fetch issue details from our tracker",
  parameters: z.object({
    id: z.string().describe("Issue identifier"),
  }),
  handler: async ({ id }) => {
    const issue = await fetchIssue(id);
    return issue;  // Returned to the model as context
  },
});

const session = await client.createSession({
  tools: [myTool],
  // ...
});
```

**Features:**
- Type-safe parameter definitions (via Zod or raw JSON Schema)
- Handler receives parsed arguments
- Return value is automatically serialized and sent to the model
- `overridesBuiltInTool: true` allows replacing built-in tools (e.g., `edit_file`)
- Tools can return strings, objects, or full `ToolResultObject` with metadata

**Currently used?** ✅ Custom tools are defined in `tools.ts` (GitHub API tools) and `planning-tools.ts` (planning tools). Both factories are invoked in `buildSessionConfig()` and passed to `createSession()`.

### 8.4 System Message Customization

**What it is:** Controls the system prompt (the instructions the model receives about how to behave).

**SDK API:**

```typescript
// Append mode (default) — adds to existing system message
const session = await client.createSession({
  systemMessage: {
    content: "Always respond in JSON format. Never use markdown.",
  },
});

// Replace mode — completely replaces the system message
const session = await client.createSession({
  systemMessage: {
    mode: "replace",
    content: "You are a helpful coding assistant. Be concise.",
  },
});
```

**Currently used?** ✅ `ORCHESTRATOR_SYSTEM_MESSAGE` is configured in append mode (default) via `buildSessionConfig()`.

### 8.5 Infinite Sessions and Context Compaction

**What it is:** Infinite sessions automatically manage context window limits. When the conversation gets too long for the model's context window, the SDK triggers "compaction" — summarizing older messages to free up space. This happens transparently.

**SDK API:**

```typescript
const session = await client.createSession({
  infiniteSessions: {
    enabled: true,                          // Default: true
    backgroundCompactionThreshold: 0.80,    // Start compacting at 80% context usage
    bufferExhaustionThreshold: 0.95,        // Block at 95% until compaction completes
  },
});

// Workspace directory for checkpoints and files:
console.log(session.workspacePath);
// → ~/.copilot/session-state/{sessionId}/
```

**Events:**
- `session.compaction_start` — Compaction begins (forwarded as SSE `compaction` event)
- `session.compaction_complete` — Compaction done (includes token savings; forwarded as SSE `compaction` event)

**Currently used?** ❌ The explicit `infiniteSessions` configuration is not set (using SDK defaults). The `session.compaction_start` and `session.compaction_complete` events are listened to and forwarded to the browser via SSE as `compaction` events.

### 8.6 Session Hooks

**What it is:** Six lifecycle hooks that intercept key moments in session processing — enabling logging, security policies, prompt modification, and error recovery.

**SDK API:**

```typescript
const session = await client.createSession({
  hooks: {
    onPreToolUse: async (input) => {
      console.log(`Tool: ${input.toolName}, Args: ${JSON.stringify(input.toolArgs)}`);
      return { permissionDecision: "allow" };
    },
    onPostToolUse: async (input) => {
      console.log(`Tool ${input.toolName} completed`);
      return {};
    },
    onUserPromptSubmitted: async (input) => {
      // Can modify the prompt before processing
      return { modifiedPrompt: input.prompt };
    },
    onSessionStart: async (input) => {
      console.log(`Session started from: ${input.source}`);
      return {};
    },
    onSessionEnd: async (input) => {
      console.log(`Session ended: ${input.reason}`);
    },
    onErrorOccurred: async (input) => {
      console.error(`Error: ${input.error}`);
      return { errorHandling: "retry" }; // "retry", "skip", or "abort"
    },
  },
});
```

**Currently used?** ✅ All five hook types are configured in `buildSessionConfig()`: `onPreToolUse`, `onPostToolUse`, `onSessionStart`, `onSessionEnd`, and `onErrorOccurred`.

### 8.7 User Input Requests

**What it is:** Enables the agent to ask the user questions mid-conversation using the `ask_user` tool. Without this handler, the ask_user tool is disabled.

**SDK API:**

```typescript
const session = await client.createSession({
  onUserInputRequest: async (request) => {
    // request.question — The question to ask
    // request.choices — Optional array of choices
    // request.allowFreeform — Whether freeform input is allowed
    return {
      answer: "User's answer here",
      wasFreeform: true,
    };
  },
});
```

**Currently used?** ✅ `onUserInputRequest` is configured in `resolveSession()`. A `POST /api/chat/input` endpoint resolves pending input requests, and the agent's questions are forwarded to the browser via SSE as `user_input_request` events.

### 8.8 BYOK (Bring Your Own Key)

**What it is:** Allows using the SDK with your own API keys from model providers (OpenAI, Azure OpenAI, Anthropic, Ollama, etc.) instead of going through GitHub Copilot. Useful for enterprise deployments or accessing models not available through Copilot.

**SDK API:**

```typescript
const session = await client.createSession({
  model: "gpt-4",
  provider: {
    type: "openai",                       // "openai" | "azure" | "anthropic"
    baseUrl: "https://api.openai.com/v1",
    apiKey: process.env.OPENAI_API_KEY,
    wireApi: "completions",               // "completions" | "responses"
  },
});
```

**Supported providers:**
- OpenAI (direct API)
- Azure OpenAI / Azure AI Foundry
- Anthropic (Claude direct)
- Ollama (local models)
- Microsoft Foundry Local
- Any OpenAI-compatible endpoint (vLLM, LiteLLM, etc.)

**Currently used?** ❌ All requests go through GitHub Copilot's backend.

### 8.9 MCP Server Integration

**What it is:** Model Context Protocol (MCP) servers provide additional tools and context to the agent. The SDK can connect to local or remote MCP servers, making their tools available during sessions.

**SDK API:**

```typescript
const session = await client.createSession({
  mcpServers: {
    "my-database": {
      type: "local",
      command: "node",
      args: ["./mcp-db-server.js"],
    },
    "remote-api": {
      type: "remote",
      url: "https://mcp.example.com",
      headers: { Authorization: "Bearer ..." },
    },
  },
});
```

**Currently used?** ❌ No MCP servers are configured.

### 8.10 Custom Agents

**What it is:** The SDK supports configuring custom agent behaviors — alternative personas or specialized assistants with different system prompts, tools, and capabilities.

**SDK API:**

```typescript
const session = await client.createSession({
  customAgents: [
    {
      name: "code-reviewer",
      description: "Specialized code review agent",
      systemMessage: "You are an expert code reviewer...",
      tools: [/* custom tools */],
    },
  ],
});
```

**Currently used?** ❌ Only the default Copilot agent is used.

### 8.11 File and Image Attachments

**What it is:** Messages can include file and image attachments, allowing the agent to analyze files, images, or code selections.

**SDK API:**

```typescript
await session.send({
  prompt: "What's in this image?",
  attachments: [
    { type: "file", path: "/path/to/image.jpg" },
    { type: "file", path: "/path/to/code.ts", displayName: "Main File" },
    { type: "directory", path: "/path/to/project" },
    { type: "selection", path: "/file.ts", lineRange: [10, 20], text: "..." },
  ],
});
```

**Supported attachment types:**
- `file` — Single file (including images: JPG, PNG, GIF)
- `directory` — Entire directory
- `selection` — Code selection with line range

**Currently used?** ❌ Only plain text prompts are sent.

### 8.12 Reasoning Effort Control

**What it is:** Controls how much "thinking" the model does before responding. Higher reasoning effort = more thoughtful (but slower and more expensive) responses.

**SDK API:**

```typescript
const session = await client.createSession({
  model: "o4-mini",  // Must support reasoning
  reasoningEffort: "high",  // "low" | "medium" | "high" | "xhigh"
});
```

**Currently used?** ❌ The backend accepts `reasoningEffort` in `buildSessionConfig()` but no UI element currently exposes it. Requires a conditional dropdown in the frontend for models that support reasoning (e.g., `o4-mini`).

### 8.13 Additional Unused Events

These session events are not currently listened to:

| Event | Value | Potential Use |
|-------|-------|---------------|
| `assistant.message` | Final complete message | Could verify/log complete responses |
| `assistant.reasoning` | Model's reasoning chain | Could display "thinking" in UI |
| `assistant.reasoning_delta` | Streaming reasoning | Could show thinking in real-time |
| `tool.execution_progress` | Tool progress | Could show progress bars |
| `permission.requested` | Permission needed | Could show permission prompts |

> **Note on removed entries:** Earlier versions of this table listed many events that are now handled. The following events have been removed from this table because they are actively listened to and forwarded via SSE: `assistant.usage` → SSE `usage`, `tool.execution_start/complete` → SSE `tool_start`/`tool_complete`, `session.title_changed` → SSE `title`, `session.compaction_start/complete` → SSE `compaction`, `subagent.started/completed/failed` → SSE `subagent_start`/`subagent_end`, `session.mode_changed` → SSE `planning_start`/`plan_ready`, and `assistant.intent` → SSE `intent`. Additionally, `planning.started` and `planning.end` were removed because they **do not exist** in the SDK — the real planning events are `session.mode_changed` and `exit_plan_mode.requested`.

### 8.14 RPC Methods

These low-level RPC methods are accessible via `session.rpc` and `client.rpc`:

| Method | Purpose | Currently Used? |
|--------|---------|----------------|
| `model.getCurrent()` | Get current session model | ❌ |
| `model.switchTo(model)` | Change model mid-session | ❌ |
| `mode.get()` / `mode.set(mode)` | Get/set agent mode | ❌ |
| `plan.read()` / `plan.update()` / `plan.delete()` | Manage session plan files | ❌ |
| `workspace.listFiles()` | List files in session workspace | ❌ |
| `workspace.readFile(path)` | Read file from workspace | ❌ |
| `workspace.createFile(path, content)` | Create file in workspace | ❌ |
| `fleet.start(prompt?)` | Launch fleet of sub-agents | ❌ |
| `agent.list()` | List available agents | ❌ |
| `agent.getCurrent()` | Get active agent | ❌ |
| `agent.select(name)` | Switch to specific agent | ❌ |
| `compaction.compact()` | Trigger manual compaction | ❌ |
| `account.getQuota()` | Check premium request quota | ✅ |
| `tools.list(model?)` | List available tools for a model | ❌ |

---

## 9. Recommendations: Which Unused Features to Adopt

### 🟢 High Value — Should Implement

| Feature | Why | Effort |
|---------|-----|--------|
| **`client.ping()` / `client.getState()`** | Better health monitoring. The current health endpoint only checks if the CLI binary exists on PATH, not whether the RPC connection is actually alive. | Low |
| **Reasoning effort UI** | The `reasoningEffort` option is accepted by `buildSessionConfig()` but not yet exposed in the UI. Add a conditional dropdown for models that support it (like o4-mini). | Low |
| **`session.disconnect()`** | Properly release session resources when a user's session is no longer active. Currently sessions live forever in the Map until server restart, which wastes CLI memory for abandoned conversations. | Medium |

### 🟡 Medium Value — Consider Implementing

| Feature | Why | Effort |
|---------|-----|--------|
| **`client.resumeSession()`** | After a server restart or container recycle, sessions lose their SDK conversation context. Storing the SDK session ID (already in `sessionStore`) and calling `resumeSession()` on reconnect would preserve full conversation history. | Medium |
| **Message replay fallback** | When `resumeSession` fails (e.g., after a container restart that wipes CLI state), new sessions have no conversation history. Replaying persisted messages into the fresh session would rebuild context. | Medium |
| **`session.disconnect()` idle timeout** | Add a 30-minute idle timeout that calls `session.disconnect()` and removes the session from the in-memory Map while preserving `sdkSessionId` for future resumption. | Medium |

### 🟠 Lower Value — Nice to Have

| Feature | Why | Effort |
|---------|-----|--------|
| **`assistant.reasoning` events UI** | Show the model's chain-of-thought "thinking" for reasoning models (o4-mini, etc.). Interesting for transparency but adds UI complexity. | Medium |
| **File/image attachments** | Allow users to upload files or paste images for the agent to analyze. Requires file upload UI and backend handling. | High |
| **BYOK (Bring Your Own Key)** | Let users bring their own API keys for OpenAI, Azure, or Anthropic. Useful for users who want to use models not available through Copilot, or who don't have a Copilot subscription. | Medium |
| **MCP servers** | Extend the agent with external tool servers. Powerful but complex — more suitable for enterprise or developer-focused deployments. | High |
| **Infinite session configuration** | While enabled by default, exposing compaction thresholds could help with very long conversations. Low priority since defaults work well. | Low |

### 🔴 Not Recommended

| Feature | Why |
|---------|-----|
| **Fleet mode** | Launches parallel sub-agents — designed for complex coding tasks, not chat. |
| **Custom agents** | Overkill for a chat interface — system message customization achieves similar results with less complexity. |
| **Workspace file operations** | The CLI manages its own workspace. Exposing file operations to the web UI adds complexity without clear benefit for a chat app. |
| **`client.forceStop()`** | Only needed if `stop()` hangs. Current graceful shutdown works fine. |
| **TUI-related features** | `getForegroundSessionId()`, `setForegroundSessionId()` — only relevant when connecting to a CLI running in TUI mode. Not applicable here. |

---

*This document was generated based on analysis of `server.ts`, `storage.ts`, `@github/copilot-sdk@0.1.32`, and the [Copilot SDK GitHub repository](https://github.com/github/copilot-sdk).*
