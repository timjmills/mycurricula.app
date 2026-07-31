import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SearchResultsBody } from "@/components/shell/SearchResults";
import type { Lesson } from "@/lib/types";

// Regression tests for the top-bar search false-empty — the same defect class
// as the /daily false-empty (tests/day-empty-kind.test.ts) and the four Planner
// Hub browse pickers (tests/hub-browse-empty.test.ts).
//
// components/shell/SearchResults.tsx rendered
//
//     No matches
//     Try shorter terms or check spelling.
//
// off `results.length === 0`, consulting NO hydration state. Its lesson and
// resource buckets both come from `usePlanner().lessons` (lib/search-index.ts
// useSearchData flattens resources out of that same array), which is empty for
// the whole 11–16s Supabase hydrate. So a teacher who searched on arrival was
// not merely told their lesson did not exist — the sub-line sent them off to
// re-check the spelling of a term that was correct all along.
//
// TWO DIRECTIONS ARE ASSERTED, and the second matters as much as the first: a
// permanent skeleton would pass every "the lie is gone" check while stranding
// the search box loading forever, which is a worse bug than the one being
// fixed. Every pending/error case below has a settled twin that still denies.
//
// STANDARDS ARE DELIBERATELY UNGATED. They come from a module-frozen map
// (lib/mock/standards.ts), not the store, so a standards-only miss is honest
// the instant it is computed. Gating them too would hide an already-correct
// answer behind 11–16s of skeleton. That non-overshoot is pinned here too, so
// a later "just guard everything" simplification has to argue with a test.
//
// WHY THE BODY AND NOT <SearchResults>. The outer component portals to
// document.body behind a post-mount `mounted` latch, so react-dom/server
// renders it as the empty string — a vacuous pass, the exact shape of
// verification failure this repo keeps hitting. The body component owns the
// whole empty decision and renders to real markup.
//
// WHY NOT A BROWSER. Localhost has no NEXT_PUBLIC_PLANNER_USE_SUPABASE, so the
// planner runs the mock path and `effectiveHydration` pins hydration "ready"
// forever — `pending` is UNREACHABLE on the dev server. A live pass here can
// only ever return "not reproduced".

const store = vi.hoisted(() => ({
  state: "settled" as "pending" | "error" | "settled",
  lessons: [] as Lesson[],
}));

// Spread the real module so every OTHER export the component graph pulls
// (usePlannerCatalog and friends, via the @/components/ui barrel) stays real —
// only the two readings under test are swapped.
vi.mock("@/lib/planner-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/planner-store")>()),
  usePlanner: () => ({ lessons: store.lessons }),
  usePlannerDataState: () => store.state,
}));

const LESSON = {
  id: "l1",
  subject: "math",
  unit: "u1",
  title: "Fractions on a number line",
  objective: "Place fractions on a number line",
  week: 1,
  day: 0,
  status: "planned",
  archived: false,
  modified: false,
  standards: [],
  resources: [
    { label: "Fractions warm-up deck", type: "slides" },
  ],
} as unknown as Lesson;

/** The affordance <Skeleton> renders. Also the marker that the fix has not
 *  overshot into stranding a settled surface on a permanent skeleton. */
const LOADING = 'role="status" aria-busy="true"';
const DENIAL = "No matches";
/** The half that makes this instance worse than a bare false-empty. */
const BLAME = "check spelling";
const ERROR_COPY = "Couldn’t load your plan";

function render(query: string, filter: "lesson" | "standard" | "resource" | null) {
  return renderToStaticMarkup(
    createElement(SearchResultsBody, { query, filter, onResultClick: () => {} }),
  );
}

beforeEach(() => {
  store.state = "settled";
  store.lessons = [];
});

// The two buckets fed by usePlanner().lessons. Both reach the same denial, and
// both are one filter-pill click from a teacher on any route.
const STORE_BACKED = ["lesson", "resource"] as const;

describe.each(STORE_BACKED)(
  "filter=%s — a search over an unhydrated store never denies a match",
  (filter) => {
    it("does not deny the match while the hydrate is in flight", async () => {
      store.state = "pending";
      const html = render("Fractions", filter);
      expect(html).not.toContain(DENIAL);
      // The sub-line is the part that blames the teacher; assert it separately
      // so a copy change to the heading alone cannot leave it behind.
      expect(html).not.toContain(BLAME);
    });

    it("shows a loading affordance instead, labelled for screen readers", async () => {
      store.state = "pending";
      const html = render("Fractions", filter);
      // Without the label a screen-reader user hears silence where the lie was —
      // the same falsehood moved into the accessibility layer.
      expect(html).toContain(LOADING);
      expect(html).toContain("Loading your plan");
    });

    it("does not deny the match when the hydrate FAILED", async () => {
      // A failed hydrate also leaves an empty document. Denying then tells a
      // teacher their lesson does not exist because the backend is down.
      store.state = "error";
      const html = render("Fractions", filter);
      expect(html).not.toContain(DENIAL);
      expect(html).not.toContain(BLAME);
      expect(html).toContain(ERROR_COPY);
    });

    it("STILL denies honestly once the store has settled", async () => {
      // The opposite failure, and the likelier mistake. A permanent skeleton
      // passes every assertion above while leaving the search box loading
      // forever.
      store.state = "settled";
      const html = render("Fractions", filter);
      expect(html).toContain(DENIAL);
      expect(html).toContain(BLAME);
      expect(html).not.toContain(LOADING);
    });
  },
);

describe("the guard does not hide real content", () => {
  // Gating the denial must not gate the RESULTS.
  it("still renders a matching lesson once settled", () => {
    store.state = "settled";
    store.lessons = [LESSON];
    const html = render("Fractions", "lesson");
    expect(html).toContain("Fractions on a number line");
    expect(html).not.toContain(DENIAL);
    expect(html).not.toContain(LOADING);
  });

  it("still renders a matching resource once settled", () => {
    store.state = "settled";
    store.lessons = [LESSON];
    const html = render("warm-up", "resource");
    expect(html).toContain("Fractions warm-up deck");
    expect(html).not.toContain(DENIAL);
  });

  it("renders lesson hits that arrive DURING the hydrate", () => {
    // Realistic mid-hydrate frame: the store has begun filling but hydration
    // has not flipped. Results must win over the skeleton — the guard is on
    // the denial only, and `isCompletelyEmpty` is false here.
    store.state = "pending";
    store.lessons = [LESSON];
    const html = render("Fractions", "lesson");
    expect(html).toContain("Fractions on a number line");
    expect(html).not.toContain(LOADING);
  });
});

describe("filter=standard — hydration-independent, so it answers immediately", () => {
  // Standards are a module-frozen map, not store data. Gating this bucket
  // would replace an already-correct answer with 11–16s of skeleton.
  it("denies a genuine standards miss even while the planner is pending", () => {
    store.state = "pending";
    const html = render("zzzznotastandard", "standard");
    expect(html).toContain(DENIAL);
    expect(html).not.toContain(LOADING);
  });

  it("returns standards hits while the planner is pending", () => {
    store.state = "pending";
    const html = render("5.NBT", "standard");
    expect(html).toContain("Standards");
    expect(html).not.toContain(DENIAL);
  });
});

describe("filter=All — the comments stand-in stands in for the denial", () => {
  // Today the comments source is stubbed empty (lib/search-index.ts), so the
  // "coming after beta" stand-in always renders under All and
  // `isCompletelyEmpty` is unreachable there. Pinned as the CURRENT behaviour,
  // not as a guarantee: when the comments store ships, All starts reaching the
  // denial, and it is already inside `dependsOnPlannerStore` for that day.
  it("never shows the denial under All while pending", () => {
    store.state = "pending";
    const html = render("Fractions", null);
    expect(html).not.toContain(DENIAL);
    expect(html).not.toContain(BLAME);
  });

  it("offers the comments stand-in rather than a denial once settled", () => {
    store.state = "settled";
    const html = render("zzzznothingatall", null);
    expect(html).toContain("Comments search");
    expect(html).not.toContain(DENIAL);
  });
});
