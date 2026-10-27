import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/lib/server';
import { PublicLinkCard } from '@/components/public-link-card';
import { SubmitPublic } from '@/components/submit-public';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ code: string }> };

type Resource = { id: string; url: string; type: string; description: string | null; addedAt: string | null };

/** Absolute origin, correct in dev (3002) and production without env juggling. */
async function origin(): Promise<string> {
  const headers = await import('next/headers').then((m) => m.headers());
  const host = headers.get('host') ?? 'localhost:3000';
  const proto = headers.get('x-forwarded-proto')?.replace(/:.*/,'').trim()
    ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

const CODE_PATTERN = /^[A-Za-z0-9_-]{5,40}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  if (!CODE_PATTERN.test(code)) return { robots: { index: false, follow: false } };

  try {
    const base = await origin();
    const { resources } = await loadResources(code);
    const title = resources.length
      ? `Resources for Instagram post ${code} — LinkDrop`
      : `Instagram post ${code} — add or find its resources on LinkDrop`;
    const description = resources.length
      ? `${resources.length} community-shared resource${resources.length === 1 ? '' : 's'} (presets, PDFs, templates) linked to Instagram post ${code}.`
      : 'Skip the "comment LINK" wait. Community-shared resources for this Instagram post — nothing yet? Add it in 20 seconds, no account needed.';
    return {
      title,
      description,
      alternates: { canonical: `${base}/r/${code}` },
      openGraph: { title, description, url: `${base}/r/${code}`, type: 'website' },
      robots: { index: resources.length > 0, follow: true },
    };
  } catch {
    return { robots: { index: false, follow: false } };
  }
}

async function loadResources(code: string): Promise<{ canonical: string | null; resources: Resource[] }> {
  const { data: post, error: postError } = await db()
    .from('posts')
    .select('id, canonical_url')
    .eq('platform_post_id', code)
    .maybeSingle();

  if (postError) throw new Error(postError.code);
  if (!post) return { canonical: null, resources: [] };

  const { data: rows, error: rowsError } = await db()
    .from('resources')
    .select('id, resource_url, resource_type, description, created_at')
    .eq('post_id', post.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(20);

  if (rowsError) throw new Error(rowsError.code);

  return {
    canonical: post.canonical_url,
    resources: (rows ?? []).map((r) => ({
      id: r.id,
      url: r.resource_url,
      type: r.resource_type,
      description: r.description,
      addedAt: r.created_at,
    })),
  };
}

export default async function PostResourcesPage({ params }: Props) {
  const { code } = await params;
  if (!CODE_PATTERN.test(code)) {
    return (
      <main className="grid min-h-screen place-items-center bg-linkdrop-paper px-5 text-center">
        <div>
          <p className="text-2xl font-extrabold">That link code does not look valid.</p>
          <Link href="/" className="mt-4 inline-block rounded-xl bg-linkdrop-lime px-6 py-3 text-sm font-bold text-[#1a2410]">Back to search →</Link>
        </div>
      </main>
    );
  }

  let data: { canonical: string | null; resources: Resource[] };
  try {
    data = await loadResources(code);
  } catch {
    return (
      <main className="grid min-h-screen place-items-center bg-linkdrop-paper px-5 text-center text-sm text-linkdrop-muted">
        The directory is temporarily unavailable. Please retry shortly.
      </main>
    );
  }

  const base = await origin();

  return (
    <div className="min-h-screen bg-linkdrop-paper text-linkdrop-ink">
      <header className="sticky top-0 z-20 border-b border-linkdrop-line bg-linkdrop-paper/90 backdrop-blur">
        <div className="mx-auto flex h-[68px] w-[min(900px,calc(100%-40px))] items-center justify-between">
          <Link href="/" className="text-lg font-extrabold tracking-tighter">
            linkdrop<span className="text-linkdrop-forest">.</span>
          </Link>
          <Link href="/" className="text-sm text-linkdrop-muted transition-colors hover:text-linkdrop-ink">Search another post</Link>
        </div>
      </header>

      <main className="mx-auto w-[min(780px,calc(100%-40px))] py-12">
        <p className="eyebrow-chip inline-flex items-center gap-2 rounded-full border border-linkdrop-line bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-linkdrop-muted">
          Community resource directory
        </p>
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight sm:text-4xl">
          {data.resources.length
            ? `${data.resources.length} resource${data.resources.length === 1 ? '' : 's'} for this Instagram post`
            : 'Nothing shared for this Instagram post yet'}
        </h1>
        {data.canonical && (
          <a href={data.canonical} target="_blank" rel="noreferrer nofollow" className="mt-2 inline-block text-sm text-linkdrop-muted underline underline-offset-2">
            Open the Instagram post ↗
          </a>
        )}

        {data.resources.length > 0 && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: `Resources for Instagram post ${code}`,
              itemListElement: data.resources.map((r, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                item: { '@type': 'WebPage', name: r.description || r.type, url: `${base}/r/${code}` },
              })),
            }) }}
          />
        )}

        <section className="mt-8 space-y-4">
          {data.resources.map((r) => <PublicLinkCard key={r.id} resource={r} />)}
        </section>

        <section className="mt-12">
          <div className="text-center">
            <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-linkdrop-muted">Help the next person</p>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight">Have the link? Skip the &ldquo;comment LINK&rdquo; wait for everyone.</h2>
            <p className="mt-2 text-sm text-linkdrop-muted">Publishing is instant and needs no account.</p>
          </div>
          <div className="relative mt-6">
            {data.canonical
              ? <SubmitPublic canonicalUrl={data.canonical} postCode={code} />
              : <p className="rounded-2xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-linkdrop-muted">Open the Instagram post once (search on the home page) and this form will activate for it.</p>}
          </div>
        </section>
      </main>

      <footer className="mt-16 border-t border-linkdrop-line bg-white px-5 py-6">
        <p className="mx-auto w-[min(780px,100%)] text-center text-xs text-neutral-500">
          Independent project. Not affiliated with Instagram or Meta. ·{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-linkdrop-ink">Terms</Link>
          {" · "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-linkdrop-ink">Privacy</Link>
          {" · "}
          <Link href="/dmca" className="underline underline-offset-2 hover:text-linkdrop-ink">Copyright / DMCA</Link>
        </p>
      </footer>
    </div>
  );
}
