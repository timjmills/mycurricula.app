"use client";

// ResourceBrowse.tsx — the Planner Hub's resource wall picker (Wave 8).
//
// Every non-archived lesson's resources, flattened with provenance, filterable
// by kind. Resources are NOT a doc kind in W8 (the resource WALL is Wave 9), so
// a card links OUT to the resource via the app's single safe-URL sink — never
// raw injection — and offers "open its lesson" to jump into planning.

import { useMemo, useState, type ReactNode } from "react";
import { usePlanner } from "@/lib/planner-store";
import { stripHtml } from "@/lib/html-text";
import { ResourceEmbed } from "@/components/resources";
import { PlannerEmpty } from "@/components/ui";
import type { HubBrowseProps } from "./browse-data";
import { queryMatches, flattenResources } from "./browse-data";
import type { BrowseResourceRef } from "./browse-data";
import styles from "./browse.module.css";

type KindFilter = "all" | "link" | "file" | "image";

function kindOf(ref: BrowseResourceRef): KindFilter {
  const t = ref.resource.type;
  if (t === "image") return "image";
  if (t === "link" || t === "website" || t === "youtube") return "link";
  // slides / pdf / doc / notecard render as file-style embeds.
  return "file";
}

const FILTERS: ReadonlyArray<{ key: KindFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "link", label: "Links" },
  { key: "file", label: "Files" },
  { key: "image", label: "Images" },
];

export function ResourceBrowse({
  query,
  onOpenDoc,
}: HubBrowseProps): ReactNode {
  const { lessons, subjectById } = usePlanner();
  const [filter, setFilter] = useState<KindFilter>("all");

  const refs = useMemo(() => {
    const all = flattenResources(lessons);
    return all.filter(
      (ref) =>
        // Skip url-less legacy placeholder rows (except notecards, which carry
        // their content inline) — they render as near-invisible empty cards
        // (adversarial review W8 low).
        (Boolean(ref.resource.url) || ref.resource.type === "notecard") &&
        (filter === "all" || kindOf(ref) === filter) &&
        queryMatches(
          query,
          ref.resource.label,
          ref.lessonTitle,
          subjectById[ref.subject]?.name,
        ),
    );
  }, [lessons, filter, query, subjectById]);

  return (
    <>
      <div className={styles.head}>
        <div className={styles.crumb}>Planner</div>
        <h1 className={styles.title}>Resources</h1>
        <p className={styles.sub}>Everything attached across your lessons.</p>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.chips}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`${styles.chip} ${filter === f.key ? styles.chipOn : ""}`}
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {refs.length === 0 ? (
        query.trim() || filter !== "all" ? (
          <p className={styles.empty}>No resources match your filters.</p>
        ) : (
          <PlannerEmpty size="sm" heading="No resources attached yet." />
        )
      ) : (
        <div className={styles.wallGrid}>
          {refs.map((ref) => {
            const subj = subjectById[ref.subject];
            return (
              <div
                key={ref.key}
                className={`cp-subj ${subj?.cls ?? ""} ${styles.resCard}`}
              >
                {/* ResourceEmbed owns the resource's OWN affordance (link-out /
                    preview) and re-vets every url/src through the isSafeUrl /
                    isSafeImgSrc sink. Its onClick only fires for image embeds,
                    so we do NOT rely on it to reach the lesson — an explicit
                    "Open lesson" control below is the reliable path for every
                    resource kind (adversarial review W8 M2). */}
                <ResourceEmbed resource={ref.resource} variant="card" />
                <button
                  type="button"
                  className={styles.resOpenLesson}
                  onClick={() =>
                    onOpenDoc({
                      kind: "lesson",
                      id: ref.lessonId,
                      title: stripHtml(ref.lessonTitle),
                      sid: ref.subject,
                    })
                  }
                >
                  <span aria-hidden="true">↗</span> Open lesson ·{" "}
                  <span className={styles.resOpenSub}>
                    {subj?.name} · Wk {ref.week}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
