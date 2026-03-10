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
  await expect(statusText).toHaveText(/Connected|client/, { timeout: 15_000 });
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

// ─── Goal Card ─────────────────────────────────────────────────

test("goal card renders with correct fields when renderGoalCard is called", async ({ page }) => {
  await page.goto("/");

  const mockGoal = {
    id: "test-goal-e2e",
    sessionId: "test-session",
    intent: "Build a simple task tracking API",
    goal: "Deliver a minimal REST API for task management",
    problemStatement: "No existing task tracking solution fits our workflow",
    businessValue: "Increases team productivity by 20%",
    targetOutcome: "A working API used by all team members",
    successCriteria: ["All CRUD endpoints respond in < 200ms", "API handles 100 concurrent requests"],
    assumptions: ["Team has Node.js experience"],
    constraints: ["Must use existing infrastructure"],
    risks: ["Team bandwidth may be limited"],
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  };

  // Directly call renderGoalCard via page.evaluate to test card rendering without a real API call
  await page.evaluate((goal) => {
    // @ts-ignore — renderGoalCard is defined in app.js global scope
    renderGoalCard(goal);
  }, mockGoal);

  // The goal card should appear in the messages area
  const card = page.locator(".goal-card").first();
  await expect(card).toBeVisible();

  // Verify the header shows the correct title
  await expect(card.locator(".goal-card-header")).toHaveText("🎯 Goal Defined");

  // Verify key fields are displayed
  await expect(card.locator(".goal-card-value").first()).toContainText("Build a simple task tracking API");
  await expect(card.locator(".goal-card-body")).toContainText("Deliver a minimal REST API for task management");
  await expect(card.locator(".goal-card-body")).toContainText("No existing task tracking solution fits our workflow");

  // Verify success criteria items appear
  await expect(card.locator(".goal-card-list li").first()).toContainText("All CRUD endpoints respond in < 200ms");

  // Verify the counts are shown
  await expect(card.locator(".goal-card-counts")).toContainText("Assumptions: 1");
  await expect(card.locator(".goal-card-counts")).toContainText("Constraints: 1");
  await expect(card.locator(".goal-card-counts")).toContainText("Risks: 1");

  // Verify goal ID is attached to the card element
  await expect(card).toHaveAttribute("data-goal-id", "test-goal-e2e");
});

test("SSE tool_complete event for save_goal triggers goal card via handleToolComplete", async ({ page }) => {
  await page.goto("/");

  const mockGoal = {
    id: "sse-wiring-test-goal",
    sessionId: "sse-test-session",
    intent: "Automate release workflow",
    goal: "Build a CI/CD pipeline",
    problemStatement: "Releases are manual and error-prone",
    businessValue: "Faster, reliable deploys",
    targetOutcome: "Fully automated release process",
    successCriteria: ["Pipeline runs in < 10 minutes"],
    assumptions: [],
    constraints: [],
    risks: [],
    createdAt: "2025-06-01T00:00:00Z",
    updatedAt: "2025-06-01T00:00:00Z",
  };

  // Simulate the SSE dispatch path: call handleToolComplete with a save_goal result,
  // which is what the streaming loop does when it receives a tool_complete SSE event.
  await page.evaluate((goal) => {
    // @ts-ignore — handleToolComplete is defined in app.js global scope
    handleToolComplete({ type: "tool_complete", tool: "save_goal", result: goal });
  }, mockGoal);

  // The goal card should be rendered just as if the real SSE stream triggered it
  const card = page.locator(".goal-card[data-goal-id='sse-wiring-test-goal']");
  await expect(card).toBeVisible();
  await expect(card.locator(".goal-card-header")).toHaveText("🎯 Goal Defined");
  await expect(card.locator(".goal-card-body")).toContainText("Automate release workflow");
  await expect(card.locator(".goal-card-list li").first()).toContainText("Pipeline runs in < 10 minutes");
});

test("SSE tool_complete for save_goal without result falls back to fetchAndRenderLatestGoal", async ({ page }) => {
  await page.goto("/");

  // Override fetchAndRenderLatestGoal with a spy that renders a card directly,
  // so we can verify it's called without making a real API call.
  await page.evaluate(() => {
    // @ts-ignore — override the global function defined in app.js
    window._fetchAndRenderCalled = false;
    // @ts-ignore
    fetchAndRenderLatestGoal = async () => {
      // @ts-ignore
      window._fetchAndRenderCalled = true;
      // Render a sentinel card so the test can assert it appeared
      // @ts-ignore
      renderGoalCard({
        id: "fallback-goal",
        sessionId: "test",
        intent: "Fallback test intent",
        goal: "Fallback goal",
        problemStatement: "Problem",
        businessValue: "Value",
        targetOutcome: "Outcome",
        successCriteria: ["Fallback criterion"],
        assumptions: [],
        constraints: [],
        risks: [],
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
      });
    };
  });

  // Simulate the SSE event with no result (fallback path)
  await page.evaluate(() => {
    // @ts-ignore
    handleToolComplete({ type: "tool_complete", tool: "save_goal" });
  });

  // Verify the fallback was invoked and a goal card was rendered
  const calledFallback = await page.evaluate(() => (window as any)._fetchAndRenderCalled);
  expect(calledFallback).toBe(true);

  const card = page.locator(".goal-card[data-goal-id='fallback-goal']");
  await expect(card).toBeVisible();
  await expect(card.locator(".goal-card-body")).toContainText("Fallback test intent");
});

// ─── Goal Card — authenticated (requires Copilot token) ────────

test.describe("goal card — authenticated", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!TOKEN, "COPILOT_GITHUB_TOKEN is required for this test");
    await page.goto("/");
  });

  test("save_goal tool invocation renders goal card in chat", async ({ page }) => {
    await authenticateAndSelectModel(page);

    const input = page.locator("#message-input");

    // Send a message that instructs the agent to call save_goal with all required fields.
    // The prompt is explicit so the LLM reliably uses the planning tool.
    await input.fill(
      "Use the save_goal tool to save a goal with exactly these values — " +
      "intent: 'E2E test goal intent', " +
      "goal: 'E2E test refined goal', " +
      "problemStatement: 'E2E test problem', " +
      "businessValue: 'E2E test value', " +
      "targetOutcome: 'E2E test outcome', " +
      "successCriteria: ['E2E criterion one'], " +
      "assumptions: [], constraints: [], risks: []. " +
      "Call the tool now and confirm when done."
    );
    await page.locator("#send-btn").click();

    // Wait for the goal card to appear (tool invocations take time)
    const card = page.locator(".goal-card").last();
    await expect(card).toBeVisible({ timeout: 90_000 });

    // Verify the card contains expected text from the saved goal
    await expect(card.locator(".goal-card-header")).toHaveText("🎯 Goal Defined");
    await expect(card.locator(".goal-card-body")).toContainText("E2E test goal intent");
    await expect(card.locator(".goal-card-body")).toContainText("E2E test refined goal");
  });
});

// ─── Research Checklist Card ────────────────────────────────────

test("research checklist card renders with correct categories and status badges", async ({ page }) => {
  await page.goto("/");

  const mockItems = [
    { id: "r1", goalId: "g1", category: "domain", question: "What is the target user base?", status: "open", findings: "", decision: "" },
    { id: "r2", goalId: "g1", category: "domain", question: "What regulations apply?", status: "resolved", findings: "GDPR", decision: "Implement consent flow" },
    { id: "r3", goalId: "g1", category: "architecture", question: "Which database should we use?", status: "researching", findings: "Evaluating options", decision: "" },
    { id: "r4", goalId: "g1", category: "security", question: "How should authentication work?", status: "open", findings: "", decision: "" },
  ];

  // Call renderResearchChecklist directly to test card rendering without a real API call
  await page.evaluate((items) => {
    // @ts-ignore — renderResearchChecklist is defined in app.js global scope
    renderResearchChecklist(items);
  }, mockItems);

  // The research card should appear in the messages area
  const card = page.locator(".research-card").first();
  await expect(card).toBeVisible();

  // Verify the header
  await expect(card.locator(".research-card-header")).toHaveText("🔬 Research Checklist");

  // Verify categories are grouped
  const categoryGroups = card.locator(".research-category-group");
  await expect(categoryGroups).toHaveCount(3); // domain, architecture, security

  // Verify category headers
  const catHeaders = card.locator(".research-category-header");
  await expect(catHeaders.nth(0)).toHaveText("Domain");
  await expect(catHeaders.nth(1)).toHaveText("Architecture");
  await expect(catHeaders.nth(2)).toHaveText("Security");

  // Verify status badges appear correctly
  await expect(card.locator(".research-item-status.status-open").first()).toHaveText("open");
  await expect(card.locator(".research-item-status.status-resolved").first()).toHaveText("resolved");
  await expect(card.locator(".research-item-status.status-researching").first()).toHaveText("researching");

  // Verify question text is rendered
  await expect(card.locator(".research-item-question").first()).toContainText("What is the target user base?");

  // Verify summary line
  await expect(card.locator(".research-card-summary")).toContainText("Open: 2");
  await expect(card.locator(".research-card-summary")).toContainText("Researching: 1");
  await expect(card.locator(".research-card-summary")).toContainText("Resolved: 1");
});

test("SSE tool_complete event for generate_research_checklist renders checklist via handleToolComplete", async ({ page }) => {
  await page.goto("/");

  const mockResult = {
    items: [
      { id: "ri1", goalId: "g1", category: "architecture", question: "Should we use microservices?", status: "open", findings: "", decision: "" },
      { id: "ri2", goalId: "g1", category: "security", question: "How to handle secrets?", status: "open", findings: "", decision: "" },
    ],
  };

  // Simulate the SSE dispatch path: call handleToolComplete with a generate_research_checklist result
  await page.evaluate((result) => {
    // @ts-ignore — handleToolComplete is defined in app.js global scope
    handleToolComplete({ type: "tool_complete", tool: "generate_research_checklist", result });
  }, mockResult);

  // The research card should be rendered
  const card = page.locator(".research-card").first();
  await expect(card).toBeVisible();
  await expect(card.locator(".research-card-header")).toHaveText("🔬 Research Checklist");
  await expect(card.locator(".research-category-header").first()).toHaveText("Architecture");
  await expect(card.locator(".research-item-question").first()).toContainText("Should we use microservices?");
});

test("research checklist XSS prevention: question text is escaped before rendering", async ({ page }) => {
  await page.goto("/");

  const maliciousItems = [
    { id: "xss1", goalId: "g1", category: "domain", question: '<script>window.__xss_executed=true</script>Malicious question', status: "open", findings: "", decision: "" },
  ];

  await page.evaluate((items) => {
    // @ts-ignore
    renderResearchChecklist(items);
  }, maliciousItems);

  // XSS script should NOT have executed
  const xssExecuted = await page.evaluate(() => (window as any).__xss_executed);
  expect(xssExecuted).toBeFalsy();

  // The raw text content should appear escaped (not executed) in the DOM
  const card = page.locator(".research-card").first();
  await expect(card).toBeVisible();
  await expect(card.locator(".research-item-question").first()).toContainText("Malicious question");
});
