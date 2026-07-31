// scripts/probe-qa-tone-matrix.mjs — the tone-matrix §4b pass for 2026-07-31.
//
// QUESTION: do the seven surfaces that shipped today survive the appearance
// axes? CLAUDE.md §4's forward rule requires every new surface to "survive Wash
// / Photo-Dim / Photo-Bright / Night before shipping", and the legibility
// contract branches on `data-tone`, NEVER on the theme.
//
// ── THE INSTRUMENT NOTE THAT MAKES OR BREAKS THIS FILE ──────────────────────
//
// The `mc-theme-axes` cookie only drives the SSR attributes. After hydration
// the client theme store RE-DERIVES every axis from localStorage. A probe that
// seeds ONLY the cookie renders the SAME TONE TWICE and reports it as two-tone
// coverage — byte-identical measurements presented as "dark" and "light". That
// exact false pass happened in this repo (probe-wave6-visual.mjs:70-88 carries
// the scar).
//
// So this file does BOTH, and then does not trust either: `toneGate()` reads
// the RESOLVED `data-tone` off <html> and refuses to record any measurement
// under a label whose tone the page did not actually produce.
//
// ── CONTRAST IS MEASURED, NEVER SCRAPED ────────────────────────────────────
//
// Chrome returns `oklch(…)` for `color-mix(in oklch, …)` and `color(srgb …)`
// reports 0–1 where `rgb()` reports 0–255; a string parser conflates them and
// INFLATES ratios (repo memory: contrast-probe-colour-parsing). Worse, these
// surfaces sit on FROSTED GLASS over a PHOTO — there is no CSS token anywhere
// that describes what is actually behind the text.
//
// So the backdrop is not computed, it is PHOTOGRAPHED: the probe blanks the
// glyphs (color/-webkit-text-fill-color: transparent on the element and every
// descendant), screenshots the element's box, and reads the real composited
// pixels back — photo, blur, gradient, translucency and all. The foreground is
// canvas-resolved and re-composited over that same measured backdrop. Nothing
// in the chain parses a CSS colour string.
//
// ── SAFETY ─────────────────────────────────────────────────────────────────
//
// NO DATABASE WRITES. `.env.local` sets NEXT_PUBLIC_THEME_SYNC, so the theme
// store would otherwise write the seeded axes to a REAL teacher's
// teacher_preferences row on the PROD Supabase project this dev server points
// at. Every /rest/v1/teacher_preferences request is aborted at the network
// layer before the seeds are applied. Nothing else is written.
//
// Run: node scripts/probe-qa-tone-matrix.mjs [--base=http://localhost:3014]
//      node scripts/probe-qa-tone-matrix.mjs --selftest   (proves the gates fail)

import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { bypassLogin, redact } from "./lib/auth.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const BASE = arg("base", process.env.PROBE_BASE ?? "http://localhost:3014");
const ONLY = arg("only", "").split(",").filter(Boolean);
const SELFTEST = argv.includes("--selftest");
const ONLY_SURFACE = arg("surface", "").split(",").filter(Boolean);
const ONLY_WIDTH = arg("width", "").split(",").filter(Boolean);
const REPO = process.cwd();
const SHOTS = path.join(REPO, "docs/screenshots/qa-tone-matrix");
mkdirSync(SHOTS, { recursive: true });

// ── precondition block (CLAUDE.md §4b: say which tree you measured) ─────────
const git = (...a) => {
  try {
    return execFileSync("git", a, { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};
const HEAD = git("rev-parse", "--short", "HEAD");
const DIRTY = git("diff", "HEAD", "--stat", "--", "components", "lib", "app");
console.log(`\nPRECONDITION  HEAD=${HEAD}  tree=${DIRTY ? "DIRTY" : "clean"}`);
if (DIRTY) console.log(DIRTY);

// ── the four axis combinations ─────────────────────────────────────────────
//
// Tone is DERIVED (lib/theme-values.ts deriveTone:168): night→dark;
// glass=light→light; bg=wash→light; dim=dim→dark; dim=bright→light; else the
// photo's sampled luminance. Every combo below pins tone deterministically —
// none relies on the photo-sampling fallback, which would be non-reproducible.
const AXES = {
  wash: {
    frame: "glass",
    glass: "dark",
    bg: "wash",
    theme: "clear",
    dim: "normal",
    tone: "light",
  },
  "photo-dim": {
    frame: "glass",
    glass: "dark",
    bg: "photo",
    theme: "clear",
    dim: "dim",
    tone: "dark",
  },
  "photo-bright": {
    frame: "glass",
    glass: "dark",
    bg: "photo",
    theme: "clear",
    dim: "bright",
    tone: "light",
  },
  night: {
    frame: "glass",
    glass: "dark",
    bg: "photo",
    theme: "night",
    dim: "normal",
    tone: "dark",
  },
};
const cookieValue = (a) =>
  `v1.${a.frame}.${a.glass}.${a.bg}.${a.theme}.${a.dim}.vivid.highlight`;

// ── verdict ledger ─────────────────────────────────────────────────────────
//
// Four verdicts, and the distinction is the whole point. PASS/FAIL are claims
// about the app. ABSENT means the surface never rendered — a tool that cannot
// fail must not report success, so an unreached surface is NEVER a pass.
// UNVERIFIED means the control for this step did not respond, so any negative
// finding under it would be indistinguishable from an un-hydrated page.
const rows = [];
const record = (v, name, detail = "", extra = {}) => {
  rows.push({ verdict: v, name, detail, ...extra });
  const tag = {
    PASS: "PASS ",
    FAIL: "FAIL ",
    ABSENT: "ABSNT",
    UNVERIFIED: "UNVER",
  }[v];
  console.log(`  ${tag} ${name}${detail ? ` — ${detail}` : ""}`);
};

// ── colour maths ───────────────────────────────────────────────────────────
const lin = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (A, B) => {
  const x = lum(A);
  const y = lum(B);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const over = (fg, alpha, bg) =>
  fg.map((v, i) => v * alpha + bg[i] * (1 - alpha));

// Canvas-resolve runs INSIDE the page: paint the declared value onto a 1×1
// canvas twice (over black, then over white) and read the pixels back. The two
// reads recover the alpha exactly, so `oklch()`, `color-mix()`, `color(srgb …)`
// and every other form Chrome may hand back are all handled without a parser.
const RESOLVER = () => {
  Object.assign(window, {
    __resolveRGBA(css) {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      const x = c.getContext("2d", { willReadFrequently: true });
      const read = (base) => {
        x.clearRect(0, 0, 1, 1);
        x.fillStyle = base;
        x.fillRect(0, 0, 1, 1);
        x.fillStyle = css;
        x.fillRect(0, 0, 1, 1);
        const d = x.getImageData(0, 0, 1, 1).data;
        return [d[0], d[1], d[2]];
      };
      const onBlack = read("#000");
      const onWhite = read("#fff");
      // onWhite[i] - onBlack[i] === 255*(1-alpha)  for straight alpha compositing
      const diff = [0, 1, 2].map((i) => onWhite[i] - onBlack[i]);
      const alpha = 1 - Math.max(0, Math.min(255, Math.max(...diff))) / 255;
      const rgb =
        alpha > 0.004
          ? onBlack.map((v) => Math.min(255, v / alpha))
          : [0, 0, 0];
      return { rgb, alpha, onBlack, onWhite };
    },
  });
};

/**
 * Blank every glyph inside `el` without disturbing a single background, so the
 * screenshot underneath is the TRUE composited backdrop the text sits on.
 * Descendants are handled explicitly: `color` inherits, but a descendant with
 * its own declared colour does not, and an SVG icon paints from `fill`.
 */
const HIDE_TEXT = (el) => {
  const touched = [];
  const nodes = [el, ...el.querySelectorAll("*")];
  for (const n of nodes) {
    touched.push([n, n.getAttribute("style")]);
    n.style.setProperty("color", "transparent", "important");
    n.style.setProperty("-webkit-text-fill-color", "transparent", "important");
    n.style.setProperty("text-shadow", "none", "important");
    n.style.setProperty("fill", "transparent", "important");
    n.style.setProperty("stroke", "transparent", "important");
  }
  window.__restoreText = () => {
    for (const [n, s] of touched) {
      if (s === null) n.removeAttribute("style");
      else n.setAttribute("style", s);
    }
    delete window.__restoreText;
  };
};

/** Median + tail percentiles of the backdrop pixels, from the real screenshot. */
async function backdropStats(buf) {
  const { data, info } = await sharp(buf)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const px = [];
  for (let i = 0; i < data.length; i += ch)
    px.push([data[i], data[i + 1], data[i + 2]]);
  if (!px.length) return null;
  const sorted = px.map((p) => ({ p, l: lum(p) })).sort((a, b) => a.l - b.l);
  const at = (q) =>
    sorted[
      Math.min(
        sorted.length - 1,
        Math.max(0, Math.round(q * (sorted.length - 1))),
      )
    ];
  return {
    median: at(0.5).p.map(Math.round),
    p10: at(0.1).p.map(Math.round),
    p90: at(0.9).p.map(Math.round),
    n: px.length,
  };
}

/**
 * THE MEASUREMENT. Returns null when the element is missing or has no painted
 * box — never a number, so an unreached element cannot become a passing ratio.
 */
async function measureText(page, target, label) {
  // `target` is DATA, never code: {sel, text?, nth?}. An earlier draft shipped
  // the selector as a stringified function evaluated with `new Function` —
  // a code-injection shape that has no business in a QA harness even when the
  // input is the probe's own literal.
  const info = await page.evaluate((t) => {
    const all = [...document.querySelectorAll(t.sel)].filter((n) => {
      if (!t.text) return true;
      return new RegExp(t.text, "i").test((n.textContent ?? "").trim());
    });
    const el = all[t.nth ?? 0];
    if (!el) return null;
    // Bring it into view first: a row further down a scrolled modal has a
    // rect the screenshot clip cannot address, and Playwright throws rather
    // than returning a bad pixel — which ended an entire run mid-axis.
    try {
      el.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "instant",
      });
    } catch {
      /* detached or non-scrollable — the clamp below still protects us */
    }
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3)
      return { tooSmall: true, w: r.width, h: r.height };
    const cs = getComputedStyle(el);
    if (
      cs.visibility === "hidden" ||
      cs.display === "none" ||
      parseFloat(cs.opacity) < 0.05
    )
      return { hidden: true };
    const text = (el.textContent ?? "").trim().slice(0, 60);
    const px = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    // WCAG "large text": >=24px, or >=18.66px when bold.
    const large = px >= 24 || (px >= 18.66 && weight >= 700);
    window.__measureTarget = el;
    return {
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      color: window.__resolveRGBA(cs.color),
      fontPx: px,
      weight,
      large,
      floor: large ? 3.0 : 4.5,
      text,
      count: all.length,
    };
  }, target);

  if (!info) return { status: "absent", label };
  if (info.tooSmall)
    return { status: "absent", label, why: `box ${info.w}×${info.h}` };
  if (info.hidden) return { status: "absent", label, why: "not visible" };

  // Clip inset by 1px so an anti-aliased border does not skew the backdrop,
  // then CLAMPED to the viewport. An element hanging off the edge yields a
  // clip Playwright rejects outright ("Clipped area is either empty or outside
  // the resulting image"), and that throw killed a whole run mid-axis. A
  // measurement that cannot be taken must degrade to ABSENT, never to an
  // exception and never to a number.
  const vp = page.viewportSize() ?? { width: 1440, height: 900 };
  const x0 = Math.max(0, Math.min(vp.width - 1, info.rect.x + 1));
  const y0 = Math.max(0, Math.min(vp.height - 1, info.rect.y + 1));
  const x1 = Math.max(0, Math.min(vp.width, info.rect.x + info.rect.width - 1));
  const y1 = Math.max(
    0,
    Math.min(vp.height, info.rect.y + info.rect.height - 1),
  );
  const clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  if (clip.width < 2 || clip.height < 2)
    return {
      status: "absent",
      label,
      why: `clip ${clip.width}×${clip.height} after viewport clamp`,
    };

  await page.evaluate(`(${HIDE_TEXT.toString()})(window.__measureTarget)`);
  let buf = null;
  try {
    buf = await page.screenshot({ clip, animations: "disabled" });
  } catch (e) {
    return {
      status: "absent",
      label,
      why: `screenshot failed: ${String(e.message).split("\n")[0]}`,
    };
  } finally {
    await page.evaluate(() => window.__restoreText?.()).catch(() => {});
  }
  const bd = await backdropStats(buf).catch(() => null);
  if (!bd) return { status: "absent", label, why: "empty screenshot" };

  const fg = over(info.color.rgb, info.color.alpha, bd.median);
  const rMedian = contrast(fg, bd.median);
  // Worst case over the backdrop's spread — the honest number over a photo,
  // where a "median" backdrop can hide a bright patch under the glyphs.
  const rWorst = Math.min(
    contrast(over(info.color.rgb, info.color.alpha, bd.p10), bd.p10),
    contrast(over(info.color.rgb, info.color.alpha, bd.p90), bd.p90),
  );
  return {
    status: "ok",
    label,
    ratio: rMedian,
    worst: rWorst,
    floor: info.floor,
    fontPx: info.fontPx,
    weight: info.weight,
    text: info.text,
    fg: fg.map(Math.round),
    bg: bd.median,
    spread: [
      Math.round(lum(bd.p10) * 1000) / 1000,
      Math.round(lum(bd.p90) * 1000) / 1000,
    ],
  };
}

// ── context factory: BOTH halves of the seed, plus the network guard ────────
async function makeContext(browser, axisKey, viewport) {
  const a = AXES[axisKey];
  const ctx = await browser.newContext(viewport);
  ctx.setDefaultNavigationTimeout(180000);
  ctx.setDefaultTimeout(45000);

  // NO DATABASE WRITES — installed BEFORE auth so no seeded axis can ever be
  // mirrored to a real teacher's row on the prod project this dev server uses.
  const rest = [];
  await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
  ctx.on("request", (r) => {
    if (r.url().includes("/rest/v1/"))
      rest.push(r.url().split("/rest/v1/")[1].split("?")[0]);
  });

  await ctx.addInitScript(RESOLVER);
  await ctx.addInitScript((ax) => {
    try {
      localStorage.setItem(
        "mycurricula:onboarding",
        JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
      );
      // BOTH HALVES. The cookie below only reaches SSR; these five keys are
      // what the client store re-derives from after hydration.
      localStorage.setItem("mycurricula:user:theme-frame", ax.frame);
      localStorage.setItem("mycurricula:user:theme-glass", ax.glass);
      localStorage.setItem("mycurricula:user:theme-bg", ax.bg);
      localStorage.setItem("mycurricula:user:theme", ax.theme);
      localStorage.setItem("mycurricula:user:theme-dim", ax.dim);
      localStorage.setItem("mycurricula:user:theme-style", "vivid");
      localStorage.setItem("mycurricula:user:theme-palette", "highlight");
    } catch {
      /* storage disabled — the tone gate will catch the consequence */
    }
  }, a);
  await ctx.addCookies([
    { name: "mc-theme-axes", value: cookieValue(a), url: BASE },
  ]);
  await bypassLogin(ctx, {
    base: BASE,
    next: "/weekly",
    retries: 2,
    timeout: 180000,
  });
  return { ctx, rest };
}

/**
 * THE TONE GATE. Without this the whole report is worthless: a probe that
 * seeded the wrong half renders one tone twice and labels it two.
 * Returns the RESOLVED tone; the caller must abandon the case on mismatch.
 */
async function toneGate(page, axisKey, where) {
  const got = await page.evaluate(() => ({
    tone: document.documentElement.getAttribute("data-tone"),
    bg: document.documentElement.getAttribute("data-bg"),
    theme: document.documentElement.getAttribute("data-theme"),
    dim: document.documentElement.getAttribute("data-dim"),
    frame: document.documentElement.getAttribute("data-frame"),
  }));
  const want = AXES[axisKey].tone;
  const okTone = got.tone === want;
  record(
    okTone ? "PASS" : "FAIL",
    `[gate] ${axisKey} @ ${where} resolved data-tone=${want}`,
    `measured tone=${got.tone} bg=${got.bg} theme=${got.theme} dim=${got.dim} frame=${got.frame}`,
  );
  return okTone ? got : null;
}

// ── the seven surfaces that shipped 2026-07-31 ─────────────────────────────
//
// Each descriptor is: how to reach it, the ROOT that proves it rendered, and
// the text it must keep legible. `root` is the gate — if it never appears the
// surface is ABSENT and nothing under it is scored, in either direction.
const SURFACES = [
  {
    id: "plan-timeline",
    name: "Plan timeline (/planner)",
    goto: "/planner",
    root: "[data-lane-subject]",
    // The card flips [data-mounted] only after its mount effect; the today
    // line and "Now:" meta are legitimately unpainted before it.
    settle: "[data-mounted]",
    text: [
      ["lane subject name", { sel: '[class*="timeline_laneName__"]' }],
      ["lane Now/Next meta", { sel: '[class*="timeline_laneNow__"]' }],
      ["unit band name", { sel: '[class*="timeline_bandName__"]' }],
      ["band count ratio", { sel: '[class*="timeline_bandCount__"]' }],
      ["day-axis weekday", { sel: '[class*="timeline_dayWkd__"]' }],
      ["month band label", { sel: '[class*="timeline_month__"]' }],
    ],
  },
  {
    id: "refine-tab",
    name: "Refine tab (unit workspace -> Refine)",
    // The canonical path from the brief: /year -> unit chip -> Refine. All four
    // axes here use frame=glass, so YearA (and its [data-year-chip]) is always
    // the opener; a paper/color frame would need a different one.
    goto: "/year",
    open: async (page) => {
      await page.waitForSelector("button[data-year-chip]", { timeout: 120000 });
      // A DIRECT .click(), not a synthesised pointer sequence — the chip sits
      // inside a horizontally scrolling strip, so Playwright's real mouse press
      // can land on an overlapping neighbour after an auto-scroll.
      await page.evaluate(() =>
        document.querySelector("button[data-year-chip]")?.click(),
      );
      await page.waitForSelector('[role="dialog"][aria-modal="true"]', {
        timeout: 60000,
      });
      await page.waitForSelector('[data-ue-tab="refine"]', { timeout: 30000 });
      await page.evaluate(() =>
        document.querySelector('[data-ue-tab="refine"]')?.click(),
      );
    },
    root: "#ue-tabpanel tbody tr",
    text: [
      ["table caption", { sel: '#ue-tabpanel [class*="RefineTab_caption__"]' }],
      ["column header", { sel: "#ue-tabpanel thead th", nth: 1 }],
      [
        "row meta (Wk N · Day)",
        { sel: '#ue-tabpanel [class*="RefineTab_rowMeta__"]' },
      ],
      [
        "pass progress status",
        { sel: '#ue-tabpanel [class*="RefineTab_passProgress__"]' },
      ],
      [
        "empty-cell placeholder",
        { sel: '#ue-tabpanel [class*="RefineTab_placeholder__"]' },
      ],
      [
        "dot completeness count",
        { sel: '#ue-tabpanel [class*="RefineTab_dotCount__"]' },
      ],
    ],
  },
  {
    id: "teach-header",
    name: "Teach v2 board header (/teach)",
    // Deep-linked for the same reason as /daily and /post: today (2026-07-31)
    // sits outside the mock fixtures' Sun–Thu weeks, so a bare /teach resolves
    // NO lesson and BoardHeadIdentity renders only the glyph + a fallback
    // name — the subject tag, objective and standards are absent BY DESIGN
    // (BoardHeadIdentity.tsx:88). Measuring that and calling it a pass would be
    // reporting coverage of a header that was never populated.
    goto: "/teach?lesson=m-11-1",
    root: '[class*="TeachV2Shell_boardHead__"]',
    text: [
      ["board name", { sel: '[class*="TeachV2Shell_boardName__"]' }],
      ["subject tag", { sel: '[class*="TeachV2Shell_subjectTag__"]' }],
      ["objective", { sel: '[class*="TeachV2Shell_objective__"]' }],
      ["identity meta", { sel: '[class*="TeachV2Shell_identityMeta__"]' }],
      ["standards +N", { sel: '[class*="TeachV2Shell_standardsMore__"]' }],
      ["standard pill", { sel: '[class*="StandardPill_"]' }],
    ],
  },
  {
    id: "board-library",
    name: "Board Library (/boards)",
    goto: "/boards",
    root: '[class*="BoardLibrary_root__"]',
    text: [
      ["sidebar nav heading", { sel: '[class*="BoardLibrary_navHeading__"]' }],
      ["Team/Mine segment", { sel: '[class*="BoardLibrary_segment__"]' }],
      [
        "board-cap meter label",
        { sel: '[class*="BoardLibrary_meterLabel__"]' },
      ],
      ["card title", { sel: '[class*="BoardLibrary_cardTitle__"]' }],
      ["card meta line", { sel: '[class*="BoardLibrary_metaLine__"]' }],
      ["filter pill", { sel: '[class*="BoardLibrary_filterPill__"]' }],
    ],
  },
  {
    id: "catchup-rowmeta",
    name: "Catch-Up row meta (/catch-up)",
    goto: "/catch-up",
    root: '[class*="CatchUpModal_rowMeta__"]',
    text: [
      ["meta chip (day due)", { sel: '[class*="CatchUpModal_metaChip__"]' }],
      ["lateness chip", { sel: '[class*="CatchUpModal_metaLate__"]' }],
      ["reason label", { sel: '[class*="CatchUpModal_reasonLabel__"]' }],
      ["reason text", { sel: '[class*="CatchUpModal_rowReason__"]' }],
      ["row sub identity", { sel: '[class*="CatchUpModal_rowSub__"]' }],
      ["group count", { sel: '[class*="CatchUpModal_groupCount__"]' }],
    ],
  },
  {
    id: "day-post",
    name: "Day frames' Post button (/daily)",
    goto: "/daily?lesson=m-11-1",
    root: '[data-planner-item^="lesson:"] [class*="day-v2_vaPillBtn"]',
    text: [
      [
        "Post pill label",
        {
          sel: '[data-planner-item^="lesson:"] [class*="day-v2_vaPillBtn"]',
          text: "^Post$",
        },
      ],
      [
        "Plan pill label",
        {
          sel: '[data-planner-item^="lesson:"] [class*="day-v2_vaPillBtn"]',
          text: "^Plan$",
        },
      ],
      [
        "Teach pill label",
        {
          sel: '[data-planner-item^="lesson:"] [class*="day-v2_vaPillBtn"]',
          text: "^Teach$",
        },
      ],
      ["row lesson title", { sel: '[class*="day-v2_vaTitle__"]' }],
      ["row subject line", { sel: '[class*="day-v2_vaUnitSubject__"]' }],
      ["row time column", { sel: '[class*="day-v2_vaTime__"]' }],
    ],
    // The one control on this surface that is a TARGET, not just text.
    touch: [
      [
        "Post pill",
        '[data-planner-item^="lesson:"] [class*="day-v2_vaPillBtn"]',
        "^Post$",
      ],
    ],
  },
  {
    id: "post-chips",
    name: "/post section tag chips",
    goto: "/post?lesson=m-11-1",
    root: "[data-sectags]",
    text: [
      [
        "tag chip (KNOWN 48% divergence)",
        { sel: '[data-sectags] > span[role="listitem"]' },
      ],
      [
        "tag chip label",
        { sel: '[data-sectags] [class*="Section_tagLabel__"]' },
      ],
      [
        "+N overflow pill",
        { sel: '[data-sectags] button[class*="Section_tagMore__"]' },
      ],
      ["section title", { sel: '[class*="Section_title__"]' }],
      ["section meta", { sel: '[class*="Section_meta__"]' }],
      ["section count badge", { sel: '[class*="Section_count__"]' }],
    ],
  },
];

// ── the subject-solid non-text check (WCAG 1.4.11) ─────────────────────────
//
// PRE-EXISTING on master, not from today's work — measured here because it is
// the evidence the subject-colour lane needs, and because it is cheap to take
// while four tones are already seeded.
const SUBJECT_SOLIDS = async (page) =>
  page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const surface = window.__resolveRGBA(
      cs.getPropertyValue("--surface").trim() || "#fff",
    );
    const out = [];
    for (let i = 1; i <= 15; i += 1) {
      const raw = cs.getPropertyValue(`--subj-${i}`).trim();
      if (!raw) continue;
      out.push({ i, solid: window.__resolveRGBA(raw).rgb.map(Math.round) });
    }
    return { surface: surface.rgb.map(Math.round), solids: out };
  });

// ── driver ─────────────────────────────────────────────────────────────────
const VIEWPORTS = {
  1440: { viewport: { width: 1440, height: 900 } },
  // Repo memory (mobile-emulation-viewport-measure): a phone probe without
  // isMobile + deviceScaleFactor measures a narrow DESKTOP, not a phone.
  375: {
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
};

async function runSurface(page, s, axisKey, width, restCounter) {
  const tag = `${axisKey}/${width}/${s.id}`;
  const consoleErrors = [];
  const onMsg = (m) => {
    if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
  };
  page.on("console", onMsg);

  try {
    await page.goto(`${BASE}${s.goto}`, {
      waitUntil: "domcontentloaded",
      timeout: 180000,
    });
  } catch (e) {
    record(
      "ABSENT",
      `${tag} — navigation`,
      redact(String(e.message).split("\n")[0]),
    );
    page.off("console", onMsg);
    return null;
  }

  // ── HYDRATION GATE ───────────────────────────────────────────────────────
  //
  // MEASURED on this machine, under this repo's normal multi-lane load:
  // React attached at 63.2s and the timeline's own [data-mounted] at 118.9s.
  // The 3s settle this file originally used measured SSR HTML — and an
  // un-hydrated page is the single most expensive false finding available
  // here: every control "does nothing" and every conditional chip is
  // "missing", which reads exactly like a broken surface.
  //
  // React 19 stamps __reactFiber$ on host nodes only once the client renderer
  // has attached, so its ABSENCE is proof of no hydration rather than an
  // inference from a dead click.
  let hydrated = true;
  try {
    await page.waitForFunction(
      () => {
        const nodes = document.querySelectorAll("body *");
        for (let i = 0; i < nodes.length; i += 1)
          for (const k in nodes[i])
            if (k.startsWith("__reactFiber$")) return true;
        return false;
      },
      null,
      { timeout: 240000, polling: 500 },
    );
  } catch {
    hydrated = false;
  }
  if (!hydrated) {
    // UNVERIFIED, never FAIL: nothing on a non-hydrated page can be scored.
    record(
      "UNVERIFIED",
      `${tag} — hydration gate`,
      "React never attached in 240s (dev-server contention)",
    );
    page.off("console", onMsg);
    return null;
  }
  await page.waitForTimeout(1500);

  // TONE GATE — before anything is measured. A case whose tone the page did
  // not produce is abandoned, never reported.
  const tone = await toneGate(page, axisKey, s.id);
  if (!tone) {
    record(
      "UNVERIFIED",
      `${tag} — abandoned`,
      "tone gate failed; measurements would be mislabelled",
    );
    page.off("console", onMsg);
    return null;
  }

  if (s.open) {
    try {
      await s.open(page);
    } catch (e) {
      record(
        "ABSENT",
        `${tag} — could not open`,
        redact(String(e.message).split("\n")[0]),
      );
      page.off("console", onMsg);
      return null;
    }
  }

  // THE SURFACE GATE. Absence assertions fail open, so nothing below this line
  // may be scored unless the surface itself is on screen.
  let present = true;
  try {
    await page.waitForSelector(s.root, { state: "visible", timeout: 90000 });
  } catch {
    present = false;
  }
  if (!present) {
    record(
      "ABSENT",
      `${tag} — surface never rendered`,
      `root ${s.root} not visible in 90s`,
    );
    await page
      .screenshot({
        path: path.join(SHOTS, `${s.id}-${axisKey}-${width}-ABSENT.png`),
      })
      .catch(() => {});
    page.off("console", onMsg);
    return null;
  }
  if (s.settle)
    await page.waitForSelector(s.settle, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1200);
  record("PASS", `${tag} — surface rendered`, `tone=${tone.tone}`);

  const shot = path.join(SHOTS, `${s.id}-${axisKey}-${width}.png`);
  await page.screenshot({ path: shot }).catch(() => {});

  // document-level horizontal scroll (§4 responsive contract)
  const scrollX = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  record(
    scrollX <= 1 ? "PASS" : "FAIL",
    `${tag} — no document h-scroll`,
    `${scrollX}px`,
  );

  const measured = [];
  for (const [label, target] of s.text) {
    const m = await measureText(page, target, label);
    if (m.status !== "ok") {
      // ABSENT, never FAIL and never PASS. A conditional chip that legitimately
      // has no data looks identical to a broken one from here.
      record("ABSENT", `${tag} — ${label}`, m.why ?? "not found");
      continue;
    }
    measured.push({
      ...m,
      tag,
      axisKey,
      width,
      surface: s.id,
      tone: tone.tone,
    });
    // GRADE ON THE WORST BACKDROP, NOT THE MEDIAN.
    //
    // This read `m.ratio >= m.floor` — the MEDIAN backdrop. Over a photograph
    // the median and the tail diverge hard, and the median is the flattering
    // one: during a deliberate mutation run this line printed
    //   `section title … PASS 4.64:1 (worst 1.51:1)`
    // i.e. a PASS on text that was invisible where it crossed a dark patch.
    // The median is still reported, because it is the honest summary of the
    // whole box, but a glyph only has to be unreadable SOMEWHERE to be
    // unreadable. Both numbers are kept on the row so a reader can see the
    // spread rather than take the verdict on trust.
    const passAA = m.worst >= m.floor;
    record(
      passAA ? "PASS" : "FAIL",
      `${tag} — ${label} AA (floor ${m.floor}, graded on WORST)`,
      `${m.ratio.toFixed(2)}:1 (worst ${m.worst.toFixed(2)}:1) ${m.fontPx}px/${m.weight} ` +
        `fg=${m.fg.join(",")} bg=${m.bg.join(",")} "${m.text}"`,
      { ratio: m.ratio, worst: m.worst, floor: m.floor },
    );
  }

  // ≥44px touch targets on phone (CLAUDE.md §4).
  if (width === 375 && s.touch) {
    for (const [label, sel, text] of s.touch) {
      const box = await page.evaluate(
        (t) => {
          const el = [...document.querySelectorAll(t.sel)].find((n) =>
            new RegExp(t.text, "i").test((n.textContent ?? "").trim()),
          );
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        },
        { sel, text },
      );
      if (!box)
        record("ABSENT", `${tag} — ${label} touch target`, "control not found");
      else
        record(
          box.h >= 44 ? "PASS" : "FAIL",
          `${tag} — ${label} touch target ≥44px`,
          `${box.w}×${box.h}`,
        );
    }
  }

  if (consoleErrors.length) {
    record(
      "FAIL",
      `${tag} — browser console clean`,
      `${consoleErrors.length}: ${consoleErrors[0]}`,
    );
  } else {
    record("PASS", `${tag} — browser console clean`);
  }
  page.off("console", onMsg);
  return measured;
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome" });
  const all = [];
  const restSeen = new Set();
  let subjectReport = null;

  // 1440 gets all four axes; 375 gets one dark + one light. Stated, not implied.
  const PLAN = [
    ["wash", 1440],
    ["photo-dim", 1440],
    ["photo-bright", 1440],
    ["night", 1440],
    ["photo-dim", 375],
    ["wash", 375],
  ];

  for (const [axisKey, width] of PLAN) {
    if (ONLY.length && !ONLY.includes(axisKey)) continue;
    if (ONLY_WIDTH.length && !ONLY_WIDTH.includes(String(width))) continue;
    console.log(
      `\n══ ${axisKey} @ ${width} (expect tone=${AXES[axisKey].tone}) ══`,
    );
    let ctx, rest;
    try {
      ({ ctx, rest } = await makeContext(browser, axisKey, VIEWPORTS[width]));
    } catch (e) {
      record(
        "UNVERIFIED",
        `${axisKey}@${width} — context/auth`,
        redact(String(e.message).split("\n")[0]),
      );
      continue;
    }
    const page = await ctx.newPage();
    for (const s of SURFACES) {
      if (ONLY_SURFACE.length && !ONLY_SURFACE.includes(s.id)) continue;
      const m = await runSurface(page, s, axisKey, width, rest);
      if (m) all.push(...m);
    }
    // Subject solids: measure once per TONE, on a settled page.
    if (!subjectReport || !subjectReport[AXES[axisKey].tone]) {
      const sub = await SUBJECT_SOLIDS(page).catch(() => null);
      if (sub) {
        subjectReport = subjectReport ?? {};
        const fails = sub.solids
          .map((s2) => ({ i: s2.i, r: contrast(s2.solid, sub.surface) }))
          .sort((a, b) => a.r - b.r);
        subjectReport[AXES[axisKey].tone] = {
          surface: sub.surface,
          ratios: fails,
        };
        const under = fails.filter((f) => f.r < 3.0);
        record(
          under.length ? "FAIL" : "PASS",
          `[pre-existing] subject solids vs --surface, tone=${AXES[axisKey].tone} (WCAG 1.4.11, 3:1)`,
          `${under.length}/${fails.length} below 3:1 — worst --subj-${fails[0].i} at ${fails[0].r.toFixed(2)}:1`,
        );
      }
    }
    rest.forEach((r) => restSeen.add(r));
    console.log(
      `  [/rest/v1/ requests seen: ${rest.length} -> ${[...new Set(rest)].join(", ") || "none"}]`,
    );
    await ctx.close();
  }
  await browser.close();

  writeFileSync(
    path.join(SHOTS, "results.json"),
    JSON.stringify(
      {
        head: HEAD,
        dirty: !!DIRTY,
        base: BASE,
        rows,
        measured: all,
        subjectReport,
        restSeen: [...restSeen],
      },
      null,
      2,
    ),
  );

  const n = (v) => rows.filter((r) => r.verdict === v).length;
  console.log(
    `\n── ${n("PASS")} PASS · ${n("FAIL")} FAIL · ${n("ABSENT")} ABSENT · ${n("UNVERIFIED")} UNVERIFIED ──`,
  );
  console.log(
    `   /rest/v1/ endpoints touched: ${[...restSeen].join(", ") || "NONE (mock planner path)"}`,
  );
  console.log(`   evidence: ${SHOTS}`);

  // EXIT NON-ZERO ON FAILURE. main() had no process.exit at all, so node fell
  // off the end with status 0 — this probe printed its FAIL rows and then told
  // its caller the run succeeded. Under `| tail`, inside an `&&` chain, or in
  // CI that is indistinguishable from a clean pass, and it is the same defect
  // already found twice today in other probes.
  //
  // Zero measurements is also a failure: no ratios means the probe never
  // reached the app, and `0 FAIL` must not read as green.
  //
  // UNVERIFIED does NOT fail the run on its own — it is the deliberate "the
  // control did not respond, so nothing here can be scored either way"
  // verdict, and collapsing it into FAIL would destroy the distinction this
  // probe exists to make. But "nothing could be verified" and "everything
  // passed" MUST NOT look the same to a caller reading only the exit code, so
  // a run that produced no ratios exits 1 either way — and says which of the
  // two causes it was, because "the probe never reached the app" and "every
  // control was unresponsive" call for completely different fixes.
  const noRatios = all.length === 0;
  console.log(
    `   coverage: ${all.length} ratios scored · ${n("ABSENT")} absent · ${n("UNVERIFIED")} unverified`,
  );

  // THREE EXIT CODES. "The app is broken" and "the instrument is blind" are
  // different facts and must not share a signal.
  //
  //   0  fully verified, nothing failing
  //   1  real contrast failures    — the APP is broken
  //   2  incomplete coverage       — the INSTRUMENT is blind
  //
  // UNVERIFIED still does not become FAIL — that distinction is the whole
  // reason this probe has four verdicts — but it can no longer end in exit 0
  // either. A run where almost everything was unverified and one case passed
  // would otherwise read green while having checked essentially nothing, and a
  // caller in an `&&` chain sees only the number. Exit 2 is failure to every
  // caller and legible as blindness to a human.
  //
  // Precedence: measured failures outrank blindness. A run that both failed
  // and was partly blind exits 1, because a real failure is the more
  // actionable fact; the coverage line above still records the gaps.
  if (n("FAIL") > 0) {
    console.log(`\nFAILED (exit 1) — ${n("FAIL")} assertion(s) did not pass.`);
    process.exit(1);
  }
  if (noRatios) {
    console.log(
      n("UNVERIFIED") > 0
        ? `\nINCOMPLETE (exit 2) — nothing could be verified: 0 ratios computed and ${n("UNVERIFIED")} unresponsive control(s). This is NOT a pass.`
        : "\nINCOMPLETE (exit 2) — no contrast ratios were computed. The probe never measured the app.",
    );
    process.exit(2);
  }
  if (n("UNVERIFIED") > 0 || n("ABSENT") > 0) {
    console.log(
      `\nINCOMPLETE (exit 2) — ${all.length} ratios scored, but ${n("UNVERIFIED")} unverified and ${n("ABSENT")} absent were never scored in either direction.`,
    );
    process.exit(2);
  }
  console.log(`\nOK (exit 0) — ${all.length} ratios scored, none failing.`);
  process.exit(0);
}

// ── selftest: prove the gates can FAIL, rather than asserting it ────────────
//
// A gate nobody has SEEN fail is not a gate (repo memory: verification
// instruments fail open). This deliberately mis-seeds a case and requires the
// tone gate to reject it.
async function selftest() {
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext(VIEWPORTS[1440]);
  ctx.setDefaultNavigationTimeout(180000);
  await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
  await ctx.addInitScript(RESOLVER);
  // THE COOKIE-ONLY SEED — the exact mistake that produced the silent false
  // pass. localStorage says wash (light); the cookie says photo-dim (dark).
  await ctx.addInitScript(() => {
    localStorage.setItem(
      "mycurricula:onboarding",
      JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
    );
    localStorage.setItem("mycurricula:user:theme-bg", "wash");
    localStorage.setItem("mycurricula:user:theme", "clear");
    localStorage.setItem("mycurricula:user:theme-glass", "dark");
    localStorage.setItem("mycurricula:user:theme-dim", "normal");
  });
  await ctx.addCookies([
    { name: "mc-theme-axes", value: cookieValue(AXES["photo-dim"]), url: BASE },
  ]);
  await bypassLogin(ctx, {
    base: BASE,
    next: "/weekly",
    retries: 2,
    timeout: 180000,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  const before = rows.length;
  const got = await toneGate(page, "photo-dim", "selftest");
  const rejected = got === null && rows[before].verdict === "FAIL";
  console.log(
    `\n  ${rejected ? "ok  " : "FAIL"} tone gate REJECTS a cookie-only seed ` +
      `(the false-pass shape) — ${rows[before].detail}`,
  );

  // And the contrast measurement must refuse a missing element rather than
  // returning a number.
  const miss = await measureText(
    page,
    { sel: "#definitely-not-here" },
    "control",
  );
  console.log(
    `  ${miss.status === "absent" ? "ok  " : "FAIL"} measureText returns ABSENT, not a ratio, for a missing element`,
  );

  // Positive control: a real element DOES measure, so the "absent" above is
  // about the selector and not about a dead instrument.
  const hit = await measureText(page, { sel: "body" }, "control");
  const measures = hit.status === "ok" && hit.ratio > 0;
  console.log(
    `  ${measures ? "ok  " : "FAIL"} positive control: <body> measures (${hit.ratio?.toFixed(2)}:1)`,
  );

  await ctx.close();
  await browser.close();
  // EVERY check gates the exit code, not just the first one.
  // ─────────────────────────────────────────────────────────────────────────
  // This read `process.exit(rejected ? 0 : 1)`, so the two control checks
  // below the tone gate printed a literal `FAIL` line and then exited 0. The
  // selftest — whose entire job is to prove this instrument cannot report an
  // unearned pass — could itself report an unearned pass, on two of its three
  // checks. Same shape as the four probe defects task #42 was opened for,
  // sitting inside the hardening written to close them.
  //
  // Note the asymmetry, because it is the whole design: `rejected` and
  // `absent` are REJECTIONS (the instrument must refuse), `measures` is a
  // POSITIVE CONTROL (the instrument must not refuse). A gate that always
  // fails is as worthless as one that never does, so both directions have to
  // hold for the run to mean anything — and therefore both have to gate the
  // exit code.
  const checks = [
    ["tone gate rejects a cookie-only seed", rejected],
    ["measureText returns ABSENT for a missing element", miss.status === "absent"],
    ["positive control: <body> measures", measures],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length > 0) {
    console.log(
      `\nSELFTEST FAILED — ${failed.length} of ${checks.length} check(s) did not hold:`,
    );
    for (const [name] of failed) console.log(`  x ${name}`);
    process.exit(1);
  }
  console.log(`\nSELFTEST PASSED — all ${checks.length} checks held.`);
  process.exit(0);
}

if (SELFTEST) await selftest();
else await main();

export { AXES, contrast, lum, over, cookieValue, backdropStats };
