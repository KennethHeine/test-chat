import { defineConfig } from "@playwright/test";

/**
 * Playwright E2E tests against the live production site.
 *
 * Usage:
 *   COPILOT_GITHUB_TOKEN=github_pat_... npx playwright test
 *
 * The token is injected into the browser via the UI token-input flow,
 * exactly the way a real user would do it.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "https://test-chat.kscloud.io",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
});
