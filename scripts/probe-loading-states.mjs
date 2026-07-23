// scripts/probe-loading-states.mjs — verifies the hydration-honesty fix.
//
// The bug: while the ~11–16s Supabase hydrate chain runs, planner surfaces
// render their empty state — "No lessons this week", and on catch-up literally
// "All caught up!" — because empty and not-yet-loaded were conflated. This probe
// proves the fix: during the loading window a SKELETON shows and the false
// message does NOT, and after settling the real content (or a genuine empty
// state) appears.
//
// It throttles the network via CDP to widen the loading window so the skeleton
// is observable, then samples the DOM early vs. late.
//
//   node scripts/probe-loading-states.mjs --base=https://<preview>.workers.dev
//
// Token: CLAUDE_BYPASS_TOKEN env, else .env.local. Read-only.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const arg = (n, d) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.slice(n.length + 3) : d;
};
const BASE = arg("base", "https://mycurricula.app").replace(/\/$/, "");
let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  token = readFileSync(".env.local", "utf8").match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}
if (!token) { console.error("FATAL no CLAUDE_BYPASS_TOKEN"); process.exit(2); }

// The surfaces whose empty state used to lie during load. The `false` string is
// what must NOT appear while loading; `skeleton` is the proof of the fix.
const SURFACES = [
  { path: "/catch-up", falseText: /all caught up|nothing to catch up/i, label: "Catch-up" },
  { path: "/weekly", falseText: /no lessons planned/i, label: "Weekly" },
];

let failures = 0;
const log = (ok, m) => { if (!ok) failures++; console.log(`${ok ? "PASS" : "FAIL"}  ${m}`); };
const info = (m) => console.log(`INFO  ${m}`);

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// Authenticate first, fully settled, so the login hydrate can't bleed into the
// first measured surface.
await page.goto(`${BASE}/auth/claude-login?token=${encodeURIComponent(token)}&next=/home`,
  { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(3_000);
log(!/claude-login/.test(page.url()), "authenticated");

// Throttle so the hydrate window is reliably wide enough to observe the
// skeleton. The hydrate is a chain of server-action POSTs, so HIGH latency +
// LOW upload throughput widen the window most; a minified edge bundle still
// loads fine at this rate. Tuned to reliably catch the skeleton (the probe now
// hard-asserts it appeared).
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", {
  offline: false,
  latency: 700,
  downloadThroughput: (500 * 1024) / 8,
  uploadThroughput: (140 * 1024) / 8,
});

const SKELETON = '[role="status"][aria-busy="true"]';
// Real planner data on both surfaces carries this marker (weekly lesson chips
// and catch-up rows alike), so it proves the skeleton→content transition
// actually happened rather than the surface merely rendering nothing.
const CONTENT = '[data-planner-item^="lesson:"]';

for (const s of SURFACES) {
  console.log(`\n--- ${s.label} (${s.path}) ---`);
  // Navigate but DON'T wait for settle — we want the loading window.
  await page.goto(`${BASE}${s.path}`, { waitUntil: "commit", timeout: 90_000 }).catch(() => {});

  // Poll the load window until real content arrives. Track three things:
  //   sawSkeleton      — the loading window was actually EXERCISED (a skeleton
  //                      appeared). If this never happens the probe did NOT test
  //                      loading, so it must FAIL rather than pass vacuously —
  //                      the exact false-green a naive "no skeleton == settled"
  //                      loop would produce.
  //   sawFalseDuringLoad — the false empty message appeared while pending.
  //   sawContent       — the transition completed (data rendered).
  let sawSkeleton = false;
  let sawFalseDuringLoad = false;
  let sawContent = false;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const hasSkel = (await page.locator(SKELETON).count().catch(() => 0)) > 0;
    const hasContent = (await page.locator(CONTENT).count().catch(() => 0)) > 0;
    if (hasSkel) sawSkeleton = true;
    if (hasContent) sawContent = true;
    // The bug we're guarding: a false "empty" message rendered BEFORE the data
    // arrives (i.e. while still loading — no content yet).
    if (!hasContent) {
      const bodyText = (await page.locator("body").innerText().catch(() => "")) || "";
      if (s.falseText.test(bodyText)) sawFalseDuringLoad = true;
    }
    if (sawContent) break; // transition complete
    await page.waitForTimeout(250);
  }

  // The load window MUST have been exercised — a skeleton had to appear. If the
  // throttle was too weak to catch it, that's a probe/config failure to fix, not
  // a silent pass. If the surface rendered a false-empty INSTEAD of a skeleton,
  // this also (correctly) fails.
  log(sawSkeleton, `${s.label}: skeleton WAS shown during the load window`);
  log(!sawFalseDuringLoad, `${s.label}: false empty message NOT shown before data arrived`);
  log(sawContent, `${s.label}: real content rendered after load (transition completed)`);

  // Fully settle and confirm the skeleton is gone (not stuck loading forever).
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3_000);
  const stuck = (await page.locator(SKELETON).count().catch(() => 0)) > 0;
  log(!stuck, `${s.label}: skeleton cleared after settle (no stuck-loading)`);
}

await browser.close();
console.log(failures === 0
  ? "\n✅ LOADING-STATE PROBE PASSED — surfaces show a skeleton while loading, not a false empty state."
  : `\n❌ ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
