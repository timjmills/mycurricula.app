/**
 * Does the Planner Hub search DENY a real match during the hydrate — live, in a
 * browser, on production?
 *
 * WHY THIS EXISTS. The fix for this was proven deterministically (vitest +
 * react-dom/server against the real components) and the store chain that drives
 * `pending` was READ. But `pending` had never been OBSERVED in a browser,
 * because localhost has no NEXT_PUBLIC_PLANNER_USE_SUPABASE — it runs the mock
 * path and pins hydration to "ready" (measured: zero /rest/v1/ calls). So the
 * final step, "prod's hydrate actually drives these components into pending",
 * was inference. This closes it.
 *
 * THE DETECTOR TRAP, reproduced deliberately below. The component emits CURLY
 * quotes (U+201C/U+201D). An earlier attempt matched with ASCII quotes, never
 * fired, and printed "not reproduced" — absence of evidence from a broken
 * instrument. Every matcher here is the BARE SUBSTRING with no quote characters,
 * and the ascii variant is evaluated alongside purely to show it stays false.
 *
 * READ-ONLY: types into a search box. Opens nothing, clicks no control that
 * persists, writes nothing.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { authedStorageState, redact } from "./lib/auth.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const BASE = arg("base", "https://mycurricula.app");
const QUERY = arg("query", "Lesson");
const OUT = path.join(process.cwd(), "docs/screenshots/hub-search-false-empty");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
let state;
try {
  state = await authedStorageState(browser, { base: BASE, next: "/planner", timeout: 120000, settleMs: 2000 });
} catch (e) {
  console.error("AUTH FAILED:", redact(String(e)));
  await browser.close();
  process.exit(2);
}
const ctx = await browser.newContext({ storageState: state, viewport: { width: 1440, height: 900 } });
await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
const page = await ctx.newPage();

let restCalls = 0;
page.on("request", (r) => {
  if (r.url().includes("/rest/v1/")) restCalls += 1;
});

console.log(`\nHUB SEARCH — live pending check against ${BASE}\n`);
await page.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 180000 });

const box = page.locator('input[placeholder*="Search lessons"]').first();
await box.waitFor({ state: "visible", timeout: 120000 });

// TYPE AFTER REACT ATTACHES, NOT MERELY AFTER THE INPUT EXISTS.
//
// The first version of this probe filled as soon as the input was visible. The
// value was set on a pre-hydration DOM node, React then attached and re-rendered
// from its own empty state, and the text was WIPED — every later sample read
// query="" and reported denies=false, which the verdict line dutifully called
// "not reproduced". That is an artifact, and it would have buried the real
// question under a confident negative.
//
// It also IS a finding: text typed before React attaches is silently lost. That
// is recorded separately; here it is only a thing to control for.
//
// The window that matters for the false-empty is AFTER React attaches (so the
// query sticks) and BEFORE the store settles (so the catalog is still empty) —
// on prod that is roughly 1s to 11s, which a teacher hits easily.
await page.waitForFunction(
  () => {
    const el = document.querySelector('input[placeholder*="Search lessons"]');
    if (!el) return false;
    const k = Object.keys(el).find((x) => x.startsWith("__reactProps$"));
    return Boolean(k && typeof el[k].onChange === "function");
  },
  null,
  { timeout: 120000, polling: 100 },
);
// Type as a user does, so React's onChange actually runs.
await box.click();
await box.type(QUERY, { delay: 20 });
const stuck = await box.inputValue();
console.log(`  typed after React attached — input holds: "${stuck}"`);

// ── DETECTOR SELF-TEST, before any negative is trusted ─────────────────────
const selftest = await page.evaluate(() => {
  const probe = document.createElement("p");
  probe.id = "__detector_probe";
  probe.textContent = "No lessons match “Fractions”.";
  document.body.appendChild(probe);
  const txt = document.body.innerText;
  const bare = txt.includes("No lessons match");
  const ascii = /No lessons match ["][^"]*["]\./.test(txt);
  probe.remove();
  return { bare, ascii };
});
console.log(`  detector selftest — bare substring FIRES: ${selftest.bare} (want true)`);
console.log(`  detector selftest — ascii-quote matcher:  ${selftest.ascii} (want false = the old vacuity)`);
if (!selftest.bare) {
  console.error("\n  REFUSING: the detector cannot see its own injected sentence. Any negative below would be meaningless.\n");
  await browser.close();
  process.exit(2);
}

const read = () =>
  page.evaluate(() => {
    const t = document.body.innerText;
    return {
      denies: t.includes("No lessons match"),
      skeleton: document.querySelectorAll('[role="status"], [class*="keleton"]').length,
      rows: document.querySelectorAll('[class*="group"]').length,
    };
  });

const samples = [];
let elapsed = 0;
for (const step of [0, 1000, 2000, 3000, 5000, 8000, 12000, 18000, 25000, 35000]) {
  if (step > elapsed) {
    await page.waitForTimeout(step - elapsed);
    elapsed = step;
  }
  const r = await read();
  const q = await box.inputValue();
  samples.push({ t: step, ...r, query: q });
  console.log(
    `  t=${String(step).padStart(5)}ms  denies=${String(r.denies).padEnd(5)} skeleton=${r.skeleton} groups=${r.rows} query="${q}"`,
  );
  if (step === 0) await page.screenshot({ path: path.join(OUT, "t0.png"), fullPage: true });
}
await page.screenshot({ path: path.join(OUT, "settled.png"), fullPage: true });

const queryStable = samples.every((s) => s.query === QUERY);
const deniedEarly = samples.some((s) => s.t <= 8000 && s.denies);
const contentLate = samples.at(-1).rows > 0 || !samples.at(-1).denies;

console.log(`\n  /rest/v1/ requests seen: ${restCalls} (0 would mean the MOCK path — inconclusive)`);
console.log(`  query never changed: ${queryStable}`);
console.log(
  `\n  VERDICT: ${
    restCalls === 0
      ? "INCONCLUSIVE — no Supabase traffic; this base is on the mock path, pending cannot occur."
      : deniedEarly && contentLate && queryStable
        ? "DEFECT REPRODUCED LIVE — the search DENIED a real match during hydrate, then the same unchanged query returned content."
        : deniedEarly
          ? "denied early but never resolved — check the query actually matches something"
          : "NOT reproduced in this run — hydrate may have beaten the first sample, or the fix is already deployed."
  }`,
);

writeFileSync(
  path.join(OUT, "results.json"),
  JSON.stringify({ base: BASE, query: QUERY, restCalls, selftest, samples }, null, 2),
);
console.log(`  artifacts → ${OUT}`);
await browser.close();
