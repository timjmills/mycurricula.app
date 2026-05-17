import type { Config } from "tailwindcss";

/**
 * Tailwind is used for layout and spacing utilities only.
 *
 * Color, type, and spacing *tokens* are owned by `app/tokens.css`
 * (CSS custom properties ported from the design handoff). Do NOT add
 * `theme.extend.colors` here — that file is the single source of truth.
 * Preflight stays enabled for a predictable cross-browser baseline.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx,mdx}",
    "./components/**/*.{ts,tsx,mdx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
