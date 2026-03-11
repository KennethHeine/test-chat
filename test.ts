import { CopilotClient, approveAll } from "@github/copilot-sdk";
import { execSync, spawn, ChildProcess } from "child_process";
import { config } from "dotenv";
import { InMemoryPlanningStore } from "./planning-store.js";
import { createPlanningTools, PLANNING_TOOL_NAMES } from "./planning-tools.js";
import { createGitHubTools, GITHUB_TOOL_NAMES } from "./tools.js";

config(); // load .env

const PORT = parseInt(process.env.TEST_PORT || "3099", 10);
const BASE = `http://localhost:${PORT}`;
const FREE_MODEL = "gpt-4.1"; // 0x premium requests on paid plans

function buildClientOptions() {
  const token = process.env.COPILOT_GITHUB_TOKEN;
  if (token) return { githubToken: token };
  return { useLoggedInUser: true };
}

let passed = 0;
let failed = 0;

function log(icon: string, msg: string) {
  console.log(`${icon} ${msg}`);
}

// --- Test runner ---

async function run(name: string, fn: () => void | Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    const ms = Date.now() - start;
    log("✓", `${name} (${ms}ms)`);
    passed++;
  } catch (err: any) {
    const ms = Date.now() - start;
    log("✗", `${name} (${ms}ms)\n    ${err.message}`);
    failed++;
  }
}

// ============================================================
// 1. SDK-level integration tests (direct Copilot communication)
// ============================================================

async function testSdkConnect(): Promise<void> {
  const client = new CopilotClient(buildClientOptions());
  try {
    await client.start();
    const state = client.getState();
    if (state !== "connected") throw new Error(`Expected state "connected", got "${state}"`);
    const ping = await client.ping();
    if (!ping.timestamp) throw new Error("Ping response missing timestamp");
  } finally {
    await client.stop();
  }
}

async function testSdkListModels(): Promise<void> {
  const client = new CopilotClient(buildClientOptions());
  try {
    await client.start();
    const models = await client.listModels();
    if (!Array.isArray(models) || models.length === 0) {
      throw new Error("Expected non-empty array of models");
    }
    const modelIds = models.map((m) => m.id ?? m.name ?? String(m));
    if (!modelIds.some((id) => id.includes("gpt"))) {
      throw new Error(`No GPT model found in: ${modelIds.join(", ")}`);
    }
    log("  ", `Found ${models.length} models: ${modelIds.slice(0, 6).join(", ")}${models.length > 6 ? "..." : ""}`);
  } finally {
    await client.stop();
  }
}

async function testSdkChat(): Promise<void> {
  const client = new CopilotClient(buildClientOptions());
  try {
    await client.start();
    const session = await client.createSession({
      model: FREE_MODEL,
      streaming: true,
      onPermissionRequest: approveAll,
    });

    let fullResponse = "";
    let gotIdle = false;

    session.on("assistant.message_delta", (event) => {
      fullResponse += event.data.deltaContent;
    });

    session.on("session.idle", () => {
      gotIdle = true;
    });

    const response = await session.sendAndWait(
      { prompt: "Reply with exactly: COPILOT_TEST_OK" },
      30000
    );

    if (!gotIdle) throw new Error("Never received session.idle event");
    if (!fullResponse) throw new Error("No streaming deltas received");
    if (!fullResponse.includes("COPILOT_TEST_OK")) {
      throw new Error(`Expected response to contain "COPILOT_TEST_OK", got: "${fullResponse.slice(0, 100)}"`);
    }

    log("  ", `Response: "${fullResponse.trim().slice(0, 80)}"`);
  } finally {
    await client.stop();
  }
}

async function testSdkMultiTurn(): Promise<void> {
  const client = new CopilotClient(buildClientOptions());
  try {
    await client.start();
    const session = await client.createSession({
      model: FREE_MODEL,
      streaming: true,
      onPermissionRequest: approveAll,
    });

    // Turn 1: establish a fact
    await session.sendAndWait(
      { prompt: "Remember this code: ALPHA_7749. Just say OK." },
      30000
    );

    // Turn 2: recall it
    let response = "";
    session.on("assistant.message_delta", (event) => {
      response += event.data.deltaContent;
    });

    await session.sendAndWait(
      { prompt: "What was the code I asked you to remember? Reply with just the code." },
      30000
    );

    if (!response.includes("ALPHA_7749")) {
      throw new Error(`Multi-turn recall failed. Got: "${response.slice(0, 100)}"`);
    }
    log("  ", `Recall: "${response.trim().slice(0, 80)}"`);
  } finally {
    await client.stop();
  }
}

// ============================================================
// 2. Server-level integration tests (HTTP API)
// ============================================================

let serverProcess: ChildProcess | null = null;

function testAuthHeaders(): Record<string, string> {
  const token = process.env.COPILOT_GITHUB_TOKEN;
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

async function waitForServer(maxMs = 15000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function testServerHealth(): Promise<void> {
  const res = await fetch(`${BASE}/api/health`);
  const data = await res.json();
  if (data.status !== "ok") throw new Error(`Expected "ok", got "${data.status}"`);
  // Phase 1.6: Verify enhanced health response shape
  if (typeof data.clients !== "object") throw new Error('Health check missing "clients" object');
  if (typeof data.clients.total !== "number") throw new Error('Health check missing "clients.total"');
  if (typeof data.clients.connected !== "number") throw new Error('Health check missing "clients.connected"');
  if (typeof data.activeSessions !== "number") throw new Error('Health check missing "activeSessions"');
}

async function testServerModels(): Promise<void> {
  const res = await fetch(`${BASE}/api/models`, { headers: testAuthHeaders() });
  const data = await res.json();
  if (!data.models || !Array.isArray(data.models) || data.models.length === 0) {
    throw new Error("No models returned from /api/models");
  }
  log("  ", `Server returned ${data.models.length} models`);
}

async function testServerChat(): Promise<void> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify({
      message: "Reply with exactly: SERVER_TEST_OK",
      model: FREE_MODEL,
    }),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const text = await res.text();
  const lines = text.split("\n").filter((l) => l.startsWith("data: "));

  let content = "";
  let sessionId = "";
  let hasDone = false;

  for (const line of lines) {
    const event = JSON.parse(line.slice(6));
    if (event.type === "delta") content += event.content;
    if (event.type === "done") {
      hasDone = true;
      sessionId = event.sessionId;
    }
    if (event.type === "error") throw new Error(`SSE error: ${event.message}`);
  }

  if (!content) throw new Error("No content received from SSE stream");
  if (!hasDone) throw new Error("Missing 'done' event");
  if (!sessionId) throw new Error("Missing sessionId in done event");
  if (!content.includes("SERVER_TEST_OK")) {
    throw new Error(`Expected "SERVER_TEST_OK" in response, got: "${content.slice(0, 100)}"`);
  }
  log("  ", `Server response: "${content.trim().slice(0, 80)}" (session: ${sessionId.slice(0, 8)}...)`);
}

// ============================================================
// 3. Session persistence tests (HTTP API)
// ============================================================

async function testServerHealthStorage(): Promise<void> {
  const res = await fetch(`${BASE}/api/health`);
  const data = await res.json();
  if (!data.storage) throw new Error('Health check missing "storage" field');
  if (data.storage !== "memory" && data.storage !== "azure") {
    throw new Error(`Unexpected storage type: "${data.storage}"`);
  }
  log("  ", `Storage backend: ${data.storage}`);
}

async function testServerSessionsList(): Promise<void> {
  const res = await fetch(`${BASE}/api/sessions`, { headers: testAuthHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.sessions)) throw new Error("Expected sessions array");
  log("  ", `Found ${data.sessions.length} sessions`);
}

async function testServerSessionPersistence(): Promise<void> {
  const TEST_MSG = "PERSIST_TEST_OK";

  // Send a chat to create a session
  const chatRes = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify({
      message: `Reply with exactly: ${TEST_MSG}`,
      model: FREE_MODEL,
    }),
  });

  if (!chatRes.ok) throw new Error(`Chat HTTP ${chatRes.status}`);

  const text = await chatRes.text();
  const lines = text.split("\n").filter((l) => l.startsWith("data: "));
  let sessionId = "";
  for (const line of lines) {
    const event = JSON.parse(line.slice(6));
    if (event.type === "done") sessionId = event.sessionId;
  }

  if (!sessionId) throw new Error("No sessionId from chat");

  // Now save messages via the messages endpoint
  const saveRes = await fetch(`${BASE}/api/sessions/${sessionId}/messages`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify({
      messages: [
        { role: "user", text: TEST_MSG },
        { role: "assistant", text: TEST_MSG },
      ],
    }),
  });

  if (!saveRes.ok) throw new Error(`Save messages HTTP ${saveRes.status}`);
  const saveData = await saveRes.json();
  if (!saveData.saved) throw new Error("Expected saved: true");

  // Verify the session appears in list
  const listRes = await fetch(`${BASE}/api/sessions`, { headers: testAuthHeaders() });
  const listData = await listRes.json();
  const found = listData.sessions.find((s: any) => s.id === sessionId);
  if (!found) throw new Error(`Session ${sessionId} not found in list`);

  // Get messages
  const getRes = await fetch(`${BASE}/api/sessions/${sessionId}/messages`, { headers: testAuthHeaders() });
  if (!getRes.ok) throw new Error(`Get messages HTTP ${getRes.status}`);
  const getData = await getRes.json();
  if (!Array.isArray(getData.messages) || getData.messages.length !== 2) {
    throw new Error(`Expected 2 messages, got ${getData.messages?.length}`);
  }

  // Delete the session
  const delRes = await fetch(`${BASE}/api/sessions/${sessionId}`, {
    method: "DELETE",
    headers: testAuthHeaders(),
  });
  if (!delRes.ok) throw new Error(`Delete HTTP ${delRes.status}`);
  const delData = await delRes.json();
  if (!delData.deleted) throw new Error("Expected deleted: true");

  // Verify it's gone
  const listRes2 = await fetch(`${BASE}/api/sessions`, { headers: testAuthHeaders() });
  const listData2 = await listRes2.json();
  const foundAfter = listData2.sessions.find((s: any) => s.id === sessionId);
  if (foundAfter) throw new Error("Session should be gone after delete");

  log("  ", `Session lifecycle: create → save messages → list → get messages → delete → verify gone ✓`);
}

async function testServerSessionDeleteNotFound(): Promise<void> {
  const res = await fetch(`${BASE}/api/sessions/nonexistent-id-12345`, {
    method: "DELETE",
    headers: testAuthHeaders(),
  });
  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
}

// ============================================================
// 4. Phase 2 feature tests (model switching, quota)
// ============================================================

async function testServerHealthEnhanced(): Promise<void> {
  const res = await fetch(`${BASE}/api/health`);
  const data = await res.json();
  if (data.status !== "ok") throw new Error(`Expected "ok", got "${data.status}"`);
  if (!data.storage) throw new Error('Health check missing "storage" field');
  if (typeof data.clients !== "object") throw new Error('Health check missing "clients" object');
  if (typeof data.activeSessions !== "number") throw new Error('Health check missing "activeSessions"');
  log("  ", `Health: ${data.clients.connected}/${data.clients.total} clients, ${data.activeSessions} sessions, storage: ${data.storage}`);
}

async function testServerModelSwitchNotFound(): Promise<void> {
  const res = await fetch(`${BASE}/api/chat/model`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify({ sessionId: "nonexistent-id", model: "gpt-4o" }),
  });
  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
}

async function testServerModelSwitchMissingFields(): Promise<void> {
  // Missing sessionId
  let res = await fetch(`${BASE}/api/chat/model`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify({ model: "gpt-4o" }),
  });
  if (res.status !== 400) throw new Error(`Expected 400 for missing sessionId, got ${res.status}`);

  // Missing model
  res = await fetch(`${BASE}/api/chat/model`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify({ sessionId: "some-id" }),
  });
  if (res.status !== 400) throw new Error(`Expected 400 for missing model, got ${res.status}`);
}

async function testServerQuotaEndpoint(): Promise<void> {
  const res = await fetch(`${BASE}/api/quota`, { headers: testAuthHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.quota) throw new Error("Quota response missing 'quota' field");
  log("  ", `Quota response: ${JSON.stringify(data.quota).slice(0, 100)}`);
}

async function testServerQuotaNoAuth(): Promise<void> {
  const res = await fetch(`${BASE}/api/quota`);
  // Should fail without auth — either 401 (if no env token) or succeed (if env token is fallback)
  // The important thing is it doesn't crash
  if (res.status !== 401 && res.status !== 200) {
    throw new Error(`Expected 401 or 200, got ${res.status}`);
  }
}

// ============================================================
// 5. Goal API tests
// ============================================================

async function testGoalsListNoAuth(): Promise<void> {
  const res = await fetch(`${BASE}/api/goals`);
  // extractToken() falls back to process.env.COPILOT_GITHUB_TOKEN when no Authorization header
  // is present, so in CI/local runs with the env var set the server returns 200 instead of 401.
  if (res.status !== 401 && res.status !== 200) {
    throw new Error(`Expected 401 or 200 (env-token fallback), got ${res.status}`);
  }
  if (res.status === 401) log("  ", "Confirmed 401 without auth header (no env fallback active)");
  else log("  ", "200 returned — env-token fallback is active; Bearer-only enforcement not testable here");
}

async function testGoalsListEmpty(): Promise<void> {
  const res = await fetch(`${BASE}/api/goals`, { headers: testAuthHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.goals)) throw new Error("Expected goals array in response");
  if (data.goals.length !== 0) throw new Error(`Expected empty goals array, got ${data.goals.length}`);
  log("  ", "Goals list is empty on fresh server");
}

async function testGoalGetNotFound(): Promise<void> {
  const res = await fetch(`${BASE}/api/goals/nonexistent-goal-id-99999`, {
    headers: testAuthHeaders(),
  });
  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  const data = await res.json();
  if (!data.error) throw new Error("Expected error message in 404 response");
}

async function testGoalGetNoAuth(): Promise<void> {
  const res = await fetch(`${BASE}/api/goals/some-goal-id`);
  // Same env-token fallback caveat as testGoalsListNoAuth
  if (res.status !== 401 && res.status !== 404 && res.status !== 200) {
    throw new Error(`Expected 401, 404, or 200 (env-token fallback), got ${res.status}`);
  }
}

async function testGoalSeedAndRetrieve(): Promise<void> {
  // This test uses the test-only seed endpoint (only active when ENABLE_GOAL_SEED=true).
  // First, we need a session so that the ownership check in GET /api/goals/:id passes.
  // Create a session by saving messages for a deterministic test session ID.
  const sessionId = `test-goal-session-${Date.now()}`;
  const saveRes = await fetch(`${BASE}/api/sessions/${sessionId}/messages`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify({ messages: [{ role: "user", text: "goal test seed" }] }),
  });
  if (!saveRes.ok) throw new Error(`Failed to seed session: HTTP ${saveRes.status}`);

  // Seed a goal into the planning store via the test endpoint
  const goalId = `test-goal-${Date.now()}`;
  const seedGoal = {
    id: goalId,
    sessionId,
    intent: "Build a test feature",
    goal: "Create a minimal test feature",
    problemStatement: "No test coverage for goal endpoints",
    businessValue: "Reliable API",
    targetOutcome: "Tests pass",
    successCriteria: ["Tests pass"],
    assumptions: [],
    constraints: [],
    risks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const seedRes = await fetch(`${BASE}/api/test/seed-goal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify(seedGoal),
  });
  if (!seedRes.ok) throw new Error(`Failed to seed goal: HTTP ${seedRes.status}`);

  // Verify GET /api/goals returns the seeded goal
  const listRes = await fetch(`${BASE}/api/goals`, { headers: testAuthHeaders() });
  if (!listRes.ok) throw new Error(`GET /api/goals HTTP ${listRes.status}`);
  const listData = await listRes.json();
  if (!Array.isArray(listData.goals)) throw new Error("Expected goals array");
  const found = listData.goals.find((g: any) => g.id === goalId);
  if (!found) throw new Error(`Goal ${goalId} not found in list response`);

  // Verify GET /api/goals/:id returns the correct payload
  const getRes = await fetch(`${BASE}/api/goals/${goalId}`, { headers: testAuthHeaders() });
  if (!getRes.ok) throw new Error(`GET /api/goals/:id HTTP ${getRes.status}`);
  const getGoal = await getRes.json();
  if (getGoal.id !== goalId) throw new Error(`Expected goal id ${goalId}, got ${getGoal.id}`);
  if (getGoal.intent !== seedGoal.intent) throw new Error("Goal intent mismatch");

  log("  ", `Goal seed → list → get round-trip passed (id: ${goalId.slice(0, 16)}...)`);
}

// ============================================================
// 6. Planning tools tests (direct handler invocation)
// ============================================================

/** Stub ToolInvocation required by the SDK ToolHandler signature. The fields are unused by our handlers. */
const STUB_INVOCATION = {
  sessionId: "test-session",
  toolCallId: "test-call-id",
  toolName: "test-tool",
  arguments: {},
};

function makeValidSaveGoalArgs(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sessionId: "test-session-abc",
    intent: "Build a task planning feature for the chat app",
    goal: "Enable structured goal definition in the chat UI",
    problemStatement: "Users have no way to define structured goals through chat",
    businessValue: "Helps users plan projects systematically",
    targetOutcome: "Users can save and retrieve structured goals via chat",
    successCriteria: ["Goal can be saved", "Goal can be retrieved by ID"],
    assumptions: ["Users have a valid session"],
    constraints: ["Must not break existing chat flow"],
    risks: ["In-memory store resets on restart"],
    ...overrides,
  };
}

async function testPlanningToolRegistration(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const tools = createPlanningTools("test-token", store);
  if (tools.length !== PLANNING_TOOL_NAMES.length) {
    throw new Error(`Expected ${PLANNING_TOOL_NAMES.length} planning tools, got ${tools.length}`);
  }
  const names = tools.map((t) => t.name);
  for (const name of PLANNING_TOOL_NAMES) {
    if (!names.includes(name)) throw new Error(`Missing tool: ${name}`);
  }
}

async function testDefineGoalReturnsTemplate(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const tools = createPlanningTools("test-token", store);
  const defineGoal = tools.find((t) => t.name === "define_goal")!;
  const result: any = await defineGoal.handler({ intent: "I want to build a project planning tool" }, STUB_INVOCATION);
  if (!result.template) throw new Error("Expected template in result");
  if (result.template.intent !== "I want to build a project planning tool") {
    throw new Error("Template intent does not match input");
  }
  if (!result.instructions) throw new Error("Expected instructions in result");
}

async function testDefineGoalEmptyIntentReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const tools = createPlanningTools("test-token", store);
  const defineGoal = tools.find((t) => t.name === "define_goal")!;
  const result: any = await defineGoal.handler({ intent: "" }, STUB_INVOCATION);
  if (!result.error) throw new Error("Expected error for empty intent");
}

async function testSaveGoalValidDataReturnsGoalWithId(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const tools = createPlanningTools("test-token", store);
  const saveGoal = tools.find((t) => t.name === "save_goal")!;
  const result: any = await saveGoal.handler(makeValidSaveGoalArgs(), STUB_INVOCATION);
  if (!result.goal) throw new Error("Expected goal in result");
  if (!result.goal.id) throw new Error("Expected generated id on saved goal");
  if (!result.goal.createdAt) throw new Error("Expected createdAt on saved goal");
  if (!result.goal.updatedAt) throw new Error("Expected updatedAt on saved goal");
  if (result.goal.sessionId !== "test-session-abc") throw new Error("sessionId mismatch");
}

async function testSaveGoalMissingRequiredFieldReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const tools = createPlanningTools("test-token", store);
  const saveGoal = tools.find((t) => t.name === "save_goal")!;

  // Missing goal field
  const result: any = await saveGoal.handler(makeValidSaveGoalArgs({ goal: "" }), STUB_INVOCATION);
  if (!result.error) throw new Error("Expected validation error for empty goal field");

  // Missing problemStatement
  const result2: any = await saveGoal.handler(makeValidSaveGoalArgs({ problemStatement: "   " }), STUB_INVOCATION);
  if (!result2.error) throw new Error("Expected validation error for whitespace-only problemStatement");
}

async function testSaveGoalArrayFieldNotArrayReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const tools = createPlanningTools("test-token", store);
  const saveGoal = tools.find((t) => t.name === "save_goal")!;
  const result: any = await saveGoal.handler(makeValidSaveGoalArgs({ successCriteria: "not an array" }), STUB_INVOCATION);
  if (!result.error) throw new Error("Expected error for non-array successCriteria");

  // Array element is a non-string
  const result2: any = await saveGoal.handler(makeValidSaveGoalArgs({ assumptions: [42] }), STUB_INVOCATION);
  if (!result2.error) throw new Error("Expected error for non-string array element in assumptions");

  // Array element is an empty string
  const result3: any = await saveGoal.handler(makeValidSaveGoalArgs({ risks: [""] }), STUB_INVOCATION);
  if (!result3.error) throw new Error("Expected error for empty-string element in risks");
}

async function testGetGoalExistingIdReturnsGoal(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const tools = createPlanningTools("test-token", store);
  const saveGoal = tools.find((t) => t.name === "save_goal")!;
  const getGoal = tools.find((t) => t.name === "get_goal")!;

  const saved: any = await saveGoal.handler(makeValidSaveGoalArgs(), STUB_INVOCATION);
  const goalId = saved.goal.id;
  const sessionId = saved.goal.sessionId;

  const result: any = await getGoal.handler({ goalId, sessionId }, STUB_INVOCATION);
  if (!result.goal) throw new Error("Expected goal in get_goal result");
  if (result.goal.id !== goalId) throw new Error("Retrieved goal ID does not match saved ID");
  if (result.goal.intent !== makeValidSaveGoalArgs().intent) throw new Error("Retrieved goal intent mismatch");
}

async function testGetGoalWrongSessionIdReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const tools = createPlanningTools("test-token", store);
  const saveGoal = tools.find((t) => t.name === "save_goal")!;
  const getGoal = tools.find((t) => t.name === "get_goal")!;

  const saved: any = await saveGoal.handler(makeValidSaveGoalArgs(), STUB_INVOCATION);
  const goalId = saved.goal.id;

  // Different sessionId — should not reveal the goal exists
  const result: any = await getGoal.handler({ goalId, sessionId: "different-session" }, STUB_INVOCATION);
  if (!result.error) throw new Error("Expected error when sessionId does not match");
  if (result.goal) throw new Error("Should not return goal data for wrong sessionId");
}

async function testGetGoalNonExistentIdReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const tools = createPlanningTools("test-token", store);
  const getGoal = tools.find((t) => t.name === "get_goal")!;
  const result: any = await getGoal.handler({ goalId: "nonexistent-uuid-1234", sessionId: "any-session" }, STUB_INVOCATION);
  if (!result.error) throw new Error("Expected error for non-existent goal ID");
  if (!result.error.includes("nonexistent-uuid-1234")) {
    throw new Error(`Expected error to mention the goal ID, got: ${result.error}`);
  }
}

async function testGetGoalEmptyIdReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const tools = createPlanningTools("test-token", store);
  const getGoal = tools.find((t) => t.name === "get_goal")!;
  const result: any = await getGoal.handler({ goalId: "", sessionId: "any-session" }, STUB_INVOCATION);
  if (!result.error) throw new Error("Expected error for empty goalId");
}

// ── Research tool tests ──────────────────────────────────────────────────────

async function seedGoal(store: InMemoryPlanningStore): Promise<string> {
  const tools = createPlanningTools("test-token", store);
  const saveGoal = tools.find((t) => t.name === "save_goal")!;
  const saved: any = await saveGoal.handler(makeValidSaveGoalArgs(), STUB_INVOCATION);
  return saved.goal.id;
}

async function testGenerateResearchChecklistReturns8Items(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_research_checklist")!;

  const result: any = await gen.handler(
    { goalId, sessionId: makeValidSaveGoalArgs().sessionId },
    STUB_INVOCATION
  );
  if (!result.items) throw new Error("Expected items in result");
  if (result.items.length !== 8) throw new Error(`Expected 8 research items, got ${result.items.length}`);

  const categories = result.items.map((i: any) => i.category).sort();
  const expected = [
    "architecture", "data_model", "domain", "infrastructure",
    "integration", "operational", "security", "ux",
  ].sort();
  for (let i = 0; i < 8; i++) {
    if (categories[i] !== expected[i]) {
      throw new Error(`Missing category: expected ${expected[i]}, got ${categories[i]}`);
    }
  }
}

async function testGenerateResearchChecklistAllItemsHaveOpenStatus(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_research_checklist")!;

  const result: any = await gen.handler(
    { goalId, sessionId: makeValidSaveGoalArgs().sessionId },
    STUB_INVOCATION
  );
  for (const item of result.items) {
    if (item.status !== "open") {
      throw new Error(`Expected status 'open', got '${item.status}' for category ${item.category}`);
    }
    if (!item.id) throw new Error("Research item missing id");
    if (item.goalId !== goalId) throw new Error("Research item goalId mismatch");
  }
}

async function testGenerateResearchChecklistUnknownGoalReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_research_checklist")!;
  const result: any = await gen.handler(
    { goalId: "nonexistent-goal-id", sessionId: "any-session" },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error for unknown goalId");
}

async function testGenerateResearchChecklistWrongSessionReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_research_checklist")!;
  const result: any = await gen.handler(
    { goalId, sessionId: "wrong-session-id" },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error for wrong sessionId");
}

async function testUpdateResearchItemOpenToResearching(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_research_checklist")!;
  const update = tools.find((t) => t.name === "update_research_item")!;

  const genResult: any = await gen.handler(
    { goalId, sessionId: makeValidSaveGoalArgs().sessionId },
    STUB_INVOCATION
  );
  const itemId = genResult.items[0].id;

  const result: any = await update.handler(
    { itemId, goalId, sessionId: makeValidSaveGoalArgs().sessionId, status: "researching" },
    STUB_INVOCATION
  );
  if (!result.item) throw new Error("Expected item in update result");
  if (result.item.status !== "researching") {
    throw new Error(`Expected status 'researching', got '${result.item.status}'`);
  }
}

async function testUpdateResearchItemResolvingRequiresFindings(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_research_checklist")!;
  const update = tools.find((t) => t.name === "update_research_item")!;

  const genResult: any = await gen.handler(
    { goalId, sessionId: makeValidSaveGoalArgs().sessionId },
    STUB_INVOCATION
  );
  const itemId = genResult.items[0].id;

  // First advance to 'researching' so the transition to 'resolved' is valid.
  await update.handler(
    { itemId, goalId, sessionId: makeValidSaveGoalArgs().sessionId, status: "researching" },
    STUB_INVOCATION
  );

  // Now try to resolve without providing findings — the findings-required guard should fire.
  const result: any = await update.handler(
    { itemId, goalId, sessionId: makeValidSaveGoalArgs().sessionId, status: "resolved" },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error when resolving without findings");
}

async function testUpdateResearchItemFullLifecycle(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_research_checklist")!;
  const update = tools.find((t) => t.name === "update_research_item")!;

  const genResult: any = await gen.handler(
    { goalId, sessionId: makeValidSaveGoalArgs().sessionId },
    STUB_INVOCATION
  );
  const itemId = genResult.items[0].id;

  // open → researching
  await update.handler(
    { itemId, goalId, sessionId: makeValidSaveGoalArgs().sessionId, status: "researching" },
    STUB_INVOCATION
  );

  // researching → resolved with findings
  const resolveResult: any = await update.handler(
    {
      itemId,
      goalId,
      sessionId: makeValidSaveGoalArgs().sessionId,
      status: "resolved",
      findings: "We found that REST is sufficient for this use case.",
      decision: "Use REST API.",
    },
    STUB_INVOCATION
  );
  if (!resolveResult.item) throw new Error("Expected item in resolve result");
  if (resolveResult.item.status !== "resolved") {
    throw new Error(`Expected status 'resolved', got '${resolveResult.item.status}'`);
  }
  if (!resolveResult.item.findings) throw new Error("Expected findings on resolved item");
  if (!resolveResult.item.resolvedAt) throw new Error("Expected resolvedAt on resolved item");
}

async function testUpdateResearchItemSanitizesFindings(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_research_checklist")!;
  const update = tools.find((t) => t.name === "update_research_item")!;

  const genResult: any = await gen.handler(
    { goalId, sessionId: makeValidSaveGoalArgs().sessionId },
    STUB_INVOCATION
  );
  const itemId = genResult.items[0].id;

  // Advance to researching first.
  await update.handler(
    { itemId, goalId, sessionId: makeValidSaveGoalArgs().sessionId, status: "researching" },
    STUB_INVOCATION
  );

  const result: any = await update.handler(
    {
      itemId,
      goalId,
      sessionId: makeValidSaveGoalArgs().sessionId,
      status: "resolved",
      findings: "<script>alert('xss')</script> Real finding here.",
    },
    STUB_INVOCATION
  );
  if (!result.item) throw new Error("Expected item in result");
  if (result.item.findings.includes("<script>")) {
    throw new Error("Findings should not contain raw HTML tags");
  }
  if (!result.item.findings.includes("&lt;script&gt;")) {
    throw new Error("Expected HTML entities in sanitized findings");
  }
}

async function testUpdateResearchItemInvalidStatusTransitionReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_research_checklist")!;
  const update = tools.find((t) => t.name === "update_research_item")!;

  const genResult: any = await gen.handler(
    { goalId, sessionId: makeValidSaveGoalArgs().sessionId },
    STUB_INVOCATION
  );
  const itemId = genResult.items[0].id;

  // Skip researching and go straight to resolved — invalid.
  const result: any = await update.handler(
    {
      itemId,
      goalId,
      sessionId: makeValidSaveGoalArgs().sessionId,
      status: "resolved",
      findings: "Some findings",
    },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error for invalid status transition open → resolved");
}

async function testUpdateResearchItemInvalidSourceUrlReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_research_checklist")!;
  const update = tools.find((t) => t.name === "update_research_item")!;

  const genResult: any = await gen.handler(
    { goalId, sessionId: makeValidSaveGoalArgs().sessionId },
    STUB_INVOCATION
  );
  const itemId = genResult.items[0].id;

  // Advance to researching first.
  await update.handler(
    { itemId, goalId, sessionId: makeValidSaveGoalArgs().sessionId, status: "researching" },
    STUB_INVOCATION
  );

  // Try to resolve with an invalid sourceUrl.
  const result: any = await update.handler(
    {
      itemId,
      goalId,
      sessionId: makeValidSaveGoalArgs().sessionId,
      status: "resolved",
      findings: "Some findings",
      sourceUrl: "not-a-valid-url",
    },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error for invalid sourceUrl");
}

async function testUpdateResearchItemValidSourceUrlIsPersisted(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_research_checklist")!;
  const update = tools.find((t) => t.name === "update_research_item")!;

  const genResult: any = await gen.handler(
    { goalId, sessionId: makeValidSaveGoalArgs().sessionId },
    STUB_INVOCATION
  );
  const itemId = genResult.items[0].id;

  // Advance to researching.
  await update.handler(
    { itemId, goalId, sessionId: makeValidSaveGoalArgs().sessionId, status: "researching" },
    STUB_INVOCATION
  );

  // Resolve with a valid sourceUrl.
  const result: any = await update.handler(
    {
      itemId,
      goalId,
      sessionId: makeValidSaveGoalArgs().sessionId,
      status: "resolved",
      findings: "Documented in the RFC.",
      sourceUrl: "https://example.com/rfc-1234",
    },
    STUB_INVOCATION
  );
  if (!result.item) throw new Error("Expected item in result");
  if (result.item.sourceUrl !== "https://example.com/rfc-1234") {
    throw new Error(`Expected sourceUrl to be persisted, got: ${result.item.sourceUrl}`);
  }
}

async function testGetResearchReturnsItems(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_research_checklist")!;
  const getResearch = tools.find((t) => t.name === "get_research")!;

  await gen.handler(
    { goalId, sessionId: makeValidSaveGoalArgs().sessionId },
    STUB_INVOCATION
  );

  const result: any = await getResearch.handler(
    { goalId, sessionId: makeValidSaveGoalArgs().sessionId },
    STUB_INVOCATION
  );
  if (!result.items) throw new Error("Expected items in get_research result");
  if (result.items.length !== 8) {
    throw new Error(`Expected 8 research items, got ${result.items.length}`);
  }
}

async function testGetResearchWrongSessionReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const getResearch = tools.find((t) => t.name === "get_research")!;
  const result: any = await getResearch.handler(
    { goalId, sessionId: "wrong-session" },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error for wrong sessionId");
}

async function testGetResearchUnknownGoalReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const tools = createPlanningTools("test-token", store);
  const getResearch = tools.find((t) => t.name === "get_research")!;
  const result: any = await getResearch.handler(
    { goalId: "nonexistent-id", sessionId: "any-session" },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error for unknown goalId");
}

// ── Milestone tool tests ─────────────────────────────────────────────────────

function makeValidMilestoneSpecs() {
  return [
    {
      name: "Foundation",
      goal: "Set up the project structure",
      scope: "Project scaffolding only, excludes business logic",
      order: 1,
      dependencies: [],
      acceptanceCriteria: ["Repo initialized"],
      exitCriteria: ["CI passing"],
    },
    {
      name: "Core Features",
      goal: "Implement the main feature set",
      scope: "Core features only, excludes polish",
      order: 2,
      dependencies: [1],
      acceptanceCriteria: ["Feature works end-to-end"],
      exitCriteria: ["Tests passing"],
    },
  ];
}

async function testCreateMilestonePlanReturnsOrderedMilestones(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const create = tools.find((t) => t.name === "create_milestone_plan")!;

  const result: any = await create.handler(
    {
      sessionId: makeValidSaveGoalArgs().sessionId,
      goalId,
      milestones: makeValidMilestoneSpecs(),
    },
    STUB_INVOCATION
  );

  if (!result.milestones) throw new Error("Expected milestones in result");
  if (result.milestones.length !== 2) {
    throw new Error(`Expected 2 milestones, got ${result.milestones.length}`);
  }
  // Verify ordering
  if (result.milestones[0].order !== 1) throw new Error("First milestone should have order 1");
  if (result.milestones[1].order !== 2) throw new Error("Second milestone should have order 2");
  // Verify IDs are assigned
  if (!result.milestones[0].id) throw new Error("Milestone missing id");
  if (!result.milestones[1].id) throw new Error("Milestone missing id");
  // Verify dependency is resolved to actual ID
  const dep = result.milestones[1].dependencies[0];
  if (dep !== result.milestones[0].id) {
    throw new Error(`Expected dependency ID to match first milestone id, got: ${dep}`);
  }
}

async function testCreateMilestonePlanCircularDependencyReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const create = tools.find((t) => t.name === "create_milestone_plan")!;

  // A→B, B→A: circular
  const result: any = await create.handler(
    {
      sessionId: makeValidSaveGoalArgs().sessionId,
      goalId,
      milestones: [
        {
          name: "Milestone A",
          goal: "First milestone",
          scope: "Scope A",
          order: 1,
          dependencies: [2],
          acceptanceCriteria: ["done"],
          exitCriteria: [],
        },
        {
          name: "Milestone B",
          goal: "Second milestone",
          scope: "Scope B",
          order: 2,
          dependencies: [1],
          acceptanceCriteria: ["done"],
          exitCriteria: [],
        },
      ],
    },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error for circular dependency");
  if (!result.error.toLowerCase().includes("circular")) {
    throw new Error(`Expected 'circular' in error message, got: ${result.error}`);
  }
}

async function testCreateMilestonePlanWrongSessionReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const create = tools.find((t) => t.name === "create_milestone_plan")!;

  const result: any = await create.handler(
    {
      sessionId: "wrong-session",
      goalId,
      milestones: makeValidMilestoneSpecs(),
    },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error for wrong sessionId");
}

async function testCreateMilestonePlanDuplicateOrderReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const create = tools.find((t) => t.name === "create_milestone_plan")!;

  const result: any = await create.handler(
    {
      sessionId: makeValidSaveGoalArgs().sessionId,
      goalId,
      milestones: [
        { ...makeValidMilestoneSpecs()[0], order: 1 },
        { ...makeValidMilestoneSpecs()[1], order: 1 }, // duplicate order
      ],
    },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error for duplicate order");
}

async function testCreateMilestonePlanNameIsSanitized(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const create = tools.find((t) => t.name === "create_milestone_plan")!;

  const result: any = await create.handler(
    {
      sessionId: makeValidSaveGoalArgs().sessionId,
      goalId,
      milestones: [
        {
          name: "<script>alert('xss')</script>Milestone",
          goal: "Test sanitization",
          scope: "Sanitization scope",
          order: 1,
          dependencies: [],
          acceptanceCriteria: ["done"],
          exitCriteria: [],
        },
      ],
    },
    STUB_INVOCATION
  );
  if (!result.milestones) throw new Error("Expected milestones in result");
  const name = result.milestones[0].name;
  if (name.includes("<script>")) throw new Error("Milestone name should not contain raw HTML tags");
  if (!name.includes("&lt;script&gt;")) throw new Error("Expected HTML entities in sanitized name");
}

async function testUpdateMilestoneFieldsAreUpdated(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const create = tools.find((t) => t.name === "create_milestone_plan")!;
  const update = tools.find((t) => t.name === "update_milestone")!;

  const createResult: any = await create.handler(
    {
      sessionId: makeValidSaveGoalArgs().sessionId,
      goalId,
      milestones: [makeValidMilestoneSpecs()[0]],
    },
    STUB_INVOCATION
  );
  const milestoneId = createResult.milestones[0].id;

  const result: any = await update.handler(
    {
      milestoneId,
      goalId,
      sessionId: makeValidSaveGoalArgs().sessionId,
      name: "Updated Name",
      status: "ready",
    },
    STUB_INVOCATION
  );
  if (!result.milestone) throw new Error("Expected milestone in update result");
  if (result.milestone.name !== "Updated Name") {
    throw new Error(`Expected name 'Updated Name', got '${result.milestone.name}'`);
  }
  if (result.milestone.status !== "ready") {
    throw new Error(`Expected status 'ready', got '${result.milestone.status}'`);
  }
}

async function testUpdateMilestoneWrongSessionReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const create = tools.find((t) => t.name === "create_milestone_plan")!;
  const update = tools.find((t) => t.name === "update_milestone")!;

  const createResult: any = await create.handler(
    {
      sessionId: makeValidSaveGoalArgs().sessionId,
      goalId,
      milestones: [makeValidMilestoneSpecs()[0]],
    },
    STUB_INVOCATION
  );
  const milestoneId = createResult.milestones[0].id;

  const result: any = await update.handler(
    { milestoneId, goalId, sessionId: "wrong-session", name: "New Name" },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error for wrong sessionId");
}

async function testUpdateMilestoneInvalidStatusReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const create = tools.find((t) => t.name === "create_milestone_plan")!;
  const update = tools.find((t) => t.name === "update_milestone")!;

  const createResult: any = await create.handler(
    {
      sessionId: makeValidSaveGoalArgs().sessionId,
      goalId,
      milestones: [makeValidMilestoneSpecs()[0]],
    },
    STUB_INVOCATION
  );
  const milestoneId = createResult.milestones[0].id;

  const result: any = await update.handler(
    { milestoneId, goalId, sessionId: makeValidSaveGoalArgs().sessionId, status: "invalid-status" },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error for invalid status");
}

async function testUpdateMilestoneCircularDependencyReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const create = tools.find((t) => t.name === "create_milestone_plan")!;
  const update = tools.find((t) => t.name === "update_milestone")!;

  // Create two milestones: M1 (order 1) and M2 (order 2, depends on M1)
  const createResult: any = await create.handler(
    {
      sessionId: makeValidSaveGoalArgs().sessionId,
      goalId,
      milestones: makeValidMilestoneSpecs(),
    },
    STUB_INVOCATION
  );
  const m1Id = createResult.milestones[0].id;
  const m2Id = createResult.milestones[1].id;

  // Attempt to make M1 depend on M2 — creates a cycle M1→M2→M1
  const result: any = await update.handler(
    {
      milestoneId: m1Id,
      goalId,
      sessionId: makeValidSaveGoalArgs().sessionId,
      dependencies: [m2Id],
    },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error for circular dependency in update");
  if (!result.error.toLowerCase().includes("circular")) {
    throw new Error(`Expected 'circular' in error message, got: ${result.error}`);
  }
}

async function testGetMilestonesReturnsOrdered(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const create = tools.find((t) => t.name === "create_milestone_plan")!;
  const get = tools.find((t) => t.name === "get_milestones")!;

  // Create milestones in reverse order to test ordering
  await create.handler(
    {
      sessionId: makeValidSaveGoalArgs().sessionId,
      goalId,
      milestones: [makeValidMilestoneSpecs()[1], makeValidMilestoneSpecs()[0]],
    },
    STUB_INVOCATION
  );

  const result: any = await get.handler(
    { goalId, sessionId: makeValidSaveGoalArgs().sessionId },
    STUB_INVOCATION
  );
  if (!result.milestones) throw new Error("Expected milestones in get result");
  if (result.milestones.length !== 2) {
    throw new Error(`Expected 2 milestones, got ${result.milestones.length}`);
  }
  if (result.milestones[0].order !== 1) throw new Error("First milestone should have order 1");
  if (result.milestones[1].order !== 2) throw new Error("Second milestone should have order 2");
}

async function testGetMilestonesWrongSessionReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const get = tools.find((t) => t.name === "get_milestones")!;

  const result: any = await get.handler(
    { goalId, sessionId: "wrong-session" },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error for wrong sessionId");
}

async function testGetMilestonesUnknownGoalReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const tools = createPlanningTools("test-token", store);
  const get = tools.find((t) => t.name === "get_milestones")!;

  const result: any = await get.handler(
    { goalId: "nonexistent-goal", sessionId: "any-session" },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error for unknown goalId");
}

async function testUpdateMilestoneOrderCollisionReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const create = tools.find((t) => t.name === "create_milestone_plan")!;
  const update = tools.find((t) => t.name === "update_milestone")!;

  // Create two milestones with orders 1 and 2
  const createResult: any = await create.handler(
    {
      sessionId: makeValidSaveGoalArgs().sessionId,
      goalId,
      milestones: makeValidMilestoneSpecs(),
    },
    STUB_INVOCATION
  );
  const m2Id = createResult.milestones[1].id; // order=2

  // Try to update milestone 2's order to 1 — should collide with milestone 1
  const result: any = await update.handler(
    {
      milestoneId: m2Id,
      goalId,
      sessionId: makeValidSaveGoalArgs().sessionId,
      order: 1,
    },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error for duplicate order on update");
  if (!result.error.includes("order 1")) {
    throw new Error(`Expected error to mention order 1, got: ${result.error}`);
  }
}

async function testCreateMilestonePlanNameLengthAfterSanitizationReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const create = tools.find((t) => t.name === "create_milestone_plan")!;

  // A name that is comfortably under the limit before sanitization but exceeds it after HTML-escaping.
  // Each "&" becomes "&amp;" (5 chars instead of 1), so 25 "&" chars = 25 * 5 = 125 chars after escape,
  // and the trailing "x" stays as 1 char → total sanitized length = 25 * 5 + 1 = 126 (> 100).
  const name = "&".repeat(25) + "x"; // 26 chars raw → 25 * 5 + 1 = 126 chars after escaping, well over 100
  const result: any = await create.handler(
    {
      sessionId: makeValidSaveGoalArgs().sessionId,
      goalId,
      milestones: [
        {
          name,
          goal: "Test",
          scope: "Test scope",
          order: 1,
          dependencies: [],
          acceptanceCriteria: ["done"],
          exitCriteria: [],
        },
      ],
    },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error when sanitized name exceeds max length");
  if (!result.error.includes("sanitization")) {
    throw new Error(`Expected error to mention 'sanitization', got: ${result.error}`);
  }
}

// ============================================================
// 6b. generate_issue_drafts tool tests
// ============================================================

/**
 * Builds a minimal valid issue spec for use in generate_issue_drafts tests.
 */
function makeValidIssueSpec(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    title: "Implement login endpoint",
    purpose: "Allow users to authenticate",
    problem: "No authentication endpoint exists in the server",
    expectedOutcome: "POST /api/login returns 200 with JWT on valid credentials",
    scopeBoundaries: "In scope: login. Out of scope: registration, SSO",
    technicalContext: "Use JWT via jsonwebtoken package. Follow existing route pattern in server.ts",
    acceptanceCriteria: ["Returns 200 on valid credentials", "Returns 401 on invalid credentials"],
    testingExpectations: "Unit tests for JWT helper; integration tests for endpoint",
    filesToModify: [{ path: "server.ts", reason: "Add POST /api/login route" }],
    filesToRead: [{ path: "tools.ts", reason: "Follow existing API tool pattern" }],
    securityChecklist: ["Validate input", "Hash password before comparison"],
    verificationCommands: ["npx tsc --noEmit", "npm test"],
    order: 1,
    dependencies: [],
    researchLinks: [],
    ...overrides,
  };
}

async function testGenerateIssueDraftsReturnsOrderedDrafts(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, milestoneId, sessionId } = await seedGoalAndMilestone(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_issue_drafts")!;

  const result: any = await gen.handler(
    {
      sessionId,
      goalId,
      milestoneId,
      issues: [
        makeValidIssueSpec({ order: 2, title: "Issue B" }),
        makeValidIssueSpec({ order: 1, title: "Issue A" }),
      ],
    },
    STUB_INVOCATION
  );

  if (result.error) throw new Error(`Unexpected error: ${result.error}`);
  if (!Array.isArray(result.issues)) throw new Error("Expected issues array in result");
  if (result.issues.length !== 2) throw new Error(`Expected 2 issues, got ${result.issues.length}`);
  if (result.issues[0].order !== 1) throw new Error(`Expected first issue order 1, got ${result.issues[0].order}`);
  if (result.issues[1].order !== 2) throw new Error(`Expected second issue order 2, got ${result.issues[1].order}`);
  if (result.issues[0].title !== "Issue A") throw new Error(`Expected 'Issue A', got '${result.issues[0].title}'`);
  if (result.issues[0].milestoneId !== milestoneId) throw new Error("milestoneId mismatch");
  if (result.issues[0].status !== "draft") throw new Error(`Expected status 'draft', got '${result.issues[0].status}'`);
  if (!result.issues[0].id) throw new Error("Missing id on created issue draft");
  // Verify persisted in store
  const persisted = await store.listIssueDrafts(milestoneId);
  if (persisted.length !== 2) throw new Error(`Expected 2 persisted drafts, got ${persisted.length}`);
}

async function testGenerateIssueDraftsR9FieldsPresent(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, milestoneId, sessionId } = await seedGoalAndMilestone(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_issue_drafts")!;

  const result: any = await gen.handler(
    {
      sessionId,
      goalId,
      milestoneId,
      issues: [
        makeValidIssueSpec({
          filesToModify: [{ path: "server.ts", reason: "Add endpoint" }],
          filesToRead: [{ path: "tools.ts", reason: "Follow pattern" }],
          patternReference: "tools.ts:githubFetch()",
          securityChecklist: ["Sanitize input"],
          verificationCommands: ["npx tsc --noEmit"],
        }),
      ],
    },
    STUB_INVOCATION
  );

  if (result.error) throw new Error(`Unexpected error: ${result.error}`);
  const draft = result.issues[0];
  if (!Array.isArray(draft.filesToModify) || draft.filesToModify.length === 0) {
    throw new Error("Expected filesToModify in draft");
  }
  if (draft.filesToModify[0].path !== "server.ts") throw new Error("filesToModify path mismatch");
  if (!Array.isArray(draft.filesToRead)) throw new Error("Expected filesToRead in draft");
  if (draft.patternReference !== "tools.ts:githubFetch()") throw new Error("patternReference mismatch");
  if (!Array.isArray(draft.securityChecklist) || draft.securityChecklist.length === 0) {
    throw new Error("Expected securityChecklist in draft");
  }
  if (!Array.isArray(draft.verificationCommands) || draft.verificationCommands.length === 0) {
    throw new Error("Expected verificationCommands in draft");
  }
}

async function testGenerateIssueDraftsDependencyChainRespected(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, milestoneId, sessionId } = await seedGoalAndMilestone(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_issue_drafts")!;

  const result: any = await gen.handler(
    {
      sessionId,
      goalId,
      milestoneId,
      issues: [
        makeValidIssueSpec({ order: 1, title: "Issue A", dependencies: [] }),
        makeValidIssueSpec({ order: 2, title: "Issue B", dependencies: [1] }),
      ],
    },
    STUB_INVOCATION
  );

  if (result.error) throw new Error(`Unexpected error: ${result.error}`);
  const issueA = result.issues.find((d: any) => d.order === 1);
  const issueB = result.issues.find((d: any) => d.order === 2);
  if (!issueA || !issueB) throw new Error("Missing expected issues");
  if (!Array.isArray(issueB.dependencies) || issueB.dependencies.length !== 1) {
    throw new Error(`Expected Issue B to have 1 dependency, got ${JSON.stringify(issueB.dependencies)}`);
  }
  if (issueB.dependencies[0] !== issueA.id) {
    throw new Error(`Expected Issue B dependency to be Issue A's ID`);
  }
  if (issueA.dependencies.length !== 0) throw new Error("Issue A should have no dependencies");
}

async function testGenerateIssueDraftsCircularDependencyReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, milestoneId, sessionId } = await seedGoalAndMilestone(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_issue_drafts")!;

  const result: any = await gen.handler(
    {
      sessionId,
      goalId,
      milestoneId,
      issues: [
        makeValidIssueSpec({ order: 1, dependencies: [2] }),
        makeValidIssueSpec({ order: 2, dependencies: [1] }),
      ],
    },
    STUB_INVOCATION
  );

  if (!result.error) throw new Error("Expected error for circular dependency");
  if (!result.error.toLowerCase().includes("circular")) {
    throw new Error(`Expected 'circular' in error, got: ${result.error}`);
  }
}

async function testGenerateIssueDraftsWrongSessionReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, milestoneId } = await seedGoalAndMilestone(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_issue_drafts")!;

  const result: any = await gen.handler(
    {
      sessionId: "wrong-session",
      goalId,
      milestoneId,
      issues: [makeValidIssueSpec()],
    },
    STUB_INVOCATION
  );

  if (!result.error) throw new Error("Expected error for wrong sessionId");
  if (!result.error.includes("Goal not found")) {
    throw new Error(`Expected 'Goal not found' error, got: ${result.error}`);
  }
}

async function testGenerateIssueDraftsUnknownMilestoneReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, sessionId } = await seedGoalAndMilestone(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_issue_drafts")!;

  const result: any = await gen.handler(
    {
      sessionId,
      goalId,
      milestoneId: "nonexistent-milestone-id",
      issues: [makeValidIssueSpec()],
    },
    STUB_INVOCATION
  );

  if (!result.error) throw new Error("Expected error for unknown milestoneId");
  if (!result.error.includes("Milestone not found")) {
    throw new Error(`Expected 'Milestone not found' error, got: ${result.error}`);
  }
}

async function testGenerateIssueDraftsR9TooManyFilesToModifyReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, milestoneId, sessionId } = await seedGoalAndMilestone(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_issue_drafts")!;

  const result: any = await gen.handler(
    {
      sessionId,
      goalId,
      milestoneId,
      issues: [
        makeValidIssueSpec({
          filesToModify: [
            { path: "a.ts", reason: "r1" },
            { path: "b.ts", reason: "r2" },
            { path: "c.ts", reason: "r3" },
            { path: "d.ts", reason: "r4" },
            { path: "e.ts", reason: "r5" },
            { path: "f.ts", reason: "r6" }, // 6 > max 5
          ],
        }),
      ],
    },
    STUB_INVOCATION
  );

  if (!result.error) throw new Error("Expected error when filesToModify exceeds R9 limit");
  if (!result.error.includes("filesToModify")) {
    throw new Error(`Expected error to mention 'filesToModify', got: ${result.error}`);
  }
}

async function testGenerateIssueDraftsMissingFilesToModifyReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, milestoneId, sessionId } = await seedGoalAndMilestone(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_issue_drafts")!;

  const result: any = await gen.handler(
    {
      sessionId,
      goalId,
      milestoneId,
      issues: [makeValidIssueSpec({ filesToModify: [] })],
    },
    STUB_INVOCATION
  );

  if (!result.error) throw new Error("Expected error for empty filesToModify");
  if (!result.error.includes("filesToModify")) {
    throw new Error(`Expected error to mention 'filesToModify', got: ${result.error}`);
  }
}

async function testGenerateIssueDraftsDuplicateOrderReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, milestoneId, sessionId } = await seedGoalAndMilestone(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_issue_drafts")!;

  const result: any = await gen.handler(
    {
      sessionId,
      goalId,
      milestoneId,
      issues: [
        makeValidIssueSpec({ order: 1 }),
        makeValidIssueSpec({ order: 1 }), // duplicate
      ],
    },
    STUB_INVOCATION
  );

  if (!result.error) throw new Error("Expected error for duplicate order values");
  if (!result.error.toLowerCase().includes("duplicate")) {
    throw new Error(`Expected 'duplicate' in error, got: ${result.error}`);
  }
}

async function testGenerateIssueDraftsTextFieldsAreSanitized(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, milestoneId, sessionId } = await seedGoalAndMilestone(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_issue_drafts")!;

  const result: any = await gen.handler(
    {
      sessionId,
      goalId,
      milestoneId,
      issues: [
        makeValidIssueSpec({
          title: "<script>alert(1)</script>",
          problem: "User input <b>bold</b> & 'quoted'",
        }),
      ],
    },
    STUB_INVOCATION
  );

  if (result.error) throw new Error(`Unexpected error: ${result.error}`);
  const draft = result.issues[0];
  if (draft.title.includes("<script>")) throw new Error("title was not sanitized");
  if (draft.problem.includes("<b>")) throw new Error("problem was not sanitized");
  if (!draft.title.includes("&lt;script&gt;")) {
    throw new Error(`Expected HTML-escaped title, got: ${draft.title}`);
  }
}

async function testGenerateIssueDraftsPathTraversalReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, milestoneId, sessionId } = await seedGoalAndMilestone(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_issue_drafts")!;

  const result: any = await gen.handler(
    {
      sessionId,
      goalId,
      milestoneId,
      issues: [
        makeValidIssueSpec({
          filesToModify: [{ path: "../etc/passwd", reason: "Path traversal attempt" }],
        }),
      ],
    },
    STUB_INVOCATION
  );

  if (!result.error) throw new Error("Expected error for path traversal in filesToModify");
  if (!result.error.includes("..")) {
    throw new Error(`Expected error to mention "..", got: ${result.error}`);
  }
}

async function testGenerateIssueDraftsMissingVerificationCommandsReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, milestoneId, sessionId } = await seedGoalAndMilestone(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_issue_drafts")!;

  const result: any = await gen.handler(
    {
      sessionId,
      goalId,
      milestoneId,
      issues: [makeValidIssueSpec({ verificationCommands: [] })],
    },
    STUB_INVOCATION
  );

  if (!result.error) throw new Error("Expected error for empty verificationCommands");
  if (!result.error.includes("verificationCommands")) {
    throw new Error(`Expected error to mention 'verificationCommands', got: ${result.error}`);
  }
}

async function testGenerateIssueDraftsResearchLinksArePersistedOnDraft(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, milestoneId, sessionId } = await seedGoalAndMilestone(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_issue_drafts")!;
  const researchId = "research-item-abc-123";

  const result: any = await gen.handler(
    {
      sessionId,
      goalId,
      milestoneId,
      issues: [makeValidIssueSpec({ researchLinks: [researchId] })],
    },
    STUB_INVOCATION
  );

  if (result.error) throw new Error(`Unexpected error: ${result.error}`);
  const draft = result.issues[0];
  if (!Array.isArray(draft.researchLinks) || draft.researchLinks.length !== 1) {
    throw new Error(`Expected 1 research link, got ${JSON.stringify(draft.researchLinks)}`);
  }
  if (draft.researchLinks[0] !== researchId) {
    throw new Error(`Expected research link ${researchId}, got ${draft.researchLinks[0]}`);
  }
}

// ============================================================
// 6b2. update_issue_draft tool tests
// ============================================================

/**
 * Seeds a goal, milestone, and one issue draft into the store.
 * Returns { goalId, milestoneId, sessionId, draftId }.
 */
async function seedIssueDraft(
  store: InMemoryPlanningStore
): Promise<{ goalId: string; milestoneId: string; sessionId: string; draftId: string }> {
  const { goalId, milestoneId, sessionId } = await seedGoalAndMilestone(store);
  const tools = createPlanningTools("test-token", store);
  const gen = tools.find((t) => t.name === "generate_issue_drafts")!;
  const result: any = await gen.handler(
    { sessionId, goalId, milestoneId, issues: [makeValidIssueSpec()] },
    STUB_INVOCATION
  );
  if (result.error) throw new Error(`seedIssueDraft failed: ${result.error}`);
  return { goalId, milestoneId, sessionId, draftId: result.issues[0].id };
}

async function testUpdateIssueDraftFieldsAreUpdated(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, sessionId, draftId } = await seedIssueDraft(store);
  const tools = createPlanningTools("test-token", store);
  const update = tools.find((t) => t.name === "update_issue_draft")!;

  const result: any = await update.handler(
    {
      draftId,
      goalId,
      sessionId,
      title: "Updated Title",
      status: "ready",
    },
    STUB_INVOCATION
  );
  if (result.error) throw new Error(`Unexpected error: ${result.error}`);
  if (!result.draft) throw new Error("Expected draft in result");
  if (result.draft.title !== "Updated Title") {
    throw new Error(`Expected title 'Updated Title', got '${result.draft.title}'`);
  }
  if (result.draft.status !== "ready") {
    throw new Error(`Expected status 'ready', got '${result.draft.status}'`);
  }
  if (result.draft.id !== draftId) throw new Error("ID should be unchanged");
}

async function testUpdateIssueDraftWrongSessionReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, draftId } = await seedIssueDraft(store);
  const tools = createPlanningTools("test-token", store);
  const update = tools.find((t) => t.name === "update_issue_draft")!;

  const result: any = await update.handler(
    { draftId, goalId, sessionId: "wrong-session", title: "New Title" },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error for wrong sessionId");
  if (!result.error.includes("Goal not found")) {
    throw new Error(`Expected 'Goal not found' error, got '${result.error}'`);
  }
}

async function testUpdateIssueDraftNotFoundReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, sessionId } = await seedIssueDraft(store);
  const tools = createPlanningTools("test-token", store);
  const update = tools.find((t) => t.name === "update_issue_draft")!;

  const result: any = await update.handler(
    { draftId: "nonexistent-id", goalId, sessionId, title: "New Title" },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error for unknown draftId");
  if (!result.error.includes("Issue draft not found")) {
    throw new Error(`Expected 'Issue draft not found' error, got '${result.error}'`);
  }
}

async function testUpdateIssueDraftFileRefValidationOnUpdate(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, sessionId, draftId } = await seedIssueDraft(store);
  const tools = createPlanningTools("test-token", store);
  const update = tools.find((t) => t.name === "update_issue_draft")!;

  // Missing reason field
  const result: any = await update.handler(
    {
      draftId,
      goalId,
      sessionId,
      filesToModify: [{ path: "server.ts" }],
    },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error for FileRef missing reason");

  // Path traversal in filesToRead
  const result2: any = await update.handler(
    {
      draftId,
      goalId,
      sessionId,
      filesToRead: [{ path: "../secret.ts", reason: "some reason" }],
    },
    STUB_INVOCATION
  );
  if (!result2.error) throw new Error("Expected error for path traversal in filesToRead");
}

async function testUpdateIssueDraftTextFieldsAreSanitized(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, sessionId, draftId } = await seedIssueDraft(store);
  const tools = createPlanningTools("test-token", store);
  const update = tools.find((t) => t.name === "update_issue_draft")!;

  const result: any = await update.handler(
    { draftId, goalId, sessionId, title: "Title <b>with HTML</b>" },
    STUB_INVOCATION
  );
  if (result.error) throw new Error(`Unexpected error: ${result.error}`);
  if (!result.draft.title.includes("&lt;")) {
    throw new Error(`Expected HTML-escaped title, got '${result.draft.title}'`);
  }
}

async function testUpdateIssueDraftInvalidStatusReturnsError(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, sessionId, draftId } = await seedIssueDraft(store);
  const tools = createPlanningTools("test-token", store);
  const update = tools.find((t) => t.name === "update_issue_draft")!;

  const result: any = await update.handler(
    { draftId, goalId, sessionId, status: "invalid-status" },
    STUB_INVOCATION
  );
  if (!result.error) throw new Error("Expected error for invalid status");
  if (!result.error.includes("draft") || !result.error.includes("ready") || !result.error.includes("created")) {
    throw new Error(`Expected error listing valid statuses, got '${result.error}'`);
  }
}

async function testUpdateIssueDraftR9FieldsCanBeUpdated(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, sessionId, draftId } = await seedIssueDraft(store);
  const tools = createPlanningTools("test-token", store);
  const update = tools.find((t) => t.name === "update_issue_draft")!;

  const result: any = await update.handler(
    {
      draftId,
      goalId,
      sessionId,
      filesToModify: [{ path: "planning-tools.ts", reason: "Add update tool" }],
      filesToRead: [{ path: "planning-types.ts", reason: "Understand IssueDraft interface" }],
      patternReference: "update_milestone tool",
      securityChecklist: ["Validate input", "Check ownership"],
      verificationCommands: ["npx tsc --noEmit"],
    },
    STUB_INVOCATION
  );
  if (result.error) throw new Error(`Unexpected error: ${result.error}`);
  const draft = result.draft;
  if (!Array.isArray(draft.filesToModify) || draft.filesToModify.length !== 1) {
    throw new Error("Expected 1 filesToModify entry");
  }
  if (draft.filesToModify[0].path !== "planning-tools.ts") {
    throw new Error(`Unexpected filesToModify path: ${draft.filesToModify[0].path}`);
  }
  if (!Array.isArray(draft.filesToRead) || draft.filesToRead.length !== 1) {
    throw new Error("Expected 1 filesToRead entry");
  }
  if (draft.patternReference !== "update_milestone tool") {
    throw new Error(`Unexpected patternReference: ${draft.patternReference}`);
  }
  if (!Array.isArray(draft.securityChecklist) || draft.securityChecklist.length !== 2) {
    throw new Error("Expected 2 securityChecklist entries");
  }
  if (!Array.isArray(draft.verificationCommands) || draft.verificationCommands.length !== 1) {
    throw new Error("Expected 1 verificationCommands entry");
  }
}

// ============================================================
// 6c. create_github_milestone tool tests
// ============================================================

/**
 * Seeds a goal and a milestone into the store.
 * Returns { goalId, milestoneId, sessionId }.
 */
async function seedGoalAndMilestone(
  store: InMemoryPlanningStore
): Promise<{ goalId: string; milestoneId: string; sessionId: string }> {
  const goalId = await seedGoal(store);
  const tools = createPlanningTools("test-token", store);
  const create = tools.find((t) => t.name === "create_milestone_plan")!;
  const result: any = await create.handler(
    {
      sessionId: makeValidSaveGoalArgs().sessionId,
      goalId,
      milestones: [
        {
          name: "Alpha Release",
          goal: "Ship the first working version",
          scope: "Core features only",
          order: 1,
          dependencies: [],
          acceptanceCriteria: ["app starts"],
          exitCriteria: [],
        },
      ],
    },
    STUB_INVOCATION
  );
  if (result.error) throw new Error(`seedGoalAndMilestone failed: ${result.error}`);
  const milestoneId = result.milestones[0].id;
  return { goalId, milestoneId, sessionId: makeValidSaveGoalArgs().sessionId as string };
}

/**
 * Sets global.fetch to a mock that simulates GitHub milestone API.
 * Returns a restore function.
 */
function mockGitHubMilestoneFetch(options: {
  listResponse?: any[];
  createResponse?: any;
  shouldFail?: boolean;
}): () => void {
  const orig = global.fetch;
  (global as any).fetch = async (url: string, init?: any) => {
    if (options.shouldFail) {
      return {
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
        headers: { get: () => null },
      };
    }
    const method = init?.method ?? "GET";
    if (method === "GET" && String(url).includes("/milestones")) {
      return {
        ok: true,
        status: 200,
        json: async () => options.listResponse ?? [],
        headers: { get: () => null },
      };
    }
    if (method === "POST" && String(url).includes("/milestones")) {
      return {
        ok: true,
        status: 201,
        json: async () => options.createResponse ?? { number: 42, html_url: "https://github.com/owner/repo/milestone/42" },
        headers: { get: () => null },
      };
    }
    // Fallback: let through
    return orig(url as any, init);
  };
  return () => { (global as any).fetch = orig; };
}

async function testGithubToolRegistration(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const tools = createGitHubTools("test-token", store);
  if (tools.length !== GITHUB_TOOL_NAMES.length) {
    throw new Error(`Expected ${GITHUB_TOOL_NAMES.length} GitHub tools, got ${tools.length}`);
  }
  const names = tools.map((t) => t.name);
  for (const name of GITHUB_TOOL_NAMES) {
    if (!names.includes(name)) throw new Error(`Missing GitHub tool: ${name}`);
  }
}

async function testCreateGithubMilestoneCreatesNew(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, milestoneId, sessionId } = await seedGoalAndMilestone(store);
  const tools = createGitHubTools("test-token", store);
  const tool = tools.find((t) => t.name === "create_github_milestone")!;

  const restore = mockGitHubMilestoneFetch({
    listResponse: [], // no existing milestones
    createResponse: { number: 7, html_url: "https://github.com/owner/repo/milestone/7" },
  });
  try {
    const result: any = await tool.handler(
      { milestoneId, goalId, sessionId, owner: "owner", repo: "repo" },
      STUB_INVOCATION
    );
    if (result.githubNumber !== 7) throw new Error(`Expected githubNumber 7, got ${result.githubNumber}`);
    if (result.githubUrl !== "https://github.com/owner/repo/milestone/7") {
      throw new Error(`Unexpected githubUrl: ${result.githubUrl}`);
    }
    // Verify store was updated
    const updated = await store.getMilestone(milestoneId);
    if (updated?.githubNumber !== 7) throw new Error("githubNumber not persisted to store");
    if (updated?.githubUrl !== "https://github.com/owner/repo/milestone/7") {
      throw new Error("githubUrl not persisted to store");
    }
  } finally {
    restore();
  }
}

async function testCreateGithubMilestoneIdempotentWhenExists(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, milestoneId, sessionId } = await seedGoalAndMilestone(store);
  const tools = createGitHubTools("test-token", store);
  const tool = tools.find((t) => t.name === "create_github_milestone")!;

  // Simulate an existing GitHub milestone matching the planning milestone's name
  const restore = mockGitHubMilestoneFetch({
    listResponse: [{ number: 3, html_url: "https://github.com/owner/repo/milestone/3", title: "Alpha Release" }],
  });
  try {
    const result: any = await tool.handler(
      { milestoneId, goalId, sessionId, owner: "owner", repo: "repo" },
      STUB_INVOCATION
    );
    if (result.githubNumber !== 3) throw new Error(`Expected githubNumber 3, got ${result.githubNumber}`);
    // Verify the existing number was stored (not a new one)
    const updated = await store.getMilestone(milestoneId);
    if (updated?.githubNumber !== 3) throw new Error("Existing githubNumber not persisted");
  } finally {
    restore();
  }
}

async function testCreateGithubMilestoneWithDueDate(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, milestoneId, sessionId } = await seedGoalAndMilestone(store);
  const tools = createGitHubTools("test-token", store);
  const tool = tools.find((t) => t.name === "create_github_milestone")!;

  const restore = mockGitHubMilestoneFetch({
    listResponse: [],
    createResponse: { number: 9, html_url: "https://github.com/owner/repo/milestone/9" },
  });
  try {
    const result: any = await tool.handler(
      { milestoneId, goalId, sessionId, owner: "owner", repo: "repo", dueDate: "2026-06-01T00:00:00Z" },
      STUB_INVOCATION
    );
    if (result.githubNumber !== 9) throw new Error(`Expected githubNumber 9, got ${result.githubNumber}`);
  } finally {
    restore();
  }
}

async function testCreateGithubMilestoneInvalidDueDateThrows(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, milestoneId, sessionId } = await seedGoalAndMilestone(store);
  const tools = createGitHubTools("test-token", store);
  const tool = tools.find((t) => t.name === "create_github_milestone")!;

  try {
    await tool.handler(
      { milestoneId, goalId, sessionId, owner: "owner", repo: "repo", dueDate: "not-a-date" },
      STUB_INVOCATION
    );
    throw new Error("Expected error to be thrown for invalid dueDate");
  } catch (err: any) {
    if (!err.message.includes("dueDate")) {
      throw new Error(`Expected error to mention 'dueDate', got: ${err.message}`);
    }
  }
}

async function testCreateGithubMilestoneWrongSessionThrows(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, milestoneId } = await seedGoalAndMilestone(store);
  const tools = createGitHubTools("test-token", store);
  const tool = tools.find((t) => t.name === "create_github_milestone")!;

  try {
    await tool.handler(
      { milestoneId, goalId, sessionId: "wrong-session", owner: "owner", repo: "repo" },
      STUB_INVOCATION
    );
    throw new Error("Expected error to be thrown for wrong sessionId");
  } catch (err: any) {
    if (!err.message.includes("Goal not found")) {
      throw new Error(`Expected 'Goal not found' error, got: ${err.message}`);
    }
  }
}

async function testCreateGithubMilestoneMissingOwnerThrows(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const { goalId, milestoneId, sessionId } = await seedGoalAndMilestone(store);
  const tools = createGitHubTools("test-token", store);
  const tool = tools.find((t) => t.name === "create_github_milestone")!;

  try {
    await tool.handler(
      { milestoneId, goalId, sessionId, owner: "", repo: "repo" },
      STUB_INVOCATION
    );
    throw new Error("Expected error to be thrown for empty owner");
  } catch (err: any) {
    if (!err.message.includes("owner")) {
      throw new Error(`Expected error to mention 'owner', got: ${err.message}`);
    }
  }
}

async function testCreateGithubMilestoneWithoutPlanningStoreThrows(): Promise<void> {
  // When createGitHubTools is called without a planningStore, the tool should throw
  const tools = createGitHubTools("test-token"); // no planningStore
  const tool = tools.find((t) => t.name === "create_github_milestone")!;

  try {
    await tool.handler(
      { milestoneId: "m1", goalId: "g1", sessionId: "s1", owner: "owner", repo: "repo" },
      STUB_INVOCATION
    );
    throw new Error("Expected error to be thrown when planningStore is not provided");
  } catch (err: any) {
    if (!err.message.includes("Planning store not available")) {
      throw new Error(`Expected 'Planning store not available', got: ${err.message}`);
    }
  }
}

// ============================================================
// 7. Research API endpoint tests (HTTP)
// ============================================================

async function testResearchGetNoAuthHeaderIsHandled(): Promise<void> {
  const res = await fetch(`${BASE}/api/goals/some-goal-id/research`);
  // Same env-token fallback caveat as testGoalsListNoAuth: missing Authorization
  // header may be satisfied by an env-based token, so 401/404/200 are all acceptable.
  if (res.status !== 401 && res.status !== 404 && res.status !== 200) {
    throw new Error(`Expected 401, 404, or 200 (env-token fallback), got ${res.status}`);
  }
}

async function testResearchGetNotFound(): Promise<void> {
  const res = await fetch(`${BASE}/api/goals/nonexistent-goal-id-99999/research`, {
    headers: testAuthHeaders(),
  });
  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  const data = await res.json();
  if (!data.error) throw new Error("Expected error message in 404 response");
}

async function testResearchGetEmptyForGoalWithNoItems(): Promise<void> {
  // Create a session so that the ownership check passes
  const sessionId = `test-research-empty-session-${Date.now()}`;
  const saveRes = await fetch(`${BASE}/api/sessions/${sessionId}/messages`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify({ messages: [{ role: "user", text: "research empty test" }] }),
  });
  if (!saveRes.ok) throw new Error(`Failed to seed session: HTTP ${saveRes.status}`);

  const goalId = `test-research-empty-goal-${Date.now()}`;
  const seedGoal = {
    id: goalId,
    sessionId,
    intent: "Test research empty",
    goal: "Verify empty research array",
    problemStatement: "No research items exist",
    businessValue: "Reliable API",
    targetOutcome: "Empty array returned",
    successCriteria: [],
    assumptions: [],
    constraints: [],
    risks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const seedRes = await fetch(`${BASE}/api/test/seed-goal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify(seedGoal),
  });
  if (!seedRes.ok) throw new Error(`Failed to seed goal: HTTP ${seedRes.status}`);

  const res = await fetch(`${BASE}/api/goals/${goalId}/research`, { headers: testAuthHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.research)) throw new Error("Expected research array in response");
  if (data.research.length !== 0) throw new Error(`Expected empty research array, got ${data.research.length}`);
  log("  ", "Research is empty for goal with no items");
}

async function testResearchSeedAndRetrieve(): Promise<void> {
  // Create a session so that the ownership check passes
  const sessionId = `test-research-session-${Date.now()}`;
  const saveRes = await fetch(`${BASE}/api/sessions/${sessionId}/messages`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify({ messages: [{ role: "user", text: "research seed test" }] }),
  });
  if (!saveRes.ok) throw new Error(`Failed to seed session: HTTP ${saveRes.status}`);

  const goalId = `test-research-goal-${Date.now()}`;
  const seedGoal = {
    id: goalId,
    sessionId,
    intent: "Test research retrieval",
    goal: "Verify research items are returned",
    problemStatement: "Need to test research endpoint",
    businessValue: "Reliable API",
    targetOutcome: "Research items returned",
    successCriteria: ["Items returned"],
    assumptions: [],
    constraints: [],
    risks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const goalSeedRes = await fetch(`${BASE}/api/test/seed-goal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify(seedGoal),
  });
  if (!goalSeedRes.ok) throw new Error(`Failed to seed goal: HTTP ${goalSeedRes.status}`);

  const itemId = `test-research-item-${Date.now()}`;
  const seedItem = {
    id: itemId,
    goalId,
    category: "domain",
    question: "What is the target domain?",
    status: "open",
    findings: "",
    decision: "",
  };
  const itemSeedRes = await fetch(`${BASE}/api/test/seed-research-item`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify(seedItem),
  });
  if (!itemSeedRes.ok) throw new Error(`Failed to seed research item: HTTP ${itemSeedRes.status}`);

  const res = await fetch(`${BASE}/api/goals/${goalId}/research`, { headers: testAuthHeaders() });
  if (!res.ok) throw new Error(`GET /api/goals/:id/research HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.research)) throw new Error("Expected research array in response");
  if (data.research.length !== 1) throw new Error(`Expected 1 research item, got ${data.research.length}`);
  if (data.research[0].id !== itemId) throw new Error(`Expected item id ${itemId}, got ${data.research[0].id}`);
  if (data.research[0].goalId !== goalId) throw new Error("Research item goalId mismatch");
  log("  ", `Research seed → get round-trip passed (id: ${itemId.slice(0, 16)}...)`);
}

// ============================================================
// 8. Milestone API endpoint tests (HTTP)
// ============================================================

async function testMilestonesGetNoAuthHeaderIsHandled(): Promise<void> {
  const res = await fetch(`${BASE}/api/goals/some-goal-id/milestones`);
  // Same env-token fallback caveat as testGoalsListNoAuth: missing Authorization
  // header may be satisfied by an env-based token, so 401/404/200 are all acceptable.
  if (res.status !== 401 && res.status !== 404 && res.status !== 200) {
    throw new Error(`Expected 401, 404, or 200 (env-token fallback), got ${res.status}`);
  }
}

async function testMilestonesGetNotFound(): Promise<void> {
  const res = await fetch(`${BASE}/api/goals/nonexistent-goal-id-99999/milestones`, {
    headers: testAuthHeaders(),
  });
  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  const data = await res.json();
  if (!data.error) throw new Error("Expected error message in 404 response");
}

async function testMilestonesGetEmptyForGoalWithNoMilestones(): Promise<void> {
  // Create a session so that the ownership check passes
  const sessionId = `test-milestones-empty-session-${Date.now()}`;
  const saveRes = await fetch(`${BASE}/api/sessions/${sessionId}/messages`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify({ messages: [{ role: "user", text: "milestones empty test" }] }),
  });
  if (!saveRes.ok) throw new Error(`Failed to seed session: HTTP ${saveRes.status}`);

  const goalId = `test-milestones-empty-goal-${Date.now()}`;
  const seedGoalBody = {
    id: goalId,
    sessionId,
    intent: "Test milestones empty",
    goal: "Verify empty milestones array",
    problemStatement: "No milestones exist",
    businessValue: "Reliable API",
    targetOutcome: "Empty array returned",
    successCriteria: [],
    assumptions: [],
    constraints: [],
    risks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const seedRes = await fetch(`${BASE}/api/test/seed-goal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify(seedGoalBody),
  });
  if (!seedRes.ok) throw new Error(`Failed to seed goal: HTTP ${seedRes.status}`);

  const res = await fetch(`${BASE}/api/goals/${goalId}/milestones`, { headers: testAuthHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.milestones)) throw new Error("Expected milestones array in response");
  if (data.milestones.length !== 0) throw new Error(`Expected empty milestones array, got ${data.milestones.length}`);
  log("  ", "Milestones is empty for goal with no milestones");
}

async function testMilestonesSeedAndRetrieve(): Promise<void> {
  // Create a session so that the ownership check passes
  const sessionId = `test-milestones-session-${Date.now()}`;
  const saveRes = await fetch(`${BASE}/api/sessions/${sessionId}/messages`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify({ messages: [{ role: "user", text: "milestones seed test" }] }),
  });
  if (!saveRes.ok) throw new Error(`Failed to seed session: HTTP ${saveRes.status}`);

  const goalId = `test-milestones-goal-${Date.now()}`;
  const seedGoalBody = {
    id: goalId,
    sessionId,
    intent: "Test milestones retrieval",
    goal: "Verify milestones are returned in order",
    problemStatement: "Need to test milestones endpoint",
    businessValue: "Reliable API",
    targetOutcome: "Milestones returned",
    successCriteria: ["Milestones returned"],
    assumptions: [],
    constraints: [],
    risks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const goalSeedRes = await fetch(`${BASE}/api/test/seed-goal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify(seedGoalBody),
  });
  if (!goalSeedRes.ok) throw new Error(`Failed to seed goal: HTTP ${goalSeedRes.status}`);

  // Seed two milestones in reverse order to verify ordering
  const ts = Date.now();
  const ms2Id = `test-milestone-2-${ts}-a`;
  const ms1Id = `test-milestone-1-${ts}-b`;

  const seedMs2Res = await fetch(`${BASE}/api/test/seed-milestone`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify({
      id: ms2Id,
      goalId,
      name: "Milestone 2",
      goal: "Second deliverable",
      scope: "Scope 2",
      order: 2,
      dependencies: [],
      acceptanceCriteria: ["done"],
      exitCriteria: [],
      status: "draft",
    }),
  });
  if (!seedMs2Res.ok) throw new Error(`Failed to seed milestone 2: HTTP ${seedMs2Res.status}`);

  const seedMs1Res = await fetch(`${BASE}/api/test/seed-milestone`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify({
      id: ms1Id,
      goalId,
      name: "Milestone 1",
      goal: "First deliverable",
      scope: "Scope 1",
      order: 1,
      dependencies: [],
      acceptanceCriteria: ["done"],
      exitCriteria: [],
      status: "draft",
    }),
  });
  if (!seedMs1Res.ok) throw new Error(`Failed to seed milestone 1: HTTP ${seedMs1Res.status}`);

  const res = await fetch(`${BASE}/api/goals/${goalId}/milestones`, { headers: testAuthHeaders() });
  if (!res.ok) throw new Error(`GET /api/goals/:id/milestones HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.milestones)) throw new Error("Expected milestones array in response");
  if (data.milestones.length !== 2) throw new Error(`Expected 2 milestones, got ${data.milestones.length}`);
  if (data.milestones[0].order !== 1) throw new Error(`Expected first milestone order 1, got ${data.milestones[0].order}`);
  if (data.milestones[1].order !== 2) throw new Error(`Expected second milestone order 2, got ${data.milestones[1].order}`);
  if (data.milestones[0].goalId !== goalId) throw new Error("Milestone goalId mismatch");
  log("  ", `Milestones seed → get round-trip passed (2 milestones in order)`);
}

// ============================================================
// 9. Issue Draft API endpoint tests (HTTP)
// ============================================================

async function testIssueDraftsGetNoAuthHeaderIsHandled(): Promise<void> {
  const res = await fetch(`${BASE}/api/milestones/some-milestone-id/issues`);
  // Same env-token fallback caveat as other no-auth tests: missing Authorization
  // header may be satisfied by an env-based token, so 401/404/200 are all acceptable.
  if (res.status !== 401 && res.status !== 404 && res.status !== 200) {
    throw new Error(`Expected 401, 404, or 200 (env-token fallback), got ${res.status}`);
  }
}

async function testIssueDraftsGetNotFound(): Promise<void> {
  const res = await fetch(`${BASE}/api/milestones/nonexistent-milestone-id-99999/issues`, {
    headers: testAuthHeaders(),
  });
  if (res.status !== 404) throw new Error(`Expected 404, got ${res.status}`);
  const data = await res.json();
  if (!data.error) throw new Error("Expected error message in 404 response");
}

async function testIssueDraftsGetEmptyForMilestoneWithNoIssues(): Promise<void> {
  // Create a session so that the ownership check passes
  const sessionId = `test-issues-empty-session-${Date.now()}`;
  const saveRes = await fetch(`${BASE}/api/sessions/${sessionId}/messages`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify({ messages: [{ role: "user", text: "issues empty test" }] }),
  });
  if (!saveRes.ok) throw new Error(`Failed to seed session: HTTP ${saveRes.status}`);

  const goalId = `test-issues-empty-goal-${Date.now()}`;
  const seedGoalBody = {
    id: goalId,
    sessionId,
    intent: "Test issues empty",
    goal: "Verify empty issues array",
    problemStatement: "No issue drafts exist",
    businessValue: "Reliable API",
    targetOutcome: "Empty array returned",
    successCriteria: [],
    assumptions: [],
    constraints: [],
    risks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const seedGoalRes = await fetch(`${BASE}/api/test/seed-goal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify(seedGoalBody),
  });
  if (!seedGoalRes.ok) throw new Error(`Failed to seed goal: HTTP ${seedGoalRes.status}`);

  const milestoneId = `test-issues-empty-milestone-${Date.now()}`;
  const seedMilestoneRes = await fetch(`${BASE}/api/test/seed-milestone`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify({
      id: milestoneId,
      goalId,
      name: "Empty Milestone",
      goal: "Milestone with no issues",
      scope: "None",
      order: 1,
      dependencies: [],
      acceptanceCriteria: ["done"],
      exitCriteria: [],
      status: "draft",
    }),
  });
  if (!seedMilestoneRes.ok) throw new Error(`Failed to seed milestone: HTTP ${seedMilestoneRes.status}`);

  const res = await fetch(`${BASE}/api/milestones/${milestoneId}/issues`, { headers: testAuthHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.issues)) throw new Error("Expected issues array in response");
  if (data.issues.length !== 0) throw new Error(`Expected empty issues array, got ${data.issues.length}`);
  log("  ", "Issues is empty for milestone with no drafts");
}

async function testIssueDraftsSeedAndRetrieve(): Promise<void> {
  // Create a session so that the ownership check passes
  const sessionId = `test-issues-session-${Date.now()}`;
  const saveRes = await fetch(`${BASE}/api/sessions/${sessionId}/messages`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify({ messages: [{ role: "user", text: "issues seed test" }] }),
  });
  if (!saveRes.ok) throw new Error(`Failed to seed session: HTTP ${saveRes.status}`);

  const goalId = `test-issues-goal-${Date.now()}`;
  const seedGoalBody = {
    id: goalId,
    sessionId,
    intent: "Test issues retrieval",
    goal: "Verify issue drafts are returned in order",
    problemStatement: "Need to test issues endpoint",
    businessValue: "Reliable API",
    targetOutcome: "Issue drafts returned",
    successCriteria: ["Drafts returned"],
    assumptions: [],
    constraints: [],
    risks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const goalSeedRes = await fetch(`${BASE}/api/test/seed-goal`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify(seedGoalBody),
  });
  if (!goalSeedRes.ok) throw new Error(`Failed to seed goal: HTTP ${goalSeedRes.status}`);

  const milestoneId = `test-issues-milestone-${Date.now()}`;
  const seedMilestoneRes = await fetch(`${BASE}/api/test/seed-milestone`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify({
      id: milestoneId,
      goalId,
      name: "Test Milestone",
      goal: "Milestone for issue drafts",
      scope: "Issue drafts",
      order: 1,
      dependencies: [],
      acceptanceCriteria: ["done"],
      exitCriteria: [],
      status: "draft",
    }),
  });
  if (!seedMilestoneRes.ok) throw new Error(`Failed to seed milestone: HTTP ${seedMilestoneRes.status}`);

  // Seed two issue drafts in reverse order to verify ordering
  const ts = Date.now();
  const draft2Id = `test-draft-2-${ts}`;
  const draft1Id = `test-draft-1-${ts}`;

  const commonDraftFields = {
    milestoneId,
    purpose: "Test purpose",
    problem: "Test problem",
    expectedOutcome: "Test outcome",
    scopeBoundaries: "In scope: everything",
    technicalContext: "No context",
    dependencies: [],
    acceptanceCriteria: ["Done"],
    testingExpectations: "Run tests",
    researchLinks: [],
    status: "draft" as const,
    filesToModify: [{ path: "server.ts", reason: "Add endpoint" }],
    filesToRead: [],
    securityChecklist: ["Check auth"],
    verificationCommands: ["npx tsc --noEmit"],
  };

  const seedDraft2Res = await fetch(`${BASE}/api/test/seed-issue-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify({ ...commonDraftFields, id: draft2Id, title: "Draft 2", order: 2 }),
  });
  if (!seedDraft2Res.ok) throw new Error(`Failed to seed draft 2: HTTP ${seedDraft2Res.status}`);

  const seedDraft1Res = await fetch(`${BASE}/api/test/seed-issue-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...testAuthHeaders() },
    body: JSON.stringify({ ...commonDraftFields, id: draft1Id, title: "Draft 1", order: 1 }),
  });
  if (!seedDraft1Res.ok) throw new Error(`Failed to seed draft 1: HTTP ${seedDraft1Res.status}`);

  const res = await fetch(`${BASE}/api/milestones/${milestoneId}/issues`, { headers: testAuthHeaders() });
  if (!res.ok) throw new Error(`GET /api/milestones/:id/issues HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.issues)) throw new Error("Expected issues array in response");
  if (data.issues.length !== 2) throw new Error(`Expected 2 issue drafts, got ${data.issues.length}`);
  if (data.issues[0].order !== 1) throw new Error(`Expected first draft order 1, got ${data.issues[0].order}`);
  if (data.issues[1].order !== 2) throw new Error(`Expected second draft order 2, got ${data.issues[1].order}`);
  if (data.issues[0].milestoneId !== milestoneId) throw new Error("IssueDraft milestoneId mismatch");
  log("  ", `Issue drafts seed → get round-trip passed (2 drafts in order)`);
}

// ============================================================
// Main
// ============================================================

async function main() {
  // Auth: uses COPILOT_GITHUB_TOKEN from .env if set, otherwise falls back to gh CLI auth

  console.log("═══════════════════════════════════════════════");
  console.log("  Copilot Chat — Integration Tests");
  console.log(`  Model: ${FREE_MODEL} (0x premium requests)`);
  console.log("═══════════════════════════════════════════════\n");

  // --- SDK tests ---
  console.log("── SDK Direct Tests ──\n");

  await run("SDK connect & ping", testSdkConnect);
  await run("SDK list models", testSdkListModels);
  await run("SDK chat (single turn)", testSdkChat);
  await run("SDK chat (multi-turn recall)", testSdkMultiTurn);

  // --- Server tests ---
  console.log("\n── Server API Tests ──\n");

  serverProcess = spawn("npx", ["tsx", "server.ts"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(PORT), ENABLE_GOAL_SEED: "true" },
    shell: true,
  });

  // Log server stderr for debugging
  serverProcess.stderr?.on("data", (chunk: Buffer) => {
    const msg = chunk.toString().trim();
    if (msg && !msg.includes("ExperimentalWarning")) {
      console.log(`  [server] ${msg}`);
    }
  });

  const ready = await waitForServer(20000);
  if (!ready) {
    log("✗", "Server failed to start within 15 seconds");
    serverProcess.kill();
    process.exit(1);
  }

  await run("Server health check", testServerHealth);
  await run("Server models endpoint", testServerModels);
  await run("Server chat (SSE streaming)", testServerChat);

  // --- Session persistence tests ---
  console.log("\n── Session Persistence Tests ──\n");

  await run("Health check includes storage field", testServerHealthStorage);
  await run("Sessions list endpoint", testServerSessionsList);
  await run("Session full lifecycle (create/save/list/get/delete)", testServerSessionPersistence);
  await run("Delete non-existent session returns 404", testServerSessionDeleteNotFound);

  // --- Phase 2 feature tests ---
  console.log("\n── Phase 2 Feature Tests ──\n");

  await run("Enhanced health check (Phase 1.6)", testServerHealthEnhanced);
  await run("Model switch returns 404 for unknown session", testServerModelSwitchNotFound);
  await run("Model switch validates required fields", testServerModelSwitchMissingFields);
  await run("Quota endpoint returns data", testServerQuotaEndpoint);
  await run("Quota endpoint handles no auth gracefully", testServerQuotaNoAuth);

  // --- Goal API tests ---
  console.log("\n── Goal API Tests ──\n");

  await run("GET /api/goals returns 401 without auth", testGoalsListNoAuth);
  await run("GET /api/goals returns empty array for new user", testGoalsListEmpty);
  await run("GET /api/goals/:id returns 404 for unknown goal", testGoalGetNotFound);
  await run("GET /api/goals/:id returns 401 without auth", testGoalGetNoAuth);
  await run("Goal seed → list → get round-trip", testGoalSeedAndRetrieve);

  // --- Research API tests ---
  console.log("\n── Research API Tests ──\n");

  await run("GET /api/goals/:id/research — no Authorization header is handled", testResearchGetNoAuthHeaderIsHandled);
  await run("GET /api/goals/:id/research returns 404 for unknown goal", testResearchGetNotFound);
  await run("GET /api/goals/:id/research returns empty array for goal with no items", testResearchGetEmptyForGoalWithNoItems);
  await run("Research seed → get round-trip", testResearchSeedAndRetrieve);

  // --- Milestone API tests ---
  console.log("\n── Milestone API Tests ──\n");

  await run("GET /api/goals/:id/milestones — no Authorization header is handled", testMilestonesGetNoAuthHeaderIsHandled);
  await run("GET /api/goals/:id/milestones returns 404 for unknown goal", testMilestonesGetNotFound);
  await run("GET /api/goals/:id/milestones returns empty array for goal with no milestones", testMilestonesGetEmptyForGoalWithNoMilestones);
  await run("Milestone seed → get round-trip (ordered)", testMilestonesSeedAndRetrieve);

  // --- Issue Draft API tests ---
  console.log("\n── Issue Draft API Tests ──\n");

  await run("GET /api/milestones/:id/issues — no Authorization header is handled", testIssueDraftsGetNoAuthHeaderIsHandled);
  await run("GET /api/milestones/:id/issues returns 404 for unknown milestone", testIssueDraftsGetNotFound);
  await run("GET /api/milestones/:id/issues returns empty array for milestone with no drafts", testIssueDraftsGetEmptyForMilestoneWithNoIssues);
  await run("Issue draft seed → get round-trip (ordered)", testIssueDraftsSeedAndRetrieve);

  // Cleanup
  serverProcess.kill();

  // --- Planning tools tests ---
  console.log("\n── Planning Tools Tests ──\n");

  await run("Planning tools: all 11 tools registered with correct names", testPlanningToolRegistration);
  await run("define_goal: returns structured template from raw intent", testDefineGoalReturnsTemplate);
  await run("define_goal: empty intent returns validation error", testDefineGoalEmptyIntentReturnsError);
  await run("save_goal: valid data returns goal with generated ID and timestamps", testSaveGoalValidDataReturnsGoalWithId);
  await run("save_goal: missing required string field returns validation error", testSaveGoalMissingRequiredFieldReturnsError);
  await run("save_goal: non-array successCriteria returns validation error", testSaveGoalArrayFieldNotArrayReturnsError);
  await run("get_goal: existing ID with correct sessionId returns correct goal", testGetGoalExistingIdReturnsGoal);
  await run("get_goal: wrong sessionId returns error (ownership check)", testGetGoalWrongSessionIdReturnsError);
  await run("get_goal: non-existent ID returns error", testGetGoalNonExistentIdReturnsError);
  await run("get_goal: empty goalId returns validation error", testGetGoalEmptyIdReturnsError);

  // --- Research tools tests ---
  console.log("\n── Research Tools Tests ──\n");

  await run("generate_research_checklist: returns 8 categorized items", testGenerateResearchChecklistReturns8Items);
  await run("generate_research_checklist: all items have 'open' status and correct goalId", testGenerateResearchChecklistAllItemsHaveOpenStatus);
  await run("generate_research_checklist: unknown goalId returns error", testGenerateResearchChecklistUnknownGoalReturnsError);
  await run("generate_research_checklist: wrong sessionId returns error", testGenerateResearchChecklistWrongSessionReturnsError);
  await run("update_research_item: open → researching transition succeeds", testUpdateResearchItemOpenToResearching);
  await run("update_research_item: resolving without findings returns error", testUpdateResearchItemResolvingRequiresFindings);
  await run("update_research_item: full open → researching → resolved lifecycle", testUpdateResearchItemFullLifecycle);
  await run("update_research_item: findings are sanitized before storage", testUpdateResearchItemSanitizesFindings);
  await run("update_research_item: invalid status transition returns error", testUpdateResearchItemInvalidStatusTransitionReturnsError);
  await run("update_research_item: invalid sourceUrl returns error", testUpdateResearchItemInvalidSourceUrlReturnsError);
  await run("update_research_item: valid sourceUrl is persisted", testUpdateResearchItemValidSourceUrlIsPersisted);
  await run("get_research: returns all items for goal", testGetResearchReturnsItems);
  await run("get_research: wrong sessionId returns error", testGetResearchWrongSessionReturnsError);
  await run("get_research: unknown goalId returns error", testGetResearchUnknownGoalReturnsError);

  // --- Milestone tools tests ---
  console.log("\n── Milestone Tools Tests ──\n");

  await run("create_milestone_plan: returns ordered milestones with resolved deps", testCreateMilestonePlanReturnsOrderedMilestones);
  await run("create_milestone_plan: circular dependency returns error", testCreateMilestonePlanCircularDependencyReturnsError);
  await run("create_milestone_plan: wrong sessionId returns error", testCreateMilestonePlanWrongSessionReturnsError);
  await run("create_milestone_plan: duplicate order values return error", testCreateMilestonePlanDuplicateOrderReturnsError);
  await run("create_milestone_plan: milestone name is sanitized", testCreateMilestonePlanNameIsSanitized);
  await run("update_milestone: fields are updated and returned", testUpdateMilestoneFieldsAreUpdated);
  await run("update_milestone: wrong sessionId returns error", testUpdateMilestoneWrongSessionReturnsError);
  await run("update_milestone: invalid status returns error", testUpdateMilestoneInvalidStatusReturnsError);
  await run("update_milestone: circular dependency in deps update returns error", testUpdateMilestoneCircularDependencyReturnsError);
  await run("get_milestones: returns milestones ordered by position", testGetMilestonesReturnsOrdered);
  await run("get_milestones: wrong sessionId returns error", testGetMilestonesWrongSessionReturnsError);
  await run("get_milestones: unknown goalId returns error", testGetMilestonesUnknownGoalReturnsError);
  await run("update_milestone: order collision returns error", testUpdateMilestoneOrderCollisionReturnsError);
  await run("create_milestone_plan: name exceeding max length after sanitization returns error", testCreateMilestonePlanNameLengthAfterSanitizationReturnsError);

  // --- generate_issue_drafts tests ---
  console.log("\n── generate_issue_drafts Tool Tests ──\n");

  await run("generate_issue_drafts: returns ordered issue drafts", testGenerateIssueDraftsReturnsOrderedDrafts);
  await run("generate_issue_drafts: R9 fields are present on created drafts", testGenerateIssueDraftsR9FieldsPresent);
  await run("generate_issue_drafts: dependency chain is resolved to IDs", testGenerateIssueDraftsDependencyChainRespected);
  await run("generate_issue_drafts: circular dependency returns error", testGenerateIssueDraftsCircularDependencyReturnsError);
  await run("generate_issue_drafts: wrong sessionId returns error", testGenerateIssueDraftsWrongSessionReturnsError);
  await run("generate_issue_drafts: unknown milestoneId returns error", testGenerateIssueDraftsUnknownMilestoneReturnsError);
  await run("generate_issue_drafts: >5 filesToModify returns R9 quality error", testGenerateIssueDraftsR9TooManyFilesToModifyReturnsError);
  await run("generate_issue_drafts: empty filesToModify returns error", testGenerateIssueDraftsMissingFilesToModifyReturnsError);
  await run("generate_issue_drafts: duplicate order values return error", testGenerateIssueDraftsDuplicateOrderReturnsError);
  await run("generate_issue_drafts: text fields are sanitized before storage", testGenerateIssueDraftsTextFieldsAreSanitized);
  await run("generate_issue_drafts: path traversal in filesToModify returns error", testGenerateIssueDraftsPathTraversalReturnsError);
  await run("generate_issue_drafts: empty verificationCommands returns error", testGenerateIssueDraftsMissingVerificationCommandsReturnsError);
  await run("generate_issue_drafts: researchLinks are persisted on draft", testGenerateIssueDraftsResearchLinksArePersistedOnDraft);

  // --- update_issue_draft tests ---
  console.log("\n── update_issue_draft Tool Tests ──\n");

  await run("update_issue_draft: fields are updated and returned", testUpdateIssueDraftFieldsAreUpdated);
  await run("update_issue_draft: wrong sessionId returns error", testUpdateIssueDraftWrongSessionReturnsError);
  await run("update_issue_draft: unknown draftId returns error", testUpdateIssueDraftNotFoundReturnsError);
  await run("update_issue_draft: invalid FileRef returns error", testUpdateIssueDraftFileRefValidationOnUpdate);
  await run("update_issue_draft: text fields are sanitized before storage", testUpdateIssueDraftTextFieldsAreSanitized);
  await run("update_issue_draft: invalid status returns error", testUpdateIssueDraftInvalidStatusReturnsError);
  await run("update_issue_draft: R9 fields can be updated", testUpdateIssueDraftR9FieldsCanBeUpdated);

  await run("create_github_milestone: GitHub tool names include new tool", testGithubToolRegistration);
  await run("create_github_milestone: creates new when none exists", testCreateGithubMilestoneCreatesNew);
  await run("create_github_milestone: idempotent when milestone exists on GitHub", testCreateGithubMilestoneIdempotentWhenExists);
  await run("create_github_milestone: accepts valid dueDate", testCreateGithubMilestoneWithDueDate);
  await run("create_github_milestone: invalid dueDate throws", testCreateGithubMilestoneInvalidDueDateThrows);
  await run("create_github_milestone: wrong sessionId throws", testCreateGithubMilestoneWrongSessionThrows);
  await run("create_github_milestone: empty owner throws", testCreateGithubMilestoneMissingOwnerThrows);
  await run("create_github_milestone: missing planningStore throws", testCreateGithubMilestoneWithoutPlanningStoreThrows);

  // --- Summary ---
  console.log("\n═══════════════════════════════════════════════");
  console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

main();
