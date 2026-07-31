import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CommandPaletteBody } from "@/components/shell/command-palette";
import type { Lesson, Subject } from "@/lib/types";

// Regression tests for the ⌘K command palette false-empty — the same defect
// class as the four Planner Hub browse pickers (tests/hub-browse-empty.test.ts,
// commit 11a0001) and the top-bar search panel (tests/search-results-empty
// .test.ts, commit 75d99df).
//
// WHY THIS SURFACE AND NOT THAT OTHER SEARCH BOX. The sibling fix landed on
// components/shell/SearchResults.tsx, which is rendered only by
// components/shell/top-bar.tsx, which renders only inside `if (!V2)` in
// app/(planner)/layout.tsx. The deploy sets NEXT_PUBLIC_V2=1, so that fix
// protects the v1 rollback path. Under v2 the top-bar search button dispatches
// PALETTE_TOGGLE_EVENT, and <GlobalShortcuts> — mounted unconditionally inside
// <PlannerProvider> at app/(planner)/layout.tsx:187, on BOTH flag paths — is
// what answers a teacher's search in production. This palette is that answer.
//
// components/shell/command-palette.tsx rendered
//
//     No results for “<query>”
//
// off `results.length === 0`, consulting NO hydration state. Five of its six
// result sources are module constants; only the lesson bucket reads
// usePlanner().lessons, which is empty for the whole 11–16s Supabase hydrate.
// The denial fires only when every source came back empty — which is precisely
// when the one unknown source is the one that decides the answer — so a teacher
// who opened the palette on arrival and typed a lesson title was told, flatly,
// that it does not exist.
//
// TWO DIRECTIONS ARE ASSERTED, and the second matters as much as the first.
// The likelier mistake here is not under-guarding but OVER-guarding: a
// readiness check hoisted above the results/empty fork silences the lie and
// passes every "does not deny" case below, while stranding "weekly", "reading"
// and "night" — all answerable from frozen module data — behind 11–16s of
// skeleton. The `queries answerable without the store` block exists to fail
// loudly if a later simplification reaches for that.
//
// WHY NOT A BROWSER. Localhost has no NEXT_PUBLIC_PLANNER_USE_SUPABASE, so the
// planner runs the mock path and pins hydration "ready" forever — `pending` is
// UNREACHABLE on the dev server, and a live pass could only ever report "not
// reproduced".
//
// WHY THE BODY AND NOT <CommandPalette>. The query is component state seeded in
// an effect, and react-dom/server runs no effects — rendering the outer
// component can only ever exercise the EMPTY query, under which every static
// source matches and the branch under test is unreachable. That is a vacuous
// pass, the exact shape of verification failure this repo keeps hitting. The
// body takes the query as a prop, so a test can type.

const store = vi.hoisted(() => ({
  state: "settled" as "pending" | "error" | "settled",
  lessons: [] as Lesson[],
  subjects: [] as Subject[],
}));

// Spread the real module so every OTHER export its graph pulls stays real —
// only the readings under test are swapped.
vi.mock("@/lib/planner-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/planner-store")>()),
  usePlanner: () => ({ lessons: store.lessons, subjects: store.subjects }),
  usePlannerDataState: () => store.state,
}));

// The palette's remaining hooks are navigation and appearance plumbing with no
// bearing on the empty decision. Stubbed rather than provided, so this stays a
// render of the component and not a render of the whole app shell.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
}));
vi.mock("@/lib/app-state", () => ({
  useAppState: () => ({ setSubjectView: () => {}, setSearch: () => {} }),
}));
vi.mock("@/lib/theme", () => ({
  useTheme: () => ({
    theme: "clear",
    style: "calm",
    palette: "normal",
    setTheme: () => {},
    setStyle: () => {},
    setPalette: () => {},
  }),
}));

const LESSON = {
  id: "l1",
  subject: "math",
  unit: "u1",
  title: "Fractions on a number line",
  objective: "Place fractions on a number line",
  week: 4,
  day: 0,
  status: "planned",
  archived: false,
  modified: false,
  standards: [],
  resources: [],
} as unknown as Lesson;

/** The affordance <Skeleton> renders. Also the marker that the fix has not
 *  overshot into stranding an answerable query on a skeleton. */
const LOADING = 'role="status" aria-busy="true"';
/** A substring, not the whole line: the curly quotes wrap the live query, and
 *  matching them would make this brittle without making it stricter. */
const DENIAL = "No results for";
const ERROR_COPY = "Couldn’t load your plan";

/** A query that matches NO static source — the shape of a lesson-title search,
 *  and so the only shape that reaches the denial at all. */
const LESSON_QUERY = "Fractions";

function render(query: string) {
  return renderToStaticMarkup(
    createElement(CommandPaletteBody, {
      query,
      onQueryChange: () => {},
      onClose: () => {},
      inputRef: createRef<HTMLInputElement>(),
    }),
  );
}

const READING = {
  id: "reading",
  name: "Reading",
  cls: "reading",
  icon: "Re",
} as unknown as Subject;

beforeEach(() => {
  store.state = "settled";
  store.lessons = [];
  store.subjects = [];
});

describe("a lesson-title query over an unhydrated store never denies the match", () => {
  it("does not deny while the hydrate is in flight", () => {
    store.state = "pending";
    expect(render(LESSON_QUERY)).not.toContain(DENIAL);
  });

  it("shows a loading affordance instead, labelled for screen readers", () => {
    store.state = "pending";
    const html = render(LESSON_QUERY);
    // Without the label a screen-reader user hears silence where the lie was —
    // the same falsehood moved into the accessibility layer.
    expect(html).toContain(LOADING);
    expect(html).toContain("Loading your plan");
  });

  it("does not deny when the hydrate FAILED", () => {
    // A failed hydrate leaves the same empty document. Denying then tells a
    // teacher their lesson does not exist because the backend is down.
    store.state = "error";
    const html = render(LESSON_QUERY);
    expect(html).not.toContain(DENIAL);
    expect(html).not.toContain(LOADING);
    expect(html).toContain(ERROR_COPY);
  });

  it("STILL denies honestly once the store has settled", () => {
    // The opposite failure, and the likelier mistake. A permanent skeleton
    // passes every assertion above while never answering a genuine miss.
    store.state = "settled";
    const html = render(LESSON_QUERY);
    expect(html).toContain(DENIAL);
    expect(html).not.toContain(LOADING);
    expect(html).not.toContain(ERROR_COPY);
  });
});

describe("the guard does not hide real content", () => {
  it("renders a matching lesson once settled", () => {
    store.state = "settled";
    store.lessons = [LESSON];
    const html = render(LESSON_QUERY);
    expect(html).toContain("Fractions on a number line");
    expect(html).not.toContain(DENIAL);
    expect(html).not.toContain(LOADING);
  });

  it("renders a matching subject once the catalog has settled", () => {
    // The other half of the source that moved onto the store. Without this, the
    // subject bucket has no assertion in this file at all after its removal from
    // STATIC_QUERIES — and a fix that dropped subjects entirely would pass.
    store.state = "settled";
    store.subjects = [READING];
    const html = render("reading");
    expect(html).toContain("Reading");
    expect(html).not.toContain(DENIAL);
    expect(html).not.toContain(LOADING);
  });

  it("renders lesson hits that arrive DURING the hydrate", () => {
    // A realistic mid-hydrate frame: the store has begun filling but hydration
    // has not flipped. Results must win over the skeleton — the guard sits on
    // the denial only, so a non-empty list never reaches it.
    store.state = "pending";
    store.lessons = [LESSON];
    const html = render(LESSON_QUERY);
    expect(html).toContain("Fractions on a number line");
    expect(html).not.toContain(LOADING);
  });
});

// ── The non-overshoot direction ───────────────────────────────────────────
//
// Every query below is answered by a frozen module constant, with the planner
// store contributing nothing. Each returns its hit in the tick a teacher
// finishes typing; a readiness check hoisted above the results/empty fork would
// replace all of them with 11–16s of skeleton. That is a worse regression than
// the false-empty this file exists to prevent, and these pin against it.
describe("queries answerable without the store are answered instantly while pending", () => {
  // SUBJECTS ARE NO LONGER ON THIS LIST, and their removal is the point rather
  // than a concession. They used to be a module constant built from lib/mock's
  // eight fixture subjects, so `"reading"` resolved mid-hydrate — instantly, and
  // for every school on earth including the ones that teach no Reading. The
  // catalog now comes off usePlanner() (tests/palette-subject-catalog.test.ts),
  // which means a subject query mid-hydrate is genuinely UNKNOWN and correctly
  // skeletons instead. Views and the appearance axes are still frozen module
  // data with no per-school variation, so they still must answer instantly, and
  // the anti-overshoot guarantee this block exists for still binds through them.
  const STATIC_QUERIES: ReadonlyArray<readonly [string, string, string]> = [
    ["view", "weekly", "Weekly planner"],
    ["appearance", "night", "Theme: Night"],
  ];

  it.each(STATIC_QUERIES)(
    "%s — “%s” still resolves mid-hydrate",
    (_kind, query, expected) => {
      store.state = "pending";
      const html = render(query);
      expect(html).toContain(expected);
      expect(html).not.toContain(LOADING);
      expect(html).not.toContain(DENIAL);
    },
  );

  it("the default open state lists everything, skeleton-free", () => {
    // The empty query matches every static source, so the list is never empty
    // and the guard is unreachable. Pinned because a hoisted guard would
    // skeleton the palette's opening frame — the first thing a teacher sees
    // after pressing ⌘K.
    store.state = "pending";
    const html = render("");
    expect(html).toContain("Weekly planner");
    expect(html).not.toContain(LOADING);
    expect(html).not.toContain(DENIAL);
  });
});
