// app/settings/workspace/page.tsx — Settings → Workspace & Team
//
// Server component composing two halves:
//
//   (a) Workspace management — the client cards in
//       components/settings/workspace-settings.tsx (workspace rename,
//       notebook list/rename/archive/restore/create, default-notebook
//       picker). localStorage-backed today; Phase 1B seam documented in
//       lib/use-workspace-settings.ts.
//
//   (b) Team — the LIVE Supabase-backed member/invite/notebook-admin flow,
//       relocated verbatim from the old app/settings/team/page.tsx (which is
//       now a redirect here). The server actions stay at
//       app/settings/team/actions.ts — this page imports them relatively.
//       Wrapped in <section id="team-members" data-settings-anchor> so the
//       settings search can deep-link to it.
//
// Capability derivation for (b) is unchanged (CLAUDE.md / ultraplan §0
// decision #2 + §4):
//   • isWorkspaceAdmin — true when auth.uid() has a school_admins row.
//   • isNotebookLead(notebookId) — true when the caller's TGA role ∈
//     ('lead','grade_admin') for that grade_level_id.
// The server always fetches the full picture; the client conditionally
// renders admin vs lead vs member controls. Every RPC re-checks
// authorization server-side anyway ("UI gating is cosmetic — the RPC is
// the actual gate").

import type { ReactNode } from "react";
import { Suspense } from "react";
import {
  listWorkspaceMembers,
  listWorkspaceNotebooks,
  listPendingInvites,
  getCallerInfo,
} from "../team/actions";
import { TeamPage } from "@/components/team";
// Deep import by design — the settings barrel is owned by the settings-hub
// orchestrator; this page imports the client components directly for now.
import { WorkspaceSettings } from "@/components/settings/workspace-settings";
import { WorkspaceSwitcher } from "@/components/settings/workspace-switcher";
import { MULTI_WORKSPACE } from "@/lib/multi-workspace-flag";
import { getActiveWorkspace } from "@/lib/workspaces";
import reveal from "@/components/settings/section-reveal.module.css";
import styles from "./page.module.css";

// ── Suspense fallback (relocated from app/settings/team/page.tsx) ─────────────

function TeamLoadingSkeleton(): ReactNode {
  return (
    <div
      style={{
        padding: 24,
        fontSize: "var(--t-13)",
        color: "var(--muted)",
      }}
      role="status"
      aria-live="polite"
    >
      Loading team…
    </div>
  );
}

// ── Data-fetching inner component (relocated from app/settings/team/page.tsx) ─

async function TeamData({
  activeSchoolId,
}: {
  /** The ACTIVE workspace id on the MULTI_WORKSPACE path (hoisted by the page
   *  below), or null. Null ⇒ every read runs its verbatim flag-OFF/ambient
   *  body. Non-null ⇒ the reads pin to that workspace: the roster comes from
   *  the workspace_members RPC (joined-in members included), "workspace admin"
   *  means admin of the ACTIVE workspace, and the teams `.maybeSingle()` reads
   *  are one-row again for a teacher in ≥2 teams. */
  activeSchoolId: string | null;
}): Promise<ReactNode> {
  const schoolId = activeSchoolId ?? undefined;
  // Fetch in parallel — no data dependency between them.
  const [membersResult, notebooks, pendingInvites, callerInfo] =
    await Promise.all([
      listWorkspaceMembers(schoolId).catch(() => ({
        members: [],
        seats: { used: 0, cap: 5 },
      })),
      listWorkspaceNotebooks(schoolId).catch(() => []),
      listPendingInvites(schoolId).catch(() => []),
      getCallerInfo(schoolId).catch(() => null),
    ]);

  // Derive which notebooks the caller leads (grade_role 'lead' or 'grade_admin').
  // Used by the client to gate notebook-lead controls per notebook.
  const callerNotebookRoles: Record<
    string,
    "teacher" | "lead" | "grade_admin"
  > = {};
  if (callerInfo) {
    const callerMember = membersResult.members.find(
      (m) => m.teacherId === callerInfo.teacherId,
    );
    if (callerMember) {
      for (const nr of callerMember.notebookRoles) {
        callerNotebookRoles[nr.gradeLevelId] = nr.role;
      }
    }
  }

  return (
    <TeamPage
      members={membersResult.members}
      seats={membersResult.seats}
      notebooks={notebooks}
      pendingInvites={pendingInvites}
      callerInfo={callerInfo}
      callerNotebookRoles={callerNotebookRoles}
    />
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function WorkspaceSettingsPage(): Promise<ReactNode> {
  // When the multi-workspace seam is ON, re-key the workspace-management cards
  // on the active workspace id. A switch/create in <WorkspaceSwitcher> calls
  // router.refresh(), which re-runs this Server Component; a CHANGED key then
  // remounts <WorkspaceSettings> so its client NotebookProvider (which fetches
  // its identity once at mount) re-sources the NEW workspace's name/notebooks —
  // otherwise those cards would keep showing the prior workspace until the
  // teacher left Settings (Codex §4a High). When the read is unavailable (seam
  // off at runtime, no active workspace, or a transient error) we fall back to a
  // sentinel that is DISTINCT from any real schoolId — so a card stack that WAS
  // keyed on a real workspace and then hits a failed read still sees a changed
  // key and remounts (its provider then re-sources, fail-closing to empty)
  // rather than silently retaining the prior tenant (Codex §4a). Flag OFF: the
  // ternary short-circuits (no fetch), the key stays undefined, and the page is
  // byte-identical to today.
  // The fetch is HOISTED (one read serves both consumers): the re-key below AND
  // the <TeamData activeSchoolId> pin — so the key and the pinned reads can
  // never disagree about which workspace is active within one render.
  const WS_KEY_UNRESOLVED = "__ws-unresolved__";
  const activeWorkspace = MULTI_WORKSPACE
    ? await getActiveWorkspace().catch(() => null)
    : null;
  const activeWorkspaceKey = MULTI_WORKSPACE
    ? (activeWorkspace?.schoolId ?? WS_KEY_UNRESOLVED)
    : undefined;

  return (
    <>
      {/* Multi-workspace picker (Wave 12b-2). Flag-gated: MULTI_WORKSPACE is a
          build-inlined constant, so when the flag is OFF this ternary collapses
          to `null` and dead-code-eliminates — the page renders byte-identically
          to today. Only when the flag is ON (and the backing migration applied)
          does the switcher mount above the workspace-management cards. */}
      {MULTI_WORKSPACE ? <WorkspaceSwitcher /> : null}

      {/* (a) Workspace / notebooks / default-notebook management cards. Keyed on
          the active workspace (ON path only) so a switch/create remounts + re-
          sources them — see the comment above. */}
      <WorkspaceSettings key={activeWorkspaceKey} />

      {/* (b) Team members — the live Supabase-backed flow. The anchor id
          gives the settings search a scroll target for "team" queries.
          The settings layout's .content wrapper is padding-less, and the
          WorkspaceSettings stack above brings its own centered max-width
          column (with the page's PageHeader + reveal choreography); this
          column gives the Team section the SAME centered gutter + reveal so
          its members card aligns with the cards above instead of rendering
          edge-to-edge. The <section id="team-members"> anchor is preserved
          verbatim inside the wrapper. */}
      <div className={styles.page}>
        <div className={`${styles.inner} ${reveal.reveal}`}>
          <section id="team-members" data-settings-anchor>
            <Suspense fallback={<TeamLoadingSkeleton />}>
              <TeamData activeSchoolId={activeWorkspace?.schoolId ?? null} />
            </Suspense>
          </section>
        </div>
      </div>
    </>
  );
}
