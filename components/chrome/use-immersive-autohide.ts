"use client";

// use-immersive-autohide.ts — the idle timer that finally WIRES the immersive
// bar's auto-hide (docs/audits/2026-07-31-post-teach-catchup-shell.md finding
// A1).
//
// WHY THIS FILE EXISTS. `ImmersiveBar` has shipped a `hidden?: boolean` prop
// since W3.3 and `app/chrome.css` has styled `.immersbar.immersbar-hidden`
// since the same wave — but no caller ever passed the prop, so the feature was
// inert: shipped CSS, shipped prop, no timer, no wake handler, no way back.
// Everything the "caller owns the stillness timer" comment described lives
// here now, in ONE place, so there is exactly one implementation for every
// immersive surface rather than a copy per route.
//
// PORTED FROM the 7.21.26 handoff — `source-home/app.jsx:530-542` (the effect),
// `:558` (the mouseenter wake), `:593` (the peek button) and
// `source-home/compact-bar.css:16,51-55` (reduced motion + `.cb-peek`). Three
// deliberate divergences, each marked below:
//
//   1. TIMING. 3200ms desktop / 5000ms touch, per the 7.21 handoff. Our own
//      comments said 2.8s (ImmersiveBar.tsx:19, docs/v2-rebuild/WAVE-3-PLAN.md
//      :112,:262) — that number traces to the older 6.24/7.2 cycle and has been
//      corrected at both sites. The handoff is the authority (CLAUDE.md §4a).
//
//   2. THE HANDOFF'S RESIZE BUG IS FIXED HERE. Its effect deps are
//      `[compact, t.barAutoHide, view]` and its phone check is a one-shot
//      `window.innerWidth < 640` read INSIDE the effect — so a desktop→phone
//      resize (or an orientation flip) never re-runs it and leaves the bar
//      hidden on the exact tier where "the bar IS the nav". We read the width
//      through `matchMedia("(min-width: 640px)")` and subscribe to its change
//      event instead, so crossing the breakpoint in either direction is
//      handled live.
//
//   3. TWO EXTRA WAKES the handoff does not have — `focusin` anywhere inside
//      the bar, and any `keydown`. The handoff only listens for mousemove and
//      touchstart, which strands a keyboard-only teacher: this bar is their
//      ONLY nav on the immersive routes and they have no way to produce a
//      pointer event. A keydown means a human is present; a focusin means they
//      are already inside the bar.
//
//   4. A FOCUS/POPOVER GATE the handoff only half has. It checks one menu ref;
//      we check any open disclosure in the bar, plus a keyboard user parked
//      inside it. Both versions of the "obvious" focus check killed auto-hide
//      outright in live testing — see `keyboardModality` below before touching
//      it.
//
// SCOPE — ALL THREE IMMERSIVE SURFACES, as of the A2 fix.
// The only consumer is `ImmersiveBarHost`, and both immersive shells mount it:
// `ChromeShell` (route group `(planner)` → `/planner*`, `/post*`) and
// `app/(teach)/layout.tsx` (route group `(teach)` → `/teach*`). Teach's own
// layout mounts the host directly because it cannot host `ChromeShell` — the
// `.overlay.immersive` grid would clip the 100dvh workspace; that layout's
// header carries the measurement.
//
// This paragraph used to read "SCOPE LIMITATION — READ BEFORE FILING 'TEACH
// STILL DOESN'T AUTO-HIDE'", describing the `/teach` entry in
// `IMMERSIVE_PREFIXES` as inert (finding A2,
// docs/audits/2026-07-31-post-teach-catchup-shell.md). That gap is CLOSED —
// /teach now gets the bar, the timer, and the wake handlers like every other
// immersive route.
//
// ACCESSIBILITY CONTRACT (the CSS half lives in app/chrome.css):
//   • The hidden bar is `opacity:0` + `translateY(-100%)`, NOT `visibility:
//     hidden` and NOT `inert` — a keyboard user must still be able to tab to
//     it. `.immersbar.immersbar-hidden:focus-within` restores opacity so what
//     they land on is visible; the `focusin` wake below flips the STATE to
//     match, so CSS and React never disagree about whether the bar is showing.
//   • The hide is additionally SUPPRESSED (not just visually undone) while
//     focus is inside the bar or a popover in it is open — see `blocked()`.

import { useCallback, useEffect, useRef, useState } from "react";

/** Idle delay before the bar slides away — pointer devices (handoff :534). */
export const IMMERSIVE_AUTOHIDE_DESKTOP_MS = 3200;
/** Idle delay on touch — longer, because there is no hover to re-arm it. */
export const IMMERSIVE_AUTOHIDE_TOUCH_MS = 5000;
/**
 * Auto-hide is OFF below 640px. The handoff's comment is the whole rationale:
 * "phones: bar IS the nav" — there is no other way to leave an immersive route
 * on a phone, so hiding it would be a trap.
 */
export const IMMERSIVE_AUTOHIDE_WIDE_MQ = "(min-width: 640px)";
/** Touch-tier probe, chosen by the handoff for the longer delay. */
export const IMMERSIVE_AUTOHIDE_TOUCH_MQ = "(hover: none)";
/** Mouse wake band — a pointer this close to the top edge wants the bar. */
export const IMMERSIVE_AUTOHIDE_MOUSE_WAKE_Y = 70;
/** Touch wake band — tighter, so a scroll gesture doesn't summon the bar. */
export const IMMERSIVE_AUTOHIDE_TOUCH_WAKE_Y = 28;

export interface ImmersiveAutohide {
  /** True while the bar should be slid away. */
  hidden: boolean;
  /** Bring the bar back (the peek button's click handler). */
  show: () => void;
  /**
   * Attach to the bar's root element.
   *
   * The hook's brief was "returns `{ hidden, show }`", and this is the one
   * addition: the bar element is not optional equipment here. Three behaviors
   * need it — the `mouseenter` wake, the `focusin` wake, and the open-popover
   * gate — and routing them through the element the hook already owns beats
   * the alternative of a document-wide listener that re-derives "is this the
   * bar?" from a class name on every mousemove.
   */
  barRef: React.RefObject<HTMLDivElement | null>;
}

/** Subscribe to a media query, tolerating pre-2020 Safari's addListener. */
function onMediaChange(mq: MediaQueryList, handler: () => void): () => void {
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }
  mq.addListener(handler); // eslint-disable-line @typescript-eslint/no-deprecated
  return () => mq.removeListener(handler); // eslint-disable-line @typescript-eslint/no-deprecated
}

/**
 * The immersive bar's stillness timer.
 *
 * @param enabled — true only on an immersive route. When it goes false the bar
 * is forced back into view, so navigating away can never strand a hidden bar
 * on a surface that has no peek affordance.
 */
export function useImmersiveAutohide(enabled: boolean): ImmersiveAutohide {
  const [hidden, setHidden] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  /**
   * The live effect's `arm`, published so `show()` can restart the timer.
   *
   * `show` is a stable callback outside the effect and `arm` is a closure
   * inside it, so without this bridge `show()` reveals the bar and arms
   * nothing. §4a gate finding: revealing without re-arming strands the bar
   * visible forever.
   *
   * Today every real caller ALSO fires a global the effect listens for — the
   * peek tab is tapped (`touchstart` → `arm()`) or activated from the keyboard
   * (`keydown` → `wake()`) — so the timer does restart in the running app. That
   * is a coincidence of the current callers, not a property of `show`, and it
   * is exactly the kind of implicit coupling that breaks silently: a
   * programmatic wake, a synthetic click, an imperative handle, or a test
   * calling `show()` on its own gets a bar that never hides again. The
   * invariant belongs here, where it is local and explicit.
   *
   * Nulled by the effect's cleanup, so a late `show()` cannot resurrect a dead
   * timer. That null is NOT what makes a late `show()` safe on its own — the
   * `live` flag inside `arm()` already refuses to schedule anything after
   * teardown, and a mutation test removing the null alone stays green because
   * of it. It is kept for the second reason: the ref would otherwise hold
   * `arm`, and through it the whole effect closure — both MediaQueryLists, all
   * five listener functions and the bar element — alive for as long as the
   * component does.
   */
  const armRef = useRef<(() => void) | null>(null);
  const show = useCallback(() => {
    setHidden(false);
    armRef.current?.();
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Force-show on the way out (and on the way in, before anything arms).
      setHidden(false);
      return;
    }
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const wide = window.matchMedia(IMMERSIVE_AUTOHIDE_WIDE_MQ);
    const touch = window.matchMedia(IMMERSIVE_AUTOHIDE_TOUCH_MQ);
    let timer: ReturnType<typeof setTimeout> | null = null;
    // Guards every deferred `setHidden`: React clears the timer through the
    // cleanup below, but a callback already dequeued by the event loop cannot
    // be cancelled — and a hide that lands after navigation would set state on
    // a surface that has no way to undo it.
    let live = true;
    /**
     * Last input modality — keyboard or pointer. Feeds the focus gate below.
     *
     * TWO LIVE FAILURES ARE ENCODED HERE (2026-08-07 §4b pass), because the
     * obvious implementations both break auto-hide outright:
     *   1. `bar.contains(document.activeElement)` alone — a CLICK leaves the
     *      button focused, so one click on Tools disabled auto-hide for the
     *      whole session.
     *   2. `activeElement.matches(":focus-visible")` — closing that menu with
     *      Escape flips Chrome into keyboard modality, making the same button
     *      focus-visible, with the same permanent result.
     * Tracking modality directly fixes both: the moment the teacher goes back
     * to the mouse the gate releases, and a keyboard user idling in the bar
     * still keeps it.
     */
    let keyboardModality = false;

    const cancel = (): void => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    /**
     * Reasons the bar must stay put even though the timer fired.
     *
     * POPOVER GATE — the handoff checks one `dotsRef` because its compact bar
     * has exactly one menu. Ours has at least three (ChromeToolsMenu,
     * ChromeAccountMenu, and ViewTitle's style gear in the title slot), each
     * owning PRIVATE open state with no shared context, so there is nothing to
     * read without adding props to three components. We query the DOM for the
     * ARIA the disclosure pattern already requires instead: it costs one
     * querySelector on a ~3s timer, it needs no cooperation from the menus,
     * and — the real reason — it stays correct for the NEXT popover somebody
     * adds to this bar, which a lifted-state version would silently miss.
     *
     * FOCUS GATE — a keyboard user parked inside the bar keeps it. Hiding
     * under them would either steal their focus or (via
     * `.immersbar-hidden:focus-within` in chrome.css) leave the class and the
     * pixels disagreeing. Gated on MODALITY, not on focus alone — see
     * `keyboardModality` above for the two ways the naive versions failed
     * live — and paired with `dropStaleFocus` below, which clears pointer-left
     * focus so the CSS reveal cannot hold a hidden bar on screen forever.
     */
    const blocked = (): boolean => {
      const bar = barRef.current;
      if (!bar) return false;
      if (bar.querySelector('[aria-expanded="true"]')) return true;
      if (!keyboardModality) return false;
      const active = document.activeElement;
      return !!active && bar.contains(active);
    };

    /**
     * Clear pointer-planted focus from inside the bar just before it hides.
     *
     * Without this the bar hides in REACT but stays lit in CSS: a button the
     * teacher clicked minutes ago still satisfies `.immersbar-hidden:
     * focus-within`, so the bar sits at opacity 1 while `hidden` is true. Only
     * runs once `blocked()` has already cleared, so it never steals focus from
     * a keyboard user — the only focus it can find here is mouse residue.
     */
    const dropStaleFocus = (): void => {
      const bar = barRef.current;
      const active = document.activeElement as HTMLElement | null;
      if (!bar || !active || !bar.contains(active)) return;
      if (typeof active.blur === "function") active.blur();
    };

    const arm = (): void => {
      cancel();
      // Below 640px nothing is ever armed — see IMMERSIVE_AUTOHIDE_WIDE_MQ.
      if (!live || !wide.matches) return;
      const delay = touch.matches
        ? IMMERSIVE_AUTOHIDE_TOUCH_MS
        : IMMERSIVE_AUTOHIDE_DESKTOP_MS;
      timer = setTimeout(() => {
        timer = null;
        if (!live) return;
        // Re-arm rather than give up, so the bar still hides once the menu
        // closes or focus leaves — the handoff drops the timer here and needs
        // a fresh mousemove to recover.
        if (blocked()) {
          arm();
          return;
        }
        dropStaleFocus();
        setHidden(true);
      }, delay);
    };

    const wake = (): void => {
      setHidden(false);
      arm();
    };

    // Every handler records the modality FIRST — including the mousemoves that
    // do not wake. "The teacher went back to the mouse" is exactly the signal
    // that releases the focus gate, and most of those moves are below the wake
    // band.
    const onMouseMove = (event: MouseEvent): void => {
      keyboardModality = false;
      if (event.clientY < IMMERSIVE_AUTOHIDE_MOUSE_WAKE_Y) wake();
    };
    const onTouchStart = (event: TouchEvent): void => {
      keyboardModality = false;
      const y = event.touches?.[0]?.clientY;
      if (y != null && y < IMMERSIVE_AUTOHIDE_TOUCH_WAKE_Y) setHidden(false);
      // Handoff parity: any touch re-arms, only a top-edge touch reveals.
      arm();
    };
    const onKeyDown = (): void => {
      keyboardModality = true;
      wake();
    };
    /**
     * A mouse press is unambiguous pointer modality, and it is the ONE pointer
     * signal a click is guaranteed to produce (§4a finding).
     *
     * Without this the release path is `mousemove` only, which a click does not
     * imply: if the cursor is already resting on the control a teacher tabs to,
     * clicking it moves nothing. `keyboardModality` stays true, focus stays in
     * the bar, and `blocked()` re-arms forever — the bar never auto-hides again
     * until some unrelated mouse movement happens to release it. `dropStaleFocus`
     * cannot rescue that state either, because it only runs once `blocked()` has
     * already cleared.
     *
     * Safe for the keyboard user this gate exists to protect: they generate no
     * mousedown. Registered in the CAPTURE phase so a control that stops
     * propagation cannot swallow the modality signal. It deliberately does NOT
     * wake or arm — `mouseenter`/`focusin` already cover a press inside the bar,
     * and a press elsewhere on the page should not resurrect hidden chrome.
     */
    const onMouseDown = (): void => {
      keyboardModality = false;
    };
    const onWidthChange = (): void => {
      if (wide.matches) {
        arm();
      } else {
        // The handoff's bug: it never gets here, so a desktop→phone resize
        // leaves the bar hidden with no peek button (`.ib-peek` is display:none
        // ≤640px) and no top-edge hotzone on touch.
        cancel();
        setHidden(false);
      }
    };

    const bar = barRef.current;
    bar?.addEventListener("mouseenter", wake);
    bar?.addEventListener("focusin", wake);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onMouseDown, { capture: true });
    const offWide = onMediaChange(wide, onWidthChange);
    const offTouch = onMediaChange(touch, arm);
    // Publish `arm` for `show()` — see armRef's comment. Set alongside the
    // listeners and cleared with them, so the ref is non-null exactly while a
    // timer can legitimately be started.
    armRef.current = arm;
    arm();

    return () => {
      live = false;
      armRef.current = null;
      cancel();
      bar?.removeEventListener("mouseenter", wake);
      bar?.removeEventListener("focusin", wake);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("keydown", onKeyDown);
      // The capture flag is part of a listener's identity — removing without it
      // leaves the handler attached for the life of the page.
      window.removeEventListener("mousedown", onMouseDown, { capture: true });
      offWide();
      offTouch();
    };
  }, [enabled]);

  return { hidden, show, barRef };
}
