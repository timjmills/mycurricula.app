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
p.on("console", (m) => {
  const t = m.type();
  if (t === "error" || t === "warning") {
    console.log(`[${t}]`, m.text().slice(0, 300));
  }
});
await p.goto(`${BASE}/settings/curriculum`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await p.waitForTimeout(2500);

const html = await p.evaluate(() => {
  // Walk up 6 levels from each h2 to capture the card root.
  const h2s = Array.from(document.querySelectorAll("h2"));
  return h2s.map((h) => {
    let node = h;
    for (let i = 0; i < 6; i++) {
      if (node.parentElement) node = node.parentElement;
      else break;
    }
    return {
      title: h.textContent,
      html: node.outerHTML.slice(0, 5000),
    };
  });
});
for (const section of html) {
  console.log("==", section.title, "==");
  console.log(section.html);
  console.log();
}

await browser.close();
