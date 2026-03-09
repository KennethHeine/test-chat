# Copilot Instructions

> Repo-wide guidance for GitHub Copilot. Read on every request.
> **AGENTS.md is the primary operating manual for agents in this repo.**

## Repo Structure

- **Backend:** `server.ts` — Express server with Copilot SDK integration (TypeScript, ES modules)
- **Frontend:** `public/` — vanilla HTML/CSS/JS chat UI (no framework, no build step)
- **Tests:** `test.ts` (integration), `e2e/chat.spec.ts` (Playwright E2E)
- **Infrastructure:** `infra/main.bicep` (Azure), `.github/workflows/` (CI/CD)

## Coding Conventions

- TypeScript with `strict: true` — all backend code is in `.ts` files
- ES module syntax (`import`/`export`), not CommonJS
- Run via `tsx` (no compile step) — `node --import tsx server.ts`
- Frontend is plain JavaScript (`public/app.js`) — no TypeScript, no bundler
- Use `npm ci` for dependency installation (not `npm install`)
- No linter or formatter is configured — follow existing code style

## Architectural Rules

- **Per-user token isolation:** Each user provides their own GitHub PAT via the web UI. The server never stores a global token. Tokens are keyed in `Map<string, CopilotClient>`.
- **SSE streaming:** Chat responses stream via Server-Sent Events. Always use the `session.on()` pattern with unsubscribe cleanup.
- **Session management:** Sessions are keyed by `"token:sessionId"`. Always clean up event listeners to prevent memory leaks.
- **No secrets in code:** Use `.env` locally and GitHub Secrets in CI. Never hardcode tokens.

## Validation Checklist (Run Before PR)

1. `npx tsc --noEmit` — typecheck (always run)
2. `npm test` — integration tests (requires `COPILOT_GITHUB_TOKEN`)
3. `npm run test:e2e:local` — E2E tests (requires Playwright browsers + token)

If `COPILOT_GITHUB_TOKEN` is not available, run `npx tsc --noEmit` at minimum.

## Testing Expectations

- **When to add tests:** Any new endpoint, SDK interaction, or UI behavior change
- **Integration tests** (`test.ts`): SDK-level + HTTP API tests. Use `gpt-4.1` model (0 premium requests).
- **E2E tests** (`e2e/chat.spec.ts`): Playwright browser tests. Authenticated tests skip when token is missing.
- **Test port:** Integration tests use `TEST_PORT=3099` to avoid conflicts

## Documentation Expectations

Documentation lives in the `docs/` directory, organized by topic:

- **`docs/architecture.md`:** System architecture and data flow
- **`docs/frontend.md`:** Frontend UI and state management
- **`docs/backend.md`:** Backend server, API endpoints, SDK integration
- **`docs/frontend-testing.md`:** Playwright E2E browser tests
- **`docs/backend-testing.md`:** Storage unit tests and integration tests
- **`docs/regression-testing.md`:** Regression test strategy and CI workflows
- **`docs/deployment.md`:** Azure deployment and scaling configuration
- **`docs/sdk-reference.md`:** Copilot SDK deep dive
- **`docs/roadmap.md`:** Optimization plan and future phases
- **`README.md`:** User-facing setup, API docs, troubleshooting (root level)
- Update the relevant doc when behavior, configuration, or workflow changes
