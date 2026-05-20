// Mock fixture: a three-week lesson set (weeks 11–13) for the Grade 5
// curriculum planner. Week 12 is ported verbatim from the design handoff
// (project/data.jsx); weeks 11 and 13 extend it so the weekly grid can be
// paged across a realistic span. The set covers every lesson state:
// unedited, modified, moved (same-week / across-weeks), done, carried,
// pending-master, personal, multi-task, and lessons with comments.

import type {
  Lesson,
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
}

/** Normalize a lesson input into a fully-typed Lesson with defaults. */
function L(o: LessonInput): Lesson {
  return {
    id: o.id,
    subject: o.subject,
    unit: UNITS[o.subject].id,
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
    resources: [{ type: "slides", label: "Area model deck" }],
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
    resources: [{ type: "pdf", label: "Story arc map" }],
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
    notes:
      "If they struggle, fall back to the strip diagrams from Lesson 22. Maya's class skipped this in October — extend by 5min.",
    // Resources seeded per spec §7 / §4.2 — the first four populate the
    // 2×2 thumbnail grid in Section 1 (Standards); the remaining three flow
    // into the "More resources" sub-list. Exact labels per the spec.
    resources: [
      { type: "youtube", label: "Fraction Basics" }, // Card 1 — play icon
      { type: "link", label: "What is a Fraction?" }, // Card 2 — paperclip
      { type: "doc", label: "Fractions Overview" }, // Card 3 — document
      { type: "link", label: "Khan Academy" }, // Card 4 — paperclip
      { type: "pdf", label: "Fraction Wall Poster" }, // More — PDF
      { type: "doc", label: "Anchor Chart Template" }, // More — DOCX
      { type: "pdf", label: "Fraction Examples Sheet" }, // More — PDF
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
    notes: "Pull aside Aya, Tariq, Lara if they're still on the array model.",
    resources: [
      { type: "slides", label: "Lesson 23 deck" },
      { type: "doc", label: "Exit ticket" },
      { type: "youtube", label: "Bar models (4min)" },
    ],
    standards: ["5.NF.B.3"],
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
    notes: "Lara was absent for ch 13 — have her partner with Sofia.",
    resources: [
      { type: "doc", label: "Annotation sheet" },
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
    notes:
      "Print rotation chart for the back wall. Tariq's group should start at writing (he needs the longest at writing today).",
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
      { type: "image", label: "Nile satellite" },
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
];

/** All lessons for a given week, in day order. */
export function lessonsForWeek(week: number): Lesson[] {
  return LESSONS.filter((l) => l.week === week).sort((a, b) => a.day - b.day);
}

/** Lesson lookup by id. */
export const LESSON_BY_ID: Record<string, Lesson> = Object.fromEntries(
  LESSONS.map((l) => [l.id, l]),
);
