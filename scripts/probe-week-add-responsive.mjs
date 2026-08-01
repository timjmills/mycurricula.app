// probe-week-add-responsive.mjs — task #34, both halves, measured live.
//
//   A. "the Week add affordance does not exist below 900px"
//   B. "the add MENU clips at ~950px"
//
// ── WHAT THE REPORT GOT RIGHT AND WHAT IT MISSED ──────────────────────────
// A is real but mis-attributed. It is not a per-frame bug: WeeklyShell.tsx:640
// computes `showList = isNarrow || viewMode === "list"` and the branch at :651
// returns <WeeklyList /> BEFORE the paper/glass/colour branches at :669-687 are
// reached, so at ≤900px all three frames collapse to ONE canvas and their add
// affordances are unmounted rather than hidden. The same `showList` is true at
// ANY width in List mode, so the desktop List teacher had the identical dead
// end — which no report mentions. This probe measures BOTH, because a fix aimed
// at the breakpoint would leave the second one open.
//
// ── WHAT WOULD MAKE THIS PROBE A LIE ──────────────────────────────────────
// "0 add triggers at width W" is vacuously true of a page that never hydrated,
// of a canvas that never rendered, and of a selector that matches nothing. So
// every width carries a POSITIVE CONTROL measured in the same pass: the day
// headings (`[id^="day-heading-"]` in List, the column headers in the frames).
// A width that reports "no add trigger" AND "no day headings" is reported as
// NOT MEASURED, never as a defect — the canvas simply was not up yet.
//
// Readiness is by SIGNAL, never by a fixed sleep: this box's hydrate has varied
// 10x within an hour and a fixed window has already manufactured two false
// findings here. The signal is the day headings, which is independent of the
// add trigger being measured (using the trigger as its own readiness gate would
// make every absence unfalsifiable).
//
// Device emulation lies twice, so the phone/tablet tiers get isMobile + a real
// deviceScaleFactor, and every tier PRINTS what matchMedia actually reported for
// `(pointer: coarse)` and `(any-pointer: fine)` rather than leaving the reader
// to assume.
//
// ── THE 6/7-DAY WEEK, WITHOUT TOUCHING PROD ───────────────────────────────
// The `align`-by-index premise ("only the two extreme columns overhang") fails
// on a 6- or 7-day school week at ordinary desktop widths, and CLAUDE.md §6
// forbids assuming that away. The school week lives in the DB and this repo's
// .env.local points at PRODUCTION, so this probe does NOT reconfigure it.
// Instead it reproduces the GEOMETRY that matters — a track wide enough that the
// last column's trigger sits at or past the viewport edge — by widening the
// columns client-side. That is the mechanism the defect turns on (the trigger's
// own edge is outside the visible box); the day COUNT is only one way to get
// there. Labelled as a geometric proxy wherever it is reported.
//
// Run: node scripts/probe-week-add-responsive.mjs
// Env: PROBE_BASE (default http://localhost:3014 — the dev server this repo
//      already runs; do NOT start a second one, CLAUDE.md §4b).

import { chromium, devices } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const OUT = path.resolve("docs/screenshots/week-responsive");
await mkdir(OUT, { recursive: true });

const HYDRATE_BUDGET_MS = 120000;
const WIDTHS = [375, 768, 900, 950, 1024, 1440];

const rows = [];
const failures = [];
const fail = (what, detail) => {
  failures.push(`${what} :: ${JSON.stringify(detail)}`);
  console.log(`[FAIL] ${what} :: ${JSON.stringify(detail)}`);
};
const pass = (what, detail) =>
  console.log(`[ok]   ${what} :: ${JSON.stringify(detail)}`);
const note = (what, detail) =>
  console.log(`[note] ${what} :: ${JSON.stringify(detail)}`);

/** mc-theme-axes — v1.<frame>.<glass>.<bg>.<theme>.<dim>.<style>.<palette> */
const axes = (frame) => `v1.${frame}.dark.photo.clear.normal.calm.normal`;

const browser = await chromium.launch({ channel: "chrome" });

// One login, reused. 6 widths x N frames of fresh logins against a shared dev
// server does not finish (an earlier cut of this probe was thrown away for it).
const auth = await browser.newContext();
await bypassLogin(auth, { base: BASE, next: "/weekly", timeout: 240000 });
const storageState = await auth.storageState();
await auth.close();

async function makeContext({ frame, width, coarse }) {
  const ctx = await browser.newContext({
    storageState,
    ...(coarse
      ? { ...devices["iPhone 14 Pro"], viewport: { width, height: 780 } }
      : { viewport: { width, height: 900 } }),
  });
  await ctx.addCookies([
    { name: "mc-theme-axes", value: axes(frame), url: BASE },
  ]);
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
  // theme-sync RECONCILES the saved frame 10-45s after hydrate and would swap
  // the canvas mid-measurement. It also WRITES teacher_preferences back, and
  // .env.local points at prod — so this abort is a correctness guard AND the
  // thing that stops an appearance probe upserting onto the shared account.
  await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
  return ctx;
}

/** Readiness BY SIGNAL — the day headings, independent of what is measured. */
async function openWeekly(ctx) {
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/weekly`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  const t0 = Date.now();
  // HYDRATION, not markup. The first cut of this probe waited for a heading and
  // read ~300ms — because the heading is in the SSR HTML, so the wait returned
  // before React attached. Every measurement it took was of the SERVER render,
  // where `isNarrow` is still its SSR default of false: it reported the paper
  // frame at 375px with five add triggers, which is a real pre-hydration frame
  // but the opposite of the steady state, and every click it then issued hit a
  // page with no handlers (menus "not found", the List toggle "not landing").
  //
  // A React fiber key on the grid pane appears only once React has adopted the
  // DOM, so it is a genuine hydration signal and it is independent of the add
  // affordance being measured. Real cost on this box: 5.7s at 1440, 8.2s at 375.
  //
  // The result is CARRIED, not swallowed. An earlier run timed this wait out at
  // 120s under concurrent load, fell back to the SSR tree, and still reported
  // "375px has 5 add triggers — WeekColumns" as a PASS. The positive control
  // could not catch it, because an SSR frame has the very day headings the
  // control looks for. A probe that reports a pass it did not earn is the
  // failure mode this repo keeps paying for, so a timeout here has to
  // disqualify the row rather than quietly degrade it.
  let hydrated = true;
  await page
    .waitForFunction(
      () => {
        const el =
          document.querySelector('[data-pane="grid"]') ??
          document.querySelector("main");
        return !!el && Object.keys(el).some((k) => k.startsWith("__reactFiber$"));
      },
      null,
      { timeout: HYDRATE_BUDGET_MS },
    )
    .catch(() => {
      hydrated = false;
    });
  // `isNarrow` starts FALSE on the server (a server has no viewport) and only
  // flips in a post-hydration effect, so the canvas swaps one commit AFTER
  // hydration. Waiting for "any known canvas" is therefore not enough — it
  // matches the SSR WeekColumns instantly and samples the pre-swap tree, which
  // is how an earlier run of this probe reported the paper frame at 375px.
  //
  // Settle on STABILITY instead of on a nominated canvas: poll until the pane's
  // child class is the same across two consecutive reads. That is a measured
  // signal (never a fixed sleep) and, unlike waiting for the canvas the width
  // implies, it does not presuppose the answer.
  let settled = true;
  await page
    .waitForFunction(
      () => {
        const w = window;
        const now = String(
          document.querySelector('[data-pane="grid"]')?.firstElementChild
            ?.className ?? "",
        );
        if (!/WeekColumns|WeeklyList|WeekA|WeekC/.test(now)) return false;
        const prev = w.__probeCanvas;
        w.__probeCanvas = now;
        return prev === now;
      },
      null,
      { timeout: 60000, polling: 750 },
    )
    .catch(() => {
      settled = false;
    });
  return { page, consoleErrors, hydrateMs: Date.now() - t0, hydrated, settled };
}

/** What is on screen, and the control that says the reading is meaningful. */
const survey = (page) =>
  page.evaluate(() => {
    const triggers = Array.from(document.querySelectorAll("button")).filter(
      (b) => (b.textContent ?? "").trim().startsWith("+Add"),
    );
    // Canvas identity from the pane's own child class — WeeklyList_container…
    // vs WeekColumns_page… — rather than from an aria-label, so a copy edit
    // cannot silently turn "which canvas" into "unknown".
    const kid = document.querySelector('[data-pane="grid"]')?.firstElementChild;
    const kidClass = String(kid?.className ?? "");
    const isList = kidClass.includes("WeeklyList");
    // CONTROL: the canvas's own content, measured independently of the add
    // affordance. The two canvases mark their days differently — List gives each
    // section an `id="day-heading-N"`, WeekColumns uses <h3> column headers —
    // so the control has to know which one it is looking at or it reads 0 on a
    // perfectly healthy frame and mislabels the width NOT MEASURED.
    const headings = isList
      ? document.querySelectorAll('[id^="day-heading-"]').length
      : (document.querySelectorAll('[data-pane="grid"] h3').length ?? 0);
    const doc = document.documentElement;
    return {
      canvas: isList ? "WeeklyList" : (kidClass.split("_")[0] || "frame"),
      addTriggers: triggers.length,
      minTriggerH: triggers.length
        ? Math.min(...triggers.map((t) => Math.round(t.getBoundingClientRect().height)))
        : null,
      minTriggerW: triggers.length
        ? Math.min(...triggers.map((t) => Math.round(t.getBoundingClientRect().width)))
        : null,
      controlHeadings: headings,
      docScrollW: doc.scrollWidth,
      docClientW: doc.clientWidth,
      pointerCoarse: matchMedia("(pointer: coarse)").matches,
      anyPointerFine: matchMedia("(any-pointer: fine)").matches,
    };
  });

// ── PART A — the add affordance, per width, per frame ─────────────────────
console.log("\n=== PART A — add affordance by width (frame: paper) ===\n");

for (const width of WIDTHS) {
  const coarse = width <= 768;
  const ctx = await makeContext({ frame: "paper", width, coarse });
  const { page, consoleErrors, hydrateMs, hydrated, settled } = await openWeekly(ctx);
  const s = await survey(page);
  await page.screenshot({
    path: path.join(OUT, `paper-${width}.png`),
    fullPage: false,
  });

  const emulation = `coarse=${s.pointerCoarse} anyFine=${s.anyPointerFine}`;
  rows.push({ width, ...s, hydrateMs });

  if (!hydrated || !settled || s.controlHeadings === 0) {
    // NOT a defect — the page never hydrated / the canvas never settled / the
    // canvas never came up, so the reading says nothing either way.
    note(`${width}px NOT MEASURED`, {
      reason: !hydrated ? "hydration timed out" : !settled ? "canvas never settled" : "control absent",
      hydrateMs,
      emulation,
    });
  } else if (s.addTriggers === 0) {
    fail(`${width}px has NO add affordance`, {
      canvas: s.canvas,
      control: s.controlHeadings,
      emulation,
    });
  } else {
    pass(`${width}px has ${s.addTriggers} add trigger(s)`, {
      canvas: s.canvas,
      minH: s.minTriggerH,
      control: s.controlHeadings,
      emulation,
    });
    // CLAUDE.md §4 — 44px floor on phone and tablet.
    if (width <= 900 && s.minTriggerH !== null && s.minTriggerH < 44) {
      fail(`${width}px add trigger below the 44px touch floor`, {
        minH: s.minTriggerH,
      });
    }
  }

  // §4 — no DOCUMENT-level horizontal scroll at any tier.
  if (s.docScrollW > s.docClientW + 1) {
    fail(`${width}px document scrolls horizontally`, {
      scrollW: s.docScrollW,
      clientW: s.docClientW,
    });
  }
  if (consoleErrors.length) {
    note(`${width}px console errors`, consoleErrors.slice(0, 3));
  }
  await ctx.close();
}

// ── PART A2 — List mode at DESKTOP width (the half nobody reported) ───────
console.log("\n=== PART A2 — List mode at 1440 (not a narrow viewport) ===\n");
{
  const ctx = await makeContext({ frame: "paper", width: 1440, coarse: false });
  const { page } = await openWeekly(ctx);

  // CONTROL FIRST: the GRID canvas at this width must show a non-zero count,
  // otherwise a broken selector reads exactly like the defect.
  const before = await survey(page);
  if (before.addTriggers === 0) {
    note("1440 grid control unavailable — A2 NOT MEASURED", before);
  } else {
    pass("1440 grid control", { addTriggers: before.addTriggers });
    const toggled = await page.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find(
        (x) => (x.textContent ?? "").trim() === "List",
      );
      if (!b) return false;
      b.click();
      return true;
    });
    if (!toggled) {
      note("1440 List toggle not found — A2 NOT MEASURED", {});
    } else {
      await page
        .locator('[aria-label="Weekly plan — list view"]')
        .waitFor({ state: "attached", timeout: 30000 })
        .catch(() => {});
      const after = await survey(page);
      await page.screenshot({ path: path.join(OUT, "list-mode-1440.png") });
      // The toggle must be SEEN to have landed, or this measures the grid again.
      if (after.canvas !== "WeeklyList") {
        note("1440 List toggle did not land — A2 NOT MEASURED", after);
      } else if (after.addTriggers === 0) {
        fail("List mode at 1440 has NO add affordance", after);
      } else {
        pass("List mode at 1440 has an add affordance", {
          addTriggers: after.addTriggers,
          minH: after.minTriggerH,
        });
      }
      rows.push({ width: "1440 (List mode)", ...after });
    }
  }
  await ctx.close();
}

// ── PART B — the add MENU's geometry at 950px, with Gate B ────────────────
console.log("\n=== PART B — menu clip at 950px (frame: paper) ===\n");
{
  const ctx = await makeContext({ frame: "paper", width: 950, coarse: false });
  const { page } = await openWeekly(ctx);

  /** Read the open menu's geometry. Split from the click so Gate B can
   *  re-measure the SAME open menu without toggling it shut. */
  const readMenu = async () => {
    return page.evaluate(() => {
      // Identify by the tag `measure()` stamped on the node when it opened.
      // Locating it by "a body > div containing New lesson" breaks the moment
      // Gate B re-parents it out of <body>, and the loose fallback that
      // replaced it matched an OUTER container instead — reporting a 950px-wide
      // `position:static` element and failing Gate B for the wrong reason.
      const menu = document.querySelector("[data-probe-menu]");
      if (!menu) return { error: "menu not found" };
      const m = menu.getBoundingClientRect();
      const cs = getComputedStyle(menu);
      // VIEWPORT overhang is only half the story — the original defect was an
      // ANCESTOR with a non-visible overflow eating the menu inside a box that
      // is itself fully on-screen. Intersect every clipping ancestor's rect and
      // report how much of the menu actually survives.
      let vis = { l: m.left, r: m.right, t: m.top, b: m.bottom };
      let clipper = null;
      for (let el = menu.parentElement; el; el = el.parentElement) {
        const s = getComputedStyle(el);
        const clips = /auto|scroll|hidden|clip/.test(s.overflowX + s.overflowY);
        if (!clips) continue;
        const b = el.getBoundingClientRect();
        const nl = Math.max(vis.l, b.left);
        const nr = Math.min(vis.r, b.right);
        if (nl > vis.l || nr < vis.r) {
          clipper = el.className ? String(el.className).slice(0, 40) : el.tagName;
        }
        vis = { l: nl, r: nr, t: Math.max(vis.t, b.top), b: Math.min(vis.b, b.bottom) };
      }
      // …and the viewport is the last clipper in the chain.
      const vl = Math.max(vis.l, 0);
      const vr = Math.min(vis.r, window.innerWidth);
      return {
        position: cs.position,
        zIndex: cs.zIndex,
        left: Math.round(m.left),
        right: Math.round(m.right),
        width: Math.round(m.width),
        offLeft: Math.max(0, Math.round(0 - m.left)),
        offRight: Math.max(0, Math.round(m.right - window.innerWidth)),
        /** px of the menu's width lost to the viewport OR any clipping ancestor. */
        clippedPx: Math.max(0, Math.round(m.width - Math.max(0, vr - vl))),
        clipper,
      };
    });
  };

  /** Open the LAST add trigger, then read. */
  const measure = async () => {
    const r = await page.evaluate(() => {
      const trig = Array.from(document.querySelectorAll("button")).filter((b) =>
        (b.textContent ?? "").trim().startsWith("+Add"),
      );
      if (!trig.length) return { error: "no add trigger" };
      trig[trig.length - 1].click();
      return { opened: true };
    });
    if (r.error) return r;
    await page.waitForTimeout(200); // one paint for place() to land
    const tagged = await page.evaluate(() => {
      const m = Array.from(document.querySelectorAll("body > div")).find((d) =>
        (d.textContent ?? "").includes("New lesson"),
      );
      if (!m) return false;
      m.setAttribute("data-probe-menu", "1");
      return true;
    });
    if (!tagged) return { error: "menu not found" };
    return readMenu();
  };

  const real = await measure();
  if (real.error) {
    note("PART B NOT MEASURED", real);
  } else {
    note("menu geometry (as shipped)", real);
    if (real.offLeft > 0 || real.offRight > 0 || real.clippedPx > 0) {
      fail("950px: menu clipped or off-viewport", real);
    } else {
      pass("950px: menu fully visible", real);
    }
    if (real.position !== "fixed") {
      fail("menu is not position:fixed — the portal fix is not in effect", real);
    }

    // ── GATE B — the instrument must be SEEN to detect clipping ───────────
    // "0px off-screen" is what a blind probe reports too. Force the PRE-FIX
    // recipe back on the live menu (absolute + centred + inside .addWrap) and
    // re-measure. If that ALSO reports 0, the measurement means nothing and the
    // run fails rather than passing vacuously.
    // The control has to reproduce the PRE-FIX CONDITION, not merely a
    // pre-fix declaration. A first cut only restyled the portaled node to
    // `position:absolute` and reported 0px clipped — correctly, because a
    // portaled node's offsetParent is <body>, which nothing clips. Styling it
    // like the old menu does not put it back where the old menu was.
    //
    // So: re-parent the menu into the trigger's `.addWrap` — back inside the
    // week's horizontal scroll container — and apply the old recipe there. Now
    // the clipping ancestor is the real one, and if the probe still reports 0px
    // it is blind and PART B is void.
    const forced = await page.evaluate(() => {
      const menu = document.querySelector("[data-probe-menu]");
      const trig = Array.from(document.querySelectorAll("button")).filter((b) =>
        (b.textContent ?? "").trim().startsWith("+Add"),
      );
      if (!menu || !trig.length) return { error: "nothing to force" };
      const wrap = trig[trig.length - 1].closest('[class*="addWrap"]');
      if (!wrap) return { error: "no .addWrap to re-parent into" };
      wrap.appendChild(menu);
      menu.style.cssText =
        "position:absolute;left:50%;transform:translateX(-50%);bottom:calc(100% + 8px);width:300px;z-index:30";
      return { ok: true };
    });
    const ctl = forced.error ? forced : await readMenu();
    if (ctl.error) {
      note("GATE B inconclusive", ctl);
    } else if (ctl.clippedPx === 0 && ctl.offLeft === 0 && ctl.offRight === 0) {
      fail("GATE B FAILED — the probe cannot see clipping; PART B is void", ctl);
    } else {
      pass("GATE B — probe detects clipping when it is present", ctl);
    }
  }
  await page.screenshot({ path: path.join(OUT, "menu-950.png") });
  await ctx.close();
}

// ── PART C — the geometric proxy for a 6/7-day week ───────────────────────
// See the header: the day COUNT lives in prod, so this widens the columns to
// push the last trigger to the viewport edge, which is the geometry the
// `align`-by-index premise actually failed on.
console.log("\n=== PART C — last trigger at the viewport edge (proxy) ===\n");
{
  const ctx = await makeContext({ frame: "paper", width: 1024, coarse: false });
  const { page } = await openWeekly(ctx);
  const ok = await page.evaluate(() => {
    const st = document.createElement("style");
    st.textContent = `[data-pane="grid"] * { scroll-behavior:auto !important }`;
    document.head.appendChild(st);
    // Scroll every horizontal scroller fully right, so the last column's
    // trigger sits hard against the visible edge.
    let scrolled = 0;
    document.querySelectorAll("*").forEach((el) => {
      if (el.scrollWidth > el.clientWidth + 8) {
        el.scrollLeft = el.scrollWidth;
        scrolled += 1;
      }
    });
    return scrolled;
  });
  note("horizontal scrollers driven to the right edge", { count: ok });
  await page.waitForTimeout(150);
  const r = await page.evaluate(() => {
    const trig = Array.from(document.querySelectorAll("button")).filter((b) =>
      (b.textContent ?? "").trim().startsWith("+Add"),
    );
    if (!trig.length) return { error: "no add trigger" };
    const last = trig[trig.length - 1];
    const t = last.getBoundingClientRect();
    last.click();
    return { triggerRight: Math.round(t.right), vw: window.innerWidth };
  });
  if (r.error) {
    note("PART C NOT MEASURED", r);
  } else {
    await page.waitForTimeout(150);
    const m = await page.evaluate(() => {
      const menu = Array.from(document.querySelectorAll("body > div")).find(
        (d) => (d.textContent ?? "").includes("New lesson"),
      );
      if (!menu) return { error: "menu not found" };
      const b = menu.getBoundingClientRect();
      return {
        left: Math.round(b.left),
        right: Math.round(b.right),
        offRight: Math.max(0, Math.round(b.right - window.innerWidth)),
        offLeft: Math.max(0, Math.round(0 - b.left)),
      };
    });
    note("trigger at edge", r);
    if (m.error) note("PART C menu not found", m);
    else if (m.offLeft > 0 || m.offRight > 0)
      fail("proxy 6/7-day: menu runs off the viewport", m);
    else pass("proxy 6/7-day: menu clamped on-screen", m);
  }
  await page.screenshot({ path: path.join(OUT, "edge-proxy-1024.png") });
  await ctx.close();
}

// ── PART D — touch + keyboard exits, and scroll re-placement ──────────────
console.log("\n=== PART D — dismissal + scroll re-place ===\n");
{
  // 950, not 1440: at 1440 the five columns FIT, so no ancestor above the
  // trigger scrolls on either axis and the re-placement claim cannot be
  // exercised at all (an earlier run reported it NOT MEASURED for exactly
  // that reason). 950 is where the track actually overflows — the same width
  // Gate B named `WeekColumns_scroll` as the clipper.
  const ctx = await makeContext({ frame: "paper", width: 950, coarse: false });
  const { page } = await openWeekly(ctx);
  const openMenu = () =>
    page.evaluate(() => {
      const t = Array.from(document.querySelectorAll("button")).filter((b) =>
        (b.textContent ?? "").trim().startsWith("+Add"),
      );
      if (!t.length) return false;
      t[0].click();
      return true;
    });
  const menuOpen = () =>
    page.evaluate(
      () =>
        !!Array.from(document.querySelectorAll("body > div")).find((d) =>
          (d.textContent ?? "").includes("New lesson"),
        ),
    );

  if (!(await openMenu())) {
    note("PART D NOT MEASURED — no add trigger", {});
  } else {
    await page.waitForTimeout(120);
    // CONTROL: it really is open, so each "closed" below means something.
    if (!(await menuOpen())) {
      note("PART D NOT MEASURED — menu never opened", {});
    } else {
      pass("control — menu opened", {});

      // ── KEYBOARD: focus must land INSIDE the portal ────────────────────
      // Measured HERE and not in vitest on purpose: linkedom exposes
      // `HTMLElement.focus()` but never updates `document.activeElement`
      // (measured — it stays `undefined`), so a focus assertion in the unit
      // suite would fail against correct code. A real browser is the only
      // instrument that can see this.
      const focusOnOpen = await page.evaluate(() => ({
        active: (document.activeElement?.textContent ?? "").slice(0, 24),
        insideMenu: !!document
          .querySelector("[data-probe-menu], body > div")
          ?.contains(document.activeElement),
      }));
      focusOnOpen.active.startsWith("+New lesson")
        ? pass("focus moves into the menu on open", focusOnOpen)
        : fail("focus does NOT move into the menu on open", focusOnOpen);

      // ARIA wiring — a portaled popup is not adjacent to its trigger, so the
      // relationship has to be stated rather than implied by position.
      const aria = await page.evaluate(() => {
        const t = Array.from(document.querySelectorAll("button")).find((b) =>
          (b.textContent ?? "").trim().startsWith("+Add"),
        );
        const id = t?.getAttribute("aria-controls");
        const target = id ? document.getElementById(id) : null;
        return {
          expanded: t?.getAttribute("aria-expanded"),
          haspopup: t?.getAttribute("aria-haspopup"),
          controls: id,
          resolves: !!target,
          role: target?.getAttribute("role"),
        };
      });
      aria.expanded === "true" && aria.resolves && aria.role === "group"
        ? pass("trigger is wired to the portaled menu", aria)
        : fail("trigger/menu ARIA wiring is incomplete", aria);

      // FOCUS-AFTER-SELECT is measured in its own pass at the bottom of this
      // part, NOT here: choosing a row consumes the open menu, and threading
      // that through the middle of this sequence left every later check
      // (outside press, Escape, scroll re-place) measuring a menu in an
      // unexpected state. One stateful sequence, one consumer.

      // Outside press (the touch exit). The menu is still open from the focus
      // check above — do NOT re-open here, that would toggle it shut.
      await page.mouse.click(5, 5);
      await page.waitForTimeout(120);
      (await menuOpen())
        ? fail("outside press does NOT close the menu", {})
        : pass("outside press closes the menu", {});

      // Escape + focus return (the keyboard exit).
      await openMenu();
      await page.waitForTimeout(120);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(120);
      const esc = await page.evaluate(() => ({
        open: !!Array.from(document.querySelectorAll("body > div")).find((d) =>
          (d.textContent ?? "").includes("New lesson"),
        ),
        focusIsTrigger: (document.activeElement?.textContent ?? "").startsWith(
          "+Add",
        ),
      }));
      esc.open
        ? fail("Escape does NOT close the menu", esc)
        : pass("Escape closes the menu", esc);
      esc.focusIsTrigger
        ? pass("focus returns to the trigger", esc)
        : fail("focus does NOT return to the trigger", esc);

      // Scroll re-placement — a FIXED menu does not travel with a scrolling
      // ancestor, so `place()` must re-run on capture-phase scroll.
      await openMenu();
      await page.waitForTimeout(120);
      // The menu is FIXED, so it does not travel with a scrolling ancestor;
      // `place()` has to re-run on capture-phase scroll or the menu detaches
      // from its trigger. The claim is therefore about a RELATIONSHIP, not
      // about the menu moving: trigger and menu must move TOGETHER.
      //
      // An earlier cut scrolled "the first tall element" and compared only the
      // menu's own top — it read 600 → 600 and proved nothing, because the
      // element it scrolled was not the one holding the trigger. Scroll the
      // trigger's OWN scroll parent, and measure both deltas.
      const rel = await page.evaluate(() => {
        const trig = Array.from(document.querySelectorAll("button")).find((b) =>
          (b.textContent ?? "").trim().startsWith("+Add"),
        );
        const menu = Array.from(document.querySelectorAll("body > div")).find(
          (d) => (d.textContent ?? "").includes("New lesson"),
        );
        if (!trig || !menu) return { error: "trigger or menu missing" };
        const t0 = trig.getBoundingClientRect().left;
        const m0 = menu.getBoundingClientRect().left;
        // `scrollHeight > clientHeight` is NOT "this element scrolls" — an
        // overflow:hidden box satisfies it and silently ignores scrollTop, which
        // is why the previous cut reported the trigger never moving. Try each
        // ancestor and keep the first whose scrollTop ACTUALLY changes.
        // HORIZONTAL, because that is the axis the week track scrolls on — and
        // on this dataset nothing above the trigger scrolls vertically at all,
        // so a scrollTop-only test reports "not measured" and proves nothing.
        // `place()` re-runs on capture-phase scroll regardless of axis, so the
        // horizontal track tests the same listener.
        let used = null;
        for (let el = trig.parentElement; el; el = el.parentElement) {
          if (el.scrollWidth <= el.clientWidth + 20) continue;
          const was = el.scrollLeft;
          el.scrollLeft = was + 120;
          if (el.scrollLeft !== was) {
            used = el.className ? String(el.className).slice(0, 30) : el.tagName;
            break;
          }
        }
        if (!used) return { error: "no ancestor above the trigger actually scrolls" };
        return { t0: Math.round(t0), m0: Math.round(m0), used };
      });
      if (rel.error) {
        note("scroll re-place NOT MEASURED", rel);
      } else {
        await page.waitForTimeout(250);
        const after = await page.evaluate(() => {
          const trig = Array.from(document.querySelectorAll("button")).find((b) =>
            (b.textContent ?? "").trim().startsWith("+Add"),
          );
          const menu = Array.from(document.querySelectorAll("body > div")).find(
            (d) => (d.textContent ?? "").includes("New lesson"),
          );
          return {
            t1: trig ? Math.round(trig.getBoundingClientRect().left) : null,
            m1: menu ? Math.round(menu.getBoundingClientRect().left) : null,
            mLeft: menu ? Math.round(menu.getBoundingClientRect().left) : null,
            mRight: menu ? Math.round(menu.getBoundingClientRect().right) : null,
            vw: window.innerWidth,
          };
        });
        if (after.t1 === null || after.m1 === null) {
          note("scroll re-place NOT MEASURED (menu closed on scroll)", after);
        } else {
          const dTrig = after.t1 - rel.t0;
          const dMenu = after.m1 - rel.m0;
          const detail = { dTrig, dMenu, ...rel, ...after };
          // THE PROPERTY IS NOT "the deltas match". A first cut asserted that
          // and failed on a CORRECT implementation: the trigger scrolled to
          // left:-17 (partly off-screen) and the menu stopped at left:8, a 25px
          // divergence that IS `place()`'s viewport clamp doing its job. A menu
          // that tracked its trigger exactly would have followed it off-screen,
          // which is the defect this whole fix exists to prevent.
          //
          // So the claim is: the listener FIRED (the menu moved at all — a
          // `position:fixed` menu that ignored the scroll would sit still), and
          // the menu is still fully on-screen afterwards.
          const onScreen =
            after.mLeft >= 0 && after.mRight <= after.vw;
          if (dTrig === 0) {
            note("scroll re-place NOT MEASURED — the trigger did not move", detail);
          } else if (dMenu === 0) {
            fail("menu did NOT re-place on scroll — the listener never fired", detail);
          } else if (!onScreen) {
            fail("menu re-placed but ran off the viewport", detail);
          } else {
            pass("menu re-places on scroll and stays on-screen", {
              ...detail,
              clampEngaged: Math.abs(dMenu - dTrig) > 4,
            });
          }
        }
      }
    }
  }
  await ctx.close();
}

// ── PART E — the PHONE WEEK, now that ≤900px no longer forces List ────────
// Removing that gate means the paper/glass/colour canvases render at 375. The
// handoff's answer is horizontal scroll INSIDE the container (`.vb-week`
// min-width 920, `.vc-week` 760, no responsive rule), and CLAUDE.md §4 permits
// exactly that — but only if the DOCUMENT never scrolls sideways and the
// content is genuinely reachable.
//
// `document.scrollWidth` alone cannot answer this: it is BLIND to a bar
// produced under `overflow-x: clip`, and it is equally happy when content is
// clipped away and unreachable. So this measures three separate things:
//   1. the document does not scroll sideways (the §4 rule);
//   2. the week track DOES scroll internally (the handoff's mechanism) — if it
//      does not, the columns are not scrolled, they are CLIPPED AWAY; and
//   3. the last day column can actually be brought on screen by scrolling it,
//      which is the only one of the three a teacher would notice.
console.log("\n=== PART E — the phone Week at 375 (gate removed) ===\n");
for (const width of [375, 768]) {
  const ctx = await makeContext({ frame: "paper", width, coarse: true });
  const { page, hydrated, settled } = await openWeekly(ctx);
  if (!hydrated || !settled) {
    note(`${frame} ${width}px PART E NOT MEASURED`, { hydrated, settled });
    await ctx.close();
    continue;
  }
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    // The widest horizontal scroller that actually holds the day columns.
    const track = Array.from(document.querySelectorAll("*")).find(
      (el) =>
        el.scrollWidth > el.clientWidth + 8 &&
        el.querySelector('button') &&
        (el.textContent ?? "").includes("+Add"),
    );
    // Anything sticking out past the viewport that is NOT inside a scroller is
    // real document overflow, clipped or not.
    let strays = 0;
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.right <= window.innerWidth + 1) continue;
      let inScroller = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (p.scrollWidth > p.clientWidth + 8) {
          inScroller = true;
          break;
        }
      }
      if (!inScroller) strays += 1;
    }
    return {
      docOverflow: doc.scrollWidth - doc.clientWidth,
      trackScrolls: !!track,
      trackScrollW: track ? track.scrollWidth : null,
      trackClientW: track ? track.clientWidth : null,
      strays,
    };
  });
  note(`${frame} ${width}px phone-Week geometry`, r);
  if (r.docOverflow > 1) fail(`${frame} ${width}px document scrolls sideways`, r);
  else pass(`${frame} ${width}px document does not scroll sideways`, r);
  if (!r.trackScrolls)
    fail(`${frame} ${width}px week track does NOT scroll — content is clipped away`, r);
  else pass(`${frame} ${width}px track scrolls internally (handoff mechanism)`, r);
  if (r.strays > 0)
    fail(`${frame} ${width}px ${r.strays} element(s) overflow outside any scroller`, r);
  else pass(`${frame} ${width}px nothing overflows outside a scroller`, r);

  // (3) REACHABILITY — scroll the track to its end and confirm the last day
  // column's add trigger lands inside the viewport. This is the check a
  // teacher would make, and the one a scrollWidth assertion cannot fake.
  const reach = await page.evaluate(() => {
    const trigs = Array.from(document.querySelectorAll("button")).filter((b) =>
      (b.textContent ?? "").trim().startsWith("+Add"),
    );
    if (!trigs.length) return { error: "no add trigger" };
    const last = trigs[trigs.length - 1];
    last.scrollIntoView({ block: "nearest", inline: "nearest" });
    const b = last.getBoundingClientRect();
    return {
      left: Math.round(b.left),
      right: Math.round(b.right),
      vw: window.innerWidth,
      onScreen: b.left >= -1 && b.right <= window.innerWidth + 1,
    };
  });
  if (reach.error) note(`${frame} ${width}px reachability NOT MEASURED`, reach);
  else if (reach.onScreen)
    pass(`${frame} ${width}px last add trigger is reachable by scrolling`, reach);
  else fail(`${frame} ${width}px last add trigger CANNOT be brought on screen`, reach);

  await page.screenshot({ path: path.join(OUT, `phone-week-${frame}-${width}.png`) });
  await ctx.close();
}

console.log("\n=== SUMMARY ===");
console.table(rows);
console.log(
  failures.length
    ? `\n${failures.length} FAILURE(S)\n` + failures.map((f) => ` - ${f}`).join("\n")
    : "\nNO FAILURES",
);
await browser.close();
process.exit(failures.length ? 1 : 0);
