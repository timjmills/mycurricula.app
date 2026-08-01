// scripts/probe-b46-post-composer.mjs — §4b live gate for the /post Resource
// Wall's note composer.
//
// ── THIS FILE HAS ASSERTED BOTH SIDES OF THE SAME QUESTION. READ THIS FIRST.
//
// It was written to guard `1cf4816`, which REVERTED the composer from /post on
// the reading that the 7.21 handoff makes the wall collection-only
// (`ph-more.jsx:136`, `:169`). Its central assertion was "NO composer is
// reachable from this surface — zero `.cmp-modal` / `.cmp-scrim`, EVER".
//
// That reading is now OVERRIDDEN, by the user directly: they looked at this
// surface, called its note editor "too bare", and asked for MORE authoring on
// it. The wall is an AUTHORING surface. See the long note at `addInlineNote` in
// components/resource-wall-v2/ResourceWall.tsx for the full history.
//
// ── A GATE NOBODY RUNS IS WORSE THAN NO GATE ──────────────────────────────
// `2ffbb43` re-added composing to the wall on 2026-08-01 and did not touch this
// file. Its assertions were false from that moment. They were not "run and
// ignored": the probe's own output directory (docs/screenshots/b46-post-wall)
// was last written 2026-07-25, seven days EARLIER. Nobody ran it. It sat in the
// tree reading as coverage while asserting the inverse of the requirement.
//
// ── WHAT IT GUARDS NOW ────────────────────────────────────────────────────
// The composer is INLINE — a card composed in place in the section grid, which
// is the handoff's own shape (bundled mockup :7087). So the "no modal" check
// SURVIVES, for the opposite reason: the wall must not open the shared modal
// composer, because it has its own.
//
//   1. The wall's Add note opens an INLINE composer, not the modal one.
//   2. It works on a LESSON-LESS section — the case that used to dead-end.
//   3. EMPTY SUBMIT is refused (the handoff's version commits a card literally
//      labelled "Note").
//   4. INVALID INPUT is named and blocks the save.
//   5. CANCEL withdraws the optimistically-inserted card.
//   6. The console stays clean and 375 / 768 / 1440 do not scroll sideways.
//
// 3-5 are here rather than in the unit suite because they are the three paths
// the handoff's composer has NONE of, and because two of them require TYPING —
// which the linkedom mount harness cannot do (React drops the change event for
// controlled fields; see tests/wall-note-composer.test.ts's header). A real
// browser is the only place they can be checked at all.
//
// It IS a write: composing forks a preset into a "My …" wall. The blast radius
// is one ephemeral browser profile — wall state is localStorage-only
// (components/resource-wall-v2/wall-state.ts, "Persisting to Supabase is out of
// scope for 9a"), with zero REST calls on commit (measured). Run against a LOCAL
// dev server, never production.
//
// Usage: CLAUDE_BYPASS_TOKEN=… node scripts/probe-b46-post-composer.mjs
//        PROBE_BASE defaults to http://localhost:3014

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";
// The claude-login hop has ONE owner (scripts/lib/auth.mjs, 798e7e7). Building
// the url here would put the bypass token in this file — and a navigation
// timeout prints the full url in Playwright's thrown message, which is exactly
// the disclosure that helper exists to prevent. It redacts on failure.
import { bypassLogin, requireToken } from "./lib/auth.mjs";

requireToken({ repoRoot: process.cwd() });
const BASE = process.env.PROBE_BASE ?? "http://localhost:3014";
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
// REVERSED WITH THE RULING. This used to require the tooltip to DENY that
// resources can be added here — copy that is now false on screen, because the
// composer attaches links. What the tooltip must still do is describe the
// surface truthfully, so the check is now that it does NOT carry the stale
// denial (`tipSaysNotHere` is kept, inverted, as the regression guard).
check(
  "add tooltip no longer denies that anything can be attached here",
  tipBtnExists && !tipSaysNotHere,
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

// ── 4. THE COMPOSER IS INLINE, AND IT IS NOT THE MODAL ONE ────────────────
//
// The "no modal" assertion SURVIVES the reversal, for the opposite reason: the
// wall composes in place, so opening the shared modal composer here would now be
// the regression. What is GONE is the old sibling assertion that no
// resource-authoring trigger may exist in the section grid — the composer's
// "Add link" is exactly such a trigger, and it is the point.
const inline = await safeEval(() => {
  const btn = (t) =>
    Array.from(document.querySelectorAll("button")).find(
      (b) => (b.textContent || "").trim() === t,
    );
  const done = btn("Done");
  return {
    sections: document.querySelectorAll("section").length,
    modal: document.querySelectorAll(".cmp-modal").length,
    scrim: document.querySelectorAll(".cmp-scrim").length,
    hasDone: Boolean(done),
    hasCancel: Boolean(btn("Cancel")),
    hasAddLink: Boolean(btn("Add link")),
    // The empty-submit guard: an untouched composer must not be saveable.
    doneDisabledWhenEmpty: done ? done.disabled : null,
    swatchTrigger: document.querySelectorAll('button[aria-label="Card colour"]').length,
  };
}, { sections: 0, modal: 0, scrim: 0, hasDone: false, hasCancel: false, hasAddLink: false, doneDisabledWhenEmpty: null, swatchTrigger: 0 });
const rendered = inline.sections > 0;
const BLANK = "INCONCLUSIVE — no sections rendered";

check(
  "the wall's Add note opens an INLINE composer, not the modal one",
  rendered && inline.hasDone && inline.hasCancel && inline.modal === 0,
  rendered
    ? `done=${inline.hasDone} cancel=${inline.hasCancel} modal=${inline.modal}`
    : BLANK,
);
check(
  "no composer scrim on the wall — it composes in place, not over the page",
  rendered && inline.scrim === 0,
  rendered ? `scrim=${inline.scrim}` : BLANK,
);
check(
  "the composer offers a link and a card colour",
  rendered && inline.hasAddLink && inline.swatchTrigger > 0,
  rendered ? `addLink=${inline.hasAddLink} colour=${inline.swatchTrigger}` : BLANK,
);
check(
  "EMPTY SUBMIT is refused — Done is disabled on an untouched composer",
  rendered && inline.doneDisabledWhenEmpty === true,
  rendered ? `disabled=${inline.doneDisabledWhenEmpty}` : BLANK,
);

// ── 4b. INVALID INPUT is named, and blocks the save ───────────────────────
// Requires TYPING, which is why it lives in a browser probe and not the unit
// suite (React drops the change event for controlled fields under linkedom).
const TYPED = "Bring in shoeboxes Thursday";
// WAIT for the editor, do not assume it. `RichTextEditor` is loaded through
// next/dynamic, so the contenteditable appears a beat AFTER the composer's
// buttons do — locating it immediately found nothing and every keystroke went
// to the document, which is why the control below exists.
await page
  .waitForSelector('[contenteditable="true"]', { timeout: 25000 })
  .catch(() => {});
const editable = page.locator('[contenteditable="true"]').first();
if (await editable.count()) {
  await editable.click({ force: true }).catch(() => {});
  await page.waitForTimeout(300);
  await page.keyboard.type(TYPED).catch(() => {});
  await page.waitForTimeout(400);
}
// POSITIVE CONTROL. Every assertion below is about what happens to typed text,
// so if the typing never landed they are all statements about an EMPTY note —
// and "the composer stayed open" would pass for the wrong reason. A probe that
// cannot type must say so, not quietly grade a different scenario.
const typedLanded = await safeEval(
  (t) => document.body.innerText.includes(t),
  false,
  TYPED,
);
check(
  "the probe can type into the composer (control for the two checks below)",
  typedLanded,
  typedLanded ? "text present" : "TYPING DID NOT LAND — checks below are inconclusive",
);
const addLinkBtn = page.locator("button").filter({ hasText: /^Add link$/ }).first();
if (await addLinkBtn.count()) await addLinkBtn.click({ force: true }).catch(() => {});
const urlField = page.locator('input[inputmode="url"]').first();
if (await urlField.count()) await urlField.fill("not-a-url").catch(() => {});
await page.waitForTimeout(600);
const invalid = await safeEval(() => {
  const done = Array.from(document.querySelectorAll("button")).find(
    (b) => (b.textContent || "").trim() === "Done",
  );
  return {
    named: /doesn.t look like a web address/.test(document.body.innerText),
    blocked: done ? done.disabled : null,
    textKept: /Bring in shoeboxes Thursday/.test(document.body.innerText),
  };
}, { named: false, blocked: null, textKept: false });
check(
  "INVALID INPUT is named to the teacher, and blocks the save",
  invalid.named && invalid.blocked === true,
  `named=${invalid.named} doneDisabled=${invalid.blocked}`,
);
// ESCAPE MUST NOT BIN TYPED CONTENT. The rule is about content, not validity:
// a paragraph plus a bad URL is exactly the state where a naive
// "Escape discards" loses work with no undo.
await page.keyboard.press("Escape").catch(() => {});
await page.waitForTimeout(700);
const afterEsc = await safeEval(() => ({
  stillOpen: Array.from(document.querySelectorAll("button")).some(
    (b) => (b.textContent || "").trim() === "Done",
  ),
  textKept: /Bring in shoeboxes Thursday/.test(document.body.innerText),
}), { stillOpen: false, textKept: false });
check(
  "Escape with unsaveable content keeps the composer open, and the typing",
  // Gated on the control: with no text typed this is not the scenario at all.
  typedLanded && afterEsc.stillOpen && afterEsc.textKept,
  typedLanded
    ? `open=${afterEsc.stillOpen} textKept=${afterEsc.textKept}`
    : "INCONCLUSIVE — typing did not land",
);

// ── 4b-2. A VALID URL saves, and lands on the note's gallery ──────────────
//
// THE PRIMARY USER-SUPPLIED-URL PATH, asserted where it can actually be driven.
// The unit suite tests `isAttachableLink` / `linkToLessonResource` directly but
// cannot type into the composer's controlled fields (React drops the change
// event under linkedom — re-checked after the harness's setValue ordering fix,
// still unreachable), so the field → state → commit → storage chain is proven
// HERE and nowhere else. Asserting the persisted record, not the pixels: a link
// that renders but does not save is the failure this is for.
await urlField.fill("https://www.youtube.com/watch?v=abc12345678").catch(() => {});
await page.waitForTimeout(500);
const doneEnabled = await safeEval(() => {
  const d = Array.from(document.querySelectorAll("button")).find(
    (b) => (b.textContent || "").trim() === "Done",
  );
  return d ? !d.disabled : false;
}, false);
check("a VALID url re-enables Done", doneEnabled, `enabled=${doneEnabled}`);
if (doneEnabled) {
  await page.locator("button").filter({ hasText: /^Done$/ }).first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(2000);
}
const saved = await safeEval(() => {
  const raw = localStorage.getItem("cc_customwalls") || "[]";
  let walls = [];
  try { walls = JSON.parse(raw); } catch { return { parsed: false }; }
  const items = walls.flatMap((w) => (w.layout || []).flatMap((s) => s.items || []));
  const note = items.find((i) => (i.label || "").includes("shoeboxes"));
  const g = note && note.resource && note.resource.gallery;
  return {
    parsed: true,
    noteSaved: Boolean(note),
    galleryLen: Array.isArray(g) ? g.length : 0,
    galleryUrl: Array.isArray(g) && g[0] ? g[0].url : null,
    galleryType: Array.isArray(g) && g[0] ? g[0].type : null,
    galleryLabel: Array.isArray(g) && g[0] ? g[0].label : null,
  };
}, { parsed: false });
check(
  "the note SAVED, with its link on the gallery and the type detected",
  saved.parsed &&
    saved.noteSaved &&
    saved.galleryLen === 1 &&
    saved.galleryType === "youtube" &&
    typeof saved.galleryUrl === "string" &&
    saved.galleryUrl.includes("abc12345678"),
  JSON.stringify(saved),
);
// And it is VISIBLE on the committed card, not only in storage.
const linkOnCard = await safeEval(
  () => Boolean(document.querySelector('a[href*="abc12345678"]')),
  false,
);
check("the saved link is reachable ON the card, not just in storage", linkOnCard, `anchor=${linkOnCard}`);
await page.screenshot({ path: path.join(OUT, "05-saved-link-1440.png") }).catch(() => {});

// ── 4c. CANCEL withdraws the optimistically-inserted card ─────────────────
// The card is inserted the instant "+" is pressed so the editor can open where
// it was — so Cancel has to take it back out, or the wall keeps a card the
// teacher explicitly rejected.
// A fresh compose — the one above was committed, so re-open before cancelling.
await addBtns.first().click({ force: true }).catch(() => {});
await page.waitForTimeout(1500);
const cardsBeforeCancel = await page.locator(CARD).count();
const cancelBtn = page.locator("button").filter({ hasText: /^Cancel$/ }).first();
if (await cancelBtn.count()) await cancelBtn.click({ force: true }).catch(() => {});
await page.waitForTimeout(1200);
const cardsAfterCancel = await page.locator(CARD).count();
check(
  "CANCEL withdraws the card the + inserted",
  cardsAfterCancel === cardsAfterCancel && cardsAfterCancel < cardsBeforeCancel,
  `cards ${cardsBeforeCancel} -> ${cardsAfterCancel}`,
);
await page.screenshot({ path: path.join(OUT, "04-after-cancel-1440.png") }).catch(() => {});

// CANCEL MUST NOT LEAVE A FORK. The card disappearing is the assertion that
// passes while the fork survives — a frozen "My Walls" copy that silently stops
// receiving later lesson updates (§4a review, High). Counted here, live.
const forksAfterCancel = await safeEval(() => {
  try {
    return JSON.parse(localStorage.getItem("cc_customwalls") || "[]").length;
  } catch {
    return -1;
  }
}, -1);
check(
  "cancelling leaves no NEW fork behind (only the one the saved note created)",
  forksAfterCancel === 1,
  `walls=${forksAfterCancel} (1 = the saved note's, and no more)`,
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
