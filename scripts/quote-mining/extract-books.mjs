// Extract text from ALL books in Documents/Books and Articles/Books so the
// quote-mining agents can read every title (not just a subset). Deterministic,
// resumable (skips books already extracted), and bounded per book so a giant
// PDF can't stall the run. Output: one .txt per book + a manifest.
//
// Run (long; use background):  node scripts/quote-mining/extract-books.mjs
import fs from "node:fs";
import path from "node:path";
import { extractText } from "./extract.mjs";

const ROOT = "C:\\Users\\losey\\Projects\\mycurricula.app";
const BOOKS = path.join(ROOT, "Documents", "Books and Articles", "Books");
const OUT = path.join(ROOT, "scripts", "quote-mining", "output");
const TEXTDIR = path.join(OUT, "book-text");
fs.mkdirSync(TEXTDIR, { recursive: true });

const MAX_PAGES = 600; // reads nearly every book fully; caps only huge outliers
const sanitize = (n) => n.replace(/\.pdf$/i, "").replace(/[^a-z0-9._-]+/gi, "_").slice(0, 120);

const files = fs.readdirSync(BOOKS).filter((f) => f.toLowerCase().endsWith(".pdf"));
const skippedDocx = fs.readdirSync(BOOKS).filter((f) => f.toLowerCase().endsWith(".docx"));
const manifest = [];
let i = 0;
for (const f of files) {
  i++;
  const outPath = path.join(TEXTDIR, sanitize(f) + ".txt");
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
    manifest.push({ file: f, txt: path.basename(outPath), chars: fs.statSync(outPath).size, skipped: true });
    continue;
  }
  try {
    const { numPages, text } = await extractText(path.join(BOOKS, f), { maxPages: MAX_PAGES });
    fs.writeFileSync(outPath, text);
    const capped = numPages > MAX_PAGES;
    manifest.push({ file: f, txt: path.basename(outPath), pages: numPages, capped, chars: text.length });
    console.log(`[${i}/${files.length}] ${String(text.length).padStart(7)} ch ${capped ? "(capped)" : "        "} ${f.slice(0, 50)}`);
  } catch (e) {
    manifest.push({ file: f, error: e.message });
    console.log(`[${i}/${files.length}] ERROR ${f.slice(0, 50)} :: ${e.message}`);
  }
}
manifest.push({ note: "docx (not extracted by pdfjs)", docx: skippedDocx });
fs.writeFileSync(path.join(OUT, "books-manifest.json"), JSON.stringify(manifest, null, 2));
const ok = manifest.filter((m) => m.chars && !m.skipped).length;
const skip = manifest.filter((m) => m.skipped).length;
const err = manifest.filter((m) => m.error).length;
console.log(`\nDONE. extracted=${ok} skipped(existing)=${skip} errors=${err} docx=${skippedDocx.length}`);
