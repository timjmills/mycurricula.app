import { describe, it, expect } from "vitest";

import { sanitizeHtml } from "@/lib/sanitize-html";

// Tests for the strict HTML sanitizer (audit finding #9 — stored XSS).
// Each assertion is written to FAIL if the corresponding protection regresses.

describe("sanitizeHtml — XSS stripping", () => {
  it("strips <script> tags entirely", () => {
    const out = sanitizeHtml("<b>hi</b><script>alert(1)</script>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert(1)");
    // The benign content survives.
    expect(out).toContain("<b>hi</b>");
  });

  it("removes on* event-handler attributes", () => {
    const out = sanitizeHtml('<p onclick="alert(1)">x</p>');
    expect(out.toLowerCase()).not.toContain("onclick");
    expect(out).not.toContain("alert(1)");
    expect(out).toContain("x");
  });

  it("removes onerror on an injected element", () => {
    const out = sanitizeHtml('<img src=x onerror="alert(1)">');
    expect(out.toLowerCase()).not.toContain("onerror");
    // <img> is in FORBID_TAGS, so it must not survive at all.
    expect(out.toLowerCase()).not.toContain("<img");
  });

  it("strips javascript: URLs from <a href>", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(out.toLowerCase()).not.toContain("javascript:");
    // The link text is preserved even if the href is dropped.
    expect(out).toContain("click");
  });

  it("strips data: URLs from <a href>", () => {
    const out = sanitizeHtml(
      '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    );
    expect(out.toLowerCase()).not.toContain("data:");
    expect(out.toLowerCase()).not.toContain("<script");
  });

  it("strips disallowed tags (iframe, object, svg)", () => {
    const out = sanitizeHtml(
      '<iframe src="//evil"></iframe><object></object><svg></svg>',
    );
    expect(out.toLowerCase()).not.toContain("<iframe");
    expect(out.toLowerCase()).not.toContain("<object");
    expect(out.toLowerCase()).not.toContain("<svg");
  });
});

describe("sanitizeHtml — allowed content + link hardening", () => {
  it("preserves the allowed formatting vocabulary", () => {
    const out = sanitizeHtml(
      "<p>a</p><strong>b</strong><em>c</em><ul><li>d</li></ul>",
    );
    expect(out).toContain("<p>a</p>");
    expect(out).toContain("<strong>b</strong>");
    expect(out).toContain("<em>c</em>");
    expect(out).toContain("<li>d</li>");
  });

  it("forces rel=noopener noreferrer and target=_blank on surviving links", () => {
    const out = sanitizeHtml('<a href="https://example.com">x</a>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });

  it("keeps mailto links (an allowed scheme)", () => {
    const out = sanitizeHtml('<a href="mailto:a@b.com">mail</a>');
    expect(out).toContain("mailto:a@b.com");
  });

  it("returns empty string for non-string / empty input", () => {
    expect(sanitizeHtml("")).toBe("");
    // @ts-expect-error — exercising the runtime non-string guard.
    expect(sanitizeHtml(null)).toBe("");
    // @ts-expect-error — exercising the runtime non-string guard.
    expect(sanitizeHtml(undefined)).toBe("");
  });
});
