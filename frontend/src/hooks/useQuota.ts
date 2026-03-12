import { useState, useCallback } from "react";
import { apiFetch } from "../utils/api.ts";
import type { QuotaInfo } from "../types.ts";

export function useQuota() {
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  const loadQuota = useCallback(async () => {
    setQuota(null);
    try {
      const res = await apiFetch("/api/quota");
      if (!res.ok) return;
      const data = await res.json();
      if (data.quota) {
        setQuota(data.quota);
      }
    } catch (err) {
      console.warn("Failed to load quota:", err);
    }
  }, []);

  return { quota, loadQuota };
}
