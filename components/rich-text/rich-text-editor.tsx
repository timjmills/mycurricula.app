"use client";

// rich-text-editor.tsx — Inline rich-text editor with a floating dark toolbar.
//
// Design: a borderless contentEditable region. On text selection a compact
// floating toolbar surfaces above/below the selection with:
//   • Bold / Italic / Underline / Strikethrough (execCommand shortcuts)
//   • Subscript (X₂) and Superscript (X²)      (execCommand)
//   • Text-color palette  — ink ramp + all 8 subject colors
//   • Highlight palette   — normal (saturated) set + pastel (soft tint) set + clear
//   • Font-family picker  — Sans / Serif / Mono / System / Humanist (5 options)
//   • Numbered list / Bullet list / Checklist   (execCommand / best-effort)
//   • Link (createLink via execCommand)          (prompts for URL)
//   • Image (insertImage via execCommand)        (prompts for URL)
//
// Caret safety: the component is UNCONTROLLED for typing. It syncs `value`
// into the DOM only on mount and when an externally-driven value change is
// detected (innerHTML !== incoming value). Never writes innerHTML on every
// keystroke — that would reset the caret position.
//
// singleLine mode: Enter is suppressed so the field stays one line, but all
// formatting commands remain available. Multi-line paste is collapsed to a
// single plain-text line before insertion.
//
// XSS note: `value` is written via innerHTML and is teacher-authored content.
// Under the forking model that content reaches teammates, so it CANNOT be
// trusted. The HTML this editor reports up via onChange is run through
// sanitizeHtml() (lib/sanitize-html.ts, DOMPurify with a strict allowlist) so
// the value that gets persisted is already clean. The render sites that inject
// stored HTML (weekly-lesson-card, lesson-flow) ALSO re-sanitize at render
// time as defence in depth. The live contentEditable DOM is left unsanitized
// so the caret never jumps mid-edit; only the emitted/stored value is cleaned.
//
// execCommand note: document.execCommand is deprecated in the spec but is
// universally supported in all current browsers and is the pragmatic choice
// for a contentEditable prototype. All document/window access is guarded so
// it never runs during SSR render.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { parseResourceUrl } from "@/lib/resource-embed";
import styles from "./rich-text-editor.module.css";

// ── Public contract ─────────────────────────────────────────────────────────

export interface RichTextEditorProps {
  /** Current value as an HTML string. */
  value: string;
  /** Called with the new HTML whenever the content changes. */
  onChange: (html: string) => void;
  /** Placeholder shown when empty. */
  placeholder?: string;
  /**
   * Single-line mode — for section headings: Enter does not insert a
   * newline, but text is still fully styleable. Default false.
   */
  singleLine?: boolean;
  /** Accessible label for the editable region. */
  ariaLabel?: string;
  /**
   * Focus the editable region on mount and place the caret at the end —
   * for inline editors that open in response to a teacher action so the
   * field is ready to type the instant it appears.
   */
  autoFocus?: boolean;
  /**
   * When provided, the formatting toolbar is DOCKED instead of floating near
   * the text selection.
   *
   * Docked behavior (when this prop IS supplied):
   *   • The toolbar renders position:fixed, horizontally CENTERED within
   *     `dockTarget.current`'s bounding rect, pinned ~12px above that
   *     element's bottom edge. It is clamped inside the viewport so it can
   *     never be clipped off-screen.
   *   • The toolbar becomes visible whenever the editable region is FOCUSED —
   *     even at a collapsed caret with NO text selected — so clicking into a
   *     field immediately reveals the controls. It hides on blur (focus
   *     leaving the editor AND the toolbar).
   *   • B/I/U and the other toggle states stay correct at a collapsed caret:
   *     document.queryCommandState still reports format state with no
   *     selection, so the toggle highlights track the caret position.
   *   • The docked position is recomputed on window scroll (capture phase, so
   *     inner scrolling containers also trigger it), window resize, and on
   *     focus — the dockTarget's rect moves as the surrounding pane scrolls.
   *   • All formatting commands and popovers work exactly as in floating mode.
   *
   * When this prop is OMITTED the toolbar floats near the text selection and
   * appears only when text is actually selected — the original behavior,
   * unchanged. (The Weekly view relies on that floating behavior.)
   */
  dockTarget?: React.RefObject<HTMLElement | null>;
  /**
   * Resolve the source for an inline image, DECOUPLED from storage. When the
   * teacher presses the "Insert image" toolbar button, the editor calls this
   * (if provided) and inserts an <img> pointing at the returned URL — typically
   * a hosted resource path such as `/api/resources/{id}` or a `data:`/`blob:`
   * preview URL the parent produced after an upload. Returning `null`
   * (or a rejected promise) cancels the insertion silently.
   *
   * The parent owns upload / URL resolution entirely; the editor never touches
   * storage. When this prop is OMITTED the button falls back to prompting the
   * teacher for an image URL (the original behavior). Either way the inserted
   * markup is sanitized on emit — an unsafe src is dropped by sanitizeHtml().
   */
  onRequestImageUrl?: () => Promise<string | null>;
}

// ── Toolbar data ─────────────────────────────────────────────────────────────

interface ColorSwatch {
  label: string;
  /** CSS custom-property name (e.g. "--ink-900") or a literal color keyword
   *  ("transparent"). We resolve custom properties at command time via
   *  getComputedStyle so execCommand always receives a concrete hex/rgb. */
  variable: string;
}

const TEXT_COLORS: ColorSwatch[] = [
  { label: "Ink dark", variable: "--ink-900" },
  { label: "Ink mid", variable: "--ink-700" },
  { label: "Ink light", variable: "--ink-500" },
  { label: "Math blue", variable: "--math" },
  { label: "Reading green", variable: "--reading" },
  { label: "Writing purple", variable: "--writing" },
  { label: "Grammar teal", variable: "--grammar" },
  { label: "Spelling pink", variable: "--spelling" },
  { label: "UFLI orange", variable: "--ufli" },
  { label: "Explorers gold", variable: "--explorers" },
  { label: "SEL slate", variable: "--sel" },
];

// Highlight offers the same swatches as the text-color picker, so any
// font color can equally be applied as a highlight (plus the pastel set).
const HIGHLIGHT_COLORS: ColorSwatch[] = TEXT_COLORS;

// Highlighter-pen colors — the classic bright marker set.
const HIGHLIGHTERS: ColorSwatch[] = [
  { label: "Laser lemon", variable: "--hl-lemon" },
  { label: "French lime", variable: "--hl-lime" },
  { label: "Mint green", variable: "--hl-mint" },
  { label: "Aquamarine", variable: "--hl-aqua" },
  { label: "Maya blue", variable: "--hl-maya" },
  { label: "Slate blue", variable: "--hl-slate" },
  { label: "Heliotrope", variable: "--hl-heliotrope" },
  { label: "Violet web", variable: "--hl-violet" },
  { label: "Ultra red", variable: "--hl-red" },
  { label: "Mac & cheese", variable: "--hl-cheese" },
];

// Pastel highlight colors — softer tints of the highlighter hues, distinct
// enough to tell apart while gentler than the bright markers.
const HIGHLIGHT_PASTEL: ColorSwatch[] = [
  { label: "Lemon pastel", variable: "--hlp-lemon" },
  { label: "Lime pastel", variable: "--hlp-lime" },
  { label: "Mint pastel", variable: "--hlp-mint" },
  { label: "Aqua pastel", variable: "--hlp-aqua" },
  { label: "Maya pastel", variable: "--hlp-maya" },
  { label: "Slate pastel", variable: "--hlp-slate" },
  { label: "Heliotrope pastel", variable: "--hlp-heliotrope" },
  { label: "Violet pastel", variable: "--hlp-violet" },
  { label: "Rose pastel", variable: "--hlp-red" },
  { label: "Peach pastel", variable: "--hlp-cheese" },
];

interface FontOption {
  label: string;
  /**
   * CSS custom-property name (e.g. "--font-sans") or a literal font-family
   * string. Resolved to a concrete font stack at command time via
   * getComputedStyle so execCommand('fontName') receives a real face value,
   * not an unparseable var() string.
   */
  variable: string;
  /** CSS font-family string for the preview swatch in the picker. */
  css: string;
}

// Five distinct font options covering the main stylistic categories.
const FONT_OPTIONS: FontOption[] = [
  {
    label: "Sans",
    variable: "--font-sans",
    css: "var(--font-sans)",
  },
  {
    label: "Serif",
    variable: "Georgia, 'Times New Roman', serif",
    css: "Georgia, 'Times New Roman', serif",
  },
  {
    label: "Mono",
    variable: "--font-mono",
    css: "var(--font-mono)",
  },
  {
    label: "System",
    variable: "system-ui, sans-serif",
    css: "system-ui, sans-serif",
  },
  {
    // Humanist option — warmer, rounder than geometric sans; gives
    // teachers a friendlier alternative for lesson notes.
    label: "Humanist",
    variable:
      "'Trebuchet MS', 'Gill Sans', 'Gill Sans MT', Calibri, sans-serif",
    css: "'Trebuchet MS', 'Gill Sans', 'Gill Sans MT', Calibri, sans-serif",
  },
];

interface SizeOption {
  label: string;
  /**
   * HTML font-size value (1-7) passed to document.execCommand('fontSize').
   * execCommand wraps the selection in <font size="N">; this is the same
   * pragmatic deprecated-but-universal path the other commands use.
   */
  size: string;
  /** CSS font-size for the preview text in the picker — a token, never a
   *  hard-coded px value, so the preview tracks the design scale. */
  previewVar: string;
}

// Four clear text sizes. The execCommand size values map to the browser's
// legacy 1-7 scale: 2 ≈ small, 3 ≈ normal (browser default), 5 ≈ large,
// 6 ≈ x-large. The preview font-size uses --t-* tokens so the popover
// reflects the app's type scale rather than the raw legacy sizes.
const SIZE_OPTIONS: SizeOption[] = [
  { label: "Small", size: "2", previewVar: "--t-11" },
  { label: "Normal", size: "3", previewVar: "--t-13" },
  { label: "Large", size: "5", previewVar: "--t-18" },
  { label: "X-Large", size: "6", previewVar: "--t-24" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

// ── Auto-list detection helper ────────────────────────────────────────────
//
// Called on every Space keypress (before the space is inserted). Inspects
// the text on the current line from its start up to the caret. If that text
// is exactly a list marker — and nothing else has been typed on the line yet
// — it cancels the space, deletes the marker, and fires the matching list
// execCommand. Result: the marker vanishes and the line becomes a proper
// list item with the caret ready to type.
//
// Supported markers:
//   "- "  (hyphen + space)   → insertUnorderedList
//   "* "  (asterisk + space) → insertUnorderedList
//   "1. " "2. " … (number + period + space) → insertOrderedList
//
// Guards:
//   • Only fires in the browser (typeof document check).
//   • Only fires when the caret selection is collapsed (no text selected).
//   • Does NOT fire when the caret is already inside a <ul> or <ol> node,
//     because the list is already active and the browser handles continuation.
//   • Does NOT fire in singleLine mode (lists are multi-line constructs).
//
// Detection strategy:
//   We need the text from the start of the current block line to the caret.
//   contentEditable blocks can be: bare text nodes in the editor root, or
//   text wrapped in <div>, <p>, <br>, or similar block elements.
//
//   We use the Selection API to locate the anchor node, then collect all
//   text content in that node up to the anchor offset. For inline-only
//   content (a text node directly inside the editor root) the entire
//   textContent up to the offset is the "line prefix."
//   For text inside a block element (<div>/<p>) we walk the block's child
//   nodes in order, accumulating text until we reach the anchor node+offset,
//   which gives us the full prefix of the visual line.
//
//   We then test whether that prefix matches /^(-|\*|\d+\.)$/ — meaning
//   the marker characters are the ONLY content before the space that would
//   be inserted. If matched, we delete exactly `prefix.length` characters
//   backward (execCommand 'delete' once per character) and then execute
//   the correct list command.

/** List marker patterns. Captured group 1 distinguishes bullet vs ordered. */
const AUTO_LIST_RE = /^(-|\*|\d+\.)$/;

/**
 * Returns the text content of the current line from its start to the caret,
 * or null when the selection is unavailable / not collapsed.
 * "Line start" is the beginning of the nearest block ancestor (div, p, li)
 * that is a direct child of the editor — not the editor root itself.
 * Pure SSR guard: caller must ensure this is called in browser context.
 */
function getLinePrefixBeforeCaret(editor: HTMLElement): string | null {
  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return null;

  const anchor = sel.anchorNode;
  const offset = sel.anchorOffset;
  if (!anchor) return null;

  // Walk up from the anchor to find the nearest block container that is a
  // direct child of the editor (or the editor itself for inline content).
  // We stop at the first block-level element whose parent is the editor root.
  let block: Node = anchor;
  while (block.parentNode && block.parentNode !== editor) {
    block = block.parentNode;
  }
  // `block` is now the top-level child node of the editor (could be a text
  // node, a <div>, a <p>, etc.).

  if (block === anchor) {
    // The anchor IS the top-level child — a bare text node or the editor div.
    // The prefix is everything in that text node up to the offset.
    if (anchor.nodeType === Node.TEXT_NODE) {
      return (anchor.textContent ?? "").slice(0, offset);
    }
    // Anchor is an element node (e.g. the editor root itself when empty).
    return "";
  }

  // The anchor is inside `block`. Walk block's descendants in DOM order,
  // accumulating text content until we reach anchor at offset.
  let accumulated = "";
  let reached = false;

  function walk(node: Node): void {
    if (reached) return;
    if (node === anchor) {
      // We've arrived: add text up to the caret offset within this node.
      if (node.nodeType === Node.TEXT_NODE) {
        accumulated += (node.textContent ?? "").slice(0, offset);
      }
      reached = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      accumulated += node.textContent ?? "";
      return;
    }
    // Element node — recurse into children.
    for (let i = 0; i < node.childNodes.length; i++) {
      walk(node.childNodes[i]);
      if (reached) return;
    }
  }

  walk(block);
  return reached ? accumulated : null;
}

/**
 * Attempt markdown-style list auto-conversion when the teacher presses Space.
 *
 * Returns true if the event was handled (caller should e.preventDefault()).
 * Returns false to let the keystroke proceed normally.
 *
 * Must be called after an SSR guard — all access to document/window happens
 * inside and is safe because this is invoked from a keyboard event handler
 * (always browser-only).
 */
function tryAutoList(
  e: React.KeyboardEvent<HTMLDivElement>,
  editor: HTMLElement,
  singleLine: boolean,
): boolean {
  // Auto-list is a multi-line feature — skip entirely in singleLine mode.
  if (singleLine) return false;

  // Only activate on an unmodified Space press with a collapsed selection.
  if (e.key !== " " || e.ctrlKey || e.metaKey || e.altKey) return false;

  const sel = window.getSelection();
  if (!sel || !sel.isCollapsed) return false;

  // Do not fire if the caret is already inside an existing list — the
  // browser's native continuation handles everything there.
  const anchorEl =
    sel.anchorNode?.nodeType === Node.ELEMENT_NODE
      ? (sel.anchorNode as Element)
      : sel.anchorNode?.parentElement;
  if (anchorEl?.closest("ul, ol")) return false;

  // Get the text from the start of the current line to the caret.
  const prefix = getLinePrefixBeforeCaret(editor);
  if (prefix === null) return false;

  // Match against the list marker pattern.
  const match = AUTO_LIST_RE.exec(prefix);
  if (!match) return false;

  // We have a match. Prevent the space from being inserted.
  e.preventDefault();

  // Delete the marker characters that were already typed.
  // execCommand('delete') removes one character at a time backward from caret.
  const markerLen = prefix.length;
  for (let i = 0; i < markerLen; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document as any).execCommand("delete", false, undefined);
  }

  // Determine list type: hyphen or asterisk → unordered; digit+period → ordered.
  const marker = match[1];
  const command =
    marker === "-" || marker === "*"
      ? "insertUnorderedList"
      : "insertOrderedList";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (document as any).execCommand(command, false, undefined);

  return true;
}

/**
 * Resolve a CSS custom property to its computed value on <html>.
 * Falls back to the string unchanged when it is not a custom-property name
 * (so literal colors and font stacks pass through unmodified).
 * Returns the variable name unchanged during SSR (no document available).
 * Must only be called in browser context for meaningful results — all
 * critical calls are in event handlers; render-path calls are guarded by
 * toolbarVisible (client-only state), so this is safe in practice.
 */
function resolveCssVar(variable: string): string {
  if (!variable.startsWith("--")) return variable; // already a concrete value
  if (typeof document === "undefined") return variable; // SSR guard
  return getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
}

/** Safely call document.execCommand (deprecated but pragmatic for a
 *  prototype — universally supported in all modern browsers). All callers
 *  are in event handlers so this only runs in the browser. */
function exec(command: string, value = ""): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (document as any).execCommand(command, false, value || undefined);
}

/**
 * Returns true when a contentEditable element's innerHTML represents
 * visually empty content. Browsers may leave behind a lone <br> or a
 * block wrapper like <div><br></div> after the last character is deleted.
 */
function isEditorEmpty(el: HTMLElement): boolean {
  if ((el.textContent ?? "").trim() !== "") return false;
  const inner = el.innerHTML;
  return inner === "" || /^(<br\s*\/?>|<div><br\s*\/?><\/div>)$/i.test(inner);
}

/**
 * Resolve the block format wrapping the current caret to one of the values the
 * heading/quote toggles care about ("h1" | "h2" | "blockquote" | ""). Walks up
 * from the selection's anchor to the nearest H1/H2/BLOCKQUOTE that lives inside
 * the editor; returns "" for a plain paragraph/div or when there is no usable
 * selection. Browser-only — callers run in event handlers / client effects.
 */
function getBlockTagAtCaret(
  editor: HTMLElement,
): "" | "h1" | "h2" | "blockquote" {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return "";
  const anchor = sel.anchorNode;
  if (!anchor) return "";
  let node: Node | null =
    anchor.nodeType === Node.ELEMENT_NODE ? anchor : anchor.parentNode;
  while (node && node !== editor) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName.toLowerCase();
      if (tag === "h1" || tag === "h2" || tag === "blockquote") {
        // The comparison narrows `tag` to the literal union the signature wants.
        return tag as "h1" | "h2" | "blockquote";
      }
    }
    node = node.parentNode;
  }
  return "";
}

/**
 * Find the checklist <li> a node lives inside, if any. A checklist item is an
 * <li> whose parent <ul> carries data-checklist. Returns null otherwise. Used
 * by the click/keyboard toggle so only real checklist items respond. Stops at
 * the editor boundary so a stray same-named attribute outside can't match.
 */
function closestChecklistItem(
  node: Node | null,
  editor: HTMLElement,
): HTMLLIElement | null {
  let cur: Node | null =
    node && node.nodeType === Node.ELEMENT_NODE
      ? node
      : (node?.parentNode ?? null);
  while (cur && cur !== editor) {
    if (
      cur.nodeType === Node.ELEMENT_NODE &&
      (cur as Element).tagName === "LI"
    ) {
      const li = cur as HTMLLIElement;
      const parent = li.parentElement;
      if (parent && parent.matches("ul[data-checklist]")) return li;
    }
    cur = cur.parentNode;
  }
  return null;
}

// ── Inline-media insertion helpers ────────────────────────────────────────────
//
// We build a small HTML fragment and inject it with execCommand('insertHTML').
// The injected markup is NOT trusted-by-construction — it is teacher-supplied —
// so it always flows back out through sanitizeHtml() on the next emit, which is
// the authoritative gate (strips an unsafe <img src>, removes a non-trusted-host
// <iframe>, and force-hardens a trusted one). The escaping + structure below is
// belt-and-braces so the LIVE DOM we hand the browser is already well-formed and
// can't break out of the attribute it's placed in.

/** Escape a string for safe interpolation into a double-quoted HTML attribute.
 *  Defence-in-depth only — sanitizeHtml() re-validates everything on emit. */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Build the HTML for an inline image. `alt` defaults to empty (decorative);
 *  callers may pass a label. The src is escaped here and re-validated by the
 *  sanitizer on emit, so an unsafe scheme never survives to storage/render. */
function buildImageHtml(src: string, alt = ""): string {
  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" loading="lazy" />`;
}

/**
 * Build the HTML for an inline embed (YouTube / Vimeo / Google) given an
 * already-parsed, embeddable URL. We emit the iframe with the SAME safe sandbox
 * / allow / referrerpolicy the app's React <iframe> renderers ship
 * (components/resources/ResourceEmbed.tsx) — and the sanitizer re-forces these
 * exact values on emit, so an embed that round-trips through storage is
 * hardened identically. The wrapper is a non-editable block (contentEditable
 * lives in the live DOM only; the attribute is dropped by the sanitizer and is
 * not needed at render sites) so the caret treats the embed as one atomic unit
 * and a click lands in the player rather than splitting the frame. A trailing
 * <p><br></p> gives the teacher a place to keep typing after the embed.
 */
function buildEmbedHtml(embedUrl: string, title: string): string {
  const safeUrl = escapeAttr(embedUrl);
  const safeTitle = escapeAttr(title);
  return (
    `<div class="${styles.embedBlock}" contenteditable="false">` +
    `<iframe src="${safeUrl}" title="${safeTitle}" loading="lazy" ` +
    `allow="autoplay; encrypted-media; picture-in-picture; fullscreen" ` +
    `referrerpolicy="no-referrer" ` +
    `sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation" ` +
    `allowfullscreen></iframe>` +
    `</div><p><br></p>`
  );
}

/**
 * Build an interactive checklist from an array of line strings. Emits a
 * `<ul data-checklist="true">` whose `<li data-checked="false">` items toggle
 * on click (handler lives in the component). The data attributes are the
 * persisted state — DOMPurify keeps `data-*` by default, so the checked state
 * round-trips through sanitizeHtml(); `class` would NOT survive, so styling
 * keys off the attribute selectors in the module CSS instead. Each line's text
 * is escaped (defence-in-depth; the sanitizer re-validates on emit). An empty
 * input yields a single blank item so the teacher has a row to type into.
 * A trailing <p><br></p> gives a caret landing spot after the list.
 */
function buildChecklistHtml(lines: string[]): string {
  const rows = lines.length > 0 ? lines : [""];
  const items = rows
    .map(
      (line) => `<li data-checked="false">${escapeAttr(line) || "<br>"}</li>`,
    )
    .join("");
  return `<ul data-checklist="true">${items}</ul><p><br></p>`;
}

/**
 * Build an inline resource "card": a <figure> grouping an image, embed, or
 * link with an optional caption. `data-card` tags the variant for styling
 * (figure/figcaption survive sanitizeHtml — they were added to the allowlist).
 * The inner media is produced by the shared buildImageHtml/buildEmbedHtml so an
 * unsafe src is still dropped on emit; the link variant emits a plain anchor
 * the sanitizer hardens (target/rel). The caption is optional and escaped.
 */
function buildImageCardHtml(src: string, caption: string): string {
  const cap = caption.trim()
    ? `<figcaption>${escapeAttr(caption.trim())}</figcaption>`
    : "";
  return (
    `<figure class="${styles.resourceCard}" data-card="image">` +
    buildImageHtml(src, caption.trim()) +
    cap +
    `</figure><p><br></p>`
  );
}

function buildEmbedCardHtml(
  embedUrl: string,
  title: string,
  caption: string,
): string {
  const cap = caption.trim()
    ? `<figcaption>${escapeAttr(caption.trim())}</figcaption>`
    : "";
  // buildEmbedHtml already appends its own trailing <p><br></p>; drop it here so
  // the caption sits INSIDE the figure, then add one paragraph after the figure.
  const embed = buildEmbedHtml(embedUrl, title).replace(/<p><br><\/p>$/, "");
  return (
    `<figure class="${styles.resourceCard}" data-card="embed">` +
    embed +
    cap +
    `</figure><p><br></p>`
  );
}

function buildLinkCardHtml(
  url: string,
  label: string,
  caption: string,
): string {
  const text = (label.trim() || url).trim();
  const cap = caption.trim()
    ? `<figcaption>${escapeAttr(caption.trim())}</figcaption>`
    : "";
  return (
    `<figure class="${styles.resourceCard}" data-card="link">` +
    `<a href="${escapeAttr(url)}">${escapeAttr(text)}</a>` +
    cap +
    `</figure><p><br></p>`
  );
}

// ── Toolbar sub-components ────────────────────────────────────────────────────

interface ToolbarButtonProps {
  label: string;
  active?: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  children: ReactNode;
}

function ToolbarButton({
  label,
  active = false,
  onMouseDown,
  children,
}: ToolbarButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      // aria-pressed is only set when the caller passes active=true (toggle
      // buttons: bold, italic, etc.). Action-only buttons (insert link, list
      // commands) pass active={false} and must NOT carry aria-pressed at all —
      // a persistent aria-pressed="false" tells screen readers the button is a
      // toggle that is currently off, which is misleading for one-shot actions.
      aria-pressed={active ? true : undefined}
      title={label}
      className={`${styles.tbBtn} ${active ? styles.tbBtnActive : ""} cp-focusable`}
      onMouseDown={onMouseDown}
    >
      {children}
    </button>
  );
}

// Undo / redo glyphs — curved arrows. Inline SVG keeps the toolbar
// dependency-free; stroke uses currentColor so they inherit the white
// toolbar text color.
function UndoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h9a6 6 0 0 1 0 12h-4" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 14 20 9l-5-5" />
      <path d="M20 9h-9a6 6 0 0 0 0 12h4" />
    </svg>
  );
}

interface SwatchButtonProps {
  label: string;
  color: string; // resolved CSS color
  isNone?: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}

function SwatchButton({
  label,
  color,
  isNone = false,
  onMouseDown,
}: SwatchButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`${styles.swatch} ${isNone ? styles.swatchNone : ""} cp-focusable`}
      style={isNone ? undefined : { background: color }}
      onMouseDown={onMouseDown}
    />
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function RichTextEditor({
  value,
  onChange,
  placeholder = "",
  singleLine = false,
  ariaLabel,
  autoFocus = false,
  dockTarget,
  onRequestImageUrl,
}: RichTextEditorProps): ReactNode {
  // Docked mode is active whenever a dockTarget ref is supplied. When false,
  // every code path below behaves exactly as it did before this prop existed.
  const docked = dockTarget != null;
  const editorRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Last value we wrote into the DOM — used to avoid caret-resetting writes.
  const lastWrittenRef = useRef<string>("");

  // Last value we EMITTED upward (already sanitized). The parent echoes this
  // straight back as `value`, so the sync effect uses it to recognise our own
  // change and skip the DOM rewrite that would reset the caret. This matters
  // for inline media: sanitizeHtml() is NOT idempotent on an <img>/<iframe>
  // (it drops `loading`, the embed's `contenteditable`, reorders iframe attrs),
  // so the raw live DOM never equals the sanitized echo — without this guard
  // the effect would clobber the caret AND strip the embed's contenteditable
  // wrapper on the very next render. Compared against lastWrittenRef (raw DOM)
  // this tracks the clean string instead.
  const lastEmittedRef = useRef<string>("");

  // Toolbar visibility & position (viewport-relative, for position:fixed).
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0 });

  // Which inline states are active at the current selection.
  // queryCommandState guards are in event handlers (browser-only).
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);
  const [strikethrough, setStrikethrough] = useState(false);
  const [subscript, setSubscript] = useState(false);
  const [superscript, setSuperscript] = useState(false);
  // Which block format wraps the caret — "" (plain paragraph/div), "h1", "h2",
  // or "blockquote". Drives the heading/quote toggle highlights so a teacher
  // sees at a glance whether the current line is already a heading. Read from
  // the caret's nearest block ancestor inside the editor (queryCommandValue is
  // unreliable across browsers for formatBlock, so we resolve it ourselves).
  const [blockTag, setBlockTag] = useState<"" | "h1" | "h2" | "blockquote">("");

  // Whether the editor content is empty (for placeholder).
  // Initial state: treat as empty when value is blank or a bare <br>.
  const [empty, setEmpty] = useState(
    () => !value || value === "<br>" || value === "<br/>",
  );

  // Font picker open state.
  const [fontOpen, setFontOpen] = useState(false);

  // Text-size picker open state.
  const [sizeOpen, setSizeOpen] = useState(false);

  // Color/highlight palette open state.
  const [paletteOpen, setPaletteOpen] = useState<"color" | "highlight" | null>(
    null,
  );

  // ── Sync value → DOM (only when it genuinely differs) ──────────────
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    // Write on first mount regardless; afterwards only when the value changed
    // EXTERNALLY (not by our own emit). Two guards:
    //   • value !== lastWrittenRef.current — the value differs from the raw DOM
    //     we last wrote (covers plain text, where sanitize is idempotent).
    //   • value !== lastEmittedRef.current — the value is not the sanitized
    //     echo of our own last emit. Required because sanitizeHtml is NOT
    //     idempotent on inline media, so the echo never equals the raw DOM and
    //     the first guard alone would wrongly trigger a caret-resetting rewrite.
    if (
      el.innerHTML !== value &&
      value !== lastWrittenRef.current &&
      value !== lastEmittedRef.current
    ) {
      // Defence-in-depth at the EDIT sink. `value` is teacher-authored and,
      // under the forking model, may have reached storage OUTSIDE this editor's
      // sanitizing emit (e.g. a hostile client writing raw HTML straight to the
      // row). Sanitize before it touches the live contentEditable so a stored
      // <img onerror>/<script>/unsafe-src payload can't execute the moment a
      // teammate OPENS the card to edit it. The render sinks already re-sanitize;
      // this closes the last raw-innerHTML path. For already-clean stored values
      // it's effectively idempotent — embeds are emitted wrapper-less, so nothing
      // structural changes here. We keep the RAW incoming `value` in
      // lastWrittenRef so the parent's echo is still recognised and skipped (no
      // caret-reset loop); only a genuine external change resets the caret, which
      // is acceptable because the content itself changed underneath the teacher.
      el.innerHTML = sanitizeHtml(value);
      lastWrittenRef.current = value;
    }
    setEmpty(isEditorEmpty(el));
  }, [value]);

  // ── Shared format-state polling ─────────────────────────────────────────
  // Reads document.queryCommandState for every toggle command and pushes the
  // results into state. queryCommandState reports correctly even at a
  // collapsed caret (no selection), so this keeps the B/I/U highlights honest
  // in docked mode too. Browser-only — all callers run in event handlers or
  // client-only effects.
  const syncFormatState = useCallback(() => {
    setBold(document.queryCommandState("bold"));
    setItalic(document.queryCommandState("italic"));
    setUnderline(document.queryCommandState("underline"));
    setStrikethrough(document.queryCommandState("strikeThrough"));
    setSubscript(document.queryCommandState("subscript"));
    setSuperscript(document.queryCommandState("superscript"));
    // Heading / blockquote toggle state. queryCommandValue('formatBlock') is
    // inconsistent across browsers, so resolve the block from the caret's
    // ancestor chain instead (getBlockTagAtCaret).
    const el = editorRef.current;
    setBlockTag(el ? getBlockTagAtCaret(el) : "");
  }, []);

  // ── Docked positioning ──────────────────────────────────────────────────
  // Computes the toolbar's fixed-position coordinates from the dockTarget's
  // current bounding rect: horizontally centered within the target, pinned
  // ~12px above the target's bottom edge, then clamped so the whole toolbar
  // stays inside the viewport. A no-op when not docked or before the target
  // has mounted. Browser-only — invoked from client-only effects/handlers.
  const positionDocked = useCallback(() => {
    if (!docked) return;
    const target = dockTarget?.current;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    // The toolbar wraps to ~2 rows of buttons on narrow widths — match the
    // generous estimate used by the floating path so clamping is consistent.
    const toolbarH = 88;
    const toolbarW = 520;
    const gap = 12; // pinned ~12px above the dockTarget's bottom edge
    const margin = 8;

    // Center horizontally within the dockTarget's rect.
    let left = rect.left + rect.width / 2 - toolbarW / 2;
    left = Math.max(
      margin,
      Math.min(left, window.innerWidth - toolbarW - margin),
    );

    // Pin just above the dockTarget's bottom edge, then clamp vertically so
    // the toolbar is never clipped at the top or bottom of the viewport.
    let top = rect.bottom - toolbarH - gap;
    top = Math.max(
      margin,
      Math.min(top, window.innerHeight - toolbarH - margin),
    );

    setToolbarPos({ top, left });
  }, [docked, dockTarget]);

  // ── Toolbar positioning & format-state polling ──────────────────────────
  const updateToolbar = useCallback(() => {
    // Docked mode does not respond to selectionchange for visibility — the
    // focus-driven effect owns show/hide there. We still refresh the toggle
    // states (the caret may have moved within the editor) and the docked
    // position (the pane may have scrolled). Visibility is left untouched so
    // a collapsed caret does not hide the docked toolbar.
    if (docked) {
      const el = editorRef.current;
      const activeEl = document.activeElement;
      if (el && activeEl && el.contains(activeEl)) {
        syncFormatState();
        positionDocked();
      }
      return;
    }

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setToolbarVisible(false);
      setFontOpen(false);
      setSizeOpen(false);
      setPaletteOpen(null);
      return;
    }

    // Only show toolbar when selection is inside our editor.
    const range = sel.getRangeAt(0);
    const el = editorRef.current;
    if (!el || !el.contains(range.commonAncestorContainer)) {
      setToolbarVisible(false);
      return;
    }

    // Read format state for all toggle commands.
    syncFormatState();

    // Position toolbar above the selection rect, clamped to viewport.
    // The toolbar uses position:fixed, so coordinates must be viewport-relative.
    // getBoundingClientRect() already returns viewport-relative values — do NOT
    // add window.scrollY / window.scrollX (that would misplace the toolbar on
    // any scrolled page).
    const rect = range.getBoundingClientRect();
    // The toolbar wraps to ~2 rows of buttons, so estimate a generous
    // height. TOP_CHROME leaves clearance for the app's fixed top bar /
    // nav so the floating toolbar is never tucked behind it.
    const toolbarH = 88;
    const toolbarW = 520;
    const gap = 8;
    const margin = 8;
    const TOP_CHROME = 116;

    let left = rect.left + rect.width / 2 - toolbarW / 2;
    // Clamp so it doesn't escape the viewport horizontally.
    left = Math.max(
      margin,
      Math.min(left, window.innerWidth - toolbarW - margin),
    );

    // Prefer placing the toolbar above the selection; if that would land
    // it in the top-chrome zone, drop it below the selection instead.
    let top = rect.top - toolbarH - gap;
    if (top < TOP_CHROME) {
      top = rect.bottom + gap;
    }
    // Always keep the whole toolbar within the viewport.
    top = Math.max(
      margin,
      Math.min(top, window.innerHeight - toolbarH - margin),
    );

    setToolbarPos({ top, left });
    setToolbarVisible(true);
  }, [docked, syncFormatState, positionDocked]);

  // ── Auto-focus on mount ─────────────────────────────────────────────
  // Inline editors open in response to a teacher action (double-click a
  // cell's text). Focusing the editable region and dropping the caret at
  // the end makes the box ready to type the instant it appears.
  useEffect(() => {
    if (!autoFocus) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false); // collapse to the end
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }, [autoFocus]);

  // ── Sanitizing emit ─────────────────────────────────────────────────
  // Every path that reports edited HTML upward goes through here so the value
  // that callers persist is already sanitized (strict allowlist, no scripts /
  // event handlers / unsafe URLs). We sanitize the EMITTED value only — the
  // live contentEditable DOM keeps its raw HTML so the caret never jumps while
  // typing. lastWrittenRef tracks the raw DOM html (set by callers before
  // emit) so the value→DOM sync effect does not overwrite the editor with the
  // sanitized string. Render sites re-sanitize as defence in depth.
  const emitChange = useCallback(
    (rawHtml: string) => {
      const clean = sanitizeHtml(rawHtml);
      // Remember the clean value so the value→DOM sync effect recognises the
      // parent's echo of our own change and skips the caret-resetting rewrite.
      lastEmittedRef.current = clean;
      onChange(clean);
    },
    [onChange],
  );

  // Toggle a checklist item's checked state. Declared BEFORE the click /
  // keydown handlers that list it in their useCallback dependency arrays —
  // those arrays are evaluated at render time, so a later `const` would hit a
  // temporal-dead-zone ("Cannot access 'toggleChecklistItem' before
  // initialization") and crash every editor mount. Flips data-checked in the
  // live DOM then emits so the state persists through sanitizeHtml().
  const toggleChecklistItem = useCallback(
    (li: HTMLLIElement) => {
      const el = editorRef.current;
      if (!el) return;
      const checked = li.getAttribute("data-checked") === "true";
      li.setAttribute("data-checked", checked ? "false" : "true");
      li.setAttribute("aria-checked", checked ? "false" : "true");
      const html = el.innerHTML;
      lastWrittenRef.current = html;
      emitChange(html);
    },
    [emitChange],
  );

  // ── Keyboard handler ────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const el = editorRef.current;

      // Keyboard toggle for the checklist: Ctrl/Cmd+Enter flips the checked
      // state of the item the caret is in. Plain Enter is left to the browser
      // so it still creates the next checklist item — overriding it would break
      // list continuation. This keeps the checklist fully keyboard-operable
      // (the marker click is the pointer path) without stealing normal keys.
      if (
        el &&
        e.key === "Enter" &&
        (e.ctrlKey || e.metaKey) &&
        !e.altKey &&
        !e.shiftKey
      ) {
        const sel = window.getSelection();
        const li = closestChecklistItem(sel?.anchorNode ?? null, el);
        if (li) {
          e.preventDefault();
          toggleChecklistItem(li);
          return;
        }
      }

      if (singleLine && e.key === "Enter") {
        e.preventDefault();
        return;
      }

      // Markdown-style auto-list: convert "- ", "* ", "1. " etc. at line
      // start into proper list items. tryAutoList returns true when it
      // consumed the keypress, at which point we report the updated HTML.
      if (el && tryAutoList(e, el, singleLine)) {
        const html = el.innerHTML;
        lastWrittenRef.current = html;
        emitChange(html);
        setEmpty(isEditorEmpty(el));
      }
    },
    [singleLine, emitChange, toggleChecklistItem],
  );

  // ── Input handler — report changes, check empty state ──────────────
  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    lastWrittenRef.current = html;
    emitChange(html);
    setEmpty(isEditorEmpty(el));
  }, [emitChange]);

  // ── Checklist click toggle ──────────────────────────────────────────
  // A click whose target falls in the marker zone of a checklist item flips
  // its checked state. The checkbox is drawn as an ::before pseudo-element on
  // the <li>, so it isn't itself a click target — we detect a hit by comparing
  // the click's X against the item's content-box left edge (the marker sits in
  // the list's left padding). Clicks on the item's TEXT pass through so the
  // caret can be placed for editing. No-op outside a checklist item.
  const handleEditorClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = editorRef.current;
      if (!el) return;
      const li = closestChecklistItem(e.target as Node, el);
      if (!li) return;
      // The marker lives in the <li>'s left padding. Treat a click at or left
      // of the padding-box's content start as a marker toggle.
      const rect = li.getBoundingClientRect();
      const padLeft = parseFloat(getComputedStyle(li).paddingLeft) || 0;
      if (e.clientX <= rect.left + padLeft) {
        e.preventDefault();
        toggleChecklistItem(li);
      }
    },
    [toggleChecklistItem],
  );

  // ── Selection change → update toolbar ──────────────────────────────
  useEffect(() => {
    document.addEventListener("selectionchange", updateToolbar);
    return () => document.removeEventListener("selectionchange", updateToolbar);
  }, [updateToolbar]);

  // ── Docked mode: focus-driven visibility ────────────────────────────
  // The floating path keys visibility off the text selection. Docked mode
  // instead keys it off editor focus, so clicking into the field — even with
  // a collapsed caret and no text selected — reveals the toolbar.
  //
  // On focus: show the toolbar, sync the toggle states, and position it.
  // On blur: hide it — UNLESS focus is moving to the toolbar itself. The
  // toolbar's onMouseDown preventDefault already keeps the editor focused
  // when a button is pressed, but we additionally guard the blur with a
  // relatedTarget check against the toolbar ref as a belt-and-braces measure
  // (relatedTarget is null in some browsers when focus leaves to nowhere).
  //
  // No-op entirely when not docked, so the floating/Weekly path is untouched.
  useEffect(() => {
    if (!docked) return;
    const el = editorRef.current;
    if (!el) return;

    function handleFocus() {
      syncFormatState();
      positionDocked();
      setToolbarVisible(true);
    }

    function handleBlur(e: FocusEvent) {
      // Keep the toolbar open when focus is moving into the toolbar — pressing
      // a toolbar button must not dismiss the docked toolbar.
      const next = e.relatedTarget as Node | null;
      if (next && toolbarRef.current?.contains(next)) return;
      setToolbarVisible(false);
      setFontOpen(false);
      setSizeOpen(false);
      setPaletteOpen(null);
    }

    el.addEventListener("focus", handleFocus);
    el.addEventListener("blur", handleBlur);
    return () => {
      el.removeEventListener("focus", handleFocus);
      el.removeEventListener("blur", handleBlur);
    };
  }, [docked, syncFormatState, positionDocked]);

  // ── Docked mode: reposition on scroll & resize ──────────────────────
  // The dockTarget's bounding rect moves as the surrounding pane scrolls or
  // the window resizes. We listen for scroll in the CAPTURE phase so the
  // handler also fires when an inner scrolling container moves — scroll
  // events do not bubble, but they are observable during capture. Only
  // recompute while the docked toolbar is actually visible.
  useEffect(() => {
    if (!docked || !toolbarVisible) return;

    function handleReposition() {
      positionDocked();
    }

    window.addEventListener("scroll", handleReposition, true); // capture phase
    window.addEventListener("resize", handleReposition);
    return () => {
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [docked, toolbarVisible, positionDocked]);

  // ── Close popups when clicking outside toolbar/editor ──────────────
  // In floating mode an outside click dismisses the whole toolbar. In docked
  // mode the toolbar's visibility is owned by editor focus/blur, so an
  // outside click only collapses any open font/color popover — hiding the
  // toolbar itself is left to the blur handler.
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        !toolbarRef.current?.contains(target) &&
        !editorRef.current?.contains(target)
      ) {
        if (!docked) setToolbarVisible(false);
        setFontOpen(false);
        setSizeOpen(false);
        setPaletteOpen(null);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [docked]);

  // ── Format command helpers ──────────────────────────────────────────

  /** Apply a format command while keeping focus in the editor. */
  const applyCommand = useCallback(
    (e: React.MouseEvent, command: string, value = "") => {
      e.preventDefault(); // prevent blur before execCommand
      editorRef.current?.focus();
      exec(command, value);
      // Re-read all toggle-command states after the command.
      syncFormatState();
      // Report the updated HTML.
      const html = editorRef.current?.innerHTML ?? "";
      lastWrittenRef.current = html;
      emitChange(html);
    },
    [emitChange, syncFormatState],
  );

  const applyTextColor = useCallback(
    (e: React.MouseEvent, variable: string) => {
      const color = resolveCssVar(variable);
      applyCommand(e, "foreColor", color);
      setPaletteOpen(null);
    },
    [applyCommand],
  );

  const applyHighlight = useCallback(
    (e: React.MouseEvent, variable: string) => {
      // "transparent" means remove highlight.
      const color =
        variable === "transparent" ? "transparent" : resolveCssVar(variable);
      applyCommand(e, "hiliteColor", color);
      setPaletteOpen(null);
    },
    [applyCommand],
  );

  const applyFont = useCallback(
    (e: React.MouseEvent, fontVariable: string) => {
      // execCommand('fontName') wraps the selection in <font face="…">.
      // Resolve CSS custom properties to their concrete computed value first —
      // the <font face> attribute does not understand var() syntax, so passing
      // "var(--font-sans)" would set a literal (invalid) font name.
      const resolved = resolveCssVar(fontVariable);
      applyCommand(e, "fontName", resolved);
      setFontOpen(false);
    },
    [applyCommand],
  );

  const applySize = useCallback(
    (e: React.MouseEvent, size: string) => {
      // execCommand('fontSize') wraps the selection in <font size="N"> using
      // the browser's legacy 1-7 scale. It is the pragmatic, universally
      // supported choice — consistent with fontName/foreColor above — and
      // works reliably at a collapsed caret as well as over a selection.
      applyCommand(e, "fontSize", size);
      setSizeOpen(false);
    },
    [applyCommand],
  );

  // ── Link / Image handlers ───────────────────────────────────────────
  // These use window.prompt for the URL — acceptable for a teacher-only
  // prototype tool. Replace with an inline popover when a richer UI is needed.

  const applyLink = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      // Preserve the selection range before the prompt steals focus.
      const sel = window.getSelection();
      const savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;

      const url = window.prompt("Enter link URL:", "https://");
      if (!url || !url.trim()) return; // cancelled or empty

      // Restore the selection that may have been lost while the prompt was open.
      if (savedRange && sel) {
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }

      editorRef.current?.focus();
      exec("createLink", url.trim());
      const html = editorRef.current?.innerHTML ?? "";
      lastWrittenRef.current = html;
      emitChange(html);
    },
    [emitChange],
  );

  // ── Insert raw HTML at a (possibly stale) caret position ────────────────
  // Restores a previously-saved Range, focuses the editor, runs
  // execCommand('insertHTML'), then emits the sanitized result. Used by the
  // image + embed inserts. Saving/restoring the Range matters because both
  // paths surrender focus first — `onRequestImageUrl` awaits async parent work,
  // and the embed prompt steals focus — which collapses the live selection.
  const insertHtmlAtSavedRange = useCallback(
    (html: string, savedRange: Range | null) => {
      const el = editorRef.current;
      if (!el) return;
      const sel = window.getSelection();
      if (savedRange && sel) {
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
      el.focus();
      // If the restored caret somehow landed outside the editor (e.g. the saved
      // range's node was removed), drop it at the end so we never inject the
      // fragment into another element.
      const cur = window.getSelection();
      if (!cur || cur.rangeCount === 0 || !el.contains(cur.anchorNode)) {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        cur?.removeAllRanges();
        cur?.addRange(range);
      }
      exec("insertHTML", html);
      const next = el.innerHTML;
      lastWrittenRef.current = next;
      emitChange(next);
      setEmpty(isEditorEmpty(el));
    },
    [emitChange],
  );

  // ── Insert image ────────────────────────────────────────────────────────
  // Storage-decoupled: when the parent supplies onRequestImageUrl we ask IT for
  // the src (upload / resolution happens entirely in the parent) and insert an
  // <img> at the caret. Without the prop we fall back to prompting for a URL —
  // the original behavior. The src is sanitized on emit, so an unsafe value is
  // dropped regardless of which path produced it.
  const applyImage = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      // Snapshot the caret BEFORE any focus loss (prompt or async resolver).
      const sel = window.getSelection();
      const savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;

      if (onRequestImageUrl) {
        // Parent-driven path. Await the resolver, then insert. Errors and a
        // null result both cancel silently — the parent owns user feedback.
        void onRequestImageUrl()
          .then((url) => {
            if (!url || !url.trim()) return;
            insertHtmlAtSavedRange(buildImageHtml(url.trim()), savedRange);
          })
          .catch(() => {
            /* parent surfaces upload failures; nothing to insert */
          });
        return;
      }

      // Fallback: prompt for a URL (original behavior).
      const url = window.prompt("Enter image URL:", "https://");
      if (!url || !url.trim()) return;
      insertHtmlAtSavedRange(buildImageHtml(url.trim()), savedRange);
    },
    [onRequestImageUrl, insertHtmlAtSavedRange],
  );

  // ── Insert embed (YouTube / Vimeo / Google) ─────────────────────────────
  // Prompt for a URL, run it through parseResourceUrl, and insert a sanitized
  // iframe when the URL maps to an embeddable trusted host. A non-embeddable
  // URL (arbitrary website, unsupported host) falls back to inserting a plain
  // hyperlink so the teacher's intent isn't lost — the sanitizer would strip a
  // foreign-origin iframe anyway, so we never even build one.
  const applyEmbed = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const sel = window.getSelection();
      const savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;

      const raw = window.prompt(
        "Paste a video or embed link (YouTube, Vimeo, Google Docs/Slides/Drive):",
        "https://",
      );
      if (!raw || !raw.trim()) return;

      const parsed = parseResourceUrl(raw.trim());
      if (parsed.kind === "embed" && parsed.embedUrl) {
        // Embeddable trusted host → sandboxed iframe.
        insertHtmlAtSavedRange(
          buildEmbedHtml(parsed.embedUrl, parsed.displayName),
          savedRange,
        );
        return;
      }
      if (parsed.kind === "image" && parsed.embedUrl) {
        // A direct image URL pasted into the embed field → inline image.
        insertHtmlAtSavedRange(
          buildImageHtml(parsed.embedUrl, parsed.displayName),
          savedRange,
        );
        return;
      }
      // Not embeddable — insert a safe hyperlink instead of silently failing.
      // createLink only runs over a selection/caret; restore the range first.
      if (savedRange && sel) {
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }
      editorRef.current?.focus();
      exec("createLink", raw.trim());
      const html = editorRef.current?.innerHTML ?? "";
      lastWrittenRef.current = html;
      emitChange(html);
    },
    [insertHtmlAtSavedRange, emitChange],
  );

  // ── Block format (headings / blockquote) ────────────────────────────
  // Toggle the caret's block between a heading/quote and a plain paragraph.
  // execCommand('formatBlock') rewraps the current block; passing the same tag
  // it already is would leave it unchanged, so we toggle back to <p> when the
  // caret is already inside that block. Works at a collapsed caret and over a
  // multi-block selection. The result is re-read so the toggle highlight tracks
  // the new block, then emitted (headings/blockquote survive sanitizeHtml()).
  const applyBlock = useCallback(
    (e: React.MouseEvent, tag: "h1" | "h2" | "blockquote") => {
      e.preventDefault();
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      const current = getBlockTagAtCaret(el);
      // formatBlock wants the tag wrapped in <>, e.g. "<h1>". Toggling the
      // active block off returns it to a normal paragraph.
      const next = current === tag ? "p" : tag;
      exec("formatBlock", `<${next}>`);
      syncFormatState();
      setBlockTag(getBlockTagAtCaret(el));
      const html = el.innerHTML;
      lastWrittenRef.current = html;
      emitChange(html);
    },
    [emitChange, syncFormatState],
  );

  // ── Interactive checklist ───────────────────────────────────────────
  // Upgrades the old cosmetic "☐ " marker to a REAL toggleable checklist.
  // Inserts a <ul data-checklist> whose <li data-checked> items flip on click
  // or keyboard (handlers below). When the selection spans text, each selected
  // line becomes its own item; otherwise a single empty item is inserted ready
  // to type. State rides on data-checked so it round-trips through
  // sanitizeHtml() (DOMPurify keeps data-*; class would be stripped).
  const applyChecklist = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const el = editorRef.current;
      if (!el) return;
      // Capture any selected text and split it into per-line items so a teacher
      // can select a few lines and convert them in one shot.
      const sel = window.getSelection();
      const savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
      const selectedText = sel ? sel.toString() : "";
      const lines = selectedText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      insertHtmlAtSavedRange(buildChecklistHtml(lines), savedRange);
    },
    [insertHtmlAtSavedRange],
  );

  // ── Insert resource card (image / embed / link) ──────────────────────────
  // Complements the bare image/embed inserts with a <figure> "card": the media
  // plus an optional caption. Reuses parseResourceUrl + buildImage/EmbedHtml so
  // the same trusted-host + safe-scheme rules apply, and the markup stays
  // sanitizer-safe (figure/figcaption are allow-listed; an unsafe src/host is
  // still dropped on emit). A non-embeddable URL falls back to a link card.
  const applyResourceCard = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const sel = window.getSelection();
      const savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;

      const raw = window.prompt(
        "Resource card — paste an image, video or document link (YouTube, Vimeo, Google, or an image URL):",
        "https://",
      );
      if (!raw || !raw.trim()) return;
      const caption =
        window.prompt("Optional caption (leave blank for none):", "") ?? "";

      const parsed = parseResourceUrl(raw.trim());
      if (parsed.kind === "embed" && parsed.embedUrl) {
        insertHtmlAtSavedRange(
          buildEmbedCardHtml(parsed.embedUrl, parsed.displayName, caption),
          savedRange,
        );
        return;
      }
      if (parsed.kind === "image" && parsed.embedUrl) {
        insertHtmlAtSavedRange(
          buildImageCardHtml(parsed.embedUrl, caption),
          savedRange,
        );
        return;
      }
      // Not embeddable / not a direct image — emit a link card so the teacher's
      // intent survives (the sanitizer hardens the anchor on emit).
      insertHtmlAtSavedRange(
        buildLinkCardHtml(raw.trim(), parsed.displayName, caption),
        savedRange,
      );
    },
    [insertHtmlAtSavedRange],
  );

  // ── Paste handler ───────────────────────────────────────────────────
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      if (singleLine) {
        // In single-line mode, intercept the paste entirely: extract plain
        // text, collapse all line breaks to a space, and insert it ourselves
        // so no <br> elements or block wrappers sneak into the editor.
        e.preventDefault();
        const text = e.clipboardData
          .getData("text/plain")
          .replace(/[\r\n]+/g, " ")
          .trim();
        if (text) {
          exec("insertText", text);
          const html = editorRef.current?.innerHTML ?? "";
          lastWrittenRef.current = html;
          emitChange(html);
          setEmpty(false);
        }
        return;
      }

      // Multi-line mode: let the browser handle the paste, then report.
      setTimeout(() => {
        const el = editorRef.current;
        if (!el) return;
        const html = el.innerHTML;
        lastWrittenRef.current = html;
        emitChange(html);
        setEmpty(isEditorEmpty(el));
      }, 0);
    },
    [singleLine, emitChange],
  );

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className={styles.root}>
      {/* Formatting toolbar — position:fixed, coordinates are viewport-relative.
          Floats near the selection by default; docked (bottom-center of the
          dockTarget) when a dockTarget ref is supplied.

          Portaled OUT of this subtree: a position:fixed element is
          offset/rescaled when an ancestor has `zoom` or a transform, and the
          lesson-detail panel renders at `zoom: 0.8`. The portal target is the
          app-shell root `.cp-root` — NOT document.body — because the toolbar's
          buttons rely on the `.cp-root button { ... }` resets and the
          `.cp-root` font cascade (tokens.css); rendering under bare <body>
          would lose them. `.cp-root` is a non-zoomed ancestor, so the toolbar
          still escapes the zoomed panel while keeping its styling. A portal
          does not change fixed-positioning behaviour. The `typeof document`
          guard keeps it inert during SSR (toolbarVisible is also client-only,
          so this never runs on the server). */}
      {toolbarVisible &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={toolbarRef}
            role="toolbar"
            aria-label="Text formatting"
            className={`${styles.toolbar} ${docked ? styles.toolbarDocked : ""}`}
            style={{
              top: toolbarPos.top,
              left: toolbarPos.left,
            }}
            // Prevent toolbar clicks from stealing focus away from the editor —
            // this keeps the editor focused (and, in docked mode, keeps the
            // focus-driven toolbar visible) when a button is pressed.
            onMouseDown={(e) => e.preventDefault()}
          >
            {/* ── Group 0: Undo / Redo ── */}
            <ToolbarButton
              label="Undo"
              onMouseDown={(e) => applyCommand(e, "undo")}
            >
              <UndoIcon />
            </ToolbarButton>

            <ToolbarButton
              label="Redo"
              onMouseDown={(e) => applyCommand(e, "redo")}
            >
              <RedoIcon />
            </ToolbarButton>

            <span className={styles.divider} aria-hidden />

            {/* ── Group 1: Inline text formatting ── */}
            <ToolbarButton
              label="Bold"
              active={bold}
              onMouseDown={(e) => applyCommand(e, "bold")}
            >
              <span className={styles.iconB}>B</span>
            </ToolbarButton>

            <ToolbarButton
              label="Italic"
              active={italic}
              onMouseDown={(e) => applyCommand(e, "italic")}
            >
              <span className={styles.iconI}>I</span>
            </ToolbarButton>

            <ToolbarButton
              label="Underline"
              active={underline}
              onMouseDown={(e) => applyCommand(e, "underline")}
            >
              <span className={styles.iconU}>U</span>
            </ToolbarButton>

            <ToolbarButton
              label="Strikethrough"
              active={strikethrough}
              onMouseDown={(e) => applyCommand(e, "strikeThrough")}
            >
              <span className={styles.iconS}>S</span>
            </ToolbarButton>

            <span className={styles.divider} aria-hidden />

            {/* ── Group 2: Script formatting ── */}
            <ToolbarButton
              label="Subscript (X₂)"
              active={subscript}
              onMouseDown={(e) => applyCommand(e, "subscript")}
            >
              <span className={styles.iconScript}>
                X<sub>₂</sub>
              </span>
            </ToolbarButton>

            <ToolbarButton
              label="Superscript (X²)"
              active={superscript}
              onMouseDown={(e) => applyCommand(e, "superscript")}
            >
              <span className={styles.iconScript}>
                X<sup>²</sup>
              </span>
            </ToolbarButton>

            <span className={styles.divider} aria-hidden />

            {/* ── Group 2b: Block format (headings / quote) ── */}
            {/* formatBlock toggles — each highlights when the caret sits inside
                that block, and pressing it again returns the line to a normal
                paragraph. */}
            <ToolbarButton
              label="Heading 1"
              active={blockTag === "h1"}
              onMouseDown={(e) => applyBlock(e, "h1")}
            >
              <span className={styles.iconHeading}>H1</span>
            </ToolbarButton>

            <ToolbarButton
              label="Heading 2"
              active={blockTag === "h2"}
              onMouseDown={(e) => applyBlock(e, "h2")}
            >
              <span className={styles.iconHeading}>H2</span>
            </ToolbarButton>

            <ToolbarButton
              label="Quote"
              active={blockTag === "blockquote"}
              onMouseDown={(e) => applyBlock(e, "blockquote")}
            >
              <span className={styles.iconQuote}>&rdquo;</span>
            </ToolbarButton>

            <span className={styles.divider} aria-hidden />

            {/* ── Group 3: Color pickers ── */}
            {/* Text color trigger */}
            <div className={styles.paletteGroup}>
              <ToolbarButton
                label="Text color"
                active={paletteOpen === "color"}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setPaletteOpen((v) => (v === "color" ? null : "color"));
                  setFontOpen(false);
                  setSizeOpen(false);
                }}
              >
                {/* A colored "A" suggesting text-color */}
                <span className={styles.iconColor}>A</span>
                <span className={styles.iconCaret} aria-hidden>
                  ▾
                </span>
              </ToolbarButton>

              {paletteOpen === "color" && (
                <div
                  className={styles.palettePopover}
                  role="group"
                  aria-label="Text color palette"
                >
                  {TEXT_COLORS.map((swatch) => (
                    <SwatchButton
                      key={swatch.variable}
                      label={swatch.label}
                      color={resolveCssVar(swatch.variable)}
                      onMouseDown={(e) => applyTextColor(e, swatch.variable)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Highlight trigger */}
            <div className={styles.paletteGroup}>
              <ToolbarButton
                label="Highlight color"
                active={paletteOpen === "highlight"}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setPaletteOpen((v) =>
                    v === "highlight" ? null : "highlight",
                  );
                  setFontOpen(false);
                  setSizeOpen(false);
                }}
              >
                <span className={styles.iconHighlight}>H</span>
                <span className={styles.iconCaret} aria-hidden>
                  ▾
                </span>
              </ToolbarButton>

              {paletteOpen === "highlight" && (
                <div
                  className={`${styles.palettePopover} ${styles.highlightPopover}`}
                  role="group"
                  aria-label="Highlight color palette"
                >
                  {/* Clear highlight */}
                  <div className={styles.paletteSection}>
                    <span className={styles.paletteSectionLabel} aria-hidden>
                      Clear
                    </span>
                    <SwatchButton
                      key="transparent"
                      label="No highlight"
                      color="transparent"
                      isNone
                      onMouseDown={(e) => applyHighlight(e, "transparent")}
                    />
                  </div>

                  {/* Font-color set — the same swatches as the text-color picker */}
                  <div className={styles.paletteSection}>
                    <span className={styles.paletteSectionLabel} aria-hidden>
                      Colors
                    </span>
                    <div className={styles.swatchRow}>
                      {HIGHLIGHT_COLORS.map((swatch) => (
                        <SwatchButton
                          key={swatch.variable}
                          label={swatch.label}
                          color={resolveCssVar(swatch.variable)}
                          onMouseDown={(e) =>
                            applyHighlight(e, swatch.variable)
                          }
                        />
                      ))}
                    </div>
                  </div>

                  {/* Highlighter-pen set — bright marker colors */}
                  <div className={styles.paletteSection}>
                    <span className={styles.paletteSectionLabel} aria-hidden>
                      Highlighters
                    </span>
                    <div className={styles.swatchRow}>
                      {HIGHLIGHTERS.map((swatch) => (
                        <SwatchButton
                          key={swatch.variable}
                          label={swatch.label}
                          color={resolveCssVar(swatch.variable)}
                          onMouseDown={(e) =>
                            applyHighlight(e, swatch.variable)
                          }
                        />
                      ))}
                    </div>
                  </div>

                  {/* Pastel (soft tint) highlight set */}
                  <div className={styles.paletteSection}>
                    <span className={styles.paletteSectionLabel} aria-hidden>
                      Pastel
                    </span>
                    <div className={styles.swatchRow}>
                      {HIGHLIGHT_PASTEL.map((swatch) => (
                        <SwatchButton
                          key={swatch.variable}
                          label={swatch.label}
                          color={resolveCssVar(swatch.variable)}
                          onMouseDown={(e) =>
                            applyHighlight(e, swatch.variable)
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <span className={styles.divider} aria-hidden />

            {/* ── Group 4: Lists ── */}
            <ToolbarButton
              label="Numbered list"
              active={false}
              onMouseDown={(e) => applyCommand(e, "insertOrderedList")}
            >
              <span className={styles.iconList}>1≡</span>
            </ToolbarButton>

            <ToolbarButton
              label="Bullet list"
              active={false}
              onMouseDown={(e) => applyCommand(e, "insertUnorderedList")}
            >
              {/* Unicode bullet + rule approximating the list icon */}
              <span className={styles.iconList}>•≡</span>
            </ToolbarButton>

            <ToolbarButton
              label="Checklist — insert tick-box items you can check off as you teach"
              active={false}
              onMouseDown={applyChecklist}
            >
              <span className={styles.iconList}>☑</span>
            </ToolbarButton>

            <span className={styles.divider} aria-hidden />

            {/* ── Group 5: Insert ── */}
            <ToolbarButton
              label="Insert link"
              active={false}
              onMouseDown={applyLink}
            >
              <span className={styles.iconInsert}>🔗</span>
            </ToolbarButton>

            <ToolbarButton
              label="Insert image — add a picture inline in your notes"
              active={false}
              onMouseDown={applyImage}
            >
              <span className={styles.iconInsert}>🖼</span>
            </ToolbarButton>

            <ToolbarButton
              label="Insert embed — paste a YouTube, Vimeo or Google link to drop the player into your notes"
              active={false}
              onMouseDown={applyEmbed}
            >
              <span className={styles.iconEmbed}>▶</span>
            </ToolbarButton>

            <ToolbarButton
              label="Insert resource card — an image, video or link wrapped in a captioned card"
              active={false}
              onMouseDown={applyResourceCard}
            >
              <span className={styles.iconCard} aria-hidden>
                <span className={styles.iconCardTop} />
                <span className={styles.iconCardLine} />
              </span>
            </ToolbarButton>

            <span className={styles.divider} aria-hidden />

            {/* ── Group 6: Font family picker ── */}
            <div className={styles.paletteGroup}>
              <ToolbarButton
                label="Font family"
                active={fontOpen}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setFontOpen((v) => !v);
                  setPaletteOpen(null);
                  setSizeOpen(false);
                }}
              >
                <span className={styles.iconFont}>Aa</span>
                <span className={styles.iconCaret} aria-hidden>
                  ▾
                </span>
              </ToolbarButton>

              {fontOpen && (
                <div
                  className={`${styles.palettePopover} ${styles.fontPopover}`}
                  role="group"
                  aria-label="Font family"
                >
                  {FONT_OPTIONS.map((opt) => (
                    <button
                      key={opt.variable}
                      type="button"
                      aria-label={`Font: ${opt.label}`}
                      title={opt.label}
                      className={`${styles.fontOption} cp-focusable`}
                      style={{ fontFamily: opt.css }}
                      onMouseDown={(e) => applyFont(e, opt.variable)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Group 7: Text size picker ── */}
            {/* Mirrors the font-family picker: a trigger button + a popover of
                size options, mutually exclusive with the font/color popovers. */}
            <div className={styles.paletteGroup}>
              <ToolbarButton
                label="Text size"
                active={sizeOpen}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setSizeOpen((v) => !v);
                  setFontOpen(false);
                  setPaletteOpen(null);
                }}
              >
                {/* A small "A" beside a large "A" suggesting size choice. */}
                <span className={styles.iconSize}>
                  <span className={styles.iconSizeSmall}>A</span>A
                </span>
                <span className={styles.iconCaret} aria-hidden>
                  ▾
                </span>
              </ToolbarButton>

              {sizeOpen && (
                <div
                  className={`${styles.palettePopover} ${styles.sizePopover}`}
                  role="group"
                  aria-label="Text size"
                >
                  {SIZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.size}
                      type="button"
                      aria-label={`Text size: ${opt.label}`}
                      title={opt.label}
                      className={`${styles.sizeOption} cp-focusable`}
                      // Preview each option at its own size, pulled from the
                      // --t-* type scale (never a hard-coded px value).
                      style={{ fontSize: `var(${opt.previewVar})` }}
                      onMouseDown={(e) => applySize(e, opt.size)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>,
          document.querySelector(".cp-root") ?? document.body,
        )}

      {/* Editable region */}
      <div className={styles.editorWrap}>
        {/* Placeholder — rendered behind the content via CSS pointer-events:none */}
        {empty && placeholder && (
          <div className={styles.placeholder} aria-hidden>
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          role="textbox"
          aria-multiline={!singleLine}
          aria-label={ariaLabel ?? placeholder ?? "Text editor"}
          contentEditable
          suppressContentEditableWarning
          className={`${styles.editor} ${singleLine ? styles.editorSingleLine : ""}`}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onClick={handleEditorClick}
          onPaste={handlePaste}
        />
      </div>
    </div>
  );
}
