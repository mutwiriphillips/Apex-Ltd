"use client";

import { useState } from "react";
import { useMemberAuth } from "../../../context/MemberAuthContext";

export default function MemberLoginPage() {
  const { login } = useMemberAuth();
  const [nationalId, setNationalId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(nationalId, password);
    } catch (err) {
      setError(err?.response?.data?.error || "Login failed. Check your National ID and password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-kenya-green/5 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-xl font-bold text-kenya-black">Member Portal</h1>
        <p className="mb-6 text-sm text-gray-500">Sign in with your National ID.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">National ID Number</label>
            <input
              required
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-kenya-green focus:outline-none"
              placeholder="e.g. 12345678"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-kenya-green focus:outline-none"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-kenya-green px-4 py-2 text-sm font-semibold text-white hover:bg-kenya-green/90 disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <a href="/member/register" className="mt-4 block text-center text-xs text-gray-500 hover:underline">
          New here? Register with your National ID
        </a>
        <a href="/login" className="mt-2 block text-center text-xs text-gray-400 hover:underline">
          County staff login
        </a>
      </div>
    </div>
  );
}
