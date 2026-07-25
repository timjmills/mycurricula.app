// probe-overlay-audit.mjs — §4b live gate for the overlay + a11y audit lane.
//
// ASSERTS, never just logs. Exits 1 on any failure.
//   A. Year paper /all-scope grid: the `.uws` opener is permanently visible and
//      ≥44px on a COARSE pointer at 1366, and the fine-pointer hover-only tier
//      (and the card width) are unchanged.
//   B. /daily EDIT: the UnitChip exists and opens the unit workspace.
//   C. Single-key nav is suppressed while an aria-modal dialog is open; ⌘K is
//      not; Escape still closes and shortcuts resume.
//   D. /planner Hub unit doc still opens exactly ONE dialog (no regression).
//
// Usage: node probe-overlay-audit.mjs   (PROBE_BASE defaults to :3099)
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3099";
const SHOTS =
  process.env.PROBE_SHOTS ??
  "C:/Users/losey/AppData/Local/Temp/claude/C--Users-losey-Projects-mycurricula-app/9366a50b-d287-454d-83be-41193d30e1ed/scratchpad/shots";
mkdirSync(SHOTS, { recursive: true });

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync("C:/Users/losey/Projects/mycurricula.app/.env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}

const axes = (frame) => `v1.${frame}.dark.photo.clear.normal.vivid.highlight`;
const DIALOG = '[role="dialog"][aria-modal="true"]';
const CHIP = 'button[aria-label^="Open the "][aria-label$="unit workspace"]';
const UWS = "[data-year-unit-workspace]";
const HYDRATE_MS = 45000;

const results = [];
const check = (ok, name, detail = "") => {
  results.push({ ok, name, detail });
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? `  — ${detail}` : ""}`);
};

const browser = await chromium.launch({ channel: "chrome" });

// ── Auth once, reuse the storage state ──────────────────────────────────────
const auth = await browser.newContext();
{
  const boot = await auth.newPage();
  await boot.goto(
    `${BASE}/auth/claude-login?token=${encodeURIComponent(token)}&next=/weekly`,
    { waitUntil: "domcontentloaded", timeout: 240000 },
  );
  await boot.waitForTimeout(3000);
  await boot.close();
}
const storageState = await auth.storageState();
await auth.close();

async function makeContext({ frame = "glass", width = 1440, touch = false, edit = false }) {
  const ctx = await browser.newContext({
    storageState,
    viewport: { width, height: 950 },
    hasTouch: touch,
  });
  await ctx.addCookies([{ name: "mc-theme-axes", value: axes(frame), url: BASE }]);
  await ctx.addInitScript(
    ([frame, edit]) => {
      localStorage.setItem(
        "mycurricula:onboarding",
        JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
      );
      localStorage.setItem("mycurricula:user:theme-frame", frame);
      localStorage.setItem("mycurricula:user:theme", "clear");
      localStorage.setItem("mycurricula:user:theme-glass", "dark");
      localStorage.setItem("mycurricula:user:theme-bg", "photo");
      localStorage.setItem("mycurricula:user:theme-dim", "normal");
      if (edit) localStorage.setItem("cc_editmode", JSON.stringify({ Day: true }));
    },
    [frame, edit],
  );
  // theme-sync would reconcile the saved frame on top of the seed mid-test.
  await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
  return ctx;
}

// Errors this probe CAUSES or that the shared dev server emits under four
// concurrent lanes — not app defects. Excluded by name, never by silence: the
// raw list is printed in every detail string either way.
//   • ERR_FAILED            — our own ctx.route(...).abort() of teacher_preferences.
//   • ChunkLoadError / "Invalid or unexpected token" / "Loading chunk … failed"
//                           — a `.next` clobbered mid-serve by a sibling lane's
//                             recompile; the page then serves truncated JS.
const DEV_NOISE =
  /favicon|hydrat|ERR_FAILED|ChunkLoadError|Loading chunk|Invalid or unexpected token/i;
const realErrors = (errs) => errs.filter((e) => !DEV_NOISE.test(e));

function watch(page) {
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

// Walk elementFromPoint outward from an element's centre until the hit stops
// resolving inside it — the REAL touch target, pseudo-element expanders included.
const HIT_FN = ({ sel, idx }) => {
  const el = document.querySelectorAll(sel)[idx];
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cx = Math.round(r.left + r.width / 2);
  const cy = Math.round(r.top + r.height / 2);
  const inside = (x, y) => {
    const hit = document.elementFromPoint(x, y);
    return !!hit && (hit === el || el.contains(hit));
  };
  if (!inside(cx, cy)) return { painted: [r.width, r.height], hit: [0, 0], centreHit: false };
  const walk = (dx, dy) => {
    let n = 0;
    while (n < 80 && inside(cx + dx * (n + 1), cy + dy * (n + 1))) n++;
    return n;
  };
  return {
    painted: [Math.round(r.width), Math.round(r.height)],
    hit: [walk(-1, 0) + walk(1, 0) + 1, walk(0, -1) + walk(0, 1) + 1],
    centreHit: true,
  };
};

// ── A. Year paper, all-scope grid — coarse vs fine pointer ──────────────────
async function yearPass({ touch, label }) {
  const ctx = await makeContext({ frame: "paper", width: 1366, touch });
  const page = await ctx.newPage();
  const errors = watch(page);
  if (touch) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      configuration: "mobile",
    });
  }
  await page.goto(`${BASE}/year`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page
    .locator(UWS)
    .first()
    .waitFor({ state: "attached", timeout: HYDRATE_MS })
    .catch(() => {});
  await page.waitForTimeout(2500);

  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  check(
    coarse === touch,
    `[${label}] pointer emulation took (pointer:coarse === ${touch})`,
    `matchMedia=${coarse}`,
  );

  const tier = await page.evaluate(() => {
    const root = document.querySelector("[data-hier][data-scope]");
    return { hier: root?.getAttribute("data-hier"), scope: root?.getAttribute("data-scope") };
  });
  check(
    tier.hier === "grid" && tier.scope === "all",
    `[${label}] tier under test is grid/all`,
    JSON.stringify(tier),
  );

  const n = await page.locator(UWS).count();
  check(n > 0, `[${label}] paper Year renders unit-workspace openers`, `${n} found`);

  const rest = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const cs = getComputedStyle(el);
    const card = el.closest("div").querySelector("button");
    return {
      opacity: cs.opacity,
      position: cs.position,
      cardW: Math.round(card.getBoundingClientRect().width),
    };
  }, UWS);
  check(
    touch ? rest.opacity === "1" : rest.opacity === "0",
    `[${label}] resting opacity is ${touch ? "1 (permanent)" : "0 (hover-only tier preserved)"}`,
    `opacity=${rest.opacity}`,
  );
  check(
    rest.position === "absolute",
    `[${label}] opener stays absolutely positioned (no in-flow column, zero card-width cost)`,
    rest.position,
  );

  const hit = await page.evaluate(HIT_FN, { sel: UWS, idx: 0 });
  if (touch) {
    check(hit.centreHit, `[${label}] opener is hit-testable at rest`, JSON.stringify(hit));
    check(
      hit.hit[0] >= 44 && hit.hit[1] >= 44,
      `[${label}] touch target ≥44×44 (CLAUDE.md §4)`,
      `hit=${hit.hit.join("×")} painted=${hit.painted.join("×")}`,
    );
    check(
      hit.painted[0] <= 30 && hit.painted[1] <= 30,
      `[${label}] painted chip stays 26px (title masking not widened)`,
      `painted=${hit.painted.join("×")}`,
    );
  }

  await page.screenshot({ path: `${SHOTS}/year-paper-1366-${label}.png`, timeout: 15000 }).catch(() => {});
  const cardW = rest.cardW;
  await ctx.close();
  return { cardW, errors };
}

const fine = await yearPass({ touch: false, label: "fine" });
const coarse = await yearPass({ touch: true, label: "coarse" });
check(
  Math.abs(fine.cardW - coarse.cardW) <= 1,
  "unit-card width identical fine vs coarse (the ≤900px static-column damage was NOT inflicted)",
  `fine=${fine.cardW}px coarse=${coarse.cardW}px`,
);
{
  const all = [...fine.errors, ...coarse.errors];
  check(
    realErrors(all).length === 0,
    "no APP console errors on /year",
    `real=${realErrors(all).length} raw=${all.slice(0, 3).join(" | ") || "none"}`,
  );
}

// ── B. /daily EDIT — the UnitChip ───────────────────────────────────────────
{
  const ctx = await makeContext({ frame: "glass", width: 1440, edit: true });
  const page = await ctx.newPage();
  const errors = watch(page);
  await page.goto(`${BASE}/daily`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForTimeout(3000);

  // Same hydration race as the Hub pass: Playwright clicks as soon as the toggle
  // is VISIBLE, which on a cold dev compile is before React attaches. A one-shot
  // click leaves the page in VIEW mode, where DayA/B/C render their OWN chips —
  // so the chip count below would go GREEN while testing entirely the wrong
  // surface. (Observed: 6 view-mode chips passing a "DayEditSplit renders a
  // UnitChip" assertion.) Poll React's own acknowledgement instead.
  const editBtn = page.locator('button[aria-label="Edit"]').first();
  await editBtn.waitFor({ state: "visible", timeout: HYDRATE_MS });
  let inEdit = false;
  for (let i = 0; i < 12 && !inEdit; i++) {
    await editBtn.click({ timeout: 30000 }).catch(() => {});
    inEdit = await editBtn
      .getAttribute("aria-pressed")
      .then((v) => v === "true")
      .catch(() => false);
    if (!inEdit) await page.waitForTimeout(5000);
  }
  await page
    .locator("text=Exit")
    .first()
    .waitFor({ state: "visible", timeout: HYDRATE_MS })
    .catch(() => {});
  await page.waitForTimeout(1500);
  check(inEdit, "[day-edit] Day is in EDIT mode");

  const chips = await page.locator(CHIP).count();
  // `inEdit &&` matters: VIEW mode renders one chip PER LESSON (DayA/B/C), so a
  // bare `chips >= 1` passes on the wrong surface. DayEditSplit's meta row holds
  // exactly ONE — the selected lesson's — which is also the sharper signal.
  check(
    inEdit && chips === 1,
    "[day-edit] DayEditSplit's meta row renders exactly one UnitChip (was ZERO before)",
    `inEdit=${inEdit} chips=${chips}`,
  );
  await page.screenshot({ path: `${SHOTS}/day-edit-1440.png` });

  if (inEdit && chips >= 1) {
    const chipBox = await page.locator(CHIP).first().boundingBox();
    // Retry for the same reason as above.
    let dlgs = 0;
    for (let i = 0; i < 6 && dlgs === 0; i++) {
      await page.locator(CHIP).first().click({ timeout: 30000 }).catch(() => {});
      await page.locator(DIALOG).first().waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
      dlgs = await page.locator(DIALOG).count();
    }
    check(dlgs === 1, "[day-edit] chip opens EXACTLY ONE unit-workspace dialog", `${dlgs}`);
    await page.screenshot({ path: `${SHOTS}/day-edit-workspace-open.png` });

    // ── C. shortcut suppression, measured with the dialog up ───────────────
    await page.locator(`${DIALOG} [data-ue-close]`).first().focus();
    await page.keyboard.press("2"); // → /daily (already here); use 1 → /weekly
    await page.keyboard.press("1");
    await page.waitForTimeout(900);
    check(
      new URL(page.url()).pathname === "/daily",
      "[shortcuts] single-key nav SUPPRESSED behind an aria-modal dialog",
      page.url(),
    );

    await page.keyboard.press("ControlOrMeta+k");
    await page.waitForTimeout(900);
    const palette = await page.evaluate(() =>
      [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].some((d) =>
        /command|search|palette/i.test(
          d.getAttribute("aria-label") ??
            document.getElementById(d.getAttribute("aria-labelledby") ?? "")?.textContent ??
            "",
        ),
      ),
    );
    check(palette, "[shortcuts] ⌘K still opens the command palette over a dialog");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);
    const after = await page.locator(DIALOG).count();
    check(after === 0, "[shortcuts] Escape closes the dialog(s)", `${after} left`);

    await page.keyboard.press("1");
    await page
      .waitForURL(/\/weekly/, { timeout: 120000 })
      .catch(() => {});
    check(
      new URL(page.url()).pathname === "/weekly",
      "[shortcuts] single-key nav RESUMES once no dialog is open",
      page.url(),
    );
    check(chipBox !== null, "[day-edit] chip has a layout box");
  }

  check(
    realErrors(errors).length === 0,
    "no APP console errors on /daily EDIT",
    `real=${realErrors(errors).length} raw=${errors.slice(0, 3).join(" | ") || "none"}`,
  );
  await ctx.close();
}

// ── D. /planner Hub unit doc — one dialog, no regression ────────────────────
{
  const ctx = await makeContext({ frame: "glass", width: 1440 });
  const page = await ctx.newPage();
  const errors = watch(page);
  await page.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 240000 });
  await page.waitForTimeout(4000);

  // The area nav is a plain <nav aria-label="Browse">, NOT a tablist (Codex W8
  // R4). Wait for real unit cards rather than a flat timeout: a cold dev
  // compile can leave the pane hydrating well past any fixed budget, and an
  // empty pane silently turns every assertion below into a false pass.
  // RETRY THE CLICK UNTIL REACT ACKNOWLEDGES IT. Playwright fires as soon as the
  // button is VISIBLE, which on a cold dev compile is well before hydration
  // attaches the handler — the known "first click after load silently no-ops"
  // issue. A one-shot click leaves `area` on "lessons", the pane renders no unit
  // cards, and every assertion below becomes a false pass. `aria-current="page"`
  // is React's own acknowledgement, so poll for that.
  const unitsTab = page
    .locator("nav[aria-label='Browse'] button", { hasText: "Units" })
    .first();
  await unitsTab.waitFor({ state: "visible", timeout: HYDRATE_MS });
  let acked = false;
  for (let i = 0; i < 12 && !acked; i++) {
    await unitsTab.click({ timeout: 30000 }).catch(() => {});
    acked = await unitsTab
      .getAttribute("aria-current")
      .then((v) => v === "page")
      .catch(() => false);
    if (!acked) await page.waitForTimeout(5000);
  }
  check(acked, "[hub] Units area activated (React handled the click)");
  const cards = page.locator("button").filter({ hasText: "% complete" });
  await cards.first().waitFor({ state: "visible", timeout: HYDRATE_MS }).catch(() => {});
  const cardN = await cards.count();
  check(cardN > 0, "[hub] Units browse rendered unit cards", `${cardN}`);
  await page.screenshot({ path: `${SHOTS}/planner-units-browse.png`, timeout: 15000 }).catch(() => {});

  if (cardN > 0) {
    await cards.first().click();
    await page.locator(DIALOG).first().waitFor({ state: "visible", timeout: HYDRATE_MS }).catch(() => {});
    await page.waitForTimeout(1500);
    const state = await page.evaluate(() => ({
      dialogs: document.querySelectorAll('[role="dialog"][aria-modal="true"]').length,
      scrims: document.querySelectorAll(".ue-scrim").length,
      // The rail itself, by its own accessible name (UnitWorkspaceRail.tsx:91).
      // NOT `[class*="railLayout"]` — ExplorerShell applies that wrapper when a
      // rail OR a DRAWER is supplied, and the Hub explorer legitimately has the
      // B3 context drawer. Matching on the wrapper reports a rail that is not
      // there (measured: rails=1 with no rail on screen).
      rails: document.querySelectorAll(
        'nav[aria-label="Unit and lesson navigator"]',
      ).length,
      // The ⤢ presentation toggle is the rail's twin capability; both are gated
      // on `onUnitChange`, so neither may appear here. Match its ACCESSIBLE
      // NAME, not `[class*="expandBtn"]` — the B3 drawer toggle reuses that
      // exact class (UnitExplorer.tsx:573) and the Hub legitimately has one, so
      // the class selector reports a presentation toggle that is not there
      // (measured: expandToggles=1 with no ⤢ on screen).
      expandToggles: document.querySelectorAll(
        'button[aria-label="Expand to the full workspace"],' +
          ' button[aria-label="Collapse to a dialog"]',
      ).length,
      overflow: document.body.style.overflow,
    }));
    check(state.dialogs === 1, "[hub] the Hub's scrim-only explorer opens EXACTLY ONE dialog", JSON.stringify(state));
    check(state.scrims === 1, "[hub] exactly one scrim (no stacked shells)", `${state.scrims}`);
    check(state.rails === 0, "[hub] no unit/lesson rail — the Hub's no-rail contract holds", `${state.rails}`);
    check(state.expandToggles === 0, "[hub] no ⤢ expand toggle either", `${state.expandToggles}`);
    check(state.overflow === "hidden", "[hub] body scroll locked while the dialog is up", `"${state.overflow}"`);
    await page.screenshot({ path: `${SHOTS}/planner-unit-doc.png`, timeout: 15000 }).catch(() => {});
  }
  check(
    realErrors(errors).length === 0,
    "no APP console errors on /planner",
    `real=${realErrors(errors).length} raw=${errors.slice(0, 3).join(" | ") || "none"}`,
  );
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} assertions passed`);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? `  (${f.detail})` : ""}`);
  process.exit(1);
}
console.log("ALL PASS");
