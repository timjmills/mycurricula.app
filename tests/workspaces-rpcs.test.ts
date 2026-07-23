import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import {
  canCreateWorkspace,
  canSwitchToWorkspace,
  WORKSPACE_CREATION_SAFETY_CAP,
  type CreateWorkspaceContext,
  type SwitchWorkspaceContext,
} from "../lib/workspaces/authz";
import {
  isWorkspaceAdminRole,
  mapWorkspaceRow,
  mapWorkspaceRows,
  pickActiveWorkspace,
  resolveWorkspaceRole,
  WORKSPACE_ROW_COLUMNS,
  type WorkspaceRow,
} from "../lib/workspaces/row";

// ───────────────────────────────────────────────────────────────────────────
// Wave 12b-2: multi-workspace tenancy seam.
//
// Same HONEST LIMITATION as course-sharing-rpcs.test.ts: this repo has NO
// database harness, so the SECURITY DEFINER RPCs' runtime behavior can only be
// asserted against a live Postgres (enumerated as `it.todo` below). What CAN run
// here:
//   1. The PURE authorization mirror (lib/workspaces/authz.ts) — the executable
//      decision matrix for create / switch, incl. the anti-abuse cap lockstep.
//   2. The PURE row mappers (lib/workspaces/row.ts) — role/isSolo derivation,
//      dedupe, active-pick, admin-role, and the leak-free projection.
//   3. Static invariant checks over the migration TEXT + the admin-query
//      projection, so a future edit that silently drops a guard (or starts
//      leaking active_school_id) fails CI.
// ───────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// 1. AUTHORIZATION MATRIX — canCreateWorkspace (mirror of create_workspace)
// ---------------------------------------------------------------------------
const createBase: CreateWorkspaceContext = {
  callerId: "teacher-1",
  hasTeacherProfile: true,
  ownedWorkspaceCount: 0,
};

describe("canCreateWorkspace — authorization matrix", () => {
  it("an authenticated teacher under the cap can create a workspace", () => {
    expect(canCreateWorkspace(createBase)).toEqual({ allowed: true });
  });

  it("an unauthenticated caller is rejected first", () => {
    expect(canCreateWorkspace({ ...createBase, callerId: "" })).toEqual({
      allowed: false,
      reason: "not-authenticated",
    });
  });

  it("a caller with no teacher profile is rejected", () => {
    expect(
      canCreateWorkspace({ ...createBase, hasTeacherProfile: false }),
    ).toEqual({ allowed: false, reason: "no-teacher-profile" });
  });

  it("a caller AT the safety cap is rejected (>= mirrors the SQL)", () => {
    expect(
      canCreateWorkspace({
        ...createBase,
        ownedWorkspaceCount: WORKSPACE_CREATION_SAFETY_CAP,
      }),
    ).toEqual({ allowed: false, reason: "safety-cap-reached" });
  });

  it("a caller one under the cap is still allowed", () => {
    expect(
      canCreateWorkspace({
        ...createBase,
        ownedWorkspaceCount: WORKSPACE_CREATION_SAFETY_CAP - 1,
      }),
    ).toEqual({ allowed: true });
  });

  it("auth is checked before the profile + cap (order matches the SQL)", () => {
    expect(
      canCreateWorkspace({
        callerId: "",
        hasTeacherProfile: false,
        ownedWorkspaceCount: 999,
      }),
    ).toEqual({ allowed: false, reason: "not-authenticated" });
  });
});

// ---------------------------------------------------------------------------
// 2. AUTHORIZATION MATRIX — canSwitchToWorkspace (mirror of set_active_workspace)
// ---------------------------------------------------------------------------
const switchBase: SwitchWorkspaceContext = {
  callerId: "teacher-1",
  targetSchoolId: "school-1",
  isMember: true,
};

describe("canSwitchToWorkspace — authorization matrix", () => {
  it("a member can switch to a workspace they belong to", () => {
    expect(canSwitchToWorkspace(switchBase)).toEqual({ allowed: true });
  });

  it("an unauthenticated caller is rejected", () => {
    expect(canSwitchToWorkspace({ ...switchBase, callerId: "" })).toEqual({
      allowed: false,
      reason: "not-authenticated",
    });
  });

  it("a missing target is rejected", () => {
    expect(
      canSwitchToWorkspace({ ...switchBase, targetSchoolId: "" }),
    ).toEqual({ allowed: false, reason: "no-target" });
  });

  it("MUST BLOCK: a NON-member cannot switch to a foreign tenant (fail closed)", () => {
    expect(canSwitchToWorkspace({ ...switchBase, isMember: false })).toEqual({
      allowed: false,
      reason: "not-a-member",
    });
  });

  it("membership is checked LAST (auth + target win first, matching the SQL)", () => {
    expect(
      canSwitchToWorkspace({
        callerId: "",
        targetSchoolId: "",
        isMember: false,
      }),
    ).toEqual({ allowed: false, reason: "not-authenticated" });
  });
});

// ---------------------------------------------------------------------------
// 3. ROW MAPPERS (pure) — role / isSolo / dedupe / active-pick / admin-role
// ---------------------------------------------------------------------------
function row(over: Partial<WorkspaceRow> = {}): WorkspaceRow {
  return {
    school_id: "s1",
    name: "My Workspace",
    is_owner: false,
    is_admin: false,
    member_count: 1,
    is_active: false,
    ...over,
  };
}

describe("resolveWorkspaceRole — owner ⊃ admin ⊃ member", () => {
  it("owner wins over admin", () => {
    expect(resolveWorkspaceRole({ is_owner: true, is_admin: true })).toBe(
      "owner",
    );
  });
  it("admin when not owner", () => {
    expect(resolveWorkspaceRole({ is_owner: false, is_admin: true })).toBe(
      "admin",
    );
  });
  it("member when neither", () => {
    expect(resolveWorkspaceRole({ is_owner: false, is_admin: false })).toBe(
      "member",
    );
  });
});

describe("mapWorkspaceRow — role + isSolo derivation", () => {
  it("maps a solo owner workspace", () => {
    expect(
      mapWorkspaceRow(
        row({ is_owner: true, is_admin: true, member_count: 1, is_active: true }),
      ),
    ).toEqual({
      schoolId: "s1",
      name: "My Workspace",
      role: "owner",
      isActive: true,
      isSolo: true,
      memberCount: 1,
    });
  });

  it("a workspace with >1 member is a TEAM (isSolo false)", () => {
    expect(mapWorkspaceRow(row({ member_count: 4 })).isSolo).toBe(false);
  });

  it("member_count 0 (defensive) is treated as solo, not a crash", () => {
    expect(mapWorkspaceRow(row({ member_count: 0 })).isSolo).toBe(true);
    // A nullish count coalesces to 0 → solo (mirrors the ?? 0 guard).
    expect(
      mapWorkspaceRow(row({ member_count: null as unknown as number })).isSolo,
    ).toBe(true);
  });
});

describe("mapWorkspaceRows — dedupe by schoolId", () => {
  it("keeps one summary per schoolId (first occurrence wins)", () => {
    const out = mapWorkspaceRows([
      row({ school_id: "a", name: "First" }),
      row({ school_id: "a", name: "Dup" }),
      row({ school_id: "b", name: "Second" }),
    ]);
    expect(out.map((w) => w.schoolId)).toEqual(["a", "b"]);
    expect(out[0].name).toBe("First");
  });

  it("maps an empty list to an empty array", () => {
    expect(mapWorkspaceRows([])).toEqual([]);
  });
});

describe("pickActiveWorkspace", () => {
  it("returns the active workspace when one is flagged", () => {
    const list = mapWorkspaceRows([
      row({ school_id: "a", is_active: false }),
      row({ school_id: "b", is_active: true }),
    ]);
    expect(pickActiveWorkspace(list)?.schoolId).toBe("b");
  });
  it("returns null when none is active (backend off / no memberships)", () => {
    expect(pickActiveWorkspace([])).toBeNull();
    expect(
      pickActiveWorkspace(mapWorkspaceRows([row({ is_active: false })])),
    ).toBeNull();
  });
});

describe("isWorkspaceAdminRole — the ON-path replacement for ME.role === 'lead'", () => {
  it("owner and admin confer admin; member does not", () => {
    expect(isWorkspaceAdminRole("owner")).toBe(true);
    expect(isWorkspaceAdminRole("admin")).toBe(true);
    expect(isWorkspaceAdminRole("member")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. LEAK-FREE PROJECTION + defense-in-depth (deliverable #4)
// ---------------------------------------------------------------------------
describe("projection never carries the active-workspace pointer or teammate identity", () => {
  it("WORKSPACE_ROW_COLUMNS exposes only aggregate + own-membership fields", () => {
    // The RPC returns member_count (aggregate) — never active_school_id, never a
    // per-teammate id/email.
    expect(WORKSPACE_ROW_COLUMNS).not.toMatch(/active_school_id/);
    expect(WORKSPACE_ROW_COLUMNS).not.toMatch(/teacher_id/);
    expect(WORKSPACE_ROW_COLUMNS).not.toMatch(/email/);
    expect(WORKSPACE_ROW_COLUMNS).toMatch(/member_count/);
  });

  it("EVERY teachers projection in admin/queries excludes active_school_id", () => {
    // A same-workspace teammate must not read another teacher's active-workspace
    // UUID. listWorkspaceMembers (lib/admin/queries.ts) is the teammate-facing
    // read that returns OTHER teachers' rows — it must select explicit columns
    // without the pointer. Rather than match only the FIRST teachers select
    // (fragile — a new query added earlier would dodge the check, Codex R3), scan
    // EVERY `from("teachers")…select(...)` in the file so any teammate-facing
    // projection — present or future, in any order — is covered. This tripwire
    // fails if a future edit widens ANY teachers projection to the pointer.
    const adminSrc = readFileSync(
      join(__dirname, "..", "lib", "admin", "queries.ts"),
      "utf8",
    );
    const teacherSelects = [
      ...adminSrc.matchAll(/from\("teachers"\)[\s\S]*?\.select\(([^)]*)\)/g),
    ];
    expect(teacherSelects.length).toBeGreaterThan(0); // at least one match landed
    for (const m of teacherSelects) {
      expect(m[1]).not.toMatch(/active_school_id/);
      expect(m[1]).not.toMatch(/\*/); // never select('*') on teachers
    }
  });
});

// ---------------------------------------------------------------------------
// 5. MIGRATION TEXT INVARIANTS (static; a guardrail, not a DB behavior test)
// ---------------------------------------------------------------------------
const MIGRATION_PATH = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260724120000_multi_workspace.sql",
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

const RPCS = [
  "set_active_workspace",
  "create_workspace",
  "list_my_workspaces",
  "redeem_invite",
] as const;

describe("migration — every RPC is hardened SECURITY DEFINER, fail-closed on null uid", () => {
  for (const fn of RPCS) {
    it(`${fn} is security definer with set search_path = public`, () => {
      const body = fnBody(fn);
      expect(body).toMatch(/security definer/i);
      expect(body).toMatch(/set search_path = public/i);
    });
    it(`${fn} fails closed on a null auth.uid()`, () => {
      expect(fnBody(fn)).toMatch(/if v_uid is null then/i);
    });
  }
});

describe("migration — auth_teacher_school_id() is the fail-closed resolver (the crown jewel)", () => {
  const body = fnBody("auth_teacher_school_id");
  it("is security definer + search_path pinned (unchanged signature)", () => {
    expect(body).toMatch(/security definer/i);
    expect(body).toMatch(/set search_path = public/i);
  });
  it("returns active_school_id ONLY when it is a real membership, else home", () => {
    expect(body).toMatch(/coalesce\(/i);
    // membership-validation of the pointer …
    expect(body).toMatch(
      /from workspace_members wm[\s\S]*?wm\.school_id = t\.active_school_id/i,
    );
    // … and the home fallback (today's exact behavior).
    expect(body).toMatch(/select t2\.school_id from teachers t2/i);
  });
});

describe("migration — set_active_workspace re-checks membership (fail closed)", () => {
  const body = fnBody("set_active_workspace");
  it("rejects a non-member target", () => {
    expect(body).toMatch(/if not is_workspace_member\(p_school_id\) then/i);
  });
  it("repoints active_school_id (not the home school_id)", () => {
    expect(body).toMatch(/set active_school_id = p_school_id/i);
    // The home pointer is never re-homed by a switch.
    expect(body).not.toMatch(/set\s+school_id\s*=/i);
  });
});

describe("migration — create_workspace anti-abuse cap is in LOCKSTEP with authz.ts", () => {
  const body = fnBody("create_workspace");
  it("the SQL cap constant equals WORKSPACE_CREATION_SAFETY_CAP", () => {
    expect(body).toMatch(
      new RegExp(
        `c_max_owned constant integer := ${WORKSPACE_CREATION_SAFETY_CAP}\\b`,
        "i",
      ),
    );
    expect(WORKSPACE_CREATION_SAFETY_CAP).toBe(25);
  });
  it("rejects at/over the cap with a check_violation errcode", () => {
    expect(body).toMatch(/if v_owned >= c_max_owned then/i);
    expect(body).toMatch(/using errcode = 'check_violation'/i);
  });
  it("switches the caller to the new workspace WITHOUT re-homing school_id", () => {
    expect(body).toMatch(/set active_school_id = v_school/i);
    // HOME school_id must be left intact (the header's invariant).
    expect(body).not.toMatch(/set\s+school_id\s*=/i);
  });
  it("seeds the founding owner as workspace admin (school_admins)", () => {
    expect(body).toMatch(/insert into school_admins/i);
  });
});

describe("migration — list_my_workspaces exposes only aggregate + own membership", () => {
  const body = fnBody("list_my_workspaces");
  it("scopes to the caller's own memberships", () => {
    expect(body).toMatch(/where wm\.teacher_id = v_uid/i);
  });
  it("returns an aggregate member_count, an is_active flag, and is_admin", () => {
    expect(body).toMatch(/count\(\*\)::integer/i);
    expect(body).toMatch(/= auth_teacher_school_id\(\)\) as is_active/i);
    expect(body).toMatch(/is_school_admin\(wm\.school_id\) as is_admin/i);
  });
});

describe("migration — redeem_invite is MOVE → ADD (non-destructive join)", () => {
  const body = fnBody("redeem_invite");
  it("ADDS a workspace_members row for the joined workspace", () => {
    expect(body).toMatch(
      /insert into workspace_members[\s\S]*?values \(v_school_id, v_uid, false\)/i,
    );
  });
  it("switches active_school_id but NEVER re-homes teachers.school_id", () => {
    expect(body).toMatch(/set active_school_id = v_school_id/i);
    // The destructive MOVE (`update teachers set school_id=…`) must be gone.
    expect(body).not.toMatch(/set\s+school_id\s*=/i);
  });
});

describe("migration — workspace_members RLS: self-only read, NO client write path", () => {
  it("enables RLS and grants SELECT-only to authenticated (no insert/update/delete)", () => {
    expect(sql).toMatch(
      /alter table workspace_members enable row level security/i,
    );
    expect(sql).toMatch(/grant\s+select on workspace_members to authenticated/i);
    // A write grant to authenticated would let a teacher join any tenant = breach.
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete)[\s\S]*?on workspace_members to authenticated/i,
    );
  });
  it("the read policy is self-only (teacher_id = auth.uid())", () => {
    expect(sql).toMatch(
      /create policy workspace_members_read on workspace_members\s+for select using \(teacher_id = auth\.uid\(\)\)/i,
    );
  });
});

describe("migration — teachers_update_self pins active_school_id to NULL-or-membership", () => {
  it("adds a WITH CHECK constraining the pointer", () => {
    expect(sql).toMatch(
      /with check \([\s\S]*?active_school_id is null or is_workspace_member\(active_school_id\)/i,
    );
  });
});

describe("migration — RPC execute grants: authenticated only, never anon", () => {
  for (const fn of ["set_active_workspace", "create_workspace", "list_my_workspaces", "redeem_invite"] as const) {
    it(`${fn} is revoked from anon and granted to authenticated`, () => {
      expect(sql).toMatch(
        new RegExp(
          `revoke execute on function ${fn}\\([^)]*\\)\\s+from anon;`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          `grant\\s+execute on function ${fn}\\([^)]*\\)\\s+to authenticated;`,
          "i",
        ),
      );
    });
  }
});

describe("migration — the three new audit_action values are added idempotently", () => {
  for (const v of [
    "workspace_created",
    "active_workspace_changed",
    "workspace_left",
  ]) {
    it(`adds '${v}'`, () => {
      expect(sql).toMatch(
        new RegExp(
          `alter type audit_action add value if not exists '${v}'`,
          "i",
        ),
      );
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// 6. RUNTIME BEHAVIORAL TESTS — need a live Postgres with the migration applied
// + an auth context (auth.uid()). NOT runnable here (no DB harness). Enumerated
// so the intended coverage is on the record.
// ───────────────────────────────────────────────────────────────────────────
describe("multi-workspace RPC runtime behavior (needs a DB harness)", () => {
  it.todo(
    "a NULL active_school_id resolves auth_teacher_school_id() to home (deploy-day no-op)",
  );
  it.todo(
    "a poked/foreign active_school_id (not a membership) resolves back to home, never widens scope",
  );
  it.todo(
    "set_active_workspace rejects a non-member target and never repoints the pointer",
  );
  it.todo(
    "create_workspace mints a full isolated tenant graph and switches the caller to it",
  );
  it.todo("create_workspace rejects at the anti-abuse cap (check_violation)");
  it.todo(
    "list_my_workspaces returns one row per membership with a correct member_count + is_active",
  );
  it.todo(
    "redeem_invite ADDS a membership without deleting the redeemer's home grants (belong to both)",
  );
  it.todo(
    "a non-member reads NEITHER a foreign workspace's chrome (resolver) NOR its content (no TGA)",
  );
});
