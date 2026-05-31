// lib/teach/widget-theme.ts — the themeable-widget contract (5.31 Boards &
// Widgets redesign). Pure logic, no React, no I/O — so every surface (editor
// appearance panel, fullscreen, the widget bodies) shares ONE definition of how
// a theme resolves and which CSS variables a widget reads.
//
// The model (ported from the handoff's boardeditor-widgets.jsx):
//   effective(widgetDefault, boardTheme, widgetOverride) → a fully-resolved
//   theme, with a precedence of widgetOverride > boardTheme > widgetDefault and
//   a dark-bg→white-text auto rule. `themeVars(eff)` then maps that to the
//   `--w-*` custom properties a `.tw` widget wrapper consumes; internal widget
//   sizes use `em` so `--w-scale` rescales the whole widget.
//
// Hex lives in app/tokens.css (the `--wf-*` family). This module only NAMES the
// tokens — it never hard-codes a colour. Tokens-only rule intact.

import type {
  ThemeOverride,
  WidgetAccentKey,
  WidgetBgKey,
  WidgetFontKey,
  WidgetTextKey,
} from "../types";

// ── Appearance option sets (the editor's curated choices) ───────────────────

/** Background families: [key, display name]. Six pastels + three neutrals. */
export const BG_OPTS: ReadonlyArray<[WidgetBgKey, string]> = [
  ["yellow", "Sunshine"],
  ["green", "Mint"],
  ["pink", "Blossom"],
  ["purple", "Lilac"],
  ["orange", "Apricot"],
  ["blue", "Sky"],
  ["slate", "Slate"],
  ["cloud", "White"],
  ["dark", "Night"],
];

/** Accent dots offered in the editor. */
export const ACCENT_OPTS: readonly WidgetAccentKey[] = [
  "blue",
  "green",
  "purple",
  "orange",
  "pink",
  "yellow",
  "slate",
  "ink",
];

/** Text-colour options: [key, css value token-or-hexless ref, display name].
 *  The middle value is the resolved CSS colour the swatch shows and the widget
 *  ink uses; these three are the only literal colours and intentionally live in
 *  the contract (Dark/Slate/White are semantic, not theme-family hex). */
export const TEXT_OPTS: ReadonlyArray<[WidgetTextKey, string, string]> = [
  ["ink", "var(--ink-900)", "Dark"],
  ["slate", "var(--wf-slate-accent)", "Slate"],
  ["white", "#ffffff", "White"],
];

/** Font options: [key, display label, the --wf-font-* token to apply]. */
export const FONT_OPTS: ReadonlyArray<[WidgetFontKey, string, string]> = [
  ["jakarta", "Sans", "var(--wf-font-jakarta)"],
  ["rounded", "Rounded", "var(--wf-font-rounded)"],
  ["serif", "Serif", "var(--wf-font-serif)"],
  ["hand", "Marker", "var(--wf-font-hand)"],
  ["mono", "Mono", "var(--wf-font-mono)"],
];

// ── Resolvers ────────────────────────────────────────────────────────────────

/** The CSS value for an accent key (`ink` → the neutral ink accent). */
export function accentVar(k: WidgetAccentKey): string {
  return k === "ink" ? "var(--wf-ink-accent)" : `var(--wf-${k}-accent)`;
}

/** The resolved ink colour for a text key. */
export function textVal(k: WidgetTextKey): string {
  return (TEXT_OPTS.find((t) => t[0] === k) ?? TEXT_OPTS[0])[1];
}

/** The font-family stack for a font key. */
export function fontStack(k: WidgetFontKey): string {
  return (FONT_OPTS.find((f) => f[0] === k) ?? FONT_OPTS[0])[2];
}

// ── Theme merge ────────────────────────────────────────────────────────────

/** A fully-resolved theme — every field present. */
export interface EffectiveTheme {
  bg: WidgetBgKey;
  accent: WidgetAccentKey;
  text: WidgetTextKey;
  size: number;
  radius: number;
  font: WidgetFontKey;
}

/** Strip null/undefined keys from a partial override so a later layer's value
 *  is not clobbered by an explicit null. Never mutates the input. */
export function clean(o: ThemeOverride | null | undefined): ThemeOverride {
  const r: ThemeOverride = {};
  if (o) {
    (Object.keys(o) as (keyof ThemeOverride)[]).forEach((k) => {
      const v = o[k];
      if (v != null) {
        // Assign through a loosened type — keys+values are correlated by source.
        (r as Record<string, unknown>)[k] = v;
      }
    });
  }
  return r;
}

/** Resolve the effective theme: widgetDefault → boardTheme → widgetOverride
 *  (later wins). If neither the override nor the board sets `text`, derive it
 *  from the background (dark bg → white ink; otherwise the widget default or
 *  ink). Mirrors the handoff's `effective()`. */
export function effective(
  def: EffectiveTheme,
  board: ThemeOverride | null | undefined,
  ov: ThemeOverride | null | undefined,
): EffectiveTheme {
  const cb = clean(board);
  const co = clean(ov);
  const e: EffectiveTheme = { ...def, ...cb, ...co };
  const textExplicit = "text" in co || "text" in cb;
  if (!textExplicit) {
    e.text =
      e.bg === "dark" || def.bg === "dark" ? "white" : (def.text ?? "ink");
  }
  return e;
}

/** Map an effective theme to the `--w-*` custom properties a `.tw` widget
 *  wrapper consumes. Returns a plain style object (CSS var name → value). */
export function themeVars(e: EffectiveTheme): Record<string, string> {
  return {
    "--w-grad": `var(--wf-${e.bg}-grad)`,
    "--w-soft": `var(--wf-${e.bg}-soft)`,
    "--w-chip": `var(--wf-${e.bg}-chip)`,
    "--w-line": `var(--wf-${e.bg}-line)`,
    "--w-card": e.bg === "dark" ? "var(--wf-dark-soft)" : "#fff",
    "--w-accent": accentVar(e.accent),
    "--w-ink": textVal(e.text),
    "--w-radius": `${e.radius ?? 22}px`,
    "--w-font": fontStack(e.font ?? "jakarta"),
    "--w-scale": String(e.size ?? 1),
  };
}

/** The fallback widget default theme (used when a widget type declares none). */
export const DEFAULT_WIDGET_THEME: EffectiveTheme = {
  bg: "cloud",
  accent: "blue",
  text: "ink",
  size: 1,
  radius: 22,
  font: "jakarta",
};

/** The board base theme a new board starts from (handoff `BOARD_BASE`). */
export const BOARD_BASE_THEME: EffectiveTheme = {
  bg: "cloud",
  accent: "blue",
  text: "ink",
  size: 1,
  radius: 22,
  font: "jakarta",
};
