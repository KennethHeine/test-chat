# R6: GitHub Copilot SDK — Unused Features

> **Status:** COMPLETE  
> **Date:** 2026-03-11  
> **Blocks:** UX improvements, potential R3 alternative approach  
> **Summary:** Seven sub-questions researched across MCP integration, user input requests, session resumption, reasoning effort, file attachments, BYOK/custom agents, and planning events. **Key finding:** extending native `Tool` handlers is better than MCP for GitHub writes. User input requests and planning events offer the highest immediate UX value. The sdk-reference.md section 8 is partially outdated — several "unused" features are now in use.

---

## Findings Summary

| Sub-Question | Finding | Value | Effort | Recommendation |
|---|---|---|---|---|
| **SQ1: MCP Server Integration** | Works (stdio/HTTP/SSE transports) but adds complexity without benefit over native tools | Low for this project | High | **Skip** — extend `tools.ts` pattern instead |
| **SQ2: User Input Requests** | `onUserInputRequest` callback enables structured choices mid-conversation via `ask_user` tool | High for planning UX | Medium | **Implement** — adds guided goal definition |
| **SQ3: Session Resumption** | Already partially implemented; main gap is Docker ephemeral filesystem kills CLI state | Medium | Low-Medium | **Improve fallback** path with message replay |
| **SQ4: Reasoning Effort Control** | `o4-mini` supports reasoning; 4 levels (low/medium/high/xhigh); costs premium requests | Medium for research quality | Low | **Implement** — conditional UI dropdown |
| **SQ5: File/Image Attachments** | Server-side file paths only; no inline content; requires upload endpoint + temp files | Medium for planning context | Medium | **Defer** — use code selection (paste) as MVP |
| **SQ6: BYOK & Custom Agents** | BYOK adds cost over free gpt-4.1; custom agents add abstraction without proportional value | Low | Low-Medium | **Skip for now** |
| **SQ7: Planning & Sub-agent Events** | `planning.started/end` don't exist; real events are `session.mode_changed`, `assistant.intent`, `subagent.*` | High for UX polish | Low (~85 lines) | **Implement** — status indicators |

---

## Codebase Correction: sdk-reference.md Section 8 Is Outdated

The sdk-reference.md "Unused SDK Features" section (Section 8) lists many features as unused that are **now implemented** in the codebase:

| Feature | sdk-reference.md Says | Actual Status |
|---|---|---|
| Custom tools | "❌ No custom tools are defined" | ✅ `tools.ts` (5 GitHub tools) + `planning-tools.ts` (9 planning tools) |
| Tool events | Not listed as used | ✅ `tool.execution_start/complete` → SSE events in `server.ts` |
| Session title events | Not listed as used | ✅ `session.title_changed` → SSE `title` events |
| Usage events | Not listed as used | ✅ `assistant.usage` → SSE `usage` events |
| Session hooks | "❌ No hooks are configured" | ✅ `buildSessionConfig()` has all 5 hook types |
| System message | "❌ The default Copilot persona is used" | ✅ `ORCHESTRATOR_SYSTEM_MESSAGE` in append mode |
| Session resumption | "❌" | ✅ `resolveSession()` calls `resumeSession()` with `sdkSessionId` |
| Permission handler | "Uses `approveAll`" | ✅ Custom `safePermissionHandler` with kind-based allow/deny |

**Remaining truly unused features** (researched below):
1. MCP Server Integration
2. User Input Requests (`onUserInputRequest`)
3. Reasoning Effort Control
4. File/Image Attachments
5. BYOK (Bring Your Own Key)
6. Custom Agents / Agent RPC
7. Fleet Mode (sub-agents)
8. Planning/mode-change events (`session.mode_changed`, `exit_plan_mode.requested`)
9. Compaction events (`session.compaction_start/complete`)
10. Intent events (`assistant.intent`)
11. Reasoning events (`assistant.reasoning_delta/reasoning`)
12. `session.disconnect()` for resource cleanup

---

## SQ1: MCP Server Integration

### Transport Options

| Transport | Type | Communication | Pros | Cons |
|---|---|---|---|---|
| **Local/stdio** | `"local"` | SDK spawns subprocess, stdin/stdout | No network overhead; `env` passes per-process vars | One subprocess per session; extra process overhead |
| **Remote HTTP** | `"http"` | HTTP requests to remote URL | Shared server; independent scaling | Network latency; hosting required |
| **Remote SSE** | `"sse"` | Server-Sent Events to remote URL | Streaming support | Same as HTTP remote |

### MCP vs Native Tools

| Aspect | Native `Tool` (current pattern) | MCP Server |
|---|---|---|
| **Setup** | Define inline in `SessionConfig.tools` | Separate server process or HTTP endpoint |
| **Handler execution** | Runs in-process (same Node.js) | Subprocess (stdio) or remote service |
| **Per-user token** | Closure in factory: `createGitHubTools(token)` | Pass via `env: { GITHUB_TOKEN: token }` per session |
| **Permission model** | `kind: "custom-tool"` | `kind: "mcp"` — includes `serverName`, `toolName`, `readOnly` |
| **Complexity** | Minimal — just a handler function | Must implement MCP JSON-RPC protocol |
| **Reusability** | Tied to this app | Usable by any MCP client (VS Code, Claude) |
| **Performance** | Direct function call, zero IPC | Subprocess spawn + stdio per session |

### Security

- `onPermissionRequest` fires for MCP tools with `kind: "mcp"`, including `serverName` and `toolName`
- Per-user tokens via MCP `env` field: `env: { GITHUB_TOKEN: userToken }` per session
- `onPreToolUse` hook also fires for MCP tools as a second permission layer

### Decision: Skip MCP for GitHub Writes

**Extending native `Tool` handlers is better for this use case.** The project already has the `createGitHubTools(token)` pattern. Adding write tools (create issue, branch, milestone) follows the identical pattern with zero new infrastructure. MCP adds complexity (separate process, protocol implementation) without proportional benefit.

**Revisit if:** the project later needs to expose tools to VS Code, Claude Desktop, or other MCP clients. At that point, extracting tool handlers into an MCP server is justified.

---

## SQ2: User Input Requests

### Request/Response Format

| Interface | Field | Type | Description |
|---|---|---|---|
| **UserInputRequest** | `question` | `string` | Question to ask the user |
| | `choices` | `string[]` (optional) | Multiple-choice options |
| | `allowFreeform` | `boolean` (optional, default `true`) | Whether freeform text is accepted |
| **UserInputResponse** | `answer` | `string` | The user's answer |
| | `wasFreeform` | `boolean` | Whether answer was freeform |

### How It Works

1. Session created with `onUserInputRequest` handler → SDK enables the `ask_user` built-in tool
2. Agent decides it needs user input → invokes `ask_user`
3. SDK calls `onUserInputRequest` callback with `{ question, choices?, allowFreeform? }`
4. Callback **blocks** (Promise) until resolved → returns `{ answer, wasFreeform }`
5. Agent continues with the answer

Custom tools cannot directly trigger `ask_user` — only the agent model decides when to invoke it.

### Frontend Integration Pattern

SSE is one-way (server → browser). Bridging requires a new endpoint:

```
Agent → ask_user → onUserInputRequest callback (server blocks)
                          ↓
    SSE event: { type: "user_input_request", requestId, question, choices, allowFreeform }
                          ↓
    Browser renders question UI (choices or text input)
                          ↓
    Browser POSTs: POST /api/chat/input { requestId, answer, wasFreeform }
                          ↓
    Server resolves pending Promise → agent continues
```

Implementation sketch:

```typescript
// Pending input requests (scoped per SSE connection)
const pendingInputs = new Map<string, { resolve: (r: UserInputResponse) => void }>();

// In buildSessionConfig:
onUserInputRequest: async (request) => {
  const requestId = crypto.randomUUID();
  res.write(`data: ${JSON.stringify({
    type: "user_input_request", requestId, ...request
  })}\n\n`);
  return new Promise((resolve) => {
    pendingInputs.set(requestId, { resolve });
  });
}

// New endpoint:
app.post("/api/chat/input", (req, res) => {
  const { requestId, answer, wasFreeform } = req.body;
  const pending = pendingInputs.get(requestId);
  if (pending) {
    pending.resolve({ answer, wasFreeform });
    pendingInputs.delete(requestId);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: "No pending input request" });
  }
});
```

### Implementation Effort: Medium

| Change | Scope |
|---|---|
| `onUserInputRequest` in `buildSessionConfig` | ~15 lines in server.ts |
| `POST /api/chat/input` endpoint | ~20 lines in server.ts |
| Pending-request Map (per SSE connection) | State management in server.ts |
| Frontend: render choices/freeform UI | ~50 lines in app.js |
| Timeout handling (reject after N seconds) | Prevents hanging sessions |

---

## SQ3: Session Resumption

### Current Implementation Status

The project already implements the core flow in `resolveSession()`:

1. **Stores `sdkSessionId`** alongside session metadata in `SessionStore`
2. **Attempts resume first**: `client.resumeSession(sdkSessionId, sessionConfig)`
3. **Falls back gracefully**: if resume throws, creates a new session
4. **Passes full config**: resumed sessions get tools, hooks, streaming, system message

### What Survives Restart

| Scenario | sessions Map | CLI Process | `~/.copilot/session-state/` | sdkSessionId in Store | Resume Works? |
|---|---|---|---|---|---|
| Same process (no restart) | ✅ | ✅ | ✅ | ✅ | **Yes** (bypasses resume) |
| Server restart (local dev) | ❌ | ❌ (killed) | ✅ (on disk) | ✅ (if Azure) | **Likely yes** |
| Container restart (Docker) | ❌ | ❌ | ❌ (ephemeral FS) | ✅ (if Azure) | **No** |
| InMemoryStore + any restart | ❌ | ❌ | Varies | ❌ | **No** |

### Gaps and Fixes

| Gap | Fix |
|---|---|
| **No `session.disconnect()`** — idle sessions consume CLI memory forever | Add idle timeout (30 min) → `session.disconnect()` + remove from Map, keep `sdkSessionId` |
| **Shutdown doesn't disconnect sessions** — `client.stop()` kills CLI without clean session disconnect | Call `session.disconnect()` on all sessions before `client.stop()` |
| **No context replay fallback** — when `resumeSession` fails, new session has no history | Replay stored messages via `session.send()` into fresh sessions |
| **Docker destroys CLI state** — `~/.copilot/` is ephemeral | Accept limitation; improve message replay fallback instead |

### Recommendation

Don't persist CLI state in Docker. Instead, **improve the fallback path**: when `resumeSession` fails, replay persisted messages into the fresh session to rebuild context. This is the pragmatic approach for the scale-to-zero Container Apps architecture.

---

## SQ4: Reasoning Effort Control

### Models with Reasoning Support

Model list is **dynamic** — determined at runtime via `listModels()`. Key fields per model:

| Field | Type | Purpose |
|---|---|---|
| `capabilities.supports.reasoningEffort` | `boolean` | Whether model accepts reasoning config |
| `supportedReasoningEfforts` | `string[]` | Available levels for this model |
| `defaultReasoningEffort` | `string` | Default if not specified |
| `billing.multiplier` | `number` | Premium request cost multiplier |

Known models (as of 2026-03):

| Model | Reasoning | Premium Requests | Notes |
|---|:-:|:-:|---|
| gpt-4.1 | ❌ | 0 | Current default |
| gpt-4o | ❌ | 0 | No reasoning |
| o4-mini | ✅ | ~1 | Primary reasoning model |
| claude-sonnet-4 | ❌ | 1 | No reasoning |
| claude-opus-4.5 | ✅ | 3 | Reasoning via extended thinking |

### Effort Levels

| Level | Latency | Quality | Use Case |
|---|---|---|---|
| `low` | ~1x baseline | Adequate for simple tasks | Quick answers |
| `medium` | ~2-3x | Good for most tasks | Default recommendation |
| `high` | ~4-6x | Better for complex analysis | Research, architecture |
| `xhigh` | ~8-10x | Maximum quality | Critical planning decisions |

### UI Integration

Show reasoning effort dropdown conditionally when the selected model supports it:

```
[Model: o4-mini ▼] [Reasoning: medium ▼]
```

1. `listModels()` returns `supportedReasoningEfforts` per model
2. When model has `capabilities.supports.reasoningEffort === true`, show `<select>`
3. Default to `defaultReasoningEffort` from model metadata
4. Pass in `createSession()` config
5. Stream `assistant.reasoning_delta` as collapsible "Thinking..." section in UI

### Cost: gpt-4.1 at 0 premium requests is the baseline. Reasoning models cost premium requests — users should be aware of the trade-off.

---

## SQ5: File and Image Attachments

### Supported Types

| Type | Required Fields | Description |
|---|---|---|
| `file` | `path` (absolute, server filesystem) | Single file (code, image) |
| `directory` | `path` (absolute) | Entire directory tree |
| `selection` | `filePath`, `displayName` | Code selection with optional `text` and line range |

**No URL attachment type.** No inline/base64 content support. All attachments reference server filesystem paths.

### Web App Challenge

Attachments require **server-side file paths** — not browser files. For a web app:

1. Add `POST /api/upload` endpoint (accept `multipart/form-data`)
2. Save to temp directory (`os.tmpdir()` + unique subfolder)
3. Pass temp path in `attachments: [{ type: "file", path: tempPath }]`
4. Clean up after response completes

**For GitHub repo files:** Fetch via REST API, decode base64, write to temp file, attach.

### Minimum Viable Approach

Support **code paste only** (no file upload): users paste code in the UI, backend writes to temp file, attaches as `selection` type. Covers "attach code context to a goal" without upload UX complexity.

### Decision: Defer Full Implementation

File upload (multipart, temp management, security, cleanup) is Medium effort with Medium value. The code-paste MVP is Low effort. Recommend deferring full upload support and implementing code-paste first.

---

## SQ6: BYOK & Custom Agents

### Assessment

| Feature | Verdict | Rationale |
|---|---|---|
| **BYOK** | **Skip for now** | gpt-4.1 at 0 premium requests is unbeatable. BYOK adds operational burden (key rotation, billing, outages) without clear model quality advantage. Revisit only if specific capability needed (e.g., Claude 200K context). |
| **Custom Agents** | **Skip for now** | System message + phase-specific tools in `buildSessionConfig()` covers planning phases. Custom agents add abstraction without proportional value. |
| **Agent RPC** | **Skip** | Mid-session agent switching introduces context ambiguity. Sequential planning via single agent is cleaner. |

---

## SQ7: Planning & Sub-agent Events

### Critical Correction: `planning.started/end` Don't Exist

The sdk-reference.md lists `planning.started` and `planning.end` as events. **These do not exist in the SDK.** The actual planning-related events are:

| Event | Data Fields | Description |
|---|---|---|
| `session.mode_changed` | `previousMode`, `newMode` (`"interactive"` / `"plan"` / `"autopilot"`) | Detects agent entering/exiting plan mode |
| `session.plan_changed` | `operation` (`"create"` / `"update"` / `"delete"`) | Plan file was modified |
| `exit_plan_mode.requested` | `requestId`, `summary`, `planContent`, `actions[]`, `recommendedAction` | Planning complete, presents plan for approval |
| `assistant.intent` | `intent` (string, e.g., "Exploring codebase") | What agent is currently doing |
| `subagent.started` | `toolCallId`, `agentName`, `agentDisplayName`, `agentDescription` | Sub-agent begins |
| `subagent.completed` | `toolCallId`, `agentName`, `agentDisplayName` | Sub-agent finished |
| `subagent.failed` | `toolCallId`, `agentName`, `error` | Sub-agent errored |
| `session.compaction_start` | `{}` | Compaction began |
| `session.compaction_complete` | `success`, `tokensRemoved?`, `messagesRemoved?`, `summaryContent?` | Compaction finished |

### Fleet Mode

`session.rpc.fleet.start({ prompt? })` is **experimental**. Spawns parallel sub-agents within a single CLI process. Tracked via `subagent.*` events. Not relevant for current planning workflow — better suited for complex multi-file coding tasks.

### UX Integration Proposal

| SDK Event | SSE Type | Frontend Indicator |
|---|---|---|
| `session.mode_changed` (→ `"plan"`) | `planning_start` | "Planning..." spinner |
| `exit_plan_mode.requested` | `plan_ready` | Plan card with approve/edit buttons |
| `assistant.intent` | `intent` | Status text: "Exploring codebase..." |
| `subagent.started` | `subagent_start` | "Sub-agent: Research Agent..." |
| `subagent.completed/failed` | `subagent_end` | Progress counter |
| `session.compaction_start/complete` | `compaction` | "Optimizing context..." badge |

### Implementation: ~85 lines total (Low complexity)

Same `session.on()` → `res.write(SSE)` pattern as existing event handlers. Each new event is ~5 lines. Directly follows the established pattern in server.ts.

---

## Integration with Existing Codebase

### Current Tool Registration Pattern (Already Working)

```typescript
// server.ts — buildSessionConfig()
function buildSessionConfig(token: string, model: string): SessionConfig {
  return {
    model,
    streaming: true,
    onPermissionRequest: safePermissionHandler,
    systemMessage: { content: ORCHESTRATOR_SYSTEM_MESSAGE },
    tools: [...createGitHubTools(token), ...createPlanningTools(token, planningStore)],
    hooks: { /* onPreToolUse, onPostToolUse, onSessionStart, onSessionEnd, onErrorOccurred */ },
  };
}
```

New features integrate at these points:
- **User input requests**: Add `onUserInputRequest` callback to `buildSessionConfig()` return object
- **Reasoning effort**: Add `reasoningEffort` to `buildSessionConfig()` (accept as parameter)
- **Planning events**: Add `session.on()` listeners alongside existing tool/title/usage listeners
- **File attachments**: Modify `session.send()` call to include `attachments` array

### Event Handler Pattern (Already Established)

```typescript
// Existing pattern in server.ts POST /api/chat:
unsubscribers.push(
  session.on("tool.execution_start", (event) => {
    res.write(`data: ${JSON.stringify({ type: "tool_start", tool: event.data?.toolName })}\n\n`);
  })
);
```

New events follow the identical pattern — no architectural changes needed.

---

## Decision: Implementation Priority

### Tier 1: Implement Now (High Value, Low-Medium Effort)

| Feature | Value | Effort | Why Now |
|---|---|---|---|
| **Planning/intent events** (`session.mode_changed`, `assistant.intent`, `subagent.*`) | High | Low (~85 lines) | Direct UX improvement; follows existing pattern |
| **Reasoning effort control** | Medium | Low (~30 lines backend + ~20 lines frontend) | Simple conditional dropdown; improves research quality options |
| **Compaction events** | Low-Med | Low (~10 lines) | Transparency during long sessions |

### Tier 2: Implement Soon (High Value, Medium Effort)

| Feature | Value | Effort | Why Soon |
|---|---|---|---|
| **User input requests** | High | Medium (~100 lines + frontend) | Enables structured goal definition; needs new endpoint |
| **Session disconnect + idle timeout** | Medium | Medium | Resource cleanup for production |
| **Message replay fallback** | Medium | Medium | Fixes context loss after container restart |

### Tier 3: Defer (Medium Value, Higher Effort)

| Feature | Value | Effort | Why Defer |
|---|---|---|---|
| **File attachments (full upload)** | Medium | Medium-High | Temp file lifecycle, security, upload UX |
| **Code paste attachments (MVP)** | Medium | Low-Medium | Simpler alternative to full upload |
| **Reasoning delta streaming** UI | Low-Med | Medium | Collapsible "Thinking..." section |

### Tier 4: Skip (Low Value for This Project)

| Feature | Reason to Skip |
|---|---|
| **MCP Server Integration** | Native tools are simpler and already working |
| **BYOK** | gpt-4.1 at 0 cost; no model gap justifying extra cost |
| **Custom Agents** | System message + tool gating covers planning phases |
| **Fleet Mode** | Experimental; not relevant for planning UX |

---

## Key Insight for R3 Bridge

The original R6 question hypothesized that MCP server integration could solve the R3 bridge problem (web app → GitHub write operations). **This is not the recommended approach.** The native `Tool` pattern already used in `tools.ts` is simpler, faster (no IPC overhead), and already proven. Adding GitHub write tools should follow the existing `createGitHubTools(token)` factory pattern.

This aligns with the R3 findings: direct REST API calls via native tools is the right architecture.

---

## Corrections to sdk-reference.md

The following entries in Section 8 ("Unused SDK Features") and Section 9 ("Recommendations") should be updated:

1. **Section 8.3 (Tool System)**: "❌ No custom tools are defined" → Now has 14 custom tools
2. **Section 8.4 (System Message)**: "❌ The default Copilot persona is used" → Now has `ORCHESTRATOR_SYSTEM_MESSAGE`
3. **Section 8.6 (Session Hooks)**: "❌ No hooks are configured" → Now has all 5 hook types
4. **Section 5.2 (Session Creation)**: Shows `approveAll` → Now uses custom `safePermissionHandler`
5. **Section 8.13 (Additional Unused Events)**: Several events are now used (`tool.*`, `session.title_changed`, `assistant.usage`)
6. **Section 8.13 event table**: Lists `planning.started/end` which **don't exist in the SDK**. Replace with `session.mode_changed`, `session.plan_changed`, `exit_plan_mode.requested`
7. **Section 9 Recommendations**: Several "Should Implement" items are already implemented (abort, title events, usage events, tools, hooks)
