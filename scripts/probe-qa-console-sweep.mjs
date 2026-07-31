/**
 * probe-qa-console-sweep.mjs — QA PART 2: per-route console/error sweep.
 *
 * REPORT-ONLY. Sweeps 8 routes in a FRESH BrowserContext each, so no message
 * can be misattributed across routes, and records:
 *   - console messages of type error|warning
 *   - pageerror (uncaught exceptions)
 *   - requestfailed
 *   - responses with status >= 400
 *   - a POSITIVE CONTROL per route (#main-content present, innerText length,
 *     document.title, final URL) — an "no errors" claim on a blank page is
 *     worthless, so every route reports its control value.
 *   - the count of network requests whose URL contains "/rest/v1/" (Supabase
 *     REST). Locally the planner runs the MOCK path, so 0 is EXPECTED and means
 *     "no Supabase read path was exercised", NOT "Supabase is healthy".
 *
 * Waits >= 8000ms after domcontentloaded before reading: this app hydrates in
 * 5-9s in dev, and a short wait manufactures a false "no console errors".
 *
 * Usage:
 *   PROBE_BASE=http://localhost:3014 node scripts/probe-qa-console-sweep.mjs
 */

import { chromium, devices } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { authedStorageState } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const SETTLE_MS = Number(process.env.PROBE_SETTLE_MS ?? 9000);
const SHOT_DIR = path.resolve("docs/screenshots/qa-boards");

const ROUTES = [
  "/planner",
  "/weekly",
  "/daily",
  "/year",
  "/teach",
  "/post",
  "/catch-up",
  "/settings",
];

function slug(route) {
  return route.replace(/^\//, "").replace(/\//g, "-") || "root";
}

/**
 * REPEAT mode — `--repeat <route> <n>`.
 *
 * A useId hydration mismatch is POSITION-derived and INTERMITTENT: the one this
 * repo already fixed in TimelineDrawer reproduced on "roughly one load in
 * three". A single load therefore cannot clear a route of it — absence over one
 * sample is not evidence of absence. This mode reloads one route N times in N
 * fresh contexts and reports how many loads produced a hydration-shaped
 * console message, with the FULL verbatim text of each.
 */
async function repeatMode(route, n) {
  const browser = await chromium.launch({ channel: "chrome" });
  const hits = [];
  let rendered = 0;
  try {
    const storageState = await authedStorageState(browser, {
      base: BASE,
      next: "/weekly",
      retries: 3,
      timeout: 120000,
    });
    for (let i = 1; i <= n; i += 1) {
      // PROBE_FRAME / PROBE_MOBILE reproduce the CONFIGURATION in which the
      // known useId mismatch was measured. scripts/probe-year-preview.mjs
      // records it (2026-07-31) as PAPER-frame + PHONE-tier: /weekly paper 2/3
      // loads, /year paper 1/3, /year GLASS 0/3, /planner paper 0/3. Sweeping
      // the default glass frame at 1440 is therefore the configuration in which
      // it is NOT expected to fire — "did not see it there" is not a refutation
      // unless you also look where it lives.
      const wantPaper = process.env.PROBE_FRAME === "paper";
      const mobile = process.env.PROBE_MOBILE === "1";
      const context = await browser.newContext({
        storageState,
        ...(mobile
          ? { ...devices["iPhone 14 Pro"], viewport: { width: 390, height: 780 } }
          : { viewport: { width: 1440, height: 900 } }),
      });
      if (wantPaper) {
        await context.addCookies([
          {
            name: "mc-theme-axes",
            value: "v1.paper.dark.photo.clear.normal.vivid.highlight",
            url: BASE,
          },
        ]);
        await context.addInitScript(() => {
          localStorage.setItem("mycurricula:user:theme-frame", "paper");
          localStorage.setItem("mycurricula:user:theme", "clear");
          localStorage.setItem("mycurricula:user:theme-glass", "dark");
          localStorage.setItem("mycurricula:user:theme-bg", "photo");
          localStorage.setItem("mycurricula:user:theme-dim", "normal");
        });
      }
      // Same first-run seed the sweep applies. Omitting it here made every
      // load report rendered=false — the first-run gate parks the run on
      // /onboarding from a post-hydration effect, which is indistinguishable
      // from "the route failed to render" unless you record the landed URL.
      await context.addInitScript(() => {
        try {
          localStorage.setItem(
            "mycurricula:onboarding",
            JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
          );
        } catch {
          /* storage disabled */
        }
      });
      const page = await context.newPage();
      const seen = [];

      // ── CONSOLE-INDEPENDENT useId INSTRUMENT ────────────────────────────
      // The claim under test is that WeeklyShellInner's srOnly live region
      // hydrates with a different id than the server sent. Reading that off
      // the console makes the result hostage to console plumbing. So read the
      // SSR HTML off the wire and compare it to the hydrated DOM directly.
      // This cannot fail open: if the region is missing from either side, that
      // is reported as its own outcome rather than as "no mismatch".
      let ssrLiveRegionId = null;
      let ssrCaptureError = null;
      page.on("response", async (res) => {
        try {
          if (res.request().resourceType() !== "document") return;
          if (!res.url().startsWith(BASE)) return;
          const body = await res.text();
          const m = body.match(
            /<div id="([^"]*)"[^>]*role="status"[^>]*aria-live="polite"/,
          );
          ssrLiveRegionId = m ? m[1] : "__NOT_IN_SSR_HTML__";
        } catch (e) {
          ssrCaptureError = String(e?.message ?? e).split("\n")[0];
        }
      });
      page.on("console", (msg) => {
        const t = msg.type();
        if (t === "error" || t === "warning") seen.push({ type: t, text: msg.text() });
      });
      page.on("pageerror", (e) =>
        seen.push({ type: "pageerror", text: String(e?.message ?? e) }),
      );
      await page
        .goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 120000 })
        .catch(() => {});
      // GATE ON HYDRATION BEFORE COMPARING IDS.
      //
      // Without this the id comparison is TAUTOLOGICAL: if React never
      // attaches, the DOM still holds the server's markup, so "client id" IS
      // the SSR id and the check reports "no mismatch" for a page React never
      // touched. That is a fail-open instrument — it would clear the route of a
      // hydration bug precisely when hydration did not happen.
      let hydrateMs = null;
      const t0 = Date.now();
      try {
        await page.waitForFunction(
          () => {
            const el = document.querySelector("#main-content") ?? document.body;
            if (!el) return false;
            return Object.keys(el).some(
              (k) =>
                k.startsWith("__reactFiber") || k.startsWith("__reactProps"),
            );
          },
          undefined,
          { timeout: 90000, polling: 250 },
        );
        hydrateMs = Date.now() - t0;
      } catch {
        hydrateMs = null;
      }

      await page.waitForTimeout(SETTLE_MS);
      // Positive control, WITH the landed URL — "no #main-content" is
      // ambiguous on its own: it looks identical whether the page is still
      // compiling or the run was bounced to /login or /onboarding. Record what
      // we actually landed on so the two cannot be confused.
      const ctl = await page
        .evaluate(() => ({
          url: location.pathname,
          title: document.title,
          hasMain: Boolean(document.querySelector("#main-content")),
          bodyLen: (document.body?.innerText ?? "").trim().length,
          // Record the appearance axes actually in force. A "paper frame" run
          // that silently rendered glass would be measuring the wrong
          // configuration and reporting it as the right one.
          frame: document.documentElement.dataset.frame ?? null,
          tone: document.documentElement.dataset.tone ?? null,
          modalOpen: Boolean(
            document.querySelector('[role="dialog"][aria-modal="true"]'),
          ),
          // Did React actually ATTACH? Without this, "the modal never opened"
          // and "the page had not hydrated yet when I looked" are the same
          // observation, and the first is a bug report while the second is a
          // measurement artefact. A React fiber key on #main-content proves
          // the client tree is live.
          hydrated: (() => {
            const el = document.querySelector("#main-content");
            if (!el) return false;
            return Object.keys(el).some(
              (k) => k.startsWith("__reactFiber") || k.startsWith("__reactProps"),
            );
          })(),
        }))
        .catch((e) => ({ evalError: String(e?.message ?? e).split("\n")[0] }));
      const ok = Boolean(ctl.hasMain);
      if (ok) rendered += 1;

      const clientLiveRegionId = await page
        .evaluate(() => {
          const el = document.querySelector(
            '[role="status"][aria-live="polite"]',
          );
          return el ? el.id : "__NOT_IN_DOM__";
        })
        .catch(() => "__EVAL_FAILED__");
      const bothIds =
        typeof ssrLiveRegionId === "string" &&
        ssrLiveRegionId.startsWith("_R_") &&
        typeof clientLiveRegionId === "string" &&
        clientLiveRegionId.startsWith("_R_");
      const idCheck = {
        ssr: ssrLiveRegionId,
        client: clientLiveRegionId,
        ssrCaptureError,
        hydrateMs,
        // MEASURABLE only when React actually attached AND both ids exist.
        // Anything else is "not measured", never "no mismatch".
        measured: bothIds && Boolean(ctl.hydrated),
        mismatch: bothIds && Boolean(ctl.hydrated) && ssrLiveRegionId !== clientLiveRegionId,
      };
      const hydration = seen.filter((s) =>
        /hydrat|did not match|server render|Warning: Text content|tree hydrated/i.test(
          s.text,
        ),
      );
      hits.push({
        load: i,
        control: ctl,
        rendered: ok,
        total: seen.length,
        hydration,
        idCheck,
        all: seen,
      });
      console.log(
        `  load ${i}/${n}: url=${ctl.url ?? "?"} main=${ok} bodyLen=${ctl.bodyLen ?? "?"} ` +
          `hydrated=${ctl.hydrated} modal=${ctl.modalOpen} ` +
          `msgs=${seen.length} hydrationShaped=${hydration.length} ` +
          `liveRegionId ssr=${idCheck.ssr} client=${idCheck.client} MISMATCH=${idCheck.mismatch}`,
      );
      await context.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
  const out = path.resolve(`.udir-probe/qa-repeat-${slug(route)}.json`);
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(hits, null, 2), "utf8");
  const withHydration = hits.filter((h) => h.hydration.length > 0).length;
  const withIdMismatch = hits.filter((h) => h.idCheck?.mismatch).length;
  const idComparable = hits.filter((h) => h.idCheck?.measured).length;
  const hydratedLoads = hits.filter((h) => h.control?.hydrated).length;
  console.log(
    `\nREPEAT ${route}: ${n} loads, ${rendered} rendered, ${hydratedLoads} HYDRATED, ` +
      `${withHydration} with a hydration-shaped console message, ` +
      `${withIdMismatch}/${idComparable} loads where the live-region id ACTUALLY differed ` +
      `(SSR vs hydrated DOM). ${n - idComparable} load(s) NOT MEASURED (no hydration / no id pair).`,
  );
  console.log(`FULL RECORD: ${out}`);
}

async function main() {
  mkdirSync(SHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ channel: "chrome" });
  const results = [];
  try {
    // Pay for auth once; every route context reuses the authed storage state.
    const storageState = await authedStorageState(browser, {
      base: BASE,
      next: "/weekly",
      retries: 3,
      timeout: 120000,
    });

    for (const route of ROUTES) {
      // FRESH context per route — the whole point: one route's messages can
      // never be attributed to another.
      const context = await browser.newContext({
        storageState,
        viewport: { width: 1440, height: 900 },
      });
      // Belt and braces: the storage state should already carry the onboarding
      // flag, but re-seed so a first-run redirect can never park this run.
      await context.addInitScript(() => {
        try {
          localStorage.setItem(
            "mycurricula:onboarding",
            JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
          );
        } catch {
          /* storage disabled — gate behaves as it would for any such user */
        }
      });

      const rec = {
        route,
        errors: [],
        warnings: [],
        pageerrors: [],
        requestfailed: [],
        http4xx5xx: [],
        restV1: 0,
        control: null,
        navError: null,
        // INSTRUMENT CONTROL. An all-zero console result across every route is
        // the signature of a dead listener, not of a clean app. So after the
        // measured window we deliberately emit one error + one warning from the
        // page and check they land in the sink. If they don't, every "0 errors"
        // in this run is UNRELIABLE and must be reported as such.
        instrumentControl: { errorSeen: false, warningSeen: false },
        // Every non-error console type seen, counted. A live listener that saw
        // Next's own dev chatter is corroborating evidence it was attached.
        otherConsoleTypes: {},
      };

      const CONTROL_ERR = "__PROBE_INSTRUMENT_CONTROL_ERROR__";
      const CONTROL_WARN = "__PROBE_INSTRUMENT_CONTROL_WARNING__";

      const page = await context.newPage();

      page.on("console", (msg) => {
        const type = msg.type();
        const raw = msg.text();
        if (raw.includes(CONTROL_ERR)) {
          rec.instrumentControl.errorSeen = true;
          return;
        }
        if (raw.includes(CONTROL_WARN)) {
          rec.instrumentControl.warningSeen = true;
          return;
        }
        if (type !== "error" && type !== "warning") {
          rec.otherConsoleTypes[type] = (rec.otherConsoleTypes[type] ?? 0) + 1;
          return;
        }
        const loc = msg.location();
        const entry = {
          text: msg.text(),
          url: loc?.url ?? "",
          line: loc?.lineNumber ?? null,
        };
        (type === "error" ? rec.errors : rec.warnings).push(entry);
      });
      page.on("pageerror", (err) => {
        rec.pageerrors.push({
          message: String(err?.message ?? err),
          stack: String(err?.stack ?? "").slice(0, 3000),
        });
      });
      page.on("requestfailed", (req) => {
        rec.requestfailed.push({
          url: req.url(),
          failure: req.failure()?.errorText ?? "",
        });
      });
      page.on("request", (req) => {
        if (req.url().includes("/rest/v1/")) rec.restV1 += 1;
      });
      page.on("response", (res) => {
        if (res.status() >= 400) {
          rec.http4xx5xx.push({ url: res.url(), status: res.status() });
        }
      });

      try {
        await page.goto(`${BASE}${route}`, {
          waitUntil: "domcontentloaded",
          timeout: 120000,
        });
      } catch (err) {
        rec.navError = String(err?.message ?? err).split("\n")[0];
      }

      // ── WAIT FOR REACT TO ATTACH, then hold the window open ─────────────
      // A fixed sleep measures SSR HTML. Worse, a page that never hydrates
      // CANNOT emit a hydration warning — so "0 console errors" on an
      // unhydrated page is not a clean bill of health, it is a measurement of
      // nothing. Poll for a React fiber, record how long it took (or that it
      // never arrived), and only then read the console sink.
      const tHydrateStart = Date.now();
      let hydrateMs = null;
      try {
        await page.waitForFunction(
          () => {
            const el =
              document.querySelector("#main-content") ?? document.body;
            if (!el) return false;
            return Object.keys(el).some(
              (k) =>
                k.startsWith("__reactFiber") || k.startsWith("__reactProps"),
            );
          },
          undefined,
          { timeout: 90000, polling: 250 },
        );
        hydrateMs = Date.now() - tHydrateStart;
      } catch {
        hydrateMs = null; // never hydrated inside 90s
      }
      rec.hydrateMs = hydrateMs;

      // Hold the window open past hydration so post-hydrate effects, theme
      // sync and lazy panels get a chance to log.
      await page.waitForTimeout(SETTLE_MS);

      // POSITIVE CONTROL — proof the page actually rendered.
      try {
        rec.control = await page.evaluate(() => {
          const main = document.querySelector("#main-content");
          const body = document.body;
          return {
            url: location.pathname + location.search,
            title: document.title,
            hasMainContent: Boolean(main),
            mainTextLen: main ? (main.innerText || "").trim().length : 0,
            bodyTextLen: body ? (body.innerText || "").trim().length : 0,
            mainTextHead: main ? (main.innerText || "").trim().slice(0, 120) : "",
            frame: document.documentElement.dataset.frame ?? null,
            tone: document.documentElement.dataset.tone ?? null,
            modalOpen: Boolean(
              document.querySelector('[role="dialog"][aria-modal="true"]'),
            ),
            hydrated: (() => {
              const el = document.querySelector("#main-content") ?? document.body;
              if (!el) return false;
              return Object.keys(el).some(
                (k) =>
                  k.startsWith("__reactFiber") || k.startsWith("__reactProps"),
              );
            })(),
          };
        });
      } catch (err) {
        rec.control = { error: String(err?.message ?? err).split("\n")[0] };
      }

      // Fire the instrument control AFTER the measured window, so it cannot
      // pollute the route's own counts, and give the CDP event time to arrive.
      try {
        await page.evaluate(
          ([e, w]) => {
            console.error(e);
            console.warn(w);
          },
          [CONTROL_ERR, CONTROL_WARN],
        );
        await page.waitForTimeout(600);
      } catch (err) {
        rec.instrumentControl.evalError = String(err?.message ?? err).split("\n")[0];
      }

      try {
        await page.screenshot({
          path: path.join(SHOT_DIR, `sweep-${slug(route)}-1440.png`),
          fullPage: false,
        });
      } catch {
        /* screenshot failure must not lose the console record */
      }

      results.push(rec);
      await page.close().catch(() => {});
      await context.close().catch(() => {});

      // Console line so a partial run still yields something readable.
      const c = rec.control ?? {};
      console.log(
        `[${route}] url=${c.url ?? "?"} main=${c.hasMainContent} len=${c.mainTextLen} ` +
          `HYDRATED=${c.hydrated} in ${rec.hydrateMs ?? "NEVER(>90s)"}ms ` +
          `errors=${rec.errors.length} warnings=${rec.warnings.length} ` +
          `pageerrors=${rec.pageerrors.length} rest/v1=${rec.restV1} ` +
          `http>=400=${rec.http4xx5xx.length} reqfailed=${rec.requestfailed.length} ` +
          `CONTROL[err=${rec.instrumentControl.errorSeen},warn=${rec.instrumentControl.warningSeen}] ` +
          `otherConsole=${JSON.stringify(rec.otherConsoleTypes)}`,
      );
    }
  } finally {
    await browser.close().catch(() => {});
  }

  const out = path.resolve(".udir-probe/qa-console-sweep.json");
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(results, null, 2), "utf8");
  console.log(`\nFULL RECORD: ${out}`);
}

const argv = process.argv.slice(2);
if (argv[0] === "--repeat") {
  // PROBE_ROUTE first: Git Bash (MSYS) rewrites a bare `/weekly` argv into
  // `C:/Program Files/Git/weekly`. That silently produced a 6-load run against
  // a nonsense URL whose every load reported "did not render" — a fabricated
  // result that looked exactly like a broken route. Hard-fail on a route that
  // is not a clean absolute path rather than measure garbage again.
  const route = process.env.PROBE_ROUTE ?? argv[1] ?? "/weekly";
  if (!/^\/[\w\-/]*$/.test(route)) {
    console.error(
      `REFUSING TO RUN: route ${JSON.stringify(route)} is not a clean absolute path ` +
        `(MSYS path conversion?). Pass it via PROBE_ROUTE=... instead.`,
    );
    process.exit(2);
  }
  await repeatMode(route, Number(process.env.PROBE_N ?? argv[2] ?? 6));
} else {
  await main();
}
