import type { NextConfig } from "next";
import path from "node:path";

// Derive the Supabase host (the project URL minus the scheme + trailing
// slash) so the CSP's connect-src can name it explicitly. Falls back to
// "*.supabase.co" when the env var isn't set (e.g. during a bare build).
const supabaseHost =
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "") || "*.supabase.co";

// R2 public host — set per environment (e.g. <accountid>.r2.cloudflarestorage.com).
// In a dev environment without an R2 binding configured, fall through to the
// wildcard so the CSP still parses and embed surfaces work locally.
const r2Host = process.env.R2_PUBLIC_HOST ?? "*.r2.cloudflarestorage.com";

// ── Content-Security-Policy ─────────────────────────────────────────────────
// Locks down where embeds + media may load from. New embed providers are
// added by extending the relevant directive (usually `frame-src`).
const csp = [
  "default-src 'self'",
  // Next.js requires unsafe-inline (runtime + Next/font), and unsafe-eval
  // is needed for the dev/runtime React fast-refresh path.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `img-src 'self' data: blob: https://${r2Host} https://img.youtube.com https://i.vimeocdn.com https://*.googleusercontent.com https://*.ggpht.com https://upload.wikimedia.org`,
  `media-src 'self' blob: https://${r2Host}`,
  "frame-src 'self' https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://docs.google.com https://drive.google.com",
  `connect-src 'self' https://${supabaseHost} https://${r2Host}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. A stray lockfile in the user's
  // home directory otherwise makes Next infer the wrong tracing root.
  outputFileTracingRoot: path.join(__dirname),

  images: {
    // Google profile photos (the OAuth `picture` claim) are served from
    // lh3/lh4/lh5.googleusercontent.com — allow next/image to optimise them.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
    ],
  },

  async headers() {
    // `nosniff` is intentionally production-only: Next.js dev mode serves
    // static chunks (CSS / JS bundles) with `text/plain` Content-Type in
    // some cases (e.g. when the query-string version param confuses MIME
    // detection). With `nosniff` on, the browser refuses to apply/execute
    // them and the dev page paints unstyled with no working JS. In a
    // production build the chunks are served with correct MIME types, so
    // `nosniff` is safe and we keep the security benefit there.
    const isProd = process.env.NODE_ENV === "production";
    const baseHeaders = [
      { key: "Content-Security-Policy", value: csp },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ];
    if (isProd) {
      baseHeaders.push({ key: "X-Content-Type-Options", value: "nosniff" });
    }
    return [
      {
        source: "/(.*)",
        headers: baseHeaders,
      },
    ];
  },
};

export default nextConfig;
