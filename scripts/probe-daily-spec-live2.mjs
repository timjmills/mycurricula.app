// scripts/probe-daily-spec-live2.mjs — round 2: the items round 1 could not
// verify due to probe mechanics (hover-revealed controls, role="status"
// clock shadowing the toast), plus pin toggle, dbl-click-tab collapse, and
// a drag-to-dock attempt.
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync(".env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3100";
const OUT = path.resolve(process.cwd(), "docs/screenshots/daily-verify/spec");
mkdirSync(OUT, { recursive: true });

let failures = 0;
function log(ok, msg) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`);
}
const info = (msg) => console.log(`INFO  ${msg}`);
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    failures++;
    console.log(`FAIL  ${name} — threw: ${String(e).slice(0, 180)}`);
  }
}

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
await page.waitForTimeout(1200);

const slot = (k) => page.locator(`[data-slot="${k}"]`);
const collapsed = async (k) =>
  (await slot(k).getAttribute("data-collapsed")) === "true";

// ── A. "[" guard while typing in a rich-text editor ────────────────────────
await step("[ guard in contenteditable", async () => {
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.click();
  const before = await collapsed("left");
  await page.keyboard.press("[");
  await page.waitForTimeout(350);
  log(
    (await collapsed("left")) === before,
    '"[" ignored while typing in an editor',
  );
  // clean any '[' typed into the editor
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Escape").catch(() => {});
  await page.locator("body").click({ position: { x: 5, y: 400 } });
});

// ── B. Minutes edit via the "Planned length" chip ───────────────────────────
await step("minutes edit + empty-minutes hiding", async () => {
  const phase = page.locator("[data-flow-section]").first();
  await phase.hover();
  const lenChip = phase.locator('[aria-label^="Planned length:"]').first();
  log((await lenChip.count()) === 1, 'phase shows a "Planned length" chip');
  await lenChip.click();
  const minInput = phase
    .locator('input[aria-label^="Phase length in minutes"]')
    .first();
  await minInput.waitFor({ state: "visible", timeout: 5000 });
  await page.keyboard.press("Control+a");
  await page.keyboard.type("25");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const nav = page.locator('nav[aria-label="Lesson phases"]');
  log(
    (await nav.textContent()).includes("25 min"),
    'minutes edit shows "25 min" in navigator',
  );

  await phase.hover();
  await lenChip.click();
  await minInput.waitFor({ state: "visible", timeout: 5000 });
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const item1 = nav.locator('[aria-label^="Phase 1"]').first();
  const t = (await item1.textContent()).trim();
  log(
    !/\bmin\b|·/.test(t.slice(1)),
    `empty minutes hides the time line ("${t.slice(0, 30)}")`,
  );

  // Restore — minutes is null now, so the way back is the "+ min" ghost.
  await phase.hover();
  await phase.locator('button[aria-label^="No planned length"]').click();
  await minInput.waitFor({ state: "visible", timeout: 5000 });
  await page.keyboard.type("10");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
});

// ── C. Phase rename (hover-revealed control) ────────────────────────────────
await step("phase rename", async () => {
  const phase = page.locator("[data-flow-section]").first();
  await phase.hover();
  await page.waitForTimeout(300);
  const rename = phase.locator('[aria-label^="Rename phase:"]').first();
  const visible = await rename.isVisible().catch(() => false);
  info(`rename control visible after hover: ${visible}`);
  if (!visible) {
    // try double-click on the title per the prototype behavior
    const title = phase.locator("[data-flow-title], h3, h4").first();
    await title.dblclick().catch(() => {});
  } else {
    await rename.click();
  }
  await page.waitForTimeout(300);
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Probe Renamed Phase");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  const nav = page.locator('nav[aria-label="Lesson phases"]');
  log(
    (await nav.textContent()).includes("Probe Renamed Phase"),
    "rename reflects in the agenda navigator",
  );
});

// ── D. Rail icon click re-expands + activates; chat dot ────────────────────
await step("rail icon re-expand", async () => {
  const collapseBtn = slot("right")
    .locator('button[aria-label^="Collapse column"]')
    .first();
  await collapseBtn.click();
  await page.waitForTimeout(500);
  log(await collapsed("right"), "right column collapsed");
  const chatDot = await slot("right")
    .locator('button[aria-label*="new activity"]')
    .count();
  log(chatDot >= 1, "chat rail icon advertises unread activity");
  const todo = slot("right")
    .locator('button[aria-label^="Open To-do"]:visible')
    .first();
  await todo.click();
  await page.waitForTimeout(600);
  log(!(await collapsed("right")), "clicking the To-do rail icon re-expands");
  const activeNow = await slot("right")
    .locator('[role="tab"][aria-selected="true"]')
    .allTextContents()
    .catch(() => []);
  info(`active inner tab now: ${JSON.stringify(activeNow)}`);
  log(
    activeNow.some((t) => /to-?do/i.test(t)),
    "To-do inner tab activated by the rail icon",
  );
});

// ── E. Pin toggle + dbl-click tab collapse ──────────────────────────────────
await step("pin toggle + dblclick-tab collapse", async () => {
  const pin = slot("right")
    .locator(
      'button[aria-label="Unpin column"], button[aria-label="Pin column open"]',
    )
    .first();
  const before = await slot("right").getAttribute("data-pinned");
  await pin.click();
  await page.waitForTimeout(500);
  const after = await slot("right").getAttribute("data-pinned");
  log(
    before !== after,
    `pin button toggles data-pinned (${before} → ${after})`,
  );
  await page.screenshot({ path: path.join(OUT, "right-unpinned.png") });
  // restore pinned/expanded
  const reopen = slot("right")
    .locator('button[aria-label^="Open "]:visible')
    .first();
  if ((await reopen.count()) > 0) await reopen.click();
  await page.waitForTimeout(400);
  const pin2 = slot("right")
    .locator('button[aria-label="Pin column open"]')
    .first();
  if ((await pin2.count()) > 0) {
    await pin2.click();
    await page.waitForTimeout(300);
  }

  // button[…] — the bare class substring also matches the slotTabs STRIP
  // container, and .first() lands on it (the dblclick then no-ops).
  const activeTab = slot("right").locator('button[class*="slotTab"]').first();
  if ((await activeTab.count()) > 0) {
    await activeTab.dblclick();
    await page.waitForTimeout(500);
    log(
      await collapsed("right"),
      "double-clicking the slot tab collapses the column",
    );
    const expand = slot("right")
      .locator('button[aria-label^="Expand column"]')
      .first();
    await expand.click();
    await page.waitForTimeout(400);
  } else {
    log(false, "slot tab found for dblclick-collapse check");
  }
});

// ── F. Templates Undo toast (precise locator) ──────────────────────────────
await step("template undo toast", async () => {
  const tmpl = page.getByRole("button", { name: /templates/i }).first();
  await tmpl.click();
  await page.waitForTimeout(400);
  const item = page.locator('[role="menu"] [role="menuitem"]').first();
  const label = (await item.textContent())?.trim();
  await item.click();
  await page.waitForTimeout(700);
  const undoBtn = page.getByRole("button", { name: /undo/i }).first();
  const present = (await undoBtn.count()) > 0 && (await undoBtn.isVisible());
  log(present, `applying "${label}" surfaces an Undo affordance`);
  const toastBox = await undoBtn
    .evaluate((el) => {
      const c = el.closest('[class*="toast"], [role="status"], [aria-live]');
      return c ? c.textContent.trim().slice(0, 80) : null;
    })
    .catch(() => null);
  info(`toast container text: ${JSON.stringify(toastBox)}`);
  await page.screenshot({ path: path.join(OUT, "template-undo-toast.png") });
  if (present) {
    await undoBtn.click();
    await page.waitForTimeout(600);
  }
});

// ── G. Drag a panel tab between columns — MANUAL VERIFICATION ──────────────
// HTML5 drag-and-drop (the dock's tab-move mechanism) does not fire reliably
// from synthetic pointer events in headless automation, and a simulated
// sequence hangs the run. The dock-drag code path (overlay, column-aligned
// zones, ghost preview, drop/move) is covered by the static audit + the
// keyboard alternative (Shift+arrows on a focused tab, probed via dock
// shortcuts elsewhere). Verify the pointer path by hand when touching
// DockLayout drag code: drag the Side-panel tab toward the center column and
// confirm the overlay + ghost appear and the drop relocates the panel.
await browser.close();
console.log(
  failures === 0 ? "\nALL ROUND-2 CHECKS PASSED" : `\n${failures} FAILURES`,
);
process.exit(failures === 0 ? 0 : 1);
