"use client";

import { useEffect, useState } from "react";
import ProtectedRoute from "../../components/ProtectedRoute";
import { useAuth } from "../../context/AuthContext";
import api from "../../lib/api";

const CHAINS_SHOWN = ["COFFEE", "TEA", "DAIRY", "SUGARCANE", "SACCO", "FISHERIES"];

export default function DashboardPage() {
  const { user } = useAuth();
  const isNationalAdmin = user?.role === "NATIONAL_ADMIN";

  const [counties, setCounties] = useState([]);
  const [selectedCountyId, setSelectedCountyId] = useState(isNationalAdmin ? "" : user?.countyId || "");
  const [cooperatives, setCooperatives] = useState([]);
  const [nationalSummary, setNationalSummary] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/counties").then((res) => setCounties(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (isNationalAdmin && !selectedCountyId) {
      // National view: coverage across all 47 counties.
      api
        .get("/counties/summary")
        .then((res) => setNationalSummary(res.data))
        .catch((err) => setError(err?.response?.data?.error || "Failed to load national summary"));
      setCooperatives([]);
      return;
    }

    const params = selectedCountyId ? { countyId: selectedCountyId } : {};
    api
      .get("/cooperatives", { params })
      .then((res) => setCooperatives(res.data))
      .catch((err) => setError(err?.response?.data?.error || "Failed to load cooperatives"));
  }, [selectedCountyId, isNationalAdmin]);

  const byChain = cooperatives.reduce((acc, c) => {
    acc[c.valueChain] = (acc[c.valueChain] || 0) + 1;
    return acc;
  }, {});

  const countiesCovered = nationalSummary.filter((c) => c.cooperativeCount > 0).length;
  const totalCooperativesNational = nationalSummary.reduce((sum, c) => sum + c.cooperativeCount, 0);

  return (
    <ProtectedRoute>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">
          {isNationalAdmin ? "National Dashboard" : `${user?.county?.name || ""} County Dashboard`}
        </h1>

        {isNationalAdmin && (
          <select
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={selectedCountyId}
            onChange={(e) => setSelectedCountyId(e.target.value)}
          >
            <option value="">All 47 Counties (national view)</option>
            {counties.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {isNationalAdmin && !selectedCountyId ? (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Counties Onboarded" value={`${countiesCovered} / 47`} accent="green" />
            <StatCard label="Total Cooperatives" value={totalCooperativesNational} accent="red" />
            <StatCard label="Total Staff" value={nationalSummary.reduce((s, c) => s + c.staffCount, 0)} accent="black" />
            <StatCard label="Regions" value={new Set(nationalSummary.map((c) => c.region)).size} accent="gold" />
          </div>

          <h2 className="mb-3 mt-8 text-lg font-semibold">Coverage by County</h2>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">County</th>
                  <th className="px-4 py-2">Region</th>
                  <th className="px-4 py-2">Cooperatives</th>
                  <th className="px-4 py-2">Staff</th>
                </tr>
              </thead>
              <tbody>
                {nationalSummary.map((c) => (
                  <tr key={c.id} className="cursor-pointer border-t border-gray-100 hover:bg-gray-50" onClick={() => setSelectedCountyId(c.id)}>
                    <td className="px-4 py-2 font-medium">{c.name}</td>
                    <td className="px-4 py-2">{c.region}</td>
                    <td className="px-4 py-2">{c.cooperativeCount}</td>
                    <td className="px-4 py-2">{c.staffCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Total Cooperatives" value={cooperatives.length} accent="green" />
            {CHAINS_SHOWN.slice(0, 3).map((chain) => (
              <StatCard key={chain} label={chain} value={byChain[chain] || 0} accent="gold" />
            ))}
          </div>

          <h2 className="mb-3 mt-8 text-lg font-semibold">Cooperatives</h2>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Value Chain</th>
                  <th className="px-4 py-2">Sub-County</th>
                  <th className="px-4 py-2">Members</th>
                </tr>
              </thead>
              <tbody>
                {cooperatives.slice(0, 10).map((c) => (
                  <tr key={c.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium">{c.name}</td>
                    <td className="px-4 py-2">{c.valueChain}</td>
                    <td className="px-4 py-2">{c.subCounty}</td>
                    <td className="px-4 py-2">{c._count?.members ?? 0}</td>
                  </tr>
                ))}
                {cooperatives.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No cooperatives yet in this county.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ProtectedRoute>
  );
}

function StatCard({ label, value, accent = "green" }) {
  const colors = {
    green: "text-kenya-green",
    red: "text-kenya-red",
    black: "text-kenya-black",
    gold: "text-kenya-gold",
  };
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs uppercase text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${colors[accent]}`}>{value}</p>
    </div>
  );
}
