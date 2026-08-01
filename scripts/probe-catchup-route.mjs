// probe-catchup-route.mjs — DIAGNOSIS pass for task #49.
//
// The claim under test: navigating to /catch-up produces an empty page — an
// `#main-content` holding only a resolved Suspense marker, and no dialog
// anywhere in the document.
//
// WHY THIS PROBE IS SHAPED THE WAY IT IS. "No dialog" is an ABSENCE, and an
// absence assertion passes for free on a page that never hydrated. Dev
// hydration on this box has been measured at 36-52s under concurrent-lane
// load, and the lane that opened this task retracted seven other findings that
// turned out to be exactly that. So every absence here is gated on a POSITIVE
// control evaluated on the SAME page in the SAME reading:
//
//   • GATE 1 (machinery): /weekly opens the Catch-Up modal from the toggle
//     event. Proves the singleton, the elected Host, and the modal body all
//     work — so a failure on /catch-up is about the ROUTE, not the modal.
//   • GATE 2 (interactivity, on /catch-up itself): the chrome Tools popover
//     opens on a real click. React is attached and handlers run. Only then is
//     "there is no dialog" evidence of anything.
//
// It also answers the severity question the finding could not: is Catch-Up
// reachable from the Tools dock when the route itself is broken?
//
// REPORT-ONLY. The only state written is localStorage inside its own browser
// context (the onboarding flag, via scripts/lib/auth.mjs).
//
// Run: node scripts/probe-catchup-route.mjs        (dev server already on 3014)

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const SHOTS = "docs/screenshots/catchup-route";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`,
  );
};
const note = (m) => console.log(`      · ${m}`);

const consoleLog = [];
const attach = (page, tag) => {
  page.on("console", (m) => {
    const t = m.type();
    if (t === "error" || t === "warning")
      consoleLog.push({ tag, type: t, text: m.text().slice(0, 400) });
  });
  page.on("pageerror", (e) =>
    consoleLog.push({ tag, type: "pageerror", text: String(e).slice(0, 400) }),
  );
};

/** The Catch-Up dialog, identified by its scope chips — `[role=dialog]` alone
 *  matches other overlays this app mounts, and waiting on it once hung a run. */
const CATCHUP_CHIPS = '[role="dialog"] [role="group"][aria-label="Scope"] button';

/** Everything about the document that distinguishes the failure modes, read in
 *  ONE evaluation so the readings cannot drift apart between polls. */
const readState = (page) =>
  page.evaluate(() => {
    const main = document.querySelector("#main-content");
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    return {
      url: location.pathname + location.search,
      mainChildren: main ? main.children.length : -1,
      mainHtml: main ? main.innerHTML.slice(0, 120) : "(no #main-content)",
      dialogCount: dialogs.length,
      dialogLabels: dialogs.map(
        (d) =>
          d.getAttribute("aria-label") ||
          d.querySelector("h1,h2,h3")?.textContent?.trim() ||
          "(unlabelled)",
      ),
      catchupChips: document.querySelectorAll(
        '[role="dialog"] [role="group"][aria-label="Scope"] button',
      ).length,
      // The chrome itself — present on every planner route, so its absence
      // would mean the run is not where it thinks it is.
      toolsButton: !!document.querySelector('button[aria-label="Tools"]'),
    };
  });

/** Poll for the Catch-Up modal for up to `seconds`, re-dispatching the toggle
 *  each second when asked. The listener attaches post-hydration, so a probe
 *  that dispatches once and then merely waits sits out the hydration window
 *  and reports an app failure that is really its own. */
async function waitForCatchup(page, { seconds, dispatch }) {
  const t0 = Date.now();
  for (let i = 0; i < seconds; i += 1) {
    if ((await page.locator(CATCHUP_CHIPS).count().catch(() => 0)) > 0) {
      return (Date.now() - t0) / 1000;
    }
    if (dispatch) {
      await page
        .evaluate(() => window.dispatchEvent(new CustomEvent("catchup:toggle")))
        .catch(() => {});
    }
    await page.waitForTimeout(1000);
  }
  return null;
}

/** GATE 2 — prove THIS page is hydrated and interactive, by opening the chrome
 *  Tools popover with a real click. Returns the seconds it took, or null. */
async function proveInteractive(page, label) {
  const btn = page.locator('button[aria-label="Tools"]').first();
  const t0 = Date.now();
  for (let i = 0; i < 240; i += 1) {
    await btn.click({ timeout: 2000 }).catch(() => {});
    if ((await btn.getAttribute("aria-expanded").catch(() => null)) === "true") {
      const secs = (Date.now() - t0) / 1000;
      note(`${label}: Tools popover opened after ${secs.toFixed(1)}s`);
      return secs;
    }
    await page.waitForTimeout(1000);
  }
  return null;
}

async function closeToolsPopover(page) {
  const btn = page.locator('button[aria-label="Tools"]').first();
  if ((await btn.getAttribute("aria-expanded").catch(() => null)) === "true") {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(400);
  }
}

const makeCtx = async (browser, viewport) => {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  ctx.setDefaultNavigationTimeout(420000);
  await bypassLogin(ctx, {
    base: BASE,
    next: "/weekly",
    retries: 3,
    timeout: 180000,
  });
  return ctx;
};

// ── A. the machinery works at all (positive control for everything below) ────

async function sectionA(browser) {
  console.log("\n══ A · control: the Catch-Up modal machinery works on /weekly ══");
  const ctx = await makeCtx(browser, { width: 1440, height: 950 });
  const page = await ctx.newPage();
  attach(page, "A");
  await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#main-content", { timeout: 240000 });

  const secs = await waitForCatchup(page, { seconds: 300, dispatch: true });
  ok(
    "A — /weekly opens the Catch-Up modal from the toggle event (machinery control)",
    secs !== null,
    secs === null ? "no dialog in 300s" : `opened after ${secs.toFixed(1)}s`,
  );
  const st = await readState(page);
  note(`state: ${JSON.stringify(st)}`);
  await page.screenshot({ path: `${SHOTS}/A-weekly-modal.png` });
  await ctx.close();
  return secs !== null;
}

// ── B. the route itself, at three widths ────────────────────────────────────

/**
 * Has React ATTACHED to this page? A `__reactFiber$…` key on a DOM node is
 * written by react-dom at commit time, so its presence on a deep client-
 * component node means that subtree hydrated — and its ABSENCE means the page
 * is still server HTML with no React on it.
 *
 * This matters more than it sounds. Server HTML on this app is fully painted
 * chrome — brand, nav, Tools button, the bell — so a page with no React on it
 * still LOOKS alive. `/catch-up` compounds it: its route body renders the modal
 * only after hydration, so until then the document is chrome + an empty
 * `#main-content` + no dialog, which is exactly what task #49 reported as a
 * bug. Section D measures that window at 91.7s on a healthy load. Nothing else
 * available to a probe distinguishes "not hydrated yet" from "hydrated and
 * empty"; this does.
 */
const reactAttached = (page) =>
  page
    .evaluate(() => {
      const el =
        document.querySelector('button[aria-label="Tools"]') ??
        document.querySelector("#main-content");
      if (!el) return false;
      return Object.keys(el).some((k) => k.startsWith("__react"));
    })
    .catch(() => false);

/** True once a ChunkLoadError / bundle SyntaxError has been seen on this page.
 *  The dev server is shared with several writing lanes, so a rebuild mid-load
 *  can 404 a chunk; that is an ENVIRONMENT failure and must never be scored as
 *  a product finding. */
const makeChunkWatch = (page) => {
  const state = { hit: 0, last: "" };
  const seen = (t) => {
    if (/ChunkLoadError|Invalid or unexpected token|Loading chunk/.test(t)) {
      state.hit += 1;
      state.last = t.slice(0, 160);
    }
  };
  page.on("console", (m) => seen(m.text()));
  page.on("pageerror", (e) => seen(String(e)));
  return state;
};

/**
 * Load /catch-up and wait until React is actually attached, reloading through
 * any chunk failure. Returns { secs, reloads } or null if it never hydrated.
 */
async function loadHydrated(page, chunk, label, { seconds = 420 } = {}) {
  const t0 = Date.now();
  let reloads = 0;
  await page.goto(`${BASE}/catch-up`, { waitUntil: "domcontentloaded" });
  for (let i = 0; i < seconds; i += 1) {
    if (await reactAttached(page)) {
      const secs = (Date.now() - t0) / 1000;
      note(
        `${label}: React attached after ${secs.toFixed(1)}s (${reloads} reload(s) through chunk failures)`,
      );
      return { secs, reloads };
    }
    // A dead bundle never recovers on its own — reload it rather than sitting
    // out the window and then reporting the app as empty.
    if (chunk.hit > 0 && i % 20 === 19) {
      chunk.hit = 0;
      reloads += 1;
      note(`${label}: chunk failure seen — reloading (#${reloads}): ${chunk.last}`);
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    }
    await page.waitForTimeout(1000);
  }
  return null;
}

async function sectionB(browser, { width, height, label }) {
  console.log(`\n══ B@${label} · direct load of /catch-up (${width}px) ══`);
  const ctx = await makeCtx(browser, { width, height });
  const page = await ctx.newPage();
  attach(page, `B@${label}`);
  const chunk = makeChunkWatch(page);

  // WARM the route first. A cold dev route compiles on demand, and a rebuild
  // in flight is what 404s `app/(planner)/layout.js`. This first load is
  // measured for nothing — it exists so the measured load below runs against a
  // compiled route.
  const warm = await loadHydrated(page, chunk, `B@${label} warm-up`);
  ok(
    `B@${label} — GATE 0: the route hydrates at all (warm-up)`,
    warm !== null,
    warm === null
      ? "React never attached in 420s — the dev server is not serving a usable bundle; NOTHING below is admissible"
      : `${warm.secs.toFixed(1)}s, ${warm.reloads} reload(s)`,
  );
  if (warm === null) {
    await page.screenshot({ path: `${SHOTS}/B-${label}-never-hydrated.png` });
    await ctx.close();
    return;
  }

  // ── The measured load: a warm route, hydration confirmed, THEN read ───────
  chunk.hit = 0;
  const hydrated = await loadHydrated(page, chunk, `B@${label} measured`);
  ok(
    `B@${label} — GATE 1: the measured load hydrated (React attached)`,
    hydrated !== null,
    hydrated === null ? "never attached" : `${hydrated.secs.toFixed(1)}s`,
  );
  if (hydrated === null) {
    await ctx.close();
    return;
  }
  // Effects run after commit; give the route's own mount effect a generous
  // window AFTER React is proven attached, so this is not a race with it.
  const routeSecs = await waitForCatchup(page, { seconds: 45, dispatch: false });
  const afterRoute = await readState(page);
  note(`45s after React attached: ${JSON.stringify(afterRoute)}`);
  note(`chunk failures during the measured window: ${chunk.hit}`);
  await page.screenshot({ path: `${SHOTS}/B-${label}-route.png` });

  // GATE 2 — a real click lands and changes state. React being attached proves
  // it committed; this proves handlers actually run.
  //
  // The gate BRANCHES on what is on screen, and it has to. The first version
  // always clicked the chrome Tools button — and when the route worked, the
  // open modal's scrim sat over that button, so the click never landed and the
  // gate failed on the healthy case. An instrument whose gate is blocked by the
  // very success it is measuring reports the pass as a failure.
  let interactive = null;
  let via = "";
  if (routeSecs !== null) {
    // The modal is up: interact with IT. A scope chip flipping `aria-pressed`
    // is a click landing on a React handler and state coming back out.
    const chip = page.locator(CATCHUP_CHIPS).nth(1);
    const before = await chip.getAttribute("aria-pressed").catch(() => null);
    await chip.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(600);
    const after = await chip.getAttribute("aria-pressed").catch(() => null);
    if (before !== null && after === "true" && before !== after) {
      interactive = 0;
      via = `a scope chip inside the modal flipped aria-pressed ${before} → ${after}`;
    }
  } else {
    const secs = await proveInteractive(page, `B@${label}`);
    if (secs !== null) {
      interactive = secs;
      via = `the chrome Tools popover opened after ${secs.toFixed(1)}s`;
    }
  }
  ok(
    `B@${label} — GATE 2: /catch-up is interactive (a real click changes state)`,
    interactive !== null,
    interactive === null
      ? "no click changed any state — every reading here is INADMISSIBLE"
      : via,
  );
  if (interactive === null) {
    await ctx.close();
    return;
  }
  ok(
    `B@${label} — GATE 3: no chunk failure contaminated the measured window`,
    chunk.hit === 0,
    chunk.hit === 0 ? "clean" : `${chunk.hit} chunk error(s): ${chunk.last}`,
  );

  // THE CLAIM UNDER TEST, now admissible: warm route, React attached, no chunk
  // failure, a click proven to land.
  ok(
    `B@${label} — the route paints the Catch-Up modal on its own`,
    routeSecs !== null,
    routeSecs === null
      ? `no dialog 45s after React attached on a page proven interactive; #main-content = ${afterRoute.mainChildren} children, html "${afterRoute.mainHtml}", ${afterRoute.dialogCount} dialog(s) in document`
      : `opened ${routeSecs.toFixed(1)}s after React attached; ${afterRoute.catchupChips} scope chips`,
  );

  if (routeSecs !== null) {
    // The rest of the route's contract: dismissing the modal must not leave the
    // teacher on a blank /catch-up — it falls back to /weekly.
    await page.keyboard.press("Escape");
    // POLL, and BUDGET THE POLL AGAINST THIS RUN'S OWN MEASURED SPEED.
    //
    // The fallback is `router.push("/weekly")` — a client-side navigation that
    // must fetch and compile /weekly on a dev server shared with a dozen
    // writing lanes. Two earlier versions of this check were wrong in the same
    // way, and both produced a "confirmed" product defect that did not exist:
    //   • a flat 2.5s wait — shorter than the environment's own latency;
    //   • a flat 120s wait — which passed on a run where hydration took 12.6s
    //     and the nav landed in 10.5s, and FAILED on a run where hydration took
    //     128.6s. Same code, same assertion, opposite verdicts, and the only
    //     variable was how loaded the box was.
    // A fixed window is a fixed-window ABSENCE ASSERTION, the exact shape every
    // other gate in this file exists to avoid. So the budget is derived from
    // GATE 1's measured hydration time: this box just showed us how slow it is,
    // and the navigation is the same kind of work. 20× that, floor 60s.
    const budget = Math.max(60, Math.ceil(hydrated.secs * 20));
    note(
      `dismiss budget: ${budget}s (20 × this run's ${hydrated.secs.toFixed(1)}s hydration, floor 60s)`,
    );
    let after = await readState(page);
    const t0 = Date.now();
    for (let i = 0; i < budget && !after.url.startsWith("/weekly"); i += 1) {
      await page.waitForTimeout(1000);
      after = await readState(page);
    }
    const secs = (Date.now() - t0) / 1000;
    ok(
      `B@${label} — dismissing the modal leaves /catch-up rather than sitting blank`,
      after.url.startsWith("/weekly"),
      after.url.startsWith("/weekly")
        ? `landed on ${after.url} after ${secs.toFixed(1)}s`
        : `still on ${after.url} after ${secs.toFixed(1)}s (budget ${budget}s) with ${after.dialogCount} dialog(s) — a blank page`,
    );
    await page.screenshot({ path: `${SHOTS}/B-${label}-after-dismiss.png` });

    // THE CONTROL THAT MAKES THE ABOVE MEAN SOMETHING. "The page did not
    // navigate" has two completely different causes: the route's fallback never
    // fired, or client-side navigation on this dev server is simply not
    // completing. They are indistinguishable from the URL alone. So drive a
    // navigation BY HAND from the same page in the same session: if a manual
    // one lands, the router works and the fallback is the broken part.
    if (!after.url.startsWith("/weekly")) {
      const opened = await proveInteractive(page, `B@${label} nav-control`);
      let manual = null;
      if (opened !== null) {
        await page
          .locator(".toolsrow-views")
          .locator("text=Week")
          .first()
          .click({ timeout: 5000 })
          .catch(() => {});
        const t1 = Date.now();
        let st = await readState(page);
        for (let i = 0; i < 90 && !st.url.startsWith("/weekly"); i += 1) {
          await page.waitForTimeout(1000);
          st = await readState(page);
        }
        manual = st.url.startsWith("/weekly") ? (Date.now() - t1) / 1000 : null;
      }
      ok(
        `B@${label} — CONTROL: a manual client-side navigation DOES work from this page`,
        manual !== null,
        manual === null
          ? "manual navigation also never landed — the dev server's router is the suspect, NOT the route's fallback; the dismiss result above is INCONCLUSIVE"
          : `manual nav to /weekly landed in ${manual.toFixed(1)}s, so the router works and the /weekly fallback is genuinely not firing`,
      );
      await page.screenshot({ path: `${SHOTS}/B-${label}-nav-control.png` });
    }
    await ctx.close();
    return;
  }

  // ── Severity question, only reached if the route itself failed: is the OTHER
  //    entry point alive here? ───────────────────────────────────────────────
  const item = page.locator(".toolsrow").locator("text=Catch-up");
  await page.screenshot({ path: `${SHOTS}/B-${label}-tools-open.png` });
  await item
    .first()
    .click({ timeout: 4000 })
    .catch(() => {});
  const dockSecs = await waitForCatchup(page, { seconds: 30, dispatch: false });
  ok(
    `B@${label} — the Tools-dock Catch-up item opens the modal on this route`,
    dockSecs !== null,
    dockSecs === null
      ? "clicking the dock item produced no dialog either"
      : `opened after ${dockSecs.toFixed(1)}s`,
  );
  const afterDock = await readState(page);
  note(`after the dock click: ${JSON.stringify(afterDock)}`);
  await page.screenshot({ path: `${SHOTS}/B-${label}-after-dock.png` });

  // If the dock did not open it, fall back to the raw event — that separates
  // "the dock button is broken" from "no Host is rendering at all".
  if (dockSecs === null) {
    await closeToolsPopover(page);
    const evtSecs = await waitForCatchup(page, { seconds: 60, dispatch: true });
    ok(
      `B@${label} — the raw catchup:toggle event opens the modal on this route`,
      evtSecs !== null,
      evtSecs === null
        ? "no elected Host is rendering on this route at all"
        : `opened after ${evtSecs.toFixed(1)}s — so the DOCK BUTTON is the broken part, not the Host`,
    );
    await page.screenshot({ path: `${SHOTS}/B-${label}-after-event.png` });
  }

  await ctx.close();
}

// ── C. what a dead bundle looks like on this route ──────────────────────────

/**
 * The reported symptom, produced ON PURPOSE with no product defect involved.
 *
 * Two runs of section B hit a real `ChunkLoadError: Loading chunk
 * app/(planner)/layout failed` on this shared dev server, and the document it
 * left behind matched the bug report exactly. This section blocks that same
 * chunk deliberately, so the match is a controlled result rather than an
 * anecdote — and so the report's own two controls can be checked against it:
 *
 *   • "#main-content contains <!--$--><!--/$-->, zero children"
 *   • "no [role=dialog]"
 *   • "no console or page errors"  ← a Fast Refresh full reload CLEARS the
 *     console, so a lane that reloaded and then looked saw an empty one
 *   • "the notification-bell tooltip fired, so the page IS interactive" ←
 *     `title=` tooltips are drawn by the BROWSER. They fire on un-hydrated
 *     server HTML, so that control never discriminated.
 */
async function sectionC(browser) {
  console.log("\n══ C · the reported symptom, reproduced from a dead bundle ══");
  const ctx = await makeCtx(browser, { width: 1440, height: 950 });
  const page = await ctx.newPage();
  // Kill exactly the chunk the live failures killed.
  await page.route("**/_next/static/chunks/app/**layout*.js", (r) => r.abort());
  await page.goto(`${BASE}/catch-up`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(20000);

  const st = await readState(page);
  const attached = await reactAttached(page);
  // The bell is labelled "Open team activity", NOT "notification" — the first
  // draft matched on the component's NAME rather than its rendered label and
  // found nothing, then reported that as a failed control. Take any
  // server-rendered `title=` in the chrome: the claim is about native tooltips
  // existing without React, and every one of them is evidence for it.
  const bellTitle = await page.evaluate(() => {
    const bell = document.querySelector(
      'button[aria-label*="team activity" i], button[aria-haspopup="dialog"][title]',
    );
    const anyTitled = document.querySelector("button[title]");
    const el = bell ?? anyTitled;
    return el
      ? { label: el.getAttribute("aria-label"), title: el.getAttribute("title") }
      : null;
  });
  note(`dead-bundle state: ${JSON.stringify(st)}`);
  note(`React attached: ${attached}; native-title control: ${JSON.stringify(bellTitle)}`);
  await page.screenshot({ path: `${SHOTS}/C-dead-bundle.png` });

  ok(
    "C — a dead layout chunk reproduces the reported signature exactly (empty #main-content, no dialog)",
    st.mainChildren === 0 && st.mainHtml === "<!--$--><!--/$-->" && st.dialogCount === 0,
    `${st.mainChildren} children, html "${st.mainHtml}", ${st.dialogCount} dialog(s)`,
  );
  ok(
    "C — and the chrome still paints, so the page LOOKS alive (control: this is why it reads as a route bug)",
    st.toolsButton === true,
    `toolsButton=${st.toolsButton}`,
  );
  ok(
    "C — React is NOT attached in that state (the discriminator the report lacked)",
    attached === false,
    `reactAttached=${attached}`,
  );
  // WHAT THIS CONTROL ACTUALLY SHOWS — corrected after the first run.
  //
  // The first version asserted that the bell carries a native `title=`, which
  // the browser would draw without React, making "the tooltip fired" vacuous.
  // That is FALSE for this control: NotificationBell passes a ReactNode as its
  // tooltip content (NotificationBell.tsx:200), and Tooltip only derives a
  // native title from STRING content (Tooltip.tsx:756), so there is no title
  // attribute here at all — measured, not assumed, below.
  //
  // The honest reading is stronger. On this page NEITHER tooltip mechanism is
  // available: no native title, and no React. So a bell tooltip CANNOT fire in
  // this state — which means an observation that one DID fire was necessarily
  // taken at a different moment from the DOM check it was used to validate.
  // That is the actual defect in the control: not that it was the wrong kind of
  // tooltip, but that it was not evaluated in the SAME READING as the absence
  // it was licensing. Section B's numbers say how wide that gap can be.
  ok(
    "C — no tooltip of ANY kind can fire in this state (no native title AND no React), so a tooltip that DID fire was a different moment",
    bellTitle !== null && bellTitle.title === null && attached === false,
    bellTitle === null
      ? "no button found at all — INCONCLUSIVE, not a pass"
      : `bell aria-label="${bellTitle.label}", native title=${JSON.stringify(bellTitle.title)}, reactAttached=${attached}`,
  );

  await ctx.close();
}

// ── D. how long the reported symptom is true on a HEALTHY page ──────────────

/**
 * The measurement that actually explains the report.
 *
 * `/catch-up` serves fully-painted chrome as server HTML, and its route body is
 * a single Host that renders the modal only once React has attached and the
 * mount effect has run. So on a PERFECTLY HEALTHY page there is a window —
 * from first paint until hydration — in which the document is exactly what the
 * bug report describes: chrome visible, `#main-content` = `<!--$--><!--/$-->`,
 * no dialog, no errors. Nothing is wrong; the page has simply not hydrated.
 *
 * This section times that window, and confirms the symptom holds throughout it,
 * so the report's evidence is accounted for without appealing to a bundle
 * failure at all. It samples continuously rather than at two moments, because
 * sampling the absence early and the interactivity late is precisely the error
 * being characterised.
 */
async function sectionD(browser) {
  console.log("\n══ D · how long the reported symptom is true on a healthy page ══");
  const ctx = await makeCtx(browser, { width: 1440, height: 950 });
  const page = await ctx.newPage();
  attach(page, "D");
  const chunk = makeChunkWatch(page);

  const t0 = Date.now();
  await page.goto(`${BASE}/catch-up`, { waitUntil: "domcontentloaded" });

  let attachedAt = null;
  let symptomSamples = 0;
  let symptomHeld = 0;
  let chromeSeen = 0;
  for (let i = 0; i < 420 && attachedAt === null; i += 1) {
    const st = await readState(page).catch(() => null);
    if (st) {
      if (st.toolsButton) chromeSeen += 1;
      // The reported symptom, sampled: chrome painted, main empty, no dialog.
      if (st.toolsButton && st.mainChildren === 0 && st.dialogCount === 0) {
        symptomHeld += 1;
      }
      symptomSamples += 1;
    }
    if (await reactAttached(page)) attachedAt = (Date.now() - t0) / 1000;
    else await page.waitForTimeout(1000);
  }

  const modalSecs =
    attachedAt === null
      ? null
      : await waitForCatchup(page, { seconds: 60, dispatch: false });

  note(
    `React attached at ${attachedAt === null ? "never" : `${attachedAt.toFixed(1)}s`}; ` +
      `symptom held in ${symptomHeld}/${symptomSamples} pre-hydration samples ` +
      `(chrome painted in ${chromeSeen}); chunk failures ${chunk.hit}`,
  );
  await page.screenshot({ path: `${SHOTS}/D-post-hydration.png` });

  ok(
    "D — the page hydrated and the modal appeared (so this run measured a HEALTHY page, not a broken one)",
    attachedAt !== null && modalSecs !== null && chunk.hit === 0,
    `attached ${attachedAt === null ? "never" : `${attachedAt.toFixed(1)}s`}, modal ${modalSecs === null ? "never" : `+${modalSecs.toFixed(1)}s`}, ${chunk.hit} chunk failure(s)`,
  );
  ok(
    "D — and BEFORE that, the reported symptom was continuously true with nothing wrong",
    symptomHeld > 0 && chromeSeen > 0,
    symptomHeld === 0
      ? "the symptom never held pre-hydration — this run cannot explain the report"
      : `${symptomHeld} consecutive samples of "chrome painted, #main-content empty, no dialog" over ~${attachedAt?.toFixed(1)}s`,
  );

  await ctx.close();
}

const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7);
const browser = await chromium.launch({ channel: "chrome" });
const run = async (name, fn) => {
  try {
    await fn();
  } catch (e) {
    ok(`${name} — section completed without throwing`, false, String(e).slice(0, 300));
  }
};
try {
  if (!ONLY || ONLY === "A") await run("A", () => sectionA(browser));
  if (!ONLY || ONLY === "B" || ONLY === "1440")
    await run("B@1440", () => sectionB(browser, { width: 1440, height: 950, label: "1440" }));
  if (!ONLY || ONLY === "B" || ONLY === "768")
    await run("B@768", () => sectionB(browser, { width: 768, height: 1024, label: "768" }));
  if (!ONLY || ONLY === "B" || ONLY === "375")
    await run("B@375", () => sectionB(browser, { width: 375, height: 812, label: "375" }));
  if (!ONLY || ONLY === "C") await run("C", () => sectionC(browser));
  if (!ONLY || ONLY === "D") await run("D", () => sectionD(browser));
} finally {
  await browser.close();
}

console.log("\n══ console ══");
const seen = new Set();
for (const c of consoleLog) {
  const k = `${c.type}:${c.text.slice(0, 120)}`;
  if (seen.has(k)) continue;
  seen.add(k);
  console.log(`  [${c.tag}] ${c.type}: ${c.text.slice(0, 220)}`);
}
if (!consoleLog.length) console.log("  (none)");

console.log("\n══ summary ══");
for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed > 0 || results.length === 0) {
  console.log(
    results.length === 0
      ? "\nFAILED — no assertions ran at all. The probe did not reach the app."
      : `\nFAILED — ${failed} assertion(s) did not pass.`,
  );
  process.exitCode = 1;
}
