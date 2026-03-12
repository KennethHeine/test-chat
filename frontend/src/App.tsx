import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  GoalData,
  ResearchItem,
  MilestoneData,
  ModelInfo,
  ViewMode,
  DashboardPage,
  ReasoningEffort,
  HealthStatus,
  ChatItem,
  ToolCompleteEvent,
  IssueDraft,
} from './utils/types';
import { apiFetch, escHtml } from './utils/api';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import Dashboard from './components/Dashboard';
import StatusBar from './components/StatusBar';
import PushModal from './components/PushModal';
import GitHubIcon from './components/GitHubIcon';

function generateSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Simple hash for session storage key (matches original app.js behavior) */
function hashForKey(token: string): string {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    const char = token.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

interface SessionData {
  id: string;
  title: string;
  timestamp: number;
  messages: ChatItem[];
}

/** Declare global window functions for E2E test compatibility */
declare global {
  interface Window {
    renderGoalCard: (goal: GoalData) => void;
    handleToolComplete: (event: ToolCompleteEvent) => void;
    renderResearchChecklist: (items: ResearchItem[]) => void;
    renderMilestoneTimeline: (milestones: MilestoneData[]) => void;
    fetchAndRenderLatestGoal: () => Promise<void>;
    _fetchAndRenderCalled?: boolean;
  }
}

export default function App() {
  // --- Auth state ---
  const [token, setToken] = useState<string>(() => localStorage.getItem('copilot_github_token') ?? '');
  const [tokenInputValue, setTokenInputValue] = useState('');
  const [tokenPlaceholder, setTokenPlaceholder] = useState(
    () => (localStorage.getItem('copilot_github_token') ? 'Token saved ✓' : 'GitHub token (ghp_... or github_pat_...)')
  );

  // --- Session state ---
  const [sessionId, setSessionId] = useState<string>(generateSessionId);
  const [sessions, setSessions] = useState<SessionData[]>([]);

  // --- Chat state ---
  const [chatItems, setChatItems] = useState<ChatItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const streamingContentRef = useRef('');

  // --- Model state ---
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState('gpt-4.1');
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>('medium');

  // --- View state ---
  const [currentView, setCurrentView] = useState<ViewMode>(
    () => (localStorage.getItem('copilot_current_view') as ViewMode) || 'chat'
  );
  const [currentDashboardPage, setCurrentDashboardPage] = useState<DashboardPage>(
    () => (localStorage.getItem('copilot_dashboard_page') as DashboardPage) || 'goals'
  );

  // --- Sidebar state ---
  const [sidebarOpen, setSidebarOpen] = useState(
    () => localStorage.getItem('copilot_sidebar_collapsed') !== 'true'
  );

  // --- Status state ---
  const [statusText, setStatusText] = useState('Checking connection...');
  const [statusConnected, setStatusConnected] = useState(false);

  // --- Tool/agent/usage state ---
  const [toolActivity, setToolActivity] = useState('');
  const [toolActivityVisible, setToolActivityVisible] = useState(false);
  const [agentStatus, setAgentStatus] = useState('');
  const [agentStatusVisible, setAgentStatusVisible] = useState(false);
  const [usageText, setUsageText] = useState('');
  const [usageVisible, setUsageVisible] = useState(false);
  const [quotaText, setQuotaText] = useState('');
  const [quotaVisible, setQuotaVisible] = useState(false);

  // --- Push modal state ---
  const [pushModalVisible, setPushModalVisible] = useState(false);
  const [pushGoalId, setPushGoalId] = useState('');
  const [pushMilestoneId, setPushMilestoneId] = useState('');
  const [pushIssues, setPushIssues] = useState<IssueDraft[]>([]);
  const [pushMilestones, setPushMilestones] = useState<MilestoneData[]>([]);

  // --- Refs for global function access ---
  const chatItemsRef = useRef(chatItems);
  chatItemsRef.current = chatItems;
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const showReasoning = selectedModel.includes('o1') || selectedModel.includes('o4');

  // --- Session storage helpers ---
  const getSessionStorageKey = useCallback(() => {
    const tk = tokenRef.current;
    return tk ? `copilot_sessions_${hashForKey(tk)}` : 'copilot_sessions_default';
  }, []);

  const loadSavedSessions = useCallback((): SessionData[] => {
    try {
      const raw = localStorage.getItem(getSessionStorageKey());
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return [];
  }, [getSessionStorageKey]);

  const saveSessions = useCallback((data: SessionData[]) => {
    localStorage.setItem(getSessionStorageKey(), JSON.stringify(data));
    setSessions(data);
  }, [getSessionStorageKey]);

  const saveCurrentSessionMessages = useCallback((items: ChatItem[], sid: string) => {
    if (items.length === 0) return;
    const saved = loadSavedSessions();
    const title = items.find(i => i.type === 'message' && i.role === 'user')?.type === 'message'
      ? (items.find(i => i.type === 'message' && i.role === 'user') as Extract<ChatItem, { type: 'message' }>)?.content?.slice(0, 60) || 'Chat'
      : 'Chat';
    const existing = saved.findIndex(s => s.id === sid);
    const entry: SessionData = { id: sid, title, timestamp: Date.now(), messages: items };
    if (existing >= 0) {
      saved[existing] = entry;
    } else {
      saved.unshift(entry);
    }
    saveSessions(saved);
    localStorage.setItem('copilot_last_session', sid);
  }, [loadSavedSessions, saveSessions]);

  // --- Load models ---
  const loadModels = useCallback(async (authToken: string) => {
    try {
      const data = await apiFetch<ModelInfo[]>('/api/models', authToken);
      setModels(data);
      if (data.length > 0) {
        const preferred = data.find(m => m.id.includes('gpt-4.1'));
        setSelectedModel(preferred ? preferred.id : data[0].id);
      }
    } catch {
      setModels([]);
    }
  }, []);

  // --- Load sessions from backend ---
  const loadSessionsFromBackend = useCallback(async (authToken: string) => {
    try {
      const data = await apiFetch<{ sessions: Array<{ id: string; title?: string; createdAt?: string }> }>('/api/sessions', authToken);
      if (data.sessions && data.sessions.length > 0) {
        const local = loadSavedSessions();
        const localIds = new Set(local.map(s => s.id));
        for (const s of data.sessions) {
          if (!localIds.has(s.id)) {
            local.push({ id: s.id, title: s.title || 'Untitled', timestamp: s.createdAt ? new Date(s.createdAt).getTime() : Date.now(), messages: [] });
          }
        }
        local.sort((a, b) => b.timestamp - a.timestamp);
        saveSessions(local);
      }
    } catch { /* keep existing sessions */ }
  }, [loadSavedSessions, saveSessions]);

  // --- Load quota ---
  const loadQuota = useCallback(async (authToken: string) => {
    try {
      const data = await apiFetch<{ copilot_chat?: { premium_requests_remaining?: number } }>('/api/quota', authToken);
      if (data.copilot_chat?.premium_requests_remaining !== undefined) {
        setQuotaText(`Premium: ${data.copilot_chat.premium_requests_remaining} remaining`);
        setQuotaVisible(true);
      }
    } catch { /* ignore */ }
  }, []);

  // --- Health check on mount ---
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data: HealthStatus = await res.json();
          setStatusText(`Connected (${data.storage})`);
          setStatusConnected(true);
        } else {
          setStatusText('Disconnected');
          setStatusConnected(false);
        }
      } catch {
        setStatusText('Disconnected');
        setStatusConnected(false);
      }
    };

    checkHealth();

    if (token) {
      loadModels(token);
      loadSessionsFromBackend(token);
      loadQuota(token);
    }

    // Restore last session
    const lastId = localStorage.getItem('copilot_last_session');
    if (lastId && token) {
      const saved = loadSavedSessions();
      const found = saved.find(s => s.id === lastId);
      if (found && found.messages.length > 0) {
        setSessionId(lastId);
        setChatItems(found.messages);
      }
    }

    // Load sessions from localStorage
    const saved = loadSavedSessions();
    if (saved.length > 0) {
      setSessions(saved);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- renderGoalCard: exposed globally for E2E tests ---
  const renderGoalCard = useCallback((goal: GoalData) => {
    const newItem: ChatItem = { type: 'goal-card', data: goal, id: `goal-${goal.id}-${Date.now()}` };
    setChatItems(prev => [...prev, newItem]);
  }, []);

  // --- renderResearchChecklist: exposed globally ---
  const renderResearchChecklist = useCallback((items: ResearchItem[]) => {
    const newItem: ChatItem = { type: 'research-card', data: items, id: `research-${Date.now()}` };
    setChatItems(prev => [...prev, newItem]);
  }, []);

  // --- renderMilestoneTimeline: exposed globally ---
  const renderMilestoneTimeline = useCallback((milestones: MilestoneData[]) => {
    const newItem: ChatItem = { type: 'milestone-card', data: milestones, id: `milestone-${Date.now()}` };
    setChatItems(prev => [...prev, newItem]);
  }, []);

  // --- fetchAndRenderLatestGoal: exposed globally ---
  const fetchAndRenderLatestGoal = useCallback(async () => {
    const tk = tokenRef.current;
    if (!tk) return;
    try {
      const data = await apiFetch<{ goals: GoalData[] }>('/api/goals', tk);
      if (data.goals && data.goals.length > 0) {
        renderGoalCard(data.goals[data.goals.length - 1]);
      }
    } catch { /* ignore */ }
  }, [renderGoalCard]);

  // --- handleToolComplete: exposed globally ---
  const handleToolComplete = useCallback((event: ToolCompleteEvent) => {
    setToolActivityVisible(false);

    if (event.tool === 'save_goal') {
      if (event.result && 'id' in event.result && 'intent' in event.result) {
        renderGoalCard(event.result as GoalData);
      } else {
        fetchAndRenderLatestGoal();
      }
    } else if (event.tool === 'generate_research_checklist' || event.tool === 'get_research') {
      const result = event.result as { items?: ResearchItem[] } | undefined;
      if (result?.items) {
        renderResearchChecklist(result.items);
      }
    } else if (event.tool === 'create_milestone_plan' || event.tool === 'get_milestones') {
      const result = event.result as { milestones?: MilestoneData[] } | undefined;
      if (result?.milestones) {
        renderMilestoneTimeline(result.milestones);
      }
    }
  }, [renderGoalCard, fetchAndRenderLatestGoal, renderResearchChecklist, renderMilestoneTimeline]);

  // --- Expose global functions for E2E compatibility ---
  useEffect(() => {
    window.renderGoalCard = renderGoalCard;
    window.handleToolComplete = handleToolComplete;
    window.renderResearchChecklist = renderResearchChecklist;
    window.renderMilestoneTimeline = renderMilestoneTimeline;
    window.fetchAndRenderLatestGoal = fetchAndRenderLatestGoal;
  }, [renderGoalCard, handleToolComplete, renderResearchChecklist, renderMilestoneTimeline, fetchAndRenderLatestGoal]);

  // --- Send message ---
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;
    const tk = tokenRef.current;
    if (!tk) return;

    const userItem: ChatItem = { type: 'message', role: 'user', content: text, id: `msg-${Date.now()}-user` };
    const assistantItem: ChatItem = { type: 'message', role: 'assistant', content: '', id: `msg-${Date.now()}-assistant` };
    setChatItems(prev => [...prev, userItem, assistantItem]);
    setIsStreaming(true);
    streamingContentRef.current = '';

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const body: Record<string, unknown> = {
        message: text,
        sessionId,
        model: selectedModel,
      };
      if (showReasoning) {
        body.reasoningEffort = reasoningEffort;
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tk}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Chat request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6);
          if (raw === '[DONE]') continue;

          try {
            const evt = JSON.parse(raw);

            if (evt.type === 'delta') {
              streamingContentRef.current += evt.data?.deltaContent || '';
              const content = streamingContentRef.current;
              setChatItems(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].type === 'message') {
                  updated[lastIdx] = { ...updated[lastIdx], content } as ChatItem;
                }
                return updated;
              });
            } else if (evt.type === 'tool_start') {
              setToolActivity(evt.tool || 'Working...');
              setToolActivityVisible(true);
            } else if (evt.type === 'tool_complete') {
              setToolActivityVisible(false);
              handleToolComplete(evt);
            } else if (evt.type === 'usage') {
              const u = evt.data || evt;
              if (u.prompt_tokens !== undefined) {
                setUsageText(`Tokens: ${u.prompt_tokens + u.completion_tokens}`);
                setUsageVisible(true);
              }
            } else if (evt.type === 'intent') {
              setAgentStatus(`Intent: ${evt.data?.intent || ''}`);
              setAgentStatusVisible(true);
            } else if (evt.type === 'subagent_start') {
              setAgentStatus(`Sub-agent: ${evt.data?.name || 'working'}...`);
              setAgentStatusVisible(true);
            } else if (evt.type === 'subagent_end') {
              setAgentStatusVisible(false);
            } else if (evt.type === 'title') {
              // Update session title
            } else if (evt.type === 'error') {
              streamingContentRef.current += `\n\n**Error:** ${escHtml(evt.data?.message || 'Unknown error')}`;
              const content = streamingContentRef.current;
              setChatItems(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].type === 'message') {
                  updated[lastIdx] = { ...updated[lastIdx], content } as ChatItem;
                }
                return updated;
              });
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        streamingContentRef.current += '\n\n**Error:** Connection lost';
        const content = streamingContentRef.current;
        setChatItems(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].type === 'message') {
            updated[lastIdx] = { ...updated[lastIdx], content } as ChatItem;
          }
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      setToolActivityVisible(false);
      abortRef.current = null;
    }
  }, [isStreaming, sessionId, selectedModel, showReasoning, reasoningEffort, handleToolComplete]);

  // --- Save messages after streaming completes ---
  useEffect(() => {
    if (!isStreaming && chatItems.length > 0) {
      saveCurrentSessionMessages(chatItems, sessionId);
    }
  }, [isStreaming]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Stop streaming ---
  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    // Also notify the server
    const tk = tokenRef.current;
    if (tk) {
      fetch('/api/chat/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ sessionId }),
      }).catch(() => {});
    }
  }, [sessionId]);

  // --- Token save handler ---
  const handleSaveToken = useCallback(async () => {
    const trimmed = tokenInputValue.trim();
    if (!trimmed) return;

    setToken(trimmed);
    tokenRef.current = trimmed;
    localStorage.setItem('copilot_github_token', trimmed);
    setTokenInputValue('');
    setTokenPlaceholder('Token saved ✓');

    await loadModels(trimmed);
    await loadSessionsFromBackend(trimmed);
    await loadQuota(trimmed);
  }, [tokenInputValue, loadModels, loadSessionsFromBackend, loadQuota]);

  // --- View toggle ---
  const handleViewToggle = useCallback(() => {
    const next: ViewMode = currentView === 'chat' ? 'dashboard' : 'chat';
    setCurrentView(next);
    localStorage.setItem('copilot_current_view', next);
  }, [currentView]);

  // --- New chat ---
  const handleNewChat = useCallback(() => {
    if (chatItems.length > 0) {
      saveCurrentSessionMessages(chatItems, sessionId);
    }
    const newId = generateSessionId();
    setSessionId(newId);
    setChatItems([]);
  }, [chatItems, sessionId, saveCurrentSessionMessages]);

  // --- Sidebar toggle ---
  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen(prev => {
      const next = !prev;
      localStorage.setItem('copilot_sidebar_collapsed', next ? 'false' : 'true');
      return next;
    });
  }, []);

  // --- Dashboard page change ---
  const handleDashboardPageChange = useCallback((page: DashboardPage) => {
    setCurrentDashboardPage(page);
    localStorage.setItem('copilot_dashboard_page', page);
  }, []);

  // --- Session switching ---
  const handleSessionSwitch = useCallback((sid: string) => {
    if (chatItems.length > 0) {
      saveCurrentSessionMessages(chatItems, sessionId);
    }
    const saved = loadSavedSessions();
    const found = saved.find(s => s.id === sid);
    if (found) {
      setSessionId(sid);
      setChatItems(found.messages);
      localStorage.setItem('copilot_last_session', sid);
    }
  }, [chatItems, sessionId, saveCurrentSessionMessages, loadSavedSessions]);

  // --- Session deletion ---
  const handleSessionDelete = useCallback((sid: string) => {
    const saved = loadSavedSessions();
    const filtered = saved.filter(s => s.id !== sid);
    saveSessions(filtered);

    if (sid === sessionId) {
      const newId = generateSessionId();
      setSessionId(newId);
      setChatItems([]);
    }

    // Also delete from backend
    const tk = tokenRef.current;
    if (tk) {
      fetch(`/api/sessions/${sid}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tk}` },
      }).catch(() => {});
    }
  }, [sessionId, loadSavedSessions, saveSessions]);

  // --- Push modal ---
  const handleOpenPushModal = useCallback((goalId: string, milestoneId: string, issues: IssueDraft[], milestones: MilestoneData[]) => {
    setPushGoalId(goalId);
    setPushMilestoneId(milestoneId);
    setPushIssues(issues);
    setPushMilestones(milestones);
    setPushModalVisible(true);
  }, []);

  return (
    <>
      <header>
        <div className="logo">
          <GitHubIcon />
          <span>Copilot Agent Orchestrator</span>
        </div>
        <div className="controls">
          <button
            className="btn-icon"
            id="toggle-sidebar-btn"
            title="Toggle sessions sidebar"
            aria-label="Toggle sessions sidebar"
            onClick={handleToggleSidebar}
          >
            ☰
          </button>
          <input
            type="password"
            id="token-input"
            placeholder={tokenPlaceholder}
            value={tokenInputValue}
            spellCheck={false}
            autoComplete="off"
            onChange={e => setTokenInputValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSaveToken(); }}
          />
          <button className="btn" id="save-token-btn" title="Save token to browser" onClick={handleSaveToken}>
            Save Token
          </button>
          <select
            id="model-select"
            title="Select model"
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
          >
            {models.length === 0 ? (
              <option value="gpt-4.1">Enter token to load models</option>
            ) : (
              models.map(m => (
                <option key={m.id} value={m.id}>{m.name || m.id}</option>
              ))
            )}
          </select>
          <select
            id="reasoning-effort-select"
            title="Reasoning effort"
            value={reasoningEffort}
            onChange={e => setReasoningEffort(e.target.value as ReasoningEffort)}
            style={{ display: showReasoning ? undefined : 'none' }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="xhigh">Extended</option>
          </select>
          <button
            className="btn"
            id="view-toggle-btn"
            title={currentView === 'chat' ? 'Switch to dashboard view' : 'Switch to chat view'}
            aria-label={currentView === 'chat' ? 'Switch to dashboard view' : 'Switch to chat view'}
            onClick={handleViewToggle}
          >
            {currentView === 'chat' ? 'Dashboard' : 'Chat'}
          </button>
          <button className="btn" id="new-chat-btn" title="Start a new conversation" onClick={handleNewChat}>
            New Chat
          </button>
        </div>
      </header>

      <div id="app-body">
        <div
          id="sidebar-backdrop"
          className={sidebarOpen ? 'visible' : ''}
          onClick={() => setSidebarOpen(false)}
        />

        <Sidebar
          sessions={sessions}
          currentSessionId={sessionId}
          visible={sidebarOpen}
          onSessionSwitch={handleSessionSwitch}
          onSessionDelete={handleSessionDelete}
        />

        <ChatArea
          chatItems={chatItems}
          isStreaming={isStreaming}
          visible={currentView === 'chat'}
          onSendMessage={sendMessage}
          onStopStreaming={stopStreaming}
        />

        <Dashboard
          currentPage={currentDashboardPage}
          onPageChange={handleDashboardPageChange}
          visible={currentView === 'dashboard'}
          token={token}
          onOpenPushModal={handleOpenPushModal}
        />
      </div>

      <StatusBar
        statusText={statusText}
        statusConnected={statusConnected}
        toolActivity={toolActivity}
        toolActivityVisible={toolActivityVisible}
        agentStatus={agentStatus}
        agentStatusVisible={agentStatusVisible}
        usageText={usageText}
        usageVisible={usageVisible}
        quotaText={quotaText}
        quotaVisible={quotaVisible}
      />

      <PushModal
        visible={pushModalVisible}
        onClose={() => setPushModalVisible(false)}
        token={token}
        goalId={pushGoalId}
        milestoneId={pushMilestoneId}
        issues={pushIssues}
        milestones={pushMilestones}
      />
    </>
  );
}
