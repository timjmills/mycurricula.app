"use client";

// components/team/TeamPage.tsx — the Settings → Team client shell.
//
// Orchestrates four sub-sections:
//   1. SoloState      — shown when the workspace has only 1 member.
//   2. MemberList     — all members with per-notebook roles + seat usage.
//   3. PendingInvites — pending invites + revoke. Workspace-admin or lead only.
//   4. InvitePanel    — create a link or email invite. Workspace-admin or lead only.
//   5. NotebookAdmin  — create/rename/archive notebooks + appoint/revoke leads.
//                       Workspace-admin only.
//
// Capability gating (cosmetic — RPCs re-check server-side):
//   isWorkspaceAdmin  → full admin controls.
//   isNotebookLead(id) → lead controls scoped to that notebook.
//   Otherwise         → member view (read-only).
//
// Solo-UX principle (ultraplan §9, model doc §7 "A layer should be invisible
// until it's doing work"): if members.length === 1, show a gentle invite CTA
// instead of the full team-management ceremony. Full management appears as soon
// as a second member joins.
//
// Tooltip rules (CLAUDE.md §4):
//   • Destructive / consequential / team-wide controls → required: true
//   • Non-obvious but non-consequential controls → tooltipId (dismissible)
//   • Self-evident text buttons ("Close", "Cancel") → no tooltip
//
// Responsive: single-column on phone; two-column on desktop for member list.

import {
  useState,
  useTransition,
  type ReactNode,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceMember, WorkspaceNotebook, SeatUsage } from "@/lib/admin/queries";
import type { PendingInvite, CallerInfo, ActionResult } from "@/app/settings/team/actions";
import {
  revokeInviteAction,
  createInviteAction,
  createNotebookAction,
  renameNotebookAction,
  archiveNotebookAction,
  setMemberRoleAction,
  removeMemberAction,
  grantWorkspaceAdminAction,
  revokeWorkspaceAdminAction,
} from "@/app/settings/team/actions";
import { Button, PageHeader, Tooltip, EmptyState } from "@/components/ui";
import { SettingsCard } from "@/components/appearance/settings-card";
import styles from "./TeamPage.module.css";

// ── Props ──────────────────────────────────────────────────────────────────────

export interface TeamPageProps {
  members: WorkspaceMember[];
  seats: SeatUsage;
  notebooks: WorkspaceNotebook[];
  pendingInvites: PendingInvite[];
  callerInfo: CallerInfo | null;
  /** Map from gradeLevelId → caller's role for that notebook. */
  callerNotebookRoles: Record<string, "teacher" | "lead" | "grade_admin">;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function roleLabel(role: "teacher" | "lead" | "grade_admin"): string {
  if (role === "lead") return "Notebook lead";
  if (role === "grade_admin") return "Grade admin";
  return "Teacher";
}

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Inline error banner ────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }): ReactNode {
  return (
    <p className={styles.errorBanner} role="alert" aria-live="polite">
      {message}
    </p>
  );
}

// ── Solo-state (single member) ─────────────────────────────────────────────────
// Only show a gentle "invite your teammates" CTA — no full team-management
// ceremony until there is a real team to manage.

function SoloState({
  onInviteClick,
}: {
  onInviteClick: () => void;
}): ReactNode {
  return (
    <SettingsCard
      eyebrow="Team"
      title="Your workspace"
      hint="You're the only person in this workspace right now. Invite a teammate to share this notebook."
    >
      <div className={styles.soloBody}>
        <EmptyState
          heading="No teammates yet"
          body="Invite a colleague to co-plan this curriculum. They'll see the Team plan and can fork their own Personal copies."
          size="sm"
          action={
            <Tooltip
              content="Create an invite link or email invite to bring a colleague into your notebook. They'll land on the accept page and start sharing your curriculum immediately."
              required
            >
              <Button
                variant="primary"
                size="md"
                onClick={onInviteClick}
                title="Invite teammates to share this notebook"
              >
                + Invite a teammate
              </Button>
            </Tooltip>
          }
        />
      </div>
    </SettingsCard>
  );
}

// ── Member list ────────────────────────────────────────────────────────────────

interface MemberListProps {
  members: WorkspaceMember[];
  seats: SeatUsage;
  callerTeacherId: string | null;
  isWorkspaceAdmin: boolean;
  callerNotebookRoles: Record<string, "teacher" | "lead" | "grade_admin">;
  onDataChange: () => void;
}

function MemberList({
  members,
  seats,
  callerTeacherId,
  isWorkspaceAdmin,
  callerNotebookRoles,
  onDataChange,
}: MemberListProps): ReactNode {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Helper: call an action and handle the result.
  function runAction(action: () => Promise<ActionResult>): void {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
      } else {
        onDataChange();
      }
    });
  }

  const seatLabel = `${seats.used} / ${seats.cap} seats used`;

  return (
    <SettingsCard
      eyebrow="Members"
      scope="team"
      title={
        <Tooltip
          content="Everyone currently in this workspace, their role on each notebook, and how many seats your workspace is using. Seat changes are instant — removing a member frees a seat immediately."
          required
        >
          <span>Team members</span>
        </Tooltip>
      }
      hint={seatLabel}
    >
      {error && <ErrorBanner message={error} />}
      <ul className={styles.memberList} aria-label="Team members">
        {members.map((member) => {
          const isCallerSelf = member.teacherId === callerTeacherId;
          // Can the caller manage this member's roles?
          const canManageMember =
            isWorkspaceAdmin ||
            member.notebookRoles.some((nr) => {
              const callerRole = callerNotebookRoles[nr.gradeLevelId];
              return callerRole === "lead" || callerRole === "grade_admin";
            });

          return (
            <li key={member.teacherId} className={styles.memberRow}>
              {/* Avatar monogram */}
              <span className={styles.memberAvatar} aria-hidden="true">
                {(member.displayName || member.email).charAt(0).toUpperCase()}
              </span>

              {/* Name + email */}
              <div className={styles.memberInfo}>
                <span className={styles.memberName}>
                  {member.displayName || member.email}
                  {member.isWorkspaceAdmin && (
                    <span className={styles.adminBadge} title="Workspace admin">
                      Admin
                    </span>
                  )}
                  {isCallerSelf && (
                    <span className={styles.youBadge} title="This is you">
                      You
                    </span>
                  )}
                </span>
                <span className={styles.memberEmail}>{member.email}</span>
                {/* Per-notebook roles */}
                {member.notebookRoles.length > 0 ? (
                  <div className={styles.notebookRoles}>
                    {member.notebookRoles.map((nr) => (
                      <span key={nr.gradeLevelId} className={styles.notebookRoleChip}>
                        {nr.notebookName}: <strong>{roleLabel(nr.role)}</strong>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className={styles.notebookRoleChip}>No notebooks assigned</span>
                )}
              </div>

              {/* Admin actions — only shown to admins/leads, not for self */}
              {canManageMember && !isCallerSelf && (
                <div className={styles.memberActions}>
                  {/* Per-notebook role changer — workspace-admin or lead of that notebook */}
                  {member.notebookRoles.map((nr) => {
                    const callerRole = callerNotebookRoles[nr.gradeLevelId];
                    const canManageThisNotebook =
                      isWorkspaceAdmin ||
                      callerRole === "lead" ||
                      callerRole === "grade_admin";
                    if (!canManageThisNotebook) return null;

                    const canSetToLeadOrAdmin = isWorkspaceAdmin;
                    return (
                      <div key={nr.gradeLevelId} className={styles.memberRoleRow}>
                        <span className={styles.notebookLabel}>{nr.notebookName}</span>
                        <Tooltip
                          content={`Change ${member.displayName}'s role on ${nr.notebookName}. Leads can edit the Team plan; Teachers can only fork Personal copies. This affects what ${member.displayName} can do right now for the whole team.`}
                          required
                        >
                          <select
                            className={styles.roleSelect}
                            value={nr.role}
                            disabled={pending}
                            aria-label={`${member.displayName} role in ${nr.notebookName}`}
                            onChange={(e) => {
                              const newRole = e.target.value as
                                | "teacher"
                                | "lead"
                                | "grade_admin";
                              runAction(() =>
                                setMemberRoleAction(
                                  member.teacherId,
                                  nr.gradeLevelId,
                                  newRole,
                                ),
                              );
                            }}
                          >
                            <option value="teacher">Teacher</option>
                            <option value="lead">Notebook lead</option>
                            {canSetToLeadOrAdmin && (
                              <option value="grade_admin">Grade admin</option>
                            )}
                          </select>
                        </Tooltip>
                        <Tooltip
                          content={`Remove ${member.displayName} from ${nr.notebookName}. Their Personal copies are kept but become unreadable to them until re-added. This does NOT remove them from the workspace or free their seat.`}
                          required
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            aria-label={`Remove ${member.displayName} from ${nr.notebookName}`}
                            onClick={() =>
                              runAction(() =>
                                removeMemberAction(
                                  member.teacherId,
                                  nr.gradeLevelId,
                                ),
                              )
                            }
                          >
                            Remove
                          </Button>
                        </Tooltip>
                      </div>
                    );
                  })}

                  {/* Workspace-admin grant/revoke — workspace-admin only */}
                  {isWorkspaceAdmin && (
                    <div className={styles.memberRoleRow}>
                      {member.isWorkspaceAdmin ? (
                        <Tooltip
                          content={`Revoke ${member.displayName}'s workspace-admin privileges — they can still access their notebooks but can no longer create/archive notebooks or manage other admins. There must always be at least one workspace admin.`}
                          required
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            aria-label={`Revoke workspace admin from ${member.displayName}`}
                            onClick={() =>
                              runAction(() =>
                                revokeWorkspaceAdminAction(member.teacherId),
                              )
                            }
                          >
                            Revoke admin
                          </Button>
                        </Tooltip>
                      ) : (
                        <Tooltip
                          content={`Make ${member.displayName} a workspace admin — they'll be able to create and archive notebooks, manage all members across notebooks, and appoint other admins. This is a significant privilege change that affects the whole workspace.`}
                          required
                        >
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            aria-label={`Grant workspace admin to ${member.displayName}`}
                            onClick={() =>
                              runAction(() =>
                                grantWorkspaceAdminAction(member.teacherId),
                              )
                            }
                          >
                            Make admin
                          </Button>
                        </Tooltip>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {/* Seat usage bar */}
      <div className={styles.seatBar} aria-label={seatLabel}>
        <div className={styles.seatBarTrack}>
          <div
            className={styles.seatBarFill}
            style={{
              width: `${Math.min(100, (seats.used / seats.cap) * 100)}%`,
            }}
          />
        </div>
        <span className={styles.seatLabel}>{seatLabel}</span>
      </div>
    </SettingsCard>
  );
}

// ── Pending invites ────────────────────────────────────────────────────────────

interface PendingInvitesProps {
  invites: PendingInvite[];
  isWorkspaceAdmin: boolean;
  callerNotebookRoles: Record<string, "teacher" | "lead" | "grade_admin">;
  onDataChange: () => void;
}

function PendingInvites({
  invites,
  isWorkspaceAdmin,
  callerNotebookRoles,
  onDataChange,
}: PendingInvitesProps): ReactNode {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function doRevoke(inviteId: string): void {
    setError(null);
    startTransition(async () => {
      const result = await revokeInviteAction(inviteId);
      if (!result.ok) {
        setError(result.error ?? "Could not revoke invite.");
      } else {
        onDataChange();
      }
    });
  }

  if (invites.length === 0) {
    return null; // No pending invites — hide the card entirely.
  }

  return (
    <SettingsCard
      eyebrow="Invites"
      scope="team"
      title={
        <Tooltip
          content="Pending invites hold a seat until they are accepted or expire. Revoking an invite immediately frees that seat."
          tooltipId="team-pending-invites-card"
        >
          <span>Pending invites</span>
        </Tooltip>
      }
      hint={`${invites.length} pending invite${invites.length === 1 ? "" : "s"}`}
    >
      {error && <ErrorBanner message={error} />}
      <ul className={styles.inviteList} aria-label="Pending invites">
        {invites.map((invite) => {
          // Can the caller revoke this invite? Must be workspace-admin or a lead
          // of the notebook this invite targets.
          const callerRole = callerNotebookRoles[invite.gradeLevelId];
          const canRevoke =
            isWorkspaceAdmin ||
            callerRole === "lead" ||
            callerRole === "grade_admin";

          return (
            <li key={invite.id} className={styles.inviteRow}>
              <div className={styles.inviteInfo}>
                <span className={styles.inviteEmail}>
                  {invite.inviteeEmail ?? (
                    <em className={styles.muteText}>Open link (no email bound)</em>
                  )}
                </span>
                <span className={styles.inviteMeta}>
                  {roleLabel(invite.role)} · {invite.notebookName} · expires{" "}
                  {formatExpiry(invite.expiresAt)}
                </span>
              </div>
              {canRevoke && (
                <Tooltip
                  content={`Revoke this invite — it will become unusable and the seat it held is freed immediately. The person who received the link will see an "invite revoked" message if they try to use it.`}
                  required
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    aria-label={`Revoke invite for ${invite.inviteeEmail ?? "open link"}`}
                    onClick={() => doRevoke(invite.id)}
                  >
                    Revoke
                  </Button>
                </Tooltip>
              )}
            </li>
          );
        })}
      </ul>
    </SettingsCard>
  );
}

// ── Invite panel ───────────────────────────────────────────────────────────────

interface InvitePanelProps {
  notebooks: WorkspaceNotebook[];
  callerInfo: CallerInfo;
  callerNotebookRoles: Record<string, "teacher" | "lead" | "grade_admin">;
  isWorkspaceAdmin: boolean;
  onDataChange: () => void;
}

function InvitePanel({
  notebooks,
  callerInfo,
  callerNotebookRoles,
  isWorkspaceAdmin,
  onDataChange,
}: InvitePanelProps): ReactNode {
  // Notebooks the caller can invite into (admin = all; lead = only their own).
  const invitableNotebooks = notebooks.filter((nb) => {
    if (!nb.isActive) return false;
    if (isWorkspaceAdmin) return true;
    const role = callerNotebookRoles[nb.gradeLevelId];
    return role === "lead" || role === "grade_admin";
  });

  const [type, setType] = useState<"link" | "email">("link");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"teacher" | "lead">("teacher");
  const [gradeLevelId, setGradeLevelId] = useState(
    invitableNotebooks[0]?.gradeLevelId ?? "",
  );
  const [submitting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Stores the invite link to show ONCE after creation.
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (invitableNotebooks.length === 0) return null;

  const canInviteAsLead = (): boolean => {
    if (isWorkspaceAdmin) return true;
    return callerNotebookRoles[gradeLevelId] === "lead" ||
      callerNotebookRoles[gradeLevelId] === "grade_admin";
  };

  function onSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!callerInfo.teamId) {
      setError("No team found. Please refresh.");
      return;
    }
    if (!gradeLevelId) {
      setError("Please select a notebook.");
      return;
    }
    if (type === "email" && !email.trim()) {
      setError("Email address is required for an email invite.");
      return;
    }
    setError(null);
    setCreatedLink(null);

    // Generate a raw token client-side: 32 random bytes → hex string.
    // The server action hashes it before storing.
    const rawBytes = new Uint8Array(32);
    crypto.getRandomValues(rawBytes);
    const rawToken = Array.from(rawBytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    startTransition(async () => {
      const result = await createInviteAction({
        teamId: callerInfo.teamId!,
        gradeLevelId,
        role,
        inviteeEmail: type === "email" ? email.trim() : null,
        rawToken,
        expiresAt,
      });

      if (!result.ok) {
        setError(result.error ?? "Could not create invite.");
        return;
      }

      // Build the invite URL from the raw token.
      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      const link = `${origin}/invite/${result.rawToken}`;
      setCreatedLink(link);
      setCopied(false);
      setEmail("");
      onDataChange();
    });
  }

  async function copyLink(): Promise<void> {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API blocked — the link is shown in full for manual copy.
    }
  }

  return (
    <SettingsCard
      eyebrow="Invites"
      scope="team"
      title={
        <Tooltip
          content="Create an invite link or email invite to bring a colleague into a notebook. The link is shown exactly once — copy it before closing."
          required
        >
          <span>Invite to notebook</span>
        </Tooltip>
      }
      hint="Generates a one-time link. The raw token is shown exactly once — copy it immediately."
    >
      {/* ── Created-link display (shown once after success) ──────────────── */}
      {createdLink && (
        <div className={styles.linkBox} role="alert" aria-live="polite">
          <p className={styles.linkBoxHeadline}>
            Invite link created — copy it now. You won&rsquo;t see this again.
          </p>
          <div className={styles.linkRow}>
            <code className={styles.linkText}>{createdLink}</code>
            <Tooltip
              content="Copy the invite link to your clipboard so you can share it with your colleague."
              tooltipId="team-invite-copy-btn"
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={copyLink}
                aria-label="Copy invite link to clipboard"
              >
                {copied ? "Copied!" : "Copy"}
              </Button>
            </Tooltip>
          </div>
          <p className={styles.linkNote}>
            This link expires in 7 days. Send it directly — do not post in public channels.
          </p>
        </div>
      )}

      {error && <ErrorBanner message={error} />}

      <form className={styles.inviteForm} onSubmit={onSubmit} noValidate>
        {/* Invite type: link or email */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.fieldsetLegend}>Invite type</legend>
          <div className={styles.radioRow}>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="invite-type"
                value="link"
                checked={type === "link"}
                onChange={() => setType("link")}
                className={styles.radioInput}
              />
              <Tooltip
                content="Generate a shareable link that anyone can use to join — useful when you don't know the recipient's email or want to send it via a messaging app."
                tooltipId="team-invite-type-link"
              >
                <span>Link invite</span>
              </Tooltip>
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="invite-type"
                value="email"
                checked={type === "email"}
                onChange={() => setType("email")}
                className={styles.radioInput}
              />
              <Tooltip
                content="Bind the invite to a specific email address — only that email address can accept it. Safer when you want to control exactly who joins."
                tooltipId="team-invite-type-email"
              >
                <span>Email-bound invite</span>
              </Tooltip>
            </label>
          </div>
        </fieldset>

        {/* Email address (shown only for email-bound invites) */}
        {type === "email" && (
          <div className={styles.fieldRow}>
            <label htmlFor="invite-email" className={styles.fieldLabel}>
              Email address
            </label>
            <Tooltip
              content="The colleague's email address. They must sign in with exactly this email to accept the invite."
              tooltipId="team-invite-email-field"
            >
              <input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setEmail(e.target.value)
                }
                placeholder="colleague@school.edu"
                className={styles.textInput}
                autoComplete="email"
                title="The colleague's email address — they must sign in with this exact email to accept."
              />
            </Tooltip>
          </div>
        )}

        {/* Notebook selector */}
        {invitableNotebooks.length > 1 && (
          <div className={styles.fieldRow}>
            <label htmlFor="invite-notebook" className={styles.fieldLabel}>
              Notebook
            </label>
            <Tooltip
              content="Which notebook to invite this colleague into. They'll see its Team plan and can fork Personal copies."
              tooltipId="team-invite-notebook-field"
            >
              <select
                id="invite-notebook"
                value={gradeLevelId}
                onChange={(e) => setGradeLevelId(e.target.value)}
                className={styles.selectInput}
                title="Which notebook to invite this colleague into."
              >
                {invitableNotebooks.map((nb) => (
                  <option key={nb.gradeLevelId} value={nb.gradeLevelId}>
                    {nb.name}
                  </option>
                ))}
              </select>
            </Tooltip>
          </div>
        )}

        {/* Role */}
        <div className={styles.fieldRow}>
          <label htmlFor="invite-role" className={styles.fieldLabel}>
            Role
          </label>
          <Tooltip
            content="Teacher — can view the Team plan and fork Personal copies, but cannot edit Team content. Notebook lead — can also edit the Team plan for this notebook."
            required
          >
            <select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as "teacher" | "lead")}
              className={styles.selectInput}
              title="Teacher: view-only on Team plan; Lead: can edit the Team plan."
            >
              <option value="teacher">Teacher (view + Personal fork)</option>
              {canInviteAsLead() && (
                <option value="lead">Notebook lead (edit Team plan)</option>
              )}
            </select>
          </Tooltip>
        </div>

        <Tooltip
          content="Creates the invite link — show it to your colleague. They'll click it, sign in, and land on the accept page. The link expires in 7 days."
          required
        >
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={submitting}
            disabled={submitting}
            title="Generate the invite link for your colleague"
          >
            {submitting ? "Creating…" : "Create invite"}
          </Button>
        </Tooltip>
      </form>
    </SettingsCard>
  );
}

// ── Notebook admin (workspace-admin only) ──────────────────────────────────────

interface NotebookAdminProps {
  notebooks: WorkspaceNotebook[];
  onDataChange: () => void;
}

function NotebookAdmin({ notebooks, onDataChange }: NotebookAdminProps): ReactNode {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null); // gradeLevelId being renamed
  const [renameDraft, setRenameDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");

  function runAction(action: () => Promise<ActionResult>): void {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
      } else {
        setRenaming(null);
        setRenameDraft("");
        setCreating(false);
        setCreateName("");
        onDataChange();
      }
    });
  }

  const activeNotebooks = notebooks.filter((nb) => nb.isActive);
  const archivedNotebooks = notebooks.filter((nb) => !nb.isActive);

  return (
    <SettingsCard
      eyebrow="Notebooks"
      scope="team"
      title={
        <Tooltip
          content="Create and manage notebooks for this workspace. Each notebook holds one curriculum — its own subjects, Team plan, and member group. Archiving a notebook hides it from active views but retains all content."
          required
        >
          <span>Notebook management</span>
        </Tooltip>
      }
      hint="Each notebook is one curriculum — Grade 5, Art, Music, etc. Workspace admins can create, rename, and archive them."
    >
      {error && <ErrorBanner message={error} />}

      {/* Active notebooks list */}
      <ul className={styles.notebookList} aria-label="Active notebooks">
        {activeNotebooks.map((nb) => (
          <li key={nb.gradeLevelId} className={styles.notebookRow}>
            {renaming === nb.gradeLevelId ? (
              /* Inline rename form */
              <form
                className={styles.renameForm}
                onSubmit={(e) => {
                  e.preventDefault();
                  runAction(() =>
                    renameNotebookAction(nb.gradeLevelId, renameDraft),
                  );
                }}
              >
                <input
                  className={styles.textInput}
                  value={renameDraft}
                  autoFocus
                  onChange={(e) => setRenameDraft(e.target.value)}
                  aria-label="New notebook name"
                  title="Type the new name for this notebook."
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={pending || !renameDraft.trim()}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRenaming(null);
                    setRenameDraft("");
                  }}
                >
                  Cancel
                </Button>
              </form>
            ) : (
              <>
                <span className={styles.notebookName}>{nb.name}</span>
                <div className={styles.notebookActions}>
                  <Tooltip
                    content={`Rename the "${nb.name}" notebook. The new name is visible to everyone in the workspace immediately.`}
                    required
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      aria-label={`Rename notebook ${nb.name}`}
                      onClick={() => {
                        setRenaming(nb.gradeLevelId);
                        setRenameDraft(nb.name);
                      }}
                    >
                      Rename
                    </Button>
                  </Tooltip>
                  <Tooltip
                    content={`Archive "${nb.name}" — it will stop appearing in active views for everyone on your workspace, but all content (lessons, Personal copies) is kept and can be recovered. This affects every teacher in the workspace.`}
                    required
                  >
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={pending}
                      aria-label={`Archive notebook ${nb.name}`}
                      onClick={() =>
                        runAction(() => archiveNotebookAction(nb.gradeLevelId))
                      }
                    >
                      Archive
                    </Button>
                  </Tooltip>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>

      {/* Archived notebooks (collapsed info) */}
      {archivedNotebooks.length > 0 && (
        <p className={styles.archivedNote}>
          {archivedNotebooks.length} archived notebook{archivedNotebooks.length !== 1 ? "s" : ""}
          : {archivedNotebooks.map((nb) => nb.name).join(", ")}. Content is
          retained; contact support to restore.
        </p>
      )}

      {/* Create new notebook */}
      <div className={styles.createNotebookArea}>
        {creating ? (
          <form
            className={styles.renameForm}
            onSubmit={(e) => {
              e.preventDefault();
              runAction(() => createNotebookAction(createName));
            }}
          >
            <input
              className={styles.textInput}
              value={createName}
              autoFocus
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g. Grade 5 Math, Art, Music"
              aria-label="New notebook name"
              title="Type a name for the new notebook — e.g. 'Grade 5 Math'."
            />
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={pending || !createName.trim()}
              title="Create this notebook in your workspace."
            >
              Create
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setCreating(false);
                setCreateName("");
              }}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <Tooltip
            content="Create a new notebook in this workspace — each notebook holds one curriculum (Grade 5 Math, Art Tutoring, etc.) with its own Team plan and member group. You'll be set as its lead automatically."
            required
          >
            <Button
              variant="secondary"
              size="sm"
              disabled={pending}
              onClick={() => setCreating(true)}
              title="Create a new notebook in this workspace."
            >
              + New notebook
            </Button>
          </Tooltip>
        )}
      </div>
    </SettingsCard>
  );
}

// ── Main TeamPage ──────────────────────────────────────────────────────────────

export function TeamPage({
  members,
  seats,
  notebooks,
  pendingInvites,
  callerInfo,
  callerNotebookRoles,
}: TeamPageProps): ReactNode {
  const isWorkspaceAdmin = callerInfo?.isWorkspaceAdmin ?? false;
  const callerTeacherId = callerInfo?.teacherId ?? null;

  // Panel visibility state.
  const [showInvite, setShowInvite] = useState(false);
  const [, startTransition] = useTransition();
  // router.refresh() re-triggers the server component data fetch without a
  // full navigation. The revalidatePath calls in each server action invalidate
  // the Next.js cache for this route, so router.refresh() picks up fresh data.
  const router = useRouter();

  const isSolo = members.length <= 1;

  // Whether the caller can manage invites (admin or lead of any active notebook).
  const canInvite =
    isWorkspaceAdmin ||
    Object.entries(callerNotebookRoles).some(
      ([gid, role]) =>
        (role === "lead" || role === "grade_admin") &&
        notebooks.some((nb) => nb.gradeLevelId === gid && nb.isActive),
    );

  // Trigger a server-side refresh when mutations succeed.
  // revalidatePath in the server actions invalidates the cache; router.refresh()
  // re-executes the server component to pick up the new data without a full
  // page navigation.
  function handleDataChange(): void {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <PageHeader
          eyebrow="Settings"
          title="Team"
          subtitle={`${seats.used} of ${seats.cap} seats used · ${members.length} member${members.length !== 1 ? "s" : ""}`}
          actions={
            canInvite && !isSolo ? (
              <Tooltip
                content="Open the invite panel to add a new teammate to this workspace."
                tooltipId="team-page-invite-btn"
              >
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => setShowInvite((v) => !v)}
                  aria-expanded={showInvite}
                  aria-controls="team-invite-panel"
                  title="Open the invite panel to add a teammate"
                >
                  {showInvite ? "Close invite" : "+ Invite"}
                </Button>
              </Tooltip>
            ) : undefined
          }
        />

        {/* ── Solo state ──────────────────────────────────────────────────── */}
        {isSolo && (
          <SoloState onInviteClick={() => setShowInvite(true)} />
        )}

        {/* ── Invite panel (toggle-able) ──────────────────────────────────── */}
        {(showInvite || isSolo) && callerInfo && canInvite && (
          <div id="team-invite-panel">
            <InvitePanel
              notebooks={notebooks}
              callerInfo={callerInfo}
              callerNotebookRoles={callerNotebookRoles}
              isWorkspaceAdmin={isWorkspaceAdmin}
              onDataChange={handleDataChange}
            />
          </div>
        )}

        {/* ── Full team management (non-solo) ─────────────────────────────── */}
        {!isSolo && (
          <>
            <MemberList
              members={members}
              seats={seats}
              callerTeacherId={callerTeacherId}
              isWorkspaceAdmin={isWorkspaceAdmin}
              callerNotebookRoles={callerNotebookRoles}
              onDataChange={handleDataChange}
            />

            {pendingInvites.length > 0 && (
              <PendingInvites
                invites={pendingInvites}
                isWorkspaceAdmin={isWorkspaceAdmin}
                callerNotebookRoles={callerNotebookRoles}
                onDataChange={handleDataChange}
              />
            )}
          </>
        )}

        {/* ── Notebook admin (workspace-admin only) ───────────────────────── */}
        {isWorkspaceAdmin && (
          <NotebookAdmin
            notebooks={notebooks}
            onDataChange={handleDataChange}
          />
        )}
      </div>
    </div>
  );
}
