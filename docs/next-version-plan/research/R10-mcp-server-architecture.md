# R10: MCP Server Architecture

> **Status:** COMPLETE  
> **Date:** 2026-03-11  
> **Blocks:** R3 decision (could change architecture), SDK feature adoption  
> **Summary:** MCP is a mature, well-supported protocol and the Copilot SDK has first-class integration — but **custom `Tool[]` is the right choice for this project now**. The official GitHub MCP Server (github/github-mcp-server) covers ~90% of needed write operations but adds Docker as a runtime dependency, can't host planning tools, and is missing milestone creation. MCP should be reserved for future scenarios requiring cross-client reuse or remote tool hosting.

---

## Findings Summary

| Question | Answer |
|----------|--------|
| Can the SDK connect to MCP servers? | **Yes** — `mcpServers` in `SessionConfig`, supports local (stdio) and remote (HTTP) |
| Can MCP expose GitHub REST API as tools? | **Yes** — the official GitHub MCP Server already does this |
| What's the performance overhead? | ~1-5ms per tool call (JSON-RPC serialization + stdio IPC) |
| How does per-user token isolation work? | Local: env var per spawned process. Remote: `Authorization` header per request |
| Is MCP better than custom `Tool[]` for this project? | **No** — custom tools are simpler, faster, and better for per-user token isolation |
| Should we use the official GitHub MCP Server? | **Not now** — adds Docker dependency, missing milestones, can't host planning tools |
| When would MCP make sense? | Cross-client reuse, remote tool hosting at scale, process-isolated untrusted tools |

---

## 1. MCP Protocol Overview

Model Context Protocol (MCP) is a JSON-RPC 2.0-based protocol for connecting AI models to external tool servers.

### Architecture

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│   MCP Host       │       │   MCP Client      │       │   MCP Server     │
│   (AI app)       │──────▶│   (one per server) │──────▶│   (tools/data)   │
│                  │       │                    │       │                  │
│   Copilot SDK    │       │   Built into SDK   │       │   Your code or   │
│   session        │       │   via mcpServers   │       │   github-mcp-svr │
└──────────────────┘       └──────────────────┘       └──────────────────┘
```

### Transport Mechanisms

| Transport | How It Works | Best For |
|-----------|-------------|----------|
| **stdio** | Client spawns server as subprocess; JSON-RPC over stdin/stdout | Local servers, per-user isolation |
| **Streamable HTTP** | Client POSTs to server endpoint; responses as JSON or SSE stream | Remote/shared servers, multi-client |

### Protocol Lifecycle

1. **Initialize** — Client sends `initialize` with `protocolVersion` and `capabilities`
2. **Capabilities exchange** — Server responds with supported features (`tools`, `resources`)
3. **Operation** — `tools/list` (discover), `tools/call` (execute), bidirectional notifications
4. **Shutdown** — Client closes transport

### Tool Definition Schema

```json
{
  "name": "create_issue",
  "description": "Create a GitHub issue",
  "inputSchema": {
    "type": "object",
    "properties": {
      "owner": { "type": "string" },
      "repo": { "type": "string" },
      "title": { "type": "string" }
    },
    "required": ["owner", "repo", "title"]
  }
}
```

Tool handlers return `{ content: [{ type: "text", text: "..." }] }`.

---

## 2. Copilot SDK MCP Integration

The SDK has **production-ready MCP support** via `SessionConfig.mcpServers`.

### Configuration

```typescript
const session = await client.createSession({
  mcpServers: {
    "github-write": {
      type: "local",
      command: "node",
      args: ["./mcp-server.js"],
      env: { GITHUB_TOKEN: token },
      tools: ["*"],        // Required: tool filter
      timeout: 30000,      // Optional: per-call timeout
    },
    "remote-api": {
      type: "remote",
      url: "https://mcp.example.com",
      headers: { Authorization: `Bearer ${token}` },
      tools: ["*"],
    },
  },
  tools: [...customTools],  // Can co-exist with custom tools
});
```

### SDK Configuration Options

| Key | Type | Scope | Description |
|-----|------|-------|-------------|
| `type` | `"local"` / `"remote"` | Both | Transport type |
| `tools` | `string[]` | Both | Tool filter: `["*"]` = all, `[]` = none, or named list |
| `timeout` | `number` | Both | Tool call timeout (ms) |
| `command` | `string` | Local | Executable to spawn |
| `args` | `string[]` | Local | CLI arguments |
| `env` | `Record<string, string>` | Local | Environment variables for subprocess |
| `cwd` | `string` | Local | Working directory |
| `url` | `string` | Remote | Server endpoint URL |
| `headers` | `Record<string, string>` | Remote | HTTP headers (auth) |

### Permission Handling

MCP tool calls trigger `PermissionRequest` with `kind: "mcp"`:

```typescript
{
  kind: "mcp",
  serverName: string,    // MCP server name (key in mcpServers)
  toolName: string,      // Tool name from server
  toolTitle: string,     // Human-readable title
  args: Record<string, unknown>,
  readOnly: boolean      // Whether tool has side effects
}
```

The `readOnly` flag enables granular permission: auto-approve reads, gate writes.

### Limitations

- MCP servers are set at session creation — **no add/remove mid-session**
- The SDK delegates to the Copilot CLI subprocess — no direct SDK control over MCP transport
- No official SDK examples for MCP integration (SDK repo is private)

---

## 3. Building an MCP Server in TypeScript

### Package

| Detail | Value |
|--------|-------|
| npm package | `@modelcontextprotocol/sdk` (v1) |
| Peer dependency | `zod` (v3.25+) |
| Key exports | `McpServer`, `StdioServerTransport`, `StreamableHTTPServerTransport` |

### Minimal stdio Server

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "github-write", version: "1.0.0" });

server.tool(
  "create_issue",
  "Create a GitHub issue",
  { owner: z.string(), repo: z.string(), title: z.string(), body: z.string().optional() },
  async ({ owner, repo, title, body }) => {
    const token = process.env.GITHUB_TOKEN!;
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ title, body }),
    });
    const issue = await res.json();
    return { content: [{ type: "text", text: JSON.stringify(issue, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Copilot SDK Integration

```typescript
// In buildSessionConfig()
mcpServers: {
  "github-write": {
    type: "local",
    command: "node",
    args: ["--import", "tsx", "./mcp-github-write-server.ts"],
    env: { GITHUB_TOKEN: token },
    tools: ["*"],
  },
},
```

### Key Considerations

| Concern | Detail |
|---------|--------|
| stdio logging | Never write to stdout — use `console.error()` (stdout is JSON-RPC) |
| Type safety | Zod schema auto-validates + types handler arguments |
| Error handling | Throw errors in handlers — SDK wraps as JSON-RPC error responses |
| Process lifecycle | SDK spawns on session create, kills on session end |

---

## 4. Per-User Token Isolation

### Local Transport (stdio) — Process Isolation

Each `createSession()` spawns a **separate MCP server process** with the user's token:

```typescript
mcpServers: {
  "github-write": {
    type: "local",
    command: "node",
    args: ["./mcp-server.js"],
    env: { GITHUB_TOKEN: userToken },  // Scoped to this process
  },
}
```

- One OS process per session → tokens are process-isolated
- No cross-user leakage possible (process boundary)
- Trade-off: O(n) processes for n concurrent users

### Remote Transport (HTTP) — Request-Scoped Auth

Shared server, per-request authentication:

```typescript
mcpServers: {
  "github-write": {
    type: "remote",
    url: "https://mcp.example.com/mcp",
    headers: { Authorization: `Bearer ${userToken}` },
  },
}
```

- Single server process handles all users
- Token sent per HTTP request in `Authorization` header
- Risk: cross-user leakage if server mishandles request context

### Security Comparison

| Mechanism | Local (stdio) | Remote (HTTP) |
|-----------|--------------|---------------|
| Process isolation | ✅ Separate OS process | ❌ Shared process |
| Token scope | Env var, immutable after spawn | Per-request header |
| Cross-user leakage risk | None (process boundary) | Possible if server mishandles context |
| Scalability | O(n) processes | Single process |
| Best for | Per-user token isolation (this project) | Shared service tokens, high concurrency |

---

## 5. MCP vs Custom `Tool[]` Comparison

### Feature Matrix

| Aspect | Custom `Tool[]` | MCP Server |
|--------|----------------|------------|
| **Definition syntax** | TypeScript `Tool` objects with JSON Schema + `handler` | MCP protocol: `tools/list` + `tools/call` via JSON-RPC |
| **Token handling** | Closure binding: `createGitHubTools(token)` | Env var (local) or header (remote) |
| **Execution model** | In-process — same Node.js event loop | Separate process (local) or HTTP call (remote) |
| **Serialization overhead** | Zero | ~1-5ms per call (JSON-RPC over stdio) |
| **Error handling** | Standard try/catch, direct propagation | JSON-RPC error responses; process crash = tool unavailable |
| **Debugging** | Same debugger session, `console.log` works | Separate process, separate debugger |
| **Permission model** | `kind: "custom-tool"` (blanket) | `kind: "mcp"` with `readOnly` flag (granular) |
| **Testability** | Direct: `tool.handler({ owner: "x" })` | Requires MCP client or JSON-RPC mock |
| **Reusability** | Coupled to `@github/copilot-sdk` `Tool` type | Protocol-standard; works with any MCP client |
| **Resource cost** | Zero extra processes | One process per session (local) |

### When MCP Wins

- **Cross-client reuse** — Single MCP server works with VS Code, Claude Desktop, Cursor, and this app
- **Process isolation** — Buggy tool can't crash Express server
- **Independent versioning** — MCP server deployed separately from main app
- **Remote hosting** — Shared tool server across multiple app instances (scale-out)

### When Custom Tools Win

- **Simplicity** — No extra process, no IPC, no serialization boundary
- **Token management** — Closure binding is cleaner than env-var injection
- **Debugging** — Single process, single log stream
- **Performance** — Zero IPC latency for high-frequency tool calls
- **Resource efficiency** — No extra Node.js process per user session
- **Testing** — Handlers are plain async functions, directly callable

---

## 6. Official GitHub MCP Server (github/github-mcp-server)

### Overview

| Detail | Value |
|--------|-------|
| Repository | https://github.com/github/github-mcp-server |
| Stars | ~28k |
| Language | Go |
| Latest release | v0.32.0 |
| Transport | stdio (Docker/binary), remote HTTP |
| Docker image | `ghcr.io/github/github-mcp-server` |

### Relevant Tools

| Operation | Tool Name | Toolset | Write? |
|-----------|-----------|---------|--------|
| Create/update issue | `issue_write` | `issues` (default) | ✅ |
| Add issue comment | `add_issue_comment` | `issues` (default) | ✅ |
| Create branch | `create_branch` | `repos` (default) | ✅ |
| Create pull request | `create_pull_request` | `pull_requests` (default) | ✅ |
| Merge pull request | `merge_pull_request` | `pull_requests` (default) | ✅ |
| Create/update/delete label | `label_write` | `labels` | ✅ |
| Assign Copilot to issue | `assign_copilot_to_issue` | `copilot` | ✅ |
| Request Copilot review | `request_copilot_review` | `copilot` | ✅ |
| Project management | `projects_write` | `projects` | ✅ |
| Search issues | `search_issues` | `issues` (default) | ❌ |
| **Create milestone** | — | — | **❌ Not available** |

### SDK Integration

```typescript
mcpServers: {
  "github": {
    type: "local",
    command: "docker",
    args: ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
           "-e", "GITHUB_TOOLSETS=issues,repos,pull_requests,labels,copilot",
           "ghcr.io/github/github-mcp-server"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: userToken },
    tools: ["*"],
  },
}
```

### Limitations for This Project

| Gap | Impact |
|-----|--------|
| **No milestone creation** | Must still use direct REST API for milestones |
| **Docker dependency** | Adds container runtime requirement; increases per-user resource cost |
| **Can't host planning tools** | 9 planning tools must remain as custom `Tool[]` |
| **Go binary** | Can't extend with TypeScript code; separate codebase |
| **Copilot toolset not default** | Must explicitly enable via `GITHUB_TOOLSETS` env var |

---

## 7. Integration with Existing Codebase

### Current Architecture

```
server.ts
  └─ buildSessionConfig(token, model)
       └─ tools: [...createGitHubTools(token), ...createPlanningTools(token, planningStore)]
                      5 read tools (tools.ts)     9 planning tools (planning-tools.ts)
```

### Three Possible MCP Integration Paths

#### Path A: Official GitHub MCP Server (stdio)

```
server.ts
  └─ buildSessionConfig(token, model)
       ├─ tools: [...createPlanningTools(token, planningStore)]  // Keep planning tools
       └─ mcpServers: { "github": { command: "docker", ..., env: { TOKEN: token } } }
```

- **Adds:** Docker per session, github-mcp-server process
- **Removes:** Need to build custom write tools
- **Still needs:** Direct REST API for milestones, custom planning tools
- **Resource cost:** +1 Docker container per active session

#### Path B: Custom MCP Server (stdio)

```
server.ts
  └─ buildSessionConfig(token, model)
       ├─ tools: [...createPlanningTools(token, planningStore)]
       └─ mcpServers: { "github-write": { command: "node", args: ["mcp-server.ts"], env: { TOKEN } } }
```

- **Adds:** Custom MCP server file, `@modelcontextprotocol/sdk` + `zod` dependencies
- **Removes:** Nothing — still need the same GitHub API code, just in a different file
- **Resource cost:** +1 Node.js process per active session

#### Path C: Extend Custom Tools (no MCP) — RECOMMENDED

```
server.ts
  └─ buildSessionConfig(token, model)
       └─ tools: [...createGitHubTools(token), ...createGitHubWriteTools(token),
                  ...createPlanningTools(token, planningStore)]
```

- **Adds:** ~6 new write tools in `tools.ts` using existing `githubFetch()` + `githubWrite()` pattern
- **Changes:** Zero architectural changes
- **Resource cost:** Zero — same process, same patterns
- **Dependencies:** None new

---

## 8. Decision: Custom Tools Now, MCP Later

### Recommendation: Stay with Custom `Tool[]` for GitHub Write Operations

| Factor | Custom Tools | MCP Server |
|--------|-------------|------------|
| Implementation effort | ~2-4 hours (extend existing `tools.ts`) | ~6-8 hours (new server + integration + testing) |
| Architecture change | None | New process per session, new dependency |
| Token isolation | Closure binding (proven) | Env var injection (works but more complex) |
| Testing | Direct handler calls | Requires MCP client setup |
| Resource cost | Zero | +1 process per session |
| Maintenance | One codebase | Two codebases (or Docker dependency) |
| Cross-client reuse | No | Yes — but not needed now |

### When to Reconsider MCP

Revisit MCP if any of these become true:

1. **Cross-client reuse needed** — Tools should work in VS Code Copilot, Claude Desktop, etc.
2. **Scale beyond ~50 concurrent users** — Remote MCP server becomes more efficient than per-user closures
3. **Process isolation required** — Untrusted or experimental tools that shouldn't crash the main server
4. **Team boundary** — A separate team maintains GitHub tools independently
5. **GitHub MCP Server adds milestones** — Then it covers 100% of needs with zero custom code

### What This Means for R3

R10 **does not change the R3 decision**. R3 recommended Option A (direct REST API via custom tools) and R10 confirms this is the right approach. MCP adds complexity without proportional benefit for the current single-server, per-user-token architecture.

---

## Appendix: MCP TypeScript SDK Quick Start

For future reference when MCP is needed:

```bash
npm install @modelcontextprotocol/sdk zod
```

```typescript
// mcp-server.ts — minimal stdio server
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "my-tools", version: "1.0.0" });

server.tool("hello", "Say hello", { name: z.string() },
  async ({ name }) => ({
    content: [{ type: "text", text: `Hello, ${name}!` }]
  })
);

await server.connect(new StdioServerTransport());
```

```typescript
// Copilot SDK integration
const session = await client.createSession({
  mcpServers: {
    "my-tools": {
      type: "local",
      command: "node",
      args: ["--import", "tsx", "./mcp-server.ts"],
      env: { MY_TOKEN: token },
      tools: ["*"],
    },
  },
});
```
