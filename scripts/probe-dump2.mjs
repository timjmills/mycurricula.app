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
p.on("pageerror", (e) => console.log("[pageerror]", e.message));
await p.goto(`${BASE}/settings/curriculum`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await p.waitForTimeout(2500);

const cards = await p.evaluate(() => {
  const out = [];
  for (const card of document.querySelectorAll("[class*='Card_card__']")) {
    const h2 = card.querySelector("h2");
    const body = card.querySelector("[class*='Card_body__']");
    const inputs = body
      ? Array.from(body.querySelectorAll("input, select, textarea, button"))
          .map((el) => `${el.tagName}${el.id ? "#" + el.id : ""}${el.type ? "[" + el.type + "]" : ""}`)
      : [];
    const formAction = card.querySelector("[class*='holidayForm']");
    out.push({
      title: h2?.textContent ?? "(no h2)",
      inputCount: inputs.length,
      inputs: inputs.slice(0, 12),
      hasHolidayForm: !!formAction,
    });
  }
  return out;
});

console.log(JSON.stringify(cards, null, 2));

// Now also try clicking on the page near "Academic year dates" to see if a popover or anything appears.
await browser.close();
