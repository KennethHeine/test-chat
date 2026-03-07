import { test, expect, Page } from "@playwright/test";

/**
 * Playwright E2E tests that run against either:
 *   - Production:  https://test-chat.kscloud.io  (--project=prod)
 *   - Local dev:   http://localhost:3000          (--project=local)
 *
 * Required env var:  COPILOT_GITHUB_TOKEN  (for authenticated tests)
 */

const TOKEN = process.env.COPILOT_GITHUB_TOKEN || "";

/** Saves the token via the UI, waits for models to load, and selects one. */
async function authenticateAndSelectModel(page: Page) {
  const tokenInput = page.locator("#token-input");
  await tokenInput.fill(TOKEN);
  await page.locator("#save-token-btn").click();
  await expect(tokenInput).toHaveAttribute("placeholder", /Token saved/);

  // Wait for model dropdown to populate
  const modelSelect = page.locator("#model-select");
  await expect(modelSelect).not.toHaveText("Loading models...", { timeout: 30_000 });
  await expect(modelSelect).not.toHaveText("Enter token to load models");

  // Select a model (prefer gpt-4.1, fall back to first available)
  const options = modelSelect.locator("option");
  const count = await options.count();
  expect(count).toBeGreaterThan(0);

  const optionValues = await options.evaluateAll((opts: HTMLOptionElement[]) =>
    opts.map((o) => o.value)
  );
  const preferred = optionValues.find((v) => v.includes("gpt-4.1")) ?? optionValues[0];
  await modelSelect.selectOption(preferred);
  expect(await modelSelect.inputValue()).toBe(preferred);
}

// ─── Health check ──────────────────────────────────────────────

test("page loads and shows connected status", async ({ page }) => {
  await page.goto("/");

  const statusDot = page.locator("#status-dot");
  await expect(statusDot).not.toHaveClass(/disconnected/, { timeout: 15_000 });

  const statusText = page.locator("#status-text");
  await expect(statusText).toHaveText(/Connected|CLI ready/, { timeout: 15_000 });
});

test("health API reports storage backend", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const data = await res.json();
  expect(data.status).toBe("ok");
  expect(["memory", "azure"]).toContain(data.storage);
});

// ─── Tests that require a Copilot token ────────────────────────

test.describe("authenticated tests", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!TOKEN, "COPILOT_GITHUB_TOKEN env var is required");
    await page.goto("/");
  });

  // ─── Token + Models ────────────────────────────────────────────

  test("save token, load models, and select one", async ({ page }) => {
    await authenticateAndSelectModel(page);

    // Verify the dropdown has real model options
    const options = page.locator("#model-select option");
    const optionTexts = await options.allTextContents();
    expect(optionTexts.some((t) => t.includes("gpt"))).toBeTruthy();
  });

  // ─── Chat ──────────────────────────────────────────────────────

  test("send message and receive streamed response", async ({ page }) => {
    await authenticateAndSelectModel(page);

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

    // Wait for streaming to finish
    await expect(assistantMessage).not.toHaveClass(/typing-indicator/, { timeout: 30_000 });

    // The response should contain our expected text
    const responseText = await assistantMessage.locator(".content").textContent();
    expect(responseText).toContain("PLAYWRIGHT_TEST_OK");
  });

  // ─── Multi-turn ────────────────────────────────────────────────

  test("multi-turn conversation retains context", async ({ page }) => {
    await authenticateAndSelectModel(page);

    const input = page.locator("#message-input");

    // Turn 1: establish a fact
    await input.fill("Remember this code: BETA_8832. Just say OK.");
    await page.locator("#send-btn").click();

    const firstAssistant = page.locator(".message.assistant").last();
    await expect(firstAssistant.locator(".content")).not.toBeEmpty({ timeout: 30_000 });
    await expect(firstAssistant).not.toHaveClass(/typing-indicator/, { timeout: 30_000 });

    // Turn 2: recall it
    await input.fill("What was the code I asked you to remember? Reply with just the code.");
    await page.locator("#send-btn").click();

    await expect(page.locator(".message.assistant")).toHaveCount(2, { timeout: 30_000 });
    const secondAssistant = page.locator(".message.assistant").last();
    await expect(secondAssistant.locator(".content")).not.toBeEmpty({ timeout: 30_000 });
    await expect(secondAssistant).not.toHaveClass(/typing-indicator/, { timeout: 30_000 });

    const recallText = await secondAssistant.locator(".content").textContent();
    expect(recallText).toContain("BETA_8832");
  });

  // ─── New Chat ──────────────────────────────────────────────────

  test("new chat button clears conversation", async ({ page }) => {
    await authenticateAndSelectModel(page);

    const input = page.locator("#message-input");
    await input.fill("Say hello.");
    await page.locator("#send-btn").click();

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

  // ─── Session Sidebar ──────────────────────────────────────────

  test("session sidebar shows saved sessions", async ({ page }) => {
    await authenticateAndSelectModel(page);

    // The session sidebar should be visible
    const sidebar = page.locator("#session-sidebar");
    await expect(sidebar).toBeVisible();

    // Initially shows empty state
    await expect(page.locator(".session-empty")).toBeVisible();

    // Send a message to create a session
    const input = page.locator("#message-input");
    await input.fill("Reply with exactly: SESSION_E2E_TEST");
    await page.locator("#send-btn").click();

    const assistantMessage = page.locator(".message.assistant").last();
    await expect(assistantMessage.locator(".content")).not.toBeEmpty({ timeout: 30_000 });
    await expect(assistantMessage).not.toHaveClass(/typing-indicator/, { timeout: 30_000 });

    // The session should now appear in the sidebar
    const sessionItem = page.locator(".session-item").first();
    await expect(sessionItem).toBeVisible({ timeout: 5_000 });

    // Session item should contain the message text as title
    const sessionText = sessionItem.locator(".session-item-text");
    await expect(sessionText).toContainText("SESSION_E2E_TEST");
  });

  test("toggle sidebar button hides and shows sidebar", async ({ page }) => {
    await authenticateAndSelectModel(page);

    const sidebar = page.locator("#session-sidebar");
    await expect(sidebar).toBeVisible();

    // Toggle to hide
    await page.locator("#toggle-sidebar-btn").click();
    await expect(sidebar).not.toBeVisible();

    // Toggle to show
    await page.locator("#toggle-sidebar-btn").click();
    await expect(sidebar).toBeVisible();
  });
});
