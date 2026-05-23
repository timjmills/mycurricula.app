"use client";

// archive-toast.tsx — a transient bottom-of-screen confirmation toast
// shown after archiving a lesson.
//
// Auto-dismisses after DISMISS_MS (5 seconds). The teacher can undo the
// archive within that window by clicking "Undo".
//
// If another archive fires while a toast is already visible, the new toast
// supersedes the old one (a fresh timer replaces the previous one). Calling
// code achieves this by unmounting the old instance and mounting a new one
// (changing the `key` prop on each archive action is sufficient).
//
// Motion: slides up from the bottom when mounted; slides down on dismiss.
// Under prefers-reduced-motion the enter/exit animation is omitted and the
// toast simply fades in/out instead (spec §2.4).

import { useCallback, useEffect, useRef, useState } from "react";

// ── Constants ─────────────────────────────────────────────────────────────
const DISMISS_MS = 5000;

// ── Props ─────────────────────────────────────────────────────────────────

export interface ArchiveToastProps {
  /** Human-readable lesson title (plain text) shown in the toast copy. */
  lessonTitle: string;
  /** Called when the teacher clicks "Undo" or the toast is still visible
   *  when the caller instructs a restore. Wire to unarchiveLesson(id). */
  onUndo: () => void;
  /** Called after the toast has fully dismissed (either auto or via undo). */
  onDismiss: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────

export function ArchiveToast({
  lessonTitle,
  onUndo,
  onDismiss,
}: ArchiveToastProps) {
  // visible: drives the CSS transition (slide-in → slide-out).
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Detect prefers-reduced-motion ────────────────────────────────────────
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // ── Slide in on mount; start dismiss timer ────────────────────────────────
  useEffect(() => {
    // RAF delay so the "visible=false" initial state has a chance to paint
    // before we flip to true (enables the enter animation).
    const frame = requestAnimationFrame(() => setVisible(true));

    dismissTimerRef.current = setTimeout(() => {
      handleDismiss();
    }, DISMISS_MS);

    return () => {
      cancelAnimationFrame(frame);
      if (dismissTimerRef.current !== null) {
        clearTimeout(dismissTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDismiss = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    setVisible(false);
    // Wait for the exit animation before calling onDismiss so the caller
    // can unmount the toast only after it has slid/faded out.
    const exitDuration = reducedMotion ? 150 : 260;
    setTimeout(onDismiss, exitDuration);
  }, [onDismiss, reducedMotion]);

  const handleUndo = useCallback(() => {
    onUndo();
    handleDismiss();
  }, [onUndo, handleDismiss]);

  // Truncate long titles so the toast never wraps to a second line.
  const displayTitle =
    lessonTitle.length > 48 ? lessonTitle.slice(0, 48) + "…" : lessonTitle;

  // ── Transition values ─────────────────────────────────────────────────────
  // Under reduced motion: opacity-only transition (no transform).
  // Standard:            slide up from bottom (translateY 16px → 0) + opacity.
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
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: `translateX(-50%) ${slideTransform}`,
        // translateX and the slide transform are composed as a single value
        // so they do not fight each other. In reduced-motion mode slideTransform
        // is "none" so the resulting string is "translateX(-50%) none" — browsers
        // accept this and apply only the translateX.
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 8px 0 16px",
        minHeight: 48,
        background: "var(--ink-900)",
        color: "var(--paper)",
        borderRadius: 10,
        boxShadow: "var(--shadow-popover)",
        fontSize: 13,
        fontWeight: 400,
        opacity,
        transition,
        pointerEvents: visible ? "auto" : "none",
        // Prevent the toast from spanning the full viewport width on small screens.
        maxWidth: "calc(100vw - 32px)",
        whiteSpace: "nowrap",
      }}
    >
      {/* Message */}
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
        <span style={{ color: "var(--ink-300)", marginRight: 4 }}>
          Archived:
        </span>
        {displayTitle}
      </span>

      {/* Undo button — distinct from the dismiss × so the teacher can scan
          quickly and find "Undo" in the expected position. */}
      <button
        type="button"
        onClick={handleUndo}
        style={{
          minHeight: 44,
          padding: "0 12px",
          borderRadius: 6,
          border: "1px solid rgba(255,255,255,0.22)",
          background: "transparent",
          color: "var(--paper)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          letterSpacing: 0.2,
          flexShrink: 0,
        }}
      >
        Undo
      </button>

      {/* Dismiss × */}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss notification"
        style={{
          minHeight: 44,
          width: 44,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
          border: "none",
          background: "transparent",
          color: "var(--ink-400)",
          fontSize: 16,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
