"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useLinkDropSession } from "@/components/use-linkdrop-session";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { PublicLinkCard } from "@/components/public-link-card";
import { SubmitPublic } from "@/components/submit-public";

type Resource = { id: string; url: string; type: string; description: string | null; addedAt: string | null };

export default function Home() {
  const { session, loading } = useLinkDropSession();
  const [url, setUrl] = useState("");
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [postCode, setPostCode] = useState("");
  const [resources, setResources] = useState<Resource[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [searched, setSearched] = useState(false);

  async function resolve(e: FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError("");
    setMessage("");
    setResources([]);
    setSearched(false);
    try {
      const response = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not check that link.");
      setCanonicalUrl(data.postUrl);
      setPostCode(data.postCode ?? "");
      setResources((data.resources ?? []).map((r: Resource) => r));
      setMessage(data.message);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setChecking(false);
    }
  }

  function signOut() {
    supabaseBrowser().auth.signOut().then(() => {
      window.location.reload();
    });
  }

  // Scroll the results into view once a lookup completes.
  useEffect(() => {
    if (searched) {
      document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [searched, resources.length]);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-linkdrop-paper text-sm text-linkdrop-muted">
        Loading LinkDrop…
      </main>
    );
  }

  const hasResults = resources.length > 0;

  return (
    <div className="min-h-screen bg-linkdrop-paper text-linkdrop-ink">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-linkdrop-line bg-linkdrop-paper/90 backdrop-blur">
        <div className="mx-auto flex h-[72px] w-[min(1060px,calc(100%-40px))] items-center justify-between gap-4">
          <Link href="/" className="text-[22px] font-extrabold tracking-tighter text-linkdrop-ink">
            linkdrop<span className="text-linkdrop-forest">.</span>
          </Link>
          <nav className="flex items-center gap-5">
            <a href="#how-it-works" className="hidden text-sm text-linkdrop-muted transition-colors hover:text-linkdrop-ink sm:block">
              How it works
            </a>
            {session ? (
              <>
                <Link href="/dashboard" className="hidden text-sm text-linkdrop-muted transition-colors hover:text-linkdrop-ink sm:block">
                  Your workspace
                </Link>
                <button
                  onClick={signOut}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-linkdrop-ink shadow-sm ring-1 ring-linkdrop-line transition-colors hover:bg-neutral-50"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="rounded-lg bg-linkdrop-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-black"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      {/* Hero + lookup */}
      <section className="px-5 pb-14 pt-20 sm:px-8 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow-chip inline-flex items-center gap-2 rounded-full border border-linkdrop-line bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-linkdrop-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-linkdrop-forest" />
            Community resource finder
          </p>
          <h1 className="mt-7 text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
            Find the resource.
            <br />
            <span className="text-linkdrop-muted">Skip the ritual.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-linkdrop-muted sm:text-lg">
            No “comment LINK.” No waiting for a DM. Paste the Instagram post and check whether someone has already shared its resource.
          </p>
        </div>

        <div className="mx-auto mt-12 w-[min(680px,100%)]">
          <form onSubmit={resolve}>
            <label htmlFor="post" className="mb-2 block text-xs font-bold text-linkdrop-ink">
              Instagram post or Reel URL
            </label>
            <div className="flex flex-col gap-2.5 rounded-2xl border border-linkdrop-line bg-white p-2.5 shadow-soft sm:flex-row sm:items-center">
              <input
                id="post"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.instagram.com/reel/…"
                required
                maxLength={2048}
                className="min-w-0 flex-1 rounded-xl px-4 py-3 text-sm outline-none placeholder:text-neutral-400"
              />
              <button
                disabled={checking}
                className="rounded-xl bg-linkdrop-lime px-6 py-3 text-sm font-bold text-[#1a2410] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {checking ? "Checking…" : "Find resource ↗"}
              </button>
            </div>
          </form>
          <p className="mt-3 text-center text-xs text-neutral-500">
            Community-shared links, no sign-up, instant publishing. Bad link? One tap reports it.
          </p>
        </div>
      </section>

      {/* Results */}
      <section id="results" className="scroll-mt-24 px-5 sm:px-8">
        <div className="mx-auto w-[min(680px,100%)] space-y-4">
          {error && (
            <div role="alert" className="rounded-xl bg-[#fff0ee] p-4 text-sm text-[#923b36]">
              {error}
            </div>
          )}
          {message && searched && (
            <div role="status" className="flex flex-col gap-2 rounded-xl bg-[#edf5e4] p-4 text-sm text-[#4d5a3f]">
              <span>{message}</span>
              {postCode && (
                <Link href={`/r/${postCode}`} className="text-xs font-bold text-linkdrop-forest underline underline-offset-2">
                  Open this post&apos;s permanent page — share it so Google can index it too →
                </Link>
              )}
            </div>
          )}
          {hasResults && (
            <div className="space-y-3 pt-2">
              {resources.map((r) => (
                <PublicLinkCard key={r.id} resource={r} />
              ))}
            </div>
          )}
          {searched && !hasResults && canonicalUrl && (
            <>
              <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
                <p className="font-semibold">Nothing matched yet</p>
                <p className="mt-1 text-sm text-linkdrop-muted">Have the link from the creator&apos;s DM? Add it below — 20 seconds, no account, live instantly for the next person.</p>
              </div>
              <div id="contribute" className="pt-4">
                <SubmitPublic canonicalUrl={canonicalUrl} postCode={postCode} />
              </div>
            </>
          )}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t border-linkdrop-line px-5 py-16 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-linkdrop-muted">How it works</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">Three steps, zero waiting</h2>
          <p className="mt-4 text-sm text-linkdrop-muted">No scraping, no DMs, no guessing. Just community-shared resource links.</p>
        </div>
        <div className="mx-auto mt-12 grid max-w-5xl gap-4 sm:grid-cols-3">
          {[
            { step: "01", title: "Paste the post", desc: "Use the public URL of an Instagram post or Reel that promised a resource." },
            { step: "02", title: "Check the directory", desc: "Links shared by the community appear instantly. Report and any bad link vanishes in a second." },
            { step: "03", title: "Share what you find", desc: "Missing? Add it in 20 seconds, no account needed, and every future visitor gets it." },
          ].map((step) => (
            <article key={step.step} className="rounded-2xl border border-linkdrop-line bg-white p-8 shadow-soft transition-transform duration-200 hover:-translate-y-1">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#eaf4df] text-xs font-extrabold text-linkdrop-forest">
                {step.step}
              </span>
              <h3 className="mt-5 text-lg font-bold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-linkdrop-muted">{step.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-linkdrop-line bg-white px-5 py-8 sm:px-8">
        <div className="mx-auto flex w-[min(1060px,100%)] flex-col items-center justify-between gap-4 md:flex-row">
          <Link href="/" className="flex items-center gap-1 text-lg font-extrabold tracking-tighter">
            linkdrop<span className="text-linkdrop-forest">.</span>
          </Link>
          <p className="text-xs text-neutral-500">Independent project. Not affiliated with Instagram or Meta.</p>
          <div className="flex items-center gap-5 text-xs font-medium text-linkdrop-ink">
            <Link href="/terms" className="transition-colors hover:text-linkdrop-forest">Terms</Link>
            <Link href="/privacy" className="transition-colors hover:text-linkdrop-forest">Privacy</Link>
            <Link href="/dmca" className="transition-colors hover:text-linkdrop-forest">DMCA</Link>
            <Link href="/dashboard" className="transition-colors hover:text-linkdrop-forest">Your workspace</Link>
            {session && (
              <button onClick={signOut} className="transition-colors hover:text-linkdrop-forest">Sign out</button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
