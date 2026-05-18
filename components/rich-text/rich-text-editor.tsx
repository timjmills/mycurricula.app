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
// XSS note: `value` is written via innerHTML and is teacher-authored content
// rendered back only to the same teacher. There is no cross-user injection
// risk in the current single-user prototype. When multi-user persistence
// lands (Supabase backend), sanitize stored HTML with DOMPurify before
// trusting it from the server.
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

// Pastel (soft tint) highlight colors — the subject light tokens, softer tones.
const HIGHLIGHT_PASTEL: ColorSwatch[] = [
  { label: "Math pastel", variable: "--math-light" },
  { label: "Reading pastel", variable: "--reading-light" },
  { label: "Writing pastel", variable: "--writing-light" },
  { label: "Grammar pastel", variable: "--grammar-light" },
  { label: "Spelling pastel", variable: "--spelling-light" },
  { label: "UFLI pastel", variable: "--ufli-light" },
  { label: "Explorers pastel", variable: "--explorers-light" },
  { label: "SEL pastel", variable: "--sel-light" },
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

// ── Helpers ──────────────────────────────────────────────────────────────────

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
}: RichTextEditorProps): ReactNode {
  const editorRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Last value we wrote into the DOM — used to avoid caret-resetting writes.
  const lastWrittenRef = useRef<string>("");

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

  // Whether the editor content is empty (for placeholder).
  // Initial state: treat as empty when value is blank or a bare <br>.
  const [empty, setEmpty] = useState(
    () => !value || value === "<br>" || value === "<br/>",
  );

  // Font picker open state.
  const [fontOpen, setFontOpen] = useState(false);

  // Color/highlight palette open state.
  const [paletteOpen, setPaletteOpen] = useState<"color" | "highlight" | null>(
    null,
  );

  // ── Sync value → DOM (only when it genuinely differs) ──────────────
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    // Write on first mount regardless; afterwards only if externally changed.
    if (el.innerHTML !== value && value !== lastWrittenRef.current) {
      el.innerHTML = value;
      lastWrittenRef.current = value;
    }
    setEmpty(isEditorEmpty(el));
  }, [value]);

  // ── Toolbar positioning & format-state polling ──────────────────────────
  const updateToolbar = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setToolbarVisible(false);
      setFontOpen(false);
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
    setBold(document.queryCommandState("bold"));
    setItalic(document.queryCommandState("italic"));
    setUnderline(document.queryCommandState("underline"));
    setStrikethrough(document.queryCommandState("strikeThrough"));
    setSubscript(document.queryCommandState("subscript"));
    setSuperscript(document.queryCommandState("superscript"));

    // Position toolbar above the selection rect, clamped to viewport.
    // The toolbar uses position:fixed, so coordinates must be viewport-relative.
    // getBoundingClientRect() already returns viewport-relative values — do NOT
    // add window.scrollY / window.scrollX (that would misplace the toolbar on
    // any scrolled page).
    const rect = range.getBoundingClientRect();
    // Wider estimate: toolbar can wrap, so account for the full button set.
    const toolbarH = 42;
    const toolbarW = 520;
    const gap = 8;

    let top = rect.top - toolbarH - gap;
    let left = rect.left + rect.width / 2 - toolbarW / 2;

    // Clamp so it doesn't escape the viewport horizontally.
    left = Math.max(8, Math.min(left, window.innerWidth - toolbarW - 8));
    // If not enough room above, flip below.
    if (rect.top < toolbarH + gap + 4) {
      top = rect.bottom + gap;
    }

    setToolbarPos({ top, left });
    setToolbarVisible(true);
  }, []);

  // ── Keyboard handler ────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (singleLine && e.key === "Enter") {
        e.preventDefault();
        return;
      }
    },
    [singleLine],
  );

  // ── Input handler — report changes, check empty state ──────────────
  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    lastWrittenRef.current = html;
    onChange(html);
    setEmpty(isEditorEmpty(el));
  }, [onChange]);

  // ── Selection change → update toolbar ──────────────────────────────
  useEffect(() => {
    document.addEventListener("selectionchange", updateToolbar);
    return () => document.removeEventListener("selectionchange", updateToolbar);
  }, [updateToolbar]);

  // ── Close popups when clicking outside toolbar/editor ──────────────
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        !toolbarRef.current?.contains(target) &&
        !editorRef.current?.contains(target)
      ) {
        setToolbarVisible(false);
        setFontOpen(false);
        setPaletteOpen(null);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  // ── Format command helpers ──────────────────────────────────────────

  /** Apply a format command while keeping focus in the editor. */
  const applyCommand = useCallback(
    (e: React.MouseEvent, command: string, value = "") => {
      e.preventDefault(); // prevent blur before execCommand
      editorRef.current?.focus();
      exec(command, value);
      // Re-read all toggle-command states after the command.
      setBold(document.queryCommandState("bold"));
      setItalic(document.queryCommandState("italic"));
      setUnderline(document.queryCommandState("underline"));
      setStrikethrough(document.queryCommandState("strikeThrough"));
      setSubscript(document.queryCommandState("subscript"));
      setSuperscript(document.queryCommandState("superscript"));
      // Report the updated HTML.
      const html = editorRef.current?.innerHTML ?? "";
      lastWrittenRef.current = html;
      onChange(html);
    },
    [onChange],
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
      onChange(html);
    },
    [onChange],
  );

  const applyImage = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const sel = window.getSelection();
      const savedRange = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;

      const url = window.prompt("Enter image URL:", "https://");
      if (!url || !url.trim()) return;

      if (savedRange && sel) {
        sel.removeAllRanges();
        sel.addRange(savedRange);
      }

      editorRef.current?.focus();
      exec("insertImage", url.trim());
      const html = editorRef.current?.innerHTML ?? "";
      lastWrittenRef.current = html;
      onChange(html);
    },
    [onChange],
  );

  // ── Checklist (best-effort) ─────────────────────────────────────────
  // True interactive checklists in contentEditable require complex DOM
  // bookkeeping beyond execCommand. This best-effort implementation inserts
  // a "☐ " prefix on each selected line so teachers can visually track
  // checkbox items. Items are plain text markers, not interactive inputs.
  const applyChecklist = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      editorRef.current?.focus();
      // Insert a checkbox character + non-breaking-space before the selection.
      // execCommand('insertText') places it at the caret or replaces selection.
      exec("insertText", "☐ ");
      const html = editorRef.current?.innerHTML ?? "";
      lastWrittenRef.current = html;
      onChange(html);
    },
    [onChange],
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
          onChange(html);
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
        onChange(html);
        setEmpty(isEditorEmpty(el));
      }, 0);
    },
    [singleLine, onChange],
  );

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className={styles.root}>
      {/* Floating toolbar — position:fixed, coordinates are viewport-relative */}
      {toolbarVisible && (
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label="Text formatting"
          className={styles.toolbar}
          style={{
            top: toolbarPos.top,
            left: toolbarPos.left,
          }}
          // Prevent toolbar clicks from stealing focus away from selection.
          onMouseDown={(e) => e.preventDefault()}
        >
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
                setPaletteOpen((v) => (v === "highlight" ? null : "highlight"));
                setFontOpen(false);
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
                        onMouseDown={(e) => applyHighlight(e, swatch.variable)}
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
                        onMouseDown={(e) => applyHighlight(e, swatch.variable)}
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
            label="Checklist (inserts ☐ marker)"
            active={false}
            onMouseDown={applyChecklist}
          >
            <span className={styles.iconList}>☐</span>
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
            label="Insert image"
            active={false}
            onMouseDown={applyImage}
          >
            <span className={styles.iconInsert}>🖼</span>
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
        </div>
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
        />
      </div>
    </div>
  );
}
