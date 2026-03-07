import { InMemorySessionStore, hashToken } from "./storage.js";
import type { SessionMetadata, ChatMessage } from "./storage.js";

let passed = 0;
let failed = 0;

function log(icon: string, msg: string) {
  console.log(`${icon} ${msg}`);
}

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

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// ============================================================
// Storage Unit Tests
// ============================================================

async function testHashToken(): Promise<void> {
  const hash1 = await hashToken("test-token-abc");
  const hash2 = await hashToken("test-token-abc");
  const hash3 = await hashToken("different-token");

  assert(typeof hash1 === "string", "Hash should be a string");
  assert(hash1.length === 64, `Hash should be 64 chars (SHA-256 hex), got ${hash1.length}`);
  assert(hash1 === hash2, "Same token should produce same hash");
  assert(hash1 !== hash3, "Different tokens should produce different hashes");
}

async function testListSessionsEmpty(): Promise<void> {
  const store = new InMemorySessionStore();
  const sessions = await store.listSessions("user1");
  assert(Array.isArray(sessions), "Should return an array");
  assert(sessions.length === 0, "Should be empty for new store");
}

async function testSaveAndGetSession(): Promise<void> {
  const store = new InMemorySessionStore();
  const meta: SessionMetadata = {
    id: "session-1",
    title: "Test session",
    model: "gpt-4.1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await store.saveSession("user1", meta);
  const retrieved = await store.getSession("user1", "session-1");

  assert(retrieved !== null, "Should find the session");
  assert(retrieved!.id === "session-1", "ID should match");
  assert(retrieved!.title === "Test session", "Title should match");
  assert(retrieved!.model === "gpt-4.1", "Model should match");
}

async function testGetSessionNotFound(): Promise<void> {
  const store = new InMemorySessionStore();
  const result = await store.getSession("user1", "nonexistent");
  assert(result === null, "Should return null for non-existent session");
}

async function testListSessionsSorted(): Promise<void> {
  const store = new InMemorySessionStore();

  await store.saveSession("user1", {
    id: "old",
    title: "Old session",
    model: "gpt-4.1",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  });

  await store.saveSession("user1", {
    id: "new",
    title: "New session",
    model: "gpt-4.1",
    createdAt: "2025-06-01T00:00:00Z",
    updatedAt: "2025-06-01T00:00:00Z",
  });

  const sessions = await store.listSessions("user1");
  assert(sessions.length === 2, "Should have 2 sessions");
  assert(sessions[0].id === "new", "Newest should be first");
  assert(sessions[1].id === "old", "Oldest should be last");
}

async function testListSessionsIsolation(): Promise<void> {
  const store = new InMemorySessionStore();

  await store.saveSession("user1", {
    id: "s1",
    title: "User1 session",
    model: "gpt-4.1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await store.saveSession("user2", {
    id: "s2",
    title: "User2 session",
    model: "gpt-4.1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const user1Sessions = await store.listSessions("user1");
  const user2Sessions = await store.listSessions("user2");

  assert(user1Sessions.length === 1, "User1 should have 1 session");
  assert(user2Sessions.length === 1, "User2 should have 1 session");
  assert(user1Sessions[0].id === "s1", "User1 should see their own session");
  assert(user2Sessions[0].id === "s2", "User2 should see their own session");
}

async function testDeleteSession(): Promise<void> {
  const store = new InMemorySessionStore();

  await store.saveSession("user1", {
    id: "s1",
    title: "To delete",
    model: "gpt-4.1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  await store.saveMessages("user1", "s1", [{ role: "user", text: "hello" }]);

  const deleted = await store.deleteSession("user1", "s1");
  assert(deleted === true, "Should return true for existing session");

  const session = await store.getSession("user1", "s1");
  assert(session === null, "Session should be gone after delete");

  const messages = await store.getMessages("user1", "s1");
  assert(messages.length === 0, "Messages should be gone after delete");
}

async function testDeleteNonexistent(): Promise<void> {
  const store = new InMemorySessionStore();
  const deleted = await store.deleteSession("user1", "nonexistent");
  assert(deleted === false, "Should return false for non-existent session");
}

async function testSaveAndGetMessages(): Promise<void> {
  const store = new InMemorySessionStore();
  const msgs: ChatMessage[] = [
    { role: "user", text: "Hello, how are you?" },
    { role: "assistant", text: "I'm doing well, thank you!" },
    { role: "user", text: "Great!" },
  ];

  await store.saveMessages("user1", "s1", msgs);
  const retrieved = await store.getMessages("user1", "s1");

  assert(retrieved.length === 3, "Should have 3 messages");
  assert(retrieved[0].role === "user", "First message should be user");
  assert(retrieved[0].text === "Hello, how are you?", "First message text should match");
  assert(retrieved[1].role === "assistant", "Second message should be assistant");
  assert(retrieved[2].role === "user", "Third message should be user");
}

async function testGetMessagesEmpty(): Promise<void> {
  const store = new InMemorySessionStore();
  const messages = await store.getMessages("user1", "nonexistent");
  assert(Array.isArray(messages), "Should return an array");
  assert(messages.length === 0, "Should be empty");
}

async function testUpdateSession(): Promise<void> {
  const store = new InMemorySessionStore();

  await store.saveSession("user1", {
    id: "s1",
    title: "Original title",
    model: "gpt-4.1",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  });

  await store.saveSession("user1", {
    id: "s1",
    title: "Updated title",
    model: "gpt-4.1",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-06-01T00:00:00Z",
  });

  const session = await store.getSession("user1", "s1");
  assert(session !== null, "Session should exist");
  assert(session!.title === "Updated title", "Title should be updated");
  assert(session!.updatedAt === "2025-06-01T00:00:00Z", "UpdatedAt should be updated");

  // Should still only have one session
  const sessions = await store.listSessions("user1");
  assert(sessions.length === 1, "Should not duplicate on update");
}

async function testOverwriteMessages(): Promise<void> {
  const store = new InMemorySessionStore();

  await store.saveMessages("user1", "s1", [{ role: "user", text: "first" }]);
  await store.saveMessages("user1", "s1", [
    { role: "user", text: "first" },
    { role: "assistant", text: "second" },
  ]);

  const messages = await store.getMessages("user1", "s1");
  assert(messages.length === 2, "Should overwrite, not append");
}

async function testSdkSessionIdPersistence(): Promise<void> {
  const store = new InMemorySessionStore();
  const meta: SessionMetadata = {
    id: "session-sdk-1",
    title: "SDK session test",
    model: "gpt-4.1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sdkSessionId: "sdk-abc-123",
  };

  await store.saveSession("user1", meta);
  const retrieved = await store.getSession("user1", "session-sdk-1");

  assert(retrieved !== null, "Should find the session");
  assert(retrieved!.sdkSessionId === "sdk-abc-123", "SDK session ID should persist");
}

async function testSdkSessionIdOptional(): Promise<void> {
  const store = new InMemorySessionStore();
  const meta: SessionMetadata = {
    id: "session-no-sdk",
    title: "No SDK ID",
    model: "gpt-4.1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await store.saveSession("user1", meta);
  const retrieved = await store.getSession("user1", "session-no-sdk");

  assert(retrieved !== null, "Should find the session");
  assert(retrieved!.sdkSessionId === undefined, "SDK session ID should be undefined when not set");
}

async function testSdkSessionIdUpdate(): Promise<void> {
  const store = new InMemorySessionStore();

  // Create without SDK session ID
  await store.saveSession("user1", {
    id: "s-update",
    title: "Update test",
    model: "gpt-4.1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Update with SDK session ID
  await store.saveSession("user1", {
    id: "s-update",
    title: "Update test",
    model: "gpt-4.1",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sdkSessionId: "sdk-new-id",
  });

  const session = await store.getSession("user1", "s-update");
  assert(session !== null, "Session should exist");
  assert(session!.sdkSessionId === "sdk-new-id", "SDK session ID should be updated");
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  Storage Module — Unit Tests");
  console.log("═══════════════════════════════════════════════\n");

  console.log("── Hash Token ──\n");
  await run("hashToken produces consistent SHA-256 hashes", testHashToken);

  console.log("\n── InMemorySessionStore ──\n");
  await run("listSessions returns empty array for new store", testListSessionsEmpty);
  await run("saveSession + getSession round-trip", testSaveAndGetSession);
  await run("getSession returns null for non-existent", testGetSessionNotFound);
  await run("listSessions sorts by updatedAt descending", testListSessionsSorted);
  await run("listSessions isolates users", testListSessionsIsolation);
  await run("deleteSession removes session and messages", testDeleteSession);
  await run("deleteSession returns false for non-existent", testDeleteNonexistent);
  await run("saveMessages + getMessages round-trip", testSaveAndGetMessages);
  await run("getMessages returns empty for non-existent", testGetMessagesEmpty);
  await run("saveSession updates existing session", testUpdateSession);
  await run("saveMessages overwrites existing messages", testOverwriteMessages);

  console.log("\n── SDK Session ID (Phase 2.3) ──\n");
  await run("sdkSessionId persists in session metadata", testSdkSessionIdPersistence);
  await run("sdkSessionId is optional", testSdkSessionIdOptional);
  await run("sdkSessionId can be updated", testSdkSessionIdUpdate);

  console.log("\n═══════════════════════════════════════════════");
  console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

main();
