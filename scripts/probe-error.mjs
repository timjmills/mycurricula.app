import { chromium } from "playwright";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const BASE = "http://localhost:3000";
const browser = await chromium.launch();
const context = await browser.newContext();

const boot = await context.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/settings/curriculum`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await boot.waitForTimeout(1500);
await boot.close();

const p = await context.newPage();
p.on("pageerror", (e) => console.log("[PE]", e.message));
p.on("console", (m) => {
  const t = m.type();
  console.log(`[${t}]`, m.text().slice(0, 500));
});
p.on("requestfailed", (req) =>
  console.log("[reqfail]", req.url(), req.failure()?.errorText),
);
await p.goto(`${BASE}/settings/curriculum`, {
  waitUntil: "networkidle",
  timeout: 60000,
});
await p.waitForTimeout(3000);

await browser.close();
