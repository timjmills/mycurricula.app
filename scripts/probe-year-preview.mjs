// scripts/probe-year-preview.mjs — live gate for the /year paper frame: that
// its DEFAULT is untouched, and that the two non-destructive `?preview=`
// candidates render and stay usable.
//
// Context. The 7.21 handoff (`source-home/app.jsx:522`,
// `ViewSet = { A: ViewsA, B: ViewsC, C: ViewsC }`) moves the paper Year to the
// subject-led views. On Year, though, paper is currently the RICHEST frame, so
// adopting that literally would REMOVE capability. The user asked to compare
// the candidates against real data first, so:
//
//   /year                     → TimelineYear   (today's Year — must not move)
//   /year?preview=subject-led → YearC          (the 7.21 target)
//   /year?preview=frame-b     → YearB          (the 7.2 Frame-B row)
//
// WHAT THIS CANNOT PROVE, stated so nobody reads a pass as more than it is: the
// loading and error states. Localhost runs the mock planner path, where
// `effectiveHydration` pins the store to "ready" forever, so no browser here
// can show a pending or failed hydrate. Those are proven deterministically in
// tests/year-paper-frame.test.ts via react-dom/server.
//
// ASSERTS, never just logs. Exits 1 on any failure.
// Usage: node scripts/probe-year-preview.mjs   (PROBE_BASE defaults to :3010)
import { chromium, devices } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3010";
const SHOTS = "docs/screenshots/year-preview";
mkdirSync(SHOTS, { recursive: true });

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync(".env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}

const axes = (frame, theme = "clear") =>
  `v1.${frame}.dark.photo.${theme}.normal.vivid.highlight`;

const results = [];
const check = (ok, name, detail = "") => {
  results.push({ ok, name, detail });
  console.log(
    `${ok ? "  ok  " : "  FAIL"} ${name}${detail ? `  — ${detail}` : ""}`,
  );
};

const browser = await chromium.launch({ channel: "chrome" });

const auth = await browser.newContext();
{
  const boot = await auth.newPage();
  await boot.goto(
    `${BASE}/auth/claude-login?token=${encodeURIComponent(token)}&next=/year`,
    { waitUntil: "domcontentloaded", timeout: 60000 },
  );
  await boot.waitForTimeout(2500);
  await boot.close();
}
const storageState = await auth.storageState();
await auth.close();

async function makeContext({ width, mobile }) {
  const ctx = await browser.newContext({
    storageState,
    ...(mobile
      ? { ...devices["iPhone 14 Pro"], viewport: { width, height: 780 } }
      : { viewport: { width, height: 900 } }),
  });
  await ctx.addCookies([
    { name: "mc-theme-axes", value: axes("paper"), url: BASE },
  ]);
  await ctx.addInitScript(() => {
    localStorage.setItem(
      "mycurricula:onboarding",
      JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
    );
    localStorage.setItem("mycurricula:user:theme-frame", "paper");
    localStorage.setItem("mycurricula:user:theme", "clear");
    localStorage.setItem("mycurricula:user:theme-glass", "dark");
    localStorage.setItem("mycurricula:user:theme-bg", "photo");
    localStorage.setItem("mycurricula:user:theme-dim", "normal");
  });
  // Aborting the preferences read is ISOLATION, and is what every other frame
  // probe in this folder does: the shared bypass account has its own saved
  // frame, and theme-sync reconciles it on top 10–45s after hydrate, which
  // would swap the surface out from under the assertions. It does mean this
  // probe says nothing about theme-sync itself — that path is owned by
  // scripts/probe-theme-wave.mjs, and nothing here touches it.
  await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
  return ctx;
}

/**
 * Navigate, and ASSERT THE ROUTE ACTUALLY RENDERED before anything else.
 *
 * Added after a real miss: moving the `?preview=` parser into the route made a
 * server component call a function exported from a "use client" module, and
 * /year returned 500 with the app's "SOMETHING BROKE" boundary. Every unit test
 * still passed — vitest imports modules plainly and has no server/client
 * boundary — and this probe reported it only as "waiting for locator
 * '[data-scope]'… timeout", which reads like a missing element rather than a
 * dead route. A status check names the failure in one line.
 */
async function goto(page, url) {
  const resp = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  const status = resp?.status() ?? 0;
  const broke = await page
    .locator("text=SOMETHING BROKE")
    .count()
    .catch(() => 0);
  check(
    status === 200 && broke === 0,
    `${url.replace(BASE, "")} renders (HTTP 200, no error boundary)`,
    `status ${status}${broke ? ", error boundary shown" : ""}`,
  );
  return status === 200 && broke === 0;
}

function watchConsole(page) {
  const errors = [];
  const knownHydrationMismatches = [];
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // Our own doing — the aborted preferences route above.
    if (/net::ERR_FAILED/.test(text)) return;
    // PRE-EXISTING, measured rather than assumed: an intermittent React
    // `useId` attribute mismatch on the PAPER frame. Controls, phone tier,
    // 2026-07-31 — /year paper 1/3 loads, /year glass 0/3, /weekly paper 2/3,
    // /planner paper 0/3. It reproduces MORE often on /weekly, a route this
    // change never touches. The matcher is deliberately NARROW: it requires
    // the useId signature `id="_R_` in the diff body, so a STRUCTURAL mismatch
    // (an extra node, changed text, a changed class) does not qualify and
    // still fails. Occurrences are counted, so a proliferation cannot hide
    // behind the known one either.
    if (
      /hydrated but some attributes of the server rendered HTML/.test(text) &&
      /id="_R_/.test(text)
    ) {
      knownHydrationMismatches.push(text);
      return;
    }
    errors.push(text);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return { errors, knownHydrationMismatches };
}

/** Wait for React to attach to a real element — not a sleep. The SSR markup is
 *  present long before the listeners are, and clicking early reports "nothing
 *  happens" for a surface that works. A genuine wiring break still fails: the
 *  fiber arrives, and the click still does nothing. */
async function waitForHydration(locator) {
  await locator.evaluate(
    (el) =>
      new Promise((resolve, reject) => {
        const t0 = Date.now();
        const tick = () => {
          if (
            Object.keys(el).some(
              (k) =>
                k.startsWith("__reactFiber") || k.startsWith("__reactProps"),
            )
          )
            return resolve(true);
          if (Date.now() - t0 > 40000) return reject(new Error("no hydrate"));
          setTimeout(tick, 200);
        };
        tick();
      }),
    { timeout: 45000 },
  );
}

// ── 1. The DEFAULT paper Year must not have moved ───────────────────────────
{
  const ctx = await makeContext({ width: 1440, mobile: false });
  const page = await ctx.newPage();
  const { errors } = watchConsole(page);
  await goto(page, `${BASE}/year`);
  await page.waitForSelector("[data-scope]", { timeout: 45000 });
  // `data-scope` is TimelineYear's root attribute; `data-year-frame` belongs to
  // the v2 views. Both are asserted, because "the right one rendered" and
  // "the wrong one did not" are separate claims.
  check(true, "default /year on paper still renders TimelineYear");
  check(
    (await page.locator("[data-year-frame]").count()) === 0,
    "default /year on paper renders NO preview view",
  );
  check(
    (await page.locator("[data-year-state]").count()) === 0,
    "the data-state guard lifts once the store settles",
  );
  await page.screenshot({ path: `${SHOTS}/paper-default-1440.png` });
  check(errors.length === 0, "default: no console errors", errors[0] ?? "");
  await ctx.close();
}

// ── 2. ?preview=subject-led — the 7.21 target (YearC constellation) ─────────
{
  const ctx = await makeContext({ width: 1440, mobile: false });
  const page = await ctx.newPage();
  const { errors } = watchConsole(page);
  await goto(page, `${BASE}/year?preview=subject-led`);
  const cluster = page.locator("[data-year-cluster]").first();
  await cluster.waitFor({ state: "visible", timeout: 45000 });
  check(
    (await page.locator("[data-year-cluster]").count()) > 0,
    "?preview=subject-led renders the subject constellation",
    `${await page.locator("[data-year-cluster]").count()} clusters`,
  );
  check(
    (await page.locator("[data-scope]").count()) === 0,
    "?preview=subject-led replaces TimelineYear rather than sitting beside it",
  );
  // A disc must still open the unit workspace, or the candidate is a dead end.
  const node = cluster.locator("button").first();
  await waitForHydration(node);
  await node.click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  let opened = true;
  await dialog
    .first()
    .waitFor({ state: "visible", timeout: 8000 })
    .catch(() => {
      opened = false;
    });
  check(opened, "?preview=subject-led: a unit disc opens the unit workspace");
  if (opened) {
    await page.keyboard.press("Escape");
    await dialog
      .first()
      .waitFor({ state: "hidden", timeout: 8000 })
      .catch(() => {});
  }
  await page.screenshot({ path: `${SHOTS}/paper-subject-led-1440.png` });
  check(errors.length === 0, "subject-led: no console errors", errors[0] ?? "");
  await ctx.close();
}

// ── 3. ?preview=frame-b — the 7.2 Frame-B row, at all three tiers ───────────
const TIERS = [
  { label: "phone-375", width: 375, mobile: true },
  { label: "tablet-768", width: 768, mobile: true },
  { label: "desktop-1440", width: 1440, mobile: false },
];

for (const tier of TIERS) {
  const ctx = await makeContext(tier);
  const page = await ctx.newPage();
  const { errors, knownHydrationMismatches } = watchConsole(page);

  await goto(page, `${BASE}/year?preview=frame-b`);

  const frame = await page
    .locator("[data-frame]")
    .first()
    .getAttribute("data-frame");
  check(
    frame === "paper",
    `${tier.label}: server resolved data-frame=paper`,
    `got ${frame}`,
  );

  await page.waitForSelector('[data-year-frame="paper"]', { timeout: 45000 });
  check(true, `${tier.label}: ?preview=frame-b renders YearB`);
  check(
    (await page.locator("[data-scope]").count()) === 0,
    `${tier.label}: TimelineYear is not also mounted`,
  );

  const rows = await page.locator("[data-year-row]").count();
  check(rows > 0, `${tier.label}: subject rows render`, `${rows} rows`);

  const pills = page.locator("[data-year-pill]");
  const pillCount = await pills.count();
  check(pillCount > 0, `${tier.label}: unit pills render`, `${pillCount} pills`);

  if (tier.mobile && pillCount > 0) {
    const box = await pills.first().boundingBox();
    check(
      box !== null && box.height >= 44,
      `${tier.label}: unit pill ≥44px tall`,
      `${box ? Math.round(box.height) : "?"}px`,
    );
  }

  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  check(
    overflow.doc <= overflow.win + 1,
    `${tier.label}: no document horizontal scroll`,
    `scrollWidth ${overflow.doc} vs ${overflow.win}`,
  );

  // A subject row must read as ONE thing: the name, the track it describes and
  // the % on the same optical line. Measured, not eyeballed — the first tablet
  // screenshot LOOKED like the name had vanished, and it had not.
  const align = await page
    .locator("[data-year-row]")
    .first()
    .evaluate((row) => {
      const track = row
        .querySelector("[data-year-seg]")
        ?.getBoundingClientRect().top;
      const name = row.firstElementChild?.getBoundingClientRect().top;
      return name == null || track == null ? null : Math.round(track - name);
    });
  check(
    align !== null && Math.abs(align) < 60,
    `${tier.label}: subject name sits level with its track`,
    `${align}px apart`,
  );

  // VIEWPORT, not fullPage. This app shell scrolls #main-content rather than
  // the document, and Playwright's fullPage stitching over an inner scroller
  // produces a misaligned composite — the 768 one showed a subject row with an
  // empty name column that the DOM proved was populated and visible.
  await page.screenshot({ path: `${SHOTS}/paper-frame-b-${tier.label}.png` });

  // Sampled across SUBJECTS, not just the first pill. "Every unit is still
  // reachable" is the whole claim; a single click would pass while every later
  // row's pills were inert, or while they all opened the same unit.
  if (pillCount > 0) {
    const dialog = page.locator('[role="dialog"][aria-modal="true"]');
    const rowIds = await page
      .locator("[data-year-row]")
      .evaluateAll((els) => els.map((e) => e.getAttribute("data-year-row")));
    const sampled = [rowIds[0], rowIds[1], rowIds[rowIds.length - 1]].filter(
      (id, i, a) => id && a.indexOf(id) === i,
    );

    for (const rowId of sampled) {
      const pill = page
        .locator(`[data-year-row="${rowId}"] [data-year-pill]`)
        .first();
      const label = (await pill.textContent())?.trim() ?? "";
      await waitForHydration(pill);
      await pill.click();
      let opened = false;
      let named = false;
      try {
        await dialog.first().waitFor({ state: "visible", timeout: 8000 });
        opened = true;
        named = label.length > 0 && (await dialog.first().innerText()).includes(label);
      } catch {
        opened = false;
      }
      check(opened, `${tier.label}: ${rowId} — a unit pill opens the workspace`);
      check(
        named,
        `${tier.label}: ${rowId} — the workspace opens on the clicked unit`,
        `pill “${label}”`,
      );
      if (opened) {
        await page.keyboard.press("Escape");
        await dialog
          .first()
          .waitFor({ state: "hidden", timeout: 8000 })
          .catch(() => {});
      }
    }
  }

  check(
    errors.length === 0,
    `${tier.label}: no console errors`,
    errors.slice(0, 3).join(" | "),
  );
  check(
    knownHydrationMismatches.length <= 1,
    `${tier.label}: at most the ONE known useId hydration mismatch`,
    `${knownHydrationMismatches.length} seen`,
  );

  await ctx.close();
}

// ── 4. An unrecognised preview must not blank the page ──────────────────────
{
  const ctx = await makeContext({ width: 1440, mobile: false });
  const page = await ctx.newPage();
  await goto(page, `${BASE}/year?preview=nonsense`);
  await page.waitForSelector("[data-scope]", { timeout: 45000 });
  check(true, "an unrecognised ?preview= falls back to today's Year");
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`,
);
if (failed.length > 0) {
  console.log("FAILED:");
  for (const f of failed) console.log(`  • ${f.name} — ${f.detail}`);
  process.exit(1);
}
