// probe-timeline-row-dot.mjs — the Plan tab's LIST mode row dot
// (`.rowDot`), task #29.
//
// WHY A BROWSER PROBE AND NOT A UNIT TEST. `.rowDot` is a CASCADE defect of the
// same family as `scripts/probe-plan-timeline-controls.mjs` #1, one rung along:
// the base `.dot.dot` is DOUBLED (0,2,0) — it had to be, because
// `.cp-root button` (app/tokens.css:1128) is (0,1,1) and strips a single-class
// button rule — and `.rowDot` is the single-class modifier meant to undo the
// lane positioning for the list. (0,1,0) loses to (0,2,0), so every property
// `.rowDot` and `.dot.dot` BOTH declare resolves to the lane version:
//
//     position   static → absolute
//     transform  none   → translate(-50%, -50%)
//     width      18px   → var(--tl-hit)   (22px fine / 44px coarse)
//     height     18px   → var(--tl-hit)
//
// `flex: 0 0 auto` is the one declaration that survives — `.dot.dot` does not
// declare `flex`, so there is nothing for it to lose to. That is the trap's
// signature: a rule that is 20% alive reads, from the source, as applied.
//
// Nothing about that is observable in a rendered HTML string: vitest here runs
// `environment: "node"` with no jsdom, so there is no cascade, no `.cp-root`
// ancestor and no layout. The stylesheet-invariant half is pinned in
// tests/timeline-css-specificity.test.ts; THIS measures the consequence.
//
// WHAT IS MEASURED, and why each one:
//   1. The four resolved properties above, read off the live element. This is
//      the direct read of "which rule won".
//   2. CONTAINMENT — the dot's box against its row's box. `.row` is
//      `position: relative; overflow: hidden`, so an absolutely-positioned dot
//      with auto offsets lands on its static position and is then dragged up
//      and left by translate(-50%,-50%): half of it is CLIPPED AWAY by the row.
//      A teacher sees a quarter-mark bleeding out of the row's top-left corner.
//   3. OVERLAP — the dot's box against the row title's box. An out-of-flow dot
//      reserves no width, so the title slides left underneath it. This is the
//      part a "does the dot exist" check would report as fine.
//   4. The gap between the row's left padding edge and the title's left edge —
//      a positive control on (3): once the dot is back IN FLOW, the title MUST
//      move right by the dot's width plus the row's 10px gap.
//
// SEEN TO FAIL. Run against `.rowDot` un-doubled (git show HEAD:… for the
// pre-fix file) it reports, at 1440×900:
//     position "absolute", transform "matrix(1, 0, 0, 1, -11, -11)",
//     w/h 22×22, containment "clipped: 11px above the row, 11px left of it",
//     overlap with the title 11px, titleLeftGap 0px.
// After the fix: position "static", transform "none", 18×18, fully contained,
// zero overlap, titleLeftGap 28px (18 + the row's 10px gap).
//
// EMULATION, STATED. `--tl-hit` is 22px on a fine pointer and 44px under
// `(any-pointer: coarse), (max-width: 900px)`, so the defect's magnitude is
// tier-dependent and BOTH tiers are measured. Device emulation lies twice
// (a phone context needs isMobile + deviceScaleFactor, and most coarse
// emulations silently fake a hybrid), so every tier re-reads matchMedia in the
// page and PRINTS what it got; no verdict is issued for a tier that is not the
// tier it asked for.
//
//   node scripts/probe-timeline-row-dot.mjs
//
// Env: PROBE_BASE (default http://localhost:3014 — the dev server this repo
// already runs; do NOT start a second one, CLAUDE.md §4b).

import { chromium } from "playwright";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";

const failures = [];
const fail = (what, detail) => {
  failures.push({ what, detail });
  console.log(`[FAIL] ${what} :: ${JSON.stringify(detail)}`);
};
const pass = (what, detail) =>
  console.log(`[ok]   ${what} :: ${JSON.stringify(detail)}`);
const note = (what, detail) =>
  console.log(`[note] ${what} :: ${JSON.stringify(detail)}`);

const TIERS = [
  // A genuinely COARSE tier: isMobile + hasTouch + a real DSF. Verified by
  // probe-plan-timeline-controls.mjs to report pointer:coarse / !pointer:fine /
  // !hover — a tablet, not a touchscreen laptop. Here `--tl-hit` is 44px, so
  // the un-doubled rule clips TWICE as much off the row.
  { name: "tablet", width: 768, height: 1024, mobile: true, touch: true, dsf: 2, coarse: true },
  { name: "desktop", width: 1440, height: 900, mobile: false, touch: false, dsf: 1, coarse: false },
];

/**
 * Read the first list row's dot, its row, and its title, as BOXES.
 *
 * Boxes, not classes: "the element carries .rowDot" is exactly the assertion
 * that was true the whole time the rule was dead. The only thing that settles a
 * cascade defect is the resolved value and the geometry it produces.
 *
 * POSITIVE CONTROL in the same evaluation: `rows` and `dots` are counted and
 * returned. Every verdict below is vacuous if the list did not paint or the
 * lens never flipped to Lessons (the Units lens renders unit rows, which carry
 * no dot at all — TimelineList.tsx:136-166), and the caller refuses to score a
 * run whose control is zero.
 */
const MEASURE = `(() => {
  const rows = [...document.querySelectorAll("[class*='timeline_row__']")];
  const dot = document.querySelector("[class*='timeline_rowDot__']");
  const row = dot ? dot.closest("[class*='timeline_row__']") : null;
  const title = row ? row.querySelector("[class*='timeline_rowTitle__']") : null;
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.left * 10) / 10,
      y: Math.round(r.top * 10) / 10,
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      right: Math.round(r.right * 10) / 10,
      bottom: Math.round(r.bottom * 10) / 10,
    };
  };
  const cs = dot ? getComputedStyle(dot) : null;
  const rowCs = row ? getComputedStyle(row) : null;
  const before = dot ? getComputedStyle(dot, "::before") : null;
  return {
    control: {
      mounted: !!document.querySelector("[data-mounted]"),
      lens: (document.querySelector("[data-lens]") || {}).dataset?.lens ?? null,
      rows: rows.length,
      dots: document.querySelectorAll("[class*='timeline_rowDot__']").length,
      inCpRoot: dot ? !!dot.closest(".cp-root") : null,
    },
    media: {
      pointerCoarse: matchMedia("(pointer: coarse)").matches,
      anyPointerCoarse: matchMedia("(any-pointer: coarse)").matches,
      pointerFine: matchMedia("(pointer: fine)").matches,
      hover: matchMedia("(hover: hover)").matches,
      maxWidth900: matchMedia("(max-width: 900px)").matches,
    },
    resolved: cs && {
      position: cs.position,
      transform: cs.transform,
      width: cs.width,
      height: cs.height,
      flex: cs.flexGrow + " " + cs.flexShrink + " " + cs.flexBasis,
      display: cs.display,
    },
    markSize: before && { w: before.width, h: before.height },
    rowOverflow: rowCs && rowCs.overflow,
    dotBox: rect(dot),
    rowBox: rect(row),
    titleBox: rect(title),
    rowPaddingLeft: rowCs && rowCs.paddingLeft,
    rowGap: rowCs && (rowCs.columnGap || rowCs.gap),
  };
})()`;

/** Flip the lens to Lessons and the mode to List, and SEE that both landed.
 *  A half-flipped toggle is how an earlier probe in this folder produced a
 *  clean sheet about a surface it never reached.
 *
 *  SCOPED TO `[data-lens]`, and that is not incidental. The Planning Hub's own
 *  nav carries a tab also labelled "Lessons"; an unscoped
 *  `getByRole("button", { name: "Lessons" }).first()` clicks THAT, navigates
 *  off the Plan tab, and every subsequent reading is of a page that no longer
 *  contains a timeline. Measured on the first run of this file: lens null,
 *  rows 0, dots 0 — which the control below correctly refused to score. */
async function toList(page) {
  const card = page.locator("[data-lens]");
  for (let i = 0; i < 20; i++) {
    const state = await page.evaluate(`(() => {
      const card = document.querySelector("[data-lens]");
      return {
        lens: card ? card.getAttribute("data-lens") : null,
        list: !!document.querySelector("[class*='timeline_listControls__']"),
      };
    })()`);
    if (state.lens === "lessons" && state.list) return true;
    const label = state.lens !== "lessons" ? "Lessons" : "List";
    await card
      .locator(`button[aria-label="${label}"]`)
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(400);
  }
  return false;
}

const browser = await chromium.launch({ channel: "chrome" });

// WARM-UP — a dev server compiles the CSS module on FIRST REQUEST, so running
// this straight after editing timeline.module.css otherwise measures two
// different stylesheets across the two tiers. Best-effort and never fatal (the
// server is shared with concurrent lanes); the per-tier controls still catch a
// tier that failed to reach a measurable state.
try {
  const warm = await browser.newContext();
  await bypassLogin(warm, { base: BASE, next: "/planner", retries: 3, timeout: 120000 });
  const wp = await warm.newPage();
  await wp.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 120000 }).catch(() => {});
  await wp.waitForSelector("[data-lane-subject]", { timeout: 120000 }).catch(() => {});
  await warm.close();
  note("warm-up", { why: "forced the dev server to compile the CSS before any tier measured it" });
} catch (e) {
  note("warm-up SKIPPED", {
    error: String(e).split("\n")[0].slice(0, 160),
    consequence: "the first tier may measure a stale stylesheet",
  });
}

const measured = [];
for (const tier of TIERS) {
  // A tier that could not be set up is a tier that was NOT measured, and is
  // recorded as a failure rather than allowed to look like a silent pass.
  try {
    await runTier(tier);
    measured.push(tier.name);
  } catch (e) {
    fail(`${tier.name} SETUP`, {
      why: "the tier never reached a measurable state — NOT a pass",
      error: String(e).split("\n")[0].slice(0, 200),
    });
  }
}

async function runTier(tier) {
  const ctx = await browser.newContext({
    viewport: { width: tier.width, height: tier.height },
    isMobile: tier.mobile,
    hasTouch: tier.touch,
    deviceScaleFactor: tier.dsf,
  });
  await bypassLogin(ctx, { base: BASE, next: "/planner", retries: 2, timeout: 120000 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector("[data-lane-subject]", { timeout: 120000 });
  // The mount seam, per CLAUDE.md §4b — `[data-mounted]` present IS the proof
  // that post-mount effects ran, so nothing below reads a pre-hydration box.
  await page.waitForSelector("[data-mounted]", { timeout: 120000 }).catch(() => {});

  const flipped = await toList(page);
  const m = await page.evaluate(MEASURE);
  note(`${tier.name} emulation reported by the PAGE`, m.media);
  note(`${tier.name} control`, { ...m.control, togglesLanded: flipped });

  if (!flipped || !(m.control.rows > 0 && m.control.dots > 0)) {
    fail(`${tier.name} POSITIVE CONTROL`, {
      control: m.control,
      togglesLanded: flipped,
      why: "the Lessons/List toggles never landed or the list drew no dotted rows — every measurement below is VOID, not a pass",
    });
    await ctx.close();
    return;
  }
  if (tier.coarse && !(m.media.pointerCoarse && !m.media.pointerFine && !m.media.hover)) {
    fail(`${tier.name} EMULATION`, {
      why: "asked for a coarse-only pointer and got a hybrid — the coarse branch of the stylesheet was not exercised",
      media: m.media,
    });
    await ctx.close();
    return;
  }
  if (!tier.coarse && !m.media.pointerFine) {
    fail(`${tier.name} EMULATION`, { why: "asked for a fine pointer, did not get one", media: m.media });
    await ctx.close();
    return;
  }

  note(`${tier.name} resolved`, m.resolved);
  note(`${tier.name} boxes`, { dot: m.dotBox, row: m.rowBox, title: m.titleBox, rowOverflow: m.rowOverflow });
  note(`${tier.name} visible mark`, m.markSize);

  /* ── 1. WHICH RULE WON ────────────────────────────────────────────────── */
  // The four properties `.rowDot` and `.dot.dot` both declare. Asserted by
  // RESOLVED VALUE, which is the only thing a cascade defect can be read off.
  if (m.resolved.position !== "static") {
    fail(`${tier.name} rowDot position`, {
      got: m.resolved.position,
      want: "static",
      why: "`.rowDot`'s `position: static` lost to `.dot.dot`'s `position: absolute` — the list dot is still positioned as a lane mark",
    });
  } else pass(`${tier.name} rowDot position`, { position: m.resolved.position });

  if (m.resolved.transform !== "none") {
    fail(`${tier.name} rowDot transform`, {
      got: m.resolved.transform,
      want: "none",
      why: "the lane's translate(-50%,-50%) is still centring the mark on its own top-left corner",
    });
  } else pass(`${tier.name} rowDot transform`, { transform: m.resolved.transform });

  for (const axis of ["width", "height"]) {
    if (m.resolved[axis] !== "18px") {
      fail(`${tier.name} rowDot ${axis}`, {
        got: m.resolved[axis],
        want: "18px",
        why: `lost to \`.dot.dot\`'s var(--tl-hit) (${tier.coarse ? "44px on this tier" : "22px on this tier"})`,
      });
    } else pass(`${tier.name} rowDot ${axis}`, { [axis]: m.resolved[axis] });
  }

  /* ── 2. CONTAINMENT ───────────────────────────────────────────────────── */
  // `.row` is overflow:hidden, so anything outside its box is not dimmed or
  // offset — it is GONE. Measured in px so the report says how much was lost.
  const above = Math.round((m.rowBox.y - m.dotBox.y) * 10) / 10;
  const left = Math.round((m.rowBox.x - m.dotBox.x) * 10) / 10;
  const clipped = Math.max(0, above) + Math.max(0, left);
  if (clipped > 0.5) {
    fail(`${tier.name} rowDot containment`, {
      clippedAbovePx: Math.max(0, above),
      clippedLeftPx: Math.max(0, left),
      rowOverflow: m.rowOverflow,
      why: "part of the mark is outside its row, which clips it — the teacher sees a fragment, not a dot",
    });
  } else {
    pass(`${tier.name} rowDot containment`, { insetTopPx: -above, insetLeftPx: -left });
  }

  /* ── 3. OVERLAP WITH THE TITLE ────────────────────────────────────────── */
  // The half a presence-check misses: an out-of-flow dot reserves no width, so
  // the lesson title runs underneath it.
  const overlap = Math.round((m.dotBox.right - m.titleBox.x) * 10) / 10;
  if (overlap > 0.5) {
    fail(`${tier.name} rowDot / title overlap`, {
      overlapPx: overlap,
      dotRight: m.dotBox.right,
      titleLeft: m.titleBox.x,
      why: "the dot is out of flow, so the lesson title is drawn under it",
    });
  } else pass(`${tier.name} rowDot / title overlap`, { overlapPx: 0, gapPx: -overlap });

  /* ── 4. THE TITLE ACTUALLY MOVED ──────────────────────────────────────── */
  // Positive control on (3): a dot that is back in flow MUST push the title
  // right by its own width plus the row's gap. Without this, a dot that
  // vanished entirely (width 0) would satisfy the overlap check above.
  const padLeft = parseFloat(m.rowPaddingLeft) || 0;
  const gap = parseFloat(m.rowGap) || 0;
  const titleGap = Math.round((m.titleBox.x - (m.rowBox.x + padLeft)) * 10) / 10;
  const wantGap = 18 + gap;
  if (Math.abs(titleGap - wantGap) > 1.5) {
    fail(`${tier.name} title offset`, {
      got: titleGap,
      want: wantGap,
      padLeft,
      gap,
      why: "the title is not sitting one dot-width + one gap in from the row's padding edge — either the dot reserves no space, or it collapsed",
    });
  } else pass(`${tier.name} title offset`, { titleLeftGapPx: titleGap, want: wantGap });

  await ctx.close();
}

await browser.close();

console.log("\n" + "=".repeat(60));
console.log(`TIERS MEASURED: ${measured.join(", ") || "NONE"} (of ${TIERS.map((t) => t.name).join(", ")})`);
if (measured.length !== TIERS.length) {
  fail("COVERAGE", {
    measured,
    of: TIERS.map((t) => t.name),
    why: "a tier produced no readings — the run is incomplete, not passing",
  });
}
if (failures.length === 0) {
  console.log("PROBE PASSED — on both a fine and a genuinely coarse pointer:");
  console.log("  · the list dot resolves to position:static / transform:none / 18×18,");
  console.log("    i.e. `.rowDot` now beats `.dot.dot` rather than losing to it;");
  console.log("  · the whole mark is inside its row, so overflow:hidden clips none of it;");
  console.log("  · it does not overlap the lesson title;");
  console.log("  · and it reserves its own width — the title sits 18px + gap in.");
} else {
  console.log(`PROBE FAILED — ${failures.length} finding(s):`);
  for (const f of failures) console.log(`  · ${f.what} :: ${JSON.stringify(f.detail)}`);
}
process.exit(failures.length === 0 ? 0 : 1);
