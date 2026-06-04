// app/api/resources/route.ts
//
// POST /api/resources         — create a row (link OR finalized hosted file)
// GET  /api/resources?owner_event_type=...&owner_event_id=...
//                             — list rows for one event, in display order
//
// Auth: every call requires a Supabase session. RLS does the team gate.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildR2Key, headObject } from "@/lib/r2";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Hosted-file verification limits — kept in lock-step with the presign route
// (app/api/resources/upload/route.ts). The finalize path re-checks the REAL
// stored object against these; the presign caps are only an early reject.
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Map the REAL R2 content-type to our coarse file_type. This is the binding
// allowlist for hosted files — the client's claimed mime_type/file_type is
// never trusted for storage; the value here is derived from the HEAD response.
const MIME_TO_FILE_TYPE: Record<string, "pdf" | "docx" | "rtf" | "image"> = {
  "application/pdf": "pdf",
  "application/msword": "docx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "docx",
  "application/rtf": "rtf",
  "text/rtf": "rtf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
};

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
   *  upload-presign route so the row consumes the same UUID. REQUIRED for
   *  hosted_file finalize — it is a structural segment of the server-derived
   *  object key. */
  id?: string;
  owner_event_type: string;
  owner_event_id: string;
  kind: "hosted_file" | "external_link" | "youtube_link" | "drive_link";
  display_label: string;
  position?: number;
  // Hosted-file fields.
  //
  // SECURITY (audit #10): `file_type`, `r2_object_keys`, `file_size_bytes` and
  // `mime_type` are NEVER taken from the client for storage. The server
  // re-derives the object key from the verified scope + owner_event_id + id +
  // sanitized original_filename, HEADs the stored object, and stamps the
  // real content-type / size / file_type / key from that. `original_filename`
  // is the only client-supplied hosted-file input that influences the key, and
  // it is sanitized identically on both the presign and finalize paths.
  original_filename?: string;
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
    // A hosted_file row may ONLY be finalized against an object the presign
    // route minted. The `id` (server-minted resource_id) and a UUID
    // owner_event_id are required structural segments of the server-derived
    // key; the original_filename is required to reproduce the exact leaf.
    if (typeof body.id !== "string" || !UUID_RE.test(body.id)) {
      return NextResponse.json({ error: "bad_resource_id" }, { status: 400 });
    }
    if (
      typeof body.owner_event_id !== "string" ||
      !UUID_RE.test(body.owner_event_id)
    ) {
      return NextResponse.json(
        { error: "bad_owner_event_id" },
        { status: 400 },
      );
    }
    if (
      typeof body.original_filename !== "string" ||
      !body.original_filename.trim()
    ) {
      return NextResponse.json({ error: "missing_filename" }, { status: 400 });
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

  // ── Hosted-file: server-bound key + REAL-object verification (audit #10) ────
  // We never trust the client's object key, mime, size, or file_type. Instead:
  //   1. Resolve the caller's verified grade scope (server-side).
  //   2. Re-derive the EXACT object key from scope + owner_event_id + id +
  //      sanitized original_filename — independent of any client field.
  //   3. HEAD the stored object and validate the REAL content-type against the
  //      allowlist and the REAL byte size against the cap.
  //   4. Stamp file_type / size / key from the verified values.
  let verifiedFileType: "pdf" | "docx" | "rtf" | "image" | null = null;
  let verifiedKeys: string[] = [];
  let verifiedSize: number | null = null;
  let verifiedMime: string | null = null;
  if (body.kind === "hosted_file") {
    const { data: teacher, error: teacherErr } = await supabase
      .from("teachers")
      .select("default_grade_level_id")
      .eq("id", user.id)
      .maybeSingle();
    if (teacherErr) {
      return NextResponse.json(
        { error: "db_error", detail: teacherErr.message },
        { status: 500 },
      );
    }
    const scope = teacher?.default_grade_level_id as string | null | undefined;
    if (!scope || !UUID_RE.test(scope)) {
      return NextResponse.json({ error: "no_scope" }, { status: 403 });
    }

    let objectKey: string;
    try {
      objectKey = buildR2Key(
        scope,
        body.owner_event_id,
        body.id as string,
        body.original_filename as string,
      );
    } catch {
      return NextResponse.json({ error: "bad_key" }, { status: 400 });
    }

    let head: Awaited<ReturnType<typeof headObject>>;
    try {
      head = await headObject(objectKey);
    } catch {
      // R2 unreachable / signing failure — do not create an unverified row.
      return NextResponse.json({ error: "verify_failed" }, { status: 502 });
    }
    if (!head) {
      // The object was never uploaded (or the key is wrong) → reject.
      return NextResponse.json({ error: "object_not_found" }, { status: 400 });
    }

    const realType = (head.contentType ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const ft = MIME_TO_FILE_TYPE[realType];
    if (!ft) {
      return NextResponse.json(
        { error: "bad_object_mime", detail: realType || null },
        { status: 400 },
      );
    }

    const size = head.contentLength;
    if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: "bad_object_size" }, { status: 400 });
    }
    const cap = ft === "image" ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
    if (size > cap) {
      return NextResponse.json({ error: "too_large", cap }, { status: 400 });
    }

    verifiedFileType = ft;
    verifiedKeys = [objectKey];
    verifiedSize = size;
    verifiedMime = realType;
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
    // Hosted-file storage columns come from the VERIFIED HEAD, never the client.
    file_type: verifiedFileType,
    r2_object_keys: verifiedKeys,
    file_size_bytes: verifiedSize,
    original_filename: body.original_filename ?? null,
    mime_type: verifiedMime,
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
