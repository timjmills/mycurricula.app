// html-text.test.ts — the plain-text ↔ rich-text-heading round-trip
// contract (lib/html-text.ts).
//
// Two surfaces rename phases through plain-text inputs (the lesson-flow
// phase title and the agenda navigator's rename-in-place); both store via
// escapeHtml and display via stripHtml. If the pair ever diverges, a rename
// through one surface corrupts the other's display — these tests pin the
// shared contract.

import { describe, expect, it } from "vitest";
import { escapeHtml, stripHtml } from "@/lib/html-text";

describe("escapeHtml → stripHtml round-trip", () => {
  it("round-trips plain text unchanged", () => {
    expect(stripHtml(escapeHtml("Guided practice"))).toBe("Guided practice");
  });

  it("round-trips every escaped character", () => {
    const text = `Mixed & "quoted" <tags> 'apostrophes'`;
    expect(stripHtml(escapeHtml(text))).toBe(text);
  });

  it("round-trips text that LOOKS like an entity (the &amp;-last rule)", () => {
    // A teacher literally types "&lt;" — escaping yields "&amp;lt;", and
    // decoding &amp; LAST must restore the literal text, not produce "<".
    const text = "Use &lt; for less-than";
    expect(stripHtml(escapeHtml(text))).toBe(text);
  });

  it("escapes markup so typed text can never become live HTML", () => {
    const escaped = escapeHtml(`<img src=x onerror="alert(1)">`);
    expect(escaped).not.toContain("<");
    expect(escaped).not.toContain(">");
  });
});

describe("stripHtml display behavior", () => {
  it("strips tags and decodes basic entities", () => {
    expect(stripHtml("<b>Launch</b> &amp; share&nbsp;out")).toBe(
      "Launch & share out",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(stripHtml("  <p> Mini lesson </p>  ")).toBe("Mini lesson");
  });
});
