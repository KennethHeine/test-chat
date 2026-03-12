// --- State ---
let sessionId = null;
let isStreaming = false;
let modelData = {}; // modelId -> full model object (populated after loadModels)
let currentView = "chat"; // "chat" | "dashboard"
let currentDashboardPage = "goals"; // "goals" | "research" | "milestones" | "issues"

// --- DOM ---
const messagesEl = document.getElementById("messages");
const welcomeEl = document.getElementById("welcome");
const inputEl = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const stopBtn = document.getElementById("stop-btn");
const newChatBtn = document.getElementById("new-chat-btn");
const modelSelect = document.getElementById("model-select");
const reasoningEffortSelect = document.getElementById("reasoning-effort-select");
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
const agentStatusEl = document.getElementById("agent-status");
const agentStatusText = document.getElementById("agent-status-text");
const sidebarBackdrop = document.getElementById("sidebar-backdrop");
const viewToggleBtn = document.getElementById("view-toggle-btn");
const chatAreaEl = document.getElementById("chat-area");
const dashboardViewEl = document.getElementById("dashboard-view");

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

// --- View Toggle (Chat ↔ Dashboard) ---

function switchView(view) {
  currentView = view;
  localStorage.setItem("copilot_current_view", view);
  if (view === "dashboard") {
    chatAreaEl.style.display = "none";
    dashboardViewEl.classList.add("active");
    viewToggleBtn.textContent = "Chat";
    viewToggleBtn.title = "Switch to chat view";
    viewToggleBtn.setAttribute("aria-label", "Switch to chat view");
    if (currentDashboardPage === "goals") {
      loadGoalsDashboard();
    }
  } else {
    chatAreaEl.style.display = "";
    dashboardViewEl.classList.remove("active");
    viewToggleBtn.textContent = "Dashboard";
    viewToggleBtn.title = "Switch to dashboard view";
    viewToggleBtn.setAttribute("aria-label", "Switch to dashboard view");
  }
}

// --- Dashboard Navigation ---

function navigateDashboard(page) {
  currentDashboardPage = page;
  localStorage.setItem("copilot_dashboard_page", page);
  document.querySelectorAll(".dashboard-nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.page === page);
  });
  document.querySelectorAll(".dashboard-page").forEach((el) => {
    el.classList.toggle("active", el.id === `dashboard-page-${page}`);
  });
  if (page === "goals") {
    loadGoalsDashboard();
  } else if (page === "research") {
    loadResearchDashboard();
  } else if (page === "milestones") {
    loadMilestonesDashboard();
  } else if (page === "issues") {
    loadIssuesDashboard();
  }
}

// --- Goal Dashboard ---

const goalsListView = document.getElementById("goals-list-view");
const goalsDetailView = document.getElementById("goals-detail-view");
const goalsListContent = document.getElementById("goals-list-content");

/** In-flight guard: true while loadGoalsDashboard() is fetching, to prevent duplicate calls. */
let goalsLoadInFlight = false;

/**
 * Loads goals from the API and renders the goal list in the dashboard.
 * Resets to list view before loading. De-dupes concurrent calls via in-flight guard.
 */
async function loadGoalsDashboard() {
  if (goalsLoadInFlight) return;
  goalsLoadInFlight = true;
  showGoalsList();
  if (!getToken()) {
    goalsListContent.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "dashboard-empty";
    empty.innerHTML = '<span class="dashboard-empty-icon">🔑</span><p>Save a GitHub token to view your goals.</p>';
    goalsListContent.appendChild(empty);
    goalsLoadInFlight = false;
    return;
  }

  goalsListContent.innerHTML = '<div class="dashboard-empty"><span class="spinner" aria-label="Loading"></span><p>Loading goals…</p></div>';

  try {
    const res = await fetch("/api/goals", { headers: authHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      goalsListContent.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "dashboard-empty";
      const p = document.createElement("p");
      p.textContent = (err && err.error) ? err.error : "Failed to load goals.";
      empty.appendChild(p);
      goalsListContent.appendChild(empty);
      return;
    }
    const data = await res.json();
    const goals = Array.isArray(data.goals) ? data.goals : [];

    goalsListContent.innerHTML = "";
    if (goals.length === 0) {
      const empty = document.createElement("div");
      empty.className = "dashboard-empty";
      empty.innerHTML = '<span class="dashboard-empty-icon">🎯</span><p>No goals yet. Use the chat to define planning goals with Copilot.</p>';
      goalsListContent.appendChild(empty);
      return;
    }

    // Sort goals by createdAt descending (newest first)
    goals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Fetch counts for all goals in parallel
    const countResults = await Promise.all(goals.map((g) => fetchGoalCounts(g.id)));

    const list = document.createElement("div");
    list.className = "goal-list";
    goals.forEach((goal, i) => {
      const counts = countResults[i];
      const item = document.createElement("div");
      item.className = "goal-list-item";
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");

      const title = document.createElement("div");
      title.className = "goal-list-item-title";
      title.textContent = typeof goal.goal === "string" ? goal.goal : "(untitled goal)";
      const titleId = `goal-list-item-title-${goal.id ?? i}`;
      title.id = titleId;
      item.setAttribute("aria-labelledby", titleId);

      const intent = document.createElement("div");
      intent.className = "goal-list-item-intent";
      intent.textContent = typeof goal.intent === "string" ? goal.intent : "";

      const countsEl = document.createElement("div");
      countsEl.className = "goal-list-item-counts";
      [
        { icon: "🔬", label: "research", count: counts.research },
        { icon: "🏁", label: "milestones", count: counts.milestones },
        { icon: "📋", label: "issues", count: counts.issues },
      ].forEach(({ icon, label, count }) => {
        const span = document.createElement("span");
        span.className = "goal-list-item-count";
        span.textContent = `${icon} ${count} ${label}`;
        countsEl.appendChild(span);
      });

      item.appendChild(title);
      item.appendChild(intent);
      item.appendChild(countsEl);

      item.addEventListener("click", () => showGoalDetail(goal.id));
      item.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showGoalDetail(goal.id); }
      });

      list.appendChild(item);
    });

    goalsListContent.appendChild(list);
  } catch (err) {
    console.warn("Failed to load goals:", err);
    goalsListContent.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "dashboard-empty";
    const p = document.createElement("p");
    p.textContent = "Failed to load goals. Please try again.";
    empty.appendChild(p);
    goalsListContent.appendChild(empty);
  } finally {
    goalsLoadInFlight = false;
  }
}

/**
 * Fetches research, milestone, and issue counts for a goal.
 * Returns { research, milestones, issues } with safe numeric fallbacks.
 * @param {string} goalId
 */
async function fetchGoalCounts(goalId) {
  try {
    const [researchRes, milestonesRes] = await Promise.all([
      fetch(`/api/goals/${encodeURIComponent(goalId)}/research`, { headers: authHeaders() }),
      fetch(`/api/goals/${encodeURIComponent(goalId)}/milestones`, { headers: authHeaders() }),
    ]);
    const researchData = researchRes.ok ? await researchRes.json() : {};
    const milestonesData = milestonesRes.ok ? await milestonesRes.json() : {};
    const milestones = Array.isArray(milestonesData.milestones) ? milestonesData.milestones : [];

    // Fetch issue counts for each milestone with limited concurrency to avoid large request bursts
    const ISSUE_FETCH_CONCURRENCY = 5;
    const issueCounts = [];
    for (let i = 0; i < milestones.length; i += ISSUE_FETCH_CONCURRENCY) {
      const batch = milestones.slice(i, i + ISSUE_FETCH_CONCURRENCY);
      const batchCounts = await Promise.all(
        batch.map((m) =>
          fetch(`/api/milestones/${encodeURIComponent(m.id)}/issues`, { headers: authHeaders() })
            .then((r) => (r.ok ? r.json() : {}))
            .then((d) => (Array.isArray(d.issues) ? d.issues.length : 0))
            .catch(() => 0)
        )
      );
      issueCounts.push(...batchCounts);
    }
    const totalIssues = issueCounts.reduce((sum, n) => sum + n, 0);

    return {
      research: Array.isArray(researchData.research) ? researchData.research.length : 0,
      milestones: milestones.length,
      issues: totalIssues,
    };
  } catch {
    return { research: 0, milestones: 0, issues: 0 };
  }
}

/** Shows the goal list panel and hides the detail panel. */
function showGoalsList() {
  goalsListView.classList.remove("hidden");
  goalsDetailView.classList.add("hidden");
}

/**
 * Fetches a goal by ID and renders the detail view.
 * All user-supplied content is inserted via textContent to prevent XSS.
 * @param {string} goalId
 */
async function showGoalDetail(goalId) {
  goalsListView.classList.add("hidden");
  goalsDetailView.classList.remove("hidden");
  goalsDetailView.innerHTML = '<div class="dashboard-empty"><span class="spinner" aria-label="Loading"></span><p>Loading goal…</p></div>';

  try {
    const [goalRes, countsResult] = await Promise.all([
      fetch(`/api/goals/${encodeURIComponent(goalId)}`, { headers: authHeaders() }),
      fetchGoalCounts(goalId),
    ]);

    if (!goalRes.ok) {
      goalsDetailView.innerHTML = "";
      const err = await goalRes.json().catch(() => ({}));
      const errDiv = document.createElement("div");
      errDiv.className = "dashboard-empty";
      const p = document.createElement("p");
      p.textContent = (err && err.error) ? err.error : "Goal not found.";
      errDiv.appendChild(p);
      goalsDetailView.appendChild(errDiv);
      return;
    }

    const goal = await goalRes.json();

    goalsDetailView.innerHTML = "";

    // Back button
    const back = document.createElement("button");
    back.className = "goal-detail-back";
    back.textContent = "← All Goals";
    back.addEventListener("click", loadGoalsDashboard);
    goalsDetailView.appendChild(back);

    // Title
    const title = document.createElement("div");
    title.className = "goal-detail-title";
    title.textContent = typeof goal.goal === "string" ? goal.goal : "(untitled goal)";
    goalsDetailView.appendChild(title);

    // Intent
    if (goal.intent) {
      const intent = document.createElement("div");
      intent.className = "goal-detail-intent";
      intent.textContent = goal.intent;
      goalsDetailView.appendChild(intent);
    }

    // Counts badges
    const countsBadges = document.createElement("div");
    countsBadges.className = "goal-detail-counts";
    [
      { icon: "🔬", label: "Research", count: countsResult.research },
      { icon: "🏁", label: "Milestones", count: countsResult.milestones },
      { icon: "📋", label: "Issues", count: countsResult.issues },
    ].forEach(({ icon, label, count }) => {
      const badge = document.createElement("div");
      badge.className = "goal-detail-count-badge";
      const num = document.createElement("span");
      num.className = "count-number";
      num.textContent = String(count);
      const lbl = document.createElement("span");
      lbl.textContent = `${icon} ${label}`;
      badge.appendChild(num);
      badge.appendChild(lbl);
      countsBadges.appendChild(badge);
    });
    goalsDetailView.appendChild(countsBadges);

    // Text field helper
    function addDetailField(label, value) {
      if (!value) return;
      const section = document.createElement("div");
      section.className = "goal-detail-section";
      const lbl = document.createElement("div");
      lbl.className = "goal-detail-section-label";
      lbl.textContent = label;
      const val = document.createElement("div");
      val.className = "goal-detail-section-value";
      val.textContent = value;
      section.appendChild(lbl);
      section.appendChild(val);
      goalsDetailView.appendChild(section);
    }

    // List field helper
    function addDetailList(label, items) {
      if (!Array.isArray(items) || items.length === 0) return;
      const section = document.createElement("div");
      section.className = "goal-detail-section";
      const lbl = document.createElement("div");
      lbl.className = "goal-detail-section-label";
      lbl.textContent = label;
      const list = document.createElement("ul");
      list.className = "goal-detail-list";
      items.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = typeof item === "string" ? item : "";
        list.appendChild(li);
      });
      section.appendChild(lbl);
      section.appendChild(list);
      goalsDetailView.appendChild(section);
    }

    addDetailField("Problem Statement", goal.problemStatement);
    addDetailField("Business Value", goal.businessValue);
    addDetailField("Target Outcome", goal.targetOutcome);
    addDetailList("Success Criteria", goal.successCriteria);
    addDetailList("Assumptions", goal.assumptions);
    addDetailList("Constraints", goal.constraints);
    addDetailList("Risks", goal.risks);

    // Metadata
    const meta = document.createElement("div");
    meta.className = "goal-detail-meta";
    const created = goal.createdAt ? new Date(goal.createdAt).toLocaleString() : "";
    const updated = goal.updatedAt ? new Date(goal.updatedAt).toLocaleString() : "";
    meta.textContent = `Created: ${created}${updated ? " · Updated: " + updated : ""}`;
    goalsDetailView.appendChild(meta);
  } catch (err) {
    console.warn("Failed to load goal detail:", err);
    goalsDetailView.innerHTML = "";
    const errDiv = document.createElement("div");
    errDiv.className = "dashboard-empty";
    const p = document.createElement("p");
    p.textContent = "Failed to load goal. Please try again.";
    errDiv.appendChild(p);
    goalsDetailView.appendChild(errDiv);
  }
}

// --- Research Dashboard ---

const researchGoalSelector = document.getElementById("research-goal-selector");
const researchGoalSelect = document.getElementById("research-goal-select");
const researchPageContent = document.getElementById("research-page-content");

/** In-flight guard: true while loadResearchDashboard() is fetching, to prevent duplicate calls. */
let researchLoadInFlight = false;

/**
 * Loads the list of goals and populates the goal selector, then loads research for the first goal.
 * De-dupes concurrent calls via in-flight guard.
 */
async function loadResearchDashboard() {
  if (researchLoadInFlight) return;
  researchLoadInFlight = true;

  if (!getToken()) {
    researchGoalSelector.style.display = "none";
    researchPageContent.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "dashboard-empty";
    empty.innerHTML = '<span class="dashboard-empty-icon">🔑</span><p>Save a GitHub token to view research items.</p>';
    researchPageContent.appendChild(empty);
    researchLoadInFlight = false;
    return;
  }

  researchGoalSelector.style.display = "none";
  researchPageContent.innerHTML = '<div class="dashboard-empty"><span class="spinner" aria-label="Loading"></span><p>Loading…</p></div>';

  try {
    const res = await fetch("/api/goals", { headers: authHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      researchPageContent.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "dashboard-empty";
      const p = document.createElement("p");
      p.textContent = (err && err.error) ? err.error : "Failed to load goals.";
      empty.appendChild(p);
      researchPageContent.appendChild(empty);
      return;
    }
    const data = await res.json();
    const goals = Array.isArray(data.goals) ? data.goals : [];

    if (goals.length === 0) {
      researchGoalSelector.style.display = "none";
      researchPageContent.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "dashboard-empty";
      empty.innerHTML = '<span class="dashboard-empty-icon">🔬</span><p>No goals yet. Use the chat to define planning goals with Copilot.</p>';
      researchPageContent.appendChild(empty);
      return;
    }

    // Sort goals newest first
    goals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Populate goal selector
    researchGoalSelect.innerHTML = "";
    for (const goal of goals) {
      const opt = document.createElement("option");
      opt.value = typeof goal.id === "string" ? goal.id : "";
      opt.textContent = typeof goal.goal === "string" ? goal.goal : "(untitled goal)";
      researchGoalSelect.appendChild(opt);
    }

    if (goals.length > 1) {
      researchGoalSelector.style.display = "block";
    } else {
      researchGoalSelector.style.display = "none";
    }

    // Load research for the first goal
    await loadResearchForGoal(goals[0].id);
  } catch (err) {
    console.warn("Failed to load research dashboard:", err);
    researchPageContent.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "dashboard-empty";
    const p = document.createElement("p");
    p.textContent = "Failed to load research. Please try again.";
    empty.appendChild(p);
    researchPageContent.appendChild(empty);
  } finally {
    researchLoadInFlight = false;
  }
}

/**
 * Fetches research items for a specific goal and renders them in the research tracker.
 * @param {string} goalId
 */
async function loadResearchForGoal(goalId) {
  researchPageContent.innerHTML = '<div class="dashboard-empty"><span class="spinner" aria-label="Loading"></span><p>Loading research…</p></div>';

  try {
    const res = await fetch(`/api/goals/${encodeURIComponent(goalId)}/research`, { headers: authHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      researchPageContent.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "dashboard-empty";
      const p = document.createElement("p");
      p.textContent = (err && err.error) ? err.error : "Failed to load research items.";
      empty.appendChild(p);
      researchPageContent.appendChild(empty);
      return;
    }
    const data = await res.json();
    const items = Array.isArray(data.research) ? data.research : [];
    renderResearchItems(items, goalId);
  } catch (err) {
    console.warn("Failed to load research for goal:", err);
    researchPageContent.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "dashboard-empty";
    const p = document.createElement("p");
    p.textContent = "Failed to load research items. Please try again.";
    empty.appendChild(p);
    researchPageContent.appendChild(empty);
  }
}

/**
 * Renders research items grouped by category in the research tracker dashboard.
 * All user-supplied content is inserted via textContent to prevent XSS.
 * @param {Array} items - Array of ResearchItem objects
 * @param {string} goalId - The goal ID these items belong to
 */
function renderResearchItems(items, goalId) {
  researchPageContent.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "dashboard-empty";
    empty.innerHTML = '<span class="dashboard-empty-icon">🔬</span><p>No research items for this goal yet.</p>';
    researchPageContent.appendChild(empty);
    return;
  }

  // Group items by category using the defined order
  /** @type {Map<string, Array>} */
  const grouped = new Map();
  for (const item of items) {
    const cat = typeof item.category === "string" ? item.category : "domain";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat).push(item);
  }
  const orderedKeys = [
    ...RESEARCH_CATEGORY_ORDER.filter((c) => grouped.has(c)),
    ...Array.from(grouped.keys()).filter((c) => !RESEARCH_CATEGORY_ORDER.includes(c)),
  ];

  for (const category of orderedKeys) {
    const categoryItems = grouped.get(category);
    const catEl = document.createElement("div");
    catEl.className = "research-tracker-category";

    const catHeader = document.createElement("div");
    catHeader.className = "research-tracker-category-header";
    catHeader.textContent = CATEGORY_LABELS[category] || category;
    catEl.appendChild(catHeader);

    for (const item of categoryItems) {
      catEl.appendChild(buildResearchTrackerItem(item, goalId));
    }

    researchPageContent.appendChild(catEl);
  }

  // Summary
  const total = items.length;
  const resolved = items.filter((i) => i.status === "resolved").length;
  const researching = items.filter((i) => i.status === "researching").length;
  const open = total - resolved - researching;
  const summaryParts = [];
  if (open > 0) summaryParts.push(`Open: ${open}`);
  if (researching > 0) summaryParts.push(`Researching: ${researching}`);
  if (resolved > 0) summaryParts.push(`Resolved: ${resolved}`);
  const summaryEl = document.createElement("div");
  summaryEl.className = "research-tracker-summary";
  summaryEl.textContent = summaryParts.join(" · ");
  researchPageContent.appendChild(summaryEl);
}

/**
 * Builds a single research tracker item DOM element with status badge, question, findings, and edit UI.
 * All user-supplied content is inserted via textContent to prevent XSS.
 * @param {Object} item - ResearchItem object
 * @param {string} goalId - The goal ID the item belongs to
 * @returns {HTMLElement}
 */
function buildResearchTrackerItem(item, goalId) {
  const itemEl = document.createElement("div");
  itemEl.className = "research-tracker-item";
  itemEl.setAttribute("data-item-id", typeof item.id === "string" ? item.id : "");

  // Header row: status badge + question + edit button
  const headerEl = document.createElement("div");
  headerEl.className = "research-tracker-item-header";

  const status = VALID_STATUSES.includes(item.status) ? item.status : "open";
  const statusEl = document.createElement("span");
  statusEl.className = "research-item-status status-" + status;
  statusEl.textContent = status;
  headerEl.appendChild(statusEl);

  const questionEl = document.createElement("span");
  questionEl.className = "research-tracker-question";
  questionEl.textContent = typeof item.question === "string" ? item.question : "";
  headerEl.appendChild(questionEl);

  const editBtn = document.createElement("button");
  editBtn.className = "research-tracker-edit-btn";
  editBtn.textContent = "Edit";
  editBtn.setAttribute("aria-label", "Edit findings");
  headerEl.appendChild(editBtn);

  itemEl.appendChild(headerEl);

  // Findings display
  const findingsDisplay = document.createElement("div");
  const hasFinding = typeof item.findings === "string" && item.findings.trim().length > 0;
  if (hasFinding) {
    const findingsLabel = document.createElement("div");
    findingsLabel.className = "research-tracker-findings-label";
    findingsLabel.textContent = "Findings";
    const findingsText = document.createElement("div");
    findingsText.className = "research-tracker-findings";
    findingsText.textContent = item.findings;
    findingsDisplay.appendChild(findingsLabel);
    findingsDisplay.appendChild(findingsText);
  }
  itemEl.appendChild(findingsDisplay);

  // Edit area (hidden by default)
  const editArea = document.createElement("div");
  editArea.className = "research-tracker-edit-area";
  editArea.style.display = "none";

  const textarea = document.createElement("textarea");
  textarea.className = "research-tracker-textarea";
  textarea.placeholder = "Enter findings…";
  textarea.setAttribute("aria-label", "Findings");
  textarea.value = typeof item.findings === "string" ? item.findings : "";
  editArea.appendChild(textarea);

  const actionsEl = document.createElement("div");
  actionsEl.className = "research-tracker-edit-actions";

  const saveBtn = document.createElement("button");
  saveBtn.className = "research-tracker-save-btn";
  saveBtn.textContent = "Save";
  actionsEl.appendChild(saveBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "research-tracker-cancel-btn";
  cancelBtn.textContent = "Cancel";
  actionsEl.appendChild(cancelBtn);

  editArea.appendChild(actionsEl);
  itemEl.appendChild(editArea);

  // Edit button opens the edit area
  editBtn.addEventListener("click", () => {
    textarea.value = typeof item.findings === "string" ? item.findings : "";
    findingsDisplay.style.display = "none";
    editArea.style.display = "flex";
    editBtn.style.display = "none";
    textarea.focus();
  });

  // Cancel restores the findings display
  cancelBtn.addEventListener("click", () => {
    editArea.style.display = "none";
    findingsDisplay.style.display = "";
    editBtn.style.display = "";
  });

  // Save sends PATCH request and updates the UI
  saveBtn.addEventListener("click", async () => {
    const newFindings = textarea.value;
    if (newFindings.length > 2000) {
      alert("Findings must be at most 2000 characters.");
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";
    try {
      const res = await fetch(
        `/api/goals/${encodeURIComponent(goalId)}/research/${encodeURIComponent(item.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ findings: newFindings }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert((err && err.error) ? err.error : "Failed to save findings.");
        return;
      }
      const updated = await res.json();
      // Update local item state and refresh display
      item.findings = typeof updated.findings === "string" ? updated.findings : newFindings;
      findingsDisplay.innerHTML = "";
      if (item.findings.trim().length > 0) {
        const lbl = document.createElement("div");
        lbl.className = "research-tracker-findings-label";
        lbl.textContent = "Findings";
        const txt = document.createElement("div");
        txt.className = "research-tracker-findings";
        txt.textContent = item.findings;
        findingsDisplay.appendChild(lbl);
        findingsDisplay.appendChild(txt);
      }
      editArea.style.display = "none";
      findingsDisplay.style.display = "";
      editBtn.style.display = "";
    } catch (err) {
      console.warn("Failed to save findings:", err);
      alert("Failed to save findings. Please try again.");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save";
    }
  });

  return itemEl;
}

// --- Milestone Dashboard ---

const milestoneGoalSelector = document.getElementById("milestone-goal-selector");
const milestoneGoalSelect = document.getElementById("milestone-goal-select");
const milestonePageContent = document.getElementById("milestone-page-content");

/** In-flight guard: true while loadMilestonesDashboard() is fetching, to prevent duplicate calls. */
let milestonesLoadInFlight = false;

/**
 * Loads the list of goals and populates the goal selector, then loads milestones for the first goal.
 * De-dupes concurrent calls via in-flight guard.
 */
async function loadMilestonesDashboard() {
  if (milestonesLoadInFlight) return;
  milestonesLoadInFlight = true;

  if (!getToken()) {
    milestoneGoalSelector.style.display = "none";
    milestonePageContent.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "dashboard-empty";
    empty.innerHTML = '<span class="dashboard-empty-icon">🔑</span><p>Save a GitHub token to view milestones.</p>';
    milestonePageContent.appendChild(empty);
    milestonesLoadInFlight = false;
    return;
  }

  milestoneGoalSelector.style.display = "none";
  milestonePageContent.innerHTML = '<div class="dashboard-empty"><span class="spinner" aria-label="Loading"></span><p>Loading…</p></div>';

  try {
    const res = await fetch("/api/goals", { headers: authHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      milestonePageContent.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "dashboard-empty";
      const p = document.createElement("p");
      p.textContent = (err && err.error) ? err.error : "Failed to load goals.";
      empty.appendChild(p);
      milestonePageContent.appendChild(empty);
      return;
    }
    const data = await res.json();
    const goals = Array.isArray(data.goals) ? data.goals : [];

    if (goals.length === 0) {
      milestoneGoalSelector.style.display = "none";
      milestonePageContent.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "dashboard-empty";
      empty.innerHTML = '<span class="dashboard-empty-icon">🏁</span><p>No goals yet. Use the chat to define planning goals with Copilot.</p>';
      milestonePageContent.appendChild(empty);
      return;
    }

    // Sort goals newest first
    goals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Populate goal selector
    milestoneGoalSelect.innerHTML = "";
    for (const goal of goals) {
      const opt = document.createElement("option");
      opt.value = typeof goal.id === "string" ? goal.id : "";
      opt.textContent = typeof goal.goal === "string" ? goal.goal : "(untitled goal)";
      milestoneGoalSelect.appendChild(opt);
    }

    if (goals.length > 1) {
      milestoneGoalSelector.style.display = "block";
    } else {
      milestoneGoalSelector.style.display = "none";
    }

    // Load milestones for the first goal
    await loadMilestonesForGoal(goals[0].id);
  } catch (err) {
    console.warn("Failed to load milestones dashboard:", err);
    milestonePageContent.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "dashboard-empty";
    const p = document.createElement("p");
    p.textContent = "Failed to load milestones. Please try again.";
    empty.appendChild(p);
    milestonePageContent.appendChild(empty);
  } finally {
    milestonesLoadInFlight = false;
  }
}

/**
 * Fetches milestones for a specific goal and renders them in the milestone timeline.
 * Also fetches issue counts per milestone.
 * @param {string} goalId
 */
async function loadMilestonesForGoal(goalId) {
  milestonePageContent.innerHTML = '<div class="dashboard-empty"><span class="spinner" aria-label="Loading"></span><p>Loading milestones…</p></div>';

  try {
    const res = await fetch(`/api/goals/${encodeURIComponent(goalId)}/milestones`, { headers: authHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      milestonePageContent.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "dashboard-empty";
      const p = document.createElement("p");
      p.textContent = (err && err.error) ? err.error : "Failed to load milestones.";
      empty.appendChild(p);
      milestonePageContent.appendChild(empty);
      return;
    }
    const data = await res.json();
    const milestones = Array.isArray(data.milestones) ? data.milestones : [];

    // Fetch issue counts for each milestone with limited concurrency to avoid large request bursts
    const MILESTONE_ISSUE_FETCH_CONCURRENCY = 5;
    /** @type {Map<string, number>} */
    const issueCounts = new Map();
    for (let i = 0; i < milestones.length; i += MILESTONE_ISSUE_FETCH_CONCURRENCY) {
      const batch = milestones.slice(i, i + MILESTONE_ISSUE_FETCH_CONCURRENCY);
      await Promise.all(
        batch.map(async (ms) => {
          try {
            const issueRes = await fetch(`/api/milestones/${encodeURIComponent(ms.id)}/issues`, { headers: authHeaders() });
            const count = issueRes.ok
              ? await issueRes.json().then((d) => (Array.isArray(d.issues) ? d.issues.length : 0)).catch(() => 0)
              : 0;
            issueCounts.set(ms.id, count);
          } catch {
            issueCounts.set(ms.id, 0);
          }
        })
      );
    }

    renderMilestoneDashboardItems(milestones, issueCounts);
  } catch (err) {
    console.warn("Failed to load milestones for goal:", err);
    milestonePageContent.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "dashboard-empty";
    const p = document.createElement("p");
    p.textContent = "Failed to load milestones. Please try again.";
    empty.appendChild(p);
    milestonePageContent.appendChild(empty);
  }
}

/**
 * Renders milestones in the milestone timeline dashboard.
 * Milestones are shown in order with status, dependencies, and issue counts.
 * All user-supplied content is inserted via textContent to prevent XSS.
 * @param {Array} milestones - Array of Milestone objects
 * @param {Map<string, number>} issueCounts - Map of milestone ID to issue count
 */
function renderMilestoneDashboardItems(milestones, issueCounts) {
  milestonePageContent.innerHTML = "";

  if (milestones.length === 0) {
    const empty = document.createElement("div");
    empty.className = "dashboard-empty";
    empty.innerHTML = '<span class="dashboard-empty-icon">🏁</span><p>No milestones for this goal yet. Use the chat to create a milestone plan with Copilot.</p>';
    milestonePageContent.appendChild(empty);
    return;
  }

  // Sort by order ascending (defensive copy)
  const sorted = [...milestones].sort((a, b) => (a.order || 0) - (b.order || 0));

  // Build a map from milestone ID to order for dependency display
  /** @type {Map<string, number>} */
  const idToOrder = new Map();
  for (const ms of sorted) {
    if (ms.id) idToOrder.set(ms.id, ms.order);
  }

  for (const ms of sorted) {
    const itemEl = document.createElement("div");
    itemEl.className = "milestone-timeline-item";
    itemEl.setAttribute("data-milestone-id", typeof ms.id === "string" ? ms.id : "");

    // Header row: order number, name, status badge, issue count
    const headerEl = document.createElement("div");
    headerEl.className = "milestone-timeline-item-header";

    const orderEl = document.createElement("span");
    orderEl.className = "milestone-timeline-order";
    const displayOrder = typeof ms.order === "number" && isFinite(ms.order) ? ms.order : "?";
    orderEl.textContent = `#${displayOrder}`;
    headerEl.appendChild(orderEl);

    const nameEl = document.createElement("span");
    nameEl.className = "milestone-timeline-name";
    nameEl.textContent = typeof ms.name === "string" ? ms.name : "";
    headerEl.appendChild(nameEl);

    const rawStatus = ms.status || DEFAULT_MILESTONE_STATUS;
    const status = VALID_MILESTONE_STATUSES.includes(rawStatus) ? rawStatus : DEFAULT_MILESTONE_STATUS;
    const statusEl = document.createElement("span");
    statusEl.className = "milestone-timeline-status status-" + status;
    statusEl.textContent = status;
    headerEl.appendChild(statusEl);

    const issueCount = issueCounts instanceof Map ? (issueCounts.get(ms.id) ?? 0) : 0;
    const issueCountEl = document.createElement("span");
    issueCountEl.className = "milestone-timeline-issue-count";
    issueCountEl.textContent = `${issueCount} issue${issueCount !== 1 ? "s" : ""}`;
    headerEl.appendChild(issueCountEl);

    itemEl.appendChild(headerEl);

    // Goal/description line
    if (typeof ms.goal === "string" && ms.goal) {
      const goalEl = document.createElement("div");
      goalEl.className = "milestone-timeline-goal";
      goalEl.textContent = ms.goal;
      itemEl.appendChild(goalEl);
    }

    // Dependencies with visual arrows
    if (Array.isArray(ms.dependencies) && ms.dependencies.length > 0) {
      const depsEl = document.createElement("div");
      depsEl.className = "milestone-timeline-deps";

      const arrowEl = document.createElement("span");
      arrowEl.className = "milestone-timeline-deps-arrow";
      arrowEl.textContent = "↑";
      arrowEl.setAttribute("aria-hidden", "true");
      depsEl.appendChild(arrowEl);

      const labelEl = document.createElement("span");
      labelEl.className = "milestone-timeline-deps-label";
      labelEl.textContent = "Depends on:";
      depsEl.appendChild(labelEl);

      for (const depId of ms.dependencies) {
        const depOrder = idToOrder.get(depId);
        const tagEl = document.createElement("span");
        tagEl.className = "milestone-timeline-dep-tag";
        tagEl.textContent = depOrder !== undefined ? `#${depOrder}` : (typeof depId === "string" ? depId : "");
        depsEl.appendChild(tagEl);
      }

      itemEl.appendChild(depsEl);
    }

    milestonePageContent.appendChild(itemEl);
  }

  // Summary line (use normalized statuses so badges and counts agree)
  const statusCounts = { draft: 0, ready: 0, "in-progress": 0, complete: 0 };
  for (const m of sorted) {
    const rawS = m && typeof m.status === "string" ? m.status : "";
    const normalizedS = VALID_MILESTONE_STATUSES.includes(rawS) ? rawS : DEFAULT_MILESTONE_STATUS;
    if (normalizedS === "complete") statusCounts.complete++;
    else if (normalizedS === "in-progress") statusCounts["in-progress"]++;
    else if (normalizedS === "ready") statusCounts.ready++;
    else statusCounts.draft++;
  }
  const draft = statusCounts.draft;
  const ready = statusCounts.ready;
  const inProgress = statusCounts["in-progress"];
  const complete = statusCounts.complete;
  const summaryParts = [];
  if (draft > 0) summaryParts.push(`Draft: ${draft}`);
  if (ready > 0) summaryParts.push(`Ready: ${ready}`);
  if (inProgress > 0) summaryParts.push(`In Progress: ${inProgress}`);
  if (complete > 0) summaryParts.push(`Complete: ${complete}`);
  const summaryEl = document.createElement("div");
  summaryEl.className = "milestone-timeline-summary";
  summaryEl.textContent = summaryParts.join(" · ");
  milestonePageContent.appendChild(summaryEl);
}

// --- Issue Draft Dashboard ---

const issueGoalSelector = document.getElementById("issue-goal-selector");
const issueGoalSelect = document.getElementById("issue-goal-select");
const issueMilestoneSelector = document.getElementById("issue-milestone-selector");
const issueMilestoneSelect = document.getElementById("issue-milestone-select");
const issuePageContent = document.getElementById("issue-page-content");

/** In-flight guard: true while loadIssuesDashboard() is fetching, to prevent duplicate calls. */
let issuesLoadInFlight = false;

/**
 * Loads the list of goals and populates the goal selector, then loads milestones for the first goal.
 * De-dupes concurrent calls via in-flight guard.
 */
async function loadIssuesDashboard() {
  if (issuesLoadInFlight) return;
  issuesLoadInFlight = true;

  if (!getToken()) {
    issueGoalSelector.style.display = "none";
    issueMilestoneSelector.style.display = "none";
    pushToGithubBtn.style.display = "none";
    issuePageContent.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "dashboard-empty";
    empty.innerHTML = '<span class="dashboard-empty-icon">🔑</span><p>Save a GitHub token to view issue drafts.</p>';
    issuePageContent.appendChild(empty);
    issuesLoadInFlight = false;
    return;
  }

  issueGoalSelector.style.display = "none";
  issueMilestoneSelector.style.display = "none";
  pushToGithubBtn.style.display = "none";
  issuePageContent.innerHTML = '<div class="dashboard-empty"><span class="spinner" aria-label="Loading"></span><p>Loading…</p></div>';

  try {
    const res = await fetch("/api/goals", { headers: authHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      issuePageContent.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "dashboard-empty";
      const p = document.createElement("p");
      p.textContent = (err && err.error) ? err.error : "Failed to load goals.";
      empty.appendChild(p);
      issuePageContent.appendChild(empty);
      return;
    }
    const data = await res.json();
    const goals = Array.isArray(data.goals) ? data.goals : [];

    if (goals.length === 0) {
      issueGoalSelector.style.display = "none";
      issueMilestoneSelector.style.display = "none";
      pushToGithubBtn.style.display = "none";
      issuePageContent.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "dashboard-empty";
      empty.innerHTML = '<span class="dashboard-empty-icon">📋</span><p>No goals yet. Use the chat to define planning goals with Copilot.</p>';
      issuePageContent.appendChild(empty);
      return;
    }

    // Sort goals newest first
    goals.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Populate goal selector
    issueGoalSelect.innerHTML = "";
    for (const goal of goals) {
      const opt = document.createElement("option");
      opt.value = typeof goal.id === "string" ? goal.id : "";
      opt.textContent = typeof goal.goal === "string" ? goal.goal : "(untitled goal)";
      issueGoalSelect.appendChild(opt);
    }

    if (goals.length > 1) {
      issueGoalSelector.style.display = "block";
    } else {
      issueGoalSelector.style.display = "none";
    }

    // Show the push button when a goal is selected
    pushToGithubBtn.style.display = "inline-block";

    // Load milestones for the first goal
    await loadMilestonesForIssues(goals[0].id);
  } catch (err) {
    console.warn("Failed to load issues dashboard:", err);
    issuePageContent.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "dashboard-empty";
    const p = document.createElement("p");
    p.textContent = "Failed to load issue drafts. Please try again.";
    empty.appendChild(p);
    issuePageContent.appendChild(empty);
  } finally {
    issuesLoadInFlight = false;
  }
}

/**
 * Fetches milestones for a goal and populates the milestone selector, then loads issues for the first milestone.
 * @param {string} goalId
 */
async function loadMilestonesForIssues(goalId) {
  issueMilestoneSelector.style.display = "none";
  issuePageContent.innerHTML = '<div class="dashboard-empty"><span class="spinner" aria-label="Loading"></span><p>Loading milestones…</p></div>';

  try {
    const res = await fetch(`/api/goals/${encodeURIComponent(goalId)}/milestones`, { headers: authHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      issuePageContent.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "dashboard-empty";
      const p = document.createElement("p");
      p.textContent = (err && err.error) ? err.error : "Failed to load milestones.";
      empty.appendChild(p);
      issuePageContent.appendChild(empty);
      return;
    }
    const data = await res.json();
    const milestones = Array.isArray(data.milestones) ? data.milestones : [];

    if (milestones.length === 0) {
      issueMilestoneSelector.style.display = "none";
      issuePageContent.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "dashboard-empty";
      empty.innerHTML = '<span class="dashboard-empty-icon">🏁</span><p>No milestones for this goal yet. Use the chat to create a milestone plan with Copilot.</p>';
      issuePageContent.appendChild(empty);
      return;
    }

    // Sort milestones by order ascending
    milestones.sort((a, b) => (a.order || 0) - (b.order || 0));

    // Populate milestone selector
    issueMilestoneSelect.innerHTML = "";
    for (const ms of milestones) {
      const opt = document.createElement("option");
      opt.value = typeof ms.id === "string" ? ms.id : "";
      const label = typeof ms.name === "string" ? ms.name : "(untitled milestone)";
      const order = typeof ms.order === "number" ? `#${ms.order} ` : "";
      opt.textContent = `${order}${label}`;
      issueMilestoneSelect.appendChild(opt);
    }

    issueMilestoneSelector.style.display = "block";

    // Load issues for the first milestone
    await loadIssuesForMilestone(milestones[0].id);
  } catch (err) {
    console.warn("Failed to load milestones for issues:", err);
    issuePageContent.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "dashboard-empty";
    const p = document.createElement("p");
    p.textContent = "Failed to load milestones. Please try again.";
    empty.appendChild(p);
    issuePageContent.appendChild(empty);
  }
}

/**
 * Fetches issue drafts for a specific milestone and renders them.
 * @param {string} milestoneId
 */
async function loadIssuesForMilestone(milestoneId) {
  issuePageContent.innerHTML = '<div class="dashboard-empty"><span class="spinner" aria-label="Loading"></span><p>Loading issue drafts…</p></div>';

  try {
    const res = await fetch(`/api/milestones/${encodeURIComponent(milestoneId)}/issues`, { headers: authHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      issuePageContent.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "dashboard-empty";
      const p = document.createElement("p");
      p.textContent = (err && err.error) ? err.error : "Failed to load issue drafts.";
      empty.appendChild(p);
      issuePageContent.appendChild(empty);
      return;
    }
    const data = await res.json();
    const issues = Array.isArray(data.issues) ? data.issues : [];
    renderIssueDraftItems(issues, milestoneId);
  } catch (err) {
    console.warn("Failed to load issues for milestone:", err);
    issuePageContent.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "dashboard-empty";
    const p = document.createElement("p");
    p.textContent = "Failed to load issue drafts. Please try again.";
    empty.appendChild(p);
    issuePageContent.appendChild(empty);
  }
}

/**
 * Normalizes an issue draft status value to a valid status string.
 * Returns the input if valid, otherwise returns the default status.
 * @param {string|undefined} status - Raw status value from the draft
 * @returns {string} - One of "draft", "ready", or "created"
 */
function normalizeIssueDraftStatus(status) {
  return typeof status === "string" && VALID_ISSUE_DRAFT_STATUSES.includes(status) ? status : DEFAULT_ISSUE_DRAFT_STATUS;
}

/**
 * Renders issue drafts in the issue draft dashboard.
 * All user-supplied content is inserted via textContent to prevent XSS.
 * @param {Array} issues - Array of IssueDraft objects
 * @param {string} milestoneId - The milestone ID these drafts belong to
 */
function renderIssueDraftItems(issues, milestoneId) {
  issuePageContent.innerHTML = "";

  if (issues.length === 0) {
    const empty = document.createElement("div");
    empty.className = "dashboard-empty";
    empty.innerHTML = '<span class="dashboard-empty-icon">📋</span><p>No issue drafts for this milestone yet. Use the chat to generate issue drafts with Copilot.</p>';
    issuePageContent.appendChild(empty);
    return;
  }

  // Sort by order ascending (defensive copy)
  const sorted = [...issues].sort((a, b) => (a.order || 0) - (b.order || 0));

  // Build a map from issue ID to order for dependency display
  /** @type {Map<string, number>} */
  const idToOrder = new Map();
  for (const issue of sorted) {
    if (issue.id) idToOrder.set(issue.id, issue.order);
  }

  // Batch-approve bar
  const hasDraftOrReady = sorted.some((d) => d.status === "draft" || d.status === "ready");
  if (hasDraftOrReady) {
    const batchBar = document.createElement("div");
    batchBar.className = "issue-draft-batch-bar";

    const batchApproveBtn = document.createElement("button");
    batchApproveBtn.className = "issue-draft-batch-approve-btn";
    batchApproveBtn.textContent = "Approve All";
    batchBar.appendChild(batchApproveBtn);

    const batchSummary = document.createElement("span");
    batchSummary.className = "issue-draft-batch-summary";
    const draftCount = sorted.filter((d) => d.status === "draft").length;
    const readyCount = sorted.filter((d) => d.status === "ready").length;
    const parts = [];
    if (draftCount > 0) parts.push(`${draftCount} draft`);
    if (readyCount > 0) parts.push(`${readyCount} ready`);
    batchSummary.textContent = `Mark all as ready: ${parts.join(", ")}`;
    batchBar.appendChild(batchSummary);

    issuePageContent.appendChild(batchBar);

    batchApproveBtn.addEventListener("click", async () => {
      const toApprove = sorted.filter((d) => d.status === "draft" || d.status === "ready");
      if (toApprove.length === 0) return;
      batchApproveBtn.disabled = true;
      batchApproveBtn.textContent = "Approving…";

      const results = await Promise.allSettled(
        toApprove.map((draft) =>
          fetch(
            `/api/milestones/${encodeURIComponent(milestoneId)}/issues/${encodeURIComponent(draft.id)}`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json", ...authHeaders() },
              body: JSON.stringify({ status: "ready" }),
            }
          ).then(async (r) => {
            if (!r.ok) throw new Error(await r.json().then((e) => e.error || "Failed").catch(() => "Failed"));
            draft.status = "ready";
          })
        )
      );

      const failCount = results.filter((r) => r.status === "rejected").length;
      const successCount = results.filter((r) => r.status === "fulfilled").length;

      if (successCount > 0) {
        // Re-render with updated statuses
        renderIssueDraftItems(issues, milestoneId);
      } else {
        batchApproveBtn.disabled = false;
        batchApproveBtn.textContent = "Approve All";
      }
      if (failCount > 0) {
        alert(`${failCount} issue draft${failCount !== 1 ? "s" : ""} could not be approved. Please try again.`);
      }
    });
  }

  for (const draft of sorted) {
    issuePageContent.appendChild(buildIssueDraftItem(draft, milestoneId, idToOrder));
  }

  // Summary line
  const draftCount = sorted.filter((d) => normalizeIssueDraftStatus(d.status) === "draft").length;
  const readyCount = sorted.filter((d) => normalizeIssueDraftStatus(d.status) === "ready").length;
  const createdCount = sorted.filter((d) => normalizeIssueDraftStatus(d.status) === "created").length;
  const summaryParts = [];
  if (draftCount > 0) summaryParts.push(`Draft: ${draftCount}`);
  if (readyCount > 0) summaryParts.push(`Ready: ${readyCount}`);
  if (createdCount > 0) summaryParts.push(`Created: ${createdCount}`);
  const summaryEl = document.createElement("div");
  summaryEl.className = "issue-draft-summary";
  summaryEl.textContent = summaryParts.join(" · ");
  issuePageContent.appendChild(summaryEl);
}

/**
 * Returns an HTML string intended for insertion via `element.innerHTML`, with all
 * user-provided text content HTML-escaped to prevent XSS (no raw user text is inserted).
 * @param {Object} draft - IssueDraft object
 * @returns {string} - Escaped HTML string for the preview, safe for innerHTML
 */
function buildIssueDraftMarkdownPreview(draft) {
  /** Escape text for safe insertion into HTML. */
  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** Render a list of strings as an HTML unordered list. */
  function renderList(items) {
    if (!Array.isArray(items) || items.length === 0) return "<p><em>(none)</em></p>";
    return "<ul>" + items.map((item) => `<li>${esc(typeof item === "string" ? item : "")}</li>`).join("") + "</ul>";
  }

  /** Render a list of FileRef objects as a table. */
  function renderFileRefs(refs) {
    if (!Array.isArray(refs) || refs.length === 0) return "<p><em>(none)</em></p>";
    const rows = refs.map((r) => {
      const path = esc(typeof r.path === "string" ? r.path : "");
      const reason = esc(typeof r.reason === "string" ? r.reason : "");
      return `<tr><td><code>${path}</code></td><td>${reason}</td></tr>`;
    });
    return `<table><thead><tr><th>File</th><th>Reason</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
  }

  const sections = [];

  if (typeof draft.purpose === "string" && draft.purpose) {
    sections.push(`<h2>Purpose</h2><p>${esc(draft.purpose)}</p>`);
  }
  if (typeof draft.problem === "string" && draft.problem) {
    sections.push(`<h2>Problem</h2><p>${esc(draft.problem)}</p>`);
  }
  if (typeof draft.expectedOutcome === "string" && draft.expectedOutcome) {
    sections.push(`<h2>Expected Outcome</h2><p>${esc(draft.expectedOutcome)}</p>`);
  }
  if (typeof draft.scopeBoundaries === "string" && draft.scopeBoundaries) {
    sections.push(`<h2>Scope</h2><p>${esc(draft.scopeBoundaries)}</p>`);
  }
  if (typeof draft.technicalContext === "string" && draft.technicalContext) {
    sections.push(`<h2>Technical Context</h2><p>${esc(draft.technicalContext)}</p>`);
  }
  if (Array.isArray(draft.acceptanceCriteria) && draft.acceptanceCriteria.length > 0) {
    sections.push(`<h2>Acceptance Criteria</h2>${renderList(draft.acceptanceCriteria)}`);
  }
  if (typeof draft.testingExpectations === "string" && draft.testingExpectations) {
    sections.push(`<h2>Testing Expectations</h2><p>${esc(draft.testingExpectations)}</p>`);
  }
  if (Array.isArray(draft.filesToModify) && draft.filesToModify.length > 0) {
    sections.push(`<h2>Files to Modify</h2>${renderFileRefs(draft.filesToModify)}`);
  }
  if (Array.isArray(draft.filesToRead) && draft.filesToRead.length > 0) {
    sections.push(`<h2>Files to Read</h2>${renderFileRefs(draft.filesToRead)}`);
  }
  if (typeof draft.patternReference === "string" && draft.patternReference) {
    sections.push(`<h2>Pattern Reference</h2><p>${esc(draft.patternReference)}</p>`);
  }
  if (Array.isArray(draft.securityChecklist) && draft.securityChecklist.length > 0) {
    sections.push(`<h2>Security Checklist</h2>${renderList(draft.securityChecklist)}`);
  }
  if (Array.isArray(draft.verificationCommands) && draft.verificationCommands.length > 0) {
    sections.push(`<h2>Verification</h2>${renderList(draft.verificationCommands)}`);
  }

  return sections.join("\n");
}

/**
 * Builds a single editable issue draft DOM element.
 * All user-supplied content is inserted via textContent to prevent XSS (except preview which uses safe esc()).
 * @param {Object} draft - IssueDraft object
 * @param {string} milestoneId - The milestone ID this draft belongs to
 * @param {Map<string, number>} idToOrder - Map of issue ID to order number
 * @returns {HTMLElement}
 */
function buildIssueDraftItem(draft, milestoneId, idToOrder) {
  const itemEl = document.createElement("div");
  itemEl.className = "issue-draft-item";
  itemEl.setAttribute("data-issue-id", typeof draft.id === "string" ? draft.id : "");

  // Header row: order number, title, status badge, approve button, expand button
  const headerEl = document.createElement("div");
  headerEl.className = "issue-draft-item-header";
  headerEl.setAttribute("role", "button");
  headerEl.setAttribute("tabindex", "0");
  headerEl.setAttribute("aria-expanded", "false");

  const orderEl = document.createElement("span");
  orderEl.className = "issue-draft-order";
  const displayOrder = typeof draft.order === "number" && isFinite(draft.order) ? draft.order : "?";
  orderEl.textContent = `#${displayOrder}`;
  headerEl.appendChild(orderEl);

  const titleEl = document.createElement("span");
  titleEl.className = "issue-draft-title";
  titleEl.textContent = typeof draft.title === "string" ? draft.title : "";
  headerEl.appendChild(titleEl);

  const rawStatus = normalizeIssueDraftStatus(draft.status);
  const statusEl = document.createElement("span");
  statusEl.className = "issue-draft-status status-" + rawStatus;
  statusEl.textContent = rawStatus;
  headerEl.appendChild(statusEl);

  // Approve button (only for draft/ready statuses)
  if (rawStatus !== "created") {
    const approveBtn = document.createElement("button");
    approveBtn.className = "issue-draft-approve-btn";
    approveBtn.textContent = rawStatus === "ready" ? "✓ Ready" : "Approve";
    approveBtn.setAttribute("aria-label", `Approve issue #${displayOrder}`);
    approveBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (approveBtn.disabled) return;
      approveBtn.disabled = true;
      approveBtn.textContent = "Saving…";
      try {
        const res = await fetch(
          `/api/milestones/${encodeURIComponent(milestoneId)}/issues/${encodeURIComponent(draft.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ status: "ready" }),
          }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert((err && err.error) ? err.error : "Failed to approve issue draft.");
          approveBtn.disabled = false;
          approveBtn.textContent = draft.status === "ready" ? "✓ Ready" : "Approve";
          return;
        }
        draft.status = "ready";
        statusEl.className = "issue-draft-status status-ready";
        statusEl.textContent = "ready";
        approveBtn.textContent = "✓ Ready";
        approveBtn.disabled = false;
      } catch (err) {
        console.warn("Failed to approve issue draft:", err);
        alert("Failed to approve issue draft. Please try again.");
        approveBtn.disabled = false;
        approveBtn.textContent = draft.status === "ready" ? "✓ Ready" : "Approve";
      }
    });
    headerEl.appendChild(approveBtn);
  }

  const expandBtn = document.createElement("button");
  expandBtn.className = "issue-draft-expand-btn";
  expandBtn.textContent = "▼ Expand";
  expandBtn.setAttribute("aria-label", `Expand issue #${displayOrder}`);
  headerEl.appendChild(expandBtn);

  itemEl.appendChild(headerEl);

  // Body (expandable)
  const bodyEl = document.createElement("div");
  bodyEl.className = "issue-draft-body";

  // Helper to build an editable text field
  function buildEditableField(label, fieldKey, currentValue, maxLen) {
    const fieldEl = document.createElement("div");
    fieldEl.className = "issue-draft-field";

    const labelRow = document.createElement("div");
    labelRow.style.display = "flex";
    labelRow.style.alignItems = "center";

    const labelEl = document.createElement("div");
    labelEl.className = "issue-draft-field-label";
    labelEl.textContent = label;
    labelRow.appendChild(labelEl);

    const editBtn = document.createElement("button");
    editBtn.className = "issue-draft-field-edit-btn";
    editBtn.textContent = "Edit";
    editBtn.setAttribute("aria-label", `Edit ${label}`);
    labelRow.appendChild(editBtn);

    fieldEl.appendChild(labelRow);

    const valueEl = document.createElement("div");
    valueEl.className = "issue-draft-field-value";
    valueEl.textContent = typeof currentValue === "string" ? currentValue : "";
    fieldEl.appendChild(valueEl);

    const editArea = document.createElement("div");
    editArea.className = "issue-draft-field-edit-area";

    const textarea = document.createElement("textarea");
    textarea.className = "issue-draft-field-textarea";
    textarea.value = typeof currentValue === "string" ? currentValue : "";
    textarea.setAttribute("aria-label", label);
    editArea.appendChild(textarea);

    const actionsEl = document.createElement("div");
    actionsEl.className = "issue-draft-field-actions";

    const saveBtn = document.createElement("button");
    saveBtn.className = "issue-draft-field-save-btn";
    saveBtn.textContent = "Save";
    actionsEl.appendChild(saveBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "issue-draft-field-cancel-btn";
    cancelBtn.textContent = "Cancel";
    actionsEl.appendChild(cancelBtn);

    editArea.appendChild(actionsEl);
    fieldEl.appendChild(editArea);

    editBtn.addEventListener("click", () => {
      textarea.value = typeof draft[fieldKey] === "string" ? draft[fieldKey] : "";
      valueEl.style.display = "none";
      editArea.classList.add("editing");
      editBtn.style.display = "none";
      textarea.focus();
    });

    cancelBtn.addEventListener("click", () => {
      editArea.classList.remove("editing");
      valueEl.style.display = "";
      editBtn.style.display = "";
    });

    saveBtn.addEventListener("click", async () => {
      const newValue = textarea.value;
      if (newValue.length > maxLen) {
        alert(`${label} must be at most ${maxLen} characters.`);
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";
      try {
        const res = await fetch(
          `/api/milestones/${encodeURIComponent(milestoneId)}/issues/${encodeURIComponent(draft.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ [fieldKey]: newValue }),
          }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert((err && err.error) ? err.error : `Failed to save ${label}.`);
          return;
        }
        const updated = await res.json();
        draft[fieldKey] = typeof updated[fieldKey] === "string" ? updated[fieldKey] : newValue;
        valueEl.textContent = draft[fieldKey];
        editArea.classList.remove("editing");
        valueEl.style.display = "";
        editBtn.style.display = "";
        // Refresh preview if open
        if (previewEl.style.display !== "none") {
          previewEl.innerHTML = buildIssueDraftMarkdownPreview(draft);
        }
      } catch (err) {
        console.warn(`Failed to save ${label}:`, err);
        alert(`Failed to save ${label}. Please try again.`);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save";
      }
    });

    return fieldEl;
  }

  // Helper to render a view-only list field (array of strings).
  // Complex array fields (acceptanceCriteria, securityChecklist, verificationCommands,
  // researchLinks, dependencies) are displayed as read-only; inline editing of these
  // fields is out of scope for the initial issue draft manager.
  function buildListField(label, items) {
    const fieldEl = document.createElement("div");
    fieldEl.className = "issue-draft-field";

    const labelEl = document.createElement("div");
    labelEl.className = "issue-draft-field-label";
    labelEl.textContent = label;
    fieldEl.appendChild(labelEl);

    if (!Array.isArray(items) || items.length === 0) {
      const emptyEl = document.createElement("div");
      emptyEl.className = "issue-draft-field-value";
      emptyEl.style.color = "var(--color-text-muted)";
      emptyEl.textContent = "(none)";
      fieldEl.appendChild(emptyEl);
    } else {
      const listEl = document.createElement("ul");
      listEl.style.margin = "0";
      listEl.style.paddingLeft = "18px";
      for (const item of items) {
        const li = document.createElement("li");
        li.className = "issue-draft-field-value";
        li.textContent = typeof item === "string" ? item : "";
        listEl.appendChild(li);
      }
      fieldEl.appendChild(listEl);
    }

    return fieldEl;
  }

  // Helper to render a view-only FileRef list (filesToModify, filesToRead).
  // FileRef array editing is out of scope for the initial issue draft manager.
  function buildFileRefField(label, refs) {
    const fieldEl = document.createElement("div");
    fieldEl.className = "issue-draft-field";

    const labelEl = document.createElement("div");
    labelEl.className = "issue-draft-field-label";
    labelEl.textContent = label;
    fieldEl.appendChild(labelEl);

    if (!Array.isArray(refs) || refs.length === 0) {
      const emptyEl = document.createElement("div");
      emptyEl.className = "issue-draft-field-value";
      emptyEl.style.color = "var(--color-text-muted)";
      emptyEl.textContent = "(none)";
      fieldEl.appendChild(emptyEl);
    } else {
      for (const ref of refs) {
        const refEl = document.createElement("div");
        refEl.className = "issue-draft-field-value";
        refEl.style.marginBottom = "4px";
        const pathEl = document.createElement("code");
        pathEl.style.marginRight = "8px";
        pathEl.textContent = typeof ref.path === "string" ? ref.path : "";
        refEl.appendChild(pathEl);
        const reasonEl = document.createTextNode(typeof ref.reason === "string" ? `— ${ref.reason}` : "");
        refEl.appendChild(reasonEl);
        fieldEl.appendChild(refEl);
      }
    }

    return fieldEl;
  }

  // Helper to render dependency list using order numbers
  function buildDependencyField(deps) {
    const fieldEl = document.createElement("div");
    fieldEl.className = "issue-draft-field";

    const labelEl = document.createElement("div");
    labelEl.className = "issue-draft-field-label";
    labelEl.textContent = "Dependencies";
    fieldEl.appendChild(labelEl);

    if (!Array.isArray(deps) || deps.length === 0) {
      const emptyEl = document.createElement("div");
      emptyEl.className = "issue-draft-field-value";
      emptyEl.style.color = "var(--color-text-muted)";
      emptyEl.textContent = "(none)";
      fieldEl.appendChild(emptyEl);
    } else {
      const listEl = document.createElement("ul");
      listEl.style.margin = "0";
      listEl.style.paddingLeft = "18px";
      for (const depId of deps) {
        const depOrder = idToOrder.get(depId);
        const li = document.createElement("li");
        li.className = "issue-draft-field-value";
        li.textContent = depOrder !== undefined ? `#${depOrder}` : (typeof depId === "string" ? depId : "");
        listEl.appendChild(li);
      }
      fieldEl.appendChild(listEl);
    }

    return fieldEl;
  }

  // Editable text fields
  bodyEl.appendChild(buildEditableField("Title", "title", draft.title, 256));
  bodyEl.appendChild(buildEditableField("Purpose", "purpose", draft.purpose, 500));
  bodyEl.appendChild(buildEditableField("Problem", "problem", draft.problem, 1000));
  bodyEl.appendChild(buildEditableField("Expected Outcome", "expectedOutcome", draft.expectedOutcome, 500));
  bodyEl.appendChild(buildEditableField("Scope", "scopeBoundaries", draft.scopeBoundaries, 1000));
  bodyEl.appendChild(buildEditableField("Technical Context", "technicalContext", draft.technicalContext, 2000));
  bodyEl.appendChild(buildEditableField("Testing Expectations", "testingExpectations", draft.testingExpectations, 1000));

  // List fields
  bodyEl.appendChild(buildListField("Acceptance Criteria", draft.acceptanceCriteria));
  bodyEl.appendChild(buildListField("Security Checklist", draft.securityChecklist));
  bodyEl.appendChild(buildListField("Verification Commands", draft.verificationCommands));
  bodyEl.appendChild(buildDependencyField(draft.dependencies));
  bodyEl.appendChild(buildListField("Research Links", draft.researchLinks));

  // FileRef fields
  bodyEl.appendChild(buildFileRefField("Files to Modify", draft.filesToModify));
  bodyEl.appendChild(buildFileRefField("Files to Read", draft.filesToRead));

  if (typeof draft.patternReference === "string" && draft.patternReference) {
    bodyEl.appendChild(buildEditableField("Pattern Reference", "patternReference", draft.patternReference, 2000));
  }

  // Markdown preview toggle
  const previewToggleBtn = document.createElement("button");
  previewToggleBtn.className = "issue-draft-preview-toggle";
  previewToggleBtn.textContent = "▶ Show GitHub Preview";
  bodyEl.appendChild(previewToggleBtn);

  const previewEl = document.createElement("div");
  previewEl.className = "issue-draft-md-preview";
  previewEl.style.display = "none";
  bodyEl.appendChild(previewEl);

  previewToggleBtn.addEventListener("click", () => {
    if (previewEl.style.display === "none") {
      previewEl.innerHTML = buildIssueDraftMarkdownPreview(draft);
      previewEl.style.display = "block";
      previewToggleBtn.textContent = "▼ Hide GitHub Preview";
    } else {
      previewEl.style.display = "none";
      previewToggleBtn.textContent = "▶ Show GitHub Preview";
    }
  });

  itemEl.appendChild(bodyEl);

  // Expand/collapse toggle
  function toggleExpand() {
    const isExpanded = bodyEl.classList.contains("expanded");
    bodyEl.classList.toggle("expanded", !isExpanded);
    expandBtn.textContent = isExpanded ? "▼ Expand" : "▲ Collapse";
    headerEl.setAttribute("aria-expanded", String(!isExpanded));
  }

  expandBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleExpand();
  });

  headerEl.addEventListener("click", () => {
    toggleExpand();
  });

  headerEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleExpand();
    }
  });

  return itemEl;
}

// --- GitHub Push Approval Workflow ---

/** localStorage key for persisting the last-used GitHub owner/repo. */
const PUSH_REPO_STORAGE_KEY = "copilot_push_repo";

/** Max number of concurrent milestone-issue fetch requests in the push mutation loader. */
const PUSH_MUTATION_FETCH_CONCURRENCY = 4;

/** DOM refs for push modal */
const pushModal = document.getElementById("push-modal");
const pushModalClose = document.getElementById("push-modal-close");
const pushOwnerInput = document.getElementById("push-owner-input");
const pushRepoInput = document.getElementById("push-repo-input");
const pushMutationList = document.getElementById("push-mutation-list");
const pushMutationCount = document.getElementById("push-mutation-count");
const pushConfirmBtn = document.getElementById("push-confirm-btn");
const pushProgressLabel = document.getElementById("push-progress-label");
const pushProgressCount = document.getElementById("push-progress-count");
const pushProgressBar = document.getElementById("push-progress-bar");
const pushProgressItems = document.getElementById("push-progress-items");
const pushResultsSummary = document.getElementById("push-results-summary");
const pushResultsList = document.getElementById("push-results-list");
const pushDoneBtn = document.getElementById("push-done-btn");
const pushModalReview = document.getElementById("push-modal-review");
const pushModalProgress = document.getElementById("push-modal-progress");
const pushModalResults = document.getElementById("push-modal-results");
const pushToGithubBtn = document.getElementById("push-to-github-btn");

/** The goalId for the current push workflow session. */
let pushGoalId = null;
/** Planned mutations: array of { type, id, milestoneId?, name, alreadyExists } */
let pushMutations = [];

/**
 * Loads milestones (and their issues) for the goal, then shows the push approval modal.
 * @param {string} goalId
 */
async function openPushApprovalModal(goalId) {
  pushGoalId = goalId;
  pushMutations = [];

  // Reset modal to review step
  pushModalReview.style.display = "";
  pushModalProgress.style.display = "none";
  pushModalResults.style.display = "none";
  pushModal.style.display = "flex";

  // Restore last-used owner/repo
  const saved = localStorage.getItem(PUSH_REPO_STORAGE_KEY);
  if (saved) {
    try {
      const { owner, repo } = JSON.parse(saved);
      pushOwnerInput.value = typeof owner === "string" ? owner : "";
      pushRepoInput.value = typeof repo === "string" ? repo : "";
    } catch {
      pushOwnerInput.value = "";
      pushRepoInput.value = "";
    }
  }
  pushConfirmBtn.disabled = true;
  pushMutationList.innerHTML = '<div class="push-loading"><span class="spinner" aria-label="Loading"></span> Loading planned mutations…</div>';
  pushMutationCount.textContent = "";

  try {
    // Fetch all milestones for the goal
    const msRes = await fetch(`/api/goals/${encodeURIComponent(goalId)}/milestones`, { headers: authHeaders() });
    if (!msRes.ok) {
      const err = await msRes.json().catch(() => ({}));
      pushMutationList.innerHTML = `<div class="push-loading" style="color:#f85149">Failed to load milestones: ${escHtml((err && err.error) ? err.error : "Unknown error")}</div>`;
      return;
    }
    const msData = await msRes.json();
    const milestones = Array.isArray(msData.milestones) ? msData.milestones : [];
    milestones.sort((a, b) => (a.order || 0) - (b.order || 0));

    // Fetch issues for each milestone concurrently
    const CONCURRENCY = PUSH_MUTATION_FETCH_CONCURRENCY;
    /** @type {Array<{ milestone: Object, issues: Array }>} */
    const groups = [];
    for (let i = 0; i < milestones.length; i += CONCURRENCY) {
      const batch = milestones.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (ms) => {
          try {
            const r = await fetch(`/api/milestones/${encodeURIComponent(ms.id)}/issues`, { headers: authHeaders() });
            const d = r.ok ? await r.json() : {};
            return { milestone: ms, issues: Array.isArray(d.issues) ? d.issues : [] };
          } catch {
            return { milestone: ms, issues: [] };
          }
        })
      );
      groups.push(...batchResults);
    }

    // Build the mutations list: milestones without githubNumber + ready issues
    pushMutations = [];
    for (const { milestone, issues } of groups) {
      if (milestone.githubNumber === undefined || milestone.githubNumber === null) {
        pushMutations.push({ type: "milestone", id: milestone.id, name: typeof milestone.name === "string" ? milestone.name : "(untitled milestone)", alreadyExists: false });
      } else {
        pushMutations.push({ type: "milestone", id: milestone.id, name: typeof milestone.name === "string" ? milestone.name : "(untitled milestone)", alreadyExists: true, githubUrl: milestone.githubUrl });
      }
      const readyIssues = issues
        .filter((iss) => iss.status === "ready" || iss.status === "created")
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      for (const iss of readyIssues) {
        pushMutations.push({
          type: "issue",
          id: iss.id,
          milestoneId: milestone.id,
          milestoneName: typeof milestone.name === "string" ? milestone.name : "",
          name: typeof iss.title === "string" ? iss.title : "(untitled issue)",
          alreadyExists: iss.status === "created",
          githubIssueNumber: iss.githubIssueNumber,
        });
      }
    }

    renderPushMutationList();
    updatePushConfirmState();
  } catch (err) {
    console.warn("Failed to load push mutations:", err);
    pushMutationList.innerHTML = '<div class="push-loading" style="color:#f85149">Failed to load mutations. Please try again.</div>';
  }
}

/**
 * Renders the planned mutation list in the review step.
 * All user-supplied content is inserted via textContent or escHtml to prevent XSS.
 */
function renderPushMutationList() {
  pushMutationList.innerHTML = "";

  if (pushMutations.length === 0) {
    const empty = document.createElement("div");
    empty.className = "push-no-mutations";
    empty.textContent = "No ready issues or new milestones found. All issues must be in 'ready' status to be pushed.";
    pushMutationList.appendChild(empty);
    pushMutationCount.textContent = "";
    return;
  }

  const newMilestones = pushMutations.filter((m) => m.type === "milestone" && !m.alreadyExists);
  const existingMilestones = pushMutations.filter((m) => m.type === "milestone" && m.alreadyExists);
  const newIssues = pushMutations.filter((m) => m.type === "issue" && !m.alreadyExists);
  const existingIssues = pushMutations.filter((m) => m.type === "issue" && m.alreadyExists);

  function buildGroup(label, items) {
    if (items.length === 0) return;
    const group = document.createElement("div");
    group.className = "push-mutation-group";
    const groupLabel = document.createElement("div");
    groupLabel.className = "push-mutation-group-label";
    groupLabel.textContent = label;
    group.appendChild(groupLabel);
    for (const mut of items) {
      const item = document.createElement("div");
      item.className = "push-mutation-item";
      const icon = document.createElement("span");
      icon.className = "push-mutation-icon";
      icon.textContent = mut.type === "milestone" ? "🏁" : "📋";
      item.appendChild(icon);
      const info = document.createElement("div");
      info.className = "push-mutation-info";
      const name = document.createElement("div");
      name.className = "push-mutation-name";
      name.textContent = mut.name;
      info.appendChild(name);
      if (mut.type === "issue" && mut.milestoneName) {
        const meta = document.createElement("div");
        meta.className = "push-mutation-meta";
        meta.textContent = `Milestone: ${mut.milestoneName}`;
        info.appendChild(meta);
      }
      item.appendChild(info);
      const badge = document.createElement("span");
      badge.className = "push-mutation-badge " + (mut.alreadyExists ? "exists" : "new");
      badge.textContent = mut.alreadyExists ? (mut.type === "milestone" ? "exists" : "created") : "new";
      item.appendChild(badge);
      group.appendChild(item);
    }
    pushMutationList.appendChild(group);
  }

  buildGroup("New Milestones to Create", newMilestones);
  buildGroup("New Issues to Create", newIssues);
  buildGroup("Already Exists (will be skipped)", [...existingMilestones, ...existingIssues]);

  const totalNew = newMilestones.length + newIssues.length;
  const totalSkip = existingMilestones.length + existingIssues.length;
  const parts = [];
  if (totalNew > 0) parts.push(`${totalNew} to create`);
  if (totalSkip > 0) parts.push(`${totalSkip} to skip`);
  pushMutationCount.textContent = parts.join(" · ");
}

/** Updates the Confirm button enabled state based on owner/repo validity and mutations. */
function updatePushConfirmState() {
  const owner = pushOwnerInput.value.trim();
  const repo = pushRepoInput.value.trim();
  const hasNewMutations = pushMutations.some((m) => !m.alreadyExists);
  const ownerOk = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,37}[a-zA-Z0-9])?$/.test(owner);
  const repoOk = /^[a-zA-Z0-9._-]{1,100}$/.test(repo);
  pushConfirmBtn.disabled = !(hasNewMutations && ownerOk && repoOk);
}

/**
 * Executes the push workflow: creates milestones and issues on GitHub in order.
 * Updates the progress UI after each operation.
 */
async function executePushToGitHub() {
  const owner = pushOwnerInput.value.trim();
  const repo = pushRepoInput.value.trim();

  // Save owner/repo for next time
  localStorage.setItem(PUSH_REPO_STORAGE_KEY, JSON.stringify({ owner, repo }));

  // Switch to progress step
  pushModalReview.style.display = "none";
  pushModalProgress.style.display = "";
  pushProgressItems.innerHTML = "";

  const toCreate = pushMutations.filter((m) => !m.alreadyExists);
  const total = toCreate.length;
  let completed = 0;
  let successCount = 0;
  let failCount = 0;

  // Results: array of { mut, success, githubUrl?, githubNumber?, error? }
  const results = [];

  pushProgressLabel.textContent = "Pushing to GitHub…";
  pushProgressCount.textContent = `0 / ${total}`;
  pushProgressBar.style.width = "0%";

  /**
   * Appends a progress item row to the progress list.
   * @param {Object} mut - The mutation being processed
   * @param {"pending"|"success"|"error"} state
   * @param {string} [url]
   * @param {string} [errorMsg]
   */
  function upsertProgressItem(mut, state, url, errorMsg) {
    let row = pushProgressItems.querySelector(`[data-mutation-id="${CSS.escape(mut.id)}"]`);
    if (!row) {
      row = document.createElement("div");
      row.className = "push-progress-item";
      row.setAttribute("data-mutation-id", mut.id);
      pushProgressItems.appendChild(row);
    }
    row.innerHTML = "";

    const statusEl = document.createElement("span");
    statusEl.className = "push-progress-item-status";
    if (state === "pending") statusEl.textContent = "⏳";
    else if (state === "success") statusEl.textContent = "✅";
    else statusEl.textContent = "❌";
    row.appendChild(statusEl);

    const nameEl = document.createElement("span");
    nameEl.className = "push-progress-item-name";
    nameEl.textContent = `${mut.type === "milestone" ? "🏁" : "📋"} ${mut.name}`;
    row.appendChild(nameEl);

    if (url && state === "success") {
      const link = document.createElement("a");
      link.className = "push-progress-item-link";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = mut.type === "milestone" ? "View milestone" : "View issue";
      row.appendChild(link);
    } else if (errorMsg && state === "error") {
      const errEl = document.createElement("span");
      errEl.className = "push-progress-item-error";
      errEl.textContent = errorMsg;
      row.appendChild(errEl);
    }
  }

  // Pre-render all items as pending
  for (const mut of toCreate) {
    upsertProgressItem(mut, "pending");
  }

  // Execute mutations sequentially (milestone before its issues)
  // Process in order: milestones first (they may supply githubNumber to issues)
  const milestoneResults = new Map(); // milestoneId -> { success, githubNumber }

  for (const mut of toCreate) {
    if (mut.type !== "milestone") continue;
    upsertProgressItem(mut, "pending");
    try {
      const res = await fetch(`/api/milestones/${encodeURIComponent(mut.id)}/push-to-github`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ owner, repo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = (data && data.error) ? data.error : `HTTP ${res.status}`;
        upsertProgressItem(mut, "error", null, errMsg);
        milestoneResults.set(mut.id, { success: false });
        results.push({ mut, success: false, error: errMsg });
        failCount++;
      } else {
        upsertProgressItem(mut, "success", data.githubUrl || null);
        milestoneResults.set(mut.id, { success: true, githubNumber: data.githubNumber });
        results.push({ mut, success: true, githubUrl: data.githubUrl, githubNumber: data.githubNumber });
        successCount++;
      }
    } catch (err) {
      const errMsg = (err && err.message) ? err.message : "Network error";
      upsertProgressItem(mut, "error", null, errMsg);
      milestoneResults.set(mut.id, { success: false });
      results.push({ mut, success: false, error: errMsg });
      failCount++;
    }
    completed++;
    pushProgressCount.textContent = `${completed} / ${total}`;
    pushProgressBar.style.width = `${Math.round((completed / total) * 100)}%`;
  }

  // Now process issues — skip issues whose milestone failed (to avoid creating orphan issues)
  for (const mut of toCreate) {
    if (mut.type !== "issue") continue;
    // Skip if the parent milestone push failed
    const msResult = milestoneResults.get(mut.milestoneId);
    if (msResult && !msResult.success) {
      upsertProgressItem(mut, "error", null, "Skipped — parent milestone push failed");
      results.push({ mut, success: false, error: "Skipped — parent milestone push failed" });
      failCount++;
      completed++;
      pushProgressCount.textContent = `${completed} / ${total}`;
      pushProgressBar.style.width = `${Math.round((completed / total) * 100)}%`;
      continue;
    }
    upsertProgressItem(mut, "pending");
    try {
      const res = await fetch(
        `/api/milestones/${encodeURIComponent(mut.milestoneId)}/issues/${encodeURIComponent(mut.id)}/push-to-github`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ owner, repo }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = (data && data.error) ? data.error : `HTTP ${res.status}`;
        upsertProgressItem(mut, "error", null, errMsg);
        results.push({ mut, success: false, error: errMsg });
        failCount++;
      } else {
        upsertProgressItem(mut, "success", data.githubIssueUrl || null);
        results.push({ mut, success: true, githubIssueUrl: data.githubIssueUrl, githubIssueNumber: data.githubIssueNumber });
        successCount++;
      }
    } catch (err) {
      const errMsg = (err && err.message) ? err.message : "Network error";
      upsertProgressItem(mut, "error", null, errMsg);
      results.push({ mut, success: false, error: errMsg });
      failCount++;
    }
    completed++;
    pushProgressCount.textContent = `${completed} / ${total}`;
    pushProgressBar.style.width = `${Math.round((completed / total) * 100)}%`;
  }

  pushProgressLabel.textContent = "Push complete";
  pushProgressCount.textContent = `${completed} / ${total}`;
  pushProgressBar.style.width = "100%";

  // Short delay then switch to results step
  await new Promise((r) => setTimeout(r, 600));
  showPushResults(results, successCount, failCount);
}

/**
 * Shows the results step in the push modal.
 * All user-supplied content is inserted via textContent or validated URL attributes to prevent XSS.
 * @param {Array} results
 * @param {number} successCount
 * @param {number} failCount
 */
function showPushResults(results, successCount, failCount) {
  pushModalProgress.style.display = "none";
  pushModalResults.style.display = "";

  pushResultsSummary.className = "push-results-summary";
  if (failCount === 0) {
    pushResultsSummary.classList.add("all-success");
    pushResultsSummary.textContent = `✅ All ${successCount} item${successCount !== 1 ? "s" : ""} pushed successfully!`;
  } else if (successCount === 0) {
    pushResultsSummary.classList.add("all-failure");
    pushResultsSummary.textContent = `❌ Push failed — ${failCount} item${failCount !== 1 ? "s" : ""} could not be created.`;
  } else {
    pushResultsSummary.classList.add("partial-failure");
    pushResultsSummary.textContent = `⚠️ ${successCount} succeeded, ${failCount} failed — see details below.`;
  }

  pushResultsList.innerHTML = "";
  for (const { mut, success, githubUrl, githubIssueUrl, githubNumber, githubIssueNumber, error } of results) {
    const item = document.createElement("div");
    item.className = "push-results-item";

    const icon = document.createElement("span");
    icon.className = "push-results-item-icon";
    icon.textContent = success ? "✅" : "❌";
    item.appendChild(icon);

    const body = document.createElement("div");
    body.className = "push-results-item-body";

    const name = document.createElement("div");
    name.className = "push-results-item-name";
    name.textContent = `${mut.type === "milestone" ? "🏁" : "📋"} ${mut.name}`;
    body.appendChild(name);

    if (success) {
      const url = mut.type === "milestone" ? githubUrl : githubIssueUrl;
      if (url && typeof url === "string" && url.startsWith("https://")) {
        const link = document.createElement("a");
        link.className = "push-results-item-link";
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = url;
        body.appendChild(link);
      }
    } else if (error) {
      const errEl = document.createElement("div");
      errEl.className = "push-results-item-error";
      errEl.textContent = error;
      body.appendChild(errEl);
    }

    item.appendChild(body);
    pushResultsList.appendChild(item);
  }

  // Reload the issues dashboard to reflect updated statuses
  if (successCount > 0) {
    issuesLoadInFlight = false;
    loadIssuesDashboard();
  }
}

/** Escapes a string for safe insertion into HTML as text content of an element. */
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Closes the push modal and resets state. */
function closePushModal() {
  pushModal.style.display = "none";
  pushGoalId = null;
  pushMutations = [];
}

// Push modal event listeners
pushModalClose.addEventListener("click", closePushModal);
pushDoneBtn.addEventListener("click", closePushModal);

// Close on backdrop click
pushModal.addEventListener("click", (e) => {
  if (e.target === pushModal) closePushModal();
});

// Close on Escape key
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && pushModal.style.display !== "none") {
    closePushModal();
  }
});

// Update confirm button state when owner/repo change
pushOwnerInput.addEventListener("input", updatePushConfirmState);
pushRepoInput.addEventListener("input", updatePushConfirmState);

// Confirm button: start the push
pushConfirmBtn.addEventListener("click", () => {
  if (pushConfirmBtn.disabled) return;
  executePushToGitHub();
});

// Top-level "Push to GitHub" button on the issues page
pushToGithubBtn.addEventListener("click", () => {
  const goalId = issueGoalSelect.value;
  if (goalId) {
    openPushApprovalModal(goalId);
  }
});

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
  loadQuota();
}

// Restore dashboard view state from localStorage
const savedView = localStorage.getItem("copilot_current_view");
if (savedView === "dashboard") {
  switchView("dashboard");
}
const savedDashboardPage = localStorage.getItem("copilot_dashboard_page");
if (savedDashboardPage && ["goals", "research", "milestones", "issues"].includes(savedDashboardPage)) {
  navigateDashboard(savedDashboardPage);
}

toggleSidebarBtn.addEventListener("click", toggleSidebar);

// Close sidebar when backdrop is tapped (mobile)
sidebarBackdrop.addEventListener("click", closeSidebarOnMobile);

// View toggle (Chat ↔ Dashboard)
viewToggleBtn.addEventListener("click", () => {
  switchView(currentView === "chat" ? "dashboard" : "chat");
});

// Dashboard nav items
document.querySelectorAll(".dashboard-nav-item").forEach((item) => {
  item.addEventListener("click", () => navigateDashboard(item.dataset.page));
});

// Research goal selector
researchGoalSelect.addEventListener("change", () => {
  const selectedGoalId = researchGoalSelect.value;
  if (selectedGoalId) {
    loadResearchForGoal(selectedGoalId);
  }
});

// Milestone goal selector
milestoneGoalSelect.addEventListener("change", () => {
  const selectedGoalId = milestoneGoalSelect.value;
  if (selectedGoalId) {
    loadMilestonesForGoal(selectedGoalId);
  }
});

// Issue goal selector
issueGoalSelect.addEventListener("change", () => {
  const selectedGoalId = issueGoalSelect.value;
  if (selectedGoalId) {
    loadMilestonesForIssues(selectedGoalId);
  }
});

// Issue milestone selector
issueMilestoneSelect.addEventListener("change", () => {
  const selectedMilestoneId = issueMilestoneSelect.value;
  if (selectedMilestoneId) {
    loadIssuesForMilestone(selectedMilestoneId);
  }
});

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

// --- Agent Status Helpers (planning / intent / subagent / compaction events) ---

let activeSubagentCount = 0;

function showAgentStatus(text) {
  agentStatusText.textContent = text;
  agentStatusEl.style.display = "inline";
}

function hideAgentStatus() {
  agentStatusEl.style.display = "none";
  agentStatusText.textContent = "";
}

/**
 * Handles planning_start, plan_ready, intent, subagent_start, subagent_end, and compaction
 * SSE events by updating the agent status indicator in the status bar.
 * @param {Object} event - The parsed SSE event
 */
function handleAgentStatusEvent(event) {
  if (event.type === "planning_start") {
    showAgentStatus("🗺️ Planning...");
  } else if (event.type === "plan_ready") {
    showAgentStatus("✅ Plan ready");
  } else if (event.type === "intent" && event.intent) {
    showAgentStatus(`💡 ${event.intent}`);
  } else if (event.type === "subagent_start") {
    activeSubagentCount++;
    const label = event.name || "Sub-agent";
    showAgentStatus(`🤖 ${label} (${activeSubagentCount} active)`);
  } else if (event.type === "subagent_end") {
    if (activeSubagentCount > 0) activeSubagentCount--;
    if (activeSubagentCount === 0) {
      hideAgentStatus();
    } else {
      showAgentStatus(`🤖 Sub-agents running (${activeSubagentCount} active)`);
    }
  } else if (event.type === "compaction") {
    if (event.started) {
      showAgentStatus("🔄 Optimizing context...");
    } else {
      hideAgentStatus();
    }
  }
}

/**
 * Handles a parsed tool_complete SSE event.
 * Extracted so it can be called from both the streaming loop and tests.
 * For save_goal, renders the goal summary card using the result data when present,
 * or falls back to fetching the latest goal from the API.
 * For generate_research_checklist, renders the categorized research checklist.
 * For create_milestone_plan and get_milestones, renders the milestone timeline.
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
  // When create_milestone_plan or get_milestones completes, render the milestone timeline
  if (event.tool === "create_milestone_plan" || event.tool === "get_milestones") {
    if (event.result && Array.isArray(event.result.milestones)) {
      renderMilestoneTimeline(event.result.milestones);
    }
  }
  hideToolActivity();
}

/**
 * Submits the user's answer to a pending agent input request via POST /api/chat/input.
 * On success, replaces the interactive UI with a "answered" confirmation label.
 * @param {string} requestId - The UUID for the pending input request
 * @param {string} answer - The user's answer text
 * @param {boolean} wasFreeform - Whether the answer was typed (true) or a choice (false)
 * @param {HTMLElement} containerEl - The .user-input-request element to update after submit
 */
async function submitUserInputAnswer(requestId, answer, wasFreeform, containerEl) {
  try {
    const res = await fetch("/api/chat/input", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ requestId, answer, wasFreeform }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Request failed" }));
      console.warn("Failed to submit user input:", err.error);
      return;
    }
    // Replace interactive controls with a compact "answered" label
    const body = containerEl.querySelector(".user-input-request-body");
    if (body) {
      const questionEl = containerEl.querySelector(".user-input-question");
      const questionText = questionEl ? questionEl.textContent : "";
      body.innerHTML = "";
      if (questionText) {
        const q = document.createElement("div");
        q.className = "user-input-question";
        q.textContent = questionText;
        body.appendChild(q);
      }
      const answeredEl = document.createElement("div");
      answeredEl.className = "user-input-answered";
      answeredEl.textContent = `✓ You answered: ${answer}`;
      body.appendChild(answeredEl);
    }
  } catch (err) {
    console.warn("Failed to submit user input:", err);
  }
}

/**
 * Renders an inline user input request card in the chat flow.
 * Shows choice buttons if choices are provided, and/or a freeform text input if allowFreeform.
 * All user-supplied content (question, choices) is inserted via textContent to prevent XSS.
 * @param {Object} event - The parsed user_input_request SSE event
 */
function renderUserInputRequest(event) {
  const { requestId, question, choices, allowFreeform } = event;
  if (!requestId || !question) return;

  const card = document.createElement("div");
  card.className = "user-input-request";

  // Header
  const header = document.createElement("div");
  header.className = "user-input-request-header";
  header.textContent = "❓ Agent is asking you a question";
  card.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = "user-input-request-body";

  const questionEl = document.createElement("div");
  questionEl.className = "user-input-question";
  questionEl.textContent = question;
  body.appendChild(questionEl);

  // Choice buttons (if provided)
  if (Array.isArray(choices) && choices.length > 0) {
    const choicesEl = document.createElement("div");
    choicesEl.className = "user-input-choices";
    for (const choice of choices) {
      const btn = document.createElement("button");
      btn.className = "user-input-choice-btn";
      btn.textContent = choice;
      btn.addEventListener("click", () => {
        submitUserInputAnswer(requestId, choice, false, card);
      });
      choicesEl.appendChild(btn);
    }
    body.appendChild(choicesEl);
  }

  // Freeform text input (if allowFreeform is true or no choices given)
  const showFreeform = allowFreeform !== false || !Array.isArray(choices) || choices.length === 0;
  if (showFreeform) {
    const freeformEl = document.createElement("div");
    freeformEl.className = "user-input-freeform";

    const textarea = document.createElement("textarea");
    textarea.className = "user-input-freeform-text";
    textarea.rows = 1;
    textarea.placeholder = "Type your answer...";
    textarea.addEventListener("input", () => {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
    });
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const val = textarea.value.trim();
        if (val) submitUserInputAnswer(requestId, val, true, card);
      }
    });

    const submitBtn = document.createElement("button");
    submitBtn.className = "user-input-submit-btn";
    submitBtn.textContent = "Submit";
    submitBtn.addEventListener("click", () => {
      const val = textarea.value.trim();
      if (val) submitUserInputAnswer(requestId, val, true, card);
    });

    freeformEl.appendChild(textarea);
    freeformEl.appendChild(submitBtn);
    body.appendChild(freeformEl);
  }

  card.appendChild(body);
  messagesEl.appendChild(card);
  messagesEl.scrollTop = messagesEl.scrollHeight;
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
  updateReasoningEffortDropdown();
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
  inputEl.focus();
});

// --- Welcome Prompt Quick Actions ---
document.getElementById("welcome-prompts").addEventListener("click", (e) => {
  const btn = e.target.closest(".welcome-prompt-btn");
  if (!btn) return;
  const prompt = btn.getAttribute("data-prompt");
  if (prompt) {
    inputEl.value = prompt;
    inputEl.focus();
  }
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
      modelData = {};
      for (const model of data.models) {
        const name = typeof model === "string" ? model : model.id || model.name;
        modelData[name] = model;
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
      updateReasoningEffortDropdown();
    }
  } catch {
    modelSelect.innerHTML = '<option value="gpt-4.1">Enter token to load models</option>';
  }
}

// --- Reasoning Effort Dropdown ---
// Label map keeps display names consistent with the static HTML fallback options.
// Must stay in sync with ALLOWED_REASONING_EFFORTS in server.ts.
const EFFORT_LABELS = { low: "Low", medium: "Medium", high: "High", xhigh: "Extended" };

function updateReasoningEffortDropdown() {
  const model = modelData[modelSelect.value];
  const supportsReasoning = model?.capabilities?.supports?.reasoningEffort === true;
  reasoningEffortSelect.style.display = supportsReasoning ? "" : "none";
  if (supportsReasoning) {
    const efforts = Array.isArray(model.supportedReasoningEfforts) && model.supportedReasoningEfforts.length > 0
      ? model.supportedReasoningEfforts
      : ["low", "medium", "high", "xhigh"];
    reasoningEffortSelect.innerHTML = "";
    for (const effort of efforts) {
      const opt = document.createElement("option");
      opt.value = effort;
      opt.textContent = EFFORT_LABELS[effort] ?? effort.charAt(0).toUpperCase() + effort.slice(1);
      reasoningEffortSelect.appendChild(opt);
    }
    const defaultEffort = model.defaultReasoningEffort;
    if (defaultEffort && efforts.includes(defaultEffort)) {
      reasoningEffortSelect.value = defaultEffort;
    }
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
    const chatPayload = {
      message: text,
      sessionId: sessionId,
      model: modelSelect.value,
    };
    if (reasoningEffortSelect.style.display !== "none" && reasoningEffortSelect.value) {
      chatPayload.reasoningEffort = reasoningEffortSelect.value;
    }
    const body = JSON.stringify(chatPayload);

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
          } else if (event.type === "planning_start" || event.type === "plan_ready"
            || event.type === "intent" || event.type === "subagent_start"
            || event.type === "subagent_end" || event.type === "compaction") {
            handleAgentStatusEvent(event);
          } else if (event.type === "user_input_request") {
            renderUserInputRequest(event);
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
    hideAgentStatus();
    activeSubagentCount = 0;
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

/** Ordered list of research category keys, derived from CATEGORY_LABELS. */
const RESEARCH_CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);

/** Valid milestone status values. */
const VALID_MILESTONE_STATUSES = ["draft", "ready", "in-progress", "complete"];

/** Default milestone status used when an unrecognized value is encountered. */
const DEFAULT_MILESTONE_STATUS = "draft";

/** Valid issue draft status values. */
const VALID_ISSUE_DRAFT_STATUSES = ["draft", "ready", "created"];

/** Default issue draft status used when an unrecognized value is encountered. */
const DEFAULT_ISSUE_DRAFT_STATUS = "draft";

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
  /** @type {Map<string, Array>} */
  const grouped = new Map();
  for (const item of items) {
    const cat = item.category || "domain";
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat).push(item);
  }

  // Render categories in defined order, then any unexpected categories
  const orderedKeys = [...RESEARCH_CATEGORY_ORDER.filter(c => grouped.has(c)), ...Array.from(grouped.keys()).filter(c => !RESEARCH_CATEGORY_ORDER.includes(c))];

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

/**
 * Renders a milestone timeline/list card in the chat flow.
 * Milestones are shown in order with status indicators and dependency labels.
 * All user-supplied content is inserted via textContent to prevent XSS.
 * @param {Array} milestones - Array of Milestone objects sorted by order
 */
function renderMilestoneTimeline(milestones) {
  if (!milestones || milestones.length === 0) return;

  // Sort by order ascending (defensive copy)
  const sorted = [...milestones].sort((a, b) => (a.order || 0) - (b.order || 0));

  const card = document.createElement("div");
  card.className = "milestone-card";

  // Header
  const header = document.createElement("div");
  header.className = "milestone-card-header";
  const headerTitle = document.createElement("span");
  headerTitle.textContent = "🗺️ Milestone Plan";
  header.appendChild(headerTitle);
  card.appendChild(header);

  // Body
  const body = document.createElement("div");
  body.className = "milestone-card-body";

  // Build a map from milestone ID to order for dependency display
  /** @type {Map<string, number>} */
  const idToOrder = new Map();
  for (const ms of sorted) {
    if (ms.id) idToOrder.set(ms.id, ms.order);
  }

  for (const ms of sorted) {
    const itemEl = document.createElement("div");
    itemEl.className = "milestone-item";
    itemEl.setAttribute("data-milestone-id", ms.id || "");

    // Header row: order number, name, status badge
    const itemHeader = document.createElement("div");
    itemHeader.className = "milestone-item-header";

    const orderEl = document.createElement("span");
    orderEl.className = "milestone-order";
    orderEl.textContent = `#${ms.order}`;
    itemHeader.appendChild(orderEl);

    const nameEl = document.createElement("span");
    nameEl.className = "milestone-name";
    nameEl.textContent = ms.name || "";
    itemHeader.appendChild(nameEl);

    const rawStatus = ms.status || DEFAULT_MILESTONE_STATUS;
    const status = VALID_MILESTONE_STATUSES.includes(rawStatus) ? rawStatus : DEFAULT_MILESTONE_STATUS;
    const statusEl = document.createElement("span");
    statusEl.className = "milestone-status status-" + status;
    statusEl.textContent = status;
    itemHeader.appendChild(statusEl);

    itemEl.appendChild(itemHeader);

    // Goal/description line
    if (ms.goal) {
      const goalEl = document.createElement("div");
      goalEl.className = "milestone-goal";
      goalEl.textContent = ms.goal;
      itemEl.appendChild(goalEl);
    }

    // Dependencies
    if (Array.isArray(ms.dependencies) && ms.dependencies.length > 0) {
      const depsEl = document.createElement("div");
      depsEl.className = "milestone-deps";

      const depsLabel = document.createElement("span");
      depsLabel.className = "milestone-deps-label";
      depsLabel.textContent = "Depends on:";
      depsEl.appendChild(depsLabel);

      const depList = ms.dependencies.map((depId) => {
        const depOrder = idToOrder.get(depId);
        return depOrder !== undefined ? `#${depOrder}` : depId;
      });

      const depsText = document.createTextNode(" " + depList.join(", "));
      depsEl.appendChild(depsText);
      itemEl.appendChild(depsEl);
    }

    body.appendChild(itemEl);
  }

  // Summary line
  const total = sorted.length;
  const complete = sorted.filter(m => m.status === "complete").length;
  const inProgress = sorted.filter(m => m.status === "in-progress").length;
  const ready = sorted.filter(m => m.status === "ready").length;
  const draft = total - complete - inProgress - ready;
  const summaryParts = [];
  if (draft > 0) summaryParts.push(`Draft: ${draft}`);
  if (ready > 0) summaryParts.push(`Ready: ${ready}`);
  if (inProgress > 0) summaryParts.push(`In Progress: ${inProgress}`);
  if (complete > 0) summaryParts.push(`Complete: ${complete}`);
  const summaryEl = document.createElement("div");
  summaryEl.className = "milestone-card-summary";
  summaryEl.textContent = summaryParts.join(" · ");
  body.appendChild(summaryEl);

  card.appendChild(body);
  messagesEl.appendChild(card);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
