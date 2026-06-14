// Categorize quotes into: classroom culture · learning · teaching · leading.
// Title/work-DOMINANT scoring (the source's topic is a far better signal than
// noisy per-quote keywords) with tightened keyword lists. Argmax wins; 0 hits →
// "other". Light filtering + global exact-text dedupe. Also reports per-category
// source diversity (distinct works + top-work share) so we can keep the spread
// even (no single resource dominates — except classroom culture may lean on
// Michael Linsin per the user).
//
// Run:  node scripts/quote-mining/categorize.mjs
import fs from "node:fs";
import path from "node:path";

const OUT = path.join("C:\\Users\\losey\\Projects\\mycurricula.app", "scripts", "quote-mining", "output");
const raw = JSON.parse(fs.readFileSync(path.join(OUT, "articles-quotes-raw.json"), "utf8"));

// Tightened, topic-specific keyword lists (substring match on lowercased text).
const CATS = {
  "classroom culture": [
    "classroom management", "smart classroom", "behavior", "behaviour", "discipline",
    "misbehav", "off-task", "routine", "procedure", "expectations", "relationship",
    "rapport", "belonging", "restorative", "consequence", "classroom community",
    "calm classroom", "manage the classroom", "well-managed", "rules", "respect",
  ],
  learning: [
    "how students learn", "science of learning", "how people learn", "how the brain",
    "memory", "retrieval", "retention", "cognitive", "cognition", "metacognit",
    "working memory", "prior knowledge", "forgetting", "spaced", "spacing", "interleav",
    "schema", "mastery", "comprehension", "how we learn", "long-term memory", "recall",
    "deliberate practice", "learning happens",
  ],
  teaching: [
    "teaching", "instruction", "instructional", "pedagog", "lesson", "explanation",
    "modeling", "scaffold", "questioning", "differentiat", "formative assessment",
    "feedback", "worked example", "explicit instruction", "vocabulary", "fluency",
    "rubric", "direct instruction", "curriculum", "dual coding", "guided practice",
  ],
  leading: [
    "leadership", "leader", "principal", "headteacher", "administrator", "school improvement",
    "professional development", "professional learning communit", "instructional leadership",
    "coaching", "staff", "school culture", "reform", "accountab", "district", "superintendent",
    "schoolwide", "mission", "vision", "data-driven",
  ],
};
const PRIORITY = ["leading", "classroom culture", "teaching", "learning"];

function score(text, kws) {
  const t = (text || "").toLowerCase();
  let n = 0;
  for (const kw of kws) if (t.includes(kw)) n++;
  return n;
}

function classify(rec) {
  // Weighted across the source's title (strong signal), the article summary
  // (rich thematic words → restores coverage), and the quote body.
  const parts = [
    [rec.work || "", 3],
    [rec.expand || "", 2],
    [rec.text || "", 1],
  ];
  let best = "other";
  let bestN = 0;
  for (const cat of PRIORITY) {
    let total = 0;
    for (const [txt, w] of parts) total += score(txt, CATS[cat]) * w;
    if (total > bestN) {
      bestN = total;
      best = cat;
    }
  }
  return bestN > 0 ? best : "other";
}

const seen = new Set();
const kept = [];
let dropped = 0;
for (const r of raw) {
  const t = (r.text || "").trim();
  if (t.length < 20 || t.length > 320) { dropped++; continue; }
  if (/\b(subscribe|click here|read more|sign up)\b/i.test(t) || /https?:\/\//i.test(t)) { dropped++; continue; }
  const key = t.toLowerCase().replace(/\s+/g, " ");
  if (seen.has(key)) { dropped++; continue; }
  seen.add(key);
  kept.push({ ...r, category: classify(r) });
}

fs.writeFileSync(path.join(OUT, "articles-categorized.json"), JSON.stringify(kept, null, 2));

const counts = {};
for (const r of kept) counts[r.category] = (counts[r.category] || 0) + 1;
console.log(`kept=${kept.length}  dropped=${dropped}  (from ${raw.length} raw)`);
console.log("DISTRIBUTION:");
for (const c of [...PRIORITY, "other"]) console.log(`  ${String(counts[c] || 0).padStart(5)}  ${c}`);

console.log("\nSOURCE DIVERSITY (distinct works / top-work share) + a sample:");
for (const c of PRIORITY) {
  const inCat = kept.filter((r) => r.category === c);
  const byWork = {};
  for (const r of inCat) byWork[r.work || "?"] = (byWork[r.work || "?"] || 0) + 1;
  const works = Object.entries(byWork).sort((a, b) => b[1] - a[1]);
  const top = works[0] || ["—", 0];
  console.log(`\n[${c}] ${inCat.length} quotes · ${works.length} works · top: "${String(top[0]).slice(0, 40)}" (${top[1]})`);
  for (const e of inCat.slice(0, 2)) console.log(`   "${e.text.slice(0, 100)}" — ${e.author || "?"}`);
}
