"use server";

// lib/subjects/actions.ts — the SERVER bridge for the per-course sharing seam.
//
// The subjects source (lib/subjects/source.ts) reads under RLS and calls the
// SECURITY DEFINER share/unshare RPCs; it depends on the per-request server
// client (next/headers), so it is server-only and cannot be bundled into a client
// component. Client code reaches it through these EXPLICIT, NAMED server actions —
// deliberately NOT a generic method-dispatch: the only operations exposed are
// list / share / unshare, so there is no attacker-controlled method name and no
// generic RPC passthrough.
//
// ENVELOPE (mirrors lib/teach/actions.ts): a Server Action that THROWS has its
// error redacted by Next.js before it reaches the client. We instead RESOLVE with
// a discriminated envelope so an operational failure travels as DATA and never
// leaks a DB/RLS internal — every unexpected error collapses to a generic message
// and is logged server-side.
//
// Gating: sharing operates on planner-domain rows (subjects), so it shares the
// planner's Supabase switch (isPlannerSupabaseConfigured — NEXT_PUBLIC_PLANNER_
// USE_SUPABASE=1 with a real project). When the backend is off (prototype / CI),
// the list returns empty and a share/unshare returns a friendly error rather than
// hitting throwaway localhost keys.

import { sb } from "../supabase/helpers";
import { isPlannerSupabaseConfigured } from "../planner/source";
import {
  listCourseSharing,
  listSubjectsForGrade,
  shareCourse,
  unshareCourse,
} from "./source";
import type { CourseSharingState, CourseSummary } from "./row";

/** Discriminated result envelope for the subjects actions. */
export type SubjectsActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { message: string } };

/** Opaque message for any unexpected error, so DB/RLS internals never cross the
 *  boundary. */
const GENERIC_ERROR = "That didn't work — please try again.";

/** Message when the backend isn't wired (prototype / CI). */
const BACKEND_OFF = "Course sharing isn't available yet.";

/** List every course in a grade the caller can see (empty when the backend is
 *  off). Read-only; safe to call from any authed surface. */
export async function listSubjectsForGradeAction(
  gradeLevelId: string,
): Promise<SubjectsActionResult<CourseSummary[]>> {
  if (!isPlannerSupabaseConfigured()) return { ok: true, value: [] };
  try {
    const client = await sb();
    const value = await listSubjectsForGrade(client, gradeLevelId);
    return { ok: true, value };
  } catch (e) {
    console.error("listSubjectsForGradeAction failed:", e);
    return { ok: false, error: { message: GENERIC_ERROR } };
  }
}

/** Manage-sharing view: the sharing state + affordance flags for courses the
 *  caller may manage in a grade (empty when the backend is off). Provenance is
 *  gated server-side by the list_course_sharing RPC. */
export async function listCourseSharingAction(
  gradeLevelId: string,
): Promise<SubjectsActionResult<CourseSharingState[]>> {
  if (!isPlannerSupabaseConfigured()) return { ok: true, value: [] };
  try {
    const client = await sb();
    const value = await listCourseSharing(client, gradeLevelId);
    return { ok: true, value };
  } catch (e) {
    console.error("listCourseSharingAction failed:", e);
    return { ok: false, error: { message: GENERIC_ERROR } };
  }
}

/** Share a personal course with the team. */
export async function shareCourseAction(
  subjectId: string,
): Promise<SubjectsActionResult<void>> {
  if (!isPlannerSupabaseConfigured()) {
    return { ok: false, error: { message: BACKEND_OFF } };
  }
  try {
    const client = await sb();
    await shareCourse(client, subjectId);
    return { ok: true, value: undefined };
  } catch (e) {
    console.error("shareCourseAction failed:", e);
    return { ok: false, error: { message: GENERIC_ERROR } };
  }
}

/** Reclaim a shared course back to personal. */
export async function unshareCourseAction(
  subjectId: string,
): Promise<SubjectsActionResult<void>> {
  if (!isPlannerSupabaseConfigured()) {
    return { ok: false, error: { message: BACKEND_OFF } };
  }
  try {
    const client = await sb();
    await unshareCourse(client, subjectId);
    return { ok: true, value: undefined };
  } catch (e) {
    console.error("unshareCourseAction failed:", e);
    return { ok: false, error: { message: GENERIC_ERROR } };
  }
}
