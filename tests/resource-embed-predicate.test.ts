import { describe, it, expect } from "vitest";

import { canEmbedResource, embedDenialReason } from "@/lib/resource-embed";
import type { LessonResource } from "@/lib/types";

// Tests for the single embed authority (6.12.26 redesign P5):
// canEmbedResource decides iframe/native embed vs. the designed link-card
// fallback. Fail-closed — anything uncertain returns false, never throws.

const res = (overrides: Partial<LessonResource>): LessonResource => ({
  type: "link",
  label: "Resource",
  ...overrides,
});

describe("canEmbedResource — hosted rows (same-origin /api/resources)", () => {
  it("embeds a hosted image (root-relative url + resourceId + mimeType)", () => {
    const r = res({
      type: "image",
      resourceId: "r-img",
      url: "/api/resources/r-img",
      mimeType: "image/png",
    });
    expect(canEmbedResource(r)).toBe(true);
    expect(embedDenialReason(r)).toBeNull();
  });

  it("embeds a hosted pdf", () => {
    const r = res({
      type: "pdf",
      resourceId: "r-pdf",
      url: "/api/resources/r-pdf",
      mimeType: "application/pdf",
    });
    expect(canEmbedResource(r)).toBe(true);
  });

  it("embeds hosted video/audio via mimeType or provider", () => {
    expect(
      canEmbedResource(
        res({
          resourceId: "r-v",
          url: "/api/resources/r-v",
          mimeType: "video/mp4",
        }),
      ),
    ).toBe(true);
    expect(
      canEmbedResource(
        res({
          resourceId: "r-a",
          url: "/api/resources/r-a",
          provider: "audio",
        }),
      ),
    ).toBe(true);
  });

  it("does NOT embed a hosted row with no media kind", () => {
    const r = res({ resourceId: "r-x", url: "/api/resources/r-x" });
    expect(canEmbedResource(r)).toBe(false);
    expect(embedDenialReason(r)).toBe("not-embeddable");
  });

  it("rejects protocol-relative urls (foreign origin, not hosted)", () => {
    const r = res({
      url: "//evil.example/api/resources/x",
      mimeType: "image/png",
    });
    expect(canEmbedResource(r)).toBe(false);
    expect(embedDenialReason(r)).toBe("unsafe-scheme");
  });
});

describe("canEmbedResource — session blob: rows (teacher-minted uploads)", () => {
  it("embeds a session blob: pdf (M3 — fresh upload previews in the iframe)", () => {
    const r = res({
      type: "pdf",
      url: "blob:https://app.example/4f1c-9a2b",
      mimeType: "application/pdf",
    });
    expect(canEmbedResource(r)).toBe(true);
    expect(embedDenialReason(r)).toBeNull();
  });

  it("embeds blob: image/video/audio via mimeType or provider", () => {
    expect(
      canEmbedResource(
        res({ url: "blob:https://app.example/img", mimeType: "image/png" }),
      ),
    ).toBe(true);
    expect(
      canEmbedResource(
        res({ url: "blob:https://app.example/vid", provider: "video" }),
      ),
    ).toBe(true);
    expect(
      canEmbedResource(
        res({ url: "blob:https://app.example/aud", mimeType: "audio/mpeg" }),
      ),
    ).toBe(true);
  });

  it("does NOT embed a blob: row that is not media — link card instead", () => {
    const r = res({ url: "blob:https://app.example/mystery" });
    expect(canEmbedResource(r)).toBe(false);
    expect(embedDenialReason(r)).toBe("not-embeddable");
  });
});

describe("canEmbedResource — provider urls (delegates to parseResourceUrl)", () => {
  it("embeds youtube / vimeo / google slides urls", () => {
    expect(
      canEmbedResource(
        res({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
      ),
    ).toBe(true);
    expect(canEmbedResource(res({ url: "https://vimeo.com/12345678" }))).toBe(
      true,
    );
    expect(
      canEmbedResource(
        res({ url: "https://docs.google.com/presentation/d/abc123/edit" }),
      ),
    ).toBe(true);
  });

  it("embeds direct media extensions", () => {
    expect(
      canEmbedResource(res({ url: "https://cdn.example.com/photo.jpg" })),
    ).toBe(true);
    expect(
      canEmbedResource(res({ url: "https://cdn.example.com/doc.pdf" })),
    ).toBe(true);
  });

  it("does NOT embed a bare website url — link card instead", () => {
    const r = res({ url: "https://example.com/some-article" });
    expect(canEmbedResource(r)).toBe(false);
    expect(embedDenialReason(r)).toBe("not-embeddable");
  });
});

describe("canEmbedResource — fail-closed edges", () => {
  it("false when url is missing (legacy fixture rows)", () => {
    const r = res({ label: "Legacy glyph row" });
    expect(canEmbedResource(r)).toBe(false);
    expect(embedDenialReason(r)).toBe("no-url");
  });

  it("false for whitespace-only url", () => {
    expect(canEmbedResource(res({ url: "   " }))).toBe(false);
  });

  it("false for notecards — gallery items are evaluated per-item", () => {
    const r = res({
      type: "notecard",
      label: "Notes",
      gallery: [res({ type: "image", url: "https://a.com/x.png" })],
    });
    expect(canEmbedResource(r)).toBe(false);
    expect(embedDenialReason(r)).toBe("not-embeddable");
  });

  it("false (no throw) for malformed / dangerous url strings", () => {
    for (const url of [
      "not a url at all",
      "javascript:alert(1)",
      "data:text/html,<script>x</script>",
      "ht!tp://broken",
    ]) {
      expect(() => canEmbedResource(res({ url }))).not.toThrow();
      expect(canEmbedResource(res({ url }))).toBe(false);
    }
  });

  it("javascript: stays fail-closed even when the row claims a media kind", () => {
    const r = res({
      type: "pdf",
      url: "javascript:alert(1)",
      mimeType: "application/pdf",
    });
    expect(canEmbedResource(r)).toBe(false);
    expect(embedDenialReason(r)).toBe("unsafe-scheme");
  });
});
