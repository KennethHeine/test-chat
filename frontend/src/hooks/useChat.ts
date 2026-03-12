import { useState, useCallback, useRef } from "react";
import { apiFetch, authHeaders } from "../utils/api.ts";
import {
  saveSessionMessages,
  loadSavedSessions,
  saveSessions,
} from "../utils/sessions.ts";
import type { Message, SSEEvent, UsageInfo } from "../types.ts";

export interface UserInputRequest {
  requestId: string;
  question: string;
  choices?: string[];
  allowFreeform?: boolean;
}

export interface ToolActivity {
  visible: boolean;
  name: string;
}

export interface AgentStatus {
  visible: boolean;
  text: string;
}

export function useChat() {
  const [sessionId, setSessionId] = useState<string | null>(
    () => localStorage.getItem("copilot_last_session"),
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolActivity, setToolActivity] = useState<ToolActivity>({
    visible: false,
    name: "",
  });
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({
    visible: false,
    text: "",
  });
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [userInputRequest, setUserInputRequest] =
    useState<UserInputRequest | null>(null);
  const activeSubagentCountRef = useRef(0);
  const sessionIdRef = useRef(sessionId);

  const formatToolName = (name: string) =>
    name
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const handleAgentStatusEvent = useCallback((event: SSEEvent) => {
    if (event.type === "planning_start") {
      setAgentStatus({ visible: true, text: "🗺️ Planning..." });
    } else if (event.type === "plan_ready") {
      setAgentStatus({ visible: true, text: "✅ Plan ready" });
      setTimeout(() => setAgentStatus({ visible: false, text: "" }), 3000);
    } else if (event.type === "intent") {
      const activity = event.activity || event.text || "";
      if (activity) {
        setAgentStatus({ visible: true, text: `💡 ${activity}` });
      }
    } else if (event.type === "subagent_start") {
      activeSubagentCountRef.current += 1;
      const name = event.name || "sub-agent";
      setAgentStatus({
        visible: true,
        text: `🤖 ${name} (${activeSubagentCountRef.current} active)`,
      });
    } else if (event.type === "subagent_end") {
      activeSubagentCountRef.current = Math.max(
        0,
        activeSubagentCountRef.current - 1,
      );
      if (activeSubagentCountRef.current === 0) {
        setAgentStatus({ visible: false, text: "" });
      } else {
        setAgentStatus({
          visible: true,
          text: `🤖 ${activeSubagentCountRef.current} sub-agent(s) active`,
        });
      }
    } else if (event.type === "compaction") {
      if (event.text === "started" || event.content === "started") {
        setAgentStatus({
          visible: true,
          text: "🔄 Optimizing context...",
        });
      } else {
        setAgentStatus({ visible: false, text: "" });
      }
    }
  }, []);

  const sendMessage = useCallback(
    async (
      text: string,
      model: string,
      reasoningEffort?: string,
    ) => {
      if (!text.trim() || isStreaming) return;

      const userMsg: Message = { role: "user", text: text.trim() };
      setMessages((prev) => [...prev, userMsg]);

      const assistantPlaceholder: Message = { role: "assistant", text: "" };
      setMessages((prev) => [...prev, assistantPlaceholder]);

      setIsStreaming(true);
      setUsage(null);

      let fullContent = "";
      let newSessionId = sessionIdRef.current;

      try {
        const chatPayload: Record<string, unknown> = {
          message: text.trim(),
          sessionId: sessionIdRef.current,
          model,
        };
        if (reasoningEffort) {
          chatPayload.reasoningEffort = reasoningEffort;
        }

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeaders(),
          },
          body: JSON.stringify(chatPayload),
        });

        if (!response.ok) {
          const err = await response
            .json()
            .catch(() => ({ error: "Request failed" }));
          throw new Error(err.error || `HTTP ${response.status}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

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
              const event: SSEEvent = JSON.parse(jsonStr);

              if (event.type === "delta" && event.content) {
                fullContent += event.content;
                const currentContent = fullContent;
                setMessages((prev) => {
                  const updated = [...prev];
                  const last = updated[updated.length - 1];
                  if (last && last.role === "assistant") {
                    updated[updated.length - 1] = {
                      ...last,
                      text: currentContent,
                    };
                  }
                  return updated;
                });
              } else if (event.type === "tool_start") {
                setToolActivity({
                  visible: true,
                  name: formatToolName(event.tool || ""),
                });
              } else if (event.type === "tool_complete") {
                setToolActivity({ visible: false, name: "" });
              } else if (event.type === "title" && event.title) {
                if (newSessionId) {
                  const sessions = loadSavedSessions();
                  const target = sessions.find(
                    (s) => s.id === newSessionId,
                  );
                  if (target) {
                    target.title = event.title;
                    saveSessions(sessions);
                  }
                }
              } else if (event.type === "usage") {
                setUsage(event.usage || null);
              } else if (
                event.type === "planning_start" ||
                event.type === "plan_ready" ||
                event.type === "intent" ||
                event.type === "subagent_start" ||
                event.type === "subagent_end" ||
                event.type === "compaction"
              ) {
                handleAgentStatusEvent(event);
              } else if (event.type === "user_input_request") {
                setUserInputRequest({
                  requestId: event.requestId || "",
                  question: event.question || "",
                  choices: event.choices,
                  allowFreeform: event.allowFreeform,
                });
              } else if (event.type === "done") {
                newSessionId = event.sessionId || null;
                if (newSessionId) {
                  localStorage.setItem(
                    "copilot_last_session",
                    newSessionId,
                  );
                  sessionIdRef.current = newSessionId;
                  setSessionId(newSessionId);
                }
              } else if (event.type === "error") {
                setMessages((prev) => [
                  ...prev,
                  { role: "error", text: event.message || "Unknown error" },
                ]);
              }
            } catch {
              // skip malformed JSON
            }
          }
        }

        // Save messages after streaming completes
        if (newSessionId) {
          const finalMessages: Message[] = [];
          // Rebuild the messages for persistence including the full content
          setMessages((prev) => {
            for (const m of prev) {
              if (m.role !== "error") {
                finalMessages.push(m);
              }
            }
            return prev;
          });
          if (finalMessages.length > 0) {
            saveSessionMessages(newSessionId, finalMessages);
            persistMessagesToBackend(newSessionId, finalMessages);
          }
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setMessages((prev) => {
          const updated = [...prev];
          // Remove empty assistant placeholder
          if (
            updated.length > 0 &&
            updated[updated.length - 1].role === "assistant" &&
            !updated[updated.length - 1].text
          ) {
            updated.pop();
          }
          return [
            ...updated,
            { role: "error", text: errorMessage },
          ];
        });
      } finally {
        setIsStreaming(false);
        setToolActivity({ visible: false, name: "" });
        setAgentStatus({ visible: false, text: "" });
        activeSubagentCountRef.current = 0;
      }
    },
    [isStreaming, handleAgentStatusEvent],
  );

  const abortChat = useCallback(async () => {
    if (!isStreaming || !sessionIdRef.current) return;
    try {
      await apiFetch("/api/chat/abort", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      });
    } catch (err) {
      console.warn("Failed to abort chat:", err);
    }
  }, [isStreaming]);

  const submitUserInput = useCallback(
    async (requestId: string, answer: string, wasFreeform: boolean) => {
      try {
        await apiFetch("/api/chat/input", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId, answer, wasFreeform }),
        });
        setUserInputRequest(null);
      } catch (err) {
        console.warn("Failed to submit user input:", err);
      }
    },
    [],
  );

  const newChat = useCallback(() => {
    // Save current session before clearing
    if (sessionIdRef.current) {
      setMessages((prev) => {
        const msgs = prev.filter((m) => m.role !== "error");
        if (msgs.length > 0) {
          saveSessionMessages(sessionIdRef.current!, msgs);
          persistMessagesToBackend(sessionIdRef.current!, msgs);
        }
        return prev;
      });
    }
    sessionIdRef.current = null;
    setSessionId(null);
    setMessages([]);
    setUsage(null);
    localStorage.removeItem("copilot_last_session");
  }, []);

  const loadSession = useCallback(
    (sid: string) => {
      const sessions = loadSavedSessions();
      const target = sessions.find((s) => s.id === sid);
      if (!target) return;

      // Save current session
      if (sessionIdRef.current && sessionIdRef.current !== sid) {
        setMessages((prev) => {
          const msgs = prev.filter((m) => m.role !== "error");
          if (msgs.length > 0) {
            saveSessionMessages(sessionIdRef.current!, msgs);
          }
          return prev;
        });
      }

      sessionIdRef.current = sid;
      setSessionId(sid);
      setMessages(target.messages || []);
      localStorage.setItem("copilot_last_session", sid);
    },
    [],
  );

  const switchModel = useCallback(
    async (model: string) => {
      if (!sessionIdRef.current || isStreaming) return;
      try {
        const res = await apiFetch("/api/chat/model", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            model,
          }),
        });
        if (res.ok) {
          const sessions = loadSavedSessions();
          const target = sessions.find(
            (s) => s.id === sessionIdRef.current,
          );
          if (target) {
            target.model = model;
            saveSessions(sessions);
          }
        }
      } catch (err) {
        console.warn("Failed to switch model:", err);
      }
    },
    [isStreaming],
  );

  return {
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
  };
}

async function persistMessagesToBackend(
  sid: string,
  messages: Message[],
): Promise<void> {
  try {
    await apiFetch(`/api/sessions/${encodeURIComponent(sid)}/messages`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });
  } catch (err) {
    console.warn("Failed to persist messages to backend:", err);
  }
}
