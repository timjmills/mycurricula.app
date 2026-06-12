"use client";

// rich-text-editor.tsx — Inline rich-text editor with a floating toolbar.
//
// Design (6.12.26 resource-redesign §6 — THE finite toolbar vocabulary):
// a borderless contentEditable region with a compact toolbar (floating near
// the selection, or docked when `dockTarget` is supplied) carrying EXACTLY:
//   • Bold / Italic / Underline                 (execCommand; ⌘B/⌘I/⌘U native)
//   • Highlight — the 10 highlighter pens + clear (execCommand hiliteColor)
//   • Heading (h3 toggle) / Bulleted list       (execCommand)
//   • Link — inline popover with Save / Open / Remove (⌘K; clicking an
//     existing link in the editor reopens the same popover to edit it)
//   • Image (insertHTML; parent-resolved src or URL prompt)
// The toolbar defines the entire allowed INPUT vocabulary; the sanitizer
// (lib/sanitize-html.ts) stays the output boundary, untouched.
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
import { Button, Tooltip } from "@/components/ui";
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

// Highlighter-pen colors — the classic bright marker set. The redesign's
// highlight control offers EXACTLY these 10 pens (plus a clear option).
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
//   "1. " "2. " … (number + period + space) → insertUnorderedList
//
// §6 vocabulary note (§4a review L2): EVERY marker maps to the BULLETED list.
// The redesign's finite toolbar vocabulary contains exactly one list control
// (bulleted); <ol> has no toolbar toggle, so an ordered list created by a
// shortcut would be markup the teacher can see but cannot manage — outside
// the "toolbar defines the entire allowed INPUT vocabulary" contract. We keep
// the "1. " trigger (the muscle-memory of typing a numbered list still lands
// in A list) but emit the sanctioned <ul>.
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

/** List marker patterns. All three forms trigger the same bulleted list —
 *  the §6 vocabulary has no ordered-list control (see header comment). */
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

  // Every marker — "-", "*", AND "1." — emits the UNORDERED list: the §6
  // finite toolbar vocabulary has a bulleted-list control only, so <ol> is
  // never produced (see the vocabulary note in the header comment above).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (document as any).execCommand("insertUnorderedList", false, undefined);

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

/** Build the HTML for a typed-URL link (used when the caret is collapsed, so
 *  createLink has no selection to wrap — the URL itself becomes the text).
 *  Escaped here, and the href is re-validated by the sanitizer on emit. */
function buildLinkHtml(href: string): string {
  return `<a href="${escapeAttr(href)}">${escapeAttr(href)}</a>`;
}

// ── Link-popover scheme guard (§4a review M2) ────────────────────────────────
//
// The popover used to write whatever the teacher typed straight into the live
// DOM. Two failure modes:
//   • `javascript:alert(1)` — a self-XSS foothold in the live (unsanitized)
//     contentEditable, even though sanitizeHtml strips it on emit.
//   • `example.com` (scheme-less) — survives the live DOM but DOMPurify's
//     ALLOWED_URI_REGEXP (lib/sanitize-html SAFE_URI, http(s)/mailto only)
//     silently drops the href on emit, persisting a DEAD link with zero
//     feedback.
// So we validate/normalize BEFORE anything touches the DOM. The accepted set
// mirrors SAFE_URI exactly — http(s) and mailto: (the sanitizer keeps mailto,
// so we do too); every other explicit scheme is refused and Save stays
// disabled. Scheme-less input is upgraded by prepending "https://" so
// "example.com" round-trips as a working link instead of dying on emit.

/**
 * Normalize a typed link target to a value the sanitizer will keep, or null
 * when it cannot be made safe (Save must stay disabled / be a no-op).
 *   "https://x.org/a"  → unchanged          "example.com" → "https://example.com"
 *   "mailto:a@b.org"   → unchanged          "javascript:…" / "data:…" → null
 */
function normalizeLinkHref(raw: string): string | null {
  const input = raw.trim();
  if (!input) return null;

  // Explicit scheme present — accept exactly the sanitizer's SAFE_URI set.
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) {
    if (/^mailto:/i.test(input)) return input;
    if (!/^https?:\/\//i.test(input)) return null; // javascript:, data:, file:, …
    try {
      new URL(input); // must be a parseable absolute URL
      return input;
    } catch {
      return null;
    }
  }

  // Scheme-less ("example.com/page") — upgrade to https. Leading slashes are
  // stripped first so protocol-relative "//host" can't smuggle an ambiguous
  // target; the result must still parse as a real absolute URL.
  const candidate = `https://${input.replace(/^\/+/, "")}`;
  try {
    new URL(candidate);
    return candidate;
  } catch {
    return null;
  }
}

// ── Toolbar sub-components ────────────────────────────────────────────────────

interface ToolbarButtonProps {
  /** Accessible name (aria-label). */
  label: string;
  /** Onboarding tooltip body (CLAUDE.md §4 voice — teaches the control). */
  tip: string;
  /** Stable tooltipId for W2-B3 dismissibility. */
  tipId: string;
  active?: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  children: ReactNode;
}

function ToolbarButton({
  label,
  tip,
  tipId,
  active = false,
  onMouseDown,
  children,
}: ToolbarButtonProps) {
  return (
    <Tooltip content={tip} tooltipId={tipId}>
      <button
        type="button"
        aria-label={label}
        // aria-pressed is only set when the caller passes active=true (toggle
        // buttons: bold, italic, etc.). Action-only buttons (insert link/image)
        // pass active={false} and must NOT carry aria-pressed at all — a
        // persistent aria-pressed="false" tells screen readers the button is a
        // toggle that is currently off, which is misleading for one-shot
        // actions.
        aria-pressed={active ? true : undefined}
        className={`${styles.tbBtn} ${active ? styles.tbBtnActive : ""} cp-focusable`}
        onMouseDown={onMouseDown}
      >
        {children}
      </button>
    </Tooltip>
  );
}

interface SwatchButtonProps {
  label: string;
  /** Onboarding tooltip body. */
  tip: string;
  /** Stable tooltipId for dismissibility. */
  tipId: string;
  color: string; // resolved CSS color
  isNone?: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}

function SwatchButton({
  label,
  tip,
  tipId,
  color,
  isNone = false,
  onMouseDown,
}: SwatchButtonProps) {
  return (
    <Tooltip content={tip} tooltipId={tipId}>
      <button
        type="button"
        aria-label={label}
        className={`${styles.swatch} ${isNone ? styles.swatchNone : ""} cp-focusable`}
        style={isNone ? undefined : { background: color }}
        onMouseDown={onMouseDown}
      />
    </Tooltip>
  );
}

// ── Toolbar icons — Lucide-family line glyphs (2px stroke, round caps) ───────

function ListIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="9" y1="6" x2="21" y2="6" />
      <line x1="9" y1="12" x2="21" y2="12" />
      <line x1="9" y1="18" x2="21" y2="18" />
      <circle cx="4.5" cy="6" r="0.5" fill="currentColor" />
      <circle cx="4.5" cy="12" r="0.5" fill="currentColor" />
      <circle cx="4.5" cy="18" r="0.5" fill="currentColor" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" />
    </svg>
  );
}

function OpenIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
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
  // Block-level toggles: heading (the current block is an <h3>) and
  // bulleted list (the caret sits inside a <ul>).
  const [heading, setHeading] = useState(false);
  const [bulleted, setBulleted] = useState(false);

  // Whether the editor content is empty (for placeholder).
  // Initial state: treat as empty when value is blank or a bare <br>.
  const [empty, setEmpty] = useState(
    () => !value || value === "<br>" || value === "<br/>",
  );

  // Highlight pen popover open state.
  const [highlightOpen, setHighlightOpen] = useState(false);

  // Link popover (the `.rn-linkPop` anatomy: URL input + Save / Open /
  // Remove). `anchor` is the existing <a> being edited (null when creating a
  // new link over the saved selection). Coordinates are viewport-relative —
  // the popover renders position:fixed in the same portal as the toolbar.
  const [linkPop, setLinkPop] = useState<{
    top: number;
    left: number;
    href: string;
    anchor: HTMLAnchorElement | null;
  } | null>(null);
  const linkPopRef = useRef<HTMLDivElement>(null);
  // The selection Range captured when the popover opened — restored before
  // createLink/insert so the link lands where the teacher's selection was
  // (the popover's input steals focus and collapses the live selection).
  const savedLinkRangeRef = useRef<Range | null>(null);

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
    setBulleted(document.queryCommandState("insertUnorderedList"));
    // queryCommandValue("formatBlock") reports the current block tag ("h3",
    // "p", "div", …) even at a collapsed caret.
    setHeading(
      String(document.queryCommandValue("formatBlock")).toLowerCase() === "h3",
    );
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
    // Single-row estimate for the finite 8-control bar — matches the
    // estimate used by the floating path so clamping is consistent.
    const toolbarH = 44;
    const toolbarW = 330;
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
      setHighlightOpen(false);
      // NOTE: the link popover is deliberately NOT closed here — opening it
      // moves focus to its URL input, which collapses the editor selection;
      // closing it on that collapse would make the popover undismissable.
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
    // Single-row estimate for the finite 8-control bar. TOP_CHROME leaves
    // clearance for the app's fixed top bar / nav so the floating toolbar
    // is never tucked behind it.
    const toolbarH = 44;
    const toolbarW = 330;
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

  // ── Link popover open paths ─────────────────────────────────────────
  // Three entry points share openLinkFromSelection: the toolbar Link button,
  // ⌘K/Ctrl+K, and clicking an existing <a> inside the editor (which passes
  // the anchor + its rect directly to openLinkPopover).

  const openLinkPopover = useCallback(
    (rect: DOMRect, anchor: HTMLAnchorElement | null) => {
      // Snapshot the selection before the popover's input steals focus.
      const sel = window.getSelection();
      savedLinkRangeRef.current =
        sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;

      // Position below the selection/link, clamped inside the viewport.
      const popW = 340;
      const popH = 56;
      const gap = 8;
      const margin = 8;
      let left = rect.left;
      left = Math.max(
        margin,
        Math.min(left, window.innerWidth - popW - margin),
      );
      let top = rect.bottom + gap;
      if (top + popH > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - popH - gap);
      }

      setHighlightOpen(false);
      setLinkPop({
        top,
        left,
        href: anchor?.getAttribute("href") ?? "",
        anchor,
      });
    },
    [],
  );

  const openLinkFromSelection = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;

    // Editing an existing link when the selection/caret sits inside one.
    const node = range.commonAncestorContainer;
    const elNode =
      node.nodeType === Node.ELEMENT_NODE
        ? (node as Element)
        : node.parentElement;
    const closest = elNode?.closest("a") ?? null;
    const anchor =
      closest && el.contains(closest) ? (closest as HTMLAnchorElement) : null;

    // A collapsed caret in an empty editor yields a zero rect — anchor the
    // popover to the editor itself so it never opens at the viewport origin.
    let rect = anchor
      ? anchor.getBoundingClientRect()
      : range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0)
      rect = el.getBoundingClientRect();
    openLinkPopover(rect, anchor);
  }, [openLinkPopover]);

  // ── Keyboard handler ────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (singleLine && e.key === "Enter") {
        e.preventDefault();
        return;
      }

      // ⌘K / Ctrl+K opens the link popover for the current selection (B/I/U
      // shortcuts are the browser's native contentEditable bindings).
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === "k"
      ) {
        e.preventDefault();
        openLinkFromSelection();
        return;
      }

      // Markdown-style auto-list: convert "- ", "* ", "1. " etc. at line
      // start into proper list items. tryAutoList returns true when it
      // consumed the keypress, at which point we report the updated HTML.
      const el = editorRef.current;
      if (el && tryAutoList(e, el, singleLine)) {
        const html = el.innerHTML;
        lastWrittenRef.current = html;
        emitChange(html);
        setEmpty(isEditorEmpty(el));
      }
    },
    [singleLine, emitChange, openLinkFromSelection],
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
      // Keep the toolbar open when focus is moving into the toolbar or the
      // link popover — pressing a toolbar button / typing a URL must not
      // dismiss the docked toolbar.
      const next = e.relatedTarget as Node | null;
      if (
        next &&
        (toolbarRef.current?.contains(next) ||
          linkPopRef.current?.contains(next))
      )
        return;
      setToolbarVisible(false);
      setHighlightOpen(false);
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

  // ── Close popups when clicking outside toolbar/editor/link popover ──
  // In floating mode an outside click dismisses the whole toolbar. In docked
  // mode the toolbar's visibility is owned by editor focus/blur, so an
  // outside click only collapses any open popover — hiding the toolbar
  // itself is left to the blur handler.
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        !toolbarRef.current?.contains(target) &&
        !editorRef.current?.contains(target) &&
        !linkPopRef.current?.contains(target)
      ) {
        if (!docked) setToolbarVisible(false);
        setHighlightOpen(false);
        setLinkPop(null);
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

  const applyHighlight = useCallback(
    (e: React.MouseEvent, variable: string) => {
      // "transparent" means remove highlight.
      const color =
        variable === "transparent" ? "transparent" : resolveCssVar(variable);
      applyCommand(e, "hiliteColor", color);
      setHighlightOpen(false);
    },
    [applyCommand],
  );

  // ── Heading toggle ──────────────────────────────────────────────────
  // The spec's single "H" control: formatBlock the current line to <h3>
  // (the `.rn-notesBody` heading level), or back to <p> when it already is
  // one. <h3> is within the sanitizer's allowlist.
  const applyHeading = useCallback(
    (e: React.MouseEvent) => {
      const isHeading =
        String(document.queryCommandValue("formatBlock")).toLowerCase() ===
        "h3";
      applyCommand(e, "formatBlock", isHeading ? "<p>" : "<h3>");
    },
    [applyCommand],
  );

  // ── Link button (toolbar) ───────────────────────────────────────────
  // Opens the `.rn-linkPop` popover for the current selection — prefilled
  // when the caret sits inside an existing link. mousedown + preventDefault
  // so the editor selection survives the click.
  const applyLink = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      openLinkFromSelection();
    },
    [openLinkFromSelection],
  );

  // ── Link popover actions (Save / Open / Remove) ─────────────────────

  const closeLinkPop = useCallback((refocus: boolean) => {
    setLinkPop(null);
    savedLinkRangeRef.current = null;
    if (refocus) editorRef.current?.focus();
  }, []);

  const saveLink = useCallback(() => {
    const pop = linkPop;
    const el = editorRef.current;
    if (!pop || !el) return;
    // M2 — validate/normalize BEFORE anything touches the DOM. null covers
    // both "nothing typed" (Remove is the unlink path) and a refused scheme
    // (javascript:/data:/…); the Save button is disabled for both, so this is
    // belt-and-braces for the Enter-to-save keyboard path. The NORMALIZED
    // value is what gets written, so the click-to-edit prefill (which reads
    // the anchor's href back) round-trips it exactly.
    const url = normalizeLinkHref(pop.href);
    if (!url) return;

    if (pop.anchor && el.contains(pop.anchor)) {
      // Editing an existing link: just rewrite its href. The sanitizer
      // re-validates the scheme on emit as defence in depth.
      pop.anchor.setAttribute("href", url);
    } else {
      // Creating a new link over the saved selection.
      const sel = window.getSelection();
      const saved = savedLinkRangeRef.current;
      if (sel && saved) {
        sel.removeAllRanges();
        sel.addRange(saved);
      }
      el.focus();
      const cur = window.getSelection();
      if (cur && cur.rangeCount > 0 && !cur.getRangeAt(0).collapsed) {
        exec("createLink", url);
      } else {
        // Collapsed caret — createLink has nothing to wrap, so insert the
        // normalized URL itself as the link text (escaped; re-vetted on emit).
        exec("insertHTML", buildLinkHtml(url));
      }
    }

    closeLinkPop(true);
    const html = el.innerHTML;
    lastWrittenRef.current = html;
    emitChange(html);
  }, [linkPop, closeLinkPop, emitChange]);

  const openLinkTarget = useCallback(() => {
    const url = linkPop?.href.trim();
    if (!url || !/^https?:\/\//i.test(url)) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [linkPop]);

  const removeLink = useCallback(() => {
    const pop = linkPop;
    const el = editorRef.current;
    if (!pop || !el) return;

    if (pop.anchor && el.contains(pop.anchor)) {
      // Unwrap the anchor in place — its text content stays.
      pop.anchor.replaceWith(...Array.from(pop.anchor.childNodes));
    } else {
      const sel = window.getSelection();
      const saved = savedLinkRangeRef.current;
      if (sel && saved) {
        sel.removeAllRanges();
        sel.addRange(saved);
      }
      el.focus();
      exec("unlink");
    }

    closeLinkPop(true);
    const html = el.innerHTML;
    lastWrittenRef.current = html;
    emitChange(html);
  }, [linkPop, closeLinkPop, emitChange]);

  // ── Click an existing link inside the editor → edit popover ─────────
  // (Links inside contentEditable don't navigate on click; preventDefault is
  // belt-and-braces.) The popover opens anchored to the link, prefilled.
  const handleEditorClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target as Element | null;
      const anchor = (target?.closest?.("a") ??
        null) as HTMLAnchorElement | null;
      if (!anchor || !editorRef.current?.contains(anchor)) {
        // A plain click back into the text dismisses an open link popover
        // (the outside-pointerdown handler skips editor-internal clicks).
        setLinkPop(null);
        return;
      }
      e.preventDefault();
      openLinkPopover(anchor.getBoundingClientRect(), anchor);
    },
    [openLinkPopover],
  );

  // ── Insert raw HTML at a (possibly stale) caret position ────────────────
  // Restores a previously-saved Range, focuses the editor, runs
  // execCommand('insertHTML'), then emits the sanitized result. Used by the
  // image insert. Saving/restoring the Range matters because the path
  // surrenders focus first — `onRequestImageUrl` awaits async parent work
  // (or the URL prompt steals focus) — which collapses the live selection.
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
      // cloneRange() — like the link path — because getRangeAt() returns a
      // LIVE Range the browser mutates as the selection moves; an un-cloned
      // snapshot would drift while the resolver/prompt holds focus (L3).
      const sel = window.getSelection();
      const savedRange =
        sel && sel.rangeCount > 0 ? sel.getRangeAt(0).cloneRange() : null;

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

      // Multi-line mode, HTML flavor present (§4a review L1): NEVER let the
      // browser insert the raw clipboard HTML. The live contentEditable DOM is
      // deliberately left unsanitized while typing (caret safety), and
      // sanitize-on-emit only cleans the value REPORTED upward — so a pasted
      // `<img onerror=…>`/`<script>` would execute in-session the moment the
      // browser inserted it, before any emit. Run the clipboard string through
      // the same sanitizeHtml gate FIRST, then insert the clean fragment.
      const clipboardHtml = e.clipboardData.getData("text/html");
      if (clipboardHtml) {
        e.preventDefault();
        const clean = sanitizeHtml(clipboardHtml);
        if (clean) exec("insertHTML", clean);
        const el = editorRef.current;
        if (!el) return;
        const html = el.innerHTML;
        lastWrittenRef.current = html;
        emitChange(html);
        setEmpty(isEditorEmpty(el));
        return;
      }

      // Plain-text-only paste: unchanged — let the browser handle the
      // insertion natively, then report the result.
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

  // M2 — the popover's Save gate, recomputed per keystroke (the input is
  // controlled). null ⇒ the typed value can't become a sanitizer-safe href,
  // so Save shows a visible disabled state (mirroring the Open button's
  // scheme guard) instead of silently emitting a dead or dangerous link.
  const normalizedLinkHref = linkPop ? normalizeLinkHref(linkPop.href) : null;

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
            {/* ── Inline formatting: B / I / U / Highlight ── */}
            <ToolbarButton
              label="Bold"
              tip="Bold (Ctrl+B / ⌘B)"
              tipId="rte-bold"
              active={bold}
              onMouseDown={(e) => applyCommand(e, "bold")}
            >
              <span className={styles.iconB}>B</span>
            </ToolbarButton>

            <ToolbarButton
              label="Italic"
              tip="Italic (Ctrl+I / ⌘I)"
              tipId="rte-italic"
              active={italic}
              onMouseDown={(e) => applyCommand(e, "italic")}
            >
              <span className={styles.iconI}>I</span>
            </ToolbarButton>

            <ToolbarButton
              label="Underline"
              tip="Underline (Ctrl+U / ⌘U)"
              tipId="rte-underline"
              active={underline}
              onMouseDown={(e) => applyCommand(e, "underline")}
            >
              <span className={styles.iconU}>U</span>
            </ToolbarButton>

            {/* Highlight — the 10 highlighter pens + clear. */}
            <div className={styles.paletteGroup}>
              <ToolbarButton
                label="Highlight"
                tip="Highlight — pick a pen color for the selected text"
                tipId="rte-highlight"
                active={highlightOpen}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setHighlightOpen((v) => !v);
                }}
              >
                <span className={styles.iconHl} aria-hidden />
              </ToolbarButton>

              {highlightOpen && (
                <div
                  className={styles.palettePopover}
                  role="group"
                  aria-label="Highlight pens"
                >
                  <SwatchButton
                    label="No highlight"
                    tip="Remove the highlight from the selected text"
                    tipId="rte-pen-clear"
                    color="transparent"
                    isNone
                    onMouseDown={(e) => applyHighlight(e, "transparent")}
                  />
                  {HIGHLIGHTERS.map((swatch) => (
                    <SwatchButton
                      key={swatch.variable}
                      label={swatch.label}
                      tip={`Highlight with ${swatch.label.toLowerCase()}`}
                      tipId={`rte-pen-${swatch.variable}`}
                      color={resolveCssVar(swatch.variable)}
                      onMouseDown={(e) => applyHighlight(e, swatch.variable)}
                    />
                  ))}
                </div>
              )}
            </div>

            <span className={styles.divider} aria-hidden />

            {/* ── Block formatting: Heading / Bulleted list ── */}
            <ToolbarButton
              label="Heading"
              tip="Heading — turn the current line into a section heading"
              tipId="rte-heading"
              active={heading}
              onMouseDown={applyHeading}
            >
              <span className={styles.iconH}>H</span>
            </ToolbarButton>

            <ToolbarButton
              label="Bulleted list"
              tip="Bulleted list — turn the selected lines into bullets"
              tipId="rte-list"
              active={bulleted}
              onMouseDown={(e) => applyCommand(e, "insertUnorderedList")}
            >
              <ListIcon />
            </ToolbarButton>

            <span className={styles.divider} aria-hidden />

            {/* ── Insert: Link / Image ── */}
            <ToolbarButton
              label="Insert link"
              tip="Insert link (Ctrl+K / ⌘K) — link the selected text; click an existing link to edit it"
              tipId="rte-link"
              onMouseDown={applyLink}
            >
              <LinkIcon />
            </ToolbarButton>

            <ToolbarButton
              label="Insert image"
              tip="Insert image — add a picture inline in your notes"
              tipId="rte-image"
              onMouseDown={applyImage}
            >
              <ImageIcon />
            </ToolbarButton>
          </div>,
          document.querySelector(".cp-root") ?? document.body,
        )}

      {/* Link popover — the `.rn-linkPop` anatomy: URL input + Save / Open /
          Remove. Portaled alongside the toolbar (same .cp-root reasoning);
          position:fixed at viewport coordinates computed on open. Esc closes
          and returns focus to the editor; Enter saves. */}
      {linkPop &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={linkPopRef}
            role="dialog"
            aria-label="Edit link"
            className={styles.linkPop}
            style={{ top: linkPop.top, left: linkPop.left }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                closeLinkPop(true);
              } else if (e.key === "Enter") {
                e.preventDefault();
                saveLink();
              }
            }}
          >
            <input
              type="url"
              className={styles.linkInput}
              value={linkPop.href}
              placeholder="https://…"
              aria-label="Link URL"
              autoFocus
              onChange={(e) => {
                const href = e.target.value;
                setLinkPop((p) => (p ? { ...p, href } : p));
              }}
            />
            <Button
              variant="primary"
              size="sm"
              onClick={saveLink}
              disabled={normalizedLinkHref === null}
              // Tooltip only while disabled-by-scheme — it explains WHY Save is
              // off (CLAUDE.md §4: disabled controls explain themselves). An
              // enabled Save is self-evident and carries no tooltip.
              tooltip={
                linkPop.href.trim() && normalizedLinkHref === null
                  ? "Links must be a web address (https://…) or an email (mailto:…)"
                  : undefined
              }
            >
              Save
            </Button>
            <Button
              variant="icon"
              size="sm"
              onClick={openLinkTarget}
              disabled={!/^https?:\/\//i.test(linkPop.href.trim())}
              iconAriaLabel="Open link"
              tooltip="Open this link in a new tab"
            >
              <OpenIcon />
            </Button>
            <Button
              variant="icon"
              size="sm"
              className={styles.linkRemoveBtn}
              onClick={removeLink}
              iconAriaLabel="Remove link"
              tooltip="Remove the link — the text stays"
            >
              <TrashIcon />
            </Button>
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
          onPaste={handlePaste}
          onClick={handleEditorClick}
        />
      </div>
    </div>
  );
}
