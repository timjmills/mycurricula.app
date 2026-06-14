"use client";

// Settings → Appearance card for the teacher home screen. Mirrors the on-page
// Customize popover (mode + per-row + photo) so the preference is discoverable
// in Settings too. Writes through the same useHomeLayout() localStorage keys.

import { SettingsCard } from "@/components/appearance/settings-card";
import {
  useHomeLayout,
  HOME_ROW_IDS,
  HOME_ROW_LABELS,
  type HomeMode,
  type QuoteTopic,
} from "@/lib/home/use-home-layout";
import { INSIGHT_CATEGORIES, INSIGHT_CATEGORY_LABELS } from "@/lib/home/insights";
import styles from "./customize.module.css";

const MODES: { id: HomeMode; label: string; hint: string }[] = [
  { id: "calm", label: "Calm", hint: "Just the hero" },
  { id: "full", label: "Full", hint: "Hero + your day" },
  { id: "custom", label: "Custom", hint: "Pick rows" },
];

export function HomeScreenSettings() {
  const {
    mode,
    rows,
    showPhoto,
    quoteSeconds,
    quoteTopic,
    hydrated,
    setMode,
    toggleRow,
    setShowPhoto,
    setQuoteSeconds,
    setQuoteTopic,
    reset,
  } = useHomeLayout();

  return (
    <SettingsCard
      eyebrow="Home screen"
      title="Your home layout"
      hint="What you see when you open mycurricula. This is yours alone."
      scope="personal"
      tone="brand"
      action={
        <button
          type="button"
          className={styles.customizeBtn}
          onClick={reset}
          disabled={!hydrated}
        >
          Reset
        </button>
      }
    >
      <div className={styles.settingsBody}>
        <div className={styles.modeRow}>
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`${styles.modeBtn} ${mode === m.id ? styles.modeOn : ""}`}
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
            >
              <span className={styles.modeLabel}>{m.label}</span>
              <span className={styles.modeHint}>{m.hint}</span>
            </button>
          ))}
        </div>

        {mode === "custom" && (
          <div className={styles.toggles}>
            {HOME_ROW_IDS.map((id) => (
              <label key={id} className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={rows[id]}
                  onChange={() => toggleRow(id)}
                />
                <span>{HOME_ROW_LABELS[id]}</span>
              </label>
            ))}
          </div>
        )}

        <label className={`${styles.toggle} ${styles.photoToggle}`}>
          <input
            type="checkbox"
            checked={showPhoto}
            onChange={(e) => setShowPhoto(e.target.checked)}
          />
          <span>Soft background photo</span>
        </label>

        <div className={styles.fields}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Quote topic</span>
            <select
              className={styles.select}
              value={quoteTopic}
              onChange={(e) => setQuoteTopic(e.target.value as QuoteTopic)}
            >
              <option value="all">All topics (mixed)</option>
              {INSIGHT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {INSIGHT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Change every</span>
            <select
              className={styles.select}
              value={quoteSeconds}
              onChange={(e) => setQuoteSeconds(Number(e.target.value))}
            >
              {[8, 10, 12, 15, 20].map((s) => (
                <option key={s} value={s}>
                  {s} seconds
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </SettingsCard>
  );
}
