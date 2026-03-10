# Frontend Documentation

The frontend is vanilla HTML, CSS, and JavaScript — no frameworks, no build step. Files are served as static assets by the Express server.

## Files

| File | Purpose |
|------|---------|
| `public/index.html` | Chat UI — GitHub dark theme, model selector, session sidebar |
| `public/app.js` | Frontend logic — token management, SSE parsing, session management |
| `public/staticwebapp.config.json` | Azure Static Web Apps routing config |

## UI Layout

```
┌─────────────────────────────────────────────────────────┐
│  Header                                                 │
│  [☰] [Token input] [Save Token]  [Model ▾]  [New Chat] │
├───────────┬─────────────────────────────────────────────┤
│ SESSIONS  │                                             │
│           │  Messages Area                              │
│ ▪ Chat 1  │  ┌─────────────────────────────────┐        │
│   2m ago  │  │ You: What is TypeScript? (blue)──┤       │
│           │  │                                  │       │
│ ▪ Chat 2  │  │ ├── Copilot: TypeScript   (dark) │       │
│   1h ago  │  │ │   is... ▌ (typing indicator)   │       │
│           │  └─────────────────────────────────┘        │
│           │                                             │
│           ├─────────────────────────────────────────────┤
│           │  [Message input textarea        ] [Send]    │
├───────────┴─────────────────────────────────────────────┤
│  ● Connected                                            │
└─────────────────────────────────────────────────────────┘
```

**Theme:** GitHub dark mode (`#0d1117` background, `#e6edf3` text).

### Key UI Components

| Component | Element ID | Description |
|-----------|-----------|-------------|
| Token input | `#token-input` | Text field for GitHub PAT entry |
| Save/Clear Token | `#save-token-btn` | Toggles between save and clear token |
| Model selector | `#model-select` | Dropdown populated from `/api/models` |
| New Chat | `#new-chat-btn` | Resets `sessionId`, clears messages, shows welcome screen |
| Session sidebar | `#sessions-list` | List of previous conversations with timestamps |
| Message input | `#message-input` | Textarea for user messages |
| Send button | `#send-btn` | Sends the message (also triggered by Enter key) |
| Stop button | `#stop-btn` | Cancels streaming via `POST /api/chat/abort` |
| Status indicator | `#status` | Shows connection status (green dot = connected) |
| Tool activity | In-chat indicator | Shows when the agent is executing a tool |
| Token usage | Status bar | Displays per-message token count |
| Quota display | Status bar | Shows remaining premium requests |

## Application State

The frontend manages minimal state in two variables:

| Variable | Type | Purpose |
|----------|------|---------|
| `sessionId` | `string \| null` | Current session ID for multi-turn conversations. Reset to `null` on "New Chat". |
| `isStreaming` | `boolean` | Prevents double-sending while a response is being streamed. |

## Token Management

Tokens are stored client-side in `localStorage` and sent as `Authorization: Bearer <token>` on every API request:

1. User pastes their GitHub PAT into the token input field
2. Clicks "Save Token" → stored in `localStorage["copilot_github_token"]`
3. UI updates: placeholder shows "Token saved ✓", button changes to "Clear Token"
4. On page load, if a token exists, the app automatically loads available models

The server never persists tokens — they exist only in the browser and in-flight request headers.

## Session Persistence

Sessions are persisted through a dual-layer caching strategy:

1. **`localStorage`** — fast cache for instant UI rendering on page load
2. **Backend API** (`/api/sessions`, `/api/sessions/:id/messages`) — persistent source of truth

### On page load or token save

1. Render session sidebar from `localStorage` immediately
2. Fetch sessions from `/api/sessions` in the background
3. Merge backend sessions into `localStorage` (backend wins on conflicts)
4. Re-render the sidebar if any changes were found

### When saving messages

1. Save to `localStorage` immediately (fast, synchronous)
2. Fire-and-forget `PUT /api/sessions/:id/messages` to persist to backend

This ensures the UI is always responsive while the backend provides cross-device persistence.

## SSE Stream Consumption

The frontend reads the SSE stream using the Fetch API's `ReadableStream`:

1. `POST /api/chat` returns a streaming response
2. Frontend reads chunks via `response.body.getReader()`
3. Chunks are decoded and split into SSE lines (`data: {...}\n`)
4. Each `delta` event appends content to the assistant's message bubble in real time
5. The `done` event stores the `sessionId` for follow-up messages
6. Typing indicator is removed when streaming completes

Buffering handles partial lines that may arrive split across network chunks.

### SSE Event Handling

| Event Type | Frontend Behavior |
|------------|-------------------|
| `delta` | Appends content to the assistant message bubble |
| `tool_start` | Shows tool activity indicator with tool name |
| `tool_complete` | Removes tool activity indicator; for `save_goal` events renders a goal summary card in chat (or fetches the latest goal as fallback); for `generate_research_checklist` events renders a categorized research checklist card with status badges |
| `title` | Updates session title in sidebar |
| `usage` | Displays token count (inputTokens + outputTokens) in status bar |
| `done` | Stores `sessionId`, removes typing indicator, enables send button |
| `error` | Displays error message to user |

## Model Switching

The model dropdown (`#model-select`) is populated on page load by fetching `GET /api/models`. When the user changes the selected model during an active session, the frontend automatically fires `POST /api/chat/model` to switch the model mid-conversation without creating a new session.

## Quota Display

Premium request quota is fetched via `GET /api/quota` and displayed in the status bar. This helps users monitor their remaining Copilot usage.

## Related Documentation

- [Architecture](architecture.md) — System overview and data flow
- [Frontend Testing](frontend-testing.md) — Playwright E2E tests for the UI
- [Backend](backend.md) — API endpoints the frontend communicates with
