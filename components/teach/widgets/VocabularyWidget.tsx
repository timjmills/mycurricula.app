// VocabularyWidget — key words + kid-friendly definitions (5.31 handoff, Small
// Groups & Language #3). Display-only: renders each term as a card with the word
// and its definition, falling back to a reading example so an unconfigured tile
// still reads.
//
// DEFAULT THEME: { bg: "blue", accent: "blue" } (Sky card, blue accent).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon } from "./_WidgetKit";
import styles from "./VocabularyWidget.module.css";
import kit from "./widgets530.module.css";

interface Term {
  word: string;
  def: string;
}

const FALLBACK: Term[] = [
  { word: "summarize", def: "To tell the most important parts in a short way." },
  { word: "evidence", def: "Proof from the text that supports your idea." },
  { word: "infer", def: "To figure something out using clues." },
];

function readTerms(config: Record<string, unknown>): Term[] {
  const raw = config.terms;
  if (Array.isArray(raw)) {
    const terms = raw
      .map((t): Term | null => {
        if (t && typeof t === "object") {
          const o = t as Record<string, unknown>;
          const word = typeof o.word === "string" ? o.word : null;
          const def = typeof o.def === "string" ? o.def : null;
          if (word) return { word, def: def ?? "" };
        }
        return null;
      })
      .filter((t): t is Term => t !== null);
    if (terms.length > 0) return terms;
  }
  return FALLBACK;
}

export function VocabularyWidget({ widget }: WidgetBodyProps): ReactNode {
  const terms = readTerms(widget.config);

  return (
    <div className={kit.body}>
      <WHead label="Key Words" />
      <div className={styles.list}>
        {terms.map((t, i) => (
          <div key={i} className={`${kit.card} ${styles.term}`}>
            <span className={styles.bookIcon}>
              <KitIcon name="book" size={1.4} />
            </span>
            <div className={styles.termMain}>
              <div className={styles.word}>{t.word}</div>
              {t.def ? <div className={styles.def}>{t.def}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
