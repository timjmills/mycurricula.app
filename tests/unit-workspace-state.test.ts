import { describe, it, expect, beforeEach } from "vitest";

import {
  openUnitWorkspace,
  closeUnitWorkspace,
  getUnitWorkspaceTarget,
  nextUnitWorkspaceHostId,
  claimUnitWorkspaceHost,
  releaseUnitWorkspaceHost,
  isUnitWorkspaceHostRenderer,
} from "@/components/year-v2/workspace-host/workspace-state";

// Pure-core tests for the global unit-workspace singleton (B5.1). The React
// wrappers (provider / host / the two subscriber hooks) are thin shells over
// these module-level primitives, and the node vitest harness cannot render
// React — so the open-target transitions and the single-renderer election are
// exercised here directly, which is where the real invariants live.

// The module holds process-wide state; every test starts from a closed
// workspace so ordering can't leak between them.
beforeEach(() => {
  closeUnitWorkspace();
});

describe("SSR safety", () => {
  it("imports and operates with no window (the whole suite is the proof)", () => {
    // The node environment has no `window`/`document`: had module scope or any
    // of the exercised functions touched one, the import above — or these calls
    // — would already have thrown.
    expect(typeof window).toBe("undefined");
    openUnitWorkspace("math", "u-m3");
    expect(getUnitWorkspaceTarget()).toEqual({
      subjectId: "math",
      unit: "u-m3",
    });
  });
});

describe("open target", () => {
  it("starts closed", () => {
    expect(getUnitWorkspaceTarget()).toBeNull();
  });

  it("opens on a (subject, unit) pair", () => {
    openUnitWorkspace("reading", "u-r1");
    expect(getUnitWorkspaceTarget()).toEqual({
      subjectId: "reading",
      unit: "u-r1",
    });
  });

  it("re-opening the SAME unit keeps the same target object", () => {
    openUnitWorkspace("math", "u-m3");
    const first = getUnitWorkspaceTarget();
    openUnitWorkspace("math", "u-m3");
    // Identity, not equality: a fresh object would emit to subscribers and
    // re-render the whole workspace on a click that changed nothing (the rail
    // reports the active unit on every click, including the one already open).
    expect(getUnitWorkspaceTarget()).toBe(first);
  });

  it("switching units replaces the target", () => {
    openUnitWorkspace("math", "u-m3");
    const first = getUnitWorkspaceTarget();
    openUnitWorkspace("math", "u-m4");
    expect(getUnitWorkspaceTarget()).not.toBe(first);
    expect(getUnitWorkspaceTarget()).toEqual({
      subjectId: "math",
      unit: "u-m4",
    });
  });

  it("distinguishes the same unit slug under different subjects", () => {
    // Unit slugs are only unique WITHIN a subject, so the subject is part of
    // the identity check — otherwise a same-slug unit in another subject would
    // be treated as already open and the switch would silently no-op.
    openUnitWorkspace("math", "u-1");
    const first = getUnitWorkspaceTarget();
    openUnitWorkspace("writing", "u-1");
    expect(getUnitWorkspaceTarget()).not.toBe(first);
    expect(getUnitWorkspaceTarget()?.subjectId).toBe("writing");
  });

  it("closes, and closing twice is a no-op", () => {
    openUnitWorkspace("sel", "u-s1");
    closeUnitWorkspace();
    expect(getUnitWorkspaceTarget()).toBeNull();
    closeUnitWorkspace();
    expect(getUnitWorkspaceTarget()).toBeNull();
  });

  it("re-opens after a close", () => {
    openUnitWorkspace("sel", "u-s1");
    closeUnitWorkspace();
    openUnitWorkspace("sel", "u-s1");
    expect(getUnitWorkspaceTarget()).toEqual({
      subjectId: "sel",
      unit: "u-s1",
    });
  });
});

describe("single-renderer election", () => {
  it("hands out unique ids", () => {
    const a = nextUnitWorkspaceHostId();
    const b = nextUnitWorkspaceHostId();
    expect(a).not.toBe(b);
  });

  it("elects the FIRST claimant and refuses the rest", () => {
    const a = nextUnitWorkspaceHostId();
    const b = nextUnitWorkspaceHostId();
    expect(claimUnitWorkspaceHost(a)).toBe(true);
    expect(claimUnitWorkspaceHost(b)).toBe(false);
    expect(isUnitWorkspaceHostRenderer(a)).toBe(true);
    expect(isUnitWorkspaceHostRenderer(b)).toBe(false);
    releaseUnitWorkspaceHost(a);
  });

  it("is idempotent for the current holder (StrictMode re-runs, re-renders)", () => {
    const a = nextUnitWorkspaceHostId();
    expect(claimUnitWorkspaceHost(a)).toBe(true);
    expect(claimUnitWorkspaceHost(a)).toBe(true);
    releaseUnitWorkspaceHost(a);
  });

  it("a losing host unmounting does NOT evict the renderer", () => {
    const a = nextUnitWorkspaceHostId();
    const b = nextUnitWorkspaceHostId();
    claimUnitWorkspaceHost(a);
    claimUnitWorkspaceHost(b);
    releaseUnitWorkspaceHost(b); // b never held the slot
    expect(isUnitWorkspaceHostRenderer(a)).toBe(true);
    releaseUnitWorkspaceHost(a);
  });

  it("frees the slot on the holder's release so a survivor re-elects", () => {
    const a = nextUnitWorkspaceHostId();
    const b = nextUnitWorkspaceHostId();
    claimUnitWorkspaceHost(a);
    expect(claimUnitWorkspaceHost(b)).toBe(false);
    releaseUnitWorkspaceHost(a);
    expect(isUnitWorkspaceHostRenderer(a)).toBe(false);
    // This is what the release's listener notification triggers in the hook.
    expect(claimUnitWorkspaceHost(b)).toBe(true);
    expect(isUnitWorkspaceHostRenderer(b)).toBe(true);
    releaseUnitWorkspaceHost(b);
  });

  it("a stale release from an already-replaced host cannot steal the slot", () => {
    // Ids are never reused, so an unmount effect that runs late (after another
    // host has claimed) matches nothing and leaves the live renderer alone.
    const a = nextUnitWorkspaceHostId();
    const b = nextUnitWorkspaceHostId();
    claimUnitWorkspaceHost(a);
    releaseUnitWorkspaceHost(a);
    claimUnitWorkspaceHost(b);
    releaseUnitWorkspaceHost(a); // late duplicate cleanup from the old host
    expect(isUnitWorkspaceHostRenderer(b)).toBe(true);
    releaseUnitWorkspaceHost(b);
  });

  it("leaves no holder once every host has released", () => {
    const a = nextUnitWorkspaceHostId();
    claimUnitWorkspaceHost(a);
    releaseUnitWorkspaceHost(a);
    expect(isUnitWorkspaceHostRenderer(a)).toBe(false);
    // A fresh host can then claim from scratch.
    const b = nextUnitWorkspaceHostId();
    expect(claimUnitWorkspaceHost(b)).toBe(true);
    releaseUnitWorkspaceHost(b);
  });
});
