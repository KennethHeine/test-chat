import { useState, useEffect, useCallback } from "react";
import type { UsageInfo, QuotaInfo } from "../types.ts";
import type { ToolActivity, AgentStatus } from "../hooks/useChat.ts";

interface StatusBarProps {
  token: string;
  toolActivity: ToolActivity;
  agentStatus: AgentStatus;
  usage: UsageInfo | null;
  quota: QuotaInfo | null;
}

export function StatusBar({
  token,
  toolActivity,
  agentStatus,
  usage,
  quota,
}: StatusBarProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Checking connection...");

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      const data = await res.json();
      if (data.status === "ok") {
        setIsConnected(true);
        const parts: string[] = [];
        if (data.clients?.connected > 0)
          parts.push(`${data.clients.connected} client(s)`);
        if (token) parts.push("Token set");
        setStatusMessage(
          parts.length ? parts.join(" · ") : "Connected",
        );
      } else {
        setIsConnected(false);
        setStatusMessage("Server error");
      }
    } catch {
      setIsConnected(false);
      setStatusMessage("Cannot reach server");
    }
  }, [token]);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  const usageParts: string[] = [];
  if (usage?.inputTokens) usageParts.push(`In: ${usage.inputTokens}`);
  if (usage?.outputTokens)
    usageParts.push(`Out: ${usage.outputTokens}`);
  if (usage?.totalTokens)
    usageParts.push(`Total: ${usage.totalTokens}`);

  const quotaParts: string[] = [];
  if (quota?.premiumRequestsRemaining !== undefined) {
    quotaParts.push(
      `Premium: ${quota.premiumRequestsRemaining}/${quota.premiumRequestsLimit || "∞"}`,
    );
  }

  return (
    <div id="status-bar">
      <span
        className={`status-dot${isConnected ? "" : " disconnected"}`}
        id="status-dot"
      />
      <span id="status-text">{statusMessage}</span>
      <span
        id="tool-activity"
        style={{
          display: toolActivity.visible ? "inline" : "none",
          marginLeft: "auto",
          color: "var(--color-accent)",
        }}
      >
        <span id="tool-activity-text">
          🔧 {toolActivity.name}...
        </span>
      </span>
      <span
        id="agent-status"
        style={{
          display: agentStatus.visible ? "inline" : "none",
          marginLeft: "8px",
          color: "var(--color-text-muted)",
          fontSize: "11px",
        }}
      >
        <span id="agent-status-text">{agentStatus.text}</span>
      </span>
      <span
        id="usage-display"
        style={{
          display: usageParts.length > 0 ? "inline" : "none",
          marginLeft: "12px",
          color: "var(--color-text-muted)",
          fontSize: "11px",
        }}
      >
        <span id="usage-text">
          Tokens — {usageParts.join(" · ")}
        </span>
      </span>
      <span
        id="quota-display"
        style={{
          display: quotaParts.length > 0 ? "inline" : "none",
          marginLeft: "12px",
          color: "var(--color-text-muted)",
          fontSize: "11px",
        }}
      >
        <span id="quota-text">
          Quota — {quotaParts.join(" · ")}
        </span>
      </span>
    </div>
  );
}
