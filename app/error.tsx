"use client";

// error.tsx — token-styled route error boundary so crashes follow the theme.
//
// Renders inside the root layout (the boot script has already painted the
// theme attributes), replacing Next's unthemed white error page. Client
// component by contract (receives reset()). Tokens only — no hex.

import type { ReactNode } from "react";
import { useEffect } from "react";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): ReactNode {
  useEffect(() => {
    // Surface the failure for diagnostics; the UI stays calm.
    console.error(error);
  }, [error]);

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--canvas)",
        color: "var(--ink)",
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: "100%",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg, 16px)",
          boxShadow: "var(--shadow-card)",
          padding: "32px 28px",
          textAlign: "center",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "var(--t-11)",
            fontWeight: 800,
            letterSpacing: "0.09em",
            textTransform: "uppercase",
            color: "var(--danger)",
          }}
        >
          Something broke
        </p>
        <h1
          style={{
            margin: "10px 0 0",
            fontFamily: "var(--font-display-sm)",
            fontSize: "var(--t-20, 20px)",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "var(--ink)",
          }}
        >
          This page hit an error
        </h1>
        <p
          style={{
            margin: "10px 0 0",
            fontSize: "var(--t-13)",
            lineHeight: 1.55,
            color: "var(--body)",
          }}
        >
          Your plans are safe. Try again — if it keeps happening, reload the
          page or head back to the weekly plan.
        </p>
        {error.digest && (
          <p
            style={{
              margin: "8px 0 0",
              fontSize: "var(--t-11)",
              fontFamily: "var(--font-mono, monospace)",
              color: "var(--faint)",
            }}
          >
            Ref: {error.digest}
          </p>
        )}
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            marginTop: 20,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={reset}
            className="cp-focusable"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 44,
              padding: "0 22px",
              borderRadius: "var(--r-pill)",
              background: "var(--brand-500)",
              color: "var(--on-solid)",
              border: "none",
              fontSize: "var(--t-13)",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "var(--sh-brand)",
            }}
          >
            Try again
          </button>
          <a
            href="/weekly"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 44,
              padding: "0 22px",
              borderRadius: "var(--r-pill)",
              background: "var(--surface)",
              color: "var(--ink)",
              border: "1px solid var(--border)",
              fontSize: "var(--t-13)",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Weekly plan
          </a>
        </div>
      </div>
    </main>
  );
}
