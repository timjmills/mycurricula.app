import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  ResourceWall,
  type ResourceWallProps,
} from "@/components/resource-wall-v2/ResourceWall";
import type { Lesson, Unit } from "@/lib/types";
import { mountReact, type ReactHarness } from "./mount-react";

// `?preset=` — the explicit landing wall, and the ONLY route onto the two week
// presets (lib/wall-link.ts; /weekly's Resources button is its first caller).
//
// WHY A SEPARATE FILE FROM resource-wall-anchor-empty.test.ts. That file covers
// the ANCHOR axis (`?lesson=` / `?subject=` / `?unit=`), which is inferred; this
// covers the PRESET axis, which is stated outright. They meet in one effect, and
// the defect below is exactly the seam between them: the effect only ever knew
// about the inferred anchor, so it treated an explicit preset as a wall nobody
// had asked for and corrected it away.
//
// THE DEFECT (Codex gate, reported as Medium — it is worse than that). The
// explicit preset seeded `useState` and stopped there. The re-resolve effect
// then compared the seeded wall against the INFERRED anchor, and a bare
// /post?preset=week-mixed carries no anchors at all, so the inference is
// "today". The moment the planner settled, the effect "corrected" the wall the
// URL had asked for back to Today — on the FIRST load, not only on a second
// navigation. The Resources button on /weekly therefore landed on the right wall
// for a few hundred ms and then left it.
//
// A real mount, not renderToStaticMarkup: the correction is an effect, and a
// static render runs none — it would show the seeded value and pass while the
// bug was live.

vi.setConfig({ testTimeout: 30000 });

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
  resources: [
    { type: "link", label: "Number line applet", url: "https://x.test/n" },
  ],
  standards: [],
} as unknown as Lesson;

const UNIT = {
  id: "u1",
  subject: "math",
  name: "Unit 1 · Place Value",
  weeks: "Wk 1",
} as unknown as Unit;

/** What PostClient emits for `/post?preset=<p>` — no anchors, and the preset
 *  folded into the deep link's identity (PostClient.tsx:78). */
function presetLink(preset: ResourceWallProps["initialPreset"]) {
  return { initialPreset: preset, anchorKey: `|||${preset ?? ""}` };
}

beforeEach(() => {
  store.state = "settled";
  store.lessons = [LESSON];
  store.units = [UNIT];
});

describe("an explicit ?preset= link lands — and stays", () => {
  it("holds the asked-for wall once the planner settles", async () => {
    const dom = await mountable();
    await dom.render(presetLink("week-mixed"));
    expect(dom.wallName()).toBe("This Week · Mixed");
    await dom.unmount();
  });

  it("holds it through the hydrate that used to correct it away", async () => {
    // The live sequence: the wall mounts while the planner is still loading and
    // the store settles a beat later. The correction fired on that transition,
    // so a test that only renders a settled store can miss it.
    const dom = await mountable();
    store.state = "pending";
    store.lessons = [];
    await dom.render(presetLink("week-mixed"));
    expect(dom.wallName()).toBe("This Week · Mixed");

    store.state = "settled";
    store.lessons = [LESSON];
    await dom.render(presetLink("week-mixed"));
    expect(dom.wallName()).toBe("This Week · Mixed");
    await dom.unmount();
  });

  it("follows a NEW preset link that arrives while the wall stays mounted", async () => {
    // /post?preset=week-mixed → /post?preset=week-subject is a client-side
    // navigation: the route re-renders, PostClient stays mounted, and the wall
    // never remounts — so a value that only seeds state can never see it.
    const dom = await mountable();
    await dom.render(presetLink("week-mixed"));
    expect(dom.wallName()).toBe("This Week · Mixed");

    await dom.render(presetLink("week-subject"));
    expect(dom.wallName()).toBe("This Week · Subject");
    await dom.unmount();
  });

  it("does not fight a teacher who picked a wall after arriving on the link", async () => {
    // The other half of the rule: the link decides where they LAND, never where
    // they stay. Without this the fix above would re-assert the URL's wall over
    // every hand-made choice for the rest of the session.
    const dom = await mountable();
    await dom.render(presetLink("week-mixed"));

    await dom.click((b) => b.getAttribute("aria-expanded") === "false");
    await dom.click((b) => b.textContent === "Today's Lessons (Mixed)");
    expect(dom.wallName()).toBe("Today's Lessons (Mixed)");

    // A re-render on the SAME url — a store update, a parent re-render, anything.
    await dom.render(presetLink("week-mixed"));
    expect(dom.wallName()).toBe("Today's Lessons (Mixed)");
    await dom.unmount();
  });

  it("still lets a late ANCHOR move a wall that asked for no preset", async () => {
    // The control for the fix overshooting. `?preset=` is additive: with none in
    // the URL the anchor path must behave exactly as it did before, including
    // the late-resolve retry that the anchor file covers in full.
    const dom = await mountable();
    store.state = "pending";
    store.lessons = [];
    await dom.render({
      anchorKey: "l1||",
      initialPreset: null,
      focusLessonId: null,
      focusSubject: null,
    });
    expect(dom.wallName()).toContain("Today");

    store.state = "settled";
    store.lessons = [LESSON];
    await dom.render({
      anchorKey: "l1||",
      initialPreset: null,
      focusLessonId: "l1",
      focusSubject: "math",
    });
    expect(dom.wallName()).toBe("Current Lesson");
    await dom.unmount();
  });
});

/** Same harness + accessor as tests/resource-wall-anchor-empty.test.ts: the wall
 *  on screen comes off the switcher's own label, because every preset label is
 *  in the DOM whenever the switcher popover is open. */
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
