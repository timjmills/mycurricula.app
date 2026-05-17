"use client";

// subject-colors.tsx — the per-subject swatch picker (artboard A2).
//
// Scope split, per the spec:
//   • Team subjects    — the Core Curriculum locks the subject → swatch
//     mapping team-wide. Read-only here; only the team lead can change
//     them. Shown with a "Locked" banner.
//   • Personal subjects — owned by the teacher (Morning Meeting, etc.).
//     Editable: clicking "Change" opens the 20-swatch palette inline.
//
// The eight mock SUBJECTS are all Core academic subjects, so this build
// adds two illustrative personal subjects locally — they are not from the
// shared mock data. Reassignment updates local state only (no persistence
// in this build).

import { useState } from "react";
import type { ReactNode } from "react";
import { useTheme } from "@/lib/theme";
import {
  PALETTE_20,
  PALETTE_BY_ID,
  DEFAULT_SUBJECT_MAPPING,
} from "@/lib/palette";
import type { ThemePalette } from "@/lib/theme";
import { SUBJECTS } from "@/lib/mock/subjects";
import { SettingsCard } from "./settings-card";

type Scope = "team" | "personal";

/** A subject row, generalized so personal subjects can join the list. */
interface ColorableSubject {
  id: string;
  name: string;
}

// Personal subjects are teacher-owned; the mock data has none, so this
// build seeds two so the Personal scope has something to demonstrate.
const PERSONAL_SUBJECTS: readonly ColorableSubject[] = [
  { id: "morning-meeting", name: "Morning Meeting" },
  { id: "afternoon-circle", name: "Afternoon Circle" },
] as const;

// Starting swatches for the seeded personal subjects.
const PERSONAL_DEFAULT_MAPPING: Record<string, string> = {
  "morning-meeting": "lemon",
  "afternoon-circle": "mint",
};

interface SubjectColorsProps {
  /** Core-subject mapping (controlled by the parent page). */
  mapping: Record<string, string>;
  /** Update a Core subject's swatch assignment. */
  onChange: (subjectId: string, swatchId: string) => void;
}

/** Resolve a swatch's display color for the active palette type. */
function swatchColor(swatchId: string, type: ThemePalette): string {
  const swatch = PALETTE_BY_ID[swatchId] ?? PALETTE_BY_ID.ocean;
  return type === "highlight" ? swatch.highlight : swatch.normal;
}

export function SubjectColors({
  mapping,
  onChange,
}: SubjectColorsProps): ReactNode {
  const { palette } = useTheme();
  const [scope, setScope] = useState<Scope>("personal");
  const [editingSubject, setEditingSubject] = useState<string | null>(null);

  // Personal-subject swatch assignments live entirely in this component;
  // they are not part of the app-wide Core mapping.
  const [personalMapping, setPersonalMapping] = useState<
    Record<string, string>
  >(PERSONAL_DEFAULT_MAPPING);

  const teamSubjects: ColorableSubject[] = SUBJECTS.map((s) => ({
    id: s.id,
    name: s.name,
  }));
  const subjects = scope === "team" ? teamSubjects : PERSONAL_SUBJECTS;
  const locked = scope === "team";

  const swatchIdFor = (subjectId: string): string =>
    scope === "team"
      ? (mapping[subjectId] ??
        DEFAULT_SUBJECT_MAPPING[
          subjectId as keyof typeof DEFAULT_SUBJECT_MAPPING
        ])
      : (personalMapping[subjectId] ?? "ocean");

  const assignSwatch = (subjectId: string, swatchId: string): void => {
    if (scope === "team") {
      onChange(subjectId, swatchId);
    } else {
      setPersonalMapping((prev) => ({ ...prev, [subjectId]: swatchId }));
    }
  };

  // Switching scope closes any open picker so it can't target a row that
  // is no longer visible.
  const switchScope = (next: Scope): void => {
    setScope(next);
    setEditingSubject(null);
  };

  const editingName =
    editingSubject && subjects.find((s) => s.id === editingSubject)?.name;

  return (
    <SettingsCard
      eyebrow="Subject colors"
      title="Which swatch represents each subject"
      hint="Team subjects are set in the Core Curriculum — only your team lead can change them. Personal subjects (Morning Meeting, Afternoon Circle) you own and edit."
      action={
        <div
          role="tablist"
          aria-label="Subject scope"
          style={{
            display: "inline-flex",
            padding: 3,
            background: "var(--ink-100)",
            borderRadius: 8,
            gap: 1,
          }}
        >
          {(
            [
              ["team", "Team subjects"],
              ["personal", "Personal subjects"],
            ] as const
          ).map(([id, label]) => {
            const active = scope === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchScope(id)}
                className="cp-focusable"
                style={{
                  padding: "8px 14px",
                  minHeight: 36,
                  fontSize: 12.5,
                  fontWeight: 500,
                  borderRadius: 6,
                  background: active ? "#fff" : "transparent",
                  color: active ? "var(--ink-900)" : "var(--ink-500)",
                  boxShadow: active ? "0 1px 2px rgba(20,22,32,.06)" : "none",
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      }
    >
      {/* Locked banner — team subjects are read-only for a teacher. */}
      {scope === "team" && (
        <div
          role="note"
          style={{
            marginTop: 14,
            background: "var(--important-bg)",
            border: "1px solid #facc15",
            borderRadius: 8,
            padding: "9px 12px",
            fontSize: 12.5,
            color: "#7a4f08",
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            lineHeight: 1.5,
            textWrap: "pretty",
          }}
        >
          <strong style={{ flex: "0 0 auto" }}>Locked</strong>
          <span style={{ flex: 1 }}>
            Your team lead, Omar Bishara, set these in the Core Curriculum so
            the whole team sees the same hue for each subject. Ask the lead to
            change them.
          </span>
        </div>
      )}

      {/* Subject rows — two-column grid. */}
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 10,
        }}
      >
        {subjects.map((subject) => {
          const swatchId = swatchIdFor(subject.id);
          const swatch = PALETTE_BY_ID[swatchId] ?? PALETTE_BY_ID.ocean;
          const editing = editingSubject === subject.id;
          return (
            <div
              key={subject.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                minHeight: 56,
                border: "1px solid var(--ink-150)",
                borderRadius: 10,
                background: editing ? "var(--ink-100)" : "#fff",
                opacity: locked ? 0.85 : 1,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  flex: "0 0 auto",
                  background: swatchColor(swatchId, palette),
                  border: `1px solid ${swatch.deep}26`,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--ink-900)",
                  }}
                >
                  {subject.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--ink-500)",
                    marginTop: 1,
                  }}
                >
                  {swatch.name}
                </div>
              </div>
              <button
                type="button"
                disabled={locked}
                aria-expanded={editing}
                onClick={() => setEditingSubject(editing ? null : subject.id)}
                className="cp-focusable"
                style={{
                  padding: "8px 14px",
                  minHeight: 36,
                  borderRadius: 999,
                  background: editing ? "var(--ink-900)" : "#fff",
                  color: editing
                    ? "#fff"
                    : locked
                      ? "var(--ink-400)"
                      : "var(--ink-900)",
                  border: editing
                    ? "1px solid var(--ink-900)"
                    : "1px solid var(--ink-200)",
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: locked ? "not-allowed" : "pointer",
                }}
              >
                {locked ? "Locked" : editing ? "Done" : "Change"}
              </button>
            </div>
          );
        })}
      </div>

      {/* Inline 20-swatch picker — opens for the subject being edited. */}
      {editingSubject && editingName && (
        <div
          style={{
            marginTop: 14,
            padding: 14,
            border: "1px solid var(--ink-150)",
            borderRadius: 10,
            background: "var(--ink-50)",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: "var(--ink-400)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 10,
            }}
          >
            Pick a swatch for {editingName}
          </div>
          <div
            role="radiogroup"
            aria-label={`Swatch for ${editingName}`}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))",
              gap: 8,
            }}
          >
            {PALETTE_20.map((s) => {
              const active = swatchIdFor(editingSubject) === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={s.name}
                  title={s.name}
                  onClick={() => assignSwatch(editingSubject, s.id)}
                  className="cp-focusable"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 5,
                    padding: 6,
                    minHeight: 44,
                    borderRadius: 8,
                    background: active ? "#fff" : "transparent",
                    border: active
                      ? "1.5px solid var(--ink-900)"
                      : "1.5px solid transparent",
                    cursor: "pointer",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: swatchColor(s.id, palette),
                      boxShadow: active ? `0 0 0 2px ${s.deep}` : "none",
                      border: `1px solid ${s.deep}26`,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 9.5,
                      color: "var(--ink-500)",
                      fontWeight: 500,
                    }}
                  >
                    {s.name}
                  </span>
                </button>
              );
            })}
          </div>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 11.5,
              color: "var(--ink-500)",
              lineHeight: 1.5,
              textWrap: "pretty",
            }}
          >
            The hue is locked when you save. Other teachers see the same hue —
            only the saturation changes based on their Normal/Highlight
            preference.
          </p>
        </div>
      )}
    </SettingsCard>
  );
}
