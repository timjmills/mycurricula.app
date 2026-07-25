// scripts/probe-onboarding-gate.mjs — READ-ONLY verification of task #34.
//
// THE QUESTION, and it is the only one that matters:
//   Does the first-run gate claim a session that has ALREADY completed
//   onboarding (a defect — a real teacher bounced mid-use), or does it
//   correctly send a genuinely fresh context with no stored completion state
//   to the wizard (expected, and a QA-harness problem rather than a product
//   one)?
//
// Those two look IDENTICAL from inside a failing probe run: both produce
// "element not found on /year". Only the stored state distinguishes them, so
// this probe reads the state rather than the symptom, and runs the two cases
// back to back in one context:
//
//   PASS 1  fresh context, nothing stored  -> redirect here is CORRECT
//   PASS 2  same context, completion state stored -> redirect here is a DEFECT
//
// Pass 2 writes ONLY `localStorage['mycurricula:onboarding']`, which is the
// app's own per-device flag (lib/onboarding-v2-shape.ts) and is exactly what
// finishing the wizard writes. No database write, no RPC, and the context is
// discarded at the end.
//
// WHICH CODE PATH IS LIVE is not assumed from .env files — it is observed. The
// prototype path returns before constructing a Supabase client, so a REST call
// to `teachers?select=onboarded_at` appearing (or not) is the evidence:
//   requests > 0  -> DEPLOYED path, governed by teachers.onboarded_at
//   requests == 0 -> PROTOTYPE path, governed by the localStorage flag
//
// Usage:
//   node scripts/probe-onboarding-gate.mjs --base=http://localhost:3099
//   node scripts/probe-onboarding-gate.mjs --base=https://mycurricula.app

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { authedStorageState } from "./lib/auth.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const BASE = arg("base", "http://localhost:3099");
const LABEL = arg("label", BASE.includes("localhost") ? "local" : "prod");
const OUT = path.resolve(process.cwd(), "docs/screenshots/onboarding-gate");
mkdirSync(OUT, { recursive: true });

const STORAGE_KEY = "mycurricula:onboarding";

/** Poll the URL so the redirect's TIMING is recorded, not just its outcome. */
async function watchUrl(page, ms) {
  const t0 = Date.now();
  const timeline = [];
  let last = null;
  while (Date.now() - t0 < ms) {
    const u = new URL(page.url()).pathname;
    if (u !== last) {
      timeline.push({ atMs: Date.now() - t0, path: u });
      last = u;
    }
    if (u === "/onboarding") break; // settled; nothing bounces back
    await page.waitForTimeout(250);
  }
  return { timeline, finalPath: last, watchedMs: Date.now() - t0 };
}

const readStored = (page) =>
  page
    .evaluate((k) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return "(localStorage unreadable)";
      }
    }, STORAGE_KEY)
    .catch(() => null);

const browser = await chromium.launch({ channel: "chrome" });
const result = { base: BASE, label: LABEL, at: new Date().toISOString() };

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
// Read-only against Supabase: no writes, no RPCs (so mark_onboarded can never
// fire from this probe), auth token refresh still allowed.
await ctx.route(/supabase\.co\//, (route) => {
  const m = route.request().method().toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
  if (/\/auth\/v1\/token(\?|$)/.test(route.request().url())) return route.continue();
  return route.abort();
});

const teacherReads = [];
const page = await ctx.newPage();
page.on("request", (r) => {
  const u = r.url();
  if (/\/rest\/v1\/teachers/.test(u)) teacherReads.push(u.split("?")[1] ?? "(no query)");
});

// ── PASS 1 — fresh context, nothing stored ────────────────────────────────
result.pass1 = {};
result.pass1.storedBefore = await readStored(page);
await page.goto(`${BASE}/year`, { waitUntil: "domcontentloaded", timeout: 90000 });
Object.assign(result.pass1, await watchUrl(page, 30000));
result.pass1.storedAfter = await readStored(page);
result.pass1.teacherRestCalls = teacherReads.length;
await page.screenshot({ path: path.join(OUT, `${LABEL}-pass1-fresh.png`) });
console.log("PASS 1 (fresh):", JSON.stringify(result.pass1, null, 1));

// ── PASS 2 — same context, completion state stored ────────────────────────
// The exact shape lib/onboarding-v2-shape.ts writes when a teacher finishes.
await page.evaluate(
  ([k, payload]) => localStorage.setItem(k, payload),
  [STORAGE_KEY, JSON.stringify({ stepIndex: 0, data: {}, finished: true })],
);
teacherReads.length = 0;
result.pass2 = {};
result.pass2.storedBefore = await readStored(page);
await page.goto(`${BASE}/year`, { waitUntil: "domcontentloaded", timeout: 90000 });
Object.assign(result.pass2, await watchUrl(page, 30000));
result.pass2.teacherRestCalls = teacherReads.length;
await page.screenshot({ path: path.join(OUT, `${LABEL}-pass2-onboarded.png`) });
console.log("PASS 2 (completion stored):", JSON.stringify(result.pass2, null, 1));

// ── Verdict ───────────────────────────────────────────────────────────────
// Named explicitly so the run cannot be read as ambiguous later.
const p1 = result.pass1.finalPath;
const p2 = result.pass2.finalPath;
result.livePath = result.pass1.teacherRestCalls > 0 ? "deployed" : "prototype";
result.verdict =
  p2 === "/onboarding"
    ? "DEFECT — a session WITH stored completion state was still sent to the wizard"
    : p1 === "/onboarding"
      ? "EXPECTED — only the fresh, no-state context was sent to the wizard"
      : "NO REDIRECT — the gate did not fire in either pass";

writeFileSync(path.join(OUT, `${LABEL}.json`), JSON.stringify(result, null, 2));
console.log(`\nlive code path: ${result.livePath} (teachers REST calls in pass 1: ${result.pass1.teacherRestCalls})`);
console.log(`VERDICT: ${result.verdict}`);
await ctx.close();
await browser.close();
