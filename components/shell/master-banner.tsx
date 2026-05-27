"use client";

// master-banner.tsx — Master-mode entry banner.
//
// When the teacher flips the top-bar toggle to "master", a two-phase
// warning sequence runs at the very top of the viewport (z-index 40,
// above the top bar):
//
//   Phase 1 — "heads up" (pulsing): fades in/out on a ~1.2s cycle for
//             3 seconds, communicating that master mode carries team-wide
//             consequences without a confirm dialog (§3.3, CLAUDE.md §2).
//   Phase 2 — "persistent" (slim): replaces the heads-up banner and stays
//             visible for the entire master session.
//
// Returns null while editMode === "personal".
//
// prefers-reduced-motion: the heads-up phase appears solid immediately (no
// pulse animation — the CSS @keyframes collapses to near-instant via the
// tokens.css blanket rule). After 3 s the banner resolves to the slim
// persistent strip, which is never animated regardless of motion prefs.

import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { useAppState } from "@/lib/app-state";
import { Tooltip } from "@/components/ui";
import styles from "./master-banner.module.css";

// Duration (ms) before the heads-up phase resolves to the persistent strip.
const HEADS_UP_DURATION = 3000;

// ── MasterBanner ─────────────────────────────────────────────────────────

/** Master-mode warning banner — null in Personal mode. */
export function MasterBanner(): ReactNode {
  const { editMode } = useAppState();

  // `phase` tracks which banner is showing:
  //   "headsup"    — the pulsing full-size entry message
  //   "persistent" — the slim non-pulsing long-running strip
  //   null         — banner is hidden (personal mode or not yet entered master)
  const [phase, setPhase] = useState<"headsup" | "persistent" | null>(null);

  useEffect(() => {
    if (editMode !== "master") {
      // Return to personal — clear both states immediately.
      setPhase(null);
      return;
    }

    // Entering master mode: start the heads-up phase.
    setPhase("headsup");

    const timer = setTimeout(() => {
      setPhase("persistent");
    }, HEADS_UP_DURATION);

    // Cleanup in case editMode changes before the timer fires.
    return () => clearTimeout(timer);
  }, [editMode]);

  // Nothing to render in personal mode.
  if (phase === null) return null;

  const isHeadsUp = phase === "headsup";

  // Panel-header tooltip per CLAUDE.md §4 — teach a first-time teacher
  // what Master mode IS (editing the team's shared curriculum) and how
  // to leave it (toggle back to Personal). Wrapped in the styled
  // <Tooltip> primitive so the explanation paints the black-backdrop
  // bubble that matches the rest of the chrome.
  const bannerCopy =
    "You're editing the team's MASTER curriculum — every change here is shared with every teacher on your grade-level team. Flip the top-bar toggle back to Personal to keep edits private.";
  return (
    <Tooltip content={bannerCopy} side="bottom">
      <div
        className={`${styles.banner} ${
          isHeadsUp ? styles.headsUp : styles.persistent
        }`}
        role={isHeadsUp ? "alert" : "status"}
        aria-live={isHeadsUp ? "assertive" : "polite"}
        aria-atomic="true"
        title={bannerCopy}
      >
        <span className={styles.icon} aria-hidden="true">
          <WarningIcon size={isHeadsUp ? 18 : 14} />
        </span>
        <span>Heads up — changes here affect the whole team.</span>
      </div>
    </Tooltip>
  );
}

// ── Warning icon ─────────────────────────────────────────────────────────

function WarningIcon({ size }: { size: number }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
