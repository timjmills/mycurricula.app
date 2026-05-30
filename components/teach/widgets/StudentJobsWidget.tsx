// StudentJobsWidget — the classroom-jobs roster: a job + the assigned student
// (5.31 handoff, Routines & Management #5). Display-only.
//
// PRIVACY (CLAUDE.md §11.4): the assigned student shows as an INITIAL-on-tint
// avatar + the initial label only — never a full name. The config/persisted
// shape carries `initial`, never a name.
//
// DEFAULT THEME: { bg: "yellow", accent: "orange" } (Sunshine card, orange).

import type { ReactNode } from "react";
import type { WidgetBodyProps } from "./types";
import { WHead, KitIcon, Avatar, FootNote } from "./_WidgetKit";
import type { KitIconName } from "./_WidgetKit";
import styles from "./StudentJobsWidget.module.css";
import kit from "./widgets530.module.css";

interface Job {
  icon: KitIconName;
  job: string;
  /** A single-letter initial — never a full name. */
  initial: string;
}

// Seeded with INITIALS only (privacy §11.4).
const FALLBACK: Job[] = [
  { icon: "flag", job: "Line Leader", initial: "B" },
  { icon: "boxIco", job: "Materials Helper", initial: "A" },
  { icon: "laptop", job: "Tech Helper", initial: "D" },
  { icon: "easel", job: "Board Helper", initial: "E" },
];

const ICONS: readonly KitIconName[] = [
  "flag",
  "boxIco",
  "laptop",
  "easel",
  "book",
  "bell",
];

function readJobs(config: Record<string, unknown>): Job[] {
  const raw = config.jobs;
  if (Array.isArray(raw)) {
    const jobs = raw
      .map((j, i): Job | null => {
        if (j && typeof j === "object") {
          const o = j as Record<string, unknown>;
          const job = typeof o.job === "string" ? o.job : null;
          const initial =
            typeof o.initial === "string" && o.initial.length > 0
              ? o.initial[0]!.toUpperCase()
              : null;
          if (job) {
            return { job, initial: initial ?? "?", icon: ICONS[i % ICONS.length] ?? "flag" };
          }
        }
        return null;
      })
      .filter((j): j is Job => j !== null);
    if (jobs.length > 0) return jobs;
  }
  return FALLBACK;
}

export function StudentJobsWidget({ widget }: WidgetBodyProps): ReactNode {
  const jobs = readJobs(widget.config);

  return (
    <div className={`${kit.body} ${kit.tones}`}>
      <WHead label="Student Jobs" />
      <div className={styles.jobs}>
        {jobs.map((j, i) => (
          <div key={i} className={`${kit.card} ${styles.job}`}>
            <span className={styles.jobIcon}>
              <KitIcon name={j.icon} size={1.5} />
            </span>
            <span className={styles.jobName}>{j.job}</span>
            <span className={styles.assignee}>
              <Avatar label={j.initial} size={2} />
              <span className={styles.assigneeLabel}>{j.initial}</span>
            </span>
          </div>
        ))}
      </div>
      <FootNote tone="amber" icon={<KitIcon name="star" size={1} />}>
        Thank you for helping our class shine!
      </FootNote>
    </div>
  );
}
