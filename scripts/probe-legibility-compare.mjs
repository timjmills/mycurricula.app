// probe-legibility-compare.mjs — matched BEFORE/AFTER for the dark-tone fix.
//
// Both frames come from ONE page load. Two dev-server runs would let the photo,
// the data and the layout drift, leaving a reader unable to tell a cascade
// change from a data change — the repo has a documented capture technique for
// exactly this, and this follows it.
//
// The "before" is reproduced by re-emitting the mint theme tier WITH the
// `:not([data-frame="color"])` qualifier the staged Pastel port had added. That
// single qualifier is the whole bug: it lifts the tier from (0,2,0) to (0,3,0),
// which beats `:root[data-tone="dark"]` and hands a LIGHT canvas to a dark-tone
// page. Re-emitting the real block (rather than hand-picking tokens) means the
// before frame is the actual prior cascade, not an impression of it.
//
// The repaint is ASSERTED. An injected override that silently fails to apply
// yields a "before" frame identical to the "after" one, and a side-by-side of
// two identical images reads as "the fix did nothing" — or worse, gets captioned
// as proof that it did something.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { bypassLogin, redact } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const OUT = "docs/screenshots/legibility-fix";

/**
 * The pre-fix state, and ONLY that.
 *
 * Before this commit, `--chrome-accent-deep` was declared by each theme tier
 * and NOT by the dark-tone block, so the mint tier's value stood in dark tone.
 * Re-declaring it at a specificity that outranks the new dark-tone rule
 * reproduces exactly that and nothing else.
 *
 * An earlier draft re-emitted the whole mint tier behind
 * `:not([data-frame="color"])`, which also dragged the canvas token along. That
 * was the Frame C · Pastel canvas-inversion bug — a defect that never reached
 * master and is now shelved — so the "before" frame would have shown two
 * problems and credited this one-line commit with fixing both.
 */
const BEFORE_CSS = `
:root:root[data-theme="mint"] {
  --chrome-accent-deep: #166534;
}`;

const main = async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  let blocked = 0;
  await ctx.route("**/rest/v1/teacher_preferences**", async (route) => {
    if (route.request().method() === "GET") return route.continue();
    blocked++;
    return route.fulfill({ status: 204, body: "" });
  });
  await bypassLogin(ctx, { base: BASE, next: "/weekly" });
  const page = await ctx.newPage();

  // Same GET-and-successful requirement as the contrast probe, and the RESULT
  // IS KEPT. Awaiting a promise whose rejection is caught as null proves
  // nothing: on a timeout the run continued, and if the defaults happened to
  // be Mint in dark tone it would produce a confident comparison of an
  // appearance the teacher never saved.
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
  if (!(await prefsSeen)) {
    console.error(
      "ABORT: no successful teacher_preferences GET within 30s — the axes below would\n" +
        "be pre-hydration defaults, not the saved appearance this comparison claims.",
    );
    process.exit(2);
  }
  await page.waitForTimeout(8000);

  const axes = await page.evaluate(() => {
    const d = document.documentElement.dataset;
    return { sig: [d.frame, d.theme, d.bg, d.dim, d.glass, d.tone].join("|"), tone: d.tone, theme: d.theme };
  });
  // BOTH preconditions, asserted. The fix is scoped to a LIGHT THEME in DARK
  // TONE; on any other combination the before/after would still differ (the
  // theme tier alone moves --ink-50) and the run would present two different
  // screenshots as evidence for a change it never exercised.
  if (axes.theme !== "mint") {
    console.error(`ABORT: written for the mint tier; theme is "${axes.theme}" (${axes.sig})`);
    process.exit(2);
  }
  if (axes.tone !== "dark") {
    console.error(
      `ABORT: the fix only applies in dark tone; tone is "${axes.tone}" (${axes.sig}).\n` +
        `Set Appearance to a dimmed photo before running this.`,
    );
    process.exit(2);
  }

  /** The two properties under test, read from the live root. */
  const probeVals = () =>
    page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      // The ACTIVE option specifically, via its ARIA state rather than a class
      // substring. `[class*='optionLabel']` returned whichever option came
      // first in the DOM — usually an INACTIVE one, which does not read
      // --chrome-accent-deep at all. Its colour would then be identical before
      // and after, and because the assertion below was written to skip on a
      // falsy value, a null or unchanged reading let the run pass while
      // proving nothing about the chip under test.
      // SCOPED to the Week view switcher, visible, and carrying one of its own
      // labels. An unscoped `[role="radio"][aria-checked="true"]` takes the
      // first active radio anywhere on the page — another control entirely, or
      // a hidden responsive duplicate — and that element's colour would move
      // under the injected token too, satisfying both assertions while the
      // Grid/List/Schedule chip this fix is about went untested.
      const WANTED = ["Grid", "List", "Schedule"];
      const onScreen = (e) => {
        const s = getComputedStyle(e);
        if (s.display === "none" || s.visibility === "hidden") return false;
        const r = e.getBoundingClientRect();
        return r.width >= 2 && r.height >= 2 && r.top < innerHeight && r.bottom > 0;
      };
      const active = [...document.querySelectorAll("[role='radio'][aria-checked='true']")]
        .filter((e) => WANTED.includes(e.textContent.trim()))
        .filter(onScreen)[0];
      const label = active?.querySelector("[class*='optionLabel']") ?? active;
      return {
        // --chrome-accent-deep is what THIS COMMIT changes.
        accentDeep: cs.getPropertyValue("--chrome-accent-deep").trim(),
        chipLabel: label ? label.textContent.trim() : null,
        chipColor: label ? getComputedStyle(label).color : null,
      };
    });

  const after = await probeVals();
  await page.screenshot({ path: `${OUT}/compare-after.png` });

  const injected = await page.addStyleTag({ content: BEFORE_CSS });
  await page.waitForTimeout(800);
  const before = await probeVals();

  // Assert the repaint on the property THIS COMMIT changes, not merely on
  // "something moved". --ink-50 shifting proves the injection landed; only
  // --chrome-accent-deep shifting proves it exercised the accent fix.
  if (before.accentDeep === after.accentDeep) {
    console.error(
      `ABORT: --chrome-accent-deep did not move (stayed ${after.accentDeep}).\n` +
        `The injected state did not exercise the change under test, so a 'before'\n` +
        `frame captured now would be evidence for nothing.`,
    );
    process.exit(2);
  }
  // The chip's rendered text colour must move too. --chrome-accent-deep
  // changing only proves the custom property resolved differently; the chip
  // reading it is what a teacher actually sees, and a component that had
  // hard-coded its own colour would leave this identical.
  //
  // A MISSING chip is fatal rather than skippable. The earlier guard read
  // `if (before.chipColor && …)`, so a null — no active option found — silently
  // satisfied it, and the run could pass on the root custom property alone
  // while never measuring the element the fix exists for.
  if (!after.chipColor || !before.chipColor) {
    console.error(
      `ABORT: no active segmented option found ([role="radio"][aria-checked="true"]).\n` +
        `The rendered-colour assertion cannot run, so this proves nothing.`,
    );
    process.exit(2);
  }
  if (before.chipColor === after.chipColor) {
    console.error(
      `ABORT: the active chip ("${after.chipLabel}") did not change colour ` +
        `(stayed ${after.chipColor}),\nso the token change never reached the pixel a ` +
        `teacher looks at.`,
    );
    process.exit(2);
  }
  await page.screenshot({ path: `${OUT}/compare-before.png` });

  // Restore, and verify the restoration — so the pair is known to differ by the
  // injected qualifier alone and nothing else drifted mid-capture.
  // Remove THIS tag by its handle. "The last <style>" was wrong: Next injects
  // its own style elements during the session, so that removed a framework tag
  // and left the override in place — the restore check caught it, which is the
  // only reason it is not still there.
  await injected.evaluate((el) => el.remove());
  await page.waitForTimeout(600);
  const restored = await probeVals();

  const ok = restored.accentDeep === after.accentDeep;

  console.log(`axes: ${axes.sig}\n`);
  console.log(`--chrome-accent-deep   before: ${before.accentDeep}`);
  console.log(`                        after: ${after.accentDeep}`);
  console.log(`active chip text       before: ${before.chipColor}`);
  console.log(`                        after: ${after.chipColor}`);
  console.log(`\nrestored cleanly: ${ok ? "OK" : "MISMATCH"}`);
  console.log(`teacher_preferences non-GET blocked: ${blocked}`);

  if (!ok) process.exit(2);
  await browser.close();
};

main().catch((e) => {
  console.error(redact(e?.stack ?? e));
  process.exit(1);
});
