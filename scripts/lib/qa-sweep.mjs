// scripts/lib/qa-sweep.mjs — shared harness for the consolidated §4b regression
// sweep. Read-only by construction.
//
// It exists because three failure modes have each manufactured a false finding
// in this repo in the last day, and every one of them is cheaper to design out
// once than to re-litigate per lane:
//
//   1. THE FRAME AXIS SWAPS THE RENDERER. data-frame ∈ glass|paper|color decides
//      which component tree mounts on several routes (/year most sharply). A
//      sweep that does not pin it measures whatever the last session left. And
//      localStorage seeding ALONE does not pin it: .env.local sets
//      NEXT_PUBLIC_THEME_SYNC=1, so lib/theme.tsx:565 loads teacher_preferences
//      and applies the remote frame over the seed whenever the row is newer than
//      the local write stamp. `frameContext` therefore pins at THREE layers —
//      the mc-theme-axes cookie (SSR), localStorage (pre-hydration boot), and a
//      stubbed teacher_preferences GET (post-hydration apply) — and `assertFrame`
//      READS BACK documentElement.dataset.frame so a row that drifted is void
//      rather than tidy.
//
//   2. PRE-HYDRATION CLICKS ARE SILENTLY SWALLOWED. A server-rendered button is
//      in the DOM and clickable long before React attaches onClick. The click
//      succeeds — element found, visible, event dispatched, no error — and
//      nothing happens. Measured on this dev server: a popover read 0 items at
//      1000ms and 3000ms, 6 items at 11000ms. `clickUntilResponse` retries until
//      a named RESPONSE is observed and reports how long that took, so a slow
//      hydrate is visible instead of being read as a dead control.
//
//   3. ABSENCE-ASSERTIONS FAIL OPEN. "X is missing" passes on a dead or
//      unhydrated page. `pairedCount` takes the doubted count and a known-good
//      control's count in ONE evaluate, so they can never come from different
//      moments, and labels the both-zero case as ENVIRONMENT rather than DEFECT.
//
// NO DB WRITES: every non-GET to /rest/v1/* is aborted at the network layer, so
// no lane using this harness can mutate the database even by accident.
//
// The claude-login hop (scripts/lib/auth.mjs) additionally seeds the onboarded
// flag as of ce06e2d, so runs are no longer parked on /onboarding mid-hydration.
// `gotoReady` still reports the LANDED URL, because inheriting a fix is not the
// same as verifying it held.

import { bypassLogin } from "./auth.mjs";

export const BASE = process.env.PROBE_BASE ?? "http://localhost:3099";

/** The three §4 responsive tiers. */
export const TIERS = [
  { name: "phone", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

/** mc-theme-axes value — v1.<frame>.<glass>.<bg>.<theme>.<dim>.<style>.<palette>
 *  (lib/theme-values.ts:191). FIELD ORDER IS A CONTRACT: "normal" is a legal
 *  value in two slots (dim AND palette), so a drift here validates into the
 *  wrong axis silently. Do not reorder. */
function axesCookie(frame, theme = "clear") {
  const glass = frame === "paper" ? "light" : "dark";
  const bg = frame === "paper" ? "wash" : "photo";
  return `v1.${frame}.${glass}.${bg}.${theme}.normal.quiet.normal`;
}

/**
 * An authenticated context with `frame` pinned at all three layers and every
 * database write blocked.
 *
 * @param browser  a launched Chrome (channel: "chrome")
 * @param opts.frame  glass | paper | color
 * @param opts.width/height  viewport
 * @param opts.hasTouch/isMobile  pass BOTH for a real phone emulation — a bare
 *        desktop resize keeps `pointer: fine` and silently measures the wrong
 *        media branch on any touch-target work.
 */
export async function frameContext(
  browser,
  { frame = "glass", width = 1440, height = 900, theme = "clear", hasTouch = false, isMobile = false, deviceScaleFactor } = {},
) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    hasTouch,
    isMobile,
    ...(deviceScaleFactor ? { deviceScaleFactor } : {}),
  });

  // AUTH FIRST, THEN ROUTE. auth.mjs's one uncoverable shape is a context-level
  // route handler installed BEFORE the login hop — it would observe the bypass
  // token in the navigation URL. Routing after the hop keeps the token out of
  // this process entirely.
  await bypassLogin(ctx, { base: BASE, next: "/weekly", timeout: 240000 });

  // LAYER 3 (post-hydration): make the remote preference row AGREE with the
  // frame under test, so lib/theme.tsx's apply cannot flip it.
  await ctx.route("**/rest/v1/teacher_preferences*", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.abort();
    const row = {
      frame,
      glass: frame === "paper" ? "light" : "dark",
      bg: frame === "paper" ? "wash" : "photo",
      theme,
      dim: "normal",
      theme_style: "quiet",
      theme_palette: "normal",
      updated_at: new Date().toISOString(),
    };
    // .maybeSingle() asks PostgREST for the OBJECT form via Accept; anything
    // else expects the array form. Returning the wrong shape makes the read
    // fail → `unavailable` → the stub silently stops pinning anything.
    const single = (req.headers()["accept"] ?? "").includes(
      "application/vnd.pgrst.object+json",
    );
    await route.fulfill({
      status: 200,
      contentType: single
        ? "application/vnd.pgrst.object+json"
        : "application/json",
      body: JSON.stringify(single ? row : [row]),
    });
  });

  // READ-ONLY GUARANTEE: block every other write verb to the database too.
  await ctx.route("**/rest/v1/**", async (route) => {
    const m = route.request().method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return route.continue();
    return route.abort();
  });

  // LAYERS 1+2 (SSR + pre-hydration boot).
  await ctx.addCookies([
    {
      name: "mc-theme-axes",
      value: axesCookie(frame, theme),
      domain: new URL(BASE).hostname,
      path: "/",
    },
  ]);
  await ctx.addInitScript(
    ({ f, t }) => {
      try {
        localStorage.setItem("mycurricula:user:theme-frame", f);
        localStorage.setItem(
          "mycurricula:user:theme-glass",
          f === "paper" ? "light" : "dark",
        );
        localStorage.setItem(
          "mycurricula:user:theme-bg",
          f === "paper" ? "wash" : "photo",
        );
        localStorage.setItem("mycurricula:user:theme", t);
        // Beat the last-writer-wins gate (lib/theme.tsx:595) as well, so the
        // pin does not rest on the network stub alone.
        localStorage.setItem(
          "mycurricula:user:theme-updated-at",
          String(Date.now() + 86400000),
        );
      } catch {
        /* storage disabled — assertFrame will catch the consequence */
      }
    },
    { f: frame, t: theme },
  );

  return ctx;
}

/** Collect console errors/warnings + page errors for a page. Returns a getter. */
export function collectConsole(page) {
  const entries = [];
  page.on("console", (m) => {
    const type = m.type();
    if (type === "error" || type === "warning") {
      entries.push({ type, text: m.text().slice(0, 400) });
    }
  });
  page.on("pageerror", (e) =>
    entries.push({ type: "pageerror", text: String(e?.message ?? e).slice(0, 400) }),
  );
  return () => entries;
}

/**
 * Navigate and wait for a REAL readiness signal, then report what we actually
 * landed on. `readyFn` runs in the page and must return truthy only once the
 * surface under test is genuinely interactive — never a bare timeout.
 */
export async function gotoReady(page, path, readyFn, { timeout = 180000 } = {}) {
  await page.goto(`${BASE}${path}`, {
    waitUntil: "domcontentloaded",
    timeout: 240000,
  });
  const ready = await page
    .waitForFunction(readyFn, null, { timeout, polling: 500 })
    .then(() => true)
    .catch(() => false);
  const landedOn = new URL(page.url()).pathname;
  return {
    ready,
    landedOn,
    // ce06e2d should prevent this, but inheriting a fix is not verifying it.
    parkedOnOnboarding: landedOn.startsWith("/onboarding"),
  };
}

/**
 * Assert the frame that was REQUESTED is the frame that APPLIED.
 * Returns { ok, applied } — a false `ok` voids every number from that context.
 */
export async function assertFrame(page, requested) {
  const applied = await page.evaluate(
    () => document.documentElement.dataset.frame ?? null,
  );
  return { ok: applied === requested, applied, requested };
}

/**
 * Click until the app RESPONDS. Never a constant sleep.
 *
 * @param locator   Playwright locator for the trigger
 * @param respondedFn  runs in the page; truthy once the click has taken effect
 * @returns { responded, ms, attempts } — `ms` makes a slow hydrate visible
 *          rather than letting it read as a dead control.
 */
export async function clickUntilResponse(
  page,
  locator,
  respondedFn,
  { budgetMs = 45000, perAttemptMs = 2500 } = {},
) {
  const t0 = Date.now();
  let attempts = 0;
  while (Date.now() - t0 < budgetMs) {
    if ((await locator.count()) === 0) {
      await page.waitForTimeout(500);
      continue;
    }
    attempts += 1;
    await locator.click({ timeout: 5000 }).catch(() => {});
    const responded = await page
      .waitForFunction(respondedFn, null, { timeout: perAttemptMs, polling: 200 })
      .then(() => true)
      .catch(() => false);
    if (responded) return { responded: true, ms: Date.now() - t0, attempts };
  }
  return { responded: false, ms: Date.now() - t0, attempts };
}

/**
 * The doubted count and a known-good control's count, from ONE observation.
 *
 * `verdict` is the whole point: both-zero is an ENVIRONMENT result (the page is
 * dead or unhydrated), not evidence that the doubted thing is missing.
 */
export async function pairedCount(page, { doubted, control, label = "" }) {
  const r = await page.evaluate(
    ({ d, c }) => ({
      doubted: document.querySelectorAll(d).length,
      control: document.querySelectorAll(c).length,
    }),
    { d: doubted, c: control },
  );
  const verdict =
    r.control === 0
      ? r.doubted === 0
        ? "ENVIRONMENT (both zero — page dead/unhydrated, proves nothing)"
        : "ODD (control absent but doubted present — check the control selector)"
      : r.doubted === 0
        ? "ABSENT (control present, doubted is genuinely missing)"
        : "PRESENT";
  return { label, ...r, verdict };
}

/** Is the DOCUMENT scrollable right now? The scroll-lock oracle. */
export async function bodyScrollState(page) {
  return page.evaluate(() => ({
    bodyOverflow: document.body.style.overflow,
    computedOverflow: getComputedStyle(document.body).overflow,
    canScroll:
      document.documentElement.scrollHeight > window.innerHeight + 4 &&
      getComputedStyle(document.body).overflowY !== "hidden",
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }));
}

/** Does the DOCUMENT scroll sideways? (§4: internal element scroll is fine.) */
export async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    // scrollWidth is blind to a bar clipped by `overflow-x: clip`, so also
    // hunt the widest offending element directly.
    const worst = Array.from(document.querySelectorAll("body *"))
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { right: Math.round(r.right), tag: el.tagName, cls: String(el.className).slice(0, 60) };
      })
      .filter((x) => x.right > window.innerWidth + 1)
      .sort((a, b) => b.right - a.right)[0] ?? null;
    return {
      docScrolls: de.scrollWidth > de.clientWidth + 1,
      scrollWidth: de.scrollWidth,
      clientWidth: de.clientWidth,
      innerWidth: window.innerWidth,
      widestOverflowingElement: worst,
    };
  });
}
