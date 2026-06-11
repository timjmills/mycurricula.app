// app/api/resources/[id]/route.ts
//
// GET    /api/resources/[id]                 — link rows: 200 JSON.
//                                              Hosted files: 302 to R2 signed
//                                              inline URL (default ?inline=1).
//                                              ?raw=1: STREAM the bytes back
//                                              same-origin (no redirect) so
//                                              client-side PDF.js can read them
//                                              without a cross-origin fetch.
// DELETE /api/resources/[id]                 — drop the row. (R2 cleanup is
//                                              best-effort, handled out-of-band.)
// PATCH  /api/resources/[id]                 — update display_mode | link_text |
//                                              position | display_label.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { presignGet } from "@/lib/r2";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("resources")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Hosted file → redirect to a short-lived R2 signed URL with inline
  // disposition so the browser previews instead of downloading.
  if (
    data.kind === "hosted_file" &&
    Array.isArray(data.r2_object_keys) &&
    data.r2_object_keys.length > 0
  ) {
    const key = data.r2_object_keys[0] as string;

    // ?raw=1 → SAME-ORIGIN byte stream. The default path 302-redirects the
    // browser to the R2 signed URL, but a cross-origin fetch() from client-side
    // PDF.js would be blocked by CORS. So when the PDF renderer needs the bytes
    // it asks for ?raw=1: the server fetches the signed URL itself and streams
    // the response body straight back from this same origin. The object key
    // comes from the DB row (server-controlled), never client input, so there
    // is no SSRF surface; RLS already gated the row read above, so authz is
    // unchanged. We deliberately do NOT set inline disposition here — this is a
    // data fetch (PDF.js reads an ArrayBuffer), not a browser preview.
    if (req.nextUrl.searchParams.get("raw") === "1") {
      const signed = await presignGet(key, { expiresSeconds: 3600 });
      let upstream: Response;
      try {
        upstream = await fetch(signed);
      } catch {
        return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
      }
      if (!upstream.ok || !upstream.body) {
        return NextResponse.json({ error: "fetch_failed" }, { status: 502 });
      }

      // Content-Type from the row's VERIFIED mime_type (set server-side from a
      // HEAD on upload — never the client's claim). Fall back to a generic
      // binary type so PDF.js / <img> can still sniff via the bytes.
      const headers = new Headers({
        "Content-Type":
          (data.mime_type as string | null) ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
      });
      // Pass Content-Length through when R2 reports it, so the client can show
      // progress / size the buffer; omit it otherwise (chunked is fine).
      const len = upstream.headers.get("content-length");
      if (len) headers.set("Content-Length", len);

      return new NextResponse(upstream.body, { status: 200, headers });
    }

    const inline = req.nextUrl.searchParams.get("inline") !== "0";
    const url = await presignGet(key, {
      inline,
      filename: data.original_filename ?? undefined,
      expiresSeconds: 3600,
    });
    return NextResponse.redirect(url, 302);
  }

  // Link rows return the row JSON.
  return NextResponse.json({ resource: data });
}

// ── PATCH ──────────────────────────────────────────────────────────────────
const PATCHABLE = new Set([
  "display_mode",
  "link_text",
  "position",
  "display_label",
]);

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  for (const k of Object.keys(body)) {
    if (PATCHABLE.has(k)) patch[k] = body[k];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no_patchable_fields" }, { status: 400 });
  }
  if (
    patch.display_mode !== undefined &&
    !["literal", "hyperlink", "thumbnail"].includes(
      patch.display_mode as string,
    )
  ) {
    return NextResponse.json({ error: "bad_display_mode" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resources")
    .update(patch)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ resource: data });
}

// ── DELETE ─────────────────────────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  // R2 object deletion is intentionally NOT blocking — a nightly sweep
  // removes orphan objects whose row no longer exists. Keeps DELETE fast
  // and avoids leaving the row half-deleted on an R2 failure.
  const { error } = await supabase.from("resources").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
