// probe-wall-bg-stacking.mjs — task #25 verification, plus the defect the fix
// unmasked.
//
// Written by the wave6-polish lane; moved into scripts/ on the lead's call
// because Q3 below is the ONLY instrument that can see the .hasPhoto stacking
// bug — it needs geometry, and the vitest mount harness (tests/mount-react.ts)
// computes no layout, so tests/wall-bg-fork.test.ts structurally cannot cover
// it. Absolute file:// imports and a hard-coded repo root were rewritten as
// ordinary relative ones by the move; nothing else changed.
//
// THREE questions, each with its own control:
//
//  Q1  Does the FIRST pin on a preset wall now stick, and land under the wall
//      the teacher is moved onto? (The bug. Control: the pre-fix run recorded
//      `cc_secbg_subject:…` — a key the fixed code cannot produce.)
//  Q2  Does a pin on an ALREADY-forked wall still stick? (Regression control on
//      the path that always worked — a fix that broke it would be worse.)
//  Q3  Once a section carries a PHOTO background, is its background popover
//      still clickable? Measured with elementFromPoint at the swatch's own
//      centre, PAIRED with the identical measurement on a section that has no
//      background. Absence of a hit on the photo section proves nothing on its
//      own; the paired hit on the plain section is what makes it a finding.
//
// Run: node <this file>

import { chromium } from "playwright";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
// The repo root, derived rather than hard-coded: scripts/ -> repo root.
const REPO = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const log = (m) => console.log(m);
const note = (m) => console.log(`      · ${m}`);
const out = [];
const ok = (n, p, d = "") => {
  out.push({ n, p, d });
  console.log(`${p ? "PASS" : "FAIL"}  ${n}${d ? ` — ${d}` : ""}`);
};

const ev = (page, fn, arg) =>
  page
    .evaluate(fn, arg)
    .catch((e) => ({ err: `evaluate failed: ${String(e).split("\n")[0].slice(0, 120)}` }));

const dumpStore = (page) =>
  ev(page, () => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && (k.startsWith("cc_secbg_") || k.startsWith("cc_subjbg_"))) {
        keys.push(`${k} = ${localStorage.getItem(k)}`);
      }
    }
    let walls = [];
    try {
      walls = JSON.parse(localStorage.getItem("cc_customwalls") ?? "[]").map((w) => ({
        id: w.id,
        name: w.name,
      }));
    } catch {
      walls = ["<unparseable>"];
    }
    return { bgKeys: keys.sort(), walls };
  });

const readSection = (page, i) =>
  ev(
    page,
    (idx) => {
      const btns = [...document.querySelectorAll('button[aria-label="Section background"]')];
      const btn = btns[idx];
      if (!btn) return { err: `no section #${idx}` };
      const sec = btn.closest("section");
      const keys = Object.keys(btn);
      const props = btn[keys.find((k) => k.startsWith("__reactProps$")) ?? ""];
      const style = sec?.getAttribute("style") ?? "";
      return {
        count: btns.length,
        title: sec?.querySelector("h3")?.textContent?.trim() ?? "",
        onClick: !!(props && typeof props.onClick === "function"),
        inlineStyle: style,
        photo: /background-image:\s*url/.test(style),
      };
    },
    i,
  );

const watch = async (page, i, ms, label) => {
  const frames = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await readSection(page, i);
    frames.push({ t: Date.now() - t0, photo: !!s.photo, style: s.inlineStyle, err: s.err });
    await page.waitForTimeout(150);
  }
  const bad = frames.filter((f) => f.err);
  if (bad.length) note(`${label}: ${bad.length}/${frames.length} samples ERRORED — ${bad[0].err}`);
  const on = frames.filter((f) => f.photo);
  const settled = frames.filter((f) => !f.err);
  note(`${label}: ${on.length}/${frames.length} samples painted a photo`);
  return {
    final: settled[settled.length - 1]?.photo ?? false,
    finalStyle: settled[settled.length - 1]?.style ?? "",
  };
};

const openPopover = async (page, i) => {
  await page.locator('button[aria-label="Section background"]').nth(i).click({ timeout: 20000 });
  await page.waitForTimeout(500);
};

/** Is the swatch actually the top-most element at its own centre?
 *
 *  elementFromPoint returns null for a point OUTSIDE the viewport, which reads
 *  identically to "something is covering it" — the first run of this probe
 *  measured a swatch at y=1403 and reported an unreachable control. So the
 *  swatch is scrolled into view first and a point outside the viewport is
 *  returned as an ERROR, never as a negative result. */
const hitTest = async (page, swatchIndex) => {
  await ev(
    page,
    (idx) => {
      const sw = [...document.querySelectorAll('button[aria-label="Photo background"]')][idx];
      sw?.scrollIntoView({ block: "center", behavior: "instant" });
    },
    swatchIndex,
  );
  await page.waitForTimeout(400);
  return ev(
    page,
    (idx) => {
      const sw = [...document.querySelectorAll('button[aria-label="Photo background"]')][idx];
      if (!sw) return { err: "no photo swatch (popover not open?)" };
      const r = sw.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return { err: "swatch has zero box" };
      const x = r.x + r.width / 2;
      const y = r.y + r.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) {
        return { err: `swatch centre ${Math.round(x)},${Math.round(y)} is outside the ${innerWidth}x${innerHeight} viewport — no hit test is possible` };
      }
      const top = document.elementFromPoint(x, y);
      return {
        reachable: top === sw || sw.contains(top),
        topTag: top ? `${top.tagName.toLowerCase()}.${top.className}`.slice(0, 70) : "none",
        rect: `${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.x)},${Math.round(r.y)}`,
      };
    },
    swatchIndex,
  );
};

const main = async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  ctx.setDefaultNavigationTimeout(240000);
  try {
    await bypassLogin(ctx, { base: BASE, next: "/weekly", retries: 3, timeout: 240000, repoRoot: REPO });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/post?subject=math`, { waitUntil: "domcontentloaded" });

    let s = null;
    for (let i = 0; i < 360; i += 1) {
      s = await readSection(page, 0);
      if (!s.err && s.onClick) break;
      await page.waitForTimeout(500);
    }
    ok("GATE 1 — hydrated (fiber + onClick on the background button)", !!s.onClick, JSON.stringify(s).slice(0, 200));
    // THROW, do not `return`. The summary and the exit-code check live after the
    // try/finally, so an early return skipped BOTH: the probe printed nothing at
    // all and node exited 0 — a hydration failure that reads exactly like a
    // clean run. Throwing routes it to main().catch, which exits 1.
    if (!s.onClick) throw new Error("GATE 1 failed — never hydrated, so nothing below was measured");
    note(`${s.count} sections; #0 = "${s.title}"`);
    const before = await dumpStore(page);
    ok("precondition — on a PRESET wall (no saved walls)", before.walls.length === 0, JSON.stringify(before.walls));

    // ── Q1: the first pin on the preset ───────────────────────────────────
    log("\n── Q1: FIRST pin (section #0, on the preset) ──");
    await openPopover(page, 0);
    await page.locator('button[aria-label="Photo background"]').nth(0).click({ timeout: 20000 });
    const w1 = await watch(page, 0, 3500, "pin #1");
    const a1 = await dumpStore(page);
    note(`walls: ${JSON.stringify(a1.walls)}`);
    note(`bg keys: ${JSON.stringify(a1.bgKeys)}`);
    ok("Q1a — the pin auto-forked the preset", a1.walls.length === 1, JSON.stringify(a1.walls));
    ok(
      "Q1b — the pin is stored under the wall the teacher is NOW on",
      a1.walls.length === 1 && a1.bgKeys.every((k) => k.includes(a1.walls[0].id)),
      `wall=${a1.walls[0]?.id} keys=${JSON.stringify(a1.bgKeys)}`,
    );
    ok("Q1c — the first pin IS STILL PAINTED after 3.5s", w1.final, w1.finalStyle);

    // ── Q2: a pin on the already-forked wall (regression control) ─────────
    log("\n── Q2: SECOND pin, different section, wall already forked ──");
    await openPopover(page, 1);
    await page.locator('button[aria-label="Photo background"]').nth(1).click({ timeout: 20000 });
    const w2 = await watch(page, 1, 3000, "pin #2");
    const a2 = await dumpStore(page);
    ok("Q2 — a pin on an already-forked wall still sticks", w2.final, w2.finalStyle);
    ok(
      "Q2b — both pins are filed under the same (forked) wall",
      a2.bgKeys.length === 2 && a2.bgKeys.every((k) => k.includes(a2.walls[0].id)),
      JSON.stringify(a2.bgKeys),
    );

    // ── Q3: is the popover still usable on a photo section? ───────────────
    log("\n── Q3: popover reachability, photo section vs plain section ──");
    const plain = await readSection(page, 2);
    note(`control section #2 = "${plain.title}", photo=${plain.photo}`);
    await openPopover(page, 2);
    const hitPlain = await hitTest(page, 0);
    note(`plain section: ${JSON.stringify(hitPlain)}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    await openPopover(page, 0);
    const hitPhoto = await hitTest(page, 0);
    note(`photo section: ${JSON.stringify(hitPhoto)}`);

    ok(
      "Q3 CONTROL — on a section with NO background the swatch is the top-most element",
      hitPlain.reachable === true,
      JSON.stringify(hitPlain),
    );
    ok(
      "Q3 — on a section WITH a photo background the swatch is still clickable",
      hitPhoto.reachable === true,
      JSON.stringify(hitPhoto),
    );
  } finally {
    await ctx.close();
    await browser.close();
  }
  const bad = out.filter((r) => !r.p);
  log(`\n${out.length - bad.length}/${out.length} passed`);
  for (const b of bad) log(`  x ${b.n} — ${b.d}`);
  // EXIT NON-ZERO ON FAILURE. This read `process.exit(0)` — unconditional, and
  // placed AFTER the failures were printed, so the probe listed everything that
  // was broken and then told its caller the run succeeded. Under `| tail`, in a
  // `&&` chain, or in CI, that is indistinguishable from a clean pass.
  //
  // Zero assertions is also a failure: it means the probe never reached the app,
  // and `0/0 passed` must not read as a green run.
  if (bad.length > 0 || out.length === 0) {
    log(
      out.length === 0
        ? "\nFAILED — no assertions ran. The probe never reached the app."
        : `\nFAILED — ${bad.length} assertion(s) did not pass.`,
    );
    process.exit(1);
  }
  process.exit(0);
};

main().catch((e) => {
  console.error(String(e).slice(0, 800));
  process.exit(1);
});
