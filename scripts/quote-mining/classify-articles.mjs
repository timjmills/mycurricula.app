// One-off classifier for the quote-bank insight categories.
// Maps each article in articles-index.json -> one of four buckets:
//   "classroom culture" | "learning" | "teaching" | "leading"
// Strategy (ordered, first decisive signal wins):
//   1. Source/author family map  (recurring newsletters are the strongest signal)
//   2. Title keyword scoring      (for education pieces where source is generic)
//   3. Per-source default          (e.g. an unknown-title leadership newsletter -> leading)
//   4. Global fallback -> "teaching" (the modal education bucket)
//
// NOTE: deterministic + auditable. Run with: node classify-articles.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT = join(__dirname, "output", "articles-index.json");
const OUTPUT = join(__dirname, "output", "article-categories.json");

const CC = "classroom culture";
const LRN = "learning";
const TCH = "teaching";
const LEAD = "leading";

const articles = JSON.parse(readFileSync(INPUT, "utf8"));

// --- Soft-default source families ---------------------------------------
// These sources have a *house beat* but publish across categories (school-
// improvement writers who also dip into pedagogy/curriculum/learning, or
// curriculum-science writers who also dip into policy). For these, run title
// keyword scoring FIRST; only fall back to the listed default if the title is
// uninformative. Keyed by lowercased substring in source/author/url.
const SOFT_DEFAULT_RULES = [
  ["dominic salles", LEAD],
  ["dominic's school improvement", LEAD],
  ["dominicsalles", LEAD],
  ["minding the gap", LRN], // Wexler: knowledge/reading-science by default, policy titles -> leading
  ["it's about learning", LEAD],
  ["its about learning", LEAD],
  ["aldeman", LRN], // Chad Aldeman: how-kids-learn/what-works by default, system/policy titles -> leading
  ["chadaldeman", LRN],
  ["restarting school", LEAD],
  ["restartingschool", LEAD],
];

// --- 1. Source / author family map --------------------------------------
// Keyed by a lowercased substring that appears in source OR author.
// These are recurring publications whose beat is unambiguous. Order matters:
// the first matching entry wins, so put more specific keys before generic ones.
const SOURCE_RULES = [
  // ---- General leadership / management / self-leadership newsletters → leading
  ["admired leadership", LEAD],
  ["the good boss", LEAD],
  ["thegoodboss", LEAD],
  ["business leader daily", LEAD],
  ["thebusinessleaderdaily", LEAD],
  ["best leadership newsletter", LEAD],
  ["thebestleadershipnewsletter", LEAD],
  ["lead with kelly", LEAD],
  ["leadwithkelly", LEAD],
  ["lead with kelly mcginnis", LEAD],
  ["managing the future", LEAD],
  ["managingthefuture", LEAD],
  ["greg mckeown", LEAD],
  ["gregmckeown", LEAD],
  ["1-minute wednesday", LEAD],
  ["scott d. clary", LEAD],
  ["scott clary", LEAD],
  ["scottdclary", LEAD],
  ["scott's newsletter", LEAD],
  ["aaron renn", LEAD],
  ["aaronrenn", LEAD],
  ["the masculinist", LEAD],
  ["arthur brooks", LEAD],
  ["arthurbrooks", LEAD],
  ["how to build a life", LEAD],
  ["the meaning of your life", LEAD],
  ["art and science of happiness", LEAD],
  ["pursuit of happiness", LEAD],
  ["kathleen schafer", LEAD],
  ["kathleenschafer", LEAD],
  ["extraordinarily ordinary", LEAD],
  ["leadership connection", LEAD],
  ["on leading with greatness", LEAD],
  ["rookie to pro", LEAD],
  ["kurtmueller", LEAD],
  ["pursuing pragmatic leadership", LEAD],
  ["summer mulder", LEAD],
  ["summermulder", LEAD],
  ["the operating core", LEAD],
  ["honest office", LEAD],
  ["honestoffice", LEAD],
  ["lead you first", LEAD],
  ["leadyoufirst", LEAD],
  ["molly graham", LEAD],
  ["adam grant", LEAD],
  ["andrea chiarelli", LEAD],
  ["andreachiarelli", LEAD],
  ["the art of asking questions", LEAD],
  ["leadership capability system", LEAD],
  ["engineering leadership", LEAD],
  ["eng-leadership", LEAD],
  ["leading in product", LEAD],
  ["pmresearcher", LEAD],
  ["pm researcher", LEAD],
  ["the critical path", LEAD],
  ["datapreneurs", LEAD],
  ["intrapreneurship", LEAD],
  ["roberto ferraro", LEAD],
  ["richardclaydon", LEAD],
  ["richard claydon", LEAD],
  ["make work better", LEAD],
  ["business practices", LEAD],
  ["chrismartin.fyi", LEAD],
  ["chris martin", LEAD],
  ["language for leadership", LEAD],
  ["good boss", LEAD],
  ["leadership and life", LEAD],
  ["leadership handbook", LEAD],
  ["a change is gonna come", LEAD],
  ["empathy elevated", LEAD],
  ["empathyelevated", LEAD],
  ["the silent struggle", LEAD],
  ["self-disciplined", LEAD],
  ["resilient mental state", LEAD],
  ["the stoic manual", LEAD],
  ["thestoicmanual", LEAD],
  ["drstoicwisdom", LEAD],
  ["dr stoic wisdom", LEAD],
  ["daily stoic", LEAD],
  ["the inner call", LEAD],
  ["tim draayer", LEAD],
  ["mini philosophy", LEAD],
  ["miniphilosophy", LEAD],
  ["jamesclear", LEAD],
  ["james clear", LEAD],
  ["sahilbloom", LEAD],
  ["sahil bloom", LEAD],
  ["superhabit", LEAD],
  ["radical conformity", LEAD],
  ["the culturist", LEAD],
  ["civic renaissance", LEAD],
  ["digital liturgies", LEAD],
  ["conversation and public speaking", LEAD],
  ["ispublicspeaking", LEAD],
  ["wonder tools", LEAD],
  ["braincentric", LEAD],
  ["brain-centric", LEAD],
  ["foster chance", LEAD],
  ["ponderingmoore", LEAD],
  ["pondering moore", LEAD],
  ["by title only", LEAD],
  ["caseymccall", LEAD],
  ["casey mccall", LEAD],
  ["wyatt graham", LEAD],
  ["patrickwhalen", LEAD],
  ["patrick whalen", LEAD],
  ["josh brake", LEAD],
  ["joshbrake", LEAD],
  ["simple men", LEAD],
  ["rebecca lowman", LEAD],
  ["the libero", LEAD],

  // ---- Education leadership / school-improvement / reform / policy → leading
  ["admiredleadership", LEAD],
  ["nick hart", LEAD],
  ["mrnickhart", LEAD],
  ["nickhart", LEAD],
  ["school improvement", LEAD],
  ["systemic principal", LEAD],
  ["ed-celerated leader", LEAD],
  ["chrisobrienedu", LEAD],
  ["chris o'brien edu", LEAD],
  ["schooled by mike petrilli", LEAD],
  ["schooled on substack", LEAD],
  ["mike petrilli", LEAD],
  ["fordham", LEAD],
  ["omullins", LEAD], // Fordham-report / policy-is-not-progress critiques
  ["curmudgucation", LEAD],
  ["old school with rick hess", LEAD],
  ["rick hess", LEAD],
  ["education next", LEAD],
  ["leading and learning conversations", LEAD],
  ["regenerative schools", LEAD],
  ["regenerativeschools", LEAD],
  // ---- Ed-tech market / systems / higher-ed economics → leading
  ["on edtech", LEAD],
  ["onedtech", LEAD],
  ["phil hill", LEAD],
  ["phil on ed tech", LEAD],
  ["philhill", LEAD],
  ["michael b. horn", LEAD],
  ["michaelbhorn", LEAD],
  ["michael horn", LEAD],
  ["first fish", LEAD],
  ["firstfish", LEAD],
  ["anthony b. bradley", LEAD], // society/policy "Weekly Top Five" essays
  ["anthony bradley", LEAD],
  ["anthonybbradley", LEAD],
  ["bradley, anthony", LEAD],
  ["national affairs", LEAD],
  ["leadership", LEAD], // catch generic "...Leadership" sources late

  // ---- Reading / literacy science → learning (it's about how reading works)
  ["shanahan on literacy", LRN],
  ["timothy shanahan", LRN],
  ["timothyshanahan", LRN],
  ["making words make sense", LRN],
  ["harriettjanetos", LRN],
  ["harriett janetos", LRN],
  ["readwritejen", LRN],
  ["science of reading classroom", TCH], // classroom application of SoR → teaching
  ["scienceofreadingclassroom", TCH],
  ["secondary literacy commons", TCH],
  ["school yourself", LRN], // Karen Vaites "Latest in Literacy" digests
  ["karenvaites", LRN],

  // ---- Learning science / cognition newsletters → learning
  ["the learning dispatch", LRN],
  ["carlhendrick", LRN],
  ["carl hendrick", LRN],
  ["the bell ringer", LRN],
  ["bell ringer", LRN],
  ["holly korbey", LRN],
  ["hollykorbey", LRN],
  ["science of learning", LRN],
  ["the science of learning", LRN],
  ["the science of explanation", LRN],
  ["science of explanation", LRN],
  ["scienceofexplanation", LRN],
  ["memory and metacognition", LRN],
  ["jonathan firth", LRN],
  ["paul kirschner", LRN],
  ["kognitivo", LRN],
  ["lifelong learning club", LRN],
  ["evakeiffenheim", LRN],
  ["eva keiffenheim", LRN],
  ["the brain and learning", LRN],
  ["mind, learning and education", LRN],
  ["the nature of learning", LRN],
  ["from speculation to science", LRN],
  ["terry underwood", LRN],
  ["terry u ", LRN],
  ["cognitive resonance", LRN],
  ["conspicuous cognition", LRN],
  ["tomstafford", LRN],
  ["tom stafford", LRN],
  ["the learning cue", LRN],
  ["lead time", LRN],
  ["leadtime", LRN],
  ["edulore", LRN],

  // ---- Pedagogy / instruction practitioner newsletters → teaching
  ["teach like a champion", TCH],
  ["doug lemov", TCH],
  ["dremanuele", TCH],
  ["dr emanuele", TCH],
  ["dr. emanuele", TCH],
  ["emanuele on teaching", TCH],
  ["sol in the wild", TCH],
  ["solinthewild", TCH],
  ["teacherhead", TCH],
  ["teacher head", TCH],
  ["tips for teachers", TCH],
  ["tipsforteachers", TCH],
  ["knowledge for teachers", TCH],
  ["teaching on purpose", TCH],
  ["adam kohlbeck", TCH],
  ["adamkohlbeck", TCH],
  ["chiltern learning trust", TCH],
  ["cognitive coaching", TCH],
  ["cognitivecoaching", TCH],
  ["education rickshaw", TCH],
  ["distilled", TCH], // DistillED / The Distilled Newsletter (pedagogy)
  ["distilled newsletter", TCH],
  ["jamieleeclark", TCH],
  ["thinking deeply about primary", TCH],
  ["thinking deeply about primary education", TCH],
  ["five twelve thirteen", TCH],
  ["fivetwelvethirteen", TCH],
  ["fantastic maths", TCH],
  ["mutually assured instruction", CC], // behaviour/routines beat → classroom culture
  ["mutallyassuredinstruction", CC],
  ["smart classroom management", CC],
  ["challenge accepted", TCH],
  ["benzulauf", TCH],
  ["wagoll", TCH],
  ["dave stuart", CC], // motivation/relationships/teacher-life → classroom culture
  ["davestuartjr", CC],
  ["filling the pail", TCH],
  ["fillingthepail", TCH],
  ["greg ashman", TCH],
  ["ashman, greg", TCH],
  ["learning spy", TCH],
  ["david didau", TCH],
  ["daviddidau", TCH],
  ["becky allen", LRN],
  ["profbeckyallen", LRN],
  ["prof becky allen", LRN],
  ["shaunallison", TCH],
  ["shaun allison", TCH],
  ["dylan wiliam", TCH],
  ["no more marking", LRN], // assessment-of-learning measurement beat
  ["nomoremarking", LRN],
  ["100% assessment", LRN],
  ["100assessment", LRN],
  ["dan meyer", TCH],
  ["danmeyer", TCH],
  ["mathworlds", TCH],
  ["craig barton", TCH],
  ["barton, craig", TCH],
  ["eedi", TCH],
  ["education endowment foundation", LRN],
  ["stephen vainker", LRN], // research-integrity / science-of-education critique
  ["stephenvainker", LRN],
  ["the disruptive educator", TCH],
  ["thedisruptiveeducator", TCH],
  ["lauren brown on education", LRN],
  ["laurenbrownoned", LRN],
  ["one educated educator", LRN],
  ["the patrick dempsey", LRN], // AI-and-learning philosophy
  ["thepatrickdempsey", LRN],
  ["how to teach with ai", TCH],
  ["howtoteachwithai", TCH],
  ["wise ai", TCH],
  ["paul matthews", TCH],
  ["paulmatthews", TCH],
  ["educating ai", LRN],
  ["nickpotkalitsky", LRN],
  ["nick potkalitsky", LRN],
  ["ai edu simplified", LRN],
  ["aiedusimplified", LRN],
  ["ai+edu", LRN],
  ["ai learn insights", LRN],
  ["ailearninsights", LRN],
  ["the digital delusion", LRN],
  ["katherinemartinko", LRN],
  ["after babel", CC], // Haidt — childhood/phones/social climate
  ["jonathan haidt", CC],
  ["peter gray", CC],
  ["petergray", CC],
  ["play makes us human", CC],
  ["free to learn", CC],
  ["quest for learning", LRN],
  ["shari keller", LRN],
  ["kevin stinehart", CC], // "Architecture of Childhood" — development/wellbeing/play
  ["kevinstinehart", CC],
  ["rebecca birch", TCH],
  ["classical ed review", LRN],
  ["classicaledreview", LRN],
  ["renewing classical education", LRN],
  ["christopher perrin", LRN],
  ["christopherperrin", LRN],
  ["the trivium", LRN],
  ["special education today", LRN],
  ["unstoppable learning", TCH],
  ["terry yu", LRN],
  ["terryu", LRN],
  ["terry y", LRN],
  ["it's about learning", LEAD], // school-of-givers / improvement beat
  ["its about learning", LEAD],
  ["the next 30 years", LRN],
  ["thenext30years", LRN],
  ["learning to read, reading to learn", LRN],
  ["matthew evans education", LEAD],
  ["matthewevanseducation", LEAD],
  ["oracy", TCH],
  ["mary myatt", TCH],
  ["marymyatt", TCH],
  ["curriculum 101", TCH],
  ["rod naquin", TCH],
  ["rodjnaquin", TCH],
  ["episcopal academy ctl", TCH],
  ["episcopalacademyctl", TCH],
  ["the beacon", TCH],
  ["stefan bauschard", LRN], // AI-in-education futures/cognition
  ["stefanbauschard", LRN],
  ["stefan-bauschard", LRN],

  // ---- Research journals / psych / neuroscience outlets → learning
  ["psypost", LRN],
  ["neuroscience news", LRN],
  ["frontiers in", LRN],
  ["journal of population economics", LRN],
  ["nature,", LRN],
  ["nature, ", LRN],
  ["harvard gazette", LRN],
  ["aeon", LRN],
  ["the great smoking divide", LRN],

  // ---- AI-and-education / nature-of-learning & thinking commentators → learning
  ["the last analogue", LRN],
  ["thelastanalogue", LRN],
  ["the future of thinking", LRN],
  ["greg o'keefe", LRN],
  ["gregokeefe", LRN],
  ["grego keefe", LRN],
  ["grego keefe,", LRN],
  ["the augmented educator", LRN],
  ["rhetorica", LRN],
  ["principled knowledge", LRN],
  ["expanding dialogic space", LRN],
  ["rupert wegerif", LRN],
  ["the brain and learning", LRN],
  ["wexler", LRN], // Natalie Wexler standalone byline -> reading/knowledge science
  ["natalie wexler", LRN],
  ["edthreads", LRN],
  ["ed threads", LRN],
  ["ollie lovell", LRN],
  ["what schools forget", LRN],
  ["unstoppable learning", LRN],
  ["uniquely ethical", LRN],

  // ---- Reading / literacy practitioners → teaching|learning
  ["samantha lippert", LRN], // reading-fluency science
  ["samanthalippert", LRN],
  ["francescorocchi", TCH], // AI marking / classroom practice
  ["francesco rocchi", TCH],
  ["textsavvy", LRN], // "thinking about thinking" cognition
  ["text savvy", LRN],

  // ---- Misc pedagogy / curriculum practitioners → teaching
  ["curious pedagogy", TCH],
  ["pedagogy geek", TCH],
  ["elana", TCH],
  ["elana270", TCH],
  ["joel kenyon", TCH],
  ["joel120193", TCH],
  ["peterm8", TCH],
  ["laura burke", TCH],
  ["walled garden", TCH],
  ["the axes curriculum", TCH],
  ["michelecaracappa", TCH],
  ["caracappa", TCH],
  ["douglas carnine", LRN], // direct-instruction / learning science
  ["douglascarnine", LRN],
  ["scientists in the making", TCH],
  ["scientistsinthemaking", TCH],
  ["bell ringers", LRN], // "Bell Ringers" literacy/math-science newsletter
  ["give spark", LRN],
  ["givespark", LRN],
  ["zach groshell", TCH],
  ["gregokeefe", LRN],
  ["think forward educators", LRN],
  ["evolving education", LEAD], // "If We Redesign School What Should We Build" -> systems
  ["alpha schools", LEAD],
  ["teach students, not classes", TCH],
  ["teachstudentsnotclasses", TCH],
  ["b. geoghegan", LRN],
  ["bgeoghegan", LRN],
  ["beanie's blog", LRN],
  ["katielmartin", CC], // "Why So Many Kids Are Checking Out" -> engagement/culture
  ["katie's substack", CC],
  ["curriculum insight project", LRN],
  ["curriculum has a current", TCH],
  ["secondary literacy", TCH],
  ["colton cauthen", LRN], // "How to Read Twice as Much" -> reading/learning
  ["morning light", LRN],
  ["nature of learning", LRN],
  ["five twelve thirteen", TCH],

  // ---- AI-philosophy / faith-and-education / society essays → learning|leading
  ["you are not your own", LRN], // Alan Noble - AI cheating as failure to love (motivation/learning)
  ["oalannoble", LRN],
  ["mere orthodoxy", LRN], // why history matters / moral hunger in classroom
  ["the new critic", LRN],
  ["los angeles review of books", LRN],
  ["philippa hardman", TCH], // course/instructional design
  ["eric hudson", TCH],
  ["erichudson", TCH],
  ["humanitas institute", TCH],
  ["humanitasinstitute", TCH],
  ["schools of thought", LRN],
  ["the operating core", LEAD],
  ["a systems problem", LEAD],

  // ---- Remaining identifiable bylines / sources
  ["jolein", LEAD], // Jo Lein - leadership/career
  ["jo lein", LEAD],
  ["richard wheadon", CC], // behaviour ("fences because children run", Skinner & behaviour)
  ["mrsk04", CC], // reading-for-pleasure / teacher-life reflections
  ["rod naquin", TCH],
  ["naquin, rod", TCH],
  ["matthews, paul", TCH], // Wise AI / Paul Matthews
  ["andrewold", LEAD], // workplace/management commentary
  ["andrew old", LEAD],
  ["ai, academia, and the future", LRN],
];

// --- 2. Title keyword scoring -------------------------------------------
// Used only when no source rule matched. Lowercased title is scored against
// each bucket's keyword list; highest score wins; ties broken by priority
// order [TCH, LRN, CC, LEAD] (teaching is the modal education bucket).
const TITLE_KEYWORDS = {
  [CC]: [
    "behaviour", "behavior", "behave", "classroom management", "discipline",
    "routine", "relationship", "belonging", "community", "culture of",
    "engagement", "motivat", "boredom", "wellbeing", "well-being",
    "burnout", "childhood", "playground", "play", "phone ban", "screen time",
    "social media", "friends", "friendship", "trust", "self-regulation",
    "resilience", "grit", "agency", "boundaries", "ragged start", "do now",
    "narrate what you see", "cold call", "praise",
  ],
  [LRN]: [
    "how students learn", "how people learn", "how learning", "learn",
    "memory", "memori", "retrieval", "forgetting", "cognit", "cognition",
    "knowledge matters", "prior knowledge", "schema", "spaced repetition",
    "reading", "literacy", "phonics", "comprehension", "vocabulary",
    "decoding", "fluency", "science of reading", "science of learning",
    "science of math", "math readiness", "math anxiety", "assessment",
    "exam", "grade", "grading", "test", "rubric", "marking",
    "understanding", "metacognition", "working memory", "cognitive load",
    "generation effect", "the mind", "pattern recognition", "executive function",
    "deep processing", "intelligence", "thinking",
  ],
  [TCH]: [
    "teach", "teaching", "instruction", "explicit instruction", "explanation",
    "explain", "modelling", "modeling", "questioning", "question",
    "feedback", "differentiat", "curriculum", "lesson", "pedagog",
    "worked example", "scaffold", "direct instruction", "inquiry",
    "guided", "practice", "fluency drill", "textbook", "slides",
    "whiteboard", "do now", "retrieval practice", "formative",
    "write essays", "writing", "five-paragraph", "coaching", "modelling",
    "instructional", "planning lessons", "plan lessons", "diagrams",
  ],
  [LEAD]: [
    "leader", "leadership", "manage", "manager", "management", "coaching",
    "team", "staff", "school improvement", "reform", "policy", "system",
    "strategy", "strategic", "inspection", "vouchers", "charter",
    "district", "principal", "professional development", "decision",
    "promotion", "meetings", "ceo", "boss", "performance", "succession",
    "organization", "organisation", "school reform", "ed reform",
  ],
};

const lc = (s) => (s || "").toLowerCase();

// Strong classroom-culture title phrases. When a title contains one of these,
// the piece is about behaviour / relationships / belonging / engagement-as-
// climate / teacher-wellbeing, and that overrides a generic-pedagogy source
// default (but NOT an unambiguous leadership/learning-science source — we only
// apply this override when the source-derived category is teaching or learning).
const CC_TITLE_OVERRIDES = [
  "belonging",
  "student motivation",
  "intrinsic motivation",
  "aren't engaged",
  "checking out of school",
  "teacher burnout",
  "breaking the chain of teacher burnout",
  "why your students don't like you",
  "never ever be friends with students",
  "behaviour",
  "restorative",
  "boundaries",
];

function ccTitleOverride(title) {
  const t = lc(title);
  if (!t || t === "?") return null;
  for (const w of CC_TITLE_OVERRIDES) {
    if (t.includes(w)) return CC;
  }
  return null;
}

function classifySoftDefault(haystack) {
  for (const [needle, cat] of SOFT_DEFAULT_RULES) {
    if (haystack.includes(needle)) return cat;
  }
  return null;
}

function classifyBySource(haystack) {
  for (const [needle, cat] of SOURCE_RULES) {
    if (haystack.includes(needle)) return cat;
  }
  return null;
}

function classifyByTitle(title) {
  const t = lc(title);
  if (!t || t === "?") return null;
  const scores = { [CC]: 0, [LRN]: 0, [TCH]: 0, [LEAD]: 0 };
  for (const [cat, words] of Object.entries(TITLE_KEYWORDS)) {
    for (const w of words) {
      if (t.includes(w)) scores[cat] += 1;
    }
  }
  const order = [TCH, LRN, CC, LEAD];
  let best = null;
  let bestScore = 0;
  for (const cat of order) {
    if (scores[cat] > bestScore) {
      bestScore = scores[cat];
      best = cat;
    }
  }
  return bestScore > 0 ? best : null;
}

const out = {};
const debug = [];
let nSource = 0, nTitle = 0, nFallback = 0;

let nSoft = 0;
let nCcOverride = 0;
for (const a of articles) {
  if (a.error) continue;
  const haystack = lc(`${a.source || ""} ${a.author || ""} ${a.url || ""}`);
  let cat = null;
  let how = null;

  // (a) Soft-default families: title scoring wins; source supplies the default.
  const soft = classifySoftDefault(haystack);
  if (soft) {
    const byTitle = classifyByTitle(a.title);
    cat = byTitle || soft;
    how = byTitle ? "soft-title" : "soft-default";
  }

  // (b) Unambiguous source families.
  if (!cat) {
    cat = classifyBySource(haystack);
    if (cat) how = "source";
  }

  // (c) Title keyword scoring.
  if (!cat) {
    cat = classifyByTitle(a.title);
    if (cat) how = "title";
  }

  // (d) Global fallback.
  if (!cat) {
    cat = TCH; // modal education bucket
    how = "fallback";
  }

  // (e) Classroom-culture title override: only upgrades teaching/learning
  // results (never leadership or an explicit-CC result) to classroom culture.
  if ((cat === TCH || cat === LRN) && ccTitleOverride(a.title)) {
    cat = CC;
    how = `${how}->cc`;
  }

  const base = how.replace("->cc", "");
  if (base === "source") nSource++;
  else if (base === "title") nTitle++;
  else if (base === "soft-title" || base === "soft-default") nSoft++;
  else if (base === "fallback") nFallback++;
  if (how.endsWith("->cc")) nCcOverride++;
  out[a.file] = cat;
  debug.push(`${cat}\t${how}\t${a.title || "?"} :: ${a.source || a.author || "?"}`);
}

writeFileSync(OUTPUT, JSON.stringify(out, null, 2) + "\n", "utf8");

// distribution
const dist = {};
for (const v of Object.values(out)) dist[v] = (dist[v] || 0) + 1;
console.log("=== Category distribution ===");
for (const k of [CC, LRN, TCH, LEAD]) {
  console.log(`${k}: ${dist[k] || 0}`);
}
console.log("total:", Object.keys(out).length);
console.log(`(by source: ${nSource}, soft: ${nSoft}, by title: ${nTitle}, fallback: ${nFallback}, cc-overrides: ${nCcOverride})`);

if (process.env.DEBUG) {
  writeFileSync(join(__dirname, "output", "_classify-debug.txt"), debug.join("\n") + "\n", "utf8");
}
