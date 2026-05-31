// BrainBreakWidget — a movement / brain-break picker (5.31 handoff, Regulation
// & Teacher Tools #1). INTERACTIVE: the teacher taps "Next" to advance through a
// ring of movement activities; the current activity + its suggested duration
// show large. State is STRUCTURE-ONLY (the current activity INDEX), persisted via
// useWidgetState — no names, no PII.
//
// DEFAULT THEME: { bg: "purple", accent: "purple" } (Lilac card, purple accent).

"use client";

import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useWidgetState } from "@/lib/teach/use-widget-state";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon, Pill } from "./_WidgetKit";
import type { KitIconName } from "./_WidgetKit";
import styles from "./BrainBreakWidget.module.css";
import kit from "./widgets530.module.css";

interface Activity {
  icon: KitIconName;
  name: string;
  duration: string;
}

const ICONS: readonly KitIconName[] = [
  "spark",
  "star",
  "hand",
  "users",
  "bulb",
];

const FALLBACK: Activity[] = [
  { icon: "spark", name: "5 Jumping Jacks", duration: "1 min" },
  { icon: "hand", name: "Stretch to the Sky", duration: "1 min" },
  { icon: "star", name: "Dance Freeze", duration: "2 min" },
  { icon: "users", name: "Partner Mirror", duration: "2 min" },
];

/** Structure-only persisted slice — just the current activity index. */
interface BreakState extends Record<string, unknown> {
  index: number;
}

function readActivities(config: Record<string, unknown>): Activity[] {
  const raw = config.activities;
  if (Array.isArray(raw)) {
    const acts = raw
      .map((a, i): Activity | null => {
        const o =
          typeof a === "string"
            ? { name: a }
            : a && typeof a === "object"
              ? (a as Record<string, unknown>)
              : null;
        if (o && typeof o.name === "string") {
          return {
            name: o.name,
            duration: typeof o.duration === "string" ? o.duration : "1 min",
            icon: ICONS[i % ICONS.length] ?? "spark",
          };
        }
        return null;
      })
      .filter((a): a is Activity => a !== null);
    if (acts.length > 0) return acts;
  }
  return FALLBACK;
}

export function BrainBreakWidget({ widget }: WidgetBodyProps): ReactNode {
  const activities = useMemo(
    () => readActivities(widget.config),
    [widget.config],
  );
  const initial = useMemo<BreakState>(() => ({ index: 0 }), []);
  const { state, setState } = useWidgetState<BreakState>(widget.id, initial);

  const idx =
    ((state.index % activities.length) + activities.length) % activities.length;
  const current = activities[idx]!;

  const next = useCallback((): void => {
    setState((prev) => ({ index: prev.index + 1 }));
  }, [setState]);

  return (
    <div className={`${kit.body} ${kit.tones}`}>
      <WHead label="Brain Break" />

      <div className={`${kit.card} ${styles.hero}`}>
        <span className={`${kit.chip} ${styles.chip}`}>
          <KitIcon name={current.icon} size={2.6} />
        </span>
        <div className={styles.name}>{current.name}</div>
        <Pill tone="purple" icon={<KitIcon name="clock" size={1} />}>
          {current.duration}
        </Pill>
      </div>

      <button
        type="button"
        className={styles.nextBtn}
        onClick={next}
        title="Show the next brain-break activity"
      >
        <KitIcon name="spark" size={1.1} />
        Next activity
      </button>
    </div>
  );
}
