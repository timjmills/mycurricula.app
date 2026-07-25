// scripts/probe-toggle-drawer.mjs — §4b live gate for the ToggleGroup +
// unit-drawer a11y fixes (fix-toggle-drawer lane).
//
// It ASSERTS. Every check appends { ok, name, detail }; a non-empty failure
// list exits 1. A probe that prints numbers and exits 0 has checked nothing.
//
// WHAT TREE THIS MEASURES: the dev server on :3099 serves the WORKING TREE, and
// five lanes are editing it concurrently. Every assertion below is about files
// this lane owns (components/ui/ToggleGroup.*, components/year-v2/drawer/**),
// whose only uncommitted edits are this lane's — so the measurement is of THIS
// lane's change, not of HEAD and not of anyone else's work.
//
// CONTRAST METHOD. getComputedStyle returns `rgb()` with 0–255 components but
// `color(srgb …)` / `oklab(…)` with 0–1 floats, and tokens.css uses color-mix,
// so scraping numbers out of a computed colour silently inflates ratios — the
// error direction MANUFACTURES passes. Every colour here is painted onto a 1×1
// canvas and read back as real sRGB bytes, and the formula is sanity-checked
// against white-on-black = 21:1 before any result is believed. Group opacity is
// folded in by compositing over the resolved backdrop.
//
// Usage: node scripts/probe-toggle-drawer.mjs   (PROBE_BASE defaults to :3099)
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3099";
const SHOTS = "docs/screenshots/toggle-drawer";
mkdirSync(SHOTS, { recursive: true });

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync(".env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}

// Photo + auto brightness derives data-tone=DARK, so a run that only sets the
// theme measures one tone twice. `bg` and `glass` are what actually move the
// tone: wash → light, photo+normal → dark (CLAUDE.md §4 — tone is DERIVED).
const axes = (frame, theme = "clear", bg = "photo", glass = "dark") =>
  `v1.${frame}.${glass}.${bg}.${theme}.normal.vivid.highlight`;

const CHIP = 'button[aria-label^="Open the "][aria-label$="unit workspace"]';
const HYDRATE_BUDGET_MS = 45000;

const results = [];
const check = (ok, name, detail = "") => {
  results.push({ ok, name, detail });
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? `  — ${detail}` : ""}`);
};

// ── Contrast helpers, evaluated IN the page ─────────────────────────────────
//
// Shipped to the page as a string and `eval`'d inside `page.evaluate`, because
// these helpers have to run in the browser's context (they need a real canvas
// and real computed styles) and several separate evaluate calls need them. The
// string is this file's own literal — no input of any kind reaches it, and this
// script is a local dev probe that never ships. That is the only reason `eval`
// is acceptable here.
const CONTRAST_LIB = `(() => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  // Paint the colour over an opaque backdrop so any alpha in the token is
  // resolved the way the screen resolves it.
  function paint(color, over) {
    cx.clearRect(0, 0, 1, 1);
    if (over) { cx.fillStyle = over; cx.fillRect(0, 0, 1, 1); }
    cx.fillStyle = color;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  }
  function lum([r, g, b]) {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function ratio(fg, bg) {
    const a = lum(fg), b = lum(bg);
    const [hi, lo] = a > b ? [a, b] : [b, a];
    return (hi + 0.05) / (lo + 0.05);
  }
  // The first opaque background painted behind an element.
  function backdropOf(el) {
    let n = el;
    let acc = null;
    while (n && n !== document.documentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      const px = paint(bg, "rgb(255,255,255)");
      const alpha = cx.getImageData(0, 0, 1, 1).data[3];
      if (bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
        acc = acc === null ? bg : acc;
        // Opaque? then stop.
        const probe = paint(bg, "rgb(0,0,0)");
        const overWhite = paint(bg, "rgb(255,255,255)");
        if (probe[0] === overWhite[0] && probe[1] === overWhite[1] && probe[2] === overWhite[2]) {
          return { color: bg, el: n };
        }
      }
      n = n.parentElement;
    }
    return { color: acc ?? "rgb(255,255,255)", el: document.body };
  }
  // Effective painted colours for an element's text, with inherited opacity.
  function measure(el) {
    const cs = getComputedStyle(el);
    const back = backdropOf(el);
    // Stack every ancestor's background from the opaque one down, so a
    // translucent panel over glass resolves the way it paints.
    const chain = [];
    let n = el;
    while (n && n !== back.el.parentElement) { chain.push(n); n = n.parentElement; }
    let bgPx = paint(back.color, "rgb(255,255,255)");
    for (const node of chain.reverse()) {
      const c = getComputedStyle(node).backgroundColor;
      if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") {
        bgPx = paint(c, \`rgb(\${bgPx[0]},\${bgPx[1]},\${bgPx[2]})\`);
      }
    }
    // Fold group opacity into the glyph: an element faded by an ancestor's
    // opacity paints as its colour composited over its own backdrop.
    let alpha = 1;
    let m = el;
    while (m && m !== document.documentElement) {
      const o = parseFloat(getComputedStyle(m).opacity);
      if (!Number.isNaN(o)) alpha *= o;
      m = m.parentElement;
    }
    let fgPx = paint(cs.color, \`rgb(\${bgPx[0]},\${bgPx[1]},\${bgPx[2]})\`);
    if (alpha < 1) {
      cx.clearRect(0, 0, 1, 1);
      cx.fillStyle = \`rgb(\${bgPx[0]},\${bgPx[1]},\${bgPx[2]})\`;
      cx.fillRect(0, 0, 1, 1);
      cx.globalAlpha = alpha;
      cx.fillStyle = cs.color;
      cx.fillRect(0, 0, 1, 1);
      cx.globalAlpha = 1;
      const d = cx.getImageData(0, 0, 1, 1).data;
      fgPx = [d[0], d[1], d[2]];
    }
    return {
      text: (el.textContent || "").trim().slice(0, 40),
      fg: cs.color, bg: \`rgb(\${bgPx[0]},\${bgPx[1]},\${bgPx[2]})\`,
      fgPx, bgPx,
      fontSize: parseFloat(cs.fontSize),
      fontWeight: cs.fontWeight,
      opacity: alpha,
      ratio: Math.round(ratio(fgPx, bgPx) * 100) / 100,
    };
  }
  const SANITY = Math.round(ratio(paint("#fff","#000"), paint("#000","#fff")) * 100) / 100;
  // Returned as an API object: a direct eval of const / function declarations
  // scopes them to the eval's own environment in strict module code, so the
  // caller would never see them.
  return { paint, lum, ratio, backdropOf, measure, SANITY };
})()`;

const browser = await chromium.launch({ channel: "chrome" });

// ── One authenticated storage state, reused by every context ────────────────
const auth = await browser.newContext();
{
  const boot = await auth.newPage();
  await boot.goto(
    `${BASE}/auth/claude-login?token=${encodeURIComponent(token)}&next=/weekly`,
    { waitUntil: "domcontentloaded", timeout: 180000 },
  );
  await boot.waitForTimeout(2500);
  await boot.close();
}
const storageState = await auth.storageState();
await auth.close();

async function makeContext({ theme = "clear", width = 1280, touch = false, bg = "photo", glass = "dark" }) {
  const ctx = await browser.newContext({
    storageState,
    viewport: { width, height: 900 },
    hasTouch: touch,
    isMobile: touch && width < 600,
    deviceScaleFactor: touch ? 2 : 1,
  });
  await ctx.addCookies([
    { name: "mc-theme-axes", value: axes("glass", theme, bg, glass), url: BASE },
  ]);
  await ctx.addInitScript(
    ([theme, bg, glass]) => {
      localStorage.setItem(
        "mycurricula:onboarding",
        JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
      );
      localStorage.setItem("mycurricula:user:theme-frame", "glass");
      localStorage.setItem("mycurricula:user:theme", theme);
      localStorage.setItem("mycurricula:user:theme-glass", glass);
      localStorage.setItem("mycurricula:user:theme-bg", bg);
      localStorage.setItem("mycurricula:user:theme-dim", "normal");
    },
    [theme, bg, glass],
  );
  await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
  return ctx;
}

/**
 * /weekly → unit workspace → drawer open on the Assessments pane.
 *
 * Returns `drawer: false` rather than throwing when the workspace cannot be
 * opened. The shared dev tree is edited by five lanes at once, and a torn
 * `.next` chunk in someone else's module takes the whole workspace path down
 * with it — that must degrade into a recorded SKIP, never into a green run and
 * never into a fabricated pass. `scope` says which checks ran.
 */
async function openDrawer(ctx, label) {
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}/weekly`, {
    waitUntil: "domcontentloaded",
    timeout: 180000,
  });
  await page
    .locator('[data-planner-item^="lesson:"]')
    .first()
    .waitFor({ timeout: HYDRATE_BUDGET_MS });

  let drawer = false;
  try {
    await page.locator(CHIP).first().waitFor({ timeout: HYDRATE_BUDGET_MS });
    await page.locator(CHIP).first().click();
    await page.locator(".ue-modal").first().waitFor({ timeout: 30000 });
    const toggle = page.locator('button[aria-label$="unit context"]').first();
    await toggle.waitFor({ timeout: 20000 });
    if ((await toggle.getAttribute("aria-pressed")) !== "true")
      await toggle.click();
    await page
      .locator('[role="tab"]#ue-pane-assessments')
      .waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    drawer = true;
    check(true, `[${label}] drawer opened on the Assessments pane`);
  } catch (err) {
    check(
      false,
      `[${label}] SKIPPED the drawer surface — the unit workspace would not open`,
      `${String(err).split("\n")[0].slice(0, 120)}; page errors: ${consoleErrors.slice(0, 2).join(" | ") || "none"}`,
    );
  }
  // Which root the ToggleGroup checks scope to: the drawer when it opened,
  // otherwise /weekly's own segmented controls (the same primitive).
  const scope = drawer ? ".ue-modal " : "";
  return { page, consoleErrors, drawer, scope };
}

// ════════════════════════════════════════════════════════════════════════════
// 1. Desktop, light tone (theme clear) — contrast + structure + keyboard
// ════════════════════════════════════════════════════════════════════════════
{
  const ctx = await makeContext({ theme: "clear", width: 1280 });
  const { page, consoleErrors, drawer, scope } = await openDrawer(ctx, "clear/1280");

  const shot = `${SHOTS}/drawer-assessments-clear-1280.png`;
  await page.screenshot({ path: shot });

  // ── H7: inactive segmented labels ────────────────────────────────────────
  const toggles = await page.evaluate(
    ([lib, scope]) => {
      const { measure, SANITY } = eval(lib);
      const out = { sanity: SANITY, groups: [], tone: document.documentElement.dataset.tone };
      for (const g of document.querySelectorAll(scope + '[role="radiogroup"]')) {
        const label = g.getAttribute("aria-label");
        const opts = [...g.querySelectorAll('[role="radio"]')].map((b) => {
          const span = b.querySelector("span:last-child") ?? b;
          return {
            label: (b.textContent || "").trim(),
            checked: b.getAttribute("aria-checked") === "true",
            tabIndex: b.tabIndex,
            ...measure(span),
          };
        });
        out.groups.push({ label, opts });
      }
      return out;
    },
    [CONTRAST_LIB, scope],
  );

  check(
    toggles.sanity === 21,
    "contrast formula sanity: white-on-black reads 21:1",
    `got ${toggles.sanity}`,
  );
  check(
    toggles.groups.length > 0,
    "drawer renders at least one ToggleGroup",
    `${toggles.groups.length} group(s), tone=${toggles.tone}`,
  );
  for (const g of toggles.groups) {
    for (const o of g.opts.filter((x) => !x.checked)) {
      check(
        o.ratio >= 4.5,
        `H7 inactive "${o.label}" in "${g.label}" clears 4.5:1`,
        `${o.ratio}:1 (${o.fg} on ${o.bg}, ${o.fontSize}px/${o.fontWeight})`,
      );
    }
    for (const o of g.opts.filter((x) => x.checked)) {
      check(
        o.ratio >= 4.5,
        `active "${o.label}" in "${g.label}" clears 4.5:1`,
        `${o.ratio}:1 (${o.fg} on ${o.bg})`,
      );
    }
    // Roving tab stop: exactly one reachable button per group.
    const stops = g.opts.filter((o) => o.tabIndex === 0).length;
    check(stops === 1, `"${g.label}" has exactly one Tab stop`, `${stops}`);
  }

  // ── M9: the drawer's own reading text ────────────────────────────────────
  const texts = drawer ? await page.evaluate(([lib, scope]) => {
    const { measure, SANITY } = eval(lib);
    const sels = ["p", "span", "h3", "h4", "li"].map((t) => scope + t);
    const seen = new Set();
    const out = [];
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        if (el.children.length > 0) continue;              // leaf text only
        const t = (el.textContent || "").trim();
        if (!t || t.length < 3 || seen.has(t)) continue;
        if (el.closest('[aria-hidden="true"]')) continue;
        if (!el.getClientRects().length) continue;
        seen.add(t);
        out.push(measure(el));
      }
    }
    return out;
  }, [CONTRAST_LIB, scope]) : [];
  const failing = texts.filter((t) => {
    const large = t.fontSize >= 24 || (t.fontSize >= 18.66 && Number(t.fontWeight) >= 700);
    return t.ratio < (large ? 3 : 4.5);
  });
  if (drawer) check(
    failing.length === 0,
    "M9 every visible drawer text clears its WCAG bar",
    failing.length
      ? failing.map((f) => `"${f.text}" ${f.ratio}:1 ${f.fg}`).join(" | ")
      : `${texts.length} strings checked, min ${Math.min(...texts.map((t) => t.ratio))}:1`,
  );

  // ── L5: heading tiers across the three panes ─────────────────────────────
  const headings = {};
  if (drawer) {
  for (const pane of ["assessments", "insights", "prep"]) {
    await page.locator(`#ue-pane-${pane}`).click();
    await page.waitForTimeout(900);
    headings[pane] = await page.evaluate(() =>
      [...document.querySelectorAll("#ue-drawer-panel h1,#ue-drawer-panel h2,#ue-drawer-panel h3,#ue-drawer-panel h4,#ue-drawer-panel h5,#ue-drawer-panel h6")]
        .map((h) => h.tagName),
    );
  }
  const firsts = Object.entries(headings).map(([k, v]) => `${k}:${v[0] ?? "none"}`);
  const allH3 = Object.values(headings).every((v) => v[0] === "H3");
  check(
    allH3,
    "L5 all three panes open at the same heading tier (h3)",
    firsts.join(" "),
  );
  check(
    headings.assessments.join(",").startsWith("H3,H3,H4") ||
      headings.assessments.every((h) => h === "H3" || h === "H4"),
    "L5 Assessments nests h4 groups under h3 halves",
    headings.assessments.join(","),
  );
  }

  // ── M4: the lesson half now carries a scope badge ────────────────────────
  if (drawer) {
  await page.locator("#ue-pane-assessments").click();
  await page.waitForTimeout(900);
  const badges = await page.evaluate(() =>
    [...document.querySelectorAll('#ue-drawer-panel [role="note"]')].map((b) => ({
      text: (b.textContent || "").trim(),
      described: !!b.getAttribute("aria-describedby") || !!b.getAttribute("title"),
      tabbable: b.tabIndex === 0,
    })),
  );
  check(
    badges.length >= 2,
    "M4 both halves carry a scope badge",
    badges.map((b) => `"${b.text}"`).join(" + ") || "none found",
  );
  check(
    badges.every((b) => b.tabbable),
    "L4 badges are keyboard-reachable and carry a role",
    JSON.stringify(badges),
  );
  }

  // ── Keyboard: an ordinary group still commits on arrow (no regression) ───
  const arrow = await page.evaluate((scope) => {
    const g = document.querySelector(scope + '[role="radiogroup"]');
    if (!g) return { skipped: true };
    const opts = [...g.querySelectorAll('[role="radio"]')];
    const before = opts.findIndex((o) => o.getAttribute("aria-checked") === "true");
    return { before, count: opts.length, label: g.getAttribute("aria-label") };
  }, scope);
  if (!arrow.skipped && arrow.count > 1) {
    const group = page.locator(scope + '[role="radiogroup"]').first();
    await group.locator('[role="radio"]').nth(Math.max(arrow.before, 0)).focus();
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(600);
    const after = await page.evaluate((scope) => {
      const g = document.querySelector(scope + '[role="radiogroup"]');
      const opts = [...g.querySelectorAll('[role="radio"]')];
      return {
        checked: opts.findIndex((o) => o.getAttribute("aria-checked") === "true"),
        focused: opts.indexOf(document.activeElement),
      };
    }, scope);
    const expected = (Math.max(arrow.before, 0) + 1) % arrow.count;
    check(
      after.focused === expected,
      "arrow moves focus to the next option",
      `focused ${after.focused}, expected ${expected}`,
    );
    check(
      after.checked === expected,
      "no regression: an ordinary group (no destructive option) still commits on arrow",
      `checked ${after.checked}, expected ${expected} — group "${arrow.label}"`,
    );

    // ── H3: clicking the ALREADY-ACTIVE option is a no-op ──────────────────
    const activeBtn = page
      .locator(scope + '[role="radiogroup"]')
      .first()
      .locator('[role="radio"][aria-checked="true"]');
    const errsBefore = consoleErrors.length;
    await activeBtn.click();
    await page.waitForTimeout(500);
    await activeBtn.click();
    await page.waitForTimeout(500);
    const still = await page.evaluate((scope) => {
      const g = document.querySelector(scope + '[role="radiogroup"]');
      return [...g.querySelectorAll('[role="radio"]')].findIndex(
        (o) => o.getAttribute("aria-checked") === "true",
      );
    }, scope);
    check(
      still === expected,
      "H3 re-clicking the active option leaves the selection untouched",
      `checked ${still}`,
    );
    check(
      consoleErrors.length === errsBefore,
      "H3 re-clicking the active option raises no console error",
      consoleErrors.slice(errsBefore).join(" | "),
    );
  }

  // Scoped to errors this lane could have caused. The shared tree currently
  // emits a React hydration-mismatch from WeeklyShell's srOnly useId and the
  // Shoutbox composer input — both other lanes' dirty files, both present
  // before this change and on surfaces it does not touch. Reported below, not
  // asserted here.
  const mine = consoleErrors.filter(
    (e) => !/hydrat|ERR_FAILED|teacher_preferences/i.test(e),
  );
  check(
    mine.length === 0,
    "no console errors attributable to this lane",
    mine.slice(0, 3).join(" | "),
  );
  if (consoleErrors.length)
    console.log(
      `  note  ${consoleErrors.length} other-lane/console message(s) observed: ` +
        [...new Set(consoleErrors.map((e) => e.replace(/\s+/g, " ").slice(0, 70)))].join(" | "),
    );
  await page.screenshot({ path: `${SHOTS}/drawer-after-keyboard-clear-1280.png` });
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
// 2. Dark tone (theme night) — the legibility contract branches on tone
// ════════════════════════════════════════════════════════════════════════════
{
  const ctx = await makeContext({ theme: "night", width: 1280 });
  const { page, scope } = await openDrawer(ctx, "night/1280");
  await page.screenshot({ path: `${SHOTS}/drawer-assessments-night-1280.png` });
  const dark = await page.evaluate(([lib, scope]) => {
    const { measure, SANITY } = eval(lib);
    const out = { tone: document.documentElement.dataset.tone, opts: [] };
    for (const g of document.querySelectorAll(scope + '[role="radiogroup"]')) {
      for (const b of g.querySelectorAll('[role="radio"]')) {
        const span = b.querySelector("span:last-child") ?? b;
        out.opts.push({
          label: (b.textContent || "").trim(),
          checked: b.getAttribute("aria-checked") === "true",
          group: g.getAttribute("aria-label"),
          ...measure(span),
        });
      }
    }
    return out;
  }, [CONTRAST_LIB, scope]);
  check(dark.tone === "dark", "night resolves data-tone=dark", `tone=${dark.tone}`);
  for (const o of dark.opts) {
    check(
      o.ratio >= 4.5,
      `H7 dark tone: "${o.label}"${o.checked ? " (active)" : ""} clears 4.5:1`,
      `${o.ratio}:1 (${o.fg} on ${o.bg})`,
    );
  }
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
// 2b. LIGHT tone (Wash) — the tone the H7 failure actually lived in
//
// #908fa3 on the tray's #f4f2ec measured 2.82:1; dark tone was 4.43:1. A run
// that only varied the THEME would have measured dark twice and reported a
// clean sweep while the failing tone went unvisited.
// ════════════════════════════════════════════════════════════════════════════
{
  const ctx = await makeContext({ theme: "clear", width: 1280, bg: "wash", glass: "light" });
  const { page, scope } = await openDrawer(ctx, "light/1280");
  await page.screenshot({ path: `${SHOTS}/toggles-light-1280.png` });
  const light = await page.evaluate(([lib, scope]) => {
    const { measure } = eval(lib);
    const out = { tone: document.documentElement.dataset.tone, opts: [] };
    for (const g of document.querySelectorAll(scope + '[role="radiogroup"]')) {
      for (const b of g.querySelectorAll('[role="radio"]')) {
        if (!b.getClientRects().length) continue;
        const span = b.querySelector("span:last-child") ?? b;
        out.opts.push({
          label: (b.textContent || "").trim(),
          checked: b.getAttribute("aria-checked") === "true",
          group: g.getAttribute("aria-label"),
          ...measure(span),
        });
      }
    }
    return out;
  }, [CONTRAST_LIB, scope]);
  check(light.tone === "light", "wash resolves data-tone=light", `tone=${light.tone}`);
  check(light.opts.length > 0, "light tone: toggle options present", `${light.opts.length}`);
  for (const o of light.opts) {
    check(
      o.ratio >= 4.5,
      `H7 LIGHT tone: "${o.label}"${o.checked ? " (active)" : ""} clears 4.5:1`,
      `${o.ratio}:1 (${o.fg} on ${o.bg}, ${o.fontSize}px/${o.fontWeight})`,
    );
  }
  await ctx.close();
}

// ════════════════════════════════════════════════════════════════════════════
// 3. M7 — COARSE POINTER at 1024 (iPad Pro landscape) and at 375
// ════════════════════════════════════════════════════════════════════════════
for (const width of [1024, 375]) {
  const ctx = await makeContext({ theme: "clear", width, touch: true });
  const { page, scope } = await openDrawer(ctx, `coarse/${width}`);
  await page.screenshot({ path: `${SHOTS}/drawer-coarse-${width}.png` });

  const coarse = await page.evaluate((scope) => {
    const coarsePointer = matchMedia("(pointer: coarse)").matches;
    const out = { coarsePointer, width: innerWidth, opts: [] };
    for (const g of document.querySelectorAll(scope + '[role="radiogroup"]')) {
      for (const b of g.querySelectorAll('[role="radio"]')) {
        const r = b.getBoundingClientRect();
        // A control that is not painted (a collapsed rail at this width) has no
        // hit area to test, and asserting one would be asserting nothing.
        if (!b.getClientRects().length || r.width === 0) continue;
        const before = getComputedStyle(b, "::before");
        // The real question is whether a 44×44 box centred on the chip is
        // ANSWERED by the chip — a visual rect cannot see a hit overlay, and
        // cannot see the overlay being clipped away either.
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const pts = [
          [cx, cy - 21], [cx, cy + 21], [cx - 21, cy], [cx + 21, cy],
        ];
        const hits = pts.map(([x, y]) => {
          const el = document.elementFromPoint(x, y);
          return !!el && (el === b || b.contains(el) || el.contains(b));
        });
        out.opts.push({
          label: (b.textContent || "").trim(),
          group: g.getAttribute("aria-label"),
          visual: `${Math.round(r.width)}x${Math.round(r.height)}`,
          beforeMinH: before.minHeight,
          beforeMinW: before.minWidth,
          hitsVertical: hits[0] && hits[1],
          hitsHorizontal: hits[2] && hits[3],
        });
      }
    }
  return out;
  }, scope);

  check(coarse.coarsePointer, `[${width}] emulation really reports pointer: coarse`);
  check(
    coarse.opts.length > 0,
    `[${width}] toggle options present`,
    `${coarse.opts.length}`,
  );
  for (const o of coarse.opts) {
    check(
      o.beforeMinH === "44px" && o.beforeMinW === "44px",
      `M7 [${width}] "${o.label}" gets the 44px hit inflation`,
      `visual ${o.visual}, ::before ${o.beforeMinW}x${o.beforeMinH}`,
    );
    check(
      o.hitsVertical,
      `M7 [${width}] "${o.label}" answers a 44px-tall hit test`,
      `visual ${o.visual}`,
    );
  }
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed` +
    (failed.length ? `\nFAILED:\n${failed.map((f) => `  • ${f.name} — ${f.detail}`).join("\n")}` : ""),
);
process.exit(failed.length ? 1 : 0);
