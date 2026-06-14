"use server";

// app/settings/standards/actions.ts — server actions for the Standards settings.
// Each runs under the authenticated server client; RLS is the real gate:
//   • school_frameworks  — writable only by that school's admins
//     (school_frameworks_admin_write); the action also checks isSchoolAdmin so the
//     UI can show a readable message, but RLS enforces it regardless.
//   • teacher_frameworks — owner-only (teacher_id = auth.uid()); teacher_id is
//     stamped from the SESSION, never from the caller.
// Never throws for user-facing failures — errors come back in `error`.

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getStandardsCaller } from "@/lib/standards/queries";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Add/remove one framework from the SCHOOL default (admin only). */
export async function setSchoolFramework(
  frameworkId: string,
  included: boolean,
): Promise<ActionResult> {
  try {
    const client = await createClient();
    const caller = await getStandardsCaller();
    if (!caller?.schoolId) {
      return { ok: false, error: "No school is associated with your account." };
    }
    if (!caller.isSchoolAdmin) {
      return {
        ok: false,
        error: "Only a school admin can change the school's default frameworks.",
      };
    }
    if (included) {
      const { error } = await client
        .from("school_frameworks")
        .upsert(
          { school_id: caller.schoolId, framework_id: frameworkId },
          { onConflict: "school_id,framework_id" },
        );
      if (error) return { ok: false, error: "Could not add the framework." };
    } else {
      const { error } = await client
        .from("school_frameworks")
        .delete()
        .eq("school_id", caller.schoolId)
        .eq("framework_id", frameworkId);
      if (error) return { ok: false, error: "Could not remove the framework." };
    }
    revalidatePath("/settings/standards");
    return { ok: true };
  } catch {
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Set the caller's personal override for one framework.
 *  "enabled"  → personally ADD (on top of the school default)
 *  "disabled" → personally REMOVE a school-default framework for myself
 *  "default"  → clear the override (back to the school default for this one) */
export async function setTeacherFrameworkOverride(
  frameworkId: string,
  state: "enabled" | "disabled" | "default",
): Promise<ActionResult> {
  try {
    const client = await createClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated." };
    if (state === "default") {
      const { error } = await client
        .from("teacher_frameworks")
        .delete()
        .eq("teacher_id", user.id)
        .eq("framework_id", frameworkId);
      if (error) return { ok: false, error: "Could not reset the framework." };
    } else {
      const { error } = await client.from("teacher_frameworks").upsert(
        {
          teacher_id: user.id,
          framework_id: frameworkId,
          enabled: state === "enabled",
        },
        { onConflict: "teacher_id,framework_id" },
      );
      if (error) return { ok: false, error: "Could not save your change." };
    }
    revalidatePath("/settings/standards");
    return { ok: true };
  } catch {
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
