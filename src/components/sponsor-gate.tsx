'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * The search interstitial: a 5-second skippable sponsored screen shown when a
 * visitor clicks "Find resource". Two honest modes —
 *   1. a real, approved promotion (socked link rel="nofollow sponsored"), or
 *   2. the "slot is earned, not bought" house card while nobody holds it.
 * The gate NEVER invents ad content (no fake inventory, no dummy brands).
 *
 * Owner knobs: SKIP_SECONDS (length of the wait) and COOLDOWN_MS (how often
 * the same visitor may see it). Set COOLDOWN_MS to 0 to show on every search.
 */

export const SKIP_SECONDS = 5;
export const COOLDOWN_MS = 10 * 60 * 1000; // show at most once per 10 minutes

const GATE_AT_KEY = 'linkdrop-gate-at';

/** Cooldown check shared by the submit handler. */
export function gateCooldownActive(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(GATE_AT_KEY) ?? 0);
    return Date.now() - last < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function gateShownNow() {
  try {
    window.sessionStorage.setItem(GATE_AT_KEY, String(Date.now()));
  } catch {
    // storage unavailable (Safari private) — gate still works, no persistence
  }
}

type GateSponsor = {
  active?: boolean;
  username?: string | null;
  headline?: string | null;
  detail?: string | null;
  targetUrl?: string | null;
};

export function SponsorGate({ open, onDone }: { open: boolean; onDone: () => void }) {
  const [sponsor, setSponsor] = useState<GateSponsor | null>(null);
  const [seconds, setSeconds] = useState(SKIP_SECONDS);

  // Load the live sponsor on open; reset the countdown for this showing.
  useEffect(() => {
    if (!open) return;
    gateShownNow();
    let alive = true;
    setSeconds(SKIP_SECONDS);
    setSponsor(null);
    fetch('/api/public/sponsor', { cache: 'no-store' })
      .then((response) => response.json() as Promise<GateSponsor>)
      .then((payload) => {
        if (alive) setSponsor(payload);
      })
      .catch(() => {
        if (alive) setSponsor({ active: false });
      });
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  if (!open) return null;

  const hasSponsor = sponsor !== null
    && sponsor.active === true
    && Boolean(sponsor.headline && sponsor.targetUrl);
  const pending = sponsor === null;
  const skipEnabled = !pending && seconds === 0;
  const progress = ((SKIP_SECONDS - seconds) / SKIP_SECONDS) * 100;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sponsored interstitial"
      className="fixed inset-0 z-50 grid place-items-center bg-[#101408]/60 p-5 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="h-1 w-full bg-neutral-100">
          <div className="h-full bg-linkdrop-lime transition-[width] duration-1000 ease-linear" style={{ width: `${pending ? 0 : progress}%` }} />
        </div>

        <div className="p-7">
          {hasSponsor ? (
            <>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-linkdrop-muted">
                Sponsored · promoted by @{sponsor?.username}
              </p>
              <a
                href={sponsor?.targetUrl ?? '#'}
                target="_blank"
                rel="noreferrer nofollow sponsored"
                onClick={onDone}
                className="mt-2 block text-lg font-extrabold leading-snug text-linkdrop-ink underline decoration-[#cbe3a8] decoration-4 underline-offset-4"
              >
                {sponsor?.headline}
              </a>
              {sponsor?.detail && <p className="mt-2 text-sm leading-relaxed text-linkdrop-muted">{sponsor.detail}</p>}
              <p className="mt-4 text-[11px] leading-relaxed text-neutral-500">
                This ad was earned — its owner is at the top of the live leaderboard. Automated placement, owner-reviewed content; not an endorsement.
              </p>
            </>
          ) : pending ? (
            <>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-linkdrop-muted">Sponsor slot</p>
              <p className="mt-2 h-5 w-40 animate-pulse rounded bg-neutral-200" />
              <p className="mt-3 h-3 w-full animate-pulse rounded bg-neutral-100" />
              <p className="mt-1 h-3 w-2/3 animate-pulse rounded bg-neutral-100" />
            </>
          ) : (
            <>
              <p className="text-[10px] font-extrabold uppercase tracking-[0.15em] text-linkdrop-muted">Promo slot · let&apos;s settle it with content</p>
              <p className="mt-2 text-lg font-extrabold leading-snug">Every ad here is earned — not bought.</p>
              <p className="mt-2 text-sm leading-relaxed text-linkdrop-muted">
                The sponsor of this search is whoever holds the top of the{' '}
                <Link href="/leaderboard" onClick={onDone} className="font-bold text-linkdrop-forest underline underline-offset-2">live leaderboard</Link>{' '}
                — computed automatically from genuinely-live links. Share authentic resources and this could be your link.
              </p>
              <Link
                href="/login"
                onClick={onDone}
                className="mt-4 inline-block rounded-xl bg-linkdrop-lime px-5 py-2.5 text-sm font-bold text-[#1a2410] transition hover:brightness-95"
              >
                Claim your username →
              </Link>
            </>
          )}

          <div className="mt-6 flex items-center justify-between border-t border-linkdrop-line pt-4">
            <p className="text-[11px] text-neutral-500">{skipEnabled ? 'Thanks for keeping the community fair.' : `Continue in ${pending ? '…' : `${seconds}s`}`}</p>
            <button
              onClick={() => {
                onDone();
              }}
              disabled={!skipEnabled}
              className="rounded-xl border border-linkdrop-line bg-white px-5 py-2.5 text-sm font-bold text-linkdrop-ink transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? 'Loading…' : skipEnabled ? 'Skip ad →' : `Please wait ${seconds}s`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
