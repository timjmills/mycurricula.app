"use client";

// ResourceComposer.tsx — the Padlet-style "Add resource" dialog that the
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
import { SUBJECTS } from "@/lib/mock";
import { useLabels } from "@/lib/labels";
import { Button, Tooltip } from "@/components/ui";
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
  /** Optional per-resource teacher note. Padlet lets you write a caption
   *  under each post; we offer the same: clicking a captured chip reveals
   *  a small textarea where the teacher can write a one-liner for THIS
   *  resource. Default empty.
   *
   *  STORAGE FALLBACK — the planner store's LessonResource shape has only
   *  `type` + `label` (no separate notes/description field). To avoid a
   *  data-model change for a Phase-1A feature, the composer concatenates
   *  the note onto the resource's label on Add ("filename.pdf — note
   *  text"). When the store grows a richer LessonResource shape, lift the
   *  note out of the label and into its own column. */
  note?: string;
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

/** Public API for ResourceComposer. Stable — the section-wiring agent
 *  imports this and the component will not change shape after first pass. */
export interface ResourceComposerProps {
  /** Render the composer only when true. */
  open: boolean;
  /** The lesson the composer was launched from. Drives the default routing
   *  AND the week scope for the Lesson picker. */
  lesson: Lesson;
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

/** Convert a File into a CapturedItem (synthetic — no upload). */
export function fileToCapturedItem(file: File): CapturedItem {
  return {
    id: uid("cap"),
    type: mimeToResourceType(file),
    label: file.name || "File",
  };
}

// ── Component ────────────────────────────────────────────────────────────

export function ResourceComposer({
  open,
  lesson,
  initialSectionId,
  initialItems,
  lockRouting = false,
  onClose,
  onCommitted,
}: ResourceComposerProps): ReactNode {
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
  const { lessons, getSections, addSectionResource, editLesson, getLesson } =
    usePlanner();

  // ── Local UI state ───────────────────────────────────────────────────
  const [title, setTitle] = useState<string>("");
  const [body, setBody] = useState<string>("");
  const [linkOpen, setLinkOpen] = useState<boolean>(false);
  const [linkValue, setLinkValue] = useState<string>("");
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  /** Switches the composer body to the "All tools" expanded grid (the
   *  Padlet-style menu). Returning sets this back to false. */
  const [allToolsOpen, setAllToolsOpen] = useState<boolean>(false);
  const [items, setItems] = useState<CapturedItem[]>([]);
  /** Which captured-chip is currently showing its note textarea. Null =
   *  none open. Only one note editor is open at a time so the strip
   *  doesn't grow taller than the composer can contain. */
  const [noteOpenId, setNoteOpenId] = useState<string | null>(null);
  /** Inline status copy — "Pasted image" / "Pasted link" — appears under
   *  the captured-items strip so a teacher knows their paste registered. */
  const [pastedStatus, setPastedStatus] = useState<string | null>(null);

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

    setTitle("");
    setBody("");
    setLinkOpen(false);
    setLinkValue("");
    setSearchOpen(false);
    setAllToolsOpen(false);
    setNoteOpenId(null);
    setItems(initialItems ?? []);
    setPastedStatus(null);
    setSubjectId(lesson.subject);
    setUnitId(lesson.unit);
    setLessonId(lesson.id);
    setSectionId(initialSectionId ?? "");
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

  // ── Derived: available units / lessons for the pickers ───────────────
  // Units come from the SUBJECT_BY_ID → UNITS map; we walk the planner
  // store's lessons to derive the unit set for the chosen subject so the
  // picker never offers a unit with zero lessons in the doc. Lessons are
  // scoped to the chosen unit AND the launching lesson's `week` when
  // present — that "show me THIS week" filter matches the routing spec.

  /** Subjects: just the canonical eight — fixed order, locked team-wide. */
  const subjectOptions = useMemo(() => SUBJECTS, []);

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
    if (lockRouting) return;
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
    if (lockRouting) return;
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

  /** Add many at once — used by the file pickers' onChange. */
  const addItems = useCallback((next: CapturedItem[]) => {
    if (next.length === 0) return;
    setItems((prev) => [...prev, ...next]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((c) => c.id !== id));
    setNoteOpenId((cur) => (cur === id ? null : cur));
  }, []);

  /** Update one captured item's note. Called on blur of the per-chip
   *  textarea so we don't re-render the whole strip on every keystroke. */
  const setItemNote = useCallback((id: string, note: string) => {
    setItems((prev) => prev.map((c) => (c.id === id ? { ...c, note } : c)));
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
        captured.push({
          id: uid("cap"),
          type: "image",
          label: files[i].name || "Photo",
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

  /** Confirm the inline URL: append a link item, clear the field, keep open. */
  const onLinkConfirm = useCallback(() => {
    const raw = linkValue.trim();
    if (!raw) return;
    addItem({ type: "link", label: raw });
    setLinkValue("");
  }, [linkValue, addItem]);

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
        const captured: CapturedItem[] = imgFiles.map((f) => ({
          id: uid("cap"),
          type: "image",
          label: f.name || "Pasted image",
        }));
        addItems(captured);
        setPastedStatus(
          captured.length === 1
            ? "Pasted image"
            : `Pasted ${captured.length} images`,
        );
        return;
      }

      // 2) Otherwise read plain text. URL → link item, anything else → body.
      const text = cd.getData("text");
      if (!text) return;

      if (URL_REGEX.test(text.trim())) {
        e.preventDefault();
        addItem({ type: "link", label: text.trim() });
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
    [addItem, addItems],
  );

  // ── Add (commit) ─────────────────────────────────────────────────────
  // Translate every captured item into a planner-store dispatch at the
  // resolved destination. Whole-lesson destinations use editLesson with a
  // fresh resources array; section destinations dispatch one
  // addSectionResource per item.

  const canAdd = useMemo(() => {
    // The Add button is enabled once we have at least one captured item
    // OR a title (which on its own would create a labelless "link" stub —
    // we mirror Padlet's "title alone is enough" behaviour). Body alone
    // does NOT enable Add — there's nothing to attach a body to.
    return items.length > 0 || title.trim().length > 0;
  }, [items, title]);

  const handleAdd = useCallback(() => {
    if (!canAdd) return;

    // Resolve the destination lesson; fall back to the launching lesson
    // if the picker somehow ended up with a stale id.
    const destLesson = getLesson(lessonId) ?? lesson;
    const destLessonId = destLesson.id;
    const destSectionId = sectionId || null;

    // If the teacher hasn't captured anything but typed a title, we
    // create a single "link" placeholder so the destination gains
    // something to render. This mirrors how a Padlet card with only a
    // title still exists as a card.
    //
    // Per-item notes are folded onto the label here ("filename.pdf —
    // note text"). See the storage-fallback comment on CapturedItem.note:
    // until LessonResource gains a `note` field, the label is the only
    // place a note can survive the round-trip into the planner store.
    const labelWithNote = (label: string, note?: string): string => {
      const trimmed = (note ?? "").trim();
      if (!trimmed) return label;
      // Use an em-dash separator with a single space on either side so a
      // future migration can split on " — " with reasonable confidence.
      return `${label} — ${trimmed}`;
    };

    const toCommit: { type: LessonResource["type"]; label: string }[] =
      items.length > 0
        ? items.map((it) => ({
            type: it.type,
            // Prefer the per-item label; the dialog's title only steers
            // the first item so multi-item adds keep their per-file names.
            label: labelWithNote(it.label, it.note),
          }))
        : [{ type: "link", label: title.trim() || "New resource" }];

    // Steering: if a Title was typed AND we have a single captured item,
    // use the title as the label (Padlet behaviour — title = card name).
    // Re-fold the note onto the title so the per-resource note still
    // survives the title-override path.
    if (toCommit.length === 1 && title.trim()) {
      const onlyItem = items[0];
      toCommit[0] = {
        ...toCommit[0],
        label: labelWithNote(title.trim(), onlyItem?.note),
      };
    }

    if (destSectionId) {
      // Section route — one addSectionResource per item.
      for (const r of toCommit) {
        addSectionResource(destLessonId, destSectionId, r.type, r.label);
      }
    } else {
      // Whole-lesson route — merge into lesson.resources via editLesson.
      const newResources: LessonResource[] = toCommit.map((r) => ({
        type: r.type,
        label: r.label,
      }));
      editLesson(destLessonId, {
        resources: [...destLesson.resources, ...newResources],
      });
    }

    // Report back to the caller (the Resources panel uses this to register
    // photo-stacks). Picks the predominant type — when items are uniform
    // (the only path that produces a stack) it'll be that type; mixed
    // batches still report SOMETHING reasonable.
    if (onCommitted) {
      const headType = toCommit[0]?.type ?? "link";
      onCommitted({
        lessonId: destLessonId,
        sectionId: destSectionId,
        count: toCommit.length,
        type: headType,
      });
    }

    onClose();
  }, [
    canAdd,
    items,
    title,
    lessonId,
    sectionId,
    getLesson,
    lesson,
    addSectionResource,
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
        title="Add a resource dialog — capture links, files, videos, and docs, then pick which lesson and section to attach them to"
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
            Add a resource
          </span>
          <Button
            variant="primary"
            size="sm"
            className={styles.addBtn}
            tooltip="Attach every captured resource to the chosen lesson section — the resources appear in the lesson flow"
            onClick={handleAdd}
            disabled={!canAdd}
          >
            Add
          </Button>
        </header>

        {/* ── Main composer body OR the "All tools" expanded grid ───── */}
        {/* The dialog has two states: the standard composer (title +
            4-tile grid + body + chips + routing) and the AllToolsMenu
            sub-view (Padlet-style 3-column tool grid). The top bar
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
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Resource title"
            />

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
            palette (Lesson Padlet, YouTube, Camera, etc.) without
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

            {/* ── Body textarea ──────────────────────────────────────────── */}
            <textarea
              className={styles.bodyArea}
              placeholder="Write something to describe the resource…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              aria-label="Resource description"
              rows={3}
            />

            {/* ── Captured items strip + paste status ────────────────────── */}
            {/* Each chip is a button — tapping it opens a small textarea
            below the strip where the teacher writes a note for THAT
            resource (Padlet's "post caption" affordance). Clicking the
            same chip again closes the note editor. The note saves on
            blur to keep keystrokes off the items-array. */}
            {(items.length > 0 || pastedStatus) && (
              <div className={styles.capturedWrap}>
                {items.length > 0 && (
                  <ul
                    className={styles.capturedStrip}
                    aria-label="Captured items"
                  >
                    {items.map((item) => {
                      const noteOpen = noteOpenId === item.id;
                      const hasNote = (item.note ?? "").trim().length > 0;
                      return (
                        <li
                          key={item.id}
                          className={`${styles.capturedChip} ${
                            noteOpen ? styles.capturedChipActive : ""
                          }`}
                        >
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
                        </li>
                      );
                    })}
                  </ul>
                )}

                {/* The note editor for the currently-open chip. Sits BELOW
                the strip so a single editor handles all chips (saves
                vertical space and keeps the chip row scannable). */}
                {noteOpenId &&
                  items.find((c) => c.id === noteOpenId) &&
                  (() => {
                    const item = items.find((c) => c.id === noteOpenId)!;
                    return (
                      <div
                        className={styles.noteEditor}
                        role="group"
                        aria-label={`Note for ${item.label}`}
                      >
                        <label
                          className={styles.noteEditorLabel}
                          htmlFor={`note-${item.id}`}
                        >
                          Note for <strong>{item.label}</strong>
                        </label>
                        <textarea
                          id={`note-${item.id}`}
                          className={styles.noteArea}
                          placeholder="Write a note for this resource…"
                          // Uncontrolled-ish: we save on blur via setItemNote
                          // so the strip doesn't re-render per keystroke.
                          // Defaulting to the stored note keeps the editor
                          // hydrated when the teacher re-opens the chip.
                          defaultValue={item.note ?? ""}
                          onBlur={(e) => setItemNote(item.id, e.target.value)}
                          rows={2}
                          aria-label={`Note text for ${item.label}`}
                        />
                        <p className={styles.noteHint}>
                          Saved when you click away. The note will appear next
                          to the resource label.
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
                  disabled={lockRouting}
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
                  disabled={lockRouting || unitOptions.length === 0}
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
                  disabled={lockRouting || lessonOptions.length === 0}
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
                  disabled={lockRouting}
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
