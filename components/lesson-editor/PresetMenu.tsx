"use client";

// PresetMenu.tsx — the W3.8 footer's "Load preset ▾" menu and "Save as
// preset" inline form.
//
// COPY IS "preset" (the bundle wins over the docs' "template" wording).
//
// • Load preset — "Built-in" lists the app's 15 house LESSON_TEMPLATES
//   (D6: they replace the mock's 4 sample templates; the host instantiates
//   via instantiateSections). "Saved" lists the teacher's own presets.
// • Save as preset — a small inline name form (NEVER window.prompt — mock
//   defect ledger). Saving with an existing name overwrites it (mock
//   parity).
//
// SAVED PRESETS ARE STRUCTURE-ONLY — {heading, color, tintScope, minutes}
// per section, WITHOUT the body html. A preset is a reusable lesson SHAPE;
// the mock also freezing the typed content into the preset is arguably its
// own defect, so we deviate deliberately (documented divergence).
//
// Persisted to localStorage under "mycurricula:user:lesson-presets"
// (NEVER the mock's cc_* keys), validated defensively on read.

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { SectionTintScope } from "@/lib/lesson-flow";
import { LESSON_TEMPLATES, type LessonTemplate } from "@/lib/lesson-templates";
import { Button, Tooltip } from "@/components/ui";
import { useDismissableMenu } from "./SectionMenu";
import styles from "./lesson-editor.module.css";

// ── Saved-preset model + storage ─────────────────────────────────────────

/** One section of a saved preset — STRUCTURE only, never body html. */
export interface SavedPresetSection {
  heading: string;
  color?: string;
  tintScope?: SectionTintScope;
  minutes?: number | null;
}

export interface SavedLessonPreset {
  name: string;
  sections: SavedPresetSection[];
}

const STORAGE_KEY = "mycurricula:user:lesson-presets";

/** Defensive parse — a stale or hand-edited payload can never wedge the
 *  menu. Unknown fields are dropped; malformed entries are skipped. */
export function readSavedPresets(): SavedLessonPreset[] {
  if (typeof window === "undefined") return [];
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: SavedLessonPreset[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const { name, sections } = entry as {
      name?: unknown;
      sections?: unknown;
    };
    if (typeof name !== "string" || name.length === 0) continue;
    if (!Array.isArray(sections)) continue;
    const cleaned: SavedPresetSection[] = [];
    for (const s of sections) {
      if (typeof s !== "object" || s === null) continue;
      const sec = s as Record<string, unknown>;
      if (typeof sec.heading !== "string") continue;
      cleaned.push({
        heading: sec.heading,
        color: typeof sec.color === "string" ? sec.color : undefined,
        tintScope:
          sec.tintScope === "header" || sec.tintScope === "field"
            ? sec.tintScope
            : undefined,
        // W3.8 gate fix: clamp at parse. A hand-edited float (10.5) passes
        // the RPC's jsonb "number" typeof check, but the server-side
        // ::integer cast raises AFTER the delete — the transaction rolls
        // back (fail-closed) and every later save of that lesson then fails
        // silently. Integers within the DB CHECK's 0..999 range only
        // (lesson_sections_minutes_range); anything else drops to null.
        minutes:
          typeof sec.minutes === "number" &&
          Number.isInteger(sec.minutes) &&
          sec.minutes >= 0 &&
          sec.minutes <= 999
            ? sec.minutes
            : null,
      });
    }
    if (cleaned.length > 0) out.push({ name, sections: cleaned });
  }
  return out;
}

export function writeSavedPresets(presets: SavedLessonPreset[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Storage full / privacy mode — the in-memory list still drives the UI.
  }
}

// ── Component ────────────────────────────────────────────────────────────

export interface PresetMenuProps {
  /** Load a built-in house template (the host instantiates + ensures the
   *  permanent Resources section). */
  onLoadBuiltin: (template: LessonTemplate) => void;
  /** Load a saved structure-only preset. */
  onLoadSaved: (preset: SavedLessonPreset) => void;
  /** Snapshot the CURRENT sections as a named preset (host supplies the
   *  structure); called with the chosen name. */
  onSaveCurrent: (name: string) => void;
  /** Bump to re-read localStorage after the host saves. */
  savedRevision: number;
}

export function PresetMenu({
  onLoadBuiltin,
  onLoadSaved,
  onSaveCurrent,
  savedRevision,
}: PresetMenuProps): ReactNode {
  const [loadOpen, setLoadOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [saved, setSaved] = useState<SavedLessonPreset[]>([]);
  const loadRef = useRef<HTMLDivElement>(null);
  const saveRef = useRef<HTMLDivElement>(null);

  // localStorage is client-only — read post-mount (SSR-safe) and again
  // whenever the host reports a save.
  useEffect(() => {
    setSaved(readSavedPresets());
  }, [savedRevision]);

  useDismissableMenu(loadOpen, () => setLoadOpen(false), loadRef);
  useDismissableMenu(saveOpen, () => setSaveOpen(false), saveRef);

  const commitSave = (): void => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSaveCurrent(trimmed);
    setName("");
    setSaveOpen(false);
  };

  return (
    <>
      <div ref={loadRef} className={styles.presetWrap}>
        <Tooltip
          content="Replace this lesson's sections with a ready-made structure — a built-in teaching model or one of your saved presets"
          tooltipId="lesson-editor-load-preset"
        >
          <Button
            variant="secondary"
            size="sm"
            aria-haspopup="menu"
            aria-expanded={loadOpen}
            onClick={() => setLoadOpen((o) => !o)}
          >
            Load preset ▾
          </Button>
        </Tooltip>
        {loadOpen && (
          <div
            className={`${styles.menuPop} ${styles.presetMenu}`}
            role="menu"
          >
            <div className={styles.menuHd}>Built-in</div>
            {LESSON_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="menuitem"
                className={styles.menuItem}
                title={t.description}
                onClick={() => {
                  onLoadBuiltin(t);
                  setLoadOpen(false);
                }}
              >
                {t.name}
              </button>
            ))}
            {saved.length > 0 && <div className={styles.menuHd}>Saved</div>}
            {saved.map((p) => (
              <button
                key={p.name}
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => {
                  onLoadSaved(p);
                  setLoadOpen(false);
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div ref={saveRef} className={styles.presetWrap}>
        <Tooltip
          content="Save this lesson's current section structure (names, colors, order — not the text) as a reusable preset"
          tooltipId="lesson-editor-save-preset"
        >
          <Button
            variant="secondary"
            size="sm"
            aria-expanded={saveOpen}
            onClick={() => setSaveOpen((o) => !o)}
          >
            Save as preset
          </Button>
        </Tooltip>
        {saveOpen && (
          <div className={styles.menuPop}>
            <div className={styles.menuHd}>Preset name</div>
            <div className={styles.saveForm}>
              <input
                className={styles.saveInput}
                value={name}
                autoFocus
                placeholder="e.g. My reading block"
                aria-label="Preset name"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitSave();
                  }
                }}
              />
              <Button
                variant="primary"
                size="sm"
                disabled={name.trim().length === 0}
                onClick={commitSave}
              >
                Save
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
