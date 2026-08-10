import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { mountReact } from "./mount-react";
import { COMPARE_REQUEST_EVENT } from "@/lib/fork-diff";

// THE FORKING ITEMS WERE MENU-UNREACHABLE ON THE DEFAULT FRAME.
//
// The Week canvas is chosen off `data-frame`. Only `paper` routes to
// WeekColumns → WeeklyLessonCard, which carries the v1 <LessonContextMenu> and
// its "Compare with Team Curriculum" / "Restore from Team Curriculum" rows.
// `glass` — THE DEFAULT — renders WeekA, and `color` renders WeekC; both use
// <LessonKebabMenu>, which offered four navigation destinations and nothing
// else. So the fork diff, the surface that answers "what did I change?", had
// no menu door on the frame most teachers see. 9ad2ca1 fixed the panel's HOST
// and left this half explicitly open ("re-homing the forking items onto the v2
// canvases is its own job").
//
// These tests mount the menu for real and OPEN it, because the rows only exist
// after a click — a closed menu renders a lone <button> and would satisfy any
// assertion about what it does not contain.
//
// Every positive case is paired with a negative one (unedited lesson, Team
// Curriculum mode, unknown id). Without the pairs, "the row is present" is
// equally true of a menu that renders it unconditionally, and "the row is
// absent" is equally true of a menu that renders nothing at all.

const spies = vi.hoisted(() => ({
  editMode: "personal" as "personal" | "master",
  lessons: [] as unknown[],
  restoreLesson: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: spies.push }),
}));

vi.mock("@/lib/app-state", () => ({
  useAppState: () => ({ editMode: spies.editMode }),
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    lessons: spies.lessons,
    restoreLesson: spies.restoreLesson,
  }),
}));

const { LessonKebabMenu } = await import(
  "@/components/weekly/lesson-kebab-menu"
);

/** Content-forked: title and objective both diverge from the captured team
 *  snapshot, so canCompareWithTeam() passes AND `modified` is set — the one
 *  shape that earns both rows. */
const FORKED = {
  id: "r-12-1",
  subject: "reading",
  title: "Book club — Via's chapters",
  objective: "I can compare two characters' points of view.",
  preview: "",
  standards: [],
  day: 1,
  week: 12,
  modified: true,
  moved: null,
  masterSnapshot: {
    title: "Literature circles — Via's chapters",
    objective: "I can describe a character's point of view.",
    preview: "",
    standards: [],
    day: 1,
    week: 12,
  },
};

/** Moved but not edited. v1 gates Restore on `modified` alone, so this shape
 *  earns Compare and NOT Restore — the asymmetry is mirrored deliberately. */
const MOVED_ONLY = {
  ...FORKED,
  id: "r-12-2",
  modified: false,
  moved: "same-week",
  title: FORKED.masterSnapshot.title,
  objective: FORKED.masterSnapshot.objective,
  day: 3,
};

/** Straight from the team plan — no snapshot, no divergence. Neither row. */
const UNEDITED = {
  id: "r-12-3",
  subject: "reading",
  title: "Close reading — chapter 7",
  objective: "I can cite text evidence.",
  preview: "",
  standards: [],
  day: 2,
  week: 12,
  modified: false,
  moved: null,
  masterSnapshot: undefined,
};

const PROPS = {
  lessonId: FORKED.id,
  lessonTitle: FORKED.title,
  subjectClass: "s-reading",
  onPlan: null,
};

type Harness = Awaited<ReturnType<typeof mountReact<typeof PROPS>>>;

/** Open the menu by clicking its ⋮ trigger. The harness throws when nothing
 *  matches, so a renamed trigger fails here rather than silently leaving every
 *  later assertion looking at a closed menu. */
async function openMenu(h: Harness): Promise<void> {
  await h.click((el) =>
    (el.getAttribute("aria-label") ?? "").startsWith("Open, teach, or post"),
  );
}

/** The menu is a REAL portal to document.body, so it is NOT inside the
 *  harness's `#root` container — every query for it has to go through the
 *  document. (A container-scoped query would find nothing and make every
 *  "the row is absent" assertion pass for the wrong reason.) */
function doc(): Document {
  return (globalThis as unknown as { document: Document }).document;
}

function menuButtons(): HTMLButtonElement[] {
  return Array.from(
    doc().querySelectorAll<HTMLButtonElement>('[role="group"] button'),
  );
}

/** The rows, by their visible label. */
function rowLabels(): string[] {
  return menuButtons().map((el) => (el.textContent ?? "").trim());
}

/** Click a row by label. `clickElement` takes an element the caller already
 *  holds, which is what makes it usable on portalled nodes — the harness's own
 *  `click(match)` only scans the container. Throws when the row is missing, so
 *  a renamed label fails loudly instead of clicking nothing. */
async function clickRow(h: Harness, label: string): Promise<void> {
  const row = menuButtons().find(
    (el) => (el.textContent ?? "").trim() === label,
  );
  if (!row) throw new Error(`no menu row labelled "${label}"`);
  await h.clickElement(row);
}

beforeEach(() => {
  spies.editMode = "personal";
  spies.lessons = [FORKED, MOVED_ONLY, UNEDITED];
  spies.restoreLesson.mockReset();
  spies.push.mockReset();
});

describe("the v2 Week kebab carries the forking items", () => {
  it("offers Compare and Restore on a personally-forked lesson", async () => {
    const h = await mountReact(LessonKebabMenu);
    try {
      await h.render(PROPS);
      // The rows must not exist before the menu is opened — otherwise the
      // assertions below would pass against a component that never opens.
      expect(menuButtons()).toHaveLength(0);

      await openMenu(h);

      const labels = rowLabels();
      expect(labels).toContain("Compare");
      expect(labels).toContain("Restore");
      // The four handoff destinations survive the addition.
      expect(labels).toContain("Teach");
      expect(labels).toContain("Post");
    } finally {
      await h.unmount();
    }
  });

  it("omits both rows on an unedited lesson — nothing to compare or restore", async () => {
    const h = await mountReact(LessonKebabMenu);
    try {
      await h.render({
        ...PROPS,
        lessonId: UNEDITED.id,
        lessonTitle: UNEDITED.title,
      });
      await openMenu(h);

      const labels = rowLabels();
      // Paired with the case above: the menu IS capable of rendering these
      // rows, so their absence here is the gate firing, not a dead component.
      expect(labels).not.toContain("Compare");
      expect(labels).not.toContain("Restore");
      expect(labels).toContain("Teach");
    } finally {
      await h.unmount();
    }
  });

  it("offers Compare but NOT Restore on a moved-only fork (mirrors v1)", async () => {
    const h = await mountReact(LessonKebabMenu);
    try {
      await h.render({
        ...PROPS,
        lessonId: MOVED_ONLY.id,
        lessonTitle: MOVED_ONLY.title,
      });
      await openMenu(h);

      const labels = rowLabels();
      expect(labels).toContain("Compare");
      expect(labels).not.toContain("Restore");
    } finally {
      await h.unmount();
    }
  });

  it("omits both rows in Team-Curriculum mode — there is no personal copy", async () => {
    spies.editMode = "master";
    const h = await mountReact(LessonKebabMenu);
    try {
      await h.render(PROPS);
      await openMenu(h);

      const labels = rowLabels();
      expect(labels).not.toContain("Compare");
      expect(labels).not.toContain("Restore");
    } finally {
      await h.unmount();
    }
  });

  it("omits both rows for an id the store does not hold, without throwing", async () => {
    const h = await mountReact(LessonKebabMenu);
    try {
      // The real cold shape: the store is still hydrating, so the tile's id
      // resolves to nothing. A menu that assumed the lesson existed would
      // throw here rather than render four destinations.
      spies.lessons = [];
      await h.render(PROPS);
      await openMenu(h);

      const labels = rowLabels();
      expect(labels).not.toContain("Compare");
      expect(labels).toContain("Teach");
    } finally {
      await h.unmount();
    }
  });
});

describe("the rows fire the EXISTING wiring", () => {
  it("Compare pushes the deep link AND dispatches the compare event", async () => {
    const h = await mountReact(LessonKebabMenu);
    // requestCompare() constructs a CustomEvent and hands it to
    // window.dispatchEvent. linkedom's dispatcher will not accept a Node
    // CustomEvent, so the call is captured rather than delivered — the
    // assertion is about what the menu SENDS, which is the half this
    // component owns. <ForkDiffHost> consuming it is covered by
    // tests/fork-diff-reachability.test.ts.
    //
    // The stub is captured and restored in `finally`, NOT left in place.
    //
    // Be precise about why, because the obvious reason is currently WRONG: this
    // stub does not leak into the resize-dismissal test below today. Every test
    // here opens with `mountReact`, and tests/mount-react.ts:134 reassigns
    // `globalThis.window` to a fresh linkedom window on each call — so the stub
    // goes out of scope with the window it was installed on. The leak is LATENT,
    // not live, and the tests pass either way.
    //
    // It is restored anyway because that containment is incidental: nothing
    // asserts that `mountReact` rebuilds the window, and reusing one is an
    // obvious future optimisation. The day it does, this stub would swallow
    // every later `window.dispatchEvent` in the file — the resize listener would
    // never run and its assertion would pass for the wrong reason. A leaked
    // global stub does not fail loudly; it makes the tests after it vacuous,
    // which is the one failure mode this suite is least able to notice.
    const w = (globalThis as unknown as { window: Record<string, unknown> })
      .window;
    const originalDispatch = w.dispatchEvent;
    try {
      await h.render(PROPS);
      await openMenu(h);

      const sent: string[] = [];
      w.dispatchEvent = (ev: { type: string }): boolean => {
        sent.push(ev.type);
        return true;
      };

      await clickRow(h, "Compare");

      expect(spies.push).toHaveBeenCalledWith(
        `/daily?lesson=${encodeURIComponent(FORKED.id)}&compare=1`,
      );
      // BOTH halves. The push alone is not enough when the target lesson is
      // already the selected one, and the event alone leaves nothing in the
      // URL to share or reload — that pairing is the whole point of
      // context-menu.tsx:348-358, and dropping either half is a silent
      // regression the push assertion would not catch.
      expect(sent).toContain(COMPARE_REQUEST_EVENT);
    } finally {
      w.dispatchEvent = originalDispatch;
      await h.unmount();
    }
  });

  it("Restore calls the store's restoreLesson for THIS lesson", async () => {
    const h = await mountReact(LessonKebabMenu);
    try {
      await h.render(PROPS);
      await openMenu(h);

      await clickRow(h, "Restore");

      expect(spies.restoreLesson).toHaveBeenCalledTimes(1);
      expect(spies.restoreLesson).toHaveBeenCalledWith(FORKED.id);
      // Restore must not also navigate — it is an in-place revert, and a push
      // here would drop the teacher out of the week they were reading.
      expect(spies.push).not.toHaveBeenCalled();
    } finally {
      await h.unmount();
    }
  });

  it("closes the menu after a forking row is chosen", async () => {
    const h = await mountReact(LessonKebabMenu);
    try {
      await h.render(PROPS);
      await openMenu(h);
      expect(doc().querySelector('[role="group"]')).not.toBeNull();

      await clickRow(h, "Restore");

      expect(doc().querySelector('[role="group"]')).toBeNull();
    } finally {
      await h.unmount();
    }
  });
});

describe("the always-on tooltip on the destructive row", () => {
  it("Restore carries a tooltip that cannot be dismissed", async () => {
    const h = await mountReact(LessonKebabMenu);
    try {
      await h.render(PROPS);
      await openMenu(h);

      // <Tooltip> mirrors string content to native title= for the touch
      // long-press path, so the mirrored attribute is the observable proof the
      // row is wrapped at all. CLAUDE.md §4 puts a row that discards a
      // teacher's edits in the always-on class.
      const restore = menuButtons().find(
        (el) => (el.textContent ?? "").trim() === "Restore",
      );
      expect(restore).toBeDefined();
      expect(restore?.getAttribute("title") ?? "").toContain(
        "Discard your personal edits",
      );
    } finally {
      await h.unmount();
    }
  });
});

describe("BOTH v2 Week canvases host the menu, not just the default frame", () => {
  // The task title says "unreachable on the DEFAULT frame", and glass/WeekA is
  // indeed the headline. But `data-frame=color` routes to WeekC, and a teacher
  // on Frame C has exactly the same right to reach their own fork. The rows
  // live in the shared primitive, so both canvases get them from one change —
  // this pins that the SHARING is what delivers it. If someone later gives one
  // canvas a bespoke menu, the forking rows silently vanish on that frame and
  // nothing else in this file would notice.
  //
  // A source assertion rather than a mount: WeekA/WeekC are self-contained
  // canvases that read four stores and the schedule fixtures, so mounting them
  // to prove one import costs far more than it proves. Precedent for reading
  // the file is tests/fork-diff-reachability.test.ts.
  const read = (rel: string): string =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

  for (const [frame, file] of [
    ["glass (the default)", "../components/week-v2/WeekA.tsx"],
    ["color", "../components/week-v2/WeekC.tsx"],
  ] as const) {
    it(`${frame} renders <LessonKebabMenu>, so it inherits the forking rows`, () => {
      const src = read(file);
      expect(src).toContain(
        'import { LessonKebabMenu } from "@/components/weekly/lesson-kebab-menu"',
      );
      // A REGEX, not toContain("<LessonKebabMenu"): substring containment is
      // satisfied by `<LessonKebabMenuAnythingElse`, so renaming the element to
      // a different component passed the first version of this test. The
      // delimiter class is what makes it an identity check.
      expect(src).toMatch(/<LessonKebabMenu[\s/>]/);
      // And NOT a bespoke copy that would drift from the shared rows.
      expect(src).not.toContain("Compare with Team Curriculum");
    });
  }
});

describe("the portalled menu does not outlive its anchor", () => {
  // REGRESSION (gate, Medium). `pos` is computed once, at open, from the
  // trigger's rect. Inside the tile the menu moved with it; portalled to
  // document.body it does not — so a scroll or resize used to leave it parked
  // at stale coordinates, detached from its lesson and still clickable. The
  // dangerous half is that it keeps acting on the lesson it was opened for
  // while hovering over a different one.
  //
  // The scroll case is asserted through a NESTED scroll container, not the
  // document, because that is the only shape that fails when the listener is
  // written the obvious way: scroll events do not bubble, and in this app the
  // document never scrolls (#main-content does). A bubble-phase listener would
  // pass a document-dispatched test and be inert in the real app.

  async function openOn(h: Harness): Promise<void> {
    await h.render(PROPS);
    await openMenu(h);
    expect(doc().querySelector('[role="group"]')).not.toBeNull();
  }

  it("closes on a scroll event", async () => {
    const h = await mountReact(LessonKebabMenu);
    try {
      await openOn(h);

      const d = doc();
      const scroller = d.createElement("div");
      d.body.appendChild(scroller);
      const w = (globalThis as unknown as { window: { Event: typeof Event } })
        .window;
      await act(async () => {
        // BUBBLING, and that is a harness concession, not the real shape. A
        // real scroll event does NOT bubble, and linkedom implements no
        // capture phase whatsoever — measured: a non-bubbling event dispatched
        // on a descendant reaches no ancestor listener at all, and a bubbling
        // one fires ancestor capture AND bubble listeners indiscriminately.
        // So this environment cannot model the scroll that actually happens,
        // and cannot tell a capture listener from a bubble one.
        //
        // What this case therefore proves, and all it proves: a scroll that
        // reaches the document closes the menu. The capture flag — the part
        // that decides whether the listener fires for #main-content in a real
        // browser — is pinned by the source assertion below and proven live in
        // scripts/tmp/probe-kebab-scroll.mjs, which scrolls the real
        // #main-content with a bubble-phase counterfactual alongside.
        scroller.dispatchEvent(new w.Event("scroll", { bubbles: true }));
      });

      expect(doc().querySelector('[role="group"]')).toBeNull();
      scroller.remove();
    } finally {
      await h.unmount();
    }
  });

  it("STAYS OPEN when the scroll came from inside the menu", async () => {
    // The dismissal's own trap. A capture listener on the document hears every
    // scroll in the page including the menu's own, and .menu carries
    // max-height + overflow-y:auto as the height-prediction backstop — so on a
    // short viewport the menu really does scroll. Without the guard, reaching
    // the last rows by scrolling would close the menu on the way, and the
    // forking rows ARE the last two: Compare and Restore would be exactly the
    // actions made unreachable.
    //
    // Paired with the case above, which scrolls a node OUTSIDE the menu and
    // asserts it closes. Neither direction means anything alone: "stays open"
    // is equally true of a menu with no listener at all.
    const h = await mountReact(LessonKebabMenu);
    try {
      await openOn(h);

      const w = (globalThis as unknown as { window: { Event: typeof Event } })
        .window;
      const row = menuButtons()[0];
      expect(row).toBeDefined();
      await act(async () => {
        row.dispatchEvent(new w.Event("scroll", { bubbles: true }));
      });

      expect(doc().querySelector('[role="group"]')).not.toBeNull();
    } finally {
      await h.unmount();
    }
  });

  it("registers the scroll listener in the CAPTURE phase", () => {
    // A source assertion, and it is here because no behavioural test in this
    // harness can cover it (see above). Drop the `true` and the menu keeps
    // passing every other test in this file while going completely inert
    // against the only scroll container this app actually scrolls — the exact
    // "looks correct, passes review, does nothing" failure the gate warned
    // about. Cheap pin against a plausible future tidy-up.
    const src = readFileSync(
      fileURLToPath(
        new URL("../components/weekly/lesson-kebab-menu.tsx", import.meta.url),
      ),
      "utf8",
    );
    expect(src).toMatch(
      /document\.addEventListener\(\s*"scroll",\s*dismiss,\s*true\s*\)/,
    );
  });

  it("closes on window resize", async () => {
    const h = await mountReact(LessonKebabMenu);
    try {
      await openOn(h);

      const w = (
        globalThis as unknown as {
          window: { Event: typeof Event; dispatchEvent: (e: Event) => boolean };
        }
      ).window;
      await act(async () => {
        w.dispatchEvent(new w.Event("resize"));
      });

      expect(doc().querySelector('[role="group"]')).toBeNull();
    } finally {
      await h.unmount();
    }
  });
});
