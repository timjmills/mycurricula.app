"use client";

// YearBreadcrumb — the scope path for the merged Yearly view
// ("All subjects › Math › Unit 3 › Week 12"). Each ancestor segment is a button
// that pops the scope back to that level; the last segment is the current
// position (not a link). Hidden entirely at the all-subjects level (the timeline
// is self-evidently the root). Tokens only.

import type { ReactNode } from "react";
import type { YearScope } from "./year-scope";
import styles from "./year-breadcrumb.module.css";

export interface YearBreadcrumbProps {
  scope: YearScope;
  subjectName?: string;
  unitName?: string;
  onAll: () => void;
  onSubject: () => void;
  onUnit: () => void;
}

function Sep(): ReactNode {
  return (
    <span className={styles.sep} aria-hidden="true">
      ›
    </span>
  );
}

export function YearBreadcrumb({
  scope,
  subjectName,
  unitName,
  onAll,
  onSubject,
  onUnit,
}: YearBreadcrumbProps): ReactNode {
  if (scope.level === "all") return null;

  const atSubject = scope.level === "subject";
  const atUnit = scope.level === "unit";
  const atWeek = scope.level === "week";

  return (
    <nav className={styles.crumb} aria-label="Breadcrumb">
      <button type="button" className={styles.link} onClick={onAll}>
        All subjects
      </button>

      <Sep />
      {atSubject ? (
        <span className={styles.current}>{subjectName}</span>
      ) : (
        <button type="button" className={styles.link} onClick={onSubject}>
          {subjectName}
        </button>
      )}

      {atUnit || atWeek ? (
        <>
          <Sep />
          {atUnit ? (
            <span className={styles.current}>{unitName}</span>
          ) : (
            <button type="button" className={styles.link} onClick={onUnit}>
              {unitName}
            </button>
          )}
        </>
      ) : null}

      {atWeek ? (
        <>
          <Sep />
          <span className={styles.current}>Week {scope.week}</span>
        </>
      ) : null}
    </nav>
  );
}
