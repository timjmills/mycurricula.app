// Keyboard reachability + focus visibility probe.
import { chromium } from "playwright";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const BASE = "http://localhost:3020";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();

const boot = await ctx.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/settings/curriculum`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await boot.waitForTimeout(1500);
await boot.evaluate(() => {
  // Seed a holiday so the remove button shows up.
  localStorage.setItem(
    "mycurricula:team:holidays",
    JSON.stringify([{ id: "h1", date: "2026-01-19", name: "Test" }]),
  );
});
await boot.close();

const p = await ctx.newPage();
await p.setViewportSize({ width: 1280, height: 900 });
await p.goto(`${BASE}/settings/curriculum`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await p.waitForSelector("#holiday-date", { timeout: 30000 });
await p.waitForTimeout(500);

// Tab through all controls and capture each focused element with its
// computed focus ring.
const focused = [];
await p.locator("#curriculum-label").focus();
for (let i = 0; i < 30; i++) {
  const info = await p.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    return {
      tag: el.tagName,
      id: el.id || null,
      aria: el.getAttribute("aria-label"),
      visibleText: (el.textContent ?? "").trim().slice(0, 40),
      outline: cs.outline,
      outlineWidth: cs.outlineWidth,
      outlineOffset: cs.outlineOffset,
      hasFocusRing: !!cs.outline && cs.outlineWidth !== "0px" && cs.outline !== "none",
    };
  });
  focused.push(info);
  await p.keyboard.press("Tab");
  await p.waitForTimeout(50);
}

for (const f of focused) {
  if (!f) {
    console.log("  (null)");
    continue;
  }
  const mark = f.hasFocusRing ? "FOCUS" : "no-ring";
  console.log(
    `  [${mark}] ${f.tag}${f.id ? "#" + f.id : ""} ${f.aria ?? f.visibleText.slice(0, 30)}`,
  );
}

const noRing = focused.filter((f) => f && !f.hasFocusRing);
console.log(`\nTotal focused: ${focused.filter(Boolean).length}, no-ring: ${noRing.length}`);

await browser.close();
