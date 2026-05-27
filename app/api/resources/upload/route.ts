// app/api/resources/upload/route.ts
//
// POST /api/resources/upload — preflight that returns a presigned R2 PUT URL.
//
// Request body:
//   { owner_event_type, owner_event_id, team_id, filename, content_type, size_bytes }
//
// Response: { resource_id, object_key, upload_url, file_type }
//
// The browser then PUTs the file to `upload_url`, and finalizes the row by
// POSTing to /api/resources with `{ id: resource_id, kind: "hosted_file",
// r2_object_keys: [object_key], ... }`.
//
// Limits enforced here:
//   • mime allowlist (PDF / DOCX / RTF / images)
//   • per-file size caps (25 MB files, 5 MB images)
//   • per-event counts (≤10 files, ≤10 images) — pre-checked; the DB
//     trigger backstops races.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { presignPut, r2Key } from "@/lib/r2";

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

interface UploadBody {
  owner_event_type: string;
  owner_event_id: string;
  team_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
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
  if (!body.owner_event_id || !body.team_id || !body.filename) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const fileType = ALLOWED_MIMES[body.content_type];
  if (!fileType) {
    return NextResponse.json(
      { error: "bad_mime", detail: body.content_type },
      { status: 400 },
    );
  }

  const cap = fileType === "image" ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
  if (typeof body.size_bytes !== "number" || body.size_bytes <= 0) {
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

  // Pre-count check. RLS filters this to rows the caller can see, which is
  // exactly the set the trigger evaluates. The trigger backstops races.
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

  const resource_id = crypto.randomUUID();
  const object_key = r2Key(
    body.team_id,
    body.owner_event_id,
    resource_id,
    body.filename,
  );
  const upload_url = await presignPut(object_key, body.content_type, {
    expiresSeconds: 600,
  });

  return NextResponse.json({
    resource_id,
    object_key,
    upload_url,
    file_type: fileType,
  });
}
