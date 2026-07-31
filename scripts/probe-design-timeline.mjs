// probe-design-timeline.mjs — DESIGN evidence for the Plan-timeline redesign.
// REPORT ONLY. Renders /planner at 375 / 768 / 1440 in Wash (light) and Night
// (dark) and measures the things a look-and-feel proposal has to argue from:
// how deep the chrome is before the first lane, how the toolbar wraps, how much
// vertical space a lane costs, how wide the sticky label gutter is, and how the
// axis header reads.
//
// GATES, because this repo's dev hydration has been measured at 63s (React
// fiber) / 119s ([data-mounted]) under multi-lane load, and an early flat wait
// has twice produced a false "X does nothing" finding:
//   1. wait for a lane to exist at all      (the surface rendered)
//   2. wait for [data-mounted]              (post-mount effects ran)
//   3. assert positive controls IN THE SAME evaluation as every measurement
//      (lanes > 0, band labels with non-empty text) — an absence claim whose
//      control failed is a failed control, not a finding.
//
// Tone is seeded BOTH halves (the mc-theme-axes cookie drives SSR, the
// localStorage keys drive the client store after hydration) and then the
// RESOLVED data-tone is read back off <html>; a case whose resolved tone does
// not match the label is recorded as GATE-FAIL, never as a measurement.
//
// DB safety: every /rest/v1/teacher_preferences* request is aborted, because
// .env.local points theme-sync at the PRODUCTION Supabase project and seeding
// axes would otherwise write a real teacher's preferences row.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const OUT = "docs/screenshots/design-timeline";
mkdirSync(OUT, { recursive: true });
const results = [];
const log = (k, v) => {
  console.log(`[${k}] ${JSON.stringify(v)}`);
  results.push({ k, v });
};

const AXES = {
  wash: { frame: "glass", glass: "dark", bg: "wash", theme: "clear", dim: "normal", tone: "light" },
  night: { frame: "glass", glass: "dark", bg: "photo", theme: "night", dim: "normal", tone: "dark" },
};

const TIERS = [
  { name: "desktop", w: 1440, h: 900, mobile: false, dsf: 1 },
  { name: "tablet", w: 768, h: 1024, mobile: true, dsf: 2 },
  { name: "phone", w: 375, h: 812, mobile: true, dsf: 3 },
];

const browser = await chromium.launch({ channel: "chrome" });

for (const [axisName, ax] of Object.entries(AXES)) {
  for (const tier of TIERS) {
    const label = `${tier.name}-${axisName}`;
    const ctx = await browser.newContext({
      viewport: { width: tier.w, height: tier.h },
      isMobile: tier.mobile,
      hasTouch: tier.mobile,
      deviceScaleFactor: tier.dsf,
    });
    // DB safety guard — before anything navigates.
    await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());

    // The cookie is the codec's DOT-PACKED form, not JSON:
    //   v1.<frame>.<glass>.<bg>.<theme>.<dim>.<style>.<palette>
    // (lib/theme-values.ts:191-245). Field order is a contract; "normal" is a
    // legal value in BOTH the dim and palette slots, so an order drift
    // validates into the wrong axis silently.
    await ctx.addCookies([
      {
        name: "mc-theme-axes",
        value: ["v1", ax.frame, ax.glass, ax.bg, ax.theme, ax.dim, "calm", "normal"].join("."),
        url: BASE,
      },
    ]);
    await bypassLogin(ctx, { base: BASE, next: "/planner", retries: 2, timeout: 120000 });
    const page = await ctx.newPage();
    // Seed the client store's half too, before any app script runs.
    // localStorage is the CLIENT source of truth and re-derives every axis after
    // hydration, so seeding the cookie alone renders one tone twice and reports
    // it as two-tone coverage. Values are stored as RAW STRINGS, not JSON —
    // `readValidated` guards the raw value directly (lib/theme.tsx:255-267), so
    // a JSON.stringify'd '"night"' fails the guard and silently falls back.
    await page.addInitScript((a) => {
      const keys = {
        "mycurricula:user:theme": a.theme,
        "mycurricula:user:theme-frame": a.frame,
        "mycurricula:user:theme-glass": a.glass,
        "mycurricula:user:theme-bg": a.bg,
        "mycurricula:user:theme-dim": a.dim,
      };
      for (const [k, v] of Object.entries(keys)) {
        try {
          window.localStorage.setItem(k, v);
        } catch {
          /* private mode — the cookie half still applies */
        }
      }
    }, ax);

    let gate = { laneSeen: false, mountSeen: false };
    try {
      await page.goto(`${BASE}/planner`, { waitUntil: "domcontentloaded", timeout: 120000 });
      gate.laneSeen = await page
        .waitForSelector("[data-lane-subject]", { timeout: 240000 })
        .then(() => true)
        .catch(() => false);
      gate.mountSeen = await page
        .waitForSelector("[data-mounted]", { timeout: 240000 })
        .then(() => true)
        .catch(() => false);
    } catch (e) {
      log(`${label} NAV-FAIL`, { error: String(e).slice(0, 200) });
      await ctx.close();
      continue;
    }
    await page.waitForTimeout(2000);

    // ---- tone gate: read the RESOLVED tone, do not trust the seed ----
    const resolved = await page.evaluate(() => {
      const h = document.documentElement;
      return {
        tone: h.getAttribute("data-tone"),
        theme: h.getAttribute("data-theme"),
        bg: h.getAttribute("data-bg"),
        dim: h.getAttribute("data-dim"),
        frame: h.getAttribute("data-frame"),
      };
    });
    if (resolved.tone !== ax.tone) {
      log(`${label} GATE-FAIL tone`, { wanted: ax.tone, ...resolved, ...gate });
      await page.screenshot({ path: `${OUT}/${label}-GATEFAIL.png` });
      await ctx.close();
      continue;
    }

    const m = await page.evaluate(() => {
      const px = (n) => (n === null || n === undefined ? null : +Number(n).toFixed(1));
      const q = (s) => document.querySelector(s);
      const qa = (s) => Array.from(document.querySelectorAll(s));
      const box = (el) => (el ? el.getBoundingClientRect() : null);

      const lanes = qa("[data-lane-subject]");
      const bandEls = qa("[class*='timeline_band__']");
      const bandNames = bandEls
        .map((b) => (b.textContent || "").trim())
        .filter((t) => t.length > 0);
      const dots = qa("[class*='timeline_dot__']");

      // --- chrome depth: how far down the page is the first lane? ---
      const firstLane = lanes[0];
      const laneTop = firstLane ? box(firstLane).top : null;

      // --- the toolbar: how many visual rows does it occupy? ---
      const card = q("[class*='timeline_card__']");
      const toolbar =
        q("[class*='timeline_toolbar__']") ?? q("[class*='timeline_controls__']");
      const toolbarBox = box(toolbar);
      // group controls by rounded top to count wrapped rows
      const ctrlTops = toolbar
        ? Array.from(
            new Set(
              Array.from(toolbar.querySelectorAll("button,input,label,[role='radiogroup']"))
                .filter((e) => e.getBoundingClientRect().width > 0)
                .map((e) => Math.round(e.getBoundingClientRect().top / 6) * 6),
            ),
          ).sort((a, b) => a - b)
        : [];

      const cs = card ? getComputedStyle(card) : null;
      const laneRow = q("[class*='timeline_lane__']") ?? firstLane;
      const labelCell =
        q("[class*='timeline_laneLabel__']") ?? q("[class*='timeline_laneName__']");
      const axisHdr = q("[class*='timeline_axis__']") ?? q("[class*='timeline_head__']");
      const dayWkd = q("[class*='timeline_dayWkd__']");
      const dayNum = q("[class*='timeline_dayNum__']");
      const mon = q("[class*='timeline_month__']");
      const drawerToggle = qa("button").find((b) => /library/i.test(b.textContent || ""));
      const zoom = q("#tl-zoom");

      const styleOf = (el, props) => {
        if (!el) return null;
        const s = getComputedStyle(el);
        const o = {};
        for (const p of props) o[p] = s.getPropertyValue(p).trim();
        return o;
      };

      return {
        // ---- POSITIVE CONTROLS (asserted in the SAME evaluation) ----
        _ctlLanes: lanes.length,
        _ctlBandLabelsWithText: bandNames.length,
        _ctlDots: dots.length,
        _ctlSampleBandName: bandNames[0] ?? null,

        chromeDepthToFirstLane: px(laneTop),
        viewportH: window.innerHeight,
        chromeDepthPctOfViewport: laneTop ? +((laneTop / window.innerHeight) * 100).toFixed(1) : null,

        toolbarHeight: px(toolbarBox?.height),
        toolbarWrappedRows: ctrlTops.length,
        toolbarRowTops: ctrlTops,

        laneRowHeight: px(box(laneRow)?.height),
        laneCount: lanes.length,
        totalLaneStackHeight: px(
          lanes.length
            ? box(lanes[lanes.length - 1]).bottom - box(lanes[0]).top
            : null,
        ),
        labelGutterWidth: px(box(labelCell)?.width),
        labelGutterText: labelCell ? (labelCell.textContent || "").trim().slice(0, 40) : null,

        bandHeight: px(box(bandEls[0])?.height),
        bandWidthFirst: px(box(bandEls[0])?.width),
        bandCount: bandEls.length,
        bandsWiderThanTrack: (() => {
          const track = q("[class*='timeline_track__']") ?? q("[class*='timeline_canvas__']");
          const tw = box(track)?.width ?? 0;
          return bandEls.filter((b) => box(b).width > tw).length;
        })(),
        dotSize: px(box(dots[0])?.width),
        dotsWithText: dots.filter((d) => (d.textContent || "").trim().length > 0).length,

        // ---- THE LESSON DOT, in detail (310 of these render; it is the most
        // repeated mark on the surface, so its cost is multiplied) ----
        dot: (() => {
          const d = dots[0];
          if (!d) return null;
          const s = getComputedStyle(d);
          const before = getComputedStyle(d, "::before");
          const b = box(d);
          return {
            hitBox: { w: px(b.width), h: px(b.height) },
            // the VISIBLE mark is usually ::before, not the button box
            visible: {
              w: before.width,
              h: before.height,
              borderRadius: before.borderRadius,
              borderWidth: before.borderWidth,
              borderColor: before.borderColor,
              background: before.backgroundColor,
              boxShadow: before.boxShadow,
            },
            buttonBox: {
              background: s.backgroundColor,
              border: s.borderWidth,
              borderRadius: s.borderRadius,
              padding: s.padding,
            },
            ariaLabel: d.getAttribute("aria-label"),
            title: d.getAttribute("title"),
            dataAttrs: Object.fromEntries(
              Array.from(d.attributes)
                .filter((a) => a.name.startsWith("data-"))
                .map((a) => [a.name, a.value]),
            ),
          };
        })(),
        // how much of the hit target is empty space around the visible mark
        dotVisibleVsHit: (() => {
          const d = dots[0];
          if (!d) return null;
          const before = getComputedStyle(d, "::before");
          const vis = parseFloat(before.width);
          const hit = box(d).width;
          return Number.isFinite(vis) && hit
            ? { visiblePx: px(vis), hitPx: px(hit), ratio: +(vis / hit).toFixed(2) }
            : null;
        })(),
        // status distribution — is every lesson marked, or only some?
        dotStatusCounts: (() => {
          const counts = {};
          for (const d of dots) {
            const k =
              d.getAttribute("data-state") ??
              d.getAttribute("data-status") ??
              Array.from(d.classList)
                .filter((c) => !c.includes("timeline_dot__"))
                .join(".") ??
              "?";
            counts[k] = (counts[k] || 0) + 1;
          }
          return counts;
        })(),
        // how densely do dots pack? nearest-neighbour gap along a lane
        dotNeighbourGaps: (() => {
          const lane = lanes[0];
          if (!lane) return null;
          const ds = Array.from(lane.querySelectorAll("[class*='timeline_dot__']"))
            .map((d) => box(d))
            .sort((a, b) => a.left - b.left);
          const gaps = [];
          for (let i = 1; i < ds.length; i++) gaps.push(+(ds[i].left - ds[i - 1].right).toFixed(1));
          gaps.sort((a, b) => a - b);
          return ds.length > 1
            ? { n: ds.length, min: gaps[0], median: gaps[Math.floor(gaps.length / 2)], max: gaps[gaps.length - 1] }
            : { n: ds.length };
        })(),
        // overlap: do dot hit targets overlap each other at this zoom?
        dotOverlapCount: (() => {
          const lane = lanes[0];
          if (!lane) return null;
          const ds = Array.from(lane.querySelectorAll("[class*='timeline_dot__']"))
            .map((d) => box(d))
            .sort((a, b) => a.left - b.left);
          let n = 0;
          for (let i = 1; i < ds.length; i++) if (ds[i].left < ds[i - 1].right) n++;
          return n;
        })(),
        // THE COLLISION: does the band's resize grip cover the band's last dot?
        gripVsLastDot: (() => {
          const wraps = qa("[class*='timeline_bandWrap__']");
          const out = [];
          for (const w of wraps.slice(0, 20)) {
            const grip = w.querySelector("[class*='timeline_bandGrip__']");
            const band = w.querySelector("[class*='timeline_band__']");
            if (!grip || !band) continue;
            const gb = box(grip);
            const bandBox = box(band);
            // dots that sit within the band's x-range, take the rightmost
            const inBand = dots
              .map((d) => ({ d, r: box(d) }))
              .filter((x) => x.r.left >= bandBox.left - 2 && x.r.right <= bandBox.right + 2)
              .sort((a, b) => a.r.left - b.r.left);
            const last = inBand[inBand.length - 1];
            if (!last) continue;
            const overlap = Math.min(gb.right, last.r.right) - Math.max(gb.left, last.r.left);
            out.push({
              gripW: px(gb.width),
              gripX: px(gb.left),
              lastDotX: px(last.r.left),
              lastDotW: px(last.r.width),
              overlapPx: px(overlap),
              covered: overlap > 0,
              // is the dot the element that actually receives the pointer?
              topAtDotCentre: (() => {
                const el = document.elementFromPoint(
                  last.r.left + last.r.width / 2,
                  last.r.top + last.r.height / 2,
                );
                if (!el) return null;
                const cls = Array.from(el.classList).join(" ");
                return /dot/.test(cls) ? "dot" : /Grip/i.test(cls) ? "grip" : /band/i.test(cls) ? "band" : cls.slice(0, 40);
              })(),
            });
          }
          return {
            sampled: out.length,
            covered: out.filter((o) => o.covered).length,
            gripWinsAtDotCentre: out.filter((o) => o.topAtDotCentre === "grip").length,
            sample: out.slice(0, 4),
          };
        })(),

        colUser: cs?.getPropertyValue("--tl-col-user").trim() || null,
        colBase: cs?.getPropertyValue("--tl-col-base").trim() || null,
        colFloor: cs?.getPropertyValue("--tl-col-floor").trim() || null,
        colResolved: cs?.getPropertyValue("--tl-col").trim() || null,
        dayColumnPx: px(box(q("[data-tl-day]"))?.width),

        axisHeaderHeight: px(box(axisHdr)?.height),
        dayWkdFontSize: styleOf(dayWkd, ["font-size", "color", "font-weight"]),
        dayNumFontSize: styleOf(dayNum, ["font-size", "color", "font-weight"]),
        monthLabel: mon ? (mon.textContent || "").trim() : null,

        zoomPresent: !!zoom,
        zoomValue: zoom ? Number(zoom.value) : null,
        zoomMin: zoom ? Number(zoom.min) : null,
        zoomMax: zoom ? Number(zoom.max) : null,
        zoomBox: (() => {
          const b = box(zoom);
          return b ? { w: px(b.width), h: px(b.height) } : null;
        })(),
        drawerToggleText: drawerToggle ? (drawerToggle.textContent || "").trim() : null,

        // horizontal scroll (two ways — scrollWidth alone is blind to clip)
        docScrollWidth: document.documentElement.scrollWidth,
        docClientWidth: document.documentElement.clientWidth,

        // legend / density of chrome
        legendItems: qa("[class*='timeline_legend'] *").filter(
          (e) => (e.textContent || "").trim().length > 0 && e.children.length === 0,
        ).length,
        legendText: (q("[class*='timeline_legend']")?.textContent || "").trim().slice(0, 200),

        // ---- CONTRAST for a SOLID-FILL dot proposal ----
        // Canvas-resolved, never scraped: the declared value is painted onto a
        // 1x1 canvas over black then over white and the pixels read back, which
        // recovers alpha exactly and handles oklch()/color-mix()/color(srgb ...)
        // without a parser. Scraping is what has inflated ratios in this repo
        // (0-1 vs 0-255 conflation).
        contrast: (() => {
          const cv = document.createElement("canvas");
          cv.width = cv.height = 1;
          const cx = cv.getContext("2d", { willReadFrequently: true });
          const over = (decl, bg) => {
            cx.clearRect(0, 0, 1, 1);
            cx.fillStyle = bg;
            cx.fillRect(0, 0, 1, 1);
            cx.fillStyle = decl;
            cx.fillRect(0, 0, 1, 1);
            const d = cx.getImageData(0, 0, 1, 1).data;
            return [d[0], d[1], d[2]];
          };
          // solve for straight rgb + alpha from the two composites
          const resolve = (decl) => {
            try {
              const b = over(decl, "#000");
              const w = over(decl, "#fff");
              // w_i = c_i*a + 255*(1-a) ; b_i = c_i*a  => a = 1 - (w-b)/255
              const a = 1 - (w[0] - b[0]) / 255;
              if (!(a > 0.001)) return null;
              return { rgb: [b[0] / a, b[1] / a, b[2] / a].map((v) => Math.min(255, Math.max(0, v))), a: +a.toFixed(3) };
            } catch {
              return null;
            }
          };
          const lum = ([r, g, b]) => {
            const f = (v) => {
              v /= 255;
              return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            };
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
          };
          const ratio = (x, y) => {
            const a = lum(x), b = lum(y);
            const [hi, lo] = a > b ? [a, b] : [b, a];
            return +((hi + 0.05) / (lo + 0.05)).toFixed(2);
          };
          // composite a translucent decl over a known backdrop, then measure
          const flatten = (decl, backdropRgb) => {
            const bgCss = `rgb(${backdropRgb.map(Math.round).join(",")})`;
            return over(decl, bgCss);
          };

          const root = getComputedStyle(document.documentElement);
          const cardEl = q("[class*='timeline_card__']");
          const cardCS = cardEl ? getComputedStyle(cardEl) : root;
          const tok = (n) => (cardCS.getPropertyValue(n) || root.getPropertyValue(n)).trim();

          const surface = resolve(tok("--surface") || "#fff");
          const surfaceRgb = surface ? surface.rgb : [255, 255, 255];

          // what a dot ACTUALLY sits on: the unit band's painted background
          const bandEl = bandEls[0];
          const bandBgDecl = bandEl ? getComputedStyle(bandEl).backgroundColor : null;
          const bandOnSurface = bandBgDecl ? flatten(bandBgDecl, surfaceRgb) : surfaceRgb;

          const subj = {};
          for (let i = 1; i <= 15; i++) {
            const solid = tok(`--subj-${i}`);
            if (!solid) continue;
            const r = resolve(solid);
            if (!r) continue;
            const flatOnSurface = flatten(solid, surfaceRgb);
            const flatOnBand = flatten(solid, bandOnSurface);
            subj[`--subj-${i}`] = {
              vsSurface: ratio(flatOnSurface, surfaceRgb),
              vsBand: ratio(flatOnBand, bandOnSurface),
              bright: (() => {
                const bt = tok(`--subj-${i}-bright`);
                return bt ? ratio(flatten(bt, bandOnSurface), bandOnSurface) : null;
              })(),
            };
          }

          // the dot's CURRENT visible mark vs the band it sits on
          const dotEl = dots[0];
          const dotBefore = dotEl ? getComputedStyle(dotEl, "::before") : null;
          const dotMark = dotBefore
            ? {
                borderColorVsBand: ratio(flatten(dotBefore.borderColor, bandOnSurface), bandOnSurface),
                fillVsBand: ratio(flatten(dotBefore.backgroundColor, bandOnSurface), bandOnSurface),
              }
            : null;

          return {
            note: "non-text floor is 3:1 (WCAG 1.4.11). vsBand is the honest one — dots sit ON the unit band, not on --surface.",
            surfaceRgb: surfaceRgb.map(Math.round),
            bandBgDecl,
            bandCompositedRgb: bandOnSurface.map(Math.round),
            subjectSolids: subj,
            subjectSolidsFailingVsSurface: Object.entries(subj).filter(([, v]) => v.vsSurface < 3).map(([k, v]) => `${k}=${v.vsSurface}`),
            subjectSolidsFailingVsBand: Object.entries(subj).filter(([, v]) => v.vsBand < 3).map(([k, v]) => `${k}=${v.vsBand}`),
            currentDotMark: dotMark,
          };
        })(),
      };
    });

    // real horizontal-scroll test
    await page.evaluate(() => window.scrollTo(400, 0));
    const scrollX = await page.evaluate(() => window.scrollX);
    await page.evaluate(() => window.scrollTo(0, 0));

    log(`${label}`, { gate, resolved, scrollXAfterScrollTo400: scrollX, ...m });

    await page.screenshot({ path: `${OUT}/${label}-01-default.png` });
    await page.screenshot({ path: `${OUT}/${label}-02-full.png`, fullPage: true });

    await ctx.close();
  }
}

await browser.close();
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
console.log("done");
