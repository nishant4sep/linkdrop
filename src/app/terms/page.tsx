import type { Metadata } from 'next';
import { CONTACT_EMAIL, SITE_NAME, SITE_NOTAFFILIATED } from '@/lib/site';
import LegalShell from '@/components/legal-shell';

export const metadata: Metadata = {
  title: `Terms of Use — ${SITE_NAME}`,
  description: `${SITE_NAME} is a community directory of resource links shared for Instagram posts and Reels. Plain-language terms of use.`,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-700">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <LegalShell>
      <article>
      <h1 className="text-4xl font-extrabold tracking-tight">Terms of Use</h1>
      <p className="mt-2 text-sm text-linkdrop-muted">Last updated: October 27, 2026. Written in plain language on purpose.</p>

      <Section title={`1. What ${SITE_NAME} is`}>
        <p>
          {SITE_NAME} is a public directory: anyone can search a publicly posted Instagram link and see whether the community
          has shared a resource document for it (presets, templates, PDFs, project files, and similar). Anyone can add a
          missing resource link anonymously. LinkDrop has no accounts required for that flow, does not scrape Instagram, and
          {SITE_NOTAFFILIATED.toLowerCase()}
        </p>
        <p>
          Links published anonymously go live immediately and are visible until someone reports them; the first report hides
          the link while our team reviews it. We remove what we judge to be unlawful, misleading, or harmful — you do not need
          to be a registered user to ask us to remove something.
        </p>
      </Section>

      <Section title="2. What you may and may not do">
        <ul className="list-disc space-y-1 pl-5">
          <li>Share only links you are allowed to share; you are responsible for what you publish.</li>
          <li>Do not post malware, phishing, anything illegal, or sexual content involving minors (we remove and keep records to report).</li>
          <li>Do not bot or script the site beyond normal human use; rate limits apply per visitor.</li>
          <li>Do not attempt to deanonymize other visitors. We store no raw IP addresses — only salted one-way hashes we cannot reverse.</li>
        </ul>
      </Section>

      <Section title="3. Copyright and takedowns">
        <p>
          If your material was shared on LinkDrop without permission, follow the procedure on our <a href="/dmca" className="text-linkdrop-forest underline underline-offset-2">DMCA page</a>.
          Submitted resources are unverified links to third-party destinations; we do not host the underlying files, but we
          honor takedown requests against the directory listing and follow up on repeat offenders.
        </p>
      </Section>

      <Section title="4. No warranty">
        <p>
          The directory is provided as-is. Community-submitted links are unverified; a listing is not our endorsement.
          Check a destination before downloading anything. We do not promise the directory will always be available, accurate,
          or uninterrupted.
        </p>
      </Section>

      <Section title="5. Liability">
        <p>
          To the fullest extent permitted by law, LinkDrop is not liable for damages arising from third-party content reached
          via the directory, including the content of submitted links. Nothing here limits liability that cannot be limited
          by law.
        </p>
      </Section>

      <Section title="6. Termination and moderation">
        <p>
          We may hide, remove, or refuse any listing, and we may disable an anonymous visitor&apos;s ability to interact
          (fingerprinted rate limits) when the abuse is clear. We will keep the reason and action recorded internally.
        </p>
      </Section>

      <Section title="7. Changes to these terms">
        <p>When these terms change materially, this page&apos;s date at the top updates. Continued use after a change means acceptance of the changed terms.</p>
        <p className="pt-2">Questions: <a href={`mailto:${CONTACT_EMAIL}`} className="text-linkdrop-forest underline underline-offset-2">{CONTACT_EMAIL}</a></p>
      </Section>
      </article>
    </LegalShell>
  );
}
