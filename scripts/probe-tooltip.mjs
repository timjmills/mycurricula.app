// probe-tooltip.mjs — §4b live coverage of the Tooltip bubble's pointer
// contract (components/ui/Tooltip.tsx).
//
// The unit test (tests/tooltip-pointer-policy.test.ts) pins the pure decision;
// this pins the DOM/event sequence it rides on, which is where the bugs were.
// The repo's vitest gate is node-environment (no DOM renderer, and adding one
// means new dependencies), so the browser IS the test bed for:
//   • the class actually reaching the bubble,
//   • pointerEngaged resetting on close,
//   • the trigger→bubble grace period surviving the 8px gap,
//   • the mousedown-default suppression that keeps the bubble alive long
//     enough for the dismiss click to be delivered,
//   • the dismissal persisting and suppressing the next open.
//
// Two defects are guarded here, both found by this probe:
//   1. A dismissible bubble opened by FOCUS kept pointer-events:auto and
//      parked a click-eating rectangle over the page for as long as the
//      control held focus — the next mousedown inside it was swallowed.
//   2. Once the trigger held focus, mousedown on "Turn off these tips"
//      blurred the trigger, which unmounted the bubble before the mouseup —
//      no click was ever delivered, so the tip could not be turned off.
//
// Runs against the shared dev server and never edits the tree: the pre-fix
// state is reproduced by re-adding the class the old code applied from props
// alone (`showDismissLink ? styles.interactive : ""`) and re-measuring.
//
// Usage: node scripts/probe-tooltip.mjs   (PROBE_BASE defaults to :3099)
//
// Checks:
//   1. focus-open  → bubble inert, real click reaches the element underneath
//   2. pre-fix A/B → same bubble with `.interactive` re-added swallows it
//   3. hover-open  → bubble interactive, "Turn off these tips" is clickable
//                    and persists to localStorage + suppresses the next open
//   3b. hover→click → the link survives the trigger taking focus
//   4. required    → Personal/Team keeps its bubble, no dismiss link, inert,
//                    and survives the global off switch
//   5. touch       → native title= mirror present; tap-focus bubble is inert
import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3099";
const SHOTS = process.env.PROBE_SHOTS ?? "docs/screenshots/tooltip-fix";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const check = (ok, name, detail = "") => {
  results.push({ ok, name, detail });
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? `  — ${detail}` : ""}`);
};

const SEARCH = 'button[aria-label="Search"]';
const TEAM = 'button[aria-label="Team Curriculum"]';
const TIP = '[role="tooltip"]';

const browser = await chromium.launch({ channel: "chrome" });

// ── One authenticated storage state, reused by every context ────────────────
const auth = await browser.newContext();
{
  // The hop lives in scripts/lib/auth.mjs. `retries: 3` is passed HERE, not
  // taken from a default: /auth/claude-login is a cold dev route whose first
  // compile has been measured past a minute with several lanes sharing one dev
  // server, and this probe would otherwise lose a whole run to a compile queue.
  // Every other probe fails fast (the helper defaults to a single attempt), so
  // a slow server surfaces as a slow server quickly rather than after 3×.
  await bypassLogin(auth, {
    base: BASE, next: "/weekly", timeout: 180000, settleMs: 2500, retries: 3,
  });
}
const storageState = await auth.storageState();
await auth.close();

async function makeContext({ mobile = false } = {}) {
  const ctx = await browser.newContext({
    storageState,
    ...(mobile
      ? { ...devices["iPhone 14 Pro"] }
      : { viewport: { width: 1440, height: 900 } }),
  });
  // Local-dev bypass account resolves to "needs onboarding" and would yank
  // the page to /onboarding mid-test; seed the finished flag (same reason as
  // scripts/probe-b5-dayweek.mjs).
  await ctx.addInitScript(() => {
    localStorage.setItem(
      "mycurricula:onboarding",
      JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
    );
  });
  return ctx;
}

// Hydration in dev is slow and variable (5–16s) and the SSR HTML already
// contains the trigger, so waiting on the selector proves nothing about the
// listeners being attached. Retry the interaction until the bubble appears.
// A hydration/compile failure must read as a clean FAIL, not a stack trace
// that kills the remaining sections. Declared here because openWeekly throws it.
class Unhydrated extends Error {}

async function openWeekly(page) {
  // Both the navigation and the SSR paint can take minutes when several
  // agents share one dev server. Surface either as a clean FAIL rather than
  // a stack trace that kills the remaining sections.
  try {
    await page.goto(`${BASE}/weekly`, {
      waitUntil: "domcontentloaded",
      timeout: 180000,
    });
  } catch {
    throw new Unhydrated("/weekly did not respond — dev server saturated?");
  }
  try {
    await page.waitForSelector(SEARCH, { timeout: 120000, state: "attached" });
  } catch {
    throw new Unhydrated(`${SEARCH} never rendered on /weekly`);
  }
}

// Hydration budget for one open attempt. Generous on purpose: dev hydration
// is 5–16s on a quiet server and several times that when agents share one.
const BUDGET_MS = 120000;

// Every step below can throw on a saturated server (a locator timing out, a
// navigation landing mid-flight). An open attempt that cannot complete is a
// "no" for this iteration, not a crash — the caller decides, once the whole
// budget is spent, whether that is a real failure.
const attempt = async (fn) => {
  try {
    await fn();
    return true;
  } catch {
    return false;
  }
};

/** Focus the trigger until the focus path actually opens a bubble. */
async function openByFocus(page, sel) {
  const deadline = Date.now() + BUDGET_MS;
  while (Date.now() < deadline) {
    await attempt(async () => {
      await page.evaluate((s) => document.querySelector(s)?.focus(), sel);
      await page.waitForTimeout(400);
    });
    if ((await page.locator(TIP).count()) > 0) {
      await page.waitForTimeout(250); // placement raf + fade
      return true;
    }
    await attempt(async () => {
      await page.evaluate((s) => document.querySelector(s)?.blur(), sel);
      await page.waitForTimeout(400);
    });
  }
  return false;
}

/** Hover the trigger until the hover path (400ms delay) opens a bubble. */
async function openByHover(page, sel) {
  const deadline = Date.now() + BUDGET_MS;
  while (Date.now() < deadline) {
    await attempt(async () => {
      await page.mouse.move(5, 500);
      await page.waitForTimeout(150);
      await page.hover(sel, { timeout: 15000 });
      await page.waitForTimeout(900);
    });
    if ((await page.locator(TIP).count()) > 0) return true;
  }
  return false;
}

// ── Warm the route ──────────────────────────────────────────────────────────
// Whichever section ran FIRST kept failing, in a different position each run:
// it was paying /weekly's cold dev compile plus the planner store's own
// 11–16s hydrate out of its own budget, on a server shared with other agents.
// That is an environment cost, not a signal about the tooltip, so pay it once
// here in a throwaway context and let every section start against a warm route.
async function warmRoute() {
  const ctx = await makeContext();
  const page = await ctx.newPage();
  const t0 = Date.now();
  try {
    await openWeekly(page);
    const ok = await openByFocus(page, SEARCH);
    console.log(
      `  (warm-up: /weekly ${ok ? "live" : "NOT live"} after ${Math.round((Date.now() - t0) / 1000)}s)`,
    );
  } catch {
    console.log("  (warm-up: /weekly did not come up — sections will report it)");
  }
  await ctx.close();
}

// What does the browser say is painted at this point?
const elementAt = (page, x, y) =>
  page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return { tag: null, inTooltip: false, label: "(nothing)" };
      return {
        tag: el.tagName,
        inTooltip: !!el.closest('[role="tooltip"]'),
        label:
          el.getAttribute("aria-label") ??
          el.className?.toString().slice(0, 40) ??
          el.tagName,
      };
    },
    [x, y],
  );

// Screenshots are evidence, not assertions: a slow font load must never take
// down a run whose checks have already passed.
const shot = async (page, name) => {
  try {
    await page.screenshot({ path: `${SHOTS}/${name}`, timeout: 15000 });
  } catch {
    console.log(`  (screenshot ${name} timed out — server slow, checks stand)`);
  }
};

/** Computed pointer-events of the bubble, or null when none is painted. */
const pointerEventsOf = (page) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? getComputedStyle(el).pointerEvents : null;
  }, TIP);

const runSection = async (name, fn) => {
  try {
    await fn();
  } catch (err) {
    if (err instanceof Unhydrated) {
      check(false, `${name}: bubble never opened within the budget`, err.message);
    } else {
      throw err;
    }
  }
};

// ── 1 + 2. Focus-open: inert now, swallowing with the pre-fix class ─────────
await warmRoute();

await runSection("focus-open", async () => {
  const ctx = await makeContext();
  const page = await ctx.newPage();
  await openWeekly(page);

  // Keyboard/programmatic focus — the path with no cursor.
  const opened = await openByFocus(page, SEARCH);
  check(opened, "focus alone opens the bubble");
  if (!opened) {
    await ctx.close();
    throw new Unhydrated(`${SEARCH} never produced a bubble on focus`);
  }

  const cls = await page.evaluate(
    (s) => document.querySelector(s)?.className ?? "",
    TIP,
  );
  const pe = await pointerEventsOf(page);
  check(
    pe === "none",
    "focus-open bubble is inert",
    `pointer-events: ${pe}  class="${cls}"`,
  );

  const box = await page.locator(TIP).boundingBox();
  const cx = Math.round(box.x + box.width / 2);
  const cy = Math.round(box.y + box.height / 2);
  const under = await elementAt(page, cx, cy);
  check(
    !under.inTooltip,
    "focus-open: element at bubble centre is the page beneath",
    `${under.tag} "${under.label}"`,
  );

  // A REAL click at that point. Recording only `mousedown` would be too weak
  // an assertion: the defect is precisely that the CLICK is lost when the
  // bubble unmounts between mousedown and mouseup. So require a full,
  // delivered click on the SAME element the mousedown hit.
  await page.evaluate(() => {
    const sig = (el) =>
      el
        ? `${el.tagName}.${String(el.className ?? "").slice(0, 30)}`
        : "(none)";
    window.__hits = [];
    const rec = (e) =>
      window.__hits.push([
        e.type,
        !!e.target.closest('[role="tooltip"]'),
        sig(e.target),
      ]);
    document.addEventListener("mousedown", rec, true);
    document.addEventListener("click", rec, true);
  });
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(200);
  const hits = await page.evaluate(() => window.__hits);
  const md = hits.find(([t]) => t === "mousedown");
  const ck = hits.find(([t]) => t === "click");
  // Remember what the page delivered the click to — the pre-fix A/B below
  // asserts that this same element is denied it.
  const underSig = ck?.[2] ?? null;
  check(
    !!md &&
      !!ck &&
      md[1] === false &&
      ck[1] === false &&
      md[2] === ck[2] &&
      md[2] !== "(none)",
    "focus-open: a full click is delivered to the page, not the bubble",
    JSON.stringify(hits),
  );
  await shot(page, "focus-open-inert-1440.png");

  // ── PRE-FIX A/B: re-add the class the old code applied from props alone.
  await openByFocus(page, SEARCH);
  const readded = await page.evaluate((sel) => {
    const tip = document.querySelector(sel);
    // The CSS-module class is hashed; find it from the stylesheet rule that
    // sets pointer-events:auto on a .tooltip-ish selector.
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const r of rules) {
        if (
          r.selectorText &&
          /interactive/.test(r.selectorText) &&
          /pointer-events:\s*auto/.test(r.cssText)
        ) {
          const m = r.selectorText.match(/\.([A-Za-z0-9_-]*interactive[A-Za-z0-9_-]*)/);
          if (m) {
            tip.classList.add(m[1]);
            return m[1];
          }
        }
      }
    }
    return null;
  }, TIP);
  const box2 = await page.locator(TIP).boundingBox();
  const cx2 = Math.round(box2.x + box2.width / 2);
  const cy2 = Math.round(box2.y + box2.height / 2);
  const under2 = await elementAt(page, cx2, cy2);
  check(
    readded !== null && under2.inTooltip,
    "PRE-FIX repro: with `.interactive` re-added the bubble eats the point",
    `class=${readded} → ${under2.tag} inTooltip=${under2.inTooltip}`,
  );
  // And prove it at the EVENT level, not just via elementFromPoint: the same
  // click that reached the page above must now be denied to it.
  await page.evaluate(() => {
    window.__hits = [];
  });
  await page.mouse.click(cx2, cy2);
  await page.waitForTimeout(200);
  const hits2 = await page.evaluate(() => window.__hits);
  const md2 = hits2.find(([t]) => t === "mousedown");
  const pageGotClick = hits2.some(
    ([t, , s]) => t === "click" && underSig !== null && s === underSig,
  );
  check(
    !!md2 && md2[1] === true && !pageGotClick,
    "PRE-FIX repro: the underlying element is denied the click it just received",
    `underSig=${underSig} hits=${JSON.stringify(hits2)}`,
  );
  await shot(page, "prefix-repro-swallow-1440.png");
  await ctx.close();
});

// ── 3. Hover-open: the dismiss link still works ─────────────────────────────
await runSection("hover-open", async () => {
  const ctx = await makeContext();
  const page = await ctx.newPage();
  await openWeekly(page);

  const opened = await openByHover(page, SEARCH);
  check(opened, "hover alone opens the bubble");
  if (!opened) {
    await ctx.close();
    throw new Unhydrated(`${SEARCH} never produced a bubble on hover`);
  }
  await page.waitForTimeout(300);
  const pe = await pointerEventsOf(page);
  check(pe === "auto", "hover-open bubble is interactive", `pointer-events: ${pe}`);

  const link = page.locator(TIP).getByRole("button", {
    name: /turn off these tips/i,
  });
  check(await link.isVisible(), "hover-open bubble renders the dismiss link");

  // Move onto the bubble (crossing the 8px gap) and click the link.
  await link.hover();
  await page.waitForTimeout(100);
  await link.click();
  await page.waitForTimeout(300);
  const stored = await page.evaluate(() =>
    localStorage.getItem("mycurricula:user:tooltip-dismissed"),
  );
  check(
    (stored ?? "").includes("chrome-search"),
    "dismiss click persisted the id",
    String(stored),
  );
  const gone = await page.locator(TIP).count();
  check(gone === 0, "dismiss click closed the bubble", `bubbles: ${gone}`);

  // And it stays dismissed.
  await page.mouse.move(5, 400);
  await page.waitForTimeout(200);
  await page.hover(SEARCH);
  await page.waitForTimeout(900);
  const reopened = await page.locator(TIP).count();
  check(reopened === 0, "dismissed tooltip does not reopen", `bubbles: ${reopened}`);
  await ctx.close();
});

// ── 3b. Hover THEN click the trigger: the link must survive taking focus ────
// The naive fix ("interactive only when byHover") breaks exactly here: the
// click moves focus to the trigger, `show(false)` clears byHover, and the
// link the user is reaching for goes inert mid-gesture.
await runSection("hover→click", async () => {
  const ctx = await makeContext();
  const page = await ctx.newPage();
  await openWeekly(page);

  const TODOS = 'button[aria-label="To-dos"]';
  const opened = await openByHover(page, TODOS);
  check(opened, "hover opens the To-dos tooltip");
  if (!opened) {
    await ctx.close();
    throw new Unhydrated(`${TODOS} never produced a bubble on hover`);
  }
  await page.click(TODOS); // trigger now has focus; byHover is false
  await page.waitForTimeout(250);
  const stillOpen = await page.locator(TIP).count();
  const pe = await pointerEventsOf(page);
  check(
    stillOpen === 1 && pe === "auto",
    "hover→click: bubble stays interactive after the trigger takes focus",
    `bubbles: ${stillOpen} pointer-events: ${pe}`,
  );
  if (stillOpen === 1) {
    const link = page
      .locator(TIP)
      .getByRole("button", { name: /turn off these tips/i });
    await link.hover();
    await link.click();
    await page.waitForTimeout(300);
    const stored = await page.evaluate(() =>
      localStorage.getItem("mycurricula:user:tooltip-dismissed"),
    );
    check(
      (stored ?? "").includes("chrome-todos"),
      "hover→click: the dismiss link is still clickable",
      String(stored),
    );
  }
  await ctx.close();
});

// ── 4. required: always-on, no link, inert ──────────────────────────────────
await runSection("required", async () => {
  const ctx = await makeContext();
  // Global off switch ON + everything dismissed: a `required` tooltip ignores both.
  await ctx.addInitScript(() => {
    localStorage.setItem("mycurricula:user:tooltips-off", "true");
  });
  const page = await ctx.newPage();
  await openWeekly(page);

  // NOTE: this section's control check ("a dismissible tooltip IS suppressed")
  // expects ZERO bubbles, which is also what an unhydrated page shows. The
  // required-tooltip open below is what proves the page is live, so treat its
  // failure as unhydrated rather than letting the control pass vacuously.
  const teamOpened = await openByHover(page, TEAM);
  if (!teamOpened) {
    check(false, "required tooltip still opens with the global off switch ON");
    await ctx.close();
    throw new Unhydrated(`${TEAM} never produced a bubble on hover`);
  }
  const shown = await page.locator(TIP).count();
  check(
    shown === 1,
    "required tooltip still opens with the global off switch ON",
    `bubbles: ${shown}`,
  );
  if (shown === 1) {
    const hasLink = await page
      .locator(TIP)
      .getByRole("button", { name: /turn off these tips/i })
      .count();
    check(hasLink === 0, "required tooltip renders NO dismiss link");
    const pe = await pointerEventsOf(page);
    check(pe === "none", "required tooltip is inert", `pointer-events: ${pe}`);
    await shot(page, "required-team-tooltip-1440.png");
  }

  // Control: a dismissible tooltip IS suppressed by the same global flag.
  await page.mouse.move(5, 400);
  await page.waitForTimeout(200);
  await page.hover(SEARCH);
  await page.waitForTimeout(900);
  const dismissible = await page.locator(TIP).count();
  check(
    dismissible === 0,
    "control: dismissible tooltip IS suppressed by the global off switch",
    `bubbles: ${dismissible}`,
  );
  await ctx.close();
});

// ── 5. Touch: native title mirror + no swallow on tap-focus ─────────────────
await runSection("touch", async () => {
  const ctx = await makeContext({ mobile: true });
  const page = await ctx.newPage();
  await openWeekly(page);

  const title = await page.evaluate(
    (s) => document.querySelector(s)?.getAttribute("title"),
    SEARCH,
  );
  check(
    typeof title === "string" && title.length > 0,
    "touch: trigger mirrors the tip to native title=",
    JSON.stringify(title),
  );

  // GATE: "no bubble after the tap" is also what an UNHYDRATED page shows, so
  // that branch would pass vacuously on a slow dev server. Prove the listeners
  // are attached first by opening a bubble the deterministic way, then close it
  // and run the real tap measurement.
  const live = await openByFocus(page, SEARCH);
  if (!live) {
    await ctx.close();
    throw new Unhydrated(`${SEARCH} never produced a bubble — cannot judge tap`);
  }
  await page.evaluate((s) => document.querySelector(s)?.blur(), SEARCH);
  await page.waitForTimeout(300);

  // A tap focuses the button, which opens the bubble on the focus path.
  await page.tap(SEARCH).catch(() => {});
  await page.waitForTimeout(400);
  const n = await page.locator(TIP).count();
  if (n > 0) {
    const pe = await pointerEventsOf(page);
    const disp = await page.evaluate((s) => {
      const el = document.querySelector(s);
      return el ? getComputedStyle(el).display : null;
    }, TIP);
    check(
      pe === "none" || disp === "none",
      "touch: tap-focused bubble cannot swallow the next tap",
      `pointer-events: ${pe} display: ${disp}`,
    );
  } else {
    // Hydration is proven above, so this is a real measurement: the tap did
    // not open a styled bubble, which means nothing can swallow the next tap.
    check(true, "touch: no styled bubble painted on tap (page proven live)");
  }
  await shot(page, "touch-393.png");
  await ctx.close();
});

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`,
);
if (failed.length) {
  console.log("FAILED:");
  for (const f of failed) console.log(`  • ${f.name} — ${f.detail}`);
  process.exit(1);
}
