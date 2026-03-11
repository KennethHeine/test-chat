import { InMemoryPlanningStore, AzurePlanningStore, createPlanningStore } from "./planning-store.js";
import type { PlanningStore } from "./planning-store.js";
import type { Goal, ResearchItem, Milestone, IssueDraft, FileRef } from "./planning-types.js";

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
// Fixtures
// ============================================================

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: "goal-1",
    sessionId: "session-1",
    intent: "Build a great product",
    goal: "Deliver a working MVP",
    problemStatement: "There is no current solution",
    businessValue: "Increases revenue",
    targetOutcome: "Happy customers",
    successCriteria: ["criterion 1"],
    assumptions: [],
    constraints: [],
    risks: [],
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeResearchItem(overrides: Partial<ResearchItem> = {}): ResearchItem {
  return {
    id: "ri-1",
    goalId: "goal-1",
    category: "architecture",
    question: "What framework should we use?",
    status: "open",
    findings: "",
    decision: "",
    ...overrides,
  };
}

function makeMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: "ms-1",
    goalId: "goal-1",
    name: "Milestone 1",
    goal: "Get the first feature shipped",
    scope: "Only includes auth, excludes payments",
    order: 1,
    dependencies: [],
    acceptanceCriteria: ["users can log in"],
    exitCriteria: [],
    status: "draft",
    ...overrides,
  };
}

function makeIssueDraft(overrides: Partial<IssueDraft> = {}): IssueDraft {
  return {
    id: "draft-1",
    milestoneId: "ms-1",
    title: "Implement login endpoint",
    purpose: "Allow users to authenticate",
    problem: "No authentication exists",
    expectedOutcome: "Users can log in",
    scopeBoundaries: "Login only, no SSO",
    technicalContext: "Use JWT",
    dependencies: [],
    acceptanceCriteria: ["returns 200 on valid creds"],
    testingExpectations: "Unit tests + integration tests",
    researchLinks: [],
    order: 1,
    status: "draft",
    filesToModify: [],
    filesToRead: [],
    securityChecklist: [],
    verificationCommands: [],
    ...overrides,
  };
}

// ============================================================
// Goal Tests
// ============================================================

async function testGoalCreateAndGet(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const goal = makeGoal();
  const created = await store.createGoal(goal);
  assert(created.id === "goal-1", "Created goal ID should match");
  const fetched = await store.getGoal("goal-1");
  assert(fetched !== null, "Should find the goal");
  assert(fetched!.intent === goal.intent, "Intent should match");
}

async function testGoalGetNotFound(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const result = await store.getGoal("nonexistent");
  assert(result === null, "Should return null for missing goal");
}

async function testGoalListEmpty(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const goals = await store.listGoals("session-1");
  assert(Array.isArray(goals), "Should return an array");
  assert(goals.length === 0, "Should be empty for new store");
}

async function testGoalCreateAndList(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createGoal(makeGoal({ id: "g1" }));
  const goals = await store.listGoals("session-1");
  assert(goals.length === 1, "Should have 1 goal");
  assert(goals[0].id === "g1", "Listed goal should match created");
}

async function testGoalUpdate(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createGoal(makeGoal());
  const updated = await store.updateGoal("goal-1", { intent: "New intent", updatedAt: "2025-06-01T00:00:00Z" });
  assert(updated !== null, "Update should succeed");
  assert(updated!.intent === "New intent", "Intent should be updated");
  assert(updated!.id === "goal-1", "ID should be unchanged");
  assert(updated!.createdAt === "2025-01-01T00:00:00Z", "createdAt should be unchanged");
}

async function testGoalUpdateNotFound(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const result = await store.updateGoal("nonexistent", { intent: "X" });
  assert(result === null, "Update on missing goal should return null");
}

async function testGoalDelete(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createGoal(makeGoal());
  const first = await store.deleteGoal("goal-1");
  assert(first === true, "First delete should return true");
  const second = await store.deleteGoal("goal-1");
  assert(second === false, "Second delete should return false");
  const fetched = await store.getGoal("goal-1");
  assert(fetched === null, "Goal should be gone after delete");
}

async function testGoalListScoping(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createGoal(makeGoal({ id: "g1", sessionId: "session-A" }));
  await store.createGoal(makeGoal({ id: "g2", sessionId: "session-B" }));
  const sessionA = await store.listGoals("session-A");
  const sessionB = await store.listGoals("session-B");
  assert(sessionA.length === 1, "Session A should have 1 goal");
  assert(sessionA[0].id === "g1", "Session A goal should be g1");
  assert(sessionB.length === 1, "Session B should have 1 goal");
  assert(sessionB[0].id === "g2", "Session B goal should be g2");
}

async function testGoalListOrdering(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  // Create in reverse order; list should sort by createdAt ascending
  await store.createGoal(makeGoal({ id: "g-late", sessionId: "s1", createdAt: "2025-06-01T00:00:00Z", updatedAt: "2025-06-01T00:00:00Z" }));
  await store.createGoal(makeGoal({ id: "g-early", sessionId: "s1", createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" }));
  const goals = await store.listGoals("s1");
  assert(goals[0].id === "g-early", "Earlier goal should be first");
  assert(goals[1].id === "g-late", "Later goal should be last");
}

// Validation
async function testGoalCreateMissingId(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  let threw = false;
  try {
    await store.createGoal(makeGoal({ id: "" }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for missing id");
}

async function testGoalCreateMissingSessionId(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  let threw = false;
  try {
    await store.createGoal(makeGoal({ sessionId: "" }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for missing sessionId");
}

async function testGoalCreateMissingIntent(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  let threw = false;
  try {
    await store.createGoal(makeGoal({ intent: "  " }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for whitespace-only intent");
}

// ============================================================
// ResearchItem Tests
// ============================================================

async function testResearchItemCreateAndGet(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const item = makeResearchItem();
  await store.createResearchItem(item);
  const fetched = await store.getResearchItem("ri-1");
  assert(fetched !== null, "Should find the research item");
  assert(fetched!.question === item.question, "Question should match");
}

async function testResearchItemGetNotFound(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const result = await store.getResearchItem("nonexistent");
  assert(result === null, "Should return null for missing item");
}

async function testResearchItemListEmpty(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const items = await store.listResearchItems("goal-1");
  assert(Array.isArray(items), "Should return an array");
  assert(items.length === 0, "Should be empty for new store");
}

async function testResearchItemCreateAndList(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createResearchItem(makeResearchItem());
  const items = await store.listResearchItems("goal-1");
  assert(items.length === 1, "Should have 1 item");
}

async function testResearchItemUpdate(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createResearchItem(makeResearchItem());
  const updated = await store.updateResearchItem("ri-1", { status: "resolved", findings: "Found it" });
  assert(updated !== null, "Update should succeed");
  assert(updated!.status === "resolved", "Status should be updated");
  assert(updated!.findings === "Found it", "Findings should be updated");
  assert(updated!.id === "ri-1", "ID should be unchanged");
  assert(updated!.goalId === "goal-1", "goalId should be unchanged");
}

async function testResearchItemUpdateNotFound(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const result = await store.updateResearchItem("nonexistent", { status: "resolved" });
  assert(result === null, "Update on missing item should return null");
}

async function testResearchItemDelete(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createResearchItem(makeResearchItem());
  const first = await store.deleteResearchItem("ri-1");
  assert(first === true, "First delete should return true");
  const second = await store.deleteResearchItem("ri-1");
  assert(second === false, "Second delete should return false");
}

async function testResearchItemListScoping(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createResearchItem(makeResearchItem({ id: "ri-a", goalId: "goal-A" }));
  await store.createResearchItem(makeResearchItem({ id: "ri-b", goalId: "goal-B" }));
  const itemsA = await store.listResearchItems("goal-A");
  const itemsB = await store.listResearchItems("goal-B");
  assert(itemsA.length === 1 && itemsA[0].id === "ri-a", "Goal A should only see its item");
  assert(itemsB.length === 1 && itemsB[0].id === "ri-b", "Goal B should only see its item");
}

// Validation
async function testResearchItemInvalidCategory(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  let threw = false;
  try {
    await store.createResearchItem(makeResearchItem({ category: "invalid" as any }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for invalid category");
}

async function testResearchItemInvalidStatus(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  let threw = false;
  try {
    await store.createResearchItem(makeResearchItem({ status: "done" as any }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for invalid status");
}

async function testResearchItemUpdateInvalidStatus(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createResearchItem(makeResearchItem());
  let threw = false;
  try {
    await store.updateResearchItem("ri-1", { status: "bad" as any });
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for invalid status on update");
}

// ============================================================
// Milestone Tests
// ============================================================

async function testMilestoneCreateAndGet(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createMilestone(makeMilestone());
  const fetched = await store.getMilestone("ms-1");
  assert(fetched !== null, "Should find the milestone");
  assert(fetched!.name === "Milestone 1", "Name should match");
}

async function testMilestoneGetNotFound(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const result = await store.getMilestone("nonexistent");
  assert(result === null, "Should return null for missing milestone");
}

async function testMilestoneListEmpty(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const milestones = await store.listMilestones("goal-1");
  assert(Array.isArray(milestones), "Should return an array");
  assert(milestones.length === 0, "Should be empty for new store");
}

async function testMilestoneCreateAndList(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createMilestone(makeMilestone());
  const milestones = await store.listMilestones("goal-1");
  assert(milestones.length === 1, "Should have 1 milestone");
}

async function testMilestoneUpdate(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createMilestone(makeMilestone());
  const updated = await store.updateMilestone("ms-1", { status: "ready", name: "Updated name" });
  assert(updated !== null, "Update should succeed");
  assert(updated!.status === "ready", "Status should be updated");
  assert(updated!.name === "Updated name", "Name should be updated");
  assert(updated!.id === "ms-1", "ID should be unchanged");
  assert(updated!.goalId === "goal-1", "goalId should be unchanged");
}

async function testMilestoneUpdateNotFound(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const result = await store.updateMilestone("nonexistent", { name: "X" });
  assert(result === null, "Update on missing milestone should return null");
}

async function testMilestoneDelete(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createMilestone(makeMilestone());
  const first = await store.deleteMilestone("ms-1");
  assert(first === true, "First delete should return true");
  const second = await store.deleteMilestone("ms-1");
  assert(second === false, "Second delete should return false");
  const fetched = await store.getMilestone("ms-1");
  assert(fetched === null, "Milestone should be gone after delete");
}

async function testMilestoneListScoping(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createMilestone(makeMilestone({ id: "ms-a", goalId: "goal-A" }));
  await store.createMilestone(makeMilestone({ id: "ms-b", goalId: "goal-B" }));
  const milestonesA = await store.listMilestones("goal-A");
  const milestonesB = await store.listMilestones("goal-B");
  assert(milestonesA.length === 1 && milestonesA[0].id === "ms-a", "Goal A should only see its milestone");
  assert(milestonesB.length === 1 && milestonesB[0].id === "ms-b", "Goal B should only see its milestone");
}

async function testMilestoneListOrdering(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createMilestone(makeMilestone({ id: "ms-3", goalId: "g1", order: 3 }));
  await store.createMilestone(makeMilestone({ id: "ms-1", goalId: "g1", order: 1 }));
  await store.createMilestone(makeMilestone({ id: "ms-2", goalId: "g1", order: 2 }));
  const milestones = await store.listMilestones("g1");
  assert(milestones[0].order === 1, "First milestone should have order 1");
  assert(milestones[1].order === 2, "Second milestone should have order 2");
  assert(milestones[2].order === 3, "Third milestone should have order 3");
}

// Validation
async function testMilestoneInvalidStatus(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  let threw = false;
  try {
    await store.createMilestone(makeMilestone({ status: "invalid" as any }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for invalid status");
}

async function testMilestoneNegativeOrder(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  let threwNegative = false;
  try {
    await store.createMilestone(makeMilestone({ order: -1 }));
  } catch {
    threwNegative = true;
  }
  assert(threwNegative, "Should throw for negative order");

  let threwZero = false;
  try {
    await store.createMilestone(makeMilestone({ order: 0 }));
  } catch {
    threwZero = true;
  }
  assert(threwZero, "Should throw for order = 0 (1-based)");
}

async function testMilestoneUpdateInvalidStatus(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createMilestone(makeMilestone());
  let threw = false;
  try {
    await store.updateMilestone("ms-1", { status: "invalid" as any });
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for invalid status on update");
}

// ============================================================
// IssueDraft Tests
// ============================================================

async function testIssueDraftCreateAndGet(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createIssueDraft(makeIssueDraft());
  const fetched = await store.getIssueDraft("draft-1");
  assert(fetched !== null, "Should find the issue draft");
  assert(fetched!.title === "Implement login endpoint", "Title should match");
}

async function testIssueDraftGetNotFound(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const result = await store.getIssueDraft("nonexistent");
  assert(result === null, "Should return null for missing draft");
}

async function testIssueDraftListEmpty(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const drafts = await store.listIssueDrafts("ms-1");
  assert(Array.isArray(drafts), "Should return an array");
  assert(drafts.length === 0, "Should be empty for new store");
}

async function testIssueDraftCreateAndList(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createIssueDraft(makeIssueDraft());
  const drafts = await store.listIssueDrafts("ms-1");
  assert(drafts.length === 1, "Should have 1 draft");
}

async function testIssueDraftUpdate(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createIssueDraft(makeIssueDraft());
  const updated = await store.updateIssueDraft("draft-1", { status: "ready", title: "Updated title" });
  assert(updated !== null, "Update should succeed");
  assert(updated!.status === "ready", "Status should be updated");
  assert(updated!.title === "Updated title", "Title should be updated");
  assert(updated!.id === "draft-1", "ID should be unchanged");
  assert(updated!.milestoneId === "ms-1", "milestoneId should be unchanged");
}

async function testIssueDraftUpdateNotFound(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const result = await store.updateIssueDraft("nonexistent", { title: "X" });
  assert(result === null, "Update on missing draft should return null");
}

async function testIssueDraftDelete(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createIssueDraft(makeIssueDraft());
  const first = await store.deleteIssueDraft("draft-1");
  assert(first === true, "First delete should return true");
  const second = await store.deleteIssueDraft("draft-1");
  assert(second === false, "Second delete should return false");
  const fetched = await store.getIssueDraft("draft-1");
  assert(fetched === null, "Draft should be gone after delete");
}

async function testIssueDraftListScoping(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createIssueDraft(makeIssueDraft({ id: "d-a", milestoneId: "ms-A" }));
  await store.createIssueDraft(makeIssueDraft({ id: "d-b", milestoneId: "ms-B" }));
  const draftsA = await store.listIssueDrafts("ms-A");
  const draftsB = await store.listIssueDrafts("ms-B");
  assert(draftsA.length === 1 && draftsA[0].id === "d-a", "Milestone A should only see its draft");
  assert(draftsB.length === 1 && draftsB[0].id === "d-b", "Milestone B should only see its draft");
}

async function testIssueDraftListOrdering(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createIssueDraft(makeIssueDraft({ id: "d-3", milestoneId: "ms-1", order: 3 }));
  await store.createIssueDraft(makeIssueDraft({ id: "d-1", milestoneId: "ms-1", order: 1 }));
  await store.createIssueDraft(makeIssueDraft({ id: "d-2", milestoneId: "ms-1", order: 2 }));
  const drafts = await store.listIssueDrafts("ms-1");
  assert(drafts[0].order === 1, "First draft should have order 1");
  assert(drafts[1].order === 2, "Second draft should have order 2");
  assert(drafts[2].order === 3, "Third draft should have order 3");
}

// Validation
async function testIssueDraftInvalidStatus(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  let threw = false;
  try {
    await store.createIssueDraft(makeIssueDraft({ status: "invalid" as any }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for invalid status");
}

async function testIssueDraftNegativeOrder(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  let threwNegative = false;
  try {
    await store.createIssueDraft(makeIssueDraft({ order: -5 }));
  } catch {
    threwNegative = true;
  }
  assert(threwNegative, "Should throw for negative order");

  let threwZero = false;
  try {
    await store.createIssueDraft(makeIssueDraft({ order: 0 }));
  } catch {
    threwZero = true;
  }
  assert(threwZero, "Should throw for order = 0 (1-based)");
}

async function testIssueDraftUpdateInvalidStatus(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createIssueDraft(makeIssueDraft());
  let threw = false;
  try {
    await store.updateIssueDraft("draft-1", { status: "invalid" as any });
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for invalid status on update");
}

async function testIssueDraftMissingTitle(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  let threw = false;
  try {
    await store.createIssueDraft(makeIssueDraft({ title: "" }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for empty title");
}

async function testIssueDraftFileRefEmptyPath(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const badRef: FileRef = { path: "", reason: "Some reason" };
  let threw = false;
  try {
    await store.createIssueDraft(makeIssueDraft({ filesToModify: [badRef] }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for filesToModify element with empty path");
}

async function testIssueDraftFileRefEmptyReason(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const badRef: FileRef = { path: "server.ts", reason: "" };
  let threw = false;
  try {
    await store.createIssueDraft(makeIssueDraft({ filesToModify: [badRef] }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for filesToModify element with empty reason");
}

async function testIssueDraftFilesToReadEmptyPath(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const badRef: FileRef = { path: "   ", reason: "Read for context" };
  let threw = false;
  try {
    await store.createIssueDraft(makeIssueDraft({ filesToRead: [badRef] }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for filesToRead element with whitespace-only path");
}

async function testIssueDraftFilesToReadEmptyReason(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const badRef: FileRef = { path: "tools.ts", reason: "  " };
  let threw = false;
  try {
    await store.createIssueDraft(makeIssueDraft({ filesToRead: [badRef] }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for filesToRead element with whitespace-only reason");
}

async function testIssueDraftValidFileRefs(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const modRef: FileRef = { path: "server.ts", reason: "Add new endpoint" };
  const readRef: FileRef = { path: "tools.ts", reason: "Follow existing pattern" };
  const draft = makeIssueDraft({
    filesToModify: [modRef],
    filesToRead: [readRef],
    patternReference: "tools.ts githubFetch()",
    securityChecklist: ["Validate input", "Check auth"],
    verificationCommands: ["npx tsc --noEmit", "npm test"],
  });
  const created = await store.createIssueDraft(draft);
  assert(created.filesToModify.length === 1, "Should store filesToModify");
  assert(created.filesToModify[0].path === "server.ts", "Should store filesToModify path");
  assert(created.filesToModify[0].reason === "Add new endpoint", "Should store filesToModify reason");
  assert(created.filesToRead.length === 1, "Should store filesToRead");
  assert(created.filesToRead[0].path === "tools.ts", "Should store filesToRead path");
  assert(created.filesToRead[0].reason === "Follow existing pattern", "Should store filesToRead reason");
  assert(created.patternReference === "tools.ts githubFetch()", "Should store patternReference");
  assert(created.securityChecklist.length === 2, "Should store securityChecklist");
  assert(created.verificationCommands.length === 2, "Should store verificationCommands");
}

async function testIssueDraftFileRefNonStringPath(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const badRef = { path: null as unknown as string, reason: "Some reason" };
  let threw = false;
  try {
    await store.createIssueDraft(makeIssueDraft({ filesToModify: [badRef] }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for filesToModify element with null path");
}

async function testIssueDraftFileRefNonStringReason(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const badRef = { path: "server.ts", reason: undefined as unknown as string };
  let threw = false;
  try {
    await store.createIssueDraft(makeIssueDraft({ filesToRead: [badRef] }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for filesToRead element with undefined reason");
}

async function testIssueDraftFileRefNullElement(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  let threw = false;
  try {
    await store.createIssueDraft(makeIssueDraft({ filesToModify: [null as unknown as FileRef] }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for filesToModify containing a null element");
}

async function testIssueDraftFilesToModifyNotArray(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  let threw = false;
  try {
    await store.createIssueDraft(makeIssueDraft({ filesToModify: null as unknown as FileRef[] }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw when filesToModify is not an array");
}

async function testIssueDraftFilesToReadNotArray(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  let threw = false;
  try {
    await store.createIssueDraft(makeIssueDraft({ filesToRead: "bad" as unknown as FileRef[] }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw when filesToRead is not an array");
}

async function testIssueDraftUpdateFileRefValidation(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createIssueDraft(makeIssueDraft());
  let threw = false;
  try {
    await store.updateIssueDraft("draft-1", {
      filesToModify: [{ path: "", reason: "reason" }],
    });
  } catch {
    threw = true;
  }
  assert(threw, "Should throw when updateIssueDraft receives filesToModify with empty path");
}

async function testIssueDraftUpdateFilesToReadNotArray(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  await store.createIssueDraft(makeIssueDraft());
  let threw = false;
  try {
    await store.updateIssueDraft("draft-1", {
      filesToRead: null as unknown as FileRef[],
    });
  } catch {
    threw = true;
  }
  assert(threw, "Should throw when updateIssueDraft receives non-array filesToRead");
}

// ============================================================
// Deep Copy / Isolation Tests
// ============================================================

async function testGoalArrayIsolation(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const goal = makeGoal({ successCriteria: ["original"] });
  const created = await store.createGoal(goal);
  // Mutating the returned copy should not affect stored state
  created.successCriteria.push("injected");
  const fetched = await store.getGoal("goal-1");
  assert(fetched!.successCriteria.length === 1, "Stored successCriteria should not be mutated via returned copy");
  // Mutating the original input should also not affect stored state
  goal.assumptions.push("injected");
  const fetched2 = await store.getGoal("goal-1");
  assert(fetched2!.assumptions.length === 0, "Stored assumptions should not be mutated via input reference");
}

async function testMilestoneArrayIsolation(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const milestone = makeMilestone({ acceptanceCriteria: ["criterion 1"], dependencies: [] });
  const created = await store.createMilestone(milestone);
  created.acceptanceCriteria.push("injected");
  const fetched = await store.getMilestone("ms-1");
  assert(fetched!.acceptanceCriteria.length === 1, "Stored acceptanceCriteria should not be mutated via returned copy");
}

async function testIssueDraftArrayIsolation(storeFactory: () => PlanningStore): Promise<void> {
  const store = storeFactory();
  const draft = makeIssueDraft({ dependencies: [], acceptanceCriteria: ["ac1"] });
  const created = await store.createIssueDraft(draft);
  created.dependencies.push("injected");
  const fetched = await store.getIssueDraft("draft-1");
  assert(fetched!.dependencies.length === 0, "Stored dependencies should not be mutated via returned copy");
}

// ============================================================
// Main
// ============================================================

async function runPlanningStoreTests(label: string, factory: () => PlanningStore) {
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`  PlanningStore — ${label}`);
  console.log(`═══════════════════════════════════════════════\n`);

  console.log("── Goal CRUD ──\n");
  await run("createGoal + getGoal round-trip", () => testGoalCreateAndGet(factory));
  await run("getGoal returns null for non-existent", () => testGoalGetNotFound(factory));
  await run("listGoals returns empty array for new store", () => testGoalListEmpty(factory));
  await run("createGoal + listGoals includes it", () => testGoalCreateAndList(factory));
  await run("updateGoal returns updated data", () => testGoalUpdate(factory));
  await run("updateGoal returns null for non-existent", () => testGoalUpdateNotFound(factory));
  await run("deleteGoal removes goal; second delete returns false", () => testGoalDelete(factory));
  await run("listGoals scoped by sessionId", () => testGoalListScoping(factory));
  await run("listGoals ordered by createdAt ascending", () => testGoalListOrdering(factory));

  console.log("\n── Goal Validation ──\n");
  await run("createGoal throws for missing id", () => testGoalCreateMissingId(factory));
  await run("createGoal throws for missing sessionId", () => testGoalCreateMissingSessionId(factory));
  await run("createGoal throws for whitespace-only intent", () => testGoalCreateMissingIntent(factory));

  console.log("\n── ResearchItem CRUD ──\n");
  await run("createResearchItem + getResearchItem round-trip", () => testResearchItemCreateAndGet(factory));
  await run("getResearchItem returns null for non-existent", () => testResearchItemGetNotFound(factory));
  await run("listResearchItems returns empty array for new store", () => testResearchItemListEmpty(factory));
  await run("createResearchItem + listResearchItems includes it", () => testResearchItemCreateAndList(factory));
  await run("updateResearchItem returns updated data", () => testResearchItemUpdate(factory));
  await run("updateResearchItem returns null for non-existent", () => testResearchItemUpdateNotFound(factory));
  await run("deleteResearchItem removes item; second delete returns false", () => testResearchItemDelete(factory));
  await run("listResearchItems scoped by goalId", () => testResearchItemListScoping(factory));

  console.log("\n── ResearchItem Validation ──\n");
  await run("createResearchItem throws for invalid category", () => testResearchItemInvalidCategory(factory));
  await run("createResearchItem throws for invalid status", () => testResearchItemInvalidStatus(factory));
  await run("updateResearchItem throws for invalid status", () => testResearchItemUpdateInvalidStatus(factory));

  console.log("\n── Milestone CRUD ──\n");
  await run("createMilestone + getMilestone round-trip", () => testMilestoneCreateAndGet(factory));
  await run("getMilestone returns null for non-existent", () => testMilestoneGetNotFound(factory));
  await run("listMilestones returns empty array for new store", () => testMilestoneListEmpty(factory));
  await run("createMilestone + listMilestones includes it", () => testMilestoneCreateAndList(factory));
  await run("updateMilestone returns updated data", () => testMilestoneUpdate(factory));
  await run("updateMilestone returns null for non-existent", () => testMilestoneUpdateNotFound(factory));
  await run("deleteMilestone removes milestone; second delete returns false", () => testMilestoneDelete(factory));
  await run("listMilestones scoped by goalId", () => testMilestoneListScoping(factory));
  await run("listMilestones ordered by order ascending", () => testMilestoneListOrdering(factory));

  console.log("\n── Milestone Validation ──\n");
  await run("createMilestone throws for invalid status", () => testMilestoneInvalidStatus(factory));
  await run("createMilestone throws for negative/zero order", () => testMilestoneNegativeOrder(factory));
  await run("updateMilestone throws for invalid status", () => testMilestoneUpdateInvalidStatus(factory));

  console.log("\n── IssueDraft CRUD ──\n");
  await run("createIssueDraft + getIssueDraft round-trip", () => testIssueDraftCreateAndGet(factory));
  await run("getIssueDraft returns null for non-existent", () => testIssueDraftGetNotFound(factory));
  await run("listIssueDrafts returns empty array for new store", () => testIssueDraftListEmpty(factory));
  await run("createIssueDraft + listIssueDrafts includes it", () => testIssueDraftCreateAndList(factory));
  await run("updateIssueDraft returns updated data", () => testIssueDraftUpdate(factory));
  await run("updateIssueDraft returns null for non-existent", () => testIssueDraftUpdateNotFound(factory));
  await run("deleteIssueDraft removes draft; second delete returns false", () => testIssueDraftDelete(factory));
  await run("listIssueDrafts scoped by milestoneId", () => testIssueDraftListScoping(factory));
  await run("listIssueDrafts ordered by order ascending", () => testIssueDraftListOrdering(factory));

  console.log("\n── IssueDraft Validation ──\n");
  await run("createIssueDraft throws for invalid status", () => testIssueDraftInvalidStatus(factory));
  await run("createIssueDraft throws for negative/zero order", () => testIssueDraftNegativeOrder(factory));
  await run("updateIssueDraft throws for invalid status", () => testIssueDraftUpdateInvalidStatus(factory));
  await run("createIssueDraft throws for empty title", () => testIssueDraftMissingTitle(factory));
  await run("createIssueDraft throws for filesToModify element with empty path", () => testIssueDraftFileRefEmptyPath(factory));
  await run("createIssueDraft throws for filesToModify element with empty reason", () => testIssueDraftFileRefEmptyReason(factory));
  await run("createIssueDraft throws for filesToRead element with whitespace-only path", () => testIssueDraftFilesToReadEmptyPath(factory));
  await run("createIssueDraft throws for filesToRead element with whitespace-only reason", () => testIssueDraftFilesToReadEmptyReason(factory));
  await run("createIssueDraft accepts valid FileRef arrays and stores all new fields", () => testIssueDraftValidFileRefs(factory));
  await run("createIssueDraft throws for filesToModify element with null path", () => testIssueDraftFileRefNonStringPath(factory));
  await run("createIssueDraft throws for filesToRead element with undefined reason", () => testIssueDraftFileRefNonStringReason(factory));
  await run("createIssueDraft throws for filesToModify containing a null element", () => testIssueDraftFileRefNullElement(factory));
  await run("createIssueDraft throws when filesToModify is not an array", () => testIssueDraftFilesToModifyNotArray(factory));
  await run("createIssueDraft throws when filesToRead is not an array", () => testIssueDraftFilesToReadNotArray(factory));
  await run("updateIssueDraft throws for filesToModify with invalid FileRef", () => testIssueDraftUpdateFileRefValidation(factory));
  await run("updateIssueDraft throws when filesToRead is not an array", () => testIssueDraftUpdateFilesToReadNotArray(factory));

  console.log("\n── Deep Copy / Isolation ──\n");
  await run("Goal array fields are deep-copied (structuredClone)", () => testGoalArrayIsolation(factory));
  await run("Milestone array fields are deep-copied (structuredClone)", () => testMilestoneArrayIsolation(factory));
  await run("IssueDraft array fields are deep-copied (structuredClone)", () => testIssueDraftArrayIsolation(factory));
}

async function main() {
  // Always run against InMemoryPlanningStore
  await runPlanningStoreTests("InMemoryPlanningStore", () => new InMemoryPlanningStore());

  // Run against AzurePlanningStore if AZURE_STORAGE_ACCOUNT_NAME is set
  const azureAccount = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  if (azureAccount) {
    console.log(`\nInitializing AzurePlanningStore for account: ${azureAccount}`);
    const azureStore = new AzurePlanningStore(azureAccount);
    try {
      await azureStore.initialize();
    } catch (err: any) {
      console.error(`Failed to initialize AzurePlanningStore: ${err.message}`);
      console.log("Skipping Azure tests.");
    }
    // Each test gets a fresh store instance (but backed by Azure tables; isolation via unique IDs in fixtures)
    await runPlanningStoreTests("AzurePlanningStore", () => new AzurePlanningStore(azureAccount));
  } else {
    console.log("\n(Skipping AzurePlanningStore tests — set AZURE_STORAGE_ACCOUNT_NAME to enable)");
  }

  const label = `createPlanningStore factory`;
  console.log(`\n── ${label} ──\n`);
  const memStore = createPlanningStore(undefined);
  await run("createPlanningStore() without accountName returns InMemoryPlanningStore", async () => {
    assert(memStore instanceof InMemoryPlanningStore, "Should return InMemoryPlanningStore when no accountName");
  });
  if (azureAccount) {
    const azStore = createPlanningStore(azureAccount);
    await run("createPlanningStore() with accountName returns AzurePlanningStore", async () => {
      assert(azStore instanceof AzurePlanningStore, "Should return AzurePlanningStore when accountName provided");
    });
  }

  console.log("\n═══════════════════════════════════════════════");
  console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

main();
