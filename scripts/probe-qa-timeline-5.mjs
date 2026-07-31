// probe-qa-timeline-5.mjs — the leftovers probe-3 crashed before reaching
// (it died on a `page.reload` timeout under load). REPORT ONLY.
//
// Every measurement here sits behind the same hydration GATE probe-3 proved is
// necessary: a flat wait is not enough on this machine (probe-3's gate needed
// 36 retries), and readings taken before the tree is interactive are worthless
// — that is exactly how an earlier pass "found" a missing `data-mounted` that
// is in fact present.
import { chromium } from "playwright";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const OUT = "docs/screenshots/qa-timeline";
const log = (k, v) => console.log(`[${k}] ${JSON.stringify(v)}`);
const browser = await chromium.launch({ channel: "chrome" });

async function landAndGate(opts) {
  const ctx = await browser.newContext(opts);
  await bypassLogin(ctx, { base: BASE, next: "/planner", retries: 2, timeout: 120000 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector("[data-lane-subject]", { timeout: 120000 });
  const lens = () =>
    page.evaluate(() => {
      const c = document.querySelector("[class*='timeline_card__']");
      return c && c.getAttribute("data-lens");
    });
  let live = false;
  for (let i = 0; i < 90 && !live; i++) {
    await page.getByRole("radio", { name: "Lessons", exact: true }).first().click().catch(() => {});
    await page.waitForTimeout(1200);
    live = (await lens()) === "lessons";
  }
  await page.getByRole("radio", { name: "Units", exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(700);
  return { ctx, page, live, lens };
}

/* ── DESKTOP ─────────────────────────────────────────────────────────── */
{
  const { ctx, page, live } = await landAndGate({ viewport: { width: 1440, height: 900 } });
  log("DESKTOP gate", { live });
  if (live) {
    // A. the slider's RESTING value, read only after hydration and WITHOUT
    //    having touched the slider (so `value` state is still null and what we
    //    read is the component's own idea of the default).
    const w = () =>
      page.evaluate(() => +document.querySelector("[data-tl-day]").getBoundingClientRect().width.toFixed(1));
    const rest = {
      thumb: await page.locator("#tl-zoom").inputValue(),
      min: await page.locator("#tl-zoom").getAttribute("min"),
      dayPx: await w(),
    };
    await page.screenshot({ path: `${OUT}/desktop-16-slider-rest-gated.png` });
    await page.locator("#tl-zoom").focus();
    await page.keyboard.press("ArrowRight"); // the teacher asks for WIDER
    await page.waitForTimeout(700);
    const after = { thumb: await page.locator("#tl-zoom").inputValue(), dayPx: await w() };
    log("A. desktop slider at rest → one ArrowRight", {
      rest,
      after,
      thumbAgreesWithCanvasAtRest: Number(rest.thumb) === rest.dayPx,
      columnsGotNARROWER: after.dayPx < rest.dayPx,
      jumpPx: +(after.dayPx - rest.dayPx).toFixed(1),
    });
    await page.screenshot({ path: `${OUT}/desktop-17-slider-after-right.png` });

    // A1b. `.cp-root button { cursor: pointer }` (0,1,1) outranks the single-
    //      class rules `.band { cursor: grab }` (:468) and `.bandGrip {
    //      cursor: ew-resize }` (:494). timeline.module.css:466 says of the
    //      band cursor: "cursor is the first place that promise is either kept
    //      or broken." Measure whether it is kept.
    const cursors = await page.evaluate(() => {
      const band = document.querySelector("[class*='timeline_band__']");
      const grip = document.querySelector('button[aria-label^="Change how many weeks"]');
      const arrow = document.querySelector('button[aria-label="Scroll forward two weeks"]');
      return {
        bandFound: !!band, // ← controls
        bandCursor: band ? getComputedStyle(band).cursor : null,
        bandCursorWanted: "grab",
        gripFound: !!grip,
        gripCursor: grip ? getComputedStyle(grip).cursor : null,
        gripCursorWanted: "ew-resize",
        arrowCursor: arrow ? getComputedStyle(arrow).cursor : null,
        _controlLanes: document.querySelectorAll("[data-lane-subject]").length,
      };
    });
    log("A1b. computed cursors vs what the stylesheet asks for", cursors);

    // A2. Do the scroll arrows work, and does the DATE HEADER stay aligned
    //     with the band track afterwards? A 2 fps video frame from the drag
    //     pass showed band labels clipped at the left while the header still
    //     read "Su 3, Mo 4" — which would mean the axis lies about which week
    //     a unit sits in. A compressed frame is not evidence; this is.
    const align = async (tag) =>
      page.evaluate(() => {
        const day = document.querySelector("[data-tl-day]");
        const band = document.querySelector("[class*='timeline_band__']") || document.querySelector("[data-draggable]") || document.querySelector("[class*='bandWrap']");
        const scroller = document.querySelector("[class*='timeline_scroller__']");
        return {
          scrollLeft: scroller ? Math.round(scroller.scrollLeft) : null,
          scrollW: scroller ? scroller.scrollWidth : null,
          clientW: scroller ? scroller.clientWidth : null,
          firstDayX: day ? +day.getBoundingClientRect().x.toFixed(1) : null,
          firstBandX: band ? +band.getBoundingClientRect().x.toFixed(1) : null,
          _controlLanes: document.querySelectorAll("[data-lane-subject]").length,
        };
      });
    const beforeScroll = await align();
    await page.locator('button[aria-label="Scroll forward two weeks"]').click({ force: true });
    await page.waitForTimeout(900);
    const afterScroll = await align();
    log("A2. scroll-forward arrow: does it scroll, and do header+bands stay aligned?", {
      beforeScroll,
      afterScroll,
      scrolled: afterScroll.scrollLeft > beforeScroll.scrollLeft,
      // both live inside the same scroller, so their x must shift together
      dayShift: +(afterScroll.firstDayX - beforeScroll.firstDayX).toFixed(1),
      bandShift: +(afterScroll.firstBandX - beforeScroll.firstBandX).toFixed(1),
      headerAndBandsStayAligned:
        Math.abs(
          afterScroll.firstDayX - beforeScroll.firstDayX - (afterScroll.firstBandX - beforeScroll.firstBandX),
        ) < 2,
    });
    await page.screenshot({ path: `${OUT}/desktop-19-after-scroll-arrow.png` });

    // A3. After scrolling, is the STICKY subject label still the topmost thing
    //     at its own centre, or do unit bands paint over it? A drag-pass video
    //     frame showed the "Math" label gone while "Reading" survived, which
    //     would mean a scrolled timeline can hide a lane's subject identity.
    const labels = await page.evaluate(() => {
      const lanes = [...document.querySelectorAll("[data-lane-subject]")];
      return {
        _controlLanes: lanes.length,
        perLane: lanes.slice(0, 4).map((lane) => {
          const subj = lane.getAttribute("data-lane-subject");
          // the label cell is the lane's first child box on the left
          const lbl = lane.querySelector("[class*='laneLabel'],[class*='label']");
          if (!lbl) return { subj, labelFound: false };
          const r = lbl.getBoundingClientRect();
          const cx = r.x + r.width / 2;
          const cy = r.y + r.height / 2;
          const top = document.elementFromPoint(cx, cy);
          return {
            subj,
            labelFound: true,
            labelBox: { x: +r.x.toFixed(1), w: +r.width.toFixed(1) },
            labelText: (lbl.textContent || "").trim().slice(0, 20),
            topmostAtLabelCentre: top
              ? top === lbl || lbl.contains(top) || top.contains(lbl)
                ? "the label"
                : top.tagName + "." + String(top.className).slice(0, 28)
              : "nothing",
          };
        }),
      };
    });
    log("A3. after scrolling: is the sticky subject label still on top?", labels);

    // B. Lessons+List: does the status dot straddle the row's left edge?
    await page.getByRole("radio", { name: "Lessons", exact: true }).first().click().catch(() => {});
    await page.waitForTimeout(700);
    for (let i = 0; i < 20; i++) {
      await page.getByRole("radio", { name: "List", exact: true }).first().click().catch(() => {});
      await page.waitForTimeout(600);
      if (await page.locator('[role="radiogroup"][aria-label="Organize by"]').count()) break;
    }
    await page.mouse.move(1350, 820); // park the pointer off the toolbar
    await page.waitForTimeout(500);
    const row = await page.evaluate(() => {
      const r0 = document.querySelector("[class*='timeline_row__']");
      if (!r0) return { rowFound: false };
      const rr = r0.getBoundingClientRect();
      const dot = r0.querySelector("[class*='dot'],[class*='Dot']");
      const dr = dot && dot.getBoundingClientRect();
      return {
        rowFound: true,
        row: { x: +rr.x.toFixed(1), y: +rr.y.toFixed(1), w: +rr.width.toFixed(1), h: +rr.height.toFixed(1) },
        dot: dr && { x: +dr.x.toFixed(1), y: +dr.y.toFixed(1), w: +dr.width.toFixed(1), h: +dr.height.toFixed(1) },
        dotLeftOfRow: dr ? +(rr.x - dr.x).toFixed(1) : null,
        dotAboveRow: dr ? +(rr.y - dr.y).toFixed(1) : null,
        _controlRows: document.querySelectorAll("[class*='timeline_row__']").length,
      };
    });
    log("B. Lessons+List first row: status dot vs the row box", row);
    await page.screenshot({ path: `${OUT}/desktop-18-list-row-dot.png` });
  }
  await ctx.close();
}

/* ── PHONE ───────────────────────────────────────────────────────────── */
{
  const { ctx, page, live } = await landAndGate({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  });
  log("PHONE gate", { live });
  if (live) {
    // C. toggle options measure 34px tall; the stylesheet claims a ≥44px
    //    ::before hit inflation on coarse pointers. Hit-test it rather than
    //    reporting the visible box as a contract failure.
    const hit = await page.evaluate(() => {
      const g = document.querySelector('[role="radiogroup"][aria-label="What the plan shows"]');
      if (!g) return { found: false };
      const b = g.querySelector('[role="radio"]');
      const r = b.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const probe = (y) => {
        const el = document.elementFromPoint(cx, y);
        if (!el) return "nothing";
        return el === b || b.contains(el) || el.contains(b)
          ? "the toggle"
          : el.tagName + "." + String(el.className).slice(0, 22);
      };
      const cs = getComputedStyle(b, "::before");
      return {
        found: true,
        visibleBox: { w: +r.width.toFixed(1), h: +r.height.toFixed(1) },
        beforeHeight: cs.height,
        beforeTop: cs.top,
        hitAt_5pxAbove: probe(r.y - 5),
        hitAt_centre: probe(r.y + r.height / 2),
        hitAt_5pxBelow: probe(r.y + r.height + 5),
        _controlLanes: document.querySelectorAll("[data-lane-subject]").length,
      };
    });
    log("C. PHONE toggle — real hit area vs the 34px visible box", hit);

    // D. how far down the phone viewport is the first plan datum?
    const fold = await page.evaluate(() => {
      const lane = document.querySelector("[data-lane-subject]");
      const card = document.querySelector("[class*='timeline_card__']");
      return {
        viewportH: innerHeight,
        cardTopY: card ? Math.round(card.getBoundingClientRect().top + scrollY) : null,
        firstLaneTopY: lane ? Math.round(lane.getBoundingClientRect().top + scrollY) : null,
        _controlLanes: document.querySelectorAll("[data-lane-subject]").length,
      };
    });
    log("D. PHONE — distance to the first plan datum", fold);

    // E. the mount seam + today marks on phone, for the desktop comparison
    const seam = await page.evaluate(() => {
      const c = document.querySelector("[class*='timeline_card__']");
      return {
        cardAttrs: c ? [...c.attributes].map((a) => `${a.name}="${a.value}"`) : null,
        mountedCount: document.querySelectorAll("[data-mounted]").length,
        todayMarks: document.querySelectorAll("[data-today]").length,
        nowSubtitle: /Now:/.test(document.body.innerText),
      };
    });
    log("E. PHONE mount seam + today marks", seam);
  }
  await ctx.close();
}

await browser.close();
console.log("done");
