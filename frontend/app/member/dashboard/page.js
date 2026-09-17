"use client";

import { useEffect, useState } from "react";
import ProtectedMemberRoute from "../../../components/ProtectedMemberRoute";
import { useMemberAuth } from "../../../context/MemberAuthContext";
import memberApi from "../../../lib/memberApi";

const TABS = ["Overview", "Contributions", "Produce", "Payouts", "Meetings"];

export default function MemberDashboardPage() {
  const { member, logout } = useMemberAuth();
  const [tab, setTab] = useState("Overview");
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  function loadSummary() {
    memberApi
      .get("/member/summary")
      .then((res) => setSummary(res.data))
      .catch((err) => setError(err?.response?.data?.error || "Failed to load dashboard"));
  }

  useEffect(loadSummary, []);

  return (
    <ProtectedMemberRoute>
      <div className="min-h-screen bg-gray-50">
        <div className="h-1.5 w-full bg-kenya-stripe" />
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <p className="text-sm font-bold text-kenya-black">{summary?.cooperative?.name || "My Cooperative"}</p>
            <p className="text-xs text-gray-500">{member?.legalName}</p>
          </div>
          <button onClick={logout} className="text-xs font-medium text-kenya-red hover:underline">Sign out</button>
        </header>

        <div className="mx-auto max-w-4xl px-6 py-6">
          <div className="mb-6 flex gap-2 overflow-x-auto border-b border-gray-200">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`whitespace-nowrap px-4 py-2 text-sm font-medium ${
                  tab === t ? "border-b-2 border-kenya-green text-kenya-green" : "text-gray-500"
                }`}>
                {t}
              </button>
            ))}
          </div>

          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

          {tab === "Overview" && <OverviewTab summary={summary} />}
          {tab === "Contributions" && <ContributionsTab onChange={loadSummary} />}
          {tab === "Produce" && <ProduceTab />}
          {tab === "Payouts" && <PayoutsTab />}
          {tab === "Meetings" && <MeetingsTab />}
        </div>
      </div>
    </ProtectedMemberRoute>
  );
}

function StatCard({ label, value, accent = "green" }) {
  const colors = { green: "text-kenya-green", red: "text-kenya-red", gold: "text-kenya-gold", black: "text-kenya-black" };
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className={`mt-1 text-xl font-bold ${colors[accent]}`}>{value}</p>
    </div>
  );
}

function OverviewTab({ summary }) {
  if (!summary) return <p className="text-gray-400">Loading…</p>;
  const { totals, cooperativeCreditStanding, upcomingMeetings, cooperative } = summary;

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard label="Total Contributions" value={`KES ${totals.totalContributions.toLocaleString()}`} />
        <StatCard label="This Month" value={`KES ${totals.thisMonthContributions.toLocaleString()}`} accent="gold" />
        <StatCard label="Produce Delivered" value={`KES ${totals.totalProduceValue.toLocaleString()}`} />
        <StatCard label="Owed to You" value={`KES ${totals.unpaidProduceBalance.toLocaleString()}`} accent="red" />
        <StatCard label="Total Paid Out" value={`KES ${totals.totalPayouts.toLocaleString()}`} accent="black" />
        <StatCard label="Value Chain" value={cooperative.valueChain} accent="gold" />
      </div>

      {cooperativeCreditStanding && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-500">Your Cooperative&apos;s Credit Standing</p>
          <p className="mt-1 text-2xl font-bold text-kenya-green">
            {cooperativeCreditStanding.band} <span className="text-sm font-normal text-gray-400">({cooperativeCreditStanding.score}/100)</span>
          </p>
          <p className="mt-1 text-xs text-gray-400">As of {new Date(cooperativeCreditStanding.asOf).toLocaleDateString()}</p>
        </div>
      )}

      {upcomingMeetings?.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="mb-2 text-sm font-semibold">Recent / Upcoming Meetings</p>
          {upcomingMeetings.map((a) => (
            <div key={a.id} className="border-t border-gray-100 py-2 text-sm first:border-t-0">
              <span className="font-medium">{a.agmType}</span> — {new Date(a.meetingDate).toLocaleDateString()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ContributionsTab({ onChange }) {
  const [contributions, setContributions] = useState([]);
  const [form, setForm] = useState({ amount: "", type: "MONTHLY_CONTRIBUTION" });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function load() {
    memberApi.get("/member/contributions").then((res) => setContributions(res.data)).catch(() => {});
  }
  useEffect(load, []);

  async function initiate(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      const { data } = await memberApi.post("/member/contributions/initiate", { ...form, amount: Number(form.amount) });
      setMessage(data.note);
      setForm({ amount: "", type: "MONTHLY_CONTRIBUTION" });
      load();
      onChange?.();
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to submit contribution");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <form onSubmit={initiate} className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-semibold">Make a Digital Contribution</p>
        <div className="grid grid-cols-2 gap-3">
          <input required type="number" min="1" step="0.01" placeholder="Amount (KES)"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <select className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="MONTHLY_CONTRIBUTION">Monthly Contribution</option>
            <option value="SHARE_CAPITAL_TOPUP">Share Capital Top-up</option>
          </select>
        </div>
        <button type="submit" disabled={submitting}
          className="mt-3 rounded-md bg-kenya-green px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {submitting ? "Processing…" : "Pay via M-Pesa"}
        </button>
        <p className="mt-2 text-xs text-gray-400">
          Trial mode: this simulates a completed M-Pesa payment — no real charge is made.
        </p>
        {message && <p className="mt-2 text-xs text-kenya-green">{message}</p>}
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </form>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr><th className="px-4 py-2">Amount</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Method</th><th className="px-4 py-2">Date</th></tr>
          </thead>
          <tbody>
            {contributions.map((c) => (
              <tr key={c.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium">KES {Number(c.amount).toLocaleString()}</td>
                <td className="px-4 py-2">{c.type.replace(/_/g, " ")}</td>
                <td className="px-4 py-2">{c.method}</td>
                <td className="px-4 py-2">{new Date(c.contributionDate).toLocaleDateString()}</td>
              </tr>
            ))}
            {contributions.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No contributions yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProduceTab() {
  const [deliveries, setDeliveries] = useState([]);
  useEffect(() => {
    memberApi.get("/member/produce").then((res) => setDeliveries(res.data)).catch(() => {});
  }, []);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr><th className="px-4 py-2">Produce</th><th className="px-4 py-2">Quantity</th><th className="px-4 py-2">Value</th><th className="px-4 py-2">Date</th><th className="px-4 py-2">Status</th></tr>
        </thead>
        <tbody>
          {deliveries.map((d) => (
            <tr key={d.id} className="border-t border-gray-100">
              <td className="px-4 py-2 font-medium">{d.produceType}</td>
              <td className="px-4 py-2">{Number(d.quantity).toLocaleString()} {d.unit}</td>
              <td className="px-4 py-2">{d.totalValue ? `KES ${Number(d.totalValue).toLocaleString()}` : "—"}</td>
              <td className="px-4 py-2">{new Date(d.deliveryDate).toLocaleDateString()}</td>
              <td className="px-4 py-2">{d.paid ? "✓ Paid" : "Pending"}</td>
            </tr>
          ))}
          {deliveries.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No produce deliveries recorded yet.</td></tr>}
        </tbody>
      </table>
      <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
        Deliveries are recorded by your Cooperative Manager or a Field Officer at drop-off, so this list stays a
        reliable record for everyone — not self-reported.
      </p>
    </div>
  );
}

function PayoutsTab() {
  const [payouts, setPayouts] = useState([]);
  useEffect(() => {
    memberApi.get("/member/payouts").then((res) => setPayouts(res.data)).catch(() => {});
  }, []);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr><th className="px-4 py-2">Amount</th><th className="px-4 py-2">Type</th><th className="px-4 py-2">Period</th><th className="px-4 py-2">Date</th></tr>
        </thead>
        <tbody>
          {payouts.map((p) => (
            <tr key={p.id} className="border-t border-gray-100">
              <td className="px-4 py-2 font-medium">KES {Number(p.amount).toLocaleString()}</td>
              <td className="px-4 py-2">{p.type.replace(/_/g, " ")}</td>
              <td className="px-4 py-2">{p.periodLabel || "—"}</td>
              <td className="px-4 py-2">{new Date(p.payoutDate).toLocaleDateString()}</td>
            </tr>
          ))}
          {payouts.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No payouts recorded yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function MeetingsTab() {
  const [agms, setAgms] = useState([]);
  useEffect(() => {
    memberApi.get("/member/agms").then((res) => setAgms(res.data)).catch(() => {});
  }, []);

  return (
    <div>
      <div className="mb-4 rounded-md bg-kenya-gold/10 px-4 py-2 text-xs text-gray-600">
        Digital video meetings are on the roadmap — for now this shows the meeting record your Cooperative
        Manager has filed, so you always know when the next AGM or emergency meeting is.
      </div>
      <div className="space-y-2">
        {agms.map((a) => (
          <div key={a.id} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
            <span className="font-medium">{a.agmType}</span> — {new Date(a.meetingDate).toLocaleDateString()}
          </div>
        ))}
        {agms.length === 0 && <p className="text-gray-400">No meetings recorded yet.</p>}
      </div>
    </div>
  );
}
