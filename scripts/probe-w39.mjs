// probe-w39.mjs — Wave-3 sub-wave W3.9 EXTENDED verification probe.
//
// The LAST sub-wave of Wave 3. probe-theme-wave.mjs (its sibling) owns the
// appearance-engine matrix (frame/glass/bg/dim/theme/tone, render-paint gate,
// contrast). This probe owns the SHELL + EDIT-MODE surfaces W3.3–W3.8c shipped,
// per docs/v2-rebuild/WAVE-3-PLAN.md §1 W3.9:
//
//   A. CHROME / HOME — the corner-grammar chrome renders across themes: the
//      top bar (.topbar), the interim SideNav (nav[aria-label="Primary"]), and
//      the route-scoped botbar (.botbar, home+Day only). Active chrome consumes
//      the --chrome-accent-* tier (the SideNav active item's background resolves
//      to --chrome-accent-soft) and re-hues per theme — no stale single brand.
//   B. IMMERSIVE SHELL — /planner renders .overlay.immersive: the floating
//      .immersbar is present with the ViewTitle ("Planner hub") + style gear;
//      the corner chrome (.topbar / .botbar / compact console) is ABSENT. The
//      SideNav stays mounted by design (WAVE-3-PLAN W3.3 interim nav) — noted,
//      not failed.
//   C. EDIT MODE (W3.8 / W3.8b / W3.8c) —
//      C-axes  Appearance axes are IDENTICAL across View and Edit for both Day
//              and Week: seeding a theme+frame then flipping the per-view Edit
//              mode never changes <html>'s data-theme/data-frame/... nor the key
//              token values (per-view UI state is NOT an appearance axis — the
//              WAVE-3-PLAN C5 / §2 standing rule).
//      C-week-persist  Week edit persists across a client-side nav (Home → the
//              SideNav Weekly item): [data-week-edit-board] still mounts.
//      C-day-reset     Day force-resets to View on the Home→Day nav CLICK (the
//              SideNav Daily item's onClick setDayEdit(false)): /daily lands in
//              View (no [data-day-edit-split]), cc_editmode.Day === false, and
//              Week stays true (the force-reset matrix — Day resets, Week does
//              not).
//      C-rail   Branch update (head 1968fb3): the [data-pane="rail"] resources
//              rail is PRESENT in Week View and ABSENT in Week Edit (the board
//              returns early as a full-width single grid slot).
//      C-board  W3.8c board sanity: aligned layout renders period rail cells
//              (.va-ph) whose first reads "Period 1", day headers == the derived
//              week length (--day-count), and the aligned rows are CLUSTERED
//              (printed NOTE — the Sun–Thu fixture derives a small row count, not
//              one row per lesson). Then a live cc-pblayout flip to 'stacked'
//              (localStorage + the CustomEvent, NO reload) flips data-layout to
//              "stacked" and leaves ZERO empty cells (each day one contiguous
//              stack).
//   D. C2 .theme-tint (WAVE-3-PLAN cross-cutting C2) — the whole-app wash checks
//      out on every pass: exactly one aria-hidden .theme-tint, position:fixed,
//      z-index:90, mix-blend-mode:soft-light, pointer-events:none. And an actual
//      mounted overlay (the ViewTitle appearance popover) sits ABOVE z-90 so the
//      soft-light wash never washes it (C2's stated risk).
//
// Every assertion prints a clear PASS/FAIL line naming the surface +
// expected/actual; the script exits nonzero on any FAIL and screenshots the
// failing surface to docs/screenshots/w39-probe/. Known console noise
// (teacher_preferences 400, login 401, linkedom canvas, the WeeklyShell sr-only
// useId hydration warning) is IGNORED — this probe asserts DOM/computed facts,
// never console output.
//
// Usage:
//   CLAUDE_BYPASS_TOKEN='<raw token>' PROBE_BASE=http://localhost:3019 \
//     node scripts/probe-w39.mjs
// (PROBE_BASE defaults to http://localhost:3019 — this wave's dev server.)

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN not set");
  process.exit(1);
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3019";
const SHOT_DIR = path.resolve("docs/screenshots/w39-probe");
await mkdir(SHOT_DIR, { recursive: true });

// ── localStorage keys (mirror the app's LOCKED contracts) ───────────────────
const LS = {
  theme: "mycurricula:user:theme",
  frame: "mycurricula:user:theme-frame",
  glass: "mycurricula:user:theme-glass",
  bg: "mycurricula:user:theme-bg",
  dim: "mycurricula:user:theme-dim",
  // The synced-triple write stamp — seeded +5min so an authenticated run's
  // remote teacher_preferences row can't out-time the seed and re-apply the
  // saved look after hydration (the sibling probe's KEY.stamp lesson).
  stamp: "mycurricula:user:theme-updated-at",
  // Per-view LOCAL UI state (bundle-exact keys/casing — NOT appearance axes).
  editmode: "cc_editmode", // Record<"Day"|"Week", boolean>
  pblayout: "cc_pblayout", // "aligned" | "stacked"
};

// Themes exercised for the chrome re-hue proof (skip "off" — the no-theme
// neutral has no distinct chrome accent to differentiate).
const CHROME_THEMES = ["clear", "night", "honey", "mint", "sky", "blossom"];

// ── Assertion harness ───────────────────────────────────────────────────────
const results = [];
function assert(group, name, ok, detail) {
  results.push({ group, name, ok: !!ok, detail: detail ?? "" });
  if (!ok) {
    console.log(`FAIL  [${group}] ${name} — ${detail ?? ""}`);
  }
}
let shotSeq = 0;
async function shotOnFail(page, ok, tag) {
  if (ok || !page) return;
  try {
    await page.screenshot({
      path: path.join(SHOT_DIR, `fail-${String(++shotSeq).padStart(2, "0")}-${tag}.png`),
    });
  } catch {}
}

// Seed localStorage before any app script runs. `seed` is a flat map of the LS
// values to set; only provided keys are written.
function seedScript(seed) {
  return `(() => { try {
    const s = ${JSON.stringify(seed)};
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    localStorage.setItem(${JSON.stringify(LS.stamp)}, String(Date.now() + 300000));
  } catch (e) {} })();`;
}

const browser = await chromium.launch({ channel: "chrome" });

// Auth boot once; reuse cookies across every themed/seeded context.
const authCtx = await browser.newContext();
{
  const boot = await authCtx.newPage();
  await boot.goto(
    `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/weekly`,
    { waitUntil: "domcontentloaded", timeout: 120000 },
  );
  await boot.waitForTimeout(2000);
  await boot.close();
}
const cookies = await authCtx.cookies();
await authCtx.close();

async function newCtx(seed, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies(cookies);
  if (seed) await ctx.addInitScript(seedScript(seed));
  return ctx;
}

// Poll for a selector to be attached. The edit surfaces mount LATE on a cold
// dev compile (route compile + React hydration + the post-mount EditModeProvider
// hydration effect can total ~5–6s on first hit) — a fixed wait is a flake, so
// we poll up to 20s. Returns true if it mounted, false on timeout.
async function waitForMounted(page, selector, timeoutMs = 30000) {
  try {
    await page.waitForSelector(selector, { state: "attached", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

// Wait for a selector to be VISIBLE (chrome renders after hydration; a fixed
// wait flakes when the dev server is busy compiling for a concurrent session).
async function waitVisible(page, selector, timeoutMs = 20000) {
  try {
    await page.waitForSelector(selector, { state: "visible", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

// True when the URL is the login/auth surface (the bypass session bounced).
function isLoginUrl(u) {
  return /\/login(\?|$)|\/auth\/claude-login/.test(u || "");
}

// Navigate to an app route, tolerating a TRANSIENT bypass-session bounce to
// /login (observed mid-run when a concurrent session hammers the same dev
// server). Re-navigates up to `tries` times; returns true iff we landed on the
// intended route authenticated. Never a license to skip an assertion — a hard
// bounce still returns false and the caller fails loudly.
async function gotoAuthed(page, target, tries = 3) {
  const url = target.startsWith("http") ? target : `${BASE}${target}`;
  for (let i = 0; i < tries; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    } catch {
      await page.waitForTimeout(1200);
      continue;
    }
    if (!isLoginUrl(page.url())) return true;
    await page.waitForTimeout(1500); // transient bounce — retry
  }
  return !isLoginUrl(page.url());
}

// Navigate to `homeRoute`, wait for hydration, then click a nav link via a
// CLIENT-side navigation. Clicking a Next.js <Link> BEFORE React hydration does
// a full-page browser navigation that never fires the link's onClick (so the
// Day force-reset would silently not run) — the probe must click only after the
// handler is attached. We set a window marker before the click; a client-side
// nav preserves the JS context (marker survives), a full reload wipes it. The
// caller asserts on the returned `clientNav` so a pre-hydration full-reload nav
// is caught, never masked. Returns { clicked, clientNav }.
async function hydratedNavClick(page, homeRoute, clickSelector) {
  const authed = await gotoAuthed(page, homeRoute);
  if (!authed) return { clicked: false, clientNav: false, bounced: true };
  await page.waitForLoadState("networkidle").catch(() => {});
  const linkReady = await waitVisible(page, clickSelector, 30000);
  if (!linkReady) return { clicked: false, clientNav: false, bounced: false };
  // Hydration settle: give React time to attach the link's onClick before we
  // click (the SideNav is a client component; its handlers arrive post-mount).
  await page.waitForTimeout(4000);
  await page.evaluate(() => {
    window.__w39ClientNav = true;
  });
  await page.click(clickSelector);
  // After nav, read the marker in the (possibly new) context.
  let clientNav = false;
  try {
    clientNav = await page.evaluate(() => window.__w39ClientNav === true);
  } catch {
    clientNav = false;
  }
  // A post-click bounce to /login means the session dropped mid-nav.
  const bounced = isLoginUrl(page.url());
  return { clicked: true, clientNav, bounced };
}

// ═══════════════════════════════════════════════════════════════════════════
// GROUP A — CHROME / HOME across themes  (+ D: theme-tint every pass)
// ═══════════════════════════════════════════════════════════════════════════
// Per theme: /home proves top bar + SideNav + botbar render and the tint is
// well-formed; /weekly proves the SideNav ACTIVE item consumes --chrome-accent-
// soft (sampled) and the tint holds. After the loop we prove the accent
// re-hues across themes (no stale single brand).
const accentByTheme = {};
for (const theme of CHROME_THEMES) {
  // ---- /home: chrome presence + tint invariant ----
  {
    const ctx = await newCtx({ [LS.theme]: theme });
    const page = await ctx.newPage();
    let facts = null;
    let err = null;
    try {
      const authed = await gotoAuthed(page, "/home");
      if (!authed) throw new Error("bounced to /login (bypass session dropped)");
      // Poll for the chrome to render (hydration + possible compile lag under a
      // concurrent session) rather than a fixed wait — the run-3 flake source.
      await waitVisible(page, ".topbar");
      await waitVisible(page, 'nav[aria-label="Primary"]');
      await waitVisible(page, ".botbar");
      facts = await page.evaluate(() => {
        const tint = document.querySelector(".theme-tint");
        const cs = tint ? getComputedStyle(tint) : null;
        return {
          theme: document.documentElement.dataset.theme,
          topbar: !!document.querySelector(".topbar"),
          sidenav: !!document.querySelector('nav[aria-label="Primary"]'),
          botbar: !!document.querySelector(".botbar"),
          tintCount: document.querySelectorAll(".theme-tint").length,
          tintAria: tint ? tint.getAttribute("aria-hidden") : null,
          tintPos: cs ? cs.position : null,
          tintZ: cs ? cs.zIndex : null,
          tintBlend: cs ? cs.mixBlendMode : null,
          tintPE: cs ? cs.pointerEvents : null,
        };
      });
    } catch (e) {
      err = e.message.slice(0, 200);
    }
    const okTopbar = !err && facts?.topbar === true;
    const okSidenav = !err && facts?.sidenav === true;
    const okBotbar = !err && facts?.botbar === true;
    assert("A:chrome", `topbar present (${theme} /home)`, okTopbar, err ?? `topbar=${facts?.topbar}`);
    assert("A:chrome", `SideNav present (${theme} /home)`, okSidenav, err ?? `sidenav=${facts?.sidenav}`);
    assert("A:chrome", `botbar present (${theme} /home)`, okBotbar, err ?? `botbar=${facts?.botbar}`);
    // D. theme-tint invariant (every pass).
    const okTint =
      !err &&
      facts?.tintCount === 1 &&
      facts?.tintAria === "true" &&
      facts?.tintPos === "fixed" &&
      facts?.tintZ === "90" &&
      facts?.tintBlend === "soft-light" &&
      facts?.tintPE === "none";
    assert(
      "D:theme-tint",
      `.theme-tint invariant (${theme} /home)`,
      okTint,
      err ??
        `count=${facts?.tintCount} aria=${facts?.tintAria} pos=${facts?.tintPos} z=${facts?.tintZ} blend=${facts?.tintBlend} pe=${facts?.tintPE}`,
    );
    await shotOnFail(page, okTopbar && okSidenav && okBotbar && okTint, `chrome-home-${theme}`);
    await page.close();
    await ctx.close();
  }

  // ---- /weekly: active SideNav item consumes --chrome-accent-soft ----
  {
    const ctx = await newCtx({ [LS.theme]: theme });
    const page = await ctx.newPage();
    let sample = null;
    let err = null;
    try {
      const authed = await gotoAuthed(page, "/weekly");
      if (!authed) throw new Error("bounced to /login (bypass session dropped)");
      // Wait for the active SideNav item to render before sampling its color.
      await waitVisible(page, 'nav[aria-label="Primary"] a[aria-current="page"]');
      await page.waitForTimeout(400);
      sample = await page.evaluate(() => {
        // Canvas readback resolves any computed color (rgb/oklch/color-mix) to
        // sRGB bytes — the sibling probe's technique.
        const probe = document.createElement("div");
        document.body.appendChild(probe);
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const cctx = canvas.getContext("2d", { willReadFrequently: true });
        const resolve = (expr) => {
          probe.style.color = "";
          probe.style.color = expr;
          const c = getComputedStyle(probe).color;
          if (!c) return null;
          cctx.clearRect(0, 0, 1, 1);
          cctx.fillStyle = "#000";
          cctx.fillStyle = c;
          cctx.fillRect(0, 0, 1, 1);
          const d = cctx.getImageData(0, 0, 1, 1).data;
          return [d[0], d[1], d[2]];
        };
        const active = document.querySelector(
          'nav[aria-label="Primary"] a[aria-current="page"]',
        );
        const activeBg = active ? getComputedStyle(active).backgroundColor : null;
        const out = {
          activeExists: !!active,
          activeHref: active ? active.getAttribute("href") : null,
          activeBg: activeBg ? resolve(activeBg) : null,
          accentSoft: resolve("var(--chrome-accent-soft)"),
          accentDeep: resolve("var(--chrome-accent-deep)"),
          accentStrong: resolve("var(--chrome-accent-strong)"),
        };
        probe.remove();
        return out;
      });
    } catch (e) {
      err = e.message.slice(0, 200);
    }
    accentByTheme[theme] = sample?.accentSoft ?? null;
    const near = (a, b) =>
      Array.isArray(a) && Array.isArray(b) && a.every((v, i) => Math.abs(v - b[i]) <= 3);
    const okActive =
      !err &&
      sample?.activeExists === true &&
      sample?.activeHref === "/weekly" &&
      near(sample?.activeBg, sample?.accentSoft);
    assert(
      "A:chrome-accent",
      `active SideNav item consumes --chrome-accent-soft (${theme} /weekly)`,
      okActive,
      err ??
        `activeHref=${sample?.activeHref} activeBg=${JSON.stringify(sample?.activeBg)} accentSoft=${JSON.stringify(sample?.accentSoft)}`,
    );
    await shotOnFail(page, okActive, `chrome-accent-${theme}`);
    await page.close();
    await ctx.close();
  }
}
// Re-hue proof: the chrome-accent-soft must differ across themes (not a single
// stale brand color). Compare each theme's sampled accent to clear's.
{
  const base = accentByTheme.clear;
  const distinct = CHROME_THEMES.filter((t) => t !== "clear").some((t) => {
    const v = accentByTheme[t];
    return Array.isArray(v) && Array.isArray(base) && v.some((c, i) => Math.abs(c - base[i]) > 3);
  });
  assert(
    "A:chrome-accent",
    "chrome-accent re-hues across themes (no stale single brand)",
    distinct,
    `samples=${JSON.stringify(accentByTheme)}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GROUP B — IMMERSIVE SHELL on /planner
// ═══════════════════════════════════════════════════════════════════════════
{
  const ctx = await newCtx(null);
  const page = await ctx.newPage();
  let facts = null;
  let err = null;
  try {
    await gotoAuthed(page, "/planner");
    await page.waitForTimeout(1800);
    facts = await page.evaluate(() => {
      const immersbar = document.querySelector(".immersbar");
      const title = immersbar ? immersbar.querySelector(".view-title") : null;
      return {
        overlayImmersive: !!document.querySelector(".overlay.immersive"),
        immersbar: !!immersbar,
        titleText: title ? title.textContent?.trim() : null,
        gear: !!(immersbar && immersbar.querySelector(".vt-cogbtn")),
        topbar: !!document.querySelector(".topbar"),
        botbar: !!document.querySelector(".botbar"),
        compactConsole: !!document.querySelector(".views.console"),
        sidenav: !!document.querySelector('nav[aria-label="Primary"]'),
      };
    });
  } catch (e) {
    err = e.message.slice(0, 200);
  }
  const okImmersbar = !err && facts?.overlayImmersive === true && facts?.immersbar === true;
  const okTitle = !err && facts?.titleText === "Planner hub" && facts?.gear === true;
  const okNavAbsent =
    !err && facts?.topbar === false && facts?.botbar === false && facts?.compactConsole === false;
  assert("B:immersive", "/planner renders .overlay.immersive + .immersbar", okImmersbar, err ?? JSON.stringify(facts));
  assert(
    "B:immersive",
    '/planner immersbar has ViewTitle "Planner hub" + style gear',
    okTitle,
    err ?? `title=${facts?.titleText} gear=${facts?.gear}`,
  );
  assert(
    "B:immersive",
    "/planner corner chrome absent (.topbar/.botbar/compact console)",
    okNavAbsent,
    err ?? `topbar=${facts?.topbar} botbar=${facts?.botbar} console=${facts?.compactConsole}`,
  );
  // The interim SideNav stays mounted by design — record it, never fail on it.
  console.log(
    `NOTE  [B:immersive] interim SideNav present on /planner: ${facts?.sidenav} (by design, WAVE-3-PLAN W3.3 interim nav)`,
  );
  await shotOnFail(page, okImmersbar && okTitle && okNavAbsent, "immersive-planner");
  await page.close();
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// GROUP C — EDIT MODE (W3.8 / W3.8b / W3.8c)
// ═══════════════════════════════════════════════════════════════════════════

// Capture <html> appearance axes + key resolved tokens (in-page; inline canvas
// resolver, same technique as the sibling probe).
const AXIS_EVAL = () => {
  const probe = document.createElement("div");
  document.body.appendChild(probe);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const cctx = canvas.getContext("2d", { willReadFrequently: true });
  const resolve = (expr) => {
    probe.style.color = "";
    probe.style.color = expr;
    const c = getComputedStyle(probe).color;
    if (!c) return null;
    cctx.clearRect(0, 0, 1, 1);
    cctx.fillStyle = "#000";
    cctx.fillStyle = c;
    cctx.fillRect(0, 0, 1, 1);
    const d = cctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const ds = document.documentElement.dataset;
  const out = {
    theme: ds.theme ?? null,
    frame: ds.frame ?? null,
    glass: ds.glass ?? null,
    bg: ds.bg ?? null,
    dim: ds.dim ?? null,
    tone: ds.tone ?? null,
    accentSoft: resolve("var(--chrome-accent-soft)"),
    surface: resolve("var(--surface)"),
    ink: resolve("var(--ink)"),
  };
  probe.remove();
  return out;
};
function axesEqual(a, b) {
  if (!a || !b) return false;
  const near = (x, y) =>
    Array.isArray(x) && Array.isArray(y) && x.every((v, i) => Math.abs(v - y[i]) <= 3);
  return (
    a.theme === b.theme &&
    a.frame === b.frame &&
    a.glass === b.glass &&
    a.bg === b.bg &&
    a.dim === b.dim &&
    a.tone === b.tone &&
    near(a.accentSoft, b.accentSoft) &&
    near(a.surface, b.surface) &&
    near(a.ink, b.ink)
  );
}

// ── C-axes: appearance axes IDENTICAL across View and Edit ──────────────────
// For each of Day/Week, seed a non-default theme+frame; capture axes in View,
// then flip that view's Edit mode and capture again — must be byte-identical.
const EDIT_CASES = [
  { view: "Day", route: "/daily", editSelector: "[data-day-edit-split]" },
  { view: "Week", route: "/weekly", editSelector: "[data-week-edit-board]" },
];
for (const c of EDIT_CASES) {
  const appearanceSeed = {
    [LS.theme]: "sky",
    [LS.frame]: "color",
    [LS.glass]: "dark",
    [LS.bg]: "photo",
    [LS.dim]: "normal",
  };
  // View mode.
  let viewAxes = null;
  {
    const ctx = await newCtx(appearanceSeed);
    const page = await ctx.newPage();
    try {
      await gotoAuthed(page, c.route);
      await page.waitForTimeout(2200);
      const inEdit = await page.evaluate((sel) => !!document.querySelector(sel), c.editSelector);
      assert(
        "C:axes",
        `${c.view} ${c.route} is in VIEW mode when unseeded (precondition)`,
        inEdit === false,
        `edit surface unexpectedly mounted (${c.editSelector})`,
      );
      viewAxes = await page.evaluate(AXIS_EVAL);
    } catch (e) {
      assert("C:axes", `${c.view} view-mode load`, false, e.message.slice(0, 200));
    }
    await page.close();
    await ctx.close();
  }
  // Edit mode (flip this view on).
  let editAxes = null;
  let editMounted = false;
  {
    const ctx = await newCtx({
      ...appearanceSeed,
      [LS.editmode]: JSON.stringify({ [c.view]: true }),
    });
    const page = await ctx.newPage();
    try {
      await gotoAuthed(page, c.route);
      editMounted = await waitForMounted(page, c.editSelector);
      editAxes = await page.evaluate(AXIS_EVAL);
    } catch (e) {
      assert("C:axes", `${c.view} edit-mode load`, false, e.message.slice(0, 200));
    }
    assert(
      "C:axes",
      `${c.view} Edit surface mounts (${c.editSelector})`,
      editMounted,
      `edit surface not found after seeding cc_editmode {"${c.view}":true}`,
    );
    const ok = axesEqual(viewAxes, editAxes);
    assert(
      "C:axes",
      `${c.view} appearance axes identical View vs Edit`,
      ok,
      `view=${JSON.stringify(viewAxes)} edit=${JSON.stringify(editAxes)}`,
    );
    await shotOnFail(page, editMounted && ok, `axes-${c.view}`);
    await page.close();
    await ctx.close();
  }
}

// ── C-week-persist: Week edit survives a client-side nav (Home → Weekly) ────
{
  const ctx = await newCtx({ [LS.editmode]: JSON.stringify({ Week: true }) });
  const page = await ctx.newPage();
  let ok = false;
  let detail = "";
  try {
    // Client-side nav via the SideNav Weekly item (title="Weekly" — unique; the
    // brand link is /weekly too, so href alone is ambiguous). Persistence across
    // a CLIENT nav is the point — a full reload would trivially re-read storage.
    const { clientNav } = await hydratedNavClick(
      page,
      "/home",
      'nav[aria-label="Primary"] a[title="Weekly"]',
    );
    await page.waitForURL("**/weekly", { timeout: 15000 }).catch(() => {});
    const mounted = await waitForMounted(page, "[data-week-edit-board]");
    ok = clientNav === true && mounted === true;
    detail = `clientNav=${clientNav} url=${page.url()} board=${mounted}`;
  } catch (e) {
    detail = e.message.slice(0, 200);
  }
  assert("C:week-persist", "Week edit persists Home→Weekly client nav", ok, detail);
  await shotOnFail(page, ok, "week-persist");
  await page.close();
  await ctx.close();
}

// ── C-day-reset: Day force-resets to View on the Home→Day nav click ─────────
{
  const ctx = await newCtx({ [LS.editmode]: JSON.stringify({ Day: true, Week: true }) });
  const page = await ctx.newPage();
  let precondition = false;
  let clientNav = false;
  let landedView = false;
  let dayFlag = null;
  let weekFlag = null;
  let detail = "";
  try {
    // Precondition: Day IS in edit when seeded true + on /daily (poll — the
    // split mounts late on a cold compile, ~7s observed).
    await gotoAuthed(page, "/daily");
    precondition = await waitForMounted(page, "[data-day-edit-split]");
    // Nav to /home, then click the SideNav Daily item (title="Daily", unique).
    // The reset rides the onClick, so the click MUST land after hydration —
    // hydratedNavClick confirms a client-side nav (clientNav) so a pre-hydration
    // full-reload that would skip the reset is caught, not masked.
    const nav = await hydratedNavClick(
      page,
      "/home",
      'nav[aria-label="Primary"] a[title="Daily"]',
    );
    clientNav = nav.clientNav;
    await page.waitForURL("**/daily", { timeout: 15000 }).catch(() => {});
    // The onClick wrote cc_editmode.Day=false before the push — read it (the
    // authoritative signal), and confirm the split does not (re)mount.
    await page.waitForTimeout(3500);
    landedView = await page.evaluate(() => !document.querySelector("[data-day-edit-split]"));
    const map = await page.evaluate((k) => {
      try {
        return JSON.parse(localStorage.getItem(k) || "{}");
      } catch {
        return {};
      }
    }, LS.editmode);
    dayFlag = map.Day ?? null;
    weekFlag = map.Week ?? null;
    detail = `clientNav=${clientNav} precond(editMounted)=${precondition} landedView=${landedView} cc_editmode.Day=${dayFlag} .Week=${weekFlag}`;
  } catch (e) {
    detail = e.message.slice(0, 200);
  }
  assert("C:day-reset", "Day starts in Edit when seeded (precondition)", precondition, detail);
  assert(
    "C:day-reset",
    "Day nav click is a client-side nav (onClick reset can fire)",
    clientNav === true,
    detail,
  );
  assert(
    "C:day-reset",
    "Day resets to View on Home→Day nav click (no [data-day-edit-split])",
    landedView === true,
    detail,
  );
  assert("C:day-reset", "cc_editmode.Day === false after reset", dayFlag === false, detail);
  assert("C:day-reset", "Week stays true (force-reset matrix — only Day resets)", weekFlag === true, detail);
  await shotOnFail(
    page,
    precondition && clientNav && landedView && dayFlag === false && weekFlag === true,
    "day-reset",
  );
  await page.close();
  await ctx.close();
}

// ── C-board: W3.8c board sanity — aligned clustering + live stacked flip ─────
{
  const ctx = await newCtx({
    [LS.editmode]: JSON.stringify({ Week: true }),
    [LS.pblayout]: "aligned",
  });
  const page = await ctx.newPage();
  let aligned = null;
  let stacked = null;
  let err = null;
  try {
    await gotoAuthed(page, "/weekly");
    await waitForMounted(page, "[data-week-edit-board]");
    aligned = await page.evaluate(() => {
      const board = document.querySelector("[data-week-edit-board]");
      if (!board) return { board: false };
      const grid = board.querySelector('[role="group"]');
      const dayCountVar = grid
        ? getComputedStyle(grid).getPropertyValue("--day-count").trim()
        : "";
      // Day headers: the sticky header cells (siblings of the corner .va-ph).
      // Count is DAY_COUNT; derive it structurally from the rail's period rows.
      const railCells = Array.from(board.querySelectorAll(".va-ph"));
      // The corner is the first .va-ph (aria-hidden); period rail cells carry a
      // railTime span ("Period N") + a railEnd span (the start-time label). Read
      // ONLY the railTime span — textContent of the whole cell concatenates both
      // ("Period 1" + "8:00" = "Period 18:00"), which is not the "Period N" text.
      const railTimes = Array.from(board.querySelectorAll('[class*="railTime"]'));
      const firstPeriodText = railTimes[0]
        ? (railTimes[0].textContent || "").replace(/\s+/g, " ").trim()
        : null;
      return {
        board: true,
        layout: board.getAttribute("data-layout"),
        dayCountVar,
        vaphTotal: railCells.length,
        periodRows: railTimes.length,
        firstPeriodText,
      };
    });
    if (aligned?.board) {
      // Day-header count: count the header NAME spans (one per day header cell).
      // "[class*=dayHead]" over-matches (dayHead + dayHeadName + dayHeadDate);
      // "dayHeadName" is exactly one per header, so its count == DAY_COUNT.
      const dayHeadCount = await page.evaluate(() => {
        const board = document.querySelector("[data-week-edit-board]");
        return board.querySelectorAll('[class*="dayHeadName"]').length;
      });
      aligned.dayHeadCount = dayHeadCount;
    }
    // Live flip to 'stacked' — localStorage + the cc-pblayout CustomEvent, NO reload.
    stacked = await page.evaluate(() => {
      localStorage.setItem("cc_pblayout", "stacked");
      window.dispatchEvent(new CustomEvent("cc-pblayout", { detail: "stacked" }));
      return true;
    });
    await page.waitForTimeout(900);
    stacked = await page.evaluate(() => {
      const board = document.querySelector("[data-week-edit-board]");
      if (!board) return { board: false };
      // Empty cells carry the CSS-module cellEmpty class (readable dev prefix).
      const emptyCells = board.querySelectorAll('[class*="cellEmpty"]').length;
      return {
        board: true,
        layout: board.getAttribute("data-layout"),
        emptyCells,
      };
    });
  } catch (e) {
    err = e.message.slice(0, 200);
  }
  const okBoard = !err && aligned?.board === true && aligned?.layout === "aligned";
  assert("C:board", "Week edit board renders in aligned layout", okBoard, err ?? JSON.stringify(aligned));
  const okFirst = !err && aligned?.firstPeriodText === "Period 1";
  assert(
    "C:board",
    'first aligned rail cell (.va-ph) reads "Period 1"',
    okFirst,
    err ?? `first=${aligned?.firstPeriodText} periodRows=${aligned?.periodRows}`,
  );
  const dayCountNum = Number(aligned?.dayCountVar);
  const okDayHeads =
    !err && Number.isFinite(dayCountNum) && dayCountNum > 0 && aligned?.dayHeadCount === dayCountNum;
  assert(
    "C:board",
    "day headers == derived week length (--day-count)",
    okDayHeads,
    err ?? `--day-count=${aligned?.dayCountVar} dayHeadCount=${aligned?.dayHeadCount}`,
  );
  // Clustering is a NOTE (the Sun–Thu fixture derives a small, clustered row
  // count — not one row per lesson). Assert only that it's clustered: a small
  // positive count no larger than a generous ceiling.
  const okClustered = !err && aligned?.periodRows >= 1 && aligned?.periodRows <= 12;
  assert(
    "C:board",
    "aligned rows are clustered (small derived period count, not per-lesson)",
    okClustered,
    err ?? `periodRows=${aligned?.periodRows}`,
  );
  console.log(
    `NOTE  [C:board] aligned derived period rows = ${aligned?.periodRows} (clustered; Sun–Thu fixture) ; --day-count=${aligned?.dayCountVar}`,
  );
  const okLiveFlip = !err && stacked?.board === true && stacked?.layout === "stacked";
  assert(
    "C:board",
    "cc-pblayout event flips data-layout to 'stacked' live (no reload)",
    okLiveFlip,
    err ?? `layout=${stacked?.layout}`,
  );
  const okNoEmpty = !err && stacked?.emptyCells === 0;
  assert(
    "C:board",
    "stacked layout has ZERO empty cells (each day one contiguous stack)",
    okNoEmpty,
    err ?? `emptyCells=${stacked?.emptyCells}`,
  );
  await shotOnFail(page, okBoard && okFirst && okDayHeads && okLiveFlip && okNoEmpty, "board");
  await page.close();
  await ctx.close();
}

// ── C-rail: the resources rail is suppressed in Week EDIT ────────────────────
// Branch update (head 1968fb3): while Week is in Edit, WeeklyShell returns the
// WeekEditBoard early — the board is a full-width single grid slot and the
// [data-pane="rail"] resources rail never renders. In View it IS present. This
// asserts that contract on both sides.
{
  // View: rail present.
  let viewRail = null;
  {
    const ctx = await newCtx(null);
    const page = await ctx.newPage();
    try {
      const authed = await gotoAuthed(page, "/weekly");
      if (authed) {
        await waitVisible(page, '[data-pane="rail"], [data-week-edit-board]', 30000);
        viewRail = await page.evaluate(() => ({
          rail: !!document.querySelector('[data-pane="rail"]'),
          board: !!document.querySelector("[data-week-edit-board]"),
        }));
      }
    } catch {}
    await page.close();
    await ctx.close();
  }
  // Edit: rail absent, board present.
  let editRail = null;
  {
    const ctx = await newCtx({ [LS.editmode]: JSON.stringify({ Week: true }) });
    const page = await ctx.newPage();
    try {
      const authed = await gotoAuthed(page, "/weekly");
      if (authed) {
        await waitForMounted(page, "[data-week-edit-board]");
        editRail = await page.evaluate(() => ({
          rail: !!document.querySelector('[data-pane="rail"]'),
          board: !!document.querySelector("[data-week-edit-board]"),
        }));
      }
    } catch {}
    await page.close();
    await ctx.close();
  }
  assert(
    "C:rail",
    "resources rail PRESENT in Week View",
    viewRail?.rail === true && viewRail?.board === false,
    `view=${JSON.stringify(viewRail)}`,
  );
  assert(
    "C:rail",
    "resources rail ABSENT in Week Edit (board is full-width)",
    editRail?.rail === false && editRail?.board === true,
    `edit=${JSON.stringify(editRail)}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// GROUP D — C2 .theme-tint overlay check (an actual overlay sits above z-90)
// ═══════════════════════════════════════════════════════════════════════════
// The per-theme tint invariant already ran in Group A. C2's specific risk is
// the z-90 soft-light wash washing overlays BELOW it — so open a real overlay
// (the ViewTitle appearance popover) and assert it sits ABOVE the tint.
{
  const ctx = await newCtx({ [LS.theme]: "honey" }); // honey has a visible tint (opacity .4)
  const page = await ctx.newPage();
  let ok = false;
  let detail = "";
  try {
    await gotoAuthed(page, "/weekly");
    // The gear is a client control: it renders (visible) before React attaches
    // its onClick, so a single early click can land in the pre-hydration window
    // and silently no-op — the menu never opens (menuExists=false). Settle for
    // the same window hydratedNavClick uses, then retry the open until the
    // portaled .vt-menu mounts; hydration on a busy dev server (a concurrent
    // session compiling another route) can lag several seconds past the cog
    // becoming visible. Each no-op click does nothing and each real click opens,
    // so we break the instant .vt-menu attaches — never double-clicking a
    // successful open shut.
    await page.waitForSelector(".vt-cogbtn", { state: "visible", timeout: 30000 });
    await page.waitForTimeout(4000); // hydration settle so the onClick is live
    for (let i = 0; i < 5; i++) {
      await page.click(".vt-cogbtn");
      const opened = await page
        .waitForSelector(".vt-menu", { state: "attached", timeout: 3000 })
        .then(() => true)
        .catch(() => false);
      if (opened) break;
      await page.waitForTimeout(1000);
    }
    const z = await page.evaluate(() => {
      const tint = document.querySelector(".theme-tint");
      const menu = document.querySelector(".vt-menu");
      const tintZ = tint ? Number(getComputedStyle(tint).zIndex) : NaN;
      // The popover's stacking context: walk up for the nearest z-indexed
      // ancestor, but .vt-menu/.vt-menuwrap set it directly — read the wrap.
      const wrap = document.querySelector(".vt-menuwrap");
      const menuZ = menu ? Number(getComputedStyle(menu).zIndex) : NaN;
      const wrapZ = wrap ? Number(getComputedStyle(wrap).zIndex) : NaN;
      return { tintZ, menuZ, wrapZ, menuExists: !!menu };
    });
    // The popover (menu or its wrap) must resolve above the tint's z-90.
    const overlayZ = Number.isFinite(z.wrapZ) && z.wrapZ > 0 ? z.wrapZ : z.menuZ;
    ok = z.menuExists && Number.isFinite(overlayZ) && overlayZ > z.tintZ;
    detail = `tintZ=${z.tintZ} menuZ=${z.menuZ} wrapZ=${z.wrapZ} menuExists=${z.menuExists}`;
  } catch (e) {
    detail = e.message.slice(0, 200);
  }
  assert("D:theme-tint", "an open overlay (ViewTitle popover) sits ABOVE .theme-tint z-90", ok, detail);
  await shotOnFail(page, ok, "tint-overlay-z");
  await page.close();
  await ctx.close();
}

await browser.close();

// ── Summary ─────────────────────────────────────────────────────────────────
const groups = [...new Set(results.map((r) => r.group))];
console.log("\n" + "=".repeat(72));
console.log("W3.9 EXTENDED PROBE — results");
console.log("=".repeat(72));
for (const g of groups) {
  const rows = results.filter((r) => r.group === g);
  const pass = rows.filter((r) => r.ok).length;
  console.log(`\n[${g}]  ${pass}/${rows.length} passed`);
  for (const r of rows) {
    console.log(`  ${r.ok ? "ok  " : "FAIL"} ${r.name}${r.ok ? "" : `  — ${r.detail}`}`);
  }
}
const fails = results.filter((r) => !r.ok);
console.log("\n" + "-".repeat(72));
console.log(`TOTAL: ${results.length - fails.length}/${results.length} passed`);
if (fails.length) {
  console.log(`\n${fails.length} FAILURE(S):`);
  for (const r of fails) console.log(`  - [${r.group}] ${r.name}: ${r.detail}`);
  console.log(`\nFailure screenshots: ${SHOT_DIR}`);
  process.exitCode = 1;
} else {
  console.log("\nALL W3.9 ASSERTIONS PASS.");
}
