import type { Metadata } from 'next';
import { DMCA_EMAIL, SITE_NAME } from '@/lib/site';

export const metadata: Metadata = {
  title: `DMCA / Copyright — ${SITE_NAME}`,
  description: `How to report copyright-infringing listings on ${SITE_NAME} and have them taken down from the directory.`,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-700">{children}</div>
    </section>
  );
}

export default function DmcaPage() {
  return (
    <article>
      <h1 className="text-4xl font-extrabold tracking-tight">Copyright / DMCA takedown</h1>
      <p className="mt-2 text-sm text-linkdrop-muted">Last updated: October 27, 2026.</p>

      <Section title="1. The short version">
        <p>
          {SITE_NAME} is a directory of links submitted by anonymous visitors; we do not host files. If a listing infringes
          your copyright, we will remove the listing promptly on notice. You do not need a lawyer or a company letterhead —
          email the elements below to the address at the bottom.
        </p>
      </Section>

      <Section title="2. Faster path for almost everyone">
        <p>
          Quickest and sufficient for most cases: the <strong>Report</strong> button on the resource card picks the
          &ldquo;Copyright&rdquo; reason. That already hides the listing while a human reviews it. A formal notice below adds
          the confirmation that we will keep the listing down permanently rather than reinstate it.
        </p>
      </Section>

      <Section title="3. Formal notice — what to send">
        <p>One email per note is fine when it contains:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>The exact LinkDrop page URL (all share the shape <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">/r/&lt;post-code&gt;</code>) and the resource link text.</li>
          <li>Which specific work(s) you own that are infringed, and where they legitimately live (e.g., the original page).</li>
          <li>Your contact info: name, email, and (if available) physical address or a company name/ID.</li>
          <li>A statement that you believe in good faith the listing is not authorized by the owner, their agent, or the law.</li>
          <li>A statement, under penalty of perjury, that the information is accurate and you are the owner or authorized to act for them.</li>
          <li>Your signature (typed name is acceptable by email).</li>
        </ul>
      </Section>

      <Section title="4. What we do on a valid notice">
        <ul className="list-disc space-y-1 pl-5">
          <li>Remove or disable the listing and keep it down permanently (not just hidden).</li>
          <li>Record the decision with its reason in our internal audit trail.</li>
          <li>Escalate repeat offenders: patterns of repeated infringing submissions get their publishing path closed.</li>
          <li>If you did not use the Report button, we may confirm the removal to you by email.</li>
        </ul>
      </Section>

      <Section title="5. If your listing was removed in error">
        <p>
          Send a short counter-notice to the same address: the removed listing&apos;s URL, why you believe the link was
          authorized (license, permission, or the file is your own), and your contact info. A claimant who knowingly
          misrepresents can be liable for damages; the same is true for a misdirected counter-notice.
        </p>
      </Section>

      <Section title="6. Notices go to">
        <p>
          <a href={`mailto:${DMCA_EMAIL}`} className="text-linkdrop-forest underline underline-offset-2">{DMCA_EMAIL}</a>
          <br />
          <span className="text-xs text-neutral-500">Replace this with your real inbox before launch — see the checklist in README.</span>
        </p>
      </Section>
    </article>
  );
}
