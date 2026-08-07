import { describe, it, expect, vi, beforeEach } from "vitest";
import { createElement, type ReactNode } from "react";

import { mountReact } from "./mount-react";
import type { WallItem } from "@/lib/wall-scope";
import type { LessonResource } from "@/lib/types";
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

const { Card, isAttachableLink, linkEdited } = await import(
  "@/components/resource-wall-v2/Card"
);
const { linkToLessonResource } = await import("@/lib/resource-embed");
// The REAL persistence module, not a stand-in: the removal cases below have to
// prove the link is gone from storage, and `saveCustomWalls` writes through
// `JSON.stringify`, where the difference between `gallery: undefined` and
// `gallery: null` decides whether a removed link comes back on the next load.
const { saveCustomWalls, loadCustomWalls } = await import(
  "@/components/resource-wall-v2/wall-state"
);

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

/** A saved note that already carries a link — the subject of every re-edit case
 *  below (removing the link, reopening after Cancel, the double-click race). */
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

/** Every commit and discard the composer emitted, in order. */
const committed: WallItem[] = [];
const discarded: string[] = [];
/** Every card the surface asked to open in the preview lightbox. */
const modals: WallItem[] = [];
/** Every time the card asked the wall to SHUT the lightbox. */
const closes: number[] = [];
/** Every card sent to the Enlarge action — a nested control that must win over
 *  a lightbox the card queued a moment earlier. */
const enlarged: WallItem[] = [];

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
    onModal: (it: WallItem) => void modals.push(it),
    onCloseModal: () => void closes.push(Date.now()),
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
    onEnlarge: (it: WallItem) => void enlarged.push(it),
    onBoard: () => {},
    onModal: (it: WallItem) => void modals.push(it),
    onCloseModal: () => void closes.push(Date.now()),
    onCommit: (it: WallItem) => void committed.push(it),
    onDiscard: (k: string) => void discarded.push(k),
  };
}

/** The saved-note card, re-renderable with a different `readOnly`. */
function LinkHarness({ readOnly = false }: { readOnly?: boolean }): ReactNode {
  return createElement(Card, { ...cardProps(WITH_LINK), readOnly } as never);
}

/** Mount the saved note and clear the recorders. */
async function openSaved() {
  committed.length = 0;
  discarded.length = 0;
  modals.length = 0;
  closes.length = 0;
  enlarged.length = 0;
  nextText = "";
  const h = await mountReact(LinkHarness);
  await h.render({ readOnly: false });
  return h;
}

/** The card shell — the element carrying the click/dblclick handlers. */
function shell(h: { query: (selector: string) => Element | null }): Element {
  const el = h.query("[data-kind]");
  if (!el) throw new Error("no card rendered — the harness is lying");
  return el;
}

/**
 * Click with an explicit `detail` (the browser's click COUNT), which the
 * harness's own click helper cannot set — the lightbox deferral branches on it,
 * so a test that cannot set it cannot reach the keyboard path at all.
 *
 * The assignment is checked rather than assumed: linkedom's Event is not the
 * platform's, and a `detail` that silently failed to attach would make every
 * assertion below a test of the default branch wearing another branch's name.
 */
async function clickWithDetail(el: Element, detail: number): Promise<void> {
  const { act } = await import("react");
  const w = globalThis as unknown as { window: { Event: typeof Event } };
  const ev = new w.window.Event("click", { bubbles: true });
  (ev as unknown as { detail: number }).detail = detail;
  if ((ev as unknown as { detail: number }).detail !== detail) {
    throw new Error("could not set event.detail — the instrument is lying");
  }
  await act(async () => {
    el.dispatchEvent(ev);
  });
}

/** Wait past the double-click window, on REAL timers.
 *
 *  Not `vi.useFakeTimers()`: React's scheduler drains this harness's work
 *  through macrotasks (mount-react's own note), and freezing them risks
 *  `act()` never returning — a hang, which reads as a flaky suite rather than
 *  as the wrong instrument. The wait is one-directional either way: the
 *  cancelled-timer assertions can only go redder if the machine stalls, never
 *  greener. */
const PAST_THE_WINDOW = 400;
function waitPastWindow(): Promise<void> {
  return new Promise((r) => setTimeout(r, PAST_THE_WINDOW));
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
  modals.length = 0;
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

describe("Remove link actually removes the link", () => {
  // The defect this replaces: the composer's no-op guard asked whether there
  // was something to ATTACH, and `null` reads the same for "the teacher just
  // removed the link" as for "this note never had one". So Done on a removal
  // returned before `onCommit`, the composer closed as though it had saved, and
  // the link was still on the card after a reload — silently (live QA
  // 2026-08-02, bug 1). Every case here goes through the real Remove-link
  // button, not a simulated state change.

  it("commits the removal, and a saved wall loses the gallery entry", async () => {
    const h = await openSaved();
    try {
      await h.dblClick(shell(h));
      // POSITIVE CONTROLS, both halves of what the live probe had to establish:
      // the composer is open, and it is seeded with the link that is about to
      // be removed. Without these, "the commit had no gallery" would also be
      // true of a composer that never saw one.
      expect(h.queryAll("input")).toHaveLength(2);
      expect(h.queryAll("input")[1].getAttribute("value")).toBe(
        "https://example.test/applet",
      );

      await h.click(byText("Remove link"));
      // The removal registered in the composer — the live pass's G2.
      expect(h.queryAll("input")).toHaveLength(0);
      expect(h.html()).toContain("Add link");

      await h.click(byText("Done"));
      expect(committed).toHaveLength(1);
      expect(committed[0]?.resource.gallery).toBeUndefined();
      // The rest of the note survived the removal — this is a link being
      // deleted, not a card being blanked.
      expect(committed[0]?.resource.body).toBe("Fractions note");

      // AND IT SURVIVES PERSISTENCE. `saveCustomWalls` JSON-stringifies the
      // wall, so an `undefined` gallery disappears while a `null` one would be
      // restored as a present-but-empty field. Real module, real (per-mount)
      // localStorage.
      saveCustomWalls([
        {
          id: "w-1",
          name: "This Week",
          anchor: "forked",
          layout: [
            {
              id: "s-1",
              title: "Math",
              meta: "",
              subjectId: "math",
              items: [committed[0] as WallItem],
            },
          ],
          view: "med",
          created: 1,
        },
      ]);
      const back = loadCustomWalls();
      // Control: the card itself round-tripped, so an absent gallery is the
      // gallery being gone and not the whole item being dropped by the
      // validator.
      expect(back[0]?.layout[0]?.items).toHaveLength(1);
      expect(back[0]?.layout[0]?.items[0]?.label).toBe("Fractions note");
      expect(back[0]?.layout[0]?.items[0]?.resource.gallery).toBeUndefined();
    } finally {
      await h.unmount();
    }
  });

  // ── The comparison itself ────────────────────────────────────────────────
  // `linkEdited` is exported for these four: the mount harness cannot type into
  // a controlled field (see the file header), so a RENAME — the case the label
  // half of the guard exists for — is unreachable through the UI here. It is
  // proven directly on the function, and the field that feeds it is proven in
  // the live §4b pass.
  describe("linkEdited — did the teacher change the link?", () => {
    const SAVED: LessonResource = {
      type: "link",
      label: "Number line applet",
      url: "https://example.test/applet",
    };
    const build = (url: string, label?: string) =>
      linkToLessonResource(url, label);

    it("says NO when the composer rebuilds exactly what was stored", () => {
      // The no-churn property: reopening a note and pressing Done must not
      // fork the wall.
      expect(
        linkEdited(SAVED, build("https://example.test/applet", "Number line applet")),
      ).toBe(false);
    });

    it("says YES when the link was removed", () => {
      expect(linkEdited(SAVED, null)).toBe(true);
    });

    it("says YES when only the LABEL changed — a rename is an edit", () => {
      expect(
        linkEdited(SAVED, build("https://example.test/applet", "Fraction tool")),
      ).toBe(true);
    });

    it("says NO when the difference is only the builder's own normalisation", () => {
      // The trap this shape exists to avoid (§4a review, Medium). A stored
      // entry with a BLANK label seeds a blank name field, and the builder
      // fills it with the parsed display name on the way out — so a raw
      // payload-vs-storage comparison reads a composer nobody touched as an
      // edit, and forks a preset wall on a no-op Done. Worse, if the display
      // name derivation ever changes, that shape would commit EVERY note with
      // a link the next time it was opened.
      const BLANK: LessonResource = { ...SAVED, label: "" };
      const rebuilt = build("https://example.test/applet", "");
      expect(rebuilt?.label).toBeTruthy(); // control: it really does normalise
      expect(linkEdited(BLANK, rebuilt)).toBe(false);
    });
  });

  it("still refuses to churn the wall when nothing changed at all", async () => {
    // The other direction, and the reason the guard exists: opening a note with
    // a link and pressing Done must NOT commit, because a commit on a preset
    // wall forks it (CLAUDE.md §2). The old shape failed this — a seeded
    // attachment made `!attachment` false and every no-op reopen committed.
    const h = await openSaved();
    try {
      await h.dblClick(shell(h));
      expect(h.queryAll("input")).toHaveLength(2); // control: composer open
      await h.click(byText("Done"));
      expect(committed).toHaveLength(0);
    } finally {
      await h.unmount();
    }
  });
});

describe("re-opening a saved note shows what is still saved", () => {
  it("Cancel then re-open seeds from the gallery entry that is still there", async () => {
    // `attachOpen` / `attachName` / `attachUrl` were seeded by `useState`
    // initialisers, which run once per MOUNT — and the card stays mounted
    // across open → Cancel → open. So the second composer came up blank over a
    // note that still had a link, and the next save would have deleted it
    // (QA 2026-08-02, minor 4 — filed from the code, never exercised live).
    const h = await openSaved();
    try {
      await h.dblClick(shell(h));
      expect(h.queryAll("input")).toHaveLength(2); // control: seeded first time
      await h.click(byText("Cancel"));
      expect(h.queryAll("input")).toHaveLength(0); // control: really closed
      expect(committed).toHaveLength(0);
      expect(discarded).toHaveLength(0); // a saved note is not withdrawn

      await h.dblClick(shell(h));
      const inputs = h.queryAll("input");
      expect(inputs).toHaveLength(2);
      expect(inputs[0].getAttribute("value")).toBe("Number line applet");
      expect(inputs[1].getAttribute("value")).toBe(
        "https://example.test/applet",
      );

      // THE CONSEQUENCE, which is what makes this a bug and not a cosmetic
      // one: saving from the re-opened composer leaves the link alone. With
      // empty fields here, Done would have read as "the link was removed" and
      // committed the deletion.
      await h.click(byText("Done"));
      expect(committed).toHaveLength(0);
    } finally {
      await h.unmount();
    }
  });
});

describe("a saved note can be reached without knowing about double-click", () => {
  it("offers an Edit button in the hover bar that opens the composer", async () => {
    // Double-click was the ONLY way back into a saved note, and an undiscovered
    // one: the hover bar offered open / play / expand / present and no pencil,
    // so a first encounter reads as "notes can't be edited" (QA 2026-08-02).
    const h = await openSaved();
    try {
      const edit = h.query('[aria-label="Edit Fractions note"]');
      expect(edit).toBeTruthy();
      await h.clickElement(edit as Element);

      expect(h.html()).toContain("Done"); // the composer, not the lightbox
      expect(h.queryAll("input")).toHaveLength(2); // seeded from the saved link
      expect(modals).toHaveLength(0); // and no preview opened over it
    } finally {
      await h.unmount();
    }
  });

  it("withholds it where there is no editor — a phone is view-only", async () => {
    const h = await openSaved();
    try {
      expect(h.query('[aria-label="Edit Fractions note"]')).toBeTruthy();
      await h.render({ readOnly: true });
      expect(h.query('[aria-label="Edit Fractions note"]')).toBeNull();
      // Control: the rest of the bar is still there, so this is Edit being
      // withheld rather than the whole card failing to render.
      expect(h.query('[aria-label="Open Fractions note"]')).toBeTruthy();
    } finally {
      await h.unmount();
    }
  });
});

describe("a double-click opens the editor, not the lightbox over it", () => {
  it("holds the single-click lightbox until the double-click window passes", async () => {
    const h = await openSaved();
    try {
      await clickWithDetail(shell(h), 1);
      // THE FIX. Before it this was already 1, and the dblclick that followed
      // opened the composer UNDERNEATH the modal.
      expect(modals).toHaveLength(0);

      await waitPastWindow();
      // POSITIVE CONTROL, and the one that matters most here: a plain single
      // click still opens the lightbox. A "fix" that simply swallowed card
      // clicks would pass every other assertion in this block.
      expect(modals).toHaveLength(1);
    } finally {
      await h.unmount();
    }
  });

  it("cancels it when the second click arrives", async () => {
    const h = await openSaved();
    try {
      // The exact sequence a browser sends for a double-click.
      await clickWithDetail(shell(h), 1);
      await clickWithDetail(shell(h), 2);
      await h.dblClick(shell(h));

      // The composer is open, seeded …
      expect(h.html()).toContain("Done");
      expect(h.queryAll("input")).toHaveLength(2);
      // … and alone. Then, and after the window has fully passed.
      expect(modals).toHaveLength(0);
      await waitPastWindow();
      expect(modals).toHaveLength(0);
    } finally {
      await h.unmount();
    }
  });

  it("opens immediately for a keyboard / assistive-technology activation", async () => {
    // `detail === 0` is what a non-pointer activation carries. It can never be
    // the first half of a double-click, so it must not pay the delay — no
    // wait before this assertion, deliberately.
    const h = await openSaved();
    try {
      await clickWithDetail(shell(h), 0);
      expect(modals).toHaveLength(1);
    } finally {
      await h.unmount();
    }
  });

  it("ignores the trailing click of a double-click", async () => {
    const h = await openSaved();
    try {
      await clickWithDetail(shell(h), 2);
      await waitPastWindow();
      expect(modals).toHaveLength(0);
    } finally {
      await h.unmount();
    }
  });

  it("shuts a preview that is already open, when the double-click reaches the card", async () => {
    // ⚠ READ THE SCOPE BEFORE TRUSTING THIS TEST. It covers the PRE-PAINT band
    // only: the timer has fired but the lightbox has not painted, so the second
    // click still reaches the card. It does NOT prove the general slow
    // double-click works, and cannot — there is no real lightbox in this mount,
    // so nothing here does hit-testing. In a browser, once the scrim paints it
    // swallows click #2 and this component never runs at all. That case is
    // measured in the live §4b probe and documented as a residual on
    // DOUBLE_CLICK_WINDOW_MS; it is not fixed by what this test asserts.
    const h = await openSaved();
    try {
      await clickWithDetail(shell(h), 1);
      await waitPastWindow();
      // Control: the preview really is open when the second click lands.
      expect(modals).toHaveLength(1);
      expect(closes).toHaveLength(0);

      await clickWithDetail(shell(h), 2);
      await h.dblClick(shell(h));
      expect(closes).toHaveLength(1); // the preview was put away …
      expect(h.queryAll("input")).toHaveLength(2); // … and the composer is up
    } finally {
      await h.unmount();
    }
  });

  it("drops the queued lightbox even when the nested control stops propagation", async () => {
    // The card's own attached link calls `stopPropagation` so that following it
    // does not also open the modal — which means the card's BUBBLING click
    // handler never sees it, and a cancel that lived there was silently skipped.
    // The queued preview then opened on top of the new tab the teacher had just
    // opened (§4a review round 2, Medium). The cancel is on the capture phase
    // for exactly this reason.
    const h = await openSaved();
    try {
      await clickWithDetail(shell(h), 1);
      expect(modals).toHaveLength(0); // control: queued, not yet fired
      const link = h.query('a[href="https://example.test/applet"]');
      expect(link).toBeTruthy(); // control: the propagation-stopping control is there
      await h.clickElement(link as Element);

      await waitPastWindow();
      expect(modals).toHaveLength(0);
    } finally {
      await h.unmount();
    }
  });

  it("drops the queued lightbox when the next click is a nested action", async () => {
    // Click the note body, then reach for one of the hover-bar actions inside
    // the window. `fromInteractive` stops that click opening the modal, but the
    // one already QUEUED used to survive it — so the preview popped open on top
    // of the thing the teacher had just asked for (§4a review, Medium).
    const h = await openSaved();
    try {
      await clickWithDetail(shell(h), 1);
      expect(modals).toHaveLength(0); // control: queued, not yet fired
      const enlarge = h.query('[aria-label="Enlarge Fractions note"]');
      expect(enlarge).toBeTruthy(); // control: the nested action is really there
      await h.clickElement(enlarge as Element);

      expect(enlarged).toHaveLength(1); // the action the teacher asked for ran
      await waitPastWindow();
      expect(modals).toHaveLength(0); // and nothing opened on top of it
    } finally {
      await h.unmount();
    }
  });

  it("does not fire a queued lightbox into an unmounted card", async () => {
    // A timer outliving its component would open a preview for a card on a
    // wall the teacher has already left.
    const h = await openSaved();
    await clickWithDetail(shell(h), 1);
    expect(modals).toHaveLength(0); // control: it really is queued
    await h.unmount();
    await waitPastWindow();
    expect(modals).toHaveLength(0);
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
