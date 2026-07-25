// scripts/probe-firstrun-flash.mjs — READ-ONLY. Does the deployed-path
// first-run gate show a NEW teacher the planner before bouncing them?
//
// THE CONSTRAINT: settling this "properly" would need an account with
// `onboarded_at IS NULL`, and creating or mutating one is a database write.
// So nothing here writes. Instead the gate's ONLY input is stubbed in flight:
// `readFirstRunState()` (lib/onboarding-v2-remote.ts:50) decides purely on the
// `onboarded_at` value returned by GET /rest/v1/teachers, so rewriting that
// field in the RESPONSE BODY puts the real client code down the real
// never-onboarded branch. No row changes; the context is discarded.
//
// FAITHFULNESS, stated so it is not overclaimed: this reproduces the gate's
// input exactly, and the gate is the only thing under test. It does NOT
// reproduce everything else about a brand-new account (no courses, empty
// workspace), which could change how long the planner takes to paint. So the
// WINDOW measured here is a lower bound on what a real new teacher sees, and
// the ORDER of events (interactive-then-bounced vs bounced-first) is exact.
//
// CONTROL FIRST: --stub=off runs the identical instrument with the rewrite
// disabled. If the control also redirects, the instrument is manufacturing the
// result and the stubbed run proves nothing.
//
// Usage:
//   node scripts/probe-firstrun-flash.mjs --stub=off   # control
//   node scripts/probe-firstrun-flash.mjs --stub=on    # the measurement

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { authedStorageState } from "./lib/auth.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const BASE = arg("base", "https://mycurricula.app");
const STUB = arg("stub", "on") === "on";
const OUT = path.resolve(process.cwd(), "docs/screenshots/firstrun-flash");
mkdirSync(OUT, { recursive: true });

// One evaluate, so path / hydration / interactivity are read in the SAME
// observation — a hydration flag sampled at a different instant than the path
// cannot order the two events.
const SAMPLE = () => {
  const path_ = location.pathname;
  // React attaches __reactFiber$ / __reactProps$ keys on hydration. Reading
  // them is non-invasive — no click, no focus, nothing that could itself
  // perturb what is being measured.
  const probe =
    document.querySelector(".views.console a") ||
    document.querySelector("button.vt-cogbtn") ||
    document.querySelector("main");
  const hydrated =
    !!probe &&
    Object.keys(probe).some(
      (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactProps$"),
    );
  // Interactivity is stronger than "painted": is a real nav destination the
  // topmost element at its own centre?
  let navHittable = false;
  const link = document.querySelector(".views.console a");
  if (link) {
    const r = link.getBoundingClientRect();
    if (r.width > 0) {
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      navHittable = !!top && (top === link || link.contains(top));
    }
  }
  return {
    ms: Math.round(performance.now()),
    path: path_,
    hydrated,
    navHittable,
    navLinks: document.querySelectorAll(".views.console a").length,
  };
};

const browser = await chromium.launch({ channel: "chrome" });
const storageState = await authedStorageState(browser, {
  base: BASE,
  next: "/year",
  timeout: 90000,
  settleMs: 2500,
});

const ctx = await browser.newContext({
  storageState,
  viewport: { width: 1280, height: 900 },
});

let stubbed = 0;
let teacherReads = 0;
// Read-only floor: every non-GET Supabase call is aborted, so mark_onboarded()
// can never fire from this probe even after it lands on the wizard.
await ctx.route(/supabase\.co\//, async (route) => {
  const req = route.request();
  const method = req.method().toUpperCase();
  const url = req.url();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    if (/\/auth\/v1\/token(\?|$)/.test(url)) return route.continue();
    return route.abort();
  }
  if (!STUB || !/\/rest\/v1\/teachers/.test(url)) return route.continue();

  teacherReads += 1;
  const res = await route.fetch();
  let body;
  try {
    body = await res.json();
  } catch {
    return route.fulfill({ response: res });
  }
  const nullify = (row) =>
    row && typeof row === "object" && "onboarded_at" in row
      ? { ...row, onboarded_at: null }
      : row;
  const patched = Array.isArray(body) ? body.map(nullify) : nullify(body);
  stubbed += 1;
  // Drop the hop-by-hop / length headers rather than lying about them.
  const headers = { ...res.headers() };
  delete headers["content-length"];
  delete headers["content-encoding"];
  return route.fulfill({ status: res.status(), headers, body: JSON.stringify(patched) });
});

const page = await ctx.newPage();
page.on("request", (r) => {
  if (!STUB && /\/rest\/v1\/teachers/.test(r.url())) teacherReads += 1;
});

await page.goto(`${BASE}/year`, { waitUntil: "domcontentloaded", timeout: 90000 });

const samples = [];
let firstHydrated = null;
let firstNavHittable = null;
let firstInteractive = null;
let redirectAt = null;
const DEADLINE = 45000;
const t0 = Date.now();
let preRedirectShot = false;
while (Date.now() - t0 < DEADLINE) {
  const s = await page.evaluate(SAMPLE).catch(() => null);
  if (s) {
    samples.push(s);
    if (s.hydrated && firstHydrated === null && s.path !== "/onboarding") firstHydrated = s.ms;
    if (s.navHittable && firstNavHittable === null && s.path !== "/onboarding") {
      firstNavHittable = s.ms;
    }
    // INTERACTIVE requires BOTH, and the control proved why: nav links were
    // hit-testable at 508ms but React did not attach until 835ms. A
    // server-rendered link is clickable-and-inert in that gap — the same
    // pre-hydration trap that made a sibling lane's Tools popover read as
    // "zero items". Hittability alone would overstate the window.
    if (
      s.hydrated &&
      s.navHittable &&
      firstInteractive === null &&
      s.path !== "/onboarding"
    ) {
      firstInteractive = s.ms;
      if (!preRedirectShot) {
        preRedirectShot = true;
        await page
          .screenshot({ path: path.join(OUT, `stub-${STUB ? "on" : "off"}-interactive-before-bounce.png`) })
          .catch(() => {});
      }
    }
    if (s.path === "/onboarding") {
      redirectAt = s.ms;
      break;
    }
  }
  await page.waitForTimeout(120);
}

await page
  .screenshot({ path: path.join(OUT, `stub-${STUB ? "on" : "off"}-final.png`) })
  .catch(() => {});

const result = {
  base: BASE,
  stub: STUB ? "on (onboarded_at -> null in the response body)" : "off (control)",
  at: new Date().toISOString(),
  teacherReads,
  rowsRewritten: stubbed,
  firstHydratedMs: firstHydrated,
  firstNavHittableMs: firstNavHittable,
  firstInteractiveMs: firstInteractive,
  redirectAtMs: redirectAt,
  // The number that sets the severity: how long the planner was INTERACTIVE
  // before the bounce. Cosmetic if <=0; a real usability issue if positive.
  interactiveWindowMs:
    redirectAt !== null && firstInteractive !== null ? redirectAt - firstInteractive : null,
  watchedMs: Date.now() - t0,
  samples: samples.slice(0, 60),
};

// An unauthenticated run sits on /login and never redirects — which would read
// as "no flash-bounce" while testing nothing at all. Name it before any other
// verdict can be reached.
const everOnTarget = samples.some((s) => s.path === "/year");
result.verdict = !everOnTarget
  ? `UNAUTHENTICATED — never reached /year (paths seen: ${[...new Set(samples.map((s) => s.path))].join(", ")}). Nothing was measured.`
  : STUB && stubbed === 0
    ? "INCONCLUSIVE — reached /year but the teachers read was never intercepted (rowsRewritten=0)"
    : !STUB
  ? redirectAt === null
    ? "CONTROL OK — no redirect without the stub, so the instrument is not manufacturing the bounce"
    : "CONTROL FAILED — redirected WITHOUT the stub; this run proves nothing"
  : redirectAt === null
    ? "INCONCLUSIVE — stub applied but no redirect fired (check rowsRewritten > 0)"
    : result.interactiveWindowMs !== null && result.interactiveWindowMs > 0
      ? `REAL — the planner was interactive for ${result.interactiveWindowMs}ms before the bounce`
      : "COSMETIC — the bounce landed before the planner became interactive";

writeFileSync(
  path.join(OUT, `stub-${STUB ? "on" : "off"}.json`),
  JSON.stringify(result, null, 2),
);
console.log(
  JSON.stringify(
    { ...result, samples: `${samples.length} samples (first 60 in the json)` },
    null,
    2,
  ),
);
await ctx.close();
await browser.close();
