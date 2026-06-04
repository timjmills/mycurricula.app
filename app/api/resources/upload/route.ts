// app/api/resources/upload/route.ts
//
// POST /api/resources/upload — preflight that returns a presigned R2 PUT URL.
//
// Request body (client-supplied):
//   { owner_event_type, owner_event_id, filename, content_type, size_bytes }
//
// Response: { resource_id, object_key, upload_url, file_type, scope }
//
// The browser then PUTs the file to `upload_url`, and finalizes the row by
// POSTing to /api/resources with `{ id: resource_id, kind: "hosted_file",
// file_type, original_filename, ... }`. The finalize route RE-DERIVES the
// object key server-side and HEADs the stored object to verify the real
// content-type + byte size before any row is created — the client's claimed
// MIME/size and any client-sent object key are never trusted.
//
// SECURITY (audit finding #10):
//   • The R2 object key is SERVER-GENERATED. Its scope prefix is the
//     authenticated teacher's verified grade (`default_grade_level_id`),
//     resolved server-side — NEVER a client-supplied team/prefix field. The
//     `resource_id` is server-minted. `buildR2Key` validates every structural
//     segment is a UUID, so the client cannot inject a prefix or traverse out
//     of `<grade>/<event>/<resource>/`.
//   • The MIME allowlist + per-file size caps below are a CHEAP pre-buffer
//     reject so an oversize/bad-type request never gets a presigned URL. They
//     are advisory — the binding check is the HEAD verification in the
//     finalize route, which validates the REAL stored object.
//   • `uploaded_by_id` is stamped server-side in the finalize route from
//     auth.uid(); it is never accepted from the request body.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { presignPut, buildR2Key } from "@/lib/r2";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIMES: Record<string, "pdf" | "docx" | "rtf" | "image"> = {
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UploadBody {
  owner_event_type: string;
  owner_event_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  // NOTE: any client-supplied `team_id` / `object_key` / `key` / `prefix`
  // field is intentionally IGNORED. The scope prefix is derived server-side
  // from the authenticated teacher's verified grade.
}

export async function POST(req: NextRequest) {
  let body: UploadBody;
  try {
    body = (await req.json()) as UploadBody;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  if (!OWNER_TYPES.has(body.owner_event_type)) {
    return NextResponse.json({ error: "bad_owner_type" }, { status: 400 });
  }
  // owner_event_id must be a UUID — it becomes a structural key segment and is
  // validated again by buildR2Key. Reject early with a clear 400.
  if (
    typeof body.owner_event_id !== "string" ||
    !UUID_RE.test(body.owner_event_id)
  ) {
    return NextResponse.json({ error: "bad_owner_event_id" }, { status: 400 });
  }
  if (typeof body.filename !== "string" || !body.filename.trim()) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  // Allowlist the claimed MIME so we don't presign for a type we'll reject at
  // finalize. The REAL type is re-checked via HEAD before the row is created.
  const fileType = ALLOWED_MIMES[body.content_type];
  if (!fileType) {
    return NextResponse.json(
      { error: "bad_mime", detail: body.content_type },
      { status: 400 },
    );
  }

  // Reject oversize BEFORE doing any further work (rate-limit-friendly: we
  // never buffer the file here, and an oversize claim is bounced immediately).
  const cap = fileType === "image" ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
  if (
    typeof body.size_bytes !== "number" ||
    !Number.isFinite(body.size_bytes) ||
    body.size_bytes <= 0
  ) {
    return NextResponse.json({ error: "bad_size" }, { status: 400 });
  }
  if (body.size_bytes > cap) {
    return NextResponse.json({ error: "too_large", cap }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // ── Server-verified scope (audit #10) ──────────────────────────────────────
  // The key's scope prefix is the authenticated teacher's grade, read from the
  // DB under RLS — NOT any client field. If the caller has no provisioned
  // teacher row / grade, they cannot upload (fail closed).
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

  // Pre-count check. RLS filters this to rows the caller can see, which is
  // exactly the set the trigger evaluates. The DB trigger backstops races.
  const fileTypeFilter =
    fileType === "image" ? ["image", "image_stack"] : ["pdf", "docx", "rtf"];

  const { count, error: countErr } = await supabase
    .from("resources")
    .select("id", { count: "exact", head: true })
    .eq("owner_event_type", body.owner_event_type)
    .eq("owner_event_id", body.owner_event_id)
    .eq("kind", "hosted_file")
    .in("file_type", fileTypeFilter);

  if (countErr) {
    return NextResponse.json(
      { error: "db_error", detail: countErr.message },
      { status: 500 },
    );
  }
  if ((count ?? 0) >= 10) {
    return NextResponse.json(
      { error: fileType === "image" ? "image_limit" : "file_limit" },
      { status: 400 },
    );
  }

  // Server-mint the resource id and compose a SERVER-BOUND object key. The only
  // client-influenced segment is the filename, which buildR2Key sanitizes to a
  // safe leaf. buildR2Key throws if any UUID segment is malformed.
  const resource_id = crypto.randomUUID();
  let object_key: string;
  try {
    object_key = buildR2Key(
      scope,
      body.owner_event_id,
      resource_id,
      body.filename,
    );
  } catch {
    // Defensive: the segments are already validated above, so this should not
    // happen — but never presign a key we can't prove is well-formed.
    return NextResponse.json({ error: "bad_key" }, { status: 400 });
  }

  const upload_url = await presignPut(object_key, body.content_type, {
    expiresSeconds: 600,
  });

  return NextResponse.json({
    resource_id,
    object_key,
    upload_url,
    file_type: fileType,
    scope,
  });
}
