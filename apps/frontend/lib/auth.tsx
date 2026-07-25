"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setAccessToken } from "./api";

export interface User {
  id: string;
  email: string;
  name: string | null;
  leetcodeUsername: string | null;
  /** Whether a LeetCode session is on file. The credential itself is never
   *  returned by the API, so only its presence is known here. */
  hasLeetcodeSession?: boolean;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface AuthResponse {
  user: User;
  accessToken: string;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Attempt to restore a session on mount.
    api<{ user: User }>("/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const handleAuth = (res: AuthResponse) => {
    setAccessToken(res.accessToken);
    setUser(res.user);
  };

  const value: AuthState = {
    user,
    loading,
    async login(email, password) {
      handleAuth(await api<AuthResponse>("/auth/login", { method: "POST", json: { email, password }, auth: false }));
    },
    async register(email, password, name) {
      handleAuth(
        await api<AuthResponse>("/auth/register", { method: "POST", json: { email, password, name }, auth: false }),
      );
    },
    async logout() {
      await api("/auth/logout", { method: "POST", auth: false }).catch(() => {});
      setAccessToken(null);
      setUser(null);
    },
    async refreshUser() {
      const r = await api<{ user: User }>("/auth/me");
      setUser(r.user);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
