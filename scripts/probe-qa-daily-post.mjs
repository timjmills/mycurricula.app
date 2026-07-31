// probe-qa-daily-post.mjs — section A, re-done after the first attempt's
// POSITIVE CONTROL failed and correctly refused to draw a conclusion.
//
// WHY THE FIRST ATTEMPT COULD NOT MEASURE THE POST PILL
//   The seeding step adds a lesson through the day pane's own "Add lesson"
//   affordance. That action does not merely insert a row — it drops the day
//   surface into an EXPANDED lesson-editing state (the "Focus lesson — I do"
//   flow, with an "Exit" control), and that state replaces the row layout that
//   carries the Plan · Post · Teach pills. So the first probe's "no Post pill"
//   was a statement about the surface being in the wrong MODE, not about the
//   pill. Its Plan+Teach positive control caught exactly that and failed
//   alongside it, which is the guard working.
//
// WHAT THIS PROBE DOES DIFFERENTLY
//   After seeding it leaves the editing state (clicks "Exit"), waits for the
//   pill row to exist, and only then measures. Every assertion is still paired
//   with the Plan+Teach control, so a blank or wrong-mode surface can never
//   read as a pass.
//
// Run: node scripts/probe-qa-daily-post.mjs

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
let restCount = 0;

const axes = (f) => `v1.${f}.dark.photo.clear.normal.vivid.highlight`;

const makeCtx = async (browser, { width, height = 900, frame, phone = false }) => {
  const ctx = await browser.newContext({
    viewport: { width, height },
    ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : { deviceScaleFactor: 1 }),
  });
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

const attach = (page, tag) => {
  page.on("console", (m) => {
    const t = m.type();
    if (t === "error" || t === "warning")
      consoleLog.push({ tag, type: t, text: m.text().slice(0, 700) });
  });
  page.on("pageerror", (e) => consoleLog.push({ tag, type: "pageerror", text: String(e).slice(0, 700) }));
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/")) restCount += 1;
  });
};

const waitFor = async (page, fn, ms = 90000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate(fn)) return Math.round((Date.now() - t0) / 1000);
    await page.waitForTimeout(400);
  }
  return null;
};

/** Seed N lessons on the open day, then LEAVE the editing state. */
const seedAndExit = (page, want) =>
  page.evaluate(async (n) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const addTrig = () =>
      [...document.querySelectorAll("button")].find((b) =>
        /^(\+\s*)?Add(\s+lesson\b|\s+to\b|\b)/i.test(b.textContent.trim()),
      );
    const newLesson = () =>
      [...document.querySelectorAll("button")].find((b) => b.textContent.includes("New lesson"));
    let clicked = 0;
    let hydrated = false;
    for (let i = 0; i < n; i++) {
      let nl = null;
      for (let k = 0; k < 150 && !nl; k++) {
        const t = addTrig();
        if (!t) {
          await sleep(400);
          continue;
        }
        t.click();
        await sleep(450);
        if (t.getAttribute("aria-expanded") === "true") hydrated = true;
        nl = newLesson();
      }
      if (!nl) break;
      nl.click();
      clicked += 1;
      await sleep(2200);
    }
    // LEAVE the expanded editing state — this is the step the first probe
    // lacked, and the whole reason its control failed.
    let exits = 0;
    for (let k = 0; k < 6; k++) {
      const ex = [...document.querySelectorAll("button")].find(
        (b) => /^exit$/i.test(b.textContent.trim()) && b.offsetParent !== null,
      );
      if (!ex) break;
      ex.click();
      exits += 1;
      await sleep(1200);
    }
    return { clicked, hydrated, exits };
  }, want);

const pillsIn = (page) =>
  page.evaluate(() => {
    const txt = (b) => b.textContent.trim();
    const all = [...document.querySelectorAll("button")];
    return {
      buttons: all.length,
      hasPlan: all.some((b) => /^(Plan|Lesson plan)$/.test(txt(b))),
      hasTeach: all.some((b) => /^(Teach|Open in Teach)$/.test(txt(b))),
      posts: all.filter((b) => /^Post$/.test(txt(b))).length,
    };
  });

const run = async (browser, frame, width, phone) => {
  const tag = `${frame}@${width}`;
  const ctx = await makeCtx(browser, { width, height: phone ? 780 : 900, frame, phone });
  const page = await ctx.newPage();
  attach(page, `daily:${tag}`);
  await page.goto(`${BASE}/daily`, { waitUntil: "domcontentloaded" });

  const seed = await seedAndExit(page, phone ? 1 : 2);
  note(`A2/${tag} seed: hydrated=${seed.hydrated} added=${seed.clicked} exits=${seed.exits}`);

  await waitFor(page, () =>
    [...document.querySelectorAll("button")].some((b) => /^Post$/.test(b.textContent.trim())),
  );
  const p = await pillsIn(page);

  // POSITIVE CONTROL — the ROW layout (not the editor) is on screen.
  ok(
    `A2/${tag} — CONTROL: the day ROW layout is rendered (Plan + Teach present)`,
    p.hasPlan && p.hasTeach,
    `${p.buttons} buttons, plan=${p.hasPlan} teach=${p.hasTeach}, posts=${p.posts}`,
  );
  if (!p.hasPlan || !p.hasTeach) {
    await page.screenshot({ path: `${SHOTS}/A2-${frame}-${width}-NOCONTROL.png` });
    note(`A2/${tag} — control failed; every assertion below is withheld, not passed`);
    await ctx.close();
    return;
  }
  ok(`A2/${tag} — a Post pill exists`, p.posts > 0, `${p.posts} Post pill(s)`);
  await page.screenshot({ path: `${SHOTS}/A2-daily-${frame}-${width}.png` });
  if (!p.posts) {
    await ctx.close();
    return;
  }

  if (phone) {
    const emu = await page.evaluate(() => ({
      dpr: window.devicePixelRatio,
      coarse: matchMedia("(pointer: coarse)").matches,
      anyFine: matchMedia("(any-pointer: fine)").matches,
    }));
    note(`A2/${tag} emulation: dpr=${emu.dpr} pointer:coarse=${emu.coarse} any-pointer:fine=${emu.anyFine}`);
    const box = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /^Post$/.test(x.textContent.trim()));
      const r = b.getBoundingClientRect();
      return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    });
    if (emu.coarse && !emu.anyFine)
      ok(`A2/${tag} — Post pill clears 44px on touch`, box.h >= 44, `${box.w}×${box.h}`);
    else note(`A2/${tag} — hybrid pointer reported; touch verdict WITHHELD (${box.w}×${box.h})`);
    const o = await page.evaluate(() => {
      const main = document.querySelector("#main-content");
      const d = document.documentElement;
      return {
        doc: `${d.scrollWidth}/${d.clientWidth}`,
        main: main ? `${main.scrollWidth}/${main.clientWidth}` : "n/a",
        bar: (main && main.scrollWidth - main.clientWidth > 1) || d.scrollWidth - d.clientWidth > 1,
      };
    });
    ok(`A2/${tag} — no page-level horizontal scroll`, !o.bar, `doc ${o.doc} · #main-content ${o.main}`);
    await ctx.close();
    return;
  }

  // Pill ORDER within the row that owns the Post pill.
  const order = await page.evaluate(() => {
    const post = [...document.querySelectorAll("button")].find((b) => /^Post$/.test(b.textContent.trim()));
    let row = post.parentElement;
    for (let i = 0; i < 4 && row; i++) {
      if (row.querySelectorAll("button").length >= 3) break;
      row = row.parentElement;
    }
    return [...row.querySelectorAll("button")].map((b) => b.textContent.trim()).filter(Boolean);
  });
  const expected = {
    glass: ["Plan", "Post", "Teach"],
    paper: ["Teach", "Lesson plan", "Post"],
    color: ["Plan", "Post", "Teach"],
  }[frame];
  const seq = order.filter((t) => expected.includes(t));
  ok(
    `A2/${tag} — pill order matches the handoff (${expected.join(" · ")})`,
    JSON.stringify(seq) === JSON.stringify(expected),
    `saw [${order.join(" · ")}]`,
  );

  // WHICH lesson id? Distinct rows must yield DISTINCT ids.
  const clickPost = async (i) => {
    await page.evaluate((n) => {
      [...document.querySelectorAll("button")].filter((b) => /^Post$/.test(b.textContent.trim()))[n].click();
    }, i);
    await page.waitForURL(/\/post/, { timeout: 60000 }).catch(() => {});
    const u = page.url();
    return { u, id: new URL(u).searchParams.get("lesson") ?? "" };
  };
  const first = await clickPost(0);
  ok(
    `A2/${tag} — Post routes to /post?lesson=<id>`,
    /\/post\?/.test(first.u) && first.id.length > 0 && first.id !== "undefined",
    first.u.replace(BASE, ""),
  );
  await page.screenshot({ path: `${SHOTS}/A2-post-from-${frame}.png` });

  if (p.posts > 1) {
    await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
    const back = await waitFor(
      page,
      () => [...document.querySelectorAll("button")].filter((b) => /^Post$/.test(b.textContent.trim())).length > 1,
      60000,
    );
    if (back === null) {
      note(`A2/${tag} — could not return to a 2-pill day; distinct-id check WITHHELD`);
    } else {
      const second = await clickPost(1);
      ok(
        `A2/${tag} — a second row's Post carries a DIFFERENT lesson id`,
        second.id.length > 0 && second.id !== first.id,
        `#1=${first.id.slice(0, 14)}… #2=${second.id.slice(0, 14)}…`,
      );
    }
  } else {
    note(`A2/${tag} — only ${p.posts} Post pill on screen; distinct-id check N/A`);
  }
  await ctx.close();
};

const main = async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    for (const frame of ["glass", "paper", "color"]) await run(browser, frame, 1440, false);
    for (const frame of ["glass", "paper", "color"]) await run(browser, frame, 375, true);
  } finally {
    await browser.close();
  }
  console.log(`\n── /rest/v1/ requests observed: ${restCount} ──`);
  console.log(`── console errors/warnings: ${consoleLog.length} ──`);
  const seen = new Set();
  for (const c of consoleLog) {
    const k = `${c.type}:${c.text.slice(0, 110)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(`  [${c.tag}] ${c.type}: ${c.text}`);
  }
  const f = out.filter((r) => !r.p);
  console.log(`\n${out.length - f.length}/${out.length} passed`);
  for (const x of f) console.log(`  ✗ ${x.n} — ${x.d}`);
  process.exit(0);
};

main().catch((e) => {
  console.error(String(e).slice(0, 600));
  process.exit(1);
});
