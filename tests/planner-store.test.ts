// planner-store.test.ts — the planner store's PURE history reducer
// (lib/planner-store.tsx historyReducer), driven directly without mounting
// the provider (W3.8). Pins the contracts the lesson editor leans on:
//
//   • text-edit coalescing — same coalesce key within the 700ms window
//     collapses a typing burst into ONE undo step; outside the window (or
//     under a different key) each edit is its own step;
//   • HISTORY_LIMIT — the past stack truncates at 50 entries;
//   • removeSection — no-ops on the last remaining section;
//   • addSection / duplicateSection basics;
//   • undo/redo of setSections;
//   • the W3.8 appearance fields (color / tintScope) round-tripping
//     through an editSection patch WITHOUT disturbing sibling fields.

import { describe, expect, it, vi } from "vitest";

// planner-store imports the client facade, whose server-action module pulls
// the server-only Supabase source (next/headers). The reducer under test
// never touches persistence — stub the facade so the import chain stays
// node-safe. (The provider is the only runtime consumer of the real client.)
vi.mock("@/lib/planner/client", () => ({
  plannerClient: {},
}));

import {
  historyReducer,
  HISTORY_LIMIT,
  COALESCE_WINDOW_MS,
  type HistoryReducerState,
  type PlannerAction,
  type PlannerDoc,
} from "@/lib/planner-store";
import type { LessonSectionContent } from "@/lib/lesson-flow";
import type { Lesson, SubjectId } from "@/lib/types";

// ── Fixtures ─────────────────────────────────────────────────────────────

const LESSON_ID = "l1";

function sec(
  id: string,
  over: Partial<LessonSectionContent> = {},
): LessonSectionContent {
  return {
    id,
    templateSectionId: null,
    heading: `<b>${id}</b>`,
    prompt: "",
    body: "",
    resources: [],
    minutes: 10,
    status: "idle",
    ...over,
  };
}

function mkDoc(sections: LessonSectionContent[]): PlannerDoc {
  return {
    lessons: [],
    sections: { [LESSON_ID]: sections },
    cellLayouts: {},
  };
}

function mkState(doc: PlannerDoc): HistoryReducerState {
  return {
    history: { past: [], present: doc, future: [] },
    lastCoalesceKey: null,
    lastCoalesceTs: 0,
    lastChange: null,
    hydration: "ready",
    hydratedForOwner: null,
    catalog: { subjects: [], units: [], standards: {}, activeGradeId: null },
  };
}

function editBody(
  sectionId: string,
  body: string,
  key: string,
  ts: number,
): PlannerAction {
  return {
    type: "editSection",
    lessonId: LESSON_ID,
    sectionId,
    patch: { body },
    coalesceKey: key,
    coalesceTs: ts,
  };
}

function sectionsOf(state: HistoryReducerState): LessonSectionContent[] {
  return state.history.present.sections[LESSON_ID];
}

// ── Coalescing ───────────────────────────────────────────────────────────

describe("historyReducer coalescing", () => {
  const KEY = `section:${LESSON_ID}:s1:body`;

  it("collapses same-key edits inside the window into one history entry", () => {
    let state = mkState(mkDoc([sec("s1")]));
    state = historyReducer(state, editBody("s1", "a", KEY, 1_000));
    state = historyReducer(
      state,
      editBody("s1", "ab", KEY, 1_000 + COALESCE_WINDOW_MS),
    );
    expect(state.history.past).toHaveLength(1);
    expect(sectionsOf(state)[0].body).toBe("ab");
    // One undo returns to the PRE-burst doc, not the mid-burst one.
    const undone = historyReducer(state, { type: "undo" });
    expect(sectionsOf(undone)[0].body).toBe("");
  });

  it("starts a new entry when the window has elapsed", () => {
    let state = mkState(mkDoc([sec("s1")]));
    state = historyReducer(state, editBody("s1", "a", KEY, 1_000));
    state = historyReducer(
      state,
      editBody("s1", "ab", KEY, 1_000 + COALESCE_WINDOW_MS + 1),
    );
    expect(state.history.past).toHaveLength(2);
  });

  it("never coalesces across different keys", () => {
    let state = mkState(mkDoc([sec("s1"), sec("s2")]));
    state = historyReducer(
      state,
      editBody("s1", "a", `section:${LESSON_ID}:s1:body`, 1_000),
    );
    state = historyReducer(
      state,
      editBody("s2", "b", `section:${LESSON_ID}:s2:body`, 1_100),
    );
    expect(state.history.past).toHaveLength(2);
  });
});

// ── HISTORY_LIMIT ────────────────────────────────────────────────────────

describe("historyReducer history limit", () => {
  it("truncates the past stack at HISTORY_LIMIT entries", () => {
    let state = mkState(mkDoc([sec("s1")]));
    const total = HISTORY_LIMIT + 10;
    for (let i = 0; i < total; i++) {
      state = historyReducer(state, {
        type: "addSection",
        lessonId: LESSON_ID,
        heading: `extra-${i}`,
      });
    }
    expect(state.history.past).toHaveLength(HISTORY_LIMIT);
    expect(sectionsOf(state)).toHaveLength(1 + total);

    // Undoing everything available bottoms out at the truncation point —
    // the 10 oldest steps are gone, so 10 added sections survive.
    for (let i = 0; i < HISTORY_LIMIT; i++) {
      state = historyReducer(state, { type: "undo" });
    }
    expect(state.history.past).toHaveLength(0);
    expect(sectionsOf(state)).toHaveLength(1 + 10);
    // A further undo is a no-op.
    const again = historyReducer(state, { type: "undo" });
    expect(again).toBe(state);
  });
});

// ── removeSection guard ──────────────────────────────────────────────────

describe("removeSection", () => {
  it("no-ops on the last remaining section", () => {
    const only = sec("s1");
    let state = mkState(mkDoc([only]));
    state = historyReducer(state, {
      type: "removeSection",
      lessonId: LESSON_ID,
      sectionId: "s1",
    });
    expect(sectionsOf(state)).toHaveLength(1);
    expect(sectionsOf(state)[0]).toBe(only);
  });

  it("removes a section when others remain", () => {
    let state = mkState(mkDoc([sec("s1"), sec("s2")]));
    state = historyReducer(state, {
      type: "removeSection",
      lessonId: LESSON_ID,
      sectionId: "s1",
    });
    expect(sectionsOf(state).map((s) => s.id)).toEqual(["s2"]);
  });
});

// ── addSection / duplicateSection ────────────────────────────────────────

describe("addSection / duplicateSection", () => {
  it("appends a blank section with the given heading", () => {
    let state = mkState(mkDoc([sec("s1")]));
    state = historyReducer(state, {
      type: "addSection",
      lessonId: LESSON_ID,
      heading: "Closure",
    });
    const list = sectionsOf(state);
    expect(list).toHaveLength(2);
    expect(list[1].heading).toBe("Closure");
    expect(list[1].body).toBe("");
    expect(list[1].id).not.toBe("s1");
  });

  it("duplicates a section immediately after the original with fresh ids", () => {
    const original = sec("s1", {
      body: "<p>hi</p>",
      color: "--subj-10-bright",
      tintScope: "header",
      resources: [{ id: "r1", type: "link", label: "Slides" }],
    });
    let state = mkState(mkDoc([original, sec("s2")]));
    state = historyReducer(state, {
      type: "duplicateSection",
      lessonId: LESSON_ID,
      sectionId: "s1",
    });
    const list = sectionsOf(state);
    expect(list).toHaveLength(3);
    const copy = list[1];
    expect(copy.id).not.toBe("s1");
    // W3.8 gate fix: the duplicate carries a " copy" suffix (mock parity)
    // so two sections never share an identical accessible name.
    expect(copy.heading).toBe(`${original.heading} copy`);
    expect(copy.body).toBe(original.body);
    // W3.8 appearance rides through a duplicate.
    expect(copy.color).toBe("--subj-10-bright");
    expect(copy.tintScope).toBe("header");
    // Resources are copied with re-minted ids.
    expect(copy.resources).toHaveLength(1);
    expect(copy.resources[0].label).toBe("Slides");
    expect(copy.resources[0].id).not.toBe("r1");
    expect(list[2].id).toBe("s2");
  });
});

// ── undo/redo of setSections ─────────────────────────────────────────────

describe("setSections undo/redo", () => {
  it("round-trips a full-list replace through undo and redo", () => {
    const before = [sec("s1"), sec("s2")];
    const after = [sec("s3"), sec("s4"), sec("s5")];
    let state = mkState(mkDoc(before));
    state = historyReducer(state, {
      type: "setSections",
      lessonId: LESSON_ID,
      next: after,
    });
    expect(sectionsOf(state)).toBe(after);

    state = historyReducer(state, { type: "undo" });
    expect(sectionsOf(state)).toBe(before);
    expect(state.history.future).toHaveLength(1);

    state = historyReducer(state, { type: "redo" });
    expect(sectionsOf(state)).toBe(after);
    expect(state.history.future).toHaveLength(0);
  });
});

// ── W3.8 appearance patch round-trip ─────────────────────────────────────

describe("editSection color/tintScope patch", () => {
  it("applies the appearance patch and preserves every sibling field", () => {
    const original = sec("s1", {
      body: "<p>keep me</p>",
      minutes: 25,
      status: "progress",
      resources: [{ id: "r1", type: "link", label: "Slides" }],
    });
    let state = mkState(mkDoc([original]));
    state = historyReducer(state, {
      type: "editSection",
      lessonId: LESSON_ID,
      sectionId: "s1",
      patch: { color: "--subj-4-bright", tintScope: "header" },
      coalesceKey: `section:${LESSON_ID}:s1:appearance`,
      coalesceTs: 1_000,
    });
    const next = sectionsOf(state)[0];
    expect(next.color).toBe("--subj-4-bright");
    expect(next.tintScope).toBe("header");
    // Patch only what changed — the /daily LessonFlow fields survive.
    expect(next.heading).toBe(original.heading);
    expect(next.body).toBe("<p>keep me</p>");
    expect(next.minutes).toBe(25);
    expect(next.status).toBe("progress");
    expect(next.resources).toBe(original.resources);

    // Undo reverts to no stored appearance; redo re-applies it.
    state = historyReducer(state, { type: "undo" });
    expect(sectionsOf(state)[0].color).toBeUndefined();
    state = historyReducer(state, { type: "redo" });
    expect(sectionsOf(state)[0].color).toBe("--subj-4-bright");
    expect(sectionsOf(state)[0].tintScope).toBe("header");
  });
});

// ── moveLesson (W3.8c cross-period re-time) ──────────────────────────────
// The reducer drives the Week edit board's drag: day/subject/week are PLACEMENT
// (they set `moved`); `time` is a CONTENT relabel that mirrors editLesson —
// applied verbatim, never touching `moved` or `modified`.

const MLESSON_ID = "m1";

function mkLesson(over: Partial<Lesson> = {}): Lesson {
  return {
    id: MLESSON_ID,
    subject: "math" as SubjectId,
    time: "8:00–8:45",
    unit: "u1",
    title: "Fractions",
    objective: "",
    preview: "",
    directions: "",
    notes: "",
    resources: [],
    standards: [],
    week: 11,
    day: 0,
    isPersonal: false,
    pendingMaster: false,
    reasonNotDone: "",
    modified: false,
    moved: null,
    status: "not_done",
    commentCount: 0,
    unreadComments: 0,
    tasks: [],
    ...over,
  };
}

function mkLessonState(lesson: Lesson): HistoryReducerState {
  return mkState({ lessons: [lesson], sections: {}, cellLayouts: {} });
}

function movedLesson(state: HistoryReducerState): Lesson {
  return state.history.present.lessons[0];
}

function move(patch: {
  day?: number;
  subject?: SubjectId;
  week?: number;
  time?: string;
}): PlannerAction {
  return { type: "moveLesson", id: MLESSON_ID, patch };
}

describe("moveLesson", () => {
  it("cross-day move is one history entry; undo restores the original day", () => {
    let state = mkLessonState(mkLesson({ day: 0 }));
    state = historyReducer(state, move({ day: 3 }));
    expect(state.history.past).toHaveLength(1);
    expect(movedLesson(state).day).toBe(3);
    expect(movedLesson(state).moved).toBe("same-week");

    state = historyReducer(state, { type: "undo" });
    expect(movedLesson(state).day).toBe(0);
    expect(movedLesson(state).moved).toBeNull();
  });

  it("a day+time patch is one entry; undo restores BOTH", () => {
    let state = mkLessonState(mkLesson({ day: 0, time: "8:00–8:45" }));
    state = historyReducer(state, move({ day: 2, time: "10:00–10:45" }));
    expect(state.history.past).toHaveLength(1);
    expect(movedLesson(state).day).toBe(2);
    expect(movedLesson(state).time).toBe("10:00–10:45");
    // The day change (placement) DID set moved even though time rode along.
    expect(movedLesson(state).moved).toBe("same-week");

    state = historyReducer(state, { type: "undo" });
    expect(movedLesson(state).day).toBe(0);
    expect(movedLesson(state).time).toBe("8:00–8:45");
    expect(movedLesson(state).moved).toBeNull();
  });

  it("a time-only patch does NOT set moved; day sets same-week; week sets across-weeks", () => {
    // time-only → placement unchanged → moved stays null (a content relabel).
    let timeOnly = mkLessonState(mkLesson({ moved: null }));
    timeOnly = historyReducer(timeOnly, move({ time: "9:00–9:45" }));
    expect(movedLesson(timeOnly).time).toBe("9:00–9:45");
    expect(movedLesson(timeOnly).moved).toBeNull();

    // day change → same-week.
    let dayMove = mkLessonState(mkLesson({ day: 0, week: 11 }));
    dayMove = historyReducer(dayMove, move({ day: 4 }));
    expect(movedLesson(dayMove).moved).toBe("same-week");

    // week change → across-weeks.
    let weekMove = mkLessonState(mkLesson({ week: 11 }));
    weekMove = historyReducer(weekMove, move({ week: 12 }));
    expect(movedLesson(weekMove).moved).toBe("across-weeks");
  });

  it("a same-slot patch keeps the prior moved value even with time present", () => {
    // Lesson already carries moved="across-weeks" from an earlier move; a patch
    // whose day/subject/week resolve to the SAME slot (only time differs) must
    // preserve that value, not reset it.
    let state = mkLessonState(
      mkLesson({ day: 1, week: 11, subject: "math" as SubjectId, moved: "across-weeks" }),
    );
    state = historyReducer(
      state,
      move({ day: 1, week: 11, subject: "math", time: "11:00–11:45" }),
    );
    expect(movedLesson(state).time).toBe("11:00–11:45");
    expect(movedLesson(state).moved).toBe("across-weeks");
  });

  it("mirrors editLesson's flag behavior: time applies verbatim, modified untouched", () => {
    // editLesson spreads its patch WITHOUT setting `modified`; a moveLesson
    // time relabel must do the same — apply the field, leave `modified` as-is.
    const baseline = mkLesson({ modified: false, time: "8:00–8:45" });

    // editLesson reference: patch a content field, modified stays false.
    let viaEdit = mkLessonState(baseline);
    viaEdit = historyReducer(viaEdit, {
      type: "editLesson",
      id: MLESSON_ID,
      patch: { time: "1:00–1:45" },
      coalesceKey: `lesson:${MLESSON_ID}:time`,
      coalesceTs: 1_000,
    });
    expect(movedLesson(viaEdit).time).toBe("1:00–1:45");
    expect(movedLesson(viaEdit).modified).toBe(false);

    // moveLesson time relabel: identical flag outcome.
    let viaMove = mkLessonState(baseline);
    viaMove = historyReducer(viaMove, move({ time: "1:00–1:45" }));
    expect(movedLesson(viaMove).time).toBe("1:00–1:45");
    expect(movedLesson(viaMove).modified).toBe(false);
    expect(movedLesson(viaMove).moved).toBeNull();
  });
});
