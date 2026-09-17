"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import memberApi from "../lib/memberApi";

const MemberAuthContext = createContext(null);

export function MemberAuthProvider({ children }) {
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("embu_member_profile") : null;
    if (stored) {
      try {
        setMember(JSON.parse(stored));
      } catch {
        // ignore parse errors
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(
    async (nationalId, password) => {
      const { data } = await memberApi.post("/member-auth/login", { nationalId, password });
      window.localStorage.setItem("embu_member_token", data.token);
      window.localStorage.setItem("embu_member_profile", JSON.stringify(data.member));
      setMember(data.member);
      router.push("/member/dashboard");
    },
    [router]
  );

  const register = useCallback(
    async (form) => {
      const { data } = await memberApi.post("/member-auth/register", form);
      window.localStorage.setItem("embu_member_token", data.token);
      window.localStorage.setItem("embu_member_profile", JSON.stringify(data.member));
      setMember(data.member);
      router.push("/member/dashboard");
    },
    [router]
  );

  const logout = useCallback(() => {
    window.localStorage.removeItem("embu_member_token");
    window.localStorage.removeItem("embu_member_profile");
    setMember(null);
    router.push("/member/login");
  }, [router]);

  return (
    <MemberAuthContext.Provider value={{ member, loading, login, register, logout }}>
      {children}
    </MemberAuthContext.Provider>
  );
}

export function useMemberAuth() {
  const ctx = useContext(MemberAuthContext);
  if (!ctx) throw new Error("useMemberAuth must be used within MemberAuthProvider");
  return ctx;
}
