// scripts/probe-photo-bright-shots.mjs — visual spot-check for the surfaces the
// light-tone photo veil now changes but that the contrast probes do NOT cover.
//
// The veil added to app/themes.css paints on `.stage`, which app/layout.tsx:157
// renders on EVERY route. probe-qa-tone-matrix.mjs and probe-photo-bright-veil.mjs
// only measure /post, /boards, /catch-up and /teach, so the primary planning
// surfaces are unverified by number AND unseen. This takes the screenshots so a
// human can look, per CLAUDE.md §4b Method B.
//
// It makes no PASS/FAIL claim beyond the document-scroll check — it is an
// evidence-gathering pass, not a gate. Anything it cannot reach is reported as
// ABSENT rather than skipped silently.
//
// SAFETY: teacher_preferences requests are aborted before any seed is applied.
//
// Run: node scripts/probe-photo-bright-shots.mjs [--base=http://localhost:3014]

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { bypassLogin, redact } from "./lib/auth.mjs";

const argv = process.argv.slice(2);
const arg = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const BASE = arg("base", process.env.PROBE_BASE ?? "http://localhost:3014");
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
console.log(
  `\nPRECONDITION  HEAD=${git("rev-parse", "--short", "HEAD")}  tree=${
    git("diff", "HEAD", "--stat", "--", "components", "lib", "app")
      ? "DIRTY"
      : "clean"
  }`,
);

// ⚠ THE SCOPE CLAIM THAT USED TO SIT HERE WAS FALSE, AND IT HID A REAL GAP.
//
// It read: "the veil rule is [data-tone='light']-scoped, so Photo-Dim and Night
// cannot render differently than before it." That is only true of the DARK
// frosted register. lib/theme-values.ts deriveTone:176 —
//
//     if (resolved === "night") return "dark";
//     if (glass === "light")    return "light";   // ← BEFORE the dim checks
//     if (bg === "wash")        return "light";
//     if (dim === "dim")        return "dark";
//     if (dim === "bright")     return "light";
//
// — sends `glass=light` + `photo` to LIGHT tone at EVERY dim value. So
// Glass-Light + Photo-Dim also matches
// `[data-tone="light"][data-frame="glass"][data-bg="photo"]` and now gets the
// white veil where it previously got the dark scrim. Every earlier run of every
// probe here seeded `glass: "dark"`, so that register was never measured and
// the "Photo-Dim byte-identical" regression claim covered only half the axis.
//
// Both registers are now shot. Night still cannot be affected — it returns
// "dark" on the line above the glass check — so it stays out.
const AXES = {
  "glassdark-photo-bright": {
    frame: "glass",
    glass: "dark",
    bg: "photo",
    theme: "clear",
    dim: "bright",
    tone: "light",
  },
  // The register the old comment wrongly excluded. dim=dim, and the tone the
  // engine derives for it is LIGHT — not dark.
  "glasslight-photo-dim": {
    frame: "glass",
    glass: "light",
    bg: "photo",
    theme: "clear",
    dim: "dim",
    tone: "light",
  },
};
const ROUTES = ["/weekly", "/year", "/daily?lesson=m-11-1", "/planner"];
const WIDTHS = [375, 1440];

const failures = [];
let shot = 0;
const browser = await chromium.launch({ channel: "chrome" });
for (const [axis, a] of Object.entries(AXES)) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext(
      width === 1440
        ? { viewport: { width: 1440, height: 900 } }
        : {
            // Repo memory (mobile-emulation-viewport-measure): without
            // isMobile + deviceScaleFactor this measures a narrow DESKTOP.
            viewport: { width, height: width === 375 ? 812 : 1024 },
            deviceScaleFactor: width === 375 ? 3 : 2,
            isMobile: true,
            hasTouch: true,
          },
    );
    ctx.setDefaultNavigationTimeout(180000);
    await ctx.route("**/rest/v1/teacher_preferences*", (r) => r.abort());
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
      } catch {
        /* the tone read-back below turns this into a visible mismatch */
      }
    }, a);
    await ctx.addCookies([
      {
        name: "mc-theme-axes",
        value: `v1.${a.frame}.${a.glass}.${a.bg}.${a.theme}.${a.dim}.vivid.highlight`,
        url: BASE,
      },
    ]);
    try {
      await bypassLogin(ctx, {
        base: BASE,
        next: "/weekly",
        retries: 2,
        timeout: 180000,
      });
    } catch (e) {
      console.log(
        `  FAIL  ${axis}@${width} — auth: ${redact(String(e.message).split("\n")[0])}`,
      );
      failures.push(`${axis}@${width} auth`);
      await ctx.close();
      continue;
    }
    const page = await ctx.newPage();
    for (const route of ROUTES) {
      const slug =
        route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
      try {
        await page.goto(`${BASE}${route}`, {
          waitUntil: "domcontentloaded",
          timeout: 180000,
        });
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
        console.log(`  FAIL  ${axis}/${width}/${slug} — never hydrated`);
        failures.push(`${axis}/${width}/${slug} never hydrated`);
        continue;
      }
      // The tone the ENGINE derived, not one this script wrote.
      const st = await page.evaluate(() => ({
        tone: document.documentElement.getAttribute("data-tone"),
        dim: document.documentElement.getAttribute("data-dim"),
        overflow: Math.max(
          0,
          document.documentElement.scrollWidth - window.innerWidth,
        ),
      }));
      await page
        .screenshot({ path: path.join(SHOTS, `${slug}-${axis}-${width}.png`) })
        .catch(() => {});
      // A shot filed under the wrong tone is worse than no shot: the filename
      // becomes the claim. Mismatch is a run failure, not a printed warning.
      const toneOk = st.tone === a.tone;
      if (!toneOk)
        failures.push(
          `${axis}/${width}/${slug} tone=${st.tone}, expected ${a.tone}`,
        );
      shot += 1;
      console.log(
        `  ${toneOk ? "ok   " : "FAIL "} ${axis}/${width}/${slug} — tone=${st.tone} dim=${st.dim} h-overflow=${st.overflow}px`,
      );
    }
    await ctx.close();
  }
}
await browser.close();
console.log(`\n  shots: ${SHOTS}  (${shot} captured)`);

// Same contract as the contrast probes: failures exit non-zero, and so does a
// run that captured nothing. An evidence-gathering pass that gathered no
// evidence has not succeeded, however quietly it ended.
if (failures.length || shot === 0) {
  console.log(
    shot === 0
      ? "\nFAILED — no screenshots were captured. The probe never reached the app."
      : `\nFAILED — ${failures.length}: ${failures.join(" · ")}`,
  );
  process.exit(1);
}
process.exit(0);
