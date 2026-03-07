# AGENTS.md

> Primary operating manual for AI agents working in this repository.

## Project Snapshot

- **App:** Minimal web chat interface for GitHub Copilot
- **Backend:** Express.js (TypeScript, ES modules) — `server.ts`
- **Frontend:** Vanilla HTML/CSS/JS — `public/` (no build step)
- **SDK:** `@github/copilot-sdk` (official GitHub Copilot SDK)
- **Runtime:** Node.js 22+ (required — SDK uses `node:sqlite`)
- **Package manager:** npm (`package-lock.json` committed)
- **Streaming:** Server-Sent Events (SSE) for real-time chat
- **Auth:** Per-user fine-grained GitHub PATs via web UI (tokens in `localStorage`, sent as `Bearer` header)
- **Infra:** Azure Static Web Apps (frontend) + Container Apps (backend, scale-to-zero)
- **IaC:** Bicep templates in `infra/`
- **CI/CD:** GitHub Actions — 4 workflows in `.github/workflows/`
- **Docker:** `node:22-alpine`, runs via `node --import tsx server.ts`

## Golden Commands

| Task | Command | Notes |
|------|---------|-------|
| Install deps | `npm ci` | Use `ci` (not `install`) for reproducible builds |
| Run server | `npx tsx server.ts` | Starts on `PORT` (default 3000) |
| Typecheck | `npx tsc --noEmit` | Validates TypeScript without emitting files |
| Storage unit tests | `npm run test:storage` | Fast, offline — no tokens needed |
| Integration tests | `npm test` | Requires `COPILOT_GITHUB_TOKEN` env var; uses `TEST_PORT=3099` |
| E2E tests (local) | `npm run test:e2e:local` | Requires Playwright browsers + `COPILOT_GITHUB_TOKEN` |
| E2E tests (prod) | `npm run test:e2e:prod` | Runs against `https://test-chat.kscloud.io` |
| Install Playwright | `npx playwright install --with-deps chromium` | Required before E2E tests |

> **No linter or formatter is configured** in this repo. Typecheck with `npx tsc --noEmit` is the primary static analysis step.

## Project Map

```
├── server.ts              # Express backend (API routes, Copilot SDK integration)
├── storage.ts             # Storage abstraction (Azure Table/Blob + in-memory fallback)
├── storage.test.ts        # Unit tests for storage module
├── test.ts                # Integration tests (SDK + server HTTP API)
├── public/                # Frontend (served as static files)
│   ├── index.html         #   Chat UI (dark theme, session sidebar)
│   ├── app.js             #   Frontend logic (token mgmt, SSE streaming, session mgmt)
│   └── staticwebapp.config.json  # Azure SWA routing config
├── e2e/
│   └── chat.spec.ts       # Playwright E2E tests
├── infra/
│   └── main.bicep         # Azure infrastructure (Container Apps + SWA + Storage Account)
├── .github/workflows/
│   ├── deploy-app.yml     # Build Docker image → GHCR → deploy to Azure
│   ├── deploy-infra.yml   # Deploy Bicep templates to Azure
│   ├── e2e-tests.yml      # E2E tests against production (post-deploy)
│   └── e2e-local.yml      # E2E tests against local server (PRs + non-main)
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript config (ES2022, strict, bundler resolution)
├── Dockerfile             # Production container (node:22-alpine)
├── playwright.config.ts   # Playwright test configuration
├── .env.example           # Template for local env vars
├── README.md              # User-facing documentation
├── TESTING.md             # Full testing documentation
├── AZURE_DEPLOYMENT.md    # Azure deployment guide
├── SCALING.md             # Container App scaling guide
├── docs.md                # Detailed technical docs
└── AGENT_LEARNINGS.md     # Quick reference for agents/developers
```

### Do Not Touch (without explicit request)

- `infra/main.bicep` — production infrastructure; changes deploy to Azure
- `.github/workflows/deploy-*.yml` — production CI/CD pipelines
- `package-lock.json` — only change via `npm install`/`npm ci`

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | None | Server status + storage backend type |
| GET | `/api/models` | Bearer token | List available Copilot models |
| GET | `/api/sessions` | Bearer token | List all sessions for the user |
| DELETE | `/api/sessions/:id` | Bearer token | Delete a session and its messages |
| GET | `/api/sessions/:id/messages` | Bearer token | Get chat messages for a session |
| PUT | `/api/sessions/:id/messages` | Bearer token | Save chat messages for a session |
| POST | `/api/chat` | Bearer token | SSE streaming chat |

## Guardrails & Safety

- **Never commit secrets.** Tokens and credentials must stay in `.env` (gitignored) or GitHub Secrets.
- **Use `.env.example`** as the template. Copy to `.env` and fill in values locally.
- **Required secret:** `COPILOT_GITHUB_TOKEN` — a fine-grained GitHub PAT with Copilot access (classic PATs do not work).
- **CI secrets** (Azure OIDC): `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` — managed in GitHub repo settings.
- **No destructive commands** (e.g., `az group delete`, `docker system prune`) unless explicitly requested.
- **Port safety:** Integration tests use `TEST_PORT=3099` to avoid conflicts with a running dev server on 3000.

## Definition of Done

When completing any code change, ensure:

1. **Tests:** Add or update tests for new/changed behavior. If no tests are needed, explicitly justify why.
   - Typecheck passes: `npx tsc --noEmit`
   - Integration tests pass: `npm test` (requires `COPILOT_GITHUB_TOKEN`)
   - E2E tests pass if UI changed: `npm run test:e2e:local`
2. **Docs:** Update relevant documentation (README.md, TESTING.md, docs.md, or inline comments) when behavior, configuration, or developer workflow changes.
3. **Validation:** Run the relevant checks locally before opening a PR:
   - `npx tsc --noEmit` (always)
   - `npm test` (if backend changed and token available)
   - `npm run test:e2e:local` (if UI or API changed and token available)
4. **PR hygiene:** Keep diffs small and focused. Include a clear summary describing what changed and why. Mention which commands were run and their results.
