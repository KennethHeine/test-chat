# Frontend Documentation

The frontend is a React 19 + TypeScript application built with Vite. Source lives in `frontend/` and the production build outputs to `frontend/dist/`, which the Express server serves as static assets. The legacy `public/` directory is kept as a fallback.

## Files

| File/Directory | Purpose |
|------|---------|
| `frontend/src/App.tsx` | Root component — state management, global function exposure, SSE streaming |
| `frontend/src/components/ChatArea.tsx` | Chat messages, goal/research/milestone cards, input area |
| `frontend/src/components/Dashboard.tsx` | Dashboard view with Goals, Research, Milestones, Issues pages |
| `frontend/src/components/Sidebar.tsx` | Session sidebar with switch/delete |
| `frontend/src/components/StatusBar.tsx` | Connection status, tool activity, usage, quota |
| `frontend/src/components/PushModal.tsx` | Multi-step push to GitHub workflow modal |
| `frontend/src/components/GitHubIcon.tsx` | Shared GitHub SVG icon |
| `frontend/src/utils/api.ts` | API fetch helper, HTML escape, date formatting |
| `frontend/src/utils/types.ts` | Shared TypeScript types |
| `frontend/src/index.css` | All CSS (extracted from original monolithic index.html) |
| `frontend/src/main.tsx` | React entry point |
| `frontend/index.html` | Vite HTML template |
| `frontend/vite.config.ts` | Vite configuration |
| `public/staticwebapp.config.json` | Azure Static Web Apps routing config |

## Build & Dev Commands

| Command | Description |
|---------|-------------|
| `cd frontend && npm ci` | Install frontend dependencies |
| `cd frontend && npm run dev` | Start Vite dev server with HMR |
| `cd frontend && npm run build` | TypeScript check + Vite production build → `frontend/dist/` |
| `cd frontend && npx tsc -b` | TypeScript-only check (no build) |

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

**Theme:** GitHub dark mode (`#0d1117` background, `#e6edf3` text), implemented using CSS custom properties with hex color values.

### Key UI Components

| Component | Element ID | React Component |
|-----------|-----------|-----------------|
| Token input | `#token-input` | `App.tsx` |
| Save Token | `#save-token-btn` | `App.tsx` |
| Model selector | `#model-select` | `App.tsx` |
| Reasoning effort | `#reasoning-effort-select` | `App.tsx` |
| New Chat | `#new-chat-btn` | `App.tsx` |
| Session sidebar | `#session-sidebar` | `Sidebar.tsx` |
| Message input | `#message-input` | `ChatArea.tsx` |
| Send button | `#send-btn` | `ChatArea.tsx` |
| Stop button | `#stop-btn` | `ChatArea.tsx` |
| Status indicator | `#status-dot` | `StatusBar.tsx` |
| Dashboard view | `#dashboard-view` | `Dashboard.tsx` |
| Push modal | `#push-modal` | `PushModal.tsx` |

## Application State

State is managed via React `useState` hooks in `App.tsx`. Key state variables:

| State | Type | Purpose |
|-------|------|---------|
| `token` | `string` | GitHub PAT, initialized from `localStorage["copilot_github_token"]` |
| `sessionId` | `string` | Current session ID for multi-turn conversations |
| `chatItems` | `ChatItem[]` | Messages and cards (goals, research, milestones) in the chat |
| `isStreaming` | `boolean` | Prevents double-sending while a response is being streamed |
| `currentView` | `ViewMode` | Active view: `"chat"` or `"dashboard"`. Persisted in `localStorage["copilot_current_view"]` |
| `currentDashboardPage` | `DashboardPage` | Active dashboard page. Persisted in `localStorage["copilot_dashboard_page"]` |
| `models` | `ModelInfo[]` | Available models from `/api/models` |
| `selectedModel` | `string` | Currently selected model ID |
| `sessions` | `SessionData[]` | Session list for sidebar |
| `sidebarOpen` | `boolean` | Sidebar visibility. Persisted in `localStorage["copilot_sidebar_collapsed"]` |

### Global Function Exposure

For E2E test compatibility, key functions are exposed on `window`:

| Function | Purpose |
|----------|---------|
| `window.renderGoalCard(goal)` | Adds a goal card to the chat |
| `window.handleToolComplete(event)` | Handles SSE tool_complete events |
| `window.renderResearchChecklist(items)` | Adds a research checklist card to the chat |
| `window.renderMilestoneTimeline(milestones)` | Adds a milestone timeline card to the chat |
| `window.fetchAndRenderLatestGoal()` | Fetches and renders the latest goal |

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
| `planning_start` | Shows "🗺️ Planning..." in agent status indicator |
| `plan_ready` | Shows "✅ Plan ready" in agent status indicator |
| `intent` | Shows current agent activity (e.g., "💡 Exploring codebase") in agent status indicator |
| `subagent_start` | Shows sub-agent name and active count in agent status indicator |
| `subagent_end` | Decrements active sub-agent counter; hides indicator when all complete |
| `compaction` | Shows "🔄 Optimizing context..." when started; hides when complete |
| `user_input_request` | Renders an inline question card for agent input requests (choices + optional freeform field) |
| `done` | Stores `sessionId`, removes typing indicator, enables send button, clears agent status |
| `error` | Displays error message to user |

#### `user_input_request` Details

When the agent needs clarification, a `user_input_request` SSE event blocks the stream until the user responds. The frontend renders a question card with:

- The agent's question text
- Selectable choice buttons (if `choices` is non-empty)
- A freeform text input (if `allowFreeform` is true)

On submission, the frontend calls `POST /api/chat/input` with `{ requestId, answer, wasFreeform }`. Requests time out after 2 minutes if unanswered. When the SSE connection closes, all pending input requests from that connection are automatically rejected.

## Model Switching

The model dropdown (`#model-select`) is populated on page load by fetching `GET /api/models`. When the user changes the selected model during an active session, the frontend automatically fires `POST /api/chat/model` to switch the model mid-conversation without creating a new session.

## Reasoning Effort Control

A reasoning effort dropdown (`#reasoning-effort-select`) appears conditionally next to the model selector when the currently selected model has `capabilities.supports.reasoningEffort === true` (e.g., `o4-mini`). Options are populated from the model's `supportedReasoningEfforts` array with the default pre-selected from `defaultReasoningEffort`. The selected effort level is sent as `reasoningEffort` in the `POST /api/chat` request body. Changing the model hides or shows the dropdown and resets the selection to the new model's default.

## Quota Display

Premium request quota is fetched via `GET /api/quota` and displayed in the status bar. This helps users monitor their remaining Copilot usage.

## Planning Dashboard

The dashboard is a second top-level view alongside the chat. It provides a read-only window into all planning data (goals, research, milestones, issue drafts) created by the planning tools during chat sessions.

### Navigation

| Function | Description |
|----------|-------------|
| `switchView(view)` | Toggle between `"chat"` and `"dashboard"` views. Persists the selection to `localStorage`. |
| `navigateDashboard(page)` | Navigate between the four dashboard pages. Persists to `localStorage`. |

A "Dashboard" button in the header switches to dashboard view. A nav bar at the top of the dashboard switches between pages. Both selections are restored on page load.

### Dashboard Pages

#### Goals Page

Loaded by `loadGoalsDashboard()`. Fetches goals from `GET /api/goals` and displays them sorted newest-first. Each goal card shows:

- Goal statement, problem statement, business value
- Counts of research items, milestones, and issue drafts (fetched via `fetchGoalCounts(goalId)`)
- Click to drill into goal detail

Clicking a goal navigates to a detail view (`showGoalDetail(goalId)`) that shows the full goal object and provides links to view its research items and milestones.

#### Research Page

Loaded by `loadResearchDashboard()`. Fetches all goals via `GET /api/goals`, then loads research items for the selected goal (defaulting to the first) via `GET /api/goals/:id/research`. A goal selector allows switching between goals. Each research item card shows:

- Category badge (`domain`, `architecture`, `security`, `infrastructure`, `integration`, `data_model`, `operational`, `ux`)
- Question text
- Status badge (`open`, `researching`, `resolved`)
- Findings and decision (when resolved), with source URL link

#### Milestones Page

Loaded by `loadMilestonesDashboard()`. Fetches all goals via `GET /api/goals`, then loads milestones for the selected goal (defaulting to the first) via `GET /api/goals/:id/milestones`. A goal selector allows switching between goals. Each milestone card shows:

- Order number and milestone name
- Status badge (`draft`, `ready`, `in-progress`, `complete`)
- GitHub milestone link (when pushed to GitHub)
- Acceptance criteria

#### Issues Page

Loaded by `loadIssuesDashboard()`. Uses two selectors with incremental fetching: loads goals via `GET /api/goals`, then milestones for the selected goal via `GET /api/goals/:id/milestones`, then issue drafts for the selected milestone (defaulting to first) via `GET /api/milestones/:id/issues`. Each issue draft card shows:

- Title and order number
- Status badge (`draft`, `ready`, `created`)
- GitHub issue link (when pushed to GitHub)
- Purpose and expected outcome

### Push Approval Workflow

When the planning agent creates milestones and issue drafts, a **Push to GitHub** action becomes available in the dashboard. The workflow:

1. Agent creates or updates milestones and issue drafts; issue drafts that are candidates for pushing are marked `status: "ready"` via `update_issue_draft` (milestones appear in the push modal regardless of `status` and are queued when missing a `githubNumber`)
2. User reviews the item in the Milestones or Issues dashboard page
3. User triggers "Push to GitHub" → frontend calls `POST /api/milestones/:id/push-to-github` or `POST /api/milestones/:milestoneId/issues/:issueId/push-to-github`
4. Server calls the `create_github_milestone` / `create_github_issue` tool (idempotent)
5. On success:
   - Milestones are updated with `githubNumber` / `githubUrl` (status is unchanged — milestones do not have a `"created"` status)
   - Issue drafts are updated with `githubIssueNumber` and their status changes to `"created"`
6. Dashboard card updates to show the GitHub link

Both push endpoints are idempotent — re-triggering a push for an already-created item returns the existing GitHub data without creating duplicates.

## Related Documentation

- [Architecture](architecture.md) — System overview and data flow
- [Frontend Testing](frontend-testing.md) — Playwright E2E tests for the UI
- [Backend](backend.md) — API endpoints the frontend communicates with
