"use client";

// compare-to-master.tsx — modal shell around the REAL fork diff.
//
// HISTORY: this file used to be the "Master snapshot not available yet"
// stub (see BUILD_STANDARD §12 "Master-snapshot diff data"). UX roadmap
// item 01 replaced the stub: the diff itself now lives in
// `components/lesson-card/fork-diff/` (ForkDiffPanel — the inline panel the
// item-01 spec calls for, mounted in LessonDetail's body), diffing against
// the PROTOTYPE `Lesson.masterSnapshot` seam (Phase 1B swaps that for
// persisted fork lineage).
//
// This component is retained as a thin overlay HOST for the panel so the
// existing callsite (weekly-lesson-card's "compare-master" handling) keeps
// compiling and, if reached, shows the real diff instead of placeholder
// copy. The primary entry points now route to the Daily lesson detail
// (`/daily?lesson=<id>&compare=1`), where the panel renders inline.
//
// Focus behavior mirrors the old stub: focus moves into the dialog on open,
// Tab is trapped, Escape closes, outside-click closes, and focus returns to
// the opener on close.

import { useCallback, useEffect, useRef } from "react";
import type { Lesson } from "@/lib/types";
import { useAppState } from "@/lib/app-state";
import { ForkDiffPanel } from "./fork-diff";

// ── Focus-trap selector ───────────────────────────────────────────────────
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

// ── Props ─────────────────────────────────────────────────────────────────

export interface CompareToMasterProps {
  lesson: Lesson;
  onClose: () => void;
  /**
   * LEGACY (pre-item-01 stub API) — retained so existing hosts compile.
   * The ForkDiffPanel dispatches the store's restoreLesson itself (so the
   * undo toast fires); this callback is no longer invoked.
   */
  onRestore?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────

export function CompareToMaster(props: CompareToMasterProps) {
  // `onRestore` is intentionally not read — see the props doc comment.
  const { lesson, onClose } = props;
  const { editMode } = useAppState();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // ── Open: capture previous focus, move focus into the dialog ─────────────
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      panel.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // ── Close: restore focus to the opener ───────────────────────────────────
  const close = useCallback(() => {
    const prev = previousFocusRef.current;
    onClose();
    if (prev && typeof prev.focus === "function") {
      setTimeout(() => prev.focus(), 0);
    }
  }, [onClose]);

  // ── Keyboard: Esc closes; Tab traps ──────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "Tab") {
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
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [close],
  );

  // ── Click-outside → close ─────────────────────────────────────────────────
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", onDown, true);
    return () => document.removeEventListener("mousedown", onDown, true);
  }, [close]);

  // PERSONAL-MODE GATE (M1, defense-in-depth). The diff is personal-scoped —
  // its per-field reverts write with the ACTIVE save target — so every entry
  // point requires editMode === "personal". ForkDiffPanel renders null in
  // master mode on its own; this guard keeps a stale "compare-master" host
  // from painting an empty dialog shell around that null. (Placed after the
  // hooks above — hook order must not depend on the mode.)
  if (editMode !== "personal") return null;

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        // Scrim treatment matches the command palette / shortcuts overlay
        // (no scrim token exists yet; this is the established literal).
        background: "rgba(20, 22, 32, 0.32)",
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Compare with Team Curriculum"
        onKeyDown={handleKeyDown}
        style={{
          width: 640,
          maxWidth: "100%",
          maxHeight: "calc(100vh - 80px)",
          overflowY: "auto",
          borderRadius: 10,
          boxShadow: "var(--shadow-popover)",
          background: "var(--paper)",
        }}
      >
        {/* The real diff — same panel LessonDetail mounts inline. Its own
            close affordance + footer actions drive this dialog's close. */}
        <ForkDiffPanel lesson={lesson} onClose={close} />
      </div>
    </div>
  );
}
