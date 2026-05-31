// AppearancePanel.tsx — the Board Editor's right-side appearance editor (5.31
// Widgets & Boards handoff §4, screenshot 4b). It renders ONE shared control
// set (`ThemeControls`) that drives two modes:
//
//   • a widget is selected → "Appearance · overrides the board theme for this
//     widget" + a "Reset to board theme" link. Edits emit per-widget override
//     intents.
//   • nothing selected → "Board Theme · applies to every widget" + a "Clear all
//     per-widget overrides" link. Edits emit board-theme intents.
//
// The component is presentational: it reads a fully-resolved `EffectiveTheme`
// (computed by the parent via `effective()`), shows the current selection, and
// emits `set`/`reset` callbacks. The theme math + option sets come from
// `@/lib/teach/widget-theme` — this file never redefines them and never
// hard-codes a colour.

import type { ReactNode } from "react";
import {
  ACCENT_OPTS,
  BG_OPTS,
  FONT_OPTS,
  TEXT_OPTS,
  accentVar,
  type EffectiveTheme,
} from "@/lib/teach/widget-theme";
import type { ThemeOverride } from "@/lib/types";
import { TeachIcon } from "@/components/teach/widgets";
import styles from "./editor.module.css";

/** A single key the appearance editor can set (a writable field of an
 *  override). */
export type ThemeProp = keyof ThemeOverride;

export interface AppearancePanelProps {
  /** The fully-resolved theme to reflect in the controls. */
  effectiveTheme: EffectiveTheme;
  /** True when a widget is selected (per-widget mode); false for board mode. */
  widgetSelected: boolean;
  /** The selected widget's display label, shown in the per-widget subtitle. */
  widgetLabel?: string;
  /** Set one appearance property (per-widget override, or board theme). */
  onSet: <K extends ThemeProp>(
    prop: K,
    value: NonNullable<ThemeOverride[K]>,
  ) => void;
  /** Reset: per-widget mode → clear this widget's overrides; board mode →
   *  clear every widget's overrides. */
  onReset: () => void;
  /** Optional id so the panel can be wired to an aria-labelledby region. */
  headingId?: string;
}

/** One labelled control row. */
function Row({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}): ReactNode {
  return (
    <div className={styles.ctrlRow}>
      <div className={styles.ctrlLabel}>{label}</div>
      {children}
    </div>
  );
}

/** The shared control set: Background · Accent · Text colour · Text size ·
 *  Corner radius · Font. Pure inputs (buttons + range), each labelled. */
export function ThemeControls({
  effectiveTheme: eff,
  onSet,
  onReset,
  resetLabel,
}: {
  effectiveTheme: EffectiveTheme;
  onSet: AppearancePanelProps["onSet"];
  onReset: () => void;
  resetLabel: string;
}): ReactNode {
  return (
    <div>
      <Row label="Background">
        <div className={styles.swGrid} role="group" aria-label="Background">
          {BG_OPTS.map(([k, name]) => {
            const on = eff.bg === k;
            return (
              <button
                key={k}
                type="button"
                title={name}
                aria-label={name}
                aria-pressed={on}
                className={`${styles.sw} ${on ? styles.swOn : ""}`}
                onClick={() => onSet("bg", k)}
                style={{ background: `var(--wf-${k}-grad)` }}
              />
            );
          })}
        </div>
      </Row>

      <Row label="Accent">
        <div className={styles.dotRow} role="group" aria-label="Accent colour">
          {ACCENT_OPTS.map((k) => {
            const on = eff.accent === k;
            return (
              <button
                key={k}
                type="button"
                title={k}
                aria-label={`Accent ${k}`}
                aria-pressed={on}
                className={`${styles.dot} ${on ? styles.dotOn : ""}`}
                onClick={() => onSet("accent", k)}
                style={{ background: accentVar(k) }}
              />
            );
          })}
        </div>
      </Row>

      <Row label="Text color">
        <div className={styles.dotRow} role="group" aria-label="Text colour">
          {TEXT_OPTS.map(([k, c, name]) => {
            const on = eff.text === k;
            return (
              <button
                key={k}
                type="button"
                title={name}
                aria-label={`Text ${name}`}
                aria-pressed={on}
                className={`${styles.dot} ${on ? styles.dotOn : ""}`}
                onClick={() => onSet("text", k)}
                style={{ background: c }}
              />
            );
          })}
        </div>
      </Row>

      <Row label={`Text size · ${Math.round((eff.size ?? 1) * 100)}%`}>
        <input
          type="range"
          min={0.8}
          max={1.4}
          step={0.05}
          value={eff.size ?? 1}
          aria-label="Text size"
          className={styles.range}
          onChange={(e) => onSet("size", parseFloat(e.target.value))}
        />
      </Row>

      <Row label={`Corner radius · ${eff.radius ?? 22}px`}>
        <input
          type="range"
          min={6}
          max={30}
          step={1}
          value={eff.radius ?? 22}
          aria-label="Corner radius"
          className={styles.range}
          onChange={(e) => onSet("radius", parseInt(e.target.value, 10))}
        />
      </Row>

      <Row label="Font">
        <div className={styles.fontGrid} role="group" aria-label="Font">
          {FONT_OPTS.map(([k, label, stack]) => {
            const on = eff.font === k;
            return (
              <button
                key={k}
                type="button"
                aria-label={`Font ${label}`}
                aria-pressed={on}
                className={`${styles.fontBtn} ${on ? styles.fontBtnOn : ""}`}
                onClick={() => onSet("font", k)}
                style={{ fontFamily: stack }}
              >
                Aa
                <div className={styles.fontBtnLabel}>{label}</div>
              </button>
            );
          })}
        </div>
      </Row>

      <button type="button" className={styles.resetBtn} onClick={onReset}>
        <TeachIcon name="rotate" size={14} />
        {resetLabel}
      </button>
    </div>
  );
}

/** The full panel: header (mode-dependent) + the shared controls. */
export function AppearancePanel({
  effectiveTheme,
  widgetSelected,
  widgetLabel,
  onSet,
  onReset,
  headingId,
}: AppearancePanelProps): ReactNode {
  const title = widgetSelected ? "Appearance" : "Board Theme";
  const sub = widgetSelected
    ? `${widgetLabel ?? "Widget"} · overrides the board theme for this widget.`
    : "Board Theme · applies to every widget, unless a widget has its own override. Select a widget to style just that one.";
  const resetLabel = widgetSelected
    ? "Reset to board theme"
    : "Clear all per-widget overrides";

  return (
    <div>
      <div className={styles.panelHead}>
        <span className={styles.panelIcon}>
          <TeachIcon name={widgetSelected ? "palette" : "cog"} size={18} />
        </span>
        <span className={styles.panelTitle} id={headingId}>
          {title}
        </span>
      </div>
      <div className={styles.panelSub}>{sub}</div>
      <ThemeControls
        effectiveTheme={effectiveTheme}
        onSet={onSet}
        onReset={onReset}
        resetLabel={resetLabel}
      />
    </div>
  );
}
