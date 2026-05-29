// PollWidget — a quick-check poll, display-only (docs/teach-view-plan.md §4.5).
// Renders the question + option bars from `config.question` / `config.options`
// (each {label, pct}) or a default. The result bars are frozen — live voting is
// the Phase 3 interactive library. Bar fill is subject-tinted via `.cp-subj`.

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import styles from "./widgets.module.css";

interface PollOption {
  label: string;
  pct: number;
}

const DEFAULT_QUESTION = "Which fractions are equivalent to 2/3?";
const DEFAULT_OPTIONS: PollOption[] = [
  { label: "4/6", pct: 62 },
  { label: "6/9", pct: 24 },
  { label: "3/4", pct: 14 },
];

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function readOptions(config: Record<string, unknown>): PollOption[] {
  const raw = config.options;
  if (Array.isArray(raw)) {
    const parsed = raw
      .filter(
        (o): o is Record<string, unknown> =>
          !!o && typeof o === "object" && !Array.isArray(o),
      )
      .map((o) => ({
        label: typeof o.label === "string" ? o.label : "—",
        pct: typeof o.pct === "number" ? clampPct(o.pct) : 0,
      }));
    if (parsed.length > 0) return parsed;
  }
  return DEFAULT_OPTIONS;
}

export function PollWidget({ widget, subjectId }: WidgetBodyProps): ReactNode {
  const question =
    typeof widget.config.question === "string" && widget.config.question.trim()
      ? widget.config.question
      : DEFAULT_QUESTION;
  const options = readOptions(widget.config);

  return (
    <div className={`cp-subj ${subjectId} ${styles.body} ${styles.poll}`}>
      <div className={styles.pollQuestion}>{question}</div>
      {options.map((o, i) => (
        <div key={`${o.label}-${i}`} className={styles.pollOption}>
          <div className={styles.pollOptionHead}>
            <span>{o.label}</span>
            <span>{o.pct}%</span>
          </div>
          <div
            className={styles.pollTrack}
            role="img"
            aria-label={`${o.label}: ${o.pct} percent`}
          >
            <div className={styles.pollFill} style={{ width: `${o.pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
