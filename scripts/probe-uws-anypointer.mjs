// scripts/probe-uws-anypointer.mjs — §4b evidence + regression test for the
// paper-Year `.uws` workspace opener on a HYBRID device (task #27).
//
// ─────────────────────────────────────────────────────────────────────────────
// REWRITTEN 2026-07-31. The previous revision tested the FIRST version of this
// fix and can no longer pass, because that version had a defect this file now
// exists to catch. Its dead assertions, for the record:
//
//   old 2.1 "exactly ONE any-pointer block"  → there are now TWO (hit area +
//            width). Asserting `length === 1` would fail the corrected CSS.
//   old 2.4 "ONLY the hit area widened"       → the WIDTH arm widened too, on
//            purpose: `.uws{width:44px}` lived only in `pointer: coarse`, so on
//            a hybrid the list-outline and subject-scope openers stayed 40px,
//            under the CLAUDE.md §4 floor.
//   old 3.2 "EVERY chip hit-tests ≥44px" after hovering ONE card → the ::after
//            is now gated on `.unode:hover` / `:focus-within`, so hovering one
//            card arms one chip. Measuring all 20 after one hover would read 19
//            failures for a correct build.
//
// WHAT IS UNDER TEST NOW (components/year/TimelineYear.module.css):
//   • `pointer: coarse` (touch-primary)  → chip permanently visible, ::after
//     UNCONDITIONAL. Nothing invisible, so nothing to gate.
//   • `any-pointer: coarse` (hybrid)     → ::after gated on hover/focus-within,
//     because the `opacity: 1` reveal is keyed to `pointer: coarse` and a
//     trackpad-driven touch laptop matches the second but not the first. The
//     ungated form left a 46×46 INVISIBLE zone over ~40px of a ~95px card.
//   • `any-pointer: coarse`              → `.uws{width:44px}` for the outline
//     and subject tiers, with the all-scope grid chip explicitly reset to 26px
//     so it cannot inflate over a ~95px card's unit name.
//
// THE EMULATION IS THE HARD PART — three of four routes are wrong, and two of
// them fake a pass (measured; see the CSS comment at ~:2045):
//
//   Playwright `hasTouch`                    → coarse PRIMARY = a phone.
//   CDP Emulation.setTouchEmulationEnabled   → same.
//   CDP Emulation.setEmulatedMedia {pointer} → accepted and SILENTLY IGNORED.
//   --blink-settings=availablePointerTypes…  → the hybrid. The only one.
//
// Every hybrid gate below asserts `any-pointer: coarse` TRUE **and**
// `max-width: 900px` FALSE in the same observation, and aborts otherwise —
// without both, the ≤900px width fallback supplies the pass.
//
// Real Chrome only (never the system-default Edge).
//
// USAGE: node scripts/probe-uws-anypointer.mjs [--base http://localhost:3010]

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { bypassLogin, requireToken, redact } from "./lib/auth.mjs";

requireToken({ repoRoot: process.cwd() });
const BASE =
  (process.argv.includes("--base") && process.argv[process.argv.indexOf("--base") + 1]) ||
  process.env.PROBE_BASE ||
  "http://localhost:3010";
const OUT = path.resolve("docs/screenshots/uws-hitzone-fix");
await mkdir(OUT, { recursive: true });

/**
 * Blink pointer/hover capability bits (ui/base/pointer/pointer_device.h):
 *   PointerType NONE=1 COARSE=2 FINE=4 · HoverType NONE=1 HOVER=2
 *
 * HYBRID: COARSE|FINE available, FINE primary, hover available and primary —
 * a mouse-driven machine with a touchscreen attached.
 * TOUCH:  COARSE only, no hover — a tablet.
 *
 * These are LAUNCH flags, so each profile needs its own browser instance; they
 * cannot be toggled per page. Do NOT layer CDP touch emulation on top — it
 * overrides these and collapses the hybrid back to a phone.
 */
const HYBRID_ARGS = [
  "--blink-settings=availablePointerTypes=6,primaryPointerType=4," +
    "availableHoverTypes=2,primaryHoverType=2",
];
const TOUCH_ARGS = [
  "--blink-settings=availablePointerTypes=2,primaryPointerType=2," +
    "availableHoverTypes=1,primaryHoverType=1",
];

let pass = 0;
let fail = 0;
const failures = [];
const ok = (n, d = "") => {
  pass++;
  console.log(`  PASS  ${n}${d ? ` — ${d}` : ""}`);
};
const bad = (n, d = "") => {
  fail++;
  failures.push(`${n} — ${d}`);
  console.log(`  FAIL  ${n}${d ? ` — ${d}` : ""}`);
};
const assert = (n, c, d = "") => (c ? ok(n, d) : bad(n, d));

async function paperYearContext(browser, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem(
        "mycurricula:onboarding",
        JSON.stringify({ stepIndex: 0, finished: true }),
      );
      // PIN THE FRAME. /year routes on it (YearShell), and only the PAPER frame
      // mounts TimelineYear — unpinned, this measures whatever the last session
      // left behind.
      localStorage.setItem("mycurricula:user:theme-frame", "paper");
      localStorage.setItem("mycurricula:user:theme-bg", "wash");
      localStorage.setItem("mycurricula:user:theme", "clear");
    } catch {
      /* private mode */
    }
  });
  // Localhost only, but belt-and-braces: never let a probe's seeded appearance
  // ride back up into the shared teacher_preferences row.
  await ctx.route("**/rest/v1/teacher_preferences*", (route) => route.abort());
  await bypassLogin(ctx, { base: BASE, next: "/year", timeout: 240000 });
  return ctx;
}

/**
 * READINESS BY RESPONSE — not by clock, and not by presence.
 *
 * Dev-server hydration here runs 5–9s, so a constant sleep either wastes time
 * or measures SSR-default HTML. "the chip exists" is not enough either: it only
 * proves the server rendered it. The control that must RESPOND is `.unode:hover`
 * flipping the chip's computed opacity 0 → 1 — a real state change, requiring
 * the CSS module to have arrived, which is the only precondition a pure-CSS
 * change depends on. If it never responds, the instrument is broken and nothing
 * measured afterwards means anything.
 *
 * `expectFlip: false` for the TOUCH profile, where the chip rests at opacity 1
 * by design and hover can therefore never produce a change — there the control
 * is "the chip reached opacity 1", which SSR HTML without the CSS module cannot
 * fake (the base rule for this tier is opacity 0).
 */
async function waitForLiveState(page, { expectFlip = true, budgetMs = 120000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < budgetMs) {
    const chip = page.locator("[data-year-unit-workspace]").first();
    if (await chip.count()) {
      // RE-ARM FIRST. Playwright parks the cursor where it last hovered, so a
      // second poll would read opacity 1 both before AND after and could never
      // observe a change again — a control that can only fire on its first
      // attempt is not a control.
      await page.mouse.move(2, 2);
      await page.waitForTimeout(300);
      const before = await chip.evaluate((el) => getComputedStyle(el).opacity);
      if (!expectFlip) {
        if (before === "1") return { responded: true, before, after: before, ms: Date.now() - t0 };
      } else {
        await page
          .locator('[class*="unode"]')
          .first()
          .hover({ timeout: 5000 })
          .catch(() => {});
        await page.waitForTimeout(300);
        const after = await chip.evaluate((el) => getComputedStyle(el).opacity);
        if (before !== after) return { responded: true, before, after, ms: Date.now() - t0 };
      }
    }
    await page.waitForTimeout(1000);
  }
  return { responded: false, ms: Date.now() - t0 };
}

/**
 * The REAL clickable extent: walk outward from the centre with elementFromPoint
 * until the hit test stops returning the element or one of its descendants. A
 * correctly-declared inflation can still be clipped or occluded by an ancestor,
 * and getComputedStyle cannot see that — this can.
 *
 * `owns` deliberately excludes ANCESTORS. An earlier draft also accepted
 * `n.contains(el)`, which counts every ancestor as a hit; the walk then never
 * terminates and every target measures the walk limit — a uniform pass that can
 * detect nothing.
 */
async function installHelpers(page) {
  await page.evaluate(() => {
    window.__hit = (el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return { w: 0, h: 0, reason: "zero-rect" };
      const cx = Math.round(r.left + r.width / 2);
      const cy = Math.round(r.top + r.height / 2);
      const owns = (n) => n && (n === el || el.contains(n));
      if (!owns(document.elementFromPoint(cx, cy)))
        return { w: 0, h: 0, reason: "centre-occluded" };
      const walk = (dx, dy) => {
        let d = 0;
        for (let i = 1; i <= 60; i++) {
          if (owns(document.elementFromPoint(cx + dx * i, cy + dy * i))) d = i;
          else break;
        }
        return d;
      };
      return { w: walk(-1, 0) + walk(1, 0) + 1, h: walk(0, -1) + walk(0, 1) + 1, reason: "measured" };
    };

    window.__chips = () => Array.from(document.querySelectorAll("[data-year-unit-workspace]"));

    /** Is ANY unit card currently in :hover? Asserted in the same observation as
     *  every at-rest measurement — a stray hover silently arms the ::after and
     *  turns a real regression into a pass. */
    window.__anyHovered = () =>
      document.querySelectorAll('[class*="unode"]:hover').length;

    /**
     * The drill button and the title's FIRST LINE, resolved STRUCTURALLY.
     *
     * NOT by class substring: CSS-module idents are `TimelineYear_<local>__hash`,
     * so `[class*="TimelineYear_un"]` also matches `unit`, `unode` and `units`
     * and `querySelector` would return the wrong element in document order — a
     * silent mis-measurement. renderUnitCard (TimelineYear.tsx) emits exactly
     * two buttons per card: the `.unit` drill, then the `.uws` opener; the
     * drill's first child is the `.un` title line.
     */
    window.__parts = (el) => {
      const unode = el?.closest('[class*="unode"]');
      const drill = unode
        ? Array.from(unode.querySelectorAll("button")).find(
            (b) => !b.hasAttribute("data-year-unit-workspace"),
          )
        : null;
      return { unode, drill, un: drill?.firstElementChild ?? null };
    };

    /**
     * Sample the unit title's first line and report which x positions are
     * intercepted by the workspace opener instead of the drill button. Sampling
     * the TITLE's own rect rather than the card's is what makes "covers the
     * title" measurable rather than rhetorical.
     */
    window.__titleLine = (i) => {
      const el = window.__chips()[i];
      const { unode, drill, un } = window.__parts(el);
      if (!el || !unode || !drill || !un) return null;
      const cr = el.getBoundingClientRect();
      const tr = un.getBoundingClientRect();
      const ur = unode.getBoundingClientRect();
      if (!tr.width || !tr.height) return null;
      const y = Math.round(tr.top + tr.height / 2);
      const samples = [];
      for (let x = Math.ceil(tr.left) + 1; x <= Math.floor(tr.right) - 1; x += 2) {
        const n = document.elementFromPoint(x, y);
        const onOpener = !!(n && (n === el || el.contains(n) || n.closest?.("[data-year-unit-workspace]")));
        const onDrill = !!(n && (n === drill || drill.contains(n)));
        samples.push({ x, onOpener, onDrill, tag: n?.tagName ?? "none" });
      }
      const stolen = samples.filter((s) => s.onOpener);
      return {
        titleLeft: Math.round(tr.left),
        titleRight: Math.round(tr.right),
        titleW: Math.round(tr.width * 10) / 10,
        cardW: Math.round(ur.width * 10) / 10,
        chipLeft: Math.round(cr.left),
        chipOpacity: Number(getComputedStyle(el).opacity),
        afterContent: getComputedStyle(el, "::after").content,
        samples: samples.length,
        stolen: stolen.length,
        stolenPx: stolen.length * 2,
        // How far LEFT of the chip's own painted edge the theft begins — the
        // overhang a user cannot see.
        leftmostStolenX: stolen.length ? stolen[0].x : null,
        overhangPastChip: stolen.length ? Math.round(cr.left - stolen[0].x) : 0,
        onDrillCount: samples.filter((s) => s.onDrill).length,
      };
    };

    window.__geom = (i) => {
      const el = window.__chips()[i];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const { unode, un } = window.__parts(el);
      const ur = unode?.getBoundingClientRect();
      return {
        paintedW: Math.round(r.width * 10) / 10,
        paintedH: Math.round(r.height * 10) / 10,
        opacity: getComputedStyle(el).opacity,
        afterContent: getComputedStyle(el, "::after").content,
        hit: window.__hit(el),
        cardW: ur ? Math.round(ur.width * 10) / 10 : null,
        titleW: un ? Math.round(un.getBoundingClientRect().width * 10) / 10 : null,
        titleEllipsised: un ? un.scrollWidth > un.clientWidth + 1 : null,
      };
    };
  });
}

/** Park the pointer somewhere no unit card can be, and PROVE it landed. */
async function unhover(page) {
  await page.mouse.move(3, 3);
  await page.waitForTimeout(250);
  return page.evaluate(() => window.__anyHovered());
}

/** Scroll chip i into view, then hover its card at a point OUTSIDE the chip's
 *  inflated zone (bottom-left of the card) so the hover is genuine and the
 *  cursor is not itself sitting on the target being measured. */
async function hoverCard(page, i) {
  const pt = await page.evaluate((idx) => {
    const el = window.__chips()[idx];
    const unode = el?.closest('[class*="unode"]');
    if (!unode) return null;
    unode.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    const r = unode.getBoundingClientRect();
    return { x: Math.round(r.left + 6), y: Math.round(r.bottom - 6) };
  }, i);
  if (!pt) return false;
  await page.mouse.move(pt.x, pt.y);
  await page.waitForTimeout(200);
  return page.evaluate((idx) => {
    const el = window.__chips()[idx];
    return !!el?.closest('[class*="unode"]')?.matches(":hover");
  }, i);
}

async function scrollIntoView(page, i) {
  await page.evaluate((idx) => {
    window.__chips()[idx]?.closest('[class*="unode"]')?.scrollIntoView({
      block: "center",
      inline: "center",
      behavior: "instant",
    });
  }, i);
  await page.waitForTimeout(120);
}

async function applyOverride(page, css) {
  await page.evaluate((text) => {
    let s = document.getElementById("probe-uws-cf");
    if (!s) {
      s = document.createElement("style");
      s.id = "probe-uws-cf";
      document.head.appendChild(s);
    }
    s.textContent = text;
  }, css);
  await page.waitForTimeout(250);
}

async function readEnv(page) {
  return page.evaluate(() => ({
    anyCoarse: matchMedia("(any-pointer: coarse)").matches,
    primaryCoarse: matchMedia("(pointer: coarse)").matches,
    primaryFine: matchMedia("(pointer: fine)").matches,
    under900: matchMedia("(max-width: 900px)").matches,
    hoverable: matchMedia("(hover: hover)").matches,
    width: innerWidth,
    frame: document.documentElement.getAttribute("data-frame"),
    hier: document.querySelector('[class*="TimelineYear_root"]')?.getAttribute("data-hier"),
    scope: document.querySelector('[class*="TimelineYear_root"]')?.getAttribute("data-scope"),
  }));
}

// ═══ HYBRID RUN ════════════════════════════════════════════════════════════
const browser = await chromium.launch({ channel: "chrome", args: HYBRID_ARGS });
let hybridHit = null;
try {
  const ctx = await paperYearContext(browser, 1280);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/year`, { waitUntil: "domcontentloaded", timeout: 240000 });

  console.log("\nGATE 0 — readiness by RESPONSE (hover flips the chip's opacity)");
  const ready = await waitForLiveState(page);
  assert(
    "0.1 the hover control RESPONDED (the instrument is live)",
    ready.responded === true,
    ready.responded ? `opacity ${ready.before} → ${ready.after} after ${ready.ms}ms` : `no response in ${ready.ms}ms`,
  );
  if (!ready.responded) throw new Error("control never responded — instrument broken, not the app");
  await installHelpers(page);

  console.log("\nGATE 1 — the environment is a HYBRID, above the width fallback");
  const env = await readEnv(page);
  console.log(`        ${JSON.stringify(env)}`);
  assert("1.1 any-pointer: coarse MATCHES", env.anyCoarse === true, String(env.anyCoarse));
  assert("1.2 max-width: 900px does NOT match", env.under900 === false, `width=${env.width}`);
  assert(
    "1.3 primary pointer is FINE — a hybrid, not a phone",
    env.primaryFine === true && env.primaryCoarse === false,
    `fine=${env.primaryFine} coarse=${env.primaryCoarse}`,
  );
  assert(
    "1.4 the surface under test is paper-Year, all-scope GRID",
    env.frame === "paper" && env.hier === "grid" && env.scope === "all",
    `frame=${env.frame} hier=${env.hier} scope=${env.scope}`,
  );
  if (!(env.anyCoarse && !env.under900 && !env.primaryCoarse)) {
    bad("ABORT", "not a hybrid above 900px — every measurement below would be meaningless");
    throw new Error("hybrid emulation not achieved");
  }

  console.log("\nGATE 2 — provenance, read off the LIVE CSSOM (not the diff)");
  const css = await page.evaluate(() => {
    const out = { anyPointer: [], bareCoarse: [] };
    const visit = (rules) => {
      for (const rule of Array.from(rules || [])) {
        if (rule instanceof CSSMediaRule) {
          const t = rule.conditionText || rule.media.mediaText;
          const kids = Array.from(rule.cssRules || []).filter((r) => r.selectorText);
          if (kids.some((r) => /uws/.test(r.selectorText))) {
            const entry = {
              media: t,
              matches: matchMedia(t).matches,
              rules: kids.map((r) => ({ sel: r.selectorText, css: r.cssText })),
            };
            if (/any-pointer/.test(t)) out.anyPointer.push(entry);
            else if (/pointer:\s*coarse/.test(t)) out.bareCoarse.push(entry);
          }
        }
        if (rule.cssRules) visit(rule.cssRules);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        visit(sheet.cssRules);
      } catch {
        continue; // cross-origin sheet
      }
    }
    return out;
  });
  for (const e of [...css.anyPointer, ...css.bareCoarse]) {
    console.log(`        ${e.matches ? "LIVE " : "inert"}  ${e.media}`);
    for (const r of e.rules) console.log(`                 ${r.sel}`);
  }
  const afterBlock = css.anyPointer.find((e) => e.rules.some((r) => /::after/.test(r.sel)));
  const widthBlock = css.anyPointer.find((e) => e.rules.some((r) => /width/.test(r.css) && !/::after/.test(r.sel)));
  assert(
    "2.1 the served CSS carries BOTH any-pointer arms (hit area + width)",
    !!afterBlock && !!widthBlock && afterBlock !== widthBlock,
    `after=${!!afterBlock} width=${!!widthBlock}`,
  );
  assert(
    "2.2 both MATCH on this hybrid",
    afterBlock?.matches === true && widthBlock?.matches === true,
    `after=${afterBlock?.matches} width=${widthBlock?.matches}`,
  );
  assert(
    "2.3 the untouched `pointer: coarse` block is still INERT here",
    css.bareCoarse.length === 1 && css.bareCoarse[0].matches === false,
    `${css.bareCoarse.length} block(s), ${css.bareCoarse.filter((e) => e.matches).length} matching`,
  );
  // THE FIX, asserted rather than assumed. If any ::after selector here ever
  // loses its reveal gate, an invisible 46×46 zone goes live over the title.
  assert(
    "2.4 EVERY any-pointer ::after selector is gated on :hover / :focus-within",
    !!afterBlock &&
      afterBlock.rules
        .filter((r) => /::after/.test(r.sel))
        .every((r) => r.sel.split(",").every((s) => /:hover|:focus-within/.test(s))),
    afterBlock?.rules.map((r) => r.sel).join(" | ") ?? "no ::after block",
  );
  assert(
    "2.5 the any-pointer width arm does NOT touch opacity (the reveal stays behind `pointer: coarse`)",
    !!widthBlock && widthBlock.rules.every((r) => !/opacity/.test(r.css)),
    widthBlock?.rules.map((r) => r.css.replace(/\s+/g, " ")).join(" ") ?? "none",
  );
  assert(
    "2.6 the width arm RESETS the all-scope grid chip to 26px",
    !!widthBlock &&
      widthBlock.rules.some(
        (r) => /data-scope="all"/.test(r.sel) && /width:\s*26px/.test(r.css),
      ),
    widthBlock?.rules.find((r) => /data-scope="all"/.test(r.sel))?.css.replace(/\s+/g, " ") ?? "ABSENT",
  );

  const chipCount = await page.evaluate(() => window.__chips().length);
  console.log(`\n        ${chipCount} unit cards on the all-scope grid`);

  // ── A. THE REGRESSION IS GONE ─────────────────────────────────────────────
  console.log("\nGATE A — AT REST (no hover): the title's first line is NOT intercepted");
  const restRows = [];
  for (let i = 0; i < chipCount; i++) {
    await scrollIntoView(page, i);
    const hovered = await unhover(page);
    const t = await page.evaluate((idx) => window.__titleLine(idx), i);
    if (t) restRows.push({ i, hoveredDuringMeasure: hovered, ...t });
  }
  const restStolen = restRows.filter((r) => r.stolen > 0);
  const restDirty = restRows.filter((r) => r.hoveredDuringMeasure > 0);
  console.log(
    `        measured ${restRows.length}/${chipCount} cards · card width ${Math.min(...restRows.map((r) => r.cardW))}–${Math.max(...restRows.map((r) => r.cardW))}px` +
      ` · title line ${Math.min(...restRows.map((r) => r.titleW))}–${Math.max(...restRows.map((r) => r.titleW))}px`,
  );
  assert(
    "A.0 no card was in :hover during ANY at-rest measurement (the observation is clean)",
    restRows.length > 0 && restDirty.length === 0,
    `${restDirty.length}/${restRows.length} contaminated`,
  );
  assert(
    "A.1 chips rest at opacity 0 and their ::after is `none` on a hybrid",
    restRows.every((r) => r.chipOpacity === 0 && r.afterContent === "none"),
    `opacity set {${[...new Set(restRows.map((r) => r.chipOpacity))].join(",")}} · after set {${[...new Set(restRows.map((r) => r.afterContent))].join(",")}}`,
  );
  assert(
    "A.2 ZERO cards have title-line points stolen by the opener at rest",
    restRows.length > 0 && restStolen.length === 0,
    restStolen.length
      ? `${restStolen.length}/${restRows.length} still intercept — worst ${Math.max(...restStolen.map((r) => r.stolenPx))}px of title line`
      : `${restRows.length}/${restRows.length} clean`,
  );
  assert(
    "A.3 the drill button owns the title line instead",
    restRows.every((r) => r.onDrillCount === r.samples),
    `${restRows.filter((r) => r.onDrillCount === r.samples).length}/${restRows.length} fully owned by the drill`,
  );
  await unhover(page);
  await page.screenshot({ path: path.join(OUT, "A-hybrid-1280-at-rest.png") });

  // ── A″. PROVE GATE A CAN FAIL ─────────────────────────────────────────────
  // A.2 passing means nothing unless the same measurement, on the same page,
  // REPORTS THE DEFECT when the defect is present. Re-inject the pre-fix rule —
  // the ungated `::after` exactly as it shipped in b259845 — and re-measure at
  // rest. If this does not steal title-line points, the instrument is blind and
  // A.2's pass is an artifact.
  console.log("\nGATE A″ — pre-fix REPRODUCTION (re-inject the ungated ::after)");
  await applyOverride(
    page,
    "@media (min-width: 901px) and (any-pointer: coarse){" +
      '[data-year-unit-workspace]::after{content:"" !important;position:absolute !important;inset:-10px !important;}}',
  );
  const preFix = [];
  for (let i = 0; i < chipCount; i++) {
    await scrollIntoView(page, i);
    const hovered = await unhover(page);
    const t = await page.evaluate((idx) => window.__titleLine(idx), i);
    if (t) preFix.push({ i, hoveredDuringMeasure: hovered, ...t });
  }
  const preStolen = preFix.filter((r) => r.stolen > 0);
  console.log(
    `        with the ungated rule: ${preStolen.length}/${preFix.length} cards steal title-line points at rest` +
      (preStolen.length
        ? ` · ${Math.min(...preStolen.map((r) => r.stolenPx))}–${Math.max(...preStolen.map((r) => r.stolenPx))}px of the title line, chip still opacity ${preFix[0].chipOpacity}`
        : ""),
  );
  assert(
    "A″.1 the SAME measurement DOES report the defect when the defect is present",
    preFix.length > 0 && preStolen.length === preFix.length,
    `${preStolen.length}/${preFix.length} reproduced — A.2 is a real regression test, not a screenshot`,
  );
  assert(
    "A″.2 …and it was invisible while doing it (opacity 0, the whole complaint)",
    preFix.every((r) => r.chipOpacity === 0),
    `opacity set {${[...new Set(preFix.map((r) => r.chipOpacity))].join(",")}}`,
  );
  await page.screenshot({ path: path.join(OUT, "A3-hybrid-1280-prefix-repro.png") });
  await applyOverride(page, "");
  await unhover(page);

  // ── A′. THE ADVERSARIAL CASE THE FIX DOES NOT COVER ───────────────────────
  // A mouse-driven hybrid user does not click a card without first moving the
  // pointer INTO it — which is what fires `.unode:hover` and arms the ::after.
  // So "at rest" is not the state a click happens in. Measure the state that
  // is, and report the overhang past the VISIBLE chip edge.
  console.log("\nGATE A′ — WHILE HOVERING (the state a mouse click actually happens in)");
  const hoverRows = [];
  for (let i = 0; i < chipCount; i++) {
    const hovered = await hoverCard(page, i);
    if (!hovered) continue;
    const t = await page.evaluate((idx) => window.__titleLine(idx), i);
    if (t) hoverRows.push({ i, ...t });
  }
  const hovStolen = hoverRows.filter((r) => r.stolen > 0);
  console.log(
    `        ${hoverRows.length} cards measured while hovered · ${hovStolen.length} have title-line points taken by the opener`,
  );
  if (hovStolen.length) {
    const px = hovStolen.map((r) => r.stolenPx);
    const oh = hovStolen.map((r) => r.overhangPastChip);
    console.log(
      `        stolen title-line width: min ${Math.min(...px)}px max ${Math.max(...px)}px` +
        ` · overhang past the VISIBLE chip edge: min ${Math.min(...oh)}px max ${Math.max(...oh)}px`,
    );
  }
  // Reported, not failed: the hovered chip is VISIBLE, and the ≥44px target is
  // required by CLAUDE.md §4. The -10px overhang beyond the visible affordance
  // is the residual cost, and it is the number the design call needs.
  console.log(
    `        NOTE: this is the residual invisible overhang. It is the same trade the` +
      `\n        \`pointer: coarse\` tier already accepts, but here it is a MOUSE user.`,
  );
  await page.screenshot({ path: path.join(OUT, "A2-hybrid-1280-hovered.png") });

  // ── B. THE TARGET STILL WORKS WHEN IT SHOULD ──────────────────────────────
  console.log("\nGATE B — hovered / focused, the opener hit-tests ≥44×44");
  const armed = [];
  for (let i = 0; i < chipCount; i++) {
    const hovered = await hoverCard(page, i);
    if (!hovered) continue;
    const g = await page.evaluate((idx) => window.__geom(idx), i);
    if (g) armed.push({ i, ...g });
  }
  hybridHit = armed;
  const shapes = {};
  for (const c of armed) {
    const k = `painted ${c.paintedW}×${c.paintedH} · hit ${c.hit.w}×${c.hit.h} [${c.hit.reason}]`;
    shapes[k] = (shapes[k] || 0) + 1;
  }
  for (const [k, n] of Object.entries(shapes)) console.log(`        ${n}× ${k}`);
  const measured = armed.filter((c) => c.hit.reason === "measured");
  assert("B.1 chips were actually measured (not a vacuous pass)", measured.length > 0, `${measured.length}/${chipCount}`);
  const short = measured.filter((c) => c.hit.w < 44 || c.hit.h < 44);
  assert(
    "B.2 EVERY hovered chip hit-tests ≥44px on both axes (CLAUDE.md §4)",
    measured.length > 0 && short.length === 0,
    short.length ? `${short.length} short: ${short.slice(0, 3).map((c) => `${c.hit.w}x${c.hit.h}`).join(", ")}` : `${measured.length} chips ≥44×44`,
  );
  assert(
    "B.3 the chip still PAINTS at 26px — the all-scope reset held",
    measured.every((c) => c.paintedW <= 27 && c.paintedH <= 27),
    `painted ${measured[0]?.paintedW}×${measured[0]?.paintedH}`,
  );

  // Keyboard route: focus-within must arm it too, with no mouse involved.
  console.log("\nGATE B′ — :focus-within arms it with the pointer parked away");
  await unhover(page);
  await page.evaluate(() => window.__chips()[0]?.focus());
  await page.waitForTimeout(250);
  const focused = await page.evaluate(() => ({
    anyHovered: window.__anyHovered(),
    geom: window.__geom(0),
  }));
  assert(
    "B′.1 focus alone (no hover) arms the ≥44px target",
    focused.anyHovered === 0 && focused.geom?.hit.w >= 44 && focused.geom?.hit.h >= 44,
    `hovered=${focused.anyHovered} hit ${focused.geom?.hit.w}×${focused.geom?.hit.h} after=${focused.geom?.afterContent}`,
  );
  await page.evaluate(() => document.activeElement?.blur?.());

  // ── COUNTERFACTUAL ────────────────────────────────────────────────────────
  console.log("\nGATE B″ — COUNTERFACTUAL: suppress the ::after, re-measure the SAME page");
  await applyOverride(page, '[data-year-unit-workspace]::after{content:none !important;}');
  const cf = [];
  for (let i = 0; i < chipCount; i++) {
    const hovered = await hoverCard(page, i);
    if (!hovered) continue;
    const g = await page.evaluate((idx) => window.__geom(idx), i);
    if (g) cf.push({ i, ...g });
  }
  const cfM = cf.filter((c) => c.hit.reason === "measured");
  const cfShort = cfM.filter((c) => c.hit.w < 44 || c.hit.h < 44);
  console.log(`        without ::after: hit ${cfM[0]?.hit.w}×${cfM[0]?.hit.h} · ${cfShort.length}/${cfM.length} under 44px`);
  assert(
    "B″.1 without the ::after the SAME chips fall UNDER 44px — it IS what supplies the pass",
    cfM.length > 0 && cfShort.length === cfM.length,
    `${cfShort.length}/${cfM.length} short`,
  );

  // ── The inflation costs no layout ─────────────────────────────────────────
  const byIndex = new Map(cf.map((c) => [c.i, c]));
  const dTitle = armed.map((a) => (a.titleW ?? 0) - (byIndex.get(a.i)?.titleW ?? 0));
  const dCard = armed.map((a) => (a.cardW ?? 0) - (byIndex.get(a.i)?.cardW ?? 0));
  assert("B″.2 unit-title width delta is 0px on every card", dTitle.every((d) => d === 0), `${dTitle.length} cards`);
  assert("B″.3 card width delta is 0px on every card", dCard.every((d) => d === 0), `${dCard.length} cards`);
  await applyOverride(page, "");

  // ── D. THE NEW WIDTH ARM ──────────────────────────────────────────────────
  console.log("\nGATE D — the width arm: outline rows + subject-scope openers reach 44px");
  // D.1 — the all-scope grid chip must NOT have inflated.
  await unhover(page);
  const gridPainted = await page.evaluate(() =>
    window.__chips().map((el) => {
      const r = el.getBoundingClientRect();
      return `${Math.round(r.width)}×${Math.round(r.height)}`;
    }),
  );
  const gridShapes = [...new Set(gridPainted)];
  assert(
    "D.1 the all-scope GRID chip is still 26×26 painted (it must not eat a ~95px card)",
    gridShapes.length === 1 && gridShapes[0] === "26×26",
    `painted shapes: ${gridShapes.join(", ")}`,
  );

  // D.2 — the list outline. `viewMode` is in-memory, so reach it through the UI.
  const listPage = await ctx.newPage();
  await listPage.goto(`${BASE}/year`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const listReady = await waitForLiveState(listPage);
  await installHelpers(listPage);
  let listEnv = null;
  let listMeasure = null;
  if (listReady.responded) {
    // THE TRIGGER IS THE BUTTON, NOT THE DIALOG. `aria-label="Filters and view"`
    // belongs to the popover (YearFiltersPopover.tsx :358), which does not exist
    // until the trigger is clicked — so targeting it finds nothing, clicks
    // nothing, and the run silently measures the grid tier instead. The trigger
    // is a canonical <Button> whose LABEL is "Filters & View" (:342).
    const btn = listPage.locator('button[aria-haspopup="dialog"]').filter({ hasText: /Filters\s*&\s*View/i }).first();
    const btnFound = await btn.count();
    if (btnFound) await btn.click().catch(() => {});
    await listPage.waitForTimeout(600);
    const listOpt = listPage.locator('[role="radio"][aria-label="List view"]').first();
    console.log(`        nav: trigger found=${btnFound} · List radio found=${await listOpt.count()}`);
    if (await listOpt.count()) {
      await listOpt.click().catch(() => {});
      await listPage.waitForTimeout(900);
      await listPage.keyboard.press("Escape");
      await listPage.waitForTimeout(400);
    }
    listEnv = await readEnv(listPage);
    if (listEnv.hier === "list") {
      listMeasure = await listPage.evaluate(() =>
        window.__chips().map((el) => {
          const r = el.getBoundingClientRect();
          const row = el.closest('[class*="unode"]')?.getBoundingClientRect();
          return {
            w: Math.round(r.width * 10) / 10,
            h: Math.round(r.height * 10) / 10,
            rowW: row ? Math.round(row.width * 10) / 10 : null,
          };
        }),
      );
      await listPage.screenshot({ path: path.join(OUT, "D-hybrid-list-outline.png") });
    }
  }
  console.log(`        list env: ${JSON.stringify(listEnv)}`);
  if (listMeasure && listMeasure.length) {
    const ws = [...new Set(listMeasure.map((m) => `${m.w}×${m.h}`))];
    console.log(`        ${listMeasure.length} outline openers · shapes ${ws.join(", ")} · row width ${Math.min(...listMeasure.map((m) => m.rowW))}–${Math.max(...listMeasure.map((m) => m.rowW))}px`);
    assert(
      "D.2 outline (data-hier=list) openers measure ≥44px wide AND ≥44px tall",
      listEnv.anyCoarse === true &&
        listEnv.under900 === false &&
        listMeasure.every((m) => m.w >= 44 && m.h >= 44),
      `anyCoarse=${listEnv.anyCoarse} under900=${listEnv.under900} · ${listMeasure.filter((m) => m.w < 44 || m.h < 44).length}/${listMeasure.length} short`,
    );
  } else {
    bad("D.2 outline openers ≥44px", `NOT MEASURED — data-hier=${listEnv?.hier ?? "?"}, the List switch was not reached`);
  }
  await listPage.close();

  // D.3 — subject scope (the ≥200px card grid).
  const subjPage = await ctx.newPage();
  await subjPage.goto(`${BASE}/year`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const subjReady = await waitForLiveState(subjPage);
  await installHelpers(subjPage);
  let subjEnv = null;
  let subjMeasure = null;
  if (subjReady.responded) {
    const label = subjPage.locator('[class*="TimelineYear_slabel"]').first();
    if (await label.count()) {
      await label.click().catch(() => {});
      await subjPage.waitForTimeout(1200);
    }
    subjEnv = await readEnv(subjPage);
    if (subjEnv.scope === "subject") {
      subjMeasure = await subjPage.evaluate(() =>
        window.__chips().map((el) => {
          const r = el.getBoundingClientRect();
          const card = el.closest('[class*="unode"]')?.getBoundingClientRect();
          return {
            w: Math.round(r.width * 10) / 10,
            h: Math.round(r.height * 10) / 10,
            opacity: getComputedStyle(el).opacity,
            cardW: card ? Math.round(card.width * 10) / 10 : null,
          };
        }),
      );
      await subjPage.screenshot({ path: path.join(OUT, "D-hybrid-subject-scope.png") });
    }
  }
  console.log(`        subject env: ${JSON.stringify(subjEnv)}`);
  if (subjMeasure && subjMeasure.length) {
    const ws = [...new Set(subjMeasure.map((m) => `${m.w}×${m.h}`))];
    console.log(`        ${subjMeasure.length} subject-scope openers · shapes ${ws.join(", ")} · card width ${Math.min(...subjMeasure.map((m) => m.cardW))}–${Math.max(...subjMeasure.map((m) => m.cardW))}px`);
    assert(
      "D.3 subject-scope openers measure ≥44px wide AND ≥44px tall",
      subjEnv.anyCoarse === true &&
        subjEnv.under900 === false &&
        subjMeasure.every((m) => m.w >= 44 && m.h >= 44),
      `anyCoarse=${subjEnv.anyCoarse} under900=${subjEnv.under900} · ${subjMeasure.filter((m) => m.w < 44 || m.h < 44).length}/${subjMeasure.length} short`,
    );
  } else {
    bad("D.3 subject-scope openers ≥44px", `NOT MEASURED — scope=${subjEnv?.scope ?? "?"}`);
  }
  await subjPage.close();
  await ctx.close();
} catch (e) {
  bad("HYBRID RUN", redact(String(e?.message ?? e)));
} finally {
  await browser.close();
}

// ═══ C. TOUCH-PRIMARY CONTROL ══════════════════════════════════════════════
console.log("\nGATE C — touch-primary (pointer: coarse) is unaffected by the gating");
const touchBrowser = await chromium.launch({ channel: "chrome", args: TOUCH_ARGS });
try {
  const tctx = await paperYearContext(touchBrowser, 1280);
  const tpage = await tctx.newPage();
  await tpage.goto(`${BASE}/year`, { waitUntil: "domcontentloaded", timeout: 240000 });
  // No hover flip is possible here — the chip rests at opacity 1 by design.
  const tready = await waitForLiveState(tpage, { expectFlip: false });
  assert(
    "C.0 the touch profile reached the live state (chip resting at opacity 1)",
    tready.responded === true,
    tready.responded ? `resting opacity ${tready.before} after ${tready.ms}ms` : "never reached opacity 1",
  );
  await installHelpers(tpage);
  const tenv = await readEnv(tpage);
  console.log(`        ${JSON.stringify(tenv)}`);
  assert(
    "C.1 this profile is TOUCH-PRIMARY above 900px",
    tenv.primaryCoarse === true && tenv.anyCoarse === true && tenv.under900 === false,
    `primaryCoarse=${tenv.primaryCoarse} anyCoarse=${tenv.anyCoarse} width=${tenv.width}`,
  );
  const tHovered = await unhover(tpage);
  const tCount = await tpage.evaluate(() => window.__chips().length);
  const tRows = [];
  for (let i = 0; i < tCount; i++) {
    await scrollIntoView(tpage, i);
    await tpage.mouse.move(3, 3);
    const g = await tpage.evaluate((idx) => window.__geom(idx), i);
    if (g) tRows.push({ i, ...g });
  }
  const tM = tRows.filter((c) => c.hit.reason === "measured");
  const tShapes = {};
  for (const c of tM) tShapes[`painted ${c.paintedW}×${c.paintedH} · hit ${c.hit.w}×${c.hit.h} · opacity ${c.opacity}`] =
    (tShapes[`painted ${c.paintedW}×${c.paintedH} · hit ${c.hit.w}×${c.hit.h} · opacity ${c.opacity}`] || 0) + 1;
  for (const [k, n] of Object.entries(tShapes)) console.log(`        ${n}× ${k}`);
  assert(
    "C.2 the chip is VISIBLE at rest, no hover required",
    tM.length > 0 && tM.every((c) => c.opacity === "1"),
    `hoveredDuringMeasure=${tHovered} · opacity set {${[...new Set(tM.map((c) => c.opacity))].join(",")}}`,
  );
  assert(
    "C.3 the target is ≥44×44 at rest, with NO hover — the unconditional arm held",
    tM.length > 0 && tM.every((c) => c.hit.w >= 44 && c.hit.h >= 44),
    `${tM.filter((c) => c.hit.w < 44 || c.hit.h < 44).length}/${tM.length} short`,
  );
  assert(
    "C.4 the chip still paints 26×26 (the all-scope reset held on touch too)",
    tM.every((c) => c.paintedW <= 27 && c.paintedH <= 27),
    `painted ${[...new Set(tM.map((c) => `${c.paintedW}×${c.paintedH}`))].join(", ")}`,
  );
  await tpage.screenshot({ path: path.join(OUT, "C-touch-primary-1280.png") });
  await tctx.close();
} catch (e) {
  bad("TOUCH RUN", redact(String(e?.message ?? e)));
} finally {
  await touchBrowser.close();
}

// ═══ E. FINE-POINTER DESKTOP CONTROL ═══════════════════════════════════════
// Pointer capability is a LAUNCH flag, so the control needs its own browser.
// Without this arm the rules could be unconditional and everything above would
// still pass — i.e. the guard would be decorative and every desktop user would
// have a 46px invisible zone over the unit title.
console.log("\nGATE E — fine-pointer control (separate browser, no capability flags)");
const ctlBrowser = await chromium.launch({ channel: "chrome" });
try {
  const ctlCtx = await paperYearContext(ctlBrowser, 1280);
  const ctlPage = await ctlCtx.newPage();
  await ctlPage.goto(`${BASE}/year`, { waitUntil: "domcontentloaded", timeout: 240000 });
  const ctlReady = await waitForLiveState(ctlPage);
  assert(
    "E.0 the control reached the SAME live state (not a login page / unstyled)",
    ctlReady.responded === true,
    ctlReady.responded ? `opacity ${ctlReady.before} → ${ctlReady.after}` : "control never responded",
  );
  await installHelpers(ctlPage);
  const ctlEnv = await ctlPage.evaluate(() => ({
    anyCoarse: matchMedia("(any-pointer: coarse)").matches,
    newBlock: matchMedia("(min-width: 901px) and (any-pointer: coarse)").matches,
    coarseBlock: matchMedia("(min-width: 901px) and (pointer: coarse)").matches,
    width: innerWidth,
    hier: document.querySelector('[class*="TimelineYear_root"]')?.getAttribute("data-hier"),
    scope: document.querySelector('[class*="TimelineYear_root"]')?.getAttribute("data-scope"),
  }));
  assert("E.1 a plain mouse desktop does NOT see any-pointer: coarse", ctlEnv.anyCoarse === false, JSON.stringify(ctlEnv));
  assert(
    "E.2 NEITHER pointer block matches — no desktop regression from either arm",
    ctlEnv.newBlock === false && ctlEnv.coarseBlock === false,
    `any-pointer=${ctlEnv.newBlock} pointer=${ctlEnv.coarseBlock}`,
  );
  const ctlCount = await ctlPage.evaluate(() => window.__chips().length);
  const ctlRows = [];
  for (let i = 0; i < Math.min(ctlCount, 8); i++) {
    const hovered = await hoverCard(ctlPage, i);
    if (!hovered) continue;
    const g = await ctlPage.evaluate((idx) => window.__geom(idx), i);
    if (g) ctlRows.push({ i, ...g });
  }
  const ctlM = ctlRows.filter((c) => c.hit.reason === "measured");
  console.log(`        control hit: ${ctlM[0]?.hit.w}×${ctlM[0]?.hit.h} · ::after ${ctlM[0]?.afterContent} · painted ${ctlM[0]?.paintedW}×${ctlM[0]?.paintedH}`);
  assert(
    "E.3 the ::after is GUARD-GATED — the mouse desktop keeps its 26px chip, unchanged",
    ctlM.length > 0 && ctlM.every((c) => c.hit.w < 44 && c.hit.h < 44),
    `${ctlM.filter((c) => c.hit.w >= 44).length}/${ctlM.length} inflated (want 0)`,
  );
  // The width arm must be inert here too, or every desktop card loses ~4px.
  const ctlList = await ctlPage.evaluate(() =>
    window.__chips().map((el) => Math.round(el.getBoundingClientRect().width)),
  );
  assert(
    "E.4 the width arm is inert — the all-scope chip is 26px on a mouse desktop",
    ctlList.length > 0 && ctlList.every((w) => w === 26),
    `widths {${[...new Set(ctlList)].join(",")}}`,
  );
  await ctlPage.screenshot({ path: path.join(OUT, "E-control-mouse-1280.png") });
} catch (e) {
  bad("CONTROL RUN", redact(String(e?.message ?? e)));
} finally {
  await ctlBrowser.close();
}

console.log(`\n${"─".repeat(72)}`);
console.log(`RESULT  ${pass} passed, ${fail} failed`);
if (fail) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  · ${f}`);
}
console.log(`screenshots: ${OUT}`);
process.exit(fail ? 1 : 0);
