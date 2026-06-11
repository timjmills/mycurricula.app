// rich-text-command-bus.test.ts — registry semantics of the shared
// focused-editor command bus (components/rich-text/command-bus.ts).
//
// The bus is a pure module-level registry (no DOM): targets register on
// focus, an external toolbar drives the active one through the facade, and
// stale unregisters must never clobber a newer registration. These tests pin
// that contract down — the React hooks around it are thin wiring over these
// functions.

import { beforeEach, describe, expect, it } from "vitest";
import {
  RichTextCommandBus,
  getRichTextCommandBusVersion,
  getRichTextCommandTarget,
  notifyRichTextStateChanged,
  registerRichTextCommandTarget,
  subscribeRichTextCommandBus,
  unregisterRichTextCommandTarget,
  type RichTextCommandTarget,
} from "@/components/rich-text/command-bus";

/** A mock target that records every call it receives. */
function makeTarget(log: string[], name: string): RichTextCommandTarget {
  return {
    executeCommand: (command, value) =>
      log.push(`${name}:exec:${command}:${value ?? ""}`),
    requestLink: () => log.push(`${name}:link`),
    requestImage: () => log.push(`${name}:image`),
    queryState: (command) => command === "bold",
    contains: () => name === "containing",
  };
}

beforeEach(() => {
  // Module-level state persists across tests — reset to "nothing focused".
  RichTextCommandBus.release();
});

describe("RichTextCommandBus facade with no active target", () => {
  it("reports canExecute false and no-ops every command safely", () => {
    const log: string[] = [];
    expect(RichTextCommandBus.canExecute()).toBe(false);
    expect(getRichTextCommandTarget()).toBeNull();

    // None of these may throw or reach a target.
    RichTextCommandBus.executeCommand("bold");
    RichTextCommandBus.requestLink();
    RichTextCommandBus.requestImage();
    RichTextCommandBus.release();
    expect(RichTextCommandBus.queryState("bold")).toBe(false);
    expect(RichTextCommandBus.targetContains({} as unknown as Node)).toBe(
      false,
    );
    expect(log).toEqual([]);
  });

  it("notifyRichTextStateChanged is a no-op (no version bump, no listeners)", () => {
    const before = getRichTextCommandBusVersion();
    let pings = 0;
    const unsubscribe = subscribeRichTextCommandBus(() => {
      pings += 1;
    });
    notifyRichTextStateChanged();
    expect(getRichTextCommandBusVersion()).toBe(before);
    expect(pings).toBe(0);
    unsubscribe();
  });
});

describe("registration lifecycle", () => {
  it("routes facade calls to the registered target", () => {
    const log: string[] = [];
    const target = makeTarget(log, "a");
    registerRichTextCommandTarget(target);

    expect(RichTextCommandBus.canExecute()).toBe(true);
    expect(getRichTextCommandTarget()).toBe(target);

    RichTextCommandBus.executeCommand("formatBlock", "h4");
    RichTextCommandBus.executeCommand("removeFormat");
    RichTextCommandBus.requestLink();
    RichTextCommandBus.requestImage();
    expect(log).toEqual([
      "a:exec:formatBlock:h4",
      "a:exec:removeFormat:",
      "a:link",
      "a:image",
    ]);

    expect(RichTextCommandBus.queryState("bold")).toBe(true);
    expect(RichTextCommandBus.queryState("italic")).toBe(false);
  });

  it("last focus wins — a new registration replaces the old", () => {
    const log: string[] = [];
    const a = makeTarget(log, "a");
    const b = makeTarget(log, "b");
    registerRichTextCommandTarget(a);
    registerRichTextCommandTarget(b);

    RichTextCommandBus.executeCommand("bold");
    expect(log).toEqual(["b:exec:bold:"]);
    expect(getRichTextCommandTarget()).toBe(b);
  });

  it("a stale unregister (old editor's blur after a new focus) is a no-op", () => {
    const log: string[] = [];
    const a = makeTarget(log, "a");
    const b = makeTarget(log, "b");
    registerRichTextCommandTarget(a);
    registerRichTextCommandTarget(b);

    // a's blur cleanup fires AFTER b already took over — must not clear b.
    unregisterRichTextCommandTarget(a);
    expect(RichTextCommandBus.canExecute()).toBe(true);
    expect(getRichTextCommandTarget()).toBe(b);

    unregisterRichTextCommandTarget(b);
    expect(RichTextCommandBus.canExecute()).toBe(false);
  });

  it("release() drops the active target (toolbar focus-out path)", () => {
    const log: string[] = [];
    registerRichTextCommandTarget(makeTarget(log, "a"));
    expect(RichTextCommandBus.canExecute()).toBe(true);
    RichTextCommandBus.release();
    expect(RichTextCommandBus.canExecute()).toBe(false);
    expect(getRichTextCommandTarget()).toBeNull();
  });

  it("targetContains delegates to the active target", () => {
    const log: string[] = [];
    registerRichTextCommandTarget(makeTarget(log, "containing"));
    expect(RichTextCommandBus.targetContains({} as unknown as Node)).toBe(true);
    RichTextCommandBus.release();
    registerRichTextCommandTarget(makeTarget(log, "other"));
    expect(RichTextCommandBus.targetContains({} as unknown as Node)).toBe(
      false,
    );
  });
});

describe("subscriptions & versioning", () => {
  it("notifies subscribers (with a version bump) on register, state change, and unregister", () => {
    const log: string[] = [];
    const target = makeTarget(log, "a");
    const seen: number[] = [];
    const unsubscribe = subscribeRichTextCommandBus(() => {
      seen.push(getRichTextCommandBusVersion());
    });

    const v0 = getRichTextCommandBusVersion();
    registerRichTextCommandTarget(target); // bump 1
    registerRichTextCommandTarget(target); // same target — no bump
    notifyRichTextStateChanged(); // bump 2 (selection moved)
    unregisterRichTextCommandTarget(target); // bump 3
    unregisterRichTextCommandTarget(target); // already gone — no bump

    expect(seen).toEqual([v0 + 1, v0 + 2, v0 + 3]);
    expect(getRichTextCommandBusVersion()).toBe(v0 + 3);

    unsubscribe();
    registerRichTextCommandTarget(target);
    expect(seen).toHaveLength(3); // unsubscribed — no further pings
  });

  it("a listener that unsubscribes itself mid-notify does not break delivery", () => {
    const log: string[] = [];
    let selfCalls = 0;
    let otherCalls = 0;
    const unsubscribeSelf = subscribeRichTextCommandBus(() => {
      selfCalls += 1;
      unsubscribeSelf();
    });
    const unsubscribeOther = subscribeRichTextCommandBus(() => {
      otherCalls += 1;
    });

    registerRichTextCommandTarget(makeTarget(log, "a"));
    expect(selfCalls).toBe(1);
    expect(otherCalls).toBe(1);

    RichTextCommandBus.release();
    expect(selfCalls).toBe(1); // gone after self-unsubscribe
    expect(otherCalls).toBe(2);
    unsubscribeOther();
  });
});
