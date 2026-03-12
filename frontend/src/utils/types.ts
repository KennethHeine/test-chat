/** Shared TypeScript types for the frontend application */

export interface Session {
  id: string;
  title: string;
  timestamp: number;
  messages: Message[];
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  version: string;
  capabilities?: {
    reasoning?: boolean;
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface GoalData {
  id: string;
  sessionId?: string;
  intent: string;
  goal: string;
  problemStatement: string;
  businessValue: string;
  targetOutcome: string;
  successCriteria: string[];
  assumptions: string[];
  constraints: string[];
  risks: string[];
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}

export interface ResearchItem {
  id: string;
  goalId: string;
  category: string;
  question: string;
  status: string;
  findings: string;
  decision: string;
  priority?: string;
  [key: string]: any;
}

export interface MilestoneData {
  id: string;
  goalId: string;
  name: string;
  goal: string;
  scope: string;
  order: number;
  dependencies: string[];
  acceptanceCriteria: string[];
  exitCriteria: string[];
  status: string;
  githubMilestoneUrl?: string;
  [key: string]: any;
}

export interface IssueDraft {
  id: string;
  milestoneId: string;
  goalId?: string;
  title: string;
  purpose?: string;
  problem?: string;
  expectedOutcome?: string;
  scopeBoundaries?: string;
  technicalContext?: string;
  dependencies?: string[];
  acceptanceCriteria?: string[];
  testingExpectations?: string;
  researchLinks?: string[];
  order: number;
  status: string;
  filesToModify?: { path: string; reason: string }[];
  filesToRead?: { path: string; reason: string }[];
  securityChecklist?: string[];
  verificationCommands?: string[];
  githubIssueUrl?: string;
  githubIssueNumber?: number;
  [key: string]: any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface QuotaInfo {
  copilot_chat: {
    premium_requests_remaining: number;
    premium_requests_limit: number;
    premium_requests_reset_at: string;
  };
}

export interface UsageInfo {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface HealthStatus {
  status: string;
  storage: string;
}

/** A chat content item that can be a message, goal card, research card, or milestone card */
export type ChatItem =
  | { type: 'message'; role: 'user' | 'assistant'; content: string; id: string }
  | { type: 'goal-card'; data: GoalData; id: string }
  | { type: 'research-card'; data: ResearchItem[]; id: string }
  | { type: 'milestone-card'; data: MilestoneData[]; id: string };

export type DashboardPage = 'goals' | 'research' | 'milestones' | 'issues';
export type ViewMode = 'chat' | 'dashboard';
export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

/** Tool complete event from SSE */
export interface ToolCompleteEvent {
  type: 'tool_complete';
  tool: string;
  result?: GoalData | { items?: ResearchItem[]; milestones?: MilestoneData[] } | Record<string, unknown>;
}
