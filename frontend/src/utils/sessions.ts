import type { Session, Message } from "../types.ts";

const STORAGE_KEY = "copilot_sessions";

export function loadSavedSessions(): Session[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: Session[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

export function saveSessionMessages(
  sessionId: string,
  messages: Message[],
  title?: string,
): void {
  const sessions = loadSavedSessions();
  const existing = sessions.find((s) => s.id === sessionId);

  if (!existing && messages.length === 0) return;

  if (existing) {
    existing.messages = messages;
    existing.updatedAt = new Date().toISOString();
    if (title) existing.title = title;
  } else {
    sessions.unshift({
      id: sessionId,
      title: title || messages[0]?.text?.slice(0, 80) || "New Chat",
      messages,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  saveSessions(sessions);
}

export function deleteSavedSession(sid: string): void {
  let sessions = loadSavedSessions();
  sessions = sessions.filter((s) => s.id !== sid);
  saveSessions(sessions);
}

export function formatSessionDate(date: string | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}
