// VoiceMovementWidget — the voice / movement / help / work expectations rows
// (5.31 handoff, Routines & Management #3). Display-only. Each row alternates a
// purple / blue chip family for visual rhythm (resolved through the `--tone-*`
// palette so it doesn't fight the widget's own theme accent).
//
// DEFAULT THEME: { bg: "purple", accent: "purple" } (Lilac card, purple accent).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon } from "./_WidgetKit";
import type { KitIconName, Tone } from "./_WidgetKit";
import styles from "./VoiceMovementWidget.module.css";
import kit from "./widgets530.module.css";

interface Row {
  cat: string;
  val: string;
  icon: KitIconName;
  fam: Extract<Tone, "purple" | "blue">;
}

const FALLBACK: Row[] = [
  { cat: "VOICE", val: "Partner", icon: "msg", fam: "purple" },
  { cat: "MOVEMENT", val: "Stay seated", icon: "user", fam: "blue" },
  { cat: "HELP", val: "Ask 3 then me", icon: "hand", fam: "purple" },
  { cat: "WORK", val: "Complete questions 1–4", icon: "pencil", fam: "blue" },
];

const ICONS: Record<string, KitIconName> = {
  VOICE: "msg",
  MOVEMENT: "user",
  HELP: "hand",
  WORK: "pencil",
};

function readRows(config: Record<string, unknown>): Row[] {
  const raw = config.rows;
  if (Array.isArray(raw)) {
    const rows = raw
      .map((r, i): Row | null => {
        if (r && typeof r === "object") {
          const o = r as Record<string, unknown>;
          const cat = typeof o.cat === "string" ? o.cat : null;
          const val = typeof o.val === "string" ? o.val : null;
          if (cat && val) {
            return {
              cat,
              val,
              icon: ICONS[cat.toUpperCase()] ?? "msg",
              fam: i % 2 === 0 ? "purple" : "blue",
            };
          }
        }
        return null;
      })
      .filter((r): r is Row => r !== null);
    if (rows.length > 0) return rows;
  }
  return FALLBACK;
}

export function VoiceMovementWidget({ widget }: WidgetBodyProps): ReactNode {
  const rows = readRows(widget.config);

  return (
    <div className={`${kit.body} ${kit.tones}`}>
      <WHead label="Voice + Movement Expectations" />
      <div className={styles.rows}>
        {rows.map((r, i) => (
          <div key={i} className={`${kit.card} ${styles.row}`}>
            <span
              className={styles.rowChip}
              style={{
                background: `var(--tone-${r.fam}-bg)`,
                color: `var(--tone-${r.fam}-fg)`,
              }}
            >
              <KitIcon name={r.icon} size={1.5} />
            </span>
            <div className={styles.rowMain}>
              <div
                className={styles.rowCat}
                style={{ color: `var(--tone-${r.fam}-fg)` }}
              >
                {r.cat}
              </div>
              <div className={styles.rowVal}>{r.val}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
