// probe-qa-verify.mjs — follow-ups that the main sweep could not settle.
//
// Three of the main probe's results were INSTRUMENT results, not app results,
// and each is re-measured here with an oracle that has been proven able to
// move before its zeros are believed:
//
//   V1  /catch-up "rows=474 metas=237". 474 is exactly 2×237, which is the
//       signature of a `[class*="row"]` selector matching BOTH `.row` and a
//       nested `.rowMain`. Counted by exact class token instead.
//   V2  /catch-up action pills measured 43×43 against a 44px CSS rule. Is the
//       shortfall real (a border/box-sizing bug) or a rounding artifact of
//       getBoundingClientRect at deviceScaleFactor 3? Read the fractional
//       rect + the computed box model, not the rounded integer.
//   V3  /weekly double-create. The main probe counted `[data-lesson-card],
//       article, li` and read 0 BEFORE any add — a counter that reads zero on
//       a populated week cannot distinguish "one lesson" from "two", so both
//       its FAIL and its PASS are void. Here the counter is discovered from
//       the live DOM and GATED: it must go 0 → 1 on a known-good single add
//       before the double-fire result is reported at all.
//   V4  the add menu at 950px — the narrowest width at which the day-column
//       grid still renders (≤900px falls to WeeklyList), so the worst real
//       clipping case. 768 cannot be tested: the grid does not exist there.
//
// Run: node scripts/probe-qa-verify.mjs

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

const axes = (f) => `v1.${f}.dark.photo.clear.normal.vivid.highlight`;
const consoleLog = [];

const makeCtx = async (browser, { width, height = 900, frame, phone = false }) => {
  const ctx = await browser.newContext({
    viewport: { width, height },
    ...(phone
      ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
      : { deviceScaleFactor: 1 }),
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
};

const waitFor = async (page, fn, ms = 120000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate(fn)) return Math.round((Date.now() - t0) / 1000);
    await page.waitForTimeout(400);
  }
  return null;
};

// ── V1 + V2 · /catch-up ─────────────────────────────────────────────────────
const catchup = async (browser) => {
  console.log("\n══ V1/V2 · /catch-up — row count + the 43px pills ══");
  const ctx = await makeCtx(browser, { width: 375, height: 820, frame: "glass", phone: true });
  const page = await ctx.newPage();
  attach(page, "catchup375");
  await page.goto(`${BASE}/catch-up`, { waitUntil: "domcontentloaded" });
  const secs = await waitFor(page, () => !!document.querySelector('[role="dialog"]'), 90000);
  ok("V — catch-up modal rendered (control)", secs !== null, `after ${secs}s`);
  if (secs === null) return void (await ctx.close());

  // How was this context actually emulated? A touch verdict from a hybrid is
  // not a touch verdict at all.
  const emu = await page.evaluate(() => ({
    dpr: window.devicePixelRatio,
    coarse: matchMedia("(pointer: coarse)").matches,
    anyFine: matchMedia("(any-pointer: fine)").matches,
    anyCoarse: matchMedia("(any-pointer: coarse)").matches,
    touch: "ontouchstart" in window,
    vw: window.innerWidth,
  }));
  note(
    `emulation: vw=${emu.vw} dpr=${emu.dpr} pointer:coarse=${emu.coarse} any-pointer:fine=${emu.anyFine} any-pointer:coarse=${emu.anyCoarse} ontouchstart=${emu.touch}`,
  );
  ok(
    "V — the phone context is a REAL phone, not a hybrid (gate for any touch verdict)",
    emu.coarse && !emu.anyFine,
    `pointer:coarse=${emu.coarse} any-pointer:fine=${emu.anyFine}`,
  );

  const v1 = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    const tok = (el, want) =>
      [...el.classList].some((c) => c.replace(/__.*$/, "").split("_").pop() === want);
    const all = [...dlg.querySelectorAll("div")];
    const exactRow = all.filter((e) => tok(e, "row"));
    const rowMain = all.filter((e) => tok(e, "rowMain"));
    const loose = [...dlg.querySelectorAll('[class*="row"]')].filter(
      (r) => r.querySelector('[class*="rowMeta"]') || r.querySelector('[class*="rowSub"]'),
    );
    const metas = [...dlg.querySelectorAll('[class*="rowMeta"]')];
    // Does EVERY exact .row own exactly one meta line?
    const rowsWithMeta = exactRow.filter(
      (r) => r.querySelectorAll('[class*="rowMeta"]').length === 1,
    );
    return {
      exactRow: exactRow.length,
      rowMain: rowMain.length,
      loose: loose.length,
      metas: metas.length,
      rowsWithMeta: rowsWithMeta.length,
      sampleClasses: exactRow[0] ? [...exactRow[0].classList].join(" ") : null,
    };
  });
  note(
    `V1 counts: exact .row=${v1.exactRow} .rowMain=${v1.rowMain} loose[class*=row]=${v1.loose} metas=${v1.metas}`,
  );
  ok(
    "V1 — the main sweep's rows=474 was a DOUBLE COUNT, not a missing meta line",
    v1.loose === v1.exactRow + v1.rowMain && v1.exactRow === v1.metas,
    `loose(${v1.loose}) == row(${v1.exactRow})+rowMain(${v1.rowMain}); row==metas: ${v1.exactRow === v1.metas}`,
  );
  ok(
    "V1 — every catch-up row carries exactly one meta line",
    v1.exactRow > 0 && v1.rowsWithMeta === v1.exactRow,
    `${v1.rowsWithMeta} of ${v1.exactRow}`,
  );

  // V2 — the pill box, unrounded.
  const v2 = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('[role="dialog"] button')].find((b) =>
      /mark taught/i.test(`${b.textContent} ${b.getAttribute("aria-label") ?? ""}`),
    );
    if (!btn) return { err: "no Mark taught button" };
    const r = btn.getBoundingClientRect();
    const cs = getComputedStyle(btn);
    return {
      rectW: r.width,
      rectH: r.height,
      cssW: cs.width,
      cssH: cs.height,
      minH: cs.minHeight,
      box: cs.boxSizing,
      border: cs.borderTopWidth,
      padY: `${cs.paddingTop}/${cs.paddingBottom}`,
      font: cs.fontSize,
      lineH: cs.lineHeight,
    };
  });
  note(`V2 box model: ${JSON.stringify(v2)}`);
  ok(
    "V2 — the icon-only action square really is under 44px (not a rounding artifact)",
    !v2.err && v2.rectH < 44,
    v2.err ?? `rect ${v2.rectW.toFixed(2)}×${v2.rectH.toFixed(2)} · computed ${v2.cssW}×${v2.cssH} · min-height ${v2.minH} · border ${v2.border} · box-sizing ${v2.box}`,
  );
  await page.screenshot({ path: `${SHOTS}/V-catchup-375-pills.png` });
  await ctx.close();
};

// ── V3 + V4 · /weekly ───────────────────────────────────────────────────────
const weekly = async (browser) => {
  console.log("\n══ V3/V4 · /weekly — a card counter that can move, + 950px ══");
  const ctx = await makeCtx(browser, { width: 1440, frame: "paper" });
  const page = await ctx.newPage();
  attach(page, "weekly1440");
  await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[aria-label^="Weekly plan by day"]', { timeout: 120000 }).catch(() => {});

  const hydrated = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const trig = () =>
      [...document.querySelectorAll('[aria-label^="Weekly plan by day"] button')].filter((b) =>
        /^\+?\s*Add$/.test(b.textContent.trim()),
      )[0];
    for (let k = 0; k < 300; k++) {
      const t = trig();
      if (t) {
        t.click();
        await sleep(250);
        const a = trig();
        if (a && a.getAttribute("aria-expanded") === "true") {
          a.click();
          await sleep(200);
          return true;
        }
      } else await sleep(250);
    }
    return false;
  });
  ok("V3 — /weekly paper grid is hydrated (gate)", hydrated);
  if (!hydrated) return void (await ctx.close());

  // Discover what a lesson card actually IS in this DOM, rather than assuming.
  const shape = await page.evaluate(() => {
    const canvas = document.querySelector('[aria-label^="Weekly plan by day"]');
    const col = canvas.children[1];
    const kids = [...col.querySelectorAll("*")]
      .filter((e) => e.className && typeof e.className === "string")
      .map((e) => e.className.split(" ")[0]);
    return {
      cols: canvas.children.length,
      colTag: col.tagName,
      distinct: [...new Set(kids)].slice(0, 25),
      buttons: [...col.querySelectorAll("button")].map((b) => b.textContent.trim().slice(0, 18)),
    };
  });
  note(`V3 column shape: ${JSON.stringify(shape).slice(0, 600)}`);

  // Counter candidates, evaluated live. The one that MOVES on a real add wins.
  const counters = {
    dataCard: () => document.querySelectorAll("[data-lesson-card]").length,
  };
  const count = () =>
    page.evaluate(() => {
      const canvas = document.querySelector('[aria-label^="Weekly plan by day"]');
      const cols = [...canvas.children];
      const per = cols.map((c) => ({
        dataCard: c.querySelectorAll("[data-lesson-card]").length,
        article: c.querySelectorAll("article").length,
        li: c.querySelectorAll("li").length,
        // The rich card exposes its lesson id — the least brittle oracle.
        lessonId: c.querySelectorAll("[data-lesson-id]").length,
        newLesson: (c.innerText.match(/New lesson/gi) ?? []).length,
      }));
      return per;
    });

  const before = await count();
  note(`V3 before: ${JSON.stringify(before)}`);

  const addOnce = (col) =>
    page.evaluate(async (i) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const trigs = [
        ...document.querySelectorAll('[aria-label^="Weekly plan by day"] button'),
      ].filter((b) => /^\+?\s*Add$/.test(b.textContent.trim()));
      for (const t of trigs) if (t.getAttribute("aria-expanded") === "true") t.click();
      await sleep(150);
      trigs[i].click();
      let nl = null;
      for (let k = 0; k < 80; k++) {
        nl = [...document.querySelectorAll("button")].find((b) =>
          b.textContent.includes("New lesson"),
        );
        if (nl) break;
        await sleep(250);
      }
      if (!nl) return "menu never opened";
      nl.click();
      await sleep(3000);
      return "clicked";
    }, col);

  const r1 = await addOnce(1);
  const after1 = await count();
  note(`V3 after ONE add (${r1}): ${JSON.stringify(after1)}`);

  const moved = Object.fromEntries(
    ["dataCard", "article", "li", "lessonId", "newLesson"].map((k) => [
      k,
      after1[1][k] - before[1][k],
    ]),
  );
  note(`V3 per-counter delta on column 1: ${JSON.stringify(moved)}`);
  const oracle = ["lessonId", "dataCard", "article", "newLesson", "li"].find(
    (k) => moved[k] === 1,
  );
  ok(
    "V3 — GATE: a counter exists that moves 0→1 on a single real add",
    !!oracle,
    oracle ? `oracle = ${oracle}` : `nothing moved by exactly 1: ${JSON.stringify(moved)}`,
  );
  ok("V3 — one add click creates exactly one lesson", !!oracle && r1 === "clicked", `${r1}, delta ${JSON.stringify(moved)}`);

  if (oracle) {
    // Same-tick double fire, counted with the PROVEN oracle.
    const b2 = await count();
    const r2 = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const trigs = [
        ...document.querySelectorAll('[aria-label^="Weekly plan by day"] button'),
      ].filter((b) => /^\+?\s*Add$/.test(b.textContent.trim()));
      for (const t of trigs) if (t.getAttribute("aria-expanded") === "true") t.click();
      await sleep(150);
      trigs[2].click();
      let nl = null;
      for (let k = 0; k < 80; k++) {
        nl = [...document.querySelectorAll("button")].find((b) =>
          b.textContent.includes("New lesson"),
        );
        if (nl) break;
        await sleep(250);
      }
      if (!nl) return "menu never opened";
      nl.click();
      nl.click(); // same tick — exactly what quickAddInFlightRef guards
      await sleep(3500);
      return "clicked twice";
    });
    const a2 = await count();
    const d2 = a2.map((v, i) => v[oracle] - b2[i][oracle]);
    ok(
      "V3 — a same-tick DOUBLE click still creates only one lesson",
      r2 === "clicked twice" && Math.max(...d2, 0) === 1,
      `${r2}; ${oracle} delta [${d2.join(",")}]`,
    );
    await page.screenshot({ path: `${SHOTS}/V-weekly-doublefire.png` });
  }
  await ctx.close();

  // ── V4 · 950px, the narrowest width where the grid still exists ──────────
  const ctx2 = await makeCtx(browser, { width: 950, frame: "paper" });
  const page2 = await ctx2.newPage();
  attach(page2, "weekly950");
  await page2.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });
  await page2.waitForSelector('[aria-label^="Weekly plan by day"]', { timeout: 120000 }).catch(() => {});
  const h2 = await page2.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const trig = () =>
      [...document.querySelectorAll('[aria-label^="Weekly plan by day"] button')].filter((b) =>
        /^\+?\s*Add$/.test(b.textContent.trim()),
      )[0];
    for (let k = 0; k < 240; k++) {
      const t = trig();
      if (t) {
        t.click();
        await sleep(250);
        const a = trig();
        if (a && a.getAttribute("aria-expanded") === "true") {
          a.click();
          await sleep(200);
          return true;
        }
      } else await sleep(250);
    }
    return false;
  });
  ok("V4 — the day-column grid still renders + hydrates at 950px", h2);
  if (h2) {
    const measure = (which) =>
      page2.evaluate(async (pick) => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const trigs = [
          ...document.querySelectorAll('[aria-label^="Weekly plan by day"] button'),
        ].filter((b) => /^\+?\s*Add$/.test(b.textContent.trim()));
        for (const t of trigs) if (t.getAttribute("aria-expanded") === "true") t.click();
        await sleep(150);
        const idx = pick === "first" ? 0 : trigs.length - 1;
        trigs[idx].click();
        let nl = null;
        for (let k = 0; k < 60; k++) {
          nl = [...document.querySelectorAll("button")].find((b) =>
            b.textContent.includes("New lesson"),
          );
          if (nl) break;
          await sleep(250);
        }
        if (!nl) return { err: "menu never opened" };
        const r = nl.parentElement.getBoundingClientRect();
        const c = document
          .querySelector('[class*="WeekColumns_scroll"]')
          .getBoundingClientRect();
        return {
          idx,
          columns: trigs.length,
          clipLeft: Math.max(0, Math.round(c.left - r.left)),
          clipRight: Math.max(0, Math.round(r.right - c.right)),
          offLeft: Math.max(0, Math.round(0 - r.left)),
          offRight: Math.max(0, Math.round(r.right - window.innerWidth)),
          menuW: Math.round(r.width),
        };
      }, which);

    for (const which of ["first", "last"]) {
      const m = await measure(which);
      if (m.err) {
        ok(`V4@950 — ${which} column menu on-screen`, false, m.err);
        continue;
      }
      await page2.screenshot({ path: `${SHOTS}/V-week-950-menu-${which}.png` });
      ok(
        `V4@950 — ${which} column menu not clipped by the week track`,
        m.clipLeft === 0 && m.clipRight === 0,
        `clipL=${m.clipLeft} clipR=${m.clipRight} menu=${m.menuW}px col#${m.idx}/${m.columns}`,
      );
      ok(
        `V4@950 — ${which} column menu inside the viewport`,
        m.offLeft === 0 && m.offRight === 0,
        `offL=${m.offLeft} offR=${m.offRight}`,
      );
      await page2.evaluate(() => {
        const t = [
          ...document.querySelectorAll('[aria-label^="Weekly plan by day"] button'),
        ].find((b) => b.getAttribute("aria-expanded") === "true");
        t?.click();
      });
    }
    // GATE B — the instrument must be able to SEE a clip at this width too.
    await page2.addStyleTag({
      content: `[class*="atoms_vaDayAddMenu"] { left: 50% !important; right: auto !important; transform: translateX(-50%) !important; }`,
    });
    const ctrl = await measure("last");
    ok(
      "V4@950 — GATE B: the probe can SEE a clipped menu at 950px",
      !ctrl.err && (ctrl.clipRight > 0 || ctrl.clipLeft > 0 || ctrl.offRight > 0),
      ctrl.err ?? `clipL=${ctrl.clipLeft} clipR=${ctrl.clipRight} offR=${ctrl.offRight}`,
    );
  }
  await ctx2.close();
};

const main = async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    await catchup(browser);
    await weekly(browser);
  } finally {
    await browser.close();
  }
  console.log(`\n── console errors/warnings: ${consoleLog.length} ──`);
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
