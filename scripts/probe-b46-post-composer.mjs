// scripts/probe-b46-post-composer.mjs — §4b live gate for B4.6 (/post half).
//
// Asserts (never just logs) that the Resource Wall's new "Resource" add opens
// the SHARED composer singleton and that nothing renders a second one:
//
//   1. The section add tile paints TWO buttons — Resource + Note.
//   2. Clicking "Resource" yields EXACTLY ONE .cmp-modal and ONE .cmp-scrim.
//   3. A link can be captured and published end-to-end; the composer closes and
//      the new card appears on the wall.
//   4. Re-opening never accumulates a second modal/scrim (host is not remounted).
//   5. The browser console stays clean through the whole flow.
//   6. The tile lays out at 375 / 768 / 1440 with no page-level h-scroll.
//
// Usage: CLAUDE_BYPASS_TOKEN=… node scripts/probe-b46-post-composer.mjs
//        PROBE_BASE defaults to http://localhost:3099

import { chromium } from "playwright";
// One owner for the login hop — see scripts/lib/auth.mjs (the URL carries the
// bypass token, and Playwright puts it in every navigation error it throws).
import { bypassLogin } from "./lib/auth.mjs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const TOKEN = process.env.CLAUDE_BYPASS_TOKEN;
if (!TOKEN) {
  console.error("CLAUDE_BYPASS_TOKEN not set");
  process.exit(1);
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3099";
const OUT = path.resolve("docs/screenshots/b46-post-composer");
await mkdir(OUT, { recursive: true });

const failures = [];
const notes = [];
function check(label, cond, detail = "") {
  if (cond) {
    notes.push(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// Real Chrome, never the system-default browser.
const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });

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
    /* private mode — the probe will surface the /onboarding bounce instead */
  }
});

await bypassLogin(context, {
  base: BASE,
  next: "/post",
  timeout: 240000,
  settleMs: 2000,
});

const page = await context.newPage();
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
});
// Attribute any failing request, so a console "Failed to load resource" can be
// told apart from a real app error. The probe's own synthetic https://example.com
// url is expected to fail enrichment/preview in a sandboxed run.
const badResponses = [];
page.on("response", (r) => {
  if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url().slice(0, 160)}`);
});

await page.goto(`${BASE}/post`, { waitUntil: "domcontentloaded", timeout: 240000 });
check("stayed on /post (first-run gate cleared)", !page.url().includes("/onboarding"), page.url());
// Dev-server hydration is slow here (see the repo's hydrate-audit lesson);
// sample well after it, never before.
// Dev-server hydration here is not a fixed cost — under concurrent-lane compile
// load it has taken >60s. Poll until React has actually attached handlers (the
// wall switcher responds) rather than sampling a fixed wait and measuring SSR
// HTML, which manufactures false "control missing" findings.
const hydrated = await page
  .waitForFunction(
    () => {
      const dd = [...document.querySelectorAll("button")].find((b) =>
        /Lessons \(Mixed\)|This Week|Current Lesson/.test(b.textContent || ""),
      );
      // Read-only hydration signal: React sets aria-expanded on the switcher
      // once it owns the element. Clicking here would fight the real switch
      // below (it toggles the menu) and produced a false negative.
      return dd.hasAttribute("aria-expanded");
    },
    { timeout: 180000, polling: 2000 },
  )
  .then(() => true)
  .catch(() => false);
check("page hydrated (wall switcher responds)", hydrated);
// The default preset is "Today's Lessons", which legitimately resolves to an
// EMPTY wall on a non-school day — no sections, so no add tiles. Switch to a
// week-scoped preset so the probe exercises real sections.
//
// RETRIED, because this repo runs ONE shared dev server: a sibling lane saving
// a file triggers "[Fast Refresh] performing full reload" and the click is lost
// with the page. A single-shot switch here produced a false "no add button"
// failure. We assert the toolbar label actually changed, and re-try.
async function switchToWeekPreset(attempts = 4) {
  for (let i = 0; i < attempts; i += 1) {
    await page
      .locator('button[class*="ddBtn"]')
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(900);
    await page
      .locator('button[class*="popRow"]', { hasText: "This Week" })
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(2500);
    const label = await page
      .locator('button[class*="ddBtn"]')
      .first()
      .textContent()
      .catch(() => "");
    if ((label ?? "").includes("This Week")) return true;
    // Lost to an HMR reload — settle and try again.
    await page.waitForTimeout(4000);
  }
  return false;
}
const switched = await switchToWeekPreset();
check("wall switched to the This Week preset", switched);
const sectionCount = await page.locator("section").count();
check("week preset resolves real sections", sectionCount > 0, `sections=${sectionCount}`);
await page.screenshot({ path: path.join(OUT, "01-wall-1440.png"), fullPage: false });
if (sectionCount === 0) {
  const state = await page.evaluate(() => ({
    wall: document.querySelector('[class*="ddBtn"]')?.textContent?.trim(),
    body: (document.body.innerText || "").slice(0, 200),
  }));
  check("wall state when no sections resolved", false, JSON.stringify(state));
}

// ── 1. The two-way add tile ────────────────────────────────────────────────
const addResourceBtns = page.getByRole("button", { name: "Resource", exact: true });
const addNoteBtns = page.getByRole("button", { name: "Note", exact: true });
const nRes = await addResourceBtns.count();
const nNote = await addNoteBtns.count();
check("add tile renders a Resource button", nRes > 0, `count=${nRes}`);
check("add tile renders a Note button", nNote > 0, `count=${nNote}`);

// ── 2. Open the shared composer ────────────────────────────────────────────
// Every interaction below is non-throwing: on ONE shared dev server an HMR
// reload from a sibling lane can eat a click, and a probe that dies on the
// first miss reports nothing at all. Failures are recorded, not raised.
async function clickAddResource() {
  const btn = page
    .locator('button[class*="addBtn"]:not([disabled])')
    .filter({ hasText: /^Resource$/ })
    .first();
  try {
    await btn.click({ timeout: 20000 });
    return true;
  } catch (e) {
    return false;
  }
}
// A wall Card's root carries data-view + data-kind (Card.tsx), which is a
// stable structural selector — unlike the card's TEXT, which is a title the
// composer DERIVES from the url (an earlier assertion looked for the raw url
// and failed on a card that had rendered correctly).
const CARD = "[data-view][data-kind]";
const cardsBefore = await page.locator(CARD).count();
const opened = await clickAddResource();
check("clicked the section's Resource add", opened);
// ComposerHost lazy-loads ResourceComposer via next/dynamic({ssr:false}), so the
// FIRST open pays a chunk fetch (~24MB unminified in dev). Wait for the dialog,
// never a fixed sleep — that is what made an earlier run report modal=0 on a
// composer that did open.
const composerAppeared = await page
  .waitForSelector(".cmp-modal", { timeout: 120000 })
  .then(() => true)
  .catch(() => false);
check("composer dialog rendered", composerAppeared);

async function singletonCounts() {
  return page.evaluate(() => ({
    modal: document.querySelectorAll(".cmp-modal").length,
    scrim: document.querySelectorAll(".cmp-scrim").length,
  }));
}
let counts = await singletonCounts();
check("exactly one .cmp-modal after open", counts.modal === 1, `modal=${counts.modal}`);
check("exactly one .cmp-scrim after open", counts.scrim === 1, `scrim=${counts.scrim}`);
await page.screenshot({ path: path.join(OUT, "02-composer-open-1440.png") });

// ── 3. Capture a link + publish ────────────────────────────────────────────
// The real flow: the inline URL row is REVEALED by the "Link" capture tool
// (`linkOpen`), then the row's own "Add" captures the url into the staging
// strip, then the header's publish button commits. The input carries
// aria-label="Resource URL" (ResourceComposer.tsx:1823).
const PROBE_URL = "https://example.com/b46-probe-resource";
await page
  .locator(".cmp-modal")
  .getByRole("button", { name: /^Link$/i })
  .first()
  .click({ timeout: 15000 })
  .catch(() => {});
await page.waitForTimeout(800);

const urlInput = page.locator('.cmp-modal input[aria-label="Resource URL"]').first();
const urlRowOpen = (await urlInput.count()) > 0;
check("Link tool reveals the inline URL row", urlRowOpen);

let captured = false;
if (urlRowOpen) {
  await urlInput.fill(PROBE_URL);
  await page
    .locator(".cmp-modal [class*='linkRow']")
    .getByRole("button", { name: /^Add$/i })
    .first()
    .click({ timeout: 15000 })
    .catch(() => {});
  // The strip labels a link by its DERIVED title, not the raw url, so the
  // reliable "something is staged" signal is the publish button enabling
  // (`canAdd`), not a text match.
  captured = await page
    .locator(".cmp-modal button[class*='publishBtn']:not([disabled])")
    .first()
    .waitFor({ state: "visible", timeout: 30000 })
    .then(() => true)
    .catch(() => false);
}
check("url staged (publish button enabled)", captured);
await page.screenshot({ path: path.join(OUT, "03-composer-captured.png") });

let published = false;
if (captured) {
  const publish = page.locator(".cmp-modal button[class*='publishBtn']").first();
  await publish.click({ timeout: 20000 }).catch(() => {});
  // Commit closes the dialog; wait for the teardown rather than sleeping.
  published = await page
    .waitForSelector(".cmp-modal", { state: "detached", timeout: 60000 })
    .then(() => true)
    .catch(() => false);
}
check("publish was clicked", published);

counts = await singletonCounts();
check("composer closed after publish (0 modals)", counts.modal === 0, `modal=${counts.modal}`);
check("scrim torn down with it", counts.scrim === 0, `scrim=${counts.scrim}`);
await page.screenshot({ path: path.join(OUT, "04-after-publish-1440.png") });

// The preset wall is a LIVE projection, so the committed resource must appear
// without any wall-side mirroring. Poll: the re-projection lands on the store
// update, but the dev server can be slow to re-render under load.
const grew = await page
  .waitForFunction(
    (args) => document.querySelectorAll(args.sel).length > args.before,
    { sel: CARD, before: cardsBefore },
    { timeout: 60000, polling: 1000 },
  )
  .then(() => true)
  .catch(() => false);
const cardsAfter = await page.locator(CARD).count();
check(
  "the published resource appears on the live preset wall",
  grew,
  `cards ${cardsBefore} -> ${cardsAfter}`,
);

// ── 4. Re-open — the host must not accumulate ──────────────────────────────
const reopened = await clickAddResource();
check("re-opened the composer from the same tile", reopened);
await page.waitForSelector(".cmp-modal", { timeout: 60000 }).catch(() => {});
counts = await singletonCounts();
check("still exactly one .cmp-modal on re-open", counts.modal === 1, `modal=${counts.modal}`);
check("still exactly one .cmp-scrim on re-open", counts.scrim === 1, `scrim=${counts.scrim}`);
await page.keyboard.press("Escape");
await page.waitForSelector(".cmp-modal", { state: "detached", timeout: 30000 }).catch(() => {});
counts = await singletonCounts();
check("Escape closes the singleton", counts.modal === 0, `modal=${counts.modal}`);

// ── 6. Responsive ──────────────────────────────────────────────────────────
for (const [name, width] of [["375", 375], ["768", 768], ["1440", 1440]]) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(2500);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check(`no page h-scroll at ${name}px`, overflow <= 0, `overflow=${overflow}px`);
  await page.screenshot({ path: path.join(OUT, `05-wall-${name}.png`), fullPage: false });
}

// ── 5. Console ─────────────────────────────────────────────────────────────
// App-authored console errors must be zero. One class of message needs care:
// staging a link makes the app call /api/og-preview to derive the card's title,
// and with no outbound network that returns 502 for example.com. The browser
// then logs a bare "Failed to load resource: … 502" carrying NO url, so a text
// filter would either hide every such error (dishonest) or flag the fixture.
//
// So the exemption is EVIDENCE-GATED: the bare message is excused only when
// every failing request observed this run is attributable to the probe's own
// synthetic url. If anything unexplained fails, the exemption lapses and this
// check fails — the probe cannot manufacture a pass for a failure it did not
// account for.
const FIXTURE = /example\.com|b46-probe-resource/i;
const allBadAttributed =
  badResponses.length > 0 && badResponses.every((r) => FIXTURE.test(r));
const appErrors = consoleErrors.filter((t) => {
  if (FIXTURE.test(t)) return false;
  if (allBadAttributed && /Failed to load resource/i.test(t)) return false;
  return true;
});
check(
  "no app-authored console errors through the flow",
  appErrors.length === 0,
  appErrors.slice(0, 5).join(" | "),
);
check(
  "every failing request is attributable to the probe fixture url",
  badResponses.every((r) => FIXTURE.test(r)),
  badResponses.slice(0, 6).join(" | ") || "(none)",
);

console.log("\n".concat(notes.join("\n")));
if (failures.length) {
  console.log("\n" + failures.join("\n"));
  console.log(`\nRESULT: ${failures.length} FAILED, ${notes.length} passed`);
  process.exit(1);
}
console.log(`\nRESULT: all ${notes.length} assertions passed`);
await browser.close();
