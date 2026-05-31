// WorkCompletedWidget — a per-student / per-subject completion matrix (5.31
// handoff, Lesson Essentials #5). Display-only.
//
// PRIVACY (CLAUDE.md §11.4): students appear as INITIALS-on-tint avatars only.
// Sample rows are seeded with single-letter initials ("A", "B", …) — never a
// full name — and the persisted/config shape carries an `initial` only, never a
// name. Each cell is "done" (happy face) or "in progress" (clock).
//
// DEFAULT THEME: { bg: "orange", accent: "orange" } (Apricot card, orange).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon, Avatar, Face, FootNote } from "./_WidgetKit";
import type { KitIconName, Tone } from "./_WidgetKit";
import styles from "./WorkCompletedWidget.module.css";
import kit from "./widgets530.module.css";

interface SubjectCol {
  name: string;
  icon: KitIconName;
  tone: Tone;
}

interface Row {
  /** A single-letter initial — never a full name. */
  initial: string;
  /** One status per subject column: true = done, false = in progress. */
  done: boolean[];
}

const SUBJECTS: SubjectCol[] = [
  { name: "Reading", icon: "book", tone: "pink" },
  { name: "Math", icon: "calc", tone: "blue" },
  { name: "Writing", icon: "pencil", tone: "purple" },
  { name: "Science", icon: "beaker", tone: "green" },
];

// Seeded with INITIALS only (privacy §11.4) — never realistic full names.
const FALLBACK_ROWS: Row[] = [
  { initial: "A", done: [true, true, false, true] },
  { initial: "B", done: [true, false, true, true] },
  { initial: "C", done: [false, true, false, true] },
  { initial: "D", done: [true, true, true, false] },
  { initial: "E", done: [false, true, true, true] },
];

function readRows(config: Record<string, unknown>): Row[] {
  const raw = config.rows;
  if (Array.isArray(raw)) {
    const rows = raw
      .map((r): Row | null => {
        if (r && typeof r === "object") {
          const o = r as Record<string, unknown>;
          const initial =
            typeof o.initial === "string" && o.initial.length > 0
              ? o.initial[0]!.toUpperCase()
              : null;
          const done = Array.isArray(o.done)
            ? o.done.map((d) => d === true)
            : null;
          if (initial && done) return { initial, done };
        }
        return null;
      })
      .filter((r): r is Row => r !== null);
    if (rows.length > 0) return rows;
  }
  return FALLBACK_ROWS;
}

export function WorkCompletedWidget({ widget }: WidgetBodyProps): ReactNode {
  const rows = readRows(widget.config);

  return (
    <div className={`${kit.body} ${kit.tones}`}>
      <WHead label="Work Completed" />
      <div className={`${kit.card} ${styles.matrix}`}>
        <div className={`${styles.gridRow} ${styles.headerRow}`}>
          <span className={styles.colHead}>Student</span>
          {SUBJECTS.map((s) => (
            <span
              key={s.name}
              className={styles.subjHead}
              style={{ color: `var(--tone-${s.tone}-fg)` }}
            >
              <KitIcon name={s.icon} size={1.2} />
              <span className={styles.subjName}>{s.name}</span>
            </span>
          ))}
        </div>
        {rows.map((row, i) => (
          <div
            key={i}
            className={`${styles.gridRow} ${i < rows.length - 1 ? styles.bordered : ""}`}
          >
            <span className={styles.student}>
              <Avatar label={row.initial} size={1.9} />
              <span className={styles.studentLabel}>{row.initial}</span>
            </span>
            {SUBJECTS.map((s, j) => (
              <span key={s.name} className={styles.cell}>
                {row.done[j] ? (
                  <Face mood="happy" hue={145} size={1.7} />
                ) : (
                  <span className={styles.pending}>
                    <KitIcon name="clock" size={1.4} />
                  </span>
                )}
              </span>
            ))}
          </div>
        ))}
      </div>
      <FootNote tone="orange" icon={<KitIcon name="users" size={1} />}>
        Great work, class! Keep it up!
      </FootNote>
    </div>
  );
}
