export function getToken(): string {
  return localStorage.getItem("copilot_github_token") || "";
}

export function saveToken(token: string): void {
  if (token) {
    localStorage.setItem("copilot_github_token", token);
  } else {
    localStorage.removeItem("copilot_github_token");
  }
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = "Bearer " + token;
  }
  return headers;
}

export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      ...authHeaders(),
      ...options?.headers,
    },
  });
}

export async function apiJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await apiFetch(url, options);
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return res.json();
}
