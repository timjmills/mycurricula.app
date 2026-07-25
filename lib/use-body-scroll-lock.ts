"use client";

// use-body-scroll-lock.ts — the ONE owner of "an overlay is open, don't scroll
// the page behind it".
//
// WHY THIS MODULE EXISTS
//
// Nine overlays each hand-rolled the same four lines:
//
//     const prev = document.body.style.overflow;
//     document.body.style.overflow = "hidden";
//     return () => { document.body.style.overflow = prev; };
//
// Each one is correct alone and wrong together, because `prev` is captured per
// overlay instead of once per lock. Two overlays released in non-LIFO order
// strand the page:
//
//     A opens  → captures ""      , body = hidden
//     B opens  → captures "hidden", body = hidden
//     A closes → restores ""       ← the page scrolls WHILE B IS STILL OPEN
//     B closes → restores "hidden" ← nothing is open and the body stays locked
//
// Non-LIFO is not exotic. Two overlays that are siblings rather than nested —
// a rail drawer and a unit workspace, the chrome's Catch-Up modal and anything
// under it — are closed in whatever order the teacher chooses, and half of the
// orders are wrong. A React subtree DELETION gets there too: `commitDeletion-
// Effects` walks DOWN the tree, so a parent overlay's cleanup runs BEFORE its
// nested child's, inverting the safe order for free.
//
// There is no error and no console warning when it happens — the page simply
// stops scrolling until reload. `components/hub-v2/HubDocHost.tsx` and
// `components/year-v2/workspace-host/workspace-state.ts` both carry comments
// warning about "two competing scroll-lock cleanups" and defer to "the wider
// refcounted body-scroll-lock work". This is that work.
//
// THE MODEL — a refcount, not a boolean
//
//   • The FIRST acquire captures the pre-overlay value and applies the lock.
//   • Further acquires only bump the count; they never re-capture, so the
//     second overlay can't record its predecessor's "hidden" as the value to
//     restore.
//   • The LAST release restores the value the FIRST acquire captured.
//
// WHAT IT LOCKS, AND WHAT IT DELIBERATELY DOES NOT
//
// `document.body.style.overflow`, and nothing else. That is the whole of what
// all nine callsites did — none compensated for scrollbar width with a
// `paddingRight`, none used the iOS `position: fixed` trick, none touched
// `overscroll-behavior` — so adopting this hook is behaviour-preserving. Widen
// it here if a callsite ever needs more; do not re-hand-roll it there.
//
// SSR: no `document` at module scope, and `acquire()` on a server render is a
// no-op returning a no-op release, so a component may call it unconditionally.

import { useEffect } from "react";

/** The minimal surface the lock needs. `document.body` satisfies it. */
export interface ScrollLockTarget {
  style: { overflow: string };
}

export interface BodyScrollLock {
  /** Take a lock. Returns a release that is safe to call more than once. */
  acquire(): () => void;
  /** How many locks are currently held — diagnostics and tests. */
  readonly depth: number;
}

/**
 * Build an independent refcounted lock over `getTarget()`.
 *
 * Exported as a factory so tests can drive the REAL logic against their own
 * target instead of a global, and so nothing needs a reset backdoor.
 */
export function createBodyScrollLock(
  getTarget: () => ScrollLockTarget | null,
): BodyScrollLock {
  let depth = 0;
  // Set together with the 0 → 1 transition and cleared on 1 → 0, so the value
  // to restore and the element to restore it on can never drift apart. There
  // is deliberately no `?? ""` anywhere below: a fallback of "" is exactly the
  // unlocked value every caller asserts on, so a capture bug would restore the
  // right answer by accident and hide itself.
  let held: { target: ScrollLockTarget; restoreTo: string } | null = null;

  return {
    get depth() {
      return depth;
    },

    acquire(): () => void {
      const target = getTarget();
      // No DOM (SSR): hold nothing, and hand back a release that is also inert
      // rather than one that would decrement a count we never incremented.
      if (target === null) return () => {};

      if (depth === 0) {
        held = { target, restoreTo: target.style.overflow };
        target.style.overflow = "hidden";
      }
      depth += 1;

      // Per-caller idempotence. React StrictMode double-invokes effects in dev
      // and this repo has been bitten by it before; a release called twice
      // must not drop the count below the number of live holders, or the next
      // overlay to close would unlock the page out from under the others.
      let released = false;
      return () => {
        if (released) return;
        released = true;
        depth -= 1;
        if (depth === 0 && held !== null) {
          held.target.style.overflow = held.restoreTo;
          held = null;
        }
      };
    },
  };
}

/** The process-wide lock every overlay shares. */
const bodyScrollLock = createBodyScrollLock(() =>
  typeof document === "undefined" ? null : document.body,
);

/** Take a body-scroll lock imperatively. Prefer the hook in components. */
export function acquireBodyScrollLock(): () => void {
  return bodyScrollLock.acquire();
}

/** How many body-scroll locks are held right now (diagnostics/tests). */
export function bodyScrollLockDepth(): number {
  return bodyScrollLock.depth;
}

/**
 * Lock body scroll for as long as this component is mounted and `enabled`.
 *
 * @param enabled pass the overlay's own `open` flag when the component stays
 *                mounted while closed; omit it when the component only exists
 *                while the overlay is on screen.
 */
export function useBodyScrollLock(enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return;
    return acquireBodyScrollLock();
  }, [enabled]);
}
