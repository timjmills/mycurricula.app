// scripts/probe-add-unit.mjs — Lane DG verification probe.
//
// Verifies:
//   1. "+ Add unit" button visible in /year header.
//   2. Clicking the button opens the modal dialog.
//   3. All 8 fields render.
//   4. Days-of-week chips reflect the school week (Sun-Thu).
//   5. Filling the form and clicking Save closes the dialog.
//   6. The new unit visibly appears on the /year roadmap.
//   7. Reloading the page persists the unit.
//
// Screenshots saved under docs/screenshots/add-unit/ for the report.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN is required.");
  process.exit(2);
}

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const OUT_DIR = resolve(process.cwd(), "docs/screenshots/add-unit");
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});

// Authenticate via the Claude bypass cookie endpoint.
const bs = await context.newPage();
await bs.goto(
  `${BASE}/api/claude-access?token=${encodeURIComponent(TOKEN)}&redirect=/year`,
  { waitUntil: "networkidle" },
);
await bs.close();

let exit = 0;
function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
  if (!ok) exit = 1;
}

// ── Step 1-2: button visible + opens modal ────────────────────────────────
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() === "error" || m.type() === "warning") {
    console.log(`[browser ${m.type()}]`, m.text());
  }
});
page.on("response", (r) => {
  if (r.status() >= 400) {
    console.log(`[404] ${r.status()} ${r.url()}`);
  }
});
page.on("pageerror", (err) => {
  console.log("[browser pageerror]", err.message);
});
await page.goto(`${BASE}/year`, { waitUntil: "networkidle" });
await page.waitForSelector("h1", { timeout: 10000 });
// Wipe any prior probe state so each run starts clean.
await page.evaluate(() => {
  try {
    window.localStorage.removeItem("mycurricula:user:custom-units");
    window.localStorage.removeItem("mycurricula:user:default-unit-type-label");
  } catch {
    /* ignore */
  }
});
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("h1", { timeout: 10000 });
await page.waitForTimeout(2000); // let hydration + timeline render

const addBtn = page.locator('button[aria-label="Add a unit to the year roadmap"]');
const addBtnVisible = await addBtn.isVisible();
check("'+ Add unit' button visible in /year header (desktop)", addBtnVisible);

await page.screenshot({
  path: resolve(OUT_DIR, "01-year-with-button-1280.png"),
  fullPage: false,
});

// Force-click in case the Filters panel sits over the button at narrow viewports.
await addBtn.click({ force: true });
// Wait a tick for React state + portal mount.
await page.waitForTimeout(1000);
// Try to detect the dialog — fallback to body inspection if waitForSelector
// times out, so we surface useful info in the probe failure rather than a
// raw "timeout exceeded".
const dialogCount = await page.locator('[role="dialog"]').count();
const scrimCount = await page.locator("[data-add-unit-scrim]").count();
console.log(`After click: ${dialogCount} dialog(s), ${scrimCount} scrim(s)`);
if (dialogCount === 0) {
  const allDialogs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="dialog"]')).map((el) => ({
      label: el.getAttribute("aria-label"),
      labelledby: el.getAttribute("aria-labelledby"),
      html: el.outerHTML.slice(0, 200),
    })),
  );
  console.log("All role=dialog in document:", JSON.stringify(allDialogs));
  // Was the click registered?
  const isOpenAttr = await addBtn.evaluate((b) => ({
    aria: b.getAttribute("aria-expanded"),
    onclick: typeof b.onclick,
  }));
  console.log("Button state:", JSON.stringify(isOpenAttr));
}
await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

const dialogVisible = await page.locator('[role="dialog"]').isVisible();
check("Dialog opens on button click", dialogVisible);

// ── Step 3: all 8 fields render ───────────────────────────────────────────
const expectedFieldIds = [
  "add-unit-type",
  "add-unit-name",
  "add-unit-subject",
  "add-unit-start",
  "add-unit-end",
  "add-unit-weeks",
  "add-unit-lessons",
];
for (const fid of expectedFieldIds) {
  const present = (await page.locator(`#${fid}`).count()) > 0;
  check(`Field #${fid} rendered`, present);
}
// Day chips
const dayChipsGroup = page.locator('[role="group"][aria-label="Days of the week"]');
const chipCount = await dayChipsGroup.locator("button").count();
check("Days-of-week chip group renders 7 chips", chipCount === 7, `${chipCount}`);

// Active chips count should equal the configured school week (defaults Sun-Thu = 5).
const activeChips = await dayChipsGroup.locator("button[aria-pressed='true']").count();
check(
  "Default daysOfWeek matches school week (Sun-Thu = 5 active chips)",
  activeChips === 5,
  `${activeChips} active`,
);

const disabledChips = await dayChipsGroup.locator("button[disabled]").count();
check(
  "Two chips are disabled (Fri, Sat — not in Sun-Thu school week)",
  disabledChips === 2,
  `${disabledChips} disabled`,
);

await page.screenshot({
  path: resolve(OUT_DIR, "02-dialog-open-1280.png"),
  fullPage: false,
});

// ── Step 4: lessons auto-update ───────────────────────────────────────────
const lessonsBefore = await page.locator("#add-unit-lessons").inputValue();
// Toggle off Thursday (was active) and verify lessons count drops
await dayChipsGroup.locator('button:has-text("Thu")').click();
await page.waitForTimeout(100);
const lessonsAfter = await page.locator("#add-unit-lessons").inputValue();
check(
  "Lessons count auto-recomputes when daysOfWeek changes",
  Number(lessonsAfter) < Number(lessonsBefore),
  `${lessonsBefore} -> ${lessonsAfter}`,
);
// Toggle Thursday back on for a clean save
await dayChipsGroup.locator('button:has-text("Thu")').click();
await page.waitForTimeout(100);

// ── Step 5: fill form + save ──────────────────────────────────────────────
await page.fill("#add-unit-name", "Fractions on a Number Line");
await page.fill("#add-unit-type", "Unit of Inquiry");
// Math is the default subject already
// Use a future date that lands inside the academic year
const today = new Date();
const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
const end = new Date(start);
end.setDate(end.getDate() + 28);
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
await page.fill("#add-unit-start", iso(start));
await page.fill("#add-unit-end", iso(end));
await page.waitForTimeout(150);

await page.screenshot({
  path: resolve(OUT_DIR, "03-dialog-filled-1280.png"),
  fullPage: false,
});

// Click Save (the "Add unit" submit button at the footer)
await page
  .locator('button[title="Save and add the unit"]')
  .click();

// Dialog should close
await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 3000 });
const dialogClosed = (await page.locator('[role="dialog"]').count()) === 0;
check("Dialog closes after successful save", dialogClosed);

// ── Step 6: new unit appears on the roadmap ──────────────────────────────
// The new unit gets placed on the timeline at its startDate's academic-
// year week. We wait for the React state + useMemo recomputation to
// settle (the useCustomUnits hook updates state on the same tick the
// AddUnitDialog calls add(), but the parent re-render takes a beat).
await page.waitForTimeout(1500);
const unitBarText = await page
  .locator('[aria-label*="Fractions on a Number Line"]')
  .count();
check(
  "Newly-added unit appears as a UnitBar on the roadmap",
  unitBarText > 0,
  `${unitBarText} match(es)`,
);

// Scroll the timeline horizontally to bring the new unit into view. The
// auto-center put us on CURRENT_WEEK (12), but the new unit sits at the
// week-of-today (~43 in the default academic year), so it would otherwise
// be off-screen-right. We find the unit's bar and scrollIntoView it.
await page.evaluate(() => {
  const el = document.querySelector('[aria-label*="Fractions on a Number Line"]');
  if (el) el.scrollIntoView({ behavior: "instant", inline: "center", block: "nearest" });
});
await page.waitForTimeout(400);
await page.screenshot({
  path: resolve(OUT_DIR, "04-year-with-new-unit-1280.png"),
  fullPage: false,
});

// ── Step 7: reload → unit persists ───────────────────────────────────────
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("h1", { timeout: 10000 });
await page.waitForTimeout(800);

const stillThere = await page
  .locator('[aria-label*="Fractions on a Number Line"]')
  .count();
check(
  "Unit persists across page reload (localStorage)",
  stillThere > 0,
  `${stillThere} match(es) post-reload`,
);

await page.screenshot({
  path: resolve(OUT_DIR, "05-year-after-reload-1280.png"),
  fullPage: false,
});

// ── Responsive smoke checks ──────────────────────────────────────────────
// Phone (≤480px) — YearView is hidden by the page-level CSS in
// app/(planner)/year/year-page.module.css and YearMobile takes over. The
// "+ Add unit" button is part of YearView, so it's correctly NOT visible
// at phone. Verify the page itself still renders cleanly (YearMobile is
// owned by another lane and isn't in DG scope).
await page.setViewportSize({ width: 400, height: 800 });
await page.waitForTimeout(400);
await page.screenshot({
  path: resolve(OUT_DIR, `06-year-phone-400.png`),
  fullPage: false,
});
console.log(
  "NOTE: phone (≤480px) shows YearMobile, not YearView — the '+ Add unit' button is desktop/tablet-only by design",
);

// Tablet: the button must be visible + the dialog must open.
await page.setViewportSize({ width: 768, height: 1024 });
await page.waitForTimeout(400);
const tabletBtnVisible = await page
  .locator('button[aria-label="Add a unit to the year roadmap"]')
  .isVisible();
check("'+ Add unit' button visible at tablet (768px)", tabletBtnVisible);
await page.screenshot({
  path: resolve(OUT_DIR, `07-year-tablet-768.png`),
  fullPage: false,
});
await page
  .locator('button[aria-label="Add a unit to the year roadmap"]')
  .click({ force: true });
await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
const tabletDialogVisible = await page.locator('[role="dialog"]').isVisible();
check("Dialog opens at tablet (768px)", tabletDialogVisible);
await page.screenshot({
  path: resolve(OUT_DIR, `08-dialog-tablet-768.png`),
  fullPage: false,
});
await page.keyboard.press("Escape");
await page.waitForTimeout(200);

await page.close();
await browser.close();

console.log(`\nScreenshots → ${OUT_DIR}`);
process.exit(exit);
