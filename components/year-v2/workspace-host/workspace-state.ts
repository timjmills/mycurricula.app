"use client";

// workspace-state.ts — the module-level singleton behind the GLOBAL unit
// workspace (B5.1): which unit is open, and which mounted host renders it.
//
// WHY A SINGLETON. Today the workspace mounts at exactly two places
// (YearShell's glass/color frames and HubDocHost), which is why /daily and
// /weekly have no path to it at all. B5 opens it to four entry points — Day,
// Week, the paper-frame Year, and the Planner Hub. If each mounted its OWN
// <UnitExplorer>, two could be on screen at once: two `aria-modal` dialogs and
// two focus traps fighting over the same keyboard. (This list used to include
// "two competing body-scroll-lock cleanups" — ExplorerShell restoring
// `document.body.style.overflow` on unmount, the second teardown restoring a
// value the first had already clobbered and leaving the page unscrollable.
// That hazard is GONE as of c60d740: the lock is refcounted in
// lib/use-body-scroll-lock, so no teardown order can strand `overflow`. The
// dialog and focus-trap hazards stand on their own.) This module makes "which
// unit is open?" ONE global value and elects ONE host to render it — the
// structure proven by components/catchup-v2/modal-state.ts, which solves the
// same hazard at two entry points.
//
// The open state is a TARGET, not a boolean: the workspace is scoped to a
// (subject, unit) pair — optionally focused on ONE lesson within it (B5.7) —
// and the rail navigates between units WITHOUT closing: the host re-renders
// with a new target rather than remounting (UnitExplorer's `onUnitChange`
// contract).
//
// SSR-safe: module scope touches no `window` / `document`, and the subscriber
// hook returns the closed default on the server and on the first client paint,
// then reads the live value in a mount effect — so the server HTML and the first
// client render agree. Transient session state (no localStorage): closing the
// tab forgets it.

import { useEffect, useState } from "react";
import type { SubjectId } from "@/lib/types";

// ── Open target ─────────────────────────────────────────────────────────────

/** The unit the global workspace is scoped to while open. */
export interface UnitWorkspaceTarget {
  subjectId: SubjectId;
  /** The unit identifier as it appears on `Lesson.unit` (a slug, e.g. "u-m3") —
   *  the same value <UnitExplorer unit=…> takes. May be `""` for a lesson that
   *  is not filed under any unit (see `focusLessonId`). */
  unit: string;
  /**
   * B5.7 — open the workspace ON A LESSON rather than on the unit: the
   * workspace mounts straight into its Lesson mode (the Lesson Planner) with
   * this lesson pinned, instead of the unit roll-up.
   *
   * This is what makes the workspace a complete replacement for the retired
   * centered lesson-editor popup. That popup worked for ANY lesson, including
   * one with no unit at all — and unfiled lessons are not an edge case: EVERY
   * lesson created in-app starts unfiled (`lib/planner-store` addLesson passes
   * `unit: ""`, which the Supabase source maps to a null `unit_id`). So a
   * lesson entry point cannot be routed through a unit: it would strand exactly
   * the lessons a teacher just made. The Lesson Planner needs only the lesson,
   * so it opens regardless; the unit is carried alongside purely so the
   * workspace can offer the Unit ⇄ Lesson switch when one resolves.
   */
  focusLessonId?: string;
}

let target: UnitWorkspaceTarget | null = null;
const targetListeners = new Set<(v: UnitWorkspaceTarget | null) => void>();

function emitTarget(): void {
  for (const fn of targetListeners) fn(target);
}

/** The unit currently open, or null when the workspace is closed. */
export function getUnitWorkspaceTarget(): UnitWorkspaceTarget | null {
  return target;
}

/**
 * Open the unit workspace on `subjectId` / `unit` — the ONE opener every entry
 * point calls (a Day card's unit name, a Week chip, Year, the Hub), and the
 * `onUnitChange` handler the rail navigates through.
 *
 * `focusLessonId` (B5.7) opens it on a LESSON instead: same workspace, mounted
 * in Lesson mode with that lesson pinned. Omit it for the unit roll-up.
 *
 * Re-opening the SAME target keeps the existing object, so a repeat click emits
 * nothing: subscribers keep their identical value and every memo derived from
 * the target survives. That matters for the rail, which reports the active unit
 * on every click including the one already showing. `focusLessonId` is part of
 * that identity — re-opening the unit the rail is already on, from a LESSON
 * entry point, has to switch the workspace into Lesson mode, so it is a real
 * change even though the unit did not move.
 */
export function openUnitWorkspace(
  subjectId: SubjectId,
  unit: string,
  focusLessonId?: string,
): void {
  if (
    target !== null &&
    target.subjectId === subjectId &&
    target.unit === unit &&
    target.focusLessonId === focusLessonId
  ) {
    return;
  }
  target = focusLessonId
    ? { subjectId, unit, focusLessonId }
    : { subjectId, unit };
  emitTarget();
}

/** Close the workspace. Idempotent — closing a closed workspace emits
 *  nothing. */
export function closeUnitWorkspace(): void {
  if (target === null) return;
  target = null;
  emitTarget();
}

/**
 * Subscribe to the open target. SSR-safe: returns null on the server and for the
 * first client paint (so the server HTML and the first client render agree),
 * then hydrates to the live value in a mount effect.
 */
export function useUnitWorkspaceTarget(): UnitWorkspaceTarget | null {
  const [v, setV] = useState<UnitWorkspaceTarget | null>(null);
  useEffect(() => {
    setV(target);
    const fn = (next: UnitWorkspaceTarget | null): void => setV(next);
    targetListeners.add(fn);
    return () => {
      targetListeners.delete(fn);
    };
  }, []);
  return v;
}

// ── Single-renderer election ────────────────────────────────────────────────
//
// More than one <UnitWorkspaceHost> can be mounted at once (the provider's, plus
// any host a later B5 step drops into a route). Exactly one must render the
// workspace or the open target would paint twice — the dual-dialog hazard above.
// Each host claims the single renderer slot on mount; the FIRST to claim wins and
// later hosts render nothing. When the holder unmounts it frees the slot and
// notifies survivors so one re-elects.
//
// The claim/release primitives are exported separately from the hook so the pure
// invariant ("only one holder, and only the holder can free the slot") is
// testable in the node harness, which cannot render React.

let hostId: number | null = null;
let hostIdSeq = 0;
const hostListeners = new Set<() => void>();

/** A fresh id for one host instance. Ids are never reused, so a late release
 *  from an already-unmounted host can never free a slot a newer host holds. */
export function nextUnitWorkspaceHostId(): number {
  return ++hostIdSeq;
}

/** Claim the renderer slot when it is free. Returns whether `id` holds it
 *  afterwards — idempotent for the current holder. */
export function claimUnitWorkspaceHost(id: number): boolean {
  if (hostId === null) hostId = id;
  return hostId === id;
}

/** Free the slot IF `id` holds it, then let the survivors re-elect. A host that
 *  never won is a no-op — an election loser unmounting must not evict the
 *  renderer. */
export function releaseUnitWorkspaceHost(id: number): void {
  if (hostId !== id) return;
  hostId = null;
  for (const fn of hostListeners) fn();
}

/** Whether `id` currently holds the renderer slot (read-only). */
export function isUnitWorkspaceHostRenderer(id: number): boolean {
  return hostId === id;
}

/**
 * Returns whether THIS host instance is the elected renderer. Exactly one
 * mounted host resolves true at a time; the rest resolve false and render
 * nothing. Re-elects when the current renderer unmounts.
 */
export function useIsUnitWorkspaceHostRenderer(): boolean {
  const [isRenderer, setIsRenderer] = useState(false);
  useEffect(() => {
    const id = nextUnitWorkspaceHostId();
    const reconcile = (): void => setIsRenderer(claimUnitWorkspaceHost(id));
    hostListeners.add(reconcile);
    reconcile(); // claim-or-defer on mount
    return () => {
      hostListeners.delete(reconcile);
      releaseUnitWorkspaceHost(id);
    };
  }, []);
  return isRenderer;
}
