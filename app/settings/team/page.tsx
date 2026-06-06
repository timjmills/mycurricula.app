// app/settings/team/page.tsx — Settings → Team
//
// Server component: fetches member data, notebooks, pending invites, and the
// caller's capability profile, then passes everything to the client TeamPage
// shell so the client doesn't need to make additional round-trips.
//
// Capability derivation (CLAUDE.md / ultraplan §0 decision #2 + §4):
//   • isWorkspaceAdmin — true when auth.uid() has a school_admins row.
//   • isNotebookLead(notebookId) — true when the caller's TGA role ∈
//     ('lead','grade_admin') for that grade_level_id.
//   Both are derived from data already fetched by lib/admin/queries.ts so
//   no extra round-trip is needed.
//
// The server always fetches the full picture; the client conditionally renders
// admin vs lead vs member controls based on the passed capabilities. Every RPC
// re-checks authorization server-side anyway (ultraplan §4: "UI gating is
// cosmetic — the RPC is the actual gate").

import type { ReactNode } from "react";
import { Suspense } from "react";
import {
  listWorkspaceMembers,
  listWorkspaceNotebooks,
  listPendingInvites,
  getCallerInfo,
} from "./actions";
import { TeamPage } from "@/components/team/TeamPage";

// ── Suspense fallback ──────────────────────────────────────────────────────────

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

// ── Data-fetching inner component ──────────────────────────────────────────────

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

export default function TeamSettingsPage(): ReactNode {
  return (
    <Suspense fallback={<TeamLoadingSkeleton />}>
      <TeamData />
    </Suspense>
  );
}
