"use client";

// FrameworkBrowser — the shared standards-framework picker.
//
// Used by BOTH the onboarding standards step (localStorage selection) and the
// Settings → Standards page (Supabase selection). Purely PRESENTATIONAL + CONTROLLED
// — it never persists; the host owns `selectedIds` and handles `onToggle`. Layout
// per the product spec:
//   1. Featured strip  — major global frameworks upfront (is_featured).
//   2. Grouped browse  — International/Global → geographic regions → specialized,
//      each a collapsible section.
//   3. Full-catalog search — "Don't see your standard?" filters ALL frameworks
//      (name / short code / region / jurisdiction / subject) client-side; the
//      catalog is only ~176 rows so no server round-trip is needed.
//
// Tokens only, six themes, three viewport tiers. Each row is a checkbox-role
// button (≥44px) mirroring the onboarding toggle. `lockedIds` marks frameworks
// that come from the school default (a "School" chip); they remain toggleable
// (toggling writes a personal override).

import { useMemo, useState, type ReactNode } from "react";
import { Badge, Tooltip } from "@/components/ui";
import type { FrameworkSummary } from "@/lib/standards/queries";
import styles from "./FrameworkBrowser.module.css";

export interface FrameworkBrowserProps {
  frameworks: FrameworkSummary[];
  selectedIds: Set<string>;
  onToggle: (id: string, nextSelected: boolean) => void;
  mode: "onboarding" | "settings";
  /** Framework ids that come from the school default (shown with a "School" chip). */
  lockedIds?: Set<string>;
}

// Region browse order + display labels: International/Global → geographic → other.
const REGION_ORDER: { key: string; label: string }[] = [
  { key: "global", label: "International / Global" },
  { key: "north_america", label: "North America" },
  { key: "europe", label: "Europe" },
  { key: "asia_pacific", label: "Asia–Pacific" },
  { key: "mena", label: "Middle East & North Africa" },
  { key: "latin_america", label: "Latin America" },
  { key: "africa", label: "Africa" },
  { key: "__other", label: "Other / specialized" },
];

function regionKey(f: FrameworkSummary): string {
  return f.region && REGION_ORDER.some((r) => r.key === f.region)
    ? f.region
    : "__other";
}

function matchesQuery(f: FrameworkSummary, q: string): boolean {
  const hay = [
    f.name,
    f.shortCode,
    f.region ?? "",
    f.jurisdiction ?? "",
    f.gradeRange ?? "",
    ...f.subjectScope,
  ]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((tok) => hay.includes(tok));
}

export function FrameworkBrowser({
  frameworks,
  selectedIds,
  onToggle,
  mode,
  lockedIds,
}: FrameworkBrowserProps): ReactNode {
  const [query, setQuery] = useState("");

  const featured = useMemo(
    () =>
      frameworks
        .filter((f) => f.isFeatured)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [frameworks],
  );

  const byRegion = useMemo(() => {
    const groups = new Map<string, FrameworkSummary[]>();
    for (const f of frameworks) {
      if (f.isFeatured) continue; // featured shown in the strip, not the groups
      const key = regionKey(f);
      const list = groups.get(key);
      if (list) list.push(f);
      else groups.set(key, [f]);
    }
    for (const list of groups.values())
      list.sort((a, b) => a.name.localeCompare(b.name));
    return groups;
  }, [frameworks]);

  const searchResults = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    return frameworks
      .filter((f) => matchesQuery(f, q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [frameworks, query]);

  function renderRow(f: FrameworkSummary): ReactNode {
    const selected = selectedIds.has(f.id);
    const locked = lockedIds?.has(f.id) ?? false;
    const subtitle =
      f.jurisdiction ||
      (f.subjectScope.length > 0 ? f.subjectScope.slice(0, 3).join(", ") : "") ||
      f.region ||
      "";
    const tip = `${selected ? "Remove" : "Add"} ${f.name} (${f.shortCode})${
      f.gradeRange ? ` · ${f.gradeRange}` : ""
    } — lessons can be tagged with standards from any framework you select here`;
    return (
      <li key={f.id} className={styles.item}>
        <Tooltip content={tip} side="top">
          <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            onClick={() => onToggle(f.id, !selected)}
            className={`${styles.row} ${selected ? styles.rowSelected : ""} cp-focusable`}
            title={tip}
          >
            <span className={styles.check} aria-hidden data-checked={selected} />
            <span className={styles.text}>
              <span className={styles.labelRow}>
                <span className={styles.label}>{f.name}</span>
                <span className={styles.code}>{f.shortCode}</span>
                {locked && (
                  <Badge variant="neutral" size="sm">
                    School
                  </Badge>
                )}
              </span>
              {subtitle && <span className={styles.detail}>{subtitle}</span>}
            </span>
          </button>
        </Tooltip>
      </li>
    );
  }

  return (
    <div className={styles.root} data-mode={mode}>
      {/* Full-catalog search — the "Don't see your standard?" affordance. */}
      <div className={styles.searchRow}>
        <input
          type="search"
          className={`${styles.search} cp-focusable`}
          placeholder="Don't see your standard? Search all frameworks…"
          aria-label="Search all standards frameworks"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {searchResults ? (
        <section className={styles.group} aria-label="Search results">
          <div className={styles.groupHead}>
            <span className={styles.groupTitle}>
              {searchResults.length} match
              {searchResults.length === 1 ? "" : "es"}
            </span>
          </div>
          {searchResults.length > 0 ? (
            <ul className={styles.list} role="group">
              {searchResults.map(renderRow)}
            </ul>
          ) : (
            <p className={styles.empty}>
              No frameworks match “{query.trim()}”.
            </p>
          )}
        </section>
      ) : (
        <>
          {featured.length > 0 && (
            <section className={styles.group} aria-label="Featured frameworks">
              <div className={styles.groupHead}>
                <span className={styles.groupTitle}>Common frameworks</span>
                <span className={styles.groupHint}>Most schools start here</span>
              </div>
              <ul className={styles.list} role="group">
                {featured.map(renderRow)}
              </ul>
            </section>
          )}

          {REGION_ORDER.map(({ key, label }) => {
            const list = byRegion.get(key);
            if (!list || list.length === 0) return null;
            const selectedCount = list.filter((f) =>
              selectedIds.has(f.id),
            ).length;
            return (
              <details key={key} className={styles.region}>
                <summary className={`${styles.summary} cp-focusable`}>
                  <span className={styles.summaryTitle}>{label}</span>
                  <span className={styles.summaryMeta}>
                    {selectedCount > 0 && (
                      <Badge variant="info" size="sm">
                        {selectedCount} selected
                      </Badge>
                    )}
                    <span className={styles.count}>{list.length}</span>
                  </span>
                </summary>
                <ul className={styles.list} role="group">
                  {list.map(renderRow)}
                </ul>
              </details>
            );
          })}
        </>
      )}
    </div>
  );
}
