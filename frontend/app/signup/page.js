"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "../../lib/api";

// TEST-RUN ONLY page. The backend only serves these requests when
// ALLOW_OPEN_SIGNUP=true; otherwise both calls below return 403.
export default function SignupPage() {
  const router = useRouter();
  const [cooperatives, setCooperatives] = useState([]);
  const [counties, setCounties] = useState([]);
  const [disabled, setDisabled] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "FIELD_OFFICER",
    countyId: "",
    cooperativeId: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get("/counties").then((res) => setCounties(res.data)).catch(() => {});
    api
      .get("/auth/signup/cooperatives")
      .then(() => {})
      .catch(() => setDisabled(true));
  }, []);

  useEffect(() => {
    if (!form.countyId || form.role !== "COOPERATIVE_MANAGER") {
      setCooperatives([]);
      return;
    }
    api
      .get("/auth/signup/cooperatives", { params: { countyId: form.countyId } })
      .then((res) => setCooperatives(res.data))
      .catch(() => {});
  }, [form.countyId, form.role]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { data } = await api.post("/auth/signup", form);
      window.localStorage.setItem("embu_token", data.token);
      window.localStorage.setItem("embu_user", JSON.stringify(data.user));
      router.push("/dashboard");
    } catch (err) {
      setError(err?.response?.data?.error || "Signup failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (disabled) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div>
          <p className="mb-2 font-semibold">Self-signup is not enabled on this environment.</p>
          <p className="text-sm text-gray-500">Ask your Director for an account, or sign in below.</p>
          <a href="/login" className="mt-4 inline-block text-sm font-medium text-kenya-green hover:underline">
            Go to login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-kenya-green/5 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-xl font-bold text-kenya-green">Test-Run Signup</h1>
        <p className="mb-6 text-sm text-gray-500">
          Pilot access — any email accepted. Not for production use.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input required placeholder="Full name" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <input required type="email" placeholder="Any email address" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input required type="password" placeholder="Password (min 8 characters)" className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />

          <select className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value, cooperativeId: "" })}>
            <option value="FIELD_OFFICER">County Employee (Field Officer)</option>
            <option value="COOPERATIVE_MANAGER">Cooperative Manager</option>
          </select>

          <select required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.countyId} onChange={(e) => setForm({ ...form, countyId: e.target.value, cooperativeId: "" })}>
            <option value="">Select your county…</option>
            {counties.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {form.role === "COOPERATIVE_MANAGER" && (
            <select required className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={form.cooperativeId} onChange={(e) => setForm({ ...form, cooperativeId: e.target.value })}>
              <option value="">Select your cooperative…</option>
              {cooperatives.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={submitting}
            className="w-full rounded-md bg-kenya-green px-4 py-2 text-sm font-semibold text-white hover:bg-kenya-green/90 disabled:opacity-50">
            {submitting ? "Creating account…" : "Create test account"}
          </button>
        </form>

        <a href="/login" className="mt-4 block text-center text-xs text-gray-500 hover:underline">
          Already have an account? Sign in
        </a>
      </div>
    </div>
  );
}
