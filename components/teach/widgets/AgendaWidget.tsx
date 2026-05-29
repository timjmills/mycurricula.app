// AgendaWidget — the lesson-phase agenda checklist, display-only
// (docs/teach-view-plan.md §4.5). Renders `config.items` (an array of
// {label, time, done}) or the default five-phase set. The "done" check uses the
// subject accent via `.cp-subj`. No interactivity in v1 (ticking off items is
// the Phase 3 interactive library).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { TeachIcon } from "./icons";
import styles from "./widgets.module.css";

interface AgendaItem {
  label: string;
  time?: string;
  done?: boolean;
}

const DEFAULT_ITEMS: AgendaItem[] = [
  { label: "Warm-Up", time: "8 min", done: true },
  { label: "Mini Lesson", time: "12 min" },
  { label: "Guided Practice", time: "15 min" },
  { label: "Centers", time: "20 min" },
  { label: "Exit Ticket", time: "5 min" },
];

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

export function AgendaWidget({
  widget,
  subjectId,
}: WidgetBodyProps): ReactNode {
  const items = readItems(widget.config);

  return (
    <div className={`cp-subj ${subjectId} ${styles.body} ${styles.agenda}`}>
      {items.map((it, i) => (
        <div key={`${it.label}-${i}`} className={styles.agendaRow}>
          <span
            className={`${styles.agendaBox} ${it.done ? styles.agendaBoxDone : ""}`}
          >
            {it.done ? <TeachIcon name="check" size={10} /> : null}
          </span>
          <span style={{ color: "var(--ink-400)", display: "inline-flex" }}>
            <TeachIcon name="users" size={13} />
          </span>
          <span
            className={`${styles.agendaLabel} ${it.done ? styles.agendaLabelDone : ""}`}
          >
            {it.label}
          </span>
          {it.time ? (
            <span className={styles.agendaTime}>{it.time}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
