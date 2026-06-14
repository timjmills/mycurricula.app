// Shared PDF text extractor for the quote-mining pipeline.
// Uses the project's existing pdfjs-dist (no new deps, no poppler/canvas).
//
// Canonical Node text-extraction config: useSystemFonts:false +
// standardFontDataUrl + cMapUrl. Without these, PDFs that rely on the 14
// standard fonts (Times/Helvetica/Courier) extract garbled or empty text and
// pdfjs only logs a warning (not an error) — which silently wrecks parsing.
import fs from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const ROOT = "C:/Users/losey/Projects/mycurricula.app";
const STANDARD_FONT_DATA_URL = `${ROOT}/node_modules/pdfjs-dist/standard_fonts/`;
const CMAP_URL = `${ROOT}/node_modules/pdfjs-dist/cmaps/`;

export async function extractText(file, { maxPages = Infinity } = {}) {
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await getDocument({
    data,
    useSystemFonts: false,
    disableFontFace: true,
    isEvalSupported: false,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
    cMapUrl: CMAP_URL,
    cMapPacked: true,
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
