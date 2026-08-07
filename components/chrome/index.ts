// components/chrome — the v2 corner-grammar chrome (W3.3, Framework §3/§9b).
// ChromeShell is the host the (planner) layout mounts; the parts are exported
// for the W3.4 home console + W3.5 title/gear wave to compose directly.
export { ChromeShell } from "./ChromeShell";
export { ChromeTopBar } from "./ChromeTopBar";
export { ImmersiveBar } from "./ImmersiveBar";
// The immersive bar's idle auto-hide timer — exported for the tests and for
// any future immersive shell (notably the `(teach)` group, which does NOT
// mount ChromeShell and so does not get auto-hide today).
export {
  useImmersiveAutohide,
  IMMERSIVE_AUTOHIDE_DESKTOP_MS,
  IMMERSIVE_AUTOHIDE_TOUCH_MS,
  IMMERSIVE_AUTOHIDE_WIDE_MQ,
  IMMERSIVE_AUTOHIDE_TOUCH_MQ,
  IMMERSIVE_AUTOHIDE_MOUSE_WAKE_Y,
  IMMERSIVE_AUTOHIDE_TOUCH_WAKE_Y,
} from "./use-immersive-autohide";
export { ModeSwitch } from "./ModeSwitch";
export { ChromeContext } from "./ChromeContext";
export { ChromeClock } from "./ChromeClock";
export { ChromeQuote } from "./ChromeQuote";
// W3.5 — the per-view title + style gear (mounted by ChromeShell's title slot).
export { ViewTitle } from "./ViewTitle";
// W3.6 — the Day/Week View↔Edit toggle (mounted in the top bar's `.tools` slot).
export { ViewEditToggle } from "./ViewEditToggle";
// W3.4 — the segmented view console (home landing + compact view-nav variant).
// ConsoleNav is the bare segmented row, reused in the ImmersiveBar center.
export {
  HomeConsole,
  CompactConsole,
  ConsoleNav,
  COMPACT_CONSOLE_ROUTES,
} from "./Console";
// SideNav-retirement re-homes: the Tools popover + the account menu.
export { ChromeToolsMenu } from "./ChromeToolsMenu";
export { ChromeAccountMenu } from "./ChromeAccountMenu";
