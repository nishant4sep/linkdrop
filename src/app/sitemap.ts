import type { MetadataRoute } from 'next';
import { db } from '@/lib/server';

const BASE = () => (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const MAX_POSTS = 2000;

/**
 * Long-tail SEO: every indexed Instagram post gets its own URL here so search
 * engines can land people exactly on the resources for that post.
 *
 * Flat queries on purpose — a relational !inner embed would depend on PostgREST
 * FK inference, and a silent fallback to "homepage only" would quietly kill
 * search indexing without anyone noticing.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = BASE();

  try {
    const { data: posts, error: postsError } = await db()
      .from('posts')
      .select('id, platform_post_id, last_seen_at')
      .order('last_seen_at', { ascending: false })
      .limit(MAX_POSTS);

    if (postsError) {
      console.error('Sitemap posts query failed:', postsError.code);
      return [{ url: `${base}/`, lastModified: new Date() }];
    }

    const postRows = posts ?? [];
    if (postRows.length === 0) return [{ url: `${base}/`, lastModified: new Date() }];

    const { data: resourceRows, error: resourcesError } = await db()
      .from('resources')
      .select('post_id, created_at')
      .eq('status', 'active')
      .in('post_id', postRows.map((post) => post.id));

    if (resourcesError) {
      console.error('Sitemap resources query failed:', resourcesError.code);
      return [{ url: `${base}/`, lastModified: new Date() }];
    }

    // Only posts that actually have a live resource are worth indexing; each
    // page's robots meta keeps empty posts out of the index as well.
    const lastResourceAt = new Map<string, string>();
    for (const row of resourceRows ?? []) {
      const previous = lastResourceAt.get(row.post_id);
      if (!previous || previous < row.created_at) lastResourceAt.set(row.post_id, row.created_at);
    }

    return postRows
      .filter((post) => typeof post.platform_post_id === 'string' && lastResourceAt.has(post.id))
      .map((post) => ({
        url: `${base}/r/${post.platform_post_id}`,
        lastModified: new Date(lastResourceAt.get(post.id) ?? post.last_seen_at ?? Date.now()),
        changeFrequency: 'weekly' as const,
        priority: 0.6,
      }));
  } catch (error) {
    console.error('Sitemap generation failed:', error);
    return [{ url: `${base}/`, lastModified: new Date() }];
  }
}
