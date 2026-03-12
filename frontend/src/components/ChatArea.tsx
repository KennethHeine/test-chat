import { useRef, useEffect, useCallback, useState } from "react";
import type { Message } from "../types.ts";
import type { UserInputRequest } from "../hooks/useChat.ts";

interface ChatAreaProps {
  messages: Message[];
  isStreaming: boolean;
  onSendMessage: (text: string) => void;
  onAbort: () => void;
  userInputRequest: UserInputRequest | null;
  onSubmitUserInput: (
    requestId: string,
    answer: string,
    wasFreeform: boolean,
  ) => void;
  visible: boolean;
}

export function ChatArea({
  messages,
  isStreaming,
  onSendMessage,
  onAbort,
  userInputRequest,
  onSubmitUserInput,
  visible,
}: ChatAreaProps) {
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState("");

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim() || isStreaming) return;
    onSendMessage(inputValue);
    setInputValue("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [inputValue, isStreaming, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height =
        Math.min(inputRef.current.scrollHeight, 200) + "px";
    }
  }, []);

  const hasMessages = messages.length > 0;

  return (
    <div id="chat-area" style={{ display: visible ? "flex" : "none" }}>
      <div id="messages" ref={messagesRef}>
        {!hasMessages && (
          <div className="welcome" id="welcome">
            <h2>Copilot Agent Orchestrator</h2>
            <p>
              Ask Copilot to research a repository, plan coding tasks, or
              explore code.
            </p>
            <p className="welcome-hint">
              Try: "Explore the architecture of owner/repo and suggest
              improvements"
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.role !== "error" && (
              <div className="label">
                {msg.role === "user" ? "You" : "Copilot"}
              </div>
            )}
            <div className="content">{msg.text}</div>
          </div>
        ))}
        {userInputRequest && (
          <UserInputCard
            request={userInputRequest}
            onSubmit={onSubmitUserInput}
          />
        )}
      </div>
      <div id="input-area">
        <textarea
          id="message-input"
          ref={inputRef}
          placeholder="Ask Copilot to research a repo, plan tasks, or explore code..."
          rows={1}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          className="btn btn-primary"
          id="send-btn"
          onClick={handleSend}
          disabled={isStreaming}
          style={{ display: isStreaming ? "none" : "inline-block" }}
        >
          Send
        </button>
        <button
          className="btn btn-danger"
          id="stop-btn"
          style={{ display: isStreaming ? "inline-block" : "none" }}
          title="Stop the current response"
          onClick={onAbort}
        >
          Stop
        </button>
      </div>
    </div>
  );
}

interface UserInputCardProps {
  request: UserInputRequest;
  onSubmit: (
    requestId: string,
    answer: string,
    wasFreeform: boolean,
  ) => void;
}

function UserInputCard({ request, onSubmit }: UserInputCardProps) {
  const [freeformValue, setFreeformValue] = useState("");

  return (
    <div className="user-input-card">
      <div className="user-input-question">{request.question}</div>
      {request.choices && request.choices.length > 0 && (
        <div className="user-input-choices">
          {request.choices.map((choice, i) => (
            <button
              key={i}
              className="user-input-choice-btn"
              onClick={() =>
                onSubmit(request.requestId, choice, false)
              }
            >
              {choice}
            </button>
          ))}
        </div>
      )}
      {request.allowFreeform && (
        <div className="user-input-freeform">
          <input
            type="text"
            className="user-input-freeform-input"
            placeholder="Type your answer..."
            value={freeformValue}
            onChange={(e) => setFreeformValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && freeformValue.trim()) {
                onSubmit(request.requestId, freeformValue.trim(), true);
              }
            }}
          />
          <button
            className="user-input-freeform-submit"
            onClick={() => {
              if (freeformValue.trim()) {
                onSubmit(
                  request.requestId,
                  freeformValue.trim(),
                  true,
                );
              }
            }}
          >
            Submit
          </button>
        </div>
      )}
    </div>
  );
}
