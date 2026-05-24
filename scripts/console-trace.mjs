// scripts/console-trace.mjs — capture detailed console + network failures
// for a single route, including stack traces.

import { chromium } from "playwright";

const BASE = process.env.RESPONSIVE_CHECK_BASE ?? "http://localhost:3000";
const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
const PATH = process.env.AUDIT_PATH ?? "/weekly";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();

const consoleMsgs = [];
const failedRequests = [];
const pageErrors = [];

page.on("console", (msg) => {
  if (msg.type() === "error" || msg.type() === "warning") {
    consoleMsgs.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
    });
  }
});
page.on("requestfailed", (req) => {
  failedRequests.push({
    url: req.url(),
    method: req.method(),
    failure: req.failure()?.errorText,
    resourceType: req.resourceType(),
  });
});
page.on("pageerror", (err) => {
  pageErrors.push({ message: err.message, stack: err.stack?.slice(0, 500) });
});

// Seed via bypass.
await page.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=${encodeURIComponent(PATH)}`,
  { waitUntil: "networkidle" },
);
await page.waitForTimeout(3000);

console.log("=== CONSOLE ERRORS / WARNINGS ===");
for (const m of consoleMsgs.slice(0, 15)) {
  const text = m.text.slice(0, 2000).replace(/\s+/g, " ");
  const loc = m.location?.url ? `  @ ${m.location.url.slice(-80)}:${m.location.lineNumber}` : "";
  console.log(`[${m.type}] ${text}${loc}`);
}

console.log("\n=== FAILED NETWORK REQUESTS ===");
for (const r of failedRequests.slice(0, 10)) {
  console.log(`${r.method} ${r.url}  → ${r.failure} (${r.resourceType})`);
}

console.log("\n=== PAGE ERRORS ===");
for (const e of pageErrors.slice(0, 5)) {
  console.log(e.message);
  if (e.stack) console.log(e.stack);
}

await browser.close();
