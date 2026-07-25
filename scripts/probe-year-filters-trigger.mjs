// scripts/probe-year-filters-trigger.mjs — VERIFICATION ONLY (task #32).
//
// CLAIM UNDER TEST (made in passing, unconfirmed):
//   `[aria-label="Filters and view"]` is ABSENT on paper-frame /year at 1280px,
//   so the outline/list tiers are unreachable there.
//
// This probe CHANGES NOTHING. It measures, and it is built so that each of the
// three failure modes that have already manufactured false findings on exactly
// this shape in this repo would show up as a FAIL rather than as a tidy number:
//
//   1. FRAME AXIS. data-frame swaps the component tree on /year, so measuring
//      "paper" without pinning it measures whatever the session left behind.
//      localStorage seeding alone does NOT pin it: NEXT_PUBLIC_THEME_SYNC=1 in
//      .env.local, so lib/theme.tsx:565 loads teacher_preferences and (when the
//      row is newer than the local write stamp) APPLIES the remote frame over
//      the seed. This probe therefore pins the frame at all three layers —
//      the mc-theme-axes cookie (SSR), localStorage (pre-hydration boot), and a
//      STUBBED teacher_preferences GET (post-hydration remote apply) — and then
//      READS BACK document.documentElement.dataset.frame and FAILS the row if
//      it is not the frame that was requested.
//
//   2. PRE-HYDRATION CLICKS. A server-rendered button is clickable long before
//      React attaches onClick; the click succeeds and nothing happens, and any
//      count taken after reads zero. So the popover is opened by a RETRY LOOP
//      keyed on a RESPONSE (aria-expanded flipping to "true"), never by a sleep.
//
//   3. ABSENCE FAILS OPEN. "The trigger is missing" passes on a dead page. Every
//      row therefore reports the doubted selector's count NEXT TO a known-good
//      peer control rendered by the same JSX block (the "Standards coverage"
//      button, TimelineYear.tsx:949) from the SAME observation. Both zero is an
//      environment result, not a defect.
//
// READ-ONLY / NO DB WRITES: every non-GET to /rest/v1/teacher_preferences is
// ABORTED at the network layer, so the seeded look can never be pushed to the
// database even if the provider's heal-push path fires.
//
// Usage: CLAUDE_BYPASS_TOKEN=… node scripts/probe-year-filters-trigger.mjs

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { bypassLogin, requireToken } from "./lib/auth.mjs";

requireToken({ repoRoot: process.cwd() });
const BASE = process.env.PROBE_BASE ?? "http://localhost:3099";
const OUT = path.resolve("docs/screenshots/year-filters-trigger");
await mkdir(OUT, { recursive: true });

const log = (s) => console.log(s);

// The doubted selector, verbatim from the claim and from probe-uws-hybrid.mjs:309.
const DOUBTED = '[aria-label="Filters and view"]';

const browser = await chromium.launch({ channel: "chrome" });

/** mc-theme-axes cookie value — v1.<frame>.<glass>.<bg>.<theme>.<dim>.<style>.<palette>
 *  (lib/theme-values.ts:191). Field ORDER is a contract; do not reorder. */
function axesCookie(frame) {
  const glass = frame === "paper" ? "light" : "dark";
  const bg = frame === "paper" ? "wash" : "photo";
  return `v1.${frame}.${glass}.${bg}.clear.normal.quiet.normal`;
}

async function frameContext(frame, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } });

  // AUTH FIRST, then route. auth.mjs's one uncoverable shape is a context-level
  // route handler installed BEFORE the login hop — it would observe the token in
  // the URL. Routing after the hop keeps the token out of this process entirely.
  await bypassLogin(ctx, { base: BASE, next: "/year", timeout: 240000 });

  // LAYER 3 — the remote preference row. GET is stubbed to agree with the frame
  // we are pinning (so the post-hydration apply cannot flip it); every write
  // verb is aborted (so this read-only lane cannot mutate the database).
  await ctx.route("**/rest/v1/teacher_preferences*", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.abort();
    const row = {
      frame,
      glass: frame === "paper" ? "light" : "dark",
      bg: frame === "paper" ? "wash" : "photo",
      theme: "clear",
      dim: "normal",
      theme_style: "quiet",
      theme_palette: "normal",
      updated_at: new Date().toISOString(),
    };
    // .maybeSingle() asks PostgREST for the object form via Accept; anything
    // else gets the array form. Returning the wrong shape would make the read
    // fail → `unavailable` → the stub silently stops pinning anything.
    const accept = req.headers()["accept"] ?? "";
    const single = accept.includes("application/vnd.pgrst.object+json");
    await route.fulfill({
      status: 200,
      contentType: single
        ? "application/vnd.pgrst.object+json"
        : "application/json",
      body: JSON.stringify(single ? row : [row]),
    });
  });

  // LAYERS 1+2 — the pre-hydration boot script reads localStorage; the SSR
  // layout reads the cookie.
  await ctx.addCookies([
    {
      name: "mc-theme-axes",
      value: axesCookie(frame),
      domain: new URL(BASE).hostname,
      path: "/",
    },
  ]);
  await ctx.addInitScript((f) => {
    try {
      localStorage.setItem(
        "mycurricula:onboarding",
        JSON.stringify({ stepIndex: 0, finished: true }),
      );
      localStorage.setItem("mycurricula:user:theme-frame", f);
      localStorage.setItem(
        "mycurricula:user:theme-glass",
        f === "paper" ? "light" : "dark",
      );
      localStorage.setItem(
        "mycurricula:user:theme-bg",
        f === "paper" ? "wash" : "photo",
      );
      localStorage.setItem("mycurricula:user:theme", "clear");
      // Beat the last-writer-wins gate (lib/theme.tsx:595) as well, so the
      // pinning does not depend on the stub alone.
      localStorage.setItem(
        "mycurricula:user:theme-updated-at",
        String(Date.now() + 86400000),
      );
    } catch {
      /* private mode */
    }
  }, frame);

  return ctx;
}

/** Counts + state, all read in ONE evaluate so the doubted number and its
 *  known-good peer can never come from different moments. */
async function sample(page, label) {
  return page.evaluate(
    ({ doubted, label }) => {
      const btns = Array.from(document.querySelectorAll("button"));
      const byText = (re) =>
        btns.filter((b) => re.test((b.textContent ?? "").trim()));
      const trigger = btns.find(
        (b) =>
          b.getAttribute("aria-haspopup") === "dialog" &&
          /filters\s*&\s*view/i.test(b.textContent ?? ""),
      );
      const root = document.querySelector('[class*="TimelineYear_root"]');
      return {
        label,
        // The frame ACTUALLY APPLIED — never what we asked for.
        frameAttr: document.documentElement.dataset.frame ?? null,
        versionAttr:
          document.querySelector("[data-version]")?.getAttribute("data-version") ??
          null,
        // ── the doubted element ──
        doubtedCount: document.querySelectorAll(doubted).length,
        // ── the known-good peer, same toolbar, same JSX block ──
        standardsCoverageCount: byText(/^Standards coverage$/i).length,
        // ── the real trigger, identified structurally ──
        triggerCount: byText(/Filters\s*&\s*View/i).filter(
          (b) => b.getAttribute("aria-haspopup") === "dialog",
        ).length,
        triggerAriaLabel: trigger ? trigger.getAttribute("aria-label") : null,
        triggerExpanded: trigger ? trigger.getAttribute("aria-expanded") : null,
        triggerVisible: trigger
          ? trigger.getBoundingClientRect().width > 0 &&
            trigger.getBoundingClientRect().height > 0
          : false,
        triggerBox: trigger
          ? (() => {
              const r = trigger.getBoundingClientRect();
              return `${Math.round(r.width)}×${Math.round(r.height)} @${Math.round(r.x)},${Math.round(r.y)}`;
            })()
          : null,
        // ── the tier state ──
        hier: root?.getAttribute("data-hier") ?? null,
        scope: root?.getAttribute("data-scope") ?? null,
        rootPresent: !!root,
        listOptionCount: Array.from(
          document.querySelectorAll('button, [role="radio"], label'),
        ).filter((el) => /^List$/i.test((el.textContent ?? "").trim())).length,
      };
    },
    { doubted: DOUBTED, label },
  );
}

/** Open the popover by RESPONSE, not by sleep. Retries the click until the
 *  trigger's aria-expanded flips — which only happens once React has attached
 *  its onClick. Returns how long it took, so a slow hydrate is visible rather
 *  than being mistaken for a dead control. */
async function openByResponse(page, budgetMs = 60000) {
  const t0 = Date.now();
  const trigger = page
    .locator('button[aria-haspopup="dialog"]')
    .filter({ hasText: /Filters\s*&\s*View/i })
    .first();
  while (Date.now() - t0 < budgetMs) {
    if ((await trigger.count()) === 0) {
      await page.waitForTimeout(500);
      continue;
    }
    await trigger.click({ timeout: 5000 }).catch(() => {});
    const responded = await page
      .waitForFunction(
        () => {
          const b = Array.from(document.querySelectorAll("button")).find(
            (x) =>
              x.getAttribute("aria-haspopup") === "dialog" &&
              /filters\s*&\s*view/i.test(x.textContent ?? ""),
          );
          return b?.getAttribute("aria-expanded") === "true";
        },
        null,
        { timeout: 2500, polling: 250 },
      )
      .then(() => true)
      .catch(() => false);
    if (responded) return { opened: true, ms: Date.now() - t0 };
  }
  return { opened: false, ms: Date.now() - t0 };
}

const rows = [];

async function run(frame, width, { shot = false } = {}) {
  const tag = `${frame}-${width}`;
  log(`\n════ ${frame.toUpperCase()} frame · ${width}px ═══════════════════════`);
  const ctx = await frameContext(frame, width, 900);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/year`, {
    waitUntil: "domcontentloaded",
    timeout: 240000,
  });

  // Readiness gate keyed on a KNOWN-GOOD peer having a laid-out box. If this
  // never satisfies, the row is an ENVIRONMENT result and says so.
  const ready = await page
    .waitForFunction(
      () => {
        const b = Array.from(document.querySelectorAll("button")).find((x) =>
          /^Standards coverage$/i.test((x.textContent ?? "").trim()),
        );
        return !!b && b.getBoundingClientRect().width > 0;
      },
      null,
      { timeout: 180000, polling: 500 },
    )
    .then(() => true)
    .catch(() => false);

  const closed = await sample(page, "CLOSED");
  log(`  frame requested: ${frame}   ·   frame APPLIED: ${closed.frameAttr}   ·   data-version: ${closed.versionAttr}`);
  const framePinned = closed.frameAttr === frame;
  if (!framePinned) {
    log(`  ✗ FRAME MISMATCH — this row measures ${closed.frameAttr}, NOT ${frame}. Numbers below are void.`);
  }
  log(`  peer ready: ${ready}   ·   TimelineYear root present: ${closed.rootPresent}   ·   scope=${closed.scope} hier=${closed.hier}`);
  log(`  [CLOSED]  doubted ${DOUBTED} → ${closed.doubtedCount}   |   known-good "Standards coverage" → ${closed.standardsCoverageCount}`);
  log(`  [CLOSED]  real trigger (aria-haspopup=dialog + "Filters & View") → ${closed.triggerCount}  aria-label=${JSON.stringify(closed.triggerAriaLabel)}  expanded=${closed.triggerExpanded}  box=${closed.triggerBox}`);

  const open = await openByResponse(page);
  log(`  open-by-response: ${open.opened ? `OPENED after ${open.ms}ms` : `NEVER RESPONDED within ${open.ms}ms`}`);
  const afterOpen = await sample(page, "OPEN");
  log(`  [OPEN]    doubted ${DOUBTED} → ${afterOpen.doubtedCount}   |   known-good "Standards coverage" → ${afterOpen.standardsCoverageCount}`);
  log(`  [OPEN]    "List" option present → ${afterOpen.listOptionCount}`);

  if (shot) {
    await page.screenshot({ path: path.join(OUT, `${tag}-open.png`) });
  }

  // Reachability: can the LIST tier actually be reached from here?
  let reachedList = null;
  if (open.opened && afterOpen.listOptionCount > 0) {
    const listOpt = page
      .locator('button, [role="radio"], label')
      .filter({ hasText: /^List$/i })
      .first();
    await listOpt.click({ timeout: 5000 }).catch(() => {});
    reachedList = await page
      .waitForFunction(
        () =>
          document
            .querySelector('[class*="TimelineYear_root"]')
            ?.getAttribute("data-hier") === "list",
        null,
        { timeout: 8000, polling: 250 },
      )
      .then(() => true)
      .catch(() => false);
    log(`  LIST TIER reached (data-hier="list"): ${reachedList}`);
    if (shot) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${tag}-list.png`) });
    }
  } else {
    log(`  LIST TIER not attempted (popover ${open.opened ? "open but no List option" : "never opened"}).`);
  }

  rows.push({
    frame,
    width,
    framePinned,
    frameApplied: closed.frameAttr,
    doubtedClosed: closed.doubtedCount,
    doubtedOpen: afterOpen.doubtedCount,
    peer: closed.standardsCoverageCount,
    trigger: closed.triggerCount,
    opened: open.opened,
    openMs: open.ms,
    hierAtLoad: closed.hier,
    reachedList,
  });

  await ctx.close();
}

// The claim's exact case, plus a control frame at the same width (frame-specific?)
// and paper at three more widths (width-specific?).
await run("paper", 1280, { shot: true });
await run("glass", 1280);
await run("paper", 1440);
await run("paper", 768);
await run("paper", 375);

log(`\n════ SUMMARY ══════════════════════════════════════════════════════`);
log(
  [
    "frame".padEnd(7),
    "w".padEnd(6),
    "pinned".padEnd(7),
    "doubted(closed)".padEnd(16),
    "doubted(open)".padEnd(14),
    "peer".padEnd(6),
    "trigger".padEnd(8),
    "opened".padEnd(8),
    "hier@load".padEnd(10),
    "list",
  ].join(""),
);
for (const r of rows) {
  log(
    [
      r.frame.padEnd(7),
      String(r.width).padEnd(6),
      String(r.framePinned).padEnd(7),
      String(r.doubtedClosed).padEnd(16),
      String(r.doubtedOpen).padEnd(14),
      String(r.peer).padEnd(6),
      String(r.trigger).padEnd(8),
      `${r.opened}`.padEnd(8),
      String(r.hierAtLoad).padEnd(10),
      String(r.reachedList),
    ].join(""),
  );
}

await browser.close();
