// Planning tools for the next-version planning workflow.
// Provides six tools that enable the Copilot agent to guide users through
// structured goal definition and research: define_goal, save_goal, get_goal,
// generate_research_checklist, update_research_item, get_research.

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
const MAX_RESEARCH_QUESTION_LENGTH = 500;
const MAX_RESEARCH_FINDINGS_LENGTH = 2000;
const MAX_RESEARCH_DECISION_LENGTH = 1000;

// --- Valid enum values for research items ---

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

// --- Validation helper ---

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

// --- Sanitization helper ---

/**
 * Sanitizes a string by escaping HTML special characters to prevent injection.
 * Used for all user-provided text content before storage.
 */
function sanitizeString(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
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
   * generate_research_checklist: Accepts a list of categorized research questions
   * formulated by the agent, validates goal ownership, then persists all items to
   * the planning store. Requires at least one item per category across all 8
   * categories (domain, architecture, security, infrastructure, integration,
   * data_model, operational, ux).
   *
   * Security-category items are flagged in the response to indicate they require
   * human review before implementation proceeds.
   */
  const generateResearchChecklist: Tool = {
    name: "generate_research_checklist",
    description:
      "Generate and save a research checklist for a defined goal. " +
      "Provide research questions across all 8 categories: domain, architecture, security, " +
      "infrastructure, integration, data_model, operational, ux. " +
      "Items are saved to the planning store and returned with their generated IDs. " +
      "Security-category items are flagged for human review.",
    parameters: {
      type: "object",
      properties: {
        goalId: {
          type: "string",
          description: "The ID of the goal to generate research items for.",
        },
        sessionId: {
          type: "string",
          description: "The session ID of the caller. Must match the goal's sessionId.",
        },
        items: {
          type: "array",
          description:
            "The list of research questions to investigate before implementation. " +
            "Provide at least one item per category across all 8 categories.",
          items: {
            type: "object",
            properties: {
              category: {
                type: "string",
                description:
                  "The research category: domain, architecture, security, infrastructure, " +
                  "integration, data_model, operational, or ux.",
              },
              question: {
                type: "string",
                description: "The specific question to investigate. Max 500 chars.",
              },
            },
            required: ["category", "question"],
          },
        },
      },
      required: ["goalId", "sessionId", "items"],
    },
    handler: async (args: any) => {
      const goalIdErr = validateStringField(args.goalId, "goalId", 256);
      if (goalIdErr) return { error: goalIdErr };

      const sessionIdErr = validateStringField(args.sessionId, "sessionId", MAX_SESSION_ID_LENGTH);
      if (sessionIdErr) return { error: sessionIdErr };

      if (!Array.isArray(args.items) || args.items.length === 0) {
        return { error: "items must be a non-empty array" };
      }

      const MAX_ITEMS = 200;
      if (args.items.length > MAX_ITEMS) {
        return { error: `items must have at most ${MAX_ITEMS} elements` };
      }

      // Validate each item's category and question before touching the store
      for (let i = 0; i < args.items.length; i++) {
        const item = args.items[i];
        if (!item || typeof item !== "object") {
          return { error: `items[${i}] must be an object` };
        }
        if (!VALID_RESEARCH_CATEGORIES.has(item.category)) {
          return {
            error: `items[${i}].category "${item.category}" is not one of [${[...VALID_RESEARCH_CATEGORIES].join(", ")}]`,
          };
        }
        const questionErr = validateStringField(item.question, `items[${i}].question`, MAX_RESEARCH_QUESTION_LENGTH);
        if (questionErr) return { error: questionErr };
      }

      // Verify goal ownership
      const goal = await planningStore.getGoal(args.goalId);
      if (!goal || goal.sessionId !== args.sessionId) {
        return { error: `Goal not found: ${args.goalId}` };
      }

      // Create and persist each research item
      const savedItems: ResearchItem[] = [];
      const securityItemIds: string[] = [];

      for (const item of args.items) {
        const researchItem: ResearchItem = {
          id: crypto.randomUUID(),
          goalId: args.goalId,
          category: item.category as ResearchItem["category"],
          question: sanitizeString(item.question.trim()),
          status: "open",
          findings: "",
          decision: "",
        };

        try {
          const saved = await planningStore.createResearchItem(researchItem);
          savedItems.push(saved);
          if (saved.category === "security") {
            securityItemIds.push(saved.id);
          }
        } catch (err: any) {
          return { error: err.message ?? `Failed to save item at category ${item.category}` };
        }
      }

      const response: Record<string, unknown> = { items: savedItems, goalId: args.goalId };
      if (securityItemIds.length > 0) {
        response.securityReviewRequired = true;
        response.securityItemIds = securityItemIds;
        response.securityNote =
          "Security-category research items require human review before implementation proceeds.";
      }
      return response;
    },
  };

  /**
   * update_research_item: Updates the status and optionally the findings and decision
   * of a research item. Enforces session ownership and validates the transition.
   * When status is set to "resolved", a resolvedAt timestamp is automatically set.
   */
  const updateResearchItem: Tool = {
    name: "update_research_item",
    description:
      "Update the status, findings, and/or decision of a research item. " +
      "Transition: open → researching → resolved. " +
      "Requires goalId and sessionId to verify ownership. " +
      "When status is set to 'resolved', a resolvedAt timestamp is recorded automatically.",
    parameters: {
      type: "object",
      properties: {
        researchItemId: {
          type: "string",
          description: "The ID of the research item to update.",
        },
        goalId: {
          type: "string",
          description: "The ID of the goal this research item belongs to.",
        },
        sessionId: {
          type: "string",
          description: "The session ID of the caller. Must match the goal's sessionId.",
        },
        status: {
          type: "string",
          description: "The new status: open, researching, or resolved.",
        },
        findings: {
          type: "string",
          description:
            "The findings gathered during investigation. Required when transitioning to resolved. Max 2000 chars.",
        },
        decision: {
          type: "string",
          description:
            "The decision or conclusion based on the findings. Optional. Max 1000 chars.",
        },
      },
      required: ["researchItemId", "goalId", "sessionId", "status"],
    },
    handler: async (args: any) => {
      const researchItemIdErr = validateStringField(args.researchItemId, "researchItemId", 256);
      if (researchItemIdErr) return { error: researchItemIdErr };

      const goalIdErr = validateStringField(args.goalId, "goalId", 256);
      if (goalIdErr) return { error: goalIdErr };

      const sessionIdErr = validateStringField(args.sessionId, "sessionId", MAX_SESSION_ID_LENGTH);
      if (sessionIdErr) return { error: sessionIdErr };

      if (!VALID_RESEARCH_STATUSES.has(args.status)) {
        return {
          error: `status "${args.status}" is not one of [${[...VALID_RESEARCH_STATUSES].join(", ")}]`,
        };
      }

      // Validate optional fields when present
      if (args.findings !== undefined) {
        if (typeof args.findings !== "string") {
          return { error: "findings must be a string" };
        }
        if (args.findings.length > MAX_RESEARCH_FINDINGS_LENGTH) {
          return { error: `findings must be at most ${MAX_RESEARCH_FINDINGS_LENGTH} characters` };
        }
      }

      if (args.decision !== undefined) {
        if (typeof args.decision !== "string") {
          return { error: "decision must be a string" };
        }
        if (args.decision.length > MAX_RESEARCH_DECISION_LENGTH) {
          return { error: `decision must be at most ${MAX_RESEARCH_DECISION_LENGTH} characters` };
        }
      }

      // Verify goal ownership
      const goal = await planningStore.getGoal(args.goalId);
      if (!goal || goal.sessionId !== args.sessionId) {
        return { error: `Goal not found: ${args.goalId}` };
      }

      // Verify the research item exists and belongs to the goal
      const existing = await planningStore.getResearchItem(args.researchItemId);
      if (!existing || existing.goalId !== args.goalId) {
        return { error: `Research item not found: ${args.researchItemId}` };
      }

      const updates: Partial<Omit<ResearchItem, "id" | "goalId">> = {
        status: args.status as ResearchItem["status"],
      };

      if (args.findings !== undefined) {
        updates.findings = sanitizeString(args.findings);
      }

      if (args.decision !== undefined) {
        updates.decision = sanitizeString(args.decision);
      }

      if (args.status === "resolved") {
        updates.resolvedAt = new Date().toISOString();
      }

      try {
        const updated = await planningStore.updateResearchItem(args.researchItemId, updates);
        if (!updated) {
          return { error: `Research item not found: ${args.researchItemId}` };
        }
        return { item: updated };
      } catch (err: any) {
        return { error: err.message ?? "Failed to update research item" };
      }
    },
  };

  /**
   * get_research: Retrieves all research items for a goal.
   * Verifies session ownership to prevent cross-session disclosure.
   */
  const getResearch: Tool = {
    name: "get_research",
    description:
      "Retrieve all research items for a goal from the planning store. " +
      "Requires sessionId to match the goal's owner session. " +
      "Returns all research items grouped with their current status and any recorded findings.",
    parameters: {
      type: "object",
      properties: {
        goalId: {
          type: "string",
          description: "The ID of the goal to retrieve research items for.",
        },
        sessionId: {
          type: "string",
          description: "The session ID of the caller. Must match the goal's sessionId.",
        },
      },
      required: ["goalId", "sessionId"],
    },
    handler: async (args: any) => {
      const goalIdErr = validateStringField(args.goalId, "goalId", 256);
      if (goalIdErr) return { error: goalIdErr };

      const sessionIdErr = validateStringField(args.sessionId, "sessionId", MAX_SESSION_ID_LENGTH);
      if (sessionIdErr) return { error: sessionIdErr };

      // Verify goal ownership
      const goal = await planningStore.getGoal(args.goalId);
      if (!goal || goal.sessionId !== args.sessionId) {
        return { error: `Goal not found: ${args.goalId}` };
      }

      const items = await planningStore.listResearchItems(args.goalId);
      return { items, goalId: args.goalId };
    },
  };

  return [defineGoal, saveGoal, getGoal, generateResearchChecklist, updateResearchItem, getResearch];
}
