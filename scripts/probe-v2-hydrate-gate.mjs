// scripts/probe-v2-hydrate-gate.mjs — THE CUTOVER GATE.
//
// Why this exists: the 7.17 v2 cutover deployed green and every route returned
// 200, but the planner DATA layer was dead on prod — `[planner] hydrate failed;
// showing empty document` (planner-store.tsx:2265) on /year /weekly /daily
// /planner, rendering empty shells with zero subjects. It slipped every gate
// because all QA ran against DEV SERVERS ON MOCK DATA (.env.local carries no
// NEXT_PUBLIC_PLANNER_USE_SUPABASE), so nothing ever exercised the real data
// path in a production build.
//
// This gate closes that hole. It asserts DATA ACTUALLY RENDERED, not HTTP 200 —
// an empty document with a 200 is precisely the failure mode we shipped.
//
// Point it at a Cloudflare PREVIEW URL from the "Preview deploy (no overwrite)"
// workflow (`wrangler versions upload`): that is a real production OpenNext
// build on real edge infrastructure, wired to real Supabase, which does NOT
// touch prod or the custom domain. Run it BEFORE any re-cut.
//
//   node scripts/probe-v2-hydrate-gate.mjs --base=https://<version>.workers.dev
//   node scripts/probe-v2-hydrate-gate.mjs                 # defaults to prod
//
// Token: CLAUDE_BYPASS_TOKEN env, else read from .env.local. Read-only — it
// navigates and reads; it never mutates planner data.
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------- config
const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const BASE = (
  arg("base", process.env.PROBE_BASE || "https://mycurricula.app")
).replace(/\/$/, "");

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  try {
    const env = readFileSync(".env.local", "utf8");
    // Match to end-of-line, NOT a naive split on "=" — the token is base64 and
    // its trailing "=" padding is silently truncated by `cut -d= -f2`, which
    // yields a token that looks fine and 401s.
    token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
  } catch {
    /* no .env.local — fall through to the guard below */
  }
}
if (!token) {
  console.error(
    "FATAL  no CLAUDE_BYPASS_TOKEN (env or .env.local). Cannot authenticate.",
  );
  process.exit(2);
}

const OUT = path.resolve(process.cwd(), "docs/screenshots/v2-hydrate-gate");
mkdirSync(OUT, { recursive: true });

// Routes that died in the incident, each with the marker proving its data
// actually rendered. `min` is the floor for a healthy hydrate.
const ROUTES = [
  {
    path: "/weekly",
    label: "Weekly",
    marker: '[data-planner-item^="lesson:"]',
    what: "lesson items",
    min: 1,
  },
  {
    path: "/daily",
    label: "Daily",
    // v1 and v2 mark a day lesson row DIFFERENTLY, and the gate has to be
    // correct on both or it reports a phantom failure on whichever it wasn't
    // written against. v1 (components/daily/DailyView) carries
    // data-planner-item; day-v2 (DayA/DayB/DayC) gained the same attribute on
    // 2026-07-24 (cutover follow-up #3). The title fallback stays so the gate
    // remains correct against builds that predate that commit.
    // The `.cp-subj` qualifier is REQUIRED, not decoration: in the `paper`
    // frame DayB's FocusPanel root carries the same title and the bare
    // selector over-counts by one. FocusPanel has no `.cp-subj` class, so the
    // qualifier filters it out. Verified 8/8/8 across glass/paper/color.
    marker:
      '[data-planner-item^="lesson:"], .cp-subj[title="Double-click to open the daily planner"]',
    what: "lesson items",
    min: 1,
    // today may be a non-school day — advance a day before failing
    walkDays: true,
  },
  {
    path: "/year",
    label: "Year",
    // the incident's literal symptom was "zero subjects rendered".
    // data-year-lane only exists in the YearA lane mode; the DEFAULT Year
    // surface is the progressive-drill TimelineYear, whose subject rows carry
    // data-year-subject (added 2026-07-24). Accept either so the gate is
    // correct in every view mode.
    marker: "[data-year-lane], [data-year-subject]",
    what: "subject lanes",
    min: 1,
  },
  {
    path: "/catch-up",
    label: "Catch-up",
    // catchup rows carry the same planner-item marker
    marker: '[data-planner-item^="lesson:"]',
    what: "lesson items",
    // catch-up is legitimately empty when nothing is behind, so this route
    // is console-gated rather than count-gated: report the count, don't fail on it
    min: 0,
  },
  {
    path: "/planner",
    label: "Planner hub",
    marker: null, // console-only: no stable data marker on the hub shell
    what: null,
    min: 0,
  },
  {
    path: "/post",
    label: "Resource wall",
    marker: null, // v2-only, net-new; console-only
    what: null,
    min: 0,
  },
  {
    path: "/home",
    label: "Home",
    marker: null,
    what: null,
    min: 0,
  },
];

// The exact store message. Its presence means the data layer gave up.
const HYDRATE_FAIL = "[planner] hydrate failed";
// Benign noise seen on healthy prod runs.
const BENIGN = [/img\.youtube\.com/i, /favicon/i];
const isBenign = (s) => BENIGN.some((re) => re.test(s));

let failures = 0;
const log = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
};
const info = (msg) => console.log(`INFO  ${msg}`);

// The planner hydrate is a ~10s chain of SIX chained server-action POSTs, and
// data does not paint until roughly 11–16s. `networkidle` fires between links
// in that chain, so `networkidle + 3s` is NOT settled — it just looks settled.
//
// This matters in both directions and the second one is nastier:
//   * too-early ASSERTION  -> false red (the marker isn't painted yet), and
//   * too-early NAVIGATION -> the dying previous document emits its aborted
//     hydrate error, which Playwright's page-level listener files under the
//     NEXT route. The error you see never belongs to the page you're looking at.
// A gate that intermittently reds a healthy build trains people to ignore it,
// which is worse than having no gate at all.
//
// So: wait on the completion SIGNAL (the marker) where one exists, and give
// markerless routes a budget that actually outlasts the hydrate.
const HYDRATE_BUDGET_MS = 18_000;

async function settle(page, marker) {
  if (marker) {
    // The marker appearing IS hydrate completion — far better than a timer.
    // 75s, not 45s: the edge hydrate chain's slow tail (cold isolate + six
    // chained POSTs) intermittently exceeded 45s and produced flaky reds on a
    // healthy prod (observed 2026-07-24: 37 items rendered at ~50s).
    await page
      .locator(marker)
      .first()
      .waitFor({ state: "visible", timeout: 75_000 })
      .catch(() => {});
    // Post-7.23 the loading-honesty skeletons (role="status", aria-busy)
    // paint during hydrate; if the marker never showed, give the skeletons a
    // chance to clear and re-check once — an aria-busy page is "still
    // loading", not "empty".
    const visible = await page.locator(marker).first().isVisible().catch(() => false);
    if (!visible) {
      await page
        .waitForFunction(
          () => document.querySelectorAll('[aria-busy="true"]').length === 0,
          { timeout: 20_000 },
        )
        .catch(() => {});
      await page
        .locator(marker)
        .first()
        .waitFor({ state: "visible", timeout: 10_000 })
        .catch(() => {});
    }
    await page.waitForLoadState("networkidle", { timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(2_000);
    return;
  }
  // No completion signal available: spend the full budget, but stop early once
  // the network has been genuinely quiet rather than idling for the sake of it.
  await page.waitForLoadState("networkidle", { timeout: HYDRATE_BUDGET_MS }).catch(() => {});
  const started = Date.now();
  let quiet = 0;
  while (Date.now() - started < HYDRATE_BUDGET_MS) {
    await page.waitForTimeout(1_500);
    const busy = await page
      .evaluate(() => performance.getEntriesByType("resource")
        .filter((r) => !r.responseEnd).length)
      .catch(() => 0);
    quiet = busy === 0 ? quiet + 1 : 0;
    if (quiet >= 3) break; // ~4.5s of genuine quiet
  }
}

console.log(`\n=== v2 hydrate gate ===\nbase: ${BASE}\n`);

// ---------------------------------------------------------------- run
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();

// Per-route issue buckets, reset on each navigation.
let issues = [];
let reqFailed = [];
page.on("pageerror", (e) =>
  issues.push(`[pageerror] ${e.message.slice(0, 240)}`),
);
page.on("console", (m) => {
  if (m.type() === "error") issues.push(`[console.error] ${m.text().slice(0, 240)}`);
});
page.on("response", (r) => {
  const status = r.status();
  const req = r.request();
  const sameOrigin = r.url().startsWith(BASE);
  // A Next.js SERVER ACTION is a POST to the page's own URL carrying
  // `Next-Action`. The incident's real fingerprint was one of these 404'ing at
  // the edge (browser → OUR Worker, never → Supabase), so a naive `>= 500`
  // check would sail straight past it. Treat any non-OK same-origin POST as
  // blocking — that is the exact class of failure this gate exists to catch.
  const isAction =
    req.method() === "POST" &&
    sameOrigin &&
    Boolean(req.headers()["next-action"]);
  if (isAction && status >= 400) {
    issues.push(`[SERVER ACTION ${status}] ${r.url().slice(0, 160)}`);
  } else if (sameOrigin && req.method() === "POST" && status >= 400) {
    issues.push(`[same-origin POST ${status}] ${r.url().slice(0, 160)}`);
  } else if (status >= 500) {
    issues.push(`[http ${status}] ${r.url().slice(0, 160)}`);
  }
});
// The incident showed "Failed to fetch" with ZERO requestfailed events — the
// signature of a fetch blocked before it ever hit the network. Recording these
// separates "blocked pre-dispatch" from "network refused it".
page.on("requestfailed", (r) =>
  reqFailed.push(`${r.failure()?.errorText ?? "?"} ${r.url().slice(0, 160)}`),
);

// --- authenticate once; the bypass cookie carries across routes
await page.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(token)}&next=/weekly`,
  { waitUntil: "domcontentloaded", timeout: 90_000 },
);
// Let the post-login landing FULLY settle before the sweep starts. Without
// this, the first route's goto interrupts the landing page's in-flight
// hydrate fetches; they abort with net::ERR_ABORTED, surface as
// `TypeError: Failed to fetch`, and trip the hydrate assertion — a phantom
// failure manufactured by the probe itself rather than a real regression.
// The landing route is /weekly, so wait on ITS marker — the login page's own
// hydrate must finish before the sweep starts, or its dying error lands in the
// first route's bucket.
await settle(page, '[data-planner-item^="lesson:"]');
info(`landed on: ${page.url()}`);
log(!/claude-login/.test(page.url()), "bypass login authenticated");
if (/claude-login/.test(page.url())) {
  console.error(
    "\nFATAL  auth failed — every route assertion below would be meaningless.",
  );
  await browser.close();
  process.exit(2);
}

for (const route of ROUTES) {
  issues = [];
  reqFailed = [];
  console.log(`\n--- ${route.label} (${route.path}) ---`);

  await page.goto(`${BASE}${route.path}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });

  await settle(page, route.marker);

  // /daily lands on today, which may be a non-school day (legitimately empty).
  // v1 and v2 navigate days COMPLETELY differently: v1 has a row of weekday
  // pills; v2 (day-v2/DayHeader) has no pills at all, just a ◀ / ▶ day
  // navigator. Try each, so an empty landing day never reads as a failure on
  // whichever version we're pointed at.
  if (route.walkDays && (await page.locator(route.marker).count()) === 0) {
    const pills = page.getByRole("button", { name: /^(sun|mon|tue|wed|thu)/i });
    const pillCount = await pills.count();
    const nextDay = page.locator('button[aria-label="Next day"]');
    const hasNextDay = (await nextDay.count()) > 0;

    if (pillCount > 0) {
      info(`no items on landing day — walking ${pillCount} weekday pills (v1)`);
      for (let i = 0; i < pillCount; i++) {
        await pills.nth(i).click({ timeout: 5_000 }).catch(() => {});
        await page.waitForTimeout(1_200);
        if ((await page.locator(route.marker).count()) > 0) break;
      }
    } else if (hasNextDay) {
      info("no items on landing day — advancing with the ▶ day navigator (v2)");
      for (let i = 0; i < 7; i++) {
        await nextDay.click({ timeout: 5_000 }).catch(() => {});
        await page.waitForTimeout(1_200);
        if ((await page.locator(route.marker).count()) > 0) break;
      }
    } else {
      info("no items on landing day and no day switcher found");
    }
  }

  // 1. THE assertion: did real data render?
  if (route.marker) {
    const count = await page.locator(route.marker).count();
    if (route.min > 0) {
      log(
        count >= route.min,
        `${route.label}: ${count} ${route.what} rendered (need >= ${route.min})`,
      );
    } else {
      // Legitimately-empty-able route (e.g. catch-up with nothing overdue):
      // report the count for signal, but don't fail on it — a false red here
      // would train people to ignore the gate.
      info(`${route.label}: ${count} ${route.what} rendered (informational)`);
    }
  }

  // 2. The incident's exact signature.
  const hydrateFails = issues.filter((s) => s.includes(HYDRATE_FAIL));
  log(
    hydrateFails.length === 0,
    `${route.label}: no "${HYDRATE_FAIL}" (${hydrateFails.length})`,
  );

  // 3. General health.
  const blocking = issues.filter((s) => !isBenign(s) && !s.includes(HYDRATE_FAIL));
  for (const i of issues) info(i);
  log(blocking.length === 0, `${route.label}: no blocking console/page/5xx (${blocking.length})`);

  // Diagnostic only — never fails the gate. A "Failed to fetch" with an empty
  // list here is the pre-dispatch-block fingerprint from the incident.
  if (reqFailed.length) {
    info(`requestfailed events (${reqFailed.length}):`);
    for (const r of reqFailed.slice(0, 10)) info(`  ${r}`);
  } else {
    info("requestfailed events: 0");
  }

  await page.screenshot({
    path: path.join(OUT, `${route.path.replace(/\//g, "") || "root"}.png`),
    fullPage: false,
  });

  // Settle again before navigating away. This is the direction that produces
  // FALSE REDS: an unsettled page's aborted hydrate POST emits its error after
  // we've moved on, and it lands in the NEXT route's bucket.
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
}

await browser.close();

console.log(
  failures === 0
    ? "\n✅ V2 HYDRATE GATE PASSED — data renders against real Supabase in a production build."
    : `\n❌ ${failures} FAILURE(S) — do NOT cut over.`,
);
process.exit(failures === 0 ? 0 : 1);
