"use client";

// ResourcesPanel.tsx — the redesigned Resources panel (Daily/Weekly right rail).
//
// 6.12.26 Resource & Notecard Redesign §1
// (Documents/Claude Design/6.12.26 …/resource_redesign/surface-panel.jsx, with
// rn.css as the authoritative measurements). The panel is a white card:
//
//   • Header — "Resources" + count chip (the FULL deduped count, stable
//     across tabs) + add button (opens the composer) + a list/grid segmented
//     control + collapse chevron (or an × in drawer presentation). All icon
//     buttons are 32px with always-on ≥44px hit inflation (rn-44).
//   • Pill tabs — All · Files · Links · Media · Notes, each with a per-tab
//     count. Notecards roll up in All AND Notes; every other tab excludes
//     them. Files = pdf/doc/slides/uploads · Links = website/link ·
//     Media = image/youtube/video/audio.
//   • "New notecard" — a first-class dashed entry row (P6) directly under
//     the tabs; opens the composer in notecard mode routed to this lesson.
//   • Grid mode — a 2-column tile grid (74px thumb + footer). A notecard
//     renders as a TILE FACE with the same footprint as a plain tile (P3):
//     honey-50 thumb (poster when one exists), white NOTE glyph pill
//     bottom-left, dark gallery-count pill bottom-right.
//   • List mode — 44px rows: 30px type-tinted icon tile, label, type tag,
//     hover-revealed ⋯. The notecard row carries the honey wash + count.
//   • Overflow menu — Open · Enlarge · Add/edit note · ─ · Remove from
//     lesson (danger, `required` tooltip). 188px, --shadow-popover,
//     keyboard-operable (mirrors ResourceCardFace's CardMenu pattern).
//
// ── Dedup (P1 — sections are canonical) ──────────────────────────────────
// The rendered list is `dedupeLessonResources({ sectionResources,
// lessonResources })` from lib/resources-dedup: section resources first, in
// section order, then lesson-level rows minus any whose CONTENT IDENTITY a
// section already owns. Each rendered entry keeps its PROVENANCE (lesson +
// section, or whole-lesson index) so edit-note / remove route back to the
// exact store row. Week mode applies the same merge across every lesson in
// the week with one shared identity set.
//
// ── Thumbnails (P5 — never a broken frame) ───────────────────────────────
// Every thumb renders through a fallback chain: a safe poster/thumbnail
// <img> (onError → demote) → the type-tinted glyph fill (rn.css th-*) → the
// designed link-card mini-face built from the URL/label. NEVER an iframe
// inside a tile. Legacy fixture rows with no url render the glyph or the
// label-derived link face — the old synthetic-URL fabrication is gone.
//
// ── Chrome rules (CLAUDE.md §4 / BUILD_STANDARD §3) ─────────────────────
// Tailwind = layout only; all color / radii / type via tokens (zero hex —
// the youtube tint uses color-mix over var(--youtube) per rn.css). The panel
// chrome stays neutral; subject color arrives only via the parent rail's
// cp-subj cascade where tiles want it.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { Lesson, LessonResource } from "@/lib/types";
import type { SectionResource } from "@/lib/lesson-flow";
import { ResourcePreview } from "@/components/resources";
import { galleryCount, isNotecard, notecardPoster } from "@/lib/notecards";
import { isSafeImgSrc } from "@/lib/resource-embed";
import { dedupeLessonResources, resourceIdentity } from "@/lib/resources-dedup";
import { usePlanner } from "@/lib/planner-store";
import { lessonResourceRefs } from "@/lib/lesson-resources";
import { useLessonBoards } from "@/lib/teach/use-lesson-boards";
import {
  boardResourceHref,
  boardResourceId,
  boardToTeachResource,
} from "@/lib/teach/boardToResource";
import { useUndoToastOptional } from "@/lib/undo-toast";
import { DRAG_MOTION } from "@/lib/collapse-on-drag";
import { Button, Tooltip } from "@/components/ui";
import type { PanelDragHandleProps } from "./RightRail";
import {
  ResourceComposer,
  fileToCapturedItem,
  type CapturedItem,
  type ResourceComposerEditTarget,
} from "./ResourceComposer";
import { OpenInBoardDialog } from "@/components/boards";
import styles from "./ResourcesPanel.module.css";

// ── Icons — Lucide-family 24×24, ~2px stroke (rn-shared.jsx vocabulary) ────

const STROKE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function PlusIcon(): ReactNode {
  return (
    <svg {...STROKE} strokeWidth={2.4}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function DotsIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function GridIcon(): ReactNode {
  return (
    <svg {...STROKE}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function ListIcon(): ReactNode {
  return (
    <svg {...STROKE}>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}

function ChevronToggleIcon({ collapsed }: { collapsed: boolean }): ReactNode {
  return (
    <svg
      {...STROKE}
      strokeWidth={2.2}
      style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function CloseIcon(): ReactNode {
  return (
    <svg {...STROKE} strokeWidth={2.4}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function BackIcon(): ReactNode {
  return (
    <svg {...STROKE} strokeWidth={2.4}>
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function GripVerticalIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

function PlayIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  );
}

function NoteCardIcon(): ReactNode {
  return (
    <svg {...STROKE}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M7 9h10M7 13h7" />
    </svg>
  );
}

function NotePenIcon(): ReactNode {
  return (
    <svg {...STROKE}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function OpenIcon(): ReactNode {
  return (
    <svg {...STROKE}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6M10 14L21 3" />
    </svg>
  );
}

function EnlargeIcon(): ReactNode {
  return (
    <svg {...STROKE} strokeWidth={2.2}>
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

function TrashIcon(): ReactNode {
  return (
    <svg {...STROKE}>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
    </svg>
  );
}

/** Per-type glyph used by the thumb fill, the list-row icon tile, and the
 *  tile-footer icon. `play` swaps the youtube logo for the play triangle —
 *  the artboards use the triangle on stage fills and the logo in footers. */
function TypeGlyph({
  type,
  play = false,
}: {
  type: LessonResource["type"];
  play?: boolean;
}): ReactNode {
  switch (type) {
    case "slides":
      return (
        <svg {...STROKE}>
          <rect x="3" y="4" width="18" height="13" rx="2" />
          <path d="M12 17v4M8 21h8" />
        </svg>
      );
    case "pdf":
      return (
        <svg {...STROKE}>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
        </svg>
      );
    case "doc":
      return (
        <svg {...STROKE}>
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h6" />
        </svg>
      );
    case "image":
      return (
        <svg {...STROKE}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="M21 16l-5-5-8 8" />
        </svg>
      );
    case "youtube":
      return play ? (
        <PlayIcon />
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21.6 7.2a2.7 2.7 0 0 0-1.9-1.9C18 4.8 12 4.8 12 4.8s-6 0-7.7.5a2.7 2.7 0 0 0-1.9 1.9A28 28 0 0 0 2 12a28 28 0 0 0 .4 4.8 2.7 2.7 0 0 0 1.9 1.9c1.7.5 7.7.5 7.7.5s6 0 7.7-.5a2.7 2.7 0 0 0 1.9-1.9A28 28 0 0 0 22 12a28 28 0 0 0-.4-4.8zM10 15.2V8.8L15.2 12z" />
        </svg>
      );
    case "notecard":
      return <NoteCardIcon />;
    case "website":
      return (
        <svg {...STROKE}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    case "link":
    default:
      return (
        <svg {...STROKE}>
          <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
          <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
        </svg>
      );
  }
}

// ── Tabs — All · Files · Links · Media · Notes ─────────────────────────────

type PanelTab = "all" | "files" | "links" | "media" | "notes";
type PanelCategory = Exclude<PanelTab, "all">;

const TABS: ReadonlyArray<{ key: PanelTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "files", label: "Files" },
  { key: "links", label: "Links" },
  { key: "media", label: "Media" },
  { key: "notes", label: "Notes" },
];

/**
 * Which tab a resource rolls up under (besides All).
 *   Notes — notecards (they ALSO appear in All; never in Files/Links/Media).
 *   Media — images, youtube/vimeo, raw video/audio.
 *   Files — pdf / doc / slides, plus uploads (rows carrying a mime type or a
 *           blob:/hosted same-origin url) that aren't media.
 *   Links — websites + generic links (everything else).
 */
function categoryOf(r: LessonResource): PanelCategory {
  if (isNotecard(r)) return "notes";
  if (r.type === "image" || r.type === "youtube") return "media";
  const p = r.provider;
  if (
    p === "image" ||
    p === "video" ||
    p === "audio" ||
    p === "youtube" ||
    p === "vimeo"
  ) {
    return "media";
  }
  if (r.type === "pdf" || r.type === "doc" || r.type === "slides") {
    return "files";
  }
  if (p === "pdf" || p === "gdocs" || p === "gsheets" || p === "gslides") {
    return "files";
  }
  // Uploads — a mime type or a session-blob / same-origin hosted url marks a
  // file row even when its legacy `type` is the generic "link".
  if (r.mimeType) return "files";
  if (r.url && (r.url.startsWith("blob:") || /^\/(?![/\\])/.test(r.url))) {
    return "files";
  }
  return "links";
}

/** Uppercase footer/row tag (artboard vocabulary). */
function typeTagFor(type: LessonResource["type"]): string {
  switch (type) {
    case "notecard":
      return "NOTE";
    case "website":
    case "link":
      return "LINK";
    default:
      // slides → SLIDES, pdf → PDF, doc → DOC, image → IMAGE, youtube → YOUTUBE
      return type.toUpperCase();
  }
}

/** True for rows that should read as video (play glyph on the stage). */
function isVideoLike(r: LessonResource): boolean {
  return (
    r.type === "youtube" ||
    r.provider === "youtube" ||
    r.provider === "vimeo" ||
    r.provider === "video"
  );
}

/** rn.css `th-*` type-tinted fill for a resource's stage / row icon. */
function thClassFor(r: LessonResource): string {
  if (r.provider === "video" || r.provider === "audio") return styles.thVideo!;
  switch (r.type) {
    case "slides":
      return styles.thSlides!;
    case "pdf":
      return styles.thPdf!;
    case "doc":
      return styles.thDoc!;
    case "image":
      return styles.thImage!;
    case "youtube":
      return styles.thYoutube!;
    case "notecard":
      return styles.thNote!;
    case "website":
    case "link":
    default:
      return styles.thLink!;
  }
}

// ── Link-face helpers (local mirrors of the §0 card's, which are not exported
// from ResourceCardFace) ─────────────────────────────────────────────────────
// <img src> safety uses the shared isSafeImgSrc (lib/resource-embed) — the one
// sink gate every surface vets through.

const TAG_TOKENS = [
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "indigo",
  "purple",
  "pink",
  "gray",
] as const;

/** Deterministic pick from the 10 `--tag-*` tokens — always a token, never
 *  a raw hex (mirrors ResourceCardFace's tagColorFor). */
function tagColorFor(seed: string): string {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  return `var(--tag-${TAG_TOKENS[sum % TAG_TOKENS.length]})`;
}

/** Hostname minus "www.", or null when the URL doesn't parse. */
function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** First alphanumeric character, uppercased — the initial-tile glyph. */
function initialOf(text: string): string {
  const ch = text.replace(/[^a-z0-9]/gi, "")[0] ?? text[0] ?? "?";
  return ch.toUpperCase();
}

/** The designed link-card mini-face — the chain's terminal stage. Renders
 *  from the domain when the URL parses, from the label otherwise, so
 *  SOMETHING designed always paints (P5). */
function LinkMiniFace({ resource }: { resource: LessonResource }): ReactNode {
  const domain = resource.url ? domainOf(resource.url) : null;
  const display = domain ?? resource.label ?? "resource";
  return (
    <span className={styles.linkFace}>
      <span
        className={styles.linkInitial}
        style={{ background: tagColorFor(display) }}
        aria-hidden="true"
      >
        {initialOf(display)}
      </span>
      <span className={styles.linkDomain}>{display}</span>
    </span>
  );
}

// ── Tile thumb — the P5 fallback chain ──────────────────────────────────────

/** 74px stage: safe <img> (onError → demote) → type-tinted glyph fill →
 *  designed link mini-face. Never an iframe. */
function TileThumb({ resource }: { resource: LessonResource }): ReactNode {
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());

  // The failure set describes specific srcs — when the row's srcs change
  // (teacher fixed a link, a thumbnail landed) retry instead of staying
  // demoted until remount.
  useEffect(() => {
    setFailed(new Set());
  }, [resource.thumbnailUrl, resource.url]);

  const markFailed = useCallback((src: string): void => {
    setFailed((prev) => new Set(prev).add(src));
  }, []);

  // Stage-1 candidates, in order: explicit thumbnail, then (for image rows)
  // the image itself.
  const candidates: string[] = [];
  if (isSafeImgSrc(resource.thumbnailUrl))
    candidates.push(resource.thumbnailUrl);
  if (
    (resource.type === "image" || resource.provider === "image") &&
    isSafeImgSrc(resource.url)
  ) {
    candidates.push(resource.url);
  }
  const src = candidates.find((c) => !failed.has(c));

  const video = isVideoLike(resource);
  const tint = thClassFor(resource);

  if (video) {
    // Video stage — tint + play glyph; the poster sits behind when it loads.
    // A failed poster keeps the stage (it is already a designed face).
    return (
      <span className={`${styles.thumb} ${tint}`}>
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={styles.thumbImg}
            src={src}
            alt=""
            loading="lazy"
            onError={() => markFailed(src)}
          />
        )}
        <span className={styles.playBadge}>
          <PlayIcon />
        </span>
      </span>
    );
  }

  if (src) {
    return (
      <span className={`${styles.thumb} ${tint}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.thumbImg}
          src={src}
          alt=""
          loading="lazy"
          onError={() => markFailed(src)}
        />
      </span>
    );
  }

  // Stage 2/3 — typed rows get the tinted glyph; link-ish rows get the
  // designed mini link-card face on the amber pair.
  if (resource.type === "website" || resource.type === "link") {
    return (
      <span className={`${styles.thumb} ${tint}`}>
        <LinkMiniFace resource={resource} />
      </span>
    );
  }
  return (
    <span className={`${styles.thumb} ${tint}`}>
      <TypeGlyph type={resource.type} play />
    </span>
  );
}

// ── Aggregation — deduped list + provenance ────────────────────────────────

/** A deduped resource paired with the PROVENANCE needed to route edit-note /
 *  remove back to its store row. */
interface AggregatedResource {
  resource: LessonResource;
  /** Stable React key — the section resource id, or a synthesized
   *  `lesson:<id>:res:<i>` for a whole-lesson row. */
  key: string;
  lessonId: string;
  /** Owning section id, or null for a whole-lesson (Lesson.resources) row. */
  sectionId: string | null;
  /** Index into Lesson.resources for a whole-lesson row. */
  lessonResourceIndex?: number;
}

// ── Overflow menu (rn-menu) — portaled, keyboard-operable ───────────────────
// Mirrors ResourceCardFace's CardMenu pattern (the §0 gate): focus moves to
// the first item on open; ArrowUp/Down/Home/End rove; Tab closes and returns
// focus; Esc closes with stopPropagation; outside-click / scroll / resize
// dismiss; the trigger's mousedown is exempt so its own click can toggle.

interface TileMenuProps {
  /** Viewport anchor — x is the menu's right edge, y its top. */
  anchor: { x: number; y: number };
  /** The ⋯ trigger — exempt from outside-click close + focus return target. */
  ignoreRef: RefObject<HTMLButtonElement | null>;
  /** Notecard menus reword: Open card / Enlarge poster / Edit card. */
  notecard: boolean;
  /** Render "Open" only when there is a real target. */
  canOpen: boolean;
  onOpen: () => void;
  onEnlarge: () => void;
  onOpenInBoard: () => void;
  onEditNote: () => void;
  onRemove: () => void;
  onClose: () => void;
}

function TileMenu({
  anchor,
  ignoreRef,
  notecard,
  canOpen,
  onOpen,
  onEnlarge,
  onOpenInBoard,
  onEditNote,
  onRemove,
  onClose,
}: TileMenuProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: anchor.x, y: anchor.y });

  // Clamp inside the viewport once measured (context-menu idiom).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const nx = Math.min(anchor.x - width, window.innerWidth - width - 8);
    const ny = Math.min(anchor.y, window.innerHeight - height - 8);
    setPos({ x: Math.max(8, nx), y: Math.max(8, ny) });
  }, [anchor]);

  // Outside-click / Esc-fallback / scroll / resize dismissal.
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const t = e.target as Node;
      if (
        ref.current &&
        !ref.current.contains(t) &&
        !ignoreRef.current?.contains(t)
      ) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    const onDetach = (): void => onClose();
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onDetach, true);
    window.addEventListener("resize", onDetach);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onDetach, true);
      window.removeEventListener("resize", onDetach);
    };
  }, [onClose, ignoreRef]);

  // Focus the first item on open — the menu is portaled, so without this a
  // keyboard user could never reach it. preventScroll: the scroll listener
  // above closes the menu, so a focus-induced scroll would self-dismiss.
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus({ preventScroll: true });
  }, []);

  // WAI-ARIA menu keyboard pattern (mirrors CardMenu).
  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Escape") {
      // The same keypress must not also close a parent dialog/lightbox.
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === "Tab") {
      // A menu is not a tab-stop sequence: Tab dismisses, focus returns to
      // the trigger (onClose does the focusing).
      e.preventDefault();
      onClose();
      return;
    }
    if (
      e.key !== "ArrowDown" &&
      e.key !== "ArrowUp" &&
      e.key !== "Home" &&
      e.key !== "End"
    ) {
      return;
    }
    e.preventDefault();
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : e.key === "ArrowDown"
            ? idx < 0
              ? 0
              : (idx + 1) % items.length
            : idx <= 0
              ? items.length - 1
              : idx - 1;
    items[next]?.focus();
  };

  const fire = (action: () => void): void => {
    action();
    onClose();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Resource actions"
      className={styles.menu}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onMenuKeyDown}
      style={{
        position: "fixed",
        top: pos.y,
        left: pos.x,
        zIndex: "var(--z-menu)",
      }}
    >
      {canOpen && (
        <button
          type="button"
          role="menuitem"
          className={styles.menuItem}
          onClick={() => fire(onOpen)}
        >
          <OpenIcon /> {notecard ? "Open card" : "Open"}
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        onClick={() => fire(onEnlarge)}
      >
        <EnlargeIcon /> {notecard ? "Enlarge poster" : "Enlarge"}
      </button>
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        onClick={() => fire(onOpenInBoard)}
      >
        <BoardGlyphIcon /> Open in board
      </button>
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        onClick={() => fire(onEditNote)}
      >
        <NotePenIcon /> {notecard ? "Edit card" : "Add / edit note"}
      </button>
      <div role="separator" className={styles.menuSep} />
      <Tooltip
        content="Remove this resource from the lesson — the underlying file or link is not deleted, only unlinked here"
        required
      >
        <button
          type="button"
          role="menuitem"
          className={`${styles.menuItem} ${styles.menuItemDanger}`}
          onClick={() => fire(onRemove)}
        >
          <TrashIcon /> Remove from lesson
        </button>
      </Tooltip>
    </div>
  );
}

/** The ⋯ trigger + its portaled menu. `buttonClassName` picks the tile
 *  (.tileMore) or row (.rowMore) chrome — both hover-revealed with a −9px
 *  hit inflation. */
function MoreMenuButton({
  agg,
  buttonClassName,
  onOpen,
  onEnlarge,
  onOpenInBoard,
  onEditNote,
  onRemove,
}: {
  agg: AggregatedResource;
  buttonClassName: string;
  onOpen: () => void;
  onEnlarge: () => void;
  onOpenInBoard: () => void;
  onEditNote: () => void;
  onRemove: () => void;
}): ReactNode {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const label = agg.resource.label || agg.resource.type;
  const notecard = isNotecard(agg.resource);
  const canOpen = notecard || Boolean(agg.resource.url);

  const toggle = (e: ReactMouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    if (anchor) {
      setAnchor(null);
      return;
    }
    triggerRef.current = e.currentTarget;
    const rect = e.currentTarget.getBoundingClientRect();
    setAnchor({ x: rect.right, y: rect.bottom + 4 });
  };

  const close = useCallback((): void => {
    setAnchor(null);
    // Focus returns to the ⋯ so keyboard users keep their place.
    triggerRef.current?.focus();
  }, []);

  return (
    <>
      <Tooltip
        content={`Actions for "${label}" — open, enlarge, add a note, or remove it from this lesson`}
        tooltipId="resources.panel.tile-more"
      >
        <button
          type="button"
          className={buttonClassName}
          aria-label={`Actions for ${label}`}
          aria-haspopup="menu"
          aria-expanded={anchor !== null}
          onClick={toggle}
        >
          <DotsIcon />
        </button>
      </Tooltip>
      {anchor &&
        createPortal(
          <TileMenu
            anchor={anchor}
            ignoreRef={triggerRef}
            notecard={notecard}
            canOpen={canOpen}
            onOpen={onOpen}
            onEnlarge={onEnlarge}
            onOpenInBoard={onOpenInBoard}
            onEditNote={onEditNote}
            onRemove={onRemove}
            onClose={close}
          />,
          document.body,
        )}
    </>
  );
}

// ── Grid tiles ──────────────────────────────────────────────────────────────

interface TileActions {
  onActivate: (agg: AggregatedResource) => void;
  onOpen: (agg: AggregatedResource) => void;
  onOpenInBoard: (agg: AggregatedResource) => void;
  onEditNote: (agg: AggregatedResource) => void;
  onRemove: (agg: AggregatedResource) => void;
}

/** Plain resource tile — 74px thumb stage + footer (13px icon · label · tag). */
function ResourceTileFace({
  agg,
  actions,
}: {
  agg: AggregatedResource;
  actions: TileActions;
}): ReactNode {
  const r = agg.resource;
  const label = r.label || r.type;
  return (
    <div className={styles.tile}>
      <button
        type="button"
        className={styles.tileBody}
        onClick={() => actions.onActivate(agg)}
        aria-label={`Enlarge ${label}`}
        title={`${typeTagFor(r.type)} — ${label}`}
      >
        <TileThumb resource={r} />
        <span className={styles.tileFoot}>
          <span className={styles.tileFootIcon} aria-hidden="true">
            <TypeGlyph type={r.type} />
          </span>
          <span className={styles.tileLabel}>{label}</span>
          <span className={styles.typeTag}>{typeTagFor(r.type)}</span>
        </span>
      </button>
      <MoreMenuButton
        agg={agg}
        buttonClassName={styles.tileMore!}
        onOpen={() => actions.onOpen(agg)}
        onEnlarge={() => actions.onActivate(agg)}
        onOpenInBoard={() => actions.onOpenInBoard(agg)}
        onEditNote={() => actions.onEditNote(agg)}
        onRemove={() => actions.onRemove(agg)}
      />
    </div>
  );
}

/** Notecard tile face — identical footprint to a plain tile (P3): honey-50
 *  thumb (poster when present), white NOTE glyph pill bottom-left, dark
 *  gallery-count pill bottom-right. Click = fullscreen split view (via the
 *  shared ResourcePreview, which routes notecards there). */
function NotecardTileFace({
  agg,
  actions,
}: {
  agg: AggregatedResource;
  actions: TileActions;
}): ReactNode {
  const r = agg.resource;
  const label = r.label || "Notecard";
  const poster = notecardPoster(r);
  const count = galleryCount(r);

  // Poster face inside the honey stage: safe img → poster's type-tinted
  // glyph → honey notecard glyph (notes-only card). Same P5 chain.
  const posterSrc = poster
    ? isSafeImgSrc(poster.thumbnailUrl)
      ? poster.thumbnailUrl
      : (poster.type === "image" || poster.provider === "image") &&
          isSafeImgSrc(poster.url)
        ? poster.url
        : undefined
    : undefined;
  const [posterFailed, setPosterFailed] = useState(false);
  useEffect(() => setPosterFailed(false), [posterSrc]);

  return (
    <div className={`${styles.tile} ${styles.noteFace}`}>
      <button
        type="button"
        className={styles.tileBody}
        onClick={() => actions.onActivate(agg)}
        aria-label={`Open notecard ${label}`}
        title={`NOTE — ${label}`}
      >
        <span className={styles.thumb}>
          {posterSrc && !posterFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.thumbImg}
              src={posterSrc}
              alt=""
              loading="lazy"
              onError={() => setPosterFailed(true)}
            />
          ) : poster ? (
            <span
              className={`${styles.notePoster} ${thClassFor(poster)}`}
              aria-hidden="true"
            >
              <TypeGlyph type={poster.type} play />
            </span>
          ) : (
            <span className={styles.noteFallbackGlyph} aria-hidden="true">
              <NoteCardIcon />
            </span>
          )}
          <span className={styles.noteGlyph} aria-hidden="true">
            <NotePenIcon /> NOTES
          </span>
          {count > 0 && (
            <span
              className={styles.galleryCt}
              aria-label={`${count} gallery item${count === 1 ? "" : "s"}`}
            >
              {count}
            </span>
          )}
        </span>
        <span className={styles.tileFoot}>
          <span
            className={`${styles.tileFootIcon} ${styles.tileFootIconNote}`}
            aria-hidden="true"
          >
            <NoteCardIcon />
          </span>
          <span className={styles.tileLabel}>{label}</span>
          <span className={styles.typeTag}>NOTE</span>
        </span>
      </button>
      <MoreMenuButton
        agg={agg}
        buttonClassName={styles.tileMore!}
        onOpen={() => actions.onActivate(agg)}
        onEnlarge={() => actions.onActivate(agg)}
        onOpenInBoard={() => actions.onOpenInBoard(agg)}
        onEditNote={() => actions.onEditNote(agg)}
        onRemove={() => actions.onRemove(agg)}
      />
    </div>
  );
}

// ── List rows (rn-row) ─────────────────────────────────────────────────────

function ResourceListRow({
  agg,
  actions,
}: {
  agg: AggregatedResource;
  actions: TileActions;
}): ReactNode {
  const r = agg.resource;
  const notecard = isNotecard(r);
  const label = r.label || (notecard ? "Notecard" : r.type);
  const count = notecard ? galleryCount(r) : 0;
  return (
    <li className={`${styles.row} ${notecard ? styles.rowNote : ""}`}>
      <button
        type="button"
        className={styles.rowMain}
        onClick={() => actions.onActivate(agg)}
        aria-label={notecard ? `Open notecard ${label}` : `Enlarge ${label}`}
        title={`${typeTagFor(r.type)} — ${label}`}
      >
        <span
          className={`${styles.rowIc} ${
            notecard ? styles.rowIcNote : thClassFor(r)
          }`}
          aria-hidden="true"
        >
          {notecard ? <NoteCardIcon /> : <TypeGlyph type={r.type} play />}
        </span>
        <span className={styles.rowLabel}>{label}</span>
      </button>
      {count > 0 && (
        <span
          className={`${styles.galleryCt} ${styles.galleryCtStatic}`}
          aria-label={`${count} gallery item${count === 1 ? "" : "s"}`}
        >
          {count}
        </span>
      )}
      <span className={styles.typeTag}>{typeTagFor(r.type)}</span>
      <MoreMenuButton
        agg={agg}
        buttonClassName={styles.rowMore!}
        onOpen={() => actions.onOpen(agg)}
        onEnlarge={() => actions.onActivate(agg)}
        onOpenInBoard={() => actions.onOpenInBoard(agg)}
        onEditNote={() => actions.onEditNote(agg)}
        onRemove={() => actions.onRemove(agg)}
      />
    </li>
  );
}

// ── Board-as-resource tiles/rows (Wave 4 #9) ───────────────────────────────
// A learning board surfaced AS a resource. Boards have no url/gallery/note, so
// they render through DEDICATED components — never the file-resource tile/row +
// kebab machinery above — keeping that path untouched. Their single action is
// "Open board": the whole tile/row is the trigger (no overflow menu).

function BoardGlyphIcon(): ReactNode {
  // Mirrors the nav + Teach-panel board glyph: a canvas frame, a tile, lines.
  return (
    <svg {...STROKE} strokeWidth={1.9}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <rect x="6" y="7" width="5" height="5" rx="1" />
      <path d="M14 7.5h4M14 11h4M6 15.5h12" />
    </svg>
  );
}

/** Grid tile for a board-resource row — same footprint as a plain tile. */
function BoardTileFace({
  agg,
  onOpenBoard,
}: {
  agg: AggregatedResource;
  onOpenBoard: (boardId: string) => void;
}): ReactNode {
  const r = agg.resource;
  const label = r.label || "Board";
  const boardId = r.boardId;
  if (boardId == null) return null;
  return (
    <div className={styles.tile}>
      <button
        type="button"
        className={styles.tileBody}
        onClick={() => onOpenBoard(boardId)}
        aria-label={`Open board ${label}`}
        title={`BOARD — ${label}. Open it in the board editor.`}
      >
        <span className={`${styles.thumb} ${styles.thLink ?? ""}`} aria-hidden="true">
          <BoardGlyphIcon />
        </span>
        <span className={styles.tileFoot}>
          <span className={styles.tileFootIcon} aria-hidden="true">
            <BoardGlyphIcon />
          </span>
          <span className={styles.tileLabel}>{label}</span>
          <span className={styles.typeTag}>BOARD</span>
        </span>
      </button>
    </div>
  );
}

/** List row for a board-resource row. */
function BoardListRow({
  agg,
  onOpenBoard,
}: {
  agg: AggregatedResource;
  onOpenBoard: (boardId: string) => void;
}): ReactNode {
  const r = agg.resource;
  const label = r.label || "Board";
  const boardId = r.boardId;
  if (boardId == null) return null;
  return (
    <li className={styles.row}>
      <button
        type="button"
        className={styles.rowMain}
        onClick={() => onOpenBoard(boardId)}
        aria-label={`Open board ${label}`}
        title={`BOARD — ${label}. Open it in the board editor.`}
      >
        <span className={`${styles.rowIc} ${styles.thLink ?? ""}`} aria-hidden="true">
          <BoardGlyphIcon />
        </span>
        <span className={styles.rowLabel}>{label}</span>
      </button>
      <span className={styles.typeTag}>BOARD</span>
    </li>
  );
}

// ── View-mode persistence (per teacher) ────────────────────────────────────

type ViewMode = "grid" | "list";
const VIEW_MODE_KEY = "mycurricula:resources-panel-view";

function readViewMode(): ViewMode {
  if (typeof window === "undefined") return "grid";
  try {
    const raw = window.localStorage.getItem(VIEW_MODE_KEY);
    if (raw === "grid" || raw === "list") return raw;
  } catch {
    // localStorage unavailable — use default.
  }
  return "grid";
}

function writeViewMode(mode: ViewMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // Storage full / unavailable — preference simply won't persist.
  }
}

// ── Props ───────────────────────────────────────────────────────────────────

interface ResourcesPanelProps {
  /** The currently-selected lesson, or null. Drives aggregation in day
   *  mode; ignored in week mode (the panel aggregates `lessons` instead). */
  lesson: Lesson | null;
  /** Whether the panel BODY (tabs + content) is collapsed to its header. */
  collapsed?: boolean;
  /** Flip the collapsed state — rendered as the header chevron. */
  onToggleCollapsed?: () => void;
  /** dnd-kit wiring supplied by <RightRail>. The grip is the SOLE drag
   *  activator for panel reorder within the rail. */
  dragHandleProps?: PanelDragHandleProps;
  /** Aggregation scope — "day" (default) combines the selected lesson's
   *  seams; "week" merges across every lesson in `lessons`. */
  mode?: "day" | "week";
  /** Lessons to aggregate across in week mode. */
  lessons?: Lesson[];
  /** Active week — labels the week-mode aria contexts. */
  week?: number;
  /** "Back to week" affordance — rendered only when supplied AND the panel
   *  is lesson-scoped (Weekly view's selected-card scope). */
  onClearLesson?: () => void;
  /** Drawer presentation: renders an × close button in the header (in place
   *  of the collapse chevron) and drops the standalone card chrome. Supplied
   *  by <ResourcesDrawer> below. */
  onCloseDrawer?: () => void;
  /** Drawer presentation only: notified whenever the panel's composer opens
   *  or closes. <ResourcesDrawer> uses this to hide its own slide-in panel
   *  while the composer sheet is up, so the composer (portaled to <body> at
   *  the same z-band as the drawer) isn't occluded by the right-docked drawer
   *  (§UXR FIX 3). The panel stays MOUNTED — we only hide the drawer chrome —
   *  so the composer it renders is never torn down. */
  onComposerOpenChange?: (open: boolean) => void;
}

// ── ResourcesPanel ──────────────────────────────────────────────────────────

export function ResourcesPanel({
  lesson,
  collapsed = false,
  onToggleCollapsed,
  dragHandleProps,
  mode = "day",
  lessons,
  week,
  onClearLesson,
  onCloseDrawer,
  onComposerOpenChange,
}: ResourcesPanelProps): ReactNode {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<PanelTab>("all");
  // SSR-safe persisted view mode: default for the server render, the saved
  // choice loaded post-mount (same hydration idiom as RightRail).
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const hydratedRef = useRef(false);
  useEffect(() => {
    setViewMode(readViewMode());
    hydratedRef.current = true;
  }, []);
  const selectViewMode = useCallback((m: ViewMode): void => {
    setViewMode(m);
    if (hydratedRef.current) writeViewMode(m);
  }, []);

  // The resource open in the shared click-to-enlarge modal (notecards route
  // to the fullscreen split view inside ResourcePreview).
  const [previewResource, setPreviewResource] = useState<LessonResource | null>(
    null,
  );
  // The card queued for "Open in board" (#11) — drives the ask-each-time dialog.
  const [openInBoardTarget, setOpenInBoardTarget] =
    useState<AggregatedResource | null>(null);

  // ── Composer + drag-drop state ─────────────────────────────────────────
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<"resource" | "notecard">(
    "resource",
  );
  const [pendingItems, setPendingItems] = useState<CapturedItem[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  // When set, the composer opens in "add/edit notes on THIS resource" mode.
  const [editTarget, setEditTarget] =
    useState<ResourceComposerEditTarget | null>(null);

  // Routing default: the selected lesson, else the week's first lesson.
  const composerLesson: Lesson | null = lesson ?? lessons?.[0] ?? null;

  // §UXR FIX 3 — tell the drawer host whenever the composer opens/closes so it
  // can hide its slide-in panel while the composer sheet is up (the composer
  // portals to <body> at the same z-band as the drawer, so a visible drawer
  // would occlude the sheet's right edge at ≤960px). Inline (desktop)
  // mounts pass no handler, so this is a no-op there.
  useEffect(() => {
    onComposerOpenChange?.(composerOpen);
  }, [composerOpen, onComposerOpenChange]);

  const openComposer = useCallback((): void => {
    setEditTarget(null);
    setComposerMode("resource");
    setComposerOpen(true);
  }, []);

  // The "New notecard" entry (P6) — same composer seam, notecard mode.
  const openNotecardComposer = useCallback((): void => {
    setEditTarget(null);
    setComposerMode("notecard");
    setComposerOpen(true);
  }, []);

  const closeComposer = useCallback((): void => {
    setComposerOpen(false);
    setComposerMode("resource");
    setPendingItems([]);
    setEditTarget(null);
  }, []);

  // KNOWN EDGE (§4a M1 mirror — documented, intentionally not changed):
  // like removal, "Add / edit note" conceptually targets the CONTENT
  // identity, but the edit routes to ONE store row (the rendered one). When
  // the same resource exists in a section AND the lesson-level array, the
  // shadowed duplicate's note is untouched — and for url-less rows a note
  // edit can even SPLIT identity (tier-3 identity hashes the body), so the
  // pair un-merges and both rows paint. Cascading edits across seams is a
  // store-level concern, deferred with the split-identity follow-up; the
  // removal cascade in removeResource is the model when it lands.
  const openNoteEditor = useCallback((agg: AggregatedResource): void => {
    setPendingItems([]);
    setComposerMode("notecard");
    setEditTarget({
      lessonId: agg.lessonId,
      sectionId: agg.sectionId,
      resourceId: agg.key,
      lessonResourceIndex: agg.lessonResourceIndex,
      resource: agg.resource,
    });
    setComposerOpen(true);
  }, []);

  // ── Multi-file drag-drop onto the panel (drop-to-add) ─────────────────
  const handleDragOver = useCallback((e: ReactDragEvent<HTMLElement>): void => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(
    (e: ReactDragEvent<HTMLElement>): void => {
      const next = e.relatedTarget as Node | null;
      if (next && e.currentTarget.contains(next)) return;
      setIsDragOver(false);
    },
    [],
  );

  const handleDrop = useCallback(
    (e: ReactDragEvent<HTMLElement>): void => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      setIsDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0 || composerLesson === null) return;
      setPendingItems(files.map((f) => fileToCapturedItem(f)));
      setComposerMode("resource");
      setEditTarget(null);
      setComposerOpen(true);
    },
    [composerLesson],
  );

  // ── Store wiring ───────────────────────────────────────────────────────
  const {
    getSections,
    getLesson,
    removeSectionResource,
    setSections,
    editLesson,
  } = usePlanner();
  const toast = useUndoToastOptional();

  // ── Aggregation — dedupeLessonResources (P1) + provenance ──────────────
  // Day mode: one lesson's two seams merged by content identity, sections
  // canonical. Week mode: the same merge per lesson, with one shared
  // identity set across the week so a resource reused in two lessons still
  // paints once.
  const combined = useMemo<AggregatedResource[]>(() => {
    function appendLesson(
      l: Lesson,
      seen: Set<string>,
      out: AggregatedResource[],
    ): void {
      const refs = lessonResourceRefs(getSections(l.id));
      // Provenance by object reference — dedupeLessonResources returns the
      // SAME row objects it was handed, so a reference map recovers each
      // surviving row's home without re-deriving identity.
      const provenance = new Map<LessonResource, AggregatedResource>();
      for (const ref of refs) {
        if (!provenance.has(ref.resource)) {
          provenance.set(ref.resource, {
            resource: ref.resource,
            key: ref.resource.id,
            lessonId: l.id,
            sectionId: ref.sectionId,
          });
        }
      }
      l.resources.forEach((r, i) => {
        if (!provenance.has(r)) {
          provenance.set(r, {
            resource: r,
            key: `lesson:${l.id}:res:${i}`,
            lessonId: l.id,
            sectionId: null,
            lessonResourceIndex: i,
          });
        }
      });
      const deduped = dedupeLessonResources({
        sectionResources: refs.map((ref) => ref.resource),
        lessonResources: l.resources,
      });
      for (const r of deduped) {
        const identity = resourceIdentity(r);
        if (seen.has(identity)) continue; // cross-lesson guard (week mode)
        seen.add(identity);
        const agg = provenance.get(r);
        if (agg) out.push(agg);
      }
    }

    const seen = new Set<string>();
    const out: AggregatedResource[] = [];
    if (mode === "week") {
      for (const l of lessons ?? []) appendLesson(l, seen, out);
      return out;
    }
    if (!lesson) return [];
    appendLesson(lesson, seen, out);
    return out;
  }, [mode, lesson, lessons, getSections]);

  // ── Boards-as-resources (Wave 4 #9) ─────────────────────────────────────
  // A lesson's learning boards count as resources. DAY mode only — week mode
  // would fan a board fetch out across every lesson; the daily lesson panel is
  // the must-have surface. `useLessonBoards` is a pure read (no auto-seed), so
  // it's safe to fire on mere lesson view. Board rows render through dedicated
  // Board* components and live in the All tab only (categoryOf never sees them).
  const lessonBoards = useLessonBoards(
    mode === "day" ? (lesson?.id ?? null) : null,
  );
  const boardAggs = useMemo<AggregatedResource[]>(() => {
    if (mode !== "day" || !lesson) return [];
    return lessonBoards.map((b) => ({
      resource: boardToTeachResource(b),
      key: boardResourceId(b.id),
      lessonId: lesson.id,
      sectionId: null,
    }));
  }, [mode, lesson, lessonBoards]);
  // The All-tab list = file/notecard resources, then board rows.
  const allItems = useMemo<AggregatedResource[]>(
    () => (boardAggs.length ? [...combined, ...boardAggs] : combined),
    [combined, boardAggs],
  );

  // Per-tab counts over the DEDUPED list. The header chip is the stable
  // "all" total; tab counts phrase the pills.
  const tabCounts = useMemo<Record<PanelTab, number>>(() => {
    const counts: Record<PanelTab, number> = {
      // Boards count toward All only — they roll up under no file category.
      all: allItems.length,
      files: 0,
      links: 0,
      media: 0,
      notes: 0,
    };
    for (const agg of combined) counts[categoryOf(agg.resource)] += 1;
    return counts;
  }, [combined, allItems]);

  const visibleResources = useMemo<AggregatedResource[]>(
    () =>
      activeTab === "all"
        ? allItems
        : combined.filter((agg) => categoryOf(agg.resource) === activeTab),
    [combined, allItems, activeTab],
  );

  const totalCount = allItems.length;
  const visibleCount = visibleResources.length;

  // ── Tile / row actions ─────────────────────────────────────────────────

  const activateResource = useCallback((agg: AggregatedResource): void => {
    setPreviewResource(agg.resource);
  }, []);

  // Open a board-resource row in the board editor (Wave 4 #9). A lesson-bound
  // board keeps its lesson in the URL; the editor resolves the board by id.
  const openBoard = useCallback(
    (boardId: string): void => {
      router.push(boardResourceHref(boardId, lesson?.id ?? null));
    },
    [router, lesson],
  );

  // "Open in board" (#11) — queue the card; the dialog asks new-vs-existing.
  const openInBoard = useCallback((agg: AggregatedResource): void => {
    setOpenInBoardTarget(agg);
  }, []);

  // "Open" — the resource's real target in a new tab; notecards (and rows
  // with no url) open the preview instead. Never a fabricated URL (the old
  // synthUrl() approach is deleted).
  const openResource = useCallback((agg: AggregatedResource): void => {
    const url = agg.resource.url;
    if (!isNotecard(agg.resource) && url && /^https?:\/\//i.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setPreviewResource(agg.resource);
  }, []);

  // "Remove from lesson" — no confirm dialog (CLAUDE.md §6); an undo toast
  // restores the rows instead.
  //
  // ── Identity cascade (§4a M1) ───────────────────────────────────────────
  // The panel renders the DEDUPED list, so one visible row can shadow
  // duplicates in the other seam (a section row hides an identical
  // lesson-level row, or vice versa). Removing only the rendered row would
  // make the shadowed duplicate immediately resurface — "Remove" would look
  // like a no-op to the teacher. So removal cascades: EVERY store row whose
  // resourceIdentity() matches the aggregated row's is deleted, across BOTH
  // seams — each matching section row via removeSectionResource, and all
  // matching lesson-level rows via ONE editLesson splice.
  //
  // The captured `agg.lessonResourceIndex` is deliberately NOT trusted here
  // (§4a Low 2): the store may have shifted under the memoized aggregation
  // (another panel removed a row, an undo replayed). Instead, BOTH seams are
  // re-scanned by identity against the CURRENT store at click time; if
  // nothing matches anymore the click is a silent no-op and no toast fires —
  // there is nothing to undo.
  //
  // Undo restores ALL removed rows at their ORIGINAL positions from a
  // snapshot captured before removal ({sectionId, index, resource} per
  // section row; {index, resource} per lesson row). Section rows restore
  // positionally via setSections (the only positional section verb — and the
  // persist-robust one, see planner-store's setSections rationale); lesson
  // rows via one editLesson with ascending-index splices.
  const removeResource = useCallback(
    (agg: AggregatedResource): void => {
      const label = agg.resource.label || agg.resource.type;
      const identity = resourceIdentity(agg.resource);
      const { lessonId } = agg;

      // ── Snapshot every matching row, both seams, before removing ──────
      const sectionRows: {
        sectionId: string;
        index: number;
        resource: SectionResource;
      }[] = [];
      for (const section of getSections(lessonId)) {
        section.resources.forEach((resource, index) => {
          if (resourceIdentity(resource) === identity) {
            sectionRows.push({ sectionId: section.id, index, resource });
          }
        });
      }
      const current = getLesson(lessonId);
      const lessonRows: { index: number; resource: LessonResource }[] = [];
      current?.resources.forEach((resource, index) => {
        if (resourceIdentity(resource) === identity) {
          lessonRows.push({ index, resource });
        }
      });

      // Stale aggregation — the row is already gone from both seams.
      // No-op, and no toast: there is nothing to undo (Low 2).
      if (sectionRows.length === 0 && lessonRows.length === 0) return;

      // ── Remove — per-row through the section seam, one splice for the
      // lesson-level array ───────────────────────────────────────────────
      for (const row of sectionRows) {
        removeSectionResource(lessonId, row.sectionId, row.resource.id);
      }
      if (lessonRows.length > 0 && current) {
        const drop = new Set(lessonRows.map((row) => row.index));
        editLesson(lessonId, {
          resources: current.resources.filter((_, i) => !drop.has(i)),
        });
      }

      toast?.showUndoToast({
        message: `Removed "${label}" from the lesson`,
        onUndo: () => {
          // Section rows — re-insert each at its captured index (§4a Low 3:
          // the old undo appended at the end, losing the teacher's order).
          // A section deleted since removal is SILENTLY skipped — restoring
          // a row into a section that no longer exists has no sensible home,
          // and resurrecting the section itself would undo more than the
          // teacher asked. (Kept from the previous behavior, now explicit.)
          if (sectionRows.length > 0) {
            const bySection = new Map<string, typeof sectionRows>();
            for (const row of sectionRows) {
              const list = bySection.get(row.sectionId) ?? [];
              list.push(row);
              bySection.set(row.sectionId, list);
            }
            let touched = false;
            const next = getSections(lessonId).map((section) => {
              const rows = bySection.get(section.id);
              if (!rows) return section;
              touched = true;
              const resources = [...section.resources];
              // Ascending-index splices reconstruct the original order even
              // when several rows left the same section.
              for (const row of [...rows].sort((a, b) => a.index - b.index)) {
                resources.splice(Math.min(row.index, resources.length), 0, {
                  ...row.resource,
                });
              }
              return { ...section, resources };
            });
            if (touched) setSections(lessonId, next);
          }
          // Lesson-level rows — one editLesson, positional splices.
          if (lessonRows.length > 0) {
            const latest = getLesson(lessonId);
            if (latest) {
              const restored = [...latest.resources];
              for (const row of [...lessonRows].sort(
                (a, b) => a.index - b.index,
              )) {
                restored.splice(
                  Math.min(row.index, restored.length),
                  0,
                  row.resource,
                );
              }
              editLesson(lessonId, { resources: restored });
            }
          }
        },
      });
    },
    [
      getSections,
      getLesson,
      removeSectionResource,
      setSections,
      editLesson,
      toast,
    ],
  );

  const tileActions: TileActions = useMemo(
    () => ({
      onActivate: activateResource,
      onOpen: openResource,
      onOpenInBoard: openInBoard,
      onEditNote: openNoteEditor,
      onRemove: removeResource,
    }),
    [activateResource, openResource, openInBoard, openNoteEditor, removeResource],
  );

  // ── Collapse animation (reduced-motion safe) ───────────────────────────
  const reducedMotion = useReducedMotion() ?? false;
  const collapseTransition = reducedMotion
    ? DRAG_MOTION.reduced
    : DRAG_MOTION.collapse;

  // ── Empty-state helpers ────────────────────────────────────────────────
  const isWeek = mode === "week";
  const hasContext = isWeek ? (lessons?.length ?? 0) > 0 : lesson !== null;
  const emptyContextCopy = isWeek
    ? "No lessons in this week yet."
    : "Select a lesson to see resources.";
  const emptyAllCopy = isWeek
    ? "No resources in this week."
    : "No resources on this lesson.";
  const emptyScope = isWeek ? "in this week" : "on this lesson";
  const activeTabLabel =
    TABS.find((t) => t.key === activeTab)?.label.toLowerCase() ?? "resources";

  // ── Collapsible body content ───────────────────────────────────────────
  const bodyContent = (
    <>
      {/* Pill tabs — hidden with no context; the empty line below carries
          the whole message in that case. */}
      {hasContext && (
        <div
          className={styles.tabs}
          role="tablist"
          aria-label="Resource category"
        >
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
              className={`${styles.tab} ${
                activeTab === tab.key ? styles.tabOn : ""
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              <span className={styles.tabCount}>{tabCounts[tab.key]}</span>
            </button>
          ))}
        </div>
      )}

      {/* "New notecard" — first-class entry (P6), composer in notecard mode. */}
      {hasContext && composerLesson && (
        <Tooltip
          content="Create a notecard — formatted notes plus a flip-through media gallery — attached to this lesson"
          tooltipId="resources.panel.new-notecard"
          side="bottom"
        >
          <button
            type="button"
            className={styles.newNote}
            onClick={openNotecardComposer}
            aria-haspopup="dialog"
          >
            <span className={styles.newNoteIc} aria-hidden="true">
              <NoteCardIcon />
            </span>
            New notecard
            <span className={styles.newNotePlus} aria-hidden="true">
              <PlusIcon />
            </span>
          </button>
        </Tooltip>
      )}

      {/* Body — grid, list, or an empty-state line. */}
      <div className={styles.scroll}>
        {!hasContext ? (
          <p className={styles.empty}>{emptyContextCopy}</p>
        ) : totalCount === 0 ? (
          <p className={styles.empty}>{emptyAllCopy}</p>
        ) : visibleCount === 0 ? (
          <p className={styles.empty}>
            No {activeTabLabel} {emptyScope}.
          </p>
        ) : viewMode === "grid" ? (
          <div className={styles.grid}>
            {visibleResources.map((agg) =>
              agg.resource.boardId != null ? (
                <BoardTileFace
                  key={agg.key}
                  agg={agg}
                  onOpenBoard={openBoard}
                />
              ) : isNotecard(agg.resource) ? (
                <NotecardTileFace
                  key={agg.key}
                  agg={agg}
                  actions={tileActions}
                />
              ) : (
                <ResourceTileFace
                  key={agg.key}
                  agg={agg}
                  actions={tileActions}
                />
              ),
            )}
          </div>
        ) : (
          <ul className={styles.list}>
            {visibleResources.map((agg) =>
              agg.resource.boardId != null ? (
                <BoardListRow
                  key={agg.key}
                  agg={agg}
                  onOpenBoard={openBoard}
                />
              ) : (
                <ResourceListRow
                  key={agg.key}
                  agg={agg}
                  actions={tileActions}
                />
              ),
            )}
          </ul>
        )}
      </div>
    </>
  );

  return (
    <section
      className={[
        styles.panel,
        isDragOver ? styles.panelDragOver : "",
        onCloseDrawer ? styles.panelInDrawer : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={
        isWeek
          ? typeof week === "number"
            ? `Resources for week ${week}`
            : "Week resources"
          : lesson !== null
            ? `Resources for ${lesson.title}`
            : "Lesson resources"
      }
      title="Resources panel — every link, file, video, doc, and notecard attached to the current lesson (or the whole week when no lesson is selected); drag files in to attach"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ── Header: grip? · back? · title · count · + · seg · chevron/× ── */}
      <header className={styles.head}>
        {dragHandleProps && (
          <Tooltip
            content="Drag to reorder the Resources panel within the right rail."
            side="bottom"
          >
            <button
              type="button"
              ref={dragHandleProps.ref}
              {...(dragHandleProps.attributes ?? {})}
              {...(dragHandleProps.listeners ?? {})}
              className={styles.gripBtn}
              aria-label={dragHandleProps.label ?? "Drag to reorder Resources"}
              title="Drag to reorder the Resources panel"
            >
              <GripVerticalIcon />
            </button>
          </Tooltip>
        )}
        {/* "Back to week" — only when the Weekly view pinned a lesson scope. */}
        {!isWeek && lesson !== null && onClearLesson && (
          <Button
            variant="icon"
            size="sm"
            iconAriaLabel="Back to week resources"
            className={styles.iconBtn}
            onClick={onClearLesson}
            tooltip="Return to the week-wide resources view (un-pins the current lesson scope)"
          >
            <BackIcon />
          </Button>
        )}
        <Tooltip
          content="Everything attached to this lesson — slides, handouts, videos, links, and notecards. Drag files in to attach more."
          side="bottom"
          tooltipId="resources.panel.title"
        >
          <h3
            className={styles.title}
            title={
              !isWeek && lesson !== null
                ? `Resources for ${lesson.title}`
                : "Resources panel — attached links, files, videos, docs, and notecards"
            }
            tabIndex={0}
          >
            Resources
          </h3>
        </Tooltip>
        {hasContext && (
          <span
            className={styles.countChip}
            aria-label={`${totalCount} resources`}
          >
            {totalCount}
          </span>
        )}
        <div className={styles.headActions}>
          {composerLesson && (
            <Button
              variant="icon"
              size="sm"
              iconAriaLabel="Add resources to this lesson"
              className={styles.iconBtn}
              onClick={openComposer}
              aria-haspopup="dialog"
              aria-expanded={composerOpen}
              tooltip="Attach a new link, file, video, or doc to this lesson — opens the resource composer"
            >
              <PlusIcon />
            </Button>
          )}
          {hasContext && (
            <span
              className={styles.segmented}
              role="group"
              aria-label="Resource view mode"
            >
              <Tooltip content="List view — compact rows, best for scanning many items">
                <button
                  type="button"
                  className={`${styles.segBtn} ${
                    viewMode === "list" ? styles.segBtnOn : ""
                  }`}
                  aria-pressed={viewMode === "list"}
                  aria-label="List view"
                  onClick={() => selectViewMode("list")}
                >
                  <ListIcon />
                </button>
              </Tooltip>
              <Tooltip content="Grid view — visual tiles with thumbnails">
                <button
                  type="button"
                  className={`${styles.segBtn} ${
                    viewMode === "grid" ? styles.segBtnOn : ""
                  }`}
                  aria-pressed={viewMode === "grid"}
                  aria-label="Grid view"
                  onClick={() => selectViewMode("grid")}
                >
                  <GridIcon />
                </button>
              </Tooltip>
            </span>
          )}
          {onCloseDrawer ? (
            <Button
              variant="icon"
              size="sm"
              iconAriaLabel="Close resources drawer"
              className={styles.iconBtn}
              onClick={onCloseDrawer}
              tooltip="Close the resources drawer"
            >
              <CloseIcon />
            </Button>
          ) : (
            onToggleCollapsed && (
              <Button
                variant="icon"
                size="sm"
                iconAriaLabel={
                  collapsed
                    ? "Expand Resources panel"
                    : "Collapse Resources panel"
                }
                className={styles.iconBtn}
                onClick={onToggleCollapsed}
                aria-expanded={!collapsed}
                tooltip={
                  collapsed
                    ? "Expand the Resources panel to see this lesson's materials"
                    : "Collapse the Resources panel — frees up vertical space in the rail"
                }
              >
                <ChevronToggleIcon collapsed={collapsed} />
              </Button>
            )
          )}
        </div>
      </header>

      {/* ── Collapsible body ─────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            key="resources-body"
            style={
              reducedMotion
                ? {
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 0,
                    flex: 1,
                  }
                : {
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 0,
                    flex: 1,
                  }
            }
            initial={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={
              reducedMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }
            }
            exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={collapseTransition}
          >
            {bodyContent}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shared composer — "+" (resource mode), "New notecard" (notecard
          mode), a multi-file drop (pre-captured items), or a tile's
          Add/Edit note (notecard mode + locked edit target). */}
      {(() => {
        const launchLesson = editTarget
          ? (getLesson(editTarget.lessonId) ?? composerLesson)
          : composerLesson;
        if (!launchLesson) return null;
        return (
          <ResourceComposer
            open={composerOpen}
            lesson={launchLesson}
            mode={composerMode}
            editResource={editTarget ?? undefined}
            initialItems={pendingItems.length > 0 ? pendingItems : undefined}
            onClose={closeComposer}
          />
        );
      })()}

      {/* Shared click-to-enlarge modal (notecards route to the fullscreen
          split view inside ResourcePreview). */}
      {previewResource && (
        <ResourcePreview
          resource={previewResource}
          onClose={() => setPreviewResource(null)}
        />
      )}

      {openInBoardTarget && (
        <OpenInBoardDialog
          resource={openInBoardTarget.resource}
          lessonId={openInBoardTarget.lessonId}
          onClose={() => setOpenInBoardTarget(null)}
        />
      )}
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ResourcesDrawer — narrow-viewport drawer presentation (Daily view)
// ════════════════════════════════════════════════════════════════════════════
//
// The Daily right rail folds away at ≤960px (DailyView.module.css), which
// previously left the Resources panel unreachable on tablet/phone. Per the
// §1 drawer artboard, the panel re-surfaces as a right drawer over the view,
// opened from a floating grid-icon trigger in the top-bar area. (The Weekly
// view already has its own host — <WeeklyRailDrawer> wraps the whole rail at
// ≤1280px — so this component is mounted only for the Daily, day-mode rail.)
//
// Chrome mirrors WeeklyRailDrawer/SchedulePanel: portal to <body>, scrim
// click + Esc close, focus trapped inside, focus restored to the trigger on
// close, 250ms slide-in (fade under reduced motion — see the CSS module).

/** Matches the Daily view's rail-fold breakpoint (DailyView.module.css). */
const DAILY_RAIL_FOLD_MQ = "(max-width: 960px)";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ResourcesDrawerProps {
  /** The selected lesson — same prop the inline panel receives. */
  lesson: Lesson | null;
  /** Active week — forwarded to the panel. */
  week?: number;
}

export function ResourcesDrawer({
  lesson,
  week,
}: ResourcesDrawerProps): ReactNode {
  // SSR-safe narrow flag — false on the server; synced post-mount.
  const [narrow, setNarrow] = useState(false);
  const [open, setOpen] = useState(false);
  // §UXR FIX 3 — true while the inner panel's composer sheet is open. We HIDE
  // the slide-in drawer (not unmount it) so the composer, which portals to
  // <body> at the same z-band, is unobstructed. Hiding (vs. closing) keeps
  // the ResourcesPanel — and therefore the composer it renders — mounted.
  const [composerOpen, setComposerOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // §4a Low 6 — in Team-Curriculum ("master") mode the sticky MasterBanner
  // (W3.3: the MasterBanner retired in favor of the [data-mode="team"] pink
  // glow, which adds no vertical chrome — the old editMode-keyed
  // .drawerTriggerBelowBanner offset would now float the trigger mid-content
  // for no reason, so the hook is gone; §4a W3.3 finding #12.)

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(DAILY_RAIL_FOLD_MQ);
    setNarrow(mq.matches);
    const handler = (e: MediaQueryListEvent): void => {
      setNarrow(e.matches);
      if (!e.matches) setOpen(false); // widened past the fold — inline rail is back
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const close = useCallback((): void => {
    setOpen(false);
    // Drop the composer-hidden flag so a fresh open starts with the drawer
    // chrome visible (the inner panel re-reports its composer state on mount).
    setComposerOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Focus moves into the drawer on open (its first focusable — the panel
  // header's first control).
  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLElement>(FOCUSABLE)
      ?.focus({ preventScroll: true });
  }, [open]);

  // Esc closes + Tab/Shift-Tab cycle inside the drawer (focus trap).
  //
  // KNOWN GAP (§4a Low 15): the undo toast is portaled to <body> at z 1200
  // (UndoToast.module.css), OUTSIDE this trap — after "Remove from lesson"
  // a keyboard user inside the open drawer cannot Tab to the toast's Undo
  // button (Ctrl+Z via the planner's global undo still works). Deferred to
  // the app-wide focus-management pass rather than special-casing one trap.
  const onPanelKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [close],
  );

  if (!narrow) return null;

  return createPortal(
    <>
      {/* The trigger stays mounted while the drawer is open (behind the
          scrim) so the focus-restore target is never a detached node. The
          element is captured from the click event rather than a ref prop —
          the Tooltip primitive clones its child and owns the ref slot. */}
      <Tooltip
        content="Open this lesson's resources — links, files, videos, and notecards"
        side="left"
        tooltipId="resources.panel.drawer-trigger"
      >
        <button
          type="button"
          className={styles.drawerTrigger}
          aria-label="Open resources drawer"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={(e) => {
            triggerRef.current = e.currentTarget;
            setOpen(true);
          }}
        >
          <GridIcon />
        </button>
      </Tooltip>
      {open && (
        <>
          {/* Scrim — click closes. aria-hidden: the dialog beside it carries
              the semantics; Esc is the keyboard path. Hidden while the
              composer is up so the composer sheet owns the viewport (§UXR
              FIX 3). */}
          <div
            className={`${styles.drawerScrim} ${
              composerOpen ? styles.drawerHidden : ""
            }`}
            aria-hidden="true"
            onClick={close}
          />
          <div
            ref={panelRef}
            className={`${styles.drawerPanel} ${
              composerOpen ? styles.drawerHidden : ""
            }`}
            role="dialog"
            aria-modal="true"
            aria-label="Resources drawer"
            onKeyDown={onPanelKeyDown}
          >
            <ResourcesPanel
              lesson={lesson}
              week={week}
              onCloseDrawer={close}
              onComposerOpenChange={setComposerOpen}
            />
          </div>
        </>
      )}
    </>,
    document.body,
  );
}
