"use client";

// atoms.tsx — the shared visual atoms for the v2 planner frames (the three Day
// frames DayA/B/C and the Week frames WeekA/WeekC). Ported from the design
// bundle's views-shared.jsx (SubjGlyph / StatusDot) plus the repo's three-tier
// forking cue vocabulary (WeekEditBoard's moved-arrow + "Modified" Badge), so
// every frame speaks the same fork language (CLAUDE.md §2). Subject color
// arrives through the `.cp-subj.<cls>` cascade (var(--c)/--cl/--cd) — never a
// hard-coded hue.
//
// Lifted from components/day-v2/atoms.tsx in Wave 5 so the Week frames reuse the
// exact same atoms (the day-v2 module now re-exports these). Components ONLY
// live here (the hook + constants are in ./util) — the Fast-Refresh contract:
// mixing component and non-component exports crashes dev hot edits.

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Badge, Tooltip } from "@/components/ui";
import type { Lesson, Subject } from "@/lib/types";
import type { DayStatus } from "@/lib/day-status";
import { STATUS_WORD } from "./util";
import styles from "./atoms.module.css";

/**
 * The keyboard/AT selection control for a lesson row — a REAL <button> wrapping
 * only the title text (M2, Codex R2). This is why the row container itself is a
 * plain div with a redundant pointer-convenience onClick, NOT a role="button":
 * a role="button" that contains focusable descendants (the Plan/Teach/Finish
 * buttons, the moved-arrow cue) is invalid AT nesting. Native Enter/Space on
 * this button drives selection; the title's typography lives on the inner
 * <span> so the `.cp-root button` reset (which forces font-size:inherit) can't
 * flatten it.
 */
export function SelectTitle({
  selected,
  onSelect,
  titleClassName,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  /** The frame's title-typography class, applied to the inner span. */
  titleClassName: string;
  children: ReactNode;
}): ReactNode {
  return (
    <button
      type="button"
      className={styles.selectTitle}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className={titleClassName}>{children}</span>
    </button>
  );
}

/** The status→dot-color class on atoms.module.css. */
const DOT_CLASS: Record<DayStatus, string> = {
  done: styles.dotDone,
  now: styles.dotNow,
  upcoming: styles.dotUpcoming,
  idle: styles.dotIdle,
};

/** First-letter monogram for a subject glyph (subject.name is the full name). */
function monogram(subject: Subject): string {
  return (subject.name.trim()[0] ?? subject.cls[0] ?? "?").toUpperCase();
}

/** Rounded subject tile with the subject's monogram. The `cp-subj` class pulls
 *  the subject color into `var(--c)` for the tile background. */
export function SubjGlyph({
  subject,
  size = 34,
  radius = 11,
}: {
  subject: Subject;
  size?: number;
  radius?: number;
}): ReactNode {
  return (
    <span
      className={`cp-subj ${subject.cls} ${styles.subjGlyph}`}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        fontSize: Math.round(size * 0.42),
      }}
      aria-hidden="true"
    >
      {monogram(subject)}
    </span>
  );
}

/** Small status dot (rail / agenda), colored per derived day-status. */
export function StatusDot({ status }: { status: DayStatus }): ReactNode {
  return (
    <span
      className={`${styles.statusDot} ${DOT_CLASS[status]}`}
      aria-hidden="true"
    />
  );
}

/**
 * Three-tier forking cue for a lesson — the moved arrow (↔ within week, ⤴
 * across weeks) and the "Modified" pill — reusing the exact WeekEditBoard
 * vocabulary + tooltip copy. Renders nothing for an unedited-from-Master
 * lesson. The dashed subject stripe (the third tier) is a per-frame modifier
 * class on the row/item stripe, applied at each callsite.
 */
export function ForkCues({ lesson }: { lesson: Lesson }): ReactNode {
  if (!lesson.moved && !lesson.modified) return null;
  return (
    <span className={styles.forkCues}>
      {lesson.moved && (
        <Tooltip
          content={
            lesson.moved === "across-weeks"
              ? "Moved across weeks in your personal copy — the Team Curriculum version stays in its original slot."
              : "Moved within the week in your personal copy — the Team Curriculum version stays in its original slot."
          }
          side="top"
        >
          <span
            className={styles.movedArrow}
            aria-label={
              lesson.moved === "across-weeks"
                ? "Moved across weeks"
                : "Moved within the week"
            }
            tabIndex={0}
          >
            {lesson.moved === "across-weeks" ? "⤴" : "↔"}
          </span>
        </Tooltip>
      )}
      {lesson.modified && (
        <Tooltip content="Personally modified from the Team Curriculum." side="top">
          <Badge variant="warn" size="sm">
            Modified
          </Badge>
        </Tooltip>
      )}
    </span>
  );
}

/**
 * Completion pill — three visual states (bundle B:5953-5957), shared by all
 * three frames (DayA rows, DayB focus card, DayC hero footer):
 *   • done      → check + "Done" on the done tint
 *   • now       → pulsing dot + "Finish"  (only when isToday, since `status`
 *                 is already gated — off-today it can never be "now")
 *   • otherwise → colored dot + status word ("Up next" / "Planned")
 * Click toggles setLessonStatus(id, done ? "not_done" : "done"); completion is
 * store-owned and NEVER forks.
 */
export function FinishPill({
  status,
  isDone,
  onToggle,
  className,
}: {
  status: DayStatus;
  isDone: boolean;
  onToggle: () => void;
  className?: string;
}): ReactNode {
  return (
    <Tooltip
      content={
        isDone ? "Mark this lesson as not finished" : "Mark this lesson finished"
      }
      side="top"
    >
      <button
        type="button"
        className={`${styles.vaFinish} ${isDone ? styles.vaFinishOn : ""} ${
          className ?? ""
        }`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-pressed={isDone}
      >
        {isDone ? (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12l5 5L20 6" />
            </svg>
            Done
          </>
        ) : status === "now" ? (
          <>
            <span className={`${styles.vaFdot} ${styles.vaFdotNow}`} />
            Finish
          </>
        ) : (
          <>
            <span
              className={styles.vaFdot}
              style={{
                background:
                  status === "upcoming" ? "var(--honey-500)" : "var(--c)",
              }}
            />
            {STATUS_WORD[status]}
          </>
        )}
      </button>
    </Tooltip>
  );
}

/**
 * The unified "add to this day" affordance — a frame-styled trigger that opens
 * the SAME small create menu in every frame (M4): "New lesson" → onQuickAdd,
 * "Non-instructional event" → onAddEvent (row omitted when null). "Assign
 * existing" is deferred (no dead row). Respects quickAdding (disable + busy)
 * and surfaces quickAddError inline.
 */
export function AddLessonMenu({
  triggerClassName,
  triggerContent,
  tooltipId,
  tooltipContent,
  align = "center",
  wrapperClassName,
  onQuickAdd,
  onAddEvent,
  quickAdding,
  quickAddError,
}: {
  triggerClassName: string;
  triggerContent: ReactNode;
  tooltipId: string;
  tooltipContent: string;
  /**
   * PREFERRED edge of the trigger to hang from. This is now a preference, not a
   * guarantee: the menu is placed against the VIEWPORT and clamped, so an
   * `align` that would push it off-screen is overridden rather than obeyed.
   *
   * It used to be the whole mechanism, and that is what broke. Callsites chose
   * `start`/`end` by COLUMN INDEX — "only the two extreme columns overhang" —
   * which is true at 1440px on a 5-day week and false everywhere else. At 950px
   * the last column's menu was measured 90px past the track and 37px off the
   * viewport, because `end` pins to the last COLUMN's edge and that edge is
   * itself outside the visible box once the track scrolls. On a 6- or 7-day
   * school week (which CLAUDE.md forbids assuming away) the same thing happens
   * at ordinary desktop widths. No index-keyed rule can fix that, because the
   * index does not know where the viewport ends.
   */
  align?: "center" | "start" | "end";
  wrapperClassName?: string;
  onQuickAdd: () => void;
  onAddEvent?: (() => void) | null;
  quickAdding: boolean;
  quickAddError: string | null;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The menu's DOM id, for `aria-controls`. NOT the `tooltipId` prop — that one
  // is the tooltip DISMISSAL key and is deliberately SHARED across a surface's
  // triggers (dismiss "the add tip" once, not once per day). `useId()` is
  // per-instance, which is what a DOM id must be.
  const menuId = useId();
  // `null` means "not placed yet" — the menu renders invisible for one frame so
  // its real width can be measured, then paints at the clamped position. It is
  // never shown at an unplaced position, so there is no visible jump.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  /**
   * Place the menu against the VIEWPORT, not against the trigger's container.
   *
   * This is the whole fix. The menu used to be an absolutely-positioned child
   * of `.addWrap`, so every ancestor with a non-visible `overflow` could clip
   * it — and in the week track, one always does. Portaled to <body> and fixed,
   * it has no ancestors left to be clipped by, and the clamp below is computed
   * from real geometry rather than from a column index.
   */
  const place = useCallback(() => {
    const t = triggerRef.current?.getBoundingClientRect();
    if (!t) return;
    const m = menuRef.current?.getBoundingClientRect();
    const w = m?.width || 300;
    const h = m?.height || 0;
    const GAP = 8; // breathing room from the trigger AND from the screen edge

    // `align` picks the PREFERRED anchor…
    let left =
      align === "start"
        ? t.left
        : align === "end"
          ? t.right - w
          : t.left + t.width / 2 - w / 2;
    // …and the clamp overrules it. A menu wider than the viewport pins to the
    // left edge rather than centring itself half off each side.
    left = Math.max(GAP, Math.min(left, Math.max(GAP, window.innerWidth - w - GAP)));

    // Prefer above the trigger (the add row sits at the bottom of a column);
    // flip below only when there is genuinely no room, then clamp.
    let top = t.top - h - GAP;
    if (top < GAP) {
      top = t.bottom + GAP;
      top = Math.min(top, Math.max(GAP, window.innerHeight - h - GAP));
    }
    setPos({ left, top });
  }, [align]);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    place();
    // A FIXED element does not travel with a scrolling ancestor, so it has to be
    // re-placed as the page moves. Capture phase: the week track scrolls
    // internally, and a non-capturing window listener never hears that.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  // Escape closes, and focus returns to the trigger. Portaling moves the menu
  // out of the trigger's DOM subtree, so without this a keyboard user who
  // opened it would have no way back and no way out.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Outside press closes. The only other ways out are Escape and the menu's own
  // `onMouseLeave`, and BOTH are pointer- or keyboard-only: a touch device
  // fires no `mouseleave` and carries no Esc key, so on a phone an opened menu
  // could previously only be dismissed by picking one of its rows. That was
  // survivable while the Week frames were the only callsites, because those
  // surfaces do not render below 900px at all. It stops being survivable now
  // that WeeklyList — the canvas every frame collapses to at ≤900px — carries
  // this menu, which puts it on the touch tiers for the first time.
  //
  // `pointerdown`, not `click`: it fires for mouse, touch and pen alike, and it
  // lands before the press can activate whatever is underneath. Capture phase,
  // so a descendant that stops propagation cannot strand the menu open. The
  // trigger is excluded or its own onClick toggle would re-open what this just
  // closed; focus is NOT forced back to the trigger here, because a deliberate
  // press elsewhere is the user choosing where to go next.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  // ── Keyboard: move focus INTO the portal on open ──────────────────────────
  // Portaling is what makes this necessary. The menu is a child of <body>, so
  // Tab from the trigger does not walk into it — it walks through whatever page
  // controls happen to sit between the two in DOM order. A keyboard-only
  // teacher could therefore open the add menu and never reach "New lesson".
  //
  // Same family as the missing outside-press exit: the control worked for a
  // mouse and stranded another input method, and `WeeklyList` is what makes it
  // matter, because at ≤900px this is the only add path there is.
  //
  // Keyed on `pos` rather than `open`: the menu renders `visibility: hidden`
  // for one frame while `place()` measures it, and focusing a hidden element is
  // both useless and (in some browsers) refused. `pos` becoming non-null is
  // exactly the moment it is painted.
  useEffect(() => {
    if (!open || !pos) return;
    const first = menuRef.current?.querySelector<HTMLButtonElement>(
      "button:not([disabled])",
    );
    first?.focus();
  }, [open, pos]);

  // Where focus goes on the way OUT, stated once for every exit:
  //   · Escape          → the trigger (handled above; a keyboard user must not
  //                       be dumped on <body> with no way back).
  //   · choosing a row  → the trigger (below). The menu unmounts under the
  //                       focused element, so without this focus falls to
  //                       <body> and the next Tab restarts from the top of the
  //                       document.
  //   · outside press   → NOT moved. The user has deliberately pressed
  //                       somewhere else; stealing focus back would fight them.
  //
  // Restoring on selection needs a SECOND attempt, and this is why. Choosing a
  // row calls `onQuickAdd`, which sets `quickAdding`, which puts `disabled` on
  // the trigger — and a disabled button cannot hold focus, so the browser
  // immediately blurs it to <body>. Focusing synchronously here is therefore
  // correct and insufficient: measured live, `document.activeElement` was
  // `body` after a selection. The `wantsFocusRef` latch below re-focuses once
  // the round-trip clears and the trigger is enabled again.
  const wantsFocusRef = useRef(false);
  const closeAndRestore = useCallback((): void => {
    setOpen(false);
    wantsFocusRef.current = true;
    triggerRef.current?.focus();
  }, []);

  // The second attempt: when the add settles, `quickAdding` goes false, the
  // trigger stops being disabled, and focus can finally land. Gated on the
  // latch so this never steals focus from wherever the teacher has moved on to
  // — it only fires for a selection this menu actually made.
  useEffect(() => {
    if (quickAdding || !wantsFocusRef.current) return;
    wantsFocusRef.current = false;
    triggerRef.current?.focus();
  }, [quickAdding]);

  const menu = (
    <div
      ref={menuRef}
      id={menuId}
      // `role="group"` + a label, NOT `role="menu"`. A `menu` obliges every
      // child to be a `menuitem` with arrow-key roving focus; these are two
      // ordinary buttons with their own accessible names, and claiming menu
      // semantics without implementing them is worse for a screen-reader user
      // than not claiming them. The trigger advertises `aria-haspopup="true"`
      // (generic popup) for the same reason.
      role="group"
      aria-label="Add to this day"
      className={styles.vaDayAddMenu}
      // Inline geometry, because it is computed per-open from the live rect —
      // there is no static rule that could express "wherever this trigger is
      // now, clamped to this viewport".
      style={{
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        visibility: pos ? "visible" : "hidden",
      }}
      onMouseLeave={() => setOpen(false)}
    >
          <button
            type="button"
            className={styles.addRowNew}
            onClick={() => {
              closeAndRestore();
              onQuickAdd();
            }}
            disabled={quickAdding}
          >
            <span className={styles.addIc} aria-hidden="true">
              +
            </span>
            <span className={styles.addTx}>
              <b>New lesson</b>
              <span>Create a fresh lesson for this day</span>
            </span>
          </button>
          {onAddEvent && (
            <button
              type="button"
              className={styles.addRowEvent}
              onClick={() => {
                closeAndRestore();
                onAddEvent();
              }}
            >
              <span className={styles.addIc} aria-hidden="true">
                ★
              </span>
              {/* The second line says what the form will say at submit, BEFORE
                  the teacher fills it in: the schedule store has no addBlock
                  action, so AddEventForm can only validate and then report
                  "Events can’t be saved yet" (AddEventForm.tsx:182-199,
                  :379-383). The row stays — the form is real and the wiring is
                  the Phase 1B editable-schedules item — but a menu row that
                  reads like every other create action is a promise. */}
              <span className={styles.addTx}>
                <b>Non-instructional event</b>
                <span>
                  Assembly, field trip, testing — not saved yet, coming with
                  editable schedules
                </span>
              </span>
            </button>
          )}
      {/* "Assign existing lesson" is deferred — no dead row (decision 5). */}
    </div>
  );

  return (
    <div className={`${styles.addWrap} ${wrapperClassName ?? ""}`}>
      <Tooltip content={tooltipContent} tooltipId={tooltipId} side="top">
        <button
          ref={triggerRef}
          type="button"
          className={triggerClassName}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="true"
          aria-controls={open ? menuId : undefined}
          aria-expanded={open}
          aria-busy={quickAdding}
          disabled={quickAdding}
        >
          {triggerContent}
        </button>
      </Tooltip>
      {/* Portaled to <body>: that is what puts the menu beyond the reach of
          every `overflow` between here and the document root. The `typeof
          document` guard keeps this SSR-safe — though in practice `open` is
          only ever true after a click, so the server never reaches it. */}
      {open && typeof document !== "undefined"
        ? createPortal(menu, document.body)
        : null}
      {quickAddError && (
        <p className={styles.vaError} role="alert">
          {quickAddError}
        </p>
      )}
    </div>
  );
}
