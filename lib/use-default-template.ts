"use client";

// use-default-template — USER-scoped preference for which lesson-flow
// template new lessons start from.
//
// The onboarding wizard collects this choice (lib/onboarding-state.tsx,
// "lesson-template" step) but until this hook existed the choice was
// locked inside the wizard's resumable state — there was no way to
// revisit it. Settings → Lesson templates now exposes "Set as default"
// on every built-in and custom template, persisting here.
//
// ONE-TIME MIGRATION: when no value is stored yet, the post-mount sync
// reads the wizard's persisted state (`mycurricula:onboarding` →
// data.defaultTemplateId) so a teacher's onboarding choice carries over
// the first time they open the settings page. The migrated value is
// written back so later reads never depend on the wizard state again.
//
// SSR-safe pattern mirrors `lib/use-school-week.ts`:
//   1. Initial state is the SSR default (DEFAULT_LESSON_TEMPLATE_ID).
//   2. A post-mount effect syncs from localStorage (with the migration).
//   3. A `storage` event listener picks up changes from other tabs.

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_LESSON_TEMPLATE_ID } from "@/lib/lesson-templates";

/**
 * localStorage key. USER-scoped — the default template is a personal
 * authoring preference, not a team-shared setting. Migrates to the
 * teacher's preferences row when Supabase lands.
 */
const STORAGE_KEY = "mycurricula:user:default-template-id";

/** The onboarding wizard's resumable state (see lib/onboarding-state.tsx). */
const ONBOARDING_KEY = "mycurricula:onboarding";

/** Read the wizard's collected defaultTemplateId, if any. */
function readOnboardingDefault(): string | null {
  try {
    const raw = window.localStorage.getItem(ONBOARDING_KEY);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      "data" in parsed &&
      parsed.data &&
      typeof parsed.data === "object" &&
      "defaultTemplateId" in parsed.data &&
      typeof parsed.data.defaultTemplateId === "string" &&
      parsed.data.defaultTemplateId !== ""
    ) {
      return parsed.data.defaultTemplateId;
    }
  } catch {
    // Malformed / storage disabled — no migration source.
  }
  return null;
}

/**
 * Returns the teacher's default lesson-template id plus a setter.
 *
 * The id may name a built-in (lib/lesson-templates.ts) or a custom
 * template (lib/custom-templates.tsx). Consumers resolving the id should
 * fall back to DEFAULT_LESSON_TEMPLATE_ID when the id no longer exists
 * (e.g. the custom template was deleted).
 */
export function useDefaultTemplate(): {
  defaultTemplateId: string;
  setDefaultTemplateId: (id: string) => void;
} {
  // SSR-safe default — never read storage during the initial render.
  const [defaultTemplateId, setState] = useState<string>(
    DEFAULT_LESSON_TEMPLATE_ID,
  );

  // Post-mount: stored value wins; otherwise migrate the wizard's choice.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored != null && stored !== "") {
        setState(stored);
        return;
      }
      const migrated = readOnboardingDefault();
      if (migrated != null) {
        setState(migrated);
        window.localStorage.setItem(STORAGE_KEY, migrated);
      }
    } catch {
      // Storage disabled — keep the built-in default.
    }
  }, []);

  // Cross-tab sync.
  useEffect(() => {
    const handler = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEY) return;
      setState(
        e.newValue != null && e.newValue !== ""
          ? e.newValue
          : DEFAULT_LESSON_TEMPLATE_ID,
      );
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const setDefaultTemplateId = useCallback((id: string): void => {
    if (!id) return;
    setState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Storage disabled — state still updates in-memory for this tab.
    }
  }, []);

  return { defaultTemplateId, setDefaultTemplateId };
}
