import express, { Request, Response } from "express";
import { CopilotClient, CopilotSession } from "@github/copilot-sdk";
import type { SessionConfig, PermissionHandler } from "@github/copilot-sdk";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import path from "path";
import { createSessionStore, hashToken, AzureSessionStore, InMemorySessionStore, type SessionStore } from "./storage.js";
import { createGitHubTools, GITHUB_TOOL_NAMES } from "./tools.js";
import { InMemoryPlanningStore, type PlanningStore } from "./planning-store.js";
import { createPlanningTools } from "./planning-tools.js";

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
app.use(express.static(path.join(__dirname, "public")));

const PORT = parseInt(process.env.PORT || "3000", 10);

// --- Storage ---

const storageAccountName = process.env.AZURE_STORAGE_ACCOUNT_NAME || "";
let sessionStore: SessionStore = createSessionStore(storageAccountName || undefined);

// --- Planning Store ---
// Goals are created via planning tools (planning-tools.ts), not through API endpoints.
// This store is shared with the tool factory once planning tools are wired in.
const planningStore: PlanningStore = new InMemoryPlanningStore();

// --- Per-user Copilot Clients ---

// Key: github token → CopilotClient (one client per user token)
const clients = new Map<string, CopilotClient>();
// Key: "token:sessionId" → CopilotSession (in-memory SDK sessions for active conversations)
const sessions = new Map<string, CopilotSession>();

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

// Build the shared session config used for both new and resumed sessions
function buildSessionConfig(token: string, model: string): SessionConfig {
  return {
    model,
    streaming: true,
    onPermissionRequest: safePermissionHandler,
    systemMessage: {
      content: ORCHESTRATOR_SYSTEM_MESSAGE,
    },
    tools: [...createGitHubTools(token), ...createPlanningTools(token, planningStore)],
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
}

// Resolve or create a CopilotSession — handles resumption (Phase 2.3), tools (2.1), and hooks (2.4)
async function resolveSession(
  client: CopilotClient,
  token: string,
  sid: string,
  model: string,
  message: string
): Promise<CopilotSession> {
  const sessionConfig = buildSessionConfig(token, model);

  // Phase 2.3: Try to resume an existing SDK session
  const tHash = await hashToken(token);
  const existingMeta = await sessionStore.getSession(tHash, sid);
  if (existingMeta?.sdkSessionId) {
    try {
      // Pass the full session config so resumed sessions get tools, hooks, and streaming
      const resumed = await client.resumeSession(existingMeta.sdkSessionId, sessionConfig);
      sessions.set(sessionKey(token, sid), resumed);
      return resumed;
    } catch (err: any) {
      console.warn(`[resumeSession] Failed to resume SDK session ${existingMeta.sdkSessionId}: ${err.message || err}`);
    }
  }

  // Phase 2.1: Create session with GitHub API tools
  // Phase 2.4: Create session with hooks for task tracking
  const session = await client.createSession(sessionConfig);
  sessions.set(sessionKey(token, sid), session);

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

  const { message, sessionId, model } = req.body;

  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Missing or invalid 'message' field" });
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
      session = await resolveSession(c, token, sid, model || "gpt-4.1", message);
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

    const cleanup = () => {
      for (const unsub of unsubscribers) unsub();
      unsubscribers.length = 0;
      activeTools.clear();
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
}

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
