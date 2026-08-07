// Does deleting `animation: accentcycle` off `:root` actually cost the main
// thread anything? Measure it — do not assert it.
//
// ── THE DESIGN, AND WHY IT IS THIS SHAPE ─────────────────────────────────────
// Two separate runs (one per git state) would let dev-server compile noise,
// route data drift and machine load swamp a difference this size. This repo has
// already been burnt by exactly that: a browser A/B once reported the OPPOSITE
// of the truth because shared noise was not cancelled. So:
//
//   • ONE page load, ONE dev-server state, ONE hydration.
//   • The animation is toggled AT RUNTIME by adding/removing a <style> element
//     that re-adds the deleted declaration. "OFF" is the shipped code; "ON" is
//     the pre-change behaviour reconstructed on the same page.
//   • Windows are INTERLEAVED (off, on, off, on, …) so any monotonic drift —
//     a chunk compiling, a GC, the fan spinning up — lands in both arms.
//   • The metric is CDP `Performance.getMetrics`, sampled as a delta across a
//     fixed wall-clock window. RecalcStyleCount/Duration is the counter that
//     the hypothesis actually predicts: animating a REGISTERED, INHERITED custom
//     property on <html> re-resolves the inherited cascade document-wide.
//
// ── THE INSTRUMENT MUST BE ABLE TO FAIL ──────────────────────────────────────
// Every guard below aborts rather than reporting a number it did not earn:
//   1. If the shipped page already animates --accent, the premise is wrong.
//   2. If injecting the style does NOT make <html>'s animation-name become
//      `accentcycle`, the injection missed (specificity / reduced-motion) and
//      every "ON" number would be a duplicate of "OFF" — reported as a NULL
//      RESULT, never as "no regression found".
//   3. If --accent does not actually CHANGE VALUE across an ON window, the
//      keyframes are not running and the same is true. This is the load-bearing
//      check: it proves the storm, not just the CSS.
//   4. If the page never hydrates (gated on a client-only signal, never a
//      timer), abort — dev hydration here runs 5–30s.

import { chromium } from "playwright";
import { bypassLogin } from "../lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const ROUTE = process.env.PROBE_ROUTE ?? "/weekly";
const WINDOW_MS = Number(process.env.PROBE_WINDOW_MS ?? 8000);
const PAIRS = Number(process.env.PROBE_PAIRS ?? 3);

const INJECTED_CSS = `
:root[data-theme="clear"][data-bg="photo"] {
  animation: accentcycle 52s ease-in-out infinite;
}`;

function die(msg) {
  console.error(`\nABORT — ${msg}`);
  console.error("No number is reported. An honest null beats a fabricated one.");
  process.exitCode = 2;
}

async function metrics(cdp) {
  const { metrics: m } = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(m.map((e) => [e.name, e.value]));
}

const main = async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // EXPLICIT, not inherited from the machine. themes.css suppresses the
    // accent cycle (and the stage drift) under `prefers-reduced-motion: reduce`,
    // so a host that happens to prefer reduced motion would silently null the
    // "ON" arm and the A/B would read as "no difference".
    reducedMotion: "no-preference",
  });

  // TWO JOBS, ONE ROUTE HANDLER.
  //
  // (1) SAFETY. localhost points at PRODUCTION Supabase and theme-sync WRITES
  //     teacher_preferences, so anything that would MUTATE the shared bypass
  //     account's appearance is aborted. (Guard from shot-colours.mjs.)
  //
  // (2) CORRECTNESS, and this one was found the hard way. The GET is answered
  //     with an EMPTY result instead of being passed through. The shared bypass
  //     account currently has theme=mint / bg=wash persisted, and the provider
  //     applies that a few seconds AFTER hydration — so a probe that gated on
  //     hydration alone measured a page that then silently flipped off the
  //     `[data-theme="clear"][data-bg="photo"]` selector under test, and the
  //     injected rule stopped matching. The first run of this probe aborted on
  //     exactly that (animation-name=none after a valid injection).
  //     An empty preferences row IS the default appearance — Clear · Photo,
  //     `DEFAULT_THEME`/`DEFAULT_BG` in lib/theme-values.ts — which is precisely
  //     the appearance this measurement is about. Nothing is faked: the page
  //     renders the real default, it just isn't handed another teacher's saved
  //     choice mid-measurement.
  await context.route("**/rest/v1/teacher_preferences**", (route) => {
    const m = route.request().method();
    if (m === "GET" || m === "HEAD") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "[]",
      });
    }
    console.log(`  (blocked a ${m} to teacher_preferences)`);
    return route.abort();
  });

  const page = await context.newPage();
  await bypassLogin(context, { base: BASE, next: ROUTE, retries: 2 });
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded" });

  // GATE 4 — a CLIENT-ONLY signal, never a fixed timer. <DenseRouteFlag> writes
  // data-dense from a mount effect, so its presence proves React hydrated. On
  // /home (the one cinematic route) it is deliberately absent, which is why this
  // probe runs on a dense route.
  try {
    await page.waitForFunction(
      () => document.documentElement.dataset.dense === "1",
      null,
      { timeout: 120000 },
    );
  } catch {
    await browser.close();
    return die(
      `page never hydrated on ${ROUTE} (no <html data-dense="1"> after 120s)`,
    );
  }

  const nodeCount = await page.evaluate(
    () => document.querySelectorAll("*").length,
  );
  const glassCount = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll("*")).filter((el) => {
        const s = getComputedStyle(el);
        const b = s.backdropFilter || s.webkitBackdropFilter;
        return b && b !== "none";
      }).length,
  );
  console.log(`route ${ROUTE} · ${nodeCount} nodes · ${glassCount} backdrop-filter surfaces`);

  const animName = () =>
    page.evaluate(() => getComputedStyle(document.documentElement).animationName);
  const accent = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--accent")
        .trim(),
    );

  const axes = () =>
    page.evaluate(() => {
      const d = document.documentElement;
      return `${d.getAttribute("data-theme")}/${d.getAttribute("data-bg")}`;
    });

  // Let any post-hydration preference sync land BEFORE the axis gate below, so
  // the gate sees the settled appearance rather than the pre-sync one.
  await page.waitForTimeout(4000);

  // GATE 0 — the page must actually be in the appearance under test. Without
  // this the injected `[data-theme="clear"][data-bg="photo"]` rule can stop
  // matching mid-run and every ON window silently becomes a second OFF window.
  const restingAxes = await axes();
  if (restingAxes !== "clear/photo") {
    await browser.close();
    return die(
      `page is on ${restingAxes}, not the default clear/photo. The selector ` +
        `under test does not match, so nothing measured here would be about ` +
        `the default appearance.`,
    );
  }
  console.log(`appearance: ${restingAxes} (the default)`);

  // GATE 1 — the shipped page must NOT be animating --accent.
  const restingAnim = await animName();
  if (restingAnim.includes("accentcycle")) {
    await browser.close();
    return die(
      `the shipped page still animates --accent (animation-name=${restingAnim}). ` +
        `Task 1 did not land, or the dev server is serving a stale themes.css.`,
    );
  }
  console.log(`resting <html> animation-name: ${restingAnim}`);

  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");

  const setInjected = async (on) => {
    await page.evaluate(
      ({ on, css }) => {
        const ID = "perf-accent-storm";
        const prev = document.getElementById(ID);
        if (prev) prev.remove();
        if (on) {
          const el = document.createElement("style");
          el.id = ID;
          el.textContent = css;
          document.head.appendChild(el);
        }
        // A reload/HMR-remount tripwire — see `assertLive` below.
        window.__perfMarker = "alive";
      },
      { on, css: INJECTED_CSS },
    );
    // One frame for the style to apply and the animation to start ticking.
    await page.waitForTimeout(250);
    // Verify IMMEDIATELY, not 8s later. This repo shares one checkout with
    // several concurrent lanes behind one dev server, so a sibling's save can
    // trigger a Fast-Refresh reload mid-window that silently drops the injected
    // <style>. Checking here separates "the injection never worked" (a real
    // instrument failure) from "the page reloaded under us" (retryable noise).
    const got = await animName();
    const wanted = on ? "accentcycle" : "none";
    if (on ? !got.includes(wanted) : got.includes("accentcycle")) {
      throw new Error(
        `setInjected(${on}) did not take: animation-name=${got}, wanted ${wanted}`,
      );
    }
  };

  /** Throws if the page reloaded since the last setInjected() — which would
   *  invalidate the window that just ran (different DOM, fresh compile, and the
   *  injected style gone). Better to abort than to average across a reload. */
  const assertLive = async (where) => {
    const alive = await page.evaluate(() => window.__perfMarker === "alive");
    if (!alive) {
      throw new Error(
        `the page reloaded during ${where} (dev-server HMR from a concurrent ` +
          `lane). The window is invalid — re-run when the checkout is quiet.`,
      );
    }
    // The axes must ALSO still hold: a late preference sync flipping the page
    // off clear/photo mid-window would leave the injected rule matching nothing
    // while every other guard stayed green.
    const now = await axes();
    if (now !== "clear/photo") {
      throw new Error(
        `appearance changed to ${now} during ${where}; the window is invalid.`,
      );
    }
  };

  const runWindow = async (label) => {
    const before = await metrics(cdp);
    const accentStart = await accent();

    // ── INDEPENDENT CROSS-CHECK ───────────────────────────────────────────
    // CDP's RecalcStyleDuration is one instrument, and this repo's standing
    // lesson is that a verification instrument can fail open. So the same
    // window is ALSO measured by something with no shared machinery: a plain
    // requestAnimationFrame counter, plus the longest gap between consecutive
    // frames. If the main thread really is saturated by style recalculation,
    // frame throughput must collapse and the worst gap must blow out. If CDP
    // reports a catastrophe and rAF reports a smooth 60fps, ONE of them is
    // lying and the result must not be reported.
    const frames = await page.evaluate(
      (ms) =>
        new Promise((resolve) => {
          let n = 0;
          let worst = 0;
          let last = performance.now();
          const t0 = last;
          const tick = (now) => {
            n += 1;
            worst = Math.max(worst, now - last);
            last = now;
            if (now - t0 < ms) requestAnimationFrame(tick);
            else resolve({ n, worst, elapsed: now - t0 });
          };
          requestAnimationFrame(tick);
        }),
      WINDOW_MS,
    );

    const accentEnd = await accent();
    const after = await metrics(cdp);
    return {
      label,
      recalcCount: after.RecalcStyleCount - before.RecalcStyleCount,
      recalcMs: (after.RecalcStyleDuration - before.RecalcStyleDuration) * 1000,
      layoutCount: after.LayoutCount - before.LayoutCount,
      taskMs: (after.TaskDuration - before.TaskDuration) * 1000,
      threadMs: (after.ThreadTime - before.ThreadTime) * 1000,
      fps: (frames.n / frames.elapsed) * 1000,
      worstFrameMs: frames.worst,
      accentStart,
      accentEnd,
      accentMoved: accentStart !== accentEnd,
    };
  };

  // GATE 2 lives inside setInjected() — it verifies immediately, so a bad
  // injection can never be averaged in as a silent duplicate of the OFF arm.
  const rows = [];
  try {
    for (let i = 0; i < PAIRS; i += 1) {
      await setInjected(false);
      rows.push(await runWindow("OFF (shipped)"));
      await assertLive("an OFF window");
      await setInjected(true);
      rows.push(await runWindow("ON  (pre-change)"));
      await assertLive("an ON window");
    }
    await setInjected(false);
  } catch (err) {
    await browser.close();
    return die(String(err.message ?? err));
  }
  await cdp.detach();

  // GATE 3 — the storm must be demonstrably RUNNING in the ON arm.
  const onRows = rows.filter((r) => r.label.startsWith("ON"));
  if (!onRows.some((r) => r.accentMoved)) {
    await browser.close();
    return die(
      `--accent never changed value across any ON window ` +
        `(${onRows.map((r) => `${r.accentStart}→${r.accentEnd}`).join(", ")}). ` +
        `The keyframes are not ticking, so the ON arm is not the pre-change ` +
        `behaviour and the comparison is meaningless.`,
    );
  }

  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const arm = (p) => rows.filter((r) => r.label.startsWith(p));
  const off = arm("OFF");
  const onA = arm("ON");

  console.log(
    `\nwindows: ${PAIRS} pairs × ${WINDOW_MS}ms, interleaved OFF/ON/OFF/ON…\n`,
  );
  console.log(
    ["window", "recalc×", "recalcMs", "taskMs", "fps", "worstFrame", "--accent moved"]
      .map((s) => s.padEnd(14))
      .join(""),
  );
  for (const r of rows) {
    console.log(
      [
        r.label,
        String(r.recalcCount),
        r.recalcMs.toFixed(0),
        r.taskMs.toFixed(0),
        r.fps.toFixed(1),
        `${r.worstFrameMs.toFixed(0)}ms`,
        r.accentMoved ? "yes" : "no",
      ]
        .map((s) => String(s).padEnd(14))
        .join(""),
    );
  }

  // The two instruments must AGREE on the direction. A CDP catastrophe next to
  // an unbothered 60fps would mean one of them is measuring the wrong thing.
  const meanOf = (xs, k) => xs.reduce((a, b) => a + b[k], 0) / xs.length;
  const offFps = meanOf(rows.filter((r) => r.label.startsWith("OFF")), "fps");
  const onFps = meanOf(rows.filter((r) => r.label.startsWith("ON")), "fps");
  const offRecalc = meanOf(rows.filter((r) => r.label.startsWith("OFF")), "recalcMs");
  const onRecalc = meanOf(rows.filter((r) => r.label.startsWith("ON")), "recalcMs");
  const cdpSaysWorse = onRecalc > offRecalc * 2 + 50;
  const rafSaysWorse = onFps < offFps * 0.8;
  if (cdpSaysWorse !== rafSaysWorse) {
    console.log(
      `\n⚠ INSTRUMENTS DISAGREE — CDP says ${cdpSaysWorse ? "worse" : "no worse"}, ` +
        `rAF says ${rafSaysWorse ? "worse" : "no worse"} ` +
        `(fps ${offFps.toFixed(1)}→${onFps.toFixed(1)}, recalc ${offRecalc.toFixed(0)}→${onRecalc.toFixed(0)}ms). ` +
        `Treat this run as UNTRUSTWORTHY and do not quote either number.`,
    );
  } else {
    console.log(
      `\n✓ instruments agree (fps ${offFps.toFixed(1)}→${onFps.toFixed(1)}, ` +
        `recalc ${offRecalc.toFixed(0)}→${onRecalc.toFixed(0)}ms per window)`,
    );
  }

  const summary = {
    route: ROUTE,
    nodeCount,
    glassCount,
    windowMs: WINDOW_MS,
    pairs: PAIRS,
    off: {
      recalcCount: mean(off.map((r) => r.recalcCount)),
      recalcMs: mean(off.map((r) => r.recalcMs)),
      taskMs: mean(off.map((r) => r.taskMs)),
    },
    on: {
      recalcCount: mean(onA.map((r) => r.recalcCount)),
      recalcMs: mean(onA.map((r) => r.recalcMs)),
      taskMs: mean(onA.map((r) => r.taskMs)),
    },
  };
  console.log(`\nMEAN per ${WINDOW_MS}ms window`);
  console.log(
    `  OFF (shipped)    recalc ${summary.off.recalcCount.toFixed(1)}× / ${summary.off.recalcMs.toFixed(1)}ms   task ${summary.off.taskMs.toFixed(1)}ms`,
  );
  console.log(
    `  ON  (pre-change) recalc ${summary.on.recalcCount.toFixed(1)}× / ${summary.on.recalcMs.toFixed(1)}ms   task ${summary.on.taskMs.toFixed(1)}ms`,
  );
  console.log(`\nJSON ${JSON.stringify(summary)}`);

  await browser.close();
};

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
