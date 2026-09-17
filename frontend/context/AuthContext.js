"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("embu_user") : null;
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        // ignore parse errors
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(
    async (email, password) => {
      const { data } = await api.post("/auth/login", { email, password });
      window.localStorage.setItem("embu_token", data.token);
      window.localStorage.setItem("embu_user", JSON.stringify(data.user));
      setUser(data.user);
      router.push("/dashboard");
    },
    [router]
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem("embu_token");
    window.localStorage.removeItem("embu_user");
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
