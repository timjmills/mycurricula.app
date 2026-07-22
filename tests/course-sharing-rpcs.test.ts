import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import {
  canShareCourse,
  canUnshareCourse,
  reclaimTargetId,
  type ShareCourseContext,
  type UnshareCourseContext,
} from "../lib/subjects/authz";
import {
  mapCourseRow,
  mapCourseSharingRow,
  resolveSubjectSlug,
  SUBJECT_ROW_COLUMNS,
  type CourseSharingRow,
  type SubjectRow,
} from "../lib/subjects/row";

// ───────────────────────────────────────────────────────────────────────────
// Wave 12b-1 phase (i): per-course sharing seam.
//
// TWO test targets, per the same HONEST LIMITATION as
// workspace-notebook-admin.test.ts: this repo has NO database harness, so the
// SECURITY DEFINER RPCs' runtime behavior can only be asserted against a live
// Postgres (enumerated as `it.todo` below). What CAN run here:
//   1. The PURE authorization mirror (lib/subjects/authz.ts) — the executable
//      authorization matrix (incl. the reclaim-target orphan exclusion).
//   2. The PURE row mappers (lib/subjects/row.ts) + the leak-free projection.
//   3. Static invariant checks over the migration TEXT (as the admin test does),
//      so a future edit that silently drops a guard fails CI.
// ───────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// 1. AUTHORIZATION MATRIX — canShareCourse (mirror of share_course)
// ---------------------------------------------------------------------------
const shareBase: ShareCourseContext = {
  callerId: "teacher-1",
  scope: "personal",
  ownerId: "teacher-1",
  callerIsSchoolAdmin: false,
  callerCanReadGrade: true,
};

describe("canShareCourse — authorization matrix", () => {
  it("OWNER can share their own personal course", () => {
    expect(canShareCourse(shareBase)).toEqual({ allowed: true });
  });

  it("SCHOOL ADMIN can share another teacher's personal course", () => {
    expect(
      canShareCourse({
        ...shareBase,
        callerId: "admin",
        ownerId: "teacher-1",
        callerIsSchoolAdmin: true,
      }),
    ).toEqual({ allowed: true });
  });

  it("a NON-owner, NON-admin teacher canNOT share", () => {
    expect(canShareCourse({ ...shareBase, callerId: "teacher-2" })).toEqual({
      allowed: false,
      reason: "not-owner-or-admin",
    });
  });

  it("an already-team course canNOT be shared again", () => {
    expect(
      canShareCourse({ ...shareBase, scope: "team", ownerId: null }),
    ).toEqual({ allowed: false, reason: "already-team" });
  });

  it("cannot share into a grade the caller cannot read", () => {
    expect(canShareCourse({ ...shareBase, callerCanReadGrade: false })).toEqual(
      { allowed: false, reason: "cannot-read-grade" },
    );
  });

  it("an unauthenticated caller is rejected", () => {
    expect(canShareCourse({ ...shareBase, callerId: "" })).toEqual({
      allowed: false,
      reason: "not-authenticated",
    });
  });

  it("scope is checked before capability (already-team wins over non-owner)", () => {
    expect(
      canShareCourse({
        ...shareBase,
        callerId: "teacher-2",
        scope: "team",
        ownerId: null,
      }),
    ).toEqual({ allowed: false, reason: "already-team" });
  });
});

// ---------------------------------------------------------------------------
// 2. RECLAIM TARGET — reclaimTargetId (mirror of coalesce(v_shared_by, v_uid))
// ---------------------------------------------------------------------------
describe("reclaimTargetId — who an unshare returns the course to", () => {
  it("returns the contributor when present", () => {
    expect(
      reclaimTargetId({ callerId: "admin", sharedByTeacherId: "teacher-1" }),
    ).toBe("teacher-1");
  });
  it("falls back to the caller only if the contributor is gone", () => {
    expect(
      reclaimTargetId({ callerId: "admin", sharedByTeacherId: null }),
    ).toBe("admin");
  });
});

// ---------------------------------------------------------------------------
// 3. AUTHORIZATION MATRIX — canUnshareCourse (mirror of unshare_course)
// ---------------------------------------------------------------------------
// Reclaim authz = the CONTRIBUTOR (shared_by_teacher_id) OR a workspace admin.
// The orphan guard excludes the RECLAIM TARGET (the contributor), not the caller.
const unshareBase: UnshareCourseContext = {
  callerId: "admin",
  scope: "team",
  sharedByTeacherId: "teacher-1",
  callerIsSchoolAdmin: true,
  sharedFromPersonal: true,
  contentTeacherIds: [],
};

describe("canUnshareCourse — authorization matrix", () => {
  it("SCHOOL ADMIN can unshare a shared course with no dependent content", () => {
    expect(canUnshareCourse(unshareBase)).toEqual({ allowed: true });
  });

  it("the CONTRIBUTOR can reclaim their own shared course (no admin rights needed)", () => {
    expect(
      canUnshareCourse({
        ...unshareBase,
        callerId: "teacher-1",
        sharedByTeacherId: "teacher-1",
        callerIsSchoolAdmin: false,
      }),
    ).toEqual({ allowed: true });
  });

  it("a NON-contributor, NON-admin teacher canNOT unshare", () => {
    expect(
      canUnshareCourse({
        ...unshareBase,
        callerId: "teacher-2",
        sharedByTeacherId: "teacher-1",
        callerIsSchoolAdmin: false,
      }),
    ).toEqual({ allowed: false, reason: "not-contributor-or-admin" });
  });

  it("a FOUNDING subject (shared_from_personal=false) canNOT be unshared", () => {
    expect(
      canUnshareCourse({ ...unshareBase, sharedFromPersonal: false }),
    ).toEqual({ allowed: false, reason: "founding-subject" });
  });

  // ── DELETED-CONTRIBUTOR null-safety (Codex R2 High: SQL 3-valued-logic trap) ──
  it("MUST BLOCK: deleted contributor (sharedBy null) + non-admin caller", () => {
    // A random in-grade teacher must NOT be able to claim an orphaned-contributor
    // course. (The SQL guard coalesces `shared_by = uid` to false so NULL never
    // satisfies the caller branch; the TS mirror already denies via the null check.)
    expect(
      canUnshareCourse({
        ...unshareBase,
        callerId: "teacher-2",
        sharedByTeacherId: null,
        callerIsSchoolAdmin: false,
      }),
    ).toEqual({ allowed: false, reason: "not-contributor-or-admin" });
  });

  it("MUST SUCCEED: deleted contributor (sharedBy null) + admin (documented reclaim path)", () => {
    expect(
      canUnshareCourse({
        ...unshareBase,
        callerId: "admin",
        sharedByTeacherId: null,
        callerIsSchoolAdmin: true,
      }),
    ).toEqual({ allowed: true });
  });

  // ── ORPHAN GUARD: excludes the RECLAIM TARGET, not the caller (Codex R1 C) ──
  it("MUST SUCCEED: admin unshare where only the CONTRIBUTOR (reclaim target) has content", () => {
    // The course returns to teacher-1, who keeps visibility — their rows never
    // orphan, so they must NOT block.
    expect(
      canUnshareCourse({ ...unshareBase, contentTeacherIds: ["teacher-1"] }),
    ).toEqual({ allowed: true });
  });

  it("MUST BLOCK: admin unshare where the ADMIN caller has their OWN content", () => {
    // The admin is NOT the reclaim target (teacher-1 is); the admin loses
    // visibility, so their own fork/lesson/completion would orphan → block.
    expect(
      canUnshareCourse({ ...unshareBase, contentTeacherIds: ["admin"] }),
    ).toEqual({ allowed: false, reason: "has-other-teacher-content" });
  });

  it("BLOCKS when a third teacher has content", () => {
    expect(
      canUnshareCourse({
        ...unshareBase,
        contentTeacherIds: ["teacher-1", "teacher-2"],
      }),
    ).toEqual({ allowed: false, reason: "has-other-teacher-content" });
  });

  it("contributor self-unshare is fine even with their own content", () => {
    expect(
      canUnshareCourse({
        ...unshareBase,
        callerId: "teacher-1",
        sharedByTeacherId: "teacher-1",
        callerIsSchoolAdmin: false,
        contentTeacherIds: ["teacher-1"],
      }),
    ).toEqual({ allowed: true });
  });

  it("a personal course canNOT be unshared (not a team course)", () => {
    expect(canUnshareCourse({ ...unshareBase, scope: "personal" })).toEqual({
      allowed: false,
      reason: "not-team",
    });
  });

  it("an unauthenticated caller is rejected", () => {
    expect(canUnshareCourse({ ...unshareBase, callerId: "" })).toEqual({
      allowed: false,
      reason: "not-authenticated",
    });
  });

  it("founding-lock is checked before capability (founding wins over non-admin)", () => {
    expect(
      canUnshareCourse({
        ...unshareBase,
        callerId: "teacher-2",
        sharedByTeacherId: "teacher-1",
        callerIsSchoolAdmin: false,
        sharedFromPersonal: false,
      }),
    ).toEqual({ allowed: false, reason: "founding-subject" });
  });
});

// ---------------------------------------------------------------------------
// 4. ROW MAPPERS (pure) + leak-free projection
// ---------------------------------------------------------------------------
describe("mapCourseRow / resolveSubjectSlug", () => {
  const row: SubjectRow = {
    id: "s1",
    grade_level_id: "g1",
    name: "Math",
    color: "math",
    parent_id: null,
    display_order: 0,
    scope: "team",
    owner_id: null,
  };

  it("maps a subjects row to a CourseSummary (no provenance fields)", () => {
    expect(mapCourseRow(row)).toEqual({
      id: "s1",
      gradeLevelId: "g1",
      name: "Math",
      subjectId: "math",
      parentId: null,
      displayOrder: 0,
      scope: "team",
      ownerId: null,
    });
  });

  it("resolves a known slug, and falls back to 'math' for an unknown one", () => {
    expect(resolveSubjectSlug("explorers")).toBe("explorers");
    expect(resolveSubjectSlug("not-a-subject")).toBe("math");
  });

  it("the ordinary projection NEVER selects contributor identity (leak guard)", () => {
    expect(SUBJECT_ROW_COLUMNS).not.toMatch(/shared_by_teacher_id/);
    expect(SUBJECT_ROW_COLUMNS).not.toMatch(/shared_from_personal/);
  });
});

describe("mapCourseSharingRow — the gated manage-sharing view", () => {
  const row: CourseSharingRow = {
    subject_id: "s1",
    scope: "team",
    shared_from_personal: true,
    shared_by_teacher_id: "teacher-1",
    shared_by_name: "Ada Lovelace",
    can_share: false,
    can_unshare: true,
  };
  it("maps an RPC row to CourseSharingState (provenance-bearing)", () => {
    expect(mapCourseSharingRow(row)).toEqual({
      subjectId: "s1",
      scope: "team",
      sharedFromPersonal: true,
      sharedByTeacherId: "teacher-1",
      sharedByName: "Ada Lovelace",
      canShare: false,
      canUnshare: true,
    });
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
  "20260717120000_course_sharing_rpcs.sql",
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

const RPCS = ["share_course", "unshare_course", "list_course_sharing"] as const;

describe("migration — every RPC is hardened SECURITY DEFINER", () => {
  for (const fn of RPCS) {
    it(`${fn} is security definer with set search_path = public`, () => {
      const body = fnBody(fn);
      expect(body).toMatch(/security definer/i);
      expect(body).toMatch(/set search_path = public/i);
    });
    it(`${fn} fails closed on a null auth.uid()`, () => {
      expect(fnBody(fn)).toMatch(/if v_uid is null then/i);
    });
    it(`${fn} pins the grade/course to the caller's own workspace`, () => {
      expect(fnBody(fn)).toMatch(/school_id = auth_teacher_school_id\(\)/i);
    });
  }
});

describe("migration — concurrency: subject row is locked FOR UPDATE", () => {
  for (const fn of ["share_course", "unshare_course"] as const) {
    it(`${fn} takes SELECT ... FOR UPDATE OF s on the subject row`, () => {
      expect(fnBody(fn)).toMatch(/for update of s/i);
    });
  }
});

describe("migration — share_course (personal → team)", () => {
  const body = fnBody("share_course");
  it("requires the course be personal", () => {
    expect(body).toMatch(/if v_scope <> 'personal' then/i);
  });
  it("capability re-check is the course owner OR a workspace admin, NULL-SAFE", () => {
    expect(body).toMatch(
      /coalesce\(v_owner = v_uid, false\) or is_school_admin\(v_school_id\)/i,
    );
  });
  it("sets scope=team, owner_id=null, shared_from_personal=true, records the contributor", () => {
    expect(body).toMatch(/set\s+scope\s*=\s*'team'/i);
    expect(body).toMatch(/owner_id\s*=\s*null/i);
    expect(body).toMatch(/shared_from_personal\s*=\s*true/i);
    expect(body).toMatch(/shared_by_teacher_id\s*=\s*v_owner/i);
  });
  it("preserves the CONTRIBUTOR's master-edit via a self-STM can_edit_master=true", () => {
    expect(body).toMatch(
      /insert into subject_team_memberships[\s\S]*?can_edit_master/i,
    );
    expect(body).toMatch(/values \(p_subject_id, v_owner, true\)/i);
  });
  it("guards against sharing into an unreadable grade", () => {
    expect(body).toMatch(/if not can_read_grade\(v_grade_id\) then/i);
  });
});

describe("migration — unshare_course (team → personal)", () => {
  const body = fnBody("unshare_course");
  it("requires the course be a team course", () => {
    expect(body).toMatch(/if v_scope <> 'team' then/i);
  });
  it("FOUNDING-LOCK: refuses a course whose shared_from_personal is false", () => {
    expect(body).toMatch(/if not v_shared then/i);
    expect(body).toMatch(/founding team subject and cannot be unshared/i);
  });
  it("capability re-check is the CONTRIBUTOR OR a workspace admin, NULL-SAFE", () => {
    // coalesce guards the three-valued-logic trap: a deleted contributor
    // (shared_by NULL) must not bypass the `if not (...)` guard (Codex R2 High).
    expect(body).toMatch(
      /coalesce\(v_shared_by = v_uid, false\) or is_school_admin\(v_school_id\)/i,
    );
    // Regression: the bare (NULL-unsafe) comparison must NOT be the guard.
    expect(body).not.toMatch(
      /if not \(v_shared_by = v_uid or is_school_admin/i,
    );
  });
  it("guards can_read_grade early (a removed contributor fails cleanly, not late at audit)", () => {
    expect(body).toMatch(/if not can_read_grade\(v_grade_id\) then/i);
  });
  it("computes v_target_owner = coalesce(shared_by, caller) BEFORE the orphan guard", () => {
    const targetIdx = body.search(
      /v_target_owner\s*:=\s*coalesce\(v_shared_by, v_uid\)/i,
    );
    const guardIdx = body.search(/from personal_core_lesson_event_copies/i);
    expect(targetIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(targetIdx).toBeLessThan(guardIdx);
  });
  it("ORPHAN GUARD excludes the RECLAIM TARGET (v_target_owner), not the caller", () => {
    expect(body).toMatch(
      /from personal_core_lesson_event_copies[\s\S]*?p\.teacher_id <> v_target_owner/i,
    );
    expect(body).toMatch(
      /from personal_authored_lessons[\s\S]*?pa\.owner_id <> v_target_owner/i,
    );
    expect(body).toMatch(
      /from completion_status[\s\S]*?c\.teacher_id <> v_target_owner/i,
    );
    // Regression guard: it must NOT exclude the caller (the Codex R1 CRITICAL bug).
    expect(body).not.toMatch(/p\.teacher_id <> v_uid/i);
    expect(body).not.toMatch(/c\.teacher_id <> v_uid/i);
  });
  it("names the blocking teachers (classroom-actionable)", () => {
    expect(body).toMatch(/other teacher\(s\) have work in this course/i);
    expect(body).toMatch(/string_agg\(coalesce\(t\.display_name/i);
  });
  it("returns the course to its contributor (owner := v_target_owner)", () => {
    expect(body).toMatch(/set\s+scope\s*=\s*'personal'/i);
    expect(body).toMatch(/owner_id\s*=\s*v_target_owner/i);
  });
  it("drops stale STM on the now-personal course", () => {
    expect(body).toMatch(
      /delete from subject_team_memberships stm[\s\S]*?stm\.subject_id = p_subject_id/i,
    );
  });
});

describe("migration — list_course_sharing (gated provenance view)", () => {
  const body = fnBody("list_course_sharing");
  it("returns rows ONLY for courses the caller may manage (admin / own personal / own contributed)", () => {
    expect(body).toMatch(/v_is_admin/i);
    expect(body).toMatch(/s\.scope = 'personal' and s\.owner_id = v_uid/i);
    expect(body).toMatch(
      /s\.scope = 'team' and s\.shared_by_teacher_id = v_uid/i,
    );
  });
  it("exposes the can_share / can_unshare affordance flags", () => {
    expect(body).toMatch(/as can_share/i);
    expect(body).toMatch(/as can_unshare/i);
  });
});

describe("migration — schema + enum + hardening + grants", () => {
  it("adds subjects.shared_from_personal additively (IF NOT EXISTS, default false)", () => {
    expect(sql).toMatch(
      /add column if not exists shared_from_personal boolean not null default false/i,
    );
  });
  it("adds subjects.shared_by_teacher_id (contributor FK, on delete set null)", () => {
    expect(sql).toMatch(
      /add column if not exists shared_by_teacher_id uuid[\s\S]*?references teachers\(id\) on delete set null/i,
    );
  });
  it("does NOT backfill existing rows (founding subjects correctly stay false)", () => {
    expect(sql).not.toMatch(/set shared_from_personal = true where/i);
  });
  it("does NOT add a column-level REVOKE (reviewer ruling: within-grade provenance is legitimate)", () => {
    // Match an actual statement (… on subjects from …), not the header prose that
    // explains why the REVOKE was intentionally skipped.
    expect(sql).not.toMatch(
      /revoke select \(shared_by_teacher_id\) on subjects from/i,
    );
  });
  it("adds the two audit_action values idempotently", () => {
    for (const v of ["course_shared", "course_unshared"]) {
      expect(sql).toMatch(
        new RegExp(
          `alter type audit_action add value if not exists '${v}'`,
          "i",
        ),
      );
    }
  });
  for (const fn of RPCS) {
    it(`${fn} is revoked from anon and granted to authenticated only`, () => {
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

// ───────────────────────────────────────────────────────────────────────────
// 6. RUNTIME BEHAVIORAL TESTS — need a live Postgres with the migration applied
// + an auth context (auth.uid()). NOT runnable here (no DB harness). Enumerated
// so the intended coverage is on the record.
// ───────────────────────────────────────────────────────────────────────────
describe("share/unshare RPC runtime behavior (needs a DB harness)", () => {
  it.todo(
    "owner shares own personal course; scope→team, owner_id nulled, shared_by=owner",
  );
  it.todo(
    "admin sharing another teacher's course records THAT teacher as shared_by (not the admin)",
  );
  it.todo(
    "a non-owner/non-admin is rejected by share_course; a non-contributor/non-admin by unshare_course",
  );
  it.todo("a course in a different workspace is not found (cross-tenant pin)");
  it.todo(
    "share_course grants the CONTRIBUTOR a self-STM can_edit_master=true",
  );
  it.todo(
    "the CONTRIBUTOR can reclaim their own shared course via unshare_course",
  );
  it.todo(
    "an admin unshare returns the course to its contributor (shared_by), never to the admin",
  );
  it.todo(
    "unshare succeeds when only the contributor (reclaim target) has content",
  );
  it.todo(
    "unshare BLOCKS when the admin caller (not the target) has their own content",
  );
  it.todo(
    "unshare_course refuses a founding subject (shared_from_personal=false)",
  );
  it.todo(
    "unshare_course names the blocking teachers; caller falls back to owner if contributor deleted",
  );
  it.todo(
    "concurrent share/unshare on the same course serialize via FOR UPDATE (no lost update)",
  );
  it.todo(
    "list_course_sharing returns provenance ONLY for admin / own-personal / own-contributed courses",
  );
  it.todo(
    "a plain teammate cannot read subjects.shared_by_teacher_id (column REVOKE)",
  );
  it.todo(
    "both write RPCs write an audit_log row scoped to the caller's workspace",
  );
});
