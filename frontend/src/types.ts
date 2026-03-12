export interface Session {
  id: string;
  title: string;
  model?: string;
  messages: Message[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Message {
  role: "user" | "assistant" | "error";
  text: string;
}

export interface ModelInfo {
  id?: string;
  name?: string;
  capabilities?: {
    supports?: {
      reasoningEffort?: boolean;
    };
  };
  supportedReasoningEfforts?: string[];
  defaultReasoningEffort?: string;
}

export interface SSEEvent {
  type: string;
  content?: string;
  sessionId?: string;
  title?: string;
  tool?: string;
  toolName?: string;
  result?: unknown;
  usage?: UsageInfo;
  message?: string;
  question?: string;
  choices?: string[];
  allowFreeform?: boolean;
  requestId?: string;
  count?: number;
  name?: string;
  text?: string;
  activity?: string;
}

export interface UsageInfo {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface Goal {
  id: string;
  intent?: string;
  goal?: string;
  problemStatement?: string;
  businessValue?: string;
  targetOutcome?: string;
  successCriteria?: string[];
  assumptions?: string[];
  constraints?: string[];
  risks?: string[];
  updatedAt?: string;
  createdAt?: string;
}

export interface ResearchItem {
  id: string;
  goalId: string;
  category: string;
  question: string;
  status: string;
  findings?: string;
  decision?: string;
  sourceUrl?: string;
}

export interface Milestone {
  id: string;
  goalId: string;
  name: string;
  order: number;
  status: string;
  goal?: string;
  acceptanceCriteria?: string[];
  dependencies?: string[];
  githubNumber?: number;
  githubUrl?: string;
}

export interface IssueDraft {
  id: string;
  milestoneId: string;
  title: string;
  order: number;
  status: string;
  purpose?: string;
  expectedOutcome?: string;
  githubIssueNumber?: number;
  githubIssueUrl?: string;
  labels?: string[];
  body?: string;
  acceptanceCriteria?: string[];
  implementationNotes?: string;
  dependencies?: string[];
}

export type ViewType = "chat" | "dashboard";
export type DashboardPage = "goals" | "research" | "milestones" | "issues";

/** Human-readable labels for each research category. */
export const CATEGORY_LABELS: Record<string, string> = {
  domain: "Domain",
  architecture: "Architecture",
  security: "Security",
  infrastructure: "Infrastructure",
  integration: "Integration",
  data_model: "Data Model",
  operational: "Operational",
  ux: "UX",
};

export const RESEARCH_CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

export const VALID_STATUSES = ["open", "researching", "resolved"];
export const VALID_MILESTONE_STATUSES = ["draft", "ready", "in-progress", "complete"];
export const DEFAULT_MILESTONE_STATUS = "draft";
export const VALID_ISSUE_DRAFT_STATUSES = ["draft", "ready", "created"];
export const DEFAULT_ISSUE_DRAFT_STATUS = "draft";

export const EFFORT_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extended",
};

export interface PushMutation {
  type: "milestone" | "issue";
  id: string;
  milestoneId?: string;
  label: string;
  status: "pending" | "pushing" | "success" | "error";
  error?: string;
  githubUrl?: string;
}

export interface QuotaInfo {
  premiumRequestsRemaining?: number;
  premiumRequestsLimit?: number;
}
