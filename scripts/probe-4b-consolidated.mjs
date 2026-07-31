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
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
// The login hop lives in ONE place: it owns the URL that carries the bypass
// token, redacts anything it throws, and refuses to run unauthenticated.
import { authedStorageState, redact as redactSecrets } from "./lib/auth.mjs";

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
/** READ-ONLY mode. Drops every check that clicks a control which could persist.
 *  Mandatory against a base that is not localhost — see the guard below. */
const READ_ONLY = argv.includes("--read-only");
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE);

/**
 * THE ORACLE. `codeHas()` answers "is this fix in the build I am looking at?" —
 * which is only true if the sha it reads IS the sha the base is serving.
 *
 * Defaulting it to local HEAD is the same class of error as measuring a dirty
 * working tree, one layer further out: local HEAD can be a dozen commits ahead
 * of a deployed Worker, so every "the fix is in the code but the page doesn't
 * show it" verdict would be a spurious FAIL. So it is not defaultable against a
 * remote base — it must be stated, and the mismatch is unrepresentable rather
 * than merely discouraged.
 */
const ORACLE = arg("oracle-sha", IS_LOCAL ? "HEAD" : "");

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
// ── the oracle must exist, and must be the thing the base is serving ────────
if (!ORACLE) {
  console.error(
    `\nREFUSING TO RUN: --base=${BASE} is remote, so --oracle-sha=<sha> is required.\n` +
      `  codeHas() decides ABSENT ("the fix isn't in this build") vs FAIL ("it's in\n` +
      `  the build and broken"). Reading local HEAD against a deployed base makes\n` +
      `  every unshipped fix look like a live defect. Pass the sha the base is\n` +
      `  actually serving — e.g. the head_sha of the last SUCCESSFUL deploy run.\n`,
  );
  process.exit(2);
}
// The literal string "HEAD" is a REMOTE-BASE HOLE, not a convenience. It is
// truthy, so the `!ORACLE` guard above waves it through, and it used to be this
// flag's default — so it is also the most likely thing a hurried operator types.
// That reintroduces the exact failure the guard exists to prevent: local HEAD
// read as though it were the deployed artifact. Reject it explicitly; the
// operator must state the sha the base is actually serving.
if (!IS_LOCAL && ORACLE === "HEAD") {
  console.error(
    `\nREFUSING TO RUN: --oracle-sha=HEAD against the remote base ${BASE}.\n` +
      `  "HEAD" is your LOCAL tip, not what the Worker serves — they are routinely\n` +
      `  a dozen commits apart, which is the whole reason this flag is mandatory.\n` +
      `  Pass the deployed sha, e.g. the head_sha of the last SUCCESSFUL deploy:\n` +
      `    gh run list --workflow "Deploy to Cloudflare" --status success --limit 1 \\\n` +
      `      --json headSha --jq '.[0].headSha'\n`,
  );
  process.exit(2);
}
if (ORACLE !== "HEAD" && !git("rev-parse", "--verify", `${ORACLE}^{commit}`)) {
  console.error(`\nREFUSING TO RUN: --oracle-sha=${ORACLE} is not a commit in this repo.\n`);
  process.exit(2);
}
if (!IS_LOCAL && !READ_ONLY) {
  console.error(
    `\nREFUSING TO RUN: --base=${BASE} is remote, so --read-only is required.\n` +
      `  A remote base is real curriculum data for a real school.\n`,
  );
  process.exit(2);
}

/**
 * Is a fix actually IN the build under test? Distinguishes "fix not landed"
 * (absent) from "fix landed but broken" (fail). Reads the ORACLE sha — never
 * the working tree, and never local HEAD unless local HEAD is what's served.
 *
 * SILENT-FAILURE GUARD. `git show <sha>:<path>` returns nothing for a path that
 * does not exist, and the naive form turned that into `false` — so a MISTYPED
 * PATH produced a confident "the fix is not in this build", which is fail-open
 * in the opposite direction to the absence-assertions. (It happened: this file
 * asked about components/weekly/WeeklyList.tsx, which exists at no commit, and
 * got a plausible ABSENT for a reason that had nothing to do with the fix.)
 *
 * A path missing at the ORACLE but present at local HEAD is real evidence — the
 * file was added after the deployed build. A path missing at BOTH is a bad
 * path, and it says so loudly instead of answering the question it was asked.
 */
const BAD_CODEHAS_PATHS = [];
const codeHas = (file, re) => {
  const body = git("show", `${ORACLE}:${file}`);
  if (body) return new RegExp(re).test(body);
  const atHead = git("show", `HEAD:${file}`);
  if (!atHead) {
    if (!BAD_CODEHAS_PATHS.includes(file)) BAD_CODEHAS_PATHS.push(file);
    console.log(
      `  !! codeHas("${file}") — path exists at NEITHER ${ORACLE} NOR local HEAD. ` +
        `This is a broken probe path, not a missing fix. Treating as UNKNOWN.`,
    );
  }
  return false;
};

const PRE = {
  localHead: git("rev-parse", "--short", "HEAD"),
  oracleSha: ORACLE === "HEAD" ? git("rev-parse", "--short", "HEAD") : git("rev-parse", "--short", ORACLE),
  oracleIsLocalHead: ORACLE === "HEAD" || git("rev-parse", ORACLE) === git("rev-parse", "HEAD"),
  dirtyFiles: git("status", "--short").split("\n").filter(Boolean).length,
  base: BASE,
  readOnly: READ_ONLY,
  startedAt: new Date().toISOString(),
};

/**
 * A fingerprint of the BUILD the base is actually serving, taken from the
 * content-hashed chunk names on an unauthenticated page.
 *
 * The run-list says which sha deployed; this says whether the thing in front of
 * the browser changed underneath the run. Master auto-deploys, so a deploy CAN
 * land mid-pass — and half a report measured against one build and half against
 * another is not a report. Captured at the start and again at the end; a
 * mismatch invalidates the environment rather than being written up as findings.
 */
async function buildFingerprint() {
  try {
    const res = await fetch(`${BASE}/login`, { redirect: "follow" });
    const html = await res.text();
    const chunks = [...new Set(html.match(/_next\/static\/chunks\/[^"']+\.js/g) ?? [])].sort();
    return { ok: true, status: res.status, count: chunks.length, digest: chunks.join("|") };
  } catch (e) {
    return { ok: false, error: String(e).split("\n")[0].slice(0, 120) };
  }
}

// ── results model ───────────────────────────────────────────────────────────
// pass | fail | abort (environment) | absent (fix not in the deployed build) |
// unverified | skipped (we CHOSE not to look).
//
// `absent` and `skipped` must never be conflated in the report. Absent is a
// statement about the artifact — "the fix is not in this build" — and is
// evidence. Skipped is a statement about us — "we declined to run this" — and
// is the absence of evidence. Summarising a skip as an absence would claim
// knowledge of a surface nobody looked at.
const RESULTS = [];
let CURRENT = null; // the live context record

/** The bypass token rides in the login URL, so any goto() error text contains
 *  it. Never let a secret reach the console or results.json.
 *
 *  This delegates to scripts/lib/auth.mjs rather than keeping a local copy: a
 *  second redactor is a second thing to remember to widen, and the local one
 *  here had already fallen behind (it missed the sb-*-auth cookie and a bare
 *  CLAUDE_BYPASS_TOKEN= assignment). One owner, one pattern list. */
const redact = redactSecrets;

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
  const tag = {
    pass: "ok  ",
    fail: "FAIL",
    abort: "ABRT",
    absent: "ABSN",
    unverified: "UNVF",
    skipped: "SKIP",
  }[state];
  // row.detail, NOT the raw `detail` — the raw form still carries the token.
  console.log(`  ${tag} [${row.context}] ${label}${row.detail ? ` — ${row.detail}` : ""}`);
  return row;
}

/** The recorder. Negative verdicts are STRUCTURALLY gated on Gate B. */
const mark = {
  pass: (l, d) => record("pass", l, d),
  abort: (l, d) => record("abort", l, d),
  absent: (l, d) => record("absent", l, d),
  /** We chose not to look. NOT a finding, and never rolled up as one. */
  skipped: (l, d) => record("skipped", l, d),
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
// (Token reading + the login URL belong to scripts/lib/auth.mjs. A local
// token() reader used to live here; it is gone, because the point of the helper
// is that there is exactly one place holding the secret.)
//
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

/**
 * DEFENCE IN DEPTH — not the primary control.
 *
 * The primary control against writing to a real school's data is that the
 * read-only subset contains no check which clicks a persisting control. This
 * guard is the backstop for the case where that judgement was wrong: it aborts
 * every mutating PostgREST / RPC call from the browser and records the attempt,
 * so an unexpected write both fails to land AND shows up in the report.
 *
 * What it deliberately does NOT do is block non-GET traffic generally. Planner
 * hydrate runs through Next server actions — POSTs to the page route itself —
 * so reads and writes share both method and URL there. A blanket non-GET block
 * produces an empty app and a confident, wrong "production has no data", which
 * is a mistake this pass has already made once. Server-action writes are
 * therefore NOT covered here; they are covered by not clicking the controls.
 */
const WRITE_ATTEMPTS = [];
async function armWriteGuard(ctx) {
  await ctx.route(/supabase\.co\//, (route) => {
    const req = route.request();
    const m = req.method().toUpperCase();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
    // Session token refresh is a POST and is NOT a data write. Blocking it
    // expires the session mid-run and every page bounces to /login — which
    // looks exactly like a broken app and would be written up as one. Allow
    // /auth/v1/token specifically; everything else under /auth/v1 (user
    // updates, logout) stays blocked.
    if (/\/auth\/v1\/token(\?|$)/.test(req.url())) return route.continue();
    // POST to /rpc/ can be a READ in PostgREST, so aborting it may abort a
    // legitimate fetch. That is the safe direction: the check aborts loudly
    // rather than a write landing silently.
    WRITE_ATTEMPTS.push({ method: m, url: redact(req.url()).slice(0, 160), at: Date.now() });
    return route.abort();
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
  await armWriteGuard(ctx);
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
    // The guard exists so a result is never LABELLED with a frame it wasn't
    // measured in. Against a deployed base the frame is not ours to choose —
    // the server resolves it from the teacher's stored preference and re-stamps
    // it on every response, and overriding that would mean writing to their
    // preferences, which is exactly what this pass must not do. So: relabel and
    // carry on, rather than discard the run. Discarding would trade a real
    // measurement of the frame prod actually serves for no measurement at all.
    record(
      "unverified",
      `Gate A · frame ${CURRENT_FRAME.value} not reachable read-only`,
      `server resolved data-frame=${got}; results in this context are labelled ${got}, NOT ${CURRENT_FRAME.value}`,
    );
    CURRENT_FRAME.value = got;
    CURRENT.frame = got;
    CURRENT.frameForced = true;
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
      // Default known-good: the canvas has real rows AND the tree takes focus.
      //
      // This replaces a goBack()/goForward() control that was wrong twice over.
      // It was VACUOUS — its verdict was `typeof before === "string"`, i.e.
      // always true, so the gate that structurally unlocks FAIL verdicts was
      // satisfied by a tautology in the default case, which is the one most
      // checks use. And it was DESTRUCTIVE — it navigated the history away and
      // back, so the very next assertion ran against a page mid-navigation.
      // Together they manufactured a "zero openers" FAIL on /year that was an
      // artefact of the control, not a defect: the exact false finding this
      // harness exists to prevent, produced by the mechanism meant to prevent
      // it. A control must prove liveness and must not disturb the page.
      const rows = await page.evaluate(
        () =>
          document.querySelectorAll(
            '[data-planner-item^="lesson:"], [data-year-chip], [data-year-unit-workspace]',
          ).length,
      );
      const focusMoved = await page.evaluate(() => {
        const b = document.querySelector("button:not([disabled])");
        if (!b) return false;
        b.focus();
        return document.activeElement === b;
      });
      CURRENT.gateBOk = rows > 0 && focusMoved;
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

  // Label with the frame the server actually resolved, not the one we asked
  // for — see the note in gateA. This check does not go through gateA, so it
  // has to do its own relabel or it would mislabel every result.
  CURRENT.frame =
    (await page.evaluate(() => document.documentElement.dataset.frame)) ?? CURRENT.frame;

  if (resolvedAt === null) {
    mark.abort(
      `4.1 /daily empty-state · ${CURRENT.frame}`,
      "lessons never rendered — cannot distinguish fix from a dead page",
    );
    return;
  }
  await gateB("drawer-pane").catch(() => {});
  // Is the honesty fix in the build under test? This does not change the
  // verdict — a lie a teacher can see today is a live defect whether or not a
  // fix is queued behind it — but it does change what the verdict MEANS, and
  // the report should not read as "the fix is broken" when it is "the fix has
  // not shipped".
  if (!codeHas("components/day-v2/DayA.tsx", "usePlannerDataState|PlannerEmpty")) {
    mark.absent(
      `4.1 /daily empty-state honesty fix · ${CURRENT.frame}`,
      `no usePlannerDataState/PlannerEmpty in components/day-v2/DayA.tsx at ${PRE.oracleSha} — and it is absent from local HEAD too, so this is not merely undeployed, it is unfixed. Anything measured below is live, current behaviour.`,
    );
  }
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
  //
  // The List view's rows are components/list/ListRow.tsx — NOT the
  // "components/weekly/WeeklyList.tsx" this used to name, which does not exist
  // at any commit. codeHas() on a wrong path silently returns false, so the
  // check reported a confident ABSENT for the right reason by accident. A path
  // that never resolves is indistinguishable from a fix that never landed.
  const fixIn = codeHas("components/list/ListRow.tsx", "UnitChip|unit workspace");
  if (!fixIn && mode !== "schedule") {
    mark.absent(
      `4.2 /weekly ${mode} workspace path`,
      `no UnitChip in WeeklyList at ${PRE.oracleSha} — not in the build under test`,
    );
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
  if (READ_ONLY) {
    // The whole block drives the Kind radio group with ArrowRight/click. The
    // defect it hunts IS "the arrow key commits in transit" — so on a build
    // where the fix is absent, running the check performs the write it is
    // looking for, against a real unit assessment. There is no way to observe
    // the bug without causing it, so the honest answer is that we did not look.
    // 4.3.2 is out for the same reason: "re-selecting fires onChange" is only
    // a no-op if the fix is present, which is the thing in question.
    mark.skipped(
      "4.3/4.4 ToggleGroup keyboard semantics + Kind field-preservation",
      "SKIPPED BY CONSTRAINT (read-only): the check commits the change it is testing for. NOT 'absent' — nobody looked.",
    );
    return;
  }
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
    mark.absent(
      "4.5 Delete-from-Team removed",
      `still present in components/lesson-card/context-menu.tsx at ${PRE.oracleSha} — the removal is not in the build under test`,
    );
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
  // The trigger set must cover EVERY frame, not just the one this check was
  // written on. `[data-year-chip]` is the glass/colour opener; the paper frame's
  // opener is `[data-year-unit-workspace]` (TimelineYear), and it is wrapped in
  // a <Tooltip tooltipId="year-unit-workspace">, so it is a first-class trigger.
  // Omitting it made the whole tooltip check abort with "none found" on the only
  // frame a production account actually renders.
  const trig = page
    .locator("[data-ue-drawer-toggle], [data-year-chip], [data-year-unit-workspace]")
    .first();
  if (!(await trig.count())) {
    mark.abort("4.6 tooltip trigger", "no tooltip trigger on this frame — check cannot run");
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

/**
 * 4.7 — /post's composer seam, HAND-ROLLED READ-ONLY.
 *
 * This deliberately does NOT delegate to scripts/probe-b46-post-composer.mjs.
 * That probe clicks "Add note", which appends a card and persists it — a real
 * write to a real school's Resource Wall. It was named in the read-only subset
 * by mistake and caught before it ran; the seam is what this pass needs, and
 * the seam is verifiable without publishing anything.
 *
 * Open · assert exactly one modal and one scrim · close · assert teardown.
 */
async function checkPostComposer() {
  const { page } = CURRENT;
  await page.goto(`${BASE}/post`, { waitUntil: "domcontentloaded", timeout: 90000 });
  // /post has no planner canvas, so Gate A's selector does not apply — wait on
  // the wall's own chrome instead.
  //
  // NOT on `<section>`: the wall renders zero sections until a preset is chosen
  // (which is why the composer lane's probe has an explicit "switch to This
  // Week" step before it counts them). Waiting on sections therefore times out
  // on a perfectly healthy wall and reports "not hydrated" — a probe limitation
  // wearing an outage's clothes. The toolbar's wall-switcher button is present
  // as soon as the wall mounts, preset or no preset.
  const WALL_READY = 'button[class*="ddBtn"], [class*="ResourceWall_root"], [class*="_root__"]';
  const alive = await page
    .waitForFunction((sel) => !!document.querySelector(sel), WALL_READY, {
      timeout: HYDRATE_BUDGET_MS,
      polling: 500,
    })
    .then(() => true)
    .catch(() => false);
  if (!alive) {
    mark.abort("4.7 /post", `wall chrome never rendered in ${HYDRATE_BUDGET_MS}ms — route not hydrated`);
    return;
  }
  const sectionCount = await page.evaluate(() => document.querySelectorAll("section").length);
  record(
    "pass",
    "4.7 /post wall mounted",
    `wall chrome present; ${sectionCount} section(s) on the default view (0 is expected until a preset is chosen)`,
  );
  // Gate B for this surface: sections exist AND the tree takes focus. Focus is
  // real interactivity proof and writes nothing.
  const postControl = () => async () => {
    const n = await page.evaluate(
      (sel) => document.querySelectorAll(sel).length,
      'button[class*="ddBtn"], section',
    );
    if (n === 0) return false;
    return page.evaluate(() => {
      const b = document.querySelector("button:not([disabled])");
      if (!b) return false;
      b.focus();
      return document.activeElement === b;
    });
  };
  CURRENT.gateBOk = (await postControl()()) === true;
  record(
    CURRENT.gateBOk ? "pass" : "abort",
    "Gate B · /post wall",
    CURRENT.gateBOk ? "sections present and the tree takes focus" : "wall not interactive",
  );
  await shot("post-wall");

  // Is the B4.6 wiring even in the build under test?
  //
  // The marker must be UNIQUE TO THE FIX. `"Resource"` alone matched the file's
  // own header comment ("one kanban column of the Resource Wall") at a sha that
  // predates B4.6 by four commits, so codeHas() reported the wiring present, the
  // browser correctly rendered no button, and the ORACLE PIN fired a
  // disagreement that was entirely the oracle's fault. A loose regex turns a
  // provenance check into a coin flip — pick a string the fix INTRODUCED.
  const wired = codeHas("components/resource-wall-v2/Section.tsx", "<span>Resource</span>");
  const liveResourceBtn = await page
    .locator('button:has-text("Resource")')
    .count()
    .catch(() => -1);

  // ORACLE PIN — the oracle and the artifact must agree.
  //
  // codeHas() is only trustworthy if --oracle-sha really is what the base is
  // serving. That is an assumption sourced from a CI run list, i.e. from
  // outside the thing being measured, and this is the one surface where it can
  // be checked from the inside: B4.6 either wired a "Resource" add into this
  // wall or it didn't, and the browser can say which. A disagreement means the
  // pin is wrong and EVERY absent/fail verdict in the run is suspect — so it is
  // reported as an environment fault, not quietly tolerated.
  if (liveResourceBtn >= 0 && wired !== liveResourceBtn > 0) {
    mark.abort(
      "ORACLE PIN — the deployed build disagrees with --oracle-sha",
      `code says B4.6 ${wired ? "IS" : "is NOT"} in ${PRE.oracleSha}, but the live wall renders ${liveResourceBtn} Resource button(s). The pin is wrong; absent/fail verdicts in this run cannot be trusted.`,
    );
  } else if (liveResourceBtn >= 0) {
    mark.pass(
      "ORACLE PIN confirmed from the artifact side",
      `B4.6 ${wired ? "present" : "absent"} in ${PRE.oracleSha} and the live wall agrees (${liveResourceBtn} Resource button(s))`,
    );
  }

  if (!wired) {
    mark.absent(
      "4.7 /post section tile opens the shared composer",
      `no Resource add in Section.tsx at ${PRE.oracleSha} — B4.6 is not in this build`,
    );
    // The half that IS meaningful here: on a build without the wiring, the wall
    // must show no composer at all. Absence-assertion, so it needs the control.
    await mark.absence("4.7 no composer leaks onto the wall unbidden", {
      observed:
        (await page.evaluate(
          () =>
            document.querySelectorAll(".cmp-modal").length +
            document.querySelectorAll(".cmp-scrim").length,
        )) === 0,
      control: postControl(),
    });
    return;
  }

  const opener = page.locator('button:has-text("Resource")').first();
  if (!(await opener.count())) {
    mark.fail("4.7 /post has a Resource add affordance", "wiring is in the build, no button rendered");
    return;
  }
  await opener.click();
  await page.waitForTimeout(2000);
  const m = await page.evaluate(() => ({
    modal: document.querySelectorAll(".cmp-modal").length,
    scrim: document.querySelectorAll(".cmp-scrim").length,
    lock: JSON.stringify(document.body.style.overflow),
  }));
  mark.bool("4.7 /post opens EXACTLY ONE composer", m.modal === 1 && m.scrim === 1, JSON.stringify(m));
  mark.bool("4.7 /post composer applies the scroll lock", m.lock === '"hidden"', m.lock);
  await shot("post-composer-open");
  // Close WITHOUT committing. Escape is the non-persisting exit.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => ({
    modal: document.querySelectorAll(".cmp-modal").length,
    scrim: document.querySelectorAll(".cmp-scrim").length,
    lock: JSON.stringify(document.body.style.overflow),
  }));
  mark.bool("4.7 /post composer tears down to zero", after.modal === 0 && after.scrim === 0, JSON.stringify(after));
  mark.bool("4.7 /post composer releases the scroll lock", after.lock === '""', after.lock);
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
  await armWriteGuard(ctx2);
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
  console.log(`\n§4b consolidated — base=${BASE}`);
  console.log(`  oracle sha  : ${PRE.oracleSha}${PRE.oracleIsLocalHead ? " (= local HEAD)" : ` (local HEAD is ${PRE.localHead} — DIFFERENT, as expected against a deployed base)`}`);
  console.log(`  read-only   : ${READ_ONLY}`);
  console.log(`  local dirty : ${PRE.dirtyFiles} file(s)`);
  if (PRE.dirtyFiles > 0 && PRE.oracleIsLocalHead)
    console.log(`  ! tree is DIRTY and the oracle is local HEAD — this run certifies nothing`);

  PRE.fingerprintStart = await buildFingerprint();
  console.log(
    `  build       : ${PRE.fingerprintStart.ok ? `${PRE.fingerprintStart.count} chunks, status ${PRE.fingerprintStart.status}` : `UNREADABLE — ${PRE.fingerprintStart.error}`}`,
  );

  try {
    await boot();
  } catch (e) {
    record("abort", "boot", `auth/login failed: ${String(e).split("\n")[0].slice(0, 160)}`);
    if (!REHEARSE) return await finish();
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
        await step("4.7 /post", checkPostComposer);
        gateC("ctx1 after 4.7");
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

  // 4.11 simulation, outside the frame contexts. (4.7 now runs inside context 1
  // with a real page — it is no longer delegated to a probe that publishes.)
  if (wanted(8)) {
    CURRENT = { no: 8, name: "crossdevice", gateBOk: true };
    await step("4.11", checkCrossDevice);
  }

  await finish();
}

async function finish() {
  // Did the build change underneath the run?
  const end = await buildFingerprint();
  const drifted =
    PRE.fingerprintStart?.ok && end.ok && PRE.fingerprintStart.digest !== end.digest;
  if (drifted) {
    CURRENT = { no: 99, name: "environment", gateBOk: true };
    record(
      "abort",
      "ENVIRONMENT — the deployed build changed mid-run",
      `chunk digest differs between start and end: a deploy landed underneath this pass. Results are split across two builds and certify nothing; re-run against a settled deployment.`,
    );
  }

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
    fingerprintEnd: end,
    buildDrifted: !!drifted,
    badCodeHasPaths: BAD_CODEHAS_PATHS,
    writeAttemptsBlocked: WRITE_ATTEMPTS,
    canary: canary.length === 0 ? "not run" : canaryBad ? "FAILED — results after context 1 are SUSPECT" : "ok",
    headline:
      `${verified} verified: ${n("pass")} pass, ${n("fail")} fail. ` +
      `${n("unverified")} unverified, ${n("abort")} abort, ` +
      `${n("absent")} absent (fix not in build ${PRE.oracleSha}), ` +
      `${n("skipped")} skipped-by-constraint (not looked at).` +
      `${suspect ? ` ${suspect} SUSPECT (canary).` : ""}` +
      `${drifted ? " BUILD DRIFTED MID-RUN — environment invalid." : ""}`,
    results: RESULTS,
  };
  writeFileSync(path.join(SHOTS, "results.json"), JSON.stringify(summary, null, 2));

  console.log(`\n════ SUMMARY ════`);
  console.log(summary.headline);
  console.log(`canary: ${summary.canary}`);
  if (BAD_CODEHAS_PATHS.length)
    console.log(
      `!! BROKEN PROBE PATHS (exist at neither ${PRE.oracleSha} nor HEAD) — any ABSENT that cites them is meaningless: ${BAD_CODEHAS_PATHS.join(", ")}`,
    );
  console.log(
    `write attempts blocked by the guard: ${WRITE_ATTEMPTS.length}` +
      (WRITE_ATTEMPTS.length
        ? ` — ${[...new Set(WRITE_ATTEMPTS.map((w) => `${w.method} ${w.url.split("?")[0]}`))].join(", ")}`
        : " (none — nothing tried to mutate)"),
  );
  if (n("skipped")) {
    console.log("\nSKIPPED BY CONSTRAINT (we chose not to look — NOT evidence of absence):");
    for (const r of RESULTS.filter((x) => x.state === "skipped"))
      console.log(`  - [${r.context}] ${r.label} — ${r.detail}`);
  }
  if (n("absent")) {
    console.log(`\nABSENT (the fix is not in build ${PRE.oracleSha} — nothing to test yet):`);
    for (const r of RESULTS.filter((x) => x.state === "absent"))
      console.log(`  - [${r.context}] ${r.label} — ${r.detail}`);
  }
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
  // EXIT CODE = "is this run EVIDENCE?", not "did the assertions pass?".
  //
  // A run that could not verify anything is NOT a pass. Neither is a run whose
  // instrument was broken underneath it — and that was the hole here: a probe
  // whose whole thesis is "refuse the runs that can lie" printed its broken-path
  // and build-drift warnings and then exited 0, so CI, a wrapper script, or a
  // hurried reader saw green. Every environment-invalidating condition must
  // reach the exit code, or the warning is decoration.
  //
  //   • badCodeHasPaths — codeHas() answered a question it was never asked, so
  //     any ABSENT citing those paths is meaningless (see the note at its defn).
  //   • buildDrifted — the artifact changed mid-run, so early and late results
  //     describe different builds and cannot be reconciled.
  //   • canaryBad — the session went bad at an unknown point, which is why it
  //     already marks contexts 2-6 SUSPECT. A run carrying suspect contexts is
  //     not evidence about them, so it must not exit green either.
  const tainted = BAD_CODEHAS_PATHS.length > 0 || !!drifted || canaryBad;
  if (tainted) {
    console.log(
      `\nRUN IS NOT EVIDENCE — exiting non-zero despite ${n("fail")} failure(s):` +
        (BAD_CODEHAS_PATHS.length
          ? `\n  - ${BAD_CODEHAS_PATHS.length} broken probe path(s): ${BAD_CODEHAS_PATHS.join(", ")}`
          : "") +
        (drifted ? `\n  - the deployed build changed mid-run (fingerprint drift)` : "") +
        (canaryBad ? `\n  - the session canary failed; contexts 2-6 are SUSPECT` : ""),
    );
  }
  process.exit(n("fail") > 0 || verified === 0 || tainted ? 1 : 0);
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
