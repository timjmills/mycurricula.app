import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, useEffect, type ReactNode } from "react";

import { mountReact } from "./mount-react";

// 30s, matching the other mount-based suites. A real react-dom mount plus a
// click sequence is a few hundred ms of honest work, which breaches vitest's 5s
// default under parallel lane load — this file fails 5/6 at the default on a
// busy machine and passes 6/6 with room. It does not mask a hang: every test
// here fails on an ASSERTION, never a timeout, when the store is mutated out.
vi.setConfig({ testTimeout: 30000 });

// The header's Expand-all control and the cards it expands are in DIFFERENT
// components on opposite sides of <WeeklyShell>: the button renders in
// <WeeklyViewControls> (the WeekNavigator actions slot), the expanded state is
// consumed by whichever Week canvas the frame axis picked. That seam is the
// whole reason lib/week-expansion.ts exists, and it is the thing that breaks
// silently — a provider-less version of exactly this pairing already shipped
// once in lib/weekly-schedule-state.ts, where writer and reader each got their
// own useState and the toggle appeared to work while changing nothing until a
// reload. So this file drives the REAL control against a stand-in canvas and
// asserts the canvas actually moved.
//
// mountReact (not renderToStaticMarkup) because every assertion here is about a
// TRANSITION — click, then what changed. SSR runs no effects and dispatches no
// clicks, so it could not see any of this.
//
// ── The trap this file is written around ─────────────────────────────────
// "Expand all expanded everything" is easy to fake: a canvas that renders zero
// cards passes it, and so does one whose ids never reached the store. Every
// expansion assertion below therefore also asserts the COUNT of cards the
// stand-in canvas rendered, so a run against an empty canvas fails loudly
// instead of agreeing with itself.

const appState = vi.hoisted(() => ({ viewMode: "grid" as "grid" | "list" }));

vi.mock("@/lib/app-state", () => ({
  useAppState: () => ({
    viewMode: appState.viewMode,
    setViewMode: (v: "grid" | "list") => {
      appState.viewMode = v;
    },
  }),
}));

vi.mock("@/lib/weekly-schedule-state", () => ({
  useWeeklyScheduleMode: () => ({
    setMode: () => {},
    scheduleMode: false,
    events: "lessons",
    setEvents: () => {},
  }),
}));

/** Ids the stand-in canvas renders — the "week" under test. */
const WEEK_IDS = ["l-1", "l-2", "l-3"];

/**
 * A stand-in for a Week canvas: publishes its visible ids exactly as
 * WeekColumns does, renders one element per lesson, and marks the expanded
 * ones. Deliberately NOT the real WeekColumns — that would drag dnd-kit,
 * framer-motion and the planner store into a test about one seam, and a
 * failure there would not tell us which side broke.
 */
function FakeCanvas({ ids }: { ids: readonly string[] }): ReactNode {
  const { isExpanded, publishVisible, toggle } = useWeekExpansion();
  useEffect(() => {
    publishVisible(ids);
    return () => publishVisible([]);
  }, [ids, publishVisible]);
  return createElement(
    "div",
    { "data-canvas": "true" },
    ids.map((id) =>
      createElement(
        "button",
        {
          key: id,
          type: "button",
          "data-card": id,
          "data-expanded": isExpanded(id) ? "yes" : "no",
          onClick: () => toggle(id),
        },
        `card ${id}`,
      ),
    ),
  );
}

// Imported after the mocks are registered.
const { useWeekExpansion, WeekExpansionProvider } = await import(
  "@/lib/week-expansion"
);
const { WeeklyViewControls } = await import(
  "@/components/weekly/WeeklyViewControls"
);

function Harness({ ids }: { ids: readonly string[] }): ReactNode {
  return createElement(
    WeekExpansionProvider,
    null,
    createElement(WeeklyViewControls, {}),
    createElement(FakeCanvas, { ids }),
  );
}

const isExpandAll = (el: Element): boolean =>
  (el.textContent ?? "").trim() === "Expand all";
const isCollapseAll = (el: Element): boolean =>
  (el.textContent ?? "").trim() === "Collapse all";

/** How many cards the canvas rendered, and how many of them are open. */
function counts(html: string): { cards: number; expanded: number } {
  return {
    cards: (html.match(/data-card="/g) ?? []).length,
    expanded: (html.match(/data-expanded="yes"/g) ?? []).length,
  };
}

describe("the Week's Expand-all control drives the canvas", () => {
  beforeEach(() => {
    appState.viewMode = "grid";
  });

  it("expands every visible lesson, and flips to Collapse all", async () => {
    const h = await mountReact(Harness);
    try {
      await h.render({ ids: WEEK_IDS });

      // Baseline — the canvas is really rendering cards (so a later "all
      // expanded" cannot be an empty-canvas vacuum), and none are open.
      const before = counts(h.html());
      expect(before.cards).toBe(3);
      expect(before.expanded).toBe(0);

      await h.click(isExpandAll);

      const after = counts(h.html());
      expect(after.cards).toBe(3);
      expect(after.expanded).toBe(3);
      // The control now offers the opposite action — proof the store's
      // allExpanded is computed against the PUBLISHED set, not guessed.
      expect(h.html()).toContain("Collapse all");
      expect(h.html()).not.toContain("Expand all");
    } finally {
      await h.unmount();
    }
  });

  it("Collapse all closes them again", async () => {
    const h = await mountReact(Harness);
    try {
      await h.render({ ids: WEEK_IDS });
      await h.click(isExpandAll);
      expect(counts(h.html()).expanded).toBe(3);

      await h.click(isCollapseAll);

      const after = counts(h.html());
      expect(after.cards).toBe(3); // still rendering — it collapsed, not vanished
      expect(after.expanded).toBe(0);
      expect(h.html()).toContain("Expand all");
    } finally {
      await h.unmount();
    }
  });

  it("a single card click expands only that card", async () => {
    // The per-card path and the expand-all path write the same set; if one
    // ever stopped sharing it, this is what would catch it.
    const h = await mountReact(Harness);
    try {
      await h.render({ ids: WEEK_IDS });
      await h.click((el) => el.getAttribute("data-card") === "l-2");

      expect(counts(h.html()).expanded).toBe(1);
      // Queried rather than string-matched: the serialiser is free to order
      // attributes however it likes, and a substring assertion would be
      // asserting that ordering rather than the state.
      expect(h.query('[data-card="l-2"]')?.getAttribute("data-expanded")).toBe(
        "yes",
      );
      expect(h.query('[data-card="l-1"]')?.getAttribute("data-expanded")).toBe(
        "no",
      );
      // Not all of them — so the control still offers "Expand all".
      expect(h.html()).toContain("Expand all");
    } finally {
      await h.unmount();
    }
  });

  it("expanding the last remaining card flips the label without a second press", async () => {
    // allExpanded is derived, not latched. A one-lesson week that the teacher
    // opened by clicking the card must read "Collapse all" — otherwise the
    // control lies about the state it is in.
    const h = await mountReact(Harness);
    try {
      await h.render({ ids: ["only-1"] });
      expect(h.html()).toContain("Expand all");

      await h.click((el) => el.getAttribute("data-card") === "only-1");

      expect(counts(h.html())).toEqual({ cards: 1, expanded: 1 });
      expect(h.html()).toContain("Collapse all");
    } finally {
      await h.unmount();
    }
  });

  it("the control is absent when the canvas has nothing to expand", async () => {
    // Schedule mode, List mode, the Edit board and an empty week all publish
    // zero ids. A control that rendered anyway would be present-but-inert.
    //
    // Paired with the positive control below IN THE SAME RUN: this absence
    // would otherwise pass against a harness that rendered nothing at all.
    const h = await mountReact(Harness);
    try {
      await h.render({ ids: [] });
      expect(h.html()).not.toContain("Expand all");
      expect(h.html()).not.toContain("Collapse all");
      // POSITIVE CONTROL — the rest of the header did render, so the missing
      // button is a fact about the button and not about the mount.
      expect(h.html()).toContain("Grid");
      expect(h.html()).toContain("List");
    } finally {
      await h.unmount();
    }
  });

  it("expansion survives a week change and is restored on the way back", async () => {
    // The set is keyed by lesson id, so stepping to another week shows
    // collapsed cards (none of ITS ids are in the set) and stepping back finds
    // the week exactly as it was left. This is the answer to "what happens to
    // expansion state when the teacher changes week", and it is worth pinning
    // because it is a consequence of the id-keyed shape rather than of any
    // explicit code — a future refactor to a positional set would break it
    // silently.
    const h = await mountReact(Harness);
    try {
      await h.render({ ids: WEEK_IDS });
      await h.click(isExpandAll);
      expect(counts(h.html()).expanded).toBe(3);

      // Week 13 — different lessons entirely.
      await h.render({ ids: ["n-1", "n-2"] });
      const next = counts(h.html());
      expect(next.cards).toBe(2);
      expect(next.expanded).toBe(0);
      expect(h.html()).toContain("Expand all");

      // Back to week 12.
      await h.render({ ids: WEEK_IDS });
      expect(counts(h.html())).toEqual({ cards: 3, expanded: 3 });
      expect(h.html()).toContain("Collapse all");
    } finally {
      await h.unmount();
    }
  });
});
