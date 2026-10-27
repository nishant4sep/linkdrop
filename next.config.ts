import path from "node:path";
import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
let supabaseOrigin: string | null = null;
try {
  supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : null;
} catch {
  supabaseOrigin = null;
}

// Baseline hardening headers. CSP stays permissive on inline scripts to keep
// Next.js bootstrapping simple; the app does not load any third-party script.
// Dev mode additionally permits 'unsafe-eval' because React Fast Refresh
// (react-refresh) evaluates strings — blocking it freezes pages mid-hydration.
const isDev = process.env.NODE_ENV !== "production";
const connectSrc = ["'self'", ...(supabaseOrigin ? [supabaseOrigin] : [])].join(" ");
const scriptSrc = ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])].join(" ");
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `connect-src ${connectSrc}`,
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Keep output tracing scoped to LinkDrop, not C:\\Users\\nyx.
  outputFileTracingRoot: path.join(__dirname),
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
