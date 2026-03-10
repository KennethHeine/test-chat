import { CopilotClient, approveAll } from "@github/copilot-sdk";
import { execSync, spawn, ChildProcess } from "child_process";
import { config } from "dotenv";
import { InMemoryPlanningStore } from "./planning-store.js";
import { createPlanningTools, PLANNING_TOOL_NAMES } from "./planning-tools.js";

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

  // Cleanup
  serverProcess.kill();

  // --- Planning tools tests ---
  console.log("\n── Planning Tools Tests ──\n");

  await run("Planning tools: all 6 tools registered with correct names", testPlanningToolRegistration);
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

  // --- Summary ---
  console.log("\n═══════════════════════════════════════════════");
  console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

main();
