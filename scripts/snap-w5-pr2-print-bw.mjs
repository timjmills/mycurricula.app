// scripts/snap-w5-pr2-print-bw.mjs — PR #2 B&W print hatch verification.
//
// Goal: confirm the eight per-subject hatch patterns (the B&W print fallback
// in app/globals.css @media print) are mutually DISTINGUISHABLE once color is
// removed, i.e. what a teacher gets from a mono office laser printer.
//
// Why this renders SWATCHES, not a print-media screenshot:
//   Playwright's page.emulateMedia({ media: "print" }) makes
//   window.matchMedia("print") report true, but it does NOT apply @media print
//   CSS rules to a rasterized screenshot. Verified by reading the computed
//   style of a `.myc-print-stripe::after` under emulated print: content
//   resolves to "none" and background-image to "none" — the entire @media
//   print block is inert in the capture, so a screenshot of /weekly/print
//   shows the SCREEN stripe (solid subject color), never the print hatch.
//   Grayscaling that capture therefore collapses every stripe to identical
//   gray and proves nothing. (Capturing /weekly/print remains useful for
//   LAYOUT — see snap-w5-pr2.mjs — just not for the hatch.)
//
//   The production cascade itself is correct: `--subject-pattern` is declared
//   on the `.cp-subj.<id>` row and inherits to the descendant
//   `.myc-print-stripe`, whose `::after` paints `background-image:
//   var(--subject-pattern)` — confirmed to resolve on a real print path. The
//   only faithful raster proof would be page.pdf() + a PDF rasterizer
//   (poppler / ghostscript), neither installed on this machine.
//
//   So we validate the design question directly: render the eight pattern
//   recipes VERBATIM from globals.css as standalone swatches and grayscale
//   them. If the eight are distinguishable here, the fallback is sound.
//
// Output: docs/screenshots/w5-pr2/print-hatch-swatches{,-bw}.png

import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const OUT_DIR = resolve(process.cwd(), "docs/screenshots/w5-pr2");
mkdirSync(OUT_DIR, { recursive: true });

// The eight patterns, copied verbatim from the @media print block in
// app/globals.css (--ink-400 inlined as #8a8d99 since the swatch is standalone).
const INK = "#8a8d99";
const PATTERNS = {
  math: `repeating-linear-gradient(45deg,${INK} 0 1px,transparent 1px 6px)`,
  reading: `repeating-linear-gradient(135deg,${INK} 0 1px,transparent 1px 6px)`,
  writing: `repeating-linear-gradient(90deg,${INK} 0 1px,transparent 1px 5px)`,
  grammar: `repeating-linear-gradient(0deg,${INK} 0 1px,transparent 1px 5px)`,
  spelling: `repeating-linear-gradient(45deg,${INK} 0 1px,transparent 1px 6px),repeating-linear-gradient(135deg,${INK} 0 1px,transparent 1px 6px)`,
  ufli: `repeating-linear-gradient(135deg,${INK} 0 1px,transparent 1px 4px,${INK} 4px 5px,transparent 5px 9px)`,
  explorers: `repeating-linear-gradient(45deg,${INK} 0 2px,transparent 2px 9px)`,
  sel: `repeating-linear-gradient(0deg,${INK} 0 1px,transparent 1px 8px)`,
};

const cells = Object.entries(PATTERNS)
  .map(
    ([id, bg]) =>
      `<div class="cell"><div class="sw" style="background-image:${bg}"></div><div class="lbl">${id}</div></div>`,
  )
  .join("");

const html = `<!doctype html><html><head><style>
  *{margin:0;box-sizing:border-box}
  body{background:#fff;font:14px system-ui;padding:24px}
  .grid{display:flex;gap:18px;flex-wrap:wrap}
  .cell{width:150px}
  .sw{width:150px;height:260px;border:1px solid #999;background-repeat:repeat}
  .lbl{margin-top:6px;text-align:center;font-weight:600}
</style></head><body><div class="grid">${cells}</div></body></html>`;

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 700 },
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
await page.waitForTimeout(300);

const colorOut = resolve(OUT_DIR, "print-hatch-swatches.png");
await page.screenshot({ path: colorOut });
console.log(`   saved ${colorOut}`);
await browser.close();

// Grayscale + slight contrast bump = the monochrome-laser view.
const bwOut = resolve(OUT_DIR, "print-hatch-swatches-bw.png");
await sharp(colorOut).grayscale().linear(1.1, -8).toFile(bwOut);
console.log(`   saved ${bwOut}`);
console.log("done");
