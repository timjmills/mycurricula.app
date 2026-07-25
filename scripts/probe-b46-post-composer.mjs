// scripts/probe-b46-post-composer.mjs — §4b live gate for the /post Resource
// Wall's add affordance (B4.6).
//
// WHAT THIS PROBE IS FOR, AND WHY IT CHANGED SHAPE.
//
// An earlier revision of this file asserted that the wall's per-section Add
// opened the shared resource composer. That wiring was built, gated, and then
// REVERTED: the 7.21 design handoff specifies the wall as a COLLECTION surface
// — resources are authored in a lesson's editor and collect onto the wall
// (`ph-more.jsx:136`, `:169`), and the handoff lists no composer callsite on
// this surface. So the composer assertions are gone, and what remains is the
// thing that IS specified:
//
//   1. The wall's per-section Add is note-only, and its label says so.
//   2. Its tooltip does not promise resource-authoring the surface cannot do.
//   3. Adding a note still works end-to-end (the pre-existing wall-local path).
//   4. NO composer is reachable from this surface — zero `.cmp-modal` /
//      `.cmp-scrim`, ever. This is the regression guard for the revert.
//   5. The browser console stays clean, and 375 / 768 / 1440 do not
//      horizontally scroll.
//
// OWNERSHIP OF THE /post GATE, and why this probe MUTATES.
//
// `scripts/probe-4b-consolidated.mjs` no longer delegates here — it hand-rolls a
// READ-ONLY 4.7 (its own comment explains why: it must not click anything that
// writes). That is the right split, so this file is no longer load-bearing for
// that probe and the two do not duplicate: the consolidated pass owns the
// read-only seam check, and THIS probe owns the write path.
//
// It IS a write: clicking "Add note" runs `addCard` → `withFork` →
// `ensurePersonal()`, which FORKS a preset into a "My …" wall. The blast radius
// is one browser profile — `components/resource-wall-v2/wall-state.ts` persists
// to localStorage only, with zero server calls ("Persisting to Supabase is out
// of scope for 9a"), and Playwright's context is ephemeral. So it cannot touch a
// school's data. It WOULD leave a forked wall behind in a real profile, so:
// run this against a LOCAL dev server, never against production.
//
// Usage: CLAUDE_BYPASS_TOKEN=… node scripts/probe-b46-post-composer.mjs
//        PROBE_BASE defaults to http://localhost:3099

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
// The claude-login hop has ONE owner (scripts/lib/auth.mjs, 798e7e7). Building
// the url here would put the bypass token in this file — and a navigation
// timeout prints the full url in Playwright's thrown message, which is exactly
// the disclosure that helper exists to prevent. It redacts on failure.
import { bypassLogin, requireToken } from "./lib/auth.mjs";

requireToken({ repoRoot: process.cwd() });
const BASE = process.env.PROBE_BASE ?? "http://localhost:3099";
const OUT = path.resolve("docs/screenshots/b46-post-wall");
await mkdir(OUT, { recursive: true });

// Every observation goes through this. An unguarded `page.evaluate` throws
// "Execution context was destroyed" the moment a sibling lane's save triggers an
// HMR reload — which kills the run with ZERO output and leaks the Chrome
// process. On a shared dev server that is the single most likely failure, and a
// probe that dies silently is worse than one that reports a red line. On a
// destroyed context it returns the caller's fallback, so the affected assertion
// reports INCONCLUSIVE rather than taking the whole run down.
async function safeEval(fn, fallback, arg) {
  try {
    return arg === undefined ? await page.evaluate(fn) : await page.evaluate(fn, arg);
  } catch {
    return fallback;
  }
}

const failures = [];
const notes = [];
function check(label, cond, detail = "") {
  (cond ? notes : failures).push(
    `${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
}

// Real Chrome, never the system-default browser.
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
});

// Clear the first-run onboarding gate. Locally NEXT_PUBLIC_PLANNER_USE_SUPABASE
// is unset, so isPlannerSupabaseConfigured() is false and useFirstRunRedirect
// takes the PROTOTYPE path — governed purely by this per-device localStorage
// flag. Seeding it is a browser-local setting; it touches no database.
await context.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "mycurricula:onboarding",
      JSON.stringify({ stepIndex: 0, finished: true }),
    );
  } catch {
    /* private mode — the probe surfaces the /onboarding bounce instead */
  }
});

// retries default to 1 (fail fast) — a wedged shared dev server should surface
// in minutes, not be mistaken for a defect for twelve of them.
await bypassLogin(context, { base: BASE, next: "/post", timeout: 240000 });

const page = await context.newPage();
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
});
const badResponses = [];
page.on("response", (r) => {
  if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url().slice(0, 160)}`);
});

await page.goto(`${BASE}/post`, {
  waitUntil: "domcontentloaded",
  timeout: 240000,
});
check(
  "stayed on /post (first-run gate cleared)",
  !page.url().includes("/onboarding"),
  page.url(),
);

// Hydration here is NOT a fixed cost — under concurrent-lane compile load it has
// taken >60s. Poll a READ-ONLY signal (React sets aria-expanded on the wall
// switcher once it owns the element). A click-based poll fights the real switch
// below and produced a false negative; a fixed sleep measures SSR HTML and
// manufactures false "control missing" findings.
const hydrated = await page
  .waitForFunction(
    () => {
      const dd = [...document.querySelectorAll("button")].find((b) =>
        /Lessons \(Mixed\)|This Week|Current Lesson/.test(b.textContent || ""),
      );
      return !!dd && dd.hasAttribute("aria-expanded");
    },
    { timeout: 180000, polling: 2000 },
  )
  .then(() => true)
  .catch(() => false);
check("page hydrated (wall switcher owns aria-expanded)", hydrated);

// The default preset is "Today's Lessons", which legitimately resolves to an
// EMPTY wall on a non-school day — no sections, so no add tiles. Switch to a
// week-scoped preset so the probe exercises real sections.
//
// RETRIED, because this repo runs ONE shared dev server: a sibling lane saving a
// file triggers "[Fast Refresh] performing full reload" and the click is lost
// with the page. A single-shot switch produced a false "no add button" failure,
// and one run reset the wall mid-flow. Assert the label actually changed.
//
// NOTE `_ddBtn__`, not `ddBtn` — a `class*="ddBtn"` selector ALSO matches
// `addBtn` (substring), which is a strict-mode violation.
async function switchToWeekPreset(attempts = 4) {
  for (let i = 0; i < attempts; i += 1) {
    await page.locator('button[class*="_ddBtn__"]').first().click().catch(() => {});
    await page.waitForTimeout(900);
    await page
      .locator('button[class*="popRow"]', { hasText: "This Week" })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(2500);
    const label = await page
      .locator('button[class*="_ddBtn__"]')
      .first()
      .textContent()
      .catch(() => "");
    if ((label ?? "").includes("This Week")) return true;
    await page.waitForTimeout(4000); // lost to an HMR reload — settle, retry
  }
  return false;
}
check("wall switched to the This Week preset", await switchToWeekPreset());
const sectionCount = await page.locator("section").count();
check("week preset resolves real sections", sectionCount > 0, `sections=${sectionCount}`);
await page.screenshot({ path: path.join(OUT, "01-wall-1440.png") }).catch(() => {});

// ── 1+2. The add affordance is note-only, and says so ──────────────────────
// `addCard` is the class the RESTORED control renders with (Section.tsx:371).
// An earlier revision of this probe looked for `addBtn` — a class this lane
// introduced and then reverted — so it matched nothing and reported the note
// path broken. Selector drift after a revert reads exactly like a real defect.
const addBtns = page
  .locator('button[class*="addCard"]')
  .filter({ hasText: /^Add note$/ });
const nAdd = await addBtns.count();
check("section add button is labelled 'Add note'", nAdd > 0, `count=${nAdd}`);

// SCOPED to <section>, and requires ZERO (§4a Medium). Counting page-wide and
// allowing one was unsound: the one it allowed was the wall TOOLBAR's own "Add",
// so if the toolbar button were renamed while a stale per-section "Add" came
// back, the total would still be 1 and this would pass the regression.
//
// The "page isn't blank" gate is read INSIDE the same evaluate as the
// observation (§4a Medium, round 5). It used to reuse `sectionCount` sampled
// tens of seconds earlier — so if the wall blanked AFTER that sample (the exact
// hazard this probe has hit three times), the gate still said >0 while the DOM
// was empty, and the absence assertions passed over a blank page. That is the
// vacuity the gate exists to prevent, with one variable of indirection.
const addProbe = await safeEval(
  () => ({
    sections: document.querySelectorAll("section").length,
    staleAdds: [...document.querySelectorAll("section button")].filter(
      (b) => (b.textContent || "").trim() === "Add",
    ).length,
  }),
  { sections: 0, staleAdds: 0 },
);
check(
  "no bare 'Add' button remains inside the section grid",
  addProbe.sections > 0 && addProbe.staleAdds === 0,
  addProbe.sections > 0
    ? `bare-Add buttons in sections=${addProbe.staleAdds}`
    : "INCONCLUSIVE — no sections rendered",
);

// POSITIVE assertion, not a blacklist (§4a Medium, round 5). Two prior bugs:
// it was satisfied by `tip === null`, and Tooltip drops the native `title=`
// entirely when the id is dismissed or the global tips switch is off
// (Tooltip.tsx:288, :453-455) and `rw-add-card` passes no `required` — so a
// dismissed tooltip yielded `title=null` and PASSED having verified nothing.
// Its regex was also a one-phrase blacklist that only caught the OLD string;
// the copy e0eab58 actually shipped would have sailed through. This is the only
// assertion covering the tooltip copy, which is half the substance of the
// change, so it now demands the title exists and says the right things.
const tipBtn = page
  .locator('button[class*="addCard"]')
  .filter({ hasText: /^Add note$/ })
  .first();
const tipBtnExists = (await tipBtn.count()) > 0;
const tip = tipBtnExists ? await tipBtn.getAttribute("title").catch(() => null) : null;
const tipSaysNotHere = typeof tip === "string" && /added here/i.test(tip);
const tipWarnsAboutFork =
  typeof tip === "string" && /stops picking up later lesson changes/i.test(tip);
// Any authoring verb paired with the resource noun is a promise this surface
// cannot keep — broader than the single phrase the old check looked for.
const tipPromisesAuthoring =
  typeof tip === "string" &&
  /(add|attach|create|upload|new)[^.]{0,24}resource/i.test(tip);
check(
  "add tooltip states resources are NOT authored here",
  tipBtnExists && tipSaysNotHere && !tipPromisesAuthoring,
  tipBtnExists ? `title=${JSON.stringify(tip)}` : "add-note button not present",
);
check(
  "add tooltip warns that adding a note forks the wall (it stops updating)",
  tipWarnsAboutFork,
  tipBtnExists ? `title=${JSON.stringify(tip)}` : "add-note button not present",
);

// ── 3. The note path still works ───────────────────────────────────────────
const CARD = "[data-view][data-kind]";
const cardsBefore = await page.locator(CARD).count();
await addBtns.first().click({ timeout: 20000 }).catch(() => {});
const noteAdded = await page
  .waitForFunction(
    (args) => document.querySelectorAll(args.sel).length > args.before,
    { sel: CARD, before: cardsBefore },
    { timeout: 30000, polling: 500 },
  )
  .then(() => true)
  .catch(() => false);
const cardsAfter = await page.locator(CARD).count();
check(
  "adding a note appends a card to the section",
  noteAdded,
  `cards ${cardsBefore} -> ${cardsAfter}`,
);
await page.screenshot({ path: path.join(OUT, "02-note-added-1440.png") }).catch(() => {});

// ── 4. REGRESSION GUARD — no composer is reachable from this surface ───────
//
// TWO assertions, because "nothing is mounted right now" is far too weak on its
// own (§4a Medium): re-adding a Resource button beside Add-note would still
// leave zero modals mounted until someone pressed it, so that check alone would
// happily pass the very regression it exists to catch. First assert no
// resource-AUTHORING trigger exists inside the section grid at all; only then
// assert nothing is mounted.
//
// `guard.triggers` deliberately excludes the wall TOOLBAR (which legitimately
// has its own "Add" for sections / new walls) by scoping to <section>, and
// excludes the card action row's "Send to a teaching board" — that is board
// placement of an EXISTING resource, not authoring.
//
// ONE evaluate for the gate AND both observations, so the "page isn't blank"
// check can never be read from a stale sample taken seconds earlier.
const guard = await safeEval(() => {
  const triggers = [];
  for (const sec of document.querySelectorAll("section")) {
    for (const b of sec.querySelectorAll("button")) {
      const text = (b.textContent || "").trim();
      const label = `${text} ${b.getAttribute("aria-label") ?? ""} ${b.getAttribute("title") ?? ""}`;
      // TWO shapes, because the regression this guards against was labelled
      // exactly "Resource" — a verb-then-noun regex alone would have missed the
      // very button it exists to catch (§4a Medium). "Add note" and the card's
      // board-send ("Send X to a teaching board") must NOT match either shape.
      const bareResource = /^resources?$/i.test(text);
      const authoringVerb =
        /(add|new|attach|upload|create)[^.]{0,24}resource/i.test(label);
      if (bareResource || authoringVerb) triggers.push(text || label.trim().slice(0, 60));
    }
  }
  return {
    sections: document.querySelectorAll("section").length,
    triggers,
    modal: document.querySelectorAll(".cmp-modal").length,
    scrim: document.querySelectorAll(".cmp-scrim").length,
  };
}, { sections: 0, triggers: [], modal: 0, scrim: 0 });
const rendered = guard.sections > 0;
const BLANK = "INCONCLUSIVE — no sections rendered";
check(
  "no resource-authoring trigger exists in the wall's section grid",
  rendered && guard.triggers.length === 0,
  rendered ? guard.triggers.join(" | ") || "(none)" : BLANK,
);
check(
  "no composer modal on the wall (collection-only surface)",
  rendered && guard.modal === 0,
  rendered ? `modal=${guard.modal}` : BLANK,
);
check(
  // Gated like its sibling (§4a Medium): ungated, this passed on a blank page,
  // a bounced login, or a 500 — the three states it most needs to catch.
  "no composer scrim on the wall",
  rendered && guard.scrim === 0,
  rendered ? `scrim=${guard.scrim}` : BLANK,
);

// ── 5. Responsive ──────────────────────────────────────────────────────────
for (const [name, width] of [["375", 375], ["768", 768], ["1440", 1440]]) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(2500);
  // Fallback is null, NOT a number. A numeric fallback of -1 satisfied
  // `overflow <= 0` and passed this assertion without measuring anything — the
  // 1440 tier did exactly that on one run when an HMR reload destroyed the
  // context. A fallback must never be a value that SATISFIES the check.
  const overflow = await safeEval(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    null,
  );
  check(
    `no page h-scroll at ${name}px`,
    typeof overflow === "number" && overflow <= 0,
    overflow === null ? "INCONCLUSIVE — context destroyed mid-measure" : `overflow=${overflow}px`,
  );
  await page.screenshot({ path: path.join(OUT, `03-wall-${name}.png`) }).catch(() => {});
}

// ── Console ────────────────────────────────────────────────────────────────
// No fixture urls are used by this revision, so nothing is exempt: every
// console error and every failing request counts.
check(
  "no console errors through the flow",
  consoleErrors.length === 0,
  consoleErrors.slice(0, 5).join(" | "),
);
check(
  "no failing requests through the flow",
  badResponses.length === 0,
  badResponses.slice(0, 6).join(" | ") || "(none)",
);

console.log("\n".concat(notes.join("\n")));
if (failures.length) {
  console.log("\n" + failures.join("\n"));
  console.log(`\nRESULT: ${failures.length} FAILED, ${notes.length} passed`);
  await browser.close().catch(() => {});
  process.exit(1);
}
console.log(`\nRESULT: all ${notes.length} assertions passed`);
await browser.close().catch(() => {});
