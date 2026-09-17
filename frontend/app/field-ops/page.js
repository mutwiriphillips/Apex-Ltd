"use client";

import { useEffect, useState } from "react";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useAuth } from "../../context/AuthContext";
import api from "../../lib/api";

export default function FieldOpsPage() {
  const { user } = useAuth();
  const [visits, setVisits] = useState([]);
  const [cooperatives, setCooperatives] = useState([]);
  const [form, setForm] = useState({ cooperativeId: "", plannedDate: "", purpose: "" });
  const [error, setError] = useState("");

  function load() {
    api.get("/field-ops/visits").then((res) => setVisits(res.data)).catch(() => {});
    api.get("/cooperatives").then((res) => setCooperatives(res.data)).catch(() => {});
  }

  useEffect(load, []);

  async function planVisit(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/field-ops/visits", form);
      setForm({ cooperativeId: "", plannedDate: "", purpose: "" });
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to plan visit");
    }
  }

  async function decide(id, approve) {
    await api.post(`/field-ops/visits/${id}/decision`, { approve });
    load();
  }

  const canApprove = user?.role === "DIRECTOR" || user?.role === "SUBCOUNTY_OFFICER";

  return (
    <ProtectedRoute>
      <h1 className="mb-6 text-2xl font-bold">Field Visit Planner</h1>

      <form onSubmit={planVisit} className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-4">
        <select required className="rounded-md border border-gray-300 px-3 py-2 text-sm md:col-span-2"
          value={form.cooperativeId} onChange={(e) => setForm({ ...form, cooperativeId: e.target.value })}>
          <option value="">Select cooperative…</option>
          {cooperatives.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input required type="date" className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.plannedDate} onChange={(e) => setForm({ ...form, plannedDate: e.target.value })} />
        <input required placeholder="Purpose of visit" className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
        <button type="submit" className="rounded-md bg-kenya-green px-3 py-2 text-sm font-semibold text-white md:col-span-4">
          Plan Visit
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Officer</th>
              <th className="px-4 py-2">Cooperative</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Purpose</th>
              <th className="px-4 py-2">Status</th>
              {canApprove && <th className="px-4 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => (
              <tr key={v.id} className="border-t border-gray-100">
                <td className="px-4 py-2">{v.officer?.fullName}</td>
                <td className="px-4 py-2">{v.cooperative?.name}</td>
                <td className="px-4 py-2">{new Date(v.plannedDate).toLocaleDateString()}</td>
                <td className="px-4 py-2">{v.purpose}</td>
                <td className="px-4 py-2">{v.status}</td>
                {canApprove && (
                  <td className="px-4 py-2 space-x-2">
                    {v.status === "PLANNED" && (
                      <>
                        <button onClick={() => decide(v.id, true)} className="text-xs font-medium text-kenya-green hover:underline">Authorize</button>
                        <button onClick={() => decide(v.id, false)} className="text-xs font-medium text-red-600 hover:underline">Reject</button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {visits.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No field visits planned.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </ProtectedRoute>
  );
}
