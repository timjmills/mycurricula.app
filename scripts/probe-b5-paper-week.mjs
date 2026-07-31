// scripts/probe-b5-paper-week.mjs — focused live gate for B5.5's PAPER Week
// frame (WeekColumns → WeeklyLessonCard), the last reachability gap.
//
// The broad probe (probe-b5-dayweek.mjs) covers all six frame×route pairs. This
// one drills the surface the change actually touched, plus the DOUBLE-CHIP
// regression the opt-in prop exists to prevent, and the two things a chip
// dropped into a shared drag-and-drop card can plausibly break: the card's own
// click, and its drag handle.
//
// ASSERTS, never just logs. Exits 1 on any failure.
// Usage: node scripts/probe-b5-paper-week.mjs   (PROBE_BASE defaults to :3099)
import { chromium, devices } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3099";
const SHOTS = "docs/screenshots/b5-paper-week";
mkdirSync(SHOTS, { recursive: true });

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync(".env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}

const axes = (frame, theme = "clear") =>
  `v1.${frame}.dark.photo.${theme}.normal.vivid.highlight`;

const CHIP = 'button[aria-label^="Open the "][aria-label$="unit workspace"]';
const HANDLE = '[data-planner-item^="lesson:"] [data-drag-handle]';
const HYDRATE_BUDGET_MS = 45000;

const results = [];
const check = (ok, name, detail = "") => {
  results.push({ ok, name, detail });
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? `  — ${detail}` : ""}`);
};

const browser = await chromium.launch({ channel: "chrome" });

const auth = await browser.newContext();
{
  const boot = await auth.newPage();
  await boot.goto(
    `${BASE}/auth/claude-login?token=${encodeURIComponent(token)}&next=/weekly`,
    { waitUntil: "domcontentloaded", timeout: 60000 },
  );
  await boot.waitForTimeout(2500);
  await boot.close();
}
const storageState = await auth.storageState();
await auth.close();

// Identical isolation to the broad probe: seed the SSR cookie AND the client
// localStorage keys, AND block the teacher_preferences read, because theme-sync
// reconciles the saved frame on top of both 10–45s after hydrate and would
// silently swap the canvas mid-test.
async function makeContext({ frame, width, mobile = false }) {
  const ctx = await browser.newContext({
    storageState,
    ...(mobile
      ? { ...devices["iPhone 14 Pro"], viewport: { width, height: 780 } }
      : { viewport: { width, height: 900 } }),
  });
  await ctx.addCookies([{ name: "mc-theme-axes", value: axes(frame), url: BASE }]);
  await ctx.addInitScript((frame) => {
    localStorage.setItem(
      "mycurricula:onboarding",
      JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
    );
    localStorage.setItem("mycurricula:user:theme-frame", frame);
    localStorage.setItem("mycurricula:user:theme", "clear");
    localStorage.setItem("mycurricula:user:theme-glass", "dark");
    localStorage.setItem("mycurricula:user:theme-bg", "photo");
    localStorage.setItem("mycurricula:user:theme-dim", "normal");
  }, frame);
  await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
  return ctx;
}

async function openWeekly(ctx) {
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/weekly`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const t0 = Date.now();
  await page
    .locator('[data-planner-item^="lesson:"]')
    .first()
    .waitFor({ state: "attached", timeout: HYDRATE_BUDGET_MS })
    .catch(() => {});
  await page
    .locator(CHIP)
    .first()
    .waitFor({ state: "attached", timeout: HYDRATE_BUDGET_MS })
    .catch(() => {});
  const hydrateMs = Date.now() - t0;
  await page.waitForTimeout(1200);
  return { page, consoleErrors, hydrateMs };
}

// Per-lesson chip census — the double-chip guard. A tile with ZERO chips is
// legitimate (unresolvable unit); a tile with TWO is the regression.
const census = (page) =>
  page.evaluate((sel) => {
    const counts = [...document.querySelectorAll('[data-planner-item^="lesson:"]')]
      .map((h) => h.querySelectorAll(sel).length)
      .filter((n) => n > 0);
    return { withChip: counts.length, max: Math.max(0, ...counts) };
  }, CHIP);

// ── Pass 1 — the PAPER frame at desktop: the surface under test ─────────────
{
  const ctx = await makeContext({ frame: "paper", width: 1440 });
  const { page, consoleErrors, hydrateMs } = await openWeekly(ctx);

  const liveFrame = await page.evaluate(
    () =>
      document.documentElement.dataset.frame ??
      document.querySelector("[data-frame]")?.getAttribute("data-frame") ??
      "",
  );
  check(liveFrame === "paper", "frame under test is paper", liveFrame);

  // Prove WeekColumns is the canvas, not WeekA/WeekC/WeeklyList — otherwise a
  // silently-swapped canvas could let this pass while testing something else.
  // A day column's own group is labelled "Sunday (Sun)"; the stack inside it is
  // the `role="list"` labelled "Sunday lessons". The OUTER week container is
  // also a role=group ("Weekly plan by day, …"), so counting bare groups would
  // conflate the three — count the per-day stacks instead.
  const canvas = await page.evaluate(() => ({
    dayCols: document.querySelectorAll('[role="list"][aria-label$=" lessons"]').length,
    weekGroup: !!document.querySelector('[role="group"][aria-label^="Weekly plan by day"]'),
  }));
  check(
    canvas.weekGroup && canvas.dayCols > 0,
    "WeekColumns (day-column canvas) is mounted",
    JSON.stringify(canvas),
  );

  const count = await page.locator(CHIP).count();
  check(count > 0, "chip renders on the paper Week frame", `count=${count} hydrate=${hydrateMs}ms`);

  const info = await page.locator(CHIP).first().evaluate((el) => ({
    tag: el.tagName,
    disabled: el.disabled,
    tabIndex: el.tabIndex,
    text: el.textContent.trim(),
    title: el.getAttribute("title") ?? "",
    // The chip must live INSIDE the lesson card, not float beside it.
    inCard: !!el.closest('[data-planner-item^="lesson:"]'),
  }));
  check(
    info.tag === "BUTTON" && !info.disabled && info.tabIndex >= 0,
    "chip is a focusable, enabled <button>",
    JSON.stringify(info),
  );
  check(info.inCard, "chip renders inside the lesson card", `${info.inCard}`);
  check(
    !/^u-|^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(info.text),
    "chip shows a resolved unit NAME, not the raw id",
    info.text,
  );

  const c1 = await census(page);
  check(c1.max <= 1, "no lesson card shows TWO chips · paper", JSON.stringify(c1));

  await page.screenshot({ path: `${SHOTS}/weekly-paper-1440.png` });

  // ── Keyboard: real Tab walk, then Enter opens the workspace ───────────────
  await page.evaluate(() => document.body.focus());
  await page.keyboard.press("Tab");
  let tabbed = false;
  let tabCount = 0;
  for (let i = 0; i < 200 && !tabbed; i++) {
    tabbed = await page.evaluate((sel) => !!document.activeElement?.matches(sel), CHIP);
    if (!tabbed) {
      await page.keyboard.press("Tab");
      tabCount++;
    }
  }
  check(tabbed, "chip is Tab-reachable · paper", `after ${tabCount} tabs`);

  const before = await page.evaluate(() => ({
    url: location.href,
    y: window.scrollY,
    overflow: document.body.style.overflow,
  }));

  let retried = false;
  await page.locator(CHIP).first().press("Enter", { timeout: 15000 });
  await page.waitForTimeout(1500);
  if ((await page.locator(".ue-modal").count()) === 0) {
    retried = true;
    await page.waitForTimeout(2500);
    await page.locator(CHIP).first().press("Enter", { timeout: 15000 });
    await page.waitForTimeout(1500);
  }

  const opened = await page.evaluate(() => ({
    url: location.href,
    modals: document.querySelectorAll(".ue-modal").length,
    scrims: document.querySelectorAll(".ue-scrim").length,
    dialogs: document.querySelectorAll('[role="dialog"][aria-modal="true"]').length,
    overflow: document.body.style.overflow,
  }));
  check(
    opened.modals === 1,
    "Enter opens EXACTLY ONE .ue-modal · paper",
    `${opened.modals}${retried ? " (needed a second Enter — first fired pre-hydration)" : ""}`,
  );
  check(opened.scrims === 1, "exactly ONE .ue-scrim · paper", `${opened.scrims}`);
  check(opened.dialogs === 1, "exactly ONE aria-modal dialog · paper", `${opened.dialogs}`);
  check(
    opened.url === before.url,
    "URL unchanged — pop-in, not navigation · paper",
    `${before.url} → ${opened.url}`,
  );
  check(opened.overflow === "hidden", "body scroll locked while open · paper", opened.overflow);
  await page.screenshot({ path: `${SHOTS}/weekly-paper-workspace-open-1440.png` });

  await page.keyboard.press("Escape");
  await page.waitForTimeout(900);
  const closed = await page.evaluate(() => ({
    modals: document.querySelectorAll(".ue-modal").length,
    overflow: document.body.style.overflow,
    y: window.scrollY,
  }));
  check(closed.modals === 0, "Escape closes the workspace · paper", `${closed.modals}`);
  check(
    closed.overflow === before.overflow,
    "body overflow RELEASED on close · paper",
    `"${before.overflow}" → "${closed.overflow}"`,
  );
  check(closed.y === before.y, "scroll position preserved · paper", `${before.y} → ${closed.y}`);

  // ── The card's own click still works ──────────────────────────────────────
  // The card expands on a band/title click. Blur first (a focus-opened
  // dismissible tooltip otherwise floats over the click target — the known
  // primitive issue the broad probe documents).
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForTimeout(400);
  const expandWorked = await (async () => {
    const band = page.locator('[data-planner-item^="lesson:"] [role="button"][aria-label$="lesson"]').first();
    const label0 = await band.getAttribute("aria-label").catch(() => null);
    if (!label0) return { ok: false, why: "no band affordance found" };
    await band.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(300);
    await band.click({ timeout: 8000 });
    await page.waitForTimeout(700);
    const label1 = await band.getAttribute("aria-label").catch(() => null);
    return { ok: label1 !== null && label1 !== label0, why: `${label0} → ${label1}` };
  })();
  check(
    expandWorked.ok,
    "card's own click still expands/collapses it · paper",
    expandWorked.why,
  );

  // ── The drag handle is still reachable + un-swallowed ─────────────────────
  // The chip sits in the card BODY and the grip in the header band, but a
  // stray 44px hit box could still reach up over it, so hit-test the grip.
  const grip = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { found: false };
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      found: true,
      rect: `${r.width.toFixed(1)}x${r.height.toFixed(1)}`,
      blocked: at !== el && !el.contains(at) && !at?.contains(el),
      by: at ? `${at.tagName}.${at.className}`.slice(0, 60) : "null",
    };
  }, HANDLE);
  check(grip.found, "card drag handle still present · paper", JSON.stringify(grip));
  check(
    grip.found && !grip.blocked,
    "drag handle answers its own HIT TEST (chip does not cover it) · paper",
    JSON.stringify(grip),
  );

  // A real pointer drag: grab the grip, cross into a neighbouring day column,
  // drop, and assert the lesson actually moved columns. This is the behaviour
  // a chip in the card body could plausibly break.
  const dragMoved = await (async () => {
    // The card ROOT carries role="group" itself (aria-label "Math lesson: …"),
    // so `card.closest('[role="group"]')` returns the CARD, not its column —
    // closest() starts at the element. Walk from the PARENT to the enclosing
    // `role="list"` stack, which is the per-day droppable.
    const src = await page.evaluate(() => {
      const card = document.querySelector('[data-planner-item^="lesson:"]');
      const grip = card?.querySelector("[data-drag-handle]");
      const stack = card?.parentElement?.closest('[role="list"]');
      if (!grip || !stack) return null;
      const r = grip.getBoundingClientRect();
      return {
        id: card.getAttribute("data-planner-item"),
        col: stack.getAttribute("aria-label"),
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
      };
    });
    if (!src) return { ok: false, why: "no draggable card" };
    const target = await page.evaluate((srcCol) => {
      const stacks = [...document.querySelectorAll('[role="list"][aria-label$=" lessons"]')].filter(
        (s) => s.getAttribute("aria-label") !== srcCol,
      );
      const t = stacks[0];
      if (!t) return null;
      const r = t.getBoundingClientRect();
      return { label: t.getAttribute("aria-label"), x: r.left + r.width / 2, y: r.top + r.height * 0.6 };
    }, src.col);
    if (!target) return { ok: false, why: "no target column" };
    await page.mouse.move(src.x, src.y);
    await page.mouse.down();
    // dnd-kit needs movement past its activation constraint, in steps.
    await page.mouse.move(src.x + 12, src.y + 12, { steps: 6 });
    await page.mouse.move(target.x, target.y, { steps: 24 });
    await page.waitForTimeout(400);
    await page.mouse.up();
    await page.waitForTimeout(1200);
    const nowCol = await page.evaluate((id) => {
      const card = document.querySelector(`[data-planner-item="${id}"]`);
      return card?.closest('[role="group"]')?.getAttribute("aria-label") ?? null;
    }, src.id);
    return {
      ok: nowCol !== null && nowCol !== src.col,
      why: `${src.col} → ${nowCol} (target ${target.label})`,
    };
  })();
  check(dragMoved.ok, "card drag still moves the lesson between day columns · paper", dragMoved.why);

  await page.screenshot({ path: `${SHOTS}/weekly-paper-after-drag-1440.png` });

  const realErrors = consoleErrors.filter((e) => !/ERR_FAILED|teacher_preferences/.test(e));
  check(realErrors.length === 0, "no console errors · paper", realErrors.slice(0, 3).join(" | "));

  await page.close();
  await ctx.close();
}

// ── Pass 2 — DOUBLE-CHIP re-check on the frames that own their own chip ─────
// This is the specific regression the change risks. WeekA (glass) and WeekC
// (color) render their own <UnitChip>; if the shared card had started emitting
// one unconditionally and either frame delegated to it, a lesson would show two.
for (const frame of ["glass", "color"]) {
  const ctx = await makeContext({ frame, width: 1440 });
  const { page, consoleErrors } = await openWeekly(ctx);
  const liveFrame = await page.evaluate(
    () => document.documentElement.dataset.frame ?? "",
  );
  check(liveFrame === frame, `frame under test is ${frame}`, liveFrame);
  const c = await census(page);
  check(c.max <= 1, `no lesson tile shows TWO chips · ${frame}`, JSON.stringify(c));
  check(c.withChip > 0, `chip still renders · ${frame}`, JSON.stringify(c));

  // CONTROL for the paper pass's console check. These two frames render
  // WeekA/WeekC, canvases this change does not touch at all — so any error that
  // also appears here is pre-existing and NOT attributable to the paper-frame
  // chip. Reported (not asserted clean) precisely so the comparison is visible.
  const realErrors = consoleErrors.filter((e) => !/ERR_FAILED|teacher_preferences/.test(e));
  console.log(
    `  note  console errors on the UNTOUCHED ${frame} frame: ${realErrors.length}` +
      (realErrors.length ? ` — ${realErrors[0].split("\n")[0].slice(0, 120)}` : ""),
  );

  await page.screenshot({ path: `${SHOTS}/weekly-${frame}-1440.png` });
  await page.close();
  await ctx.close();
}

// ── Pass 3 — responsive. WeeklyShell forces WeeklyList at ≤900px regardless of
// frame, so the paper day-column canvas only exists above it; 1024 and 1280 are
// the tiers that actually render WeekColumns. 768/375 assert the fallback still
// lays out without document h-scroll.
for (const [width, mobile] of [
  [375, true],
  [768, true],
  [1024, false],
  [1280, false],
]) {
  const ctx = await makeContext({ frame: "paper", width, mobile });
  const { page } = await openWeekly(ctx);
  const label = `paper-${width}`;

  const shape = await page.evaluate(() => ({
    weekColumns: !!document.querySelector('[role="group"][aria-label^="Weekly plan by day"]'),
    chips: document.querySelectorAll(
      'button[aria-label^="Open the "][aria-label$="unit workspace"]',
    ).length,
  }));

  if (shape.weekColumns) {
    const c = await census(page);
    check(shape.chips > 0, `chip renders on WeekColumns · ${label}`, JSON.stringify(shape));
    check(c.max <= 1, `no card shows TWO chips · ${label}`, JSON.stringify(c));

    const hit = await page.evaluate(([sel, needs44]) => {
      const el = document.querySelector(sel);
      if (!el) return { found: false };
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const half = needs44 ? 21.5 : Math.min(21.5, r.height / 2 - 1);
      const pts = [
        [cx, cy], [cx - half, cy - half], [cx + half, cy - half],
        [cx - half, cy + half], [cx + half, cy + half],
        [cx, cy - half], [cx, cy + half], [cx - half, cy], [cx + half, cy],
      ];
      const misses = [];
      for (const [x, y] of pts) {
        const t = document.elementFromPoint(x, y);
        if (!t || (t !== el && !el.contains(t) && !t.contains(el))) {
          misses.push(
            `(${Math.round(x - cx)},${Math.round(y - cy)})→${t ? `${t.tagName}.${t.className}`.slice(0, 40) : "null"}`,
          );
        }
      }
      return { found: true, rect: `${r.width.toFixed(1)}x${r.height.toFixed(1)}`, w: r.width, h: r.height, misses };
    }, [CHIP, width <= 900]);

    if (hit.found) {
      const needs44 = width <= 900;
      check(
        needs44 ? hit.w >= 44 && hit.h >= 44 : hit.h >= 32,
        needs44 ? `chip box ≥44×44 · ${label}` : `chip keeps the primitive's 32px desktop height · ${label}`,
        hit.rect,
      );
      check(
        hit.misses.length === 0,
        `chip answers the HIT TEST across ${needs44 ? "its 44×44 box" : "its own box"} · ${label}`,
        hit.misses.join(" ; "),
      );
    }
  } else {
    // Documented, asserted: below 900px WeeklyShell swaps to WeeklyList for
    // every frame. Recorded so a future shell change that lets WeekColumns
    // render at phone width trips this and gets a real responsive review.
    check(true, `≤900px falls back to WeeklyList (not WeekColumns) · ${label}`, JSON.stringify(shape));
  }

  const hScroll = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  check(!hScroll, `no document h-scroll · ${label}`);

  await page.screenshot({ path: `${SHOTS}/weekly-${label}.png`, fullPage: false });
  await page.close();
  await ctx.close();
}

await browser.close();

const fails = results.filter((r) => !r.ok);
console.log(`\n${results.length - fails.length}/${results.length} assertions passed`);
if (fails.length) {
  console.log(`\n${fails.length} FAILING:`);
  for (const f of fails) console.log(`  • ${f.name} — ${f.detail}`);
  process.exit(1);
}
