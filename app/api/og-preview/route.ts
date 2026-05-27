// app/api/og-preview/route.ts
//
// GET /api/og-preview?url=<url>
//
// Server-side fetch (avoids browser CORS), light HTML scan for
// <meta property="og:*"> + <title>, plus a check on whether the response
// would refuse to load in a frame (`X-Frame-Options: deny|sameorigin` or
// `Content-Security-Policy: frame-ancestors 'none'`).
//
// Response:
//   { title?, description?, thumbnailUrl?, domain, canEmbed: boolean }

import { NextResponse, type NextRequest } from "next/server";

const FETCH_TIMEOUT_MS = 5_000;
const READ_CAP_BYTES = 1_000_000;

export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get("url");
  if (!target || !/^https?:\/\//i.test(target)) {
    return NextResponse.json({ error: "bad_url" }, { status: 400 });
  }

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(target, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "mycurricula-og-fetcher/1.0" },
    });
    clearTimeout(t);

    const xfo = res.headers.get("x-frame-options")?.toLowerCase() ?? null;
    const csp = res.headers.get("content-security-policy") ?? "";
    const blocksFrame =
      xfo === "deny" ||
      xfo === "sameorigin" ||
      /frame-ancestors\s+'none'/i.test(csp);

    // Read at most READ_CAP_BYTES — a giant page shouldn't stall the worker.
    const text = (await res.text()).slice(0, READ_CAP_BYTES);

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

    const domain = (() => {
      try {
        return new URL(target).hostname.replace(/^www\./, "");
      } catch {
        return null;
      }
    })();

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
    return NextResponse.json(
      { error: "fetch_failed", detail: (e as Error).message },
      { status: 502 },
    );
  }
}
