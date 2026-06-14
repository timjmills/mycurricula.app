// Apply the LLM article-level categories (article-categories.json, keyed by
// file) to the raw article quotes — each quote inherits its article's accurate
// category. Joins quote→article by URL (and title fallback) via articles-index.
// Light filter + global dedupe. Writes articles-categorized.json + distribution.
//
// Run:  node scripts/quote-mining/apply-categories.mjs
import fs from "node:fs";
import path from "node:path";

const OUT = path.join("C:\\Users\\losey\\Projects\\mycurricula.app", "scripts", "quote-mining", "output");
const raw = JSON.parse(fs.readFileSync(path.join(OUT, "articles-quotes-raw.json"), "utf8"));
const index = JSON.parse(fs.readFileSync(path.join(OUT, "articles-index.json"), "utf8"));
const fileCat = JSON.parse(fs.readFileSync(path.join(OUT, "article-categories.json"), "utf8"));

const norm = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
const urlToCat = {};
const titleToCat = {};
for (const a of index) {
  if (a.error) continue;
  const c = fileCat[a.file];
  if (!c) continue;
  if (a.url) urlToCat[a.url] = c;
  if (a.title) titleToCat[norm(a.title)] = c;
}

const seen = new Set();
const kept = [];
let dropped = 0;
let uncategorized = 0;
for (const r of raw) {
  const t = (r.text || "").trim();
  if (t.length < 20 || t.length > 320) { dropped++; continue; }
  if (/\b(subscribe|click here|read more|sign up)\b/i.test(t) || /https?:\/\//i.test(t)) { dropped++; continue; }
  const key = norm(t);
  if (seen.has(key)) { dropped++; continue; }
  seen.add(key);
  let category = (r.url && urlToCat[r.url]) || (r.work && titleToCat[norm(r.work)]) || "other";
  if (category === "other") uncategorized++;
  kept.push({ ...r, category });
}

fs.writeFileSync(path.join(OUT, "articles-categorized.json"), JSON.stringify(kept, null, 2));

const counts = {};
for (const r of kept) counts[r.category] = (counts[r.category] || 0) + 1;
console.log(`kept=${kept.length} dropped=${dropped} uncategorized(no article match)=${uncategorized}`);
console.log("DISTRIBUTION (accurate, article-level):");
for (const c of ["classroom culture", "learning", "teaching", "leading", "other"]) {
  console.log(`  ${String(counts[c] || 0).padStart(5)}  ${c}`);
}
