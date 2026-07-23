import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import {
  canListWorkspaceRoster,
  type ListRosterContext,
} from "../lib/workspaces/authz";
import {
  mapRosterRow,
  mapRosterRows,
  WORKSPACE_ROSTER_ROW_COLUMNS,
  type WorkspaceRosterRow,
} from "../lib/workspaces/row";

// ───────────────────────────────────────────────────────────────────────────
// Workspace ROSTER read (list_workspace_members RPC —
// 20260725120000_workspace_roster.sql), the follow-up to the multi-workspace
// tenancy migration. Same HONEST LIMITATION as workspaces-rpcs.test.ts: this
// repo has NO database harness, so the SECURITY DEFINER RPC's runtime behavior
// can only be asserted against a live Postgres (enumerated as `it.todo` below).
// What CAN run here:
//   1. The PURE authorization mirror (canListWorkspaceRoster) — the executable
//      decision matrix: authenticated → workspace → ANY-member gate.
//   2. The PURE roster mappers (mapRosterRow / mapRosterRows) — field mapping,
//      dedupe-by-teacher_id, deterministic name sort.
//   3. Static invariant checks over the migration TEXT, so a future edit that
//      silently drops a guard (or starts leaking active_school_id) fails CI.
// ───────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// 1. AUTHORIZATION MATRIX — canListWorkspaceRoster (mirror of the RPC's guards)
// ---------------------------------------------------------------------------
const rosterBase: ListRosterContext = {
  callerId: "teacher-1",
  schoolId: "school-1",
  isMember: true,
};

describe("canListWorkspaceRoster — authorization matrix", () => {
  it("ANY member may read their workspace's roster (no admin requirement)", () => {
    expect(canListWorkspaceRoster(rosterBase)).toEqual({ allowed: true });
  });

  it("an unauthenticated caller is rejected first", () => {
    expect(canListWorkspaceRoster({ ...rosterBase, callerId: "" })).toEqual({
      allowed: false,
      reason: "not-authenticated",
    });
  });

  it("a missing workspace is rejected", () => {
    expect(canListWorkspaceRoster({ ...rosterBase, schoolId: "" })).toEqual({
      allowed: false,
      reason: "no-workspace",
    });
  });

  it("MUST BLOCK: a NON-member cannot enumerate a foreign roster (fail closed)", () => {
    expect(canListWorkspaceRoster({ ...rosterBase, isMember: false })).toEqual({
      allowed: false,
      reason: "not-a-member",
    });
  });

  it("guards fire in the SQL's order (auth → workspace → membership)", () => {
    expect(
      canListWorkspaceRoster({ callerId: "", schoolId: "", isMember: false }),
    ).toEqual({ allowed: false, reason: "not-authenticated" });
  });
});

// ---------------------------------------------------------------------------
// 2. ROSTER MAPPERS (pure) — field mapping / dedupe / deterministic sort
// ---------------------------------------------------------------------------
function rosterRow(over: Partial<WorkspaceRosterRow> = {}): WorkspaceRosterRow {
  return {
    teacher_id: "t1",
    display_name: "Amina",
    email: "amina@example.com",
    is_owner: false,
    is_admin: false,
    joined_at: "2026-07-01T00:00:00Z",
    ...over,
  };
}

describe("mapRosterRow — snake_case RPC row → camelCase entry", () => {
  it("maps every projected column", () => {
    expect(
      mapRosterRow(rosterRow({ is_owner: true, is_admin: true })),
    ).toEqual({
      teacherId: "t1",
      displayName: "Amina",
      email: "amina@example.com",
      isOwner: true,
      isWorkspaceAdmin: true,
      joinedAt: "2026-07-01T00:00:00Z",
    });
  });

  it("defensively coalesces nullish name/email to empty strings", () => {
    const mapped = mapRosterRow(
      rosterRow({
        display_name: null as unknown as string,
        email: null as unknown as string,
      }),
    );
    expect(mapped.displayName).toBe("");
    expect(mapped.email).toBe("");
  });
});

describe("mapRosterRows — dedupe by teacher_id + name sort", () => {
  it("keeps one entry per teacher_id (first occurrence wins)", () => {
    const out = mapRosterRows([
      rosterRow({ teacher_id: "a", display_name: "First" }),
      rosterRow({ teacher_id: "a", display_name: "Dup" }),
      rosterRow({ teacher_id: "b", display_name: "Second" }),
    ]);
    expect(out.map((m) => m.teacherId)).toEqual(["a", "b"]);
    expect(out.find((m) => m.teacherId === "a")?.displayName).toBe("First");
  });

  it("sorts by display name, then email (mirrors the RPC's ORDER BY)", () => {
    const out = mapRosterRows([
      rosterRow({ teacher_id: "c", display_name: "Zainab", email: "z@x.com" }),
      rosterRow({ teacher_id: "a", display_name: "Amina", email: "b@x.com" }),
      rosterRow({ teacher_id: "b", display_name: "Amina", email: "a@x.com" }),
    ]);
    expect(out.map((m) => m.teacherId)).toEqual(["b", "a", "c"]);
  });

  it("maps an empty list to an empty array", () => {
    expect(mapRosterRows([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. MIGRATION TEXT INVARIANTS (static; a guardrail, not a DB behavior test)
// ---------------------------------------------------------------------------
const MIGRATION_PATH = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260725120000_workspace_roster.sql",
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

describe("migration — list_workspace_members is hardened SECURITY DEFINER", () => {
  const body = fnBody("list_workspace_members");

  it("is security definer with set search_path = public", () => {
    expect(body).toMatch(/security definer/i);
    expect(body).toMatch(/set search_path = public/i);
  });

  it("pins #variable_conflict use_column (OUT names double as columns)", () => {
    expect(body).toMatch(/#variable_conflict use_column/i);
  });

  it("fails closed on a null auth.uid() BEFORE the membership check", () => {
    expect(body).toMatch(/if v_uid is null then/i);
    const uidCheck = body.search(/if v_uid is null then/i);
    const memberCheck = body.search(/if not is_workspace_member/i);
    expect(uidCheck).toBeGreaterThan(-1);
    expect(memberCheck).toBeGreaterThan(-1);
    expect(uidCheck).toBeLessThan(memberCheck);
  });

  it("re-checks is_workspace_member(p_school_id) server-side and raises", () => {
    expect(body).toMatch(/if not is_workspace_member\(p_school_id\) then/i);
    expect(body).toMatch(
      /raise exception 'list_workspace_members: caller is not a member/i,
    );
  });

  it("rejects a null p_school_id", () => {
    expect(body).toMatch(/if p_school_id is null then/i);
  });

  it("RETURNS TABLE columns match WORKSPACE_ROSTER_ROW_COLUMNS exactly", () => {
    const m = body.match(/returns table \(([\s\S]*?)\)/i);
    expect(m, "RETURNS TABLE clause should be present").not.toBeNull();
    const sqlColumns = m![1]
      .split(",")
      .map((line) => line.trim().split(/\s+/)[0])
      .filter(Boolean);
    expect(sqlColumns).toEqual(
      WORKSPACE_ROSTER_ROW_COLUMNS.split(",").map((c) => c.trim()),
    );
  });

  it("LEAK GUARD: the projection never references active_school_id", () => {
    expect(body).not.toMatch(/active_school_id/i);
  });
});

describe("migration — execute grants: authenticated only, never public/anon", () => {
  it("revokes from public AND anon, grants only to authenticated", () => {
    expect(sql).toMatch(
      /revoke execute on function list_workspace_members\(uuid\) from public;/i,
    );
    expect(sql).toMatch(
      /revoke execute on function list_workspace_members\(uuid\) from anon;/i,
    );
    expect(sql).toMatch(
      /grant\s+execute on function list_workspace_members\(uuid\) to authenticated;/i,
    );
  });
});

describe("migration — teachers_read_self is additive, own-row-only", () => {
  it("creates a SELECT policy gated strictly on id = auth.uid()", () => {
    expect(sql).toMatch(/drop policy if exists teachers_read_self on teachers;/i);
    expect(sql).toMatch(
      /create policy teachers_read_self on teachers\s+for select using \(id = auth\.uid\(\)\)/i,
    );
  });

  it("widens nothing else — no insert/update/delete policy, no new grants", () => {
    // The migration must not add any write policy or table grant on teachers.
    expect(sql).not.toMatch(/create policy [\w]+ on teachers\s+for (insert|update|delete)/i);
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]*?on teachers/i);
  });
});

// ---------------------------------------------------------------------------
// 4. PIN on 20260724120000 — redeem_invite writes BOTH ledgers. The roster RPC
// reads workspace_members while the seat count reads team_memberships; the two
// only agree because the join path inserts into BOTH. A future edit dropping
// either insert would silently desync "N of M seats" from the member list.
// ---------------------------------------------------------------------------
describe("20260724120000 pin — redeem_invite inserts into BOTH ledgers", () => {
  const mwSql = readFileSync(
    join(
      __dirname,
      "..",
      "supabase",
      "migrations",
      "20260724120000_multi_workspace.sql",
    ),
    "utf8",
  );
  const redeemMatch = mwSql.match(
    /create or replace function redeem_invite\b[\s\S]*?\$\$;/i,
  );

  it("redeem_invite is defined", () => {
    expect(redeemMatch).not.toBeNull();
  });

  it("inserts a team_memberships row (the SEAT ledger)", () => {
    expect(redeemMatch![0]).toMatch(/insert into team_memberships/i);
  });

  it("inserts a workspace_members row (the ROSTER ledger)", () => {
    expect(redeemMatch![0]).toMatch(/insert into workspace_members/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. RUNTIME BEHAVIORAL TESTS — need a live Postgres with BOTH migrations
// applied + an auth context (auth.uid()). NOT runnable here (no DB harness).
// Enumerated so the intended coverage is on the record.
// ───────────────────────────────────────────────────────────────────────────
describe("workspace roster runtime behavior (needs a DB harness)", () => {
  it.todo(
    "any MEMBER (not only an admin) of a workspace can list its full roster",
  );
  it.todo(
    "a NON-member's list_workspace_members call raises — no roster row leaks",
  );
  it.todo(
    "a joined-in member (redeem_invite ADD) appears in the joined workspace's roster in BOTH directions (home members see them; they see home members)",
  );
  it.todo(
    "is_admin is true only for a school_admins row IN THAT workspace (a home admin is not admin of a joined workspace)",
  );
  it.todo(
    "teachers_read_self lets a teacher whose ACTIVE workspace is foreign still read their OWN teachers row (default_grade_level_id resolution)",
  );
  it.todo(
    "seat usage (team_memberships) and the roster (workspace_members) agree after a redeem_invite join",
  );
});
