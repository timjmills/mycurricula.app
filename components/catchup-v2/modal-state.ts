"use client";

// modal-state.ts — the module-level open-state singleton for the Catch-Up modal.
//
// WHY A SINGLETON (Codex W10 gate — dual-modal hazard). The modal is reachable
// two ways: the /catch-up route, and the chrome Tools-dock. If each mounted its
// OWN <CatchUpModal>, both could be open at once — two `aria-modal` dialogs, two
// focus traps, two competing scroll-lock cleanups. This module makes "is the
// Catch-Up modal open?" a single global boolean, and elects a single Host to
// render it, so exactly ONE modal can ever be on screen no matter how many
// Hosts (route + chrome) are mounted.
//
// Pattern mirrors lib/hub-recents: a module-level value + a listener set, with
// SSR-safe subscriber hooks (server → default, hydrate post-mount). This is
// transient session state (no localStorage) — closing the tab forgets it.

import { useEffect, useRef, useState } from "react";

// ── Open state ───────────────────────────────────────────────────────────────

let open = false;
const openListeners = new Set<(v: boolean) => void>();

/** Why the modal closed. "dismiss" = ✕/Esc/backdrop/dock-toggle (the route
 *  falls back to /weekly). "navigated" = the modal is itself sending the user
 *  somewhere (Plan/Teach) — the route must NOT fire its /weekly fallback or it
 *  would stomp the requested destination (Codex W10 R2). */
export type CatchupCloseReason = "dismiss" | "navigated";

// Fired whenever the modal transitions open → closed, by ANY path. The
// /catch-up route registers a callback here to navigate away, so the route
// can't be left showing a blank surface after a close it didn't itself initiate
// (Codex/QA W10 — the earlier "watch open for a true→false transition" approach
// was fragile under effect ordering + StrictMode double-invoke; a direct
// callback is deterministic). The reason lets the route skip its fallback for
// intentional in-modal navigation.
const closeListeners = new Set<(reason: CatchupCloseReason) => void>();

function emitOpen(): void {
  for (const fn of openListeners) fn(open);
}
function fireClosed(reason: CatchupCloseReason): void {
  for (const fn of closeListeners) fn(reason);
}

/** Open the Catch-Up modal (idempotent). */
export function openCatchupModal(): void {
  if (open) return;
  open = true;
  emitOpen();
}

/** Close the Catch-Up modal (idempotent). Fires close listeners on a real
 *  open → closed transition. `reason` defaults to "dismiss". */
export function closeCatchupModal(reason: CatchupCloseReason = "dismiss"): void {
  if (!open) return;
  open = false;
  emitOpen();
  fireClosed(reason);
}

/** Flip the Catch-Up modal open/closed — the Tools-dock toggle. A toggle-close
 *  is a dismiss. */
export function toggleCatchupModal(): void {
  const wasOpen = open;
  open = !open;
  emitOpen();
  if (wasOpen && !open) fireClosed("dismiss");
}

/** Register a callback fired when the modal closes (open → closed), by any
 *  path, with the close reason. Returns an unsubscribe. Used by the /catch-up
 *  route to navigate away (skipping its fallback for "navigated"). */
export function onCatchupModalClosed(
  fn: (reason: CatchupCloseReason) => void,
): () => void {
  closeListeners.add(fn);
  return () => {
    closeListeners.delete(fn);
  };
}

/**
 * Subscribe to the modal's open state. SSR-safe: returns false on the server and
 * for the first client paint (so the server HTML and first client render agree),
 * then hydrates to the live value in a mount effect.
 */
export function useCatchupModalOpen(): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    setV(open);
    const fn = (next: boolean): void => setV(next);
    openListeners.add(fn);
    return () => {
      openListeners.delete(fn);
    };
  }, []);
  return v;
}

// ── Single-renderer election ─────────────────────────────────────────────────
//
// Multiple <CatchUpModalHost> instances can mount at once (the /catch-up route
// AND the chrome). Exactly one must render the modal (and own the window toggle
// listener) or the open state would paint twice. Each Host claims the single
// renderer slot on mount; the FIRST to claim wins, later Hosts no-op. When the
// renderer unmounts it frees the slot and notifies survivors so one re-elects.

let rendererId: number | null = null;
let idSeq = 0;
const rendererListeners = new Set<() => void>();

function notifyRenderers(): void {
  for (const fn of rendererListeners) fn();
}

/**
 * Returns whether THIS Host instance is the elected renderer. Exactly one
 * mounted Host resolves true at a time; the rest resolve false and render
 * nothing. Re-elects when the current renderer unmounts.
 */
export function useIsCatchupHostRenderer(): boolean {
  const [isRenderer, setIsRenderer] = useState(false);
  const idRef = useRef(0);
  useEffect(() => {
    const id = ++idSeq;
    idRef.current = id;
    const reconcile = (): void => {
      // Claim the slot if it's free — the first reconcile to run wins, so the
      // earliest-mounted (or earliest-surviving) Host becomes the renderer.
      if (rendererId === null) rendererId = id;
      setIsRenderer(rendererId === id);
    };
    rendererListeners.add(reconcile);
    reconcile(); // claim-or-defer on mount
    return () => {
      rendererListeners.delete(reconcile);
      if (rendererId === id) {
        rendererId = null; // I was the renderer — free the slot…
        notifyRenderers(); // …and let a surviving Host re-elect.
      }
    };
  }, []);
  return isRenderer;
}
