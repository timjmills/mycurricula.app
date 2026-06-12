"use client";

// components/resources/ResourceCardFace.tsx — the §0 resource card primitive.
//
// The Weekly-card recipe (BUILD_STANDARD §2) applied to a lesson resource, per
// the 6.12.26 design handoff (resource_redesign/card-faces.{css,jsx}). One
// LessonResource renders one of THREE faces:
//   • plain resource   — inset preview frame + optional caption + footer
//   • resource + notes — same + a 3-line clamped notes excerpt + honey flag
//   • notecard         — clamped rich-`body` excerpt with a bottom fade +
//                        "Read more", `notecard` flag + NOTE tag (a gallery
//                        poster, when present, renders above the excerpt)
//
// Subject identity comes through the `.cp-subj.<id>` cascade on the root; the
// teacher's per-card `resource.wash` overrides only the body tint (--wash) —
// the header band + 4px left stripe stay subject-locked.
//
// Preview fallback chain (redesign P5 — "never a broken frame"):
//   1. youtube/vimeo/video    → dark stage + white play circle, with the
//                               thumbnail behind when one loads
//   2. thumbnailUrl           → <img> cover
//   3. image provider/type    → <img src={url}> cover
//   4. pdf/doc/slides, no thumb → type-tinted fill + big type glyph
//   5. everything else        → the DESIGNED link card (initial tile colored
//                               deterministically from the 10 --tag-* tokens,
//                               domain + ellipsized path)
// Any <img> onError demotes down the chain — a non-video image failure lands
// on the link card; a failed video poster keeps the (already designed) stage.
//
// The kebab opens a 216px popover menu (portaled, fixed at the kebab; focus
// moves to the first item on open; ArrowUp/Down/Home/End rove all items;
// Tab / Esc / outside-click / scroll / resize close, focus returned to the
// kebab). Items render only when their callback is provided. The notes
// `body` HTML is sanitized through lib/sanitize-html before
// dangerouslySetInnerHTML (audit #9 — stored XSS). Every <img src> passes
// isSafeImgSrc (mirrors ResourceEmbed's gate + sanitize-html's SAFE_IMG_SRC).
//
// Out of scope here: the lightbox/fullscreen surface (the existing
// ResourcePreview), rail/panel layout, drag, persistence.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import type { LessonResource } from "@/lib/types";
import { hasNotes, isNotecard, notecardPoster } from "@/lib/notecards";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { isSafeImgSrc } from "@/lib/resource-embed";
import { Tooltip } from "@/components/ui";
import styles from "./ResourceCardFace.module.css";

// ── Public API (frozen — the Wave-S rail/panel consumes this exactly) ───────

export interface ResourceCardFaceProps {
  resource: LessonResource;
  /** cp-subj id — rendered as `cp-subj ${subjectId}` on the root. */
  subjectId: string;
  /** Header eyebrow, e.g. "Math · Link" (caller computes). */
  meta: string;
  /** Optional line under the preview. */
  caption?: string;
  /** Card width. Default 248. */
  width?: number | string;
  /** Preview frame height. Default 120 (the rail uses 104). */
  previewHeight?: number;
  /** Click on the preview / "Enlarge" menu item (opens the existing
   *  ResourcePreview lightbox — not this component's scope). */
  onEnlarge?: () => void;
  /** Notecard "Read more" / notes "…more" → fullscreen (not opened here). */
  onReadMore?: () => void;
  /** Menu: "Open original". */
  onOpenOriginal?: () => void;
  /** Menu: "Add / edit note". */
  onEditNote?: () => void;
  /** Menu: "Duplicate". */
  onDuplicate?: () => void;
  /** Menu: "Duplicate to…". */
  onDuplicateTo?: () => void;
  /** Menu: "Card color" swatches. `null` = back to the subject default. */
  onWashChange?: (wash: "paper" | number | null) => void;
  /** Menu: "Remove from lesson" (danger, last, after a separator). */
  onRemove?: () => void;
}

// ── Deterministic tag color (P5 — initial tiles & source pills) ─────────────

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

/** Stable pick from the 10 `--tag-*` token pairs — charCode sum % length.
 *  Always a token, never a raw hex, never a broken image. */
function tagColorFor(seed: string): string {
  let sum = 0;
  for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
  return `var(--tag-${TAG_TOKENS[sum % TAG_TOKENS.length]})`;
}

/** Hostname minus "www.", or null when the URL doesn't parse (fail-safe). */
function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** Pathname (+query) for the link-card's ellipsized second line. */
function pathOf(url: string): string | null {
  try {
    const u = new URL(url);
    const p = `${u.pathname}${u.search}`;
    return p && p !== "/" ? p : null;
  } catch {
    return null;
  }
}

/** First alphanumeric character, uppercased — the initial-tile glyph. */
function initialOf(text: string): string {
  const ch = text.replace(/[^a-z0-9]/gi, "")[0] ?? text[0] ?? "?";
  return ch.toUpperCase();
}

/** Uppercase short word for the footer type tag. */
function typeTagFor(type: LessonResource["type"]): string {
  switch (type) {
    case "notecard":
      return "NOTE";
    case "youtube":
      return "VIDEO";
    case "website":
    case "link":
      return "LINK";
    default:
      // slides → SLIDES, pdf → PDF, doc → DOC, image → IMAGE
      return type.toUpperCase();
  }
}

/** Which type-tinted fill a doc-like resource gets, or null when it isn't
 *  doc-like. pdf + doc → pink pair; slides → blue pair (rn.css `th-*`). */
function docFillFor(media: LessonResource): "pink" | "blue" | null {
  if (media.type === "slides" || media.provider === "gslides") return "blue";
  if (
    media.type === "pdf" ||
    media.type === "doc" ||
    media.provider === "pdf" ||
    media.provider === "gdocs" ||
    media.provider === "gsheets" ||
    media.provider === "gdrive"
  ) {
    return "pink";
  }
  return null;
}

function isVideoLike(media: LessonResource): boolean {
  return (
    media.type === "youtube" ||
    media.provider === "youtube" ||
    media.provider === "vimeo" ||
    media.provider === "video"
  );
}

// ── The card ────────────────────────────────────────────────────────────────

export function ResourceCardFace({
  resource,
  subjectId,
  meta,
  caption,
  width,
  previewHeight = 120,
  onEnlarge,
  onReadMore,
  onOpenOriginal,
  onEditNote,
  onDuplicate,
  onDuplicateTo,
  onWashChange,
  onRemove,
}: ResourceCardFaceProps): ReactNode {
  const notecard = isNotecard(resource);
  const notes = hasNotes(resource);
  const poster = notecard ? notecardPoster(resource) : undefined;

  // Em-dash titles split into title + subtitle (BUILD_STANDARD §5).
  const label = resource.label || "Resource";
  const dash = label.indexOf(" — ");
  const title = dash >= 0 ? label.slice(0, dash) : label;
  const subtitle = dash >= 0 ? label.slice(dash + 3) : null;

  // Teacher's per-card wash — body only; band + stripe stay subject-locked.
  const washVal =
    resource.wash === "paper"
      ? "var(--paper)"
      : typeof resource.wash === "number"
        ? `var(--subj-${resource.wash}-tint)`
        : undefined;
  const rootStyle: CSSProperties = {
    ...(washVal ? ({ "--wash": washVal } as CSSProperties) : null),
    ...(width !== undefined ? { width } : null),
  };

  // Sanitize the rich notes body once per change (audit #9 — stored XSS),
  // mirroring NotecardCard.
  const safeBody = useMemo(
    () => sanitizeHtml(resource.body ?? ""),
    [resource.body],
  );

  // ── Kebab menu state — fixed-position popover portaled to <body> ──────────
  // The kebab element is captured from the click event (not a ref prop:
  // the Tooltip primitive clones its child and owns the ref slot).
  const kebabElRef = useRef<HTMLButtonElement | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | null>(
    null,
  );
  const hasMenu = Boolean(
    onEnlarge ||
    onOpenOriginal ||
    onEditNote ||
    onDuplicate ||
    onDuplicateTo ||
    onWashChange ||
    onRemove,
  );

  const toggleMenu = useCallback(
    (e: ReactMouseEvent<HTMLButtonElement>) => {
      if (menuAnchor) {
        setMenuAnchor(null);
        return;
      }
      kebabElRef.current = e.currentTarget;
      const rect = e.currentTarget.getBoundingClientRect();
      // Anchor: the menu's right edge under the kebab's right edge.
      setMenuAnchor({ x: rect.right, y: rect.bottom + 4 });
    },
    [menuAnchor],
  );

  const closeMenu = useCallback(() => {
    setMenuAnchor(null);
    // Focus returns to the kebab so keyboard users keep their place.
    kebabElRef.current?.focus();
  }, []);

  return (
    <article
      className={`${styles.card} cp-subj ${subjectId}`}
      style={rootStyle}
      aria-label={`Resource: ${label}`}
    >
      {/* ── Header band — icon tile + meta/title/subtitle + kebab ────────── */}
      <div className={styles.head}>
        <span className={styles.iconTile} aria-hidden="true">
          <TypeGlyph type={resource.type} />
        </span>
        <div className={styles.hgroup}>
          <div className={styles.meta}>{meta}</div>
          <div className={styles.title}>{title}</div>
          {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
        </div>
        {hasMenu && (
          <Tooltip
            content="Card actions — enlarge, duplicate, recolor, or remove this card"
            tooltipId="resources.card-face.kebab"
          >
            <button
              type="button"
              className={styles.kebab}
              aria-label={`Card actions for ${label}`}
              aria-haspopup="menu"
              aria-expanded={menuAnchor !== null}
              onClick={toggleMenu}
            >
              <DotsIcon />
            </button>
          </Tooltip>
        )}
      </div>

      {/* ── Face content ──────────────────────────────────────────────────── */}
      {notecard ? (
        <>
          {poster && (
            <PreviewFrame
              media={poster}
              height={previewHeight}
              onEnlarge={onEnlarge}
              label={label}
            />
          )}
          {notes && (
            <NotecardBody
              html={safeBody}
              onReadMore={onReadMore}
              label={label}
            />
          )}
        </>
      ) : (
        <>
          <PreviewFrame
            media={resource}
            height={previewHeight}
            onEnlarge={onEnlarge}
            label={label}
          />
          {caption ? <div className={styles.caption}>{caption}</div> : null}
          {notes && (
            <div className={styles.notes}>
              <div
                className={styles.notesText}
                // Sanitized above — see lib/sanitize-html.
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: safeBody }}
              />
              {onReadMore && (
                <button
                  type="button"
                  className={styles.more}
                  onClick={onReadMore}
                  aria-label={`Read the full note on ${label}`}
                >
                  …more
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Footer — source pill · honey flag · type tag ──────────────────── */}
      <div className={styles.foot}>
        <SourcePill resource={resource} />
        {notes && !notecard && (
          <span className={styles.noteFlag}>
            <NoteIcon /> notes
          </span>
        )}
        {notecard && (
          <span className={styles.noteFlag}>
            <NotecardIcon /> notecard
          </span>
        )}
        <span className={styles.typeTag}>{typeTagFor(resource.type)}</span>
      </div>

      {/* ── Kebab menu (portaled so the card's hover transform / overflow:
             hidden can't clip or re-anchor the fixed popover) ─────────────── */}
      {menuAnchor &&
        createPortal(
          <CardMenu
            subjectId={subjectId}
            anchor={menuAnchor}
            wash={resource.wash}
            ignoreRef={kebabElRef}
            onClose={closeMenu}
            onEnlarge={onEnlarge}
            onOpenOriginal={onOpenOriginal}
            onEditNote={onEditNote}
            onDuplicate={onDuplicate}
            onDuplicateTo={onDuplicateTo}
            onWashChange={onWashChange}
            onRemove={onRemove}
          />,
          document.body,
        )}
    </article>
  );
}

// ── Notecard body — clamped rich excerpt with bottom fade + Read more ──────

function NotecardBody({
  html,
  onReadMore,
  label,
}: {
  html: string;
  onReadMore?: () => void;
  label: string;
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState(false);

  // The fade only paints when the body actually overflows its 232px max —
  // a short note keeps its last line fully legible.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [html]);

  return (
    <>
      <div
        ref={ref}
        className={`${styles.body} ${clamped ? styles.bodyClamped : ""}`}
        // Sanitized by the caller — see lib/sanitize-html.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {onReadMore && (
        <button
          type="button"
          className={styles.readMore}
          onClick={onReadMore}
          aria-label={`Read the full notecard: ${label}`}
        >
          Read more <ChevronDownIcon />
        </button>
      )}
    </>
  );
}

// ── Preview frame — the P5 fallback chain ("never a broken frame") ─────────

function PreviewFrame({
  media,
  height,
  onEnlarge,
  label,
}: {
  media: LessonResource;
  height: number;
  onEnlarge?: () => void;
  label: string;
}): ReactNode {
  const [thumbFailed, setThumbFailed] = useState(false);
  const [urlFailed, setUrlFailed] = useState(false);

  // The failure flags describe a specific src — when that src changes (the
  // teacher fixed a broken link, a fresh thumbnail landed), reset so the
  // card retries instead of keeping the fallback face until remount.
  useEffect(() => setThumbFailed(false), [media.thumbnailUrl]);
  useEffect(() => setUrlFailed(false), [media.url]);

  // Unsafe schemes (javascript:, data:text, protocol-relative //host) never
  // reach an <img> — treated exactly like a missing thumbnail, so the chain
  // demotes to a designed face. See isSafeImgSrc above.
  const thumb =
    thumbFailed || !isSafeImgSrc(media.thumbnailUrl)
      ? undefined
      : media.thumbnailUrl;
  const fill = docFillFor(media);

  let face: ReactNode;
  if (isVideoLike(media)) {
    // Dark stage + white play circle; the poster sits behind when it loads.
    // A failed poster keeps the stage — it is already a designed face.
    face = (
      <span className={styles.videoStage}>
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className={styles.videoThumb}
            src={thumb}
            alt=""
            loading="lazy"
            onError={() => setThumbFailed(true)}
          />
        )}
        <span className={styles.playButton}>
          <PlayGlyph />
        </span>
      </span>
    );
  } else if (thumb) {
    face = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={thumb}
        alt=""
        loading="lazy"
        onError={() => setThumbFailed(true)}
      />
    );
  } else if (
    (media.type === "image" || media.provider === "image") &&
    isSafeImgSrc(media.url) &&
    !urlFailed
  ) {
    face = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={media.url}
        alt=""
        loading="lazy"
        onError={() => setUrlFailed(true)}
      />
    );
  } else if (fill) {
    face = (
      <span
        className={`${styles.typeFill} ${
          fill === "blue" ? styles.fillBlue : styles.fillPink
        }`}
        aria-hidden="true"
      >
        <BigDocGlyph blue={fill === "blue"} />
      </span>
    );
  } else {
    face = <LinkCardFace media={media} />;
  }

  const style = height !== 120 ? { height } : undefined;
  return onEnlarge ? (
    <button
      type="button"
      className={styles.preview}
      style={style}
      onClick={onEnlarge}
      aria-label={`Enlarge ${label}`}
    >
      {face}
    </button>
  ) : (
    <div className={styles.preview} style={style}>
      {face}
    </div>
  );
}

/** The designed link card — initial tile + bold domain + ellipsized path.
 *  The terminal fallback: renders from the URL when it parses, from the
 *  label otherwise, so SOMETHING designed always paints. */
function LinkCardFace({ media }: { media: LessonResource }): ReactNode {
  const domain = media.url ? domainOf(media.url) : null;
  const display = domain ?? media.label ?? "resource";
  const path = domain && media.url ? pathOf(media.url) : null;
  return (
    <span className={styles.linkCard}>
      <span
        className={styles.linkInitial}
        style={{ background: tagColorFor(display) }}
        aria-hidden="true"
      >
        {initialOf(display)}
      </span>
      <span className={styles.linkDomain}>{display}</span>
      {path ? <span className={styles.linkPath}>{path}</span> : null}
    </span>
  );
}

// ── Footer source pill ──────────────────────────────────────────────────────

function SourcePill({ resource }: { resource: LessonResource }): ReactNode {
  const url = resource.url;
  if (!url) return null; // no url → no pill

  // Domain for real links; a short descriptor for hosted files whose url is
  // root-relative ("/api/resources/{id}" — new URL throws → catch path).
  const domain = domainOf(url);
  const label =
    domain ?? (resource.mimeType ? mimeSuffix(resource.mimeType) : "file");
  return (
    <span className={styles.src}>
      <span
        className={styles.srcInitial}
        style={{ background: tagColorFor(label) }}
        aria-hidden="true"
      >
        {initialOf(label)}
      </span>
      <span className={styles.srcDomain}>{label}</span>
    </span>
  );
}

/** "application/pdf" → "pdf"; defensive against odd mime strings. */
function mimeSuffix(mime: string): string {
  const suffix = mime.split("/").pop()?.trim();
  return suffix || "file";
}

// ── Kebab menu — 216px popover, Esc / outside-click close ──────────────────

const MENU_TINTS = [1, 2, 5, 7, 10, 11, 12, 13, 9];

function CardMenu({
  subjectId,
  anchor,
  wash,
  ignoreRef,
  onClose,
  onEnlarge,
  onOpenOriginal,
  onEditNote,
  onDuplicate,
  onDuplicateTo,
  onWashChange,
  onRemove,
}: {
  subjectId: string;
  /** Viewport point: x = menu right edge, y = menu top. */
  anchor: { x: number; y: number };
  wash: LessonResource["wash"];
  /** The kebab — its mousedown is exempt from outside-click close so the
   *  kebab's own click can toggle the menu shut instead of re-opening it. */
  ignoreRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onEnlarge?: () => void;
  onOpenOriginal?: () => void;
  onEditNote?: () => void;
  onDuplicate?: () => void;
  onDuplicateTo?: () => void;
  onWashChange?: (wash: "paper" | number | null) => void;
  onRemove?: () => void;
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({
    x: anchor.x,
    y: anchor.y,
  });

  // Clamp inside the viewport once measured (context-menu idiom).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const nx = Math.min(anchor.x - width, window.innerWidth - width - 8);
    const ny = Math.min(anchor.y, window.innerHeight - height - 8);
    setPos({ x: Math.max(8, nx), y: Math.max(8, ny) });
  }, [anchor]);

  // Dismiss on outside-click, Esc, scroll, or resize (context-menu idiom).
  // Scroll/resize: the popover is position:fixed at a SNAPSHOT of the
  // kebab's rect, so any scroll (capture phase — container scrolls don't
  // bubble) or resize detaches it from its anchor; closing is the correct
  // behavior for a context menu, not repositioning. The document Esc
  // listener is only the fallback for focus outside the menu — the in-menu
  // keydown handler below owns the common path (focus moves into the menu
  // on open) and stops propagation so a parent lightbox stays open.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        ref.current &&
        !ref.current.contains(t) &&
        !ignoreRef.current?.contains(t)
      ) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDetach = () => onClose();
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

  // Move focus into the menu on open — the popover is portaled to <body>,
  // so without this Tab/arrows can never reach it and a keyboard user
  // cannot activate any item. Items are queried by role rather than held in
  // refs because the Tooltip primitive clones its child and owns the ref
  // slot. preventScroll: the scroll listener above closes the menu, so a
  // focus-induced scroll on open would self-dismiss it.
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLElement>('[role="menuitem"], [role="menuitemradio"]')
      ?.focus({ preventScroll: true });
  }, []);

  // WAI-ARIA menu keyboard pattern: arrows rove focus over EVERY interactive
  // item — action menuitems AND the color menuitemradios — in DOM order,
  // wrapping at the ends; Home/End jump; Tab closes (a menu is not a tab
  // stop sequence); Esc closes without bubbling to a parent dialog.
  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      // L5 — the same keypress must not also close a parent lightbox/dialog.
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === "Tab") {
      // Standard menu behavior: Tab / Shift+Tab dismiss and hand focus back
      // to the kebab (onClose does the focusing). preventDefault so focus
      // doesn't escape to the next tab stop after the body-end portal.
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
    e.preventDefault(); // arrows must not scroll the page behind the menu
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"], [role="menuitemradio"]',
      ) ?? [],
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

  const fire = useCallback(
    (action: () => void) => {
      action();
      onClose();
    },
    [onClose],
  );

  // Groups — separators render only between non-empty neighbours.
  const groupOne = Boolean(onEnlarge || onOpenOriginal || onEditNote);
  const groupTwo = Boolean(onDuplicate || onDuplicateTo);
  const groupColor = Boolean(onWashChange);
  let painted = false;
  const sep = (show: boolean, key: string): ReactNode => {
    // role="separator" — a bare <div> is not a permitted child of role="menu".
    const node =
      show && painted ? (
        <div key={key} role="separator" className={styles.menuSep} />
      ) : null;
    if (show) painted = true;
    return node;
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Card actions"
      className={`${styles.menu} cp-subj ${subjectId}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={onMenuKeyDown}
      style={{ position: "fixed", top: pos.y, left: pos.x, zIndex: 1000 }}
    >
      {sep(groupOne, "s1")}
      {onEnlarge && (
        <button
          type="button"
          role="menuitem"
          className={styles.menuItem}
          onClick={() => fire(onEnlarge)}
        >
          <EnlargeIcon /> Enlarge
        </button>
      )}
      {onOpenOriginal && (
        <button
          type="button"
          role="menuitem"
          className={styles.menuItem}
          onClick={() => fire(onOpenOriginal)}
        >
          <OpenIcon /> Open original
        </button>
      )}
      {onEditNote && (
        <button
          type="button"
          role="menuitem"
          className={styles.menuItem}
          onClick={() => fire(onEditNote)}
        >
          <NoteIcon /> Add / edit note
        </button>
      )}

      {sep(groupTwo, "s2")}
      {onDuplicate && (
        <button
          type="button"
          role="menuitem"
          className={styles.menuItem}
          onClick={() => fire(onDuplicate)}
        >
          <CopyIcon /> Duplicate
        </button>
      )}
      {onDuplicateTo && (
        <button
          type="button"
          role="menuitem"
          className={styles.menuItem}
          onClick={() => fire(onDuplicateTo)}
        >
          <CopyToIcon /> Duplicate to…
        </button>
      )}

      {sep(groupColor, "s3")}
      {onWashChange && (
        <>
          {/* Visual label only — a bare text <div> is not a permitted child
              of role="menu"; the group's aria-label carries the name. */}
          <div className={styles.menuLabel} aria-hidden="true">
            Card color
          </div>
          {/* Swatches conform to the menu content model as a group of
              menuitemradios (one selection, aria-checked on the current
              wash). The arrow-key roving above includes them. */}
          <div className={styles.swatches} role="group" aria-label="Card color">
            <Tooltip content="Subject color (default)">
              <button
                type="button"
                role="menuitemradio"
                className={`${styles.swatch} ${styles.swatchSubject} ${
                  wash === undefined ? styles.swatchOn : ""
                }`}
                aria-label="Subject color (default)"
                aria-checked={wash === undefined}
                onClick={() => onWashChange(null)}
              />
            </Tooltip>
            <Tooltip content="White">
              <button
                type="button"
                role="menuitemradio"
                className={`${styles.swatch} ${styles.swatchPaper} ${
                  wash === "paper" ? styles.swatchOn : ""
                }`}
                aria-label="White"
                aria-checked={wash === "paper"}
                onClick={() => onWashChange("paper")}
              />
            </Tooltip>
            {MENU_TINTS.map((n) => (
              <Tooltip key={n} content="Set card color">
                <button
                  type="button"
                  role="menuitemradio"
                  className={`${styles.swatch} ${
                    wash === n ? styles.swatchOn : ""
                  }`}
                  aria-label={`Card color ${n}`}
                  aria-checked={wash === n}
                  style={{
                    background: `var(--subj-${n}-tint)`,
                    borderColor: `var(--subj-${n})`,
                  }}
                  onClick={() => onWashChange(n)}
                />
              </Tooltip>
            ))}
          </div>
        </>
      )}

      {sep(Boolean(onRemove), "s4")}
      {onRemove && (
        <Tooltip
          content="Remove this card from the lesson — the underlying file or link is not deleted, only unlinked here"
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
      )}
    </div>
  );
}

// ── Icons — per-component inline SVG, Lucide-family 24×24, ~2px stroke ─────

const STROKE = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** Resource-type glyph for the header icon tile. */
function TypeGlyph({ type }: { type: LessonResource["type"] }): ReactNode {
  switch (type) {
    case "slides":
      return (
        <svg {...STROKE}>
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      );
    case "pdf":
      return (
        <svg {...STROKE}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      );
    case "doc":
      return (
        <svg {...STROKE}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="13" x2="15" y2="13" />
          <line x1="9" y1="17" x2="15" y2="17" />
        </svg>
      );
    case "image":
      return (
        <svg {...STROKE}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...STROKE}>
          <circle cx="12" cy="12" r="10" />
          <polygon points="10 8 16 12 10 16 10 8" />
        </svg>
      );
    case "notecard":
      return (
        <svg {...STROKE}>
          <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11l5-5V5a2 2 0 0 0-2-2z" />
          <path d="M15 21v-5h6" />
        </svg>
      );
    case "website":
      return (
        <svg {...STROKE}>
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      );
    case "link":
    default:
      return (
        <svg {...STROKE}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
  }
}

/** Big centered glyph for the type-tinted preview fill. */
function BigDocGlyph({ blue }: { blue: boolean }): ReactNode {
  return blue ? (
    <svg {...STROKE} strokeWidth={1.6}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  ) : (
    <svg {...STROKE} strokeWidth={1.6}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="15" x2="15" y2="15" />
    </svg>
  );
}

function DotsIcon(): ReactNode {
  return (
    <svg {...STROKE}>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </svg>
  );
}

function PlayGlyph(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function ChevronDownIcon(): ReactNode {
  return (
    <svg {...STROKE}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function NoteIcon(): ReactNode {
  return (
    <svg {...STROKE}>
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    </svg>
  );
}

function NotecardIcon(): ReactNode {
  return (
    <svg {...STROKE}>
      <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11l5-5V5a2 2 0 0 0-2-2z" />
      <path d="M15 21v-5h6" />
    </svg>
  );
}

function EnlargeIcon(): ReactNode {
  return (
    <svg {...STROKE}>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function OpenIcon(): ReactNode {
  return (
    <svg {...STROKE}>
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function CopyIcon(): ReactNode {
  return (
    <svg {...STROKE}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CopyToIcon(): ReactNode {
  return (
    <svg {...STROKE}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      <path d="M12 15h6M15 12l3 3-3 3" />
    </svg>
  );
}

function TrashIcon(): ReactNode {
  return (
    <svg {...STROKE}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
