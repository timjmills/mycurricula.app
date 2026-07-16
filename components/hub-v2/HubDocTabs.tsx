"use client";

// HubDocTabs.tsx — the folder-tab row of the Planner Hub (Wave 8).
//
// Hub-LOCAL, bound to the hub's own open-doc list (NOT the app nav). A Home
// button (→ browse), a button per open doc (subject-railed, closable), and an
// Add(+) button. Only mounts when ≥1 doc is open.
//
// These are browser-style document tabs, NOT the WAI-ARIA "tabs" pattern
// (which requires a tablist of ONLY tabs, each wired to a tabpanel). We
// deliberately use plain navigation buttons + aria-current, so the strip can
// carry Home/close/Add alongside the doc buttons without an invalid ARIA
// composition (Codex W8 R5). Focus-after-close is owned by PlannerHub, which
// survives the last close (this strip unmounts at zero docs).

import type { ReactNode } from "react";
import { usePlanner } from "@/lib/planner-store";
import { Tooltip } from "@/components/ui";
import type { SubjectId } from "@/lib/types";
import type { HubDoc } from "./types";
import styles from "./hub.module.css";

export interface HubDocTabsProps {
  docs: HubDoc[];
  activeKey: string | null;
  onActivate: (key: string) => void;
  onClose: (key: string) => void;
  onHome: () => void;
  onAdd: () => void;
  /** True when the browse surface (not a doc) is showing. */
  homeActive: boolean;
}

function HomeIcon(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 11l8-7 8 7" />
      <path d="M6 10v9h12v-9" />
    </svg>
  );
}

export function HubDocTabs({
  docs,
  activeKey,
  onActivate,
  onClose,
  onHome,
  onAdd,
  homeActive,
}: HubDocTabsProps): ReactNode {
  const { subjectById } = usePlanner();

  return (
    <div className={styles.doctabs} aria-label="Open documents">
      <Tooltip content="Back to browse" side="bottom" tooltipId="hub-home">
        <button
          type="button"
          data-hub-home=""
          className={`${styles.homeBtn} ${homeActive ? styles.homeBtnOn : ""}`}
          aria-label="Browse"
          aria-pressed={homeActive}
          onClick={onHome}
        >
          <HomeIcon />
        </button>
      </Tooltip>

      {docs.map((doc) => {
        const subj = subjectById[doc.sid as SubjectId];
        const on = doc.key === activeKey && !homeActive;
        return (
          // Presentational wrapper; the activation button and the close button
          // are SIBLINGS, never nested (a focusable control inside another is
          // invalid). The wrapper carries the subject rail so it reads as one
          // folder tab.
          <div
            key={doc.key}
            className={`cp-subj ${subj?.cls ?? ""} ${styles.doctab} ${on ? styles.doctabOn : ""}`}
          >
            <span className={styles.doctabRail} />
            <button
              type="button"
              aria-current={on ? "page" : undefined}
              data-doctab-active={on ? "" : undefined}
              className={styles.doctabActivate}
              onClick={() => onActivate(doc.key)}
              title={doc.title}
            >
              <span className={styles.doctabLabel}>{doc.title}</span>
            </button>
            <button
              type="button"
              className={styles.doctabClose}
              aria-label={`Close ${doc.title}`}
              onClick={() => onClose(doc.key)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        );
      })}

      <Tooltip content="Open another lesson or unit" side="bottom" tooltipId="hub-add">
        <button type="button" className={styles.addTab} aria-label="Open another document" onClick={onAdd}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </Tooltip>
    </div>
  );
}
