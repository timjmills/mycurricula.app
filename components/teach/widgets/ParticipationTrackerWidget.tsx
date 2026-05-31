// ParticipationTrackerWidget — INTERACTIVE two-column participation tracker
// (5.31 handoff, Assessment & Support #4). Students (INITIALS only — privacy
// §11.4) sit in either "Shared Today" or "Not Yet Shared"; tapping an avatar
// moves it to the other column and both counts recompute live.
//
// State is STRUCTURE-ONLY: a per-student boolean ("shared") keyed by index,
// persisted via useWidgetState. The roster is a list of initials from config;
// no name is stored.
//
// DEFAULT THEME: { bg: "blue", accent: "blue" } (Sky card, blue accent).

"use client";

import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useWidgetState } from "@/lib/teach/use-widget-state";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon, Avatar, FootNote } from "./_WidgetKit";
import styles from "./ParticipationTrackerWidget.module.css";
import kit from "./widgets530.module.css";

// Seeded with INITIALS only (privacy §11.4) — generic single letters.
const FALLBACK_INITIALS = [
  "M",
  "B",
  "Z",
  "S",
  "K",
  "A",
  "L",
  "I",
  "T",
  "R",
  "E",
  "J",
  "N",
  "O",
  "P",
];

/** Structure-only persisted slice — one shared/not-shared flag per student. */
interface ShareState extends Record<string, unknown> {
  shared: boolean[];
}

function readInitials(config: Record<string, unknown>): string[] {
  const raw = config.initials;
  if (Array.isArray(raw)) {
    const items = raw
      .filter((x): x is string => typeof x === "string" && x.length > 0)
      .map((x) => x[0]!.toUpperCase());
    if (items.length > 0) return items;
  }
  return FALLBACK_INITIALS;
}

export function ParticipationTrackerWidget({
  widget,
}: WidgetBodyProps): ReactNode {
  const initials = useMemo(() => readInitials(widget.config), [widget.config]);

  // Default: roughly the first ~60% have shared (matches the handoff sample).
  const initial = useMemo<ShareState>(
    () => ({
      shared: initials.map((_, i) => i < Math.ceil(initials.length * 0.6)),
    }),
    [initials],
  );
  const { state, setState } = useWidgetState<ShareState>(widget.id, initial);

  const shared = initials.map((_, i) => state.shared[i] ?? false);

  const toggle = useCallback(
    (idx: number): void => {
      setState((prev) => {
        const next = initials.map((_, i) => prev.shared[i] ?? false);
        next[idx] = !next[idx];
        return { shared: next };
      });
    },
    [initials, setState],
  );

  const sharedIdx = initials.map((_, i) => i).filter((i) => shared[i]);
  const notIdx = initials.map((_, i) => i).filter((i) => !shared[i]);

  const renderCluster = (idxs: number[]): ReactNode => (
    <div className={styles.cluster}>
      {idxs.map((i) => (
        <button
          key={i}
          type="button"
          className={styles.avBtn}
          onClick={() => toggle(i)}
          title="Tap to move this student to the other column"
          aria-label={`Student ${initials[i]} — tap to toggle shared status`}
        >
          <Avatar label={initials[i]} size={2.3} />
        </button>
      ))}
      {idxs.length === 0 ? (
        <span className={styles.empty}>None yet</span>
      ) : null}
    </div>
  );

  return (
    <div className={`${kit.body} ${kit.tones}`}>
      <WHead label="Participation Tracker" />
      <div className={`${kit.card} ${styles.panel}`}>
        <div className={styles.cols}>
          <div className={styles.col}>
            <div className={styles.colHead}>
              <span className={styles.colIconShared}>
                <KitIcon name="msg" size={1.2} />
              </span>
              <span className={styles.colTitle}>Shared Today</span>
              <span className={`${styles.badge} ${styles.badgeShared}`}>
                {sharedIdx.length}
              </span>
            </div>
            {renderCluster(sharedIdx)}
          </div>
          <div className={styles.divider} />
          <div className={styles.col}>
            <div className={styles.colHead}>
              <span className={styles.colIconNot}>
                <KitIcon name="msg" size={1.2} />
              </span>
              <span className={styles.colTitle}>Not Yet Shared</span>
              <span className={`${styles.badge} ${styles.badgeNot}`}>
                {notIdx.length}
              </span>
            </div>
            {renderCluster(notIdx)}
          </div>
        </div>
      </div>
      <div className={styles.foots}>
        <FootNote tone="blue" icon={<KitIcon name="star" size={1} />}>
          Awesome sharing! Keep it up!
        </FootNote>
        <FootNote tone="pink" icon={<KitIcon name="users" size={1} />}>
          Everyone has something valuable to share!
        </FootNote>
      </div>
    </div>
  );
}
