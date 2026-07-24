"use client";

// ExplorerShell.tsx — the reusable modal chrome behind the two Explorer modes.
//
// Extracted from UnitExplorer (Wave 7) so the Unit Planner and the Lesson
// Planner (components/lesson-plan-v2/PlanPage) render the SAME dialog: scrim,
// subject-gradient header band, optional stat strip, arrow-navigable ARIA
// tablist, body slot, footer slot, and the Unit | Lesson mode switch.
//
// THEMING: the root carries the GLOBAL `ue-modal` class and the scrim
// `ue-scrim` — both enrolled in app/themes.css §5 (the surface-theming
// contract), so the active theme's accent wash reaches them above the z-90
// theme tint. Those two class names are load-bearing: renaming them silently
// drops the wash. Subject color arrives through the `cp-subj <subject.cls>`
// cascade on the root (var(--c) / --cl / --cd), never a hex.
//
// PORTAL: into `.cp-root` (fallback document.body) — the planner-v2 atoms
// (FinishPill / StatusDot / ForkCues) and the ui/Button primitive rely on the
// `.cp-root button` resets + font cascade; a raw-body portal would strip them.
// The §5 wash is a descendant selector under :root[data-theme], so it matches
// either host.
//
// MECHANICS: role="dialog" aria-modal; scrim-click + ✕ + Escape all close;
// focus moves into the dialog on open and restores to the invoker on close;
// Tab is trapped inside the panel; the tablist is arrow-key navigable; the
// body scrolls internally within max-height 92vh.
//
// MODE SWITCH + `animateIn`: switching Unit ⇄ Lesson swaps which component
// owns the shell, so React remounts it. The open animation would then replay
// as a scrim fade-from-transparent — a flash of the page behind the dialog.
// Callers pass `animateIn={false}` for any mount that is a mode switch rather
// than a real open. (React runs every destroy effect before any create effect
// in a commit, so the outgoing shell's focus-restore + scroll-unlock land
// before the incoming shell re-captures them; the net state is correct.)

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { Subject } from "@/lib/types";
import { SubjGlyph } from "@/components/planner-v2";
import { Tooltip } from "@/components/ui";
import styles from "./ExplorerShell.module.css";

// ── Types ──────────────────────────────────────────────────────────────────

/** The Explorer's two modes: the unit roll-up, or one lesson's plan. */
export type ExplorerMode = "unit" | "lesson";

/** How the shell presents: a centered modal dialog, or the full-bleed workspace. */
export type ExplorerPresentation = "modal" | "full";

export interface ExplorerShellTab<K extends string = string> {
  key: K;
  label: string;
}

export interface ExplorerShellProps<K extends string = string> {
  /** Drives the whole visual identity: gradient, glyph, `--c` accent cascade. */
  subject: Subject;
  /** Header title node (a heading line, or the lesson picker `<select>`). */
  title: ReactNode;
  /** Secondary header line under the title. */
  subtitle?: ReactNode;
  /** Right cluster of the header band, left of the ✕ (a ring, a status tag). */
  headerRight?: ReactNode;
  /** Optional band of real stats between the header and the tablist. */
  statStrip?: ReactNode;
  tabs: ReadonlyArray<ExplorerShellTab<K>>;
  activeTab: K;
  onTabChange: (key: K) => void;
  /** aria-label for the tablist ("Unit details" / "Lesson plan"). */
  tablistLabel: string;
  /** `title=` on the dialog root — the touch long-press explanation. */
  dialogTitle: string;
  /** aria-label on the ✕ button. */
  closeLabel: string;
  /**
   * When set, the dialog is named by this string instead of by its title node.
   * Use it whenever `title` is a form control (a `<select>` is a poor accname
   * source for the dialog itself).
   */
  dialogAriaLabel?: string;
  body: ReactNode;
  footer?: ReactNode;
  /** Renders the Unit Planner | Lesson Planner switch when BOTH are supplied. */
  mode?: ExplorerMode;
  onModeChange?: (mode: ExplorerMode) => void;
  /** False on a mode-switch remount — suppresses the open animation. */
  animateIn?: boolean;
  /**
   * How the shell presents. "modal" (default) is the centered frosted dialog;
   * "full" is the full-bleed workspace surface. Changing this on the SAME
   * mounted shell must never remount it (a remount would replay the focus grab,
   * scroll lock, and entry animation) — it only swaps a class. No caller passes
   * it yet; B1.4 wires the ⤢ expand toggle.
   */
  presentation?: ExplorerPresentation;
  /**
   * When false, a scrim click does NOT close the dialog. Default true — the
   * current behavior. The full-bleed workspace opts out so an accidental
   * background click can't discard an editing session. No caller passes it yet.
   */
  closeOnScrimClick?: boolean;
  /**
   * Optional left-rail slot rendered beside the body (the workspace's unit /
   * lesson navigator). Absent — every caller today — renders the body exactly as
   * before, with no wrapping element. No caller passes it yet; B1.4 fills it
   * with the UnitWorkspaceRail. Its focusable controls join the shell's existing
   * focus trap automatically (the trap query already spans the whole panel).
   */
  rail?: ReactNode;
  onClose: () => void;
}

// ── Focus trap ─────────────────────────────────────────────────────────────

// All keyboard-reachable elements inside the panel — the focus-trap query.
//
// Every clause excludes `[tabindex="-1"]`, which LessonModal's otherwise-identical
// query applies only to its `[tabindex]` clause. That matters HERE because this
// modal's tablist uses ROVING tabindex: the inactive tabs are enabled,
// non-disabled <button>s that Tab cannot reach. Without the exclusion they'd
// match `button:not([disabled])`, so the trap's first/last boundary could land on
// an unreachable tab and Shift+Tab from the first element would wrap to a dead
// stop. Disabled form controls are excluded for the same reason (unfocusable).
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

// ── Component ──────────────────────────────────────────────────────────────

export function ExplorerShell<K extends string = string>({
  subject,
  title,
  subtitle,
  headerRight,
  statStrip,
  tabs,
  activeTab,
  onTabChange,
  tablistLabel,
  dialogTitle,
  closeLabel,
  dialogAriaLabel,
  body,
  footer,
  mode,
  onModeChange,
  animateIn = true,
  presentation = "modal",
  closeOnScrimClick = true,
  rail,
  onClose,
}: ExplorerShellProps<K>): ReactNode {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // ── Modal lifecycle: focus in on open, restore on close, lock body scroll ──
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    // Focus the close button on open — the safe default (never a control that
    // starts an edit). Double-rAF lets the portal subtree paint first.
    let cancelled = false;
    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        if (cancelled) return;
        const panel = panelRef.current;
        if (!panel || panel.contains(document.activeElement)) return;
        panel.querySelector<HTMLElement>("[data-ue-close]")?.focus();
      });
    });

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
      document.body.style.overflow = prevOverflow;
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

  // ── Tablist arrow-key roving (WAI-ARIA tablist) ───────────────────────────
  const onTabKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>): void => {
      const idx = tabs.findIndex((t) => t.key === activeTab);
      let next = idx;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = idx + 1;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = idx - 1;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      else return;
      e.preventDefault();
      const wrapped = (next + tabs.length) % tabs.length;
      onTabChange(tabs[wrapped].key);
      // Move focus to the newly-selected tab so the roving pattern is complete.
      const panel = panelRef.current;
      panel
        ?.querySelector<HTMLElement>(`[data-ue-tab="${tabs[wrapped].key}"]`)
        ?.focus();
    },
    [tabs, activeTab, onTabChange],
  );

  if (typeof document === "undefined") return null;

  const showModeSwitch = mode !== undefined && onModeChange !== undefined;
  const isFull = presentation === "full";

  // One tabpanel serves every tab (only the active tab's body is mounted), so it
  // is named by the ACTIVE tab's id — the canonical single-panel WAI-ARIA tabs
  // relationship — rather than a free-text aria-label a screen reader can't tie
  // back to a tab (Codex W7 gate). Factored out so the with-rail and no-rail
  // branches below render the SAME element, byte-for-byte, in the no-rail path.
  const bodyRegion = (
    <div
      className={styles.body}
      role="tabpanel"
      id="ue-tabpanel"
      aria-labelledby={`ue-tab-${activeTab}`}
    >
      {body}
    </div>
  );

  return createPortal(
    <div
      className={`${styles.scrim} ue-scrim ${isFull ? styles.scrimFull : ""} ${
        animateIn ? "" : styles.noAnim
      }`}
      onClick={(e) => {
        // Scrim click closes — but only a click that both starts and lands on
        // the scrim itself (never a click that bubbled up from the panel), and
        // only when the caller allows it (the workspace opts out via
        // closeOnScrimClick={false} so a stray click can't discard an edit).
        if (closeOnScrimClick && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        {...(dialogAriaLabel
          ? { "aria-label": dialogAriaLabel }
          : { "aria-labelledby": titleId })}
        title={dialogTitle}
        className={`${styles.modal} ue-modal cp-subj ${subject.cls} ${
          isFull ? styles.full : ""
        } ${animateIn ? "" : styles.noAnim}`}
        onKeyDown={handleKeyDown}
      >
        {/* ── Mode switch — Unit Planner | Lesson Planner ─────────────────── */}
        {showModeSwitch && (
          <div
            className={styles.modeSwitch}
            role="group"
            aria-label="Explorer mode"
          >
            {(
              [
                {
                  value: "unit" as const,
                  label: "Unit Planner",
                  tip: "See the whole unit — its lessons, standards, resources and progress.",
                },
                {
                  value: "lesson" as const,
                  label: "Lesson Planner",
                  tip: "Plan one lesson in depth — objective, flow, standards, differentiation.",
                },
              ] as const
            ).map((opt) => (
              <Tooltip
                key={opt.value}
                content={opt.tip}
                tooltipId={`ue-mode-${opt.value}`}
                side="bottom"
              >
                <button
                  type="button"
                  data-ue-mode={opt.value}
                  aria-pressed={mode === opt.value}
                  className={`${styles.modeBtn} ${
                    mode === opt.value ? styles.modeBtnOn : ""
                  }`}
                  onClick={() => onModeChange(opt.value)}
                >
                  {opt.label}
                </button>
              </Tooltip>
            ))}
          </div>
        )}

        {/* ── Header — subject gradient ──────────────────────────────────── */}
        <div className={styles.head}>
          <SubjGlyph subject={subject} size={40} radius={13} />
          <div className={styles.htext}>
            <div id={titleId} className={styles.htitle}>
              {title}
            </div>
            {subtitle ? <div className={styles.hsub}>{subtitle}</div> : null}
          </div>
          {headerRight}
          <button
            type="button"
            data-ue-close
            className={styles.close}
            onClick={onClose}
            aria-label={closeLabel}
          >
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
          </button>
        </div>

        {/* ── Stat strip (real values only) ──────────────────────────────── */}
        {statStrip ? <div className={styles.statStrip}>{statStrip}</div> : null}

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <div
          className={styles.tabs}
          role="tablist"
          aria-label={tablistLabel}
          onKeyDown={onTabKeyDown}
        >
          {tabs.map(({ key, label }) => {
            const active = key === activeTab;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                data-ue-tab={key}
                id={`ue-tab-${key}`}
                aria-selected={active}
                aria-controls="ue-tabpanel"
                tabIndex={active ? 0 : -1}
                className={`${styles.tab} ${active ? styles.tabActive : ""}`}
                onClick={() => onTabChange(key)}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Body (with optional left rail) ─────────────────────────────── */}
        {/* No rail — every caller today — renders `bodyRegion` alone, exactly as
            before. A rail (B1.4) wraps the rail + the SAME bodyRegion in a row so
            the workspace navigator sits beside the tab content. */}
        {rail ? (
          <div className={styles.railLayout}>
            <div className={styles.rail}>{rail}</div>
            {bodyRegion}
          </div>
        ) : (
          bodyRegion
        )}

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        {footer ? <div className={styles.foot}>{footer}</div> : null}
      </div>
    </div>,
    document.querySelector(".cp-root") ?? document.body,
  );
}
