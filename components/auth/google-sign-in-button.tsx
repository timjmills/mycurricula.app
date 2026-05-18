"use client";

// google-sign-in-button.tsx — Google sign-in trigger (Google Identity Services).
//
// Sign-up and sign-in are the same flow: the teacher's first sign-in creates
// their account.
//
// Why GSI instead of supabase.auth.signInWithOAuth():
//   The old flow redirected through Supabase's own domain, so Google's account
//   picker showed "xuukfpvonsbvvbspsrsl.supabase.co" as the requesting app.
//   Google Identity Services (GSI) runs the account picker in the browser
//   against *our* OAuth client, so Google shows the MyCurricula app name
//   instead. We then hand the resulting Google ID token to Supabase via
//   supabase.auth.signInWithIdToken() — no third-party redirect, no extra cost.
//
// Nonce flow (replay protection — the hashed/raw split matters):
//   1. Generate a raw random nonce (base64 of 32 random bytes).
//   2. Hash it with SHA-256 → lowercase hex string (`hashedNonce`).
//   3. Give the HASHED nonce to google.accounts.id.initialize(): Google embeds
//      it inside the signed ID token it issues.
//   4. Give the RAW nonce to supabase.auth.signInWithIdToken(): Supabase hashes
//      the raw value itself and checks it equals the nonce baked into the token.
//   Passing the hashed value to Supabase (or the raw value to Google) breaks
//   verification — the direction is load-bearing.
//
// The Google "G" mark below is an inline SVG brand asset — its four official
// Google brand colors are intentional fill values, not token violations; every
// other color in this component comes from a design token.

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import styles from "./google-sign-in-button.module.css";

// ── Google Identity Services typings ───────────────────────────────────────
// Minimal typed surface for the slice of the GSI API we touch. Loaded from the
// external gsi/client script at runtime, so it has no npm package to import.

interface GsiCredentialResponse {
  // The signed Google ID token (a JWT) we forward to Supabase.
  credential: string;
}

interface GsiInitializeConfig {
  client_id: string;
  callback: (response: GsiCredentialResponse) => void;
  nonce: string;
  auto_select: boolean;
  use_fedcm_for_button: boolean;
}

interface GsiButtonConfig {
  theme: "outline" | "filled_blue" | "filled_black";
  size: "small" | "medium" | "large";
  text: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape: "rectangular" | "pill" | "circle" | "square";
  logo_alignment: "left" | "center";
  width: number;
}

interface GsiIdApi {
  initialize: (config: GsiInitializeConfig) => void;
  renderButton: (parent: HTMLElement, options: GsiButtonConfig) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GsiIdApi;
      };
    };
  }
}

// ── Constants ───────────────────────────────────────────────────────────────

const GSI_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const GSI_SCRIPT_ID = "google-gsi-client";

// GSI's renderButton() requires an explicit pixel width in [200, 400].
const GSI_MIN_WIDTH = 200;
const GSI_MAX_WIDTH = 400;

const DEFAULT_DESTINATION = "/weekly";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

interface GoogleSignInButtonProps {
  // Where to land after a successful sign-in. The middleware sets this as a
  // `?next=` param on /login when it bounces a logged-out deep link; we honour
  // it only if it is a safe in-app path (see `safeDestination`).
  next?: string;
}

/**
 * Renders Google's official sign-in button via Google Identity Services and
 * completes the sign-in against Supabase with the returned ID token.
 */
export function GoogleSignInButton({
  next,
}: GoogleSignInButtonProps): ReactNode {
  // The GSI button is drawn by Google into this container element.
  const containerRef = useRef<HTMLDivElement | null>(null);

  // `loading`  — GSI script not ready; show a styled placeholder (no layout shift).
  // `pending`  — sign-in in flight after the teacher picked an account.
  // `errorMsg` — inline retry alert text (null when there is no error).
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Resolve `next` to a destination, accepting only safe in-app paths: must
  // start with a single "/" so it cannot be a protocol-relative ("//evil.com")
  // or absolute external URL. Anything else falls back to the planner home.
  const safeDestination = useCallback((): string => {
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      return next;
    }
    return DEFAULT_DESTINATION;
  }, [next]);

  // The credential callback — fires once Google issues a signed ID token.
  // It exchanges that token with Supabase, then does a full-page navigation so
  // server components and middleware see the fresh session cookie.
  const handleCredential = useCallback(
    async (
      response: GsiCredentialResponse,
      rawNonce: string,
    ): Promise<void> => {
      setPending(true);
      setErrorMsg(null);

      try {
        const supabase = createClient();
        const { error } = await supabase.auth.signInWithIdToken({
          provider: "google",
          token: response.credential,
          // RAW nonce — Supabase hashes this itself and matches it against the
          // hashed nonce embedded in the token (see file header).
          nonce: rawNonce,
        });

        if (error) {
          setPending(false);
          setErrorMsg("We couldn’t sign you in. Please try again.");
          return;
        }

        // Full page load so the new auth cookie is in place for the next route.
        window.location.assign(safeDestination());
      } catch {
        setPending(false);
        setErrorMsg("We couldn’t sign you in. Please try again.");
      }
    },
    [safeDestination],
  );

  useEffect(() => {
    // No client ID configured → render the inline notice instead; nothing else
    // to do here, so skip script loading and GSI init entirely.
    if (!GOOGLE_CLIENT_ID) return;

    let cancelled = false;

    // Builds the raw + hashed nonce pair, initializes GSI, and draws the button.
    async function initGsi(): Promise<void> {
      if (cancelled) return;
      const google = window.google;
      const container = containerRef.current;
      if (!google || !container) return;

      // 1. Raw nonce — 32 random bytes, base64-encoded.
      const randomBytes = new Uint8Array(32);
      crypto.getRandomValues(randomBytes);
      const rawNonce = btoa(String.fromCharCode(...randomBytes));

      // 2. Hashed nonce — SHA-256 of the raw nonce as lowercase hex.
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(rawNonce),
      );
      const hashedNonce = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      if (cancelled) return;

      // 3. Initialize with the HASHED nonce — Google embeds it in the token.
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID as string,
        callback: (response) => {
          // 4. Hand the RAW nonce to the exchange step.
          void handleCredential(response, rawNonce);
        },
        nonce: hashedNonce,
        auto_select: false,
        use_fedcm_for_button: true,
      });

      // Measure the container and clamp to GSI's required [200, 400] range.
      const measured = Math.round(container.getBoundingClientRect().width);
      const width = Math.min(
        GSI_MAX_WIDTH,
        Math.max(GSI_MIN_WIDTH, measured || GSI_MAX_WIDTH),
      );

      google.accounts.id.renderButton(container, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width,
      });

      setLoading(false);
    }

    // The script may already be present (e.g. after a soft client navigation).
    if (window.google?.accounts?.id) {
      void initGsi();
      return () => {
        cancelled = true;
      };
    }

    const existing = document.getElementById(
      GSI_SCRIPT_ID,
    ) as HTMLScriptElement | null;

    if (existing) {
      // Tag present but not yet evaluated — wait for it to finish loading.
      existing.addEventListener("load", () => void initGsi());
    } else {
      // First mount: inject the GSI client script once.
      const script = document.createElement("script");
      script.id = GSI_SCRIPT_ID;
      script.src = GSI_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", () => void initGsi());
      script.addEventListener("error", () => {
        if (!cancelled) {
          setErrorMsg("Couldn’t reach Google sign-in. Please try again.");
        }
      });
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
  }, [handleCredential]);

  // ── Missing configuration ────────────────────────────────────────────────
  if (!GOOGLE_CLIENT_ID) {
    return (
      <p className={styles.error} role="alert">
        Google sign-in isn’t configured yet.
      </p>
    );
  }

  return (
    <div className={styles.wrapper}>
      {/* Google Identity Services draws its official button into this element.
          React must NEVER render children inside it: GSI clears and owns this
          subtree, so a React-managed child here triggers a `removeChild` crash
          when React later reconciles it away. The placeholder below is a
          SIBLING, never a child. */}
      <div ref={containerRef} className={styles.googleButton} />

      {/* Loading placeholder — overlaid on the GSI container while the GSI
          script loads. A sibling of (not a child of) the container, so React
          and GSI never contend for the same parent node. */}
      {loading && (
        <button
          type="button"
          className={styles.placeholder}
          disabled
          aria-label="Loading Google sign-in"
        >
          <span className={styles.icon} aria-hidden="true">
            <GoogleGlyph />
          </span>
          <span className={styles.label}>Continue with Google</span>
        </button>
      )}

      {pending && (
        <p className={styles.status} role="status">
          Signing you in…
        </p>
      )}

      {errorMsg && (
        <p className={styles.error} role="alert">
          {errorMsg}
        </p>
      )}
    </div>
  );
}

// ── Google "G" mark ──────────────────────────────────────────────────────
// Official four-color logo. The hex values are the Google brand palette and
// are deliberately exempt from the token rule (see file header).

function GoogleGlyph(): ReactNode {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
