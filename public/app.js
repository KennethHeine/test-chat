// --- State ---
let sessionId = null;
let isStreaming = false;

// --- DOM ---
const messagesEl = document.getElementById("messages");
const welcomeEl = document.getElementById("welcome");
const inputEl = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const stopBtn = document.getElementById("stop-btn");
const newChatBtn = document.getElementById("new-chat-btn");
const modelSelect = document.getElementById("model-select");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const tokenInput = document.getElementById("token-input");
const saveTokenBtn = document.getElementById("save-token-btn");
const sessionListEl = document.getElementById("session-list");
const toggleSidebarBtn = document.getElementById("toggle-sidebar-btn");
const sessionSidebar = document.getElementById("session-sidebar");
const toolActivityEl = document.getElementById("tool-activity");
const toolActivityText = document.getElementById("tool-activity-text");
const usageDisplay = document.getElementById("usage-display");
const usageText = document.getElementById("usage-text");
const quotaDisplay = document.getElementById("quota-display");
const quotaText = document.getElementById("quota-text");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const fleetBtn = document.getElementById("fleet-btn");
const fleetDialogOverlay = document.getElementById("fleet-dialog-overlay");
const fleetPromptInput = document.getElementById("fleet-prompt-input");
const launchFleetBtn = document.getElementById("launch-fleet-btn");
const cancelFleetBtn = document.getElementById("cancel-fleet-btn");
const fleetStatusEl = document.getElementById("fleet-status");
const fleetDialogError = document.getElementById("fleet-dialog-error");

// --- Token Management ---
function getToken() {
  return localStorage.getItem("copilot_github_token") || "";
}

function saveToken(token) {
  if (token) {
    localStorage.setItem("copilot_github_token", token);
  } else {
    localStorage.removeItem("copilot_github_token");
  }
  updateTokenUI();
}

function updateTokenUI() {
  const token = getToken();
  if (token) {
    tokenInput.value = "";
    tokenInput.placeholder = "Token saved ✓  (click Save to clear)";
    saveTokenBtn.textContent = "Clear Token";
  } else {
    tokenInput.placeholder = "GitHub token (ghp_... or github_pat_...)";
    saveTokenBtn.textContent = "Save Token";
  }
}

function authHeaders() {
  const token = getToken();
  const headers = {};
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }
  return headers;
}

// --- Session Persistence (localStorage) ---

function getSessionStorageKey() {
  return "copilot_sessions";
}

function loadSavedSessions() {
  try {
    const data = localStorage.getItem(getSessionStorageKey());
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions) {
  localStorage.setItem(getSessionStorageKey(), JSON.stringify(sessions));
}

function saveCurrentSessionMessages() {
  if (!sessionId) return;
  const sessions = loadSavedSessions();
  const existing = sessions.find((s) => s.id === sessionId);
  const messages = getMessagesFromDOM();

  // Don't create new entries for empty sessions
  if (!existing && messages.length === 0) return;

  if (existing) {
    existing.messages = messages;
    existing.updatedAt = new Date().toISOString();
  } else {
    const firstUserMsg = messages.find((m) => m.role === "user");
    const title = firstUserMsg ? firstUserMsg.text : "New conversation";
    const displayTitle = title.length > 50 ? title.slice(0, 50) + "…" : title;
    sessions.unshift({
      id: sessionId,
      title: displayTitle,
      model: modelSelect.value,
      messages,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  saveSessions(sessions);
  renderSessionList();

  // Persist messages to backend (fire-and-forget), keeping localStorage as a fast cache
  persistMessagesToBackend(sessionId, messages);
}

async function persistMessagesToBackend(sid, messages) {
  try {
    const response = await fetch(
      "/api/sessions/" + encodeURIComponent(sid) + "/messages",
      {
        method: "PUT",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ messages }),
      }
    );
    if (!response.ok) {
      console.error("Failed to persist session messages to server:", response.status);
    }
  } catch (err) {
    console.error("Error persisting session messages to server:", err);
  }
}

function getMessagesFromDOM() {
  const msgs = [];
  const elements = messagesEl.querySelectorAll(".message");
  for (const el of elements) {
    const contentEl = el.querySelector(".content");
    if (!contentEl) continue;
    let role = "user";
    if (el.classList.contains("assistant")) role = "assistant";
    if (el.classList.contains("error")) role = "error";
    msgs.push({ role, text: contentEl.textContent || "" });
  }
  return msgs;
}

function deleteSavedSession(sid) {
  let sessions = loadSavedSessions();
  sessions = sessions.filter((s) => s.id !== sid);
  saveSessions(sessions);

  // Also delete on backend
  fetch(`/api/sessions/${encodeURIComponent(sid)}`, {
    method: "DELETE",
    headers: authHeaders(),
  }).catch((err) => {
    console.warn("Failed to delete session on backend:", err);
  });

  if (sessionId === sid) {
    sessionId = null;
    localStorage.removeItem("copilot_last_session");
    clearChatUI();
    updateFleetBtnState();
  }

  renderSessionList();
}

function switchToSession(sid) {
  // Save current session first
  if (sessionId && sessionId !== sid) {
    saveCurrentSessionMessages();
  }

  const sessions = loadSavedSessions();
  const target = sessions.find((s) => s.id === sid);
  if (!target) return;

  sessionId = sid;
  localStorage.setItem("copilot_last_session", sid);

  // Restore messages
  clearMessagesOnly();
  welcomeEl.style.display = "none";

  for (const msg of target.messages) {
    appendMessage(msg.role, msg.text);
  }

  renderSessionList();
  updateFleetBtnState();
  // Clear any fleet status from the previous session
  fleetStatusEl.style.display = "none";
  fleetStatusEl.textContent = "";
  closeSidebarOnMobile();
  inputEl.focus();
}

function updateSessionTitle(sid, title) {
  if (!sid || !title) return;
  const sessions = loadSavedSessions();
  const target = sessions.find((s) => s.id === sid);
  if (target) {
    target.title = title;
    saveSessions(sessions);
    renderSessionList();
  }
}

function clearChatUI() {
  messagesEl.innerHTML = "";
  messagesEl.appendChild(welcomeEl);
  welcomeEl.style.display = "flex";
}

function clearMessagesOnly() {
  messagesEl.innerHTML = "";
  messagesEl.appendChild(welcomeEl);
}

function renderSessionList() {
  const sessions = loadSavedSessions();

  if (sessions.length === 0) {
    sessionListEl.innerHTML = '<div class="session-empty">No sessions yet.<br>Start a conversation!</div>';
    return;
  }

  sessionListEl.innerHTML = "";
  for (const s of sessions) {
    const item = document.createElement("div");
    item.className = "session-item" + (s.id === sessionId ? " active" : "");
    item.setAttribute("data-session-id", s.id);

    const text = document.createElement("div");
    text.className = "session-item-text";

    const titleEl = document.createElement("div");
    titleEl.textContent = s.title || "New conversation";
    text.appendChild(titleEl);

    const meta = document.createElement("div");
    meta.className = "session-item-meta";
    const date = new Date(s.updatedAt || s.createdAt);
    meta.textContent = formatSessionDate(date);
    text.appendChild(meta);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "session-item-delete";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "Delete session";
    deleteBtn.setAttribute("aria-label", `Delete session: ${s.title || "New conversation"}`);
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSavedSession(s.id);
    });

    item.appendChild(text);
    item.appendChild(deleteBtn);

    item.addEventListener("click", () => switchToSession(s.id));
    sessionListEl.appendChild(item);
  }
}

function formatSessionDate(date) {
  const now = new Date();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

// --- Sidebar Toggle ---

function isMobileView() {
  return window.matchMedia("(max-width: 768px)").matches;
}

function toggleSidebar() {
  sessionSidebar.classList.toggle("collapsed");
  const isCollapsed = sessionSidebar.classList.contains("collapsed");
  localStorage.setItem("copilot_sidebar_collapsed", isCollapsed ? "true" : "false");

  // Show/hide backdrop on mobile
  if (isMobileView()) {
    sidebarBackdrop.style.display = isCollapsed ? "none" : "block";
  }
}

function closeSidebarOnMobile() {
  if (isMobileView() && !sessionSidebar.classList.contains("collapsed")) {
    sessionSidebar.classList.add("collapsed");
    sidebarBackdrop.style.display = "none";
    localStorage.setItem("copilot_sidebar_collapsed", "true");
  }
}

function restoreSidebarState() {
  const collapsed = localStorage.getItem("copilot_sidebar_collapsed") === "true";
  // On mobile, always start collapsed
  if (isMobileView() || collapsed) {
    sessionSidebar.classList.add("collapsed");
    sidebarBackdrop.style.display = "none";
  }
}

function restoreLastSession() {
  const lastId = localStorage.getItem("copilot_last_session");
  if (!lastId) return;

  const sessions = loadSavedSessions();
  const target = sessions.find((s) => s.id === lastId);
  if (!target || !target.messages || target.messages.length === 0) return;

  sessionId = lastId;
  clearMessagesOnly();
  welcomeEl.style.display = "none";

  for (const msg of target.messages) {
    appendMessage(msg.role, msg.text);
  }

  renderSessionList();
  updateFleetBtnState();
}

// --- Backend Session Loading ---

async function loadSessionsFromBackend() {
  try {
    const res = await fetch("/api/sessions", { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data.sessions)) return;

    const localSessions = loadSavedSessions();
    const localMap = new Map(localSessions.map((s) => [s.id, s]));

    // Merge backend sessions into local cache
    let changed = false;
    for (const remote of data.sessions) {
      const local = localMap.get(remote.id);
      if (!local) {
        // Session exists on backend but not locally — fetch its messages
        const msgRes = await fetch(
          "/api/sessions/" + encodeURIComponent(remote.id) + "/messages",
          { headers: authHeaders() }
        );
        const msgData = msgRes.ok ? await msgRes.json() : { messages: [] };
        localMap.set(remote.id, {
          id: remote.id,
          title: remote.title,
          model: remote.model,
          messages: msgData.messages || [],
          createdAt: remote.createdAt,
          updatedAt: remote.updatedAt,
        });
        changed = true;
      } else if (remote.updatedAt > (local.updatedAt || "")) {
        // Backend is newer — update local metadata
        local.title = remote.title;
        local.model = remote.model;
        local.updatedAt = remote.updatedAt;
        changed = true;
      }
    }

    if (changed) {
      const merged = Array.from(localMap.values());
      merged.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      saveSessions(merged);
      renderSessionList();
    }
  } catch (err) {
    console.warn("Failed to load sessions from backend:", err);
  }
}

// --- Init ---
updateTokenUI();
checkHealth();
restoreSidebarState();
renderSessionList();
restoreLastSession();
if (getToken()) {
  loadModels();
  loadSessionsFromBackend();
  loadQuota();
}

toggleSidebarBtn.addEventListener("click", toggleSidebar);

// Close sidebar when backdrop is tapped (mobile)
sidebarBackdrop.addEventListener("click", closeSidebarOnMobile);

// --- Stop Button ---
stopBtn.addEventListener("click", async () => {
  if (!isStreaming || !sessionId) return;
  try {
    await fetch("/api/chat/abort", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ sessionId }),
    });
  } catch (err) {
    console.warn("Failed to abort:", err);
  }
});

// --- Fleet Button State ---
function updateFleetBtnState() {
  fleetBtn.disabled = !sessionId || isStreaming;
  if (!sessionId) {
    fleetStatusEl.style.display = "none";
    fleetStatusEl.textContent = "";
  }
}

// --- Fleet Dispatch ---

function openFleetDialog() {
  fleetPromptInput.value = "";
  fleetDialogError.style.display = "none";
  fleetDialogError.textContent = "";
  launchFleetBtn.disabled = false;
  fleetDialogOverlay.classList.add("open");
  fleetPromptInput.focus();
}

function closeFleetDialog() {
  fleetDialogOverlay.classList.remove("open");
  fleetBtn.focus();
}

function showFleetStatus(agentCount) {
  fleetStatusEl.textContent = `Fleet active: ${agentCount} agents`;
  fleetStatusEl.style.display = "inline";
}

async function dispatchFleet() {
  if (!sessionId) {
    fleetDialogError.textContent = "No active session";
    fleetDialogError.style.display = "block";
    return;
  }

  const prompt = fleetPromptInput.value.trim();

  fleetDialogError.style.display = "none";
  fleetDialogError.textContent = "";
  launchFleetBtn.disabled = true;

  try {
    const body = { sessionId };
    if (prompt) body.prompt = prompt;

    const res = await fetch("/api/fleet/start", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = data.error || `HTTP ${res.status}`;
      fleetDialogError.textContent = errMsg;
      fleetDialogError.style.display = "block";
      return;
    }

    // Fetch the actual subagent count from the status endpoint
    let subagentCount = 0;
    const fleetId = data.fleetId;
    if (fleetId) {
      try {
        const statusRes = await fetch(`/api/fleet/${encodeURIComponent(fleetId)}/status`, {
          headers: authHeaders(),
        });
        if (statusRes.ok) {
          const statusData = await statusRes.json().catch(() => ({}));
          if (typeof statusData.subagentCount === "number") {
            subagentCount = statusData.subagentCount;
          }
        }
      } catch {
        // Fall back to 0 if status fetch fails
      }
    }

    closeFleetDialog();
    showFleetStatus(subagentCount);
  } catch (err) {
    fleetDialogError.textContent = err.message || "Failed to dispatch fleet";
    fleetDialogError.style.display = "block";
  } finally {
    launchFleetBtn.disabled = false;
  }
}

fleetBtn.addEventListener("click", openFleetDialog);
cancelFleetBtn.addEventListener("click", closeFleetDialog);
fleetDialogOverlay.addEventListener("click", (e) => {
  if (e.target === fleetDialogOverlay) closeFleetDialog();
});
launchFleetBtn.addEventListener("click", dispatchFleet);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && fleetDialogOverlay.classList.contains("open")) {
    closeFleetDialog();
  }
});
const TOOL_DISPLAY_NAMES = {
  "read_file": "📄 Reading file",
  "edit_file": "✏️ Editing file",
  "write_file": "✏️ Writing file",
  "shell": "🐚 Running command",
  "search": "🔍 Searching",
  "web_search": "🌐 Searching web",
  "list_files": "📁 Listing files",
};

function formatToolName(toolName) {
  return TOOL_DISPLAY_NAMES[toolName] || `⚙️ ${toolName}`;
}

function showToolActivity(toolName) {
  toolActivityText.textContent = formatToolName(toolName) + "...";
  toolActivityEl.style.display = "inline";
}

function hideToolActivity() {
  toolActivityEl.style.display = "none";
  toolActivityText.textContent = "";
}

/**
 * Handles a parsed tool_complete SSE event.
 * Extracted so it can be called from both the streaming loop and tests.
 * For save_goal, renders the goal summary card using the result data when present,
 * or falls back to fetching the latest goal from the API.
 * For generate_research_checklist, renders the categorized research checklist.
 * @param {Object} event - The parsed tool_complete SSE event
 */
function handleToolComplete(event) {
  // When save_goal completes, render the goal summary card in the chat
  if (event.tool === "save_goal") {
    if (event.result) {
      renderGoalCard(event.result);
    } else {
      // Fallback: fetch the latest goal if result wasn't included in the event
      fetchAndRenderLatestGoal();
    }
  }
  // When generate_research_checklist completes, render the research checklist
  if (event.tool === "generate_research_checklist") {
    if (event.result && Array.isArray(event.result.items)) {
      renderResearchChecklist(event.result.items);
    }
  }
  hideToolActivity();
}

function showUsage(usage) {
  if (!usage) return;
  const parts = [];
  if (usage.inputTokens) parts.push(`In: ${usage.inputTokens}`);
  if (usage.outputTokens) parts.push(`Out: ${usage.outputTokens}`);
  if (usage.totalTokens) parts.push(`Total: ${usage.totalTokens}`);
  if (parts.length > 0) {
    usageText.textContent = "Tokens — " + parts.join(" · ");
    usageDisplay.style.display = "inline";
  }
}

// --- Quota Display (Phase 2.6) ---
async function loadQuota() {
  // Clear previous quota to avoid showing stale data
  quotaText.textContent = "";
  quotaDisplay.style.display = "none";

  try {
    const res = await fetch("/api/quota", { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (data.quota) {
      const q = data.quota;
      const parts = [];
      if (q.premiumRequestsRemaining !== undefined) {
        parts.push(`Premium: ${q.premiumRequestsRemaining}/${q.premiumRequestsLimit || "∞"}`);
      }
      if (parts.length > 0) {
        quotaText.textContent = "Quota — " + parts.join(" · ");
        quotaDisplay.style.display = "inline";
      }
    }
  } catch (err) {
    console.warn("Failed to load quota:", err);
  }
}

// --- Model Switching Mid-Conversation (Phase 2.5) ---
modelSelect.addEventListener("change", async () => {
  if (!sessionId || isStreaming) return;
  const newModel = modelSelect.value;
  try {
    const res = await fetch("/api/chat/model", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ sessionId, model: newModel }),
    });
    if (res.ok) {
      // Update local session metadata
      const sessions = loadSavedSessions();
      const target = sessions.find((s) => s.id === sessionId);
      if (target) {
        target.model = newModel;
        saveSessions(sessions);
      }
    }
  } catch (err) {
    console.warn("Failed to switch model:", err);
  }
});

saveTokenBtn.addEventListener("click", () => {
  const current = getToken();
  if (current) {
    // Clear token
    saveToken("");
    modelSelect.innerHTML = '<option value="gpt-4.1">Enter token to load models</option>';
    // Clear stale quota when token is removed
    quotaText.textContent = "";
    quotaDisplay.style.display = "none";
  } else {
    // Save new token
    const val = tokenInput.value.trim();
    if (!val) return;
    saveToken(val);
    loadModels();
    loadSessionsFromBackend();
    loadQuota();
  }
});

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

inputEl.addEventListener("input", () => {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 200) + "px";
});

sendBtn.addEventListener("click", sendMessage);

newChatBtn.addEventListener("click", () => {
  // Save current session before starting new one
  if (sessionId) {
    saveCurrentSessionMessages();
  }
  sessionId = null;
  localStorage.removeItem("copilot_last_session");
  clearChatUI();
  renderSessionList();
  updateFleetBtnState();
  inputEl.focus();
});

// --- Health Check ---
async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    if (data.status === "ok") {
      statusDot.classList.remove("disconnected");
      const parts = [];
      if (data.clients?.connected > 0) parts.push(`${data.clients.connected} client(s)`);
      if (getToken()) parts.push("Token set");
      statusText.textContent = parts.length ? parts.join(" · ") : "Connected";
    } else {
      setDisconnected("Server error");
    }
  } catch {
    setDisconnected("Cannot reach server");
  }
}

function setDisconnected(msg) {
  statusDot.classList.add("disconnected");
  statusText.textContent = msg;
}

// --- Load Models ---
async function loadModels() {
  modelSelect.innerHTML = '<option value="gpt-4.1">Loading models...</option>';
  try {
    const res = await fetch("/api/models", { headers: authHeaders() });
    if (!res.ok) {
      modelSelect.innerHTML = '<option value="gpt-4.1">Enter token to load models</option>';
      return;
    }
    const data = await res.json();
    if (data.models && Array.isArray(data.models)) {
      modelSelect.innerHTML = "";
      for (const model of data.models) {
        const name = typeof model === "string" ? model : model.id || model.name;
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        modelSelect.appendChild(opt);
      }
      // Default to gpt-4.1 if available
      const defaultModel = "gpt-4.1";
      if ([...modelSelect.options].some((o) => o.value === defaultModel)) {
        modelSelect.value = defaultModel;
      }
    }
  } catch {
    modelSelect.innerHTML = '<option value="gpt-4.1">Enter token to load models</option>';
  }
}

// --- Send Message ---
async function sendMessage() {
  const text = inputEl.value.trim();
  if (!text || isStreaming) return;

  // Hide welcome
  welcomeEl.style.display = "none";

  // Add user message
  appendMessage("user", text);
  inputEl.value = "";
  inputEl.style.height = "auto";

  // Create assistant placeholder
  const assistantEl = appendMessage("assistant", "");
  assistantEl.classList.add("typing-indicator");

  isStreaming = true;
  sendBtn.disabled = true;
  sendBtn.style.display = "none";
  stopBtn.style.display = "inline-block";
  updateFleetBtnState();

  try {
    const body = JSON.stringify({
      message: text,
      sessionId: sessionId,
      model: modelSelect.value,
    });

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Request failed" }));
      throw new Error(err.error || `HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const event = JSON.parse(jsonStr);

          if (event.type === "delta" && event.content) {
            fullContent += event.content;
            const contentEl = assistantEl.querySelector(".content");
            contentEl.textContent = fullContent;
            messagesEl.scrollTop = messagesEl.scrollHeight;
          } else if (event.type === "tool_start") {
            showToolActivity(event.tool);
          } else if (event.type === "tool_complete") {
            handleToolComplete(event);
          } else if (event.type === "title" && event.title) {
            // Update session title with AI-generated title
            updateSessionTitle(sessionId, event.title);
          } else if (event.type === "usage") {
            showUsage(event.usage);
          } else if (event.type === "done") {
            sessionId = event.sessionId;
            // Persist session state
            localStorage.setItem("copilot_last_session", sessionId);
            saveCurrentSessionMessages();
          } else if (event.type === "error") {
            appendMessage("error", event.message);
          }
        } catch {
          // skip malformed JSON
        }
      }
    }

    assistantEl.classList.remove("typing-indicator");
  } catch (err) {
    assistantEl.classList.remove("typing-indicator");
    if (!assistantEl.querySelector(".content").textContent) {
      assistantEl.remove();
    }
    appendMessage("error", err.message);
  } finally {
    isStreaming = false;
    sendBtn.disabled = false;
    sendBtn.style.display = "inline-block";
    stopBtn.style.display = "none";
    hideToolActivity();
    updateFleetBtnState();
    inputEl.focus();
  }
}

// --- DOM Helpers ---
function appendMessage(role, text) {
  const el = document.createElement("div");
  el.className = `message ${role}`;

  const label = document.createElement("div");
  label.className = "label";
  label.textContent = role === "user" ? "You" : role === "assistant" ? "Copilot" : "";

  const content = document.createElement("div");
  content.className = "content";
  content.textContent = text;

  if (role !== "error") el.appendChild(label);
  el.appendChild(content);

  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return el;
}

// --- Goal Card Rendering ---

/**
 * Renders a structured goal summary card in the chat flow.
 * All user-supplied content is inserted via textContent to prevent XSS.
 * @param {Object} goal - The Goal object from the save_goal tool result
 */
function renderGoalCard(goal) {
  const card = document.createElement("div");
  card.className = "goal-card";
  card.setAttribute("data-goal-id", goal.id || "");

  // Header
  const header = document.createElement("div");
  header.className = "goal-card-header";
  const headerTitle = document.createElement("span");
  headerTitle.textContent = "🎯 Goal Defined";
  header.appendChild(headerTitle);
  card.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = "goal-card-body";

  // Helper to add a text field row
  function addField(label, value) {
    if (!value) return;
    const row = document.createElement("div");
    row.className = "goal-card-field";
    const labelEl = document.createElement("span");
    labelEl.className = "goal-card-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("span");
    valueEl.className = "goal-card-value";
    valueEl.textContent = value;
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    body.appendChild(row);
  }

  // Helper to add an array field (e.g. success criteria)
  function addListField(label, items, prefix) {
    if (!items || items.length === 0) return;
    const section = document.createElement("div");
    section.className = "goal-card-list-section";
    const labelEl = document.createElement("div");
    labelEl.className = "goal-card-label";
    labelEl.textContent = label;
    section.appendChild(labelEl);
    const list = document.createElement("ul");
    list.className = "goal-card-list";
    for (const item of items) {
      const li = document.createElement("li");
      li.textContent = (prefix || "") + item;
      list.appendChild(li);
    }
    section.appendChild(list);
    body.appendChild(section);
  }

  addField("Intent:", goal.intent);
  addField("Goal:", goal.goal);
  addField("Problem:", goal.problemStatement);
  addField("Business Value:", goal.businessValue);
  addField("Target Outcome:", goal.targetOutcome);
  addListField("Success Criteria:", goal.successCriteria, "✓ ");

  // Counts for assumptions, constraints, risks
  const counts = [];
  if (goal.assumptions && goal.assumptions.length > 0) counts.push(`Assumptions: ${goal.assumptions.length}`);
  if (goal.constraints && goal.constraints.length > 0) counts.push(`Constraints: ${goal.constraints.length}`);
  if (goal.risks && goal.risks.length > 0) counts.push(`Risks: ${goal.risks.length}`);
  if (counts.length > 0) {
    const countsEl = document.createElement("div");
    countsEl.className = "goal-card-counts";
    countsEl.textContent = counts.join(" · ");
    body.appendChild(countsEl);
  }

  card.appendChild(body);
  messagesEl.appendChild(card);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/**
 * Fetches the most recently created goal for the current session and renders it.
 * Used as a fallback when the save_goal tool result isn't included in the SSE event.
 */
async function fetchAndRenderLatestGoal() {
  try {
    const res = await fetch("/api/goals", { headers: authHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (data.goals && data.goals.length > 0) {
      // Show the most recently updated goal
      const latest = data.goals.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0];
      renderGoalCard(latest);
    }
  } catch (err) {
    console.warn("Failed to fetch goal for card rendering:", err);
  }
}

/** Human-readable labels for each research category. */
const CATEGORY_LABELS = {
  domain: "Domain",
  architecture: "Architecture",
  security: "Security",
  infrastructure: "Infrastructure",
  integration: "Integration",
  data_model: "Data Model",
  operational: "Operational",
  ux: "UX",
};
const VALID_STATUSES = ["open", "researching", "resolved"];

/**
 * Renders a categorized research checklist card in the chat flow.
 * All user-supplied content is inserted via textContent to prevent XSS.
 * @param {Array} items - Array of ResearchItem objects
 */
function renderResearchChecklist(items) {
  if (!items || items.length === 0) return;

  const card = document.createElement("div");
  card.className = "research-card";

  // Header
  const header = document.createElement("div");
  header.className = "research-card-header";
  const headerTitle = document.createElement("span");
  headerTitle.textContent = "🔬 Research Checklist";
  header.appendChild(headerTitle);
  card.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = "research-card-body";

  // Group items by category (preserving defined order from CATEGORY_LABELS)
  const categoryOrder = Object.keys(CATEGORY_LABELS);
  /** @type {Map<string, Array>} */
  const grouped = new Map();
  for (const item of items) {
    const cat = item.category || "domain";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat).push(item);
  }

  // Render categories in defined order, then any unexpected categories
  const orderedKeys = [...categoryOrder.filter(c => grouped.has(c)), ...Array.from(grouped.keys()).filter(c => !categoryOrder.includes(c))];

  for (const category of orderedKeys) {
    const categoryItems = grouped.get(category);
    const group = document.createElement("div");
    group.className = "research-category-group";

    const catHeader = document.createElement("div");
    catHeader.className = "research-category-header";
    catHeader.textContent = CATEGORY_LABELS[category] || "Other";
    group.appendChild(catHeader);

    for (const item of categoryItems) {
      const itemEl = document.createElement("div");
      itemEl.className = "research-item";

      const statusEl = document.createElement("span");
      const status = VALID_STATUSES.includes(item.status) ? item.status : "open";
      statusEl.className = "research-item-status status-" + status;
      statusEl.textContent = status;
      itemEl.appendChild(statusEl);

      const questionEl = document.createElement("span");
      questionEl.className = "research-item-question";
      questionEl.textContent = item.question || "";
      itemEl.appendChild(questionEl);

      group.appendChild(itemEl);
    }

    body.appendChild(group);
  }

  // Summary line
  const total = items.length;
  const resolved = items.filter(i => i.status === "resolved").length;
  const researching = items.filter(i => i.status === "researching").length;
  const open = total - resolved - researching;
  const summaryParts = [];
  if (open > 0) summaryParts.push(`Open: ${open}`);
  if (researching > 0) summaryParts.push(`Researching: ${researching}`);
  if (resolved > 0) summaryParts.push(`Resolved: ${resolved}`);
  const summaryEl = document.createElement("div");
  summaryEl.className = "research-card-summary";
  summaryEl.textContent = summaryParts.join(" · ");
  body.appendChild(summaryEl);

  card.appendChild(body);
  messagesEl.appendChild(card);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
