// scripts/probe-f2-forkdiff.mjs — §4b live pass for F2: the fork diff is
// REACHABLE again on the v2 build.
//
// WHAT IT PROVES, AND WHY EACH ASSERTION IS SHAPED THIS WAY
//
// The bug was an absence: <ForkDiffPanel> had no host under NEXT_PUBLIC_V2, so
// both documented entry points opened nothing. An absence assertion is worth
// nothing without a control (a dead page is also an absence), so this probe
// asserts PRESENCE — the panel must appear — and every negative case is paired
// with a positive one on the same run, against the same fixtures, in the same
// browser. If the positive case fails, the negatives are reported INCONCLUSIVE
// rather than PASS.
//
// GATED ON A CLIENT-ONLY SIGNAL, NEVER A TIMER. Dev hydration here runs 5–30s.
// Every wait is `waitFor({state:"visible"})` on something only a hydrated React
// tree can produce (the open ⋯ menu; the panel's own <section aria-label>).
//
// FIXTURE. lib/mock/lessons.ts `r-12-1` — "Book club — Via's chapters", week 12
// day 1, modified:true + moved:"same-week", with a masterSnapshot. It is the
// only shape canCompareWithTeam() accepts, and `masterSnapshot` exists ONLY in
// the mock source — so this probe is meaningful only with
// NEXT_PUBLIC_PLANNER_USE_SUPABASE off (the local default). S0 asserts the
// fixture is actually on screen rather than assuming it.
//
// TWO THINGS LIVE RECON HAD TO TEACH THIS PROBE, both worth knowing before
// reading a result from it:
//
//   • THE DEFAULT WEEK IS NOT WEEK 12. The mock generates a "year-current"
//     coverage week (`*-yc-*` ids) around today, and none of those lessons
//     carry a masterSnapshot. `/weekly?week=12` (parseWeeklyParams) is what
//     puts a qualifying fixture on screen; without it the ⋯ item is correctly
//     hidden and the probe would blame the wrong thing.
//
//   • THE ⋯ MENU IS FRAME-DEPENDENT, and this is NOT something F2 changed.
//     WeeklyShell.tsx:718-738 picks the Week canvas off `data-frame`: paper →
//     <WeekColumns> (which renders <WeeklyLessonCard> and therefore the real
//     <LessonContextMenu>), glass → <WeekA>, color → <WeekC>. WeekA/WeekC
//     carry `lesson-kebab-menu` instead — four routing destinations, no
//     forking items — so "Compare with Team Curriculum" does not exist on the
//     DEFAULT (glass) frame at all. That is a pre-existing gap in the v2 week
//     canvases, reported separately; this probe drives the paper frame so the
//     menu entry point is actually exercisable.
//
// The frame is set through the SSR cookie + localStorage, never through the
// Settings UI, so no preference write is attempted in the first place.
//
// APPEARANCE IS READ, NEVER WRITTEN. .env.local points at PRODUCTION Supabase
// and the theme-sync layer WRITES teacher_preferences back, so a probe that
// touched an axis would upsert onto the shared bypass account. This probe
// changes no axis, and blocks non-GET calls to that table as a belt.
//
// Usage: node scripts/probe-f2-forkdiff.mjs   (PROBE_BASE defaults to :3014)

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { bypassLogin, requireToken } from "./lib/auth.mjs";

requireToken({ repoRoot: process.cwd() });
const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const OUT = path.resolve("docs/screenshots/f2-forkdiff");
await mkdir(OUT, { recursive: true });

const LESSON = "r-12-1";
const PANEL = 'section[aria-label="Compare with Team Curriculum"]';
const DIALOG = '[role="dialog"][aria-label="Compare with Team Curriculum"]';

const results = [];
function record(scenario, verdict, detail) {
  results.push({ scenario, verdict, detail });
  console.log(`${verdict.padEnd(12)} ${scenario}\n             ${detail}`);
}

/** One atomic read — panel, dialog shell, tone/frame, and the document's own
 *  horizontal overflow, so they can never come from different moments. */
async function observe(page) {
  return page.evaluate(
    ([panelSel, dialogSel]) => {
      const panel = document.querySelector(panelSel);
      const dialog = document.querySelector(dialogSel);
      const root = document.documentElement;
      return {
        panel: panel != null,
        dialog: dialog != null,
        // The diff must have real rows, not just a shell: an empty panel and a
        // missing panel are different bugs.
        rows: panel ? panel.querySelectorAll("li").length : 0,
        heading: panel
          ? (panel.querySelector("h3")?.textContent ?? "").trim()
          : null,
        radius: dialog ? getComputedStyle(dialog).borderRadius : null,
        tone: root.getAttribute("data-tone"),
        frame: root.getAttribute("data-frame"),
        theme: root.getAttribute("data-theme"),
        // CLAUDE.md §4: the DOCUMENT must never scroll sideways. The app shell
        // scrolls #main-content, so measure both.
        docOverflow: root.scrollWidth - root.clientWidth,
        mainOverflow: (() => {
          const m = document.getElementById("main-content");
          return m ? m.scrollWidth - m.clientWidth : null;
        })(),
        // Does the dialog card itself fit the viewport?
        dialogRight: dialog
          ? Math.round(dialog.getBoundingClientRect().right)
          : null,
        vw: window.innerWidth,
      };
    },
    [PANEL, DIALOG],
  );
}

/** Open the card ⋯ menu by RESPONSE (retry until the menu item is visible),
 *  never by sleeping. Returns the locator once open, or null. */
async function openCardMenu(page, lessonId) {
  const card = page.locator(`[data-planner-item="lesson:${lessonId}"]`).first();
  await card.waitFor({ state: "attached", timeout: 180000 }).catch(() => {});
  if ((await card.count()) === 0) return null;
  await card.scrollIntoViewIfNeeded().catch(() => {});
  const item = page
    .locator('[role="menu"]')
    .getByText("Compare with Team Curriculum", { exact: true })
    .first();
  for (let i = 0; i < 25; i++) {
    await card
      .locator('button[aria-label="More actions"]')
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    const open = await item
      .waitFor({ state: "visible", timeout: 2500 })
      .then(() => true)
      .catch(() => false);
    if (open) return item;
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(1000);
  }
  return null;
}

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
});
await context.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "mycurricula:onboarding",
      JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
    );
    // Paper frame → <WeekColumns> → <WeeklyLessonCard> → the real
    // <LessonContextMenu>. Written to storage (and the SSR cookie below)
    // rather than clicked in Settings, so nothing tries to persist an axis to
    // the shared prod account. See the header note.
    window.localStorage.setItem("mycurricula:user:theme-frame", "paper");
  } catch {
    /* storage disabled — the /onboarding gate below surfaces the consequence */
  }
});
// The no-flash SSR hint (lib/theme-values.ts encodeThemeAxesCookie):
// v1.<frame>.<glass>.<bg>.<theme>.<dim>.<style>.<palette>
await context.addCookies([
  {
    name: "mc-theme-axes",
    value: "v1.paper.dark.photo.clear.normal.calm.normal",
    url: BASE,
  },
]);
// Auth FIRST, then create the page we route. Routing a context before
// bypassLogin would put the token URL through our own handler (scripts/lib/
// auth.mjs names this exact edge).
await bypassLogin(context, {
  base: BASE,
  next: "/weekly",
  timeout: 240000,
  retries: 3,
});

const page = await context.newPage();
// Read-only on the shared prod account: never let this run mutate appearance.
const blockedWrites = [];
await page.route("**/rest/v1/teacher_preferences**", async (route) => {
  if (route.request().method() === "GET") return route.continue();
  blockedWrites.push(route.request().method());
  return route.fulfill({ status: 204, body: "" });
});

const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
});

// ══ S0 — preconditions ══════════════════════════════════════════════════════
await page.goto(`${BASE}/weekly?week=12`, {
  waitUntil: "domcontentloaded",
  timeout: 240000,
});
if (page.url().includes("/onboarding")) {
  record("S0 onboarding gate", "BLOCKED", `parked on ${page.url()}`);
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
  process.exit(1);
}

const before = await observe(page);
record(
  "S0 shell live, no panel yet",
  before.panel ? "FAIL" : "PASS",
  `frame=${before.frame} tone=${before.tone} theme=${before.theme}; panel=${before.panel}`,
);

// ══ S1 — ENTRY POINT 1: the card ⋯ menu, at 1440 ════════════════════════════
const item = await openCardMenu(page, LESSON);
if (!item) {
  record(
    "S1 menu opens on the qualifying fixture",
    "INCONCLUSIVE",
    `${LESSON} not reachable on /weekly — is NEXT_PUBLIC_PLANNER_USE_SUPABASE on, or the week not 12?`,
  );
  await page.screenshot({ path: path.join(OUT, "s1-no-menu-1440.png") });
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
  process.exit(1);
}
record(
  "S1a ⋯ menu offers 'Compare with Team Curriculum'",
  "PASS",
  `canCompareWithTeam gate satisfied live for ${LESSON}`,
);

await item.click({ timeout: 8000 });
const s1Visible = await page
  .locator(PANEL)
  .waitFor({ state: "visible", timeout: 60000 })
  .then(() => true)
  .catch(() => false);
const s1 = await observe(page);
record(
  "S1b menu → the fork diff OPENS (the F2 regression)",
  s1Visible && s1.rows > 0 ? "PASS" : "FAIL",
  `panel=${s1.panel} rows=${s1.rows} heading="${s1.heading}" radius=${s1.radius} tone=${s1.tone}`,
);
await page.mouse.move(8, 940);
await page.screenshot({
  path: path.join(OUT, "s1-menu-entry-1440.png"),
  fullPage: false,
});
record(
  "S1c no document h-scroll with the dialog open @1440",
  s1.docOverflow <= 0 && s1.dialogRight <= s1.vw ? "PASS" : "FAIL",
  `doc=${s1.docOverflow}px main=${s1.mainOverflow}px dialogRight=${s1.dialogRight} vw=${s1.vw}`,
);

// Escape must close it and the focus trap must not swallow the key.
await page.keyboard.press("Escape");
const s1closed = await page
  .locator(PANEL)
  .waitFor({ state: "detached", timeout: 15000 })
  .then(() => true)
  .catch(() => false);
record(
  "S1d Escape closes the dialog",
  s1closed ? "PASS" : "FAIL",
  s1closed ? "panel detached" : "panel still attached after Escape",
);

// ══ S2 — ENTRY POINT 2: the documented deep link, at 1440 ═══════════════════
await page.goto(`${BASE}/daily?lesson=${LESSON}&compare=1`, {
  waitUntil: "domcontentloaded",
  timeout: 240000,
});
const s2Visible = await page
  .locator(PANEL)
  .waitFor({ state: "visible", timeout: 90000 })
  .then(() => true)
  .catch(() => false);
const s2 = await observe(page);
record(
  "S2a /daily?lesson=…&compare=1 OPENS the diff",
  s2Visible && s2.rows > 0 ? "PASS" : "FAIL",
  `panel=${s2.panel} rows=${s2.rows} heading="${s2.heading}" url=${page.url()}`,
);
await page.mouse.move(8, 940);
await page.screenshot({ path: path.join(OUT, "s2-deeplink-1440.png") });

// S2b — THE RACE THAT MADE THIS BUG SUBTLE, measured rather than reasoned.
// DailyView.tsx:356 `router.replace("/daily")` deletes the whole query once its
// lesson seed commits. The host reads the URL in its MOUNT effect, so it must
// have banked the request BEFORE that — and the panel must still be open after.
// Wait for the strip to actually land, then re-observe: asserting while the
// query is still there would prove nothing.
let stripped = false;
for (let i = 0; i < 60 && !stripped; i++) {
  stripped = !page.url().includes("compare=1");
  if (!stripped) await page.waitForTimeout(500);
}
const s2b = await observe(page);
record(
  "S2b the panel SURVIVES DailyView stripping the query",
  !stripped ? "INCONCLUSIVE" : s2b.panel && s2b.rows > 0 ? "PASS" : "FAIL",
  `stripped=${stripped} url=${page.url()} panel=${s2b.panel} rows=${s2b.rows}`,
);

// ══ S3 — the negative control: a NON-forked lesson must NOT open ════════════
await page.goto(`${BASE}/daily?lesson=m-12-0&compare=1`, {
  waitUntil: "domcontentloaded",
  timeout: 240000,
});
// Pair the absence with a live control: the day surface must have hydrated.
const hydrated = await page
  .locator("#main-content")
  .waitFor({ state: "visible", timeout: 90000 })
  .then(() => true)
  .catch(() => false);
await page.waitForTimeout(4000); // after the control, give the panel a chance
const s3 = await observe(page);
record(
  "S3 an unedited lesson refuses the deep link",
  !hydrated ? "INCONCLUSIVE" : s3.panel ? "FAIL" : "PASS",
  `hydrated=${hydrated} panel=${s3.panel} — canCompareWithTeam must reject m-12-0`,
);

// ══ S4 — phone, 375: both entry points ══════════════════════════════════════
await page.setViewportSize({ width: 375, height: 812 });
await page.goto(`${BASE}/daily?lesson=${LESSON}&compare=1`, {
  waitUntil: "domcontentloaded",
  timeout: 240000,
});
const s4Visible = await page
  .locator(PANEL)
  .waitFor({ state: "visible", timeout: 90000 })
  .then(() => true)
  .catch(() => false);
const s4 = await observe(page);
record(
  "S4a deep link opens the diff @375",
  s4Visible && s4.rows > 0 ? "PASS" : "FAIL",
  `panel=${s4.panel} rows=${s4.rows} dialogRight=${s4.dialogRight} vw=${s4.vw}`,
);
await page.mouse.move(8, 800);
await page.screenshot({ path: path.join(OUT, "s4-deeplink-375.png") });
record(
  "S4b no document h-scroll @375, dialog inside the viewport",
  s4.docOverflow <= 0 && s4.dialogRight != null && s4.dialogRight <= s4.vw
    ? "PASS"
    : "FAIL",
  `doc=${s4.docOverflow}px dialogRight=${s4.dialogRight} vw=${s4.vw}`,
);

// ══ S5 — phone, the menu entry ══════════════════════════════════════════════
await page.goto(`${BASE}/weekly?week=12`, {
  waitUntil: "domcontentloaded",
  timeout: 240000,
});
const item375 = await openCardMenu(page, LESSON);
if (!item375) {
  // Name WHY, so this never reads as "the fix doesn't work on phones".
  // WeeklyShell.tsx:689 `showList = isPhoneViewport || viewMode === "list"`
  // swaps the whole canvas for <WeeklyList> below 600px, and that surface
  // carries no card ⋯ menu on ANY frame — the same pre-existing gap the header
  // note records for WeekA/WeekC, not something F2 touched. The deep link is
  // the phone-reachable entry point, and S4 proves it opens at 375.
  const canvas = await page.evaluate(() => {
    const s = new Set();
    document.querySelectorAll("[class]").forEach((e) =>
      String(e.className)
        .split(/\s+/)
        .forEach((c) => {
          const m = /^(Week[A-Za-z]*|WeeklyList)_[A-Za-z0-9]+__/.exec(c);
          if (m) s.add(m[1]);
        }),
    );
    return [...s].join(",");
  });
  record(
    "S5 menu entry @375",
    "INCONCLUSIVE",
    `⋯ menu absent at phone width — canvas is [${canvas}]; WeeklyShell swaps to WeeklyList below 600px, which has no card menu on any frame (pre-existing, not F2)`,
  );
} else {
  await item375.click({ timeout: 8000 });
  const ok = await page
    .locator(PANEL)
    .waitFor({ state: "visible", timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  const s5 = await observe(page);
  record(
    "S5 menu → the fork diff OPENS @375",
    ok && s5.rows > 0 ? "PASS" : "FAIL",
    `panel=${s5.panel} rows=${s5.rows} doc h-scroll=${s5.docOverflow}px`,
  );
  await page.mouse.move(8, 800);
  await page.screenshot({ path: path.join(OUT, "s5-menu-entry-375.png") });
}

// ══ S6 — 768 tablet tier ════════════════════════════════════════════════════
await page.setViewportSize({ width: 768, height: 1024 });
await page.goto(`${BASE}/daily?lesson=${LESSON}&compare=1`, {
  waitUntil: "domcontentloaded",
  timeout: 240000,
});
const s6Visible = await page
  .locator(PANEL)
  .waitFor({ state: "visible", timeout: 90000 })
  .then(() => true)
  .catch(() => false);
const s6 = await observe(page);
record(
  "S6 deep link opens the diff @768, no doc h-scroll",
  s6Visible && s6.docOverflow <= 0 ? "PASS" : "FAIL",
  `panel=${s6.panel} rows=${s6.rows} doc=${s6.docOverflow}px dialogRight=${s6.dialogRight} vw=${s6.vw}`,
);
await page.mouse.move(8, 1010);
await page.screenshot({ path: path.join(OUT, "s6-deeplink-768.png") });

// ══ S9 — THE LEGIBILITY CONTRACT, under the one theme that flips the tone ═══
//
// The dialog's fill mixes from --panel-bg and its text rides --ink. Both are
// tone-driven, so on Night they must flip TOGETHER — the failure mode this
// guards is white-on-white (or ink-on-dark), which a screenshot at one theme
// cannot rule out. Colours are resolved through a canvas first: computed
// values here can arrive as oklab/color(srgb ...) and scraping the string
// conflates 0–1 with 0–255, which INFLATES the ratio (the repo has been burned
// by exactly that).
const night = await browser.newContext({ viewport: { width: 1440, height: 950 } });
await night.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "mycurricula:onboarding",
      JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
    );
    window.localStorage.setItem("mycurricula:user:theme", "night");
  } catch {
    /* storage disabled */
  }
});
await night.addCookies([
  {
    name: "mc-theme-axes",
    value: "v1.glass.dark.wash.night.normal.calm.normal",
    url: BASE,
  },
]);
await bypassLogin(night, { base: BASE, next: "/weekly", timeout: 240000, retries: 3 });
const nightPage = await night.newPage();
await nightPage.route("**/rest/v1/teacher_preferences**", async (route) =>
  route.request().method() === "GET"
    ? route.continue()
    : route.fulfill({ status: 204, body: "" }),
);
await nightPage.goto(`${BASE}/daily?lesson=${LESSON}&compare=1`, {
  waitUntil: "domcontentloaded",
  timeout: 240000,
});
const nightVisible = await nightPage
  .locator(PANEL)
  .waitFor({ state: "visible", timeout: 90000 })
  .then(() => true)
  .catch(() => false);
const nightRead = nightVisible
  ? await nightPage.evaluate((dialogSel) => {
      const dialog = document.querySelector(dialogSel);
      const title = dialog?.querySelector("h3");
      if (!dialog || !title) return null;
      const cv = document.createElement("canvas");
      cv.width = cv.height = 1;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      const resolve = (css, over) => {
        // Paint an opaque base first so a translucent fill composites the way
        // the eye actually sees it, instead of reading as its own alpha.
        ctx.clearRect(0, 0, 1, 1);
        if (over) {
          ctx.fillStyle = over;
          ctx.fillRect(0, 0, 1, 1);
        }
        ctx.fillStyle = css;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return [r, g, b];
      };
      const lum = ([r, g, b]) => {
        const f = (c) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const bg = resolve(getComputedStyle(dialog).backgroundColor, "#100f18");
      const fg = resolve(getComputedStyle(title).color, `rgb(${bg.join(",")})`);
      const [a, b2] = [lum(bg), lum(fg)].sort((x, y) => y - x);
      return {
        tone: document.documentElement.getAttribute("data-tone"),
        theme: document.documentElement.getAttribute("data-theme"),
        bg,
        fg,
        ratio: Number(((a + 0.05) / (b2 + 0.05)).toFixed(2)),
      };
    }, DIALOG)
  : null;
record(
  "S9 dialog text stays legible on Night (tone flips both fill and ink)",
  !nightRead ? "INCONCLUSIVE" : nightRead.ratio >= 4.5 ? "PASS" : "FAIL",
  nightRead
    ? `tone=${nightRead.tone} theme=${nightRead.theme} bg=rgb(${nightRead.bg}) fg=rgb(${nightRead.fg}) ratio=${nightRead.ratio}:1`
    : "panel never opened on Night — nothing measured",
);
if (nightVisible) {
  // Park the pointer so a stale hover tooltip doesn't sit over the evidence.
  await nightPage.mouse.move(10, 940);
  await nightPage.screenshot({
    path: path.join(OUT, "s9-night-1440.png"),
  });
}
await night.close();

record(
  "S7 browser console clean during the run",
  consoleErrors.length === 0 ? "PASS" : "NOTE",
  consoleErrors.length === 0
    ? "no pageerror / console.error"
    : consoleErrors.slice(0, 6).join(" | "),
);
record(
  "S8 no teacher_preferences writes escaped",
  blockedWrites.length === 0 ? "PASS" : "NOTE",
  blockedWrites.length === 0
    ? "no non-GET attempted"
    : `blocked: ${blockedWrites.join(",")}`,
);

console.log("\n" + JSON.stringify(results, null, 2));
await browser.close();
const failed = results.filter((r) => r.verdict === "FAIL").length;
process.exit(failed > 0 ? 1 : 0);
