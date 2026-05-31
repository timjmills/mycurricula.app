// data.jsx — Fake but realistic data for the curriculum planner prototypes.
// Real CCSS codes, real-feeling lesson titles, real-feeling teacher names.
// Shared across every artboard so they form a coherent story.

const SUBJECTS = [
  { id: "math",      name: "Math",        cls: "math",      icon: "∑" },
  { id: "reading",   name: "Reading",     cls: "reading",   icon: "📖", parent: "literacy" },
  { id: "writing",   name: "Writing",     cls: "writing",   icon: "✎",  parent: "literacy" },
  { id: "grammar",   name: "Grammar",     cls: "grammar",   icon: "Ag", parent: "literacy" },
  { id: "spelling",  name: "Spelling",    cls: "spelling",  icon: "Sp", parent: "literacy" },
  { id: "ufli",      name: "UFLI",        cls: "ufli",      icon: "Uf" },
  { id: "explorers", name: "Explorers",   cls: "explorers", icon: "Ex" },
  { id: "sel",       name: "SEL",         cls: "sel",       icon: "Se" },
];

const SUBJECT_BY_ID = Object.fromEntries(SUBJECTS.map(s => [s.id, s]));

const TEACHERS = [
  { id: "lh", name: "Lena Haddad",    initials: "LH", role: "lead" },
  { id: "sk", name: "Sarah Khouri",   initials: "SK", role: "teacher" },
  { id: "ma", name: "Maya Al-Rashid", initials: "MA", role: "teacher" },
  { id: "jd", name: "Jonas Delacroix",initials: "JD", role: "teacher" },
  { id: "om", name: "Omar Bishara",   initials: "OM", role: "lead" },
];

const ME = TEACHERS[0]; // Lena, signed in

const UNITS = {
  math:      { id: "u-m3",  subject: "math",      name: "Unit 3 · Fractions on a Number Line", weeks: "Wk 9–14", shade: 2 },
  reading:   { id: "u-r2",  subject: "reading",   name: "Unit 2 · Realistic Fiction",          weeks: "Wk 7–12", shade: 2 },
  writing:   { id: "u-w3",  subject: "writing",   name: "Unit 3 · Personal Narrative",         weeks: "Wk 10–15", shade: 2 },
  grammar:   { id: "u-g2",  subject: "grammar",   name: "Unit 2 · Verb Tense & Agreement",     weeks: "Wk 8–13", shade: 2 },
  spelling:  { id: "u-s4",  subject: "spelling",  name: "List 12 · Greek Roots",               weeks: "Wk 12",   shade: 3 },
  ufli:      { id: "u-uf",  subject: "ufli",      name: "Lessons 84–92 · Multisyllabic Words", weeks: "Wk 9–14", shade: 2 },
  explorers: { id: "u-e2",  subject: "explorers", name: "Unit 2 · Ancient Egypt",              weeks: "Wk 8–14", shade: 2 },
  sel:       { id: "u-se2", subject: "sel",       name: "Unit 2 · Conflict & Resolution",      weeks: "Wk 9–12", shade: 2 },
};

// Standards — real CCSS codes for Grade 5.
const STANDARDS = {
  "5.NF.B.3":  "Interpret a fraction as division of the numerator by the denominator (a/b = a ÷ b).",
  "5.NF.B.4":  "Apply and extend previous understandings of multiplication to multiply a fraction by a fraction.",
  "5.NF.A.1":  "Add and subtract fractions with unlike denominators.",
  "5.NF.A.2":  "Solve word problems involving addition and subtraction of fractions.",
  "5.NBT.B.5": "Fluently multiply multi-digit whole numbers using the standard algorithm.",
  "RL.5.3":    "Compare and contrast two or more characters, settings, or events in a story.",
  "RL.5.6":    "Describe how a narrator's or speaker's point of view influences events.",
  "RL.5.2":    "Determine a theme of a story from details in the text.",
  "W.5.3":     "Write narratives to develop real or imagined experiences using effective technique.",
  "W.5.3.B":   "Use narrative techniques, such as dialogue, description, and pacing.",
  "L.5.1.C":   "Use verb tense to convey various times, sequences, states, and conditions.",
  "L.5.1.D":   "Recognize and correct inappropriate shifts in verb tense.",
  "L.5.2.E":   "Spell grade-appropriate words correctly, consulting references as needed.",
  "RF.5.3":    "Know and apply grade-level phonics and word analysis skills.",
};

// ── Lessons ────────────────────────────────────────────────────────────
// One realistic, dense lesson model. Multiple appear per day in the
// Weekly grid. Each carries directions (long), notes (hover), resources,
// standards, completion + fork state.

function L(o) {
  return {
    id: o.id, subject: o.subject, unit: UNITS[o.subject].id,
    title: o.title,
    // I Can / lesson-objective statement. Shown beneath the title in every
    // surface (Weekly card, Daily detail, Subject row, Unit summary).
    objective: o.objective || "",
    preview: o.preview,
    directions: o.directions || o.preview,
    notes: o.notes || "",
    resources: o.resources || [],
    standards: o.standards || [],
    week: o.week || 12, day: o.day,
    isPersonal: !!o.isPersonal,
    pendingMaster: !!o.pendingMaster,
    // Reason the lesson didn't go as planned. Optional — only set for
    // not_done / skipped / carried / partial statuses. Surfaces on the
    // card footer, in the lesson detail header, and in the Catch-up screen.
    reasonNotDone: o.reasonNotDone || "",
    modified: !!o.modified,
    moved: o.moved || null,
    status: o.status || "not_done",
    commentCount: o.commentCount || 0,
    unreadComments: o.unreadComments || 0,
    // Lesson tasks (sub-events). Each lesson is either:
    //   • a single lesson event (no tasks), OR
    //   • a parent containing 2+ lesson tasks — each shown as its own
    //     check / title / resources / standards. Tasks are flagged as
    //     belonging to the parent (subject-tinted "TASK" pill) but
    //     surface alongside it in every view.
    // Each task: { id, title, status, resources, standards, isPersonal }
    tasks: (o.tasks || []).map(t => ({
      id: t.id,
      title: t.title,
      status: t.status || "not_done",
      resources: t.resources || [],
      standards: t.standards || [],
      isPersonal: !!t.isPersonal,
      // optional sub-subject hint (literacy centers carries 'grammar' /
      // 'reading' / 'writing' on its three rotation stations so the
      // task can stripe in that station's color).
      subjectHint: t.subjectHint || null,
    })),
  };
}

const LESSONS = [
  // ── WEEK 12 (current week — Sun-Thu) ─────────────────────────────────
  // Math
  L({ id: "m-12-0", subject: "math", day: 0, title: "Equivalent fractions warm-up",
    objective: "I can find three equivalent fractions for a given fraction.",
    preview: "Number-talk routine: pairs find three equivalent fractions for 3/4, share strategies, then class consolidates the visual model on the board.",
    notes: "If they struggle, fall back to the strip diagrams from Lesson 22. Maya's class skipped this in October — extend by 5min.",
    resources: [{type:"slides",label:"Number talk deck"}, {type:"pdf",label:"Fraction strips"}],
    standards: ["5.NF.B.3","5.NF.A.1"] }),
  L({ id: "m-12-1", subject: "math", modified: true, commentCount: 2, unreadComments: 1, day: 1, title: "Fractions as division — bake sale problem",
    objective: "I can interpret a fraction as division and model it two ways.",
    preview: "Anchor problem: 5 cookies shared by 4 friends. Students use bar models then long division to connect the two representations.",
    directions: "Open with the bake-sale anchor on slide 3. Give pairs 10 min to model. Pull two contrasting samples for the whole-class discussion. Closing exit ticket: one new problem of their own.",
    notes: "Pull aside Aya, Tariq, Lara if they're still on the array model.",
    resources: [{type:"slides",label:"Lesson 23 deck"}, {type:"doc",label:"Exit ticket"}, {type:"youtube",label:"Bar models (4min)"}],
    standards: ["5.NF.B.3"] }),
  // Same subject, same day, second event — math centers extension
  L({ id: "m-12-1b", subject: "math", day: 1, title: "Math centers (last 20 min)",
    objective: "I can fluently practice math facts and fractions at three stations.",
    preview: "Three-station rotation while the rest of the class finishes the bake-sale work. Fact fluency · fraction tiles · word problems.",
    directions: "Rotation chart on the back wall. Each station is 6 minutes. I sit at fluency to catch the bottom three.",
    resources: [{type:"pdf",label:"Station task cards"}, {type:"image",label:"Rotation chart"}],
    standards: [],
    tasks: [
      { id: "m-ctr-fluency", title: "Fact fluency sprint",
        status: "not_done",
        resources: [{type:"pdf",label:"Fluency probe"}], standards: [] },
      { id: "m-ctr-tiles",   title: "Fraction tiles — build & justify",
        status: "not_done",
        resources: [{type:"image",label:"Tile mat"}], standards: ["5.NF.B.3"] },
      { id: "m-ctr-words",   title: "Word-problem station",
        status: "not_done",
        resources: [{type:"doc",label:"4-up problem set"}], standards: ["5.NF.B.4"] },
    ] }),
  L({ id: "m-12-2", subject: "math", day: 2, title: "Multiplying a fraction by a whole number",
    objective: "I can multiply a fraction by a whole number using a model and equation.",
    preview: "Concrete-pictorial-abstract sequence. Start with fraction tiles, move to area models, end with the algorithm.",
    resources: [{type:"slides",label:"CPA sequence"}, {type:"pdf",label:"Practice set B"}],
    standards: ["5.NF.B.4"], status: "done" }),
  L({ id: "m-12-3", subject: "math", moved: "same-week", day: 3, title: "Mid-unit check — fractions",
    objective: "I can show what I know about equivalence, division, and multiplication of fractions.",
    preview: "Independent 20-minute check covering equivalence, fractions as division, and multiplication of a fraction by a whole number.",
    resources: [{type:"pdf",label:"Mid-unit check"}],
    standards: ["5.NF.B.3","5.NF.B.4"], pendingMaster: true }),
  L({ id: "m-12-4", subject: "math", day: 4, title: "Re-engagement: error analysis",
    objective: "I can identify and repair errors in fraction work.",
    preview: "Look at three flawed student solutions on equivalent fractions. Identify the misconception, repair the work, then write a one-sentence rule.",
    resources: [{type:"slides",label:"Three flawed solutions"}],
    standards: ["5.NF.A.1"] }),

  // Reading
  L({ id: "r-12-0", subject: "reading", day: 0, title: "Wonder, chs 14–17 — point of view",
    objective: "I can describe how a narrator's point of view influences events.",
    preview: "First-person narrator shift from August to Via. Students annotate three places the same event is reframed.",
    notes: "Lara was absent for ch 13 — have her partner with Sofia.",
    resources: [{type:"doc",label:"Annotation sheet"}, {type:"website",label:"Lit-circle prompts"}],
    standards: ["RL.5.6","RL.5.3"] }),
  L({ id: "r-12-1", subject: "reading", modified: true, moved: "same-week", commentCount: 1, day: 1, title: "Book club — Via's chapters",
    objective: "I can take a role in book club and contribute to discussion.",
    preview: "Pre-assigned literature circle roles: discussion leader, connector, vocabulary detective, summarizer. 18-minute discussion, 4-minute share.",
    resources: [{type:"doc",label:"Role cards"}],
    standards: ["RL.5.3"], isPersonal: true }),
  // Literacy Centers — the multi-task example. One lesson with three rotating
  // stations, each its own task with its own resources and sub-subject hint.
  L({ id: "r-12-litcenters", subject: "reading", day: 2, title: "Literacy Centers (90 min)",
    objective: "I can rotate through three literacy stations and complete each task.",
    preview: "Three-station rotation: reading comprehension · grammar dictation · narrative writing. 25 min per station with 5-min transitions.",
    directions: "Bell rings at 9:35 — Group A starts at reading, B at grammar, C at writing. Rotate at the chime. I conference at the writing station throughout.",
    notes: "Print rotation chart for the back wall. Tariq's group should start at writing (he needs the longest at writing today).",
    resources: [{type:"image",label:"Rotation chart"}, {type:"doc",label:"Conferring tracker"}],
    standards: ["RL.5.3","L.5.1.D","W.5.3"],
    tasks: [
      { id: "litc-read", subjectHint: "reading", title: "Reading station — Wonder, ch 18–20",
        status: "not_done",
        resources: [{type:"pdf",label:"Comprehension prompts"}, {type:"doc",label:"Annotation sheet"}],
        standards: ["RL.5.3"] },
      { id: "litc-gram", subjectHint: "grammar", title: "Grammar station — verb-tense dictation",
        status: "not_done",
        resources: [{type:"pdf",label:"Dictation passage"}, {type:"youtube",label:"Verb tense (3min)"}],
        standards: ["L.5.1.D"] },
      { id: "litc-writ", subjectHint: "writing", title: "Writing station — narrative drafting",
        status: "not_done",
        resources: [{type:"slides",label:"Show vs tell cues"}, {type:"doc",label:"Drafting paper"}],
        standards: ["W.5.3","W.5.3.B"], isPersonal: true },
    ] }),
  L({ id: "r-12-2", subject: "reading", day: 2, title: "Inference workshop",
    objective: "I can make text-based inferences using evidence and prior knowledge.", preview: "Mini-lesson on inference using a short Eve Bunting passage, then partners apply to Wonder chs 18–20.", resources: [{type:"slides",label:"Inference mini"}], standards: ["RL.5.3"] }),
  // Second reading event same day — small-group strategy
  L({ id: "r-12-2b", subject: "reading", day: 2, title: "Small-group strategy — fluency",
    objective: "I can re-read for fluency and track my words-per-minute.",
    preview: "Pull three readers to the back table while the rest do partner reading. Cold-read passage, two re-reads, charted WPM.",
    resources: [{type:"pdf",label:"Cold-read passage"}, {type:"doc",label:"WPM tracking form"}],
    standards: ["RF.5.4"] }),
  L({ id: "r-12-3", subject: "reading", day: 3, title: "Theme mapping",
    objective: "I can identify a theme of a story from details in the text.",
    preview: "Build a class theme map. Each student adds one piece of evidence from chapters 1–20 supporting kindness as a theme.",
    resources: [{type:"slides",label:"Theme map template"}],
    standards: ["RL.5.2"] }),
  L({ id: "r-12-4", subject: "reading", day: 4, title: "Independent reading + conferences",
    objective: "I can read independently and set one fluency goal.", preview: "20-min sustained silent reading; teacher conferences with 4 students rotating through fluency, comprehension, and goal-setting.", standards: ["RL.5.2"] }),

  // Writing
  L({ id: "w-12-0", subject: "writing", day: 0, title: "Lead sentences — three rewrites",
    objective: "I can write three different effective leads for the same story.",
    preview: "Students rewrite the same opening three ways: with dialogue, with sensory detail, with a question. Share-out and class vote on strongest.",
    resources: [{type:"slides",label:"Mentor leads"}],
    standards: ["W.5.3","W.5.3.B"] }),
  L({ id: "w-12-1", subject: "writing", moved: "across-weeks", day: 2, title: "Drafting day — narrative middle",
    objective: "I can draft the rising action of my personal narrative.",
    preview: "30-minute sustained drafting block on the rising action of their personal narrative. Quiet writing, music optional.",
    standards: ["W.5.3"], status: "carried",
    reasonNotDone: "Fire drill ate 15 min — pushed drafting to Wed. Half the class hadn't even finished the warm-up." }),
  L({ id: "w-12-2", subject: "writing", modified: true, commentCount: 4, day: 3, title: "Peer feedback — show vs tell",
    objective: "I can give and receive show-vs-tell feedback from a partner.",
    preview: "Partner conferences focused on one paragraph: highlight what's telling, suggest one place to show. Use the show/tell cue cards.",
    resources: [{type:"pdf",label:"Show/tell cue cards"}],
    standards: ["W.5.3.B"], isPersonal: true }),

  // Grammar
  L({ id: "g-12-0", subject: "grammar", day: 0, title: "Past, present, future review",
    objective: "I can sort sentences by verb tense and spot inconsistent shifts.",
    preview: "Sort 18 sample sentences into three columns by verb tense. Identify three sentences with shifts.",
    resources: [{type:"pdf",label:"Sort sheet"}], standards: ["L.5.1.C"] }),
  L({ id: "g-12-1", subject: "grammar", moved: "same-week", day: 2, title: "Inappropriate shifts in tense",
    objective: "I can edit a paragraph to fix inappropriate shifts in tense.",
    preview: "Edit a one-paragraph narrative that drifts between tenses. Highlight every verb, then rewrite consistently in past.",
    resources: [{type:"doc",label:"Editing paragraph"}], standards: ["L.5.1.D"] }),
  L({ id: "g-12-2", subject: "grammar", day: 4, title: "Quick check — verb tense",
    objective: "I can apply verb-tense rules in a short assessment.",
    preview: "10-question multiple-choice and 3 short-answer rewrites. Goes home as a study tool.",
    standards: ["L.5.1.C","L.5.1.D"] }),

  // Spelling
  L({ id: "s-12-0", subject: "spelling", day: 0, title: "List 12 introduction — Greek roots",
    objective: "I can identify Greek roots and build new words from them.",
    preview: "Introduce -graph, -phone, -scope, -meter. Build five words from each root with the class. Send list home.",
    resources: [{type:"pdf",label:"List 12"}], standards: ["L.5.2.E"] }),
  L({ id: "s-12-1", subject: "spelling", day: 2, title: "Word sort + sentence frames",
    objective: "I can sort spelling words by root and use two roots in a sentence.", preview: "Students sort the week's 20 words by root, then write three sentences each using two roots. Pair-share.", standards: ["L.5.2.E"] }),
  L({ id: "s-12-2", subject: "spelling", day: 4, title: "Friday quiz",
    objective: "I can spell List 12 words correctly under timed dictation.", preview: "Standard dictation-style quiz on List 12. Includes two challenge words from previous lists.", standards: ["L.5.2.E"] }),

  // UFLI
  L({ id: "uf-12-0", subject: "ufli", day: 0, title: "Lesson 84 — closed syllables review",
    objective: "I can blend and read closed-syllable words at speed.", preview: "10-min warm-up, blending drill, two decodable passages. Track decoding errors on the class form.", standards: ["RF.5.3"] }),
  L({ id: "uf-12-1", subject: "ufli", day: 1, title: "Lesson 85 — V/CV and VC/V split",
    objective: "I can apply V/CV and VC/V division to read multisyllabic words.", preview: "Introduce the two patterns for syllable division before a single consonant. 12 words, marking syllables.", standards: ["RF.5.3"] }),
  L({ id: "uf-12-2", subject: "ufli", modified: true, day: 2, title: "Lesson 86 — practice & decodable",
    objective: "I can read a decodable passage with V/CV words accurately.", preview: "Re-read yesterday's words at speed; new decodable passage with embedded V/CV words. Partner reading.", standards: ["RF.5.3"], status: "done" }),
  L({ id: "uf-12-3", subject: "ufli", day: 3, title: "Lesson 87 — open syllables intro",
    objective: "I can identify open syllables and read open-syllable words.", preview: "Open-syllable rule. Sort 16 words by syllable type. Quick-check at end.", standards: ["RF.5.3"] }),
  L({ id: "uf-12-4", subject: "ufli", day: 4, title: "Lesson 88 — cumulative review",
    objective: "I can demonstrate growth on the cumulative phonics probe.", preview: "Sprint review of lessons 80–87. Mixed practice and a one-page progress probe.", standards: ["RF.5.3"] }),

  // Explorers
  L({ id: "e-12-0", subject: "explorers", day: 1, title: "Nile geography — why here?",
    objective: "I can explain why the Nile valley supported civilization.",
    preview: "Maps activity: students annotate four features of the Nile valley that made it attractive for civilization. Compare with Tigris/Euphrates next week.",
    resources: [{type:"image",label:"Nile satellite"}, {type:"pdf",label:"Annotation map"}],
    standards: [] }),
  L({ id: "e-12-1", subject: "explorers", commentCount: 3, unreadComments: 2, day: 3, title: "Hieroglyphs cartouche workshop",
    objective: "I can build my own hieroglyph cartouche using the phonetic alphabet.",
    preview: "Students build their own name cartouche in hieroglyphs using the phonetic alphabet handout. Display in the hallway.",
    notes: "Have extra cartouche strips ready — runs out fast. Glue, not tape.",
    resources: [{type:"pdf",label:"Phonetic chart"}, {type:"image",label:"Sample cartouches"}],
    standards: [] }),

  // SEL
  L({ id: "se-12-0", subject: "sel", day: 2, title: "Conflict — name it, claim it",
    objective: "I can name a recent conflict and identify one repair move.",
    preview: "Class circle. Students share one small recent conflict (anonymously written), the group identifies its trigger and one repair move.",
    standards: [] }),
];

// ── Daily notes ────────────────────────────────────────────────────────
const DAILY_NOTES = [
  // day 0 = Sun (week starts Sunday)
  { day: 0, scope: "shared", priority: "important", author: "om", body: "PD this Thursday — early dismissal at 1:30." },
  { day: 1, scope: "shared", priority: "fyi",       author: "om", body: "Library closed Mon–Wed for inventory." },
  { day: 2, scope: "personal", priority: "urgent",  author: "lh", body: "Sub for Lena 12:30–1:30 — leave printed bell ringer." },
  { day: 2, scope: "shared", priority: "important", author: "sk", body: "Picture day rescheduled to next Tuesday." },
  { day: 3, scope: "personal", priority: "fyi",     author: "lh", body: "Aya's mum bringing samosas at lunch." },
  { day: 3, scope: "shared", priority: "urgent",    author: "om", body: "Fire drill — 9:45 sharp. No make-up if missed." },
  { day: 4, scope: "shared", priority: "fyi",       author: "om", body: "Friday assembly cancelled." },
];

// ── To-dos ─────────────────────────────────────────────────────────────
const TAGS = [
  { id: "prep",     name: "prep",     label: "prep",     color: "tag-blue",   bg: "color-mix(in oklch, var(--tag-blue) 22%, white)",   fg: "var(--tag-blue)" },
  { id: "copies",   name: "copies",   label: "copies",   color: "tag-amber",  bg: "color-mix(in oklch, var(--tag-amber) 22%, white)",  fg: "var(--tag-amber)" },
  { id: "parents",  name: "parents",  label: "parents",  color: "tag-pink",   bg: "color-mix(in oklch, var(--tag-pink) 22%, white)",   fg: "var(--tag-pink)" },
  { id: "supplies", name: "supplies", label: "supplies", color: "tag-green",  bg: "color-mix(in oklch, var(--tag-green) 22%, white)",  fg: "var(--tag-green)" },
  { id: "team",     name: "team",     label: "team",     color: "tag-indigo", bg: "color-mix(in oklch, var(--tag-indigo) 22%, white)", fg: "var(--tag-indigo)" },
  { id: "urgent",   name: "urgent",   label: "urgent",   color: "tag-red",    bg: "color-mix(in oklch, var(--tag-red) 22%, white)",    fg: "var(--tag-red)" },
  { id: "ideas",    name: "ideas",    label: "ideas",    color: "tag-purple", bg: "color-mix(in oklch, var(--tag-purple) 22%, white)", fg: "var(--tag-purple)" },
];

const TODOS = [
  { id: "t1", scope: "personal", title: "Print List 12 spelling for Mon",     tags: ["copies"],  due: "today", done: false, linked: "spelling/u-s4" },
  { id: "t2", scope: "personal", title: "Email Aya's mum re. samosas Wed",    tags: ["parents"], due: "today", done: false },
  { id: "t3", scope: "personal", title: "Photocopy fraction strips × 26",     tags: ["copies","prep"], due: "today", done: true },
  { id: "t4", scope: "personal", title: "Pull aside Tariq for reading conf.", tags: [],          due: "tomorrow", done: false },
  { id: "t5", scope: "personal", title: "Update narrative rubric in Drive",   tags: ["prep"],    due: null, done: false },
  { id: "t6", scope: "personal", title: "Grab clipboards from storage",       tags: ["supplies"],due: "today", done: false },

  { id: "t7", scope: "team",     title: "Decide Tuesday assembly seating",    tags: ["team","urgent"], due: "today", done: false, assignee: "om", author: "om" },
  { id: "t8", scope: "team",     title: "Order more cartouche strips",        tags: ["team","supplies"], due: "thisweek", done: false, assignee: "lh", author: "om" },
  { id: "t9", scope: "team",     title: "Review Unit 3 Math summative items", tags: ["team","prep"], due: "thisweek", done: true, completedBy: "sk", author: "lh" },
  { id: "t10", scope: "team",    title: "Confirm field trip dates w/ office", tags: ["team","parents"], due: null, done: false, assignee: "sk", author: "om" },
  { id: "t11", scope: "team",    title: "Norms doc — short revisit",          tags: ["team","ideas"], due: "thismonth", done: false, author: "lh" },
];

// ── Schedule view: time blocks (a typical Lena day, Mon) ──────────────
const SCHEDULE = [
  { start: "07:50", end: "08:10", type: "non_academic", label: "Morning meeting" },
  { start: "08:10", end: "09:10", type: "academic", subject: "math",     lesson: "m-12-1" },
  { start: "09:10", end: "09:40", type: "academic", subject: "ufli",     lesson: "uf-12-1" },
  { start: "09:40", end: "10:00", type: "non_academic", label: "Snack & recess" },
  { start: "10:00", end: "11:00", type: "academic", subject: "reading",  lesson: "r-12-1" },
  { start: "11:00", end: "11:40", type: "non_academic", label: "Arabic (specialist)" },
  { start: "11:40", end: "12:20", type: "non_academic", label: "Lunch" },
  { start: "12:20", end: "13:10", type: "academic", subject: "writing",  lesson: null },
  { start: "13:10", end: "13:40", type: "academic", subject: "grammar",  lesson: null },
  { start: "13:40", end: "14:10", type: "non_academic", label: "PE (specialist)" },
  { start: "14:10", end: "14:50", type: "academic", subject: "explorers",lesson: "e-12-0" },
  { start: "14:50", end: "15:10", type: "non_academic", label: "Pack-up & dismissal" },
];

Object.assign(window, {
  SUBJECTS, SUBJECT_BY_ID, TEACHERS, ME, UNITS, STANDARDS,
  LESSONS, DAILY_NOTES, TAGS, TODOS, SCHEDULE
});
