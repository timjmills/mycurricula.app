// Mock fixture: the eight Grade 5 subjects.
// Ported from the design handoff project/data.jsx (SUBJECTS).

import type { Subject, SubjectId } from "../types";

export const SUBJECTS: readonly Subject[] = [
  { id: "math", name: "Math", cls: "math", icon: "Ma" },
  { id: "reading", name: "Reading", cls: "reading", icon: "Re", parent: "literacy" }, // prettier-ignore
  {
    id: "writing",
    name: "Writing",
    cls: "writing",
    icon: "Wr",
    parent: "literacy",
  },
  { id: "grammar", name: "Grammar", cls: "grammar", icon: "Gr", parent: "literacy" }, // prettier-ignore
  { id: "spelling", name: "Spelling", cls: "spelling", icon: "Sp", parent: "literacy" }, // prettier-ignore
  { id: "ufli", name: "UFLI", cls: "ufli", icon: "Uf" },
  { id: "explorers", name: "Explorers", cls: "explorers", icon: "Ex" },
  { id: "sel", name: "SEL", cls: "sel", icon: "Se" },
] as const;

/** Subject lookup by id. */
export const SUBJECT_BY_ID: Record<SubjectId, Subject> = Object.fromEntries(
  SUBJECTS.map((s) => [s.id, s]),
) as Record<SubjectId, Subject>;
