// probe-tools-catchup.mjs — is the chrome Tools > Catch-up path dead on /weekly?
//
// WHY THE CONTROL MATTERS. The earlier "the popover renders zero items"
// observation was made with a bare `document.querySelectorAll("button.tool")`
// after a click, with nothing proving the popover had opened. That is an
// absence-assertion with no positive signal, and it FAILS OPEN: a click that
// never landed reads exactly like a UI that rendered nothing.
//
// ChromeToolsMenu's Views row is UNCONDITIONAL (a plain VIEWS.map, no gate),
// so it is a known-good control that no Catch-up bug could remove. Every count
// below is taken in ONE evaluation, and `aria-expanded` on the trigger is read
// in that same sample — so "the popover is open" is measured, never assumed.
//
//   views > 0 AND catchup absent → a real, specific regression
//   views == 0                   → the probe never saw the popover; not an app bug
//
// TREE PROVENANCE. This renders the WORKING TREE, not a commit. It prints the
// HEAD sha and whether the Tooltip files (which wrap the Tools trigger) are
// dirty, because a sibling lane's uncommitted Tooltip edit is a live confound
// for a Tooltip-wrapped trigger and would otherwise be invisible in the result.

import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3099";
const ROUTE = process.env.ROUTE ?? "/weekly";

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();

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
  await page.waitForTimeout(11000); // dev hydrate is 5–9s here

  // One sample: trigger state + control + subject, together.
  const sample = () =>
    page.evaluate(() => {
      const trigger = document.querySelector('button[aria-label="Tools"]');
      const pop = document.querySelector(".toolspop");
      const txt = (e) => (e.getAttribute("aria-label") || e.textContent || "").trim();
      return {
        triggerFound: !!trigger,
        ariaExpanded: trigger?.getAttribute("aria-expanded") ?? null,
        popoverInDom: !!pop,
        viewsLinks: [...document.querySelectorAll(".toolsrow-views .tool")].map(txt),
        allToolItems: [...document.querySelectorAll(".toolspop .tool")].map(txt),
        catchupButton: [...document.querySelectorAll(".toolspop button.tool")]
          .map(txt).filter((t) => /catch-?up/i.test(t)),
      };
    });

  console.log(`\n  before click: ${JSON.stringify(await sample())}`);

  const trigger = page.getByRole("button", { name: "Tools", exact: true }).first();
  console.log(`  trigger count: ${await trigger.count()}`);
  await trigger.click();
  await page.waitForTimeout(900);

  const after = await sample();
  console.log(`  after click:  ${JSON.stringify(after, null, 0)}`);

  console.log("\n  ── THE TWO NUMBERS ──");
  console.log(`  Views-row links : ${after.viewsLinks.length}   ${JSON.stringify(after.viewsLinks)}`);
  console.log(`  Catch-up button : ${after.catchupButton.length}   ${JSON.stringify(after.catchupButton)}`);
  console.log(`  aria-expanded   : ${after.ariaExpanded}`);

  let verdict;
  if (after.viewsLinks.length === 0) {
    verdict = "INSTRUMENT FAILURE — the probe never saw the popover. Not an app bug.";
  } else if (after.catchupButton.length === 0) {
    verdict = "REAL REGRESSION — Views render but Catch-up is absent.";
  } else {
    verdict = "PRESENT — both render. Testing whether the button actually works…";
    // Only meaningful if the button exists: does clicking it open the modal?
    await page.getByRole("button", { name: /catch-?up/i }).first().click();
    await page.waitForTimeout(1500);
    const modal = await page.evaluate(() => ({
      cuOpen: !!document.querySelector("[data-cu-close]"),
      lock: document.body.style.overflow,
    }));
    console.log(`  after clicking Catch-up: ${JSON.stringify(modal)}`);
    verdict += modal.cuOpen
      ? "\n  → modal OPENS. The path is healthy end to end."
      : "\n  → button exists but modal does NOT open: a real election/listener bug.";

    // Compare against the raw window event the dock dispatches.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("catchup:toggle")));
    await page.waitForTimeout(1200);
    const viaEvent = await page.evaluate(() => !!document.querySelector("[data-cu-close]"));
    console.log(`  raw catchup:toggle dispatch opens modal: ${viaEvent}`);
  }

  console.log(`\n  VERDICT: ${verdict}`);
  await context.close();
  await browser.close();
}

main().catch((e) => {
  console.error(`\nprobe crashed: ${e?.message ?? e}`);
  process.exit(1);
});
