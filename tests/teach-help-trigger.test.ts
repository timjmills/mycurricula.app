import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// #27 — the Teach Help overlay must have a trigger on the SHIPPED build.
//
// WHAT WAS BROKEN. `TeachHelpOverlay` is live and correct — `TeachOverlays`
// mounts it, and the zones contract has carried `setHelpOpen` all along. But
// `setHelpOpen(true)` was called from exactly ONE place: `TeachV1Zones.tsx`,
// the skin that only renders under `NEXT_PUBLIC_V2=0`. `TeachV2Shell`
// destructured `helpOpen` (for its Escape-layering deferral) and never the
// setter, so on the default build the dialog could not be opened at all.
//
// It bites harder here than the same bug would elsewhere: the planner shell's
// `GlobalShortcuts` — which owns the app-wide `?` overlay — is NOT mounted in
// the `(teach)` route group. That is precisely why Teach carries its own help
// overlay, and why losing its trigger left Teach with no help at all.
//
// TWO ROUTES ARE ASSERTED, deliberately. A keyboard-shortcuts dialog reachable
// only by a keyboard shortcut is barely better than one with no trigger; a
// mouse-only one fails the audience most likely to want it. Both must exist.

// Comments stripped before matching. Without this every assertion here FAILS
// OPEN — the same trap that let a commented-out mount pass in
// tests/teach-immersive-bar.test.ts, and this file's own subject is heavily
// commented with the identifiers it asserts.
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const read = (rel: string): string =>
  code(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));

const shell = read("../components/teach-v2/TeachV2Shell.tsx");
const icons = read("../components/teach-v2/icons.tsx");
const overlays = read("../components/teach/TeachOverlays.tsx");
const contract = read("../components/teach/zones-contract.ts");

describe("the Teach help overlay has a trigger under V2", () => {
  it("the contract still carries setHelpOpen, and TeachOverlays still mounts the dialog", () => {
    // Neither was the bug — recorded so a future "clean-up" cannot decide the
    // unused-looking setter is dead and delete the plumbing this depends on.
    expect(/setHelpOpen:\s*\(open: boolean\) => void;/.test(contract)).toBe(true);
    expect(/<TeachHelpOverlay\b/.test(overlays)).toBe(true);
  });

  it("TeachV2Shell destructures setHelpOpen — it previously took only helpOpen", () => {
    const destructure = shell.match(/const \{[\s\S]*?\} = props;/)?.[0];
    expect(destructure, "TeachV2Shell's props destructure could not be found").toBeDefined();
    expect(
      /\bsetHelpOpen\b/.test(destructure!),
      "TeachV2Shell no longer takes setHelpOpen out of the contract — the help dialog is unreachable again on the shipped build",
    ).toBe(true);
  });

  it("ROUTE 1 — a visible control opens it", () => {
    // Mouse/touch users, and the discovery path: nobody guesses `?`.
    expect(
      /iconAriaLabel="Help and keyboard shortcuts"/.test(shell),
      "the Help button is gone from the board header — the dialog is keyboard-only again",
    ).toBe(true);
    // Wired, not decorative.
    expect(/onClick=\{\(\) => setHelpOpen\(!helpOpen\)\}/.test(shell)).toBe(true);
    // It needs a glyph that actually resolves.
    expect(/\| "help"/.test(icons)).toBe(true);
    expect(/case "help":/.test(icons)).toBe(true);
    expect(/<V2Icon name="help"/.test(shell)).toBe(true);
  });

  it("ROUTE 2 — `?` opens it", () => {
    expect(
      /e\.key !== "\?"/.test(shell),
      "the `?` key binding is gone — a shortcuts dialog with no shortcut",
    ).toBe(true);
  });

  it("`?` does not fire while the teacher is typing", () => {
    // A teacher typing "?" into a note must get a question mark, not a dialog.
    // Verified live too: the field received "?" and the dialog stayed shut.
    const handler = shell.match(/const onKey = \(e: KeyboardEvent\): void => \{[\s\S]*?\n    \};/)?.[0];
    expect(handler, "the `?` keydown handler could not be found").toBeDefined();
    expect(/isContentEditable/.test(handler!)).toBe(true);
    for (const tag of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(handler!).toContain(tag);
    }
  });

  it("`?` does not hijack modifier chords", () => {
    // Ctrl/Cmd/Alt + the same physical key belongs to the browser or to
    // lib/use-teach-shortcuts.ts, which owns every modifier chord on this
    // surface.
    const handler = shell.match(/const onKey = \(e: KeyboardEvent\): void => \{[\s\S]*?\n    \};/)?.[0];
    expect(/e\.metaKey \|\| e\.ctrlKey \|\| e\.altKey/.test(handler!)).toBe(true);
  });

  it("the listener is removed on unmount", () => {
    // /teach is a long-lived surface and this effect re-binds whenever helpOpen
    // flips, so a missing teardown leaks a listener per toggle.
    expect(/removeEventListener\("keydown", onKey\)/.test(shell)).toBe(true);
  });
});
