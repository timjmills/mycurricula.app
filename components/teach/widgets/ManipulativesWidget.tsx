// ManipulativesWidget — fraction-strip manipulatives, restyled into the 5.31
// system (consumes the `--w-*` themeable vars + _WidgetKit). Display-only:
// renders the partitioned strip rows from `config.rows` (denominators) or the
// default set, with an optional `config.imageUrl` photo beside them. Behaviour +
// export unchanged from v1.
//
// DEFAULT THEME: inherits the global default (cloud/blue) until rebinned.

/* eslint-disable @next/next/no-img-element -- a teacher-supplied resource photo,
   not a Next-optimizable asset; the board renders it raw. */
import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead } from "./_WidgetKit";
import styles from "./ManipulativesWidget.module.css";
import kit from "./widgets530.module.css";

const DEFAULT_ROWS = [1, 2, 3, 4, 6];

function fractionLabel(parts: number): string {
  return parts === 1 ? "1" : `1/${parts}`;
}

function readRows(config: Record<string, unknown>): number[] {
  const raw = config.rows;
  if (Array.isArray(raw)) {
    const parsed = raw.filter(
      (r): r is number => typeof r === "number" && r >= 1 && r <= 12,
    );
    if (parsed.length > 0) return parsed;
  }
  return DEFAULT_ROWS;
}

export function ManipulativesWidget({ widget }: WidgetBodyProps): ReactNode {
  const rows = readRows(widget.config);
  const imageUrl =
    typeof widget.config.imageUrl === "string"
      ? widget.config.imageUrl
      : undefined;

  return (
    <div className={kit.body}>
      <WHead label="Manipulatives" />
      <div className={`${styles.layout} ${imageUrl ? styles.layoutSplit : ""}`}>
        <div className={styles.strips}>
          {rows.map((parts, ri) => (
            <div key={`${parts}-${ri}`} className={styles.stripRow}>
              {Array.from({ length: parts }).map((_, j) => (
                <div key={j} className={styles.stripCell}>
                  {fractionLabel(parts)}
                </div>
              ))}
            </div>
          ))}
        </div>
        {imageUrl ? (
          <img className={styles.thumb} src={imageUrl} alt={widget.title} />
        ) : null}
      </div>
    </div>
  );
}
