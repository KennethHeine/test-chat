import { defineConfig } from "@playwright/test";

/**
 * Playwright E2E tests — works against both local dev and production.
 *
 * Usage:
 *   # Test production
 *   COPILOT_GITHUB_TOKEN=ghp_... npx playwright test --project=prod
 *
 *   # Test local (starts server automatically)
 *   COPILOT_GITHUB_TOKEN=ghp_... npx playwright test --project=local
 *
 *   # Default (no --project): uses BASE_URL env var, falls back to prod
 *   BASE_URL=http://localhost:3000 npx playwright test
 */

const baseURL = process.env.BASE_URL || "https://test-chat.kscloud.io";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "prod",
      use: {
        browserName: "chromium",
        baseURL: "https://test-chat.kscloud.io",
      },
    },
    {
      name: "local",
      use: {
        browserName: "chromium",
        baseURL: "http://localhost:3000",
      },
    },
  ],
  /* Start a local server when running 'local' project */
  webServer: process.env.BASE_URL?.includes("localhost") || process.argv.some((a) => a.includes("local"))
    ? {
        command: "npx tsx server.ts",
        port: 3000,
        timeout: 30_000,
        reuseExistingServer: true,
      }
    : undefined,
});
