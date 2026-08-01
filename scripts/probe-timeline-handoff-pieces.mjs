// probe-timeline-handoff-pieces.mjs — the LIVE half of task #27's four pieces.
//
// The unit tests pin what a rendered STRING can carry (stylesheet text, source
// gates, derived data). None of that is evidence about geometry, visibility or
// a gesture, because vitest runs `environment: "node"` — no cascade, no layout,
// no pointer. This measures the four things only a browser can settle:
//
//   1  data-zoom + the title pill: is a lesson title ACTUALLY VISIBLE past 80px
//      a day, and invisible below it — and does the mark keep its 44px touch
//      box on a coarse tier while it happens?
//   2  the drawer grip: does dragging it up make the drawer TALLER, and does a
//      double-click collapse it?
//   3  the lens gate: does the Timeline|List pair really disappear in the
//      Lessons lens, and does the body really become the list?
//   4  the drawer's three tabs and the Needs Attention action buttons.
//
// ── EVERY ABSENCE CHECK IS PAIRED, IN THE SAME EVALUATION ────────────────
// "0 dots carry a title at the default zoom" is the exact shape that fails open
// against a canvas that did not render — which is how this surface once
// reported "the feature is missing" three runs running about a feature that was
// there. So every read below returns a CONTROL taken in the same evaluation
// (lane count, band-label count, dot count, `[data-mounted]`), and no verdict is
// issued for a read whose control is zero.
//
// ── EMULATION, STATED ────────────────────────────────────────────────────
// Device emulation lies twice: a phone context needs isMobile + a real
// deviceScaleFactor, and most coarse emulations silently produce a HYBRID
// (pointer:fine true AND any-pointer:coarse true), which exercises a different
// branch of this stylesheet than a real tablet. Each tier re-reads matchMedia
// in the page and PRINTS what it got; no touch verdict is issued for a tier
// whose reading is not what it asked for.
//
//   node scripts/probe-timeline-handoff-pieces.mjs
//
// Env: PROBE_BASE (default http://localhost:3014 — the dev server this repo
// already runs; do NOT start a second one, CLAUDE.md §4b).

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const SHOTS = "docs/screenshots/timeline-handoff-pieces";
mkdirSync(SHOTS, { recursive: true });

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
  { name: "phone", width: 375, height: 812, mobile: true, touch: true, dsf: 3, coarse: true },
  { name: "tablet", width: 768, height: 1024, mobile: true, touch: true, dsf: 2, coarse: true },
  { name: "desktop", width: 1440, height: 900, mobile: false, touch: false, dsf: 1, coarse: false },
];

/** Visible means it has a box AND is not `display:none` — `textContent` alone
 *  would count every one of the ~1250 spans that are always in the DOM. */
const READ = `(() => {
  const dots = [...document.querySelectorAll("[data-lane-subject] button[class*='timeline_dot__']")]
    .filter((d) => !/legendDot|rowDot/.test(d.className));
  const visibleTitle = (d) => {
    const t = d.querySelector("[class*='timeline_dotTitle__']");
    if (!t) return false;
    const r = t.getBoundingClientRect();
    return getComputedStyle(t).display !== "none" && r.width > 0 && r.height > 0;
  };
  const card = document.querySelector("[data-lens]");
  const day = document.querySelector("[data-tl-day]");
  const dotBox = dots.length ? dots[0].getBoundingClientRect() : null;
  return {
    // POSITIVE CONTROLS, same evaluation. A zero here voids every count below.
    control: {
      lanes: document.querySelectorAll("[data-lane-subject]").length,
      bandNames: [...document.querySelectorAll("[class*='timeline_bandName__']")]
        .map((n) => (n.textContent || "").trim()).filter(Boolean).length,
      dots: dots.length,
      dotTitleSpansInDom: document.querySelectorAll("[class*='timeline_dotTitle__']").length,
      mounted: !!document.querySelector("[data-mounted]"),
    },
    media: {
      pointerCoarse: matchMedia("(pointer: coarse)").matches,
      pointerFine: matchMedia("(pointer: fine)").matches,
      anyPointerCoarse: matchMedia("(any-pointer: coarse)").matches,
    },
    dataZoom: card ? card.getAttribute("data-zoom") : null,
    dataLens: card ? card.getAttribute("data-lens") : null,
    // MEASURED, never read off the custom property: \`--tl-col\` is a max()
    // expression and getPropertyValue returns it unparsed.
    colWidth: day ? Math.round(day.getBoundingClientRect().width * 100) / 100 : null,
    dotsWithVisibleTitle: dots.filter(visibleTitle).length,
    firstTitleText: dots.length && visibleTitle(dots[0])
      ? (dots[0].querySelector("[class*='timeline_dotTitle__']").textContent || "").trim()
      : null,
    dotBox: dotBox ? { w: Math.round(dotBox.width * 10) / 10, h: Math.round(dotBox.height * 10) / 10 } : null,
    modePair: !!document.querySelector('[role="radiogroup"][aria-label="How the plan is drawn"]'),
    lensPair: !!document.querySelector('[role="radiogroup"][aria-label="What the plan shows"]'),
    listBody: !!document.querySelector("[class*='timeline_list__']"),
    canvasBody: !!document.querySelector("[data-lane-subject]"),
  };
})()`;

const DRAWER_READ = `(() => {
  const body = document.querySelector("#plan-timeline-library");
  const grip = document.querySelector("[class*='timeline_drawerGrip__']");
  const tabs = [...document.querySelectorAll('[role="radiogroup"][aria-label="Library section"] [role="radio"]')]
    .map((b) => (b.textContent || "").trim());
  const gripBox = grip ? grip.getBoundingClientRect() : null;
  return {
    open: !!body,
    bodyHeight: body ? Math.round(body.getBoundingClientRect().height) : null,
    tabs,
    tabCount: tabs.length,
    gripBox: gripBox ? { w: Math.round(gripBox.width), h: Math.round(gripBox.height) } : null,
    gripCursor: grip ? getComputedStyle(grip).cursor : null,
    severityHeads: [...document.querySelectorAll("[class*='timeline_drawerGroupHead__']")]
      .map((h) => (h.textContent || "").trim()),
    actionButtons: document.querySelectorAll("[class*='timeline_issueAction__']").length,
    // The handoff's own defect, checked for: a tooltip that restates its label.
    restatingTooltips: [...document.querySelectorAll("[class*='timeline_issueAction__']")]
      .filter((b) => (b.title || "").trim() === (b.textContent || "").trim()).length,
  };
})()`;

const browser = await chromium.launch({ channel: "chrome" });

// One throwaway load so the dev server compiles the CSS module before anything
// is measured — otherwise the first tier reads the OLD stylesheet and the run
// reports a global rule as "broken on phone, fine on desktop".
try {
  const warm = await browser.newContext();
  await bypassLogin(warm, { base: BASE, next: "/planner", retries: 3, timeout: 120000 });
  const wp = await warm.newPage();
  await wp.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 120000 }).catch(() => {});
  await wp.waitForSelector("[data-lane-subject]", { timeout: 120000 }).catch(() => {});
  await warm.close();
  note("warm-up", { why: "forced the CSS module compile before any tier measured it" });
} catch (e) {
  note("warm-up SKIPPED", { error: String(e).split("\n")[0].slice(0, 160) });
}

const measured = [];
for (const tier of TIERS) {
  try {
    await runTier(tier);
    measured.push(tier.name);
  } catch (e) {
    // A tier that threw is a tier that was NOT measured. Recording it as a
    // failure is what stops a partial log whose last line is a row of [ok]s
    // from reading like a pass.
    fail(`${tier.name} SETUP`, {
      why: "never reached a measurable state — no verdict is issued for it",
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
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + String(e).slice(0, 200)));

  await page.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector("[data-lane-subject]", { state: "attached", timeout: 180000 });
  // `[data-mounted]` is the surface's own hydration gate — the today line, the
  // current-week band and `data-zoom` all arrive only after it.
  //
  // `state: "attached"`, NOT the default "visible". The attribute rides on the
  // canvas card, which at 375 can sit below the fold — and an off-screen
  // element is "not visible" to Playwright, so the default waits for a
  // condition that never arrives and times out on a page that hydrated
  // perfectly. Cost one phone tier before it was spotted. The dev hydrate here
  // also runs 5–9s, and far longer while several probe lanes share this server.
  await page.waitForSelector("[data-mounted]", { state: "attached", timeout: 180000 });
  await page.waitForTimeout(400);

  const T = tier.name;

  // ── media reality check ────────────────────────────────────────────────
  const base = await page.evaluate(READ);
  note(`${T} media`, base.media);
  const genuinelyCoarse = base.media.pointerCoarse && !base.media.pointerFine;
  if (tier.coarse && !genuinelyCoarse) {
    note(`${T} EMULATION IS HYBRID`, {
      why: "pointer:fine is also true — this is a touchscreen-laptop branch, not a tablet",
      consequence: "no touch-target verdict is issued for this tier",
    });
  }

  if (!base.control.lanes || !base.control.dots) {
    // The canvas did not paint (or this environment has no dated lessons —
    // see docs: localhost has run empty before). Every count below would be a
    // vacuous zero, so nothing is scored.
    fail(`${T} NO DATA`, {
      control: base.control,
      why: "no lanes or no dots — every count would be a vacuous zero, so NO verdict is issued for this tier",
    });
    await ctx.close();
    return;
  }
  pass(`${T} control`, base.control);

  // ── PIECE 2 — the title pill ───────────────────────────────────────────
  // Below the threshold: the spans are in the DOM (that is the point — they are
  // never remounted) and none of them is visible.
  if (base.dotsWithVisibleTitle === 0 && base.control.dotTitleSpansInDom > 0) {
    pass(`${T} titles hidden below roomy`, {
      dataZoom: base.dataZoom,
      colWidth: base.colWidth,
      spansInDom: base.control.dotTitleSpansInDom,
      visible: 0,
    });
  } else {
    fail(`${T} titles below roomy`, {
      dataZoom: base.dataZoom,
      colWidth: base.colWidth,
      visible: base.dotsWithVisibleTitle,
      spansInDom: base.control.dotTitleSpansInDom,
    });
  }
  await page.screenshot({ path: `${SHOTS}/${T}-01-default-zoom.png` });

  // Now widen past 80px a day, through the REAL control a teacher uses.
  // THE NATIVE VALUE SETTER, not `el.value = …`.
  //
  // React keeps a value tracker on every controlled input and compares against
  // it before dispatching onChange, so a plain assignment updates the DOM node
  // and is then SWALLOWED — no state change, no re-render. The first run of
  // this probe did exactly that and reported `data-zoom: "cozy", colWidth: 46`
  // after asking for 100px columns at all three tiers: three identical
  // "the feature is missing" failures about a probe bug. Going through the
  // prototype's setter updates the tracker too, so React sees a real change.
  const slider = page.locator("#tl-zoom");
  await slider.evaluate((el) => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(el, "100");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(600);
  const roomy = await page.evaluate(READ);
  if (roomy.dataZoom === "roomy" && roomy.dotsWithVisibleTitle === roomy.control.dots && roomy.firstTitleText) {
    pass(`${T} titles VISIBLE at roomy`, {
      dataZoom: roomy.dataZoom,
      colWidth: roomy.colWidth,
      visible: roomy.dotsWithVisibleTitle,
      ofDots: roomy.control.dots,
      sample: roomy.firstTitleText,
      dotBox: roomy.dotBox,
    });
  } else {
    fail(`${T} titles at roomy`, {
      dataZoom: roomy.dataZoom,
      colWidth: roomy.colWidth,
      visible: roomy.dotsWithVisibleTitle,
      ofDots: roomy.control.dots,
      sample: roomy.firstTitleText,
    });
  }
  // THE REGRESSION THIS PIECE COULD HAVE CAUSED. The handoff hard-codes the
  // pill at 22px tall; on a coarse tier that would halve every lesson target at
  // the top of the zoom range.
  if (tier.coarse && genuinelyCoarse) {
    if (roomy.dotBox && roomy.dotBox.h >= 44) {
      pass(`${T} pill keeps the touch box`, { dotBox: roomy.dotBox });
    } else {
      fail(`${T} pill SHRANK the touch box`, { dotBox: roomy.dotBox, need: ">=44 tall" });
    }
  }
  await page.screenshot({ path: `${SHOTS}/${T}-02-roomy-titles.png` });

  // Back to default so the rest of the pass is measured at the shipped zoom.
  await page.locator('button:has-text("Reset")').first().click().catch(() => {});
  await page.waitForTimeout(300);

  // ── PIECE 4 — the lens gates the mode pair ─────────────────────────────
  const beforeLens = await page.evaluate(READ);
  // POSITIVE CONTROL for the absence check that follows: the pair is here NOW.
  if (beforeLens.modePair && beforeLens.lensPair && beforeLens.canvasBody) {
    pass(`${T} Units lens has the mode pair`, {
      modePair: true, lens: beforeLens.dataLens, canvas: true,
    });
  } else {
    fail(`${T} Units lens`, beforeLens);
  }
  await page.locator('[role="radiogroup"][aria-label="What the plan shows"] [role="radio"]', { hasText: "Lessons" }).first().click();
  await page.waitForTimeout(500);
  const afterLens = await page.evaluate(READ);
  if (!afterLens.modePair && afterLens.lensPair && afterLens.listBody && !afterLens.canvasBody) {
    pass(`${T} Lessons lens drops the mode pair AND becomes a list`, {
      modePair: false,
      lensPairStillThere: afterLens.lensPair,
      listBody: true,
      lens: afterLens.dataLens,
    });
  } else {
    fail(`${T} Lessons lens`, {
      modePair: afterLens.modePair,
      lensPair: afterLens.lensPair,
      listBody: afterLens.listBody,
      canvasBody: afterLens.canvasBody,
    });
  }
  await page.screenshot({ path: `${SHOTS}/${T}-03-lessons-lens.png` });
  await page.locator('[role="radiogroup"][aria-label="What the plan shows"] [role="radio"]', { hasText: "Units" }).first().click();
  await page.waitForTimeout(400);

  // ── PIECES 1 + 3 — the drawer ──────────────────────────────────────────
  await page.locator("[class*='timeline_drawerToggle__']").first().click();
  await page.waitForTimeout(400);
  const d0 = await page.evaluate(DRAWER_READ);
  if (d0.open && d0.tabCount === 3) {
    pass(`${T} drawer has THREE tabs`, { tabs: d0.tabs, grip: d0.gripBox, cursor: d0.gripCursor });
  } else {
    fail(`${T} drawer tabs`, d0);
  }

  // Resize: drag the grip UP, which must make the panel TALLER (inverted delta).
  const gripEl = page.locator("[class*='timeline_drawerGrip__']").first();
  const gb = await gripEl.boundingBox();
  if (gb && d0.bodyHeight) {
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
    await page.mouse.down();
    await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2 - 120, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const d1 = await page.evaluate(DRAWER_READ);
    if (d1.bodyHeight > d0.bodyHeight) {
      pass(`${T} drag UP grows the drawer`, { before: d0.bodyHeight, after: d1.bodyHeight, delta: d1.bodyHeight - d0.bodyHeight });
    } else {
      fail(`${T} drawer resize`, { before: d0.bodyHeight, after: d1.bodyHeight, expected: "taller" });
    }
  } else {
    fail(`${T} drawer resize`, { why: "no grip box or no body height", gb, d0 });
  }

  // Needs Attention: severity headings and real action buttons.
  await page.locator('[role="radiogroup"][aria-label="Library section"] [role="radio"]', { hasText: "Needs attention" }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  const dAttn = await page.evaluate(DRAWER_READ);
  if (dAttn.actionButtons > 0 && dAttn.severityHeads.length > 0 && dAttn.restatingTooltips === 0) {
    pass(`${T} Needs Attention has severities + real actions`, {
      heads: dAttn.severityHeads.slice(0, 4),
      actions: dAttn.actionButtons,
      restatingTooltips: 0,
    });
  } else {
    fail(`${T} Needs Attention`, {
      heads: dAttn.severityHeads,
      actions: dAttn.actionButtons,
      restatingTooltips: dAttn.restatingTooltips,
    });
  }
  await page.screenshot({ path: `${SHOTS}/${T}-04-drawer-attention.png` });

  // The Lessons tab — the third tab the live sweep found missing.
  await page.locator('[role="radiogroup"][aria-label="Library section"] [role="radio"]', { hasText: "Lessons" }).first().click().catch(() => {});
  await page.waitForTimeout(400);
  const dLess = await page.evaluate(`(() => {
    const rows = document.querySelectorAll("#plan-timeline-library [class*='timeline_row__']").length;
    const groups = document.querySelectorAll("#plan-timeline-library [class*='timeline_drawerGroupHead__']").length;
    return { rows, groups };
  })()`);
  if (dLess.rows > 0) {
    pass(`${T} Lesson Library tab renders rows`, dLess);
  } else {
    fail(`${T} Lesson Library tab`, dLess);
  }
  await page.screenshot({ path: `${SHOTS}/${T}-05-drawer-lessons.png` });

  // A SINGLE click must NOT collapse it. The review gate found `onClick` doing
  // exactly that, which also meant every completed resize drag closed the panel
  // it had just resized — survived only by `preventDefault()` on pointerdown
  // happening to swallow the synthetic click, which is browser-dependent.
  const gbSingle = await gripEl.boundingBox();
  if (gbSingle) {
    await page.mouse.click(gbSingle.x + gbSingle.width / 2, gbSingle.y + gbSingle.height / 2);
    await page.waitForTimeout(350);
    const dSingle = await page.evaluate(DRAWER_READ);
    if (dSingle.open) pass(`${T} single click LEAVES the drawer open`, { open: true });
    else fail(`${T} single click collapsed the drawer`, { open: false, expected: "still open" });
  }

  // Double-click the grip collapses it (`ph-drawer.jsx:116`).
  const gb2 = await gripEl.boundingBox();
  if (gb2) {
    await page.mouse.dblclick(gb2.x + gb2.width / 2, gb2.y + gb2.height / 2);
    await page.waitForTimeout(400);
    const d2 = await page.evaluate(DRAWER_READ);
    // Paired: it WAS open immediately before (d0.open / dLess rows), so "closed"
    // here is a transition and not a drawer that never opened.
    if (!d2.open) pass(`${T} double-click COLLAPSES the drawer`, { wasOpen: d0.open, nowOpen: d2.open });
    else fail(`${T} double-click collapse`, { wasOpen: d0.open, nowOpen: d2.open });
  }

  // ── console ────────────────────────────────────────────────────────────
  if (consoleErrors.length === 0) pass(`${T} console clean`, { errors: 0 });
  else note(`${T} console errors`, { count: consoleErrors.length, first: consoleErrors.slice(0, 3) });

  await ctx.close();
}

await browser.close();

console.log("\n──────── SUMMARY ────────");
console.log(`tiers measured: ${measured.join(", ") || "NONE"}`);
console.log(`failures: ${failures.length}`);
for (const f of failures) console.log(`  · ${f.what}`);
process.exit(failures.length ? 1 : 0);
