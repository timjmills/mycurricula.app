"use client";

// rich-text-editor.tsx — Inline rich-text editor with a floating dark toolbar.
//
// Design: a borderless contentEditable region. On text selection a compact
// floating toolbar surfaces above/below the selection with:
//   • Bold / Italic / Underline (execCommand shortcuts)
//   • Text-color palette  — ink ramp + all 8 subject colors
//   • Highlight palette   — status light-bg tokens + subject lights + clear
//   • Font-family picker  — Sans / Mono / Serif / System
//
// Caret safety: the component is UNCONTROLLED for typing. It syncs `value`
// into the DOM only on mount and when an externally-driven value change is
// detected (innerHTML !== incoming value). Never writes innerHTML on every
// keystroke — that would reset the caret position.
//
// singleLine mode: Enter is suppressed so the field stays one line, but all
// formatting commands remain available.

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
  /** CSS color value — must be a literal (execCommand needs it) or a
   *  var()-resolved value. We resolve CSS vars at runtime via getComputedStyle
   *  so execCommand always receives a concrete hex/rgb. */
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

const HIGHLIGHT_COLORS: ColorSwatch[] = [
  { label: "No highlight", variable: "transparent" },
  { label: "Important yellow", variable: "--important-bg" },
  { label: "FYI blue", variable: "--fyi-bg" },
  { label: "Catch-up orange", variable: "--catchup-bg" },
  { label: "Urgent red", variable: "--urgent-bg" },
  { label: "Math light", variable: "--math-light" },
  { label: "Reading light", variable: "--reading-light" },
  { label: "Writing light", variable: "--writing-light" },
  { label: "Grammar light", variable: "--grammar-light" },
  { label: "Spelling light", variable: "--spelling-light" },
  { label: "UFLI light", variable: "--ufli-light" },
  { label: "Explorers light", variable: "--explorers-light" },
  { label: "SEL light", variable: "--sel-light" },
];

interface FontOption {
  label: string;
  /** Value passed to execCommand fontName. Also used as display label. */
  value: string;
  /** CSS font-family string for the preview swatch. */
  css: string;
}

const FONT_OPTIONS: FontOption[] = [
  {
    label: "Sans",
    value: "var(--font-sans)",
    css: "var(--font-sans)",
  },
  {
    label: "Mono",
    value: "var(--font-mono)",
    css: "var(--font-mono)",
  },
  {
    label: "Serif",
    value: "Georgia, 'Times New Roman', serif",
    css: "Georgia, 'Times New Roman', serif",
  },
  {
    label: "System",
    value: "system-ui, sans-serif",
    css: "system-ui, sans-serif",
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve a CSS custom property to its computed value on <html>. */
function resolveCssVar(variable: string): string {
  if (!variable.startsWith("--")) return variable; // already a concrete value
  if (typeof window === "undefined") return "#000";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
}

/** Safely call document.execCommand (deprecated but pragmatic for a
 *  prototype — universally supported in all modern browsers). */
function exec(command: string, value = ""): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (document as any).execCommand(command, false, value || undefined);
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
      aria-pressed={active}
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

  // Toolbar visibility & position
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [toolbarPos, setToolbarPos] = useState({ top: 0, left: 0 });

  // Which inline states are active at the current selection
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);

  // Whether the editor content is empty (for placeholder)
  const [empty, setEmpty] = useState(() => !value || value === "<br>");

  // Font picker open state
  const [fontOpen, setFontOpen] = useState(false);

  // Color/highlight palette open state
  const [paletteOpen, setPaletteOpen] = useState<"color" | "highlight" | null>(
    null,
  );

  // ── Sync value → DOM (only when it genuinely differs) ──────────────────
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    // Write on first mount regardless; afterwards only if externally changed.
    if (el.innerHTML !== value && value !== lastWrittenRef.current) {
      el.innerHTML = value;
      lastWrittenRef.current = value;
    }
    setEmpty(!value || value === "<br>" || el.innerHTML === "");
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

    // Read format state.
    setBold(document.queryCommandState("bold"));
    setItalic(document.queryCommandState("italic"));
    setUnderline(document.queryCommandState("underline"));

    // Position toolbar above the selection rect, clamped to viewport.
    const rect = range.getBoundingClientRect();
    const toolbarH = 42; // approximate toolbar height
    const toolbarW = 340; // approximate toolbar width
    const gap = 8;

    let top = rect.top - toolbarH - gap + window.scrollY;
    let left = rect.left + window.scrollX + rect.width / 2 - toolbarW / 2;

    // Clamp so it doesn't escape the viewport horizontally.
    left = Math.max(8, Math.min(left, window.innerWidth - toolbarW - 8));
    // If not enough room above, flip below.
    if (rect.top < toolbarH + gap + 4) {
      top = rect.bottom + gap + window.scrollY;
    }

    setToolbarPos({ top, left });
    setToolbarVisible(true);
  }, []);

  // ── Keyboard handler ────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (singleLine && e.key === "Enter") {
        e.preventDefault();
        return;
      }
    },
    [singleLine],
  );

  // ── Input handler — report changes, check empty state ──────────────────
  const handleInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    lastWrittenRef.current = html;
    onChange(html);
    setEmpty(html === "" || html === "<br>");
  }, [onChange]);

  // ── Selection change → update toolbar ──────────────────────────────────
  useEffect(() => {
    document.addEventListener("selectionchange", updateToolbar);
    return () => document.removeEventListener("selectionchange", updateToolbar);
  }, [updateToolbar]);

  // ── Close popups when clicking outside toolbar/editor ──────────────────
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

  // ── Format command helpers ──────────────────────────────────────────────

  /** Apply a format command while keeping focus in the editor. */
  const applyCommand = useCallback(
    (e: React.MouseEvent, command: string, value = "") => {
      e.preventDefault(); // prevent blur before execCommand
      editorRef.current?.focus();
      exec(command, value);
      // Re-read format state after command.
      setBold(document.queryCommandState("bold"));
      setItalic(document.queryCommandState("italic"));
      setUnderline(document.queryCommandState("underline"));
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
    (e: React.MouseEvent, fontValue: string) => {
      // execCommand('fontName') sets a <font face="…"> element. We pass the
      // CSS value directly — browsers will use it as the face attribute.
      applyCommand(e, "fontName", fontValue);
      setFontOpen(false);
    },
    [applyCommand],
  );

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className={styles.root}>
      {/* Floating toolbar — rendered in document flow at a fixed position */}
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
          {/* Bold / Italic / Underline */}
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

          <span className={styles.divider} aria-hidden />

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
              {/* A colored "A" showing the concept */}
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
                className={styles.palettePopover}
                role="group"
                aria-label="Highlight color palette"
              >
                {HIGHLIGHT_COLORS.map((swatch) => (
                  <SwatchButton
                    key={swatch.variable}
                    label={swatch.label}
                    color={
                      swatch.variable === "transparent"
                        ? "transparent"
                        : resolveCssVar(swatch.variable)
                    }
                    isNone={swatch.variable === "transparent"}
                    onMouseDown={(e) => applyHighlight(e, swatch.variable)}
                  />
                ))}
              </div>
            )}
          </div>

          <span className={styles.divider} aria-hidden />

          {/* Font family picker */}
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
                    key={opt.value}
                    type="button"
                    aria-label={`Font: ${opt.label}`}
                    title={opt.label}
                    className={`${styles.fontOption} cp-focusable`}
                    style={{ fontFamily: opt.css }}
                    onMouseDown={(e) => applyFont(e, opt.value)}
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
          aria-label={ariaLabel}
          contentEditable
          suppressContentEditableWarning
          className={`${styles.editor} ${singleLine ? styles.editorSingleLine : ""}`}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          // After paste, normalize and report.
          onPaste={() => {
            // Small timeout lets the browser finish inserting pasted content.
            setTimeout(() => {
              const html = editorRef.current?.innerHTML ?? "";
              lastWrittenRef.current = html;
              onChange(html);
              setEmpty(html === "" || html === "<br>");
            }, 0);
          }}
        />
      </div>
    </div>
  );
}
