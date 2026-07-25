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
// USAGE
//   import { bypassLogin, redact, requireToken } from "./lib/auth.mjs";
//   const ctx = await browser.newContext();
//   await bypassLogin(ctx, { base: BASE, next: "/weekly" });
//
// SELFTEST (no server, no credentials needed beyond .env.local):
//   node scripts/lib/auth.mjs --selftest

import { readFileSync } from "node:fs";
import path from "node:path";

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
export async function bypassLogin(context, opts = {}) {
  const {
    base = process.env.PROBE_BASE ?? "http://localhost:3099",
    next = "/weekly",
    timeout = 60000,
    settleMs = 1500,
    // /auth/claude-login is a cold route in dev and compiles on first hit. With
    // several lanes sharing one dev server that has been measured well past a
    // minute, so a single-shot hop fails the whole probe on a compile queue
    // rather than on a defect. Retrying is the difference between an
    // environment blip and a lost run.
    retries = 3,
    token = requireToken({ repoRoot: opts.repoRoot ?? process.cwd() }),
  } = opts;

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
if (process.argv.includes("--selftest")) {
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
