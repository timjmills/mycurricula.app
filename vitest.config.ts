import { defineConfig } from "vitest/config";

// Minimal vitest config for the automated test gate (audit finding #25).
//
// The units under test are pure (no React render, no DB, no network):
//   • lib/sanitize-html.ts  — DOMPurify-backed; server path runs under node via linkedom.
//   • lib/claude-bypass.ts  — safeRelativePath / stripBypassParam (pure URL logic).
//   • lib/week-order.ts     — orderedWeekdaysFrom (pure mapping).
//   • lib/use-school-week.ts — pure constants + detectSchoolWeekPreset.
//
// `environment: "node"` is sufficient: sanitize-html's server path builds its
// own linkedom-backed DOM, so we don't need vitest's jsdom environment. The `@/` path alias is
// resolved here so test imports match the app's tsconfig paths.
export default defineConfig({
  // The app's tsconfig sets `jsx: "preserve"` (Next.js transforms JSX
  // itself), which vitest's transform honors — leaving raw JSX in any
  // imported .tsx module and breaking import analysis. Tests that import
  // pure helpers exported from a component file (e.g. the floating bar's
  // placement geometry in components/lesson-editor/FloatingBar.tsx) need
  // the JSX compiled. Vitest 4 bundles rolldown-vite, whose Oxc transform
  // reads the tsconfig directly — the `oxc.jsx` option is the override that
  // wins (the legacy `esbuild.jsx` / `esbuild.tsconfigRaw` forms are
  // converted but lose to the tsconfig read; verified empirically).
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // 21 of the 26 files that use `mountReact` open with their own
    // `vi.setConfig({ testTimeout: 30000 })`. A workaround pasted 21 times is a
    // default in the wrong place, and the five files that had not copied it
    // were the ones that went red under load. Hoisting it here changes no
    // existing suite's budget — 30000 is the value they all already chose — it
    // only stops the next mount suite from having to know the incantation.
    //
    // `hookTimeout` is a SEPARATE budget (default 10000) and beforeEach hooks
    // here do the same mounting, so it is raised too; setting only testTimeout
    // leaves the same trap one level down.
    //
    // What this is NOT: the fix for the flake that prompted it. On 2026-08-01 a
    // day of intermittent mount-suite failures — the red kept moving between
    // files, which should have been the tell — turned out to be 66 wedged
    // vitest worker processes from 22 abandoned runs, the oldest ~12 hours old,
    // still resident and competing for CPU. With them killed the full suite
    // went from "40 failed, 26 errors, >10 min, still running" to 2726 passed
    // in 14 seconds, and the 14 files that had just failed passed in 5.53s.
    // Timing measured under that load said mount suites needed ~5s each; the
    // real figure on an idle machine is ~1.5s. So if mount suites start failing
    // on timeout again, this ceiling is not the thing to raise — count the
    // stray `node.exe` processes first.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
