// Mock fixture: a three-week lesson set (weeks 11–13) for the Grade 5
// curriculum planner. Week 12 is ported verbatim from the design handoff
// (project/data.jsx); weeks 11 and 13 extend it so the weekly grid can be
// paged across a realistic span. The set covers every lesson state:
// unedited, modified, moved (same-week / across-weeks), done, carried,
// pending-master, personal, multi-task, and lessons with comments.

import type {
  Lesson,
  LessonMasterSnapshot,
  LessonResource,
  LessonStatus,
  LessonMoved,
  LessonTask,
  SubjectId,
} from "../types";
import { UNITS } from "./units";

/** The current week — weeks 11 and 13 bracket it. */
export const CURRENT_WEEK = 12;

/** Raw shape accepted by the `L()` builder before defaults are applied. */
interface LessonInput {
  id: string;
  subject: SubjectId;
  title: string;
  day: number;
  week?: number;
  /**
   * Unit id this lesson belongs to. The Year roadmap groups lessons by this
   * field to draw one band per unit (see RoadmapView.tsx). When omitted the
   * builder falls back to the subject's single "active" unit from
   * UNITS[subject] so the original weeks-11–13 rows keep their prior
   * behavior; the full-year tiling rows below pass an explicit per-unit id.
   */
  unit?: string;
  objective?: string;
  preview: string;
  directions?: string;
  notes?: string;
  resources?: LessonResource[];
  standards?: string[];
  isPersonal?: boolean;
  pendingMaster?: boolean;
  reasonNotDone?: string;
  modified?: boolean;
  moved?: LessonMoved;
  status?: LessonStatus;
  commentCount?: number;
  unreadComments?: number;
  tasks?: Partial<LessonTask>[];
  /**
   * PROTOTYPE seam (UX roadmap item 01 — fork diff view): the pre-fork
   * Master values this personally-forked lesson diverged from. Carried by a
   * handful of fixtures below so the diff UI can be designed and exercised
   * against mock data; Phase 1B replaces this with persisted fork lineage
   * from Supabase. Additive + optional — every other consumer is untouched.
   */
  masterSnapshot?: LessonMasterSnapshot;
}

/** Normalize a lesson input into a fully-typed Lesson with defaults. */
function L(o: LessonInput): Lesson {
  return {
    id: o.id,
    subject: o.subject,
    unit: o.unit ?? UNITS[o.subject].id,
    title: o.title,
    objective: o.objective ?? "",
    preview: o.preview,
    directions: o.directions ?? o.preview,
    notes: o.notes ?? "",
    resources: o.resources ?? [],
    standards: o.standards ?? [],
    week: o.week ?? CURRENT_WEEK,
    day: o.day,
    isPersonal: !!o.isPersonal,
    pendingMaster: !!o.pendingMaster,
    reasonNotDone: o.reasonNotDone ?? "",
    modified: !!o.modified,
    moved: o.moved ?? null,
    status: o.status ?? "not_done",
    commentCount: o.commentCount ?? 0,
    unreadComments: o.unreadComments ?? 0,
    tasks: (o.tasks ?? []).map((t) => ({
      id: t.id ?? "",
      title: t.title ?? "",
      status: t.status ?? "not_done",
      resources: t.resources ?? [],
      standards: t.standards ?? [],
      isPersonal: !!t.isPersonal,
      subjectHint: t.subjectHint ?? null,
    })),
    // Only present on the few fork-diff prototype fixtures; spread-omitted
    // (rather than `undefined`-assigned) so JSON round-trips stay clean.
    ...(o.masterSnapshot ? { masterSnapshot: o.masterSnapshot } : {}),
  };
}

export const LESSONS: Lesson[] = [
  // ── WEEK 11 (last week — mostly done / carried) ───────────────────────
  L({
    id: "m-11-1",
    subject: "math",
    week: 11,
    day: 1,
    title: "Equivalent fractions — area models",
    objective: "I can generate equivalent fractions with area models.",
    preview:
      "Fold-and-shade activity building equivalent fractions, then a gallery walk comparing strategies.",
    resources: [
      {
        type: "slides",
        label: "Area model deck",
        url: "https://docs.google.com/presentation/d/1eu3J4tLkTpW2gC2DLrNgVH71Hjt7sHM9Ie4yWNL2u0Y/edit",
        provider: "gslides",
      },
    ],
    standards: ["5.NF.A.1"],
    status: "done",
  }),
  L({
    id: "r-11-2",
    subject: "reading",
    week: 11,
    day: 2,
    title: "Wonder, chs 10–13 — character study",
    objective: "I can compare two characters using text evidence.",
    preview:
      "Compare August and Jack across three scenes; chart what each notices and fears.",
    resources: [{ type: "doc", label: "Character chart" }],
    standards: ["RL.5.3"],
    status: "done",
  }),
  L({
    id: "w-11-3",
    subject: "writing",
    week: 11,
    day: 3,
    title: "Narrative planning — story arc",
    objective: "I can plan a personal narrative on a story-arc map.",
    preview:
      "Students map their chosen memory onto a five-point arc before drafting next week.",
    resources: [
      {
        type: "pdf",
        label: "Story arc map",
        url: "https://drive.google.com/file/d/1n-jB_yJ8sZ4uV4dVL9z6KZpL_2H8KdH8X/view",
        provider: "gdrive",
      },
    ],
    standards: ["W.5.3"],
    status: "carried",
    reasonNotDone:
      "Assembly ran long — half the class still needs to finish the arc map.",
  }),
  L({
    id: "g-11-1",
    subject: "grammar",
    week: 11,
    day: 1,
    title: "Verb tense — diagnostic",
    objective: "I can show what I already know about verb tense.",
    preview:
      "Short diagnostic to baseline the unit; results group students for the week.",
    standards: ["L.5.1.C"],
    status: "done",
  }),
  L({
    id: "uf-11-4",
    subject: "ufli",
    week: 11,
    day: 4,
    title: "Lesson 83 — review & probe",
    objective: "I can demonstrate decoding growth on the weekly probe.",
    preview:
      "Cumulative review of closed and r-controlled syllables, then a one-page probe.",
    standards: ["RF.5.3"],
    status: "done",
  }),

  // ── WEEK 12 (current week — Sun–Thu) ──────────────────────────────────
  // Math
  L({
    id: "m-12-0",
    subject: "math",
    day: 0,
    title: "Equivalent fractions warm-up",
    objective: "I can find three equivalent fractions for a given fraction.",
    preview:
      "Number-talk routine: pairs find three equivalent fractions for 3/4, share strategies, then class consolidates the visual model on the board.",
    // NOTE (finding #20): teacher notes in SHARED fixtures must never carry
    // student-identifying content (CLAUDE.md §11.4) — the original copy named a
    // class roster; scrubbed to a non-personal pedagogical hint.
    notes:
      "If they struggle, fall back to the strip diagrams from Lesson 22. If a prior section skipped this, extend by 5min.",
    // Resources seeded per spec §7 / §4.2 — this lesson is the default Teach
    // board target, so its set is deliberately RICH and varied: every Teach
    // center-canvas render branch is represented with a real, embeddable URL
    // (YouTube video, Google Slides, hosted image, hosted PDF) plus one plain
    // web link that exercises the "can't display → open in new tab" fallback.
    // The first four populate the 2×2 thumbnail grid in Section 1; the rest
    // flow into the "More resources" sub-list.
    resources: [
      {
        type: "youtube",
        label: "Fraction Basics",
        url: "https://www.youtube.com/watch?v=8E5K2dnyFOY",
        provider: "youtube",
        thumbnailUrl: "https://img.youtube.com/vi/8E5K2dnyFOY/hqdefault.jpg",
      }, // Card 1 — YouTube video embed branch
      {
        type: "slides",
        label: "Equivalent Fractions Deck",
        url: "https://docs.google.com/presentation/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcd/edit",
        provider: "gslides",
      }, // Card 2 — Google Slides embed branch
      {
        type: "image",
        label: "Fraction Wall Diagram",
        url: "https://upload.wikimedia.org/wikipedia/commons/4/45/Equivalent_fractions.svg",
        provider: "image",
        thumbnailUrl:
          "https://upload.wikimedia.org/wikipedia/commons/4/45/Equivalent_fractions.svg",
      }, // Card 3 — image branch
      {
        type: "pdf",
        label: "Fraction Wall Poster",
        url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        provider: "pdf",
      }, // Card 4 — PDF iframe branch
      {
        type: "link",
        label: "Khan Academy — Equivalent Fractions",
        url: "https://www.khanacademy.org/math/arithmetic/fraction-arithmetic",
        provider: "website",
      }, // More — generic link (open-in-new-tab fallback)
      { type: "doc", label: "Anchor Chart Template" }, // More — placeholder (no URL)
      { type: "pdf", label: "Fraction Examples Sheet" }, // More — placeholder (no URL)
    ],
    standards: ["5.NF.B.3", "5.NF.A.1"],
  }),
  L({
    id: "m-12-1",
    subject: "math",
    modified: true,
    commentCount: 2,
    unreadComments: 1,
    day: 1,
    title: "Fractions as division — bake sale problem",
    objective: "I can interpret a fraction as division and model it two ways.",
    preview:
      "Anchor problem: 5 cookies shared by 4 friends. Students use bar models then long division to connect the two representations.",
    directions:
      "Open with the bake-sale anchor on slide 3. Give pairs 10 min to model. Pull two contrasting samples for the whole-class discussion. Closing exit ticket: one new problem of their own.",
    // NOTE (finding #20): scrubbed student names from this shared fixture.
    notes:
      "Pull aside the small group still on the array model for a quick reteach.",
    resources: [
      { type: "slides", label: "Lesson 23 deck" },
      { type: "doc", label: "Exit ticket" },
      {
        type: "youtube",
        label: "Bar models (4min)",
        url: "https://vimeo.com/76979871",
        provider: "vimeo",
      },
    ],
    standards: ["5.NF.B.3"],
    // Fork-diff prototype fixture (roadmap item 01) — MODIFIED-only tier:
    // the teacher rewrote the anchor problem (title/objective/preview) but
    // never moved the lesson, so the diff shows content rows and NO
    // scheduling row. day/week mirror the live values.
    masterSnapshot: {
      title: "Fractions as division — sharing problems",
      objective: "I can interpret a fraction as division of the numerator.",
      preview:
        "Anchor problem: 3 sandwiches shared by 4 students. Students use bar models to connect fractions and division.",
      standards: ["5.NF.B.3"],
      day: 1,
      week: 12,
    },
  }),
  // Same subject, same day, second event — math centers extension
  L({
    id: "m-12-1b",
    subject: "math",
    day: 1,
    title: "Math centers (last 20 min)",
    objective:
      "I can fluently practice math facts and fractions at three stations.",
    preview:
      "Three-station rotation while the rest of the class finishes the bake-sale work. Fact fluency · fraction tiles · word problems.",
    directions:
      "Rotation chart on the back wall. Each station is 6 minutes. I sit at fluency to catch the bottom three.",
    resources: [
      { type: "pdf", label: "Station task cards" },
      { type: "image", label: "Rotation chart" },
    ],
    standards: [],
    tasks: [
      {
        id: "m-ctr-fluency",
        title: "Fact fluency sprint",
        status: "not_done",
        resources: [{ type: "pdf", label: "Fluency probe" }],
        standards: [],
      },
      {
        id: "m-ctr-tiles",
        title: "Fraction tiles — build & justify",
        status: "not_done",
        resources: [{ type: "image", label: "Tile mat" }],
        standards: ["5.NF.B.3"],
      },
      {
        id: "m-ctr-words",
        title: "Word-problem station",
        status: "not_done",
        resources: [{ type: "doc", label: "4-up problem set" }],
        standards: ["5.NF.B.4"],
      },
    ],
  }),
  L({
    id: "m-12-2",
    subject: "math",
    day: 2,
    title: "Multiplying a fraction by a whole number",
    objective:
      "I can multiply a fraction by a whole number using a model and equation.",
    preview:
      "Concrete-pictorial-abstract sequence. Start with fraction tiles, move to area models, end with the algorithm.",
    resources: [
      { type: "slides", label: "CPA sequence" },
      { type: "pdf", label: "Practice set B" },
    ],
    standards: ["5.NF.B.4"],
    status: "done",
  }),
  L({
    id: "m-12-3",
    subject: "math",
    moved: "same-week",
    day: 3,
    title: "Mid-unit check — fractions",
    objective:
      "I can show what I know about equivalence, division, and multiplication of fractions.",
    preview:
      "Independent 20-minute check covering equivalence, fractions as division, and multiplication of a fraction by a whole number.",
    resources: [{ type: "pdf", label: "Mid-unit check" }],
    standards: ["5.NF.B.3", "5.NF.B.4"],
    pendingMaster: true,
  }),
  L({
    id: "m-12-4",
    subject: "math",
    day: 4,
    title: "Re-engagement: error analysis",
    objective: "I can identify and repair errors in fraction work.",
    preview:
      "Look at three flawed student solutions on equivalent fractions. Identify the misconception, repair the work, then write a one-sentence rule.",
    resources: [{ type: "slides", label: "Three flawed solutions" }],
    standards: ["5.NF.A.1"],
  }),

  // Reading
  L({
    id: "r-12-0",
    subject: "reading",
    day: 0,
    title: "Wonder, chs 14–17 — point of view",
    objective:
      "I can describe how a narrator's point of view influences events.",
    preview:
      "First-person narrator shift from August to Via. Students annotate three places the same event is reframed.",
    // NOTE (finding #20): scrubbed student names from this shared fixture.
    notes:
      "Pair anyone who was absent for ch 13 with a partner who has read it.",
    resources: [
      {
        type: "doc",
        label: "Annotation sheet",
        url: "https://docs.google.com/document/d/1mGJ_yJ8sZ4uV4dVL9z6KZpL_2H8KdH8XzNgN6Hpx0fM/edit",
        provider: "gdocs",
      },
      { type: "website", label: "Lit-circle prompts" },
    ],
    standards: ["RL.5.6", "RL.5.3"],
  }),
  L({
    id: "r-12-1",
    subject: "reading",
    modified: true,
    moved: "same-week",
    commentCount: 1,
    day: 1,
    title: "Book club — Via's chapters",
    objective: "I can take a role in book club and contribute to discussion.",
    preview:
      "Pre-assigned literature circle roles: discussion leader, connector, vocabulary detective, summarizer. 18-minute discussion, 4-minute share.",
    resources: [{ type: "doc", label: "Role cards" }],
    standards: ["RL.5.3"],
    isPersonal: true,
    // Fork-diff prototype fixture (roadmap item 01) — BOTH tiers: content
    // edits (title/objective/preview/standards) AND a same-week move
    // (Sunday → Monday under the configured Sun-first week), so the diff
    // shows content rows plus the scheduling row.
    masterSnapshot: {
      title: "Literature circles — Via's chapters",
      objective:
        "I can take a role in literature circles and contribute to discussion.",
      preview:
        "Pre-assigned literature circle roles: discussion leader, connector, vocabulary detective, summarizer. 15-minute discussion, 5-minute share.",
      standards: ["RL.5.3", "RL.5.6"],
      day: 0,
      week: 12,
    },
  }),
  // Literacy Centers — the multi-task example. One lesson, three rotating
  // stations, each its own task with resources and a sub-subject hint.
  L({
    id: "r-12-litcenters",
    subject: "reading",
    day: 2,
    title: "Literacy Centers (90 min)",
    objective:
      "I can rotate through three literacy stations and complete each task.",
    preview:
      "Three-station rotation: reading comprehension · grammar dictation · narrative writing. 25 min per station with 5-min transitions.",
    directions:
      "Bell rings at 9:35 — Group A starts at reading, B at grammar, C at writing. Rotate at the chime. I conference at the writing station throughout.",
    // NOTE (finding #20): scrubbed a named student's group from this shared
    // fixture; kept the non-personal logistics.
    notes:
      "Print rotation chart for the back wall. Start the group that needs the longest at the writing station.",
    resources: [
      { type: "image", label: "Rotation chart" },
      { type: "doc", label: "Conferring tracker" },
    ],
    standards: ["RL.5.3", "L.5.1.D", "W.5.3"],
    tasks: [
      {
        id: "litc-read",
        subjectHint: "reading",
        title: "Reading station — Wonder, ch 18–20",
        status: "not_done",
        resources: [
          { type: "pdf", label: "Comprehension prompts" },
          { type: "doc", label: "Annotation sheet" },
        ],
        standards: ["RL.5.3"],
      },
      {
        id: "litc-gram",
        subjectHint: "grammar",
        title: "Grammar station — verb-tense dictation",
        status: "not_done",
        resources: [
          { type: "pdf", label: "Dictation passage" },
          { type: "youtube", label: "Verb tense (3min)" },
        ],
        standards: ["L.5.1.D"],
      },
      {
        id: "litc-writ",
        subjectHint: "writing",
        title: "Writing station — narrative drafting",
        status: "not_done",
        resources: [
          { type: "slides", label: "Show vs tell cues" },
          { type: "doc", label: "Drafting paper" },
        ],
        standards: ["W.5.3", "W.5.3.B"],
        isPersonal: true,
      },
    ],
  }),
  L({
    id: "r-12-2",
    subject: "reading",
    day: 2,
    title: "Inference workshop",
    objective:
      "I can make text-based inferences using evidence and prior knowledge.",
    preview:
      "Mini-lesson on inference using a short Eve Bunting passage, then partners apply to Wonder chs 18–20.",
    resources: [{ type: "slides", label: "Inference mini" }],
    standards: ["RL.5.3"],
  }),
  // Second reading event same day — small-group strategy
  L({
    id: "r-12-2b",
    subject: "reading",
    day: 2,
    title: "Small-group strategy — fluency",
    objective: "I can re-read for fluency and track my words-per-minute.",
    preview:
      "Pull three readers to the back table while the rest do partner reading. Cold-read passage, two re-reads, charted WPM.",
    resources: [
      { type: "pdf", label: "Cold-read passage" },
      { type: "doc", label: "WPM tracking form" },
    ],
    standards: ["RF.5.4"],
  }),
  L({
    id: "r-12-3",
    subject: "reading",
    day: 3,
    title: "Theme mapping",
    objective: "I can identify a theme of a story from details in the text.",
    preview:
      "Build a class theme map. Each student adds one piece of evidence from chapters 1–20 supporting kindness as a theme.",
    resources: [{ type: "slides", label: "Theme map template" }],
    standards: ["RL.5.2"],
  }),
  L({
    id: "r-12-4",
    subject: "reading",
    day: 4,
    title: "Independent reading + conferences",
    objective: "I can read independently and set one fluency goal.",
    preview:
      "20-min sustained silent reading; teacher conferences with 4 students rotating through fluency, comprehension, and goal-setting.",
    standards: ["RL.5.2"],
  }),

  // Writing
  L({
    id: "w-12-0",
    subject: "writing",
    day: 0,
    title: "Lead sentences — three rewrites",
    objective:
      "I can write three different effective leads for the same story.",
    preview:
      "Students rewrite the same opening three ways: with dialogue, with sensory detail, with a question. Share-out and class vote on strongest.",
    resources: [{ type: "slides", label: "Mentor leads" }],
    standards: ["W.5.3", "W.5.3.B"],
  }),
  L({
    id: "w-12-1",
    subject: "writing",
    moved: "across-weeks",
    day: 2,
    title: "Drafting day — narrative middle",
    objective: "I can draft the rising action of my personal narrative.",
    preview:
      "30-minute sustained drafting block on the rising action of their personal narrative. Quiet writing, music optional.",
    standards: ["W.5.3"],
    status: "carried",
    reasonNotDone:
      "Fire drill ate 15 min — pushed drafting to Wed. Half the class hadn't even finished the warm-up.",
    // Fork-diff prototype fixture (roadmap item 01) — MOVED-only tier
    // (across weeks): content fields match the master exactly, so the diff
    // shows JUST the scheduling row (Week 11 Thursday → Week 12 Tuesday).
    masterSnapshot: {
      title: "Drafting day — narrative middle",
      objective: "I can draft the rising action of my personal narrative.",
      preview:
        "30-minute sustained drafting block on the rising action of their personal narrative. Quiet writing, music optional.",
      standards: ["W.5.3"],
      day: 4,
      week: 11,
    },
  }),
  L({
    id: "w-12-2",
    subject: "writing",
    modified: true,
    commentCount: 4,
    day: 3,
    title: "Peer feedback — show vs tell",
    objective: "I can give and receive show-vs-tell feedback from a partner.",
    preview:
      "Partner conferences focused on one paragraph: highlight what's telling, suggest one place to show. Use the show/tell cue cards.",
    resources: [{ type: "pdf", label: "Show/tell cue cards" }],
    standards: ["W.5.3.B"],
    isPersonal: true,
  }),

  // Grammar
  L({
    id: "g-12-0",
    subject: "grammar",
    day: 0,
    title: "Past, present, future review",
    objective:
      "I can sort sentences by verb tense and spot inconsistent shifts.",
    preview:
      "Sort 18 sample sentences into three columns by verb tense. Identify three sentences with shifts.",
    resources: [{ type: "pdf", label: "Sort sheet" }],
    standards: ["L.5.1.C"],
  }),
  L({
    id: "g-12-1",
    subject: "grammar",
    moved: "same-week",
    day: 2,
    title: "Inappropriate shifts in tense",
    objective: "I can edit a paragraph to fix inappropriate shifts in tense.",
    preview:
      "Edit a one-paragraph narrative that drifts between tenses. Highlight every verb, then rewrite consistently in past.",
    resources: [{ type: "doc", label: "Editing paragraph" }],
    standards: ["L.5.1.D"],
  }),
  L({
    id: "g-12-2",
    subject: "grammar",
    day: 4,
    title: "Quick check — verb tense",
    objective: "I can apply verb-tense rules in a short assessment.",
    preview:
      "10-question multiple-choice and 3 short-answer rewrites. Goes home as a study tool.",
    standards: ["L.5.1.C", "L.5.1.D"],
  }),

  // Spelling
  L({
    id: "s-12-0",
    subject: "spelling",
    day: 0,
    title: "List 12 introduction — Greek roots",
    objective: "I can identify Greek roots and build new words from them.",
    preview:
      "Introduce -graph, -phone, -scope, -meter. Build five words from each root with the class. Send list home.",
    resources: [{ type: "pdf", label: "List 12" }],
    standards: ["L.5.2.E"],
  }),
  L({
    id: "s-12-1",
    subject: "spelling",
    day: 2,
    title: "Word sort + sentence frames",
    objective:
      "I can sort spelling words by root and use two roots in a sentence.",
    preview:
      "Students sort the week's 20 words by root, then write three sentences each using two roots. Pair-share.",
    standards: ["L.5.2.E"],
  }),
  L({
    id: "s-12-2",
    subject: "spelling",
    day: 4,
    title: "Friday quiz",
    objective: "I can spell List 12 words correctly under timed dictation.",
    preview:
      "Standard dictation-style quiz on List 12. Includes two challenge words from previous lists.",
    standards: ["L.5.2.E"],
  }),

  // UFLI
  L({
    id: "uf-12-0",
    subject: "ufli",
    day: 0,
    title: "Lesson 84 — closed syllables review",
    objective: "I can blend and read closed-syllable words at speed.",
    preview:
      "10-min warm-up, blending drill, two decodable passages. Track decoding errors on the class form.",
    standards: ["RF.5.3"],
  }),
  L({
    id: "uf-12-1",
    subject: "ufli",
    day: 1,
    title: "Lesson 85 — V/CV and VC/V split",
    objective:
      "I can apply V/CV and VC/V division to read multisyllabic words.",
    preview:
      "Introduce the two patterns for syllable division before a single consonant. 12 words, marking syllables.",
    standards: ["RF.5.3"],
  }),
  L({
    id: "uf-12-2",
    subject: "ufli",
    modified: true,
    day: 2,
    title: "Lesson 86 — practice & decodable",
    objective: "I can read a decodable passage with V/CV words accurately.",
    preview:
      "Re-read yesterday's words at speed; new decodable passage with embedded V/CV words. Partner reading.",
    standards: ["RF.5.3"],
    status: "done",
  }),
  L({
    id: "uf-12-3",
    subject: "ufli",
    day: 3,
    title: "Lesson 87 — open syllables intro",
    objective: "I can identify open syllables and read open-syllable words.",
    preview:
      "Open-syllable rule. Sort 16 words by syllable type. Quick-check at end.",
    standards: ["RF.5.3"],
  }),
  L({
    id: "uf-12-4",
    subject: "ufli",
    day: 4,
    title: "Lesson 88 — cumulative review",
    objective: "I can demonstrate growth on the cumulative phonics probe.",
    preview:
      "Sprint review of lessons 80–87. Mixed practice and a one-page progress probe.",
    standards: ["RF.5.3"],
  }),

  // Explorers
  L({
    id: "e-12-0",
    subject: "explorers",
    day: 1,
    title: "Nile geography — why here?",
    objective: "I can explain why the Nile valley supported civilization.",
    preview:
      "Maps activity: students annotate four features of the Nile valley that made it attractive for civilization. Compare with Tigris/Euphrates next week.",
    resources: [
      {
        type: "image",
        label: "Nile satellite",
        url: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Story_arc.svg/640px-Story_arc.svg.png",
        provider: "image",
        thumbnailUrl:
          "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Story_arc.svg/640px-Story_arc.svg.png",
      },
      { type: "pdf", label: "Annotation map" },
    ],
    standards: [],
  }),
  L({
    id: "e-12-1",
    subject: "explorers",
    commentCount: 3,
    unreadComments: 2,
    day: 3,
    title: "Hieroglyphs cartouche workshop",
    objective:
      "I can build my own hieroglyph cartouche using the phonetic alphabet.",
    preview:
      "Students build their own name cartouche in hieroglyphs using the phonetic alphabet handout. Display in the hallway.",
    notes: "Have extra cartouche strips ready — runs out fast. Glue, not tape.",
    resources: [
      { type: "pdf", label: "Phonetic chart" },
      { type: "image", label: "Sample cartouches" },
    ],
    standards: [],
  }),

  // SEL
  L({
    id: "se-12-0",
    subject: "sel",
    day: 2,
    title: "Conflict — name it, claim it",
    objective: "I can name a recent conflict and identify one repair move.",
    preview:
      "Class circle. Students share one small recent conflict (anonymously written), the group identifies its trigger and one repair move.",
    standards: [],
  }),

  // ── WEEK 13 (next week — all unedited, freshly planned) ───────────────
  L({
    id: "m-13-1",
    subject: "math",
    week: 13,
    day: 1,
    title: "Adding fractions with unlike denominators",
    objective:
      "I can add fractions with unlike denominators using a common unit.",
    preview:
      "Build the need for a common denominator with fraction strips before introducing the procedure.",
    resources: [{ type: "slides", label: "Common denominator deck" }],
    standards: ["5.NF.A.1"],
  }),
  L({
    id: "r-13-0",
    subject: "reading",
    week: 13,
    day: 0,
    title: "Wonder, chs 21–24 — turning points",
    objective:
      "I can identify a turning point and explain its effect on the plot.",
    preview:
      "Track the shift in the playground conflict; students mark the moment the story changes direction.",
    resources: [{ type: "doc", label: "Plot tracker" }],
    standards: ["RL.5.3"],
  }),
  L({
    id: "w-13-2",
    subject: "writing",
    week: 13,
    day: 2,
    title: "Drafting day — narrative ending",
    objective: "I can draft a satisfying ending for my personal narrative.",
    preview:
      "Sustained drafting block on the resolution; mini-lesson on three ways to end a narrative.",
    standards: ["W.5.3"],
  }),
  L({
    id: "g-13-3",
    subject: "grammar",
    week: 13,
    day: 3,
    title: "Subject–verb agreement",
    objective: "I can make subjects and verbs agree in number.",
    preview:
      "Sort tricky agreement cases (collective nouns, intervening phrases) and edit a short passage.",
    standards: ["L.5.1.C"],
  }),
  L({
    id: "uf-13-1",
    subject: "ufli",
    week: 13,
    day: 1,
    title: "Lesson 89 — vowel teams review",
    objective: "I can read words with common vowel teams accurately.",
    preview: "Review ai/ay, ee/ea, oa/ow; word sort and a decodable passage.",
    standards: ["RF.5.3"],
  }),
  L({
    id: "e-13-4",
    subject: "explorers",
    week: 13,
    day: 4,
    title: "Pyramids — engineering challenge",
    objective: "I can explain one technique used to build the pyramids.",
    preview:
      "Stations on ramps, levers, and labor; groups present one technique to the class.",
    resources: [{ type: "image", label: "Pyramid diagrams" }],
    standards: [],
  }),

  // ════════════════════════════════════════════════════════════════════════
  // FULL-YEAR ROADMAP COVERAGE (weeks 1–36)
  //
  // The Year roadmap (RoadmapView.tsx) draws one band per unit id, spanning
  // each unit's min→max lesson week. The hand-authored rows above only cover
  // weeks 11–13, so the back half of the roadmap read as empty. The rows
  // below tile every subject across all 36 academic weeks with contiguous,
  // gap-free units of varied length (4–8 wks) so the roadmap shows a fully
  // unitized year.
  //
  // Each subject's unit that overlaps weeks 11–13 reuses the subject's
  // existing default unit id (UNITS[subject].id) so these rows MERGE with the
  // hand-authored rows into a single band — no overlap, no double-counting.
  // Every other unit gets a fresh sequential id (m-u#, r-u#, …).
  //
  // Status realism vs CURRENT_WEEK (12): units fully before the current week
  // are "done", units straddling it are mixed (done / partial / not_done),
  // units after it are "not_done". One lesson is seeded per spanned week (on
  // a rotating school day, 0–4) so each unit's min→max week is fully covered.
  //
  // The generated rows are appended AFTER this literal (see the
  // `LESSONS.push(...)` at the bottom of the file) rather than spread inline,
  // because `buildYearCoverage()` reads the `YEAR_PLANS` / `HAND_AUTHORED_WEEKS`
  // tables declared further down. Spreading here would call the generator
  // during this array's initialization — before those `const` tables exist —
  // and throw a temporal-dead-zone ReferenceError at module load.
  // ════════════════════════════════════════════════════════════════════════
];

// ── Full-year coverage generator ────────────────────────────────────────────
//
// Declarative plan: per subject, a list of units with an explicit week range,
// a unit id, and a human name. `seedUnitId` (when set) reuses the subject's
// existing default unit so the generated rows merge with the hand-authored
// weeks-11–13 rows instead of drawing a second overlapping band. Weeks that
// already carry hand-authored lessons are skipped here so we never duplicate
// an existing (subject, week, day) slot or inflate a unit's lesson count.

interface UnitPlan {
  /** Unit id. Reuse the subject default for the band overlapping wks 11–13. */
  id: string;
  /** Display name (the roadmap synthesizes its own label, but Daily/Weekly
   *  and other consumers read the lesson title — kept descriptive). */
  name: string;
  /** Inclusive 1-based start week. */
  start: number;
  /** Inclusive 1-based end week. */
  end: number;
}

/** Weeks that already have hand-authored lessons, per subject — skipped by
 *  the generator so it never duplicates an existing slot. Derived from the
 *  literal rows above. */
const HAND_AUTHORED_WEEKS: Record<SubjectId, ReadonlySet<number>> = {
  math: new Set([11, 12, 13]),
  reading: new Set([11, 12, 13]),
  writing: new Set([11, 12, 13]),
  grammar: new Set([11, 12, 13]),
  spelling: new Set([12]),
  ufli: new Set([11, 12, 13]),
  explorers: new Set([12, 13]),
  sel: new Set([12]),
};

/** Per-subject unit tiling across weeks 1–36. The unit whose range covers
 *  weeks 11–13 reuses the subject's default unit id (UNITS[subject].id) so it
 *  merges with the hand-authored rows. Spans vary 4–8 weeks so bands look
 *  natural; together they are contiguous (start = prev.end + 1) and the last
 *  unit ends on week 36. */
const YEAR_PLANS: Record<SubjectId, UnitPlan[]> = {
  math: [
    { id: "m-u1", name: "Place Value & Decimals", start: 1, end: 6 },
    { id: "m-u2", name: "Multiplication & Division", start: 7, end: 10 },
    { id: UNITS.math.id, name: "Fractions", start: 11, end: 16 },
    { id: "m-u4", name: "Decimal Operations", start: 17, end: 22 },
    { id: "m-u5", name: "Geometry & Measurement", start: 23, end: 28 },
    { id: "m-u6", name: "Data, Graphs & the Coordinate Plane", start: 29, end: 32 }, // prettier-ignore
    { id: "m-u7", name: "Volume & Year-End Application", start: 33, end: 36 },
  ],
  reading: [
    { id: "r-u1", name: "Launching Readers' Workshop", start: 1, end: 6 },
    { id: UNITS.reading.id, name: "Realistic Fiction", start: 7, end: 14 },
    { id: "r-u3", name: "Nonfiction & Research", start: 15, end: 20 },
    { id: "r-u4", name: "Poetry & Figurative Language", start: 21, end: 25 },
    { id: "r-u5", name: "Book Clubs & Comparative Themes", start: 26, end: 31 },
    { id: "r-u6", name: "Drama, Performance & Reading Capstone", start: 32, end: 36 }, // prettier-ignore
  ],
  writing: [
    { id: "w-u1", name: "Launching Writers' Workshop", start: 1, end: 5 },
    { id: "w-u2", name: "Informational Writing", start: 6, end: 9 },
    { id: UNITS.writing.id, name: "Personal Narrative", start: 10, end: 15 },
    { id: "w-u4", name: "Opinion & Argument", start: 16, end: 21 },
    { id: "w-u5", name: "Research Report", start: 22, end: 27 },
    { id: "w-u6", name: "Literary Essay", start: 28, end: 32 },
    { id: "w-u7", name: "Poetry & Multi-Genre Capstone", start: 33, end: 36 },
  ],
  grammar: [
    { id: "g-u1", name: "Parts of Speech", start: 1, end: 7 },
    { id: UNITS.grammar.id, name: "Verb Tense & Agreement", start: 8, end: 14 },
    { id: "g-u3", name: "Punctuation & Conventions", start: 15, end: 20 },
    { id: "g-u4", name: "Clauses & Complex Sentences", start: 21, end: 26 },
    { id: "g-u5", name: "Sentence Structure & Combining", start: 27, end: 31 },
    { id: "g-u6", name: "Editing & Revision Mastery", start: 32, end: 36 },
  ],
  spelling: [
    { id: "sp-u1", name: "Short & Long Vowel Patterns", start: 1, end: 5 },
    { id: "sp-u2", name: "Consonant Blends & Digraphs", start: 6, end: 10 },
    { id: UNITS.spelling.id, name: "Greek & Latin Roots", start: 11, end: 16 },
    { id: "sp-u4", name: "Prefixes & Suffixes", start: 17, end: 22 },
    { id: "sp-u5", name: "Homophones & Tricky Patterns", start: 23, end: 28 },
    { id: "sp-u6", name: "Morphology & Word Study", start: 29, end: 32 },
    { id: "sp-u7", name: "Year-End Spelling Review", start: 33, end: 36 },
  ],
  ufli: [
    { id: "u-u1", name: "Closed Syllables & Blends", start: 1, end: 5 },
    { id: "u-u2", name: "Silent-e & Vowel-Consonant-e", start: 6, end: 8 },
    { id: UNITS.ufli.id, name: "Multisyllabic Words", start: 9, end: 14 },
    { id: "u-u4", name: "Open Syllables & Vowel Teams", start: 15, end: 20 },
    { id: "u-u5", name: "R-Controlled Vowels", start: 21, end: 26 },
    { id: "u-u6", name: "Multisyllabic Decoding", start: 27, end: 31 },
    { id: "u-u7", name: "Morphology & Fluency", start: 32, end: 36 },
  ],
  explorers: [
    { id: "e-u1", name: "Map Skills & Early Humans", start: 1, end: 6 },
    { id: UNITS.explorers.id, name: "Ancient Civilizations", start: 7, end: 14 }, // prettier-ignore
    { id: "e-u3", name: "Exploration & Migration", start: 15, end: 20 },
    { id: "e-u4", name: "Geography & Cultures", start: 21, end: 26 },
    { id: "e-u5", name: "Economics & Community", start: 27, end: 31 },
    { id: "e-u6", name: "Capstone Inquiry Project", start: 32, end: 36 },
  ],
  sel: [
    { id: "s-u1", name: "Self-Awareness & Routines", start: 1, end: 5 },
    { id: UNITS.sel.id, name: "Community & Belonging", start: 6, end: 13 },
    { id: "s-u3", name: "Emotional Regulation", start: 14, end: 19 },
    { id: "s-u4", name: "Empathy & Relationships", start: 20, end: 25 },
    { id: "s-u5", name: "Growth Mindset & Goal-Setting", start: 26, end: 31 },
    { id: "s-u6", name: "Reflection & Transition", start: 32, end: 36 },
  ],
};

/** Short per-subject id prefix for generated lesson ids (kept distinct from
 *  the hand-authored ids above, which use the same prefixes but a `-NN-`
 *  week segment; generated ids use a `-yc-` segment to stay globally
 *  unique). */
const ID_PREFIX: Record<SubjectId, string> = {
  math: "m",
  reading: "r",
  writing: "w",
  grammar: "g",
  spelling: "s",
  ufli: "uf",
  explorers: "e",
  sel: "se",
};

/**
 * Pick a realistic status for a generated lesson given its week vs the
 * current week. Past weeks lean "done" (with an occasional "partial" so the
 * roadmap shows some in-progress bands); the current week is mixed; future
 * weeks are "not_done".
 */
function statusForWeek(week: number): LessonStatus {
  if (week < CURRENT_WEEK) {
    // Mostly done, every 4th week a "partial" for visual variety.
    return week % 4 === 0 ? "partial" : "done";
  }
  if (week === CURRENT_WEEK) return "partial";
  return "not_done";
}

/**
 * Build one lesson per week of every planned unit, skipping weeks that
 * already carry hand-authored lessons (so we never duplicate a slot or
 * inflate a band's count). The day index rotates 0–4 across the unit so the
 * generated lessons spread sensibly through the school week.
 */
function buildYearCoverage(): Lesson[] {
  const out: Lesson[] = [];
  (Object.keys(YEAR_PLANS) as SubjectId[]).forEach((subject) => {
    const plans = YEAR_PLANS[subject];
    const skip = HAND_AUTHORED_WEEKS[subject];
    plans.forEach((plan, unitIdx) => {
      let weekOffset = 0;
      for (let week = plan.start; week <= plan.end; week++) {
        if (skip.has(week)) {
          weekOffset++;
          continue;
        }
        const day = weekOffset % 5; // rotate Sun–Thu
        weekOffset++;
        out.push(
          L({
            id: `${ID_PREFIX[subject]}-yc-${week}-${day}`,
            subject,
            unit: plan.id,
            week,
            day,
            title: `${plan.name} — Week ${week} lesson`,
            objective: `I can work toward this week's ${plan.name} goal.`,
            preview: `Planned ${plan.name} lesson for week ${week} (unit ${unitIdx + 1}).`,
            status: statusForWeek(week),
          }),
        );
      }
    });
  });
  return out;
}

// Append the full-year coverage rows now that every table + helper above is
// initialized. Placed at the very bottom of the module so it runs after the
// `LESSONS` literal AND the generator's data tables — avoiding the
// temporal-dead-zone error a `...buildYearCoverage()` spread inside the
// literal would cause.
LESSONS.push(...buildYearCoverage());

/** All lessons for a given week, in day order. */
export function lessonsForWeek(week: number): Lesson[] {
  return LESSONS.filter((l) => l.week === week).sort((a, b) => a.day - b.day);
}

/** Lesson lookup by id. */
export const LESSON_BY_ID: Record<string, Lesson> = Object.fromEntries(
  LESSONS.map((l) => [l.id, l]),
);
