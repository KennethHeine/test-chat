import { test, expect } from "@playwright/test";

/**
 * Playwright E2E tests that run against the live production site
 * at https://test-chat.kscloud.io
 *
 * These mirror the server-level tests in test.ts but exercise
 * the real UI exactly the way a user would.
 *
 * Required env var:  COPILOT_GITHUB_TOKEN
 */

const TOKEN = process.env.COPILOT_GITHUB_TOKEN || "";

test.beforeEach(async ({ page }) => {
  if (!TOKEN) {
    throw new Error(
      "COPILOT_GITHUB_TOKEN env var is required. " +
        "Set it to a fine-grained PAT with Copilot access."
    );
  }
  await page.goto("/");
});

// ─── Health check (mirrors: Server health check) ───────────────

test("page loads and shows connected status", async ({ page }) => {
  // The status bar should show the green dot (no "disconnected" class)
  const statusDot = page.locator("#status-dot");
  await expect(statusDot).not.toHaveClass(/disconnected/, { timeout: 15_000 });

  // Status text should indicate a working connection
  const statusText = page.locator("#status-text");
  await expect(statusText).toHaveText(/Connected|CLI ready/, { timeout: 15_000 });
});

// ─── Token + Models (mirrors: Server models endpoint) ──────────

test("save token and load models", async ({ page }) => {
  // Enter the token
  const tokenInput = page.locator("#token-input");
  await tokenInput.fill(TOKEN);

  // Click "Save Token"
  await page.locator("#save-token-btn").click();

  // After saving, the placeholder should confirm the token is saved
  await expect(tokenInput).toHaveAttribute("placeholder", /Token saved/);

  // The model dropdown should populate with real models (not the placeholder)
  const modelSelect = page.locator("#model-select");
  await expect(modelSelect).not.toHaveText("Loading models...", { timeout: 20_000 });
  await expect(modelSelect).not.toHaveText("Enter token to load models");

  // Should have multiple model options including gpt-4.1
  const options = modelSelect.locator("option");
  await expect(options).not.toHaveCount(0);
  const optionTexts = await options.allTextContents();
  expect(optionTexts.some((t) => t.includes("gpt"))).toBeTruthy();
});

// ─── Chat (mirrors: Server chat SSE streaming) ─────────────────

test("send message and receive streamed response", async ({ page }) => {
  // First, set the token so we can chat
  await page.locator("#token-input").fill(TOKEN);
  await page.locator("#save-token-btn").click();
  await expect(page.locator("#token-input")).toHaveAttribute("placeholder", /Token saved/);

  // Wait for models to load
  await expect(page.locator("#model-select")).not.toHaveText("Loading models...", {
    timeout: 20_000,
  });

  // The welcome message should be visible initially
  await expect(page.locator("#welcome")).toBeVisible();

  // Type a message and send it
  const input = page.locator("#message-input");
  await input.fill("Reply with exactly: PLAYWRIGHT_TEST_OK");
  await page.locator("#send-btn").click();

  // The welcome message should disappear
  await expect(page.locator("#welcome")).not.toBeVisible();

  // A user message bubble should appear
  const userMessage = page.locator(".message.user").last();
  await expect(userMessage.locator(".content")).toHaveText("Reply with exactly: PLAYWRIGHT_TEST_OK");

  // An assistant message bubble should appear with streamed content
  const assistantMessage = page.locator(".message.assistant").last();
  await expect(assistantMessage.locator(".content")).not.toBeEmpty({ timeout: 30_000 });

  // Wait for streaming to finish (typing-indicator class is removed)
  await expect(assistantMessage).not.toHaveClass(/typing-indicator/, { timeout: 30_000 });

  // The response should contain our expected text
  const responseText = await assistantMessage.locator(".content").textContent();
  expect(responseText).toContain("PLAYWRIGHT_TEST_OK");
});

// ─── Multi-turn (mirrors: SDK chat multi-turn recall) ──────────

test("multi-turn conversation retains context", async ({ page }) => {
  // Set the token
  await page.locator("#token-input").fill(TOKEN);
  await page.locator("#save-token-btn").click();
  await expect(page.locator("#token-input")).toHaveAttribute("placeholder", /Token saved/);
  await expect(page.locator("#model-select")).not.toHaveText("Loading models...", {
    timeout: 20_000,
  });

  // Turn 1: establish a fact
  const input = page.locator("#message-input");
  await input.fill("Remember this code: BETA_8832. Just say OK.");
  await page.locator("#send-btn").click();

  // Wait for assistant response and streaming to finish
  const firstAssistant = page.locator(".message.assistant").last();
  await expect(firstAssistant.locator(".content")).not.toBeEmpty({ timeout: 30_000 });
  await expect(firstAssistant).not.toHaveClass(/typing-indicator/, { timeout: 30_000 });

  // Turn 2: recall it
  await input.fill("What was the code I asked you to remember? Reply with just the code.");
  await page.locator("#send-btn").click();

  // Wait for second assistant response
  const secondAssistant = page.locator(".message.assistant").last();
  // Wait until this is a different element (it should be the 2nd assistant message)
  await expect(page.locator(".message.assistant")).toHaveCount(2, { timeout: 30_000 });
  await expect(secondAssistant.locator(".content")).not.toBeEmpty({ timeout: 30_000 });
  await expect(secondAssistant).not.toHaveClass(/typing-indicator/, { timeout: 30_000 });

  // The second response should recall the code
  const recallText = await secondAssistant.locator(".content").textContent();
  expect(recallText).toContain("BETA_8832");
});

// ─── New Chat (UI-specific test) ───────────────────────────────

test("new chat button clears conversation", async ({ page }) => {
  // Set the token and send a message first
  await page.locator("#token-input").fill(TOKEN);
  await page.locator("#save-token-btn").click();
  await expect(page.locator("#token-input")).toHaveAttribute("placeholder", /Token saved/);
  await expect(page.locator("#model-select")).not.toHaveText("Loading models...", {
    timeout: 20_000,
  });

  const input = page.locator("#message-input");
  await input.fill("Say hello.");
  await page.locator("#send-btn").click();

  // Wait for assistant response
  const assistantMessage = page.locator(".message.assistant").last();
  await expect(assistantMessage.locator(".content")).not.toBeEmpty({ timeout: 30_000 });
  await expect(assistantMessage).not.toHaveClass(/typing-indicator/, { timeout: 30_000 });

  // Click "New Chat"
  await page.locator("#new-chat-btn").click();

  // Messages should be cleared and welcome should reappear
  await expect(page.locator(".message.user")).toHaveCount(0);
  await expect(page.locator(".message.assistant")).toHaveCount(0);
  await expect(page.locator("#welcome")).toBeVisible();
});
