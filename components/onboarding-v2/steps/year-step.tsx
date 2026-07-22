"use client";

// year-step.tsx — v2 onboarding step 4: the academic year.
//
// Captures the term start + end dates into the onboarding record. The full
// academic calendar — holidays, no-school days, term structure — lives in
// Settings → Calendar (the live team-wide editor); rather than duplicate a
// holidays store here we capture the year bounds and link out for the details.
// The academic year is a TEAM-wide setting, so the date inputs carry `required`
// tooltips (CLAUDE.md §4).

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useOnboardingV2 } from "@/lib/onboarding-v2-state";
import { Button, Tooltip } from "@/components/ui";
import styles from "./steps-v2.module.css";

export function YearStep(): ReactNode {
  const router = useRouter();
  const { data, update } = useOnboardingV2();

  return (
    <div>
      <h1 className={styles.heading}>Your school year</h1>
      <p className={styles.helper}>
        When does this year run? These bounds anchor the yearly roadmap and
        pacing for the whole team.
      </p>

      <div className={styles.section}>
        <div className={styles.dateRow}>
          <div className={styles.dateField}>
            <label htmlFor="wizard-year-start" className={styles.fieldLabel}>
              School year start
            </label>
            <Tooltip
              content="The first day of the school year — anchors the yearly roadmap for the whole team."
              side="bottom"
              required
            >
              <input
                id="wizard-year-start"
                type="date"
                className={styles.dateInput}
                value={data.yearStart}
                onChange={(e) => update({ yearStart: e.target.value })}
                aria-label="School year start date"
                title="The first day of the school year."
              />
            </Tooltip>
          </div>
          <div className={styles.dateField}>
            <label htmlFor="wizard-year-end" className={styles.fieldLabel}>
              School year end
            </label>
            <Tooltip
              content="The last day of the school year — bounds the yearly roadmap for the whole team."
              side="bottom"
              required
            >
              <input
                id="wizard-year-end"
                type="date"
                className={styles.dateInput}
                value={data.yearEnd}
                onChange={(e) => update({ yearEnd: e.target.value })}
                aria-label="School year end date"
                title="The last day of the school year."
              />
            </Tooltip>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <span className={styles.sectionLabel}>Holidays &amp; breaks</span>
        <p className={styles.note}>
          Add holidays, breaks, and no-school days in Settings &rarr; Calendar —
          it has the full editor and they&rsquo;ll show across the planner. You
          can do this any time; your setup progress here is saved.
        </p>
        <div>
          <Tooltip
            content="Open Settings → Calendar to add holidays and no-school days for the whole team. Your setup progress is saved, so you can come back to finish."
            side="top"
            tooltipId="onboarding-v2-holidays"
          >
            <Button
              variant="secondary"
              size="md"
              onClick={() => router.push("/settings/calendar")}
              aria-label="Open calendar settings"
            >
              Add holidays
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
