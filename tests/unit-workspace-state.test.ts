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

describe("lesson focus (B5.7)", () => {
  it("carries the focused lesson on the target", () => {
    openUnitWorkspace("math", "u-m3", "m-12-0");
    expect(getUnitWorkspaceTarget()).toEqual({
      subjectId: "math",
      unit: "u-m3",
      focusLessonId: "m-12-0",
    });
  });

  it("opens a lesson with NO unit", () => {
    // The case that decides whether the workspace can replace a lesson popup:
    // every in-app-created lesson starts unfiled (planner-store addLesson
    // passes `unit: ""`). If this could not open, "Open in editor" would dead-
    // end on exactly the lessons a teacher just made.
    openUnitWorkspace("writing", "", "new-lesson-1");
    expect(getUnitWorkspaceTarget()).toEqual({
      subjectId: "writing",
      unit: "",
      focusLessonId: "new-lesson-1",
    });
  });

  it("omits the key entirely for a unit open", () => {
    // Not `focusLessonId: undefined` — the absent key is what tells the host
    // to render the unit roll-up, and it keeps the unit-entry target shape
    // byte-identical to before B5.7.
    openUnitWorkspace("math", "u-m3");
    expect("focusLessonId" in (getUnitWorkspaceTarget() ?? {})).toBe(false);
  });

  it("re-opening the SAME lesson keeps the same target object", () => {
    openUnitWorkspace("math", "u-m3", "m-12-0");
    const first = getUnitWorkspaceTarget();
    openUnitWorkspace("math", "u-m3", "m-12-0");
    expect(getUnitWorkspaceTarget()).toBe(first);
  });

  it("switching lessons WITHIN the open unit replaces the target", () => {
    // The identity check has to include the lesson: without it, opening a
    // second lesson in the unit already on screen would no-op and the
    // workspace would silently keep showing the first one.
    openUnitWorkspace("math", "u-m3", "m-12-0");
    const first = getUnitWorkspaceTarget();
    openUnitWorkspace("math", "u-m3", "m-12-1");
    expect(getUnitWorkspaceTarget()).not.toBe(first);
    expect(getUnitWorkspaceTarget()?.focusLessonId).toBe("m-12-1");
  });

  it("opening the unit itself drops a focus the target was carrying", () => {
    // Rail navigation calls the 2-arg form. Landing on the unit a lesson was
    // focused in must show the unit, not silently keep the lesson.
    openUnitWorkspace("math", "u-m3", "m-12-0");
    openUnitWorkspace("math", "u-m3");
    expect(getUnitWorkspaceTarget()?.focusLessonId).toBeUndefined();
  });
});

describe("target lifetime vs host lifetime", () => {
  it("the target SURVIVES the last host releasing", () => {
    // Deliberate, and the reason clearing lives in the provider instead: hosts
    // are transiently absent during a re-election — the holder unmounts before
    // the survivor claims — so tying the target to host presence would close the
    // workspace on an ordinary re-render. `UnitWorkspaceProvider`'s unmount
    // effect is what clears it, which is also what stops a target outliving the
    // planner route group and re-opening the dialog unbidden on return.
    openUnitWorkspace("math", "u-m3");
    const id = nextUnitWorkspaceHostId();
    claimUnitWorkspaceHost(id);
    releaseUnitWorkspaceHost(id);
    expect(isUnitWorkspaceHostRenderer(id)).toBe(false);
    expect(getUnitWorkspaceTarget()).toEqual({
      subjectId: "math",
      unit: "u-m3",
    });
  });

  it("closeUnitWorkspace leaves nothing behind for a later mount to read", () => {
    openUnitWorkspace("math", "u-m3", "m-12-0");
    closeUnitWorkspace();
    // Not just falsy — strictly null, because `useUnitWorkspaceTarget()` reads
    // this value in a mount effect and renders whatever it finds.
    expect(getUnitWorkspaceTarget()).toBeNull();
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
