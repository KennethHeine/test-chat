// Planning data model interfaces for the next-version planning workflow.
// These types define the core entities used across goal definition, research,
// milestone planning, and issue generation.

/**
 * Represents a user-defined product or system objective.
 * A Goal is the top-level entity that drives the entire planning workflow.
 */
export interface Goal {
  /** Unique identifier for this goal (UUID generated at runtime). */
  id: string;

  /** The session ID this goal was created in. */
  sessionId: string;

  /** The user's raw, unrefined description of what they want to achieve. Max 2000 chars. */
  intent: string;

  /** The refined, actionable goal statement derived from the user's intent. Max 500 chars. */
  goal: string;

  /** A clear description of the problem this goal addresses. Max 1000 chars. */
  problemStatement: string;

  /** The business value delivered when this goal is achieved. Max 500 chars. */
  businessValue: string;

  /** The desired end state once the goal has been met. Max 500 chars. */
  targetOutcome: string;

  /** Measurable criteria that confirm the goal has been successfully achieved. */
  successCriteria: string[];

  /** Known assumptions that are accepted as true without verification. */
  assumptions: string[];

  /** Known limitations or boundaries that constrain the implementation approach. */
  constraints: string[];

  /** Identified risks that could prevent the goal from being achieved. */
  risks: string[];

  /** ISO 8601 timestamp of when this goal was created. */
  createdAt: string;

  /** ISO 8601 timestamp of when this goal was last updated. */
  updatedAt: string;
}

/**
 * Represents a categorized question or topic to investigate before implementation.
 * Research items capture open questions and their resolved findings.
 */
export interface ResearchItem {
  /** Unique identifier for this research item (UUID generated at runtime). */
  id: string;

  /** The ID of the Goal this research item belongs to. */
  goalId: string;

  /**
   * The category of research this item belongs to.
   * - `domain`: Business domain knowledge
   * - `architecture`: System design and structure decisions
   * - `security`: Security requirements and threat model
   * - `infrastructure`: Hosting, deployment, and ops concerns
   * - `integration`: External system or API interactions
   * - `data_model`: Data structure and storage design
   * - `operational`: Monitoring, logging, and maintenance
   * - `ux`: User experience and interface design
   */
  category:
    | 'domain'
    | 'architecture'
    | 'security'
    | 'infrastructure'
    | 'integration'
    | 'data_model'
    | 'operational'
    | 'ux';

  /** The specific question to be investigated. Max 500 chars. */
  question: string;

  /**
   * Current status of the research item.
   * - `open`: Not yet started
   * - `researching`: Actively being investigated
   * - `resolved`: Investigation complete with a decision recorded
   */
  status: 'open' | 'researching' | 'resolved';

  /** The findings gathered during investigation. Empty string until researched. Max 2000 chars. */
  findings: string;

  /** The decision or conclusion reached based on the findings. Empty string until resolved. Max 1000 chars. */
  decision: string;

  /** ISO 8601 timestamp of when this item was resolved. Only set when status is `resolved`. Undefined otherwise. */
  resolvedAt?: string;

  /** Optional URL referencing the primary source for the findings (http or https only). */
  sourceUrl?: string;
}

/**
 * Represents an ordered delivery phase within a goal.
 * Milestones break the goal into discrete, trackable chunks of work.
 */
export interface Milestone {
  /** Unique identifier for this milestone (UUID generated at runtime). */
  id: string;

  /** The ID of the Goal this milestone belongs to. */
  goalId: string;

  /** Short, descriptive name for this milestone. Max 100 chars. */
  name: string;

  /** A concise description of what this milestone aims to deliver. Max 500 chars. */
  goal: string;

  /** The set of work included in (and excluded from) this milestone. Max 1000 chars. */
  scope: string;

  /** The position of this milestone in the delivery sequence (1-based). */
  order: number;

  /** IDs of other Milestones that must be completed before this one can start. */
  dependencies: string[];

  /** Conditions that must be true for this milestone to be considered accepted. */
  acceptanceCriteria: string[];

  /** Conditions that must be met before moving on to the next milestone. */
  exitCriteria: string[];

  /**
   * Current status of this milestone.
   * - `draft`: Being defined, not yet ready for execution
   * - `ready`: Fully defined and ready to start
   * - `in-progress`: Currently being executed
   * - `complete`: All exit criteria have been met
   */
  status: 'draft' | 'ready' | 'in-progress' | 'complete';

  /** The GitHub milestone number assigned after the milestone is pushed to GitHub. Undefined until created. */
  githubNumber?: number;

  /** The GitHub milestone HTML URL assigned after the milestone is pushed to GitHub. Undefined until created. */
  githubUrl?: string;
}

/**
 * A reference to a file with a reason for its inclusion.
 * Used by `IssueDraft` to specify which files will be modified or read for context.
 */
export interface FileRef {
  /** Relative file path (e.g., "server.ts", "public/app.js"). Max 256 chars. */
  path: string;
  /** Why this file is relevant (e.g., "Add new endpoint", "Follow CRUD pattern"). Max 500 chars. */
  reason: string;
}

/**
 * Represents an implementation-ready GitHub issue definition tied to a milestone.
 * Issue drafts are generated from the planning data and eventually pushed to GitHub.
 */
export interface IssueDraft {
  /** Unique identifier for this issue draft (UUID generated at runtime). */
  id: string;

  /** The ID of the Milestone this issue draft belongs to. */
  milestoneId: string;

  /** The GitHub issue title. Max 256 chars. */
  title: string;

  /** A brief description of what this issue is for and why it exists. Max 500 chars. */
  purpose: string;

  /** The specific problem or gap this issue addresses. Max 1000 chars. */
  problem: string;

  /** The desired end state once this issue is implemented. Max 500 chars. */
  expectedOutcome: string;

  /** Description of what is in scope and explicitly out of scope. Max 1000 chars. */
  scopeBoundaries: string;

  /** Background information, patterns, and constraints relevant to implementation. Max 2000 chars. */
  technicalContext: string;

  /** IDs of other IssueDrafts that must be completed before this issue can start. */
  dependencies: string[];

  /** Conditions that must be true for this issue to be considered complete. */
  acceptanceCriteria: string[];

  /** Description of required tests and testing strategy for this issue. Max 1000 chars. */
  testingExpectations: string;

  /** IDs of resolved ResearchItems whose findings are relevant to this issue. */
  researchLinks: string[];

  /** The position of this issue within its milestone (1-based). */
  order: number;

  /**
   * Current status of this issue draft.
   * - `draft`: Being defined, not yet ready for creation
   * - `ready`: Fully defined and ready to push to GitHub
   * - `created`: Successfully created as a GitHub issue
   */
  status: 'draft' | 'ready' | 'created';

  /** The GitHub issue number assigned after the issue is pushed to GitHub. Undefined when status is not `created`. */
  githubIssueNumber?: number;

  /** Files that should be created or modified during implementation, with per-file reasons. */
  filesToModify: FileRef[];

  /** Files to read for context before implementation (not modified). */
  filesToRead: FileRef[];

  /** Existing file or pattern to use as an implementation reference. Optional. */
  patternReference?: string;

  /** Security-specific validation rules for this issue. */
  securityChecklist: string[];

  /** Exact commands to run for self-verification after implementation. */
  verificationCommands: string[];
}
