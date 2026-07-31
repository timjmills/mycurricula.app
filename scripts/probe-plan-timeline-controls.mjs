// probe-plan-timeline-controls.mjs — the GEOMETRY half of the Plan timeline's
// control fixes (docs/audits/2026-07-31-qa-plan-timeline.md #1 and #2).
//
// WHY A BROWSER PROBE AND NOT A UNIT TEST. The defect is a CASCADE defect:
// `.cp-root button` (app/tokens.css:1128) is (0,1,1) and beat five single-class
// rules in timeline.module.css, so the two axis-scroll arrows computed to
// 5.1 × 28px. Nothing about that is visible in a rendered HTML string — there
// is no cascade, no `.cp-root` ancestor and no layout in `renderToStaticMarkup`.
// tests/plan-timeline-controls.test.ts pins the parts that ARE string-assertable
// (the doubling is in the stylesheet, the classes reach the markup, the tooltip
// copy changed); this measures the only thing that actually settles it.
//
// ── THE MISTAKE THIS FILE ALREADY MADE ONCE ──────────────────────────────
// The first version of this probe measured each control's OWN box against 44px
// and reported PASS on a diff that had just made a lesson untappable. Growing
// the band's resize grip to 44px covered 15 of 310 lesson dots — one of them
// 98% — because a control can reach 44px by CONSUMING ITS NEIGHBOUR'S TARGET
// and every assertion in the file was still satisfied. That is the exact
// instrument-fails-open shape this header warns about, written into the
// instrument that warns about it.
//
// So there are now TWO passes, and the second is the one that matters:
//   1. BOX — each control carries its chrome and is not a 5px sliver.
//   2. REACHABILITY — every lesson dot's own centre still resolves to the dot.
//      A control is only as big as the part of it nothing else is standing on.
// The reachability pass SCROLLS EACH DOT INTO VIEW FIRST. `elementFromPoint`
// returns null outside the viewport and ~304 of 310 dots are off-viewport at
// 768px, so an unscrolled version of this check fails open just as loudly as
// the box-only version did.
//
// And it runs at TWO zoom stops, because the collision is a function of column
// width: the grip cannot cover a dot's centre unless it is wider than
// `--tl-col / 2`, and `--tl-col` is smallest at the slider's floor. A pass
// taken only at the default column would miss a fix that is a knife edge at
// minimum zoom.
//
// SEEN TO FAIL — both passes, separately:
//   · BOX: run against `.scrollBtn` un-doubled → reports w 5.1, padding 0px,
//     border 0px, background rgba(0,0,0,0) — the audit's number to one decimal.
//   · REACHABILITY: run against `width: var(--tl-grip)` with `--tl-grip: 44px`
//     → reports 15/310 dot centres resolving to "Change how many weeks … runs
//     for" instead of to the lesson.
//
// EMULATION, STATED. Device emulation lies twice: a phone context needs
// isMobile + deviceScaleFactor, and most coarse-pointer emulations silently
// fake a HYBRID (pointer:fine true AND any-pointer:coarse true), which exercises
// a different branch of this stylesheet than a real tablet. So every tier
// re-reads matchMedia in the page and PRINTS what it actually got, and no
// touch-target verdict is issued for a tier whose reading is not what it asked
// for.
//
//   node scripts/probe-plan-timeline-controls.mjs
//
// Env: PROBE_BASE (default http://localhost:3014 — the dev server this repo
// already runs; do NOT start a second one, CLAUDE.md §4b).

import { chromium } from "playwright";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const MIN_TOUCH = 44;

const failures = [];
const fail = (what, detail) => {
  failures.push({ what, detail });
  console.log(`[FAIL] ${what} :: ${JSON.stringify(detail)}`);
};
const pass = (what, detail) =>
  console.log(`[ok]   ${what} :: ${JSON.stringify(detail)}`);
const note = (what, detail) =>
  console.log(`[note] ${what} :: ${JSON.stringify(detail)}`);

const TIERS = [
  // A genuinely COARSE tier: isMobile + hasTouch + a real DSF. The audit
  // verified this combination reports pointer:coarse true / pointer:fine false
  // / hover false — a tablet, not a touchscreen laptop.
  {
    name: "tablet",
    width: 768,
    height: 1024,
    mobile: true,
    touch: true,
    dsf: 2,
    coarse: true,
  },
  // A genuinely FINE tier: no isMobile, no touch, DSF 1.
  {
    name: "desktop",
    width: 1440,
    height: 900,
    mobile: false,
    touch: false,
    dsf: 1,
    coarse: false,
  },
];

/** The five controls the `.cp-root` reset was measured stripping, plus the
 *  properties that prove it is no longer stripping them, plus the USED column
 *  width — the number every grip/dot collision is a function of. */
const MEASURE = `(() => {
  const cls = (frag) => document.querySelector("[class*='timeline_" + frag + "__']");
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      padding: cs.padding,
      borderTopWidth: cs.borderTopWidth,
      background: cs.backgroundColor,
      fontSize: cs.fontSize,
      cursor: cs.cursor,
      inCpRoot: !!el.closest(".cp-root"),
    };
  };
  const day = document.querySelector("[data-tl-day]");
  return {
    // POSITIVE CONTROL, read in the SAME evaluation as everything else: if the
    // surface did not paint, every measurement below is void rather than a pass.
    control: {
      lanes: document.querySelectorAll("[data-lane-subject]").length,
      bandNames: [...document.querySelectorAll("[class*='timeline_bandName__']")]
        .map((n) => (n.textContent || "").trim()).filter(Boolean).length,
      mounted: !!document.querySelector("[data-mounted]"),
    },
    media: {
      pointerCoarse: matchMedia("(pointer: coarse)").matches,
      anyPointerCoarse: matchMedia("(any-pointer: coarse)").matches,
      pointerFine: matchMedia("(pointer: fine)").matches,
      hover: matchMedia("(hover: hover)").matches,
      maxWidth900: matchMedia("(max-width: 900px)").matches,
      maxTouchPoints: navigator.maxTouchPoints,
    },
    // MEASURED, not read: \`--tl-col\` is a max() expression and
    // getPropertyValue returns it as an unparseable string (TimelineCanvas.tsx
    // documents the same trap). A rendered day cell cannot lie about its width.
    colWidth: day ? Math.round(day.getBoundingClientRect().width * 100) / 100 : null,
    scrollBtn: box(document.querySelector('button[aria-label="Scroll back two weeks"]')),
    zoomReset: box(cls("zoomReset")),
    drawerToggle: box(cls("drawerToggle")),
    drawerCount: box(cls("drawerCount")),
    bandGrip: box(document.querySelector('button[aria-label^="Change how many weeks"]')),
    zoomTitle: (document.querySelector("#tl-zoom") || {}).title || null,
  };
})()`;

/**
 * THE REACHABILITY PASS.
 *
 * For every lesson dot on the canvas: scroll it into view, then hit-test NINE
 * points spanning its full width at its own centre line. A dot is reachable
 * only if `document.elementFromPoint` resolves to the dot itself.
 *
 * Blockers are classified rather than merely counted, because they are not
 * equivalent. The pinned subject-label column is `position: sticky` and WILL
 * cover a dot the scroller cannot centre (the first and last few slots), which
 * is a scroll artefact and not a defect. A resize grip standing on a dot is the
 * defect. Only the second fails.
 */
const REACH = `(() => {
  const dots = [...document.querySelectorAll("[data-lane-subject] button[class*='timeline_dot__']")]
    .filter((d) => !/legendDot|rowDot/.test(d.className));
  const SAMPLES = 9;
  let centreOk = 0, centreByGrip = 0, centreByOther = 0, unmeasurable = 0;
  let worstGripFraction = 0, worstGripDot = null;
  const gripVictims = [];
  for (const d of dots) {
    // MUST scroll first — elementFromPoint is viewport-relative and returns
    // null for anything outside it, which would make this whole pass a
    // fails-open no-op for the ~98% of dots that start off-screen.
    d.scrollIntoView({ block: "center", inline: "center" });
    const r = d.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) { unmeasurable++; continue; }
    const y = r.top + r.height / 2;
    let blockedByGrip = 0;
    let centreHit = null;
    for (let i = 0; i < SAMPLES; i++) {
      const x = r.left + 1 + ((r.width - 2) * i) / (SAMPLES - 1);
      const el = document.elementFromPoint(x, y);
      const ours = el && (el === d || d.contains(el));
      const isGrip = el && el.closest && el.closest('button[aria-label^="Change how many weeks"]');
      if (!ours && isGrip) blockedByGrip++;
      if (i === (SAMPLES - 1) / 2) centreHit = { ours, isGrip: !!isGrip, what: el ? (el.getAttribute("aria-label") || el.className || el.tagName) : null };
    }
    const frac = blockedByGrip / SAMPLES;
    if (frac > worstGripFraction) {
      worstGripFraction = frac;
      worstGripDot = { dot: d.getAttribute("aria-label"), gripSamples: blockedByGrip };
    }
    if (blockedByGrip > 0) gripVictims.push({ dot: d.getAttribute("aria-label"), gripSamples: blockedByGrip });
    if (centreHit && centreHit.ours) centreOk++;
    else if (centreHit && centreHit.isGrip) { centreByGrip++; if (!worstGripDot) worstGripDot = centreHit; }
    else centreByOther++;
  }
  return {
    dots: dots.length,
    unmeasurable,
    centreOk,
    centreBlockedByGrip: centreByGrip,
    centreBlockedByOther: centreByOther,
    dotsTouchedByGripAtAll: gripVictims.length,
    worstGripCoverage: Math.round(worstGripFraction * 100) + "%",
    worstCase: worstGripDot,
    sampleVictims: gripVictims.slice(0, 5),
  };
})()`;

/** Force the canvas to the slider's floor. `--tl-col` resolves as
 *  `max(--tl-col-floor, --tl-col-user)`, so writing an absurdly small user
 *  value parks it exactly on the floor — the narrowest column a teacher can
 *  reach, and the worst case for any grip/dot collision. */
const ZOOM_TO_FLOOR = `(() => {
  const card = document.querySelector("[data-lens]");
  if (!card) return false;
  card.style.setProperty("--tl-col-user", "16px");
  return true;
})()`;
const ZOOM_RESET = `(() => {
  const card = document.querySelector("[data-lens]");
  if (card) card.style.removeProperty("--tl-col-user");
  return true;
})()`;

const browser = await chromium.launch({ channel: "chrome" });

// ── WARM-UP, and why it is not optional ───────────────────────────────────
// A dev server compiles the CSS module on FIRST REQUEST. Running this probe
// straight after editing timeline.module.css therefore measured TWO DIFFERENT
// STYLESHEETS in one run: the first tier loaded before the rebuild finished and
// reported the old geometry, the second loaded after and reported the new one —
// so the run said "tablet fine, desktop broken" about a single global rule.
// Observed, not theorised, during this file's own seen-to-fail check. One
// throwaway load forces the compile before anything is measured.
// Best-effort, and NEVER fatal: this repo's dev server is shared with several
// concurrent probe lanes and the login hop can time out under that load. A
// warm-up that throws would abort a run that could still have measured both
// tiers — and the per-tier CSS-staleness it guards against is caught anyway by
// the invariant assertions below.
try {
  const warm = await browser.newContext();
  await bypassLogin(warm, {
    base: BASE,
    next: "/planner",
    retries: 3,
    timeout: 120000,
  });
  const wp = await warm.newPage();
  await wp
    .goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 120000 })
    .catch(() => {});
  await wp
    .waitForSelector("[data-lane-subject]", { timeout: 120000 })
    .catch(() => {});
  await warm.close();
  note("warm-up", {
    why: "forced the dev server to compile the CSS before any tier measured it",
  });
} catch (e) {
  note("warm-up SKIPPED", {
    error: String(e).split("\n")[0].slice(0, 160),
    consequence:
      "the first tier may measure a stale stylesheet; the per-tier invariant assertions still catch it",
  });
}

const measured = [];

for (const tier of TIERS) {
  // A TIER THAT COULD NOT BE SET UP IS A TIER THAT WAS NOT MEASURED, and it has
  // to be recorded as such. This loop used to let a `bypassLogin` timeout throw
  // straight out of the script — which under `node probe.mjs | tail` exits 0
  // from the PIPELINE and prints a partial log whose last line is a row of
  // `[ok]`s. That reads exactly like a pass for the tier that never ran.
  try {
    await runTier(tier);
    measured.push(tier.name);
  } catch (e) {
    fail(`${tier.name} SETUP`, {
      why: "the tier never reached a measurable state — NOT a pass, and no verdict is issued for it",
      error: String(e).split("\n")[0].slice(0, 200),
    });
  }
}

async function runTier(tier) {
  const ctx = await browser.newContext({
    viewport: { width: tier.width, height: tier.height },
    isMobile: tier.mobile,
    hasTouch: tier.touch,
    deviceScaleFactor: tier.dsf,
  });
  await bypassLogin(ctx, {
    base: BASE,
    next: "/planner",
    retries: 2,
    timeout: 120000,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/planner`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.waitForSelector("[data-lane-subject]", { timeout: 120000 });
  // A PURE wait on the mount seam, not a retried click: `[data-mounted]` being
  // present IS the proof that post-mount effects ran. The audit's click-gated
  // probes took ten minutes or never finished; this one completes in about one.
  await page
    .waitForSelector("[data-mounted]", { timeout: 120000 })
    .catch(() => {});

  // The resize grip exists ONLY in Team Curriculum mode (PlanTimeline.tsx:383),
  // so it has to be flipped before the grip can be measured — and the flip has
  // to be SEEN to have landed, or "grip: null" is a failed control masquerading
  // as a finding (the audit lost a whole pass to exactly that).
  let teamFlipped = false;
  for (let i = 0; i < 25 && !teamFlipped; i++) {
    await page
      .getByRole("button", { name: "Team Curriculum", exact: true })
      .first()
      .click({ timeout: 5000 })
      .catch(() => {});
    await page.waitForTimeout(600);
    teamFlipped = await page.evaluate(
      () =>
        document
          .querySelector('button[aria-label="Team Curriculum"]')
          ?.getAttribute("aria-pressed") === "true",
    );
    if (!teamFlipped) {
      await page
        .getByRole("button", { name: /^Got it/i })
        .first()
        .click({ timeout: 2000 })
        .catch(() => {});
    }
  }
  await page.waitForTimeout(800);

  // A string handed to `page.evaluate` is evaluated as an EXPRESSION, not
  // called — so MEASURE is written as an IIFE. (Passing `() => {…}` as a string
  // returns the function object, which serialises to `undefined`: measured.)
  // No `new Function` and no interpolation — MEASURE is a fixed literal above.
  const m = await page.evaluate(MEASURE);
  note(`${tier.name} emulation reported by the PAGE`, m.media);
  note(`${tier.name} control`, m.control);
  note(`${tier.name} team mode flipped`, teamFlipped);
  note(`${tier.name} used day column`, { colWidth: m.colWidth });

  if (!(m.control.lanes > 0 && m.control.bandNames > 0)) {
    fail(`${tier.name} POSITIVE CONTROL`, {
      why: "the timeline did not paint — every measurement on this tier is VOID, not a pass",
      control: m.control,
    });
    await ctx.close();
    return;
  }
  if (!teamFlipped) {
    fail(`${tier.name} TEAM MODE`, {
      why: "the Personal/Team switch never flipped — the grip is absent in Personal mode, so every grip reading below would be a failed control, not a finding",
    });
    await ctx.close();
    return;
  }
  // The tier must be the tier it asked for. A hybrid reading here would mean
  // the coarse branch was never exercised, and a 44px verdict from it is a lie.
  if (
    tier.coarse &&
    !(m.media.pointerCoarse && !m.media.pointerFine && !m.media.hover)
  ) {
    fail(`${tier.name} EMULATION`, {
      why: "asked for a coarse-only pointer and got a hybrid — no touch-target verdict is issued from this run",
      media: m.media,
    });
    await ctx.close();
    return;
  }
  if (!tier.coarse && !m.media.pointerFine) {
    fail(`${tier.name} EMULATION`, {
      why: "asked for a fine pointer, did not get one",
      media: m.media,
    });
    await ctx.close();
    return;
  }

  /* ── PASS 1 — each control's own box ──────────────────────────────────── */
  const CONTROLS = [
    "scrollBtn",
    "zoomReset",
    "drawerToggle",
    "drawerCount",
    "bandGrip",
  ];
  for (const name of CONTROLS) {
    const b = m[name];
    if (!b) {
      fail(`${tier.name} ${name}`, { why: "not present — cannot be measured" });
      continue;
    }
    note(`${tier.name} ${name}`, b);

    // FINDING #1 — the reset stripped padding / border / background. These are
    // the exact properties the audit measured as lost. `bandGrip` is a
    // deliberate no-chrome control (it is a bare edge handle), so for it the
    // reset's casualty was the CURSOR, and that is what is asserted instead.
    if (name === "bandGrip") {
      if (b.cursor !== "ew-resize") {
        fail(`${tier.name} bandGrip cursor`, {
          got: b.cursor,
          want: "ew-resize",
        });
      } else pass(`${tier.name} bandGrip cursor`, { cursor: b.cursor });

      // THE GRIP HAS ITS OWN CONTRACT, and it is NOT ≥44px — it cannot be.
      // A band's right edge is exactly `--tl-col / 2` from its last lesson
      // dot's centre (TimelineLaneRow.tsx:210,304), so any grip wider than
      // half a column swallows that lesson. The stylesheet caps it; this
      // asserts the cap is in force, from the other side.
      const cap = m.colWidth / 2;
      if (b.w >= cap) {
        fail(`${tier.name} bandGrip width`, {
          w: b.w,
          cap,
          why: "wider than half a column — it necessarily covers the last lesson dot's centre",
        });
      } else if (b.w < 8) {
        fail(`${tier.name} bandGrip width`, {
          w: b.w,
          why: "collapsed to a sliver — the cap is meant to bound it, not erase it",
        });
      } else {
        pass(`${tier.name} bandGrip width`, { w: b.w, capExclusive: cap });
      }
      note(`${tier.name} bandGrip DOES NOT meet the 44px contract`, {
        w: b.w,
        max: cap,
        why: "44px here costs a lesson dot; see the proof in timeline.module.css and the report",
      });
      continue;
    }

    if (parseFloat(b.borderTopWidth) <= 0) {
      fail(`${tier.name} ${name} border`, {
        got: b.borderTopWidth,
        want: ">0px (the stylesheet asks for 1px)",
      });
    }
    if (/rgba\(0, 0, 0, 0\)/.test(b.background)) {
      fail(`${tier.name} ${name} background`, {
        got: b.background,
        want: "var(--surface), not transparent",
      });
    }
    if (b.padding === "0px") {
      fail(`${tier.name} ${name} padding`, {
        got: b.padding,
        want: "non-zero (the stylesheet asks for 0 9px / 0 10px)",
      });
    }

    if (tier.coarse) {
      const short = Math.min(b.w, b.h);
      if (short < MIN_TOUCH) {
        fail(`${tier.name} ${name} touch target`, {
          w: b.w,
          h: b.h,
          want: `>=${MIN_TOUCH}px on both axes`,
        });
      } else pass(`${tier.name} ${name} touch target`, { w: b.w, h: b.h });
    } else {
      // Desktop has no 44px contract, but a control that computes to 5px is
      // not a control. The threshold is deliberately loose — this is a
      // regression tripwire for "the reset ate the box", not a design spec.
      if (b.w < 10 || b.h < 10) {
        fail(`${tier.name} ${name} size`, {
          w: b.w,
          h: b.h,
          want: ">=10px on both axes (5.1px was the shipped defect)",
        });
      } else pass(`${tier.name} ${name} size`, { w: b.w, h: b.h });
    }
  }

  /* ── PASS 2 — reachability, at the default column AND at the floor ────── */
  for (const stop of ["default", "floor"]) {
    if (stop === "floor") {
      await page.evaluate(ZOOM_TO_FLOOR);
      await page.waitForTimeout(400);
    }
    const col = await page.evaluate(
      `(() => { const d = document.querySelector("[data-tl-day]"); return d ? Math.round(d.getBoundingClientRect().width * 100) / 100 : null; })()`,
    );
    const r = await page.evaluate(REACH);
    note(`${tier.name} reachability @${stop} (col ${col}px)`, r);

    if (r.dots === 0) {
      fail(`${tier.name} reachability @${stop}`, {
        why: "no lesson dots found — this pass would otherwise report a vacuous 0 blocked",
      });
    } else if (r.centreBlockedByGrip > 0) {
      fail(`${tier.name} reachability @${stop}`, {
        centreBlockedByGrip: r.centreBlockedByGrip,
        of: r.dots,
        worstCase: r.worstCase,
        why: "a lesson dot's own centre resolves to the resize grip — that lesson cannot be opened by pointer",
      });
    } else {
      pass(`${tier.name} reachability @${stop}`, {
        centreOk: r.centreOk,
        of: r.dots,
        dotsTouchedByGripAtAll: r.dotsTouchedByGripAtAll,
        worstGripCoverage: r.worstGripCoverage,
        colWidth: col,
      });
    }
    if (r.centreBlockedByOther > 0) {
      // NOT a failure: the pinned subject-label column is sticky and covers the
      // handful of dots the scroller cannot centre. Reported so the number is
      // never mistaken for a clean sweep.
      note(
        `${tier.name} reachability @${stop} — centres blocked by NON-grip chrome`,
        {
          count: r.centreBlockedByOther,
          expected:
            "the sticky lane-label column, for slots at the very ends of the axis",
        },
      );
    }
    if (stop === "floor") await page.evaluate(ZOOM_RESET);
  }

  /* ── FINDING #3/#4 — the copy the teacher actually sees ───────────────── */
  const t = m.zoomTitle ?? "";
  // Asserted as a WHOLE STRING. Checking only the opening clause is how the
  // first correction shipped with a second false promise ("and to tap") in its
  // unread half.
  const WANT =
    "Sets how much of the year fits on screen. Narrow to take in more months at once; widen to spread the days out so individual lessons are easier to tell apart.";
  if (/Lesson titles appear/.test(t)) {
    fail(`${tier.name} zoom tooltip`, {
      got: t,
      why: "still promises a feature no zoom level produces",
    });
  } else if (/to tap/.test(t)) {
    fail(`${tier.name} zoom tooltip`, {
      got: t,
      why: "claims widening enlarges a lesson's target; a dot's target is --tl-hit and is independent of --tl-col",
    });
  } else if (t !== WANT) {
    fail(`${tier.name} zoom tooltip`, {
      got: t,
      want: WANT,
      why: "not the verified copy — every clause has to be one the surface keeps",
    });
  } else pass(`${tier.name} zoom tooltip`, { title: t });

  await ctx.close();
}

await browser.close();

console.log("\n" + "=".repeat(60));
// Which tiers actually produced readings, printed BEFORE the verdict. A run
// that lost a tier to a dev-server timeout must never be readable as a clean
// sweep of both.
console.log(
  `TIERS MEASURED: ${measured.join(", ") || "NONE"} (of ${TIERS.map((t) => t.name).join(", ")})`,
);
if (measured.length !== TIERS.length) {
  fail("COVERAGE", {
    measured,
    of: TIERS.map((t) => t.name),
    why: "a tier produced no readings — the run is incomplete, not passing",
  });
}
if (failures.length === 0) {
  console.log("PROBE PASSED —");
  console.log("  · the five reset-exposed controls carry their chrome;");
  console.log(
    "  · the four chrome buttons meet >=44px on a genuinely coarse pointer;",
  );
  console.log(
    "  · every lesson dot's centre still resolves to the lesson, at BOTH",
  );
  console.log("    the default column and the zoom floor;");
  console.log("  · the zoom tooltip matches the verified copy exactly.");
  console.log(
    "  NOTE: the band resize grip is capped BELOW 44px on purpose — see",
  );
  console.log("  the [note] lines above and the proof in timeline.module.css.");
} else {
  console.log(`PROBE FAILED — ${failures.length} finding(s):`);
  for (const f of failures)
    console.log(`  · ${f.what} :: ${JSON.stringify(f.detail)}`);
}
process.exit(failures.length === 0 ? 0 : 1);
