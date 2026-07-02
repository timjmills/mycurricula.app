// components/chrome — the v2 corner-grammar chrome (W3.3, Framework §3/§9b).
// ChromeShell is the host the (planner) layout mounts; the parts are exported
// for the W3.4 home console + W3.5 title/gear wave to compose directly.
export { ChromeShell } from "./ChromeShell";
export { ChromeTopBar } from "./ChromeTopBar";
export { ImmersiveBar } from "./ImmersiveBar";
export { ModeSwitch } from "./ModeSwitch";
export { ChromeContext } from "./ChromeContext";
export { ChromeClock } from "./ChromeClock";
export { ChromeQuote } from "./ChromeQuote";
// W3.5 — the per-view title + style gear (mounted by ChromeShell's title slot).
export { ViewTitle } from "./ViewTitle";
// W3.4 — the segmented view console (home landing + compact view-nav variant).
export { HomeConsole, CompactConsole, COMPACT_CONSOLE_ROUTES } from "./Console";
