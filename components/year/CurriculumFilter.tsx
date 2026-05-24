"use client";

// CurriculumFilter — "Select the curriculum" multi-select popover.
//
// A <Button> trigger labeled "Select the curriculum (N)" opens a portal
// popover with an All/None header and a per-subject checklist. Selection
// persists to localStorage. SSR-safe: defaults to all-selected on the
// server and on the first client render; post-mount effect hydrates from
// storage.
//
// Usage:
//   import { CurriculumFilter, useCurriculumFilter } from "./CurriculumFilter";
//
//   // In the parent component:
//   const { subjectFilter } = useCurriculumFilter();
//   ...
//   <CurriculumFilter />
//   <RoadmapView subjectFilter={subjectFilter} />
//
// The hook must be called in the same component tree as <CurriculumFilter>
// (or a parent). Both read from the same module-level state via a shared
// React state lifted into a custom hook. Because Next.js client components
// re-render together, a single useState at module level isn't correct —
// instead, expose a context-like pattern via a hook that the host component
// wires together. For this co-located use case (YearView calls both), the
// hook and component share state by having the parent own the state and
// pass it down. See the export shape below.

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useId,
  type ReactNode,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui";
import { SUBJECTS } from "@/lib/mock";
import type { SubjectId } from "@/lib/types";
import styles from "./CurriculumFilter.module.css";

// ── Storage ───────────────────────────────────────────────────────────────

const STORAGE_KEY = "mycurriculum:year-curriculum-filter";

const ALL_IDS: SubjectId[] = SUBJECTS.map((s) => s.id as SubjectId);

/** Load persisted selection. Returns null (all-selected) if nothing stored. */
function loadSelection(): Set<SubjectId> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const ids = parsed.filter(
      (v): v is SubjectId =>
        typeof v === "string" && ALL_IDS.includes(v as SubjectId),
    );
    // If all subjects are stored, treat as null (show-all) to avoid
    // persisting a trivially full set.
    if (ids.length === ALL_IDS.length) return null;
    return new Set(ids);
  } catch {
    return null;
  }
}

/** Persist selection, or clear if null (means show-all). */
function saveSelection(set: Set<SubjectId> | null): void {
  if (typeof window === "undefined") return;
  try {
    if (set === null) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
    }
  } catch {
    // Non-fatal.
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────

export interface CurriculumFilterState {
  /** null = all subjects shown (no filter). Set = only those subjects shown. */
  subjectFilter: Set<SubjectId> | null;
  /** The raw selected-id set (always has all 8 if subjectFilter is null). */
  selectedIds: Set<SubjectId>;
  setSelectedIds: (ids: Set<SubjectId>) => void;
  /** Hydration is complete (safe to read localStorage-backed state). */
  hydrated: boolean;
}

/**
 * useCurriculumFilter — owns the filter state for the YearView curriculum
 * selector. Call once in YearView; pass `subjectFilter` to the sub-views.
 *
 * Returns null for subjectFilter when all subjects are selected (so callers
 * can skip filtering entirely for the all-selected case).
 */
export function useCurriculumFilter(): CurriculumFilterState {
  // SSR-safe: start with all selected so the server HTML matches the first
  // client render.
  const [selectedIds, setSelectedIdsRaw] = useState<Set<SubjectId>>(
    () => new Set(ALL_IDS),
  );
  const [hydrated, setHydrated] = useState(false);
  const hydratedRef = useRef(false);

  // Post-mount: hydrate from localStorage.
  useEffect(() => {
    const stored = loadSelection();
    if (stored !== null) setSelectedIdsRaw(stored);
    hydratedRef.current = true;
    setHydrated(true);
  }, []);

  const setSelectedIds = useCallback((next: Set<SubjectId>) => {
    setSelectedIdsRaw(next);
    if (hydratedRef.current) {
      // Store null when all are selected (keeps localStorage clean).
      saveSelection(next.size === ALL_IDS.length ? null : next);
    }
  }, []);

  // Derive the filter: null when all selected, Set otherwise.
  const allSelected = selectedIds.size === ALL_IDS.length;
  const subjectFilter = allSelected ? null : new Set(selectedIds);

  return { subjectFilter, selectedIds, setSelectedIds, hydrated };
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
      className={[styles.panel, open && pos ? styles.panelVisible : ""]
        .filter(Boolean)
        .join(" ")}
      style={panelStyle}
    >
      {/* Header: quick actions */}
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>Curriculum</span>
        <div className={styles.quickActions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={selectAll}
            aria-label="Select all subjects"
          >
            All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={selectNone}
            aria-label="Clear subject selection"
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
