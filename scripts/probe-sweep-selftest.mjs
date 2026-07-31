// scripts/probe-sweep-selftest.mjs — prove scripts/lib/qa-sweep.mjs BEFORE four
// lanes build findings on top of it.
//
// A harness that cannot fail will report success it did not earn, and this repo
// has paid for that five times in one session. So each check below is designed
// to be SEEN to fail, not asserted:
//
//   1. frameContext really pins the axis — request paper AND glass and require
//      the read-back attributes to DIFFER. Two rows that agree would mean the
//      pin is inert, which is the failure that made a whole sweep tidy and wrong.
//   2. clickUntilResponse really observes a response — drive a known-good
//      control and require responded:true, then drive a control whose response
//      predicate can NEVER be true and require responded:false. A helper that
//      only ever returns true is not an instrument.
//   3. pairedCount's ENVIRONMENT verdict fires — feed it a control selector that
//      matches nothing and require the both-zero case to be labelled ENVIRONMENT
//      rather than ABSENT.
//   4. No write ever reaches the database — count aborted non-GET /rest/v1 calls.
//
// Usage: CLAUDE_BYPASS_TOKEN=… node scripts/probe-sweep-selftest.mjs

import { chromium } from "playwright";
import { requireToken } from "./lib/auth.mjs";
import {
  BASE,
  frameContext,
  gotoReady,
  assertFrame,
  clickUntilResponse,
  pairedCount,
} from "./lib/qa-sweep.mjs";

requireToken({ repoRoot: process.cwd() });

const checks = [];
const ok = (name, cond, detail = "") => {
  checks.push({ name, cond });
  console.log(`  ${cond ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({ channel: "chrome" });

// ── 1. Does the frame pin actually pin? ─────────────────────────────────────
console.log("\n── 1. frame pinning ──");
const applied = {};
for (const frame of ["paper", "glass"]) {
  const ctx = await frameContext(browser, { frame, width: 1440, height: 900 });
  const page = await ctx.newPage();
  const nav = await gotoReady(
    page,
    "/year",
    () => document.querySelectorAll("button").length > 3,
  );
  const a = await assertFrame(page, frame);
  applied[frame] = a.applied;
  ok(
    `requested ${frame} → applied ${a.applied}`,
    a.ok,
    `landed on ${nav.landedOn}${nav.parkedOnOnboarding ? " ⚠ PARKED ON ONBOARDING" : ""}`,
  );
  await ctx.close();
}
ok(
  "the two frames DIFFER (pin is not inert)",
  applied.paper !== applied.glass,
  `paper=${applied.paper} glass=${applied.glass}`,
);

// ── 2. Does clickUntilResponse observe a real response — and only a real one? ─
console.log("\n── 2. clickUntilResponse ──");
{
  const ctx = await frameContext(browser, { frame: "paper", width: 1440, height: 900 });
  const page = await ctx.newPage();
  await gotoReady(
    page,
    "/year",
    () =>
      !!Array.from(document.querySelectorAll("button")).find((b) =>
        /Filters\s*&\s*View/i.test(b.textContent ?? ""),
      ),
  );
  const trigger = page
    .locator('button[aria-haspopup="dialog"]')
    .filter({ hasText: /Filters\s*&\s*View/i })
    .first();

  const good = await clickUntilResponse(
    page,
    trigger,
    () =>
      Array.from(document.querySelectorAll("button")).find(
        (b) =>
          b.getAttribute("aria-haspopup") === "dialog" &&
          /filters\s*&\s*view/i.test(b.textContent ?? ""),
      )?.getAttribute("aria-expanded") === "true",
    { budgetMs: 45000 },
  );
  ok("TRUE-positive: a real response is observed", good.responded, `${good.ms}ms, ${good.attempts} attempt(s)`);

  // THE ONE THAT MATTERS: a predicate that can never hold must NOT report true.
  const bad = await clickUntilResponse(
    page,
    trigger,
    () => document.querySelector("#never-exists-sentinel") !== null,
    { budgetMs: 6000, perAttemptMs: 1000 },
  );
  ok("TRUE-negative: an impossible response is NOT reported", !bad.responded, `${bad.ms}ms`);

  // ── 3. Does the ENVIRONMENT verdict fire? ──
  console.log("\n── 3. pairedCount verdicts ──");
  const present = await pairedCount(page, {
    doubted: 'button[aria-haspopup="dialog"]',
    control: "button",
  });
  ok("PRESENT verdict on a live page", present.verdict === "PRESENT", JSON.stringify(present));

  const env = await pairedCount(page, {
    doubted: "#never-exists-sentinel",
    control: "#also-never-exists-sentinel",
  });
  ok(
    "ENVIRONMENT verdict when the control is absent too",
    env.verdict.startsWith("ENVIRONMENT"),
    env.verdict,
  );

  const absent = await pairedCount(page, {
    doubted: "#never-exists-sentinel",
    control: "button",
  });
  ok(
    "ABSENT verdict only when the control IS present",
    absent.verdict.startsWith("ABSENT"),
    absent.verdict,
  );

  await ctx.close();
}

// ── 4. Can anything write to the database through this harness? ─────────────
console.log("\n── 4. read-only guarantee ──");
{
  const ctx = await frameContext(browser, { frame: "glass", width: 1440, height: 900 });
  const page = await ctx.newPage();
  await gotoReady(page, "/weekly", () => document.querySelectorAll("button").length > 3);

  // COUNTING what the app happened to send proves nothing — an app that sent no
  // writes passes whether or not the guard works (0 attempted, 0 blocked is a
  // tautology, and a tautological gate is one of this repo's recurring bugs).
  // FIRE the writes ourselves and require them to be REFUSED, with a GET to the
  // same path as the true-negative that proves the guard is selective rather
  // than blanket-breaking the network.
  const probe = await page.evaluate(async () => {
    const hit = async (method) => {
      try {
        const res = await fetch(`${location.origin}/rest/v1/__probe_write_check`, {
          method,
          ...(method === "POST" ? { body: "{}" } : {}),
        });
        return { blocked: false, status: res.status };
      } catch (e) {
        return { blocked: true, err: String(e).slice(0, 80) };
      }
    };
    return { post: await hit("POST"), patch: await hit("PATCH"), get: await hit("GET") };
  });
  ok("a POST to /rest/v1 is REFUSED", probe.post.blocked, JSON.stringify(probe.post));
  ok("a PATCH to /rest/v1 is REFUSED", probe.patch.blocked, JSON.stringify(probe.patch));
  ok(
    "a GET to /rest/v1 still passes (guard is selective, not blanket)",
    !probe.get.blocked,
    JSON.stringify(probe.get),
  );
  await ctx.close();
}

await browser.close();

const failed = checks.filter((c) => !c.cond);
console.log(
  failed.length
    ? `\nSELFTEST FAILED — ${failed.length}/${checks.length}: ${failed.map((f) => f.name).join("; ")}`
    : `\nSELFTEST PASS — ${checks.length}/${checks.length}; the harness has been seen to fail where it should`,
);
process.exit(failed.length ? 1 : 0);
