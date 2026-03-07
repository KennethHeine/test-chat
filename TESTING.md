# Testing

This project has two layers of automated tests:

1. **Integration tests** (`test.ts`) — SDK-level and HTTP API tests run locally
2. **E2E tests** (`e2e/chat.spec.ts`) — Playwright browser tests run against the live production site

Both test layers use `gpt-4.1` which costs **0 premium requests** on paid Copilot plans, so they are safe to run repeatedly.

---

## Integration Tests (`npm test`)

These run directly against the Copilot SDK and the local Express server. See the [README](README.md#testing) for details.

```bash
# Requires COPILOT_GITHUB_TOKEN in .env or environment
npm test
```

---

## E2E Tests (`npm run test:e2e`)

Playwright browser tests that exercise the full UI against the **live production site** at `https://test-chat.kscloud.io`, exactly the way a real user would.

### Prerequisites

| Requirement | Details |
|---|---|
| **Node.js 22+** | Required by `@github/copilot` (uses `node:sqlite`) |
| **Playwright browsers** | Install with `npx playwright install --with-deps chromium` |
| **`COPILOT_GITHUB_TOKEN`** | Fine-grained PAT (`github_pat_...`) with Copilot scope |

### Running Locally

```bash
# 1. Install dependencies and Playwright browsers
npm install
npx playwright install --with-deps chromium

# 2. Run all e2e tests
COPILOT_GITHUB_TOKEN=github_pat_... npm run test:e2e

# 3. Run a single test by name
COPILOT_GITHUB_TOKEN=github_pat_... npx playwright test -g "save token and load models"
```

### Test Structure

The tests are in `e2e/chat.spec.ts` and configured in `playwright.config.ts`.

#### Health Check (no token required)

| Test | What it verifies |
|---|---|
| **page loads and shows connected status** | Navigates to `/`, verifies the status dot is green (no `disconnected` class) and the status text shows "Connected" or "CLI ready" |

This test always runs, even without a token. It validates that the production site is up and reachable.

#### Authenticated Tests (require `COPILOT_GITHUB_TOKEN`)

These tests enter the token via the UI token input field, exactly like a real user. They are wrapped in a `test.describe("authenticated tests", ...)` block and will **skip** (not fail) if the token is not provided.

| Test | What it verifies |
|---|---|
| **save token and load models** | Enters the token, clicks "Save Token", verifies the placeholder shows "Token saved ✓", waits for the model dropdown to populate with real models (including a GPT model) |
| **send message and receive streamed response** | Saves the token, waits for models to load, sends `"Reply with exactly: PLAYWRIGHT_TEST_OK"`, verifies the user message bubble appears, waits for the assistant response to stream in, checks the response contains `PLAYWRIGHT_TEST_OK` |
| **multi-turn conversation retains context** | Saves the token, sends a first message asking Copilot to remember `BETA_8832`, waits for the response, then sends a second message asking it to recall the code. Verifies the second response contains `BETA_8832` — proving session context is retained across turns |
| **new chat button clears conversation** | Saves the token, sends a message, waits for the response, clicks "New Chat", then verifies all message bubbles are removed and the welcome screen reappears |

### How Token Injection Works

The tests interact with the token input exactly as a user would:

1. Fill the `#token-input` field with the `COPILOT_GITHUB_TOKEN` value
2. Click the `#save-token-btn` button
3. Wait for the placeholder to confirm: `"Token saved ✓"`
4. Wait for the model dropdown to populate (confirms the token is valid and the backend returned models)

The token is stored in the browser's `localStorage` by the frontend code, and sent as `Authorization: Bearer <token>` on every API request.

### CI Workflow

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

To set up the secret:

1. Go to **Settings → Secrets and variables → Actions** in the repository
2. Add `COPILOT_GITHUB_TOKEN` with a fine-grained PAT that has Copilot scope

### Test Behavior Without Token

| Scenario | Health check test | Authenticated tests |
|---|---|---|
| Token provided | ✅ Runs | ✅ Runs (enters token, tests chat) |
| Token missing | ✅ Runs | ⏭️ Skipped (not failed) |

This ensures CI always gets a meaningful result: the health check validates the deployment is alive, and authenticated tests run when the secret is configured.

### Configuration

| File | Purpose |
|---|---|
| `playwright.config.ts` | Base URL (`https://test-chat.kscloud.io`), timeouts (60s test / 30s expect), Chromium-only, screenshots on failure |
| `e2e/chat.spec.ts` | All test cases |
| `.github/workflows/e2e-tests.yml` | CI workflow definition |

### Debugging Failures

**View failure artifacts in CI:**

1. Go to the failed workflow run in GitHub Actions
2. Download the `playwright-report` artifact
3. Unzip and run `npx playwright show-trace <trace.zip>` to inspect the trace

**Run with headed browser locally:**

```bash
COPILOT_GITHUB_TOKEN=github_pat_... npx playwright test --headed
```

**Run with Playwright UI mode:**

```bash
COPILOT_GITHUB_TOKEN=github_pat_... npx playwright test --ui
```

### Timeouts

| Timeout | Value | Reason |
|---|---|---|
| Test timeout | 60 seconds | Chat responses can take time on first request |
| Expect timeout | 30 seconds | Streaming responses need time to arrive |
| Model loading | 20 seconds | First model list fetch can be slow |
| Health check | 15 seconds | Production site may have cold start |
