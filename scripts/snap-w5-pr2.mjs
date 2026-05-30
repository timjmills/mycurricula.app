// scripts/snap-w5-pr2.mjs — PR #2 verification snapshots.
// Weekly + Daily at phone/tablet/desktop, plus Weekly/Year print pages.
// Reads CLAUDE_BYPASS_TOKEN from .env.local; uses the Chrome channel.

import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function tokenFromEnvLocal() {
  if (process.env.CLAUDE_BYPASS_TOKEN) return process.env.CLAUDE_BYPASS_TOKEN;
  const txt = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const m = txt.match(/CLAUDE_BYPASS_TOKEN\s*=\s*"?([^"\r\n]+)"?/);
  if (!m) throw new Error("CLAUDE_BYPASS_TOKEN not found in .env.local");
  return m[1].trim();
}

const TOKEN = tokenFromEnvLocal();
const BASE = process.env.PROBE_BASE ?? "http://localhost:3001";
const OUT_DIR = resolve(process.cwd(), "docs/screenshots/w5-pr2");
mkdirSync(OUT_DIR, { recursive: true });

const TIERS = [
  { name: "phone", width: 400, height: 850 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 900 },
];
const VIEW_ROUTES = [
  ["weekly", "/weekly"],
  ["daily", "/daily"],
];
const PRINT_ROUTES = [
  ["weekly-print", "/weekly/print"],
  ["year-print", "/year/print"],
];

const browser = await chromium.launch({ channel: "chrome" });

async function seed(ctx) {
  const p = await ctx.newPage();
  await p.goto(
    `${BASE}/api/claude-access?token=${encodeURIComponent(TOKEN)}&redirect=/weekly`,
    { waitUntil: "networkidle" },
  );
  await p.close();
}

async function shoot(ctx, name, path, tierName, full) {
  const page = await ctx.newPage();
  console.log(`-> ${name} @ ${tierName}`);
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForLoadState("networkidle", { timeout: 20000 });
  } catch {}
  await page.waitForTimeout(700);
  const out = resolve(OUT_DIR, `${name}__${tierName}.png`);
  await page.screenshot({ path: out, fullPage: full });
  console.log(`   saved ${out}`);
  await page.close();
}

// Responsive view tiers
for (const tier of TIERS) {
  const ctx = await browser.newContext({
    viewport: { width: tier.width, height: tier.height },
  });
  await seed(ctx);
  for (const [name, path] of VIEW_ROUTES) {
    await shoot(ctx, name, path, tier.name, false);
  }
  await ctx.close();
}

// Print pages — desktop width, full page, emulate print media for B&W check
{
  const ctx = await browser.newContext({
    viewport: { width: 1100, height: 1400 },
  });
  await seed(ctx);
  for (const [name, path] of PRINT_ROUTES) {
    const page = await ctx.newPage();
    await page.emulateMedia({ media: "print" });
    console.log(`-> ${name} @ print-media`);
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForLoadState("networkidle", { timeout: 20000 });
    } catch {}
    await page.waitForTimeout(700);
    const out = resolve(OUT_DIR, `${name}__print.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log(`   saved ${out}`);
    await page.close();
  }
  await ctx.close();
}

await browser.close();
console.log("done");
