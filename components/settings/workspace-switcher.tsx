"use client";

// workspace-switcher.tsx — Settings → Workspace & Team → "Your workspaces".
//
// The multi-workspace picker (Wave 12b-2). A teacher can belong to several
// workspaces (their own solo workspace, a school team they were invited into,
// a second school they also teach at). This card lists every workspace the
// caller belongs to, marks the ACTIVE one, and lets them SWITCH the active
// workspace or CREATE a brand-new one. Both actions are consequential and
// TEAM-CONTEXT-CHANGING — switching repoints the WHOLE app (planner, notebooks,
// team, standards) at a different tenant — so this card wears the team scope
// stripe, every action control carries a `required` tooltip (non-dismissible,
// CLAUDE.md §4), and every successful mutation fires a ConsequenceToast naming
// what changed. A switch has a natural inverse (switch back), so its toast
// offers Undo; creating a tenant has no clean inverse, so its toast only
// confirms.
//
// FLAG GATE: this card only mounts when MULTI_WORKSPACE is on (the parent page
// guards it). MULTI_WORKSPACE is a build-inlined constant, so with the flag off
// the whole subtree dead-code-eliminates and the Workspace page is byte-
// identical to today.
//
// DATA SEAM (lib/workspaces/client.ts — Wave 12b-2):
//   • listMyWorkspaces() — one WorkspaceSummary per membership (schoolId, name,
//     role, isActive, isSolo, memberCount). Resolves the caller server-side off
//     auth.uid(); empty when the backend is off (not an error — a real teacher
//     always has ≥1 workspace, so [] means "seam not wired yet").
//   • setActiveWorkspace(schoolId) / createWorkspace(name) — SECURITY DEFINER
//     RPCs are the REAL gate; they re-check every rule server-side. Each client
//     method unwraps the action envelope and THROWS the friendly, client-safe
//     message on failure — we surface it inline, never swallow it.
//
// INVALIDATION CONTRACT (lib/workspaces/client.ts, cited from Codex R3): these
// two mutations move the SERVER-side active-workspace pointer but have NO auto-
// invalidation. After a success this card OWNS re-sourcing:
//   1. router.refresh() — re-runs the route's Server Components. The Team
//      section on this very page (app/settings/workspace/page.tsx → TeamData)
//      is an RSC keyed to the active workspace, so it genuinely re-sources here.
//   2. A local re-fetch of listMyWorkspaces() (the reconcile below) — so THIS
//      card's own list reflects the new active workspace immediately (the
//      "Current" marker moves, roles/counts refresh). This is the "re-invoke the
//      identity fetch" half of the contract for the surface we own.
// SIBLING CARDS: router.refresh() alone does NOT remount a client provider, so
// the sibling <WorkspaceSettings> cards — whose own nested <NotebookProvider>
// sources identity ONCE at mount (via <WorkspaceIdentitySync>) — would keep
// showing the prior workspace's name/notebooks. The parent page fixes this by
// KEYING <WorkspaceSettings> on the active workspace id (fetched server-side):
// our router.refresh() re-runs that Server Component, the changed key remounts
// the card stack, and its provider re-sources the new workspace (Codex §4a).
// We deliberately do NOT hard-reload (it would destroy the Undo toast and is
// heavier than the contract requires) and do NOT reach into notebook-state.tsx.
// The settings-LAYOUT provider stays as-is: nothing ON THIS PAGE consumes it
// (only the /settings overview + planner shell do, and those remount on their
// own next mount when the teacher navigates there).
//
// SSR-safe: the first render is always the "loading" branch (no reads that
// differ between server and client), and every tooltip is `required` (dismissal
// state is never read pre-mount), so there is no hydration mismatch. These are
// server-action writes — they never touch localStorage, so they correctly do
// NOT trip useSettingsDirty / the click-out save prompt (inline states only).

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Button, Skeleton, Tooltip } from "@/components/ui";
import { SettingsCard } from "@/components/appearance/settings-card";
import { SECTION_ICONS } from "@/components/settings/section-icons";
import { useConsequenceToast } from "@/lib/consequence-toast";
import {
  createWorkspace,
  listMyWorkspaces,
  pickActiveWorkspace,
  setActiveWorkspace,
  WORKSPACE_CREATION_SAFETY_CAP,
  type WorkspaceRole,
  type WorkspaceSummary,
} from "@/lib/workspaces";
import styles from "./workspace-switcher.module.css";

// Whether the planner persists to Supabase — the same NEXT_PUBLIC switch the
// workspaces server actions gate on (isPlannerSupabaseConfigured, alongside
// MULTI_WORKSPACE). When off, the seam reads resolve to [] and the writes throw
// the friendly BACKEND_OFF message; we render the states honestly regardless.
// Read only to word the empty state precisely (off vs genuinely no memberships).
const PLANNER_SUPABASE = process.env.NEXT_PUBLIC_PLANNER_USE_SUPABASE === "1";

/** Friendly message from a thrown seam error (client.ts throws real Errors with
 *  the action's client-safe message). Never leak an unexpected shape. */
function errorMessage(e: unknown): string {
  return e instanceof Error && e.message
    ? e.message
    : "That didn't work — please try again.";
}

/** Human label for the caller's role in a workspace. */
const ROLE_LABEL: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

type LoadStatus = "loading" | "ready" | "error";

/** The picker card. Self-contained: loads its own list, owns its per-action
 *  pending/success/error feedback, and re-sources after each mutation per the
 *  invalidation contract in the header. */
export function WorkspaceSwitcher(): ReactNode {
  const router = useRouter();
  const { showConsequence } = useConsequenceToast();

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);

  // The schoolId currently being switched to (its Switch button spins; the
  // others disable so two switches can't race). null = no switch in flight.
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Most-recent inline errors, shown against their origin (a row / the form).
  const [rowError, setRowError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  // Bumped after each successful mutation → the SettingsCard header flashes its
  // "Saved" chip (these writes have no Save button). reloadKey re-runs the load.
  const [savedTick, setSavedTick] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const [newName, setNewName] = useState("");

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      setStatus("loading");
      setLoadError(null);
      try {
        const rows = await listMyWorkspaces();
        if (cancelled) return;
        setWorkspaces(rows);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setLoadError(errorMessage(e));
        setStatus("error");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Live mirror of `workspaces`, read by the action handlers. A STABLE ref
  // (identity fixed across renders) so a handler closed over an older render —
  // notably the toast's Undo callback, created several renders before it fires —
  // still reads the LATEST list. Deriving "which workspace is active right now"
  // from a closed-over `workspaces` snapshot would make Undo target the wrong
  // workspace (or no-op on a stale isActive flag).
  const workspacesRef = useRef<WorkspaceSummary[]>(workspaces);
  useEffect(() => {
    workspacesRef.current = workspaces;
  }, [workspaces]);

  // Single mutation lock. Switch and create BOTH move the one server-side
  // active-workspace pointer, so at most one may be in flight — otherwise the
  // completion ORDER (not the teacher's action order) decides the active tenant,
  // and the optimistic state / toasts can claim the wrong workspace is active.
  // A ref (not state) so the guard is synchronous and immune to the stale
  // closures the Undo path carries. The derived `busy` below drives the UI
  // disabling; this ref is the hard gate.
  const mutatingRef = useRef(false);

  // ── Background reconcile ────────────────────────────────────────────────────
  // After a confirmed mutation we flip the list optimistically for instant
  // feedback, then re-fetch to reconcile roles/counts authoritatively WITHOUT
  // flipping the card back to a full skeleton (that flash would also strand the
  // Undo toast). A monotonic token drops a slower reconcile that a newer action
  // has already superseded, so stale data can't clobber fresher state.
  const reconcileToken = useRef(0);
  const reconcile = async (): Promise<void> => {
    const token = ++reconcileToken.current;
    try {
      const next = await listMyWorkspaces();
      if (token !== reconcileToken.current) return; // superseded
      setWorkspaces(next);
    } catch {
      // Keep the optimistic list — the mutation itself already committed; the
      // next full load (Retry / remount) corrects any drift.
    }
  };

  // Re-source both the RSC route data (Team section) and this card's own list.
  const invalidate = (): void => {
    router.refresh();
    void reconcile();
  };

  // ── Switch ──────────────────────────────────────────────────────────────────
  // Also serves the toast's Undo (switching back to the prior workspace).
  const runSwitch = async (target: WorkspaceSummary): Promise<void> => {
    // Read the LIVE list (via the ref), never a closed-over snapshot — this
    // handler also runs from the toast's Undo, whose closure predates several
    // renders. If the target is already the active workspace, there's nothing to
    // do (the UI never offers Switch on the active row; this guards the Undo /
    // programmatic paths against a redundant self-switch RPC).
    const live = workspacesRef.current;
    if (live.find((w) => w.schoolId === target.schoolId)?.isActive) return;
    // Serialize against any create/switch already running (shared pointer).
    if (mutatingRef.current) return;
    mutatingRef.current = true;
    // The workspace active RIGHT NOW is the faithful "switch back" target for
    // the toast's Undo (and, transitively, undo-of-undo).
    const previous = pickActiveWorkspace(live);
    setRowError(null);
    setSwitchingId(target.schoolId);
    let ok = false;
    try {
      await setActiveWorkspace(target.schoolId);
      ok = true;
    } catch (e) {
      setRowError({ id: target.schoolId, message: errorMessage(e) });
    } finally {
      // Release the write lock + clear the row spinner even on failure.
      mutatingRef.current = false;
      setSwitchingId(null);
    }
    if (ok) {
      // Optimistic: the active pointer moves to `target` (roles/counts are
      // unchanged by a switch, so this holds until reconcile). Update the live
      // ref SYNCHRONOUSLY too — the Undo callback reads the ref the instant it
      // fires, so it must see the new active now, not wait for the passive sync
      // effect (else an immediate Undo would early-return as a redundant switch).
      const optimistic = workspacesRef.current.map((w) => ({
        ...w,
        isActive: w.schoolId === target.schoolId,
      }));
      workspacesRef.current = optimistic;
      setWorkspaces(optimistic);
      setSavedTick((t) => t + 1);
      showConsequence({
        message: `Switched to “${target.name}” — your planner, notebooks, and team now show this workspace.`,
        // Only offer Undo when there is a distinct prior workspace to return to.
        onUndo:
          previous && previous.schoolId !== target.schoolId
            ? () => void runSwitch(previous)
            : undefined,
      });
      invalidate();
    }
  };

  // ── Create ──────────────────────────────────────────────────────────────────
  const ownedCount = workspaces.filter((w) => w.role === "owner").length;
  const atCap = ownedCount >= WORKSPACE_CREATION_SAFETY_CAP;

  const runCreate = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const name = newName.trim();
    if (name === "" || atCap) return;
    // Serialize against any switch/create already running (shared pointer).
    if (mutatingRef.current) return;
    mutatingRef.current = true;
    setCreateError(null);
    setCreating(true);
    try {
      const created = await createWorkspace(name);
      // Optimistic: a fresh workspace is a solo one the caller owns, and the RPC
      // makes it active. We know its full shape, so append it marked active and
      // demote the others until reconcile returns the authoritative list. Keep
      // the live ref in sync SYNCHRONOUSLY (same reason as runSwitch above).
      const optimistic = [
        ...workspacesRef.current.map((w) => ({ ...w, isActive: false })),
        {
          schoolId: created.schoolId,
          name,
          role: "owner" as WorkspaceRole,
          isActive: true,
          isSolo: true,
          memberCount: 1,
        },
      ];
      workspacesRef.current = optimistic;
      setWorkspaces(optimistic);
      setNewName("");
      setSavedTick((t) => t + 1);
      showConsequence({
        message: `Created “${name}” — it’s your active workspace now. Invite teammates from the Team section below.`,
      });
      invalidate();
    } catch (e) {
      setCreateError(errorMessage(e));
    } finally {
      mutatingRef.current = false;
      setCreating(false);
    }
  };

  // True while any switch or create is in flight — drives control disabling so
  // the shared-pointer mutations stay mutually exclusive in the UI (the
  // mutatingRef above is the hard gate; this is the visible one).
  const busy = switchingId !== null || creating;

  const cardTitle = (
    <Tooltip
      content="The workspaces you belong to. Switching changes your whole app — planner, notebooks, lessons, and team — to that workspace. You can switch back anytime, or create a new workspace of your own."
      side="bottom"
      required
    >
      <span>Your workspaces</span>
    </Tooltip>
  );

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <SettingsCard
          glyph={SECTION_ICONS.workspace({ size: 14 })}
          tone="teal"
          anchorId="workspace-switcher"
          scope="team"
          eyebrow="Workspaces"
          savedTick={savedTick}
          title={cardTitle}
          hint="Your active workspace decides which curriculum, notebooks, and team you see. Switch between them or spin up a new one."
        >
          {status === "loading" && (
            <div className={styles.loading}>
              <Skeleton lines={3} label="Loading your workspaces…" />
            </div>
          )}

          {status === "error" && (
            <div className={styles.error} role="alert">
              <p className={styles.errorText}>
                {loadError ?? "Couldn’t load your workspaces."}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setReloadKey((k) => k + 1)}
                tooltip="Try loading your workspaces again."
              >
                Try again
              </Button>
            </div>
          )}

          {status === "ready" && (
            <>
              {workspaces.length === 0 ? (
                <div className={styles.empty}>
                  <p className={styles.emptyHeading}>No workspaces yet</p>
                  <p className={styles.emptyBody}>
                    {PLANNER_SUPABASE
                      ? "You’re not part of any workspace yet. Create one below to start your own curriculum, or ask a colleague to invite you into theirs."
                      : "Workspaces appear here once your account is connected. Create one below to get started."}
                  </p>
                </div>
              ) : (
                <ul className={styles.list}>
                  {workspaces.map((w) => (
                    <WorkspaceRow
                      key={w.schoolId}
                      workspace={w}
                      switching={switchingId === w.schoolId}
                      // Any switch/create in flight disables the OTHER rows'
                      // Switch controls (the acting row keeps its spinner).
                      disabled={busy && switchingId !== w.schoolId}
                      error={
                        rowError?.id === w.schoolId ? rowError.message : null
                      }
                      onSwitch={() => void runSwitch(w)}
                    />
                  ))}
                </ul>
              )}

              <CreateWorkspaceForm
                name={newName}
                onNameChange={setNewName}
                onSubmit={runCreate}
                creating={creating}
                busy={busy}
                atCap={atCap}
                error={createError}
              />
            </>
          )}
        </SettingsCard>
      </div>
    </div>
  );
}

// ── One workspace row ─────────────────────────────────────────────────────────
// name + role pill (top line) · membership summary (status line, + inline error)
// | control (the active marker, or a Switch button).

interface WorkspaceRowProps {
  workspace: WorkspaceSummary;
  switching: boolean;
  disabled: boolean;
  error: string | null;
  onSwitch: () => void;
}

function WorkspaceRow({
  workspace,
  switching,
  disabled,
  error,
  onSwitch,
}: WorkspaceRowProps): ReactNode {
  const { name, role, isActive, isSolo, memberCount } = workspace;

  // "Solo workspace · just you" / "Team workspace · N teachers". memberCount is
  // an aggregate (no per-teammate identity); a team is anything past one member.
  const membership = isSolo
    ? "Solo workspace · just you"
    : `Team workspace · ${memberCount} teachers`;

  return (
    <li
      className={[styles.row, isActive ? styles.rowActive : ""]
        .filter(Boolean)
        .join(" ")}
      aria-current={isActive ? "true" : undefined}
    >
      <div className={styles.main}>
        <span className={styles.nameRow}>
          <span className={styles.name}>{name}</span>
          <span className={styles.rolePill}>{ROLE_LABEL[role]}</span>
        </span>
        <span className={styles.status}>{membership}</span>
        {error && (
          <span className={styles.rowError} role="alert">
            {error}
          </span>
        )}
      </div>

      <div className={styles.control}>
        {isActive ? (
          // Non-interactive marker; touch users get the explanation via title.
          <span
            className={styles.currentPill}
            title="This is your active workspace — the one the whole app is showing right now."
          >
            <CheckGlyph />
            Current
          </span>
        ) : (
          // required: switching changes the whole app's team context.
          <Tooltip
            content={`Switch your active workspace to “${name}” — your planner, notebooks, lessons, and team all change to this workspace. You can switch back anytime.`}
            side="top"
            required
          >
            <Button
              variant="secondary"
              size="sm"
              loading={switching}
              disabled={disabled}
              onClick={onSwitch}
              aria-label={`Switch to ${name}`}
            >
              Switch
            </Button>
          </Tooltip>
        )}
      </div>
    </li>
  );
}

// ── "+ New workspace" creation form ───────────────────────────────────────────
// Inline (no modal), mirroring the sibling NotebooksCard's new-notebook form.

interface CreateWorkspaceFormProps {
  name: string;
  onNameChange: (v: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  /** This form's own create is running (drives the button spinner). */
  creating: boolean;
  /** ANY switch/create is running (blocks submit — shared active-workspace
   *  pointer, so create must not race a switch). */
  busy: boolean;
  atCap: boolean;
  error: string | null;
}

function CreateWorkspaceForm({
  name,
  onNameChange,
  onSubmit,
  creating,
  busy,
  atCap,
  error,
}: CreateWorkspaceFormProps): ReactNode {
  // Typing stays allowed while a switch resolves; only SUBMIT is blocked, so a
  // create can't race a switch on the shared pointer.
  const canSubmit = name.trim() !== "" && !atCap && !busy;

  const inputTip = atCap
    ? `You’ve reached the maximum of ${WORKSPACE_CREATION_SAFETY_CAP} workspaces you can create.`
    : "Name your new workspace — usually your school or class, like “Al-Noor School”.";
  const buttonTip = atCap
    ? `You’ve reached the maximum of ${WORKSPACE_CREATION_SAFETY_CAP} workspaces you can create — archive or leave one before creating another.`
    : name.trim() === ""
      ? "Type a name first — then a new, empty workspace is created and you’re switched into it."
      : "Create a brand-new workspace and switch into it — a fresh curriculum only you can see until you invite teammates.";

  return (
    <form className={styles.newForm} onSubmit={onSubmit} noValidate>
      <label htmlFor="new-workspace-name" className={styles.fieldLabel}>
        New workspace
      </label>
      <div className={styles.newRow}>
        {/* required: creating a workspace changes your active team context. */}
        <Tooltip content={inputTip} side="bottom" required>
          <input
            id="new-workspace-name"
            name="newWorkspaceName"
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            disabled={atCap}
            placeholder="e.g. Al-Noor School"
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
            loading={creating}
            disabled={!canSubmit}
          >
            + New workspace
          </Button>
        </Tooltip>
      </div>
      {error ? (
        <p className={styles.formError} role="alert">
          {error}
        </p>
      ) : (
        <p className={styles.fieldHint}>
          Creates a fresh, empty workspace and switches you into it. Only you
          can see it until you invite teammates.
        </p>
      )}
    </form>
  );
}

// ── Glyphs ────────────────────────────────────────────────────────────────────

/** Small check for the active-workspace marker. currentColor + aria-hidden. */
function CheckGlyph(): ReactNode {
  return (
    <svg
      className={styles.checkGlyph}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M13 4.5 6.5 11 3 7.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
