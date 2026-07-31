// scripts/probe-qa-year-teach.mjs — §4b LIVE QA pass, REPORT ONLY.
//
// SURFACES: /year → Unit workspace → REFINE tab, and /teach → v2 board header.
// Both landed in a571d87; this run measures HEAD 988c710 (verified clean for
// components/lib/app before and after — see the precondition block it prints).
//
// FAIL-OPEN DISCIPLINE (the trap list this repo keeps paying for):
//   • Every absence assertion is paired with a POSITIVE CONTROL taken in the
//     SAME observation, so "X is not present" on a dead page is a FAIL, not a
//     pass. Each such row prints both counts.
//   • The phone tier is emulated with isMobile + hasTouch + deviceScaleFactor
//     (a desktop resize to 375 reads scrollWidth=375 even while a real phone
//     overflows) and the probe ASSERTS matchMedia('(pointer: coarse)') in the
//     same observation before it reports a touch-target result.
//   • /rest/v1/ requests are counted. Locally there is no
//     NEXT_PUBLIC_PLANNER_USE_SUPABASE, so this is the MOCK planner path and
//     pending/error hydration states are unreachable — the count is printed so
//     the reader can see that rather than take it on trust.
//
// It CHANGES local mock state (typing into cells, fill-down) because that is the
// interaction under test. It writes nothing to any database: every non-GET to
// /rest/v1/ is aborted at the network layer.
//
// Usage: node scripts/probe-qa-year-teach.mjs   (PROBE_BASE defaults to :3014)

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const OUT = path.resolve("docs/screenshots/qa-year-teach");
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

// ── Precondition ────────────────────────────────────────────────────────────
const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"]).toString().trim();
const dirty = execFileSync("git", [
  "diff", "HEAD", "--name-only", "--", "components", "lib", "app",
]).toString().trim();
info("HEAD", sha);
info("tree at start", dirty ? `DIRTY (${dirty.split("\n").length} files) — measures the WORKING TREE` : `clean — equals ${sha}`);

const browser = await chromium.launch({ channel: "chrome" });

const consoleMsgs = [];
const restCalls = [];
function wire(ctx) {
  ctx.on("weberror", (e) => consoleMsgs.push({ type: "pageerror", text: String(e.error()).slice(0, 400) }));
  ctx.on("request", (r) => {
    if (r.url().includes("/rest/v1/")) restCalls.push(`${r.method()} ${r.url().split("/rest/v1/")[1].slice(0, 60)}`);
  });
  ctx.route("**/rest/v1/**", async (route) => {
    if (route.request().method() === "GET") return route.continue();
    return route.abort(); // read-only lane: no DB writes from a QA probe
  });
}
function wirePage(page, tag) {
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      consoleMsgs.push({ type: m.type(), tag, text: m.text().slice(0, 400) });
  });
}

const CHIP = 'button[aria-label^="Open the"][aria-label$="unit workspace"]';
const YEAR_CHIP = 'button[data-year-chip][title="Fractions"]';

/**
 * Wait for REAL hydration, not for a sleep.
 *
 * This dev server is shared with several build lanes; a cold /year took 77s to
 * respond and its first React fiber appeared at ~97s. A server-rendered button
 * is clickable long before React attaches onClick, so a timed wait produces the
 * signature false finding of this repo: "the click does nothing" on a page that
 * simply was not hydrated yet. React 19 stamps `__reactProps$…` on host nodes as
 * it hydrates them, so the presence of that key ON THE ELEMENT ABOUT TO BE
 * CLICKED is a direct, positive readiness signal.
 */
async function waitForHydrated(page, sel, timeout = 240000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const ready = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return false;
      return Object.keys(el).some((k) => k.startsWith("__reactProps"));
    }, sel);
    if (ready) return Math.round((Date.now() - t0) / 1000);
    await page.waitForTimeout(1500);
  }
  throw new Error(`never hydrated within ${timeout}ms: ${sel}`);
}

async function openWorkspace(page, label) {
  // /year FIRST — the surface named in the brief. On the default glass frame the
  // opener is YearA's unit chip (`[data-year-chip]`, title = the unit's full
  // name); the aria-labelled <UnitChip> is a Day/Week control. The fallbacks are
  // recorded, so a reader always knows which entry produced the measurement.
  const ENTRIES = [
    { name: "/year unit chip (YearA, glass frame)", route: "/year", sel: YEAR_CHIP },
    { name: "/daily?lesson=m-11-1 UnitChip", route: "/daily?lesson=m-11-1", sel: CHIP },
    { name: "/weekly?lesson=m-11-1 UnitChip", route: "/weekly?lesson=m-11-1", sel: CHIP },
  ];
  const dialog = page.locator('[role="dialog"]').first();
  for (const e of ENTRIES) {
    try {
      await page.goto(`${BASE}${e.route}`, { waitUntil: "domcontentloaded", timeout: 240000 });
      const secs = await waitForHydrated(page, e.sel);
      info(`hydration wait (${label}, ${e.route})`, `${secs}s to first React props on the opener`);
      const t = page.locator(e.sel).first();
      await t.click({ timeout: 15000 });
      await dialog.waitFor({ state: "visible", timeout: 30000 });
      info(`workspace entry (${label})`, e.name);
      return e.name;
    } catch (err) {
      info(`entry unavailable (${label}), trying next`, `${e.name} — ${String(err).slice(0, 120)}`);
    }
  }
  throw new Error("no entry point opened the unit workspace");
}

const result = {};

try {
  // ══ STAGE 1 — desktop 1440 ════════════════════════════════════════════════
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  wire(ctx);
  await bypassLogin(ctx, { base: BASE, next: "/year", timeout: 180000, retries: 3 });
  const page = await ctx.newPage();
  wirePage(page, "1440");

  await openWorkspace(page, "1440");
  const dlg = page.locator('[role="dialog"]').first();
  await page.screenshot({ path: path.join(OUT, "01-workspace-open-1440.png") });

  // Tab strip + Refine reachable
  const strip = page.locator('[role="tablist"][aria-label="Unit details"]');
  const tabNames = (await strip.getByRole("tab").allTextContents()).map((s) => s.trim());
  info("tab strip", tabNames.join(" · "));
  check("Refine tab is reachable in the strip", tabNames.includes("Refine"), tabNames.join(" · "));

  await dlg.getByRole("tab", { name: "Refine" }).click();
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT, "02-refine-1440.png") });

  // ── A1. Eight columns, none stranded ──────────────────────────────────────
  const cols = await page.evaluate(() => {
    const table = document.querySelector('[role="dialog"] table');
    if (!table) return null;
    const wrap = table.parentElement;
    const wr = wrap.getBoundingClientRect();
    const ths = [...table.querySelectorAll("thead th")];
    return {
      count: ths.length,
      headers: ths.map((t) => (t.textContent || "").trim() || "(sr-only)"),
      wrapScrollWidth: wrap.scrollWidth,
      wrapClientWidth: wrap.clientWidth,
      wrapOverflowX: getComputedStyle(wrap).overflowX,
      dialogWidth: document.querySelector('[role="dialog"]').getBoundingClientRect().width,
      cells: ths.map((t) => {
        const r = t.getBoundingClientRect();
        return { name: (t.textContent || "").trim() || "(sr)", left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) };
      }),
      wrapLeft: Math.round(wr.left),
      wrapRight: Math.round(wr.right),
    };
  });
  result.cols = cols;
  info("table columns", cols.headers.join(" | "));
  check("all 8 columns render", cols.count === 8, `${cols.count} columns`);
  const last = cols.cells[cols.cells.length - 1];
  check(
    "the right-most column ('Planned') is NOT stranded behind a horizontal scrollbar at 1440",
    cols.wrapScrollWidth <= cols.wrapClientWidth + 1 && last.right <= cols.wrapRight + 1,
    `wrap scrollWidth=${cols.wrapScrollWidth} clientWidth=${cols.wrapClientWidth}; Planned right=${last.right} wrapRight=${cols.wrapRight}; dialog=${Math.round(cols.dialogWidth)}px`,
  );

  // ── A2. The Pass mechanic ─────────────────────────────────────────────────
  const passSel = page.locator("#ue-refine-pass");
  await passSel.selectOption("objective");
  await page.waitForTimeout(400);
  const passState = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]');
    const tinted = [...d.querySelectorAll("[data-focus]")];
    const th = d.querySelector("thead th[data-focus]");
    const td = d.querySelector("tbody td[data-focus]");
    const plainTd = d.querySelector("tbody tr td:not([data-focus])");
    const status = d.querySelector('[role="status"]');
    return {
      tinted: tinted.length,
      thText: th ? th.textContent.trim() : null,
      tintedBg: td ? getComputedStyle(td).backgroundColor : null,
      plainBg: plainTd ? getComputedStyle(plainTd).backgroundColor : null,
      counter: status ? status.textContent.trim() : null,
    };
  });
  result.passState = passState;
  info("pass counter", passState.counter);
  check("choosing a Pass tints its column", passState.tinted > 1 && passState.tintedBg !== passState.plainBg,
    `${passState.tinted} tinted cells; tinted bg=${passState.tintedBg} vs plain bg=${passState.plainBg}`);
  check("the counter reads 'N of M done'", /\d+ of \d+ done/.test(passState.counter || ""), passState.counter || "(none)");
  await page.screenshot({ path: path.join(OUT, "03-pass-objectives-1440.png") });

  // ── A3. Enter-advance, for real, with the keyboard ────────────────────────
  const rowCount = await page.locator('[role="dialog"] tbody tr').count();
  info("rows in unit", String(rowCount));
  await page.locator('input[aria-label="Objective, lesson 1"]').click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("QA probe objective one");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(250);
  const afterEnter = await page.evaluate(() => {
    const a = document.activeElement;
    return {
      label: a?.getAttribute("aria-label") ?? "",
      tag: a?.tagName,
      selStart: a && "selectionStart" in a ? a.selectionStart : null,
      selEnd: a && "selectionEnd" in a ? a.selectionEnd : null,
      len: a && "value" in a ? String(a.value).length : null,
    };
  });
  result.afterEnter = afterEnter;
  check("Enter moves focus to the SAME field on the next row",
    afterEnter.label === "Objective, lesson 2", `focus landed on "${afterEnter.label}"`);
  check("…and selects that cell's text",
    afterEnter.len === 0 || (afterEnter.selStart === 0 && afterEnter.selEnd === afterEnter.len),
    `selection ${afterEnter.selStart}–${afterEnter.selEnd} of ${afterEnter.len} chars`);

  // Last row must not swallow the key
  await page.locator(`input[aria-label="Objective, lesson ${rowCount}"]`).click();
  await page.keyboard.press("Enter");
  const lastFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
  check("Enter on the last row does not strand focus", lastFocus === `Objective, lesson ${rowCount}`, `focus = "${lastFocus}"`);

  // Durations pass Enter-advance (a number input)
  await passSel.selectOption("duration");
  await page.waitForTimeout(300);
  await page.locator('input[aria-label="Minutes, lesson 1"]').click();
  await page.keyboard.press("Enter");
  const durFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
  check("Enter advances the Durations column too", durFocus === "Minutes, lesson 2", `focus = "${durFocus}"`);

  // Assessments pass Enter-advance (a select)
  await passSel.selectOption("assessment");
  await page.waitForTimeout(300);
  await page.locator('select[aria-label="Assessment, lesson 1"]').focus();
  await page.keyboard.press("Enter");
  const assFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
  check("Enter advances the Assessment column too", assFocus === "Assessment, lesson 2", `focus = "${assFocus}"`);

  // STANDARDS pass — the column is a button, not a registered cell.
  await passSel.selectOption("standards");
  await page.waitForTimeout(300);
  const stdCounter = await page.evaluate(() => document.querySelector('[role="dialog"] [role="status"]')?.textContent.trim() ?? "");
  await page.locator('button[aria-label="Standards, lesson 1"]').focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  const stdAfter = await page.evaluate(() => ({
    focus: document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName ?? "",
    dialogs: document.querySelectorAll('[role="dialog"]').length,
  }));
  result.standardsPass = { stdCounter, stdAfter };
  info("Standards pass counter copy", stdCounter);
  info("Enter on the Standards cell", JSON.stringify(stdAfter));
  check(
    "Standards pass: the counter copy matches what Enter actually does",
    !/Enter jumps to the next lesson/.test(stdCounter) || stdAfter.focus === "Standards, lesson 2",
    `copy promises Enter-advance = ${/Enter jumps/.test(stdCounter)}; focus after Enter = "${stdAfter.focus}"`,
  );
  await page.screenshot({ path: path.join(OUT, "04-standards-pass-enter-1440.png") });
  // close any picker the Enter opened
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await passSel.selectOption("");
  await page.waitForTimeout(300);

  // ── A4. Fill-down ─────────────────────────────────────────────────────────
  const fdState = async () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[role="dialog"] thead button[aria-label^="Copy the first lesson"]')].map((b) => ({
        label: b.getAttribute("aria-label").replace("Copy the first lesson’s ", "").replace(" to every lesson in this unit", ""),
        disabled: b.disabled,
      })),
    );
  info("fill-down initial state", JSON.stringify(await fdState()));

  // Empty the SOURCE cell (row 1 duration) → the guard must disable the button.
  await page.locator('input[aria-label="Minutes, lesson 1"]').click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("Delete");
  await page.waitForTimeout(600);
  const fdEmpty = await fdState();
  const durEmpty = fdEmpty.find((f) => f.label.includes("duration"));
  const otherEnabled = fdEmpty.filter((f) => !f.label.includes("duration") && !f.disabled).length;
  check("fill-down is DISABLED when the source cell is empty",
    durEmpty?.disabled === true,
    `duration fill-down disabled=${durEmpty?.disabled}; positive control: ${otherEnabled} sibling fill-down(s) still ENABLED in the same observation`);
  await page.screenshot({ path: path.join(OUT, "05-filldown-disabled-1440.png") });

  // Restore a source value, then fill down and count undo steps.
  await page.locator('input[aria-label="Minutes, lesson 1"]').click();
  await page.keyboard.type("35");
  await page.waitForTimeout(900);
  const before = await page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] input[aria-label^="Minutes"]')].map((i) => i.value));
  const fdBtn = page.locator('[role="dialog"] thead button[aria-label*="duration"]');
  check("fill-down re-ENABLES once the source has a value", !(await fdBtn.isDisabled()), `disabled=${await fdBtn.isDisabled()}`);
  await fdBtn.click();
  await page.waitForTimeout(800);
  const afterFill = await page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] input[aria-label^="Minutes"]')].map((i) => i.value));
  const changed = afterFill.filter((v, i) => v !== before[i]).length;
  check("fill-down copies the source down the column", afterFill.every((v) => v === afterFill[0]) && changed > 0,
    `${changed} of ${afterFill.length} rows changed; values now [${afterFill.join(",")}]`);
  await page.screenshot({ path: path.join(OUT, "06-filldown-applied-1440.png") });

  // ONE undo step: focus must NOT be an input (global-shortcuts ignores inputs).
  await page.locator('[role="dialog"] table caption').click({ force: true }).catch(() => {});
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(900);
  const afterUndo = await page.evaluate(() =>
    [...document.querySelectorAll('[role="dialog"] input[aria-label^="Minutes"]')].map((i) => i.value));
  const restored = afterUndo.filter((v, i) => v === before[i]).length;
  result.undo = { before, afterFill, afterUndo };
  check("ONE undo step reverts the whole fill-down (not N)",
    restored === before.length,
    `${restored}/${before.length} rows back to their pre-fill values after a single Ctrl+Z — before=[${before.join(",")}] afterFill=[${afterFill.join(",")}] afterUndo=[${afterUndo.join(",")}]`);
  await page.screenshot({ path: path.join(OUT, "07-after-one-undo-1440.png") });

  // ── A5. THE RICH-TEXT CELL ────────────────────────────────────────────────
  // Author REAL markup through the app's own editor, then look at the cell.
  await dlg.getByRole("tab", { name: "Lessons" }).click();
  await page.waitForTimeout(800);
  await dlg.getByRole("button", { name: "Plan", exact: true }).first().click();
  await page.waitForTimeout(1500);
  const objEditor = page.getByRole("textbox", { name: /Lesson objective/i });
  await objEditor.waitFor({ state: "visible", timeout: 60000 });
  await objEditor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("compare two fractions");
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+b");
  await page.waitForTimeout(1200);
  const authored = await objEditor.innerHTML();
  check("CONTROL: the app's own editor really stores markup (without this the rest proves nothing)",
    /<(b|strong|em|i|span)[\s>]/i.test(authored), authored.slice(0, 120));

  await page.locator('[data-ue-mode="unit"]').first().click();
  await page.waitForTimeout(1200);
  await dlg.getByRole("tab", { name: "Refine" }).click();
  await page.waitForTimeout(1000);

  const richCell = await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('[role="dialog"] tbody tr input[aria-label*="Objective"]')];
    const ro = inputs.find((i) => i.hasAttribute("data-rich-readonly"));
    const plain = inputs.find((i) => !i.hasAttribute("data-rich-readonly"));
    const read = (el) => {
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        value: el.value,
        readOnly: el.readOnly,
        ariaReadonly: el.getAttribute("aria-readonly"),
        title: el.getAttribute("title"),
        label: el.getAttribute("aria-label"),
        color: cs.color,
        borderBottom: `${cs.borderBottomStyle} ${cs.borderBottomWidth} ${cs.borderBottomColor}`,
        textDecoration: cs.textDecorationLine + " " + cs.textDecorationStyle,
        opacity: cs.opacity,
        cursor: cs.cursor,
        index: inputs.indexOf(el),
      };
    };
    return { readonly: read(ro), plain: read(plain), total: inputs.length };
  });
  result.richCell = richCell;
  check("a markup-carrying objective renders READ-ONLY with stripped text",
    !!richCell.readonly && richCell.readonly.readOnly === true && !/[<>]/.test(richCell.readonly.value),
    richCell.readonly ? `value="${richCell.readonly.value}" readOnly=${richCell.readonly.readOnly}` : "no read-only cell found");
  check("it LOOKS inert — muted ink and/or a dotted rule, visibly different from a live cell",
    !!richCell.readonly && !!richCell.plain &&
      (richCell.readonly.color !== richCell.plain.color ||
        richCell.readonly.borderBottom !== richCell.plain.borderBottom ||
        richCell.readonly.textDecoration !== richCell.plain.textDecoration),
    richCell.readonly && richCell.plain
      ? `read-only: color=${richCell.readonly.color} border-bottom=${richCell.readonly.borderBottom} decoration=${richCell.readonly.textDecoration} cursor=${richCell.readonly.cursor} | plain: color=${richCell.plain.color} border-bottom=${richCell.plain.borderBottom} decoration=${richCell.plain.textDecoration}`
      : "missing one of the two cells");
  check("it explains WHY rather than looking broken",
    (richCell.readonly?.title ?? "").includes("Lesson Planner"), richCell.readonly?.title ?? "(no title)");
  await page.screenshot({ path: path.join(OUT, "08-rich-readonly-cell-1440.png") });
  if (richCell.readonly)
    await page
      .locator('[role="dialog"] tbody tr')
      .nth(richCell.readonly.index)
      .screenshot({ path: path.join(OUT, "09-rich-readonly-row-crop.png") })
      .catch(() => {});

  // ANTI-OVERSHOOT: a plain lesson must still be fully editable.
  const plainLabel = richCell.plain?.label;
  await page.locator(`input[aria-label="${plainLabel}"]`).click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("plain cell still editable OK");
  await page.waitForTimeout(900);
  const plainAfter = await page.evaluate((l) =>
    document.querySelector(`[role="dialog"] input[aria-label="${l}"]`)?.value ?? "", plainLabel);
  check("ANTI-OVERSHOOT: a PLAIN lesson's cell is still fully editable",
    plainAfter === "plain cell still editable OK", `value now "${plainAfter}"`);
  // …and the read-only one truly refuses writes
  if (richCell.readonly) {
    const roLabel = richCell.readonly.label;
    await page.locator(`input[aria-label="${roLabel}"]`).click();
    await page.keyboard.type("ZZZZ");
    await page.waitForTimeout(700);
    const roAfter = await page.evaluate((l) =>
      document.querySelector(`[role="dialog"] input[aria-label="${l}"]`)?.value ?? "", roLabel);
    check("the read-only cell refuses real keystrokes", roAfter === richCell.readonly.value,
      `before="${richCell.readonly.value}" after="${roAfter}"`);
  }

  // ── A6. Document-level horizontal scroll at 1440 ──────────────────────────
  const scroll1440 = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
    mainSw: document.querySelector("#main-content")?.scrollWidth ?? null,
    mainCw: document.querySelector("#main-content")?.clientWidth ?? null,
  }));
  check("no document-level horizontal scroll at 1440", scroll1440.sw <= scroll1440.cw + 1, JSON.stringify(scroll1440));

  // ══ STAGE 2 — /teach at 1440 ══════════════════════════════════════════════
  await page.goto(`${BASE}/teach?lesson=m-11-1`, { waitUntil: "domcontentloaded", timeout: 240000 });
  info("teach hydration (1440)", `${await waitForHydrated(page, "header button")}s to first React props in the header`);
  await page.waitForTimeout(2500); // let the planner store settle after hydrate
  const readHeader = () => page.evaluate(readHeaderSrc());

  const h1440 = await readHeader();
  result.teach1440 = h1440;
  info("teach header @1440", JSON.stringify({ title: h1440.title, objective: h1440.objective?.slice(0, 60), pills: h1440.standardsPills, headerH: h1440.headerH }));
  check("board header shows the lesson TITLE at 1440", !!h1440.title && h1440.titleVisible, `title="${h1440.title}"`);
  check("board header shows the OBJECTIVE at 1440", !!h1440.objective && h1440.objectiveVisible, `objective="${(h1440.objective || "").slice(0, 80)}"`);
  check("board header shows STANDARDS pills at 1440", h1440.standardsPills > 0 && h1440.standardsVisible, `${h1440.standardsPills} pills, display=${h1440.standardsDisplay}`);
  check("the tool cluster is fully on-screen at 1440", h1440.toolsOffscreen.length === 0,
    `${h1440.tools.filter((t) => t.visible).length} visible header buttons, ${h1440.toolsOffscreen.length} off-screen — positive control: buttons found = ${h1440.tools.length}`);
  await page.screenshot({ path: path.join(OUT, "10-teach-header-1440.png") });

  // Expand the board (hides the lesson rail)
  await page.locator('[aria-label="Expand board"]').first().click();
  await page.waitForTimeout(1200);
  const hExpanded = await readHeader();
  result.teachExpanded = hExpanded;
  const railGone = await page.evaluate(() => {
    const rail = document.querySelector('[class*="lessonRail"], aside');
    return !rail || rail.getBoundingClientRect().width < 5;
  });
  check("expanding the board really hides the lesson rail (control for the next row)", railGone, `rail hidden=${railGone}`);
  check("lesson identity SURVIVES board-expanded", !!hExpanded.title && hExpanded.titleVisible,
    `title="${hExpanded.title}" objective="${(hExpanded.objective || "").slice(0, 50)}"`);
  check("the tool cluster is fully on-screen when expanded", hExpanded.toolsOffscreen.length === 0,
    `off-screen: ${hExpanded.toolsOffscreen.join(", ") || "none"}`);
  await page.screenshot({ path: path.join(OUT, "11-teach-expanded-1440.png") });

  // Fullscreen (a real click IS a user gesture, so requestFullscreen can land)
  await page.locator('[aria-label="Present fullscreen"]').first().click();
  await page.waitForTimeout(1500);
  const fsState = await page.evaluate(() => ({
    fullscreenElement: !!document.fullscreenElement,
    trueFullAttr: document.querySelector("[data-true-full], [data-truefull]") ? true : null,
    exitBtn: !!document.querySelector('[aria-label="Exit fullscreen"]'),
  }));
  const hFull = await readHeader();
  result.teachFullscreen = { fsState, hFull };
  check("fullscreen state actually engaged (control)", fsState.exitBtn === true,
    `Exit-fullscreen button present=${fsState.exitBtn}, document.fullscreenElement=${fsState.fullscreenElement}`);
  check("lesson identity SURVIVES fullscreen", !!hFull.title && hFull.titleVisible,
    `title="${hFull.title}" objective="${(hFull.objective || "").slice(0, 50)}" pills=${hFull.standardsPills}`);
  check("the tool cluster is fully on-screen in fullscreen", hFull.toolsOffscreen.length === 0,
    `off-screen: ${hFull.toolsOffscreen.join(", ") || "none"}`);
  await page.screenshot({ path: path.join(OUT, "12-teach-fullscreen-1440.png") });
  await page.locator('[aria-label="Exit fullscreen"]').first().click().catch(() => {});
  await page.waitForTimeout(800);

  // ══ STAGE 3 — tablet 768 (touch) ══════════════════════════════════════════
  const ctxT = await browser.newContext({
    viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  wire(ctxT);
  await bypassLogin(ctxT, { base: BASE, next: "/year", timeout: 180000, retries: 3 });
  const pT = await ctxT.newPage();
  wirePage(pT, "768");
  const media768 = async (p) => p.evaluate(() => ({
    pointerCoarse: matchMedia("(pointer: coarse)").matches,
    anyPointerCoarse: matchMedia("(any-pointer: coarse)").matches,
    under900: matchMedia("(max-width: 900px)").matches,
    vw: window.innerWidth,
  }));

  await pT.goto(`${BASE}/teach?lesson=m-11-1`, { waitUntil: "domcontentloaded", timeout: 240000 });
  info("teach hydration (768)", `${await waitForHydrated(pT, "header button")}s`);
  await pT.waitForTimeout(2500);
  const m768 = await media768(pT);
  info("emulation @768", JSON.stringify(m768));
  const h768 = await pT.evaluate(readHeaderSrc());
  result.teach768 = { media: m768, header: h768 };
  check("768: title + objective still render", !!h768.title && h768.titleVisible, `title="${h768.title}"`);
  check("768: standards pills are HIDDEN by design (<900px) — paired with a positive control",
    h768.standardsDisplay === "none" || !h768.standardsVisible,
    `standards display=${h768.standardsDisplay}, visible=${h768.standardsVisible}; POSITIVE CONTROL: title visible=${h768.titleVisible} ("${h768.title}"), header buttons=${h768.tools.length}`);
  check("768: the header does not grow to three rows", h768.rowBands <= 2, `distinct row bands = ${h768.rowBands}, header height = ${h768.headerH}px`);
  check("768: tool cluster fully on-screen", h768.toolsOffscreen.length === 0, `off-screen: ${h768.toolsOffscreen.join(", ") || "none"}`);
  check("768: no document-level horizontal scroll", h768.docSw <= h768.docCw + 1, `scrollWidth=${h768.docSw} clientWidth=${h768.docCw}`);
  await pT.screenshot({ path: path.join(OUT, "13-teach-header-768.png") });

  // Refine at 768
  await openWorkspace(pT, "768");
  await pT.locator('[role="dialog"]').first().getByRole("tab", { name: "Refine" }).click();
  await pT.waitForTimeout(1000);
  const refine768 = await pT.evaluate(() => {
    const table = document.querySelector('[role="dialog"] table');
    const wrap = table?.parentElement;
    const targets = [...document.querySelectorAll('[role="dialog"] tbody input, [role="dialog"] tbody select, [role="dialog"] tbody button, [role="dialog"] thead button')];
    const small = targets.map((t) => { const r = t.getBoundingClientRect(); return { label: t.getAttribute("aria-label") || t.tagName, w: Math.round(r.width), h: Math.round(r.height) }; })
      .filter((t) => t.h > 0 && t.h < 44);
    return {
      rows: document.querySelectorAll('[role="dialog"] tbody tr').length,
      wrapScroll: wrap ? { sw: wrap.scrollWidth, cw: wrap.clientWidth, overflowX: getComputedStyle(wrap).overflowX } : null,
      docSw: document.documentElement.scrollWidth,
      docCw: document.documentElement.clientWidth,
      totalTargets: targets.length,
      under44: small,
    };
  });
  result.refine768 = refine768;
  check("768: Refine renders rows", refine768.rows > 0, `${refine768.rows} rows`);
  check("768: no document-level horizontal scroll on Refine", refine768.docSw <= refine768.docCw + 1,
    `doc scrollWidth=${refine768.docSw} clientWidth=${refine768.docCw}; table scrolls INSIDE its card (${JSON.stringify(refine768.wrapScroll)})`);
  check("768: every Refine control meets the 44px touch floor",
    refine768.under44.length === 0,
    `${refine768.under44.length} of ${refine768.totalTargets} under 44px${refine768.under44.length ? ": " + refine768.under44.slice(0, 8).map((t) => `${t.label}=${t.h}px`).join(", ") : ""} (emulation: pointer:coarse=${m768.pointerCoarse})`);
  await pT.screenshot({ path: path.join(OUT, "14-refine-768.png") });

  // ══ STAGE 4 — phone 375 ═══════════════════════════════════════════════════
  const ctxP = await browser.newContext({
    viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  });
  wire(ctxP);
  await bypassLogin(ctxP, { base: BASE, next: "/year", timeout: 180000, retries: 3 });
  const pP = await ctxP.newPage();
  wirePage(pP, "375");
  await pP.goto(`${BASE}/teach?lesson=m-11-1`, { waitUntil: "domcontentloaded", timeout: 240000 });
  info("teach hydration (375)", `${await waitForHydrated(pP, "header button")}s`);
  await pP.waitForTimeout(2500);
  const m375 = await media768(pP);
  info("emulation @375", JSON.stringify(m375));
  const h375 = await pP.evaluate(readHeaderSrc());
  result.teach375 = { media: m375, header: h375 };
  check("375: title still renders (identity survives the phone)", !!h375.title && h375.titleVisible, `title="${h375.title}"`);
  check("375: standards pills HIDDEN by design — with a positive control",
    h375.standardsDisplay === "none" || !h375.standardsVisible,
    `display=${h375.standardsDisplay}; POSITIVE CONTROL: title visible=${h375.titleVisible}, header buttons=${h375.tools.length}`);
  check("375: the header does not grow to three rows", h375.rowBands <= 2, `distinct row bands = ${h375.rowBands}, header height = ${h375.headerH}px`);
  check("375: tool cluster fully on-screen", h375.toolsOffscreen.length === 0,
    `off-screen: ${h375.toolsOffscreen.join(", ") || "none"} — of ${h375.tools.filter((t) => t.visible).length} visible buttons`);
  check("375: no document-level horizontal scroll (mobile emulation, isMobile+DSF3)", h375.docSw <= h375.docCw + 1,
    `scrollWidth=${h375.docSw} clientWidth=${h375.docCw}`);
  await pP.screenshot({ path: path.join(OUT, "15-teach-header-375.png") });

  // Refine at 375
  try {
    await openWorkspace(pP, "375");
    await pP.locator('[role="dialog"]').first().getByRole("tab", { name: "Refine" }).click();
    await pP.waitForTimeout(1200);
    const refine375 = await pP.evaluate(() => {
      const table = document.querySelector('[role="dialog"] table');
      const wrap = table?.parentElement;
      const targets = [...document.querySelectorAll('[role="dialog"] tbody input, [role="dialog"] tbody select, [role="dialog"] tbody button, [role="dialog"] thead button')];
      return {
        rows: document.querySelectorAll('[role="dialog"] tbody tr').length,
        wrapScroll: wrap ? { sw: wrap.scrollWidth, cw: wrap.clientWidth, overflowX: getComputedStyle(wrap).overflowX } : null,
        docSw: document.documentElement.scrollWidth,
        docCw: document.documentElement.clientWidth,
        under44: targets.map((t) => { const r = t.getBoundingClientRect(); return { label: t.getAttribute("aria-label") || t.tagName, h: Math.round(r.height) }; }).filter((t) => t.h > 0 && t.h < 44),
        totalTargets: targets.length,
      };
    });
    result.refine375 = refine375;
    check("375: Refine renders rows", refine375.rows > 0, `${refine375.rows} rows`);
    check("375: no document-level horizontal scroll on Refine", refine375.docSw <= refine375.docCw + 1,
      `doc scrollWidth=${refine375.docSw} clientWidth=${refine375.docCw}; internal table scroll ${JSON.stringify(refine375.wrapScroll)}`);
    check("375: every Refine control meets the 44px touch floor", refine375.under44.length === 0,
      `${refine375.under44.length}/${refine375.totalTargets} under 44px${refine375.under44.length ? ": " + refine375.under44.slice(0, 8).map((t) => `${t.label}=${t.h}px`).join(", ") : ""}`);
    await pP.screenshot({ path: path.join(OUT, "16-refine-375.png") });
  } catch (e) {
    info("375 Refine stage could not run", String(e).slice(0, 200));
  }
} catch (e) {
  check("probe ran to completion", false, String(e).slice(0, 400));
} finally {
  // ── Console + network summary ─────────────────────────────────────────────
  const errs = consoleMsgs.filter((m) => m.type === "error" || m.type === "pageerror");
  const warns = consoleMsgs.filter((m) => m.type === "warning");
  info("console errors", `${errs.length}`);
  errs.slice(0, 25).forEach((e, i) => info(`  console error #${i + 1} [${e.tag ?? e.type}]`, e.text));
  info("console warnings", `${warns.length}`);
  warns.slice(0, 25).forEach((w, i) => info(`  console warning #${i + 1} [${w.tag}]`, w.text));
  info("/rest/v1/ requests observed", `${restCalls.length} — ${restCalls.slice(0, 6).join(" ; ") || "(none)"}`);

  const dirtyEnd = execFileSync("git", ["diff", "HEAD", "--name-only", "--", "components", "lib", "app"]).toString().trim();
  info("tree at END", dirtyEnd ? `DIRTY (${dirtyEnd.split("\n").length} files): ${dirtyEnd}` : `clean — still equals ${sha}`);

  await writeFile(path.join(OUT, "results.json"), JSON.stringify({ sha, rows, result, consoleMsgs, restCalls }, null, 2));
  await browser.close();
  const fails = rows.filter((r) => r.kind === "FAIL");
  console.log(`\n=== ${rows.filter((r) => r.kind === "PASS").length} PASS / ${fails.length} FAIL ===`);
  fails.forEach((f) => console.log(`FAIL  ${f.label} — ${f.detail}`));
}

// The header reader, as a source string, so the tablet/phone pages can run the
// identical measurement without duplicating it.
function readHeaderSrc() {
  return function () {
    const head = document.querySelector("header");
    if (!head) return null;
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const nameEl = [...head.querySelectorAll("span")].find((s) => /boardName/.test(s.className));
    const objEl = [...head.querySelectorAll("span")].find((s) => /objective/.test(s.className));
    const stdWrap = [...head.querySelectorAll("span")].find((s) => /identityStandards/.test(s.className));
    const subjEl = [...head.querySelectorAll("span")].find((s) => /subjectTag/.test(s.className));
    const tools = [...head.querySelectorAll("button")].map((b) => {
      const r = b.getBoundingClientRect();
      return { label: b.getAttribute("aria-label") || b.textContent.trim().slice(0, 20), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 };
    });
    const hr = head.getBoundingClientRect();
    const tops = new Set(
      [...head.querySelectorAll("span,button,div")]
        .filter((el) => el.getBoundingClientRect().height > 0 && el.children.length === 0)
        .map((el) => Math.round(el.getBoundingClientRect().top / 6) * 6),
    );
    return {
      headerH: Math.round(hr.height),
      title: nameEl ? nameEl.textContent.trim() : null,
      titleVisible: nameEl ? cs(nameEl).display !== "none" && nameEl.getBoundingClientRect().width > 0 : false,
      objective: objEl ? objEl.textContent.trim() : null,
      objectiveDisplay: objEl ? cs(objEl).display : null,
      objectiveVisible: objEl ? cs(objEl).display !== "none" && objEl.getBoundingClientRect().width > 0 : false,
      standardsPills: stdWrap ? stdWrap.children.length : 0,
      standardsDisplay: stdWrap ? cs(stdWrap).display : "(no wrapper)",
      standardsVisible: stdWrap ? cs(stdWrap).display !== "none" && stdWrap.getBoundingClientRect().width > 0 : false,
      subjectTagDisplay: subjEl ? cs(subjEl).display : "(none)",
      tools,
      toolsOffscreen: tools.filter((t) => t.visible && (t.right > window.innerWidth + 1 || t.left < -1)).map((t) => t.label),
      rowBands: tops.size,
      vw: window.innerWidth,
      docSw: document.documentElement.scrollWidth,
      docCw: document.documentElement.clientWidth,
    };
  };
}
