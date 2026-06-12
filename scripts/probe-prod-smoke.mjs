// scripts/probe-prod-smoke.mjs — READ-ONLY production smoke after a /daily
// deploy: login via the bypass, load /daily, open a lesson's detail, check
// console + HTTP health, screenshot. NO mutating interactions — this runs
// against the live teacher account.
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync(".env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}
const BASE = "https://mycurricula.app";
const OUT = path.resolve(process.cwd(), "docs/screenshots/daily-verify/prod");
mkdirSync(OUT, { recursive: true });

let failures = 0;
function log(ok, msg) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
}
const info = (msg) => console.log(`INFO  ${msg}`);

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext();
const page = await context.newPage();
const issues = [];
page.on("pageerror", (e) => issues.push(`[pageerror] ${e.message.slice(0, 200)}`));
page.on("console", (m) => {
  if (m.type() === "error") issues.push(`[console.error] ${m.text().slice(0, 200)}`);
});
page.on("response", (r) => {
  if (r.status() >= 500) issues.push(`[http ${r.status()}] ${r.url()}`);
});

await page.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(token)}&next=/daily`,
  { waitUntil: "domcontentloaded", timeout: 90000 },
);
await page.waitForTimeout(4000);
info(`landed on: ${page.url()}`);
log(page.url().includes("/daily"), "bypass login landed on /daily");

await page.setViewportSize({ width: 1440, height: 900 });
// Prod hydration (listLessons + section batch over the network) outlives a
// fixed sleep — wait for the first lesson row, walking weekday pills if the
// landing day is empty (today may be a non-school day).
await page
  .locator('[data-planner-item^="lesson:"]')
  .first()
  .waitFor({ state: "visible", timeout: 30000 })
  .catch(() => {});
if ((await page.locator('[data-planner-item^="lesson:"]').count()) === 0) {
  const pills = page.getByRole("button", { name: /^(sun|mon|tue|wed|thu)/i });
  const n = await pills.count();
  for (let i = 0; i < n; i++) {
    await pills.nth(i).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1200);
    if ((await page.locator('[data-planner-item^="lesson:"]').count()) > 0)
      break;
  }
}
const lessons = await page.locator('[data-planner-item^="lesson:"]').count();
log(lessons > 0, `prod lessons render (${lessons} rows — live Supabase data)`);
await page.screenshot({ path: path.join(OUT, "prod-daily.png") });

// Open the first lesson's detail (selection only — not persisted content).
const row = page.locator('[data-planner-item^="lesson:"]').first();
const box = await row.boundingBox();
if (box) {
  await page.mouse.click(box.x + box.width * 0.4, box.y + 12);
  await page.waitForTimeout(2500);
}
log(
  (await page.locator('nav[aria-label="Lesson phases"]').count()) === 1,
  "agenda navigator renders on prod",
);
log(
  (await page.locator('[aria-label="Lesson planning"]').count()) >= 1,
  "planning tabs render on prod",
);
log(
  (await page
    .locator('[role="toolbar"][aria-label="Text formatting"]')
    .count()) === 1,
  "sticky toolbar renders on prod",
);
const chips = await page.locator('button[aria-label^="Phase status:"]').count();
info(`phase status chips present: ${chips}`);
await page.screenshot({ path: path.join(OUT, "prod-daily-detail.png") });

const benign = (s) => s.includes("img.youtube.com");
const blocking = issues.filter((s) => !benign(s));
for (const i of issues) info(i);
log(blocking.length === 0, `no non-benign console/page/5xx issues (${blocking.length})`);

await browser.close();
console.log(failures === 0 ? "\nPROD SMOKE PASSED" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
