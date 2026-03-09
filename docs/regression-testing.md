# Regression Testing

This document describes the regression testing strategy for the Copilot Chat Web App. Regression tests ensure that new changes don't break existing functionality.

## Test Pyramid

```
        ┌─────────────┐
        │   E2E Tests  │  5 tests — Playwright browser tests
        │  (slowest)   │  Full UI interaction, real Copilot API
        ├──────────────┤
        │ Integration  │  16 tests — SDK + HTTP API tests
        │   Tests      │  Real SDK calls, local server process
        ├──────────────┤
        │  Unit Tests  │  15 tests — Storage module
        │  (fastest)   │  Offline, no external dependencies
        └──────────────┘
```

## Running the Full Regression Suite

```bash
# 1. TypeScript validation (always — catches type errors)
npx tsc --noEmit

# 2. Storage unit tests (fast, offline — no token needed)
npm run test:storage

# 3. Integration tests (requires COPILOT_GITHUB_TOKEN)
npm test

# 4. E2E tests against local server (requires token + Playwright browsers)
npm run test:e2e:local

# 5. E2E tests against production (requires token + Playwright browsers)
npm run test:e2e:prod
```

### Quick Regression Check (No Token)

If `COPILOT_GITHUB_TOKEN` is not available, run the minimum checks:

```bash
npx tsc --noEmit      # TypeScript validation
npm run test:storage   # Storage unit tests (15 tests, offline)
```

## CI/CD Regression Workflows

| Workflow | File | Trigger | Tests Run |
|----------|------|---------|-----------|
| **Local E2E** | `.github/workflows/e2e-local.yml` | PRs and non-main pushes | E2E tests against local server |
| **Production E2E** | `.github/workflows/e2e-tests.yml` | After deploy to `main` | E2E tests against production |
| **Deploy App** | `.github/workflows/deploy-app.yml` | Push to `main` (app files) | Builds and deploys, triggers E2E |
| **Deploy Infra** | `.github/workflows/deploy-infra.yml` | Push to `main` (infra files) | Deploys Azure infrastructure |

### CI Test Flow

```
PR opened/updated
       │
       ▼
┌──────────────────┐
│  e2e-local.yml   │  ← Runs E2E tests against local server
│  (on every PR)   │
└──────────────────┘

PR merged to main
       │
       ▼
┌──────────────────┐     ┌──────────────────┐
│  deploy-app.yml  │────►│  e2e-tests.yml   │  ← Runs E2E tests against production
│  (build+deploy)  │     │  (post-deploy)   │
└──────────────────┘     └──────────────────┘
```

## What Each Test Layer Validates

### Unit Tests — Storage Module

| Area | Verified By |
|------|-------------|
| Token hashing (SHA-256) | `hashToken()` returns consistent hashes |
| Session CRUD | Create, read, update, delete sessions |
| User isolation | Different tokens see different sessions |
| Message persistence | Save and retrieve chat messages |
| Session ordering | Newest sessions returned first |
| SDK session ID | `sdkSessionId` stored, optional, updatable |

### Integration Tests — SDK + HTTP API

| Area | Verified By |
|------|-------------|
| Client connectivity | CopilotClient starts and connects |
| Model listing | Available models returned from API |
| Single-turn chat | Send message, receive response |
| Multi-turn context | Follow-up messages reference prior context |
| Health endpoint | Server status, storage backend, client counts |
| Session management | List, persist, delete sessions via HTTP API |
| Model switching | Mid-conversation model change (+ error handling) |
| Quota endpoint | Premium request quota retrieval (+ auth check) |

### E2E Tests — Full UI Workflow

| Area | Verified By |
|------|-------------|
| Page load | Site is up, status indicator shows connected |
| Token authentication | Token input, save, model dropdown population |
| Chat round-trip | Send message, receive streamed response |
| Session context | Multi-turn conversation retains memory |
| New chat | UI resets correctly, welcome screen reappears |

## When to Run Regression Tests

| Change Type | Minimum Tests | Recommended |
|-------------|---------------|-------------|
| Backend code (`server.ts`, `storage.ts`, `tools.ts`) | `tsc --noEmit` + `npm run test:storage` + `npm test` | + `npm run test:e2e:local` |
| Frontend code (`public/`) | `tsc --noEmit` | + `npm run test:e2e:local` |
| Infrastructure (`infra/`) | Manual review | Deploy to staging first |
| Documentation only | None | — |
| Dependencies (`package.json`) | `tsc --noEmit` + `npm run test:storage` + `npm test` | + `npm run test:e2e:local` |

## Common Regression Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| TypeScript errors after SDK update | SDK API changed | Check SDK changelog, update types |
| Integration tests timeout | Server not starting on TEST_PORT | Check for port conflicts: `lsof -ti:3099` |
| E2E tests fail on model loading | Token expired or invalid | Refresh `COPILOT_GITHUB_TOKEN` |
| E2E tests fail on streaming | SSE event format changed | Check server-side event emission |
| Storage tests fail | `SessionStore` interface changed | Update InMemorySessionStore to match |

## Related Documentation

- [Backend Testing](backend-testing.md) — Storage unit tests and integration tests
- [Frontend Testing](frontend-testing.md) — Playwright E2E tests
- [Architecture](architecture.md) — System overview
