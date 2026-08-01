import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Guard: the modules we load through next/dynamic must NOT also be reachable
// through a static value import.
//
// WHY THIS TEST EXISTS
// `next/dynamic` only defers the module reached through THAT import. If any
// other module in a route's graph value-imports the same file, the module is
// statically reachable and ships in the initial bundle anyway — the dynamic()
// call buys nothing. This is silent: nothing errors, no test fails, and the
// source still *looks* lazy. Both of the planner's composer boundaries were
// defeated this way for months, and the comment in ComposerHost.tsx asserted
// the opposite the whole time:
//   • ResourceComposer — ResourcesPanel, AddResourceMenu and AllToolsMenu each
//     value-imported `fileToCapturedItem` from it.
//   • ResMenu — components/composer/index.ts re-exported the component, and
//     ResMenuTrigger value-imported `hasResMenuActions` from it.
// Measured cost: the whole composer island (dialog + All-tools capture wall +
// rich-text editor + their CSS) rode /weekly's initial JS.
//
// The helpers those callsites needed now live in leaf modules
// (components/daily/captured-item.ts, components/composer/composer-state.ts),
// and neither lazy module re-exports them — so the common regression fails to
// COMPILE. This test covers the rest: a fresh `import { X } from "./ResMenu"`,
// or a new barrel re-export, that compiles fine but silently re-fattens the
// bundle.
//
// WHAT IT MODELS: the bundler's module graph, following runtime edges only.
// `import type` / `export type` are erased by tsc and are NOT edges. A
// dynamic `import("...")` is a lazy edge and is deliberately not followed —
// that is the whole point of the boundary.
//
// If this test fails, do NOT delete the assertion. Read the printed chain: it
// names the exact import that re-defeated the boundary. Move the shared helper
// into a leaf module instead (see components/daily/captured-item.ts for the
// pattern), or justify why the module must now ship eagerly and remove its
// next/dynamic wrapper so the source stops lying.

const ROOT = path.resolve(__dirname, "..");

// Entry points whose INITIAL bundle we care about. /weekly is the app's default
// landing route; the two layouts wrap every planner route.
const ENTRIES = [
  "app/(planner)/weekly/page.tsx",
  "app/(planner)/layout.tsx",
  "app/layout.tsx",
];

// Modules that must only ever be reached through next/dynamic.
const LAZY_ONLY = [
  "components/daily/ResourceComposer.tsx",
  "components/composer/ResMenu.tsx",
  // Rides inside the composer island — only ResourceComposer imports it.
  "components/daily/AllToolsMenu.tsx",
  // The real rich-text editor. components/rich-text/rich-text-editor.lazy.tsx
  // is the reachable wrapper; the editor itself must stay behind it.
  "components/rich-text/rich-text-editor.tsx",
];

const EXTS = [".tsx", ".ts", ".jsx", ".js", ".mjs"];

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

/** Resolve an import specifier to a file on disk, or null for bare packages. */
function resolveSpec(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // bare package — a leaf, not walked
  const norm = toPosix(base);
  if (/\.(css|scss|svg|png|jpg|json)$/.test(norm)) return norm;
  for (const e of EXTS) if (fs.existsSync(norm + e)) return norm + e;
  if (fs.existsSync(norm) && fs.statSync(norm).isDirectory()) {
    for (const e of EXTS) {
      const idx = `${norm}/index${e}`;
      if (fs.existsSync(idx)) return idx;
    }
  }
  if (fs.existsSync(norm) && fs.statSync(norm).isFile()) return norm;
  return null;
}

/** Strip comments so a commented-out import is not treated as an edge. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

/** Every STATIC (runtime) import/re-export specifier in one module's source. */
function staticSpecs(src: string): string[] {
  const code = stripComments(src);
  const out: string[] = [];

  const importRe =
    /^[ \t]*import\s+(type\s+)?([\s\S]*?)from\s*["']([^"']+)["']|^[ \t]*import\s*["']([^"']+)["']/gm;
  for (const m of code.matchAll(importRe)) {
    if (m[4]) {
      out.push(m[4]); // bare side-effect import
      continue;
    }
    if (m[1]) continue; // `import type { ... } from` — erased by tsc
    const clause = m[2] ?? "";
    const named = clause.match(/\{([\s\S]*)\}/);
    const outsideBraces = clause
      .replace(/\{[\s\S]*\}/, "")
      .replace(/^,|,$/g, "")
      .trim();
    // A clause whose every named specifier is inline-`type`, with no default or
    // namespace binding, is erased entirely.
    if (named && !outsideBraces) {
      const specs = named[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (specs.length > 0 && specs.every((s) => /^type\s/.test(s))) continue;
    }
    out.push(m[3]);
  }

  const exportRe = /^[ \t]*export\s+(type\s+)?([\s\S]*?)from\s*["']([^"']+)["']/gm;
  for (const m of code.matchAll(exportRe)) {
    if (m[1]) continue; // `export type { ... } from` — erased
    const clause = m[2] ?? "";
    const named = clause.match(/\{([\s\S]*)\}/);
    if (named) {
      const specs = named[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (specs.length > 0 && specs.every((s) => /^type\s/.test(s))) continue;
    }
    out.push(m[3]);
  }

  return out;
}

/** BFS the static graph from ENTRIES. Returns parent links for chain printing. */
function walkStaticGraph(): Map<string, string | null> {
  const parents = new Map<string, string | null>();
  const queue: string[] = [];

  for (const e of ENTRIES) {
    const f = toPosix(path.join(ROOT, e));
    // A renamed/moved entry would make this test vacuously pass — fail loudly.
    expect(fs.existsSync(f), `entry point missing: ${e}`).toBe(true);
    parents.set(f, null);
    queue.push(f);
  }

  while (queue.length) {
    const file = queue.shift() as string;
    if (/\.(css|json|svg|png|jpg)$/.test(file)) continue;
    let src: string;
    try {
      src = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const spec of staticSpecs(src)) {
      const r = resolveSpec(spec, file);
      if (!r || parents.has(r)) continue;
      parents.set(r, file);
      queue.push(r);
    }
  }
  return parents;
}

function chainTo(parents: Map<string, string | null>, file: string): string {
  const out: string[] = [];
  let cur: string | null = file;
  while (cur) {
    out.push(cur.replace(`${ROOT.split(path.sep).join("/")}/`, ""));
    cur = parents.get(cur) ?? null;
  }
  return out.reverse().join("\n    -> ");
}

describe("bundle: next/dynamic boundaries are not defeated by a static import", () => {
  const parents = walkStaticGraph();

  // Control: the walker must actually reach things, otherwise every assertion
  // below passes vacuously (a graph of 0 modules trivially contains nothing).
  // This test's whole value is an ABSENCE assertion, and absence assertions
  // fail open — so prove the instrument works before trusting its silence.
  it("reaches a large graph and a known-eager module (instrument control)", () => {
    expect(parents.size).toBeGreaterThan(200);
    const known = toPosix(path.join(ROOT, "components/composer/ComposerHost.tsx"));
    expect(
      parents.has(known),
      "ComposerHost is mounted by the planner layout and MUST be statically reachable; if it is not, this walker is broken and every assertion below is meaningless",
    ).toBe(true);
  });

  for (const target of LAZY_ONLY) {
    it(`${target} is not statically reachable from the planner entries`, () => {
      const abs = toPosix(path.join(ROOT, target));
      // A moved/renamed target would also make this vacuous — assert it exists.
      expect(fs.existsSync(abs), `target missing: ${target}`).toBe(true);
      const reachable = parents.has(abs);
      expect(
        reachable,
        reachable
          ? `${target} is in the INITIAL bundle despite next/dynamic. ` +
              `A static value import defeats the lazy boundary. Chain:\n    ${chainTo(parents, abs)}\n` +
              `Fix: move the shared helper into a leaf module (see components/daily/captured-item.ts), ` +
              `not by deleting this assertion.`
          : "",
      ).toBe(false);
    });
  }
});
