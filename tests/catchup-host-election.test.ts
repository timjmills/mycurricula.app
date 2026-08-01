import { describe, it, expect, afterEach, vi } from "vitest";
import { act, createElement, type ReactNode } from "react";

import { mountReact } from "./mount-react";
import { CatchUpModalHost } from "@/components/catchup-v2";
// The election is an INTERNAL invariant of the singleton, so it is asserted
// against the module that owns it rather than through the barrel — the barrel
// deliberately keeps its surface to what app code may call.
import {
  closeCatchupModal,
  onCatchupRendererMissing,
  openCatchupModal,
  useCatchupModalOpen,
  useIsCatchupHostRenderer,
  type CatchupHostMount,
} from "@/components/catchup-v2/modal-state";

// A real react-dom/client mount is slow — the FIRST one in a file pays the
// dynamic `import("linkedom")` + `react-dom/client` cost, measured at 5.7s on
// an idle box and well past 20s when the other lanes are building. At the 5s
// default that first mount times out INSIDE `mount()`, which leaves the harness
// half-initialised and every later test failing on "overlapping act() calls"
// and `(absent)` nodes — one environment-shaped failure presented as seven
// behavioural ones. Raised deliberately, matching catchup-modal-clock-anchor.
// Every assertion here still fails on the ASSERTION when the behaviour is
// mutated out; that split is recorded in the task report.
vi.setConfig({ testTimeout: 30000 });

// The Catch-Up modal is rendered by a SINGLETON: several <CatchUpModalHost>
// instances can be mounted at once (ChromeShell mounts one app-wide, the
// /catch-up route mounts another), and exactly one of them may paint or the
// teacher gets two `aria-modal` dialogs and two focus traps.
//
// The election that enforces that is invisible by construction — a Host that
// loses renders `null`, which is byte-identical to a Host that is broken, to a
// Host whose module failed to load, and to no Host at all. That is the shape
// this file exists to close: it pins WHICH Host wins (so the answer cannot
// depend on effect ordering, which moves with Suspense boundaries), and it pins
// that "the modal is open and NOTHING is rendering it" is reported rather than
// swallowed.
//
// A live browser cannot see any of this. On screen, "no Host is elected" and
// "the bundle did not load" produce the same empty page — which is exactly how
// a dead dev chunk was read as a route defect (task #49). So the invariant is
// asserted here, deterministically, where the two are distinguishable.

/**
 * A stand-in Host that reports its election state WHETHER OR NOT the modal is
 * open. The real Host renders `null` in both the "lost" and the "won but
 * closed" cases, so it cannot tell them apart; this one can, and the binding
 * test below ties it back to the real component.
 */
function FakeHost({
  mount,
  label,
}: {
  mount: CatchupHostMount;
  label: string;
}): ReactNode {
  const elected = useIsCatchupHostRenderer(mount);
  const open = useCatchupModalOpen();
  return createElement("div", {
    "data-host": label,
    "data-elected": String(elected),
    "data-painting": String(elected && open),
  });
}

interface HostSpec {
  label: string;
  mount: CatchupHostMount;
  /** Mount the REAL exported Host instead of the stand-in. */
  real?: boolean;
}

/** A tree whose mounted Hosts are driven by props, so a re-render adds or
 *  removes one exactly as a navigation would. */
function Tree({ hosts }: { hosts: HostSpec[] }): ReactNode {
  return createElement(
    "div",
    null,
    hosts.map((h) =>
      h.real
        ? createElement(CatchUpModalHost, { key: h.label, mount: h.mount })
        : createElement(FakeHost, { key: h.label, mount: h.mount, label: h.label }),
    ),
  );
}

const elected = (dom: { query: (s: string) => Element | null }, label: string) =>
  dom.query(`[data-host="${label}"]`)?.getAttribute("data-elected") ?? "(absent)";
const painting = (dom: { query: (s: string) => Element | null }, label: string) =>
  dom.query(`[data-host="${label}"]`)?.getAttribute("data-painting") ?? "(absent)";

/** Flush a singleton mutation through React. The harness act-wraps `render`,
 *  but the app opens the modal from a module function, not from a prop. */
const flush = async (fn: () => void) => {
  await act(async () => {
    fn();
  });
};

/**
 * The live harness, torn down in `afterEach` rather than at the end of each
 * test body.
 *
 * That is not tidiness. A failed `expect` throws, so an inline `dom.unmount()`
 * NEVER RUNS on the one path where teardown matters most — and this singleton's
 * election, its open flag, and the harness's DOM globals are all module state
 * that then leaks into the next test. The first draft of this file did exactly
 * that: one genuine failure cascaded into two more that had nothing wrong with
 * them, which is a test suite reporting three bugs where there is one.
 */
let live: Awaited<ReturnType<typeof mountReact<{ hosts: HostSpec[] }>>> | null =
  null;

async function mount(hosts: HostSpec[]) {
  live = await mountReact(Tree);
  await live.render({ hosts });
  return live;
}

afterEach(async () => {
  if (live) {
    const dom = live;
    live = null;
    await dom.unmount();
  }
  // `open` is module state and outlives any one mount. A test that left it
  // true would hand the next one a modal it never opened.
  closeCatchupModal();
});

describe("exactly one Catch-Up Host paints", () => {
  it("elects one renderer out of three mounted Hosts", async () => {
    const dom = await mount([
      { label: "chrome", mount: "chrome" },
      { label: "route", mount: "route" },
      { label: "other", mount: "route" },
    ]);
    await flush(openCatchupModal);

    const painters = ["chrome", "route", "other"].filter(
      (l) => painting(dom, l) === "true",
    );
    // Both halves matter: THREE Hosts saw the open state (so the singleton
    // reached all of them), and exactly ONE painted. Without the first count,
    // "one painted" would also pass on a tree where two Hosts never mounted.
    expect(["chrome", "route", "other"].map((l) => elected(dom, l))).toHaveLength(3);
    expect(painters).toEqual(["chrome"]);
  });

  it("gives the chrome Host the slot even when it mounts AFTER a route Host", async () => {
    // The ordering that used to decide this. Effects run child-first and the
    // route body hydrates inside its own Suspense boundary, so which Host runs
    // its mount effect first is not a property anyone controls — under
    // first-come election the winner was whatever the boundary happened to do.
    // The chrome Host must win because it OUTLIVES every route: electing the
    // route's would tear the renderer down on the next navigation.
    const dom = await mount([{ label: "route", mount: "route" }]);
    expect(elected(dom, "route")).toBe("true");

    await dom.render({
      hosts: [
        { label: "route", mount: "route" },
        { label: "chrome", mount: "chrome" },
      ],
    });
    expect(elected(dom, "chrome")).toBe("true");
    expect(elected(dom, "route")).toBe("false");
  });

  it("re-elects a survivor when the renderer unmounts, without closing the modal", async () => {
    const dom = await mount([
      { label: "chrome", mount: "chrome" },
      { label: "route", mount: "route" },
    ]);
    await flush(openCatchupModal);
    expect(painting(dom, "chrome")).toBe("true");

    // The chrome Host goes away (a route group with its own shell).
    await dom.render({ hosts: [{ label: "route", mount: "route" }] });
    expect(painting(dom, "route")).toBe("true");
  });

  it("binds the REAL exported Host to the same election", async () => {
    // Guards against this whole file testing a stand-in that has drifted from
    // the component actually mounted in ChromeShell. The real Host renders
    // nothing while closed, so it cannot be read directly — but if it did not
    // participate, the stand-in beside it would be elected.
    const dom = await mount([
      { label: "real", mount: "chrome", real: true },
      { label: "fake", mount: "route" },
    ]);
    expect(elected(dom, "fake")).toBe("false");

    // POSITIVE CONTROL, same reading: alone, the stand-in IS elected. Without
    // it, "the fake lost" would also pass if the election were broken outright
    // and never elected anybody.
    await dom.render({ hosts: [{ label: "fake", mount: "route" }] });
    expect(elected(dom, "fake")).toBe("true");
  });
});

describe("an open modal with no renderer is reported, not swallowed", () => {
  it("reports when the modal is opened with no Host mounted", async () => {
    const reports: string[] = [];
    const off = onCatchupRendererMissing((m) => reports.push(m));
    // Mounted, but with zero Hosts — the state a route reaches when its own
    // Host is the only one and the chrome shell did not mount one.
    const dom = await mount([]);

    await flush(openCatchupModal);
    await new Promise((r) => setTimeout(r, 10));

    expect(reports).toHaveLength(1);
    expect(reports[0]).toMatch(/CatchUpModalHost/);

    off();
  });

  it("stays quiet when a Host IS rendering (control)", async () => {
    // The negative half. Without it the assertion above would also pass on an
    // implementation that reported unconditionally, which would be noise rather
    // than a signal — and noise gets muted.
    const reports: string[] = [];
    const off = onCatchupRendererMissing((m) => reports.push(m));
    const dom = await mount([{ label: "chrome", mount: "chrome" }]);

    await flush(openCatchupModal);
    await new Promise((r) => setTimeout(r, 10));

    expect(reports).toEqual([]);
    expect(painting(dom, "chrome")).toBe("true");

    off();
  });

  it("reports when the last Host unmounts while the modal is still open", async () => {
    // The silent-cancel shape that has no positive symptom at all: the modal is
    // open, the state says so, and the thing that was drawing it is gone.
    const reports: string[] = [];
    const off = onCatchupRendererMissing((m) => reports.push(m));
    const dom = await mount([{ label: "chrome", mount: "chrome" }]);
    await flush(openCatchupModal);
    expect(painting(dom, "chrome")).toBe("true");

    await dom.render({ hosts: [] });
    await new Promise((r) => setTimeout(r, 10));

    expect(reports).toHaveLength(1);

    off();
  });
});
