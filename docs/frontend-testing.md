# Frontend Testing (E2E)

Playwright browser tests that exercise the full React UI, exactly the way a real user would.

## Overview

| Item | Details |
|------|---------|
| **Framework** | [Playwright](https://playwright.dev/) |
| **Test file** | `e2e/chat.spec.ts` |
| **Config file** | `playwright.config.ts` |
| **Run command** | `npm run test:e2e` (production) or `npm run test:e2e:local` (local server) |
| **Model used** | `gpt-4.1` (0 premium requests on paid plans) |
| **Frontend** | React 19 + TypeScript + Vite (built to `frontend/dist/`) |

## Prerequisites

| Requirement | Details |
|---|---|
| **Node.js 22+** | Required by `@github/copilot` (uses `node:sqlite`) |
| **Frontend build** | Run `npm run build:frontend` before E2E tests (build is checked in CI) |
| **Playwright browsers** | Install with `npx playwright install --with-deps chromium` |
| **`COPILOT_GITHUB_TOKEN`** | Fine-grained PAT (`github_pat_...`) with Copilot scope |

## Running Tests

```bash
# Build the React frontend first
npm run build:frontend

# Install Playwright browsers (first time only)
npx playwright install --with-deps chromium

# Run E2E tests against local server
COPILOT_GITHUB_TOKEN=github_pat_... npm run test:e2e:local

# Run E2E tests against production
COPILOT_GITHUB_TOKEN=github_pat_... npm run test:e2e

# Run a single test by name
npx playwright test --project=local -g "dashboard toggle"

# Run with headed browser (for debugging)
npx playwright test --project=local --headed

# Run with Playwright UI mode
npx playwright test --project=local --ui
```

## Test Categories

### Health Check (no token required — 2 tests)

| Test | What it verifies |
|---|---|
| **page loads and shows connected status** | Status dot is green, shows "Connected" or "CLI ready" |
| **health API reports storage backend** | `GET /api/health` returns valid JSON with status |

### Dashboard Layout (no token required — 3 tests)

| Test | What it verifies |
|---|---|
| **dashboard toggle button** | Switches between chat and dashboard views via `#view-toggle-btn` |
| **dashboard sidebar navigation** | Navigates between goals/research/milestones/issues pages |
| **dashboard nav active state** | Active nav item gets `active` CSS class |

### Goals Dashboard (stubbed API — 4 tests)

| Test | What it verifies |
|---|---|
| **list renders with counts** | Goal list items show title and research/milestone/issue counts |
| **click opens detail view** | Clicking a goal shows detail view with full fields and count badges |
| **keyboard Enter opens detail** | Enter key on focused goal opens detail view |
| **back button returns to list** | Back button in detail view returns to goal list |

### Research Tracker (stubbed API — 7 tests)

| Test | What it verifies |
|---|---|
| **grouped by category** | Items grouped under Architecture/UX headers with correct counts |
| **status indicators** | Open/researching/resolved badges with correct CSS classes |
| **findings displayed** | Resolved items show findings text |
| **edit button shows textarea** | Edit button opens textarea, hides edit button |
| **cancel closes edit** | Cancel button closes edit area without saving |
| **save sends PATCH** | Save button sends PATCH request and closes edit area |
| **summary counts** | Summary line shows open/researching/resolved counts |

### Milestone Timeline (stubbed API — 7 tests)

| Test | What it verifies |
|---|---|
| **correct order** | Milestones ordered by position with `#1`, `#2`, `#3` labels |
| **names displayed** | Milestone names shown correctly |
| **status badges** | Status classes (`status-complete`, `status-in-progress`, `status-draft`) |
| **issue counts** | Accurate issue counts per milestone |
| **dependencies** | Dependency tags (e.g., `#1`, `#2`) shown for dependent milestones |
| **summary counts** | Summary line shows draft/in-progress/complete counts |
| **XSS prevention** | Script tags in names render as text, not executed |

### Issue Drafts (stubbed API — 10 tests)

| Test | What it verifies |
|---|---|
| **correct order** | Issues ordered by sequence with `#1`, `#2`, `#3` labels |
| **titles displayed** | Issue titles shown correctly |
| **status badges** | Status classes (`status-draft`, `status-ready`, `status-created`) |
| **summary counts** | Summary line shows draft/ready/created counts |
| **expand shows fields** | Expand button shows Purpose, Problem, Expected Outcome, etc. |
| **GitHub preview** | Preview toggle renders HTML preview with section headings |
| **approve button** | Approve button updates status from draft to ready |
| **batch approve** | Batch approve marks all draft/ready as ready |
| **XSS prevention** | Script/img tags in titles render as text |
| **empty milestone** | Selecting empty milestone shows empty state message |

### Push Approval Workflow (stubbed API — 8 tests)

| Test | What it verifies |
|---|---|
| **button visible** | Push to GitHub button visible when ready issues exist |
| **button hidden without token** | Button hidden when no token is set |
| **modal opens/closes** | Modal opens on click, closes on X button |
| **modal closes on Escape** | Escape key closes the modal |
| **confirm disabled** | Confirm button disabled without owner/repo |
| **confirm enabled** | Confirm enabled with valid owner/repo and mutations |
| **happy path** | Progress bar shown, results displayed on success |
| **partial failure** | Failure results shown for individual items |

### Authenticated Tests (require `COPILOT_GITHUB_TOKEN` — 6 tests)

These tests interact with a real Copilot backend and are **skipped** when the token is missing.

| Test | What it verifies |
|---|---|
| **save token and load models** | Token saved, models loaded from API |
| **send message and receive response** | Full SSE streaming chat flow |
| **multi-turn context** | Session context retained across messages |
| **new chat clears** | New Chat button resets conversation |
| **session sidebar** | Saved sessions appear in sidebar |
| **toggle sidebar** | Sidebar toggle button works |

## Test Behavior Without Token

| Scenario | Unauthenticated tests | Authenticated tests |
|---|---|---|
| Token provided | ✅ 41 pass | ✅ 6 run |
| Token missing | ✅ 41 pass | ⏭️ 6 skipped |

## API Stubbing Pattern

Dashboard tests use Playwright's `page.route()` to intercept API requests:

```typescript
await page.route("**/api/goals", (route) => {
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ goals: [...] }),
  });
});
```

Tests also set localStorage directly for the token:

```typescript
await page.evaluate(() =>
  localStorage.setItem("copilot_github_token", "fake-test-token")
);
```

## CI Workflow

E2E tests run automatically in GitHub Actions:

- **`e2e-local.yml`**: Runs against local server on PRs and non-main branches
  - Builds frontend via `npm run build:frontend`
  - Starts Express server locally
  - Runs Playwright tests
- **`e2e-tests.yml`**: Runs against production after deploy
- **Artifacts**: On failure, screenshots and traces uploaded as `playwright-report`

## Debugging Failures

### View failure traces

```bash
npx playwright show-trace test-results/<test-name>/trace.zip
```

### Run with debug logging

```bash
DEBUG=pw:api npx playwright test --project=local --headed
```

## Related Documentation

- [Frontend](frontend.md) — React UI architecture and components
- [Backend Testing](backend-testing.md) — Storage unit tests and integration tests
- [Regression Testing](regression-testing.md) — Full regression test strategy
