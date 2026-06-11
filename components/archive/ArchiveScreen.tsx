"use client";

// ArchiveScreen — the Curriculum Archive (/archive).
//
// Design concept: "the closed ledger." The live planner is vivid and editable;
// a finished year is a BOUND, SEALED VOLUME pulled off the shelf — hushed,
// desaturated, read-only. The current year sits apart at the top as an OPEN
// volume (full color, a CTA into the live plan); archived years are sealed
// volumes below, each wearing a wax-seal lock and a page-edge "spine" of the
// eight locked subject colors. Clicking a sealed volume opens it (the inside
// cover) to a read-only summary.
//
// Every color/size here is a design token (app/tokens.css) — no hard-coded hex
// or px font sizes (CLAUDE.md §4). Saturation is the app's existing idiom for
// "receded" (done lessons fade via filter: saturate); the archive reuses it.

import { useState } from "react";
import Link from "next/link";
import {
  useSchoolYears,
  type SchoolYearSummary,
} from "@/lib/archive/school-years";
import styles from "./ArchiveScreen.module.css";

// Short, decorative seal/lock glyphs (aria-hidden — the label text carries
// meaning for assistive tech). Kept inline so the volume is self-contained.
function LockGlyph(): React.ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        d="M7 10V7a5 5 0 0 1 10 0v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect
        x="5"
        y="10"
        width="14"
        height="10"
        rx="2.4"
        fill="currentColor"
        opacity="0.16"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="15" r="1.5" fill="currentColor" />
    </svg>
  );
}

function spanLabel(year: SchoolYearSummary): string {
  // "Aug 2026 – Jun 2027" from the ISO bounds, locale-stable.
  const fmt = (iso: string): string => {
    const [y, m] = iso.split("-");
    const month = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ][Number(m) - 1];
    return `${month} ${y}`;
  };
  return `${fmt(year.startDate)} – ${fmt(year.endDate)}`;
}

// The page-edge "spine" — eight stacked subject bands. Saturation is dialed
// down for sealed volumes via the parent's filter; the bands themselves always
// reference the locked subject color (.cp-subj.<cls> → var(--c)).
function SubjectSpine({
  year,
  className,
}: {
  year: SchoolYearSummary;
  className?: string;
}): React.ReactNode {
  return (
    <div
      className={`${styles.spine} ${className ?? ""}`}
      aria-hidden="true"
      title={`Subjects: ${year.subjects.map((s) => s.name).join(", ")}`}
    >
      {year.subjects.map((s) => (
        <span
          key={s.id}
          className={`cp-subj ${s.cls} ${styles.spineBand}`}
        />
      ))}
    </div>
  );
}

function Stat({
  value,
  label,
}: {
  value: number | string;
  label: string;
}): React.ReactNode {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

// The live, editable year — an OPEN volume. Full color, a CTA into the plan.
function CurrentVolume({
  year,
}: {
  year: SchoolYearSummary;
}): React.ReactNode {
  return (
    <article className={styles.current}>
      <SubjectSpine year={year} className={styles.currentSpine} />
      <div className={styles.currentBody}>
        <div className={styles.eyebrowRow}>
          <span className={styles.eyebrowLive}>
            <span className={styles.liveDot} aria-hidden="true" />
            Current year
          </span>
          <span className={styles.eyebrowSpan}>{spanLabel(year)}</span>
        </div>
        <h2 className={styles.currentYear}>{year.label}</h2>
        <div className={styles.statRow}>
          <Stat value={year.unitCount} label="units" />
          <Stat value={year.lessonCount} label="lessons" />
          <Stat value={year.weeks} label="weeks" />
        </div>
        <div className={styles.currentActions}>
          <Link href="/weekly" className={styles.openPlanBtn}>
            Open this year&rsquo;s plan
            <span aria-hidden="true">→</span>
          </Link>
          <Link href="/year" className={styles.secondaryLink}>
            Year overview
          </Link>
        </div>
      </div>
    </article>
  );
}

// A finished year — a SEALED volume. Click to open the inside cover.
function ArchiveVolume({
  year,
  index,
}: {
  year: SchoolYearSummary;
  index: number;
}): React.ReactNode {
  const [open, setOpen] = useState(false);
  // Staggered reveal: each volume settles a beat after the previous one.
  const style = { ["--reveal-delay" as string]: `${index * 70}ms` };

  return (
    <article
      className={`${styles.volume} ${open ? styles.volumeOpen : ""}`}
      style={style}
      data-open={open || undefined}
    >
      <button
        type="button"
        className={styles.volumeFace}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <SubjectSpine year={year} className={styles.volumeSpine} />
        <span className={styles.seal} aria-hidden="true">
          <LockGlyph />
        </span>
        <span className={styles.volumeMeta}>
          <span className={styles.archivedEyebrow}>Archived</span>
          <span className={styles.volumeYear}>{year.label}</span>
          <span className={styles.volumeSpan}>{spanLabel(year)}</span>
        </span>
        <span className={styles.volumeCounts}>
          <span>
            <b>{year.unitCount}</b> units
          </span>
          <span className={styles.countDot} aria-hidden="true">
            ·
          </span>
          <span>
            <b>{year.lessonCount}</b> lessons
          </span>
        </span>
        <span className={styles.volumeChevron} aria-hidden="true">
          {open ? "Close" : "Open"}
        </span>
      </button>

      {/* The inside cover — read-only summary revealed when the volume opens. */}
      <div className={styles.insideCover} role="region" aria-hidden={!open}>
        <p className={styles.insideNote}>
          A finished plan, kept for reference. Nothing here can be edited.
        </p>
        <div className={styles.insideStats}>
          <Stat value={year.unitCount} label="units" />
          <Stat value={year.lessonCount} label="lessons" />
          <Stat value={year.weeks} label="weeks" />
          <Stat value={year.subjects.length} label="subjects" />
        </div>
        <ul className={styles.subjectLegend}>
          {year.subjects.map((s) => (
            <li key={s.id} className={styles.legendItem}>
              <span
                className={`cp-subj ${s.cls} ${styles.legendSwatch}`}
                aria-hidden="true"
              />
              {s.name}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

export function ArchiveScreen(): React.ReactNode {
  const { current, archived } = useSchoolYears();

  return (
    <div className={`cp-root ${styles.root}`}>
      {/* Atmosphere: a faint warm vignette behind the shelf — never on a card. */}
      <div className={styles.atmosphere} aria-hidden="true" />

      <header className={styles.head}>
        <p className={styles.kicker}>The shelf</p>
        <h1 className={styles.title}>Curriculum Archive</h1>
        <p className={styles.subtitle}>
          Every year you&rsquo;ve taught — the current plan stays open; finished
          years are sealed and kept for reference.
        </p>
      </header>

      {current && <CurrentVolume year={current} />}

      <section className={styles.shelfSection} aria-label="Archived years">
        <div className={styles.shelfHead}>
          <h2 className={styles.shelfTitle}>Sealed volumes</h2>
          <span className={styles.shelfCount}>
            {archived.length}{" "}
            {archived.length === 1 ? "year" : "years"} archived
          </span>
        </div>

        {archived.length === 0 ? (
          <p className={styles.empty}>
            No archived years yet. When you roll forward to a new year, this
            year&rsquo;s plan is sealed and shelved here.
          </p>
        ) : (
          <div className={styles.shelf}>
            {archived.map((year, i) => (
              <ArchiveVolume key={year.id} year={year} index={i} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
