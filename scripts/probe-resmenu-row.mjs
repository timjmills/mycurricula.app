// scripts/probe-resmenu-row.mjs — §4b live gate for the lesson-editor resource
// row's ⋯ menu (ResMenuTrigger → the shared ResMenu).
//
// WHAT IS UNDER TEST. Until this wiring, a resource attached to a lesson
// section carried exactly ONE affordance in the editor: ✕ Remove. No open, no
// edit — the only thing a teacher could do to it was destroy it. The chip now
// carries the handoff's ⋯ ("More — open, edit, remove",
// source-planning-hub/ph-workspace.jsx:400) and Remove moved INTO that menu
// behind a separator.
//
// The assertions are the ones a screenshot cannot make:
//   1. The row's control is the ⋯, and the bare ✕ is gone.
//   2. Clicking it opens EXACTLY ONE role="menu" (a portaled singleton, not one
//      per chip).
//   3. A second click on the same trigger TOGGLES it shut. This was a real
//      §4a finding: the trigger is exempt from the menu's outside-click close,
//      so without a toggle the ⋯ was the one click that could not dismiss it.
//   4. Escape closes the MENU and leaves the editor beneath it mounted, and
//      focus lands back on the trigger rather than on <body>.
//   5. Edit opens the composer PREFILLED with that resource (not a blank one).
//   6. Remove really removes the chip.
//   7. Every url item routes through the isSafeUrl sink: a resource whose url
//      is unsafe/absent offers no Open-in-new-tab and no Copy link.
//   8. ≥44px touch target under a coarse pointer.
//
// ORDER IS DELIBERATE: the destructive action runs LAST, after every
// non-destructive assertion has been collected, so a Remove cannot invalidate
// the rest of the run.
//
// This probe WRITES (Remove mutates the planner store, and locally that store
// is mock/localStorage-backed with no server call). Run it against a LOCAL dev
// server, never production.
//
// Usage: CLAUDE_BYPASS_TOKEN=… node scripts/probe-resmenu-row.mjs
//        PROBE_BASE defaults to http://localhost:3099

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { bypassLogin, requireToken } from "./lib/auth.mjs";

requireToken({ repoRoot: process.cwd() });
const BASE = process.env.PROBE_BASE ?? "http://localhost:3099";
const OUT = path.resolve("docs/screenshots/resmenu-row");
await mkdir(OUT, { recursive: true });

const TRIGGER_SEL = 'button[aria-haspopup="menu"][aria-label^="More actions for"]';
const MENU_SEL = '[role="menu"][aria-label^="Actions for"]';

const failures = [];
const notes = [];
function check(label, cond, detail = "") {
  (cond ? notes : failures).push(
    `${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
}
function info(label, detail = "") {
  notes.push(`INFO  ${label}${detail ? ` — ${detail}` : ""}`);
}

// Real Chrome, never the system-default browser (Edge on Windows).
const browser = await chromium.launch({ channel: "chrome" });

/** Seed the per-device flags the editor needs, then authenticate. */
async function newSeededContext(opts) {
  const context = await browser.newContext(opts);
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem(
        "mycurricula:onboarding",
        JSON.stringify({ stepIndex: 0, finished: true }),
      );
      // THE FRAME AXIS DECIDES WHICH TREE EXISTS. /daily renders <DayEditSplit>
      // (which mounts <LessonEditor>) only while the view's cc_editmode flag is
      // true — bundle-exact CAPITALIZED key. Without this the probe measures
      // the read-only Day view and reports "the control is missing" about a
      // component that was never asked to render.
      window.localStorage.setItem("cc_editmode", JSON.stringify({ Day: true }));
    } catch {
      /* private mode — the assertions below surface the consequence */
    }
  });
  await bypassLogin(context, { base: BASE, next: "/daily", timeout: 240000 });
  return context;
}

/** Wait for a real hydration marker. Dev hydration here runs 5–17s under
 *  concurrent-lane compile load; a fixed sleep measures SSR HTML. */
async function waitForEditor(page) {
  return page
    .waitForFunction(
      () => document.querySelectorAll("[data-section-id]").length > 0,
      { timeout: 180000, polling: 1000 },
    )
    .then(() => true)
    .catch(() => false);
}

// ───────────────────────────── Desktop 1440 ─────────────────────────────
const context = await newSeededContext({ viewport: { width: 1440, height: 950 } });
// Copy-link writes to the clipboard; without this Chrome rejects the write and
// the (correctly) caught failure would look like a broken action.
await context.grantPermissions(["clipboard-read", "clipboard-write"], {
  origin: BASE,
});
const page = await context.newPage();

const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
});

await page.goto(`${BASE}/daily`, { waitUntil: "domcontentloaded", timeout: 240000 });
check("stayed on /daily (first-run gate cleared)", !page.url().includes("/onboarding"), page.url());

let editorUp = await waitForEditor(page);
if (!editorUp) {
  // The right pane needs a selected lesson. Click the first lesson row, then
  // re-poll rather than assuming the first attempt was the failure.
  const row = page.locator("[data-lesson-id]").first();
  if (await row.count()) {
    await row.click({ timeout: 15000 }).catch(() => {});
    editorUp = await waitForEditor(page);
  }
}
check("lesson editor mounted (sections rendered)", editorUp);
if (!editorUp) {
  console.error("\nEditor never mounted — every later assertion would be noise.\n");
  for (const l of [...notes, ...failures]) console.error(l);
  await browser.close();
  process.exit(1);
}

// ── 1. The row's control is the ⋯, and the destructive-only ✕ is gone ──────
const triggers = page.locator(TRIGGER_SEL);
const triggerCount = await triggers.count();
check("resource rows carry a ⋯ trigger", triggerCount > 0, `${triggerCount} found`);
const staleRemoveOnly = await page
  .locator('button[aria-label^="Remove resource "]')
  .count();
check(
  "the bare ✕ remove-only control is gone from the chip",
  staleRemoveOnly === 0,
  `${staleRemoveOnly} left`,
);
await page.screenshot({ path: path.join(OUT, "row-1440.png") });

if (triggerCount === 0) {
  for (const l of [...notes, ...failures]) console.error(l);
  await browser.close();
  process.exit(1);
}

// Prefer a chip whose menu carries the url items, so the sink assertions
// exercise a real url rather than passing vacuously on a url-less notecard.
let idx = 0;
let urlBearing = false;
for (let i = 0; i < triggerCount; i++) {
  await triggers.nth(i).click();
  await page.waitForSelector(MENU_SEL, { timeout: 10000 });
  const hasCopy = await page.locator(`${MENU_SEL} [role="menuitem"]`, { hasText: "Copy link" }).count();
  if (hasCopy > 0) {
    idx = i;
    urlBearing = true;
    break;
  }
  await page.keyboard.press("Escape");
  await page.waitForSelector(MENU_SEL, { state: "detached", timeout: 10000 }).catch(() => {});
}
info(
  "chip chosen for the url assertions",
  urlBearing ? `#${idx} (has a safe url)` : "none had a safe url — url items asserted absent instead",
);
const trigger = triggers.nth(idx);

// Make sure exactly one menu is open for the shared assertions below.
if (!(await page.locator(MENU_SEL).count())) {
  await trigger.click();
  await page.waitForSelector(MENU_SEL, { timeout: 10000 });
}

// ── 2. Exactly ONE menu on screen (a portaled singleton, not per-chip) ────
check("exactly one menu is open", (await page.locator(MENU_SEL).count()) === 1);
check(
  "menu is portaled to <body>, not nested in the chip",
  await page.evaluate(
    (sel) => document.querySelector(sel)?.parentElement === document.body,
    MENU_SEL,
  ),
);

const items = await page.locator(`${MENU_SEL} [role="menuitem"]`).allInnerTexts();
info("menu items", items.map((t) => t.trim()).join(" · "));
check("Edit is offered (the constructive action the row lacked)", items.some((t) => /Edit/.test(t)));
check("Remove is offered inside the menu", items.some((t) => /Remove/.test(t)));
if (urlBearing) {
  check("Open in new tab offered for a safe url", items.some((t) => /Open in new tab/.test(t)));
  check("Copy link offered for a safe url", items.some((t) => /Copy link/.test(t)));
}
await page.screenshot({ path: path.join(OUT, "menu-open-1440.png") });

// ── 7. The url items are isSafeUrl-gated, not merely url-presence-gated ──
// Read the chip's own url off the DOM (the chip mirrors it into title=) and
// confirm the menu's offer matches the SINK's verdict, not "a url exists".
const sinkAgrees = await page.evaluate(
  ({ triggerSel, menuSel, i }) => {
    const trg = document.querySelectorAll(triggerSel)[i];
    const chip = trg?.closest("span");
    const title = chip?.getAttribute("title") ?? "";
    const looksLikeUrl = /^(https?:|blob:|\/)/.test(title);
    const menu = document.querySelector(menuSel);
    const offersUrl = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])].some((b) =>
      /Copy link/.test(b.textContent || ""),
    );
    return { title: title.slice(0, 80), looksLikeUrl, offersUrl };
  },
  { triggerSel: TRIGGER_SEL, menuSel: MENU_SEL, i: idx },
);
check(
  "url items track the isSafeUrl sink's verdict",
  sinkAgrees.looksLikeUrl === sinkAgrees.offersUrl,
  `chip title="${sinkAgrees.title}" offersUrl=${sinkAgrees.offersUrl}`,
);

// ── 3. Second click on the trigger TOGGLES shut (the §4a round-2 fix) ─────
await trigger.click();
const toggledShut = await page
  .waitForSelector(MENU_SEL, { state: "detached", timeout: 5000 })
  .then(() => true)
  .catch(() => false);
check("a second click on the ⋯ dismisses the menu (toggle)", toggledShut);
check(
  "aria-expanded returns to false after the toggle",
  (await trigger.getAttribute("aria-expanded")) === "false",
);

// ── 4. Escape closes the MENU only, and restores focus to the trigger ────
await trigger.click();
await page.waitForSelector(MENU_SEL, { timeout: 10000 });
check(
  "aria-expanded reads true while the menu is open",
  (await trigger.getAttribute("aria-expanded")) === "true",
);
const sectionsBefore = await page.locator("[data-section-id]").count();
await page.keyboard.press("Escape");
const escClosed = await page
  .waitForSelector(MENU_SEL, { state: "detached", timeout: 5000 })
  .then(() => true)
  .catch(() => false);
check("Escape closes the menu", escClosed);
check(
  "Escape did NOT close the editor beneath it",
  (await page.locator("[data-section-id]").count()) === sectionsBefore,
  `${sectionsBefore} sections before/after`,
);
check(
  "focus returned to the trigger (not <body>)",
  await page.evaluate(
    ({ sel, i }) => document.activeElement === document.querySelectorAll(sel)[i],
    { sel: TRIGGER_SEL, i: idx },
  ),
);

// ── Keyboard: arrows must ROVE FOCUS only, never commit ──────────────────
await trigger.click();
await page.waitForSelector(MENU_SEL, { timeout: 10000 });
const roving = await page.evaluate(
  (sel) => {
    const menu = document.querySelector(sel);
    const its = [...(menu?.querySelectorAll('[role="menuitem"]') ?? [])];
    return { first: its.indexOf(document.activeElement), n: its.length };
  },
  MENU_SEL,
);
check("focus lands on the first menu item on open", roving.first === 0, JSON.stringify(roving));
await page.keyboard.press("ArrowDown");
const roved = await page.evaluate(
  (sel) => {
    const menu = document.querySelector(sel);
    if (!menu) return -1; // menu gone ⇒ the arrow COMMITTED something
    return [...menu.querySelectorAll('[role="menuitem"]')].indexOf(document.activeElement);
  },
  MENU_SEL,
);
check("ArrowDown moves focus and commits nothing", roved === 1, `focus index ${roved}`);
await page.keyboard.press("Escape");
await page.waitForSelector(MENU_SEL, { state: "detached", timeout: 5000 }).catch(() => {});

// ── Open in new tab actually opens the resource's url ────────────────────
if (urlBearing) {
  await trigger.click();
  await page.waitForSelector(MENU_SEL, { timeout: 10000 });
  const popupPromise = context.waitForEvent("page", { timeout: 10000 }).catch(() => null);
  await page.locator(`${MENU_SEL} [role="menuitem"]`, { hasText: "Open in new tab" }).click();
  const popup = await popupPromise;
  check("Open in new tab opens the resource", !!popup, popup ? popup.url().slice(0, 80) : "no page event");
  if (popup) await popup.close().catch(() => {});
  await page.waitForSelector(MENU_SEL, { state: "detached", timeout: 5000 }).catch(() => {});

  // ── Copy link → the "Link copied" confirmation ─────────────────────────
  await trigger.click();
  await page.waitForSelector(MENU_SEL, { timeout: 10000 });
  await page.locator(`${MENU_SEL} [role="menuitem"]`, { hasText: "Copy link" }).click();
  const copied = await page
    .waitForFunction(() => /Link copied/.test(document.body.innerText), { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  check("Copy link raises the 'Link copied' confirmation", copied);
}

// ── 5. Edit opens the composer PREFILLED with this resource ──────────────
const chipLabel = await page.evaluate(
  ({ sel, i }) => {
    const trg = document.querySelectorAll(sel)[i];
    return (trg?.getAttribute("aria-label") || "").replace("More actions for ", "");
  },
  { sel: TRIGGER_SEL, i: idx },
);
await trigger.click();
await page.waitForSelector(MENU_SEL, { timeout: 10000 });
await page.locator(`${MENU_SEL} [role="menuitem"]`, { hasText: "Edit" }).click();
const composerUp = await page
  .waitForSelector(".cmp-modal, [role='dialog']", { timeout: 20000 })
  .then(() => true)
  .catch(() => false);
check("Edit opens the composer", composerUp, `resource "${chipLabel}"`);
if (composerUp) {
  await page.screenshot({ path: path.join(OUT, "composer-edit-1440.png") });
  const prefilled = await page.evaluate((label) => {
    const vals = [...document.querySelectorAll("input, textarea")].map((el) => el.value || "");
    return vals.some((v) => v.trim() === label.trim());
  }, chipLabel);
  check(
    "the composer is PREFILLED with the resource being edited",
    prefilled,
    `looking for "${chipLabel}"`,
  );
  check(
    "no menu survives above the modal",
    (await page.locator(MENU_SEL).count()) === 0,
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
}

// ── 8. ≥44px touch target under a coarse pointer ─────────────────────────
// FIRST, prove the touch assertion below is not vacuous: on a fine-pointer
// desktop the trigger must NOT already be 44px. If it were, "≥44px on touch"
// would pass with the media query deleted — a fallback that satisfies the
// assertion it is supposed to guard.
const desktopBox = await page.locator(TRIGGER_SEL).first().boundingBox();
check(
  "trigger is compact on a fine-pointer desktop (so the touch check is real)",
  !!desktopBox && desktopBox.height < 44,
  desktopBox ? `${Math.round(desktopBox.width)}×${Math.round(desktopBox.height)}` : "no box",
);

const touchCtx = await newSeededContext({
  viewport: { width: 834, height: 1112 },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
});
const touchPage = await touchCtx.newPage();
await touchPage.goto(`${BASE}/daily`, { waitUntil: "domcontentloaded", timeout: 240000 });
let touchEditor = await waitForEditor(touchPage);
if (!touchEditor) {
  const row = touchPage.locator("[data-lesson-id]").first();
  if (await row.count()) {
    await row.click({ timeout: 15000 }).catch(() => {});
    touchEditor = await waitForEditor(touchPage);
  }
}
if (touchEditor && (await touchPage.locator(TRIGGER_SEL).count())) {
  // Read the gate in the SAME observation it guards: assert the media query
  // actually matches here, so a 44px pass can't be attributed to a rule that
  // never fired.
  const coarse = await touchPage.evaluate(() => ({
    anyCoarse: matchMedia("(any-pointer: coarse)").matches,
    primaryCoarse: matchMedia("(pointer: coarse)").matches,
  }));
  info("pointer media state on the touch context", JSON.stringify(coarse));
  const box = await touchPage.locator(TRIGGER_SEL).first().boundingBox();
  check(
    "⋯ trigger is ≥44px on touch",
    !!box && box.width >= 44 && box.height >= 44,
    box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "no box",
  );
  check("the any-pointer:coarse rule actually fired", coarse.anyCoarse);
  await touchPage.screenshot({ path: path.join(OUT, "row-touch-834.png") });
} else {
  check("touch context reached the editor", false, "editor not mounted at 834 touch");
}

// ── Contrast of the ⋯ glyph, in BOTH tones ───────────────────────────────
// The trigger is quietened with `opacity: 0.7`, which fades the GLYPH itself —
// so the painted colour is not the colour token, and reading the token would
// manufacture a pass. tokens.css builds these values with color-mix, so
// getComputedStyle returns oklab; canvas-resolve to real sRGB bytes instead of
// hand-converting, then composite the opacity over the chip's painted
// background before computing the ratio.
async function measureTriggerContrast() {
  return page.evaluate((sel) => {
    const trg = document.querySelector(sel);
    if (!trg) return null;
    const cvs = document.createElement("canvas");
    cvs.width = cvs.height = 1;
    const ctx = cvs.getContext("2d", { willReadFrequently: true });
    const resolve = (css) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2]];
    };
    const paintedBg = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        if (bg && bg !== "rgba(0, 0, 0, 0)" && !/, 0\)$/.test(bg)) return resolve(bg);
        n = n.parentElement;
      }
      return [255, 255, 255];
    };
    const cs = getComputedStyle(trg);
    const fg = resolve(cs.color);
    const op = parseFloat(cs.opacity || "1");
    const bg = paintedBg(trg.closest("span") || trg);
    const eff = fg.map((c, i) => c * op + bg[i] * (1 - op));
    const lum = (px) =>
      px
        .map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        })
        .reduce((a, c, i) => a + [0.2126, 0.7152, 0.0722][i] * c, 0);
    const L1 = lum(eff);
    const L2 = lum(bg);
    return {
      tone: document.documentElement.getAttribute("data-tone"),
      ratio: Math.round((((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100)) / 100,
      opacity: op,
    };
  }, TRIGGER_SEL);
}
const firstTone = await measureTriggerContrast();
info("⋯ glyph contrast (as-loaded)", JSON.stringify(firstTone));
// Flip to the OTHER tone and re-measure — the legibility contract is per-tone,
// so one tone proves nothing about the other. Flip relative to what actually
// loaded (the persisted theme decides that, and it is not the same every run);
// an unconditional "force light" measured the same tone twice and labelled the
// duplicate as the second tone.
const otherTone = firstTone?.tone === "dark" ? "light" : "dark";
const originalBg = await page.evaluate(() => document.documentElement.getAttribute("data-bg"));
await page.evaluate(
  ({ tone }) => {
    document.documentElement.setAttribute("data-bg", tone === "dark" ? "photo" : "wash");
    document.documentElement.setAttribute("data-tone", tone);
  },
  { tone: otherTone },
);
await page.waitForTimeout(900);
const secondTone = await measureTriggerContrast();
info("⋯ glyph contrast (flipped tone)", JSON.stringify(secondTone));
// The flip must be READ in the same observation it guards: if the attribute
// did not take, say so instead of reporting a second tone that never rendered.
check(
  "the tone flip actually took (two distinct tones measured)",
  !!firstTone && !!secondTone && firstTone.tone !== secondTone.tone,
  `${firstTone?.tone} → ${secondTone?.tone}`,
);
for (const m of [firstTone, secondTone]) {
  // 3:1 is the WCAG bar for a non-text UI GLYPH (the accessible name carries
  // the meaning for AT); flag anything below it.
  check(
    `⋯ glyph reaches 3:1 against its chip (${m?.tone ?? "?"} tone)`,
    !!m && m.ratio >= 3,
    m ? `${m.ratio}:1 at opacity ${m.opacity}` : "not measured",
  );
}
await page.evaluate(
  ({ bg, tone }) => {
    if (bg) document.documentElement.setAttribute("data-bg", bg);
    document.documentElement.setAttribute("data-tone", tone);
  },
  { bg: originalBg, tone: firstTone?.tone ?? "dark" },
);
await page.waitForTimeout(500);

// ── Responsive: no document-level horizontal scroll ──────────────────────
for (const w of [375, 768, 1440]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(700);
  const over = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  check(`no document h-scroll at ${w}px`, over.doc <= over.win + 1, JSON.stringify(over));
  await page.screenshot({ path: path.join(OUT, `daily-${w}.png`) });
}
// /daily edit is VIEW-ONLY on phones by product decision (DailyView isPhone),
// so record what is actually true at 375 rather than implying coverage.
await page.setViewportSize({ width: 375, height: 812 });
await page.waitForTimeout(700);
info(
  "editor presence at 375",
  `${await page.locator("[data-section-id]").count()} sections (phone is view-only by design)`,
);

// ── 6. Remove — LAST, because it mutates ────────────────────────────────
await page.setViewportSize({ width: 1440, height: 950 });
await page.waitForTimeout(700);
const chipsBefore = await page.locator(TRIGGER_SEL).count();
const removeTrigger = page.locator(TRIGGER_SEL).first();
await removeTrigger.click();
await page.waitForSelector(MENU_SEL, { timeout: 10000 });
await page.locator(`${MENU_SEL} [role="menuitem"]`, { hasText: "Remove" }).click();
const chipsAfter = await page
  .waitForFunction(
    ({ sel, before }) => document.querySelectorAll(sel).length === before - 1,
    { sel: TRIGGER_SEL, before: chipsBefore },
    { timeout: 10000 },
  )
  .then(() => true)
  .catch(() => false);
check("Remove removes the chip", chipsAfter, `${chipsBefore} → ${await page.locator(TRIGGER_SEL).count()}`);
await page.screenshot({ path: path.join(OUT, "after-remove-1440.png") });

// ── Console ──────────────────────────────────────────────────────────────
check("browser console clean", consoleErrors.length === 0, consoleErrors.slice(0, 4).join(" | "));

console.log(`\n── probe-resmenu-row (${BASE}) ──\n`);
for (const l of notes) console.log(l);
for (const l of failures) console.log(l);
console.log(`\n${failures.length === 0 ? "ALL PASS" : `${failures.length} FAILURE(S)`}\n`);
console.log(`screenshots: ${OUT}`);

await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
