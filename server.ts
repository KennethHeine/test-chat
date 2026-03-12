import express, { Request, Response, NextFunction } from "express";
import { CopilotClient, CopilotSession } from "@github/copilot-sdk";
import type { SessionConfig, PermissionHandler } from "@github/copilot-sdk";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import path from "path";
import { createSessionStore, hashToken, AzureSessionStore, InMemorySessionStore, type SessionStore } from "./storage.js";
import { createGitHubTools, GITHUB_TOOL_NAMES, githubFetch, githubWrite, buildIssueBody } from "./tools.js";
import { InMemoryPlanningStore, AzurePlanningStore, createPlanningStore, type PlanningStore } from "./planning-store.js";
import { createPlanningTools } from "./planning-tools.js";

// SDK does not re-export these types from its main index, so define them locally.
interface UserInputRequest {
  question: string;
  choices?: string[];
  allowFreeform?: boolean;
}
interface UserInputResponse {
  answer: string;
  wasFreeform: boolean;
}

// --- System Message for Agent Orchestration ---
const ORCHESTRATOR_SYSTEM_MESSAGE = `You are a coding task orchestrator. Your role is to help users research codebases, plan coding tasks, and coordinate work across repositories.

When helping users, follow these principles:
1. **Research First** — Before suggesting changes, explore the repository structure, read key files, and understand the architecture.
2. **Structured Task Breakdown** — Break down complex requests into clear, actionable sub-tasks with specific descriptions and acceptance criteria.
3. **Parallel Identification** — Identify which tasks can be worked on independently and which have dependencies.
4. **Context Gathering** — Ask clarifying questions when requirements are ambiguous. Gather enough context before planning.

When defining tasks, use this structure:
- **Repository**: owner/repo
- **Description**: What needs to be done
- **Files**: Key files likely to be modified
- **Dependencies**: Other tasks that must complete first
- **Acceptance Criteria**: How to verify the task is done`;

config(); // load .env

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());

// Serve the Vite-built React frontend from frontend/dist (production) or fall back to public/ (legacy)
import fs from "fs";
const frontendDistPath = path.join(__dirname, "frontend", "dist");
const publicPath = path.join(__dirname, "public");
const distIndexPath = path.join(frontendDistPath, "index.html");
const hasBuiltFrontend = fs.existsSync(distIndexPath);
const staticRoot = hasBuiltFrontend ? frontendDistPath : publicPath;
app.use(express.static(staticRoot));

const PORT = parseInt(process.env.PORT || "3000", 10);

// --- Storage ---

const storageAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME || "";
let sessionStore: SessionStore = createSessionStore(storageAccountName || undefined);

// --- Planning Store ---
// Goals are created via planning tools (planning-tools.ts), not through API endpoints.
// This store is shared with the tool factory once planning tools are wired in.
let planningStore: PlanningStore = createPlanningStore(storageAccountName || undefined);

// --- Per-user Copilot Clients ---

// Key: github token → CopilotClient (one client per user token)
const clients = new Map<string, CopilotClient>();
// Key: "token:sessionId" → CopilotSession (in-memory SDK sessions for active conversations)
const sessions = new Map<string, CopilotSession>();

// --- User Input Requests ---

// Timeout for pending user input requests (ms). Configurable via env var; default 2 minutes.
const DEFAULT_USER_INPUT_TIMEOUT_MS = 120000;
const parsedUserInputTimeout = Number.parseInt(process.env.USER_INPUT_TIMEOUT_MS ?? "", 10);
const USER_INPUT_TIMEOUT_MS =
  Number.isNaN(parsedUserInputTimeout) || parsedUserInputTimeout <= 0
    ? DEFAULT_USER_INPUT_TIMEOUT_MS
    : parsedUserInputTimeout;

interface PendingInput {
  resolve: (response: UserInputResponse) => void;
  reject: (err: Error) => void;
  ownerTokenHash: string;
}

// Global map of requestId → pending Promise resolver. RequestIds are UUIDs so no collisions.
const pendingInputs = new Map<string, PendingInput>();

interface ActiveConnection {
  res: Response;
  inputIds: Set<string>;
}

// Maps session key → active SSE connection info. Updated per SSE request so onUserInputRequest
// always writes to the current response object even when sessions are reused across requests.
const activeConnections = new Map<string, ActiveConnection>();

function extractToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  // Fallback to env var for testing/CI
  return process.env.COPILOT_GITHUB_TOKEN || undefined;
}

async function getClientForToken(token: string): Promise<CopilotClient> {
  if (clients.has(token)) {
    return clients.get(token)!;
  }
  const client = new CopilotClient({ githubToken: token });
  await client.start();
  clients.set(token, client);
  return client;
}

function sessionKey(token: string, sessionId: string): string {
  return `${token}:${sessionId}`;
}

// --- Helpers ---

function generateSessionId(): string {
  return crypto.randomUUID();
}

// Permission handler that auto-approves only our custom GitHub tools
// and denies dangerous built-in tool kinds (shell, file write, etc.)
const safePermissionHandler: PermissionHandler = async (request) => {
  // Auto-approve our custom GitHub API tools by name
  if (request.kind === "custom-tool") {
    return { kind: "approved" };
  }
  // Auto-approve read-only file operations
  if (request.kind === "read") {
    return { kind: "approved" };
  }
  // Deny shell commands and write operations by default
  return { kind: "denied-by-rules", rules: [{ description: `Denied ${request.kind}: only custom tools and read operations are auto-approved` }] };
};

// Extract a display name from a sub-agent event, preferring agentDisplayName over agentName
function extractSubagentName(data: { agentDisplayName?: unknown; agentName?: unknown } | undefined): string {
  if (typeof data?.agentDisplayName === "string" && data.agentDisplayName) {
    return data.agentDisplayName.slice(0, 100);
  }
  if (typeof data?.agentName === "string" && data.agentName) {
    return data.agentName.slice(0, 100);
  }
  return "Sub-agent";
}

// Allowed reasoning effort levels (from SDK ReasoningEffort type)
const ALLOWED_REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const;
type ReasoningEffort = typeof ALLOWED_REASONING_EFFORTS[number];

// Valid values and max lengths for research item updates
const VALID_RESEARCH_STATUSES = ["open", "researching", "resolved"] as const;
const MAX_RESEARCH_FINDINGS_LENGTH = 2000;
const MAX_RESEARCH_DECISION_LENGTH = 1000;

// Valid values and max lengths for issue draft updates
const VALID_ISSUE_DRAFT_STATUSES = ["draft", "ready", "created"] as const;
const MAX_ISSUE_TITLE_LENGTH = 256;
const MAX_ISSUE_PURPOSE_LENGTH = 500;
const MAX_ISSUE_PROBLEM_LENGTH = 1000;
const MAX_ISSUE_EXPECTED_OUTCOME_LENGTH = 500;
const MAX_ISSUE_SCOPE_BOUNDARIES_LENGTH = 1000;
const MAX_ISSUE_TECHNICAL_CONTEXT_LENGTH = 2000;
const MAX_ISSUE_TESTING_EXPECTATIONS_LENGTH = 1000;
const MAX_ISSUE_FILE_PATH_LENGTH = 256;
const MAX_ISSUE_FILE_REASON_LENGTH = 500;

/**
 * HTML-escapes a string to prevent stored XSS if the value is later rendered
 * in a browser context. Mirrors the sanitizeText() helper in planning-tools.ts.
 */
function sanitizeResearchText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// Build the shared session config used for both new and resumed sessions
function buildSessionConfig(token: string, model: string, reasoningEffort?: ReasoningEffort): SessionConfig {
  const cfg: SessionConfig = {
    model,
    streaming: true,
    onPermissionRequest: safePermissionHandler,
    systemMessage: {
      content: ORCHESTRATOR_SYSTEM_MESSAGE,
    },
    tools: [...createGitHubTools(token, planningStore), ...createPlanningTools(token, planningStore)],
    hooks: {
      onPreToolUse: async (input) => {
        console.log(`[hook] pre-tool: ${input.toolName}`);
        return { permissionDecision: "allow" as const };
      },
      onPostToolUse: async (input) => {
        console.log(`[hook] post-tool: ${input.toolName}`);
        return {};
      },
      onSessionStart: async (input) => {
        console.log(`[hook] session-start: ${input.source}`);
        return {};
      },
      onSessionEnd: async (input) => {
        console.log(`[hook] session-end: ${input.reason}`);
      },
      onErrorOccurred: async (input) => {
        console.error(`[hook] error: ${input.error} (${input.errorContext})`);
        return { errorHandling: input.recoverable ? "retry" as const : "abort" as const };
      },
    },
  };
  if (reasoningEffort) {
    cfg.reasoningEffort = reasoningEffort;
  }
  return cfg;
}

// Resolve or create a CopilotSession — handles resumption (Phase 2.3), tools (2.1), and hooks (2.4)
async function resolveSession(
  client: CopilotClient,
  token: string,
  sid: string,
  model: string,
  message: string,
  reasoningEffort?: ReasoningEffort
): Promise<CopilotSession> {
  const sessionConfig = buildSessionConfig(token, model, reasoningEffort);
  const skey = sessionKey(token, sid);

  // Attach onUserInputRequest — looks up the current active SSE connection dynamically so that
  // reused sessions (across multiple SSE requests) always write to the correct response object.
  sessionConfig.onUserInputRequest = async (request: UserInputRequest): Promise<UserInputResponse> => {
    const tHash = await hashToken(token);
    const conn = activeConnections.get(skey);
    if (!conn) {
      throw new Error("onUserInputRequest: no active SSE connection for this session");
    }
    const requestId = crypto.randomUUID();
    conn.res.write(`data: ${JSON.stringify({
      type: "user_input_request",
      requestId,
      question: request.question,
      choices: request.choices ?? null,
      allowFreeform: request.allowFreeform ?? true,
    })}\n\n`);
    return new Promise<UserInputResponse>((resolve, reject) => {
      const pendingCleanup = () => {
        pendingInputs.delete(requestId);
        conn.inputIds.delete(requestId);
      };
      const timeoutHandle = setTimeout(() => {
        if (pendingInputs.has(requestId)) {
          pendingCleanup();
          reject(new Error("User input request timed out"));
        }
      }, USER_INPUT_TIMEOUT_MS);
      const wrappedResolve = (value: UserInputResponse) => {
        pendingCleanup();
        clearTimeout(timeoutHandle);
        resolve(value);
      };
      const wrappedReject = (error: Error) => {
        pendingCleanup();
        clearTimeout(timeoutHandle);
        reject(error);
      };
      conn.inputIds.add(requestId);
      pendingInputs.set(requestId, { resolve: wrappedResolve, reject: wrappedReject, ownerTokenHash: tHash });
    });
  };

  // Phase 2.3: Try to resume an existing SDK session
  const tHash = await hashToken(token);
  const existingMeta = await sessionStore.getSession(tHash, sid);
  if (existingMeta?.sdkSessionId) {
    try {
      // Pass the full session config so resumed sessions get tools, hooks, and streaming
      const resumed = await client.resumeSession(existingMeta.sdkSessionId, sessionConfig);
      sessions.set(skey, resumed);
      return resumed;
    } catch (err: any) {
      console.warn(`[resumeSession] Failed to resume SDK session ${existingMeta.sdkSessionId}: ${err.message || err}`);
    }
  }

  // Phase 2.1: Create session with GitHub API tools
  // Phase 2.4: Create session with hooks for task tracking
  const session = await client.createSession(sessionConfig);
  sessions.set(skey, session);

  // Store session metadata with SDK session ID for resumption
  const title = message.length > 50 ? message.slice(0, 50) + "…" : message;
  const now = new Date().toISOString();
  await sessionStore.saveSession(tHash, {
    id: sid,
    title,
    model,
    createdAt: now,
    updatedAt: now,
    sdkSessionId: session.sessionId,
  });

  return session;
}

// --- Routes ---

// Health check (no auth required) — Phase 1.6: Enhanced health monitoring
app.get("/api/health", (_req: Request, res: Response) => {
  // Aggregate connection state from active clients
  const clientCount = clients.size;
  const sessionCount = sessions.size;
  const connectedClients = [...clients.values()].filter(
    (c) => c.getState() === "connected"
  ).length;

  res.json({
    status: "ok",
    storage: sessionStore instanceof AzureSessionStore ? "azure" : "memory",
    planningStorage: planningStore instanceof AzurePlanningStore ? "azure" : "memory",
    clients: {
      total: clientCount,
      connected: connectedClients,
    },
    activeSessions: sessionCount,
  });
});

// List available models
app.get("/api/models", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
    return;
  }
  try {
    const c = await getClientForToken(token);
    const models = await c.listModels();
    res.json({ models });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch models" });
  }
});

// List sessions for the authenticated user
app.get("/api/sessions", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
    return;
  }

  try {
    const tHash = await hashToken(token);
    const userSessions = await sessionStore.listSessions(tHash);
    res.json({ sessions: userSessions });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to list sessions" });
  }
});

// Delete a session
app.delete("/api/sessions/:id", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
    return;
  }

  const sid = req.params.id as string;

  try {
    const tHash = await hashToken(token);
    const existing = await sessionStore.getSession(tHash, sid);
    const inMemory = sessions.has(sessionKey(token, sid));
    const messages = await sessionStore.getMessages(tHash, sid);
    const hasMessages = Array.isArray(messages) && messages.length > 0;

    if (!existing && !inMemory && !hasMessages) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    sessions.delete(sessionKey(token, sid));
    await sessionStore.deleteSession(tHash, sid);
    res.json({ deleted: true, sessionId: sid });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete session" });
  }
});

// Get messages for a session
app.get("/api/sessions/:id/messages", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
    return;
  }

  const sid = req.params.id as string;

  try {
    const tHash = await hashToken(token);
    const messages = await sessionStore.getMessages(tHash, sid);
    res.json({ messages });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get messages" });
  }
});

// Save messages for a session
app.put("/api/sessions/:id/messages", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
    return;
  }

  const sid = req.params.id as string;
  const { messages } = req.body;

  if (!Array.isArray(messages)) {
    res.status(400).json({ error: "Missing or invalid 'messages' array" });
    return;
  }

  try {
    const tHash = await hashToken(token);
    await sessionStore.saveMessages(tHash, sid, messages);
    res.json({ saved: true, sessionId: sid });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to save messages" });
  }
});

// Chat endpoint (SSE streaming)
app.post("/api/chat", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
    return;
  }

  const { message, sessionId, model, reasoningEffort } = req.body;

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Missing or invalid 'message' field" });
    return;
  }

  // Validate reasoningEffort if provided
  if (reasoningEffort !== undefined && !ALLOWED_REASONING_EFFORTS.includes(reasoningEffort)) {
    res.status(400).json({ error: `Invalid reasoningEffort. Must be one of: ${ALLOWED_REASONING_EFFORTS.join(", ")}` });
    return;
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const c = await getClientForToken(token);

    let sid = sessionId;
    const key = sid ? sessionKey(token, sid) : "";
    let session: CopilotSession;

    if (sid && sessions.has(key)) {
      session = sessions.get(key)!;
    } else {
      sid = sid || generateSessionId();
      session = await resolveSession(c, token, sid, model || "gpt-4.1", message, reasoningEffort);
    }

    // Update session last-used time
    const tHash = await hashToken(token);
    const meta = await sessionStore.getSession(tHash, sid);
    if (meta) {
      meta.updatedAt = new Date().toISOString();
      await sessionStore.saveSession(tHash, meta);
    }

    // Collect unsubscribe functions
    const unsubscribers: (() => void)[] = [];

    // Track toolCallId -> toolName mappings for correlating start/complete events
    const activeTools = new Map<string, string>();

    // Register active SSE connection so onUserInputRequest can write to the correct response.
    // The final session key is computed from the resolved sid (which may have been generated above).
    const skey = sessionKey(token, sid);
    const connectionInputIds = new Set<string>();
    activeConnections.set(skey, { res, inputIds: connectionInputIds });

    const cleanup = () => {
      for (const unsub of unsubscribers) unsub();
      unsubscribers.length = 0;
      activeTools.clear();
      // Reject any pending user input requests from this connection (wrappedReject handles cleanup)
      for (const rid of connectionInputIds) {
        const pending = pendingInputs.get(rid);
        if (pending) {
          pending.reject(new Error("SSE connection closed"));
        }
      }
      connectionInputIds.clear();
      // Only delete the active connection if this response is still registered.
      // A newer SSE request on the same session may have already replaced it.
      const current = activeConnections.get(skey);
      if (current && current.res === res) {
        activeConnections.delete(skey);
      }
    };

    // Listen for streaming deltas
    unsubscribers.push(
      session.on("assistant.message_delta", (event) => {
        const content = event.data.deltaContent;
        if (content) {
          res.write(`data: ${JSON.stringify({ type: "delta", content })}\n\n`);
        }
      })
    );

    // Tool execution events — show agent activity in real-time
    unsubscribers.push(
      session.on("tool.execution_start", (event) => {
        const toolName = event.data?.toolName || "unknown";
        const toolCallId = event.data?.toolCallId;
        if (toolCallId) activeTools.set(toolCallId, toolName);
        res.write(`data: ${JSON.stringify({ type: "tool_start", tool: toolName })}\n\n`);
      })
    );

    unsubscribers.push(
      session.on("tool.execution_complete", (event) => {
        const toolCallId = event.data?.toolCallId;
        const toolName = (toolCallId && activeTools.get(toolCallId)) || "unknown";
        if (toolCallId) activeTools.delete(toolCallId);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload: Record<string, any> = { type: "tool_complete", tool: toolName };
        // For save_goal, parse the result content to extract the goal object for the frontend card
        if (toolName === "save_goal" && event.data?.result?.content) {
          try {
            const parsed = JSON.parse(event.data.result.content) as { goal?: unknown; error?: string };
            if (parsed.goal && !parsed.error) {
              payload.result = parsed.goal;
            }
          } catch {
            // result content isn't JSON — skip enrichment
          }
        }
        // For create_milestone_plan and get_milestones, parse the result to include milestones for the frontend timeline
        if ((toolName === "create_milestone_plan" || toolName === "get_milestones") && event.data?.result?.content) {
          try {
            const parsed = JSON.parse(event.data.result.content) as { milestones?: unknown; error?: string };
            if (Array.isArray(parsed.milestones) && !parsed.error) {
              payload.result = { milestones: parsed.milestones };
            }
          } catch {
            // result content isn't JSON — skip enrichment
          }
        }
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      })
    );

    // AI-generated session title
    unsubscribers.push(
      session.on("session.title_changed", (event) => {
        const title = event.data?.title || "";
        if (title) {
          res.write(`data: ${JSON.stringify({ type: "title", title })}\n\n`);
          // Update stored session title
          hashToken(token).then((tHash) => {
            sessionStore.getSession(tHash, sid!).then((meta) => {
              if (meta) {
                meta.title = title;
                sessionStore.saveSession(tHash, meta);
              }
            }).catch(() => {});
          }).catch(() => {});
        }
      })
    );

    // Token usage tracking
    unsubscribers.push(
      session.on("assistant.usage", (event) => {
        res.write(`data: ${JSON.stringify({ type: "usage", usage: event.data })}\n\n`);
      })
    );

    // Planning mode changes — emit planning_start when entering plan mode, plan_ready when exiting
    unsubscribers.push(
      session.on("session.mode_changed", (event) => {
        const newMode = event.data?.newMode || "";
        const previousMode = event.data?.previousMode || "";
        if (newMode === "plan") {
          res.write(`data: ${JSON.stringify({ type: "planning_start" })}\n\n`);
        } else if (previousMode === "plan") {
          res.write(`data: ${JSON.stringify({ type: "plan_ready" })}\n\n`);
        }
      })
    );

    // Agent intent — what the agent is currently doing
    unsubscribers.push(
      session.on("assistant.intent", (event) => {
        const intent = typeof event.data?.intent === "string" ? event.data.intent.slice(0, 200) : "";
        if (intent) {
          res.write(`data: ${JSON.stringify({ type: "intent", intent })}\n\n`);
        }
      })
    );

    // Sub-agent lifecycle events
    unsubscribers.push(
      session.on("subagent.started", (event) => {
        const name = extractSubagentName(event.data);
        res.write(`data: ${JSON.stringify({ type: "subagent_start", name })}\n\n`);
      })
    );

    unsubscribers.push(
      session.on("subagent.completed", (event) => {
        const name = extractSubagentName(event.data);
        res.write(`data: ${JSON.stringify({ type: "subagent_end", name, success: true })}\n\n`);
      })
    );

    unsubscribers.push(
      session.on("subagent.failed", (event) => {
        const name = extractSubagentName(event.data);
        const error = typeof event.data?.error === "string" ? event.data.error.slice(0, 200) : "Sub-agent failed";
        res.write(`data: ${JSON.stringify({ type: "subagent_end", name, success: false, error })}\n\n`);
      })
    );

    // Context compaction events
    unsubscribers.push(
      session.on("session.compaction_start", () => {
        res.write(`data: ${JSON.stringify({ type: "compaction", started: true })}\n\n`);
      })
    );

    unsubscribers.push(
      session.on("session.compaction_complete", (event) => {
        const tokensRemoved = typeof event.data?.tokensRemoved === "number" ? event.data.tokensRemoved : 0;
        res.write(`data: ${JSON.stringify({ type: "compaction", started: false, tokensRemoved })}\n\n`);
      })
    );

    // Stream complete
    unsubscribers.push(
      session.on("session.idle", () => {
        res.write(`data: ${JSON.stringify({ type: "done", sessionId: sid })}\n\n`);
        cleanup();
        res.end();
      })
    );

    // Error
    unsubscribers.push(
      session.on("session.error", (event) => {
        res.write(`data: ${JSON.stringify({ type: "error", message: event.data.message })}\n\n`);
        cleanup();
        res.end();
      })
    );

    // Handle client disconnect
    req.on("close", cleanup);

    await session.send({ prompt: message });
  } catch (err: any) {
    res.write(`data: ${JSON.stringify({ type: "error", message: err.message || "Server error" })}\n\n`);
    res.end();
  }
});

// Abort a streaming response
app.post("/api/chat/abort", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing token." });
    return;
  }

  const { sessionId: sid } = req.body;
  if (!sid) {
    res.status(400).json({ error: "Missing sessionId" });
    return;
  }

  const key = sessionKey(token, sid);
  const session = sessions.get(key);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  try {
    await session.abort();
    res.json({ aborted: true, sessionId: sid });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to abort" });
  }
});

// Submit a user input response to a pending onUserInputRequest from the agent
app.post("/api/chat/input", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
    return;
  }

  const { requestId, answer, wasFreeform } = req.body;

  if (!requestId || typeof requestId !== "string") {
    res.status(400).json({ error: "Missing or invalid 'requestId' field" });
    return;
  }
  if (answer === undefined || answer === null || typeof answer !== "string" || answer.trim() === "") {
    res.status(400).json({ error: "Missing or invalid 'answer' field (must be a non-empty string)" });
    return;
  }
  if (typeof wasFreeform !== "boolean") {
    res.status(400).json({ error: "Missing or invalid 'wasFreeform' field (must be a boolean)" });
    return;
  }

  const pending = pendingInputs.get(requestId);
  if (!pending) {
    res.status(404).json({ error: "No pending input request found for this requestId" });
    return;
  }

  // Verify ownership — only the user who initiated the session can answer their own question
  const tHash = await hashToken(token);
  if (pending.ownerTokenHash !== tHash) {
    res.status(403).json({ error: "Forbidden: this input request does not belong to your session" });
    return;
  }

  // wrappedResolve handles cleanup (delete from pendingInputs, inputIds, clearTimeout)
  pending.resolve({ answer, wasFreeform });
  res.json({ ok: true });
});

// Phase 2.5: Switch model mid-conversation
app.post("/api/chat/model", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing token." });
    return;
  }

  const { sessionId: sid, model } = req.body;
  if (!sid) {
    res.status(400).json({ error: "Missing sessionId" });
    return;
  }
  if (!model || typeof model !== "string") {
    res.status(400).json({ error: "Missing or invalid 'model' field" });
    return;
  }

  const key = sessionKey(token, sid);
  const session = sessions.get(key);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  try {
    await session.setModel(model);

    // Update stored session metadata
    const tHash = await hashToken(token);
    const meta = await sessionStore.getSession(tHash, sid);
    if (meta) {
      meta.model = model;
      meta.updatedAt = new Date().toISOString();
      await sessionStore.saveSession(tHash, meta);
    }

    res.json({ switched: true, sessionId: sid, model });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to switch model" });
  }
});

// Phase 2.6: Quota monitoring
app.get("/api/quota", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
    return;
  }

  try {
    const c = await getClientForToken(token);
    const quota = await c.rpc.account.getQuota();
    res.json({ quota });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch quota" });
  }
});

// --- Goal API Endpoints ---

/**
 * Returns the goal with the given ID if it exists and belongs to the authenticated user.
 * Returns null if the goal does not exist or is not owned by the user.
 */
async function getOwnedGoal(token: string, goalId: string): Promise<import("./planning-types.js").Goal | null> {
  const goal = await planningStore.getGoal(goalId);
  if (!goal) return null;
  const tHash = await hashToken(token);
  const userSessions = await sessionStore.listSessions(tHash);
  const userSessionIds = new Set(userSessions.map((s) => s.id));
  if (!userSessionIds.has(goal.sessionId)) return null;
  return goal;
}

// List all goals for the authenticated user across all their sessions
app.get("/api/goals", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
    return;
  }

  try {
    const tHash = await hashToken(token);
    // Gather all sessions belonging to this user, then collect goals from each.
    // TODO: Consider adding listGoalsForSessions(sessionIds) for efficiency as sessions grow.
    const userSessions = await sessionStore.listSessions(tHash);
    const goalArrays = await Promise.all(
      userSessions.map((s) => planningStore.listGoals(s.id))
    );
    const goals = goalArrays.flat();
    res.json({ goals });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to list goals" });
  }
});

// Get a specific goal by ID, scoped to the authenticated user
app.get("/api/goals/:id", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
    return;
  }

  const goalId = req.params.id as string;

  try {
    const goal = await getOwnedGoal(token, goalId);
    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    res.json(goal);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get goal" });
  }
});

// Get research items for a specific goal, scoped to the authenticated user
app.get("/api/goals/:id/research", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
    return;
  }

  const goalId = req.params.id as string;

  try {
    const goal = await getOwnedGoal(token, goalId);
    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    const research = await planningStore.listResearchItems(goalId);
    res.json({ research });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get research items" });
  }
});

// Update a research item's fields (findings, decision, status), scoped to the authenticated user
app.patch("/api/goals/:goalId/research/:itemId", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
    return;
  }

  const goalId = req.params.goalId as string;
  const itemId = req.params.itemId as string;
  const body = req.body as Record<string, unknown>;

  const updates: Partial<Omit<import("./planning-types.js").ResearchItem, "id" | "goalId">> = {};

  if ("findings" in body) {
    if (typeof body.findings !== "string") {
      res.status(400).json({ error: "findings must be a string" });
      return;
    }
    const trimmedFindings = body.findings.trim();
    if (trimmedFindings.length > MAX_RESEARCH_FINDINGS_LENGTH) {
      res.status(400).json({ error: `findings must be at most ${MAX_RESEARCH_FINDINGS_LENGTH} characters` });
      return;
    }
    updates.findings = sanitizeResearchText(trimmedFindings);
  }

  if ("decision" in body) {
    if (typeof body.decision !== "string") {
      res.status(400).json({ error: "decision must be a string" });
      return;
    }
    const trimmedDecision = body.decision.trim();
    if (trimmedDecision.length > MAX_RESEARCH_DECISION_LENGTH) {
      res.status(400).json({ error: `decision must be at most ${MAX_RESEARCH_DECISION_LENGTH} characters` });
      return;
    }
    updates.decision = sanitizeResearchText(trimmedDecision);
  }

  if ("status" in body) {
    if (!VALID_RESEARCH_STATUSES.includes(body.status as (typeof VALID_RESEARCH_STATUSES)[number])) {
      res.status(400).json({ error: "status must be one of: open, researching, resolved" });
      return;
    }
    updates.status = body.status as "open" | "researching" | "resolved";
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields provided for update" });
    return;
  }

  try {
    const goal = await getOwnedGoal(token, goalId);
    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    // Verify the research item exists and belongs to the requested goal (IDOR guard)
    const existingItem = await planningStore.getResearchItem(itemId);
    if (!existingItem || existingItem.goalId !== goalId) {
      res.status(404).json({ error: "Research item not found" });
      return;
    }

    const updated = await planningStore.updateResearchItem(itemId, updates);
    if (!updated) {
      res.status(404).json({ error: "Research item not found" });
      return;
    }

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update research item" });
  }
});

// Get milestones for a specific goal, scoped to the authenticated user
app.get("/api/goals/:id/milestones", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
    return;
  }

  const goalId = req.params.id as string;

  try {
    const goal = await getOwnedGoal(token, goalId);
    if (!goal) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    const milestones = await planningStore.listMilestones(goalId);
    res.json({ milestones });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get milestones" });
  }
});

// Get issue drafts for a specific milestone, scoped to the authenticated user
app.get("/api/milestones/:id/issues", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
    return;
  }

  const milestoneId = req.params.id as string;

  try {
    const milestone = await planningStore.getMilestone(milestoneId);
    if (!milestone) {
      res.status(404).json({ error: "Milestone not found" });
      return;
    }

    const goal = await getOwnedGoal(token, milestone.goalId);
    if (!goal) {
      res.status(404).json({ error: "Milestone not found" });
      return;
    }

    const issues = await planningStore.listIssueDrafts(milestoneId);
    res.json({ issues });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to get issue drafts" });
  }
});

// Update an issue draft (status, text fields) scoped to the authenticated user
app.patch("/api/milestones/:milestoneId/issues/:issueId", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
    return;
  }

  const milestoneId = req.params.milestoneId as string;
  const issueId = req.params.issueId as string;
  const body = req.body as Record<string, unknown>;

  const updates: Partial<Omit<import("./planning-types.js").IssueDraft, "id" | "milestoneId">> = {};

  // Validate and sanitize text fields
  const textFields: Array<{ key: string; max: number }> = [
    { key: "title", max: MAX_ISSUE_TITLE_LENGTH },
    { key: "purpose", max: MAX_ISSUE_PURPOSE_LENGTH },
    { key: "problem", max: MAX_ISSUE_PROBLEM_LENGTH },
    { key: "expectedOutcome", max: MAX_ISSUE_EXPECTED_OUTCOME_LENGTH },
    { key: "scopeBoundaries", max: MAX_ISSUE_SCOPE_BOUNDARIES_LENGTH },
    { key: "technicalContext", max: MAX_ISSUE_TECHNICAL_CONTEXT_LENGTH },
    { key: "testingExpectations", max: MAX_ISSUE_TESTING_EXPECTATIONS_LENGTH },
    { key: "patternReference", max: MAX_ISSUE_TECHNICAL_CONTEXT_LENGTH },
  ];

  for (const { key, max } of textFields) {
    if (key in body) {
      if (typeof body[key] !== "string") {
        res.status(400).json({ error: `${key} must be a string` });
        return;
      }
      const trimmed = (body[key] as string).trim();
      if (trimmed.length > max) {
        res.status(400).json({ error: `${key} must be at most ${max} characters` });
        return;
      }
      (updates as Record<string, unknown>)[key] = sanitizeResearchText(trimmed);
    }
  }

  // Validate string-array fields
  const MAX_ARRAY_ITEMS = 50;
  const MAX_ARRAY_ITEM_LENGTH = 500;
  const stringArrayFields = ["acceptanceCriteria", "securityChecklist", "verificationCommands", "researchLinks", "dependencies"];
  for (const key of stringArrayFields) {
    if (key in body) {
      if (!Array.isArray(body[key]) || !(body[key] as unknown[]).every((v) => typeof v === "string")) {
        res.status(400).json({ error: `${key} must be an array of strings` });
        return;
      }
      const arr = body[key] as string[];
      if (arr.length > MAX_ARRAY_ITEMS) {
        res.status(400).json({ error: `${key} must have at most ${MAX_ARRAY_ITEMS} items` });
        return;
      }
      for (const item of arr) {
        if (item.trim().length > MAX_ARRAY_ITEM_LENGTH) {
          res.status(400).json({ error: `${key} items must be at most ${MAX_ARRAY_ITEM_LENGTH} characters each` });
          return;
        }
      }
      (updates as Record<string, unknown>)[key] = arr.map((s) => sanitizeResearchText(s.trim()));
    }
  }

  // Validate FileRef array fields (filesToModify, filesToRead)
  const fileRefFields = ["filesToModify", "filesToRead"];
  for (const key of fileRefFields) {
    if (key in body) {
      if (!Array.isArray(body[key])) {
        res.status(400).json({ error: `${key} must be an array` });
        return;
      }
      const refs = body[key] as unknown[];
      const validated: import("./planning-types.js").FileRef[] = [];
      for (const ref of refs) {
        if (typeof ref !== "object" || ref === null) {
          res.status(400).json({ error: `${key} items must be objects with path and reason` });
          return;
        }
        const r = ref as Record<string, unknown>;
        if (typeof r.path !== "string" || typeof r.reason !== "string") {
          res.status(400).json({ error: `${key} items must have string path and reason` });
          return;
        }
        const trimmedPath = r.path.trim();
        const trimmedReason = r.reason.trim();
        if (trimmedPath.length === 0) {
          res.status(400).json({ error: `${key} path must not be empty` });
          return;
        }
        if (trimmedReason.length === 0) {
          res.status(400).json({ error: `${key} reason must not be empty` });
          return;
        }
        if (trimmedPath.length > MAX_ISSUE_FILE_PATH_LENGTH) {
          res.status(400).json({ error: `${key} path must be at most ${MAX_ISSUE_FILE_PATH_LENGTH} characters` });
          return;
        }
        if (trimmedReason.length > MAX_ISSUE_FILE_REASON_LENGTH) {
          res.status(400).json({ error: `${key} reason must be at most ${MAX_ISSUE_FILE_REASON_LENGTH} characters` });
          return;
        }
        validated.push({ path: sanitizeResearchText(trimmedPath), reason: sanitizeResearchText(trimmedReason) });
      }
      (updates as Record<string, unknown>)[key] = validated;
    }
  }

  // Validate status
  if ("status" in body) {
    if (!VALID_ISSUE_DRAFT_STATUSES.includes(body.status as (typeof VALID_ISSUE_DRAFT_STATUSES)[number])) {
      res.status(400).json({ error: "status must be one of: draft, ready, created" });
      return;
    }
    updates.status = body.status as "draft" | "ready" | "created";
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields provided for update" });
    return;
  }

  try {
    const milestone = await planningStore.getMilestone(milestoneId);
    if (!milestone) {
      res.status(404).json({ error: "Milestone not found" });
      return;
    }

    const goal = await getOwnedGoal(token, milestone.goalId);
    if (!goal) {
      res.status(404).json({ error: "Milestone not found" });
      return;
    }

    // Verify the issue draft exists and belongs to the requested milestone (IDOR guard)
    const existingDraft = await planningStore.getIssueDraft(issueId);
    if (!existingDraft || existingDraft.milestoneId !== milestoneId) {
      res.status(404).json({ error: "Issue draft not found" });
      return;
    }

    const updated = await planningStore.updateIssueDraft(issueId, updates);
    if (!updated) {
      res.status(404).json({ error: "Issue draft not found" });
      return;
    }

    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update issue draft" });
  }
});

// Validation pattern for GitHub owner and repo names
const GITHUB_OWNER_RE = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,37}[a-zA-Z0-9])?$/;
const GITHUB_REPO_RE = /^[a-zA-Z0-9._-]{1,100}$/;

// Push a single planning milestone to GitHub as a real GitHub Milestone.
// Idempotent: if milestone already has a githubNumber, returns existing data.
app.post("/api/milestones/:id/push-to-github", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
    return;
  }

  const milestoneId = req.params.id as string;
  const body = req.body as Record<string, unknown>;

  const owner = typeof body.owner === "string" ? body.owner.trim() : "";
  const repo = typeof body.repo === "string" ? body.repo.trim() : "";

  if (!owner || !GITHUB_OWNER_RE.test(owner)) {
    res.status(400).json({ error: "owner must be a valid GitHub username or organization name" });
    return;
  }
  if (!repo || !GITHUB_REPO_RE.test(repo)) {
    res.status(400).json({ error: "repo must be a valid GitHub repository name" });
    return;
  }

  try {
    const milestone = await planningStore.getMilestone(milestoneId);
    if (!milestone) {
      res.status(404).json({ error: "Milestone not found" });
      return;
    }

    const goal = await getOwnedGoal(token, milestone.goalId);
    if (!goal) {
      res.status(404).json({ error: "Milestone not found" });
      return;
    }

    // Idempotency: if already pushed, return existing data
    if (milestone.githubNumber !== undefined) {
      res.json({
        milestoneId,
        githubNumber: milestone.githubNumber,
        githubUrl: milestone.githubUrl,
        alreadyExisted: true,
      });
      return;
    }

    const title = milestone.name;
    const description = milestone.goal;

    // Check for existing GitHub milestone with the same title (pagination)
    let githubNumber: number | undefined;
    let githubUrl: string | undefined;
    let page = 1;
    while (githubNumber === undefined) {
      const existing = (await githubFetch(
        token,
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/milestones?state=all&per_page=100&page=${page}`
      )) as any[];
      const match = existing.find((m: any) => m.title === title);
      if (match) {
        githubNumber = match.number;
        githubUrl = match.html_url;
        break;
      }
      if (existing.length < 100) break;
      page += 1;
    }

    if (githubNumber === undefined) {
      const created = (await githubWrite(
        token,
        "POST",
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/milestones`,
        { title, description }
      )) as any;
      githubNumber = created.number;
      githubUrl = created.html_url;
    }

    const updated = await planningStore.updateMilestone(milestoneId, { githubNumber, githubUrl });
    if (!updated) {
      res.status(404).json({ error: "Milestone not found after update" });
      return;
    }

    res.json({ milestoneId, githubNumber, githubUrl, alreadyExisted: false });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to push milestone to GitHub" });
  }
});

// Push a single issue draft to GitHub as a real GitHub Issue.
// Only "ready" drafts are accepted. Idempotent: if already "created", returns existing data.
app.post("/api/milestones/:milestoneId/issues/:issueId/push-to-github", async (req: Request, res: Response) => {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
    return;
  }

  const milestoneId = req.params.milestoneId as string;
  const issueId = req.params.issueId as string;
  const body = req.body as Record<string, unknown>;

  const owner = typeof body.owner === "string" ? body.owner.trim() : "";
  const repo = typeof body.repo === "string" ? body.repo.trim() : "";

  if (!owner || !GITHUB_OWNER_RE.test(owner)) {
    res.status(400).json({ error: "owner must be a valid GitHub username or organization name" });
    return;
  }
  if (!repo || !GITHUB_REPO_RE.test(repo)) {
    res.status(400).json({ error: "repo must be a valid GitHub repository name" });
    return;
  }

  // Validate optional labels array
  let labels: string[] = [];
  if (body.labels !== undefined) {
    if (!Array.isArray(body.labels) || !body.labels.every((l) => typeof l === "string")) {
      res.status(400).json({ error: "labels must be an array of strings" });
      return;
    }
    labels = Array.from(
      new Set(
        (body.labels as string[])
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
      )
    );
  }

  try {
    const milestone = await planningStore.getMilestone(milestoneId);
    if (!milestone) {
      res.status(404).json({ error: "Milestone not found" });
      return;
    }

    const goal = await getOwnedGoal(token, milestone.goalId);
    if (!goal) {
      res.status(404).json({ error: "Milestone not found" });
      return;
    }

    // IDOR guard: verify the issue draft belongs to the stated milestone
    const draft = await planningStore.getIssueDraft(issueId);
    if (!draft || draft.milestoneId !== milestoneId) {
      res.status(404).json({ error: "Issue draft not found" });
      return;
    }

    // Idempotency: if already created, return existing data
    if (draft.status === "created") {
      if (draft.githubIssueNumber === undefined) {
        res.status(500).json({ error: "Issue draft is in 'created' status but is missing githubIssueNumber" });
        return;
      }
      res.json({
        draftId: issueId,
        githubIssueNumber: draft.githubIssueNumber,
        // Use the persisted URL if available; fall back to constructing from the current request's owner/repo
        githubIssueUrl: draft.githubIssueUrl ?? `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${draft.githubIssueNumber}`,
        alreadyCreated: true,
      });
      return;
    }

    if (draft.status !== "ready") {
      res.status(400).json({ error: `Issue draft has status '${draft.status}' — only 'ready' drafts can be pushed to GitHub` });
      return;
    }

    // Fetch ResearchItems for the Research Context section concurrently
    const researchItemResults = await Promise.all(
      draft.researchLinks.map((researchId) => planningStore.getResearchItem(researchId))
    );
    const researchItems: import("./planning-types.js").ResearchItem[] = researchItemResults.filter(
      (item): item is import("./planning-types.js").ResearchItem => item != null
    );

    const issueBody = buildIssueBody(draft, researchItems);

    const requestBody: Record<string, unknown> = {
      title: draft.title,
      body: issueBody,
    };

    // Associate with GitHub Milestone if one has been created
    if (milestone.githubNumber !== undefined) {
      requestBody.milestone = milestone.githubNumber;
    }

    if (labels.length > 0) {
      requestBody.labels = labels;
    }

    const created = (await githubWrite(
      token,
      "POST",
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
      requestBody
    )) as any;

    if (!created.number || !Number.isFinite(created.number)) {
      res.status(500).json({ error: "GitHub API response is missing a valid issue number" });
      return;
    }

    const updatedDraft = await planningStore.updateIssueDraft(issueId, {
      status: "created",
      githubIssueNumber: created.number,
      githubIssueUrl: created.html_url,
    });
    if (!updatedDraft) {
      res.status(404).json({ error: "Issue draft not found after update" });
      return;
    }

    res.json({
      draftId: issueId,
      githubIssueNumber: created.number,
      githubIssueUrl: created.html_url,
      alreadyCreated: false,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to push issue to GitHub" });
  }
});

// Test-only: seed a goal directly into the planning store (only active when ENABLE_GOAL_SEED=true)
if (process.env.ENABLE_GOAL_SEED === "true") {
  app.post("/api/test/seed-goal", async (req: Request, res: Response) => {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
      return;
    }
    try {
      const goal = req.body as import("./planning-types.js").Goal;
      const created = await planningStore.createGoal(goal);
      res.status(201).json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to seed goal" });
    }
  });

  app.post("/api/test/seed-research-item", async (req: Request, res: Response) => {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
      return;
    }
    try {
      const item = req.body as import("./planning-types.js").ResearchItem;

      if (typeof item.goalId !== "string" || item.goalId.trim().length === 0) {
        res.status(400).json({ error: "goalId is required and must be a string" });
        return;
      }

      // Validate findings/decision types to avoid seeding invalid data
      if ("findings" in item && item.findings !== undefined && typeof item.findings !== "string") {
        res.status(400).json({ error: "findings must be a string if provided" });
        return;
      }
      if ("decision" in item && item.decision !== undefined && typeof item.decision !== "string") {
        res.status(400).json({ error: "decision must be a string if provided" });
        return;
      }

      // Normalize sourceUrl: must be a string http/https URL if provided; otherwise strip it
      let normalizedSourceUrl: string | undefined;
      if (typeof (item as any).sourceUrl === "string") {
        try {
          const parsed = new URL((item as any).sourceUrl);
          if (parsed.protocol === "http:" || parsed.protocol === "https:") {
            normalizedSourceUrl = (item as any).sourceUrl;
          }
        } catch {
          // Invalid URL — omit sourceUrl
        }
      }

      // Default missing findings/decision to empty strings
      const normalizedItem: import("./planning-types.js").ResearchItem = {
        ...item,
        findings: typeof item.findings === "string" ? item.findings : "",
        decision: typeof item.decision === "string" ? item.decision : "",
        ...(normalizedSourceUrl !== undefined ? { sourceUrl: normalizedSourceUrl } : {}),
      };

      const goal = await getOwnedGoal(token, normalizedItem.goalId);
      if (!goal) {
        res.status(404).json({ error: "Referenced goal does not exist or does not belong to the authenticated user" });
        return;
      }

      try {
        const created = await planningStore.createResearchItem(normalizedItem);
        res.status(201).json(created);
      } catch (err: any) {
        // planningStore.createResearchItem throws on validation errors (invalid/missing fields)
        res.status(400).json({ error: err.message || "Invalid research item" });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to seed research item" });
    }
  });

  app.post("/api/test/seed-milestone", async (req: Request, res: Response) => {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
      return;
    }
    try {
      const milestone = req.body as import("./planning-types.js").Milestone;

      if (typeof milestone.goalId !== "string" || milestone.goalId.trim().length === 0) {
        res.status(400).json({ error: "goalId is required and must be a string" });
        return;
      }

      const goal = await getOwnedGoal(token, milestone.goalId);
      if (!goal) {
        res.status(404).json({ error: "Referenced goal does not exist or does not belong to the authenticated user" });
        return;
      }

      try {
        const created = await planningStore.createMilestone(milestone);
        res.status(201).json(created);
      } catch (err: any) {
        // Validation or domain errors from createMilestone → 400 Bad Request
        res.status(400).json({ error: err.message || "Invalid milestone" });
      }
    } catch (err: any) {
      // Unexpected errors (e.g., getOwnedGoal/session store failures) → 500 Internal Server Error
      res.status(500).json({ error: err.message || "Failed to seed milestone" });
    }
  });

  app.post("/api/test/seed-issue-draft", async (req: Request, res: Response) => {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
      return;
    }
    try {
      const draft = req.body as import("./planning-types.js").IssueDraft;

      if (typeof draft.milestoneId !== "string" || draft.milestoneId.trim().length === 0) {
        res.status(400).json({ error: "milestoneId is required and must be a string" });
        return;
      }

      const milestone = await planningStore.getMilestone(draft.milestoneId);
      if (!milestone) {
        res.status(404).json({ error: "Referenced milestone does not exist" });
        return;
      }

      const goal = await getOwnedGoal(token, milestone.goalId);
      if (!goal) {
        res.status(404).json({ error: "Referenced milestone does not exist or does not belong to the authenticated user" });
        return;
      }

      try {
        const created = await planningStore.createIssueDraft(draft);
        res.status(201).json(created);
      } catch (err: any) {
        // Validation or domain errors from createIssueDraft → 400 Bad Request
        res.status(400).json({ error: err.message || "Invalid issue draft" });
      }
    } catch (err: any) {
      // Unexpected errors → 500 Internal Server Error
      res.status(500).json({ error: err.message || "Failed to seed issue draft" });
    }
  });

  // Seed a pending user input request (for integration tests of POST /api/chat/input roundtrip)
  app.post("/api/test/seed-pending-input", async (req: Request, res: Response) => {
    const token = extractToken(req);
    if (!token) {
      res.status(401).json({ error: "Missing token. Provide Authorization: Bearer <token> header." });
      return;
    }
    const { requestId } = req.body;
    if (!requestId || typeof requestId !== "string") {
      res.status(400).json({ error: "Missing or invalid 'requestId' field" });
      return;
    }
    if (pendingInputs.has(requestId)) {
      res.status(409).json({ error: "A pending input with this requestId already exists" });
      return;
    }
    const tHash = await hashToken(token);
    // Create a no-op pending entry scoped to this token so the roundtrip test can resolve it
    const wrappedResolve = (_value: UserInputResponse) => { pendingInputs.delete(requestId); };
    const wrappedReject = (_err: Error) => { pendingInputs.delete(requestId); };
    pendingInputs.set(requestId, { resolve: wrappedResolve, reject: wrappedReject, ownerTokenHash: tHash });
    res.status(201).json({ ok: true, requestId });
  });
}

// --- SPA Catch-All Route ---
// Serve index.html for any non-API request that doesn't match a static file.
// This supports client-side routing in the React frontend.
// Express 5 uses {*path} syntax instead of the old * wildcard.
app.get("/{*path}", (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(staticRoot, "index.html"));
});

// --- Start Server ---

async function startServer() {
  // Initialize Azure storage if configured
  if (sessionStore instanceof AzureSessionStore) {
    try {
      await sessionStore.initialize();
      console.log("Azure Storage initialized (table + blob)");
    } catch (err: any) {
      console.error("Failed to initialize Azure Storage:", err.message);
      console.log("Falling back to in-memory storage");
      sessionStore = new InMemorySessionStore();
    }
  } else {
    console.log("Using in-memory session storage (set AZURE_STORAGE_ACCOUNT_NAME for persistence)");
  }

  // Initialize Azure planning store if configured
  if (planningStore instanceof AzurePlanningStore) {
    try {
      await planningStore.initialize();
      console.log("Azure Planning Store initialized (4 tables)");
    } catch (err: any) {
      console.error("Failed to initialize Azure Planning Store:", err.message);
      console.log("Falling back to in-memory planning storage (planning data will not persist)");
      planningStore = new InMemoryPlanningStore();
    }
  } else {
    console.log("Using in-memory planning storage (set AZURE_STORAGE_ACCOUNT_NAME for persistence)");
  }

  const server = app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });

  // Graceful shutdown
  async function shutdown() {
    console.log("\nShutting down...");
    const stopPromises = [...clients.values()].map((c) =>
      c.stop().catch(() => {})
    );
    await Promise.all(stopPromises);
    server.close();
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

startServer();
