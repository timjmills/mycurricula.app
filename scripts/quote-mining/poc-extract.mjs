// POC: confirm we can extract text from the Books/Articles corpus using the
// project's existing pdfjs-dist (no new dependency, no poppler/canvas needed),
// and that the article digest template parses into {author, source, url, quotes}.
//
// Run from repo root:  node scripts/quote-mining/poc-extract.mjs
import fs from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

async function extractText(path, maxPages = Infinity) {
  const data = new Uint8Array(fs.readFileSync(path));
  const doc = await getDocument({
    data,
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;
  const n = Math.min(doc.numPages, maxPages);
  const parts = [];
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    parts.push(tc.items.map((it) => ("str" in it ? it.str : "")).join(" "));
  }
  const numPages = doc.numPages;
  await doc.destroy();
  return { numPages, text: parts.join("\n") };
}

// Parse the fixed article-digest template into structured fields. The straight
// or curly quote chars both appear depending on the source, so accept either.
function parseArticle(text) {
  const norm = text.replace(/\s+/g, " ").trim();
  const grab = (re) => (norm.match(re) || [])[1]?.trim() || null;
  const author = grab(/Author:\s*(.+?)\s*Source:/i);
  const source = grab(/Source:\s*(.+?)\s*URL:/i);
  const url = grab(/URL:\s*(\S+)/i);
  const summary = grab(/SUMMARY\s+(.+?)\s+HIGH-IMPACT POINTS/i);
  const quotes = [];
  const re = /Quote\s*\d+:\s*["“]([^"”]+)["”]/g;
  let m;
  while ((m = re.exec(norm))) quotes.push(m[1].trim());
  return { author, source, url, summaryChars: summary?.length ?? 0, quoteCount: quotes.length, quotes };
}

const DIR = "C:\\Users\\losey\\Projects\\mycurricula.app\\Documents\\Books and Articles";
const article = `${DIR}\\Articles\\Education - (Aldeman, Chad) How Students Learn (5.26.26).pdf`;
const book = `${DIR}\\Books\\10. How Learning Works_ Seven Research-Based Principles for Smart Teaching.pdf`;

console.log("=== ARTICLE ===");
const a = await extractText(article);
console.log("pages:", a.numPages, "chars:", a.text.length);
console.log(JSON.stringify(parseArticle(a.text), null, 2));

console.log("\n=== BOOK (first 3 pages) ===");
const b = await extractText(book, 3);
console.log("totalPages:", b.numPages, "extractedChars(3pp):", b.text.length);
console.log(b.text.replace(/\s+/g, " ").slice(0, 700));
