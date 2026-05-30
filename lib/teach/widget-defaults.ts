// lib/teach/widget-defaults.ts — per-widget-type default appearance themes
// (5.31). The editor + fullscreen call effective(WIDGET_DEFAULT_THEME[type],
// board.boardTheme, widget.appearance) to resolve a widget's look. Defaults are
// ported from the handoff's WIDGET_DEFS (boardeditor-widgets.jsx) for the editor
// set, and assigned per the WIDGET-UPDATE-GUIDE "Family assignments" table +
// each widget's handoff panel for the named set. Color carries meaning, so keep
// these consistent (a teacher can still override per-board / per-widget).

import type { WidgetType } from "../types";
import { DEFAULT_WIDGET_THEME, type EffectiveTheme } from "./widget-theme";

/** A widget's default theme is its bg family + accent; size/radius/font inherit
 *  the global defaults. */
type WidgetThemeSeed = Pick<EffectiveTheme, "bg" | "accent">;

/** Default bg/accent per widget type. Anything absent falls back to
 *  DEFAULT_WIDGET_THEME (cloud/blue). */
const SEEDS: Partial<Record<WidgetType, WidgetThemeSeed>> = {
  // ── Editor/dashboard set (verbatim from handoff WIDGET_DEFS) ──────────────
  timer: { bg: "pink", accent: "pink" },
  objective: { bg: "yellow", accent: "purple" },
  poll: { bg: "purple", accent: "purple" },
  text: { bg: "cloud", accent: "blue" },
  clock: { bg: "blue", accent: "blue" },
  traffic: { bg: "cloud", accent: "green" },
  resource: { bg: "cloud", accent: "purple" },
  // ── WIDGET-UPDATE-GUIDE family assignments ────────────────────────────────
  countdown: { bg: "pink", accent: "pink" },
  scoreboard: { bg: "purple", accent: "purple" },
  dice: { bg: "orange", accent: "orange" },
  namepick: { bg: "orange", accent: "orange" },
  names: { bg: "orange", accent: "orange" },
  sound: { bg: "green", accent: "green" },
  soundlevel: { bg: "green", accent: "green" },
  "work-sound": { bg: "blue", accent: "blue" },
  "lesson-flow": { bg: "green", accent: "green" },
  groups: { bg: "green", accent: "green" },
  // ── Named pedagogical widgets (per their handoff panel family) ────────────
  "learning-target": { bg: "yellow", accent: "purple" },
  "now-next-then": { bg: "blue", accent: "blue" },
  directions: { bg: "green", accent: "green" },
  "materials-needed": { bg: "purple", accent: "purple" },
  "work-completed": { bg: "orange", accent: "orange" },
  transition: { bg: "green", accent: "green" },
  "attention-signal": { bg: "blue", accent: "blue" },
  "voice-movement": { bg: "purple", accent: "purple" },
  "when-done": { bg: "orange", accent: "orange" },
  "student-jobs": { bg: "yellow", accent: "yellow" },
  "exit-ticket": { bg: "purple", accent: "purple" },
  "understanding-check": { bg: "green", accent: "green" },
  "help-queue": { bg: "orange", accent: "orange" },
  "participation-tracker": { bg: "blue", accent: "blue" },
  "question-parking-lot": { bg: "pink", accent: "pink" },
  "center-rotation": { bg: "blue", accent: "blue" },
  "teacher-table": { bg: "green", accent: "green" },
  vocabulary: { bg: "blue", accent: "blue" },
  "sentence-frames": { bg: "orange", accent: "orange" },
  "discussion-protocol": { bg: "blue", accent: "blue" },
  "brain-break": { bg: "purple", accent: "purple" },
  "calm-corner": { bg: "green", accent: "green" },
  "class-points": { bg: "green", accent: "green" },
  "teacher-notes": { bg: "orange", accent: "orange" },
  "mini-whiteboard": { bg: "blue", accent: "blue" },
  notes: { bg: "orange", accent: "orange" },
  "note-view": { bg: "purple", accent: "purple" },
  // Legacy widgets kept (restyled): agenda → lesson-flow look, model/etc. use
  // sensible families until retired by the rebin.
  agenda: { bg: "pink", accent: "pink" },
};

/** The resolved default theme for a widget type (bg/accent from the seed table,
 *  size/radius/font from the global default). */
export function widgetDefaultTheme(type: WidgetType): EffectiveTheme {
  const seed = SEEDS[type];
  if (!seed) return DEFAULT_WIDGET_THEME;
  return { ...DEFAULT_WIDGET_THEME, bg: seed.bg, accent: seed.accent };
}
