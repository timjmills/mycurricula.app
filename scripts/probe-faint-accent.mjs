// probe-faint-accent.mjs — attribute the "not legible" report on /weekly.
//
// WHAT THIS IS FOR
// A screenshot showed the Week grid with the day headers, the "No lessons"
// cells, the toolbar buttons and the in-card chips all washed out. The subject
// scale was the suspect and was CLEARED by computation (dark-tone title-on-card
// measured 5.7-6.3:1 before and after the vivid solids, no AA break). Everything
// still faint in that shot is green — the ACCENT — so this probe measures the
// accent-bearing text instead, and reports which rule paints it.
//
// WHY PIXELS AND NOT getComputedStyle
// Two traps this repo has already paid for, both of which inflate a CSS-derived
// ratio:
//   • `getComputedStyle(el).color` returns the ink REGARDLESS of `opacity`, so
//     any faded element reads ~1.25-1.3x better than it looks.
//   • The backdrop is frosted glass over a photo. There is no single
//     "background-color" to compare against; walking ancestors for the first
//     non-transparent one gives a number that describes no pixel on screen.
// So the measurement here is empirical: screenshot the page, then read the
// actual rendered pixels inside each element's box. Foreground and background
// are the 10th/90th luminance percentiles within the box, which for a text run
// on a flat-ish field separates glyph from ground without needing to know the
// compositing stack. It measures what the eye sees.
//
// The computed values are ALSO reported — not as the verdict, but so the
// offending declaration can be found. Where the two disagree, the pixels win.
//
// SAFETY: .env.local points at PRODUCTION Supabase and the theme sync WRITES
// teacher_preferences. Every non-GET to that table is blocked at the network
// layer and the block count is printed; a probe that reads appearance state
// must never leave a trace on the shared account.

import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { bypassLogin, redact } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const OUT = "docs/screenshots/faint-accent";

/**
 * The elements the report called out, matched by their on-screen text.
 *
 * `group: "chrome"` is frame-independent — the toolbar and the view switcher
 * render the same under every frame, so a missing one means the probe is
 * broken and the run is void. `group: "canvas"` is frame- AND data-dependent:
 * the Week canvas is a different component per frame (WeekColumns under paper,
 * WeekA under glass) with different copy, and "No lessons" only exists on an
 * empty day. Treating those as mandatory would make the probe fail on a
 * perfectly healthy app the moment a teacher switched frames — but treating
 * them as fully optional would let the canvas go unmeasured in silence, which
 * is the half of the screen the whole report was about. Hence MIN_CANVAS.
 */
const TARGETS = [
  ["day header", "Sunday", "canvas"],
  ["day abbrev", "Sun", "canvas"],
  ["empty cell", "No lessons", "canvas"],
  ["toolbar: Resources", "Resources", "chrome"],
  ["toolbar: Print", "Print", "chrome"],
  ["toolbar: Expand all", "Expand all", "chrome"],
  ["toolbar: Today", "Today", "chrome"],
  ["segmented: Grid", "Grid", "chrome"],
  ["segmented: List", "List", "chrome"],
  ["segmented: Schedule", "Schedule", "chrome"],
  ["eyebrow", "WEEKLY PLAN", "chrome"],
];

/** At least this many canvas elements must be scored for the run to count. */
const MIN_CANVAS = 1;

const main = async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // ── the write guard, before anything navigates ──────────────────────────
  let blocked = 0;
  await ctx.route("**/rest/v1/teacher_preferences**", async (route) => {
    if (route.request().method() === "GET") return route.continue();
    blocked++;
    return route.fulfill({ status: 204, body: "" });
  });

  await bypassLogin(ctx, { base: BASE, next: "/weekly" });
  const page = await ctx.newPage();

  // Wait for the PREFERENCES RESPONSE, not merely for the axes to hold still.
  // "Stable for three checks" is satisfied by the pre-hydration defaults: the
  // axes sit at glass|clear for a second or two before teacher_preferences
  // lands. The capture script hit exactly this and shot the wrong appearance
  // while looking healthy; the settle loop below is kept as the second half of
  // the guarantee (received AND applied), not the whole of it.
  // GET, and a successful one. Matching any teacher_preferences response is a
  // trap of this probe's own making: the write guard above FULFILLS non-GET
  // requests with a 204, so a startup preference write would have satisfied
  // this gate without a single row ever being read — the probe would then
  // measure pre-hydration defaults and exit clean.
  const prefsSeen = page
    .waitForResponse(
      (r) =>
        r.url().includes("/rest/v1/teacher_preferences") &&
        r.request().method() === "GET" &&
        r.status() >= 200 &&
        r.status() < 300,
      { timeout: 30_000 },
    )
    .then(() => true)
    .catch(() => false);
  await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });
  const gotPrefs = await prefsSeen;

  // The planner hydrate is slow; wait for real content rather than a timer.
  await page
    .waitForFunction(() => document.querySelectorAll("[class*='dayCol'], [class*='col']").length > 0, {
      timeout: 45_000,
    })
    .catch(() => {});
  await page.waitForTimeout(6000);

  // Wait for the APPEARANCE AXES to settle, not just for a timer.
  // teacher_preferences arrives on its own schedule; a fixed wait caught the
  // pre-hydration defaults (glass/clear) on one run and the persisted values
  // (paper/mint) on the next, which silently turned a tone counterfactual into
  // a frame+theme+tone comparison. Poll until the signature is unchanged three
  // times running, then report what settled.
  const settled = await page.evaluate(async () => {
    const sig = () => {
      const d = document.documentElement.dataset;
      return [d.frame, d.theme, d.bg, d.dim, d.glass, d.tone].join("|");
    };
    let last = sig();
    let stable = 0;
    for (let i = 0; i < 60 && stable < 3; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const now = sig();
      stable = now === last ? stable + 1 : 0;
      last = now;
    }
    return { sig: last, stable };
  });
  console.log(
    `AXES SETTLED: ${settled.sig}  (stable checks: ${settled.stable}, prefs response: ${gotPrefs ? "seen" : "NOT SEEN"})\n`,
  );
  if (!gotPrefs) {
    console.error(
      "ABORT: no teacher_preferences response observed within 30s, so the axes above\n" +
        "may be pre-hydration defaults rather than this teacher's saved appearance.\n" +
        "Every measurement below would be attributed to the wrong frame/theme/tone.",
    );
    await browser.close();
    process.exit(2);
  }

  // COUNTERFACTUAL ARM. `FORCE_TONE=light node scripts/probe-faint-accent.mjs`
  // re-runs the same measurement with the tone flipped, which is the whole
  // proposed fix expressed as one attribute. If the failures clear here, the
  // ink tokens were never wrong — the tone they were selected for was. If they
  // do NOT clear, the fix is elsewhere and this saves writing it.
  if (process.env.FORCE_TONE) {
    // A single assignment is NOT enough and the first version of this arm was
    // silently useless because of it: lib/theme.tsx re-applies the derived tone
    // in an effect, so the attribute was back to "dark" by the time anything
    // was measured — and the probe cheerfully reported an unchanged result as
    // if the counterfactual had run. A MutationObserver re-asserts it, and the
    // axis read below is the check that it actually held.
    await page.evaluate((t) => {
      const root = document.documentElement;
      const pin = () => {
        if (root.dataset.tone !== t) root.dataset.tone = t;
      };
      pin();
      new MutationObserver(pin).observe(root, {
        attributes: true,
        attributeFilter: ["data-tone"],
      });
    }, process.env.FORCE_TONE);
    await page.waitForTimeout(1200);
    console.log(`[counterfactual] data-tone pinned to "${process.env.FORCE_TONE}"\n`);
  }

  const axes = await page.evaluate(() => {
    const d = document.documentElement.dataset;
    return {
      frame: d.frame, theme: d.theme, tone: d.tone, bg: d.bg,
      dim: d.dim, glass: d.glass, canvas: d.canvas, veil: d.veil,
      accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
      surface: getComputedStyle(document.documentElement).getPropertyValue("--surface").trim(),
      ink: getComputedStyle(document.documentElement).getPropertyValue("--ink").trim(),
      inkSoft: getComputedStyle(document.documentElement).getPropertyValue("--ink-soft").trim(),
      muted: getComputedStyle(document.documentElement).getPropertyValue("--muted").trim(),
    };
  });

  const shotPath = `${OUT}/weekly-1440.png`;
  const png = await page.screenshot({ path: shotPath, fullPage: false });

  // Hand the screenshot back into the page so canvas can read its pixels —
  // avoids pulling a PNG decoder into node just to sample a few boxes.
  const rows = await page.evaluate(
    async ({ dataUrl, targets, dpr }) => {
      const img = new Image();
      img.src = dataUrl;
      await img.decode();
      const cv = document.createElement("canvas");
      cv.width = img.width;
      cv.height = img.height;
      const cx = cv.getContext("2d", { willReadFrequently: true });
      cx.drawImage(img, 0, 0);

      const lum = (r, g, b) => {
        const f = (c) => {
          c /= 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const ratio = (a, b) => {
        const [hi, lo] = a > b ? [a, b] : [b, a];
        return (hi + 0.05) / (lo + 0.05);
      };

      const out = [];
      for (const [label, text, group] of targets) {
        // The smallest element whose own text is this string — avoids matching
        // a container that merely contains it. Case-insensitive because several
        // labels are uppercased in CSS, so the DOM text differs from the pixels.
        const want = text.toLowerCase();
        // Leaves first, but do not REQUIRE a leaf: a button label wrapped
        // around an icon has children, and demanding `children.length === 0`
        // is why "Resources" and "Print" came back not-found on every earlier
        // run while the probe still reported a clean bill of health.
        // VISIBLE candidates only, and if the first is unusable, try the next.
        // Responsive layouts keep a hidden duplicate of the same label (a phone
        // copy, a collapsed menu), so a plain "smallest match" could pick a
        // zero-sized clone and report the target ABSENT — voiding a healthy run
        // — while the visible one sat two nodes away.
        const visible = (e) => {
          const s = getComputedStyle(e);
          if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) === 0) {
            return false;
          }
          const r2 = e.getBoundingClientRect();
          return (
            r2.width >= 2 &&
            r2.height >= 2 &&
            r2.bottom > 0 &&
            r2.right > 0 &&
            r2.top < innerHeight &&
            r2.left < innerWidth
          );
        };
        const matches = [...document.querySelectorAll("*")]
          .filter((e) => e.textContent.trim().toLowerCase() === want)
          .filter(visible)
          .sort(
            (a, b) =>
              a.getElementsByTagName("*").length - b.getElementsByTagName("*").length ||
              a.getBoundingClientRect().width - b.getBoundingClientRect().width,
          );
        const el = matches[0];
        if (!el) {
          out.push({ label, text, group, found: false });
          continue;
        }
        // Measure the GLYPH RUN, not the element box. A day-column header is a
        // ~350px cell containing a ~50px word; sampled over the whole box the
        // glyph pixels are under 10% of the area, so both percentiles land on
        // background and every such element reports a flat 1.00 — which is what
        // the first run of this probe did for three of them. A Range around the
        // text node bounds the letters themselves.
        const range = document.createRange();
        range.selectNodeContents(el);
        const rr = range.getBoundingClientRect();
        const r = rr.width >= 2 && rr.height >= 2 ? rr : el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) {
          out.push({ label, text, group, found: false, note: "zero-size" });
          continue;
        }
        const cs = getComputedStyle(el);

        const x = Math.max(0, Math.round(r.left * dpr));
        const y = Math.max(0, Math.round(r.top * dpr));
        const w = Math.min(cv.width - x, Math.round(r.width * dpr));
        const h = Math.min(cv.height - y, Math.round(r.height * dpr));
        if (w < 2 || h < 2) {
          out.push({ label, text, group, found: false, note: "offscreen" });
          continue;
        }
        const px = cx.getImageData(x, y, w, h).data;
        const ls = [];
        for (let i = 0; i < px.length; i += 4) ls.push(lum(px[i], px[i + 1], px[i + 2]));
        ls.sort((a, b) => a - b);
        // 5/95 rather than 10/90: even a tight glyph box is mostly counter and
        // side-bearing, so the ink is a minority of the pixels.
        const p = (q) => ls[Math.min(ls.length - 1, Math.floor(ls.length * q))];
        const dark = p(0.05);
        const light = p(0.95);

        // The backdrop, sampled OUTSIDE the glyph run — three probes, not one.
        // A single patch to the right of the text can land on an adjacent
        // control, a different glass layer, or the edge of a gradient, and then
        // the whole verdict is computed against a ground the text never sat on.
        // Sampling left, right and above and requiring them to AGREE turns that
        // silent mis-read into a refusal: a row whose surroundings disagree is
        // reported ambiguous rather than given a confident wrong number.
        const patch = (px0, py0) => {
          if (px0 < 0 || py0 < 0 || px0 + 2 > cv.width || py0 + 2 > cv.height) return null;
          const b = cx.getImageData(px0, py0, 2, 2).data;
          return [b[0], b[1], b[2]];
        };
        const mid = Math.min(cv.height - 3, y + Math.floor(h / 2));
        const samples = [
          patch(x + w + 4, mid), // right of the run
          patch(x - 6, mid), // left of the run
          patch(x + Math.floor(w / 2), y - 5), // above it
        ].filter(Boolean);

        let bg = null;
        let bgAmbiguous = false;
        if (samples.length) {
          const ls = samples.map((s) => lum(...s));
          // Luminance is what the ratio is built from, so agreement is judged
          // on luminance rather than on raw channel distance.
          bgAmbiguous = Math.max(...ls) - Math.min(...ls) > 0.06;
          // The median sample is the ground: with three probes it is the one
          // that two of them corroborate.
          const order = samples
            .map((s, i) => [ls[i], i])
            .sort((a, b2) => a[0] - b2[0]);
          const chosen = samples[order[Math.floor(order.length / 2)][1]];
          bg = {
            rgb: `rgb(${chosen[0]}, ${chosen[1]}, ${chosen[2]})`,
            lum: Number(lum(...chosen).toFixed(3)),
            spread: Number((Math.max(...ls) - Math.min(...ls)).toFixed(3)),
          };
        }

        // EFFECTIVE opacity — the element's own AND every ancestor's.
        // Reading only `cs.opacity` overstates contrast whenever a wrapper is
        // faded, and this run has a live example: the disabled "Today" button
        // computed 9.77:1 from its own (opaque) colour while the pixels showed
        // 2.80:1, because the fade lives on an ancestor. A number labelled
        // "WCAG" that ignores that is the inflating-instrument failure again.
        let effOpacity = 1;
        for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
          const o = parseFloat(getComputedStyle(n).opacity);
          if (!Number.isNaN(o)) effOpacity *= o;
        }

        // WCAG 1.4.3 exempts disabled controls. Without this a greyed-out
        // button reads as a contrast failure and pulls attention away from the
        // real ones — the repo has already been bitten by a probe that damned
        // disabled controls (probe-any-pointer.mjs makes the same exclusion).
        const ctl = el.closest("button, a, [role='button'], input, select");
        const disabled =
          !!ctl && (ctl.disabled === true || ctl.getAttribute("aria-disabled") === "true");

        // THE WCAG NUMBER. `pixelRatio` above is empirical and catches gross
        // failures, but it systematically UNDER-reads thin text: at 12px/400 a
        // glyph stem is about a pixel wide and heavily antialiased, so the 5th
        // percentile inside the text box is a blend of ink and ground, never
        // the ink itself. Measured here: --muted on the dark canvas sampled
        // 4.31 but computes 5.34. Judging on the pixel number alone would have
        // sent a token bump after a passing element.
        // So: resolve the declared colour through a canvas (which normalises
        // `oklch()` / `color(srgb …)` — scraped naively those two get conflated
        // and the ratio inflates), composite element opacity over the SAMPLED
        // backdrop, and do the WCAG maths against the real ground.
        // Resolve by PAINTING, not by parsing. `fillStyle` round-trips modern
        // colour syntax verbatim, so a regex over it returns null for
        // `oklch(...)` — which is what the active chip now computes to, and
        // which silently cost that element its score on the first hardened
        // run. Filling a pixel and reading it back resolves any CSS colour
        // (oklch, lab, color(srgb …), named) to plain sRGB bytes, and dodges
        // the documented 0-1-float vs 0-255 conflation at the same time.
        let fg = null;
        try {
          const c1 = document.createElement("canvas");
          c1.width = c1.height = 1;
          const g = c1.getContext("2d", { willReadFrequently: true });
          g.clearRect(0, 0, 1, 1);
          g.fillStyle = "#000";
          g.fillStyle = cs.color;
          // A colour the engine cannot parse leaves fillStyle at the previous
          // value; painting it would silently score the text as black.
          if (g.fillStyle !== "#000000" || /^(#000000|rgb\(0, 0, 0\)|black)$/i.test(cs.color.trim())) {
            g.fillRect(0, 0, 1, 1);
            const d = g.getImageData(0, 0, 1, 1).data;
            fg = [d[0], d[1], d[2], d[3] / 255];
          }
        } catch {
          fg = null;
        }

        let cssRatio = null;
        let unresolvedColor = fg === null;
        if (bg && !bgAmbiguous) {
          if (fg) {
            const bgm = bg.rgb.match(/rgb\((\d+), (\d+), (\d+)\)/);
            const B = [+bgm[1], +bgm[2], +bgm[3]];
            // Effective opacity multiplies the colour's own alpha; both
            // composite the ink toward the ground before the ratio is taken.
            const a = fg[3] * effOpacity;
            const C = [0, 1, 2].map((i) => fg[i] * a + B[i] * (1 - a));
            cssRatio = Number(ratio(lum(...C), lum(...B)).toFixed(2));
          }
        }

        out.push({
          label,
          text,
          group,
          found: true,
          disabled,
          cssRatio,
          cls: el.className?.toString?.().slice(0, 60) ?? "",
          color: cs.color,
          opacity: cs.opacity,
          fontSize: cs.fontSize,
          fontWeight: cs.fontWeight,
          bg,
          bgAmbiguous,
          effOpacity: Number(effOpacity.toFixed(3)),
          pixelRatio: Number(ratio(light, dark).toFixed(2)),
        });
      }
      return out;
    },
    { dataUrl: `data:image/png;base64,${png.toString("base64")}`, targets: TARGETS, dpr: 1 },
  );

  console.log("ROOT AXES");
  for (const [k, v] of Object.entries(axes)) console.log(`  ${k.padEnd(9)} ${v || "(unset)"}`);

  console.log("\nRENDERED CONTRAST (pixel-sampled, AA needs 4.5:1 — 3:1 for >=18.66px bold)");
  console.log("   wcag     px  size/wt   computed color             on ground              element");
  const fails = [];
  const fatal = []; // voids the run
  const skipped = []; // legitimately absent under this frame
  let canvasScored = 0;
  for (const r of rows) {
    if (!r.found) {
      // A missing CHROME target means the probe itself is broken — if a rename
      // made every target unmatchable, a log-and-continue would print
      // "0/0 below AA" and exit 0: a clean bill of health from an instrument
      // that measured nothing. A missing CANVAS target is ordinary (different
      // frames render different Week components, and "No lessons" needs an
      // empty day), so it is recorded, not fatal.
      const line = `${r.label} — not found${r.note ? ` (${r.note})` : ""}`;
      (r.group === "chrome" ? fatal : skipped).push(line);
      console.log(`  ----   NOT FOUND${r.group === "chrome" ? " (chrome)" : ""}: ${r.label}`);
      continue;
    }
    if (r.bgAmbiguous) {
      // The three background probes disagreed, so there is no single ground
      // this text sits on. Refusing beats inventing a confident number.
      fatal.push(`${r.label} — background ambiguous (luminance spread ${r.bg?.spread})`);
      console.log(`  ----   AMBIGUOUS GROUND: ${r.label} (spread ${r.bg?.spread}) — not scored`);
      continue;
    }
    if (r.cssRatio === null) {
      // A DISTINCT failure from an ambiguous ground, and it was worth
      // separating: the active chip computes to `oklch(...)`, which the first
      // hardened draft could not resolve — and because both conditions shared
      // one branch, it was reported as "ambiguous ground (spread 0)", a
      // diagnosis that pointed at the background when the fault was the
      // foreground. A refusal that misnames its own reason sends the next
      // reader to the wrong place.
      fatal.push(`${r.label} — could not resolve colour "${r.color}"`);
      console.log(`  ----   UNRESOLVED COLOUR: ${r.label} (${r.color}) — not scored`);
      continue;
    }
    const large = parseFloat(r.fontSize) >= 18.66 && Number(r.fontWeight) >= 700;
    const floor = large ? 3 : 4.5;
    // Judged on the WCAG number; the pixel sample rides along as corroboration.
    const judged = r.cssRatio ?? r.pixelRatio;

    // CORROBORATION. cssRatio is the verdict, but it is computed from the
    // declared colour and so is blind to anything that alters the actual paint:
    // -webkit-text-fill-color, a filter, a blend mode, a locally varying
    // frosted/photo ground. Those would show up as a computed pass over a
    // visibly faint element. The pixel sample sees them, so a pass now requires
    // the two to agree.
    //
    // The tolerance is one-sided and not arbitrary: antialiasing makes the
    // pixel sample UNDER-read thin text (measured 4.31 px against 5.34 css on
    // 12px/400), never over-read it. 0.85 of the floor sits below every
    // legitimate gap observed here and above the divergence a genuinely altered
    // paint produces. Disagreement voids the row rather than passing or failing
    // it — the instrument cannot tell which number is lying.
    if (!r.disabled && judged >= floor && r.pixelRatio < floor * 0.85) {
      fatal.push(
        `${r.label} — computed ${judged} passes but rendered pixels read ${r.pixelRatio}; ` +
          `something is altering the paint (filter / blend / text-fill-color?)`,
      );
      console.log(
        `  ----   DISPUTED: ${r.label} — css ${judged} vs px ${r.pixelRatio}, not scored`,
      );
      continue;
    }
    if (r.group === "canvas") canvasScored++;

    const bad = judged < floor && !r.disabled;
    if (bad) fails.push(r);
    console.log(
      `  ${bad ? "!" : r.disabled ? "d" : " "}${String(judged).padStart(5)} ${String(r.pixelRatio).padStart(6)}` +
        `  ${r.fontSize}/${r.fontWeight}  ${r.color.padEnd(26)} on ${(r.bg?.rgb ?? "?").padEnd(20)}  ` +
        `${r.label}${r.opacity !== "1" ? ` opacity:${r.opacity}` : ""}`,
    );
  }

  const scored = rows.filter((r) => r.found && !r.bgAmbiguous && r.cssRatio !== null).length;
  console.log(`\n${fails.length}/${scored} measured elements below their AA floor`);
  console.log(`teacher_preferences non-GET blocked: ${blocked}`);
  console.log(`screenshot: ${shotPath}`);
  writeFileSync(`${OUT}/measurements.json`, JSON.stringify({ axes, rows }, null, 2));

  await browser.close();

  // Exit codes: 0 clean · 1 contrast failures · 2 the probe could not measure.
  // 2 is separate on purpose — "some elements are unreadable" and "I could not
  // see the page" demand different responses, and collapsing them into one
  // non-zero code is how a broken instrument gets mistaken for a broken app.
  if (skipped.length) {
    console.log(`\nnot present under this frame (expected): ${skipped.length}`);
    for (const s of skipped) console.log(`  · ${s}`);
  }
  if (canvasScored < MIN_CANVAS) {
    fatal.push(
      `only ${canvasScored} canvas element(s) scored, need ${MIN_CANVAS} — the Week canvas ` +
        `went unmeasured, and it is the half of the screen this probe exists for`,
    );
  }
  if (fatal.length) {
    console.error(`\nCOULD NOT MEASURE — run is void:\n  ${fatal.join("\n  ")}`);
    console.error("Refusing to report a verdict over an incomplete measurement.");
    process.exit(2);
  }
  if (fails.length) process.exit(1);
};

main().catch((e) => {
  console.error(redact(e?.stack ?? e));
  process.exit(1);
});
