// lib/teach/client.ts — the CLIENT-SIDE Teach data facade.
//
// Client components import `teachClient` (never the server-only Supabase
// source). It exposes the full TeachDataSource. In the default prototype path
// every method delegates straight to the in-memory mock — byte-for-byte
// identical to the pre-backend behaviour, no server round-trip. When the app is
// explicitly pointed at a real backend (NEXT_PUBLIC_TEACH_USE_SUPABASE=1,
// alongside a real Supabase project), every method instead routes through the
// single generic server action `teachDispatch`, which runs the server-only
// Supabase source under the authed user's RLS.
//
// Implemented as a typed Proxy so the facade tracks the TeachDataSource
// interface automatically — no per-method transcription to drift out of sync.
// Every method's args + return type are exactly the interface's (no `any`
// surfaces to callers). Next server actions accept/return serializable values,
// which every TeachDataSource method already satisfies (plain Board/Widget/Page
// objects).
//
// PRIVACY (§11.4): only STRUCTURE crosses the boundary — never student names.

import type { TeachDataSource } from "./queries";
import { mockTeachSource } from "./mock-source";
import { teachDispatch } from "./actions";

/** Whether the running app persists Teach data to Supabase via the server
 *  action layer. Defaults OFF: the prototype renders against the mock. Flip on
 *  with NEXT_PUBLIC_TEACH_USE_SUPABASE=1 once a real Supabase project is wired.
 *  Read from a NEXT_PUBLIC_ var so the client bundle can branch at load. */
const USE_SUPABASE = process.env.NEXT_PUBLIC_TEACH_USE_SUPABASE === "1";

/**
 * The client-facing Teach repository. Same shape + types as `TeachDataSource`;
 * swapping a `teach.*` call to `teachClient.*` makes that surface
 * backend-capable with zero other change. A Proxy forwards each method:
 *   • USE_SUPABASE → the generic server action (real backend, RLS), OR
 *   • default      → the in-memory mock directly (prototype).
 */
export const teachClient: TeachDataSource = new Proxy({} as TeachDataSource, {
  get<M extends keyof TeachDataSource>(_target: TeachDataSource, prop: M) {
    return (...args: Parameters<TeachDataSource[M]>) => {
      if (USE_SUPABASE) {
        return teachDispatch(prop, args);
      }
      const fn = mockTeachSource[prop] as (
        ...a: Parameters<TeachDataSource[M]>
      ) => Promise<Awaited<ReturnType<TeachDataSource[M]>>>;
      return fn.apply(mockTeachSource, args);
    };
  },
});
