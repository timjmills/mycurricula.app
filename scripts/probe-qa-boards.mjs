// scripts/probe-qa-boards.mjs — LIVE QA probe for the Board Library (/boards)
// rewritten in a571d87, plus an app-wide console sweep.
//
// REPORT-ONLY. This script never writes to the repo except screenshots under
// docs/screenshots/qa-boards/.
//
// ── THE INSTRUMENT PROBLEM (read this before trusting any result) ────────────
// Locally NEXT_PUBLIC_TEACH_USE_SUPABASE is UNSET, so lib/teach/client.ts
// delegates every call straight to the in-memory mockTeachSource. A board load
// therefore issues ZERO network requests. Playwright `route.abort()` — the
// instrument the brief asked for — has nothing to match, so it would abort
// nothing, the mock would settle normally, and the surface would render its
// (correct) list or "No boards yet". That is a check that CANNOT FAIL, and a
// pass from it means nothing.
//
// So this probe does three separate things and labels each:
//   (1) abortProbe   — runs the requested route.abort() and COUNTS the matched
//                      requests. If the count is 0 the check DID NOT RUN.
//   (2) faultProbe   — real fault injection: rewrite the dev JS chunk carrying
//                      mockTeachSource so listMyBoards/countMyBoards THROW.
//                      This drives the genuine production path
//                      loadBoardLibrary() -> catch -> {state:"error"} ->
//                      BoardListRegion error branch. Errors seen here are
//                      QA-INJECTED, never application faults.
//   (3) emptyProbe   — the opposite direction: a genuinely EMPTY settled
//                      library must still say "No boards yet".
// Only (2) and (3) together are worth anything.
//
// Every absence assertion is paired with a POSITIVE CONTROL that proves the
// page actually rendered, so a blank page cannot masquerade as a pass.

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const OUT = "docs/screenshots/qa-boards";
mkdirSync(OUT, { recursive: true });

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync(".env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}
if (!token) {
  console.error("FATAL: no CLAUDE_BYPASS_TOKEN — probe cannot authenticate.");
  process.exit(2);
}

const report = { precondition: {}, parts: {} };
const log = (...a) => console.log(...a);

// ── Console capture ──────────────────────────────────────────────────────────
function attach(page, sink, tagInjected = false) {
  page.on("console", (m) => {
    const t = m.type();
    if (t === "error" || t === "warning")
      sink.push({
        kind: `console.${t}`,
        text: m.text().slice(0, 2000),
        injected: tagInjected,
      });
  });
  page.on("pageerror", (e) =>
    sink.push({ kind: "pageerror", text: e.message.slice(0, 2000), injected: tagInjected }),
  );
  page.on("requestfailed", (r) =>
    sink.push({
      kind: "requestfailed",
      text: `${r.url().slice(0, 200)} :: ${r.failure()?.errorText}`,
      injected: tagInjected,
    }),
  );
  page.on("response", (r) => {
    if (r.status() >= 400)
      sink.push({ kind: `http.${r.status()}`, text: r.url().slice(0, 200), injected: tagInjected });
  });
}

// NOTE: `next` deliberately defaults to "/" and MUST NOT be "/boards".
// Booting straight to /boards warms the browser cache with the 8.4 MB
// app/(planner)/boards/page.js chunk; the later routed navigation then serves
// it from cache, page.route() never sees it, and the fault injection silently
// patches NOTHING while still "passing". That is a check that cannot fail.
async function login(context, next = "/") {
  const boot = await context.newPage();
  await boot.goto(
    `${BASE}/auth/claude-login?token=${encodeURIComponent(token)}&next=${encodeURIComponent(next)}`,
    { waitUntil: "domcontentloaded", timeout: 180000 },
  );
  await boot.waitForTimeout(2500);
  await boot.close();
}

// Positive control: prove the Board Library actually mounted, so an
// "X is absent" assertion cannot pass because the page was blank.
async function boardsControl(page) {
  const marks = {
    tipsBar: await page.getByText(/Duplicate a board to save time/i).count(),
    sortLabel: await page.getByText(/^Sort by$/).count(),
    segmentPersonal: await page.getByRole("tab", { name: /Personal Boards/i }).count(),
    sidebarHeading: await page.getByText(/My Library/i).count(),
    explainer: await page.getByText(/Boards are separate from resources/i).count(),
  };
  marks.ok = marks.sortLabel > 0 && marks.segmentPersonal > 0;
  return marks;
}

// The dev bundle emits the mock source's methods with a SPACE before the paren
// (`async listMyBoards (ownerId) {`). A no-space matcher silently patches
// nothing — the fault probe then "passes" without ever injecting a fault.
const MARK_LIST = /async listMyBoards\s*\(([^)]*)\)\s*\{/;
const MARK_COUNT = /async countMyBoards\s*\(([^)]*)\)\s*\{/;
const MARK_TPL = /async listBoardTemplates\s*\(([^)]*)\)\s*\{/;

// Only the Boards page chunk carries mockTeachSource. Proxying every chunk
// (main-app.js is multi-MB) reliably times out route.fetch on this dev server.
const CHUNK_RE = /\/_next\/static\/chunks\/app\/\(planner\)\/boards\/page\.js/;

const EMPTY_COPY = /No boards yet/i;
const ERROR_COPY = /Couldn.{0,3}t load your boards/i;

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════
const browser = await chromium.launch({ channel: "chrome" });

// ── PART 1a-i: the REQUESTED route.abort() instrument, instrumented ──────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(ctx);
  const page = await ctx.newPage();
  const sink = [];
  attach(page, sink);

  let aborted = 0;
  const abortedUrls = [];
  const allXhr = [];
  page.on("request", (r) => {
    const rt = r.resourceType();
    if (rt === "xhr" || rt === "fetch") allXhr.push(r.url().slice(0, 180));
  });
  // ONLY a plausible BOARD read — deliberately narrow. Aborting every
  // /rest/v1/ call also kills the Supabase AUTH refresh, which knocks the whole
  // shell over and would be misread as "the Board Library broke".
  await page.route(
    (url) =>
      /\/rest\/v1\/(boards|board_)/.test(url.href) ||
      /teachDispatch/i.test(url.href),
    async (route) => {
      // ONLY data requests. An earlier revision of this matcher aborted the
      // /boards DOCUMENT itself (the path matches /board/i) and produced an
      // ERR_FAILED that looked exactly like an application failure. That is the
      // "your own abort misread as an app error" trap — hence the strict
      // resourceType gate.
      const rt = route.request().resourceType();
      if (rt !== "xhr" && rt !== "fetch") return route.continue();
      aborted++;
      abortedUrls.push(route.request().url().slice(0, 160));
      return route.abort();
    },
  );

  let restV1 = 0;
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/")) restV1++;
  });

  await page.goto(`${BASE}/boards`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(20000);
  const control = await boardsControl(page);
  const body = await page.locator("body").innerText();
  await page.screenshot({ path: `${OUT}/1a-i-abort-attempt-1440.png`, fullPage: false });

  report.parts.abortProbe = {
    matchedAndAborted: aborted,
    abortedUrls,
    allXhrFetchRequests: allXhr,
    restV1Requests: restV1,
    control,
    sawEmptyCopy: EMPTY_COPY.test(body),
    sawErrorCopy: ERROR_COPY.test(body),
    verdict:
      aborted === 0
        ? "DID NOT RUN — the abort matcher matched zero requests, because the mock path issues none. A pass here would be vacuous."
        : "ran",
    consoleIssues: sink,
  };
  log("[1a-i abort] aborted=", aborted, "restV1=", restV1, "control.ok=", control.ok);
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  await ctx.close();
}

// ── PART 1a-ii: REAL fault injection (chunk rewrite) ─────────────────────────
// Rewrite the dev JS chunk that carries mockTeachSource so the two calls
// loadBoardLibrary awaits both throw. Everything downstream is shipped code.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(ctx);
  const page = await ctx.newPage();
  const sink = [];
  attach(page, sink, /* injected */ true);

  let patchedChunks = 0;
  const patchedUrls = [];
  await page.route(CHUNK_RE, async (route) => {
    const res = await route.fetch({ timeout: 180000 });
    let body = await res.text();
    if (MARK_LIST.test(body) && MARK_COUNT.test(body)) {
      const before = body;
      body = body
        .replace(
          MARK_LIST,
          'async listMyBoards($1){ throw new Error("QA-INJECTED board read failure");',
        )
        .replace(
          MARK_COUNT,
          'async countMyBoards($1){ throw new Error("QA-INJECTED board count failure");',
        );
      if (body !== before) {
        patchedChunks++;
        patchedUrls.push(route.request().url().slice(0, 160));
      }
    }
    return route.fulfill({ response: res, body });
  });

  await page.goto(`${BASE}/boards`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(20000);
  const control = await boardsControl(page);
  const body = await page.locator("body").innerText();
  await page.screenshot({ path: `${OUT}/1a-ii-injected-error-1440.png`, fullPage: false });

  report.parts.faultProbe = {
    patchedChunks,
    patchedUrls,
    control,
    sawErrorCopy: ERROR_COPY.test(body),
    sawEmptyCopy: EMPTY_COPY.test(body),
    // The whole point: error copy present AND empty copy absent.
    pass: patchedChunks > 0 && ERROR_COPY.test(body) && !EMPTY_COPY.test(body),
    verdict:
      patchedChunks === 0
        ? "DID NOT RUN — no chunk carrying mockTeachSource was matched/patched."
        : "ran",
    consoleIssues_ALL_INJECTED: sink,
  };
  log(
    "[1a-ii fault] patched=",
    patchedChunks,
    "errorCopy=",
    ERROR_COPY.test(body),
    "emptyCopy=",
    EMPTY_COPY.test(body),
    "control.ok=",
    control.ok,
  );
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  await ctx.close();
}

// ── PART 1a-iii: opposite direction — genuinely EMPTY settled library ────────
// Patch listMyBoards to RESOLVE with [] and countMyBoards with 0. A settled,
// truly-empty read must still say "No boards yet" and must NOT say "couldn't
// load". A fix that answered "couldn't load" for an empty library would pass
// 1a-ii while lying the other way.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(ctx);
  const page = await ctx.newPage();
  const sink = [];
  attach(page, sink);

  let patchedChunks = 0;
  await page.route(CHUNK_RE, async (route) => {
    const res = await route.fetch({ timeout: 180000 });
    let body = await res.text();
    if (MARK_LIST.test(body) && MARK_COUNT.test(body)) {
      const before = body;
      body = body
        .replace(MARK_LIST, "async listMyBoards($1){ return [];")
        .replace(MARK_COUNT, "async countMyBoards($1){ return 0;")
        .replace(
          MARK_TPL,
          "async listBoardTemplates($1){ return [];",
        );
      if (body !== before) patchedChunks++;
    }
    return route.fulfill({ response: res, body });
  });

  await page.goto(`${BASE}/boards`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(20000);
  const control = await boardsControl(page);
  const body = await page.locator("body").innerText();
  await page.screenshot({ path: `${OUT}/1a-iii-settled-empty-1440.png`, fullPage: false });
  const emptyLine =
    body.match(/No boards yet[^\n]*/i)?.[0] ?? null;
  const templatesLine = body.match(/No templates yet[^\n]*/i)?.[0] ?? null;

  report.parts.emptyProbe = {
    patchedChunks,
    control,
    sawEmptyCopy: EMPTY_COPY.test(body),
    sawErrorCopy: ERROR_COPY.test(body),
    emptyLine,
    templatesLine,
    pass: patchedChunks > 0 && EMPTY_COPY.test(body) && !ERROR_COPY.test(body),
    verdict: patchedChunks === 0 ? "DID NOT RUN" : "ran",
    consoleIssues: sink,
  };
  log("[1a-iii empty] patched=", patchedChunks, "emptyLine=", emptyLine);
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  await ctx.close();
}

// ── PART 1f: Templates strip failure -> does it still say "No templates yet"? ─
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(ctx);
  const page = await ctx.newPage();
  const sink = [];
  attach(page, sink, true);

  let patched = 0;
  await page.route(CHUNK_RE, async (route) => {
    const res = await route.fetch({ timeout: 180000 });
    let body = await res.text();
    if (MARK_TPL.test(body)) {
      const before = body;
      body = body.replace(
        MARK_TPL,
        'async listBoardTemplates($1){ throw new Error("QA-INJECTED template read failure");',
      );
      if (body !== before) patched++;
    }
    return route.fulfill({ response: res, body });
  });

  await page.goto(`${BASE}/boards`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(20000);
  const control = await boardsControl(page);
  const body = await page.locator("body").innerText();
  await page.screenshot({ path: `${OUT}/1f-templates-failure-1440.png`, fullPage: false });

  report.parts.templatesFailure = {
    patched,
    control,
    templatesLine: body.match(/No templates yet[^\n]*/i)?.[0] ?? null,
    sawLoadingForever: /Loading templates/i.test(body),
    verdict: patched === 0 ? "DID NOT RUN" : "ran",
    consoleIssues_ALL_INJECTED: sink,
  };
  log("[1f templates]", report.parts.templatesFailure.templatesLine);
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  await ctx.close();
}

// ── PART 1b/c/d/e + widths: the normal, un-tampered surface ──────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(ctx);
  const page = await ctx.newPage();
  const sink = [];
  attach(page, sink);
  let restV1 = 0;
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/")) restV1++;
  });

  await page.goto(`${BASE}/boards`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(20000);
  const control = await boardsControl(page);
  await page.screenshot({ path: `${OUT}/1b-boards-normal-1440.png`, fullPage: false });

  // ── 1b: per-kind preview tints ────────────────────────────────────────────
  const tints = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('[class*="preview"]')) {
      const cs = getComputedStyle(el);
      const grad = cs.getPropertyValue("--preview-grad").trim();
      const accent = cs.getPropertyValue("--preview-accent").trim();
      if (!grad && !accent) continue;
      const card = el.closest("article,li,div[class*='card'],div[class*='Card']");
      const title = el.textContent?.trim().slice(0, 60) ?? "";
      out.push({
        title,
        grad,
        accent,
        bgImage: cs.backgroundImage.slice(0, 160),
        bgColor: cs.backgroundColor,
      });
    }
    return out;
  });
  const distinctFamilies = [...new Set(tints.map((t) => t.grad).filter(Boolean))];

  // ── 1c: sort control reorders ────────────────────────────────────────────
  const sortSel = page.locator("select").filter({ hasText: /Recently updated/ }).first();
  const titles = async () =>
    page.evaluate(() => {
      const els = [...document.querySelectorAll('[class*="previewTitle"]')];
      return els.map((e) => e.textContent?.trim() ?? "");
    });
  const orderUpdated = await titles();
  await sortSel.selectOption("created");
  await page.waitForTimeout(600);
  const orderCreated = await titles();
  await page.screenshot({ path: `${OUT}/1c-sort-created-1440.png` });
  await sortSel.selectOption("title");
  await page.waitForTimeout(600);
  const orderTitle = await titles();
  await page.screenshot({ path: `${OUT}/1c-sort-title-1440.png` });
  await sortSel.selectOption("updated");
  await page.waitForTimeout(600);

  const sorted = [...orderTitle].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );

  // ── 1d: Team Library rows ────────────────────────────────────────────────
  const teamRows = await page.evaluate(() => {
    const strip = [...document.querySelectorAll("*")].find(
      (e) => e.className?.toString?.().includes("teamLibrary") && e.tagName === "DIV",
    );
    if (!strip) return { found: false };
    const cards = [...strip.querySelectorAll("button")];
    return {
      found: true,
      count: cards.length,
      rows: cards.map((c) => ({
        text: c.innerText.replace(/\n+/g, " | ").slice(0, 200),
        hasChip: !!c.querySelector('[class*="teamCardChip"]'),
        hasTags: !!c.querySelector('[class*="tag"], [class*="Tag"], [class*="chip"]'),
        hasByline: !!c.querySelector('[class*="teamCardBy"]'),
        bylineText: c.querySelector('[class*="teamCardBy"]')?.textContent?.trim() ?? null,
      })),
    };
  });

  // ── 1e: hydration mismatch console text ──────────────────────────────────
  const hydration = sink.filter((i) =>
    /hydrat|did not match|server rendered|Warning: Text content/i.test(i.text),
  );

  report.parts.boardsNormal = {
    control,
    restV1Requests: restV1,
    tintSamples: tints,
    distinctPreviewFamilies: distinctFamilies,
    allBlue: distinctFamilies.length === 1 && /blue/i.test(distinctFamilies[0] ?? ""),
    sort: {
      orderUpdated,
      orderCreated,
      orderTitle,
      updatedVsCreatedDiffer:
        JSON.stringify(orderUpdated) !== JSON.stringify(orderCreated),
      updatedVsTitleDiffer: JSON.stringify(orderUpdated) !== JSON.stringify(orderTitle),
      titleIsAlphabetical: JSON.stringify(orderTitle) === JSON.stringify(sorted),
    },
    teamRows,
    hydrationIssues: hydration,
    consoleIssues: sink,
  };
  log("[1b tints] families=", distinctFamilies.length, distinctFamilies);
  log("[1c sort] u!=c:", report.parts.boardsNormal.sort.updatedVsCreatedDiffer,
      "u!=t:", report.parts.boardsNormal.sort.updatedVsTitleDiffer,
      "alpha:", report.parts.boardsNormal.sort.titleIsAlphabetical);
  log("[1d team]", JSON.stringify(teamRows).slice(0, 400));
  log("[1e hydration]", hydration.length, hydration.map((h) => h.text.slice(0, 300)));

  // ── 1c-narrow: ~300px side-panel wrap guard ──────────────────────────────
  // Not a viewport change — the module must survive INSIDE a ~300px column.
  const narrow = {};
  for (const w of [300, 340]) {
    await page.evaluate((width) => {
      const root = [...document.querySelectorAll("*")].find((e) =>
        e.className?.toString?.().match(/BoardLibrary_root|library_root/),
      );
      const target = root ?? document.querySelector("main");
      if (target) {
        target.style.width = `${width}px`;
        target.style.maxWidth = `${width}px`;
        target.style.overflow = "hidden";
        target.setAttribute("data-qa-narrow", String(width));
      }
    }, w);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/1c-narrow-${w}.png` });
    narrow[w] = await page.evaluate(() => {
      const t = document.querySelector("[data-qa-narrow]");
      if (!t) return { ok: false, reason: "no narrow target" };
      const sortWrap = t.querySelector('[class*="sortWrap"]');
      const filterRow = t.querySelector('[class*="filterRow"]');
      const pills = [...t.querySelectorAll('[class*="filterPill"]')];
      const r = (e) => (e ? e.getBoundingClientRect() : null);
      const fr = r(filterRow);
      const sw = r(sortWrap);
      return {
        ok: true,
        containerWidth: t.getBoundingClientRect().width,
        filterRowWidth: fr?.width ?? null,
        sortWrapWidth: sw?.width ?? null,
        sortWrapTop: sw?.top ?? null,
        pillCount: pills.length,
        // Does the sort sit BELOW the last pill (wrapped to its own line)?
        lastPillBottom: pills.length ? Math.max(...pills.map((p) => p.getBoundingClientRect().bottom)) : null,
        sortWrappedToOwnLine:
          pills.length && sw ? sw.top >= Math.max(...pills.map((p) => p.getBoundingClientRect().bottom)) - 2 : null,
        pillWidths: pills.slice(0, 8).map((p) => Math.round(p.getBoundingClientRect().width)),
        pillMinWidth: pills.length ? Math.min(...pills.map((p) => p.getBoundingClientRect().width)) : null,
        sortSelectWidth: r(t.querySelector('[class*="sortSelect"]'))?.width ?? null,
        horizontalOverflow: t.scrollWidth - t.clientWidth,
      };
    });
    log(`[1c narrow ${w}]`, JSON.stringify(narrow[w]));
  }
  report.parts.narrowPanel = narrow;
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);

  // ── Widths: 375 / 768 / 1440 on /boards ──────────────────────────────────
  const widths = {};
  for (const [w, h, mobile] of [
    [375, 812, true],
    [768, 1024, true],
    [1440, 900, false],
  ]) {
    const wctx = await browser.newContext({
      viewport: { width: w, height: h },
      // Device emulation lies twice — phone/tablet need isMobile + DSF or the
      // touch-target + coarse-pointer maths is measured against a desktop UA.
      isMobile: mobile,
      hasTouch: mobile,
      deviceScaleFactor: mobile ? (w === 375 ? 3 : 2) : 1,
    });
    await login(wctx);
    const wp = await wctx.newPage();
    const wsink = [];
    attach(wp, wsink);
    await wp.goto(`${BASE}/boards`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await wp.waitForTimeout(20000);
    await wp.screenshot({ path: `${OUT}/boards-${w}.png`, fullPage: false });
    widths[w] = await wp.evaluate(() => {
      const de = document.documentElement;
      const main = document.querySelector("#main-content");
      const small = [];
      const sel =
        'button, a[href], select, input, [role="tab"], [role="button"]';
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        if (r.height < 44 || r.width < 44) {
          small.push({
            tag: el.tagName,
            cls: (el.className?.toString?.() ?? "").slice(0, 60),
            label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40),
            w: Math.round(r.width),
            h: Math.round(r.height),
          });
        }
      }
      return {
        docScrollWidth: de.scrollWidth,
        docClientWidth: de.clientWidth,
        docHorizontalOverflow: de.scrollWidth - de.clientWidth,
        bodyScrollWidth: document.body.scrollWidth,
        mainScrollWidth: main?.scrollWidth ?? null,
        mainClientWidth: main?.clientWidth ?? null,
        // scrollWidth is blind to overflow-x:clip — also measure the widest
        // element that pokes past the viewport.
        widestOverhang: (() => {
          let worst = 0, who = null;
          for (const el of document.querySelectorAll("body *")) {
            const r = el.getBoundingClientRect();
            if (r.width === 0) continue;
            const over = r.right - de.clientWidth;
            if (over > worst) { worst = over; who = (el.className?.toString?.() ?? el.tagName).slice(0, 60); }
          }
          return { px: Math.round(worst), who };
        })(),
        pointerCoarse: matchMedia("(pointer: coarse)").matches,
        anyPointerCoarse: matchMedia("(any-pointer: coarse)").matches,
        smallTargets: small.slice(0, 25),
        smallTargetCount: small.length,
        boardsVisible: document.querySelectorAll('[class*="previewTitle"]').length,
      };
    });
    widths[w].consoleIssues = wsink;
    log(`[width ${w}]`, JSON.stringify({ ...widths[w], consoleIssues: wsink.length, smallTargets: undefined }).slice(0, 500));
    await wctx.close();
  }
  report.parts.widths = widths;
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
  await ctx.close();
}

await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));
log("\n=== WROTE", `${OUT}/report.json`, "===");
