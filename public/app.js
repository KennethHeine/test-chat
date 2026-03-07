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

function toggleSidebar() {
  sessionSidebar.classList.toggle("collapsed");
  const isCollapsed = sessionSidebar.classList.contains("collapsed");
  localStorage.setItem("copilot_sidebar_collapsed", isCollapsed ? "true" : "false");
}

function restoreSidebarState() {
  const collapsed = localStorage.getItem("copilot_sidebar_collapsed") === "true";
  if (collapsed) {
    sessionSidebar.classList.add("collapsed");
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
}

toggleSidebarBtn.addEventListener("click", toggleSidebar);

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

// --- Tool Activity Helpers ---
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

saveTokenBtn.addEventListener("click", () => {
  const current = getToken();
  if (current) {
    // Clear token
    saveToken("");
    modelSelect.innerHTML = '<option value="gpt-4.1">Enter token to load models</option>';
  } else {
    // Save new token
    const val = tokenInput.value.trim();
    if (!val) return;
    saveToken(val);
    loadModels();
    loadSessionsFromBackend();
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
      if (data.copilotCli) parts.push("CLI ready");
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
            hideToolActivity();
          } else if (event.type === "title" && event.title) {
            // Update session title with AI-generated title
            updateSessionTitle(sessionId || event.sessionId, event.title);
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
