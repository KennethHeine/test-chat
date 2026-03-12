import { useState, useCallback, useEffect } from "react";
import { Header } from "./components/Header.tsx";
import { SessionSidebar } from "./components/SessionSidebar.tsx";
import { ChatArea } from "./components/ChatArea.tsx";
import { StatusBar } from "./components/StatusBar.tsx";
import { DashboardView } from "./components/Dashboard/DashboardView.tsx";
import { useAuth } from "./hooks/useAuth.ts";
import { useModels } from "./hooks/useModels.ts";
import { useChat } from "./hooks/useChat.ts";
import { useSessions } from "./hooks/useSessions.ts";
import { useQuota } from "./hooks/useQuota.ts";
import { loadSavedSessions } from "./utils/sessions.ts";
import type { ViewType } from "./types.ts";

export function App() {
  const { token, saveToken, clearToken } = useAuth();
  const {
    models,
    modelData,
    selectedModel,
    setSelectedModel,
    isLoading: isLoadingModels,
    loadModels,
  } = useModels();
  const {
    sessionId,
    messages,
    isStreaming,
    toolActivity,
    agentStatus,
    usage,
    userInputRequest,
    sendMessage,
    abortChat,
    submitUserInput,
    newChat,
    loadSession,
    switchModel,
  } = useChat();
  const { sessions, refresh: refreshSessions, deleteSession } =
    useSessions(token);
  const { quota, loadQuota } = useQuota();

  const [currentView, setCurrentView] = useState<ViewType>(() => {
    const saved = localStorage.getItem("copilot_current_view");
    return saved === "dashboard" ? "dashboard" : "chat";
  });
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem("copilot_sidebar_open");
    return saved !== "false";
  });
  const [reasoningEffort, setReasoningEffort] = useState("");

  // Load models and sessions on token change
  useEffect(() => {
    if (token) {
      loadModels();
      loadQuota();
    }
  }, [token, loadModels, loadQuota]);

  // Refresh sessions after messages change (new chat, new messages)
  useEffect(() => {
    refreshSessions();
  }, [messages, refreshSessions]);

  // Restore last session on mount
  useEffect(() => {
    const lastId = localStorage.getItem("copilot_last_session");
    if (!lastId) return;
    const saved = loadSavedSessions();
    const target = saved.find((s) => s.id === lastId);
    if (target && target.messages && target.messages.length > 0) {
      loadSession(lastId);
    }
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSendMessage = useCallback(
    (text: string) => {
      const effort =
        modelData[selectedModel]?.capabilities?.supports?.reasoningEffort
          ? reasoningEffort
          : undefined;
      sendMessage(text, selectedModel, effort);
    },
    [sendMessage, selectedModel, reasoningEffort, modelData],
  );

  const handleModelChange = useCallback(
    (model: string) => {
      setSelectedModel(model);
      switchModel(model);
    },
    [setSelectedModel, switchModel],
  );

  const handleViewToggle = useCallback(() => {
    const newView: ViewType =
      currentView === "chat" ? "dashboard" : "chat";
    setCurrentView(newView);
    localStorage.setItem("copilot_current_view", newView);
  }, [currentView]);

  const handleToggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => {
      const next = !prev;
      localStorage.setItem("copilot_sidebar_open", String(next));
      return next;
    });
  }, []);

  const handleNewChat = useCallback(() => {
    newChat();
    setCurrentView("chat");
    localStorage.setItem("copilot_current_view", "chat");
  }, [newChat]);

  const handleSelectSession = useCallback(
    (sid: string) => {
      loadSession(sid);
      setCurrentView("chat");
      localStorage.setItem("copilot_current_view", "chat");
    },
    [loadSession],
  );

  const handleDeleteSession = useCallback(
    (sid: string) => {
      deleteSession(sid);
    },
    [deleteSession],
  );

  return (
    <>
      <Header
        token={token}
        onSaveToken={saveToken}
        onClearToken={clearToken}
        models={models}
        modelData={modelData}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
        isLoadingModels={isLoadingModels}
        currentView={currentView}
        onViewToggle={handleViewToggle}
        onNewChat={handleNewChat}
        onToggleSidebar={handleToggleSidebar}
        reasoningEffort={reasoningEffort}
        onReasoningEffortChange={setReasoningEffort}
      />
      <div id="app-body">
        <div
          id="sidebar-backdrop"
          style={{ display: sidebarOpen ? undefined : "none" }}
          onClick={() => setSidebarOpen(false)}
        />
        <SessionSidebar
          sessions={sessions}
          currentSessionId={sessionId}
          isOpen={sidebarOpen}
          onSelectSession={handleSelectSession}
          onDeleteSession={handleDeleteSession}
        />
        <ChatArea
          messages={messages}
          isStreaming={isStreaming}
          onSendMessage={handleSendMessage}
          onAbort={abortChat}
          userInputRequest={userInputRequest}
          onSubmitUserInput={submitUserInput}
          visible={currentView === "chat"}
        />
        <DashboardView
          token={token}
          visible={currentView === "dashboard"}
        />
      </div>
      <StatusBar
        token={token}
        toolActivity={toolActivity}
        agentStatus={agentStatus}
        usage={usage}
        quota={quota}
      />
    </>
  );
}
