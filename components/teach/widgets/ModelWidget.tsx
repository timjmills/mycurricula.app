// ModelWidget — the "Model It" bar-model + equivalent-fractions tile, ported
// from the prototype's ModelBar / Frac (docs/teach-view-plan.md §4.5).
// Display-only: it renders the partitioned bars + fraction equalities from
// `config.fractions` (an array of {n,d} read top-down) or the default
// 2/3 = 4/6 = 6/9 example. Bar fill + outline are subject-tinted via `.cp-subj`.

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import styles from "./widgets.module.css";

interface Fraction {
  n: number;
  d: number;
}

const DEFAULT_FRACTIONS: Fraction[] = [
  { n: 2, d: 3 },
  { n: 4, d: 6 },
  { n: 6, d: 9 },
];

function readFractions(config: Record<string, unknown>): Fraction[] {
  const raw = config.fractions;
  if (Array.isArray(raw)) {
    const parsed = raw
      .filter(
        (f): f is { n: number; d: number } =>
          !!f &&
          typeof f === "object" &&
          typeof (f as { n?: unknown }).n === "number" &&
          typeof (f as { d?: unknown }).d === "number" &&
          (f as { d: number }).d > 0,
      )
      .map((f) => ({ n: f.n, d: f.d }));
    if (parsed.length > 0) return parsed.slice(0, 3);
  }
  return DEFAULT_FRACTIONS;
}

/** A stacked numerator-over-denominator fraction glyph. */
function Frac({ n, d, big }: Fraction & { big?: boolean }): ReactNode {
  return (
    <span className={`${styles.frac} ${big ? styles.fracBig : ""}`}>
      <span>{n}</span>
      <span className={styles.fracBar} />
      <span>{d}</span>
    </span>
  );
}

/** A single bar partitioned into `parts`, with `filled` segments tinted. */
function Bar({ parts, filled }: { parts: number; filled: number }): ReactNode {
  return (
    <div className={styles.bar} aria-hidden="true">
      {Array.from({ length: parts }).map((_, i) => (
        <div
          key={i}
          className={`${styles.barPart} ${i < filled ? styles.barPartFilled : ""}`}
        />
      ))}
    </div>
  );
}

export function ModelWidget({ widget, subjectId }: WidgetBodyProps): ReactNode {
  const fractions = readFractions(widget.config);
  const lead = fractions[0];

  return (
    <div className={`cp-subj ${subjectId} ${styles.body} ${styles.model}`}>
      <div className={styles.modelHeading}>
        Find equivalent fractions for <Frac n={lead.n} d={lead.d} big />
      </div>
      <div className={styles.modelBars}>
        {fractions.map((f) => (
          <div key={`${f.n}/${f.d}`} className={styles.modelCol}>
            <Bar parts={f.d} filled={f.n} />
            <div style={{ textAlign: "center" }}>
              <Frac n={f.n} d={f.d} />
            </div>
          </div>
        ))}
      </div>
      <div className={styles.fracRow}>
        {fractions.map((f, i) => (
          <span key={`eq-${f.n}/${f.d}`} style={{ display: "contents" }}>
            <Frac n={f.n} d={f.d} />
            {i < fractions.length - 1 ? (
              <span className={styles.fracEq}>=</span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}
