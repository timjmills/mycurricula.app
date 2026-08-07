// probe-f0-fork-label.mjs — live verification for the fork-diff footer relabel.
//
// THE CLAIM: the primary footer button no longer says "Propose to Team" (which
// promised a merge-back workflow that does not exist — nothing is sent, queued
// or saved) but names what it actually does: switch into Team-Curriculum
// editing. The BEHAVIOUR is unchanged and must stay unchanged, so this also
// presses it and requires <html data-mode="team"> to appear — the pink caution
// glow that CLAUDE.md §2 makes the safety mechanism instead of a confirm
// dialog.
//
// Reached through the documented deep link `/daily?lesson=<id>&compare=1`.
// `r-12-1` is one of three mock lessons carrying a masterSnapshot
// (lib/mock/lessons.ts:423), which is what canCompareWithTeam() gates on.
//
// Gated on the PANEL appearing, never a fixed wait.
//
// Run: node scripts/probe-f0-fork-label.mjs   (dev server already on 3014)

import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
const SHOTS = "docs/screenshots/f0-week-radio";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const consoleLog = [];

const READ = `(() => {
  const panel = document.querySelector('[aria-label="Compare with Team Curriculum"]');
  if (!panel) return { panel: false };
  return {
    panel: true,
    buttons: Array.from(panel.querySelectorAll("button")).map((b) => ({
      text: (b.textContent || "").trim(),
      ariaLabel: b.getAttribute("aria-label"),
      title: b.getAttribute("title"),
      describedBy: b.getAttribute("aria-describedby"),
    })),
    text: (panel.textContent || "").replace(/\\s+/g, " ").trim(),
    mode: document.documentElement.getAttribute("data-mode"),
  };
})()`;

const read = (page) => page.evaluate(READ);

async function until(page, pred, budgetMs = 120000) {
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < budgetMs) {
    last = await read(page);
    if (pred(last)) return { ok: true, ms: Date.now() - t0, state: last };
    await page.waitForTimeout(400);
  }
  return { ok: false, ms: Date.now() - t0, state: last };
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await bypassLogin(ctx, { base: BASE, next: "/daily" });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning")
      consoleLog.push({ type: m.type(), text: m.text().slice(0, 300) });
  });
  page.on("pageerror", (e) =>
    consoleLog.push({ type: "pageerror", text: String(e).slice(0, 300) }),
  );

  await page.goto(`${BASE}/daily?lesson=r-12-1&compare=1`, {
    waitUntil: "domcontentloaded",
  });

  const gate = await until(page, (s) => s.panel === true);
  if (!gate.ok) {
    ok("the fork-diff panel opened via ?compare=1", false,
       `panel never appeared in ${Math.round(gate.ms / 1000)}s — nothing below is asserted`);
    await page.screenshot({ path: `${SHOTS}/fork-TIMEOUT.png` });
  } else {
    ok("the fork-diff panel opened via ?compare=1", true,
       `after ${(gate.ms / 1000).toFixed(1)}s`);
    const s = gate.state;
    await page.screenshot({ path: `${SHOTS}/fork-panel.png` });

    const texts = s.buttons.map((b) => b.text);
    ok('the primary action reads "Edit the Team version"',
       texts.includes("Edit the Team version"), `buttons=[${texts.join(" | ")}]`);
    // Paired with the positive control above: the panel DID render, so the
    // absence of the old label is a fact about the label.
    ok('the word "Propose" appears nowhere in the panel',
       !/propos/i.test(s.text),
       /propos/i.test(s.text) ? s.text.match(/.{0,60}propos.{0,60}/i)?.[0] : "0 matches");
    ok("the footer note no longer describes sending anything",
       /Nothing is sent from here/.test(s.text),
       s.text.includes("Nothing is sent from here") ? "present" : "MISSING");

    const btn = s.buttons.find((b) => b.text === "Edit the Team version");
    // The visible label IS the accessible name (no aria-label override), so
    // WCAG 2.5.3 Label-in-Name holds for voice control, and the explanation
    // arrives via the tooltip's aria-describedby.
    ok("the accessible name is the visible label (no aria-label override)",
       btn != null && btn.ariaLabel === null, `aria-label=${btn?.ariaLabel ?? "(none)"}`);

    // BEHAVIOUR UNCHANGED: pressing it still enters Team mode under the glow.
    ok("before pressing, the app is NOT in team mode",
       s.mode !== "team", `data-mode=${s.mode ?? "(none)"}`);
    await page.getByRole("button", { name: "Edit the Team version" }).click();
    const after = await until(page, (x) => x.mode === "team", 30000);
    ok("pressing it switches the app into Team-Curriculum mode (the pink glow)",
       after.ok,
       after.ok ? `data-mode="team" after ${(after.ms / 1000).toFixed(1)}s`
                : `data-mode stayed ${after.state?.mode ?? "(none)"}`);
    await page.screenshot({ path: `${SHOTS}/fork-after-press.png` });
    results.push({ evidence: { before: s, afterMode: after.state?.mode } });
  }

  await browser.close();

  const errs = consoleLog.filter((c) => c.type !== "warning");
  ok("no console errors or page errors", errs.length === 0,
     errs.length ? JSON.stringify(errs.slice(0, 3)) : "0 errors");

  const checks = results.filter((r) => r.name);
  const failed = checks.filter((r) => !r.pass);
  writeFileSync(`${SHOTS}/f0-fork-label.json`,
                JSON.stringify({ base: BASE, results, consoleLog }, null, 2));
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
})().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(1);
});
