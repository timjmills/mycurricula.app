"use client";

// ResourcesSort.tsx — all-resources table with type-filter chips, search,
// and sort. Each row is actionable: rows with a `url` open in a new tab;
// rows without a URL jump to the lesson via `/daily?lesson=<id>`.
//
// Resources come from the caller — SubjectView collects them from
// usePlanner().lessons via flatMap(l => l.resources), spreading every
// LessonResource field so url / provider / thumbnailUrl propagate here.
//
// W3-C4 (2026-05-28) reworked this surface:
//   1. Rows became <a> / <button> — clickable for the first time.
//   2. The generic FileIcon was replaced with type-specific icons (PDF,
//      Slides, Sheets, Doc, Drive, Image, Play, Globe, Link). See
//      ./icons.tsx for the mapping.
//   3. A search input + a sort ToggleGroup (Recent / A–Z / By type) header
//      sit above the chips. Search filters by `label` substring match,
//      case-insensitive. Sort + search state is purely local (no
//      localStorage, no persistence).
//   4. The overflow footer copy sharpened: it now names the cap explicitly
//      and references "beta+1" instead of internal phase naming.

import type { ReactNode, MouseEvent } from "react";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { LessonResource } from "@/lib/types";
import { Chip, ToggleGroup, Tooltip } from "@/components/ui";
import { ResourceEmbed } from "@/components/resources";
import { ResourceTypeIcon } from "./icons";
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
  notecard: { label: "Note", glyph: "❏" },
};

// Sort order of resource types when grouping "By type".
const TYPE_SORT_ORDER: Record<LessonResource["type"], number> = {
  slides: 0,
  youtube: 1,
  pdf: 2,
  doc: 3,
  image: 4,
  website: 5,
  link: 6,
  notecard: 7,
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
  "notecard",
];

// Maximum rows shown before pagination (beta+1).
const MAX_DISPLAY = 20;

// Sort modes for the new sort ToggleGroup.
type SortMode = "recent" | "az" | "type";

const SORT_OPTIONS: Array<{
  value: SortMode;
  label: string;
  title: string;
}> = [
  {
    value: "recent",
    label: "Recent",
    title: "Show resources in the order they're attached to lessons.",
  },
  {
    value: "az",
    label: "A–Z",
    title: "Sort resources alphabetically by name.",
  },
  {
    value: "type",
    label: "By type",
    title: "Group resources by type (slides, videos, PDFs, links, …).",
  },
];

// ── Resource row entry ─────────────────────────────────────────────────────

export interface ResourceEntry extends LessonResource {
  /** Title of the lesson this resource is attached to. */
  lessonTitle: string;
  /** Unit name for context. */
  unitName?: string;
  /** Id of the lesson the resource is attached to — used to jump to
   *  /daily?lesson=<id> when no URL is available. */
  lessonId?: string;
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
  const router = useRouter();

  const [activeType, setActiveType] = useState<LessonResource["type"] | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("recent");

  // Derive which type chips have at least one matching resource so we only
  // show chips that are useful (the "All" chip always shows).
  const presentTypes = useMemo(
    () => CHIP_TYPES.filter((t) => resources.some((r) => r.type === t)),
    [resources],
  );

  // Apply type-chip filter → search filter → sort. Each step is memoized so
  // typing/sorting only retriggers the dependent steps.
  const typeFiltered = useMemo(
    () =>
      activeType ? resources.filter((r) => r.type === activeType) : resources,
    [resources, activeType],
  );

  const searched = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return typeFiltered;
    return typeFiltered.filter((r) => r.label.toLowerCase().includes(q));
  }, [typeFiltered, searchQuery]);

  const sorted = useMemo(() => {
    if (sortMode === "recent") return searched;
    // Slice before sort — never mutate the caller's array.
    const copy = searched.slice();
    if (sortMode === "az") {
      copy.sort((a, b) =>
        a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
      );
    } else if (sortMode === "type") {
      copy.sort((a, b) => {
        const ta = TYPE_SORT_ORDER[a.type] ?? 99;
        const tb = TYPE_SORT_ORDER[b.type] ?? 99;
        if (ta !== tb) return ta - tb;
        // Within a type, secondary sort by label.
        return a.label.localeCompare(b.label, undefined, {
          sensitivity: "base",
        });
      });
    }
    return copy;
  }, [searched, sortMode]);

  const displayed = sorted.slice(0, MAX_DISPLAY);
  const totalAfterFilters = sorted.length;

  // ── Row interaction ─────────────────────────────────────────────────────
  // A row with a URL opens that URL in a new tab. A row without a URL jumps
  // to /daily?lesson=<id> so the teacher lands on the lesson the resource
  // is attached to. We render the appropriate element — <a> for the URL
  // case (gives the browser the right semantics for new-tab + middle-click
  // + right-click → copy link), <button> for the lesson-jump case.

  return (
    <section className={styles.section} aria-label={`${subjectName} resources`}>
      {/* ── Search + sort header ─────────────────────────────────────── */}
      <div className={styles.toolbar}>
        <Tooltip
          content="Filter the resource list by name."
          tooltipId="resources-sort-search"
        >
          <span className={styles.searchWrap}>
            {/* Decorative search glyph — purely visual; the input carries
                the accessible label. */}
            <svg
              className={styles.searchGlyph}
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5l3 3" />
            </svg>
            <input
              type="search"
              className={styles.searchInput}
              placeholder={`Search ${subjectName.toLowerCase()} resources…`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={`Search ${subjectName} resources`}
            />
          </span>
        </Tooltip>

        <div className={styles.sortWrap}>
          <ToggleGroup
            options={SORT_OPTIONS}
            value={sortMode}
            onChange={(v) => setSortMode(v)}
            size="sm"
            variant="subtle"
            ariaLabel="Sort resources"
          />
        </div>
      </div>

      {/* ── Type-filter chips ────────────────────────────────────────── */}
      {/* Chip variant="filter" toggles aria-pressed and applies the active
          fill automatically via the primitive's CSS. */}
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
          {totalAfterFilters !== resources.length &&
            ` · ${totalAfterFilters} shown`}
        </span>
      </div>

      {/* ── Resource list ────────────────────────────────────────────── */}
      <div className={styles.list}>
        {displayed.length === 0 && (
          <div className={styles.empty}>
            {searchQuery
              ? `No resources match "${searchQuery}".`
              : "No resources of this type."}
          </div>
        )}

        {displayed.map((r, i) => {
          const meta = TYPE_META[r.type];
          const rowKey = `${r.lessonTitle}|${r.type}|${r.label}|${i}`;
          const altClass = i % 2 === 0 ? styles.rowAlt : "";

          // Decide the row's interaction:
          //   • Has `url` → render an <a> that opens the URL in a new tab.
          //   • No `url`  → render a <button> that routes to the lesson via
          //     /daily?lesson=<lessonId>.
          //   • No `url` AND no `lessonId` → render a non-interactive <div>
          //     (legacy/fixture row; degrades gracefully).
          const hasUrl = Boolean(r.url);
          const hasLessonJump = !hasUrl && Boolean(r.lessonId);

          // Inner row content — shared across all three render branches.
          const rowInner = (
            <>
              <span className={styles.typeIcon} aria-hidden="true">
                <ResourceTypeIcon resource={r} />
              </span>

              {/* Type badge — keeps the textual context (hidden on phone). */}
              <span
                className={`${styles.typeBadge} cp-mono`}
                aria-hidden="true"
              >
                {meta.label}
              </span>

              {/* Resource label */}
              <span className={styles.resourceLabel}>{r.label}</span>

              {/* Unit context */}
              {r.unitName && (
                <span className={styles.unitCtx}>{r.unitName}</span>
              )}

              {/* Lesson context */}
              <span className={styles.lessonCtx}>{r.lessonTitle}</span>

              {/* Trailing affordance — a tiny arrow on actionable rows so
                  the teacher reads them as clickable at a glance. */}
              {(hasUrl || hasLessonJump) && (
                <span className={styles.actionGlyph} aria-hidden="true">
                  {hasUrl ? (
                    // External-link glyph
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 3H3v10h10v-3" />
                      <path d="M9 2h5v5M14 2L7 9" />
                    </svg>
                  ) : (
                    // Chevron-right (jump to lesson)
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 4l4 4-4 4" />
                    </svg>
                  )}
                </span>
              )}
            </>
          );

          // ── URL row → <a target="_blank"> ───────────────────────────
          if (hasUrl) {
            return (
              <Tooltip
                key={rowKey}
                content={`Open "${r.label}" in a new tab`}
                tooltipId="resources-sort-row-url"
              >
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={[styles.row, styles.rowAction, altClass]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {rowInner}
                </a>
              </Tooltip>
            );
          }

          // ── Lesson-jump row → <button> ──────────────────────────────
          if (hasLessonJump) {
            const onJump = (e: MouseEvent<HTMLButtonElement>): void => {
              e.preventDefault();
              router.push(`/daily?lesson=${r.lessonId}`);
            };
            return (
              <Tooltip
                key={rowKey}
                content={`Open the lesson "${r.lessonTitle}" in Daily view`}
                tooltipId="resources-sort-row-lesson"
              >
                <button
                  type="button"
                  className={[styles.row, styles.rowAction, altClass]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={onJump}
                >
                  {rowInner}
                </button>
              </Tooltip>
            );
          }

          // ── Legacy / fixture row — non-interactive fallback. ────────
          // No URL and no lesson id; render the same row visual without
          // the action affordance. ResourceEmbed.tsx's legacyMarker still
          // ships in the typeIcon slot for dev-time mis-wiring visibility.
          return (
            <div
              key={rowKey}
              className={[styles.row, altClass].filter(Boolean).join(" ")}
            >
              <span className={styles.typeIcon} aria-hidden="true">
                <ResourceTypeIcon resource={r} />
                <ResourceEmbed resource={r} variant="row" />
              </span>
              <span
                className={`${styles.typeBadge} cp-mono`}
                aria-hidden="true"
              >
                {meta.label}
              </span>
              <span className={styles.resourceLabel}>{r.label}</span>
              {r.unitName && (
                <span className={styles.unitCtx}>{r.unitName}</span>
              )}
              <span className={styles.lessonCtx}>{r.lessonTitle}</span>
            </div>
          );
        })}
      </div>

      {/* ── Cap-overflow footer ──────────────────────────────────────── */}
      {totalAfterFilters > MAX_DISPLAY && (
        <div className={styles.overflow}>
          Showing first {MAX_DISPLAY} of {totalAfterFilters} resources —
          pagination coming in beta+1.
        </div>
      )}
    </section>
  );
}
