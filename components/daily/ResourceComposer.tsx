"use client";

// ResourceComposer.tsx — the card-wall "Add resource" dialog that the
// Daily view's Resources panel opens when the teacher hits the "+" in the
// panel header (or, in "add more photos" mode, taps a photo-stack tile).
//
// ── Anatomy (top to bottom) ─────────────────────────────────────────────
//   • Scrim (full-viewport dim overlay; click-to-dismiss).
//   • Centered card (~480px wide, white, hairline border, soft shadow):
//       Top bar:    [×]  spacer  [Add]
//       Title input  (single line, large quiet typography)
//       Tool grid    (FOUR tiles: Upload · Photo · Link · Search)
//                    — Link expands an inline URL row when clicked.
//                    — Search is a Phase-1A stub.
//       Caption      "Add an image, video, link, or file."
//       Body         (rich-text-free <textarea>; "Write something to…")
//       Captured     (a chip strip — one chip per file / link / pasted item,
//                     each with an [×] remove button)
//       Routing row  (FOUR cascading PICKER PILLS:
//                     Subject → Unit → Lesson → Section)
//                    — labels come from useLabels() (cross-agent contract);
//                       defaults fall back to "Subject"/"Unit"/"Lesson"/"Section"
//                       so the composer still renders if the labels module
//                       hasn't landed yet.
//
// ── Routing semantics ───────────────────────────────────────────────────
// Changing an UPSTREAM picker resets every downstream picker to its first
// valid match. Lesson list = all lessons in the selected unit, scoped to
// the launching lesson's `week` when present (so the teacher gets THIS
// week's lessons). Section is "Whole lesson" by default; if the composer
// was launched from a section "+", that section is preselected.
//
// ── Capture sources ──────────────────────────────────────────────────────
// The captured-items strip is the single source of truth for "what will
// be added on Add". Items flow in from:
//   • File pickers — Upload (any) + Photo (image/*). Multiple selection.
//   • Inline URL field — the Link tile reveals a small URL input row;
//     pressing Enter appends a link item.
//   • Clipboard paste — handled by the dialog-level onPaste:
//       - Clipboard image (ClipboardItem with image/*) → image item.
//       - Plain text matching ^https?://\S+$ → link item.
//       - Other plain text → filled into the body textarea.
//     A small "Pasted <kind>" status line surfaces what was captured so
//     the teacher knows the paste actually landed.
//   • initialItems prop — drag-drop on the panel hands the composer a
//     pre-populated strip; the teacher confirms + routes + titles before
//     anything is committed.
//
// ── Storage on Add ──────────────────────────────────────────────────────
// Each captured item dispatches into the planner store:
//   • If a Section is chosen → addSectionResource(lessonId, sectionId, type, label).
//   • If "Whole lesson"     → editLesson(lessonId, { resources: [...prev, new] }).
//
// Photo-stack handling: the store does not currently support a native
// "stack" shape, so the composer falls back to N separate image resources
// at the resolved destination. The DROP path (in ResourcesPanel) is the
// only place a synthetic stack shape lives in panel state.
//
// SYNTHETIC ONLY: no real uploads happen — file objects are translated
// into LessonResource shapes whose `label` is the filename. This is in
// line with the Phase-1A frontend-only prototype rule.
//
// ── Accessibility ───────────────────────────────────────────────────────
//   • role="dialog" + aria-modal="true" + aria-labelledby on the title.
//   • Focus moves to the title input on open.
//   • Focus trap: Tab / Shift-Tab cycle inside the panel.
//   • Escape closes.
//   • All touch targets ≥44px (chip removes are hit-padded).
//   • prefers-reduced-motion drops the enter scale/fade.

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { Lesson, LessonResource, SubjectId } from "@/lib/types";
import { usePlanner } from "@/lib/planner-store";
import { useLabels } from "@/lib/labels";
import { Button, Tooltip } from "@/components/ui";
import { parseResourceUrl } from "@/lib/resource-embed";
import { isPlannerSupabaseConfigured } from "@/lib/planner/source";
import {
  resourceOwnerEvent,
  uploadHostedFile,
  ResourceUploadError,
  type HostedUploadResult,
} from "@/lib/resource-upload";
import { renderPdfThumbnail } from "@/lib/pdf-thumbnail";
import { makeNotecard } from "@/lib/notecards";
import { ResourceEmbed } from "@/components/resources";
import { RichTextEditor } from "@/components/rich-text";
import { AllToolsMenu } from "./AllToolsMenu";
import styles from "./ResourceComposer.module.css";

// ── Public types (consumed by ResourcesPanel + section-wiring agent) ────

/** A resource the teacher has captured but not yet committed. */
export interface CapturedItem {
  /** Stable id for the React key + remove handling. */
  id: string;
  /** Mapped from mime / source — drives the chip icon and the eventual LessonResource type. */
  type: LessonResource["type"];
  /** Human label — filename, URL, or "Pasted image" fallback. */
  label: string;
  /** Optional per-resource rich-text note. Each captured chip can reveal a
   *  RichTextEditor where the teacher writes formatted notes (links, lists,
   *  inline images) for THIS resource. Persisted to the resource's `body`
   *  field on Add (NOT folded onto the label — the model now carries `body`
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
  /** Set true for file items so the limits banner can bucket them. */
  isFile?: boolean;
  /** The underlying File, kept so a backend-mode Add can upload the bytes to
   *  R2. Absent for links / title-only stubs. Not persisted anywhere. */
  file?: File;
}

/** Summary of what landed in the planner doc on Add — handed back to
 *  the caller so it can track "stacks" (e.g. a photo-stack tile in the
 *  Resources panel) that the store itself does not model. */
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
 *   • "resource" (default) — the historical flow: capture one-or-more media /
 *     links and attach them as N separate LessonResources at the routed
 *     destination. Each captured chip can carry its own rich-text `body` note.
 *
 *   • "notecard" — capture media that become ONE notecard's flip-through
 *     `gallery`, plus a single top-level RichTextEditor for the notecard's
 *     `body`. On Add this commits exactly ONE resource via
 *     `makeNotecard({ label, gallery, body })` — never N separate resources.
 */
export type ResourceComposerMode = "resource" | "notecard";

/**
 * Locator for "add / edit notes on an EXISTING resource" mode. When supplied
 * (alongside `mode="notecard"`), the composer does NOT create a new resource:
 * it opens pre-filled with the resource's current `body` (and label), locks
 * routing to the resource's existing home, and on Add PATCHES that resource —
 * setting its `body` (and merging any newly-captured media into its `gallery`)
 * via `editSectionResource` (section route) or `editLesson` (whole-lesson
 * route). This is the "add a notecard/note to any existing resource" path.
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
  /** The resource being edited — seeds the title + body editor. */
  resource: LessonResource;
}

/** Public API for ResourceComposer. Stable — the section-wiring agent
 *  imports this and the component will not change shape after first pass. */
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
   *  onto the Resources panel). Pre-populates the chip strip; the teacher
   *  still has to confirm + route + Add. */
  initialItems?: CapturedItem[];
  /** When true the routing pills are read-only — used for "add more
   *  photos" mode where a stack tile is being appended to in place. */
  lockRouting?: boolean;
  /** Fired when the dialog is dismissed (Escape, scrim click, × button). */
  onClose: () => void;
  /** Optional — called immediately AFTER a successful Add, before close.
   *  The ResourcesPanel uses this to register a "photo-stack" entry so it
   *  can render a stack visual without the planner store needing a native
   *  stack shape. */
  onCommitted?: (summary: ResourceComposerCommit) => void;
}

// ── Focusable selector (mirrors SaveTargetDialog) ────────────────────────
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// A URL is "a string starting with http:// or https:// with no whitespace".
// Stricter than the spec but good enough to recognise a pasted link.
const URL_REGEX = /^https?:\/\/\S+$/;

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

/** Tiny unique id (chip keys + nothing else). */
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
 *  newer provider taxonomy (image / pdf / video / audio) so the
 *  ResourceEmbed renderer can pick the right branch from a session-only
 *  blob URL. Returns undefined for things we don't yet recognise. */
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
 *  so the captured strip + ResourceEmbed can preview the file in-place
 *  before Add (real R2 upload lands in a later slice). */
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
  // useLabels() ships from lib/labels.tsx (another agent). If the module
  // resolves it returns the configured captions; the default it returns
  // matches the four words we'd hard-code anyway, so this stays safe even
  // before the other agent's PR lands.
  const labels = useLabels();

  // ── ID + refs ────────────────────────────────────────────────────────
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
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

  // ── Local UI state ───────────────────────────────────────────────────
  const [title, setTitle] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [linkOpen, setLinkOpen] = useState<boolean>(false);
  const [linkValue, setLinkValue] = useState<string>("");
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  /** Switches the composer body to the "All tools" expanded grid (the
   *  card-wall tool menu). Returning sets this back to false. */
  const [allToolsOpen, setAllToolsOpen] = useState<boolean>(false);
  const [items, setItems] = useState<CapturedItem[]>([]);
  /** Which captured-chip is currently showing its note textarea. Null =
   *  none open. Only one note editor is open at a time so the strip
   *  doesn't grow taller than the composer can contain. */
  const [noteOpenId, setNoteOpenId] = useState<string | null>(null);
  /** Inline status copy — "Pasted image" / "Pasted link" — appears under
   *  the captured-items strip so a teacher knows their paste registered. */
  const [pastedStatus, setPastedStatus] = useState<string | null>(null);
  /** Inline rejection copy — "Skipped photo.png — image must be ≤ 5 MB"
   *  — appears in red under the captured-items strip when an upload is
   *  refused at capture time (size cap, mime allowlist, or the per-
   *  lesson count cap). Auto-clears after 6 s. */
  const [rejectionStatus, setRejectionStatus] = useState<string | null>(null);
  /** True while hosted-file uploads to R2 are in flight (backend mode). */
  const [uploading, setUploading] = useState<boolean>(false);
  /** Inline error when a hosted-file upload fails — keeps the dialog open so
   *  the teacher can retry or remove the offending file. */
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Whether the planner Supabase seam is on. When true, file uploads persist
  // to R2 + the resources table; when false the composer keeps its
  // session-only blob behavior (mock / local).
  const backendOn = isPlannerSupabaseConfigured();

  // Routing pills — initialize from the launching lesson + (optional) section.
  // The Section pill carries the special value "" to mean "Whole lesson".
  const [subjectId, setSubjectId] = useState<SubjectId>(lesson.subject);
  const [unitId, setUnitId] = useState<string>(lesson.unit);
  const [lessonId, setLessonId] = useState<string>(lesson.id);
  const [sectionId, setSectionId] = useState<string>(initialSectionId ?? "");

  // Which picker is currently open (null = none).
  const [openPicker, setOpenPicker] = useState<
    "subject" | "unit" | "lesson" | "section" | null
  >(null);

  // ── On open: reset state + focus the title input ─────────────────────
  // The `open` prop drives mount/unmount; this effect re-initialises every
  // time the dialog re-opens so a previous session's chips don't leak.
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Fresh session — forget the previous open's committed blob URLs so the
    // leak guard can reclaim anything that was abandoned (not committed) then.
    committedUrlsRef.current = new Set<string>();
    uploadedRef.current = new Map();
    pdfRenderedRef.current = new Set();

    // In edit mode, seed the title + rich body from the resource being edited
    // and route to its existing home; otherwise start blank at the launching
    // lesson. The notecard body is the shared `body` state (a RichTextEditor in
    // notecard mode); in resource mode `body` stays the plain description field.
    setTitle(editResource ? (editResource.resource.label ?? "") : "");
    setBody(editResource ? (editResource.resource.body ?? "") : "");
    setLinkOpen(false);
    setLinkValue("");
    setSearchOpen(false);
    setAllToolsOpen(false);
    setNoteOpenId(null);
    setItems(initialItems ?? []);
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
    const frame = requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
    // We intentionally do NOT re-run when initialItems/initialSectionId
    // change while open — the composer is a one-shot session per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Blob-URL leak guard ──────────────────────────────────────────────
  // File picks mint `blob:` URLs via URL.createObjectURL so the embed
  // preview can render the file in-session. Those handles need an
  // explicit URL.revokeObjectURL when the composer closes (or the items
  // are dropped) or the browser leaks them for the page's lifetime.
  // We keep a ref to the latest items array so the cleanup effect can
  // revoke without listing `items` in its deps (which would re-fire on
  // every keystroke).
  // URLs we've already handed to the planner store on Add. The leak guard
  // below must NOT revoke these — the committed resource still points at the
  // blob for the rest of the session, so revoking it would leave the
  // just-added image/PDF tile rendering a dead `blob:` (the "thumbnail
  // doesn't show after adding" bug). Reset on every re-open.
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
    // session EXCEPT the ones already committed to the store on Add (those
    // must stay alive so the resource's tile/preview keeps rendering).
    for (const item of itemsRef.current) {
      if (
        item.url?.startsWith("blob:") &&
        !committedUrlsRef.current.has(item.url)
      ) {
        URL.revokeObjectURL(item.url);
      }
    }
  }, [open]);

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
  // Keeps the strip from accumulating a stale status line.
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
  // thumbnailUrl when it resolves so the captured strip + the eventual tile
  // show the page; on failure the PDF keeps its icon poster. Guarded per item
  // so it runs once, and it covers BOTH the picker and the drag-drop
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

  // ── Derived: available units / lessons for the pickers ───────────────
  // Units come from the SUBJECT_BY_ID → UNITS map; we walk the planner
  // store's lessons to derive the unit set for the chosen subject so the
  // picker never offers a unit with zero lessons in the doc. Lessons are
  // scoped to the chosen unit AND the launching lesson's `week` when
  // present — that "show me THIS week" filter matches the routing spec.

  /** Subjects: just the canonical eight — fixed order, locked team-wide. */
  const subjectOptions = useMemo(() => subjects, [subjects]);

  /** Unique unit ids present in the planner doc for the chosen subject. */
  const unitOptions = useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const l of lessons) {
      if (l.subject !== subjectId) continue;
      if (seen.has(l.unit)) continue;
      // The lesson carries its unit id, but we want a label — pull a
      // representative title from the first matching lesson and use the
      // unit id as the fallback display.
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

  /** Sections of the chosen lesson — the Section picker shows these plus
   *  the special "Whole lesson" option at the top. */
  const sectionOptions = useMemo(
    () => (lessonId ? getSections(lessonId) : []),
    [lessonId, getSections],
  );

  // ── Cascading reset effects ──────────────────────────────────────────
  // Changing an upstream picker collapses every downstream pick to the
  // first valid option. We do this in effects (not inside the setter) so
  // the cascade still fires for any future programmatic change.

  // When subject changes, snap unit + lesson + section to the first
  // valid match in the new subject. Skipped if the current selection is
  // still valid (so picking the same subject is a no-op).
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

  // When unit changes, snap lesson + section.
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

  /** Add many at once — used by the file pickers' onChange. Validates
   *  every incoming item against the spec caps (mime allowlist, size cap,
   *  per-lesson count cap) and collects each rejection's reason. Accepted
   *  items merge into the strip; rejection reasons become an inline
   *  message the teacher sees ("Skipped photo.png — image must be
   *  ≤ 5 MB (yours: 6.2 MB).").
   *
   *  Counts are local to the current strip — a Phase 1B+ improvement is
   *  to include the section's already-attached items in the count so the
   *  composer can refuse the 11th item across BOTH the strip and the
   *  lesson's prior resources. Today the DB trigger backstops that case
   *  on the API side. */
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
    setNoteOpenId((cur) => (cur === id ? null : cur));
  }, []);

  /** Update one captured item's rich-text note (→ resource.body). Driven by
   *  the per-chip RichTextEditor's onChange, which already emits sanitized
   *  HTML; we store it verbatim and re-sanitize again on render. */
  const setItemBody = useCallback((id: string, html: string) => {
    setItems((prev) =>
      prev.map((c) => (c.id === id ? { ...c, body: html } : c)),
    );
  }, []);

  /** Toggle the per-chip note editor. Clicking the chip itself opens or
   *  closes the note for that chip; clicking another chip swaps focus. */
  const toggleNote = useCallback((id: string) => {
    setNoteOpenId((cur) => (cur === id ? null : id));
  }, []);

  // ── File picker change handlers ──────────────────────────────────────

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

  const onPhotoChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      const captured: CapturedItem[] = [];
      for (let i = 0; i < files.length; i += 1) {
        // Photo picker uses accept="image/*", but be defensive: only
        // accept images here so the caller's intent is preserved.
        if (!files[i].type.startsWith("image/")) continue;
        // Photo picks get the same rich shape as the generic upload
        // path — blob URL + provider + size + mime — so the embed
        // preview and limits banner can read them.
        const f = files[i];
        captured.push({
          id: uid("cap"),
          type: "image",
          label: f.name || "Photo",
          url: URL.createObjectURL(f),
          provider: "image",
          mimeType: f.type,
          sizeBytes: f.size,
          isFile: true,
          file: f,
        });
      }
      addItems(captured);
      e.target.value = "";
    },
    [addItems],
  );

  // ── Tile click handlers ──────────────────────────────────────────────

  const onUploadClick = useCallback(() => uploadInputRef.current?.click(), []);
  const onPhotoClick = useCallback(() => photoInputRef.current?.click(), []);
  const onLinkClick = useCallback(() => {
    setLinkOpen((v) => !v);
    // Focus the URL input on next frame so the inline row reveals + lands focus.
    requestAnimationFrame(() => linkInputRef.current?.focus());
  }, []);
  const onSearchClick = useCallback(() => setSearchOpen((v) => !v), []);

  /** Best-effort OG enrichment for a plain website link. The browser can't
   *  read another origin's OG tags directly (CORS), so we ask our own
   *  SSRF-guarded `/api/og-preview` route. On success we patch the matching
   *  captured chip with a real thumbnail so the tile/preview shows a card
   *  instead of a bare domain. Every failure is swallowed — the link still
   *  works without a thumbnail, in line with the session-only model. */
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
   *  captured chip carries a real `provider`, `thumbnailUrl`, and
   *  `displayName`, then append a link item and clear the field. */
  const onLinkConfirm = useCallback(() => {
    const raw = linkValue.trim();
    if (!raw) return;
    const parsed = parseResourceUrl(raw);
    addItem({
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
      // Default to "thumbnail" for every link; the segmented control on
      // the chip lets the teacher flip to literal/hyperlink.
      displayMode: "thumbnail",
    });
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
        // shape that the file picker uses, so the embed preview and the
        // limits banner can read them.
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
      // parseResourceUrl so we capture provider + thumbnail), anything
      // else → body.
      const text = cd.getData("text");
      if (!text) return;

      if (URL_REGEX.test(text.trim())) {
        e.preventDefault();
        const raw = text.trim();
        const parsed = parseResourceUrl(raw);
        addItem({
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
          displayMode: "thumbnail",
        });
        if (parsed.provider === "website") enrichWebsiteLink(raw);
        setPastedStatus("Pasted link");
        return;
      }

      // Plain text — let the default paste land in whatever input is
      // focused. Set a small status nudge if focus is in the body
      // textarea so the teacher sees confirmation; for inputs the default
      // browser behaviour already speaks for itself.
      if (document.activeElement?.tagName === "TEXTAREA") {
        setPastedStatus("Pasted text");
      }
    },
    [addItem, addItems, enrichWebsiteLink],
  );

  // ── Inline-image resolver for the rich-text body editor ──────────────
  // The RichTextEditor calls this when the teacher inserts an inline image.
  // Backend mode → upload the picked file to R2 and return its served URL
  // (/api/resources/{id}) so it persists + reaches the team. Mock/session
  // mode → return a `data:` URL read from the file so the image renders in
  // this session (the body string carries the data URL through the JSONB
  // seam unchanged). Returns null (cancels insertion) on cancel/failure.
  // sanitizeHtml() drops an unsafe src at emit regardless.
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

  // ── Add (commit) ─────────────────────────────────────────────────────
  // Three commit shapes, by mode:
  //   • resource mode — translate every captured item into a separate
  //     LessonResource at the routed destination (each carrying its own rich
  //     `body` note). Whole-lesson → editLesson; section → addSectionResource.
  //   • notecard CREATE — commit exactly ONE makeNotecard({label, gallery,
  //     body}); captured media become the gallery.
  //   • notecard EDIT (editResource) — patch the existing resource's
  //     body/gallery in place via editSectionResource / editLesson.

  const canAdd = useMemo(() => {
    // Resource mode: at least one captured item OR a title (a title alone
    // creates a labelled "link" stub). Notecard/edit mode: a title, captured
    // media, OR non-empty rich body is enough — a notes-only card is valid.
    if (isNotecardMode) {
      return (
        items.length > 0 ||
        title.trim().length > 0 ||
        body.replace(/<[^>]*>/g, "").trim().length > 0
      );
    }
    return items.length > 0 || title.trim().length > 0;
  }, [isNotecardMode, items, title, body]);

  const handleAdd = useCallback(async () => {
    if (!canAdd || uploading) return;

    // Resolve the destination lesson; fall back to the launching lesson
    // if the picker somehow ended up with a stale id.
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
      /** Transient: the File to upload, its blob URL, and the source
       *  CapturedItem id (upload-cache key). Never dispatched. */
      __file?: File;
      __blobUrl?: string;
      __id?: string;
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
      const owner = resourceOwnerEvent(destLesson);
      // Upload every file item, reusing any result already cached from a prior
      // attempt so a RETRY never re-uploads a file that already succeeded
      // (which would duplicate the R2 object + resources row and eat the
      // per-event count quota). allSettled — not all — so one failure doesn't
      // abandon the in-flight successes: they finish, cache, and commit on the
      // next click.
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
          // Image tiles read thumbnailUrl ?? url; the served url IS the image.
          // For non-images keep any client-rendered poster we already have
          // (e.g. the PDF first-page data URL) instead of clobbering it.
          r.thumbnailUrl =
            result.provider === "image" ? result.url : r.thumbnailUrl;
          // The blob is no longer the resource's url — let it be revoked.
          r.__blobUrl = undefined;
        }),
      );
      setUploading(false);
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
    }

    // Map an uploaded CommitShape to a clean LessonResource (drops the
    // transient __* fields). Shared by every commit path below.
    const toResource = (r: CommitShape): LessonResource => ({
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
    });

    if (isNotecardMode) {
      // ── Notecard commit — ONE resource (create or edit), never N ──────────
      // Captured media become the gallery; the single top-level rich body is
      // the notes. A title falls back to a generic notecard name in makeNotecard.
      const newGallery: LessonResource[] = toCommit.map(toResource);
      const labelInput = title.trim();

      if (isEditMode && editResource) {
        // EDIT — patch the existing resource's body (+ append any newly-captured
        // media to its gallery). We DON'T overwrite the existing gallery; new
        // media is added after what's already there. Editing notes on a plain
        // resource promotes it to carry `body` without changing its type.
        const existing = editResource.resource;
        const mergedGallery = [...(existing.gallery ?? []), ...newGallery];
        const patch: Partial<LessonResource> = {
          ...(body.trim() ? { body } : { body: "" }),
          ...(mergedGallery.length > 0 ? { gallery: mergedGallery } : {}),
        };
        if (editResource.sectionId) {
          editSectionResource(
            destLessonId,
            editResource.sectionId,
            editResource.resourceId,
            patch,
          );
        } else {
          // Whole-lesson resource — patch the array slot by index (the
          // synthesized id can't locate the row inside editLesson).
          const idx = editResource.lessonResourceIndex ?? -1;
          const nextResources = destLesson.resources.map((res, i) =>
            i === idx ? { ...res, ...patch } : res,
          );
          editLesson(destLessonId, { resources: nextResources });
        }
      } else {
        // CREATE — one new notecard at the routed destination.
        const notecard = makeNotecard({
          label: labelInput,
          gallery: newGallery,
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

    // Report back to the caller (the Resources panel uses this to register
    // photo-stacks). Notecard mode commits exactly one resource.
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
    lesson,
    addSectionResource,
    editSectionResource,
    editLesson,
    onClose,
    onCommitted,
  ]);

  // ── Keyboard handler (Escape + focus trap) ───────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        // If a picker is open, close THAT first; only then close the dialog.
        if (openPicker) {
          e.preventDefault();
          setOpenPicker(null);
          return;
        }
        // If the All-Tools sub-view is showing, Back-out of THAT first
        // (one Escape returns to the standard composer, a second closes).
        if (allToolsOpen) {
          e.preventDefault();
          setAllToolsOpen(false);
          return;
        }
        e.preventDefault();
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
  if (!open) return null;

  // Pretty labels for the routing pills. Subject + Lesson titles come
  // from mock data; Unit label borrows the unit id (the canonical
  // UNIT_BY_ID lookup is in mock — using it here keeps the pill readable).
  const selectedSubject = subjectOptions.find((s) => s.id === subjectId);
  const selectedLesson = lessons.find((l) => l.id === lessonId);

  return (
    <div
      className={styles.scrim}
      onClick={handleScrimClick}
      aria-hidden={false}
    >
      {/* The dialog panel carries the subject's color via the .cp-subj
          class so the primary "Add" button can lift a single saturated
          subject-color hit (the only saturated color in the whole composer).
          Every other element stays neutral. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        title={
          isEditMode
            ? "Add notes dialog — write formatted notes (and add media) to this resource"
            : isNotecardMode
              ? "New notecard dialog — gather photos and files into a card, then write its notes"
              : "Add a resource dialog — capture links, files, videos, and docs, then pick which lesson and section to attach them to"
        }
        className={`${styles.panel} cp-subj ${subjectId}`}
        onKeyDown={handleKeyDown}
        onPaste={onDialogPaste}
      >
        {/* ── Top bar: × close · spacer · Add ─────────────────────────── */}
        <header className={styles.topBar}>
          <Button
            variant="icon"
            iconAriaLabel="Close add-resource dialog"
            className={styles.closeBtn}
            onClick={onClose}
            tooltip="Close the resource composer without attaching anything"
          >
            <CloseIcon />
          </Button>
          <span id={headingId} className={styles.srOnly}>
            {isEditMode
              ? "Add notes to this resource"
              : isNotecardMode
                ? "Create a notecard"
                : "Add a resource"}
          </span>
          <Button
            variant="primary"
            size="sm"
            className={styles.addBtn}
            tooltip={
              backendOn
                ? "Attach every captured resource to this lesson — files upload to your team's storage; links and notes save to the plan"
                : "Attach every captured resource to the chosen lesson for this session — files aren't uploaded to the server yet, so they won't survive a reload or reach your team until backend sync is on"
            }
            onClick={handleAdd}
            disabled={!canAdd || uploading}
          >
            {uploading ? "Adding…" : "Add"}
          </Button>
        </header>

        {/* ── Main composer body OR the "All tools" expanded grid ───── */}
        {/* The dialog has two states: the standard composer (title +
            4-tile grid + body + chips + routing) and the AllToolsMenu
            sub-view (card-wall 3-column tool grid). The top bar
            (× / Add) stays visible in both so the teacher can commit
            captured items even while the All-Tools view is open. */}
        {allToolsOpen ? (
          <AllToolsMenu
            onBack={() => setAllToolsOpen(false)}
            onAddItem={(it) => addItem(it)}
            onAddItems={(arr) => addItems(arr)}
            onRequestLinkRow={() => {
              // Close All-Tools, open the inline URL row in the standard
              // composer view, and focus the URL field on the next frame.
              setAllToolsOpen(false);
              setLinkOpen(true);
              requestAnimationFrame(() => linkInputRef.current?.focus());
            }}
          />
        ) : (
          <>
            {/* ── Title input ─────────────────────────────────────────────── */}
            <input
              ref={titleInputRef}
              type="text"
              className={styles.titleInput}
              placeholder={isNotecardMode ? "Notecard title" : "Title"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label={isNotecardMode ? "Notecard title" : "Resource title"}
            />

            {/* Notecard-mode intro — names what the captured media + notes
                become so the single-resource commit is unsurprising. In edit
                mode it explains the patch-in-place behavior instead. */}
            {isNotecardMode && (
              <p className={styles.caption} role="note">
                {isEditMode
                  ? "Add formatted notes (and extra media) to this resource. Your changes save to the card."
                  : "Photos and files you add become this card’s flip-through gallery; write the notes below."}
              </p>
            )}

            {/* ── Tool grid: Upload · Photo · Link · Search ─────────────────
                Each tile carries a pastel hue from the highlighter pen
                family (--hlp-* body / --hl-* icon pill) so the four tiles
                read as a quiet row of four colors — not stark grey rectangles.
                These four hues are intentionally distinct so the teacher's
                glance can find a tile by color memory, but ALL of them are
                low-saturation pastels: the only saturated color in the
                composer is the Add button (subject color). */}
            <div
              className={styles.toolGrid}
              role="group"
              aria-label="Resource source"
            >
              <ToolTile
                label="Upload"
                description="Any file"
                onClick={onUploadClick}
                icon={<UploadIcon />}
                bgVar="--hlp-maya"
                iconVar="--hl-maya"
                staggerIndex={0}
              />
              <ToolTile
                label="Photo"
                description="Image files"
                onClick={onPhotoClick}
                icon={<PhotoIcon />}
                bgVar="--hlp-violet"
                iconVar="--hl-violet"
                staggerIndex={1}
              />
              <ToolTile
                label="Link"
                description="Paste a URL"
                onClick={onLinkClick}
                active={linkOpen}
                icon={<LinkIcon />}
                bgVar="--hlp-slate"
                iconVar="--hl-slate"
                staggerIndex={2}
              />
              <ToolTile
                label="Search"
                description="Resource board"
                onClick={onSearchClick}
                active={searchOpen}
                icon={<SearchIcon />}
                bgVar="--hlp-lemon"
                iconVar="--hl-lemon"
                staggerIndex={3}
              />
            </div>

            {/* ── All tools button ───────────────────────────────────────── */}
            {/* Opens the AllToolsMenu sub-view. The four primary tiles above
            cover the 80% case; this button exposes the long-tail tool
            palette (Card wall, YouTube, Camera, etc.) without
            cluttering the standard composer. */}
            <Button
              variant="ghost"
              size="sm"
              className={styles.allToolsBtn}
              onClick={() => setAllToolsOpen(true)}
              aria-label="Show all tools"
              tooltip="Browse every resource type the composer supports — files, links, video, slides, photos, and more"
              leadingIcon={<MoreDotsIcon />}
            >
              All tools
            </Button>

            {/* Hidden file inputs — driven by the tool tiles' clicks. */}
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              className={styles.hiddenInput}
              aria-hidden="true"
              tabIndex={-1}
              onChange={onUploadChange}
            />
            <input
              ref={photoInputRef}
              type="file"
              multiple
              accept="image/*"
              className={styles.hiddenInput}
              aria-hidden="true"
              tabIndex={-1}
              onChange={onPhotoChange}
            />

            {/* ── Inline URL row (revealed by the Link tile) ─────────────── */}
            {linkOpen && (
              <div
                className={styles.inlineRow}
                role="group"
                aria-label="Add link"
              >
                <input
                  ref={linkInputRef}
                  type="url"
                  className={styles.urlInput}
                  placeholder="https://…"
                  value={linkValue}
                  onChange={(e) => setLinkValue(e.target.value)}
                  onKeyDown={onLinkKeyDown}
                  aria-label="Resource URL"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  className={styles.inlineAddBtn}
                  onClick={onLinkConfirm}
                  disabled={!linkValue.trim()}
                  tooltip="Capture this URL into the resource list — you'll still need to click Add to attach everything to the lesson"
                >
                  Add link
                </Button>
              </div>
            )}

            {/* ── Search stub (Phase 1A coming-soon line) ─────────────────── */}
            {searchOpen && (
              <p className={styles.searchStub} role="status">
                Search the resource board — coming soon.
              </p>
            )}

            {/* ── Caption ────────────────────────────────────────────────── */}
            <p className={styles.caption}>
              Add an image, video, link, or file.
            </p>

            {/* Honest-persistence note (audit finding #22). The composer
                writes captured resources into the planner store, but uploads
                are SYNTHETIC (blob URLs — see the header) and, until the
                Supabase seam is on, the store is in-memory only: an Add does
                NOT durably save to the server or reach the team. Surface that
                inline so the Add button never implies a durable, team-visible
                save. Mirrors the InstanceRename "saved on this device for now"
                precedent. */}
            {backendOn ? (
              <p className={styles.caption} role="note">
                Files upload to your team&rsquo;s storage; links and notes save
                to the lesson.
              </p>
            ) : (
              <p
                className={styles.caption}
                style={{ color: "var(--catchup, #b45309)" }}
                role="note"
              >
                Attached for this session only — files aren&rsquo;t uploaded to
                the server yet, so they won&rsquo;t survive a reload or reach
                your team until backend sync is on.
              </p>
            )}

            {/* Inline upload failure — keeps the dialog open so the teacher
                can retry or remove the offending file. */}
            {uploadError && (
              <p
                className={styles.caption}
                style={{ color: "var(--catchup, #b45309)" }}
                role="alert"
              >
                {uploadError}
              </p>
            )}

            {/* ── Body ───────────────────────────────────────────────────────
                Notecard mode: a full RichTextEditor whose HTML becomes the
                notecard's `body` (formatted notes + links + inline images).
                Resource mode: the original plain description textarea (its
                per-resource notes are written through each chip's editor). */}
            {isNotecardMode ? (
              <div className={styles.notecardBody}>
                <RichTextEditor
                  value={body}
                  onChange={setBody}
                  placeholder="Write the notes for this card — formatting, links, and images all work…"
                  ariaLabel="Notecard notes"
                  onRequestImageUrl={requestBodyImageUrl}
                />
              </div>
            ) : (
              <textarea
                className={styles.bodyArea}
                placeholder="Write something to describe the resource…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                aria-label="Resource description"
                rows={3}
              />
            )}

            {/* ── Limits banner ──────────────────────────────────────────── */}
            {/* Per Tim's brief: ≤10 files (PDF/DOCX/RTF) + ≤10 images per
            lesson; links unlimited. The banner counts ONLY the items in
            the current capture strip — a Phase 1B+ improvement is to
            include the section's already-attached items. The cap is
            enforced in `addItems`, so this line is informational. */}
            {items.length > 0 &&
              (() => {
                const fileCount = items.filter(
                  (c) => c.isFile && c.provider !== "image",
                ).length;
                const imageCount = items.filter(
                  (c) => c.isFile && c.provider === "image",
                ).length;
                const linkCount = items.filter((c) => !c.isFile).length;
                return (
                  <div
                    style={{
                      fontSize: 11,
                      color: "var(--ink-500, #71717a)",
                      margin: "4px 0",
                    }}
                    role="status"
                    aria-live="polite"
                  >
                    {fileCount} / 10 files · {imageCount} / 10 images ·{" "}
                    {linkCount} link{linkCount === 1 ? "" : "s"}
                  </div>
                );
              })()}

            {/* ── Captured items strip + paste status ────────────────────── */}
            {/* In resource mode each chip is a button — tapping it opens a
            rich-text note editor below the strip where the teacher writes
            formatted notes (→ resource.body) for THAT resource. Clicking the
            same chip again closes the editor. In notecard mode the chips are
            static labels (the captured media are the card's gallery; notes
            live in the single top-level editor). */}
            {(items.length > 0 || pastedStatus || rejectionStatus) && (
              <div className={styles.capturedWrap}>
                {items.length > 0 && (
                  <ul
                    className={styles.capturedStrip}
                    aria-label="Captured items"
                  >
                    {items.map((item) => {
                      const noteOpen = noteOpenId === item.id;
                      // Strip tags to decide "has a note" so an empty <p></p>
                      // from the rich editor doesn't light the dot.
                      const hasNote =
                        (item.body ?? "").replace(/<[^>]*>/g, "").trim()
                          .length > 0;
                      return (
                        <li
                          key={item.id}
                          className={`${styles.capturedChip} ${
                            noteOpen ? styles.capturedChipActive : ""
                          }`}
                        >
                          {isNotecardMode ? (
                            // Notecard mode — the chip is a static label (its
                            // notes live in the single top-level body editor,
                            // not per-item). Still shows the type glyph + name.
                            <span
                              className={styles.capturedChipBody}
                              title={`${item.label} — part of this notecard's gallery`}
                            >
                              <span
                                className={styles.capturedChipIcon}
                                aria-hidden="true"
                              >
                                <CapturedTypeIcon type={item.type} />
                              </span>
                              <span
                                className={styles.capturedChipLabel}
                                title={item.label}
                              >
                                {item.label}
                              </span>
                            </span>
                          ) : (
                            <Tooltip
                              content={
                                hasNote
                                  ? `Edit the note attached to ${item.label} — the note shows up on the lesson card alongside the resource.`
                                  : `Add a short note to ${item.label} so the team knows how to use it.`
                              }
                              side="top"
                            >
                              <button
                                type="button"
                                className={styles.capturedChipBody}
                                onClick={() => toggleNote(item.id)}
                                aria-expanded={noteOpen}
                                title={
                                  hasNote
                                    ? `Edit the note attached to ${item.label}`
                                    : `Add a short note to ${item.label} so the team knows how to use it`
                                }
                                aria-label={
                                  hasNote
                                    ? `Edit note for ${item.label}`
                                    : `Add note for ${item.label}`
                                }
                              >
                                <span
                                  className={styles.capturedChipIcon}
                                  aria-hidden="true"
                                >
                                  <CapturedTypeIcon type={item.type} />
                                </span>
                                <span
                                  className={styles.capturedChipLabel}
                                  title={item.label}
                                >
                                  {item.label}
                                </span>
                                {hasNote && (
                                  <span
                                    className={styles.capturedChipNoteDot}
                                    aria-label="Has note"
                                    title="Has note"
                                  />
                                )}
                              </button>
                            </Tooltip>
                          )}
                          <Tooltip
                            content={`Remove ${item.label} from the captured list — it won't be attached to the lesson.`}
                            side="top"
                          >
                            <button
                              type="button"
                              className={styles.capturedChipRemove}
                              onClick={() => removeItem(item.id)}
                              aria-label={`Remove ${item.label}`}
                              title={`Remove ${item.label} from the captured list — it won't be attached to the lesson`}
                            >
                              <SmallXIcon />
                            </button>
                          </Tooltip>
                          {/* Inline embed preview — shows the teacher the
                          actual thing before they Add. We pass the
                          captured item as a LessonResource (the shape is
                          compatible: type/label/url/provider/etc.); the
                          renderer falls back to a legacy marker if no
                          url is present, so legacy fixtures stay safe. */}
                          {item.url && (
                            <div
                              style={{
                                flexBasis: "100%",
                                marginTop: 4,
                              }}
                            >
                              <ResourceEmbed
                                resource={item as LessonResource}
                                variant="row"
                              />
                            </div>
                          )}
                          {/* 3-way display-mode toggle — only for true
                          link/website rows. The teacher's choice flows
                          through to LessonResource.displayMode on Add. */}
                          {item.provider === "website" && (
                            <div
                              role="radiogroup"
                              aria-label="Link display mode"
                              style={{
                                display: "flex",
                                gap: 4,
                                marginTop: 4,
                                flexBasis: "100%",
                              }}
                            >
                              {(
                                ["literal", "hyperlink", "thumbnail"] as const
                              ).map((mode) => (
                                <button
                                  key={mode}
                                  type="button"
                                  role="radio"
                                  aria-checked={item.displayMode === mode}
                                  onClick={() =>
                                    setItems((prev) =>
                                      prev.map((c) =>
                                        c.id === item.id
                                          ? { ...c, displayMode: mode }
                                          : c,
                                      ),
                                    )
                                  }
                                  style={{
                                    padding: "2px 8px",
                                    fontSize: 11,
                                    border: "1px solid var(--ink-100, #e4e4e7)",
                                    borderRadius: 4,
                                    background:
                                      item.displayMode === mode
                                        ? "var(--accent, #2563eb)"
                                        : "transparent",
                                    color:
                                      item.displayMode === mode
                                        ? "white"
                                        : "inherit",
                                    cursor: "pointer",
                                  }}
                                >
                                  {mode}
                                </button>
                              ))}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* The note editor for the currently-open chip. Sits BELOW
                the strip so a single editor handles all chips (saves
                vertical space and keeps the chip row scannable). A full
                RichTextEditor writes to the resource's `body` (formatted
                notes + links + inline images). Only in resource mode —
                notecard mode uses the single top-level body editor instead. */}
                {!isNotecardMode &&
                  noteOpenId &&
                  items.find((c) => c.id === noteOpenId) &&
                  (() => {
                    const item = items.find((c) => c.id === noteOpenId)!;
                    return (
                      <div
                        className={styles.noteEditor}
                        role="group"
                        aria-label={`Note for ${item.label}`}
                      >
                        <span className={styles.noteEditorLabel}>
                          Note for <strong>{item.label}</strong>
                        </span>
                        <RichTextEditor
                          value={item.body ?? ""}
                          onChange={(html) => setItemBody(item.id, html)}
                          placeholder="Write a note for this resource…"
                          ariaLabel={`Note text for ${item.label}`}
                          onRequestImageUrl={requestBodyImageUrl}
                        />
                        <p className={styles.noteHint}>
                          Formatted notes, links, and images save with this
                          resource and show on its card.
                        </p>
                      </div>
                    );
                  })()}

                {pastedStatus && (
                  <p
                    className={styles.pastedStatus}
                    role="status"
                    aria-live="polite"
                  >
                    {pastedStatus}
                  </p>
                )}
                {rejectionStatus && (
                  <p
                    className={styles.rejectionStatus}
                    role="alert"
                    aria-live="assertive"
                  >
                    {rejectionStatus}
                  </p>
                )}
              </div>
            )}

            {/* ── Routing row ────────────────────────────────────────────── */}
            {/* "{Subject} → {Unit} → {Lesson} → {Section}" — labels come
            from useLabels(); the caption is composed so the four user-
            facing words match whatever the labels module emits. */}
            <div
              className={styles.routingRow}
              role="group"
              aria-label={`Where to save · ${labels.subject} · ${labels.unit} · ${labels.lesson} · ${labels.section}`}
            >
              <span className={styles.routingCaption}>
                {labels.subject} · {labels.unit} · {labels.lesson} ·{" "}
                {labels.section}
              </span>
              <div className={styles.routingPills}>
                {/* Subject pill */}
                <PickerPill
                  label={labels.subject}
                  value={selectedSubject?.name ?? ""}
                  open={openPicker === "subject"}
                  disabled={routingLocked}
                  onToggle={() =>
                    setOpenPicker(openPicker === "subject" ? null : "subject")
                  }
                  onClose={() => setOpenPicker(null)}
                  options={subjectOptions.map((s) => ({
                    id: s.id,
                    label: s.name,
                  }))}
                  selectedId={subjectId}
                  onPick={(id) => {
                    setSubjectId(id as SubjectId);
                    setOpenPicker(null);
                  }}
                  swatchClass={subjectId}
                />
                {/* Unit pill */}
                <PickerPill
                  label={labels.unit}
                  value={unitOptions.find((u) => u.id === unitId)?.name ?? ""}
                  open={openPicker === "unit"}
                  disabled={routingLocked || unitOptions.length === 0}
                  onToggle={() =>
                    setOpenPicker(openPicker === "unit" ? null : "unit")
                  }
                  onClose={() => setOpenPicker(null)}
                  options={unitOptions.map((u) => ({
                    id: u.id,
                    label: u.name,
                  }))}
                  selectedId={unitId}
                  onPick={(id) => {
                    setUnitId(id);
                    setOpenPicker(null);
                  }}
                />
                {/* Lesson pill */}
                <PickerPill
                  label={labels.lesson}
                  value={selectedLesson?.title ?? ""}
                  open={openPicker === "lesson"}
                  disabled={routingLocked || lessonOptions.length === 0}
                  onToggle={() =>
                    setOpenPicker(openPicker === "lesson" ? null : "lesson")
                  }
                  onClose={() => setOpenPicker(null)}
                  options={lessonOptions.map((l) => ({
                    id: l.id,
                    label: l.title,
                  }))}
                  selectedId={lessonId}
                  onPick={(id) => {
                    setLessonId(id);
                    setSectionId("");
                    setOpenPicker(null);
                  }}
                />
                {/* Section pill — special "Whole lesson" option at the top. */}
                <PickerPill
                  label={labels.section}
                  value={
                    sectionId
                      ? (sectionOptions.find((s) => s.id === sectionId)
                          ?.heading ?? "Section")
                      : "Whole lesson"
                  }
                  open={openPicker === "section"}
                  disabled={routingLocked}
                  onToggle={() =>
                    setOpenPicker(openPicker === "section" ? null : "section")
                  }
                  onClose={() => setOpenPicker(null)}
                  options={[
                    { id: "", label: "Whole lesson" },
                    ...sectionOptions.map((s) => ({
                      id: s.id,
                      label: stripHtml(s.heading) || "Section",
                    })),
                  ]}
                  selectedId={sectionId}
                  onPick={(id) => {
                    setSectionId(id);
                    setOpenPicker(null);
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── ToolTile ─────────────────────────────────────────────────────────────
// One of the four square tiles in the tool grid. Reads as a gentle
// rounded square with a centered icon over a small label + description.

interface ToolTileProps {
  label: string;
  description: string;
  icon: ReactNode;
  onClick: () => void;
  /** Reflect a "this tile owns the open sub-row" state visually. */
  active?: boolean;
  /** Pastel hue token for the tile body — references --hlp-* in tokens.css.
   *  Wired via an inline custom property so the .toolTile class can pull
   *  it without generating a per-tile class. */
  bgVar?: string;
  /** Stronger hue token for the icon-pill background. References --hl-*. */
  iconVar?: string;
  /** 0-based position in the row — drives the staggered entrance animation
   *  delay so the four tiles cascade in rather than landing as a block. */
  staggerIndex?: number;
}

function ToolTile({
  label,
  description,
  icon,
  onClick,
  active = false,
  bgVar,
  iconVar,
  staggerIndex = 0,
}: ToolTileProps): ReactNode {
  // The three inline custom properties feed --tileBg / --tileIconBg /
  // --stagger inside ResourceComposer.module.css. Both color tokens
  // reference --hlp-* / --hl-* from tokens.css so no hex sneaks in.
  const tileStyle = {
    "--tileBg": bgVar ? `var(${bgVar})` : "var(--ink-50)",
    "--tileIconBg": iconVar ? `var(${iconVar})` : "var(--ink-100)",
    "--stagger": `${staggerIndex * 40}ms`,
  } as React.CSSProperties;

  return (
    <Tooltip content={`${label} — ${description}`} side="top">
      <button
        type="button"
        className={`${styles.toolTile} ${active ? styles.toolTileActive : ""}`}
        onClick={onClick}
        aria-pressed={active}
        title={`${label} — ${description}`}
        style={tileStyle}
      >
        <span className={styles.toolTileIcon} aria-hidden="true">
          {icon}
        </span>
        <span className={styles.toolTileLabel}>{label}</span>
        <span className={styles.toolTileDesc}>{description}</span>
      </button>
    </Tooltip>
  );
}

// ── PickerPill ───────────────────────────────────────────────────────────
// A compact rounded pill-button that opens a list popover. Used four times
// in the routing row (Subject → Unit → Lesson → Section).

interface PickerOption {
  id: string;
  label: string;
}

interface PickerPillProps {
  /** Pill caption (e.g. "Subject"). */
  label: string;
  /** Currently-selected option's display text. */
  value: string;
  /** Is the popover open? */
  open: boolean;
  /** Disabled when there are no options or routing is locked. */
  disabled?: boolean;
  onToggle: () => void;
  onClose: () => void;
  options: PickerOption[];
  selectedId: string;
  onPick: (id: string) => void;
  /** Optional class added to the pill swatch (e.g. subject id) so the
   *  Subject pill can carry a tiny .cp-subj color dot. */
  swatchClass?: string;
}

function PickerPill({
  label,
  value,
  open,
  disabled = false,
  onToggle,
  onClose,
  options,
  selectedId,
  onPick,
  swatchClass,
}: PickerPillProps): ReactNode {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close the popover when a click lands outside it. Useful when the
  // teacher clicks another pill — the focus trap still cycles correctly.
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
    <div className={styles.pickerWrap}>
      <Tooltip
        content="Pick where to attach this resource — choose the subject, unit, lesson, and section in this order."
        side="top"
      >
        <button
          type="button"
          className={`${styles.pickerPill} ${
            disabled ? styles.pickerPillDisabled : ""
          }`}
          onClick={onToggle}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          title="Pick where to attach this resource — choose the subject, unit, lesson, and section in this order"
        >
          {swatchClass && (
            <span
              className={`${styles.pickerSwatch} cp-subj ${swatchClass}`}
              aria-hidden="true"
            />
          )}
          <span className={styles.pickerPillLabel}>{label}</span>
          <span className={styles.pickerPillValue} title={value}>
            {value || "—"}
          </span>
          <ChevronDownIcon />
        </button>
      </Tooltip>
      {open && (
        <div ref={popoverRef} className={styles.pickerPopover} role="listbox">
          {options.length === 0 ? (
            <p className={styles.pickerEmpty}>No options.</p>
          ) : (
            options.map((opt) => (
              <Tooltip
                key={opt.id || "__whole__"}
                content={`Pick ${opt.label}`}
                side="right"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={opt.id === selectedId}
                  className={`${styles.pickerOption} ${
                    opt.id === selectedId ? styles.pickerOptionActive : ""
                  }`}
                  onClick={() => onPick(opt.id)}
                  title={`Pick ${opt.label}`}
                >
                  {opt.label}
                </button>
              </Tooltip>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Misc helpers ─────────────────────────────────────────────────────────

/** Strip HTML from a rich-text heading so the pill shows plain text. */
function stripHtml(html: string): string {
  if (!html) return "";
  // Defensive — the rich-text editor may emit HTML; this dialog only
  // needs the human readable string for the picker label.
  return html.replace(/<[^>]*>/g, "").trim();
}

// ── Icons ────────────────────────────────────────────────────────────────
// Stroked, 18px nominal — matches the Lucide-style vocabulary used in the
// rest of the repo.

function CloseIcon(): ReactNode {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function UploadIcon(): ReactNode {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function PhotoIcon(): ReactNode {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.6" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function LinkIcon(): ReactNode {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function SearchIcon(): ReactNode {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function SmallXIcon(): ReactNode {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function MoreDotsIcon(): ReactNode {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function ChevronDownIcon(): ReactNode {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// Small icon used inside a captured-items chip. Falls through to a generic
// "link" glyph when the type isn't one we model specially.
function CapturedTypeIcon({
  type,
}: {
  type: LessonResource["type"];
}): ReactNode {
  const common = {
    width: 12,
    height: 12,
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
      return (
        <svg {...common}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
  }
}
