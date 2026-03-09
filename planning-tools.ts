// Planning tools for the next-version planning workflow.
// Provides three tools that enable the Copilot agent to guide users through
// structured goal definition: define_goal, save_goal, and get_goal.

import type { Tool } from "@github/copilot-sdk";
import type { PlanningStore } from "./planning-store.js";
import type { Goal } from "./planning-types.js";

// --- Exported tool names for permission handler reference ---

export const PLANNING_TOOL_NAMES = [
  "define_goal",
  "save_goal",
  "get_goal",
] as const;

// --- Max field lengths (from planning-types.ts JSDoc) ---

const MAX_INTENT_LENGTH = 2000;
const MAX_GOAL_LENGTH = 500;
const MAX_PROBLEM_STATEMENT_LENGTH = 1000;
const MAX_BUSINESS_VALUE_LENGTH = 500;
const MAX_TARGET_OUTCOME_LENGTH = 500;
const MAX_SESSION_ID_LENGTH = 256;

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

// --- Tool factory ---

/**
 * Creates the planning tools bound to the provided planning store.
 * The token parameter is accepted for API consistency with createGitHubTools
 * and may be used by future tools that call GitHub APIs.
 *
 * @param token - The user's GitHub PAT (reserved for future use)
 * @param planningStore - The PlanningStore instance for persisting goals
 * @returns Array of Tool objects [defineGoal, saveGoal, getGoal]
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

      // Validate array fields
      for (const arrayField of ["successCriteria", "assumptions", "constraints", "risks"] as const) {
        if (!Array.isArray(args[arrayField])) {
          return { error: `${arrayField} must be an array` };
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
   * Returns the Goal object, or an error message if the goal is not found.
   */
  const getGoal: Tool = {
    name: "get_goal",
    description:
      "Retrieve a saved goal by its ID from the planning store. " +
      "Returns the full Goal object or an error message if the ID is not found.",
    parameters: {
      type: "object",
      properties: {
        goalId: {
          type: "string",
          description: "The unique identifier of the goal to retrieve.",
        },
      },
      required: ["goalId"],
    },
    handler: async (args: any) => {
      const goalIdErr = validateStringField(args.goalId, "goalId", 256);
      if (goalIdErr) return { error: goalIdErr };

      const goal = await planningStore.getGoal(args.goalId);
      if (!goal) {
        return { error: `Goal not found: ${args.goalId}` };
      }
      return { goal };
    },
  };

  return [defineGoal, saveGoal, getGoal];
}
