// Categorize the extracted books by title (filename) into the 4 buckets so we
// can target quote mining — especially classroom culture (scarce in articles).
// Author parsed from the filename where present. Writes book-categories.json
// (array of {txt, file, author, category}) + per-category file lists + counts.
//
// Run:  node scripts/quote-mining/book-categorize.mjs
import fs from "node:fs";
import path from "node:path";

const OUT = path.join("C:\\Users\\losey\\Projects\\mycurricula.app", "scripts", "quote-mining", "output");
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, "books-manifest.json"), "utf8"));

const CATS = {
  "classroom culture": [
    "classroom managment", "classroom management", "smart classroom", "teach like a champion",
    "discipline", "love and logic", "first days of school", "what great teachers", "behavior",
    "behaviour", "culture of achievement", "cultures of thinking", "engaging", "engagement",
    "tips for teachers", "never work harder", "motivated brain", "what to do with the kid",
    "relationship", "calm", "positive",
  ],
  learning: [
    "how learning works", "how people learn", "how we learn", "how the brain", "make it stick",
    "memory", "remember", "visible learning", "embedded formative", "differentiation and the brain",
    "desire to learn", "building background", "cognitive", "science of reading", "how students learn",
    "affective", "creativity",
  ],
  teaching: [
    "art and science of teaching", "becoming the math teacher", "how to differentiate", "reading power",
    "effective feedback", "rubric", "assessment", "sparking student", "learning targets",
    "common formative", "teaching for student", "active learning", "practical guide to teaching",
    "teaching reading", "handbook for the art", "teach so students remember",
  ],
  leading: [
    "school leadership", "leaders of learning", "results now", "professional learning communit",
    "school improvement", "create a culture of achievement", "leadership", "principal",
  ],
};
const PRIORITY = ["classroom culture", "leading", "learning", "teaching"];

function authorFromName(name) {
  // "... (Author Name).pdf"  or  "... - Author Name.pdf"
  let m = name.match(/\(([^)]+)\)\s*\.pdf$/i);
  if (m && !/^pg|^\d|chapter|part|section/i.test(m[1])) return m[1].trim();
  m = name.match(/[-—]\s*([A-Z][A-Za-z.,'&\- ]{2,40})(?:_nodrm)?\.pdf$/);
  if (m) return m[1].replace(/_nodrm$/i, "").trim();
  return null;
}

function classify(name) {
  const t = name.toLowerCase();
  let best = "teaching"; // default
  let bestN = 0;
  for (const cat of PRIORITY) {
    let n = 0;
    for (const kw of CATS[cat]) if (t.includes(kw)) n++;
    if (n > bestN) { bestN = n; best = cat; }
  }
  return best;
}

const books = manifest.filter((m) => m.txt && !m.error);
const out = books.map((m) => ({
  txt: m.txt,
  file: m.file,
  author: authorFromName(m.file),
  category: classify(m.file),
}));

fs.writeFileSync(path.join(OUT, "book-categories.json"), JSON.stringify(out, null, 2));

const counts = {};
for (const b of out) counts[b.category] = (counts[b.category] || 0) + 1;
console.log(`${out.length} books categorized:`);
for (const c of PRIORITY) console.log(`  ${String(counts[c] || 0).padStart(4)}  ${c}`);
console.log("\nCLASSROOM CULTURE books (target for heavy mining):");
for (const b of out.filter((b) => b.category === "classroom culture")) {
  console.log(`  - ${b.file.slice(0, 70)}${b.author ? `  [${b.author}]` : ""}`);
}
