"use client";

// appearance-step.tsx — v2 onboarding step 5: how the app looks.
//
// Embeds the SHIPPED AppearanceControls (the v2 appearance engine) in compact
// register. It drives every look axis through the app-wide ThemeProvider and
// owns its own persistence, so this step is purely presentational — nothing is
// wired here. Personal preference (yours alone), so it is skippable.

import type { ReactNode } from "react";
import { AppearanceControls } from "@/components/appearance/appearance-controls";
import styles from "./steps-v2.module.css";

export function AppearanceStep(): ReactNode {
  return (
    <div>
      <h1 className={styles.heading}>Make it yours</h1>
      <p className={styles.helper}>
        Pick a look for the app — the frame, background, and color theme. This is
        yours alone; your teammates each choose their own. You can change it any
        time in Settings &rarr; Appearance.
      </p>

      <AppearanceControls compact />
    </div>
  );
}
