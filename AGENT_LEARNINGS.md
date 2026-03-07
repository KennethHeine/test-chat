# Agent Learnings

Notes and context for coding agents working on this repo.

## Quick Start

```bash
# Install dependencies
npm install

# Verify TypeScript compiles without errors
npx tsc --noEmit

# Run tests (requires COPILOT_GITHUB_TOKEN env var)
npm test          # → npx tsx test.ts

# Start the server (development)
npm start         # → npx tsx server.ts

# Server runs at http://localhost:3000
# Tests run a second server instance on port 3099
```

Health check (no auth required):
```bash
curl http://localhost:3000/api/health
# → {"status":"ok","copilotCli":true}
```

List models (auth required):
```bash
curl -H "Authorization: Bearer $COPILOT_GITHUB_TOKEN" http://localhost:3000/api/models
```

## Project Structure

```
test-chat/
├── server.ts          # Express backend — entry point for the web server.
│                      #   Hosts /api/health, /api/models, /api/chat (SSE streaming).
│                      #   Creates per-user CopilotClient instances keyed by token.
│                      #   Sessions keyed by "token:sessionId" for multi-user isolation.
│                      #   Graceful shutdown: stops all CopilotClient instances on SIGINT/SIGTERM.
├── test.ts            # Integration test suite — entry point for tests.
│                      #   SDK Direct Tests (4): connect, listModels, chat, multi-turn recall.
│                      #   Server API Tests (3): health, models, chat SSE streaming.
│                      #   Spawns a child server process on TEST_PORT (3099) for HTTP tests.
├── public/
│   ├── index.html     # Chat UI — GitHub dark theme, model selector, token input in header.
│   └── app.js         # Frontend logic — token in localStorage, authHeaders(), SSE parsing,
│                      #   streaming render. Loads models on page load if token is set.
├── package.json       # Dependencies & scripts. Includes "overrides" for @github/copilot@0.0.423.
├── tsconfig.json      # TypeScript: ES2022, bundler resolution, strict, skipLibCheck.
├── .env.example       # Template: COPILOT_GITHUB_TOKEN, PORT.
├── .env               # Local config (gitignored — never committed).
├── .gitignore         # Excludes node_modules/, dist/, .env.
├── docs.md            # Detailed project documentation.
├── README.md          # User-facing docs: architecture, setup, API reference, troubleshooting.
└── AGENT_LEARNINGS.md # This file — notes for future coding agents.
```

**Entry points:**
- Web server: `server.ts`
- Test suite: `test.ts`
- Frontend JS: `public/app.js` (loaded by `public/index.html`)

## Authentication

- Each user provides their own GitHub token via the web UI header input.
- Token is stored in browser `localStorage` under key `copilot_github_token`.
- Every API call sends `Authorization: Bearer <token>` header.
- Server extracts token from `Authorization` header via `extractToken(req)`.
- Fallback: if no header, server uses `process.env.COPILOT_GITHUB_TOKEN` (for CI/testing).
- `/api/health` requires no auth. `/api/models` and `/api/chat` require a token.
- **Env var name:** `COPILOT_GITHUB_TOKEN` (NOT `GITHUB_TOKEN`).
- In tests, token comes from `process.env.COPILOT_GITHUB_TOKEN` (set via `.env` or CI secret).
- In the web UI, token comes from `localStorage` via `authHeaders()` in `app.js`.

## SDK Notes

Key facts about `@github/copilot-sdk` behavior:

- `session.on()` returns an **unsubscribe function** — there is no `.off()` method.
  ```ts
  const unsub = session.on("assistant.message_delta", handler);
  unsub(); // to remove listener
  ```
- `onPermissionRequest: approveAll` is **required** in `SessionConfig` (from `@github/copilot-sdk`).
- Delta events carry content in `event.data.deltaContent` (not `event.data.content`).
- `streaming: true` is a valid `SessionConfig` option — enables streaming deltas.
- One `CopilotClient` per user token — `client.start()` launches a Copilot CLI subprocess.
- `client.stop()` must be called during shutdown to clean up the subprocess.
- `client.getState()` returns `"connected"` when the client is ready.
- `client.ping()` returns `{ timestamp }` — useful to verify connectivity.

## Testing

- Tests live in `test.ts` and run with `npx tsx test.ts` (via `npm test`).
- **TEST_PORT** (default `3099`) is used for the server in tests to avoid conflict with dev server on port 3000.
- `gpt-4.1` is used as the test model because it costs **0 premium requests** on paid Copilot plans.
- SDK tests (`testSdkConnect`, `testSdkListModels`, `testSdkChat`, `testSdkMultiTurn`) each create their own fresh `CopilotClient` instance.
- Server tests spawn a child process via `spawn("npx", ["tsx", "server.ts"])` with `PORT=3099` in the env.
- Server tests wait up to 20 seconds for the server to be ready (`waitForServer`).
- Server tests send `Authorization: Bearer <token>` header (from `testAuthHeaders()`).
- `session.sendAndWait(prompt, 30000)` is used in SDK tests — waits up to 30 seconds for `session.idle`.
- `COPILOT_GITHUB_TOKEN` must be a **fine-grained PAT** (`github_pat_`), not a classic PAT (`ghp_`).

## Common Issues & Fixes

- **Classic PATs (`ghp_`) don't work** — need fine-grained PATs (`github_pat_`) with the `copilot` scope.
- **`listModels` returns 400** — the token likely lacks the `copilot` permission scope.
- **Tests hang** — check for leftover node processes on port 3099: `lsof -ti:3099 | xargs kill -9`
- **`EADDRINUSE`** — port in use. Kill leftover node processes or change `PORT`/`TEST_PORT`.
- **`npm audit` high severity** — `@github/copilot <= 0.0.422` has a dangerous shell expansion vulnerability (GHSA-g8r9-g2v8-jv6f). Fixed by adding `"overrides": { "@github/copilot": "0.0.423" }` to `package.json`.
- **Do NOT set `COPILOT_GITHUB_TOKEN` in `.env` in CI** — use repo secrets. The `.env` file is gitignored.
- **TypeScript compiles cleanly** — `npx tsc --noEmit` exits 0 with no errors on the current codebase.

## Architecture Decisions

- **Per-user CopilotClient instances**: `Map<token, CopilotClient>` — one client per unique user token. This means each user gets their own Copilot CLI subprocess, properly isolated.
- **Sessions keyed by `token:sessionId`**: `Map<string, CopilotSession>` — ensures sessions from different users with the same session ID are isolated.
- **SSE streaming** for real-time token delivery: server writes `data: {"type":"delta","content":"..."}` events as Copilot responds.
- **Frontend stores token in localStorage**, sends via `Authorization: Bearer` header — server is stateless with respect to tokens.
- **`sendAndWait` in SDK tests** vs. manual event subscription in server: `sendAndWait` blocks until `session.idle`, making it suitable for synchronous test assertions.
- **Unsubscribe pattern**: collect `() => void` unsubscribers in an array, call all on cleanup (client disconnect or stream end) to avoid memory leaks.
