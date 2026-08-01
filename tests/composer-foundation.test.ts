import { describe, it, expect, vi } from "vitest";

import {
  composerReducer,
  initialComposerState,
  composerPropsFrom,
  resMenuOpenUrl,
  // Moved here from ./ResMenu so ResMenuTrigger can ask "would this menu render
  // anything?" without value-importing the menu module (which put the lazy
  // ResMenu back into /weekly's initial bundle). Same function, same intent.
  hasResMenuActions,
  type ComposerOpenOptions,
  type ResMenuOptions,
} from "@/components/composer/composer-state";
import type { Lesson, LessonResource } from "@/lib/types";

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

describe("hasResMenuActions — the empty-menu guard", () => {
  // The REAL predicate ResMenuTrigger calls, imported rather than restated:
  // a copy here would keep passing after the rule changed.
  const noUrl = { type: "notecard", label: "Note" } as LessonResource;
  const safeUrl = {
    type: "link",
    label: "R",
    url: "https://example.com/a",
  } as LessonResource;
  const unsafeUrl = {
    type: "link",
    label: "R",
    url: "javascript:alert(1)",
  } as LessonResource;

  it("is false when a resource has no safe url and no callbacks", () => {
    // The case that would otherwise paint a popover containing nothing.
    expect(hasResMenuActions({ resource: noUrl })).toBe(false);
    expect(hasResMenuActions({ resource: unsafeUrl })).toBe(false);
  });

  it("is true on a safe url alone (read-only rows still open + copy)", () => {
    expect(hasResMenuActions({ resource: safeUrl })).toBe(true);
  });

  it("is true on any single callback, even with no url at all", () => {
    // A notecard has no url — Edit is the whole point of its menu.
    expect(hasResMenuActions({ resource: noUrl, onEdit: () => {} })).toBe(true);
    expect(hasResMenuActions({ resource: noUrl, onRemove: () => {} })).toBe(
      true,
    );
    expect(hasResMenuActions({ resource: noUrl, onOpen: () => {} })).toBe(true);
  });

  it("routes its url check through the isSafeUrl sink, not a second guard", () => {
    // The tab-smuggle that defeated a hand-rolled local guard: the browser
    // strips the \t AFTER a naive regex has already approved the string.
    const smuggled = { type: "link", label: "R", url: "/\t/evil.example/x" };
    expect(resMenuOpenUrl(smuggled)).toBeNull();
    expect(hasResMenuActions({ resource: smuggled as LessonResource })).toBe(
      false,
    );
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
