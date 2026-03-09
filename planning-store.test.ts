import { InMemoryPlanningStore } from "./planning-store.js";
import type { Goal, ResearchItem, Milestone, IssueDraft } from "./planning-types.js";

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
    ...overrides,
  };
}

// ============================================================
// Goal Tests
// ============================================================

async function testGoalCreateAndGet(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goal = makeGoal();
  const created = await store.createGoal(goal);
  assert(created.id === "goal-1", "Created goal ID should match");
  const fetched = await store.getGoal("goal-1");
  assert(fetched !== null, "Should find the goal");
  assert(fetched!.intent === goal.intent, "Intent should match");
}

async function testGoalGetNotFound(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const result = await store.getGoal("nonexistent");
  assert(result === null, "Should return null for missing goal");
}

async function testGoalListEmpty(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const goals = await store.listGoals("session-1");
  assert(Array.isArray(goals), "Should return an array");
  assert(goals.length === 0, "Should be empty for new store");
}

async function testGoalCreateAndList(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createGoal(makeGoal({ id: "g1" }));
  const goals = await store.listGoals("session-1");
  assert(goals.length === 1, "Should have 1 goal");
  assert(goals[0].id === "g1", "Listed goal should match created");
}

async function testGoalUpdate(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createGoal(makeGoal());
  const updated = await store.updateGoal("goal-1", { intent: "New intent", updatedAt: "2025-06-01T00:00:00Z" });
  assert(updated !== null, "Update should succeed");
  assert(updated!.intent === "New intent", "Intent should be updated");
  assert(updated!.id === "goal-1", "ID should be unchanged");
  assert(updated!.createdAt === "2025-01-01T00:00:00Z", "createdAt should be unchanged");
}

async function testGoalUpdateNotFound(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const result = await store.updateGoal("nonexistent", { intent: "X" });
  assert(result === null, "Update on missing goal should return null");
}

async function testGoalDelete(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createGoal(makeGoal());
  const first = await store.deleteGoal("goal-1");
  assert(first === true, "First delete should return true");
  const second = await store.deleteGoal("goal-1");
  assert(second === false, "Second delete should return false");
  const fetched = await store.getGoal("goal-1");
  assert(fetched === null, "Goal should be gone after delete");
}

async function testGoalListScoping(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createGoal(makeGoal({ id: "g1", sessionId: "session-A" }));
  await store.createGoal(makeGoal({ id: "g2", sessionId: "session-B" }));
  const sessionA = await store.listGoals("session-A");
  const sessionB = await store.listGoals("session-B");
  assert(sessionA.length === 1, "Session A should have 1 goal");
  assert(sessionA[0].id === "g1", "Session A goal should be g1");
  assert(sessionB.length === 1, "Session B should have 1 goal");
  assert(sessionB[0].id === "g2", "Session B goal should be g2");
}

async function testGoalListOrdering(): Promise<void> {
  const store = new InMemoryPlanningStore();
  // Create in reverse order; list should sort by createdAt ascending
  await store.createGoal(makeGoal({ id: "g-late", sessionId: "s1", createdAt: "2025-06-01T00:00:00Z", updatedAt: "2025-06-01T00:00:00Z" }));
  await store.createGoal(makeGoal({ id: "g-early", sessionId: "s1", createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" }));
  const goals = await store.listGoals("s1");
  assert(goals[0].id === "g-early", "Earlier goal should be first");
  assert(goals[1].id === "g-late", "Later goal should be last");
}

// Validation
async function testGoalCreateMissingId(): Promise<void> {
  const store = new InMemoryPlanningStore();
  let threw = false;
  try {
    await store.createGoal(makeGoal({ id: "" }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for missing id");
}

async function testGoalCreateMissingSessionId(): Promise<void> {
  const store = new InMemoryPlanningStore();
  let threw = false;
  try {
    await store.createGoal(makeGoal({ sessionId: "" }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for missing sessionId");
}

async function testGoalCreateMissingIntent(): Promise<void> {
  const store = new InMemoryPlanningStore();
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

async function testResearchItemCreateAndGet(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const item = makeResearchItem();
  await store.createResearchItem(item);
  const fetched = await store.getResearchItem("ri-1");
  assert(fetched !== null, "Should find the research item");
  assert(fetched!.question === item.question, "Question should match");
}

async function testResearchItemGetNotFound(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const result = await store.getResearchItem("nonexistent");
  assert(result === null, "Should return null for missing item");
}

async function testResearchItemListEmpty(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const items = await store.listResearchItems("goal-1");
  assert(Array.isArray(items), "Should return an array");
  assert(items.length === 0, "Should be empty for new store");
}

async function testResearchItemCreateAndList(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createResearchItem(makeResearchItem());
  const items = await store.listResearchItems("goal-1");
  assert(items.length === 1, "Should have 1 item");
}

async function testResearchItemUpdate(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createResearchItem(makeResearchItem());
  const updated = await store.updateResearchItem("ri-1", { status: "resolved", findings: "Found it" });
  assert(updated !== null, "Update should succeed");
  assert(updated!.status === "resolved", "Status should be updated");
  assert(updated!.findings === "Found it", "Findings should be updated");
  assert(updated!.id === "ri-1", "ID should be unchanged");
  assert(updated!.goalId === "goal-1", "goalId should be unchanged");
}

async function testResearchItemUpdateNotFound(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const result = await store.updateResearchItem("nonexistent", { status: "resolved" });
  assert(result === null, "Update on missing item should return null");
}

async function testResearchItemDelete(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createResearchItem(makeResearchItem());
  const first = await store.deleteResearchItem("ri-1");
  assert(first === true, "First delete should return true");
  const second = await store.deleteResearchItem("ri-1");
  assert(second === false, "Second delete should return false");
}

async function testResearchItemListScoping(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createResearchItem(makeResearchItem({ id: "ri-a", goalId: "goal-A" }));
  await store.createResearchItem(makeResearchItem({ id: "ri-b", goalId: "goal-B" }));
  const itemsA = await store.listResearchItems("goal-A");
  const itemsB = await store.listResearchItems("goal-B");
  assert(itemsA.length === 1 && itemsA[0].id === "ri-a", "Goal A should only see its item");
  assert(itemsB.length === 1 && itemsB[0].id === "ri-b", "Goal B should only see its item");
}

// Validation
async function testResearchItemInvalidCategory(): Promise<void> {
  const store = new InMemoryPlanningStore();
  let threw = false;
  try {
    await store.createResearchItem(makeResearchItem({ category: "invalid" as any }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for invalid category");
}

async function testResearchItemInvalidStatus(): Promise<void> {
  const store = new InMemoryPlanningStore();
  let threw = false;
  try {
    await store.createResearchItem(makeResearchItem({ status: "done" as any }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for invalid status");
}

async function testResearchItemUpdateInvalidStatus(): Promise<void> {
  const store = new InMemoryPlanningStore();
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

async function testMilestoneCreateAndGet(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createMilestone(makeMilestone());
  const fetched = await store.getMilestone("ms-1");
  assert(fetched !== null, "Should find the milestone");
  assert(fetched!.name === "Milestone 1", "Name should match");
}

async function testMilestoneGetNotFound(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const result = await store.getMilestone("nonexistent");
  assert(result === null, "Should return null for missing milestone");
}

async function testMilestoneListEmpty(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const milestones = await store.listMilestones("goal-1");
  assert(Array.isArray(milestones), "Should return an array");
  assert(milestones.length === 0, "Should be empty for new store");
}

async function testMilestoneCreateAndList(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createMilestone(makeMilestone());
  const milestones = await store.listMilestones("goal-1");
  assert(milestones.length === 1, "Should have 1 milestone");
}

async function testMilestoneUpdate(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createMilestone(makeMilestone());
  const updated = await store.updateMilestone("ms-1", { status: "ready", name: "Updated name" });
  assert(updated !== null, "Update should succeed");
  assert(updated!.status === "ready", "Status should be updated");
  assert(updated!.name === "Updated name", "Name should be updated");
  assert(updated!.id === "ms-1", "ID should be unchanged");
  assert(updated!.goalId === "goal-1", "goalId should be unchanged");
}

async function testMilestoneUpdateNotFound(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const result = await store.updateMilestone("nonexistent", { name: "X" });
  assert(result === null, "Update on missing milestone should return null");
}

async function testMilestoneDelete(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createMilestone(makeMilestone());
  const first = await store.deleteMilestone("ms-1");
  assert(first === true, "First delete should return true");
  const second = await store.deleteMilestone("ms-1");
  assert(second === false, "Second delete should return false");
  const fetched = await store.getMilestone("ms-1");
  assert(fetched === null, "Milestone should be gone after delete");
}

async function testMilestoneListScoping(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createMilestone(makeMilestone({ id: "ms-a", goalId: "goal-A" }));
  await store.createMilestone(makeMilestone({ id: "ms-b", goalId: "goal-B" }));
  const milestonesA = await store.listMilestones("goal-A");
  const milestonesB = await store.listMilestones("goal-B");
  assert(milestonesA.length === 1 && milestonesA[0].id === "ms-a", "Goal A should only see its milestone");
  assert(milestonesB.length === 1 && milestonesB[0].id === "ms-b", "Goal B should only see its milestone");
}

async function testMilestoneListOrdering(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createMilestone(makeMilestone({ id: "ms-3", goalId: "g1", order: 3 }));
  await store.createMilestone(makeMilestone({ id: "ms-1", goalId: "g1", order: 1 }));
  await store.createMilestone(makeMilestone({ id: "ms-2", goalId: "g1", order: 2 }));
  const milestones = await store.listMilestones("g1");
  assert(milestones[0].order === 1, "First milestone should have order 1");
  assert(milestones[1].order === 2, "Second milestone should have order 2");
  assert(milestones[2].order === 3, "Third milestone should have order 3");
}

// Validation
async function testMilestoneInvalidStatus(): Promise<void> {
  const store = new InMemoryPlanningStore();
  let threw = false;
  try {
    await store.createMilestone(makeMilestone({ status: "invalid" as any }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for invalid status");
}

async function testMilestoneNegativeOrder(): Promise<void> {
  const store = new InMemoryPlanningStore();
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

async function testMilestoneUpdateInvalidStatus(): Promise<void> {
  const store = new InMemoryPlanningStore();
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

async function testIssueDraftCreateAndGet(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createIssueDraft(makeIssueDraft());
  const fetched = await store.getIssueDraft("draft-1");
  assert(fetched !== null, "Should find the issue draft");
  assert(fetched!.title === "Implement login endpoint", "Title should match");
}

async function testIssueDraftGetNotFound(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const result = await store.getIssueDraft("nonexistent");
  assert(result === null, "Should return null for missing draft");
}

async function testIssueDraftListEmpty(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const drafts = await store.listIssueDrafts("ms-1");
  assert(Array.isArray(drafts), "Should return an array");
  assert(drafts.length === 0, "Should be empty for new store");
}

async function testIssueDraftCreateAndList(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createIssueDraft(makeIssueDraft());
  const drafts = await store.listIssueDrafts("ms-1");
  assert(drafts.length === 1, "Should have 1 draft");
}

async function testIssueDraftUpdate(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createIssueDraft(makeIssueDraft());
  const updated = await store.updateIssueDraft("draft-1", { status: "ready", title: "Updated title" });
  assert(updated !== null, "Update should succeed");
  assert(updated!.status === "ready", "Status should be updated");
  assert(updated!.title === "Updated title", "Title should be updated");
  assert(updated!.id === "draft-1", "ID should be unchanged");
  assert(updated!.milestoneId === "ms-1", "milestoneId should be unchanged");
}

async function testIssueDraftUpdateNotFound(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const result = await store.updateIssueDraft("nonexistent", { title: "X" });
  assert(result === null, "Update on missing draft should return null");
}

async function testIssueDraftDelete(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createIssueDraft(makeIssueDraft());
  const first = await store.deleteIssueDraft("draft-1");
  assert(first === true, "First delete should return true");
  const second = await store.deleteIssueDraft("draft-1");
  assert(second === false, "Second delete should return false");
  const fetched = await store.getIssueDraft("draft-1");
  assert(fetched === null, "Draft should be gone after delete");
}

async function testIssueDraftListScoping(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createIssueDraft(makeIssueDraft({ id: "d-a", milestoneId: "ms-A" }));
  await store.createIssueDraft(makeIssueDraft({ id: "d-b", milestoneId: "ms-B" }));
  const draftsA = await store.listIssueDrafts("ms-A");
  const draftsB = await store.listIssueDrafts("ms-B");
  assert(draftsA.length === 1 && draftsA[0].id === "d-a", "Milestone A should only see its draft");
  assert(draftsB.length === 1 && draftsB[0].id === "d-b", "Milestone B should only see its draft");
}

async function testIssueDraftListOrdering(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createIssueDraft(makeIssueDraft({ id: "d-3", milestoneId: "ms-1", order: 3 }));
  await store.createIssueDraft(makeIssueDraft({ id: "d-1", milestoneId: "ms-1", order: 1 }));
  await store.createIssueDraft(makeIssueDraft({ id: "d-2", milestoneId: "ms-1", order: 2 }));
  const drafts = await store.listIssueDrafts("ms-1");
  assert(drafts[0].order === 1, "First draft should have order 1");
  assert(drafts[1].order === 2, "Second draft should have order 2");
  assert(drafts[2].order === 3, "Third draft should have order 3");
}

// Validation
async function testIssueDraftInvalidStatus(): Promise<void> {
  const store = new InMemoryPlanningStore();
  let threw = false;
  try {
    await store.createIssueDraft(makeIssueDraft({ status: "invalid" as any }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for invalid status");
}

async function testIssueDraftNegativeOrder(): Promise<void> {
  const store = new InMemoryPlanningStore();
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

async function testIssueDraftUpdateInvalidStatus(): Promise<void> {
  const store = new InMemoryPlanningStore();
  await store.createIssueDraft(makeIssueDraft());
  let threw = false;
  try {
    await store.updateIssueDraft("draft-1", { status: "invalid" as any });
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for invalid status on update");
}

async function testIssueDraftMissingTitle(): Promise<void> {
  const store = new InMemoryPlanningStore();
  let threw = false;
  try {
    await store.createIssueDraft(makeIssueDraft({ title: "" }));
  } catch {
    threw = true;
  }
  assert(threw, "Should throw for empty title");
}

// ============================================================
// Deep Copy / Isolation Tests
// ============================================================

async function testGoalArrayIsolation(): Promise<void> {
  const store = new InMemoryPlanningStore();
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

async function testMilestoneArrayIsolation(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const milestone = makeMilestone({ acceptanceCriteria: ["criterion 1"], dependencies: [] });
  const created = await store.createMilestone(milestone);
  created.acceptanceCriteria.push("injected");
  const fetched = await store.getMilestone("ms-1");
  assert(fetched!.acceptanceCriteria.length === 1, "Stored acceptanceCriteria should not be mutated via returned copy");
}

async function testIssueDraftArrayIsolation(): Promise<void> {
  const store = new InMemoryPlanningStore();
  const draft = makeIssueDraft({ dependencies: [], acceptanceCriteria: ["ac1"] });
  const created = await store.createIssueDraft(draft);
  created.dependencies.push("injected");
  const fetched = await store.getIssueDraft("draft-1");
  assert(fetched!.dependencies.length === 0, "Stored dependencies should not be mutated via returned copy");
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  PlanningStore — Unit Tests");
  console.log("═══════════════════════════════════════════════\n");

  console.log("── Goal CRUD ──\n");
  await run("createGoal + getGoal round-trip", testGoalCreateAndGet);
  await run("getGoal returns null for non-existent", testGoalGetNotFound);
  await run("listGoals returns empty array for new store", testGoalListEmpty);
  await run("createGoal + listGoals includes it", testGoalCreateAndList);
  await run("updateGoal returns updated data", testGoalUpdate);
  await run("updateGoal returns null for non-existent", testGoalUpdateNotFound);
  await run("deleteGoal removes goal; second delete returns false", testGoalDelete);
  await run("listGoals scoped by sessionId", testGoalListScoping);
  await run("listGoals ordered by createdAt ascending", testGoalListOrdering);

  console.log("\n── Goal Validation ──\n");
  await run("createGoal throws for missing id", testGoalCreateMissingId);
  await run("createGoal throws for missing sessionId", testGoalCreateMissingSessionId);
  await run("createGoal throws for whitespace-only intent", testGoalCreateMissingIntent);

  console.log("\n── ResearchItem CRUD ──\n");
  await run("createResearchItem + getResearchItem round-trip", testResearchItemCreateAndGet);
  await run("getResearchItem returns null for non-existent", testResearchItemGetNotFound);
  await run("listResearchItems returns empty array for new store", testResearchItemListEmpty);
  await run("createResearchItem + listResearchItems includes it", testResearchItemCreateAndList);
  await run("updateResearchItem returns updated data", testResearchItemUpdate);
  await run("updateResearchItem returns null for non-existent", testResearchItemUpdateNotFound);
  await run("deleteResearchItem removes item; second delete returns false", testResearchItemDelete);
  await run("listResearchItems scoped by goalId", testResearchItemListScoping);

  console.log("\n── ResearchItem Validation ──\n");
  await run("createResearchItem throws for invalid category", testResearchItemInvalidCategory);
  await run("createResearchItem throws for invalid status", testResearchItemInvalidStatus);
  await run("updateResearchItem throws for invalid status", testResearchItemUpdateInvalidStatus);

  console.log("\n── Milestone CRUD ──\n");
  await run("createMilestone + getMilestone round-trip", testMilestoneCreateAndGet);
  await run("getMilestone returns null for non-existent", testMilestoneGetNotFound);
  await run("listMilestones returns empty array for new store", testMilestoneListEmpty);
  await run("createMilestone + listMilestones includes it", testMilestoneCreateAndList);
  await run("updateMilestone returns updated data", testMilestoneUpdate);
  await run("updateMilestone returns null for non-existent", testMilestoneUpdateNotFound);
  await run("deleteMilestone removes milestone; second delete returns false", testMilestoneDelete);
  await run("listMilestones scoped by goalId", testMilestoneListScoping);
  await run("listMilestones ordered by order ascending", testMilestoneListOrdering);

  console.log("\n── Milestone Validation ──\n");
  await run("createMilestone throws for invalid status", testMilestoneInvalidStatus);
  await run("createMilestone throws for negative/zero order", testMilestoneNegativeOrder);
  await run("updateMilestone throws for invalid status", testMilestoneUpdateInvalidStatus);

  console.log("\n── IssueDraft CRUD ──\n");
  await run("createIssueDraft + getIssueDraft round-trip", testIssueDraftCreateAndGet);
  await run("getIssueDraft returns null for non-existent", testIssueDraftGetNotFound);
  await run("listIssueDrafts returns empty array for new store", testIssueDraftListEmpty);
  await run("createIssueDraft + listIssueDrafts includes it", testIssueDraftCreateAndList);
  await run("updateIssueDraft returns updated data", testIssueDraftUpdate);
  await run("updateIssueDraft returns null for non-existent", testIssueDraftUpdateNotFound);
  await run("deleteIssueDraft removes draft; second delete returns false", testIssueDraftDelete);
  await run("listIssueDrafts scoped by milestoneId", testIssueDraftListScoping);
  await run("listIssueDrafts ordered by order ascending", testIssueDraftListOrdering);

  console.log("\n── IssueDraft Validation ──\n");
  await run("createIssueDraft throws for invalid status", testIssueDraftInvalidStatus);
  await run("createIssueDraft throws for negative/zero order", testIssueDraftNegativeOrder);
  await run("updateIssueDraft throws for invalid status", testIssueDraftUpdateInvalidStatus);
  await run("createIssueDraft throws for empty title", testIssueDraftMissingTitle);

  console.log("\n── Deep Copy / Isolation ──\n");
  await run("Goal array fields are deep-copied (structuredClone)", testGoalArrayIsolation);
  await run("Milestone array fields are deep-copied (structuredClone)", testMilestoneArrayIsolation);
  await run("IssueDraft array fields are deep-copied (structuredClone)", testIssueDraftArrayIsolation);

  console.log("\n═══════════════════════════════════════════════");
  console.log(`  ${passed + failed} tests: ${passed} passed, ${failed} failed`);
  console.log("═══════════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

main();
