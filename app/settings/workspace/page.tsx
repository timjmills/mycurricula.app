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
// orchestrator; this page imports the client component directly for now.
import { WorkspaceSettings } from "@/components/settings/workspace-settings";

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

async function TeamData(): Promise<ReactNode> {
  // Fetch in parallel — no data dependency between them.
  const [membersResult, notebooks, pendingInvites, callerInfo] =
    await Promise.all([
      listWorkspaceMembers().catch(() => ({
        members: [],
        seats: { used: 0, cap: 5 },
      })),
      listWorkspaceNotebooks().catch(() => []),
      listPendingInvites().catch(() => []),
      getCallerInfo().catch(() => null),
    ]);

  // Derive which notebooks the caller leads (grade_role 'lead' or 'grade_admin').
  // Used by the client to gate notebook-lead controls per notebook.
  const callerNotebookRoles: Record<string, "teacher" | "lead" | "grade_admin"> = {};
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

export default function WorkspaceSettingsPage(): ReactNode {
  return (
    <>
      {/* (a) Workspace / notebooks / default-notebook management cards. */}
      <WorkspaceSettings />

      {/* (b) Team members — the live Supabase-backed flow. The anchor id
          gives the settings search a scroll target for "team" queries. */}
      <section id="team-members" data-settings-anchor>
        <Suspense fallback={<TeamLoadingSkeleton />}>
          <TeamData />
        </Suspense>
      </section>
    </>
  );
}
