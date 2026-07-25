// scripts/probe-uws-anypointer.mjs — §4b evidence + regression test for the
// paper-Year `.uws` workspace opener on a HYBRID device (task #27).
//
// WHAT SHIPPED, AND WHY IT IS SPLIT IN TWO
//
// The ≥901px block in components/year/TimelineYear.module.css is keyed to
// `pointer: coarse` and carries three arms: the chip's width, its `opacity: 1`
// reveal, and an inset `::after` that buys the ≥44px touch target (CLAUDE.md
// §4). A hybrid — a touch laptop, or a tablet with a trackpad — reports
// `pointer: fine` (its primary input hovers) with `any-pointer: coarse`, so it
// matched NONE of them and fell through to a 26px painted chip with no
// inflation.
//
// Only the ::after arm was widened to `any-pointer: coarse`. The reveal arm was
// deliberately left behind, and that asymmetry is the thing this probe pins:
//
//   • The REVEAL answers "can this teacher DISCOVER the chip?" A hybrid has a
//     mouse, so `.unode:hover` already fires. Painting the chip permanently
//     there would mask the unit title on nearly every card (20 of 20 sampled)
//     to fix a path that already works.
//   • The HIT AREA answers "once revealed, can a FINGER hit it?" On a hybrid
//     the real gesture is hover with the mouse, then tap with the hand — and
//     only the tap failed. An inset ::after paints nothing and, because the
//     chip is absolutely positioned, costs no layout at all.
//
// So Gates 3 + 5 prove the fix works and is free; Gates 2.4 + 6 prove it did
// NOT bleed into the reveal. Gate 4 is the counterfactual that makes this a
// regression test rather than a screenshot.
//
// THE EMULATION IS THE HARD PART — three of the four routes are wrong, and two
// of them fake a pass (measured; see probe-any-pointer.mjs for the full table):
//
//   Playwright `hasTouch`                    → coarse primary = a PHONE. The
//   CDP Emulation.setTouchEmulationEnabled   → old guard already matched, so
//                                              pre/post are IDENTICAL.
//   CDP Emulation.setEmulatedMedia {pointer} → accepted and SILENTLY IGNORED.
//   --blink-settings=availablePointerTypes…  → the hybrid. The only one.
//
// This is why scripts/probe-uws-hybrid.mjs cannot serve as this regression
// test. It is the INVESTIGATION probe that sized the gap, it uses
// `Emulation.setEmulatedMedia`, and its header reasons that emulating
// `any-pointer` was "UNNECESSARY — no RULE in TimelineYear.module.css queries
// any-pointer". That was true when it was written and is false now: it would
// measure a fine-pointer desktop and report this change as a no-op.
//
// Gate 1 asserts `any-pointer: coarse` TRUE **and** `max-width: 900px` FALSE in
// the same observation and ABORTS otherwise — without both, the ≤900px width
// fallback supplies the 44px and the run proves nothing about a hybrid.
//
// Real Chrome only (never the system-default Edge).
//
// USAGE: node scripts/probe-uws-anypointer.mjs [--base http://localhost:3099]

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { bypassLogin, requireToken, redact } from "./lib/auth.mjs";

requireToken({ repoRoot: process.cwd() });
const BASE =
  (process.argv.includes("--base") && process.argv[process.argv.indexOf("--base") + 1]) ||
  process.env.PROBE_BASE ||
  "http://localhost:3099";
const OUT = path.resolve("docs/screenshots/uws-anypointer");
await mkdir(OUT, { recursive: true });

/**
 * Blink pointer/hover capability bits (ui/base/pointer/pointer_device.h):
 *   PointerType NONE=1 COARSE=2 FINE=4 · HoverType NONE=1 HOVER=2
 * COARSE|FINE = 6 available, FINE primary → a mouse-driven machine with a
 * touchscreen attached. Because it is a LAUNCH flag, the fine-pointer control
 * in Gate 6 needs its own browser instance, not a per-page toggle.
 *
 * Do NOT add CDP touch emulation on top: it OVERRIDES these settings and
 * collapses the profile back to a phone.
 */
const HYBRID_ARGS = [
  "--blink-settings=availablePointerTypes=6,primaryPointerType=4," +
    "availableHoverTypes=2,primaryHoverType=2",
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
      // PIN THE FRAME. /year routes on it (YearShell), and only the PAPER
      // frame mounts TimelineYear — unpinned, this measures whatever the last
      // session happened to leave behind.
      localStorage.setItem("mycurricula:user:theme-frame", "paper");
      localStorage.setItem("mycurricula:user:theme-bg", "wash");
      localStorage.setItem("mycurricula:user:theme", "clear");
    } catch {
      /* private mode */
    }
  });
  await bypassLogin(ctx, { base: BASE, next: "/year", timeout: 240000 });
  return ctx;
}

/**
 * READINESS BY RESPONSE — not by clock, and not by presence.
 *
 * Dev-server hydration here runs 5–9s, so sleeping a constant either wastes
 * time or measures SSR-default HTML. "the chip exists" is not enough either: it
 * only proves the server rendered it. The control that must RESPOND is
 * `.unode:hover` flipping the chip's computed opacity 0 → 1 — a real state
 * change, and one that requires the CSS module to have arrived, which is the
 * only precondition a pure-CSS change depends on. If it never responds, the
 * instrument is broken and nothing measured afterwards means anything.
 */
async function waitForHoverControl(page, budgetMs = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < budgetMs) {
    const chip = page.locator("[data-year-unit-workspace]").first();
    if (await chip.count()) {
      // RE-ARM FIRST. Playwright parks the cursor where it last hovered, so a
      // second poll would read opacity 1 both before AND after and could never
      // observe a change again — a control that can only fire on its first
      // attempt is not a control. Park the mouse off the card and let the
      // 0.12s transition settle before sampling the resting value.
      await page.mouse.move(2, 2);
      await page.waitForTimeout(300);
      const before = await chip.evaluate((el) => getComputedStyle(el).opacity);
      await page
        .locator('[class*="unode"]')
        .first()
        .hover({ timeout: 5000 })
        .catch(() => {});
      await page.waitForTimeout(300);
      const after = await chip.evaluate((el) => getComputedStyle(el).opacity);
      if (before !== after) return { responded: true, before, after, ms: Date.now() - t0 };
    }
    await page.waitForTimeout(1000);
  }
  return { responded: false, ms: Date.now() - t0 };
}

/**
 * The REAL clickable extent: walk outward from the centre with
 * elementFromPoint until the hit test stops returning the element or one of its
 * descendants. A correctly-declared inflation can still be clipped or occluded
 * by an ancestor, and getComputedStyle cannot see that — this can.
 *
 * `owns` deliberately excludes ANCESTORS. An earlier draft in this repo also
 * accepted `n.contains(el)`, which counts every ancestor as a hit; the walk
 * then never terminates and every target measures the walk limit, i.e. a
 * uniform pass that can detect nothing.
 */
async function installHitProbe(page) {
  await page.evaluate(() => {
    window.__hit = (el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return { w: 0, h: 0, reason: "zero-rect" };
      const cx = Math.round(r.left + r.width / 2);
      const cy = Math.round(r.top + r.height / 2);
      const owns = (n) => n && (n === el || el.contains(n));
      if (!owns(document.elementFromPoint(cx, cy))) return { w: 0, h: 0, reason: "centre-occluded" };
      const walk = (dx, dy) => {
        let d = 0;
        for (let i = 1; i <= 60; i++) {
          if (owns(document.elementFromPoint(cx + dx * i, cy + dy * i))) d = i;
          else break;
        }
        return d;
      };
      return {
        w: walk(-1, 0) + walk(1, 0) + 1,
        h: walk(0, -1) + walk(0, 1) + 1,
        reason: "measured",
      };
    };
  });
}

/**
 * Measure every rendered chip with its card + title, plus page h-scroll.
 *
 * EACH CHIP IS SCROLLED INTO VIEW FIRST. Without that, chips near the edge of
 * the timeline's own scroll viewport measure short — not because anything in
 * the cascade clips the ::after, but because the walk runs off the visible edge
 * of the scroller and elementFromPoint returns the root shell. Measured: the
 * same seven elements read 45×34 unscrolled and 45×45 scrolled. That artifact
 * is indistinguishable from a real clipping failure if you do not control for
 * it.
 */
async function survey(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("[data-year-unit-workspace]")) {
      el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      const unode = el.closest('[class*="unode"]');
      const title = unode?.querySelector('[class*="unit"]:not([class*="unitGrid"])');
      const ur = unode?.getBoundingClientRect();
      const tr = title?.getBoundingClientRect();
      const after = getComputedStyle(el, "::after");
      out.push({
        paintedW: Math.round(r.width * 10) / 10,
        paintedH: Math.round(r.height * 10) / 10,
        hit: window.__hit(el),
        afterContent: after.content,
        cardW: ur ? Math.round(ur.width * 10) / 10 : null,
        titleW: tr ? Math.round(tr.width * 10) / 10 : null,
        titleEllipsised: title ? title.scrollWidth > title.clientWidth + 1 : null,
      });
    }
    return {
      chips: out,
      docScrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
    };
  });
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
  await page.waitForTimeout(300);
}

// ── HYBRID RUN ─────────────────────────────────────────────────────────────
const browser = await chromium.launch({ channel: "chrome", args: HYBRID_ARGS });
let hybridHit = null;
try {
  const ctx = await paperYearContext(browser, 1280);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/year`, { waitUntil: "domcontentloaded", timeout: 240000 });

  console.log("\nGATE 0 — readiness by RESPONSE (hover flips the chip's opacity)");
  const ready = await waitForHoverControl(page);
  assert(
    "0.1 the hover control RESPONDED (the instrument is live)",
    ready.responded === true,
    ready.responded
      ? `opacity ${ready.before} → ${ready.after} after ${ready.ms}ms`
      : `no response in ${ready.ms}ms`,
  );
  if (!ready.responded) throw new Error("control never responded — instrument broken, not the app");

  console.log("\nGATE 1 — the environment is a HYBRID, above the width fallback");
  const env = await page.evaluate(() => ({
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
  console.log(`        ${JSON.stringify(env)}`);
  assert("1.1 any-pointer: coarse MATCHES", env.anyCoarse === true, String(env.anyCoarse));
  // Load-bearing: without this, the ≤900px arm supplies the 44px and Gate 3
  // passes for a reason that has nothing to do with the change under test.
  assert("1.2 max-width: 900px does NOT match", env.under900 === false, `width=${env.width}`);
  assert(
    "1.3 primary pointer is FINE — a hybrid, not a phone (the old guard is dead here)",
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

  console.log("\nGATE 2 — provenance + counterfactual, read off the LIVE CSSOM");
  const css = await page.evaluate(() => {
    const out = { widenedUws: [], bareUws: [] };
    // Recurse through grouping rules: a flat top-level scan is blind to a block
    // nested inside @layer/@supports, and a rule the probe cannot see reads as
    // a clean pass.
    const visit = (rules) => {
      for (const rule of Array.from(rules || [])) {
        if (rule instanceof CSSMediaRule) {
          const t = rule.conditionText || rule.media.mediaText;
          const sels = Array.from(rule.cssRules || [])
            .map((r) => r.selectorText)
            .filter(Boolean);
          if (sels.some((s) => /uws/.test(s))) {
            const entry = { media: t, matches: matchMedia(t).matches, selectors: sels };
            if (/any-pointer/.test(t)) out.widenedUws.push(entry);
            else if (/pointer:\s*coarse/.test(t)) out.bareUws.push(entry);
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
  for (const e of [...css.widenedUws, ...css.bareUws]) {
    console.log(`        ${e.matches ? "LIVE " : "inert"}  ${e.media}  →  ${e.selectors.join(", ")}`);
  }
  assert(
    "2.1 the served CSS carries the widened .uws block (not a stale bundle)",
    css.widenedUws.length === 1 && css.widenedUws[0].selectors.some((s) => /uws.*::after/.test(s)),
    css.widenedUws.length ? css.widenedUws[0].media : "ABSENT — measuring stale or reverted CSS",
  );
  assert("2.2 it MATCHES on this hybrid", css.widenedUws[0]?.matches === true, String(css.widenedUws[0]?.matches));
  assert(
    "2.3 COUNTERFACTUAL: the untouched `pointer: coarse` block is still INERT here",
    css.bareUws.length === 1 && css.bareUws[0].matches === false,
    `${css.bareUws.length} bare block(s), ${css.bareUws.filter((e) => e.matches).length} matching` +
      ` — this is the fall-through the change routes around`,
  );
  // The asymmetry, asserted rather than assumed: exactly ONE selector rode in,
  // and it is the ::after. If `opacity` or `width` ever joins it, the chip
  // paints permanently over the unit title for every hybrid user.
  assert(
    "2.4 ONLY the hit area widened — the reveal + width arms stayed behind `pointer: coarse`",
    css.widenedUws.length === 1 &&
      css.widenedUws[0].selectors.length === 1 &&
      /::after$/.test(css.widenedUws[0].selectors[0]),
    `widened selectors: ${css.widenedUws[0]?.selectors.join(", ")}`,
  );

  console.log("\nGATE 3 — the hit area a finger actually gets (elementFromPoint walk)");
  await installHitProbe(page);
  await page.locator('[class*="unode"]').first().hover();
  await page.waitForTimeout(200);
  const now = await survey(page);
  hybridHit = now;
  const shapes = {};
  for (const c of now.chips) {
    const k = `painted ${c.paintedW}×${c.paintedH} · hit ${c.hit.w}×${c.hit.h} [${c.hit.reason}]`;
    shapes[k] = (shapes[k] || 0) + 1;
  }
  for (const [k, n] of Object.entries(shapes)) console.log(`        ${n}× ${k}`);
  const measured = now.chips.filter((c) => c.hit.reason === "measured");
  assert(
    "3.1 chips were actually measured (not a vacuous pass)",
    measured.length > 0,
    `${measured.length}/${now.chips.length}`,
  );
  const short = measured.filter((c) => c.hit.w < 44 || c.hit.h < 44);
  assert(
    "3.2 EVERY chip hit-tests ≥44px on BOTH axes (CLAUDE.md §4)",
    measured.length > 0 && short.length === 0,
    short.length
      ? `${short.length} short: ${short.slice(0, 3).map((c) => `${c.hit.w}x${c.hit.h}`).join(", ")}`
      : `${measured.length} chips ≥44×44`,
  );
  // The other half of the ruling: the chip must still PAINT at 26px. If this
  // fails, the reveal/width arm was adopted and the unit title is being masked.
  assert(
    "3.3 the chip still PAINTS at 26px — the ≤900px in-flow treatment was NOT adopted",
    measured.every((c) => c.paintedW <= 27 && c.paintedH <= 27),
    `painted ${measured[0]?.paintedW}×${measured[0]?.paintedH}`,
  );
  const cardWs = now.chips.map((c) => c.cardW).filter(Boolean);
  console.log(
    `        card (.unode) width: min ${Math.min(...cardWs)}px max ${Math.max(...cardWs)}px` +
      ` · doc scrollW ${now.docScrollW} vs innerW ${now.innerW}`,
  );
  await page.screenshot({ path: path.join(OUT, "hybrid-1280-after.png") });

  console.log("\nGATE 4 — COUNTERFACTUAL: suppress the ::after, re-measure the SAME page");
  // Without this, Gate 3 cannot distinguish "the ::after supplies the target"
  // from "something else on the page already did". This is what makes the run a
  // regression test rather than a screenshot.
  await applyOverride(page, '[data-year-unit-workspace]::after{content:none !important;}');
  await page.locator('[class*="unode"]').first().hover();
  await page.waitForTimeout(200);
  const before = await survey(page);
  const beforeMeasured = before.chips.filter((c) => c.hit.reason === "measured");
  const beforeShort = beforeMeasured.filter((c) => c.hit.w < 44 || c.hit.h < 44);
  console.log(
    `        without ::after: hit ${beforeMeasured[0]?.hit.w}×${beforeMeasured[0]?.hit.h}` +
      ` · ${beforeShort.length}/${beforeMeasured.length} under 44px`,
  );
  assert(
    "4.1 without the ::after the SAME chips fall UNDER 44px — it IS what supplies the pass",
    beforeMeasured.length > 0 && beforeShort.length === beforeMeasured.length,
    `${beforeShort.length}/${beforeMeasured.length} short`,
  );
  await page.screenshot({ path: path.join(OUT, "hybrid-1280-before.png") });

  console.log("\nGATE 5 — the inflation costs NO layout (this is WHY this arm could widen)");
  const dTitle = before.chips.map((b, i) => (now.chips[i]?.titleW ?? 0) - (b.titleW ?? 0));
  const dCard = before.chips.map((b, i) => (now.chips[i]?.cardW ?? 0) - (b.cardW ?? 0));
  const newlyEllipsised = now.chips.filter(
    (c, i) => c.titleEllipsised && !before.chips[i]?.titleEllipsised,
  ).length;
  console.log(
    `        title width delta: min ${Math.min(...dTitle)}px max ${Math.max(...dTitle)}px` +
      ` · card delta: min ${Math.min(...dCard)}px max ${Math.max(...dCard)}px`,
  );
  assert("5.1 unit-title width delta is 0px on every card", dTitle.every((d) => d === 0), `${dTitle.length} cards`);
  assert("5.2 card width delta is 0px on every card", dCard.every((d) => d === 0), `${dCard.length} cards`);
  assert("5.3 no title is NEWLY ellipsised", newlyEllipsised === 0, `${newlyEllipsised} newly ellipsised`);
  assert(
    "5.4 no document horizontal scroll introduced",
    now.docScrollW <= now.innerW + 1 && now.docScrollW === before.docScrollW,
    `after=${now.docScrollW} before=${before.docScrollW} inner=${now.innerW}`,
  );
  await applyOverride(page, "");
  await ctx.close();
} catch (e) {
  bad("HYBRID RUN", redact(String(e?.message ?? e)));
} finally {
  await browser.close();
}

// ── CONTROL: a plain mouse desktop must be UNCHANGED ───────────────────────
// Pointer capability is a LAUNCH flag, so the control needs its own browser.
// Without this arm the rule could be unconditional and everything above would
// still pass — i.e. the guard would be decorative and every desktop user would
// have a 46px invisible zone over the unit title.
console.log("\nGATE 6 — fine-pointer control (separate browser, no hybrid flag)");
const ctlBrowser = await chromium.launch({ channel: "chrome" });
try {
  const ctlCtx = await paperYearContext(ctlBrowser, 1280);
  const ctlPage = await ctlCtx.newPage();
  await ctlPage.goto(`${BASE}/year`, { waitUntil: "domcontentloaded", timeout: 240000 });
  // An unauthenticated or unhydrated control renders no chips at all, and
  // "no chip measured ≥44px" would then read as successful gating. Prove the
  // control reached the same live state before believing anything it reports.
  const ctlReady = await waitForHoverControl(ctlPage);
  assert(
    "6.0 the control reached the SAME live state (not a login page / unstyled)",
    ctlReady.responded === true,
    ctlReady.responded ? `opacity ${ctlReady.before} → ${ctlReady.after}` : "control never responded",
  );
  await installHitProbe(ctlPage);
  const ctlEnv = await ctlPage.evaluate(() => ({
    anyCoarse: matchMedia("(any-pointer: coarse)").matches,
    newBlock: matchMedia("(min-width: 901px) and (any-pointer: coarse)").matches,
    width: innerWidth,
    hier: document.querySelector('[class*="TimelineYear_root"]')?.getAttribute("data-hier"),
    scope: document.querySelector('[class*="TimelineYear_root"]')?.getAttribute("data-scope"),
  }));
  assert(
    "6.1 a plain mouse desktop does NOT see any-pointer: coarse",
    ctlEnv.anyCoarse === false,
    JSON.stringify(ctlEnv),
  );
  assert(
    "6.2 the widened block is INERT for a mouse user — no desktop regression",
    ctlEnv.newBlock === false,
    String(ctlEnv.newBlock),
  );
  await ctlPage.locator('[class*="unode"]').first().hover();
  await ctlPage.waitForTimeout(200);
  const ctlNow = await survey(ctlPage);
  const ctlM = ctlNow.chips.filter((c) => c.hit.reason === "measured");
  console.log(`        control hit: ${ctlM[0]?.hit.w}×${ctlM[0]?.hit.h} · ::after ${ctlM[0]?.afterContent}`);
  assert(
    "6.3 the ::after is GUARD-GATED — the mouse desktop keeps its 26px chip, unchanged",
    ctlM.length > 0 && ctlM.every((c) => c.hit.w < 44 && c.hit.h < 44),
    `${ctlM.filter((c) => c.hit.w >= 44).length}/${ctlM.length} inflated (want 0)`,
  );
  if (hybridHit) {
    const hy = hybridHit.chips.filter((c) => c.hit.reason === "measured");
    console.log(
      `\n        DIFFERENTIAL  hybrid ${hy[0]?.hit.w}×${hy[0]?.hit.h}` +
        `  vs  mouse ${ctlM[0]?.hit.w}×${ctlM[0]?.hit.h}  (painted ${hy[0]?.paintedW}×${hy[0]?.paintedH} on both)`,
    );
  }
  await ctlPage.screenshot({ path: path.join(OUT, "control-mouse-1280.png") });
} catch (e) {
  bad("CONTROL RUN", redact(String(e?.message ?? e)));
} finally {
  await ctlBrowser.close();
}

console.log(`\n${"─".repeat(66)}`);
console.log(`RESULT  ${pass} passed, ${fail} failed`);
if (fail) {
  console.log("\nFAILURES:");
  for (const f of failures) console.log(`  · ${f}`);
}
console.log(`screenshots: ${OUT}`);
process.exit(fail ? 1 : 0);
