// scripts/smoke-resource-embeds.mjs — live smoke test for the 6 seeded
// resource embed fixtures on production.
//
// For each fixture lesson:
//   • Deep-link to /daily?lesson=<id> (V5 jump-to-lesson fix carries the
//     teacher to the correct week + day).
//   • Wait for the LessonDetail to render.
//   • Count <iframe>, <img>, and <video>/<audio> elements that point at
//     known embed-provider hosts so we know the kind-switched renderer
//     actually fired for that provider.
//   • Capture a screenshot per fixture.
//
// Report per-provider OK / FAIL + the embed counts.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN not set");
  process.exit(1);
}

const BASE = process.env.PROBE_BASE ?? "https://mycurricula.app";
const OUT_DIR = path.resolve("docs/screenshots/uxa-2026-05-27/smoke-embeds");
await mkdir(OUT_DIR, { recursive: true });

const FIXTURES = [
  {
    id: "m-11-1",
    provider: "gslides",
    hostMatch: /docs\.google\.com\/presentation/,
    expected: "iframe",
  },
  {
    id: "w-11-3",
    provider: "gdrive",
    hostMatch: /drive\.google\.com\/file/,
    expected: "iframe",
  },
  {
    id: "m-12-0",
    provider: "youtube",
    hostMatch: /youtube-nocookie\.com|youtube\.com\/embed/,
    expected: "iframe",
  },
  {
    id: "m-12-1",
    provider: "vimeo",
    hostMatch: /player\.vimeo\.com/,
    expected: "iframe",
  },
  {
    id: "r-12-0",
    provider: "gdocs",
    hostMatch: /docs\.google\.com\/document/,
    expected: "iframe",
  },
  {
    id: "e-12-0",
    provider: "image",
    hostMatch: /upload\.wikimedia\.org/,
    expected: "img",
  },
];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});

const boot = await context.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/daily`,
  { waitUntil: "domcontentloaded", timeout: 90000 },
);
await boot.waitForTimeout(2000);
await boot.close();

const results = [];

for (const fx of FIXTURES) {
  const page = await context.newPage();
  let outcome = "fail";
  let hits = 0;
  let extra = "";
  try {
    await page.goto(`${BASE}/daily?lesson=${fx.id}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    // Allow time for hydration + embed iframe/img to mount.
    await page.waitForTimeout(3500);

    // Count matching elements.
    hits = await page.evaluate(
      ({ pattern, tag }) => {
        const re = new RegExp(pattern);
        const nodes = document.querySelectorAll(tag);
        let n = 0;
        nodes.forEach((el) => {
          const src = el.getAttribute("src") ?? "";
          if (re.test(src)) n++;
        });
        return n;
      },
      { pattern: fx.hostMatch.source, tag: fx.expected },
    );
    outcome = hits >= 1 ? "ok" : "fail";
    extra = hits === 0 ? `no ${fx.expected} matched ${fx.hostMatch}` : "";

    const shot = path.join(OUT_DIR, `${fx.provider}__${fx.id}.png`);
    await page.screenshot({ path: shot, fullPage: false });
  } catch (e) {
    extra = `nav-error: ${e.message.slice(0, 200)}`;
  }
  results.push({ ...fx, outcome, hits, extra });
  await page.close();
}

await browser.close();

// Report
console.log(`\nSmoke A — URL embed fixtures on ${BASE}`);
console.log(`Screenshots: ${OUT_DIR}\n`);
console.log(
  "provider".padEnd(10),
  "id".padEnd(10),
  "outcome".padEnd(9),
  "hits".padEnd(5),
  "extra",
);
console.log("-".repeat(80));
let okCount = 0;
for (const r of results) {
  if (r.outcome === "ok") okCount++;
  console.log(
    r.provider.padEnd(10),
    r.id.padEnd(10),
    r.outcome.padEnd(9),
    String(r.hits).padEnd(5),
    r.extra,
  );
}
console.log(`\n${okCount} / ${FIXTURES.length} providers rendering as embeds.`);
process.exit(okCount === FIXTURES.length ? 0 : 1);
