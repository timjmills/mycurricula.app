// scripts/probe-daily-band-width.mjs — reproduce the two reported issues:
//   1. lesson-band time clipping (measure band vs bandRight/bandTime edges
//      and the title's computed flex at several center-column widths)
//   2. phase cards not tracking the panel width (measure .phase width vs
//      the detail column width, wide AND narrow)
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync(".env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3100";
const OUT = path.resolve(process.cwd(), "docs/screenshots/daily-verify/band");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext();
const boot = await context.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(token)}&next=/daily`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await boot.waitForTimeout(2000);
await boot.close();

const page = await context.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/daily`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(2500);
const row = page.locator('[data-planner-item^="lesson:"]').first();
const rbox = await row.boundingBox();
await page.mouse.click(rbox.x + rbox.width * 0.4, rbox.y + 12);
await page.waitForTimeout(1500);

async function measure(label) {
  const m = await page.evaluate(() => {
    const band = document.querySelector('[class*="band__"], [class*="_band_"]');
    const root = band?.closest('[class*="root"]');
    const right = document.querySelector('[class*="bandRight"]');
    const time = document.querySelector('[class*="bandTime"]');
    const title = document.querySelector('[class*="bandTitle"]');
    const icons = document.querySelector('[class*="bandIcons"]');
    const col = document.querySelector('[class*="column"]');
    const phase = document.querySelector('[class*="lesson-flow_phase__"]');
    const flowWrap = document.querySelector('[class*="flowWrap"]');
    const workspace = document.querySelector('[class*="workspace"]');
    const r = (e) => {
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return {
        l: Math.round(b.left),
        rgt: Math.round(b.right),
        w: Math.round(b.width),
      };
    };
    const cs = title ? getComputedStyle(title) : null;
    return {
      band: r(band),
      bandRight: r(right),
      time: r(time),
      timeText: time?.textContent ?? null,
      icons: r(icons),
      title: r(title),
      titleFlex: cs
        ? `${cs.flexGrow}/${cs.flexShrink}/${cs.flexBasis} minw=${cs.minWidth}`
        : null,
      column: r(col),
      columnMaxW: col ? getComputedStyle(col).maxWidth : null,
      workspace: r(workspace),
      flowWrap: r(flowWrap),
      phase: r(phase),
    };
  });
  console.log(`\n=== ${label} ===`);
  console.log(JSON.stringify(m, null, 1));
  const clipped =
    m.band &&
    m.bandRight &&
    (m.bandRight.rgt > m.band.rgt - 2 ||
      (m.time && m.time.rgt > m.band.rgt - 2));
  console.log(
    `time clipped vs band edge: ${clipped} (band right ${m.band?.rgt}, time right ${m.time?.rgt}, icons right ${m.icons?.rgt})`,
  );
  return m;
}

// Helper: set the center column ratio via the dock api (write --w like the
// splitter would) — simplest cross-width driver is dragging the splitter.
async function dragCenterTo(deltaPx) {
  const sep = page.locator('[role="separator"][data-on="true"]').first();
  const box = await sep.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const steps = Math.abs(Math.round(deltaPx / 10));
  for (let i = 1; i <= steps; i++)
    await page.mouse.move(
      box.x + box.width / 2 + Math.sign(deltaPx) * i * 10,
      box.y + box.height / 2,
      { steps: 2 },
    );
  await page.mouse.up();
  await page.waitForTimeout(400);
}

let failures = 0;
function assert(ok, msg) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
}
const timeVisible = (m) =>
  m.band && m.time && m.time.rgt <= m.band.rgt - 1 && m.time.l >= m.band.l;

const def = await measure("default layout (1440 viewport)");
await page.screenshot({ path: path.join(OUT, "band-default.png") });
assert(timeVisible(def), "default: time fully inside the band");

// Narrow the center column hard.
await dragCenterTo(220);
const narrow = await measure("center narrowed (~220px taken)");
await page.screenshot({ path: path.join(OUT, "band-narrow.png") });
assert(timeVisible(narrow), "narrowed: time fully inside the band");
assert(
  narrow.phase.w < def.phase.w - 40,
  `phases SHRINK with the panel (${def.phase.w} → ${narrow.phase.w})`,
);

// Slam the center to its minimum (multiple hard drags).
await dragCenterTo(300);
await dragCenterTo(300);
const min = await measure("center at MINIMUM width");
await page.screenshot({ path: path.join(OUT, "band-min.png") });
assert(
  timeVisible(min),
  "minimum: time fully inside the band (wraps, never clips)",
);

// Widen far past the old 760px cap.
await dragCenterTo(-900);
const wide = await measure("center widened to maximum");
await page.screenshot({ path: path.join(OUT, "band-wide.png") });
assert(timeVisible(wide), "widened: time fully inside the band");
assert(
  wide.phase.w > def.phase.w + 60,
  `phases GROW with the panel — the 760px cap is gone (${def.phase.w} → ${wide.phase.w})`,
);

await browser.close();
console.log(
  failures === 0 ? "\nALL BAND/WIDTH CHECKS PASSED" : `\n${failures} FAILURES`,
);
process.exit(failures === 0 ? 0 : 1);
