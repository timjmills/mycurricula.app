"use client";

// standards-step.tsx — onboarding step: "Which standards do you align to?"
//
// Uses the live FrameworkBrowser against the real catalog (176 frameworks) instead
// of the old hardcoded shortlist: major global frameworks upfront, then region
// groups, then full-catalog search. Selecting a framework stores its real
// `standards_frameworks.id` (UUID) in `data.standards`; on onboarding finish those
// seed the teacher's framework set. The step is skippable (zero selections is fine).

import { useEffect, useState, type ReactNode } from "react";
import { useOnboarding } from "@/lib/onboarding-state";
import { Badge } from "@/components/ui";
import { FrameworkBrowser } from "@/components/standards/FrameworkBrowser";
import type { FrameworkSummary } from "@/lib/standards/queries";
import styles from "./standards-step.module.css";

export function StandardsStep(): ReactNode {
  const { data, update } = useOnboarding();
  const [frameworks, setFrameworks] = useState<FrameworkSummary[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/standards/frameworks")
      .then((r) => r.json())
      .then((d: { frameworks?: FrameworkSummary[] }) => {
        if (alive) setFrameworks(Array.isArray(d.frameworks) ? d.frameworks : []);
      })
      .catch(() => {
        if (alive) setFrameworks([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const selectedIds = new Set(data.standards);

  function toggle(id: string, next: boolean): void {
    const set = new Set(data.standards);
    if (next) set.add(id);
    else set.delete(id);
    update({ standards: [...set] });
  }

  return (
    <div className={styles.root}>
      <h1 className={styles.heading}>Which standards do you align to?</h1>
      <p className={styles.helper}>
        Pick the curriculum frameworks you teach — start with the common ones, or
        search for any of 170+. You can change these any time in Settings.
      </p>

      {frameworks === null ? (
        <p className={styles.helper}>Loading frameworks…</p>
      ) : frameworks.length === 0 ? (
        <p className={styles.helper}>
          We couldn’t load the framework list right now — you can set this up
          later in Settings → Standards.
        </p>
      ) : (
        <FrameworkBrowser
          frameworks={frameworks}
          selectedIds={selectedIds}
          onToggle={toggle}
          mode="onboarding"
        />
      )}

      {data.standards.length > 0 && (
        <p className={styles.tally} aria-live="polite">
          <Badge variant="info" size="md">
            {data.standards.length === 1
              ? "1 framework selected"
              : `${data.standards.length} frameworks selected`}
          </Badge>
        </p>
      )}
    </div>
  );
}
