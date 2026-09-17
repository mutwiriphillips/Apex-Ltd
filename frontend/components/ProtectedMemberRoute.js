"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMemberAuth } from "../context/MemberAuthContext";

export default function ProtectedMemberRoute({ children }) {
  const { member, loading } = useMemberAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !member) router.replace("/member/login");
  }, [member, loading, router]);

  if (loading || !member) {
    return <div className="flex h-screen items-center justify-center text-gray-500">Loading…</div>;
  }

  return <>{children}</>;
}
