import 'server-only';

import { db } from '@/lib/server';

/**
 * Server-side readers for the phase-2 live surfaces: home counters,
 * the leaderboard, and the sponsor slot. Every function degrades to an
 * `ok: false` shape instead of throwing, so pages render an honest
 * neutral state when the database (or a migration) is temporarily off.
 */

export type PublicStats = {
  ok: boolean;
  activeResources: number | null;
  postsCovered: number | null;
  lastAddedAt: string | null;
};

export async function fetchPublicStats(): Promise<PublicStats> {
  try {
    const { data, error } = await db().rpc('public_stats');
    if (error) throw new Error(error.code);
    const payload = (Array.isArray(data) ? data[0] : data) as {
      activeResources?: number | null;
      postsCovered?: number | null;
      lastAddedAt?: string | null;
    } | null;
    return {
      ok: true,
      activeResources: typeof payload?.activeResources === 'number'
        ? payload.activeResources
        : payload?.activeResources != null && payload.activeResources !== ''
          ? Number(payload.activeResources)
          : null,
      postsCovered: typeof payload?.postsCovered === 'number' ? payload.postsCovered : Number(payload?.postsCovered ?? null),
      lastAddedAt: payload?.lastAddedAt ?? null,
    };
  } catch {
    return { ok: false, activeResources: null, postsCovered: null, lastAddedAt: null };
  }
}

export type LeaderboardRow = {
  position: number;
  userId: string;
  username: string;
  liveLinks: number;
  firstLinkAt: string | null;
};

export type LeaderboardResult = { ok: boolean; rows: LeaderboardRow[] };

export async function fetchLeaderboard(limit = 50): Promise<LeaderboardResult> {
  try {
    const { data, error } = await db().rpc('leaderboard_top', { p_limit: limit });
    if (error) throw new Error(error.code);
    const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
    return {
      ok: true,
      rows: rows
        .filter((row) => typeof row.user_id === 'string' && typeof row.username === 'string')
        .map((row) => ({
          position: Number(row.position ?? 0),
          userId: String(row.user_id),
          username: String(row.username),
          liveLinks: Number(row.live_links ?? 0),
          firstLinkAt: typeof row.first_link_at === 'string' ? row.first_link_at : null,
        })),
    };
  } catch {
    return { ok: false, rows: [] };
  }
}

export type ActivePromotion = {
  ok: boolean;
  active: boolean;
  username: string | null;
  headline: string | null;
  detail: string | null;
  targetUrl: string | null;
  activeUntil: string | null;
};

const PROMO_OFF: ActivePromotion = {
  ok: false, active: false, username: null, headline: null, detail: null, targetUrl: null, activeUntil: null,
};

export async function fetchActivePromotion(): Promise<ActivePromotion> {
  try {
    const { data, error } = await db().rpc('active_promotion');
    if (error) throw new Error(error.code);
    const payload = (Array.isArray(data) ? data[0] : data) as {
      active?: boolean;
      username?: string | null;
      headline?: string | null;
      detail?: string | null;
      targetUrl?: string | null;
      activeUntil?: string | null;
    } | null;
    if (!payload || payload.active !== true) return { ...PROMO_OFF, ok: true };
    return {
      ok: true,
      active: true,
      username: payload.username ?? null,
      headline: payload.headline ?? null,
      detail: payload.detail ?? null,
      targetUrl: payload.targetUrl ?? null,
      activeUntil: payload.activeUntil ?? null,
    };
  } catch {
    return PROMO_OFF;
  }
}

/**
 * Sponsor widgets live in src/components/sponsor.tsx (JSX needs .tsx);
 * this module stays data-only for the service-role reads.
 */
