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
