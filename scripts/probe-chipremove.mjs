// probe-chipremove.mjs — the resource-chip remove button meets the 44px floor
// without lapping its destructive neighbour.
//
// WHY THIS EXISTS
//
// `.chipRemove` in the lesson editor inflated to 32px on a coarse pointer, not
// the CLAUDE.md §4 44px floor. Widening its guard to `any-pointer` (beeae3e)
// spread that sub-minimum target to more devices, which is a fair objection: a
// target that is still under the floor does not become acceptable by reaching
// more people.
//
// Raising it to 44px is only safe if it clears the hazard that keeps some
// remove buttons deliberately small — components/ui/Chip.module.css pins its
// own `.removeBtn` at 24px precisely because a DESTRUCTIVE control inflated
// until it laps the NEXT item's destructive control deletes the wrong thing.
//
// WHAT THIS ASSERTS (it exits non-zero on failure — an earlier draft only
// printed numbers and always exited 0, which is the same silent-success trap
// this repo has been bitten by before):
//
//   1. the hybrid environment is real (else nothing measured means anything)
//   2. every remove button measures >= 44px on both axes
//   3. no two remove-button tap RECTANGLES intersect, across a MATRIX of label
//      lengths and container widths
//
// (3) is a rectangle-intersection test, not a distance test, and that
// distinction is load-bearing. An earlier draft compared centre-to-centre
// Euclidean distance against 44px — which is simply the wrong geometry: two
// 44x44 axis-aligned targets can sit more than 44px apart diagonally while
// still overlapping on both axes. That version would have passed exactly the
// mis-tap case it was written to catch.
//
// The matrix matters too. A single two-chip sample with comfortable labels
// proves nothing about the dangerous case: the shortest possible label packs
// chips tightest, and a narrow container forces wrapping, which brings rows
// together vertically. Both are exercised, and the tightest pair anywhere in
// the matrix is what gets asserted.
//
// MEASURED RESULT (why the 44px raise is safe): the binding constraint is
// VERTICAL, between wrapped rows — 48px chip height + 4px row gap leaves the
// 44px targets disjoint by 8px. Horizontally the tightest is 24px, with an
// empty label. Both are margins, not coincidences, but 8px is the one to watch:
// shrink `.chips` gap or grow `.chipRemove` past 48px and this starts failing.
//
// Both failure paths have been SEEN to fail, not assumed: raising FLOOR past
// what the layout affords fails (2); stacking the chips absolutely fails (3);
// both exit 1.
//
// USAGE: node scripts/probe-chipremove.mjs [--base http://localhost:3099]

import { chromium } from "playwright";
import { bypassLogin, redact } from "./lib/auth.mjs";

const BASE =
  (process.argv.includes("--base") && process.argv[process.argv.indexOf("--base") + 1]) ||
  "http://localhost:3099";

const HYBRID_ARGS = [
  "--blink-settings=availablePointerTypes=6,primaryPointerType=4," +
    "availableHoverTypes=2,primaryHoverType=2",
];

const FLOOR = 44;

/** Label lengths, worst case first — "" packs the chips as tightly as the
 *  markup allows, which is the arrangement the safety claim rests on. */
const LABELS = ["", "A", "Exit ticket", "Fractions warm-up, extended practice set B"];
/** Container widths, including narrow ones that force wrap. */
const WIDTHS = [520, 320, 240, 180];

let pass = 0;
let fail = 0;
const failures = [];
function assert(name, cond, detail = "") {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail++;
    failures.push(`${name} — ${detail}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", args: HYBRID_ARGS });
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  try {
    await bypassLogin(ctx, { base: BASE, next: "/planner" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11000);

    const env = await page.evaluate(() => ({
      anyCoarse: matchMedia("(any-pointer: coarse)").matches,
      primaryFine: matchMedia("(pointer: fine)").matches,
      under900: matchMedia("(max-width: 900px)").matches,
    }));
    console.log(`hybrid: ${JSON.stringify(env)}\n`);
    assert(
      "1 hybrid environment (any-pointer coarse, primary fine, >900px)",
      env.anyCoarse && env.primaryFine && !env.under900,
      JSON.stringify(env),
    );
    if (fail) throw new Error("not a hybrid environment — every measurement below would be void");

    const out = await page.evaluate(
      ({ labels, widths }) => {
        const cls = {};
        const want = ["chips", "chip", "chipLabel", "chipRemove"];
        const visit = (rules) => {
          for (const r of Array.from(rules || [])) {
            for (const m of (r.selectorText || "").match(/\.[A-Za-z0-9_-]+/g) || []) {
              const raw = m.slice(1);
              if (!raw.startsWith("lesson-editor_")) continue;
              const base = raw.replace(/^lesson-editor_/, "").replace(/__.+$/, "");
              if (want.includes(base)) cls[base] = raw;
            }
            if (r.cssRules) visit(r.cssRules);
          }
        };
        for (const s of Array.from(document.styleSheets)) {
          try {
            visit(s.cssRules);
          } catch {
            /* cross-origin */
          }
        }
        // chipLabel is optional (it only caps width via ellipsis); the other
        // three are load-bearing and their absence must abort, not pass.
        for (const req of ["chips", "chip", "chipRemove"]) {
          if (!cls[req]) return { error: `class resolution failed for .${req}`, cls };
        }

        const host = document.createElement("div");
        host.className = "cp-root";
        host.style.cssText =
          "position:fixed;top:100px;left:100px;background:#fff;z-index:2147483647";
        document.body.appendChild(host);

        const cases = [];
        for (const label of labels) {
          for (const width of widths) {
            host.style.width = `${width}px`;
            const row = document.createElement("div");
            row.className = cls.chips;
            // Six chips: enough to wrap at the narrow widths.
            for (let i = 0; i < 6; i++) {
              const chip = document.createElement("span");
              chip.className = cls.chip;
              const lab = document.createElement("span");
              if (cls.chipLabel) lab.className = cls.chipLabel;
              lab.textContent = label;
              const rm = document.createElement("button");
              rm.className = cls.chipRemove;
              rm.textContent = "×";
              chip.append(lab, rm);
              row.appendChild(chip);
            }
            host.appendChild(row);

            const boxes = [...row.children].map((c) =>
              c.lastElementChild.getBoundingClientRect(),
            );
            // RAW floats. Rounding before the comparison lets a 43.5px target
            // round to 44 and pass a 44px floor it actually fails.
            let minBox = Infinity;
            for (const b of boxes) minBox = Math.min(minBox, b.width, b.height);

            // Overlap of AXIS-ALIGNED rectangles, computed from the rects
            // themselves. Centre-to-centre Euclidean distance is the WRONG
            // metric here and an earlier draft used it: two 44x44 targets can
            // sit >44px apart diagonally while overlapping on both axes, so a
            // distance test passes exactly the mis-tap case this is meant to
            // catch. Two rects overlap iff they overlap on BOTH axes; the
            // separation of a non-overlapping pair is the larger axis gap.
            let worstSep = Infinity;
            let closest = null;
            for (let i = 0; i < boxes.length; i++) {
              for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i];
                const b = boxes[j];
                const gapX = Math.max(a.left - (b.left + b.width), b.left - (a.left + a.width));
                const gapY = Math.max(a.top - (b.top + b.height), b.top - (a.top + a.height));
                // Negative on an axis means the projections overlap there.
                // Separated iff at least one axis gap is >= 0.
                const sep = Math.max(gapX, gapY);
                if (sep < worstSep) {
                  worstSep = sep;
                  closest = { gapX, gapY };
                }
              }
            }
            const rowsUsed = new Set(boxes.map((b) => Math.round(b.top))).size;
            cases.push({
              label: label === "" ? "(empty)" : label.slice(0, 18),
              width,
              chipH: row.firstElementChild.getBoundingClientRect().height,
              minBox,
              worstSep,
              closest,
              rowsUsed,
            });
            row.remove();
          }
        }
        host.remove();
        return { cls, cases };
      },
      { labels: LABELS, widths: WIDTHS },
    );

    if (out.error) throw new Error(`${out.error}: ${JSON.stringify(out.cls)}`);

    const r1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : String(n));
    console.log("\n  label                width  rows  chipH  minBox  closest-pair edge gap");
    console.log("  " + "-".repeat(72));
    for (const c of out.cases) {
      console.log(
        `  ${c.label.padEnd(20)} ${String(c.width).padStart(5)} ${String(c.rowsUsed).padStart(5)} ` +
          `${r1(c.chipH).padStart(6)} ${r1(c.minBox).padStart(7)} ${r1(c.worstSep).padStart(12)}` +
          `  (x ${r1(c.closest.gapX)}, y ${r1(c.closest.gapY)})`,
      );
    }

    const worstBox = out.cases.reduce((w, c) => (c.minBox < w.minBox ? c : w));
    const worstSep = out.cases.reduce((w, c) => (c.worstSep < w.worstSep ? c : w));

    console.log("");
    assert(
      `2 every remove button measures >= ${FLOOR}px on both axes`,
      worstBox.minBox >= FLOOR,
      `worst ${r1(worstBox.minBox)}px at label "${worstBox.label}" / ${worstBox.width}px`,
    );
    // >= 0 means the rectangles are separated on at least one axis, i.e. the
    // tap areas do not intersect at all. This is the real non-overlap test.
    assert(
      "3 no two remove-button tap areas INTERSECT (axis-aligned rect test)",
      worstSep.worstSep >= 0,
      `tightest pair separated by ${r1(worstSep.worstSep)}px at label "${worstSep.label}" / ` +
        `${worstSep.width}px (x-gap ${r1(worstSep.closest.gapX)}, y-gap ${r1(worstSep.closest.gapY)}) — ` +
        `${worstSep.worstSep >= 0 ? "disjoint" : "OVERLAP: adjacent chips share tap area"}`,
    );
    assert(
      "4 the matrix actually exercised wrapping (not one comfortable layout)",
      out.cases.some((c) => c.rowsUsed > 1),
      `${out.cases.filter((c) => c.rowsUsed > 1).length}/${out.cases.length} cases wrapped`,
    );

    // Real rendered chips, if this page happens to have any. Synthetic markup
    // cannot see a production wrapper that constrains the chip differently, so
    // when real ones exist they are the better evidence. Reported either way —
    // "0 found" is stated, never quietly counted as a pass.
    const real = await page.evaluate((cls) => {
      const nodes = [...document.querySelectorAll(`.${cls.chipRemove}`)];
      return nodes.map((n) => {
        const r = n.getBoundingClientRect();
        return { w: r.width, h: r.height };
      });
    }, out.cls);
    if (real.length === 0) {
      console.log(
        `\n  NOTE: 0 real .chipRemove elements rendered on this route — the matrix above\n` +
          `        is the whole evidence. Reaching real chips needs a lesson with saved\n` +
          `        resources; not asserted rather than asserted vacuously.`,
      );
    } else {
      const worstReal = real.reduce((w, r) => Math.min(w, r.w, r.h), Infinity);
      assert(
        `5 real rendered remove buttons also meet ${FLOOR}px`,
        worstReal >= FLOOR,
        `${real.length} found, smallest axis ${r1(worstReal)}px`,
      );
    }
  } finally {
    await ctx.close();
    await browser.close();
  }

  console.log(`\n${"-".repeat(66)}\nRESULT  ${pass} passed, ${fail} failed`);
  if (fail) {
    console.log("\nFAILURES:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("PROBE ERROR:", redact(String(e && e.stack ? e.stack : e)));
  process.exit(1);
});
