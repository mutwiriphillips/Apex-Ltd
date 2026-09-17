import Link from "next/link";

export const metadata = {
  title: "Privacy & Data Governance Policy — National Cooperative Management System",
  description: "How this platform collects, uses, protects, and governs member, staff, and asset data, under Kenyan law.",
};

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-gray-100 py-8 first:border-t-0 first:pt-0">
      <h2 className="text-xl font-bold text-kenya-black">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

const TOC = [
  ["scope", "1. Introduction & Scope"],
  ["legal-framework", "2. Legal Framework"],
  ["who", "3. Who This Policy Covers"],
  ["data-we-collect", "4. What Data We Collect"],
  ["why", "5. Why We Collect It"],
  ["legal-basis", "6. Legal Basis for Processing"],
  ["minimization", "7. Data Minimization & Accuracy"],
  ["assets", "8. Asset & Livestock Data — A Specific Note"],
  ["sharing", "9. Sharing Your Data — What We Never Do"],
  ["retention", "10. How Long We Keep Your Data"],
  ["security", "11. How We Protect Your Data"],
  ["rights", "12. Your Rights Under the Data Protection Act, 2019"],
  ["children", "13. Children's Data"],
  ["cross-border", "14. Cross-Border Considerations"],
  ["benefits", "15. How This Benefits You, Long Term"],
  ["governance", "16. Data Governance Framework"],
  ["contact", "17. Contact & Complaints"],
];

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="h-1.5 w-full bg-kenya-stripe" />

      <header className="border-b border-gray-100 px-6 py-5 md:px-12">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-kenya-green hover:underline">
            ← Back to Home
          </Link>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Effective from pilot launch, Embu County</p>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-12 md:px-12">
        <p className="text-xs font-bold uppercase tracking-widest text-kenya-gold">Republic of Kenya · Embu County Government</p>
        <h1 className="mt-2 text-3xl font-extrabold text-kenya-black md:text-4xl">
          Privacy &amp; Data Governance Policy
        </h1>
        <p className="mt-4 max-w-2xl text-gray-600">
          This policy explains how the National Cooperative Management &amp; Governance System collects,
          uses, protects, and governs the personal data, financial records, and asset data of cooperative
          members, cooperative managers, and county staff — and, just as importantly, what we commit to
          never doing with it.
        </p>

        {/* Table of contents */}
        <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-1 rounded-xl border border-gray-200 bg-gray-50 p-5 sm:grid-cols-2">
          {TOC.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="text-sm text-kenya-green hover:underline">
              {label}
            </a>
          ))}
        </div>

        <Section id="scope" title="1. Introduction & Scope">
          <p>
            The National Cooperative Management &amp; Governance System (&ldquo;the Platform&rdquo;) is
            operated on behalf of the County Government of Embu, Co-operative Development Department, and
            is architected to extend to other counties over time. This policy applies to every person whose
            data the Platform holds: cooperative members registered through the Member Portal, Cooperative
            Managers, and county staff (Field Officers, Sub-County Officers, County Directors, and National
            Admin accounts).
          </p>
          <p>
            This is a working policy for a pilot-stage government system, not a finished legal instrument.
            Bracketed items throughout mark decisions that require formal sign-off from the County
            Attorney or a registered Data Protection Officer before the Platform handles data at full
            production scale — they are flagged deliberately rather than answered with a guess.
          </p>
        </Section>

        <Section id="legal-framework" title="2. Legal Framework">
          <p>This policy is written against the following Kenyan legal instruments:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Constitution of Kenya, 2010</b>, Article 31 — the right to privacy</li>
            <li><b>Data Protection Act, 2019</b> (No. 24 of 2019) — Kenya&apos;s principal data protection
              law, enforced by the Office of the Data Protection Commissioner (ODPC)</li>
            <li><b>Data Protection (General) Regulations, 2021</b></li>
            <li><b>Co-operative Societies Act</b>, Cap. 490 — governs registration, membership records, and
              governance of cooperative societies</li>
            <li><b>Sacco Societies Act, 2008</b> — governs SACCOs specifically, relevant to the Platform&apos;s
              Transport and Housing SACCO value chains</li>
            <li><b>Movable Property Security Rights Act, 2017</b> — governs Kenya&apos;s official Collateral
              Registry; see Section 8 for how the Platform&apos;s asset records relate to it</li>
            <li><b>Access to Information Act, 2016</b> — governs public access to information held by a
              County Government as a public entity</li>
          </ul>
        </Section>

        <Section id="who" title="3. Who This Policy Covers">
          <ul className="list-disc space-y-1 pl-5">
            <li>Cooperative members registered on the Platform&apos;s Member Portal</li>
            <li>Cooperative Managers</li>
            <li>County staff — Field Officers, Sub-County Officers, County Directors, and National Admin accounts</li>
            <li>Cooperative societies themselves, as institutional record-holders (registration and governance data)</li>
          </ul>
        </Section>

        <Section id="data-we-collect" title="4. What Data We Collect">
          <p>Organized by category, matching exactly what the Platform&apos;s data model actually stores:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li><b>Identity data:</b> full legal name, National ID number, gender, date of registration</li>
            <li><b>Contact data:</b> phone number, and email where provided</li>
            <li><b>Financial data:</b> contributions, share capital, produce delivery values, and payouts —
              together, the cooperative&apos;s financial ledger</li>
            <li><b>Asset data</b> (Livestock, Poultry, Housing, and Transport SACCO cooperatives only): asset
              identifiers (ear tags, plate numbers, unit numbers), acquisition and current value, and a full
              lifecycle event history (health checks, valuations, transfers, sales, deaths, write-offs)</li>
            <li><b>Governance data:</b> committee membership, gender composition (needed to verify the
              statutory 1/3 gender-rotation rule), election records, and AGM minutes</li>
            <li><b>Document data:</b> by-laws, audit reports, and other statutory filings uploaded by a
              Cooperative Manager or Field Officer</li>
            <li><b>Staff employment data:</b> job group, designation, phone, county/ward assignment, and
              reporting line — staff accounts only, never collected for members</li>
            <li><b>System &amp; audit data:</b> login timestamps and a record of sensitive actions taken
              (document approvals, governance overrides, staff account changes) — see Section 11</li>
          </ul>
        </Section>

        <Section id="why" title="5. Why We Collect It">
          <p>Under the Data Protection Act, personal data must be collected for specified, explicit, and
            legitimate purposes. Ours are, in full:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Maintaining the cooperative register the County is required to keep</li>
            <li>Verifying and enforcing governance compliance — committee term limits and the 1/3
              gender-rotation rule — under the Co-operative Societies Act</li>
            <li>Producing a transparent financial ledger so members and Directors can verify exactly what
              happened, and when</li>
            <li>Generating a credit-readiness score and exportable report a cooperative can voluntarily
              present to a bank or lender (see Section 9 — this is never automatic)</li>
            <li>Producing a per-member asset statement for a farmer&apos;s own use</li>
            <li>Giving members direct visibility into their own record via the Member Portal</li>
            <li>Statutory and audit record-keeping</li>
          </ul>
        </Section>

        <Section id="legal-basis" title="6. Legal Basis for Processing">
          <p>Each category of processing rests on one of the bases the Act recognizes:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Performance of a task in the public interest / exercise of official authority</b> — the
              primary basis for staff-collected registry, governance, and compliance data</li>
            <li><b>Consent</b> — for member self-registration through the Member Portal, and for any
              member-initiated digital contribution</li>
            <li><b>Legal obligation</b> — record-keeping required under the Co-operative Societies Act</li>
            <li><b>Legitimate interest, narrowly applied</b> — producing a credit-readiness report, and only
              when the cooperative or member requests one</li>
          </ul>
        </Section>

        <Section id="minimization" title="7. Data Minimization & Accuracy">
          <p>
            The Platform does not collect biometric, health, religious, or political data, or anything else
            unrelated to cooperative business — only what each purpose in Section 5 structurally requires.
            If your National ID or phone number is recorded incorrectly, ask your Cooperative Manager or
            Sub-County Officer to correct it; see Section 12 for your formal right to correction.
          </p>
        </Section>

        <Section id="assets" title="8. Asset & Livestock Data — A Specific Note">
          <p>
            For Livestock, Poultry, Housing, and Transport SACCO cooperatives, the Platform separately
            tracks discrete assets — a dairy cow, a boda boda, a housing unit — under a member&apos;s name,
            including a complete lifecycle event history.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>This is a factual, staff-verified inventory record. It exists to give a member and their
              cooperative a reliable ownership and condition history — it does not itself create or
              register a security interest over that asset.</li>
            <li>The Platform is deliberately <b>not</b> a substitute for, and does not duplicate, Kenya&apos;s
              official Collateral Registry under the Movable Property Security Rights Act, 2017. If a
              member wants to use an asset as loan collateral, that registration happens at the official
              Collateral Registry (Business Registration Service) — this Platform&apos;s asset statement is
              simply clean supporting documentation, offered to make that process easier, never a
              replacement for it.</li>
            <li>Only the member themselves, their Cooperative Manager, and the relevant county oversight
              roles can view or amend this data. It is never sold, and never shared with a lender without
              the member or cooperative actively generating and handing over the statement themselves.</li>
          </ul>
        </Section>

        <Section id="sharing" title="9. Sharing Your Data — What We Never Do">
          <ul className="list-disc space-y-2 pl-5">
            <li>We do <b>not</b> sell personal or asset data to any third party.</li>
            <li>We do <b>not</b> share your credit-readiness score or financial ledger with a bank, SACCO
              apex body, or lender automatically — a cooperative or member must actively request and
              export that report themselves.</li>
            <li>We do <b>not</b> accept a referral fee, commission, or any payment from a lender in exchange
              for data shared this way. The Platform is a trust layer, never a lender, and never a broker.</li>
            <li>Access inside the Platform is strictly role- and county-scoped: a Cooperative Manager can
              only see their own cooperative&apos;s members; a County Director can only see their own
              county&apos;s cooperatives and staff. Only a National Admin account has cross-county
              visibility, and every such access is written to the audit trail described in Section 11.</li>
          </ul>
        </Section>

        <Section id="retention" title="10. How Long We Keep Your Data">
          <ul className="list-disc space-y-2 pl-5">
            <li>Membership, governance, and financial ledger records are retained for the lifetime of the
              cooperative&apos;s registration <span className="italic text-gray-500">[plus a specific
              statutory retention period, to be confirmed with the County Attorney against Co-operative
              Societies Act record-keeping requirements]</span>.</li>
            <li>Audit logs are retained indefinitely as the institutional record of who did what, and when.</li>
            <li>A member may request deactivation of their own portal account at any time; the underlying
              financial and governance records are retained as part of the cooperative&apos;s statutory
              register even after account deactivation, since these are the cooperative&apos;s records, not
              solely the individual&apos;s.</li>
          </ul>
        </Section>

        <Section id="security" title="11. How We Protect Your Data">
          <ul className="list-disc space-y-2 pl-5">
            <li>Five distinct staff roles, each scoped by county and cooperative, with that scoping verified
              through deliberate access-control testing rather than assumed to work.</li>
            <li>A completely separate authentication system for members versus staff — a farmer&apos;s login
              can never be used to reach staff functions or another member&apos;s data, by design, not just
              by policy.</li>
            <li>Passwords are cryptographically hashed and never stored in plain text.</li>
            <li>Every sensitive action — a document approval, a governance override, a staff account change,
              a credit assessment being run — is written to an immutable audit trail.</li>
            <li>Data in transit is encrypted (HTTPS/TLS).</li>
          </ul>
        </Section>

        <Section id="rights" title="12. Your Rights Under the Data Protection Act, 2019">
          <p>Under Section 26 of the Act, as a data subject you have the right to:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Be informed of how your personal data is used — this policy</li>
            <li>Access your personal data — members, via the Member Portal; staff, on request to your
              County Director</li>
            <li>Object to processing of your data</li>
            <li>Have false or misleading data about you corrected</li>
            <li>Have false or misleading data about you deleted</li>
            <li>Lodge a complaint with the Office of the Data Protection Commissioner (ODPC), Kenya, if you
              believe your rights have been violated — <span className="text-kenya-green">www.odpc.go.ke</span></li>
          </ul>
        </Section>

        <Section id="children" title="13. Children's Data">
          <p>
            Cooperative membership under the Co-operative Societies Act requires a member to be of legal
            age (18 years or older) and to hold a National ID. The Platform does not knowingly collect data
            from minors.
          </p>
        </Section>

        <Section id="cross-border" title="14. Cross-Border Considerations">
          <p>
            The Platform currently runs on cloud infrastructure that may process data outside Kenya. Under
            Section 48 of the Act, a cross-border transfer of personal data requires appropriate safeguards.
            <span className="italic text-gray-500"> [The County Government should formally complete a
            Section 48 transfer assessment, and execute a data processing agreement with the hosting
            provider, before the Platform handles live farmer data beyond the pilot stage.]</span>
          </p>
        </Section>

        <Section id="benefits" title="15. How This Benefits You, Long Term">
          <ul className="list-disc space-y-2 pl-5">
            <li>A permanent, tamper-evident record of your membership, contributions, and produce that
              survives staff turnover, lost paperwork, or a change of Cooperative Manager.</li>
            <li>A credit-readiness score built from your own real history — not a stranger&apos;s guess —
              that you and your cooperative control when and whether to share.</li>
            <li>Transparent proof of exactly what you were paid, and when, for every produce delivery.</li>
            <li>An asset record that stays with you and travels with your membership, not with whichever
              staff member happened to be on duty when you acquired it.</li>
            <li>A governance protection that is verifiably counted, not left to memory — the 1/3 gender
              rule is enforced by the system itself.</li>
          </ul>
        </Section>

        <Section id="governance" title="16. Data Governance Framework">
          <ul className="list-disc space-y-2 pl-5">
            <li><b>Data Controller:</b> County Government of Embu, Co-operative Development Department.
              <span className="italic text-gray-500"> [To confirm formal registration as a Data Controller
              with the ODPC under Section 18 of the Act, if not already completed, before scaling beyond
              the pilot.]</span></li>
            <li><b>Data Protection Officer:</b> <span className="italic text-gray-500">[to be appointed
              under Section 24 of the Act — required once processing reaches the scale this Platform is
              built for]</span></li>
            <li><b>Roles &amp; access:</b> formally documented in the Platform&apos;s own role model —
              National Admin, County Director, Sub-County Officer, Field Officer, Cooperative Manager, and
              Member — each scoped exactly as described in Section 9.</li>
            <li><b>Incident response:</b> <span className="italic text-gray-500">[the County should
              establish a formal breach-notification procedure — Section 43 of the Act requires notifying
              the ODPC within 72 hours of becoming aware of a breach likely to result in risk to a data
              subject]</span>.</li>
            <li><b>Review cycle:</b> this policy should be reviewed at least annually, or immediately after
              any material change to the Platform, by the Co-operative Development Department in
              consultation with the technical team.</li>
          </ul>
        </Section>

        <Section id="contact" title="17. Contact & Complaints">
          <p>
            For questions about this policy, or to exercise any of the rights in Section 12, contact the
            Co-operative Development Department, County Government of Embu
            <span className="italic text-gray-500"> [Data Protection Officer contact to be added once
            appointed]</span>. If you are not satisfied with the response, you may lodge a complaint with
            the Office of the Data Protection Commissioner at{" "}
            <span className="text-kenya-green">www.odpc.go.ke</span>.
          </p>
        </Section>

        <div className="mt-10 rounded-xl border border-kenya-gold/40 bg-kenya-gold/5 p-5 text-xs text-gray-600">
          This is a working pilot-stage policy, not a finished legal instrument. Every bracketed item above
          needs a named decision-owner and a signed-off answer before this Platform is trusted with data at
          full production scale.
        </div>
      </div>
    </div>
  );
}
