// lib/subjects/sharing-view.ts — PURE view logic for the manage-sharing card.
//
// No React, no server imports: this module is safe to load anywhere (client,
// tests) and carries the Course-sharing card's non-trivial view transforms so
// they are unit-testable without a render. The card
// (components/settings/course-sharing-manager.tsx) consumes all three:
//   • joinSharingRows — joins the gated sharing state (CourseSharingState[])
//     onto the ordinary course list's display identity (name + color slug) by
//     subjects-row id, with a scope-aware name fallback for courses the caller
//     can't SEE via the RLS-scoped list.
//   • applyOptimisticFlip — the post-mutation optimistic state transform (flip
//     the acting row locally for instant feedback; a background reconcile
//     corrects any drift).
//   • inverseDirection — the share ⇄ unshare inverse the ConsequenceToast's
//     Undo runs.

import type { SubjectId } from "../types";
import type { CourseSharingState } from "./row";

/** A course's display identity (name + color slug), resolved from the ordinary
 *  grade course list and joined onto the gated sharing state by subjects-row id. */
export interface CourseMeta {
  name: string;
  slug: SubjectId;
}

/** A display row for the manage-sharing list: the sharing state plus its
 *  resolved (or fallen-back) display identity. */
export interface SharingDisplayRow {
  state: CourseSharingState;
  name: string;
  /** Resolved subject slug (drives the color swatch); null ⇒ neutral swatch. */
  slug: SubjectId | null;
}

/** The two sharing mutations. Undo runs the inverse (see inverseDirection). */
export type SharingDirection = "share" | "unshare";

/** Join sharing state ⇄ course meta (name + color) into display rows. Pure —
 *  one row per sharing entry, input order preserved, inputs untouched. */
export function joinSharingRows(
  sharing: readonly CourseSharingState[],
  metaById: ReadonlyMap<string, CourseMeta>,
): SharingDisplayRow[] {
  return sharing.map((s) => {
    const meta = metaById.get(s.subjectId);
    return {
      state: s,
      // Fallback keeps an admin-managed course the caller can't SEE via the
      // ordinary (RLS-scoped) list from rendering a bare uuid.
      name:
        meta?.name ?? (s.scope === "team" ? "Shared course" : "Personal course"),
      slug: meta?.slug ?? null,
    };
  });
}

/** Flip the acting row after a confirmed mutation. Pure + immutable: returns a
 *  new array; non-target rows pass through by reference. share ⇒ the course
 *  reads as team, contributed by the actor, reclaimable; unshare ⇒ personal
 *  again with no contributor NAME shown (sharedByTeacherId / sharedFromPersonal
 *  are deliberately left as-is — the background reconcile refreshes them). */
export function applyOptimisticFlip(
  list: readonly CourseSharingState[],
  id: string,
  dir: SharingDirection,
  actor: { id: string | null; name: string },
): CourseSharingState[] {
  return list.map((s) => {
    if (s.subjectId !== id) return s;
    if (dir === "share") {
      return {
        ...s,
        scope: "team",
        sharedFromPersonal: true,
        sharedByTeacherId: actor.id,
        sharedByName: actor.name,
        canShare: false,
        canUnshare: true,
      };
    }
    return {
      ...s,
      scope: "personal",
      sharedByName: null,
      canShare: true,
      canUnshare: false,
    };
  });
}

/** The inverse mutation — what the toast's Undo runs. */
export function inverseDirection(dir: SharingDirection): SharingDirection {
  return dir === "share" ? "unshare" : "share";
}
