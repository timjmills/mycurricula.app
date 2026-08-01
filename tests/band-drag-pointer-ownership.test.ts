// A resting thumb must not be able to reschedule a unit.
//
// Dragging a unit band on the Planning-Hub timeline moves curriculum. Under the
// forking model a change made in Team Curriculum mode reaches EVERY teacher on
// the grade (CLAUDE.md §2), so a stray second contact committing a drag does
// not spoil one teacher's afternoon — it republishes a shared plan. The pink
// caution glow is the only other thing in the way.
//
// On a touch device the hazard is ordinary: a teacher rests a thumb on the
// tablet and drags a band with the index finger. The thumb produces a full
// second stream of `pointermove` / `pointerup` on the same window, identical to
// the finger's in every field except `pointerId`. `isOwnPointer` is the whole
// filter.
//
// ── WHY THE PREDICATE AND NOT THE HOOK ─────────────────────────────────────
// `tests/mount-react.ts` runs a real React mount over linkedom, which is enough
// for clicks and effects but ships no `PointerEvent` constructor, no
// `setPointerCapture`, and no multi-touch. Driving the hook there would mean
// hand-forging pointer events AND stubbing `getBoundingClientRect` (linkedom
// returns zeros, which trips `use-band-drag.ts`'s own `colPx <= 0` guard and
// aborts the gesture before a listener is ever attached) — a harness elaborate
// enough to be its own source of false greens. The predicate is pure and total,
// so it is exercised directly, and the last test below closes the gap between
// "the predicate is right" and "the handlers actually use it".
//
// ── WHAT THIS FOUND ────────────────────────────────────────────────────────
// The reported bug does NOT reproduce against the shipped predicate: a foreign
// `pointerId` was already rejected by the `ev.pointerId === ownerId` arm, so a
// resting thumb could not steer or commit a drag. What WAS wrong is the arm
// beside it — `ownerId === null || …` accepted EVERY pointer whenever no
// gesture owned the window. Latent rather than live (each site that nulls the
// owner does so after detaching the listeners), but it failed OPEN toward a
// team-visible write, so it is now closed. `should_be_own === false` for a null
// owner is that change, pinned.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isOwnPointer } from "@/components/hub-v2/timeline/use-band-drag";

/** One row of the ownership table. `pointerType` and `buttons` ride along to
 *  document the real-world shape of each case — the predicate must ignore both,
 *  which the dedicated test below asserts rather than implies. */
interface Row {
  readonly why: string;
  readonly ownerId: number | null;
  readonly evPointerId: number;
  readonly pointerType: "touch" | "mouse" | "pen";
  readonly own: boolean;
}

const TABLE: readonly Row[] = [
  // ── The gesture itself ────────────────────────────────────────────────────
  {
    why: "the finger that started the drag",
    ownerId: 2,
    evPointerId: 2,
    pointerType: "touch",
    own: true,
  },
  {
    why: "a mouse drag, same pointer",
    ownerId: 1,
    evPointerId: 1,
    pointerType: "mouse",
    own: true,
  },
  {
    why: "a pen drag, same pointer",
    ownerId: 7,
    evPointerId: 7,
    pointerType: "pen",
    own: true,
  },
  // ── THE BUG THIS FILE EXISTS FOR ──────────────────────────────────────────
  {
    why: "a thumb resting on the tablet while the finger drags",
    ownerId: 2,
    evPointerId: 3,
    pointerType: "touch",
    own: false,
  },
  {
    why: "a third contact landing mid-drag",
    ownerId: 2,
    evPointerId: 9,
    pointerType: "touch",
    own: false,
  },
  {
    why: "a stylus touching down while a finger drags",
    ownerId: 2,
    evPointerId: 4,
    pointerType: "pen",
    own: false,
  },
  // ── Fail-closed ───────────────────────────────────────────────────────────
  {
    why: "no gesture owns the window — a touch",
    ownerId: null,
    evPointerId: 3,
    pointerType: "touch",
    own: false,
  },
  {
    why: "no gesture owns the window — a mouse",
    ownerId: null,
    evPointerId: 1,
    pointerType: "mouse",
    own: false,
  },
  {
    why: "no gesture owns the window — pointerId 0",
    ownerId: null,
    evPointerId: 0,
    pointerType: "mouse",
    own: false,
  },
  // ── pointerId 0 is a REAL id ──────────────────────────────────────────────
  {
    why: "the owning pointer is id 0 (falsy, but real)",
    ownerId: 0,
    evPointerId: 0,
    pointerType: "mouse",
    own: true,
  },
  {
    why: "owner is id 0 and a second contact arrives",
    ownerId: 0,
    evPointerId: 1,
    pointerType: "touch",
    own: false,
  },
];

describe("isOwnPointer — the gate between a stray contact and a team write", () => {
  it.each(TABLE)("$why → own=$own", ({ ownerId, evPointerId, own }) => {
    expect(isOwnPointer(ownerId, { pointerId: evPointerId })).toBe(own);
  });

  it("is decided by pointerId ALONE — never pointerType or buttons", () => {
    // A drag legitimately starts from a mouse, a pen or a finger, and `buttons`
    // is 0 on a normal `pointerup` (no button is down any more — that IS the
    // release). A predicate that consulted either would reject the owning
    // pointer's own release and strand the session live, so the next stray
    // event would commit it. Same id + wildly different everything = still own.
    const owner = 5;
    for (const pointerType of ["touch", "mouse", "pen"] as const) {
      for (const buttons of [0, 1, 2]) {
        expect(
          isOwnPointer(owner, { pointerId: owner, pointerType, buttons } as {
            pointerId: number;
          }),
          `${pointerType} buttons=${buttons}`,
        ).toBe(true);
      }
    }
  });

  it("rejects a foreign pointer no matter how many events it sends", () => {
    // pointermove / pointerup / pointercancel are the same object shape to this
    // predicate — there is no per-event-type escape hatch, so a thumb cannot
    // get through by sending a different KIND of event. Asserted because the
    // handlers differ (`onMove` steers, `finish` commits, `cancel` discards)
    // and only a shared filter makes them uniformly safe.
    const owner = 2;
    const thumb = 3;
    for (const _type of ["pointermove", "pointerup", "pointercancel"]) {
      expect(isOwnPointer(owner, { pointerId: thumb })).toBe(false);
    }
    // …and a non-owning pointerup specifically, which is the one that would
    // otherwise COMMIT.
    expect(isOwnPointer(owner, { pointerId: thumb })).toBe(false);
  });
});

describe("use-band-drag — every window handler is behind that gate", () => {
  // THE BRIDGE. The tests above prove the predicate is correct; they prove
  // nothing about whether the hook consults it. A handler added later — or an
  // existing one refactored — that skips `mine(ev)` would leave every test
  // above green while a resting thumb committed a reschedule. So the source is
  // asserted directly: all three window handlers gate on the FIRST line.
  const SRC = readFileSync(
    join(
      __dirname,
      "..",
      "components",
      "hub-v2",
      "timeline",
      "use-band-drag.ts",
    ),
    "utf8",
  );

  /** Strip `//` comments before counting: this file's prose quotes the very
   *  literals being counted (the `isOwnPointer` docblock names `mine`, and the
   *  handler comments quote `pointermove`/`pointerup`), which would inflate
   *  every count below and make the assertions pass without meaning. */
  const code = SRC.split("\n")
    .filter((l) => {
      const t = l.trimStart();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

  it("the comment stripper is load-bearing (the raw source over-counts)", () => {
    // Same guard as tests/track-b-workspace-fields.test.ts: a stripper that
    // silently no-ops would leave the counts below inflated and satisfied for
    // the wrong reason. The docblock quotes `isOwnPointer`, so raw > stripped.
    const count = (s: string): number =>
      (s.match(/isOwnPointer/g) ?? []).length;
    expect(count(SRC)).toBeGreaterThan(count(code));
  });

  it("all three window handlers open with the ownership check", () => {
    // `onMove`, `finish`, `cancel` — one `if (!mine(ev)) return;` each.
    const gates = code.match(/if \(!mine\(ev\)\) return;/g) ?? [];
    expect(gates.length).toBe(3);
    // And each of the three is DEFINED, so the count above is not three copies
    // inside one handler.
    for (const handler of [
      "const onMove = (ev: PointerEvent)",
      "const finish = (ev: PointerEvent)",
      "const cancel = (ev: PointerEvent)",
    ]) {
      expect(code, handler).toContain(handler);
    }
  });

  it("`mine` delegates to the exported predicate rather than re-implementing it", () => {
    // If the hook kept its own inline comparison, the table above would be
    // testing a copy of the logic and not the shipped gate — the defect class
    // this repo has been bitten by repeatedly.
    expect(code).toContain("isOwnPointer(pointerIdRef.current, ev)");
    // The permissive arm must not come back.
    expect(code).not.toContain("pointerIdRef.current === null ||");
  });

  it("pointercancel and lostpointercapture both route to `cancel`, which commits nothing", () => {
    // A cancelled gesture is not a release. `pointercancel` fires when the
    // browser takes the pointer over; `lostpointercapture` when the captured
    // band is removed mid-drag (flipping Timeline→List does exactly that).
    // Neither means the teacher let go, so neither may reschedule.
    expect(code).toContain('window.addEventListener("pointercancel", cancel)');
    expect(code).toContain('el.addEventListener("lostpointercapture", cancel)');
    // `cancel` must not call the commit callback. `finish` is the only path to
    // a write — asserted by counting: exactly one `commitRef.current(` inside
    // the gesture handlers, plus one in `nudge` (the keyboard equivalent).
    expect((code.match(/commitRef\.current\(/g) ?? []).length).toBe(2);
  });
});
