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
  DEFAULT_LESSON_TEMPLATE_ID,
  LESSON_TEMPLATES,
  type LessonTemplate,
  type LessonTemplateSection,
} from "@/lib/lesson-templates";
import { useCustomTemplates, isCustomTemplateId } from "@/lib/custom-templates";
import { useDefaultTemplate } from "@/lib/use-default-template";
import { TemplateSectionEditor } from "./template-section-editor";
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  PageHeader,
  Tooltip,
} from "@/components/ui";
import reveal from "@/components/settings/section-reveal.module.css";
import styles from "./lesson-templates-manager.module.css";

// ── Built-in card ───────────────────────────────────────────────────────────

interface BuiltinCardProps {
  template: LessonTemplate;
  onDuplicate: (template: LessonTemplate) => void;
  /** True when this template is the teacher's account-wide default. */
  isDefault: boolean;
  onSetDefault: () => void;
}

function BuiltinCard({
  template,
  onDuplicate,
  isDefault,
  onSetDefault,
}: BuiltinCardProps): ReactNode {
  return (
    <article className={styles.builtinCard}>
      <div className={styles.builtinCardTop}>
        <span className={styles.builtinName}>{template.name}</span>
        {isDefault && (
          <Badge variant="success" aria-label="Your default template">
            Default
          </Badge>
        )}
        {template.recommended && (
          <Badge variant="warn" aria-label="Recommended">
            Recommended
          </Badge>
        )}
      </div>

      <p className={styles.builtinDesc}>{template.description}</p>

      {/* Section chips — show the ordered phase names at a glance */}
      <div className={styles.sectionChips} aria-label="Sections">
        {template.sections.map((sec) => (
          <Chip key={sec.id}>{sec.label}</Chip>
        ))}
      </div>

      <div className={styles.builtinActions}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onDuplicate(template)}
          aria-label={`Duplicate and edit ${template.name}`}
          tooltip={`Create an editable copy of the ${template.name} template — the built-in template stays untouched`}
          leadingIcon={
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
          }
        >
          Duplicate &amp; edit
        </Button>
        {!isDefault && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSetDefault}
            aria-label={`Set ${template.name} as your default template`}
            tooltip={`Make ${template.name} your default — every new lesson in an academic subject starts with this flow`}
          >
            Set as default
          </Button>
        )}
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
  /** True when this template is the teacher's account-wide default. */
  isDefault: boolean;
  onSetDefault: () => void;
}

function CustomRow({
  template,
  isEditing,
  onEdit,
  onDelete,
  isDefault,
  onSetDefault,
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
        <div className={styles.customRowName}>
          {template.name}
          {isDefault && (
            <Badge variant="success" aria-label="Your default template">
              Default
            </Badge>
          )}
        </div>
        <div className={styles.customRowMeta}>
          {sectionCount === 0
            ? "No sections yet"
            : `${sectionCount} section${sectionCount === 1 ? "" : "s"}`}
        </div>
      </div>
      <div className={styles.customRowActions}>
        {!isDefault && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSetDefault}
            aria-label={`Set ${template.name} as your default template`}
            tooltip={`Make ${template.name} your default — every new lesson in an academic subject starts with this flow`}
          >
            Set as default
          </Button>
        )}
        <Button
          variant="icon"
          size="sm"
          onClick={onEdit}
          iconAriaLabel={`Edit ${template.name}`}
          aria-pressed={isEditing}
          tooltip={`Open ${template.name} for editing — rename it, add or remove sections, change section colors`}
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
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          iconAriaLabel={`Delete ${template.name}`}
          tooltip={`Delete the ${template.name} template — any lessons still using it stay intact but lose the link to this template`}
          leadingIcon={
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
          }
        >
          Delete
        </Button>
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
          <Tooltip
            content="The custom lesson template currently open for editing. Rename it, edit its description, or add/remove/reorder sections below."
            side="bottom"
          >
            <h2 className={styles.editorTitle} tabIndex={0}>
              {template.name || "Untitled template"}
            </h2>
          </Tooltip>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={onDone}
          aria-label="Done editing template"
          tooltip="Stop editing this template and return to the list view"
        >
          Done
        </Button>
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

  // Account-wide default template (USER-scoped; seeded from the
  // onboarding wizard's choice the first time this page loads).
  const { defaultTemplateId, setDefaultTemplateId } = useDefaultTemplate();

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
      // Deleting the current default falls back to the built-in default
      // so the preference never points at a template that no longer
      // exists.
      if (defaultTemplateId === id) {
        setDefaultTemplateId(DEFAULT_LESSON_TEMPLATE_ID);
      }
      remove(id);
    },
    [remove, editingId, defaultTemplateId, setDefaultTemplateId],
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
      <div className={`${styles.inner} ${reveal.reveal}`}>
        {/* Page header — breadcrumb + title + subtitle via PageHeader primitive */}
        <PageHeader
          eyebrow="Settings"
          title="Lesson templates"
          subtitle="15 research-backed structures, plus your own custom templates."
          className={styles.pageHeader}
        />

        {/* ── Built-in templates ───────────────────────────────────────── */}
        <section className={styles.card} aria-labelledby="builtin-heading">
          <div className={styles.cardHeader}>
            <div className={styles.cardHeaderText}>
              <div className={styles.cardEyebrow}>Built-in library</div>
              <Tooltip
                content="15 research-backed lesson structures available out of the box. Each is read-only — click Duplicate & edit on any card to make your own editable copy."
                side="bottom"
              >
                <h2
                  className={styles.cardTitle}
                  id="builtin-heading"
                  tabIndex={0}
                >
                  Lesson templates
                </h2>
              </Tooltip>
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
                isDefault={defaultTemplateId === tpl.id}
                onSetDefault={() => setDefaultTemplateId(tpl.id)}
              />
            ))}
          </div>
        </section>

        {/* ── Your templates ───────────────────────────────────────────── */}
        <section className={styles.card} aria-labelledby="custom-heading">
          <div className={styles.cardHeader}>
            <div className={styles.cardHeaderText}>
              <div className={styles.cardEyebrow}>Your templates</div>
              <Tooltip
                content="Your own lesson-flow templates — created from scratch or duplicated from a built-in. Edit names, sections, and prompts; one will be your account-wide default for new lessons."
                side="bottom"
              >
                <h2
                  className={styles.cardTitle}
                  id="custom-heading"
                  tabIndex={0}
                >
                  Custom templates
                </h2>
              </Tooltip>
              <p className={styles.cardHint}>
                Templates you create or duplicate. Set one as your default and
                every new lesson in an academic subject will start with it.
              </p>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateNew}
              aria-label="Create a new lesson template"
              tooltip="Create a fresh lesson template from scratch — define your own section flow for reuse across lessons"
              leadingIcon={
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
              }
            >
              Create a template
            </Button>
          </div>

          {/* Guard for hydration flash */}
          {!hydrated ? (
            <div className={styles.hydrating} aria-busy="true">
              Loading your templates…
            </div>
          ) : templates.length === 0 ? (
            <EmptyState
              size="sm"
              heading="No custom templates yet."
              body="Duplicate a built-in above to get started, or click Create a template for a blank slate."
              className={styles.emptyState}
            />
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
                    isDefault={defaultTemplateId === tpl.id}
                    onSetDefault={() => setDefaultTemplateId(tpl.id)}
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
