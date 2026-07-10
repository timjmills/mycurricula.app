#!/usr/bin/env node
// check-v2-flag.mjs — build-time policy for the NEXT_PUBLIC_V2 shell/router flag.
//
// WHY A SCRIPT AND NOT A GUARD IN lib/v2-flag.ts:
//   • A module-level throw ships into the CLIENT bundle as soon as a
//     "use client" file imports `V2` — and the router gates are client
//     components. Failure mode: a blank page, not a message.
//   • An "unset in production" throw broke every existing build path
//     (`deploy.yml`, `preview-deploy.yml`, local `npm run build`), because no
//     build environment declared the var. Measured: exit 1.
//   • A build script runs unambiguously at build time, ships nothing to any
//     bundle, fails at a predictable point, and is testable in milliseconds.
//
// NOT the reason (recorded because it was asserted, then DISPROVED by running
// the builds): it was argued that `app/layout.tsx`'s `await cookies()` makes
// every route dynamic, so `next build` never imports the flag module and a
// throw would surface only on the Worker's first request. False — Next's
// "Collecting page data" phase imports every route's server module to read its
// segment config (that is how it learns the route is dynamic), so the throw
// DOES fail the build: `✓ Compiled successfully` → `Failed to collect
// configuration for /daily` → exit 1. The script is the better mechanism on
// merit, not because the throw was unreachable.
//
// WIRED INTO (package.json): `predev`, `prebuild`, `build:cf`, `preview:cf`,
// `deploy:cf`.
//
// On the inline `&&` calls in the Cloudflare scripts (§4a D1 — the earlier note
// here stated a FALSE reason and is corrected): `opennextjs-cloudflare build`
// does NOT invoke `next build` directly. It calls `buildNextjsApp()` from
// `@opennextjs/aws`, which shells out to `<packager> run build` — `npm run
// build` for this repo (packager is detected from `package-lock.json`, and
// `open-next.config.ts` sets no `buildCommand`). So `prebuild` DOES fire, and
// the Cloudflare paths are already gated transitively. The inline calls are
// kept anyway as defence in depth: they survive a switch to pnpm/Yarn Berry
// (which don't run pre/post scripts), an `--ignore-scripts` install, or an
// `open-next.config.ts` that later sets an explicit `buildCommand`.
//
// STILL NOT COVERED (accepted, documented): a bare `npx next build` bypasses
// npm lifecycle hooks entirely. The checked scripts are the only documented
// build entry points.
//
// USAGE
//   node scripts/check-v2-flag.mjs                    # value validation (dev)
//   node scripts/check-v2-flag.mjs --build            # + artifact policy
//   node scripts/check-v2-flag.mjs --build --deploy   # + require explicit value
//
// POLICY
//   value ∈ {unset, "0", "1"} ................ always; anything else is fatal.
//   --build && value === "0" && !ROUTER_GATED  fatal — flag-OFF is not shippable
//                                              while only the chrome half is
//                                              gated (it would ship v1 chrome
//                                              around v2 canvases and look like
//                                              a successful rollback).
//   --build && unset && (CI || --deploy) ..... FATAL. Any artifact that can reach
//                                              production must declare the value
//                                              (§4a). `--deploy` covers a LOCAL
//                                              `npm run deploy:cf`, which is a
//                                              real production path here and is
//                                              not covered by `CI`.
//   --build && unset (local, non-deploy) ..... allowed, with the inlining notice.
//                                              Failing here unconditionally is
//                                              the mistake that broke every
//                                              build env in an earlier revision.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const FLAG_MODULE = path.join(ROOT, "lib", "v2-flag.ts");

const isBuild = process.argv.includes("--build");
const isDeploy = process.argv.includes("--deploy");

const die = (msg) => {
  console.error(`\n✖ NEXT_PUBLIC_V2 check failed\n\n${msg}\n`);
  process.exit(1);
};

// ── Read the SAME environment Next reads (§4a High, fail-open) ─────────────
// `next build` / `next dev` load the dotenv chain (.env.local, .env.production,
// .env …). A check that reads only `process.env` is BLIND to `.env.local` —
// which is exactly where `.env.local.example` tells you to put this flag. The
// hole that created: set `NEXT_PUBLIC_V2=0` in `.env.local`, run `npm run
// deploy:cf`; the check sees `undefined`, prints "✓ check passed — v2 (flag
// ON)", exit 0; `next build` then reads `.env.local`, inlines "0", and ships
// the half-gated v1-chrome/v2-canvas artifact the fatal rule exists to block —
// certified safe by this script's own success line.
//
// `loadEnvConfig` is Next's own loader (`@next/env`, a direct dependency of
// `next`), so precedence matches exactly: a real shell variable still wins over
// `.env.local`.
//
// DEVIATION, on the record: the §4a reviewer asked for `@next/env` in
// `devDependencies`. It is deliberately NOT declared, for two reasons:
//   • It ships with `next` (a direct dependency). Pinning it separately invites
//     version skew between the loader this script uses and the one `next build`
//     uses — the exact divergence this block exists to eliminate.
//   • Adding it means regenerating `package-lock.json`, which on this machine
//     produces a lockfile CI rejects (a known `@emnapi` optional-dependency
//     quirk). An out-of-sync lockfile breaks `npm ci` in both workflows.
// The compensating control is the fail-closed branch below: if the module or
// its export cannot be resolved, the check REFUSES rather than silently falling
// back to a blind `process.env` read.
try {
  // `@next/env` is CommonJS: under `await import()` its exports land on
  // `.default` in some Node/bundler combinations and at the top level in
  // others. Accept either shape, then assert we actually got the function —
  // a silent `undefined` here would reintroduce the very blindness this
  // block exists to remove.
  const mod = await import("@next/env");
  const loadEnvConfig = mod.loadEnvConfig ?? mod.default?.loadEnvConfig;
  if (typeof loadEnvConfig !== "function") {
    throw new Error("loadEnvConfig export not found on @next/env");
  }
  loadEnvConfig(ROOT, /* dev */ !isBuild, { info: () => {}, error: () => {} });
} catch (err) {
  die(
    `Could not load Next's env chain via @next/env: ${err.message}\n\n` +
      `This check must read the same environment \`next build\` reads, or a\n` +
      `NEXT_PUBLIC_V2 set in .env.local would be invisible to it. Refusing to\n` +
      `validate against a partial environment.`,
  );
}

const RAW = process.env.NEXT_PUBLIC_V2;

// ── 1. Value validation (always) ───────────────────────────────────────────
// Only the exact string "0" turns the flag off (lib/v2-flag.ts uses
// `RAW !== "0"`), so a well-meaning "false"/"off"/"no" would silently keep v2
// ON. Reject anything ambiguous rather than guess.
if (RAW !== undefined && RAW !== "0" && RAW !== "1") {
  die(
    `NEXT_PUBLIC_V2 must be "0", "1", or unset — got ${JSON.stringify(RAW)}.\n` +
      `  "1" or unset → v2 shell/router (default)\n` +
      `  "0"          → v1 shell (see below)\n` +
      `Refusing to guess: only the exact string "0" disables the flag, so a\n` +
      `value like "false" would have silently left v2 enabled.`,
  );
}

// ── 2. Read V2_ROUTER_GATED from the flag module (single source of truth) ──
// The regex is ANCHORED to a whole line (`^…$` with /m) and permits only a
// literal `true`/`false`. Rationale (§4a Codex High): an unanchored pattern
// matches inside COMMENTS and STRINGS, so a stale `// export const
// V2_ROUTER_GATED = true` sitting above the real `= false` would make this
// FAIL OPEN and permit an unsafe `NEXT_PUBLIC_V2=0` production build. Anchoring
// also makes any refactor the pattern doesn't understand (a computed value, a
// moved/renamed const) FAIL CLOSED — the script dies rather than guessing.
// A type annotation (`: boolean`) is tolerated because it changes nothing.
let routerGated = false;
try {
  const src = readFileSync(FLAG_MODULE, "utf8");
  // `matchAll` + a count assertion, not `.match` (which returns the FIRST hit
  // anywhere). Requiring EXACTLY ONE whole-line declaration means neither a
  // duplicate nor a stray commented-out copy can decide the policy.
  const hits = [
    ...src.matchAll(
      /^export const V2_ROUTER_GATED\s*(?::\s*boolean\s*)?=\s*(true|false)\s*;?\s*$/gm,
    ),
  ];
  if (hits.length !== 1) {
    die(
      `Expected EXACTLY ONE literal \`export const V2_ROUTER_GATED = true|false\`\n` +
        `on its own line in ${FLAG_MODULE} — found ${hits.length}.\n\n` +
        `This check fails CLOSED on purpose: it will not guess the router-gate\n` +
        `state. If you refactored or duplicated that constant, update this script\n` +
        `with it.`,
    );
  }
  routerGated = hits[0][1] === "true";
} catch (err) {
  die(`Could not read ${FLAG_MODULE}: ${err.message}`);
}

// ── 3. Production-artifact policy (build only) ─────────────────────────────
if (isBuild) {
  if (RAW === "0" && !routerGated) {
    die(
      `NEXT_PUBLIC_V2=0 is not shippable yet.\n\n` +
        `Only the CHROME half of the v2 gate exists (app/(planner)/layout.tsx).\n` +
        `The route canvases still mount v2 unconditionally, so a flag-OFF build\n` +
        `would ship v1 chrome wrapped around v2 screens — and would look like a\n` +
        `successful rollback while being nothing of the kind.\n\n` +
        `To unblock: land the router gates (DailyView.tsx, WeeklyShell.tsx,\n` +
        `app/(planner)/year/page.tsx), then set V2_ROUTER_GATED = true in\n` +
        `lib/v2-flag.ts — in the same change.\n\n` +
        `For a local v1-chrome regression harness (no build), use:\n` +
        `  NEXT_PUBLIC_V2=0 npm run dev`,
    );
  }
  if (RAW === undefined) {
    // Any artifact that can reach production must declare the value: an
    // operator who "rolls back" by setting NEXT_PUBLIC_V2=0 on the Worker
    // changes nothing — the value was frozen into the artifact at build.
    //
    // `CI` alone is not sufficient: `npm run deploy:cf` run from a developer's
    // machine is a real production path in this project, and `CI` is unset
    // there. `deploy:cf` therefore passes `--deploy`. (§4a L3.)
    //
    // A plain local `npm run build` stays a WARNING, not an error: making it
    // fatal everywhere is precisely the breakage that sank an earlier revision
    // (it would fail every developer's build and the §4a-mandated verification
    // stack).
    if (process.env.CI || isDeploy) {
      die(
        `NEXT_PUBLIC_V2 must be set explicitly for any deployable build.\n\n` +
          `It is inlined by \`next build\` and frozen into the artifact, so setting\n` +
          `it later in the Worker's RUNTIME environment has NO effect — a rollback\n` +
          `done that way would silently keep serving v2.\n\n` +
          `Set it in the BUILD environment: NEXT_PUBLIC_V2=1 (v2). "0" (v1) is\n` +
          `rejected until the router gates land.`,
      );
    }
    console.warn(
      `\n⚠ NEXT_PUBLIC_V2 is unset — building with the v2 shell/router (default ON).\n` +
        `  NEXT_PUBLIC_* is inlined by \`next build\` and frozen into the artifact:\n` +
        `  setting it later in the RUNTIME environment has NO effect. Declare it in\n` +
        `  the BUILD environment to make intent explicit. (Fatal in CI and on\n` +
        `  \`npm run deploy:cf\`.)\n`,
    );
  }
}

const state = RAW === "0" ? "v1 (flag OFF)" : "v2 (flag ON)";
console.log(
  `✓ NEXT_PUBLIC_V2 check passed — ${state}` +
    (isBuild ? `; router gates ${routerGated ? "present" : "NOT present"}` : ""),
);
