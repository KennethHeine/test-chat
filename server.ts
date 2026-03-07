import express, { Request, Response } from "express";
import { CopilotClient, CopilotSession, approveAll } from "@github/copilot-sdk";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import path from "path";
import { createSessionStore, hashToken, AzureSessionStore, InMemorySessionStore, type SessionStore } from "./storage.js";

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

function isCopilotCliAvailable(): boolean {
  try {
    execSync("copilot --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function generateSessionId(): string {
  return crypto.randomUUID();
}

// --- Routes ---

// Health check (no auth required)
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    copilotCli: isCopilotCliAvailable(),
    storage: sessionStore instanceof AzureSessionStore ? "azure" : "memory",
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

    let session: CopilotSession;
    let sid = sessionId;
    const key = sid ? sessionKey(token, sid) : "";

    if (sid && sessions.has(key)) {
      session = sessions.get(key)!;
    } else {
      sid = sid || generateSessionId();
      session = await c.createSession({
        model: model || "gpt-4.1",
        streaming: true,
        onPermissionRequest: approveAll,
        systemMessage: {
          content: ORCHESTRATOR_SYSTEM_MESSAGE,
        },
      });
      sessions.set(sessionKey(token, sid), session);

      // Store session metadata
      const title = message.length > 50 ? message.slice(0, 50) + "…" : message;
      const now = new Date().toISOString();
      const tHash = await hashToken(token);
      await sessionStore.saveSession(tHash, {
        id: sid,
        title,
        model: model || "gpt-4.1",
        createdAt: now,
        updatedAt: now,
      });
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

    const cleanup = () => {
      for (const unsub of unsubscribers) unsub();
      unsubscribers.length = 0;
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
        res.write(`data: ${JSON.stringify({ type: "tool_start", tool: toolName })}\n\n`);
      })
    );

    unsubscribers.push(
      session.on("tool.execution_complete", () => {
        res.write(`data: ${JSON.stringify({ type: "tool_complete" })}\n\n`);
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
