import { describe, it, expect } from "vitest";

import {
  canEmbedResource,
  embedDenialReason,
  isSafeUrl,
  isSafeImgSrc,
} from "@/lib/resource-embed";
import { boardCanEmbed, isSafeBoardUrl } from "@/lib/board-embed";
import { toTeachResource } from "@/lib/teach/toTeachResource";
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

describe("canEmbedResource — provider-spoofed native video/audio rows", () => {
  // FIX 1 parity: VideoEmbed/AudioEmbed gate their <video>/<audio src> through
  // isSafeUrl, so a crafted/imported row that CLAIMS provider:"video"/"audio"
  // but carries a dangerous scheme must be judged non-embeddable here too (the
  // scheme check fires before the media-kind/parse path, so the verdict is
  // "unsafe-scheme", never embeddable).
  it("does NOT embed a provider:video row with a data: url", () => {
    const r = res({
      type: "youtube",
      provider: "video",
      url: "data:video/mp4;base64,AAAA",
    });
    expect(canEmbedResource(r)).toBe(false);
    expect(embedDenialReason(r)).toBe("unsafe-scheme");
  });

  it("does NOT embed a provider:video row with a protocol-relative url", () => {
    const r = res({ provider: "video", url: "//evil.example/x.mp4" });
    expect(canEmbedResource(r)).toBe(false);
    expect(embedDenialReason(r)).toBe("unsafe-scheme");
  });

  it("does NOT embed a provider:audio row with a javascript: url", () => {
    const r = res({ provider: "audio", url: "javascript:alert(1)" });
    expect(canEmbedResource(r)).toBe(false);
    expect(embedDenialReason(r)).toBe("unsafe-scheme");
  });

  it("does NOT embed a provider:audio row with a data: url", () => {
    const r = res({
      provider: "audio",
      url: "data:audio/mpeg;base64,AAAA",
    });
    expect(canEmbedResource(r)).toBe(false);
    expect(embedDenialReason(r)).toBe("unsafe-scheme");
  });

  it("still embeds a safe https direct-media video/audio row", () => {
    expect(
      canEmbedResource(res({ provider: "video", url: "https://cdn.x/a.mp4" })),
    ).toBe(true);
    expect(
      canEmbedResource(res({ provider: "audio", url: "https://cdn.x/a.mp3" })),
    ).toBe(true);
  });
});

describe("isSafeBoardUrl — board scheme gate (parity with ResourceEmbed)", () => {
  it("allows http(s), blob:, and same-origin root-relative", () => {
    expect(isSafeBoardUrl("https://x.com/a.png")).toBe(true);
    expect(isSafeBoardUrl("http://x.com/a.png")).toBe(true);
    expect(isSafeBoardUrl("blob:https://app/abc")).toBe(true);
    expect(isSafeBoardUrl("/api/resources/r-1")).toBe(true);
  });

  it("rejects protocol-relative, backslash tricks, and script schemes", () => {
    expect(isSafeBoardUrl("//evil.example/x")).toBe(false);
    expect(isSafeBoardUrl("/\\evil.example/x")).toBe(false);
    expect(isSafeBoardUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeBoardUrl("data:text/html,<script>x</script>")).toBe(false);
    expect(isSafeBoardUrl(undefined)).toBe(false);
    expect(isSafeBoardUrl(null)).toBe(false);
  });
});

describe("boardCanEmbed — single-authority parity on the board path", () => {
  // FIX 2: boardCanEmbed now defers to canEmbedResource (re-keyed onto the
  // resolved board src), so notecards and unsafe-scheme rows that the old
  // `parsed?.canEmbed` check let through are correctly rejected on the board.
  // parsed/kind are no longer consulted for the verdict — pass null/"link".
  const board = (overrides: Partial<LessonResource>) =>
    toTeachResource(res(overrides));

  it("does NOT embed a notecard on the board (gallery container, not a frame)", () => {
    const note = board({
      type: "notecard",
      label: "Notes",
      gallery: [res({ type: "image", url: "https://a.com/x.png" })],
    });
    expect(boardCanEmbed(note, null, "link")).toBe(false);
  });

  it("does NOT embed an unsafe-scheme row on the board", () => {
    const protoRel = board({ provider: "video", url: "//evil/x.mp4" });
    expect(boardCanEmbed(protoRel, null, "video")).toBe(false);
    const scriptPdf = board({
      type: "pdf",
      url: "javascript:alert(1)",
      mimeType: "application/pdf",
    });
    expect(boardCanEmbed(scriptPdf, null, "pdf")).toBe(false);
  });

  it("does NOT embed a bare website link on the board", () => {
    const link = board({ url: "https://example.com/article" });
    expect(boardCanEmbed(link, null, "link")).toBe(false);
  });

  it("embeds a trusted-provider / direct-media row on the board", () => {
    const yt = board({ url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    expect(boardCanEmbed(yt, null, "embed")).toBe(true);
    const img = board({ url: "https://cdn.example.com/photo.jpg" });
    expect(boardCanEmbed(img, null, "image")).toBe(true);
  });

  it("embeds a hosted (resourceId-only) media file via the resolved /api/resources src", () => {
    // No top-level url — resolveBoardSrc yields "/api/resources/{id}", which
    // canEmbedResource approves via its ROOT_RELATIVE + media-kind path.
    const hosted = board({
      type: "pdf",
      resourceId: "r-pdf",
      mimeType: "application/pdf",
    });
    expect(hosted.url).toBeUndefined();
    expect(boardCanEmbed(hosted, null, "pdf")).toBe(true);
  });
});

// ── Smuggle-char rejection (the shared sink gate) ──────────────────────────
// A raw tab/newline/CR is stripped by the WHATWG URL parser BEFORE parsing, so
// "/\t/evil.com/x" passes a naive root-relative test then normalizes to
// "//evil.com/x" (a foreign origin). The single gate rejects it everywhere —
// isSafeUrl, its isSafeBoardUrl re-export, isSafeImgSrc, and classifyEmbed.
describe("isSafeUrl / isSafeImgSrc / isSafeBoardUrl — smuggle + scheme rules", () => {
  const smuggles = ["/\t/evil.com/x", "/\n//evil", "/\r/evil", "/\t\\evil"];

  it("rejects interior tab/newline/CR on every gate", () => {
    for (const u of smuggles) {
      expect(isSafeUrl(u)).toBe(false);
      expect(isSafeBoardUrl(u)).toBe(false);
      expect(isSafeImgSrc(u)).toBe(false);
    }
  });

  it("isSafeBoardUrl IS the hardened isSafeUrl (no drift)", () => {
    expect(isSafeBoardUrl).toBe(isSafeUrl);
  });

  it("still accepts the legitimate safe schemes", () => {
    for (const u of [
      "https://example.com/x",
      "http://example.com/x",
      "blob:https://app.example/abc",
      "/api/resources/r-1",
    ]) {
      expect(isSafeUrl(u)).toBe(true);
      expect(isSafeImgSrc(u)).toBe(true);
    }
  });

  it("still rejects protocol-relative, backslash, and script schemes", () => {
    for (const u of ["//evil.com/x", "/\\evil", "javascript:alert(1)", "data:text/html,x"]) {
      expect(isSafeUrl(u)).toBe(false);
      expect(isSafeImgSrc(u)).toBe(false);
    }
  });

  it("isSafeImgSrc allows base64 data:image but isSafeUrl does not", () => {
    const dataImg = "data:image/png;base64,iVBORw0KGgo=";
    expect(isSafeImgSrc(dataImg)).toBe(true);
    expect(isSafeUrl(dataImg)).toBe(false);
    // non-base64 svg data: stays rejected (can carry <svg onload=…>)
    expect(isSafeImgSrc("data:image/svg+xml,<svg onload=alert(1)>")).toBe(false);
  });

  it("classifyEmbed rejects an interior-tab media url as unsafe-scheme", () => {
    const r = res({ type: "image", url: "/\timg.png", mimeType: "image/png" });
    expect(canEmbedResource(r)).toBe(false);
    expect(embedDenialReason(r)).toBe("unsafe-scheme");
  });
});
