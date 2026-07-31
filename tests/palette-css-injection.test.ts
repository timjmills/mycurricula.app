import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { PaletteProvider } from "@/lib/palette";
import {
  DEFAULT_SUBJECT_MAPPING,
  type SubjectMapping,
} from "@/lib/palette-data";

// The CSS-injection contract for the app's ONE css-TEXT sink.
//
// `PaletteCssBridge` (lib/palette.tsx) builds a stylesheet by STRING
// CONCATENATION and hands it to `<style>{css}</style>`. That shape is the
// dangerous one: unlike a React style OBJECT — which reaches CSSOM through
// `setProperty(name, value)` and structurally cannot create a new declaration or
// rule — a concatenated stylesheet lets a `;` or `}` inside an interpolated
// value close the declaration and open rules of the attacker's choosing.
//
// It is the only such sink in the app: `<style`, `cssText`, `insertRule` and
// `adoptedStyleSheets` together match exactly one line of app code (this one).
//
// TODAY THE SINK IS NOT REACHABLE from any team-writable field, and these tests
// pin the two independent reasons — so a future "custom subject colour" (a
// decided, unbuilt feature) cannot quietly connect the two ends:
//
//   1. Every interpolated VALUE comes from a static table (SUBJECT_SWATCHES /
//      PALETTE_20 hexes, and token references derived from a swatch id that
//      matched /^subj-\d+$/).
//   2. The one caller-supplied input — `mapping` — is used ONLY as a lookup
//      KEY, and an unknown key falls back to `PALETTE_BY_ID["subj-1"]`.
//
// The team-writable column that a reader might expect to arrive here,
// `subjects.color` (text, NO check constraint, scope='team'), never reaches this
// component at all: the bridge maps over the static `SUBJECTS` list, and the
// column is allowlist-validated into a `SubjectId` at the read boundary by
// `subjectSlugOf` (lib/planner/supabase-source.ts) before the app ever sees it.

/** The declaration a break-out would add. Chosen because it is what a hostile
 *  colleague would actually reach for: it covers the viewport of every teammate
 *  and cannot be dismissed. */
const BREAKOUT = "position:fixed";

/** Hostile values shaped for THIS sink: close the declaration, close the rule,
 *  open a new one. The last also tries to escape the element itself. */
const HOSTILE = [
  "red; position:fixed; inset:0; z-index:9999",
  "red } body { position:fixed; inset:0; background:#000 } .x {",
  "url(https://evil.test/beacon.png)",
  "</style><style>body{position:fixed}",
] as const;

/** PaletteProvider mounts the bridge itself, so rendering it with no children
 *  yields exactly the one <style> the app ships — nesting a second
 *  <PaletteCssBridge> as a child would emit two and make every count wrong. */
function renderBridge(mapping: SubjectMapping): string {
  return renderToStaticMarkup(
    createElement(PaletteProvider, { mapping, children: null }),
  );
}

describe("PaletteCssBridge — the emitted stylesheet is what it claims to be", () => {
  it("emits real rules for the locked subjects (the positive control)", () => {
    // Without this every assertion below passes on a component that rendered
    // nothing at all — the absence-assertion fail-open this repo keeps paying
    // for.
    const html = renderBridge(DEFAULT_SUBJECT_MAPPING);
    expect(html).toContain(".cp-subj.math {");
    expect(html).toContain("--c:");
    expect(html).toContain("--sc:");
  });

  it("emits exactly one rule per subject and no more", () => {
    // The structural invariant a break-out violates: a closing brace count above
    // the subject count means somebody opened a rule this component did not.
    const html = renderBridge(DEFAULT_SUBJECT_MAPPING);
    const opens = (html.match(/\{/g) ?? []).length;
    const closes = (html.match(/\}/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(closes).toBe(Object.keys(DEFAULT_SUBJECT_MAPPING).length);
  });

  it("only ever emits token references or hex literals as values", () => {
    // Pins reason (1): the value space is `var(--…)` and `#rrggbb`, plus the
    // one `color-mix(in oklch, …)` tint fallback for legacy swatches. Nothing
    // here can carry a `;` or a `}`.
    const html = renderBridge(DEFAULT_SUBJECT_MAPPING);
    const values = Array.from(html.matchAll(/--[a-z]+:\s*([^;]+);/g)).map((m) =>
      m[1].trim(),
    );
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) {
      expect(v).toMatch(
        /^(var\(--[a-z0-9-]+\)|#[0-9A-Fa-f]{3,8}|color-mix\(in oklch, #[0-9A-Fa-f]{3,8} \d+%, var\(--[a-z0-9-]+\)\))$/,
      );
    }
  });
});

describe("a hostile mapping cannot reach the stylesheet", () => {
  // `mapping` is the only caller-supplied input, and the only one a future
  // "custom colour" feature would be tempted to widen from a swatch ID into a
  // colour VALUE. Each hostile string is fed in as the swatch id for `math`.
  it.each(HOSTILE)("drops %j and falls back to the default swatch", (evil) => {
    const html = renderBridge({ ...DEFAULT_SUBJECT_MAPPING, math: evil });

    // The value never appears, in any form.
    expect(html).not.toContain(evil);
    expect(html).not.toContain(BREAKOUT);
    expect(html).not.toContain("evil.test");
    // Still exactly one rule per subject: nothing was opened or closed extra.
    expect((html.match(/\}/g) ?? []).length).toBe(
      Object.keys(DEFAULT_SUBJECT_MAPPING).length,
    );
    // And math still gets a usable colour rather than an empty rule.
    expect(html).toMatch(
      /\.cp-subj\.math \{ --c: var\(--subj-\d+(-bright)?\);/,
    );
  });

  it("cannot break out of the <style> element itself", () => {
    // THE SEVERITY BOUND, and it is React's doing rather than this app's — which
    // is why it is measured here instead of reasoned about.
    //
    // React 19 does NOT html-escape `<style>` children (they are raw text). It
    // applies a CSS-specific escape to the one sequence that could end the
    // element, so `</style>` is emitted as `</\73 tyle>` — a CSS identifier
    // escape for "s". Verified against this exact input:
    //
    //   .cp-subj.math { --c: </\73 tyle><script>alert(1)</script>; … }
    //
    // So a literal `<script>` DOES appear in the output and is INERT: nothing
    // closed the raw-text element, so the HTML parser never sees a tag. An
    // earlier version of this test asserted `not.toContain("<script>")` and went
    // red on a build where the security property held perfectly — a test that
    // would have reported this sink as stored XSS. It is not. It is CSS-level.
    const html = renderBridge({
      ...DEFAULT_SUBJECT_MAPPING,
      math: "</style><script>alert(1)</script>",
    });
    expect(html.match(/<style>/g) ?? []).toHaveLength(1);
    expect(html.match(/<\/style>/g) ?? []).toHaveLength(1);
    expect(html).not.toContain("</style><script>");
  });
});
