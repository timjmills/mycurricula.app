// scripts/probe-b5-dayweek.mjs — B5.4 / B5.5 live gate for the unit pop-in
// chip on /daily and /weekly.
//
// It ASSERTS (never just logs — a probe that prints numbers and exits 0 has
// checked nothing). Every check appends { ok, name, detail }; a non-empty
// failure list exits 1.
//
// What it proves, per frame (glass · paper · color) and per route:
//   • the chip renders and is a real, enabled, tabbable <button>
//   • Tab reaches it from the top of the page (keyboard-reachable, not
//     hover-only)
//   • activating it opens EXACTLY ONE .ue-modal and ONE .ue-scrim with the URL
//     unchanged (pop-in, not navigation) and body scroll locked
//   • Escape closes it, releases document.body.style.overflow, and restores the
//     scroll position
//   • the chip does NOT steal the card's own click (selection is untouched by a
//     chip click, and the card's SelectTitle still selects)
//   • at 375 in TRUE mobile emulation (isMobile + deviceScaleFactor), the chip
//     answers a HIT TEST across a 44×44 box — elementFromPoint, not
//     getBoundingClientRect, because a visual box cannot see a hit overlay and
//     cannot see it being clipped either
//
// Usage: node scripts/probe-b5-dayweek.mjs   (PROBE_BASE defaults to :3099)
import { chromium, devices } from "playwright";
// One owner for the login hop — see scripts/lib/auth.mjs.
import { bypassLogin } from "./lib/auth.mjs";
import { readFileSync, mkdirSync } from "node:fs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3099";
const SHOTS = "docs/screenshots/b5-dayweek";
mkdirSync(SHOTS, { recursive: true });

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync(".env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}

// Packed mc-theme-axes cookie — LOCKSTEP with lib/theme-values.ts
// (v1.frame.glass.bg.theme.dim.style.palette).
const axes = (frame, theme = "clear") =>
  `v1.${frame}.dark.photo.${theme}.normal.vivid.highlight`;

const CHIP = 'button[aria-label^="Open the "][aria-label$="unit workspace"]';
// Hydration here is SLOW and variable (dev 5–9s; the planner store's own
// lesson+unit hydrate has been measured at 11–16s). A fixed sleep samples the
// pre-hydrate DOM and produces false findings — an earlier run of this probe
// reported "chip renders: count=0" on all six frames purely by sampling at
// 9.5s. So we POLL for the real signal (a lesson row, then the chip) and only
// call it a failure once the budget is genuinely spent.
const HYDRATE_BUDGET_MS = 45000;

const results = [];
const check = (ok, name, detail = "") => {
  results.push({ ok, name, detail });
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? `  — ${detail}` : ""}`);
};

const browser = await chromium.launch({ channel: "chrome" });

// ── One authenticated storage state, reused by every context ────────────────
const auth = await browser.newContext();
{
  await bypassLogin(auth, { base: BASE, next: "/weekly", timeout: 60000, settleMs: 2500 });
}
const storageState = await auth.storageState();
await auth.close();

async function makeContext({ frame, theme = "clear", width, mobile = false }) {
  const ctx = await browser.newContext({
    storageState,
    ...(mobile
      ? { ...devices["iPhone 14 Pro"], viewport: { width, height: 780 } }
      : { viewport: { width, height: 900 } }),
  });
  await ctx.addCookies([
    {
      name: "mc-theme-axes",
      value: axes(frame, theme),
      url: BASE,
    },
  ]);
  // Local-dev environment only: this bypass account resolves to "needs
  // onboarding", and FirstRunRedirect router.replace()s to /onboarding once the
  // async server read lands — tens of seconds in, so a short-lived page never
  // sees it and a long-lived one gets yanked mid-test. Seeding the per-device
  // finished flag keeps the probe on the route it is measuring. It changes
  // nothing about the chip.
  // The cookie only seeds the SSR attributes. The client theme provider then
  // reconciles against the teacher's SAVED axes and, on this account, flipped
  // /weekly from glass back to paper a few seconds after hydrate — which
  // silently swapped WeekA for WeekColumns mid-test and made an earlier run
  // report "the chip vanished". Seed the client keys too so a frame under test
  // stays the frame under test.
  await ctx.addInitScript(
    ([frame, theme]) => {
      localStorage.setItem(
        "mycurricula:onboarding",
        JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
      );
      localStorage.setItem("mycurricula:user:theme-frame", frame);
      localStorage.setItem("mycurricula:user:theme", theme);
      localStorage.setItem("mycurricula:user:theme-glass", "dark");
      localStorage.setItem("mycurricula:user:theme-bg", "photo");
      localStorage.setItem("mycurricula:user:theme-dim", "normal");
    },
    [frame, theme],
  );
  // …and the localStorage seed alone is not enough either: cross-device theme
  // sync (lib/theme-sync) reads teacher_preferences and reconciles ON TOP of it,
  // tens of seconds in. On this account the saved frame is `paper`, so a pinned
  // glass run silently became a paper run mid-test — the reconcile is what
  // "made the chip vanish" in two earlier runs. Blocking the read makes
  // loadRemotePrefs resolve `unavailable`, which by contract leaves the local
  // axes alone. Purely a test-isolation measure.
  await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
  return ctx;
}

async function openRoute(ctx, route) {
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}${route}`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const t0 = Date.now();
  // Lessons first (the canvas has data), then the chip (the unit catalog has
  // resolved). Both are polled, not slept through — see HYDRATE_BUDGET_MS.
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
  // A settle beat after the chip lands, so layout/measurement reads a stable
  // frame rather than one mid-paint.
  await page.waitForTimeout(1200);
  return { page, consoleErrors, hydrateMs };
}

// ── Pass 1 — every frame × route renders the chip, no console errors ────────
for (const frame of ["glass", "paper", "color"]) {
  for (const route of ["/daily", "/weekly"]) {
    const ctx = await makeContext({ frame, width: 1440 });
    const { page, consoleErrors, hydrateMs } = await openRoute(ctx, route);
    const label = `${route.slice(1)}-${frame}`;

    // Prove the frame under test is the frame that rendered. Without this an
    // axis that silently reconciled back to the saved preference would let a
    // frame "pass" while a different canvas was on screen — which is exactly
    // how an earlier run mistook a glass→paper flip for the chip vanishing.
    const liveFrame = await page.evaluate(
      () =>
        document.documentElement.dataset.frame ??
        document.querySelector("[data-frame]")?.getAttribute("data-frame") ??
        "",
    );
    check(liveFrame === frame, `frame under test is ${frame} · ${label}`, liveFrame);

    const count = await page.locator(CHIP).count();
    // The paper Week frame (WeekColumns → WeeklyLessonCard) used to be a KNOWN
    // GAP asserted at count === 0 — it delegates its whole tile to the shared
    // card, which carried no unit affordance. Closed by giving that card an
    // opt-in `showUnitChip` prop that only WeekColumns passes, so every frame
    // now owes a chip and this branch is gone.
    check(count > 0, `chip renders · ${label}`, `count=${count} hydrate=${hydrateMs}ms`);

    // DOUBLE-CHIP GUARD — the specific regression the opt-in prop exists to
    // avoid. WeekA/WeekC/WeekEditBoard render their own <UnitChip> in their own
    // tile markup; had the chip gone into WeeklyLessonCard unconditionally (or
    // had one of those frames also delegated to the card), a lesson would show
    // TWO. One chip per lesson tile, on every frame.
    const perLesson = await page.evaluate((sel) => {
      const hosts = [...document.querySelectorAll('[data-planner-item^="lesson:"]')];
      // Only tiles that actually host a chip — a lesson whose unit does not
      // resolve legitimately renders none, and that is not a duplicate.
      const counts = hosts
        .map((h) => h.querySelectorAll(sel).length)
        .filter((n) => n > 0);
      return { hosts: hosts.length, withChip: counts.length, max: Math.max(0, ...counts) };
    }, CHIP);
    check(
      perLesson.max <= 1,
      `no lesson tile shows TWO chips · ${label}`,
      JSON.stringify(perLesson),
    );

    if (count > 0) {
      const info = await page.locator(CHIP).first().evaluate((el) => ({
        tag: el.tagName,
        disabled: el.disabled,
        tabIndex: el.tabIndex,
        text: el.textContent.trim(),
        title: el.getAttribute("title") ?? "",
      }));
      check(
        info.tag === "BUTTON" && !info.disabled && info.tabIndex >= 0,
        `chip is a focusable <button> · ${label}`,
        JSON.stringify(info),
      );
      check(
        info.title.length > 0,
        `chip mirrors a native title= for touch long-press · ${label}`,
        info.title,
      );
    }

    // net::ERR_FAILED entries are OUR OWN teacher_preferences abort (the
    // theme-sync isolation above), not the page's.
    const realErrors = consoleErrors.filter(
      (e) => !/ERR_FAILED|teacher_preferences/.test(e),
    );
    check(
      realErrors.length === 0,
      `no console errors · ${label}`,
      realErrors.slice(0, 3).join(" | "),
    );

    await page.screenshot({
      path: `${SHOTS}/${label}-1440.png`,
      fullPage: false,
    });
    await page.close();
    await ctx.close();
  }
}

// ── Pass 2 — behaviour, on the default (glass) frame, both routes ───────────
for (const route of ["/daily", "/weekly"]) {
  const ctx = await makeContext({ frame: "glass", width: 1440 });
  const { page } = await openRoute(ctx, route);
  const label = route.slice(1);

  // Baseline: URL, scroll, selection.
  const before = await page.evaluate(() => ({
    url: location.href,
    y: window.scrollY,
    overflow: document.body.style.overflow,
    selected: document.querySelector('[aria-pressed="true"]')?.textContent ?? "",
  }));

  // Open by KEYBOARD — Enter on the chip, dispatched by `locator.press` so the
  // focus and the keypress are ONE action against a freshly resolved element.
  // This runs on a settled page, BEFORE the tab-walk below: driving ~25
  // sequential Tab round-trips first left the probe holding a stale element and
  // made this step flake (it opened on a direct mouse click every time, and a
  // no-tab-walk keyboard run opened 5/5 on both routes — so the flake was the
  // instrumentation, not the affordance).
  //
  // Retried ONCE. The chip is in the DOM well before React attaches its
  // handler on this dev server, so an Enter fired at the wrong moment is a
  // no-op — "the element exists" and "the app is listening" are different
  // facts. One retry distinguishes that from an Enter that never works: a
  // genuinely dead keyboard path fails both attempts. `retried` is reported so
  // the timing stays visible rather than being silently absorbed.
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
    dialogs: document.querySelectorAll('[role="dialog"][aria-modal="true"]')
      .length,
    overflow: document.body.style.overflow,
  }));
  check(
    opened.modals === 1,
    `Enter opens the workspace — exactly ONE .ue-modal · ${label}`,
    `${opened.modals}${retried ? " (needed a second Enter — first fired pre-hydration)" : ""}`,
  );
  check(opened.scrims === 1, `exactly ONE .ue-scrim · ${label}`, `${opened.scrims}`);
  check(
    opened.dialogs === 1,
    `exactly ONE aria-modal dialog · ${label}`,
    `${opened.dialogs}`,
  );
  check(
    opened.url === before.url,
    `URL unchanged — pop-in, not navigation · ${label}`,
    `${before.url} → ${opened.url}`,
  );
  check(
    opened.overflow === "hidden",
    `body scroll locked while open · ${label}`,
    opened.overflow,
  );
  await page.screenshot({ path: `${SHOTS}/${label}-workspace-open-1440.png` });

  // Close.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(900);
  const closed = await page.evaluate(() => ({
    modals: document.querySelectorAll(".ue-modal").length,
    overflow: document.body.style.overflow,
    y: window.scrollY,
    selected: document.querySelector('[aria-pressed="true"]')?.textContent ?? "",
  }));
  check(closed.modals === 0, `Escape closes the workspace · ${label}`, `${closed.modals}`);
  check(
    closed.overflow === before.overflow,
    `body overflow released on close · ${label}`,
    `"${before.overflow}" → "${closed.overflow}"`,
  );
  check(
    closed.y === before.y,
    `scroll position preserved · ${label}`,
    `${before.y} → ${closed.y}`,
  );
  check(
    closed.selected === before.selected,
    `chip did NOT steal the card's select · ${label}`,
    `"${before.selected}" → "${closed.selected}"`,
  );

  // KNOWN PRIMITIVE ISSUE, asserted so it stays visible. Activating the chip by
  // KEYBOARD leaves focus on it, and a focus-opened tooltip that carries a
  // `tooltipId` renders `pointer-events: auto` (it hosts the "Turn off these
  // tips" link) and only closes on blur — `handleMouseLeave` never fires because
  // the pointer never entered. So the bubble floats over the lesson title and
  // swallows the first mouse click. Pre-existing components/ui/Tooltip
  // behaviour shared by every dismissible tooltip in the app, not something the
  // chip does; the chip is just the first one parked over a click target. Mouse
  // users (mouseleave closes it) and pure-keyboard users (blur closes it) never
  // see it. Asserted as-is so a Tooltip fix trips this and prompts an update.
  // Focus is set explicitly here rather than inherited from the dialog's
  // focus-restore, so what is measured is the PRIMITIVE, not restore timing.
  await page.locator(CHIP).first().evaluate((el) => el.focus());
  await page.waitForTimeout(500);
  const covered = await page.evaluate(() => {
    const t = document.querySelector(
      '[data-planner-item^="lesson:"] button[aria-pressed]',
    );
    if (!t) return null;
    t.scrollIntoView({ block: "center" });
    const r = t.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { blocked: at !== t && !t.contains(at), by: at?.className ?? "" };
  });
  check(
    covered !== null && covered.blocked && /Tooltip/.test(covered.by),
    `KNOWN Tooltip issue — focus-opened dismissible bubble covers the card until blur · ${label}`,
    JSON.stringify(covered),
  );

  // The card's own click still works: the SelectTitle button selects. Blur
  // first — that is what any real pointer interaction elsewhere does, and it is
  // the state a teacher is actually in when they reach for the card.
  try {
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForTimeout(400);
    const title = page
      .locator('[data-planner-item^="lesson:"] button[aria-pressed]')
      .first();
    // Centre it: the /daily list's first row sits under the sticky day header,
    // and Playwright's actionability check spins on an element a sticky bar
    // covers.
    await title.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(300);
    await title.click({ timeout: 8000 });
    await page.waitForTimeout(600);
    check(
      (await title.getAttribute("aria-pressed")) === "true",
      `card select still works after the chip landed · ${label}`,
    );
  } catch (e) {
    const dbg = await page.evaluate(() => ({
      items: document.querySelectorAll('[data-planner-item^="lesson:"]').length,
      pressed: document.querySelectorAll(
        '[data-planner-item^="lesson:"] button[aria-pressed]',
      ).length,
      modals: document.querySelectorAll(".ue-modal").length,
    }));
    check(
      false,
      `card select still works after the chip landed · ${label}`,
      `${e.message.split("\n")[0]} · ${JSON.stringify(dbg)}`,
    );
  }

  // Keyboard REACHABILITY — Tab from the document top until the chip has focus.
  // A synthetic .focus() would prove nothing; the claim is that a teacher who
  // never touches a mouse arrives here in the natural tab order, so this is a
  // real Tab walk. Deliberately LAST in the pass: it is ~25 sequential
  // round-trips and it perturbs focus + tooltip state for anything after it.
  await page.evaluate(() => document.body.focus());
  await page.keyboard.press("Tab");
  let tabbed = false;
  let tabCount = 0;
  for (let i = 0; i < 150 && !tabbed; i++) {
    tabbed = await page.evaluate(
      (sel) => !!document.activeElement?.matches(sel),
      CHIP,
    );
    if (!tabbed) {
      await page.keyboard.press("Tab");
      tabCount++;
    }
  }
  check(tabbed, `chip is Tab-reachable · ${label}`, `after ${tabCount} tabs`);

  await page.close();
  await ctx.close();
}

// ── Pass 3 — responsive + HIT TEST, true mobile emulation at 375 ────────────
for (const route of ["/daily", "/weekly"]) {
  for (const [width, mobile] of [
    [375, true],
    [768, true],
    [1440, false],
  ]) {
    const ctx = await makeContext({ frame: "glass", width, mobile });
    const { page } = await openRoute(ctx, route);
    const label = `${route.slice(1)}-${width}`;

    const hit = await page.evaluate(([sel, needs44]) => {
      const el = document.querySelector(sel);
      if (!el) return { found: false };
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // Probe the four corners AND the edge midpoints of the 44×44 box the
      // contract owes, then ask what the browser would actually deliver the
      // click to. getBoundingClientRect cannot answer this: it sees neither a
      // transparent hit overlay nor an ancestor clipping one.
      const half = needs44 ? 21.5 : Math.min(21.5, r.height / 2 - 1);
      const pts = [
        [cx, cy],
        [cx - half, cy - half],
        [cx + half, cy - half],
        [cx - half, cy + half],
        [cx + half, cy + half],
        [cx, cy - half],
        [cx, cy + half],
        [cx - half, cy],
        [cx + half, cy],
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
      return {
        found: true,
        rect: `${r.width.toFixed(1)}x${r.height.toFixed(1)}`,
        w: r.width,
        h: r.height,
        misses,
      };
    }, [CHIP, width <= 900]);

    check(hit.found, `chip present · ${label}`);
    if (hit.found) {
      // The ≥44×44 floor is a PHONE/TABLET contract (CLAUDE.md §4). On desktop
      // the chip keeps the Button primitive's own `sm` geometry (32px), so the
      // probe hit-tests the box it actually claims rather than a synthetic 44
      // box whose corners necessarily land on the text above it.
      const needs44 = width <= 900;
      check(
        needs44 ? hit.w >= 44 && hit.h >= 44 : hit.h >= 32,
        needs44
          ? `chip box ≥44×44 · ${label}`
          : `chip keeps the primitive's 32px desktop height · ${label}`,
        hit.rect,
      );
      check(
        hit.misses.length === 0,
        `chip answers the HIT TEST across ${needs44 ? "its 44×44 box" : "its own box"} · ${label}`,
        hit.misses.join(" ; "),
      );
    }

    // Document must never scroll sideways.
    const hScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    check(!hScroll, `no document h-scroll · ${label}`);

    await page.screenshot({ path: `${SHOTS}/${label}.png`, fullPage: false });
    await page.close();
    await ctx.close();
  }
}

// ── Pass 3b — /weekly EDIT mode (WeekEditBoard, the drag board) ─────────────
// The chip replaced an inert <p> that printed the RAW unit id, inside the
// tile's expanded body. Verified separately because Edit mode is a different
// canvas (dnd-kit drag, FLIP) that the view-frame passes never mount.
{
  const ctx = await makeContext({ frame: "glass", width: 1440 });
  const { page } = await openRoute(ctx, "/weekly");
  // Enter Edit through the chrome's own View/Edit toggle rather than seeding
  // `cc_editmode`: the map hydrates in a post-mount effect that is gated on a
  // hydratedRef, so a pre-seeded value did not survive to the canvas here. The
  // toggle is the path a teacher uses anyway.
  // Retry the toggle until the mode actually commits. A single click landed on
  // the button without writing `cc_editmode` when it happened before the
  // chrome's handlers were wired — the DOM is present well ahead of hydration
  // here, so "the click succeeded" and "the app saw the click" are different
  // facts. Loop on the committed state, not on the click.
  for (let i = 0; i < 10; i++) {
    const on = await page.evaluate(
      () => localStorage.getItem("cc_editmode")?.includes('"Week":true') ?? false,
    );
    if (on) break;
    await page
      .getByRole("button", { name: "Edit", exact: true })
      .first()
      .click({ timeout: 10000 })
      .catch(() => {});
    await page.waitForTimeout(1200);
  }

  // Expand a tile — the unit line lives in the expanded body. Polled, not
  // slept through: the shell swaps the whole canvas for WeekEditBoard and the
  // board re-derives its periods, which took longer than a fixed 2.5s beat.
  const expand = page.getByRole("button", { name: "Expand" }).first();
  const inEdit = await expand
    .waitFor({ state: "attached", timeout: 30000 })
    .then(() => true)
    .catch(() => false);
  const editDbg = await page.evaluate(() => ({
    mode: localStorage.getItem("cc_editmode"),
    url: location.pathname,
    labels: [...document.querySelectorAll("button")]
      .map((b) => (b.textContent || "").trim())
      .filter(Boolean)
      .slice(0, 12),
  }));
  check(
    inEdit,
    `weekly EDIT board mounted (WeekEditBoard) · weekly-edit`,
    JSON.stringify(editDbg),
  );
  if (inEdit) {
    await expand.click();
    await page.waitForTimeout(900);
    const count = await page.locator(CHIP).count();
    check(count > 0, `chip renders in the expanded tile · weekly-edit`, `count=${count}`);

    // Same double-chip guard as Pass 1. WeekEditBoard renders its OWN tile
    // markup (it imports only OpenLessonEditorContext from weekly-lesson-card,
    // never the card), so the card's new opt-in chip cannot reach it — this
    // asserts that rather than assuming it.
    const editPerLesson = await page.evaluate((sel) => {
      const counts = [...document.querySelectorAll('[data-planner-item^="lesson:"]')]
        .map((h) => h.querySelectorAll(sel).length)
        .filter((n) => n > 0);
      return { withChip: counts.length, max: Math.max(0, ...counts) };
    }, CHIP);
    check(
      editPerLesson.max <= 1,
      `no tile shows TWO chips · weekly-edit`,
      JSON.stringify(editPerLesson),
    );

    if (count > 0) {
      const raw = await page.evaluate(
        (sel) => document.querySelector(sel)?.textContent?.trim() ?? "",
        CHIP,
      );
      // The old line printed `lesson.unit` verbatim. A resolved name never
      // looks like a slug or a UUID.
      check(
        !/^u-|^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(raw),
        `chip shows a resolved unit NAME, not the raw id · weekly-edit`,
        raw,
      );
      // Baseline AFTER the expand has settled: expanding selects the lesson,
      // and WeeklyShell's URL-sync effect then writes ?week/?lesson/?grade.
      // That write belongs to the expand, not the chip — sampling before it
      // would blame the chip for a URL change it did not make.
      await page.waitForTimeout(1500);
      const before = page.url();
      await page.locator(CHIP).first().click({ timeout: 15000 });
      await page.waitForTimeout(1500);
      const opened = await page.evaluate(() => ({
        modals: document.querySelectorAll(".ue-modal").length,
        overflow: document.body.style.overflow,
      }));
      check(opened.modals === 1, `exactly ONE .ue-modal · weekly-edit`, `${opened.modals}`);
      check(page.url() === before, `URL unchanged · weekly-edit`, page.url());
      check(opened.overflow === "hidden", `body scroll locked · weekly-edit`, opened.overflow);
      await page.screenshot({ path: `${SHOTS}/weekly-edit-workspace-open-1440.png` });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(900);
      check(
        (await page.locator(".ue-modal").count()) === 0,
        `Escape closes · weekly-edit`,
      );
    }
    await page.screenshot({ path: `${SHOTS}/weekly-edit-1440.png` });
  }
  await page.close();
  await ctx.close();
}

// ── Pass 4 — both tones (Clear = light, Night = dark) on the colored frames ──
for (const [frame, route] of [
  ["color", "/daily"],
  ["color", "/weekly"],
]) {
  for (const theme of ["clear", "night"]) {
    const ctx = await makeContext({ frame, theme, width: 1280 });
    const { page } = await openRoute(ctx, route);
    const label = `${route.slice(1)}-${frame}-${theme}`;
    const seen = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        tone: document.documentElement.dataset.tone ?? "",
        color: cs.color,
        background: cs.backgroundColor,
        border: cs.borderColor,
      };
    }, CHIP);
    check(seen !== null, `chip renders · ${label}`, JSON.stringify(seen));
    if (seen) {
      check(
        theme !== "night" || seen.tone === "dark",
        `Night forces data-tone="dark" · ${label}`,
        seen.tone,
      );
    }
    await page.screenshot({ path: `${SHOTS}/${label}-1280.png` });
    await page.close();
    await ctx.close();
  }
}

await browser.close();

// ── Report ──────────────────────────────────────────────────────────────────
const fails = results.filter((r) => !r.ok);
for (const r of results) {
  console.log(`${r.ok ? "  ok  " : "  FAIL"} ${r.name}${r.detail ? `  — ${r.detail}` : ""}`);
}
console.log(`\n${results.length - fails.length}/${results.length} assertions passed`);
if (fails.length) {
  console.log(`\n${fails.length} FAILING:`);
  for (const f of fails) console.log(`  • ${f.name} — ${f.detail}`);
  process.exit(1);
}
