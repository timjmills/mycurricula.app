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
import { isSafeImgSrc } from "@/lib/resource-embed";
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
  /** A note card finished composing / editing — carries the updated item. */
  onCommit: (item: WallItem) => void;
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
  onCommit,
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

  // A phone that inherits an editing card (e.g. a tablet session resized down)
  // must fall back to view-only rather than strand the teacher in an editor.
  useEffect(() => {
    if (readOnly) setEditing(false);
  }, [readOnly]);

  const commit = useCallback((): void => {
    setEditing(false);
    const body = draftRef.current;
    // Nothing changed and nothing was pending — don't churn the wall (an
    // auto-forking preset would fork on a no-op edit).
    if (body === (item.resource.body ?? "") && !item.composing) return;
    onCommit({
      ...item,
      composing: false,
      // The label follows the note's first line, the way the artboard does it,
      // so a note is findable by search without a separate title field.
      label: isNote
        ? stripHtml(body).trim().slice(0, 60) || "Note"
        : item.label,
      resource: { ...item.resource, body },
    });
  }, [item, isNote, onCommit]);

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
  const handleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>): void => {
      if (editing || fromInteractive(e)) return;
      onModal(item);
    },
    [editing, item, onModal],
  );

  const handleDoubleClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>): void => {
      if (readOnly || !isNote || editing || fromInteractive(e)) return;
      setDraft(item.resource.body ?? "");
      setEditing(true);
    },
    [readOnly, isNote, editing, item.resource.body],
  );

  // ── Note editor ───────────────────────────────────────────────────────────
  if (isNote && editing) {
    return (
      <div
        className={`${styles.card} ${styles.note} ${styles.composing}`}
        data-view={view}
        data-kind={kind}
        style={{ "--sc": subject.c } as React.CSSProperties}
        // Swallow clicks so the wall's card-click doesn't fire while typing.
        onClick={(e) => e.stopPropagation()}
      >
        <RichTextEditor
          value={draft}
          onChange={setDraft}
          placeholder="Type a note…"
          ariaLabel={`Note: ${item.label}`}
          autoFocus
        />
        <div className={styles.noteActions}>
          <Button variant="secondary" size="sm" onClick={commit}>
            Done
          </Button>
        </div>
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
      style={{ "--sc": subject.c } as React.CSSProperties}
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
