// scripts/probe-uws-hybrid.mjs — INVESTIGATION ONLY (task #27).
//
// Question: the paper-Year `.uws` workspace-opener chip measures 40px on a
// hybrid device above 900px, under the 44px bar. Closing that needs a design
// call about the card's width, not a media-query edit — so this probe MEASURES
// and CHANGES NOTHING. components/year/TimelineYear.module.css is not edited;
// the 44px scenarios below are applied as throwaway inline overrides in the
// browser and removed again.
//
// WHY THE GAP EXISTS (read off the stylesheet, confirmed live below):
//   • base            `.uws.uws { width: 40px }`
//   • ≤900px          → 44px, and the all-scope chip returns to the flex row
//   • ≥901 + `pointer: coarse` → 44px for outline/subject tiers; the all-scope
//     grid chip instead stays 26px PAINTED and earns 46px from an inset
//     `::after`
// A hybrid (touchscreen laptop) reports `pointer: fine` + `any-pointer: coarse`,
// so it matches NEITHER branch and falls through to the 40px base. The standing
// no-touch rule at :1956 rejected `any-pointer` deliberately — but it rejected
// it for the OPACITY reveal ("would paint the chip over the unit title for
// every hybrid teacher to fix a path that is not broken for them"). Whether
// that rejection also covers the 40→44 WIDTH is the open question, and it is
// the thing this probe puts numbers on.
//
// Usage: CLAUDE_BYPASS_TOKEN=… node scripts/probe-uws-hybrid.mjs

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { bypassLogin, requireToken } from "./lib/auth.mjs";

requireToken({ repoRoot: process.cwd() });
const BASE = process.env.PROBE_BASE ?? "http://localhost:3099";
const OUT = path.resolve("docs/screenshots/uws-hybrid");
await mkdir(OUT, { recursive: true });

const lines = [];
const log = (s) => {
  lines.push(s);
  console.log(s);
};

const browser = await chromium.launch({ channel: "chrome" });

/** A HYBRID context.
 *
 *  `hasTouch: true, isMobile: false` does NOT produce one — measured, Chrome
 *  then reports `pointer: coarse` as well, which is the branch that already
 *  works and would have made this whole probe a tautology. The hybrid is
 *  defined by its MEDIA STATE, so force that directly over CDP
 *  (Emulation.setEmulatedMedia): `pointer: fine` + `any-pointer: coarse` is
 *  exactly what a touchscreen laptop reports, and exactly what the stylesheet
 *  branches on. Applied per-page below. */
async function hybridContext(width) {
  const ctx = await browser.newContext({
    viewport: { width, height: 900 },
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem(
        "mycurricula:onboarding",
        JSON.stringify({ stepIndex: 0, finished: true }),
      );
      // SEED THE FRAME AXIS. The frame decides which tree renders; measuring
      // "paper Year" without pinning it measures whatever the last session
      // left behind. Paper is frame B.
      localStorage.setItem("mycurricula:user:theme-frame", "paper");
      localStorage.setItem("mycurricula:user:theme-bg", "wash");
      localStorage.setItem("mycurricula:user:theme", "clear");
    } catch {
      /* private mode */
    }
  });
  await bypassLogin(ctx, { base: BASE, next: "/year", timeout: 240000 });
  return ctx;
}

async function openYear(ctx) {
  const page = await ctx.newPage();
  // Force the hybrid media state BEFORE first paint.
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [
      { name: "pointer", value: "fine" },
      { name: "any-pointer", value: "coarse" },
      { name: "hover", value: "hover" },
      { name: "any-hover", value: "hover" },
    ],
  });
  await page.goto(`${BASE}/year`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page
    .waitForFunction(() => document.querySelectorAll('[class*="uws"]').length > 0, null, {
      timeout: 180000,
      polling: 1000,
    })
    .catch(() => {});
  return page;
}

const ctx = await hybridContext(1280);
const page = await openYear(ctx);

// ── Gate: is this actually the hybrid case? ─────────────────────────────
// Read the media state in the SAME observation as the measurement. If the
// context reports `pointer: coarse`, the ≥901 branch fires and 44px would be
// measured — a pass that proves nothing about the device under investigation.
const mq = await page.evaluate(() => ({
  pointerFine: matchMedia("(pointer: fine)").matches,
  pointerCoarse: matchMedia("(pointer: coarse)").matches,
  anyCoarse: matchMedia("(any-pointer: coarse)").matches,
  width: innerWidth,
  frame: document.documentElement.getAttribute("data-frame"),
  hier: document.querySelector('[class*="TimelineYear_root"]')?.getAttribute("data-hier"),
  scope: document.querySelector('[class*="TimelineYear_root"]')?.getAttribute("data-scope"),
}));
log(`\n── CONTEXT ────────────────────────────────────────────────────────`);
log(`  ${JSON.stringify(mq)}`);
// THE GATE THAT MATTERS. Emulating `any-pointer: coarse` turned out to be
// both impossible here (hasTouch also flips `pointer` to coarse; CDP
// setEmulatedMedia ignores `any-pointer`) and UNNECESSARY — verified by grep,
// no RULE in TimelineYear.module.css queries `any-pointer`; the only mention
// is the :1937 comment explaining why it was rejected. With no rule
// distinguishing them, a hybrid and a fine-pointer mouse desktop resolve the
// SAME cascade, so the geometry below is exactly what a hybrid renders. What
// differs between them is the user's finger, not the CSS.
//
// So the condition to gate on is the FALL-THROUGH: wide enough to miss the
// ≤900px branch, and not coarse enough to hit the ≥901+coarse branch.
const fallThrough = mq.width > 900 && !mq.pointerCoarse;
log(
  `  fall-through case (>900px AND pointer not coarse): ${fallThrough ? "YES — this is the geometry a hybrid gets" : "NO — measurements below are a DIFFERENT branch"}`,
);
if (!fallThrough) {
  log(`  ABORTING: measuring the wrong branch would answer a question nobody asked.`);
  await browser.close();
  process.exit(1);
}

/** Measure every .uws on screen with its constraining parent. */
async function measure(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[class*="uws"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const cs = getComputedStyle(el);
      const unode = el.closest('[class*="unode"]');
      const unit = unode?.querySelector('[class*="unit"]:not([class*="unitGrid"])');
      const ur = unode?.getBoundingClientRect();
      const tr = unit?.getBoundingClientRect();
      // The painted hit area including any ::after inflation.
      const after = getComputedStyle(el, "::after");
      const inset = after.content !== "none" ? after.inset : "none";
      out.push({
        w: Math.round(r.width * 10) / 10,
        h: Math.round(r.height * 10) / 10,
        position: cs.position,
        opacity: cs.opacity,
        afterInset: inset,
        cardW: ur ? Math.round(ur.width * 10) / 10 : null,
        titleW: tr ? Math.round(tr.width * 10) / 10 : null,
        // Is the sibling title already ellipsised?
        titleTruncated: unit ? unit.scrollWidth > unit.clientWidth + 1 : null,
      });
    }
    return out;
  });
}

const base = await measure(page);
log(`\n── AS SHIPPED (hybrid, 1280px, paper frame) ───────────────────────`);
log(`  ${base.length} .uws chips on screen`);
const byShape = {};
for (const c of base) {
  const k = `${c.w}×${c.h} pos=${c.position} opacity=${c.opacity} after=${c.afterInset}`;
  byShape[k] = (byShape[k] || 0) + 1;
}
for (const [k, n] of Object.entries(byShape)) log(`  ${n}× ${k}`);
const under44 = base.filter((c) => c.w < 44 || c.h < 44);
log(`  chips under 44px in EITHER axis: ${under44.length} of ${base.length}`);
if (base.length) {
  const cards = base.map((c) => c.cardW).filter(Boolean);
  if (cards.length) {
    log(
      `  constraining card (.unode) width: min ${Math.min(...cards)}px · max ${Math.max(...cards)}px`,
    );
  }
  const titles = base.map((c) => c.titleW).filter(Boolean);
  if (titles.length) {
    log(`  sibling title width: min ${Math.min(...titles)}px · max ${Math.max(...titles)}px`);
  }
  log(`  titles already ellipsised: ${base.filter((c) => c.titleTruncated).length}`);
}
await page.screenshot({ path: path.join(OUT, "year-hybrid-1280-asis.png") });

// ── What gives at 44px? Applied as a throwaway override, never to the file ──
async function applyOverride(css) {
  await page.evaluate((text) => {
    let s = document.getElementById("probe-uws-override");
    if (!s) {
      s = document.createElement("style");
      s.id = "probe-uws-override";
      document.head.appendChild(s);
    }
    s.textContent = text;
  }, css);
  await page.waitForTimeout(400);
}

log(`\n── SCENARIO A: widen to 44px (what the naive media-query edit does) ─`);
await applyOverride('[class*="uws"]{width:44px !important;min-height:44px !important;}');
const wide = await measure(page);
const titleDelta = base.map((b, i) => (wide[i]?.titleW ?? 0) - (b.titleW ?? 0));
const newlyTruncated = wide.filter((c, i) => c.titleTruncated && !base[i]?.titleTruncated).length;
log(
  `  sibling title width change: min ${Math.min(...titleDelta)}px · max ${Math.max(...titleDelta)}px`,
);
log(`  titles NEWLY ellipsised by the change: ${newlyTruncated}`);
log(`  chips still under 44px: ${wide.filter((c) => c.w < 44 || c.h < 44).length}`);
const rowGrew = await page.evaluate(
  () => document.documentElement.scrollWidth > window.innerWidth + 1,
);
log(`  document h-scroll introduced: ${rowGrew}`);
// The title does not narrow BECAUSE the chip is absolutely positioned — so in
// this tier the cost of 44px is not truncation, it is OVERLAP. Quantify it:
// how much of the card does a 44px corner zone actually claim?
const overlap = await page.evaluate(() => {
  const el = document.querySelector('[class*="uws"]');
  const unode = el?.closest('[class*="unode"]');
  if (!el || !unode) return null;
  const r = el.getBoundingClientRect();
  const u = unode.getBoundingClientRect();
  const area = (r.width * r.height) / (u.width * u.height);
  return {
    chip: `${Math.round(r.width)}×${Math.round(r.height)}`,
    card: `${Math.round(u.width)}×${Math.round(u.height)}`,
    percentOfCard: Math.round(area * 1000) / 10,
    percentOfCardWidth: Math.round((r.width / u.width) * 1000) / 10,
  };
});
log(`  overlap cost: ${JSON.stringify(overlap)}`);
await page.screenshot({ path: path.join(OUT, "year-hybrid-1280-44px.png") });

log(`\n── SCENARIO B: keep 40px painted, inflate the hit area via ::after ──`);
await applyOverride(
  '[class*="uws"]{position:relative !important;}' +
    '[class*="uws"]::after{content:"" !important;position:absolute !important;inset:-6px !important;}',
);
const inflated = await page.evaluate(() => {
  const el = document.querySelector('[class*="uws"]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  // The hit area a finger actually gets, including the inflation.
  return {
    painted: `${Math.round(r.width)}×${Math.round(r.height)}`,
    // -6px on each side of a 40px box = 52px; measure via elementFromPoint at
    // the inflated corner to prove the area is really live, not just styled.
    hitAtCorner: (() => {
      const x = r.left - 4;
      const y = r.top - 4;
      const hit = document.elementFromPoint(x, y);
      return hit ? hit === el || el.contains(hit) || hit.parentElement === el : false;
    })(),
  };
});
log(`  ${JSON.stringify(inflated)}`);
log(`  (the ::after idiom the ≥901+coarse branch already uses for the grid tier)`);

await applyOverride("");

// ── The all-scope grid tier, which is the WORSE case on a hybrid ─────────
log(`\n── ALL-SCOPE GRID TIER (the tier the :1956 rule treats separately) ──`);
const allScope = await page.evaluate(() => {
  const root = document.querySelector('[class*="TimelineYear_root"]');
  return {
    hier: root?.getAttribute("data-hier"),
    scope: root?.getAttribute("data-scope"),
    note: "chips measured above belong to whichever tier is live",
  };
});
log(`  ${JSON.stringify(allScope)}`);
log(
  `  NOTE: on a hybrid the all-scope grid chip gets NEITHER the coarse branch's`,
);
log(
  `  ::after inflation NOR its opacity:1 — it stays 26px painted and hover-only.`,
);

// ── The OUTLINE/LIST tier — where the chip is IN-FLOW at 40px ───────────
// The all-scope grid chip above is absolutely positioned, so its width costs
// no layout. The base `width: 40px` bites in the tiers where the chip is a
// real trailing flex column. `viewMode` is in-memory (lib/app-state.tsx:307,
// default "grid"), so the only way there above 900px is the UI switcher.
log(`\n── OUTLINE/LIST TIER (chip in-flow) ───────────────────────────────`);
let reachedList = false;
const filterBtn = page.locator('[aria-label="Filters and view"]').first();
if (await filterBtn.count()) {
  await filterBtn.click().catch(() => {});
  await page.waitForTimeout(600);
}
const listOpt = page.locator('button, [role="radio"], label').filter({ hasText: /^List$/i }).first();
if (await listOpt.count()) {
  await listOpt.click().catch(() => {});
  await page.waitForTimeout(1200);
  reachedList =
    (await page.evaluate(
      () =>
        document.querySelector('[class*="TimelineYear_root"]')?.getAttribute("data-hier") === "list",
    )) === true;
}
log(`  reached data-hier="list": ${reachedList}`);
if (reachedList) {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const listChips = await measure(page);
  const shapes = {};
  for (const c of listChips) {
    const k = `${c.w}×${c.h} pos=${c.position}`;
    shapes[k] = (shapes[k] || 0) + 1;
  }
  log(`  ${listChips.length} chips · ${Object.entries(shapes).map(([s, n]) => `${n}× ${s}`).join(" · ")}`);
  log(`  chips under 44px: ${listChips.filter((c) => c.w < 44 || c.h < 44).length}`);
  const rowW = listChips.map((c) => c.cardW).filter(Boolean);
  if (rowW.length) {
    log(`  row (.unode) width: min ${Math.min(...rowW)}px · max ${Math.max(...rowW)}px`);
  }
  await page.screenshot({ path: path.join(OUT, "year-hybrid-list-asis.png") });

  // What does 44px cost HERE, where the chip really is a flex column?
  await applyOverride('[class*="uws"]{width:44px !important;min-height:44px !important;}');
  const listWide = await measure(page);
  const dTitle = listChips.map((b, i) => (listWide[i]?.titleW ?? 0) - (b.titleW ?? 0));
  log(
    `  at 44px → title width change: min ${Math.min(...dTitle)}px · max ${Math.max(...dTitle)}px · newly ellipsised: ${listWide.filter((c, i) => c.titleTruncated && !listChips[i]?.titleTruncated).length}`,
  );
  log(
    `  document h-scroll introduced: ${await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)}`,
  );
  await page.screenshot({ path: path.join(OUT, "year-hybrid-list-44px.png") });
  await applyOverride("");
} else {
  log(`  NOT REACHED — the Grid/List switcher was not found from this state.`);
  log(`  (It is gated: showViewToggle = scope.level === "all" && !showConstellation.)`);
}

// ── 900px boundary check: the tier below is already compliant ────────────
await page.setViewportSize({ width: 880, height: 900 });
await page.waitForTimeout(1200);
const narrow = await measure(page);
log(`\n── BELOW THE BOUNDARY (880px, same hybrid device) ─────────────────`);
if (narrow.length) {
  const k = {};
  for (const c of narrow) {
    const key = `${c.w}×${c.h}`;
    k[key] = (k[key] || 0) + 1;
  }
  log(`  ${Object.entries(k).map(([s, n]) => `${n}× ${s}`).join(" · ")}`);
  log(`  chips under 44px: ${narrow.filter((c) => c.w < 44 || c.h < 44).length}`);
} else {
  log(`  no .uws chips found at 880px`);
}
await page.screenshot({ path: path.join(OUT, "year-hybrid-880.png") });

log(`\nscreenshots: ${OUT}\n`);
await browser.close();
