"use client";

// Settings → Subjects — the subject roster surface.
//
// Sections (top to bottom):
//   1. Team subjects    — the 8 locked subjects. Inline rename,
//                         academic/non-academic flag, archive. TEAM-scoped:
//                         every change here lands on every teacher's view.
//   2. Subjects I teach — per-teacher hide list ("I don't teach this").
//                         PERSONAL-scoped: hiding affects only this
//                         teacher's views; teammates are untouched.
//   3. My subjects      — this teacher's own custom subjects ("Band",
//                         "Quran", …). PERSONAL-scoped. Each one BORROWS a
//                         locked subject's color family — subject colors
//                         are locked team-wide (CLAUDE.md §4), so personal
//                         subjects never invent a color.
//   4. Archived         — team subjects archived from section 1, collapsed
//                         by default, each restorable. TEAM-scoped.
//
// Plus "Course sharing" (U-SHARE), rendered between §3 and §4: publish a
// personal course to the whole team or reclaim a shared one back to personal.
// Unlike the four sections above (localStorage-backed today), it is wired to
// the LIVE per-course sharing seam (lib/subjects/client → SECURITY DEFINER
// RPCs) and owns its own async load + pending/error feedback. Self-contained
// in components/settings/course-sharing-manager.tsx. TEAM-scoped +
// consequential.
//
// Scope doctrine follows /settings/curriculum: team cards fire a
// ConsequenceToast naming the team-wide blast radius (with Undo); personal
// cards persist quietly. Every card bumps `savedTick` after each persist
// so the SettingsCard header flashes its "Saved" chip — settings have no
// Save buttons, the chip is the only confirmation a change landed.
//
// Tooltip rule (CLAUDE.md §4): team-affecting controls (rename, academic
// flag, archive, restore) and destructive actions (delete) carry
// `required: true` tooltips that ignore the global off switch. Personal
// convenience controls use dismissible tooltipIds.
//
// Data layer: rosters are READ through the composition seam
// (lib/use-visible-subjects.ts — effective names, archive partition,
// hidden flags, personal subjects already applied) and WRITTEN through
// the storage hooks (lib/use-subject-settings.ts). Planner views do NOT
// consume this configuration yet — adoption is a flagged follow-up wave;
// the copy below sets that expectation.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Button, PageHeader, ToggleGroup, Tooltip } from "@/components/ui";
import { SettingsCard } from "@/components/appearance/settings-card";
import { useConsequenceToast } from "@/lib/consequence-toast";
import type { SubjectId } from "@/lib/types";
import {
  useHiddenSubjects,
  usePersonalSubjects,
  useSubjectOverrides,
} from "@/lib/use-subject-settings";
import {
  useVisibleSubjects,
  type EffectiveSubject,
} from "@/lib/use-visible-subjects";
import { SECTION_ICONS } from "@/components/settings/section-icons";
// Deep import by design — the settings barrel is owned by the settings-hub
// orchestrator; this page imports the client section directly (mirrors how
// app/settings/workspace/page.tsx deep-imports WorkspaceSettings).
import { CourseSharingManager } from "@/components/settings/course-sharing-manager";
import reveal from "@/components/settings/section-reveal.module.css";
import styles from "./page.module.css";

// ── Page ────────────────────────────────────────────────────────────────────

export default function SubjectsSettingsPage(): ReactNode {
  return (
    <div className={styles.page}>
      <div className={`${styles.inner} ${reveal.reveal}`}>
        <PageHeader
          eyebrow="Settings"
          title="Subjects"
          subtitle="Your team's subject roster, what you personally teach, and your own additions."
        />

        <TeamSubjectsSection />
        <VisibilitySection />
        <PersonalSubjectsSection />
        {/* Course sharing (U-SHARE) — personal ⇄ team publishing, wired to the
            live per-course sharing seam (lib/subjects/client). Self-contained:
            resolves its own grade + state. TEAM-scoped + consequential. */}
        <CourseSharingManager />
        <ArchivedSection />
      </div>
    </div>
  );
}

// ── Shared bits ─────────────────────────────────────────────────────────────

/**
 * The subject color chip — a small rounded square painted entirely by
 * the `.cp-subj.<cls>` cascade (tint fill + 4px accent stripe, echoing
 * the Weekly card recipe). `cls` is ALWAYS one of the 8 locked subject
 * ids; personal subjects pass their borrowed swatch. No color is ever
 * invented here (CLAUDE.md §4).
 */
function SubjectSwatch({
  cls,
  dimmed = false,
}: {
  cls: SubjectId;
  dimmed?: boolean;
}): ReactNode {
  return (
    <span
      className={[
        "cp-subj",
        cls,
        styles.swatch,
        dimmed ? styles.swatchDimmed : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-hidden="true"
    />
  );
}

/** The active (non-archived) team half of the composed roster. */
function teamRoster(all: EffectiveSubject[]): EffectiveSubject[] {
  return all.filter((s) => !s.isPersonal && !s.archived);
}

// ── Inline rename ───────────────────────────────────────────────────────────
// Click-to-edit name. At rest: a button showing the effective name plus a
// hover/focus-revealed pencil glyph (always faintly visible on touch — see
// the module CSS @media (hover: none) block). Clicking swaps in a text
// input that commits on blur or Enter and cancels on Escape. Focus returns
// to the rename button after the input unmounts so keyboard flow is
// unbroken. The commit callback receives the raw draft; the parent decides
// whether anything actually changed.

interface InlineRenameProps {
  /** Current effective display name. */
  value: string;
  /** The locked roster name (for the accessible label). */
  baseName: string;
  /** Required onboarding tooltip — team-affecting control. */
  tooltip: string;
  onCommit: (raw: string) => void;
}

function InlineRename({
  value,
  baseName,
  tooltip,
  onCommit,
}: InlineRenameProps): ReactNode {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  // Set when Escape is pressed so the blur-commit becomes a cancel.
  const cancelledRef = useRef(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus + select the input as soon as edit mode mounts it.
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const begin = (): void => {
    setDraft(value);
    cancelledRef.current = false;
    setEditing(true);
  };

  const commit = (): void => {
    setEditing(false);
    if (!cancelledRef.current) onCommit(draft);
    // Return focus to the rename button (it re-mounts on the next paint).
    // The Tooltip primitive owns the button's ref, so we reach it through
    // the wrapper instead.
    requestAnimationFrame(() => {
      wrapRef.current?.querySelector("button")?.focus();
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      // Commit via the blur handler so the two paths stay identical.
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      cancelledRef.current = true;
      e.currentTarget.blur();
    }
  };

  return (
    <span ref={wrapRef} className={styles.renameWrap}>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setDraft(e.target.value)
          }
          onBlur={commit}
          onKeyDown={onKeyDown}
          maxLength={40}
          autoComplete="off"
          spellCheck={false}
          aria-label={`Rename ${baseName} for the whole team`}
          title="Press Enter or click away to save. Esc cancels. Clearing the field restores the original name."
          className={styles.renameInput}
        />
      ) : (
        <Tooltip content={tooltip} side="top" required>
          <button
            type="button"
            onClick={begin}
            className={styles.renameButton}
            aria-label={`Rename ${value} — renames it for every teacher on your team`}
          >
            <span className={styles.renameLabel}>{value}</span>
            <span className={styles.renameGlyph} aria-hidden="true">
              ✎
            </span>
          </button>
        </Tooltip>
      )}
    </span>
  );
}

// ── Section 1 — Team subjects ───────────────────────────────────────────────
// Roster rows for the active (non-archived) locked subjects. Each row:
// color swatch (locked), inline rename, academic/non-academic toggle,
// archive action. All three mutations are TEAM-scoped → ConsequenceToast
// with Undo + savedTick bump.

function TeamSubjectsSection(): ReactNode {
  const { all } = useVisibleSubjects();
  const { updateOverride } = useSubjectOverrides();
  const { showConsequence } = useConsequenceToast();
  const [savedTick, setSavedTick] = useState(0);
  const bump = (): void => setSavedTick((t) => t + 1);

  // Archived subjects live in section 4; this roster shows the rest.
  const active = useMemo(() => teamRoster(all), [all]);

  /** Commit an inline rename. Empty draft = reset to the locked name. */
  const commitRename = (entry: EffectiveSubject, raw: string): void => {
    const base = entry.baseName ?? entry.name;
    const prevName = entry.name;
    const trimmed = raw.trim();
    const nextName = trimmed === "" ? base : trimmed;
    if (nextName === prevName) return; // no-op — no toast, no tick
    updateOverride(entry.cls, { name: trimmed });
    bump();
    // W2-B8: name the team-wide effect + offer Undo. The hook clears the
    // override when the name returns to the locked default, so Undo with
    // the previous effective name round-trips cleanly either way.
    showConsequence({
      message:
        nextName === base
          ? `“${prevName}” reset to “${base}” — the whole team sees the original name again.`
          : `“${prevName}” renamed to “${nextName}” for the whole team.`,
      onUndo: () => updateOverride(entry.cls, { name: prevName }),
    });
  };

  /** Flip the team-wide academic flag. */
  const setAcademic = (entry: EffectiveSubject, isAcademic: boolean): void => {
    if (entry.isAcademic === isAcademic) return;
    updateOverride(entry.cls, { isAcademic });
    bump();
    showConsequence({
      message: isAcademic
        ? `“${entry.name}” is academic again for the whole team — its lessons use the structured lesson flow.`
        : `“${entry.name}” is now non-academic for the whole team — its blocks skip the structured lesson flow.`,
      onUndo: () => updateOverride(entry.cls, { isAcademic: entry.isAcademic }),
    });
  };

  /** Archive a subject for the whole team (restorable in section 4). */
  const archive = (entry: EffectiveSubject): void => {
    updateOverride(entry.cls, { archived: true });
    bump();
    showConsequence({
      message: `“${entry.name}” archived for the whole team — restore it any time from the Archived section below.`,
      onUndo: () => updateOverride(entry.cls, { archived: false }),
    });
  };

  return (
    <SettingsCard
      glyph={SECTION_ICONS.subjects({ size: 14 })}
      tone="brand"
      anchorId="team-subjects"
      scope="team"
      eyebrow="Roster"
      savedTick={savedTick}
      title={
        <Tooltip
          content="The subjects your whole team plans against. Renames, academic flags, and archiving here change every teacher's view — colors stay locked so they mean the same thing on every screen."
          side="bottom"
          required
        >
          <span>Team subjects</span>
        </Tooltip>
      }
      hint="The team's shared subject roster. Names, academic flags, and archiving are editable; each subject's color is locked team-wide so it carries the same meaning for everyone."
    >
      <ul className={styles.rosterList}>
        {active.map((s) => {
          const base = s.baseName ?? s.name;
          return (
            <li key={s.id} className={styles.rosterRow}>
              <SubjectSwatch cls={s.cls} />

              <div className={styles.nameCell}>
                <InlineRename
                  value={s.name}
                  baseName={base}
                  tooltip={`Renames this subject for every teacher on your team. Click to edit — the color stays ${base}'s either way.`}
                  onCommit={(raw) => commitRename(s, raw)}
                />
                {s.baseName && (
                  <span className={styles.subNote}>was {s.baseName}</span>
                )}
              </div>

              <div className={styles.rowControls}>
                <ToggleGroup
                  size="sm"
                  ariaLabel={`${s.name} — academic or non-academic`}
                  tooltipRequired
                  value={s.isAcademic ? "academic" : "non-academic"}
                  onChange={(v) => setAcademic(s, v === "academic")}
                  options={[
                    {
                      value: "academic",
                      label: "Academic",
                      title: `Make “${s.name}” academic for every teacher on your team — its lessons get the structured lesson-flow sections.`,
                    },
                    {
                      value: "non-academic",
                      label: "Non-academic",
                      title: `Make “${s.name}” non-academic for every teacher on your team — its blocks (like lunch or assembly) skip the lesson-flow sections.`,
                    },
                  ]}
                />
                <Tooltip
                  content={`Archive “${s.name}” for every teacher on your team — it leaves the roster and moves to the Archived section below. You can restore it any time.`}
                  side="top"
                  required
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => archive(s)}
                    aria-label={`Archive ${s.name} for the whole team`}
                  >
                    Archive
                  </Button>
                </Tooltip>
              </div>
            </li>
          );
        })}
      </ul>
      <p className={styles.fieldHint}>
        Subject colors are locked team-wide — a renamed subject keeps its color,
        so &ldquo;Maths&rdquo; still reads as Math on every teacher&rsquo;s
        grid. Archiving hides a subject everywhere for everyone; it never
        deletes the team&rsquo;s lessons.
      </p>
    </SettingsCard>
  );
}

// ── Section 2 — Subjects I teach ────────────────────────────────────────────
// Per-teacher visibility switches over the active team roster. Toggling a
// switch off adds the subject to this teacher's hidden list — PERSONAL
// scope, so no ConsequenceToast; the card's "Saved" chip is the feedback.

function VisibilitySection(): ReactNode {
  const { all } = useVisibleSubjects();
  const { toggleHidden } = useHiddenSubjects();
  const [savedTick, setSavedTick] = useState(0);

  const active = useMemo(() => teamRoster(all), [all]);

  const onToggle = (id: SubjectId): void => {
    toggleHidden(id);
    setSavedTick((t) => t + 1);
  };

  return (
    <SettingsCard
      glyph={SECTION_ICONS.subjects({ size: 14 })}
      tone="brand"
      anchorId="subject-visibility"
      scope="personal"
      eyebrow="Visibility"
      savedTick={savedTick}
      title={
        <Tooltip
          content="Pick the subjects you actually teach. Anything you switch off disappears from your views only — teammates and the Team Curriculum aren't affected."
          side="bottom"
          tooltipId="settings-subjects-visibility"
        >
          <span>Subjects I teach</span>
        </Tooltip>
      }
      hint="Switch off anything you don't teach — it hides from your views only. Your teammates still see it, and the Team Curriculum is untouched."
    >
      <ul className={styles.rosterList}>
        {active.map((s) => {
          const teaches = !s.hidden;
          const tip = teaches
            ? `Hide “${s.name}” from your views — only you stop seeing it; your teammates aren't affected.`
            : `Show “${s.name}” in your views again.`;
          return (
            <li
              key={s.id}
              className={[styles.rosterRow, styles.rosterRowInline].join(" ")}
            >
              <SubjectSwatch cls={s.cls} dimmed={!teaches} />
              <span
                className={[styles.rowName, teaches ? "" : styles.rowNameHidden]
                  .filter(Boolean)
                  .join(" ")}
              >
                {s.name}
              </span>
              <div className={styles.rowControls}>
                <Tooltip
                  content={tip}
                  side="top"
                  tooltipId="settings-subjects-teach-toggle"
                >
                  <button
                    type="button"
                    role="switch"
                    aria-checked={teaches}
                    aria-label={`I teach ${s.name}`}
                    onClick={() => onToggle(s.cls)}
                    className={[styles.switch, teaches ? styles.switchOn : ""]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span className={styles.switchThumb} aria-hidden="true" />
                  </button>
                </Tooltip>
              </div>
            </li>
          );
        })}
      </ul>
      <p className={styles.fieldHint}>
        Hiding is personal and reversible — flip the switch back any time. Your
        planner views (Weekly, Daily, Year) adopt this list as the rollout
        lands; Settings respects it today.
      </p>
    </SettingsCard>
  );
}

// ── Section 3 — My subjects ─────────────────────────────────────────────────
// This teacher's own custom subjects + the add flow. The swatch picker
// offers EXACTLY the 8 locked subject palettes — a personal subject
// borrows an existing color family rather than inventing a color
// (CLAUDE.md §4). PERSONAL scope: no ConsequenceToast.

function PersonalSubjectsSection(): ReactNode {
  const { all } = useVisibleSubjects();
  const { add, remove } = usePersonalSubjects();
  const [savedTick, setSavedTick] = useState(0);

  // The 8 lockable palettes, with effective (possibly renamed) labels.
  // Archived subjects stay offered — their palette still exists; only
  // the roster entry is parked.
  const teamEntries = useMemo(() => all.filter((s) => !s.isPersonal), [all]);
  const personal = useMemo(() => all.filter((s) => s.isPersonal), [all]);
  const teamNameByCls = useMemo(
    () => new Map(teamEntries.map((s) => [s.cls, s.name])),
    [teamEntries],
  );

  // Add-form draft — cleared on a successful add. Inline (no modal) so a
  // teacher adding several subjects in a row never re-opens a dialog.
  const [draftName, setDraftName] = useState("");
  const [draftSwatch, setDraftSwatch] = useState<SubjectId | null>(null);

  const trimmedName = draftName.trim();
  const canSubmit = trimmedName !== "" && draftSwatch !== null;

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!canSubmit || draftSwatch === null) return;
    if (!add(trimmedName, draftSwatch)) return;
    setDraftName("");
    setDraftSwatch(null);
    setSavedTick((t) => t + 1);
  };

  const onRemove = (id: string): void => {
    remove(id);
    setSavedTick((t) => t + 1);
  };

  return (
    <SettingsCard
      glyph={SECTION_ICONS.subjects({ size: 14 })}
      tone="brand"
      anchorId="personal-subjects"
      scope="personal"
      eyebrow="My additions"
      savedTick={savedTick}
      title={
        <Tooltip
          content="Subjects only you teach — Band, Quran, Homeroom… They exist in your account alone and borrow a team subject's color, since colors are locked team-wide."
          side="bottom"
          tooltipId="settings-subjects-personal"
        >
          <span>My subjects</span>
        </Tooltip>
      }
      hint="Your own subjects, visible only to you. Each one borrows a team subject's color family — subject colors are locked team-wide, so personal subjects reuse one of the eight."
    >
      {/* ── Add flow ─────────────────────────────────────────────────── */}
      <form className={styles.addForm} onSubmit={onSubmit} noValidate>
        <div className={styles.addNameField}>
          <label htmlFor="personal-subject-name" className={styles.fieldLabel}>
            Name
          </label>
          <Tooltip
            content="What you call this subject — it appears only in your account, never on a teammate's screen."
            side="bottom"
          >
            <input
              id="personal-subject-name"
              name="personalSubjectName"
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="e.g. Band, Quran, Homeroom"
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
              title="What you call this subject — it appears only in your account, never on a teammate's screen."
              className={styles.textInput}
            />
          </Tooltip>
        </div>

        {/* The 8 locked palettes, each labeled with its subject's
            (effective) name. Selecting one is the explicit "borrow"
            moment, so the locked-color rule stays legible to teachers. */}
        <fieldset className={styles.swatchFieldset}>
          <legend className={styles.fieldLabel}>
            Color — borrowed from a team subject
          </legend>
          <div className={styles.swatchGrid}>
            {teamEntries.map((s) => {
              const selected = draftSwatch === s.cls;
              const tip = `Borrow ${s.name}'s color for your new subject. Subject colors are locked team-wide, so personal subjects reuse one of the eight team palettes.`;
              return (
                <Tooltip key={s.cls} content={tip} side="top">
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={`Borrow ${s.name}'s color`}
                    onClick={() => setDraftSwatch(s.cls)}
                    title={tip}
                    className={[
                      "cp-subj",
                      s.cls,
                      styles.swatchOption,
                      selected ? styles.swatchOptionOn : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span
                      className={styles.swatchOptionChip}
                      aria-hidden="true"
                    />
                    <span className={styles.swatchOptionLabel}>{s.name}</span>
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </fieldset>

        <div className={styles.addAction}>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!canSubmit}
            tooltip={
              canSubmit
                ? `Add “${trimmedName}” to your personal subjects — only you will see it.`
                : "Type a name and pick a borrowed color first — a personal subject needs both."
            }
          >
            + Add subject
          </Button>
          {draftSwatch !== null && (
            <span className={styles.subNote} aria-live="polite">
              borrows {teamNameByCls.get(draftSwatch)}&rsquo;s color
            </span>
          )}
        </div>
      </form>

      {/* ── Existing personal subjects ───────────────────────────────── */}
      <ul className={styles.rosterList}>
        {personal.length === 0 ? (
          <li className={styles.emptyNote}>
            No personal subjects yet &mdash; add one above.
          </li>
        ) : (
          personal.map((p) => (
            <li
              key={p.id}
              className={[styles.rosterRow, styles.rosterRowInline].join(" ")}
            >
              <SubjectSwatch cls={p.cls} />
              <div className={styles.nameCell}>
                <span className={styles.rowName}>{p.name}</span>
                <span className={styles.subNote}>
                  borrows {teamNameByCls.get(p.cls)}&rsquo;s color
                </span>
              </div>
              <div className={styles.rowControls}>
                {/* Destructive action → required tooltip (CLAUDE.md §4). */}
                <Tooltip
                  content={`Delete “${p.name}” from your personal subjects. Only your account is affected — but this can't be undone.`}
                  side="top"
                  required
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(p.id)}
                    aria-label={`Delete personal subject ${p.name}`}
                  >
                    Delete
                  </Button>
                </Tooltip>
              </div>
            </li>
          ))
        )}
      </ul>
    </SettingsCard>
  );
}

// ── Section 4 — Archived ────────────────────────────────────────────────────
// Disclosure-collapsed list of team subjects archived in section 1, each
// with a Restore action. TEAM-scoped: restore fires a ConsequenceToast
// with Undo. Collapsed by default so the page stays focused on the
// active roster.

function ArchivedSection(): ReactNode {
  const { archived } = useVisibleSubjects();
  const { updateOverride } = useSubjectOverrides();
  const { showConsequence } = useConsequenceToast();
  const [savedTick, setSavedTick] = useState(0);
  const [open, setOpen] = useState(false);

  const restore = (entry: EffectiveSubject): void => {
    updateOverride(entry.cls, { archived: false });
    setSavedTick((t) => t + 1);
    showConsequence({
      message: `“${entry.name}” restored for the whole team — it's back on every teacher's roster.`,
      onUndo: () => updateOverride(entry.cls, { archived: true }),
    });
  };

  return (
    <SettingsCard
      glyph={SECTION_ICONS.subjects({ size: 14 })}
      tone="brand"
      anchorId="archived-subjects"
      scope="team"
      eyebrow="Roster"
      savedTick={savedTick}
      title={
        <Tooltip
          content="Team subjects that were archived — hidden from every teacher's views. Restoring one brings it back for the whole team."
          side="bottom"
          required
        >
          <span>Archived</span>
        </Tooltip>
      }
      hint="Subjects archived from the team roster. They're hidden everywhere for everyone, but nothing is deleted — restore any of them below."
    >
      <Tooltip
        content="Show or hide the list of archived team subjects."
        side="top"
        tooltipId="settings-subjects-archived-disclosure"
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls="archived-subjects-list"
          onClick={() => setOpen((o) => !o)}
          className={styles.disclosure}
        >
          <span
            className={styles.disclosureChevron}
            data-open={open || undefined}
            aria-hidden="true"
          >
            ▸
          </span>
          {open
            ? "Hide archived subjects"
            : `Show archived subjects (${archived.length})`}
        </button>
      </Tooltip>

      {open && (
        <div id="archived-subjects-list" className={styles.archivedRegion}>
          {archived.length === 0 ? (
            <p className={styles.emptyNote}>
              Nothing archived &mdash; every team subject is active.
            </p>
          ) : (
            <ul className={styles.rosterList}>
              {archived.map((s) => (
                <li
                  key={s.id}
                  className={[styles.rosterRow, styles.rosterRowInline].join(
                    " ",
                  )}
                >
                  <SubjectSwatch cls={s.cls} dimmed />
                  <div className={styles.nameCell}>
                    <span
                      className={[styles.rowName, styles.rowNameHidden].join(
                        " ",
                      )}
                    >
                      {s.name}
                    </span>
                    <span className={styles.subNote}>
                      archived for the whole team
                    </span>
                  </div>
                  <div className={styles.rowControls}>
                    <Tooltip
                      content={`Restore “${s.name}” for every teacher on your team — it returns to the roster, schedules, and filters.`}
                      side="top"
                      required
                    >
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => restore(s)}
                        aria-label={`Restore ${s.name} for the whole team`}
                      >
                        Restore
                      </Button>
                    </Tooltip>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </SettingsCard>
  );
}
