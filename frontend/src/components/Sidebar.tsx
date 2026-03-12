import { formatSessionDate } from '../utils/api';

interface SessionData {
  id: string;
  title: string;
  timestamp: number;
}

interface SidebarProps {
  sessions: SessionData[];
  currentSessionId: string;
  visible: boolean;
  onSessionSwitch: (id: string) => void;
  onSessionDelete: (id: string) => void;
}

export default function Sidebar({ sessions, currentSessionId, visible, onSessionSwitch, onSessionDelete }: SidebarProps) {
  return (
    <div id="session-sidebar" style={{ display: visible ? undefined : 'none' }}>
      <div id="session-sidebar-header">
        <h3>Sessions</h3>
      </div>
      <div id="session-list">
        {sessions.length === 0 ? (
          <div className="session-empty">No sessions yet.<br />Start a conversation!</div>
        ) : (
          sessions.map(s => (
            <div
              key={s.id}
              className={`session-item${s.id === currentSessionId ? ' active' : ''}`}
              onClick={() => onSessionSwitch(s.id)}
            >
              <div className="session-item-text">{s.title}</div>
              <div className="session-item-meta">
                <span className="session-item-date">{formatSessionDate(s.timestamp)}</span>
                <button
                  className="session-item-delete"
                  title="Delete session"
                  onClick={e => { e.stopPropagation(); onSessionDelete(s.id); }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
