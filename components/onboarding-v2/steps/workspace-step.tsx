"use client";

// workspace-step.tsx — v2 onboarding step 1 (workspace-first).
//
// Provisioning already mints a full solo workspace at first sign-in, so this
// step does NOT create anything — it SHOWS + renames the existing workspace
// and captures a solo-vs-team intent:
//   • Rename — the LIVE rename path today is localStorage-only
//     (lib/use-workspace-settings.ts → `mycurricula:team:workspace-name`); the
//     server "rename workspace" RPC is a documented Phase 1B seam
//     (renameNotebookAction renames a NOTEBOOK, not the workspace). We use the
//     localStorage override, matching the shipped Settings → Workspace card,
//     and gate it to workspace admins exactly as that card does.
//   • Solo vs team — "Just me" needs no action (the provisioned state IS solo);
//     "Invite my team" points at the LIVE invite surface (Settings → Workspace
//     & Team), which already renders seat/invite UI and degrades gracefully for
//     a workspace with no team row (e.g. Beta School). We never insert a team.
//
// Renaming the workspace + inviting are TEAM-wide, so their tooltips are
// `required` (CLAUDE.md §4 always-on list).

import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useNotebookState } from "@/lib/notebook-state";
import { useWorkspaceName } from "@/lib/use-workspace-settings";
import { useOnboardingV2 } from "@/lib/onboarding-v2-state";
import { Button, Tooltip } from "@/components/ui";
import { RadioDot } from "@/components/appearance/settings-card";
import styles from "./steps-v2.module.css";

export function WorkspaceStep(): ReactNode {
  const router = useRouter();
  const { data, update } = useOnboardingV2();
  const { workspaceName, isWorkspaceAdmin } = useNotebookState();
  const { setWorkspaceName } = useWorkspaceName();

  // Local rename draft — independent while typing; re-syncs when the resolved
  // name changes (post-mount overlay arrival, cross-tab edit).
  const [draft, setDraft] = useState<string>(workspaceName);
  useEffect(() => {
    setDraft(workspaceName);
  }, [workspaceName]);

  const commitName = (): void => {
    const trimmed = draft.trim();
    if (trimmed === workspaceName || trimmed === "") {
      setDraft(workspaceName); // untouched or emptied — snap back
      return;
    }
    setWorkspaceName(trimmed);
  };

  const onNameKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur(); // blur is the single commit path
    }
  };

  const renameTip = isWorkspaceAdmin
    ? "Renames your workspace for every teacher on the team — the new name shows in the sidebar for everyone. Saves when you press Enter or click out of the field."
    : "Only a workspace admin can rename the workspace — ask your admin to change it.";

  const mode = data.workspaceMode;
  const selectMode = (m: "solo" | "team"): void => update({ workspaceMode: m });

  return (
    <div>
      <h1 className={styles.heading}>Your workspace</h1>
      <p className={styles.helper}>
        This is the home your notebooks and teammates live in. It&rsquo;s already
        set up — give it a name, and tell us whether you&rsquo;re planning solo or
        with a team.
      </p>

      {/* ── Workspace name ─────────────────────────────────────────────── */}
      <div className={styles.section}>
        <label htmlFor="wizard-workspace-name" className={styles.fieldLabel}>
          Workspace name
        </label>
        <Tooltip content={renameTip} side="bottom" required>
          <input
            id="wizard-workspace-name"
            type="text"
            className={styles.textInput}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={onNameKeyDown}
            disabled={!isWorkspaceAdmin}
            placeholder="e.g. Al-Noor School"
            maxLength={60}
            autoComplete="off"
            spellCheck={false}
            title={renameTip}
          />
        </Tooltip>
        <p className={styles.fieldHint}>
          {isWorkspaceAdmin
            ? "Every teacher in the workspace sees this name. You can change it later in Settings."
            : "Your workspace admin sets the name. You can still finish setting up your own view below."}
        </p>
      </div>

      <div className={styles.divider} />

      {/* ── Solo vs team ───────────────────────────────────────────────── */}
      <div className={styles.section}>
        <span className={styles.sectionLabel}>How you&rsquo;ll plan</span>
        <div
          role="radiogroup"
          aria-label="Planning setup"
          className={styles.choiceGrid}
        >
          <Tooltip
            content="Plan on your own — your personal plans are your curriculum, with no team-share gate. You can invite teammates any time later."
            side="top"
            tooltipId="onboarding-v2-workspace-solo"
          >
            <button
              type="button"
              role="radio"
              aria-checked={mode === "solo"}
              onClick={() => selectMode("solo")}
              className={`${styles.choiceCard} ${mode === "solo" ? styles.choiceCardActive : ""}`}
            >
              <RadioDot selected={mode === "solo"} />
              <span className={styles.choiceText}>
                <span className={styles.choiceTitle}>Just me</span>
                <span className={styles.choiceDesc}>
                  Plan solo. Nothing to set up — your workspace is ready.
                </span>
              </span>
            </button>
          </Tooltip>

          <Tooltip
            content="Set up to plan with colleagues — you'll invite them from Settings, where editing the shared Team Curriculum affects everyone."
            side="top"
            required
          >
            <button
              type="button"
              role="radio"
              aria-checked={mode === "team"}
              onClick={() => selectMode("team")}
              className={`${styles.choiceCard} ${mode === "team" ? styles.choiceCardActive : ""}`}
            >
              <RadioDot selected={mode === "team"} />
              <span className={styles.choiceText}>
                <span className={styles.choiceTitle}>Invite my team</span>
                <span className={styles.choiceDesc}>
                  Plan together. Send invites and manage seats from Settings.
                </span>
              </span>
            </button>
          </Tooltip>
        </div>

        {mode === "team" && (
          <div className={styles.revealPanel}>
            <p>
              Team invites and seats live in Settings &rarr; Workspace &amp; Team.
              You can open it now to send invites, or keep going and do it after
              setup — your progress here is saved.
            </p>
            {/* Team-wide action → required tooltip (never dismissible). */}
            <Tooltip
              content="Open Settings → Workspace & Team to send invites and manage seats. Your setup progress is saved, so you can come back to finish."
              side="top"
              required
            >
              <Button
                variant="secondary"
                size="md"
                onClick={() => router.push("/settings/workspace#team-members")}
                aria-label="Open team settings to send invites"
              >
                Open team settings
              </Button>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}
