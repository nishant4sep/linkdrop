import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * Shared chrome for /terms, /privacy, /dmca. Kept deliberately plain so the
 * pages stay readable, indexable, and honest: these are plain-language policy
 * drafts, not legal advice.
 */
export default function LegalShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-linkdrop-paper text-linkdrop-ink">
      <header className="border-b border-linkdrop-line bg-linkdrop-paper/90">
        <div className="mx-auto flex h-[68px] w-[min(760px,calc(100%-40px))] items-center justify-between">
          <Link href="/" className="text-lg font-extrabold tracking-tighter">
            linkdrop<span className="text-linkdrop-forest">.</span>
          </Link>
          <nav className="flex items-center gap-4 text-xs font-semibold text-linkdrop-muted">
            <Link href="/privacy" className="transition-colors hover:text-linkdrop-ink">Privacy</Link>
            <Link href="/terms" className="transition-colors hover:text-linkdrop-ink">Terms</Link>
            <Link href="/dmca" className="transition-colors hover:text-linkdrop-ink">DMCA</Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-[min(760px,calc(100%-40px))] pb-24 pt-10">{children}</main>
      <footer className="border-t border-linkdrop-line bg-white px-5 py-6">
        <p className="mx-auto w-[min(760px,100%)] text-center text-xs text-neutral-500">
          Plain-language policy drafts, updated by hand — not legal advice.
        </p>
      </footer>
    </div>
  );
}
