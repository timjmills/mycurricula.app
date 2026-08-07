// <html data-dense="1"> — the route-derived cinematics suppressor.
//
// WHAT THIS PINS. `app/themes.css` stops `.stage::before` drifting via
// `:root[data-dense="1"] .stage::before { animation: none }`. The CSS is inert
// unless something actually writes the attribute, and the writer
// (components/stage/DenseRouteFlag.tsx) is a render-null leaf: it produces no
// markup, so a snapshot test cannot see it and a broken emitter would leave the
// CSS silently dead with nothing on screen to show for it. The only observable
// is the `<html>` attribute, and it is only written from a mount EFFECT — so
// this needs a real mount, not `renderToStaticMarkup`.
//
// ── Why the positive control is not optional ──────────────────────────────
// Two of the three assertions here are ABSENCES ("/home has no data-dense",
// "unmount removes it"), and an absence FAILS OPEN: it passes just as happily
// against a component that throws on mount, against a mock that made
// `usePathname` return nothing, or against a harness whose linkedom document
// has no working `dataset` at all. So the dense-route case runs FIRST and in
// the same file: it must PRODUCE the attribute. If that one goes red the two
// absences carry no information, and the failure says so out loud.
//
// MUTATION-TESTED. Inverting the emitter's branch (`delete` on a dense route /
// set on /home) turns the dense case red on the produced value; deleting the
// effect's cleanup turns the unmount case red. Both were observed failing
// before this file was accepted — see the lane report.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mountReact, type ReactHarness } from "./mount-react";

// 30s, matching the other mount-based suites in this repo (see
// vitest.config.ts): a real React mount breaches the 5s default under parallel
// lane load. Not a hang mask — every assertion below fails on a VALUE when the
// emitter is mutated, not on a timeout.
vi.setConfig({ testTimeout: 30000 });

const state = vi.hoisted(() => ({ pathname: "/weekly" as string | null }));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
}));

/** The `<html>` element the mounted component writes to. */
function htmlEl(): Element {
  const doc = (globalThis as unknown as { document?: Document }).document;
  // The harness installs `globalThis.document` per mount and tears it down in
  // `unmount()`. If it is missing, the mount never happened — throw loudly
  // rather than let an absence assertion pass against a component that was
  // never rendered at all.
  if (!doc?.documentElement) {
    throw new Error(
      "no document.documentElement — the mount harness is not installed",
    );
  }
  return doc.documentElement as unknown as Element;
}

describe("DenseRouteFlag — <html data-dense>", () => {
  let harness: ReactHarness<Record<string, never>> | null = null;

  beforeEach(() => {
    state.pathname = "/weekly";
    harness = null;
  });

  afterEach(async () => {
    await harness?.unmount();
    harness = null;
  });

  it('POSITIVE CONTROL — sets data-dense="1" on a dense route', async () => {
    const { DenseRouteFlag } = await import("@/components/stage");
    state.pathname = "/weekly";
    harness = await mountReact(DenseRouteFlag as never);
    await harness.render({});

    // The whole file rests on this one producing a value. If it is red, the
    // absences below are meaningless — read this failure first.
    expect(htmlEl().getAttribute("data-dense")).toBe("1");
  });

  it("sets it on /teach — the surface ChromeShell could not have reached", async () => {
    // Not redundant with the case above. The reason this component lives in
    // app/layout.tsx rather than ChromeShell is that ChromeShell is not mounted
    // on /teach (app/(teach)/layout.tsx mounts data providers only), and Teach
    // is one of the densest surfaces in the app. A future refactor that moved
    // the emitter back into the planner chrome would still pass the /weekly
    // case and silently lose Teach; this pins it.
    const { DenseRouteFlag } = await import("@/components/stage");
    state.pathname = "/teach";
    harness = await mountReact(DenseRouteFlag as never);
    await harness.render({});

    expect(htmlEl().getAttribute("data-dense")).toBe("1");
  });

  it('leaves the attribute ABSENT on /home — never the string "0"', async () => {
    const { DenseRouteFlag } = await import("@/components/stage");
    state.pathname = "/home";
    harness = await mountReact(DenseRouteFlag as never);
    await harness.render({});

    // Absent, not "0". The handoff's app.jsx writes '0'; we mirror ChromeShell's
    // `data-mode` set-or-delete idiom instead so the resting DOM on the one
    // cinematic route stays byte-identical to the pre-change markup.
    expect(htmlEl().hasAttribute("data-dense")).toBe(false);
    expect(htmlEl().getAttribute("data-dense")).not.toBe("0");
  });

  it("follows a client navigation from /home to a dense route and back", async () => {
    const { DenseRouteFlag } = await import("@/components/stage");
    state.pathname = "/home";
    harness = await mountReact(DenseRouteFlag as never);
    await harness.render({});
    expect(htmlEl().hasAttribute("data-dense")).toBe(false);

    // App Router navigation re-renders the same mounted leaf with a new
    // pathname; the effect must re-run and flip the flag, not latch its first
    // answer. A seeded-once emitter would pass every static case above.
    state.pathname = "/daily";
    await harness.render({});
    expect(htmlEl().getAttribute("data-dense")).toBe("1");

    state.pathname = "/home";
    await harness.render({});
    expect(htmlEl().hasAttribute("data-dense")).toBe(false);
  });

  it("cleans up on unmount — the resting DOM keeps no stale flag", async () => {
    const { DenseRouteFlag } = await import("@/components/stage");
    state.pathname = "/year";
    const h = await mountReact(DenseRouteFlag as never);
    harness = h;
    await h.render({});
    // Positive control for THIS assertion: prove the attribute was there to be
    // removed, so the post-unmount absence is a fact about cleanup and not
    // about the mount having failed.
    expect(htmlEl().getAttribute("data-dense")).toBe("1");

    const root = htmlEl();
    await h.unmount();
    harness = null;

    expect(root.hasAttribute("data-dense")).toBe(false);
  });
});
