// ModelWidget — the "Model It" bar-model + equivalent-fractions tile, restyled
// into the 5.31 system (consumes the `--w-*` themeable vars + _WidgetKit).
// Display-only: renders partitioned bars + fraction equalities from
// `config.fractions` (an array of {n,d}) or the default 2/3 = 4/6 = 6/9 example.
// Behaviour + export unchanged from v1.
//
// DEFAULT THEME: inherits the global default (cloud/blue) until rebinned.

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead } from "./_WidgetKit";
import styles from "./ModelWidget.module.css";
import kit from "./widgets530.module.css";

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

export function ModelWidget({ widget }: WidgetBodyProps): ReactNode {
  const fractions = readFractions(widget.config);
  const lead = fractions[0]!;

  return (
    <div className={kit.body}>
      <WHead label="Model It" />
      <div className={styles.heading}>
        Find equivalent fractions for <Frac n={lead.n} d={lead.d} big />
      </div>
      <div className={styles.bars}>
        {fractions.map((f) => (
          <div key={`${f.n}/${f.d}`} className={styles.col}>
            <Bar parts={f.d} filled={f.n} />
            <div className={styles.colFrac}>
              <Frac n={f.n} d={f.d} />
            </div>
          </div>
        ))}
      </div>
      <div className={styles.fracRow}>
        {fractions.map((f, i) => (
          <span key={`eq-${f.n}/${f.d}`} className={styles.fracRowItem}>
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
