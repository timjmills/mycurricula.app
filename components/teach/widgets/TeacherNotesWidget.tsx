// TeacherNotesWidget — private, teacher-only reminders (5.31 handoff, Regulation
// & Teacher Tools #4). Display-only: renders the note text on a soft card with a
// clear "Private — only you can see this" marker, plus an optional checklist of
// quick reminders. Falls back to a sample so an unconfigured tile reads.
//
// DEFAULT THEME: { bg: "orange", accent: "orange" } (Apricot card, orange).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon, Pill } from "./_WidgetKit";
import styles from "./TeacherNotesWidget.module.css";
import kit from "./widgets530.module.css";

const FALLBACK_TEXT =
  "Check in with the back table during independent work. Remember the early dismissal at 1:30.";

function readText(config: Record<string, unknown>): string {
  const t = config.text ?? config.notes;
  return typeof t === "string" && t.trim().length > 0 ? t : FALLBACK_TEXT;
}

function readReminders(config: Record<string, unknown>): string[] {
  const raw = config.reminders;
  if (Array.isArray(raw)) {
    const items = raw.filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0,
    );
    if (items.length > 0) return items;
  }
  return [];
}

export function TeacherNotesWidget({ widget }: WidgetBodyProps): ReactNode {
  const text = readText(widget.config);
  const reminders = readReminders(widget.config);

  return (
    <div className={`${kit.body} ${kit.tones}`}>
      <div className={styles.headRow}>
        <WHead label="Teacher Notes" />
        <Pill tone="orange" icon={<KitIcon name="user" size={1} />}>
          Private
        </Pill>
      </div>

      <div className={`${kit.card} ${styles.note}`}>
        <span className={styles.noteIcon}>
          <KitIcon name="note" size={1.4} />
        </span>
        <p className={styles.noteText}>{text}</p>
      </div>

      {reminders.length > 0 ? (
        <div className={styles.reminders}>
          {reminders.map((r, i) => (
            <div key={i} className={styles.reminder}>
              <span className={styles.dot} aria-hidden="true" />
              <span className={styles.reminderText}>{r}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
