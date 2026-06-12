"use client";

// StandardsPicker.tsx — the standards menu: browse the worldwide framework
// catalog, pin preferred systems to the top, search by code/name, narrow by
// subject and grade, and tag the host record (lesson today; units when the
// model gains a standards field) with selected codes.
//
// ── Data ───────────────────────────────────────────────────────────────────
// • Framework catalog: lib/standards/catalog.ts over frameworks-catalog.json
//   (174 frameworks incl. all US states; same JSON seeds Supabase `standards_frameworks`).
// • Taggable items: lib/standards/items.ts (CCSS ELA/Math, the 8 CCSS
//   Mathematical Practices, NGSS grade-5 PEs, IB ATL categories). Frameworks
//   without bundled items stay browsable/pinnable with a "no items yet" note
//   — choosing which system to use is itself a job this menu serves.
// • Pins: lib/standards/pinned.ts (localStorage; teacher_ui_state later).
//
// ── Pattern ────────────────────────────────────────────────────────────────
// Modal dialog per the AddLessonForm/ResourceComposer recipe: role="dialog"
// + aria-modal, Esc close, Tab focus trap, search auto-focused. Tokens only;
// ≥44px touch targets; reduced motion respected in the CSS module.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { Subject, SubjectId } from "@/lib/types";
import {
  COMMERCIAL_USE_LABELS,
  REGION_LABELS,
  filterFrameworks,
  filterItems,
  type FrameworkCatalogEntry,
} from "@/lib/standards/catalog";
import { STANDARD_ITEMS, availableGrades } from "@/lib/standards/items";
import { usePinnedFrameworks } from "@/lib/standards/pinned";
import { Badge, Button, Tooltip } from "@/components/ui";
import styles from "./standards-picker.module.css";

// ── Props ──────────────────────────────────────────────────────────────────

export interface StandardsPickerProps {
  open: boolean;
  onClose: () => void;
  /** Codes currently tagged on the host record. */
  value: readonly string[];
  /** Called with the FULL replacement code list on save. */
  onSave: (codes: string[]) => void;
  /** Subject filter pre-selection (e.g. the lesson's subject). Clearable. */
  defaultSubject?: SubjectId | null;
  /** The grade's subjects, for the filter chip row (planner catalog). */
  subjects: readonly Subject[];
  /** Accessible name for what is being tagged ("this lesson"). */
  targetLabel?: string;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Badge variant for the framework's licence status — warn on anything a
 *  commercial deployment must clear first. */
function licenceVariant(
  use: FrameworkCatalogEntry["commercial_use"],
): "success" | "warn" | "neutral" {
  if (use === "open" || use === "open_attribution") return "success";
  if (use === "non_commercial" || use === "permission_required") return "warn";
  return "neutral";
}

// ── Component ──────────────────────────────────────────────────────────────

export function StandardsPicker({
  open,
  onClose,
  value,
  onSave,
  defaultSubject = null,
  subjects,
  targetLabel = "this lesson",
}: StandardsPickerProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);

  const { pinned, isPinned, togglePin } = usePinnedFrameworks();

  // Filters + selection. Selection preserves tag order: existing codes keep
  // their order, newly checked codes append.
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState<SubjectId | null>(defaultSubject);
  const [grade, setGrade] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([...value]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // Frameworks the teacher explicitly collapsed WHILE a search query is
  // active (search auto-expands matching frameworks; this set overrides the
  // auto-expand so the collapse control stays functional — review M-3).
  const [searchCollapsed, setSearchCollapsed] = useState<ReadonlySet<string>>(
    new Set(),
  );

  // Re-arm state each time the dialog opens for a (possibly different) host.
  useEffect(() => {
    if (open) {
      setQuery("");
      setSubject(defaultSubject);
      setGrade(null);
      setSelected([...value]);
      setExpanded(new Set());
      setSearchCollapsed(new Set());
      // Restore focus to the trigger when the dialog closes (review L-2).
      const trigger =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      return () => trigger?.focus();
    }
    return undefined;
    // `value`/`defaultSubject` are read once per open — listing `open` alone
    // is deliberate so mid-edit parent rerenders don't reset the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // A new search starts with a clean collapse-override slate.
  useEffect(() => {
    setSearchCollapsed(new Set());
  }, [query]);

  const filter = useMemo(
    () => ({ query, subject, grade }),
    [query, subject, grade],
  );

  const { pinned: pinnedFws, rest } = useMemo(
    () => filterFrameworks(filter, pinned),
    [filter, pinned],
  );

  // Group the unpinned remainder by region (first-appearance order). The
  // catalog JSON is NOT region-contiguous, so aggregate with a Map rather
  // than by adjacency — adjacency runs produce duplicate sibling groups and
  // duplicate React keys (review H-2).
  const restGroups = useMemo(() => {
    const byRegion = new Map<string, FrameworkCatalogEntry[]>();
    for (const fw of rest) {
      const label = REGION_LABELS[fw.region];
      const group = byRegion.get(label);
      if (group) group.push(fw);
      else byRegion.set(label, [fw]);
    }
    return Array.from(byRegion, ([region, frameworks]) => ({
      region,
      frameworks,
    }));
  }, [rest]);

  // While searching, auto-expand any framework whose ITEMS match — otherwise
  // a code search would look like a dead end. Explicit collapses during a
  // search are honored via `searchCollapsed` (review M-3).
  const searching = query.trim().length > 0;
  const isExpanded = useCallback(
    (fw: FrameworkCatalogEntry): boolean => {
      if (searching) {
        if (searchCollapsed.has(fw.short_code)) {
          return expanded.has(fw.short_code);
        }
        return (
          expanded.has(fw.short_code) ||
          filterItems(fw.short_code, filter).length > 0
        );
      }
      return expanded.has(fw.short_code);
    },
    [expanded, searching, searchCollapsed, filter],
  );

  // Toggle against the EFFECTIVE expanded state, not the raw set — during a
  // search, collapsing an auto-expanded framework records a collapse override
  // instead of silently no-op'ing (review M-3).
  const toggleExpanded = useCallback(
    (fw: FrameworkCatalogEntry) => {
      const code = fw.short_code;
      const effective = isExpanded(fw);
      if (effective) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(code);
          return next;
        });
        if (searching) {
          setSearchCollapsed((prev) => new Set(prev).add(code));
        }
      } else {
        setExpanded((prev) => new Set(prev).add(code));
        setSearchCollapsed((prev) => {
          if (!prev.has(code)) return prev;
          const next = new Set(prev);
          next.delete(code);
          return next;
        });
      }
    },
    [isExpanded, searching],
  );

  const toggleCode = useCallback((code: string) => {
    setSelected((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }, []);

  // Esc to close + Tab focus trap (AddLessonForm recipe).
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const els = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        );
        if (els.length === 0) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose],
  );

  if (!open) return null;

  const grades = availableGrades();

  // One framework row (+ its expanded item list).
  function renderFramework(fw: FrameworkCatalogEntry): ReactNode {
    const items = filterItems(fw.short_code, filter);
    const hasBundle = Boolean(STANDARD_ITEMS[fw.short_code]);
    const expandedNow = isExpanded(fw);
    const pinnedNow = isPinned(fw.short_code);
    const selectedCount = (STANDARD_ITEMS[fw.short_code] ?? []).filter((it) =>
      selected.includes(it.code),
    ).length;

    return (
      <li key={fw.short_code} className={styles.fwItem}>
        <div className={styles.fwRow}>
          <Tooltip
            content={
              pinnedNow
                ? `Unpin ${fw.short_code} — it moves back into the full catalog list`
                : `Pin ${fw.short_code} to the top — your preferred systems always appear first`
            }
            side="top"
            tooltipId="standards-picker-pin"
          >
            <button
              type="button"
              className={`${styles.pinBtn} ${pinnedNow ? styles.pinned : ""}`}
              aria-pressed={pinnedNow}
              aria-label={`${pinnedNow ? "Unpin" : "Pin"} ${fw.name}`}
              onClick={() => togglePin(fw.short_code)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 3l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.3 6.8 19l1-5.8L3.5 9.2l5.9-.8L12 3z"
                  fill={pinnedNow ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </Tooltip>

          <button
            type="button"
            className={styles.fwMain}
            aria-expanded={expandedNow}
            onClick={() => toggleExpanded(fw)}
          >
            <span className={styles.fwName}>
              {fw.name}
              {selectedCount > 0 && (
                <span className={styles.fwCount}>{selectedCount}</span>
              )}
            </span>
            <span className={styles.fwMeta}>
              {fw.short_code}
              {fw.authority ? ` · ${fw.authority}` : ""}
              {fw.grade_range ? ` · ${fw.grade_range}` : ""}
            </span>
          </button>

          <span className={styles.fwSide}>
            <Badge variant={licenceVariant(fw.commercial_use)} size="sm">
              {COMMERCIAL_USE_LABELS[fw.commercial_use]}
            </Badge>
            <span
              className={`${styles.chevron} ${expandedNow ? styles.chevronOpen : ""}`}
              aria-hidden="true"
            >
              ›
            </span>
          </span>
        </div>

        {expandedNow && (
          <div className={styles.fwBody}>
            {hasBundle ? (
              items.length > 0 ? (
                <ul className={styles.itemList}>
                  {items.map((it) => {
                    const checked = selected.includes(it.code);
                    return (
                      <li key={it.code}>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          className={`${styles.itemRow} ${checked ? styles.itemChecked : ""}`}
                          onClick={() => toggleCode(it.code)}
                        >
                          <span
                            className={styles.check}
                            data-checked={checked}
                            aria-hidden="true"
                          />
                          <span className={styles.itemCode}>{it.code}</span>
                          <span className={styles.itemDesc}>
                            {it.description}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className={styles.note}>
                  No items match the current search/filters.
                </p>
              )
            ) : (
              <p className={styles.note}>
                Catalog entry — no taggable items bundled yet.
                {fw.catalog_notes ? ` ${fw.catalog_notes}` : ""}
              </p>
            )}
            {fw.licence_notes && (
              <p className={styles.licenceNote}>{fw.licence_notes}</p>
            )}
          </div>
        )}
      </li>
    );
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Tag standards for ${targetLabel}`}
        className={styles.dialog}
        // Focusable container: clicks on non-interactive dialog area keep
        // focus (and the Esc handler) inside the dialog (review L-1).
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        title="Browse standards frameworks, pin your preferred systems to the top, and check the standards this lesson covers"
      >
        {/* ── Header: title + search ───────────────────────────────────── */}
        <div className={styles.header}>
          <h2 className={styles.title}>Tag standards</h2>
          <input
            type="search"
            className={styles.search}
            placeholder="Search frameworks or codes (e.g. 5-PS1, MP3, fractions)…"
            aria-label="Search standards frameworks and codes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        {/* ── Filters: subject chips + grade select ───────────────────── */}
        <div className={styles.filters}>
          <div
            className={styles.subjectChips}
            role="group"
            aria-label="Filter by subject"
          >
            <button
              type="button"
              className={`${styles.subjChip} ${subject === null ? styles.subjChipActive : ""}`}
              aria-pressed={subject === null}
              onClick={() => setSubject(null)}
            >
              All subjects
            </button>
            {subjects.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`cp-subj ${s.cls} ${styles.subjChip} ${subject === s.id ? styles.subjChipActive : ""}`}
                aria-pressed={subject === s.id}
                onClick={() => setSubject(subject === s.id ? null : s.id)}
              >
                <span className={styles.subjDot} aria-hidden="true" />
                {s.name}
              </button>
            ))}
          </div>
          <label className={styles.gradeWrap}>
            <span className={styles.gradeLabel}>Grade</span>
            <select
              className={styles.gradeSelect}
              value={grade ?? ""}
              onChange={(e) => setGrade(e.target.value || null)}
              aria-label="Filter standards by grade"
            >
              <option value="">All grades</option>
              {grades.map((g) => (
                <option key={g} value={g}>
                  {g === "K" ? "Kindergarten" : `Grade ${g}`}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* ── Framework list: pinned first, then by region ─────────────── */}
        <div className={styles.list}>
          {/* Tagged codes from outside the bundled sets (school-specific /
              DB frameworks) — surfaced so they can be UNtagged here instead
              of being invisible and immortal (review L-8). */}
          {(() => {
            const known = new Set(
              Object.values(STANDARD_ITEMS).flatMap((items) =>
                items.map((it) => it.code),
              ),
            );
            const other = selected.filter((c) => !known.has(c));
            if (other.length === 0) return null;
            return (
              <>
                <h3 className={styles.groupLabel}>Tagged (other frameworks)</h3>
                <ul className={styles.itemList}>
                  {other.map((code) => (
                    <li key={code}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked
                        className={`${styles.itemRow} ${styles.itemChecked}`}
                        onClick={() => toggleCode(code)}
                      >
                        <span
                          className={styles.check}
                          data-checked
                          aria-hidden="true"
                        />
                        <span className={styles.itemCode}>{code}</span>
                        <span className={styles.itemDesc}>
                          Not in a bundled set — uncheck to remove the tag.
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            );
          })()}
          {pinnedFws.length > 0 && (
            <>
              <h3 className={styles.groupLabel}>Pinned</h3>
              <ul className={styles.fwList}>
                {pinnedFws.map(renderFramework)}
              </ul>
            </>
          )}
          {restGroups.map((g) => (
            <div key={g.region}>
              <h3 className={styles.groupLabel}>{g.region}</h3>
              <ul className={styles.fwList}>
                {g.frameworks.map(renderFramework)}
              </ul>
            </div>
          ))}
          {pinnedFws.length === 0 && restGroups.length === 0 && (
            <p className={styles.note}>
              Nothing matches — try clearing the subject or grade filter.
            </p>
          )}
        </div>

        {/* ── Footer: tally + actions ──────────────────────────────────── */}
        <div className={styles.footer}>
          <span className={styles.tally} aria-live="polite">
            {selected.length === 1
              ? "1 standard selected"
              : `${selected.length} standards selected`}
          </span>
          <span className={styles.actions}>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                // No-op guard: an unchanged selection must not dispatch an
                // edit (spurious undo step + persist round-trip, review L-3).
                const unchanged =
                  selected.length === value.length &&
                  selected.every((c, i) => c === value[i]);
                if (!unchanged) onSave(selected);
                onClose();
              }}
            >
              Save standards
            </Button>
          </span>
        </div>
      </div>
    </div>
  );
}
