// ManipulativesWidget — fraction-strip manipulatives, display-only
// (docs/teach-view-plan.md §4.5). Renders the partitioned strip rows
// (1, 1/2, 1/3, 1/4, 1/6) from `config.rows` (an array of denominators) or the
// default set. Optionally renders a supplied `config.imageUrl` photo of
// physical tiles beside the strips. Strip fill/outline are subject-tinted.

import type { ReactNode } from "react";
/* eslint-disable @next/next/no-img-element -- a teacher-supplied resource photo,
   not a Next-optimizable asset; the board renders it raw. */
import type { WidgetBodyProps } from "./types";
import styles from "./widgets.module.css";

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

export function ManipulativesWidget({
  widget,
  subjectId,
}: WidgetBodyProps): ReactNode {
  const rows = readRows(widget.config);
  const imageUrl =
    typeof widget.config.imageUrl === "string"
      ? widget.config.imageUrl
      : undefined;

  return (
    <div className={`cp-subj ${subjectId} ${styles.body}`}>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: imageUrl ? "1fr 1fr" : "1fr",
          gap: "var(--r-12)",
        }}
      >
        <div className={styles.manip}>
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
          <img
            className={styles.mediaThumb}
            src={imageUrl}
            alt={widget.title}
          />
        ) : null}
      </div>
    </div>
  );
}
