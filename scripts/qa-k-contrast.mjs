// scripts/qa-k-contrast.mjs — LANE K-3. REPORT ONLY. Touches no app file.
//
// Verifies the AA claims made by commit 0b64a99 ("fix(a11y): the contrast probe
// was blind to ancestor opacity, by up to 5x") on the RUNNING app.
//
// THE INSTRUMENT, in the order the numbers are built:
//
//  1. FOREGROUND is never parsed from a CSS string. `getComputedStyle().color`
//     comes back as `rgb(r g b)` (0-255) on some builds and `color(srgb r g b)`
//     (0-1) on others in this very app; conflating the two inflates every ratio
//     (repo memory: contrast-probe-colour-parsing). So the string is handed to a
//     2D canvas, painted, and read back as integers. One code path, no parsing.
//
//  2. CUMULATIVE OPACITY. `color` is the DECLARED ink and is blind both to the
//     element's own `opacity` and to every ancestor's. The alpha actually fed to
//     the compositor here is  colourAlpha x PROD(opacity(el .. <html>)).
//     This is the entire subject of the commit under test.
//
//  3. BACKDROP is PHOTOGRAPHED, not computed. Every target's ink (and its
//     descendants') is forced transparent, one viewport screenshot is taken, and
//     the pixels under each target are read out of it. Translucent glass over a
//     photograph, backdrop-filter, veils, washes and every ancestor opacity are
//     therefore already IN the number — the thing computed style cannot give.
//     No "unresolvable" case survives this: the compositor did the work.
//
//  4. GRADING on the worst backdrop percentile (p10), with p50 alongside, so one
//     bright patch of photograph is not averaged away.
//
//  5. SELF-TEST FIRST, AND IT MUST BE ABLE TO FAIL. Three synthetic arms run
//     through the exact same pipeline before any app number is taken:
//       (a) white-on-white          must read ~1.00
//       (b) #000 @ ancestor opacity .18 on #fff  must read ~1.5, and must NOT
//           equal its own opacity-blind reading (~21) — if they match, step 2 is
//           not wired in and every app number is void
//       (c) black-on-white          must read ~21
//     Any arm failing aborts the run with exit 2. Repo memory: verification
//     instruments here fail OPEN — five did in one session.
//
// Read-only by construction: the harness aborts every non-GET `/rest/v1/**` and
// every `teacher_preferences` request including the GET.
//
// Run: node scripts/qa-k-contrast.mjs [--axes=a,b] [--routes=home,daily,year]

import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { kContext, readAxes, collectConsole, BASE } from "./qa-k-ctx.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};

const REPO = process.cwd();
const OUT = path.join(REPO, "docs/screenshots/qa-k-contrast");
mkdirSync(OUT, { recursive: true });

const git = (...a) => {
  try {
    return execFileSync("git", a, { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};

// ── the matrix ─────────────────────────────────────────────────────────────
// tone is DERIVED, never chosen — `want` records what the axes are SUPPOSED to
// derive so a drift is visible rather than assumed.
const AXES = {
  "glass-night": { frame: "glass", glass: "dark", bg: "photo", theme: "night", dim: "normal", want: "dark" },
  "glass-photo-dim": { frame: "glass", glass: "dark", bg: "photo", theme: "clear", dim: "dim", want: "dark" },
  "glass-wash": { frame: "glass", glass: "light", bg: "wash", theme: "clear", dim: "normal", want: "light" },
  "glass-photo-bright": { frame: "glass", glass: "light", bg: "photo", theme: "clear", dim: "bright", want: "light" },
  "paper-night": { frame: "paper", glass: "dark", bg: "photo", theme: "night", dim: "normal", want: "dark" },
  "paper-wash": { frame: "paper", glass: "light", bg: "wash", theme: "clear", dim: "normal", want: "light" },
};

// CSS-module locals arrive hashed (`day-v2_dobj__aB3xY`), so the selector is a
// substring match on the local name. The bare-string ones are global classes in
// app/chrome.css and are matched exactly.
const TARGETS = {
  home: [
    { name: ".hero-quote-text", sel: ".hero-quote-text", src: "app/chrome.css:867" },
    { name: ".hero-quote-by", sel: ".hero-quote-by", src: "app/chrome.css:902" },
    { name: ".clock-done", sel: ".clock-done", src: "app/chrome.css:1831" },
  ],
  daily: [
    { name: ".dobj", sel: '[class*="dobj"]', src: "components/day-v2/day-v2.module.css" },
    { name: ".dcTl", sel: '[class*="dcTl"]', src: "components/day-v2/day-v2.module.css" },
    { name: ".dcStepLabel", sel: '[class*="dcStepLabel"]', src: "components/day-v2/day-v2.module.css" },
    { name: ".dcStepMin", sel: '[class*="dcStepMin"]', src: "components/day-v2/day-v2.module.css" },
    { name: ".dunChip", sel: '[class*="dunChip"]', src: "components/day-v2/day-v2.module.css" },
    { name: "subjGlyph", sel: '[class*="subjGlyph"]', src: "components/planner-v2/atoms.module.css:46" },
    { name: "UnitChip .name", sel: '[class*="UnitChip_name"]', src: "components/unit-chip/UnitChip.module.css:43" },
  ],
  year: [
    { name: "YearA .chipLabel", sel: '[class*="chipLabel"]', src: "components/year-v2/YearA.module.css:284" },
    { name: "subjGlyph", sel: '[class*="subjGlyph"]', src: "components/planner-v2/atoms.module.css:46" },
    { name: "UnitChip .name", sel: '[class*="UnitChip_name"]', src: "components/unit-chip/UnitChip.module.css:43" },
  ],
  weekly: [
    { name: "subjGlyph", sel: '[class*="subjGlyph"]', src: "components/planner-v2/atoms.module.css:46" },
    { name: "UnitChip .name", sel: '[class*="UnitChip_name"]', src: "components/unit-chip/UnitChip.module.css:43" },
    { name: ".tileTitle", sel: '[class*="tileTitle"]', src: "components/week-v2/WeekA.module.css:259" },
    { name: ".tileSubject", sel: '[class*="tileSubject"]', src: "components/week-v2/WeekA.module.css:273" },
    { name: ".tileUnit", sel: '[class*="tileUnit"]', src: "components/week-v2/WeekA.module.css:289" },
    // The PAPER Week frame renders the v1 `weekly-lesson-card` instead of the
    // WeekA tiles, and a DONE card there gets `opacity: 0.66` as an INLINE
    // style (weekly-lesson-card.tsx:547) — a fade no stylesheet sweep can see.
    { name: "wlc .bandTitle", sel: '[class*="weekly-lesson-card_bandTitle"]', src: "components/weekly/weekly-lesson-card.module.css:419" },
    { name: "wlc .bandSubject", sel: '[class*="weekly-lesson-card_bandSubject"]', src: "components/weekly/weekly-lesson-card.module.css:269" },
    { name: "wlc .bandTime", sel: '[class*="weekly-lesson-card_bandTime"]', src: "components/weekly/weekly-lesson-card.module.css:292" },
    { name: "wlc .bandTitleSub", sel: '[class*="weekly-lesson-card_bandTitleSub"]', src: "components/weekly/weekly-lesson-card.module.css:467" },
    { name: "wlc .bandSubjectCode", sel: '[class*="weekly-lesson-card_bandSubjectCode"]', src: "components/weekly/weekly-lesson-card.module.css:232" },
  ],
  // A3/A4 — the Teach board surfaces (components/teach-v2/**). Added because
  // /teach was outside every contrast sweep: it lives in route group `(teach)`,
  // so a sweep driven by planner routes never reached it. Its stylesheets carry
  // ZERO `data-tone` branches by design — every colour is a token that flips —
  // which is only correct if it holds under measurement, hence these targets.
  teach: [
    { name: "board lesson title", sel: '[class*="boardName"]', src: "components/teach-v2/TeachV2Shell.module.css" },
    { name: "board objective", sel: '[class*="TeachV2Shell_objective"]', src: "components/teach-v2/TeachV2Shell.module.css" },
    { name: "board switcher pill", sel: '[class*="pillLabel"]', src: "components/teach-v2/BoardSwitcher.module.css" },
    { name: "board switcher count", sel: '[class*="BoardSwitcher_count"]', src: "components/teach-v2/BoardSwitcher.module.css" },
    { name: "timer readout", sel: '[class*="readoutTime"]', src: "components/teach-v2/BoardTimer.module.css" },
    { name: "filmstrip slide title", sel: '[class*="thumbTitle"]', src: "components/teach-v2/SlideFilmstrip.module.css" },
    { name: "filmstrip slide number", sel: '[class*="thumbNum"]', src: "components/teach-v2/SlideFilmstrip.module.css" },
    { name: "writing-bar tool label", sel: '[class*="WritingBar_popLabel"]', src: "components/teach-v2/WritingBar.module.css" },
    { name: "lesson rail name", sel: '[class*="railName"]', src: "components/teach-v2/LessonRail.module.css" },
    { name: "lesson rail tab", sel: '[class*="LessonRail_tab"]', src: "components/teach-v2/LessonRail.module.css" },
    { name: "empty-stage title", sel: '[class*="emptyTitle"]', src: "components/teach-v2/TeachV2Shell.module.css" },
    { name: "empty-stage body", sel: '[class*="emptyBody"]', src: "components/teach-v2/TeachV2Shell.module.css" },
    { name: "mob toggle", sel: '[class*="mobToggle"]', src: "components/teach-v2/TeachV2Shell.module.css" },
  ],
};
const ROUTE_URL = { home: "/home", daily: "/daily", year: "/year", weekly: "/weekly", teach: "/teach" };

const WANT_AXES = arg("axes", Object.keys(AXES).join(",")).split(",").filter(Boolean);
const WANT_ROUTES = arg("routes", "home,daily,year,weekly").split(",").filter(Boolean);

// ── WCAG maths (node side) ─────────────────────────────────────────────────
const lin = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const over = (fg, bg, alpha) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));

/** WCAG large text: >=24px, or >=18.66px at weight >=700. */
const thresholdFor = (px, weight) => (px >= 24 || (px >= 18.66 && weight >= 700) ? 3.0 : 4.5);

// ── in-page collection ─────────────────────────────────────────────────────
/**
 * For every match of `sel` inside the viewport, return the declared ink resolved
 * through a canvas (0-255 + alpha), the CUMULATIVE opacity of the element and
 * every ancestor, the type metrics, and the rect. No colour string crosses this
 * boundary — only integers.
 */
const COLLECT = (sel) => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const resolve = (css) => {
    // Paint over a known field twice so a fully-transparent colour is
    // distinguishable from an opaque black one.
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = "#000";
    cx.fillStyle = css; // invalid -> keeps previous, which is why alpha is read
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return { rgb: [d[0], d[1], d[2]], a: d[3] / 255 };
  };
  const out = [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  document.querySelectorAll(sel).forEach((el, i) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) return;
    let cum = 1;
    const chain = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const o = parseFloat(getComputedStyle(n).opacity);
      if (!Number.isFinite(o)) continue;
      cum *= o;
      // Who is spending the contrast budget — the whole point of the fix under
      // test, and the only way a failure can be attributed to a file.
      if (o < 0.999) chain.push({ tag: n.tagName.toLowerCase(), cls: String(n.className?.baseVal ?? n.className ?? "").slice(0, 60), opacity: o });
    }
    // GRADE THE GLYPH ROWS, NOT THE BOX. A container's rect spans its children's
    // backgrounds too, so grading it attributes a child's backdrop to ink the
    // container never paints — which produced a spurious 4.24 FAIL on the
    // `.tileDone` tile before this was added. Range rects over the element's
    // DIRECT text nodes are the pixels this element's `color` actually lands on.
    // AND ONLY WHERE THE GLYPHS ARE ACTUALLY ON TOP. Photographing the backdrop
    // cannot tell "ink on a bad backdrop" from "ink underneath something painted
    // later" — the camera sees the occluder either way. Un-masked, an open hover
    // tooltip lying over a flow chip read as 1.00:1 white-on-white. So each text
    // run is diced into ~6px columns and `elementFromPoint` is asked, per column,
    // whether this element is still the topmost thing there. Occluded columns are
    // EXCLUDED from grading and COUNTED, because "covered" is a different defect
    // from "low contrast" and must not be reported as one.
    const runs = [];
    const occluders = new Set();
    let occludedCols = 0;
    let totalCols = 0;
    let directText = "";
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      directText += n.textContent;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      for (const rr of rg.getClientRects()) {
        if (rr.width < 1 || rr.height < 1) continue;
        if (rr.bottom <= 0 || rr.top >= vh || rr.right <= 0 || rr.left >= vw) continue;
        const STEP = 6;
        const cy = Math.min(vh - 1, Math.max(0, rr.top + rr.height / 2));
        for (let sx = Math.max(0, rr.left); sx < Math.min(rr.right, vw) - 0.5; sx += STEP) {
          const w = Math.min(STEP, Math.min(rr.right, vw) - sx);
          if (w < 1) break;
          totalCols++;
          const hit = document.elementFromPoint(sx + w / 2, cy);
          if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) {
            occludedCols++;
            occluders.add(hit ? `${hit.tagName.toLowerCase()}.${String(hit.className?.baseVal ?? hit.className ?? "").slice(0, 50)}` : "(nothing/out of view)");
            continue;
          }
          runs.push({
            x: sx,
            y: Math.max(0, rr.top),
            w,
            h: Math.min(rr.height, vh - Math.max(0, rr.top)),
          });
        }
      }
    }
    const boxRect = {
      x: Math.max(0, r.left),
      y: Math.max(0, r.top),
      w: Math.min(r.width, vw - Math.max(0, r.left)),
      h: Math.min(r.height, vh - Math.max(0, r.top)),
    };
    const ink = resolve(cs.color);
    out.push({
      idx: i,
      cls: String(el.className?.baseVal ?? el.className ?? "").slice(0, 90),
      text: (directText || el.textContent || "").trim().slice(0, 44),
      hasDirectText: runs.length > 0,
      occludedCols,
      totalCols,
      occluders: [...occluders].slice(0, 4),
      opacityChain: chain,
      rects: runs.length ? runs : [boxRect],
      rect: boxRect,
      fg: ink.rgb,
      colourAlpha: ink.a,
      cumOpacity: cum,
      fontPx: parseFloat(cs.fontSize),
      weight: parseInt(cs.fontWeight, 10) || 400,
    });
  });
  return out;
};

/** Force every target's ink (and its descendants') transparent for the backdrop
 *  photograph. Returns a token used to restore. */
const BLANK = (sels) => {
  const touched = [];
  for (const sel of sels) {
    document.querySelectorAll(sel).forEach((el) => {
      for (const n of [el, ...el.querySelectorAll("*")]) {
        touched.push([n, n.getAttribute("style")]);
        n.style.setProperty("color", "transparent", "important");
        n.style.setProperty("text-shadow", "none", "important");
        n.style.setProperty("-webkit-text-fill-color", "transparent", "important");
      }
    });
  }
  window.__kRestore = () => {
    for (const [n, s] of touched) {
      if (s === null) n.removeAttribute("style");
      else n.setAttribute("style", s);
    }
  };
  return touched.length;
};

// ── pixel sampling ─────────────────────────────────────────────────────────
async function rawOf(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height, ch: info.channels };
}

function grade(px, el, dsf) {
  const { fg, colourAlpha, cumOpacity } = el;
  const eff = colourAlpha * cumOpacity;
  const ratios = [];
  const naive = [];
  let bgSum = [0, 0, 0];
  let n = 0;
  const rects = el.rects ?? [el.rect];
  const area = rects.reduce((s, r) => s + r.w * r.h, 0) * dsf * dsf;
  const stride = Math.max(1, Math.round(Math.sqrt(area / 2500)));
  for (const rect of rects) {
    const pad = el.hasDirectText ? 0 : 1;
    const x0 = Math.round((rect.x + pad) * dsf);
    const y0 = Math.round((rect.y + pad) * dsf);
    const x1 = Math.min(px.w, Math.round((rect.x + rect.w - pad) * dsf));
    const y1 = Math.min(px.h, Math.round((rect.y + rect.h - pad) * dsf));
    if (x1 <= x0 || y1 <= y0) continue;
    for (let y = y0; y < y1; y += stride) {
      for (let x = x0; x < x1; x += stride) {
        const o = (y * px.w + x) * px.ch;
        const bg = [px.data[o], px.data[o + 1], px.data[o + 2]];
        ratios.push(ratio(over(fg, bg, eff), bg));
        naive.push(ratio(fg, bg)); // the OLD, opacity-blind reading
        bgSum = [bgSum[0] + bg[0], bgSum[1] + bg[1], bgSum[2] + bg[2]];
        n++;
      }
    }
  }
  if (!n) return null;
  ratios.sort((a, b) => a - b);
  naive.sort((a, b) => a - b);
  const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
  return {
    samples: n,
    p10: q(ratios, 0.1),
    p50: q(ratios, 0.5),
    min: ratios[0],
    naiveP10: q(naive, 0.1),
    effAlpha: eff,
    bgAvg: bgSum.map((s) => Math.round(s / n)),
    fgComposited: over(fg, bgSum.map((s) => s / n), eff).map((c) => Math.round(c)),
  };
}

// ── the pipeline, applied to one page ──────────────────────────────────────
async function measure(page, targets, dsf, shotPath) {
  const found = [];
  for (const t of targets) {
    const els = await page.evaluate(COLLECT, t.sel);
    found.push({ t, els });
  }
  const blanked = await page.evaluate(BLANK, targets.map((t) => t.sel));
  const buf = await page.screenshot({ animations: "disabled" });
  await page.evaluate(() => window.__kRestore?.());
  if (shotPath) writeFileSync(shotPath, await page.screenshot({ animations: "disabled" }));
  const px = await rawOf(buf);
  const rows = [];
  for (const { t, els } of found) {
    if (!els.length) {
      rows.push({ name: t.name, sel: t.sel, src: t.src, matched: 0 });
      continue;
    }
    const graded = [];
    let fullyOccluded = 0;
    for (const el of els) {
      // Entirely covered by something painted later — there is no ink on screen
      // to grade. Counted, never graded, and never reported as a pass.
      if (el.totalCols > 0 && el.occludedCols === el.totalCols) { fullyOccluded++; continue; }
      const g = grade(px, el, dsf);
      if (g) graded.push({ ...el, ...g, threshold: thresholdFor(el.fontPx, el.weight) });
    }
    if (!graded.length) {
      rows.push({ name: t.name, sel: t.sel, src: t.src, matched: els.length, graded: 0, fullyOccluded, occluders: [...new Set(els.flatMap((e) => e.occluders ?? []))].slice(0, 4) });
      continue;
    }
    graded.sort((a, b) => a.p10 - b.p10);
    const worst = graded[0];
    rows.push({
      name: t.name,
      sel: t.sel,
      src: t.src,
      matched: els.length,
      graded: graded.length,
      worst,
      pass: worst.p10 >= worst.threshold,
      blankedNodes: blanked,
    });
  }
  return rows;
}

// ── SELF-TEST — must be able to fail, and is checked for it ────────────────
async function selfTest(browser) {
  const page = await browser.newPage({ viewport: { width: 600, height: 400 } });
  await page.setContent(`<div style="background:#fff;padding:30px;font:16px sans-serif">
    <div id="a" style="color:#fff">WHITE ON WHITE</div>
    <div style="opacity:.18"><div id="b" style="color:#000">TRANSLUCENT ANCESTOR</div></div>
    <div id="c" style="color:#000">BLACK ON WHITE</div>
    <div id="d" style="color:rgba(0,0,0,.18)">TRANSLUCENT COLOUR ALPHA</div>
    <div style="position:relative">
      <div id="e" style="color:#000">COVERED BY AN OVERLAY</div>
      <div style="position:absolute;left:0;top:0;width:100%;height:100%;background:#fff"></div>
    </div>
  </div>`);
  const rows = await measure(
    page,
    [
      { name: "(a) white-on-white", sel: "#a" },
      { name: "(b) opacity .18 ancestor", sel: "#b" },
      { name: "(c) black-on-white", sel: "#c" },
      { name: "(d) colour alpha .18", sel: "#d" },
      { name: "(e) occluded by overlay", sel: "#e" },
    ],
    1,
    path.join(OUT, "selftest.png"),
  );
  await page.close();

  const by = Object.fromEntries(rows.map((r) => [r.name, r]));
  const near = (v, want, tol) => Math.abs(v - want) <= tol;
  const checks = [];
  const a = by["(a) white-on-white"]?.worst;
  const b = by["(b) opacity .18 ancestor"]?.worst;
  const c = by["(c) black-on-white"]?.worst;
  const d = by["(d) colour alpha .18"]?.worst;
  checks.push({ arm: "(a) white-on-white ~= 1.00", got: a?.p10, ok: !!a && near(a.p10, 1.0, 0.05) });
  checks.push({ arm: "(c) black-on-white ~= 21", got: c?.p10, ok: !!c && near(c.p10, 21, 0.4) });
  checks.push({
    arm: "(b) ancestor opacity composited (~1.5, NOT 21)",
    got: b?.p10,
    ok: !!b && b.p10 < 2.2 && b.p10 > 1.2,
  });
  checks.push({
    arm: "(b) composited != opacity-blind reading  (proves step 2 is wired)",
    got: b ? `composited ${b.p10.toFixed(2)} vs blind ${b.naiveP10.toFixed(2)}` : undefined,
    ok: !!b && Math.abs(b.p10 - b.naiveP10) > 5,
  });
  checks.push({
    arm: "(d) colour-channel alpha also composited",
    got: d?.p10,
    ok: !!d && d.p10 < 2.2 && d.p10 > 1.2,
  });
  const e = by["(e) occluded by overlay"];
  checks.push({
    arm: "(e) fully-covered text is detected + NOT graded (occlusion != contrast)",
    got: e ? `graded=${e.graded ?? (e.worst ? 1 : 0)} fullyOccluded=${e.fullyOccluded}` : undefined,
    ok: !!e && !e.worst && e.fullyOccluded === 1,
  });
  return { checks, rows };
}

// ── main ───────────────────────────────────────────────────────────────────
const HEAD = git("rev-parse", "--short", "HEAD");
const DIRTY = git("diff", "HEAD", "--stat", "--", "components", "lib", "app");
console.log(`\nPRECONDITION  HEAD=${HEAD}  src tree=${DIRTY ? "DIRTY" : "clean"}`);
if (DIRTY) console.log(DIRTY.split("\n").slice(-6).join("\n"));

const browser = await chromium.launch({ channel: "chrome" });
const results = { head: HEAD, dirty: !!DIRTY, base: BASE, axes: {}, };

const st = await selfTest(browser);
console.log("\n══ INSTRUMENT SELF-TEST ══");
for (const c of st.checks) console.log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.arm}  ->  ${typeof c.got === "number" ? c.got.toFixed(3) : c.got}`);
results.selfTest = st.checks;
if (st.checks.some((c) => !c.ok)) {
  console.log("\nINSTRUMENT INVALID — app numbers not taken. exit 2");
  writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  await browser.close();
  process.exit(2);
}

const TIER = { name: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false };

for (const axKey of WANT_AXES) {
  const ax = AXES[axKey];
  if (!ax) continue;
  const { ctx, prefsBlocked } = await kContext(browser, TIER, ax);
  results.axes[axKey] = { want: ax, routes: {} };
  for (const route of WANT_ROUTES) {
    const page = await ctx.newPage();
    const consoleOf = collectConsole(page);
    try {
      await page.goto(BASE + ROUTE_URL[route], { waitUntil: "domcontentloaded", timeout: 90000 });
      // Generous hydration — a popover here read 0 items at 3s and 6 at 11s.
      await page.waitForTimeout(4000);
      const sels = TARGETS[route].map((t) => t.sel).join(",");
      await page.waitForSelector(sels, { timeout: 22000 }).catch(() => {});
      await page.waitForTimeout(3000);
      // DAY-HUNT. `/daily` opens on today, and on this fixture today is a day
      // with no lessons — which makes the whole Day cluster unmeasurable and
      // would be reported as "0 matches, environment". The lessons exist (the
      // clock lists them, /weekly renders their tiles), just on another weekday,
      // so step the day forward until the focus card appears. If it never does,
      // the 0-match verdict stands and is honest.
      if (route === "daily") {
        for (let hop = 0; hop < 7; hop++) {
          const n = await page.evaluate(() => document.querySelectorAll('[class*="dobj"],[class*="dcTarget"]').length);
          if (n > 0) { console.log(`   [diag] day-hunt: focus card found after ${hop} hop(s)`); break; }
          const btn = page.locator('button[aria-label="Next day"]').first();
          if (!(await btn.count())) { console.log("   [diag] day-hunt: no next-day control found"); break; }
          await btn.click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(2500);
        }
        // Park the pointer off every control and drop any hover bubble the hunt
        // opened — an onboarding tooltip left hanging over the flow chips is
        // exactly the occlusion the mask now excludes, and it is better not to
        // create it in the first place.
        await page.mouse.move(1435, 890);
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(1200);
        // The flow strip sits below the fold at 1440x900 and under the card's
        // own action footer. Scroll it into view so "occluded" means occluded,
        // not merely off-screen-at-the-default-scroll.
        await page.evaluate(() => document.querySelector('[class*="dcFlow"]')?.scrollIntoView({ block: "center" }));
        await page.waitForTimeout(1500);
      }
      // TEACH-INJECTION. Same precedent and the same honesty rules as the
      // `.clock-done` injection below: when a DATA state the probe does not
      // control refuses to render a surface, inject the element as a child of
      // the REAL parent so it inherits the identical cascade, backdrop and
      // ancestor opacity — then label every number INJECTED.
      //
      // Needed because /teach opens on an empty board here: the lesson rail has
      // no rows, so no board, no slides, no switcher and no objective exist.
      // That is an environment fact, not a verdict — and A3/A4 is a question
      // about whether these token-driven recipes hold in each TONE, which the
      // recipe can answer without the fixture. Anything whose real parent is
      // also absent is skipped and stays honestly unmeasured.
      let teachInjected = [];
      if (route === "teach") {
        teachInjected = await page.evaluate(() => {
          const done = [];
          // [localName, host selector, text] — the host must be the element the
          // real node would have rendered inside, or the backdrop is a fiction.
          // [localName, moduleName, host selector, text]. The MODULE is named
          // explicitly rather than derived from the host's own class: the
          // switcher's labels live in BoardSwitcher.module.css but their only
          // available host is the shell's `.boardHead`, so deriving the prefix
          // from the host looked for `TeachV2Shell_pillLabel__…` and silently
          // found nothing.
          const plan = [
            ["objective", "TeachV2Shell", '[class*="identityText"],[class*="boardTitle"]', "I can find three equivalent fractions."],
            ["pillLabel", "BoardSwitcher", '[class*="BoardSwitcher_switcher"],[class*="boardHead"]', "Warm-Up"],
            ["count", "BoardSwitcher", '[class*="BoardSwitcher_switcher"],[class*="boardHead"]', "5"],
            ["thumbTitle", "SlideFilmstrip", '[class*="SlideFilmstrip_strip"]', "Slide 1"],
            ["thumbNum", "SlideFilmstrip", '[class*="SlideFilmstrip_strip"]', "1"],
            ["popLabel", "WritingBar", '[class*="WritingBar_bar"]', "Highlighter"],
            // `.body` FIRST, not `.pane`. A real `.railName` lives inside the
            // scrolling, padded `.body`; appending to `.pane` instead puts the
            // node after a `flex: 1` child inside `overflow: hidden`, so it
            // lands on the pane's clipped bottom edge and the pixels sampled
            // under it are partly the backdrop BEHIND the pane. That produced a
            // 1.76 p10 against a 9.50 p50 in photo-dim — the straddling-an-edge
            // signature — which would have been reported as a contrast failure
            // of a rule that was never at fault.
            ["railName", "LessonRail", '[class*="LessonRail_body"],[class*="LessonRail_classStack"],[class*="LessonRail_pane"]', "Place Value & Decimals"],
          ];
          for (const [local, moduleName, hostSel, text] of plan) {
            const host = document.querySelector(hostSel);
            if (!host) continue;
            // Reuse a REAL hashed class from the same stylesheet so the CSS
            // module rule actually applies — a bare local name matches nothing.
            const donor = [...document.querySelectorAll('[class*="' + local + '"]')][0];
            let cls = donor ? donor.className : null;
            if (!cls) {
              // No live donor — recover the hashed name from the STYLESHEET, so
              // the CSS-module rule actually applies (a bare local name matches
              // no rule and would measure an unstyled span).
              const needle = "." + moduleName + "_" + local + "__";
              const sheetRule = [...document.styleSheets]
                .flatMap((s) => { try { return [...s.cssRules]; } catch { return []; } })
                .map((r) => r.selectorText || "")
                .find((sel) => sel.includes(needle));
              if (!sheetRule) continue;
              cls = (sheetRule.match(new RegExp(moduleName + "_" + local + "__[A-Za-z0-9_-]+")) || [])[0];
              if (!cls) continue;
            }
            const el = document.createElement("span");
            el.className = cls;
            el.dataset.kInjected = "1";
            el.textContent = text;
            host.appendChild(el);
            done.push(local);
          }
          return done;
        });
        if (teachInjected.length) {
          console.log(`   [diag] teach-injection: ${teachInjected.join(", ")} (INJECTED — recipe measured, not the live data state)`);
        }
      }
      const entryAxes = await readAxes(page);
      // `.clock-done` only renders on a school day whose classes have all
      // ENDED (ChromeClock.tsx:191) — a clock state the wall clock decides, not
      // the probe. Rather than report "0 matches" for a rule that is plainly
      // reachable in production, the element is injected as a SIBLING of the
      // state that did render, so it inherits the identical parent, cascade and
      // backdrop. Every number from it is labelled INJECTED.
      const injected = await page.evaluate(() => {
        const host = document.querySelector(".clock-empty")?.parentElement
          ?? document.querySelector(".clock.glass")
          ?? document.querySelector('[class*="clock-"]')?.parentElement;
        if (!host || host.querySelector(".clock-done")) return false;
        const d = document.createElement("div");
        d.className = "clock-done";
        d.dataset.kInjected = "1";
        d.textContent = "Done for today · up next tomorrow";
        host.appendChild(d);
        return true;
      });
      const diag = await page.evaluate(() => ({
        mainText: (document.querySelector("#main-content")?.innerText || "").replace(/\s+/g, " ").slice(0, 180),
        chipFills: [...document.querySelectorAll('[class*="chipFill"]')].map((e) => e.style.width || getComputedStyle(e).width),
        heroQuote: !!document.querySelector(".hero-quote"),
        clockEmpty: !!document.querySelector(".clock-empty"),
        dayCards: document.querySelectorAll('[class*="dcard"],[class*="vcDetail"],[class*="dcTarget"]').length,
      }));
      const shot = path.join(OUT, `${axKey}--${route}.png`);
      const rows = await measure(page, TARGETS[route], 1, shot);
      const exitAxes = await readAxes(page);
      results.axes[axKey].routes[route] = {
        entryAxes: { frame: entryAxes.frame, theme: entryAxes.theme, bg: entryAxes.bg, tone: entryAxes.tone, glass: entryAxes.glass, dim: entryAxes.dim },
        exitAxes: { frame: exitAxes.frame, theme: exitAxes.theme, bg: exitAxes.bg, tone: exitAxes.tone, glass: exitAxes.glass, dim: exitAxes.dim },
        toneAsWanted: exitAxes.tone === ax.want,
        axesStable: JSON.stringify(entryAxes) === JSON.stringify(exitAxes),
        prefsBlocked: prefsBlocked(),
        console: consoleOf().slice(0, 8),
        injectedClockDone: injected,
        diag,
        rows,
      };
      if (diag.chipFills.length) console.log(`   [diag] chipFill widths: ${[...new Set(diag.chipFills)].join(" ")}`);
      if (route === "daily") console.log(`   [diag] dayCards=${diag.dayCards} main="${diag.mainText.slice(0, 110)}"`);
      if (route === "home") console.log(`   [diag] heroQuote=${diag.heroQuote} clockEmpty=${diag.clockEmpty} clockDoneInjected=${injected}`);
      const tag = `${axKey}/${route} tone=${exitAxes.tone}${exitAxes.tone === ax.want ? "" : ` (WANTED ${ax.want})`}${JSON.stringify(entryAxes) === JSON.stringify(exitAxes) ? "" : " AXES-DRIFTED"}`;
      console.log(`\n── ${tag}`);
      for (const r of rows) {
        if (!r.matched) { console.log(`   ${r.name.padEnd(18)} matched 0  (environment, not a pass)`); continue; }
        if (!r.worst) {
          console.log(`   ${r.name.padEnd(18)} n=${String(r.matched).padStart(3)}  NOT GRADED — ${r.fullyOccluded ?? 0} of ${r.matched} fully occluded by a later-painted element (not a contrast result)  covered by: ${(r.occluders ?? []).join(" | ")}`);
          continue;
        }
        const w = r.worst;
        console.log(
          `   ${r.name.padEnd(18)} n=${String(r.matched).padStart(3)}  ${w.fontPx}px/${w.weight}  ` +
            `eff-a=${w.effAlpha.toFixed(2)}  fg=${w.fgComposited.join(",")}  bg=${w.bgAvg.join(",")}  ` +
            `p10=${w.p10.toFixed(2)} p50=${w.p50.toFixed(2)} (blind ${w.naiveP10.toFixed(2)})  ` +
            `>=${w.threshold}  ${r.pass ? "PASS" : "FAIL"}${w.hasDirectText ? "" : " [CONTAINER-no-direct-text]"}` +
            `${w.occludedCols ? ` [${w.occludedCols}/${w.totalCols} cols OCCLUDED, excluded]` : ""}   "${w.text}"`,
        );
        if (w.opacityChain?.length)
          console.log(`        opacity chain: ${w.opacityChain.map((c) => `${c.tag}.${c.cls}=${c.opacity}`).join("  <  ")}`);
      }
    } catch (e) {
      results.axes[axKey].routes[route] = { error: String(e?.message ?? e).slice(0, 300) };
      console.log(`\n── ${axKey}/${route}  ERROR ${String(e?.message ?? e).slice(0, 160)}`);
    }
    await page.close();
  }
  await ctx.close();
}

writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
console.log(`\nwrote ${path.join(OUT, "results.json")}`);
await browser.close();
