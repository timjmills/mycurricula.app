"use client";

// view-transition.tsx — W3.2 (D4): seamless in-place route swaps.
//
// The v2 handoff's navigation contract (V2 Framework.md §9): clicking a console
// view "navigates in place — the photo holds, the content swaps on the glass
// with a soft entrance." The photo/stage layers already persist (root layout)
// and the chrome persists per route group (App Router layouts never remount
// across sibling navigations) — this module supplies the missing piece, the
// SOFT SWAP: it wraps App Router navigation in the browser View Transitions
// API so the outgoing and incoming content cross-fade instead of hard-cutting.
//
// Design constraints, in order:
//   • NO new dependencies (CLAUDE.md §6) — this is the hand-rolled ~equivalent
//     of the 'next-view-transitions' pattern: startViewTransition's update
//     callback returns a promise the router resolves when the new route's DOM
//     has committed (approximated by the next pathname change, see the pulse).
//   • PROGRESSIVE ENHANCEMENT — no startViewTransition (Firefox/older Safari)
//     or `prefers-reduced-motion: reduce` → plain router.push, zero behavior
//     change. The API's cross-fade is motion, so reduced-motion opts out in JS
//     (belt) and the ::view-transition CSS carries a matching @media guard
//     (braces).
//   • NEVER WEDGE INPUT — the document is non-interactive while a view
//     transition holds its snapshot, so the update promise ALWAYS settles: on
//     pathname commit, or on a hard timeout for a failed/slow navigation.
//
// Wiring: mount <RouteTransitionPulse /> ONCE (root layout, render-null leaf);
// navigate via <TransitionLink> (drop-in next/link) or useTransitionRouter().

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

// The View Transitions API types come from the workspace's TS DOM lib (5.9+
// declares document.startViewTransition natively — re-declaring it locally is
// a TS2430 build break, §4a finding). Browsers without the API are handled by
// the runtime feature check below, not by typing.

// A failed/aborted navigation must not hold the transition snapshot (and the
// page's input) hostage — settle the update promise after this long even if no
// pathname change ever commits. The UA has its own ~4s skip; this fires first.
const NAV_COMMIT_TIMEOUT_MS = 1500;

// The pending navigation's resolver, shared between the trigger (push) and the
// commit signal (RouteTransitionPulse). Module-level because the trigger and
// the pulse live in different components; single-slot because the document can
// only run one view transition at a time — a second navigation while one is
// pending settles the first and falls back to a plain push.
let pendingCommit: (() => void) | null = null;

function settlePendingCommit(): void {
  if (pendingCommit) {
    const resolve = pendingCommit;
    pendingCommit = null;
    resolve();
  }
}

/**
 * Settle any in-flight soft-swap before a navigation this module did not
 * initiate (history.back(), the immersive-bar Back, a hard location change).
 * Without this, the pending update promise would ride until its timeout while
 * the OTHER navigation commits under the held snapshot (W3.3 immersbar
 * contract: "the Back button must settle any pending View Transition").
 */
export function settlePendingNavigation(): void {
  settlePendingCommit();
}

/** True when the soft swap can run: API present AND motion is welcome. */
function canViewTransition(): boolean {
  if (typeof document === "undefined") return false;
  if (typeof document.startViewTransition !== "function") return false;
  try {
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * A same-pathname push must NOT start a transition: the pathname never
 * changes, so the commit pulse never fires and the snapshot would hold the
 * (non-interactive) document until the timeout — clicking the ACTIVE nav item
 * would freeze input for 1.5s (§4a finding). usePathname also excludes search
 * params, so query-only navigations fall in the same bucket.
 */
function isSamePathname(href: string): boolean {
  try {
    return (
      new URL(href, window.location.href).pathname === window.location.pathname
    );
  } catch {
    return false;
  }
}

/**
 * Render-null leaf that signals "the new route's DOM committed" by observing
 * pathname changes. Mount ONCE, at the root, so every route group's
 * navigations resolve their transition promise. (Approximation note: pathname
 * change fires on React's commit of the new route tree — exactly the moment
 * the view transition should snapshot the incoming state.)
 */
export function RouteTransitionPulse(): ReactNode {
  const pathname = usePathname();
  useEffect(() => {
    settlePendingCommit();
  }, [pathname]);
  return null;
}

/**
 * App Router push wrapped in a view transition (with the fallbacks above).
 * Returned identity is stable; safe for effect deps.
 */
export function useTransitionRouter(): { push: (href: string) => void } {
  const router = useRouter();

  const push = useCallback(
    (href: string) => {
      if (!canViewTransition() || isSamePathname(href)) {
        router.push(href);
        return;
      }
      // One transition at a time: settle any straggler so the previous
      // navigation's update promise resolves (the UA auto-skips its visual
      // transition when a new one starts).
      settlePendingCommit();
      document.startViewTransition(() => {
        let myResolve!: () => void;
        const committed = new Promise<void>((resolve) => {
          myResolve = resolve;
        });
        pendingCommit = myResolve;
        const timeout = new Promise<void>((resolve) => {
          setTimeout(() => {
            // Ownership check: a stale timer must never clear a LATER
            // navigation's pending resolver (it would settle that
            // transition's update promise before its DOM committed —
            // §4a finding). Settling our own race is always safe.
            if (pendingCommit === myResolve) pendingCommit = null;
            resolve();
          }, NAV_COMMIT_TIMEOUT_MS);
        });
        router.push(href);
        return Promise.race([committed, timeout]);
      });
    },
    [router],
  );

  return useMemo(() => ({ push }), [push]);
}

// Context so a whole subtree (e.g. the W3.3 corner chrome / W3.4 console) can
// opt its plain Links into soft swaps without prop-drilling. Not required for
// TransitionLink, which works standalone.
const TransitionNavContext = createContext<{
  push: (href: string) => void;
} | null>(null);

export function TransitionNavProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const nav = useTransitionRouter();
  return (
    <TransitionNavContext.Provider value={nav}>
      {children}
    </TransitionNavContext.Provider>
  );
}

export function useTransitionNav(): { push: (href: string) => void } {
  const ctx = useContext(TransitionNavContext);
  const standalone = useTransitionRouter();
  return ctx ?? standalone;
}

/**
 * Drop-in replacement for next/link that soft-swaps in-app navigations.
 * Defers to the default Link behavior (NO intercept) for every case where the
 * native semantic must win: modified clicks (new tab / download / context),
 * non-left buttons, `target`, `download`, external/absolute URLs, hash-only
 * hops, an explicitly prevented event from a caller's onClick, OBJECT-form
 * hrefs (serializing query/hash here would just re-implement Link — native
 * handles them correctly, only without the soft swap; §4a finding), and
 * `replace`/`scroll` callers (the intercepted path only speaks plain push
 * semantics; silently changing theirs would be worse than skipping the swap).
 */
export function TransitionLink({
  href,
  onClick,
  children,
  ...rest
}: ComponentProps<typeof Link>): ReactNode {
  const { push } = useTransitionNav();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    if (rest.target && rest.target !== "_self") return;
    if (rest.download !== undefined) return;
    if (rest.replace || rest.scroll === false) return;
    if (typeof href !== "string") return;
    // In-app path navigations only — external, protocol'd, and hash-only
    // destinations keep native semantics.
    if (!href.startsWith("/")) return;
    e.preventDefault();
    push(href);
  };

  return (
    <Link href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
