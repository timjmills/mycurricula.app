// probe-qa-day-week.mjs — live QA sweep for three surfaces landed 7.31:
//
//   A. /daily   — the Post pill, newly present in all three Day frames.
//   B. /weekly  — the paper Week frame's per-day add affordance + menu clip.
//   C. /catch-up— the row meta line (day, lateness, resource count, "why not").
//
// REPORT-ONLY. Nothing here writes to the tree; the only mutation it performs
// is the quick-add it is measuring (mock planner path — in-memory only).
//
// TRAPS THIS SCRIPT IS BUILT AGAINST
//
//   • Absence assertions fail open. Every "X is not there" check is paired with
//     a POSITIVE CONTROL printed alongside it, so a blank page cannot pass.
//   • `document.scrollWidth` is blind to an `overflow-x: clip` bar, and this
//     shell scrolls #main-content rather than the document. The overflow check
//     therefore measures (a) the real scrolling container and (b) every visible
//     element's right edge against the viewport rect.
//   • Device emulation lies twice: a phone context needs isMobile + a real
//     deviceScaleFactor, or touch-target and media-query behaviour is a desktop
//     window wearing a small viewport. Phone contexts below set both.
//   • The dev server here is shared by several lanes; a cold route compile can
//     exceed Playwright's 30s default. Navigation timeout is raised, and every
//     interactive step polls rather than sleeping a fixed interval.
//
// Run: node scripts/probe-qa-day-week.mjs [--only=A|B|C]  (dev server on 3014)

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const SHOTS = "docs/screenshots/qa-day-week";
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) ?? "").slice(7);
mkdirSync(SHOTS, { recursive: true });

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
const note = (msg) => console.log(`      · ${msg}`);

// Packed mc-theme-axes cookie — LOCKSTEP with lib/theme-values.ts.
const axes = (frame) => `v1.${frame}.dark.photo.clear.normal.vivid.highlight`;

// Every console message + page error, tagged with the surface that produced it.
const consoleLog = [];
let restCount = 0;

const attach = (page, tag) => {
  page.on("console", (m) => {
    const t = m.type();
    if (t === "error" || t === "warning")
      consoleLog.push({ tag, type: t, text: m.text().slice(0, 900) });
  });
  page.on("pageerror", (e) =>
    consoleLog.push({ tag, type: "pageerror", text: String(e).slice(0, 900) }),
  );
  page.on("request", (r) => {
    if (r.url().includes("/rest/v1/")) restCount += 1;
  });
};

/**
 * A context that looks like a returning teacher on a chosen frame and width.
 * `phone` sets isMobile + deviceScaleFactor + hasTouch together — any one of
 * them alone produces a hybrid that is neither a phone nor a desktop.
 */
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
  // The account's stored preference must not pull the frame back mid-run.
  // FULFILLED, not aborted: an abort surfaces as `net::ERR_FAILED` in the
  // console and would be counted as an app error by this very probe.
  await ctx.route("**/rest/v1/teacher_preferences*", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await ctx.addCookies([{ name: "mc-theme-axes", value: axes(frame), url: BASE }]);
  // 180s / 3 attempts: /auth/claude-login is a cold dev route and this server
  // is shared with ~30 sibling lanes; a 60s default has been SEEN to time out
  // here, which aborts the run before a single product assertion is made.
  await bypassLogin(ctx, {
    base: BASE,
    next: "/weekly",
    retries: 3,
    timeout: 180000,
  });
  return ctx;
};

/**
 * Overflow measured three ways, because each alone has a known blind spot:
 *   doc      — document scrollWidth (blind to overflow-x: clip)
 *   scroller — the shell's REAL scrolling element (#main-content)
 *   spill    — every visible element whose right edge passes the viewport
 */
const overflowReport = (page) =>
  page.evaluate(() => {
    const vw = window.innerWidth;
    const doc = document.documentElement;
    const main = document.querySelector("#main-content");
    const spill = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      // A fixed/absolute off-screen drawer is a design device, not a bar.
      if (r.right > vw + 1 && cs.position !== "fixed") {
        spill.push({
          sel: `${el.tagName.toLowerCase()}.${(el.className || "").toString().split(" ")[0]}`,
          over: Math.round(r.right - vw),
        });
      }
    }
    spill.sort((a, b) => b.over - a.over);
    return {
      vw,
      docScroll: doc.scrollWidth,
      docClient: doc.clientWidth,
      mainScroll: main ? main.scrollWidth : null,
      mainClient: main ? main.clientWidth : null,
      mainOverflowX: main ? getComputedStyle(main).overflowX : null,
      spill: spill.slice(0, 6),
    };
  });

const checkOverflow = async (page, label) => {
  const o = await overflowReport(page);
  // `spill` counts elements whose own overflow is clipped by an ancestor too,
  // so an entry is only a document-level bar if the scroller also over-scrolls.
  const scrollerBar = o.mainScroll !== null && o.mainScroll - o.mainClient > 1;
  const docBar = o.docScroll - o.docClient > 1;
  ok(
    `${label} — no page-level horizontal scroll`,
    !scrollerBar && !docBar,
    `doc ${o.docScroll}/${o.docClient} · #main-content ${o.mainScroll}/${o.mainClient} (overflow-x:${o.mainOverflowX})`,
  );
  if (o.spill.length)
    note(
      `${label} spill past viewport: ` +
        o.spill.map((s) => `${s.sel}+${s.over}px`).join(", "),
    );
  return o;
};

/** Poll until React has attached handlers, proven by a real state change. */
const waitHydrated = async (page, probeFn, ms = 120000) => {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (await page.evaluate(probeFn)) return Math.round((Date.now() - started) / 1000);
    await page.waitForTimeout(400);
  }
  return null;
};

// ── D. Discovery — where does the local mock actually HAVE lessons? ─────────
// The planner now opens on the REAL current week (85c90ee), while the fixtures
// live in mock weeks 11-12, so /daily's default day is legitimately empty. A
// Post-pill probe on an empty day measures nothing; this finds a populated day
// first so the pill test has something to be about.
const sectionD = async (browser) => {
  console.log("\n══ D · discovery — a day that actually has lessons ══");
  const ctx = await makeCtx(browser, { width: 1440, frame: "glass" });
  const page = await ctx.newPage();
  attach(page, "discover");
  await page.goto(`${BASE}/daily`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(15000);
  console.log(
    "  /daily buttons:",
    JSON.stringify(
      await page.evaluate(() =>
        [...document.querySelectorAll("button")]
          .map((b) => b.textContent.trim().slice(0, 26))
          .filter(Boolean),
      ),
    ),
  );
  // GATE B for the whole page — a control KNOWN to work. If the next-day arrow
  // also does nothing, the page is not hydrated and "the add button is dead" is
  // a statement about this dev server's load, not about the product.
  const control = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const head = () => document.body.innerText.replace(/\s+/g, " ").slice(0, 120);
    const before = head();
    const next = document.querySelector('[aria-label="Next day"]');
    if (!next) return { err: "no next-day arrow" };
    next.click();
    await sleep(1500);
    return { before, after: head(), moved: head() !== before };
  });
  console.log("  GATE B (next-day arrow):", JSON.stringify(control));
  const seeded = await seedDay(page, 2);
  console.log("  seedDay →", JSON.stringify(seeded));
  console.log(
    "  after seed:",
    await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 300)),
  );
  await page.screenshot({ path: `${SHOTS}/D-daily-seeded.png` });

  await page.goto(`${BASE}/catch-up`, { waitUntil: "domcontentloaded" });
  const dlg = await waitHydrated(
    page,
    () => !!document.querySelector('[role="dialog"]'),
    120000,
  );
  console.log(`  /catch-up dialog after ${dlg}s`);
  console.log(
    "  catch-up text:",
    await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 500)),
  );
  await page.screenshot({ path: `${SHOTS}/D-catchup.png` });
  await ctx.close();
};

/**
 * Put lessons on the open day using the surface's OWN add affordance.
 *
 * Needed because the planner opens on the real current week (85c90ee) while the
 * fixtures sit in mock weeks 11-12, so the default day is legitimately empty —
 * and `/daily?date=` did not move it (see section D). Seeding through the UI
 * rather than the store keeps this an end-to-end measurement, and two lessons
 * (not one) mean a Post pill wired to "the first lesson" instead of "its own
 * lesson" would show up rather than coincidentally pass.
 */
const seedDay = (page, n) =>
  page.evaluate(async (want) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const addTrig = () =>
      [...document.querySelectorAll("button")].find((b) =>
        /^(\+\s*)?Add(\s+to\b|\s+lesson\b|\b)/i.test(b.textContent.trim()),
      );
    const newLesson = () =>
      [...document.querySelectorAll("button")].find((b) =>
        b.textContent.includes("New lesson"),
      );
    let clicked = 0;
    let hydrated = false;
    for (let i = 0; i < want; i++) {
      let nl = null;
      // Up to ~2 min: this dev server is shared by several lanes and a cold
      // route has been measured hydrating at 38s. A click before hydration is
      // indistinguishable from a dead control, so keep clicking until the
      // trigger's own aria-expanded proves React is attached.
      for (let k = 0; k < 160 && !nl; k++) {
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
      await sleep(2200); // the store settles; the canvas re-renders
    }
    return {
      clicked,
      hydrated,
      posts: [...document.querySelectorAll("button")].filter((b) =>
        /^Post$/.test(b.textContent.trim()),
      ).length,
      // Agenda/list entries, so the caller can tell "two lessons, one focus
      // panel" (DayB/DayC) from "the second add silently no-opped".
      bodyHasLesson: /New lesson/i.test(document.body.innerText),
    };
  }, n);

// ── A. /daily — the Post pill in all three frames ───────────────────────────
const DAY_CANDIDATES = (process.env.QA_DAYS ?? "2025-10-19,2025-10-20,2025-10-21,2025-10-22,2025-10-23").split(",");
const DAY_DATE = process.env.QA_DAY_DATE ?? "";

const sectionA = async (browser) => {
  console.log("\n══ A · /daily — the Post pill (glass · paper · color) ══");
  for (const frame of ["glass", "paper", "color"]) {
    const ctx = await makeCtx(browser, { width: 1440, frame });
    const page = await ctx.newPage();
    attach(page, `daily:${frame}`);
    await page.goto(`${BASE}/daily${DAY_DATE ? `?date=${DAY_DATE}` : ""}`, {
      waitUntil: "domcontentloaded",
    });
    const seeded = await seedDay(page, 2);
    note(
      `A/${frame} seed: hydrated=${seeded.hydrated} ${seeded.clicked} "New lesson" click(s), ${seeded.posts} Post pill(s) on screen`,
    );

    const secs = await waitHydrated(page, () =>
      [...document.querySelectorAll("button")].some((b) =>
        /^Post$/.test(b.textContent.trim()),
      ),
    );
    const domFrame = await page.evaluate(() =>
      document.querySelector("[data-frame]")?.getAttribute("data-frame"),
    );
    ok(`A/${frame} — frame attribute matches`, domFrame === frame, `data-frame=${domFrame}`);

    // POSITIVE CONTROL — the day surface rendered at all. Without it, "no Post
    // button" and "no page" are the same observation.
    const control = await page.evaluate(() => {
      const btns = [...document.querySelectorAll("button")].map((b) =>
        b.textContent.trim(),
      );
      return {
        buttons: btns.length,
        hasPlan: btns.some((t) => /^Plan$|^Lesson plan$/.test(t)),
        hasTeach: btns.some((t) => /Teach/.test(t)),
      };
    });
    ok(
      `A/${frame} — POSITIVE CONTROL: day surface rendered (Plan+Teach present)`,
      control.hasPlan && control.hasTeach,
      `${control.buttons} buttons, plan=${control.hasPlan} teach=${control.hasTeach}`,
    );

    ok(`A/${frame} — a Post pill exists`, secs !== null, secs === null ? "never appeared in 60s" : `after ${secs}s`);
    await page.screenshot({ path: `${SHOTS}/A-daily-${frame}-1440.png`, fullPage: false });

    if (secs !== null) {
      // Handoff order per frame: glass Plan·Post·Teach · paper Teach·Lesson
      // plan·Post · color Plan·Post·Teach.
      const order = await page.evaluate(() => {
        const post = [...document.querySelectorAll("button")].find((b) =>
          /^Post$/.test(b.textContent.trim()),
        );
        const row = post.closest("div");
        return [...row.querySelectorAll("button")]
          .map((b) => b.textContent.trim())
          .filter(Boolean);
      });
      const expected = {
        glass: ["Plan", "Post", "Teach"],
        paper: ["Open in Teach", "Lesson plan", "Post"],
        color: ["Plan", "Post", "Open in Teach"],
      }[frame];
      const seq = order.filter((t) => expected.includes(t));
      ok(
        `A/${frame} — pill order is the handoff's`,
        JSON.stringify(seq) === JSON.stringify(expected),
        `saw [${order.join(" · ")}]`,
      );

      // WHICH lesson's id? Both seeded lessons are titled "New lesson", so a
      // title comparison could not separate "its own lesson" from "always the
      // first". Distinct rows must therefore produce DISTINCT ids — clicking
      // the Nth Post pill and comparing is the check that can actually fail.
      // Only DayA (glass) shows a pill per row; DayB/DayC show one focus panel,
      // so there the second id is not reachable without re-selecting, and this
      // check is reported as N/A rather than silently skipped.
      const pillCount = await page.evaluate(
        () =>
          [...document.querySelectorAll("button")].filter((b) =>
            /^Post$/.test(b.textContent.trim()),
          ).length,
      );
      const clickPost = async (nth) => {
        await page.evaluate((i) => {
          [...document.querySelectorAll("button")]
            .filter((b) => /^Post$/.test(b.textContent.trim()))
            [i].click();
        }, nth);
        await page.waitForURL(/\/post/, { timeout: 60000 }).catch(() => {});
        const u = page.url();
        return { u, id: new URL(u).searchParams.get("lesson") ?? "" };
      };

      const first = await clickPost(0);
      ok(
        `A/${frame} — Post lands on /post?lesson=<id>`,
        /\/post\?/.test(first.u) && first.id.length > 0 && first.id !== "undefined",
        first.u.replace(BASE, ""),
      );

      if (pillCount > 1) {
        await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
        await waitHydrated(
          page,
          () =>
            [...document.querySelectorAll("button")].filter((b) =>
              /^Post$/.test(b.textContent.trim()),
            ).length > 1,
          45000,
        );
        const second = await clickPost(1);
        ok(
          `A/${frame} — a second row's Post carries a DIFFERENT lesson id`,
          second.id.length > 0 && second.id !== first.id,
          `#1=${first.id.slice(0, 12)}… #2=${second.id.slice(0, 12)}…`,
        );
        await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
        await clickPost(0);
      } else {
        note(
          `A/${frame} — only ${pillCount} Post pill on screen (one focus panel), so the distinct-id check is N/A here`,
        );
      }

      // Does /post actually anchor to THAT lesson, or silently fall back?
      const landed = await waitHydrated(
        page,
        () => /Current Lesson|Lesson/i.test(document.body.innerText),
        45000,
      );
      const wallText = await page.evaluate(() =>
        document.body.innerText.slice(0, 600).replace(/\s+/g, " "),
      );
      ok(
        `A/${frame} — /post resolves the anchored lesson`,
        landed !== null && /current lesson/i.test(wallText),
        wallText.slice(0, 180),
      );
      await page.screenshot({ path: `${SHOTS}/A-post-from-${frame}.png` });
    }
    await ctx.close();
  }

  // 375 touch targets, per frame, on a REAL phone context.
  for (const frame of ["glass", "paper", "color"]) {
    const ctx = await makeCtx(browser, { width: 375, height: 780, frame, phone: true });
    const page = await ctx.newPage();
    attach(page, `daily375:${frame}`);
    await page.goto(`${BASE}/daily${DAY_DATE ? `?date=${DAY_DATE}` : ""}`, {
      waitUntil: "domcontentloaded",
    });
    const seeded375 = await seedDay(page, 1);
    const found = await waitHydrated(page, () =>
      [...document.querySelectorAll("button")].some((b) =>
        /^Post$/.test(b.textContent.trim()),
      ),
    );
    note(`A/${frame}@375 seed: hydrated=${seeded375.hydrated} ${seeded375.clicked} lesson(s)`);
    const emu = await page.evaluate(() => ({
      dpr: window.devicePixelRatio,
      coarse: matchMedia("(pointer: coarse)").matches,
      anyFine: matchMedia("(any-pointer: fine)").matches,
      w: window.innerWidth,
    }));
    note(
      `A/${frame}@375 emulation: dpr=${emu.dpr} pointer:coarse=${emu.coarse} any-pointer:fine=${emu.anyFine} vw=${emu.w}`,
    );
    if (found === null) {
      ok(`A/${frame}@375 — Post pill present`, false, "never appeared in 60s");
    } else {
      const box = await page.evaluate(() => {
        const post = [...document.querySelectorAll("button")].find((b) =>
          /^Post$/.test(b.textContent.trim()),
        );
        const r = post.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
      });
      ok(
        `A/${frame}@375 — Post pill clears 44px`,
        box.h >= 44,
        `${box.w}×${box.h}`,
      );
    }
    await checkOverflow(page, `A/${frame}@375 /daily`);
    await page.screenshot({ path: `${SHOTS}/A-daily-${frame}-375.png`, fullPage: false });
    await ctx.close();
  }
};

// ── B. /weekly — the paper Week frame's per-day add ─────────────────────────
const openAndMeasure = (page, which) =>
  page.evaluate(async (pick) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const trigs = [
      ...document.querySelectorAll('[aria-label^="Weekly plan by day"] button'),
    ].filter((b) => /^\+?\s*Add$/.test(b.textContent.trim()));
    if (!trigs.length) return { err: "no add triggers" };
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
    const menu = nl.parentElement;
    const r = menu.getBoundingClientRect();
    const c = document
      .querySelector('[class*="WeekColumns_scroll"]')
      .getBoundingClientRect();
    return {
      idx,
      columns: trigs.length,
      // Clipped by the week's own scroll container…
      clipLeft: Math.max(0, Math.round(c.left - r.left)),
      clipRight: Math.max(0, Math.round(r.right - c.right)),
      // …and off the VIEWPORT, which the container check alone would miss.
      offLeft: Math.max(0, Math.round(0 - r.left)),
      offRight: Math.max(0, Math.round(r.right - window.innerWidth)),
      menuW: Math.round(r.width),
    };
  }, which);

const sectionB = async (browser) => {
  console.log("\n══ B · /weekly — paper Week per-day add ══");
  const widths = (process.env.QA_WIDTHS ?? "1440,768").split(",").map(Number);
  for (const width of widths) {
    const ctx = await makeCtx(browser, { width, frame: "paper" });
    const page = await ctx.newPage();
    attach(page, `weekly@${width}`);
    await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });
    const grid = page.locator("button", { hasText: /^Grid$/ }).first();
    if (await grid.count()) await grid.click().catch(() => {});
    await page
      .waitForSelector('[aria-label^="Weekly plan by day"]', { timeout: 90000 })
      .catch(() => {});

    const domFrame = await page.evaluate(() =>
      document.querySelector("[data-frame]")?.getAttribute("data-frame"),
    );
    ok(`B@${width} — frame is paper (WeekColumns)`, domFrame === "paper", `data-frame=${domFrame}`);

    // What the canvas looks like over the first 30s — the add triggers were
    // seen LEAVING the DOM between polls at 768, and a census separates "the
    // affordance is missing" from "the page re-rendered under us".
    const census = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const shot = () => {
        const canvas = document.querySelector('[aria-label^="Weekly plan by day"]');
        return {
          canvas: !!canvas,
          cols: canvas ? canvas.children.length : 0,
          adds: [...document.querySelectorAll("button")].filter((b) =>
            /^\+?\s*Add$/.test(b.textContent.trim()),
          ).length,
        };
      };
      const seq = [];
      for (let i = 0; i < 10; i++) {
        seq.push(shot());
        await sleep(3000);
      }
      return seq;
    });
    note(
      `B@${width} canvas census (3s apart): ` +
        census.map((c) => `${c.canvas ? "C" : "-"}${c.cols}/${c.adds}`).join(" "),
    );

    const hydrated = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const trig = () =>
        [...document.querySelectorAll('[aria-label^="Weekly plan by day"] button')].filter(
          (b) => /^\+?\s*Add$/.test(b.textContent.trim()),
        )[0];
      // ~3 minutes. A gate that gives up early does not report "not hydrated";
      // it reports "the menu never opened", which is the DEFECT's signature.
      for (let k = 0; k < 300; k++) {
        const t = trig();
        if (t) {
          t.click();
          await sleep(250);
          // Null-safe: at narrow widths the trigger has been observed leaving
          // the DOM between polls, and `trig().getAttribute` then throws and
          // kills the run instead of reporting what it saw.
          const again = trig();
          if (again && again.getAttribute("aria-expanded") === "true") {
            again.click();
            await sleep(200);
            return true;
          }
        } else await sleep(250);
      }
      return false;
    });
    ok(`B@${width} — add triggers interactive (hydration gate)`, hydrated);
    if (!hydrated) {
      // Say WHY, with a second control: if the Grid/List toggle is equally
      // dead, the page never hydrated and nothing below is about the product.
      const alt = await page.evaluate(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const list = [...document.querySelectorAll("button")].find(
          (b) => b.textContent.trim() === "List",
        );
        if (!list) return "no List toggle found";
        const before = document.body.innerText.length;
        list.click();
        await sleep(2000);
        return document.body.innerText.length !== before
          ? "the List toggle DID respond — the page is hydrated, the add trigger is not"
          : "the List toggle is also dead — the page is not hydrated";
      });
      note(`B@${width} — NOT HYDRATED after ~3min. Second control: ${alt}`);
      await page.screenshot({ path: `${SHOTS}/B-week-${width}-nothydrated.png` });
      await ctx.close();
      continue;
    }

    const trigStats = await page.evaluate(() => {
      const trigs = [
        ...document.querySelectorAll('[aria-label^="Weekly plan by day"] button'),
      ].filter((b) => /^\+?\s*Add$/.test(b.textContent.trim()));
      const cols = document.querySelector('[aria-label^="Weekly plan by day"]')?.children
        .length;
      return {
        n: trigs.length,
        cols,
        heights: trigs.map((t) => Math.round(t.getBoundingClientRect().height)),
      };
    });
    ok(
      `B@${width} — one add trigger per school-day column`,
      trigStats.n === trigStats.cols && trigStats.n > 0,
      `${trigStats.n} of ${trigStats.cols}`,
    );
    ok(
      `B@${width} — add triggers clear 44px`,
      trigStats.heights.every((h) => h >= 44),
      trigStats.heights.join(","),
    );

    for (const which of ["first", "last"]) {
      const m = await openAndMeasure(page, which);
      if (m.err) {
        ok(`B@${width} — ${which} column menu fully on-screen`, false, m.err);
        continue;
      }
      await page.screenshot({ path: `${SHOTS}/B-week-menu-${which}-${width}.png` });
      ok(
        `B@${width} — ${which} column menu is not clipped by the week track`,
        m.clipLeft === 0 && m.clipRight === 0,
        `clipL=${m.clipLeft} clipR=${m.clipRight} menu=${m.menuW}px col#${m.idx}/${m.columns}`,
      );
      ok(
        `B@${width} — ${which} column menu is inside the viewport`,
        m.offLeft === 0 && m.offRight === 0,
        `offL=${m.offLeft} offR=${m.offRight}`,
      );
      await page.evaluate(() => {
        const t = [
          ...document.querySelectorAll('[aria-label^="Weekly plan by day"] button'),
        ].find((b) => b.getAttribute("aria-expanded") === "true");
        t?.click();
      });
    }

    // GATE B — prove the instrument can SEE a clip before its zeros mean
    // anything. Re-centre the first column's menu (the exact pre-fix geometry).
    await page.addStyleTag({
      content: `[class*="atoms_vaDayAddMenu"] { left: 50% !important; right: auto !important; transform: translateX(-50%) !important; }`,
    });
    const control = await openAndMeasure(page, "first");
    ok(
      `B@${width} — GATE B: the probe can SEE a clipped menu (control)`,
      !control.err && control.clipLeft > 0,
      control.err ?? `clipL=${control.clipLeft} clipR=${control.clipRight}`,
    );
    await checkOverflow(page, `B@${width} /weekly`);
    await ctx.close();
  }

  // Quick-add: submit ONCE, count once. Then double-fire in one tick to prove
  // the sync ref guard is what is holding the line.
  const ctx = await makeCtx(browser, { width: 1440, frame: "paper" });
  const page = await ctx.newPage();
  attach(page, "weekly:quickadd");
  await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });
  await page
    .waitForSelector('[aria-label^="Weekly plan by day"]', { timeout: 90000 })
    .catch(() => {});
  const qaHydrated = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const trig = () =>
      [...document.querySelectorAll('[aria-label^="Weekly plan by day"] button')].filter(
        (b) => /^\+?\s*Add$/.test(b.textContent.trim()),
      )[1];
    for (let k = 0; k < 300; k++) {
      const t = trig();
      if (t) {
        t.click();
        await sleep(250);
        const again = trig();
        if (again && again.getAttribute("aria-expanded") === "true") {
          again.click();
          await sleep(200);
          return true;
        }
      } else await sleep(250);
    }
    return false;
  });
  ok("B — quick-add page is hydrated (gate before counting)", qaHydrated);

  const countCards = () =>
    page.evaluate(() => {
      const cols = [
        ...document.querySelector('[aria-label^="Weekly plan by day"]').children,
      ];
      return cols.map((c) => c.querySelectorAll("[data-lesson-card], article, li").length);
    });
  const before = await countCards();
  const single = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const trigs = [
      ...document.querySelectorAll('[aria-label^="Weekly plan by day"] button'),
    ].filter((b) => /^\+?\s*Add$/.test(b.textContent.trim()));
    trigs[1].click();
    let nl = null;
    for (let k = 0; k < 60; k++) {
      nl = [...document.querySelectorAll("button")].find((b) =>
        b.textContent.includes("New lesson"),
      );
      if (nl) break;
      await sleep(250);
    }
    if (!nl) return "menu never opened";
    nl.click();
    await sleep(2500);
    return "clicked";
  });
  const after = await countCards();
  const delta = after.map((v, i) => v - (before[i] ?? 0));
  ok(
    "B — one quick-add click creates exactly one lesson",
    single === "clicked" && delta.filter((d) => d !== 0).length === 1 && Math.max(...delta) === 1,
    `${single}; per-column delta [${delta.join(",")}] (before [${before.join(",")}])`,
  );
  await page.screenshot({ path: `${SHOTS}/B-quickadd-after.png` });

  // Double-fire in ONE tick — the case `addingDay` state alone cannot catch.
  const before2 = await countCards();
  const dbl = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const trigs = [
      ...document.querySelectorAll('[aria-label^="Weekly plan by day"] button'),
    ].filter((b) => /^\+?\s*Add$/.test(b.textContent.trim()));
    trigs[2].click();
    let nl = null;
    for (let k = 0; k < 60; k++) {
      nl = [...document.querySelectorAll("button")].find((b) =>
        b.textContent.includes("New lesson"),
      );
      if (nl) break;
      await sleep(250);
    }
    if (!nl) return "menu never opened";
    nl.click();
    nl.click(); // same tick — the sync-ref guard's whole reason to exist
    await sleep(2500);
    return "clicked twice";
  });
  const after2 = await countCards();
  const delta2 = after2.map((v, i) => v - (before2[i] ?? 0));
  ok(
    "B — a same-tick double click still creates only one lesson",
    dbl === "clicked twice" && Math.max(...delta2, 0) <= 1,
    `${dbl}; per-column delta [${delta2.join(",")}]`,
  );

  // Add-event form.
  const evt = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const trigs = [
      ...document.querySelectorAll('[aria-label^="Weekly plan by day"] button'),
    ].filter((b) => /^\+?\s*Add$/.test(b.textContent.trim()));
    for (const t of trigs) if (t.getAttribute("aria-expanded") === "true") t.click();
    await sleep(150);
    trigs[1].click();
    let row = null;
    for (let k = 0; k < 60; k++) {
      row = [...document.querySelectorAll("button")].find((b) =>
        /event/i.test(b.textContent),
      );
      if (row) break;
      await sleep(250);
    }
    if (!row) return { err: "no add-event row in the menu" };
    row.click();
    await sleep(1500);
    const inputs = [...document.querySelectorAll("input, select, textarea")].filter(
      (i) => i.offsetParent !== null,
    );
    return {
      label: row.textContent.trim().slice(0, 40),
      fields: inputs.length,
      names: inputs.map((i) => i.name || i.placeholder || i.type).slice(0, 8),
      dialog: !!document.querySelector('[role="dialog"]'),
    };
  });
  ok(
    "B — the add-event form opens from the day menu",
    !evt.err && evt.fields > 0,
    evt.err ?? `row="${evt.label}" fields=${evt.fields} [${(evt.names ?? []).join(", ")}] dialog=${evt.dialog}`,
  );
  await page.screenshot({ path: `${SHOTS}/B-addevent-form.png` });

  if (!evt.err) {
    const beforeE = await countCards();
    const submitted = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const inputs = [...document.querySelectorAll("input")].filter(
        (i) => i.offsetParent !== null && (i.type === "text" || i.type === ""),
      );
      if (!inputs.length) return "no text input";
      const set = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      set.call(inputs[0], "QA probe event");
      inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(300);
      const submit = [...document.querySelectorAll("button")].find((b) =>
        /^(add|save|create|add event)$/i.test(b.textContent.trim()),
      );
      if (!submit) return "no submit button";
      submit.click();
      await sleep(2500);
      return "submitted";
    });
    const afterE = await countCards();
    const dE = afterE.map((v, i) => v - (beforeE[i] ?? 0));
    ok(
      "B — submitting the event form creates exactly one entry",
      submitted === "submitted" && Math.max(...dE, 0) <= 1,
      `${submitted}; per-column delta [${dE.join(",")}]`,
    );
    await page.screenshot({ path: `${SHOTS}/B-addevent-after.png` });
  }
  await ctx.close();
};

// ── C. /catch-up — the row meta line ────────────────────────────────────────
const sectionC = async (browser) => {
  console.log("\n══ C · /catch-up — row meta line ══");
  for (const [width, phone] of [
    [375, true],
    [560, true],
    [768, true],
    [1440, false],
  ]) {
    const ctx = await makeCtx(browser, { width, height: 820, frame: "glass", phone });
    const page = await ctx.newPage();
    attach(page, `catchup@${width}`);
    await page.goto(`${BASE}/catch-up`, { waitUntil: "domcontentloaded" });
    const shown = await waitHydrated(
      page,
      () => !!document.querySelector('[role="dialog"], [class*="CatchUpModal"]'),
      60000,
    );

    const data = await page.evaluate(() => {
      const dlg =
        document.querySelector('[role="dialog"]') ??
        document.querySelector('[class*="CatchUpModal"]');
      if (!dlg) return { err: "no catch-up modal" };
      const rows = [...dlg.querySelectorAll('[class*="row"]')].filter(
        (r) => r.querySelector('[class*="rowMeta"]') || r.querySelector('[class*="rowSub"]'),
      );
      const metas = [...dlg.querySelectorAll('[class*="rowMeta"]')];
      const chips = [...dlg.querySelectorAll('[class*="metaChip"]')];
      const late = chips.filter((c) => /\d+ days? late/.test(c.textContent));
      const zeroLate = chips.filter((c) => /\b0 days? late/.test(c.textContent));
      const clip = chips.filter((c) => c.querySelector("svg"));
      const zeroClip = clip.filter((c) => /(^|\s)0(\s|$)/.test(c.textContent.trim()));
      const reason = [...dlg.querySelectorAll('[class*="rowReason"]')];
      // Do the meta lines push the action pills off their row?
      const dlgR = dlg.getBoundingClientRect();
      const actions = [...dlg.querySelectorAll("button")].filter((b) =>
        /taught|reschedul|bump|plan|teach/i.test(
          `${b.textContent} ${b.getAttribute("aria-label") ?? ""} ${b.title ?? ""}`,
        ),
      );
      const offscreen = actions.filter((b) => {
        const r = b.getBoundingClientRect();
        return r.right > dlgR.right + 1 || r.width < 1 || r.height < 1;
      });
      const small = actions
        .map((b) => {
          const r = b.getBoundingClientRect();
          return { t: (b.textContent || b.getAttribute("aria-label") || "?").trim().slice(0, 14), w: Math.round(r.width), h: Math.round(r.height) };
        })
        .filter((s) => s.h > 0 && s.h < 44);
      return {
        rows: rows.length,
        metas: metas.length,
        chips: chips.map((c) => c.textContent.trim().slice(0, 24)).slice(0, 14),
        lateCount: late.length,
        zeroLate: zeroLate.length,
        clipChips: clip.length,
        zeroClip: zeroClip.length,
        reasons: reason.map((r) => r.textContent.trim().slice(0, 60)).slice(0, 3),
        actionsTotal: actions.length,
        offscreen: offscreen.length,
        small,
        metaWrapped: metas.length
          ? metas[0].getBoundingClientRect().height > 30
          : null,
      };
    });

    if (data.err) {
      ok(`C@${width} — catch-up modal rendered`, false, `${data.err} (hydrate ${shown})`);
      await page.screenshot({ path: `${SHOTS}/C-catchup-${width}-EMPTY.png` });
      await ctx.close();
      continue;
    }

    // POSITIVE CONTROL for every absence assertion below.
    ok(
      `C@${width} — POSITIVE CONTROL: modal has rows + action pills`,
      data.rows > 0 && data.actionsTotal > 0,
      `rows=${data.rows} metas=${data.metas} actions=${data.actionsTotal}`,
    );
    ok(
      `C@${width} — every row carries a meta line`,
      data.metas > 0 && data.metas === data.rows,
      `metas=${data.metas} rows=${data.rows}; chips [${data.chips.join(" | ")}]`,
    );
    ok(
      `C@${width} — no "0 days late" chip is rendered`,
      data.zeroLate === 0,
      `late chips=${data.lateCount}, zero-late=${data.zeroLate}`,
    );
    ok(
      `C@${width} — no zero-count resource chip`,
      data.zeroClip === 0,
      `clip chips=${data.clipChips}, zero=${data.zeroClip}`,
    );
    note(`C@${width} "why not" notes: ${JSON.stringify(data.reasons)}`);
    ok(
      `C@${width} — the meta row never pushes an action pill off the row`,
      data.offscreen === 0,
      `${data.offscreen} of ${data.actionsTotal} outside the modal's right edge`,
    );
    if (width <= 768)
      ok(
        `C@${width} — action pills clear 44px on touch`,
        data.small.length === 0,
        data.small.length
          ? data.small.map((s) => `${s.t} ${s.w}×${s.h}`).join(", ")
          : `all ${data.actionsTotal} ≥44px tall`,
      );
    await checkOverflow(page, `C@${width} /catch-up`);
    await page.screenshot({ path: `${SHOTS}/C-catchup-${width}.png`, fullPage: false });
    await ctx.close();
  }
};

const main = async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    if (ONLY === "D") await sectionD(browser);
    if (!ONLY || ONLY === "A") await sectionA(browser);
    if (!ONLY || ONLY === "B") await sectionB(browser);
    if (!ONLY || ONLY === "C") await sectionC(browser);
  } finally {
    await browser.close();
  }

  console.log(`\n── /rest/v1/ requests observed: ${restCount} ──`);
  console.log(`── console errors/warnings: ${consoleLog.length} ──`);
  const seen = new Set();
  for (const c of consoleLog) {
    const k = `${c.type}:${c.text.slice(0, 120)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(`  [${c.tag}] ${c.type}: ${c.text}`);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("FAILURES:");
    for (const f of failed) console.log(`  ✗ ${f.name} — ${f.detail}`);
  }
  process.exit(failed.length === 0 ? 0 : 1);
};

main().catch((e) => {
  console.error(String(e).slice(0, 600));
  process.exit(1);
});
