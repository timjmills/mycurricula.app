// lesson-templates.ts — the built-in lesson-flow template library.
//
// A lesson-flow template is an ordered list of named SECTIONS. When a
// teacher creates a lesson in an *academic* subject, the lesson is
// pre-populated with the sections of that subject's template; each section
// in a real lesson holds rich text plus its own attached resources.
//
// These 15 templates are the read-only built-ins offered during onboarding
// (see docs/historical/5.17.26 Onboarding & Lesson-Flow Template
// Plan.md). A teacher can duplicate one and edit it, or build a custom flow.
// The empty-state placeholder a teacher sees inside a section is its
// `prompt`.

/** One named phase of a lesson-flow template. */
export interface LessonTemplateSection {
  /** Stable id, unique within the template. */
  id: string;
  /** Section name shown as the field label. */
  label: string;
  /** Guiding text shown as placeholder in an empty section. */
  prompt: string;
}

/** An ordered, named lesson structure a teacher can adopt as their default. */
export interface LessonTemplate {
  id: string;
  name: string;
  /** One-line pedagogy summary shown on the gallery card. */
  description: string;
  /** Grade / subject fit, shown in the template preview. */
  fit: string;
  /** Suggested default for a general Grade 5 classroom. */
  recommended?: boolean;
  sections: LessonTemplateSection[];
}

/** Helper — builds a section with a generated id. */
function s(
  templateId: string,
  index: number,
  label: string,
  prompt: string,
): LessonTemplateSection {
  return { id: `${templateId}-s${index + 1}`, label, prompt };
}

/** The 15 built-in lesson-flow templates. */
export const LESSON_TEMPLATES: LessonTemplate[] = [
  {
    id: "minimal",
    name: "Minimal",
    description: "The simplest skeleton — objective, activity, assessment.",
    fit: "All grades and subjects; quick plans and sub days.",
    sections: [
      [
        "Objective",
        "What will students be able to do by the end of this lesson?",
      ],
      [
        "Activity",
        "Describe the main learning experience — what students will do.",
      ],
      [
        "Assessment",
        "How will you know students met the objective? (exit ticket, observation…)",
      ],
    ].map(([l, p], i) => s("minimal", i, l, p)),
  },
  {
    id: "direct-instruction",
    name: "Direct Instruction",
    description: "Structured, teacher-led instruction for foundational skills.",
    fit: "K–5 core skills; intervention and special education.",
    sections: [
      [
        "Objective & Review",
        "State today's skill and review the prerequisite knowledge it builds on.",
      ],
      [
        "Demonstration",
        "Write your modeling script — clear, precise language and worked examples.",
      ],
      [
        "Guided Practice",
        "List practice items done together with immediate feedback.",
      ],
      [
        "Independent Practice",
        "The independent practice set and the mastery criterion.",
      ],
      [
        "Cumulative Review",
        "Mixed review items from prior lessons; restate today's objective.",
      ],
    ].map(([l, p], i) => s("direct-instruction", i, l, p)),
  },
  {
    id: "gradual-release",
    name: "Gradual Release (I Do / We Do / You Do)",
    description:
      "Responsibility shifts from teacher modeling to shared work to independent practice.",
    fit: "All subjects, all grades — the general-purpose default.",
    recommended: true,
    sections: [
      [
        "Focus Lesson — I Do",
        "Model the skill with a think-aloud. What misconceptions will you address?",
      ],
      [
        "Guided Instruction — We Do",
        "Work examples with the class. What questions will you ask?",
      ],
      [
        "Collaborative Practice — You Do Together",
        "The partner / small-group task; how groups are structured.",
      ],
      [
        "Independent Practice — You Do Alone",
        "The independent task; what mastery looks like.",
      ],
      [
        "Debrief",
        "Bring the class together — what understandings should students articulate?",
      ],
    ].map(([l, p], i) => s("gradual-release", i, l, p)),
  },
  {
    id: "madeline-hunter",
    name: "Madeline Hunter 7-Step",
    description:
      "A clinical, checkable seven-step model of effective instruction.",
    fit: "K–12, all subjects; common in teacher evaluation.",
    sections: [
      [
        "Anticipatory Set",
        "The hook that readies students and connects to prior learning.",
      ],
      [
        "Objective & Purpose",
        "The objective in student-friendly language, and why it matters.",
      ],
      ["Input", "The new information, concepts and vocabulary students need."],
      [
        "Modeling",
        "Demonstrate the skill with a worked example and think-aloud.",
      ],
      [
        "Check for Understanding",
        "The quick check before releasing students to practice.",
      ],
      [
        "Guided Practice",
        "Teacher-supervised practice with immediate corrective feedback.",
      ],
      [
        "Independent Practice / Closure",
        "Independent work and a clear close to the lesson.",
      ],
    ].map(([l, p], i) => s("madeline-hunter", i, l, p)),
  },
  {
    id: "5e",
    name: "5E Model",
    description:
      "A constructivist inquiry cycle — experience before explanation.",
    fit: "Science and STEM, grades 3–10.",
    sections: [
      [
        "Engage",
        "The phenomenon or question that hooks curiosity and surfaces prior ideas.",
      ],
      [
        "Explore",
        "The hands-on investigation students do before being told the explanation.",
      ],
      [
        "Explain",
        "How students share findings; the formal vocabulary and concepts you introduce.",
      ],
      [
        "Elaborate",
        "An extension that applies the concept in a new, more complex context.",
      ],
      ["Evaluate", "Evidence that demonstrates mastery against the objective."],
    ].map(([l, p], i) => s("5e", i, l, p)),
  },
  {
    id: "workshop-ela",
    name: "Workshop Model (ELA)",
    description:
      "A brief mini-lesson, long work time with conferring, then a share.",
    fit: "Reading and writing, grades K–8.",
    sections: [
      ["Connection", "Link today's teaching point to prior learning."],
      [
        "Mini-Lesson",
        "The single teaching point — 'Today I want to teach you that…' — and your demonstration.",
      ],
      [
        "Active Engagement",
        "How students try the strategy briefly before work time.",
      ],
      [
        "Work Time + Conferring",
        "Independent practice; small-group and conference priorities.",
      ],
      [
        "Share",
        "Who shares, the protocol, and how you restate the teaching point.",
      ],
    ].map(([l, p], i) => s("workshop-ela", i, l, p)),
  },
  {
    id: "ubd",
    name: "Understanding by Design",
    description:
      "Backward design — start from the desired understanding and evidence.",
    fit: "All subjects; deeper conceptual and unit-culminating lessons.",
    sections: [
      [
        "Desired Results",
        "The enduring understanding or essential question this lesson serves.",
      ],
      [
        "Assessment Evidence",
        "How students will demonstrate understanding; what 'good enough' looks like.",
      ],
      [
        "Hook",
        "How you engage students and make the lesson's purpose explicit.",
      ],
      [
        "Explore & Equip",
        "The experiences, texts and instruction that equip students to succeed.",
      ],
      [
        "Rethink & Revise",
        "Where students reconsider, revise, or peer-critique their work.",
      ],
      ["Evaluate", "The self-assessment or reflection that closes the lesson."],
    ].map(([l, p], i) => s("ubd", i, l, p)),
  },
  {
    id: "inquiry",
    name: "Inquiry-Based Learning",
    description:
      "Students generate questions and construct knowledge as investigators.",
    fit: "Science and social studies, grades 3–12.",
    sections: [
      [
        "Provocation",
        "The puzzling image, data or object that invites questions.",
      ],
      [
        "Question Generation",
        "How students generate and prioritise their own investigable questions.",
      ],
      [
        "Plan the Investigation",
        "How students decide what to investigate and how.",
      ],
      [
        "Investigation",
        "The investigation itself — lab work, research, data collection.",
      ],
      ["Sense-Making", "How students analyse findings and build explanations."],
      [
        "Communicate",
        "How students share findings and reflect on new questions.",
      ],
    ].map(([l, p], i) => s("inquiry", i, l, p)),
  },
  {
    id: "pbl",
    name: "Project-Based Learning",
    description:
      "Lessons are phases of a project that builds an authentic product.",
    fit: "All subjects, grades 3–12; planned at the unit level.",
    sections: [
      [
        "Entry Event & Driving Question",
        "The launch event and the 'How might we…?' driving question.",
      ],
      [
        "Need-to-Know",
        "What students already know and what they must learn for the product.",
      ],
      [
        "Inquiry & Research",
        "The resources and field experiences that build the needed knowledge.",
      ],
      [
        "Drafting & Prototyping",
        "The product, its first draft, and the exemplars students analyse.",
      ],
      ["Critique & Revision", "The critique protocol and revision cycles."],
      [
        "Public Product",
        "The audience and how students present the final product.",
      ],
      [
        "Reflection",
        "How students reflect on content learning and collaboration.",
      ],
    ].map(([l, p], i) => s("pbl", i, l, p)),
  },
  {
    id: "math-workshop",
    name: "4-Part Math Workshop",
    description:
      "Warm-up, a rich task explored before explanation, discourse, synthesis.",
    fit: "Mathematics, grades K–12 — suggested math default.",
    recommended: true,
    sections: [
      [
        "Warm-Up / Number Routine",
        "The routine — Number Talk, Notice & Wonder, Which One Doesn't Belong?",
      ],
      [
        "Launch",
        "Present the task; clarify context without revealing the solution path.",
      ],
      [
        "Explore",
        "The rich task; anticipated strategies and the questions you'll ask groups.",
      ],
      [
        "Discuss",
        "Which strategies share, in what order, and the connecting questions.",
      ],
      [
        "Consolidate",
        "The key mathematical idea in a sentence; the cool-down / exit ticket.",
      ],
    ].map(([l, p], i) => s("math-workshop", i, l, p)),
  },
  {
    id: "station-rotation",
    name: "Station Rotation / Centers",
    description:
      "Students rotate through stations; the teacher leads a small group.",
    fit: "K–5 literacy and math centers; blended learning.",
    sections: [
      [
        "Whole-Class Launch",
        "The learning goal, station directions and transition signals.",
      ],
      [
        "Teacher Table",
        "The targeted small-group instruction — who, what skill, what to observe.",
      ],
      [
        "Collaborative Station",
        "The partner or group task, roles and success criteria.",
      ],
      [
        "Technology Station",
        "The app or tool, the specific task, and how students show their work.",
      ],
      [
        "Independent Station",
        "The independent task and what early-finishers do.",
      ],
      ["Close & Reflect", "How groups reconvene to share and consolidate."],
    ].map(([l, p], i) => s("station-rotation", i, l, p)),
  },
  {
    id: "siop",
    name: "SIOP (Sheltered Instruction)",
    description:
      "Integrates content learning with explicit language instruction for ELLs.",
    fit: "Any subject with English-language learners present.",
    sections: [
      [
        "Content & Language Objectives",
        "State both: 'Students will be able to…' and the language objective.",
      ],
      [
        "Building Background",
        "Prior knowledge to activate and key vocabulary to pre-teach.",
      ],
      [
        "Comprehensible Input",
        "Visuals, graphic organisers and sentence frames that make input clear.",
      ],
      [
        "Strategies & Practice",
        "The learning strategies taught and the scaffolded practice.",
      ],
      [
        "Interaction",
        "The structured opportunities for students to talk about content.",
      ],
      [
        "Review & Assessment",
        "How you check both the content and the language objective.",
      ],
    ].map(([l, p], i) => s("siop", i, l, p)),
  },
  {
    id: "explicit-instruction",
    name: "Explicit Instruction (Archer & Hughes)",
    description:
      "Tightly sequenced instruction with frequent responses and error correction.",
    fit: "K–8 foundational skills; intervention and special education.",
    sections: [
      [
        "Attention & Objective",
        "The attention signal, the objective, and a concrete rationale.",
      ],
      [
        "Review Prerequisites",
        "The prerequisite skills to check and firm up first.",
      ],
      [
        "Introduce the Skill",
        "The new skill broken into the smallest teachable steps.",
      ],
      [
        "Supported Practice",
        "Practice with immediate, specific corrective feedback; the error-correction routine.",
      ],
      [
        "Independent Practice",
        "The independent set and the fluency / accuracy target for mastery.",
      ],
      [
        "Distributed Review",
        "When and how this skill returns in future lessons.",
      ],
    ].map(([l, p], i) => s("explicit-instruction", i, l, p)),
  },
  {
    id: "el-education",
    name: "EL Education Lesson",
    description:
      "Text-based, evidence-driven lessons that build content and character.",
    fit: "ELA and literacy, grades K–8.",
    sections: [
      [
        "Opening",
        "The protocol that opens the lesson and connects to the guiding question.",
      ],
      [
        "Work Time 1",
        "The core instruction — close reading, discussion or note-taking with a text.",
      ],
      [
        "Work Time 2",
        "The writing or extended-thinking task that applies the learning.",
      ],
      [
        "Debrief & Habits of Character",
        "Reflection on content and on a habit of character.",
      ],
      ["Closing", "The exit ticket — quick evidence against today's targets."],
    ].map(([l, p], i) => s("el-education", i, l, p)),
  },
  {
    id: "notice-wonder",
    name: "Notice & Wonder Math",
    description:
      "Opens with a Notice & Wonder routine before the full math lesson arc.",
    fit: "Mathematics, grades 2–8; strong concept entry point.",
    sections: [
      [
        "Notice & Wonder",
        "The image or expression to display; record noticings and wonderings.",
      ],
      [
        "Task Launch",
        "Introduce the task; clarify context without giving away the approach.",
      ],
      [
        "Individual Think Time",
        "Quiet time for every student to form their own ideas first.",
      ],
      [
        "Partner / Group Work",
        "The discussion prompt and the sentence starters that support argument.",
      ],
      [
        "Whole-Class Discussion",
        "Which strategies share and the ideas you formalise.",
      ],
      [
        "Cool-Down",
        "The 1–2 item cool-down that shows individual understanding.",
      ],
    ].map(([l, p], i) => s("notice-wonder", i, l, p)),
  },
];

/** Template lookup by id. */
export const LESSON_TEMPLATE_BY_ID: Record<string, LessonTemplate> =
  Object.fromEntries(LESSON_TEMPLATES.map((t) => [t.id, t]));

/** The onboarding default — Gradual Release. */
export const DEFAULT_LESSON_TEMPLATE_ID = "gradual-release";
