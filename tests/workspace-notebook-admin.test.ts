import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

// ───────────────────────────────────────────────────────────────────────────
// Tests for the Wave W-B admin migration
// (supabase/migrations/20260606160000_workspace_notebook_admin.sql).
//
// THE HONEST LIMITATION: this repo has NO database test harness — the existing
// vitest suite (claude-bypass / sanitize-html / week-order) exercises pure TS
// only; nothing spins up Postgres, and CI runs against throwaway localhost keys
// with the tables unwired (see lib/teach/queries.ts isSupabaseConfigured). The
// security-critical RUNTIME behaviors of these SECURITY DEFINER RPCs — a
// non-admin caller being rejected, a cross-workspace target rejected, the
// last-lead / last-admin guards firing, create_notebook seeding exactly the 8
// subjects + creator lead TGA/STM, set_member_role flipping STM — can only be
// asserted against a live Postgres with the migrations applied + an auth
// context (auth.uid()). Those are enumerated as `it.todo` in the final block so
// the intended coverage is on the record and ready to wire when a DB harness
// (pgTAP / a supabase test container / an integration runner) lands.
//
// What CAN run here today: static invariant checks over the migration TEXT,
// which lock in the load-bearing guarantees (capability checks, the role→STM
// mapping, the guards, the exact 8-subject seed, SECURITY DEFINER + search_path
// hardening, and the execute-grant posture) so a future edit that silently
// drops one of them fails CI. This is a guardrail, NOT a substitute for the
// behavioral DB tests above.
// ───────────────────────────────────────────────────────────────────────────

const MIGRATION_PATH = join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260606160000_workspace_notebook_admin.sql",
);
const sql = readFileSync(MIGRATION_PATH, "utf8");

// The six security-critical RPCs (grant/revoke counted as one family below).
const RPCS = [
  "create_notebook",
  "rename_notebook",
  "archive_notebook",
  "set_member_role",
  "remove_member",
  "grant_workspace_admin",
  "revoke_workspace_admin",
] as const;

/** Extract a single function body block `create or replace function NAME ... $$;`. */
function fnBody(name: string): string {
  const re = new RegExp(
    `create or replace function ${name}\\b[\\s\\S]*?\\$\\$;`,
    "i",
  );
  const m = sql.match(re);
  expect(m, `function ${name} should be defined`).not.toBeNull();
  return m![0];
}

describe("W-B migration — every admin RPC is SECURITY DEFINER + search_path pinned", () => {
  for (const fn of RPCS) {
    it(`${fn} is security definer with set search_path = public`, () => {
      const body = fnBody(fn);
      expect(body).toMatch(/security definer/i);
      expect(body).toMatch(/set search_path = public/i);
    });

    it(`${fn} guards against a null auth.uid()`, () => {
      const body = fnBody(fn);
      // Every RPC must fail closed when unauthenticated (SECURITY DEFINER would
      // otherwise run with NULL actor and bypass RLS).
      expect(body).toMatch(/if v_uid is null then/i);
    });

    it(`${fn} performs a server-side capability re-check (is_school_admin / is_grade_lead)`, () => {
      const body = fnBody(fn);
      expect(body).toMatch(/is_school_admin\(|is_grade_lead\(/);
    });

    it(`${fn} audits via log_audit_event`, () => {
      const body = fnBody(fn);
      expect(body).toMatch(/log_audit_event\(/);
    });
  }
});

describe("W-B migration — capability tier per RPC", () => {
  it("create_notebook + archive_notebook are workspace-admin ONLY (no lead fallback)", () => {
    for (const fn of ["create_notebook", "archive_notebook"] as const) {
      const body = fnBody(fn);
      expect(body).toMatch(/is_school_admin\(/);
      // Must NOT accept a notebook-lead for these workspace-level acts.
      expect(body).not.toMatch(/is_grade_lead\(/);
    }
  });

  it("grant/revoke_workspace_admin are workspace-admin ONLY", () => {
    for (const fn of [
      "grant_workspace_admin",
      "revoke_workspace_admin",
    ] as const) {
      const body = fnBody(fn);
      expect(body).toMatch(/is_school_admin\(/);
      expect(body).not.toMatch(/is_grade_lead\(/);
    }
  });

  it("rename/set_member_role/remove_member accept workspace-admin OR notebook-lead", () => {
    for (const fn of [
      "rename_notebook",
      "set_member_role",
      "remove_member",
    ] as const) {
      const body = fnBody(fn);
      expect(body).toMatch(
        /is_school_admin\([\s\S]*?or[\s\S]*?is_grade_lead\(/i,
      );
    }
  });
});

describe("W-B migration — cross-workspace isolation", () => {
  it("notebook RPCs pin the grade to the caller's own workspace", () => {
    for (const fn of [
      "rename_notebook",
      "archive_notebook",
      "set_member_role",
      "remove_member",
    ] as const) {
      const body = fnBody(fn);
      // grade_levels lookup is constrained to auth_teacher_school_id().
      expect(body).toMatch(/g\.school_id = auth_teacher_school_id\(\)/i);
    }
  });

  it("member/admin RPCs reject a target teacher in a different workspace", () => {
    for (const fn of [
      "set_member_role",
      "remove_member",
      "grant_workspace_admin",
    ] as const) {
      const body = fnBody(fn);
      // target school must match the caller's school.
      expect(body).toMatch(/v_target_school is distinct from v_school_id/i);
    }
  });
});

describe("W-B migration — role → STM mapping mirrors redeem_invite (R2)", () => {
  it("set_member_role computes can_edit_master = role in (lead, grade_admin)", () => {
    const body = fnBody("set_member_role");
    expect(body).toMatch(
      /v_can_edit\s*:=\s*\(p_role in \('lead',\s*'grade_admin'\)\)/i,
    );
    // STM upsert writes the explicit flag (never relies on the column default).
    expect(body).toMatch(/can_edit_master\)/);
    expect(body).toMatch(/scope = 'team'/);
  });

  it("create_notebook gives the creator self STM can_edit_master=true (lead case)", () => {
    const body = fnBody("create_notebook");
    // Self STM insert selects literal `true` for the 8 new subjects.
    expect(body).toMatch(
      /insert into subject_team_memberships[\s\S]*?select s\.id, v_uid, true/i,
    );
  });
});

describe("W-B migration — grade_admin assignment is workspace-admin-only (no lead escalation)", () => {
  it("set_member_role refuses 'grade_admin' from a non-admin (notebook-lead)", () => {
    const body = fnBody("set_member_role");
    // The caller's admin status is captured and the grade_admin grant is gated
    // on it (a lead may assign teacher/lead only).
    expect(body).toMatch(/v_is_admin\s*:=\s*is_school_admin\(v_school_id\)/i);
    expect(body).toMatch(/p_role = 'grade_admin' and not v_is_admin/i);
    expect(body).toMatch(
      /only a workspace admin may assign the grade_admin role/i,
    );
  });
});

describe("W-B migration — last-lead / last-admin guards", () => {
  it("set_member_role refuses demoting the last lead/grade_admin", () => {
    const body = fnBody("set_member_role");
    expect(body).toMatch(
      /v_was_lead and p_role not in \('lead', 'grade_admin'\)/i,
    );
    expect(body).toMatch(/cannot demote the last lead/i);
  });

  it("remove_member refuses removing the last lead/grade_admin", () => {
    const body = fnBody("remove_member");
    expect(body).toMatch(/cannot remove the last lead/i);
  });

  it("revoke_workspace_admin refuses removing the last workspace admin", () => {
    const body = fnBody("revoke_workspace_admin");
    expect(body).toMatch(/cannot revoke the last workspace admin/i);
    // The count excludes the target + nulls.
    expect(body).toMatch(/teacher_id is distinct from p_teacher_id/i);
  });

  it("the guards serialize via a transaction-scoped advisory lock", () => {
    for (const fn of [
      "set_member_role",
      "remove_member",
      "revoke_workspace_admin",
    ] as const) {
      expect(fnBody(fn)).toMatch(/pg_advisory_xact_lock\(/i);
    }
  });
});

describe("W-B migration — create_notebook seeds EXACTLY the 8 locked subjects (provisioning parity)", () => {
  const body = fnBody("create_notebook");

  // The exact 8 (name, color, order) tuples — must match
  // provision_individual_workspace / supabase/seed.sql byte-for-byte.
  const EXPECTED: Array<[string, string, number]> = [
    ["Math", "math", 0],
    ["Reading", "reading", 1],
    ["Writing", "writing", 2],
    ["Grammar", "grammar", 3],
    ["Spelling", "spelling", 4],
    ["UFLI", "ufli", 5],
    ["Explorers", "explorers", 6],
    ["SEL", "sel", 7],
  ];

  for (const [name, color, order] of EXPECTED) {
    it(`seeds ${name} (color '${color}', order ${order}) as a team subject`, () => {
      // e.g. `(v_grade_id, 'Math', 'math', 0, 'team', 'synchronized')`
      const re = new RegExp(
        `'${name}',\\s*'${color}',\\s*${order},\\s*'team',\\s*'synchronized'`,
      );
      expect(body).toMatch(re);
    });
  }

  it("seeds exactly 8 subject value tuples (no more, no fewer)", () => {
    const insertBlock = body.match(/insert into subjects \([\s\S]*?;/i);
    expect(insertBlock).not.toBeNull();
    const teamTuples = insertBlock![0].match(/'team',\s*'synchronized'/g) ?? [];
    expect(teamTuples.length).toBe(8);
  });

  it("grants the creator a TGA 'lead' for the new notebook", () => {
    expect(body).toMatch(
      /insert into teacher_grade_assignments[\s\S]*?values \(v_uid, v_grade_id, 'lead'\)/i,
    );
  });
});

describe("W-B migration — remove_member retains personal forks", () => {
  const body = fnBody("remove_member");

  it("deletes TGA + STM for the grade", () => {
    expect(body).toMatch(/delete from teacher_grade_assignments/i);
    expect(body).toMatch(/delete from subject_team_memberships/i);
  });

  it("never deletes personal_core_lesson_event_copies or personal_authored_lessons", () => {
    expect(body).not.toMatch(/delete from personal_core_lesson_event_copies/i);
    expect(body).not.toMatch(/delete from personal_authored_lessons/i);
  });

  it("does not touch the workspace seat ledger (team_memberships) — documented scope", () => {
    // remove_member manages notebook (TGA/STM) membership only; seat release is
    // the team/seat flow's job.
    expect(body).not.toMatch(/delete from team_memberships/i);
  });
});

describe("W-B migration — archive is a soft archive (never a delete)", () => {
  it("archive_notebook sets is_active=false and never deletes the grade", () => {
    const body = fnBody("archive_notebook");
    expect(body).toMatch(/set is_active = false/i);
    expect(body).not.toMatch(/delete from grade_levels/i);
  });
});

describe("W-B migration — founding-owner workspace-admin seeding (activate dormant tier)", () => {
  it("backfills a school_admins row for every team owner, idempotently", () => {
    expect(sql).toMatch(/insert into school_admins[\s\S]*?from teams t/i);
    // Guarded by NOT EXISTS (school_admins has no unique key) → re-run-safe.
    expect(sql).toMatch(/not exists\s*\([\s\S]*?from school_admins sa/i);
    // Scoped to OWNERS only (never a plain member).
    expect(sql).toMatch(/t\.owner_teacher_id/i);
  });
});

describe("W-B migration — execute grants (authenticated only; never anon)", () => {
  for (const fn of RPCS) {
    it(`${fn} is revoked from anon and granted to authenticated`, () => {
      const grantRe = new RegExp(
        `revoke execute on function ${fn}\\([^)]*\\) from anon;`,
        "i",
      );
      const authRe = new RegExp(
        `grant\\s+execute on function ${fn}\\([^)]*\\) to authenticated;`,
        "i",
      );
      expect(sql).toMatch(grantRe);
      expect(sql).toMatch(authRe);
    });
  }
});

describe("W-B migration — audit_action enum values added idempotently", () => {
  const ADDED = [
    "notebook_created",
    "notebook_renamed",
    "notebook_archived",
    "member_role_set",
    "member_removed",
    "workspace_admin_granted",
    "workspace_admin_revoked",
  ];
  for (const v of ADDED) {
    it(`adds '${v}' via ALTER TYPE ... ADD VALUE IF NOT EXISTS`, () => {
      const re = new RegExp(
        `alter type audit_action add value if not exists '${v}'`,
        "i",
      );
      expect(sql).toMatch(re);
    });
  }
});

// ───────────────────────────────────────────────────────────────────────────
// RUNTIME BEHAVIORAL TESTS — require a live Postgres with the migrations applied
// + an auth context (auth.uid()). NOT runnable in this repo today (no DB
// harness). Enumerated so the intended coverage is on the record.
// ───────────────────────────────────────────────────────────────────────────
describe("W-B RPC runtime behavior (needs a DB harness — see file header)", () => {
  it.todo(
    "non-admin caller cannot call create/archive_notebook or grant/revoke_workspace_admin",
  );
  it.todo(
    "a plain teacher (non-lead, non-admin) cannot call rename/set_member_role/remove_member",
  );
  it.todo(
    "a target teacher in a different workspace is rejected by set_member_role/remove_member/grant_workspace_admin",
  );
  it.todo(
    "set_member_role refuses demoting the only lead; succeeds when another lead exists",
  );
  it.todo(
    "remove_member refuses removing the only lead; retains the removed teacher's personal forks",
  );
  it.todo("revoke_workspace_admin refuses revoking the only workspace admin");
  it.todo(
    "create_notebook creates a grade + exactly the 8 locked subjects + creator lead TGA + self STM (can_edit_master=true)",
  );
  it.todo(
    "set_member_role upserts the TGA role and flips STM can_edit_master true for lead, false for teacher",
  );
  it.todo("create_notebook refuses a workspace with no active school_year");
  it.todo("every RPC writes an audit_log row scoped to the caller's workspace");
});
