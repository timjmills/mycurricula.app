// probe-tools-catchup.mjs — is the chrome Tools > Catch-up path reachable?
//
// VERDICT (2026-07-25): YES. Task #29's "the Tools popover renders zero items
// and catchup:toggle has no listener" was FALSE. The path is healthy end to end.
//
// WHAT ACTUALLY PRODUCED THE FALSE REPORT — a PRE-HYDRATION CLICK.
// The Tools trigger is server-rendered, so it is in the DOM and clickable long
// before React attaches its onClick. A click in that window lands on a live
// element, does nothing, and leaves `aria-expanded="false"` — so a probe that
// then counts `.tool` items sees ZERO and reports "renders nothing". Proven by
// varying ONLY the wait, everything else identical:
//
//     wait= 1000ms  triggerInDom=true  aria-expanded=false  views=0
//     wait= 3000ms  triggerInDom=true  aria-expanded=false  views=0
//     wait=11000ms  triggerInDom=true  aria-expanded=true   views=6
//
// A fixed timer is therefore NOT a safe way to drive this app: dev hydration is
// 5–9s at rest and longer under concurrent-lane load, so a probe that sleeps a
// constant and clicks once is a coin flip. This one instead RETRIES the click
// until the trigger actually responds (`aria-expanded === "true"`), and fails
// only after the budget is exhausted — a readiness signal, not a guess.
//
// WHY THE COUNTS COME IN PAIRS. ChromeToolsMenu's Views row is unconditional (a
// plain VIEWS.map, no gate), so it is a known-good control that NO Catch-up bug
// could remove. Views and Catch-up are counted in the SAME evaluation:
//
//   views > 0 AND catchup == 0 → a real, specific regression
//   views == 0                 → the probe never saw the popover; not an app bug
//
// An absence-assertion with no positive control in the same sample FAILS OPEN.
// That is the mistake this file exists to stop repeating.
//
// ON THE FRAME AXIS (`data-frame ∈ glass|paper|color`), deliberately NOT swept
// here. Static answer: NOTHING under components/chrome or components/catchup-v2
// branches on `data-frame`/`data-version`, and no frame-conditional CSS hides
// the tools or catchup controls — so the frame cannot change which tree mounts.
// An earlier sweep in this file seeded `mycurricula:user:theme-frame` in
// localStorage and was REMOVED as an instrument that lied: the applied frame
// came back `paper` for all three requests (the server/DB preference wins), so
// it silently measured one frame three times while reporting three. If a real
// frame sweep is ever needed, drive the `mc-theme-axes` cookie or
// teacher_preferences and ASSERT the applied attribute matches the request.
//
// TREE PROVENANCE. This renders the WORKING TREE, not a commit — it prints the
// HEAD sha and whether the Tooltip files (which wrap the Tools trigger) are
// dirty, so a dirty-tree result can never be read back as a fact about a commit.

import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3099";
const ROUTE = process.env.ROUTE ?? "/weekly";

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();

const checks = [];
function assert(name, cond, detail = "") {
  checks.push({ name, cond });
  console.log(`  ${cond ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log("\n── Tools > Catch-up reachability ──");
  console.log(`  tree: HEAD ${git("rev-parse", "--short", "HEAD")} (WORKING TREE, not a commit)`);
  const dirty = git("status", "--short", "--", "components/ui/Tooltip.tsx",
    "components/ui/Tooltip.module.css", "components/chrome/ChromeToolsMenu.tsx",
    "components/catchup-v2/CatchUpModal.tsx");
  console.log(`  dirty on this path: ${dirty ? "\n" + dirty : "(none)"}`);

  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("mycurricula:onboarding",
        JSON.stringify({ stepIndex: 0, data: {}, finished: true }));
    } catch {}
  });
  await bypassLogin(context, { base: BASE, next: "/weekly", retries: 3, timeout: 120000 });
  const page = await context.newPage();

  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 120000 });

  // ── Open the popover, hydration-aware ────────────────────────────────────
  // Retry until the trigger RESPONDS. `aria-expanded` flipping to "true" is the
  // proof React is wired; the element merely existing proves only that the
  // server rendered it.
  const trigger = page.getByRole("button", { name: "Tools", exact: true }).first();
  await trigger.waitFor({ state: "visible", timeout: 60000 });

  let opened = false;
  let attempts = 0;
  for (; attempts < 20 && !opened; attempts += 1) {
    await trigger.click().catch(() => {});
    await page.waitForTimeout(1000);
    opened = (await trigger.getAttribute("aria-expanded")) === "true";
  }
  assert("Tools trigger responds (React is hydrated and wired)", opened,
    `after ${attempts} attempt(s)`);

  // ── The two numbers, one sample ──────────────────────────────────────────
  const sample = await page.evaluate(() => {
    const vis = (e) => {
      const cs = getComputedStyle(e);
      const b = e.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0 && b.height > 0;
    };
    const txt = (e) => (e.getAttribute("aria-label") || e.textContent || "").trim();
    const views = [...document.querySelectorAll(".toolsrow-views .tool")];
    const cu = [...document.querySelectorAll(".toolspop button.tool")]
      .filter((b) => /catch-?up/i.test(b.textContent || ""));
    return {
      views: views.map(txt), viewsVisible: views.filter(vis).length,
      catchup: cu.map(txt), catchupVisible: cu.filter(vis).length,
      allItems: [...document.querySelectorAll(".toolspop .tool")].map(txt),
    };
  });

  console.log(`  ..  popover items: ${JSON.stringify(sample.allItems)}`);
  assert("CONTROL — Views row renders (unconditional; no Catch-up bug can remove it)",
    sample.viewsVisible > 0, `${sample.viewsVisible} visible ${JSON.stringify(sample.views)}`);
  assert("SUBJECT — Catch-up item renders and is visible",
    sample.catchupVisible > 0, `${sample.catchupVisible} visible ${JSON.stringify(sample.catchup)}`);

  // ── Does it actually work? ───────────────────────────────────────────────
  if (sample.catchupVisible > 0) {
    await page.getByRole("button", { name: /catch-?up/i }).first().click();
    await page.waitForTimeout(1500);
    const viaClick = await page.evaluate(() => !!document.querySelector("[data-cu-close]"));
    assert("clicking Catch-up OPENS the modal", viaClick);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(900);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("catchup:toggle")));
    await page.waitForTimeout(1200);
    const viaEvent = await page.evaluate(() => !!document.querySelector("[data-cu-close]"));
    assert("the raw catchup:toggle window event has a live listener", viaEvent);
  }

  await context.close();
  await browser.close();

  const failed = checks.filter((c) => !c.cond);
  console.log(
    failed.length
      ? `\nFAILED — ${failed.length}/${checks.length}. If the CONTROL failed, suspect the probe before the app.`
      : `\nPASS — ${checks.length}/${checks.length}: Tools > Catch-up is reachable and works.`,
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nprobe crashed: ${e?.message ?? e}`);
  process.exit(1);
});
