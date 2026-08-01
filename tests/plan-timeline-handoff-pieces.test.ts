// plan-timeline-handoff-pieces.test.ts — the four handoff pieces built for
// task #27, each pinned against the handoff source it was read from.
//
// WHAT EACH PIECE IS AND WHERE IT COMES FROM (line numbers are reads of
// `Documents/Claude Design/7.21.26 Design Handoff Update/source-planning-hub/`,
// which is reference material and is never imported by the app):
//
//   1  Needs Attention gains the RUNNING-LATE predicate and severity grouping
//      — `ph-drawer.jsx:34-38` and `:47-48` / `:81`. The drawer also gains the
//      third tab the live sweep found missing (`hasLessonLibraryTab: false`,
//      docs/audits/2026-07-31-qa-plan-timeline.md §11).
//   2  Lesson titles on the marks at the roomy zoom — `ph-units.jsx:314,616`
//      and `ph-v2.css:1644-1653`.
//   3  Drawer resize + double-click collapse — `ph-drawer.jsx:55,76-79,116,135`
//      and `ph-v2.css:963-965,1022`.
//   4  The Timeline|List pair restricted to the Units lens —
//      `ph-units.jsx:483`, with the body always a list at `:527-529`.
//
// ── WHAT THIS FILE CAN AND CANNOT PROVE ──────────────────────────────────
// vitest runs `environment: "node"`. `react-dom/server` renders to a STRING
// there (the technique tests/plan-timeline-authoring.test.ts:19-21 established)
// — so there is markup to assert against, but NO cascade, NO computed style and
// NO layout. Every geometric claim in this file is therefore made about the
// STYLESHEET TEXT, never about a rendered box; the boxes are measured in Chrome
// by the live pass. An assertion here that claimed "the pill is 22px" would be
// theatre.
//
// ── EVERY ABSENCE ASSERTION IS PAIRED ────────────────────────────────────
// An absence check fails open: `not.toContain("Timeline")` passes just as
// happily against a render that produced nothing at all. So each one below sits
// beside a positive control taken from the SAME html string — usually a control
// that must still be there when the one under test is gone.

import { describe, it, expect, vi, beforeAll } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ATTENTION_ACTION_HINT,
  ATTENTION_ACTION_LABEL,
  ATTENTION_SEVERITY_LABEL,
  buildLessonLibrary,
  buildNeedsAttention,
  buildUnitLibrary,
  groupAttention,
  type BuildLibraryInput,
} from "@/lib/plan-timeline/library";
import {
  ROOMY_MIN_COL,
  resolvedColumnWidth,
  zoomNameFor,
} from "@/components/hub-v2/timeline/use-column-metrics";
import type { Lesson, Subject, Unit } from "@/lib/types";

const CSS = readFileSync(
  fileURLToPath(
    new URL(
      "../components/hub-v2/timeline/timeline.module.css",
      import.meta.url,
    ),
  ),
  "utf8",
);
const DRAWER_SRC = readFileSync(
  fileURLToPath(
    new URL("../components/hub-v2/timeline/TimelineDrawer.tsx", import.meta.url),
  ),
  "utf8",
);

/* ────────────────────────────────────────────────────────────────────────────
   Piece 1a — the running-late predicate (`ph-drawer.jsx:34-38`)
   ──────────────────────────────────────────────────────────────────────────── */

const LEN = 5;
const AXIS = 200; // 40 weeks

function subject(id: string, name: string): Subject {
  return { id, name, cls: `s-${id}`, color: "#000" } as unknown as Subject;
}
function unit(over: Partial<Unit> & Pick<Unit, "id" | "subject">): Unit {
  return {
    name: `Unit ${over.id}`,
    weeks: "",
    archived: false,
    ...over,
  } as unknown as Unit;
}
function lesson(over: Partial<Lesson> & Pick<Lesson, "id" | "subject">): Lesson {
  return {
    title: `Lesson ${over.id}`,
    unit: "u1",
    week: 1,
    day: 0,
    status: "not_done",
    objective: "I can do the thing",
    resources: [{ id: "r" }],
    standards: ["S1"],
    archived: false,
    modified: false,
    moved: null,
    ...over,
  } as unknown as Lesson;
}
function input(over: Partial<BuildLibraryInput> = {}): BuildLibraryInput {
  return {
    subjects: [subject("math", "Math")],
    units: [],
    lessons: [],
    schoolWeekLen: LEN,
    axisLength: AXIS,
    now: null,
    ...over,
  };
}

/** Build both row sets and the attention list in one go, the way PlanTimeline
 *  does — a test that built them from different inputs could prove agreement
 *  that the app does not have. */
function attentionFor(
  over: Partial<BuildLibraryInput>,
  pace: Parameters<typeof buildNeedsAttention>[2] = null,
) {
  const i = input(over);
  return buildNeedsAttention(buildLessonLibrary(i), buildUnitLibrary(i), pace);
}

describe("Needs Attention — the running-late predicate", () => {
  // A unit over weeks 2–3 of a 5-day week: slots 5..14. Today is slot 10, so
  // it has slots 10..14 left — five teaching days.
  const RUNNING = {
    units: [
      unit({ id: "u1", subject: "math", name: "Fractions", startWeek: 2, endWeek: 3 }),
    ],
  };
  const PACE = { todaySlot: 10, schoolWeekLen: LEN };

  it("raises a unit with more lessons left than days to teach them in", () => {
    // Six untaught lessons from slot 10 on, against five teaching days.
    const lessons = [10, 11, 12, 13, 14, 14].map((slot, n) =>
      lesson({
        id: `l${n}`,
        subject: "math",
        unit: "u1",
        week: Math.floor(slot / LEN) + 1,
        day: slot % LEN,
      }),
    );
    const items = attentionFor({ ...RUNNING, lessons }, PACE);
    const late = items.filter((x) => x.kind === "running_late");
    expect(late).toHaveLength(1);
    expect(late[0].severity).toBe("soon");
    expect(late[0].target).toEqual({ kind: "unit", id: "u1" });
    // The numbers are IN the sentence. "This unit is running late" alone gives
    // a teacher nothing to judge how far behind they are.
    expect(late[0].detail).toContain("6 lessons");
    expect(late[0].detail).toContain("5 teaching days");
  });

  it("does NOT raise a unit that fits in the days it has left", () => {
    // THE PAIRED CONTROL for the absence: same unit, same today, one fewer
    // lesson — and the list must still be a working list, so the off-calendar
    // row from the second lesson set below is the thing that proves the
    // builder ran at all.
    const lessons = [10, 11, 12, 13, 14].map((slot, n) =>
      lesson({
        id: `l${n}`,
        subject: "math",
        unit: "u1",
        week: Math.floor(slot / LEN) + 1,
        day: slot % LEN,
      }),
    );
    const items = attentionFor({ ...RUNNING, lessons }, PACE);
    expect(items.filter((x) => x.kind === "running_late")).toHaveLength(0);
    // Positive control: the SAME call with one more lesson does raise it, so
    // "none" above is a verdict and not a silent no-op.
    const more = attentionFor(
      {
        ...RUNNING,
        lessons: [...lessons, lesson({ id: "x", subject: "math", unit: "u1", week: 3, day: 4 })],
      },
      PACE,
    );
    expect(more.filter((x) => x.kind === "running_late")).toHaveLength(1);
  });

  it("counts TEACHING days, not calendar slots — a holiday is not a day to teach in", () => {
    // The handoff counts `endSlot - TODAY + 1` flat (`ph-drawer.jsx:35`), which
    // tells a teacher a two-week holiday is ten teaching days. Six lessons
    // against five slots of which two are holidays is 6 > 3.
    const lessons = [10, 11, 12, 13, 14, 14].map((slot, n) =>
      lesson({
        id: `l${n}`,
        subject: "math",
        unit: "u1",
        week: Math.floor(slot / LEN) + 1,
        day: slot % LEN,
      }),
    );
    const withHolidays = attentionFor({ ...RUNNING, lessons }, {
      ...PACE,
      isHolidaySlot: (s) => s === 11 || s === 12,
    });
    const late = withHolidays.find((x) => x.kind === "running_late");
    expect(late?.detail).toContain("3 teaching days");
  });

  it("stays silent when today has no known position", () => {
    // `pace === null` is what PlanTimeline passes whenever `currentWeekBasis`
    // is not "in-range". Nothing is late before the year starts.
    const lessons = [10, 11, 12, 13, 14, 14].map((slot, n) =>
      lesson({
        id: `l${n}`,
        subject: "math",
        unit: "u1",
        week: Math.floor(slot / LEN) + 1,
        day: slot % LEN,
      }),
    );
    expect(
      attentionFor({ ...RUNNING, lessons }, null).filter(
        (x) => x.kind === "running_late",
      ),
    ).toHaveLength(0);
    // Paired control: the identical input WITH a pace does raise it.
    expect(
      attentionFor({ ...RUNNING, lessons }, PACE).filter(
        (x) => x.kind === "running_late",
      ),
    ).toHaveLength(1);
  });

  it("ignores a unit today is not inside", () => {
    // `ph-drawer.jsx:36` — `startSlot<=TODAY && endSlot>=TODAY`. A unit that
    // has not begun cannot be behind.
    const lessons = [10, 11, 12, 13, 14, 14].map((slot, n) =>
      lesson({
        id: `l${n}`,
        subject: "math",
        unit: "u1",
        week: Math.floor(slot / LEN) + 1,
        day: slot % LEN,
      }),
    );
    // Today at slot 0 — week 1, before the unit's weeks 2–3.
    expect(
      attentionFor({ ...RUNNING, lessons }, { ...PACE, todaySlot: 0 }).filter(
        (x) => x.kind === "running_late",
      ),
    ).toHaveLength(0);
  });
});

describe("Needs Attention — severity", () => {
  it("gives every kind exactly one severity, and sorts urgent first", () => {
    const items = attentionFor({
      units: [unit({ id: "u1", subject: "math" })],
      lessons: [
        // thin → quality
        lesson({ id: "thin", subject: "math", unit: "u1", objective: "", resources: [], standards: [] }),
        // off-calendar → quality
        lesson({ id: "off", subject: "math", unit: "u1", week: 999, day: 0 }),
      ],
    });
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(["urgent", "soon", "quality"]).toContain(item.severity);
      // Every kind must have a label and an action, or the row renders a blank
      // button — `Record<AttentionKind, …>` makes that a type error, and this
      // is the runtime half for a kind added through a cast.
      expect(ATTENTION_ACTION_LABEL[item.kind]).toBeTruthy();
      expect(ATTENTION_ACTION_HINT[item.kind]).toBeTruthy();
    }
    // Sorted by severity, so the groups below can be built by a single pass.
    const rankOf = { urgent: 0, soon: 1, quality: 2 } as const;
    const ranks = items.map((i) => rankOf[i.severity]);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it("no action hint merely restates its own label (CLAUDE.md §4)", () => {
    // The handoff's own button is `title={is.act}` (`ph-drawer.jsx:228`) — the
    // exact pattern §4 rules out. This is the guard against porting it back.
    for (const kind of Object.keys(ATTENTION_ACTION_LABEL) as (keyof typeof ATTENTION_ACTION_LABEL)[]) {
      const label = ATTENTION_ACTION_LABEL[kind];
      const hint = ATTENTION_ACTION_HINT[kind];
      expect(hint).not.toBe(label);
      // And it teaches rather than names: a hint shorter than its own label
      // plus a few words is a restatement wearing a longer coat.
      expect(hint.length).toBeGreaterThan(label.length + 20);
    }
  });

  it("groupAttention buckets without reordering, and drops empty buckets", () => {
    const items = attentionFor(
      {
        units: [unit({ id: "u1", subject: "math", startWeek: 2, endWeek: 3 })],
        lessons: [
          lesson({ id: "l1", subject: "math", unit: "u1", week: 3, day: 0 }),
          lesson({ id: "l2", subject: "math", unit: "u1", week: 3, day: 1 }),
          lesson({ id: "l3", subject: "math", unit: "u1", week: 3, day: 2 }),
          lesson({ id: "l4", subject: "math", unit: "u1", week: 3, day: 3 }),
          lesson({ id: "l5", subject: "math", unit: "u1", week: 3, day: 4 }),
          lesson({ id: "l6", subject: "math", unit: "u1", week: 3, day: 4 }),
        ],
      },
      { todaySlot: 12, schoolWeekLen: LEN },
    );
    const groups = groupAttention(items);
    expect(groups.length).toBeGreaterThan(0);
    // Flattening a grouping must give the list back unchanged — a grouping that
    // reordered would put the sections in a different order from the sort.
    expect(groups.flatMap((g) => g.items)).toEqual(items);
    // No empty bucket, and each label is the one the map declares.
    for (const g of groups) {
      expect(g.items.length).toBeGreaterThan(0);
      expect(g.label).toBe(ATTENTION_SEVERITY_LABEL[g.severity]);
    }
    // Each severity appears at most once — the single-pass grouping is only
    // correct because the list is severity-sorted, so this is the assertion
    // that would catch the sort being loosened.
    const seen = groups.map((g) => g.severity);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   Piece 2 — the roomy threshold (`ph-units.jsx:314`)
   ──────────────────────────────────────────────────────────────────────────── */

describe("the zoom scale", () => {
  it("reproduces the handoff's three stops exactly", () => {
    // `colw>=80 ? 'roomy' : colw>=30 ? 'cozy' : 'compact'`.
    expect(zoomNameFor(130)).toBe("roomy");
    expect(zoomNameFor(80)).toBe("roomy");
    expect(zoomNameFor(79)).toBe("cozy");
    expect(zoomNameFor(30)).toBe("cozy");
    expect(zoomNameFor(29)).toBe("compact");
    expect(zoomNameFor(16)).toBe("compact");
    expect(ROOMY_MIN_COL).toBe(80);
  });

  it("resolves the column the way the stylesheet does — the FLOOR wins", () => {
    // The whole reason the width is recomputed in JS: a teacher's zoom below
    // the coarse-pointer floor is clamped by `max()` in the cascade, and a
    // `data-zoom` derived from the raw slider value would disagree with what is
    // on screen.
    expect(resolvedColumnWidth(16, { floor: 44, base: 46, ready: true })).toBe(44);
    expect(resolvedColumnWidth(100, { floor: 44, base: 46, ready: true })).toBe(100);
    // Unset zoom falls through to the base, which is itself media-dependent.
    expect(resolvedColumnWidth(null, { floor: 24, base: 34, ready: true })).toBe(34);
    expect(resolvedColumnWidth(null, { floor: 44, base: 46, ready: true })).toBe(46);
  });

  it("the stylesheet reveals the title only at roomy, and keeps the touch floor", () => {
    // STYLESHEET TEXT, not geometry — there is no cascade here (see the header).
    expect(CSS).toMatch(/\.dotTitle\s*\{[^}]*display:\s*none/);
    expect(CSS).toMatch(/\.card\[data-zoom="roomy"\]\s+\.dotTitle\s*\{[^}]*display:\s*block/);
    // The handoff's `height:22px` (`ph-v2.css:1644`) is NOT hard-coded: it would
    // halve every lesson target on a coarse pointer at the top of the zoom
    // range, reintroducing the exact defect `--tl-col-floor` exists to prevent
    // at the bottom of it.
    const roomyDot = CSS.match(/\.card\[data-zoom="roomy"\]\s+\.dot\.dot\s*\{[^}]*\}/)?.[0] ?? "";
    expect(roomyDot).toContain("height: var(--tl-hit)");
    expect(roomyDot).not.toMatch(/height:\s*22px/);
    // And the handoff's own measurements that DO survive.
    expect(roomyDot).toContain("max-width: 102px");
    // RULE #1 — no sharp corners, ever.
    expect(roomyDot).toMatch(/border-radius:\s*var\(--r-pill\)/);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   Pieces 3 + 4 — rendered
   ──────────────────────────────────────────────────────────────────────────── */

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

let html = "";

// 30s on BOTH budgets. The `beforeAll` below dynamically imports PlanTimeline
// and renders the whole canvas to markup once — real work that exceeded
// vitest's 10s HOOK default (a separate budget from testTimeout, which is why
// raising only the latter would not have helped). When that hook timed out the
// suite reported "1 failed, 23 skipped" — every test SKIPPED, nothing asserted,
// and a bare failure count would have read it as no failures. A suite that
// tests nothing must not be mistaken for a suite that passes.
vi.setConfig({ testTimeout: 30000, hookTimeout: 30000 });

beforeAll(async () => {
  store.subjects = [subject("math", "Math")];
  store.units = [
    unit({ id: "u1", subject: "math", name: "Fractions", startWeek: 1, endWeek: 4 }),
  ];
  store.lessons = [
    lesson({ id: "l1", subject: "math", unit: "u1", week: 1, day: 0 }),
    lesson({ id: "l2", subject: "math", unit: "u1", week: 2, day: 1 }),
  ];
  const { PlanTimeline } = await import(
    "@/components/hub-v2/timeline/PlanTimeline"
  );
  html = renderToStaticMarkup(
    createElement(PlanTimeline, { query: "", onOpenDoc: () => {} }),
  );
});

describe("piece 4 — the Timeline|List pair is restricted to the Units lens", () => {
  it("renders the pair in the Units lens (the default)", () => {
    // THE POSITIVE CONTROL for the source-level absence check below: the
    // control exists, and exists in this render, so its conditional gate is a
    // gate and not a deletion.
    expect(html).toContain('aria-label="How the plan is drawn"');
    expect(html).toContain('aria-label="What the plan shows"');
  });

  it("gates that pair on the lens, and forces the Lessons lens to a list", () => {
    // The rendered proof of the OTHER lens needs client state this static
    // render cannot reach, so the gate is pinned at the source instead — and
    // both halves are pinned, because gating the toggle without forcing the
    // body would leave a teacher in the Lessons lens looking at a canvas.
    const src = readFileSync(
      fileURLToPath(
        new URL(
          "../components/hub-v2/timeline/PlanTimeline.tsx",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    expect(src).toContain('lens === "units" && (');
    expect(src).toContain('const drawnMode = lens === "lessons" ? "list" : mode;');
    // The body and the zoom both read the DERIVED mode, never the raw one —
    // this is what would silently rot if someone reverted one of the two.
    expect(src).toContain('drawnMode === "list" ? (');
    expect(src).toContain('drawnMode === "timeline" && (');
    expect(src).not.toContain('{mode === "list" ? (');
  });
});

describe("piece 3 — the drawer resize grip", () => {
  it("carries the handoff's numbers, and applies them as a real height", () => {
    // `ph-drawer.jsx:55` default 246 · `:77` floor 150 and ceiling
    // `innerHeight*0.62`.
    expect(DRAWER_SRC).toContain("const DEFAULT_HEIGHT = 246");
    expect(DRAWER_SRC).toContain("const MIN_HEIGHT = 150");
    expect(DRAWER_SRC).toContain("const MAX_HEIGHT_FRACTION = 0.62");
    // `height`, NOT the handoff's `minHeight` (`:135`) — pinned because the
    // difference was MEASURED, not reasoned. With `min-height` the live drag
    // was inert at all three widths (374→374, 471→471, 414→414): the property
    // is only observable while the content is shorter than it, and this drawer
    // holds 310 lesson rows. Reverting to `minHeight` silently restores a
    // control that does nothing, which is why it is pinned here rather than
    // left to the browser probe alone.
    expect(DRAWER_SRC).toContain("style={{ height: `${height}px` }}");
    expect(DRAWER_SRC).not.toContain("minHeight: `${height}px`");
    // And nothing may cap it back: a fixed `max-height` on the body would
    // reintroduce exactly the inert drag this replaced.
    expect(CSS).not.toMatch(/\.drawerBody\s*\{[^}]*max-height/);
    expect(CSS).toMatch(/\.drawerBody\s*\{[^}]*overflow-y:\s*auto/);
    // INVERTED delta (`:77`, `h0+(y0-ev.clientY)`) — the grip is on the top
    // edge, so dragging up has to make the drawer taller. Getting this
    // backwards is silent: it still resizes, just the wrong way.
    expect(DRAWER_SRC).toContain("clampHeight(h0 + (y0 - ev.clientY))");
    // Double-click collapses (`:116`) — the gesture is pinned in its own test
    // below, along with the single-click regression the review gate caught.
    expect(DRAWER_SRC).toContain("onDoubleClick={");
  });

  it("cleans up on pointercancel, which the handoff omits", () => {
    // A touch drag taken over by the browser's own scrolling fires `cancel` and
    // never fires `up`. Without this the move listener outlives the gesture.
    expect(DRAWER_SRC).toContain('document.addEventListener("pointercancel", up)');
    expect(DRAWER_SRC).toContain('document.removeEventListener("pointercancel", up)');
  });

  it("collapses on DOUBLE-click only — never on a single click", () => {
    // Found by the §4a review gate. A <button> fires `click` at the end of any
    // pointer press, so `onClick={() => setOpen(false)}` closed the drawer at
    // the end of every resize drag — and the only thing preventing it was
    // `preventDefault()` on pointerdown happening to suppress the synthetic
    // click, which is browser-dependent. It also made a single tap on the grip
    // collapse the panel, where the handoff's gesture is a double-click
    // (`ph-drawer.jsx:116`).
    expect(DRAWER_SRC).not.toContain("onClick={() => setOpen(false)}");
    expect(DRAWER_SRC).toContain("onDoubleClick={() => {");
    // And a completed drag suppresses the dblclick it can synthesise, so two
    // quick resizes cannot throw away the panel being sized.
    expect(DRAWER_SRC).toContain("if (draggedRef.current) return;");
  });

  it("has a full keyboard path, because it stops short of 44px on coarse", () => {
    // The one deliberate sub-contract target in this stylesheet. It is only
    // defensible BECAUSE the gesture is reachable without a pointer, so the two
    // are asserted together — dropping the keyboard path must turn this red.
    expect(DRAWER_SRC).toContain('e.key === "ArrowUp" || e.key === "ArrowDown"');
    // Enter/Space collapse EXPLICITLY, now that the general onClick is gone.
    expect(DRAWER_SRC).toContain('e.key === "Enter" || e.key === " "');
    const coarseGrip = CSS.match(/\.drawerGrip\.drawerGrip\s*\{[^}]*height:\s*22px[^}]*\}/);
    expect(coarseGrip).not.toBeNull();
    // And the resting bar is visible without hover — there is none on touch.
    expect(CSS).toMatch(/\.drawerGripBar\s*\{[^}]*background:\s*var\(--hairline\)/);
  });

  it("is doubled against the `.cp-root button` reset", () => {
    // The trap that has now fired four times in this stylesheet. The general
    // guard in tests/timeline-css-specificity.test.ts derives this; pinning the
    // literal here means the failure names the control.
    expect(CSS).toContain(".drawerGrip.drawerGrip");
    expect(CSS).not.toMatch(/^\.drawerGrip\s*\{/m);
    expect(CSS).toContain(".issueAction.issueAction");
    expect(CSS).not.toMatch(/^\.issueAction\s*\{/m);
  });
});

describe("CODE-01 — every token this stylesheet names must exist", () => {
  // Two dead references shipped here (redesign audit CODE-01): `--on-accent`,
  // which is nowhere in the repo and so resolved only through a hard-coded
  // `#fff` fallback, and `--warn-line`, which left the attention chip with a
  // plain border instead of a warn-hued one. Both are INVISIBLE defects — the
  // fallback makes them look deliberate — so the guard is derived rather than
  // spot-checked.
  const TOKENS = readFileSync(
    fileURLToPath(new URL("../app/tokens.css", import.meta.url)),
    "utf8",
  );

  /** Comments stripped first, and that is not incidental: this file names
   *  `--on-accent` and `--warn-line` in prose precisely to record that they do
   *  not exist, so an un-stripped scan reports the fix as the defect. */
  const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, " ");

  it("names no custom property that app/tokens.css never defines", () => {
    const used = new Set(
      [...CSS_CODE.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]),
    );
    // `--tl-*` is this surface's OWN namespace. Some of it is declared here and
    // some is written by the components as inline style (`--tl-stack`,
    // `--tl-levels`, `--tl-col-user`), so the whole prefix is excluded rather
    // than the subset this file happens to declare.
    const missing = [...used].filter(
      (t) => !t.startsWith("--tl-") && !TOKENS.includes(`${t}:`),
    );
    expect(missing, "referenced but defined nowhere in app/tokens.css").toEqual([]);
  });

  it("the reader really can tell a defined token from an undefined one", () => {
    // THE POSITIVE CONTROL. The assertion above is an absence check over a
    // derived set — if the regex stopped matching, it would pass against a
    // stylesheet full of dead tokens. These two prove it discriminates.
    expect(TOKENS).toContain("--on-solid:");
    expect(TOKENS).not.toContain("--on-accent:");
    expect(TOKENS).not.toContain("--warn-line:");
    expect(CSS_CODE).not.toContain("--on-accent");
    expect(CSS_CODE).not.toContain("--warn-line");
    // And the file really does use var() enough for the scan to be meaningful.
    expect([...CSS_CODE.matchAll(/var\(\s*--/g)].length).toBeGreaterThan(50);
    // The scan must also be able to SEE a missing token — proved against a
    // string this file does not contain, so the filter is not vacuous.
    const probe = ".x { color: var(--definitely-not-a-token); }";
    const found = [...probe.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]);
    expect(found.filter((t) => !TOKENS.includes(`${t}:`))).toEqual([
      "--definitely-not-a-token",
    ]);
  });

  it("hard-codes no hex colour (CLAUDE.md §4)", () => {
    // `var(--on-accent, #fff)` was one. Comments are stripped, because this
    // file quotes the handoff's own hexes in prose.
    expect(CSS_CODE.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).toEqual([]);
  });
});

describe("piece 1b — the drawer's third tab", () => {
  it("offers Units, Lessons and Needs attention", () => {
    // The live sweep measured two tabs and `hasLessonLibraryTab: false`
    // (audit §11). The drawer is collapsed in this static render, so the tabs
    // are pinned at the source — with the rendered bar as the control that the
    // component mounted at all.
    expect(html).toContain("Library");
    expect(DRAWER_SRC).toContain('value: "units"');
    expect(DRAWER_SRC).toContain('value: "lessons"');
    expect(DRAWER_SRC).toContain('value: "attention"');
    expect(DRAWER_SRC).toContain('type DrawerTab = "units" | "lessons" | "attention"');
  });

  it("does not claim the plan is clean about a predicate it does not run", () => {
    // The empty-state copy is a list of specific claims, and it now has to
    // cover the predicate this wave added — an empty list that still said
    // nothing about pacing would be denying a check it performs.
    expect(DRAWER_SRC).toContain(
      "no unit has more lessons left than days to teach them",
    );
  });
});
