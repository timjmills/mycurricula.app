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
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
