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
| Planning store tests | `npm run test:planning` | Fast, offline — no tokens needed |
| Integration tests | `npm test` | Requires `COPILOT_GITHUB_TOKEN` env var; uses `TEST_PORT=3099` |
| E2E tests (local) | `npm run test:e2e:local` | Requires Playwright browsers + `COPILOT_GITHUB_TOKEN` |
| E2E tests (prod) | `npm run test:e2e:prod` | Runs against `https://test-chat.kscloud.io` |
| Install Playwright | `npx playwright install --with-deps chromium` | Required before E2E tests |

> **No linter or formatter is configured** in this repo. Typecheck with `npx tsc --noEmit` is the primary static analysis step.

## Coding Conventions

- Hoist shared constants to module scope — do not define them inside functions
- Derive values from a single source of truth (e.g., `Object.keys(LABELS)` instead of maintaining a separate array)
- When ownership/authorization checks are repeated across endpoints, extract a shared helper rather than duplicating the pattern
- API endpoints must use correct HTTP status codes: 400 (bad input), 401 (missing auth), 403 (forbidden), 404 (not found)

## Project Map

```
├── server.ts              # Express backend (API routes, Copilot SDK integration)
├── tools.ts               # GitHub API tools factory (5 tools bound to user's token)
├── storage.ts             # Storage abstraction (Azure Table/Blob + in-memory fallback)
├── storage.test.ts        # Unit tests for storage module
├── planning-types.ts      # Planning data model interfaces (Goal, ResearchItem, Milestone, IssueDraft)
├── planning-store.ts      # PlanningStore interface + InMemoryPlanningStore implementation
├── planning-store.test.ts # Unit tests for planning store
├── test.ts                # Integration tests (SDK + server HTTP API)
├── public/                # Frontend (served as static files)
│   ├── index.html         #   Chat UI (dark theme, session sidebar)
│   ├── app.js             #   Frontend logic (token mgmt, SSE streaming, session mgmt)
│   └── staticwebapp.config.json  # Azure SWA routing config
├── e2e/
│   └── chat.spec.ts       # Playwright E2E tests
├── docs/                  # Documentation
│   ├── architecture.md    #   System architecture and data flow
│   ├── frontend.md        #   Frontend documentation
│   ├── backend.md         #   Backend documentation
│   ├── frontend-testing.md#   E2E / Playwright tests
│   ├── backend-testing.md #   Unit + integration tests
│   ├── regression-testing.md # Regression test strategy
│   ├── deployment.md      #   Azure deployment + scaling
│   ├── sdk-reference.md   #   Copilot SDK deep dive
│   └── roadmap.md         #   Optimization plan
├── infra/
│   └── main.bicep         # Azure infrastructure (Container Apps + SWA + Storage Account)
├── .github/workflows/
│   ├── deploy-app.yml     # Build Docker image → GHCR → deploy to Azure
│   ├── deploy-infra.yml   # Deploy Bicep templates to Azure
│   ├── e2e-tests.yml      # E2E tests against production (post-deploy)
│   └── e2e-local.yml      # E2E tests against local server (PRs + non-main)
├── .github/agents/        # Custom agent definitions (sub-agents for orchestrator)
│   ├── orchestrator.agent.md    # Stage orchestration — dispatches sub-agents
│   ├── gather-context.agent.md  # Reads plan docs, returns structured JSON
│   ├── stage-setup.agent.md     # Creates stage branch + issues
│   ├── issue-lifecycle.agent.md # Advances one issue through PR lifecycle
│   ├── stage-finalize.agent.md  # Creates full-stage PR, manages review/CI
│   ├── retrospective.agent.md   # Analyzes observations, proposes improvements
│   └── research-worker.agent.md # Executes one research sub-question for the research agent
├── scripts/orchestrator/  # PowerShell helper scripts for polling/waiting
│   ├── wait-for-agent.ps1       # Wait for Copilot coding agent to finish
│   ├── wait-for-review.ps1      # Wait for Copilot code review to complete
│   ├── trigger-ci-label.ps1     # Add CI labels + wait for workflows
│   ├── trigger-and-wait-ci.ps1  # Trigger CI and wait for completion
│   └── get-ci-failure-summary.ps1 # Extract failure logs from CI runs
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript config (ES2022, strict, bundler resolution)
├── Dockerfile             # Production container (node:22-alpine)
├── playwright.config.ts   # Playwright test configuration
├── .env.example           # Template for local env vars
└── README.md              # User-facing documentation
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
| POST | `/api/chat/abort` | Bearer token | Abort streaming response |
| POST | `/api/chat/model` | Bearer token | Switch model mid-conversation |
| GET | `/api/quota` | Bearer token | Premium request quota |

## SDK Quick Reference

- `session.on()` returns an **unsubscribe function** — there is no `.off()` method
- `onPermissionRequest` is **required** in `SessionConfig` — uses custom `safePermissionHandler`
- Delta events carry content in `event.data.deltaContent` (not `event.data.content`)
- One `CopilotClient` per user token — `client.start()` launches a Copilot CLI subprocess
- `COPILOT_GITHUB_TOKEN` must be a **fine-grained PAT** (`github_pat_`), not a classic PAT (`ghp_`)
- `gpt-4.1` costs **0 premium requests** on paid plans — used in all tests

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
2. **Docs:** Update relevant documentation in `docs/` or `README.md` when behavior, configuration, or developer workflow changes.
3. **Validation:** Run the relevant checks locally before opening a PR:
   - `npx tsc --noEmit` (always)
   - `npm test` (if backend changed and token available)
   - `npm run test:e2e:local` (if UI or API changed and token available)
4. **PR hygiene:** Keep diffs small and focused. Include a clear summary describing what changed and why. Mention which commands were run and their results.
