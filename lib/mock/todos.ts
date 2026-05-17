// Mock fixture: to-do tags and items.
// Ported from the design handoff project/data.jsx (TAGS / TODOS).

import type { Tag, Todo } from "../types";

export const TAGS: readonly Tag[] = [
  { id: "prep", name: "prep", label: "prep", color: "tag-blue", bg: "color-mix(in oklch, var(--tag-blue) 22%, white)", fg: "var(--tag-blue)" }, // prettier-ignore
  { id: "copies", name: "copies", label: "copies", color: "tag-amber", bg: "color-mix(in oklch, var(--tag-amber) 22%, white)", fg: "var(--tag-amber)" }, // prettier-ignore
  { id: "parents", name: "parents", label: "parents", color: "tag-pink", bg: "color-mix(in oklch, var(--tag-pink) 22%, white)", fg: "var(--tag-pink)" }, // prettier-ignore
  { id: "supplies", name: "supplies", label: "supplies", color: "tag-green", bg: "color-mix(in oklch, var(--tag-green) 22%, white)", fg: "var(--tag-green)" }, // prettier-ignore
  { id: "team", name: "team", label: "team", color: "tag-indigo", bg: "color-mix(in oklch, var(--tag-indigo) 22%, white)", fg: "var(--tag-indigo)" }, // prettier-ignore
  { id: "urgent", name: "urgent", label: "urgent", color: "tag-red", bg: "color-mix(in oklch, var(--tag-red) 22%, white)", fg: "var(--tag-red)" }, // prettier-ignore
  { id: "ideas", name: "ideas", label: "ideas", color: "tag-purple", bg: "color-mix(in oklch, var(--tag-purple) 22%, white)", fg: "var(--tag-purple)" }, // prettier-ignore
] as const;

/** Tag lookup by id. */
export const TAG_BY_ID: Record<string, Tag> = Object.fromEntries(
  TAGS.map((t) => [t.id, t]),
);

export const TODOS: readonly Todo[] = [
  { id: "t1", scope: "personal", title: "Print List 12 spelling for Mon", tags: ["copies"], due: "today", done: false, linked: "spelling/u-s4" }, // prettier-ignore
  { id: "t2", scope: "personal", title: "Email Aya's mum re. samosas Wed", tags: ["parents"], due: "today", done: false }, // prettier-ignore
  { id: "t3", scope: "personal", title: "Photocopy fraction strips ×26", tags: ["copies", "prep"], due: "today", done: true }, // prettier-ignore
  { id: "t4", scope: "personal", title: "Pull aside Tariq for reading conf.", tags: [], due: "tomorrow", done: false }, // prettier-ignore
  { id: "t5", scope: "personal", title: "Update narrative rubric in Drive", tags: ["prep"], due: null, done: false }, // prettier-ignore
  { id: "t6", scope: "personal", title: "Grab clipboards from storage", tags: ["supplies"], due: "today", done: false }, // prettier-ignore
  { id: "t7", scope: "team", title: "Decide Tuesday assembly seating", tags: ["team", "urgent"], due: "today", done: false, assignee: "om", author: "om" }, // prettier-ignore
  { id: "t8", scope: "team", title: "Order more cartouche strips", tags: ["team", "supplies"], due: "thisweek", done: false, assignee: "lh", author: "om" }, // prettier-ignore
  { id: "t9", scope: "team", title: "Review Unit 3 Math summative items", tags: ["team", "prep"], due: "thisweek", done: true, completedBy: "sk", author: "lh" }, // prettier-ignore
  { id: "t10", scope: "team", title: "Confirm field trip dates w/ office", tags: ["team", "parents"], due: null, done: false, assignee: "sk", author: "om" }, // prettier-ignore
  { id: "t11", scope: "team", title: "Norms doc — short revisit", tags: ["team", "ideas"], due: "thismonth", done: false, author: "lh" }, // prettier-ignore
] as const;
