import { describe, it, expect } from "vitest";

import { safeRelativePath, stripBypassParam } from "@/lib/claude-bypass";

// Tests for the open-redirect guard (audit finding #21). Each rejected case
// MUST fall back to the safe default "/weekly"; each accepted case MUST round-
// trip the in-app relative path unchanged.

const DEFAULT = "/weekly";

describe("safeRelativePath — accepts safe same-origin relative paths", () => {
  it("accepts a plain single-slash path", () => {
    expect(safeRelativePath("/daily")).toBe("/daily");
  });

  it("accepts a path with query + hash", () => {
    expect(safeRelativePath("/weekly?subject=math#top")).toBe(
      "/weekly?subject=math#top",
    );
  });

  it("accepts the root path", () => {
    expect(safeRelativePath("/")).toBe("/");
  });
});

describe("safeRelativePath — rejects open-redirect payloads", () => {
  it("rejects null / undefined / empty → default", () => {
    expect(safeRelativePath(null)).toBe(DEFAULT);
    expect(safeRelativePath(undefined)).toBe(DEFAULT);
    expect(safeRelativePath("")).toBe(DEFAULT);
  });

  it("rejects protocol-relative //evil", () => {
    expect(safeRelativePath("//evil.com")).toBe(DEFAULT);
  });

  it("rejects backslash host /\\evil", () => {
    expect(safeRelativePath("/\\evil.com")).toBe(DEFAULT);
  });

  it("rejects backslashes anywhere", () => {
    expect(safeRelativePath("/a\\b")).toBe(DEFAULT);
    expect(safeRelativePath("\\\\evil.com")).toBe(DEFAULT);
  });

  it("rejects absolute http(s) URLs", () => {
    expect(safeRelativePath("https://evil.com/x")).toBe(DEFAULT);
    expect(safeRelativePath("http://evil.com")).toBe(DEFAULT);
  });

  it("rejects scheme-bearing values not starting with /", () => {
    expect(safeRelativePath("javascript:alert(1)")).toBe(DEFAULT);
    expect(safeRelativePath("data:text/html,x")).toBe(DEFAULT);
    expect(safeRelativePath("mailto:a@b.com")).toBe(DEFAULT);
  });

  it("rejects values not starting with a single slash", () => {
    expect(safeRelativePath("weekly")).toBe(DEFAULT);
    expect(safeRelativePath("?x=1")).toBe(DEFAULT);
  });

  it("rejects control characters (tab / newline smuggling)", () => {
    expect(safeRelativePath("/we\tekly")).toBe(DEFAULT);
    expect(safeRelativePath("/we\nekly")).toBe(DEFAULT);
    expect(safeRelativePath("/\x00evil")).toBe(DEFAULT);
  });

  it("rejects the post-resolution path-traversal bypass /x/../..//evil", () => {
    // String-checks clean (single leading slash, no backslash) but resolves to
    // the pathname //evil — protocol-relative once re-emitted.
    expect(safeRelativePath("/x/../..//evil")).toBe(DEFAULT);
  });
});

describe("stripBypassParam — removes the secret from a URL", () => {
  it("strips ?claude= and ?token= while keeping other params", () => {
    const url = new URL(
      "https://app.test/weekly?claude=SECRET&token=ALSO&subject=math",
    );
    const out = stripBypassParam(url);
    expect(out.searchParams.has("claude")).toBe(false);
    expect(out.searchParams.has("token")).toBe(false);
    expect(out.searchParams.get("subject")).toBe("math");
  });
});
