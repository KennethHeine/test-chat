import { useState, useCallback } from "react";
import { getToken, saveToken as saveTokenUtil } from "../utils/api.ts";

export function useAuth() {
  const [token, setTokenState] = useState(getToken);

  const saveTokenAction = useCallback((newToken: string) => {
    saveTokenUtil(newToken);
    setTokenState(newToken);
  }, []);

  const clearToken = useCallback(() => {
    saveTokenUtil("");
    setTokenState("");
  }, []);

  return { token, saveToken: saveTokenAction, clearToken };
}
