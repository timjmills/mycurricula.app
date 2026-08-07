import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Lesson, Subject } from "@/lib/types";
import type { LessonSectionContent } from "@/lib/lesson-flow";

// The Day focus card must describe THE LESSON IT IS SHOWING.
//
// Two things on it did not, and both were confident about it:
//
//   1. The flow strip painted a module constant —
//      `FLOW_STEPS = ["Warm-up", "Mini-lesson", "Guided practice",
//      "Exit ticket"]` (DayFocus.tsx:83 and DayC.tsx:35 before this change).
//      Every lesson in the app showed those four names. They are the 7.21
//      mockup's placeholder (source-home/views-c.jsx:44), where the fixture
//      data carries no sections at all — but they are not even this app's
//      DEFAULT flow, which is `gradual-release` ("Focus Lesson — I Do" …
//      "Debrief", lib/lesson-templates.ts:532). So the card contradicted the
//      lesson plan for a default lesson, and had nothing to do with a lesson on
//      any of the other 14 templates.
//   2. The footer painted `lesson.standards[0] ?? "—"` (DayFocus.tsx:309,
//      DayC.tsx:251, and DayB.tsx:256's meta cell). A lesson tagged with four
//      standards showed one and dropped three, with nothing on screen to say a
//      list had been truncated.
//
// THE EMPTY CASES ARE PINNED AS HARD AS THE POPULATED ONES, and that is the
// point of the file. A "fix" that keeps a fallback for the no-sections case —
// four plausible chips when the lesson has no phases — passes every
// "the real headings render" assertion while leaving the original lie exactly
// where it was, for the lessons most likely to be looked at (a fresh one). The
// same holds for standards: the card must be able to say "none", out loud.
//
// These render the SHIPPED components rather than a helper, for the reason
// tests/day-post-action.test.ts and tests/teach-false-empty.test.ts give:
// vitest runs `environment: "node"`, but `react-dom/server` renders to a STRING
// there with no jsdom and no new dependency. The pure derivations in
// components/day-v2/util are ALSO asserted directly, because the render can
// only reach the cases a fixture can express.
//
// Class names are deliberately never matched: CSS-module identities are not
// stable under the test transform. The assertions key off the rendered TEXT and
// off the numbered disc `<b>N</b>`, which is what a teacher actually reads.

const store = vi.hoisted(() => ({
  subjectById: {} as Record<string, Subject>,
  units: [] as unknown[],
  sections: {} as Record<string, LessonSectionContent[]>,
  standards: {} as Record<string, string>,
  /** Forces `deriveDayStatus` for the footer tests below. `null` = passthrough,
   *  so every other test in this file sees the real derivation. */
  forcedStatus: null as string | null,
}));

// THE DERIVED STATUS IS FORCED, NOT ARRANGED. `deriveDayStatus` reads the wall
// clock through `useNowMin()` and the lesson's timetable band, so "now" and
// "upcoming" cannot be produced by a fixture — a test that tried would pass or
// fail depending on the hour it ran. What the footer tests assert is the
// mapping FROM a DayStatus TO what the card prints, which is this file's
// business; how the status is derived is lib/day-status's, and it has its own
// tests. Everything else in the module (notably `currentAndNext`, which
// `pickFocus` calls) is passed through untouched.
vi.mock("@/lib/day-status", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/day-status")>();
  return {
    ...actual,
    deriveDayStatus: (...args: Parameters<typeof actual.deriveDayStatus>) =>
      (store.forcedStatus as ReturnType<typeof actual.deriveDayStatus>) ??
      actual.deriveDayStatus(...args),
  };
});

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    subjectById: store.subjectById,
    units: store.units,
    setLessonStatus: () => {},
    lessons: [],
    getSections: (id: string) => store.sections[id] ?? [],
    // Faithful to the real contract (planner-store: "returns the code itself
    // when unknown"), so the "don't paste a title identical to the label"
    // branch is exercised rather than assumed away.
    describeStandard: (code: string) => store.standards[code] ?? code,
  }),
  usePlannerDataState: () => "settled",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
}));

// The unit pop-in reaches for the workspace host context, which no test
// provides — stub it out; it is not what these assert.
vi.mock("@/components/unit-chip", () => ({
  UnitChip: () => null,
}));

const { DayFocus } = await import("@/components/day-v2/DayFocus");
const { DayB } = await import("@/components/day-v2/DayB");
const { lessonFlowSteps, splitStandardChips, STANDARD_CHIP_LIMIT } =
  await import("@/components/day-v2/util");

// ── Fixtures ────────────────────────────────────────────────────────────────

const SUBJECT = {
  id: "math",
  name: "Math",
  cls: "math",
  color: "var(--subj-1)",
} as unknown as Subject;

const LESSON_ID = "m-12-0";

function lesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: LESSON_ID,
    subject: "math",
    unit: "u1",
    title: "Fractions on a number line",
    objective: "I can place a fraction on a number line.",
    preview: "",
    directions: "",
    week: 12,
    day: 0,
    status: "planned",
    archived: false,
    modified: false,
    resources: [],
    standards: [],
    ...overrides,
  } as unknown as Lesson;
}

function section(
  id: string,
  heading: string,
  extra: Partial<LessonSectionContent> = {},
): LessonSectionContent {
  return {
    id,
    templateSectionId: null,
    heading,
    prompt: "",
    body: "",
    resources: [],
    ...extra,
  };
}

/** The app's DEFAULT flow (lib/lesson-templates `gradual-release`), abridged.
 *  Chosen on purpose: it is what a teacher who changed nothing actually has,
 *  and it shares not one word with the placeholder array. */
const REAL_FLOW: LessonSectionContent[] = [
  section("s1", "Focus Lesson — I Do", { minutes: 10 }),
  section("s2", "Guided Instruction — We Do", { minutes: 15 }),
  section("s3", "Debrief", { minutes: 5, body: "<p>What did we learn?</p>" }),
];

/** The four names the card used to paint on every lesson in the app. */
const PLACEHOLDER_STEPS = [
  "Warm-up",
  "Mini-lesson",
  "Guided practice",
  "Exit ticket",
];

const BASE_PROPS = {
  week: 12,
  day: 0,
  dayLabel: "Sunday",
  dateLabel: "Jun 14 · 2026",
  isToday: true,
  selectedId: LESSON_ID,
  onSelect: () => {},
  onShiftDay: () => {},
  onPlan: () => {},
  onQuickAdd: () => {},
  quickAdding: false,
  quickAddError: null,
};

type DayFrame = typeof DayFocus;

function render(Frame: DayFrame, l: Lesson): string {
  return renderToStaticMarkup(
    createElement(Frame, { ...BASE_PROPS, dayLessons: [l] }),
  );
}

beforeEach(() => {
  store.subjectById = { math: SUBJECT };
  store.units = [];
  store.sections = {};
  store.standards = {};
  store.forcedStatus = null;
});

// ── The footer says the status ONCE ─────────────────────────────────────────
// The card carried two status labels, side by side and always both: a `.dchip`
// from `statusLine(status)` and, 8px later, the `<FinishPill>` — which prints
// its own word (planner-v2 `STATUS_WORD`, plus a "Done" branch). The pairs the
// audit's #4 named, and the two it did not:
//
//   done      "Complete"    +  "Done"      two words, one fact
//   idle      "Planned"     +  "Planned"   the SAME string, twice
//   upcoming  "Planned"     +  "Up next"   the pill says more
//   now       "In progress" +  "Finish"    a state and an ACTION — both earn it
//
// So these assert a rule, not a special case: the chip speaks only where the
// pill does not. `idle` is pinned as hard as `done` because it was the worse
// of the two and no one had written it down.

describe("focus card — the status is stated once", () => {
  /** Occurrences of a word in the rendered markup, attribute text included —
   *  deliberately, since a `title=` that repeats the visible word is the same
   *  redundancy in a different place. */
  const count = (html: string, word: string): number =>
    html.split(word).length - 1;

  it("drops the status chip when the lesson is done — the pill already says so", () => {
    store.forcedStatus = "done";
    const html = render(DayFocus, lesson({ status: "done" }));

    // The pill is the survivor: it is the label AND the control.
    expect(html).toContain("Done");
    // …and the chip's word for the same fact is gone entirely.
    expect(count(html, "Complete")).toBe(0);
  });

  it("never prints 'Planned' twice for an idle lesson", () => {
    store.forcedStatus = "idle";
    const html = render(DayFocus, lesson());

    // Exactly one — the pill's. Before the fix this was two, 8px apart.
    expect(count(html, "Planned")).toBe(1);
  });

  it("lets the pill's 'Up next' stand alone rather than adding a vaguer chip", () => {
    store.forcedStatus = "upcoming";
    const html = render(DayFocus, lesson());

    expect(html).toContain("Up next");
    expect(count(html, "Planned")).toBe(0);
  });

  it("KEEPS the chip while a lesson is running — 'Finish' is an action, not a status", () => {
    store.forcedStatus = "now";
    const html = render(DayFocus, lesson());

    // This is the one pair that is not redundant, and it must survive a fix
    // aimed at the ones that are.
    expect(count(html, "In progress")).toBe(1);
    expect(html).toContain("Finish");
  });
});

// ── The lesson flow ─────────────────────────────────────────────────────────

describe("focus card — the lesson flow is the lesson's own", () => {
  it("renders the lesson's real phases, numbered, and none of the placeholders", () => {
    store.sections = { [LESSON_ID]: REAL_FLOW };
    const html = render(DayFocus, lesson());

    expect(html).toContain("Focus Lesson — I Do");
    expect(html).toContain("Guided Instruction — We Do");
    expect(html).toContain("Debrief");
    // The numbered disc, so this is the flow strip and not some other text.
    expect(html).toContain("<b>1</b>");
    expect(html).toContain("<b>3</b>");

    for (const fake of PLACEHOLDER_STEPS) expect(html).not.toContain(fake);
  });

  it("shows each phase's planned length, and nothing when it has none", () => {
    store.sections = {
      [LESSON_ID]: [
        section("s1", "Launch", { minutes: 10 }),
        section("s2", "Explore"), // no minutes — the optional-minutes rule
      ],
    };
    const html = render(DayFocus, lesson());

    // VISIBLE minutes. `>10 min<` is a text node, so it cannot match the
    // `title="…"` copy below — which is the whole reason this is not a bare
    // `/\d+ min/g` over the document any more. It used to be, and it went red
    // the moment the minutes were ALSO written into the chip's title (Wave-F0,
    // because ≤480px hides the visible run). The assertion's intent never
    // changed: exactly one phase carries a time, so exactly one phase shows one.
    expect(html.match(/>10 min</g)).toEqual([">10 min<"]);
    expect(html.match(/>\d+ min</g)).toHaveLength(1);

    // TITLE minutes — the phone tier's only copy, so it is pinned as hard as
    // the visible one. The phase WITHOUT minutes must carry a bare label: no
    // dangling separator, no invented time (lib/lesson-flow, 6.11.26 §7).
    expect(html).toContain('title="Launch · 10 min"');
    expect(html).toContain('title="Explore"');
  });

  it("puts the phase's own written body on the chip, so it is reachable", () => {
    store.sections = {
      [LESSON_ID]: [
        section("s1", "Debrief", { body: "<p>What did we <b>learn</b>?</p>" }),
      ],
    };
    const html = render(DayFocus, lesson());
    // Rich text, flattened — the title must be the teacher's words, not markup.
    expect(html).toContain("Debrief — What did we learn?");
  });

  it("says the flow is empty rather than filling it in", () => {
    store.sections = { [LESSON_ID]: [] };
    const html = render(DayFocus, lesson());

    expect(html).toContain("No lesson flow yet");
    // THE ASSERTION THAT MATTERS: no fallback strip. A numbered disc here means
    // something got painted for a lesson that has no phases.
    expect(html).not.toContain("<b>1</b>");
    for (const fake of PLACEHOLDER_STEPS) expect(html).not.toContain(fake);
  });
});

// ── The standards ───────────────────────────────────────────────────────────

describe("focus card — every standard, or an honest none", () => {
  it("renders all four when four fit", () => {
    const codes = ["5.NF.B.3", "5.NF.B.4", "5.NF.B.5", "5.NF.B.6"];
    const html = render(DayFocus, lesson({ standards: codes }));

    for (const code of codes) expect(html).toContain(`>${code}</span>`);
    expect(html).not.toContain("more");
  });

  it("collapses past the limit WITHOUT losing the collapsed codes", () => {
    const codes = ["5.NF.B.3", "5.NF.B.4", "5.NF.B.5", "5.NF.B.6", "5.NF.B.7"];
    store.standards = { "5.NF.B.7": "Solve real world problems." };
    const html = render(DayFocus, lesson({ standards: codes }));

    // Three painted as chips…
    for (const code of codes.slice(0, 3))
      expect(html).toContain(`>${code}</span>`);
    // …the rest folded into one chip that names how many…
    expect(html).toContain("+2 more");
    expect(html).not.toContain(">5.NF.B.6</span>");
    // …and still carries them, with wording where the catalog has it. This is
    // the difference between collapsing and dropping.
    expect(html).toContain("5.NF.B.6");
    expect(html).toContain("5.NF.B.7 — Solve real world problems.");
  });

  it("hangs the catalog wording off a chip, but not a title that repeats it", () => {
    store.standards = { "5.NF.B.3": "Interpret a fraction as division." };
    const html = render(
      DayFocus,
      lesson({ standards: ["5.NF.B.3", "UNKNOWN.1"] }),
    );

    expect(html).toContain('title="Interpret a fraction as division."');
    // An unknown code describes to itself; a title identical to the visible
    // text teaches nothing, so it must be omitted rather than duplicated.
    expect(html).not.toContain('title="UNKNOWN.1"');
    expect(html).toContain(">UNKNOWN.1</span>");
  });

  it("says 'No standards' instead of an em dash that could mean anything", () => {
    const html = render(DayFocus, lesson({ standards: [] }));

    expect(html).toContain("No standards");
    expect(html).toContain("no standards tagged yet");
    expect(html).not.toContain(">—</span>");
  });
});

// ── Resources ───────────────────────────────────────────────────────────────

describe("focus card — resources are counted off the lesson's sections", () => {
  it("counts every section's resources, and says nothing when there are none", () => {
    store.sections = {
      [LESSON_ID]: [
        section("s1", "Launch", {
          resources: [
            { id: "r1", type: "slides", label: "Deck" },
            { id: "r2", type: "link", label: "Article" },
          ],
        }),
        section("s2", "Explore", {
          resources: [{ id: "r3", type: "link", label: "Task" }],
        }),
      ],
    };
    expect(render(DayFocus, lesson())).toContain("3 resources");

    // Matched narrowly: the Post button's own tooltip says "resources on the
    // wall", so a bare `not.toContain("resource")` fails on a correct card.
    store.sections = { [LESSON_ID]: [section("s1", "Launch")] };
    expect(render(DayFocus, lesson())).not.toMatch(/\d+ resources?</);
  });

  it("uses the singular for one", () => {
    store.sections = {
      [LESSON_ID]: [
        section("s1", "Launch", {
          resources: [{ id: "r1", type: "link", label: "Task" }],
        }),
      ],
    };
    expect(render(DayFocus, lesson())).toContain("1 resource<");
  });
});

// ── The retained legacy frame ───────────────────────────────────────────────
// DayB's handoff panel has meta cells and NO flow strip, so only its standards
// cell is in scope here. It is reachable at /daily?dayview=b and is kept until
// the user decides what to merge or delete — a frame still on the tree that
// still lies is still a lie.
//
// DayC's two cases used to live here and went with the file (Wave-F0). It was
// the focus card's parent carrying a second copy of the same hero, so
// `?dayview=c` compared the default against itself; the copies had already
// diverged (only the shipping card counts resources), which made the alias a
// way to see a WORSE card rather than a different one. Its coverage is not
// lost — every assertion it made about the flow strip and the standards group
// is made above against DayFocus, which is the code that ships.

describe("legacy frames", () => {
  it("DayB's meta cell lists every standard and pluralises its label", () => {
    const html = render(DayB, lesson({ standards: ["5.NF.B.3", "5.NF.B.4"] }));
    expect(html).toContain("Standards</span>");
    expect(html).toContain("5.NF.B.3, 5.NF.B.4");
  });

  it("DayB keeps the singular label for one, and says none for none", () => {
    expect(render(DayB, lesson({ standards: ["5.NF.B.3"] }))).toContain(
      "Standard</span>",
    );
    const none = render(DayB, lesson({ standards: [] }));
    expect(none).toContain("None tagged");
    expect(none).not.toContain(">—</span>");
  });
});

// ── The pure derivations ────────────────────────────────────────────────────
// The cases a rendered fixture cannot conveniently reach.

describe("lessonFlowSteps", () => {
  it("numbers positionally and falls back to the position, never to a name", () => {
    const steps = lessonFlowSteps([
      section("s1", "Launch"),
      section("s2", "   "),
      section("s3", "<p></p>"),
    ]);
    expect(steps.map((s) => s.label)).toEqual(["Launch", "Phase 2", "Phase 3"]);
    expect(steps.map((s) => s.n)).toEqual([1, 2, 3]);
    expect(steps.map((s) => s.key)).toEqual(["s1", "s2", "s3"]);
  });

  it("treats a non-positive or non-finite length as no length at all", () => {
    const steps = lessonFlowSteps([
      section("s1", "A", { minutes: 0 }),
      section("s2", "B", { minutes: -5 }),
      section("s3", "C", { minutes: Number.NaN }),
      section("s4", "D", { minutes: null }),
      section("s5", "E", { minutes: 12 }),
    ]);
    expect(steps.map((s) => s.minutes)).toEqual([null, null, null, null, 12]);
  });

  it("flattens a rich-text heading and body to one line", () => {
    const [step] = lessonFlowSteps([
      section("s1", "<b>Focus</b>&nbsp;Lesson", {
        body: "<p>Model it.</p>\n<p>Then ask.</p>",
      }),
    ]);
    expect(step.label).toBe("Focus Lesson");
    expect(step.detail).toBe("Model it. Then ask.");
  });

  it("returns an empty list for a lesson with no sections", () => {
    expect(lessonFlowSteps([])).toEqual([]);
  });
});

describe("splitStandardChips", () => {
  it("shows one past the limit rather than collapsing a single code", () => {
    const codes = Array.from(
      { length: STANDARD_CHIP_LIMIT + 1 },
      (_, i) => `C.${i}`,
    );
    expect(splitStandardChips(codes)).toEqual({ shown: codes, hidden: [] });
  });

  it("collapses everything past the limit once there are two to collapse", () => {
    const codes = Array.from(
      { length: STANDARD_CHIP_LIMIT + 2 },
      (_, i) => `C.${i}`,
    );
    const split = splitStandardChips(codes);
    expect(split.shown).toHaveLength(STANDARD_CHIP_LIMIT);
    expect(split.hidden).toHaveLength(2);
    // Nothing may vanish between the two lists.
    expect([...split.shown, ...split.hidden]).toEqual(codes);
  });

  it("drops blanks and duplicates without consuming a slot twice", () => {
    expect(splitStandardChips(["A", " A ", "", "  ", "B"])).toEqual({
      shown: ["A", "B"],
      hidden: [],
    });
  });

  it("has nothing to show for no standards", () => {
    expect(splitStandardChips([])).toEqual({ shown: [], hidden: [] });
  });
});
