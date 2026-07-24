import { describe, it, expect, vi } from "vitest";

import {
  composerReducer,
  initialComposerState,
  composerPropsFrom,
  resMenuOpenUrl,
  type ComposerOpenOptions,
  type ResMenuOptions,
} from "@/components/composer/composer-state";
import type { Lesson } from "@/lib/types";

// Pure-core tests for the Shared Composer (B4.0 + B4.1). The React wrappers
// (provider/host/menu) are thin shells over these; the node vitest harness only
// runs pure .ts, so the reducer, the opts→props mapping, and the isSafeUrl-gated
// url helper are exercised here directly.

// A minimal Lesson stand-in — composerPropsFrom never inspects lesson fields,
// it only threads the object through, so a cast keeps the test focused.
const lesson = {
  id: "l1",
  subject: "math",
  unit: "u1",
  week: 1,
} as unknown as Lesson;

describe("resMenuOpenUrl — the single isSafeUrl sink", () => {
  it("returns the url for safe schemes (http/https/blob/root-relative)", () => {
    expect(resMenuOpenUrl({ url: "https://example.com/a" })).toBe(
      "https://example.com/a",
    );
    expect(resMenuOpenUrl({ url: "http://example.com/a" })).toBe(
      "http://example.com/a",
    );
    expect(resMenuOpenUrl({ url: "blob:https://app.example/abc" })).toBe(
      "blob:https://app.example/abc",
    );
    expect(resMenuOpenUrl({ url: "/api/resources/r-1" })).toBe(
      "/api/resources/r-1",
    );
  });

  it("returns null for unsafe / absent urls (no dead action rendered)", () => {
    expect(resMenuOpenUrl({ url: "javascript:alert(1)" })).toBeNull();
    expect(
      resMenuOpenUrl({ url: "data:text/html,<script>x</script>" }),
    ).toBeNull();
    expect(resMenuOpenUrl({ url: "//evil.example/x" })).toBeNull();
    expect(resMenuOpenUrl({ url: "/\t/evil.example/x" })).toBeNull(); // smuggle char
    expect(resMenuOpenUrl({ url: undefined })).toBeNull();
    expect(resMenuOpenUrl({ url: "" })).toBeNull();
  });
});

describe("composerReducer — open/close of the two independent axes", () => {
  const composerOpts: ComposerOpenOptions = { lesson };
  const resMenuOpts: ResMenuOptions = {
    resource: { type: "link", label: "R", url: "https://example.com/a" },
    anchor: { x: 100, y: 40 },
  };

  it("starts empty", () => {
    expect(initialComposerState).toEqual({ composer: null, resMenu: null });
  });

  it("opens and closes the composer", () => {
    const opened = composerReducer(initialComposerState, {
      type: "open-composer",
      opts: composerOpts,
    });
    expect(opened.composer).toBe(composerOpts);
    const closed = composerReducer(opened, { type: "close-composer" });
    expect(closed.composer).toBeNull();
  });

  it("opens and closes the resource menu", () => {
    const opened = composerReducer(initialComposerState, {
      type: "open-res-menu",
      opts: resMenuOpts,
    });
    expect(opened.resMenu).toBe(resMenuOpts);
    const closed = composerReducer(opened, { type: "close-res-menu" });
    expect(closed.resMenu).toBeNull();
  });

  it("no-ops (same reference) when closing an already-closed axis", () => {
    expect(
      composerReducer(initialComposerState, { type: "close-composer" }),
    ).toBe(initialComposerState);
    expect(
      composerReducer(initialComposerState, { type: "close-res-menu" }),
    ).toBe(initialComposerState);
  });

  it("enforces modal priority in BOTH directions (§4a)", () => {
    // Opening the composer clears any open menu…
    let s = composerReducer(initialComposerState, {
      type: "open-res-menu",
      opts: resMenuOpts,
    });
    s = composerReducer(s, { type: "open-composer", opts: composerOpts });
    expect(s.composer).toBe(composerOpts);
    expect(s.resMenu).toBeNull();
    // …and a menu open is REJECTED while a composer is up — a portaled menu
    // must never float interactive above the modal surface.
    const rejected = composerReducer(s, {
      type: "open-res-menu",
      opts: resMenuOpts,
    });
    expect(rejected).toBe(s);
    // Once the composer closes, the menu can open normally again.
    s = composerReducer(s, { type: "close-composer" });
    s = composerReducer(s, { type: "open-res-menu", opts: resMenuOpts });
    expect(s.resMenu).toBe(resMenuOpts);
    expect(s.composer).toBeNull();
  });
});

describe("composerPropsFrom — opts → ResourceComposerProps mapping", () => {
  it("injects open:true and threads every field through verbatim", () => {
    const onCommitted = vi.fn();
    const opts: ComposerOpenOptions = {
      lesson,
      mode: "notecard",
      initialSectionId: "s1",
      initialItems: [],
      lockRouting: true,
      onCommitted,
    };
    const props = composerPropsFrom(opts, () => {});
    expect(props.open).toBe(true);
    expect(props.lesson).toBe(lesson);
    expect(props.mode).toBe("notecard");
    expect(props.initialSectionId).toBe("s1");
    expect(props.initialItems).toEqual([]);
    expect(props.lockRouting).toBe(true);
    expect(props.onCommitted).toBe(onCommitted);
  });

  it("composes the caller's onClose BEFORE the provider close", () => {
    const order: string[] = [];
    const callerClose = vi.fn(() => order.push("caller"));
    const providerClose = vi.fn(() => order.push("provider"));
    const props = composerPropsFrom(
      { lesson, onClose: callerClose },
      providerClose,
    );
    props.onClose();
    expect(order).toEqual(["caller", "provider"]);
    expect(callerClose).toHaveBeenCalledOnce();
    expect(providerClose).toHaveBeenCalledOnce();
  });

  it("still clears state when the caller supplies no onClose", () => {
    const providerClose = vi.fn();
    const props = composerPropsFrom({ lesson }, providerClose);
    expect(() => props.onClose()).not.toThrow();
    expect(providerClose).toHaveBeenCalledOnce();
  });
});
