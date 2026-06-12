"use client";

// UndoToast — the global "safety without friction" toast (6.12.26 UX
// roadmap item 02). One toast, bottom-center, white surface; a single
// text line plus an optional "Undo" text button.
//
// Behavior contract (per the roadmap spec):
//   • Auto-dismisses after DISMISS_MS (6s). The timer PAUSES while the
//     pointer hovers the toast or focus is inside it, and resumes with
//     the remaining time when it leaves.
//   • Only one toast is visible at a time — the provider
//     (lib/undo-toast.tsx) replaces the previous toast on a new action
//     (last-in wins; no stacking).
//   • ⌘Z / Ctrl+Z while the toast is live triggers its undo — handled by
//     the provider so it can pre-empt the top-bar's global undo handler.
//   • prefers-reduced-motion: fades without sliding.
//
// Lifecycle discipline (§4a review M1/M2/L1): dismissal is one-way and
// idempotent — once the exit starts, `onExitStart` fires exactly once
// (the provider uses it to retire the toast from ⌘Z eligibility), no
// timer can re-arm, and the deferred exit `setTimeout` is cleared on
// unmount so a stray callback can never reach the provider after a
// replacement toast has mounted.
//
// This intentionally does NOT replace components/ui/ConsequenceToast —
// that primitive announces team-wide blast radius (dark, settings
// commits); this one offers a way back from personal planner gestures.

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./UndoToast.module.css";

const DISMISS_MS = 6000;

export interface UndoToastProps {
  /** Single-line, human message. Sticky-note brief ("Moved to Tuesday"). */
  message: string;
  /** Undo callback. When omitted the toast is confirmation-only
   *  (e.g. "Link copied") and renders no Undo button. */
  onUndo?: () => void;
  /** Fired synchronously when the exit begins (auto-dismiss, Undo click,
   *  or programmatic dismiss) — BEFORE the exit animation. The provider
   *  uses this to stop routing ⌘Z to this toast immediately. */
  onExitStart?: () => void;
  /** Fired after the exit animation so the provider can unmount. */
  onDismiss: () => void;
}

export function UndoToast({
  message,
  onUndo,
  onExitStart,
  onDismiss,
}: UndoToastProps) {
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Pausable dismiss timer: track the deadline as "remaining ms" so
  // hover/focus can stop the clock and resume where it left off. All
  // mutable timer state lives in refs so the callbacks stay stable and
  // the mount effect never re-runs (a media-query flip must not re-arm
  // a paused timer — review L1).
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(DISMISS_MS);
  const startedAtRef = useRef(0);
  const pausedRef = useRef(false);
  const dismissingRef = useRef(false);
  const reducedMotionRef = useRef(false);
  // Hover and keyboard-focus are tracked INDEPENDENTLY (FIX 3): the timer may
  // only re-arm when BOTH are false. Otherwise a pointer leaving while the
  // Undo button still has focus would re-arm and auto-dismiss the toast out
  // from under the keyboard user — stealing focus mid-interaction.
  const hoverRef = useRef(false);
  const focusRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    reducedMotionRef.current = mq.matches;
    const handler = (e: MediaQueryListEvent) => {
      setReducedMotion(e.matches);
      reducedMotionRef.current = e.matches;
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Latest callbacks behind refs — handleDismiss stays stable forever.
  const onExitStartRef = useRef(onExitStart);
  onExitStartRef.current = onExitStart;
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const onUndoRef = useRef(onUndo);
  onUndoRef.current = onUndo;

  /** One-way, idempotent. Starts the exit animation and schedules the
   *  provider unmount callback. */
  const handleDismiss = useCallback(() => {
    if (dismissingRef.current) return;
    dismissingRef.current = true;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onExitStartRef.current?.();
    setVisible(false);
    const exitDuration = reducedMotionRef.current ? 150 : 260;
    exitTimerRef.current = setTimeout(
      () => onDismissRef.current(),
      exitDuration,
    );
  }, []);

  const armTimer = useCallback(() => {
    if (dismissingRef.current) return;
    pausedRef.current = false;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(handleDismiss, remainingRef.current);
  }, [handleDismiss]);

  const pauseTimer = useCallback(() => {
    if (dismissingRef.current || timerRef.current === null) return;
    pausedRef.current = true;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    remainingRef.current = Math.max(
      1000, // resume with at least a second so a graze never insta-kills it
      remainingRef.current - (Date.now() - startedAtRef.current),
    );
  }, []);

  // Re-arm ONLY when neither the pointer is over the toast nor focus is inside
  // it (FIX 3). A pointer-leave while the Undo button still holds focus must
  // keep the toast alive — re-arming there would dismiss it mid-keyboard-use.
  const maybeRearm = useCallback(() => {
    if (hoverRef.current || focusRef.current) return;
    armTimer();
  }, [armTimer]);

  const handlePointerEnter = useCallback(() => {
    hoverRef.current = true;
    pauseTimer();
  }, [pauseTimer]);

  const handlePointerLeave = useCallback(() => {
    hoverRef.current = false;
    maybeRearm();
  }, [maybeRearm]);

  // focusin/focusout bubble, so a single handler on the root tracks focus
  // ANYWHERE inside the toast (message span or the Undo button) — true
  // focus-within semantics without a CSS-only :focus-within (which can't
  // gate a JS timer).
  const handleFocusIn = useCallback(() => {
    focusRef.current = true;
    pauseTimer();
  }, [pauseTimer]);

  const handleFocusOut = useCallback(() => {
    focusRef.current = false;
    maybeRearm();
  }, [maybeRearm]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    armTimer();
    return () => {
      cancelAnimationFrame(frame);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      // A pending exit callback must die with the component — left alive
      // it would tell the provider to clear whatever toast REPLACED this
      // one (review M1).
      if (exitTimerRef.current !== null) clearTimeout(exitTimerRef.current);
    };
  }, [armTimer]);

  const handleUndo = useCallback(() => {
    if (dismissingRef.current) return; // exit already started — too late
    onUndoRef.current?.();
    handleDismiss();
  }, [handleDismiss]);

  // Horizontal centering is constant; vertical slide is the only animated
  // axis. Under reduced motion we append NOTHING after translateX(-50%) — a
  // bare "none" suffix would yield the invalid `translateX(-50%) none` and the
  // browser would drop the whole transform, un-centering / clipping the toast.
  const slideY = reducedMotion ? "" : visible ? "translateY(0)" : "translateY(20px)";
  const transform = `translateX(-50%)${slideY ? ` ${slideY}` : ""}`;
  const transition = reducedMotion
    ? "opacity 150ms ease"
    : "opacity 220ms ease, transform 240ms cubic-bezier(0.22, 1, 0.36, 1)";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={styles.toast}
      style={{
        transform,
        opacity: visible ? 1 : 0,
        transition,
        pointerEvents: visible ? "auto" : "none",
      }}
      // Hover and focus are tracked separately; the timer re-arms only when
      // BOTH are clear (FIX 3). React's onFocus/onBlur bubble (focusin/
      // focusout), so they fire for focus entering/leaving the message span
      // or the Undo button — true focus-within without losing the JS timer
      // gate. A focus hop between two children fires onBlur then onFocus
      // synchronously, so the brief maybeRearm is immediately re-paused.
      onMouseEnter={handlePointerEnter}
      onMouseLeave={handlePointerLeave}
      onFocus={handleFocusIn}
      onBlur={handleFocusOut}
    >
      <span className={styles.message}>{message}</span>
      {onUndo && (
        <button type="button" className={styles.undoBtn} onClick={handleUndo}>
          Undo
        </button>
      )}
    </div>
  );
}
