// lib/supabase/user-header.ts — the one name shared by the middleware that
// SETS the resolved auth user id and the server render that READS it.
//
// Its own module on purpose. The obvious home is lib/supabase/middleware.ts,
// but importing a constant from there would pull `@supabase/ssr` and
// `next/server` into every consumer — including the React Server Component that
// only wants a string. A bare constant has no imports and costs nothing.
//
// CONTRACT (enforced in lib/supabase/middleware.ts):
//   • The inbound header is DELETED at the top of `updateSession`, before any
//     early return — including the Claude-bypass one, whose Bearer path answers
//     with `NextResponse.next({ request })` and would otherwise forward a
//     client-supplied value straight into the render. Stripping first is what
//     makes "an inbound value never survives" true on EVERY path.
//   • It is then SET only from the id middleware's own `getUser()` resolved.
//   • It is a PERFORMANCE HINT, never a credential. RLS decides what anyone may
//     read; this only saves the browser from repeating an auth round trip. Do
//     not add anything that treats it as authority.
//
// It travels on the REQUEST only. Nothing writes it to the response, so it is
// never echoed to the browser — verified with a live header dump, not by
// reasoning about it.

/** Request header carrying the middleware-resolved auth user id to the render. */
export const USER_ID_HEADER = "x-mc-user-id";
