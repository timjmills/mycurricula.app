"use client";

// modal-state.ts — the module-level open-state singleton for the Catch-Up modal.
//
// WHY A SINGLETON (Codex W10 gate — dual-modal hazard). The modal is reachable
// two ways: the /catch-up route, and the chrome Tools-dock. If each mounted its
// OWN <CatchUpModal>, both could be open at once — two `aria-modal` dialogs and
// two focus traps. (This list used to end "two competing scroll-lock cleanups";
// that hazard is GONE as of c60d740 — the lock is refcounted in
// lib/use-body-scroll-lock, so no teardown order can strand `overflow`. The
// dialog and focus-trap hazards stand on their own.) This module makes "is the
// Catch-Up modal open?" a single global boolean, and elects a single Host to
// render it, so exactly ONE modal can ever be on screen no matter how many
// Hosts (route + chrome) are mounted.
//
// Pattern mirrors lib/hub-recents: a module-level value + a listener set, with
// SSR-safe subscriber hooks (server → default, hydrate post-mount). This is
// transient session state (no localStorage) — closing the tab forgets it.

import { useEffect, useState } from "react";

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
  scheduleRendererCheck();
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
  else if (!wasOpen && open) scheduleRendererCheck();
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
// listener) or the open state would paint twice.
//
// The election is decided by MOUNT POINT, not by arrival order. It used to be
// first-come — whichever Host ran its mount effect first claimed the slot — and
// that is not a property anyone controls: the route body hydrates inside its
// own Suspense boundary, so the winner moved with React's scheduling. Ranking
// the mount points makes the answer the same on every load, and puts the slot
// on the Host that can hold it: the chrome's outlives every route, so a
// navigation never tears the renderer down underneath an open modal.
//
// A Host that loses renders nothing, and on screen that is indistinguishable
// from a Host that is broken, from a bundle that failed to load, and from no
// Host at all. Those really were confused for each other (task #49), so the
// case that actually hurts — the modal is OPEN and nothing is rendering it — is
// REPORTED rather than swallowed. See reportMissingRenderer below.

/** Where a Host is mounted. `chrome` outranks `route`. */
export type CatchupHostMount = "chrome" | "route";

const MOUNT_RANK: Record<CatchupHostMount, number> = { chrome: 0, route: 1 };

interface RegisteredHost {
  id: number;
  mount: CatchupHostMount;
  reconcile: () => void;
}

let idSeq = 0;
const hosts: RegisteredHost[] = [];

/** The elected Host — best mount rank, ties broken by earliest mount. Null when
 *  no Host is mounted at all. */
function electedHost(): RegisteredHost | null {
  let best: RegisteredHost | null = null;
  for (const h of hosts) {
    if (
      best === null ||
      MOUNT_RANK[h.mount] < MOUNT_RANK[best.mount] ||
      (MOUNT_RANK[h.mount] === MOUNT_RANK[best.mount] && h.id < best.id)
    ) {
      best = h;
    }
  }
  return best;
}

/** Re-run every Host's election check. Iterates a COPY: a reconcile is a
 *  setState, and React may commit an unmount off the back of one. */
function notifyRenderers(): void {
  for (const h of [...hosts]) h.reconcile();
}

// ── "Open, but nothing is drawing it" ───────────────────────────────────────
//
// The one failure this singleton can produce with no visible symptom: `open` is
// true, every subscriber agrees, and no Host is mounted to render the modal.
// The teacher sees an unchanged page, the console says nothing, and the state
// is perfectly consistent and perfectly invisible — the same silence a dead
// bundle produces, which is exactly how one was mistaken for the other.
//
// So it announces itself. A subscriber takes over the reporting when there is
// one (the test asserts on it; a dev overlay could surface it); with none it
// goes to console.error, where an unattended session still shows it.

const missingListeners = new Set<(message: string) => void>();

/** Subscribe to "the modal is open and no Host is rendering it". Returns an
 *  unsubscribe. While at least one subscriber is registered, the default
 *  console.error is suppressed — the subscriber owns the reporting. */
export function onCatchupRendererMissing(
  fn: (message: string) => void,
): () => void {
  missingListeners.add(fn);
  return () => {
    missingListeners.delete(fn);
  };
}

let missingCheck: ReturnType<typeof setTimeout> | null = null;

const MISSING_RENDERER_MESSAGE =
  "[catchup] The Catch-Up modal is open but no CatchUpModalHost is rendering it — " +
  "the state says open and nothing is on screen. Mount a <CatchUpModalHost/>: " +
  "ChromeShell mounts one app-wide, and the /catch-up route mounts its own.";

/**
 * Verify — on the next macrotask, so Hosts mounting in the same commit have
 * registered first — that something is actually drawing the open modal.
 *
 * Deferred rather than immediate because the legitimate order really is
 * "open, then mount": the /catch-up route opens from an effect that can run
 * before a Host below it has registered. Checking synchronously would cry wolf
 * on the healthy path, and an alarm that cries wolf gets muted.
 */
function scheduleRendererCheck(): void {
  // The server never mounts a Host, and never renders the modal — the open
  // state there is always about to be replaced by the client's.
  if (typeof window === "undefined") return;
  if (missingCheck !== null) return;
  missingCheck = setTimeout(() => {
    missingCheck = null;
    if (!open || electedHost() !== null) return;
    if (missingListeners.size === 0) {
      console.error(MISSING_RENDERER_MESSAGE);
      return;
    }
    for (const fn of missingListeners) fn(MISSING_RENDERER_MESSAGE);
  }, 0);
}

/**
 * Returns whether THIS Host instance is the elected renderer. Exactly one
 * mounted Host resolves true at a time; the rest resolve false and render
 * nothing. Re-elects whenever a Host mounts or unmounts.
 */
export function useIsCatchupHostRenderer(mount: CatchupHostMount): boolean {
  const [isRenderer, setIsRenderer] = useState(false);
  useEffect(() => {
    const id = ++idSeq;
    const host: RegisteredHost = {
      id,
      mount,
      reconcile: () => setIsRenderer(electedHost()?.id === id),
    };
    hosts.push(host);
    // EVERY Host re-reads the election, not just this one. A chrome Host
    // arriving after a route Host has to take the slot AND the route Host has
    // to stand down in the same pass, or both would paint.
    notifyRenderers();
    return () => {
      const i = hosts.indexOf(host);
      if (i !== -1) hosts.splice(i, 1);
      notifyRenderers();
      // Losing the last Host while the modal is open is the silent case above.
      scheduleRendererCheck();
    };
  }, [mount]);
  return isRenderer;
}
