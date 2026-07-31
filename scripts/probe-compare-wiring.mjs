// scripts/probe-compare-wiring.mjs — §4b live pass for the fork-diff Compare
// path wired by 300dcdb ("Compare with Team Curriculum" → ForkDiffPanel).
//
// ── WHAT THIS PROBE LEARNED THE HARD WAY ────────────────────────────────────
//
// The first revision measured `[aria-label="Edit lesson title"]` as its control
// on /daily. That element belongs to `components/daily/LessonDetail.tsx`, which
// only `DailyViewV1` mounts — the NEXT_PUBLIC_V2=0 shell. On the shipped (flag
// ON) build /daily renders `components/daily/DailyView.tsx` instead, so the
// control read null everywhere and every scenario came back INCONCLUSIVE. The
// control was wrong, not the app — which is precisely why an absence assertion
// without a live control is worthless.
//
// This revision identifies WHICH DAILY TREE IS LIVE from the CSS-module hashes
// in the rendered DOM (`DailyView_pageTitle__…` vs `DailyViewV1_…`), and takes
// its control from that tree (`day-v2_vaTitle__…`, the selected lesson title).
//
// ── EVERY ABSENCE IS PAIRED, AND THE PAIRING IS A RESPONSE ──────────────────
// "No panel" reads identically to "dead page". Each /daily observation is
// preceded by a CLICK-RESPONSE gate: clicking another lesson row must actually
// change the detail title. That proves React is attached, so a subsequent
// "panel absent" is a fact about the app rather than about hydration. A null
// control demotes a finding to INCONCLUSIVE — never to PASS.
//
// Fixtures (lib/mock/lessons.ts), all week 12 — `masterSnapshot` exists ONLY in
// the mock source, so this probe is meaningful only with
// NEXT_PUBLIC_PLANNER_USE_SUPABASE off (the local default), asserted at S0:
//   m-12-1  day 1  "Fractions as division — bake sale problem"  modified only
//   r-12-1  day 1  "Book club — Via's chapters"                 modified + moved
// Both qualify under canCompareWithTeam and share a day, which is what makes
// scenario 6 sharp: a panel surviving the switch could not be explained away by
// ForkDiffPanel's own no-snapshot early return.
//
// Usage: node scripts/probe-compare-wiring.mjs
//        PROBE_BASE defaults to http://localhost:3099

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { bypassLogin, requireToken } from "./lib/auth.mjs";

requireToken({ repoRoot: process.cwd() });
const BASE = process.env.PROBE_BASE ?? "http://localhost:3099";
const OUT = path.resolve("docs/screenshots/compare-wiring");
await mkdir(OUT, { recursive: true });

const LESSON_A = "m-12-1";
const TITLE_A = "Fractions as division — bake sale problem";
const LESSON_B = "r-12-1";
const TITLE_B = "Book club — Via's chapters";

const results = [];
function record(scenario, verdict, detail) {
  results.push({ scenario, verdict, detail });
  console.log(`${verdict.padEnd(12)} ${scenario}\n             ${detail}`);
}

// ── One observation; panel and control can never come from different moments ─
async function observe(page) {
  return page.evaluate(() => {
    const panel = document.querySelector(
      'section[aria-label="Compare with Team Curriculum"]',
    );
    const rect = panel ? panel.getBoundingClientRect() : null;
    // WHICH DAILY TREE IS LIVE — read from CSS-module hashes, not assumed.
    const html = document.documentElement.outerHTML;
    const v1Tree = /DailyViewV1_[A-Za-z0-9_]+__/.test(html);
    const v2Tree = /(^|[^V1])DailyView_[A-Za-z0-9_]+__/.test(html);
    // CONTROL — which lesson the detail pane is showing.
    //
    // FRAME-AGNOSTIC BY CONSTRUCTION. Two earlier revisions of this control were
    // tied to one renderer and read null on the other: `[aria-label="Edit lesson
    // title"]` exists only in DailyViewV1, and `day-v2_vaTitle` only in the
    // glass frame. data-frame swaps the tree, and the shared bypass account's
    // frame changes under us while other lanes work — so the control matches on
    // the lesson TITLE TEXT, which every renderer must show, and reports which
    // known titles are visible. null ⇒ nothing proven, never "absent".
    const KNOWN = [
      "Fractions as division — bake sale problem",
      "Book club — Via's chapters",
    ];
    let detailTitle = null;
    for (const el of document.querySelectorAll(
      'h1,h2,h3,h4,[class*="Title"],[class*="title"]',
    )) {
      const t = (el.textContent ?? "").trim();
      if (KNOWN.includes(t)) {
        detailTitle = t;
        break;
      }
    }
    const bodyText = document.body.innerText ?? "";
    const visibleTitles = KNOWN.filter((t) => bodyText.includes(t));
    if (detailTitle === null && visibleTitles.length === 1) {
      detailTitle = visibleTitles[0];
    }
    return {
      url: location.pathname + location.search,
      dailyTree: v1Tree ? "DailyViewV1" : v2Tree ? "DailyView(v2)" : null,
      detailTitle,
      visibleTitles,
      panel: !!panel,
      // null (not false) with no panel: a fallback must never be a value that
      // satisfies an assertion about the thing it stands in for.
      panelVisible: rect ? rect.width > 0 && rect.height > 0 : null,
      panelRows: panel ? panel.querySelectorAll("li").length : null,
      legacyDialog: !!document.querySelector(
        '[role="dialog"][aria-label="Compare with Team Curriculum"]',
      ),
      frame:
        document.documentElement.getAttribute("data-frame") ??
        document.querySelector("[data-frame]")?.getAttribute("data-frame") ??
        null,
      tone: document.documentElement.getAttribute("data-tone") ?? null,
      moreActions: document.querySelectorAll('button[aria-label="More actions"]')
        .length,
      plannerItems: document.querySelectorAll("[data-planner-item]").length,
    };
  });
}

/** Poll until `pred` holds; return the LAST observation either way so a timeout
 *  still reports real numbers rather than a bare false. */
async function until(page, pred, { timeoutMs = 30000, everyMs = 400 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = await observe(page);
  while (Date.now() < deadline) {
    if (pred(last)) return { ok: true, obs: last };
    await page.waitForTimeout(everyMs);
    last = await observe(page);
  }
  return { ok: pred(last), obs: last };
}

/**
 * HYDRATION BY RESPONSE on /daily: click lesson B's row and require the detail
 * title to actually change, then click A back. Returns whether the page proved
 * itself interactive. Every absence assertion downstream depends on this.
 */
async function proveInteractive(page) {
  const before = await observe(page);
  for (let i = 0; i < 20; i++) {
    await page
      .locator(`[data-planner-item="lesson:${LESSON_B}"]`)
      .first()
      .click({ timeout: 4000 })
      .catch(() => {});
    const r = await until(page, (o) => o.detailTitle === TITLE_B, {
      timeoutMs: 2500,
      everyMs: 300,
    });
    if (r.ok) {
      // Restore selection to A for the scenario under test.
      for (let j = 0; j < 20; j++) {
        await page
          .locator(`[data-planner-item="lesson:${LESSON_A}"]`)
          .first()
          .click({ timeout: 4000 })
          .catch(() => {});
        const back = await until(page, (o) => o.detailTitle === TITLE_A, {
          timeoutMs: 2500,
          everyMs: 300,
        });
        if (back.ok) return { interactive: true, before, after: back.obs };
      }
      return { interactive: true, before, after: r.obs };
    }
    await page.waitForTimeout(700);
  }
  return { interactive: false, before, after: await observe(page) };
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
  } catch {
    /* storage disabled — the /onboarding assertion surfaces the consequence */
  }
});
await bypassLogin(context, {
  base: BASE,
  next: "/weekly",
  timeout: 240000,
  retries: 3,
});

const page = await context.newPage();
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
});

// ══ S0 — preconditions, entry-point gate, hydration control ═════════════════
await page.goto(`${BASE}/weekly`, {
  waitUntil: "domcontentloaded",
  timeout: 240000,
});
if (page.url().includes("/onboarding")) {
  record("S0 onboarding gate", "BLOCKED", `parked on ${page.url()}`);
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
  process.exit(1);
}

const cardA = page.locator(`[data-planner-item="lesson:${LESSON_A}"]`).first();
await cardA.waitFor({ state: "attached", timeout: 180000 }).catch(() => {});
await cardA.scrollIntoViewIfNeeded().catch(() => {});
if ((await cardA.count()) === 0) {
  record(
    "S0 fixture reachable on /weekly",
    "INCONCLUSIVE",
    "qualifying fixture absent — is NEXT_PUBLIC_PLANNER_USE_SUPABASE on?",
  );
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
  process.exit(1);
}

// READINESS BY RESPONSE: retry the ⋯ open until the MENU appears. The button's
// presence proves only that the server rendered it.
const menuItem = page
  .locator('[role="menu"]')
  .getByText("Compare with Team Curriculum", { exact: true })
  .first();
let menuOpen = false;
let attempts = 0;
for (; attempts < 25 && !menuOpen; attempts++) {
  await cardA
    .locator('button[aria-label="More actions"]')
    .first()
    .click({ timeout: 5000 })
    .catch(() => {});
  menuOpen = await menuItem
    .waitFor({ state: "visible", timeout: 2500 })
    .then(() => true)
    .catch(() => false);
  if (!menuOpen) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(1200);
  }
}
const s0 = await observe(page);
record(
  "S0 entry point — /weekly ⋯ RESPONDS and OFFERS the item",
  menuOpen ? "PASS" : "INCONCLUSIVE",
  `${attempts} attempt(s); canCompareWithTeam gate satisfied live; frame=${s0.frame} tone=${s0.tone}`,
);
if (!menuOpen) {
  await page.screenshot({ path: path.join(OUT, "s0-no-menu.png") });
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
  process.exit(1);
}
await page.screenshot({ path: path.join(OUT, "s0-menu-open.png") });

// ══ S1 — cross-route: /weekly ⋯ → /daily ════════════════════════════════════
await menuItem.click();
const arrived = await until(page, (o) => o.detailTitle === TITLE_A, {
  timeoutMs: 60000,
});
const live1 = await proveInteractive(page);
const s1 = await observe(page);
record(
  "S1 cross-route (/weekly ⋯ → /daily)",
  !live1.interactive
    ? "INCONCLUSIVE"
    : s1.panel
      ? "PASS"
      : "FAIL",
  `tree=${s1.dailyTree} url=${s1.url} control(detailTitle)=${JSON.stringify(s1.detailTitle)} ` +
    `INTERACTIVE=${live1.interactive} (row click flipped the detail title) panel=${s1.panel} rows=${s1.panelRows}`,
);
await page.screenshot({ path: path.join(OUT, "s1-cross-route.png") });

// Which daily tree the fix targets vs. which one ships.
record(
  "S1b the live /daily tree is the one the fix patched",
  s1.dailyTree === "DailyViewV1"
    ? "PASS"
    : s1.dailyTree === null
      ? "INCONCLUSIVE"
      : "FAIL",
  `live tree = ${s1.dailyTree}; the compare host (LessonDetail.tsx) is mounted ONLY by DailyViewV1:1466`,
);

// ══ S2 — warm path: is there any in-document entry point on /daily? ═════════
record(
  "S2 warm path — user-reachable entry point on /daily",
  s1.moreActions > 0 ? "PASS" : "FAIL",
  `same instrument both routes: "More actions" on /weekly=${s0.moreActions} (positive control) vs /daily=${s1.moreActions}; ` +
    `${s1.plannerItems} lesson rows present on /daily, so the page is populated`,
);

// S2b — the LISTENER itself, synthetic dispatch. NOT a user path; it separates
// "the event leg is broken" from "the event leg has no dispatcher here".
const s2before = await observe(page);
await page.evaluate((id) => {
  window.dispatchEvent(
    new CustomEvent("mycurricula:compare-lesson", { detail: { lessonId: id } }),
  );
}, LESSON_A);
const s2b = await until(page, (o) => o.panel === true, { timeoutMs: 8000 });
record(
  "S2b COMPARE_REQUEST_EVENT listener (SYNTHETIC dispatch, not a user path)",
  s2b.obs.detailTitle === null
    ? "INCONCLUSIVE"
    : s2b.ok
      ? "PASS"
      : "FAIL",
  `panel before=${s2before.panel} after=${s2b.obs.panel}; control=${JSON.stringify(s2b.obs.detailTitle)} on tree=${s2b.obs.dailyTree}`,
);

// ══ S3 — cold deep link ═════════════════════════════════════════════════════
const cold = await context.newPage();
cold.on("pageerror", (e) => consoleErrors.push(`pageerror(cold): ${e.message}`));
cold.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(`console.error(cold): ${m.text()}`);
});
await cold.goto(`${BASE}/daily?lesson=${LESSON_A}&compare=1`, {
  waitUntil: "domcontentloaded",
  timeout: 240000,
});
await until(cold, (o) => o.detailTitle === TITLE_A, { timeoutMs: 60000 });
const live3 = await proveInteractive(cold);
const s3 = await observe(cold);
record(
  "S3 cold deep link (/daily?lesson=…&compare=1)",
  !live3.interactive ? "INCONCLUSIVE" : s3.panel ? "PASS" : "FAIL",
  `tree=${s3.dailyTree} url=${s3.url} control=${JSON.stringify(s3.detailTitle)} INTERACTIVE=${live3.interactive} panel=${s3.panel}`,
);
record(
  "S3b ?compare=1 left in the address bar with no reader",
  s3.url.includes("compare=1") ? "FAIL" : "PASS",
  `url after settle = "${s3.url}"`,
);
await cold.screenshot({ path: path.join(OUT, "s3-cold-deeplink.png") });

// ══ S4 / S5 / S6 — only meaningful once a panel can be opened ═══════════════
const panelReachable = s1.panel || s3.panel;
if (!panelReachable) {
  for (const s of [
    "S4 close strips ?compare and does not reopen",
    "S5 Back closes the panel",
    "S6 diff does not carry over on a lesson switch",
  ]) {
    record(
      s,
      "BLOCKED",
      "no panel can be opened on the live tree (S1 + S3 FAIL) — there is nothing to close, go Back from, or carry over",
    );
  }
} else {
  // Retained for a flag-OFF (NEXT_PUBLIC_V2=0) run, where the panel does mount.
  const p = s3.panel ? cold : page;
  const urlBeforeClose = (await observe(p)).url;
  await p
    .locator('button[aria-label="Close comparison"]')
    .first()
    .click({ timeout: 8000 })
    .catch(() => {});
  const s4a = await until(p, (o) => o.panel === false, { timeoutMs: 10000 });
  record(
    "S4a close dismisses the panel",
    s4a.obs.detailTitle === null ? "INCONCLUSIVE" : s4a.ok ? "PASS" : "FAIL",
    `url before close="${urlBeforeClose}" after="${s4a.obs.url}" panel=${s4a.obs.panel}`,
  );
  record(
    "S4b no ?compare in the URL after close",
    !s4a.obs.url.includes("compare=") ? "PASS" : "FAIL",
    `url="${s4a.obs.url}"`,
  );
  await p.locator(`[data-planner-item="lesson:${LESSON_B}"]`).first().click().catch(() => {});
  await until(p, (o) => o.detailTitle === TITLE_B, { timeoutMs: 15000 });
  await p.locator(`[data-planner-item="lesson:${LESSON_A}"]`).first().click().catch(() => {});
  const s4c = await until(p, (o) => o.detailTitle === TITLE_A, { timeoutMs: 15000 });
  record(
    "S4c re-selecting the lesson does NOT reopen the dismissed diff",
    !s4c.ok ? "INCONCLUSIVE" : s4c.obs.panel === false ? "PASS" : "FAIL",
    `control=${JSON.stringify(s4c.obs.detailTitle)} panel=${s4c.obs.panel} url=${s4c.obs.url}`,
  );
}

record(
  "Console errors during the run",
  consoleErrors.length === 0 ? "PASS" : "INFO",
  consoleErrors.length ? consoleErrors.slice(0, 8).join(" | ") : "none",
);

console.log(`\nScreenshots: ${OUT}`);
console.log(JSON.stringify(results, null, 2));
await browser.close();
process.exit(results.some((r) => r.verdict === "FAIL") ? 1 : 0);
