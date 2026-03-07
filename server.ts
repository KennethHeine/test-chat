import express, { Request, Response } from "express";
import { CopilotClient, CopilotSession, approveAll } from "@github/copilot-sdk";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { config } from "dotenv";
import { randomBytes } from "crypto";
import path from "path";

config(); // load .env

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = parseInt(process.env.PORT || "3000", 10);

// --- GitHub OAuth Config ---
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "";

// CSRF state tokens for OAuth (state → expiry timestamp)
const oauthStates = new Map<string, number>();
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// --- Per-user Copilot Clients ---

// Key: github token → CopilotClient (one client per user token)
const clients = new Map<string, CopilotClient>();
// Key: "token:sessionId" → CopilotSession
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
      });
      sessions.set(sessionKey(token, sid), session);
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

// --- GitHub OAuth Routes ---

// Check if OAuth is configured
app.get("/api/auth/github/status", (_req: Request, res: Response) => {
  res.json({ configured: !!(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET) });
});

// Start OAuth flow — redirect to GitHub
app.get("/api/auth/github", (_req: Request, res: Response) => {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    res.status(501).json({ error: "GitHub OAuth not configured" });
    return;
  }

  const state = randomBytes(32).toString("hex");
  oauthStates.set(state, Date.now() + OAUTH_STATE_TTL_MS);

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    scope: "copilot",
    state,
  });

  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// OAuth callback — exchange code for token
app.get("/api/auth/github/callback", async (req: Request, res: Response) => {
  const { code, state } = req.query as { code?: string; state?: string };

  if (!code || !state) {
    res.status(400).send("Missing code or state parameter");
    return;
  }

  // Validate CSRF state
  const expiry = oauthStates.get(state);
  oauthStates.delete(state);
  if (!expiry || Date.now() > expiry) {
    res.status(403).send("Invalid or expired state parameter");
    return;
  }

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string; error_description?: string };

    if (!tokenData.access_token) {
      res.status(400).send(`OAuth error: ${tokenData.error_description || tokenData.error || "Unknown error"}`);
      return;
    }

    // Safely encode the token for embedding in HTML script
    const safeToken = JSON.stringify(tokenData.access_token)
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e");

    // Return a small HTML page that stores the token and redirects
    res.setHeader("Content-Type", "text/html");
    res.send(`<!DOCTYPE html>
<html><head><title>Signing in...</title></head>
<body>
<p>Signing in...</p>
<script>
  localStorage.setItem("copilot_github_token", ${safeToken});
  localStorage.setItem("copilot_auth_method", "oauth");
  window.location.href = "/";
</script>
</body></html>`);
  } catch (err: any) {
    res.status(500).send(`OAuth token exchange failed: ${err.message}`);
  }
});

// --- Start Server ---

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
