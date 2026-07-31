// scripts/probe-qa-year-teach-detail.mjs — follow-up to scripts/probe-qa-year-teach.mjs.
// REPORT ONLY. Changes no file, writes nothing to any database.
//
// WHY A SECOND PASS. The first pass produced three results that were about the
// INSTRUMENT rather than the app, and one gap:
//
//   1. `document.querySelector("header")` matched the LESSON RAIL's header at
//      1440, not the board header — so "board header shows no title at 1440"
//      was a false failure (the screenshot plainly shows one). Every header
//      reading here selects the header that CONTAINS the identity block, and
//      prints which header it picked.
//   2. "distinct row bands" counted TEXT LINES, not wrapped flex rows, so it
//      said "three rows" for a header that is visibly one row of a two-line
//      identity block. Row count is now measured as distinct button/child row
//      offsets plus the header's own height against a single-row baseline.
//   3. The 375 stage never ran — the dev server timed out serving
//      `app/(teach)/teach/page.js` (ChunkLoadError). It is retried here.
//   4. New questions the first pass raised: the bottom writing bar looks
//      clipped at the left edge when the board is expanded; the floating
//      "Lesson ›" pill sits where the tool cluster now lives below 900px; and a
//      two-digit duration typed into the 56px Min cell came out as "535".
//
// Every absence claim is paired with a positive control in the same
// observation, and the 900px rule is measured at 901 AND 899 so "hidden by the
// rule" cannot be confused with "never rendered".
//
// Usage: node scripts/probe-qa-year-teach-detail.mjs

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const OUT = path.resolve("docs/screenshots/qa-year-teach");
// STAGES=teach,refine,phone — run a subset. This dev server is shared with
// several build lanes and a cold route can take >240s to hydrate, so a stage
// that times out must not take the other stages down with it.
const STAGES = (process.env.STAGES ?? "teach,refine,phone").split(",").map((x) => x.trim());
await mkdir(OUT, { recursive: true });

const rows = [];
const check = (label, cond, detail = "") => {
  rows.push({ kind: cond ? "PASS" : "FAIL", label, detail: String(detail) });
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};
const info = (label, detail = "") => {
  rows.push({ kind: "INFO", label, detail: String(detail) });
  console.log(`INFO  ${label}${detail ? ` — ${detail}` : ""}`);
};

const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();
const dirty = execFileSync("git", ["diff", "HEAD", "--name-only", "--", "components", "lib", "app"]).toString().trim();
info("HEAD", sha);
info("tree", dirty ? `DIRTY (${dirty.split("\n").length} files) — measures the WORKING TREE` : `clean — equals ${sha}`);

async function waitForHydrated(page, sel, timeout = 420000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const ready = await page.evaluate((s) => {
      const el = document.querySelector(s);
      return el ? Object.keys(el).some((k) => k.startsWith("__reactProps")) : false;
    }, sel);
    if (ready) return Math.round((Date.now() - t0) / 1000);
    await page.waitForTimeout(1500);
  }
  throw new Error(`never hydrated: ${sel}`);
}

/** The board header, identified by the identity block it contains — never by
 *  "the first <header> on the page", which is the lesson rail's. */
function headerSrc() {
  return function () {
    const heads = [...document.querySelectorAll("header")];
    const head = heads.find((h) => h.querySelector('[class*="boardName"]'));
    if (!head) {
      return { found: false, headerCount: heads.length, headerTexts: heads.map((h) => h.textContent.trim().slice(0, 40)) };
    }
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const pick = (re) => [...head.querySelectorAll("span")].find((s) => re.test(String(s.className)));
    const name = pick(/boardName/), obj = pick(/objective/), std = pick(/identityStandards/), subj = pick(/subjectTag/);
    const tools = [...head.querySelectorAll("button")].map((b) => {
      const r = b.getBoundingClientRect();
      return { label: b.getAttribute("aria-label") || b.textContent.trim().slice(0, 18), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 };
    });
    const hr = head.getBoundingClientRect();
    // Wrapped flex ROWS, not text lines: distinct top offsets of the header's
    // DIRECT children that actually occupy space.
    const childTops = [...head.children]
      .map((c) => c.getBoundingClientRect())
      .filter((r) => r.height > 0 && r.width > 0)
      .map((r) => Math.round(r.top));
    return {
      found: true,
      headerCount: heads.length,
      headerH: Math.round(hr.height),
      flexRows: new Set(childTops).size,
      childTops,
      title: name ? name.textContent.trim() : null,
      titleVisible: name ? cs(name).display !== "none" && name.getBoundingClientRect().width > 0 : false,
      objective: obj ? obj.textContent.trim() : null,
      objectiveVisible: obj ? cs(obj).display !== "none" && obj.getBoundingClientRect().width > 0 : false,
      standardsPills: std ? std.children.length : 0,
      standardsDisplay: std ? cs(std).display : "(no wrapper)",
      standardsVisible: std ? cs(std).display !== "none" && std.getBoundingClientRect().width > 0 : false,
      subjectTagDisplay: subj ? cs(subj).display : "(absent)",
      tools,
      toolsOffscreen: tools.filter((t) => t.visible && (t.right > window.innerWidth + 1 || t.left < -1)).map((t) => t.label),
      vw: window.innerWidth,
      docSw: document.documentElement.scrollWidth,
      docCw: document.documentElement.clientWidth,
    };
  };
}

/** The bottom writing bar + the floating "Lesson ›" pill, measured against the
 *  viewport. */
function barsSrc() {
  return function () {
    const vw = window.innerWidth, vh = window.innerHeight;
    const bars = [...document.querySelectorAll("div,section,nav")]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.height > 28 && x.r.height < 140 && x.r.top > vh * 0.6 && x.r.width > 300)
      .sort((a, b) => b.r.width - a.r.width);
    const bar = bars[0];
    const barBtns = bar
      ? [...bar.el.querySelectorAll("button")].map((b) => {
          const r = b.getBoundingClientRect();
          return { label: (b.textContent.trim() || b.getAttribute("aria-label") || "?").slice(0, 16), left: Math.round(r.left), right: Math.round(r.right) };
        })
      : [];
    return {
      vw,
      bar: bar ? { cls: String(bar.el.className).slice(0, 50), left: Math.round(bar.r.left), right: Math.round(bar.r.right), width: Math.round(bar.r.width) } : null,
      barBtns,
      barClipped: barBtns.filter((b) => b.left < -1 || b.right > vw + 1),
    };
  };
}

const browser = await chromium.launch({ channel: "chrome" });
const result = {};
const errs = [];
try {
 // ══ STAGE 1 — desktop 1440 ═══════════════════════════════════════════════
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  await ctx.route("**/rest/v1/**", (r) => (r.request().method() === "GET" ? r.continue() : r.abort()));
  await bypassLogin(ctx, { base: BASE, next: "/teach", timeout: 180000, retries: 3 });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errs.push(`[1440] ${m.text().slice(0, 200)}`); });
  if (STAGES.includes("teach")) {
  await page.goto(`${BASE}/teach?lesson=m-11-1`, { waitUntil: "domcontentloaded", timeout: 300000 });
  info("teach hydration (1440)", `${await waitForHydrated(page, "header button")}s`);
  await page.waitForTimeout(2500);

  const normalHead = await page.evaluate(headerSrc());
  result.head1440 = normalHead;
  check("CORRECTED MEASUREMENT — at 1440 with the lesson rail SHOWN, the board header carries the lesson title",
    normalHead.found && normalHead.titleVisible,
    normalHead.found ? `title="${normalHead.title}"; ${normalHead.headerCount} <header> elements on the page (the first one is the rail's — the first pass measured that by mistake)` : `board header not found among ${normalHead.headerCount} headers`);
  check("…and the objective + standards pills, rail shown, 1440",
    normalHead.found && normalHead.objectiveVisible && normalHead.standardsPills > 0 && normalHead.standardsVisible,
    `objective="${(normalHead.objective || "").slice(0, 60)}" pills=${normalHead.standardsPills} display=${normalHead.standardsDisplay}`);
  info("header rows/height @1440 rail-shown", `flexRows=${normalHead.flexRows} headerH=${normalHead.headerH}px`);

  const normalBars = await page.evaluate(barsSrc());
  result.bars1440 = normalBars;
  check("CONTROL: with the lesson rail shown, no bottom-bar control is clipped by the viewport",
    normalBars.barClipped.length === 0,
    `bar left=${normalBars.bar?.left} right=${normalBars.bar?.right} of vw=${normalBars.vw}; ${normalBars.barBtns.length} buttons measured`);

  await page.locator('[aria-label="Expand board"]').first().click();
  await page.waitForTimeout(1500);
  const expBars = await page.evaluate(barsSrc());
  const expHead = await page.evaluate(headerSrc());
  result.barsExpanded = expBars;
  check("board EXPANDED: no bottom-bar control is clipped by the viewport",
    expBars.barClipped.length === 0,
    `bar left=${expBars.bar?.left} right=${expBars.bar?.right} of vw=${expBars.vw}; clipped: ${expBars.barClipped.map((b) => `${b.label}@left${b.left}`).join(", ") || "none"}`);
  check("board EXPANDED: header tools still fully on-screen (positive control for the row above)",
    expHead.toolsOffscreen.length === 0, `${expHead.tools.length} header buttons, ${expHead.toolsOffscreen.length} off-screen`);
  await page.screenshot({ path: path.join(OUT, "20-writingbar-expanded-1440.png") });

  await page.locator('[aria-label="Present fullscreen"]').first().click();
  await page.waitForTimeout(1600);
  const fullBars = await page.evaluate(barsSrc());
  result.barsFullscreen = fullBars;
  check("FULLSCREEN: no bottom-bar control is clipped by the viewport",
    fullBars.barClipped.length === 0,
    `bar left=${fullBars.bar?.left} right=${fullBars.bar?.right} of vw=${fullBars.vw}; clipped: ${fullBars.barClipped.map((b) => `${b.label}@left${b.left}`).join(", ") || "none"}`);
  await page.screenshot({ path: path.join(OUT, "21-writingbar-fullscreen-1440.png") });
  await page.locator('[aria-label="Exit fullscreen"]').first().click().catch(() => {});
  await page.waitForTimeout(800);
  await page.locator('[aria-label="Collapse board"]').first().click().catch(() => {});
  await page.waitForTimeout(800);

  // ── The 900px boundary, as a PAIRED control ──────────────────────────────
  await page.setViewportSize({ width: 901, height: 900 });
  await page.waitForTimeout(1500);
  const at901 = await page.evaluate(headerSrc());
  await page.setViewportSize({ width: 899, height: 900 });
  await page.waitForTimeout(1500);
  const at899 = await page.evaluate(headerSrc());
  result.boundary = { at901, at899 };
  check("the <900px pill hide is the RULE firing, not a missing feature (901 shows / 899 hides)",
    at901.standardsPills > 0 && at901.standardsVisible && at899.standardsDisplay === "none",
    `901: pills=${at901.standardsPills} display=${at901.standardsDisplay} | 899: pills=${at899.standardsPills} display=${at899.standardsDisplay}; POSITIVE CONTROL at 899: title visible=${at899.titleVisible} ("${at899.title}")`);
  info("header height either side of the boundary", `901 → ${at901.headerH}px / flexRows=${at901.flexRows} · 899 → ${at899.headerH}px / flexRows=${at899.flexRows}`);
  await page.screenshot({ path: path.join(OUT, "22-teach-header-899.png") });

  // ── The floating pill vs the tool cluster, WITH A COUNTERFACTUAL ─────────
  // `.mobToggle` is position:absolute; top:8px; right:8px. Whether it collides
  // with the tools depends on where the tools sit, and a571d87 moved them:
  // `.boardTitle` went `flex: none` → `flex: 1 1 auto` (its own CSS comment
  // records it), which pushes the flex:none tool cluster to the right edge —
  // under the pill. Restoring flex:none in the same observation attributes the
  // collision to that property instead of guessing.
  const overlapAt = async (w) => {
    await page.setViewportSize({ width: w, height: w > 500 ? 1024 : 812 });
    await page.waitForTimeout(1500);
    return page.evaluate(() => {
      const heads = [...document.querySelectorAll("header")];
      const head = heads.find((h) => h.querySelector('[class*="boardName"]'));
      if (!head) return { found: false };
      const titleSlot = head.firstElementChild;
      const pill = [...document.querySelectorAll("button")].find((b) => /^(Lesson ›|‹ Board)$/.test(b.textContent.trim()));
      const tools = [...head.querySelectorAll("button")].map((b) => ({ el: b, label: b.getAttribute("aria-label") || b.textContent.trim().slice(0, 16) }));
      const hits = (a, b) => {
        const r1 = a.getBoundingClientRect(), r2 = b.getBoundingClientRect();
        return !(r1.right <= r2.left || r2.right <= r1.left || r1.bottom <= r2.top || r2.bottom <= r1.top);
      };
      const measure = () => ({
        collisions: pill ? tools.filter((t) => t.el !== pill && hits(t.el, pill)).map((t) => t.label) : [],
        offscreen: tools.filter((t) => { const r = t.el.getBoundingClientRect(); return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1); }).map((t) => t.label),
        titleFlex: getComputedStyle(titleSlot).flex,
        rightMostTool: Math.max(...tools.map((t) => Math.round(t.el.getBoundingClientRect().right))),
      });
      // Does the pill also sit on the TITLE? 24-teach-toolpill-375.png shows
      // "Lesson ›" printed across the end of the lesson name at 375, where the
      // tools have wrapped to a second row and are no longer under it.
      const nameEl = head.querySelector('[class*="boardName"]');
      const rect = (el) => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }; };
      const hits2 = (a, c) => !(a.r <= c.l || c.r <= a.l || a.b <= c.t || c.b <= a.t);
      const titleBox = nameEl ? rect(nameEl) : null;
      const pillBox = pill ? rect(pill) : null;
      const pillOverTitle = titleBox && pillBox ? hits2(titleBox, pillBox) : null;
      const titleOverlapPx = titleBox && pillBox ? Math.max(0, Math.min(titleBox.r, pillBox.r) - Math.max(titleBox.l, pillBox.l)) : null;
      const now = measure();
      const prev = titleSlot.style.flex;
      titleSlot.style.flex = "none"; // ← the counterfactual
      const ifNotGrowing = measure();
      titleSlot.style.flex = prev;
      return {
        found: true, vw: window.innerWidth,
        pillPresent: !!pill,
        pill: pill ? (() => { const r = pill.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) }; })() : null,
        now, ifNotGrowing, pillOverTitle, titleOverlapPx, titleBox,
      };
    });
  };
  for (const w of [768, 375]) {
    const o = await overlapAt(w);
    result[`overlap${w}`] = o;
    info(`@${w} pill/tool geometry (viewport resize — geometry only, not a touch emulation)`, JSON.stringify(o));
    if (o.found && o.pillPresent) {
      check(`@${w}: the floating "Lesson ›" pill does not sit on top of a header tool`,
        o.now.collisions.length === 0,
        `covers [${o.now.collisions.join(", ") || "none"}] with title slot flex=${o.now.titleFlex}; COUNTERFACTUAL — same DOM with flex:none covers [${o.ifNotGrowing.collisions.join(", ") || "none"}] (right-most tool moves ${o.now.rightMostTool} → ${o.ifNotGrowing.rightMostTool})`);
    } else {
      info(`@${w}: no floating pill in this state`, JSON.stringify(o).slice(0, 200));
    }
    await page.screenshot({ path: path.join(OUT, `24-teach-toolpill-${w}.png`) });
  }

  } // end teach-geometry stage

  // ── Refine: input clipping + the Min cell's spinner ───────────────────────
  if (STAGES.includes("refine")) {
  await page.setViewportSize({ width: 1440, height: 950 });
  // TWO ENTRY POINTS. /year is the surface in the brief, but this shared dev
  // server twice failed to hydrate it inside 420s; the /daily UnitChip reaches
  // the SAME singleton workspace host, so whichever lands, the surface under
  // test is identical. Whichever one produced the measurement is recorded.
  const ENTRIES = [
    { name: "/year unit chip", route: "/year", sel: 'button[data-year-chip][title="Fractions"]' },
    { name: "/daily?lesson=m-11-1 UnitChip", route: "/daily?lesson=m-11-1", sel: 'button[aria-label^="Open the"][aria-label$="unit workspace"]' },
  ];
  let entered = null;
  for (const e of ENTRIES) {
    try {
      await page.goto(`${BASE}${e.route}`, { waitUntil: "domcontentloaded", timeout: 300000 });
      info(`hydration wait (${e.route})`, `${await waitForHydrated(page, e.sel, 300000)}s`);
      await page.locator(e.sel).first().click({ timeout: 15000 });
      await page.locator('[role="dialog"]').first().waitFor({ timeout: 30000 });
      entered = e.name;
      break;
    } catch (err) {
      info("refine entry unavailable, trying next", `${e.name} — ${String(err).slice(0, 100)}`);
    }
  }
  if (!entered) throw new Error("refine stage: no entry point opened the workspace");
  info("refine stage entered via", entered);
  await page.locator('[role="dialog"]').first().getByRole("tab", { name: "Refine" }).click();
  await page.waitForTimeout(1500);

  const clip = await page.evaluate(() => {
    const read = (pfx) => [...document.querySelectorAll(`[role="dialog"] tbody input[aria-label^="${pfx}"]`)]
      .map((i) => ({ shown: i.clientWidth, needed: i.scrollWidth, value: i.value.slice(0, 45) }));
    return { title: read("Title"), objective: read("Objective") };
  });
  const cut = (a) => a.filter((x) => x.needed > x.shown + 2);
  result.clip = clip;
  check("Refine's Lesson/Objective cells show their full text at 1440",
    cut(clip.title).length === 0 && cut(clip.objective).length === 0,
    `${cut(clip.title).length}/${clip.title.length} titles and ${cut(clip.objective).length}/${clip.objective.length} objectives overflow their cell — e.g. "${cut(clip.title)[0]?.value}" needs ${cut(clip.title)[0]?.needed}px in ${cut(clip.title)[0]?.shown}px. An <input> clips with NO ellipsis, so a cut title reads as a whole one.`);
  await page.screenshot({ path: path.join(OUT, "23-refine-clipping-1440.png") });

  // THE MIN CELL. The first pass typed "35" and stored "535". Three variants
  // separate "the app mangles typed numbers" from "a 56px number cell puts its
  // native spinner under the click target".
  const clear = async (label) => {
    const el = page.locator(`[role="dialog"] [aria-label="${label}"]`);
    const box = await el.boundingBox();
    await page.mouse.click(box.x + 6, box.y + box.height / 2); // left edge, away from the spinner
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Delete");
    await page.waitForTimeout(600);
    return { el, box, afterClear: await el.inputValue() };
  };
  const leftEdge = await clear("Minutes, lesson 2");
  await page.keyboard.type("45", { delay: 30 });
  await page.waitForTimeout(900);
  const vLeft = await leftEdge.el.inputValue();

  const centre = await clear("Minutes, lesson 3");
  await page.mouse.click(centre.box.x + centre.box.width / 2, centre.box.y + centre.box.height / 2);
  await page.waitForTimeout(400);
  const afterCentreClickOnly = await centre.el.inputValue();
  await page.keyboard.type("45", { delay: 30 });
  await page.waitForTimeout(900);
  const vCentre = await centre.el.inputValue();

  const ctrlCell = page.locator('[role="dialog"] [aria-label="Objective, lesson 4"]');
  await ctrlCell.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("45", { delay: 30 });
  await page.waitForTimeout(900);
  const vText = await ctrlCell.inputValue();

  result.minCell = { vLeft, vCentre, afterCentreClickOnly, vText, boxWidth: Math.round(centre.box.width) };
  check('typing "45" into a Minutes cell stores 45',
    vLeft === "45" && vCentre === "45",
    `clicked at the cell's LEFT edge → "${vLeft}" | clicked at its CENTRE → "${vCentre}" (a centre click ALONE, before any typing, already left "${afterCentreClickOnly}") | CONTROL, same keys into a text Objective cell → "${vText}" | Min cell is ${result.minCell.boxWidth}px wide`);
  await page.screenshot({ path: path.join(OUT, "25-refine-number-typing.png") });
  }
  await ctx.close();

  // ══ STAGE 2 — real phone emulation, 375 ══════════════════════════════════
  if (!STAGES.includes("phone")) throw new Error("__skip_phone__");
  const ctxP = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  await ctxP.route("**/rest/v1/**", (r) => (r.request().method() === "GET" ? r.continue() : r.abort()));
  await bypassLogin(ctxP, { base: BASE, next: "/teach", timeout: 180000, retries: 3 });
  const pP = await ctxP.newPage();
  pP.on("console", (m) => { if (m.type() === "error") errs.push(`[375] ${m.text().slice(0, 200)}`); });
  // The first pass died here on a ChunkLoadError (the dev server timed out
  // serving the teach page chunk under load). Retry rather than report a dev
  // server timeout as a product finding.
  let loaded = false;
  for (let attempt = 1; attempt <= 3 && !loaded; attempt++) {
    try {
      await pP.goto(`${BASE}/teach?lesson=m-11-1`, { waitUntil: "domcontentloaded", timeout: 240000 });
      info(`teach hydration (375, attempt ${attempt})`, `${await waitForHydrated(pP, "header button", 200000)}s`);
      loaded = true;
    } catch (e) {
      info(`375 load attempt ${attempt} failed, retrying`, String(e).slice(0, 120));
    }
  }
  if (!loaded) throw new Error("teach never loaded at 375 after 3 attempts");
  await pP.waitForTimeout(2500);

  const media = await pP.evaluate(() => ({
    pointerCoarse: matchMedia("(pointer: coarse)").matches,
    anyPointerCoarse: matchMedia("(any-pointer: coarse)").matches,
    under900: matchMedia("(max-width: 900px)").matches,
    vw: window.innerWidth, dpr: devicePixelRatio,
  }));
  info("emulation @375", JSON.stringify(media));
  const h375 = await pP.evaluate(headerSrc());
  const b375 = await pP.evaluate(barsSrc());
  result.teach375 = { media, header: h375, bars: b375 };
  check("375: the board header still carries the lesson title", h375.found && h375.titleVisible, `title="${h375.title}"`);
  check("375: the objective still renders", h375.objectiveVisible, `objective="${(h375.objective || "").slice(0, 50)}"`);
  check("375: standards pills HIDDEN by design — with a positive control",
    h375.standardsDisplay === "none" || !h375.standardsVisible,
    `display=${h375.standardsDisplay}, pills in DOM=${h375.standardsPills}; POSITIVE CONTROL: title visible=${h375.titleVisible}, ${h375.tools.length} header buttons found`);
  check("375: the header does not grow to three rows",
    h375.flexRows <= 2,
    `wrapped flex rows = ${h375.flexRows} (distinct top offsets ${JSON.stringify(h375.childTops)}), header height = ${h375.headerH}px`);
  check("375: no header tool is pushed off-screen", h375.toolsOffscreen.length === 0,
    `off-screen: ${h375.toolsOffscreen.join(", ") || "none"} of ${h375.tools.filter((t) => t.visible).length} visible`);
  check("375: no document-level horizontal scroll (isMobile + DSF3 emulation)",
    h375.docSw <= h375.docCw + 1, `scrollWidth=${h375.docSw} clientWidth=${h375.docCw}`);
  const small = h375.tools.filter((t) => t.visible && t.h < 44);
  check("375: header controls meet the 44px touch floor",
    small.length === 0,
    `${small.length}/${h375.tools.filter((t) => t.visible).length} under 44px${small.length ? ": " + small.map((t) => `${t.label}=${t.h}px`).join(", ") : ""} (pointer:coarse=${media.pointerCoarse})`);
  await pP.screenshot({ path: path.join(OUT, "26-teach-header-375.png") });

  // Expanded + fullscreen on the phone — the states where the header is the
  // only record of what is being taught.
  await pP.locator('[aria-label="Expand board"]').first().click().catch(() => {});
  await pP.waitForTimeout(1500);
  const h375exp = await pP.evaluate(headerSrc());
  result.teach375expanded = h375exp;
  check("375 EXPANDED: the identity survives", h375exp.found && h375exp.titleVisible, `title="${h375exp.title}"`);
  check("375 EXPANDED: no header tool off-screen", h375exp.toolsOffscreen.length === 0, `off-screen: ${h375exp.toolsOffscreen.join(", ") || "none"}`);
  await pP.screenshot({ path: path.join(OUT, "27-teach-375-expanded.png") });

  info("console errors during the detail pass", `${errs.length}${errs.length ? " — " + errs.slice(0, 6).join(" | ") : ""}`);
} catch (e) {
  if (String(e).includes("__skip_phone__")) info("phone stage skipped by STAGES", STAGES.join(","));
  else check("detail probe ran to completion", false, String(e).slice(0, 400));
} finally {
  const dirtyEnd = execFileSync("git", ["diff", "HEAD", "--name-only", "--", "components", "lib", "app"]).toString().trim();
  info("tree at END", dirtyEnd ? `DIRTY: ${dirtyEnd}` : `clean — still equals ${sha}`);
  await writeFile(path.join(OUT, "results-detail.json"), JSON.stringify({ sha, rows, result, errs }, null, 2));
  await browser.close();
  const fails = rows.filter((r) => r.kind === "FAIL");
  console.log(`\n=== detail: ${rows.filter((r) => r.kind === "PASS").length} PASS / ${fails.length} FAIL ===`);
  fails.forEach((f) => console.log(`FAIL  ${f.label} — ${f.detail}`));
}
