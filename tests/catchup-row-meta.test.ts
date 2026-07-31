import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CatchUpRowMeta } from "@/components/catchup-v2/CatchUpModal";
import type { CatchupItem } from "@/lib/catchup-data";

// The Catch-Up modal's TRIAGE line, pinned against the component's real output.
//
// WHY THIS FILE EXISTS. deriveCatchupItems computes `dayLabel`, `daysLate`,
// `resources`, `reasonNotDone`, `isPersonal` and `modified` per item, and the
// modal rendered NONE of them — a teacher triaging a backlog could not see when
// a lesson was missed, how late it is, why it didn't happen, or whether
// materials already exist. lib/catchup-data even documents `daysLate` as "not
// rendered today", which is how its school-week arithmetic stayed wrong
// silently for a while. Now that it IS rendered, the empty/absent cases are the
// ones worth pinning: "0 days late" and an empty reason are noise, and a chip
// that appears when there is nothing to say is a regression.
//
// WHY react-dom/server. vitest runs `environment: "node"`; react-dom/server
// renders to a STRING there with no jsdom and no new dependency — the technique
// tests/hub-browse-empty.test.ts:23-27 documents. CatchUpRowMeta is purely
// presentational (props in, markup out — no store, no router, no context), so
// unlike the modal body it needs no mocking at all.

/** A full CatchupItem with sensible defaults; override per test. Mirrors the
 *  factory in tests/catchup-scope.test.ts:18-36. */
function item(
  over: Partial<CatchupItem> & Pick<CatchupItem, "lessonId">,
): CatchupItem {
  return {
    subject: "math",
    unit: "Unit 1",
    dayLabel: "Sun · Wk 11",
    week: 11,
    day: 0,
    title: "Lesson",
    preview: "",
    status: "not_done",
    standards: [],
    resources: 0,
    reasonNotDone: "",
    daysLate: 0,
    isPersonal: false,
    modified: false,
    ...over,
  };
}

const render = (it_: CatchupItem): string =>
  renderToStaticMarkup(createElement(CatchUpRowMeta, { item: it_ }));

// ── When it was due ─────────────────────────────────────────────────────────

describe("CatchUpRowMeta — due day", () => {
  it("always renders the configured-week day label", () => {
    expect(render(item({ lessonId: "a" }))).toContain("Sun · Wk 11");
  });

  it("renders whatever label the configured week produced (not Sun-first)", () => {
    // A Mon–Fri school's column 0 is Monday; the label is precomputed upstream,
    // so this row must never re-derive or "correct" it.
    expect(render(item({ lessonId: "a", dayLabel: "Mon · Wk 4" }))).toContain(
      "Mon · Wk 4",
    );
  });

  it("renders the shortened-week fallback label verbatim", () => {
    expect(render(item({ lessonId: "a", dayLabel: "— · Wk 9" }))).toContain(
      "— · Wk 9",
    );
  });
});

// ── Lateness ────────────────────────────────────────────────────────────────

describe("CatchUpRowMeta — daysLate", () => {
  it("renders nothing late-ish at 0 (never '0 days late')", () => {
    const html = render(item({ lessonId: "a", daysLate: 0 }));
    expect(html).not.toContain("0 days late");
    expect(html).not.toContain("late");
  });

  it("renders a plural count when late", () => {
    expect(render(item({ lessonId: "a", daysLate: 3 }))).toContain(
      "3 days late",
    );
  });

  it("singularises one day", () => {
    const html = render(item({ lessonId: "a", daysLate: 1 }));
    expect(html).toContain("1 day late");
    expect(html).not.toContain("1 days late");
  });
});

// ── Resources ───────────────────────────────────────────────────────────────

describe("CatchUpRowMeta — resources", () => {
  it("renders no chip when the lesson has no resources", () => {
    const html = render(item({ lessonId: "a", resources: 0 }));
    expect(html).not.toContain("resource");
  });

  it("renders the count, and names it in full for assistive tech", () => {
    const html = render(item({ lessonId: "a", resources: 4 }));
    // The visible chip is clip + number (the handoff's "📎 N"); the phrase
    // lives in the accessible name so the glyph is never the only cue.
    expect(html).toContain(">4<");
    expect(html).toContain('aria-label="4 resources attached"');
  });

  it("singularises a lone resource", () => {
    const html = render(item({ lessonId: "a", resources: 1 }));
    expect(html).toContain("1 resource attached");
    expect(html).not.toContain("1 resources");
  });
});

// ── Reason not done ─────────────────────────────────────────────────────────

describe("CatchUpRowMeta — reasonNotDone", () => {
  it("renders the teacher's reason when non-empty", () => {
    const html = render(
      item({ lessonId: "a", reasonNotDone: "Fire drill ate the block" }),
    );
    expect(html).toContain("Fire drill ate the block");
    expect(html).toContain("Why not");
  });

  it("renders nothing when the reason is empty", () => {
    expect(render(item({ lessonId: "a", reasonNotDone: "" }))).not.toContain(
      "Why not",
    );
  });

  it("treats a whitespace-only reason as empty", () => {
    expect(
      render(item({ lessonId: "a", reasonNotDone: "   \n  " })),
    ).not.toContain("Why not");
  });

  it("strips markup rather than injecting it", () => {
    const html = render(
      item({ lessonId: "a", reasonNotDone: "<b>Sick</b> day" }),
    );
    expect(html).toContain("Sick day");
    expect(html).not.toContain("<b>");
  });
});

// ── Fork cues ───────────────────────────────────────────────────────────────

describe("CatchUpRowMeta — fork cues", () => {
  it("shows neither cue on an untouched team lesson", () => {
    const html = render(item({ lessonId: "a" }));
    expect(html).not.toContain("Personal");
    expect(html).not.toContain("Modified");
  });

  it("shows Personal on an unmodified personal copy", () => {
    const html = render(item({ lessonId: "a", isPersonal: true }));
    expect(html).toContain("Personal");
    expect(html).not.toContain("Modified");
  });

  it("shows Modified alone once the copy has been edited", () => {
    const html = render(
      item({ lessonId: "a", isPersonal: true, modified: true }),
    );
    expect(html).toContain("Modified");
    expect(html).not.toContain("Personal");
  });
});

// ── The quiet row ───────────────────────────────────────────────────────────

describe("CatchUpRowMeta — nothing to say", () => {
  it("renders the day label and nothing else when every triage field is empty", () => {
    const html = render(item({ lessonId: "a" }));
    // One chip only: the day label. No lateness, no resources, no reason, no
    // fork cue — an all-defaults item must not manufacture chips.
    expect(html).toContain("Sun · Wk 11");
    expect(html).not.toContain("late");
    expect(html).not.toContain("resource");
    expect(html).not.toContain("Why not");
  });
});
