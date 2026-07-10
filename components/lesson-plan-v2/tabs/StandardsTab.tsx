"use client";

// StandardsTab.tsx — the Lesson Plan panel's standards tab (W7, B:8401-8404).
//
// The lesson's tagged standards as rows (code + description), plus a "Tag
// standards" affordance opening the SCOPED <StandardsTaggingPicker> (search the
// worldwide catalog, limited to the teacher's effective frameworks — set in
// Settings → Standards).
//
// Ported from components/daily/planning-tabs/PlanningTabs.tsx (:615-698), which
// Wave 3.8 orphaned. The write semantics are identical and load-bearing:
//
//   • `mergeStandards(descriptions)` FIRST, so describeStandard resolves the
//     wording of a code from a framework outside the grade's baseline catalog
//     immediately, with no reload.
//   • Then ONE coalesced `editLesson(id, { standards, standardIds })` under
//     `lesson:<id>:standards` — same undo step, same Personal-vs-Master save
//     target as every other lesson edit.
//   • `standardIds` carries the REAL `standards.id` uuids when the picker knows
//     all of them. Codes are unique only PER framework (AERO and WIDA-ELD both
//     have "S1"), so persisting codes alone is ambiguous; the picker hands back
//     `null` for ids when any is unknown, and we then persist by code.
//
// Description resolution: `describeStandard(code)` is flag-aware — under the
// Supabase flag it reads the hydrated DB catalog, flag-off it's the mock. When
// it returns the bare code (unknown to that catalog) we fall back to the
// bundled label, so a row never prints the code twice.
//
// KNOWN DIVERGENCE (reported to the lead): <LessonEditor>'s "+ Add standard"
// footer writes the same canonical tag set AND appends a display line per newly
// tagged code into a section's body (an authoring convenience). This tab writes
// only the canonical set. Consequence: untagging here removes the tag but
// leaves any prose line LessonEditor appended sitting in the section body.

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { usePlanner } from "@/lib/planner-store";
import { bundledDescriptions } from "@/lib/standards/items";
import { StandardsTaggingPicker } from "@/components/standards/StandardsTaggingPicker";
import { Button } from "@/components/ui";
import type { StandardsMap } from "@/lib/types";
import styles from "./tabs.module.css";

/** Bundled standards-item descriptions (CCSS practices, NGSS PEs, IB ATL),
 *  computed once — the fallback label for a code the catalog doesn't know. */
const BUNDLED_DESCRIPTIONS = bundledDescriptions();

export interface StandardsTabProps {
  lessonId: string;
}

export function StandardsTab({ lessonId }: StandardsTabProps): ReactNode {
  const {
    getLesson,
    editLesson,
    describeStandard,
    mergeStandards,
    subjectById,
  } = usePlanner();
  const [pickerOpen, setPickerOpen] = useState(false);
  const lesson = getLesson(lessonId);

  const codes = useMemo(() => lesson?.standards ?? [], [lesson?.standards]);
  const ids = useMemo(() => lesson?.standardIds ?? [], [lesson?.standardIds]);

  /** One row per TAG, carrying its identity. A code is unique only PER
   *  framework (AERO and WIDA-ELD both define "S1"), so a lesson tagged with
   *  both stores `standards: ["S1", "S1"]` — keying a row by its code would
   *  collide. The index-aligned `standardIds` uuid is the real identity; we
   *  fall back to `code#index` under the mock flag, where ids are absent. */
  const described = useMemo(
    () =>
      codes.map((code, i) => {
        const fromCatalog = describeStandard(code);
        const desc =
          fromCatalog === code
            ? (BUNDLED_DESCRIPTIONS[code] ?? code)
            : fromCatalog;
        return { key: ids[i] ?? `${code}#${i}`, code, desc };
      }),
    [codes, ids, describeStandard],
  );

  const initialDescriptions = useMemo(
    () => Object.fromEntries(described.map((r) => [r.code, r.desc])),
    [described],
  );

  if (!lesson) {
    return (
      <div className={styles.emptyTab}>This lesson is no longer available.</div>
    );
  }

  function handleApply(
    nextCodes: string[],
    descriptions: StandardsMap,
    ids: string[] | null,
  ): void {
    mergeStandards(descriptions);
    // When the picker can supply a uuid for EVERY code, persist the
    // index-aligned `standardIds`. When it cannot (`ids === null` — some code
    // has no known catalog uuid), we must NOT keep the prior `standardIds`:
    // it is aligned to the OLD codes, so after a tag change a lingering uuid
    // mis-identifies a different row (wrong React key, wrong coverage count
    // for a removed standard). Clear it instead — identity degrades to the
    // safe `code#index` fallback, and the real uuids re-resolve on the next
    // fully-known save. (Codex W7 R1; the orphaned PlanningTabs had this same
    // latent bug — porting it faithfully carried the bug, so we fix it here.)
    editLesson(
      lessonId,
      ids
        ? { standards: nextCodes, standardIds: ids }
        : { standards: nextCodes, standardIds: [] },
      { key: `lesson:${lessonId}:standards`, ts: Date.now() },
    );
  }

  return (
    // `cp-subj <cls>` carries the subject's --c / --cd custom properties so the
    // standard codes take the lesson's hue without depending on host chrome.
    <div
      className={`cp-subj ${subjectById[lesson.subject]?.cls ?? ""} ${styles.tab}`}
    >
      <section className={styles.card}>
        <h3 className={styles.cardLabel}>Standards</h3>

        {described.length > 0 ? (
          <ul className={styles.stdList}>
            {described.map(({ key, code, desc }) => (
              <li key={key} className={styles.stdRow}>
                <span className={styles.stdCode}>{code}</span>
                <span className={styles.stdDesc}>{desc}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`${styles.empty} ${styles.emptySpaced}`}>
            No standards tagged on this lesson yet.
          </p>
        )}

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setPickerOpen(true)}
          tooltip="Open the standards menu — search your frameworks by stage, subject, and strand, and tag the standards this lesson covers (set which frameworks you use in Settings → Standards)"
        >
          {described.length > 0 ? "Edit standards" : "Tag standards"}
        </Button>
      </section>

      {/* Keyed on the lesson so a lesson switch remounts the picker with the new
          lesson's seed rather than reusing stale selection state. */}
      <StandardsTaggingPicker
        key={lessonId}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        initialCodes={lesson.standards}
        initialIds={lesson.standardIds}
        initialDescriptions={initialDescriptions}
        onApply={handleApply}
      />
    </div>
  );
}
