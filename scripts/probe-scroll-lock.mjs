// probe-scroll-lock.mjs — live gate for the shared refcounted body-scroll lock.
//
// THE DEFECT IT GUARDS. Nine overlays each used to capture
// `document.body.style.overflow`, set "hidden", and restore the captured value
// on unmount. `prev` was captured PER OVERLAY instead of once per lock, so two
// overlays released in non-LIFO order strand the page:
//
//     A opens  → captures ""      , body = hidden
//     B opens  → captures "hidden", body = hidden
//     A closes → restores ""       ← unlocked while B is still open
//     B closes → restores "hidden" ← nothing open, page still locked
//
// Non-LIFO is reachable without any exotic interleaving: React's
// `commitDeletionEffects` walks DOWN the tree, so when a parent overlay is
// closed while a nested one is open, BOTH unmount in one commit and the
// PARENT's cleanup runs first — inverting the safe order for free. That is
// what step 2 below exercises: open the unit workspace, open the standards
// picker inside its lesson editor, then close the WORKSPACE.
//
// Both the lock semantics and the adoption of the hook are unit-tested in
// tests/body-scroll-lock.test.ts. This probe is the end-to-end half: it proves
// the real components, mounted by the real app, leave the real `<body>` clean.
//
// EXPECT=bug   → assert the strand IS present (run against pre-fix code)
// EXPECT=fixed → assert it is gone (default; the regression gate)

import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3099";
const EXPECT = (process.env.EXPECT ?? "fixed").toLowerCase();
if (EXPECT !== "bug" && EXPECT !== "fixed") {
  console.error(`EXPECT must be "bug" or "fixed" (got ${EXPECT})`);
  process.exit(2);
}

const checks = [];
function assert(name, cond, detail = "") {
  checks.push({ name, cond });
  console.log(`  ${cond ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // This harness tests overlays, not onboarding — skip the first-run wizard.
  await context.addInitScript(() => {
    try {
      localStorage.setItem(
        "mycurricula:onboarding",
        JSON.stringify({ stepIndex: 0, data: {}, finished: true }),
      );
    } catch {}
  });

  await bypassLogin(context, { base: BASE, next: "/weekly", retries: 3, timeout: 120000 });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => {
    // Next's dev hydration notice is pre-existing on this route and unrelated.
    if (m.type() === "error" && !/hydrat/i.test(m.text())) errors.push(m.text().slice(0, 140));
  });

  const state = () =>
    page.evaluate(() => ({
      ov: document.body.style.overflow,
      ue: !!document.querySelector("[data-ue-close]"),
      dialogs: document.querySelectorAll('[role="dialog"]').length,
    }));

  await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded", timeout: 120000 });
  // Dev hydration measures 5–9s here; sampling earlier reads SSR-default HTML.
  await page.waitForTimeout(11000);

  console.log(`\n── body-scroll-lock live gate (EXPECT=${EXPECT}) ──`);

  const s0 = await state();
  assert("baseline: nothing open → no lock", s0.ov !== "hidden", `overflow=${JSON.stringify(s0.ov)}`);

  const openWorkspace = () =>
    page.getByRole("button", { name: /open the .* unit workspace/i }).first().click();

  // ── 1. A single overlay locks and fully releases, repeatedly ─────────────
  // Three cycles: a refcount that leaks by one per open would still LOOK right
  // on the first cycle and strand on a later one.
  for (let i = 1; i <= 3; i += 1) {
    await openWorkspace();
    await page.waitForTimeout(2200);
    const open = await state();
    assert(`cycle ${i}: workspace open → locked`, open.ov === "hidden" && open.ue,
      `overflow=${JSON.stringify(open.ov)}`);

    await page.locator("[data-ue-close]").first().click({ force: true });
    await page.waitForTimeout(1400);
    const shut = await state();
    assert(`cycle ${i}: workspace closed → released`, shut.ov !== "hidden" && !shut.ue,
      `overflow=${JSON.stringify(shut.ov)}`);
  }

  // ── 2. NESTED: close the PARENT while a nested overlay is open ───────────
  await openWorkspace();
  await page.waitForTimeout(2200);

  let nested = false;
  const lessonsTab = page.getByRole("tab", { name: /^lessons$/i }).first();
  if (await lessonsTab.count()) {
    await lessonsTab.click();
    await page.waitForTimeout(1200);
    const lesson = page.locator("[data-ue-lesson], [data-lesson-id]").first();
    if (await lesson.count()) {
      await lesson.click({ force: true });
      await page.waitForTimeout(1500);
    }
    const addStd = page.getByRole("button", { name: /(add|tag|edit) standard/i }).first();
    if (await addStd.count()) {
      await addStd.click({ force: true });
      await page.waitForTimeout(1500);
      nested = (await state()).dialogs >= 2;
    }
  }

  if (nested) {
    assert("nested overlay opened over the workspace", true);
    await page.locator("[data-ue-close]").first().click({ force: true });
    await page.waitForTimeout(1800);
    const after = await state();
    assert("parent closed → everything unmounted", after.dialogs === 0 && !after.ue,
      `dialogs=${after.dialogs}`);
    const stuck = after.ov === "hidden";
    if (EXPECT === "bug") {
      assert("BUG: body left locked after parent-first teardown", stuck,
        `overflow=${JSON.stringify(after.ov)}`);
    } else {
      assert("FIXED: body released after parent-first teardown", !stuck,
        `overflow=${JSON.stringify(after.ov)}`);
    }
  } else {
    console.log("  ..  nested overlay not reachable from this surface — step 2 skipped");
    await page.locator("[data-ue-close]").first().click({ force: true });
    await page.waitForTimeout(1400);
  }

  // ── 3. The settings popup — the one route-level lock ─────────────────────
  await page.goto(`${BASE}/settings/appearance`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(11000);
  const inSettings = await state();
  assert("settings popup mounted → locked", inSettings.ov === "hidden",
    `overflow=${JSON.stringify(inSettings.ov)}`);

  await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(11000);
  const leftSettings = await state();
  assert("left settings → released", leftSettings.ov !== "hidden",
    `overflow=${JSON.stringify(leftSettings.ov)}`);

  assert("no unexpected console errors", errors.length === 0, errors.slice(0, 2).join(" | "));

  // Git does not preserve empty directories, so a clean checkout has no
  // screenshot dir and page.screenshot() would ENOENT *after* the assertions —
  // failing the gate for a reason that has nothing to do with the lock.
  const shotDir = "docs/screenshots/scroll-lock";
  mkdirSync(shotDir, { recursive: true });
  await page.screenshot({ path: `${shotDir}/${EXPECT}-final.png` });
  await context.close();
  await browser.close();

  const failed = checks.filter((c) => !c.cond);
  console.log(
    failed.length
      ? `\nPROBE FAILED — ${failed.length}/${checks.length} assertion(s) did not hold`
      : `\nPROBE PASS — ${checks.length}/${checks.length} (EXPECT=${EXPECT})`,
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nprobe crashed: ${e?.message ?? e}`);
  process.exit(1);
});
