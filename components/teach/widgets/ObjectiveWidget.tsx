// ObjectiveWidget — the "I Can" objective tile + standard chips, subject-tinted
// (docs/teach-view-plan.md §4.5). Display-only: it renders the objective text
// and CCSS standard codes from `widget.config`, falling back to the prototype's
// fraction example so an unconfigured tile still reads. Subject accent comes
// through `.cp-subj` (the wrapper applies the subject id as a class so the
// `--c / --cl / --cd` tokens resolve), per CLAUDE.md §4 / §9 note #8.

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { TeachIcon } from "./icons";
import styles from "./widgets.module.css";

/** Read the objective text from config, with a faithful fallback. */
function readText(config: Record<string, unknown>): string {
  const t = config.iCan ?? config.objective ?? config.text;
  return typeof t === "string" && t.trim().length > 0
    ? t
    : "Find three equivalent fractions for a given fraction.";
}

/** Read the standard codes from config (array of strings), with a fallback. */
function readStandards(config: Record<string, unknown>): string[] {
  const s = config.standards;
  if (Array.isArray(s)) {
    const codes = s.filter((x): x is string => typeof x === "string");
    if (codes.length > 0) return codes;
  }
  return ["5.NF.B.3", "5.NF.A.1"];
}

export function ObjectiveWidget({
  widget,
  subjectId,
}: WidgetBodyProps): ReactNode {
  const text = readText(widget.config);
  const standards = readStandards(widget.config);

  return (
    <div className={`cp-subj ${subjectId} ${styles.objective}`}>
      <span className={styles.objectiveIcon}>
        <TeachIcon name="target" size={24} />
      </span>
      <div className={styles.objectiveMain}>
        <span className={styles.objectivePill}>I CAN</span>
        <div className={styles.objectiveText}>{text}</div>
        {standards.length > 0 ? (
          <div className={styles.objectiveStandards}>
            <span>Standard:</span>
            {standards.map((code) => (
              <span key={code} className={`cp-mono ${styles.objectiveChip}`}>
                {code}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
