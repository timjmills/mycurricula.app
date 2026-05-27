"use client";

// Settings → Catch-up — the Layer-1 control surface for the three-layer
// Catch-up system (planning-doc §1262).
//
// Hosts:
//   • The on/off toggle that gates Layer 2 (the in-grid per-week bar) and
//     Layer 3 (the top-bar flame badge). When OFF, no ambient catch-up
//     chrome appears in the planner at all — the only entry point is the
//     "Open Catch-up screen →" link below.
//   • A short explainer of what the three layers do.
//   • A direct link to /catch-up, available even when the toggle is OFF
//     (the dedicated screen is always reachable from Settings).
//
// The page mounts its own <CatchupProvider> because the settings tree
// lives outside the planner layout (which is where the provider normally
// hangs). Without a local provider the useCatchup() hook would throw.

import type { ReactNode } from "react";
import Link from "next/link";
import { CatchupProvider, useCatchup } from "@/lib/catchup-state";
import { Button, PageHeader, ToggleGroup, Tooltip } from "@/components/ui";
import { SettingsCard } from "@/components/appearance/settings-card";
import styles from "./page.module.css";

export default function CatchupSettingsPage(): ReactNode {
  return (
    <CatchupProvider>
      <CatchupSettingsInner />
    </CatchupProvider>
  );
}

// ── Inner component ─────────────────────────────────────────────────────
// Split out so the hook call happens INSIDE the provider tree. Mirrors the
// CustomTemplatesProvider + LessonTemplatesManager pattern used by the
// lesson-templates settings page.

function CatchupSettingsInner(): ReactNode {
  const { enabled, setEnabled } = useCatchup();

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <PageHeader
          eyebrow="Settings"
          title="Catch-up"
          subtitle="Surface uncovered lessons so you can triage what to make up."
        />

        {/* ── Toggle card ─────────────────────────────────────────── */}
        <SettingsCard
          eyebrow="Layer 1"
          title={
            <Tooltip
              content="Main switch for the ambient catch-up surface. When ON, the planner shows a slim per-week count of uncovered lessons and a top-bar flame badge. When OFF, neither cue appears anywhere — but the dedicated Catch-up screen is still reachable from this page."
              side="bottom"
            >
              <span>Show catch-up cues</span>
            </Tooltip>
          }
          hint="When on, the planner highlights weeks with uncovered lessons. When off, no in-grid bar or top-bar badge appears — but you can still open the Catch-up screen from this page."
        >
          <div className={styles.toggleRow}>
            <ToggleGroup
              options={[
                {
                  value: "on",
                  label: "On",
                  title:
                    "Turn catch-up cues on — the Weekly grid shows a slim count of uncovered lessons each week, and the top bar grows a flame badge so you can spot weeks that need triage",
                },
                {
                  value: "off",
                  label: "Off",
                  title:
                    "Turn catch-up cues off — no in-grid bar or top-bar flame badge will appear in the planner. You can still open the dedicated Catch-up screen from the link below at any time.",
                },
              ]}
              value={enabled ? "on" : "off"}
              onChange={(v) => setEnabled(v === "on")}
              variant="prominent"
              size="md"
              ariaLabel="Catch-up cues on or off"
            />
          </div>

          <p className={styles.explainer}>
            Catch-up runs as three light layers so the cue can fade once you
            have seen it. A slim bar above the Weekly grid counts the items that
            did not happen this week — dismissing it folds the count into a
            small flame badge in the top bar. The dedicated{" "}
            <Link href="/catch-up" className={styles.inlineLink}>
              Catch-up screen
            </Link>{" "}
            is always available either way.
          </p>
        </SettingsCard>

        {/* ── Direct entry — always available, even when the toggle is OFF.
            Per the planning-doc §1262, the dedicated Catch-up screen stays
            reachable from Settings regardless of the feature flag. */}
        <SettingsCard
          eyebrow="Layer 3"
          title={
            <Tooltip
              content="Open the dedicated full-page Catch-up triage screen — list every uncovered lesson across the year, group by subject or week, and decide what to reschedule, mark done, or skip. Always reachable, even when catch-up cues are off."
              side="bottom"
            >
              <span>Open the triage screen</span>
            </Tooltip>
          }
          hint="See every uncovered lesson across the year, filter by scope, group by subject or week, and decide what to do."
        >
          <div className={styles.openRow}>
            <Link href="/catch-up" className={styles.openLink}>
              <Button
                variant="primary"
                size="md"
                tooltip="Open the full Catch-up triage screen — see every uncovered lesson across the year, filter by subject or week, and decide what to reschedule, mark done, or skip"
              >
                Open Catch-up screen →
              </Button>
            </Link>
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}
