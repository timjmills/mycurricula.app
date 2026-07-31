// probe-qa-post-click.mjs — settle ONE question, the one that has produced
// false findings twice today: does the /daily Post pill actually navigate?
//
// A bare "I clicked it and the URL did not change" is worthless here. This
// app has been measured attaching React fibers at 63s. So every claim below is
// gated three ways, and the gates are checked on the EXACT element clicked:
//
//   GATE 1  the Post button carries a React fiber/props key (__reactFiber$ /
//           __reactProps$) — proof a handler is attached to THIS node, not
//           proof that "the page" is hydrated.
//   GATE 2  onClick is reachable through __reactProps$ — a fiber can exist on
//           a node whose props carry no handler.
//   GATE 3  a SAME-ROW CONTROL (the Plan pill, wired identically one line
//           above in DayA.tsx) is clicked in the same state. If Plan navigates
//           and Post does not, the difference is the product. If NEITHER
//           moves, the surface is not interactive and NOTHING is concluded.
//
// Run: node scripts/probe-qa-post-click.mjs

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const SHOTS = "docs/screenshots/qa-day-week";
mkdirSync(SHOTS, { recursive: true });

const out = [];
const ok = (n, p, d = "") => {
  out.push({ n, p, d });
  console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
};
const note = (m) => console.log(`      · ${m}`);
const consoleLog = [];

const axes = (f) => `v1.${f}.dark.photo.clear.normal.vivid.highlight`;

const makeCtx = async (browser, frame) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  ctx.setDefaultNavigationTimeout(180000);
  await ctx.addInitScript(
    ([f]) => {
      localStorage.setItem(
        "mycurricula:onboarding",
        JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
      );
      localStorage.setItem("mycurricula:user:theme-frame", f);
    },
    [frame],
  );
  await ctx.route("**/rest/v1/teacher_preferences*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await ctx.addCookies([{ name: "mc-theme-axes", value: axes(frame), url: BASE }]);
  await bypassLogin(ctx, { base: BASE, next: "/weekly", retries: 3, timeout: 180000 });
  return ctx;
};

const seedAndExit = (page, n) =>
  page.evaluate(async (want) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const addTrig = () =>
      [...document.querySelectorAll("button")].find((b) =>
        /^(\+\s*)?Add(\s+lesson\b|\s+to\b|\b)/i.test(b.textContent.trim()),
      );
    const newLesson = () =>
      [...document.querySelectorAll("button")].find((b) => b.textContent.includes("New lesson"));
    let clicked = 0;
    for (let i = 0; i < want; i++) {
      let nl = null;
      for (let k = 0; k < 150 && !nl; k++) {
        const t = addTrig();
        if (!t) {
          await sleep(400);
          continue;
        }
        t.click();
        await sleep(450);
        nl = newLesson();
      }
      if (!nl) break;
      nl.click();
      clicked += 1;
      await sleep(2200);
    }
    for (let k = 0; k < 6; k++) {
      const ex = [...document.querySelectorAll("button")].find(
        (b) => /^exit$/i.test(b.textContent.trim()) && b.offsetParent !== null,
      );
      if (!ex) break;
      ex.click();
      await sleep(1200);
    }
    return clicked;
  }, n);

/** Fiber/props inspection of the EXACT node we are about to click. */
const inspect = (page, label) =>
  page.evaluate((want) => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => b.textContent.trim() === want,
    );
    if (!btn) return { err: `no "${want}" button` };
    const keys = Object.keys(btn);
    const fiberKey = keys.find((k) => k.startsWith("__reactFiber$"));
    const propsKey = keys.find((k) => k.startsWith("__reactProps$"));
    const props = propsKey ? btn[propsKey] : null;
    const r = btn.getBoundingClientRect();
    return {
      found: true,
      fiber: !!fiberKey,
      props: !!propsKey,
      onClick: !!(props && typeof props.onClick === "function"),
      disabled: btn.disabled,
      pointerEvents: getComputedStyle(btn).pointerEvents,
      visible: r.width > 0 && r.height > 0,
      rect: `${Math.round(r.width)}×${Math.round(r.height)} @${Math.round(r.x)},${Math.round(r.y)}`,
      reactKeys: keys.filter((k) => k.startsWith("__react")).join(","),
    };
  }, label);

const clickAndWatch = async (page, label) => {
  const before = page.url();
  // A REAL user gesture at the element's own centre — not el.click(). If an
  // overlay is intercepting the press, this is the only thing that shows it.
  const el = page.locator("button", { hasText: new RegExp(`^${label}$`) }).first();
  let how = "locator.click";
  try {
    await el.click({ timeout: 15000 });
  } catch (e) {
    how = `locator.click FAILED (${String(e).split("\n")[0].slice(0, 120)}) → dispatched el.click()`;
    await page.evaluate((w) => {
      [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === w)?.click();
    }, label);
  }
  await page.waitForURL((u) => u.toString() !== before, { timeout: 20000 }).catch(() => {});
  return { how, before: before.replace(BASE, ""), after: page.url().replace(BASE, "") };
};

const run = async (browser, frame, postLabel, controlLabel) => {
  console.log(`\n══ ${frame} — does the Post pill navigate? ══`);
  const ctx = await makeCtx(browser, frame);
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") consoleLog.push(`[${frame}] error: ${m.text().slice(0, 400)}`);
  });
  page.on("pageerror", (e) => consoleLog.push(`[${frame}] pageerror: ${String(e).slice(0, 400)}`));

  await page.goto(`${BASE}/daily`, { waitUntil: "domcontentloaded" });
  const added = await seedAndExit(page, 2);
  note(`${frame}: seeded ${added} lesson(s), left the editor`);

  // Wait for the pill to EXIST before inspecting it.
  for (let k = 0; k < 200; k++) {
    const p = await inspect(page, postLabel);
    if (p.found) break;
    await page.waitForTimeout(500);
  }

  const post = await inspect(page, postLabel);
  note(`${frame} "${postLabel}" node: ${JSON.stringify(post)}`);
  ok(
    `${frame} — GATE 1/2: the ${postLabel} button has a React fiber AND an onClick prop`,
    !post.err && post.fiber && post.props && post.onClick,
    post.err ?? `fiber=${post.fiber} props=${post.props} onClick=${post.onClick} disabled=${post.disabled} pointer-events=${post.pointerEvents} ${post.rect}`,
  );
  if (post.err || !post.onClick) {
    note(`${frame} — gates failed; the navigation result below is NOT reported as a product finding`);
    await page.screenshot({ path: `${SHOTS}/P-${frame}-gatefail.png` });
    await ctx.close();
    return;
  }

  const postNav = await clickAndWatch(page, postLabel);
  note(`${frame} Post click (${postNav.how}): ${postNav.before} → ${postNav.after}`);
  await page.screenshot({ path: `${SHOTS}/P-${frame}-after-post-click.png` });

  // GATE 3 — the same-row control, from the same state.
  if (postNav.after === postNav.before) {
    await page.goto(`${BASE}/daily`, { waitUntil: "domcontentloaded" });
    await seedAndExit(page, 1);
    for (let k = 0; k < 200; k++) {
      const c = await inspect(page, controlLabel);
      if (c.found) break;
      await page.waitForTimeout(500);
    }
    const ctrl = await inspect(page, controlLabel);
    note(`${frame} "${controlLabel}" node: ${JSON.stringify(ctrl)}`);
    const ctrlNav = await clickAndWatch(page, controlLabel);
    note(`${frame} ${controlLabel} click (${ctrlNav.how}): ${ctrlNav.before} → ${ctrlNav.after}`);
    const ctrlMoved = ctrlNav.after !== ctrlNav.before;
    ok(
      `${frame} — GATE 3: the same-row control (${controlLabel}) DOES navigate`,
      ctrlMoved,
      `${ctrlNav.before} → ${ctrlNav.after}`,
    );
    ok(
      `${frame} — Post routes to /post?lesson=<id>`,
      false,
      ctrlMoved
        ? `Post stayed on ${postNav.after} while ${controlLabel} navigated to ${ctrlNav.after} — the surface IS interactive, so this is a product defect`
        : `Post stayed on ${postNav.after} and ${controlLabel} ALSO did not move — surface not interactive; NO conclusion about Post`,
    );
  } else {
    const id = new URL(`${BASE}${postNav.after}`).searchParams.get("lesson") ?? "";
    ok(
      `${frame} — Post routes to /post?lesson=<id>`,
      /^\/post\?/.test(postNav.after) && id.length > 0 && id !== "undefined",
      `${postNav.after}`,
    );
  }
  await ctx.close();
};

const main = async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    await run(browser, "glass", "Post", "Plan");
    await run(browser, "paper", "Post", "Lesson plan");
    await run(browser, "color", "Post", "Plan");
  } finally {
    await browser.close();
  }
  console.log(`\n── console errors: ${consoleLog.length} ──`);
  for (const c of [...new Set(consoleLog)].slice(0, 10)) console.log(`  ${c}`);
  const f = out.filter((r) => !r.p);
  console.log(`\n${out.length - f.length}/${out.length} passed`);
  for (const x of f) console.log(`  ✗ ${x.n} — ${x.d}`);
  process.exit(0);
};

main().catch((e) => {
  console.error(String(e).slice(0, 600));
  process.exit(1);
});
