// AgendaWidget — an INTERACTIVE lesson-phase agenda checklist (Phase 3 widget
// library; replaces the v1 display-only stub). Renders `config.items` (an array
// of {label, time?, done?}) or a sensible default phase set, each as a ≥44px
// tappable row. Tapping toggles "done" — the check fills with the subject accent
// and the label strikes through. Done-state persists by row index via
// useWidgetState so a half-worked agenda survives a reload. config.items still
// seeds the initial done-flags, so a preset agenda starts where it left off.

"use client";

import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useWidgetState } from "@/lib/teach/use-widget-state";
import { WHead, KitIcon } from "./_WidgetKit";
import type { WidgetBodyProps } from "./types";
import styles from "./AgendaWidget.module.css";
import kit from "./widgets530.module.css";

interface AgendaItem {
  label: string;
  time?: string;
  done?: boolean;
}

const DEFAULT_ITEMS: AgendaItem[] = [
  { label: "Warm-Up", time: "8 min" },
  { label: "Mini Lesson", time: "12 min" },
  { label: "Guided Practice", time: "15 min" },
  { label: "Centers", time: "20 min" },
  { label: "Exit Ticket", time: "5 min" },
];

/** Parse `config.items` into the validated AgendaItem[] (or the default set). */
function readItems(config: Record<string, unknown>): AgendaItem[] {
  const raw = config.items;
  if (Array.isArray(raw)) {
    const parsed = raw
      .filter(
        (it): it is Record<string, unknown> =>
          !!it && typeof it === "object" && !Array.isArray(it),
      )
      .map((it) => ({
        label: typeof it.label === "string" ? it.label : "Untitled",
        time: typeof it.time === "string" ? it.time : undefined,
        done: it.done === true,
      }));
    if (parsed.length > 0) return parsed;
  }
  return DEFAULT_ITEMS;
}

/** Durable slice — done-flags keyed by stable row index ("0","1",…). */
interface AgendaPersisted extends Record<string, unknown> {
  done: Record<string, boolean>;
}

/** Validate a stored done-map (drop non-boolean values defensively). */
function readDoneMap(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      if (v === true) out[k] = true;
    }
  }
  return out;
}

export function AgendaWidget({ widget }: WidgetBodyProps): ReactNode {
  const items = useMemo(() => readItems(widget.config), [widget.config]);

  // Seed initial done-flags from config so a preset agenda restores its ticks.
  const initial = useMemo<AgendaPersisted>(() => {
    const done: Record<string, boolean> = {};
    items.forEach((it, i) => {
      if (it.done) done[String(i)] = true;
    });
    return { done };
  }, [items]);

  const { state, setState } = useWidgetState<AgendaPersisted>(
    widget.id,
    initial,
  );
  const doneMap = readDoneMap(state.done);

  const toggle = useCallback(
    (index: number): void => {
      const key = String(index);
      setState((prev) => {
        const prevDone = readDoneMap(prev.done);
        const next = { ...prevDone };
        if (next[key]) {
          delete next[key];
        } else {
          next[key] = true;
        }
        return { ...prev, done: next };
      });
    },
    [setState],
  );

  const doneCount = items.reduce(
    (n, _it, i) => n + (doneMap[String(i)] ? 1 : 0),
    0,
  );

  return (
    <div className={`${kit.body} ${styles.body}`}>
      <WHead label="Agenda" />
      <div className={styles.list}>
        {items.map((it, i) => {
          const isDone = !!doneMap[String(i)];
          return (
            <button
              key={`${it.label}-${i}`}
              type="button"
              className={styles.row}
              onClick={() => toggle(i)}
              aria-pressed={isDone}
              title={
                isDone
                  ? `Mark "${it.label}" as not done yet`
                  : `Mark "${it.label}" as done`
              }
            >
              <span
                className={`${styles.box} ${isDone ? styles.boxDone : ""}`}
                aria-hidden="true"
              >
                {isDone ? <KitIcon name="check" size={0.85} /> : null}
              </span>
              <span
                className={`${styles.label} ${isDone ? styles.labelDone : ""}`}
              >
                {it.label}
              </span>
              {it.time ? <span className={styles.time}>{it.time}</span> : null}
            </button>
          );
        })}
      </div>
      <div className={styles.progress} aria-live="polite">
        {doneCount} of {items.length} done
      </div>
    </div>
  );
}
