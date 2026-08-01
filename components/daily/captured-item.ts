// captured-item.ts — the CapturedItem shape and the File → CapturedItem
// mapping, extracted OUT of ResourceComposer.tsx.
//
// WHY THIS MODULE EXISTS (bundle boundary, not taste):
// ComposerHost loads <ResourceComposer> through next/dynamic so the composer —
// the rich-text editor, the PDF-thumbnail renderer, the All-tools capture wall,
// and their CSS — stays out of every planner route's initial JS. That boundary
// was DEFEATED for months by three callsites that imported `fileToCapturedItem`
// as a VALUE from ResourceComposer.tsx:
//   • components/daily/ResourcesPanel.tsx        (reachable from /weekly)
//   • components/lesson-editor/AddResourceMenu.tsx (reachable from /weekly)
//   • components/daily/AllToolsMenu.tsx          (inside the composer island)
// A value import pulls the WHOLE module graph, so the drag-drop path on the
// resources panel dragged the entire composer into /weekly's initial bundle and
// the next/dynamic call bought nothing. Measured: the composer chunk was in
// /weekly's initial set.
//
// These helpers are pure — no React, no CSS, no DOM beyond URL.createObjectURL
// — so they are safe to import from anywhere WITHOUT pulling the dialog in.
//
// RULE FOR FUTURE EDITS: anything a non-composer surface needs at runtime
// belongs HERE, not in ResourceComposer.tsx. ResourceComposer deliberately does
// NOT re-export these values — so a future value import from it fails to
// compile rather than silently re-defeating the lazy boundary.

import type { LessonResource, ResourceProvider } from "@/lib/types";

/** A resource the teacher has captured but not yet committed. */
export interface CapturedItem {
  /** Stable id for the React key + remove handling. */
  id: string;
  /** Mapped from mime / source — drives the tile icon and the eventual LessonResource type. */
  type: LessonResource["type"];
  /** Human label — filename, URL, or "Pasted image" fallback. */
  label: string;
  /** Optional per-resource rich-text note. In resource mode the step-2
   *  "+ Add a note to an item" reveal writes formatted notes (links, lists,
   *  inline images) for THIS resource. Persisted to the resource's `body`
   *  field on Add (NOT folded onto the label — the model carries `body`
   *  on every resource). Default empty. Stored as sanitized HTML. */
  body?: string;
  /** Real URL (embed source for links; `blob:` for in-session files). */
  url?: string;
  /** Fine-grained provider from parseResourceUrl or mime detection. */
  provider?: ResourceProvider;
  /** Link display mode — only meaningful when provider is "website". */
  displayMode?: "literal" | "hyperlink" | "thumbnail";
  /** Anchor text when displayMode === "hyperlink". */
  linkText?: string;
  mimeType?: string;
  sizeBytes?: number;
  thumbnailUrl?: string;
  /** Set true for file items so the capture caps can bucket them. */
  isFile?: boolean;
  /** The underlying File, kept so a backend-mode Add can upload the bytes to
   *  R2. Absent for links / title-only stubs. Not persisted anywhere. */
  file?: File;
  /** Notecard EDIT only — the original gallery LessonResource this strip
   *  tile represents. Committed verbatim (so reorder/remove of existing
   *  gallery media never rewrites the resource payload). Absent for fresh
   *  captures. */
  existing?: LessonResource;
}

/** Tiny unique id (strip keys + nothing else). */
let _seq = 0;
export function uid(prefix: string): string {
  _seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${_seq}`;
}

/** Map a File's mime type to a LessonResource type. Used by both the
 *  composer's file pickers and the drag-drop path in ResourcesPanel. */
export function mimeToResourceType(file: File): LessonResource["type"] {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";
  if (
    file.type === "application/msword" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.type === "application/vnd.oasis.opendocument.text"
  ) {
    return "doc";
  }
  // Slides — DOC-style office package or .key fallback.
  if (
    file.type === "application/vnd.ms-powerpoint" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return "slides";
  }
  // Anything else — treat as a generic "link/file" attachment.
  return "link";
}

/** Map a File's mime to the fine-grained `ResourceProvider` tag used by
 *  the embed primitives. Mirrors `mimeToResourceType` but returns the
 *  newer provider taxonomy (image / pdf / video / audio) so renderers can
 *  pick the right branch from a session-only blob URL. Returns undefined
 *  for things we don't yet recognise. */
function mimeToProvider(file: File): ResourceProvider | undefined {
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return undefined;
}

/** Convert a File into a CapturedItem. Mints a session-only `blob:` URL
 *  so the captured strip can preview the file in-place before commit
 *  (the real R2 upload runs at commit time in backend mode). */
export function fileToCapturedItem(file: File): CapturedItem {
  return {
    id: uid("cap"),
    type: mimeToResourceType(file),
    label: file.name || "File",
    url: URL.createObjectURL(file),
    provider: mimeToProvider(file),
    mimeType: file.type,
    sizeBytes: file.size,
    isFile: true,
    file,
  };
}
