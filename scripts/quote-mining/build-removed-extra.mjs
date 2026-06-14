// Supplemental off-topic removals found by reviewing the re-derived hero pool
// (finalize re-derives from source, so a few quotes that were cap-excluded at
// 13-batch-review time get re-admitted unreviewed). Each entry is matched by a
// distinctive lowercased substring against the current bank to capture the
// exact normalized key + metadata. Output unions with removed-quotes.json in
// finalize-bank.mjs.
//
// IMPORTANT — this reads lib/home/insights.data.json, which finalize writes
// AFTER applying removed-extra.json. So once a quote is removed it disappears
// from the bank and its pattern will read MISS on the next run. We handle that
// by ACCUMULATING (seed from the existing removed-extra.json; never drop), so
// re-running is monotonic and safe. To regenerate the list cleanly from an
// UNFILTERED bank (e.g. to re-validate every pattern):
//   1) echo "[]" > removed-extra.json
//   2) node finalize-bank.mjs          # bank now has the residuals back
//   3) node build-removed-extra.mjs    # every pattern matches against full bank
//   4) node finalize-bank.mjs          # apply the rebuilt list
//
//   node scripts/quote-mining/build-removed-extra.mjs
import fs from "node:fs";
import path from "node:path";

const QM = "C:\\Users\\losey\\Projects\\mycurricula.app\\scripts\\quote-mining";
const LIB = "C:\\Users\\losey\\Projects\\mycurricula.app\\lib\\home";
const norm = (s) => (s || "").replace(/\s+/g, " ").trim();

// [substring (lowercase, ascii-safe), rule] — judged against the user's strict
// calibration: directly about teaching / learning / education-&-team leading /
// classroom management only; cut politics, controversy, AI-futurism, off-topic
// analogies, and news/reference fragments.
const PATTERNS = [
  // politics / controversy
  ["my daughters did not go to school for a year and a half", "politics"],
  ["in red states, you get free money for the school", "politics"],
  ["progressive education reformers like weingarten", "politics"],
  ["the victims of covid and school closures", "controversial"],
  ["in-person school is still better than learning remotely on screen", "controversial"],
  ["children are uncivilized little beasts", "controversial"],
  ["there are many ways to divide up the sides of the education debates", "controversial"],
  ["premise 1: all human beings have equal worth", "controversial"],
  ["big state at the bottom with 40 electoral votes", "off-topic"],
  ["england made big reforms to its education system, and mental health", "off-topic"],
  // AI futurism / edtech discourse (not concrete pedagogy)
  ["the promise of models like alpha", "edtech-politics"],
  ["most ai literacy curricula begin and end with the same lesson", "edtech-politics"],
  ["the ai crisis in education is not that students suddenly", "edtech-politics"],
  ["when ai can produce polished written work on demand", "edtech-politics"],
  ["ai tools are amplifiers of human input", "edtech-politics"],
  ["post-graduate communication outside academia", "edtech-politics"],
  ["every person will spend far more time speaking, presenting", "edtech-politics"],
  ["58% of secondary teachers said they had suspected a student of using ai", "edtech-politics"],
  ["nuance is an overused word to describe", "edtech-politics"],
  ["high-quality apps like khan academy", "edtech-politics"],
  ["motivated to play online games tend to display higher imagination", "off-topic"],
  // futurism / what-are-we-building
  ["what are we building in its place", "edtech-politics"],
  // off-topic analogies & anecdotes
  ["airlines do not make flying comfortable", "off-topic"],
  ["the boys did quarrel, but they developed ways of resolving", "off-topic"],
  ["if you want to get kids to like the woods", "off-topic"],
  ["while competitors ran animated features, rogers stuck to physical sets", "off-topic"],
  ["is the core demon of rocky", "off-topic"],
  ["every time i read of a new survey showing how restricted american children", "off-topic"],
  ["chiron complicates this", "off-topic"],
  // news / reference / out-of-context fragments
  ["the failure calmatters found is real", "fragment"],
  ["the fordham report is exhibit 729", "fragment"],
  ["the teacher wellbeing index 2025 points to accumulation", "fragment"],
  ["i guarantee that you will report much higher", "fragment"],
  ["students using classroom devices are off-task as much as 38 minutes", "fragment"],
  ["all of our worst ideas about what education actually is have come", "off-topic"],
  ["districts to both create and implement great policies", "off-topic"],
  ["districts across virginia may be just a little too choosy", "off-topic"],
  ["of incoming students needed remedial math", "fragment"],
  ["the convenience these tools afford is real, but so are the costs", "fragment"],
  // second-pass residuals (refills surfaced after the first supplemental cut)
  ["when the authors sorted the effects of khan academy implementation", "edtech-politics"],
  ["public schools have the power to bridge these gaps between the haves", "off-topic"],
  ["the striking feature of all of this data is the similarity of the three countries", "off-topic"],
  ["for novice teachers, that mentoring relationship is irreplaceable", "edtech-politics"],
  ["that is trap number one: cognitive outsourcing", "edtech-politics"],
  ["outsourcing -- asking ai to explain, summarise, write", "edtech-politics"],
];

// Source-level blocks: works/authors that are categorically about AI, futurism,
// or policy rather than timeless teaching wisdom. They refill the hero pool with
// off-topic quotes faster than quote-level cuts can converge, so we drop them
// wholesale (match against work OR author). Mixed sources (Barton, Aldeman,
// Greene, Christodoulou) are NOT blocked — they're handled quote-by-quote.
const SOURCE_BLOCK = [
  [/evolving education/i, "edtech-politics"],
  [/\bai learn insights\b/i, "edtech-politics"],
  [/\bai edu simplified\b/i, "edtech-politics"],
  [/bauschard/i, "edtech-politics"],
];

const bank = JSON.parse(fs.readFileSync(path.join(LIB, "insights.data.json"), "utf8"));

// Accumulate: finalize FILTERS insights.data.json by this very file, so once a
// quote is removed it's gone from the bank and a fresh match would lose it.
// Seed from the existing file so re-running only ever ADDS — monotonic + safe.
const out = [];
const seen = new Set();
try {
  for (const r of JSON.parse(fs.readFileSync(path.join(QM, "removed-extra.json"), "utf8"))) {
    if (!seen.has(r.key)) {
      seen.add(r.key);
      out.push(r);
    }
  }
} catch {
  /* first run — no existing file */
}
const carried = out.length;
const report = [];
const add = (r, rule, reason) => {
  const key = norm(r.quote).toLowerCase();
  if (seen.has(key)) return false;
  seen.add(key);
  out.push({
    key,
    category: r.category,
    rule,
    reason,
    quote: r.quote,
    author: r.author || null,
    work: r.work || null,
  });
  return true;
};

const multi = [];
for (const [sub, rule] of PATTERNS) {
  const hits = bank.filter((r) => r.quote.toLowerCase().includes(sub));
  // A pattern that matches >1 distinct quote is ambiguous — removing all hits
  // could silently drop a legitimate quote. Refuse to remove on MULTI and fail
  // loudly (below) so the substring gets tightened. MISS is fine: the quote was
  // already removed on a prior run (we accumulate) or the pattern needs fixing.
  if (hits.length > 1) {
    multi.push(`${sub} → ${hits.length}`);
    report.push(`MULTI (${hits.length}) ${sub}`);
    continue;
  }
  report.push(`${hits.length === 1 ? "ok " : "MISS"} (${hits.length}) ${sub}`);
  for (const r of hits) add(r, rule, "hero-pool residual (re-derived, unreviewed)");
}

// Source-level blocks.
for (const [re, rule] of SOURCE_BLOCK) {
  let n = 0;
  for (const r of bank) {
    if (re.test(r.work || "") || re.test(r.author || "")) n += add(r, rule, "off-topic source (AI/futurism/policy)") ? 1 : 0;
  }
  report.push(`src (${n}) ${re}`);
}

fs.writeFileSync(path.join(QM, "removed-extra.json"), JSON.stringify(out, null, 2));
console.log(report.join("\n"));
console.log(`\nremoved-extra.json: ${out.length} quotes (carried ${carried} from prior run; ${PATTERNS.length} patterns + ${SOURCE_BLOCK.length} source blocks)`);
const misses = report.filter((r) => r.startsWith("MISS"));
if (misses.length) console.log(`\n${misses.length} MISS (no match — already removed on a prior run, or a typo to fix):\n` + misses.join("\n"));
if (multi.length) {
  // Ambiguous patterns were NOT removed (see loop above) — fail the run so the
  // substrings get tightened before anything over-broad slips in.
  console.error(`\nERROR: ${multi.length} pattern(s) matched >1 quote and were SKIPPED to avoid over-removal — tighten them:\n` + multi.join("\n"));
  process.exitCode = 1;
}
