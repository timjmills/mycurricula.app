// Mine all article digests into raw, attributed quote records.
//
// The digests do NOT share one rigid template. Headers vary ("EDUCATION | date",
// "EDUCATION:", "Category: Education", with Author/Source/URL/Title/Date in any
// order), and the NOTABLE QUOTES section varies even more:
//   NOTABLE QUOTES 1. "..."        (numbered, straight quotes)
//   Notable Quotes [1] "..."       (bracketed)
//   Notable quotes “...” “...”      (curly U+201C/U+201D, no prefix)
//   NOTABLE QUOTES “... -- Speaker” (inline speaker attribution)
// So we parse fields independently (label-anchored, order-free) and extract
// EVERY quoted span (straight or curly) inside the NOTABLE QUOTES section,
// prefix-agnostic, peeling off any trailing "-- Speaker".
//
// Output (scripts/quote-mining/output/):
//   articles-quotes-raw.json  — one record per quote
//   articles-index.json       — per-article metadata + health
//   articles-misses.json      — articles that still yield 0 quotes
//
// Run:  node scripts/quote-mining/mine-articles.mjs
import fs from "node:fs";
import path from "node:path";
import { extractText } from "./extract.mjs";

const ROOT = "C:\\Users\\losey\\Projects\\mycurricula.app";
const ARTICLES = path.join(ROOT, "Documents", "Books and Articles", "Articles");
const OUT = path.join(ROOT, "scripts", "quote-mining", "output");
fs.mkdirSync(OUT, { recursive: true });

// Stop a field value at the next known label (label + colon) or section header.
const NEXT =
  "(?=\\s*(?:Author|Source|Date|URL|Category|Title|Email|Published|By)\\s*:|\\s*(?:SUMMARY|HIGH-IMPACT|NOTABLE QUOTES|Notable Quotes|Notable quotes)\\b|$)";

function field(norm, label) {
  const m = norm.match(new RegExp(label + ":\\s*(.+?)\\s*" + NEXT, "i"));
  return m ? m[1].trim() : null;
}

function parseFilename(name) {
  const m = name.match(/^Education\s*-\s*\((.+?)\)\s*(.+?)\s*\(([\d.]+)\)\.pdf$/i);
  return m ? { fileAuthor: m[1].trim(), fileTitle: m[2].trim(), fileDate: m[3].trim() } : {};
}

function extractQuotes(norm) {
  const idx = norm.search(/Notable Quotes/i);
  if (idx < 0) return [];
  const section = norm.slice(idx + "Notable Quotes".length);
  const out = [];
  const seen = new Set();
  // Opening " or “, capture 20–400 chars containing no quote char, closing " or ”.
  const re = /[“"]([^”"]{20,400})[”"]/g;
  let m;
  while ((m = re.exec(section))) {
    let q = m[1].trim();
    let speaker = null;
    const sp = q.match(/\s*(?:—|--)\s*([A-Z][A-Za-z.'’\- ]{2,40})$/);
    if (sp) {
      speaker = sp[1].trim();
      q = q.slice(0, sp.index).trim();
    }
    if (q.length < 20) continue;
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ quote: q, speaker });
  }
  return out;
}

const files = fs.readdirSync(ARTICLES).filter((f) => f.toLowerCase().endsWith(".pdf"));
const records = [];
const index = [];
const misses = [];
let noQuotes = 0;
let errors = 0;
let i = 0;
for (const f of files) {
  i++;
  try {
    const { text } = await extractText(path.join(ARTICLES, f));
    const norm = text.replace(/\s+/g, " ").trim();
    const fn = parseFilename(f);
    const author = field(norm, "Author") || field(norm, "By") || fn.fileAuthor || null;
    let source = field(norm, "Source");
    let url = field(norm, "URL");
    if (!url && source && /^https?:\/\//i.test(source)) url = source;
    if (url) url = (url.match(/https?:\/\/\S+/) || [url])[0].replace(/[).,]+$/, "");
    const title = field(norm, "Title") || fn.fileTitle || null;
    const date = field(norm, "Date") || fn.fileDate || null;
    const summary = (norm.match(/\bSUMMARY\b:?\s*(.+?)\s*(?=HIGH-IMPACT|NOTABLE QUOTES|Notable Quotes|Notable quotes|$)/i) || [])[1]?.trim() || null;
    const quotes = extractQuotes(norm);
    index.push({ file: f, title, author, source, url, date, chars: text.length, quoteCount: quotes.length });
    if (!quotes.length) {
      noQuotes++;
      misses.push({ file: f, chars: text.length, head: norm.slice(0, 160) });
    }
    for (const { quote, speaker } of quotes) {
      records.push({
        text: quote,
        author: speaker || author,
        articleAuthor: author,
        source: source && !/^https?:/i.test(source) ? source : null,
        sourceType: "article",
        work: title,
        url: url || null,
        date: date || null,
        expand: summary || null,
      });
    }
  } catch (e) {
    errors++;
    index.push({ file: f, error: e.message });
    misses.push({ file: f, error: e.message });
  }
  if (i % 150 === 0) console.log(`...${i}/${files.length}  quotes=${records.length}`);
}

fs.writeFileSync(path.join(OUT, "articles-quotes-raw.json"), JSON.stringify(records, null, 2));
fs.writeFileSync(path.join(OUT, "articles-index.json"), JSON.stringify(index, null, 2));
fs.writeFileSync(path.join(OUT, "articles-misses.json"), JSON.stringify(misses, null, 2));
console.log(`\nDONE. articles=${files.length} quotes=${records.length} noQuoteArticles=${noQuotes} errors=${errors}`);
