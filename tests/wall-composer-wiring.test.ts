import { describe, it, expect, vi, beforeEach } from "vitest";

import { ResourceWall } from "@/components/resource-wall-v2/ResourceWall";
import type { ResourceWallProps } from "@/components/resource-wall-v2/ResourceWall";
import type { Lesson, Unit } from "@/lib/types";
import { mountReact } from "./mount-react";

// A real react-dom/client mount plus a click sequence is genuinely slow — a few
// hundred ms per test in isolation, more under the full suite's parallel load.
// See the note in tests/wall-bg-fork.test.ts; every test here fails on an
// ASSERTION, never a timeout, when the wiring is mutated out.
vi.setConfig({ testTimeout: 30000 });

// Task #35, the WALL arm — /post's "Add note" opened a bare inline textarea
// ("Type a note…" + Done) instead of the app's shared ResourceComposer, which
// seven other surfaces already reach through components/composer. Wired to match
// the pattern landed in 951bc1a (Week card + Day pane).
//
// WHY A REAL CLICK. The composer is opened by an onClick handler.
// `renderToStaticMarkup` discards handlers, so a static render asserts only that
// a button exists — it would pass identically against the unwired build. The
// binding IS the change, so the test has to click.
//
// THE PAYLOAD IS THE ASSERTION, not "a composer opened". Three things about it
// are load-bearing and each has its own test: the lesson identity (a wall
// section can carry several lessons), `mode: "notecard"` (the button says "Add
// note"), and the ABSENCE of `initialSectionId` — a wall section is a lesson
// GROUP or a day column, never a lesson section, so passing one would file the
// resource into a section the teacher never chose. That is the precise mistake
// 951bc1a removed from the Week card, and the fixture below makes it detectable
// by giving the section a real `lessonIds` entry a regression could reach for.

const composerMock = vi.hoisted(() => ({
  available: true,
  opens: [] as {
    lessonId: string;
    mode?: string;
    sectionId?: string;
    hasCommitHook: boolean;
  }[],
}));

vi.mock("@/components/composer", () => ({
  useComposerOptional: () =>
    composerMock.available
      ? {
          openComposer: (opts: {
            lesson: { id: string };
            mode?: string;
            initialSectionId?: string;
            onCommitted?: () => void;
          }) => {
            composerMock.opens.push({
              lessonId: opts.lesson.id,
              mode: opts.mode,
              sectionId: opts.initialSectionId,
              hasCommitHook: typeof opts.onCommitted === "function",
            });
          },
          openResMenu: () => {},
          closeComposer: () => {},
        }
      : null,
}));

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

const ON_LESSON: Partial<ResourceWallProps> = {
  anchorKey: "l1||",
  focusLessonId: "l1",
  focusSubject: "math",
};

async function openWall() {
  const dom = await mountReact(ResourceWall);
  await dom.render(ON_LESSON);
  return dom;
}

const clickAddNote = (b: Element) => (b.textContent ?? "").includes("Add note");

beforeEach(() => {
  composerMock.available = true;
  composerMock.opens.length = 0;
  store.state = "settled";
  store.lessons = [LESSON];
  store.units = [UNIT];
});

describe("the Wall's Add note opens the shared composer", () => {
  it("opens it on the section's own lesson", async () => {
    const dom = await openWall();
    await dom.click(clickAddNote);
    expect(composerMock.opens).toHaveLength(1);
    expect(composerMock.opens[0].lessonId).toBe("l1");
    await dom.unmount();
  });

  it("opens in notecard mode, because the button says Add note", async () => {
    const dom = await openWall();
    await dom.click(clickAddNote);
    expect(composerMock.opens[0].mode).toBe("notecard");
    await dom.unmount();
  });

  it("passes NO initialSectionId — a wall section is not a lesson section", async () => {
    // The fixture's section carries a real lesson id, so a regression that
    // reached for one would have a value to file into and this would catch it.
    const dom = await openWall();
    await dom.click(clickAddNote);
    expect(composerMock.opens[0].sectionId).toBeUndefined();
    await dom.unmount();
  });

  it("passes a commit hook, so a frozen custom wall can absorb the result", async () => {
    // Without it, a commit on a teacher's own wall writes to the lesson and
    // shows nothing — the wall renders its `override` snapshot, not the live
    // projection.
    const dom = await openWall();
    await dom.click(clickAddNote);
    expect(composerMock.opens[0].hasCommitHook).toBe(true);
    await dom.unmount();
  });

  it("writes NOTHING to the wall on click — the composer commits, not the button", async () => {
    // The behavioural difference from the inline note, which seeded a blank
    // "Note" card into the layout (and auto-forked the wall) the instant it was
    // clicked. POSITIVE CONTROL: the click definitely happened, proven by the
    // open recorded above.
    const dom = await openWall();
    const before = dom.storage.get("cc_customwalls") ?? null;
    await dom.click(clickAddNote);
    expect(composerMock.opens).toHaveLength(1);
    expect(dom.storage.get("cc_customwalls") ?? null).toBe(before);
    await dom.unmount();
  });
});

describe("the fallback still works where the composer cannot", () => {
  it("falls back to the inline note outside a ComposerProvider", async () => {
    // /teach mounts no provider, and this component does not get to guarantee
    // the tree it is rendered into. The button must still do something.
    composerMock.available = false;
    const dom = await openWall();
    await dom.click(clickAddNote);
    expect(composerMock.opens).toHaveLength(0);
    // The inline note seeds a composing card, which forks the wall — visible as
    // the wall list gaining the teacher's copy.
    const walls = JSON.parse(dom.storage.get("cc_customwalls") ?? "[]") as unknown[];
    expect(walls).toHaveLength(1);
    await dom.unmount();
  });

  it("keeps the Add note button visible either way", async () => {
    // A missing provider must not hide the affordance here: unlike the Week
    // card there is no other route to a wall note, so hiding it would remove
    // the capability rather than degrade it.
    for (const available of [true, false]) {
      composerMock.available = available;
      const dom = await openWall();
      expect(dom.html()).toContain("Add note");
      await dom.unmount();
    }
  });
});
