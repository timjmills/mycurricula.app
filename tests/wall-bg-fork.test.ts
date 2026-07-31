import { describe, it, expect, vi, beforeEach } from "vitest";

import { ResourceWall } from "@/components/resource-wall-v2/ResourceWall";
import type { ResourceWallProps } from "@/components/resource-wall-v2/ResourceWall";
import type { Lesson, Unit } from "@/lib/types";
import { mountReact } from "./mount-react";

// Regression test for the /post section-background fork race (task #25).
//
// THE BUG. Pinning a background on a shared preset wall is an EDIT, so the
// handler calls onEdit() -> ensurePersonal(), which auto-forks the wall
// ("Current Lesson" -> "My Current Lesson") in the SAME action. That mints a new
// wall id, and `wallKey` — the scope for the storage record — is derived from
// it. The write then used the `wallKey` PROP, which still held the pre-fork
// value for the rest of that render, so the record landed on the wall the
// teacher had just left. The section's load effect re-read under the NEW key,
// found nothing, and reset the background to null.
//
// From the teacher's side: click a colour, and nothing happens. Click it again
// and it works — because by then the fork has already happened — which is what
// makes it read as a mis-click rather than a bug. It also left an orphan record
// under a key that no longer addresses anything, so re-opening the ORIGINAL
// preset wall later shows a background nobody pinned there.
//
// Measured twice by wave6-polish before the fix:
//   apply #1 (preset)  hasBg=false  wrote cc_secbg_lesson:math:lesson:m-11-1
//   apply #2 (forked)  hasBg=true   wrote cc_secbg_cw16aea111...:math:lesson:m-11-1
//
// WHY IT IS TESTED THROUGH A REAL MOUNT. The defect lives entirely in the gap
// between an event handler and the effect that runs after it — a transition, not
// a snapshot. `renderToStaticMarkup` runs no effects and would show the
// background "applied" in every build, passing whether or not the bug is there.
// tests/mount-react.ts mounts the component with react-dom/client over linkedom
// and drives real clicks, and its localStorage stub is what makes the write
// observable at all (the app guards every storage access in try/catch, so
// without it every write silently no-ops).

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

const UNIT = {
  id: "u1",
  subject: "math",
  name: "Unit 1 · Place Value",
  weeks: "Wk 1",
} as unknown as Unit;

/** The deep link that lands on the "Current Lesson" PRESET — a shared wall, so
 *  the first edit forks it. That is the precondition for the whole bug. */
const ON_PRESET: Partial<ResourceWallProps> = {
  anchorKey: "l1||",
  focusLessonId: "l1",
  focusSubject: "math",
};

const SECTION_BG_PREFIX = "cc_secbg_";

async function openWallWithASection() {
  store.state = "settled";
  store.lessons = [LESSON];
  store.units = [UNIT];
  const dom = await mountReact(ResourceWall);
  await dom.render(ON_PRESET);
  return dom;
}

/** The class the section carries only when a background is actually applied —
 *  i.e. what the teacher can see. Asserting on storage alone would pass a fix
 *  that wrote the right key and still rendered nothing. */
function sectionHasBackground(dom: { query: (s: string) => Element | null }): boolean {
  const el = dom.query("section");
  if (!el) throw new Error("no section on screen — the fixture is wrong");
  return (el.getAttribute("class") ?? "").includes("hasBg");
}

function sectionBgKeys(storage: Map<string, string>): string[] {
  return Array.from(storage.keys()).filter((k) => k.startsWith(SECTION_BG_PREFIX));
}

beforeEach(() => {
  store.state = "settled";
  store.lessons = [];
  store.units = [];
});

describe("the FIRST section background pinned on a preset wall", () => {
  it("is visible after one click, not two", async () => {
    const dom = await openWallWithASection();
    expect(sectionHasBackground(dom)).toBe(false);

    await dom.click((b) => b.getAttribute("aria-label") === "Section background");
    await dom.click((b) => b.getAttribute("aria-label") === "honey");

    expect(sectionHasBackground(dom)).toBe(true);
    await dom.unmount();
  });

  it("forks the wall, as an edit to a shared preset must", async () => {
    // Pinning IS an edit (CLAUDE.md §2 auto-fork), so the fix must not have
    // worked by skipping the fork — that would put a teacher's colour on the
    // whole team's wall.
    const dom = await openWallWithASection();
    await dom.click((b) => b.getAttribute("aria-label") === "Section background");
    await dom.click((b) => b.getAttribute("aria-label") === "honey");

    expect(dom.query('[class*="ddName"]')?.textContent).toBe("My Current Lesson");
    await dom.unmount();
  });

  it("stores the record under the wall the teacher ends up on", async () => {
    const dom = await openWallWithASection();
    await dom.click((b) => b.getAttribute("aria-label") === "Section background");
    await dom.click((b) => b.getAttribute("aria-label") === "honey");

    const keys = sectionBgKeys(dom.storage);
    expect(keys).toHaveLength(1);
    // The forked wall's id (wall-state mints "cw…"), never the preset's.
    expect(keys[0]).toMatch(/^cc_secbg_cw[^:]+:math:/);
    await dom.unmount();
  });

  it("leaves no orphan under the wall it forked away from", async () => {
    // The second half of the damage: a record under a key nothing addresses any
    // more, which resurfaces as a background nobody pinned if the teacher opens
    // the original preset wall again.
    const dom = await openWallWithASection();
    await dom.click((b) => b.getAttribute("aria-label") === "Section background");
    await dom.click((b) => b.getAttribute("aria-label") === "honey");

    const keys = sectionBgKeys(dom.storage);
    // POSITIVE CONTROL, in this same evaluation. The assertion that matters is an
    // ABSENCE ("no key under the preset"), which passes for free if the click did
    // nothing, the storage stub never recorded, or the prefix is misspelt. So
    // first prove this run DID write a section-background record at all.
    expect(keys).toHaveLength(1);
    expect(keys.filter((k) => k.startsWith(`${SECTION_BG_PREFIX}lesson:`))).toEqual([]);
    await dom.unmount();
  });
});

describe("the paths the fix must not have broken", () => {
  it("keeps working on the SECOND pin, once the wall is already a teacher's own", async () => {
    // The case that always worked — pinned so a fix that traded the first click
    // for every later one is caught.
    const dom = await openWallWithASection();
    await dom.click((b) => b.getAttribute("aria-label") === "Section background");
    await dom.click((b) => b.getAttribute("aria-label") === "honey");
    await dom.click((b) => b.getAttribute("aria-label") === "Section background");
    await dom.click((b) => b.getAttribute("aria-label") === "brand");

    expect(sectionHasBackground(dom)).toBe(true);
    // Still ONE record: the second pin overwrote the first on the same wall
    // rather than accumulating a key per click.
    expect(sectionBgKeys(dom.storage)).toHaveLength(1);
    await dom.unmount();
  });

  it("applies a PHOTO on the first click too, and marks the section .hasPhoto", async () => {
    // The photo path is its own case, not a colour with a different value: it is
    // the only background kind that adds `.hasPhoto`, and that class carries a
    // SECOND defect this fix unmasked — `.hasPhoto > *` gave .head and .grid the
    // same z-index, making the header a stacking context its popovers could not
    // escape, so a photographed section's background could never be changed or
    // cleared (fixed in Section.module.css by wave6-polish).
    //
    // WHAT THIS PINS AND WHAT IT DOES NOT. It pins that one click applies a photo
    // and that the class the CSS keys on is really on the element — the half a
    // DOM-less mount can see. It does NOT and cannot cover the stacking bug:
    // linkedom computes no layout, so there is no geometry and no
    // elementFromPoint. That half belongs to the browser probe, and this test
    // must not be read as coverage of it.
    const dom = await openWallWithASection();
    await dom.click((b) => b.getAttribute("aria-label") === "Section background");
    await dom.click((b) => b.getAttribute("aria-label") === "Photo background");

    const cls = dom.query("section")?.getAttribute("class") ?? "";
    expect(cls).toContain("hasBg");
    expect(cls).toContain("hasPhoto");
    expect(sectionBgKeys(dom.storage)).toHaveLength(1);
    await dom.unmount();
  });

  it("still applies a WHOLE-SUBJECT background, which is stored globally", async () => {
    // Subject scope writes the global `cc_subjbg_<subject>` pin and clears this
    // wall's section overrides; it was never broken by the wallKey race, and the
    // fix routes it through the same post-fork key, so it is pinned here.
    const dom = await openWallWithASection();
    await dom.click((b) => b.getAttribute("aria-label") === "Section background");
    await dom.click((b) => b.textContent === "Whole subject");
    await dom.click((b) => b.getAttribute("aria-label") === "honey");

    expect(sectionHasBackground(dom)).toBe(true);
    expect(Array.from(dom.storage.keys()).some((k) => k.startsWith("cc_subjbg_"))).toBe(
      true,
    );
    await dom.unmount();
  });

  it("clears a pinned background again from Follow page style", async () => {
    const dom = await openWallWithASection();
    await dom.click((b) => b.getAttribute("aria-label") === "Section background");
    await dom.click((b) => b.getAttribute("aria-label") === "honey");
    expect(sectionHasBackground(dom)).toBe(true);

    await dom.click((b) => b.getAttribute("aria-label") === "Section background");
    await dom.click((b) => (b.textContent ?? "").includes("Follow page style"));

    expect(sectionHasBackground(dom)).toBe(false);
    expect(sectionBgKeys(dom.storage)).toEqual([]);
    await dom.unmount();
  });
});
