// probe-any-pointer.mjs — §4b evidence for the touch-target guard widening
// (commits beeae3e "cat B" + d714a06 "cat C").
//
// WHAT THIS HAS TO PROVE, AND WHY THE OBVIOUS PROBE PROVES NOTHING
//
// The defect: `@media (pointer: coarse)` asks about the PRIMARY pointer. A
// touch laptop, or an iPad with a trackpad, reports `pointer: fine`, so the
// 44px inflation never fired even with a finger on the glass. The fix widens
// the guard to `any-pointer: coarse`, which matches when ANY pointer is coarse.
//
// So the ONLY environment that can test this is a genuine hybrid:
//
//     pointer: fine   AND   any-pointer: coarse   AND   width > 900px
//
// Getting there is the hard part, and three obvious routes were MEASURED not to
// work (see the capability table below). They all emulate a PHONE, where both
// `pointer` and `any-pointer` report coarse — and under a phone the OLD guard
// matches too, so the probe would pass identically before and after the fix and
// prove nothing at all:
//
//   route                                          pointer   any-coarse  hover
//   ── Playwright `hasTouch: true`                  coarse    true        false  ✗ phone
//   ── CDP Emulation.setTouchEmulationEnabled       coarse    true        false  ✗ phone
//   ── CDP Emulation.setEmulatedMedia {pointer}     fine      FALSE       true   ✗ ignored
//   ── --blink-settings=availablePointerTypes=6…    fine      true        true   ✓ HYBRID
//
// Chrome silently drops `pointer` / `any-pointer` overrides passed to
// `Emulation.setEmulatedMedia` — it accepts the call and changes nothing, which
// is the most dangerous of the four because it looks like it worked.
//
// So this probe sets Blink's pointer-capability settings at launch:
// availablePointerTypes = COARSE|FINE (2|4 = 6), primaryPointerType = FINE (4),
// hover available and primary. That is a machine with BOTH a mouse and a
// touchscreen — a touch laptop, exactly the population the fix is for.
// Gate 1 asserts the tri-condition and ABORTS if it does not hold, because
// every later measurement is meaningless without it.
//
// Do NOT add touch emulation on top: CDP touch emulation OVERRIDES these
// settings and collapses the profile back to a phone (measured).
//
// Because the capability is a LAUNCH flag, the fine-pointer control in Gate 6
// needs its own browser instance rather than a per-page toggle.
//
// Gate 2 is the counterfactual: under this exact emulation the pre-fix media
// text must NOT match. That is what makes this a regression test rather than a
// screenshot — it demonstrates the bug existed and is now closed.
//
// MEASUREMENT RULES (each one is a trap this repo has already paid for)
//   • Hit areas are probed with document.elementFromPoint, never
//     getComputedStyle. A correctly-declared 44px ::before can still be clipped
//     by an ancestor — a CSS read cannot see that, and a 44px rule measured
//     36.6px here once because of it.
//   • Disabled controls are EXCLUDED. Tooltip wraps a disabled child in an
//     event-catching span by design, so it hit-tests at ~1px and reads as a
//     catastrophic failure that isn't one (WCAG 2.5.5 exempts them anyway).
//   • The synthetic arm is load-bearing. The on-page arm can match zero
//     elements depending on what has rendered and then pass VACUOUSLY. The
//     synthetic pair mounts real hashed class names inside a real `.cp-root`,
//     so it exercises the real cascade — including `.cp-root button {padding:0}`,
//     which silently strips single-class module padding.
//
// Real Chrome only (never the system-default Edge).
//
// USAGE: node scripts/probe-any-pointer.mjs [--base http://localhost:3099]

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { bypassLogin, redact } from "./lib/auth.mjs";

const BASE =
  (process.argv.includes("--base") && process.argv[process.argv.indexOf("--base") + 1]) ||
  "http://localhost:3099";

/** Media text as it appeared BEFORE the fix — the counterfactual. */
const PRE_FIX_B = "(pointer: coarse)";
const PRE_FIX_C = "(pointer: coarse), (max-width: 900px)";
/** Media text as it appears AFTER the fix. */
const POST_FIX_B_CHROME = "(any-pointer: coarse)";
const POST_FIX_C = "(any-pointer: coarse), (max-width: 900px)";
/** Category A as it stands, and as it WOULD have read had it been widened. */
const CAT_A_ASIS = "(hover: none), (pointer: coarse)";
const CAT_A_IF_WIDENED = "(hover: none), (any-pointer: coarse)";

/**
 * Blink pointer/hover capability bits (ui/base/pointer/pointer_device.h):
 *   PointerType NONE=1 COARSE=2 FINE=4 · HoverType NONE=1 HOVER=2
 * COARSE|FINE = 6 available, FINE primary → mouse-driven machine with a
 * touchscreen attached. This is the whole point of the probe; see the header.
 */
const HYBRID_ARGS = [
  "--blink-settings=availablePointerTypes=6,primaryPointerType=4," +
    "availableHoverTypes=2,primaryHoverType=2",
];

let pass = 0;
let fail = 0;
const failures = [];

function ok(name, detail = "") {
  pass++;
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function bad(name, detail = "") {
  fail++;
  failures.push(`${name} — ${detail}`);
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
}
function assert(name, cond, detail = "") {
  if (cond) ok(name, detail);
  else bad(name, detail);
}

/**
 * GATE 0 — the source manifest.
 *
 * Everything the browser can tell us is about what happened to LOAD. A runtime
 * CSSOM scan passes as long as SOME widened block matches, so a file that was
 * missed entirely — or silently reverted by a later merge — is invisible to it.
 * This gate reads the source instead and asserts the exact expected
 * disposition of every `pointer: coarse` guard in the repo.
 *
 * The load-bearing clause is the last one: any file NOT on this allowlist that
 * still carries a bare `pointer: coarse` guard means the sweep is incomplete.
 * That is the assertion that would catch a regression or a missed file.
 */
// `count` is EXACT, not a ceiling. A file-level exemption would let a NEW bare
// touch-target guard be added to (say) WeeklyGrid and ride in on that file's
// legitimate hover-affordance exception. Pinning the count means any additional
// bare guard anywhere — including inside an allowlisted file — fails the gate.
const EXPECTED_BARE_POINTER = new Map([
  // Category A — hover-affordance guards. Widening these would pin
  // otherwise-hover-only controls permanently open on every touch laptop.
  ["components/grid/WeeklyGrid.module.css", { count: 1, why: "cat A — hover affordance" }],
  ["components/rename/InstanceRename.module.css", { count: 1, why: "cat A — hover affordance" }],
  ["components/teach/left/TeachLeft.module.css", { count: 1, why: "cat A — hover affordance" }],
  ["components/teach/right/TeachRightPanel.module.css", { count: 1, why: "cat A — hover affordance" }],
  // Category A by authorial ruling — its comment considered and rejected
  // `any-pointer` because a trackpad touch laptop still hovers and still
  // reaches the chip.
  [
    "components/year/TimelineYear.module.css",
    { count: 1, why: "cat A — any-pointer explicitly rejected in-file" },
  ],
  // Mixed A+C — a 44px floor sharing a block with a hover reveal. Widening
  // wholesale would pin the reveal open; splitting is a component decision.
  [
    "components/teach-v2/SlideFilmstrip.module.css",
    { count: 1, why: "mixed A+C — reveals .thumbActions" },
  ],
  [
    "components/week-v2/WeekC.module.css",
    { count: 1, why: "mixed A+C — reveals .addBtn (opacity 0 at rest)" },
  ],
  // NOTE: components/ui/ToggleGroup.module.css was listed here as "not owned by
  // this lane". Ownership was granted after the C commit and it is now widened,
  // so it has moved to REQUIRED_WIDENED. It appeared in NEITHER handoff list
  // because it landed in e7e169c, after the categorisation was written.
  // NOTE: components/composer/ResMenu.module.css was on this list — it arrived
  // mid-sweep as a new bare guard in another lane's work. That lane widened it
  // itself, so it is deliberately NOT listed: if their change is reverted, this
  // gate SHOULD flag it as an unlisted straggler.
]);

/**
 * The POSITIVE half of the manifest: every file this sweep changed. Gate 0
 * asserts each one still carries a widened guard and no bare one.
 *
 * Without this, Gate 0 only proves "no stragglers" — a target rule that was
 * DELETED outright would satisfy that happily, and the runtime gates would then
 * pass on some other file's widened block. The negative and positive halves
 * together are what make the sweep verifiable.
 *
 * This is also why the synthetic arm's skipped-selector gap (combinators,
 * state-dependent selectors) is not chased with a per-control fixture harness:
 * the change under test is a media-CONDITION rename that leaves every selector
 * and declaration untouched, so "did this rule survive with the right guard" is
 * a source property, checked here exactly, rather than something to re-derive
 * by reconstructing ~25 ancestor chains in a fixture DOM.
 */
// Counts are EXACT. Presence alone is not enough: a file that carried six
// renamed guards could lose five and still satisfy "has at least one", while
// the runtime sample (capped, and selector-filtered) may never reach the
// missing rule. The B/C totals below are 20 and 25, matching beeae3e/d714a06.
const REQUIRED_WIDENED = new Map([
  // Category B — beeae3e (20 rules / 10 files)
  ["app/chrome.css", 1],
  ["components/daily/DailyView.module.css", 1],
  ["components/lesson-editor/lesson-editor.module.css", 6],
  ["components/lesson-editor/FloatingBar.module.css", 1],
  ["components/resource-wall-v2/ResourceWall.module.css", 3],
  ["components/resource-wall-v2/Section.module.css", 1],
  ["components/resource-wall-v2/WallLibrary.module.css", 4],
  ["components/weekly/WeekEditBoard.module.css", 1],
  ["components/year-v2/YearC.module.css", 1],
  ["components/year/YearConstellation.module.css", 1],
  // Category C — d714a06 (25 rules / 23 files). plan-page carries 2: one was
  // already widened by another lane before this sweep reached it.
  ["components/catchup-v2/CatchUpModal.module.css", 1],
  ["components/daily/DayEditSplit.module.css", 1],
  ["components/daily/dock/Dock.module.css", 1],
  ["components/daily/planning-tabs/planning-tabs.module.css", 1],
  ["components/day-v2/day-v2.module.css", 1],
  ["components/hub-v2/browse/browse.module.css", 1],
  ["components/hub-v2/hub.module.css", 2],
  ["components/lesson-plan-v2/plan-page.module.css", 2],
  ["components/lesson-plan-v2/tabs/tabs.module.css", 1],
  ["components/onboarding-v2/steps/steps-v2.module.css", 1],
  ["components/planner-v2/atoms.module.css", 1],
  ["components/standards/standards-picker.module.css", 1],
  ["components/teach-v2/BoardSwitcher.module.css", 1],
  ["components/teach-v2/BoardTimer.module.css", 1],
  ["components/teach-v2/LessonRail.module.css", 1],
  ["components/teach-v2/TeachV2Shell.module.css", 1],
  ["components/teach-v2/WritingBar.module.css", 1],
  ["components/unit-chip/UnitChip.module.css", 1],
  ["components/year-v2/ExplorerShell.module.css", 1],
  ["components/year-v2/UnitExplorer.module.css", 2],
  ["components/year-v2/UnitWorkspaceRail.module.css", 1],
  ["components/year-v2/YearA.module.css", 1],
  ["components/year-v2/drawer/UnitContextDrawer.module.css", 1],
  // Follow-up, after the lead granted ownership: ToggleGroup was in neither
  // handoff list (it landed in e7e169c, post-categorisation) and is the
  // primitive the rest of the tier inherits from, so leaving it bare would have
  // been the worst single omission.
  ["components/ui/ToggleGroup.module.css", 1],
  // Reference implementation — 0eeb3af, not this lane's but part of the tier
  ["components/ui/Button.module.css", 1],
  ["components/ui/Chip.module.css", 2],
]);

function scanSourceGuards(root) {
  const hits = new Map();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!name.endsWith(".css")) continue;
      const rel = path.relative(root, full).split(path.sep).join("/");
      // Strip /* … */ FIRST. Button.module.css documents the category-A trap by
      // quoting `@media (hover: none), (pointer: coarse)` verbatim inside a
      // comment; a raw line scan reads that as a live straggler and reports a
      // sweep-incomplete failure against the one file that is already correct.
      const src = readFileSync(full, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      // Match the whole @media PRELUDE, not a line. `@media (\n pointer: coarse\n)`
      // is valid CSS and a line-oriented scan cannot see it — an unconverted
      // guard formatted that way would read as a clean sweep.
      for (const m of src.matchAll(/@media\b([^{]*)\{/g)) {
        const cond = m[1].replace(/\s+/g, " ").trim();
        const widened = /any-pointer:\s*coarse/.test(cond);
        const bare = /(^|[^-])pointer:\s*coarse/.test(cond);
        if (!widened && !bare) continue;
        if (!hits.has(rel)) hits.set(rel, { bare: [], widened: [] });
        // A single prelude can carry both arms; record each independently.
        if (widened) hits.get(rel).widened.push(cond);
        if (bare) hits.get(rel).bare.push(cond);
      }
    }
  };
  // These two ARE the first-party CSS surface — verified with
  // `git ls-files "*.css"`, which returns nothing outside them except
  // `Documents/` (the design handoff bundle, reference material that CLAUDE.md
  // forbids importing, so a guard there governs nothing). `styles/` is reserved
  // but empty. Widen this list if that ever changes, or the scan goes blind.
  for (const sub of CSS_ROOTS) {
    const d = path.join(root, sub);
    try {
      if (statSync(d).isDirectory()) walk(d);
    } catch {
      /* absent tree */
    }
  }
  return hits;
}

/** First-party CSS roots. See the note in scanSourceGuards. */
const CSS_ROOTS = ["app", "components", "styles"];

/**
 * The only two shapes a widened guard may take. Counting preludes that merely
 * CONTAIN `any-pointer: coarse` is not enough: `@media (any-pointer: coarse)
 * and (hover: hover)` contains it, passes a count check, passes the hybrid run
 * — and silently excludes coarse-ONLY touch users, i.e. every phone and tablet.
 * An exact-form check is what distinguishes a rename from a rewrite.
 */
const CANONICAL_WIDENED = new Set([
  "(any-pointer: coarse), (max-width: 900px)",
  "(max-width: 900px), (any-pointer: coarse)",
  "(any-pointer: coarse), (max-width: 1023px)",
  "(any-pointer: coarse)", // app/chrome.css — deliberate single arm
]);

/**
 * Installs the hit-area measurement on `window.__hit`, once per page.
 *
 * It walks outward from an element's centre with elementFromPoint until the hit
 * test stops returning the element (or a descendant). That extent is the REAL
 * clickable area — pseudo-element inflation included, ancestor clipping
 * included — which is precisely what getComputedStyle cannot tell you.
 */
async function installHitProbe(page) {
  await page.evaluate(() => {
    window.__hit = (el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return { w: 0, h: 0, reason: "zero-rect" };
      const cx = Math.round(r.left + r.width / 2);
      const cy = Math.round(r.top + r.height / 2);
      // The element or its DESCENDANTS only. An earlier draft also accepted
      // `n.contains(el)`, which counts every ANCESTOR as a hit — the walk then
      // never terminates and every target measures the walk limit (81px), i.e.
      // the probe reports a uniform pass and can detect nothing. Pseudo-element
      // inflation is still captured: elementFromPoint over a ::before returns
      // the originating element.
      const owns = (n) => n && (n === el || el.contains(n));
      if (!owns(document.elementFromPoint(cx, cy))) {
        return { w: 0, h: 0, reason: "centre-occluded" };
      }
      const walk = (dx, dy) => {
        let d = 0;
        for (let i = 1; i <= 40; i++) {
          if (owns(document.elementFromPoint(cx + dx * i, cy + dy * i))) d = i;
          else break;
        }
        return d;
      };
      return {
        w: walk(-1, 0) + walk(1, 0) + 1,
        h: walk(0, -1) + walk(0, 1) + 1,
        reason: "measured",
      };
    };
  });
}

async function main() {
  // ── GATE 0 — source manifest (runs before the browser; no server needed) ──
  console.log("GATE 0 — source manifest: is the sweep actually complete?");
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.slice(1)), "..");
  const guards = scanSourceGuards(root);
  const bareFiles = [...guards.entries()].filter(([, v]) => v.bare.length).map(([f]) => f);
  const unexpected = bareFiles.filter((f) => !EXPECTED_BARE_POINTER.has(f));
  const missing = [...EXPECTED_BARE_POINTER.keys()].filter((f) => !bareFiles.includes(f));

  // NEGATIVE half — nothing was left behind.
  assert(
    "0.1 source scan found the known bare-`pointer` guards (not vacuous)",
    bareFiles.length > 0,
    `${bareFiles.length} files carry a bare guard`,
  );
  assert(
    "0.2 NO unlisted file still carries a bare `pointer: coarse` guard",
    unexpected.length === 0,
    unexpected.length
      ? `SWEEP INCOMPLETE: ${unexpected.join(", ")}`
      : "every remaining guard is a documented exception",
  );
  assert(
    "0.3 every documented exception is still present (none silently widened)",
    missing.length === 0,
    missing.length ? `no longer bare: ${missing.join(", ")}` : `${EXPECTED_BARE_POINTER.size} exceptions intact`,
  );
  const countDrift = [...EXPECTED_BARE_POINTER.entries()]
    .map(([f, spec]) => ({ f, want: spec.count, got: guards.get(f)?.bare.length || 0 }))
    .filter((d) => d.want !== d.got);
  assert(
    "0.3b each exception has EXACTLY its expected number of bare guards",
    countDrift.length === 0,
    countDrift.length
      ? `count drift (a new bare guard may be hiding in an exempt file): ${countDrift
          .map((d) => `${d.f} want ${d.want} got ${d.got}`)
          .join("; ")}`
      : "no extra bare guards inside exempt files",
  );

  // POSITIVE half — every target still HAS its widened guard. A deleted rule
  // would sail through 0.1–0.3; only this catches it.
  const widenedDrift = [...REQUIRED_WIDENED.entries()]
    .map(([f, want]) => ({ f, want, got: guards.get(f)?.widened.length || 0 }))
    .filter((d) => d.want !== d.got);
  const stillBare = [...REQUIRED_WIDENED.keys()].filter((f) => guards.get(f)?.bare.length > 0);
  assert(
    "0.4 every swept file carries EXACTLY its expected widened-guard count",
    widenedDrift.length === 0,
    widenedDrift.length
      ? `RULE LOST OR ADDED: ${widenedDrift.map((d) => `${d.f} want ${d.want} got ${d.got}`).join("; ")}`
      : `${REQUIRED_WIDENED.size} files verified`,
  );
  assert(
    "0.5 no swept file retains a bare guard (partial migration)",
    stillBare.length === 0,
    stillBare.length ? `PARTIAL: ${stillBare.join(", ")}` : "all swept files fully migrated",
  );
  const offForm = [];
  for (const f of REQUIRED_WIDENED.keys()) {
    for (const cond of guards.get(f)?.widened || []) {
      if (!CANONICAL_WIDENED.has(cond)) offForm.push(`${f}: "${cond}"`);
    }
  }
  assert(
    "0.6 every widened guard is an exact RENAME, not a rewritten condition",
    offForm.length === 0,
    offForm.length
      ? `non-canonical condition (may exclude coarse-only devices): ${offForm.join("; ")}`
      : `all ${CANONICAL_WIDENED.size} accepted forms only`,
  );

  const totalWidened = [...REQUIRED_WIDENED.keys()].reduce(
    (n, f) => n + (guards.get(f)?.widened.length || 0),
    0,
  );
  console.log(`        ${totalWidened} widened guards across ${REQUIRED_WIDENED.size} swept files`);
  for (const [f, spec] of EXPECTED_BARE_POINTER) {
    const got = guards.get(f)?.bare.length || 0;
    console.log(`        ${got === spec.count ? "·" : "!"} ${f} (${got}/${spec.count}) — ${spec.why}`);
  }

  /** Selectors that declared a 44px floor UNDER THE HYBRID — Gate 6.3 re-measures
   *  these with a fine pointer to prove the floors are guard-gated. */
  let hybridFloors = [];

  const browser = await chromium.launch({ channel: "chrome", args: HYBRID_ARGS });
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 } });

  try {
    await bypassLogin(ctx, { base: BASE, next: "/post" });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/post`, { waitUntil: "domcontentloaded" });
    // Dev-server hydration runs 5–9s here; sampling earlier measures SSR-default
    // HTML and yields false findings. Wait it out before measuring anything.
    await page.waitForTimeout(11000);

    // ── GATE 1 — the environment IS an iPad-Pro-in-landscape hybrid ──────────
    console.log("\nGATE 1 — hybrid emulation (abort if this does not hold)");
    const env = await page.evaluate(
      ([b, c, aAsIs, aWide]) => ({
        anyCoarse: matchMedia("(any-pointer: coarse)").matches,
        anyFine: matchMedia("(any-pointer: fine)").matches,
        primaryCoarse: matchMedia("(pointer: coarse)").matches,
        primaryFine: matchMedia("(pointer: fine)").matches,
        under900: matchMedia("(max-width: 900px)").matches,
        hoverable: matchMedia("(hover: hover)").matches,
        preFixB: matchMedia(b).matches,
        preFixC: matchMedia(c).matches,
        catAAsIs: matchMedia(aAsIs).matches,
        catAIfWidened: matchMedia(aWide).matches,
        width: innerWidth,
      }),
      [PRE_FIX_B, PRE_FIX_C, CAT_A_ASIS, CAT_A_IF_WIDENED],
    );
    console.log(`        ${JSON.stringify(env)}`);

    assert("1.1 any-pointer: coarse MATCHES", env.anyCoarse === true, String(env.anyCoarse));
    assert("1.2 max-width: 900px does NOT match", env.under900 === false, `width=${env.width}`);
    assert(
      "1.3 primary pointer is FINE — this is a hybrid, not a phone",
      env.primaryFine === true && env.primaryCoarse === false,
      `fine=${env.primaryFine} coarse=${env.primaryCoarse}`,
    );

    if (!(env.anyCoarse && !env.under900 && !env.primaryCoarse)) {
      bad("ABORT", "not a hybrid environment; every later measurement would be meaningless");
      throw new Error("hybrid emulation not achieved");
    }

    // ── GATE 2 — the counterfactual: the OLD guards are dead here ────────────
    console.log("\nGATE 2 — counterfactual (proves the defect was real)");
    assert(
      "2.1 pre-fix cat-B media text does NOT match",
      env.preFixB === false,
      `"${PRE_FIX_B}" → ${env.preFixB}`,
    );
    assert(
      "2.2 pre-fix cat-C media text does NOT match",
      env.preFixC === false,
      `"${PRE_FIX_C}" → ${env.preFixC}`,
    );
    assert(
      "2.3 post-fix media text DOES match",
      await page.evaluate((m) => matchMedia(m).matches, POST_FIX_C),
      `"${POST_FIX_C}"`,
    );

    // ── GATE 2b — the category-A counterfactual ─────────────────────────────
    // This is the evidence that leaving the four hover-affordance guards alone
    // was correct, and it is the only assertion here that can catch the
    // find-and-replace mistake. As shipped, `(hover: none), (pointer: coarse)`
    // is INERT on this machine — the user can hover, so the affordance reveals
    // on hover exactly as designed. Had it been widened to `any-pointer`, the
    // same query would evaluate TRUE and pin every hover-only control
    // permanently open on every touch laptop.
    console.log("\nGATE 2b — category A: what the blanket replace would have done");
    assert(
      "2b.1 category A as shipped is INERT here (hover still works)",
      env.catAAsIs === false,
      `"${CAT_A_ASIS}" → ${env.catAAsIs}`,
    );
    assert(
      "2b.2 category A WOULD have fired had it been widened — the regression",
      env.catAIfWidened === true,
      `"${CAT_A_IF_WIDENED}" → ${env.catAIfWidened} (this is why A was left alone)`,
    );

    // ── GATE 3 — every shipped rule's own media text evaluates true here ─────
    console.log("\nGATE 3 — shipped @media blocks, read back from the live CSSOM");
    const sheets = await page.evaluate(() => {
      const out = { widened: [], stragglers: [], hoverGuards: [] };
      // Recurse through every grouping rule. A flat scan of the top level only
      // is blind to a guard nested inside @layer / @supports / another @media —
      // and a straggler the probe cannot see reads as a clean pass, which is
      // the exact false-pass this probe exists to prevent.
      const visit = (rules) => {
        for (const rule of Array.from(rules || [])) {
          if (rule instanceof CSSMediaRule) {
            const t = rule.conditionText || rule.media.mediaText;
            if (t.includes("pointer")) {
              const entry = {
                media: t,
                matches: matchMedia(t).matches,
                selectors: Array.from(rule.cssRules || [])
                  .map((r) => r.selectorText)
                  .filter(Boolean),
              };
              if (t.includes("any-pointer")) out.widened.push(entry);
              else if (t.includes("hover")) out.hoverGuards.push(entry);
              else out.stragglers.push(entry);
            }
          }
          // CSSMediaRule / CSSLayerBlockRule / CSSSupportsRule all extend
          // CSSGroupingRule and can nest further.
          if (rule.cssRules) visit(rule.cssRules);
        }
      };
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          visit(sheet.cssRules);
        } catch {
          continue; // cross-origin sheet
        }
      }
      return out;
    });

    const widenedAllMatch = sheets.widened.length > 0 && sheets.widened.every((e) => e.matches);
    assert(
      "3.1 every widened @media block MATCHES on this hybrid",
      widenedAllMatch,
      `${sheets.widened.filter((e) => e.matches).length}/${sheets.widened.length} blocks live`,
    );

    const straggMatch = sheets.stragglers.filter((e) => e.matches).length;
    assert(
      "3.2 remaining bare-`pointer` blocks are correctly INERT here",
      straggMatch === 0,
      `${sheets.stragglers.length} left (deliberate: mixed A+C + not-owned), ${straggMatch} matching`,
    );

    // NOTE: /post does not load the category-A modules, so the hover-guard
    // count here is normally 0 and asserting on it would pass VACUOUSLY. The
    // real evidence is Gate 7, which visits a route that does load them.
    console.log(
      `        (hover guards on this route: ${sheets.hoverGuards.length} — see Gate 7 for the real check)`,
    );

    // ── GATE 4 — SYNTHETIC: real hashed classes, real .cp-root, real cascade ──
    // This is the load-bearing arm. It takes selectors straight out of the
    // widened blocks above, so it cannot drift from what actually shipped.
    console.log("\nGATE 4 — synthetic sample mounted inside a real .cp-root");
    await installHitProbe(page);
    const synth = await page.evaluate(
      ({ widened }) => {
        const hit = window.__hit;
        // ONE element on screen at a time. Stacking them made the host taller
        // than the viewport, and everything past the fold hit-tested as
        // "centre-occluded" — a probe artifact that reads exactly like a real
        // clipping failure. Each sample is mounted at a fixed, generously
        // cleared position, measured, then removed.
        const host = document.createElement("div");
        host.className = "cp-root";
        host.setAttribute("data-probe-host", "1");
        host.style.cssText =
          "position:fixed;top:200px;left:200px;width:420px;height:220px;" +
          "background:#fff;z-index:2147483647;display:grid;place-items:center";
        document.body.appendChild(host);

        const results = [];
        for (const block of widened) {
          for (const sel of block.selectors) {
            if (results.length >= 40) break;
            if (/[>+~ ]|::|:(?!focus-visible)/.test(sel)) continue; // combinators/pseudos
            const classes = (sel.match(/\.[A-Za-z0-9_-]+/g) || []).map((s) => s.slice(1));
            if (!classes.length) continue;
            const el = document.createElement("button");
            el.className = Array.from(new Set(classes)).join(" ");
            el.textContent = "x";
            host.appendChild(el);
            const m = hit(el);
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            results.push({
              sel,
              media: block.media,
              hitW: m.w,
              hitH: m.h,
              boxW: Math.round(r.width),
              boxH: Math.round(r.height),
              reason: m.reason,
              declaredH: cs.minHeight,
              declaredW: cs.minWidth,
            });
            el.remove();
          }
          if (results.length >= 40) break;
        }
        host.remove();
        return results;
      },
      { widened: sheets.widened },
    );

    assert(
      "4.1 synthetic arm is NOT vacuous",
      synth.length > 0,
      `${synth.length} real hashed selectors mounted`,
    );

    // A rule that DECLARES a 44px floor must MEASURE ≥44px on that axis.
    //
    // `short.length === 0` alone is NOT a sufficient assertion: it is trivially
    // true when nothing declared a floor at all, so a run where the inflation
    // never applied would pass. The population being checked has to be asserted
    // non-empty first, or this gate is decorative.
    const declaredFloor = synth.filter((r) => r.declaredH === "44px" || r.declaredW === "44px");
    hybridFloors = declaredFloor;
    const short = declaredFloor.filter(
      (r) => (r.declaredH === "44px" && r.hitH < 44) || (r.declaredW === "44px" && r.hitW < 44),
    );
    const inflated = synth.filter((r) => r.hitH >= 44 || r.hitW >= 44);
    assert(
      "4.2 the sample actually CONTAINS declared 44px floors (not a vacuous pass)",
      declaredFloor.length > 0,
      `${declaredFloor.length} selectors declare a 44px floor; ${inflated.length}/${synth.length} measure ≥44px`,
    );
    assert(
      "4.3 every declared 44px floor MEASURES ≥44px (no ancestor clipping)",
      declaredFloor.length > 0 && short.length === 0,
      short.length
        ? JSON.stringify(short.slice(0, 4))
        : `${declaredFloor.length} declared floors all measured ≥44px`,
    );
    for (const r of synth.slice(0, 10)) {
      console.log(
        `        ${r.sel.replace(/^\./, "").slice(0, 46).padEnd(46)} ` +
          `box=${r.boxW}x${r.boxH} hit=${r.hitW}x${r.hitH} min=${r.declaredW}/${r.declaredH} [${r.reason}]`,
      );
    }

    // ── 5 — ON-PAGE SURVEY (diagnostic, deliberately NOT a pass/fail gate) ───
    // Labelled a survey rather than a gate on purpose. It measures whatever
    // controls happen to be rendered, which includes surfaces this change does
    // not govern, and the repo has DELIBERATE sub-44px controls (Chip
    // `.removeBtn` is pinned at 24px with a comment, because inflating a
    // control packed against a destructive neighbour is worse than leaving it).
    // Failing on any undersized control would therefore produce false failures
    // on unrelated surfaces. The count is printed so a regression is visible;
    // treat a non-zero number as something to investigate, not as proof of a
    // defect in this change. The load-bearing evidence is Gate 4.
    console.log("\n5 — on-page survey, diagnostic only (disabled controls excluded)");
    const onPage = await page.evaluate(() => {
      const hit = window.__hit;
      const out = [];
      const nodes = Array.from(document.querySelectorAll("button, [role='button'], a[href]"));
      for (const el of nodes) {
        if (el.disabled || el.getAttribute("aria-disabled") === "true") continue; // WCAG 2.5.5 exempt
        if (el.closest("[data-probe-host]")) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (r.top < 0 || r.top > innerHeight - 8) continue; // offscreen
        const m = hit(el);
        out.push({ w: m.w, h: m.h, reason: m.reason, label: (el.textContent || el.ariaLabel || "").trim().slice(0, 28) });
      }
      return out;
    });

    // Record what actually rendered. This account currently hits the onboarding
    // gate, so the on-page arm may be sampling the wizard rather than the route
    // that was requested — worth knowing when reading the numbers below. It does
    // not weaken the verification: Gates 1/2/2b/3/6/7 evaluate media queries and
    // the loaded CSSOM, which are independent of which view rendered, and the
    // synthetic arm (Gate 4) is the load-bearing one by design.
    const landed = await page.evaluate(() => ({
      url: location.pathname,
      heading: (document.querySelector("h1, h2")?.textContent || "").trim().slice(0, 40),
    }));
    console.log(`        rendered: ${landed.url} — "${landed.heading}"`);

    const measured = onPage.filter((r) => r.reason === "measured");
    const undersized = measured.filter((r) => r.w < 44 && r.h < 44);
    console.log(
      `        ${measured.length} enabled controls measured; ${undersized.length} under 44px on BOTH axes` +
        ` (diagnostic — does not affect the exit code)`,
    );
    if (undersized.length) {
      for (const u of undersized.slice(0, 10)) {
        console.log(`        · ${u.w}x${u.h}  "${u.label}"`);
      }
    }

    await page.screenshot({ path: "docs/screenshots/any-pointer/hybrid-1024.png", fullPage: false });

    // ── GATE 7 — category A on a route that ACTUALLY loads it ───────────────
    // /weekly pulls in WeeklyGrid (and the shell pulls the rename module), so
    // the four `(hover: none), (pointer: coarse)` guards are really in the
    // CSSOM here. This is the non-vacuous version of the claim: on a hybrid,
    // as shipped, they stay inert — the hover-only affordances are NOT pinned
    // open. Gate 7.3 then re-checks the same blocks with `pointer` swapped for
    // `any-pointer`, which is the change deliberately NOT made.
    console.log("\nGATE 7 — category A on /weekly (the route that loads it)");
    await page.goto(`${BASE}/weekly`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11000);
    const catA = await page.evaluate(() => {
      const out = [];
      // Recursive, matching Gate 3. A flat scan here would miss a category-A
      // guard nested under @layer/@supports — and could then pass on unrelated
      // top-level rules while a nested one had been wrongly widened.
      const visit = (rules) => {
        for (const rule of Array.from(rules || [])) {
          if (rule instanceof CSSMediaRule) {
            const t = rule.conditionText || rule.media.mediaText;
            if (t.includes("hover") && t.includes("pointer")) {
              out.push({
                media: t,
                matches: matchMedia(t).matches,
                ifWidened: matchMedia(t.replace(/\(pointer:/g, "(any-pointer:")).matches,
                selectors: Array.from(rule.cssRules || [])
                  .map((r) => r.selectorText)
                  .filter(Boolean)
                  .slice(0, 3),
              });
            }
          }
          if (rule.cssRules) visit(rule.cssRules);
        }
      };
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          visit(sheet.cssRules);
        } catch {
          continue;
        }
      }
      return out;
    });
    assert("7.1 category-A guards are present in the CSSOM (not vacuous)", catA.length > 0, `${catA.length} found`);
    assert(
      "7.2 as shipped they are INERT on a hybrid — affordances NOT pinned open",
      catA.length > 0 && catA.every((e) => e.matches === false),
      `${catA.filter((e) => e.matches).length} of ${catA.length} matching`,
    );
    assert(
      "7.3 widening them WOULD have pinned them open — the avoided regression",
      catA.length > 0 && catA.every((e) => e.ifWidened === true),
      `${catA.filter((e) => e.ifWidened).length} of ${catA.length} would fire`,
    );
    for (const e of catA) {
      console.log(`        ${e.media}  now=${e.matches}  ifWidened=${e.ifWidened}  ${e.selectors.join(", ")}`);
    }
    await page.screenshot({ path: "docs/screenshots/any-pointer/hybrid-weekly-1024.png" });
  } finally {
    await ctx.close();
    await browser.close();
  }

  // ── GATE 6 — CONTROL: a plain mouse desktop must see NO inflation ─────────
  // Pointer capability is a launch flag, so the control needs its own browser
  // — a per-page toggle cannot express it. Without this arm the sweep could
  // have widened every guard to "always on" and still passed everything above.
  console.log("\nGATE 6 — fine-pointer control (separate browser, no hybrid flag)");
  const ctlBrowser = await chromium.launch({ channel: "chrome" });
  try {
    const ctlCtx = await ctlBrowser.newContext({ viewport: { width: 1280, height: 800 } });
    // Authenticate and hydrate EXACTLY as the hybrid run does. An unauthenticated
    // control lands on the login page, none of the route's CSS modules load, and
    // every selector then reports "no 44px floor" — which Gate 6.3 would happily
    // read as proof that the floors are guard-gated. That is a fabricated pass:
    // the floors would be absent because the stylesheet never arrived, not
    // because the guard withheld them. 6.3a below is the guard against it.
    await bypassLogin(ctlCtx, { base: BASE, next: "/post" });
    const ctlPage = await ctlCtx.newPage();
    await ctlPage.goto(`${BASE}/post`, { waitUntil: "domcontentloaded" });
    await ctlPage.waitForTimeout(11000);
    const control = await ctlPage.evaluate(
      ([c, b, aWide]) => ({
        anyCoarse: matchMedia("(any-pointer: coarse)").matches,
        postFixC: matchMedia(c).matches,
        postFixB: matchMedia(b).matches,
        catAIfWidened: matchMedia(aWide).matches,
        width: innerWidth,
      }),
      [POST_FIX_C, POST_FIX_B_CHROME, CAT_A_IF_WIDENED],
    );
    assert(
      "6.1 a plain mouse desktop does NOT see any-pointer: coarse",
      control.anyCoarse === false,
      JSON.stringify(control),
    );
    assert(
      "6.2 the widened guards stay INERT for a mouse user (no desktop regression)",
      control.postFixC === false && control.postFixB === false,
      `catC=${control.postFixC} catB=${control.postFixB} @${control.width}px`,
    );

    // 6.3 — the DIFFERENTIAL. Media-query state alone cannot distinguish
    // "inflation is guard-gated" from "inflation is unconditional and the query
    // is irrelevant". So mount the SAME synthetic selectors here and compare:
    // a control whose 44px floor comes from the guard must LOSE it under a fine
    // pointer. If nothing loses its floor, the rules are firing regardless of
    // the guard and the whole sweep is cosmetic.
    await installHitProbe(ctlPage);
    const ctlSynth = await ctlPage.evaluate(({ sels, wanted }) => {
      // Establish that the CONTROL page carries the SAME guarded rules — by
      // (media condition, selector) identity, not by class tokens appearing
      // loose anywhere in the CSSOM. A token-level check is satisfiable by an
      // unrelated rule, so a page missing the guarded stylesheet entirely could
      // still look "loaded"; the floor would then vanish for the wrong reason
      // and 6.3 would read that absence as successful gating.
      const present = new Set();
      const visit = (rules, media) => {
        for (const rule of Array.from(rules || [])) {
          const m = rule instanceof CSSMediaRule ? rule.conditionText || rule.media.mediaText : media;
          if (rule.selectorText && m) present.add(`${m}||${rule.selectorText}`);
          if (rule.cssRules) visit(rule.cssRules, m);
        }
      };
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          visit(sheet.cssRules, null);
        } catch {
          /* cross-origin */
        }
      }
      const ruleLoaded = {};
      for (const [sel, media] of Object.entries(wanted)) ruleLoaded[sel] = present.has(`${media}||${sel}`);

      const host = document.createElement("div");
      host.className = "cp-root";
      host.setAttribute("data-probe-host", "1");
      host.style.cssText =
        "position:fixed;top:200px;left:200px;width:420px;height:220px;" +
        "background:#fff;z-index:2147483647;display:grid;place-items:center";
      document.body.appendChild(host);
      const out = {};
      for (const sel of sels) {
        const classes = (sel.match(/\.[A-Za-z0-9_-]+/g) || []).map((s) => s.slice(1));
        if (!classes.length) continue;
        const el = document.createElement("button");
        el.className = Array.from(new Set(classes)).join(" ");
        el.textContent = "x";
        host.appendChild(el);
        const cs = getComputedStyle(el);
        out[sel] = { minH: cs.minHeight, minW: cs.minWidth, cssLoaded: ruleLoaded[sel] === true };
        el.remove();
      }
      host.remove();
      return out;
    }, {
      sels: hybridFloors.map((r) => r.sel),
      wanted: Object.fromEntries(hybridFloors.map((r) => [r.sel, r.media])),
    });

    const comparable = hybridFloors.filter((r) => ctlSynth[r.sel]?.cssLoaded);
    const absent = hybridFloors.filter((r) => !ctlSynth[r.sel]?.cssLoaded);
    assert(
      "6.3a the control page carries the SAME guarded rules by (media, selector)",
      comparable.length > 0 && absent.length === 0,
      absent.length
        ? `${absent.length}/${hybridFloors.length} guarded rules absent here — an unauthenticated or ` +
          `differently-routed control would fake 6.3: ${absent.slice(0, 2).map((r) => r.sel).join(", ")}`
        : `${comparable.length}/${hybridFloors.length} guarded rules present in both contexts`,
    );

    const lostFloor = comparable.filter((r) => {
      const c = ctlSynth[r.sel];
      return c.minH !== "44px" && c.minW !== "44px";
    });
    const gainedFloor = Object.entries(ctlSynth).filter(
      ([sel, c]) =>
        (c.minH === "44px" || c.minW === "44px") &&
        !hybridFloors.some((r) => r.sel === sel),
    );
    // EVERY comparable floor must drop, not merely one — "at least one dropped"
    // would tolerate the rest being unconditional.
    assert(
      "6.3 44px floors are GUARD-GATED — EVERY one disappears for a fine pointer",
      comparable.length > 0 && lostFloor.length === comparable.length,
      `${lostFloor.length}/${comparable.length} declared floors dropped under a mouse` +
        (lostFloor.length === comparable.length
          ? ""
          : ` — ${comparable.length - lostFloor.length} still 44px, i.e. unconditional, guard irrelevant`),
    );
    assert(
      "6.4 no control GAINED a floor under a fine pointer",
      gainedFloor.length === 0,
      gainedFloor.length ? JSON.stringify(gainedFloor.slice(0, 3)) : "none",
    );
  } finally {
    await ctlBrowser.close();
  }

  console.log(`\n${"─".repeat(64)}`);
  console.log(`RESULT  ${pass} passed, ${fail} failed`);
  if (fail) {
    console.log("\nFAILURES:");
    for (const f of failures) console.log(`  · ${f}`);
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error("PROBE ERROR:", redact(String(e && e.stack ? e.stack : e)));
  process.exit(1);
});
