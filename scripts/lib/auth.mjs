// scripts/lib/auth.mjs — the ONE owner of the claude-login bypass hop.
//
// WHY THIS MODULE EXISTS
//
// The bypass token rides in the login URL as `?token=…`. Playwright puts the
// full URL into every navigation error it throws, so an unguarded
//
//     await page.goto(`${BASE}/auth/claude-login?token=${TOKEN}&next=/x`)
//
// prints a production credential into stdout/stderr the moment the server is
// slow or down — and probes are routinely run as `node probe.mjs > out.log 2>&1`,
// so it lands in a file. `docs/screenshots/` and the repo root are NOT
// gitignored, which put that file one `git add -A` away from being committed to
// a repo that auto-deploys. Found live in this repo (a probe writing its own
// `results.json`), which is why the hop now lives here instead of in ~109 copies.
//
// GUARANTEES
//   1. The URL is built INSIDE this module and never returned to the caller.
//   2. Every throw and every returned string passes through `redact()`.
//   3. A missing token EXITS with an explanation — it never proceeds
//      unauthenticated. An unauthenticated probe renders a login page, which
//      looks exactly like "the feature is broken" or "nothing rendered"; that
//      ambiguity is the single most expensive failure mode in this repo's QA.
//   4. The failure path has been SEEN to fail — `--selftest` proves the
//      redaction on a real thrown navigation error, rather than asserting it.
//
// THE ONE SHAPE THIS MODULE CANNOT COVER — read before assuming you are safe.
//
// A caller that registers CONTEXT-LEVEL request interception *before*
// authenticating sees the login navigation itself:
//
//     await ctx.route("**/*", (route) => {
//       log(route.request().url());   // ← contains ?token=… ; outside our reach
//       route.continue();
//     });
//     await bypassLogin(ctx, …);      // the hop this handler now observes
//
// The handler runs in the caller's process on the caller's own context, so
// nothing here can redact it. No probe does this today on a context it also
// authenticates (probe-4b-consolidated routes a context, but takes its auth
// from `authedStorageState`, which builds a separate one). It is named here
// because this module's existence invites callers to assume the token is
// handled for them — and a security boundary that overstates its coverage is
// worse than one that names its edge.
//
// If you must route and authenticate on the SAME context: pass every
// `request.url()` you log through the exported `redact()`, or authenticate on a
// throwaway context first and carry the storageState across.
//
// USAGE
//   import { bypassLogin, redact, requireToken } from "./lib/auth.mjs";
//   const ctx = await browser.newContext();
//   await bypassLogin(ctx, { base: BASE, next: "/weekly" });
//
// SELFTEST (no server, no credentials needed beyond .env.local):
//   node scripts/lib/auth.mjs --selftest

import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Strip anything credential-shaped from a string. Applied to every value this
 * module emits — thrown messages, returned diagnostics, log lines.
 *
 * Deliberately broad: it is cheaper to over-redact a probe log than to under-
 * redact a secret. Covers the query param, the Authorization header form, and
 * the cookie form, in both raw and URL-encoded shapes.
 */
export function redact(value) {
  return String(value)
    .replace(/([?&](?:token|access_token|apikey|api_key)=)[^&\s"'`]+/gi, "$1<redacted>")
    .replace(/(Bearer\s+)\S+/gi, "$1<redacted>")
    .replace(/(sb[-_][a-z0-9-]*(?:auth|access)[a-z0-9-]*=)[^;\s]+/gi, "$1<redacted>")
    .replace(/(CLAUDE_BYPASS_TOKEN\s*[=:]\s*)\S+/gi, "$1<redacted>");
}

/**
 * Resolve the bypass token, or exit loudly.
 *
 * NO SILENT FALLBACK. Returning "" here would let the probe run
 * unauthenticated and report a login page as an empty app — the exact
 * broken-vs-not-hydrated ambiguity these probes exist to eliminate.
 */
export function requireToken({ repoRoot = process.cwd(), exit = true } = {}) {
  const fromEnv = process.env.CLAUDE_BYPASS_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  let fromFile = "";
  try {
    const env = readFileSync(path.join(repoRoot, ".env.local"), "utf8");
    fromFile = env.match(/^CLAUDE_BYPASS_TOKEN=(.+)$/m)?.[1]?.trim() ?? "";
  } catch {
    /* .env.local absent — handled below */
  }
  if (fromFile) return fromFile;

  const msg =
    "CLAUDE_BYPASS_TOKEN is not set.\n" +
    "  Set it in the environment, or put it in .env.local at the repo root.\n" +
    "  Refusing to continue: an unauthenticated probe renders the login page,\n" +
    "  which is indistinguishable from a broken or empty app.\n" +
    "  See docs/5.24.26 claude-access.md.";
  if (!exit) throw new Error(msg);
  console.error(`\n${msg}\n`);
  process.exit(2);
}

/**
 * Perform the claude-login hop on a Playwright BrowserContext, leaving the
 * session cookies on it. The caller never sees the URL.
 *
 * @param {import('playwright').BrowserContext} context
 * @param {{base?: string, next?: string, timeout?: number, settleMs?: number, token?: string, repoRoot?: string}} opts
 * @returns {Promise<{ok: true, landedOn: string}>}
 * @throws {Error} with a REDACTED message — never containing the token.
 */
/**
 * Make a probe context look like a RETURNING teacher.
 *
 * A fresh Playwright context is un-onboarded by definition on the prototype
 * path: `.env.local` sets neither NEXT_PUBLIC_PLANNER_USE_SUPABASE nor
 * NEXT_PUBLIC_V2, so `computeNeedsOnboarding` falls back to a per-device
 * localStorage flag. `first-run-redirect` then yanks the run to /onboarding
 * from a POST-HYDRATION effect — measured at 10.0s, squarely inside this dev
 * server's 5-17s hydration window, i.e. exactly when probes measure.
 *
 * That is NOT a product defect: a session carrying completion state is never
 * sent to the wizard, in either environment (verified, 7a73d39). It is a probe
 * hazard, and a vicious one — a run parked on /onboarding produces the
 * IDENTICAL element-not-found signature as a real regression on the target
 * route, so it fails toward reporting a defect that is not there. It cost one
 * lane several runs before anyone knew what they were looking at.
 *
 * Key + shape read from lib/onboarding-state.tsx (STORAGE_KEY :184,
 * PersistShape :228), not assumed.
 *
 * `addInitScript` runs before page scripts on EVERY navigation, so it beats the
 * gate's effect rather than racing it. Inert against a deployed build, where
 * account-scoped `teachers.onboarded_at` wins and this flag is ignored — so it
 * is safe to apply unconditionally.
 */
async function seedOnboardedFlag(target) {
  await target.addInitScript(() => {
    try {
      localStorage.setItem(
        "mycurricula:onboarding",
        JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
      );
    } catch {
      // Storage disabled/partitioned: the gate then behaves as it would for any
      // such user. A storage failure must never abort the auth hop.
    }
  });
}

export async function bypassLogin(context, opts = {}) {
  const {
    base = process.env.PROBE_BASE ?? "http://localhost:3099",
    next = "/weekly",
    timeout = 60000,
    settleMs = 1500,
    // DEFAULT 1 — one attempt, fail fast. Opt in to retries per callsite.
    //
    // This defaulted to 3 when the hop was centralised, which silently changed
    // six probes that had always failed fast. `probe-b46-post-composer` passes
    // `timeout: 240000`: against a wedged server it reported failure in 4
    // minutes and would now take 12 to say the same thing — and any wrapper
    // with a shorter timeout kills it mid-run, so it reports NOTHING, which is
    // strictly worse than a fast failure. Slow-to-surface failure is the same
    // error this repo keeps paying for: an environment problem that looks like
    // a defect for longer than it needs to.
    //
    // `probe-tooltip` genuinely earned a retry — /auth/claude-login is a cold
    // dev route whose first compile has been measured past a minute under
    // concurrent-lane load — so it passes `retries: 3` at its own callsite.
    retries = 1,
    token = requireToken({ repoRoot: opts.repoRoot ?? process.cwd() }),
  } = opts;

  await seedOnboardedFlag(context);

  // Built here, never returned. The only place this string exists.
  const url = `${base}/auth/claude-login?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
  let last = null;
  for (let attempt = 1; attempt <= Math.max(1, retries); attempt += 1) {
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout });
      await page.waitForTimeout(settleMs);
      const landedOn = page.url().replace(base, "");
      return { ok: true, landedOn: redact(landedOn), attempts: attempt };
    } catch (err) {
      // THE POINT OF THE MODULE: Playwright's error carries the full URL.
      // Keep only a REDACTED form so no caller — however careless — can print it.
      last = redact(String(err?.message ?? err).split("\n")[0]);
    } finally {
      await page.close().catch(() => {});
    }
  }
  const e = new Error(
    `claude-login hop failed against ${base} (next=${next}) after ${Math.max(1, retries)} attempt(s): ${last}`,
  );
  e.cause = undefined; // never carry the original; its message holds the token
  throw e;
}

/**
 * Page-level variant: drive THIS page through the hop and leave it on `next`.
 *
 * Several probes were written as `await page.goto(loginUrl)` and then carry on
 * using that same page. This matches that shape exactly, so migrating them is a
 * one-line swap with no restructuring — which matters, because a risky edit to a
 * working probe is how a security fix turns into a broken gate.
 *
 * @returns {Promise<{ok: true, landedOn: string}>}
 * @throws {Error} REDACTED — never containing the token.
 */
export async function bypassLoginOnPage(page, opts = {}) {
  const {
    base = process.env.PROBE_BASE ?? "http://localhost:3099",
    next = "/weekly",
    timeout = 60000,
    settleMs = 1500,
    token = requireToken({ repoRoot: opts.repoRoot ?? process.cwd() }),
  } = opts;

  // Page-level parity with the context variant above — probes written in this
  // shape are equally exposed to the gate.
  await seedOnboardedFlag(page);

  const url = `${base}/auth/claude-login?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout });
    await page.waitForTimeout(settleMs);
    return { ok: true, landedOn: redact(page.url().replace(base, "")) };
  } catch (err) {
    const e = new Error(
      `claude-login hop failed against ${base} (next=${next}): ${redact(
        String(err?.message ?? err).split("\n")[0],
      )}`,
    );
    e.cause = undefined;
    throw e;
  }
}

/**
 * Capture an authenticated storageState for reuse across many contexts —
 * the pattern the heavier probes use so they pay for auth once.
 */
export async function authedStorageState(browser, opts = {}) {
  const context = await browser.newContext();
  try {
    await bypassLogin(context, opts);
    return await context.storageState();
  } finally {
    await context.close().catch(() => {});
  }
}

// ── selftest ────────────────────────────────────────────────────────────────
// Proves the failure path rather than asserting it: forces a REAL navigation
// error by pointing at a dead port, then checks the thrown message.
//
// GUARDED ON BEING THE ENTRY MODULE, not merely on the flag. This block calls
// process.exit(), and every probe that imports this helper also has its own
// `--selftest`. Keying on argv alone meant `node scripts/probe-X.mjs
// --selftest` ran THIS selftest at import time and exited 0 before the probe's
// own assertions were reached — printing a confident SELFTEST PASS for a test
// that never ran. A side-effecting entrypoint in an imported module is a trap
// whatever the flag is called.
const IS_ENTRY_MODULE =
  import.meta.url === pathToFileURL(process.argv[1] ?? "").href;

if (IS_ENTRY_MODULE && process.argv.includes("--selftest")) {
  const { chromium } = await import("playwright");
  const checks = [];
  const ok = (name, cond, detail = "") => {
    checks.push({ name, cond, detail });
    console.log(`  ${cond ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  };

  console.log("\n── auth.mjs SELFTEST ──");

  // 1. redact() covers each credential shape.
  ok(
    "redact: query param",
    !redact("http://x/auth/claude-login?token=SEKRET&next=/y").includes("SEKRET"),
  );
  ok("redact: bearer header", !redact("Authorization: Bearer SEKRET").includes("SEKRET"));
  ok("redact: env assignment", !redact("CLAUDE_BYPASS_TOKEN=SEKRET").includes("SEKRET"));

  // 2. THE ONE THAT MATTERS: a real thrown navigation error must not leak.
  const token = requireToken();
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext();
  let thrown = "";
  try {
    await bypassLogin(ctx, { base: "http://localhost:3199", next: "/weekly", timeout: 8000 });
    thrown = "(no error thrown — dead port should have failed)";
  } catch (e) {
    thrown = String(e.message);
  }
  ok(
    "a REAL navigation failure carries no token",
    !thrown.includes(token) && !thrown.includes(encodeURIComponent(token)),
    thrown.slice(0, 110),
  );
  ok("the thrown error is still useful", /claude-login hop failed/.test(thrown));
  await ctx.close();
  await browser.close();

  // 3. Missing token refuses rather than proceeding.
  let refused = false;
  const saved = process.env.CLAUDE_BYPASS_TOKEN;
  try {
    process.env.CLAUDE_BYPASS_TOKEN = "";
    requireToken({ repoRoot: "/nonexistent-path-for-selftest", exit: false });
  } catch {
    refused = true;
  } finally {
    if (saved !== undefined) process.env.CLAUDE_BYPASS_TOKEN = saved;
  }
  ok("missing token REFUSES (no silent unauthenticated run)", refused);

  const failed = checks.filter((c) => !c.cond);
  console.log(
    failed.length
      ? `\nSELFTEST FAILED — ${failed.length}/${checks.length}`
      : `\nSELFTEST PASS — ${checks.length}/${checks.length}; a real navigation failure cannot leak the token`,
  );
  process.exit(failed.length ? 1 : 0);
}
