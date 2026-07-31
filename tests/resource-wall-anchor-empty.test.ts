import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ResourceWall,
  anchoredPreset,
  shouldFollowAnchor,
  type ResourceWallProps,
} from "@/components/resource-wall-v2/ResourceWall";
import type { Lesson, Unit } from "@/lib/types";
import { mountReact, type ReactHarness } from "./mount-react";

// Regression tests for the two /post defects — the same false-empty class as the
// hub browse pickers (tests/hub-browse-empty.test.ts) plus a deep link that was
// silently dropped.
//
//   1. FALSE-EMPTY. `resolveWall` returns [] for an empty lesson set
//      (lib/wall-scope.ts), and usePlanner() is empty for the whole 11–16s
//      Supabase hydrate — so "Nothing on this wall yet." was asserted on every
//      /post load before the plan arrived, and again whenever the hydrate FAILED.
//
//   2. THE WRONG WALL, PERMANENTLY. `/post?lesson=<id>` opened the wrong wall by
//      TWO independent mechanisms, and neither self-corrected:
//        (a) ordering — PostClient derives `focusSubject` from the focus lesson
//            (PostClient.tsx:54), and the bare-subject test sat ABOVE the lesson
//            test, so a lesson link always landed on Subject View. This one fires
//            even when the store is instant, i.e. on the mock path too.
//        (b) a once-only seed — the preset was taken in a lazy useState
//            initializer, so an anchor that was still null mid-hydrate snapshotted
//            "today" and never re-resolved when the lesson arrived.
//
// WHY THESE TESTS EXIST IN THIS FORM. Neither bug is reproducible in a browser on
// localhost: without NEXT_PUBLIC_PLANNER_USE_SUPABASE the planner runs the mock
// path, `effectiveHydration` pins hydration to "ready", so "pending" never occurs
// and `getLesson` resolves before first paint. The store is therefore mocked, and
// the pending shape is faithful to the real one (planner-store dispatches
// `{ doc: EMPTY_DOC, hydration: "loading" }` while the hydrate is in flight, so
// "pending" always comes with an empty document).
//
// Bug 2(b) is a transition, not a snapshot, so a static render cannot see it: the
// re-resolve is an effect and `renderToStaticMarkup` runs none. The last block
// mounts the real component with react-dom/client over a linkedom document
// (tests/mount-react.ts — no new dependency, linkedom already ships for
// lib/sanitize-html's server path) and drives the anchor from null to resolved
// the way the hydrate does.

const store = vi.hoisted(() => ({
  state: "settled" as "pending" | "error" | "settled",
  lessons: [] as Lesson[],
  units: [] as Unit[],
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({ lessons: store.lessons, units: store.units }),
  usePlannerDataState: () => store.state,
}));

// The wall reads the planning week from app-state; the real provider is a React
// context a bare render has no way to mount.
vi.mock("@/lib/app-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/app-state")>()),
  useAppState: () => ({ week: 1 }),
}));

const DENIAL = "Nothing on this wall yet";
/** The affordance <Skeleton> renders — and the marker that the fix has not
 *  overshot into stranding a settled, genuinely-bare wall on a skeleton. */
const LOADING = 'role="status" aria-busy="true"';
const ERROR_COPY = "Couldn’t load your plan";

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

const UNIT = {
  id: "u1",
  subject: "math",
  name: "Unit 1 · Place Value",
  weeks: "Wk 1",
} as unknown as Unit;

/** The `anchorKey` half of what PostClient derives from `/post?lesson=<id>` —
 *  the RAW query, which a real navigation changes and a hydrate never does. */
function link(lessonId: string): Partial<ResourceWallProps> {
  return { anchorKey: `${lessonId}||` };
}

function render(props: Partial<ResourceWallProps> = {}): string {
  return renderToStaticMarkup(createElement(ResourceWall, props));
}

beforeEach(() => {
  store.state = "settled";
  store.lessons = [];
  store.units = [];
});

// ── Bug 1 — the false-empty ─────────────────────────────────────────────────

describe("an unhydrated wall never claims to be empty", () => {
  it("does not claim the wall is bare while the hydrate is in flight", () => {
    store.state = "pending";
    expect(render()).not.toContain(DENIAL);
  });

  it("shows a loading affordance instead, labelled for screen readers", () => {
    store.state = "pending";
    const html = render();
    // Without the label a screen-reader user hears silence where the false
    // claim was — the same falsehood moved into the accessibility layer.
    expect(html).toContain(LOADING);
    expect(html).toContain("Loading your plan");
  });

  it("does not claim the wall is bare when the hydrate FAILED", () => {
    // A failed hydrate also leaves an empty document mounted. Claiming an empty
    // wall then tells a teacher their resources are gone because a backend is down.
    store.state = "error";
    const html = render();
    expect(html).not.toContain(DENIAL);
    expect(html).toContain(ERROR_COPY);
  });

  it("keeps the toolbar in every state, so the surface never looks broken", () => {
    for (const state of ["pending", "error", "settled"] as const) {
      store.state = state;
      const html = render();
      expect(html).toContain('aria-label="Wall menu"');
      expect(html).toContain("Switch walls");
    }
  });
});

describe("a settled wall still reports emptiness honestly", () => {
  // The failure mode opposite the one being fixed, and the likelier mistake: a
  // permanent skeleton passes every "the false claim is gone" test while
  // stranding the wall loading forever, which is worse than the bug.
  it("says the wall is bare once the store settles with nothing on it", () => {
    store.state = "settled";
    const html = render();
    expect(html).toContain(DENIAL);
    expect(html).not.toContain(LOADING);
  });

  it("keeps the copy a teacher can act on", () => {
    store.state = "settled";
    expect(render()).toContain(
      "Pick another wall, or add a section to start one.",
    );
  });
});

describe("the guard does not hide real content", () => {
  it("renders the wall's resources when the store has them", () => {
    store.state = "settled";
    store.lessons = [LESSON];
    store.units = [UNIT];
    const html = render({ focusLessonId: "l1", focusSubject: "math" });
    expect(html).toContain("Number line applet");
    expect(html).not.toContain(DENIAL);
    expect(html).not.toContain(LOADING);
  });
});

// ── Bug 2(a) — the anchor ordering ──────────────────────────────────────────

describe("anchoredPreset — narrowest anchor wins", () => {
  it("falls back to the everyday Today wall with no anchors", () => {
    expect(anchoredPreset({})).toBe("today");
  });

  it("opens Current Lesson for a lesson link", () => {
    expect(anchoredPreset({ focusLessonId: "l1" })).toBe("lesson");
  });

  it("opens Current Lesson for the shape PostClient actually produces", () => {
    // THE REGRESSION. PostClient passes `focusSubject={focusSubject ?? focusLesson
    // ?.subject}`, so a bare `/post?lesson=l1` arrives here WITH a subject. Tested
    // after the subject, the lesson branch was dead code and the route's own
    // documented `/post?lesson=<id> → "Current Lesson"` never happened.
    expect(anchoredPreset({ focusLessonId: "l1", focusSubject: "math" })).toBe(
      "lesson",
    );
  });

  it("opens Subject View for a bare subject link", () => {
    expect(anchoredPreset({ focusSubject: "math" })).toBe("subject");
  });

  it("opens Unit View when the link carries a unit", () => {
    expect(anchoredPreset({ focusSubject: "math", focusUnit: "u1" })).toBe("unit");
  });

  it("keeps Unit View ahead of a lesson anchor — a unit link is the narrower ask", () => {
    expect(
      anchoredPreset({ focusLessonId: "l1", focusSubject: "math", focusUnit: "u1" }),
    ).toBe("unit");
  });

  it("ignores a unit with no subject to qualify it", () => {
    // Unit ids are unique only WITHIN a subject (lib/wall-scope rule 1), so an
    // unqualified unit is not an anchor at all.
    expect(anchoredPreset({ focusUnit: "u1" })).toBe("today");
  });
});

describe("a lesson deep link lands on the lesson's own wall", () => {
  it("mounts on Current Lesson, not on Subject View", () => {
    store.state = "settled";
    store.lessons = [LESSON];
    store.units = [UNIT];
    const html = render({ focusLessonId: "l1", focusSubject: "math" });
    expect(html).toContain("Current Lesson");
    expect(html).not.toContain("Subject View</span>");
  });
});

// ── Bug 2(b) — the once-only seed ───────────────────────────────────────────

describe("shouldFollowAnchor — a late anchor moves the wall, a teacher's choice does not", () => {
  const base = {
    anchored: "lesson",
    preset: "today",
    wallMode: "preset",
    teacherChoseWall: false,
    settled: true,
  } as const;

  it("follows an anchor that resolved after the wall mounted", () => {
    expect(shouldFollowAnchor(base)).toBe(true);
  });

  it("does nothing when the wall is already the anchored one", () => {
    expect(shouldFollowAnchor({ ...base, preset: "lesson" })).toBe(false);
  });

  it("stands down once the teacher has picked a wall from the switcher", () => {
    expect(shouldFollowAnchor({ ...base, teacherChoseWall: true })).toBe(false);
  });

  it("stands down on one of the teacher's own walls", () => {
    // Covers every route onto a custom wall — auto-fork on first edit, duplicate,
    // new blank — without each having to remember to set the flag.
    expect(shouldFollowAnchor({ ...base, wallMode: "custom" })).toBe(false);
  });

  it("follows a NEW deep link arriving while the wall stays mounted", () => {
    expect(
      shouldFollowAnchor({ ...base, anchored: "unit", preset: "lesson" }),
    ).toBe(true);
  });

  it("does not follow an anchor BACKWARDS while the store is unsettled", () => {
    // A re-hydrate (workspace switch) empties the document, so PostClient's
    // getLesson returns null again and `anchored` falls back to "today". Following
    // that would bounce a deep-linked teacher Lesson → Today → Lesson for the
    // length of the hydrate.
    expect(
      shouldFollowAnchor({
        ...base,
        anchored: "today",
        preset: "lesson",
        settled: false,
      }),
    ).toBe(false);
  });

  it("still returns to Today when a SETTLED store has no anchor", () => {
    // The real navigation /post?lesson=X → /post. Distinguishable from the
    // re-hydrate above only by the data state, which is why it is a parameter.
    expect(
      shouldFollowAnchor({
        ...base,
        anchored: "today",
        preset: "lesson",
        settled: true,
      }),
    ).toBe(true);
  });
});

describe("the wall re-resolves an anchor that arrives mid-hydrate", () => {
  // The honest proof for 2(b): a transition, driven through a real mount. The
  // anchors below are exactly what PostClient emits before and after the hydrate
  // for a single `/post?lesson=l1` load — null while `getLesson` cannot answer,
  // then the resolved lesson and its subject.
  it("moves from Today to Current Lesson when the lesson resolves", async () => {
    const dom = await mountable();
    store.state = "pending";
    store.lessons = [];

    await dom.render({ ...link("l1"), focusLessonId: null, focusSubject: null });
    expect(dom.wallName()).toContain("Today");

    store.state = "settled";

    store.lessons = [LESSON];
    store.units = [UNIT];
    await dom.render({ ...link("l1"), focusLessonId: "l1", focusSubject: "math" });

    expect(dom.wallName()).toBe("Current Lesson");
    expect(dom.html()).toContain("Number line applet");
    await dom.unmount();
  });

  it("leaves the teacher on the wall they picked during the hydrate", async () => {
    const dom = await mountable();
    store.state = "pending";
    store.lessons = [];

    await dom.render({ ...link("l1"), focusLessonId: null, focusSubject: null });
    // Open the wall switcher and choose "This Week · Mixed" — the teacher giving
    // up on a slow load and navigating by hand.
    await dom.click((b) => b.getAttribute("aria-expanded") === "false");
    await dom.click((b) => b.textContent === "This Week · Mixed");
    expect(dom.wallName()).toBe("This Week · Mixed");

    store.state = "settled";
    store.lessons = [LESSON];
    store.units = [UNIT];
    // The SAME url — only the hydrate has moved on.
    await dom.render({ ...link("l1"), focusLessonId: "l1", focusSubject: "math" });

    // The anchor resolving must not yank them off the wall they chose.
    expect(dom.wallName()).toBe("This Week · Mixed");
    await dom.unmount();
  });

  it("holds the lesson wall through a RE-hydrate that drops the anchor", async () => {
    // A workspace switch re-runs the hydrate: the document drops to EMPTY_DOC,
    // PostClient's getLesson returns null again, and the anchor momentarily
    // reads as "no anchor". Following that would bounce the teacher
    // Lesson → Today → Lesson for the length of the second hydrate.
    const dom = await mountable();
    store.state = "settled";
    store.lessons = [LESSON];
    store.units = [UNIT];
    await dom.render({ focusLessonId: "l1", focusSubject: "math" });
    expect(dom.wallName()).toBe("Current Lesson");

    store.state = "pending";
    store.lessons = [];
    await dom.render({ focusLessonId: null, focusSubject: null });
    expect(dom.wallName()).toBe("Current Lesson");

    store.state = "settled";
    store.lessons = [LESSON];
    await dom.render({ focusLessonId: "l1", focusSubject: "math" });
    expect(dom.wallName()).toBe("Current Lesson");
    await dom.unmount();
  });

  it("honors a NEW deep link even after the teacher picked a wall by hand", async () => {
    // The other side of the previous test: the latch must not outlive the link
    // it was set against, or a "see this lesson's resources" link would be
    // silently dead for the rest of the session. Only the RAW query separates
    // the two cases — the resolved anchors look identical in both.
    const dom = await mountable();
    store.state = "settled";
    store.lessons = [LESSON];
    store.units = [UNIT];
    await dom.render({ ...link("l1"), focusLessonId: "l1", focusSubject: "math" });

    await dom.click((b) => b.getAttribute("aria-expanded") === "false");
    await dom.click((b) => b.textContent === "This Week · Mixed");
    expect(dom.wallName()).toBe("This Week · Mixed");

    // A different lesson's link arrives while the wall stays mounted.
    await dom.render({ ...link("l2"), focusLessonId: "l2", focusSubject: "math" });
    expect(dom.wallName()).toBe("Current Lesson");
    await dom.unmount();
  });

  it("stays put after the teacher makes a wall of their own and then deletes it", async () => {
    // deleteWall (and the library's delete-the-active-wall fallback) return to
    // preset mode, so the `wallMode` half of the rule stops covering a teacher
    // who HAS chosen a wall by hand. Authoring a wall has to latch, not just
    // being on one.
    const dom = await mountable();
    store.state = "pending";
    store.lessons = [];
    await dom.render({ focusLessonId: null, focusSubject: null });

    await dom.click((b) => (b.getAttribute("title") ?? "").startsWith("Add a note"));
    await dom.click((b) => b.textContent === "New blank wall");
    expect(dom.wallName()).toBe("New wall");

    await dom.click((b) => b.getAttribute("aria-label") === "Wall menu");
    await dom.click((b) => b.textContent === "Delete");
    expect(dom.wallName()).toBe("Today's Lessons (Mixed)");

    store.state = "settled";
    store.lessons = [LESSON];
    store.units = [UNIT];
    await dom.render({ focusLessonId: "l1", focusSubject: "math" });
    expect(dom.wallName()).toBe("Today's Lessons (Mixed)");
    await dom.unmount();
  });
});

/**
 * The mount harness, plus the one accessor these tests read: the wall on screen.
 * It comes off the switcher's own label rather than the whole document, because
 * every preset LABEL is in the DOM whenever the switcher popover is open, so a
 * substring match over the markup would pass for a wall the teacher merely
 * browsed past. It is also where the toast copy lives ("Deleted 'New wall'"),
 * which is not the wall either.
 */
async function mountable(): Promise<
  ReactHarness<Partial<ResourceWallProps>> & { wallName: () => string }
> {
  const harness = await mountReact(ResourceWall);
  return {
    ...harness,
    wallName: () => {
      const el = harness.query('[class*="ddName"]');
      if (!el) throw new Error("no wall name on screen — the harness is lying");
      return el.textContent ?? "";
    },
  };
}
