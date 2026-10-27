import { db, jsonError } from '@/lib/server';
import { consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { clientIpHash, honeypotTripped } from '@/lib/ip';
import { turnstileOk } from '@/lib/turnstile';
import {
  ACCOUNT_AUTH_EMAIL_SUFFIX,
  RESERVED_USERNAMES,
  USERNAME_MAX,
  USERNAME_MIN,
  USERNAME_PATTERN,
  PASSWORD_MIN,
  PASSWORD_MAX,
} from '@/lib/site';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Username + password accounts (phase 2). No email is collected: Supabase
 * Auth stores the deterministic internal alias <username>@users.linkdrop
 * .internal, which is never shown to anyone. Login works by recomputing the
 * alias, so no username directory is needed for authentication.
 *
 * Anti-abuse: honeypot, per-IP rate limits, optional Turnstile (fail-closed),
 * shape-validated usernames, reserved-name lockout.
 */

type AuthTokenPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user?: { id?: string };
};

function internalEmailFor(username: string): string {
  return `${username}${ACCOUNT_AUTH_EMAIL_SUFFIX}`;
}

/** Safe lowercase username; null when the shape is wrong. */
function normalizeUsername(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(normalized) || normalized.length < USERNAME_MIN || normalized.length > USERNAME_MAX) {
    return null;
  }
  return normalized;
}

function suggestionsFor(taken: Set<string>, candidate: string): string[] {
  const takenSet = taken;
  const base = candidate.replace(/[^a-z0-9_]/g, '').slice(0, 14) || 'dropper';
  const tails = [
    (x: string) => `${x}_drops`,
    (x: string) => `${x}_links`,
    (x: string) => `${x}_hq`,
    (x: string) => `${x}x`,
    (x: string) => `${x}_2`,
  ];
    const picks: string[] = [];
  for (const tail of tails) {
    const name = tail(base);
    if (USERNAME_PATTERN.test(name) && name.length <= USERNAME_MAX && !takenSet.has(name) && !RESERVED_USERNAMES.has(name)) {
      picks.push(name);
    }
    if (picks.length >= 3) break;
  }
  return picks;
}

/** Which of the candidate usernames are already claimed. */
async function claimedUsernames(candidates: string[]): Promise<Set<string>> {
  if (candidates.length === 0) return new Set();
  const { data, error } = await db().from('profiles').select('username').in('username', candidates);
  if (error) throw new Error(error.code);
  return new Set(((data ?? []) as Array<{ username: string | null }>).map((row) => row.username).filter(Boolean) as string[]);
}

/** Grows the immediate base into guaranteed-available alternatives. */
async function availableSuggestions(candidate: string, claimed: Set<string>): Promise<string[]> {
  const initial = suggestionsFor(claimed, candidate);
  const more = suggestionsFor(new Set([...claimed, ...(await claimedUsernames(initial.filter((n) => !claimed.has(n))))]), `${candidate}_1`);
  return [...initial.filter((n) => !claimed.has(n)), ...more].slice(0, 3);
}

async function signInInternal(usernameOrEmail: string, password: string): Promise<{
  ok: boolean;
  status?: number;
  isEmail?: boolean;
  tokens?: AuthTokenPayload;
  internalOnly?: boolean;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return { ok: false, status: 500, internalOnly: true };

  const identifier = usernameOrEmail.includes('@')
    ? usernameOrEmail // legacy/admin accounts may still sign in with their real email
    : internalEmailFor(usernameOrEmail);

  let response: Response;
  try {
    response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({ email: identifier, password }),
    });
  } catch {
    return { ok: false, status: 503, internalOnly: true };
  }

  if (!response.ok) {
    return { ok: false, status: response.status === 400 || response.status === 422 ? 401 : 503, isEmail: usernameOrEmail.includes('@') };
  }

  return { ok: true, isEmail: usernameOrEmail.includes('@'), tokens: (await response.json()) as AuthTokenPayload };
}

async function profileByUsername(username: string) {
  const { data, error } = await db()
    .from('profiles')
    .select('user_id, username, account_status')
    .eq('username', username)
    .maybeSingle();
  if (error) throw new Error(error.code);
  return data;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Send a valid JSON request.', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return jsonError('Invalid request.', 400);
  }

  const input = body as Record<string, unknown>;
  const action = input['action'] === 'signup' ? 'signup' : input['action'] === 'login' ? 'login' : null;
  if (!action) return jsonError('Unknown account action.', 400);

  if (honeypotTripped(input['company'])) {
    return jsonError('Request rejected.', 400);
  }

  const ipHash = clientIpHash(request);
  if (!ipHash) {
    return jsonError('Your connection does not expose an address we can rate-limit. Request blocked.', 403);
  }

  try {
    const bucket = await consumeRateLimit(
      action === 'signup' ? 'auth-signup-ip' : 'auth-login-ip',
      ipHash,
      action === 'signup' ? 5 : 15,
      3600,
    );
    if (!bucket.allowed) return rateLimitResponse(bucket.resetAt);
  } catch {
    return jsonError('Limiting service is unavailable. Please retry shortly.', 503);
  }

  const captcha = await turnstileOk(input['turnstileToken']);
  if (!captcha) return jsonError('The bot check failed. Please retry.', 403);

  const rawIdentifier = typeof input['username'] === 'string' ? input['username'].trim().toLowerCase() : '';
  const hasEmailIdentifier = rawIdentifier.includes('@') && action === 'login';
  const username = hasEmailIdentifier ? null : normalizeUsername(rawIdentifier);

  const password = typeof input['password'] === 'string' ? input['password'] : '';
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return jsonError(`Password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters.`, 400);
  }

  try {
    if (action === 'login') {
      const identifier = hasEmailIdentifier ? rawIdentifier : username;
      if (!identifier) {
        return jsonError('Usernames are 3–20 characters: letters, numbers, underscores.', 400);
      }
      const result = await signInInternal(identifier, password);
      if (!result.ok) {
        if (result.status === 401) {
          return jsonError('Wrong username or password.', 401);
        }
        return jsonError('Sign-in service is unavailable right now. Please retry shortly.', 503);
      }
      const tokens = result.tokens;
      if (!tokens?.access_token || !tokens.refresh_token) {
        return jsonError('Sign-in service is unavailable right now. Please retry shortly.', 503);
      }
      // Enforce live account status; internal alias responses can be trusted
      // identity-wise, but a suspended profile must not keep browsing.
      if (!hasEmailIdentifier && username) {
        const profile = await profileByUsername(username);
        if (profile && profile.account_status !== 'active') {
          return jsonError('This account is not active.', 403);
        }
      }
      return Response.json({
        ok: true,
        action: 'login',
        session: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 3600),
        },
      }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }

    // ---- signup ------------------------------------------------------------
    if (!username) {
      return jsonError(`Pick a username of ${USERNAME_MIN}–${USERNAME_MAX} characters: lowercase letters, numbers, underscores.`, 400);
    }
    if (RESERVED_USERNAMES.has(username)) {
      const picks = await availableSuggestions(username, new Set(RESERVED_USERNAMES));
      return Response.json({ ok: false, error: 'That username is reserved. Try a variation.', suggestions: picks }, { status: 409, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }
    if (await profileByUsername(username)) {
      const picks = await availableSuggestions(username, new Set([username]));
      return Response.json({ ok: false, error: 'That username is taken.', suggestions: picks }, { status: 409, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }

    const created = await db().auth.admin.createUser({
      email: internalEmailFor(username),
      email_confirm: true,
      password,
      user_metadata: { username },
    });
    if (created.error || !created.data?.user) {
      // 422 with "already registered" can only mean a racing duplicate signup.
      const existing = await profileByUsername(username);
      if (existing) return jsonError('That username is taken.', 409);
      console.error('Username signup failed at auth creation:', created.error?.message);
      return jsonError('The account could not be created right now.', 500);
    }

    const { error: profileError } = await db().from('profiles').insert({
      user_id: created.data.user.id,
      display_name: username,
      username,
      username_created_ip_hash: ipHash,
      username_created_at: new Date().toISOString(),
    });
    if (profileError) {
      // Compensate: never leave an account without its profile row.
      await db().auth.admin.deleteUser(created.data.user.id);
      console.error('Username signup profile insert failed:', profileError.code);
      return jsonError('The account could not be created right now.', 500);
    }

    const result = await signInInternal(username, password);
    if (!result.ok || !result.tokens?.access_token || !result.tokens.refresh_token) {
      // The account exists; ask the user to sign in normally with it.
      return Response.json({
        ok: true,
        action: 'signup',
        forceLogin: true,
        message: 'Account created. Sign in with that username now.',
      }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }

    const tokens = result.tokens;
    return Response.json({
      ok: true,
      action: 'signup',
      session: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + (tokens.expires_in ?? 3600),
      },
    }, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    console.error('Username auth failure:', error);
    return jsonError('Your account request could not be processed right now.', 500);
  }
}
