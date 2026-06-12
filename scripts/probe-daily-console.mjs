// scripts/probe-daily-console.mjs — load /daily, open a lesson, dump every
// console error/warning and page error. Distinguishes a real client runtime
// error from the known dev-only linkedom/canvas webpack warning.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync(".env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3100";

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext();
const boot = await context.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(token)}&next=/daily`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await boot.waitForTimeout(1500);
await boot.close();

const page = await context.newPage();
const issues = [];
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning")
    issues.push(`[console.${m.type()}] ${m.text().slice(0, 4000)}`);
});
page.on("pageerror", (e) => issues.push(`[pageerror] ${e.message}`));
page.on("response", (r) => {
  if (r.status() >= 400) issues.push(`[http ${r.status()}] ${r.url()}`);
});

await page.setViewportSize({ width: 768, height: 1024 });
await page.goto(`${BASE}/daily`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(3000);
const row = page.locator('[data-planner-item^="lesson:"]').first();
const box = await row.boundingBox();
if (box) {
  await page.mouse.click(box.x + box.width * 0.4, box.y + 12);
  await page.waitForTimeout(2000);
}
await browser.close();
console.log(issues.length ? issues.join("\n") : "NO CONSOLE ISSUES");

// Exit nonzero on anything not known-benign, so the probe is safe to reuse
// as a regression gate. Known-benign: the dev-only linkedom/canvas webpack
// warning, and 404s for external fixture thumbnails (img.youtube.com).
const benign = (s) =>
  s.includes("Can't resolve 'canvas'") ||
  (s.startsWith("[http 4") && s.includes("img.youtube.com")) ||
  (s.startsWith("[console.error] Failed to load resource") &&
    issues.some(
      (i) => i.startsWith("[http 4") && i.includes("img.youtube.com"),
    ));
const blocking = issues.filter((s) => !benign(s));
if (!box) {
  console.log("FAIL  no lesson row found — page never rendered lessons");
  process.exitCode = 1;
} else if (blocking.length > 0) {
  console.log(`FAIL  ${blocking.length} non-benign console issue(s)`);
  process.exitCode = 1;
}
