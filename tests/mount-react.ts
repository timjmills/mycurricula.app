// A real React mount over a linkedom document, so EFFECTS ACTUALLY RUN.
//
// WHY THIS EXISTS. vitest runs `environment: "node"` and the repo has no jsdom
// (and adding one would be a new dependency — CLAUDE.md §6). `react-dom/server`
// covers snapshots, but a whole class of bug here is a TRANSITION: state seeded
// once and never re-resolved, a value written under an identity that changes in
// the same action, a cleanup that never runs. `renderToStaticMarkup` renders one
// pass and runs no effects, so it cannot see any of them.
//
// react-dom/client only needs a DOM good enough to create elements and delegate
// events, and linkedom — already a dependency, for lib/sanitize-html's server
// path — is. What it lacks is patched below, each with the reason.
//
// The globals are installed lazily, per mount, AND TORN DOWN BY `unmount()`, so
// a `renderToStaticMarkup` server render really does run with no `window` in
// scope — before the first mount, and again after any mount is disposed.
//
// The teardown is not housekeeping. vitest reuses a worker across test files, so
// a mount that leaked its globals would leave every later SSR assertion running
// against a CLIENT environment: a component that crashes without `window`, or
// that renders different markup on the server, would pass anyway. The failure is
// order-dependent and always in the direction of a false green — so `unmount()`
// restores each property to exactly what was there before (deleting the ones
// that were absent), and tests must call it.

import { createElement, type ComponentType } from "react";

export interface ReactHarness<P> {
  /** Render (or re-render) the component with these props, flushing effects. */
  render: (props: P) => Promise<void>;
  /** Click the first BUTTON matching, flushing effects. Throws if none match —
   *  a harness that silently clicks nothing passes every assertion. */
  click: (match: (el: Element) => boolean) => Promise<void>;
  /** The mounted markup. */
  html: () => string;
  /** First element matching a CSS selector, or null. */
  query: (selector: string) => Element | null;
  /** Every element matching a CSS selector. */
  queryAll: (selector: string) => Element[];
  /** Click a specific element the caller already holds, flushing effects. For
   *  the cases where "the first button matching" is not precise enough — e.g.
   *  the LAST of several identically-labelled controls. */
  clickElement: (el: Element) => Promise<void>;
  /** Double-click an element, flushing effects. */
  dblClick: (el: Element) => Promise<void>;
  /**
   * Type into a controlled input/textarea, flushing effects.
   *
   * Not just `el.value = x`: React installs a value TRACKER on every controlled
   * field and drops the change event when the tracked value looks unchanged, so
   * a naive assignment updates the DOM and never reaches `onChange` — the field
   * appears to accept input while the component's state never moves, and a test
   * built on it asserts against a component that received nothing.
   */
  setValue: (el: Element, value: string) => Promise<void>;
  /**
   * Press Escape on the first element matching the selector, bubbling.
   * linkedom ships no KeyboardEvent constructor, so the key is attached to a
   * plain Event — which is all React's synthetic layer reads.
   */
  pressEscape: (selector: string) => Promise<void>;
  /** The mount's isolated localStorage, readable by the test. */
  storage: Map<string, string>;
  /** Unmount and restore the globals. ASYNC and must be awaited: React's
   *  scheduler drains through a macrotask, and restoring the DOM globals while
   *  work is still queued throws out of the scheduler (test passes, suite exits
   *  non-zero). Awaiting lets `act` flush that work first. */
  unmount: () => Promise<void>;
}

/** A localStorage good enough for the app's own guarded reads/writes: the app
 *  wraps every access in try/catch, so WITHOUT this every write silently no-ops
 *  and a persistence test proves nothing. */
function makeStorage(store: Map<string, string>): Storage {
  return {
    get length() {
      return store.size;
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  } as Storage;
}

export async function mountReact<P extends object>(
  Component: ComponentType<P>,
): Promise<ReactHarness<P>> {
  const { parseHTML } = await import("linkedom");
  const dom = parseHTML(
    "<!doctype html><html><body><div id='root'></div></body></html>",
  );
  const g = globalThis as unknown as Record<string, unknown>;
  const w = dom.window as unknown as Record<string, unknown>;
  const store = new Map<string, string>();

  // Snapshot before we touch anything, so teardown can put back exactly what was
  // there — including "it was absent", which must become a delete and not an
  // `undefined` that still answers `"window" in globalThis`.
  const GLOBAL_KEYS = [
    "window",
    "document",
    "HTMLElement",
    "Element",
    "Node",
    "MutationObserver",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "IS_REACT_ACT_ENVIRONMENT",
    "navigator",
    "getComputedStyle",
  ] as const;
  const saved = new Map<string, PropertyDescriptor | undefined>(
    GLOBAL_KEYS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
  );
  const restoreGlobals = () => {
    for (const [k, desc] of saved) {
      if (desc) Object.defineProperty(globalThis, k, desc);
      else delete (globalThis as unknown as Record<string, unknown>)[k];
    }
  };

  // react-dom/client reads window.location.protocol at import time (its DevTools
  // banner); usePhoneViewport calls window.matchMedia on mount; wall-state and
  // the tooltip-dismissal store read window.localStorage. linkedom ships none.
  w.location = { protocol: "http:", href: "http://localhost/" };
  w.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  w.localStorage = makeStorage(store);
  g.window = dom.window;
  g.document = dom.document;
  g.HTMLElement = dom.HTMLElement;
  g.Element = dom.Element;
  g.Node = dom.Node;
  g.MutationObserver = dom.MutationObserver;
  // linkedom has no frame loop; toasts and popovers schedule through one.
  g.requestAnimationFrame = (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 0) as unknown as number;
  g.cancelAnimationFrame = (id: number) => clearTimeout(id);
  g.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(globalThis, "navigator", {
    value: dom.navigator,
    configurable: true,
  });

  // linkedom implements no layout, so it ships none of the scroll APIs. Real
  // components call them from mount effects (components/day-v2/DayA.tsx:78
  // scrolls the selected row into view), and without a stub that effect THROWS
  // and the whole mount fails — which pushes the component back to a static
  // render, i.e. back to exactly the untestable state this harness exists to
  // fix. A no-op is FAITHFUL here, not a fudge: there is no viewport, nothing
  // is visible, and no test can or does assert that anything scrolled.
  //
  // Not in the teardown snapshot, and deliberately so: this patches LINKEDOM's
  // own Element prototype, not a node global. It is reachable only through a
  // linkedom element, which exists only inside a mount — so unlike the globals
  // above there is nothing here a later `renderToStaticMarkup` could run
  // against.
  const ElementProto = dom.Element.prototype as unknown as Record<
    string,
    unknown
  >;
  if (typeof ElementProto.scrollIntoView !== "function") {
    ElementProto.scrollIntoView = () => {};
  }

  // linkedom has no style engine either, and components read resolved custom
  // properties from mount effects (components/hub-v2/timeline/use-column-metrics.ts
  // reads `--tl-col-floor` / `--tl-col-base`).
  //
  // This returns "" for EVERY property, on purpose. A stub handing back
  // plausible numbers would be the worst possible shape here: a test could
  // assert a width and pass against a value this file invented, which is the
  // "fallback that satisfies the assertion" trap. "" parses to NaN, every
  // caller in this repo guards with `Number.isFinite`, and so a computed-style
  // assertion is impossible rather than merely discouraged. Geometry belongs in
  // a browser probe (CLAUDE.md §4b), never here.
  const emptyStyle = {
    getPropertyValue: () => "",
  } as unknown as CSSStyleDeclaration;
  g.getComputedStyle = () => emptyStyle;
  w.getComputedStyle = () => emptyStyle;

  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const container = dom.document.getElementById("root") as unknown as HTMLElement;
  const root = createRoot(container);

  return {
    async render(props: P) {
      await act(async () => {
        root.render(createElement(Component, props));
      });
    },
    async click(match) {
      const target = Array.from(dom.document.querySelectorAll("button")).find(
        (b) => match(b as unknown as Element),
      );
      if (!target) throw new Error("no button matched — the harness is lying");
      await act(async () => {
        // linkedom ships no MouseEvent constructor; a bubbling Event of type
        // "click" is enough for React's delegated root listener, which reads the
        // type and the target and synthesises the rest.
        target.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
      });
    },
    html: () => container.innerHTML,
    query: (selector) => container.querySelector(selector),
    queryAll: (selector) => Array.from(container.querySelectorAll(selector)),
    async clickElement(el) {
      await act(async () => {
        el.dispatchEvent(new dom.window.Event("click", { bubbles: true }));
      });
    },
    async dblClick(el) {
      await act(async () => {
        el.dispatchEvent(new dom.window.Event("dblclick", { bubbles: true }));
      });
    },
    async setValue(el, value) {
      await act(async () => {
        // Clear React's value tracker first — see the interface doc. The field
        // is private API, so this is guarded rather than assumed present.
        const tracked = el as unknown as {
          _valueTracker?: { setValue: (v: string) => void };
          value?: string;
        };
        // ORDER IS LOAD-BEARING, and the obvious order is the broken one.
        // React tracks a controlled field by REPLACING its `value` property
        // with a getter/setter that records every write. Priming the tracker
        // BEFORE assigning re-syncs it through that very setter: React
        // compares the two, finds them equal, and discards the event as a
        // no-op. The field updates on screen and `onChange` never fires, so a
        // test types into a component that receives nothing and asserts
        // against its initial state. Measured on a control component, not
        // theorised.
        tracked.value = value;
        el.setAttribute("value", value);
        tracked._valueTracker?.setValue(`${value} stale`);
        el.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
      });
    },
    async pressEscape(selector) {
      const target = container.querySelector(selector);
      if (!target) throw new Error("no element matched — the harness is lying");
      await act(async () => {
        const ev = new dom.window.Event("keydown", { bubbles: true });
        (ev as unknown as { key: string }).key = "Escape";
        target.dispatchEvent(ev);
      });
    },
    storage: store,
    // Unmount inside `act` — cleanup effects still need the DOM globals, and
    // `act` drains the scheduler's queued macrotask work before returning. Only
    // once that is empty is it safe to put the environment back.
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      restoreGlobals();
    },
  };
}
