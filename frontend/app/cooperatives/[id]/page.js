"use client";

import { Fragment, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ProtectedRoute from "../../../components/ProtectedRoute";
import api from "../../../lib/api";

const ASSET_TRACKED_VALUE_CHAINS = ["LIVESTOCK", "POULTRY", "HOUSING", "TRANSPORT"];
const BASE_TABS = ["Members", "Contributions", "Produce", "Payouts", "Documents", "Governance", "AGM", "Credit Score"];

export default function CooperativeDetailPage() {
  const { id } = useParams();
  const [coop, setCoop] = useState(null);
  const [tab, setTab] = useState("Members");
  const [error, setError] = useState("");

  function reload() {
    api
      .get(`/cooperatives/${id}`)
      .then((res) => setCoop(res.data))
      .catch((err) => setError(err?.response?.data?.error || "Failed to load cooperative"));
  }

  useEffect(reload, [id]);

  if (error) {
    return (
      <ProtectedRoute>
        <p className="text-sm text-red-600">{error}</p>
      </ProtectedRoute>
    );
  }

  if (!coop) {
    return (
      <ProtectedRoute>
        <p className="text-gray-500">Loading…</p>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="mb-1 text-xs font-medium uppercase text-kenya-gold">{coop.valueChain}</div>
      <h1 className="mb-1 text-2xl font-bold">{coop.name}</h1>
      <p className="mb-6 text-sm text-gray-500">
        {coop.registrationNumber} · {coop.county?.name ? `${coop.county.name} County · ` : ""}{coop.subCounty} / {coop.ward}
      </p>

      <div className="mb-6 flex gap-2 border-b border-gray-200">
        {(ASSET_TRACKED_VALUE_CHAINS.includes(coop.valueChain)
          ? [...BASE_TABS.slice(0, 3), "Assets", ...BASE_TABS.slice(3)]
          : BASE_TABS
        ).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t ? "border-b-2 border-kenya-green text-kenya-green" : "text-gray-500"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Members" && <MembersTab coop={coop} onChange={reload} />}
      {tab === "Contributions" && <ContributionsTab coop={coop} />}
      {tab === "Produce" && <ProduceTab coop={coop} />}
      {tab === "Assets" && <AssetsTab coop={coop} />}
      {tab === "Payouts" && <PayoutsTab coop={coop} />}
      {tab === "Documents" && <DocumentsTab coop={coop} onChange={reload} />}
      {tab === "Governance" && <GovernanceTab coop={coop} onChange={reload} />}
      {tab === "AGM" && <AGMTab coop={coop} onChange={reload} />}
      {tab === "Credit Score" && <CreditScoreTab coop={coop} />}
    </ProtectedRoute>
  );
}

function MembersTab({ coop, onChange }) {
  const [form, setForm] = useState({ legalName: "", nationalId: "", phoneNumber: "", gender: "MALE", shareCapital: 0 });
  const [error, setError] = useState("");

  async function addMember(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post(`/cooperatives/${coop.id}/members`, { ...form, shareCapital: Number(form.shareCapital) });
      setForm({ legalName: "", nationalId: "", phoneNumber: "", gender: "MALE", shareCapital: 0 });
      onChange();
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to add member");
    }
  }

  return (
    <div>
      <form onSubmit={addMember} className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-5">
        <input required placeholder="Legal Name" className="rounded-md border border-gray-300 px-3 py-2 text-sm md:col-span-2"
          value={form.legalName} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />
        <input required placeholder="National ID" className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} />
        <input placeholder="Phone" className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} />
        <select className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
        </select>
        <input type="number" min="0" step="0.01" placeholder="Share Capital (KES)" className="rounded-md border border-gray-300 px-3 py-2 text-sm md:col-span-2"
          value={form.shareCapital} onChange={(e) => setForm({ ...form, shareCapital: e.target.value })} />
        <button type="submit" className="rounded-md bg-kenya-green px-3 py-2 text-sm font-semibold text-white md:col-span-3">
          Add Member
        </button>
      </form>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">National ID</th>
              <th className="px-4 py-2">Gender</th>
              <th className="px-4 py-2">Share Capital</th>
            </tr>
          </thead>
          <tbody>
            {(coop.members || []).map((m) => (
              <tr key={m.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium">{m.legalName}</td>
                <td className="px-4 py-2">{m.nationalId}</td>
                <td className="px-4 py-2">{m.gender}</td>
                <td className="px-4 py-2">KES {Number(m.shareCapital).toLocaleString()}</td>
              </tr>
            ))}
            {(coop.members || []).length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No members yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const DOC_TYPES = ["BY_LAWS", "MEETING_MINUTES", "CODE_OF_CONDUCT", "AUDIT_REPORT", "SPOT_CHECK_REPORT", "OTHER"];

function DocumentsTab({ coop, onChange }) {
  const [form, setForm] = useState({ docType: "BY_LAWS", title: "" });
  const [error, setError] = useState("");

  async function upload(e) {
    e.preventDefault();
    setError("");
    try {
      // NOTE: storageKey/fileSizeBytes would normally come from a pre-signed
      // upload step against object storage; stubbed here for the scaffold.
      await api.post(`/cooperatives/${coop.id}/documents`, {
        ...form,
        storageKey: `docs/${coop.id}/${Date.now()}-${form.title.replace(/\s+/g, "_")}.pdf`,
        fileSizeBytes: 1024,
      });
      setForm({ docType: "BY_LAWS", title: "" });
      onChange();
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to upload document");
    }
  }

  async function review(docId, approve) {
    await api.post(`/cooperatives/${coop.id}/documents/${docId}/review`, { approve });
    onChange();
  }

  async function approve(docId, approve) {
    await api.post(`/cooperatives/${coop.id}/documents/${docId}/approve`, { approve });
    onChange();
  }

  return (
    <div>
      <form onSubmit={upload} className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-4">
        <select className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value })}>
          {DOC_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
        <input required placeholder="Document title" className="rounded-md border border-gray-300 px-3 py-2 text-sm md:col-span-2"
          value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <button type="submit" className="rounded-md bg-kenya-green px-3 py-2 text-sm font-semibold text-white">
          Upload
        </button>
      </form>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Title</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(coop.documents || []).map((d) => (
              <tr key={d.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium">{d.title}</td>
                <td className="px-4 py-2">{d.docType.replace(/_/g, " ")}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={d.status} />
                </td>
                <td className="px-4 py-2 space-x-2">
                  {d.status === "PENDING" && (
                    <>
                      <button onClick={() => review(d.id, true)} className="text-xs font-medium text-kenya-green hover:underline">Review ✓</button>
                      <button onClick={() => review(d.id, false)} className="text-xs font-medium text-red-600 hover:underline">Reject</button>
                    </>
                  )}
                  {d.status === "REVIEWED" && (
                    <>
                      <button onClick={() => approve(d.id, true)} className="text-xs font-medium text-kenya-green hover:underline">Director Approve</button>
                      <button onClick={() => approve(d.id, false)} className="text-xs font-medium text-red-600 hover:underline">Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {(coop.documents || []).length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No documents uploaded.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    PENDING: "bg-yellow-100 text-yellow-800",
    REVIEWED: "bg-blue-100 text-blue-800",
    APPROVED: "bg-green-100 text-green-800",
    REJECTED: "bg-red-100 text-red-800",
    TERM_EXPIRING: "bg-yellow-100 text-yellow-800",
    TERM_EXPIRED: "bg-red-100 text-red-800",
    COMPLIANT: "bg-green-100 text-green-800",
    NON_COMPLIANT: "bg-red-100 text-red-800",
    UPCOMING: "bg-gray-100 text-gray-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] || "bg-gray-100 text-gray-700"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

const ROLES = ["CHAIRPERSON", "VICE_CHAIRPERSON", "SECRETARY", "TREASURER", "BOARD_MEMBER", "EXECUTIVE_MANAGER"];

function GovernanceTab({ coop, onChange }) {
  const [members, setMembers] = useState([{ fullName: "", gender: "MALE", role: "CHAIRPERSON", electionDate: "" }]);
  const [error, setError] = useState("");
  const [complianceWarning, setComplianceWarning] = useState(null);

  function updateMember(idx, field, value) {
    setMembers((prev) => prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)));
  }

  function addRow() {
    setMembers((prev) => [...prev, { fullName: "", gender: "MALE", role: "BOARD_MEMBER", electionDate: "" }]);
  }

  async function saveCommittee(e, overrideJustification) {
    e?.preventDefault?.();
    setError("");
    setComplianceWarning(null);
    try {
      await api.post(`/cooperatives/${coop.id}/governance/committees`, {
        committeeType: "MANAGEMENT",
        termLengthYears: 3,
        members,
        ...(overrideJustification ? { overrideJustification } : {}),
      });
      onChange();
    } catch (err) {
      if (err?.response?.status === 422) {
        setComplianceWarning(err.response.data);
      } else {
        setError(err?.response?.data?.error || "Failed to save committee");
      }
    }
  }

  return (
    <div>
      <h3 className="mb-2 font-semibold">Submit / Update Management Committee</h3>
      <form onSubmit={(e) => saveCommittee(e)} className="mb-4 space-y-2 rounded-lg border border-gray-200 bg-white p-4">
        {members.map((m, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <input required placeholder="Full name" className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={m.fullName} onChange={(e) => updateMember(i, "fullName", e.target.value)} />
            <select className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={m.gender} onChange={(e) => updateMember(i, "gender", e.target.value)}>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
            </select>
            <select className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={m.role} onChange={(e) => updateMember(i, "role", e.target.value)}>
              {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
            </select>
            <input required type="date" className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={m.electionDate} onChange={(e) => updateMember(i, "electionDate", e.target.value)} />
          </div>
        ))}
        <div className="flex gap-2">
          <button type="button" onClick={addRow} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium">
            + Add Member
          </button>
          <button type="submit" className="rounded-md bg-kenya-green px-3 py-1.5 text-xs font-semibold text-white">
            Save Committee
          </button>
        </div>
      </form>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {complianceWarning && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">{complianceWarning.error}</p>
          <p className="mt-1">{complianceWarning.detail?.reason}</p>
          <p className="mt-2 text-xs">A Director can override this with a logged justification.</p>
          <OverrideForm onOverride={(justification) => saveCommittee(null, justification)} />
        </div>
      )}

      <h3 className="mb-2 mt-6 font-semibold">Existing Committees</h3>
      <div className="space-y-3">
        {(coop.committees || []).map((c) => (
          <div key={c.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-medium">{c.committeeType} Committee</span>
              <StatusBadge status={c.status} />
              {c.complianceOverride && <span className="text-xs text-amber-600">(Director override logged)</span>}
            </div>
            <ul className="text-sm text-gray-600">
              {c.members?.map((m) => (
                <li key={m.id}>
                  {m.fullName} — {m.role.replace(/_/g, " ")} ({m.gender}) · re-election due{" "}
                  {new Date(m.reelectionDueDate).toLocaleDateString()}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {(coop.committees || []).length === 0 && <p className="text-gray-400">No committees recorded yet.</p>}
      </div>
    </div>
  );
}

function OverrideForm({ onOverride }) {
  const [justification, setJustification] = useState("");
  return (
    <div className="mt-3 flex gap-2">
      <input
        placeholder="Director justification (min. 10 characters)"
        className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        value={justification}
        onChange={(e) => setJustification(e.target.value)}
      />
      <button
        onClick={() => onOverride(justification)}
        disabled={justification.length < 10}
        className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        Override & Submit
      </button>
    </div>
  );
}

function AGMTab({ coop, onChange }) {
  const [form, setForm] = useState({ agmType: "ANNUAL", meetingDate: "" });
  const [error, setError] = useState("");

  async function record(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post(`/cooperatives/${coop.id}/governance/agms`, form);
      setForm({ agmType: "ANNUAL", meetingDate: "" });
      onChange();
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to record AGM");
    }
  }

  return (
    <div>
      <form onSubmit={record} className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-4">
        <select className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.agmType} onChange={(e) => setForm({ ...form, agmType: e.target.value })}>
          <option value="ANNUAL">Annual</option>
          <option value="EXTRAORDINARY">Extraordinary</option>
        </select>
        <input required type="date" className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.meetingDate} onChange={(e) => setForm({ ...form, meetingDate: e.target.value })} />
        <button type="submit" className="rounded-md bg-kenya-green px-3 py-2 text-sm font-semibold text-white">
          Record AGM
        </button>
      </form>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="space-y-2">
        {(coop.agms || []).map((a) => (
          <div key={a.id} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
            <span className="font-medium">{a.agmType}</span> — {new Date(a.meetingDate).toLocaleDateString()}
          </div>
        ))}
        {(coop.agms || []).length === 0 && <p className="text-gray-400">No AGMs recorded yet.</p>}
      </div>
    </div>
  );
}

const CONTRIBUTION_TYPES = ["MONTHLY_CONTRIBUTION", "SHARE_CAPITAL_TOPUP", "LOAN_REPAYMENT", "OTHER"];
const CONTRIBUTION_METHODS = ["MPESA", "CASH", "BANK_TRANSFER", "OTHER"];

function ContributionsTab({ coop }) {
  const [contributions, setContributions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState({
    memberId: "",
    amount: "",
    type: "MONTHLY_CONTRIBUTION",
    method: "CASH",
    contributionDate: new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState("");

  function load() {
    api.get(`/cooperatives/${coop.id}/contributions`).then((res) => setContributions(res.data)).catch(() => {});
    api.get(`/cooperatives/${coop.id}/contributions/summary`).then((res) => setSummary(res.data)).catch(() => {});
  }

  useEffect(load, [coop.id]);

  async function recordContribution(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post(`/cooperatives/${coop.id}/contributions`, { ...form, amount: Number(form.amount) });
      setForm({ ...form, memberId: "", amount: "" });
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to record contribution");
    }
  }

  return (
    <div>
      <p className="mb-4 rounded-md bg-kenya-green/5 px-4 py-2 text-xs text-gray-600">
        This records staff-assisted contributions (cash or bank transfer confirmed in person).
        M-Pesa self-service contributions from the member&apos;s own dashboard are on the roadmap —
        this ledger is the same one that integration will write to, via the <code>method</code> and{" "}
        <code>externalRef</code> fields already in place.
      </p>

      {summary && (
        <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase text-gray-500">Total Entries</p>
            <p className="mt-1 text-xl font-bold text-kenya-green">{summary.totalContributions}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase text-gray-500">This Month</p>
            <p className="mt-1 text-xl font-bold text-kenya-green">KES {summary.thisMonthTotal.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase text-gray-500">Share Capital Total</p>
            <p className="mt-1 text-xl font-bold text-kenya-green">
              KES {(summary.totalsByType.SHARE_CAPITAL_TOPUP || 0).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      <form onSubmit={recordContribution} className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-6">
        <select required className="rounded-md border border-gray-300 px-3 py-2 text-sm md:col-span-2"
          value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })}>
          <option value="">Select member…</option>
          {(coop.members || []).map((m) => <option key={m.id} value={m.id}>{m.legalName}</option>)}
        </select>
        <input required type="number" min="1" step="0.01" placeholder="Amount (KES)"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <select className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {CONTRIBUTION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
        <select className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
          {CONTRIBUTION_METHODS.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
        </select>
        <input required type="date" className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.contributionDate} onChange={(e) => setForm({ ...form, contributionDate: e.target.value })} />
        <button type="submit" className="rounded-md bg-kenya-green px-3 py-2 text-sm font-semibold text-white md:col-span-6">
          Record Contribution
        </button>
      </form>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Member</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Method</th>
              <th className="px-4 py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {contributions.map((c) => (
              <tr key={c.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium">{c.member?.legalName}</td>
                <td className="px-4 py-2">KES {Number(c.amount).toLocaleString()}</td>
                <td className="px-4 py-2">{c.type.replace(/_/g, " ")}</td>
                <td className="px-4 py-2">{c.method.replace(/_/g, " ")}</td>
                <td className="px-4 py-2">{new Date(c.contributionDate).toLocaleDateString()}</td>
              </tr>
            ))}
            {contributions.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No contributions recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PRODUCE_UNITS = ["KG", "LITERS", "BAGS", "CRATES", "OTHER"];
const PRODUCE_TYPE_SUGGESTIONS = {
  COFFEE: "Coffee Cherries",
  DAIRY: "Whole Milk",
  TEA: "Tea Leaf (Green Leaf)",
  SUGARCANE: "Sugarcane",
  COTTON: "Raw Cotton",
  CASHEWNUT: "Raw Cashewnuts",
  FISHERIES: "Fresh Fish",
  LIVESTOCK: "Livestock",
  POULTRY: "Eggs",
  MIRAA: "Miraa",
};

function ProduceTab({ coop }) {
  const suggestedType = PRODUCE_TYPE_SUGGESTIONS[coop.valueChain] || "Produce";
  const [deliveries, setDeliveries] = useState([]);
  const [unpaidSummary, setUnpaidSummary] = useState([]);
  const [form, setForm] = useState({
    memberId: "",
    produceType: suggestedType,
    quantity: "",
    unit: "KG",
    qualityGrade: "",
    ratePerUnit: "",
    deliveryDate: new Date().toISOString().slice(0, 10),
  });
  const [error, setError] = useState("");

  function load() {
    api.get(`/cooperatives/${coop.id}/produce`).then((res) => setDeliveries(res.data)).catch(() => {});
    api.get(`/cooperatives/${coop.id}/produce/unpaid-summary`).then((res) => setUnpaidSummary(res.data)).catch(() => {});
  }

  useEffect(load, [coop.id]);

  async function recordDelivery(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post(`/cooperatives/${coop.id}/produce`, {
        ...form,
        quantity: Number(form.quantity),
        ratePerUnit: form.ratePerUnit ? Number(form.ratePerUnit) : undefined,
        qualityGrade: form.qualityGrade || undefined,
      });
      setForm({ ...form, memberId: "", quantity: "", qualityGrade: "" });
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to record delivery");
    }
  }

  return (
    <div>
      {unpaidSummary.length > 0 && (
        <div className="mb-4 rounded-lg border border-kenya-gold/40 bg-kenya-gold/5 p-4">
          <p className="mb-2 text-sm font-semibold text-kenya-black">Outstanding balances owed to farmers</p>
          <div className="flex flex-wrap gap-3">
            {unpaidSummary.map((m) => (
              <div key={m.memberId} className="rounded-md bg-white px-3 py-2 text-xs shadow-sm">
                <span className="font-medium">{m.memberName}</span>: KES {m.totalOwed.toLocaleString()} ({m.deliveryCount} deliveries)
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">Settle these from the Payouts tab.</p>
        </div>
      )}

      <form onSubmit={recordDelivery} className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-7">
        <select required className="rounded-md border border-gray-300 px-3 py-2 text-sm md:col-span-2"
          value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })}>
          <option value="">Select member…</option>
          {(coop.members || []).map((m) => <option key={m.id} value={m.id}>{m.legalName}</option>)}
        </select>
        <input required placeholder="Produce type" className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.produceType} onChange={(e) => setForm({ ...form, produceType: e.target.value })} />
        <input required type="number" min="0.01" step="0.01" placeholder="Quantity" className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
        <select className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
          {PRODUCE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <input placeholder="Grade (optional)" className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.qualityGrade} onChange={(e) => setForm({ ...form, qualityGrade: e.target.value })} />
        <input type="number" min="0" step="0.01" placeholder="Rate/unit KES (optional)" className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.ratePerUnit} onChange={(e) => setForm({ ...form, ratePerUnit: e.target.value })} />
        <input required type="date" className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.deliveryDate} onChange={(e) => setForm({ ...form, deliveryDate: e.target.value })} />
        <button type="submit" className="rounded-md bg-kenya-green px-3 py-2 text-sm font-semibold text-white md:col-span-7">
          Record Delivery
        </button>
      </form>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Member</th>
              <th className="px-4 py-2">Produce</th>
              <th className="px-4 py-2">Quantity</th>
              <th className="px-4 py-2">Grade</th>
              <th className="px-4 py-2">Value</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Paid</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((d) => (
              <tr key={d.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium">{d.member?.legalName}</td>
                <td className="px-4 py-2">{d.produceType}</td>
                <td className="px-4 py-2">{Number(d.quantity).toLocaleString()} {d.unit}</td>
                <td className="px-4 py-2">{d.qualityGrade || "—"}</td>
                <td className="px-4 py-2">{d.totalValue ? `KES ${Number(d.totalValue).toLocaleString()}` : "—"}</td>
                <td className="px-4 py-2">{new Date(d.deliveryDate).toLocaleDateString()}</td>
                <td className="px-4 py-2">{d.paid ? "✓ Paid" : "Pending"}</td>
              </tr>
            ))}
            {deliveries.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">No produce deliveries recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const ASSET_TYPES = ["LIVESTOCK", "POULTRY", "VEHICLE", "PROPERTY_UNIT", "OTHER"];
const ASSET_TYPE_SUGGESTIONS = {
  LIVESTOCK: { type: "LIVESTOCK", label: "e.g. Dairy Cow, Goat" },
  POULTRY: { type: "POULTRY", label: "e.g. Layer Chicken flock" },
  HOUSING: { type: "PROPERTY_UNIT", label: "e.g. Housing Unit / Plot" },
  TRANSPORT: { type: "VEHICLE", label: "e.g. Boda Boda, Matatu" },
};
const ASSET_EVENT_TYPES = ["ACQUIRED", "TRANSFERRED", "SOLD", "DECEASED", "WRITTEN_OFF", "VALUATION_UPDATE", "HEALTH_CHECK"];
const ASSET_STATUS_LABELS = {
  ACTIVE: "Active",
  TRANSFERRED: "Transferred",
  SOLD: "Sold",
  DECEASED: "Deceased",
  WRITTEN_OFF: "Written Off",
};

function AssetsTab({ coop }) {
  const suggestion = ASSET_TYPE_SUGGESTIONS[coop.valueChain];
  const [assets, setAssets] = useState([]);
  const [form, setForm] = useState({
    memberId: "",
    assetType: suggestion?.type || "OTHER",
    identifier: "",
    description: "",
    acquisitionDate: new Date().toISOString().slice(0, 10),
    acquisitionValue: "",
  });
  const [expandedAssetId, setExpandedAssetId] = useState(null);
  const [eventForm, setEventForm] = useState({ eventType: "HEALTH_CHECK", eventDate: new Date().toISOString().slice(0, 10), notes: "", valueAtEvent: "" });
  const [statementMemberId, setStatementMemberId] = useState("");
  const [error, setError] = useState("");

  function load() {
    api.get(`/cooperatives/${coop.id}/assets`).then((res) => setAssets(res.data)).catch(() => {});
  }
  useEffect(load, [coop.id]);

  async function recordAsset(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post(`/cooperatives/${coop.id}/assets`, {
        ...form,
        acquisitionValue: form.acquisitionValue ? Number(form.acquisitionValue) : undefined,
        description: form.description || undefined,
      });
      setForm({ ...form, memberId: "", identifier: "", description: "", acquisitionValue: "" });
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to record asset");
    }
  }

  async function recordEvent(assetId) {
    setError("");
    try {
      await api.post(`/cooperatives/${coop.id}/assets/${assetId}/events`, {
        ...eventForm,
        valueAtEvent: eventForm.valueAtEvent ? Number(eventForm.valueAtEvent) : undefined,
        notes: eventForm.notes || undefined,
      });
      setExpandedAssetId(null);
      setEventForm({ eventType: "HEALTH_CHECK", eventDate: new Date().toISOString().slice(0, 10), notes: "", valueAtEvent: "" });
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to record event");
    }
  }

  async function downloadStatement() {
    if (!statementMemberId) return;
    setError("");
    try {
      const { data } = await api.get(`/cooperatives/${coop.id}/assets/statement`, { params: { memberId: statementMemberId } });
      const rows = [
        ["Asset Statement", data.member.legalName, data.member.nationalId, `Generated ${new Date(data.generatedAt).toLocaleString()}`],
        [],
        ["Type", "Identifier", "Description", "Acquired", "Status", "Current Value"],
        ...data.assets.map((a) => [
          a.assetType, a.identifier, a.description || "", new Date(a.acquisitionDate).toLocaleDateString(),
          ASSET_STATUS_LABELS[a.status] || a.status, a.currentValue || a.acquisitionValue || 0,
        ]),
        [],
        ["Total Active Assets", data.totalActiveAssets],
        ["Total Current Value (KES)", data.totalCurrentValue],
      ];
      const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `asset-statement-${data.member.legalName.replace(/\s+/g, "_")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to generate statement");
    }
  }

  return (
    <div>
      <div className="mb-4 rounded-md bg-kenya-green/5 px-4 py-2 text-xs text-gray-600">
        One asset model covers Livestock, Poultry, Housing units, and Transport SACCO vehicles — a dairy cow,
        a boda boda, and a housing unit are all: something a member owns, with a status and a lifecycle of events.
        Feeds directly into the Asset Stability credit factor for this value chain.
      </div>

      <form onSubmit={recordAsset} className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-6">
        <select required className="rounded-md border border-gray-300 px-3 py-2 text-sm md:col-span-2"
          value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })}>
          <option value="">Select member…</option>
          {(coop.members || []).map((m) => <option key={m.id} value={m.id}>{m.legalName}</option>)}
        </select>
        <select className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.assetType} onChange={(e) => setForm({ ...form, assetType: e.target.value })}>
          {ASSET_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
        </select>
        <input required placeholder={suggestion ? `Tag/ID (${suggestion.label})` : "Tag / Identifier"} className="rounded-md border border-gray-300 px-3 py-2 text-sm md:col-span-2"
          value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} />
        <input required type="date" className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.acquisitionDate} onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })} />
        <input type="number" min="0" step="0.01" placeholder="Value (KES, optional)" className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={form.acquisitionValue} onChange={(e) => setForm({ ...form, acquisitionValue: e.target.value })} />
        <input placeholder="Description (breed, model, unit details — optional)" className="rounded-md border border-gray-300 px-3 py-2 text-sm md:col-span-4"
          value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <button type="submit" className="rounded-md bg-kenya-green px-3 py-2 text-sm font-semibold text-white md:col-span-2">
          Record Asset
        </button>
      </form>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-white p-3">
        <span className="text-xs font-medium text-gray-500">Export statement for:</span>
        <select className="rounded-md border border-gray-300 px-2 py-1 text-xs"
          value={statementMemberId} onChange={(e) => setStatementMemberId(e.target.value)}>
          <option value="">Select member…</option>
          {(coop.members || []).map((m) => <option key={m.id} value={m.id}>{m.legalName}</option>)}
        </select>
        <button onClick={downloadStatement} disabled={!statementMemberId}
          className="rounded-md border border-kenya-green px-3 py-1 text-xs font-medium text-kenya-green disabled:opacity-40">
          Download CSV
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Member</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">ID / Tag</th>
              <th className="px-4 py-2">Acquired</th>
              <th className="px-4 py-2">Value</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <Fragment key={a.id}>
                <tr className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium">{a.member?.legalName}</td>
                  <td className="px-4 py-2">{a.assetType.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2">{a.identifier}</td>
                  <td className="px-4 py-2">{new Date(a.acquisitionDate).toLocaleDateString()}</td>
                  <td className="px-4 py-2">{a.currentValue || a.acquisitionValue ? `KES ${Number(a.currentValue || a.acquisitionValue).toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                      {ASSET_STATUS_LABELS[a.status] || a.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <button onClick={() => setExpandedAssetId(expandedAssetId === a.id ? null : a.id)} className="text-xs font-medium text-kenya-green hover:underline">
                      {expandedAssetId === a.id ? "Cancel" : "Log Event"}
                    </button>
                  </td>
                </tr>
                {expandedAssetId === a.id && (
                  <tr className="border-t border-gray-100 bg-gray-50">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="flex flex-wrap items-end gap-2">
                        <select className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                          value={eventForm.eventType} onChange={(e) => setEventForm({ ...eventForm, eventType: e.target.value })}>
                          {ASSET_EVENT_TYPES.filter((t) => t !== "ACQUIRED").map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                        </select>
                        <input type="date" className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                          value={eventForm.eventDate} onChange={(e) => setEventForm({ ...eventForm, eventDate: e.target.value })} />
                        <input type="number" min="0" step="0.01" placeholder="Value (optional)" className="w-32 rounded-md border border-gray-300 px-2 py-1 text-xs"
                          value={eventForm.valueAtEvent} onChange={(e) => setEventForm({ ...eventForm, valueAtEvent: e.target.value })} />
                        <input placeholder="Notes (optional)" className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs"
                          value={eventForm.notes} onChange={(e) => setEventForm({ ...eventForm, notes: e.target.value })} />
                        <button onClick={() => recordEvent(a.id)} className="rounded-md bg-kenya-green px-3 py-1 text-xs font-semibold text-white">
                          Save Event
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {assets.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">No assets recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PAYOUT_TYPES = ["PRODUCE_PAYMENT", "DIVIDEND", "BONUS", "OTHER"];
const PAYOUT_METHODS = ["MPESA", "CASH", "BANK_TRANSFER", "OTHER"];

function PayoutsTab({ coop }) {
  const [payouts, setPayouts] = useState([]);
  const [unpaidSummary, setUnpaidSummary] = useState([]);
  const [unpaidDeliveries, setUnpaidDeliveries] = useState([]);
  const [form, setForm] = useState({
    memberId: "",
    amount: "",
    type: "PRODUCE_PAYMENT",
    method: "CASH",
    periodLabel: "",
    payoutDate: new Date().toISOString().slice(0, 10),
  });
  const [selectedDeliveryIds, setSelectedDeliveryIds] = useState([]);
  const [error, setError] = useState("");

  function load() {
    api.get(`/cooperatives/${coop.id}/payouts`).then((res) => setPayouts(res.data)).catch(() => {});
    api.get(`/cooperatives/${coop.id}/produce/unpaid-summary`).then((res) => setUnpaidSummary(res.data)).catch(() => {});
  }

  useEffect(load, [coop.id]);

  useEffect(() => {
    if (!form.memberId) {
      setUnpaidDeliveries([]);
      setSelectedDeliveryIds([]);
      return;
    }
    api
      .get(`/cooperatives/${coop.id}/produce`, { params: { memberId: form.memberId, paid: "false" } })
      .then((res) => setUnpaidDeliveries(res.data))
      .catch(() => {});
  }, [form.memberId, coop.id]);

  function toggleDelivery(id) {
    setSelectedDeliveryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const selectedTotal = unpaidDeliveries
    .filter((d) => selectedDeliveryIds.includes(d.id))
    .reduce((sum, d) => sum + Number(d.totalValue || 0), 0);

  async function recordPayout(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post(`/cooperatives/${coop.id}/payouts`, {
        ...form,
        amount: Number(form.amount),
        produceDeliveryIds: selectedDeliveryIds.length > 0 ? selectedDeliveryIds : undefined,
      });
      setForm({ ...form, memberId: "", amount: "", periodLabel: "" });
      setSelectedDeliveryIds([]);
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to record payout");
    }
  }

  return (
    <div>
      <div className="mb-4 rounded-md bg-kenya-green/5 px-4 py-2 text-xs text-gray-600">
        This is what feeds the Director&apos;s national disbursement report — every payout recorded here
        shows up in the trickle-down view of how much individual farmers were compensated.
      </div>

      {unpaidSummary.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs text-gray-600">
          <span className="font-medium">Outstanding:</span>
          {unpaidSummary.map((m) => (
            <span key={m.memberId} className="rounded-full bg-gray-100 px-2 py-1">{m.memberName}: KES {m.totalOwed.toLocaleString()}</span>
          ))}
        </div>
      )}

      <form onSubmit={recordPayout} className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <select required className="rounded-md border border-gray-300 px-3 py-2 text-sm md:col-span-2"
            value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })}>
            <option value="">Select member…</option>
            {(coop.members || []).map((m) => <option key={m.id} value={m.id}>{m.legalName}</option>)}
          </select>
          <input required type="number" min="1" step="0.01" placeholder="Amount (KES)" className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <select className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {PAYOUT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
          <select className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            {PAYOUT_METHODS.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
          </select>
          <input required type="date" className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={form.payoutDate} onChange={(e) => setForm({ ...form, payoutDate: e.target.value })} />
        </div>
        <input placeholder="Period label (e.g. 'July 2026')" className="mt-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm md:w-64"
          value={form.periodLabel} onChange={(e) => setForm({ ...form, periodLabel: e.target.value })} />

        {unpaidDeliveries.length > 0 && (
          <div className="mt-3 rounded-md border border-gray-100 bg-gray-50 p-3">
            <p className="mb-2 text-xs font-medium text-gray-600">Settle against unpaid deliveries (optional):</p>
            <div className="space-y-1">
              {unpaidDeliveries.map((d) => (
                <label key={d.id} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={selectedDeliveryIds.includes(d.id)} onChange={() => toggleDelivery(d.id)} />
                  {d.produceType} — {Number(d.quantity).toLocaleString()} {d.unit} on {new Date(d.deliveryDate).toLocaleDateString()}
                  {d.totalValue ? ` — KES ${Number(d.totalValue).toLocaleString()}` : ""}
                </label>
              ))}
            </div>
            {selectedDeliveryIds.length > 0 && (
              <p className="mt-2 text-xs font-medium text-kenya-green">Selected total: KES {selectedTotal.toLocaleString()}</p>
            )}
          </div>
        )}

        <button type="submit" className="mt-3 rounded-md bg-kenya-green px-3 py-2 text-sm font-semibold text-white">
          Record Payout
        </button>
      </form>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Member</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Period</th>
              <th className="px-4 py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((p) => (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="px-4 py-2 font-medium">{p.member?.legalName}</td>
                <td className="px-4 py-2">KES {Number(p.amount).toLocaleString()}</td>
                <td className="px-4 py-2">{p.type.replace(/_/g, " ")}</td>
                <td className="px-4 py-2">{p.periodLabel || "—"}</td>
                <td className="px-4 py-2">{new Date(p.payoutDate).toLocaleDateString()}</td>
              </tr>
            ))}
            {payouts.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No payouts recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const BAND_COLORS = {
  AA: "bg-green-100 text-green-800 border-green-300",
  A: "bg-green-50 text-green-700 border-green-200",
  B: "bg-yellow-100 text-yellow-800 border-yellow-300",
  C: "bg-orange-100 text-orange-800 border-orange-300",
  D: "bg-red-100 text-red-800 border-red-300",
};

const FACTOR_LABELS = {
  contributionConsistency: "Contribution Consistency",
  produceConsistency: "Produce Consistency",
  governanceCompliance: "Governance Compliance",
  documentCompliance: "Document Compliance",
  membershipStability: "Membership Stability",
  shareCapitalTrajectory: "Share Capital Trajectory",
  assetStability: "Asset Stability",
};

function CreditScoreTab({ coop }) {
  const [latest, setLatest] = useState(undefined); // undefined = loading, null = none yet
  const [history, setHistory] = useState([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  function load() {
    api.get(`/cooperatives/${coop.id}/credit-assessment`).then((res) => setLatest(res.data)).catch((err) => {
      if (err?.response?.status === 403) setError("Your role cannot view credit assessments for this cooperative.");
    });
    api.get(`/cooperatives/${coop.id}/credit-assessment/history`).then((res) => setHistory(res.data)).catch(() => {});
  }

  useEffect(load, [coop.id]);

  async function runAssessment() {
    setRunning(true);
    setError("");
    try {
      await api.post(`/cooperatives/${coop.id}/credit-assessment`);
      load();
    } catch (err) {
      setError(err?.response?.data?.error || "Failed to run assessment");
    } finally {
      setRunning(false);
    }
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div>
      <div className="mb-4 rounded-md border border-kenya-gold/40 bg-kenya-gold/5 px-4 py-3 text-xs text-gray-700">
        <strong>This platform is a trust layer, not a lender.</strong> This score is a creditworthiness
        signal a cooperative can present to a bank or micro-lender — it is not a loan offer, pre-approval,
        or guarantee, and no funds are disbursed here.
      </div>

      <button
        onClick={runAssessment}
        disabled={running}
        className="mb-6 rounded-md bg-kenya-green px-4 py-2 text-sm font-semibold text-white hover:bg-kenya-green/90 disabled:opacity-50"
      >
        {running ? "Running assessment…" : "Run New Assessment"}
      </button>

      {latest === undefined && <p className="text-gray-400">Loading…</p>}
      {latest === null && <p className="text-gray-400">No assessment has been run yet. Click &quot;Run New Assessment&quot; to generate one.</p>}

      {latest && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-center gap-4">
            <div className={`flex h-20 w-20 items-center justify-center rounded-full border-4 text-2xl font-extrabold ${BAND_COLORS[latest.band]}`}>
              {latest.band}
            </div>
            <div>
              <p className="text-3xl font-bold text-kenya-black">{latest.score}<span className="text-base font-normal text-gray-400"> / 100</span></p>
              <p className="text-sm text-gray-500">{latest.breakdown?.bandLabel}</p>
              <p className="mt-1 text-xs text-gray-400">
                Assessed {new Date(latest.createdAt).toLocaleDateString()} by {latest.computedBy?.fullName || "—"}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {latest.breakdown?.factors && Object.entries(latest.breakdown.factors).map(([key, factor]) => (
              <div key={key}>
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-gray-700">{FACTOR_LABELS[key] || key}</span>
                  {factor.applicable === false ? (
                    <span className="italic text-gray-400">Not applicable — {coop.valueChain} has no tracked asset</span>
                  ) : (
                    <span className="text-gray-500">{factor.score} / 100 · weight {Math.round((latest.breakdown.weights?.[key] || 0) * 100)}%</span>
                  )}
                </div>
                {factor.applicable === false ? (
                  <div className="h-2 w-full rounded-full bg-gray-50" />
                ) : (
                  <div className="h-2 w-full rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full bg-kenya-green"
                      style={{ width: `${factor.score}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {history.length > 1 && (
        <div>
          <h3 className="mb-2 font-semibold">History</h3>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Score</th>
                  <th className="px-4 py-2">Band</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-gray-100">
                    <td className="px-4 py-2">{new Date(h.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-2">{h.score}</td>
                    <td className="px-4 py-2">{h.band}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
