import type { Metadata } from 'next';
import { CONTACT_EMAIL, SITE_NAME } from '@/lib/site';
import LegalShell from '@/components/legal-shell';

export const metadata: Metadata = {
  title: `Privacy — ${SITE_NAME}`,
  description: `${SITE_NAME} stores no raw IP addresses and no personal data for anonymous use. What we store and why, in plain language.`,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-neutral-700">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <LegalShell>
      <article>
      <h1 className="text-4xl font-extrabold tracking-tight">Privacy — what we store</h1>
      <p className="mt-2 text-sm text-linkdrop-muted">Last updated: October 27, 2026. Short by design: we deliberately collect as close to nothing as the features allow.</p>

      <Section title="1. Using LinkDrop anonymously">
        <p>
          You can search and add resources with zero personal information. We never ask for an email, a phone number, or a
          real name in that flow. We do not run advertising trackers, social pixels, or session-recording analytics.
        </p>
      </Section>

      <Section title="2. Visitor fingerprints (only means of keeping the site clean)">
        <p>
          To rate-limit abuse (max submissions and reports per visitor) and to know a repeat abuser when we see one, we reduce
          your IP address to a <strong>salted SHA-256 hash</strong> before anything is stored. A hash cannot be reversed, and
          the salt never leaves our server. We do not store the raw IP behind it, permanent identifiers, or cross-link your
          browsing. If the salt is rotated, all fingerprints become useless on purpose — we lose the abuse history rather
          than expand the tracking.
        </p>
      </Section>

      <Section title={`3. What ${SITE_NAME} stores when you contribute`}>
        <ul className="list-disc space-y-1 pl-5">
          <li>The Instagram post URL you looked up, plus its normalized post code.</li>
          <li>The resource link you added, its type, and the optional description you typed.</li>
          <li>Your visitor fingerprint hash (see above) — for rate limiting and abuse review.</li>
          <li>If you report a link: the reason and details you typed, plus your fingerprint hash.</li>
        </ul>
      </Section>

      <Section title="4. What we deliberately do not store">
        <ul className="list-disc space-y-1 pl-5">
          <li>Raw IP addresses — only their one-way hashes.</li>
          <li>Any self-identification from anonymous visitors (there is nothing to de-anonymize users by).</li>
          <li>Additionally, if you have a registered account (optional/dormant flow), standard Supabase auth data applies as its privacy policy describes.</li>
        </ul>
      </Section>

      <Section title="5. Cookies and browser storage">
        <p>
          Anonymous use needs no cookies from us. A registered session (optional flow) stores a Supabase auth token in your
          browser only.
        </p>
      </Section>

      <Section title="6. Deletion requests and retention">
        <p>
          Directory contributions are inherently public, and we keep published links visible while they are useful to other
          visitors. If you would like something you added removed, or have any privacy-related question about what a row
          contains, write to <a href={`mailto:${CONTACT_EMAIL}`} className="text-linkdrop-forest underline underline-offset-2">{CONTACT_EMAIL}</a>.
          We will honor removal requests against specific rows you can identify (e.g., the exact resource URL) without needing
          you to identify yourself beyond that.
        </p>
      </Section>

      <Section title="7. Reporting abuse">
        <p>Bad links are reported right on the card and reviewed by a human. See <a href="/terms" className="text-linkdrop-forest underline underline-offset-2">Terms</a> for the removal promises.</p>
        <p className="pt-2">{SITE_NAME} is an independent project and is not affiliated with Instagram or Meta Platforms, Inc.</p>
      </Section>
      </article>
    </LegalShell>
  );
}
