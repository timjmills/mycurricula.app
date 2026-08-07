import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "react";
import fs from "node:fs";
import path from "node:path";

import { mountReact } from "./mount-react";
import type { Lesson } from "@/lib/types";
import { COMPARE_REQUEST_EVENT } from "@/lib/fork-diff";

// THE FORK DIFF HAD NO LIVE HOST ON THE SHIPPED BUILD.
//
// <ForkDiffPanel> — the surface that shows a teacher every field where their
// personal copy differs from the Team Curriculum, with per-field revert — was
// unreachable under NEXT_PUBLIC_V2 (default ON, in prod since 2026-07-23).
// Both documented entry points died at the same seam: the ONLY consumer of
// `?compare=1` and the ONLY listener for COMPARE_REQUEST_EVENT lived in
// components/daily/LessonDetail.tsx, which is imported only by DailyViewV1 —
// the flag-OFF shell. Under V2, /daily renders <DailyView> (the day-v2
// canvas), which never mounts LessonDetail, so the menu item pushed a URL
// nobody read and dispatched an event nobody heard.
//
// <ForkDiffHost> is the fix: one always-mounted listener in the planner
// layout. These tests mount it for real (effects run) and assert the panel
// APPEARS — a string render would prove nothing, because both entry points
// are effects.
//
// The v1 path is guarded at the bottom of this file, structurally: it is the
// flag-OFF rollback and must keep its own inline wiring, and the new host must
// stay V2-gated so v1 never gets two panels for one request.

const spies = vi.hoisted(() => ({
  editMode: "personal" as "personal" | "master",
  lessons: [] as unknown[],
  setEditMode: vi.fn(),
  editLesson: vi.fn(),
  revertPlacement: vi.fn(),
  restoreLesson: vi.fn(),
  getSections: vi.fn(() => [] as unknown[]),
}));

vi.mock("@/lib/app-state", () => ({
  useAppState: () => ({
    editMode: spies.editMode,
    setEditMode: spies.setEditMode,
  }),
}));

vi.mock("@/lib/planner-store", () => ({
  usePlanner: () => ({
    lessons: spies.lessons,
    editLesson: spies.editLesson,
    revertPlacement: spies.revertPlacement,
    restoreLesson: spies.restoreLesson,
    getSections: spies.getSections,
  }),
}));

const { ForkDiffHost } = await import(
  "@/components/lesson-card/fork-diff-host"
);

/** A personally-forked lesson: title, objective and day all diverge from the
 *  captured team snapshot, so canCompareWithTeam() passes and the panel has
 *  real rows to render. */
const FORKED = {
  id: "r-12-1",
  subject: "reading",
  unitId: "u-1",
  title: "Book club — Via's chapters",
  objective: "I can compare two characters' points of view.",
  preview: "Small groups discuss chapters 4-6.",
  standards: ["5.RL.6"],
  standardIds: [],
  day: 1,
  week: 12,
  status: "planned",
  modified: true,
  moved: true,
  masterSnapshot: {
    title: "Literature circles — Via's chapters",
    objective: "I can identify a character's point of view.",
    preview: "Small groups discuss chapters 4-6.",
    standards: ["5.RL.6"],
    day: 0,
    week: 12,
  },
} as unknown as Lesson;

/** Never forked: no snapshot, nothing moved. canCompareWithTeam() is false, so
 *  no entry point may open a diff on it. */
const UNEDITED = {
  id: "m-12-0",
  subject: "math",
  unitId: "u-2",
  title: "Fraction models",
  objective: "I can model equivalent fractions.",
  preview: "",
  standards: [],
  standardIds: [],
  day: 0,
  week: 12,
  status: "planned",
  modified: false,
} as unknown as Lesson;

/** The panel's own header line. Asserting on THIS (not merely "some markup
 *  appeared") is what makes the test bite: an empty dialog shell around a
 *  null panel would still produce a `[role=dialog]`. */
const PANEL_MARKER = "Compared with the Team Curriculum";

type Win = {
  location: { protocol: string; href: string; search: string };
  history: { replaceState: (...a: unknown[]) => void };
  Event: new (type: string, init?: { bubbles?: boolean }) => Event;
  dispatchEvent: (e: Event) => boolean;
};

const win = (): Win => (globalThis as unknown as { window: Win }).window;

/** Point the harness window at a URL. mount-react installs a minimal
 *  `location` stub with no `search`; both host paths read it. */
function setUrl(search: string): void {
  win().location = {
    protocol: "http:",
    href: `http://localhost/daily${search}`,
    search,
  };
}

const replaceState = vi.fn();

/** Install what the host touches beyond what mount-react provides, AFTER the
 *  globals exist but BEFORE the first render (the cold-URL read happens in the
 *  mount effect). */
function primeWindow(search: string): void {
  setUrl(search);
  win().history = { replaceState };
}

/** Dispatch the same CustomEvent lib/fork-diff's requestCompare() sends.
 *  linkedom ships no CustomEvent constructor, so the detail rides a plain
 *  Event — which is all the listener reads. */
async function fireCompare(lessonId: string): Promise<void> {
  await act(async () => {
    const w = win();
    const ev = new w.Event(COMPARE_REQUEST_EVENT);
    (ev as unknown as { detail: unknown }).detail = { lessonId };
    w.dispatchEvent(ev);
  });
}

beforeEach(() => {
  spies.editMode = "personal";
  spies.lessons = [FORKED, UNEDITED];
  spies.editLesson.mockReset();
  spies.revertPlacement.mockReset();
  spies.restoreLesson.mockReset();
  replaceState.mockReset();
});

describe("entry point 1 — the card menu's compare request", () => {
  it("opens the diff for the requested lesson", async () => {
    const h = await mountReact(ForkDiffHost);
    try {
      primeWindow("");
      await h.render({});
      // NEGATIVE CONTROL. Without it, "the panel is present after the event"
      // is equally true of a host that renders the panel unconditionally.
      expect(h.html()).toBe("");

      await fireCompare(FORKED.id);

      expect(h.html()).toContain(PANEL_MARKER);
      expect(h.query('[role="dialog"]')).not.toBeNull();
    } finally {
      await h.unmount();
    }
  });

  it("refuses an unedited lesson — there is nothing to compare", async () => {
    const h = await mountReact(ForkDiffHost);
    try {
      primeWindow("");
      await h.render({});
      await fireCompare(UNEDITED.id);
      // Paired with the positive case above: the host IS capable of opening,
      // so an empty result here is canCompareWithTeam() firing, not a broken
      // fixture.
      expect(h.html()).toBe("");
    } finally {
      await h.unmount();
    }
  });

  it("refuses in Team-Curriculum mode — the reverts write to the shared copy", async () => {
    spies.editMode = "master";
    const h = await mountReact(ForkDiffHost);
    try {
      primeWindow("");
      await h.render({});
      await fireCompare(FORKED.id);
      expect(h.html()).toBe("");
    } finally {
      await h.unmount();
    }
  });

  it("stays armed while the store is still hydrating, then opens", async () => {
    // The normal cold shape: the request lands before the document does. A
    // host that resolved once and gave up would drop every deep link on a
    // cold load, which is exactly the window a teacher clicks in.
    spies.lessons = [];
    const h = await mountReact(ForkDiffHost);
    try {
      primeWindow("");
      await h.render({});
      await fireCompare(FORKED.id);
      expect(h.html()).toBe("");

      spies.lessons = [FORKED];
      await h.render({});

      expect(h.html()).toContain(PANEL_MARKER);
    } finally {
      await h.unmount();
    }
  });
});

describe("entry point 2 — the /daily?lesson=<id>&compare=1 deep link", () => {
  it("opens the diff from the URL alone, with no event", async () => {
    const h = await mountReact(ForkDiffHost);
    try {
      primeWindow(`?lesson=${FORKED.id}&compare=1`);
      await h.render({});

      expect(h.html()).toContain(PANEL_MARKER);
    } finally {
      await h.unmount();
    }
  });

  it("ignores a plain ?lesson= link — that one only selects a lesson", async () => {
    // `/daily?lesson=<id>` is the pre-existing Subject→Daily / "Go to lesson"
    // jump link and must keep its old meaning.
    const h = await mountReact(ForkDiffHost);
    try {
      primeWindow(`?lesson=${FORKED.id}`);
      await h.render({});
      expect(h.html()).toBe("");
    } finally {
      await h.unmount();
    }
  });

  it("requires compare=1 exactly, not merely the key's presence", async () => {
    // The documented contract is `compare=1` (lib/fork-diff.ts:137). A host
    // that only checked for the KEY would open on `compare=0`, which is the
    // one spelling a caller would reach for to say "no".
    const h = await mountReact(ForkDiffHost);
    try {
      primeWindow(`?lesson=${FORKED.id}&compare=0`);
      await h.render({});
      expect(h.html()).toBe("");
    } finally {
      await h.unmount();
    }
  });

  it("still refuses an unedited lesson from a hand-typed URL", async () => {
    // The deep link is a SECOND entry point that never passed the menu's
    // gate, so the gate has to exist here too.
    const h = await mountReact(ForkDiffHost);
    try {
      primeWindow(`?lesson=${UNEDITED.id}&compare=1`);
      await h.render({});
      expect(h.html()).toBe("");
    } finally {
      await h.unmount();
    }
  });

  it("drops the consumed param on close so a refresh doesn't reopen it", async () => {
    const h = await mountReact(ForkDiffHost);
    try {
      primeWindow(`?lesson=${FORKED.id}&compare=1`);
      await h.render({});
      expect(h.html()).toContain(PANEL_MARKER);

      // The panel's footer mode-switch closes it (and is the one close path
      // reachable without knowing the panel's icon markup).
      await h.click((el) => (el.textContent ?? "").trim() === "Edit the Team version");

      expect(h.html()).toBe("");
      expect(replaceState).toHaveBeenCalled();
      const written = String(replaceState.mock.calls[0]?.[2] ?? "");
      expect(written).not.toContain("compare=1");
    } finally {
      await h.unmount();
    }
  });
});

// ── The v1 path must not regress, and must not double-render ───────────────
//
// STRUCTURAL, and labelled as such: LessonDetail is a deep component with a
// large dependency surface, and mounting it here would need so many mocks that
// the test would assert against the mocks. What this DOES catch is the real
// risk — someone tidying up "dead" v1 wiring after the v2 host lands, which
// would silently break the NEXT_PUBLIC_V2=0 rollback build.
describe("the flag-OFF (v1) path keeps its own inline wiring", () => {
  const read = (rel: string): string =>
    fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");

  it("LessonDetail still consumes BOTH the event and ?compare=1", () => {
    const src = read("components/daily/LessonDetail.tsx");
    // Positive control: the file is the one we think it is.
    expect(src).toContain("export function LessonDetail");
    expect(src).toContain("COMPARE_REQUEST_EVENT");
    expect(src).toContain('addEventListener(COMPARE_REQUEST_EVENT');
    expect(src).toContain('params.get("compare") === "1"');
    expect(src).toContain("<ForkDiffPanel");
  });

  it("DailyViewV1 is still the component that mounts LessonDetail", () => {
    const src = read("components/daily/DailyViewV1.tsx");
    expect(src).toContain('import { LessonDetail } from "./LessonDetail"');
    expect(src).toContain("<LessonDetail");
  });

  it("the new host is mounted ONLY under V2, so v1 gets one panel not two", () => {
    const src = read("app/(planner)/layout.tsx");
    // Both halves matter: the host is mounted at all, AND it is gated.
    expect(src).toContain("ForkDiffHost");
    expect(src).toMatch(/\{V2 && <ForkDiffHost \/>\}/);
  });
});
