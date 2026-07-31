"use client";

// CatchUpModal — the v2 Catch-Up triage modal (Wave 10).
//
// A light, standalone overlay that RECOMPOSES the tested Catch-Up modules —
// it invents almost no data logic of its own:
//   • useCatchup()          — the transient action/notes overlay (lib/catchup-state).
//   • deriveCatchupItems / coverageSummary / groupItems / CATCHUP_STATUS_LABEL
//                             (lib/catchup-data) — the uncovered-item projection.
//   • usePlanner() mutators — setLessonStatus / relocateLesson / bumpLesson: the
//                             REAL store commits (not the mock's overlay-only
//                             writes). setLessonStatus persists (and NEVER forks
//                             — §2). relocateLesson / bumpLesson apply in-session
//                             and are undoable, but do NOT yet persist across a
//                             reload in Supabase mode: their persist tee lives in
//                             the moveLesson callback they bypass, so durable
//                             persistence is a Phase-1B item (pre-existing +
//                             app-wide — the weekly lesson card moves the same
//                             way). Completion NEVER forks (§2).
//   • planScope / standardGaps (lib/catchup-scope) — the six-chip scope plan +
//                             the standards-gap rows.
//   • resolveNow's todayColumnIndex (lib/now-anchor) + useSchoolWeek — the
//                             rotation-aware "today" column (never slice(0,4)).
//
// SINGLE-MODAL ARCHITECTURE (Codex W10 gate — dual-modal hazard). The modal is
// reachable from the /catch-up route AND the chrome Tools-dock, but exactly ONE
// may ever be open. That invariant is enforced by the modal-state singleton +
// a single elected renderer:
//   • CatchUpModalHost  — the ONLY public renderer (exported). It draws from the
//                         modal-state singleton and, via useIsCatchupHostRenderer,
//                         is elected the sole renderer even if several Hosts mount
//                         (route + chrome). Only the elected Host owns the window
//                         `catchup:toggle` listener → toggleCatchupModal(). The
//                         sibling drops <CatchUpModalHost/> into ChromeShell and
//                         dispatches the event from its dock button (that file owns
//                         the trigger — not this one).
//   • CatchUpModal      — the controlled body (open / onClose). INTERNAL, NOT
//                         exported: a second controlled mount elsewhere would
//                         reintroduce the hazard, so callers open via the singleton
//                         (openCatchupModal / toggleCatchupModal). The /catch-up
//                         route renders a Host + drives the singleton open state.
//
// Portal + focus-trap + scroll-lock + Escape + backdrop-click mechanics mirror
// components/year-v2/ExplorerShell (read there for the recipe); copied here so
// this file stays self-contained and does not import the year-v2 shell.

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { useAppState } from "@/lib/app-state";
import { useCatchup } from "@/lib/catchup-state";
import {
  coverageSummary,
  deriveCatchupItems,
  groupItems,
  CATCHUP_STATUS_LABEL,
  type CatchupItem,
} from "@/lib/catchup-data";
import {
  planScope,
  standardGaps,
  type CatchupScopeV2,
} from "@/lib/catchup-scope";
import { usePlanner, usePlannerDataState } from "@/lib/planner-store";
import { todayColumnIndex, todayIsInConfiguredYear } from "@/lib/now-anchor";
import { useSchoolWeek } from "@/lib/use-school-week";
import { useOrderedWeekdays } from "@/lib/week-order";
import { stripHtml } from "@/lib/html-text";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { PlannerEmpty, Tooltip } from "@/components/ui";
import {
  closeCatchupModal,
  toggleCatchupModal,
  useCatchupModalOpen,
  useIsCatchupHostRenderer,
  type CatchupCloseReason,
} from "./modal-state";
import styles from "./CatchUpModal.module.css";

/** Window event the Tools-dock dispatches to toggle the self-mounted modal. */
export const CATCHUP_MODAL_TOGGLE_EVENT = "catchup:toggle";

// ── Scope chips ──────────────────────────────────────────────────────────────

const SCOPE_CHIPS: ReadonlyArray<{
  id: CatchupScopeV2;
  label: string;
  tip: string;
}> = [
  {
    id: "everything",
    label: "Everything",
    tip: "Every uncovered lesson across the year, grouped by subject.",
  },
  {
    id: "today",
    label: "Today",
    tip: "Only lessons that were due today and didn't get taught.",
  },
  {
    id: "week",
    label: "This week",
    tip: "Everything left uncovered in the week you're planning.",
  },
  {
    id: "unit",
    label: "By unit",
    tip: "The same uncovered lessons, clustered by the unit they belong to.",
  },
  {
    id: "subject",
    label: "By subject",
    tip: "The same uncovered lessons, clustered by subject.",
  },
  {
    id: "standards",
    label: "Standards gaps",
    tip: "Standards no completed lesson has covered yet — what's at risk of being missed.",
  },
];

// ── Inline icons (stroke=currentColor so tokens drive color) ────────────────

function IconCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 13l4 4L19 7" />
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  );
}
function IconBump() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  );
}
function IconPlan() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}
function IconTeach() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  );
}
function IconClip() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 10.5 12.2 19.3a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 1 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.9-7.8" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

// ── Focus-trap query (mirrors ExplorerShell) ────────────────────────────────

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[contenteditable="true"]',
  "[tabindex]",
]
  .map((clause) => `${clause}:not([tabindex="-1"])`)
  .join(", ");

// ── Row ──────────────────────────────────────────────────────────────────────

/**
 * The row's TRIAGE line — the second meta row under the identity line.
 *
 * `deriveCatchupItems` computes when a lesson was due (`dayLabel`), how late it
 * is in CONFIGURED school days (`daysLate`), whether materials already exist
 * (`resources`), why it didn't happen (`reasonNotDone`) and whose copy it is
 * (`isPersonal` / `modified`) — and until now the modal rendered none of it, so
 * a teacher triaging a backlog could not tell a lesson missed yesterday from
 * one missed a month ago. The identity line (`.rowSub`) stays a single
 * ellipsised line; these facts get their own wrapping row instead of being
 * appended to it (appending would truncate, not wrap).
 *
 * Exported ONLY so it can be rendered in isolation by tests
 * (tests/catchup-row-meta.test.ts) — it is presentational, takes no context,
 * and is not part of the folder's public surface (index.ts does not re-export
 * it). The modal itself stays internal (single-modal invariant, see below).
 */
export function CatchUpRowMeta({ item }: { item: CatchupItem }): ReactNode {
  // Nothing when the lesson isn't late yet — "0 days late" is noise, and a
  // lesson due today or later this week is legitimately 0 — and nothing when
  // lateness is UNKNOWN (`null`: today outside the academic year, or a
  // non-school day). The two absences render identically on purpose: neither
  // one licenses printing a number, and an invented one is what this row used
  // to do. Explicit null check, not `> 0` — see lib/catchup-data.
  const late =
    item.daysLate !== null && item.daysLate > 0
      ? `${item.daysLate} ${item.daysLate === 1 ? "day" : "days"} late`
      : "";
  // Free teacher text — may be empty, and may carry markup if it was authored
  // in a rich-text field. Strip + trim before deciding whether it exists.
  const reason = stripHtml(item.reasonNotDone).trim();
  // One fork cue at most: "Modified" already implies a personal copy, so
  // showing both would spend a chip to say the same thing twice.
  const fork = item.modified ? "Modified" : item.isPersonal ? "Personal" : "";
  const resourceLabel = `${item.resources} ${
    item.resources === 1 ? "resource" : "resources"
  }`;

  return (
    <div className={styles.rowMeta}>
      <span className={styles.metaChip}>{item.dayLabel}</span>
      {late ? (
        <span className={`${styles.metaChip} ${styles.metaLate}`}>{late}</span>
      ) : null}
      {item.resources > 0 ? (
        // `resources` is a COUNT, not a list, so this is a clip + number (the
        // handoff's "📎 N"). Kept short on purpose: the action strip squeezes
        // this column to ~200px on desktop. The full phrase rides the
        // accessible name — and `title` so a touch user can long-press it.
        <span
          className={styles.metaChip}
          title={`${resourceLabel} attached to this lesson`}
          aria-label={`${resourceLabel} attached`}
        >
          <IconClip />
          {item.resources}
        </span>
      ) : null}
      {fork ? <span className={styles.metaChip}>{fork}</span> : null}
      {reason ? (
        <p className={styles.rowReason}>
          <span className={styles.reasonLabel}>Why not: </span>
          {reason}
        </p>
      ) : null}
    </div>
  );
}

interface RowActionsProps {
  onMarkTaught: () => void;
  onReschedule: () => void;
  onBump: () => void;
  onPlan: () => void;
  onTeach: () => void;
}

function LessonRow({
  item,
  cls,
  actions,
}: {
  item: CatchupItem;
  cls: string;
  actions: RowActionsProps;
}) {
  const title = stripHtml(item.title) || "Untitled lesson";
  const statusWord = CATCHUP_STATUS_LABEL[item.status];
  const standard = item.standards[0];
  const sub = [item.unit, standard, statusWord].filter(Boolean).join(" · ");

  const pills: ReadonlyArray<{
    key: string;
    label: string;
    tip: string;
    icon: ReactNode;
    onClick: () => void;
    done?: boolean;
  }> = [
    {
      key: "taught",
      label: "Mark taught",
      tip: "Mark this lesson taught — records real completion for the whole team (never creates a personal copy).",
      icon: <IconCheck />,
      onClick: actions.onMarkTaught,
      done: true,
    },
    {
      key: "reschedule",
      label: "Reschedule",
      tip: "Move this lesson forward to next week so it lands back on the calendar.",
      icon: <IconCalendar />,
      onClick: actions.onReschedule,
    },
    {
      key: "bump",
      label: "Bump",
      tip: "Push this lesson to the next open teaching slot for its subject.",
      icon: <IconBump />,
      onClick: actions.onBump,
    },
    {
      key: "plan",
      label: "Plan",
      tip: "Open this lesson in the Day planner to edit its plan.",
      icon: <IconPlan />,
      onClick: actions.onPlan,
    },
    {
      key: "teach",
      label: "Teach",
      tip: "Open this lesson on the projection board to teach it now.",
      icon: <IconTeach />,
      onClick: actions.onTeach,
    },
  ];

  return (
    <div
      className={`cp-subj ${cls} ${styles.row}`}
      data-planner-item={`lesson:${item.lessonId}`}
    >
      <div className={styles.rowMain}>
        <div className={styles.rowTitle}>{title}</div>
        <div className={styles.rowSub}>{sub}</div>
        <CatchUpRowMeta item={item} />
      </div>
      <div className={styles.rowActions}>
        {pills.map((p) => (
          <Tooltip
            key={p.key}
            content={p.tip}
            tooltipId={`cu-action-${p.key}`}
            side="top"
          >
            <button
              type="button"
              className={`${styles.action} ${p.done ? styles.actionDone : ""}`}
              onClick={p.onClick}
              aria-label={`${p.label}: ${title}`}
            >
              {p.icon}
              <span className={styles.actionLabel}>{p.label}</span>
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

// ── Controlled modal (INTERNAL — only the Host renders it) ───────────────────
//
// NOT exported: the single-modal invariant (Codex W10 gate) relies on the Host
// being the ONLY thing that mounts a modal. A second controlled mount elsewhere
// would reintroduce the dual-modal hazard, so callers open the modal through the
// modal-state singleton (openCatchupModal / toggleCatchupModal) + <CatchUpModalHost/>.

interface CatchUpModalProps {
  /** Whether the modal is open (controlled by the Host). */
  open: boolean;
  /** Close the modal. Defaults to a "dismiss" (✕/Esc/backdrop); Plan/Teach
   *  pass "navigated" so the route skips its /weekly fallback. */
  onClose: (reason?: CatchupCloseReason) => void;
}

/** The controlled Catch-Up modal. Renders nothing when `open` is false. */
function CatchUpModal({ open, onClose }: CatchUpModalProps): ReactNode {
  // Gate the hook-bearing body on `open` so effects (scroll-lock, listeners)
  // only run while mounted. The inner component owns every hook.
  if (!open) return null;
  return <CatchUpModalBody onClose={onClose} />;
}

function CatchUpModalBody({
  onClose,
}: {
  onClose: (reason?: CatchupCloseReason) => void;
}): ReactNode {
  const router = useRouter();
  const {
    lessons,
    subjectById,
    units,
    describeStandard,
    setLessonStatus,
    relocateLesson,
    bumpLesson,
  } = usePlanner();
  const dataState = usePlannerDataState();
  // `week` is the FOCUSED week — the eligibility horizon for what counts as
  // uncovered. `currentWeek` + `currentWeekBasis` are where NOW is, and are the
  // only legitimate input to a lateness claim: paging back to week 5 must not
  // make week 6 look like the future. See lib/catchup-data's CatchupToday.
  const { week, currentWeek, currentWeekBasis } = useAppState();
  const { actions } = useCatchup();
  const { days } = useSchoolWeek();
  // The SAME configured week as `days` above, paired with each day's display
  // labels and its position. Both are in scope here, so to be explicit about
  // which is which:
  //   • `days`       — raw Weekday tokens ("sun"…"sat"). todayColumnIndex maps
  //                    a real calendar date onto this to find TODAY's column.
  //   • `schoolWeek` — the same days as ordered COLUMNS, carrying `.index` and
  //                    `.label`.
  // A lesson's `day` (and `todayCol`) is a POSITION in that order — 0 is the
  // school's first instructional day, not Sunday — so it indexes `schoolWeek`,
  // never a Sun-first weekday array. See lib/catchup-data's `day` field doc.
  const schoolWeek = useOrderedWeekdays();

  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const [scope, setScope] = useState<CatchupScopeV2>("everything");

  // SSR-safe today column: null on the first render (matches the server), then
  // resolved post-mount from the injected clock + CONFIGURED school week. The
  // default scope ("everything") never reads it, so there is no hydration tear.
  const [todayCol, setTodayCol] = useState<number | null>(null);
  useEffect(() => {
    setTodayCol(todayColumnIndex(new Date(), days));
  }, [days]);

  // Mount gate — the portal appears only after the first client paint, so the
  // route-open case (this modal SSR'd open) never mismatches hydration.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ── Derived data ──────────────────────────────────────────────────────────

  // The lateness anchor. It is null — and every row then shows no lateness at
  // all — in three real cases, each of which would otherwise produce a
  // confident wrong number:
  //   • before the first paint, while `todayCol` is still unresolved;
  //   • on a non-school day, where today has no column in the school week;
  //   • when `currentWeekBasis` is a CLAMP rather than a derivation — today
  //     outside the configured academic year. That is not hypothetical: a
  //     school whose year starts in August is in `before-start` right now, and
  //     measuring lateness against the clamped Week 1 would report the whole
  //     plan as late before term begins.
  const today = useMemo(
    () =>
      todayCol !== null && todayIsInConfiguredYear(currentWeekBasis)
        ? { week: currentWeek, day: todayCol }
        : null,
    [todayCol, currentWeek, currentWeekBasis],
  );

  const allItems = useMemo(
    () =>
      deriveCatchupItems(lessons, {
        currentWeek: week,
        schoolWeek,
        units,
        today,
        actions,
      }),
    [lessons, week, schoolWeek, units, today, actions],
  );
  const coverage = useMemo(
    () => coverageSummary(lessons, { currentWeek: week, actions }),
    [lessons, week, actions],
  );
  const plan = useMemo(
    () => planScope(scope, allItems, week, todayCol),
    [scope, allItems, week, todayCol],
  );
  const groups = useMemo(() => groupItems(plan.items, plan.groupBy), [plan]);
  const gaps = useMemo(
    () =>
      scope === "standards"
        ? standardGaps(lessons, week, describeStandard)
        : [],
    [scope, lessons, week, describeStandard],
  );

  // ── Row action handlers ─────────────────────────────────────────────────
  const rowActions = useCallback(
    (item: CatchupItem): RowActionsProps => ({
      // The REAL mark-taught: setLessonStatus commits + persists and NEVER
      // forks (CLAUDE.md §2). The item then drops from deriveCatchupItems.
      onMarkTaught: () => setLessonStatus(item.lessonId, "done"),
      // Reschedule → move forward one week (keepOriginal false). Undoable and
      // applied in-session; the lesson leaves the uncovered list (now a future
      // week). Durable cross-reload persistence is Phase-1B (see file header).
      onReschedule: () =>
        relocateLesson(item.lessonId, { week: week + 1 }, false),
      // Bump → next open instructional slot for the subject (school-week aware);
      // in-session + undoable, same Phase-1B persistence caveat as Reschedule.
      onBump: () => bumpLesson(item.lessonId),
      // Plan/Teach navigate to a specific destination — close with reason
      // "navigated" so the /catch-up route does NOT also fire its dismiss
      // fallback to /weekly and stomp the requested destination (Codex W10 R2).
      onPlan: () => {
        router.push(`/daily?lesson=${item.lessonId}`);
        onClose("navigated");
      },
      onTeach: () => {
        router.push(`/teach?lesson=${item.lessonId}`);
        onClose("navigated");
      },
    }),
    [setLessonStatus, relocateLesson, bumpLesson, week, router, onClose],
  );

  // ── Modal lifecycle: focus in, restore on close, lock body scroll ─────────
  // Refcounted — this modal is mounted app-wide by ChromeShell, so it can
  // overlap anything and be closed in any order (lib/use-body-scroll-lock).
  useBodyScrollLock();

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    let cancelled = false;
    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        if (cancelled) return;
        const panel = panelRef.current;
        if (!panel || panel.contains(document.activeElement)) return;
        panel.querySelector<HTMLElement>("[data-cu-close]")?.focus();
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === "function" && document.contains(prev)) {
        prev.focus();
      }
    };
  }, []);

  // ── Escape closes (window bubble phase, defaultPrevented-aware) ───────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ── Focus trap — Tab / Shift-Tab cycle inside the panel ───────────────────
  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>): void => {
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [],
  );

  if (!mounted || typeof document === "undefined") return null;

  const isGaps = plan.mode === "gaps";
  const showEmpty = isGaps ? gaps.length === 0 : plan.items.length === 0;

  return createPortal(
    <div
      className={`${styles.scrim} cu-scrim`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        title="Catch-Up — every uncovered lesson, ready to triage"
        className={`${styles.modal} cu-modal`}
        onKeyDown={handleKeyDown}
      >
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className={styles.head}>
          <div className={styles.headText}>
            <div className={styles.titleWrap}>
              <span id={titleId} className={styles.title}>
                Catch-Up
              </span>
              {dataState === "settled" && (
                <span
                  className={styles.badge}
                  aria-label={`${allItems.length} uncovered`}
                >
                  {allItems.length}
                </span>
              )}
            </div>
            <div className={styles.subline}>
              {dataState === "pending"
                ? "Checking your plan…"
                : dataState === "error"
                  ? "Couldn’t load your plan."
                  : `${coverage.covered} of ${coverage.total} covered`}
            </div>
          </div>
          <button
            type="button"
            data-cu-close
            className={styles.close}
            onClick={() => onClose()}
            aria-label="Close Catch-Up"
          >
            <IconClose />
          </button>
        </div>

        {/* ── Scope chips ───────────────────────────────────────────────── */}
        <div className={styles.scopes} role="group" aria-label="Scope">
          {SCOPE_CHIPS.map((c) => {
            const active = scope === c.id;
            return (
              <Tooltip
                key={c.id}
                content={c.tip}
                tooltipId={`cu-scope-${c.id}`}
                side="bottom"
              >
                <button
                  type="button"
                  className={`${styles.chip} ${active ? styles.chipOn : ""}`}
                  aria-pressed={active}
                  onClick={() => setScope(c.id)}
                >
                  {c.label}
                </button>
              </Tooltip>
            );
          })}
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className={styles.body}>
          {showEmpty ? (
            <PlannerEmpty size="sm" heading="All caught up for this scope 🎉" />
          ) : isGaps ? (
            gaps.map((g, i) => {
              const subj = g.subject ? subjectById[g.subject] : null;
              return (
                <div
                  key={`${g.code}-${i}`}
                  className={`${subj ? `cp-subj ${subj.cls}` : ""} ${styles.gapRow}`}
                >
                  <span className={styles.gapCode}>{g.code}</span>
                  <span className={styles.gapText}>
                    {subj ? <b>{subj.name}</b> : null}
                    {subj ? " · " : ""}
                    {g.desc}
                    {g.unit ? ` (${g.unit})` : ""}
                  </span>
                </div>
              );
            })
          ) : (
            groups.map((group) => {
              const subj = group.subject ? subjectById[group.subject] : null;
              return (
                <section key={group.key} className={styles.group}>
                  <header
                    className={`${subj ? `cp-subj ${subj.cls}` : ""} ${styles.groupHead}`}
                  >
                    {subj ? (
                      <span
                        className={styles.groupStripe}
                        style={{ background: "var(--c)" }}
                        aria-hidden="true"
                      />
                    ) : null}
                    <span className={styles.groupLabel}>{group.label}</span>
                    <span className={styles.groupCount}>
                      · {group.items.length} uncovered
                    </span>
                  </header>
                  {group.items.map((item) => {
                    const cls = subjectById[item.subject]?.cls ?? "";
                    return (
                      <LessonRow
                        key={item.lessonId}
                        item={item}
                        cls={cls}
                        actions={rowActions(item)}
                      />
                    );
                  })}
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.querySelector(".cp-root") ?? document.body,
  );
}

// ── Self-mounting host (dock trigger + route) ────────────────────────────────

/**
 * The ONE renderer of the Catch-Up modal. Drop this into ChromeShell (for the
 * Tools-dock) and/or the /catch-up route; it draws from the modal-state
 * singleton so no matter how many Hosts are mounted, exactly ONE modal is on
 * screen (Codex W10 gate — dual-modal hazard).
 *
 * Election: `useIsCatchupHostRenderer()` resolves true for exactly one mounted
 * Host; the rest render nothing. Only the elected renderer attaches the window
 * `catchup:toggle` listener, so a single dispatch flips the shared state ONCE
 * (two listeners would double-toggle to a no-op). Open/close flow entirely
 * through the singleton (`toggleCatchupModal` / `closeCatchupModal`); the route
 * drives open + navigation separately by watching `useCatchupModalOpen()`.
 *
 * PROVIDER NESTING (required): the rendered modal body calls usePlanner /
 * useCatchup / useAppState / useSchoolWeek, so EVERY mount of this Host must sit
 * INSIDE the (planner) providers (app/(planner)/layout.tsx nests all four). The
 * /catch-up route already does. When the sibling wires the Tools-dock Host into
 * ChromeShell, that mount point must also be inside those providers (their Low #4).
 */
export function CatchUpModalHost(): ReactNode {
  const isRenderer = useIsCatchupHostRenderer();
  const open = useCatchupModalOpen();

  useEffect(() => {
    // Only the elected renderer owns the toggle listener — exactly-once per event.
    if (!isRenderer) return;
    const onToggle = (): void => toggleCatchupModal();
    window.addEventListener(CATCHUP_MODAL_TOGGLE_EVENT, onToggle);
    return () =>
      window.removeEventListener(CATCHUP_MODAL_TOGGLE_EVENT, onToggle);
  }, [isRenderer]);

  if (!isRenderer) return null;
  return <CatchUpModal open={open} onClose={closeCatchupModal} />;
}
