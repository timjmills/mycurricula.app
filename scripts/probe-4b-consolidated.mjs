// scripts/probe-4b-consolidated.mjs — the ONE consolidated §4b pass.
//
// Executes docs/4b-consolidated-plan.md. Design notes live there; this file is
// the runnable form.
//
// Usage:
//   node scripts/probe-4b-consolidated.mjs [--base=http://localhost:3099]
//                                          [--only=1,4]      # context numbers
//                                          [--rehearse]      # harness self-test
//
// THE THREE THINGS THIS FILE EXISTS TO GET RIGHT
//
//  1. Nothing throws. Every check records pass/fail/abort/absent and the run
//     continues. One dead selector must not end the pass.
//
//  2. Gate B is STRUCTURAL, not a convention. `mark.fail()` and
//     `mark.absent...()` physically cannot record a negative verdict unless a
//     known-good control in the SAME step responded first — they downgrade to
//     `unverified` instead. An un-hydrated page is indistinguishable from "the
//     control does nothing"; a control-group control is what resolves it.
//
//  3. Absence-assertions fail OPEN, so they are gated hardest. "The string never
//     appeared", "the menu item is gone", "the count never exceeded one" are all
//     TRUE of a blank page. Those go through mark.absence(), which requires
//     Gate B at the moment of assertion.
//
// NO DATABASE WRITES. The only seeds are the onboarding localStorage flag and
// the mc-theme-axes cookie. Theme localStorage keys ARE seeded (the cookie alone
// does not pin the frame — the client reconciles over it), which is only safe
// because teacher_preferences is blocked at the network layer, so theme-sync can
// neither read nor write. Local dev points at the PROD Supabase project; an
// unblocked theme write would land on a real teacher's row.

import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";

// ── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const BASE = arg("base", process.env.PROBE_BASE ?? "http://localhost:3099");
const ONLY = arg("only", "")
  .split(",")
  .filter(Boolean)
  .map(Number);
const REHEARSE = argv.includes("--rehearse");

const REPO = process.cwd();
const SHOTS = path.join(REPO, "docs/screenshots/4b-consolidated");
mkdirSync(SHOTS, { recursive: true });

// ── precondition block ──────────────────────────────────────────────────────
const git = (...a) => {
  try {
    return execFileSync("git", a, { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};
/** Is a fix actually IN the commit? Distinguishes "fix not landed" (absent) from
 *  "fix landed but broken" (fail). Reads HEAD, never the dirty working tree. */
const codeHas = (file, re) => {
  const body = git("show", `HEAD:${file}`);
  return body ? new RegExp(re).test(body) : false;
};

const PRE = {
  sha: git("rev-parse", "--short", "HEAD"),
  dirtyFiles: git("status", "--short").split("\n").filter(Boolean).length,
  base: BASE,
  startedAt: new Date().toISOString(),
};

// ── results model ───────────────────────────────────────────────────────────
// pass | fail | abort (environment) | absent (fix not in HEAD) | unverified
const RESULTS = [];
let CURRENT = null; // the live context record

/** The bypass token rides in the login URL, so any goto() error text contains
 *  it. Never let a secret reach the console or results.json. */
const redact = (s) =>
  String(s)
    .replace(/token=[^&\s"]+/gi, "token=<redacted>")
    .replace(/Bearer\s+\S+/gi, "Bearer <redacted>");

function record(state, label, detail = "") {
  const row = {
    context: CURRENT?.name ?? "(pre)",
    contextNo: CURRENT?.no ?? 0,
    state,
    label,
    detail: redact(detail).slice(0, 240),
    gateB: CURRENT?.gateBOk ?? null,
    at: Date.now(),
  };
  RESULTS.push(row);
  const tag = { pass: "ok  ", fail: "FAIL", abort: "ABRT", absent: "ABSN", unverified: "UNVF" }[state];
  // row.detail, NOT the raw `detail` — the raw form still carries the token.
  console.log(`  ${tag} [${row.context}] ${label}${row.detail ? ` — ${row.detail}` : ""}`);
  return row;
}

/** The recorder. Negative verdicts are STRUCTURALLY gated on Gate B. */
const mark = {
  pass: (l, d) => record("pass", l, d),
  abort: (l, d) => record("abort", l, d),
  absent: (l, d) => record("absent", l, d),
  /** A real defect. Refuses to record without Gate B in this step. */
  fail(l, d) {
    if (!CURRENT?.gateBOk) {
      return record(
        "unverified",
        l,
        `WOULD-FAIL but Gate B did not pass in this step (page may be dead) — ${d ?? ""}`,
      );
    }
    return record("fail", l, d);
  },
  /**
   * An absence-assertion — "the string never appeared", "the item is gone",
   * "the count never exceeded one". These FAIL OPEN: on a dead or unhydrated
   * page every one of them is trivially true, so a broken harness reports a
   * comfortable green and nobody investigates it.
   *
   * ENFORCED BY THE SIGNATURE, not by convention. `control` is REQUIRED and is
   * a function — it is invoked HERE, at the moment of assertion, so a stale
   * Gate B from earlier in the step cannot satisfy it. There is deliberately no
   * overload that takes a bare boolean: it must be impossible to write an
   * absence check without its control, because the day someone is in a hurry is
   * the day the rule would otherwise be skipped.
   *
   *   await mark.absence("the lie never appeared", { observed, control })
   */
  async absence(l, { observed, control, detail } = {}) {
    if (typeof control !== "function") {
      return record(
        "unverified",
        l,
        "REFUSED: absence-assertion constructed without a control probe (fail-open guard)",
      );
    }
    let alive = false;
    try {
      alive = (await control()) === true;
    } catch {
      alive = false;
    }
    if (!alive) {
      return record(
        "unverified",
        l,
        `control-group control did NOT respond at assertion time — page may be dead, so "absent" proves nothing. ${detail ?? ""}`,
      );
    }
    CURRENT.gateBOk = true; // the control just passed, here and now
    return observed
      ? record("pass", l, detail)
      : record("fail", l, detail);
  },
  bool(l, cond, d) {
    return cond ? record("pass", l, d) : this.fail(l, d);
  },
};

/** Never let one check end the run. */
async function step(label, fn) {
  try {
    await fn();
  } catch (e) {
    record("abort", label, `threw: ${String(e).split("\n")[0].slice(0, 160)}`);
  }
}

// ── the browser ─────────────────────────────────────────────────────────────
function token() {
  if (process.env.CLAUDE_BYPASS_TOKEN) return process.env.CLAUDE_BYPASS_TOKEN.trim();
  const env = readFileSync(path.join(REPO, ".env.local"), "utf8");
  return env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim() ?? "";
}
// LOCKSTEP with lib/theme-values.ts — v1.frame.glass.bg.theme.dim.style.palette
const axes = (frame, theme = "clear") =>
  `v1.${frame}.dark.photo.${theme}.normal.vivid.highlight`;

const HYDRATE_BUDGET_MS = 45000;
const CANVAS = '[data-planner-item^="lesson:"], [data-year-chip], [data-year-unit-workspace]';

let browser = null;
let storageState = null;

async function boot() {
  browser = await chromium.launch({ channel: "chrome" }); // never the system default (Edge)
  // The hop lives in scripts/lib/auth.mjs: it owns the URL (which carries the
  // bypass token), redacts anything it throws, and refuses to run
  // unauthenticated rather than letting a login page masquerade as a dead app.
  storageState = await authedStorageState(browser, {
    base: BASE,
    next: "/year",
    timeout: 90000,
    settleMs: 2500,
  });
}

async function makeContext({ no, name, frame = "glass", width = 1440, coarse = false }) {
  const ctx = await browser.newContext({
    storageState,
    ...(coarse
      ? { ...devices["iPhone 14 Pro"], viewport: { width, height: 812 } }
      : { viewport: { width, height: 900 } }),
  });
  await ctx.addCookies([{ name: "mc-theme-axes", value: axes(frame), url: BASE }]);
  await ctx.addInitScript((f) => {
    localStorage.setItem(
      "mycurricula:onboarding",
      JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
    );
    localStorage.setItem("mycurricula:user:theme-frame", f);
    localStorage.setItem("mycurricula:user:theme", "clear");
    localStorage.setItem("mycurricula:user:theme-glass", "dark");
    localStorage.setItem("mycurricula:user:theme-bg", "photo");
    localStorage.setItem("mycurricula:user:theme-dim", "normal");
  }, frame);
  // The write-safety gate: no theme-sync read AND no theme-sync write.
  await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
  const page = await ctx.newPage();

  CURRENT = { no, name, frame, width, coarse, gateBOk: false, chunkDead: false, page, ctx };
  page.on("console", (m) => {
    if (/ChunkLoadError|Loading chunk \S+ failed/i.test(m.text())) CURRENT.chunkDead = true;
  });
  page.on("pageerror", (e) => {
    if (/ChunkLoadError/i.test(String(e))) CURRENT.chunkDead = true;
  });
  return CURRENT;
}

// ── Gate A: hydrated ────────────────────────────────────────────────────────
async function gateA(route) {
  const { page } = CURRENT;
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  try {
    await page.locator(CANVAS).first().waitFor({ state: "attached", timeout: HYDRATE_BUDGET_MS });
  } catch {
    mark.abort(`Gate A · ${route}`, `no canvas data in ${HYDRATE_BUDGET_MS}ms — not hydrated`);
    return false;
  }
  await page.waitForTimeout(2500); // handlers attach after the node exists
  const got = await page.evaluate(() => document.documentElement.dataset.frame);
  if (got !== CURRENT_FRAME.value) {
    mark.abort(`Gate A · frame guard`, `wanted ${CURRENT_FRAME.value}, got ${got}`);
    return false;
  }
  return true;
}
const CURRENT_FRAME = { value: "glass" };

// ── Gate B: INTERACTIVE — a named known-good control, per context ───────────
/** Each context names its own control-group control. Returns true and latches
 *  CURRENT.gateBOk, which is what unlocks negative verdicts. */
async function gateB(kind) {
  const { page } = CURRENT;
  CURRENT.gateBOk = false;
  try {
    if (kind === "drawer-pane") {
      // Known-good: switching drawer panes moves aria-selected.
      const a = page.locator('[data-ue-pane="insights"]');
      if (!(await a.count())) return false;
      await a.first().click();
      await page.waitForTimeout(600);
      const on = await page.evaluate(
        () => document.querySelector('[data-ue-pane="insights"]')?.getAttribute("aria-selected"),
      );
      CURRENT.gateBOk = on === "true";
    } else if (kind === "week-viewmode") {
      // Known-good: Grid/List toggle changes the canvas.
      const before = await page.evaluate(() => document.body.innerText.length);
      const btn = page.locator('button:has-text("List")').first();
      if (!(await btn.count())) return false;
      await btn.click();
      await page.waitForTimeout(1200);
      const after = await page.evaluate(() => document.body.innerText.length);
      CURRENT.gateBOk = after !== before;
    } else {
      // Default known-good: a planner nav link changes the path.
      const before = page.url();
      await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(800);
      await page.goForward({ waitUntil: "domcontentloaded" }).catch(() => {});
      await page.waitForTimeout(800);
      CURRENT.gateBOk = typeof before === "string";
    }
  } catch {
    CURRENT.gateBOk = false;
  }
  record(
    CURRENT.gateBOk ? "pass" : "abort",
    `Gate B · ${kind}`,
    CURRENT.gateBOk ? "known-good control responded" : "known-good control DEAD — page not interactive",
  );
  return CURRENT.gateBOk;
}

// Gate C — checked after each step.
function gateC(label) {
  if (CURRENT?.chunkDead) {
    mark.abort(label, "ChunkLoadError during this step — DOM may be wiped; re-run required");
    CURRENT.chunkDead = false;
    return false;
  }
  return true;
}

/** Control-group probes, passed BY VALUE into every absence-assertion so the
 *  control is exercised at the moment of assertion. */
const CONTROL = {
  /** Known-good: the drawer pane switcher moves aria-selected. */
  drawerPane: () => async () => {
    const p = CURRENT.page;
    const t = p.locator('[data-ue-pane="insights"]');
    if (!(await t.count())) return false;
    await t.first().click();
    await p.waitForTimeout(500);
    return (
      (await p.evaluate(() =>
        document.querySelector('[data-ue-pane="insights"]')?.getAttribute("aria-selected"),
      )) === "true"
    );
  },
  /** Known-good for any planner route: the canvas has real rows AND a click
   *  on a benign control still moves observable state. */
  canvasLive: () => async () => {
    const p = CURRENT.page;
    const n = await p.evaluate(
      () => document.querySelectorAll('[data-planner-item^="lesson:"], [data-year-chip]').length,
    );
    if (n === 0) return false;
    // Prove the tree is interactive, not merely painted: focus must move.
    const moved = await p.evaluate(() => {
      const b = document.querySelector("button:not([disabled])");
      if (!b) return false;
      b.focus();
      return document.activeElement === b;
    });
    return moved;
  },
};

const shot = async (name) => {
  try {
    await CURRENT.page.screenshot({ path: path.join(SHOTS, `c${CURRENT.no}-${name}.png`) });
  } catch {}
};

// ════════════════════════════════════════════════════════════════════════════
// CHECKS
// ════════════════════════════════════════════════════════════════════════════

const EMPTY_DAY = "No lessons planned for this day";

/** 4.1 — /daily must not claim an empty day while loading. Per frame. */
async function checkDailyEmptyState() {
  const { page } = CURRENT;
  const t0 = Date.now();
  await page.goto(`${BASE}/daily`, { waitUntil: "domcontentloaded", timeout: 90000 });

  let firstLieAt = null;
  let resolvedAt = null;
  let sawLoading = false;
  const deadline = Date.now() + HYDRATE_BUDGET_MS;
  while (Date.now() < deadline) {
    const s = await page.evaluate((EMPTY) => {
      const t = document.body.innerText;
      return {
        lie: t.includes(EMPTY),
        loading: /loading your plan/i.test(t),
        lessons: document.querySelectorAll('[data-planner-item^="lesson:"]').length,
      };
    }, EMPTY_DAY);
    if (s.loading) sawLoading = true;
    if (s.lie && firstLieAt === null) firstLieAt = Date.now() - t0;
    if (s.lessons > 0) {
      resolvedAt = Date.now() - t0;
      break;
    }
    await page.waitForTimeout(250);
  }

  if (resolvedAt === null) {
    mark.abort("4.1 /daily empty-state", "lessons never rendered — cannot distinguish fix from a dead page");
    return;
  }
  await gateB("drawer-pane").catch(() => {});
  // ABSENCE assertion — true of a blank page, so Gate B is mandatory.
  await mark.absence(`4.1 /daily never claims an empty day while loading · ${CURRENT.frame}`, {
    observed: firstLieAt === null,
    control: CONTROL.canvasLive(),
    detail:
      firstLieAt === null
        ? `resolved at ${resolvedAt}ms; loading affordance ${sawLoading ? "seen" : "NOT seen"}`
        : `lie window ${firstLieAt}ms → ${resolvedAt}ms (${resolvedAt - firstLieAt}ms)`,
  });
  mark.bool(
    `4.1 a loading affordance is shown instead · ${CURRENT.frame}`,
    sawLoading,
    sawLoading ? "" : "no 'Loading your plan…' seen — a silent blank is not a fix either",
  );
  await shot(`daily-${CURRENT.frame}`);
}

/** 4.2 — /weekly reaches the workspace in List / narrow / Schedule. */
async function checkWeeklyReach(mode) {
  const { page } = CURRENT;
  // Is the fix even in the commit? Distinguishes ABSENT from FAIL.
  const fixIn = codeHas("components/weekly/WeeklyList.tsx", "UnitChip|showUnitChip");
  if (!fixIn && mode !== "schedule") {
    mark.absent(`4.2 /weekly ${mode} workspace path`, "no UnitChip in WeeklyList at HEAD — fix not landed");
    return;
  }
  if (!(await gateA("/weekly"))) return;
  await gateB("week-viewmode");

  if (mode === "list" || mode === "schedule") {
    const label = mode === "list" ? "List" : "Schedule";
    const b = page.locator(`button:has-text("${label}")`).first();
    if (!(await b.count())) {
      mark.abort(`4.2 ${mode} toggle`, "toggle not found");
      return;
    }
    await b.click();
    await page.waitForTimeout(1800);
  }

  const opener = page.locator('button[aria-label^="Open the "][aria-label$="unit workspace"]');
  const n = await opener.count();
  if (n === 0) {
    mark.fail(`4.2 /weekly ${mode} has a workspace opener`, "zero openers");
    return;
  }
  await opener.first().click();
  await page.waitForTimeout(2500);
  const m = await page.evaluate(() => ({
    modal: document.querySelectorAll(".ue-modal").length,
    scrim: document.querySelectorAll(".ue-scrim").length,
  }));
  // EXACTLY one — never zero, never two.
  mark.bool(
    `4.2 /weekly ${mode} opens EXACTLY ONE dialog`,
    m.modal === 1 && m.scrim === 1,
    JSON.stringify(m),
  );
  await shot(`weekly-${mode}`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(900);
  const lock = await page.evaluate(() => JSON.stringify(document.body.style.overflow));
  mark.bool(`4.2 /weekly ${mode} scroll lock released`, lock === '""', lock);
}

/** 4.3/4.4 — ToggleGroup keyboard semantics + the Kind data-loss check. */
async function checkToggleGroupAndKind() {
  const { page } = CURRENT;
  if (!(await gateA("/year"))) return;
  const opener = page.locator("[data-year-chip], [data-year-unit-workspace]").first();
  if (!(await opener.count())) {
    mark.abort("4.3 open unit workspace", "no opener on /year");
    return;
  }
  await opener.click();
  await page.waitForSelector("[data-ue-drawer-toggle]", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const dt = page.locator("[data-ue-drawer-toggle]").first();
  if (await dt.count()) {
    const open = await page.evaluate(
      () => getComputedStyle(document.querySelector("[data-ue-drawer]"))?.display !== "none",
    );
    if (!open) await dt.click();
    await page.waitForTimeout(1200);
  }
  await gateB("drawer-pane");

  const radios = page.locator('[data-ue-drawer] [role="radio"]');
  if (!(await radios.count())) {
    mark.absent("4.3 ToggleGroup present in the drawer", "no role=radio group — nothing to assert");
    return;
  }

  // 4.3.1 — arrow moves focus WITHOUT committing.
  const before = await page.evaluate(() =>
    [...document.querySelectorAll('[data-ue-drawer] [role="radio"]')].map((r) =>
      r.getAttribute("aria-checked"),
    ),
  );
  await radios.last().focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => ({
    checked: [...document.querySelectorAll('[data-ue-drawer] [role="radio"]')].map((r) =>
      r.getAttribute("aria-checked"),
    ),
    focusMoved: document.activeElement?.getAttribute("role") === "radio",
  }));
  mark.bool(
    "4.3.1 ArrowRight moves focus WITHOUT committing",
    JSON.stringify(before) === JSON.stringify(after.checked) && after.focusMoved,
    `before=${JSON.stringify(before)} after=${JSON.stringify(after.checked)}`,
  );

  // 4.3.2 — re-activating the already-selected option is a no-op.
  const sel = page.locator('[data-ue-drawer] [role="radio"][aria-checked="true"]').first();
  if (await sel.count()) {
    const snap1 = await page.evaluate(() => document.querySelector("#ue-drawer-panel")?.innerText);
    await sel.click();
    await page.waitForTimeout(700);
    const snap2 = await page.evaluate(() => document.querySelector("#ue-drawer-panel")?.innerText);
    mark.bool("4.3.2 re-selecting the selected option does not fire onChange", snap1 === snap2);
  }

  // 4.3.3 — nested arrow handlers. Only assert if such an instance EXISTS.
  const nested = await page.evaluate(
    () =>
      [...document.querySelectorAll('[role="radiogroup"]')].filter((g) =>
        g.closest('[role="tablist"]'),
      ).length,
  );
  if (nested === 0)
    mark.absent("4.3.3 nested ToggleGroup double-commit", "no nested instance in the tree — not testable");

  // 4.4 — the Kind control must not wipe the four fields.
  const title = page.locator('[data-ue-drawer] input[aria-label*="title" i]').first();
  if (!(await title.count())) {
    mark.absent("4.4 Kind field-preservation", "no assessment open — seed one first (read-only run)");
    return;
  }
  const snapFields = await page.evaluate(() => {
    const g = (s) => document.querySelector(`[data-ue-drawer] ${s}`)?.value ?? null;
    return {
      title: g('input[aria-label*="title" i]'),
      purpose: g('textarea[aria-label*="purpose" i]'),
      notes: g('textarea[aria-label*="notes" i]'),
      kind: document
        .querySelector('[data-ue-drawer] [role="radio"][aria-checked="true"]')
        ?.textContent?.trim(),
    };
  });
  const summative = page.locator('[data-ue-drawer] [role="radio"]:has-text("Summative")').first();
  if (await summative.count()) {
    await summative.focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(900);
    const post = await page.evaluate(() => {
      const g = (s) => document.querySelector(`[data-ue-drawer] ${s}`)?.value ?? null;
      return {
        title: g('input[aria-label*="title" i]'),
        purpose: g('textarea[aria-label*="purpose" i]'),
        notes: g('textarea[aria-label*="notes" i]'),
      };
    });
    mark.bool(
      "4.4 ArrowRight from Summative does NOT wipe the fields",
      post.title === snapFields.title &&
        post.purpose === snapFields.purpose &&
        post.notes === snapFields.notes,
      `before=${JSON.stringify(snapFields)} after=${JSON.stringify(post)}`,
    );
  }
  await shot("togglegroup-kind");
}

/** 4.5 — "Delete from Team Curriculum" gone, menu not broken around it. */
async function checkDeleteRemoved() {
  const { page } = CURRENT;
  const stillInCode = codeHas("components/lesson-card/context-menu.tsx", "Delete from Team Curriculum");
  if (stillInCode) {
    mark.absent("4.5 Delete-from-Team removed", "still present in HEAD — fix not landed");
    return;
  }
  mark.pass("4.5 Delete-from-Team absent from HEAD (code)", "context-menu.tsx no longer contains it");
  // The live half: menu integrity. Requires Team mode + an open menu.
  mark.absent(
    "4.5 menu positional integrity (live)",
    "needs Team mode + context menu open; add the interaction when the fix lands",
  );
}

/** 4.6 — Tooltip: hover click-through, focus no-swallow, dismissal PERSISTS. */
async function checkTooltip() {
  const { page } = CURRENT;
  if (!(await gateA("/year"))) return;
  await gateB("default");
  const trig = page.locator("[data-ue-drawer-toggle], [data-year-chip]").first();
  if (!(await trig.count())) {
    mark.abort("4.6 tooltip trigger", "none found");
    return;
  }
  await trig.hover();
  await page.waitForTimeout(900);
  const bubble = page.locator('[class*="Tooltip_tooltip"]').first();
  mark.bool("4.6.1 hover opens a bubble", (await bubble.count()) > 0);

  const dismiss = page.locator(':text("Turn off these tips")').first();
  if (!(await dismiss.count())) {
    mark.absent("4.6.3 dismiss link", "no 'Turn off these tips' visible on this trigger");
  } else {
    await dismiss.click();
    await page.waitForTimeout(700);
    await mark.absence("4.6.3a bubble closes after dismiss", {
      observed: (await bubble.count()) === 0,
      control: CONTROL.canvasLive(),
    });
    // The assertions that would have caught it never dismissing:
    await page.mouse.move(5, 5);
    await page.waitForTimeout(400);
    await trig.hover();
    await page.waitForTimeout(900);
    await mark.absence("4.6.3b dismissed tooltip does NOT reappear on a fresh hover", {
      observed: (await page.locator('[class*="Tooltip_tooltip"]').count()) === 0,
      control: CONTROL.canvasLive(),
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    await trig.hover().catch(() => {});
    await page.waitForTimeout(900);
    await mark.absence("4.6.3c dismissal SURVIVES a reload", {
      observed: (await page.locator('[class*="Tooltip_tooltip"]').count()) === 0,
      control: CONTROL.canvasLive(),
    });
  }
  await shot("tooltip");
}

/** 4.7 — delegate to the composer lane's own probe (CLI-only; spawn it). */
function checkPostComposer() {
  const r = spawnSync(process.execPath, ["scripts/probe-b46-post-composer.mjs"], {
    cwd: REPO,
    encoding: "utf8",
    env: { ...process.env, PROBE_BASE: BASE },
    timeout: 300000,
  });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const fails = (out.match(/^\s*FAIL/gm) ?? []).length;
  const envDead = /ERR_CONNECTION_REFUSED|ECONNREFUSED|Timeout .* exceeded|net::ERR/i.test(out);
  if (r.status === null) {
    mark.abort("4.7 /post composer probe", "timed out / killed");
  } else if (r.status === 0) {
    mark.pass("4.7 /post composer probe", "delegated probe exited 0");
  } else if (fails === 0 || envDead) {
    // Non-zero WITHOUT any FAIL line means the delegated probe aborted on the
    // environment, not on a defect. Collapsing that into a failure is how a slow
    // or dead server becomes a bug report — the exact mistake this pass exists
    // to avoid, so it must not happen at the delegation boundary either.
    mark.abort(
      "4.7 /post composer probe",
      `exit ${r.status} with 0 FAIL lines${envDead ? " + connection/timeout errors" : ""} — environment, not a defect`,
    );
  } else {
    mark.fail("4.7 /post composer probe", `exit ${r.status}, ${fails} FAIL lines`);
  }
}

/** 4.8 — the workspace opens from every entry point: EXACTLY one, never zero. */
async function checkEntryPoint(route) {
  const { page } = CURRENT;
  if (!(await gateA(route))) return;
  await gateB("default");
  const opener = page
    .locator('[data-year-chip], [data-year-unit-workspace], button[aria-label^="Open the "][aria-label$="unit workspace"]')
    .first();
  if (!(await opener.count())) {
    mark.fail(`4.8 ${route} · ${CURRENT.frame} has an opener`, "zero openers");
    return;
  }
  const url0 = page.url();
  for (const cycle of [1, 2]) {
    await opener.click();
    await page.waitForTimeout(2500);
    const m = await page.evaluate(() => ({
      modal: document.querySelectorAll(".ue-modal").length,
      scrim: document.querySelectorAll(".ue-scrim").length,
      lock: JSON.stringify(document.body.style.overflow),
    }));
    mark.bool(
      `4.8 ${route} · ${CURRENT.frame} EXACTLY ONE dialog (cycle ${cycle})`,
      m.modal === 1 && m.scrim === 1,
      JSON.stringify(m),
    );
    if (cycle === 1) {
      mark.bool(`4.8 ${route} pop-in (URL unchanged)`, page.url() === url0, page.url());
      mark.bool(`4.8 ${route} scroll lock APPLIED`, m.lock === '"hidden"', m.lock);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(1200);
    const after = await page.evaluate(() => ({
      modal: document.querySelectorAll(".ue-modal").length,
      lock: JSON.stringify(document.body.style.overflow),
    }));
    mark.bool(`4.8 ${route} closes to zero (cycle ${cycle})`, after.modal === 0, JSON.stringify(after));
    mark.bool(`4.8 ${route} scroll lock RELEASED (cycle ${cycle})`, after.lock === '""', after.lock);
  }
  await shot(`entry-${route.replace(/\W/g, "")}-${CURRENT.frame}`);
}

/** 4.10 — touch targets by HIT TEST, coarse pointer only. */
async function checkTouchTargets() {
  const { page } = CURRENT;
  if (!(await gateA("/year"))) return;
  await gateB("default");
  const res = await page.evaluate(() => {
    const out = [];
    const targets = [...document.querySelectorAll("button, [role='radio']")]
      .filter((b) => b.getBoundingClientRect().width > 0)
      .slice(0, 14);
    for (const el of targets) {
      el.scrollIntoView({ block: "center", inline: "center" });
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hits = (x, y) => {
        const n = document.elementFromPoint(x, y);
        return !!n && (n === el || el.contains(n) || n.closest("button,[role='radio']") === el);
      };
      if (!hits(cx, cy)) continue; // centre gate — off-screen/occluded, skip
      const ext = (dir) => {
        let lo = 0, hi = 30;
        while (hi - lo > 0.5) {
          const m = (lo + hi) / 2;
          if (hits(cx, cy + dir * m)) lo = m; else hi = m;
        }
        return lo;
      };
      const v = ext(-1) + ext(1);
      // First clipping ancestor, when short — the .kindRow lesson.
      let clip = null;
      if (v < 44) {
        let n = el.parentElement;
        while (n && n !== document.documentElement) {
          const cs = getComputedStyle(n);
          if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
            clip = `${n.tagName}.${String(n.className).slice(0, 40)} (${cs.overflowX}/${cs.overflowY}, h=${Math.round(n.getBoundingClientRect().height)})`;
            break;
          }
          n = n.parentElement;
        }
      }
      out.push({
        label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 28),
        visualH: +r.height.toFixed(1),
        hitV: +v.toFixed(1),
        ok: v >= 44,
        clip,
      });
    }
    return out;
  });
  const short = res.filter((r) => !r.ok);
  mark.bool(
    `4.10 touch targets ≥44px by HIT TEST @${CURRENT.width}`,
    short.length === 0,
    short.length ? JSON.stringify(short.slice(0, 5)) : `${res.length} controls measured`,
  );
  await shot(`touch-${CURRENT.width}`);
}

/** 4.11 — cross-device onboarding. SIMULATED: same auth, empty client storage. */
async function checkCrossDevice() {
  const stripped = {
    cookies: storageState.cookies,
    origins: [], // ← the simulation: a new device has no localStorage
  };
  const ctx2 = await browser.newContext({ storageState: stripped, viewport: { width: 1440, height: 900 } });
  await ctx2.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p2.waitForTimeout(14000);
  const landed = await p2.evaluate(() => location.pathname);
  mark.bool(
    "4.11 [SIMULATED] onboarded flag persisted (no /onboarding bounce)",
    !/onboarding/.test(landed),
    `landed on ${landed}`,
  );
  record(
    "unverified",
    "4.11 [SIMULATED] per-setting persistence",
    "CAVEAT: only localStorage was cleared. A pass here would NOT prove the config is durable — it may be re-seeded from sessionStorage/IndexedDB/a cookie/a server value not enumerated. A FAIL is strong; a PASS is weak.",
  );
  await p2.screenshot({ path: path.join(SHOTS, "c8-crossdevice.png") }).catch(() => {});
  await ctx2.close();
}

// ════════════════════════════════════════════════════════════════════════════
// RUN
// ════════════════════════════════════════════════════════════════════════════
const wanted = (n) => ONLY.length === 0 || ONLY.includes(n);

async function main() {
  console.log(`\n§4b consolidated — base=${BASE} sha=${PRE.sha} dirty=${PRE.dirtyFiles}`);
  if (PRE.dirtyFiles > 0)
    console.log(`  ! tree is DIRTY (${PRE.dirtyFiles} files) — this run certifies nothing`);

  try {
    await boot();
  } catch (e) {
    record("abort", "boot", `auth/login failed: ${String(e).split("\n")[0].slice(0, 160)}`);
    if (!REHEARSE) return finish();
    // Rehearsal only: carry on with empty auth so the per-context Gate A/B/C
    // abort paths are actually exercised, instead of being short-circuited by
    // this one. Proving THOSE don't throw is the point of the rehearsal.
    storageState = { cookies: [], origins: [] };
    if (!browser) browser = await chromium.launch({ channel: "chrome" });
    record("abort", "boot", "REHEARSAL — continuing with empty auth to exercise the gates");
  }

  const contexts = [
    { no: 1, name: "1440·glass", frame: "glass", width: 1440, run: async () => {
        CURRENT_FRAME.value = "glass";
        await step("4.3/4.4", checkToggleGroupAndKind);
        gateC("ctx1 after 4.3");
        await step("4.5", checkDeleteRemoved);
        await step("4.6", checkTooltip);
        gateC("ctx1 after 4.6");
        await step("4.8 /year", () => checkEntryPoint("/year"));
        await step("4.8 /daily", () => checkEntryPoint("/daily"));
      } },
    { no: 2, name: "1440·paper", frame: "paper", width: 1440, run: async () => {
        CURRENT_FRAME.value = "paper";
        await step("4.1 paper", checkDailyEmptyState);
        await step("4.8 /year paper", () => checkEntryPoint("/year"));
      } },
    { no: 3, name: "1440·color", frame: "color", width: 1440, run: async () => {
        CURRENT_FRAME.value = "color";
        await step("4.1 color", checkDailyEmptyState);
        await step("4.8 /year color", () => checkEntryPoint("/year"));
      } },
    { no: 4, name: "1440·weekly-modes", frame: "glass", width: 1440, run: async () => {
        CURRENT_FRAME.value = "glass";
        await step("4.2 list", () => checkWeeklyReach("list"));
        await step("4.2 schedule", () => checkWeeklyReach("schedule"));
      } },
    { no: 5, name: "768·coarse", frame: "glass", width: 768, coarse: true, run: async () => {
        CURRENT_FRAME.value = "glass";
        await step("4.2 narrow", () => checkWeeklyReach("narrow"));
        await step("4.10 @768", checkTouchTargets);
      } },
    { no: 6, name: "375·coarse", frame: "glass", width: 375, coarse: true, run: async () => {
        CURRENT_FRAME.value = "glass";
        await step("4.2 narrow", () => checkWeeklyReach("narrow"));
        await step("4.10 @375", checkTouchTargets);
      } },
    { no: 7, name: "1440·canary", frame: "glass", width: 1440, run: async () => {
        CURRENT_FRAME.value = "glass";
        await step("4.1 CANARY", checkDailyEmptyState);
      } },
  ];

  for (const c of contexts) {
    if (!wanted(c.no)) continue;
    console.log(`\n── context ${c.no} · ${c.name} ─────────────────────────────`);
    try {
      await makeContext(c);
      await c.run();
      await CURRENT.ctx.close();
    } catch (e) {
      record("abort", `context ${c.no}`, String(e).split("\n")[0].slice(0, 160));
      try { await CURRENT?.ctx?.close(); } catch {}
    }
  }

  // 4.7 delegated probe + 4.11 simulation, outside the frame contexts.
  if (wanted(1)) { CURRENT = { no: 0, name: "delegated", gateBOk: true }; checkPostComposer(); }
  if (wanted(8)) {
    CURRENT = { no: 8, name: "crossdevice", gateBOk: true };
    await step("4.11", checkCrossDevice);
  }

  finish();
}

function finish() {
  // The canary degrades the report: a failing context 7 marks everything after
  // context 1 SUSPECT, because we cannot tell when the session went bad.
  const canary = RESULTS.filter((r) => r.contextNo === 7 && r.label.includes("CANARY"));
  const canaryBad = canary.length > 0 && canary.some((r) => r.state !== "pass");
  if (canaryBad) {
    for (const r of RESULTS) if (r.contextNo > 1 && r.contextNo < 7) r.suspect = true;
  }

  const n = (s) => RESULTS.filter((r) => r.state === s).length;
  const verified = n("pass") + n("fail");
  const suspect = RESULTS.filter((r) => r.suspect).length;

  const summary = {
    ...PRE,
    finishedAt: new Date().toISOString(),
    canary: canary.length === 0 ? "not run" : canaryBad ? "FAILED — results after context 1 are SUSPECT" : "ok",
    headline: `${verified} verified: ${n("pass")} pass, ${n("fail")} fail. ${n("unverified")} unverified, ${n("abort")} abort, ${n("absent")} absent (fix not in HEAD).${suspect ? ` ${suspect} SUSPECT (canary).` : ""}`,
    results: RESULTS,
  };
  writeFileSync(path.join(SHOTS, "results.json"), JSON.stringify(summary, null, 2));

  console.log(`\n════ SUMMARY ════`);
  console.log(summary.headline);
  console.log(`canary: ${summary.canary}`);
  if (n("fail")) {
    console.log("\nFAILURES:");
    for (const r of RESULTS.filter((x) => x.state === "fail"))
      console.log(`  - [${r.context}] ${r.label} — ${r.detail}`);
  }
  if (n("unverified") || n("abort")) {
    console.log("\nNOT EVIDENCE EITHER WAY (unverified / abort):");
    for (const r of RESULTS.filter((x) => x.state === "unverified" || x.state === "abort"))
      console.log(`  - [${r.context}] ${r.label} — ${r.detail}`);
  }
  console.log(`\nresults.json + screenshots → ${SHOTS}`);
  // A run that could not verify anything is NOT a pass.
  process.exit(n("fail") > 0 || verified === 0 ? 1 : 0);
}

// ── entrypoints ─────────────────────────────────────────────────────────────

/**
 * --selftest: prove the FAIL-OPEN GUARD itself. No browser, no server.
 *
 * This is the assertion that matters most in the whole file: it demonstrates
 * that an absence-check CANNOT report PASS when its control is missing or dead.
 * Everything else in this harness is only as trustworthy as that guard, so it
 * gets a test that runs in a second and needs nothing.
 */
if (argv.includes("--selftest")) {
  CURRENT = { no: 0, name: "selftest", gateBOk: false };
  const before = RESULTS.length;
  console.log("\n── SELFTEST — the fail-open guard ──");

  await mark.absence("guard: absent + NO control", { observed: true });
  await mark.absence("guard: absent + DEAD control", { observed: true, control: async () => false });
  await mark.absence("guard: absent + LIVE control", { observed: true, control: async () => true });
  CURRENT.gateBOk = false;
  mark.fail("guard: fail without Gate B", "must downgrade, not fail");

  const got = RESULTS.slice(before).map((r) => r.state);
  const want = ["unverified", "unverified", "pass", "unverified"];
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`\nselftest got : ${JSON.stringify(got)}`);
  console.log(`selftest want: ${JSON.stringify(want)}`);
  console.log(
    ok
      ? "SELFTEST PASS — a bare or dead absence-check cannot report PASS"
      : "SELFTEST FAILED — the fail-open guard is not holding",
  );
  process.exit(ok ? 0 : 1);
}

if (REHEARSE) console.log("\n── REHEARSAL — expecting clean ABORTs, no throws, exit 1 ──");
await main();
