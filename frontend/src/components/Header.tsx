import { useState, useCallback, useEffect } from "react";
import type { ModelInfo, ViewType } from "../types.ts";
import { EFFORT_LABELS } from "../types.ts";

interface HeaderProps {
  token: string;
  onSaveToken: (token: string) => void;
  onClearToken: () => void;
  models: ModelInfo[];
  modelData: Record<string, ModelInfo>;
  selectedModel: string;
  onModelChange: (model: string) => void;
  isLoadingModels: boolean;
  currentView: ViewType;
  onViewToggle: () => void;
  onNewChat: () => void;
  onToggleSidebar: () => void;
  reasoningEffort: string;
  onReasoningEffortChange: (effort: string) => void;
}

export function Header({
  token,
  onSaveToken,
  onClearToken,
  models,
  modelData,
  selectedModel,
  onModelChange,
  isLoadingModels,
  currentView,
  onViewToggle,
  onNewChat,
  onToggleSidebar,
  reasoningEffort,
  onReasoningEffortChange,
}: HeaderProps) {
  const [tokenValue, setTokenValue] = useState("");

  const handleSaveToken = useCallback(() => {
    if (token) {
      onClearToken();
    } else {
      const val = tokenValue.trim();
      if (!val) return;
      onSaveToken(val);
      setTokenValue("");
    }
  }, [token, tokenValue, onSaveToken, onClearToken]);

  const currentModelInfo = modelData[selectedModel];
  const supportsReasoning =
    currentModelInfo?.capabilities?.supports?.reasoningEffort === true;

  const efforts =
    Array.isArray(currentModelInfo?.supportedReasoningEfforts) &&
    currentModelInfo.supportedReasoningEfforts.length > 0
      ? currentModelInfo.supportedReasoningEfforts
      : ["low", "medium", "high", "xhigh"];

  // Reset reasoning effort when model changes
  useEffect(() => {
    if (supportsReasoning && currentModelInfo?.defaultReasoningEffort) {
      onReasoningEffortChange(currentModelInfo.defaultReasoningEffort);
    }
  }, [selectedModel, supportsReasoning, currentModelInfo?.defaultReasoningEffort, onReasoningEffortChange]);

  return (
    <header role="banner">
      <div className="logo">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
        </svg>
        Copilot Agent Orchestrator
      </div>
      <div className="controls">
        <button
          className="btn-icon"
          id="toggle-sidebar-btn"
          title="Toggle sessions sidebar"
          aria-label="Toggle sessions sidebar"
          onClick={onToggleSidebar}
        >
          ☰
        </button>
        <input
          type="password"
          id="token-input"
          placeholder={
            token
              ? "Token saved ✓  (click Save to clear)"
              : "GitHub token (ghp_... or github_pat_...)"
          }
          spellCheck={false}
          autoComplete="off"
          value={token ? "" : tokenValue}
          onChange={(e) => setTokenValue(e.target.value)}
          readOnly={!!token}
        />
        <button
          className="btn"
          id="save-token-btn"
          title="Save token to browser"
          onClick={handleSaveToken}
        >
          {token ? "Clear Token" : "Save Token"}
        </button>
        <select
          id="model-select"
          title="Select model"
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
        >
          {isLoadingModels ? (
            <option value="gpt-4.1">Loading models...</option>
          ) : models.length === 0 ? (
            <option value="gpt-4.1">Enter token to load models</option>
          ) : (
            models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))
          )}
        </select>
        {supportsReasoning && (
          <select
            id="reasoning-effort-select"
            title="Reasoning effort"
            value={reasoningEffort}
            onChange={(e) => onReasoningEffortChange(e.target.value)}
          >
            {efforts.map((effort) => (
              <option key={effort} value={effort}>
                {EFFORT_LABELS[effort] ??
                  effort.charAt(0).toUpperCase() + effort.slice(1)}
              </option>
            ))}
          </select>
        )}
        <button
          className="btn"
          id="view-toggle-btn"
          title={
            currentView === "chat"
              ? "Switch to dashboard view"
              : "Switch to chat view"
          }
          aria-label={
            currentView === "chat"
              ? "Switch to dashboard view"
              : "Switch to chat view"
          }
          onClick={onViewToggle}
        >
          {currentView === "chat" ? "Dashboard" : "Chat"}
        </button>
        <button
          className="btn"
          id="new-chat-btn"
          title="Start a new conversation"
          onClick={onNewChat}
        >
          New Chat
        </button>
      </div>
    </header>
  );
}
