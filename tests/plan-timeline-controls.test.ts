// plan-timeline-controls.test.ts — the Plan timeline's chrome controls: the
// `.cp-root button` reset trap, and the zoom tooltip's honesty.
//
// WHY THIS FILE EXISTS. Two defects measured live on 2026-07-31
// (docs/audits/2026-07-31-qa-plan-timeline.md):
//
//   #1  `.cp-root button` (app/tokens.css:1128) is (0,1,1) and beat five
//       single-class rules in timeline.module.css, stripping their padding,
//       border, background and cursor. The two axis-scroll arrows — which
//       TimelineCanvas.tsx:113-115 documents as the ONLY mouse route across a
//       year-long axis — computed to 5.1 × 28px bare glyphs and shipped.
//   #3  The zoom slider's tooltip promised "Lesson titles appear on the bars
//       once the columns are wide enough." No dot has ever carried text at any
//       width; the feature was deliberately dropped
//       (TimelineLaneRow.tsx:296-315).
//
// WHAT THIS FILE CAN AND CANNOT PROVE. A `renderToStaticMarkup` string has NO
// computed style — there is no cascade, no `.cp-root` ancestor and no layout —
// so a test here that claimed "the arrow is 44px" would be theatre. The
// geometry is proved where geometry lives, in a real browser:
// `scripts/probe-plan-timeline-controls.mjs`, which measures every control's
// computed box in Chrome AND hit-tests every lesson dot, and was SEEN TO FAIL
// on both passes before it was believed.
//
// What IS deterministically assertable here is the pair the browser probe
// cannot pin: that the stylesheet doubles every one of those five class
// selectors (the fix), that the markup really carries those classes (so the
// stylesheet fix reaches something), and that the tooltip copy changed — with
// the corrected sentence asserted POSITIVELY and IN FULL, because an
// absence-assertion alone fails open against a render that produced nothing,
// and a prefix-assertion fails open against a false clause in the half it
// never reads (which is exactly how the first correction shipped one).
//
// WHY react-dom/server. vitest runs `environment: "node"`; react-dom/server
// renders to a STRING there with no jsdom and no new dependency — the technique
// tests/plan-timeline-authoring.test.ts:19-21 already uses.

import { describe, it, expect, vi, beforeAll } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Lesson, Subject, Unit } from "@/lib/types";
import {
  ROOMY_MIN_COL,
  zoomNameFor,
} from "@/components/hub-v2/timeline/use-column-metrics";

const store = vi.hoisted(() => ({
  editMode: "master" as "personal" | "master",
  lessons: [] as Lesson[],
  subjects: [] as Subject[],
  units: [] as Unit[],
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    lessons: store.lessons,
    subjects: store.subjects,
    subjectById: Object.fromEntries(store.subjects.map((s) => [s.id, s])),
    units: store.units,
    getSections: () => [],
    editUnitFields: () => {},
  }),
  usePlannerDataState: () => "settled",
}));

vi.mock("@/lib/app-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/app-state")>()),
  useAppState: () => ({
    week: 3,
    currentWeek: 3,
    currentWeekBasis: "in-range",
    editMode: store.editMode,
  }),
}));

const MATH = {
  id: "math",
  name: "Math",
  cls: "math",
  icon: "M",
} as unknown as Subject;

const UNIT = {
  id: "u1",
  subject: "math",
  name: "Unit 1 · Place Value",
  weeks: "Wk 1–2",
  startWeek: 1,
  endWeek: 2,
  shade: 2,
} as unknown as Unit;

/** Deliberately THIN — no objective, no resources — so the drawer's
 *  needs-attention count is non-zero and `.drawerCount` actually renders.
 *  Without it that button is absent and its assertion would pass vacuously. */
const THIN_LESSON = {
  id: "l1",
  subject: "math",
  unit: "u1",
  title: "Rounding",
  week: 1,
  day: 0,
  status: "not_done",
  objective: "",
  resources: [],
  standards: [],
  archived: false,
  modified: false,
  moved: null,
} as unknown as Lesson;

const { PlanTimeline } =
  await import("@/components/hub-v2/timeline/PlanTimeline");

/** Same reasoning as tests/plan-timeline-authoring.test.ts:140-142 — the
 *  measured worst case for one render is 758ms, so this is ~20x headroom and
 *  still finite. A render that never returns fails LOUDLY and by name. */
const RENDER_BUDGET_MS = 15_000;

/** The Plan timeline's stylesheet, read as TEXT. The cascade fix is a fact
 *  about this file and about nothing else — the rendered string cannot show
 *  it, and the browser probe can only show its consequence. */
const CSS = readFileSync(
  fileURLToPath(
    new URL(
      "../components/hub-v2/timeline/timeline.module.css",
      import.meta.url,
    ),
  ),
  "utf8",
);

/** The five button classes `.cp-root button` was measured stripping. */
const RESET_EXPOSED = [
  "scrollBtn",
  "zoomReset",
  "bandGrip",
  "drawerToggle",
  "drawerCount",
] as const;

/**
 * Every place `.<cls>` appears in the stylesheet WITHOUT being doubled.
 *
 * Returned with surrounding context so a failure names the offending rule
 * rather than merely asserting a count. Pseudo-ELEMENT rules (`::before`) are
 * excluded: `.cp-root button` matches the button, not its generated content,
 * so those rules are never in the reset's path and doubling them would be
 * cargo cult.
 */
function undoubledUses(cls: string): string[] {
  const doubled = `.${cls}.${cls}`;
  // Blank out comments and the doubled compounds, preserving LENGTH so every
  // offset still lines up with the real file. (Comments matter: this file
  // names its own selectors in prose, and a prose mention is not a rule.)
  const masked = CSS.replace(/\/\*[\s\S]*?\*\//g, (c) =>
    c.replace(/[^\n]/g, " "),
  )
    .split(doubled)
    .join(" ".repeat(doubled.length));
  const re = new RegExp(`\\.${cls}(?![A-Za-z0-9_-])`, "g");
  const out: string[] = [];
  for (const m of masked.matchAll(re)) {
    // The whole compound selector this class sits in — up to the next `,` or
    // `{`, whichever comes first.
    const tail = masked.slice(m.index);
    const end = Math.min(
      ...[",", "{"].map((c) => {
        const i = tail.indexOf(c);
        return i < 0 ? tail.length : i;
      }),
    );
    if (tail.slice(0, end).includes("::")) continue; // a pseudo-element rule
    out.push(CSS.slice(Math.max(0, m.index - 40), m.index + 40));
  }
  return out;
}

let html = "";

beforeAll(() => {
  store.subjects = [MATH];
  store.units = [UNIT];
  store.lessons = [THIN_LESSON];
  // Team Curriculum mode: `.bandGrip` is rendered only when band authoring is
  // enabled (PlanTimeline.tsx:383), so Personal mode would make one of the
  // assertions below vacuous.
  store.editMode = "master";

  const t0 = Date.now();
  html = renderToStaticMarkup(
    createElement(PlanTimeline, { query: "", onOpenDoc: () => {} }),
  );
  const ms = Date.now() - t0;
  if (ms > RENDER_BUDGET_MS) {
    throw new Error(
      `PlanTimeline render took ${ms}ms (budget ${RENDER_BUDGET_MS}ms) — that is a hang, not load`,
    );
  }
}, 60_000);

describe("Plan timeline — the `.cp-root button` reset cannot strip the chrome", () => {
  it("renders every reset-exposed control, so the assertions below are not vacuous", () => {
    // The control for this whole describe block. If the surface fell back to
    // <PlannerEmpty> these class checks would all pass by accident of absence.
    expect(html).toContain("data-lane-subject");
    for (const cls of RESET_EXPOSED) {
      expect(html, `${cls} is not in the rendered markup`).toContain(cls);
    }
  });

  it.each(RESET_EXPOSED)(
    "doubles `.%s` in the stylesheet, everywhere it is used",
    (cls) => {
      // Present at all — guards against a rename silently emptying the check.
      expect(CSS).toContain(`.${cls}.${cls}`);
      // And nowhere left un-doubled. This is the half that matters: a
      // single-class rule in a media query is DEAD against a doubled base
      // (media queries add no specificity), so a half-applied fix would leave
      // the coarse-pointer 44px bump silently inert.
      expect(
        undoubledUses(cls),
        `un-doubled \`.${cls}\` rules survive — \`.cp-root button\` (0,1,1) beats them`,
      ).toEqual([]);
    },
  );

  it("sizes the grip by the COLUMN, not by a breakpoint of its own", () => {
    // Finding #2, and the regression that answering it naively caused. A band's
    // right edge is exactly `--tl-col / 2` from its last lesson dot's centre
    // (TimelineLaneRow.tsx:210,304), so a grip wider than half a column
    // necessarily covers that lesson — at 44px, 15 of 310 dots became
    // untappable. The width is therefore capped against the live column rather
    // than pinned in a media query, which is what makes it hold at EVERY zoom
    // stop instead of at the one a probe happened to sample.
    expect(CSS).toContain("min(var(--tl-grip), calc(var(--tl-col) / 2");

    // THE REAL ASSERTION: the grip's width is declared in exactly ONE place.
    //
    // The previous version of this test counted
    // `/@media \(any-pointer: coarse\), \(max-width/` and asserted 1 — but the
    // file has THREE `any-pointer: coarse` blocks and that regex only matched
    // the comma form, so appending
    //   `@media (any-pointer: coarse) { .bandGrip.bandGrip { width: 30px } }`
    // — precisely the third-breakpoint regression the test is NAMED for — left
    // the count at 1 and the suite green. Counting the grip's own `width`
    // declarations cannot be dodged that way: a re-introduced breakpoint has to
    // declare a width to do anything.
    const gripWidths = [...CSS.matchAll(/(\.bandGrip[^{}]*)\{([^{}]*)\}/g)]
      // `::before` is the grip's visual MARK — a different box with its own
      // 2px width, and not the hit area this is about.
      .filter(([, selector]) => !selector.includes("::"))
      .map(([, , body]) => body)
      .filter((body) => /(^|[;\s])width\s*:/.test(body));
    expect(
      gripWidths,
      "the grip's width is declared more than once — a second declaration means a breakpoint is overriding the column cap",
    ).toHaveLength(1);
    expect(gripWidths[0]).toContain("min(");

    // And the real block count, on a regex that sees BOTH `@media (…coarse)`
    // and `@media (…coarse), (max-width: …)`.
    const coarseBlocks = CSS.match(/@media[^{]*any-pointer:\s*coarse/g) ?? [];
    expect(coarseBlocks).toHaveLength(3);
  });
});

describe("Plan timeline — the zoom tooltip describes the control it actually is", () => {
  /** The whole string, asserted as a whole. Checking only the opening clause is
   *  how the FIRST correction shipped with a second false promise in its unread
   *  half: "…easier to tell apart AND TO TAP". A dot's target is `--tl-hit`
   *  (22px fine / 44px coarse) and is independent of `--tl-col`, so widening a
   *  column never enlarges one.
   *
   *  ── THE TITLE CLAUSE IS BACK, AND THIS FILE IS WHY IT IS ALLOWED TO BE ──
   *  It was removed because the feature did not exist. It is restated now
   *  because the feature was BUILT (`ph-units.jsx:616`), and the two assertions
   *  below are what keep that from being taken on trust: the tooltip may only
   *  name the threshold that the code actually uses, and the markup must really
   *  carry a title on every dot. If the pill is ever removed again, the second
   *  of those turns red and this copy has to come out with it. */
  const TOOLTIP =
    "Sets how much of the year fits on screen. Narrow to take in more months at once; widen to spread the days out so individual lessons are easier to tell apart — past 80 pixels a day, each lesson shows its title.";

  it("does not promise that widening enlarges a lesson's target", () => {
    expect(html).not.toContain("to tap");
  });

  it("carries the verified copy, in full", () => {
    // The POSITIVE half. Asserting only the absences would pass just as happily
    // against a tooltip that was deleted outright, or against a render that
    // never produced the slider at all.
    expect(html).toContain(`title="${TOOLTIP}"`);
    // Not a restatement of its own label (CLAUDE.md §4).
    expect(html).toContain('aria-label="Timeline zoom');
  });

  it("names the threshold the code actually branches on", () => {
    // The tooltip says "80". `zoomNameFor` is what decides. A tooltip naming a
    // number the canvas does not use is the same class of lie as naming a
    // feature that does not exist — one revision subtler.
    expect(TOOLTIP).toContain(`past ${ROOMY_MIN_COL} pixels a day`);
    expect(zoomNameFor(ROOMY_MIN_COL)).toBe("roomy");
    expect(zoomNameFor(ROOMY_MIN_COL - 1)).not.toBe("roomy");
  });

  it("the titles it promises are really in the markup", () => {
    // THE PROMISE, CHECKED AGAINST THE RENDER. This is the assertion whose
    // absence let the original false tooltip ship: nothing tied the sentence to
    // the canvas, so the sentence outlived the feature it described by a whole
    // wave. Every dot carries its title as a `.dotTitle` span, always in the
    // DOM and revealed by `[data-zoom="roomy"]` — so the count here is the
    // number of dots, not zero.
    const titles = html.match(/_dotTitle_[a-z0-9]+/g) ?? [];
    expect(titles.length).toBeGreaterThan(0);
    // And the stylesheet really does gate them on the attribute the tooltip's
    // threshold produces — a span that is `display:none` at every zoom would
    // satisfy the count above and still show a teacher nothing.
    expect(CSS).toMatch(/\.card\[data-zoom="roomy"\]\s+\.dotTitle\s*\{[^}]*display:\s*block/);
  });
});
