// Planning data store for the next-version planning workflow.
// Follows the exact same pattern as AzureSessionStore in storage.ts.

import type { Goal, ResearchItem, Milestone, IssueDraft, FileRef } from "./planning-types.js";
import { TableClient } from "@azure/data-tables";
import type { TableEntity } from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";

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

// --- Azure table names ---

const PLAN_GOALS_TABLE = "plangoals";
const PLAN_RESEARCH_TABLE = "planresearch";
const PLAN_MILESTONES_TABLE = "planmilestones";
const PLAN_ISSUES_TABLE = "planissues";

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

function requireFileRef(ref: FileRef, fieldName: string): void {
  if (ref == null || typeof ref !== "object") {
    throw new Error(
      `Invalid ${fieldName}: each element must be a non-null object with path and reason`
    );
  }
  if (typeof ref.path !== "string" || ref.path.trim().length === 0) {
    throw new Error(`Invalid ${fieldName}: each element must have a non-empty path`);
  }
  if (typeof ref.reason !== "string" || ref.reason.trim().length === 0) {
    throw new Error(`Invalid ${fieldName}: each element must have a non-empty reason`);
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
  if (!Array.isArray(draft.filesToModify)) {
    throw new Error("Invalid filesToModify: must be an array of file refs");
  }
  for (const ref of draft.filesToModify) {
    requireFileRef(ref, "filesToModify");
  }
  if (!Array.isArray(draft.filesToRead)) {
    throw new Error("Invalid filesToRead: must be an array of file refs");
  }
  for (const ref of draft.filesToRead) {
    requireFileRef(ref, "filesToRead");
  }
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
    if (updates.filesToModify !== undefined) {
      if (!Array.isArray(updates.filesToModify)) {
        throw new Error("Invalid filesToModify: must be an array of file refs");
      }
      for (const ref of updates.filesToModify) {
        requireFileRef(ref, "filesToModify");
      }
    }
    if (updates.filesToRead !== undefined) {
      if (!Array.isArray(updates.filesToRead)) {
        throw new Error("Invalid filesToRead: must be an array of file refs");
      }
      for (const ref of updates.filesToRead) {
        requireFileRef(ref, "filesToRead");
      }
    }

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

// --- Azure serialization helpers ---

function escapeOData(value: string): string {
  // Escape single quotes for OData filter expressions (prevents injection)
  return value.replace(/'/g, "''");
}

function ignoreConflict(err: any): void {
  if (err?.statusCode !== 409) throw err;
}

function goalToEntity(goal: Goal): TableEntity<Record<string, unknown>> {
  return {
    partitionKey: goal.sessionId,
    rowKey: goal.id,
    intent: goal.intent,
    goal: goal.goal,
    problemStatement: goal.problemStatement,
    businessValue: goal.businessValue,
    targetOutcome: goal.targetOutcome,
    successCriteria: JSON.stringify(goal.successCriteria),
    assumptions: JSON.stringify(goal.assumptions),
    constraints: JSON.stringify(goal.constraints),
    risks: JSON.stringify(goal.risks),
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
}

function entityToGoal(entity: any): Goal {
  return {
    id: entity.rowKey as string,
    sessionId: entity.partitionKey as string,
    intent: entity.intent as string,
    goal: entity.goal as string,
    problemStatement: entity.problemStatement as string,
    businessValue: entity.businessValue as string,
    targetOutcome: entity.targetOutcome as string,
    successCriteria: JSON.parse(entity.successCriteria as string) as string[],
    assumptions: JSON.parse(entity.assumptions as string) as string[],
    constraints: JSON.parse(entity.constraints as string) as string[],
    risks: JSON.parse(entity.risks as string) as string[],
    createdAt: entity.createdAt as string,
    updatedAt: entity.updatedAt as string,
  };
}

function researchItemToEntity(item: ResearchItem): TableEntity<Record<string, unknown>> {
  return {
    partitionKey: item.goalId,
    rowKey: item.id,
    category: item.category,
    question: item.question,
    status: item.status,
    findings: item.findings,
    decision: item.decision,
    resolvedAt: item.resolvedAt ?? "",
    sourceUrl: item.sourceUrl ?? "",
  };
}

function entityToResearchItem(entity: any): ResearchItem {
  const item: ResearchItem = {
    id: entity.rowKey as string,
    goalId: entity.partitionKey as string,
    category: entity.category as ResearchItem["category"],
    question: entity.question as string,
    status: entity.status as ResearchItem["status"],
    findings: entity.findings as string,
    decision: entity.decision as string,
  };
  if (entity.resolvedAt) item.resolvedAt = entity.resolvedAt as string;
  if (entity.sourceUrl) item.sourceUrl = entity.sourceUrl as string;
  return item;
}

function milestoneToEntity(milestone: Milestone): TableEntity<Record<string, unknown>> {
  return {
    partitionKey: milestone.goalId,
    rowKey: milestone.id,
    name: milestone.name,
    goal: milestone.goal,
    scope: milestone.scope,
    order: milestone.order,
    dependencies: JSON.stringify(milestone.dependencies),
    acceptanceCriteria: JSON.stringify(milestone.acceptanceCriteria),
    exitCriteria: JSON.stringify(milestone.exitCriteria),
    status: milestone.status,
    githubNumber: milestone.githubNumber ?? 0,
    githubUrl: milestone.githubUrl ?? "",
  };
}

function entityToMilestone(entity: any): Milestone {
  const milestone: Milestone = {
    id: entity.rowKey as string,
    goalId: entity.partitionKey as string,
    name: entity.name as string,
    goal: entity.goal as string,
    scope: entity.scope as string,
    order: entity.order as number,
    dependencies: JSON.parse(entity.dependencies as string) as string[],
    acceptanceCriteria: JSON.parse(entity.acceptanceCriteria as string) as string[],
    exitCriteria: JSON.parse(entity.exitCriteria as string) as string[],
    status: entity.status as Milestone["status"],
  };
  if (entity.githubNumber) milestone.githubNumber = entity.githubNumber as number;
  if (entity.githubUrl) milestone.githubUrl = entity.githubUrl as string;
  return milestone;
}

function issueDraftToEntity(draft: IssueDraft): TableEntity<Record<string, unknown>> {
  return {
    partitionKey: draft.milestoneId,
    rowKey: draft.id,
    title: draft.title,
    purpose: draft.purpose,
    problem: draft.problem,
    expectedOutcome: draft.expectedOutcome,
    scopeBoundaries: draft.scopeBoundaries,
    technicalContext: draft.technicalContext,
    dependencies: JSON.stringify(draft.dependencies),
    acceptanceCriteria: JSON.stringify(draft.acceptanceCriteria),
    testingExpectations: draft.testingExpectations,
    researchLinks: JSON.stringify(draft.researchLinks),
    order: draft.order,
    status: draft.status,
    githubIssueNumber: draft.githubIssueNumber ?? 0,
    filesToModify: JSON.stringify(draft.filesToModify),
    filesToRead: JSON.stringify(draft.filesToRead),
    patternReference: draft.patternReference ?? "",
    securityChecklist: JSON.stringify(draft.securityChecklist),
    verificationCommands: JSON.stringify(draft.verificationCommands),
  };
}

function entityToIssueDraft(entity: any): IssueDraft {
  const draft: IssueDraft = {
    id: entity.rowKey as string,
    milestoneId: entity.partitionKey as string,
    title: entity.title as string,
    purpose: entity.purpose as string,
    problem: entity.problem as string,
    expectedOutcome: entity.expectedOutcome as string,
    scopeBoundaries: entity.scopeBoundaries as string,
    technicalContext: entity.technicalContext as string,
    dependencies: JSON.parse(entity.dependencies as string) as string[],
    acceptanceCriteria: JSON.parse(entity.acceptanceCriteria as string) as string[],
    testingExpectations: entity.testingExpectations as string,
    researchLinks: JSON.parse(entity.researchLinks as string) as string[],
    order: entity.order as number,
    status: entity.status as IssueDraft["status"],
    filesToModify: JSON.parse(entity.filesToModify as string) as FileRef[],
    filesToRead: JSON.parse(entity.filesToRead as string) as FileRef[],
    securityChecklist: JSON.parse(entity.securityChecklist as string) as string[],
    verificationCommands: JSON.parse(entity.verificationCommands as string) as string[],
  };
  if (entity.githubIssueNumber) draft.githubIssueNumber = entity.githubIssueNumber as number;
  if (entity.patternReference) draft.patternReference = entity.patternReference as string;
  return draft;
}

// --- AzurePlanningStore ---

export class AzurePlanningStore implements PlanningStore {
  private goalTable: TableClient;
  private researchTable: TableClient;
  private milestoneTable: TableClient;
  private issueDraftTable: TableClient;

  constructor(accountName: string) {
    const credential = new DefaultAzureCredential();
    const url = `https://${accountName}.table.core.windows.net`;
    this.goalTable = new TableClient(url, PLAN_GOALS_TABLE, credential);
    this.researchTable = new TableClient(url, PLAN_RESEARCH_TABLE, credential);
    this.milestoneTable = new TableClient(url, PLAN_MILESTONES_TABLE, credential);
    this.issueDraftTable = new TableClient(url, PLAN_ISSUES_TABLE, credential);
  }

  async initialize(): Promise<void> {
    await Promise.all([
      this.goalTable.createTable().catch(ignoreConflict),
      this.researchTable.createTable().catch(ignoreConflict),
      this.milestoneTable.createTable().catch(ignoreConflict),
      this.issueDraftTable.createTable().catch(ignoreConflict),
    ]);
  }

  // ── Goals ──────────────────────────────────────────────────────────────────

  async createGoal(goal: Goal): Promise<Goal> {
    validateGoal(goal);
    await this.goalTable.upsertEntity(goalToEntity(goal), "Merge");
    return structuredClone(goal);
  }

  async getGoal(goalId: string): Promise<Goal | null> {
    const safeId = escapeOData(goalId);
    const iter = this.goalTable.listEntities<any>({
      queryOptions: { filter: `RowKey eq '${safeId}'` },
    });
    for await (const entity of iter) {
      return entityToGoal(entity);
    }
    return null;
  }

  async updateGoal(
    goalId: string,
    updates: Partial<Omit<Goal, "id" | "createdAt">>
  ): Promise<Goal | null> {
    const existing = await this.getGoal(goalId);
    if (!existing) return null;

    if (updates.sessionId !== undefined) requireNonEmpty(updates.sessionId, "sessionId");
    if (updates.intent !== undefined) requireNonEmpty(updates.intent, "intent");
    if (updates.goal !== undefined) requireNonEmpty(updates.goal, "goal");
    if (updates.problemStatement !== undefined) requireNonEmpty(updates.problemStatement, "problemStatement");
    if (updates.businessValue !== undefined) requireNonEmpty(updates.businessValue, "businessValue");
    if (updates.targetOutcome !== undefined) requireNonEmpty(updates.targetOutcome, "targetOutcome");
    if (updates.updatedAt !== undefined) requireNonEmpty(updates.updatedAt, "updatedAt");

    const updated: Goal = { ...existing, ...updates, id: existing.id, createdAt: existing.createdAt };
    await this.goalTable.upsertEntity(goalToEntity(updated), "Merge");
    return structuredClone(updated);
  }

  async deleteGoal(goalId: string): Promise<boolean> {
    const existing = await this.getGoal(goalId);
    if (!existing) return false;
    await this.goalTable.deleteEntity(existing.sessionId, goalId);
    return true;
  }

  async listGoals(sessionId: string): Promise<Goal[]> {
    const result: Goal[] = [];
    const safeId = escapeOData(sessionId);
    const iter = this.goalTable.listEntities<any>({
      queryOptions: { filter: `PartitionKey eq '${safeId}'` },
    });
    for await (const entity of iter) {
      result.push(entityToGoal(entity));
    }
    result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return result;
  }

  // ── Research Items ─────────────────────────────────────────────────────────

  async createResearchItem(item: ResearchItem): Promise<ResearchItem> {
    validateResearchItem(item);
    await this.researchTable.upsertEntity(researchItemToEntity(item), "Merge");
    return structuredClone(item);
  }

  async getResearchItem(itemId: string): Promise<ResearchItem | null> {
    const safeId = escapeOData(itemId);
    const iter = this.researchTable.listEntities<any>({
      queryOptions: { filter: `RowKey eq '${safeId}'` },
    });
    for await (const entity of iter) {
      return entityToResearchItem(entity);
    }
    return null;
  }

  async updateResearchItem(
    itemId: string,
    updates: Partial<Omit<ResearchItem, "id" | "goalId">>
  ): Promise<ResearchItem | null> {
    const existing = await this.getResearchItem(itemId);
    if (!existing) return null;

    if (updates.category !== undefined) requireValidEnum(updates.category, VALID_RESEARCH_CATEGORIES, "category");
    if (updates.status !== undefined) requireValidEnum(updates.status, VALID_RESEARCH_STATUSES, "status");
    if (updates.question !== undefined) requireNonEmpty(updates.question, "question");

    const updated: ResearchItem = { ...existing, ...updates, id: existing.id, goalId: existing.goalId };
    await this.researchTable.upsertEntity(researchItemToEntity(updated), "Merge");
    return structuredClone(updated);
  }

  async deleteResearchItem(itemId: string): Promise<boolean> {
    const existing = await this.getResearchItem(itemId);
    if (!existing) return false;
    await this.researchTable.deleteEntity(existing.goalId, itemId);
    return true;
  }

  async listResearchItems(goalId: string): Promise<ResearchItem[]> {
    const result: ResearchItem[] = [];
    const safeId = escapeOData(goalId);
    const iter = this.researchTable.listEntities<any>({
      queryOptions: { filter: `PartitionKey eq '${safeId}'` },
    });
    for await (const entity of iter) {
      result.push(entityToResearchItem(entity));
    }
    return result;
  }

  // ── Milestones ─────────────────────────────────────────────────────────────

  async createMilestone(milestone: Milestone): Promise<Milestone> {
    validateMilestone(milestone);
    await this.milestoneTable.upsertEntity(milestoneToEntity(milestone), "Merge");
    return structuredClone(milestone);
  }

  async getMilestone(milestoneId: string): Promise<Milestone | null> {
    const safeId = escapeOData(milestoneId);
    const iter = this.milestoneTable.listEntities<any>({
      queryOptions: { filter: `RowKey eq '${safeId}'` },
    });
    for await (const entity of iter) {
      return entityToMilestone(entity);
    }
    return null;
  }

  async updateMilestone(
    milestoneId: string,
    updates: Partial<Omit<Milestone, "id" | "goalId">>
  ): Promise<Milestone | null> {
    const existing = await this.getMilestone(milestoneId);
    if (!existing) return null;

    if (updates.name !== undefined) requireNonEmpty(updates.name, "name");
    if (updates.goal !== undefined) requireNonEmpty(updates.goal, "goal");
    if (updates.scope !== undefined) requireNonEmpty(updates.scope, "scope");
    if (updates.order !== undefined) requirePositiveNumber(updates.order, "order");
    if (updates.status !== undefined) requireValidEnum(updates.status, VALID_MILESTONE_STATUSES, "status");

    const updated: Milestone = { ...existing, ...updates, id: existing.id, goalId: existing.goalId };
    await this.milestoneTable.upsertEntity(milestoneToEntity(updated), "Merge");
    return structuredClone(updated);
  }

  async deleteMilestone(milestoneId: string): Promise<boolean> {
    const existing = await this.getMilestone(milestoneId);
    if (!existing) return false;
    await this.milestoneTable.deleteEntity(existing.goalId, milestoneId);
    return true;
  }

  async listMilestones(goalId: string): Promise<Milestone[]> {
    const result: Milestone[] = [];
    const safeId = escapeOData(goalId);
    const iter = this.milestoneTable.listEntities<any>({
      queryOptions: { filter: `PartitionKey eq '${safeId}'` },
    });
    for await (const entity of iter) {
      result.push(entityToMilestone(entity));
    }
    result.sort((a, b) => a.order - b.order);
    return result;
  }

  // ── Issue Drafts ───────────────────────────────────────────────────────────

  async createIssueDraft(draft: IssueDraft): Promise<IssueDraft> {
    validateIssueDraft(draft);
    await this.issueDraftTable.upsertEntity(issueDraftToEntity(draft), "Merge");
    return structuredClone(draft);
  }

  async getIssueDraft(draftId: string): Promise<IssueDraft | null> {
    const safeId = escapeOData(draftId);
    const iter = this.issueDraftTable.listEntities<any>({
      queryOptions: { filter: `RowKey eq '${safeId}'` },
    });
    for await (const entity of iter) {
      return entityToIssueDraft(entity);
    }
    return null;
  }

  async updateIssueDraft(
    draftId: string,
    updates: Partial<Omit<IssueDraft, "id" | "milestoneId">>
  ): Promise<IssueDraft | null> {
    const existing = await this.getIssueDraft(draftId);
    if (!existing) return null;

    if (updates.title !== undefined) requireNonEmpty(updates.title, "title");
    if (updates.purpose !== undefined) requireNonEmpty(updates.purpose, "purpose");
    if (updates.problem !== undefined) requireNonEmpty(updates.problem, "problem");
    if (updates.expectedOutcome !== undefined) requireNonEmpty(updates.expectedOutcome, "expectedOutcome");
    if (updates.order !== undefined) requirePositiveNumber(updates.order, "order");
    if (updates.status !== undefined) requireValidEnum(updates.status, VALID_ISSUE_DRAFT_STATUSES, "status");
    if (updates.filesToModify !== undefined) {
      if (!Array.isArray(updates.filesToModify)) {
        throw new Error("Invalid filesToModify: must be an array of file refs");
      }
      for (const ref of updates.filesToModify) {
        requireFileRef(ref, "filesToModify");
      }
    }
    if (updates.filesToRead !== undefined) {
      if (!Array.isArray(updates.filesToRead)) {
        throw new Error("Invalid filesToRead: must be an array of file refs");
      }
      for (const ref of updates.filesToRead) {
        requireFileRef(ref, "filesToRead");
      }
    }

    const updated: IssueDraft = { ...existing, ...updates, id: existing.id, milestoneId: existing.milestoneId };
    await this.issueDraftTable.upsertEntity(issueDraftToEntity(updated), "Merge");
    return structuredClone(updated);
  }

  async deleteIssueDraft(draftId: string): Promise<boolean> {
    const existing = await this.getIssueDraft(draftId);
    if (!existing) return false;
    await this.issueDraftTable.deleteEntity(existing.milestoneId, draftId);
    return true;
  }

  async listIssueDrafts(milestoneId: string): Promise<IssueDraft[]> {
    const result: IssueDraft[] = [];
    const safeId = escapeOData(milestoneId);
    const iter = this.issueDraftTable.listEntities<any>({
      queryOptions: { filter: `PartitionKey eq '${safeId}'` },
    });
    for await (const entity of iter) {
      result.push(entityToIssueDraft(entity));
    }
    result.sort((a, b) => a.order - b.order);
    return result;
  }
}

// --- Factory ---

export function createPlanningStore(accountName?: string): PlanningStore {
  if (accountName) {
    return new AzurePlanningStore(accountName);
  }
  return new InMemoryPlanningStore();
}
