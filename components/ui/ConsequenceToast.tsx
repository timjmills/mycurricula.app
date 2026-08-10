"use client";

// ConsequenceToast — generic bottom-of-screen toast for any team-scoped
// action that the teacher needs to know affected EVERYONE on the team.
// Visual + motion contract lifted from
// components/lesson-card/archive-toast.tsx (per Unified Audit B8) — that
// remains the lesson-archive-specific consumer; this primitive is the
// generic surface every other team-scoped commit fires through.
//
// Lead the message with the team-wide effect ("Holiday added — every
// teacher's planner now skips Eid al-Fitr.") so the teacher sees the
// blast radius, not just the action. Optional Undo when reversible.
//
// Auto-dismiss after DISMISS_MS (5s). prefers-reduced-motion collapses
// the slide animation to a plain opacity fade. Single toast at a time —
// the provider replaces the previous one when a new commit fires.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./Button";

const DISMISS_MS = 5000;

export interface ConsequenceToastProps {
  /** Human-readable message. Lead with the team-wide effect. */
  message: string;
  /** Optional undo callback. When omitted, no Undo button renders. */
  onUndo?: () => void;
  /** Fired after the exit animation has run. The provider uses this to
   *  unmount the toast. */
  onDismiss: () => void;
}

export function ConsequenceToast({
  message,
  onUndo,
  onDismiss,
}: ConsequenceToastProps) {
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const handleDismiss = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    setVisible(false);
    const exitDuration = reducedMotion ? 150 : 260;
    setTimeout(onDismiss, exitDuration);
  }, [onDismiss, reducedMotion]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    dismissTimerRef.current = setTimeout(handleDismiss, DISMISS_MS);
    return () => {
      cancelAnimationFrame(frame);
      if (dismissTimerRef.current !== null) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, [handleDismiss]);

  const handleUndo = useCallback(() => {
    if (onUndo) onUndo();
    handleDismiss();
  }, [onUndo, handleDismiss]);

  const slideTransform = reducedMotion
    ? "none"
    : visible
      ? "translateY(0)"
      : "translateY(20px)";
  const opacity = visible ? 1 : 0;
  const transition = reducedMotion
    ? "opacity 150ms ease"
    : "opacity 220ms ease, transform 240ms cubic-bezier(0.22, 1, 0.36, 1)";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="consequence-toast"
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: `translateX(-50%) ${slideTransform}`,
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 8px 0 16px",
        minHeight: 48,
        // ── THE CASCADE HOOKS — why these colours are wrapped in var() ──────
        // Same conversion 4e0d90f applied to ChromeClock's subject dot, for
        // the same reason: an inline `style` declaration outranks EVERY
        // author stylesheet rule short of `!important`, so no frame/theme arm
        // could ever reach this toast. This primitive is the shared-toast
        // floor every team-scoped commit fires through, so it was locking out
        // the cascade app-wide.
        //
        // The value is `var(--ctoast-…, <what it already was>)`. A custom
        // property is a DIFFERENT property from the one declared inline, so a
        // stylesheet can now set it, while the fallback keeps the painted
        // colour byte-identical wherever it is unset. Nothing sets them
        // today. The toast has no stable class, so it carries the unstyled
        // global `consequence-toast` handle below for a selector to hang on.
        background: "var(--ctoast-bg, var(--ink-900))",
        color: "var(--ctoast-ink, var(--paper))",
        borderRadius: 10,
        boxShadow: "var(--shadow-popover)",
        fontSize: 13,
        fontWeight: 400,
        opacity,
        transition,
        pointerEvents: visible ? "auto" : "none",
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
        {message}
      </span>

      {onUndo && (
        <Button
          variant="ghost"
          size="md"
          onClick={handleUndo}
          tooltip="Undo this change — reverts the team-wide effect while this toast is visible"
          // The hairline was a literal `rgba(255,255,255,0.22)` — a real bug,
          // not just a lockout. This slab INVERTS with tone (background
          // --ink-900 / text --paper), so in dark tone it is a near-WHITE
          // panel and a 22% white hairline is invisible on it. --toast-
          // invert-hairline (tokens.css, beside --on-solid) derives the same
          // 22% from --paper — the toast's own ink — so it follows the
          // surface, and is byte-identical in light tone where --paper IS
          // #ffffff. The two colour props also gain hooks, per the note on
          // the container above.
          style={{
            border: "1px solid var(--ctoast-undo-border, var(--toast-invert-hairline))",
            color: "var(--ctoast-undo-ink, var(--paper))",
            letterSpacing: 0.2,
            flexShrink: 0,
          }}
        >
          Undo
        </Button>
      )}

      <Button
        variant="icon"
        size="md"
        iconAriaLabel="Dismiss notification"
        onClick={handleDismiss}
        tooltip="Dismiss this notification now (the change still applies)"
        style={{
          color: "var(--ctoast-close-ink, var(--ink-400))",
          flexShrink: 0,
        }}
      >
        ×
      </Button>
    </div>
  );
}
