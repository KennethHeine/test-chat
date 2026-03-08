# Frontend Testing (E2E)

Playwright browser tests that exercise the full UI, exactly the way a real user would.

## Overview

| Item | Details |
|------|---------|
| **Framework** | [Playwright](https://playwright.dev/) |
| **Test file** | `e2e/chat.spec.ts` |
| **Config file** | `playwright.config.ts` |
| **Run command** | `npm run test:e2e` (production) or `npm run test:e2e:local` (local server) |
| **Model used** | `gpt-4.1` (0 premium requests on paid plans) |

## Prerequisites

| Requirement | Details |
|---|---|
| **Node.js 22+** | Required by `@github/copilot` (uses `node:sqlite`) |
| **Playwright browsers** | Install with `npx playwright install --with-deps chromium` |
| **`COPILOT_GITHUB_TOKEN`** | Fine-grained PAT (`github_pat_...`) with Copilot scope |

## Running Tests

```bash
# Install Playwright browsers (first time only)
npx playwright install --with-deps chromium

# Run E2E tests against production
COPILOT_GITHUB_TOKEN=github_pat_... npm run test:e2e

# Run E2E tests against local server
COPILOT_GITHUB_TOKEN=github_pat_... npm run test:e2e:local

# Run a single test by name
COPILOT_GITHUB_TOKEN=github_pat_... npx playwright test -g "save token and load models"

# Run with headed browser (for debugging)
COPILOT_GITHUB_TOKEN=github_pat_... npx playwright test --headed

# Run with Playwright UI mode
COPILOT_GITHUB_TOKEN=github_pat_... npx playwright test --ui
```

## Test Structure

### Health Check (no token required)

| Test | What it verifies |
|---|---|
| **page loads and shows connected status** | Navigates to `/`, verifies the status dot is green (no `disconnected` class) and the status text shows "Connected" or "CLI ready" |

This test always runs, even without a token. It validates that the site is up and reachable.

### Authenticated Tests (require `COPILOT_GITHUB_TOKEN`)

These tests enter the token via the UI token input field, exactly like a real user. They are wrapped in a `test.describe("authenticated tests", ...)` block and will **skip** (not fail) if the token is not provided.

| Test | What it verifies |
|---|---|
| **save token and load models** | Enters the token, clicks "Save Token", verifies the placeholder shows "Token saved ✓", waits for the model dropdown to populate with real models (including a GPT model) |
| **send message and receive streamed response** | Saves the token, waits for models to load, sends `"Reply with exactly: PLAYWRIGHT_TEST_OK"`, verifies the user message bubble appears, waits for the assistant response to stream in, checks the response contains `PLAYWRIGHT_TEST_OK` |
| **multi-turn conversation retains context** | Saves the token, sends a first message asking Copilot to remember `BETA_8832`, waits for the response, then sends a second message asking it to recall the code. Verifies the second response contains `BETA_8832` — proving session context is retained across turns |
| **new chat button clears conversation** | Saves the token, sends a message, waits for the response, clicks "New Chat", then verifies all message bubbles are removed and the welcome screen reappears |

## How Token Injection Works

The tests interact with the token input exactly as a user would:

1. Fill the `#token-input` field with the `COPILOT_GITHUB_TOKEN` value
2. Click the `#save-token-btn` button
3. Wait for the placeholder to confirm: `"Token saved ✓"`
4. Wait for the model dropdown to populate (confirms the token is valid and the backend returned models)

The token is stored in the browser's `localStorage` by the frontend code, and sent as `Authorization: Bearer <token>` on every API request.

## Test Behavior Without Token

| Scenario | Health check test | Authenticated tests |
|---|---|---|
| Token provided | ✅ Runs | ✅ Runs (enters token, tests chat) |
| Token missing | ✅ Runs | ⏭️ Skipped (not fail) |

This ensures CI always gets a meaningful result: the health check validates the deployment is alive, and authenticated tests run when the secret is configured.

## CI Workflow

E2E tests run automatically in GitHub Actions via `.github/workflows/e2e-tests.yml`:

- **Trigger**: After a successful "Deploy App" workflow on `main`, or manually via `workflow_dispatch`
- **Environment**: Ubuntu, Node 22, Chromium
- **Secret**: `COPILOT_GITHUB_TOKEN` repository secret
- **Artifacts**: On failure, screenshots and traces are uploaded as the `playwright-report` artifact

```yaml
# .github/workflows/e2e-tests.yml (key section)
- name: Run E2E tests
  run: npx playwright test
  env:
    COPILOT_GITHUB_TOKEN: ${{ secrets.COPILOT_GITHUB_TOKEN }}
```

### Local E2E Workflow

The `e2e-local.yml` workflow runs E2E tests against a local server on PRs and non-main branches:

- Starts the Express server locally on the test port
- Runs Playwright tests against the local instance
- Useful for validating UI changes before merge

## Configuration

| Setting | Value | Source |
|---------|-------|--------|
| Base URL (production) | `https://test-chat.kscloud.io` | `playwright.config.ts` |
| Base URL (local) | `http://localhost:3000` | `playwright.config.ts` |
| Test timeout | 60 seconds | Chat responses can take time on first request |
| Expect timeout | 30 seconds | Streaming responses need time to arrive |
| Model loading | 20 seconds | First model list fetch can be slow |
| Health check | 15 seconds | Production site may have cold start |
| Browser | Chromium only | Configured in `playwright.config.ts` |
| Screenshots | On failure | Uploaded as CI artifacts |

## Debugging Failures

### View failure artifacts in CI

1. Go to the failed workflow run in GitHub Actions
2. Download the `playwright-report` artifact
3. Unzip and run `npx playwright show-trace <trace.zip>` to inspect the trace

### Run with debug logging

```bash
COPILOT_GITHUB_TOKEN=github_pat_... DEBUG=pw:api npx playwright test
```

## Related Documentation

- [Frontend](frontend.md) — UI components tested by these E2E tests
- [Backend Testing](backend-testing.md) — Storage unit tests and integration tests
- [Regression Testing](regression-testing.md) — Full regression test strategy
