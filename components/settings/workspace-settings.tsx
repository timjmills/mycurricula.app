"use client";

// workspace-settings.tsx — Settings → Workspace & Team management sections.
//
// Three SettingsCards rendered above the relocated Team section (see
// app/settings/workspace/page.tsx):
//
//   1. Workspace        (anchorId "workspace-name",   TEAM-scoped)
//      Rename the workspace. Persists on blur/Enter via
//      lib/use-workspace-settings.ts; the NotebookProvider overlay makes the
//      new name appear in the SideNav switcher for every teacher.
//   2. Notebooks        (anchorId "notebooks",        TEAM-scoped)
//      List / inline-rename / archive / restore / create notebooks. Writes
//      the notebook OVERLAY (entries layered over the provider base list —
//      matching id replaces, new id adds). Workspace-admin gated: non-admins
//      see the list but every management control is disabled with a tooltip
//      explaining why (CLAUDE.md §4 disabled-control rule).
//   3. Default notebook (anchorId "default-notebook", USER-scoped)
//      Radio picker over ACTIVE notebooks choosing where the app opens when
//      no active-notebook selection is stored on the device.
//
// Tooltip rules (CLAUDE.md §4):
//   • Team-wide / destructive controls (rename workspace, rename / archive /
//     restore / create notebook) → required: true (never dismissible).
//   • Personal, non-consequential controls (default-notebook options,
//     archived disclosure) → tooltipId (dismissible).
//   • Self-evident text buttons ("Save", "Cancel") → no tooltip.
//
// Consequence toasts (W2-B8): every TEAM-scoped commit names the blast
// radius and offers Undo. The personal default-notebook pick gets only the
// SettingsCard "Saved" flash (savedTick) — toasts are for team-wide effects.
//
// Provider note: the settings tree lives OUTSIDE the (planner) route group,
// so the planner's NotebookProvider (app/(planner)/layout.tsx) is not above
// this component. We mount one here — it derives identical state from the
// same localStorage overlay keys, so the two instances can never disagree.
// (Mirrors how app/settings/layout.tsx mounts its own AppStateProvider.)
//
// Responsive: rows are CSS-grid based and stack name-over-actions at ≤540px;
// every control keeps a ≥44px hit target (see workspace-settings.module.css).

import {
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  NotebookProvider,
  useNotebookState,
  type NotebookEntry,
} from "@/lib/notebook-state";
import {
  useDefaultNotebookId,
  useNotebookOverlay,
  useWorkspaceName,
} from "@/lib/use-workspace-settings";
import { useConsequenceToast } from "@/lib/consequence-toast";
import { Button, PageHeader, Tooltip } from "@/components/ui";
import { SettingsCard, RadioDot } from "@/components/appearance/settings-card";
import { useRovingRadio } from "@/components/appearance/use-roving-radio";
import { SECTION_ICONS } from "@/components/settings/section-icons";
import reveal from "@/components/settings/section-reveal.module.css";
import styles from "./workspace-settings.module.css";

// ── Top-level composition ──────────────────────────────────────────────────

/** The Workspace & Team management stack — page header + the three cards. */
export function WorkspaceSettings(): ReactNode {
  return (
    // Settings has no NotebookProvider above it (see provider note in the
    // header comment) — mount one here so the cards can read the merged
    // notebook list, the resolved workspace name, and isWorkspaceAdmin.
    <NotebookProvider>
      <div className={styles.page}>
        <div className={`${styles.inner} ${reveal.reveal}`}>
          <PageHeader
            eyebrow="Settings"
            title="Workspace & Team"
            subtitle="Your school's workspace — its name and notebooks — and the teachers who share it."
          />
          <WorkspaceNameCard />
          <NotebooksCard />
          <DefaultNotebookCard />
        </div>
      </div>
    </NotebookProvider>
  );
}

// ── Card 1 — Workspace (rename) ────────────────────────────────────────────
// Single text input bound to the resolved workspace name. Saves on blur;
// Enter blurs the field so there is exactly one commit path. Empty input is
// refused (the workspace always has a name) — the draft snaps back.

function WorkspaceNameCard(): ReactNode {
  const { workspaceName, isWorkspaceAdmin } = useNotebookState();
  const { workspaceNameOverride, setWorkspaceName } = useWorkspaceName();
  const { showConsequence } = useConsequenceToast();
  const [savedTick, setSavedTick] = useState(0);

  // Local draft — independent while typing; re-syncs whenever the resolved
  // name changes (cross-tab edit, undo, overlay arrival post-mount).
  const [draft, setDraft] = useState<string>(workspaceName);
  useEffect(() => {
    setDraft(workspaceName);
  }, [workspaceName]);

  const commit = (): void => {
    const trimmed = draft.trim();
    if (trimmed === workspaceName) return; // untouched blur — no-op
    if (trimmed === "") {
      // The workspace always has a name — snap the draft back instead of
      // persisting an empty override.
      setDraft(workspaceName);
      return;
    }
    // Capture the previous OVERRIDE (null = "still the provider default")
    // so Undo restores the exact prior state, not just the prior string.
    const previousOverride = workspaceNameOverride;
    setWorkspaceName(trimmed);
    setSavedTick((t) => t + 1);
    // W2-B8: name the team-wide effect + offer Undo while visible.
    showConsequence({
      message: `Workspace renamed to “${trimmed}” — every teacher in this workspace now sees the new name.`,
      onUndo: () => setWorkspaceName(previousOverride),
    });
  };

  // Enter commits by blurring — blur is the single commit path.
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  // Disabled controls explain WHY they're disabled (CLAUDE.md §4).
  const tip = isWorkspaceAdmin
    ? "Renames the workspace for every teacher — the new name appears in the sidebar for your whole team. Saves when you press Enter or click out of the field."
    : "Only a workspace admin can rename the workspace — ask your admin to change it.";

  return (
    <SettingsCard
      glyph={SECTION_ICONS.workspace({ size: 14 })}
      tone="teal"
      anchorId="workspace-name"
      scope="team"
      eyebrow="Identity"
      savedTick={savedTick}
      title={
        <Tooltip
          content="Your school's workspace — the home every notebook and teammate belongs to. Its name shows in the sidebar for the whole team."
          side="bottom"
        >
          <span>Workspace</span>
        </Tooltip>
      }
      hint="The school-wide workspace that holds every notebook and teammate."
    >
      <div className={styles.formRow}>
        <label htmlFor="workspace-name-input" className={styles.fieldLabel}>
          Workspace name
        </label>
        {/* required: renaming the workspace is a team-wide setting. */}
        <Tooltip content={tip} side="bottom" required>
          <input
            id="workspace-name-input"
            name="workspaceName"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            disabled={!isWorkspaceAdmin}
            placeholder="e.g. Al-Noor School"
            autoComplete="off"
            spellCheck={false}
            maxLength={60}
            title={tip}
            className={styles.textInput}
          />
        </Tooltip>
        <p className={styles.fieldHint}>
          Saves when you press Enter or click out of the field. Every teacher in
          the workspace sees the new name.
        </p>
      </div>
    </SettingsCard>
  );
}

// ── Card 2 — Notebooks (list / rename / archive / restore / create) ───────

function NotebooksCard(): ReactNode {
  const { allNotebooks, activeNotebooks, isWorkspaceAdmin } =
    useNotebookState();
  const { upsertNotebook, createNotebook, removeNotebookOverride } =
    useNotebookOverlay();
  const { showConsequence } = useConsequenceToast();
  const [savedTick, setSavedTick] = useState(0);
  const bump = (): void => setSavedTick((t) => t + 1);

  const archived = allNotebooks.filter((nb) => !nb.isActive);
  // The app always needs ≥1 active notebook (the planner views render the
  // active one) — archiving the last active notebook is refused in the UI.
  const canArchive = activeNotebooks.length > 1;

  const handleRename = (nb: NotebookEntry, newName: string): void => {
    const previous: NotebookEntry = { ...nb };
    upsertNotebook({
      gradeLevelId: nb.gradeLevelId,
      name: newName,
      isActive: nb.isActive,
    });
    bump();
    showConsequence({
      message: `Notebook renamed to “${newName}” — every teacher in this workspace now sees it.`,
      onUndo: () => upsertNotebook(previous),
    });
  };

  const handleArchive = (nb: NotebookEntry): void => {
    upsertNotebook({
      gradeLevelId: nb.gradeLevelId,
      name: nb.name,
      isActive: false,
    });
    bump();
    showConsequence({
      message: `“${nb.name}” archived — it's hidden from the notebook switcher for every teacher. Restore it from the Archived list anytime.`,
      onUndo: () =>
        upsertNotebook({
          gradeLevelId: nb.gradeLevelId,
          name: nb.name,
          isActive: true,
        }),
    });
  };

  const handleRestore = (nb: NotebookEntry): void => {
    upsertNotebook({
      gradeLevelId: nb.gradeLevelId,
      name: nb.name,
      isActive: true,
    });
    bump();
    showConsequence({
      message: `“${nb.name}” restored — it's back in the notebook switcher for every teacher.`,
      onUndo: () =>
        upsertNotebook({
          gradeLevelId: nb.gradeLevelId,
          name: nb.name,
          isActive: false,
        }),
    });
  };

  const handleCreate = (name: string): boolean => {
    const trimmed = name.trim();
    const id = createNotebook(trimmed);
    if (id === null) return false;
    bump();
    showConsequence({
      message: `Notebook “${trimmed}” created — every teacher in this workspace can see it.`,
      // Undo removes the overlay entry entirely — a just-created notebook
      // vanishes rather than lingering as an archived row.
      onUndo: () => removeNotebookOverride(id),
    });
    return true;
  };

  return (
    <SettingsCard
      glyph={SECTION_ICONS.workspace({ size: 14 })}
      tone="teal"
      anchorId="notebooks"
      scope="team"
      eyebrow="Grade levels"
      savedTick={savedTick}
      title={
        <Tooltip
          content="The notebooks (grade levels) in your workspace — each one is its own curriculum. Rename, add, or archive them for the whole team."
          side="bottom"
        >
          <span>Notebooks</span>
        </Tooltip>
      }
      hint="Each notebook is one grade level's curriculum. Changes here update the notebook switcher for every teacher."
    >
      {/* ── Active notebooks ─────────────────────────────────────────── */}
      {activeNotebooks.length === 0 ? (
        <p className={styles.emptyHint}>
          No active notebooks — restore one from the Archived list below.
        </p>
      ) : (
        <ul className={styles.nbList}>
          {activeNotebooks.map((nb) => (
            <ActiveNotebookRow
              key={nb.gradeLevelId}
              notebook={nb}
              isAdmin={isWorkspaceAdmin}
              canArchive={canArchive}
              onRename={handleRename}
              onArchive={handleArchive}
            />
          ))}
        </ul>
      )}

      {/* ── "+ New notebook" creation row ────────────────────────────── */}
      <NewNotebookForm isAdmin={isWorkspaceAdmin} onCreate={handleCreate} />

      {/* ── Archived disclosure — only when something is archived ─────── */}
      {archived.length > 0 && (
        <details className={styles.archived}>
          {/* Named disclosure → dismissible onboarding tooltip (not
              required — opening a list is not a consequential action). */}
          <Tooltip
            content="Notebooks the team archived — they keep their lessons and can be restored anytime."
            side="bottom"
            tooltipId="settings-archived-notebooks"
          >
            <summary className={styles.archivedSummary}>
              <span className={styles.archivedChevron} aria-hidden="true" />
              Archived
              <span className={styles.archivedCount}>{archived.length}</span>
            </summary>
          </Tooltip>
          <ul className={styles.nbList}>
            {archived.map((nb) => {
              const restoreTip = isWorkspaceAdmin
                ? `Restore “${nb.name}” for the whole team — it returns to the notebook switcher with all its lessons.`
                : "Only a workspace admin can restore notebooks — ask your admin.";
              return (
                <li key={nb.gradeLevelId} className={styles.nbRow}>
                  <span className={`${styles.nbName} ${styles.nbNameArchived}`}>
                    {nb.name}
                  </span>
                  <div className={styles.nbActions}>
                    {/* required: restoring is a team-wide action. */}
                    <Tooltip content={restoreTip} side="top" required>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!isWorkspaceAdmin}
                        onClick={() => handleRestore(nb)}
                        aria-label={`Restore notebook ${nb.name}`}
                      >
                        Restore
                      </Button>
                    </Tooltip>
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </SettingsCard>
  );
}

// One active-notebook row. Owns its inline-rename state so sibling rows
// stay independent (only one row can be mid-rename without affecting the
// others' display mode).
function ActiveNotebookRow({
  notebook,
  isAdmin,
  canArchive,
  onRename,
  onArchive,
}: {
  notebook: NotebookEntry;
  isAdmin: boolean;
  canArchive: boolean;
  onRename: (nb: NotebookEntry, newName: string) => void;
  onArchive: (nb: NotebookEntry) => void;
}): ReactNode {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notebook.name);

  const startEdit = (): void => {
    setDraft(notebook.name);
    setEditing(true);
  };

  const commit = (): void => {
    setEditing(false);
    const trimmed = draft.trim();
    // Empty or unchanged → exit edit mode without persisting.
    if (trimmed === "" || trimmed === notebook.name) return;
    onRename(notebook, trimmed);
  };

  const cancel = (): void => {
    setEditing(false);
  };

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    }
  };

  // Save/Cancel prevent default on mousedown so the input never blurs
  // mid-click — blur would commit first and unmount the buttons before
  // their own click handler could run.
  const keepFocus = (e: MouseEvent<HTMLButtonElement>): void => {
    e.preventDefault();
  };

  if (editing) {
    return (
      <li className={styles.nbRow}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onInputKeyDown}
          onBlur={commit}
          // Entering an explicit edit mode — focusing the field is the
          // expected behavior (same pattern as TeamPage's rename input).
          autoFocus
          maxLength={60}
          autoComplete="off"
          spellCheck={false}
          aria-label={`New name for notebook ${notebook.name}`}
          title="Type the new name — Enter saves, Esc cancels."
          className={`${styles.textInput} ${styles.nbRenameInput}`}
        />
        <div className={styles.nbActions}>
          {/* Self-evident labels — no tooltips (CLAUDE.md §4). */}
          <Button
            variant="primary"
            size="sm"
            onMouseDown={keepFocus}
            onClick={commit}
          >
            Save
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onMouseDown={keepFocus}
            onClick={cancel}
          >
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  const renameTip = isAdmin
    ? `Rename “${notebook.name}” for every teacher in the workspace.`
    : "Only a workspace admin can rename notebooks — ask your admin.";
  const archiveTip = !isAdmin
    ? "Only a workspace admin can archive notebooks — ask your admin."
    : !canArchive
      ? "This is the only active notebook — create or restore another before archiving it."
      : `Archive “${notebook.name}” for the whole team — it leaves the notebook switcher but keeps all its lessons. Restore it anytime.`;

  return (
    <li className={styles.nbRow}>
      <span className={styles.nbName}>{notebook.name}</span>
      <div className={styles.nbActions}>
        {/* required: renaming is a team-wide action. */}
        <Tooltip content={renameTip} side="top" required>
          <Button
            variant="ghost"
            size="sm"
            disabled={!isAdmin}
            onClick={startEdit}
            aria-label={`Rename notebook ${notebook.name}`}
          >
            Rename
          </Button>
        </Tooltip>
        {/* required: archiving is destructive + team-wide. */}
        <Tooltip content={archiveTip} side="top" required>
          <Button
            variant="ghost"
            size="sm"
            disabled={!isAdmin || !canArchive}
            onClick={() => onArchive(notebook)}
            aria-label={`Archive notebook ${notebook.name}`}
          >
            Archive
          </Button>
        </Tooltip>
      </div>
    </li>
  );
}

// "+ New notebook" creation row — inline form (no modal) so an admin
// setting up several grade levels can add them back-to-back.
function NewNotebookForm({
  isAdmin,
  onCreate,
}: {
  isAdmin: boolean;
  onCreate: (name: string) => boolean;
}): ReactNode {
  const [name, setName] = useState("");
  const canSubmit = isAdmin && name.trim() !== "";

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!canSubmit) return;
    if (onCreate(name)) setName("");
  };

  const inputTip = isAdmin
    ? "Name the new notebook — usually a grade level, like “Grade 6”."
    : "Only a workspace admin can create notebooks — ask your admin.";
  const buttonTip = !isAdmin
    ? "Only a workspace admin can create notebooks — ask your admin."
    : !canSubmit
      ? "Type a name first — then the notebook is created for the whole workspace."
      : "Create this notebook for the whole workspace — every teacher will see it in the notebook switcher.";

  return (
    <form className={styles.newNbForm} onSubmit={onSubmit} noValidate>
      <label htmlFor="new-notebook-name" className={styles.fieldLabel}>
        New notebook
      </label>
      <div className={styles.newNbRow}>
        {/* required: creating a notebook is a team-wide action. */}
        <Tooltip content={inputTip} side="bottom" required>
          <input
            id="new-notebook-name"
            name="newNotebookName"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isAdmin}
            placeholder="e.g. Grade 6"
            autoComplete="off"
            spellCheck={false}
            maxLength={60}
            title={inputTip}
            className={styles.textInput}
          />
        </Tooltip>
        <Tooltip content={buttonTip} side="top" required>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!canSubmit}
          >
            + New notebook
          </Button>
        </Tooltip>
      </div>
      <p className={styles.fieldHint}>
        New notebooks start active and appear in every teacher&rsquo;s notebook
        switcher immediately.
      </p>
    </form>
  );
}

// ── Card 3 — Default notebook (personal) ───────────────────────────────────
// Radio picker over ACTIVE notebooks. "First active notebook" is the
// explicit no-preference option (clears the stored id). The pick only
// applies when no active-notebook selection is stored on the device —
// switching notebooks in the SideNav stores a selection that wins.
//
// Keyboard: useRovingRadio (the shared WAI-ARIA radiogroup pattern from the
// appearance pickers) — one Tab stop, arrows move + select, Home/End jump.

/** Roving-radio sentinel for the no-preference option (null id). */
const AUTO_OPTION = "__auto__";

function DefaultNotebookCard(): ReactNode {
  const { activeNotebooks } = useNotebookState();
  const { defaultNotebookId, setDefaultNotebookId } = useDefaultNotebookId();
  const [savedTick, setSavedTick] = useState(0);

  // Resolve the stored preference against the live active list — a stored
  // id pointing at an archived/removed notebook renders as "automatic".
  const selectedId =
    defaultNotebookId !== null &&
    activeNotebooks.some((nb) => nb.gradeLevelId === defaultNotebookId)
      ? defaultNotebookId
      : null;
  const firstActive = activeNotebooks[0];

  const select = (id: string | null): void => {
    if (id === selectedId) return; // re-clicking the selection — no-op
    setDefaultNotebookId(id);
    setSavedTick((t) => t + 1);
  };

  // Shared radiogroup keyboard pattern — sentinel maps null ⇄ AUTO_OPTION.
  const roving = useRovingRadio({
    values: [AUTO_OPTION, ...activeNotebooks.map((nb) => nb.gradeLevelId)],
    selected: selectedId ?? AUTO_OPTION,
    onSelect: (value) => select(value === AUTO_OPTION ? null : value),
  });

  return (
    <SettingsCard
      glyph={SECTION_ICONS.workspace({ size: 14 })}
      tone="teal"
      anchorId="default-notebook"
      scope="personal"
      eyebrow="Preference"
      savedTick={savedTick}
      title={
        <Tooltip
          content="Which notebook the app opens in for you — a personal preference; your teammates each pick their own."
          side="bottom"
        >
          <span>Default notebook</span>
        </Tooltip>
      }
      hint="Where the app opens when you haven't switched notebooks yet on a device. Only affects you."
    >
      <div
        role="radiogroup"
        aria-label="Default notebook"
        className={styles.radioList}
        {...roving.getGroupProps()}
      >
        {/* No-preference option — follows the top of the active list. */}
        <Tooltip
          content="Let the app pick automatically — it opens in the first active notebook. Only affects you."
          side="top"
          tooltipId="settings-default-notebook-option"
        >
          <button
            type="button"
            role="radio"
            aria-checked={selectedId === null}
            onClick={() => select(null)}
            className={[
              styles.radioOption,
              selectedId === null ? styles.radioOptionSelected : "",
            ]
              .filter(Boolean)
              .join(" ")}
            {...roving.getOptionProps(AUTO_OPTION)}
          >
            <RadioDot selected={selectedId === null} />
            <span className={styles.radioLabel}>
              First active notebook
              <span className={styles.radioMeta}>
                Automatic
                {firstActive ? ` — currently “${firstActive.name}”` : ""}
              </span>
            </span>
          </button>
        </Tooltip>

        {activeNotebooks.map((nb) => {
          const isSelected = selectedId === nb.gradeLevelId;
          return (
            <Tooltip
              key={nb.gradeLevelId}
              content={`Open the app in “${nb.name}” by default. Only affects you.`}
              side="top"
              tooltipId="settings-default-notebook-option"
            >
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => select(nb.gradeLevelId)}
                className={[
                  styles.radioOption,
                  isSelected ? styles.radioOptionSelected : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                {...roving.getOptionProps(nb.gradeLevelId)}
              >
                <RadioDot selected={isSelected} />
                <span className={styles.radioLabel}>{nb.name}</span>
              </button>
            </Tooltip>
          );
        })}
      </div>

      {/* Stale-preference notice — the stored default no longer points at
          an active notebook (it was archived after being picked). */}
      {defaultNotebookId !== null && selectedId === null && (
        <p className={styles.fieldHint} role="status">
          Your saved default notebook was archived — the app opens in the first
          active notebook until you pick a new one.
        </p>
      )}
    </SettingsCard>
  );
}
