// Real-gesture check: move the mouse in from OUTSIDE the card to a point on the
// unit title, then CLICK. Records which control actually received the click.
// This is the state a mouse-driven hybrid user clicks in — hover is already
// live by the time the button goes down.
import { chromium } from "playwright";
import { bypassLogin, requireToken } from "./lib/auth.mjs";

const REPO = process.cwd();
requireToken({ repoRoot: REPO });
const BASE = "http://localhost:3010";

const browser = await chromium.launch({
  channel: "chrome",
  args: [
    "--blink-settings=availablePointerTypes=6,primaryPointerType=4,availableHoverTypes=2,primaryHoverType=2",
  ],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("mycurricula:onboarding", JSON.stringify({ stepIndex: 0, finished: true }));
    localStorage.setItem("mycurricula:user:theme-frame", "paper");
    localStorage.setItem("mycurricula:user:theme-bg", "wash");
    localStorage.setItem("mycurricula:user:theme", "clear");
  } catch {}
});
await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
await bypassLogin(ctx, { base: BASE, next: "/year", timeout: 240000, repoRoot: REPO });
const page = await ctx.newPage();
const consoleIssues = [];
const redactUrl = (u) => String(u).replace(/[?&]token=[^&]*/g, "?token=<redacted>").slice(0, 120);
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") consoleIssues.push(`[${m.type()}] ${m.text().slice(0, 160)}`);
});
page.on("requestfailed", (r) => consoleIssues.push(`[requestfailed] ${redactUrl(r.url())}`));
page.on("pageerror", (e) => consoleIssues.push(`[pageerror] ${String(e.message).slice(0, 160)}`));
await page.goto(`${BASE}/year`, { waitUntil: "domcontentloaded", timeout: 240000 });

// readiness by response
for (let t = 0; t < 60; t++) {
  const n = await page.locator("[data-year-unit-workspace]").count();
  if (n) {
    await page.mouse.move(2, 2);
    await page.waitForTimeout(300);
    const a = await page.locator("[data-year-unit-workspace]").first().evaluate((el) => getComputedStyle(el).opacity);
    await page.locator('[class*="unode"]').first().hover().catch(() => {});
    await page.waitForTimeout(300);
    const b = await page.locator("[data-year-unit-workspace]").first().evaluate((el) => getComputedStyle(el).opacity);
    if (a !== b) break;
  }
  await page.waitForTimeout(1000);
}
await page.mouse.move(2, 2);
await page.waitForTimeout(300);

await page.evaluate(() => {
  window.__clicks = [];
  document.addEventListener(
    "click",
    (e) => {
      const el = e.target;
      const opener = el?.closest?.("[data-year-unit-workspace]");
      const btn = el?.closest?.("button");
      window.__clicks.push({
        onOpener: !!opener,
        label: btn?.getAttribute("aria-label") ?? btn?.getAttribute("title") ?? btn?.textContent?.slice(0, 40) ?? "none",
      });
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
});

const offsets = [2, 4, 6, 8, 10, 12, 16, 24];
const results = [];
for (const off of offsets) {
  const pt = await page.evaluate((o) => {
    const el = document.querySelectorAll("[data-year-unit-workspace]")[0];
    const unode = el.closest('[class*="unode"]');
    unode.scrollIntoView({ block: "center", behavior: "instant" });
    const drill = Array.from(unode.querySelectorAll("button")).find(
      (b) => !b.hasAttribute("data-year-unit-workspace"),
    );
    const un = drill.firstElementChild;
    const cr = el.getBoundingClientRect();
    const tr = un.getBoundingClientRect();
    const ur = unode.getBoundingClientRect();
    return {
      x: Math.round(cr.left - o),
      y: Math.round(tr.top + tr.height / 2),
      approachX: Math.round(ur.left + 4),
      approachY: Math.round(ur.bottom - 4),
      titleText: un.textContent,
      chipLeft: Math.round(cr.left),
      titleLeft: Math.round(tr.left),
      titleRight: Math.round(tr.right),
    };
  }, off);
  // Approach from outside the card, then glide in — a real pointer path.
  await page.mouse.move(pt.approachX - 40, pt.approachY + 40);
  await page.waitForTimeout(120);
  await page.mouse.move(pt.approachX, pt.approachY);
  await page.waitForTimeout(150);
  await page.mouse.move(pt.x, pt.y);
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(150);
  const clicks = await page.evaluate(() => {
    const c = window.__clicks.slice();
    window.__clicks = [];
    return c;
  });
  results.push({ offsetLeftOfChip: off, x: pt.x, ...(clicks[0] ?? { onOpener: null, label: "NO CLICK" }), titleText: pt.titleText, chipLeft: pt.chipLeft, titleSpan: `${pt.titleLeft}-${pt.titleRight}` });
}

console.log("\nREAL MOUSE CLICK on the unit title, hybrid @1280, post-fix");
console.log(`title "${results[0].titleText}" spans x ${results[0].titleSpan}; visible chip left edge x=${results[0].chipLeft}\n`);
for (const r of results) {
  console.log(
    `  ${String(r.offsetLeftOfChip).padStart(2)}px left of the visible chip (x=${r.x}) → ${r.onOpener ? "OPENER (workspace)" : "drill"}  [${r.label}]`,
  );
}
console.log(`\nbrowser console during the run: ${consoleIssues.length} error/warning line(s)`);
for (const c of [...new Set(consoleIssues)].slice(0, 15)) console.log(`  ${c}`);
await browser.close();
