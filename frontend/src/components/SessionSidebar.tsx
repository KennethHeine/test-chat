import type { Session } from "../types.ts";
import { formatSessionDate } from "../utils/sessions.ts";

interface SessionSidebarProps {
  sessions: Session[];
  currentSessionId: string | null;
  isOpen: boolean;
  onSelectSession: (sid: string) => void;
  onDeleteSession: (sid: string) => void;
}

export function SessionSidebar({
  sessions,
  currentSessionId,
  isOpen,
  onSelectSession,
  onDeleteSession,
}: SessionSidebarProps) {
  return (
    <div
      id="session-sidebar"
      style={{ display: isOpen ? undefined : "none" }}
    >
      <div id="session-sidebar-header">
        <strong>Sessions</strong>
      </div>
      <div id="session-list">
        {sessions.length === 0 ? (
          <div className="session-empty">
            No sessions yet.
            <br />
            Start a conversation!
          </div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              className={
                "session-item" +
                (s.id === currentSessionId ? " active" : "")
              }
              data-session-id={s.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectSession(s.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectSession(s.id);
                }
              }}
            >
              <div className="session-item-text">
                {s.title || "New Chat"}
              </div>
              <div className="session-item-meta">
                {formatSessionDate(s.updatedAt || s.createdAt)}
              </div>
              <button
                className="session-item-delete"
                title="Delete session"
                aria-label={`Delete session: ${s.title || "New Chat"}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(s.id);
                }}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
