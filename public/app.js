// --- State ---
let sessionId = null;
let isStreaming = false;

// --- DOM ---
const messagesEl = document.getElementById("messages");
const welcomeEl = document.getElementById("welcome");
const inputEl = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const newChatBtn = document.getElementById("new-chat-btn");
const modelSelect = document.getElementById("model-select");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const tokenInput = document.getElementById("token-input");
const saveTokenBtn = document.getElementById("save-token-btn");

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

// --- Init ---
updateTokenUI();
checkHealth();
if (getToken()) loadModels();

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
  sessionId = null;
  messagesEl.innerHTML = "";
  messagesEl.appendChild(welcomeEl);
  welcomeEl.style.display = "flex";
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
          } else if (event.type === "done") {
            sessionId = event.sessionId;
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
