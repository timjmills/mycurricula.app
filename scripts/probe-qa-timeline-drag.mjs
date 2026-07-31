// probe-qa-timeline-drag.mjs — METHOD A (video + frames) for the unit-band
// drag on /planner, 2026-07-31 QA audit. REPORT ONLY.
//
// The first attempt reported "0 bands carry data-draggable in Team mode" —
// and that was a FAILED CONTROL, not a finding: the screenshot showed the
// Personal/Team pill still on Personal with only its tooltip open. An absence
// assertion behind a switch that never flipped proves nothing. So this probe
// refuses to measure the drag until it has SEEN `aria-pressed="true"` on the
// Team button. If the switch does not flip, it reports BLOCKED, not "broken".
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const OUT = "docs/screenshots/qa-timeline";
const FR = `${OUT}/frames`;
mkdirSync(FR, { recursive: true });
mkdirSync(`${OUT}/video`, { recursive: true });
const log = (k, v) => console.log(`[${k}] ${JSON.stringify(v)}`);

// PROBE_TIER=tablet runs the same script on a genuinely coarse 768 context.
// Worth having: the desktop context on this machine does not accept its first
// click for >44 s (see the audit's finding on the desktop mount seam), which
// blocks the drag work entirely, while 768 hydrates promptly — and the coarse
// tier is also the only place the band grip's touch box can be measured.
const TIER = process.env.PROBE_TIER === "tablet"
  ? { w: 768, h: 1024, mobile: true, dsf: 2 }
  : { w: 1440, h: 900, mobile: false, dsf: 1 };
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({
  viewport: { width: TIER.w, height: TIER.h },
  isMobile: TIER.mobile,
  hasTouch: TIER.mobile,
  deviceScaleFactor: TIER.dsf,
  recordVideo: { dir: `${OUT}/video`, size: { width: TIER.w, height: TIER.h } },
});
log("TIER", TIER);
const errs = [];
await bypassLogin(ctx, { base: BASE, next: "/planner", retries: 2, timeout: 120000 });
const page = await ctx.newPage();
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
await page.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector("[data-lane-subject]", { timeout: 120000 });
await page.waitForTimeout(3500);

let n = 0;
const shot = async (tag) => {
  n += 1;
  const f = `${FR}/f${String(n).padStart(3, "0")}_${tag}.png`;
  await page.screenshot({ path: f });
  return f;
};

const modeState = () =>
  page.evaluate(() => {
    const personal = document.querySelector('button[aria-label="Personal"]');
    const team = document.querySelector('button[aria-label="Team Curriculum"]');
    return {
      personalPressed: personal && personal.getAttribute("aria-pressed"),
      teamPressed: team && team.getAttribute("aria-pressed"),
      teamHasActiveClass: team && /\bactive\b/.test(team.className),
      dataModeEls: [...document.querySelectorAll("[data-mode]")].map((e) => e.getAttribute("data-mode")),
      // POSITIVE CONTROL — the surface is painted regardless of mode
      _bands: document.querySelectorAll("[class*='timeline_bandName__']").length,
      _lanes: document.querySelectorAll("[data-lane-subject]").length,
    };
  });

log("MODE before", await modeState());
await shot("before-team-click");

// HYDRATION GATE. Dev hydration here runs 5–9s, and a click dispatched before
// React attaches is silently swallowed — the first attempt at this probe read
// "0 draggable bands in Team mode" purely because its Team click never landed.
// So prove the tree is interactive with a control that has a visible effect
// (the lens attribute) BEFORE touching the mode switch.
const lens = () =>
  page.evaluate(() => {
    const c = document.querySelector("[class*='timeline_card__']");
    return c && c.getAttribute("data-lens");
  });
// Be patient. The first run of this probe gave up after ~40 s and aborted;
// the Method-B pass had incidentally waited ~90 s (a `waitForSelector` that
// timed out) before ITS clicks landed, so the surface does eventually become
// interactive — the gate was simply shorter than the settle.
let live = false;
const t0 = Date.now();
for (let i = 0; i < 150 && !live; i++) {
  await page.getByRole("radio", { name: "Lessons", exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  live = (await lens()) === "lessons";
}
log("GATE timing", { secondsToInteractive: live ? Math.round((Date.now() - t0) / 1000) : null });
await page.getByRole("radio", { name: "Units", exact: true }).first().click().catch(() => {});
await page.waitForTimeout(700);
log("HYDRATION GATE: tree is interactive", { live, lensBackTo: await lens() });
if (!live) {
  log("ABORT", "never became interactive — no assertion below would mean anything");
  await browser.close();
  process.exit(0);
}

// Now click Team, and RETRY until aria-pressed flips (or give up and say so).
let flipped = false;
for (let i = 0; i < 10 && !flipped; i++) {
  await page.getByRole("button", { name: "Team Curriculum", exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  flipped = (await modeState()).teamPressed === "true";
}
await shot("after-team-click");
log("MODE after click (pre-dismiss)", { flipped, ...(await modeState()) });

// The team-mode intro popover's only affirmative dismissal is "Got it".
const gotIt = page.getByRole("button", { name: /Got it/i });
const hadIntro = await gotIt.count();
if (hadIntro) {
  await gotIt.first().click();
  await page.waitForTimeout(900);
}
log("team-mode intro popover present", hadIntro);
await page.mouse.move(700, 300);
await page.waitForTimeout(600);
const mode = await modeState();
log("MODE after dismiss", mode);
await shot("team-mode-settled");

if (mode.teamPressed !== "true") {
  log("BLOCKED", {
    why: "the Personal/Team switch did not flip — every drag assertion below would be an absence check behind a failed control",
    mode,
  });
} else {
  const bands = await page.evaluate(() => ({
    draggable: document.querySelectorAll("[data-draggable]").length,
    grips: document.querySelectorAll('button[aria-label^="Change how many weeks"]').length,
    _controlBands: document.querySelectorAll("[class*='timeline_bandName__']").length,
  }));
  log("DRAG affordances in Team mode", bands);

  if (bands.draggable > 0) {
    const band = page.locator("[data-draggable]").first();
    const dayPx = await page.evaluate(
      () => +document.querySelector("[data-tl-day]").getBoundingClientRect().width.toFixed(2),
    );
    const weekPx = dayPx * 5;
    const before = await band.evaluate((b) => ({
      title: b.getAttribute("title"),
      x: +b.getBoundingClientRect().x.toFixed(1),
      w: +b.getBoundingClientRect().width.toFixed(1),
    }));
    log("BAND before MOVE", { ...before, dayPx, weekPx });

    // PICK A GRAB POINT THAT IS NOT A LESSON DOT. The dots are real <button>s
    // painted on top of the band (44px wide on a coarse pointer, 22px on a
    // fine one), and the band's left edge is exactly where the first one sits.
    // Grabbing at a fixed `x + 30` lands on the dot, whose pointerdown never
    // calls `begin` — which looks *identical* to "drag is broken". So hit-test
    // for a point the band itself actually owns.
    const grab = await page.evaluate(() => {
      const b = document.querySelector("[data-draggable]");
      const r = b.getBoundingClientRect();
      const y = r.y + r.height / 2;
      const limit = Math.min(r.x + r.width - 8, innerWidth - 8);
      for (let x = r.x + 8; x < limit; x += 4) {
        const el = document.elementFromPoint(x, y);
        if (el && (el === b || b.contains(el)) && !/dot/i.test(String(el.className))) {
          return { x, y, ownedBy: String(el.className).slice(0, 40) };
        }
      }
      return null;
    });
    log("GRAB POINT (hit-tested to be the band, not a dot)", grab);
    if (!grab) {
      log("BLOCKED", "no point on the band is free of lesson dots");
      await browser.close();
      process.exit(0);
    }
    const bb = { x: grab.x, y: grab.y - 1, height: 2 };
    await shot("move-00-before");
    await page.mouse.move(bb.x, bb.y + bb.height / 2);
    await page.mouse.down();
    await shot("move-01-pointerdown");
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(bb.x + (weekPx * i) / 12, bb.y + bb.height / 2);
      await page.waitForTimeout(80);
      const st = await page.evaluate(() => ({
        dragging: document.querySelectorAll("[data-dragging]").length,
        ghosts: document.querySelectorAll("[class*='dragGhost']").length,
      }));
      if (i <= 2 || i % 3 === 0)
        log(`MOVE step ${i} dx=${((weekPx * i) / 12).toFixed(0)}px → ${await shot(`move-${String(i + 1).padStart(2, "0")}-drag${st.dragging}-ghost${st.ghosts}`)}`, st);
    }
    await page.mouse.up();
    await page.waitForTimeout(1100);
    await shot("move-99-after");
    const after = await page.locator("[data-draggable]").first().evaluate((b) => ({
      title: b.getAttribute("title"),
      x: +b.getBoundingClientRect().x.toFixed(1),
      w: +b.getBoundingClientRect().width.toFixed(1),
    }));
    log("BAND after MOVE", {
      titleBefore: before.title,
      titleAfter: after.title,
      committed: before.title !== after.title,
      dx: +(after.x - before.x).toFixed(1),
      expectedWeekPx: +weekPx.toFixed(1),
      widthChanged: Math.abs(after.w - before.w) > 1,
    });
    log("post-drag cleanup (both must be 0)", await page.evaluate(() => ({
      dragging: document.querySelectorAll("[data-dragging]").length,
      ghosts: document.querySelectorAll("[class*='dragGhost']").length,
    })));

    /* RIGHT-EDGE RESIZE */
    await page.locator("[data-draggable]").first().hover();
    await page.waitForTimeout(400);
    await shot("resize-00-hover");
    const grip = page.getByRole("button", { name: /^Change how many weeks/ }).first();
    if (await grip.count()) {
      // THE GRIP IS USUALLY OFF-SCREEN. A 6-week band at the coarse floor is
      // 6 × 5 × 46 = 1380px wide, so on a 768 viewport its right edge sits at
      // x≈1569 — outside the window. Driving the mouse there moves nothing and
      // reads exactly like "resize is broken" (the first run of this probe
      // reported grewPx: 0 for precisely that reason). Bring it into view and
      // re-read the box before touching it.
      await grip.scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(600);
      await page.locator("[data-draggable]").first().hover().catch(() => {});
      await page.waitForTimeout(300);
      const gb = await grip.boundingBox();
      log("GRIP box after scrolling it into view", {
        gb: gb && { x: +gb.x.toFixed(1), y: +gb.y.toFixed(1), w: +gb.width.toFixed(1), h: +gb.height.toFixed(1) },
        viewportW: TIER.w,
        onScreen: gb ? gb.x >= 0 && gb.x + gb.width <= TIER.w : null,
      });
      if (!gb || gb.x + gb.width > TIER.w || gb.x < 0) {
        log("RESIZE BLOCKED", "grip still off-viewport — a 0px result here would be an artifact, not a finding");
      } else {
      const g = await grip.evaluate((el) => ({
        w: +el.getBoundingClientRect().width.toFixed(1),
        h: +el.getBoundingClientRect().height.toFixed(1),
        beforeOpacity: getComputedStyle(el, "::before").opacity,
        cursor: getComputedStyle(el).cursor,
      }));
      log("GRIP geometry (fine pointer, hovered)", g);
      const wB = (await page.locator("[data-draggable]").first().boundingBox()).width;
      const tB = await page.locator("[data-draggable]").first().getAttribute("title");
      await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
      await page.mouse.down();
      await shot("resize-01-down");
      for (let i = 1; i <= 10; i++) {
        await page.mouse.move(gb.x + gb.width / 2 + (weekPx * i) / 10, gb.y + gb.height / 2);
        await page.waitForTimeout(80);
        if (i % 3 === 0) await shot(`resize-${String(i + 1).padStart(2, "0")}`);
      }
      await page.mouse.up();
      await page.waitForTimeout(1100);
      await shot("resize-99-after");
      const wA = (await page.locator("[data-draggable]").first().boundingBox()).width;
      const tA = await page.locator("[data-draggable]").first().getAttribute("title");
      log("BAND after RESIZE", {
        wBefore: +wB.toFixed(1),
        wAfter: +wA.toFixed(1),
        grewPx: +(wA - wB).toFixed(1),
        expectedWeekPx: +weekPx.toFixed(1),
        titleBefore: tB,
        titleAfter: tA,
      });
      }
    } else {
      log("GRIP", "not found after hover");
    }

    /* sub-threshold: a 2px twitch must not re-pace */
    const b3 = await page.locator("[data-draggable]").first().boundingBox();
    const t3 = await page.locator("[data-draggable]").first().getAttribute("title");
    await page.mouse.move(b3.x + 30, b3.y + b3.height / 2);
    await page.mouse.down();
    await page.mouse.move(b3.x + 32, b3.y + b3.height / 2, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    log("sub-threshold 2px drag", {
      titleBefore: t3,
      titleAfter: await page.locator("[data-draggable]").first().getAttribute("title"),
      urlNow: page.url(),
    });

    /* keyboard parity: Shift+Arrow */
    const kb = page.locator("[data-draggable]").first();
    const tk = await kb.getAttribute("title");
    await kb.focus();
    await page.keyboard.press("Shift+ArrowRight");
    await page.waitForTimeout(900);
    await shot("kbd-after-shift-right");
    log("keyboard Shift+ArrowRight", {
      titleBefore: tk,
      titleAfter: await page.locator("[data-draggable]").first().getAttribute("title"),
    });
  }
}
log("pageerrors", errs.length ? errs : "none");
const vid = page.video();
await ctx.close();
log("VIDEO", await vid.path().catch(() => "n/a"));
await browser.close();
