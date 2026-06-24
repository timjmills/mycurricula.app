import type { ReactNode } from "react";
import Link from "next/link";

import styles from "./not-found.module.css";

// not-found.tsx — token-styled 404 so the page follows the active theme.
//
// Renders inside the root layout, so the no-FOUC boot script has already
// painted data-theme/-style/-palette: a Night teacher gets a Night 404, not
// Next's built-in page (which colors via prefers-color-scheme and reads
// dark-on-dark for a night-theme user on a light-mode OS). Tokens only.

export default function NotFound(): ReactNode {
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
          maxWidth: 420,
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
            color: "var(--muted)",
          }}
        >
          404
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
          Page not found
        </h1>
        <p
          style={{
            margin: "10px 0 0",
            fontSize: "var(--t-13)",
            lineHeight: 1.55,
            color: "var(--body)",
          }}
        >
          That page doesn&rsquo;t exist — it may have moved, or the link is
          stale.
        </p>
        <Link href="/weekly" className={styles.homeLink}>
          Back to the weekly plan
        </Link>
      </div>
    </main>
  );
}
