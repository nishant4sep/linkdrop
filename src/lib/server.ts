import 'server-only';

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
export { normalizeInstagramPost, validateResourceUrl } from './url-validation';

let serviceClient: SupabaseClient | undefined;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** Server-only Supabase client. Never import this module into client components. */
export function db(): SupabaseClient {
  if (!serviceClient) {
    serviceClient = createClient(
      requiredEnv('NEXT_PUBLIC_SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
      {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { 'X-Client-Info': 'linkdrop-server' } }
      }
    );
  }
  return serviceClient;
}

export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; status: 401 | 403; error: string };

/** Validate the bearer token with Supabase Auth, not by decoding a JWT locally. */
export async function requireUser(request: Request): Promise<AuthResult> {
  const match = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, status: 401, error: 'Sign in to continue.' };

  try {
    const { data, error } = await db().auth.getUser(match[1]);
    if (error || !data.user) return { ok: false, status: 401, error: 'Your session is invalid or expired.' };

    const { data: profile, error: profileError } = await db()
      .from('profiles')
      .select('account_status')
      .eq('user_id', data.user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Profile status lookup failed:', profileError.code);
      return { ok: false, status: 403, error: 'Account access could not be verified.' };
    }
    // New accounts may not have a profile row yet. If one exists, enforce its status.
    if (profile && profile.account_status !== 'active') {
      return { ok: false, status: 403, error: 'This account is not active.' };
    }
    return { ok: true, user: data.user };
  } catch (error) {
    console.error('Authentication verification failed:', error);
    return { ok: false, status: 401, error: 'Authentication could not be verified.' };
  }
}

export async function requireAdmin(request: Request): Promise<AuthResult> {
  const auth = await requireUser(request);
  if (!auth.ok) return auth;

  const { data, error } = await db()
    .from('admin_users')
    .select('user_id')
    .eq('user_id', auth.user.id)
    .is('disabled_at', null)
    .maybeSingle();

  if (error) {
    console.error('Administrator lookup failed:', error.code);
    return { ok: false, status: 403, error: 'Administrator access could not be verified.' };
  }
  if (!data) return { ok: false, status: 403, error: 'Administrator access required.' };
  return auth;
}

export function jsonError(error: string, status: number): Response {
  return Response.json({ ok: false, error }, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}


export function requestOriginAllowed(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    const originUrl = new URL(origin);
    const expected = new URL(request.url);
    if (originUrl.origin === expected.origin) return true;
    const configured = process.env.APP_ORIGIN?.trim();
    return Boolean(configured && originUrl.origin === new URL(configured).origin);
  } catch {
    return false;
  }
}
