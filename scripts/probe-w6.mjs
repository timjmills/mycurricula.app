// probe-w6.mjs — Wave-6 ("The Year") live verification probe.
//
// Exercises the frame-routed /year: glass → YearA (subject lanes + month
// scale), paper → the legacy TimelineYear (untouched), color → YearC
// (constellation). Asserts, per frame: the right surface renders, the
// ?subject= deep link scrolls+highlights its lane/cluster, cross-theme
// legibility holds (glass under night + a wash), and the document never
// scrolls sideways at phone/tablet/desktop.
//
// Stable probe hooks (CSS-module class names are hashed):
//   [data-year-frame="glass|color"] · [data-year-lane=<id>] · [data-year-chip]
//   · [data-year-cluster=<id>] · [data-deeplink-focus] (transient) · the
//   legacy timeline's [data-scope] root (paper).
//
// Usage:
//   CLAUDE_BYPASS_TOKEN='<raw token>' PROBE_BASE=http://localhost:3019 \
//     node scripts/probe-w6.mjs

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN not set");
  process.exit(1);
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3019";
const SHOT_DIR = path.resolve("docs/screenshots/w6-probe");
await mkdir(SHOT_DIR, { recursive: true });

const LS = {
  theme: "mycurricula:user:theme",
  frame: "mycurricula:user:theme-frame",
  stamp: "mycurricula:user:theme-updated-at",
};

const results = [];
function assert(group, name, ok, detail) {
  results.push({ group, name, ok: !!ok, detail: detail ?? "" });
  console.log(`${ok ? "PASS" : "FAIL"}  [${group}] ${name}${ok ? "" : ` — ${detail ?? ""}`}`);
}

function seedScript(seed) {
  return `(() => { try {
    const s = ${JSON.stringify(seed)};
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    localStorage.setItem(${JSON.stringify(LS.stamp)}, String(Date.now() + 300000));
  } catch (e) {} })();`;
}

const browser = await chromium.launch({ channel: "chrome" });

// Auth boot once; reuse cookies across contexts.
const authCtx = await browser.newContext();
{
  const boot = await authCtx.newPage();
  await boot.goto(
    `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/weekly`,
    { waitUntil: "domcontentloaded", timeout: 120000 },
  );
  await boot.waitForTimeout(2000);
  await boot.close();
}
const cookies = await authCtx.cookies();
await authCtx.close();

async function newCtx(seed, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies(cookies);
  if (seed) await ctx.addInitScript(seedScript(seed));
  return ctx;
}

function isLoginUrl(u) {
  return /\/login(\?|$)|\/auth\/claude-login/.test(u || "");
}
async function gotoAuthed(page, target, tries = 3) {
  const url = target.startsWith("http") ? target : `${BASE}${target}`;
  for (let i = 0; i < tries; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    } catch {
      await page.waitForTimeout(1200);
      continue;
    }
    if (!isLoginUrl(page.url())) return true;
    await page.waitForTimeout(1500);
  }
  return !isLoginUrl(page.url());
}
async function waitVisible(page, selector, timeoutMs = 30000) {
  try {
    await page.waitForSelector(selector, { state: "attached", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

let shotSeq = 0;
async function shot(page, tag) {
  try {
    await page.screenshot({
      path: path.join(SHOT_DIR, `${String(++shotSeq).padStart(2, "0")}-${tag}.png`),
      fullPage: false,
    });
  } catch {}
}

// Relative luminance of an "rgb(r, g, b)" / "rgba(...)" string (sRGB).
function lumOf(rgb) {
  const m = /rgba?\(([^)]+)\)/.exec(rgb || "");
  if (!m) return null;
  const [r, g, b] = m[1].split(",").map((s) => parseFloat(s));
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// ═══ FRAME RENDER + SCREENSHOT ═══════════════════════════════════════════════
// glass → [data-year-frame="glass"] with ≥1 lane; color → [data-year-frame=
// "color"] with ≥1 cluster; paper → the legacy timeline [data-scope] root and
// NO [data-year-frame] marker.
const FRAMES = [
  { frame: "glass", marker: '[data-year-frame="glass"]', unit: "[data-year-lane]" },
  { frame: "paper", marker: "[data-scope]", unit: "[data-year-lane],[data-year-cluster]" },
  { frame: "color", marker: '[data-year-frame="color"]', unit: "[data-year-cluster]" },
];

for (const { frame, marker } of FRAMES) {
  const ctx = await newCtx({ [LS.frame]: frame, [LS.theme]: "clear" });
  const page = await ctx.newPage();
  let err = null;
  let facts = null;
  try {
    const authed = await gotoAuthed(page, "/year");
    if (!authed) throw new Error("bounced to /login");
    await waitVisible(page, marker, 30000);
    // Hydration settle (dev server; memory: ≥9s before judging layout).
    await page.waitForTimeout(9500);
    facts = await page.evaluate(() => {
      const glass = document.querySelector('[data-year-frame="glass"]');
      const color = document.querySelector('[data-year-frame="color"]');
      const lanes = document.querySelectorAll("[data-year-lane]").length;
      const clusters = document.querySelectorAll("[data-year-cluster]").length;
      const chips = document.querySelectorAll("[data-year-chip]").length;
      const timeline = !!document.querySelector("[data-scope]");
      return {
        htmlFrame: document.documentElement.dataset.frame,
        glass: !!glass,
        color: !!color,
        lanes,
        clusters,
        chips,
        timeline,
      };
    });
  } catch (e) {
    err = e.message.slice(0, 200);
  }
  await shot(page, `frame-${frame}`);

  if (frame === "glass") {
    assert("render", "glass mounts YearA + lanes", !err && facts?.glass && facts.lanes > 0, err ?? JSON.stringify(facts));
    assert("render", "glass renders unit chips", !err && facts?.chips > 0, err ?? `chips=${facts?.chips}`);
    assert("render", "glass NOT the timeline/constellation", !err && !facts?.color, err ?? JSON.stringify(facts));
  } else if (frame === "color") {
    assert("render", "color mounts YearC + clusters", !err && facts?.color && facts.clusters > 0, err ?? JSON.stringify(facts));
    assert("render", "color NOT the glass lanes", !err && !facts?.glass, err ?? JSON.stringify(facts));
  } else {
    assert("render", "paper mounts the legacy timeline", !err && facts?.timeline, err ?? JSON.stringify(facts));
    assert("render", "paper renders neither YearA nor YearC", !err && !facts?.glass && !facts?.color, err ?? JSON.stringify(facts));
  }
  assert("render", `html data-frame === ${frame}`, !err && facts?.htmlFrame === frame, err ?? `html=${facts?.htmlFrame}`);
  await page.close();
  await ctx.close();
}

// ═══ DEEP LINK ?subject=math (glass + color) ═════════════════════════════════
for (const frame of ["glass", "color"]) {
  const laneSel = frame === "glass" ? '[data-year-lane="math"]' : '[data-year-cluster="math"]';
  const ctx = await newCtx({ [LS.frame]: frame, [LS.theme]: "clear" });
  const page = await ctx.newPage();
  let err = null;
  let seenFocus = false;
  let inView = null;
  try {
    const authed = await gotoAuthed(page, "/year?subject=math");
    if (!authed) throw new Error("bounced to /login");
    await waitVisible(page, laneSel, 30000);
    // Poll for the transient [data-deeplink-focus] the mount effect sets on the
    // matched lane/cluster (removed after ~2.2s), up to 15s to clear hydration.
    for (let i = 0; i < 30; i++) {
      const has = await page.evaluate((sel) => !!document.querySelector(`${sel}[data-deeplink-focus]`), laneSel);
      if (has) { seenFocus = true; break; }
      await page.waitForTimeout(500);
    }
    // The matched element should be roughly within the viewport after scroll.
    inView = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    }, laneSel);
  } catch (e) {
    err = e.message.slice(0, 200);
  }
  await shot(page, `deeplink-${frame}-math`);
  assert("deeplink", `${frame} highlights subject=math lane`, !err && seenFocus, err ?? "focus attr never appeared");
  assert("deeplink", `${frame} scrolls subject=math into view`, !err && inView === true, err ?? `inView=${inView}`);
  await page.close();
  await ctx.close();
}

// ═══ CROSS-THEME (glass under night + mint) ══════════════════════════════════
for (const theme of ["night", "mint"]) {
  const ctx = await newCtx({ [LS.frame]: "glass", [LS.theme]: theme });
  const page = await ctx.newPage();
  let err = null;
  let facts = null;
  try {
    const authed = await gotoAuthed(page, "/year");
    if (!authed) throw new Error("bounced to /login");
    await waitVisible(page, '[data-year-frame="glass"]', 30000);
    await page.waitForTimeout(9500);
    facts = await page.evaluate(() => {
      // Resolve ANY CSS color (incl. oklab/oklch color-mix results) to sRGB by
      // painting it to a 1×1 canvas and reading the pixel back — colorspace-
      // agnostic (the rgb/oklch probe-parsing trap).
      const toRgb = (color) => {
        try {
          const c = document.createElement("canvas");
          c.width = c.height = 1;
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#000";
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          const d = ctx.getImageData(0, 0, 1, 1).data;
          return [d[0], d[1], d[2]];
        } catch {
          return null;
        }
      };
      const lane = document.querySelector("[data-year-lane]");
      // The subject-name span is the second span in the lane head (after glyph).
      const nameEl = lane
        ? lane.querySelectorAll("span")[1] ?? lane.querySelector("span")
        : null;
      const cs = lane ? getComputedStyle(lane) : null;
      const nameCs = nameEl ? getComputedStyle(nameEl) : null;
      return {
        tone: document.documentElement.dataset.tone,
        lanes: document.querySelectorAll("[data-year-lane]").length,
        laneBgRgb: cs ? toRgb(cs.backgroundColor) : null,
        nameColorRgb: nameCs ? toRgb(nameCs.color) : null,
      };
    });
  } catch (e) {
    err = e.message.slice(0, 200);
  }
  await shot(page, `theme-${theme}-glass`);
  // Legibility: lane background vs. its text must not be same-on-same.
  const lumRgb = (rgb) => {
    if (!rgb) return null;
    const lin = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  };
  let contrastOk = false;
  {
    const lb = lumRgb(facts?.laneBgRgb);
    const lc = lumRgb(facts?.nameColorRgb);
    if (lb != null && lc != null) {
      const ratio = (Math.max(lb, lc) + 0.05) / (Math.min(lb, lc) + 0.05);
      contrastOk = ratio >= 2.5;
      facts.contrast = ratio.toFixed(2);
    }
  }
  assert("theme", `glass/${theme} renders lanes`, !err && facts?.lanes > 0, err ?? JSON.stringify(facts));
  assert("theme", `glass/${theme} text not same-on-same (ratio≥2.5)`, contrastOk, JSON.stringify(facts));
  await page.close();
  await ctx.close();
}

// ═══ RESPONSIVE (glass — no document h-scroll at phone/tablet/desktop) ════════
for (const w of [400, 768, 1280]) {
  const ctx = await newCtx({ [LS.frame]: "glass", [LS.theme]: "clear" }, { width: w, height: 900 });
  const page = await ctx.newPage();
  let err = null;
  let facts = null;
  try {
    const authed = await gotoAuthed(page, "/year");
    if (!authed) throw new Error("bounced to /login");
    await waitVisible(page, '[data-year-frame="glass"]', 30000);
    await page.waitForTimeout(9500);
    facts = await page.evaluate(() => ({
      docScrollW: document.documentElement.scrollWidth,
      docClientW: document.documentElement.clientWidth,
      lanes: document.querySelectorAll("[data-year-lane]").length,
    }));
  } catch (e) {
    err = e.message.slice(0, 200);
  }
  await shot(page, `resp-${w}`);
  const noHScroll = !err && facts && facts.docScrollW <= facts.docClientW + 1;
  assert("responsive", `no document h-scroll @ ${w}px`, noHScroll, err ?? JSON.stringify(facts));
  assert("responsive", `lanes present @ ${w}px`, !err && facts?.lanes > 0, err ?? JSON.stringify(facts));
  await page.close();
  await ctx.close();
}

// ═══ UNIT EXPLORER (open paths · tabs · mark-taught · close · frame-flip) ════
// Codex M3: the probe previously asserted only frame rendering / deep links /
// responsiveness, so neither the frame-flip state leak (M1) nor a broken open
// path would have been caught. These assertions cover the modal end-to-end.

/** The header progress ring's aria-label is "<taught> of <total> lessons taught".
 *  On the Lessons tab it is the ONLY such node (the Overview tab renders a
 *  second one), so read counts while that tab is active. */
const readTaught = (page) =>
  page.evaluate(() => {
    const rings = [...document.querySelectorAll('[role="img"]')];
    const r = rings.find((e) =>
      /lessons taught$/.test(e.getAttribute("aria-label") || ""),
    );
    const m = r && /^(\d+) of (\d+) lessons taught$/.exec(r.getAttribute("aria-label"));
    return m ? { taught: +m[1], total: +m[2] } : null;
  });

const modalOpen = (page) => page.evaluate(() => !!document.querySelector(".ue-modal"));

// Live frame flip WITHOUT a reload — mirrors what cross-device theme-sync does
// (the provider's `storage` listener re-reads localStorage), which is the exact
// path that made the M1 leak reachable while the dialog is up.
async function flipFrame(page, frame) {
  await page.evaluate(
    ({ f, keyFrame, keyStamp }) => {
      localStorage.setItem(keyFrame, f);
      localStorage.setItem(keyStamp, String(Date.now() + 300000));
      window.dispatchEvent(new StorageEvent("storage", { key: keyFrame, newValue: f }));
    },
    { f: frame, keyFrame: LS.frame, keyStamp: LS.stamp },
  );
}

// ---- Glass: open from a chip, tabs, mark-taught, Escape + focus restore ----
{
  const ctx = await newCtx({ [LS.frame]: "glass", [LS.theme]: "clear" });
  const page = await ctx.newPage();
  const chipSel = '[data-year-lane="math"] [data-year-chip]';
  let err = null;
  let opened = false;
  const tabOk = {};
  let bumped = null;
  let restored = null;
  let escClosed = false;
  let focusOk = false;
  let chipTitle = null;

  try {
    const authed = await gotoAuthed(page, "/year");
    if (!authed) throw new Error("bounced to /login");
    await waitVisible(page, chipSel, 30000);
    await page.waitForTimeout(9500); // hydration settle

    chipTitle = await page.getAttribute(chipSel, "title");
    await page.click(chipSel);
    opened = await waitVisible(page, ".ue-modal", 15000);

    // All five tab panels render.
    for (const key of ["overview", "lessons", "standards", "resources", "notes"]) {
      await page.click(`[data-ue-tab="${key}"]`);
      await page.waitForTimeout(250);
      tabOk[key] = await page.evaluate((k) => {
        const tab = document.querySelector(`[data-ue-tab="${k}"]`);
        const panel = document.querySelector("#ue-tabpanel");
        return (
          tab?.getAttribute("aria-selected") === "true" &&
          !!panel &&
          panel.childElementCount > 0
        );
      }, key);
    }

    // Mark-taught round trip on the Lessons tab: flip an un-taught lesson to
    // done (header count +1), then flip it back (count restored). Two-way so
    // the probe leaves the session state exactly as it found it.
    await page.click('[data-ue-tab="lessons"]');
    await page.waitForTimeout(400);
    const before = await readTaught(page);
    const pillSel = '#ue-tabpanel button[aria-pressed="false"]';
    await waitVisible(page, pillSel, 10000);
    // Hold the SAME pill for the restore click. Lessons sort week→day, so after
    // the toggle the first `aria-pressed="true"` in DOM order is an EARLIER,
    // already-taught lesson — re-querying would un-mark the wrong one (the
    // count would still check out, masking it). React updates FinishPill's
    // <button> in place, so the handle stays valid; a detach throws and fails
    // the assertion loudly rather than silently passing.
    const pill = await page.$(pillSel);
    if (!pill) throw new Error("no un-taught lesson pill in this unit");
    await pill.click();
    await page.waitForTimeout(600);
    const after = await readTaught(page);
    bumped = before && after && after.taught === before.taught + 1 && after.total === before.total;

    await pill.click();
    await page.waitForTimeout(600);
    const back = await readTaught(page);
    restored = before && back && back.taught === before.taught;

    // Escape closes and returns focus to the invoking chip.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(700);
    escClosed = !(await modalOpen(page));
    focusOk = await page.evaluate((t) => {
      const a = document.activeElement;
      return !!a && a.hasAttribute("data-year-chip") && a.getAttribute("title") === t;
    }, chipTitle);
  } catch (e) {
    err = e.message.slice(0, 200);
  }
  await shot(page, "explorer-glass");
  assert("explorer", "opens from a glass unit chip", !err && opened, err ?? "no .ue-modal");
  for (const key of ["overview", "lessons", "standards", "resources", "notes"]) {
    assert("explorer", `tab '${key}' panel renders`, !err && tabOk[key] === true, err ?? `tabOk=${tabOk[key]}`);
  }
  assert("explorer", "mark-taught bumps the Overview count", !err && bumped === true, err ?? `bumped=${bumped}`);
  assert("explorer", "un-marking restores the count", !err && restored === true, err ?? `restored=${restored}`);
  assert("explorer", "Escape closes the dialog", !err && escClosed, err ?? "still open");
  assert("explorer", "focus returns to the invoking chip", !err && focusOk, err ?? "activeElement !== chip");
  await page.close();
  await ctx.close();
}

// ---- Glass: scrim click closes ----
{
  const ctx = await newCtx({ [LS.frame]: "glass", [LS.theme]: "clear" });
  const page = await ctx.newPage();
  const chipSel = '[data-year-lane="math"] [data-year-chip]';
  let err = null;
  let scrimClosed = false;
  try {
    const authed = await gotoAuthed(page, "/year");
    if (!authed) throw new Error("bounced to /login");
    await waitVisible(page, chipSel, 30000);
    await page.waitForTimeout(9500);
    await page.click(chipSel);
    await waitVisible(page, ".ue-modal", 15000);
    // Click the scrim at its top-left corner — outside the centered modal.
    await page.click(".ue-scrim", { position: { x: 5, y: 5 } });
    await page.waitForTimeout(700);
    scrimClosed = !(await modalOpen(page));
  } catch (e) {
    err = e.message.slice(0, 200);
  }
  await shot(page, "explorer-scrim-close");
  assert("explorer", "scrim click closes the dialog", !err && scrimClosed, err ?? "still open");
  await page.close();
  await ctx.close();
}

// ---- Color: keyboard (Enter) opens from a constellation node ----
{
  const ctx = await newCtx({ [LS.frame]: "color", [LS.theme]: "clear" });
  const page = await ctx.newPage();
  const nodeSel = '[data-year-cluster="math"] button';
  let err = null;
  let kbOpened = false;
  try {
    const authed = await gotoAuthed(page, "/year");
    if (!authed) throw new Error("bounced to /login");
    await waitVisible(page, nodeSel, 30000);
    await page.waitForTimeout(9500);
    await page.focus(nodeSel);
    await page.keyboard.press("Enter");
    kbOpened = await waitVisible(page, ".ue-modal", 15000);
  } catch (e) {
    err = e.message.slice(0, 200);
  }
  await shot(page, "explorer-color-keyboard");
  assert("explorer", "keyboard Enter opens from a color node", !err && kbOpened, err ?? "no .ue-modal");
  await page.close();
  await ctx.close();
}

// ---- Frame flip with the dialog open (Codex M1 regression guard) ----
// glass + open → live-flip to paper (modal host unmounts) → flip back to glass.
// The dialog must NOT silently re-open.
{
  const ctx = await newCtx({ [LS.frame]: "glass", [LS.theme]: "clear" });
  const page = await ctx.newPage();
  const chipSel = '[data-year-lane="math"] [data-year-chip]';
  let err = null;
  let openedFirst = false;
  let goneOnPaper = false;
  let paperMounted = false;
  let notReopened = false;
  let glassMounted = false;
  try {
    const authed = await gotoAuthed(page, "/year");
    if (!authed) throw new Error("bounced to /login");
    await waitVisible(page, chipSel, 30000);
    await page.waitForTimeout(9500);
    await page.click(chipSel);
    openedFirst = await waitVisible(page, ".ue-modal", 15000);

    await flipFrame(page, "paper");
    paperMounted = await waitVisible(page, "[data-scope]", 20000);
    await page.waitForTimeout(800);
    goneOnPaper = !(await modalOpen(page));

    await flipFrame(page, "glass");
    glassMounted = await waitVisible(page, '[data-year-frame="glass"]', 20000);
    await page.waitForTimeout(1200); // give a leaked state time to re-render
    notReopened = !(await modalOpen(page));
  } catch (e) {
    err = e.message.slice(0, 200);
  }
  await shot(page, "explorer-frame-flip");
  assert("explorer", "dialog opens before the frame flip", !err && openedFirst, err ?? "never opened");
  assert("explorer", "flip to paper mounts the timeline", !err && paperMounted, err ?? "no [data-scope]");
  assert("explorer", "flip to paper closes the dialog", !err && goneOnPaper, err ?? "modal survived");
  assert("explorer", "flip back mounts glass", !err && glassMounted, err ?? "no glass frame");
  assert("explorer", "flip back does NOT re-open the dialog", !err && notReopened, err ?? "modal silently re-opened");
  await page.close();
  await ctx.close();
}

await browser.close();

// ── Summary ──────────────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed.`);
if (failed.length) {
  console.log("FAILURES:");
  for (const f of failed) console.log(`  [${f.group}] ${f.name} — ${f.detail}`);
  process.exit(1);
}
console.log("ALL PASS");
