// app/api/resources/route.ts
//
// POST /api/resources         — create a row (link OR finalized hosted file)
// GET  /api/resources?owner_event_type=...&owner_event_id=...
//                             — list rows for one event, in display order
//
// Auth: every call requires a Supabase session. RLS does the team gate.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const OWNER_TYPES = new Set([
  "core_lesson_event",
  "extra_lesson_event",
  "day_event",
  "unit",
  "personal_subject",
]);

const PROVIDERS = new Set([
  "youtube",
  "vimeo",
  "gslides",
  "gdocs",
  "gsheets",
  "gdrive",
  "pdf",
  "image",
  "video",
  "audio",
  "website",
]);

const KINDS = new Set([
  "hosted_file",
  "external_link",
  "youtube_link",
  "drive_link",
]);

const FILE_TYPES = new Set(["pdf", "docx", "rtf", "image", "image_stack"]);

// ── GET ────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const owner_event_type = req.nextUrl.searchParams.get("owner_event_type");
  const owner_event_id = req.nextUrl.searchParams.get("owner_event_id");

  if (
    !owner_event_type ||
    !owner_event_id ||
    !OWNER_TYPES.has(owner_event_type)
  ) {
    return NextResponse.json({ error: "bad_owner" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("resources")
    .select("*")
    .eq("owner_event_type", owner_event_type)
    .eq("owner_event_id", owner_event_id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ resources: data });
}

// ── POST ───────────────────────────────────────────────────────────────────
interface PostBody {
  /** When finalizing a hosted_file, pass the resource_id minted by the
   *  upload-presign route so the row consumes the same UUID. */
  id?: string;
  owner_event_type: string;
  owner_event_id: string;
  kind: "hosted_file" | "external_link" | "youtube_link" | "drive_link";
  display_label: string;
  position?: number;
  // Hosted-file fields
  file_type?: "pdf" | "docx" | "rtf" | "image" | "image_stack";
  r2_object_keys?: string[];
  file_size_bytes?: number;
  original_filename?: string;
  mime_type?: string;
  width?: number;
  height?: number;
  // Link fields
  url?: string;
  preview_title?: string;
  preview_description?: string;
  preview_thumbnail_url?: string;
  // Common
  provider?: string;
  display_mode?: "literal" | "hyperlink" | "thumbnail";
  link_text?: string;
}

export async function POST(req: NextRequest) {
  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  if (!OWNER_TYPES.has(body.owner_event_type)) {
    return NextResponse.json({ error: "bad_owner_type" }, { status: 400 });
  }
  if (!KINDS.has(body.kind)) {
    return NextResponse.json({ error: "bad_kind" }, { status: 400 });
  }
  if (body.provider && !PROVIDERS.has(body.provider)) {
    return NextResponse.json({ error: "bad_provider" }, { status: 400 });
  }
  if (body.kind === "hosted_file") {
    if (!body.file_type || !FILE_TYPES.has(body.file_type)) {
      return NextResponse.json({ error: "bad_file_type" }, { status: 400 });
    }
    if (!body.r2_object_keys || body.r2_object_keys.length === 0) {
      return NextResponse.json({ error: "missing_r2_keys" }, { status: 400 });
    }
  } else {
    if (!body.url) {
      return NextResponse.json({ error: "missing_url" }, { status: 400 });
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // OG-preview enrichment for new website / generic external links — only
  // when caller didn't already populate the preview fields.
  if (body.kind === "external_link" && body.url && !body.preview_title) {
    try {
      const og = await fetchOgPreview(body.url, req.nextUrl.origin);
      if (og) {
        body.preview_title = body.preview_title ?? og.title;
        body.preview_description = body.preview_description ?? og.description;
        body.preview_thumbnail_url =
          body.preview_thumbnail_url ?? og.thumbnailUrl;
      }
    } catch {
      // OG fetch is a best-effort enrichment. The row still saves; the
      // renderer falls back to a domain-only card.
    }
  }

  const row = {
    ...(body.id ? { id: body.id } : {}),
    owner_event_type: body.owner_event_type,
    owner_event_id: body.owner_event_id,
    kind: body.kind,
    display_label: body.display_label,
    position: body.position ?? 0,
    file_type: body.file_type ?? null,
    r2_object_keys: body.r2_object_keys ?? [],
    file_size_bytes: body.file_size_bytes ?? null,
    original_filename: body.original_filename ?? null,
    mime_type: body.mime_type ?? null,
    width: body.width ?? null,
    height: body.height ?? null,
    url: body.url ?? null,
    preview_title: body.preview_title ?? null,
    preview_description: body.preview_description ?? null,
    preview_thumbnail_url: body.preview_thumbnail_url ?? null,
    preview_fetched_at: body.preview_title ? new Date().toISOString() : null,
    provider: body.provider ?? null,
    display_mode: body.display_mode ?? "thumbnail",
    link_text: body.link_text ?? null,
    uploaded_by_id: user.id,
  };

  const { data, error } = await supabase
    .from("resources")
    .upsert(row, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    // Surface the count-limit trigger message cleanly.
    const code = error.message.includes("resource_limit_files")
      ? "file_limit"
      : error.message.includes("resource_limit_images")
        ? "image_limit"
        : "db_error";
    return NextResponse.json(
      { error: code, detail: error.message },
      { status: 400 },
    );
  }

  return NextResponse.json({ resource: data });
}

// ── Internal: dogfood the OG-preview route ────────────────────────────────
async function fetchOgPreview(
  url: string,
  origin: string,
): Promise<{
  title?: string;
  description?: string;
  thumbnailUrl?: string;
  domain?: string;
} | null> {
  const r = await fetch(
    `${origin}/api/og-preview?url=${encodeURIComponent(url)}`,
  );
  if (!r.ok) return null;
  return (await r.json()) as {
    title?: string;
    description?: string;
    thumbnailUrl?: string;
    domain?: string;
  };
}
