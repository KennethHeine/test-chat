import { useState, useCallback, useEffect } from "react";
import { apiFetch } from "../utils/api.ts";
import {
  loadSavedSessions,
  saveSessions,
  deleteSavedSession as deleteFromStorage,
} from "../utils/sessions.ts";
import type { Session } from "../types.ts";

export function useSessions(token: string) {
  const [sessions, setSessions] = useState<Session[]>(loadSavedSessions);

  const refresh = useCallback(() => {
    setSessions(loadSavedSessions());
  }, []);

  const deleteSession = useCallback(
    async (sid: string) => {
      deleteFromStorage(sid);
      setSessions((prev) => prev.filter((s) => s.id !== sid));
      // Fire-and-forget backend delete
      try {
        await apiFetch(`/api/sessions/${encodeURIComponent(sid)}`, {
          method: "DELETE",
        });
      } catch {
        // ignore
      }
    },
    [],
  );

  const loadFromBackend = useCallback(async () => {
    try {
      const res = await apiFetch("/api/sessions");
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data.sessions)) return;

      const localSessions = loadSavedSessions();
      const localMap = new Map(localSessions.map((s) => [s.id, s]));

      let changed = false;
      for (const remote of data.sessions) {
        const local = localMap.get(remote.id);
        if (!local) {
          const msgRes = await apiFetch(
            `/api/sessions/${encodeURIComponent(remote.id)}/messages`,
          );
          const msgData = msgRes.ok
            ? await msgRes.json()
            : { messages: [] };
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
          local.title = remote.title;
          local.model = remote.model;
          local.updatedAt = remote.updatedAt;
          changed = true;
        }
      }

      if (changed) {
        const merged = Array.from(localMap.values());
        merged.sort(
          (a, b) =>
            new Date(b.updatedAt || 0).getTime() -
            new Date(a.updatedAt || 0).getTime(),
        );
        saveSessions(merged);
        setSessions(merged);
      }
    } catch (err) {
      console.warn("Failed to load sessions from backend:", err);
    }
  }, []);

  // Reload sessions when token changes
  useEffect(() => {
    refresh();
    if (token) {
      loadFromBackend();
    }
  }, [token, refresh, loadFromBackend]);

  return { sessions, refresh, deleteSession, loadFromBackend };
}
