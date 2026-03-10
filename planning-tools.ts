// Planning tools for the next-version planning workflow.
// Provides tools that enable the Copilot agent to guide users through
// structured goal definition and research workflows.

import type { Tool } from "@github/copilot-sdk";
import type { PlanningStore } from "./planning-store.js";
import type { Goal, ResearchItem } from "./planning-types.js";

// --- Exported tool names for permission handler reference ---

export const PLANNING_TOOL_NAMES = [
  "define_goal",
  "save_goal",
  "get_goal",
  "generate_research_checklist",
  "update_research_item",
  "get_research",
] as const;

// --- Max field lengths (from planning-types.ts JSDoc) ---

const MAX_INTENT_LENGTH = 2000;
const MAX_GOAL_LENGTH = 500;
const MAX_PROBLEM_STATEMENT_LENGTH = 1000;
const MAX_BUSINESS_VALUE_LENGTH = 500;
const MAX_TARGET_OUTCOME_LENGTH = 500;
const MAX_SESSION_ID_LENGTH = 256;
const MAX_QUESTION_LENGTH = 500;
const MAX_FINDINGS_LENGTH = 2000;
const MAX_DECISION_LENGTH = 1000;
const MAX_ID_LENGTH = 256;

// --- Research category and status constants ---

const VALID_RESEARCH_CATEGORIES: ReadonlyArray<ResearchItem["category"]> = [
  "domain",
  "architecture",
  "security",
  "infrastructure",
  "integration",
  "data_model",
  "operational",
  "ux",
];

const VALID_RESEARCH_STATUSES: ReadonlyArray<ResearchItem["status"]> = [
  "open",
  "researching",
  "resolved",
];

// --- Validation helpers ---

/**
 * Validates a string field is a non-empty string within the max length.
 * Returns an error message string or null if valid.
 */
function validateStringField(value: unknown, fieldName: string, maxLength: number): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return `${fieldName} must be a non-empty string`;
  }
  if (value.length > maxLength) {
    return `${fieldName} must be at most ${maxLength} characters`;
  }
  return null;
}

/**
 * Sanitizes user-supplied text content by escaping HTML entities.
 * Prevents stored content from being interpreted as markup.
 */
function sanitizeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Generates a contextual research question for the given category and goal text.
 */
function generateQuestionForCategory(
  category: ResearchItem["category"],
  goalText: string
): string {
  const goalExcerpt = goalText.slice(0, 100);
  const templates: Record<ResearchItem["category"], string> = {
    domain: `What domain-specific concepts, terminology, and business rules are essential for: ${goalExcerpt}?`,
    architecture: `What architectural patterns and system design decisions are needed for: ${goalExcerpt}?`,
    security: `What security requirements, threat model, and access controls apply to: ${goalExcerpt}?`,
    infrastructure: `What hosting, deployment, and operational infrastructure is required for: ${goalExcerpt}?`,
    integration: `What external systems, APIs, or services need to integrate with: ${goalExcerpt}?`,
    data_model: `What data structures, storage design, and persistence strategy is needed for: ${goalExcerpt}?`,
    operational: `What monitoring, logging, alerting, and maintenance concerns apply to: ${goalExcerpt}?`,
    ux: `What user experience requirements, workflows, and interface design considerations apply to: ${goalExcerpt}?`,
  };
  return templates[category].slice(0, MAX_QUESTION_LENGTH);
}

// --- Tool factory ---

/**
 * Creates the planning tools bound to the provided planning store.
 * The token parameter is accepted for API consistency with createGitHubTools
 * and may be used by future tools that call GitHub APIs.
 *
 * @param token - The user's GitHub PAT (reserved for future use)
 * @param planningStore - The PlanningStore instance for persisting goals
 * @returns Array of Tool objects [defineGoal, saveGoal, getGoal, generateResearchChecklist, updateResearchItem, getResearch]
 */
export function createPlanningTools(token: string, planningStore: PlanningStore): Tool[] {
  /**
   * define_goal: Takes the user's raw description and returns a structured
   * goal template showing all required fields with placeholder prompts.
   * Helps the agent guide the user through goal articulation step by step.
   */
  const defineGoal: Tool = {
    name: "define_goal",
    description:
      "Create a structured goal template from the user's raw description of what they want to build. " +
      "Returns a template with all required fields and placeholder prompts so the agent can guide the " +
      "user to fill in each section before saving.",
    parameters: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          description: "The user's raw, unrefined description of what they want to achieve. Max 2000 chars.",
        },
      },
      required: ["intent"],
    },
    handler: async (args: any) => {
      const intentErr = validateStringField(args.intent, "intent", MAX_INTENT_LENGTH);
      if (intentErr) return { error: intentErr };

      return {
        template: {
          intent: args.intent,
          goal: "[Refined, actionable goal statement — max 500 chars]",
          problemStatement: "[Clear description of the problem this goal addresses — max 1000 chars]",
          businessValue: "[Business value delivered when this goal is achieved — max 500 chars]",
          targetOutcome: "[Desired end state once the goal has been met — max 500 chars]",
          successCriteria: ["[Measurable criterion 1]", "[Measurable criterion 2]"],
          assumptions: ["[Known assumption 1]"],
          constraints: ["[Known constraint 1]"],
          risks: ["[Identified risk 1]"],
        },
        instructions:
          "Fill in each field above based on conversation with the user. " +
          "When all fields are complete, use save_goal to persist the goal.",
      };
    },
  };

  /**
   * save_goal: Validates all required fields and persists the goal via PlanningStore.
   * Generates a UUID for the id and ISO 8601 timestamps for createdAt/updatedAt.
   * Returns the complete saved Goal object including the generated id.
   */
  const saveGoal: Tool = {
    name: "save_goal",
    description:
      "Validate all required fields and persist a structured goal to the planning store. " +
      "Generates a UUID and ISO 8601 timestamps automatically. " +
      "Returns the saved goal with its generated ID.",
    parameters: {
      type: "object",
      properties: {
        sessionId: {
          type: "string",
          description: "The session ID this goal belongs to.",
        },
        intent: {
          type: "string",
          description: "The user's raw description of what they want to achieve. Max 2000 chars.",
        },
        goal: {
          type: "string",
          description: "The refined, actionable goal statement. Max 500 chars.",
        },
        problemStatement: {
          type: "string",
          description: "Clear description of the problem this goal addresses. Max 1000 chars.",
        },
        businessValue: {
          type: "string",
          description: "Business value delivered when this goal is achieved. Max 500 chars.",
        },
        targetOutcome: {
          type: "string",
          description: "Desired end state once the goal has been met. Max 500 chars.",
        },
        successCriteria: {
          type: "array",
          items: { type: "string" },
          description: "Measurable criteria that confirm the goal has been successfully achieved.",
        },
        assumptions: {
          type: "array",
          items: { type: "string" },
          description: "Known assumptions accepted as true without verification.",
        },
        constraints: {
          type: "array",
          items: { type: "string" },
          description: "Known limitations or boundaries that constrain the implementation approach.",
        },
        risks: {
          type: "array",
          items: { type: "string" },
          description: "Identified risks that could prevent the goal from being achieved.",
        },
      },
      required: [
        "sessionId",
        "intent",
        "goal",
        "problemStatement",
        "businessValue",
        "targetOutcome",
        "successCriteria",
        "assumptions",
        "constraints",
        "risks",
      ],
    },
    handler: async (args: any) => {
      // Validate required string fields with max length limits
      const stringChecks: Array<[string, number]> = [
        ["sessionId", MAX_SESSION_ID_LENGTH],
        ["intent", MAX_INTENT_LENGTH],
        ["goal", MAX_GOAL_LENGTH],
        ["problemStatement", MAX_PROBLEM_STATEMENT_LENGTH],
        ["businessValue", MAX_BUSINESS_VALUE_LENGTH],
        ["targetOutcome", MAX_TARGET_OUTCOME_LENGTH],
      ];

      for (const [fieldName, maxLength] of stringChecks) {
        const err = validateStringField(args[fieldName], fieldName, maxLength);
        if (err) return { error: err };
      }

      // Validate array fields — each element must be a non-empty string with length limits
      const MAX_ARRAY_LENGTH = 50;
      const MAX_ELEMENT_LENGTH = 500;
      for (const arrayField of ["successCriteria", "assumptions", "constraints", "risks"] as const) {
        if (!Array.isArray(args[arrayField])) {
          return { error: `${arrayField} must be an array` };
        }
        if ((args[arrayField] as unknown[]).length > MAX_ARRAY_LENGTH) {
          return { error: `${arrayField} must have at most ${MAX_ARRAY_LENGTH} elements` };
        }
        for (let i = 0; i < (args[arrayField] as unknown[]).length; i++) {
          const element = (args[arrayField] as unknown[])[i];
          if (typeof element !== "string" || element.trim().length === 0) {
            return { error: `${arrayField}[${i}] must be a non-empty string` };
          }
          if (element.length > MAX_ELEMENT_LENGTH) {
            return { error: `${arrayField}[${i}] must be at most ${MAX_ELEMENT_LENGTH} characters` };
          }
        }
      }

      const now = new Date().toISOString();
      const goalToSave: Goal = {
        id: crypto.randomUUID(),
        sessionId: args.sessionId,
        intent: args.intent,
        goal: args.goal,
        problemStatement: args.problemStatement,
        businessValue: args.businessValue,
        targetOutcome: args.targetOutcome,
        successCriteria: args.successCriteria,
        assumptions: args.assumptions,
        constraints: args.constraints,
        risks: args.risks,
        createdAt: now,
        updatedAt: now,
      };

      try {
        const saved = await planningStore.createGoal(goalToSave);
        return { goal: saved };
      } catch (err: any) {
        return { error: err.message ?? "Failed to save goal" };
      }
    },
  };

  /**
   * get_goal: Retrieves a goal by its ID from the PlanningStore.
   * Requires the caller's sessionId to match the goal's sessionId, preventing
   * cross-session information disclosure.
   * Returns the Goal object, or "Goal not found" if the ID is missing or the
   * sessionId does not match.
   */
  const getGoal: Tool = {
    name: "get_goal",
    description:
      "Retrieve a saved goal by its ID from the planning store. " +
      "Requires sessionId to match the goal's owner session. " +
      "Returns the full Goal object or an error message if the ID is not found or access is denied.",
    parameters: {
      type: "object",
      properties: {
        goalId: {
          type: "string",
          description: "The unique identifier of the goal to retrieve.",
        },
        sessionId: {
          type: "string",
          description:
            "The session identifier of the caller. Must match the goal's sessionId or the goal will not be returned.",
        },
      },
      required: ["goalId", "sessionId"],
    },
    handler: async (args: any) => {
      const goalIdErr = validateStringField(args.goalId, "goalId", 256);
      if (goalIdErr) return { error: goalIdErr };

      const sessionIdErr = validateStringField(args.sessionId, "sessionId", MAX_SESSION_ID_LENGTH);
      if (sessionIdErr) return { error: sessionIdErr };

      const goal = await planningStore.getGoal(args.goalId);
      if (!goal || goal.sessionId !== args.sessionId) {
        // Do not reveal whether the goal exists if the sessionId does not match.
        return { error: `Goal not found: ${args.goalId}` };
      }
      return { goal };
    },
  };

  /**
   * generate_research_checklist: Analyzes a saved goal and produces one research
   * item per category (all 8 categories) with contextual questions derived from
   * the goal text. Persists items via PlanningStore.
   */
  const generateResearchChecklist: Tool = {
    name: "generate_research_checklist",
    description:
      "Analyze a saved goal and generate a structured research checklist covering all 8 categories: " +
      "domain, architecture, security, infrastructure, integration, data_model, operational, and ux. " +
      "Creates one research item per category with contextual questions derived from the goal. " +
      "Requires sessionId to match the goal's owner session.",
    parameters: {
      type: "object",
      properties: {
        goalId: {
          type: "string",
          description: "The unique identifier of the goal to generate research items for.",
        },
        sessionId: {
          type: "string",
          description:
            "The session identifier of the caller. Must match the goal's sessionId.",
        },
      },
      required: ["goalId", "sessionId"],
    },
    handler: async (args: any) => {
      const goalIdErr = validateStringField(args.goalId, "goalId", MAX_ID_LENGTH);
      if (goalIdErr) return { error: goalIdErr };

      const sessionIdErr = validateStringField(args.sessionId, "sessionId", MAX_SESSION_ID_LENGTH);
      if (sessionIdErr) return { error: sessionIdErr };

      const goal = await planningStore.getGoal(args.goalId);
      if (!goal || goal.sessionId !== args.sessionId) {
        return { error: `Goal not found: ${args.goalId}` };
      }

      // Idempotency: only create items for categories that don't already exist.
      // This handles both full re-invocation (all 8 present → return early) and
      // partial-failure recovery (some categories missing → fill in the gaps).
      const existing = await planningStore.listResearchItems(args.goalId);
      const existingCategories = new Set(existing.map((item) => item.category));
      const missingCategories = VALID_RESEARCH_CATEGORIES.filter(
        (c) => !existingCategories.has(c)
      );

      if (missingCategories.length === 0) {
        return { items: existing, count: existing.length, generatedAt: null, alreadyExisted: true };
      }

      const now = new Date().toISOString();
      const created: ResearchItem[] = [];

      for (const category of missingCategories) {
        const question = generateQuestionForCategory(category, goal.goal);
        const item: ResearchItem = {
          id: crypto.randomUUID(),
          goalId: goal.id,
          category,
          question,
          status: "open",
          findings: "",
          decision: "",
        };
        try {
          const saved = await planningStore.createResearchItem(item);
          created.push(saved);
        } catch (err: any) {
          return { error: `Failed to create research item for category "${category}": ${err.message ?? String(err)}` };
        }
      }

      const all = await planningStore.listResearchItems(args.goalId);
      return { items: all, count: all.length, generatedAt: now };
    },
  };

  /**
   * update_research_item: Updates the status, findings, and/or decision of a
   * research item. Sanitizes text content before persisting. Automatically sets
   * resolvedAt when status transitions to "resolved" and clears it when moving
   * to a non-resolved status.
   */
  const updateResearchItem: Tool = {
    name: "update_research_item",
    description:
      "Update the status, findings, and/or decision of an existing research item. " +
      "Transition status from 'open' → 'researching' → 'resolved'. " +
      "Requires sessionId to match the goal's owner session for access control. " +
      "Findings and decision text is sanitized before storage.",
    parameters: {
      type: "object",
      properties: {
        itemId: {
          type: "string",
          description: "The unique identifier of the research item to update.",
        },
        sessionId: {
          type: "string",
          description:
            "The session identifier of the caller. Must match the owning goal's sessionId.",
        },
        status: {
          type: "string",
          enum: ["open", "researching", "resolved"],
          description: "The new status for the research item.",
        },
        findings: {
          type: "string",
          description: "Findings gathered during investigation. Max 2000 chars.",
        },
        decision: {
          type: "string",
          description: "The decision or conclusion reached based on the findings. Max 1000 chars.",
        },
      },
      required: ["itemId", "sessionId"],
    },
    handler: async (args: any) => {
      const itemIdErr = validateStringField(args.itemId, "itemId", MAX_ID_LENGTH);
      if (itemIdErr) return { error: itemIdErr };

      const sessionIdErr = validateStringField(args.sessionId, "sessionId", MAX_SESSION_ID_LENGTH);
      if (sessionIdErr) return { error: sessionIdErr };

      // Verify ownership: get the item, then verify its goal belongs to this session
      const item = await planningStore.getResearchItem(args.itemId);
      if (!item) return { error: `Research item not found: ${args.itemId}` };

      const goal = await planningStore.getGoal(item.goalId);
      if (!goal || goal.sessionId !== args.sessionId) {
        return { error: `Research item not found: ${args.itemId}` };
      }

      // Validate optional fields
      if (args.status !== undefined) {
        if (!VALID_RESEARCH_STATUSES.includes(args.status)) {
          return { error: `status must be one of: ${VALID_RESEARCH_STATUSES.join(", ")}` };
        }
      }

      if (args.findings !== undefined) {
        if (typeof args.findings !== "string") return { error: "findings must be a string" };
        const sanitized = sanitizeText(args.findings);
        if (sanitized.length > MAX_FINDINGS_LENGTH) {
          return { error: `findings must be at most ${MAX_FINDINGS_LENGTH} characters after sanitization` };
        }
      }

      if (args.decision !== undefined) {
        if (typeof args.decision !== "string") return { error: "decision must be a string" };
        const sanitized = sanitizeText(args.decision);
        if (sanitized.length > MAX_DECISION_LENGTH) {
          return { error: `decision must be at most ${MAX_DECISION_LENGTH} characters after sanitization` };
        }
      }

      const updates: Partial<Omit<ResearchItem, "id" | "goalId">> = {};

      if (args.status !== undefined) {
        updates.status = args.status;
        if (args.status === "resolved") {
          updates.resolvedAt = new Date().toISOString();
        } else {
          // Clear resolvedAt when moving to a non-resolved status
          updates.resolvedAt = undefined;
        }
      }

      if (args.findings !== undefined) {
        updates.findings = sanitizeText(args.findings);
      }

      if (args.decision !== undefined) {
        updates.decision = sanitizeText(args.decision);
      }

      try {
        const updated = await planningStore.updateResearchItem(args.itemId, updates);
        if (!updated) return { error: `Research item not found: ${args.itemId}` };
        return { item: updated };
      } catch (err: any) {
        return { error: err.message ?? "Failed to update research item" };
      }
    },
  };

  /**
   * get_research: Retrieves all research items for a goal.
   * Requires sessionId to match the goal's owner session, preventing
   * cross-session information disclosure.
   */
  const getResearch: Tool = {
    name: "get_research",
    description:
      "Retrieve all research items for a goal as a flat list, along with a total count. " +
      "Requires sessionId to match the goal's owner session. " +
      "Returns the list of ResearchItems or an error if access is denied.",
    parameters: {
      type: "object",
      properties: {
        goalId: {
          type: "string",
          description: "The unique identifier of the goal whose research items to retrieve.",
        },
        sessionId: {
          type: "string",
          description:
            "The session identifier of the caller. Must match the goal's sessionId.",
        },
      },
      required: ["goalId", "sessionId"],
    },
    handler: async (args: any) => {
      const goalIdErr = validateStringField(args.goalId, "goalId", MAX_ID_LENGTH);
      if (goalIdErr) return { error: goalIdErr };

      const sessionIdErr = validateStringField(args.sessionId, "sessionId", MAX_SESSION_ID_LENGTH);
      if (sessionIdErr) return { error: sessionIdErr };

      const goal = await planningStore.getGoal(args.goalId);
      if (!goal || goal.sessionId !== args.sessionId) {
        return { error: `Goal not found: ${args.goalId}` };
      }

      const items = await planningStore.listResearchItems(args.goalId);
      return { items, count: items.length };
    },
  };

  return [defineGoal, saveGoal, getGoal, generateResearchChecklist, updateResearchItem, getResearch];
}
