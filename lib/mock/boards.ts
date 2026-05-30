// Mock fixture: teaching boards + widgets for a couple of the active mock
// lessons (built in the lib/mock/lessons.ts `L()` style with small `B()`/`W()`
// builders that apply defaults). These seed the in-memory `TeachDataSource`
// (lib/teach/mock-source.ts) so the Teach surface renders against realistic
// data before the Supabase backend lands.
//
// Default phase set (plan §4.1): Warm-Up · Mini Lesson · Guided Practice ·
// Centers · Exit Ticket. The seeded widget mix mirrors the prototype (T1/T10):
// Warm-Up carries objective/timer/groups/model/agenda/notes/manipulatives;
// Mini Lesson carries slides/model/youtube/names/poll.
//
// PRIVACY (plan §11.4): NO real student names appear here. Name-bearing widgets
// (groups, names) seed STRUCTURE only — group/slot counts and INITIALS — never
// full names. Real rosters live solely in the USER-scoped local store on the
// teacher's own machine and never touch this fixture or the DB.

import type {
  Board,
  BoardScope,
  Widget,
  WidgetGridPosition,
  WidgetPersistence,
  WidgetType,
} from "../types";

/** The Grade 5 grade-level id every Teach fixture entity is scoped to. The app
 *  launches Grade 5-only but the shape never assumes a single grade. */
export const MOCK_GRADE_LEVEL_ID = "g5";

/** Default board phase titles, in their pill-strip order. */
export const DEFAULT_BOARD_TITLES: readonly string[] = [
  "Warm-Up",
  "Mini Lesson",
  "Guided Practice",
  "Centers",
  "Exit Ticket",
] as const;

let widgetSeq = 0;

/** Raw shape accepted by the `W()` widget builder before defaults applied. */
interface WidgetInput {
  type: WidgetType;
  title: string;
  /** Grid anchor; span defaults to a single cell. */
  col: number;
  row: number;
  colSpan?: number;
  rowSpan?: number;
  pinned?: boolean;
  config?: Record<string, unknown>;
  state?: Record<string, unknown>;
  persistence?: WidgetPersistence;
}

/** Normalize a widget input into a fully-typed Widget. `boardId` + grade are
 *  injected by `B()` so the call sites stay terse. */
function W(o: WidgetInput): Omit<Widget, "boardId" | "gradeLevelId"> {
  widgetSeq += 1;
  const position: WidgetGridPosition = {
    col: o.col,
    row: o.row,
    colSpan: o.colSpan ?? 1,
    rowSpan: o.rowSpan ?? 1,
  };
  return {
    id: `w-${widgetSeq}`,
    type: o.type,
    title: o.title,
    position,
    displayOrder: widgetSeq,
    pinned: !!o.pinned,
    config: o.config ?? {},
    state: o.state ?? {},
    persistence: o.persistence ?? "inherit",
  };
}

let boardSeq = 0;

/** Raw shape accepted by the `B()` board builder. */
interface BoardInput {
  masterLessonId: string;
  title: string;
  order: number;
  scope?: BoardScope;
  ownerId?: string | null;
  templateId?: string | null;
  widgets?: Omit<Widget, "boardId" | "gradeLevelId">[];
}

const SEED_AT = "2026-05-29T08:00:00.000Z";

/** Normalize a board input into a fully-typed Board, stamping board id + grade
 *  onto every widget. */
function B(o: BoardInput): Board {
  boardSeq += 1;
  const id = `b-${boardSeq}`;
  const widgets: Widget[] = (o.widgets ?? []).map((w) => ({
    ...w,
    boardId: id,
    gradeLevelId: MOCK_GRADE_LEVEL_ID,
  }));
  return {
    id,
    masterLessonId: o.masterLessonId,
    ownerId: o.ownerId ?? null,
    scope: o.scope ?? "team",
    title: o.title,
    displayOrderWithinLesson: o.order,
    templateId: o.templateId ?? null,
    widgets,
    gradeLevelId: MOCK_GRADE_LEVEL_ID,
    createdAt: SEED_AT,
    updatedAt: SEED_AT,
  };
}

/** Build the default five-phase board set for a lesson, with the Warm-Up and
 *  Mini Lesson phases pre-populated and the rest left empty (the teacher fills
 *  them via the widget picker — T9 empty state). */
function defaultBoardSet(masterLessonId: string): Board[] {
  return [
    B({
      masterLessonId,
      title: "Warm-Up",
      order: 0,
      // 2x3 mix matching the prototype's Warm-Up artboard (T1).
      widgets: [
        W({ type: "objective", title: "Today's Objective", col: 0, row: 0 }),
        W({ type: "timer", title: "Warm-Up Timer", col: 1, row: 0 }),
        W({
          type: "groups",
          title: "Table Groups",
          col: 2,
          row: 0,
          // Structure only — group + slot counts, never names (§11.4).
          config: { groupCount: 4, slotsPerGroup: 5 },
        }),
        W({ type: "model", title: "Model It", col: 0, row: 1 }),
        W({ type: "agenda", title: "Agenda", col: 1, row: 1 }),
        W({ type: "notes", title: "Quick Notes", col: 2, row: 1 }),
        W({
          type: "manipulatives",
          title: "Fraction Strips",
          col: 0,
          row: 2,
          colSpan: 3,
        }),
      ],
    }),
    B({
      masterLessonId,
      title: "Mini Lesson",
      order: 1,
      // Mini Lesson flip (T10): slides-led with supporting widgets.
      widgets: [
        W({
          type: "slides",
          title: "Lesson Slides",
          col: 0,
          row: 0,
          colSpan: 2,
          rowSpan: 2,
        }),
        W({ type: "model", title: "Worked Example", col: 2, row: 0 }),
        W({ type: "youtube", title: "Concept Clip", col: 2, row: 1 }),
        W({
          type: "names",
          title: "Cold Call",
          col: 0,
          row: 2,
          // INITIALS only as placeholder slot labels — never full names (§11.4).
          config: { slotCount: 6, slotLabels: ["AB", "CD", "EF"] },
        }),
        W({ type: "poll", title: "Quick Check", col: 1, row: 2 }),
      ],
    }),
    // Guided Practice → live classroom-management tools (Phase 3 library),
    // shown on a soft pattern background so the background feature is visible.
    {
      ...B({
        masterLessonId,
        title: "Guided Practice",
        order: 2,
        widgets: [
          W({ type: "timer", title: "Work Time", col: 0, row: 0 }),
          W({
            type: "traffic",
            title: "Noise Level",
            col: 1,
            row: 0,
            config: { active: "green" },
          }),
          W({
            type: "work_symbols",
            title: "Work Mode",
            col: 2,
            row: 0,
            config: { mode: "partner" },
          }),
          W({
            type: "soundlevel",
            title: "Sound Meter",
            col: 0,
            row: 1,
          }),
          W({
            type: "scoreboard",
            title: "Team Points",
            col: 1,
            row: 1,
            colSpan: 2,
          }),
        ],
      }),
      background: "pattern-3",
    },
    // Centers → engagement tools on a gentle gradient.
    {
      ...B({
        masterLessonId,
        title: "Centers",
        order: 3,
        widgets: [
          W({
            type: "dice",
            title: "Roll to Move",
            col: 0,
            row: 0,
            config: { count: 2 },
          }),
          W({
            type: "stopwatch",
            title: "Rotation Timer",
            col: 1,
            row: 0,
          }),
          W({
            type: "names",
            title: "Pick a Helper",
            col: 2,
            row: 0,
            config: { slotCount: 6 },
          }),
          W({
            type: "text",
            title: "Center Instructions",
            col: 0,
            row: 1,
            colSpan: 3,
            config: {
              text: "Read pages 24–26, then answer in your journal.",
              size: "l",
            },
          }),
        ],
      }),
      background: "gradient-3",
    },
    // Exit Ticket → quick check + countdown to the bell.
    B({
      masterLessonId,
      title: "Exit Ticket",
      order: 4,
      widgets: [
        W({
          type: "poll",
          title: "How do you feel?",
          col: 0,
          row: 0,
          config: {
            kind: "smiley",
            question: "How well did you understand today?",
          },
        }),
        W({
          type: "countdown",
          title: "Until the Bell",
          col: 1,
          row: 0,
          config: { label: "Pack up" },
        }),
      ],
    }),
  ];
}

/** Seed boards keyed by master lesson id. Two active week-12 lessons get the
 *  full populated set; every other lesson falls back to a freshly-built default
 *  set on first access (mock-source.ts). */
export const BOARDS: Board[] = [
  ...defaultBoardSet("m-12-0"),
  ...defaultBoardSet("r-12-0"),
];

/** Build a fresh default board set for a lesson that has no seeded boards yet.
 *  Exposed so the mock source can lazily materialize a set when a teacher opens
 *  Teach on an un-seeded lesson. */
export function buildDefaultBoardSet(masterLessonId: string): Board[] {
  return defaultBoardSet(masterLessonId);
}
