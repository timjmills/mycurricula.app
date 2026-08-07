// probe-f0-week-radio.mjs — live verification for the Week view-toggle honesty
// fix (docs/qa/2026-08-02-week.md MAJOR 1).
//
// THE CLAIM UNDER TEST: below 600px the header toggle must not report a mode
// the canvas is not in. Before the fix it reported the stored "grid" while
// WeeklyList rendered — aria-checked="true" on a segment that did nothing when
// pressed.
//
// ── The trap this probe is built around ───────────────────────────────────
// `usePhoneViewport()` and `isNarrow` BOTH default to false on the server, so
// the FIRST PAINT is the desktop branch at every width, by construction. A
// fixed wait therefore measures the SSR output and reports the fix as absent —
// the exact false critical the 2026-08-02 pass documents. Every read here is
// gated on a post-hydration-only signal:
//
//   • widths < 900px — the SCHEDULE radio has DISAPPEARED. Only the client-side
//     900px media query removes it, so its absence cannot be an SSR artifact.
//     Schedule is gated by a DIFFERENT query (900) than the thing under test
//     (600) and predates this change, so it is an independent gate, not a
//     tautology. Gating on "Grid is gone" would assert the fix with itself.
//   • the resize case — the CANVAS becoming a week grid. That is driven by
//     `showList` in WeeklyShell, a different code path from the control, so it
//     stays an independent signal for a claim about the control.
//
// Absence assertions FAIL OPEN, so "no Grid option at 375" is paired IN THE
// SAME RUN with "Grid option present at 600/768" — the positive control that
// makes the absence mean something.
//
// Run: node scripts/probe-f0-week-radio.mjs   (dev server already on 3014)
// Exits non-zero if any check fails.

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const SHOTS = "docs/screenshots/f0-week-radio";
const OUT = process.env.PROBE_OUT ?? SHOTS;
mkdirSync(SHOTS, { recursive: true });

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const note = (m) => console.log(`      · ${m}`);

const consoleLog = [];
const attach = (page, tag) => {
  page.on("console", (m) => {
    const t = m.type();
    if (t === "error" || t === "warning")
      consoleLog.push({ tag, type: t, text: m.text().slice(0, 300) });
  });
  page.on("pageerror", (e) =>
    consoleLog.push({ tag, type: "pageerror", text: String(e).slice(0, 300) }),
  );
};

// ── What the page can tell us, in one read ────────────────────────────────
const READ = `(() => {
  const group = document.querySelector('[role="radiogroup"][aria-label="Weekly view mode"]');
  const radios = group
    ? Array.from(group.querySelectorAll('[role="radio"]')).map((el) => {
        const r = el.getBoundingClientRect();
        return {
          label: (el.textContent || "").trim(),
          checked: el.getAttribute("aria-checked"),
          w: Math.round(r.width),
          h: Math.round(r.height),
          cx: Math.round(r.left + r.width / 2),
          cy: Math.round(r.top + r.height / 2),
        };
      })
    : null;

  // Which canvas actually mounted. Each is named by its own aria-label, so this
  // reads the app's own accessible identity rather than a private class name.
  const has = (sel) => document.querySelector(sel) !== null;
  const canvas = has('[role="main"][aria-label="Weekly plan — list view"]')
    ? "list"
    : has('[aria-label^="Weekly plan by period"]') ||
      has('[aria-label^="Weekly plan by day"]') ||
      has('[aria-label^="Weekly plan by subject"]')
    ? "grid"
    : has('[data-pane="grid"]')
    ? "other"
    : "none";

  return { radios, canvas, width: window.innerWidth };
})()`;

const read = (page) => page.evaluate(READ);

/** Poll until `pred(state)` or the budget runs out. Never a fixed wait. */
async function until(page, pred, { budgetMs = 120000, label = "" } = {}) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < budgetMs) {
    last = await read(page);
    if (pred(last)) return { ok: true, ms: Date.now() - t0, state: last };
    await page.waitForTimeout(400);
  }
  return { ok: false, ms: Date.now() - t0, state: last, label };
}

const labels = (s) => (s.radios ?? []).map((r) => r.label);
const checked = (s) => (s.radios ?? []).filter((r) => r.checked === "true").map((r) => r.label);

/** Hydration gate for any width below 900px: the Schedule option is gone. */
const hydrated = (s) => s.radios !== null && !labels(s).includes("Schedule");

/**
 * Hit-test the ≥44px inflated touch target. The visible chip is ~26px tall and
 * ToggleGroup inflates the hit area with an absolutely-positioned ::before
 * (`any-pointer: coarse`), which getBoundingClientRect cannot see — so this
 * asks the DOM what is actually at the point, 20px above and below centre.
 */
async function touchOk(page, radio) {
  return page.evaluate(
    ({ cx, cy, label }) => {
      const inside = (el) => {
        for (let n = el; n; n = n.parentElement) {
          if (
            n.getAttribute &&
            n.getAttribute("role") === "radio" &&
            (n.textContent || "").trim() === label
          )
            return true;
        }
        return false;
      };
      const at = (y) => {
        const el = document.elementFromPoint(cx, y);
        return el ? inside(el) : false;
      };
      return { centre: at(cy), up: at(cy - 20), down: at(cy + 20) };
    },
    { cx: radio.cx, cy: radio.cy, label: radio.label },
  );
}

const makeCtx = async (browser, { width, height = 820, touch = true, dsf = 2 }) =>
  browser.newContext({
    viewport: { width, height },
    ...(touch
      ? { isMobile: true, hasTouch: true, deviceScaleFactor: dsf }
      : { deviceScaleFactor: 1 }),
  });

const evidence = {};

async function scenario(browser, { width, tag, touch = true }) {
  const ctx = await makeCtx(browser, { width, touch });
  await bypassLogin(ctx, { base: BASE, next: "/weekly" });
  const page = await ctx.newPage();
  attach(page, tag);
  await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });

  const gate = await until(page, hydrated, { label: `${tag} hydration` });
  if (!gate.ok) {
    ok(`${tag}: reached post-hydration state`, false,
       `Schedule radio still present after ${Math.round(gate.ms / 1000)}s — every reading below would be the SSR desktop branch, so nothing is asserted`);
    await page.screenshot({ path: `${SHOTS}/${tag}-TIMEOUT.png`, fullPage: false });
    await ctx.close();
    evidence[tag] = { gate: "TIMEOUT", ...gate.state };
    return null;
  }
  ok(`${tag}: reached post-hydration state`, true,
     `Schedule option gone after ${(gate.ms / 1000).toFixed(1)}s`);

  const s = await read(page);
  note(`${tag}: canvas=${s.canvas} radios=${JSON.stringify(s.radios?.map((r) => `${r.label}:${r.checked}`))}`);
  await page.screenshot({ path: `${SHOTS}/${tag}.png`, fullPage: false });
  evidence[tag] = s;
  return { ctx, page, s };
}

const AGREE = { list: "List", grid: "Grid" };

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });

  // ── 375 — the phone tier, where the bug lived ───────────────────────────
  const a = await scenario(browser, { width: 375, tag: "375" });
  if (a) {
    ok("375: canvas is the forced List", a.s.canvas === "list", `canvas=${a.s.canvas}`);
    ok("375: the Grid option is NOT offered",
       !labels(a.s).includes("Grid"),
       `options=[${labels(a.s).join(", ")}]`);
    ok("375: the checked option is the canvas that rendered",
       checked(a.s).length === 1 && checked(a.s)[0] === AGREE[a.s.canvas],
       `checked=[${checked(a.s).join(", ")}] canvas=${a.s.canvas}`);

    const listRadio = (a.s.radios ?? []).find((r) => r.label === "List");
    if (listRadio) {
      const t = await touchOk(a.page, listRadio);
      ok("375: the List chip's touch target reaches ≥44px",
         t.centre && t.up && t.down,
         `visible ${listRadio.w}×${listRadio.h}px; hit-test centre=${t.centre} +20px=${t.down} -20px=${t.up}`);
    }

    // Pressing the only option must be a genuine no-op, not a silent failure.
    await a.page.click('[role="radiogroup"][aria-label="Weekly view mode"] [role="radio"]');
    await a.page.waitForTimeout(600);
    const after = await read(a.page);
    ok("375: pressing the reported option changes nothing (and does not break)",
       after.canvas === "list" && checked(after).join() === "List",
       `canvas=${after.canvas} checked=[${checked(after).join(", ")}]`);
    evidence["375-after-press"] = after;

    // ── COUNTERFACTUAL: has this probe been SEEN to fail? ─────────────────
    // Every assertion above is of the form "the bad thing is absent", and an
    // absent thing is also absent from a page that never rendered, from a
    // selector that no longer matches, and from a reader with a typo in it.
    // So before trusting the greens, put the PRE-FIX SHAPE back into the DOM by
    // hand — a Grid radio, checked, above the List canvas — and require the
    // same three checks to reject it. This touches only this browser context;
    // no source file is modified, so no concurrent lane is disturbed.
    const cf = await a.page.evaluate(() => {
      const group = document.querySelector(
        '[role="radiogroup"][aria-label="Weekly view mode"]',
      );
      if (!group) return null;
      const list = group.querySelector('[role="radio"]');
      const grid = document.createElement("button");
      grid.setAttribute("role", "radio");
      grid.setAttribute("aria-checked", "true");
      grid.textContent = "Grid";
      list.setAttribute("aria-checked", "false");
      group.insertBefore(grid, list);
      return true;
    });
    if (cf) {
      const bad = await read(a.page);
      const badLabels = (bad.radios ?? []).map((r) => r.label);
      const badChecked = (bad.radios ?? [])
        .filter((r) => r.checked === "true")
        .map((r) => r.label);
      const rejected =
        badLabels.includes("Grid") &&
        !(badChecked.length === 1 && badChecked[0] === AGREE[bad.canvas]);
      ok("375: the probe REJECTS the pre-fix shape when it is put back",
         rejected,
         `injected Grid:true above a "${bad.canvas}" canvas → options=[${badLabels.join(", ")}] checked=[${badChecked.join(", ")}]`);
      await a.page.screenshot({ path: `${SHOTS}/375-counterfactual.png` });
      evidence["375-counterfactual"] = bad;
    }
    // The context is discarded immediately — the injected node never outlives
    // this scenario, and nothing after it reads this page.
    await a.ctx.close();
  }

  // ── 600 / 768 — the tablet tier: Grid is a real choice again ────────────
  for (const width of [600, 768]) {
    const r = await scenario(browser, { width, tag: String(width) });
    if (!r) continue;
    // POSITIVE CONTROL for the absence assertion at 375.
    ok(`${width}: the Grid option IS offered`,
       labels(r.s).includes("Grid"),
       `options=[${labels(r.s).join(", ")}]`);
    ok(`${width}: the stored Grid choice renders a week grid`,
       r.s.canvas === "grid", `canvas=${r.s.canvas}`);
    ok(`${width}: the checked option is the canvas that rendered`,
       checked(r.s).length === 1 && checked(r.s)[0] === AGREE[r.s.canvas],
       `checked=[${checked(r.s).join(", ")}] canvas=${r.s.canvas}`);
    await r.ctx.close();
  }

  // ── 375 → 768 in ONE session — the preference was never written ─────────
  // viewMode is plain useState (lib/app-state.tsx:386), not persisted, so a
  // fresh load cannot show this: only widening WITHIN a session proves the
  // phone gate overrode the value without overwriting it.
  {
    const ctx = await makeCtx(browser, { width: 375 });
    await bypassLogin(ctx, { base: BASE, next: "/weekly" });
    const page = await ctx.newPage();
    attach(page, "resize");
    await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });
    const gate = await until(page, hydrated, { label: "resize hydration" });
    if (!gate.ok) {
      ok("resize: reached post-hydration state at 375", false,
         `Schedule still present after ${Math.round(gate.ms / 1000)}s`);
    } else {
      const before = await read(page);
      ok("resize: starts on the forced List with no Grid option",
         before.canvas === "list" && !labels(before).includes("Grid"),
         `canvas=${before.canvas} options=[${labels(before).join(", ")}]`);
      await page.screenshot({ path: `${SHOTS}/resize-before-375.png` });

      await page.setViewportSize({ width: 768, height: 820 });
      // Gate on the CANVAS, not the control — independent code path.
      const widened = await until(page, (s) => s.canvas === "grid",
                                  { budgetMs: 60000, label: "resize canvas" });
      if (!widened.ok) {
        ok("resize: widening to 768 brings the week grid back", false,
           `canvas stayed "${widened.state?.canvas}" after ${Math.round(widened.ms / 1000)}s`);
      } else {
        const after = await read(page);
        ok("resize: widening to 768 brings the week grid back", true,
           `after ${(widened.ms / 1000).toFixed(1)}s`);
        ok("resize: the teacher's Grid choice survived the phone visit",
           checked(after).join() === "Grid" && labels(after).includes("Grid"),
           `checked=[${checked(after).join(", ")}] options=[${labels(after).join(", ")}]`);
        evidence["resize-after-768"] = after;
        await page.screenshot({ path: `${SHOTS}/resize-after-768.png` });
      }
    }
    await ctx.close();
  }

  await browser.close();

  // ── Console hygiene ─────────────────────────────────────────────────────
  const errs = consoleLog.filter((c) => c.type !== "warning");
  ok("no console errors or page errors during the run", errs.length === 0,
     errs.length ? JSON.stringify(errs.slice(0, 3)) : "0 errors");
  if (consoleLog.some((c) => c.type === "warning"))
    note(`${consoleLog.filter((c) => c.type === "warning").length} warning(s) — see JSON`);

  const failed = results.filter((r) => !r.pass);
  writeFileSync(
    `${OUT}/f0-week-radio.json`,
    JSON.stringify({ base: BASE, results, evidence, consoleLog }, null, 2),
  );
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);

  // Exit contract — 0 verified · 1 the APP is broken · 2 the INSTRUMENT is
  // blind. The third arm is the one that matters: `failed.length === 0` is
  // ALSO true when nothing ran at all, so a probe that never reached the app
  // would otherwise exit 0 and read as a clean pass under `&&`, `| tail`, or
  // CI. `0/0 passed` must never be green. Real failures outrank blindness.
  if (failed.length > 0) {
    console.log(`\nFAILED — ${failed.length} assertion(s) did not pass.`);
    process.exit(1);
  }
  if (results.length === 0) {
    console.log(
      "\nBLIND — no assertions ran at all. The probe did not reach the app.",
    );
    process.exit(2);
  }
  process.exit(0);
})().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(1);
});
