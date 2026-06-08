// lib/resource-upload.ts — client-side hosted-file upload flow (browser → R2).
//
// The Resources composer captures a File as a session-only blob URL. To make
// an upload PERSIST (survive reload + reach the team) the bytes must land in
// Cloudflare R2 and a row be created in the `resources` table. The SERVER half
// is already built (app/api/resources/upload + app/api/resources); this is the
// missing CLIENT half:
//
//   1. POST /api/resources/upload  — preflight; returns a presigned R2 PUT URL,
//                                     a server-minted resource_id, and the
//                                     server-derived file_type.
//   2. PUT  <upload_url>           — the browser uploads the bytes straight to
//                                     R2. Content-Type MUST be sent (the URL
//                                     signs only the host; finalize reads the
//                                     REAL stored content-type to verify).
//   3. POST /api/resources         — finalize: the server HEADs the stored
//                                     object, verifies the real mime/size, and
//                                     creates the hosted_file row keyed to the
//                                     same resource_id.
//
// The persisted file is served (and previewed) via /api/resources/{id}, which
// 302-redirects to a short-lived signed R2 GET. We store THAT relative URL on
// the LessonResource (plus resourceId) so it rides the existing section/lesson
// JSONB persistence + hydration — no new hydration path is needed.
//
// Gating: callers only take this path when isPlannerSupabaseConfigured() is
// true (a real Supabase project + the planner flag). With the flag off the
// composer keeps its session-only blob behavior.

import type { Lesson, ResourceProvider } from "@/lib/types";

/** Owner-event pointer for the polymorphic `resources` table. */
export interface ResourceOwnerEvent {
  ownerEventType: "core_lesson_event";
  ownerEventId: string;
}

/**
 * Resolve the `resources`-table owner event for a planner lesson. Hosted files
 * are TEAM-SHARED at the master core-lesson event (the schema has no per-teacher
 * file owner type), so we point at the lesson's master id. The planner keeps
 * `lesson.id` stable on the master id even when a personal content-copy exists
 * (lib/planner/supabase-source.ts buildLesson), so this IS the master event id
 * for core lessons.
 *
 * NOTE: teacher-authored ("extra") lessons are not core events; an upload to
 * one fails closed server-side (auth_can_access_event returns false) and the
 * caller surfaces the error. Supporting authored lessons needs the
 * extra_lesson_event owner mapping + a Lesson discriminator (future slice).
 */
export function resourceOwnerEvent(lesson: Lesson): ResourceOwnerEvent {
  return { ownerEventType: "core_lesson_event", ownerEventId: lesson.id };
}

/** Map the server's coarse file_type to the embed renderer's provider tag.
 *  docx / rtf have no embeddable provider — they render as an open/download
 *  link card, so we leave provider undefined for them. */
function fileTypeToProvider(fileType: string): ResourceProvider | undefined {
  switch (fileType) {
    case "image":
      return "image";
    case "pdf":
      return "pdf";
    default:
      return undefined;
  }
}

/** Friendly messages for the API error codes the upload flow can return. */
const ERROR_MESSAGES: Record<string, string> = {
  unauthenticated: "You're signed out — sign in again to upload files.",
  no_scope:
    "Your account isn't linked to a grade yet, so uploads are disabled.",
  bad_owner_event_id: "Files can only be uploaded to core lessons right now.",
  bad_owner_type: "Files can only be uploaded to core lessons right now.",
  too_large: "That file is over the size limit.",
  file_limit: "This lesson already has the maximum of 10 files.",
  image_limit: "This lesson already has the maximum of 10 images.",
  bad_mime: "That file type isn't supported.",
  bad_object_mime: "That file type isn't supported.",
  object_not_found: "The upload didn't complete — please try again.",
  verify_failed: "Storage is unreachable right now — please try again.",
};

/** A typed upload failure carrying the API error code for friendly messaging. */
export class ResourceUploadError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? ERROR_MESSAGES[code] ?? `Upload failed (${code}).`);
    this.name = "ResourceUploadError";
    this.code = code;
  }
}

/** Pull the `error` code out of a JSON error body, defaulting by fallback. */
async function errorFrom(
  res: Response,
  fallback: string,
): Promise<ResourceUploadError> {
  let code = fallback;
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) code = body.error;
  } catch {
    // non-JSON body — keep the fallback code
  }
  return new ResourceUploadError(code);
}

export interface HostedUploadInput {
  owner: ResourceOwnerEvent;
  file: File;
  /** Display label for the row (filename, or the teacher's title). */
  displayLabel: string;
}

export interface HostedUploadResult {
  resourceId: string;
  /** Relative serve URL — /api/resources/{id} → 302 → signed R2 GET. */
  url: string;
  provider?: ResourceProvider;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Upload one file to R2 and finalize its `resources` row. Throws
 * ResourceUploadError on any step's failure (the caller keeps the dialog open
 * and shows the message). On success the returned `url`/`resourceId` replace
 * the session blob on the LessonResource.
 */
export async function uploadHostedFile(
  input: HostedUploadInput,
): Promise<HostedUploadResult> {
  const { owner, file } = input;

  // 1. Preflight — presigned PUT URL + server-minted id.
  const presignRes = await fetch("/api/resources/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner_event_type: owner.ownerEventType,
      owner_event_id: owner.ownerEventId,
      filename: file.name,
      content_type: file.type,
      size_bytes: file.size,
    }),
  });
  if (!presignRes.ok) throw await errorFrom(presignRes, "upload_failed");
  const presign = (await presignRes.json()) as {
    resource_id?: string;
    upload_url?: string;
    file_type?: string;
  };
  if (!presign.resource_id || !presign.upload_url) {
    throw new ResourceUploadError("bad_presign", "Upload could not start.");
  }

  // 2. PUT the bytes straight to R2. The Content-Type MUST be sent — the
  // presigned URL signs only the host, and finalize reads the REAL stored
  // content-type to verify the file.
  let putRes: Response;
  try {
    putRes = await fetch(presign.upload_url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
  } catch {
    throw new ResourceUploadError(
      "put_failed",
      "Couldn't reach storage — check your connection and try again.",
    );
  }
  if (!putRes.ok) {
    throw new ResourceUploadError(
      "put_failed",
      `Upload to storage failed (${putRes.status}).`,
    );
  }

  // 3. Finalize — the server HEADs the object, verifies, and creates the row.
  const finalizeRes = await fetch("/api/resources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: presign.resource_id,
      owner_event_type: owner.ownerEventType,
      owner_event_id: owner.ownerEventId,
      kind: "hosted_file",
      display_label: input.displayLabel,
      original_filename: file.name,
    }),
  });
  if (!finalizeRes.ok) throw await errorFrom(finalizeRes, "finalize_failed");

  return {
    resourceId: presign.resource_id,
    url: `/api/resources/${presign.resource_id}`,
    provider: fileTypeToProvider(presign.file_type ?? ""),
    mimeType: file.type,
    sizeBytes: file.size,
  };
}
