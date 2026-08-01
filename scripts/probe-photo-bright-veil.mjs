// scripts/probe-photo-bright-veil.mjs — regression sweep for the light-tone
// photo veil added to app/themes.css (task #30 / audit B1+B2).
//
// WHAT THIS ANSWERS, AND WHAT IT DOES NOT
// ───────────────────────────────────────────────────────────────────────────
// scripts/probe-qa-tone-matrix.mjs is the primary instrument: it seeds BOTH
// halves of the appearance state (the mc-theme-axes cookie AND the five
// localStorage keys), gates on the RESOLVED data-tone, and measures the four
// canonical axes end-to-end. That run is the evidence that the DERIVATION is
// right and that the fix works on the shipped axes.
//
// It cannot answer the breadth question in useful time. A single page load on
// this machine costs 60–120 s of dev hydration, so 7 themes × 2 dim values ×
// 3 widths through the front door is hours, not minutes.
//
// So this probe asks a narrower, CSS-LAYER question: *given* tone=light over a
// photo, does the stage veil hold up under every theme and at every width?
// It loads the surface ONCE per width and then flips `data-theme` / `data-dim`
// / `data-tone` DIRECTLY on <html>, because the stage is pure CSS driven by
// those attributes — no React state is involved in painting it.
//
// THAT MEANS THIS PROBE DELIBERATELY BYPASSES THE TONE GATE, and its results
// are NOT evidence that the app derives those tones. They are evidence about
// the CSS rule only. The derivation is proven separately, by the four-axis run.
// Stated here rather than buried, because a probe that quietly sets the very
// attribute it is meant to observe is the exact false-pass shape this repo has
// shipped before.
//
// THE AXIS GATE COVERS EVERY AXIS THE SELECTOR READS — tone, frame, bg, dim,
// theme AND data-glass — not just tone. Paper also derives tone=light, so a
// tone-only gate would wave through a page that never exercises
// `[data-tone="light"][data-frame="glass"][data-bg="photo"]` and report the fix
// verified while measuring a surface the fix does not touch. On any mismatch
// the surface is ABANDONED, not degraded: frame and glass come from the seed,
// so a bad seed invalidates every stamped case that would follow.
//
// NOTHING HERE IS ALLOWED TO PASS BY BEING ABSENT. Every listed element is
// REQUIRED; a missing one is a FAIL, not an ABSENT, and a run that computed
// ZERO ratios exits non-zero. Absence of a failing measurement is not a pass —
// a dead server, a broken auth hop, an unhydrated page or a renamed CSS-module
// class all produce "0 failures", and this probe used to exit 0 on all four.
//
// Contrast technique is identical to the primary probe and is NOT re-derived
// from CSS strings: the foreground is canvas-resolved in-page (painted over
// black and over white, which recovers alpha exactly, so oklch()/color-mix()/
// color(srgb …) all work without a parser), and the backdrop is PHOTOGRAPHED —
// glyphs blanked, element box screenshotted, real composited pixels read back.
//
// SAFETY: every /rest/v1/teacher_preferences request is aborted at the network
// layer before any seed is applied, so the seeded axes can never be mirrored
// into a real teacher's row on the prod Supabase project this dev server uses.
//
// Run: node scripts/probe-photo-bright-veil.mjs [--base=http://localhost:3014]
//      node scripts/probe-photo-bright-veil.mjs --glass=light
//        → the WHITE-frosted register. deriveTone (lib/theme-values.ts:176)
//          returns light on `glass === "light"` BEFORE it consults dim, so that
//          register reaches light tone at EVERY dim value and matches the veil
//          selector too. It was unmeasured until this flag existed.
//      node scripts/probe-photo-bright-veil.mjs --subjcolor
//        → seeds the wall's "Color sections by subject" switch ON. That mode is
//          painted by a DIFFERENT rule than the default one (see the --subjcolor
//          note further down), so a run without this flag says nothing about it.
//          Gated in both directions: the run is abandoned if the wall did not
//          actually render in the mode the flag claims.
//      node scripts/probe-photo-bright-veil.mjs --selftest
//        → EIGHT assertions, deliberately of two kinds. A gate that always
//          fails is as useless as one that never does, so the rejections are
//          paired with positive controls:
//
//          FIVE REJECTIONS — the instrument must refuse:
//            1. a missing element yields ABSENT, never a ratio
//            2. a known-bad colour pair scores below 4.5
//            3. the axis gate rejects a Paper frame that still derives
//               tone=light (prints a visible FAIL row)
//            4. the axis gate rejects the wrong data-glass register (ditto)
//            5. zero ratios computed is a FAILURE, not a clean 0/0
//
//          THREE POSITIVE CONTROLS — the instrument must NOT refuse:
//            6. a known-good colour pair scores at or above 4.5
//            7. the stamp read-back is a real DOM read, not a constant
//            8. a real run with ratios and no failures still passes
//
//          Rejections 3 and 4 are the ones worth watching: they print actual
//          FAIL rows into the transcript, so "seen to fail" is literal.

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
const SELFTEST = argv.includes("--selftest");
const ONLY_WIDTH = arg("width", "").split(",").filter(Boolean);
const REPO = process.cwd();
const SHOTS = path.join(REPO, "docs/screenshots/photo-bright-veil");
mkdirSync(SHOTS, { recursive: true });

const git = (...a) => {
  try {
    return execFileSync("git", a, { cwd: REPO, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};
const HEAD = git("rev-parse", "--short", "HEAD");
const DIRTY = git("diff", "HEAD", "--stat", "--", "components", "lib", "app");
console.log(
  `\nPRECONDITION  HEAD=${HEAD}  tree=${DIRTY ? "DIRTY (see below)" : "clean"}`,
);
if (DIRTY) console.log(DIRTY);

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

const rows = [];
const record = (v, name, detail = "", extra = {}) => {
  rows.push({ verdict: v, name, detail, ...extra });
  const tag = { PASS: "PASS ", FAIL: "FAIL ", ABSENT: "ABSNT" }[v];
  console.log(`  ${tag} ${name}${detail ? ` — ${detail}` : ""}`);
};

// Canvas-resolve, in-page. Two reads (over black, over white) recover alpha.
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
      const diff = [0, 1, 2].map((i) => onWhite[i] - onBlack[i]);
      const alpha = 1 - Math.max(0, Math.min(255, Math.max(...diff))) / 255;
      const rgb =
        alpha > 0.004
          ? onBlack.map((v) => Math.min(255, v / alpha))
          : [0, 0, 0];
      return { rgb, alpha };
    },
  });
};

/** Blank every glyph inside `el` without touching a single background. */
const HIDE_TEXT = (el) => {
  const touched = [];
  for (const n of [el, ...el.querySelectorAll("*")]) {
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
  };
}

/** Returns null-shaped ABSENT rather than a number whenever it cannot measure. */
async function measureText(page, sel, label) {
  const info = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    try {
      el.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "instant",
      });
    } catch {
      /* detached — the viewport clamp below still protects the clip */
    }
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) return { tooSmall: true };
    const cs = getComputedStyle(el);
    if (
      cs.visibility === "hidden" ||
      cs.display === "none" ||
      parseFloat(cs.opacity) < 0.05
    )
      return { hidden: true };
    const px = parseFloat(cs.fontSize);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = px >= 24 || (px >= 18.66 && weight >= 700);
    window.__measureTarget = el;
    return {
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      color: window.__resolveRGBA(cs.color),
      fontPx: px,
      weight,
      floor: large ? 3.0 : 4.5,
      text: (el.textContent ?? "").trim().slice(0, 40),
    };
  }, sel);
  if (!info || info.tooSmall || info.hidden) return { status: "absent", label };

  const vp = page.viewportSize() ?? { width: 1440, height: 900 };
  const x0 = Math.max(0, Math.min(vp.width - 1, info.rect.x + 1));
  const y0 = Math.max(0, Math.min(vp.height - 1, info.rect.y + 1));
  const x1 = Math.max(0, Math.min(vp.width, info.rect.x + info.rect.width - 1));
  const y1 = Math.max(
    0,
    Math.min(vp.height, info.rect.y + info.rect.height - 1),
  );
  const clip = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  if (clip.width < 2 || clip.height < 2) return { status: "absent", label };

  await page.evaluate(`(${HIDE_TEXT.toString()})(window.__measureTarget)`);
  let buf = null;
  try {
    buf = await page.screenshot({ clip, animations: "disabled" });
  } catch {
    return { status: "absent", label };
  } finally {
    await page.evaluate(() => window.__restoreText?.()).catch(() => {});
  }
  const bd = await backdropStats(buf).catch(() => null);
  if (!bd) return { status: "absent", label };

  const fg = over(info.color.rgb, info.color.alpha, bd.median);
  return {
    status: "ok",
    label,
    ratio: contrast(fg, bd.median),
    worst: Math.min(
      contrast(over(info.color.rgb, info.color.alpha, bd.p10), bd.p10),
      contrast(over(info.color.rgb, info.color.alpha, bd.p90), bd.p90),
    ),
    floor: info.floor,
    fontPx: info.fontPx,
    fg: fg.map(Math.round),
    bg: bd.median,
    text: info.text,
  };
}

// ── the surfaces with NO panel behind their text — the ones the veil is for ──
const SURFACES = [
  {
    id: "post",
    goto: "/post?lesson=m-11-1",
    root: "[data-sectags]",
    text: [
      ["section title", '[class*="Section_title__"]'],
      ["section count badge", '[class*="Section_count__"]'],
      ["tag chip label", '[data-sectags] [class*="Section_tagLabel__"]'],
    ],
  },
  {
    id: "boards",
    goto: "/boards",
    root: '[class*="BoardLibrary_root__"]',
    text: [
      ["board-cap meter label", '[class*="BoardLibrary_meterLabel__"]'],
      ["sidebar nav heading", '[class*="BoardLibrary_navHeading__"]'],
      ["Team/Mine segment", '[class*="BoardLibrary_segment__"]'],
    ],
  },
];

// All seven themes. `dim` is the axis under test; `tone` is what the ENGINE
// derives for that combination — and it depends on the glass register, so the
// table is built from deriveTone rather than hard-coded.
//
// lib/theme-values.ts deriveTone:175-180, in order:
//     night → dark  ·  glass=light → LIGHT  ·  wash → light
//     dim=dim → dark  ·  dim=bright → light  ·  else autoTone
//
// The `glass === "light"` arm fires BEFORE the dim checks, so on the white
// frosted register the tone is light at EVERY dim value. Stamping
// `{dim:"dim", tone:"dark"}` there would paint a combination the engine cannot
// produce and file the result as if a teacher could see it. This mirrors that
// precedence instead of assuming the dark register's answer.
const THEMES = ["clear", "off", "honey", "blossom", "mint", "sky", "night"];
const derivedTone = (theme, glass, dim) => {
  if (theme === "night") return "dark";
  if (glass === "light") return "light";
  if (dim === "dim") return "dark";
  if (dim === "bright") return "light";
  return null; // the auto path — not exercised here, never guessed at
};
const CASES = ["bright", "dim"].map((dim) => ({ dim }));

const VIEWPORTS = {
  375: {
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  768: {
    viewport: { width: 768, height: 1024 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  1440: { viewport: { width: 1440, height: 900 } },
};

// `--glass=light` seeds the WHITE-frosted register instead of the dark one.
// That register was entirely unmeasured until 2026-07-31: every earlier run of
// this probe and of probe-qa-tone-matrix.mjs seeded glass=dark, so the
// "Photo-Dim byte-identical" regression claim on 3121908 covered only half the
// axis. deriveTone:176 sends glass=light + photo to LIGHT tone at every dim
// value, so that register matches the new veil selector too.
// `--before` measures the PRE-FIX rendering without touching a single file.
// app/themes.css is on master (3121908), so the honest way to A/B it is to
// delete the new rule from the live stylesheet in-page and let the base
// `[data-frame="glass"][data-bg="photo"]` dark scrim apply again — which is
// exactly what shipped before the fix. Editing the committed file to measure it
// would put a sibling lane's dev server into a state nobody asked for.
const BEFORE = argv.includes("--before");
// `--gated-only` runs JUST the engine-derived case and skips the CSS-layer
// stamped loop. That case is the strongest evidence this probe produces — both
// halves seeded, the engine's own derivation, nothing stamped — so a fast
// verification pass wants exactly it and nothing else. It also makes the
// coverage arithmetic checkable by hand: intended collapses to
// widths × surfaces × elements.
const GATED_ONLY = argv.includes("--gated-only");
// `--subjcolor` seeds the wall's "Color sections by subject" switch ON.
// ─────────────────────────────────────────────────────────────────────────────
// That mode is a SECOND rendering of every section: ResourceWall.module.css's
// `.subjColor .sections > section` (0,2,1) outranks Section.module.css's
// `.sec:not(.hasBg)` panel (0,2,0), so with the switch on the section is painted
// by a different rule than the one #43 measured. A probe that only ever ran with
// the switch off therefore cannot see a regression in the mode a teacher may
// well be sitting in — which is exactly how the be181cc panel came to be
// silently defeated (task #54).
//
// The switch is CLIENT state: ResourceWall hydrates it from `cc_rw_subjcolor`
// in a post-mount effect (ResourceWall.tsx:492), so seeding localStorage before
// navigation is the whole mechanism. `subjColorGate` below then REQUIRES the
// resulting class, in both directions — see the note there.
const SUBJCOLOR = argv.includes("--subjcolor");
const SUBJCOLOR_CLASS = '[class*="ResourceWall_subjColor__"]';
const VEIL_SELECTOR =
  '[data-tone="light"][data-frame="glass"][data-bg="photo"] .stage::after';

/**
 * Delete the veil rule from the live CSSOM. Returns the number of rules
 * removed; the caller MUST treat 0 as a failure, because "I removed nothing"
 * and "I removed the rule" would otherwise produce identical-looking runs and
 * the before/after comparison would silently become after/after.
 */
// The PRE-FIX backdrop, restored by override rather than by deleting the veil
// rule.
// ─────────────────────────────────────────────────────────────────────────────
// The first --before implementation searched document.styleSheets for the veil
// selector and deleted it. It found nothing — and its guard correctly refused to
// measure rather than label an after/after run "before". The reason, from
// scripts/_diag-cssom.mjs: under Next dev, ZERO `.stage` selectors are
// enumerable through document.styleSheets (4 readable sheets, 0 blocked) even
// though the rules plainly apply. CSSOM enumeration is simply not a road into
// this app's styles.
//
// So `--before` now ADDS a rule instead of hunting for one. Pre-3121908 there
// was no `[data-tone="light"]` branch at all, so the only rule matching a
// light-tone photo stage was the base one at app/themes.css:288 — and its value
// is reproduced verbatim below. Confirmed live: on a page where the base rule
// wins, computed `.stage::after` backgroundImage is exactly
//   radial-gradient(120% 90% at 50% 8%, rgba(12, 16, 26, 0) 30%, rgba(12, 16, 26, 0.44) 100%),
//   linear-gradient(rgba(12, 16, 26, 0.12), rgba(12, 16, 26, 0.32))
//
// A hard-coded value could drift if that base rule is ever retuned, so the
// injection is READ BACK from the computed style and the caller fails the
// surface unless the override actually took.
const BASE_SCRIM =
  "radial-gradient(120% 90% at 50% 8%, rgba(12,16,26,0) 30%, rgba(12,16,26,0.44) 100%)," +
  "linear-gradient(180deg, rgba(12,16,26,0.12) 0%, rgba(12,16,26,0.32) 100%)";

const RESTORE_BASE_SCRIM = ([sel, scrim]) => {
  const style = document.createElement("style");
  style.id = "__probe_before__";
  style.textContent = `${sel}{background:${scrim} !important;}`;
  document.head.appendChild(style);
  const stage = document.querySelector(".stage");
  if (!stage) return { applied: false, why: "no .stage element" };
  const got = getComputedStyle(stage, "::after").backgroundImage;
  // The pre-fix scrim is dark; the veil is white/cream. Requiring the dark
  // literal proves the override won, not merely that a <style> was appended.
  return {
    applied: got.includes("rgba(12, 16, 26"),
    got: got.slice(0, 90),
  };
};

const GLASS = arg("glass", "dark");
if (GLASS !== "dark" && GLASS !== "light") {
  console.error(`--glass must be dark|light, got "${GLASS}"`);
  process.exit(1);
}
// `--dim=` seeds the GATED case, which is the strongest evidence this probe
// produces: both halves seeded, the engine's own derivation, no stamping. The
// stamped theme loop is a CSS-layer approximation; the gated case is the real
// thing, so the combination under investigation should BE the gated one.
const DIM = arg("dim", "bright");
if (!["dim", "normal", "bright"].includes(DIM)) {
  console.error(`--dim must be dim|normal|bright, got "${DIM}"`);
  process.exit(1);
}
const SEED = {
  frame: "glass",
  glass: GLASS,
  bg: "photo",
  theme: "clear",
  dim: DIM,
  subjcolor: SUBJCOLOR,
};
// The gate requires tone=light. `glass=dark` + `dim=dim` derives DARK, so that
// combination cannot be gated here and asking for it is an error, not a run.
if (GLASS === "dark" && DIM !== "bright") {
  console.error(
    `--glass=dark --dim=${DIM} derives tone=dark (deriveTone:178), which this ` +
      `probe's light-tone gate cannot accept. Use --glass=light for the dim/normal cases.`,
  );
  process.exit(1);
}
const cookieValue = (a) =>
  `v1.${a.frame}.${a.glass}.${a.bg}.${a.theme}.${a.dim}.vivid.highlight`;

async function makeContext(browser, viewport) {
  const ctx = await browser.newContext(viewport);
  ctx.setDefaultNavigationTimeout(180000);
  ctx.setDefaultTimeout(45000);
  // NO DATABASE WRITES — installed BEFORE auth.
  await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
  await ctx.addInitScript(RESOLVER);
  await ctx.addInitScript((ax) => {
    try {
      localStorage.setItem(
        "mycurricula:onboarding",
        JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
      );
      localStorage.setItem("mycurricula:user:theme-frame", ax.frame);
      localStorage.setItem("mycurricula:user:theme-glass", ax.glass);
      localStorage.setItem("mycurricula:user:theme-bg", ax.bg);
      localStorage.setItem("mycurricula:user:theme", ax.theme);
      localStorage.setItem("mycurricula:user:theme-dim", ax.dim);
      // The wall's subject-colour switch. Written in BOTH directions on purpose:
      // an explicit "0" means a stale value left by another probe or a manual
      // session cannot silently put a default run into subject-colour mode and
      // have it reported as the default rendering.
      localStorage.setItem("cc_rw_subjcolor", ax.subjcolor ? "1" : "0");
    } catch {
      /* storage disabled — the read-back below turns this into ABSENT */
    }
  }, SEED);
  await ctx.addCookies([
    { name: "mc-theme-axes", value: cookieValue(SEED), url: BASE },
  ]);
  await bypassLogin(ctx, {
    base: BASE,
    next: "/weekly",
    retries: 2,
    timeout: 180000,
  });
  return ctx;
}

/**
 * Stamp the axis attributes on <html> and VERIFY the read-back. Returns false
 * when the DOM does not hold the values, so a React effect racing the flip
 * produces ABSENT rather than a measurement filed under the wrong label.
 */
async function stamp(page, theme, dim, tone) {
  const got = await page.evaluate(
    ([t, d, tn]) => {
      const r = document.documentElement;
      r.setAttribute("data-theme", t);
      r.setAttribute("data-dim", d);
      r.setAttribute("data-tone", tn);
      return {
        theme: r.getAttribute("data-theme"),
        dim: r.getAttribute("data-dim"),
        tone: r.getAttribute("data-tone"),
        bg: r.getAttribute("data-bg"),
        frame: r.getAttribute("data-frame"),
        // data-glass is READ but never written here — the stamp only moves
        // theme/dim/tone. It has to come back in the payload all the same, or
        // the `got.glass === SEED.glass` check below compares against
        // `undefined` and every case fails. (It did: 31/31 on the first
        // --glass=light run. Loudly, and in the safe direction, which is the
        // only reason it took minutes rather than shipping.)
        glass: r.getAttribute("data-glass"),
      };
    },
    [theme, dim, tone],
  );
  // EVERY axis the selector under test reads, not just the ones being stamped.
  // The rule is `[data-tone="light"][data-frame="glass"][data-bg="photo"]`, and
  // data-glass picks the register — so a run that silently rendered Paper, or
  // the wrong frosted register, would exercise a surface the fix does not touch
  // and still report a pass. §4a finding #1 on 3121908.
  const ok =
    got.theme === theme &&
    got.dim === dim &&
    got.tone === tone &&
    got.bg === "photo" &&
    got.frame === "glass" &&
    got.glass === SEED.glass;
  return ok ? got : null;
}

/**
 * Read the axes the ENGINE derived, before this probe stamps anything, and
 * require every one the selector depends on. Returns null on any mismatch —
 * callers must ABANDON the surface, not fall through to the stamped loop,
 * because frame and glass come from the seed and a broken seed invalidates
 * every case that follows.
 */
async function nativeGate(page, w, id) {
  const got = await page.evaluate(() => {
    const r = document.documentElement;
    return {
      tone: r.getAttribute("data-tone"),
      bg: r.getAttribute("data-bg"),
      dim: r.getAttribute("data-dim"),
      frame: r.getAttribute("data-frame"),
      glass: r.getAttribute("data-glass"),
      theme: r.getAttribute("data-theme"),
    };
  });
  const want = {
    tone: "light",
    bg: "photo",
    dim: SEED.dim,
    frame: SEED.frame,
    glass: SEED.glass,
    theme: SEED.theme,
  };
  const wrong = Object.entries(want).filter(([k, v]) => got[k] !== v);
  record(
    wrong.length ? "FAIL" : "PASS",
    `${w}/${id} — [gate] engine derived every selector axis`,
    wrong.length
      ? `MISMATCH ${wrong.map(([k, v]) => `${k}: want ${v}, got ${got[k]}`).join(" · ")}`
      : `tone=${got.tone} frame=${got.frame} glass=${got.glass} bg=${got.bg} dim=${got.dim} theme=${got.theme}`,
  );
  return wrong.length ? null : got;
}

/**
 * THE WALL-MODE GATE. Requires the subject-colour switch to be in the state the
 * run says it is in, and returns false on ANY mismatch so the caller abandons
 * the surface.
 *
 * Both directions are checked, and that symmetry is the point. Requiring the
 * class only when `--subjcolor` was passed would leave the DEFAULT run unguarded
 * — a stale `cc_rw_subjcolor` from an earlier session would silently render
 * every "default" case in subject-colour mode and file the numbers under the
 * wrong rendering. That is the same shape as the cookie-only theme seed this
 * repo has already shipped once: a probe measuring one state and labelling it
 * another. Only /post has a wall, so other surfaces are not gated here.
 */
async function subjColorGate(page, w, id) {
  // WAIT for the mode, do not sample it.
  // ───────────────────────────────────────────────────────────────────────────
  // ResourceWall hydrates this switch from localStorage in a post-mount effect
  // (ResourceWall.tsx:490-493), and that effect lands LATE — traced at ~140 s on
  // this machine under normal multi-lane dev load, well after `[data-sectags]`
  // is on screen. A single read after the surface gate therefore catches the
  // pre-hydration render about as often as not: the first --subjcolor run here
  // reported the wall OFF while `cc_rw_subjcolor` was provably "1" and the class
  // arrived moments later. The gate was right to refuse — sampling was wrong.
  //
  // Note the asymmetry, because it is real and should not be dressed up: the ON
  // wait is strong (it cannot pass until the class actually exists), while the
  // OFF wait is satisfied immediately. OFF is safe only because makeContext
  // writes "0" EXPLICITLY, so the late effect can resolve to false and nothing
  // else can ever turn it on mid-run. If that write is ever removed, this gate
  // stops protecting the default direction.
  try {
    await page.waitForFunction(
      ([sel, want]) => !!document.querySelector(sel) === want,
      [SUBJCOLOR_CLASS, SUBJCOLOR],
      { timeout: 120000, polling: 500 },
    );
  } catch {
    /* fall through — the read-back below reports what it actually is */
  }
  const on = await page.evaluate(
    (sel) => !!document.querySelector(sel),
    SUBJCOLOR_CLASS,
  );
  const ok = on === SUBJCOLOR;
  record(
    ok ? "PASS" : "FAIL",
    `${w}/${id} — [gate] wall subject-colour mode = ${SUBJCOLOR ? "ON" : "OFF"}`,
    ok
      ? `${SUBJCOLOR_CLASS} ${on ? "present" : "absent"} as expected`
      : `MISMATCH seeded ${SUBJCOLOR ? "ON" : "OFF"} but the wall rendered ${on ? "ON" : "OFF"} — ` +
          `every section would be painted by the other rule and filed under this one`,
  );
  return ok;
}

async function run() {
  // DECLARE THE INTENDED MATRIX BEFORE MEASURING ANYTHING.
  // One gated case per surface (the engine's own derivation) plus every stamped
  // theme×dim the engine can actually produce, times the elements on each
  // surface, times the widths in play. Derived from the same tables the loops
  // below iterate, so the two cannot drift apart.
  const widths = Object.keys(VIEWPORTS).filter(
    (w) => !ONLY_WIDTH.length || ONLY_WIDTH.includes(w),
  );
  const stampedCases = GATED_ONLY
    ? 0
    : THEMES.flatMap((t) =>
        CASES.map((c) => derivedTone(t, SEED.glass, c.dim)),
      ).filter(Boolean).length;
  const intended =
    widths.length *
    SURFACES.reduce((k, s) => k + (1 + stampedCases) * s.text.length, 0);
  console.log(
    `\nINTENDED COVERAGE: ${intended} ratios ` +
      `(${widths.length} width(s) × ${SURFACES.length} surface(s) × ` +
      `[1 gated + ${stampedCases} stamped] cases × elements)` +
      `\nWALL MODE: subject-colour ${SUBJCOLOR ? "ON (--subjcolor)" : "OFF (default)"}` +
      ` — /post sections are painted by ${
        SUBJCOLOR
          ? "ResourceWall.module.css `.subjColor .sections > section` (0,2,1)"
          : "Section.module.css `.sec:not(.hasBg)` (0,2,0)"
      }`,
  );

  const browser = await chromium.launch({ channel: "chrome" });
  const measured = [];
  for (const [w, vp] of Object.entries(VIEWPORTS)) {
    if (ONLY_WIDTH.length && !ONLY_WIDTH.includes(w)) continue;
    console.log(`\n══ width ${w} ══`);
    let ctx;
    try {
      ctx = await makeContext(browser, vp);
    } catch (e) {
      record(
        "ABSENT",
        `${w} — context/auth`,
        redact(String(e.message).split("\n")[0]),
      );
      continue;
    }
    const page = await ctx.newPage();
    for (const s of SURFACES) {
      try {
        await page.goto(`${BASE}${s.goto}`, {
          waitUntil: "domcontentloaded",
          timeout: 180000,
        });
      } catch (e) {
        record(
          "ABSENT",
          `${w}/${s.id} — navigation`,
          redact(String(e.message).split("\n")[0]),
        );
        continue;
      }
      // Hydration gate: React 19 stamps __reactFiber$ on host nodes only once
      // the client renderer attaches, so its absence is proof, not inference.
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
        await page.waitForSelector(s.root, { timeout: 120000 });
      } catch {
        // NOT "absent" — a required surface that never rendered is a failed
        // run. This used to record ABSENT and exit 0, so a dead server, a
        // broken auth hop or a renamed root selector produced a green probe.
        record(
          "FAIL",
          `${w}/${s.id} — surface never rendered`,
          "hydration or root selector timed out — REQUIRED surface",
        );
        continue;
      }
      // ── THE GATE ─────────────────────────────────────────────────────────
      // The context seeded the axes through BOTH halves, so before any
      // stamping the page shows the state the ENGINE derived for itself. Read
      // it and require every axis the selector depends on. deriveTone does not
      // consult the viewport, so proving the derivation here at 375/768 is
      // proof for those widths, not an extrapolation from 1440.
      //
      // On mismatch we ABANDON the surface entirely rather than continuing to
      // the stamped loop below: frame and glass come from the seed, so a seed
      // that produced Paper (which also derives tone=light) would let every
      // stamped case "pass" while never touching the glass+photo selector.
      const native = await nativeGate(page, w, s.id);
      if (!native) continue;
      // Only the wall has a subject-colour switch; /boards has no such mode.
      if (s.id === "post" && !(await subjColorGate(page, w, s.id))) continue;

      // --before: strip the veil rule so the base dark scrim applies again.
      // A removal count of 0 means the rule was never found, which would turn
      // this into an after/after comparison presented as before/after — so it
      // fails the surface rather than measuring it.
      if (BEFORE) {
        // The selector crosses as DATA and the logic is a real function, never
        // a stringified body handed to `new Function`. measureText carries the
        // same note: a code-injection shape has no business in a QA harness
        // even when the only input is the probe's own literal.
        const restore = await page.evaluate(RESTORE_BASE_SCRIM, [
          VEIL_SELECTOR,
          BASE_SCRIM,
        ]);
        record(
          restore.applied ? "PASS" : "FAIL",
          `${w}/${s.id} — [--before] pre-fix dark scrim restored over the veil`,
          restore.applied
            ? `computed .stage::after is the base scrim again — ${restore.got}`
            : `OVERRIDE DID NOT TAKE — this would have measured the AFTER state and labelled it BEFORE. computed: ${restore.got ?? restore.why}`,
        );
        if (!restore.applied) continue;
        await page.waitForTimeout(220);
      }
      {
        for (const [label, sel] of s.text) {
          const m = await measureText(page, sel, label);
          if (m.status !== "ok") {
            // ABSENT, not FAIL. A missing element means the INSTRUMENT could
            // not see — it is not a claim that the app's contrast is wrong.
            // Routing it to FAIL put blindness and breakage on the same exit
            // code, which is the distinction exit 2 exists to preserve. It is
            // still loud, still counted in the coverage shortfall, and still
            // ends the run non-zero.
            record(
              "ABSENT",
              `${w}/${s.id}/GATED ${SEED.theme}-${SEED.dim} — ${label}`,
              "REQUIRED element did not render — no ratio was computed",
            );
            continue;
          }
          measured.push({
            width: w,
            surface: s.id,
            theme: SEED.theme,
            dim: SEED.dim,
            glass: SEED.glass,
            subjcolor: SUBJCOLOR,
            tone: "light",
            gated: true,
            ...m,
          });
          record(
            m.worst >= m.floor ? "PASS" : "FAIL",
            `${w}/${s.id}/GATED ${SEED.theme}-${SEED.dim}(light,glass-${SEED.glass}) — ${label} (floor ${m.floor})`,
            `${m.ratio.toFixed(2)}:1 (worst ${m.worst.toFixed(2)}:1) ${m.fontPx}px fg=${m.fg} bg=${m.bg}`,
          );
        }
        // Shoot HERE, while the page still holds the engine-derived
        // clear/photo/bright state. The first draft took this screenshot after
        // the theme loop below, so the file named `…-clear-bright.png` actually
        // captured the LAST value stamped in that loop — night/dim, a dark
        // page filed under a light-tone name. Caught by opening the artifact
        // instead of trusting the filename; a mislabelled piece of evidence is
        // worse than none, because the next reader has no reason to doubt it.
        await page
          .screenshot({
            path: path.join(
              SHOTS,
              // The mode is in the FILENAME, not only in the log: the two wall
              // renderings are different pictures of the same surface, and
              // without it the second run silently overwrites the first's
              // evidence with an image that looks plausible either way.
              `${s.id}-${w}-glass-${SEED.glass}-${SEED.theme}-${SEED.dim}` +
                `${s.id === "post" && SUBJCOLOR ? "-subjcolor" : ""}${BEFORE ? "-BEFORE" : ""}.png`,
            ),
          })
          .catch(() => {});
      }

      for (const theme of GATED_ONLY ? [] : THEMES) {
        for (const c of CASES) {
          // Ask the derivation what tone this combination actually produces,
          // rather than asserting one. Night forces dark; the light glass
          // register forces light at every dim. A combination the engine
          // cannot reach is SKIPPED, never stamped — painting an impossible
          // state and filing its contrast would be inventing a teacher's view.
          const tone = derivedTone(theme, SEED.glass, c.dim);
          if (!tone) continue;
          const got = await stamp(page, theme, c.dim, tone);
          if (!got) {
            // A stamp that did not hold means the case was never rendered.
            // FAIL, not ABSENT: silently skipping it removed the case from the
            // denominator, so a stamp that stopped working entirely would have
            // shrunk the run to nothing and still exited 0.
            record(
              "FAIL",
              `${w}/${s.id}/${theme}/${c.dim} — attribute stamp`,
              "read-back did not hold — case NOT measured",
            );
            continue;
          }
          await page.waitForTimeout(220); // let the stage repaint
          for (const [label, sel] of s.text) {
            const m = await measureText(page, sel, label);
            const tag =
              `${w}/${s.id}/${theme}-${c.dim}(${tone},glass-${SEED.glass}` +
              `${s.id === "post" ? `,subjcolor-${SUBJCOLOR ? "on" : "off"}` : ""})`;
            if (m.status !== "ok") {
              // ABSENT, not FAIL — see the note in the gated block above.
              record(
                "ABSENT",
                `${tag} — ${label}`,
                "REQUIRED element did not render — no ratio was computed",
              );
              continue;
            }
            measured.push({
              width: w,
              surface: s.id,
              theme,
              dim: c.dim,
              tone,
              glass: SEED.glass,
              subjcolor: SUBJCOLOR,
              ...m,
            });
            record(
              m.worst >= m.floor ? "PASS" : "FAIL",
              `${tag} — ${label} (floor ${m.floor})`,
              `${m.ratio.toFixed(2)}:1 (worst ${m.worst.toFixed(2)}:1) ${m.fontPx}px fg=${m.fg} bg=${m.bg}`,
            );
          }
        }
      }
      // The clear-bright screenshot is taken ABOVE, before the stamping loop —
      // see the note there. Nothing is shot here: at this point <html> carries
      // whatever the loop stamped last, which is not a state worth filing.
    }
    await ctx.close();
  }
  await browser.close();
  writeFileSync(
    path.join(SHOTS, "results.json"),
    JSON.stringify(
      { head: HEAD, dirty: !!DIRTY, base: BASE, rows, measured },
      null,
      2,
    ),
  );
  const n = (v) => rows.filter((r) => r.verdict === v).length;
  console.log(
    `\n── ${n("PASS")} PASS · ${n("FAIL")} FAIL · ${n("ABSENT")} ABSENT ──`,
  );
  // COVERAGE RECONCILIATION — declared up front, checked at the end.
  //
  // A bare failure count cannot see a run that quietly NARROWED ITS OWN SCOPE.
  // That is not hypothetical: a one-line slip in the stamp read-back turned 31
  // cases into "not measured", and a probe that only counted failures would
  // have called the survivors a clean run. So the intended number of ratios is
  // computed from the loops BEFORE they execute, and the actual is reconciled
  // against it here.
  const shortfall = intended - measured.length;
  console.log(
    `   coverage: intended ${intended} · scored ${measured.length} · unmeasured ${Math.max(0, shortfall)}`,
  );
  console.log(`   evidence: ${SHOTS}`);

  // THREE EXIT CODES, because "the app is broken" and "the instrument is blind"
  // are different facts and must not share a signal.
  //
  //   0  fully verified, nothing failing
  //   1  real contrast failures        — the APP is broken
  //   2  incomplete coverage           — the INSTRUMENT is blind
  //
  // Why not fold 2 into 0: a run where 30 of 31 cases never measured and one
  // passed would read green while being effectively blind, and `&&` chains and
  // CI only read the number. Why not fold it into 1: a tool that cries wolf
  // costs more than the bug it hunts, and collapsing "blind" into "unreadable
  // surface" trains everyone to ignore red. A distinct non-zero code satisfies
  // both — every caller still treats it as failure, while a human can tell the
  // two apart at a glance.
  //
  // Precedence: real failures outrank incomplete coverage. If the run both
  // failed and was partly blind, exit 1 — a measured failure is the more
  // actionable fact, and the coverage line above still reports the shortfall.
  if (n("FAIL") > 0) {
    console.log(
      `\nFAILED (exit 1) — ${n("FAIL")} contrast assertion(s) did not pass.`,
    );
    process.exit(1);
  }
  if (measured.length === 0) {
    console.log(
      `\nINCOMPLETE (exit 2) — no contrast ratios were computed at all. The probe never measured the app; ${intended} were intended.`,
    );
    process.exit(2);
  }
  if (shortfall > 0 || n("ABSENT") > 0) {
    console.log(
      `\nINCOMPLETE (exit 2) — ${shortfall} of ${intended} intended ratios were never scored. This run did NOT earn a pass.`,
    );
    process.exit(2);
  }
  console.log(
    `\nOK (exit 0) — all ${intended} intended ratios scored, none failing.`,
  );
  process.exit(0);
}

// ── selftest — the instrument must be SEEN to fail before any pass is trusted ─
async function selftest() {
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await makeContext(browser, VIEWPORTS[1440]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/boards`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body", { timeout: 30000 });

  // 1 · a missing element must return ABSENT, never a ratio.
  const miss = await measureText(page, "#definitely-not-here", "control");
  console.log(
    `  ${miss.status === "absent" ? "ok  " : "FAIL"} missing element → ABSENT, not a ratio`,
  );

  // 2 · the maths must reject a backdrop it should reject. This is the check
  //     that matters: a contrast function that cannot return a failing number
  //     makes every PASS above meaningless.
  const bad = contrast([87, 86, 107], [88, 63, 41]); // the real /boards failure
  const good = contrast([87, 86, 107], [246, 244, 240]);
  console.log(
    `  ${bad < 4.5 ? "ok  " : "FAIL"} known-bad pair scores ${bad.toFixed(2)}:1 (< 4.5)`,
  );
  console.log(
    `  ${good >= 4.5 ? "ok  " : "FAIL"} known-good pair scores ${good.toFixed(2)}:1 (>= 4.5)`,
  );

  // 3 · the attribute stamp must refuse a value it did not actually set.
  const refused = await page.evaluate(() => {
    const r = document.documentElement;
    r.setAttribute("data-tone", "light");
    return r.getAttribute("data-tone");
  });
  const stampReal = refused === "light";
  console.log(
    `  ${stampReal ? "ok  " : "FAIL"} stamp read-back is a real DOM read (${refused})`,
  );

  // 4 · THE AXIS GATE MUST REJECT A NON-GLASS FRAME. This is §4a finding #1
  //     made falsifiable: Paper also derives tone=light, so a gate that only
  //     looked at tone/bg/dim would wave through a page that never exercises
  //     the glass+photo selector. Force data-frame="paper" and require the
  //     gate to return null.
  const before = rows.length;
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-frame", "paper");
    document.documentElement.setAttribute("data-tone", "light");
    document.documentElement.setAttribute("data-bg", "photo");
    document.documentElement.setAttribute("data-dim", "bright");
  });
  const paperGate = await nativeGate(page, "selftest", "paper-frame");
  const rejectsPaper = paperGate === null && rows[before]?.verdict === "FAIL";
  console.log(
    `  ${rejectsPaper ? "ok  " : "FAIL"} axis gate REJECTS a Paper frame that still derives tone=light`,
  );

  // 5 · and it must reject the WRONG FROSTED REGISTER for the same reason —
  //     data-glass selects which register renders, and the seed can migrate.
  const before2 = rows.length;
  await page.evaluate(
    (wrong) => {
      document.documentElement.setAttribute("data-frame", "glass");
      document.documentElement.setAttribute("data-glass", wrong);
    },
    SEED.glass === "dark" ? "light" : "dark",
  );
  const glassGate = await nativeGate(page, "selftest", "wrong-glass-register");
  const rejectsGlass = glassGate === null && rows[before2]?.verdict === "FAIL";
  console.log(
    `  ${rejectsGlass ? "ok  " : "FAIL"} axis gate REJECTS the wrong data-glass register`,
  );

  // 6 · the emptiness arm: a run that computed no ratios must be a failure.
  //     Asserted on the same expression main() exits with, so the two cannot
  //     drift apart.
  const emptyIsFailure = (fail, absent, ratios) =>
    fail > 0 || absent > 0 || ratios === 0;
  const emptyFails = emptyIsFailure(0, 0, 0) === true;
  const cleanPasses = emptyIsFailure(0, 0, 12) === false;
  console.log(
    `  ${emptyFails ? "ok  " : "FAIL"} zero ratios computed → FAILURE, not a clean 0/0`,
  );
  console.log(
    `  ${cleanPasses ? "ok  " : "FAIL"} a real run with ratios and no failures still passes`,
  );

  await ctx.close();
  await browser.close();
  const allOk =
    miss.status === "absent" &&
    bad < 4.5 &&
    good >= 4.5 &&
    stampReal &&
    rejectsPaper &&
    rejectsGlass &&
    emptyFails &&
    cleanPasses;
  console.log(
    allOk
      ? "\n  selftest PASSED — every gate was seen to reject something."
      : "\n  selftest FAILED — a gate did not reject what it must.",
  );
  process.exit(allOk ? 0 : 1);
}

if (SELFTEST) await selftest();
else await run();
