/**
 * Privacy notice (DESIGN.md §2f compliance-ops, 2026-07-28) — DRAFT for
 * counsel review, not final legal text (LEGAL_REVIEW.md Q14-Q17). Public
 * route, no auth. Includes the subprocessor register — keep that table
 * current whenever a processor is added or a region changes.
 */
export default function PrivacyNoticePage() {
  return (
    <main className="mx-auto w-full max-w-[720px] px-5 py-14">
      <h1 className="text-2xl font-semibold">Privacy Notice</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Draft — pending legal review. Last updated 28 July 2026.
      </p>

      <section className="mt-8 space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold">What we collect and why</h2>
        <p>
          JumpOnBoard processes your resume and career data to match you with job opportunities.
          Your raw resume is stored privately — only you can access it. Recruiters only ever see a
          redacted, pseudonymized profile, and your name is disclosed only through the reveal flow
          you control. Redaction reduces but cannot eliminate re-identification risk; we manage
          this as a disclosed, ongoing risk with layered controls rather than claiming anonymity.
        </p>

        <h2 className="text-lg font-semibold">Your consents</h2>
        <p>
          At signup you consent to (1) AI processing and redaction of your resume data and (2)
          automated AI matching (profiling) between your pseudonymized profile and job postings —
          both are required because they are the service itself. Separately and optionally, you
          may consent to (3) continuous AI resume maintenance and (4) contribution to k-anonymized
          aggregate market insights; both are independently withdrawable in your profile settings
          at any time.
        </p>

        <h2 className="text-lg font-semibold">Automated matching, human control</h2>
        <p>
          AI never changes your profile on its own: every AI-drafted update is suggest-and-approve
          — nothing is committed without your explicit approval. Matching is automated; disclosure
          of your identity to any recruiter is not, and every cross-party disclosure is recorded
          in an append-only access log.
        </p>

        <h2 className="text-lg font-semibold">Access, correction, deletion</h2>
        <p>
          You can access and correct your data in the app. For a full data access, correction, or
          deletion request, contact privacy@jumponboard.hk — we respond within the statutory
          windows of Hong Kong&apos;s PDPO and Singapore&apos;s PDPA.
        </p>

        <h2 className="text-lg font-semibold">Subprocessors and data location</h2>
        <p>
          Primary storage is in AWS ap-east-1 (Hong Kong) via Supabase. AI redaction and embedding
          run on Modal in the Asia-Pacific region. Cross-border transfers are covered by data
          processing agreements consistent with PDPA §26 / PDPO requirements.
        </p>
        <table className="mt-2 w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b text-left">
              <th className="py-1.5 pr-3 font-semibold">Processor</th>
              <th className="py-1.5 pr-3 font-semibold">Purpose</th>
              <th className="py-1.5 font-semibold">Region</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-1.5 pr-3">Supabase</td>
              <td className="py-1.5 pr-3">Database, auth, file storage</td>
              <td className="py-1.5">AWS ap-east-1 (Hong Kong)</td>
            </tr>
            <tr className="border-b">
              <td className="py-1.5 pr-3">Modal</td>
              <td className="py-1.5 pr-3">AI redaction &amp; embeddings (self-hosted open-weight models)</td>
              <td className="py-1.5">Asia-Pacific (region-pinned)</td>
            </tr>
            <tr className="border-b">
              <td className="py-1.5 pr-3">Cloudflare</td>
              <td className="py-1.5 pr-3">Application hosting &amp; CDN</td>
              <td className="py-1.5">Global edge network</td>
            </tr>
          </tbody>
        </table>

        <h2 className="text-lg font-semibold">What we never do</h2>
        <p>
          We never sell or share individual personal data. Aggregate market signals are produced
          only from separately opted-in profiles, only over cohorts of at least 20 people, and
          never expose, rank, or link an individual. Candidate-derived data is never sent to
          third-party frontier AI APIs.
        </p>
      </section>
    </main>
  );
}
