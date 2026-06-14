"use client";

// StandardsSettings — the client surface for Settings → Standards.
//
// Two sections:
//   1. School default (TEAM) — the framework set a school admin picks once. Admins
//      edit it with the FrameworkBrowser; non-admins see it read-only ("set by your
//      school admin"). Changes are team-wide → consequence toast with Undo.
//   2. Your frameworks (PERSONAL) — the teacher's effective set = school default ±
//      personal overrides. Toggling a school-default off, or adding an extra,
//      writes a teacher_frameworks override; returning to the default clears it.
//
// Effective rule (mirrors public.teacher_effective_framework_ids()):
//   included = (isSchoolDefault && override !== false) || override === true

import { useMemo, useState, type ReactNode } from "react";
import { useConsequenceToast } from "@/lib/consequence-toast";
import { Badge, Tooltip } from "@/components/ui";
import { SettingsCard } from "@/components/appearance/settings-card";
import { SECTION_ICONS } from "@/components/settings/section-icons";
import { FrameworkBrowser } from "@/components/standards/FrameworkBrowser";
import type { FrameworkSummary } from "@/lib/standards/queries";
import {
  setSchoolFramework,
  setTeacherFrameworkOverride,
} from "@/app/settings/standards/actions";
import styles from "./StandardsSettings.module.css";

export interface StandardsSettingsProps {
  frameworks: FrameworkSummary[];
  schoolDefaults: string[];
  overrides: { frameworkId: string; enabled: boolean }[];
  isSchoolAdmin: boolean;
  hasSchool: boolean;
}

export function StandardsSettings({
  frameworks,
  schoolDefaults,
  overrides,
  isSchoolAdmin,
  hasSchool,
}: StandardsSettingsProps): ReactNode {
  const { showConsequence } = useConsequenceToast();

  const byId = useMemo(() => {
    const m = new Map<string, FrameworkSummary>();
    for (const f of frameworks) m.set(f.id, f);
    return m;
  }, [frameworks]);

  // Mutable optimistic state.
  const [schoolSet, setSchoolSet] = useState<Set<string>>(
    () => new Set(schoolDefaults),
  );
  const [overrideMap, setOverrideMap] = useState<Map<string, boolean>>(
    () => new Map(overrides.map((o) => [o.frameworkId, o.enabled])),
  );

  const effectiveSet = useMemo(() => {
    const eff = new Set<string>();
    for (const id of schoolSet) if (overrideMap.get(id) !== false) eff.add(id);
    for (const [id, en] of overrideMap) if (en) eff.add(id);
    return eff;
  }, [schoolSet, overrideMap]);

  // ── School default toggle (admin) ─────────────────────────────────────────
  function toggleSchool(id: string, next: boolean): void {
    const fw = byId.get(id);
    const prev = new Set(schoolSet);
    const optimistic = new Set(schoolSet);
    if (next) optimistic.add(id);
    else optimistic.delete(id);
    setSchoolSet(optimistic);
    void setSchoolFramework(id, next).then((res) => {
      if (!res.ok) {
        setSchoolSet(prev); // revert
        showConsequence({ message: res.error ?? "Could not save." });
        return;
      }
      showConsequence({
        message: next
          ? `Added ${fw?.shortCode ?? "framework"} to your school's default — every teacher now sees it.`
          : `Removed ${fw?.shortCode ?? "framework"} from your school's default — affects every teacher.`,
        onUndo: () => {
          setSchoolSet(prev);
          void setSchoolFramework(id, !next);
        },
      });
    });
  }

  // ── Personal override toggle ──────────────────────────────────────────────
  function togglePersonal(id: string, next: boolean): void {
    const isDefault = schoolSet.has(id);
    // Determine the override state to persist.
    let state: "enabled" | "disabled" | "default";
    if (next) state = isDefault ? "default" : "enabled";
    else state = isDefault ? "disabled" : "default";

    const prev = new Map(overrideMap);
    const optimistic = new Map(overrideMap);
    if (state === "default") optimistic.delete(id);
    else optimistic.set(id, state === "enabled");
    setOverrideMap(optimistic);

    void setTeacherFrameworkOverride(id, state).then((res) => {
      if (!res.ok) {
        setOverrideMap(prev);
        showConsequence({ message: res.error ?? "Could not save." });
      }
    });
  }

  const schoolList = [...schoolSet]
    .map((id) => byId.get(id))
    .filter((f): f is FrameworkSummary => !!f)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className={styles.sections}>
      {/* ── School default ───────────────────────────────────────────────── */}
      <SettingsCard
        glyph={SECTION_ICONS.standards({ size: 14 })}
        anchorId="school-frameworks"
        eyebrow="School default"
        scope="team"
        title={
          <Tooltip
            content="The curriculum frameworks your whole school plans against. A school admin sets these; every teacher starts from this set."
            side="bottom"
            required
          >
            <span>School frameworks</span>
          </Tooltip>
        }
        hint="The default set every teacher on your team starts from. Major global frameworks are shown first; search to find any of 170+."
      >
        {!hasSchool ? (
          <p className={styles.note}>
            No school is associated with your account yet.
          </p>
        ) : isSchoolAdmin ? (
          <FrameworkBrowser
            frameworks={frameworks}
            selectedIds={schoolSet}
            onToggle={toggleSchool}
            mode="settings"
          />
        ) : schoolList.length > 0 ? (
          <div className={styles.readonly}>
            <p className={styles.note}>
              Set by your school admin. You can add or remove frameworks for
              yourself below.
            </p>
            <ul className={styles.chipList}>
              {schoolList.map((f) => (
                <li key={f.id} className={styles.chip}>
                  <span className={styles.chipName}>{f.name}</span>
                  <span className={styles.chipCode}>{f.shortCode}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className={styles.note}>
            Your school admin hasn’t set default frameworks yet. You can still
            choose your own below.
          </p>
        )}
      </SettingsCard>

      {/* ── Your frameworks (personal) ───────────────────────────────────── */}
      <SettingsCard
        glyph={SECTION_ICONS.standards({ size: 14 })}
        anchorId="my-frameworks"
        eyebrow="Your frameworks"
        scope="personal"
        title={
          <Tooltip
            content="The frameworks YOU plan against. Starts from the school default; add the ones you teach and remove the ones you don't. Only these appear when you tag standards on lessons."
            side="bottom"
            tooltipId="standards-personal-frameworks"
          >
            <span>Your frameworks</span>
          </Tooltip>
        }
        hint="Add the frameworks you teach or remove ones you don't. Only your frameworks appear when you tag lesson standards."
        action={
          <Badge variant="info" size="sm">
            {effectiveSet.size} active
          </Badge>
        }
      >
        <FrameworkBrowser
          frameworks={frameworks}
          selectedIds={effectiveSet}
          onToggle={togglePersonal}
          mode="settings"
          lockedIds={schoolSet}
        />
      </SettingsCard>
    </div>
  );
}
