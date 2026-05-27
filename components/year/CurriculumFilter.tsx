"use client";

// CurriculumFilter — "Select the curriculum" multi-select popover.
//
// A <Button> trigger labeled "Select the curriculum (N)" opens a portal
// popover with an All/None header and a per-subject checklist.
//
// ── Shared state with the left filter panel (m5 fix, 2026-05-25 audit) ────
// The popover and the shell's left-filter-panel SUBJECT chips are two
// surfaces onto the SAME filter: `useAppState().filters.subjects`. CLAUDE.md
// §1 ("Filter everywhere. Each UI surface has one clear job") forbids two
// parallel filters of the same data with independent state. Both surfaces
// now read from and write to the planner-wide `filters.subjects` array:
//
//   filters.subjects = []              → "show all" (no filter applied)
//   filters.subjects = [SubjectId...]  → only those subjects visible
//
// The popover's UI model still uses a Set<SubjectId> of selected items and
// a derived `subjectFilter` (null = show all). The hook bridges between
// the two representations: an empty `filters.subjects` array maps to a Set
// of all 8 subject ids (so "All" reads as checked in the popover) and a
// `subjectFilter` of null (so the views skip filtering). Conversely, when
// the popover writes a full set of 8, the hook normalizes it back to an
// empty array in shared state — keeping the canonical "no filter" shape
// consistent across both surfaces.
//
// Usage:
//   import { CurriculumFilter, useCurriculumFilter } from "./CurriculumFilter";
//
//   const { subjectFilter, selectedIds, setSelectedIds } = useCurriculumFilter();
//   <CurriculumFilter selectedIds={selectedIds} onChange={setSelectedIds} />
//   <RoadmapView subjectFilter={subjectFilter} />

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button, Tooltip } from "@/components/ui";
import { SUBJECTS } from "@/lib/mock";
import { useAppState } from "@/lib/app-state";
import type { SubjectId } from "@/lib/types";
import styles from "./CurriculumFilter.module.css";

// ── Constants ─────────────────────────────────────────────────────────────

const ALL_IDS: SubjectId[] = SUBJECTS.map((s) => s.id as SubjectId);

// ── Hook ──────────────────────────────────────────────────────────────────

export interface CurriculumFilterState {
  /** null = all subjects shown (no filter). Set = only those subjects shown. */
  subjectFilter: Set<SubjectId> | null;
  /** The raw selected-id set (always has all 8 if subjectFilter is null). */
  selectedIds: Set<SubjectId>;
  setSelectedIds: (ids: Set<SubjectId>) => void;
}

/**
 * useCurriculumFilter — bridges the popover's Set<SubjectId> selection model
 * to the planner-wide `filters.subjects` array owned by useAppState().
 *
 * - Reads `filters.subjects`:
 *     `[]`   → selectedIds = all 8, subjectFilter = null  (show all)
 *     `[…]`  → selectedIds = those ids, subjectFilter = same set
 * - Writes back via `updateFilters({ subjects })`:
 *     A full 8-id set is stored as `[]` (canonical "no filter" shape).
 *     Any partial set is stored as a plain array of ids.
 *
 * The left filter panel (components/shell/left-filter-panel.tsx) and this
 * popover therefore stay in lockstep — toggling a subject in either surface
 * is visible in the other on the next render.
 */
export function useCurriculumFilter(): CurriculumFilterState {
  const { filters, updateFilters } = useAppState();

  // selectedIds derives from filters.subjects. Empty array = "show all" so we
  // present the popover as fully checked (matches the shell semantics).
  const selectedIds = useMemo<Set<SubjectId>>(
    () =>
      filters.subjects.length === 0
        ? new Set(ALL_IDS)
        : new Set(filters.subjects),
    [filters.subjects],
  );

  const setSelectedIds = useCallback(
    (next: Set<SubjectId>) => {
      // Normalize the "all selected" case back to the canonical empty array
      // so the left panel does not show all 8 chips as active when the user
      // intent is "no filter applied."
      const subjects: SubjectId[] =
        next.size === ALL_IDS.length ? [] : [...next];
      updateFilters({ subjects });
    },
    [updateFilters],
  );

  const subjectFilter =
    filters.subjects.length === 0 ? null : new Set(filters.subjects);

  return { subjectFilter, selectedIds, setSelectedIds };
}

// ── Popover position ──────────────────────────────────────────────────────

/** Compute the popover's position anchored below the trigger. */
function computePopoverPos(
  triggerRect: DOMRect,
  panelRect: DOMRect,
): { x: number; y: number } {
  const GAP = 6;
  const MARGIN = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let x = triggerRect.right - panelRect.width;
  let y = triggerRect.bottom + GAP;

  // Flip upward if not enough room below.
  if (y + panelRect.height > vh - MARGIN) {
    y = triggerRect.top - panelRect.height - GAP;
  }

  // Clamp horizontal so panel never bleeds off-screen.
  x = Math.max(MARGIN, Math.min(x, vw - panelRect.width - MARGIN));
  y = Math.max(MARGIN, y);

  return { x, y };
}

// ── Props ──────────────────────────────────────────────────────────────────

export interface CurriculumFilterProps {
  selectedIds: Set<SubjectId>;
  onChange: (next: Set<SubjectId>) => void;
}

// ── Component ─────────────────────────────────────────────────────────────

export function CurriculumFilter({
  selectedIds,
  onChange,
}: CurriculumFilterProps): ReactNode {
  const panelId = useId();
  // triggerRef wraps the <Button> so we can measure position without needing
  // Button to forward its ref.
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // Count: show total selected; if all are selected, "All" is implied.
  const selectedCount = selectedIds.size;
  const allSelected = selectedCount === ALL_IDS.length;
  const label = allSelected
    ? "Select the curriculum"
    : `Select the curriculum (${selectedCount})`;

  // ── Position the panel after it renders ─────────────────────────────
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const raf = requestAnimationFrame(() => {
      if (!triggerRef.current || !panelRef.current) return;
      const tRect = triggerRef.current.getBoundingClientRect();
      const pRect = panelRef.current.getBoundingClientRect();
      setPos(computePopoverPos(tRect, pRect));
    });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // ── Close on click-outside and Escape ───────────────────────────────
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        // Focus the button inside the wrapper on close.
        triggerRef.current?.querySelector("button")?.focus();
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const panel = panelRef.current;
      const trigger = triggerRef.current;
      if (!panel || !trigger) return;
      if (
        panel.contains(e.target as Node) ||
        trigger.contains(e.target as Node)
      )
        return;
      setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  // ── Toggle a single subject ──────────────────────────────────────────
  const toggleSubject = (id: SubjectId) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      // Never let the set become empty — keep at least one selected.
      if (next.size > 1) next.delete(id);
    } else {
      next.add(id);
    }
    onChange(next);
  };

  const selectAll = () => onChange(new Set(ALL_IDS));
  const selectNone = () => {
    // "None" selects only the first subject to avoid an empty set.
    onChange(new Set([ALL_IDS[0]]));
  };

  // ── Panel content ─────────────────────────────────────────────────────
  const panelStyle: CSSProperties = pos
    ? { left: pos.x, top: pos.y, opacity: 1 }
    : { left: -9999, top: -9999, opacity: 0 };

  const panel = (
    <div
      id={panelId}
      ref={panelRef}
      role="dialog"
      aria-label="Select curriculum subjects"
      title="Curriculum picker — check a subject to include it on the year roadmap, uncheck to hide that subject's row"
      className={[styles.panel, open && pos ? styles.panelVisible : ""]
        .filter(Boolean)
        .join(" ")}
      style={panelStyle}
    >
      {/* Header: quick actions */}
      <div className={styles.panelHeader}>
        <Tooltip
          content="Curriculum picker — check a subject to include it on the year roadmap, uncheck to hide that subject's row"
          side="bottom"
        >
          <span className={styles.panelTitle} tabIndex={0}>
            Curriculum
          </span>
        </Tooltip>
        <div className={styles.quickActions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={selectAll}
            aria-label="Select all subjects"
            tooltip="Show every subject on the year roadmap (resets any curriculum filter you've applied)"
          >
            All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={selectNone}
            aria-label="Clear subject selection"
            tooltip="Narrow the roadmap to a single subject — pick from the list below to focus on one curriculum lane at a time"
          >
            None
          </Button>
        </div>
      </div>

      {/* Checklist */}
      <ul role="listbox" aria-multiselectable="true" className={styles.list}>
        {SUBJECTS.map((subject) => {
          const id = subject.id as SubjectId;
          const checked = selectedIds.has(id);
          const checkId = `cf-${id}`;
          return (
            <li
              key={id}
              role="option"
              aria-selected={checked}
              className={styles.listItem}
            >
              <label htmlFor={checkId} className={styles.itemLabel}>
                {/* Subject monogram tile — cp-subj cascade provides color */}
                <span
                  className={`${styles.monogram} cp-subj ${id}`}
                  aria-hidden="true"
                >
                  {subject.icon}
                </span>

                <span className={styles.subjectName}>{subject.name}</span>

                <input
                  id={checkId}
                  type="checkbox"
                  className={styles.checkbox}
                  checked={checked}
                  onChange={() => toggleSubject(id)}
                  aria-label={`${checked ? "Deselect" : "Select"} ${subject.name}`}
                />
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <>
      {/* Wrapper span captures position for the popover anchor without
          requiring Button to forward its ref. Shrink-wraps the button. */}
      <div ref={triggerRef} style={{ display: "inline-flex" }}>
        <Button
          variant="secondary"
          size="md"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          tooltip="Choose which subjects appear on the year roadmap — uncheck a subject to hide its unit bar across the whole year view"
        >
          {label}
        </Button>
      </div>

      {open && typeof document !== "undefined"
        ? createPortal(panel, document.body)
        : null}
    </>
  );
}
