import { describe, it, expect, vi, afterEach } from "vitest";
import { createElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { mountReact } from "./mount-react";
import {
  useImmersiveAutohide,
  IMMERSIVE_AUTOHIDE_DESKTOP_MS,
  IMMERSIVE_AUTOHIDE_TOUCH_MS,
  IMMERSIVE_AUTOHIDE_WIDE_MQ,
  IMMERSIVE_AUTOHIDE_TOUCH_MQ,
} from "@/components/chrome/use-immersive-autohide";

// The immersive bar's idle auto-hide (docs/audits/2026-07-31-post-teach-catchup-
// shell.md finding A1 — the `hidden` prop and its CSS shipped in W3.3 with no
// caller, so nothing hid, woke, or peeked).
//
// WHY A HOOK PROBE AND NOT ChromeShell. ChromeShell drags in usePathname, the
// planner store, the edit-mode provider, the Catch-Up host and two popovers;
// mounting that here would test the providers, not the timer. The probe below
// renders the ONE thing the hook touches — a bar element to attach the ref to —
// so every assertion is about the hook.
//
// FAKE TIMERS, scoped. `toFake` is restricted to setTimeout/clearTimeout on
// purpose: React 19's scheduler drains through MessageChannel, and faking the
// whole timer surface would freeze `act()` mid-flush and hang the suite rather
// than fail it.

vi.setConfig({ testTimeout: 30000 });

// ── Media-query harness ────────────────────────────────────────────────────
// mount-react's stub answers `matches: false` to everything, which would read
// as "narrow viewport" and disable auto-hide in every test. This replaces it
// with a controllable one that also RECORDS listeners, so a test can fire a
// breakpoint change the way a real resize does.

interface MediaState {
  wide: boolean;
  touch: boolean;
}

interface MediaHarness {
  set: (next: Partial<MediaState>) => void;
  /** How many change listeners are currently registered across all queries. */
  listenerCount: () => number;
}

function installMatchMedia(state: MediaState): MediaHarness {
  const w = (globalThis as unknown as { window: Record<string, unknown> })
    .window;
  const listeners = new Map<string, Set<() => void>>();

  const answer = (query: string): boolean => {
    if (query === IMMERSIVE_AUTOHIDE_WIDE_MQ) return state.wide;
    if (query === IMMERSIVE_AUTOHIDE_TOUCH_MQ) return state.touch;
    return false;
  };

  w.matchMedia = (query: string) => ({
    get matches() {
      return answer(query);
    },
    media: query,
    addEventListener: (_type: string, handler: () => void) => {
      const set = listeners.get(query) ?? new Set();
      set.add(handler);
      listeners.set(query, set);
    },
    removeEventListener: (_type: string, handler: () => void) => {
      listeners.get(query)?.delete(handler);
    },
  });

  return {
    set(next) {
      Object.assign(state, next);
      for (const set of listeners.values()) {
        for (const handler of [...set]) handler();
      }
    },
    listenerCount() {
      let n = 0;
      for (const set of listeners.values()) n += set.size;
      return n;
    },
  };
}

// ── The probe ──────────────────────────────────────────────────────────────

function Probe({ enabled }: { enabled: boolean }): ReactNode {
  const { hidden, show, barRef } = useImmersiveAutohide(enabled);
  return createElement(
    "div",
    null,
    createElement(
      "div",
      {
        ref: barRef,
        className: "immersbar" + (hidden ? " immersbar-hidden" : ""),
        "data-testid": "bar",
      },
      // A focusable child, so `focusin` and the focus gate have a real target.
      createElement("button", { type: "button", "data-testid": "back" }, "Back"),
      // The popover trigger — the disclosure ARIA the hook gates on.
      createElement(
        "button",
        {
          type: "button",
          "data-testid": "menu",
          "aria-expanded": "false",
        },
        "Tools",
      ),
    ),
    hidden
      ? createElement(
          "button",
          { type: "button", className: "ib-peek", onClick: show },
          "Show the top bar",
        )
      : null,
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function win(): {
  dispatchEvent: (e: unknown) => boolean;
  Event: new (type: string, init?: { bubbles?: boolean }) => Event;
} {
  return (
    globalThis as unknown as {
      window: {
        dispatchEvent: (e: unknown) => boolean;
        Event: new (type: string, init?: { bubbles?: boolean }) => Event;
      };
    }
  ).window;
}

/** Advance fake timers inside `act` so the resulting setState is flushed. */
async function advance(ms: number): Promise<void> {
  const { act } = await import("react");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function fireWindow(
  type: string,
  props: Record<string, unknown> = {},
): Promise<void> {
  const { act } = await import("react");
  const w = win();
  await act(async () => {
    const event = new w.Event(type);
    Object.assign(event, props);
    w.dispatchEvent(event);
  });
}

async function fireOn(
  el: Element,
  type: string,
  bubbles = true,
): Promise<void> {
  const { act } = await import("react");
  const w = win();
  await act(async () => {
    el.dispatchEvent(new w.Event(type, { bubbles }));
  });
}

const isHidden = (h: { query: (s: string) => Element | null }): boolean =>
  !!h.query(".immersbar-hidden");

/**
 * Stub `document.activeElement`.
 *
 * linkedom has no focus model at all — `document.activeElement` stays
 * `undefined` even after `focus()` (measured; see
 * tests/weekly-list-add.test.ts:333) — so the hook's focus gate is untestable
 * here without this. Returns the undo.
 */
function focusStub(el: Element): () => void {
  const doc = (globalThis as unknown as { document: object }).document;
  const prior = Object.getOwnPropertyDescriptor(doc, "activeElement");
  Object.defineProperty(doc, "activeElement", { value: el, configurable: true });
  return () => {
    if (prior) Object.defineProperty(doc, "activeElement", prior);
    else delete (doc as unknown as Record<string, unknown>)["activeElement"];
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useImmersiveAutohide", () => {
  it("hides after the desktop idle timeout, and not one tick early", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const h = await mountReact(Probe);
    installMatchMedia({ wide: true, touch: false });
    await h.render({ enabled: true });

    expect(isHidden(h)).toBe(false);
    await advance(IMMERSIVE_AUTOHIDE_DESKTOP_MS - 1);
    expect(isHidden(h)).toBe(false);
    await advance(1);
    expect(isHidden(h)).toBe(true);

    await h.unmount();
  });

  it("uses the longer touch delay when the pointer cannot hover", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const h = await mountReact(Probe);
    installMatchMedia({ wide: true, touch: true });
    await h.render({ enabled: true });

    // Still visible at the DESKTOP delay — the touch tier gets 5000ms.
    await advance(IMMERSIVE_AUTOHIDE_DESKTOP_MS);
    expect(isHidden(h)).toBe(false);
    await advance(IMMERSIVE_AUTOHIDE_TOUCH_MS - IMMERSIVE_AUTOHIDE_DESKTOP_MS);
    expect(isHidden(h)).toBe(true);

    await h.unmount();
  });

  it("never hides below 640px — on a phone the bar IS the nav", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const h = await mountReact(Probe);
    installMatchMedia({ wide: false, touch: true });
    await h.render({ enabled: true });

    await advance(IMMERSIVE_AUTOHIDE_TOUCH_MS * 3);
    expect(isHidden(h)).toBe(false);

    await h.unmount();
  });

  it("un-hides when a desktop→phone resize crosses 640px (the handoff's bug)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const h = await mountReact(Probe);
    const media = installMatchMedia({ wide: true, touch: false });
    await h.render({ enabled: true });

    await advance(IMMERSIVE_AUTOHIDE_DESKTOP_MS);
    expect(isHidden(h)).toBe(true);

    // The handoff's effect deps are [compact, barAutoHide, view], so it never
    // re-runs on a resize and leaves the bar hidden here — with no peek tab
    // (display:none ≤640px) and no hover hotzone. We subscribe to the MQ.
    const { act } = await import("react");
    await act(async () => {
      media.set({ wide: false });
    });
    expect(isHidden(h)).toBe(false);

    // And it stays visible: nothing re-arms below the breakpoint.
    await advance(IMMERSIVE_AUTOHIDE_DESKTOP_MS * 2);
    expect(isHidden(h)).toBe(false);

    await h.unmount();
  });

  it("wakes on a mousemove near the top edge, and ignores one further down", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const h = await mountReact(Probe);
    installMatchMedia({ wide: true, touch: false });
    await h.render({ enabled: true });

    await advance(IMMERSIVE_AUTOHIDE_DESKTOP_MS);
    expect(isHidden(h)).toBe(true);

    // Mid-page movement is the teacher working — it must NOT summon the bar.
    await fireWindow("mousemove", { clientY: 400 });
    expect(isHidden(h)).toBe(true);

    await fireWindow("mousemove", { clientY: 12 });
    expect(isHidden(h)).toBe(false);

    // And the wake re-arms, so it hides again after another idle period.
    await advance(IMMERSIVE_AUTOHIDE_DESKTOP_MS);
    expect(isHidden(h)).toBe(true);

    await h.unmount();
  });

  it("wakes on focusin inside the bar (not in the handoff — keyboard users)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const h = await mountReact(Probe);
    installMatchMedia({ wide: true, touch: false });
    await h.render({ enabled: true });

    await advance(IMMERSIVE_AUTOHIDE_DESKTOP_MS);
    expect(isHidden(h)).toBe(true);

    const back = h.query('[data-testid="back"]');
    expect(back).not.toBeNull();
    await fireOn(back as Element, "focusin");
    expect(isHidden(h)).toBe(false);

    await h.unmount();
  });

  it("wakes on any keydown (not in the handoff — the bar is the only nav)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const h = await mountReact(Probe);
    installMatchMedia({ wide: true, touch: false });
    await h.render({ enabled: true });

    await advance(IMMERSIVE_AUTOHIDE_DESKTOP_MS);
    expect(isHidden(h)).toBe(true);

    await fireWindow("keydown", { key: "Tab" });
    expect(isHidden(h)).toBe(false);

    await h.unmount();
  });

  it("does not hide while a popover inside the bar is open", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const h = await mountReact(Probe);
    installMatchMedia({ wide: true, touch: false });
    await h.render({ enabled: true });

    const menu = h.query('[data-testid="menu"]');
    expect(menu).not.toBeNull();
    (menu as Element).setAttribute("aria-expanded", "true");

    // Two full idle periods — the gate re-arms rather than giving up.
    await advance(IMMERSIVE_AUTOHIDE_DESKTOP_MS * 2);
    expect(isHidden(h)).toBe(false);

    // Close it and the very next idle period hides the bar, proving the gate
    // suppressed the hide rather than the timer simply never running.
    (menu as Element).setAttribute("aria-expanded", "false");
    await advance(IMMERSIVE_AUTOHIDE_DESKTOP_MS);
    expect(isHidden(h)).toBe(true);

    await h.unmount();
  });

  it("does not hide while a KEYBOARD user is focused inside the bar", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const h = await mountReact(Probe);
    installMatchMedia({ wide: true, touch: false });
    await h.render({ enabled: true });

    const back = h.query('[data-testid="back"]') as Element;
    const restore = focusStub(back);
    try {
      await fireWindow("keydown", { key: "Tab" }); // keyboard modality
      await advance(IMMERSIVE_AUTOHIDE_DESKTOP_MS * 2);
      expect(isHidden(h)).toBe(false);
    } finally {
      restore();
    }

    await h.unmount();
  });

  it("DOES hide over pointer-planted focus, blurring it on the way out", async () => {
    // Caught by the live §4b pass, twice over. Clicking any bar control leaves
    // it focused, so a containment-only gate killed auto-hide for the whole
    // session; gating on `:focus-visible` instead did the same thing the
    // moment the teacher pressed Escape to close the menu. Focus alone is not
    // consent — and `.immersbar-hidden:focus-within` in chrome.css would have
    // pinned the bar at opacity 1 even once the state flipped, so the stale
    // focus has to be cleared rather than merely ignored.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const h = await mountReact(Probe);
    installMatchMedia({ wide: true, touch: false });
    await h.render({ enabled: true });

    const back = h.query('[data-testid="back"]') as Element;
    let blurred = false;
    (back as unknown as { blur: () => void }).blur = () => {
      blurred = true;
    };
    const restore = focusStub(back);
    try {
      await advance(IMMERSIVE_AUTOHIDE_DESKTOP_MS);
      expect(isHidden(h)).toBe(true);
      expect(blurred).toBe(true);
    } finally {
      restore();
    }

    await h.unmount();
  });

  it("releases the focus gate as soon as the teacher goes back to the mouse", async () => {
    // The exact live failure: Escape closes a bar menu (keyboard modality,
    // focus still on the trigger) and the bar then never hid again. A
    // mousemove — even one far below the wake band — is proof the keyboard
    // user has moved on.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const h = await mountReact(Probe);
    installMatchMedia({ wide: true, touch: false });
    await h.render({ enabled: true });

    const back = h.query('[data-testid="back"]') as Element;
    (back as unknown as { blur: () => void }).blur = () => {};
    const restore = focusStub(back);
    try {
      await fireWindow("keydown", { key: "Escape" });
      await advance(IMMERSIVE_AUTOHIDE_DESKTOP_MS * 2);
      expect(isHidden(h)).toBe(false);

      // Well below the 70px wake band — this must NOT reveal the bar, only
      // clear the modality.
      await fireWindow("mousemove", { clientY: 500 });
      expect(isHidden(h)).toBe(false);
      await advance(IMMERSIVE_AUTOHIDE_DESKTOP_MS);
      expect(isHidden(h)).toBe(true);
    } finally {
      restore();
    }

    await h.unmount();
  });

  it("releases the focus gate on a CLICK, which need not move the mouse", async () => {
    // Same stuck state as the test above, reached by the one route a mousemove
    // does not cover (§4a). If the cursor is already resting on the control the
    // teacher tabs to, pressing it moves nothing — no mousemove is emitted, so
    // a mousemove-only release leaves the modality keyboard, focus in the bar,
    // and `blocked()` re-arming forever. Note there is deliberately NO
    // mousemove anywhere in this test; that absence IS the test.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const h = await mountReact(Probe);
    installMatchMedia({ wide: true, touch: false });
    await h.render({ enabled: true });

    const back = h.query('[data-testid="back"]') as Element;
    (back as unknown as { blur: () => void }).blur = () => {};
    const restore = focusStub(back);
    try {
      await fireWindow("keydown", { key: "Tab" });
      await advance(IMMERSIVE_AUTOHIDE_DESKTOP_MS * 2);
      expect(isHidden(h)).toBe(false);

      // The press itself must not reveal or re-arm — `mouseenter`/`focusin`
      // own that — so the bar stays visible only until the pending timer runs.
      await fireWindow("mousedown", { button: 0 });
      expect(isHidden(h)).toBe(false);
      await advance(IMMERSIVE_AUTOHIDE_DESKTOP_MS);
      expect(isHidden(h)).toBe(true);
    } finally {
      restore();
    }

    await h.unmount();
  });

  it("the peek button brings a hidden bar back", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const h = await mountReact(Probe);
    installMatchMedia({ wide: true, touch: true });
    await h.render({ enabled: true });

    await advance(IMMERSIVE_AUTOHIDE_TOUCH_MS);
    expect(isHidden(h)).toBe(true);
    expect(h.query(".ib-peek")).not.toBeNull();

    await h.click((el) => el.className === "ib-peek");
    expect(isHidden(h)).toBe(false);
    expect(h.query(".ib-peek")).toBeNull();

    await h.unmount();
  });

  it("the peek button also RE-ARMS the timer, on its own", async () => {
    // §4a gate finding. `show` is a stable callback outside the effect and
    // `arm` is a closure inside it, so `show()` used to reveal the bar and arm
    // nothing.
    //
    // In the running app the bar still re-hid, because every real activation
    // of the peek tab ALSO fires a global the effect listens for — a tap fires
    // `touchstart` (arms unconditionally) and a keyboard activation fires
    // `keydown` (wakes, which arms). Verified live before the fix, not assumed.
    // But that is a property of today's callers, not of `show`, so this test
    // deliberately isolates it: the harness dispatches a bare `click`, with no
    // touchstart, no keydown and no mousemove. Pre-fix it went red here.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const h = await mountReact(Probe);
    installMatchMedia({ wide: true, touch: true });
    await h.render({ enabled: true });

    await advance(IMMERSIVE_AUTOHIDE_TOUCH_MS);
    expect(isHidden(h)).toBe(true);

    await h.click((el) => el.className === "ib-peek");
    expect(isHidden(h)).toBe(false);

    // The whole point: no further input at all, and it hides again.
    await advance(IMMERSIVE_AUTOHIDE_TOUCH_MS);
    expect(isHidden(h)).toBe(true);

    await h.unmount();
  });

  it("show() cannot arm a timer once the effect is torn down", async () => {
    // The flip side of the fix: `show` now reaches into the effect, so it has
    // to stop reaching the moment that effect is gone. Otherwise a late call
    // schedules a hide against a surface that is no longer immersive and has
    // no peek tab to undo it.
    //
    // Tested by disabling rather than unmounting: mount-react restores the DOM
    // globals inside `unmount()`, so any post-unmount `setHidden` throws
    // `window is not defined` from React's scheduler — a harness artifact that
    // would mask the actual assertion.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const captured: { show: (() => void) | null } = { show: null };
    function Capture({ enabled }: { enabled: boolean }): ReactNode {
      const api = useImmersiveAutohide(enabled);
      captured.show = api.show;
      return createElement("div", {
        ref: api.barRef,
        className: "immersbar" + (api.hidden ? " immersbar-hidden" : ""),
      });
    }
    const h = await mountReact(Capture);
    installMatchMedia({ wide: true, touch: false });
    await h.render({ enabled: true });
    expect(vi.getTimerCount()).toBe(1);

    await h.render({ enabled: false });
    expect(vi.getTimerCount()).toBe(0);

    const { act } = await import("react");
    await act(async () => {
      captured.show?.();
    });
    expect(vi.getTimerCount()).toBe(0);
    await advance(IMMERSIVE_AUTOHIDE_DESKTOP_MS * 2);
    expect(isHidden(h)).toBe(false);

    await h.unmount();
  });

  it("is inert when disabled, and force-shows on the way out", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const h = await mountReact(Probe);
    installMatchMedia({ wide: true, touch: false });

    // Disabled from the start: no timer at all.
    await h.render({ enabled: false });
    await advance(IMMERSIVE_AUTOHIDE_DESKTOP_MS * 2);
    expect(isHidden(h)).toBe(false);

    // Enabled → hides. Then navigating OFF an immersive route must restore it,
    // or the teacher lands on a corner-grammar surface with no bar and no peek.
    await h.render({ enabled: true });
    await advance(IMMERSIVE_AUTOHIDE_DESKTOP_MS);
    expect(isHidden(h)).toBe(true);

    await h.render({ enabled: false });
    expect(isHidden(h)).toBe(false);

    await h.unmount();
  });

  it("cancels the pending hide on unmount — no setState after teardown", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const h = await mountReact(Probe);
    installMatchMedia({ wide: true, touch: false });
    await h.render({ enabled: true });

    // Arm, then tear down mid-flight. A timer that survived would fire into an
    // unmounted tree — React logs, and worse, the harness has already restored
    // the globals so the callback runs against a DOM-less environment.
    await advance(IMMERSIVE_AUTOHIDE_DESKTOP_MS - 100);
    await h.unmount();

    expect(vi.getTimerCount()).toBe(0);

    const errors: unknown[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...args) => void errors.push(args));
    await vi.advanceTimersByTimeAsync(IMMERSIVE_AUTOHIDE_DESKTOP_MS);
    spy.mockRestore();
    expect(errors).toEqual([]);
  });

  it("removes every window and media listener on teardown", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const h = await mountReact(Probe);

    // Count the hook's own window listeners by wrapping the window BEFORE it
    // renders. A leaked `mousemove` handler fires on every pointer move for
    // the rest of the session and calls setState on a dead tree — and after
    // teardown the globals are restored, so counting is the only way to see
    // it. (Media-query listeners are counted by the harness itself.)
    const w = (
      globalThis as unknown as {
        window: {
          addEventListener: (t: string, h: unknown, o?: unknown) => void;
          removeEventListener: (t: string, h: unknown, o?: unknown) => void;
        };
      }
    ).window;
    const WATCHED = ["mousemove", "touchstart", "keydown", "mousedown"];
    const live = new Map<string, number>();
    const realAdd = w.addEventListener.bind(w);
    const realRemove = w.removeEventListener.bind(w);
    /**
     * Key by type AND capture phase, because the capture flag is part of a
     * listener's IDENTITY: `removeEventListener("x", fn)` does not remove a
     * listener added with `{ capture: true }`, and that handler then survives
     * for the life of the page.
     *
     * Keying by type alone made this test blind to exactly that — verified by
     * mutation: dropping `{ capture: true }` from the `mousedown` removal left
     * a permanently leaked listener and all 23 tests still passed, because the
     * stub decremented on the call rather than on the effect. Keyed this way
     * the mismatch shows up as an unbalanced pair.
     */
    const key = (t: string, o?: unknown): string =>
      `${t}:${typeof o === "boolean" ? o : !!(o as { capture?: boolean } | undefined)?.capture}`;
    w.addEventListener = (t, fn, o) => {
      if (WATCHED.includes(t)) live.set(key(t, o), (live.get(key(t, o)) ?? 0) + 1);
      realAdd(t, fn, o);
    };
    w.removeEventListener = (t, fn, o) => {
      if (WATCHED.includes(t)) live.set(key(t, o), (live.get(key(t, o)) ?? 0) - 1);
      realRemove(t, fn, o);
    };

    const media = installMatchMedia({ wide: true, touch: false });
    await h.render({ enabled: true });
    // Derived from WATCHED rather than a hard-coded [1, 1, 1]: the literal had
    // to be edited by hand every time a listener was added, and the version
    // that forgets to is a silently NARROWER leak test, not a failing one. A
    // type that is never registered leaves no entry at all, so the arrays are
    // different lengths and this still bites.
    expect([...live.values()]).toEqual(WATCHED.map(() => 1));
    expect(media.listenerCount()).toBe(2);

    await h.unmount();
    expect([...live.values()]).toEqual(WATCHED.map(() => 0));
    expect(media.listenerCount()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    w.addEventListener = realAdd;
    w.removeEventListener = realRemove;
  });
});

// ── The JS/CSS breakpoint contract ─────────────────────────────────────────
//
// Auto-hide (JS) and the peek tab (CSS) are two halves of one rule: below the
// breakpoint the bar never hides, at or above it the bar hides and touch users
// get a visible way back. The two live in different languages and different
// files, so nothing but a test keeps them from drifting apart — and the
// specific drift is expensive rather than cosmetic.
//
// §4a gate finding: both ranges were originally INCLUSIVE of 640
// (`min-width: 640px` in JS, `max-width: 640px` in CSS), leaving a
// one-pixel-wide tier at exactly 640 CSS px where a touch-only device hid its
// only nav and rendered no peek button. The teacher's only recovery would have
// been a blind touch above y=28 — an affordance they cannot see. The handoff
// has the same overlap (compact-bar.css:55 vs `innerWidth < 640`).
//
// Asserted against the CSS SOURCE, because vitest has no layout engine and
// cannot evaluate a media query. The live browser check at exactly 640px under
// touch emulation lives in scripts/tmp/probe-f2-immersive.mjs (§4b).
describe("auto-hide / peek breakpoint contract", () => {
  const css = readFileSync(
    fileURLToPath(new URL("../app/chrome.css", import.meta.url)),
    "utf8",
  );

  /**
   * The scope both peek `display` rules MUST carry, spelled out on purpose.
   *
   * ⚠ THIS PIN IS THE ASSERTION, not incidental strictness. The A2 fix widened
   * the selector from `.overlay .ib-peek` to `:is(.overlay, .immersbar-host)
   * .ib-peek` because `/teach` mounts the bar WITHOUT ChromeShell's `.overlay`
   * (that recipe insets 30px and clips a 100dvh workspace). `.immersbar-host`
   * is therefore the only thing that makes these rules reach Teach at all.
   *
   * Both regexes below briefly matched the prefix as `[^{}]*` — widened so they
   * would survive that very rewrite. That FAILED OPEN: a revert to
   * `.overlay .ib-peek` would strand a Teach touch user with a hidden bar and
   * no visible peek recovery, while `[^{}]*` happily matched the planner-only
   * rule and every test stayed green. Matching the scope is the point; if it
   * legitimately changes again, these SHOULD fail and be re-read.
   */
  const PEEK_SCOPE = String.raw`:is\(\.overlay, \.immersbar-host\)`;

  /** The `@media (max-width: …)` that hides the peek tab. */
  const peekFloor = css.match(
    new RegExp(
      String.raw`@media \(max-width:\s*([\d.]+)px\)\s*\{\s*${PEEK_SCOPE} \.ib-peek\s*\{\s*display:\s*none;`,
    ),
  );
  /** The `(min-width: …)` the hook arms above. */
  const wideFloor = IMMERSIVE_AUTOHIDE_WIDE_MQ.match(
    /min-width:\s*([\d.]+)px/,
  );
  /** The media query that REVEALS the peek tab — the device-capability gate. */
  const peekGate = css.match(
    new RegExp(
      String.raw`@media \(([^)]+)\)\s*\{\s*${PEEK_SCOPE} \.ib-peek\s*\{\s*display:\s*grid;`,
    ),
  );

  it("all three gates are actually found in the source", () => {
    // Fails CLOSED. Without this the assertions below would silently compare
    // `undefined` and pass on a stylesheet that no longer has the rule at all —
    // the failure mode this whole file is written against.
    expect(
      peekFloor,
      "no `@media (max-width: …) { :is(.overlay, .immersbar-host) .ib-peek { display: none } }` in app/chrome.css — either the rule was renamed/reformatted/removed, or its scope was narrowed back to `.overlay`, which would strand /teach",
    ).not.toBeNull();
    expect(
      peekGate,
      "no `@media (…) { :is(.overlay, .immersbar-host) .ib-peek { display: grid } }` in app/chrome.css — either the reveal rule is gone/reformatted, or its scope was narrowed back to `.overlay`, leaving a Teach touch user with a hidden bar and no visible way back",
    ).not.toBeNull();
    expect(wideFloor).not.toBeNull();
  });

  it("NO peek/exit rule is scoped to `.overlay` alone", () => {
    // The sharp invariant, and deliberately not a COUNT. A first attempt here
    // asserted ">= 5 scoped rules"; there are six, so reverting any single one
    // left five and the mutant survived. Counting is the wrong question.
    //
    // This is the right one: `:is(.overlay, .immersbar-host) .ib-peek` does not
    // CONTAIN the substring `.overlay .ib-peek` (it reads `.overlay,` then `)`
    // then ` .ib-peek`), so a literal search for the unscoped form matches
    // exactly the reverted rules and nothing else. It catches a partial revert
    // of ANY of the six, stays correct when a seventh is added, and needs no
    // maintenance.
    //
    // Why it matters: /teach renders the bar outside `.overlay`, so
    // `.immersbar-host` is its only route into these rules. Lose the base rule
    // and the peek tab drops to `position:static; display:inline-block` — an
    // in-flow 18px line box that displaced the whole workspace and pushed the
    // writing bar below the fold (measured). Lose the reveal rule and a touch
    // user gets a hidden bar with no visible way back.
    expect(
      css.includes(".overlay .ib-peek"),
      "a `.ib-peek` rule is scoped to `.overlay` alone again — /teach mounts the bar outside `.overlay`, so that rule no longer reaches it",
    ).toBe(false);
    expect(
      css.includes(".overlay .ib-exit"),
      "the `.ib-exit` rule is scoped to `.overlay` alone again — on /teach the round glass Back circle degrades to a bare chevron",
    ).toBe(false);
  });

  it("the peek tab is revealed for ANY touch-capable device, hybrids included", () => {
    // §4a gate finding, and the most consequential one in this lane.
    //
    // The handoff gates the peek tab on `(hover: none)` — "no hovering pointer
    // exists", i.e. a pure phone or tablet. A touchscreen laptop or 2-in-1 has
    // a trackpad, so it reports `hover: hover` and matched NOTHING: auto-hide
    // fired (it is well past 640px) and no peek tab rendered. A teacher using
    // that machine by touch lost their only nav with no visible way back.
    // School-managed hardware is full of convertibles, so this is a normal
    // configuration rather than an edge case.
    //
    // `any-pointer: coarse` is the correct question — "is there a touch input
    // at all?" — and is true for pure-touch AND hybrid devices.
    const gate = peekGate![1].replace(/\s+/g, " ").trim();
    expect(gate).toBe("any-pointer: coarse");
    // Stated as its own assertion so a regression to the handoff's value fails
    // with the reason attached rather than as an opaque string mismatch.
    expect(
      gate,
      "the peek tab is gated on `hover: none` again — that excludes every touchscreen laptop and 2-in-1, which still auto-hide and would be left with no visible way to recover the bar",
    ).not.toBe("hover: none");
  });

  it("the timing gate stays on (hover: none) — a hybrid keeps the pointer delay", () => {
    // Deliberately NOT widened alongside the peek tab. A hybrid has a real
    // pointer, so the 3200ms pointer delay is right for it; only the
    // visibility of the recovery control needed to cover touch-capable
    // hardware. Asserted so the two gates cannot be "tidied" into agreement.
    expect(IMMERSIVE_AUTOHIDE_TOUCH_MQ).toBe("(hover: none)");
  });

  it("the peek tab is hidden STRICTLY below the width auto-hide starts at", () => {
    const peekMax = Number(peekFloor![1]);
    const wideMin = Number(wideFloor![1]);
    // Strictly less, not <=: at any width where auto-hide can fire, a touch
    // user must have a visible way back.
    expect(peekMax).toBeLessThan(wideMin);
  });

  it("exactly at the breakpoint, a touch device keeps its peek tab", () => {
    const peekMax = Number(peekFloor![1]);
    const wideMin = Number(wideFloor![1]);
    // The regression, stated as the width it actually bit at.
    const autoHidesAt640 = wideMin <= 640;
    const peekHiddenAt640 = peekMax >= 640;
    expect(autoHidesAt640 && peekHiddenAt640).toBe(false);
  });
});
