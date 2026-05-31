// CenterRotationWidget — the small-group center rotation board (5.31 handoff,
// Small Groups & Language #1). Display-only: renders each center as a card with
// its name + the group currently there (NOW) and where it rotates next (NEXT).
// Groups are anonymous labels ("Red", "Group 1") — never student names.
//
// DEFAULT THEME: { bg: "blue", accent: "blue" } (Sky card, blue accent).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon } from "./_WidgetKit";
import type { KitIconName } from "./_WidgetKit";
import styles from "./CenterRotationWidget.module.css";
import kit from "./widgets530.module.css";

interface Center {
  icon: KitIconName;
  name: string;
  now: string;
  next: string;
}

const ICONS: readonly KitIconName[] = [
  "book",
  "calc",
  "pencil",
  "laptop",
  "beaker",
  "easel",
];

// Groups are colour/number LABELS only — never student names (privacy §11.4).
const FALLBACK: Center[] = [
  { icon: "book", name: "Read to Self", now: "Red Group", next: "Blue Group" },
  {
    icon: "calc",
    name: "Math Fact Fluency",
    now: "Blue Group",
    next: "Green Group",
  },
  {
    icon: "laptop",
    name: "Tech Center",
    now: "Green Group",
    next: "Yellow Group",
  },
  { icon: "pencil", name: "Word Work", now: "Yellow Group", next: "Red Group" },
];

function readCenters(config: Record<string, unknown>): Center[] {
  const raw = config.centers;
  if (Array.isArray(raw)) {
    const centers = raw
      .map((c, i): Center | null => {
        if (c && typeof c === "object") {
          const o = c as Record<string, unknown>;
          const name = typeof o.name === "string" ? o.name : null;
          if (name) {
            return {
              name,
              now: typeof o.now === "string" ? o.now : "—",
              next: typeof o.next === "string" ? o.next : "—",
              icon: ICONS[i % ICONS.length] ?? "book",
            };
          }
        }
        return null;
      })
      .filter((c): c is Center => c !== null);
    if (centers.length > 0) return centers;
  }
  return FALLBACK;
}

export function CenterRotationWidget({ widget }: WidgetBodyProps): ReactNode {
  const centers = readCenters(widget.config);

  return (
    <div className={`${kit.body} ${kit.tones}`}>
      <WHead label="Center Rotation" />
      <div className={styles.grid}>
        {centers.map((c, i) => (
          <div key={i} className={`${kit.card} ${styles.center}`}>
            <div className={styles.head}>
              <span className={styles.icon}>
                <KitIcon name={c.icon} size={1.5} />
              </span>
              <span className={styles.name}>{c.name}</span>
            </div>
            <div className={styles.rows}>
              <div className={styles.row}>
                <span className={`${styles.tag} ${styles.tagNow}`}>Now</span>
                <span className={styles.group}>{c.now}</span>
              </div>
              <div className={styles.row}>
                <span className={`${styles.tag} ${styles.tagNext}`}>Next</span>
                <span className={styles.groupMuted}>{c.next}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
