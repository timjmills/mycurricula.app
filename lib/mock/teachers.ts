// Mock fixture: the Grade 5 teaching team.
// Ported from the design handoff project/data.jsx (TEACHERS / ME).

import type { Teacher } from "../types";

export const TEACHERS: readonly Teacher[] = [
  { id: "lh", name: "Lena Haddad", initials: "LH", role: "lead" },
  { id: "sk", name: "Sarah Khouri", initials: "SK", role: "teacher" },
  { id: "ma", name: "Maya Al-Rashid", initials: "MA", role: "teacher" },
  { id: "jd", name: "Jonas Delacroix", initials: "JD", role: "teacher" },
  { id: "om", name: "Omar Bishara", initials: "OM", role: "lead" },
] as const;

/** Teacher lookup by id. */
export const TEACHER_BY_ID: Record<string, Teacher> = Object.fromEntries(
  TEACHERS.map((t) => [t.id, t]),
);

/** The signed-in teacher (Lena). */
export const ME: Teacher = TEACHERS[0];
