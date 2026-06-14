// Diagnostic: do the Books PDFs have an extractable text layer, or are they
// scanned images (which would need OCR)? Samples ~14 books spread across the
// folder, extracts 3 pages from ~40% depth (past front matter), and classifies
// each as TEXT (>200 chars) or IMAGE.
//
// Run from repo root:  node scripts/quote-mining/diagnose-books.mjs
import fs from "node:fs";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const BOOKS =
  "C:\\Users\\losey\\Projects\\mycurricula.app\\Documents\\Books and Articles\\Books";

async function sampleBook(file) {
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await getDocument({ data, useSystemFonts: true, isEvalSupported: false })
    .promise;
  const np = doc.numPages;
  const start = Math.max(1, Math.floor(np * 0.4));
  let chars = 0;
  let sample = "";
  for (let i = start; i < Math.min(start + 3, np + 1); i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const t = tc.items.map((it) => ("str" in it ? it.str : "")).join(" ");
    chars += t.length;
    if (!sample) sample = t.replace(/\s+/g, " ").slice(0, 110);
  }
  await doc.destroy();
  return { np, start, chars, sample };
}

const files = fs.readdirSync(BOOKS).filter((f) => f.toLowerCase().endsWith(".pdf"));
const N = 14;
const step = Math.max(1, Math.floor(files.length / N));
const picks = [];
for (let i = 0; i < files.length && picks.length < N; i += step) picks.push(files[i]);

let textCount = 0;
for (const f of picks) {
  try {
    const r = await sampleBook(path.join(BOOKS, f));
    const ok = r.chars > 200;
    if (ok) textCount++;
    console.log(
      `${ok ? "TEXT " : "IMAGE"} | ${String(r.chars).padStart(5)} ch | ${String(r.np).padStart(4)}pp | ${f.slice(0, 56)}`,
    );
    if (ok) console.log(`        "${r.sample}"`);
  } catch (e) {
    console.log(`ERROR | ${f.slice(0, 56)} | ${e.message}`);
  }
}
console.log(`\n${textCount}/${picks.length} sampled books have an extractable text layer.`);
