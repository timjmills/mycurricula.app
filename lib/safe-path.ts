// safe-path.ts — shared open-redirect guard (audit #21).
//
// **Why this is its own module.** The canonical `safeRelativePath` validation
// used to live in `lib/claude-bypass.ts`, but that module transitively imports
// the service-role admin client (`lib/supabase/admin`), so it can only run on
// the server. A `"use client"` component (e.g. the Google sign-in button) that
// needs the same validation for its `?next=` destination therefore could NOT
// import it without dragging server-only code into the browser bundle.
//
// This file holds ONLY the pure URL-validation logic — no imports of any
// server / admin / Supabase code — so both server (`claude-bypass`, the auth
// callback) and client (`google-sign-in-button`) callers share one
// implementation with identical semantics. `claude-bypass.ts` re-exports
// `safeRelativePath` from here so its existing importers keep working.

/** Default in-app landing path when a redirect target is missing or unsafe. */
export const SAFE_DEFAULT_PATH = "/weekly";

/**
 * Validate a user-supplied redirect destination, returning it only when it is
 * a same-origin RELATIVE path; otherwise fall back to {@link SAFE_DEFAULT_PATH}.
 * Shared by every redirect that reads a `next`/destination from user input
 * (audit #21 — open redirect).
 *
 * Rejected (→ default):
 *   • absolute URLs            `https://evil.com/x`, `http:/evil`
 *   • protocol-relative        `//evil.com`, `/\/evil`
 *   • backslash tricks         `/\evil`, `\\evil`  (browsers normalize `\`→`/`)
 *   • scheme-bearing values    `javascript:…`, `data:…`, `mailto:…`
 *   • anything not starting    `weekly`, `?x=1`, ``, control chars
 *     with a single `/`
 *
 * Accepted: a single leading `/`, no second `/` or `\` immediately after,
 * no embedded scheme/host. We additionally parse the candidate against a
 * dummy origin and require the resolved pathname to round-trip — so a value
 * like `/x/../..//evil` that string-checks clean but resolves off-path is
 * still caught.
 */
export function safeRelativePath(next: string | null | undefined): string {
  if (!next) return SAFE_DEFAULT_PATH;

  // Reject anything that isn't a plain `/path`. Must start with exactly one
  // forward slash, and the next char must not be `/` or `\` (protocol-relative
  // or backslash-host tricks). Backslashes anywhere are rejected outright
  // because browsers normalize `\` to `/` in URLs, turning `/\evil` into
  // `//evil` (a protocol-relative jump to host `evil`).
  if (next[0] !== "/") return SAFE_DEFAULT_PATH;
  if (next[1] === "/" || next[1] === "\\") return SAFE_DEFAULT_PATH;
  if (next.includes("\\")) return SAFE_DEFAULT_PATH;

  // Reject control chars (incl. tab/newline that some parsers strip, which
  // could smuggle a scheme/host past the prefix check). Checked by code point
  // so no literal control bytes live in this source file.
  for (let i = 0; i < next.length; i++) {
    const c = next.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return SAFE_DEFAULT_PATH;
  }

  // Final defense-in-depth: resolve against a throwaway origin and confirm the
  // result stays on that origin and its pathname still begins with `/`. If the
  // value managed to encode a host/scheme, the resolved origin won't match.
  try {
    const base = "https://safe.invalid";
    const resolved = new URL(next, base);
    if (resolved.origin !== base) return SAFE_DEFAULT_PATH;
    if (!resolved.pathname.startsWith("/")) return SAFE_DEFAULT_PATH;
    // The resolved pathname must STILL be a single-slash path. A value like
    // `/x/../..//evil` resolves to the pathname `//evil` on this origin — the
    // origin check above passes, but `//evil` is itself protocol-relative once
    // re-emitted, so a browser would treat `evil` as a host. Re-apply the same
    // single-leading-slash + no-backslash rules to the resolved pathname so
    // path-traversal can't reintroduce a protocol-relative or host-bearing form.
    if (
      resolved.pathname[1] === "/" ||
      resolved.pathname[1] === "\\" ||
      resolved.pathname.includes("\\")
    ) {
      return SAFE_DEFAULT_PATH;
    }
    // Re-serialize as a relative path so only the in-app portion survives.
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return SAFE_DEFAULT_PATH;
  }
}
