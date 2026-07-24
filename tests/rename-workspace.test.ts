import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import {
  canRenameWorkspace,
  type RenameWorkspaceContext,
} from "../lib/workspaces/authz";

// ───────────────────────────────────────────────────────────────────────────
// rename_workspace RPC (20260726120000_rename_workspace.sql) — the cutover-bundle
// item that makes an ON-path workspace rename actually persist. Same HONEST
// LIMITATION as workspaces-rpcs.test.ts / workspace-roster.test.ts: this repo has
// NO database harness, so the SECURITY DEFINER RPC's runtime behavior can only be
// asserted against a live Postgres (enumerated as `it.todo` below). What CAN run:
//   1. The PURE authorization mirror (canRenameWorkspace) — the executable
//      decision matrix: authenticated → target → membership → admin, in the SQL's
//      guard order.
//   2. Static invariant checks over the migration TEXT, so a future edit that
//      silently drops a guard (or starts re-homing school_id) fails CI.
// ───────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// 1. AUTHORIZATION MATRIX — canRenameWorkspace (mirror of the RPC's guards)
// ---------------------------------------------------------------------------
const renameBase: RenameWorkspaceContext = {
  callerId: "teacher-1",
  targetSchoolId: "school-1",
  isMember: true,
  isWorkspaceAdmin: true,
};

describe("canRenameWorkspace — authorization matrix", () => {
  it("a workspace admin who is a member may rename it", () => {
    expect(canRenameWorkspace(renameBase)).toEqual({ allowed: true });
  });

  it("an unauthenticated caller is rejected first", () => {
    expect(canRenameWorkspace({ ...renameBase, callerId: "" })).toEqual({
      allowed: false,
      reason: "not-authenticated",
    });
  });

  it("a missing target is rejected", () => {
    expect(
      canRenameWorkspace({ ...renameBase, targetSchoolId: "" }),
    ).toEqual({ allowed: false, reason: "no-target" });
  });

  it("MUST BLOCK: a NON-member cannot rename a foreign tenant (fail closed)", () => {
    expect(canRenameWorkspace({ ...renameBase, isMember: false })).toEqual({
      allowed: false,
      reason: "not-a-member",
    });
  });

  it("MUST BLOCK: a plain member who is not an admin cannot rename", () => {
    expect(
      canRenameWorkspace({ ...renameBase, isWorkspaceAdmin: false }),
    ).toEqual({ allowed: false, reason: "not-an-admin" });
  });

  it("membership is checked BEFORE admin (matches the SQL's order)", () => {
    // A non-member who is somehow flagged admin still fails on membership first.
    expect(
      canRenameWorkspace({
        ...renameBase,
        isMember: false,
        isWorkspaceAdmin: false,
      }),
    ).toEqual({ allowed: false, reason: "not-a-member" });
  });

  it("guards fire in the SQL's order (auth → target → membership → admin)", () => {
    expect(
      canRenameWorkspace({
        callerId: "",
        targetSchoolId: "",
        isMember: false,
        isWorkspaceAdmin: false,
      }),
    ).toEqual({ allowed: false, reason: "not-authenticated" });
  });
});

// ---------------------------------------------------------------------------
// 2. MIGRATION TEXT INVARIANTS (static; a guardrail, not a DB behavior test)
// ---------------------------------------------------------------------------
const MIGRATION_PATH = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260726120000_rename_workspace.sql",
);
const sql = readFileSync(MIGRATION_PATH, "utf8");

function fnBody(name: string): string {
  const re = new RegExp(
    `create or replace function ${name}\\b[\\s\\S]*?\\$\\$;`,
    "i",
  );
  const m = sql.match(re);
  expect(m, `function ${name} should be defined`).not.toBeNull();
  return m![0];
}

describe("migration — rename_workspace is hardened SECURITY DEFINER, fail-closed", () => {
  const body = fnBody("rename_workspace");

  it("is security definer with pg_temp pinned LAST in search_path", () => {
    expect(body).toMatch(/security definer/i);
    // `public, pg_temp` — without the explicit pg_temp tail, the caller's temp
    // schema is searched FIRST for relations and could shadow the membership
    // tables inside the definer body.
    expect(body).toMatch(/set search_path = public, pg_temp/i);
  });

  it("locks the schools row before the read/compare/update (FOR UPDATE)", () => {
    expect(body).toMatch(
      /select s\.name into v_old from schools s where s\.id = p_school_id for update/i,
    );
  });

  it("back-fills the pg_temp pin onto the shipped workspace-family RPCs", () => {
    // SECTION 3 sweep — the already-applied wave functions share the weaker
    // `public`-only pin; this migration re-pins them at cutover.
    expect(sql).toMatch(/alter function %s set search_path = public, pg_temp/i);
    for (const fn of [
      "is_workspace_member",
      "auth_teacher_school_id",
      "set_active_workspace",
      "create_workspace",
      "list_my_workspaces",
      "redeem_invite",
      "list_workspace_members",
      "share_course",
      "unshare_course",
      "list_course_sharing",
      "is_school_admin",
      "log_audit_event",
    ]) {
      expect(sql, `${fn} should be in the hardening sweep`).toMatch(
        new RegExp(`'${fn}'`),
      );
    }
  });

  it("fails closed on a null auth.uid() and a null target", () => {
    expect(body).toMatch(/if v_uid is null then/i);
    expect(body).toMatch(/if p_school_id is null then/i);
  });

  it("re-checks membership BEFORE admin rights (both fail closed)", () => {
    expect(body).toMatch(/if not is_workspace_member\(p_school_id\) then/i);
    // Admin gate: is_school_admin(target) OR the founding owner.
    expect(body).toMatch(/is_school_admin\(p_school_id\)/i);
    expect(body).toMatch(/wm\.is_owner = true/i);
    const memberCheck = body.search(/if not is_workspace_member/i);
    const adminCheck = body.search(/is not a workspace admin/i);
    expect(memberCheck).toBeGreaterThan(-1);
    expect(adminCheck).toBeGreaterThan(-1);
    expect(memberCheck).toBeLessThan(adminCheck);
  });

  it("rejects a blank name (a workspace always has a name)", () => {
    expect(body).toMatch(/if v_name = '' then/i);
    // Trimmed + length-clamped like create_workspace's schools.name write.
    expect(body).toMatch(/left\(btrim\(coalesce\(p_name, ''\)\), 120\)/i);
  });

  it("relabels schools.name and NEVER re-homes school_id or the pointer", () => {
    expect(body).toMatch(/update schools set name = v_name where id = p_school_id/i);
    // A rename must never touch teachers.school_id (home) or active_school_id.
    expect(body).not.toMatch(/update teachers/i);
    expect(body).not.toMatch(/active_school_id/i);
  });

  it("writes an audit row with the workspace_renamed action", () => {
    expect(body).toMatch(/perform log_audit_event\(\s*'workspace_renamed'/i);
  });
});

describe("migration — the workspace_renamed audit_action is added idempotently", () => {
  it("adds 'workspace_renamed'", () => {
    expect(sql).toMatch(
      /alter type audit_action add value if not exists 'workspace_renamed'/i,
    );
  });
});

describe("migration — execute grants: authenticated only, never public/anon", () => {
  it("revokes from public AND anon, grants only to authenticated", () => {
    expect(sql).toMatch(
      /revoke execute on function rename_workspace\(uuid, text\) from public;/i,
    );
    expect(sql).toMatch(
      /revoke execute on function rename_workspace\(uuid, text\) from anon;/i,
    );
    expect(sql).toMatch(
      /grant\s+execute on function rename_workspace\(uuid, text\) to authenticated;/i,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. RUNTIME BEHAVIORAL TESTS — need a live Postgres with the migration applied
// + an auth context (auth.uid()). NOT runnable here (no DB harness). Enumerated
// so the intended coverage is on the record for the cutover.
// ───────────────────────────────────────────────────────────────────────────
describe("rename_workspace runtime behavior (needs a DB harness)", () => {
  it.todo(
    "a workspace admin (owner or school_admin) renames their workspace; schools.name updates",
  );
  it.todo(
    "a plain member (not admin) is rejected — the name does not change",
  );
  it.todo(
    "a NON-member cannot rename a foreign workspace (fail closed) even if flagged admin client-side",
  );
  it.todo("a blank/whitespace name is rejected");
  it.todo("the name is trimmed and clamped to 120 chars");
  it.todo(
    "renaming to the current name is a no-op (no schools update, no audit row)",
  );
  it.todo(
    "an admin can rename a workspace that is NOT their active one (audit passes with school NULL)",
  );
  it.todo(
    "a rename never mutates teachers.school_id (home) or active_school_id (pointer)",
  );
});
