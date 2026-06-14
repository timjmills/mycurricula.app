// Build the home-page insight bank (lib/home/insights.data.json) from the
// categorized article quotes. Keeps the 4 real categories; sets "general"
// (uncategorized) aside in a separate file for optional later use.
//
// Run:  node scripts/quote-mining/build-insights.mjs
import fs from "node:fs";
import path from "node:path";

const ROOT = "C:\\Users\\losey\\Projects\\mycurricula.app";
const OUT = path.join(ROOT, "scripts", "quote-mining", "output");
const LIB_HOME = path.join(ROOT, "lib", "home");
fs.mkdirSync(LIB_HOME, { recursive: true });

const cats = JSON.parse(fs.readFileSync(path.join(OUT, "articles-categorized.json"), "utf8"));
const CATEGORIES = ["classroom culture", "learning", "teaching", "leading"];

let n = 0;
const slug = () => `a${(n++).toString(36)}`;
const clean = (s) => (s || "").replace(/\s+/g, " ").trim();

const toInsight = (r) => ({
  id: slug(),
  quote: clean(r.text),
  author: clean(r.author) || null,
  source: clean(r.source) || null,
  work: clean(r.work) || null,
  url: r.url || null,
  category: r.category,
});

const bank = cats.filter((r) => CATEGORIES.includes(r.category)).map(toInsight);
const general = cats.filter((r) => r.category === "other").map((r) => ({ ...toInsight(r), category: "general" }));

fs.writeFileSync(path.join(LIB_HOME, "insights.data.json"), JSON.stringify(bank, null, 2));
fs.writeFileSync(path.join(LIB_HOME, "insights.general.json"), JSON.stringify(general, null, 2));

const counts = {};
for (const r of bank) counts[r.category] = (counts[r.category] || 0) + 1;
console.log(`Wrote lib/home/insights.data.json — ${bank.length} insights across 4 categories:`);
for (const c of CATEGORIES) console.log(`  ${String(counts[c] || 0).padStart(5)}  ${c}`);
console.log(`Wrote lib/home/insights.general.json — ${general.length} uncategorized (held aside).`);
