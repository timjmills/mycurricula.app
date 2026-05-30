// TeacherTableWidget — the small-group "teacher table" focus card (5.31 handoff,
// Small Groups & Language #2). Display-only: shows the current small-group's
// focus skill, the students at the table (INITIALS only — privacy §11.4), and
// the mini teaching goal for the pull.
//
// DEFAULT THEME: { bg: "green", accent: "green" } (Mint card, green accent).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon, Avatar, Pill, FootNote } from "./_WidgetKit";
import styles from "./TeacherTableWidget.module.css";
import kit from "./widgets530.module.css";

interface TableState {
  group: string;
  focus: string;
  goal: string;
  /** Single-letter initials — never full names. */
  initials: string[];
}

// Seeded with INITIALS only (privacy §11.4).
const FALLBACK: TableState = {
  group: "Guided Reading — Group B",
  focus: "Finding the main idea",
  goal: "Read the short passage, then name one main idea together.",
  initials: ["A", "C", "M", "T", "R"],
};

function readTable(config: Record<string, unknown>): TableState {
  const str = (k: string, d: string): string =>
    typeof config[k] === "string" && (config[k] as string).trim().length > 0
      ? (config[k] as string)
      : d;
  let initials = FALLBACK.initials;
  if (Array.isArray(config.initials)) {
    const items = config.initials
      .filter((x): x is string => typeof x === "string" && x.length > 0)
      .map((x) => x[0]!.toUpperCase());
    if (items.length > 0) initials = items;
  }
  return {
    group: str("group", FALLBACK.group),
    focus: str("focus", FALLBACK.focus),
    goal: str("goal", FALLBACK.goal),
    initials,
  };
}

export function TeacherTableWidget({ widget }: WidgetBodyProps): ReactNode {
  const { group, focus, goal, initials } = readTable(widget.config);

  return (
    <div className={`${kit.body} ${kit.tones}`}>
      <WHead label="Teacher Table" />

      <div className={`${kit.card} ${styles.hero}`}>
        <span className={`${kit.chip} ${styles.chip}`}>
          <KitIcon name="users" size={1.9} />
        </span>
        <div className={styles.heroMain}>
          <div className={styles.group}>{group}</div>
          <Pill tone="green" icon={<KitIcon name="target" size={1} />}>
            {focus}
          </Pill>
        </div>
      </div>

      <div className={styles.atTable}>At the table</div>
      <div className={styles.avatars}>
        {initials.map((it, i) => (
          <span key={i} className={styles.avatar}>
            <Avatar label={it} size={2.4} />
          </span>
        ))}
      </div>

      <FootNote tone="green" icon={<KitIcon name="bulb" size={1} />}>
        {goal}
      </FootNote>
    </div>
  );
}
