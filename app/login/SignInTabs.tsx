"use client";

// login/SignInTabs.tsx — client-side tab switcher for sign-in methods.
//
// Two tabs: Google (the fast path for teachers with a school Google account)
// and Email (magic-link for those who prefer email-only or lack GSI access).
// Rendered inside the sign-in card on /login.
//
// The active tab is local state — no URL param needed since the page re-mounts
// on navigation and "Google" is the default we always want teachers to see
// first. The tabs are a simple segmented control, not a URL-routed surface.

import { useState, type ReactNode } from "react";
import { GoogleSignInButton } from "@/components/auth";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import styles from "./SignInTabs.module.css";

type Tab = "google" | "email";

interface SignInTabsProps {
  // Where to land after a successful sign-in. Forwarded to both sign-in paths.
  next?: string;
}

export function SignInTabs({ next }: SignInTabsProps): ReactNode {
  const [activeTab, setActiveTab] = useState<Tab>("google");

  return (
    <div className={styles.root}>
      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      {/* role="tablist" + role="tab" + aria-selected + aria-controls for AT */}
      <div
        className={styles.tabBar}
        role="tablist"
        aria-label="Sign-in method"
      >
        <button
          type="button"
          role="tab"
          id="tab-google"
          aria-selected={activeTab === "google"}
          aria-controls="panel-google"
          className={[
            styles.tabBtn,
            activeTab === "google" ? styles.active : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setActiveTab("google")}
        >
          Continue with Google
        </button>

        <button
          type="button"
          role="tab"
          id="tab-email"
          aria-selected={activeTab === "email"}
          aria-controls="panel-email"
          className={[
            styles.tabBtn,
            activeTab === "email" ? styles.active : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setActiveTab("email")}
          title="Sign in with a magic link sent to your school email"
        >
          Email link
        </button>
      </div>

      {/* ── Tab panels ───────────────────────────────────────────────────── */}
      <div
        id="panel-google"
        role="tabpanel"
        aria-labelledby="tab-google"
        hidden={activeTab !== "google"}
        className={styles.panel}
      >
        <GoogleSignInButton next={next} />
        <p className={styles.tabNote}>
          Uses your Google account — fastest sign-in.
        </p>
      </div>

      <div
        id="panel-email"
        role="tabpanel"
        aria-labelledby="tab-email"
        hidden={activeTab !== "email"}
        className={styles.panel}
      >
        <MagicLinkForm next={next} />
      </div>
    </div>
  );
}
