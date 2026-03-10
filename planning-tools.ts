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
const MAX_FINDINGS_LENGTH = 2000;
const MAX_DECISION_LENGTH = 1000;

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
 * @param planningStore - The PlanningStore instance for persisting goals and research
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
   * generate_research_checklist: Analyzes a saved goal and generates a categorized set of
   * research questions across all 8 research categories. Each item is persisted via
   * planningStore.createResearchItem() and the full list is returned.
   * Goal ownership is verified via sessionId before generating items.
   */
  const generateResearchChecklist: Tool = {
    name: "generate_research_checklist",
    description:
      "Analyze a saved goal and generate a categorized research checklist covering all 8 research categories " +
      "(domain, architecture, security, infrastructure, integration, data_model, operational, ux). " +
      "Each item captures a specific question to investigate before implementation begins. " +
      "Requires the caller's sessionId to match the goal's owner session.",
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
      const goalIdErr = validateStringField(args.goalId, "goalId", 256);
      if (goalIdErr) return { error: goalIdErr };

      const sessionIdErr = validateStringField(args.sessionId, "sessionId", MAX_SESSION_ID_LENGTH);
      if (sessionIdErr) return { error: sessionIdErr };

      const goal = await planningStore.getGoal(args.goalId);
      if (!goal || goal.sessionId !== args.sessionId) {
        return { error: `Goal not found: ${args.goalId}` };
      }

      const items: ResearchItem[] = buildResearchItems(goal);

      const created: ResearchItem[] = [];
      for (const item of items) {
        const saved = await planningStore.createResearchItem(item);
        created.push(saved);
      }

      return { researchItems: created };
    },
  };

  /**
   * update_research_item: Updates an existing research item's status, findings, and/or decision.
   * Status transitions: open → researching → resolved. When status becomes 'resolved',
   * resolvedAt is automatically set to the current ISO timestamp.
   * Validates enum values for status and enforces max length limits on text fields.
   */
  const updateResearchItem: Tool = {
    name: "update_research_item",
    description:
      "Update a research item's status, findings, and/or decision. " +
      "Status must be one of: open, researching, resolved. " +
      "When status transitions to 'resolved', resolvedAt is automatically set. " +
      "Findings max 2000 chars. Decision max 1000 chars.",
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
          description: "New status for the research item.",
        },
        findings: {
          type: "string",
          description: "Findings gathered during investigation. Max 2000 chars.",
        },
        decision: {
          type: "string",
          description: "Decision or conclusion reached based on the findings. Max 1000 chars.",
        },
      },
      required: ["itemId"],
    },
    handler: async (args: any) => {
      const itemIdErr = validateStringField(args.itemId, "itemId", 256);
      if (itemIdErr) return { error: itemIdErr };

      const existing = await planningStore.getResearchItem(args.itemId);
      if (!existing) {
        return { error: `Research item not found: ${args.itemId}` };
      }

      const updates: Partial<Omit<ResearchItem, "id" | "goalId">> = {};

      if (args.status !== undefined) {
        const validStatuses = ["open", "researching", "resolved"];
        if (!validStatuses.includes(args.status)) {
          return { error: `status must be one of: ${validStatuses.join(", ")}` };
        }
        updates.status = args.status as ResearchItem["status"];
        if (args.status === "resolved") {
          updates.resolvedAt = new Date().toISOString();
        }
      }

      if (args.findings !== undefined) {
        const findingsErr = validateStringField(args.findings, "findings", MAX_FINDINGS_LENGTH);
        if (findingsErr) return { error: findingsErr };
        updates.findings = args.findings;
      }

      if (args.decision !== undefined) {
        const decisionErr = validateStringField(args.decision, "decision", MAX_DECISION_LENGTH);
        if (decisionErr) return { error: decisionErr };
        updates.decision = args.decision;
      }

      const updated = await planningStore.updateResearchItem(args.itemId, updates);
      if (!updated) {
        return { error: `Research item not found: ${args.itemId}` };
      }
      return { researchItem: updated };
    },
  };

  /**
   * get_research: Retrieves all research items for a given goal.
   * Goal ownership is verified via sessionId before returning data,
   * preventing cross-session information disclosure.
   */
  const getResearch: Tool = {
    name: "get_research",
    description:
      "Retrieve all research items for a goal. " +
      "Requires sessionId to match the goal's owner session. " +
      "Returns the full list of ResearchItem objects for the goal.",
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
      const goalIdErr = validateStringField(args.goalId, "goalId", 256);
      if (goalIdErr) return { error: goalIdErr };

      const sessionIdErr = validateStringField(args.sessionId, "sessionId", MAX_SESSION_ID_LENGTH);
      if (sessionIdErr) return { error: sessionIdErr };

      const goal = await planningStore.getGoal(args.goalId);
      if (!goal || goal.sessionId !== args.sessionId) {
        return { error: `Goal not found: ${args.goalId}` };
      }

      const items = await planningStore.listResearchItems(args.goalId);
      return { researchItems: items };
    },
  };

  return [defineGoal, saveGoal, getGoal, generateResearchChecklist, updateResearchItem, getResearch];
}

// --- Research checklist generation ---

/**
 * Generates a categorized list of research items for a goal, covering all 8 research
 * categories. Questions are tailored to the goal's intent, problem statement,
 * constraints, and risks.
 */
function buildResearchItems(goal: Goal): ResearchItem[] {
  const { id: goalId, intent, problemStatement, constraints, risks } = goal;

  const context = [intent, problemStatement].filter(Boolean).join(" ");
  // Build a readable summary of all constraints and risks, falling back to generic phrasing when none exist
  const constraintSummary =
    constraints.length > 0
      ? constraints.map((c, i) => `(${i + 1}) ${c}`).join("; ").slice(0, 300)
      : "the stated constraints";
  const riskSummary =
    risks.length > 0
      ? risks.map((r, i) => `(${i + 1}) ${r}`).join("; ").slice(0, 300)
      : "the identified risks";

  const base = { goalId, status: "open" as const, findings: "", decision: "" };

  return [
    // domain
    {
      ...base,
      id: crypto.randomUUID(),
      category: "domain",
      question: `What domain-specific knowledge, terminology, or regulations are required to implement: "${context.slice(0, 200)}"?`,
    },
    {
      ...base,
      id: crypto.randomUUID(),
      category: "domain",
      question: `Who are the primary stakeholders and end-users for this goal, and what are their core needs?`,
    },
    // architecture
    {
      ...base,
      id: crypto.randomUUID(),
      category: "architecture",
      question: `What system architecture patterns (e.g., monolith, microservices, event-driven) best fit this goal given ${constraintSummary}?`,
    },
    {
      ...base,
      id: crypto.randomUUID(),
      category: "architecture",
      question: `What are the key components and their boundaries for implementing: "${context.slice(0, 150)}"?`,
    },
    // security
    {
      ...base,
      id: crypto.randomUUID(),
      category: "security",
      question: `What authentication, authorization, or data protection requirements apply to this goal?`,
    },
    {
      ...base,
      id: crypto.randomUUID(),
      category: "security",
      question: `What threat vectors or security risks are most relevant given: "${riskSummary.slice(0, 200)}"?`,
    },
    // infrastructure
    {
      ...base,
      id: crypto.randomUUID(),
      category: "infrastructure",
      question: `What hosting, deployment, and scaling requirements does this goal impose?`,
    },
    {
      ...base,
      id: crypto.randomUUID(),
      category: "infrastructure",
      question: `What CI/CD pipeline changes are needed to support this goal?`,
    },
    // integration
    {
      ...base,
      id: crypto.randomUUID(),
      category: "integration",
      question: `What external systems, APIs, or third-party services must this goal integrate with?`,
    },
    {
      ...base,
      id: crypto.randomUUID(),
      category: "integration",
      question: `Are there existing internal services or libraries that can be reused, or will new integrations be required?`,
    },
    // data_model
    {
      ...base,
      id: crypto.randomUUID(),
      category: "data_model",
      question: `What new data entities, fields, or relationships are needed to support this goal?`,
    },
    {
      ...base,
      id: crypto.randomUUID(),
      category: "data_model",
      question: `What data storage technology (relational, document, key-value, etc.) is most appropriate given ${constraintSummary}?`,
    },
    // operational
    {
      ...base,
      id: crypto.randomUUID(),
      category: "operational",
      question: `What logging, monitoring, and alerting strategies are needed to operate this goal in production?`,
    },
    {
      ...base,
      id: crypto.randomUUID(),
      category: "operational",
      question: `What maintenance, backup, and disaster recovery considerations apply to this goal?`,
    },
    // ux
    {
      ...base,
      id: crypto.randomUUID(),
      category: "ux",
      question: `What user interface or experience changes are required to expose this goal's functionality to end-users?`,
    },
    {
      ...base,
      id: crypto.randomUUID(),
      category: "ux",
      question: `What accessibility, responsiveness, or usability standards must the UI changes for this goal meet?`,
    },
  ];
}
