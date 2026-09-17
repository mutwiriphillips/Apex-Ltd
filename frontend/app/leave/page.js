"use client";

import { useEffect, useState } from "react";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useAuth } from "../../context/AuthContext";
import api from "../../lib/api";

export default function LeavePage() {
  const { user } = useAuth();
  const [leaves, setLeaves] = useState([]);
  const [form, setForm] = useState({ leaveType: "Annual", startDate: "", endDate: "", reason: "" });
  const [error, setError] = useState("");

  function load() {
    api.get("/field-ops/leave").then((res) => setLeaves(res.data)).catch(() => {});
  }

  useEffect(load, []);

  async function apply(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/field-ops/leave", form);
      setForm({ leaveType: "Annual", startDate: "", endDate: "", reason: "" });
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to submit leave request");
    }
  }

  async function decide(id, approve) {
    await api.post(`/field-ops/leave/${id}/decision`, { approve });
    load();
  }

  const canApprove = user?.role === "DIRECTOR" || user?.role === "SUBCOUNTY_OFFICER";

  return (
    <ProtectedRoute>
      <h1 className="mb-6 text-2xl font-bold">Leave Management</h1>

      <form onSubmit={apply} className="mb-6 grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-5">
        <select className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })}>
          <option>Annual</option>
          <option>Sick</option>
          <option>Compassionate</option>
          <option>Maternity/Paternity</option>
        </select>
        <input required type="date" className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        <input required type="date" className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        <input placeholder="Reason (optional)" className="rounded-md border border-gray-300 px-3 py-2 text-sm md:col-span-2"
          value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        <button type="submit" className="rounded-md bg-kenya-green px-3 py-2 text-sm font-semibold text-white md:col-span-5">
          Apply for Leave
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Applicant</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Dates</th>
              <th className="px-4 py-2">Status</th>
              {canApprove && <th className="px-4 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {leaves.map((l) => (
              <tr key={l.id} className="border-t border-gray-100">
                <td className="px-4 py-2">{l.applicant?.fullName}</td>
                <td className="px-4 py-2">{l.leaveType}</td>
                <td className="px-4 py-2">
                  {new Date(l.startDate).toLocaleDateString()} – {new Date(l.endDate).toLocaleDateString()}
                </td>
                <td className="px-4 py-2">{l.status}</td>
                {canApprove && (
                  <td className="px-4 py-2 space-x-2">
                    {l.status === "PENDING" && (
                      <>
                        <button onClick={() => decide(l.id, true)} className="text-xs font-medium text-kenya-green hover:underline">Approve</button>
                        <button onClick={() => decide(l.id, false)} className="text-xs font-medium text-red-600 hover:underline">Reject</button>
                      </>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {leaves.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No leave requests.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </ProtectedRoute>
  );
}
