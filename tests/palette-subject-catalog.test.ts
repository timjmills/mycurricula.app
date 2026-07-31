import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CommandPaletteBody } from "@/components/shell/command-palette";
import type { Lesson, Subject } from "@/lib/types";

// Regression tests for the ⌘K palette's SUBJECT bucket — a different defect
// class from tests/command-palette-empty.test.ts, on the same component.
//
// THE DEFECT. components/shell/command-palette.tsx built its subject rows as
//
//     const SUBJECT_VIEW_RESULTS = SUBJECTS.map(...)   // MODULE scope
//
// from `lib/mock`'s eight Grade 5 fixture subjects. Two things are wrong with
// that line and they are separable:
//
//   1. THE SOURCE is a fixture. No feature flag switches it. Flip every
//      NEXT_PUBLIC_*_USE_SUPABASE to 1 and the palette still offers Math, UFLI,
//      Grammar, Spelling and Explorers — and still omits whatever the school
//      actually teaches. Each row navigates to `/year?subject=<id>` for a
//      subject that does not exist in the grade.
//   2. THE PLACEMENT is module scope. A `const` derived from data is evaluated
//      once at import and can never re-derive. So even swapping the fixture for
//      the real catalog at that line would still be wrong: the list would freeze
//      on whatever the store held the first time the module was imported —
//      i.e. empty, mid-hydrate — and never update when the data landed, nor when
//      the teacher switched workspace.
//
// Both are asserted below, because a fix that only addresses (1) passes the
// wrong-catalog tests and still ships a list that never updates.
//
// WHY THIS RENDERS THE COMPONENT rather than testing a helper. There is no
// helper — the whole point is that the derivation lived at module scope, which
// is exactly the shape nothing can inject into. Rendering <CommandPaletteBody>
// through react-dom/server (vitest runs `environment: "node"`; no jsdom, no new
// dependency) exercises the shipped derivation wherever it ended up.
//
// WHY NOT A BROWSER. Localhost has no NEXT_PUBLIC_PLANNER_USE_SUPABASE, so the
// planner runs the mock path and `usePlanner().subjects` IS a copy of the same
// fixture the bug reads. Correct and buggy code are observationally identical
// on the dev server — the wrong-catalog case is unreachable in a live pass.

const store = vi.hoisted(() => ({
  state: "settled" as "pending" | "error" | "settled",
  lessons: [] as Lesson[],
  subjects: [] as Subject[],
}));

vi.mock("@/lib/planner-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/planner-store")>()),
  usePlanner: () => ({ lessons: store.lessons, subjects: store.subjects }),
  usePlannerDataState: () => store.state,
}));

// Navigation + appearance plumbing, stubbed so this stays a render of the
// component and not of the whole app shell.
//
// NOT ASSERTED HERE: what the row's onClick pushes. renderToStaticMarkup drops
// event handlers, so no assertion in this file can reach the action, and a
// spy on `router.push` would sit at zero calls forever — a check that cannot
// fail. What IS reachable is the row's `id` attribute, which the component
// builds from the same `s.id` the action closes over; that is asserted below,
// and it is the whole of the id contract this file can honestly claim.
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

/** A school that teaches none of the eight fixture subjects. Deliberately
 *  disjoint from lib/mock/subjects.ts so a leak is unambiguous: any fixture name
 *  appearing in the output came from the fixture, not from this catalog. */
function subject(id: string, name: string): Subject {
  return { id, name, cls: id, icon: name.slice(0, 2) } as unknown as Subject;
}
const SCIENCE = subject("sci-uuid-1", "Science");
const HISTORY = subject("hist-uuid-2", "History");

/** Fixture subject names that must NOT appear for a school that doesn't teach
 *  them. "Math" is excluded from this list on purpose — it is a substring of
 *  nothing here but is common enough in real copy to make a matcher flaky;
 *  the five below appear in no other palette string. */
const FIXTURE_ONLY = ["UFLI", "Grammar", "Spelling", "Explorers", "SEL"];

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

beforeEach(() => {
  store.state = "settled";
  store.lessons = [];
  store.subjects = [];
});

describe("the subject rows come from the grade's catalog, not lib/mock", () => {
  it("lists the school's own subjects", () => {
    store.subjects = [SCIENCE, HISTORY];
    const html = render("");
    expect(html).toContain("Science");
    expect(html).toContain("History");
  });

  it("finds a subject the fixture has never heard of", () => {
    // The user-facing failure: a teacher types their own subject and the palette
    // denies it exists, because it is searching someone else's subject list.
    store.subjects = [SCIENCE, HISTORY];
    const html = render("Science");
    expect(html).toContain("Science");
    expect(html).not.toContain("No results for");
  });

  it("offers no subject the school does not teach", () => {
    store.subjects = [SCIENCE, HISTORY];
    const html = render("");
    for (const name of FIXTURE_ONLY) {
      expect(html).not.toContain(name);
    }
  });

  it("denies a fixture subject by name", () => {
    // The inverse of the test above, stated as a teacher would hit it: searching
    // "Grammar" in a school with no Grammar must come back empty, not offer a
    // row that navigates to a subject the grade does not have.
    store.subjects = [SCIENCE, HISTORY];
    expect(render("Grammar")).toContain("No results for");
  });

  it("carries the subject's real id, uuid and all", () => {
    // The old row identified its subject by string surgery on its own DOM id
    // (`r.id.replace("subject-", "")`), which only ever worked because the
    // fixture ids happen to be slugs. Real catalog ids are uuids. The id must
    // travel on the subject object; the rendered row is where that is visible.
    store.subjects = [SCIENCE];
    const html = render("Science");
    expect(html).toContain('id="result-subject-sci-uuid-1"');
    // The active row is the one Enter fires, so this also pins that the subject
    // is reachable from the keyboard as the first result.
    expect(html).toContain('aria-activedescendant="result-subject-sci-uuid-1"');
  });
});

describe("the subject list is derived per render, not frozen at import", () => {
  // The module-scope half of the defect, and the half a fixture-swap alone does
  // not fix. If the list is a module `const`, these two renders are identical
  // no matter what the store says — which is precisely why the original bug was
  // invisible to every flag.
  // EVERY absence-assertion in this block renders the EMPTY query, never the
  // subject's name. The palette echoes the live query twice — into the input's
  // `value` and into the denial line — so `render("Science")` always contains
  // the string "Science" no matter what the results are, and
  // `.not.toContain("Science")` is a check that cannot pass. Two of these were
  // written that way first and "failed against HEAD" for that reason rather
  // than the defect's. The empty query lists every row and echoes nothing.

  it("reflects a catalog that arrives after the module was imported", () => {
    store.subjects = [];
    expect(render("")).not.toContain("Science");

    store.subjects = [SCIENCE];
    expect(render("")).toContain("Science");
  });

  it("drops subjects that leave the catalog", () => {
    // A workspace switch replaces the catalog wholesale. A frozen list keeps
    // serving the previous tenant's subjects.
    store.subjects = [SCIENCE, HISTORY];
    expect(render("")).toContain("History");

    store.subjects = [SCIENCE];
    const html = render("");
    expect(html).not.toContain("History");
    expect(html).toContain("Science"); // the surviving subject is still there
  });
});

describe("an unhydrated catalog is not reported as an empty one", () => {
  // Same contract tests/command-palette-empty.test.ts pins for lessons. It now
  // binds for subjects too: moving them onto the store means a subject query
  // mid-hydrate is genuinely UNKNOWN, and must skeleton rather than deny.
  const LOADING = 'role="status" aria-busy="true"';

  it("does not deny a subject while the hydrate is in flight", () => {
    store.state = "pending";
    store.subjects = [];
    const html = render("Science");
    expect(html).not.toContain("No results for");
    expect(html).toContain(LOADING);
  });

  it("still answers a subject query the moment the catalog lands", () => {
    // The anti-overshoot direction: a subject present in a still-pending store
    // must render, not wait. Same rule the lesson bucket already follows.
    store.state = "pending";
    store.subjects = [SCIENCE];
    const html = render("Science");
    expect(html).toContain("Science");
    expect(html).not.toContain(LOADING);
  });
});
