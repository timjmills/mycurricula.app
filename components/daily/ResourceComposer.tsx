"use client";

// ResourceComposer.tsx — the add-resource / notecard composer dialog.
//
// Rebuilt to the 6.12.26 Resource & Notecard Redesign §3 ("Composer — one
// dialog, two modes"). The AUTHORITATIVE visual spec is
// `Documents/Claude Design/6.12.26 design_handoff_ux_roadmap_and_resources/
// resource_redesign/rn.css` (.rn-dialog block family) + the
// `surface-composer.jsx` artboards. The commit / persistence machinery from
// the previous composer survives unchanged — only the UI shell is new.
//
// ── Anatomy (top to bottom) ─────────────────────────────────────────────
//   • Scrim (frosted full-viewport overlay; click-to-dismiss). On phone
//     (≤480px) the dialog becomes a full-height bottom sheet.
//   • Dialog (520px, --r-xl, --sh-lg):
//       Head    — mode badge (blue "Add resources" / honey "New notecard"),
//                 2-dot stepper (resource mode only), close (≥44px hit area).
//       Body    — per mode/step (below).
//       Foot    — quiet "Session only" badge (grey pill + amber dot) while
//                 captures are unsaved in mock mode, then Cancel/Back +
//                 the primary commit button.
//
// ── Resource mode: staged capture → review (P2) ─────────────────────────
//   Step 1 · Capture:
//     4-up capture grid — Upload · Link · Google Drive · Camera. Drive +
//     Camera are visibly disabled ("Soon" sub-label, 55% opacity) with
//     why-tooltips; the working Camera path stays reachable via All tools.
//     Below: the "All tools" wall trigger (AllToolsMenu sub-view), the
//     drop hint (files can be dropped anywhere on the dialog), and the
//     captured-items strip (86px tiles, removable ×, drag-reorder).
//   Step 2 · Review & route:
//     Upload error strip (danger tint + inline Retry — succeeded uploads
//     stay cached and never re-upload), the same captured strip, the Title
//     field (single item only — steers its label), a collapsed "+ Add a
//     note to an item" reveal (per-resource rich-text body notes), and the
//     Destination routing selects (Subject · Unit · Lesson · Section).
//
// ── Notecard mode: single screen ─────────────────────────────────────────
//   Card title · editable media gallery (drag-reorder + per-item remove;
//   poster = gallery[0], shown with a honey outline + "POSTER" tag —
//   reorder IS the poster control, per the handoff's delegated decision) ·
//   rich-text notes (the existing components/rich-text editor, unchanged) ·
//   Destination. "Edit note" on an existing resource opens this same
//   screen prefilled with the resource's body + gallery, routing locked.
//
// ── Capture sources (the one capture engine both modes share) ────────────
//   • Upload file picker (multi-select), the inline URL row (Link),
//     the AllToolsMenu wall (Camera / Photo album / YouTube / Card wall…).
//   • Clipboard paste on the dialog (image → image item, URL → link item).
//   • Drag-drop onto the dialog (the drop hint is honest).
//   • initialItems prop — drag-drop on the Resources panel pre-populates
//     the strip; the teacher confirms + routes before anything commits.
//
// ── Storage on Add (the three commit paths — UNCHANGED machinery) ────────
//   • resource mode — every captured item becomes a separate
//     LessonResource (each may carry its own rich `body` note) at the
//     routed destination: section → addSectionResource, whole lesson →
//     editLesson({resources}).
//   • notecard CREATE — exactly ONE makeNotecard({label, gallery, body}).
//   • notecard EDIT (editResource) — patches the existing resource's
//     body + gallery in place via editSectionResource / editLesson. The
//     gallery strip seeds from the existing gallery so reorder/remove
//     persist (AC-7); untouched galleries round-trip identically to the
//     old append-only merge.
//   Backend mode: file items presign → PUT to R2 → finalize via
//   uploadHostedFile BEFORE the store write; mock mode keeps session-only
//   blob:/data: URLs and never touches the network.
//
// ── Accessibility ───────────────────────────────────────────────────────
//   • role="dialog" + aria-modal + aria-labelledby; focus trap; Escape
//     closes (pickers / All-tools back out first); focus restore on close.
//   • All touch targets ≥44px (small visuals get hit-area inflation).
//   • Captured tiles are keyboard-reorderable (arrow keys) in addition to
//     pointer drag. prefers-reduced-motion drops the enter motion.

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { Lesson, LessonResource, SubjectId } from "@/lib/types";
import { usePlanner } from "@/lib/planner-store";
import { useLabels } from "@/lib/labels";
import { Button, Tooltip } from "@/components/ui";
import { parseResourceUrl, isSafeImgSrc } from "@/lib/resource-embed";
import { isPlannerSupabaseConfigured } from "@/lib/planner/source";
import {
  resourceOwnerEvent,
  uploadHostedFile,
  ResourceUploadError,
  type HostedUploadResult,
} from "@/lib/resource-upload";
import { renderPdfThumbnail } from "@/lib/pdf-thumbnail";
import { makeNotecard } from "@/lib/notecards";
import { RichTextEditor } from "@/components/rich-text";
// Shared icon vocabulary (extracted by PR #12). These six are imported from
// the shared folder rather than re-inlined so components/icons stays the
// single source — the composer keeps only the glyphs unique to it (Drive,
// Camera, NoteCard, Check, Warn, Plus, Grip, ChevronLeft/Right) local below.
// The shared icons carry intrinsic width/height; every consuming CSS slot
// sets an explicit svg width/height, so the swap preserves visual size.
import {
  CloseIcon,
  UploadIcon,
  LinkIcon,
  SmallXIcon,
  MoreDotsIcon,
  ChevronDownIcon,
} from "@/components/icons";
import { AllToolsMenu } from "./AllToolsMenu";
import styles from "./ResourceComposer.module.css";

// ── Public types (consumed by ResourcesPanel + section-wiring agent) ────

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
  provider?: import("@/lib/types").ResourceProvider;
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

/** Summary of what landed in the planner doc on Add — handed back through
 *  the optional `onCommitted` seam for any caller that wants to react to a
 *  commit (historically the panel's photo-stack tracking, since dropped). */
export interface ResourceComposerCommit {
  /** Resolved destination lesson id. */
  lessonId: string;
  /** Resolved destination section id, or null for "Whole lesson". */
  sectionId: string | null;
  /** Number of resources actually written. */
  count: number;
  /** Resource type written (uniform when count > 1 — the composer never
   *  mixes types in a single batch). */
  type: LessonResource["type"];
}

/**
 * What the composer is BEING USED FOR — the caller's intent. This drives both
 * the body the dialog renders AND how `handleAdd` commits.
 *
 *   • "resource" (default) — capture one-or-more media / links (staged
 *     capture → review) and attach them as N separate LessonResources at
 *     the routed destination. Each capture can carry its own rich-text
 *     `body` note.
 *
 *   • "notecard" — capture media that become ONE notecard's flip-through
 *     `gallery`, plus a single RichTextEditor for the notecard's `body`.
 *     On commit this writes exactly ONE resource via
 *     `makeNotecard({ label, gallery, body })` — never N separate resources.
 */
export type ResourceComposerMode = "resource" | "notecard";

/**
 * Locator for "add / edit notes on an EXISTING resource" mode. When supplied
 * (alongside `mode="notecard"`), the composer does NOT create a new resource:
 * it opens pre-filled with the resource's current `body` (and label + gallery),
 * locks routing to the resource's existing home, and on commit PATCHES that
 * resource — setting its `body` and writing the edited `gallery` — via
 * `editSectionResource` (section route) or `editLesson` (whole-lesson route).
 * This is the "add a notecard/note to any existing resource" path.
 */
export interface ResourceComposerEditTarget {
  /** The lesson the resource lives on. */
  lessonId: string;
  /** The section the resource lives in, or null for a whole-lesson resource. */
  sectionId: string | null;
  /** The resource's stable id (SectionResource.id, or the synthesized
   *  `lesson:<id>:res:<i>` id for a whole-lesson resource — see below). */
  resourceId: string;
  /** For a whole-lesson resource (no real section id), the index into
   *  `lesson.resources` so the patch can target the right array slot. The
   *  synthesized id alone isn't enough to locate the row in `editLesson`. */
  lessonResourceIndex?: number;
  /** The resource being edited — seeds the title + body editor + gallery. */
  resource: LessonResource;
}

/** Public API for ResourceComposer. Stable — the panel/section agents
 *  import this and the component will not change shape after first pass. */
export interface ResourceComposerProps {
  /** Render the composer only when true. */
  open: boolean;
  /** The lesson the composer was launched from. Drives the default routing
   *  AND the week scope for the Lesson picker. */
  lesson: Lesson;
  /**
   * What the composer is for (see ResourceComposerMode). Defaults to
   * "resource" so every existing caller keeps its current behavior. Pass
   * "notecard" to build a single notecard (gallery + rich body), or pair
   * "notecard" with `editResource` to add/edit notes on an existing resource.
   */
  mode?: ResourceComposerMode;
  /**
   * "Add / edit notes on THIS existing resource" target. When set the composer
   * patches the existing resource's `body`/`gallery` instead of creating a new
   * one, and routing is locked to the resource's home. Requires `mode` to be
   * "notecard" (a note IS the notecard capability on a normal card); a caller
   * that passes `editResource` without setting mode gets notecard mode
   * implicitly. Ignored when undefined.
   */
  editResource?: ResourceComposerEditTarget;
  /** Optional initial section id — when launched from a section's "+",
   *  this section is preselected (instead of "Whole lesson"). */
  initialSectionId?: string;
  /** Items already captured before the composer opened (e.g. by a drag-drop
   *  onto the Resources panel). Pre-populates the strip; the teacher
   *  still has to confirm + route + commit. */
  initialItems?: CapturedItem[];
  /** When true the routing selects are read-only (60% opacity, .locked) —
   *  used when the opening context fixes the destination (e.g. "add more
   *  photos" on a stack tile, or a section-scoped open). */
  lockRouting?: boolean;
  /** Fired when the dialog is dismissed (Escape, scrim click, × button). */
  onClose: () => void;
  /** Optional — called immediately AFTER a successful commit, before close,
   *  with a summary of what landed. Kept as a public seam for callers that
   *  want to react to a commit (no current caller passes it — the old
   *  ResourcesPanel "photo-stack" flow that consumed it was dropped). */
  onCommitted?: (summary: ResourceComposerCommit) => void;
}

// ── Focusable selector (mirrors SaveTargetDialog) ────────────────────────
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A URL is "a string starting with http:// or https:// with no whitespace".
// Stricter than the spec but good enough to recognise a pasted link.
const URL_REGEX = /^https?:\/\/\S+$/;

/** True only for a well-formed absolute http(s) URL. The paste path already
 *  gates on URL_REGEX, but typed/manual entry (the inline Link row, the
 *  All-tools URL row) is NOT enforced by `input type="url"` in JS — so a
 *  `javascript:` / `data:` / `blob:` / protocol-relative / garbage string
 *  could otherwise be captured and later rendered. We gate twice: the regex
 *  blocks non-http(s) schemes + whitespace cheaply, then `new URL()` confirms
 *  the value actually parses and re-checks the protocol (defence in depth). */
function isCapturableWebUrl(value: string): boolean {
  if (!URL_REGEX.test(value)) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// ── Resource caps ────────────────────────────────────────────────────────
// Mirror the API allowlist in app/api/resources/upload/route.ts so the
// composer rejects out-of-spec uploads with a clear inline message
// before the file ever hits the network.

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_FILES_PER_LESSON = 10;
const MAX_IMAGES_PER_LESSON = 10;

const ALLOWED_MIMES: ReadonlySet<string> = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "text/rtf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Tiny unique id (strip keys + nothing else). */
let _seq = 0;
function uid(prefix: string): string {
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
function mimeToProvider(
  file: File,
): import("@/lib/types").ResourceProvider | undefined {
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

/** Build a link CapturedItem from a raw URL via parseResourceUrl, so the
 *  tile carries a real provider + thumbnail + display name. Shared by the
 *  inline URL row and the paste handler. */
function linkToCapturedItem(raw: string): Omit<CapturedItem, "id"> {
  const parsed = parseResourceUrl(raw);
  return {
    type:
      parsed.provider === "youtube" ||
      parsed.provider === "vimeo" ||
      parsed.provider === "video"
        ? "youtube"
        : parsed.provider === "gslides"
          ? "slides"
          : parsed.provider === "gdocs" || parsed.provider === "gsheets"
            ? "doc"
            : parsed.provider === "gdrive" || parsed.provider === "pdf"
              ? "pdf"
              : parsed.provider === "image"
                ? "image"
                : "link",
    label: parsed.displayName,
    url: raw,
    provider: parsed.provider,
    thumbnailUrl: parsed.thumbnailUrl ?? undefined,
    // Default to "thumbnail" for every link — the previous per-chip
    // display-mode toggle was dropped by the redesign; the default flows
    // through to LessonResource.displayMode unchanged.
    displayMode: "thumbnail",
  };
}

/** Strip HTML so "has this rich note any text" checks ignore empty <p>s. */
function plainText(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

// ── Component ────────────────────────────────────────────────────────────

export function ResourceComposer({
  open,
  lesson,
  mode = "resource",
  editResource,
  initialSectionId,
  initialItems,
  lockRouting = false,
  onClose,
  onCommitted,
}: ResourceComposerProps): ReactNode {
  // Passing an editResource implies notecard mode (a note IS the notecard
  // capability on a normal card), so a caller can omit `mode` when editing.
  // Routing is always locked when editing an existing resource — its home is
  // fixed — so we OR it into the lockRouting the caller passed.
  const isNotecardMode = mode === "notecard" || editResource != null;
  const isEditMode = editResource != null;
  const routingLocked = lockRouting || isEditMode;
  // ── Cross-agent label contract ───────────────────────────────────────
  // useLabels() ships from lib/labels.tsx. The defaults match the four
  // words we'd hard-code anyway, so this stays safe regardless.
  const labels = useLabels();

  // ── ID + refs ────────────────────────────────────────────────────────
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  /** Focuses the first capture-grid button ([data-autofocus]) — queried
   *  through the panel because the Tooltip wrapper owns the trigger ref. */
  const focusFirstCapture = useCallback(() => {
    panelRef.current
      ?.querySelector<HTMLButtonElement>("[data-autofocus]")
      ?.focus();
  }, []);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  // Track the element that held focus before we opened so we can restore.
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // ── Planner store ────────────────────────────────────────────────────
  // Subjects come from the planner store's catalog (frozen API) rather than
  // lib/mock SUBJECTS — the composer always renders under PlannerProvider
  // (launched from LessonDetail / lesson-flow on the (planner) routes).
  const {
    lessons,
    getSections,
    addSectionResource,
    editSectionResource,
    editLesson,
    getLesson,
    subjects,
  } = usePlanner();

  // ── Local UI state — the §3 composer state machine ───────────────────
  //   mode    — from props (isNotecardMode above).
  //   step    — 1 (capture) | 2 (review & route). Resource mode only;
  //             notecard mode is a single screen.
  //   items   — ordered captures[]; index 0 = poster (notecard mode).
  //   routing — subject/unit/lesson/section target.
  //   error   — uploadError + cached-retry state.
  //   dirty   — derived (uncommitted captures) → "Session only" badge.
  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [linkOpen, setLinkOpen] = useState<boolean>(false);
  const [linkValue, setLinkValue] = useState<string>("");
  /** Switches the body to the "All tools" expanded grid (the card-wall
   *  tool menu). Returning sets this back to false. */
  const [allToolsOpen, setAllToolsOpen] = useState<boolean>(false);
  /** Notecard mode — whether the "+" gallery tile has revealed the
   *  capture methods block. */
  const [captureOpen, setCaptureOpen] = useState<boolean>(false);
  const [items, setItems] = useState<CapturedItem[]>([]);
  /** Step 2 — whether the collapsed "+ Add a note to an item" reveal is
   *  open, and which captured item the note editor is bound to. */
  const [notesOpen, setNotesOpen] = useState<boolean>(false);
  const [noteItemId, setNoteItemId] = useState<string | null>(null);
  /** Inline status copy — "Pasted image" / "Pasted link" — appears under
   *  the captured strip so a teacher knows their paste registered. */
  const [pastedStatus, setPastedStatus] = useState<string | null>(null);
  /** Inline rejection copy — "Skipped photo.png — image must be ≤ 5 MB"
   *  — appears under the captured strip when a capture is refused (size
   *  cap, mime allowlist, or the per-lesson count cap). Auto-clears. */
  const [rejectionStatus, setRejectionStatus] = useState<string | null>(null);
  /** True while hosted-file uploads to R2 are in flight (backend mode). */
  const [uploading, setUploading] = useState<boolean>(false);
  /** Inline error when a hosted-file upload fails — feeds the step-2 error
   *  strip (danger tint + Retry); the dialog never closes on failure. */
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** Index currently being pointer-dragged in the strip (reorder). */
  const dragIndexRef = useRef<number | null>(null);
  // Whether the planner Supabase seam is on. When true, file uploads persist
  // to R2 + the resources table; when false the composer keeps its
  // session-only blob behavior (mock / local — nothing touches network).
  const backendOn = isPlannerSupabaseConfigured();

  // Routing — initialize from the launching lesson + (optional) section.
  // The Section select carries the special value "" to mean "Whole lesson".
  const [subjectId, setSubjectId] = useState<SubjectId>(lesson.subject);
  const [unitId, setUnitId] = useState<string>(lesson.unit);
  const [lessonId, setLessonId] = useState<string>(lesson.id);
  const [sectionId, setSectionId] = useState<string>(initialSectionId ?? "");

  // Which routing select's popover is currently open (null = none).
  const [openPicker, setOpenPicker] = useState<
    "subject" | "unit" | "lesson" | "section" | null
  >(null);

  // ── On open: reset state + land focus ────────────────────────────────
  // The `open` prop drives mount/unmount; this effect re-initialises every
  // time the dialog re-opens so a previous session's captures don't leak.
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Fresh session — forget the previous open's committed blob URLs so the
    // leak guard can reclaim anything that was abandoned (not committed) then.
    committedUrlsRef.current = new Set<string>();
    uploadedRef.current = new Map();
    pdfRenderedRef.current = new Set();

    // In edit mode, seed the title + rich body + GALLERY from the resource
    // being edited and route to its existing home; otherwise start blank at
    // the launching lesson. Existing gallery media become strip tiles that
    // carry the original LessonResource verbatim (committed as-is), so
    // reorder + remove are real edits (AC-7) without rewriting payloads.
    setStep(1);
    setTitle(editResource ? (editResource.resource.label ?? "") : "");
    setBody(editResource ? (editResource.resource.body ?? "") : "");
    setLinkOpen(false);
    setLinkValue("");
    setAllToolsOpen(false);
    setCaptureOpen(false);
    setNotesOpen(false);
    setNoteItemId(null);
    const seeded: CapturedItem[] = editResource
      ? (editResource.resource.gallery ?? []).map((g) => ({
          id: uid("cap"),
          type: g.type,
          label: g.label,
          url: g.url,
          provider: g.provider,
          thumbnailUrl: g.thumbnailUrl,
          existing: g,
        }))
      : [];
    setItems([...seeded, ...(initialItems ?? [])]);
    setPastedStatus(null);
    setRejectionStatus(null);
    setUploading(false);
    setUploadError(null);
    setSubjectId(lesson.subject);
    setUnitId(lesson.unit);
    setLessonId(editResource ? editResource.lessonId : lesson.id);
    setSectionId(
      editResource ? (editResource.sectionId ?? "") : (initialSectionId ?? ""),
    );
    setOpenPicker(null);

    // Move focus into the dialog on the next frame so the panel is mounted.
    // Notecard mode focuses the title; resource mode the first capture tool.
    const frame = requestAnimationFrame(() => {
      if (isNotecardMode) titleInputRef.current?.focus();
      else focusFirstCapture();
    });
    return () => cancelAnimationFrame(frame);
    // We intentionally do NOT re-run when initialItems/initialSectionId
    // change while open — the composer is a one-shot session per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Blob-URL leak guard ──────────────────────────────────────────────
  // File picks mint `blob:` URLs via URL.createObjectURL so the strip can
  // preview the file in-session. Those handles need an explicit
  // URL.revokeObjectURL when the composer closes (or the items are
  // dropped) or the browser leaks them for the page's lifetime.
  // URLs already handed to the planner store on commit must NOT be revoked
  // — the committed resource still points at the blob for the rest of the
  // session, so revoking it would leave the just-added tile rendering a
  // dead `blob:`. Reset on every re-open.
  const committedUrlsRef = useRef<Set<string>>(new Set<string>());

  // Cache of completed hosted-file uploads, keyed by CapturedItem id, so a
  // retry after a partial failure reuses results instead of re-uploading
  // (which would duplicate the R2 object + row and eat the count quota).
  const uploadedRef = useRef<Map<string, HostedUploadResult>>(new Map());

  // Per-item guard so each captured PDF's first-page poster renders only once.
  const pdfRenderedRef = useRef<Set<string>>(new Set());

  const itemsRef = useRef<CapturedItem[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(() => {
    if (open) return;
    // The dialog just closed — revoke every blob URL we created during this
    // session EXCEPT the ones already committed to the store (those must
    // stay alive so the resource's tile/preview keeps rendering). Tiles
    // seeded from an EXISTING gallery (notecard edit) are skipped outright:
    // we never minted those URLs, and revoking them would blank the
    // already-committed resource elsewhere.
    for (const item of itemsRef.current) {
      if (item.existing) continue;
      if (
        item.url?.startsWith("blob:") &&
        !committedUrlsRef.current.has(item.url)
      ) {
        URL.revokeObjectURL(item.url);
      }
    }
  }, [open]);
  // Unmount leak guard — the effect above only fires on an open→false
  // transition, so a composer unmounted WHILE open (e.g. the hosting drawer
  // closes and tears the subtree down mid-capture) would leak its minted
  // blob: URLs. Same rules as the close-time pass: skip `existing`-seeded
  // tiles (we never minted those URLs) and committed URLs (the store still
  // points at them). Revoking an already-revoked URL is a harmless no-op,
  // so running after a normal close is fine.
  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        if (item.existing) continue;
        if (
          item.url?.startsWith("blob:") &&
          !committedUrlsRef.current.has(item.url)
        ) {
          URL.revokeObjectURL(item.url);
        }
      }
    };
  }, []);

  // ── On close: restore focus ──────────────────────────────────────────
  useEffect(() => {
    if (open) return;
    const prev = previousFocusRef.current;
    if (prev && typeof prev.focus === "function") {
      const timer = setTimeout(() => prev.focus(), 0);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // ── Pasted status auto-clear (~2s) ───────────────────────────────────
  useEffect(() => {
    if (!pastedStatus) return;
    const t = setTimeout(() => setPastedStatus(null), 2000);
    return () => clearTimeout(t);
  }, [pastedStatus]);

  // ── Rejection status auto-clear (~6s) ────────────────────────────────
  // Rejections need a longer dwell than the pasted status because the
  // copy is longer (filename + cap + actual size) and the teacher needs
  // time to read it before deciding what to do.
  useEffect(() => {
    if (!rejectionStatus) return;
    const t = setTimeout(() => setRejectionStatus(null), 6000);
    return () => clearTimeout(t);
  }, [rejectionStatus]);

  // ── PDF first-page posters ───────────────────────────────────────────
  // Render a real first-page thumbnail for every captured PDF (client-side,
  // from the file's bytes — no server job, no CORS). Patches the item's
  // thumbnailUrl when it resolves so the strip + the eventual tile show the
  // page; on failure the PDF keeps its icon poster. Guarded per item so it
  // runs once, and it covers BOTH the picker and the drag-drop
  // (initialItems) capture paths since both land in `items`.
  useEffect(() => {
    for (const it of items) {
      const isPdf = it.provider === "pdf" || it.type === "pdf";
      if (
        !isPdf ||
        !it.file ||
        it.thumbnailUrl ||
        pdfRenderedRef.current.has(it.id)
      ) {
        continue;
      }
      pdfRenderedRef.current.add(it.id);
      const file = it.file;
      const id = it.id;
      renderPdfThumbnail(file)
        .then((thumbnailUrl) => {
          setItems((prev) =>
            prev.map((c) =>
              c.id === id && !c.thumbnailUrl ? { ...c, thumbnailUrl } : c,
            ),
          );
        })
        .catch(() => {
          // Best-effort — keep the icon poster on any render failure.
        });
    }
  }, [items]);

  // ── Derived: available units / lessons for the routing selects ───────
  // Units come from walking the planner store's lessons so the select never
  // offers a unit with zero lessons in the doc. Lessons are scoped to the
  // chosen unit AND the launching lesson's `week` when present — that
  // "show me THIS week" filter matches the routing spec.

  /** Subjects: just the canonical eight — fixed order, locked team-wide. */
  const subjectOptions = useMemo(() => subjects, [subjects]);

  /** Unique unit ids present in the planner doc for the chosen subject. */
  const unitOptions = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const l of lessons) {
      if (l.subject !== subjectId) continue;
      if (seen.has(l.unit)) continue;
      seen.set(l.unit, { id: l.unit, name: l.unit });
    }
    return [...seen.values()];
  }, [lessons, subjectId]);

  /** Lessons in the chosen unit. Scoped to the launching lesson's week
   *  when present (the routing spec: "filtered to the current week's
   *  lessons for that unit"). */
  const lessonOptions = useMemo(() => {
    const week = lesson.week;
    return lessons
      .filter((l) => l.unit === unitId)
      .filter((l) => (week ? l.week === week : true));
  }, [lessons, unitId, lesson.week]);

  /** Sections of the chosen lesson — the Section select shows these plus
   *  the special "Whole lesson" option at the top. */
  const sectionOptions = useMemo(
    () => (lessonId ? getSections(lessonId) : []),
    [lessonId, getSections],
  );

  // ── Cascading reset effects ──────────────────────────────────────────
  // Changing an upstream select collapses every downstream pick to the
  // first valid option. We do this in effects (not inside the setter) so
  // the cascade still fires for any future programmatic change.

  useEffect(() => {
    if (routingLocked) return;
    const validUnit = unitOptions.find((u) => u.id === unitId);
    if (validUnit) return;
    const first = unitOptions[0];
    setUnitId(first ? first.id : "");
    setLessonId("");
    setSectionId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, unitOptions.length]);

  useEffect(() => {
    if (routingLocked) return;
    const validLesson = lessonOptions.find((l) => l.id === lessonId);
    if (validLesson) return;
    const first = lessonOptions[0];
    setLessonId(first ? first.id : "");
    setSectionId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitId, lessonOptions.length]);

  // ── Capture handlers ─────────────────────────────────────────────────

  /** Append one CapturedItem, generating a fresh id. */
  const addItem = useCallback((partial: Omit<CapturedItem, "id">) => {
    setItems((prev) => [...prev, { ...partial, id: uid("cap") }]);
  }, []);

  /** Add many at once — used by the file picker / drop / paste paths.
   *  Validates every incoming item against the spec caps (mime allowlist,
   *  size cap, per-lesson count cap) and collects each rejection's reason.
   *  Accepted items merge into the strip; rejection reasons become an
   *  inline message ("Skipped photo.png — image must be ≤ 5 MB…").
   *
   *  Counts are local to the current strip — a Phase 1B+ improvement is
   *  to include the section's already-attached items in the count. Today
   *  the DB trigger backstops that case on the API side. */
  const addItems = useCallback((next: CapturedItem[]) => {
    if (next.length === 0) return;
    const reasons: string[] = [];
    setItems((prev) => {
      const merged: CapturedItem[] = [...prev];
      for (const item of next) {
        // Validate file metadata (mime + size) before the count check so
        // a teacher sees the actual reason — "wrong type" beats "limit
        // reached" when both could apply.
        if (item.isFile) {
          if (item.mimeType && !ALLOWED_MIMES.has(item.mimeType)) {
            reasons.push(
              `Skipped "${item.label}" — ${item.mimeType || "this file type"} isn't supported. ` +
                `Use PDF, DOCX, RTF, or PNG/JPG/WebP/GIF.`,
            );
            continue;
          }
          const sizeCap =
            item.provider === "image" ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
          const sizeLabel = item.provider === "image" ? "5 MB" : "25 MB";
          if (typeof item.sizeBytes === "number" && item.sizeBytes > sizeCap) {
            reasons.push(
              `Skipped "${item.label}" — ${item.provider === "image" ? "images" : "files"} must be ≤ ${sizeLabel} ` +
                `(yours: ${formatBytes(item.sizeBytes)}).`,
            );
            continue;
          }
        }

        // Per-lesson count cap — re-compute against the running merge so
        // the message reflects the exact threshold the user hit.
        const fileCount = merged.filter(
          (c) => c.isFile && c.provider !== "image",
        ).length;
        const imageCount = merged.filter(
          (c) => c.isFile && c.provider === "image",
        ).length;
        if (item.isFile && item.provider === "image") {
          if (imageCount >= MAX_IMAGES_PER_LESSON) {
            reasons.push(
              `Skipped "${item.label}" — limit reached (${MAX_IMAGES_PER_LESSON} images per lesson).`,
            );
            continue;
          }
        } else if (item.isFile) {
          if (fileCount >= MAX_FILES_PER_LESSON) {
            reasons.push(
              `Skipped "${item.label}" — limit reached (${MAX_FILES_PER_LESSON} files per lesson).`,
            );
            continue;
          }
        }
        merged.push(item);
      }
      return merged;
    });
    if (reasons.length > 0) {
      // Join with " · " when there are multiple — keeps the message a
      // single line and lets the teacher scan all reasons at once.
      setRejectionStatus(reasons.join(" · "));
    }
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((c) => c.id !== id));
    setNoteItemId((cur) => (cur === id ? null : cur));
  }, []);

  /** Reorder a captured item — pointer drag + keyboard arrows both land
   *  here. In notecard mode index 0 IS the poster, so reorder = the
   *  poster control (no separate "set poster" affordance, per the
   *  handoff's delegated decision). */
  const moveItem = useCallback((from: number, to: number) => {
    setItems((prev) => {
      if (from === to || from < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  /** Update one captured item's rich-text note (→ resource.body). Driven
   *  by the step-2 note editor's onChange, which already emits sanitized
   *  HTML; we store it verbatim (the editor owns the sanitizer boundary). */
  const setItemBody = useCallback((id: string, html: string) => {
    setItems((prev) =>
      prev.map((c) => (c.id === id ? { ...c, body: html } : c)),
    );
  }, []);

  // ── File picker change handler ───────────────────────────────────────

  const onUploadChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const captured: CapturedItem[] = [];
      for (let i = 0; i < files.length; i += 1) {
        captured.push(fileToCapturedItem(files[i]));
      }
      addItems(captured);
      // Reset the input so picking the same file twice still fires onChange.
      e.target.value = "";
    },
    [addItems],
  );

  // ── Capture tool click handlers ──────────────────────────────────────

  const onUploadClick = useCallback(() => uploadInputRef.current?.click(), []);
  const onLinkClick = useCallback(() => {
    setLinkOpen((v) => !v);
    // Focus the URL input on next frame so the inline row reveals + lands focus.
    requestAnimationFrame(() => linkInputRef.current?.focus());
  }, []);

  /** Best-effort OG enrichment for a plain website link. The browser can't
   *  read another origin's OG tags directly (CORS), so we ask our own
   *  SSRF-guarded `/api/og-preview` route. On success we patch the matching
   *  captured tile with a real thumbnail so it shows a card instead of a
   *  bare domain. Every failure is swallowed — the link still works
   *  without a thumbnail, in line with the session-only model. */
  const enrichWebsiteLink = useCallback((url: string): void => {
    void (async () => {
      try {
        const res = await fetch(
          `/api/og-preview?url=${encodeURIComponent(url)}`,
        );
        if (!res.ok) return;
        const og = (await res.json()) as { thumbnailUrl?: string };
        if (!og.thumbnailUrl) return;
        // Patch by URL match (a given URL is captured at most once). Only
        // fill a thumbnail we don't already have, and never clobber an item
        // the teacher meanwhile removed (the map is a no-op if it's gone).
        setItems((prev) =>
          prev.map((c) =>
            c.url === url && c.provider === "website" && !c.thumbnailUrl
              ? { ...c, thumbnailUrl: og.thumbnailUrl }
              : c,
          ),
        );
      } catch {
        // best-effort — ignore network / parse failures.
      }
    })();
  }, []);

  /** Confirm the inline URL: parse it through `parseResourceUrl` so the
   *  captured tile carries a real `provider`, `thumbnailUrl`, and
   *  `displayName`, then append a link item and clear the field. */
  const onLinkConfirm = useCallback(() => {
    const raw = linkValue.trim();
    if (!raw) return;
    // `input type="url"` does NOT enforce validity in JS, so a typed
    // `javascript:` / `data:` / protocol-relative / garbage value would
    // otherwise be stored and later rendered. Reject anything that isn't a
    // well-formed http(s) URL; keep the field populated so the teacher can
    // fix it, and surface the inline rejection message.
    if (!isCapturableWebUrl(raw)) {
      setRejectionStatus(
        "That doesn't look like a web link — use an http(s) address.",
      );
      return;
    }
    const parsed = linkToCapturedItem(raw);
    addItem(parsed);
    // Generic websites have no cheaply-derivable thumbnail — fetch one.
    if (parsed.provider === "website") enrichWebsiteLink(raw);
    setLinkValue("");
  }, [linkValue, addItem, enrichWebsiteLink]);

  const onLinkKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onLinkConfirm();
      }
    },
    [onLinkConfirm],
  );

  // ── Paste integration ────────────────────────────────────────────────
  // Listen for paste events on the dialog panel itself (NOT on a specific
  // input) so the teacher can paste from anywhere inside the composer.

  const onDialogPaste = useCallback(
    (e: ClipboardEvent<HTMLDivElement>) => {
      const cd = e.clipboardData;
      if (!cd) return;

      // 1) Try clipboard image items first — those win over text.
      const imgFiles: File[] = [];
      for (let i = 0; i < cd.items.length; i += 1) {
        const it = cd.items[i];
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) imgFiles.push(f);
        }
      }
      if (imgFiles.length > 0) {
        e.preventDefault();
        // Enrich pasted images with the same blob-URL + provider + size
        // shape that the file picker uses.
        const captured: CapturedItem[] = imgFiles.map((f) => ({
          id: uid("cap"),
          type: "image",
          label: f.name || "Pasted image",
          url: URL.createObjectURL(f),
          provider: "image",
          mimeType: f.type,
          sizeBytes: f.size,
          isFile: true,
          file: f,
        }));
        addItems(captured);
        setPastedStatus(
          captured.length === 1
            ? "Pasted image"
            : `Pasted ${captured.length} images`,
        );
        return;
      }

      // 2) Otherwise read plain text. URL → link item (parsed through
      // parseResourceUrl so we capture provider + thumbnail); anything
      // else falls through to the default paste in the focused field.
      const text = cd.getData("text");
      if (!text) return;

      if (URL_REGEX.test(text.trim())) {
        e.preventDefault();
        const raw = text.trim();
        const parsed = linkToCapturedItem(raw);
        addItem(parsed);
        if (parsed.provider === "website") enrichWebsiteLink(raw);
        setPastedStatus("Pasted link");
      }
    },
    [addItem, addItems, enrichWebsiteLink],
  );

  // ── Drag-drop onto the dialog ────────────────────────────────────────
  // The drop hint is honest: files dropped anywhere on the dialog land in
  // the captured strip through the same validated addItems path. Internal
  // strip-reorder drags are ignored here (they don't carry Files).

  const onDialogDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onDialogDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (!files || files.length === 0) return;
      const captured: CapturedItem[] = [];
      for (let i = 0; i < files.length; i += 1) {
        captured.push(fileToCapturedItem(files[i]));
      }
      addItems(captured);
    },
    [addItems],
  );

  // ── Inline-image resolver for the rich-text editors ──────────────────
  // The RichTextEditor calls this when the teacher inserts an inline image.
  // Backend mode → upload the picked file to R2 and return its served URL
  // (/api/resources/{id}) so it persists + reaches the team. Mock/session
  // mode → return a `data:` URL read from the file so the image renders in
  // this session (the body string carries the data URL through the JSONB
  // seam unchanged). Returns null (cancels insertion) on cancel/failure.
  // sanitizeHtml() drops an unsafe src at emit regardless.
  //
  // Caps mirror the captured-file image path (the same ALLOWED_MIMES image
  // subset + MAX_IMAGE_BYTES): without them, mock mode would inline the full
  // file as a `data:` URL — bloating the body + localStorage — and backend
  // mode would upload past the 5 MB image cap the capture path enforces.
  const requestBodyImageUrl = useCallback((): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      if (typeof document === "undefined") {
        resolve(null);
        return;
      }
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        // Enforce the image MIME allowlist + size cap BEFORE reading or
        // uploading. On violation cancel the insertion (resolve null) and
        // surface the same inline rejection mechanism the capture path uses
        // — never fail silently.
        if (!file.type.startsWith("image/") || !ALLOWED_MIMES.has(file.type)) {
          setRejectionStatus(
            `Skipped "${file.name || "image"}" — ${file.type || "this file type"} isn't a supported image. ` +
              `Use PNG, JPG, WebP, or GIF.`,
          );
          resolve(null);
          return;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          setRejectionStatus(
            `Skipped "${file.name || "image"}" — images must be ≤ 5 MB (yours: ${formatBytes(file.size)}).`,
          );
          resolve(null);
          return;
        }
        if (backendOn) {
          // Persist the inline image to R2 at the destination lesson's event.
          const owner = resourceOwnerEvent(getLesson(lessonId) ?? lesson);
          uploadHostedFile({ owner, file, displayLabel: file.name })
            .then((res) => resolve(res.url))
            .catch(() => resolve(null));
          return;
        }
        // Session mode — embed as a data: URL so it renders without a backend.
        const reader = new FileReader();
        reader.onload = () =>
          resolve(typeof reader.result === "string" ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      };
      input.click();
    });
  }, [backendOn, getLesson, lessonId, lesson]);

  // ── Commit ───────────────────────────────────────────────────────────
  // Three commit shapes, by mode:
  //   • resource mode — translate every captured item into a separate
  //     LessonResource at the routed destination (each carrying its own rich
  //     `body` note). Whole-lesson → editLesson; section → addSectionResource.
  //   • notecard CREATE — commit exactly ONE makeNotecard({label, gallery,
  //     body}); captured media become the gallery.
  //   • notecard EDIT (editResource) — patch the existing resource's
  //     body/gallery in place via editSectionResource / editLesson.

  const canAdd = useMemo(() => {
    // EDIT mode: always committable. Emptying the title, gallery, AND notes
    // is a legitimate edit — a teacher may intentionally clear a card
    // without deleting it — so Save stays enabled even when everything is
    // empty. CREATE keeps the guards below.
    if (isEditMode) return true;
    // Resource mode: at least one captured item OR a title (a title alone
    // creates a labelled "link" stub). Notecard mode: a title, captured
    // media, OR non-empty rich body is enough — a notes-only card is valid.
    if (isNotecardMode) {
      return (
        items.length > 0 ||
        title.trim().length > 0 ||
        plainText(body).length > 0
      );
    }
    return items.length > 0 || title.trim().length > 0;
  }, [isEditMode, isNotecardMode, items, title, body]);

  const handleAdd = useCallback(async () => {
    if (!canAdd || uploading) return;

    // Resolve the destination lesson; fall back to the launching lesson
    // if the select somehow ended up with a stale id.
    const destLesson = getLesson(lessonId) ?? lesson;
    const destLessonId = destLesson.id;
    const destSectionId = sectionId || null;

    // The commit shape carries the full LessonResource payload —
    // url/provider/displayMode/body/etc. — so a captured embed survives the
    // round-trip into the planner store. Fields are undefined for the
    // "title-only stub" path, which the store + renderer tolerate.
    type CommitShape = {
      type: LessonResource["type"];
      label: string;
      url?: string;
      provider?: import("@/lib/types").ResourceProvider;
      displayMode?: "literal" | "hyperlink" | "thumbnail";
      linkText?: string;
      mimeType?: string;
      sizeBytes?: number;
      thumbnailUrl?: string;
      resourceId?: string;
      /** Per-resource rich-text note → LessonResource.body (sanitized HTML). */
      body?: string;
      /** Transient: the File to upload, its blob URL, the source
       *  CapturedItem id (upload-cache key), and — notecard EDIT only —
       *  the original gallery LessonResource to commit verbatim. Never
       *  dispatched. */
      __file?: File;
      __blobUrl?: string;
      __id?: string;
      __existing?: LessonResource;
    };
    // In notecard mode the captured items become the card's GALLERY, so the
    // "title-only" stub is never minted (a notes-only / title-only notecard is
    // valid and built from `body`/`title` directly). In resource mode an empty
    // capture with a typed title still mints a single labelled link stub.
    const toCommit: CommitShape[] =
      items.length > 0
        ? items.map((it) => ({
            type: it.type,
            label: it.label,
            url: it.url,
            provider: it.provider,
            displayMode: it.displayMode,
            linkText: it.linkText,
            mimeType: it.mimeType,
            sizeBytes: it.sizeBytes,
            thumbnailUrl: it.thumbnailUrl,
            // Per-item rich note → the resource's body (notecard capability on
            // a normal card). Only carried in resource mode; notecard mode uses
            // the single top-level body instead.
            body: isNotecardMode ? undefined : it.body,
            __file: it.file,
            __blobUrl: it.url?.startsWith("blob:") ? it.url : undefined,
            __id: it.id,
            __existing: it.existing,
          }))
        : isNotecardMode
          ? []
          : [{ type: "link", label: title.trim() || "New resource" }];

    // Steering (resource mode, single item): a typed Title overrides the lone
    // item's label (title = card name). Notecard mode uses the title as the
    // notecard's label directly, so it never rewrites a captured item here.
    if (!isNotecardMode && toCommit.length === 1 && title.trim()) {
      toCommit[0] = { ...toCommit[0], label: title.trim() };
    }

    // ── Backend persistence (team-shared at the master event) ────────────
    // When the planner Supabase seam is on, push every FILE item to R2 and
    // rewrite its url -> /api/resources/{id} (+ resourceId) so it PERSISTS and
    // reaches the team. Links / title-only stubs are untouched (they persist
    // via the section/lesson JSONB seam). With the flag off we keep the
    // session-only blob behavior — no network call, no change.
    if (backendOn && toCommit.some((r) => r.__file)) {
      setUploadError(null);
      setUploading(true);
      // try/catch/finally so `uploading` is ALWAYS cleared: a synchronous
      // throw (e.g. resourceOwnerEvent) or any unexpected rejection would
      // otherwise strand the dialog with every control disabled. allSettled
      // already keeps per-file failures from rejecting the batch; the catch
      // is the backstop for anything outside that — it keeps the dialog open
      // with a generic error instead of a frozen "Adding…" state.
      try {
        const owner = resourceOwnerEvent(destLesson);
        // Upload every file item, reusing any result already cached from a
        // prior attempt so a RETRY never re-uploads a file that already
        // succeeded (which would duplicate the R2 object + resources row and
        // eat the per-event count quota). allSettled — not all — so one
        // failure doesn't abandon the in-flight successes: they finish,
        // cache, and commit on the next click.
        const fileEntries = toCommit.filter((r) => r.__file);
        const settled = await Promise.allSettled(
          fileEntries.map(async (r) => {
            const cached = r.__id ? uploadedRef.current.get(r.__id) : undefined;
            const result =
              cached ??
              (await uploadHostedFile({
                owner,
                file: r.__file as File,
                displayLabel: r.label,
              }));
            if (r.__id && !cached) uploadedRef.current.set(r.__id, result);
            r.url = result.url;
            r.resourceId = result.resourceId;
            r.provider = result.provider;
            r.mimeType = result.mimeType;
            r.sizeBytes = result.sizeBytes;
            // Image tiles read thumbnailUrl ?? url; the served url IS the
            // image. For non-images keep any client-rendered poster we
            // already have (e.g. the PDF first-page data URL) rather than
            // clobbering it.
            r.thumbnailUrl =
              result.provider === "image" ? result.url : r.thumbnailUrl;
            // The blob is no longer the resource's url — let it be revoked.
            r.__blobUrl = undefined;
          }),
        );
        const failure = settled.find((s) => s.status === "rejected");
        if (failure) {
          const reason = (failure as PromiseRejectedResult).reason;
          setUploadError(
            reason instanceof ResourceUploadError
              ? reason.message
              : "Couldn't upload your file. Please try again.",
          );
          return; // dialog stays open; succeeded uploads are cached for retry
        }
      } catch {
        // Unexpected throw outside the per-file allSettled (e.g. building the
        // owner event). Keep the dialog open with a generic error; any
        // already-cached uploads survive for the retry.
        setUploadError("Couldn't upload your file. Please try again.");
        return;
      } finally {
        setUploading(false);
      }
    }

    // Map an uploaded CommitShape to a clean LessonResource (drops the
    // transient __* fields). Shared by every commit path below. A notecard-
    // EDIT tile that represents an EXISTING gallery resource passes the
    // original through verbatim so its payload never gets rewritten.
    const toResource = (r: CommitShape): LessonResource =>
      r.__existing ?? {
        type: r.type,
        label: r.label,
        url: r.url,
        provider: r.provider,
        displayMode: r.displayMode,
        linkText: r.linkText,
        mimeType: r.mimeType,
        sizeBytes: r.sizeBytes,
        thumbnailUrl: r.thumbnailUrl,
        resourceId: r.resourceId,
        ...(r.body && r.body.trim() ? { body: r.body } : {}),
      };

    if (isNotecardMode) {
      // ── Notecard commit — ONE resource (create or edit), never N ──────────
      // The strip IS the gallery (ordered; index 0 = poster); the single
      // top-level rich body is the notes. A title falls back to a generic
      // notecard name in makeNotecard.
      const labelInput = title.trim();

      if (isEditMode && editResource) {
        // EDIT — patch the existing resource's body + gallery in place. The
        // strip seeded from the existing gallery, so its current order /
        // membership (plus any newly-captured media) IS the next gallery
        // (AC-7: reorder + remove are real edits; an untouched strip
        // round-trips identically to the old append-only merge). Editing
        // notes on a plain resource promotes it to carry `body` without
        // changing its type.
        const existing = editResource.resource;
        const seededExisting = (existing.gallery?.length ?? 0) > 0;
        const mergedGallery = toCommit.map(toResource);
        // The title field edits the card's label too: include it in the
        // patch when it changed and is non-empty (an emptied title keeps
        // the old label rather than blanking the card's name). One patch
        // object feeds BOTH seams below — section and whole-lesson.
        const patch: Partial<LessonResource> = {
          ...(labelInput && labelInput !== existing.label
            ? { label: labelInput }
            : {}),
          ...(body.trim() ? { body } : { body: "" }),
          ...(seededExisting || mergedGallery.length > 0
            ? { gallery: mergedGallery }
            : {}),
        };
        if (editResource.sectionId) {
          // Validate the target still exists before committing — a stale
          // section/resource id makes editSectionResource a silent no-op
          // (the reducer keys on the id), which would close the dialog and
          // drop the teacher's edit. If it's gone, keep the dialog open and
          // surface the inline message instead of losing the work.
          const section = getSections(destLessonId).find(
            (s) => s.id === editResource.sectionId,
          );
          const targetExists = section?.resources.some(
            (r) => r.id === editResource.resourceId,
          );
          if (!targetExists) {
            setRejectionStatus(
              "Couldn't save — this resource has moved or been removed. Close and reopen it from the lesson.",
            );
            return; // dialog stays open; nothing committed
          }
          editSectionResource(
            destLessonId,
            editResource.sectionId,
            editResource.resourceId,
            patch,
          );
        } else {
          // Whole-lesson resource — patch the array slot. The synthesized id
          // can't locate the row inside editLesson, so resolve the index
          // defensively: prefer the persisted resourceId, then object
          // reference, and only then the (possibly stale) captured index.
          // A blind `lessonResourceIndex ?? -1` would silently patch the
          // WRONG row — or, at -1, patch nothing while still closing the
          // dialog — losing the edit. If we can't locate it, keep the dialog
          // open and tell the teacher.
          const resources = destLesson.resources;
          const byResourceId = editResource.resource.resourceId
            ? resources.findIndex(
                (r) => r.resourceId === editResource.resource.resourceId,
              )
            : -1;
          const byReference = resources.indexOf(editResource.resource);
          const byIndex = editResource.lessonResourceIndex ?? -1;
          const idx =
            byResourceId >= 0
              ? byResourceId
              : byReference >= 0
                ? byReference
                : byIndex >= 0 && byIndex < resources.length
                  ? byIndex
                  : -1;
          if (idx < 0) {
            setRejectionStatus(
              "Couldn't save — this resource has moved or been removed. Close and reopen it from the lesson.",
            );
            return; // dialog stays open; nothing committed
          }
          const nextResources = resources.map((res, i) =>
            i === idx ? { ...res, ...patch } : res,
          );
          editLesson(destLessonId, { resources: nextResources });
        }
      } else {
        // CREATE — one new notecard at the routed destination.
        const notecard = makeNotecard({
          label: labelInput,
          gallery: toCommit.map(toResource),
          body,
        });
        if (destSectionId) {
          addSectionResource(destLessonId, destSectionId, notecard);
        } else {
          editLesson(destLessonId, {
            resources: [...destLesson.resources, notecard],
          });
        }
      }
    } else if (destSectionId) {
      // Section route — one addSectionResource per item. The signature accepts
      // a Partial<SectionResource> shape so url + provider + body + the rest
      // flow into the store.
      for (const r of toCommit) {
        addSectionResource(destLessonId, destSectionId, toResource(r));
      }
    } else {
      // Whole-lesson route — merge into lesson.resources via editLesson.
      const newResources: LessonResource[] = toCommit.map(toResource);
      editLesson(destLessonId, {
        resources: [...destLesson.resources, ...newResources],
      });
    }

    // Protect only blobs that REMAIN the committed url (mock-mode / session
    // files). Uploaded files now point at /api/resources/{id}, so their blob
    // is freed by the close-time leak guard. Without this a session-only
    // image/PDF tile would point at a revoked blob and render blank. This
    // covers notecard gallery media too (their blob is the gallery item url).
    for (const r of toCommit) {
      if (r.__blobUrl) committedUrlsRef.current.add(r.__blobUrl);
    }

    // Report the commit summary through the optional onCommitted seam (no
    // current caller passes it — the panel's photo-stack flow that did was
    // dropped). Notecard mode commits exactly one resource.
    if (onCommitted) {
      const headType = isNotecardMode
        ? "notecard"
        : (toCommit[0]?.type ?? "link");
      onCommitted({
        lessonId: destLessonId,
        sectionId: destSectionId,
        count: isNotecardMode ? 1 : toCommit.length,
        type: headType,
      });
    }

    onClose();
  }, [
    canAdd,
    uploading,
    backendOn,
    isNotecardMode,
    isEditMode,
    editResource,
    body,
    items,
    title,
    lessonId,
    sectionId,
    getLesson,
    getSections,
    lesson,
    addSectionResource,
    editSectionResource,
    editLesson,
    onClose,
    onCommitted,
  ]);

  // ── Step navigation ──────────────────────────────────────────────────

  const goToReview = useCallback(() => {
    setStep(2);
    setLinkOpen(false);
    setAllToolsOpen(false);
    // Land focus on the title field so the review step is ready to type.
    requestAnimationFrame(() => titleInputRef.current?.focus());
  }, []);

  const goToCapture = useCallback(() => {
    setStep(1);
    setNotesOpen(false);
    requestAnimationFrame(() => focusFirstCapture());
  }, [focusFirstCapture]);

  // ── Keyboard handler (Escape + focus trap) ───────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        // Every Escape branch is consumed HERE — stopPropagation as well as
        // preventDefault, or the keydown bubbles (through the React tree,
        // portal included) to the ResourcesDrawer's panel handler on ≤960px
        // Daily, which would close the drawer and unmount the composer
        // mid-capture, discarding everything the teacher staged.
        // If a routing popover is open, close THAT first; only then the dialog.
        if (openPicker) {
          e.preventDefault();
          e.stopPropagation();
          setOpenPicker(null);
          return;
        }
        // If the All-Tools sub-view is showing, Back-out of THAT first
        // (one Escape returns to the standard composer, a second closes).
        if (allToolsOpen) {
          e.preventDefault();
          e.stopPropagation();
          setAllToolsOpen(false);
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }

      // Focus trap — same idiom as save-target-dialog.
      if (e.key === "Tab") {
        const panel = panelRef.current;
        if (!panel) return;
        const focusable = Array.from(
          panel.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((el) => !el.hasAttribute("data-trap-exclude"));
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onClose, openPicker, allToolsOpen],
  );

  // ── Scrim click ──────────────────────────────────────────────────────
  const handleScrimClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  // ── Render ───────────────────────────────────────────────────────────
  // The scrim + dialog PORTAL to document.body (same idiom as the panel's
  // TileMenu): inside the drawer the panel's enter animation makes it a
  // transformed ancestor, which turns position:fixed into "fixed to the
  // panel" and mispositions the scrim. The portal keeps the overlay
  // viewport-true. React events (the Escape/Tab handler, paste, drop) still
  // propagate through the REACT tree, so the focus trap works unchanged —
  // and the Escape branches stopPropagation explicitly for the same reason.
  if (!open || typeof document === "undefined") return null;

  const selectedSubject = subjectOptions.find((s) => s.id === subjectId);
  const selectedLesson = lessons.find((l) => l.id === lessonId);

  /** Uncommitted NEW captures (existing gallery seeds don't count) — the
   *  quiet "Session only" badge shows while these exist in mock mode.
   *  Calm copy per P7: never alarming, one explanation on demand. */
  const newCaptureCount = items.filter((it) => !it.existing).length;
  const showSessionBadge = !backendOn && newCaptureCount > 0;

  const noteItem =
    items.find((c) => c.id === noteItemId) ??
    items.find((c) => !c.existing) ??
    items[0];

  // The capture-methods block (grid + All-tools + URL row + drop hint) is
  // shared between resource step 1 and the notecard "+" reveal — two
  // entries, one capture engine (P2).
  const captureEngine = (
    <>
      <div className={styles.capRow} role="group" aria-label="Capture methods">
        <CaptureButton
          autoFocusTarget
          label="Upload"
          sub="Any file"
          tone={styles.icUpload}
          icon={<UploadIcon />}
          onClick={onUploadClick}
          tooltip="Pick files from this device — PDFs, docs, and images land in the captured strip below"
        />
        <CaptureButton
          label="Link"
          sub="Paste a URL"
          tone={styles.icLink}
          icon={<LinkIcon />}
          onClick={onLinkClick}
          active={linkOpen}
          tooltip="Capture a web link — paste any URL and it joins the captured strip"
        />
        <CaptureButton
          label="Google Drive"
          sub="Soon"
          tone={styles.icDrive}
          icon={<DriveIcon />}
          soon
          tooltip="Google Drive import is coming after beta — it needs Google sign-in. For now, download the file and use Upload."
        />
        <CaptureButton
          label="Camera"
          sub="Soon"
          tone={styles.icCamera}
          icon={<CameraIcon />}
          soon
          tooltip="A built-in camera capture is coming soon — today, open All tools below and use its Camera tile."
        />
      </div>

      {/* The long-tail tool wall (Card wall, YouTube, Camera, Photo album…). */}
      <Button
        variant="ghost"
        size="sm"
        className={styles.allTools}
        onClick={() => setAllToolsOpen(true)}
        tooltip="Browse every capture tool the composer supports — photo album, camera, YouTube, card wall, and more"
        leadingIcon={<MoreDotsIcon />}
      >
        All tools
      </Button>

      {/* Inline URL row (revealed by the Link button). */}
      {linkOpen && (
        <div className={styles.linkRow} role="group" aria-label="Add link">
          <input
            ref={linkInputRef}
            type="url"
            className={styles.input}
            placeholder="https://…"
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            onKeyDown={onLinkKeyDown}
            aria-label="Resource URL"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={onLinkConfirm}
            disabled={!linkValue.trim()}
            tooltip="Capture this URL into the strip — you'll still review and route everything before it's added"
          >
            Add link
          </Button>
        </div>
      )}

      <div className={styles.dropHint}>
        …or drop files anywhere in this dialog
      </div>
    </>
  );

  return createPortal(
    <div
      className={styles.scrim}
      onClick={handleScrimClick}
      aria-hidden={false}
    >
      {/* cp-subj feeds the subject swatch in the routing selects; the
          dialog chrome itself is mode-colored (brand / honey), never
          subject-colored, per the §3 spec. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        title={
          isEditMode
            ? "Edit note dialog — write formatted notes and curate this card's media gallery"
            : isNotecardMode
              ? "New notecard dialog — gather media into a card's gallery, then write its notes"
              : "Add resources dialog — capture links and files, then review and pick where they land"
        }
        className={`${styles.dialog} cp-subj ${subjectId}`}
        onKeyDown={handleKeyDown}
        onPaste={onDialogPaste}
        onDragOver={onDialogDragOver}
        onDrop={onDialogDrop}
      >
        {/* Phone bottom-sheet grab handle (decorative; hidden ≥480px). */}
        <div className={styles.sheetHandle} aria-hidden="true" />

        {/* ── Head: mode badge · stepper · close ─────────────────────── */}
        <header className={styles.dlgHead}>
          <span
            id={headingId}
            className={`${styles.modeBadge} ${
              isNotecardMode ? styles.modeBadgeNote : styles.modeBadgeRes
            }`}
          >
            {isNotecardMode ? <NoteCardIcon /> : <UploadIcon />}
            {isEditMode
              ? "Edit note"
              : isNotecardMode
                ? "New notecard"
                : "Add resources"}
          </span>

          {!isNotecardMode && (
            <span className={styles.stepper} aria-label={`Step ${step} of 2`}>
              <span
                className={`${styles.stepDot} ${
                  step === 1 ? styles.stepDotOn : styles.stepDotDone
                }`}
                aria-hidden="true"
              >
                {step === 1 ? "1" : <CheckIcon />}
              </span>
              <span className={styles.stepLabel}>Capture</span>
              <span className={styles.stepArrow} aria-hidden="true">
                →
              </span>
              <span
                className={`${styles.stepDot} ${
                  step === 2 ? styles.stepDotOn : ""
                }`}
                aria-hidden="true"
              >
                2
              </span>
              <span className={styles.stepLabel}>Review &amp; route</span>
              <span className={styles.stepFraction} aria-hidden="true">
                /2
              </span>
            </span>
          )}

          <Button
            variant="icon"
            size="sm"
            iconAriaLabel="Close composer"
            className={styles.closeBtn}
            onClick={onClose}
            tooltip="Close — uncommitted captures are discarded"
          >
            <CloseIcon />
          </Button>
        </header>

        {/* ── Body ───────────────────────────────────────────────────── */}
        <div className={styles.dlgBody}>
          {allToolsOpen ? (
            <AllToolsMenu
              onBack={() => setAllToolsOpen(false)}
              onAddItem={(it) => addItem(it)}
              onAddItems={(arr) => addItems(arr)}
              onRequestLinkRow={() => {
                // Close All-Tools, open the inline URL row in the capture
                // block, and focus the URL field on the next frame.
                setAllToolsOpen(false);
                setLinkOpen(true);
                if (isNotecardMode) setCaptureOpen(true);
                requestAnimationFrame(() => linkInputRef.current?.focus());
              }}
            />
          ) : isNotecardMode ? (
            /* ── Notecard mode — single screen ─────────────────────────── */
            <>
              <div className={styles.field}>
                <label htmlFor={`${headingId}-title`}>Card title</label>
                <input
                  ref={titleInputRef}
                  id={`${headingId}-title`}
                  type="text"
                  className={styles.input}
                  placeholder="Name this card"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className={styles.field}>
                <label id={`${headingId}-media`}>
                  Media · drag to reorder — first item is the poster
                </label>
                <div
                  className={styles.galEdit}
                  role="list"
                  aria-labelledby={`${headingId}-media`}
                >
                  {items.map((item, i) => (
                    <GalleryTile
                      key={item.id}
                      item={item}
                      index={i}
                      count={items.length}
                      poster={i === 0}
                      onRemove={removeItem}
                      onMove={moveItem}
                      dragIndexRef={dragIndexRef}
                    />
                  ))}
                  <Tooltip
                    content="Add media to this card — opens the capture methods"
                    side="top"
                  >
                    <button
                      type="button"
                      className={styles.galAdd}
                      onClick={() => setCaptureOpen((v) => !v)}
                      aria-expanded={captureOpen}
                      aria-label="Add media — opens the capture methods"
                      title="Add media — opens the capture methods"
                    >
                      <PlusIcon />
                    </button>
                  </Tooltip>
                </div>
              </div>

              {/* The "+" tile reveals the shared capture engine in place. */}
              {captureOpen && (
                <div className={styles.captureReveal}>{captureEngine}</div>
              )}

              {(pastedStatus || rejectionStatus) && (
                <CaptureStatus
                  pasted={pastedStatus}
                  rejection={rejectionStatus}
                />
              )}

              <div className={styles.field}>
                <label id={`${headingId}-notes`}>Notes</label>
                {/* The EXISTING rich-text editor, consumed unchanged — it
                    owns the sanitizer boundary (emits sanitized HTML; we
                    never double-sanitize). */}
                <div className={styles.rteShell}>
                  <RichTextEditor
                    value={body}
                    onChange={setBody}
                    placeholder="Write the notes for this card — formatting, links, and images all work."
                    ariaLabel="Notecard notes"
                    onRequestImageUrl={requestBodyImageUrl}
                  />
                </div>
              </div>

              <RoutingField
                labels={labels}
                locked={routingLocked}
                openPicker={openPicker}
                setOpenPicker={setOpenPicker}
                subjectOptions={subjectOptions.map((s) => ({
                  id: s.id,
                  label: s.name,
                }))}
                unitOptions={unitOptions.map((u) => ({
                  id: u.id,
                  label: u.name,
                }))}
                lessonOptions={lessonOptions.map((l) => ({
                  id: l.id,
                  label: l.title,
                }))}
                sectionOptions={[
                  { id: "", label: "Whole lesson" },
                  ...sectionOptions.map((s) => ({
                    id: s.id,
                    label: plainText(s.heading) || "Section",
                  })),
                ]}
                subjectId={subjectId}
                unitId={unitId}
                lessonId={lessonId}
                sectionId={sectionId}
                subjectValue={selectedSubject?.name ?? ""}
                lessonValue={selectedLesson?.title ?? ""}
                onPickSubject={(id) => setSubjectId(id as SubjectId)}
                onPickUnit={setUnitId}
                onPickLesson={(id) => {
                  setLessonId(id);
                  setSectionId("");
                }}
                onPickSection={setSectionId}
              />
            </>
          ) : step === 1 ? (
            /* ── Resource mode · Step 1 — capture ──────────────────────── */
            <>
              {captureEngine}

              {items.length > 0 && (
                <div
                  className={styles.capturedStrip}
                  role="list"
                  aria-label="Captured items"
                >
                  {items.map((item, i) => (
                    <CapturedTile
                      key={item.id}
                      item={item}
                      index={i}
                      count={items.length}
                      onRemove={removeItem}
                      onMove={moveItem}
                      dragIndexRef={dragIndexRef}
                    />
                  ))}
                </div>
              )}

              {(pastedStatus || rejectionStatus) && (
                <CaptureStatus
                  pasted={pastedStatus}
                  rejection={rejectionStatus}
                />
              )}
            </>
          ) : (
            /* ── Resource mode · Step 2 — review & route ───────────────── */
            <>
              {uploadError && (
                <div className={styles.errStrip} role="alert">
                  <WarnIcon />
                  <span>{uploadError}</span>
                  <Tooltip
                    content="Try the failed uploads again — files that already uploaded are cached and never re-upload"
                    side="top"
                  >
                    <button
                      type="button"
                      className={styles.retry}
                      onClick={() => void handleAdd()}
                      disabled={uploading}
                      title="Try the failed uploads again — files that already uploaded never re-upload"
                    >
                      Retry
                    </button>
                  </Tooltip>
                </div>
              )}

              {items.length > 0 && (
                <div
                  className={styles.capturedStrip}
                  role="list"
                  aria-label="Captured items"
                >
                  {items.map((item, i) => (
                    <CapturedTile
                      key={item.id}
                      item={item}
                      index={i}
                      count={items.length}
                      onRemove={removeItem}
                      onMove={moveItem}
                      dragIndexRef={dragIndexRef}
                    />
                  ))}
                </div>
              )}

              <div className={styles.field}>
                <label htmlFor={`${headingId}-title`}>
                  Title{" "}
                  <span className={styles.labelAside}>
                    (single item only — steers its label)
                  </span>
                </label>
                <input
                  ref={titleInputRef}
                  id={`${headingId}-title`}
                  type="text"
                  className={styles.input}
                  placeholder={
                    items.length > 1
                      ? "Keep each item's own name"
                      : "Name this resource"
                  }
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              {/* Per-item rich notes — collapsed by default. Each captured
                  item can carry its own formatted note (→ resource.body). */}
              {items.length > 0 && (
                <>
                  <button
                    type="button"
                    className={styles.noteToggle}
                    onClick={() => setNotesOpen((v) => !v)}
                    aria-expanded={notesOpen}
                  >
                    + Add a note to an item (optional)
                  </button>
                  {notesOpen && noteItem && (
                    <div
                      className={styles.noteEditor}
                      role="group"
                      aria-label="Per-item notes"
                    >
                      {items.length > 1 && (
                        <div
                          className={styles.notePickRow}
                          role="radiogroup"
                          aria-label="Which item the note is for"
                        >
                          {items.map((it) => {
                            const hasNote = plainText(it.body ?? "").length > 0;
                            const on = it.id === noteItem.id;
                            return (
                              <button
                                key={it.id}
                                type="button"
                                role="radio"
                                aria-checked={on}
                                className={`${styles.notePick} ${
                                  on ? styles.notePickOn : ""
                                }`}
                                onClick={() => setNoteItemId(it.id)}
                                title={`Write a note for ${it.label}`}
                              >
                                {it.label}
                                {hasNote && (
                                  <span
                                    className={styles.noteDot}
                                    aria-label="Has note"
                                  />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <span className={styles.noteFor}>
                        Note for <strong>{noteItem.label}</strong>
                      </span>
                      <div className={styles.rteShell}>
                        <RichTextEditor
                          key={noteItem.id}
                          value={noteItem.body ?? ""}
                          onChange={(html) => setItemBody(noteItem.id, html)}
                          placeholder="Write a note for this resource…"
                          ariaLabel={`Note text for ${noteItem.label}`}
                          onRequestImageUrl={requestBodyImageUrl}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              <RoutingField
                labels={labels}
                locked={routingLocked}
                openPicker={openPicker}
                setOpenPicker={setOpenPicker}
                subjectOptions={subjectOptions.map((s) => ({
                  id: s.id,
                  label: s.name,
                }))}
                unitOptions={unitOptions.map((u) => ({
                  id: u.id,
                  label: u.name,
                }))}
                lessonOptions={lessonOptions.map((l) => ({
                  id: l.id,
                  label: l.title,
                }))}
                sectionOptions={[
                  { id: "", label: "Whole lesson" },
                  ...sectionOptions.map((s) => ({
                    id: s.id,
                    label: plainText(s.heading) || "Section",
                  })),
                ]}
                subjectId={subjectId}
                unitId={unitId}
                lessonId={lessonId}
                sectionId={sectionId}
                subjectValue={selectedSubject?.name ?? ""}
                lessonValue={selectedLesson?.title ?? ""}
                onPickSubject={(id) => setSubjectId(id as SubjectId)}
                onPickUnit={setUnitId}
                onPickLesson={(id) => {
                  setLessonId(id);
                  setSectionId("");
                }}
                onPickSection={setSectionId}
              />
            </>
          )}
        </div>

        {/* ── Foot: session badge · cancel/back · primary ─────────────── */}
        <footer className={styles.dlgFoot}>
          {showSessionBadge && (
            <Tooltip
              content="These captures live in this tab for now — once you add them they stay on this device for the session, and they'll sync to your team when the backend arrives."
              side="top"
            >
              <button
                type="button"
                className={styles.sessionBadge}
                aria-label="Session only — tap for what that means"
                title="These captures live in this tab for now — they'll sync to your team when the backend arrives"
              >
                <span className={styles.sessionDot} aria-hidden="true" />
                Session only
              </button>
            </Tooltip>
          )}
          <span className={styles.footSpacer} />
          {isNotecardMode ? (
            <>
              <Button
                variant="ghost"
                size="md"
                className={styles.footBtn}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                variant="honey"
                size="md"
                className={styles.footBtn}
                onClick={() => void handleAdd()}
                disabled={!canAdd || uploading}
                loading={uploading}
                tooltip={
                  isEditMode
                    ? "Save this card's notes and media back to the resource"
                    : "Create the notecard at the chosen destination — its media flip through as a gallery"
                }
              >
                {isEditMode ? "Save note" : "Create notecard"}
              </Button>
            </>
          ) : step === 1 ? (
            <>
              <Button
                variant="ghost"
                size="md"
                className={styles.footBtn}
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                className={styles.footBtn}
                onClick={goToReview}
                trailingIcon={<ChevronRightIcon />}
                tooltip="Review what you've captured and pick which lesson and section it lands in"
              >
                {items.length > 0
                  ? `Next · ${items.length} item${items.length === 1 ? "" : "s"}`
                  : "Next"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                size="md"
                className={styles.footBtn}
                onClick={goToCapture}
                leadingIcon={<ChevronLeftIcon />}
                tooltip="Back to the capture step — everything you've captured stays put"
              >
                Back
              </Button>
              <Button
                variant="primary"
                size="md"
                className={styles.footBtn}
                onClick={() => void handleAdd()}
                disabled={!canAdd || uploading}
                loading={uploading}
                tooltip={
                  backendOn
                    ? "Attach every captured resource to the chosen destination — files upload to your team's storage"
                    : "Attach every captured resource to the chosen destination for this session"
                }
              >
                {uploading
                  ? "Adding…"
                  : items.length > 1
                    ? `Add ${items.length} resources`
                    : "Add resource"}
              </Button>
            </>
          )}
        </footer>

        {/* Hidden file input — driven by the Upload capture button. */}
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          className={styles.hiddenInput}
          aria-hidden="true"
          tabIndex={-1}
          data-trap-exclude
          onChange={onUploadChange}
        />
      </div>
    </div>,
    document.body,
  );
}

// ── CaptureButton ─────────────────────────────────────────────────────────
// One of the 4-up capture-grid buttons (.rn-capBtn): icon tile + label +
// sub-label. `soon` renders the visibly-disabled 55%-opacity state with a
// why-tooltip (CLAUDE.md §4 — disabled controls explain why). The bespoke
// anatomy (icon tile + dual label) is why this doesn't reuse FutureControl.

interface CaptureButtonProps {
  label: string;
  sub: string;
  icon: ReactNode;
  /** Tone class for the icon tile background (token-backed). */
  tone: string;
  tooltip: string;
  onClick?: () => void;
  active?: boolean;
  soon?: boolean;
  /** Marks the button the open-effect lands focus on (queried via
   *  [data-autofocus] — the Tooltip wrapper owns the trigger ref, so a
   *  forwarded ref would be clobbered by its cloneElement). */
  autoFocusTarget?: boolean;
}

function CaptureButton({
  label,
  sub,
  icon,
  tone,
  tooltip,
  onClick,
  active = false,
  soon = false,
  autoFocusTarget = false,
}: CaptureButtonProps): ReactNode {
  return (
    <Tooltip content={tooltip} side="top">
      <button
        type="button"
        className={`${styles.capBtn} ${soon ? styles.capBtnSoon : ""} ${
          active ? styles.capBtnActive : ""
        }`}
        onClick={soon ? undefined : onClick}
        disabled={soon}
        aria-disabled={soon || undefined}
        aria-pressed={onClick && !soon ? active : undefined}
        title={tooltip}
        data-autofocus={autoFocusTarget || undefined}
      >
        <span className={`${styles.capIc} ${tone}`} aria-hidden="true">
          {icon}
        </span>
        <span className={styles.capT}>{label}</span>
        <span className={styles.capS}>{sub}</span>
      </button>
    </Tooltip>
  );
}

// ── Captured strip tile (.rn-capItem — 86px) ─────────────────────────────
// Thumb area (real thumbnail when we have one, type-tinted icon otherwise),
// truncated label, removable × (hit-inflated to ≥44), pointer drag-reorder
// + keyboard arrow reorder.

interface TileProps {
  item: CapturedItem;
  index: number;
  count: number;
  onRemove: (id: string) => void;
  onMove: (from: number, to: number) => void;
  dragIndexRef: React.MutableRefObject<number | null>;
}

/** Shared drag/keyboard reorder handlers for strip + gallery tiles. */
function useReorderHandlers(
  index: number,
  count: number,
  onMove: (from: number, to: number) => void,
  dragIndexRef: React.MutableRefObject<number | null>,
) {
  const onDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      dragIndexRef.current = index;
      e.dataTransfer.effectAllowed = "move";
      // Some engines need data set for a drag to start.
      e.dataTransfer.setData("text/plain", String(index));
    },
    [index, dragIndexRef],
  );
  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    // Only accept internal reorder drags — file drops bubble to the dialog.
    if (e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);
  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      e.stopPropagation();
      const from = dragIndexRef.current;
      dragIndexRef.current = null;
      if (from != null) onMove(from, index);
    },
    [index, onMove, dragIndexRef],
  );
  const onDragEnd = useCallback(() => {
    // A cancelled drag (Escape, drop outside the strip) never reaches
    // onDrop, which would leave the stashed index live — and a later,
    // unrelated drop could replay it as a spurious move. dragend always
    // fires on the SOURCE element, completed or cancelled, so clear here.
    dragIndexRef.current = null;
  }, [dragIndexRef]);
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowLeft" && index > 0) {
        e.preventDefault();
        onMove(index, index - 1);
      } else if (e.key === "ArrowRight" && index < count - 1) {
        e.preventDefault();
        onMove(index, index + 1);
      }
    },
    [index, count, onMove],
  );
  return { onDragStart, onDragOver, onDrop, onDragEnd, onKeyDown };
}

/** Type-tinted thumb class for a captured item (th-* recipe). */
function thumbClass(item: CapturedItem): string {
  switch (item.type) {
    case "image":
      return styles.thImage;
    case "pdf":
    case "doc":
      return styles.thPdf;
    case "slides":
      return styles.thSlides;
    case "youtube":
      return styles.thYoutube;
    case "notecard":
      return styles.thNote;
    default:
      return styles.thLink;
  }
}

/** Safe-gated thumb src for a strip / gallery tile, plus an onError that
 *  demotes a broken src to the next candidate (and finally to the type
 *  glyph). Failures are tracked per-src so a thumbnail that lands later
 *  (e.g. the async PDF first-page poster) gets its own try instead of the
 *  tile staying demoted for the session. */
function useTileImg(item: CapturedItem): {
  src: string | undefined;
  onError: () => void;
} {
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    setFailed(new Set());
  }, [item.thumbnailUrl, item.url]);
  const candidates: string[] = [];
  if (isSafeImgSrc(item.thumbnailUrl)) candidates.push(item.thumbnailUrl);
  if (item.provider === "image" && isSafeImgSrc(item.url)) {
    candidates.push(item.url);
  }
  const src = candidates.find((c) => !failed.has(c));
  const onError = useCallback(() => {
    if (src) setFailed((prev) => new Set(prev).add(src));
  }, [src]);
  return { src, onError };
}

function CapturedTile({
  item,
  index,
  count,
  onRemove,
  onMove,
  dragIndexRef,
}: TileProps): ReactNode {
  const handlers = useReorderHandlers(index, count, onMove, dragIndexRef);
  const hasNote = plainText(item.body ?? "").length > 0;
  const img = useTileImg(item);
  return (
    <div
      role="listitem"
      tabIndex={0}
      draggable
      className={styles.capItem}
      aria-label={`${item.label} — captured item ${index + 1} of ${count}. Drag or use arrow keys to reorder.`}
      title={`${item.label} — drag (or use arrow keys) to reorder`}
      {...handlers}
    >
      <div className={`${styles.ciTh} ${thumbClass(item)}`} aria-hidden="true">
        {img.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img.src}
            alt=""
            className={styles.ciImg}
            onError={img.onError}
          />
        ) : (
          <TypeIcon type={item.type} />
        )}
      </div>
      <Tooltip
        content={`Remove ${item.label} from this add — it won't be attached`}
        side="top"
        required
      >
        <button
          type="button"
          className={styles.capX}
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.label}`}
          title={`Remove ${item.label} from this add`}
        >
          <SmallXIcon />
        </button>
      </Tooltip>
      <div className={styles.ciL}>
        {item.label}
        {hasNote && <span className={styles.noteDot} aria-label="Has note" />}
      </div>
    </div>
  );
}

// ── Gallery tile (.rn-galItem — 72×56, notecard mode) ────────────────────
// Same recipe family as CapturedTile plus the grip glyph and the poster
// treatment on index 0 (honey outline + "POSTER" tag — reorder to change).

function GalleryTile({
  item,
  index,
  count,
  poster,
  onRemove,
  onMove,
  dragIndexRef,
}: TileProps & { poster: boolean }): ReactNode {
  const handlers = useReorderHandlers(index, count, onMove, dragIndexRef);
  const img = useTileImg(item);
  return (
    <div
      role="listitem"
      tabIndex={0}
      draggable
      className={`${styles.galItem} ${poster ? styles.galItemPoster : ""} ${thumbClass(item)}`}
      aria-label={`${item.label} — gallery item ${index + 1} of ${count}${
        poster ? " (poster)" : ""
      }. Drag or use arrow keys to reorder; the first item is the poster.`}
      title={`${item.label} — drag to reorder; the first item is the card's poster`}
      {...handlers}
    >
      <span className={styles.giGrip} aria-hidden="true">
        <GripIcon />
      </span>
      {img.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={img.src}
          alt=""
          className={styles.ciImg}
          onError={img.onError}
        />
      ) : (
        <TypeIcon type={item.type} />
      )}
      {poster && (
        <span className={styles.posterStar} aria-hidden="true">
          POSTER
        </span>
      )}
      {/* required: in notecard EDIT this × deletes stored media from the
          card — destructive per CLAUDE.md §4, so the tooltip is always on. */}
      <Tooltip
        content={`Remove ${item.label} from this card`}
        side="top"
        required
      >
        <button
          type="button"
          className={styles.capX}
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.label} from this card`}
          title={`Remove ${item.label} from this card`}
        >
          <SmallXIcon />
        </button>
      </Tooltip>
    </div>
  );
}

// ── Capture status lines (paste confirmation + rejections) ───────────────

function CaptureStatus({
  pasted,
  rejection,
}: {
  pasted: string | null;
  rejection: string | null;
}): ReactNode {
  return (
    <div className={styles.statusWrap}>
      {pasted && (
        <p className={styles.pastedStatus} role="status" aria-live="polite">
          {pasted}
        </p>
      )}
      {rejection && (
        <p
          className={styles.rejectionStatus}
          role="alert"
          aria-live="assertive"
        >
          {rejection}
        </p>
      )}
    </div>
  );
}

// ── RoutingField ──────────────────────────────────────────────────────────
// The "Destination" field — four .rn-select pickers (Subject · Unit ·
// Lesson · Section). Locked selects render at 60% opacity with a
// why-tooltip when the opening context fixes the destination.

interface RouteOption {
  id: string;
  label: string;
}

interface RoutingFieldProps {
  labels: { subject: string; unit: string; lesson: string; section: string };
  locked: boolean;
  openPicker: "subject" | "unit" | "lesson" | "section" | null;
  setOpenPicker: (p: "subject" | "unit" | "lesson" | "section" | null) => void;
  subjectOptions: RouteOption[];
  unitOptions: RouteOption[];
  lessonOptions: RouteOption[];
  sectionOptions: RouteOption[];
  subjectId: string;
  unitId: string;
  lessonId: string;
  sectionId: string;
  subjectValue: string;
  lessonValue: string;
  onPickSubject: (id: string) => void;
  onPickUnit: (id: string) => void;
  onPickLesson: (id: string) => void;
  onPickSection: (id: string) => void;
}

function RoutingField(props: RoutingFieldProps): ReactNode {
  const {
    labels,
    locked,
    openPicker,
    setOpenPicker,
    subjectOptions,
    unitOptions,
    lessonOptions,
    sectionOptions,
    subjectId,
    unitId,
    lessonId,
    sectionId,
    subjectValue,
    lessonValue,
    onPickSubject,
    onPickUnit,
    onPickLesson,
    onPickSection,
  } = props;
  return (
    <div className={styles.field}>
      <label>Destination</label>
      <div
        className={styles.routeRow}
        role="group"
        aria-label={`Where to save · ${labels.subject} · ${labels.unit} · ${labels.lesson} · ${labels.section}`}
      >
        <RouteSelect
          k={labels.subject}
          value={subjectValue}
          locked={locked}
          open={openPicker === "subject"}
          onToggle={() =>
            setOpenPicker(openPicker === "subject" ? null : "subject")
          }
          onClose={() => setOpenPicker(null)}
          options={subjectOptions}
          selectedId={subjectId}
          onPick={(id) => {
            onPickSubject(id);
            setOpenPicker(null);
          }}
          swatchClass={subjectId}
        />
        <RouteSelect
          k={labels.unit}
          value={unitOptions.find((u) => u.id === unitId)?.label ?? ""}
          locked={locked || unitOptions.length === 0}
          open={openPicker === "unit"}
          onToggle={() => setOpenPicker(openPicker === "unit" ? null : "unit")}
          onClose={() => setOpenPicker(null)}
          options={unitOptions}
          selectedId={unitId}
          onPick={(id) => {
            onPickUnit(id);
            setOpenPicker(null);
          }}
        />
        <RouteSelect
          k={labels.lesson}
          value={lessonValue}
          locked={locked || lessonOptions.length === 0}
          open={openPicker === "lesson"}
          onToggle={() =>
            setOpenPicker(openPicker === "lesson" ? null : "lesson")
          }
          onClose={() => setOpenPicker(null)}
          options={lessonOptions}
          selectedId={lessonId}
          onPick={(id) => {
            onPickLesson(id);
            setOpenPicker(null);
          }}
        />
        <RouteSelect
          k={labels.section}
          value={
            sectionId
              ? (sectionOptions.find((s) => s.id === sectionId)?.label ??
                "Section")
              : "Whole lesson"
          }
          locked={locked}
          open={openPicker === "section"}
          onToggle={() =>
            setOpenPicker(openPicker === "section" ? null : "section")
          }
          onClose={() => setOpenPicker(null)}
          options={sectionOptions}
          selectedId={sectionId}
          onPick={(id) => {
            onPickSection(id);
            setOpenPicker(null);
          }}
        />
      </div>
    </div>
  );
}

// ── RouteSelect ───────────────────────────────────────────────────────────
// One .rn-select pill: uppercase key + value + chevron, opening a listbox
// popover. `.locked` = 60% opacity + disabled (routing fixed by context).

interface RouteSelectProps {
  /** Uppercase key caption (e.g. "Subject"). */
  k: string;
  /** Currently-selected option's display text. */
  value: string;
  locked: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  options: RouteOption[];
  selectedId: string;
  onPick: (id: string) => void;
  /** Optional class for a subject color dot (cp-subj id). */
  swatchClass?: string;
}

function RouteSelect({
  k,
  value,
  locked,
  open,
  onToggle,
  onClose,
  options,
  selectedId,
  onPick,
  swatchClass,
}: RouteSelectProps): ReactNode {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close the popover when a click lands outside it. Useful when the
  // teacher clicks another select — the focus trap still cycles correctly.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent): void => {
      const target = e.target as Node | null;
      if (
        popoverRef.current &&
        target &&
        !popoverRef.current.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  return (
    <div className={styles.selectWrap}>
      <Tooltip
        content={
          locked
            ? "Routing is locked — this opened from a fixed destination, so where it lands can't change here"
            : `Choose the ${k.toLowerCase()} this lands in`
        }
        side="top"
      >
        <button
          type="button"
          className={`${styles.select} ${locked ? styles.selectLocked : ""}`}
          onClick={onToggle}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={locked}
          title={
            locked
              ? "Routing is locked while this destination is fixed"
              : `Choose the ${k.toLowerCase()} this lands in`
          }
        >
          {swatchClass && (
            <span
              className={`${styles.selectSwatch} cp-subj ${swatchClass}`}
              aria-hidden="true"
            />
          )}
          <span className={styles.selK}>{k}</span>
          <span className={styles.selV} title={value}>
            {value || "—"}
          </span>
          <ChevronDownIcon />
        </button>
      </Tooltip>
      {open && (
        <div ref={popoverRef} className={styles.selectPopover} role="listbox">
          {options.length === 0 ? (
            <p className={styles.selectEmpty}>No options.</p>
          ) : (
            options.map((opt) => (
              <button
                key={opt.id || "__whole__"}
                type="button"
                role="option"
                aria-selected={opt.id === selectedId}
                className={`${styles.selectOption} ${
                  opt.id === selectedId ? styles.selectOptionOn : ""
                }`}
                onClick={() => onPick(opt.id)}
                title={`Pick ${opt.label}`}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────
// Stroked, Lucide-family (~2px stroke, round caps, 24×24 viewbox) — same
// vocabulary as the rest of the repo. Sized by the CSS module.
//
// CloseIcon, UploadIcon, LinkIcon, SmallXIcon, MoreDotsIcon, and
// ChevronDownIcon now come from `@/components/icons` (imported above) — only
// the composer-unique glyphs below stay local.

function DriveIcon(): ReactNode {
  // A simple triangle-fold "drive" glyph in the Lucide vocabulary.
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 3h6l6 10-3 6H6l-3-6z" />
      <path d="M9 3 6 13h12" />
    </svg>
  );
}

function CameraIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function NoteCardIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="7" y1="9" x2="17" y2="9" />
      <line x1="7" y1="13" x2="13" y2="13" />
    </svg>
  );
}

function CheckIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function WarnIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={styles.warnIcon}
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function PlusIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function GripIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

function ChevronLeftIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={styles.footChevron}
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon(): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={styles.footChevron}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

// Type glyph used inside a strip / gallery thumb. Falls through to a
// generic "link" glyph when the type isn't one we model specially.
function TypeIcon({ type }: { type: LessonResource["type"] }): ReactNode {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (type) {
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    case "pdf":
    case "doc":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="14" x2="15" y2="14" />
        </svg>
      );
    case "slides":
      return (
        <svg {...common}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common}>
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" />
        </svg>
      );
    case "notecard":
      return <NoteCardIcon />;
    case "website":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case "link":
    default:
      return <LinkIcon />;
  }
}
