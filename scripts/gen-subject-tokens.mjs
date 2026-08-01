// gen-subject-tokens.mjs — print the `--subj-*` block for app/tokens.css, and
// the kept-vs-moved ledger that the user-locked anchoring decision is judged on.
//
//   node scripts/gen-subject-tokens.mjs          # CSS block + ledger
//   node scripts/gen-subject-tokens.mjs --check  # exit 1 if tokens.css disagrees
//
// This does NOT write the stylesheet: app/tokens.css is hand-maintained around
// these values (comment blocks, theme overrides), so the CSS is pasted in
// deliberately and tests/subject-color-derivation.test.ts is what holds it in
// lockstep afterwards. `--check` is the same assertion in a form CI can run.
//
// The derivation itself lives in lib/subject-color.ts — read that file for WHY
// the values are derived rather than transcribed from the handoff.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// lib/subject-color.ts is imported as TypeScript, which needs Node's built-in
// type stripping (on by default from 22.18 / 23; a flag before that). Without
// the guard this exits on an opaque ERR_UNKNOWN_FILE_EXTENSION that reads like
// a missing file, and a check nobody can run is a check nobody runs. The module
// is deliberately NOT duplicated as .mjs: lib/palette-data.ts imports the same
// file, and a second copy of the derivation is exactly the drift this whole
// change exists to remove.
const {
  HANDOFF_SLOTS,
  SUBJECT_SLOTS,
  LIGHT_SURFACE,
  DARK_SURFACE,
  NON_TEXT_MIN,
  TEXT_MIN,
  contrastRatio,
} = await import(new URL("../lib/subject-color.ts", import.meta.url).href).catch(
  (err) => {
    console.error(
      `Could not load lib/subject-color.ts (running Node ${process.versions.node}).\n` +
        "This script imports TypeScript directly and needs Node >= 22.18 (type\n" +
        "stripping on by default), or an older Node run with\n" +
        "--experimental-strip-types.\n" +
        `Underlying error: ${err?.message ?? err}`,
    );
    process.exit(1);
  },
);

const NAMES = [
  "gold", "apricot", "coral", "rose", "pink", "magenta", "purple", "violet",
  "periwinkle", "blue", "cyan", "teal", "green", "leaf", "lime",
];

const check = process.argv.includes("--check");
const pad = (s, n) => String(s).padEnd(n);
const r2 = (n) => n.toFixed(2).padStart(5);

/* ── the CSS block ───────────────────────────────────────────────────────── */
const cssLines = [];
SUBJECT_SLOTS.forEach((slot, i) => {
  const n = i + 1;
  cssLines.push(`  --subj-${n}: ${slot.solid};`);
  cssLines.push(`  --subj-${n}-tint: ${slot.tint};`);
  cssLines.push(`  --subj-${n}-ink: ${slot.ink}; /* ${NAMES[i]} */`);
});
const brightLines = SUBJECT_SLOTS.map(
  (slot, i) => `  --subj-${i + 1}-bright: ${slot.bright};`,
);

/* ── the ledger ──────────────────────────────────────────────────────────── */
const rows = [];
let kept = 0;
let moved = 0;
SUBJECT_SLOTS.forEach((slot, i) => {
  const handoff = HANDOFF_SLOTS[i];
  for (const role of ["solid", "tint", "ink", "bright"]) {
    const same = slot[role] === handoff[role];
    same ? kept++ : moved++;
    const onLight = contrastRatio(slot[role], LIGHT_SURFACE);
    const onDark = contrastRatio(slot[role], DARK_SURFACE);
    const onTint = role === "ink" ? contrastRatio(slot.ink, slot.tint) : null;
    rows.push(
      `${pad(i + 1, 3)} ${pad(NAMES[i], 11)} ${pad(role, 7)} ${handoff[role]} ` +
        `${same ? "  ==  " : "  ->  "} ${slot[role]}  ` +
        `light ${r2(onLight)}  dark ${r2(onDark)}` +
        (onTint === null ? "" : `  onTint ${r2(onTint)}`),
    );
  }
});

/* ── the guarantee, re-measured on the OUTPUT (never on the intermediate) ── */
const failures = [];
SUBJECT_SLOTS.forEach((slot, i) => {
  for (const role of ["solid", "bright"]) {
    for (const [label, bg] of [["light", LIGHT_SURFACE], ["dark", DARK_SURFACE]]) {
      const ratio = contrastRatio(slot[role], bg);
      if (ratio < NON_TEXT_MIN) {
        failures.push(`subj-${i + 1} ${role} on ${label} (${bg}) = ${ratio.toFixed(2)} < ${NON_TEXT_MIN}`);
      }
    }
  }
  const inkRatio = contrastRatio(slot.ink, slot.tint);
  if (inkRatio < TEXT_MIN) {
    failures.push(`subj-${i + 1} ink on its tint = ${inkRatio.toFixed(2)} < ${TEXT_MIN}`);
  }
  // The anchoring lock, restated as an assertion rather than an expectation: a
  // handoff value that already cleared its floor must come back untouched.
  for (const role of ["solid", "bright"]) {
    const passed =
      contrastRatio(HANDOFF_SLOTS[i][role], LIGHT_SURFACE) >= NON_TEXT_MIN &&
      contrastRatio(HANDOFF_SLOTS[i][role], DARK_SURFACE) >= NON_TEXT_MIN;
    if (passed && slot[role] !== HANDOFF_SLOTS[i][role]) {
      failures.push(
        `ANCHOR BROKEN: subj-${i + 1} ${role} passed as ${HANDOFF_SLOTS[i][role]} but was moved to ${slot[role]}`,
      );
    }
  }
});

/* ── --check: does app/tokens.css still carry these values? ──────────────── */
let drift = [];
if (check) {
  const css = readFileSync(
    fileURLToPath(new URL("../app/tokens.css", import.meta.url)),
    "utf8",
  );
  const declared = (name) => {
    const found = [
      ...css.matchAll(new RegExp(`(?:^|[{;\\s])--${name}\\s*:([^;{}]*);`, "gm")),
    ].map((m) => m[1].trim());
    return found;
  };
  SUBJECT_SLOTS.forEach((slot, i) => {
    const n = i + 1;
    for (const [suffix, role] of [
      ["", "solid"], ["-tint", "tint"], ["-ink", "ink"], ["-bright", "bright"],
    ]) {
      const decls = declared(`subj-${n}${suffix}`);
      // `-tint` and `-ink` are legitimately re-declared under
      // :root[data-tone="dark"] as color-mix() recipes; only the FIRST (`:root`)
      // declaration is the literal this generator owns.
      if (decls.length === 0) {
        drift.push(`--subj-${n}${suffix}: not declared in app/tokens.css`);
      } else if (decls[0] !== slot[role]) {
        drift.push(`--subj-${n}${suffix}: tokens.css has ${decls[0]}, derivation says ${slot[role]}`);
      }
    }
  });
}

/* ── output ──────────────────────────────────────────────────────────────── */
if (!check) {
  console.log("/* solids + tints + inks */");
  console.log(cssLines.join("\n"));
  console.log("\n/* brights */");
  console.log(brightLines.join("\n"));
  console.log("\n=== LEDGER (handoff -> shipped) ===");
  console.log(rows.join("\n"));
}
console.log(`\nkept byte-identical: ${kept}/60    moved: ${moved}/60`);

const problems = [...failures, ...drift];
if (problems.length) {
  console.error("\nFAILURES:\n" + problems.map((p) => "  - " + p).join("\n"));
  process.exit(1);
}
// A probe that asserts nothing must not report success (see the repo's
// verification-instruments-fail-open lesson): prove the loop actually ran.
if (kept + moved !== 60) {
  console.error(`\nFAILURE: expected 60 values, saw ${kept + moved}`);
  process.exit(1);
}
console.log(check ? "tokens.css agrees with the derivation." : "All floors met.");
