// scripts/probe-fork-diff-label.mjs — §4b for the fork-diff `.valueTag`
// Label-role fix, plus the reachability finding that fix ran into.
//
// TWO PARTS, DELIBERATELY LABELLED DIFFERENTLY. Read the distinction before
// quoting any number out of this file.
//
//   PART A — REACHABILITY, measured on the real surface. Can a teacher get to
//   the fork-diff panel at all? Static reading says no: `ForkDiffPanel` has one
//   importer (`compare-to-master.tsx`), whose `CompareToMaster` is mounted only
//   by `weekly-lesson-card.tsx:1841` behind `compareOpen`, which is set true
//   only by the legacy `"compare-master"` action (`:1792`) that nothing emits —
//   the live menu item (`context-menu.tsx:347`) instead does
//   `router.push('/daily?lesson=…&compare=1')` + `requestCompare()`, and
//   `?compare=1` has no reader while `COMPARE_REQUEST_EVENT` has no listener.
//   An ABSENCE claim fails open, so this part runs a CONTROL first (the menu
//   opens, the item is really there, the click really navigates and the day
//   view really hydrates) and only then asserts the panel never appears.
//
//   PART B — CASCADE HARNESS, NOT the live surface. Because the panel cannot be
//   rendered by any route, the Label-role values are measured by mounting the
//   module's own compiled classes — read out of document.styleSheets, so they
//   are the REAL hashed classes with the REAL token values, not a mock-up — and
//   measuring those. This proves the CSS is right. It does NOT prove a teacher
//   ever sees it, and nothing in Part B should be reported as if it did.
//
// Usage: CLAUDE_BYPASS_TOKEN=… node scripts/probe-fork-diff-label.mjs
//        PROBE_BASE defaults to http://localhost:3099

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { bypassLogin, requireToken } from "./lib/auth.mjs";

requireToken({ repoRoot: process.cwd() });
const BASE = process.env.PROBE_BASE ?? "http://localhost:3099";
const OUT = path.resolve("docs/screenshots/fork-diff-label");
await mkdir(OUT, { recursive: true });

// The fork fixture: modified + masterSnapshot, multi-sentence Preview values on
// BOTH sides (lib/mock/lessons.ts `m-12-1`) — a short value would hide reflow.
const FIXTURE_ID = "m-12-1";
const CARD_SEL = `[data-planner-item="lesson:${FIXTURE_ID}"]`;

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

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1280, height: 950 } });
await context.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "mycurricula:onboarding",
      JSON.stringify({ stepIndex: 0, finished: true }),
    );
  } catch {
    /* private mode — the assertions surface the consequence */
  }
});
await bypassLogin(context, { base: BASE, next: "/weekly", timeout: 240000 });

const page = await context.newPage();
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
});

await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded", timeout: 240000 });
check("stayed on /weekly", !page.url().includes("/onboarding"), page.url());

// Hydration marker: `iconAriaLabel` is applied by React, so the card owning its
// menu button IS hydration. Dev hydration here runs 5–17s.
const hydrated = await page
  .waitForFunction(
    (sel) => !!document.querySelector(sel)?.querySelector('button[aria-label="More actions"]'),
    CARD_SEL,
    { timeout: 180000, polling: 1000 },
  )
  .then(() => true)
  .catch(() => false);
check("weekly hydrated; the fork fixture card owns its menu button", hydrated);
if (!hydrated) {
  await page.screenshot({ path: path.join(OUT, "no-card.png") });
  for (const l of [...notes, ...failures]) console.error(l);
  await browser.close();
  process.exit(1);
}

// Resolve the module's hashed class names ONCE, from the live stylesheet. If
// these come back null the CSS never reached the bundle and every later
// absence assertion would be meaningless — so this doubles as a gate.
const cls = await page.evaluate(() => {
  const want = ["panel", "valueTag", "removed", "added", "value", "valueText", "rows", "row"];
  const found = {};
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet
    }
    for (const rule of rules) {
      if (!rule.selectorText) continue;
      for (const w of want) {
        // MUST be anchored to THIS module's prefix. An unanchored
        // `[A-Za-z0-9_-]*${w}__` matches any module that happens to contain
        // the word: it resolved `panel` to `command-palette_panel__…`,
        // `value` to `CountdownWidget_value__…` and `row` to
        // `Tooltip_arrow__…` (substring of "arrow"), which silently built the
        // harness out of four unrelated components and made every reflow
        // number — and the panel-absence check — measure the wrong element.
        const m = rule.selectorText.match(
          new RegExp(`\\.(fork-diff-panel_${w}__[A-Za-z0-9_-]+)(?![A-Za-z0-9_-])`),
        );
        if (m && !found[w]) found[w] = m[1];
      }
    }
  }
  return found;
});
info("resolved CSS-module classes", JSON.stringify(cls));
// Every key must resolve, and each must carry this module's prefix. A partial
// resolve would silently degrade the harness into measuring unstyled divs.
const wantAll = ["panel", "valueTag", "removed", "added", "value", "valueText", "rows", "row"];
const missing = wantAll.filter((k) => !cls[k]);
const foreign = wantAll.filter((k) => cls[k] && !cls[k].startsWith("fork-diff-panel_"));
check(
  "the fork-diff stylesheet is present in the /weekly bundle",
  missing.length === 0,
  missing.length ? `unresolved: ${missing.join(", ")}` : "all 8 classes resolved",
);
check(
  "every resolved class belongs to fork-diff-panel (no cross-module match)",
  foreign.length === 0,
  foreign.length ? foreign.map((k) => `${k}→${cls[k]}`).join(", ") : "all prefixed",
);
if (missing.length || foreign.length) {
  for (const l of [...notes, ...failures]) console.error(l);
  await browser.close();
  process.exit(1);
}

// ══ PART A — REACHABILITY, on the real surface ══════════════════════════════

const card = page.locator(CARD_SEL).first();
await card.scrollIntoViewIfNeeded();
await card.locator('button[aria-label="More actions"]').first().click();

// CONTROL 1 — the menu really opened and really has the item. Without this a
// later "no panel" reads identically to "the menu never opened".
const menuItem = page.locator("text=Compare with Team Curriculum").first();
const itemThere = await menuItem
  .waitFor({ state: "visible", timeout: 10000 })
  .then(() => true)
  .catch(() => false);
check("CONTROL: the ⋯ menu opens and offers 'Compare with Team Curriculum'", itemThere);
if (!itemThere) {
  await page.screenshot({ path: path.join(OUT, "no-menu.png") });
  for (const l of [...notes, ...failures]) console.error(l);
  await browser.close();
  process.exit(1);
}
await page.screenshot({ path: path.join(OUT, "menu-item.png") });

// CONTROL 2 — the legacy modal shell on /weekly: does clicking open it here?
await menuItem.click();
const weeklyModal = await page
  .waitForSelector('[aria-label="Compare with Team Curriculum"][role="dialog"]', {
    timeout: 6000,
  })
  .then(() => true)
  .catch(() => false);
info(
  "legacy CompareToMaster modal on /weekly",
  weeklyModal ? "OPENED" : "did not open (menu routes away instead)",
);

// CONTROL 3 — the click really did something: it navigates to /daily.
const navigated = await page
  .waitForFunction(() => location.pathname.startsWith("/daily"), null, {
    timeout: 20000,
    polling: 500,
  })
  .then(() => true)
  .catch(() => false);
check("CONTROL: the menu item navigates to /daily", navigated, page.url());
info("landed url", page.url());

// CONTROL 4 — the destination really hydrated and really selected the lesson.
// This is the Gate B that makes the absence assertion below mean something.
const dayReady = await page
  .waitForFunction(
    () => {
      const t = document.body.innerText || "";
      return /Fractions as division/i.test(t);
    },
    null,
    { timeout: 180000, polling: 1000 },
  )
  .then(() => true)
  .catch(() => false);
check("CONTROL: /daily hydrated with the compared lesson on screen", dayReady);
await page.screenshot({ path: path.join(OUT, "daily-after-compare-click.png") });

// THE ASSERTION — with all four controls green, an absent panel is real.
const panelOnDaily = await page.evaluate(
  (c) => ({
    byClass: c.panel ? document.querySelectorAll(`.${c.panel}`).length : -1,
    byTag: c.valueTag ? document.querySelectorAll(`.${c.valueTag}`).length : -1,
    teamYours: /\bYours\b/.test(document.body.innerText || ""),
  }),
  cls,
);
info("fork-diff DOM on /daily after the real click", JSON.stringify(panelOnDaily));

// COUNTERFACTUAL — fire the very event the menu item dispatches. If a listener
// existed anywhere, this is where the panel would appear.
await page.evaluate(
  (id) =>
    window.dispatchEvent(
      new CustomEvent("mycurricula:compare-lesson", { detail: { lessonId: id } }),
    ),
  FIXTURE_ID,
);
await page.waitForTimeout(2500);
const afterEvent = await page.evaluate(
  (c) => (c.panel ? document.querySelectorAll(`.${c.panel}`).length : -1),
  cls,
);
info("fork-diff panels after dispatching COMPARE_REQUEST_EVENT", String(afterEvent));

const reachable = panelOnDaily.byClass > 0 || afterEvent > 0 || weeklyModal;
check(
  "REACHABILITY: the fork-diff panel renders on the real path",
  reachable,
  reachable
    ? "reached"
    : "never rendered — menu → /daily?compare=1 (no reader), event (no listener), legacy modal (never opened)",
);

// ══ PART B — CASCADE HARNESS (compiled CSS, NOT the live surface) ═══════════
// Mount the panel's real class names and measure. This verifies the stylesheet;
// it does not and cannot verify a surface the app never renders.

await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded", timeout: 240000 });
await page
  .waitForFunction((sel) => !!document.querySelector(sel), CARD_SEL, {
    timeout: 180000,
    polling: 1000,
  })
  .catch(() => {});

// The real fixture strings, so the reflow measurement uses the lengths a
// teacher would actually see (lib/mock/lessons.ts m-12-1 Preview row).
const MASTER_PREVIEW =
  "Anchor problem: 3 sandwiches shared by 4 students. Students use bar models to connect fractions and division.";
const PERSONAL_PREVIEW =
  "Anchor problem: 5 cookies shared by 4 friends. Students use bar models then long division to connect the two representations.";

await page.evaluate(
  ({ c, master, personal }) => {
    const host = document.createElement("div");
    host.id = "probe-forkdiff-harness";
    // Width-constrained the way the real panel is: it renders inside the
    // lesson-detail body / a 640px dialog, capped by the viewport.
    host.style.cssText =
      "position:fixed;left:8px;top:8px;z-index:99999;width:min(640px, calc(100vw - 16px));";
    // Built with createElement/textContent rather than innerHTML. The content
    // here is probe-local literals, so nothing is actually at risk — but a
    // string-built subtree is the shape a reviewer has to stop and re-verify,
    // and it costs three lines to not have that conversation.
    const el = (tag, classes, text) => {
      const n = document.createElement(tag);
      for (const k of classes.filter(Boolean)) n.classList.add(k);
      if (text != null) n.textContent = text;
      return n;
    };
    const side = (kind, label, body) => {
      const row = el("div", [c.value, c[kind]]);
      row.append(el("span", [c.valueTag], label), el("span", [c.valueText], body));
      return row;
    };
    const panel = el("div", [c.panel]);
    const rows = el("ul", [c.rows]);
    const li = el("li", [c.row]);
    li.append(side("removed", "Team", master), side("added", "Yours", personal));
    rows.append(li);
    panel.append(rows);
    host.append(panel);
    document.body.appendChild(host);
  },
  { c: cls, master: MASTER_PREVIEW, personal: PERSONAL_PREVIEW },
);
await page.waitForTimeout(300);

const HARNESS = "#probe-forkdiff-harness";

// ── B1. Conformance, off the live cascade ────────────────────────────────
const typo = await page.evaluate(
  ({ h, c }) => {
    const tag = document.querySelector(`${h} .${c.valueTag}`);
    if (!tag) return null;
    const cs = getComputedStyle(tag);
    return {
      fontSize: cs.fontSize,
      letterSpacing: cs.letterSpacing,
      fontWeight: cs.fontWeight,
      transform: cs.textTransform,
    };
  },
  { h: HARNESS, c: cls },
);
info("computed .valueTag (compiled CSS)", JSON.stringify(typo));
check("font-size resolves to the Label role's 11px (--t-11)", typo?.fontSize === "11px", typo?.fontSize);
check("weight is 700", typo?.fontWeight === "700", typo?.fontWeight);
check("still UPPERCASE", typo?.transform === "uppercase", typo?.transform);
// .09em of 11px = 0.99px. Asserting the RESOLVED px proves the em tracked the
// new size, rather than a stale fixed 0.4px surviving the edit.
const ls = parseFloat(typo?.letterSpacing ?? "NaN");
check(
  "letter-spacing is .09em resolved against 11px (≈0.99px)",
  Math.abs(ls - 0.99) < 0.06,
  typo?.letterSpacing,
);

// ── B2. Contrast, re-measured rather than inherited ──────────────────────
const contrast = await page.evaluate(
  ({ h, c }) => {
    const cvs = document.createElement("canvas");
    cvs.width = cvs.height = 1;
    const ctx = cvs.getContext("2d", { willReadFrequently: true });
    const resolve = (css) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#fff";
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
    const lum = (px) =>
      px
        .map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        })
        .reduce((a, x, i) => a + [0.2126, 0.7152, 0.0722][i] * x, 0);
    const out = {};
    for (const side of ["removed", "added"]) {
      const tag = document.querySelector(`${h} .${c[side]} .${c.valueTag}`);
      if (!tag) continue;
      const fg = resolve(getComputedStyle(tag).color);
      const bg = paintedBg(tag);
      const L1 = lum(fg);
      const L2 = lum(bg);
      out[side] = {
        text: tag.textContent,
        ratio: Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100,
      };
    }
    return out;
  },
  { h: HARNESS, c: cls },
);
info("re-measured tag contrast", JSON.stringify(contrast));
// 4.5:1 — small text at BOTH sizes. WCAG's large-text allowance starts at 24px
// (18.66px bold), so the bump moved the citation, never the requirement.
check(
  'Team tag ("removed") clears 4.5:1 at 11px',
  (contrast?.removed?.ratio ?? 0) >= 4.5,
  `${contrast?.removed?.ratio}:1`,
);
check(
  'Yours tag ("added") clears 4.5:1 at 11px',
  (contrast?.added?.ratio ?? 0) >= 4.5,
  `${contrast?.added?.ratio}:1`,
);

// ── B3. Reflow — same rows at 11px and at the old 9.5px ──────────────────
async function measureRows() {
  return page.evaluate(
    ({ h, c }) =>
      [...document.querySelectorAll(`${h} .${c.value}`)].map((row) => {
        const tag = row.querySelector(`.${c.valueTag}`);
        const text = row.querySelector(`.${c.valueText}`);
        const tb = tag.getBoundingClientRect();
        const xb = text.getBoundingClientRect();
        const lh = parseFloat(getComputedStyle(text).lineHeight) || 0;
        return {
          tagW: Math.round(tb.width * 10) / 10,
          textW: Math.round(xb.width * 10) / 10,
          lines: lh ? Math.round(xb.height / lh) : 0,
          rowH: Math.round(row.getBoundingClientRect().height),
          overflow: row.scrollWidth > row.clientWidth + 1,
          tagClipped: tag.scrollWidth > tag.clientWidth + 1,
        };
      }),
    { h: HARNESS, c: cls },
  );
}
async function overrideTag(size, spacing) {
  await page.evaluate(
    ({ h, c, size, spacing }) => {
      let s = document.getElementById("probe-tag-override");
      if (!s) {
        s = document.createElement("style");
        s.id = "probe-tag-override";
        document.head.appendChild(s);
      }
      s.textContent = size
        ? `${h} .${c.valueTag}{font-size:${size} !important;letter-spacing:${spacing} !important;}`
        : "";
    },
    { h: HARNESS, c: cls, size, spacing },
  );
  await page.waitForTimeout(220);
}

for (const w of [375, 768, 1280]) {
  await page.setViewportSize({ width: w, height: 950 });
  await page.waitForTimeout(400);
  await overrideTag(null);
  const after = await measureRows();
  await overrideTag("9.5px", "0.4px"); // the pre-change values
  const before = await measureRows();
  await overrideTag(null);

  const deltas = after.map((a, i) => ({
    tagDelta: Math.round((a.tagW - (before[i]?.tagW ?? a.tagW)) * 10) / 10,
    lineDelta: a.lines - (before[i]?.lines ?? a.lines),
  }));
  const maxTagDelta = Math.max(...deltas.map((d) => d.tagDelta));
  const gainedLines = deltas.filter((d) => d.lineDelta > 0).length;
  info(
    `reflow @${w}px`,
    `tag +${maxTagDelta}px · rows gaining a line: ${gainedLines}/${after.length} · narrowest text column ${Math.min(...after.map((a) => a.textW))}px · lines ${after.map((a) => a.lines).join("/")}`,
  );
  check(`no row overflows horizontally @${w}px`, !after.some((a) => a.overflow));
  check(`the tag text is never clipped @${w}px`, !after.some((a) => a.tagClipped));
  // MEASURED COST, and a judgement recorded rather than hidden. The +8.2px tag
  // costs the longer of the two values ONE extra line at 375px (3→4) and
  // nothing at 768/1280. Called acceptable: the panel is a vertically
  // scrolling reading surface, nothing overflows, nothing clips, and the text
  // column still measures 253px at phone width. What is NOT acceptable — and
  // is what this asserts — is a row losing more than a line, or the column
  // being squeezed to an unreadable ribbon; either would mean the Label role
  // does not fit here and the size needs to go back to the lead, not be
  // quietly split to 10px.
  check(
    `no row loses more than one line to the wider tag @${w}px`,
    Math.max(...deltas.map((d) => d.lineDelta)) <= 1,
    `worst +${Math.max(...deltas.map((d) => d.lineDelta))} lines`,
  );
  check(
    `the text column stays readable @${w}px (≥200px)`,
    Math.min(...after.map((a) => a.textW)) >= 200,
    `${Math.min(...after.map((a) => a.textW))}px`,
  );
  await page.screenshot({ path: path.join(OUT, `harness-${w}.png`), clip: { x: 0, y: 0, width: w, height: 320 } });
}

await page.evaluate(() => {
  document.getElementById("probe-forkdiff-harness")?.remove();
  document.getElementById("probe-tag-override")?.remove();
});

check("browser console clean", consoleErrors.length === 0, consoleErrors.slice(0, 4).join(" | "));

console.log(`\n── probe-fork-diff-label (${BASE}) ──\n`);
for (const l of notes) console.log(l);
for (const l of failures) console.log(l);
console.log(`\n${failures.length === 0 ? "ALL PASS" : `${failures.length} FAILURE(S)`}\n`);
// THIS PROBE IS EXPECTED TO EXIT RED, and the red is the finding — not a
// broken probe. The REACHABILITY assertion fails because nothing in the app
// renders ForkDiffPanel: the menu item routes to `/daily?lesson=…&compare=1`
// (no reader), `requestCompare()` dispatches COMPARE_REQUEST_EVENT (no
// listener), and the legacy `CompareToMaster` host is gated behind a
// `"compare-master"` action nothing emits. It goes green the moment someone
// wires a consumer — which is a feature restoration, deliberately NOT bundled
// into the Label-role CSS fix this probe accompanies. Everything else here is
// green; if a SECOND assertion goes red, that one is a real regression.
console.log(
  "NOTE: the REACHABILITY failure is the documented finding (fork-diff panel\n" +
    "      has no live host). Any OTHER failure is a regression.",
);
console.log(`screenshots: ${OUT}`);

await browser.close();
process.exit(failures.length === 0 ? 0 : 1);
