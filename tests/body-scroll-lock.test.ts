import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createBodyScrollLock,
  type ScrollLockTarget,
} from "@/lib/use-body-scroll-lock";

// Tests for the shared refcounted body-scroll lock (task #16).
//
// These drive the REAL `createBodyScrollLock` — the same function the app's
// singleton is built from — against a stand-in target, because the vitest
// environment is `node` and this repo does not carry jsdom. The target is only
// an injection seam; every rule under test lives in the imported module, never
// restated here.

/** A `document.body`-shaped stand-in. */
function fakeBody(initial = ""): ScrollLockTarget {
  return { style: { overflow: initial } };
}

const bodyLock = (target: ScrollLockTarget) => createBodyScrollLock(() => target);

describe("body-scroll lock — the defect this replaces", () => {
  // THE FAILURE, CHARACTERISED. This is the four-line pattern the nine
  // overlays used to hand-roll, reproduced verbatim so the strand is visible
  // rather than asserted about. If this test ever goes green, the premise of
  // the shared hook has changed and the hook should be re-justified.
  it("per-overlay capture strands the page when two overlays close non-LIFO", () => {
    const body = fakeBody("");

    const openOverlay = () => {
      const prev = body.style.overflow; // ← captured PER OVERLAY: the bug
      body.style.overflow = "hidden";
      return () => {
        body.style.overflow = prev;
      };
    };

    const closeA = openOverlay(); // A captures ""
    const closeB = openOverlay(); // B captures "hidden"

    closeA(); // wrong order first
    expect(body.style.overflow).toBe(""); // unlocked while B is still open

    closeB();
    expect(body.style.overflow).toBe("hidden"); // stranded: nothing open, locked
  });

  it("the shared lock survives exactly that sequence", () => {
    const body = fakeBody("");
    const lock = bodyLock(body);

    const releaseA = lock.acquire();
    const releaseB = lock.acquire();

    releaseA();
    expect(body.style.overflow).toBe("hidden"); // still held for B
    expect(lock.depth).toBe(1);

    releaseB();
    expect(body.style.overflow).toBe(""); // released, once B is really gone
    expect(lock.depth).toBe(0);
  });
});

describe("body-scroll lock — refcount semantics", () => {
  it("locks on the first acquire and releases only on the last", () => {
    const body = fakeBody("");
    const lock = bodyLock(body);

    const r1 = lock.acquire();
    expect(body.style.overflow).toBe("hidden");
    const r2 = lock.acquire();
    const r3 = lock.acquire();
    expect(lock.depth).toBe(3);

    r1();
    r2();
    expect(body.style.overflow).toBe("hidden");

    r3();
    expect(body.style.overflow).toBe("");
    expect(lock.depth).toBe(0);
  });

  it("captures the pre-overlay value ONCE, not what the second overlay saw", () => {
    // A page that was already `overflow: clip` for its own reasons must get
    // `clip` back — not "", and not "hidden".
    const body = fakeBody("clip");
    const lock = bodyLock(body);

    const rA = lock.acquire();
    const rB = lock.acquire();
    expect(body.style.overflow).toBe("hidden");

    rA();
    rB();
    expect(body.style.overflow).toBe("clip");
  });

  it("re-captures the CURRENT value after a full release, not a stale one", () => {
    const body = fakeBody("");
    const lock = bodyLock(body);

    lock.acquire()();
    expect(body.style.overflow).toBe("");

    body.style.overflow = "auto"; // the page changed while nothing was open
    const r = lock.acquire();
    expect(body.style.overflow).toBe("hidden");
    r();
    expect(body.style.overflow).toBe("auto");
  });

  it("is idempotent per caller — a double release cannot drop the count", () => {
    // React StrictMode double-invokes effects in dev; a release called twice
    // must not unlock the page out from under a still-open overlay.
    const body = fakeBody("");
    const lock = bodyLock(body);

    const rA = lock.acquire();
    const rB = lock.acquire();

    rA();
    rA();
    rA();
    expect(lock.depth).toBe(1);
    expect(body.style.overflow).toBe("hidden");

    rB();
    expect(lock.depth).toBe(0);
    expect(body.style.overflow).toBe("");
  });

  it("survives a StrictMode mount → cleanup → mount around a live sibling", () => {
    const body = fakeBody("");
    const lock = bodyLock(body);

    const sibling = lock.acquire(); // an overlay that stays open

    const first = lock.acquire(); // StrictMode: mount…
    first(); // …cleanup…
    const second = lock.acquire(); // …mount again

    expect(body.style.overflow).toBe("hidden");
    second();
    sibling();
    expect(body.style.overflow).toBe("");
    expect(lock.depth).toBe(0);
  });

  it("is SSR-safe: no target means an inert lock and an inert release", () => {
    const lock = createBodyScrollLock(() => null);
    const release = lock.acquire();
    expect(lock.depth).toBe(0);
    expect(() => release()).not.toThrow();
    expect(lock.depth).toBe(0);
  });
});

// ── Adoption guard ──────────────────────────────────────────────────────────
//
// The hook only fixes anything if the overlays actually use it. A unit test on
// the lock cannot see a callsite that quietly goes back to hand-rolling, so
// this reads the real files. Reverting any one of them turns this red — which
// is what makes the suite a gate on the FIX rather than on the module.

const ADOPTERS = [
  "app/settings/layout.tsx",
  "components/catchup-v2/CatchUpModal.tsx",
  "components/resource-wall-v2/Lightbox.tsx",
  "components/resource-wall-v2/WallLibrary.tsx",
  "components/schedule/SchedulePanel.tsx",
  "components/standards/StandardsTaggingPicker.tsx",
  "components/weekly/WeeklyRailDrawer.tsx",
  "components/year-v2/ExplorerShell.tsx",
  "components/year/AddUnitDialog.tsx",
] as const;

const repoRoot = path.resolve(__dirname, "..");
const readSource = (rel: string) =>
  readFileSync(path.join(repoRoot, rel), "utf8");

describe("body-scroll lock — adoption", () => {
  it.each(ADOPTERS)("%s uses the shared hook", (rel) => {
    expect(readSource(rel)).toContain("useBodyScrollLock");
  });

  it.each(ADOPTERS)("%s does not hand-roll body.style.overflow", (rel) => {
    // Comments are stripped first so a file may still EXPLAIN the old pattern.
    const code = readSource(rel)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    expect(code).not.toMatch(/document\s*\.\s*body\s*\.\s*style\s*\.\s*overflow/);
  });

  it("no OTHER app file hand-rolls a body-scroll lock", () => {
    // Catches a tenth overlay being added with the old pattern. Scoped to the
    // app's own source; scripts/ probes legitimately READ the property.
    const tracked = execFileSyncSafe();
    const offenders = tracked.filter((rel) => {
      if (rel === "lib/use-body-scroll-lock.ts") return false;
      const code = readSource(rel)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^[ \t]*\/\/.*$/gm, "");
      return /document\s*\.\s*body\s*\.\s*style\s*\.\s*overflow\s*=/.test(code);
    });
    expect(offenders).toEqual([]);
  });
});

/**
 * Every .ts/.tsx under app/, components/ and lib/ that is ON DISK right now.
 *
 * ── WHY IT IS NOT JUST `git ls-files` (2026-08-01) ─────────────────────────
 * `git ls-files` enumerates the INDEX, which disagrees with the disk in two
 * ways, and this guard met both while the retired Day frames were deleted:
 *
 *   • Listed but gone — a file deleted in the working tree and not yet staged
 *     is still in the index, and `readSource` threw ENOENT, taking the whole
 *     assertion down. A path that does not exist cannot hand-roll anything, so
 *     dropping it here cannot hide an offender.
 *   • On disk but not listed — a file that is NEW and not yet staged was not
 *     scanned at all, so a tenth overlay could hand-roll `body.style.overflow`
 *     and pass this guard until someone ran `git add`. That is precisely the
 *     case this test exists to catch, and precisely the moment it was blind.
 *     `--others --exclude-standard` adds them while honouring .gitignore.
 *
 * KNOWN REMAINING HOLE, deliberately left for its owner: the tracked half uses
 * `git ls-files "lib/**\/*.ts"`-style pathspecs, which silently require at
 * least one intermediate directory — so every top-level `lib/*.ts` is invisible
 * to the tracked listing (tests/no-mock-in-live-surfaces.test.ts documents the
 * same trap and globs in JS instead to avoid it). Widening it here could surface
 * pre-existing offenders that belong to other work; it is reported rather than
 * fixed in passing.
 */
function execFileSyncSafe(): string[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { existsSync } = require("node:fs") as typeof import("node:fs");
  const run = (args: string[]): string[] =>
    execFileSync("git", ["ls-files", ...args], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
    })
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

  const tracked = run([
    "app/**/*.ts",
    "app/**/*.tsx",
    "components/**/*.ts",
    "components/**/*.tsx",
    "lib/**/*.ts",
    "lib/**/*.tsx",
  ]);
  const untracked = run(["--others", "--exclude-standard"]).filter(
    (p) => /^(app|components|lib)\//.test(p) && /\.tsx?$/.test(p),
  );
  return [...new Set([...tracked, ...untracked])]
    .filter((rel) => existsSync(path.join(repoRoot, rel)))
    .sort();
}
