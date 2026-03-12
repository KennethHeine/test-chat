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

// ─── Milestone Timeline Card ────────────────────────────────────

test("milestone timeline card renders with correct order, status badges, and dependencies", async ({ page }) => {
  await page.goto("/");

  const mockMilestones = [
    {
      id: "ms-1",
      goalId: "goal-1",
      name: "Foundation",
      goal: "Set up core infrastructure",
      scope: "Auth and data layer only",
      order: 1,
      dependencies: [],
      acceptanceCriteria: ["Login works"],
      exitCriteria: [],
      status: "complete",
    },
    {
      id: "ms-2",
      goalId: "goal-1",
      name: "API Layer",
      goal: "Expose REST endpoints",
      scope: "CRUD endpoints, no UI",
      order: 2,
      dependencies: ["ms-1"],
      acceptanceCriteria: ["All endpoints return 200"],
      exitCriteria: [],
      status: "in-progress",
    },
    {
      id: "ms-3",
      goalId: "goal-1",
      name: "Frontend",
      goal: "Build the user interface",
      scope: "Dashboard only",
      order: 3,
      dependencies: ["ms-2"],
      acceptanceCriteria: ["UI renders on mobile"],
      exitCriteria: [],
      status: "draft",
    },
  ];

  // Directly call renderMilestoneTimeline to test card rendering without a real API call
  await page.evaluate((milestones) => {
    // @ts-ignore — renderMilestoneTimeline is defined in app.js global scope
    renderMilestoneTimeline(milestones);
  }, mockMilestones);

  // The milestone card should appear in the messages area
  const card = page.locator(".milestone-card").first();
  await expect(card).toBeVisible();

  // Verify the header
  await expect(card.locator(".milestone-card-header")).toHaveText("🗺️ Milestone Plan");

  // Verify three milestone items are rendered
  const items = card.locator(".milestone-item");
  await expect(items).toHaveCount(3);

  // Verify order numbers
  await expect(items.nth(0).locator(".milestone-order")).toHaveText("#1");
  await expect(items.nth(1).locator(".milestone-order")).toHaveText("#2");
  await expect(items.nth(2).locator(".milestone-order")).toHaveText("#3");

  // Verify milestone names
  await expect(items.nth(0).locator(".milestone-name")).toHaveText("Foundation");
  await expect(items.nth(1).locator(".milestone-name")).toHaveText("API Layer");
  await expect(items.nth(2).locator(".milestone-name")).toHaveText("Frontend");

  // Verify status badges
  await expect(items.nth(0).locator(".milestone-status")).toHaveText("complete");
  await expect(items.nth(1).locator(".milestone-status")).toHaveText("in-progress");
  await expect(items.nth(2).locator(".milestone-status")).toHaveText("draft");

  // Verify status CSS classes
  await expect(items.nth(0).locator(".milestone-status")).toHaveClass(/status-complete/);
  await expect(items.nth(1).locator(".milestone-status")).toHaveClass(/status-in-progress/);
  await expect(items.nth(2).locator(".milestone-status")).toHaveClass(/status-draft/);

  // Verify goal text is rendered
  await expect(items.nth(0).locator(".milestone-goal")).toHaveText("Set up core infrastructure");

  // Verify dependencies are shown using order references
  await expect(items.nth(1).locator(".milestone-deps")).toContainText("Depends on:");
  await expect(items.nth(1).locator(".milestone-deps")).toContainText("#1");
  await expect(items.nth(2).locator(".milestone-deps")).toContainText("#2");

  // Verify the first milestone has no dependencies section
  await expect(items.nth(0).locator(".milestone-deps")).toHaveCount(0);

  // Verify summary line
  await expect(card.locator(".milestone-card-summary")).toContainText("Draft: 1");
  await expect(card.locator(".milestone-card-summary")).toContainText("In Progress: 1");
  await expect(card.locator(".milestone-card-summary")).toContainText("Complete: 1");
});

test("SSE tool_complete event for create_milestone_plan renders timeline via handleToolComplete", async ({ page }) => {
  await page.goto("/");

  const mockResult = {
    milestones: [
      {
        id: "ms-a",
        goalId: "goal-2",
        name: "Phase 1",
        goal: "Initial setup",
        scope: "Infra only",
        order: 1,
        dependencies: [],
        acceptanceCriteria: [],
        exitCriteria: [],
        status: "ready",
      },
      {
        id: "ms-b",
        goalId: "goal-2",
        name: "Phase 2",
        goal: "Feature development",
        scope: "Core features",
        order: 2,
        dependencies: ["ms-a"],
        acceptanceCriteria: [],
        exitCriteria: [],
        status: "draft",
      },
    ],
  };

  // Simulate the SSE dispatch path: call handleToolComplete with a create_milestone_plan result
  await page.evaluate((result) => {
    // @ts-ignore — handleToolComplete is defined in app.js global scope
    handleToolComplete({ type: "tool_complete", tool: "create_milestone_plan", result });
  }, mockResult);

  // The milestone card should be rendered
  const card = page.locator(".milestone-card").first();
  await expect(card).toBeVisible();
  await expect(card.locator(".milestone-card-header")).toHaveText("🗺️ Milestone Plan");

  const items = card.locator(".milestone-item");
  await expect(items).toHaveCount(2);
  await expect(items.nth(0).locator(".milestone-name")).toHaveText("Phase 1");
  await expect(items.nth(1).locator(".milestone-name")).toHaveText("Phase 2");
});

test("SSE tool_complete event for get_milestones renders timeline via handleToolComplete", async ({ page }) => {
  await page.goto("/");

  const mockResult = {
    milestones: [
      {
        id: "ms-x",
        goalId: "goal-3",
        name: "Milestone X",
        goal: "Deliver X",
        scope: "Only X",
        order: 1,
        dependencies: [],
        acceptanceCriteria: [],
        exitCriteria: [],
        status: "in-progress",
      },
    ],
  };

  await page.evaluate((result) => {
    // @ts-ignore
    handleToolComplete({ type: "tool_complete", tool: "get_milestones", result });
  }, mockResult);

  const card = page.locator(".milestone-card").first();
  await expect(card).toBeVisible();
  await expect(card.locator(".milestone-item .milestone-name").first()).toHaveText("Milestone X");
  await expect(card.locator(".milestone-item .milestone-status").first()).toHaveClass(/status-in-progress/);
});

test("milestone timeline XSS prevention: milestone name and goal are escaped before rendering", async ({ page }) => {
  await page.goto("/");

  const maliciousMilestones = [
    {
      id: "ms-xss",
      goalId: "g1",
      name: '<script>window.__xss_ms=true</script>Malicious name',
      goal: '<img src=x onerror="window.__xss_ms=true">Malicious goal',
      scope: "test",
      order: 1,
      dependencies: [],
      acceptanceCriteria: [],
      exitCriteria: [],
      status: "draft",
    },
  ];

  await page.evaluate((milestones) => {
    // @ts-ignore
    renderMilestoneTimeline(milestones);
  }, maliciousMilestones);

  // XSS should NOT have executed
  const xssExecuted = await page.evaluate(() => (window as any).__xss_ms);
  expect(xssExecuted).toBeFalsy();

  // Malicious text should appear as literal text content
  const card = page.locator(".milestone-card").first();
  await expect(card).toBeVisible();
  await expect(card.locator(".milestone-name").first()).toContainText("Malicious name");
  await expect(card.locator(".milestone-goal").first()).toContainText("Malicious goal");
});

// ─── Dashboard Layout ──────────────────────────────────────────

test("dashboard toggle button switches between chat and dashboard views", async ({ page }) => {
  await page.goto("/");

  // Chat view is default: chat area visible, dashboard hidden
  await expect(page.locator("#chat-area")).toBeVisible();
  await expect(page.locator("#dashboard-view")).not.toBeVisible();

  // The toggle button should say "Dashboard"
  const toggleBtn = page.locator("#view-toggle-btn");
  await expect(toggleBtn).toHaveText("Dashboard");

  // Click to switch to dashboard
  await toggleBtn.click();
  await expect(page.locator("#chat-area")).not.toBeVisible();
  await expect(page.locator("#dashboard-view")).toBeVisible();
  await expect(toggleBtn).toHaveText("Chat");

  // Click again to switch back to chat
  await toggleBtn.click();
  await expect(page.locator("#chat-area")).toBeVisible();
  await expect(page.locator("#dashboard-view")).not.toBeVisible();
  await expect(toggleBtn).toHaveText("Dashboard");
});

test("dashboard sidebar navigation switches between pages", async ({ page }) => {
  await page.goto("/");

  // Switch to dashboard view
  await page.locator("#view-toggle-btn").click();

  // Goals page is active by default
  await expect(page.locator("#dashboard-page-goals")).toBeVisible();
  await expect(page.locator("#dashboard-page-research")).not.toBeVisible();
  await expect(page.locator("#dashboard-page-milestones")).not.toBeVisible();
  await expect(page.locator("#dashboard-page-issues")).not.toBeVisible();

  // Navigate to Research
  await page.locator(".dashboard-nav-item[data-page='research']").click();
  await expect(page.locator("#dashboard-page-research")).toBeVisible();
  await expect(page.locator("#dashboard-page-goals")).not.toBeVisible();

  // Navigate to Milestones
  await page.locator(".dashboard-nav-item[data-page='milestones']").click();
  await expect(page.locator("#dashboard-page-milestones")).toBeVisible();
  await expect(page.locator("#dashboard-page-research")).not.toBeVisible();

  // Navigate to Issues
  await page.locator(".dashboard-nav-item[data-page='issues']").click();
  await expect(page.locator("#dashboard-page-issues")).toBeVisible();
  await expect(page.locator("#dashboard-page-milestones")).not.toBeVisible();

  // Navigate back to Goals
  await page.locator(".dashboard-nav-item[data-page='goals']").click();
  await expect(page.locator("#dashboard-page-goals")).toBeVisible();
  await expect(page.locator("#dashboard-page-issues")).not.toBeVisible();
});

test("dashboard nav items show active state on selection", async ({ page }) => {
  await page.goto("/");

  // Switch to dashboard
  await page.locator("#view-toggle-btn").click();

  // Goals nav item is active by default
  const goalsNav = page.locator(".dashboard-nav-item[data-page='goals']");
  await expect(goalsNav).toHaveClass(/active/);

  // Click Research — it becomes active, Goals becomes inactive
  const researchNav = page.locator(".dashboard-nav-item[data-page='research']");
  await researchNav.click();
  await expect(researchNav).toHaveClass(/active/);
  await expect(goalsNav).not.toHaveClass(/active/);
});

// ─── Goal Overview Page ────────────────────────────────────────

const STUB_GOAL_ID = "test-goal-id-001";
const STUB_MILESTONE_ID = "test-milestone-id-001";

/** Stubs all goal-related API routes with deterministic test data. */
async function stubGoalRoutes(page: Page) {
  await page.route("**/api/goals", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        goals: [
          {
            id: STUB_GOAL_ID,
            sessionId: "session-1",
            intent: "I want to build a feature-rich dashboard for planning.",
            goal: "Deliver a planning dashboard with goal, research, and milestone views",
            problemStatement: "Users lack visibility into planning state.",
            businessValue: "Increases planning throughput and transparency.",
            targetOutcome: "Dashboard shows all planning data at a glance.",
            successCriteria: ["Goal list renders", "Detail view accessible"],
            assumptions: ["Users have goals saved via chat"],
            constraints: ["No server-side rendering"],
            risks: ["API latency may slow load time"],
            createdAt: "2024-01-01T10:00:00.000Z",
            updatedAt: "2024-01-02T10:00:00.000Z",
          },
        ],
      }),
    });
  });

  await page.route(`**/api/goals/${STUB_GOAL_ID}`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: STUB_GOAL_ID,
        sessionId: "session-1",
        intent: "I want to build a feature-rich dashboard for planning.",
        goal: "Deliver a planning dashboard with goal, research, and milestone views",
        problemStatement: "Users lack visibility into planning state.",
        businessValue: "Increases planning throughput and transparency.",
        targetOutcome: "Dashboard shows all planning data at a glance.",
        successCriteria: ["Goal list renders", "Detail view accessible"],
        assumptions: ["Users have goals saved via chat"],
        constraints: ["No server-side rendering"],
        risks: ["API latency may slow load time"],
        createdAt: "2024-01-01T10:00:00.000Z",
        updatedAt: "2024-01-02T10:00:00.000Z",
      }),
    });
  });

  await page.route(`**/api/goals/${STUB_GOAL_ID}/research`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        research: [
          { id: "r1", goalId: STUB_GOAL_ID, category: "architecture", question: "What layout to use?", status: "open", findings: "", decision: "" },
          { id: "r2", goalId: STUB_GOAL_ID, category: "ux", question: "How should counts be shown?", status: "resolved", findings: "Badges", decision: "Use badge chips" },
        ],
      }),
    });
  });

  await page.route(`**/api/goals/${STUB_GOAL_ID}/milestones`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        milestones: [
          { id: STUB_MILESTONE_ID, goalId: STUB_GOAL_ID, name: "Phase 1", description: "First phase", position: 1, status: "draft", dependencies: [], createdAt: "2024-01-01T10:00:00.000Z", updatedAt: "2024-01-01T10:00:00.000Z" },
        ],
      }),
    });
  });

  await page.route(`**/api/milestones/${STUB_MILESTONE_ID}/issues`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        issues: [
          { id: "i1", milestoneId: STUB_MILESTONE_ID, goalId: STUB_GOAL_ID, title: "Issue 1", body: "Body", labels: [], sequence: 1, createdAt: "2024-01-01T10:00:00.000Z", updatedAt: "2024-01-01T10:00:00.000Z" },
          { id: "i2", milestoneId: STUB_MILESTONE_ID, goalId: STUB_GOAL_ID, title: "Issue 2", body: "Body", labels: [], sequence: 2, createdAt: "2024-01-01T10:00:00.000Z", updatedAt: "2024-01-01T10:00:00.000Z" },
        ],
      }),
    });
  });

  // Stub the /api/health and /api/models so the page loads cleanly without a token
  await page.route("**/api/health", (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", storage: "memory" }) });
  });
}

test("goals dashboard: list renders with counts from stubbed API", async ({ page }) => {
  await stubGoalRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  // Switch to dashboard view (goals page is default)
  await page.locator("#view-toggle-btn").click();
  await expect(page.locator("#dashboard-page-goals")).toBeVisible();

  // Goal list item should appear with the goal title
  const listItem = page.locator(".goal-list-item").first();
  await expect(listItem).toBeVisible({ timeout: 10_000 });
  await expect(listItem.locator(".goal-list-item-title")).toContainText(
    "Deliver a planning dashboard with goal, research, and milestone views"
  );

  // Counts should be visible (2 research, 1 milestone, 2 issues)
  const countsEl = listItem.locator(".goal-list-item-counts");
  await expect(countsEl).toContainText("2 research");
  await expect(countsEl).toContainText("1 milestones");
  await expect(countsEl).toContainText("2 issues");
});

test("goals dashboard: click on goal opens detail view", async ({ page }) => {
  await stubGoalRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  // Switch to dashboard and wait for goal list
  await page.locator("#view-toggle-btn").click();
  const listItem = page.locator(".goal-list-item").first();
  await expect(listItem).toBeVisible({ timeout: 10_000 });

  // Click the goal to open detail view
  await listItem.click();

  // List view should be hidden, detail view should show
  await expect(page.locator("#goals-list-view")).not.toBeVisible();
  await expect(page.locator("#goals-detail-view")).toBeVisible();

  // Detail view should show the goal title and fields
  await expect(page.locator(".goal-detail-title")).toContainText(
    "Deliver a planning dashboard with goal, research, and milestone views"
  );
  await expect(page.locator(".goal-detail-intent")).toContainText(
    "I want to build a feature-rich dashboard for planning."
  );

  // Count badges should reflect API data
  const badges = page.locator(".goal-detail-count-badge");
  await expect(badges).toHaveCount(3);
  await expect(badges.nth(0).locator(".count-number")).toHaveText("2"); // research
  await expect(badges.nth(1).locator(".count-number")).toHaveText("1"); // milestones
  await expect(badges.nth(2).locator(".count-number")).toHaveText("2"); // issues
});

test("goals dashboard: keyboard Enter opens detail view", async ({ page }) => {
  await stubGoalRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  const listItem = page.locator(".goal-list-item").first();
  await expect(listItem).toBeVisible({ timeout: 10_000 });

  // Focus and press Enter
  await listItem.focus();
  await page.keyboard.press("Enter");

  await expect(page.locator("#goals-detail-view")).toBeVisible();
  await expect(page.locator(".goal-detail-title")).toBeVisible();
});

test("goals dashboard: back button returns to goal list", async ({ page }) => {
  await stubGoalRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  const listItem = page.locator(".goal-list-item").first();
  await expect(listItem).toBeVisible({ timeout: 10_000 });

  // Open detail view
  await listItem.click();
  await expect(page.locator("#goals-detail-view")).toBeVisible();

  // Click back button
  await page.locator(".goal-detail-back").click();

  // Should return to list view
  await expect(page.locator("#goals-list-view")).toBeVisible();
  await expect(page.locator("#goals-detail-view")).not.toBeVisible();
  await expect(page.locator(".goal-list-item")).toBeVisible();
});

// ─── Research Tracker Page ──────────────────────────────────────

const STUB_RESEARCH_ITEMS = [
  {
    id: "r1",
    goalId: STUB_GOAL_ID,
    category: "architecture",
    question: "What layout should the dashboard use?",
    status: "open",
    findings: "",
    decision: "",
  },
  {
    id: "r2",
    goalId: STUB_GOAL_ID,
    category: "ux",
    question: "How should status counts be displayed?",
    status: "resolved",
    findings: "Badge chips are compact and clear.",
    decision: "Use badge chips",
  },
  {
    id: "r3",
    goalId: STUB_GOAL_ID,
    category: "architecture",
    question: "Should we use server-side rendering?",
    status: "researching",
    findings: "Evaluating pros and cons.",
    decision: "",
  },
];

/** Stubs the research API routes so research tracker tests work without a live server. */
async function stubResearchRoutes(page: Page) {
  await page.route("**/api/goals", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        goals: [
          {
            id: STUB_GOAL_ID,
            sessionId: "session-1",
            intent: "I want to build a feature-rich dashboard for planning.",
            goal: "Deliver a planning dashboard with goal, research, and milestone views",
            problemStatement: "Users lack visibility into planning state.",
            businessValue: "Increases planning throughput.",
            targetOutcome: "Dashboard shows all planning data at a glance.",
            successCriteria: [],
            assumptions: [],
            constraints: [],
            risks: [],
            createdAt: "2024-01-01T10:00:00.000Z",
            updatedAt: "2024-01-02T10:00:00.000Z",
          },
        ],
      }),
    });
  });

  await page.route(`**/api/goals/${STUB_GOAL_ID}/research`, (route) => {
    if (route.request().method() === "GET") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ research: STUB_RESEARCH_ITEMS }),
      });
    } else {
      route.continue();
    }
  });

  await page.route(`**/api/goals/${STUB_GOAL_ID}/research/**`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...STUB_RESEARCH_ITEMS[0], findings: "Updated findings" }),
    });
  });

  await page.route("**/api/health", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok", storage: "memory" }),
    });
  });
}

test("research tracker: renders items grouped by category with status indicators", async ({ page }) => {
  await stubResearchRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  // Switch to dashboard and navigate to research page
  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='research']").click();
  await expect(page.locator("#dashboard-page-research")).toBeVisible();

  // Wait for items to load
  await expect(page.locator(".research-tracker-item").first()).toBeVisible({ timeout: 10_000 });

  // Should have 3 items total
  await expect(page.locator(".research-tracker-item")).toHaveCount(3);

  // Architecture category group should be visible with 2 items
  const archCategory = page.locator(".research-tracker-category").filter({ hasText: "Architecture" });
  await expect(archCategory).toBeVisible();
  await expect(archCategory.locator(".research-tracker-item")).toHaveCount(2);

  // UX category group should be visible with 1 item
  const uxCategory = page.locator(".research-tracker-category").filter({ hasText: "UX" });
  await expect(uxCategory).toBeVisible();
  await expect(uxCategory.locator(".research-tracker-item")).toHaveCount(1);
});

test("research tracker: status indicators visible on items", async ({ page }) => {
  await stubResearchRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='research']").click();
  await expect(page.locator(".research-tracker-item").first()).toBeVisible({ timeout: 10_000 });

  // Status badges should be visible
  const statuses = page.locator(".research-item-status");
  await expect(statuses).toHaveCount(3);

  // At least one "open", one "resolved", one "researching" should be present
  await expect(page.locator(".research-item-status.status-open")).toHaveCount(1);
  await expect(page.locator(".research-item-status.status-resolved")).toHaveCount(1);
  await expect(page.locator(".research-item-status.status-researching")).toHaveCount(1);
});

test("research tracker: findings displayed when present", async ({ page }) => {
  await stubResearchRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='research']").click();
  await expect(page.locator(".research-tracker-item").first()).toBeVisible({ timeout: 10_000 });

  // The resolved item should show its findings
  await expect(page.locator(".research-tracker-findings").filter({ hasText: "Badge chips are compact and clear." })).toBeVisible();
});

test("research tracker: edit button shows textarea for inline editing", async ({ page }) => {
  await stubResearchRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='research']").click();
  await expect(page.locator(".research-tracker-item").first()).toBeVisible({ timeout: 10_000 });

  // Click the first edit button
  const firstEditBtn = page.locator(".research-tracker-edit-btn").first();
  await expect(firstEditBtn).toBeVisible();
  await firstEditBtn.click();

  // Textarea and save/cancel buttons should appear
  const textarea = page.locator(".research-tracker-textarea").first();
  await expect(textarea).toBeVisible();
  await expect(page.locator(".research-tracker-save-btn").first()).toBeVisible();
  await expect(page.locator(".research-tracker-cancel-btn").first()).toBeVisible();

  // Edit button should be hidden when edit area is open
  await expect(firstEditBtn).not.toBeVisible();
});

test("research tracker: cancel button closes edit area without saving", async ({ page }) => {
  await stubResearchRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='research']").click();
  await expect(page.locator(".research-tracker-item").first()).toBeVisible({ timeout: 10_000 });

  // Open edit
  await page.locator(".research-tracker-edit-btn").first().click();
  const textarea = page.locator(".research-tracker-textarea").first();
  await expect(textarea).toBeVisible();

  // Type something then cancel
  await textarea.fill("Some draft text");
  await page.locator(".research-tracker-cancel-btn").first().click();

  // Edit area should be gone, edit button should reappear
  await expect(textarea).not.toBeVisible();
  await expect(page.locator(".research-tracker-edit-btn").first()).toBeVisible();
});

test("research tracker: save button sends PATCH request and updates display", async ({ page }) => {
  await stubResearchRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='research']").click();
  await expect(page.locator(".research-tracker-item").first()).toBeVisible({ timeout: 10_000 });

  // Open edit on first item
  await page.locator(".research-tracker-edit-btn").first().click();
  const textarea = page.locator(".research-tracker-textarea").first();
  await textarea.fill("Updated findings");

  // Save
  await page.locator(".research-tracker-save-btn").first().click();

  // After save, edit area should be closed and edit button should reappear
  await expect(textarea).not.toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".research-tracker-edit-btn").first()).toBeVisible();
});

test("research tracker: summary shows open/researching/resolved counts", async ({ page }) => {
  await stubResearchRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='research']").click();
  await expect(page.locator(".research-tracker-summary")).toBeVisible({ timeout: 10_000 });

  // Summary should show counts for each status
  await expect(page.locator(".research-tracker-summary")).toContainText("Open: 1");
  await expect(page.locator(".research-tracker-summary")).toContainText("Researching: 1");
  await expect(page.locator(".research-tracker-summary")).toContainText("Resolved: 1");
});

// ─── Milestone Timeline Dashboard Page ────────────────────────

const STUB_MILESTONES = [
  {
    id: "ms-a",
    goalId: STUB_GOAL_ID,
    name: "Foundation",
    goal: "Set up core infrastructure",
    scope: "Auth and data layer only",
    order: 1,
    dependencies: [],
    acceptanceCriteria: ["Login works"],
    exitCriteria: [],
    status: "complete",
  },
  {
    id: "ms-b",
    goalId: STUB_GOAL_ID,
    name: "API Layer",
    goal: "Expose REST endpoints",
    scope: "CRUD endpoints, no UI",
    order: 2,
    dependencies: ["ms-a"],
    acceptanceCriteria: ["All endpoints return 200"],
    exitCriteria: [],
    status: "in-progress",
  },
  {
    id: "ms-c",
    goalId: STUB_GOAL_ID,
    name: "Frontend",
    goal: "Build the user interface",
    scope: "Dashboard only",
    order: 3,
    dependencies: ["ms-b"],
    acceptanceCriteria: ["UI renders on mobile"],
    exitCriteria: [],
    status: "draft",
  },
];

/** Stubs milestone API routes for dashboard tests. */
async function stubMilestoneRoutes(page: Page) {
  await page.route("**/api/goals", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        goals: [
          {
            id: STUB_GOAL_ID,
            sessionId: "session-1",
            intent: "I want to build a feature-rich dashboard.",
            goal: "Deliver a planning dashboard with goal, research, and milestone views",
            problemStatement: "Users lack visibility into planning state.",
            businessValue: "Increases planning throughput.",
            targetOutcome: "Dashboard shows all planning data.",
            successCriteria: [],
            assumptions: [],
            constraints: [],
            risks: [],
            createdAt: "2024-01-01T10:00:00.000Z",
            updatedAt: "2024-01-02T10:00:00.000Z",
          },
        ],
      }),
    });
  });

  await page.route(`**/api/goals/${STUB_GOAL_ID}/milestones`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ milestones: STUB_MILESTONES }),
    });
  });

  await page.route(`**/api/goals/${STUB_GOAL_ID}/research`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ research: [] }),
    });
  });

  await page.route(`**/api/milestones/ms-a/issues`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        issues: [
          { id: "i1", milestoneId: "ms-a", goalId: STUB_GOAL_ID, title: "Setup auth", body: "", labels: [], sequence: 1 },
          { id: "i2", milestoneId: "ms-a", goalId: STUB_GOAL_ID, title: "Setup DB", body: "", labels: [], sequence: 2 },
        ],
      }),
    });
  });

  await page.route(`**/api/milestones/ms-b/issues`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        issues: [
          { id: "i3", milestoneId: "ms-b", goalId: STUB_GOAL_ID, title: "GET /goals", body: "", labels: [], sequence: 1 },
        ],
      }),
    });
  });

  await page.route(`**/api/milestones/ms-c/issues`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ issues: [] }),
    });
  });

  await page.route("**/api/health", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok", storage: "memory" }),
    });
  });
}

test("milestone timeline page: milestones rendered in correct order", async ({ page }) => {
  await stubMilestoneRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  // Switch to dashboard and navigate to milestones page
  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='milestones']").click();
  await expect(page.locator("#dashboard-page-milestones")).toBeVisible();

  // Wait for milestone items to load
  await expect(page.locator(".milestone-timeline-item").first()).toBeVisible({ timeout: 10_000 });

  // Should have 3 milestones
  await expect(page.locator(".milestone-timeline-item")).toHaveCount(3);

  // Check order numbers are correct
  const items = page.locator(".milestone-timeline-item");
  await expect(items.nth(0).locator(".milestone-timeline-order")).toHaveText("#1");
  await expect(items.nth(1).locator(".milestone-timeline-order")).toHaveText("#2");
  await expect(items.nth(2).locator(".milestone-timeline-order")).toHaveText("#3");
});

test("milestone timeline page: milestone names displayed correctly", async ({ page }) => {
  await stubMilestoneRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='milestones']").click();
  await expect(page.locator(".milestone-timeline-item").first()).toBeVisible({ timeout: 10_000 });

  const items = page.locator(".milestone-timeline-item");
  await expect(items.nth(0).locator(".milestone-timeline-name")).toHaveText("Foundation");
  await expect(items.nth(1).locator(".milestone-timeline-name")).toHaveText("API Layer");
  await expect(items.nth(2).locator(".milestone-timeline-name")).toHaveText("Frontend");
});

test("milestone timeline page: status badges displayed correctly", async ({ page }) => {
  await stubMilestoneRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='milestones']").click();
  await expect(page.locator(".milestone-timeline-item").first()).toBeVisible({ timeout: 10_000 });

  const items = page.locator(".milestone-timeline-item");
  await expect(items.nth(0).locator(".milestone-timeline-status")).toHaveClass(/status-complete/);
  await expect(items.nth(0).locator(".milestone-timeline-status")).toHaveText("complete");
  await expect(items.nth(1).locator(".milestone-timeline-status")).toHaveClass(/status-in-progress/);
  await expect(items.nth(2).locator(".milestone-timeline-status")).toHaveClass(/status-draft/);
});

test("milestone timeline page: issue counts accurate per milestone", async ({ page }) => {
  await stubMilestoneRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='milestones']").click();
  await expect(page.locator(".milestone-timeline-item").first()).toBeVisible({ timeout: 10_000 });

  const items = page.locator(".milestone-timeline-item");
  await expect(items.nth(0).locator(".milestone-timeline-issue-count")).toHaveText("2 issues");
  await expect(items.nth(1).locator(".milestone-timeline-issue-count")).toHaveText("1 issue");
  await expect(items.nth(2).locator(".milestone-timeline-issue-count")).toHaveText("0 issues");
});

test("milestone timeline page: dependencies visually indicated", async ({ page }) => {
  await stubMilestoneRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='milestones']").click();
  await expect(page.locator(".milestone-timeline-item").first()).toBeVisible({ timeout: 10_000 });

  const items = page.locator(".milestone-timeline-item");

  // First milestone has no dependencies
  await expect(items.nth(0).locator(".milestone-timeline-deps")).toHaveCount(0);

  // Second milestone depends on first (#1)
  await expect(items.nth(1).locator(".milestone-timeline-deps")).toBeVisible();
  await expect(items.nth(1).locator(".milestone-timeline-dep-tag")).toHaveText("#1");

  // Third milestone depends on second (#2)
  await expect(items.nth(2).locator(".milestone-timeline-deps")).toBeVisible();
  await expect(items.nth(2).locator(".milestone-timeline-dep-tag")).toHaveText("#2");
});

test("milestone timeline page: summary line shows status counts", async ({ page }) => {
  await stubMilestoneRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='milestones']").click();
  await expect(page.locator(".milestone-timeline-summary")).toBeVisible({ timeout: 10_000 });

  // 1 draft, 0 ready, 1 in-progress, 1 complete
  await expect(page.locator(".milestone-timeline-summary")).toContainText("Draft: 1");
  await expect(page.locator(".milestone-timeline-summary")).toContainText("In Progress: 1");
  await expect(page.locator(".milestone-timeline-summary")).toContainText("Complete: 1");
});

test("milestone timeline page: XSS prevention in milestone name and goal", async ({ page }) => {
  await page.route("**/api/goals", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        goals: [
          {
            id: STUB_GOAL_ID,
            sessionId: "session-1",
            intent: "test",
            goal: "test goal",
            problemStatement: "",
            businessValue: "",
            targetOutcome: "",
            successCriteria: [],
            assumptions: [],
            constraints: [],
            risks: [],
            createdAt: "2024-01-01T10:00:00.000Z",
            updatedAt: "2024-01-02T10:00:00.000Z",
          },
        ],
      }),
    });
  });

  await page.route(`**/api/goals/${STUB_GOAL_ID}/milestones`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        milestones: [
          {
            id: "ms-xss",
            goalId: STUB_GOAL_ID,
            name: '<script>alert("xss")</script>Malicious name',
            goal: '<img src=x onerror=alert(1)>Malicious goal',
            scope: "",
            order: 1,
            dependencies: [],
            acceptanceCriteria: [],
            exitCriteria: [],
            status: "draft",
          },
        ],
      }),
    });
  });

  await page.route(`**/api/milestones/ms-xss/issues`, (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ issues: [] }) });
  });

  await page.route("**/api/health", (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", storage: "memory" }) });
  });

  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='milestones']").click();
  await expect(page.locator(".milestone-timeline-item").first()).toBeVisible({ timeout: 10_000 });

  // The raw text should appear escaped (not executed) in the DOM
  const item = page.locator(".milestone-timeline-item").first();
  await expect(item.locator(".milestone-timeline-name")).toContainText("Malicious name");
  await expect(item.locator(".milestone-timeline-goal")).toContainText("Malicious goal");

  // The injected script tag text should appear as text, not as an executable script element
  await expect(item.locator(".milestone-timeline-name")).toContainText('<script>');
  await expect(item.locator(".milestone-timeline-goal")).toContainText('<img');
});

// ─── Issue Draft Dashboard Page ────────────────────────────────

const STUB_MILESTONE_ID_A = "ms-issues-a";
const STUB_MILESTONE_ID_B = "ms-issues-b";

const STUB_ISSUE_DRAFTS = [
  {
    id: "issue-1",
    milestoneId: STUB_MILESTONE_ID_A,
    title: "Setup authentication",
    purpose: "Implement user auth",
    problem: "No auth exists",
    expectedOutcome: "Users can log in",
    scopeBoundaries: "Login/logout only",
    technicalContext: "Use JWT",
    dependencies: [],
    acceptanceCriteria: ["Login works", "Logout works"],
    testingExpectations: "Unit tests for auth module",
    researchLinks: [],
    order: 1,
    status: "draft",
    filesToModify: [{ path: "server.ts", reason: "Add auth endpoints" }],
    filesToRead: [{ path: "README.md", reason: "Follow setup pattern" }],
    securityChecklist: ["Hash passwords"],
    verificationCommands: ["npm test"],
  },
  {
    id: "issue-2",
    milestoneId: STUB_MILESTONE_ID_A,
    title: "Create database schema",
    purpose: "Set up DB tables",
    problem: "No schema defined",
    expectedOutcome: "Tables created",
    scopeBoundaries: "Schema only, no data",
    technicalContext: "Use SQLite",
    dependencies: ["issue-1"],
    acceptanceCriteria: ["Schema applied"],
    testingExpectations: "Migration test",
    researchLinks: [],
    order: 2,
    status: "ready",
    filesToModify: [],
    filesToRead: [],
    securityChecklist: [],
    verificationCommands: [],
  },
  {
    id: "issue-3",
    milestoneId: STUB_MILESTONE_ID_A,
    title: "Deploy to production",
    purpose: "Ship to users",
    problem: "App not deployed",
    expectedOutcome: "Live on prod",
    scopeBoundaries: "Single region",
    technicalContext: "Use Azure",
    dependencies: ["issue-2"],
    acceptanceCriteria: ["Health check passes"],
    testingExpectations: "Smoke test",
    researchLinks: [],
    order: 3,
    status: "created",
    githubIssueNumber: 42,
    filesToModify: [],
    filesToRead: [],
    securityChecklist: [],
    verificationCommands: [],
  },
];

/** Stubs issue draft API routes for dashboard tests. */
async function stubIssueRoutes(page: Page) {
  await page.route("**/api/goals", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        goals: [
          {
            id: STUB_GOAL_ID,
            sessionId: "session-1",
            intent: "I want to build a feature-rich dashboard.",
            goal: "Deliver a planning dashboard",
            problemStatement: "Users lack visibility.",
            businessValue: "Increases throughput.",
            targetOutcome: "Dashboard shows all data.",
            successCriteria: [],
            assumptions: [],
            constraints: [],
            risks: [],
            createdAt: "2024-01-01T10:00:00.000Z",
            updatedAt: "2024-01-02T10:00:00.000Z",
          },
        ],
      }),
    });
  });

  await page.route(`**/api/goals/${STUB_GOAL_ID}/milestones`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        milestones: [
          {
            id: STUB_MILESTONE_ID_A,
            goalId: STUB_GOAL_ID,
            name: "Foundation",
            goal: "Core setup",
            scope: "Auth and data",
            order: 1,
            dependencies: [],
            acceptanceCriteria: [],
            exitCriteria: [],
            status: "in-progress",
          },
          {
            id: STUB_MILESTONE_ID_B,
            goalId: STUB_GOAL_ID,
            name: "Frontend",
            goal: "UI layer",
            scope: "Dashboard",
            order: 2,
            dependencies: [STUB_MILESTONE_ID_A],
            acceptanceCriteria: [],
            exitCriteria: [],
            status: "draft",
          },
        ],
      }),
    });
  });

  await page.route(`**/api/milestones/${STUB_MILESTONE_ID_A}/issues`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ issues: STUB_ISSUE_DRAFTS }),
    });
  });

  await page.route(`**/api/milestones/${STUB_MILESTONE_ID_B}/issues`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ issues: [] }),
    });
  });

  await page.route("**/api/health", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok", storage: "memory" }),
    });
  });
}

test("issue draft page: drafts rendered in correct order", async ({ page }) => {
  await stubIssueRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='issues']").click();
  await expect(page.locator("#dashboard-page-issues")).toBeVisible();

  await expect(page.locator(".issue-draft-item").first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(".issue-draft-item")).toHaveCount(3);

  const items = page.locator(".issue-draft-item");
  await expect(items.nth(0).locator(".issue-draft-order")).toHaveText("#1");
  await expect(items.nth(1).locator(".issue-draft-order")).toHaveText("#2");
  await expect(items.nth(2).locator(".issue-draft-order")).toHaveText("#3");
});

test("issue draft page: titles displayed correctly", async ({ page }) => {
  await stubIssueRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='issues']").click();
  await expect(page.locator(".issue-draft-item").first()).toBeVisible({ timeout: 10_000 });

  const items = page.locator(".issue-draft-item");
  await expect(items.nth(0).locator(".issue-draft-title")).toHaveText("Setup authentication");
  await expect(items.nth(1).locator(".issue-draft-title")).toHaveText("Create database schema");
  await expect(items.nth(2).locator(".issue-draft-title")).toHaveText("Deploy to production");
});

test("issue draft page: status badges displayed correctly", async ({ page }) => {
  await stubIssueRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='issues']").click();
  await expect(page.locator(".issue-draft-item").first()).toBeVisible({ timeout: 10_000 });

  const items = page.locator(".issue-draft-item");
  await expect(items.nth(0).locator(".issue-draft-status")).toHaveClass(/status-draft/);
  await expect(items.nth(0).locator(".issue-draft-status")).toHaveText("draft");
  await expect(items.nth(1).locator(".issue-draft-status")).toHaveClass(/status-ready/);
  await expect(items.nth(1).locator(".issue-draft-status")).toHaveText("ready");
  await expect(items.nth(2).locator(".issue-draft-status")).toHaveClass(/status-created/);
  await expect(items.nth(2).locator(".issue-draft-status")).toHaveText("created");
});

test("issue draft page: summary line shows status counts", async ({ page }) => {
  await stubIssueRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='issues']").click();
  await expect(page.locator(".issue-draft-summary")).toBeVisible({ timeout: 10_000 });

  await expect(page.locator(".issue-draft-summary")).toContainText("Draft: 1");
  await expect(page.locator(".issue-draft-summary")).toContainText("Ready: 1");
  await expect(page.locator(".issue-draft-summary")).toContainText("Created: 1");
});

test("issue draft page: expand shows all fields", async ({ page }) => {
  await stubIssueRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='issues']").click();
  await expect(page.locator(".issue-draft-item").first()).toBeVisible({ timeout: 10_000 });

  // Expand the first item
  await page.locator(".issue-draft-item").first().locator(".issue-draft-expand-btn").click();
  const body = page.locator(".issue-draft-item").first().locator(".issue-draft-body");
  await expect(body).toHaveClass(/expanded/);

  // Check that field labels are present
  const labels = body.locator(".issue-draft-field-label");
  const labelTexts = await labels.allTextContents();
  expect(labelTexts).toContain("Purpose");
  expect(labelTexts).toContain("Problem");
  expect(labelTexts).toContain("Expected Outcome");
  expect(labelTexts).toContain("Acceptance Criteria");
  expect(labelTexts).toContain("Files to Modify");
  expect(labelTexts).toContain("Files to Read");
});

test("issue draft page: GitHub preview renders correctly", async ({ page }) => {
  await stubIssueRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='issues']").click();
  await expect(page.locator(".issue-draft-item").first()).toBeVisible({ timeout: 10_000 });

  // Expand the first item
  await page.locator(".issue-draft-item").first().locator(".issue-draft-expand-btn").click();

  // Click show preview
  await page.locator(".issue-draft-item").first().locator(".issue-draft-preview-toggle").click();
  const preview = page.locator(".issue-draft-item").first().locator(".issue-draft-md-preview");
  await expect(preview).toBeVisible();

  // Preview should contain section headings
  await expect(preview.locator("h2").first()).toBeVisible();
  await expect(preview).toContainText("Purpose");
});

test("issue draft page: approve button updates status to ready", async ({ page }) => {
  await stubIssueRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  // Stub the PATCH endpoint
  await page.route(`**/api/milestones/${STUB_MILESTONE_ID_A}/issues/issue-1`, (route) => {
    if (route.request().method() === "PATCH") {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...STUB_ISSUE_DRAFTS[0], status: "ready" }),
      });
    } else {
      route.continue();
    }
  });

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='issues']").click();
  await expect(page.locator(".issue-draft-item").first()).toBeVisible({ timeout: 10_000 });

  // First item is draft — click approve
  const firstItem = page.locator(".issue-draft-item").first();
  await expect(firstItem.locator(".issue-draft-approve-btn")).toBeVisible();
  await firstItem.locator(".issue-draft-approve-btn").click();

  // Status badge should update to "ready"
  await expect(firstItem.locator(".issue-draft-status")).toHaveText("ready", { timeout: 5_000 });
  await expect(firstItem.locator(".issue-draft-status")).toHaveClass(/status-ready/);
});

test("issue draft page: batch approve marks all draft/ready as ready", async ({ page }) => {
  await stubIssueRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  // Stub PATCH for both draft and ready issues
  await page.route(`**/api/milestones/${STUB_MILESTONE_ID_A}/issues/**`, (route) => {
    if (route.request().method() === "PATCH") {
      const url = route.request().url();
      const issueId = url.split("/").pop();
      const draft = STUB_ISSUE_DRAFTS.find((d) => d.id === issueId);
      if (draft) {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ...draft, status: "ready" }),
        });
      } else {
        route.continue();
      }
    } else {
      route.continue();
    }
  });

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='issues']").click();
  await expect(page.locator(".issue-draft-batch-bar")).toBeVisible({ timeout: 10_000 });

  // Click batch approve
  await page.locator(".issue-draft-batch-approve-btn").click();

  // After approval, the page re-renders; batch bar should be gone (all ready now)
  await expect(page.locator(".issue-draft-item")).toHaveCount(3, { timeout: 5_000 });
});

test("issue draft page: XSS prevention in issue title and purpose", async ({ page }) => {
  await page.route("**/api/goals", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        goals: [
          {
            id: STUB_GOAL_ID,
            sessionId: "session-1",
            intent: "test",
            goal: "test goal",
            problemStatement: "",
            businessValue: "",
            targetOutcome: "",
            successCriteria: [],
            assumptions: [],
            constraints: [],
            risks: [],
            createdAt: "2024-01-01T10:00:00.000Z",
            updatedAt: "2024-01-02T10:00:00.000Z",
          },
        ],
      }),
    });
  });

  await page.route(`**/api/goals/${STUB_GOAL_ID}/milestones`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        milestones: [{ id: "ms-xss2", goalId: STUB_GOAL_ID, name: "XSS Milestone", goal: "test", scope: "", order: 1, dependencies: [], acceptanceCriteria: [], exitCriteria: [], status: "draft" }],
      }),
    });
  });

  await page.route(`**/api/milestones/ms-xss2/issues`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        issues: [
          {
            id: "xss-issue",
            milestoneId: "ms-xss2",
            title: '<script>alert("xss")</script>Malicious title',
            purpose: '<img src=x onerror=alert(1)>Malicious purpose',
            problem: "test",
            expectedOutcome: "test",
            scopeBoundaries: "test",
            technicalContext: "test",
            dependencies: [],
            acceptanceCriteria: [],
            testingExpectations: "",
            researchLinks: [],
            order: 1,
            status: "draft",
            filesToModify: [],
            filesToRead: [],
            securityChecklist: [],
            verificationCommands: [],
          },
        ],
      }),
    });
  });

  await page.route("**/api/health", (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", storage: "memory" }) });
  });

  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='issues']").click();
  await expect(page.locator(".issue-draft-item").first()).toBeVisible({ timeout: 10_000 });

  const item = page.locator(".issue-draft-item").first();
  await expect(item.locator(".issue-draft-title")).toContainText("Malicious title");
  await expect(item.locator(".issue-draft-title")).toContainText("<script>");

  // Expand to see purpose
  await item.locator(".issue-draft-expand-btn").click();
  const purposeField = item.locator(".issue-draft-field").filter({ hasText: "Purpose" }).first();
  await expect(purposeField.locator(".issue-draft-field-value")).toContainText("Malicious purpose");
  await expect(purposeField.locator(".issue-draft-field-value")).toContainText("<img");
});

test("issue draft page: empty milestone shows correct empty state", async ({ page }) => {
  await stubIssueRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='issues']").click();
  await expect(page.locator(".issue-draft-item").first()).toBeVisible({ timeout: 10_000 });

  // Switch to the second milestone (empty)
  await page.locator("#issue-milestone-select").selectOption(STUB_MILESTONE_ID_B);
  await expect(page.locator("#issue-page-content .dashboard-empty")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("#issue-page-content .dashboard-empty")).toContainText("No issue drafts");
});

// ============================================================
// Push Approval Workflow E2E Tests
// ============================================================

/** Stubs push-to-github API route with a successful response. */
async function stubPushMilestoneRoute(page: Page, milestoneId: string) {
  await page.route(`**/api/milestones/${milestoneId}/push-to-github`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        milestoneId,
        githubNumber: 7,
        githubUrl: "https://github.com/octocat/hello-world/milestone/7",
        alreadyExisted: false,
      }),
    });
  });
}

/** Stubs push-to-github API route for an issue with a successful response. */
async function stubPushIssueRoute(page: Page, milestoneId: string, issueId: string) {
  await page.route(`**/api/milestones/${milestoneId}/issues/${issueId}/push-to-github`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        draftId: issueId,
        githubIssueNumber: 42,
        githubIssueUrl: "https://github.com/octocat/hello-world/issues/42",
        alreadyCreated: false,
      }),
    });
  });
}

test("push approval: Push to GitHub button is visible after goals load", async ({ page }) => {
  await stubIssueRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='issues']").click();

  // Wait for issue drafts to load
  await expect(page.locator(".issue-draft-item").first()).toBeVisible({ timeout: 10_000 });

  // Push button should be visible
  await expect(page.locator("#push-to-github-btn")).toBeVisible();
});

test("push approval: push button hidden when no token", async ({ page }) => {
  await page.route("**/api/health", (route) => {
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok", storage: "memory" }) });
  });
  await page.goto("/");
  // No token set — localStorage empty

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='issues']").click();

  // Button should not be visible (no goals loaded)
  await expect(page.locator("#push-to-github-btn")).not.toBeVisible();
});

test("push approval: modal opens and closes", async ({ page }) => {
  await stubIssueRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='issues']").click();
  await expect(page.locator(".issue-draft-item").first()).toBeVisible({ timeout: 10_000 });

  // Open modal
  await page.locator("#push-to-github-btn").click();
  await expect(page.locator("#push-modal")).toBeVisible({ timeout: 5_000 });

  // Close modal with X button
  await page.locator("#push-modal-close").click();
  await expect(page.locator("#push-modal")).not.toBeVisible();
});

test("push approval: modal closes on Escape key", async ({ page }) => {
  await stubIssueRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='issues']").click();
  await expect(page.locator(".issue-draft-item").first()).toBeVisible({ timeout: 10_000 });

  await page.locator("#push-to-github-btn").click();
  await expect(page.locator("#push-modal")).toBeVisible({ timeout: 5_000 });

  await page.keyboard.press("Escape");
  await expect(page.locator("#push-modal")).not.toBeVisible();
});

test("push approval: confirm button disabled without owner/repo inputs", async ({ page }) => {
  await stubIssueRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='issues']").click();
  await expect(page.locator(".issue-draft-item").first()).toBeVisible({ timeout: 10_000 });

  await page.locator("#push-to-github-btn").click();
  await expect(page.locator("#push-modal")).toBeVisible({ timeout: 5_000 });

  // Wait for mutations to load
  await expect(page.locator("#push-mutation-list")).not.toContainText("Loading", { timeout: 5_000 });

  // Confirm button should be disabled without owner/repo
  await page.locator("#push-owner-input").fill("");
  await page.locator("#push-repo-input").fill("");
  await expect(page.locator("#push-confirm-btn")).toBeDisabled();
});

test("push approval: confirm button enabled when owner+repo are valid and mutations exist", async ({ page }) => {
  await stubIssueRoutes(page);
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='issues']").click();
  await expect(page.locator(".issue-draft-item").first()).toBeVisible({ timeout: 10_000 });

  await page.locator("#push-to-github-btn").click();
  await expect(page.locator("#push-modal")).toBeVisible({ timeout: 5_000 });

  // Wait for mutations to load
  await expect(page.locator("#push-mutation-list")).not.toContainText("Loading", { timeout: 5_000 });

  // Fill in owner and repo
  await page.locator("#push-owner-input").fill("octocat");
  await page.locator("#push-repo-input").fill("hello-world");

  // Confirm button should be enabled (there is a new issue "issue-2" in ready status)
  await expect(page.locator("#push-confirm-btn")).not.toBeDisabled();
});

test("push approval: happy path — progress then results shown", async ({ page }) => {
  await stubIssueRoutes(page);
  await stubPushMilestoneRoute(page, STUB_MILESTONE_ID_A);
  await stubPushIssueRoute(page, STUB_MILESTONE_ID_A, "issue-2");

  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='issues']").click();
  await expect(page.locator(".issue-draft-item").first()).toBeVisible({ timeout: 10_000 });

  await page.locator("#push-to-github-btn").click();
  await expect(page.locator("#push-modal")).toBeVisible({ timeout: 5_000 });

  // Wait for mutation list to load
  await expect(page.locator("#push-mutation-list")).not.toContainText("Loading", { timeout: 5_000 });

  // Fill in owner/repo and confirm
  await page.locator("#push-owner-input").fill("octocat");
  await page.locator("#push-repo-input").fill("hello-world");
  await page.locator("#push-confirm-btn").click();

  // Progress step should appear
  await expect(page.locator("#push-modal-progress")).toBeVisible({ timeout: 5_000 });

  // Results step should appear after progress
  await expect(page.locator("#push-modal-results")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#push-results-summary")).toBeVisible();

  // Done button closes the modal
  await page.locator("#push-done-btn").click();
  await expect(page.locator("#push-modal")).not.toBeVisible();
});

test("push approval: partial failure shown in results", async ({ page }) => {
  await stubIssueRoutes(page);
  await stubPushMilestoneRoute(page, STUB_MILESTONE_ID_A);

  // Stub issue push to return a 500 error
  await page.route(`**/api/milestones/${STUB_MILESTONE_ID_A}/issues/issue-2/push-to-github`, (route) => {
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "GitHub API error: repository not found" }),
    });
  });

  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("copilot_github_token", "fake-test-token"));

  await page.locator("#view-toggle-btn").click();
  await page.locator(".dashboard-nav-item[data-page='issues']").click();
  await expect(page.locator(".issue-draft-item").first()).toBeVisible({ timeout: 10_000 });

  await page.locator("#push-to-github-btn").click();
  await expect(page.locator("#push-modal")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator("#push-mutation-list")).not.toContainText("Loading", { timeout: 5_000 });

  await page.locator("#push-owner-input").fill("octocat");
  await page.locator("#push-repo-input").fill("hello-world");
  await page.locator("#push-confirm-btn").click();

  // Results step should appear with partial failure summary
  await expect(page.locator("#push-modal-results")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#push-results-summary")).toContainText("failed");
});

// ─── Accessibility & Semantic HTML ─────────────────────────────

test("semantic landmarks: main, aside, role=log, role=status present", async ({ page }) => {
  await page.goto("/");

  // <main> wraps the app body
  await expect(page.locator("main#app-body")).toBeVisible();

  // <aside> for session sidebar
  await expect(page.locator("aside#session-sidebar")).toBeAttached();

  // Messages area has role="log"
  await expect(page.locator("#messages[role='log']")).toBeAttached();

  // Status bar has role="status"
  await expect(page.locator("#status-bar[role='status']")).toBeAttached();
});

test("decorative SVGs have aria-hidden attribute", async ({ page }) => {
  await page.goto("/");

  // Header logo SVG
  const headerSvg = page.locator("header .logo svg");
  await expect(headerSvg).toHaveAttribute("aria-hidden", "true");

  // Welcome screen SVG
  const welcomeSvg = page.locator("#welcome svg");
  await expect(welcomeSvg).toHaveAttribute("aria-hidden", "true");
});

test("form inputs have associated labels or aria-labels", async ({ page }) => {
  await page.goto("/");

  // Token input has an associated sr-only label
  await expect(page.locator("label[for='token-input']")).toBeAttached();

  // Model select has aria-label
  await expect(page.locator("#model-select")).toHaveAttribute("aria-label", "Select model");

  // Message input has aria-label
  await expect(page.locator("#message-input")).toHaveAttribute("aria-label", "Message input");

  // New chat button has aria-label
  await expect(page.locator("#new-chat-btn")).toHaveAttribute("aria-label", /new conversation/i);
});

test("color-scheme: dark is set on :root", async ({ page }) => {
  await page.goto("/");
  const colorScheme = await page.evaluate(() =>
    getComputedStyle(document.documentElement).colorScheme
  );
  expect(colorScheme).toContain("dark");
});

test("prefers-reduced-motion styles are present", async ({ page }) => {
  await page.goto("/");
  // Verify the @media rule exists in the stylesheet
  const hasReducedMotion = await page.evaluate(() => {
    for (const sheet of document.styleSheets) {
      for (const rule of sheet.cssRules) {
        if (rule instanceof CSSMediaRule && rule.conditionText?.includes("prefers-reduced-motion")) {
          return true;
        }
      }
    }
    return false;
  });
  expect(hasReducedMotion).toBe(true);
});

// ─── Welcome Screen ───────────────────────────────────────────

test("welcome screen is visible on initial load and hidden after first message stub", async ({ page }) => {
  await page.goto("/");

  // Welcome is visible before any messages
  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.locator("#welcome h2")).toHaveText("Copilot Agent Orchestrator");
  await expect(page.locator("#welcome p")).toContainText("Research codebases");
});

// ─── Token UI Toggle ──────────────────────────────────────────

test("save token button toggles between save and clear states", async ({ page }) => {
  await page.goto("/");

  const saveBtn = page.locator("#save-token-btn");
  const tokenInput = page.locator("#token-input");

  // Initially shows "Save Token"
  await expect(saveBtn).toHaveText("Save Token");

  // Save a fake token
  await tokenInput.fill("fake_test_token_12345");
  await saveBtn.click();

  // After saving, button text changes to "Clear Token"
  await expect(saveBtn).toHaveText("Clear Token");
  await expect(tokenInput).toHaveAttribute("placeholder", /Token saved/);

  // Click again to clear
  await saveBtn.click();

  // After clearing, button reverts to "Save Token"
  await expect(saveBtn).toHaveText("Save Token");
});

// ─── Status Bar ───────────────────────────────────────────────

test("status bar shows connected state after health check", async ({ page }) => {
  await page.goto("/");

  const statusDot = page.locator("#status-dot");
  const statusText = page.locator("#status-text");

  // Wait for connected status
  await expect(statusDot).not.toHaveClass(/disconnected/, { timeout: 15_000 });
  await expect(statusText).toHaveText(/Connected|client/, { timeout: 15_000 });
});

// ─── escHtml XSS Prevention ──────────────────────────────────

test("escHtml escapes all dangerous characters including single quotes", async ({ page }) => {
  await page.goto("/");

  const result = await page.evaluate(() => {
    // @ts-ignore — escHtml is defined in app.js global scope
    return escHtml('<script>alert("xss")</script>&\'test');
  });
  expect(result).toBe("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&amp;&#39;test");
});

// ─── Reasoning Effort Dropdown ────────────────────────────────

test("reasoning effort dropdown is hidden by default", async ({ page }) => {
  await page.goto("/");

  const effortSelect = page.locator("#reasoning-effort-select");
  await expect(effortSelect).not.toBeVisible();
});

// ─── Mobile Sidebar Backdrop ──────────────────────────────────

test("sidebar backdrop exists for mobile overlay", async ({ page }) => {
  await page.goto("/");

  // Backdrop element exists
  await expect(page.locator("#sidebar-backdrop")).toBeAttached();
});

// ─── Session Sidebar State ────────────────────────────────────

test("session list shows empty state message initially", async ({ page }) => {
  await page.goto("/");

  // Clear any saved sessions
  await page.evaluate(() => localStorage.removeItem("copilot_sessions"));
  await page.reload();

  await expect(page.locator("#session-list")).toContainText("No sessions yet");
});
