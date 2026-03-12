# Frontend Documentation

The frontend is a **React 19 + TypeScript** single-page application built with **Vite**. It lives in the `frontend/` directory and is served as static files by the Express server from `frontend/dist/`.

## Project Structure

```
frontend/
├── index.html              # Entry HTML (Vite injects script/style tags)
├── vite.config.ts          # Vite configuration with React plugin
├── tsconfig.json           # TypeScript config (strict, JSX, bundler mode)
├── package.json            # Frontend dependencies (React, Vite, TypeScript)
├── public/
│   └── staticwebapp.config.json  # Azure SWA routing config
└── src/
    ├── main.tsx            # React entry point (StrictMode, createRoot)
    ├── App.tsx             # Root component — layout, view switching, state orchestration
    ├── index.css           # All CSS (dark theme, dashboard styles, animations)
    ├── types.ts            # Shared TypeScript types and constants
    ├── utils/
    │   ├── api.ts          # Auth headers, apiFetch, apiJson helpers
    │   ├── sessions.ts     # LocalStorage session CRUD + formatting
    │   └── escHtml.ts      # HTML escaping utility
    ├── hooks/
    │   ├── useAuth.ts      # Token state management
    │   ├── useModels.ts    # Model list loading and selection
    │   ├── useChat.ts      # SSE streaming, messages, tool events, abort
    │   ├── useSessions.ts  # Session list with backend sync
    │   └── useQuota.ts     # Premium request quota
    └── components/
        ├── Header.tsx       # Top bar: token, model selector, nav buttons
        ├── StatusBar.tsx    # Bottom bar: connection, tools, usage, quota
        ├── SessionSidebar.tsx # Session list sidebar
        ├── ChatArea.tsx     # Messages, input, user-input cards
        └── Dashboard/
            ├── DashboardView.tsx   # Dashboard layout with nav
            ├── GoalsPage.tsx       # Goals list and detail view
            ├── ResearchPage.tsx    # Research items by category
            ├── MilestonesPage.tsx  # Milestone timeline
            ├── IssuesPage.tsx      # Issue drafts with expand/approve
            └── PushModal.tsx       # Push to GitHub workflow modal
```

## Build Commands

| Command | Description |
|---------|-------------|
| `npm run build:frontend` | Install deps + typecheck + Vite build → `frontend/dist/` |
| `npm run dev:frontend` | Vite dev server with HMR (proxies `/api` to backend) |
| `cd frontend && npx tsc --noEmit` | Typecheck frontend only |

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

**Theme:** GitHub dark mode (`#0d1117` background, `#e6edf3` text). Uses OKLCH color format for CSS custom properties.

### Key UI Components

| Component | Element ID | Description |
|-----------|-----------|-------------|
| Token input | `#token-input` | Text field for GitHub PAT entry |
| Save/Clear Token | `#save-token-btn` | Toggles between save and clear token |
| Model selector | `#model-select` | Dropdown populated from `/api/models` |
| Reasoning effort | `#reasoning-effort-select` | Conditional dropdown — visible only when selected model supports reasoning |
| Dashboard toggle | `#view-toggle-btn` | Switch between chat and dashboard views |
| New Chat | `#new-chat-btn` | Resets `sessionId`, clears messages, shows welcome screen |
| Session sidebar | `#session-sidebar` | List of previous conversations with timestamps |
| Message input | `#message-input` | Textarea for user messages |
| Send button | `#send-btn` | Sends the message (also triggered by Enter key) |
| Stop button | `#stop-btn` | Cancels streaming via `POST /api/chat/abort` |
| Status indicator | `#status-dot` | Shows connection status (green dot = connected) |

## React Architecture

### Custom Hooks

| Hook | Purpose |
|------|---------|
| `useAuth` | Manages token in `localStorage` and React state |
| `useModels` | Fetches model list from `/api/models`, tracks selection |
| `useChat` | Core chat logic: SSE streaming, message state, tool/agent events, abort |
| `useSessions` | Session list with localStorage cache + backend sync |
| `useQuota` | Premium request quota from `/api/quota` |

### State Management

State is managed through React hooks (no external state library):

| State | Location | Purpose |
|-------|----------|---------|
| Token | `useAuth` hook | GitHub PAT stored in localStorage, synced to React state |
| Messages | `useChat` hook | Current conversation messages (user + assistant + error) |
| Session ID | `useChat` hook | Current session ID, persisted in localStorage |
| View | `App` component | `"chat"` or `"dashboard"`, persisted in localStorage |
| Dashboard page | `DashboardView` | `"goals"`, `"research"`, `"milestones"`, or `"issues"` |

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

## SSE Stream Consumption

The `useChat` hook reads the SSE stream using the Fetch API's `ReadableStream`:

1. `POST /api/chat` returns a streaming response
2. Frontend reads chunks via `response.body.getReader()`
3. Chunks are decoded and split into SSE lines (`data: {...}\n`)
4. Each `delta` event appends content to the assistant's message via React state
5. The `done` event stores the `sessionId` for follow-up messages

### SSE Event Handling

| Event Type | Frontend Behavior |
|------------|-------------------|
| `delta` | Appends content to the assistant message |
| `tool_start` | Shows tool activity indicator with tool name |
| `tool_complete` | Hides tool activity indicator |
| `title` | Updates session title in sidebar |
| `usage` | Displays token count in status bar |
| `planning_start` | Shows "🗺️ Planning..." in agent status |
| `plan_ready` | Shows "✅ Plan ready" |
| `intent` | Shows current agent activity |
| `subagent_start/end` | Tracks active sub-agent count |
| `compaction` | Shows "🔄 Optimizing context..." |
| `user_input_request` | Renders inline question card |
| `done` | Stores sessionId, finalizes message |
| `error` | Displays error message |

## Planning Dashboard

The dashboard is a second top-level view alongside the chat, rendered by the `DashboardView` component with four sub-pages.

### Dashboard Pages

| Page | Component | API Endpoints |
|------|-----------|---------------|
| Goals | `GoalsPage` | `GET /api/goals`, counts from research/milestones/issues |
| Research | `ResearchPage` | `GET /api/goals/:id/research`, `PATCH` for inline editing |
| Milestones | `MilestonesPage` | `GET /api/goals/:id/milestones`, issue counts per milestone |
| Issues | `IssuesPage` | `GET /api/milestones/:id/issues`, expand/approve/batch approve |

### Push Approval Workflow

The `PushModal` component handles pushing milestones and issue drafts to GitHub:

1. User clicks "Push to GitHub" button (visible when ready issues exist)
2. Modal shows list of milestones and ready issues to push
3. User enters owner/repo and confirms
4. Frontend calls push endpoints sequentially with progress bar
5. Results show success/failure for each item

Both push endpoints are idempotent — re-triggering returns existing GitHub data.

## Development

### Dev Server with HMR

```bash
# Start backend server
npx tsx server.ts

# In another terminal, start Vite dev server
cd frontend && npm run dev
```

The Vite dev server proxies `/api` requests to the backend on port 3000.

### Production Build

```bash
npm run build:frontend  # Builds to frontend/dist/
npx tsx server.ts       # Serves from frontend/dist/
```

## Related Documentation

- [Architecture](architecture.md) — System overview and data flow
- [Frontend Testing](frontend-testing.md) — Playwright E2E tests for the UI
- [Backend](backend.md) — API endpoints the frontend communicates with
