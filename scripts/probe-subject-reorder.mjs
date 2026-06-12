// scripts/probe-subject-reorder.mjs — verify the Weekly subject-row reorder.
//
// Confirms:
//   1. Clicking a subject row's "move down" button reorders the rows.
//   2. The new order PERSISTS across a full reload (localStorage).
//   3. The lesson grid still renders and a lesson card is still draggable
//      (i.e. the move-buttons did not break the lesson DnD context).
//   4. No document-level horizontal scroll at 400 / 768 / 1280.
//
// Usage:  CLAUDE_BYPASS_TOKEN=… node scripts/probe-subject-reorder.mjs
// Reads the token from the env (load .env.local first).

import { chromium } from "playwright";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN not set");
  process.exit(1);
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";

function log(ok, msg) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
  return ok;
}

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext();
let allOk = true;

try {
  // Bootstrap the bypass cookie.
  const boot = await context.newPage();
  await boot.goto(
    `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/weekly`,
    { waitUntil: "domcontentloaded", timeout: 60000 },
  );
  await boot.waitForTimeout(1500);
  await boot.close();

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/weekly`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(2000);

  // Read the rendered subject-row order via the subject name labels.
  async function readOrder() {
    return page.$$eval('[class*="subjectName"]', (els) =>
      els.map((e) => e.textContent.trim()),
    );
  }

  const before = await readOrder();
  allOk =
    log(
      before.length >= 8,
      `subject rows render (${before.length} rows): ${before.join(", ")}`,
    ) && allOk;

  // Move the FIRST subject down one slot. The buttons reveal on row hover
  // (desktop path), so hover the label cell first, then click WITHOUT force —
  // this exercises the real reveal-then-click flow a teacher uses, and would
  // fail (not silently force through) if the reveal regressed.
  const firstName = before[0];
  const firstHead = page
    .locator(`[class*="subjectHead"]`, { hasText: firstName })
    .first();
  await firstHead.hover();
  await page.waitForTimeout(200);
  const downBtn = page
    .locator(`button[aria-label="Move ${firstName} row down"]`)
    .first();
  await downBtn.click();
  await page.waitForTimeout(400);

  const after = await readOrder();
  const moved = after[1] === firstName && after[0] === before[1];
  allOk = log(moved, `move-down reordered rows: ${after.join(", ")}`) && allOk;

  // Reload — the order must persist (localStorage).
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  const afterReload = await readOrder();
  const persisted = JSON.stringify(afterReload) === JSON.stringify(after);
  allOk =
    log(
      persisted,
      `order persisted across reload: ${afterReload.join(", ")}`,
    ) && allOk;

  // Lesson grid still intact: at least one lesson card with a drag handle.
  const lessonCount = await page
    .locator('[data-planner-item^="lesson:"]')
    .count();
  allOk =
    log(lessonCount > 0, `lesson cards still render (${lessonCount})`) && allOk;

  // Lesson DnD still mounted: dnd-kit's useDraggable sets
  // aria-roledescription="draggable" on every draggable lesson, so a positive
  // count proves the lesson drag affordances survived adding the move buttons.
  // (Strict assertion — `> 0`, not the previous vacuous `>= 0`.)
  const dragHandles = await page
    .locator('[aria-roledescription="draggable"]')
    .count();
  allOk =
    log(
      dragHandles > 0,
      `lesson drag affordances present (draggable elements: ${dragHandles})`,
    ) && allOk;

  // Horizontal-scroll check at three tiers.
  for (const w of [400, 768, 1280]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(500);
    const overflow = await page.evaluate(() => {
      const de = document.documentElement;
      return {
        scrollW: de.scrollWidth,
        clientW: de.clientWidth,
      };
    });
    const noHScroll = overflow.scrollW <= overflow.clientW + 1;
    allOk =
      log(
        noHScroll,
        `no document h-scroll @${w}px (scrollW=${overflow.scrollW}, clientW=${overflow.clientW})`,
      ) && allOk;
  }
} catch (err) {
  console.error("PROBE ERROR:", err.message);
  allOk = false;
} finally {
  await browser.close();
}

console.log(allOk ? "\nALL CHECKS PASSED" : "\nSOME CHECKS FAILED");
process.exit(allOk ? 0 : 1);
