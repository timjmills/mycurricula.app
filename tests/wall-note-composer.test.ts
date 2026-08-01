import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";

import { mountReact } from "./mount-react";
import type { WallItem } from "@/lib/wall-scope";
import { CARD_WASH_TINTS, CARD_WASH_NAMES } from "@/lib/card-wash";

// The Resource Wall's inline note composer — the surface the user called "too
// bare" (they pointed at a Padlet-style reference and asked for something
// closer to it).
//
// WHAT IS UNDER TEST, and why each one is here rather than assumed:
//
//   1. EMPTY SUBMIT. The old composer committed a card labelled literally
//      "Note" from an untouched editor. That is manufactured junk on a shared
//      wall, and nothing stopped it.
//   2. CANCEL. The handoff's composer has no discard at all — both exits
//      commit — and the card is inserted OPTIMISTICALLY, so "close the editor"
//      is not enough: cancelling has to take the card back out again.
//   3. THE COLOUR lands on `resource.wash` — the field the model has carried
//      since the 6.12.26 redesign, which this surface simply never wrote.
//   4. THE ATTACHED LINK becomes a real typed resource, not the handoff's
//      hardcoded `attached='doc'` stub.
//
// ── WHAT THIS FILE CANNOT REACH, AND WHERE IT IS COVERED INSTEAD ───────────
// Typing into a CONTROLLED field does not work under this harness. React tracks
// controlled inputs by replacing the node's `value` property with a getter that
// delegates to the original and a setter that records every write, and decides
// whether to fire `onChange` by comparing the two. Every way of writing the
// value from a test syncs both sides, so React reads "unchanged" and drops the
// event. Measured, not assumed: a two-line control component (a textarea whose
// onChange pushes to an array) saw ZERO calls through the value-tracker reset,
// the prototype-setter bypass, a `change` event, and linkedom's own
// `InputEvent` — while a plain native listener on the same node fired every
// time, and the event was confirmed to bubble to the root. Clicks work; typing
// does not.
//
// So the composer's text arrives through the mocked editor's `onChange`, which
// is exactly the call the real RichTextEditor makes, and the two attachment
// fields are covered by the rule they enforce — `isAttachableLink`, exported for
// this purpose — plus `linkToLessonResource`, which does the mapping. The
// remaining path (typing an invalid URL and seeing the inline error) is a live
// §4b check in a real browser, where typing is real.

vi.setConfig({ testTimeout: 30000 });

/** The text the mocked editor emits on its next "type" click. */
let nextText = "";

// The real editor is a lazily-loaded contenteditable with a floating toolbar and
// a DOMPurify round-trip — none of which linkedom can drive. This stand-in keeps
// the ONE thing Card depends on: `onChange(html)`. Clicking "type" is the
// teacher typing, as far as this component can tell.
vi.mock("@/components/rich-text", () => ({
  RichTextEditor: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (html: string) => void;
    ariaLabel?: string;
  }) =>
    createElement(
      "button",
      {
        type: "button",
        "data-editor": "type",
        "aria-label": ariaLabel,
        onClick: () => onChange(nextText),
      },
      `editor:${value}`,
    ),
}));

// The subject palette needs a provider a bare mount has not got, and the hue is
// not what is under test.
vi.mock("@/lib/palette", () => ({
  useSubjectColor: () => ({ c: "var(--subj-1)", cls: "math" }),
}));

const { Card, isAttachableLink } = await import(
  "@/components/resource-wall-v2/Card"
);
const { linkToLessonResource } = await import("@/lib/resource-embed");

const NOTE: WallItem = {
  key: "k-1",
  type: "notecard",
  label: "Note",
  resource: { type: "notecard", label: "Note" },
  subjectId: "math",
  lessonId: "",
  lessonTitle: "",
  lessons: [],
  composing: true,
} as unknown as WallItem;

/** Every commit and discard the composer emitted, in order. */
const committed: WallItem[] = [];
const discarded: string[] = [];

function Harness({ readOnly = false }: { readOnly?: boolean }): ReactNode {
  return createElement(Card, {
    item: NOTE,
    view: "med",
    sectionId: "sec-1",
    readOnly,
    dragging: false,
    onDragState: () => {},
    onDropBefore: () => {},
    onOpen: () => {},
    onEnlarge: () => {},
    onBoard: () => {},
    onModal: () => {},
    onCommit: (it: WallItem) => void committed.push(it),
    onDiscard: (k: string) => void discarded.push(k),
  } as never);
}

/** Card props for an arbitrary item — the Harness above is fixed to NOTE. */
function cardProps(item: WallItem) {
  return {
    item,
    view: "med",
    sectionId: "sec-1",
    readOnly: false,
    dragging: false,
    onDragState: () => {},
    onDropBefore: () => {},
    onOpen: () => {},
    onEnlarge: () => {},
    onBoard: () => {},
    onModal: () => {},
    onCommit: (it: WallItem) => void committed.push(it),
    onDiscard: (k: string) => void discarded.push(k),
  };
}

const byText =
  (label: string) =>
  (el: Element): boolean =>
    (el.textContent ?? "").trim() === label;

async function open() {
  committed.length = 0;
  discarded.length = 0;
  nextText = "";
  const h = await mountReact(Harness);
  await h.render({ readOnly: false });
  return h;
}

/** The teacher types — through the same `onChange` the real editor calls. */
async function type(h: Awaited<ReturnType<typeof open>>, text: string) {
  nextText = text;
  await h.click((el) => el.getAttribute("data-editor") === "type");
}

beforeEach(() => {
  committed.length = 0;
  discarded.length = 0;
});

describe("the wall's note composer does not manufacture junk", () => {
  it("refuses to commit an empty note", async () => {
    const h = await open();
    try {
      // POSITIVE CONTROL: the composer really is open and Done really is on
      // screen — otherwise "nothing was committed" would be true of a blank
      // render, and this test would pass against a component that never mounted.
      expect(h.html()).toContain("Done");
      expect(h.html()).toContain("Cancel");

      await h.click(byText("Done"));
      expect(committed).toHaveLength(0);
    } finally {
      await h.unmount();
    }
  });

  it("commits once the note has text, and names the card after its first line", async () => {
    const h = await open();
    try {
      await type(h, "Fractions warm-up");
      await h.click(byText("Done"));

      expect(committed).toHaveLength(1);
      expect(committed[0]?.label).toBe("Fractions warm-up");
      expect(committed[0]?.composing).toBe(false);
      expect(committed[0]?.resource.body).toBe("Fractions warm-up");
    } finally {
      await h.unmount();
    }
  });

  it("shows the derived title BEFORE the teacher commits", async () => {
    const h = await open();
    try {
      // Before: the composer says what WILL happen rather than naming a card
      // that does not exist yet.
      expect(h.html()).toContain("becomes the card");
      await type(h, "Fractions warm-up");
      // After: the actual name, live.
      expect(h.html()).toContain("Saves as");
      expect(h.html()).toContain("Fractions warm-up");
    } finally {
      await h.unmount();
    }
  });
});

describe("the wall's note composer can be left without committing", () => {
  it("Cancel removes the card the + inserted", async () => {
    const h = await open();
    try {
      await type(h, "changed my mind");
      await h.click(byText("Cancel"));

      // Both halves: nothing was saved AND the optimistic card was withdrawn.
      // Asserting only the first would pass while an empty card sat on the wall
      // — which is the whole defect.
      expect(committed).toHaveLength(0);
      expect(discarded).toEqual(["k-1"]);
    } finally {
      await h.unmount();
    }
  });
});

describe("a phone never inherits a half-composed card", () => {
  it("withdraws a still-composing card when the surface turns view-only", async () => {
    // Phones are view-only (locked product decision), so the editor closes when
    // a session is resized down. The card it was editing exists ONLY because
    // the composer opened it — leaving it behind puts an empty card titled
    // "Note" on a shared wall that a phone can neither edit nor delete. Found
    // live at 375px, not reasoned about.
    const h = await open();
    try {
      expect(h.html()).toContain("Done"); // control: the composer really is open
      await h.render({ readOnly: true });

      expect(discarded).toEqual(["k-1"]);
      expect(committed).toHaveLength(0);
    } finally {
      await h.unmount();
    }
  });
});

describe("the wall's note composer sets the card's own colour", () => {
  // Read the slot out of the palette instead of hard-coding one. These cases
  // are about the WIRING — a picked swatch reaching `resource.wash` — and they
  // used to name slot 5, which is no longer offered: `CARD_WASH_TINTS` is now
  // the seven slots no team subject owns, and 5 is Writing's. A test that
  // encodes a curation decision it does not test goes red for the wrong reason
  // the next time the palette is curated.
  const SLOT = CARD_WASH_TINTS[0];
  const SLOT_LABEL = `Card colour ${CARD_WASH_NAMES[SLOT]}`;

  it("writes the picked swatch to the model's existing `wash` field", async () => {
    const h = await open();
    try {
      await type(h, "Coloured note");

      // The picker stays closed until asked for — the composer opens quiet.
      expect(h.queryAll('[aria-label^="Card colour "]')).toHaveLength(0);
      await h.click((el) => el.getAttribute("aria-label") === "Card colour");
      expect(
        h.queryAll('[aria-label^="Card colour "]').length,
      ).toBeGreaterThan(0);

      await h.click((el) => el.getAttribute("aria-label") === SLOT_LABEL);
      await h.click(byText("Done"));

      expect(committed).toHaveLength(1);
      // `wash` — NOT a new field. The model has carried it since the 6.12.26
      // redesign; this surface simply never wrote it.
      expect(committed[0]?.resource.wash).toBe(SLOT);
    } finally {
      await h.unmount();
    }
  });

  it("leaves `wash` unset when the teacher picks the subject default", async () => {
    // The complement: "no colour" must mean ABSENT, not a stored sentinel, so a
    // card the teacher never coloured is byte-identical to one that predates
    // the picker.
    const h = await open();
    try {
      await type(h, "Plain note");
      await h.click((el) => el.getAttribute("aria-label") === "Card colour");
      await h.click((el) => el.getAttribute("aria-label") === SLOT_LABEL);
      await h.click(
        (el) => el.getAttribute("aria-label") === "Subject colour (default)",
      );
      await h.click(byText("Done"));

      expect(committed).toHaveLength(1);
      expect(committed[0]?.resource.wash).toBeUndefined();
    } finally {
      await h.unmount();
    }
  });
});

describe("a saved link stays visible, editable and removable", () => {
  const WITH_LINK = {
    ...NOTE,
    key: "k-2",
    composing: false,
    label: "Fractions note",
    resource: {
      type: "notecard",
      label: "Fractions note",
      body: "Fractions note",
      gallery: [
        {
          type: "link",
          label: "Number line applet",
          url: "https://example.test/applet",
        },
      ],
    },
  } as unknown as WallItem;

  it("shows the attached link on the committed card, as a real link", async () => {
    // Without this the feature ends at the composer: a teacher adds a link,
    // saves, and can never see or open it again (§4a review, Medium).
    const h = await mountReact(() =>
      createElement(Card, { ...cardProps(WITH_LINK) } as never),
    );
    try {
      await h.render({ readOnly: false });
      const link = h.query('a[href="https://example.test/applet"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toContain("Number line applet");
      // Opened safely — a new tab with no window.opener handle back.
      expect(link?.getAttribute("rel")).toContain("noopener");
    } finally {
      await h.unmount();
    }
  });

  it("seeds the composer from the saved link, so it can be edited", async () => {
    const h = await mountReact(() =>
      createElement(Card, { ...cardProps(WITH_LINK), forceEdit: true } as never),
    );
    try {
      await h.render({ readOnly: false });
      // Double-click opens the editor on an existing note.
      const card = h.query("[data-kind]");
      if (card) await h.dblClick(card);
      const inputs = h.queryAll("input");
      expect(inputs).toHaveLength(2);
      expect(inputs[0].getAttribute("value")).toBe("Number line applet");
      expect(inputs[1].getAttribute("value")).toBe("https://example.test/applet");
    } finally {
      await h.unmount();
    }
  });
});

describe("the attachment row offers a real resource, not a stub", () => {
  it("reveals the two fields the handoff's own better pattern uses", async () => {
    const h = await open();
    try {
      expect(h.queryAll("input")).toHaveLength(0);
      await h.click(byText("Add link"));

      const inputs = h.queryAll("input");
      expect(inputs).toHaveLength(2);
      expect(h.html()).toContain("Resource name");
      expect(h.html()).toContain("Paste link (optional)");
    } finally {
      await h.unmount();
    }
  });

  it("accepts only http(s) links", () => {
    // The rule the inline error and the commit guard both read.
    expect(isAttachableLink("https://example.test/x")).toBe(true);
    expect(isAttachableLink("http://example.test/x")).toBe(true);
    expect(isAttachableLink("  https://example.test/x  ")).toBe(true);
    // The ones that would commit a card whose link silently does nothing.
    expect(isAttachableLink("javascript:alert(1)")).toBe(false);
    expect(isAttachableLink("mailto:a@b.test")).toBe(false);
    expect(isAttachableLink("example.test/x")).toBe(false);
    expect(isAttachableLink("")).toBe(false);
  });

  it("detects the resource type from the URL", () => {
    // The handoff hardcodes `attached='doc'` for everything — a fake. This is
    // what replaces it.
    expect(
      linkToLessonResource("https://www.youtube.com/watch?v=abc12345678")?.type,
    ).toBe("youtube");
    expect(
      linkToLessonResource("https://docs.google.com/document/d/1/edit")?.type,
    ).toBe("doc");
    expect(linkToLessonResource("https://example.test/page")?.type).toBe("link");
  });

  it("names the attachment for the teacher, falling back to the parsed name", () => {
    expect(
      linkToLessonResource("https://example.test/x", "Number line applet")?.label,
    ).toBe("Number line applet");
    // No name given — never a bare URL as the label.
    const auto = linkToLessonResource("https://example.test/x");
    expect(auto?.label.length).toBeGreaterThan(0);
    expect(auto?.url).toBe("https://example.test/x");
  });

  it("refuses to BUILD a resource from an unstorable URL", () => {
    // The persistence boundary, not just the UI guard (§4a review, Medium): a
    // future caller without the composer's field validation must not be able to
    // store a `javascript:` row either.
    expect(linkToLessonResource("javascript:alert(1)")).toBeNull();
    expect(linkToLessonResource("mailto:a@b.test")).toBeNull();
    // The shapes a scheme-prefix test waves through and a real parse does not.
    expect(linkToLessonResource("https://")).toBeNull();
    expect(isAttachableLink("https://")).toBe(false);
  });
});
