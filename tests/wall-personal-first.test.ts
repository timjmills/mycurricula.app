import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  ResourceWall,
  personalWallFor,
  type ResourceWallProps,
} from "@/components/resource-wall-v2/ResourceWall";
import type { CustomWall } from "@/components/resource-wall-v2/wall-state";
import type { Lesson, Unit } from "@/lib/types";
import { mountReact } from "./mount-react";

// A real react-dom/client mount plus a click sequence is genuinely slow — a few
// hundred ms per test in isolation. vitest's 5s default is comfortable for that,
// but NOT under the full suite's parallel load, where CPU contention stretched
// these past it and turned correct tests red (seen: 7 timeouts in one `vitest
// run`, all green when the file ran alone). Raised deliberately for slow-but-
// honest work; it does not mask a hang, because every one of these tests fails
// on an assertion — never a timeout — when the fix under test is mutated out.
vi.setConfig({ testTimeout: 30000 });

// Task #40 — /post reopened the SHARED preset on every load, so a teacher's own
// forked wall never came back and its section backgrounds read as lost.
//
// MEASURED BEFORE THE FIX, on /post?lesson=m-11-1:
//   pin    {"hasBg":true,  "wall":"My Current Lesson", secbg:["cc_secbg_cwd534e058-…"]}
//   reload {"hasBg":false, "wall":"Current Lesson",    secbg:["cc_secbg_cwd534e058-…"]}
// The record survives; the wall that addresses it is never reopened. Nothing is
// lost, but it is unreachable without navigating back by hand — which is worse
// than a plain failure, because it looks like data loss.
//
// The fix is CLAUDE.md §2 personal-first viewing applied to walls: open the
// teacher's fork of whichever wall the URL selects. It stores no new state — the
// forks are already persisted — so there is no "last wall id" that can dangle.
//
// A DELETED wall therefore needs no special case, and the test below proves it:
// a deleted fork is simply absent from the list, so the rule finds nothing and
// the preset stands. That is the "falls back to the preset, not a blank screen"
// requirement, satisfied structurally rather than by a guard someone can drop.

const store = vi.hoisted(() => ({
  state: "settled" as "pending" | "error" | "settled",
  lessons: [] as Lesson[],
  units: [] as Unit[],
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({ lessons: store.lessons, units: store.units }),
  usePlannerDataState: () => store.state,
}));

vi.mock("@/lib/app-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/app-state")>()),
  useAppState: () => ({ week: 1 }),
}));

const LESSON = {
  id: "l1",
  subject: "math",
  unit: "u1",
  title: "Fractions on a number line",
  week: 1,
  day: 0,
  status: "planned",
  archived: false,
  modified: false,
  resources: [{ type: "link", label: "Number line applet", url: "https://x.test/n" }],
  standards: [],
} as unknown as Lesson;

const UNIT = { id: "u1", subject: "math", name: "Unit 1", weeks: "Wk 1" } as unknown as Unit;

/** A saved fork of a preset, as `ensurePersonal` writes it. */
function fork(over: Partial<CustomWall> = {}): CustomWall {
  return {
    id: "cw-lesson-1",
    name: "My Current Lesson",
    anchor: "forked",
    forkedFrom: "Current Lesson",
    layout: [],
    view: "med",
    created: 1000,
    ...over,
  };
}

const WALLS_KEY = "cc_customwalls";

/** Seed the wall list the way a previous session left it. The component reads
 *  this in its mount effect, so it must be in storage BEFORE the first render. */
function seedWalls(storage: Map<string, string>, walls: CustomWall[]): void {
  storage.set(WALLS_KEY, JSON.stringify(walls));
}

/** The deep link the reload lands on — the same URL that produced the measured
 *  failure above. */
const ON_LESSON: Partial<ResourceWallProps> = {
  anchorKey: "l1||",
  focusLessonId: "l1",
  focusSubject: "math",
};

function wallName(dom: { query: (s: string) => Element | null }): string {
  const el = dom.query('[class*="ddName"]');
  if (!el) throw new Error("no wall name on screen — the harness is lying");
  return el.textContent ?? "";
}

beforeEach(() => {
  store.state = "settled";
  store.lessons = [LESSON];
  store.units = [UNIT];
});

// ── The rule, as a pure function ────────────────────────────────────────────

describe("personalWallFor", () => {
  it("finds the teacher's fork of the preset", () => {
    expect(personalWallFor("lesson", [fork()])?.name).toBe("My Current Lesson");
  });

  it("returns null when they have not forked that preset", () => {
    // The wall exists but belongs to a DIFFERENT preset — the case that would
    // silently open the wrong wall if the label were not compared.
    expect(personalWallFor("today", [fork()])).toBeNull();
  });

  it("returns null for an empty list — a deleted fork is simply absent", () => {
    expect(personalWallFor("lesson", [])).toBeNull();
  });

  it("ignores a DUPLICATE of a fork", () => {
    // `duplicateWall` marks a copy `unanchored` but carries `forkedFrom`
    // forward, so matching on the label alone would auto-open a side branch the
    // teacher made deliberately rather than their working version.
    const copy = fork({ id: "cw-copy", name: "Copy of My Current Lesson", anchor: "unanchored", created: 9999 });
    expect(personalWallFor("lesson", [copy])).toBeNull();
  });

  it("prefers the newest when a preset has been forked twice", () => {
    const older = fork({ id: "cw-old", name: "My Current Lesson", created: 10 });
    const newer = fork({ id: "cw-new", name: "My Current Lesson (2)", created: 20 });
    expect(personalWallFor("lesson", [older, newer])?.id).toBe("cw-new");
    // Order-independent: the rule reads `created`, not list position.
    expect(personalWallFor("lesson", [newer, older])?.id).toBe("cw-new");
  });
});

// ── The rule, wired into the real component ─────────────────────────────────

describe("a reload lands on the teacher's own wall, not the team's", () => {
  it("opens the fork when one is stored", async () => {
    const dom = await mountReact(ResourceWall);
    seedWalls(dom.storage, [fork()]);
    await dom.render(ON_LESSON);
    expect(wallName(dom)).toBe("My Current Lesson");
    await dom.unmount();
  });

  it("stays on the shared preset when the teacher has no fork", async () => {
    // The positive control for the assertion above: without it, a component that
    // opened SOMETHING for everyone would pass the first test.
    const dom = await mountReact(ResourceWall);
    seedWalls(dom.storage, []);
    await dom.render(ON_LESSON);
    expect(wallName(dom)).toBe("Current Lesson");
    await dom.unmount();
  });

  it("stays on the preset when the fork belongs to another wall", async () => {
    const dom = await mountReact(ResourceWall);
    seedWalls(dom.storage, [fork({ forkedFrom: "This Week · Mixed", name: "My This Week" })]);
    await dom.render(ON_LESSON);
    expect(wallName(dom)).toBe("Current Lesson");
    await dom.unmount();
  });

  it("does not open the fork while the store is still hydrating", async () => {
    // The interaction that makes this rule dangerous if ungated. Mid-hydrate the
    // deep-linked lesson has not resolved, so `anchored` is still "today";
    // opening a fork then is STICKY, because landing on a custom wall latches
    // `teacherChoseWall` and would disarm the anchor follow before the real
    // anchor ever arrives.
    const dom = await mountReact(ResourceWall);
    seedWalls(dom.storage, [fork({ forkedFrom: "Today's Lessons (Mixed)", name: "My Today" })]);
    store.state = "pending";
    store.lessons = [];
    await dom.render({ ...ON_LESSON, focusLessonId: null, focusSubject: null });
    expect(wallName(dom)).toBe("Today's Lessons (Mixed)");
    await dom.unmount();
  });

  it("opens the fork once the hydrate settles the anchor", async () => {
    // The other half of the same sequence, and the one a teacher actually sees:
    // pending → settled, and only then does their wall come back.
    const dom = await mountReact(ResourceWall);
    seedWalls(dom.storage, [fork()]);
    store.state = "pending";
    store.lessons = [];
    await dom.render({ ...ON_LESSON, focusLessonId: null, focusSubject: null });
    expect(wallName(dom)).toBe("Today's Lessons (Mixed)");

    store.state = "settled";
    store.lessons = [LESSON];
    await dom.render(ON_LESSON);
    expect(wallName(dom)).toBe("My Current Lesson");
    await dom.unmount();
  });

  it("leaves a teacher who has picked a wall by hand where they are", async () => {
    const dom = await mountReact(ResourceWall);
    seedWalls(dom.storage, [fork()]);
    store.state = "pending";
    store.lessons = [];
    await dom.render({ ...ON_LESSON, focusLessonId: null, focusSubject: null });

    await dom.click((b) => b.getAttribute("aria-expanded") === "false");
    await dom.click((b) => b.textContent === "This Week · Mixed");
    expect(wallName(dom)).toBe("This Week · Mixed");

    store.state = "settled";
    store.lessons = [LESSON];
    await dom.render(ON_LESSON);
    expect(wallName(dom)).toBe("This Week · Mixed");
    await dom.unmount();
  });

  it("opening the fork does not fork it again", async () => {
    // Opening a wall must never mint one (CLAUDE.md §2 — the fork happens on
    // EDIT). A second entry in storage would mean this rule was writing.
    const dom = await mountReact(ResourceWall);
    seedWalls(dom.storage, [fork()]);
    await dom.render(ON_LESSON);
    expect(wallName(dom)).toBe("My Current Lesson");

    const saved = JSON.parse(dom.storage.get(WALLS_KEY) ?? "[]") as CustomWall[];
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe("cw-lesson-1");
    await dom.unmount();
  });
});
