"use client";

import { useEffect, useState } from "react";
import { useMemberAuth } from "../../../context/MemberAuthContext";
import memberApi from "../../../lib/memberApi";

export default function MemberRegisterPage() {
  const { register } = useMemberAuth();
  const [counties, setCounties] = useState([]);
  const [cooperatives, setCooperatives] = useState([]);
  const [form, setForm] = useState({
    countyId: "",
    cooperativeId: "",
    nationalId: "",
    phoneNumber: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    memberApi.get("/counties").then((res) => setCounties(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.countyId) {
      setCooperatives([]);
      return;
    }
    memberApi
      .get("/member-auth/cooperatives", { params: { countyId: form.countyId } })
      .then((res) => setCooperatives(res.data))
      .catch(() => {});
  }, [form.countyId]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await register({
        cooperativeId: form.cooperativeId,
        nationalId: form.nationalId,
        phoneNumber: form.phoneNumber,
        email: form.email || undefined,
        password: form.password,
      });
    } catch (err) {
      setError(err?.response?.data?.error || "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-kenya-green/5 px-4 py-8">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-xl font-bold text-kenya-black">Register as a Member</h1>
        <p className="mb-6 text-sm text-gray-500">
          We&apos;ll match your National ID against your cooperative&apos;s membership records.
          If you&apos;re not found, ask your Cooperative Manager to confirm your registration first.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <select required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.countyId} onChange={(e) => setForm({ ...form, countyId: e.target.value, cooperativeId: "" })}>
            <option value="">Select your county…</option>
            {counties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select required disabled={!form.countyId} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
            value={form.cooperativeId} onChange={(e) => setForm({ ...form, cooperativeId: e.target.value })}>
            <option value="">Select your cooperative…</option>
            {cooperatives.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <input required placeholder="National ID Number" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} />

          <input required placeholder="Phone Number" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} />

          <input type="email" placeholder="Email (optional)" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

          <input required type="password" placeholder="Create a password (min 8 characters)" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={submitting}
            className="w-full rounded-md bg-kenya-green px-4 py-2 text-sm font-semibold text-white hover:bg-kenya-green/90 disabled:opacity-50">
            {submitting ? "Verifying…" : "Register"}
          </button>
        </form>

        <a href="/member/login" className="mt-4 block text-center text-xs text-gray-500 hover:underline">
          Already registered? Sign in
        </a>
      </div>
    </div>
  );
}
