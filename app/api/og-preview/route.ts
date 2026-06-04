// app/api/og-preview/route.ts
//
// GET /api/og-preview?url=<url>
//
// Server-side fetch (avoids browser CORS), light HTML scan for
// <meta property="og:*"> + <title>, plus a check on whether the response
// would refuse to load in a frame (`X-Frame-Options: deny|sameorigin` or
// `Content-Security-Policy: frame-ancestors 'none'`).
//
// SECURITY (audit #11 — SSRF + unbounded body):
// This endpoint fetches an attacker-controllable URL on the server. Without
// guards it is a Server-Side Request Forgery primitive — an attacker can point
// it at internal services (cloud metadata at 169.254.169.254, RFC1918 LAN
// hosts, loopback, link-local) and exfiltrate internal responses, or hand us a
// gigantic body to exhaust worker memory. We defend with:
//   • absolute http/https scheme validation;
//   • DNS resolution of the hostname + rejection of any private / loopback /
//     link-local / metadata / unspecified address — RE-CHECKED on every
//     redirect hop (redirect: "manual", capped at MAX_REDIRECTS);
//   • a fetch timeout AND a hard streamed byte cap that aborts mid-download;
//   • only parsing OG tags when the response is text/html.
//
// Response:
//   { title?, description?, thumbnailUrl?, domain, canEmbed: boolean }

import { NextResponse, type NextRequest } from "next/server";
import { lookup } from "node:dns/promises";
import net from "node:net";

// Force the Node.js runtime: this route depends on node:dns + node:net for the
// SSRF guard, which are unavailable on the edge runtime. The Cloudflare
// deployment runs with the `nodejs_compat` flag (wrangler.jsonc), so these
// modules resolve on the Worker.
export const runtime = "nodejs";

const FETCH_TIMEOUT_MS = 5_000;
// Hard cap on the bytes we will read from the remote body. We stream and abort
// the moment this is exceeded so a huge (or chunked-forever) page can never
// exhaust the worker's memory.
const READ_CAP_BYTES = 512 * 1024; // 512 KB
const MAX_REDIRECTS = 5;

/**
 * Returns true when an IP literal points at a non-public range we must never
 * fetch: loopback, RFC1918 private, link-local (incl. the 169.254.169.254
 * cloud-metadata endpoint), unique-local IPv6, unspecified, and IPv4-mapped
 * IPv6 forms of the same.
 */
function isBlockedIp(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) return isBlockedIpv4(ip);
  if (type === 6) return isBlockedIpv6(ip);
  // Not a recognizable IP literal — treat as blocked (fail closed).
  return true;
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    return true; // malformed → fail closed
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 (incl. 0.0.0.0)
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false;
}

function isBlockedIpv6(ipRaw: string): boolean {
  const ip = ipRaw.toLowerCase();
  // IPv4-mapped / -embedded IPv6 (::ffff:a.b.c.d, ::a.b.c.d) — validate the
  // embedded v4.
  const v4Embedded = ip.match(/(?:^|:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (v4Embedded) return isBlockedIpv4(v4Embedded[1]);
  if (ip === "::" || ip === "::1") return true; // unspecified / loopback
  if (ip.startsWith("fe80")) return true; // link-local
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // fc00::/7 ULA
  if (ip.startsWith("ff")) return true; // multicast
  return false;
}

/**
 * Validate a URL string and confirm its host resolves only to public IPs.
 * Returns the parsed URL on success, or null when it must be rejected.
 */
async function validatePublicHttpUrl(raw: string): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const host = url.hostname.replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  // Reject obvious internal hostnames outright (defence in depth — DNS check
  // below is the real guard).
  const lowerHost = host.toLowerCase();
  if (
    lowerHost === "localhost" ||
    lowerHost.endsWith(".localhost") ||
    lowerHost.endsWith(".internal") ||
    lowerHost.endsWith(".local")
  ) {
    return null;
  }

  // If the host is already an IP literal, check it directly.
  if (net.isIP(host)) {
    return isBlockedIp(host) ? null : url;
  }

  // Otherwise resolve the name and reject if ANY resolved address is private.
  try {
    const records = await lookup(host, { all: true });
    if (records.length === 0) return null;
    for (const rec of records) {
      if (isBlockedIp(rec.address)) return null;
    }
  } catch {
    return null; // DNS failure → fail closed
  }
  return url;
}

/**
 * Fetch with manual redirect handling so we re-validate every hop against the
 * SSRF blocklist (a public URL can 30x-redirect to an internal one). Streams
 * the body and aborts once READ_CAP_BYTES is exceeded. Returns the final
 * response headers we care about plus the capped body text.
 */
async function safeFetch(
  startUrl: URL,
  signal: AbortSignal,
): Promise<{
  text: string;
  contentType: string;
  blocksFrame: boolean;
  finalUrl: URL;
} | null> {
  let current = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current.toString(), {
      signal,
      redirect: "manual",
      headers: { "User-Agent": "mycurricula-og-fetcher/1.0" },
    });

    // Handle redirects ourselves so each target is re-validated.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      // Drain/cancel the redirect body so the socket can be reused/closed.
      await res.body?.cancel().catch(() => {});
      if (!loc) return null;
      const next = await validatePublicHttpUrl(
        new URL(loc, current).toString(),
      );
      if (!next) return null; // redirect target is internal / invalid → stop
      current = next;
      continue;
    }

    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return null;
    }

    const xfo = res.headers.get("x-frame-options")?.toLowerCase() ?? null;
    const csp = res.headers.get("content-security-policy") ?? "";
    const blocksFrame =
      xfo === "deny" ||
      xfo === "sameorigin" ||
      /frame-ancestors\s+'none'/i.test(csp);

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();

    // Only read the body when it is HTML — we have no use for binary/other
    // payloads and reading them is pure attack surface.
    if (!contentType.includes("text/html")) {
      await res.body?.cancel().catch(() => {});
      return { text: "", contentType, blocksFrame, finalUrl: current };
    }

    const text = await readCapped(res, READ_CAP_BYTES);
    return { text, contentType, blocksFrame, finalUrl: current };
  }

  // Exceeded the redirect budget.
  return null;
}

/**
 * Stream the response body, accumulating at most `cap` bytes, then abort the
 * stream. Decodes the captured bytes as UTF-8. Never buffers more than the cap.
 */
async function readCapped(res: Response, cap: number): Promise<string> {
  const body = res.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = cap - total;
      if (value.byteLength >= remaining) {
        chunks.push(value.subarray(0, remaining));
        total = cap;
        break; // hit the cap — stop reading
      }
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    // Abort the underlying stream so no further bytes are pulled.
    await reader.cancel().catch(() => {});
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url");
  if (!target) {
    return NextResponse.json({ error: "bad_url" }, { status: 400 });
  }

  const startUrl = await validatePublicHttpUrl(target);
  if (!startUrl) {
    // Covers: non-http(s), unparseable, internal hostname, or any IP that
    // resolves into a blocked range.
    return NextResponse.json({ error: "bad_url" }, { status: 400 });
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

  try {
    const result = await safeFetch(startUrl, ctrl.signal);
    clearTimeout(t);

    if (!result) {
      return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
    }

    const { text, blocksFrame } = result;

    const metaProp = (prop: string): string | undefined => {
      // Both attribute orders are valid; check property-then-content, then
      // content-then-property.
      const reA = new RegExp(
        `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`,
        "i",
      );
      const reB = new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`,
        "i",
      );
      return text.match(reA)?.[1] ?? text.match(reB)?.[1];
    };
    const titleTag = text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];

    const title = metaProp("og:title") ?? metaProp("twitter:title") ?? titleTag;
    const description =
      metaProp("og:description") ??
      metaProp("twitter:description") ??
      metaProp("description");
    const thumbnailUrl = metaProp("og:image") ?? metaProp("twitter:image");

    const domain = startUrl.hostname.replace(/^www\./, "");

    return NextResponse.json(
      {
        title: title?.trim(),
        description: description?.trim(),
        thumbnailUrl,
        domain,
        canEmbed: !blocksFrame,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
        },
      },
    );
  } catch (e) {
    clearTimeout(t);
    return NextResponse.json(
      { error: "fetch_failed", detail: (e as Error).message },
      { status: 502 },
    );
  }
}
