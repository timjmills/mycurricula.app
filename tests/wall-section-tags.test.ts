import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { WallItem, WallSection } from "@/lib/wall-scope";

// The Resource Wall's section headers never said which lessons a section's
// material belongs to.
//
// The handoff puts up to three "Tagged to <lesson>" chips in every section
// header, with a "+N" popover holding the rest (7.21
// source-home/resource-wall.jsx:221-227). The data was already there and
// already de-duplicated: `WallItem.lessons` carries EVERY lesson tagging the
// same content, because `resolveWall` dedups cards on content identity and
// keeps all the refs (lib/wall-scope). Only the render was missing.
//
// What is pinned here, and why each one is a bug someone would otherwise ship:
//
//   • DE-DUPLICATION across cards. Six cards from one lesson must produce ONE
//     chip. A naive flat-map produces six identical pills and the header
//     collapses.
//   • The chips come from the section's FULL item list, not the filtered one.
//     A strip that shrank as you typed in the search box would read as the
//     answer changing rather than the view narrowing.
//   • The "+N" count is the OVERFLOW, not the total. Three chips beside "+7"
//     when there are seven lessons is a lie a reader cannot detect.
//   • A section whose cards carry no lesson refs (a wall-local custom section:
//     every card authored straight onto the wall, `lessons: []`) renders NO
//     strip at all — not an empty container, not a "+0".
//   • Titles are ESCAPED. Lesson titles are teacher-authored free text.
//
// Renders the shipped component through `react-dom/server` (vitest runs
// `environment: "node"`) — the technique tests/teach-false-empty.test.ts uses.

vi.mock("@/lib/palette", () => ({
  useSubjectColor: () => ({ c: "var(--subj-1)", cls: "math" }),
}));

// The card body is not what this asserts, and it reaches for wall context this
// test does not provide.
vi.mock("@/components/resource-wall-v2/Card", () => ({
  Card: () => null,
}));

const { Section } = await import("@/components/resource-wall-v2/Section");

// ── Fixtures ────────────────────────────────────────────────────────────────

let key = 0;
function item(
  label: string,
  lessons: { id: string; title: string }[],
  type: WallItem["type"] = "link",
): WallItem {
  key += 1;
  return {
    key: `k${key}`,
    type,
    label,
    resource: { type, label, url: "https://example.com/x" },
    subjectId: "math",
    lessonId: lessons[0]?.id ?? "",
    lessonTitle: lessons[0]?.title ?? "",
    lessons,
  } as unknown as WallItem;
}

function section(items: WallItem[]): WallSection {
  return {
    id: "sec-1",
    title: "Today's Lessons",
    meta: "Wk 12",
    subjectId: "math",
    items,
  } as unknown as WallSection;
}

const NOOP = (): void => {};

function render(sec: WallSection): string {
  return renderToStaticMarkup(
    createElement(Section as never, {
      section: sec,
      wallKey: "preset:today",
      view: "grid",
      layout: "comfortable",
      query: "",
      filter: "All",
      readOnly: false,
      sectionDragging: false,
      cardDragging: false,
      onCardDragState: NOOP,
      onEdit: NOOP,
      onOpen: NOOP,
      onEnlarge: NOOP,
      onBoard: NOOP,
      onModal: NOOP,
      onAddCard: NOOP,
      onAddSection: NOOP,
      onCommitCard: NOOP,
      onDropCard: NOOP,
      onDropSection: NOOP,
      onDragStartSection: NOOP,
      onDragEndSection: NOOP,
      onSolo: NOOP,
      bgRevision: 0,
      onBgChange: NOOP,
    } as never),
  );
}

/** Occurrences of `needle` in `haystack`. */
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

const FRACTIONS = { id: "l1", title: "Fractions on a number line" };
const DECIMALS = { id: "l2", title: "Decimals to hundredths" };
const AREA = { id: "l3", title: "Area of rectangles" };
const VOLUME = { id: "l4", title: "Volume of prisms" };
const ANGLES = { id: "l5", title: "Measuring angles" };

describe("Resource Wall — section headers name the lessons they collect", () => {
  it("renders a chip per tagged lesson", () => {
    const html = render(
      section([item("Deck", [FRACTIONS]), item("Worksheet", [DECIMALS])]),
    );
    expect(html).toContain("Tagged to Fractions on a number line");
    expect(html).toContain("Tagged to Decimals to hundredths");
  });

  it("de-duplicates a lesson that tags several cards", () => {
    // Six cards, ONE lesson. A flat map over items would render six pills.
    const html = render(
      section([
        item("Deck", [FRACTIONS]),
        item("Worksheet", [FRACTIONS]),
        item("Video", [FRACTIONS]),
        item("Exit ticket", [FRACTIONS]),
        item("Manipulatives", [FRACTIONS]),
        item("Homework", [FRACTIONS]),
      ]),
    );
    expect(count(html, "Tagged to Fractions on a number line")).toBe(1);
  });

  it("de-duplicates ACROSS a card's own multi-lesson refs", () => {
    // One resource shared by two lessons, plus a second card for one of them.
    const html = render(
      section([item("Shared deck", [FRACTIONS, DECIMALS]), item("Extra", [DECIMALS])]),
    );
    expect(count(html, "Tagged to Fractions on a number line")).toBe(1);
    expect(count(html, "Tagged to Decimals to hundredths")).toBe(1);
  });

  it("folds the fourth lesson onward into a +N button, counting the OVERFLOW", () => {
    const html = render(
      section([
        item("A", [FRACTIONS]),
        item("B", [DECIMALS]),
        item("C", [AREA]),
        item("D", [VOLUME]),
        item("E", [ANGLES]),
      ]),
    );
    // Five lessons, three inline → "+2", never "+5".
    expect(html).toContain("+2");
    expect(html).not.toContain("+5");
    expect(html).toContain('aria-label="Show all 5 tagged lessons"');
  });

  // The three below are absence assertions, which pass vacuously against a
  // surface that renders no strip at all — the failure mode this repo has been
  // bitten by before. Each therefore also asserts the POSITIVE state it is
  // scoped to, so it cannot pass by the feature simply being missing.

  it("shows no +N button at exactly three lessons", () => {
    const html = render(
      section([item("A", [FRACTIONS]), item("B", [DECIMALS]), item("C", [AREA])]),
    );
    expect(count(html, "Tagged to ")).toBe(3);
    expect(html).not.toContain("Show all");
  });

  it("renders nothing at all for a section whose cards carry no lesson refs", () => {
    // A wall-local custom section — every card authored straight onto the wall.
    const withRefs = render(section([item("Deck", [FRACTIONS])]));
    expect(withRefs).toContain("Lessons tagged to this section");

    const html = render(section([item("Loose note", []), item("Another", [])]));
    expect(html).not.toContain("Tagged to");
    expect(html).not.toContain("Lessons tagged to this section");
  });

  it("ignores a ref with no title rather than rendering an empty pill", () => {
    // One titled ref renders; a title-less one beside it contributes nothing —
    // not a second chip, and not a bare link glyph.
    const html = render(
      section([item("A", [{ id: "l9", title: "" }, FRACTIONS])]),
    );
    expect(count(html, "Tagged to ")).toBe(1);
    expect(html).toContain("Tagged to Fractions on a number line");
  });

  it("derives the chips from the FULL item list, not the filtered one", () => {
    // The type filter hides the second card; its lesson must still be named,
    // because "whose material is this" is a property of the section.
    const sec = section([
      item("Deck", [FRACTIONS], "slides"),
      item("Reading", [DECIMALS], "pdf"),
    ]);
    const html = renderToStaticMarkup(
      createElement(Section as never, {
        section: sec,
        wallKey: "preset:today",
        view: "grid",
        layout: "comfortable",
        query: "",
        filter: "Documents",
        readOnly: false,
        sectionDragging: false,
        cardDragging: false,
        onCardDragState: NOOP,
        onEdit: NOOP,
        onOpen: NOOP,
        onEnlarge: NOOP,
        onBoard: NOOP,
        onModal: NOOP,
        onAddCard: NOOP,
        onAddSection: NOOP,
        onCommitCard: NOOP,
        onDropCard: NOOP,
        onDropSection: NOOP,
        onDragStartSection: NOOP,
        onDragEndSection: NOOP,
        onSolo: NOOP,
        bgRevision: 0,
        onBgChange: NOOP,
      } as never),
    );
    expect(html).toContain("Tagged to Decimals to hundredths");
  });

  it("escapes a teacher-authored lesson title", () => {
    const html = render(
      section([item("A", [{ id: "lx", title: '<img src=x onerror="alert(1)">' }])]),
    );
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });

  it("gives the strip an accessible group name", () => {
    const html = render(section([item("A", [FRACTIONS])]));
    expect(html).toContain('aria-label="Lessons tagged to this section"');
  });
});
