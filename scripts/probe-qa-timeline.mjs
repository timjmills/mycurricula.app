// probe-qa-timeline.mjs — LIVE QA AUDIT of the /planner Plan timeline
// (CLAUDE.md §4b). 2026-07-31. REPORT ONLY — this probe changes no source.
//
// Method B (screenshots) for the static checks: zoom stops, toggle visibility,
// drawer tabs, touch targets, horizontal scroll — at 375 / 768 / 1440.
// Method A (video + frames) for the unit-band drag, because a drag is
// time-based behaviour that stills between states cannot explain.
//
// THE THREE TRAPS THIS PROBE IS BUILT AROUND
//
//  1. ABSENCE ASSERTIONS FAIL OPEN. "The mode pair is not there" passes
//     trivially against a surface that never rendered. Every absence check
//     below calls `control()` FIRST, which asserts a known-present element in
//     the SAME evaluation — lanes > 0 and a non-empty band name. If the
//     control fails the absence check is reported as VOID, never as a pass.
//  2. LOCAL IS THE MOCK PLANNER PATH. There is no NEXT_PUBLIC_PLANNER_USE_
//     SUPABASE locally, so hydration pins to "ready" and the pending/error
//     states are UNREACHABLE. This probe counts /rest/v1/ requests and prints
//     the count; it makes NO claim about data states.
//  3. DEVICE EMULATION LIES TWICE. A phone probe needs isMobile +
//     deviceScaleFactor, and most coarse-pointer emulations silently fake a
//     hybrid. So each tier RE-READS matchMedia for (pointer: coarse),
//     (any-pointer: coarse) and (pointer: fine) and prints what it actually
//     got, and every touch-target number is reported next to that reading.
//
//   node scripts/probe-qa-timeline.mjs
//
// Env: PROBE_BASE (default http://localhost:3014).

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const OUT = "docs/screenshots/qa-timeline";
const VID = `${OUT}/video`;
mkdirSync(OUT, { recursive: true });
mkdirSync(VID, { recursive: true });

const TIERS = [
  { name: "phone", width: 375, height: 812, mobile: true, dsf: 3 },
  { name: "tablet", width: 768, height: 1024, mobile: true, dsf: 2 },
  { name: "desktop", width: 1440, height: 900, mobile: false, dsf: 1 },
];

const results = [];
const rec = (tier, level, what, detail) => {
  results.push({ tier, level, what, detail });
  console.log(`[${level}] ${tier} :: ${what} :: ${JSON.stringify(detail)}`);
};

const browser = await chromium.launch({ channel: "chrome" });

/* ── shared: land on /planner, hydrated ───────────────────────────────── */
async function land(ctx, restBox) {
  await bypassLogin(ctx, { base: BASE, next: "/planner", retries: 2, timeout: 120000 });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") restBox.consoleErrors.push(m.text().slice(0, 240));
  });
  page.on("pageerror", (e) => restBox.consoleErrors.push(`pageerror: ${String(e).slice(0, 240)}`));
  await page.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 120000 });
  // Wait for CONTENT first (a lane), then the mount seam. Both early-return
  // empty states render NEITHER, so a timeout here is itself information.
  await page.waitForSelector("[data-lane-subject]", { timeout: 120000 });
  await page.waitForSelector("[data-mounted]", { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1200);
  return page;
}

/** POSITIVE CONTROL — proves the surface actually rendered before any
 *  absence assertion is allowed to count. Returns {ok, lanes, bandNames}. */
const CONTROL = () => {
  const lanes = document.querySelectorAll("[data-lane-subject]").length;
  const names = [...document.querySelectorAll("[class*='timeline_bandName__']")]
    .map((n) => (n.textContent || "").trim())
    .filter(Boolean);
  const card = document.querySelector("[data-lens]");
  const mounted = !!document.querySelector("[data-mounted]");
  // The control is "did the surface actually paint" — lanes + band text. The
  // mount seam is reported ALONGSIDE it rather than folded into it, because a
  // missing seam is itself a finding and must not void every other check.
  return {
    ok: lanes > 0 && names.length > 0,
    lanes,
    bandNames: names.length,
    mounted,
    cardDataAttrs: card
      ? [...card.attributes].filter((a) => a.name.startsWith("data-")).map((a) => `${a.name}=${a.value}`)
      : null,
  };
};

/* ══════════════════ PART 1 — METHOD B, static, 3 tiers ═══════════════ */
for (const tier of TIERS) {
  const box = { consoleErrors: [], rest: 0 };
  const ctx = await browser.newContext({
    viewport: { width: tier.width, height: tier.height },
    isMobile: tier.mobile,
    hasTouch: tier.mobile,
    deviceScaleFactor: tier.dsf,
  });
  ctx.on("request", (r) => {
    if (r.url().includes("/rest/v1/")) box.rest += 1;
  });

  let page;
  try {
    page = await land(ctx, box);
  } catch (e) {
    rec(tier.name, "BLOCKED", "could not land on /planner", String(e).slice(0, 200));
    await ctx.close();
    continue;
  }

  /* -- 0. emulation truth + positive control ------------------------- */
  const emu = await page.evaluate(() => ({
    pointerCoarse: matchMedia("(pointer: coarse)").matches,
    anyPointerCoarse: matchMedia("(any-pointer: coarse)").matches,
    pointerFine: matchMedia("(pointer: fine)").matches,
    hover: matchMedia("(hover: hover)").matches,
    maxTouchPoints: navigator.maxTouchPoints,
    dpr: devicePixelRatio,
    w: innerWidth,
  }));
  rec(tier.name, "EMU", "emulation actually reported by the page", emu);

  const ctrl = await page.evaluate(CONTROL);
  rec(tier.name, ctrl.ok ? "CONTROL-OK" : "CONTROL-FAIL", "positive control", ctrl);
  const guard = (label, detail) =>
    ctrl.ok
      ? rec(tier.name, "CHECK", label, detail)
      : rec(tier.name, "VOID", `${label} — control failed, absence proves nothing`, detail);

  await page.screenshot({ path: `${OUT}/${tier.name}-01-default.png`, fullPage: false });

  /* -- 1. document-level horizontal scroll --------------------------- */
  const hscroll = await page.evaluate(() => {
    const de = document.documentElement;
    const before = window.scrollX;
    window.scrollTo(400, window.scrollY);
    const moved = window.scrollX;
    window.scrollTo(before, window.scrollY);
    const main = document.querySelector("#main-content");
    return {
      docScrollW: de.scrollWidth,
      docClientW: de.clientWidth,
      bodyScrollW: document.body.scrollWidth,
      docOverflows: de.scrollWidth > de.clientWidth,
      // scrollWidth is BLIND to an overflow-x:clip bar — so also try to move.
      actuallyScrolledX: moved,
      docOverflowX: getComputedStyle(de).overflowX,
      bodyOverflowX: getComputedStyle(document.body).overflowX,
      mainScrollW: main ? main.scrollWidth : null,
      mainClientW: main ? main.clientWidth : null,
      mainOverflows: main ? main.scrollWidth > main.clientWidth : null,
    };
  });
  rec(
    tier.name,
    hscroll.docOverflows || hscroll.actuallyScrolledX > 0 ? "HSCROLL-BAD" : "HSCROLL-OK",
    "document-level horizontal scroll",
    hscroll,
  );

  /* -- 2. ZOOM: floor, ceiling, applied width ------------------------ */
  const zoomExists = (await page.locator("#tl-zoom").count()) > 0;
  const dayW = () =>
    page.evaluate(() => {
      const d = document.querySelector("[data-tl-day]");
      return d ? +d.getBoundingClientRect().width.toFixed(2) : null;
    });

  if (!zoomExists) {
    guard("zoom slider #tl-zoom missing", { zoomExists });
  } else {
    const attrs = await page.locator("#tl-zoom").evaluate((el) => ({
      min: el.min,
      max: el.max,
      step: el.step,
      value: el.value,
      aria: el.getAttribute("aria-label"),
      h: +el.getBoundingClientRect().height.toFixed(1),
      w: +el.getBoundingClientRect().width.toFixed(1),
    }));
    rec(tier.name, "ZOOM", "slider attributes at rest", { ...attrs, restingDayPx: await dayW() });

    const stops = [];
    for (const v of [16, 24, 30, 34, 44, 80, 100, 130]) {
      // `fill()` throws "Malformed value" for anything outside [min,max], which
      // is itself the answer for the sub-floor stops: the control REFUSES them.
      // Set the value natively and dispatch, so the browser's own clamp is what
      // we measure rather than Playwright's validation.
      await page.locator("#tl-zoom").evaluate((el, val) => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        ).set;
        setter.call(el, String(val));
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }, v);
      await page.waitForTimeout(180);
      const w = await dayW();
      // dot text at this stop, guarded by a positive control in the SAME eval
      const dots = await page.evaluate(() => {
        const ds = [...document.querySelectorAll("[class*='timeline_dot__']")];
        const names = [...document.querySelectorAll("[class*='timeline_bandName__']")]
          .map((n) => (n.textContent || "").trim())
          .filter(Boolean);
        return {
          dotCount: ds.length,
          dotsWithText: ds.filter((d) => (d.textContent || "").trim().length > 0).length,
          bandNamesNonEmpty: names.length, // ← the positive control
          sampleBandName: names[0] ?? null,
        };
      });
      stops.push({ requested: v, sliderValue: await page.locator("#tl-zoom").inputValue(), dayPx: w, ...dots });
      if (v === 80 || v === 130 || v === 16) {
        await page.screenshot({ path: `${OUT}/${tier.name}-02-zoom-${v}.png` });
      }
    }
    rec(tier.name, "ZOOM", "stops: requested → applied day-column px + dot text", stops);

    // THE FLOOR IS A CASCADE FACT, not a JS one. Write --tl-col-user directly
    // on the card root, below the floor, and see whether `max()` holds. A unit
    // test cannot see this; only a real layout can.
    const floorTest = await page.evaluate(() => {
      const card = document.querySelector("[data-lens]");
      if (!card) return { cardFound: false };
      const prev = card.style.getPropertyValue("--tl-col-user");
      const read = () => {
        const d = document.querySelector("[data-tl-day]");
        return d ? +d.getBoundingClientRect().width.toFixed(2) : null;
      };
      const floorVar = getComputedStyle(card).getPropertyValue("--tl-col-floor").trim();
      card.style.setProperty("--tl-col-user", "8px");
      const at8 = read();
      card.style.setProperty("--tl-col-user", "16px");
      const at16 = read();
      card.style.setProperty("--tl-col-user", "300px");
      const at300 = read();
      if (prev) card.style.setProperty("--tl-col-user", prev);
      else card.style.removeProperty("--tl-col-user");
      return { cardFound: true, floorVar, forced8px: at8, forced16px: at16, forced300px: at300 };
    });
    rec(tier.name, "ZOOM", "CSS floor holds against a sub-floor --tl-col-user?", floorTest);

    const sliderCopy = await page.locator("#tl-zoom").evaluate((el) => ({
      title: el.getAttribute("title"),
      ariaValueText: el.getAttribute("aria-valuetext"),
    }));
    rec(tier.name, "COPY", "zoom slider's own promise to the teacher", sliderCopy);

    // reset
    const resetBtn = page.getByRole("button", { name: "Reset", exact: true });
    if (await resetBtn.count()) {
      const rb = await resetBtn.first().boundingBox();
      rec(tier.name, "TOUCH", "zoom Reset button box", rb && { w: +rb.width.toFixed(1), h: +rb.height.toFixed(1) });
      await resetBtn.first().click();
      await page.waitForTimeout(200);
      rec(tier.name, "ZOOM", "day px after Reset", await dayW());
    }
  }

  /* -- 3. data-zoom attribute (prototype's roomy/cozy/compact) -------- */
  const zoomAttr = await page.evaluate(() => {
    const card = document.querySelector("[data-lens]");
    return {
      cardFound: !!card, // ← positive control for the absence below
      dataLens: card && card.getAttribute("data-lens"),
      dataZoomOnCard: card && card.getAttribute("data-zoom"),
      anyDataZoomInTimeline: (() => {
        const root = document.querySelector("[data-lens]");
        if (!root) return null;
        return [...root.querySelectorAll("[data-zoom]")].length;
      })(),
    };
  });
  guard("derived data-zoom (roomy/cozy/compact) on the timeline root", zoomAttr);

  /* -- 4. the TWO toggle pairs, in each lens -------------------------- */
  const groups = () =>
    page.evaluate(() => {
      const gs = [...document.querySelectorAll('[role="radiogroup"]')].map((g) => ({
        label: g.getAttribute("aria-label"),
        options: [...g.querySelectorAll('[role="radio"]')].map((r) => ({
          name: r.getAttribute("aria-label"),
          checked: r.getAttribute("aria-checked"),
          w: Math.round(r.getBoundingClientRect().width),
          h: Math.round(r.getBoundingClientRect().height),
        })),
      }));
      const names = [...document.querySelectorAll("[class*='timeline_bandName__']")].filter((n) =>
        (n.textContent || "").trim(),
      ).length;
      const lanes = document.querySelectorAll("[data-lane-subject]").length;
      return { groups: gs, _controlBandNames: names, _controlLanes: lanes };
    });

  const inUnits = await groups();
  guard("radiogroups present in the UNITS lens", inUnits);

  // switch lens → Lessons
  const lessonsRadio = page.getByRole("radio", { name: "Lessons", exact: true });
  if (await lessonsRadio.count()) {
    await lessonsRadio.first().click();
    await page.waitForTimeout(500);
    const inLessons = await groups();
    guard("radiogroups present in the LESSONS lens (mode pair expected ABSENT by spec)", inLessons);
    await page.screenshot({ path: `${OUT}/${tier.name}-03-lens-lessons.png` });

    // Organize/Status/Sort/Density — spec says Lessons-lens only; they live in
    // TimelineList, which mounts only in List mode. Test all four combos.
    const combo = async (lens, mode) => {
      await page.getByRole("radio", { name: lens, exact: true }).first().click();
      await page.waitForTimeout(300);
      const m = page.getByRole("radio", { name: mode, exact: true });
      if (await m.count()) {
        await m.first().click();
        await page.waitForTimeout(600);
      }
      return page.evaluate(() => {
        const has = (l) => !!document.querySelector(`[role="radiogroup"][aria-label="${l}"]`);
        return {
          organize: has("Organize by"),
          status: has("Show which lessons"),
          sort: has("Sort by"),
          density: has("Row density"),
          zoomSlider: !!document.querySelector("#tl-zoom"),
          modePair: has("How the plan is drawn"),
          lensPair: has("What the plan shows"),
          _controlRows:
            document.querySelectorAll("[data-lane-subject]").length +
            document.querySelectorAll("[class*='timeline_row__']").length,
        };
      });
    };
    for (const [lens, mode] of [
      ["Lessons", "List"],
      ["Units", "List"],
      ["Units", "Timeline"],
      ["Lessons", "Timeline"],
    ]) {
      const r = await combo(lens, mode);
      rec(tier.name, r._controlRows > 0 ? "CHECK" : "VOID", `controls @ lens=${lens} mode=${mode}`, r);
      await page.screenshot({ path: `${OUT}/${tier.name}-04-${lens}-${mode}.png` });
    }
    // back to Units / Timeline
    await page.getByRole("radio", { name: "Units", exact: true }).first().click();
    await page.waitForTimeout(250);
    const tl = page.getByRole("radio", { name: "Timeline", exact: true });
    if (await tl.count()) await tl.first().click();
    await page.waitForTimeout(500);
  } else {
    guard("Lessons lens radio not found", inUnits);
  }

  /* -- 5. DRAWER ------------------------------------------------------ */
  const drawer = await page.evaluate(() => {
    const toggle = [...document.querySelectorAll("button")].find((b) =>
      /Library/.test(b.textContent || ""),
    );
    const grips = document.querySelectorAll(
      "[class*='drawerGrip'],[class*='drawerResize'],[class*='resizeHandle']",
    );
    return {
      toggleFound: !!toggle, // ← positive control
      toggleText: toggle && (toggle.textContent || "").trim(),
      ariaExpanded: toggle && toggle.getAttribute("aria-expanded"),
      bodyInDom: !!document.querySelector("#plan-timeline-library"),
      toggleBox: toggle && {
        w: Math.round(toggle.getBoundingClientRect().width),
        h: Math.round(toggle.getBoundingClientRect().height),
      },
      resizeGripCount: grips.length,
      countChip: (() => {
        const c = [...document.querySelectorAll("button")].find((b) =>
          /needs? attention/i.test(b.textContent || ""),
        );
        return c ? (c.textContent || "").trim() : null;
      })(),
    };
  });
  guard("drawer at rest (expected: collapsed, no resize grip)", drawer);

  if (drawer.toggleFound) {
    await page.getByRole("button", { name: /Library/ }).first().click();
    await page.waitForTimeout(600);
    const open = await page.evaluate(() => {
      const body = document.querySelector("#plan-timeline-library");
      const group = document.querySelector('[role="radiogroup"][aria-label="Library section"]');
      const r = body && body.getBoundingClientRect();
      return {
        bodyInDom: !!body, // ← positive control for the tab absence below
        bodyH: r && Math.round(r.height),
        tabs: group
          ? [...group.querySelectorAll('[role="radio"]')].map((t) => ({
              name: t.getAttribute("aria-label"),
              w: Math.round(t.getBoundingClientRect().width),
              h: Math.round(t.getBoundingClientRect().height),
            }))
          : null,
        hasLessonLibraryTab: !!(
          group && [...group.querySelectorAll('[role="radio"]')].some((t) => /lesson/i.test(t.getAttribute("aria-label") || ""))
        ),
        maxHeightCss: body && getComputedStyle(body).maxHeight,
        resizeCursorEls: [...document.querySelectorAll("#plan-timeline-library, [class*='timeline_drawer']")].filter(
          (e) => /resize/.test(getComputedStyle(e).cursor),
        ).length,
      };
    });
    rec(tier.name, open.bodyInDom ? "CHECK" : "VOID", "drawer opened — tabs (3 expected by spec)", open);
    await page.screenshot({ path: `${OUT}/${tier.name}-05-drawer-open.png` });

    // double-click-to-collapse
    const beforeDbl = open.bodyInDom;
    await page.locator("#plan-timeline-library").dblclick({ position: { x: 20, y: 8 } }).catch(() => {});
    await page.waitForTimeout(500);
    const afterDbl = await page.evaluate(() => !!document.querySelector("#plan-timeline-library"));
    rec(tier.name, beforeDbl ? "CHECK" : "VOID", "double-click-to-collapse on drawer body", {
      openBefore: beforeDbl,
      openAfter: afterDbl,
      collapsed: beforeDbl && !afterDbl,
    });
    // drag-to-resize attempt on the drawer's top edge
    if (afterDbl) {
      const bb = await page.locator("#plan-timeline-library").boundingBox();
      if (bb) {
        await page.mouse.move(bb.x + bb.width / 2, bb.y + 1);
        await page.mouse.down();
        await page.mouse.move(bb.x + bb.width / 2, bb.y - 120, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(400);
        const bb2 = await page.locator("#plan-timeline-library").boundingBox();
        rec(tier.name, "CHECK", "drag-to-resize on drawer top edge", {
          hBefore: Math.round(bb.height),
          hAfter: bb2 ? Math.round(bb2.height) : null,
          changed: bb2 ? Math.abs(bb2.height - bb.height) > 4 : null,
        });
      }
    }
    // close again
    await page.getByRole("button", { name: /Library/ }).first().click().catch(() => {});
    await page.waitForTimeout(300);
  }

  /* -- 6. TOUCH TARGETS (reported next to the emulation reading) ------ */
  const targets = await page.evaluate(() => {
    const pick = (sel) =>
      [...document.querySelectorAll(sel)]
        .map((e) => {
          const r = e.getBoundingClientRect();
          if (!r.width && !r.height) return null;
          return {
            label: e.getAttribute("aria-label") || (e.textContent || "").trim().slice(0, 28),
            w: +r.width.toFixed(1),
            h: +r.height.toFixed(1),
          };
        })
        .filter(Boolean);
    return {
      scrollArrows: pick('button[aria-label^="Scroll "]'),
      zoomReset: pick("[class*='zoomReset']"),
      zoomRange: pick("#tl-zoom"),
      drawerBtns: pick("[class*='drawerToggle'],[class*='drawerCount']"),
      bandGrip: pick('button[aria-label^="Change how many weeks"]'),
      dots: pick("[class*='timeline_dot__']").slice(0, 3),
      _controlLanes: document.querySelectorAll("[data-lane-subject]").length,
    };
  });
  rec(tier.name, targets._controlLanes > 0 ? "TOUCH" : "VOID", "control boxes (px)", targets);

  rec(tier.name, "DATA", "supabase /rest/v1/ requests seen (0 ⇒ MOCK path)", box.rest);
  if (box.consoleErrors.length)
    rec(tier.name, "CONSOLE", "errors", box.consoleErrors.slice(0, 6));
  else rec(tier.name, "CONSOLE", "errors", "none");

  await ctx.close();
}

/* ══════════════ PART 2 — METHOD A, video, band drag @1440 ════════════ */
{
  const box = { consoleErrors: [], rest: 0 };
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: { dir: VID, size: { width: 1440, height: 900 } },
  });
  const page = await land(ctx, box);
  const T = "drag";

  // Drag is gated on editMode === "master" — flip the top-bar toggle.
  const teamBtn = page.getByRole("button", { name: "Team Curriculum", exact: true });
  rec(T, "CHECK", "Team Curriculum toggle found", await teamBtn.count());
  if (await teamBtn.count()) {
    await teamBtn.first().click();
    await page.waitForTimeout(900);
    // dismiss the team-mode intro if it appears
    for (const nm of [/Got it/i, /Continue/i, /Close/i, /Start editing/i]) {
      const b = page.getByRole("button", { name: nm });
      if (await b.count()) {
        await b.first().click().catch(() => {});
        await page.waitForTimeout(500);
        break;
      }
    }
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/drag-00-team-mode.png` });

  const draggables = await page.locator("[data-draggable]").count();
  rec(T, draggables > 0 ? "CHECK" : "BLOCKED", "bands carrying data-draggable in Team mode", draggables);

  const frames = [];
  const shot = async (tag) => {
    const n = String(frames.length + 1).padStart(3, "0");
    const f = `${OUT}/frames/step_${n}_${tag}.png`;
    await page.screenshot({ path: f });
    frames.push(f);
    return f;
  };
  mkdirSync(`${OUT}/frames`, { recursive: true });

  if (draggables > 0) {
    const band = page.locator("[data-draggable]").first();
    const before = await band.evaluate((b) => ({
      title: b.getAttribute("title"),
      aria: b.getAttribute("aria-label"),
      name: (b.querySelector("[class*='bandName']") || {}).textContent,
      x: +b.getBoundingClientRect().x.toFixed(1),
      w: +b.getBoundingClientRect().width.toFixed(1),
    }));
    const dayPx = await page.evaluate(
      () => +document.querySelector("[data-tl-day]").getBoundingClientRect().width.toFixed(2),
    );
    const weekPx = dayPx * 5;
    rec(T, "CHECK", "band before MOVE", { ...before, dayPx, weekPx });

    const bb = await band.boundingBox();
    await shot("before-move");
    await page.mouse.move(bb.x + 24, bb.y + bb.height / 2);
    await page.mouse.down();
    await shot("pointerdown");
    // 12 incremental steps across one full week, screenshotting each
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(bb.x + 24 + (weekPx * i) / 12, bb.y + bb.height / 2);
      await page.waitForTimeout(70);
      if (i % 3 === 0 || i === 1) {
        const st = await page.evaluate(() => ({
          dragging: document.querySelectorAll("[data-dragging]").length,
          ghosts: document.querySelectorAll("[class*='dragGhost']").length,
        }));
        await shot(`move-${i}-drag${st.dragging}-ghost${st.ghosts}`);
        rec(T, "FRAME", `mid-move step ${i} (dx=${((weekPx * i) / 12).toFixed(0)}px)`, st);
      }
    }
    await page.mouse.up();
    await page.waitForTimeout(900);
    await shot("after-move");
    const after = await page.locator("[data-draggable]").first().evaluate((b) => ({
      title: b.getAttribute("title"),
      x: +b.getBoundingClientRect().x.toFixed(1),
      w: +b.getBoundingClientRect().width.toFixed(1),
    }));
    rec(T, "CHECK", "band after MOVE (one week right)", {
      before: before.title,
      after: after.title,
      committed: before.title !== after.title,
      dx: +(after.x - before.x).toFixed(1),
      widthChanged: Math.abs(after.w - before.w) > 1,
    });
    const leftover = await page.evaluate(() => ({
      dragging: document.querySelectorAll("[data-dragging]").length,
      ghosts: document.querySelectorAll("[class*='dragGhost']").length,
    }));
    rec(T, "CHECK", "post-drag cleanup (both should be 0)", leftover);

    /* ---- RIGHT-EDGE RESIZE ---- */
    const wrap = page.locator("[data-draggable]").first();
    await wrap.hover(); // the grip's ::before is opacity:0 until hover
    await page.waitForTimeout(300);
    await shot("resize-hover");
    const grip = page.getByRole("button", { name: /^Change how many weeks/ }).first();
    const gripCount = await grip.count();
    rec(T, gripCount > 0 ? "CHECK" : "BLOCKED", "right-edge resize grip present", gripCount);
    if (gripCount > 0) {
      const gb = await grip.boundingBox();
      const gvis = await grip.evaluate((g) => {
        const cs = getComputedStyle(g, "::before");
        return { beforeOpacity: cs.opacity, gripW: +g.getBoundingClientRect().width.toFixed(1), gripH: +g.getBoundingClientRect().height.toFixed(1) };
      });
      rec(T, "CHECK", "grip geometry + hover visibility", { ...gvis, box: gb && { w: +gb.width.toFixed(1), h: +gb.height.toFixed(1) } });
      const wBefore = (await wrap.boundingBox()).width;
      const tBefore = await wrap.getAttribute("title");
      await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2);
      await page.mouse.down();
      await shot("resize-down");
      for (let i = 1; i <= 10; i++) {
        await page.mouse.move(gb.x + gb.width / 2 + (weekPx * i) / 10, gb.y + gb.height / 2);
        await page.waitForTimeout(70);
        if (i % 3 === 0) await shot(`resize-${i}`);
      }
      await page.mouse.up();
      await page.waitForTimeout(900);
      await shot("after-resize");
      const wAfter = (await page.locator("[data-draggable]").first().boundingBox()).width;
      const tAfter = await page.locator("[data-draggable]").first().getAttribute("title");
      rec(T, "CHECK", "band after RESIZE (+1 week)", {
        wBefore: +wBefore.toFixed(1),
        wAfter: +wAfter.toFixed(1),
        grewByPx: +(wAfter - wBefore).toFixed(1),
        expectedWeekPx: +weekPx.toFixed(1),
        titleBefore: tBefore,
        titleAfter: tAfter,
      });
    }

    /* ---- sub-threshold drag must NOT commit ---- */
    const b3 = await page.locator("[data-draggable]").first().boundingBox();
    const t3 = await page.locator("[data-draggable]").first().getAttribute("title");
    await page.mouse.move(b3.x + 24, b3.y + b3.height / 2);
    await page.mouse.down();
    await page.mouse.move(b3.x + 26, b3.y + b3.height / 2, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(700);
    const t4 = await page.locator("[data-draggable]").first().getAttribute("title");
    rec(T, "CHECK", "2px sub-threshold drag must not re-pace", {
      before: t3,
      after: t4,
      unchanged: t3 === t4,
      urlNow: page.url(),
    });
  }

  rec(T, "DATA", "supabase /rest/v1/ requests (0 ⇒ MOCK path)", box.rest);
  rec(T, "CONSOLE", "errors", box.consoleErrors.length ? box.consoleErrors.slice(0, 6) : "none");

  const vpath = await page.video().path().catch(() => null);
  await ctx.close();
  const finalPath = page.video ? await page.video().path().catch(() => vpath) : vpath;
  rec(T, "VIDEO", "recording saved", finalPath);
}

await browser.close();
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1));
console.log(`\n=== ${results.length} records → ${OUT}/results.json ===`);
