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
// 5. Planning tools tests (direct handler invocation)
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
    env: { ...process.env, PORT: String(PORT) },
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

  // Cleanup
  serverProcess.kill();

  // --- Planning tools tests ---
  console.log("\n── Planning Tools Tests ──\n");

  await run("Planning tools: all 3 tools registered with correct names", testPlanningToolRegistration);
  await run("define_goal: returns structured template from raw intent", testDefineGoalReturnsTemplate);
  await run("define_goal: empty intent returns validation error", testDefineGoalEmptyIntentReturnsError);
  await run("save_goal: valid data returns goal with generated ID and timestamps", testSaveGoalValidDataReturnsGoalWithId);
  await run("save_goal: missing required string field returns validation error", testSaveGoalMissingRequiredFieldReturnsError);
  await run("save_goal: non-array successCriteria returns validation error", testSaveGoalArrayFieldNotArrayReturnsError);
  await run("get_goal: existing ID with correct sessionId returns correct goal", testGetGoalExistingIdReturnsGoal);
  await run("get_goal: wrong sessionId returns error (ownership check)", testGetGoalWrongSessionIdReturnsError);
  await run("get_goal: non-existent ID returns error", testGetGoalNonExistentIdReturnsError);
  await run("get_goal: empty goalId returns validation error", testGetGoalEmptyIdReturnsError);

  // --- Summary ---
  console.log("\n═══════════════════════════════════════════════");
  console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

main();
