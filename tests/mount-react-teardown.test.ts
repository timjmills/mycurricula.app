import { describe, it, expect } from "vitest";
import { createElement } from "react";

import { mountReact } from "./mount-react";

// A test for the INSTRUMENT, not for the app.
//
// tests/mount-react.ts installs `window`, `document`, `navigator` and a frame
// loop as process globals so react-dom/client can run. vitest reuses a worker
// across test files, so if a mount leaked those globals, every later
// `renderToStaticMarkup` assertion in that worker would run against a CLIENT
// environment. A component that crashes without `window`, or that renders
// different markup on the server, would pass anyway — and this repo's SSR
// contract (CLAUDE.md §4: the first client paint must match the server HTML)
// is exactly the kind of thing asserted that way.
//
// That failure is order-dependent and always points at a false green, which is
// the single most expensive bug class in this codebase. So the harness's
// teardown gets its own test rather than being taken on trust.

/** Minimal component — this file is testing the harness, not any app surface. */
const Probe = () => createElement("div", { id: "probe" }, "mounted");

/** The globals the harness installs. `navigator` is excluded on purpose: node
 *  ships its own, so "absent before, absent after" is not the property there —
 *  it is covered by the restore-to-previous check below instead. */
const INSTALLED = [
  "window",
  "document",
  "HTMLElement",
  "MutationObserver",
  "IS_REACT_ACT_ENVIRONMENT",
] as const;

function present(): string[] {
  return INSTALLED.filter((k) => k in globalThis);
}

describe("the mount harness leaves the environment as it found it", () => {
  it("installs the DOM globals on mount and removes them on unmount", async () => {
    // The positive control. Without this the test would pass in a world where
    // `mountReact` installed nothing at all and the harness was inert — the
    // absence assertion at the end FAILS OPEN on its own.
    expect(present()).toEqual([]);

    const dom = await mountReact(Probe);
    await dom.render({});
    expect(present()).toEqual([...INSTALLED]);
    expect(dom.html()).toContain("mounted");

    await dom.unmount();
    expect(present()).toEqual([]);
  });

  it("restores a pre-existing global rather than deleting it", async () => {
    // `navigator` exists in node before any mount, and the harness overwrites it
    // with linkedom's. Teardown must put the ORIGINAL back — a blanket delete
    // would strip a global the runtime supplied, breaking later tests in a way
    // that looks nothing like this harness.
    const before = globalThis.navigator;
    expect(before).toBeDefined();

    const dom = await mountReact(Probe);
    await dom.render({});
    expect(globalThis.navigator).not.toBe(before);

    await dom.unmount();
    expect(globalThis.navigator).toBe(before);
  });

  it("survives a second mount/unmount cycle in the same file", async () => {
    // Restoring from a snapshot taken DURING a previous mount would pin the
    // linkedom globals permanently — the leak this test exists to prevent,
    // reintroduced one level down. Two cycles catch it; one does not.
    for (let i = 0; i < 2; i++) {
      const dom = await mountReact(Probe);
      await dom.render({});
      expect(present()).toEqual([...INSTALLED]);
      await dom.unmount();
      expect(present()).toEqual([]);
    }
  });
});
