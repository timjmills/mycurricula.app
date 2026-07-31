// probe-qa-timeline-3.mjs — GATED re-check of the two questions probe-2
// VOIDED itself on. REPORT ONLY.
//
// probe-2 waited a flat 3s, clicked "Lessons", and read back `data-lens="units"`
// — its own control told it the tree was not interactive yet, so every reading
// it took after that is void. (Dev hydration here runs 5–9s.) This probe
// replaces the flat wait with a real GATE: it flips the lens in a retry loop
// and refuses to measure anything until it has SEEN `data-lens` change. Only
// then does it ask the two questions:
//   A. is `data-mounted` still absent AFTER a proven-live interaction?
//   B. does any dot carry text in the LESSONS lens at max zoom?
import { chromium } from "playwright";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const OUT = "docs/screenshots/qa-timeline";
const log = (k, v) => console.log(`[${k}] ${JSON.stringify(v)}`);

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await bypassLogin(ctx, { base: BASE, next: "/planner", retries: 2, timeout: 120000 });
const page = await ctx.newPage();
await page.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector("[data-lane-subject]", { timeout: 120000 });

const lens = () => page.evaluate(() => {
  const c = document.querySelector("[class*='timeline_card__']");
  return c && c.getAttribute("data-lens");
});

/* ── THE GATE: keep trying until an interaction demonstrably lands ───── */
let gated = false;
let attempts = 0;
for (let i = 0; i < 40; i++) {
  attempts = i + 1;
  await page.getByRole("radio", { name: "Lessons", exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(1000);
  if ((await lens()) === "lessons") {
    gated = true;
    break;
  }
}
log("GATE: interaction landed (lens flipped to 'lessons')", { gated, attemptsNeeded: attempts });
if (!gated) {
  log("ABORT", "never became interactive — nothing below would mean anything");
  await browser.close();
  process.exit(0);
}

/* ── A. data-mounted AFTER a proven-live interaction ─────────────────── */
await page.getByRole("radio", { name: "Units", exact: true }).first().click();
await page.waitForTimeout(900);
const back = await lens();
const mount = await page.evaluate(() => {
  const c = document.querySelector("[class*='timeline_card__']");
  return {
    cardAttrs: c ? [...c.attributes].map((a) => `${a.name}="${a.value}"`) : null,
    anyDataMountedInDoc: document.querySelectorAll("[data-mounted]").length,
    nowSubtitleText: /Now:/.test(document.body.innerText),
    todayMarks: document.querySelectorAll("[data-today]").length,
  };
});
log("A. mount seam after proven-live interactions", { lensRoundTrippedTo: back, ...mount });

/* ── B. LESSONS lens at max zoom — any dot text? ─────────────────────── */
await page.getByRole("radio", { name: "Lessons", exact: true }).first().click();
await page.waitForTimeout(900);
const inLessons = await lens();
// drive the slider and CONFIRM it landed before reading dot text
let dayPx = null;
for (let i = 0; i < 15; i++) {
  await page.locator("#tl-zoom").evaluate((el) => {
    const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    s.call(el, "130");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.waitForTimeout(700);
  dayPx = await page.evaluate(
    () => +document.querySelector("[data-tl-day]").getBoundingClientRect().width.toFixed(1),
  );
  if (dayPx >= 129) break;
}
const text = await page.evaluate(() => {
  const dots = [...document.querySelectorAll("[class*='timeline_dot__']")];
  const bands = [...document.querySelectorAll("[class*='timeline_bandName__']")];
  return {
    dotCount: dots.length,
    dotsWithText: dots.filter((d) => (d.textContent || "").trim()).length,
    // POSITIVE CONTROL in the same eval: band labels DO carry text
    _controlBandsWithText: bands.filter((b) => (b.textContent || "").trim()).length,
    _sample: bands.length ? bands[0].textContent.trim() : null,
  };
});
log("B. LESSONS lens at max zoom — dot text", { lens: inLessons, dayPxApplied: dayPx, ...text });
await page.screenshot({ path: `${OUT}/desktop-11-lessons-zoom130-gated.png` });

/* ── C. the desktop slider's resting mismatch ────────────────────────── */
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("[data-lane-subject]", { timeout: 120000 });
// gate again on this fresh page
for (let i = 0; i < 40; i++) {
  await page.getByRole("radio", { name: "Lessons", exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  if ((await lens()) === "lessons") break;
}
await page.getByRole("radio", { name: "Units", exact: true }).first().click();
await page.waitForTimeout(700);
const w = () =>
  page.evaluate(() => +document.querySelector("[data-tl-day]").getBoundingClientRect().width.toFixed(1));
const rest = { thumb: await page.locator("#tl-zoom").inputValue(), dayPx: await w() };
await page.locator("#tl-zoom").focus();
await page.keyboard.press("ArrowRight"); // the user asks for WIDER columns
await page.waitForTimeout(700);
const after = { thumb: await page.locator("#tl-zoom").inputValue(), dayPx: await w() };
log("C. slider at rest → one ArrowRight (user asks for WIDER)", {
  rest,
  after,
  columnsGotNARROWER: after.dayPx < rest.dayPx,
  jumpPx: +(after.dayPx - rest.dayPx).toFixed(1),
});
await page.screenshot({ path: `${OUT}/desktop-12-slider-nudge-gated.png` });

/* ── G. Lessons+List: does the status dot overlap the row / its title? ── */
{
  await page.getByRole("radio", { name: "Lessons", exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  const listBtn = page.getByRole("radio", { name: "List", exact: true });
  for (let i = 0; i < 15; i++) {
    await listBtn.first().click().catch(() => {});
    await page.waitForTimeout(700);
    if (await page.locator('[role="radiogroup"][aria-label="Organize by"]').count()) break;
  }
  await page.mouse.move(1300, 800); // park the pointer off the toolbar
  await page.waitForTimeout(500);
  const overlap = await page.evaluate(() => {
    const row = document.querySelector("[class*='timeline_row__']");
    if (!row) return { rowFound: false };
    const dot = row.querySelector("[class*='dot'],[class*='Dot']");
    const title = [...row.querySelectorAll("*")].find((e) => /Week \d+ lesson/.test(e.textContent || "") && e.children.length === 0);
    const rr = row.getBoundingClientRect();
    const dr = dot && dot.getBoundingClientRect();
    const tr = title && title.getBoundingClientRect();
    return {
      rowFound: true,
      row: { x: +rr.x.toFixed(1), y: +rr.y.toFixed(1), h: +rr.height.toFixed(1) },
      dot: dr && { x: +dr.x.toFixed(1), y: +dr.y.toFixed(1), w: +dr.width.toFixed(1), h: +dr.height.toFixed(1) },
      title: tr && { x: +tr.x.toFixed(1), y: +tr.y.toFixed(1) },
      dotOverflowsRowLeft: dr ? dr.x < rr.x : null,
      dotOverflowsRowTop: dr ? dr.y < rr.y : null,
      dotOverlapsTitleX: dr && tr ? dr.x + dr.width > tr.x : null,
      _controlRows: document.querySelectorAll("[class*='timeline_row__']").length,
    };
  });
  log("G. Lessons+List row: status dot vs row box and title", overlap);
  await page.screenshot({ path: `${OUT}/desktop-14-list-row-dot.png` });
  await page.getByRole("radio", { name: "Timeline", exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(600);
  await page.getByRole("radio", { name: "Units", exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(600);
}

/* ── D. WHY is the mount seam missing on desktop only? ───────────────────
   Two rival explanations for "no today line / no 'Now:' subtitle":
     (i)  the mount seam never lands (desktop-only hydration mismatch), or
     (ii) today (2026-07-31) simply sits outside this plan's axis, which
          starts in August — in which case those marks are correctly absent
          on EVERY tier and the seam is a red herring.
   A desktop-only reading cannot separate them. So measure the same marks on
   a PHONE context, where the seam IS present, and compare. */
{
  const pctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });
  const perrs = [];
  pctx.on("console", (m) => {
    if (m.type() === "error") perrs.push(m.text().slice(0, 160));
  });
  await bypassLogin(pctx, { base: BASE, next: "/planner", retries: 2, timeout: 120000 });
  const p = await pctx.newPage();
  await p.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForSelector("[data-lane-subject]", { timeout: 120000 });
  await p.waitForSelector("[data-mounted]", { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(2000);
  const phone = await p.evaluate(() => {
    const c = document.querySelector("[class*='timeline_card__']");
    return {
      cardAttrs: c ? [...c.attributes].map((a) => `${a.name}="${a.value}"`) : null,
      mounted: document.querySelectorAll("[data-mounted]").length,
      nowSubtitle: /Now:/.test(document.body.innerText),
      todayMarks: document.querySelectorAll("[data-today]").length,
      _controlLanes: document.querySelectorAll("[data-lane-subject]").length,
    };
  });
  log("D. PHONE (seam present) — same marks, for comparison", { ...phone, consoleErrors: perrs.length ? perrs : "none" });

  /* E. The lens/mode toggle options measure 34px tall on the touch tiers. The
     stylesheet claims a ≥44px `::before` hit-area inflation under coarse
     pointers — reporting "34px, fails the contract" without testing that
     would be a false positive. So hit-test real points ABOVE and BELOW the
     visible box and see whether the button is what is actually hit. */
  const hit = await p.evaluate(() => {
    const g = document.querySelector('[role="radiogroup"][aria-label="What the plan shows"]');
    if (!g) return { found: false };
    const b = g.querySelector('[role="radio"]');
    const r = b.getBoundingClientRect();
    const cx = r.x + r.width / 2;
    const probe = (dy) => {
      const el = document.elementFromPoint(cx, dy);
      return el ? (el === b || b.contains(el) || el.contains(b) ? "button" : el.tagName + "." + String(el.className).slice(0, 24)) : "none";
    };
    const cs = getComputedStyle(b, "::before");
    return {
      found: true,
      visibleBox: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
      beforeHeight: cs.height,
      beforeInset: `${cs.top} ${cs.right} ${cs.bottom} ${cs.left}`,
      hitAt_topMinus5: probe(r.y - 5),
      hitAt_centre: probe(r.y + r.height / 2),
      hitAt_bottomPlus5: probe(r.y + r.height + 5),
    };
  });
  log("E. PHONE toggle option — real hit area vs 34px visible box", hit);
  await p.screenshot({ path: `${OUT}/phone-13-toggle-hit.png` });

  /* F. How far down a 812px phone viewport is the FIRST piece of plan data? */
  const fold = await p.evaluate(() => {
    const lane = document.querySelector("[data-lane-subject]");
    const card = document.querySelector("[class*='timeline_card__']");
    const band = document.querySelector("[class*='timeline_bandName__']");
    return {
      viewportH: innerHeight,
      cardTopY: card ? Math.round(card.getBoundingClientRect().top + scrollY) : null,
      firstLaneTopY: lane ? Math.round(lane.getBoundingClientRect().top + scrollY) : null,
      firstBandTopY: band ? Math.round(band.getBoundingClientRect().top + scrollY) : null,
      _controlLanes: document.querySelectorAll("[data-lane-subject]").length,
    };
  });
  log("F. PHONE — vertical distance to the first plan datum", fold);
  await pctx.close();
}

await browser.close();
console.log("done");
