// probe-daily-false-empty.mjs — §4b live gate for the /daily false-empty Major.
//
// THE DEFECT: DayA/DayB/DayC branched on `dayLessons.length === 0` alone, so for
// the whole Supabase hydrate (~9.5–11.6s on prod) /daily asserted "No lessons
// planned for this day." over a teacher's real timetable. Reproduced 4/4 on prod.
//
// WHY THIS CONTROLS THE HYDRATE RATHER THAN WAITING FOR ONE. Locally the planner
// settles in well under a second — a first attempt at this probe sampled the DOM
// 32 times and found only ONE pre-settle frame, so "the lie never appeared" was
// nearly a vacuous pass: it measured a window that barely existed. So each pass
// below DRIVES the store's state by intercepting the Supabase REST calls the
// planner hydrates from (lib/planner/supabase-source.ts → /rest/v1/*):
//
//   A. SLOW   — every /rest/v1 response delayed. The store sits in "pending"
//               for as long as we choose, so the assertion is deterministic:
//               skeleton PRESENT, lie ABSENT. This is the discriminating
//               observation — old code showed the lie in exactly this window.
//   B. FAILED — /rest/v1 aborted. The store reports "error"; a failed hydrate
//               must read as a failure, not as an empty day.
//   C. NORMAL — no interception. Settles into the real day; then a genuinely
//               EMPTY day must STILL say it is empty. That inverse case matters:
//               a permanent skeleton would pass A and B while being a worse bug
//               than the one being fixed.
//
// Run per FRAME — glass→DayA, paper→DayB, color→DayC each carried their own copy
// of the string, so one frame passing proves nothing about the other two.
//
// Usage: node scripts/probe-daily-false-empty.mjs   (PROBE_BASE defaults to :3099)
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3099";
const SHOTS = "docs/screenshots/daily-false-empty";
mkdirSync(SHOTS, { recursive: true });

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync(".env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}

const LIE = "No lessons planned for this day";
const ERR = "Couldn’t load your plan";
const LESSON = '[data-planner-item^="lesson:"]';
const LOADING = '[role="status"][aria-busy="true"]';
const axes = (frame) => `v1.${frame}.dark.photo.clear.normal.vivid.highlight`;
const FRAMES = [
  { frame: "glass", canvas: "DayA" },
  { frame: "paper", canvas: "DayB" },
  { frame: "color", canvas: "DayC" },
];
// Dev-server noise under seven concurrent lanes; never app defects.
const DEV_NOISE =
  /ChunkLoadError|Loading chunk|Invalid or unexpected token|Module build failed|ERR_FAILED|Failed to fetch/i;

const results = [];
const check = (ok, name, detail = "") => {
  results.push({ ok, name, detail });
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? `  — ${detail}` : ""}`);
};
const skip = (name, why) => {
  results.push({ ok: true, skipped: true, name, detail: why });
  console.log(`  SKIP ${name}  — ${why}`);
};

// Is the planner actually hydrating from Supabase? With
// NEXT_PUBLIC_PLANNER_USE_SUPABASE unset the store reads lib/mock and
// `effectiveHydration` pins it to "ready" forever — so "pending" and "error"
// CANNOT occur, and passes A/B would be asserting against a state the build can
// never enter. Detect it rather than reporting six phantom failures.
async function detectSupabasePlanner() {
  const ctx = await makeContext("glass", "normal");
  const page = await ctx.newPage();
  let restCalls = 0;
  page.on("request", (r) => {
    if (/\/rest\/v1\//.test(r.url()) && !/teacher_preferences/.test(r.url())) restCalls++;
  });
  await page.goto(`${BASE}/daily`, { waitUntil: "commit", timeout: 240000 });
  await page.locator(LESSON).first().waitFor({ state: "attached", timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await ctx.close();
  return restCalls > 0;
}

const browser = await chromium.launch({ channel: "chrome" });

const auth = await browser.newContext();
{
  const boot = await auth.newPage();
  await boot.goto(
    `${BASE}/auth/claude-login?token=${encodeURIComponent(token)}&next=/weekly`,
    { waitUntil: "domcontentloaded", timeout: 240000 },
  );
  await boot.waitForTimeout(3000);
  await boot.close();
}
const storageState = await auth.storageState();
await auth.close();

// Establish WHICH build we are measuring before asserting anything about it.
// Passing "the lie never appeared" on a build that can never be pending is not
// evidence — it is a vacuous pass, and reporting it as a pass would be the
// dishonesty this whole fix is about.
const SUPABASE_PLANNER = await detectSupabasePlanner();
console.log(
  `\nplanner source: ${SUPABASE_PLANNER ? "SUPABASE (pending/error reachable — A+B will RUN)" : "MOCK (hydration pinned 'ready' — A+B CANNOT be exercised here)"}\n`,
);

/** hydrate: "slow" (delayed) | "fail" (aborted) | "normal". */
async function makeContext(frame, hydrate) {
  const ctx = await browser.newContext({
    storageState,
    viewport: { width: 1440, height: 950 },
  });
  await ctx.addCookies([{ name: "mc-theme-axes", value: axes(frame), url: BASE }]);
  await ctx.addInitScript((frame) => {
    localStorage.setItem(
      "mycurricula:onboarding",
      JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
    );
    localStorage.setItem("mycurricula:user:theme-frame", frame);
    localStorage.setItem("mycurricula:user:theme", "clear");
    localStorage.setItem("mycurricula:user:theme-glass", "dark");
    localStorage.setItem("mycurricula:user:theme-bg", "photo");
    localStorage.setItem("mycurricula:user:theme-dim", "normal");
    // Day resets to VIEW by design; force it so we measure DayA/B/C and not
    // DayEditSplit, whose empty state was already honest.
    localStorage.setItem("cc_editmode", JSON.stringify({ Day: false }));
  }, frame);
  // Would reconcile the saved frame on top of the seed mid-test.
  await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());

  if (hydrate === "slow") {
    await ctx.route("**/rest/v1/**", async (route) => {
      await new Promise((r) => setTimeout(r, 8000));
      await route.continue().catch(() => {});
    });
  } else if (hydrate === "fail") {
    await ctx.route("**/rest/v1/**", (route) => route.abort("failed"));
  }
  return ctx;
}

const read = (page) =>
  page.evaluate(
    ({ LIE, ERR, LESSON, LOADING }) => {
      const text = document.body.innerText || "";
      return {
        lie: text.includes(LIE),
        err: text.includes(ERR),
        loading: !!document.querySelector(LOADING),
        lessons: document.querySelectorAll(LESSON).length,
        counter: (text.match(/\d+ of \d+ complete/) ?? [null])[0],
        // Proof the day canvas actually painted — without this, "no lie" is
        // indistinguishable from "nothing rendered at all".
        painted: !!document.querySelector('button[aria-label="Next day"]'),
      };
    },
    { LIE, ERR, LESSON, LOADING },
  );

for (const { frame, canvas } of FRAMES) {
  const tag = `${frame}/${canvas}`;

  // ── A. SLOW hydrate — the discriminating window ─────────────────────────
  if (!SUPABASE_PLANNER) {
    skip(
      `[${tag}] A: pending-window assertions`,
      "planner is on MOCK (NEXT_PUBLIC_PLANNER_USE_SUPABASE unset) — hydration is pinned 'ready', so 'pending' cannot occur in this build",
    );
    skip(
      `[${tag}] B: failed-hydrate assertions`,
      "same reason — 'error' cannot occur on the mock path",
    );
  } else {
    const ctx = await makeContext(frame, "slow");
    const page = await ctx.newPage();
    await page.goto(`${BASE}/daily`, { waitUntil: "commit", timeout: 240000 });
    await page
      .locator('button[aria-label="Next day"]')
      .waitFor({ state: "attached", timeout: 90000 })
      .catch(() => {});
    await page.waitForTimeout(2500);
    const s = await read(page);
    check(s.painted, `[${tag}] A: day canvas painted while hydrate is in flight`, JSON.stringify(s));
    check(
      s.painted && s.lessons === 0 && s.loading,
      `[${tag}] A: PENDING + no lessons shows a loading affordance`,
      JSON.stringify(s),
    );
    check(
      s.painted && !s.lie,
      `[${tag}] A: the lie is ABSENT in the window that used to show it`,
      `lie=${s.lie}`,
    );
    if (frame === "glass") {
      check(
        !s.counter || !/^0 of 0 /.test(s.counter),
        `[${tag}] A: header does not claim "0 of 0 complete" while pending`,
        `counter=${s.counter}`,
      );
    }
    await page
      .screenshot({ path: `${SHOTS}/${frame}-A-pending.png`, timeout: 15000 })
      .catch(() => {});
    await ctx.close();
  }

  // ── B. FAILED hydrate — a failure must read as a failure ────────────────
  if (SUPABASE_PLANNER) {
    const ctx = await makeContext(frame, "fail");
    const page = await ctx.newPage();
    await page.goto(`${BASE}/daily`, { waitUntil: "commit", timeout: 240000 });
    await page
      .locator('button[aria-label="Next day"]')
      .waitFor({ state: "attached", timeout: 90000 })
      .catch(() => {});
    await page.waitForTimeout(6000);
    const s = await read(page);
    check(
      s.painted && !s.lie,
      `[${tag}] B: a FAILED hydrate never claims the day is empty`,
      JSON.stringify(s),
    );
    check(
      s.painted && (s.err || s.loading),
      `[${tag}] B: a failed hydrate reads as an error (or is still retrying)`,
      `err=${s.err} loading=${s.loading}`,
    );
    await page
      .screenshot({ path: `${SHOTS}/${frame}-B-error.png`, timeout: 15000 })
      .catch(() => {});
    await ctx.close();
  }

  // ── C. NORMAL — settles, and an empty day STILL says so ─────────────────
  {
    const ctx = await makeContext(frame, "normal");
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    await page.goto(`${BASE}/daily`, { waitUntil: "commit", timeout: 240000 });
    await page
      .locator(LESSON)
      .first()
      .waitFor({ state: "attached", timeout: 90000 })
      .catch(() => {});
    await page.waitForTimeout(2000);
    const s = await read(page);
    check(
      s.lessons > 0 && !s.lie && !s.loading,
      `[${tag}] C: settles into the real day — no lie, no lingering skeleton`,
      JSON.stringify(s),
    );
    if (frame === "glass") {
      check(
        s.counter !== null && !/^0 of 0 /.test(s.counter),
        `[${tag}] C: header counter returns after hydrate`,
        `counter=${s.counter}`,
      );
    }
    await page
      .screenshot({ path: `${SHOTS}/${frame}-C-settled.png`, timeout: 15000 })
      .catch(() => {});

    // The inverse failure mode: reach a day with no lessons; it must SAY so.
    // Walking day-by-day never leaves the populated weeks, so jump WEEKS with
    // the `]` shortcut until we run off the end of the plan.
    let found = false;
    for (let i = 0; i < 45 && !found; i++) {
      await page.keyboard.press("]").catch(() => {});
      await page.waitForTimeout(320);
      const d = await read(page);
      if (d.painted && d.lessons === 0) {
        found = true;
        check(
          d.lie && !d.loading,
          `[${tag}] C: a genuinely EMPTY day STILL says so (not a permanent skeleton)`,
          JSON.stringify(d),
        );
        await page
          .screenshot({ path: `${SHOTS}/${frame}-C-empty-day.png`, timeout: 15000 })
          .catch(() => {});
      }
    }
    if (!found) {
      check(false, `[${tag}] C: reached a genuinely empty day to test the inverse case`, "none found in 45 weeks");
    }

    const real = errors.filter((e) => !DEV_NOISE.test(e));
    check(
      real.length === 0,
      `[${tag}] C: no APP page errors`,
      `real=${real.length} raw=${errors.slice(0, 2).join(" | ") || "none"}`,
    );
    await ctx.close();
  }
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} assertions passed`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? `  (${f.detail})` : ""}`);
  process.exit(1);
}
console.log("ALL PASS");
