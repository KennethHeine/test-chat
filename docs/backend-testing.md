# Backend Testing

The backend has two layers of automated tests: fast offline storage unit tests and SDK/HTTP integration tests.

## Test Layers

| Layer | File | Command | Token Required | Tests |
|-------|------|---------|----------------|-------|
| **Storage unit tests** | `storage.test.ts` | `npm run test:storage` | No | 15 |
| **Planning store tests** | `planning-store.test.ts` | `npm run test:planning` | No | 51 |
| **Integration tests** | `test.ts` | `npm test` | Yes (`COPILOT_GITHUB_TOKEN`) | 45 |

Both test layers use `gpt-4.1` which costs **0 premium requests** on paid Copilot plans, so they are safe to run repeatedly.

---

## Storage Unit Tests (`npm run test:storage`)

Fast offline tests for the `InMemorySessionStore` — no external services or tokens required.

```bash
npm run test:storage
```

### What They Verify (15 tests)

- Token hashing (SHA-256)
- Session CRUD operations (create, read, update, delete)
- User isolation (sessions scoped by token hash)
- Message persistence (save and retrieve chat messages)
- Sorting (newest sessions first)
- SDK session ID persistence (`sdkSessionId` stored in metadata, optional field, updatable)

### Test File

`storage.test.ts` — tests the `InMemorySessionStore` class and the `hashToken()` utility from `storage.ts`.

---

## Integration Tests (`npm test`)

These run directly against the Copilot SDK and the local Express server.

```bash
# Requires COPILOT_GITHUB_TOKEN in .env or environment
npm test
```

### Test Categories (45 tests)

#### SDK Direct Tests (4)

| Test | What it verifies |
|------|------------------|
| `testSdkConnect` | CopilotClient starts and reaches "connected" state |
| `testSdkListModels` | `client.listModels()` returns available models |
| `testSdkChat` | Single-turn chat via `session.sendAndWait()` |
| `testSdkMultiTurn` | Multi-turn conversation retains context |

Each SDK test creates its own fresh `CopilotClient` instance.

#### Server API Tests (7)

| Test | What it verifies |
|------|------------------|
| Health check | `GET /api/health` returns `{ status: "ok" }` |
| Models endpoint | `GET /api/models` returns model list with auth |
| Chat SSE streaming | `POST /api/chat` streams delta events and done event |
| Storage health | Health endpoint reports correct storage backend type |
| Sessions list | `GET /api/sessions` returns sessions array |
| Session persistence | `PUT` + `GET /api/sessions/:id/messages` round-trip |
| Session delete | `DELETE /api/sessions/:id` removes session |

Server tests spawn a child process via `spawn("npx", ["tsx", "server.ts"])` with `PORT=3099` (via `TEST_PORT` env var to avoid conflicts with dev server on port 3000).

#### Phase 2 Tests (5)

| Test | What it verifies |
|------|------------------|
| Enhanced health | `/api/health` returns `clients` and `activeSessions` fields |
| Model switch (404) | `POST /api/chat/model` returns 404 for non-existent session |
| Model switch (validation) | `POST /api/chat/model` validates required fields |
| Quota endpoint | `GET /api/quota` returns quota data with auth |
| Quota without auth | `GET /api/quota` returns 401 without token |

#### Goal API Tests (5)

| Test | What it verifies |
|------|------------------|
| Goals list (no auth) | `GET /api/goals` returns 401 without auth header |
| Goals list (empty) | `GET /api/goals` returns empty array for new user |
| Goal get (404) | `GET /api/goals/:id` returns 404 for unknown goal |
| Goal get (no auth) | `GET /api/goals/:id` returns 401 without auth header |
| Goal seed round-trip | Seed a goal → list → get by ID all succeed |

#### Planning Tools Tests (10)

| Test | What it verifies |
|------|------------------|
| Tool registration | All 6 planning tools registered with correct names |
| `define_goal` template | Returns structured template from raw intent |
| `define_goal` validation | Empty intent returns validation error |
| `save_goal` happy path | Valid data returns goal with generated ID and timestamps |
| `save_goal` validation | Missing required string field returns error |
| `save_goal` array validation | Non-array `successCriteria` returns error |
| `get_goal` happy path | Existing ID with correct sessionId returns goal |
| `get_goal` ownership | Wrong sessionId returns error |
| `get_goal` not found | Non-existent ID returns error |
| `get_goal` empty ID | Empty goalId returns validation error |

#### Research Tools Tests (14)

| Test | What it verifies |
|------|------------------|
| `generate_research_checklist` — 8 items | Returns exactly 8 categorized research items |
| `generate_research_checklist` — open status | All items have `status: "open"` and correct `goalId` |
| `generate_research_checklist` — unknown goal | Returns error for non-existent `goalId` |
| `generate_research_checklist` — wrong session | Returns error when `sessionId` does not match goal |
| `update_research_item` — open → researching | Status transition succeeds and is persisted |
| `update_research_item` — findings required | Attempting to resolve without `findings` returns error |
| `update_research_item` — full lifecycle | Full `open → researching → resolved` transition with findings |
| `update_research_item` — sanitization | `findings` containing HTML tags are entity-encoded before storage |
| `update_research_item` — invalid transition | `open → resolved` (skipping `researching`) returns error |
| `update_research_item` — invalid sourceUrl | Non-URL string in `sourceUrl` returns validation error |
| `update_research_item` — sourceUrl persisted | Valid `https://` URL in `sourceUrl` is stored on the item |
| `get_research` — returns items | Returns all 8 items after checklist generation |
| `get_research` — wrong session | Returns error when `sessionId` does not match goal |
| `get_research` — unknown goal | Returns error for non-existent `goalId` |

### Test Configuration

| Setting | Value | Purpose |
|---------|-------|---------|
| `TEST_PORT` | `3099` | Avoids conflict with dev server on port 3000 |
| Test model | `gpt-4.1` | Costs 0 premium requests on paid plans |
| Server startup timeout | 20 seconds | Waits for the child server to be ready |
| SDK send timeout | 30 seconds | `sendAndWait` timeout for chat responses |
| Auth header | `Authorization: Bearer <token>` | From `COPILOT_GITHUB_TOKEN` env var |

### Running Integration Tests

```bash
# Set the token
export COPILOT_GITHUB_TOKEN=github_pat_...

# Run all integration tests
npm test

# Or directly
npx tsx test.ts
```

### Token Requirements

- **Must be a fine-grained PAT** (`github_pat_`), not a classic PAT (`ghp_`)
- **Must have the `copilot` scope**
- Set via `COPILOT_GITHUB_TOKEN` environment variable or in `.env` file

---

## TypeScript Validation

Always run the TypeScript compiler before submitting changes:

```bash
npx tsc --noEmit
```

This validates types without emitting files. It should exit with code 0 and no errors.

## Related Documentation

- [Backend](backend.md) — Server architecture and API endpoints
- [Frontend Testing](frontend-testing.md) — Playwright E2E tests
- [Regression Testing](regression-testing.md) — Full regression test strategy
