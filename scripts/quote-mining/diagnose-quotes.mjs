// Why did 939/966 articles contain "NOTABLE QUOTES" but only ~17 parse quotes?
// Dump the NOTABLE QUOTES region of the first several MISSED articles so we can
// see the actual quote delimiter / prefix format and fix the parser.
//
// Run:  node scripts/quote-mining/diagnose-quotes.mjs
import fs from "node:fs";
import path from "node:path";
import { extractText } from "./extract.mjs";

const ROOT = "C:\\Users\\losey\\Projects\\mycurricula.app";
const ARTICLES = path.join(ROOT, "Documents", "Books and Articles", "Articles");
const OUT = path.join(ROOT, "scripts", "quote-mining", "output");

const misses = JSON.parse(fs.readFileSync(path.join(OUT, "articles-misses.json"), "utf8"));
const sample = misses.filter((m) => m.hasNotable && !m.error).slice(0, 6);

for (const m of sample) {
  const { text } = await extractText(path.join(ARTICLES, m.file));
  const norm = text.replace(/\s+/g, " ");
  const idx = norm.search(/NOTABLE QUOTES/i);
  console.log("=".repeat(72));
  console.log(m.file);
  // Print raw char codes around the first quote-ish char to reveal the delimiter
  const region = norm.slice(idx, idx + 600);
  console.log(region);
  // Surface any "smart" punctuation present so we know which code points to match
  const specials = [...new Set((region.match(/[^\x00-\x7F]/g) || []))];
  console.log("NON-ASCII CHARS:", specials.map((c) => `${c}=U+${c.codePointAt(0).toString(16).toUpperCase()}`).join("  "));
  console.log();
}
