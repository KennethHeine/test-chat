// Planning data store for the next-version planning workflow.
// Follows the exact same pattern as InMemorySessionStore in storage.ts.

import type { Goal, ResearchItem, Milestone, IssueDraft } from "./planning-types.js";

// --- Valid enum sets for validation ---

const VALID_RESEARCH_CATEGORIES: ReadonlySet<ResearchItem["category"]> = new Set([
  "domain",
  "architecture",
  "security",
  "infrastructure",
  "integration",
  "data_model",
  "operational",
  "ux",
]);

const VALID_RESEARCH_STATUSES: ReadonlySet<ResearchItem["status"]> = new Set([
  "open",
  "researching",
  "resolved",
]);

const VALID_MILESTONE_STATUSES: ReadonlySet<Milestone["status"]> = new Set([
  "draft",
  "ready",
  "in-progress",
  "complete",
]);

const VALID_ISSUE_DRAFT_STATUSES: ReadonlySet<IssueDraft["status"]> = new Set([
  "draft",
  "ready",
  "created",
]);

// --- PlanningStore interface ---

/**
 * Storage contract for all planning entities.
 * All methods are async to support future Azure Storage implementation.
 */
export interface PlanningStore {
  // ── Goals ──────────────────────────────────────────────────────────────────

  /** Persist a new Goal. Throws if required fields are missing or invalid. */
  createGoal(goal: Goal): Promise<Goal>;

  /** Retrieve a Goal by ID. Returns null if not found. */
  getGoal(goalId: string): Promise<Goal | null>;

  /**
   * Apply partial updates to a Goal. `id` and `createdAt` cannot be changed.
   * Returns null if the Goal does not exist.
   */
  updateGoal(
    goalId: string,
    updates: Partial<Omit<Goal, "id" | "createdAt">>
  ): Promise<Goal | null>;

  /** Remove a Goal. Returns true if it existed, false otherwise. */
  deleteGoal(goalId: string): Promise<boolean>;

  /** List all Goals belonging to a session, ordered by creation time ascending. */
  listGoals(sessionId: string): Promise<Goal[]>;

  // ── Research Items ─────────────────────────────────────────────────────────

  /** Persist a new ResearchItem. Throws if required fields are missing or invalid. */
  createResearchItem(item: ResearchItem): Promise<ResearchItem>;

  /** Retrieve a ResearchItem by ID. Returns null if not found. */
  getResearchItem(itemId: string): Promise<ResearchItem | null>;

  /**
   * Apply partial updates to a ResearchItem. `id` and `goalId` cannot be changed.
   * Returns null if the ResearchItem does not exist.
   */
  updateResearchItem(
    itemId: string,
    updates: Partial<Omit<ResearchItem, "id" | "goalId">>
  ): Promise<ResearchItem | null>;

  /** Remove a ResearchItem. Returns true if it existed, false otherwise. */
  deleteResearchItem(itemId: string): Promise<boolean>;

  /** List all ResearchItems belonging to a Goal. */
  listResearchItems(goalId: string): Promise<ResearchItem[]>;

  // ── Milestones ─────────────────────────────────────────────────────────────

  /** Persist a new Milestone. Throws if required fields are missing or invalid. */
  createMilestone(milestone: Milestone): Promise<Milestone>;

  /** Retrieve a Milestone by ID. Returns null if not found. */
  getMilestone(milestoneId: string): Promise<Milestone | null>;

  /**
   * Apply partial updates to a Milestone. `id` and `goalId` cannot be changed.
   * Returns null if the Milestone does not exist.
   */
  updateMilestone(
    milestoneId: string,
    updates: Partial<Omit<Milestone, "id" | "goalId">>
  ): Promise<Milestone | null>;

  /** Remove a Milestone. Returns true if it existed, false otherwise. */
  deleteMilestone(milestoneId: string): Promise<boolean>;

  /** List all Milestones belonging to a Goal, ordered by `order` ascending. */
  listMilestones(goalId: string): Promise<Milestone[]>;

  // ── Issue Drafts ───────────────────────────────────────────────────────────

  /** Persist a new IssueDraft. Throws if required fields are missing or invalid. */
  createIssueDraft(draft: IssueDraft): Promise<IssueDraft>;

  /** Retrieve an IssueDraft by ID. Returns null if not found. */
  getIssueDraft(draftId: string): Promise<IssueDraft | null>;

  /**
   * Apply partial updates to an IssueDraft. `id` and `milestoneId` cannot be changed.
   * Returns null if the IssueDraft does not exist.
   */
  updateIssueDraft(
    draftId: string,
    updates: Partial<Omit<IssueDraft, "id" | "milestoneId">>
  ): Promise<IssueDraft | null>;

  /** Remove an IssueDraft. Returns true if it existed, false otherwise. */
  deleteIssueDraft(draftId: string): Promise<boolean>;

  /** List all IssueDrafts belonging to a Milestone, ordered by `order` ascending. */
  listIssueDrafts(milestoneId: string): Promise<IssueDraft[]>;
}

// --- Validation helpers ---

function requireNonEmpty(value: string, fieldName: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${fieldName}: must be a non-empty string`);
  }
}

function requireValidEnum<T extends string>(
  value: T,
  allowed: ReadonlySet<T>,
  fieldName: string
): void {
  if (!allowed.has(value)) {
    throw new Error(
      `Invalid ${fieldName}: "${value}" is not one of [${[...allowed].join(", ")}]`
    );
  }
}

function requirePositiveNumber(value: number, fieldName: string): void {
  if (typeof value !== "number" || value < 1) {
    throw new Error(`Invalid ${fieldName}: must be a number >= 1`);
  }
}

function validateGoal(goal: Goal): void {
  requireNonEmpty(goal.id, "id");
  requireNonEmpty(goal.sessionId, "sessionId");
  requireNonEmpty(goal.intent, "intent");
  requireNonEmpty(goal.goal, "goal");
  requireNonEmpty(goal.problemStatement, "problemStatement");
  requireNonEmpty(goal.businessValue, "businessValue");
  requireNonEmpty(goal.targetOutcome, "targetOutcome");
  requireNonEmpty(goal.createdAt, "createdAt");
  requireNonEmpty(goal.updatedAt, "updatedAt");
}

function validateResearchItem(item: ResearchItem): void {
  requireNonEmpty(item.id, "id");
  requireNonEmpty(item.goalId, "goalId");
  requireValidEnum(item.category, VALID_RESEARCH_CATEGORIES, "category");
  requireNonEmpty(item.question, "question");
  requireValidEnum(item.status, VALID_RESEARCH_STATUSES, "status");
}

function validateMilestone(milestone: Milestone): void {
  requireNonEmpty(milestone.id, "id");
  requireNonEmpty(milestone.goalId, "goalId");
  requireNonEmpty(milestone.name, "name");
  requireNonEmpty(milestone.goal, "goal");
  requireNonEmpty(milestone.scope, "scope");
  requirePositiveNumber(milestone.order, "order");
  requireValidEnum(milestone.status, VALID_MILESTONE_STATUSES, "status");
}

function validateIssueDraft(draft: IssueDraft): void {
  requireNonEmpty(draft.id, "id");
  requireNonEmpty(draft.milestoneId, "milestoneId");
  requireNonEmpty(draft.title, "title");
  requireNonEmpty(draft.purpose, "purpose");
  requireNonEmpty(draft.problem, "problem");
  requireNonEmpty(draft.expectedOutcome, "expectedOutcome");
  requirePositiveNumber(draft.order, "order");
  requireValidEnum(draft.status, VALID_ISSUE_DRAFT_STATUSES, "status");
}

// --- InMemoryPlanningStore ---

export class InMemoryPlanningStore implements PlanningStore {
  private goals = new Map<string, Goal>();
  private researchItems = new Map<string, ResearchItem>();
  private milestones = new Map<string, Milestone>();
  private issueDrafts = new Map<string, IssueDraft>();

  // ── Goals ──────────────────────────────────────────────────────────────────

  async createGoal(goal: Goal): Promise<Goal> {
    validateGoal(goal);
    this.goals.set(goal.id, structuredClone(goal));
    return structuredClone(goal);
  }

  async getGoal(goalId: string): Promise<Goal | null> {
    const goal = this.goals.get(goalId);
    return goal ? structuredClone(goal) : null;
  }

  async updateGoal(
    goalId: string,
    updates: Partial<Omit<Goal, "id" | "createdAt">>
  ): Promise<Goal | null> {
    const existing = this.goals.get(goalId);
    if (!existing) return null;

    // Validate any enum/string fields present in the update
    if (updates.sessionId !== undefined) requireNonEmpty(updates.sessionId, "sessionId");
    if (updates.intent !== undefined) requireNonEmpty(updates.intent, "intent");
    if (updates.goal !== undefined) requireNonEmpty(updates.goal, "goal");
    if (updates.problemStatement !== undefined) requireNonEmpty(updates.problemStatement, "problemStatement");
    if (updates.businessValue !== undefined) requireNonEmpty(updates.businessValue, "businessValue");
    if (updates.targetOutcome !== undefined) requireNonEmpty(updates.targetOutcome, "targetOutcome");
    if (updates.updatedAt !== undefined) requireNonEmpty(updates.updatedAt, "updatedAt");

    const updated: Goal = { ...existing, ...updates, id: existing.id, createdAt: existing.createdAt };
    this.goals.set(goalId, updated);
    return structuredClone(updated);
  }

  async deleteGoal(goalId: string): Promise<boolean> {
    if (!this.goals.has(goalId)) return false;
    this.goals.delete(goalId);
    return true;
  }

  async listGoals(sessionId: string): Promise<Goal[]> {
    const result: Goal[] = [];
    for (const goal of this.goals.values()) {
      if (goal.sessionId === sessionId) result.push(structuredClone(goal));
    }
    result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return result;
  }

  // ── Research Items ─────────────────────────────────────────────────────────

  async createResearchItem(item: ResearchItem): Promise<ResearchItem> {
    validateResearchItem(item);
    this.researchItems.set(item.id, structuredClone(item));
    return structuredClone(item);
  }

  async getResearchItem(itemId: string): Promise<ResearchItem | null> {
    const item = this.researchItems.get(itemId);
    return item ? structuredClone(item) : null;
  }

  async updateResearchItem(
    itemId: string,
    updates: Partial<Omit<ResearchItem, "id" | "goalId">>
  ): Promise<ResearchItem | null> {
    const existing = this.researchItems.get(itemId);
    if (!existing) return null;

    if (updates.category !== undefined) requireValidEnum(updates.category, VALID_RESEARCH_CATEGORIES, "category");
    if (updates.status !== undefined) requireValidEnum(updates.status, VALID_RESEARCH_STATUSES, "status");
    if (updates.question !== undefined) requireNonEmpty(updates.question, "question");

    const updated: ResearchItem = { ...existing, ...updates, id: existing.id, goalId: existing.goalId };
    this.researchItems.set(itemId, updated);
    return structuredClone(updated);
  }

  async deleteResearchItem(itemId: string): Promise<boolean> {
    if (!this.researchItems.has(itemId)) return false;
    this.researchItems.delete(itemId);
    return true;
  }

  async listResearchItems(goalId: string): Promise<ResearchItem[]> {
    const result: ResearchItem[] = [];
    for (const item of this.researchItems.values()) {
      if (item.goalId === goalId) result.push(structuredClone(item));
    }
    return result;
  }

  // ── Milestones ─────────────────────────────────────────────────────────────

  async createMilestone(milestone: Milestone): Promise<Milestone> {
    validateMilestone(milestone);
    this.milestones.set(milestone.id, structuredClone(milestone));
    return structuredClone(milestone);
  }

  async getMilestone(milestoneId: string): Promise<Milestone | null> {
    const milestone = this.milestones.get(milestoneId);
    return milestone ? structuredClone(milestone) : null;
  }

  async updateMilestone(
    milestoneId: string,
    updates: Partial<Omit<Milestone, "id" | "goalId">>
  ): Promise<Milestone | null> {
    const existing = this.milestones.get(milestoneId);
    if (!existing) return null;

    if (updates.name !== undefined) requireNonEmpty(updates.name, "name");
    if (updates.goal !== undefined) requireNonEmpty(updates.goal, "goal");
    if (updates.scope !== undefined) requireNonEmpty(updates.scope, "scope");
    if (updates.order !== undefined) requirePositiveNumber(updates.order, "order");
    if (updates.status !== undefined) requireValidEnum(updates.status, VALID_MILESTONE_STATUSES, "status");

    const updated: Milestone = { ...existing, ...updates, id: existing.id, goalId: existing.goalId };
    this.milestones.set(milestoneId, updated);    return structuredClone(updated);
  }

  async deleteMilestone(milestoneId: string): Promise<boolean> {
    if (!this.milestones.has(milestoneId)) return false;
    this.milestones.delete(milestoneId);
    return true;
  }

  async listMilestones(goalId: string): Promise<Milestone[]> {
    const result: Milestone[] = [];
    for (const milestone of this.milestones.values()) {
      if (milestone.goalId === goalId) result.push(structuredClone(milestone));
    }
    result.sort((a, b) => a.order - b.order);
    return result;
  }

  // ── Issue Drafts ───────────────────────────────────────────────────────────

  async createIssueDraft(draft: IssueDraft): Promise<IssueDraft> {
    validateIssueDraft(draft);
    this.issueDrafts.set(draft.id, structuredClone(draft));
    return structuredClone(draft);
  }

  async getIssueDraft(draftId: string): Promise<IssueDraft | null> {
    const draft = this.issueDrafts.get(draftId);
    return draft ? structuredClone(draft) : null;
  }

  async updateIssueDraft(
    draftId: string,
    updates: Partial<Omit<IssueDraft, "id" | "milestoneId">>
  ): Promise<IssueDraft | null> {
    const existing = this.issueDrafts.get(draftId);
    if (!existing) return null;

    if (updates.title !== undefined) requireNonEmpty(updates.title, "title");
    if (updates.purpose !== undefined) requireNonEmpty(updates.purpose, "purpose");
    if (updates.problem !== undefined) requireNonEmpty(updates.problem, "problem");
    if (updates.expectedOutcome !== undefined) requireNonEmpty(updates.expectedOutcome, "expectedOutcome");
    if (updates.order !== undefined) requirePositiveNumber(updates.order, "order");
    if (updates.status !== undefined) requireValidEnum(updates.status, VALID_ISSUE_DRAFT_STATUSES, "status");

    const updated: IssueDraft = { ...existing, ...updates, id: existing.id, milestoneId: existing.milestoneId };
    this.issueDrafts.set(draftId, updated);    return structuredClone(updated);
  }

  async deleteIssueDraft(draftId: string): Promise<boolean> {
    if (!this.issueDrafts.has(draftId)) return false;
    this.issueDrafts.delete(draftId);
    return true;
  }

  async listIssueDrafts(milestoneId: string): Promise<IssueDraft[]> {
    const result: IssueDraft[] = [];
    for (const draft of this.issueDrafts.values()) {
      if (draft.milestoneId === milestoneId) result.push(structuredClone(draft));
    }
    result.sort((a, b) => a.order - b.order);
    return result;
  }
}
