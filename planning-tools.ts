// Planning tools for the next-version planning workflow.
// Provides tools that enable the Copilot agent to guide users through
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
const MAX_FINDINGS_LENGTH = 2000;
const MAX_DECISION_LENGTH = 1000;

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
 * Sanitizes a user-provided string by replacing HTML-special characters with
 * their entity equivalents.  This prevents stored XSS if the text is later
 * rendered in a browser context.
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
 * Validates that a string is a well-formed absolute http(s) URL.
 * Returns an error message or null if valid.
 */
function validateUrl(value: string, fieldName: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return `${fieldName} must use http or https`;
    }
    return null;
  } catch {
    return `${fieldName} is not a valid URL`;
  }
}

// --- Research category definitions (module-scoped; does not depend on factory parameters) ---

const RESEARCH_CATEGORIES: ReadonlyArray<{
  readonly category: ResearchItem["category"];
  readonly defaultQuestion: (goalSummary: string) => string;
}> = [
  {
    category: "domain",
    defaultQuestion: (g) =>
      `What domain-specific knowledge, terminology, or business rules must be understood to implement: "${g}"?`,
  },
  {
    category: "architecture",
    defaultQuestion: (g) =>
      `What system design decisions or architectural patterns are needed for: "${g}"?`,
  },
  {
    category: "security",
    defaultQuestion: (g) =>
      `What security requirements, threat vectors, or access-control rules apply to: "${g}"?`,
  },
  {
    category: "infrastructure",
    defaultQuestion: (g) =>
      `What hosting, deployment, scaling, or operational infrastructure is required for: "${g}"?`,
  },
  {
    category: "integration",
    defaultQuestion: (g) =>
      `What external services, APIs, or third-party systems must be integrated to achieve: "${g}"?`,
  },
  {
    category: "data_model",
    defaultQuestion: (g) =>
      `What data structures, storage schemas, or persistence strategies are needed for: "${g}"?`,
  },
  {
    category: "operational",
    defaultQuestion: (g) =>
      `What monitoring, logging, alerting, or on-call requirements exist for: "${g}"?`,
  },
  {
    category: "ux",
    defaultQuestion: (g) =>
      `What user experience, accessibility, or interface design considerations apply to: "${g}"?`,
  },
];

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
   * generate_research_checklist: Analyzes a saved goal and creates one
   * ResearchItem per category (8 total) in the planning store.
   * Requires the caller's sessionId to match the goal's sessionId.
   */
  const generateResearchChecklist: Tool = {
    name: "generate_research_checklist",
    description:
      "Analyze a saved goal and generate a categorized research checklist with one item per category " +
      "(domain, architecture, security, infrastructure, integration, data_model, operational, ux). " +
      "Saves all items to the planning store and returns the full list.",
    parameters: {
      type: "object",
      properties: {
        goalId: {
          type: "string",
          description: "The ID of the goal to generate research items for.",
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
      const goalIdErr = validateStringField(args.goalId, "goalId", 256);
      if (goalIdErr) return { error: goalIdErr };

      const sessionIdErr = validateStringField(args.sessionId, "sessionId", MAX_SESSION_ID_LENGTH);
      if (sessionIdErr) return { error: sessionIdErr };

      const goal = await planningStore.getGoal(args.goalId);
      if (!goal || goal.sessionId !== args.sessionId) {
        return { error: `Goal not found: ${args.goalId}` };
      }

      const goalSummary = sanitizeText(goal.goal.slice(0, 100));
      const createdItems: ResearchItem[] = [];

      for (const { category, defaultQuestion } of RESEARCH_CATEGORIES) {
        const item: ResearchItem = {
          id: crypto.randomUUID(),
          goalId: goal.id,
          category,
          question: defaultQuestion(goalSummary),
          status: "open",
          findings: "",
          decision: "",
        };
        const saved = await planningStore.createResearchItem(item);
        createdItems.push(saved);
      }

      return { items: createdItems };
    },
  };

  /**
   * update_research_item: Transitions a ResearchItem's status
   * (open → researching → resolved) and records findings and an optional
   * decision.  Requires the caller to supply the goalId so ownership can be
   * verified.  Findings are required when resolving.  All free-text content
   * is sanitized before storage.
   */
  const updateResearchItem: Tool = {
    name: "update_research_item",
    description:
      "Update the status, findings, and optional decision of a research item. " +
      "Allowed transitions: open → researching, researching → resolved. " +
      "Findings are required when resolving. " +
      "Requires goalId for ownership verification.",
    parameters: {
      type: "object",
      properties: {
        itemId: {
          type: "string",
          description: "The ID of the research item to update.",
        },
        goalId: {
          type: "string",
          description: "The goal ID this item belongs to (used for ownership check).",
        },
        sessionId: {
          type: "string",
          description: "The session ID of the caller. Must match the goal's sessionId.",
        },
        status: {
          type: "string",
          enum: ["researching", "resolved"],
          description: "The new status for the research item.",
        },
        findings: {
          type: "string",
          description:
            "Findings gathered during investigation. Required when status is 'resolved'. Max 2000 chars.",
        },
        decision: {
          type: "string",
          description:
            "The conclusion or decision reached. Optional. Max 1000 chars.",
        },
        sourceUrl: {
          type: "string",
          description:
            "Optional URL referencing the source of the findings (must be http or https).",
        },
      },
      required: ["itemId", "goalId", "sessionId", "status"],
    },
    handler: async (args: any) => {
      const itemIdErr = validateStringField(args.itemId, "itemId", 256);
      if (itemIdErr) return { error: itemIdErr };

      const goalIdErr = validateStringField(args.goalId, "goalId", 256);
      if (goalIdErr) return { error: goalIdErr };

      const sessionIdErr = validateStringField(args.sessionId, "sessionId", MAX_SESSION_ID_LENGTH);
      if (sessionIdErr) return { error: sessionIdErr };

      if (args.status !== "researching" && args.status !== "resolved") {
        return { error: "status must be 'researching' or 'resolved'" };
      }

      // Ownership check: verify the goal belongs to the caller's session.
      const goal = await planningStore.getGoal(args.goalId);
      if (!goal || goal.sessionId !== args.sessionId) {
        return { error: `Goal not found: ${args.goalId}` };
      }

      // Fetch the existing item and verify it belongs to the stated goal.
      const existingItem = await planningStore.getResearchItem(args.itemId);
      if (!existingItem || existingItem.goalId !== args.goalId) {
        return { error: `Research item not found: ${args.itemId}` };
      }

      // Validate status transition.
      const validTransitions: Record<ResearchItem["status"], ResearchItem["status"][]> = {
        open: ["researching"],
        researching: ["resolved"],
        resolved: [],
      };
      if (!validTransitions[existingItem.status].includes(args.status)) {
        return {
          error: `Invalid status transition: '${existingItem.status}' → '${args.status}'`,
        };
      }

      // findings required when resolving.
      if (args.status === "resolved") {
        const findingsErr = validateStringField(args.findings, "findings", MAX_FINDINGS_LENGTH);
        if (findingsErr) return { error: findingsErr };
      }

      // Optional decision validation.
      if (args.decision !== undefined && args.decision !== null && args.decision !== "") {
        const decisionErr = validateStringField(args.decision, "decision", MAX_DECISION_LENGTH);
        if (decisionErr) return { error: decisionErr };
      }

      // Optional sourceUrl validation.
      if (args.sourceUrl !== undefined && args.sourceUrl !== null && args.sourceUrl !== "") {
        const urlErr = validateUrl(args.sourceUrl, "sourceUrl");
        if (urlErr) return { error: urlErr };
      }

      const updates: Partial<Omit<ResearchItem, "id" | "goalId">> = {
        status: args.status,
      };

      if (typeof args.findings === "string" && args.findings.trim().length > 0) {
        updates.findings = sanitizeText(args.findings);
      }

      if (typeof args.decision === "string" && args.decision.trim().length > 0) {
        updates.decision = sanitizeText(args.decision);
      }

      if (typeof args.sourceUrl === "string" && args.sourceUrl.trim().length > 0) {
        updates.sourceUrl = args.sourceUrl;
      }

      // 'resolved' is a terminal state — no transitions out of it are permitted.
      if (args.status === "resolved") {
        updates.resolvedAt = new Date().toISOString();
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
   * Requires the caller's sessionId to match the goal's sessionId.
   */
  const getResearch: Tool = {
    name: "get_research",
    description:
      "Retrieve all research items for a goal. " +
      "Requires sessionId to match the goal's owner session.",
    parameters: {
      type: "object",
      properties: {
        goalId: {
          type: "string",
          description: "The ID of the goal whose research items to retrieve.",
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
      const goalIdErr = validateStringField(args.goalId, "goalId", 256);
      if (goalIdErr) return { error: goalIdErr };

      const sessionIdErr = validateStringField(args.sessionId, "sessionId", MAX_SESSION_ID_LENGTH);
      if (sessionIdErr) return { error: sessionIdErr };

      const goal = await planningStore.getGoal(args.goalId);
      if (!goal || goal.sessionId !== args.sessionId) {
        return { error: `Goal not found: ${args.goalId}` };
      }

      const items = await planningStore.listResearchItems(args.goalId);
      return { items };
    },
  };

  return [defineGoal, saveGoal, getGoal, generateResearchChecklist, updateResearchItem, getResearch];
}
