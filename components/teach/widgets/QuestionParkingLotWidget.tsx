// QuestionParkingLotWidget — a list of parked student questions, each with a
// disposition tag (Answered / Discuss Later / Teach Next) (5.31 handoff,
// Assessment & Support #5). Display-only.
//
// PRIVACY (CLAUDE.md §11.4): the asker shows as an INITIAL only — never a full
// name; the config/persisted shape carries `initial`, not a name. (The question
// TEXT is content the teacher authored, not student PII.)
//
// DEFAULT THEME: { bg: "pink", accent: "pink" } (Blossom card, pink accent).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon, Pill, FootNote } from "./_WidgetKit";
import type { KitIconName, Tone } from "./_WidgetKit";
import styles from "./QuestionParkingLotWidget.module.css";
import kit from "./widgets530.module.css";

interface ParkedQ {
  /** A single-letter initial — never a full name. */
  initial: string;
  q: string;
  tag: string;
  tone: Tone;
  icon: KitIconName;
}

// Disposition presets — tag → tone + icon.
const DISPOSITIONS: Record<string, { tone: Tone; icon: KitIconName }> = {
  Answered: { tone: "green", icon: "check" },
  "Discuss Later": { tone: "amber", icon: "clock" },
  "Teach Next": { tone: "purple", icon: "book" },
};

// Seeded with INITIALS only (privacy §11.4).
const FALLBACK: ParkedQ[] = [
  {
    initial: "C",
    q: "Why do we need parentheses in that step?",
    tag: "Answered",
    tone: "green",
    icon: "check",
  },
  {
    initial: "A",
    q: "Can you show another example using decimals?",
    tag: "Discuss Later",
    tone: "amber",
    icon: "clock",
  },
  {
    initial: "D",
    q: "How does this connect to real life?",
    tag: "Teach Next",
    tone: "purple",
    icon: "book",
  },
  {
    initial: "L",
    q: "What happens if the variable is negative?",
    tag: "Discuss Later",
    tone: "amber",
    icon: "clock",
  },
  {
    initial: "B",
    q: "Is there a shortcut for solving this?",
    tag: "Teach Next",
    tone: "purple",
    icon: "book",
  },
];

function readQuestions(config: Record<string, unknown>): ParkedQ[] {
  const raw = config.questions;
  if (Array.isArray(raw)) {
    const qs = raw
      .map((item): ParkedQ | null => {
        if (item && typeof item === "object") {
          const o = item as Record<string, unknown>;
          const q = typeof o.q === "string" ? o.q : null;
          const initial =
            typeof o.initial === "string" && o.initial.length > 0
              ? o.initial[0]!.toUpperCase()
              : "?";
          const tag = typeof o.tag === "string" ? o.tag : "Teach Next";
          const disp = DISPOSITIONS[tag] ?? DISPOSITIONS["Teach Next"]!;
          if (q) return { initial, q, tag, tone: disp.tone, icon: disp.icon };
        }
        return null;
      })
      .filter((q): q is ParkedQ => q !== null);
    if (qs.length > 0) return qs;
  }
  return FALLBACK;
}

export function QuestionParkingLotWidget({
  widget,
}: WidgetBodyProps): ReactNode {
  const questions = readQuestions(widget.config);

  return (
    <div className={`${kit.body} ${kit.tones}`}>
      <WHead label="Question Parking Lot" />
      <div className={`${kit.card} ${styles.list}`}>
        {questions.map((r, i) => (
          <div
            key={i}
            className={`${styles.row} ${i < questions.length - 1 ? styles.bordered : ""}`}
          >
            <span className={styles.qMark}>?</span>
            <span className={styles.initial}>{r.initial}</span>
            <span className={styles.question}>{r.q}</span>
            <Pill
              tone={r.tone}
              icon={
                <span className={styles.tagIcon}>
                  <KitIcon name={r.icon} size={0.9} />
                </span>
              }
            >
              {r.tag}
            </Pill>
          </div>
        ))}
      </div>
      <FootNote tone="pink" icon={<KitIcon name="star" size={1} />}>
        Great questions! We&apos;ll tackle these together.
      </FootNote>
    </div>
  );
}
