"use client";

// team-mode-intro.tsx — one-time teaching popover on the first switch
// to Team Curriculum mode.
//
// W2-B1 (Unified Audit Decision #3): the safety stack on first switch
// has three layers:
//   1. THIS popover — fires ONCE per teacher, anchored under the
//      top-bar toggle. Explains what Team Curriculum mode IS and how
//      to leave it.
//   2. <MasterBanner> — the pulse-then-persist banner at the top of the
//      viewport (existing, runs on every entry to master mode).
//   3. <useTeamModeEditCue> ring on editable lesson surfaces — runs
//      while editMode === "master".
//
// No recurring confirm dialog on toggle. The localStorage key
// `mycurricula:user:team-mode-introduced` flips on dismiss so the
// popover never reappears for this teacher.
//
// SSR safety: initial state matches the server render (popover hidden).
// localStorage is read in useEffect post-mount only. prefers-reduced-
// motion collapses the fade animation to instant.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useAppState } from "@/lib/app-state";
import { Button } from "@/components/ui";
import styles from "./team-mode-intro.module.css";

const INTRODUCED_KEY = "mycurricula:user:team-mode-introduced";

function hasBeenIntroduced(): boolean {
  if (typeof window === "undefined") return true; // SSR: assume yes so we don't paint
  try {
    return window.localStorage.getItem(INTRODUCED_KEY) === "true";
  } catch {
    return true;
  }
}

function markIntroduced(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INTRODUCED_KEY, "true");
  } catch {
    // Storage disabled — popover may fire again next session. Acceptable.
  }
}

export function TeamModeIntro(): ReactNode {
  const { editMode } = useAppState();
  // Single visibility flag. We don't read localStorage in useState
  // initializer (SSR-safe). The effect below decides whether to open.
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Open when we transition into master mode AND the teacher hasn't
  // seen the popover yet. We DO NOT close if they switch back — the
  // close is explicit (Got it / Escape / click-outside).
  useEffect(() => {
    if (editMode !== "master") {
      setOpen(false);
      return;
    }
    if (hasBeenIntroduced()) return;
    // W3.8 — skip (don't consume) the intro while the lesson-editor modal
    // is open: its scrim sits at z-index 600, so this z-50 popover would
    // paint invisibly underneath it AND its Escape listener would eat the
    // key the teacher meant for the modal. The intro is not marked
    // introduced, so it still fires on the next master-mode entry once no
    // modal is up. DOM probe rather than shared state on purpose — the
    // smallest possible seam between shell chrome and the editor overlay
    // (gate finding #5).
    if (document.querySelector(".lm-scrim") !== null) return;
    setOpen(true);
  }, [editMode]);

  const handleDismiss = useCallback((): void => {
    markIntroduced();
    setOpen(false);
  }, []);

  // Escape closes the popover.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") handleDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleDismiss]);

  // Click-outside closes the popover.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent): void {
      if (!popoverRef.current) return;
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (popoverRef.current.contains(target)) return;
      handleDismiss();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, handleDismiss]);

  if (!open) return null;

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-labelledby="team-mode-intro-title"
      aria-describedby="team-mode-intro-body"
      className={styles.popover}
    >
      <h3 id="team-mode-intro-title" className={styles.title}>
        Editing the Team Curriculum
      </h3>
      <p id="team-mode-intro-body" className={styles.body}>
        You&rsquo;ve flipped to <strong>Team Curriculum</strong> mode. Any edit
        you make here is shared with every teacher on your team — lesson titles,
        objectives, sections, and resources. To keep edits private, flip the
        top-bar toggle back to <strong>Personal</strong>.
      </p>
      <div className={styles.actions}>
        <Button
          variant="primary"
          size="sm"
          onClick={handleDismiss}
          tooltip="Got it — don't show this teaching popover again"
        >
          Got it
        </Button>
      </div>
    </div>
  );
}
