"use client";

// standards-step.tsx — onboarding step 7 of 9: "Which standards do you align to?"
//
// Presents a multi-select toggle list of standards frameworks. Each row is an
// independent toggle — selecting it adds its id to `data.standards`; deselecting
// removes it. The step is intentionally skippable (the wizard shell handles that
// button) so zero selections is a valid outcome.
//
// Framework list mirrors the onboarding plan: CCSS, US state, both IB programmes,
// Cambridge, MOEHE, ADEK, British, Australian, NZ, and Custom.

import type { ReactNode } from "react";
import { useOnboarding } from "@/lib/onboarding-state";
import { Badge } from "@/components/ui";
import styles from "./standards-step.module.css";

/** A standards framework offered as a toggle option. */
interface FrameworkOption {
  id: string;
  label: string;
  /** Short context line shown beneath the label. */
  detail: string;
}

// Stable ids — the wizard stores these in `data.standards`.
const FRAMEWORKS: readonly FrameworkOption[] = [
  {
    id: "ccss",
    label: "CCSS (Common Core)",
    detail: "US Common Core State Standards — Math & ELA K–12",
  },
  {
    id: "us_state",
    label: "US state standards",
    detail: "State-specific standards (e.g. TEKS, NGSS, Florida NGSSS)",
  },
  {
    id: "ib_pyp",
    label: "IB PYP",
    detail: "International Baccalaureate Primary Years Programme",
  },
  {
    id: "ib_myp",
    label: "IB MYP",
    detail: "International Baccalaureate Middle Years Programme",
  },
  {
    id: "cambridge",
    label: "Cambridge",
    detail: "Cambridge International Primary & Lower Secondary",
  },
  {
    id: "moehe",
    label: "MOEHE (Qatar)",
    detail: "Qatar Ministry of Education & Higher Education",
  },
  {
    id: "adek",
    label: "ADEK (Abu Dhabi)",
    detail: "Abu Dhabi Department of Education and Knowledge",
  },
  {
    id: "british",
    label: "British National Curriculum",
    detail: "England Key Stages 1–4",
  },
  {
    id: "australian",
    label: "Australian Curriculum",
    detail: "ACARA national curriculum (v9)",
  },
  {
    id: "nz",
    label: "NZ Curriculum",
    detail: "New Zealand Te Mātaiaho refreshed curriculum",
  },
  {
    id: "custom",
    label: "Custom (upload later)",
    detail: "Your school's own framework — import or build in Settings",
  },
] as const;

/** Step 7 — standards-framework multi-select. */
export function StandardsStep(): ReactNode {
  const { data, update } = useOnboarding();

  function toggle(id: string): void {
    const next = data.standards.includes(id)
      ? data.standards.filter((s) => s !== id)
      : [...data.standards, id];
    update({ standards: next });
  }

  return (
    <div className={styles.root}>
      <h1 className={styles.heading}>Which standards do you align to?</h1>
      <p className={styles.helper}>
        Pick any that apply — you can add more later.
      </p>

      {/* Toggle list — each row is a checkbox-role button for accessibility. */}
      <ul
        className={styles.list}
        role="group"
        aria-label="Standards frameworks"
      >
        {FRAMEWORKS.map((fw) => {
          const selected = data.standards.includes(fw.id);
          return (
            <li key={fw.id} className={styles.item}>
              <button
                type="button"
                role="checkbox"
                aria-checked={selected}
                onClick={() => toggle(fw.id)}
                className={`${styles.row} ${selected ? styles.rowSelected : ""} cp-focusable`}
              >
                {/* Custom checkbox indicator. */}
                <span
                  className={styles.check}
                  aria-hidden
                  data-checked={selected}
                />
                <span className={styles.text}>
                  <span className={styles.label}>{fw.label}</span>
                  <span className={styles.detail}>{fw.detail}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Selection count — only shown once at least one is chosen. */}
      {data.standards.length > 0 && (
        <p className={styles.tally} aria-live="polite">
          <Badge variant="info" size="md">
            {data.standards.length === 1
              ? "1 framework selected"
              : `${data.standards.length} frameworks selected`}
          </Badge>
        </p>
      )}
    </div>
  );
}
