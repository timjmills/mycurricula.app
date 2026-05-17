"use client";

// lesson-templates-manager.tsx — Settings → Lesson templates page content.
//
// Layout, top to bottom:
//   • Breadcrumb + page heading
//   • Built-in templates  — 15 read-only cards in a grid.
//   • Your templates      — teacher-created custom templates.
//   • Editor panel        — appears below the lists when a custom template
//                           is open for editing (name / description / sections).
//
// Built-ins are never edited directly — only via "Duplicate & edit".
// The template-section editor is provided by the sibling component
// TemplateSectionEditor (created in the same agent run).

import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import {
  LESSON_TEMPLATES,
  type LessonTemplate,
  type LessonTemplateSection,
} from "@/lib/lesson-templates";
import { useCustomTemplates, isCustomTemplateId } from "@/lib/custom-templates";
import { TemplateSectionEditor } from "./template-section-editor";
import styles from "./lesson-templates-manager.module.css";

// ── Built-in card ───────────────────────────────────────────────────────────

interface BuiltinCardProps {
  template: LessonTemplate;
  onDuplicate: (template: LessonTemplate) => void;
}

function BuiltinCard({ template, onDuplicate }: BuiltinCardProps): ReactNode {
  return (
    <article className={styles.builtinCard}>
      <div className={styles.builtinCardTop}>
        <span className={styles.builtinName}>{template.name}</span>
        {template.recommended && (
          <span className={styles.recommendedBadge} aria-label="Recommended">
            Recommended
          </span>
        )}
      </div>

      <p className={styles.builtinDesc}>{template.description}</p>

      {/* Section chips — show the ordered phase names at a glance */}
      <div className={styles.sectionChips} aria-label="Sections">
        {template.sections.map((sec) => (
          <span key={sec.id} className={styles.sectionChip}>
            {sec.label}
          </span>
        ))}
      </div>

      <div className={styles.builtinActions}>
        <button
          type="button"
          className={styles.duplicateBtn}
          onClick={() => onDuplicate(template)}
          aria-label={`Duplicate and edit ${template.name}`}
        >
          <svg
            aria-hidden
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
          >
            <rect
              x="5"
              y="5"
              width="9"
              height="9"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="M11 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
          Duplicate &amp; edit
        </button>
      </div>
    </article>
  );
}

// ── Custom template row ────────────────────────────────────────────────────

interface CustomRowProps {
  template: LessonTemplate;
  isEditing: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

function CustomRow({
  template,
  isEditing,
  onEdit,
  onDelete,
}: CustomRowProps): ReactNode {
  const sectionCount = template.sections.length;
  return (
    <div
      className={styles.customRow}
      aria-current={isEditing ? "true" : undefined}
      style={
        isEditing
          ? { borderColor: "var(--ink-900)", background: "var(--ink-100)" }
          : undefined
      }
    >
      <div className={styles.customRowInfo}>
        <div className={styles.customRowName}>{template.name}</div>
        <div className={styles.customRowMeta}>
          {sectionCount === 0
            ? "No sections yet"
            : `${sectionCount} section${sectionCount === 1 ? "" : "s"}`}
        </div>
      </div>
      <div className={styles.customRowActions}>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={onEdit}
          aria-label={`Edit ${template.name}`}
          aria-pressed={isEditing}
        >
          {/* Pencil icon */}
          <svg
            aria-hidden
            width="15"
            height="15"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="M11.5 2.5 13.5 4.5 5 13 2 14l1-3 8.5-8.5Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
          onClick={onDelete}
          aria-label={`Delete ${template.name}`}
        >
          {/* Trash icon */}
          <svg
            aria-hidden
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="M2 4h12M6 4V2h4v2M5 4l1 9h4l1-9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── Editor panel ───────────────────────────────────────────────────────────

interface EditorPanelProps {
  template: LessonTemplate;
  onNameChange: (name: string) => void;
  onDescChange: (description: string) => void;
  onSectionsChange: (sections: LessonTemplateSection[]) => void;
  onDone: () => void;
}

function EditorPanel({
  template,
  onNameChange,
  onDescChange,
  onSectionsChange,
  onDone,
}: EditorPanelProps): ReactNode {
  return (
    <section className={styles.editorCard} aria-label="Template editor">
      {/* Header */}
      <div className={styles.editorHeader}>
        <div className={styles.editorHeaderText}>
          <div className={styles.editorEyebrow}>Editing template</div>
          <h2 className={styles.editorTitle}>
            {template.name || "Untitled template"}
          </h2>
        </div>
        <button
          type="button"
          className={styles.doneBtn}
          onClick={onDone}
          aria-label="Done editing template"
        >
          Done
        </button>
      </div>

      {/* Name + description fields */}
      <div className={styles.fieldGroup}>
        <div className={styles.field}>
          <label htmlFor="tpl-name" className={styles.fieldLabel}>
            Template name
          </label>
          <input
            id="tpl-name"
            type="text"
            className={styles.fieldInput}
            value={template.name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="e.g. My reading workshop"
            autoComplete="off"
            spellCheck
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="tpl-desc" className={styles.fieldLabel}>
            Description
          </label>
          <textarea
            id="tpl-desc"
            className={styles.fieldTextarea}
            value={template.description}
            onChange={(e) => onDescChange(e.target.value)}
            placeholder="One sentence describing this lesson structure and when to use it."
            spellCheck
          />
        </div>
      </div>

      {/* Section editor — controlled by sibling component */}
      <TemplateSectionEditor
        sections={template.sections}
        onChange={onSectionsChange}
      />
    </section>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

/** The interactive lesson-templates settings page. Must be a descendant of
 * <CustomTemplatesProvider>. */
export function LessonTemplatesManager(): ReactNode {
  const { templates, create, update, remove, getById, hydrated } =
    useCustomTemplates();

  // Id of the custom template currently open in the editor, or null.
  const [editingId, setEditingId] = useState<string | null>(null);

  const editingTemplate = editingId ? getById(editingId) : undefined;

  // ── Actions ───────────────────────────────────────────────────────────

  const handleDuplicateBuiltin = useCallback(
    (builtin: LessonTemplate) => {
      const newId = create(builtin);
      setEditingId(newId);
    },
    [create],
  );

  const handleCreateNew = useCallback(() => {
    const newId = create();
    setEditingId(newId);
  }, [create]);

  const handleEdit = useCallback((id: string) => {
    setEditingId(id);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      if (editingId === id) setEditingId(null);
      remove(id);
    },
    [remove, editingId],
  );

  const handleDone = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleNameChange = useCallback(
    (name: string) => {
      if (editingId) update(editingId, { name });
    },
    [update, editingId],
  );

  const handleDescChange = useCallback(
    (description: string) => {
      if (editingId) update(editingId, { description });
    },
    [update, editingId],
  );

  const handleSectionsChange = useCallback(
    (sections: LessonTemplateSection[]) => {
      if (editingId) update(editingId, { sections });
    },
    [update, editingId],
  );

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
          <span className={styles.breadcrumbRoot}>Settings</span>
          <span className={styles.breadcrumbSep} aria-hidden>
            /
          </span>
          <span className={styles.breadcrumbCurrent} aria-current="page">
            Lesson templates
          </span>
        </nav>

        {/* ── Built-in templates ───────────────────────────────────────── */}
        <section className={styles.card} aria-labelledby="builtin-heading">
          <div className={styles.cardHeader}>
            <div className={styles.cardHeaderText}>
              <div className={styles.cardEyebrow}>Built-in library</div>
              <h1 className={styles.cardTitle} id="builtin-heading">
                Lesson templates
              </h1>
              <p className={styles.cardHint}>
                15 research-backed lesson structures. They are read-only — use
                &ldquo;Duplicate &amp; edit&rdquo; to create your own variation.
              </p>
            </div>
          </div>

          <div className={styles.builtinGrid} aria-label="Built-in templates">
            {LESSON_TEMPLATES.map((tpl) => (
              <BuiltinCard
                key={tpl.id}
                template={tpl}
                onDuplicate={handleDuplicateBuiltin}
              />
            ))}
          </div>
        </section>

        {/* ── Your templates ───────────────────────────────────────────── */}
        <section className={styles.card} aria-labelledby="custom-heading">
          <div className={styles.cardHeader}>
            <div className={styles.cardHeaderText}>
              <div className={styles.cardEyebrow}>Your templates</div>
              <h2 className={styles.cardTitle} id="custom-heading">
                Custom templates
              </h2>
              <p className={styles.cardHint}>
                Templates you create or duplicate. Set one as your default and
                every new lesson in an academic subject will start with it.
              </p>
            </div>
            <button
              type="button"
              className={styles.createBtn}
              onClick={handleCreateNew}
              aria-label="Create a new lesson template"
            >
              <svg
                aria-hidden
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M8 2v12M2 8h12"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              Create a template
            </button>
          </div>

          {/* Guard for hydration flash */}
          {!hydrated ? (
            <div className={styles.hydrating} aria-busy="true">
              Loading your templates…
            </div>
          ) : templates.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon} aria-hidden>
                ☐
              </div>
              <p className={styles.emptyStateText}>
                You haven&rsquo;t created any custom templates yet.
                <br />
                Duplicate a built-in above to get started, or click{" "}
                <strong>Create a template</strong> for a blank slate.
              </p>
            </div>
          ) : (
            <div className={styles.customList} aria-label="Your templates">
              {templates.map((tpl) =>
                isCustomTemplateId(tpl.id) ? (
                  <CustomRow
                    key={tpl.id}
                    template={tpl}
                    isEditing={editingId === tpl.id}
                    onEdit={() => handleEdit(tpl.id)}
                    onDelete={() => handleDelete(tpl.id)}
                  />
                ) : null,
              )}
            </div>
          )}
        </section>

        {/* ── Editor panel (shown when a custom template is open) ──────── */}
        {editingId && editingTemplate ? (
          <EditorPanel
            template={editingTemplate}
            onNameChange={handleNameChange}
            onDescChange={handleDescChange}
            onSectionsChange={handleSectionsChange}
            onDone={handleDone}
          />
        ) : null}
      </div>
    </div>
  );
}
