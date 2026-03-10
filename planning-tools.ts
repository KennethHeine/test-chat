// Planning tools for the next-version planning workflow.
// Provides tools that enable the Copilot agent to guide users through
// structured goal definition and research workflow.

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

// Research-specific max lengths
const MAX_RESEARCH_QUESTION_LENGTH = 500;
const MAX_RESEARCH_FINDINGS_LENGTH = 2000;
const MAX_RESEARCH_DECISION_LENGTH = 1000;

// Valid research category and status values
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

/**
 * Sanitizes text content by stripping angle brackets (preventing HTML injection)
 * and control characters. Preserves newlines and tabs for multi-line content.
 */
function sanitizeText(text: string): string {
  return text
    .replace(/[<>]/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();
}

// --- Tool factory ---

/**
 * Creates the planning tools bound to the provided planning store.
 * The token parameter is accepted for API consistency with createGitHubTools
 * and may be used by future tools that call GitHub APIs.
 *
 * @param token - The user's GitHub PAT (reserved for future use)
 * @param planningStore - The PlanningStore instance for persisting goals and research items
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
   * generate_research_checklist: Accepts a goal ID and an array of research items
   * (one or more per category) covering all 8 research categories. Validates that
   * every required category is represented, then persists the items via PlanningStore.
   * Returns the complete list of created ResearchItem objects.
   */
  const generateResearchChecklist: Tool = {
    name: "generate_research_checklist",
    description:
      "Analyze a goal and generate a structured research checklist covering all 8 research categories " +
      "(domain, architecture, security, infrastructure, integration, data_model, operational, ux). " +
      "Provide one or more questions per category. All 8 categories must be represented. " +
      "Items are persisted to the planning store and returned with generated IDs.",
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
            "Array of research items to create. Must cover all 8 categories: " +
            "domain, architecture, security, infrastructure, integration, data_model, operational, ux.",
          items: {
            type: "object",
            properties: {
              category: {
                type: "string",
                enum: ["domain", "architecture", "security", "infrastructure", "integration", "data_model", "operational", "ux"],
                description: "The research category this item belongs to.",
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

      // Verify goal exists and belongs to the caller's session
      const goal = await planningStore.getGoal(args.goalId);
      if (!goal || goal.sessionId !== args.sessionId) {
        return { error: `Goal not found: ${args.goalId}` };
      }

      if (!Array.isArray(args.items) || args.items.length === 0) {
        return { error: "items must be a non-empty array" };
      }

      // Validate all 8 categories are covered
      const providedCategories = new Set<string>(
        (args.items as any[]).map((item: any) => item.category)
      );
      const missingCategories = VALID_RESEARCH_CATEGORIES.filter((c) => !providedCategories.has(c));
      if (missingCategories.length > 0) {
        return { error: `Missing research categories: ${missingCategories.join(", ")}` };
      }

      // Validate and create each item
      const createdItems: ResearchItem[] = [];
      for (let i = 0; i < (args.items as any[]).length; i++) {
        const item = (args.items as any[])[i];

        if (!VALID_RESEARCH_CATEGORIES.includes(item.category)) {
          return { error: `items[${i}].category must be one of: ${VALID_RESEARCH_CATEGORIES.join(", ")}` };
        }

        const questionErr = validateStringField(item.question, `items[${i}].question`, MAX_RESEARCH_QUESTION_LENGTH);
        if (questionErr) return { error: questionErr };

        const newItem: ResearchItem = {
          id: crypto.randomUUID(),
          goalId: args.goalId,
          category: item.category,
          question: item.question.trim(),
          status: "open",
          findings: "",
          decision: "",
        };

        try {
          const created = await planningStore.createResearchItem(newItem);
          createdItems.push(created);
        } catch (err: any) {
          return { error: err.message ?? `Failed to create research item at index ${i}` };
        }
      }

      return { items: createdItems, count: createdItems.length };
    },
  };

  /**
   * update_research_item: Transitions a research item's status and records findings.
   * Sanitizes findings and decision content before persisting.
   * When status is "resolved", findings must be provided and resolvedAt is set automatically.
   */
  const updateResearchItem: Tool = {
    name: "update_research_item",
    description:
      "Update the status and findings of a research item. " +
      "Status transitions: open → researching → resolved. " +
      "When resolving an item, findings must be provided. " +
      "An optional decision can record the conclusion reached.",
    parameters: {
      type: "object",
      properties: {
        itemId: {
          type: "string",
          description: "The unique identifier of the research item to update.",
        },
        status: {
          type: "string",
          enum: ["open", "researching", "resolved"],
          description: "The new status for the research item.",
        },
        findings: {
          type: "string",
          description: "The findings gathered during investigation. Required when status is 'resolved'. Max 2000 chars.",
        },
        decision: {
          type: "string",
          description: "The decision or conclusion reached based on the findings. Max 1000 chars.",
        },
      },
      required: ["itemId", "status"],
    },
    handler: async (args: any) => {
      const itemIdErr = validateStringField(args.itemId, "itemId", 256);
      if (itemIdErr) return { error: itemIdErr };

      if (!VALID_RESEARCH_STATUSES.includes(args.status)) {
        return { error: `status must be one of: ${VALID_RESEARCH_STATUSES.join(", ")}` };
      }

      const updates: Partial<Omit<ResearchItem, "id" | "goalId">> = {
        status: args.status,
      };

      if (args.findings !== undefined) {
        if (typeof args.findings !== "string") {
          return { error: "findings must be a string" };
        }
        const sanitized = sanitizeText(args.findings);
        if (sanitized.length > MAX_RESEARCH_FINDINGS_LENGTH) {
          return { error: `findings must be at most ${MAX_RESEARCH_FINDINGS_LENGTH} characters` };
        }
        updates.findings = sanitized;
      }

      if (args.decision !== undefined) {
        if (typeof args.decision !== "string") {
          return { error: "decision must be a string" };
        }
        const sanitized = sanitizeText(args.decision);
        if (sanitized.length > MAX_RESEARCH_DECISION_LENGTH) {
          return { error: `decision must be at most ${MAX_RESEARCH_DECISION_LENGTH} characters` };
        }
        updates.decision = sanitized;
      }

      // Resolved items require findings
      if (args.status === "resolved") {
        const findingsValue = updates.findings;
        if (findingsValue === undefined || findingsValue.trim().length === 0) {
          return { error: "findings must be provided when status is resolved" };
        }
        updates.resolvedAt = new Date().toISOString();
      }

      const updated = await planningStore.updateResearchItem(args.itemId, updates);
      if (!updated) {
        return { error: `Research item not found: ${args.itemId}` };
      }

      return { item: updated };
    },
  };

  /**
   * get_research: Retrieves all research items for a given goal.
   * Returns items in the order they were created.
   */
  const getResearch: Tool = {
    name: "get_research",
    description:
      "Retrieve all research items for a goal. " +
      "Returns items grouped by category with their current status and any recorded findings.",
    parameters: {
      type: "object",
      properties: {
        goalId: {
          type: "string",
          description: "The ID of the goal whose research items should be retrieved.",
        },
      },
      required: ["goalId"],
    },
    handler: async (args: any) => {
      const goalIdErr = validateStringField(args.goalId, "goalId", 256);
      if (goalIdErr) return { error: goalIdErr };

      const items = await planningStore.listResearchItems(args.goalId);
      return { items, count: items.length };
    },
  };

  return [defineGoal, saveGoal, getGoal, generateResearchChecklist, updateResearchItem, getResearch];
}
