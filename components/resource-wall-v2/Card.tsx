"use client";

// Card — one resource on the v2 Resource Wall (Wave 9a).
//
// A type-keyed thumbnail + title + meta, draggable between sections, with an
// inline rich-text editor for note cards. Four sizes (med / large / icon /
// list) drive layout only — every size renders the same information, so a card
// never hides a fact just because the teacher shrank the wall.
//
// ── SECURITY: one audited URL sink ─────────────────────────────────────────
// Every image src goes through `isSafeImgSrc` (lib/resource-embed) — THE shared
// gate (http(s)/blob/same-origin-root-relative/base64-data-image; rejects
// javascript:, data:text/html, protocol-relative "//host", and tab/newline
// smuggling). There is no file-local URL check anywhere here, and no URL is
// ever interpolated into CSS: the artboard painted backgrounds with
// `url('${value}')` (resource-wall.jsx:201), which lets a crafted value close
// the quote and inject arbitrary CSS. We render an <img> element instead, so
// the value is data, never code.
//
// NO SHARE BUTTON. The artboard's modal bar carries one (resource-wall.jsx:542)
// backed by a forgeable client-side token and a fake viewer. Sharing is Wave 9b
// (deferred by the owner); a stub here would imply a guarantee we can't keep.
//
// ── Notes are RICH TEXT, and stay that way ─────────────────────────────────
// A note card's content is `resource.body` — sanitized HTML. Editing runs
// through the canonical `RichTextEditor` (sanitizes on read AND on emit via
// DOMPurify); the card FACE renders `stripHtml(body)` as a clamped text
// preview. That is deliberate: a plain <textarea> would flatten stored markup
// (data loss), and `dangerouslySetInnerHTML` is banned — a text preview needs
// neither.
//
// ── Phones are view-only (locked product decision) ─────────────────────────
// `readOnly` suppresses every edit/drag/compose affordance. The WALL owns the
// `usePhoneViewport()` call and passes the result down, rather than each card
// registering its own matchMedia listener (a 50-card wall = 50 listeners).

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { fromInteractive } from "@/components/planner-v2/util";
import { RichTextEditor } from "@/components/rich-text";
import { Button, Tooltip } from "@/components/ui";
import { stripHtml } from "@/lib/html-text";
import { useSubjectColor } from "@/lib/palette";
import {
  isSafeImgSrc,
  isAttachableUrl,
  linkToLessonResource,
} from "@/lib/resource-embed";
import {
  CARD_WASH_TINTS,
  CARD_WASH_NAMES,
  cardWashValue,
  type CardWash,
} from "@/lib/card-wash";
import type { LessonResource } from "@/lib/types";
import {
  wallTypeOf,
  type WallItem,
  type WallType,
  type WallView,
} from "@/lib/wall-scope";
import styles from "./Card.module.css";

/**
 * The drag-and-drop MIME type carrying a card's `key`. Section.tsx reads the
 * same string for its section-level drop, so a card can be dropped onto a
 * section (append) or onto another card (insert before).
 */
export const WALL_CARD_DND_TYPE = "text/card";

/**
 * How long a single click on an EDITABLE note waits to see whether a second
 * one is coming before it opens the preview lightbox.
 *
 * Click #1 of a double-click reaches `onClick` before `dblclick` is dispatched,
 * so opening the preview lightbox there put a modal ON TOP of the composer the
 * double-click was opening — the teacher saw a preview and no editor, and the
 * only edit affordance on the card looked broken (live QA 2026-08-02, bug 2).
 * 250ms stays under the ~300ms at which a delay starts to feel like lag.
 *
 * THIS NUMBER IS NOT THE SAFETY MECHANISM, and must never be treated as one
 * (§4a gate, 2026-08-07, Medium; task #9). It is a heuristic, and it is NOT the
 * platform's threshold: Windows and macOS both default their double-click
 * interval to ~500ms, so a teacher who clicks slowly has this timer fire first
 * and then lands the second click — re-creating the exact defect the window
 * exists to prevent. `cancelPendingClick()` cannot help there; by then there is
 * no pending timer left to cancel.
 *
 * So the window is only an OPTIMISATION — it means a normal, quick double-click
 * never flashes a lightbox at all. Correctness comes from `onCloseModal`, which
 * `handleDoubleClick` calls unconditionally: whatever the timing, a
 * double-click ends with the preview shut and the composer up. Raising this to
 * 500ms was rejected (it makes every single click on a note feel sluggish to
 * buy the tail); dropping it to zero was rejected too (the preview would then
 * flash open and shut on every single note edit, which is the more visible of
 * the two costs). The third path in — the hover bar's explicit Edit button —
 * depends on no timing at all.
 */
const DOUBLE_CLICK_WINDOW_MS = 250;

// ── Type-keyed glyphs ───────────────────────────────────────────────────────
//
// Keyed by the WallType FAMILY (lib/wall-scope's `wallTypeOf`), not the raw
// resource type, so `slides` and `doc` share one document glyph and every
// family has exactly one. Color rides `--kind-c`, set per family in the CSS
// module from tokens — never a literal here.

const GLYPHS: Record<WallType, ReactNode> = {
  note: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M7 9h10M7 13h7" />
    </svg>
  ),
  worksheet: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  image: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M21 16l-5-5-8 8" />
    </svg>
  ),
  doc: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  ),
  video: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  ),
  link: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </svg>
  ),
};

/** Short uppercase family word under the title. */
const KIND_WORD: Record<WallType, string> = {
  note: "NOTE",
  worksheet: "PDF",
  image: "IMAGE",
  doc: "DOC",
  video: "VIDEO",
  link: "LINK",
};

const IconOpen = (): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <path d="M15 3h6v6M10 14L21 3" />
  </svg>
);
const IconPlay = (): ReactNode => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);
const IconEnlarge = (): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7" />
  </svg>
);
const IconPencil = (): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);
const IconBoard = (): ReactNode => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M12 17v4M8 21h8" />
  </svg>
);

// ── Poster resolution (the ONE image sink) ──────────────────────────────────

/**
 * The card's thumbnail source, or null when there is nothing safe to show.
 * Prefers an explicit `thumbnailUrl` (OG image / YouTube poster / generated
 * WebP), falling back to the file itself for an image row. `isSafeImgSrc` is
 * the shared gate — a rejected or absent URL yields the type glyph, which is
 * always a safe render.
 */
function posterFor(item: WallItem): string | null {
  const { thumbnailUrl, url, type } = item.resource;
  const candidate = thumbnailUrl ?? (type === "image" ? url : undefined);
  return isSafeImgSrc(candidate) ? candidate : null;
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface CardProps {
  item: WallItem;
  view: WallView;
  /** The section this card currently lives in — the drop target's identity. */
  sectionId: string;
  /** Phone — every edit / drag / compose affordance is suppressed (view-only). */
  readOnly: boolean;
  /** A card drag is in flight anywhere on the wall → shrink to a mini card so
   *  more drop targets fit on screen. */
  dragging: boolean;
  onDragState: (active: boolean) => void;
  /** Insert the dragged card before THIS one. */
  onDropBefore: (
    cardKey: string,
    sectionId: string,
    beforeKey?: string,
  ) => void;
  /** Open the slideshow starting at this card. */
  onOpen: (item: WallItem) => void;
  /** Open this card alone, resizable. */
  onEnlarge: (item: WallItem) => void;
  /** Send to a teaching board. */
  onBoard: (item: WallItem, fromLessonId?: string) => void;
  /** Open the card's detail modal. */
  onModal: (item: WallItem) => void;
  /**
   * Close whatever the lightbox is currently showing.
   *
   * REQUIRED for the double-click gesture to be safe. The single-click preview
   * is deferred by `DOUBLE_CLICK_WINDOW_MS` so it does not fire under a
   * double-click — but that window is a guess, and a slow double-click beats
   * it. Without a way to put the preview away, the composer mounts underneath
   * it and the teacher sees a modal where their editor should be (§4a gate,
   * Medium; task #9).
   */
  onCloseModal: () => void;
  /** A note card finished composing / editing — carries the updated item. */
  onCommit: (item: WallItem) => void;
  /**
   * The teacher abandoned a note they were composing — remove the card.
   *
   * REQUIRED for Cancel to mean anything. `addInlineNote` inserts the card into
   * the section OPTIMISTICALLY, already open, so "discard" cannot just close the
   * editor: that would leave an empty card sitting on the wall, which is the
   * junk the empty-submit guard exists to prevent. Only fires for a card that
   * was still `composing`; re-editing an existing note and cancelling simply
   * restores the saved body.
   */
  onDiscard: (cardKey: string) => void;
}

/**
 * Is this string a link the composer will actually attach?
 *
 * Re-exported from `lib/resource-embed`, which owns the rule and enforces it at
 * the persistence boundary too. It lives there rather than here because a UI
 * guard protects only the callsite that has one, and this value ends up in a
 * stored `LessonResource.url` (§4a review, Medium).
 *
 * Named here for the composer's tests: the controlled fields cannot be typed
 * into under the linkedom mount harness (React's change path never fires there),
 * so the rule is proven directly and the field that carries it is proven live.
 */
export { isAttachableUrl as isAttachableLink };

/**
 * Did the teacher change the note's link?
 *
 * A BEFORE/AFTER COMPARISON, not a presence test. `next === null` reads
 * identically for "the teacher removed the saved link" and "this note never had
 * one", so a guard that only asked whether there is something to attach
 * discarded every removal — the composer closed as though it had saved and the
 * link was still there after a reload, with no error (live QA 2026-08-02, bug
 * 1). The label is half of the comparison because renaming a link is an edit.
 *
 * BOTH SIDES GO THROUGH `linkToLessonResource`, which is the part that is easy
 * to get wrong: the composer seeds its name field from the stored label and
 * rebuilds the row on commit, so anything the builder NORMALISES (a blank label
 * becoming the parsed display name) would otherwise register as an edit on a
 * composer nobody touched. That would fork a preset wall on a no-op Done — and,
 * far worse, a future change to the display-name derivation would commit every
 * note with a link the next time it was opened (§4a review, Medium).
 *
 * Exported for the composer's tests: the linkedom mount harness cannot type
 * into a controlled field (see the header of tests/wall-note-composer.test.ts),
 * so the rename case is proven directly on this function, and the field that
 * carries it is proven live.
 */
export function linkEdited(
  saved: LessonResource | undefined,
  next: LessonResource | null,
): boolean {
  const before = saved?.url
    ? linkToLessonResource(saved.url.trim(), saved.label)
    : null;
  return (
    (before?.url ?? null) !== (next?.url ?? null) ||
    (before?.label ?? null) !== (next?.label ?? null)
  );
}

export function Card({
  item,
  view,
  sectionId,
  readOnly,
  dragging,
  onDragState,
  onDropBefore,
  onOpen,
  onEnlarge,
  onBoard,
  onModal,
  onCloseModal,
  onCommit,
  onDiscard,
}: CardProps): ReactNode {
  const kind = wallTypeOf(item.resource);
  const isNote = kind === "note";
  const subject = useSubjectColor(item.subjectId);
  const poster = posterFor(item);

  const [dropOver, setDropOver] = useState(false);
  // A freshly added note opens straight into its editor — but never on a phone
  // (view-only), where there is no way to leave the editor.
  const [editing, setEditing] = useState(Boolean(item.composing) && !readOnly);
  const [draft, setDraft] = useState(item.resource.body ?? "");
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // ── Composer draft state (everything below the text) ──────────────────────
  // Seeded from the resource so RE-editing an existing note shows what it
  // already has, rather than presenting a blank composer over saved content.
  const [wash, setWash] = useState<CardWash>(item.resource.wash ?? null);
  const [swatchesOpen, setSwatchesOpen] = useState(false);
  // Seeded from the note's SAVED attachment, so re-opening the composer shows
  // the link that is already on the card. Without this the fields came up blank
  // over a real attachment, "Remove link" could only clear a fresh draft, and a
  // saved link was uneditable (§4a review, Medium).
  const savedLink = isNote ? item.resource.gallery?.[0] : undefined;
  const [attachOpen, setAttachOpen] = useState(Boolean(savedLink));
  const [attachName, setAttachName] = useState(savedLink?.label ?? "");
  const [attachUrl, setAttachUrl] = useState(savedLink?.url ?? "");
  const composerRef = useRef<HTMLDivElement | null>(null);
  // Stable across server and client renders — a hand-rolled id would differ
  // between the two and break the aria-describedby link on hydration.
  const attachErrId = `${useId()}-attach-error`;

  // The card's title is DERIVED — the note's first line, truncated. Shown live
  // in the composer (`Saves as …`) because a teacher who cannot see the derived
  // title only discovers it after committing, when the card is already on the
  // wall under a name they did not choose.
  const derivedTitle = stripHtml(draft).trim().split("\n")[0]?.slice(0, 60) ?? "";
  // Empty means EMPTY — a note with only markup (`<p></p>`) is not content.
  const hasText = stripHtml(draft).trim().length > 0;
  const attachUrlTrimmed = attachUrl.trim();
  const hasAttachment = attachUrlTrimmed.length > 0;
  // A link is only usable if the shared URL gate accepts it. Checked BEFORE
  // commit so the teacher is told, rather than committing a card whose link
  // silently renders as plain text later.
  const attachInvalid = hasAttachment && !isAttachableUrl(attachUrlTrimmed);
  // The empty-submit guard. Before this, Done on an untouched composer created
  // a card literally labelled "Note".
  const canSave = (hasText || (hasAttachment && !attachInvalid)) && !attachInvalid;

  // A phone that inherits an editing card (e.g. a tablet session resized down)
  // must fall back to view-only rather than strand the teacher in an editor.
  //
  // AND IT MUST TAKE THE CARD WITH IT when the card was still being composed.
  // `addInlineNote` inserts the note optimistically, so a card that never
  // committed exists ONLY as the composer's placeholder; closing the editor and
  // leaving it behind puts an empty card titled "Note" on a shared wall that a
  // phone can then neither edit nor delete (phones are view-only). Seen live at
  // 375px: resizing mid-compose left exactly that.
  useEffect(() => {
    if (!readOnly) return;
    setEditing(false);
    if (item.composing) onDiscard(item.key);
  }, [readOnly, item.composing, item.key, onDiscard]);

  const commit = useCallback((): void => {
    setEditing(false);
    setSwatchesOpen(false);
    const body = draftRef.current;
    const url = attachUrl.trim();
    // `linkToLessonResource` validates and returns null for anything that is not
    // a storable http(s) URL, so this cannot persist a `javascript:` row even if
    // the guard above were bypassed.
    const attachment: LessonResource | null = url
      ? linkToLessonResource(url, attachName)
      : null;
    const washChanged = (item.resource.wash ?? null) !== wash;
    // A BEFORE/AFTER COMPARISON, not a presence test — see `linkEdited` above
    // for why `!attachment` silently discarded every removal, and why both
    // sides have to go through the same builder. Comparing rather than testing
    // also makes the guard STRICTER in the other direction, which is what it is
    // for: re-opening a note that has a link and pressing Done without touching
    // anything used to satisfy `!attachment === false` and commit — forking an
    // auto-forking preset on a no-op, and truncating a legacy multi-entry
    // gallery to its first row on the way past.
    const linkChanged = linkEdited(item.resource.gallery?.[0], attachment);
    // Nothing changed and nothing was pending — don't churn the wall (an
    // auto-forking preset would fork on a no-op edit).
    if (
      body === (item.resource.body ?? "") &&
      !linkChanged &&
      !washChanged &&
      !item.composing
    ) {
      return;
    }
    const label = isNote
      ? stripHtml(body).trim().slice(0, 60) ||
        // A note with no text but a real attachment is named for what it
        // carries. Only a note with NEITHER falls back to "Note", and the
        // empty-submit guard means that can no longer be committed at all.
        attachment?.label ||
        "Note"
      : item.label;
    onCommit({
      ...item,
      composing: false,
      // The label follows the note's first line, the way the artboard does it,
      // so a note is findable by search without a separate title field.
      label,
      resource: {
        ...item.resource,
        body,
        ...(wash === null ? { wash: undefined } : { wash }),
        // `wash` is the model's EXISTING per-card colour field (lib/types.ts,
        // 6.12.26 §0) — not a new one. Cleared to undefined rather than null so
        // the row matches an untouched card exactly.
        // The composer manages ONE link per note — one name + one URL — so the
        // commit REPLACES rather than appends. Appending meant "Remove link"
        // could never actually remove anything, and editing a link left the old
        // one behind beside the new (§4a review, Medium). A note with no link
        // stores no gallery at all, so it matches a note that never had one.
        gallery: attachment ? [attachment] : undefined,
      },
    });
  }, [item, isNote, onCommit, attachUrl, attachName, wash]);

  /**
   * Leave without saving. A card that was still `composing` is REMOVED (it only
   * existed because the teacher pressed "+"); an existing note being re-edited
   * just reverts to its saved body.
   */
  const discard = useCallback((): void => {
    setSwatchesOpen(false);
    setEditing(false);
    if (item.composing) {
      onDiscard(item.key);
      return;
    }
    setDraft(item.resource.body ?? "");
    setWash(item.resource.wash ?? null);
    setAttachOpen(false);
    setAttachName("");
    setAttachUrl("");
  }, [item, onDiscard]);

  /**
   * Escape. It CONFIRMS when there is something to lose and discards only when
   * there is not.
   *
   * The handoff's composer has no discard at all — both exits commit — and the
   * naive fix (Escape always discards) is worse than the bug it replaces: a
   * teacher who has typed a paragraph and taps Escape expecting "close" would
   * lose the paragraph with no undo. So Escape saves a note with content and
   * bins only an empty one, where there is nothing to regret.
   *
   * `stopPropagation` because /post's own key handlers close the wall's
   * overlays on Escape — innermost-first, the rule the lesson editor follows.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if (swatchesOpen) {
        setSwatchesOpen(false);
        return;
      }
      // THE DISCARD DECISION IS ABOUT CONTENT, NOT VALIDITY (§4a review, High).
      // Keying it on `canSave` meant a teacher who wrote a paragraph and then
      // pasted a bad URL lost the paragraph to a single Escape: the invalid
      // link made `canSave` false, and false meant discard. Three outcomes now,
      // and only the empty one throws anything away:
      //   • nothing typed, nothing attached → discard (nothing to lose)
      //   • content, and saveable           → commit
      //   • content, but not saveable yet   → stay open, so it can be fixed
      if (!hasText && !hasAttachment) {
        discard();
        return;
      }
      if (canSave) commit();
    },
    [swatchesOpen, canSave, hasText, hasAttachment, commit, discard],
  );

  // Close the swatch popover on an outside press. mousedown, not click, so a
  // press that starts inside and drags out is not read as a dismissal — the
  // same rule the Week lesson menu follows.
  useEffect(() => {
    if (!swatchesOpen) return;
    const onDown = (e: globalThis.MouseEvent): void => {
      const t = e.target;
      if (t instanceof Node && composerRef.current?.contains(t)) return;
      setSwatchesOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [swatchesOpen]);

  // ── Drag ──────────────────────────────────────────────────────────────────
  const dragProps = readOnly
    ? {}
    : {
        draggable: true,
        onDragStart: (e: ReactDragEvent<HTMLDivElement>): void => {
          e.dataTransfer.setData(WALL_CARD_DND_TYPE, item.key);
          e.dataTransfer.effectAllowed = "move";
          onDragState(true);
        },
        onDragEnd: (): void => {
          setDropOver(false);
          onDragState(false);
        },
        onDragOver: (e: ReactDragEvent<HTMLDivElement>): void => {
          if (!e.dataTransfer.types.includes(WALL_CARD_DND_TYPE)) return;
          e.preventDefault();
          // Stop the SECTION's drop handler from also firing — a drop on a card
          // means "insert before this one", not "append to the section".
          e.stopPropagation();
          if (!dropOver) setDropOver(true);
        },
        onDragLeave: (): void => setDropOver(false),
        onDrop: (e: ReactDragEvent<HTMLDivElement>): void => {
          if (!e.dataTransfer.types.includes(WALL_CARD_DND_TYPE)) return;
          e.preventDefault();
          e.stopPropagation();
          const key = e.dataTransfer.getData(WALL_CARD_DND_TYPE);
          setDropOver(false);
          // Dropping a card on itself is a no-op, not a reorder.
          if (key && key !== item.key) onDropBefore(key, sectionId, item.key);
        },
      };

  // ── Click / dblclick ──────────────────────────────────────────────────────
  // `fromInteractive` guards both: a click on a nested action button must not
  // ALSO open the modal, and dblclick fires even when both clicks landed on a
  // button (its stopPropagation only stops the click events) — the trap
  // planner-v2 documents.
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelPendingClick = useCallback((): void => {
    if (clickTimer.current === null) return;
    clearTimeout(clickTimer.current);
    clickTimer.current = null;
  }, []);
  // A pending timer that fires into an unmounted card would open the lightbox
  // on a wall the teacher has already left.
  useEffect(() => cancelPendingClick, [cancelPendingClick]);

  /**
   * Open the composer on a saved note — the one enter-edit path, shared by
   * double-click and the hover bar's Edit button.
   *
   * RE-SEEDS EVERY COMPOSER FIELD, not just the body. The `useState`
   * initialisers below run once per MOUNT, and the card stays mounted across
   * open → Cancel → open: `discard` cleared the attachment fields, so the
   * reopened composer showed an empty link row over a note that still had a
   * link, and the next save would have deleted it (QA 2026-08-02, minor 4).
   * Seeding here rather than in an effect on `editing` keeps it in the same
   * state batch as `setEditing`, so the composer's FIRST paint is already
   * correct — an effect would paint the stale row for a frame first.
   */
  const enterEdit = useCallback((): void => {
    cancelPendingClick();
    if (readOnly || !isNote) return;
    const link = item.resource.gallery?.[0];
    setDraft(item.resource.body ?? "");
    setWash(item.resource.wash ?? null);
    setAttachOpen(Boolean(link));
    setAttachName(link?.label ?? "");
    setAttachUrl(link?.url ?? "");
    setEditing(true);
  }, [cancelPendingClick, readOnly, isNote, item.resource]);

  const handleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>): void => {
      if (fromInteractive(e)) {
        // AND CANCEL, not just return (§4a review, Medium). A click on a nested
        // action supersedes a lightbox this card queued a moment ago: click the
        // note body, then reach for Play / Enlarge / Send-to-board within the
        // window, and the preview used to pop open on top of the slideshow or
        // the board the teacher had just asked for.
        cancelPendingClick();
        return;
      }
      if (editing) return;
      // `detail` is the click count: 0 is a keyboard / assistive-technology
      // activation, which can never be the first half of a double-click and so
      // opens with no delay at all; ≥2 is the tail of one, already handled by
      // `handleDoubleClick`. Only a card that CAN be double-clicked into an
      // editor pays the wait — every other card opens immediately, as before.
      if (e.detail === 0 || readOnly || !isNote) {
        onModal(item);
        return;
      }
      if (e.detail > 1) return;
      cancelPendingClick();
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        onModal(item);
      }, DOUBLE_CLICK_WINDOW_MS);
    },
    [editing, item, onModal, readOnly, isNote, cancelPendingClick],
  );

  const handleDoubleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>): void => {
      // Unconditionally, and BEFORE the guards: whatever this double-click
      // turns out to mean, the lightbox the first click queued is not it.
      cancelPendingClick();
      if (readOnly || !isNote || editing || fromInteractive(e)) return;
      // AND CLOSE ONE THAT ALREADY OPENED. The window above is a heuristic and
      // cannot be anything else — the platform's own double-click interval is
      // ~500ms on Windows and macOS and is not readable from JS — so a teacher
      // who clicks slowly gets the lightbox at 250ms and then this handler,
      // which would mount the composer UNDER the modal all over again.
      // Cancelling cannot help there: by then there is no timer left. So the
      // card asks the wall to put the preview away, which is the only fix that
      // does not depend on guessing a threshold (§4a gate, Medium; task #9).
      // A no-op when nothing is open — `setLight(null)` over `null` is a
      // bail-out, not a render.
      onCloseModal();
      enterEdit();
    },
    [readOnly, isNote, editing, cancelPendingClick, enterEdit, onCloseModal],
  );

  // ── Note editor ───────────────────────────────────────────────────────────
  if (isNote && editing) {
    return (
      <div
        ref={composerRef}
        className={`${styles.card} ${styles.note} ${styles.composing}`}
        data-view={view}
        data-kind={kind}
        style={
          {
            "--sc": subject.c,
            // Live preview: the card wears the chosen colour WHILE composing,
            // so the swatch is a decision the teacher can see rather than one
            // they discover after saving.
            ...(cardWashValue(wash) ? { "--wash": cardWashValue(wash) } : null),
          } as React.CSSProperties
        }
        // Swallow clicks so the wall's card-click doesn't fire while typing.
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <RichTextEditor
          value={draft}
          onChange={setDraft}
          placeholder="Type a note…"
          ariaLabel={`Note: ${item.label}`}
          autoFocus
        />

        {/* The derived card title, shown before it is committed rather than
            after. `aria-live` so a screen-reader user hears it settle too. */}
        <p className={styles.derived} aria-live="polite">
          {derivedTitle ? (
            <>
              Saves as <span className={styles.derivedName}>{derivedTitle}</span>
            </>
          ) : (
            "Type a note — its first line becomes the card's title."
          )}
        </p>

        {attachOpen && (
          <div className={styles.attach}>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Resource name</span>
              <input
                className={styles.input}
                value={attachName}
                onChange={(e) => setAttachName(e.target.value)}
                placeholder="What is it called?"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Paste link (optional)</span>
              <input
                className={styles.input}
                value={attachUrl}
                onChange={(e) => setAttachUrl(e.target.value)}
                placeholder="https://…"
                inputMode="url"
                aria-invalid={attachInvalid || undefined}
                aria-describedby={attachInvalid ? attachErrId : undefined}
              />
            </label>
            {attachInvalid && (
              <p className={styles.attachError} id={attachErrId} role="alert">
                That doesn’t look like a web address — it needs to start with
                http:// or https://
              </p>
            )}
          </div>
        )}

        <div className={styles.composerBar}>
          <div className={styles.barLeft}>
            {/* Colour trigger. A bare <button>, like the section's own add
                affordance beside it — the CSS is doubled (`.swatchTrigger
                .swatchTrigger`) because `.cp-root button` in tokens.css:1156
                out-specifies any single-class module rule on a <button>. */}
            <Tooltip
              content="Give this card its own colour, so it stands out on the wall"
              tooltipId="wall-note-colour"
            >
              <button
                type="button"
                className={`${styles.swatchTrigger} ${styles.swatchTrigger}`}
                aria-haspopup="true"
                aria-expanded={swatchesOpen}
                aria-label="Card colour"
                style={
                  cardWashValue(wash)
                    ? ({ background: cardWashValue(wash) } as React.CSSProperties)
                    : undefined
                }
                onClick={() => setSwatchesOpen((v) => !v)}
              />
            </Tooltip>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={attachOpen}
              // CLEARS THE FIELDS, not just the disclosure (§4a review, High).
              // Hiding the row while keeping `attachUrl` in state meant a
              // teacher who pressed "Remove link" and then Done still got the
              // link attached — the control did the opposite of its label.
              onClick={() => {
                setAttachOpen((open) => {
                  if (open) {
                    setAttachName("");
                    setAttachUrl("");
                  }
                  return !open;
                });
              }}
              tooltip="Attach a link to this note — a video, a doc, a website"
            >
              {attachOpen ? "Remove link" : "Add link"}
            </Button>
          </div>
          <div className={styles.barRight}>
            <Button variant="ghost" size="sm" onClick={discard}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!canSave}
              onClick={commit}
              // The disabled reason, per §4: a control that is off must say why.
              tooltip={
                canSave
                  ? undefined
                  : "Write something, or add a link, before saving this card"
              }
            >
              Done
            </Button>
          </div>
        </div>

        {swatchesOpen && (
          <div
            className={styles.swatches}
            role="group"
            aria-label="Card colour"
          >
            {/* Same values, same order as the lesson resource card's picker —
                both read lib/card-wash so they cannot drift. */}
            <button
              type="button"
              role="radio"
              aria-checked={wash === null}
              aria-label="Subject colour (default)"
              title="Subject colour (default)"
              className={`${styles.swatch} ${styles.swatch} ${
                styles.swatchSubject
              } ${wash === null ? styles.swatchOn : ""}`}
              onClick={() => setWash(null)}
            />
            <button
              type="button"
              role="radio"
              aria-checked={wash === "paper"}
              aria-label="White"
              title="White"
              className={`${styles.swatch} ${styles.swatch} ${
                styles.swatchPaper
              } ${wash === "paper" ? styles.swatchOn : ""}`}
              onClick={() => setWash("paper")}
            />
            {CARD_WASH_TINTS.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={wash === n}
                aria-label={`Card colour ${CARD_WASH_NAMES[n] ?? n}`}
                title={`Card colour ${CARD_WASH_NAMES[n] ?? n}`}
                className={`${styles.swatch} ${styles.swatch} ${
                  wash === n ? styles.swatchOn : ""
                }`}
                style={{
                  background: `var(--subj-${n}-tint)`,
                  borderColor: `var(--subj-${n})`,
                }}
                onClick={() => setWash(n)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const notePreview = isNote ? stripHtml(item.resource.body ?? "").trim() : "";

  return (
    <div
      className={[
        styles.card,
        isNote ? styles.note : "",
        dragging ? styles.mini : "",
        dropOver ? styles.dropBefore : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-view={view}
      data-kind={kind}
      style={
        {
          "--sc": subject.c,
          // The committed per-card colour. Without this the picker would be a
          // control whose effect vanished the moment the teacher saved — the
          // field was already in the model, but this surface never read it.
          ...(cardWashValue(item.resource.wash ?? null)
            ? { "--wash": cardWashValue(item.resource.wash ?? null) }
            : null),
        } as React.CSSProperties
      }
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      {...dragProps}
    >
      <div className={styles.thumb}>
        {isNote ? (
          <div className={styles.notePreview}>
            {notePreview || (
              <span className={styles.noteEmpty}>Empty note</span>
            )}
          </div>
        ) : poster ? (
          // An <img>, never a CSS `url()` — the value stays data (see header).
          // Raw <img>, not next/image: posters are arbitrary teacher-supplied
          // hosts (+ blob:/data:) that the optimizer can't be configured for —
          // the house pattern in ResourcesPanel / ResourceComposer.
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.poster} src={poster} alt="" loading="lazy" />
        ) : (
          <span className={styles.glyphBig} aria-hidden="true">
            {GLYPHS[kind]}
          </span>
        )}
        <span className={styles.badge} aria-hidden="true">
          {GLYPHS[kind]}
        </span>
      </div>

      <div className={styles.body}>
        <div className={styles.title}>{item.label}</div>
        {/* THE ATTACHED LINK, on the card. Without this a teacher could add a
            link and never see it again — the feature would end at the composer
            (§4a review, Medium). `isSafeImgSrc` is the image gate; for a
            navigable href the rule is the same http(s) one the composer
            enforces, so an unstorable value renders as plain text rather than a
            live link. `stopPropagation` keeps the card's own click (which opens
            the modal) from swallowing it. */}
        {isNote && savedLink?.url && (
          isAttachableUrl(savedLink.url) ? (
            <a
              className={styles.cardLink}
              href={savedLink.url}
              target="_blank"
              rel="noopener noreferrer"
              title={savedLink.url}
              onClick={(e) => e.stopPropagation()}
            >
              <IconOpen />
              <span className={styles.cardLinkText}>{savedLink.label}</span>
            </a>
          ) : (
            <span className={styles.cardLink}>{savedLink.label}</span>
          )
        )}
        {view !== "icon" && (
          <div className={styles.meta}>
            <span className={styles.kind}>{KIND_WORD[kind]}</span>
            <span className={styles.subjectPill}>{item.lessonTitle}</span>
          </div>
        )}
      </div>

      {/* Actions are rendered at EVERY size, including list — the artboard hid
          them in list view behind a single mouse-only row menu, which left
          keyboard users with no way to open a card. They are the keyboard path
          to this card (the card body's click is a pointer affordance). */}
      <div className={styles.actions}>
        {/* EDIT, and only on a note (nothing else here has an editor). Before
            this, double-click was the sole way back into a saved note — an
            invisible affordance, and a broken one: its first click opened the
            preview lightbox over the composer (QA 2026-08-02, bug 2). The
            timing half of that is fixed above; this is the half that lets a
            teacher find the editor at all. */}
        {isNote && !readOnly && (
          <Tooltip
            content="Edit this note — its text, its colour, and the link it carries"
            tooltipId="rw-card-edit"
            side="top"
          >
            <Button
              variant="icon"
              size="sm"
              className={styles.act}
              iconAriaLabel={`Edit ${item.label}`}
              onClick={enterEdit}
            >
              <IconPencil />
            </Button>
          </Tooltip>
        )}
        <Tooltip
          content="Open this resource full-screen"
          tooltipId="rw-card-open"
          side="top"
        >
          <Button
            variant="icon"
            size="sm"
            className={styles.act}
            iconAriaLabel={`Open ${item.label}`}
            onClick={() => onModal(item)}
          >
            <IconOpen />
          </Button>
        </Tooltip>
        <Tooltip
          content="Play this section as a slideshow, starting here"
          tooltipId="rw-card-slideshow"
          side="top"
        >
          <Button
            variant="icon"
            size="sm"
            className={styles.act}
            iconAriaLabel={`Start slideshow at ${item.label}`}
            onClick={() => onOpen(item)}
          >
            <IconPlay />
          </Button>
        </Tooltip>
        <Tooltip
          content="Blow this card up to fill the screen — good for showing the class"
          tooltipId="rw-card-enlarge"
          side="top"
        >
          <Button
            variant="icon"
            size="sm"
            className={styles.act}
            iconAriaLabel={`Enlarge ${item.label}`}
            onClick={() => onEnlarge(item)}
          >
            <IconEnlarge />
          </Button>
        </Tooltip>
        {!readOnly && (
          <Tooltip
            content="Put this resource on a teaching board, ready to project"
            tooltipId="rw-card-board"
            side="top"
          >
            <Button
              variant="icon"
              size="sm"
              className={styles.act}
              iconAriaLabel={`Send ${item.label} to a teaching board`}
              onClick={() => onBoard(item, item.lessonId)}
            >
              <IconBoard />
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
