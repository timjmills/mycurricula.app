// middleware.ts — Next.js Edge middleware entry point.
//
// Delegates to updateSession (lib/supabase/middleware.ts), which refreshes
// the Supabase session and gates protected routes behind /login.

import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Run on every request except Next internals and static assets — those
  // never carry a session and don't need an auth check.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|otf)$).*)",
  ],
};
