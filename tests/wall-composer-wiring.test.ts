import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";

import { ResourceWall } from "@/components/resource-wall-v2/ResourceWall";
import type { ResourceWallProps } from "@/components/resource-wall-v2/ResourceWall";
import type { Lesson, Unit } from "@/lib/types";
import { mountReact } from "./mount-react";

// A real react-dom/client mount plus a click sequence is genuinely slow — a few
// hundred ms per test in isolation, more under the full suite's parallel load.
// See the note in tests/wall-bg-fork.test.ts; every test here fails on an
// ASSERTION, never a timeout, when the wiring is mutated out.
vi.setConfig({ testTimeout: 30000 });

// Task #35, the WALL arm — and this file has now been written twice, in
// opposite directions, because the decision under it changed.
//
// IT USED TO ASSERT the opposite of what it asserts now: that "Add note" opened
// the shared modal ResourceComposer. That was one of FOUR artifacts encoding a
// decision the user has since overruled — alongside a live probe asserting no
// composer may ever appear here, a tooltip telling teachers resources cannot be
// added here, and the wiring itself. They did not agree with each other.
//
// THE RULING. The user looked at this surface and said the note editor is "too
// bare", pointing at a Padlet-style reference. So the wall gains authoring — but
// as an INLINE card composed in place, which is the handoff's own shape
// (bundled mockup :7087) and the right one: a note on a wall is composed where
// it will live. The modal composer stays on the lesson-centric surfaces that
// compose ONTO a lesson.
//
// So what this file pins now is the inverse of what it pinned before:
//   • Add note opens the wall's own inline composer, never the modal one.
//   • It works with NO lesson behind the section — the case the old fallback
//     existed for, and the reason a hand-made section used to dead-end.
//   • The affordance is always present.
//
// WHY A REAL CLICK. The behaviour is an onClick handler;
// `renderToStaticMarkup` discards handlers, so a static render would pass
// identically against an unwired build.

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

/** The text the mocked editor emits on its next "type" click. Typing into a
 *  controlled field is unreachable under this harness — see the header of
 *  tests/wall-note-composer.test.ts — so text arrives through the same
 *  `onChange` the real editor calls. */
let nextText = "";
vi.mock("@/components/rich-text", () => ({
  RichTextEditor: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (html: string) => void;
  }) =>
    createElement(
      "button",
      { type: "button", "data-editor": "type", onClick: () => onChange(nextText) },
      `editor:${value}`,
    ),
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

/** How many walls the teacher owns. The key is written as "[]" on mount by the
 *  storage-load effect, so "no fork" is an EMPTY list, not an absent key —
 *  asserting `toBeNull()` here fails against a wall that never forked. */
function forkCount(dom: { storage: Map<string, string> }): number {
  return (JSON.parse(dom.storage.get("cc_customwalls") ?? "[]") as unknown[]).length;
}

const clickAddNote = (b: Element) => (b.textContent ?? "").includes("Add note");

beforeEach(() => {
  composerMock.available = true;
  composerMock.opens.length = 0;
  store.state = "settled";
  store.lessons = [LESSON];
  store.units = [UNIT];
});

describe("the Wall's Add note composes INLINE, never in the modal", () => {
  it("never opens the shared modal composer", async () => {
    const dom = await openWall();
    await dom.click(clickAddNote);
    // The regression guard for the ruling. `scripts/probe-b46-post-composer.mjs`
    // asserts the same thing live (zero `.cmp-modal`) — for a different reason
    // than when it was written, but the assertion survives.
    expect(composerMock.opens).toHaveLength(0);
    await dom.unmount();
  });

  it("opens its own editor on the card, in place", async () => {
    const dom = await openWall();
    await dom.click(clickAddNote);
    // The inline composer's own controls — the ones the modal never had here.
    // Asserting all three together is what distinguishes "the inline composer
    // opened" from "the old bare textarea opened", which is the actual defect
    // the user reported.
    const html = dom.html();
    expect(html).toContain("Done");
    expect(html).toContain("Cancel");
    expect(html).toContain("Add link");
    await dom.unmount();
  });

  it("still works when the section has no lesson behind it", async () => {
    // A hand-made section carries NO lesson, and the modal composer REQUIRES
    // one — which is why that path used to dead-end into a bare textarea. The
    // inline composer needs none.
    //
    // The section is BUILT here rather than assumed (§4a review, Medium): an
    // earlier version of this test only rendered an empty wall and asserted the
    // word "Add", which would have passed even if note creation were broken for
    // every lesson-less section — the exact case it claims to cover.
    const dom = await openWall();
    await dom.click((b) => (b.textContent ?? "").includes("Add section"));
    // The new section is empty and lesson-less; open ITS composer. Two "Add
    // note" buttons now exist, so take the last — the one on the new section.
    const adds = dom
      .queryAll("button")
      .filter((b) => (b.textContent ?? "").includes("Add note"));
    expect(adds.length).toBeGreaterThan(1);
    await dom.clickElement(adds[adds.length - 1]);

    // The inline composer opened, and the modal one did not.
    expect(dom.html()).toContain("Cancel");
    expect(dom.html()).toContain("Add link");
    expect(composerMock.opens).toHaveLength(0);
    await dom.unmount();
  });

  it("does NOT fork the wall just because the composer opened", async () => {
    // THE ASSERTION IS THE FORK, NOT THE CARD COUNT (§4a review, High).
    // `withFork` -> `ensurePersonal()` copies a preset into a frozen "My Walls"
    // wall that stops receiving later lesson-resource updates. Creating that on
    // the mere press of "Add note" meant a teacher who pressed Cancel owned a
    // stale copy of the wall having saved nothing — and, unlike the empty card,
    // it is INVISIBLE: the wall looks unchanged while it silently stops
    // tracking the team's resources.
    //
    // "The card is gone" is exactly the assertion that passes while the fork
    // survives, so it is not the one made here.
    const dom = await openWall();
    await dom.click(clickAddNote);
    // The composer is open — the control, so this is not passing on a no-op.
    expect(dom.html()).toContain("Cancel");
    expect(forkCount(dom)).toBe(0);
    await dom.unmount();
  });

  it("still does not fork after the composer is cancelled", async () => {
    const dom = await openWall();
    await dom.click(clickAddNote);
    await dom.click((b) => (b.textContent ?? "").trim() === "Cancel");
    expect(forkCount(dom)).toBe(0);
    await dom.unmount();
  });

  it("forks only when a note is actually SAVED", async () => {
    // The complement, and the guard against over-correcting into "never forks":
    // a committed note is a real edit to a preset and must fork, or the teacher's
    // note has nowhere to live.
    const dom = await openWall();
    await dom.click(clickAddNote);
    nextText = "Bring in shoeboxes Thursday";
    await dom.click((el) => el.getAttribute("data-editor") === "type");
    await dom.click((b) => (b.textContent ?? "").trim() === "Done");

    const walls = JSON.parse(dom.storage.get("cc_customwalls") ?? "[]") as {
      layout?: { items?: { label?: string }[] }[];
    }[];
    expect(walls).toHaveLength(1);
    // And the note is IN it — a fork with an empty layout would pass a bare
    // length check while having saved nothing.
    const labels = (walls[0]?.layout ?? []).flatMap((sec) =>
      (sec.items ?? []).map((i) => i.label),
    );
    expect(labels).toContain("Bring in shoeboxes Thursday");
    await dom.unmount();
  });
});

describe("the affordance does not depend on the modal composer's provider", () => {
  it("behaves identically with no ComposerProvider mounted", async () => {
    // /teach mounts no provider, and this component does not get to choose the
    // tree it renders into. Since the wall no longer reaches for the shared
    // composer at all, a missing provider is now a non-event — which is the
    // point: one path, not two.
    composerMock.available = false;
    const dom = await openWall();
    await dom.click(clickAddNote);
    // Same outcome as with a provider: the inline composer opens and nothing is
    // forked until something is saved.
    expect(composerMock.opens).toHaveLength(0);
    expect(dom.html()).toContain("Cancel");
    expect(forkCount(dom)).toBe(0);
    await dom.unmount();
  });

  it("keeps the Add note button visible either way", async () => {
    for (const available of [true, false]) {
      composerMock.available = available;
      const dom = await openWall();
      expect(dom.html()).toContain("Add note");
      await dom.unmount();
    }
  });
});
