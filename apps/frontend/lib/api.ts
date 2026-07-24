const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (typeof window !== "undefined") {
    if (token) localStorage.setItem("accessToken", token);
    else localStorage.removeItem("accessToken");
  }
}

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  if (typeof window !== "undefined") {
    accessToken = localStorage.getItem("accessToken");
  }
  return accessToken;
}

export { API_URL };

interface ApiOptions extends RequestInit {
  auth?: boolean;
  json?: unknown;
}

/** Thin fetch wrapper: attaches the bearer token and transparently refreshes on 401. */
export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { auth = true, json, headers, ...rest } = opts;

  const doFetch = async (): Promise<Response> => {
    const h = new Headers(headers);
    if (json !== undefined) h.set("Content-Type", "application/json");
    const token = getAccessToken();
    if (auth && token) h.set("Authorization", `Bearer ${token}`);
    return fetch(`${API_URL}/api${path}`, {
      ...rest,
      headers: h,
      credentials: "include",
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  };

  let res = await doFetch();

  // Try one refresh on unauthorized.
  if (res.status === 401 && auth) {
    const refreshed = await tryRefresh();
    if (refreshed) res = await doFetch();
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? res.statusText, body.details);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { accessToken: string };
    setAccessToken(data.accessToken);
    return true;
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
