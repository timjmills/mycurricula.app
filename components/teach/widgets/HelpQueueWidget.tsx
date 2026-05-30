// HelpQueueWidget — INTERACTIVE help queue (5.31 handoff, Assessment & Support
// #3). Each waiting student (an INITIAL only — privacy §11.4) carries a reason
// tag; the teacher taps a row to cycle its serve-status (Waiting → Helping now
// → Done → Waiting). The "students waiting" count recomputes live.
//
// State is STRUCTURE-ONLY: a per-index status integer keyed by the widget id,
// persisted via useWidgetState. The roster (initials + reason tags) comes from
// config; no name is ever stored.
//
// DEFAULT THEME: { bg: "orange", accent: "orange" } (Apricot card, orange).

"use client";

import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useWidgetState } from "@/lib/teach/use-widget-state";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon, Avatar, Pill } from "./_WidgetKit";
import type { KitIconName, Tone } from "./_WidgetKit";
import styles from "./HelpQueueWidget.module.css";
import kit from "./widgets530.module.css";

interface Entry {
  /** A single-letter initial — never a full name. */
  initial: string;
  reason: string;
  tone: Tone;
}

// Seeded with INITIALS only (privacy §11.4).
const FALLBACK: Entry[] = [
  { initial: "B", reason: "Stuck", tone: "red" },
  { initial: "E", reason: "Finished Early", tone: "amber" },
  { initial: "D", reason: "Tech Help", tone: "blue" },
  { initial: "M", reason: "Stuck", tone: "red" },
  { initial: "L", reason: "Tech Help", tone: "blue" },
];

const TONES: readonly Tone[] = ["red", "amber", "blue", "purple", "green"];

/** The three serve states a row cycles through on tap. */
const STATUS: ReadonlyArray<{ label: string; icon: KitIconName; tone: Tone }> = [
  { label: "Waiting", icon: "clock", tone: "gray" },
  { label: "Helping now", icon: "user", tone: "purple" },
  { label: "Done", icon: "check", tone: "green" },
];

/** Structure-only persisted slice — one status index per queue position. */
interface QueueState extends Record<string, unknown> {
  status: number[];
}

function readEntries(config: Record<string, unknown>): Entry[] {
  const raw = config.entries;
  if (Array.isArray(raw)) {
    const entries = raw
      .map((e, i): Entry | null => {
        if (e && typeof e === "object") {
          const o = e as Record<string, unknown>;
          const initial =
            typeof o.initial === "string" && o.initial.length > 0
              ? o.initial[0]!.toUpperCase()
              : null;
          const reason = typeof o.reason === "string" ? o.reason : "Stuck";
          if (initial) {
            return { initial, reason, tone: TONES[i % TONES.length]! };
          }
        }
        return null;
      })
      .filter((e): e is Entry => e !== null);
    if (entries.length > 0) return entries;
  }
  return FALLBACK;
}

export function HelpQueueWidget({ widget }: WidgetBodyProps): ReactNode {
  const entries = useMemo(() => readEntries(widget.config), [widget.config]);

  const initial = useMemo<QueueState>(
    () => ({ status: entries.map(() => 0) }),
    [entries],
  );
  const { state, setState } = useWidgetState<QueueState>(widget.id, initial);

  // Defensive: if config gained/lost rows since the entry was saved, align.
  const statuses = entries.map((_, i) => state.status[i] ?? 0);

  const cycle = useCallback(
    (idx: number): void => {
      setState((prev) => {
        const next = entries.map((_, i) => prev.status[i] ?? 0);
        next[idx] = (next[idx]! + 1) % STATUS.length;
        return { status: next };
      });
    },
    [entries, setState],
  );

  // "Waiting" rows still in the queue (not Helping/Done).
  const waiting = statuses.filter((s) => s === 0).length;

  return (
    <div className={`${kit.body} ${kit.tones}`}>
      <WHead label="Help Queue" />
      <div className={`${kit.card} ${styles.list}`}>
        {entries.map((e, i) => {
          const st = STATUS[statuses[i]!]!;
          return (
            <button
              key={i}
              type="button"
              className={`${styles.row} ${i < entries.length - 1 ? styles.bordered : ""}`}
              onClick={() => cycle(i)}
              title="Tap to advance this student's help status"
              aria-label={`Student ${e.initial}, ${e.reason}, currently ${st.label}. Tap to advance.`}
            >
              <Avatar label={e.initial} size={2.2} />
              <span className={styles.initial}>{e.initial}</span>
              <Pill tone={e.tone}>{e.reason}</Pill>
              <span
                className={styles.status}
                style={{ color: `var(--tone-${st.tone}-fg)` }}
              >
                <KitIcon name={st.icon} size={1} />
                {st.label}
              </span>
            </button>
          );
        })}
      </div>
      <div className={styles.countBar}>
        <KitIcon name="users" size={1.1} />
        {waiting} {waiting === 1 ? "student" : "students"} waiting
      </div>
    </div>
  );
}
