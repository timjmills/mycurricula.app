"use client";

// ResourcesSort.tsx — all-resources table with type-filter chips.
//
// Shows every resource attached to lessons in the active subject.
// Filter chips: All / Slides / Video / Link / Doc / PDF / Image.
// Capped at MAX_DISPLAY rows for now (pagination is a later phase).
//
// Resources come from the caller — SubjectView collects them from
// usePlanner().lessons via flatMap(l => l.resources).

import type { ReactNode } from "react";
import { useState, useMemo } from "react";
import type { LessonResource } from "@/lib/types";
import { Chip } from "@/components/ui";
import { ResourceEmbed } from "@/components/resources";
import styles from "./ResourcesSort.module.css";

// ── Type metadata ─────────────────────────────────────────────────────────
// Background/foreground use neutral ink tokens — resource type is a
// functional category, not a subject, so subject-palette colors are
// intentionally NOT used here (CLAUDE.md: color carries meaning).

interface TypeMeta {
  label: string;
  glyph: string;
}

const TYPE_META: Record<LessonResource["type"], TypeMeta> = {
  slides: { label: "Slides", glyph: "▤" },
  youtube: { label: "Video", glyph: "▷" },
  link: { label: "Link", glyph: "⊗" },
  website: { label: "Website", glyph: "⊕" },
  doc: { label: "Doc", glyph: "⊟" },
  pdf: { label: "PDF", glyph: "⊞" },
  image: { label: "Image", glyph: "⊡" },
};

// Chip order — the "All" sentinel is prepended in the UI.
const CHIP_TYPES: LessonResource["type"][] = [
  "slides",
  "youtube",
  "link",
  "website",
  "doc",
  "pdf",
  "image",
];

// Maximum rows shown before pagination (Phase 1B).
const MAX_DISPLAY = 20;

// ── Resource row entry ─────────────────────────────────────────────────────

export interface ResourceEntry extends LessonResource {
  /** Title of the lesson this resource is attached to. */
  lessonTitle: string;
  /** Unit name for context. */
  unitName?: string;
}

// ── File icon ─────────────────────────────────────────────────────────────

function FileIcon(): ReactNode {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
    </svg>
  );
}

// ── ResourcesSort ─────────────────────────────────────────────────────────

export interface ResourcesSortProps {
  resources: ResourceEntry[];
  /** Subject display name — used in the section heading. */
  subjectName: string;
}

export function ResourcesSort({
  resources,
  subjectName,
}: ResourcesSortProps): ReactNode {
  const [activeType, setActiveType] = useState<LessonResource["type"] | null>(
    null,
  );

  // Derive which type chips have at least one matching resource so we only
  // show chips that are useful (the "All" chip always shows).
  const presentTypes = useMemo(
    () => CHIP_TYPES.filter((t) => resources.some((r) => r.type === t)),
    [resources],
  );

  const filtered = useMemo(
    () =>
      activeType ? resources.filter((r) => r.type === activeType) : resources,
    [resources, activeType],
  );

  const displayed = filtered.slice(0, MAX_DISPLAY);
  const overflow = filtered.length - displayed.length;

  return (
    <section className={styles.section} aria-label={`${subjectName} resources`}>
      {/* Type-filter chips — Chip variant="filter" toggles aria-pressed and
           applies the active fill automatically via the primitive's CSS. */}
      <div className={styles.chips} role="toolbar" aria-label="Filter by type">
        {/* All chip */}
        <Chip
          variant="filter"
          active={activeType === null}
          onClick={() => setActiveType(null)}
        >
          All
        </Chip>

        {presentTypes.map((type) => {
          const meta = TYPE_META[type];
          return (
            <Chip
              key={type}
              variant="filter"
              active={activeType === type}
              leadingIcon={<span>{meta.glyph}</span>}
              onClick={() =>
                setActiveType((prev) => (prev === type ? null : type))
              }
            >
              {meta.label}
            </Chip>
          );
        })}

        <div className={styles.chipSpacer} />

        <span className={styles.countLabel}>
          {resources.length} total
          {filtered.length !== resources.length &&
            ` · ${filtered.length} shown`}
        </span>
      </div>

      {/* Resource list */}
      <div className={styles.list}>
        {displayed.length === 0 && (
          <div className={styles.empty}>No resources of this type.</div>
        )}

        {displayed.map((r, i) => {
          const meta = TYPE_META[r.type];
          const rowKey = `${r.lessonTitle}|${r.type}|${r.label}|${i}`;
          return (
            <div
              key={rowKey}
              className={[styles.row, i % 2 === 0 ? styles.rowAlt : ""]
                .filter(Boolean)
                .join(" ")}
            >
              {r.url ? (
                <span className={styles.typeIcon}>
                  <ResourceEmbed resource={r} variant="row" />
                </span>
              ) : (
                <>
                  {/* Resource type icon */}
                  <span className={styles.typeIcon} aria-hidden="true">
                    <FileIcon />
                  </span>

                  {/* Type badge */}
                  <span
                    className={`${styles.typeBadge} cp-mono`}
                    aria-hidden="true"
                  >
                    {meta.glyph} {meta.label}
                  </span>
                </>
              )}

              {/* Resource label */}
              <span className={styles.resourceLabel}>{r.label}</span>

              {/* Unit context */}
              {r.unitName && (
                <span className={styles.unitCtx}>{r.unitName}</span>
              )}

              {/* Lesson context */}
              <span className={styles.lessonCtx}>{r.lessonTitle}</span>
            </div>
          );
        })}
      </div>

      {/* Overflow message — pagination in Phase 1B */}
      {overflow > 0 && (
        <div className={styles.overflow}>
          +{overflow} more resource{overflow === 1 ? "" : "s"} — pagination
          coming in Phase 1B.
        </div>
      )}
    </section>
  );
}
