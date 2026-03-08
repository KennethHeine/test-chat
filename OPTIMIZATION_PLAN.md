# Optimization Plan: AI Chat App for Coding Agent Orchestration

This plan outlines how to transform the current Copilot Chat application into an **AI-powered orchestration platform** for coding agent tasks. The goal is to leverage the GitHub Copilot SDK's extensive unused capabilities (documented in [BACKEND_AND_SDK.md](./BACKEND_AND_SDK.md)) to create a system that can:

1. **Orchestrate coding agent tasks** across GitHub repositories
2. **Support research workflows** — investigate codebases before committing to implementation
3. **Spread tasks across multiple agents** — parallelize work using fleet mode and sub-agents
4. **Use the GitHub Copilot coding agent as the backend** — the SDK's CLI process is a full-featured agent runtime

---

## Table of Contents

- [Vision & Architecture](#vision--architecture)
- [Current State vs. Target State](#current-state-vs-target-state)
- [Phase 1: Foundation — Quick Wins](#phase-1-foundation--quick-wins)
- [Phase 2: Core Agent Orchestration](#phase-2-core-agent-orchestration)
- [Phase 3: Multi-Agent & Fleet Mode](#phase-3-multi-agent--fleet-mode)
- [Phase 4: Advanced Capabilities](#phase-4-advanced-capabilities)
- [SDK Feature Mapping](#sdk-feature-mapping)
- [Architecture Changes](#architecture-changes)
- [Risk & Mitigation](#risk--mitigation)

---

## Vision & Architecture

### Target Vision

Transform from a **simple chat interface** into an **agent orchestration dashboard** where users can:

- Research a codebase by asking the agent to explore repos, read files, and summarize architecture
- Plan coding tasks by breaking down issues into sub-tasks with the agent's help
- Dispatch tasks to coding agents that work in GitHub repositories
- Monitor agent progress in real-time (tool executions, file reads/writes, shell commands)
- Review agent output and iterate before committing changes

### Target Architecture

```
┌────────────────────────────────────┐
│  Browser — Orchestration Dashboard │
│  ├─ Chat Interface (research)      │
│  ├─ Task Board (plan & dispatch)   │
│  ├─ Agent Activity Monitor         │
│  └─ Tool Execution Viewer          │
└────────────┬───────────────────────┘
             │ HTTP/SSE
┌────────────▼───────────────────────┐
│  Express Server — Orchestrator     │
│  ├─ System Message (orchestrator)  │
│  ├─ Custom Tools (GitHub API)      │
│  ├─ MCP Servers (repo context)     │
│  ├─ Session Hooks (task tracking)  │
│  └─ Fleet Manager (multi-agent)    │
└────────────┬───────────────────────┘
             │ JSON-RPC (SDK)
┌────────────▼───────────────────────┐
│  Copilot CLI — Agent Runtime       │
│  ├─ Built-in Tools (shell, files)  │
│  ├─ Custom Tools (from server)     │
│  ├─ MCP Tools (from MCP servers)   │
│  └─ Sub-agents (fleet mode)        │
└────────────┬───────────────────────┘
             │
┌────────────▼───────────────────────┐
│  GitHub — Repositories & APIs      │
│  ├─ Code (read/write files)        │
│  ├─ Issues & PRs (task tracking)   │
│  ├─ Actions (CI/CD triggers)       │
│  └─ Copilot (model inference)      │
└────────────────────────────────────┘
```

---

## Current State vs. Target State

| Capability | Current | Target |
|-----------|---------|--------|
| Chat | Simple text chat | Context-aware agent conversations |
| System prompt | ✅ Custom orchestrator persona | Custom orchestrator persona |
| Tools | ✅ 5 GitHub API tools (list_repos, get_repo_structure, read_repo_file, list_issues, search_code) | GitHub API tools + MCP servers |
| Agent visibility | ✅ Real-time tool activity streaming (tool_start/tool_complete SSE events) | Real-time tool activity streaming |
| Task management | None | Task planning, dispatch, and tracking |
| Multi-agent | Single session | Fleet mode for parallel tasks |
| Session persistence | ✅ Full context with `resumeSession()` + `sdkSessionId` | Full context with `resumeSession()` |
| Response control | ✅ Abort, model switching mid-conversation | Abort, reasoning effort, model switching |
| File context | None | File/image attachments |
| Agent input | One-way | Bidirectional (agent can ask questions) |
| Quota monitoring | ✅ `GET /api/quota` with frontend display | Quota management |
| Token usage | ✅ Per-message usage tracking via SSE | Cost tracking |

---

## Phase 1: Foundation — Quick Wins

> **Goal:** Improve the existing chat experience with low-effort SDK features that directly support the orchestration use case.
>
> **Timeline:** Immediate
>
> **Effort:** Low (each feature takes 1-3 hours)
>
> **Status:** ✅ COMPLETE

### 1.1 System Message Customization ✅ COMPLETE

**SDK Feature:** `systemMessage` option in `createSession()` ([BACKEND_AND_SDK.md §8.4](./BACKEND_AND_SDK.md#84-system-message-customization))

**What:** Configure the Copilot agent as a coding task orchestrator instead of a generic assistant.

**Implementation:**
- Add a system message to `createSession()` in `server.ts` that instructs the agent to behave as a coding task orchestrator
- The system message should guide the agent to: break down tasks, suggest repo exploration, provide structured responses

```typescript
const session = await client.createSession({
  model: model || "gpt-4.1",
  streaming: true,
  onPermissionRequest: safePermissionHandler,  // Only auto-approves custom tools + read ops
  systemMessage: {
    content: `You are a coding task orchestrator. Help users:
1. Research codebases by exploring repository structure, reading files, and understanding architecture
2. Plan coding tasks by breaking down issues into clear, actionable sub-tasks
3. Suggest which tasks can be parallelized across multiple agents
4. Provide structured output for task definitions (repo, branch, description, acceptance criteria)
When asked to explore a repo, use available tools to read files and understand the codebase before making recommendations.`,
  },
});
```

### 1.2 Session Abort — Stop Button ✅ COMPLETE

**SDK Feature:** `session.abort()` ([BACKEND_AND_SDK.md §8.2](./BACKEND_AND_SDK.md#82-session-level-features))

**What:** Allow users to cancel long-running agent responses. Essential for orchestration where agents may be performing lengthy operations.

**Implementation:**
- `POST /api/chat/abort` endpoint calls `session.abort()`
- "Stop" button appears in the UI during streaming
- Wired to call the abort endpoint

### 1.3 Tool Execution Events — Agent Activity ✅ COMPLETE

**SDK Feature:** `tool.execution_start`, `tool.execution_complete`, `tool.execution_progress` events ([BACKEND_AND_SDK.md §8.13](./BACKEND_AND_SDK.md#813-additional-unused-events))

**What:** Show users what the agent is doing in real-time. When the agent reads a file, runs a command, or searches code — the user sees it.

**Implementation:**
- Tool execution events streamed as SSE `tool_start` and `tool_complete` events
- Frontend displays tool activity indicators in the chat

### 1.4 AI-Generated Session Titles ✅ COMPLETE

**SDK Feature:** `session.title_changed` event ([BACKEND_AND_SDK.md §8.13](./BACKEND_AND_SDK.md#813-additional-unused-events))

**What:** Replace the current "first 50 chars of message" title with AI-generated conversation titles.

**Implementation:**
- `session.title_changed` event streamed as SSE `title` event
- Frontend updates session sidebar with AI-generated titles

### 1.5 Token Usage Tracking ✅ COMPLETE

**SDK Feature:** `assistant.usage` event ([BACKEND_AND_SDK.md §8.13](./BACKEND_AND_SDK.md#813-additional-unused-events))

**What:** Show users token consumption per message. Important for orchestration where tasks may consume significant tokens.

**Implementation:**
- `assistant.usage` event streamed as SSE `usage` event
- Frontend displays token count in the status bar

### 1.6 Better Health Monitoring ✅ COMPLETE

**SDK Feature:** `client.ping()`, `client.getState()` ([BACKEND_AND_SDK.md §8.1](./BACKEND_AND_SDK.md#81-client-level-features))

**What:** Replace the current CLI binary check with actual RPC connection health monitoring.

**Implementation:**
- `/api/health` now returns `{ status, storage, clients: { total, connected }, activeSessions }` using `client.getState()` to count connected clients

---

## Phase 2: Core Agent Orchestration

> **Goal:** Enable the agent to interact with GitHub repositories and track coding tasks.
>
> **Timeline:** After Phase 1
>
> **Effort:** Medium (each feature takes 3-8 hours)
>
> **Status:** ✅ COMPLETE (except 2.2 MCP — deferred)

### 2.1 Custom Tools — GitHub API Integration ✅ COMPLETE

**SDK Feature:** Tool System with `defineTool()` ([BACKEND_AND_SDK.md §8.3](./BACKEND_AND_SDK.md#83-tool-system))

**What:** Give the agent tools to interact with GitHub repositories directly. This is the core of the orchestration capability.

**Proposed Tools:**

| Tool Name | Description | Priority | Status |
|-----------|-------------|----------|--------|
| `list_repos` | List repositories for a user/org | High | ✅ Implemented |
| `get_repo_structure` | Get file tree of a repository | High | ✅ Implemented |
| `read_repo_file` | Read a specific file from a repo | High | ✅ Implemented |
| `list_issues` | List issues in a repository | High | ✅ Implemented |
| `create_issue` | Create an issue for a coding task | High | Planned |
| `create_branch` | Create a branch for agent work | Medium | Planned |
| `trigger_workflow` | Trigger a GitHub Actions workflow | Medium | Planned |
| `list_pull_requests` | List PRs in a repository | Medium | Planned |
| `search_code` | Search code across repos | Medium | ✅ Implemented |

**Implementation:**
- 5 tools defined in `tools.ts` as `Tool` objects with inline JSON schema (not using `defineTool()`)
- `createGitHubTools(token)` factory creates tools bound to the user's GitHub token
- Tools are passed to `createSession()` configuration
- Each tool calls the GitHub REST API with the user's token for authentication

### 2.2 MCP Server Integration — Repository Context ⏸️ DEFERRED

**SDK Feature:** MCP Server Integration ([BACKEND_AND_SDK.md §8.9](./BACKEND_AND_SDK.md#89-mcp-server-integration))

**What:** Connect to GitHub's MCP server to give the agent rich repository context.

**Status:** Deferred — requires an external MCP server binary that is not yet available for this deployment.

**Implementation:**
- Configure MCP servers in `createSession()`
- Start with GitHub's official MCP server for repo access
- This provides the agent with deep code understanding beyond simple file reads

### 2.3 Session Resumption — Persistent Tasks ✅ COMPLETE

**SDK Feature:** `client.resumeSession()` ([BACKEND_AND_SDK.md §8.1](./BACKEND_AND_SDK.md#81-client-level-features))

**What:** Preserve full conversation context across server restarts. Critical for long-running orchestration tasks.

**Implementation:**
- `sdkSessionId` (the SDK's internal session ID from `session.sessionId`) is stored in session metadata
- `resolveSession()` function checks for an existing `sdkSessionId` and tries `client.resumeSession()` before falling back to `createSession()`
- 3 new storage tests verify `sdkSessionId` persistence, optionality, and updates

### 2.4 Session Hooks — Task Tracking ✅ COMPLETE

**SDK Feature:** Session Hooks ([BACKEND_AND_SDK.md §8.6](./BACKEND_AND_SDK.md#86-session-hooks))

**What:** Track agent activity for audit trails and task management.

**Hooks to implement:**
- `onPreToolUse` — Log what the agent is about to do ✅
- `onPostToolUse` — Log what the agent did and results ✅
- `onSessionStart/End` — Track session lifecycle ✅
- `onErrorOccurred` — Handle errors with retry/skip/abort strategy ✅

**Implementation:** All 5 hooks are passed to `createSession()` in the `hooks` configuration object. Currently log to console; can be extended for audit trails.

### 2.5 Model Switching Mid-Conversation ✅ COMPLETE

**SDK Feature:** `session.setModel()` ([BACKEND_AND_SDK.md §8.2](./BACKEND_AND_SDK.md#82-session-level-features))

**What:** Allow switching between models during a conversation. Useful for using cheaper models for research and premium models for complex tasks.

**Implementation:**
- `POST /api/chat/model` endpoint accepts `{ sessionId, model }` and calls `session.setModel(model)`
- Session metadata is updated with the new model name
- Frontend fires model switch automatically when the dropdown changes during an active session

### 2.6 Quota Monitoring ✅ COMPLETE

**SDK Feature:** `account.getQuota()` ([BACKEND_AND_SDK.md §8.14](./BACKEND_AND_SDK.md#814-rpc-methods))

**What:** Show users their remaining premium request quota. Important when orchestrating multiple agent tasks.

**Implementation:**
- `GET /api/quota` endpoint calls `client.rpc.account.getQuota()` and returns the result
- Frontend displays quota information in the status bar
- Integration tests verify the endpoint returns data and rejects unauthenticated requests

---

## Phase 3: Multi-Agent & Fleet Mode

> **Goal:** Enable parallel task execution across multiple agents.
>
> **Timeline:** After Phase 2
>
> **Effort:** High (requires significant architecture changes)

### 3.1 Fleet Mode — Parallel Agents

**SDK Feature:** `fleet.start()` RPC method ([BACKEND_AND_SDK.md §8.14](./BACKEND_AND_SDK.md#814-rpc-methods))

**What:** Launch a fleet of sub-agents that work on related tasks in parallel. This is the "spread tasks over agents" capability.

**Implementation:**
- Add a "Dispatch Fleet" UI that takes a task breakdown and launches parallel agents
- Use `fleet.start()` to spawn sub-agents
- Listen to `subagent.started`, `subagent.completed`, `subagent.failed` events
- Display a multi-agent status dashboard

### 3.2 Sub-Agent Monitoring

**SDK Feature:** `subagent.started/completed/failed` events ([BACKEND_AND_SDK.md §8.13](./BACKEND_AND_SDK.md#813-additional-unused-events))

**What:** Track the progress of each sub-agent in the fleet.

**Implementation:**
- Stream sub-agent events to the frontend
- Show a task board with agent status (pending, running, completed, failed)
- Allow drilling into individual agent logs

### 3.3 Custom Agents — Specialized Roles

**SDK Feature:** Custom Agents ([BACKEND_AND_SDK.md §8.10](./BACKEND_AND_SDK.md#810-custom-agents))

**What:** Create specialized agent personas for different orchestration roles.

**Proposed Agents:**

| Agent | Role | System Prompt Focus |
|-------|------|-------------------|
| `researcher` | Codebase exploration | Read files, understand architecture, summarize findings |
| `planner` | Task breakdown | Create structured task definitions from requirements |
| `coder` | Implementation | Write code, create PRs, run tests |
| `reviewer` | Code review | Review changes, suggest improvements |

---

## Phase 4: Advanced Capabilities

> **Goal:** Polish the platform with advanced features.
>
> **Timeline:** After Phase 3
>
> **Effort:** Variable

### 4.1 User Input Requests — Agent Questions

**SDK Feature:** `onUserInputRequest` ([BACKEND_AND_SDK.md §8.7](./BACKEND_AND_SDK.md#87-user-input-requests))

**What:** Allow the agent to ask clarifying questions during task execution.

### 4.2 File & Image Attachments

**SDK Feature:** File Attachments ([BACKEND_AND_SDK.md §8.11](./BACKEND_AND_SDK.md#811-file-and-image-attachments))

**What:** Allow users to share files, images, and code selections with the agent.

### 4.3 Reasoning Effort Control

**SDK Feature:** `reasoningEffort` option ([BACKEND_AND_SDK.md §8.12](./BACKEND_AND_SDK.md#812-reasoning-effort-control))

**What:** Let users control how deeply the agent thinks about a task.

### 4.4 BYOK — Alternative Providers

**SDK Feature:** BYOK ([BACKEND_AND_SDK.md §8.8](./BACKEND_AND_SDK.md#88-byok-bring-your-own-key))

**What:** Support alternative model providers for specialized tasks.

---

## SDK Feature Mapping

This table maps every relevant unused SDK feature to the orchestration goal:

| SDK Feature | BACKEND_AND_SDK.md Section | Phase | Orchestration Value |
|-------------|---------------------------|-------|-------------------|
| System message | §8.4 | 1 | Configure orchestrator persona |
| `session.abort()` | §8.2 | 1 | Cancel long-running tasks |
| Tool execution events | §8.13 | 1 | Monitor agent activity |
| `session.title_changed` | §8.13 | 1 | Better session naming |
| `assistant.usage` | §8.13 | 1 | Cost tracking |
| `client.ping()/getState()` | §8.1 | 1 | Health monitoring |
| Custom tools (`defineTool`) | §8.3 | 2 | GitHub API integration |
| MCP servers | §8.9 | 2 | Deep repo context |
| `client.resumeSession()` | §8.1 | 2 | Persistent tasks |
| Session hooks | §8.6 | 2 | Task tracking & audit |
| `session.setModel()` | §8.2 | 2 | Model switching |
| `account.getQuota()` | §8.14 | 2 | Quota management |
| `fleet.start()` | §8.14 | 3 | Parallel agents |
| Sub-agent events | §8.13 | 3 | Multi-agent monitoring |
| Custom agents | §8.10 | 3 | Specialized roles |
| User input requests | §8.7 | 4 | Agent questions |
| File attachments | §8.11 | 4 | Code context sharing |
| Reasoning effort | §8.12 | 4 | Task complexity control |
| BYOK | §8.8 | 4 | Alternative providers |

---

## Architecture Changes

### Backend Changes (server.ts)

1. **Session creation** — Add system message, tools, hooks, and MCP server configuration
2. **New endpoints** — `/api/chat/abort`, `/api/chat/model`, `/api/quota`
3. **Event streaming** — Expand SSE events to include tool execution, titles, usage, and sub-agent activity
4. **Session resumption** — Store SDK session IDs and use `resumeSession()` on restart
5. **Custom tools** — Define GitHub API tools that use the user's token

### Frontend Changes (app.js + index.html)

1. **Stop button** — Cancel streaming responses
2. **Tool activity indicator** — Show what the agent is doing in real-time
3. **Token usage display** — Show per-message token consumption
4. **AI-generated titles** — Update sidebar with better titles
5. **Enhanced status bar** — Show connection quality, quota, agent state

### Storage Changes (storage.ts)

1. **SDK session ID** — Store alongside session metadata for resumption
2. **Tool execution logs** — Persist agent activity for audit trails

---

## Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| SDK API changes (v0.1.x) | Breaking changes | Pin SDK version, test on upgrades |
| CLI process memory usage | Resource exhaustion with many agents | Implement session cleanup, monitor memory |
| Fleet mode stability | Sub-agents may fail | Implement retry logic, error handling |
| Token consumption | High costs with multi-agent | Show usage prominently, add limits |
| Context window limits | Long orchestration sessions | Leverage infinite sessions with compaction |

---

*This plan is based on the comprehensive SDK analysis in [BACKEND_AND_SDK.md](./BACKEND_AND_SDK.md). Each phase builds on the previous one, and features can be adopted incrementally.*
