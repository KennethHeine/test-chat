import express, { Request, Response } from "express";
import { CopilotClient, CopilotSession, approveAll } from "@github/copilot-sdk";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import path from "path";

config(); // load .env

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = parseInt(process.env.PORT || "3000", 10);

// --- Copilot Client ---

let client: CopilotClient | null = null;
const sessions = new Map<string, CopilotSession>();

function buildClientOptions() {
  const token = process.env.GITHUB_TOKEN;
  if (token) return { githubToken: token };
  return { useLoggedInUser: true };
}

async function getClient(): Promise<CopilotClient> {
  if (!client) {
    client = new CopilotClient(buildClientOptions());
    await client.start();
  }
  return client;
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

function isAuthenticated(): boolean {
  // True if PAT is set or gh CLI is available
  if (process.env.GITHUB_TOKEN) return true;
  try {
    execSync("gh auth status", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function generateSessionId(): string {
  return crypto.randomUUID();
}

// --- Routes ---

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    copilotCli: isCopilotCliAvailable(),
    authenticated: isAuthenticated(),
  });
});

// List available models
app.get("/api/models", async (_req: Request, res: Response) => {
  try {
    const c = await getClient();
    const models = await c.listModels();
    res.json({ models });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch models" });
  }
});

// Chat endpoint (SSE streaming)
app.post("/api/chat", async (req: Request, res: Response) => {
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
    const c = await getClient();

    let session: CopilotSession;
    let sid = sessionId;

    if (sid && sessions.has(sid)) {
      session = sessions.get(sid)!;
    } else {
      sid = sid || generateSessionId();
      session = await c.createSession({
        model: model || "gpt-4.1",
        streaming: true,
        onPermissionRequest: approveAll,
      });
      sessions.set(sid, session);
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

// --- Start Server ---

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

// Graceful shutdown
async function shutdown() {
  console.log("\nShutting down...");
  if (client) {
    try {
      await client.stop();
    } catch {
      // ignore errors during shutdown
    }
  }
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
