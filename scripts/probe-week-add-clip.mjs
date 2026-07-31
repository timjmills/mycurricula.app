// probe-week-add-clip.mjs — the paper Week frame's per-day add affordance.
//
// Two things this measures that a unit test cannot, because both are questions
// about LAYOUT rather than about markup:
//
//   1. Is there an add trigger in every configured school-day column, and does
//      it clear the 44px touch floor?
//   2. Does the 300px add MENU fit inside the week's horizontal scroll
//      container? A column is ~170px, so a centre-anchored menu overhangs its
//      own track by ~65px each side, and `.scroll { overflow: auto }` cuts off
//      whatever crosses the edge. Measured before the fix: 39px lost off the
//      left on the first column, 38px off the right on the last. The two edge
//      columns now pin to their own edge (`align="start"` / `"end"`); every
//      column between them keeps the centred default, and this probe asserts
//      that ALL of them — not just the two that were changed — clip zero.
//
// GATE B — a control that has been seen to fail. Before asserting "nothing is
// clipped", the probe proves it can SEE clipping: it forces the first column's
// menu back to the centred recipe in the page and re-measures. If that control
// reports 0px too, the instrument is blind and the run FAILS rather than
// passing vacuously.
//
// Run: node scripts/probe-week-add-clip.mjs   (dev server on 3010)

import { chromium } from "playwright";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3010";
const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

// Packed mc-theme-axes cookie — LOCKSTEP with lib/theme-values.ts.
const axes = (frame) => `v1.${frame}.dark.photo.clear.normal.vivid.highlight`;

const main = async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  // Several build lanes share ONE dev server here, and a cold route compile
  // under that load exceeds Playwright's 30s default. Contention is not a
  // finding — give navigation room so it cannot be reported as one.
  ctx.setDefaultNavigationTimeout(150000);
  await ctx.addInitScript(() => {
    localStorage.setItem(
      "mycurricula:onboarding",
      JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
    );
    localStorage.setItem("mycurricula:user:theme-frame", "paper");
  });
  // The frame must not be pulled back to the account's stored preference
  // mid-run — that flip is what made an interactive session unmeasurable.
  await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
  await ctx.addCookies([{ name: "mc-theme-axes", value: axes("paper"), url: BASE }]);
  await bypassLogin(ctx, { base: BASE, next: "/weekly" });

  const page = await ctx.newPage();
  await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });

  // Grid canvas — WeeklyShell routes paper → WeekColumns there.
  await page.waitForTimeout(4000);
  const grid = page.locator('button', { hasText: /^Grid$/ }).first();
  if (await grid.count()) await grid.click();
  await page.waitForSelector('[aria-label^="Weekly plan by day"]', { timeout: 30000 });
  await page.waitForTimeout(1200);

  const frame = await page.evaluate(
    () => document.querySelector("[data-frame]")?.getAttribute("data-frame"),
  );
  ok("frame is paper (WeekColumns, not WeekA)", frame === "paper", `frame=${frame}`);

  const triggers = page.locator('[aria-label^="Weekly plan by day"] button', {
    hasText: /^\+?\s*Add$/,
  });
  const columns = await page.evaluate(
    () => document.querySelector('[aria-label^="Weekly plan by day"]').children.length,
  );
  const n = await triggers.count();
  ok("one add trigger per configured school day", n === columns && n > 0, `${n} of ${columns}`);

  const sizes = await triggers.evaluateAll((els) =>
    els.map((e) => Math.round(e.getBoundingClientRect().height)),
  );
  ok("every add trigger clears the 44px floor", sizes.every((h) => h >= 44), sizes.join(","));

  /**
   * Open column `i`'s menu and return how far it spills past the clipper.
   *
   * Drives the toggle with a DOM `.click()` inside the page rather than
   * Playwright's actionability-checked click. Two reasons, both learned the
   * hard way here: the checked click silently no-opped on the first two
   * columns (the shell's left rail overlaps their hit point), and the failure
   * surfaced as "menu never opened" — the exact message a genuinely MISSING
   * control would produce. An instrument whose failure is indistinguishable
   * from the defect it looks for is worse than no instrument.
   *
   * It also closes every open menu first, so the "New lesson" item it finds
   * always belongs to column i and never to a leftover from column i-1.
   */
  const measure = async (i) =>
    page.evaluate(async (idx) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const trigs = [
        ...document.querySelectorAll('[aria-label^="Weekly plan by day"] button'),
      ].filter((b) => /^\+?\s*Add$/.test(b.textContent.trim()));
      for (const t of trigs) {
        if (t.getAttribute("aria-expanded") === "true") t.click();
      }
      await sleep(120);
      trigs[idx].click();
      // Poll rather than sleep a fixed interval — the dev server compiles the
      // menu chunk on first open and a fixed wait loses that race.
      let nl = null;
      for (let k = 0; k < 60; k++) {
        nl = [...document.querySelectorAll("button")].find((b) =>
          b.textContent.includes("New lesson"),
        );
        if (nl) break;
        await sleep(250);
      }
      if (!nl) return null;
      const r = nl.parentElement.getBoundingClientRect();
      const c = document
        .querySelector('[class*="WeekColumns_scroll"]')
        .getBoundingClientRect();
      const out = {
        left: Math.max(0, Math.round(c.left - r.left)),
        right: Math.max(0, Math.round(r.right - c.right)),
      };
      trigs[idx].click();
      return out;
    }, i);

  // ── Hydration gate ───────────────────────────────────────────────────────
  // `waitForSelector` on the canvas passes against SERVER-rendered HTML, so the
  // first click can land before React has attached the trigger's handler and
  // simply does nothing. That produced a single reproducible "column 0 menu
  // never opened" — the defect message, from a page that was merely not ready.
  // Poll until a click actually toggles aria-expanded, then close it again.
  const hydrated = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const trig = () =>
      [...document.querySelectorAll('[aria-label^="Weekly plan by day"] button')].filter(
        (b) => /^\+?\s*Add$/.test(b.textContent.trim()),
      )[0];
    for (let k = 0; k < 60; k++) {
      const t = trig();
      t.click();
      await sleep(250);
      if (trig().getAttribute("aria-expanded") === "true") {
        trig().click();
        await sleep(200);
        return true;
      }
    }
    return false;
  });
  ok("add triggers are interactive (hydration gate)", hydrated);

  for (let i = 0; i < n; i++) {
    const m = await measure(i);
    ok(
      `column ${i} menu is not clipped`,
      m !== null && m.left === 0 && m.right === 0,
      m ? `left=${m.left} right=${m.right}` : "menu never opened",
    );
  }

  // ── GATE B — prove the measurement can report a non-zero clip ─────────────
  // Re-centre the first column's menu in the page, then measure again. This
  // reproduces the pre-fix geometry exactly; if it still reads 0 the probe is
  // measuring nothing and every PASS above is worthless.
  await page.addStyleTag({
    content: `[class*="atoms_vaDayAddMenu"] { left: 50% !important; right: auto !important; transform: translateX(-50%) !important; }`,
  });
  const control = await measure(0);
  ok(
    "GATE B — the probe can SEE a clipped menu (control)",
    control !== null && control.left > 0,
    control ? `left=${control.left} right=${control.right}` : "menu never opened",
  );

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length === 0 ? 0 : 1);
};

main().catch((e) => {
  console.error(String(e).slice(0, 400));
  process.exit(1);
});
