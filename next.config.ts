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
//
// Google Identity Services (the "Continue with Google" sign-in button) needs
// four Google endpoints allow-listed — these are Google's officially
// documented GSI CSP sources
// (https://developers.google.com/identity/gsi/web/guides/csp). Without them
// the page's own CSP refuses the sign-in flow:
//   • script-src  — loads the GSI client library (/gsi/client).
//   • style-src   — GSI injects an external stylesheet (/gsi/style); note
//                   that 'unsafe-inline' does NOT cover an external <link>
//                   stylesheet host, so the origin must be named explicitly.
//   • frame-src   — GSI renders the button + account picker in iframes
//                   under /gsi/ (e.g. /gsi/button, /gsi/select).
//   • connect-src — GSI makes XHR status/log calls under /gsi/.
// 'unsafe-eval' is ONLY needed for the dev/runtime React fast-refresh path.
// In production it weakens the CSP (it permits eval()/new Function(), a common
// XSS escalation vector) for no benefit, so it is dropped from the prod policy
// (audit #24). Next.js still requires 'unsafe-inline' in both modes for its
// runtime + Next/font inline scripts.
const isDev = process.env.NODE_ENV !== "production";
const scriptEval = isDev ? " 'unsafe-eval'" : "";

const csp = [
  "default-src 'self'",
  // static.cloudflareinsights.com is the Cloudflare Web Analytics beacon
  // the Worker host injects automatically when observability is on; CSP
  // must allow it or every page console-errors on script load.
  `script-src 'self' 'unsafe-inline'${scriptEval} https://static.cloudflareinsights.com https://accounts.google.com/gsi/client`,
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "font-src 'self' data:",
  `img-src 'self' data: blob: https://${r2Host} https://img.youtube.com https://i.vimeocdn.com https://*.googleusercontent.com https://*.ggpht.com https://upload.wikimedia.org`,
  `media-src 'self' blob: https://${r2Host}`,
  "frame-src 'self' https://accounts.google.com/gsi/ https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com https://docs.google.com https://drive.google.com",
  `connect-src 'self' https://accounts.google.com/gsi/ https://${supabaseHost} https://${r2Host}`,
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

  // ── Keep `linkedom` out of the CLIENT bundle ────────────────────────────────
  //
  // linkedom is a SERVER-only DOM shim. Its only consumer is
  // `makeServerWindow()` in lib/sanitize-html.ts, which runs only on the
  // `!hasBrowserDOM` branch. The import is static so the Cloudflare Worker
  // bundle keeps it (the Worker has no DOM and genuinely needs it), but that
  // also dragged ~232 kB into the browser bundle, where it is dead weight — the
  // browser already has a real DOM, so `getInstance()` hands DOMPurify the real
  // `window`. Alias it away for the CLIENT compilation only. `isServer` is true
  // for BOTH the nodejs- and edge-server compilations, so the Worker is
  // unaffected.
  //
  // WHY `resolve.alias`, NOT `resolve.fallback`: `fallback` only fires when
  // normal resolution FAILS, and linkedom is an installed dependency that
  // resolves fine — a fallback would look applied and change nothing. `alias`
  // runs before resolution and always fires.
  //
  // WHY the un-`$`'d key: `linkedom$` would match only the exact request. The
  // bare key also covers `linkedom/*`, so a future `linkedom/cached` import
  // cannot sneak back into the client bundle.
  //
  // `serverExternalPackages` does NOT solve this — it is a server-compilation
  // directive with zero client effect, and it would be actively harmful here:
  // Cloudflare Workers have no `node_modules` at runtime, so linkedom must stay
  // bundled INTO the Worker. An async `import()` inside `makeServerWindow` was
  // also rejected: it would force `sanitizeHtml` to become async across ~10
  // synchronous render-path callsites, including `useMemo` bodies and
  // `el.innerHTML = sanitizeHtml(value)`.
  //
  // SECURITY — this fails CLOSED. Aliasing the module away makes `parseHTML`
  // and `NodeFilter` undefined in the client bundle, but they are referenced
  // only inside `makeServerWindow()` (sanitize-html.ts:310-395), whose only
  // callsite is the false arm of `hasBrowserDOM` — always true in a browser.
  // If client code ever did reach it, the explicit guard at the top of
  // `makeServerWindow` throws. No `sanitizeHtml(` callsite has a surrounding
  // try/catch or `|| raw` fallback, so a throw surfaces as a React render error
  // or an aborted paste; in no path does the dirty string reach
  // `dangerouslySetInnerHTML`. This matches the module's existing
  // `if (!dompurify.isSupported) throw`.
  //
  // FORWARD TRIPWIRE (Next 16): Turbopack becomes the default and Next hard-
  // exits on a webpack config with no turbopack config. So this alias becomes a
  // BUILD FAILURE, not a silent regression — the good failure mode. The fix at
  // that point is to add `turbopack: {}` or pin `next build --webpack`.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve ??= {};
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        linkedom: false,
      };
    }
    return config;
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
