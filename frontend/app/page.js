"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";

// Real, freely-licensed photography (Wikimedia Commons, CC-BY-SA) — no
// AI-generated images and no depictions of real identifiable individuals.
const HERO_IMG = "https://commons.wikimedia.org/wiki/Special:FilePath/Cycling_in_the_Eden_tea_farms.jpg?width=1600";
const COAT_OF_ARMS_IMG = "https://commons.wikimedia.org/wiki/Special:FilePath/Coat_of_arms_of_Kenya.svg?width=140";
const COUNTY_MAP_IMG = "https://commons.wikimedia.org/wiki/Special:FilePath/Kenya_county_map_labelled_with_names.svg?width=700";

const MODULES = [
  {
    title: "Staff & Access Management",
    body: "Role-based accounts for National Admins, County Directors, Sub-County Officers, Field Officers, and Cooperative Managers — each seeing only what their role and county permit.",
  },
  {
    title: "Field Operations & Leave",
    body: "Weekly visit planning with manager sign-off, post-visit narrative reports, and a self-service leave portal for county staff.",
  },
  {
    title: "Cooperative Registry",
    body: "A searchable national directory of cooperatives across every value chain — coffee, tea, dairy, sugarcane, fisheries, SACCOs, and more — with a full member roll per society.",
  },
  {
    title: "Secure Document Management",
    body: "By-laws, audit reports, and AGM minutes move through a two-tier approval conveyor: Sub-County review, then Director sign-off, before anything is official.",
  },
  {
    title: "Governance & Election Tracking",
    body: "Automated committee term tracking and the statutory 1/3 gender rotation rule, with a logged Director override for exceptional cases.",
  },
];

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  if (loading || user) {
    return <div className="flex h-screen items-center justify-center text-gray-500">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Official tri-colour bar */}
      <div className="h-1.5 w-full bg-kenya-stripe" />

      {/* Top bar — compact on mobile: logo stays small and never competes with
          the farmer-facing content below it; nav collapses to a simple menu
          instead of squeezing four items into one row and overflowing. */}
      <header className="border-b border-gray-100 px-4 py-3 md:px-12 md:py-4">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2 md:gap-3">
            <img src={COAT_OF_ARMS_IMG} alt="Coat of Arms of Kenya" className="h-7 w-auto flex-shrink-0 md:h-10" />
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-kenya-black md:text-sm">Republic of Kenya</p>
              <p className="truncate text-[10px] text-gray-500 md:text-xs">State Dept. for Co-operatives</p>
            </div>
          </div>

          {/* Desktop nav */}
          <div className="hidden items-center gap-3 md:flex">
            <Link href="/member/login" className="text-sm font-medium text-kenya-black hover:underline">
              I&apos;m a Farmer
            </Link>
            <Link href="/login" className="rounded-md border border-kenya-green px-4 py-2 text-sm font-semibold text-kenya-green hover:bg-kenya-green/5">
              Staff Sign In
            </Link>
            <Link href="/signup" className="rounded-md bg-kenya-green px-4 py-2 text-sm font-semibold text-white hover:bg-kenya-green/90">
              Test-Run Signup
            </Link>
          </div>

          {/* Mobile menu toggle — a single compact button instead of four
              nav items fighting the logo for space on a narrow screen. */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-gray-200 md:hidden"
            aria-label="Toggle menu"
          >
            <span className="text-lg leading-none text-kenya-black">{menuOpen ? "✕" : "☰"}</span>
          </button>
        </div>

        {menuOpen && (
          <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3 md:hidden">
            <Link href="/member/login" className="rounded-md bg-kenya-green/5 px-4 py-2.5 text-center text-sm font-semibold text-kenya-green">
              I&apos;m a Farmer — Sign In
            </Link>
            <Link href="/login" className="rounded-md border border-kenya-green px-4 py-2.5 text-center text-sm font-semibold text-kenya-green">
              Staff Sign In
            </Link>
            <Link href="/signup" className="rounded-md bg-kenya-green px-4 py-2.5 text-center text-sm font-semibold text-white">
              Test-Run Signup
            </Link>
          </div>
        )}
      </header>

      {/* Hero — mobile-first: no fixed pixel height that can clip wrapped
          text on a narrow screen; the farmer-facing headline and CTA are the
          first and most prominent thing after the (now compact) header, not
          buried under a second block of official branding. */}
      <section className="relative overflow-hidden">
        <img
          src={HERO_IMG}
          alt="Tea farms in the Kenyan highlands"
          className="h-[320px] w-full object-cover sm:h-[400px] md:h-[460px]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-kenya-black/90 via-kenya-black/50 to-kenya-black/10 md:bg-gradient-to-r md:from-kenya-black/85 md:via-kenya-black/50 md:to-transparent" />
        <div className="absolute inset-0 flex items-end px-5 pb-8 sm:items-center sm:px-8 sm:pb-0 md:px-12">
          <div className="max-w-xl text-white">
            <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl md:text-4xl lg:text-5xl">
              National Cooperative Management &amp; Governance System
            </h1>
            <p className="mt-3 text-sm text-gray-100 sm:mt-4 sm:text-base md:text-lg">
              A single, secure digital home for every county&apos;s cooperative societies —
              membership records, field operations, legal documents, and governance
              compliance, built for all 47 counties of Kenya.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:mt-6 sm:flex-row">
              <Link
                href="/member/register"
                className="rounded-md bg-kenya-red px-5 py-3 text-center text-sm font-semibold text-white hover:bg-kenya-red/90 sm:py-2.5"
              >
                Register as a Farmer
              </Link>
              <Link
                href="/signup"
                className="rounded-md bg-white px-5 py-3 text-center text-sm font-semibold text-kenya-black hover:bg-gray-100 sm:py-2.5"
              >
                Staff Test-Run
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* What is this */}
      <section className="mx-auto max-w-5xl px-5 py-12 sm:px-6 md:px-12 md:py-16">
        <h2 className="text-xl font-bold text-kenya-black sm:text-2xl">What this platform does</h2>
        <p className="mt-3 max-w-3xl text-sm text-gray-600 sm:text-base">
          Kenya&apos;s cooperative movement spans coffee, tea, dairy, sugarcane, cotton,
          fisheries, livestock, housing and transport SACCOs, and more — thousands of
          societies overseen by County Departments of Co-operative Development. This
          system replaces manual registers and scattered spreadsheets with one
          governed, auditable platform: a national registry, a field-operations
          tracker for county staff, a document-approval pipeline for legal filings,
          and an automated governance engine that enforces statutory rules like
          committee term limits and the 1/3 gender rotation requirement.
        </p>

        <div className="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 sm:gap-5">
          {MODULES.map((m) => (
            <div key={m.title} className="rounded-xl border border-gray-200 p-4 shadow-sm sm:p-5">
              <h3 className="font-semibold text-kenya-green">{m.title}</h3>
              <p className="mt-2 text-sm text-gray-600">{m.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* National coverage */}
      <section className="bg-gray-50 py-12 md:py-16">
        <div className="mx-auto grid max-w-5xl items-center gap-8 px-5 sm:px-6 md:grid-cols-2 md:gap-10 md:px-12">
          <div>
            <h2 className="text-xl font-bold text-kenya-black sm:text-2xl">Built for all 47 counties</h2>
            <p className="mt-3 text-sm text-gray-600 sm:text-base">
              Every County Director sees only their own county&apos;s cooperatives and
              staff. A National Admin account has cross-county oversight for the
              State Department for Co-operatives — one dashboard, one governance
              standard, applied consistently from Mombasa to Turkana.
            </p>
            <p className="mt-3 text-sm text-gray-500">
              Pick your county after signing in to see local cooperatives, staff,
              and compliance status.
            </p>
          </div>
          <img
            src={COUNTY_MAP_IMG}
            alt="Map of the 47 counties of Kenya"
            className="mx-auto max-h-72 w-auto rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:max-h-96 sm:p-4"
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-5 py-8 text-center text-xs text-gray-400 sm:px-6 md:px-12">
        <p>
          <Link href="/privacy" className="font-medium text-kenya-green hover:underline">
            Privacy &amp; Data Governance Policy
          </Link>
        </p>
        <p className="mt-2">
          Photography: tea highlands, national flag, and county map via Wikimedia
          Commons (CC BY-SA).
        </p>
        <p className="mt-1">© {new Date().getFullYear()} Republic of Kenya — Pilot deployment for demonstration purposes.</p>
      </footer>
    </div>
  );
}
