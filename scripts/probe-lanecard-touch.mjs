// scripts/probe-lanecard-touch.mjs
// Lane E verification: confirm LaneCard minimize/restore buttons have a
// ≥44×44 hit area via the ::before pseudo-element at all three tiers.

import { chromium } from "playwright";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3000";
const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;

async function seedAuth(context) {
  const seed = await context.newPage();
  await seed.goto(
    `${BASE}/auth/claude-login?token=${encodeURIComponent(TOKEN)}&next=/year`,
    { waitUntil: "domcontentloaded" },
  );
  await seed.close();
}

async function probeTier(browser, label, viewport) {
  const context = await browser.newContext({ viewport });
  await seedAuth(context);
  const page = await context.newPage();
  await page.goto(`${BASE}/year`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const result = await page.evaluate(() => {
    // Find every minimize/restore button.
    const btns = Array.from(
      document.querySelectorAll(
        'button[aria-label^="Minimize "], button[aria-label^="Restore "]',
      ),
    );
    // Filter out hidden buttons (e.g. when phone shows YearMobile and the
    // RoadmapView's LaneCards exist in DOM but their parent is display:none).
    return btns
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      })
      .map((b) => {
        const r = b.getBoundingClientRect();
        // Read the ::before geometry. The hit-area is the union of
        // the button rect and the inflated ::before rect.
        const cs = getComputedStyle(b, "::before");
        const insetTop = parseFloat(cs.top) || 0;
        const insetLeft = parseFloat(cs.left) || 0;
        const insetRight = parseFloat(cs.right) || 0;
        const insetBottom = parseFloat(cs.bottom) || 0;
        // CSS `inset: -10px` resolves all four sides to "-10px".
        const hitW = r.width + Math.abs(insetLeft) + Math.abs(insetRight);
        const hitH = r.height + Math.abs(insetTop) + Math.abs(insetBottom);
        return {
          label: b.getAttribute("aria-label"),
          visible: { w: Math.round(r.width), h: Math.round(r.height) },
          beforeInset: {
            top: cs.top,
            right: cs.right,
            bottom: cs.bottom,
            left: cs.left,
          },
          hitArea: { w: Math.round(hitW), h: Math.round(hitH) },
        };
      });
  });

  console.log(`\n── ${label} (${viewport.width}×${viewport.height}) ──`);
  if (result.length === 0) {
    console.log(
      `(no visible LaneCard minimize/restore buttons — likely YearMobile renders here)`,
    );
  }
  for (const b of result) {
    const ok = b.hitArea.w >= 44 && b.hitArea.h >= 44;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${b.label.padEnd(28)} visible=${b.visible.w}×${b.visible.h}  hit=${b.hitArea.w}×${b.hitArea.h}  inset(${b.beforeInset.top}/${b.beforeInset.right}/${b.beforeInset.bottom}/${b.beforeInset.left})`,
    );
  }
  await context.close();
  return result.every((b) => b.hitArea.w >= 44 && b.hitArea.h >= 44);
}

const browser = await chromium.launch({ headless: true });
let allPass = true;
allPass &= await probeTier(browser, "phone", { width: 400, height: 800 });
allPass &= await probeTier(browser, "tablet", { width: 768, height: 1024 });
allPass &= await probeTier(browser, "desktop", { width: 1280, height: 900 });
await browser.close();
console.log(`\n${allPass ? "ALL TIERS PASS ≥44×44" : "FAILURES — see above"}`);
process.exit(allPass ? 0 : 1);
