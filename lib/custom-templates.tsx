"use client";

// custom-templates.tsx — teacher-created lesson-flow templates.
//
// The 15 built-in templates (lib/lesson-templates.ts) are read-only.
// A teacher can also build their own custom lesson flow — or duplicate a
// built-in and edit it. Those custom templates live here, persisted to
// localStorage (this is a frontend prototype — no backend yet).
//
// A custom template has the same shape as a built-in `LessonTemplate`;
// its id is prefixed `custom-` so the two are easy to tell apart.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { LessonTemplate, LessonTemplateSection } from "./lesson-templates";

/** True when a template id belongs to a teacher-created custom template. */
export function isCustomTemplateId(id: string): boolean {
  return id.startsWith("custom-");
}

/** A blank section with a freshly generated id. */
export function newTemplateSection(
  label = "",
  prompt = "",
): LessonTemplateSection {
  return {
    id: `sec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    label,
    prompt,
  };
}

interface CustomTemplatesValue {
  /** The teacher's custom templates (built-ins are not included). */
  templates: LessonTemplate[];
  /**
   * Create a new custom template. Pass a seed (e.g. a duplicated built-in)
   * to copy its name/sections. Returns the new template's id.
   */
  create: (seed?: Partial<LessonTemplate>) => string;
  update: (id: string, patch: Partial<LessonTemplate>) => void;
  remove: (id: string) => void;
  /** Look up one custom template by id. */
  getById: (id: string) => LessonTemplate | undefined;
  /** False until localStorage has been read — guards against an SSR flash. */
  hydrated: boolean;
}

const CustomTemplatesContext = createContext<CustomTemplatesValue | null>(null);

/** Access the teacher's custom lesson-flow templates. */
export function useCustomTemplates(): CustomTemplatesValue {
  const ctx = useContext(CustomTemplatesContext);
  if (!ctx) {
    throw new Error(
      "useCustomTemplates must be used within a <CustomTemplatesProvider>",
    );
  }
  return ctx;
}

const STORAGE_KEY = "mycurricula:custom-templates";

/** Hosts the teacher's custom templates and persists them to localStorage. */
export function CustomTemplatesProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [templates, setTemplates] = useState<LessonTemplate[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as LessonTemplate[];
        if (Array.isArray(saved)) setTemplates(saved);
      }
    } catch {
      // Corrupt or unavailable storage — start with no custom templates.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
    } catch {
      // Storage unavailable — custom templates simply aren't persisted.
    }
  }, [hydrated, templates]);

  const create = useCallback((seed?: Partial<LessonTemplate>): string => {
    const id = `custom-${Date.now().toString(36)}`;
    const template: LessonTemplate = {
      id,
      name: seed?.name ? `${seed.name} (copy)` : "Untitled template",
      description: seed?.description ?? "",
      fit: seed?.fit ?? "",
      // Copy seed sections with fresh ids so edits never alias the original.
      sections:
        seed?.sections && seed.sections.length > 0
          ? seed.sections.map((s) => newTemplateSection(s.label, s.prompt))
          : [newTemplateSection("Section 1", "")],
    };
    setTemplates((prev) => [...prev, template]);
    return id;
  }, []);

  const update = useCallback((id: string, patch: Partial<LessonTemplate>) => {
    setTemplates((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const getById = useCallback(
    (id: string) => templates.find((t) => t.id === id),
    [templates],
  );

  const value = useMemo<CustomTemplatesValue>(
    () => ({ templates, create, update, remove, getById, hydrated }),
    [templates, create, update, remove, getById, hydrated],
  );

  return (
    <CustomTemplatesContext.Provider value={value}>
      {children}
    </CustomTemplatesContext.Provider>
  );
}
