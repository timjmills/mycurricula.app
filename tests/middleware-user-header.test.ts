// Guards the `x-mc-user-id` handshake — middleware resolving the auth user once
// and forwarding it to the render, so the browser does not repeat the round trip
// before the planner can ask for a lesson.
//
// Two properties, and both are the kind that fail silently:
//
//   FORGERY. The header is read by a Server Component. A client can put
//   `x-mc-user-id` on its own request, so middleware must overwrite it on every
//   matched request and DELETE it when there is no user. A conditional set would
//   let an inbound value survive into the render. It is only ever a performance
//   hint — RLS decides what anyone may read — but a render that believes the
//   wrong owner would hydrate, discard, and re-hydrate for no reason, and the
//   next person to touch this should not have to re-derive that it is safe.
//
//   COOKIE PRESERVATION. Setting a request header means rebuilding the response
//   via `NextResponse.next({ request })` — which starts EMPTY. The @supabase/ssr
//   `setAll` writes the REFRESHED session cookies onto the previous response, so
//   a bare rebuild silently drops them and breaks session refresh on every
//   request: tokens stop rotating and teachers get signed out when the access
//   token finally expires, with nothing in any log tying it to this line. This
//   was written as a bare rebuild first and caught in review; the test exists so
//   it cannot come back.
//
// ⚠ THE COOKIE HALF USED TO BE ASSERTED AGAINST A COPY, WHICH IS NO ASSERTION.
// A `forwardUserId` helper here re-implemented middleware's rebuild + cookie
// copy "verbatim", and five tests exercised the helper instead of
// `updateSession`. A copy agrees with itself forever: production could regress
// to a bare `NextResponse.next({ request })` and every one of them stayed green.
// The stub now delivers refreshed cookies the way @supabase/ssr does — by
// invoking middleware's own `setAll` during `getUser()` — so the code under test
// is the shipped code. SEEN RED:
//   • the rebuild's copy loop removed (`response = NextResponse.next({request})`
//     with no carry-over) → 3 of 10 fail, starting
//     `expected undefined to be 'refreshed-value'`.
//   • the GATE branch's separate copy loop removed → "carries them onto the
//     /login redirect too" fails, `expected undefined to be
//     'refreshed-on-redirect'` (1 of 10).
// Neither was reachable by the old helper-based tests at all.
//
// ⚠ AND THE GUARD ITSELF ONCE FAILED OPEN — the reason the forgery property is
// now asserted behaviourally. The original ordering test did a raw
// `source.indexOf("request.headers.delete(USER_ID_HEADER)")`, and middleware.ts
// DISCUSSES that call in prose. Measured against a copy of HEAD with the real
// top-level statement deleted: `indexOf` matched the COMMENT on line 140, so
// "deletes it before the auth gate" still reported PASS with the Bearer-path
// forgery hole wide open, and its sibling failed only by the accident of that
// comment sitting below the bypass anchor. A text search that does not strip
// comments is not a check. Both mutations are now caught by running the real
// `updateSession`:
//   • strip deleted            → "strips it BEFORE the Claude bypass can
//     forward it" fails with `expected 'FORGED-ATTACKER-ID' to be null` (3 of 11
//     red).
//   • strip moved BELOW the bypass return (present but unreachable — the
//     original defect) → same failure, 2 of 11 red. No source-order check can
//     see unreachability; this one does.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { USER_ID_HEADER } from "@/lib/supabase/user-header";

// ── THE REAL `updateSession`, DRIVEN END TO END ──────────────────────────────
// Everything this middleware touches that cannot run under vitest is stubbed —
// the Supabase auth round trip and the Claude bypass — and NOTHING about the
// header handling is. That is the point: the defect this file exists for was a
// correct helper in an UNREACHABLE position, which no test of a copied helper
// can express and which source-order text matching can only approximate.
const h = vi.hoisted(() => ({
  /** Whether the stubbed Claude bypass claims the request (the Bearer path). */
  bypassed: false,
  /** What the bypass SAW when it was called — i.e. whether the strip had already
   *  happened at that point in `updateSession`. This is the ordering property,
   *  observed rather than inferred from source position. */
  seenByBypass: undefined as string | null | undefined,
  /** A header middleware does NOT strip, recorded at the same instant. It is the
   *  control: if this is also null, the harness cannot see inbound headers at
   *  all and `seenByBypass === null` would prove nothing. */
  canarySeenByBypass: undefined as string | null | undefined,
  /** What the stubbed `auth.getUser()` resolves. */
  user: null as { id: string } | null,
  /**
   * The REFRESHED session cookies Supabase writes during `getUser()`.
   *
   * @supabase/ssr does not return these — it pushes them through the `setAll`
   * callback the caller supplied, and that callback is the code that rebuilds
   * `response`. So the only way to exercise the rebuild-and-copy path is to make
   * the stub call it, exactly as the library does.
   */
  refreshedCookies: [] as Array<{
    name: string;
    value: string;
    options?: Record<string, unknown>;
  }>,
}));

const CANARY_HEADER = "x-mc-test-canary";

vi.mock("@/lib/claude-bypass", async () => {
  const { NextResponse: Res } = await import("next/server");
  const { USER_ID_HEADER: HEADER } = await import("@/lib/supabase/user-header");
  return {
    tryClaudeBypassInMiddleware: async (request: NextRequest) => {
      h.seenByBypass = request.headers.get(HEADER);
      h.canarySeenByBypass = request.headers.get(CANARY_HEADER);
      // The BEARER path's real answer: `NextResponse.next({ request })`, which
      // forwards the inbound request headers verbatim into the render. (The
      // `?claude=` path redirects instead, which is why it was never exposed.)
      if (!h.bypassed) return { bypassed: false as const };
      return { bypassed: true as const, response: Res.next({ request }) };
    },
  };
});

// The auth round trip — the ONE thing here that cannot run under vitest. It is
// stubbed to behave like the library in the respect that matters: a session
// refresh delivers its cookies by INVOKING the caller's `setAll`, mid-`getUser`.
// Everything downstream of that callback is the real middleware.
// ⚠ THIS FILE DELIBERATELY DOES NOT MOCK `@/lib/planner/server-seed-enabled`.
// It ran with a file-level force-enable for one round, and that was wrong in a
// quiet way: forwarding ships OFF, so every forgery test was exercising a
// configuration the app does not run. The tests were green and were asserting
// the wrong build. The STRIP is unconditional, so it must hold with the flag as
// shipped — proven here, not assumed — and the one test that needs the SET
// force-enables it locally (see "with forwarding switched ON" below).
vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: {
      cookies: {
        getAll: () => unknown;
        setAll: (
          cookies: Array<{
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }>,
        ) => void;
      };
    },
  ) => ({
    auth: {
      getUser: async () => {
        // A real refresh writes through here BEFORE getUser resolves. This is
        // the line that makes the cookie-preservation tests test anything: it
        // runs middleware's own `setAll`, which rebuilds `response` and puts the
        // refreshed cookies on it, and the code under test then has to carry
        // them across its own rebuild.
        if (h.refreshedCookies.length > 0) {
          options.cookies.setAll(h.refreshedCookies);
        }
        return { data: { user: h.user } };
      },
    },
  }),
}));

import { updateSession } from "@/lib/supabase/middleware";

// ⚠ THERE WAS A `forwardUserId` HELPER HERE, AND DELETING IT IS THE POINT.
// It re-implemented middleware's response rebuild + cookie copy "verbatim", and
// five tests asserted against the COPY. A copy agrees with itself forever: the
// production rebuild could drop `refreshedCookies` entirely — silently ending
// session-token rotation, signing teachers out mid-lesson — and every one of
// those tests stayed green, because none of them ever called `updateSession`.
// That is the comment-match finding in a different costume: an assertion about a
// duplicate rather than about the thing. A test asserting against a
// re-implementation is worse than no test, because it is counted as coverage.
// Everything it claimed to cover is now asserted against the real function.

/** The value a client would put on its own request, hoping it reaches the
 *  render. Module-scoped: both the shipped-behaviour describe and the
 *  forwarding-ON one assert it never survives. */
const FORGED = "FORGED-ATTACKER-ID";

const makeRequest = (headers: Record<string, string> = {}) =>
  new NextRequest("https://mycurricula.app/weekly", { headers });

describe("a forged x-mc-user-id cannot reach the render, on ANY path", () => {
  // ── BEHAVIOURAL, BECAUSE THE DEFECT WAS POSITIONAL ──────────────────────────
  // The bug this guards was not in the logic — it was in the POSITION of the
  // logic. `updateSession` strips and re-sets `x-mc-user-id`, and the original
  // version did both next to each other, ~70 lines BELOW the Claude-bypass early
  // return. On the bypass's Bearer path (which answers with
  // `NextResponse.next({ request })`, forwarding inbound headers verbatim,
  // unlike the `?claude=` path's redirect) a caller could put any id it liked in
  // front of the server render. The comment there asserted the opposite.
  //
  // Every helper-level test in this file passed against that version, because
  // the forward helper they exercise is correct in isolation — the defect was
  // that it was UNREACHABLE on one path. These tests run the REAL
  // `updateSession` and observe what the bypass was handed, so they fail for a
  // statement that is present but unreachable, which neither a copied helper nor
  // a text search over the source can see.
  //
  // Verified live rather than only here: `curl -H 'x-mc-user-id: FORGED' -H
  // 'Authorization: Bearer <token>' /weekly` renders `initialUserId: null` and
  // the forged string appears zero times in the payload. Before the fix it
  // arrived as `"initialUserId":"FORGED-ATTACKER-ID"`.
  beforeEach(() => {
    h.bypassed = false;
    h.seenByBypass = undefined;
    h.canarySeenByBypass = undefined;
    h.user = null;
  });

  /** Every header value the response carries, flattened. `NextResponse.next`
   *  encodes forwarded request headers into `x-middleware-request-*`, so a
   *  forged value that survives into the render is visible here — without this
   *  test having to know Next's exact encoding. */
  const forwardedHeaderText = (res: NextResponse) =>
    [...res.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\n");

  it("strips it BEFORE the Claude bypass can forward it (Bearer path)", async () => {
    h.bypassed = true;
    const request = makeRequest({
      [USER_ID_HEADER]: FORGED,
      [CANARY_HEADER]: "still-here",
    });

    const response = await updateSession(request);

    // The ordering property, OBSERVED: at the moment the bypass ran — the early
    // return that answers with the inbound headers — the forged id was already
    // gone. A delete that is present but positioned after this call, or made
    // unreachable, fails here.
    expect(h.seenByBypass).toBeNull();
    // THE CONTROL. A header middleware does not touch survives to the same
    // point, so `seenByBypass === null` is the strip working, not the harness
    // being blind to inbound headers.
    expect(h.canarySeenByBypass).toBe("still-here");

    expect(request.headers.get(USER_ID_HEADER)).toBeNull();
    expect(forwardedHeaderText(response)).not.toContain(FORGED);
    // Same control on the response side: the transport really does carry
    // forwarded request headers, so `not.toContain` above is a live assertion.
    expect(forwardedHeaderText(response)).toContain("still-here");
  });

  it("does NOT forward an id at all — forwarding ships switched off", async () => {
    // THE SHIPPED BEHAVIOUR, and nothing asserted it before. Seeding
    // `currentUser.id` from the server's answer, before the browser has
    // confirmed who it is, is the root condition behind this lane's two
    // cross-user findings (lib/planner/server-seed-enabled.ts). With the switch
    // off, an authenticated request forwards NOTHING — and the forged value is
    // still gone, because the strip is not gated.
    h.user = { id: "teacher-a" };
    const request = makeRequest({ [USER_ID_HEADER]: FORGED });

    const response = await updateSession(request);

    expect(request.headers.get(USER_ID_HEADER)).toBeNull();
    expect(forwardedHeaderText(response)).not.toContain(FORGED);
    expect(forwardedHeaderText(response)).not.toContain("teacher-a");
  });

  it("strips it when nobody is signed in, and still bounces to /login", async () => {
    const request = makeRequest({ [USER_ID_HEADER]: FORGED });

    const response = await updateSession(request);

    expect(request.headers.get(USER_ID_HEADER)).toBeNull();
    // The gate is another early return; the strip must precede it too.
    expect(response.headers.get("location")).toContain("/login");
    expect(forwardedHeaderText(response)).not.toContain(FORGED);
  });
});

describe("the strip is positioned before every early return (source check)", () => {
  // A CHEAP SUPPLEMENT TO THE BEHAVIOURAL TESTS ABOVE, NEVER THE ONLY GUARD.
  //
  // ⚠ COMMENTS ARE STRIPPED FIRST, AND THAT IS NOT A DETAIL. `middleware.ts`
  // DISCUSSES `request.headers.delete(USER_ID_HEADER)` in prose — twice — so a
  // raw `indexOf` over the file can match an explanatory comment instead of the
  // executable statement. Delete the real call and the search silently finds the
  // comment, which sits between the two anchors, so one of these assertions kept
  // passing while the Bearer-path forgery hole was wide open. This repo has now
  // had a provenance regex match a comment as well; a text search that does not
  // strip comments is not a check.
  const stripComments = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const source = stripComments(
    readFileSync("lib/supabase/middleware.ts", "utf8"),
  );

  it("deletes the inbound header before the Claude-bypass early return", () => {
    const del = source.indexOf(`request.headers.delete(USER_ID_HEADER)`);
    const bypass = source.indexOf(`tryClaudeBypassInMiddleware(request)`);
    expect(del).toBeGreaterThan(-1);
    expect(bypass).toBeGreaterThan(-1);
    expect(del).toBeLessThan(bypass);
  });

  it("deletes it before the auth gate can return a redirect too", () => {
    // The gate's `return gateResponse` is another early exit. It happens to be
    // below the set/delete pair, but the guarantee should not depend on which
    // early return was added first.
    const del = source.indexOf(`request.headers.delete(USER_ID_HEADER)`);
    const gate = source.indexOf(`if (!user && !isPublicPath(pathname))`);
    expect(del).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(-1);
    expect(del).toBeLessThan(gate);
  });

  it("has no comment mention that could stand in for the real statement", () => {
    // The instrument checking itself: if the stripper ever stops working, this
    // fails rather than the ordering tests quietly matching prose again.
    const raw = readFileSync("lib/supabase/middleware.ts", "utf8");
    const rawCount = raw.split(`request.headers.delete(USER_ID_HEADER)`).length - 1;
    const codeCount =
      source.split(`request.headers.delete(USER_ID_HEADER)`).length - 1;
    expect(rawCount).toBeGreaterThan(codeCount); // prose mentions exist…
    expect(codeCount).toBe(2); // …and exactly two executable calls remain
  });
});

describe("with forwarding switched ON (the flip this is gated behind)", () => {
  // The SET path stays fully covered so turning the switch on is a REVIEWED
  // FLIP rather than a rewrite of code nobody has exercised. Force-enabled per
  // describe, via a fresh module registry, so the rest of this file keeps
  // testing the shipped build.
  //
  // ⚠ These do NOT assert shipped behaviour. If one of them fails, that is a
  // regression in code that is currently inert.
  afterEach(() => {
    vi.doUnmock("@/lib/planner/server-seed-enabled");
    vi.resetModules();
  });

  async function updateSessionWithForwardingOn() {
    vi.resetModules();
    vi.doMock("@/lib/planner/server-seed-enabled", () => ({
      PLANNER_SERVER_SEED_ENABLED: false,
      SSR_USER_ID_FORWARDING_ENABLED: true,
    }));
    return (await import("@/lib/supabase/middleware")).updateSession;
  }

  beforeEach(() => {
    h.bypassed = false;
    h.user = { id: "teacher-a" };
    h.refreshedCookies = [];
  });

  it("forwards the resolved id to the render", async () => {
    const update = await updateSessionWithForwardingOn();
    const request = makeRequest();

    await update(request);

    expect(request.headers.get(USER_ID_HEADER)).toBe("teacher-a");
  });

  it("OVERWRITES a client-supplied id rather than trusting it", async () => {
    // The conditional half of the contract: even on the path that legitimately
    // sets the header, an inbound value is replaced, never merged or preferred.
    const update = await updateSessionWithForwardingOn();
    const request = makeRequest({ [USER_ID_HEADER]: FORGED });

    await update(request);

    expect(request.headers.get(USER_ID_HEADER)).toBe("teacher-a");
  });

  it("still deletes it when nobody is signed in", async () => {
    const update = await updateSessionWithForwardingOn();
    h.user = null;
    const request = makeRequest({ [USER_ID_HEADER]: FORGED });

    await update(request);

    expect(request.headers.get(USER_ID_HEADER)).toBeNull();
  });
});

describe("the refreshed session survives the response rebuild", () => {
  // ── WHY THIS IS ASSERTED AGAINST `updateSession` AND NOT A COPY OF IT ────────
  // Attaching a request header means rebuilding the response with
  // `NextResponse.next({ request })`, and that rebuild starts EMPTY. Whatever
  // @supabase/ssr's `setAll` wrote onto the previous response has to be carried
  // across by hand.
  //
  // If it is not, nothing fails loudly: tokens stop rotating, and teachers are
  // signed out mid-lesson when the access token finally expires, with nothing in
  // any log pointing here. The previous version of this file asserted that
  // property against a hand-copied `forwardUserId`, which meant it could not
  // fail no matter what the shipped middleware did.
  //
  // The stub therefore delivers refreshed cookies the way the library does —
  // by CALLING middleware's own `setAll` during `getUser()` — so the rebuild and
  // the copy under test are the real ones.
  beforeEach(() => {
    h.bypassed = false;
    h.user = { id: "teacher-a" };
    h.refreshedCookies = [];
  });

  it("carries a refreshed session cookie onto the response it returns", async () => {
    h.refreshedCookies = [
      { name: "sb-test-auth-token", value: "refreshed-value" },
    ];
    const request = makeRequest();

    const response = await updateSession(request);

    expect(response.cookies.get("sb-test-auth-token")?.value).toBe(
      "refreshed-value",
    );
    // NO HEADER ASSERTION HERE, DELIBERATELY. This test is about the response
    // REBUILD dropping cookies; the handshake is a different question that
    // happens to share a code path. Asserting it here made a cookie test fail
    // for a header reason when forwarding was switched off — a test that reports
    // the wrong thing broken is barely better than one that reports nothing.
  });

  it("preserves EVERY refreshed cookie, not just the first", async () => {
    h.refreshedCookies = [
      { name: "sb-test-auth-token", value: "a" },
      { name: "sb-test-refresh-token", value: "b" },
    ];
    const request = makeRequest();

    const response = await updateSession(request);

    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("a");
    expect(response.cookies.get("sb-test-refresh-token")?.value).toBe("b");
  });

  it("carries them onto the /login redirect too", async () => {
    // The gate is an early return with its OWN copy loop. A refresh that lands
    // on a signed-out request still has to survive, or the redirect discards a
    // session the auth server just issued.
    h.user = null;
    h.refreshedCookies = [
      { name: "sb-test-auth-token", value: "refreshed-on-redirect" },
    ];
    const request = makeRequest();

    const response = await updateSession(request);

    expect(response.headers.get("location")).toContain("/login");
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe(
      "refreshed-on-redirect",
    );
  });

  it("sees no cookies when the session was not refreshed (the control)", async () => {
    // Without this, every assertion above could be passing on a stub that hands
    // back cookies regardless of what middleware does with them.
    const request = makeRequest();

    const response = await updateSession(request);

    expect(response.cookies.get("sb-test-auth-token")).toBeUndefined();
  });
});
