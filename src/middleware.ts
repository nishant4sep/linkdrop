import { NextResponse, type NextRequest } from 'next/server';

/**
 * Subdomain routing: any request whose host starts with "dashboard." (for
 * example dashboard.linkdrop.example.com) is served by the owner console at
 * /admin. The rewrite happens on the edge before rendering, so no redirect or
 * DNS change is needed besides a CNAME wildcard; the same origin serves it.
 *
 * Locally, "dashboard.localhost:3000" resolves to 127.0.0.1 on modern systems,
 * so the console can be exercised over a real subdomain in development too.
 */
export function middleware(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').toLowerCase();
  const portIndex = host.indexOf(':');
  const bareHost = portIndex === -1 ? host : host.slice(0, portIndex);

  if (bareHost === 'dashboard.localhost' || bareHost.startsWith('dashboard.')) {
    const url = request.nextUrl.clone();
    if (url.pathname.startsWith('/admin')) return NextResponse.next();
    url.pathname = url.pathname === '/' ? '/admin' : `/admin${url.pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  // Static assets and API routes are excluded: they never need the subdomain map.
  matcher: [
    '/',
    '/admin',
    '/admin/:path*',
    '/login',
    '/dashboard',
    '/dashboard/:path*',
  ],
};
