"use client";

// PlannerHub.tsx — the Planner Hub shell (Wave 8).
//
// A full-screen workspace that mounts as {children} inside the chrome immersive
// frame (ChromeShell's .overlay.immersive + ImmersiveBar). It owns:
//   • the hub-local top-bar (search / autosave / recents) — HubTopBar
//   • an optional folder doc-tab row — HubDocTabs (only when ≥1 doc open)
//   • a single scroll region that shows either a browse picker (Home) or the
//     active document body — HubDocHost.
//
// STATE THE HUB OWNS: the open-doc list + active tab, the current browse area,
// the global search string, and the autosave heuristic. It does NOT own the
// appearance (consumed from the shared theme context — no local gear) nor the
// Personal/Team mode (read-only; the chrome ImmersiveBar is the sole writer of
// useAppState().editMode).

import { useMemo, useRef, useState, type ReactNode } from "react";
import { usePlanner } from "@/lib/planner-store";
import { pushRecent } from "@/lib/hub-recents";
import type { SubjectId } from "@/lib/types";
import { HubTopBar } from "./HubTopBar";
import { HubDocTabs } from "./HubDocTabs";
import { HubDocHost } from "./HubDocHost";
import {
  LessonBrowse,
  UnitBrowse,
  ResourceBrowse,
  CatchUpBrowse,
} from "./browse";
import type { HubArea, HubDoc, HubOpenDoc } from "./types";
import styles from "./hub.module.css";

export function PlannerHub(): ReactNode {
  const { subjectById } = usePlanner();

  const [docs, setDocs] = useState<HubDoc[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [home, setHome] = useState(true); // showing a browse area vs a doc
  const [area, setArea] = useState<HubArea>("lessons");
  const [query, setQuery] = useState("");
  // Unit doc keys whose explorer modal the teacher has explicitly closed. A
  // unit doc's modal is open UNLESS its key is here — this keeps per-doc modal
  // state WITHOUT remounting the host (which would force it back open on every
  // revisit; Codex W8 R12).
  const [closedUnitModals, setClosedUnitModals] = useState<Set<string>>(
    () => new Set(),
  );
  const shellRef = useRef<HTMLDivElement>(null);

  // Autosave is a STATIC affordance, not a per-write success claim. The store
  // persists optimistically (fire-and-forget, no acknowledged-write signal), so
  // a transient "Saved just now" could assert a completed round-trip that never
  // came back — an unnoticed-data-loss trap (Codex W8 R4). We instead state the
  // behaviour ("Autosaves") and never claim a specific save succeeded.

  // ── Open / activate / close docs ──────────────────────────────────────────
  function openDoc(open: HubOpenDoc): void {
    // The key includes `sid`: unit slugs are unique only WITHIN a subject, so
    // `${kind}:${id}` alone would collide two same-slug units across subjects
    // onto one tab (Codex W8 R3 High).
    const key = `${open.kind}:${open.sid}:${open.id}`;
    setDocs((prev) =>
      prev.some((d) => d.key === key) ? prev : [...prev, { ...open, key }],
    );
    setActiveKey(key);
    setHome(false);
    // Recents subtitle: "Subject · Unit-or-kind".
    const subj = subjectById[open.sid as SubjectId];
    const sub =
      open.kind === "unit"
        ? `${subj?.name ?? "Unit"} · Unit`
        : `${subj?.name ?? "Lesson"} · Lesson`;
    pushRecent({
      key,
      kind: open.kind,
      id: open.id,
      title: open.title,
      sub,
      sid: open.sid,
    });
  }

  function closeDoc(key: string): void {
    // Forget any dismissed-modal state for this doc so reopening it fresh later
    // defaults back to open (Codex W8 R13) — distinct from merely switching
    // away, which keeps the entry.
    setClosedUnitModals((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setDocs((prev) => {
      const next = prev.filter((d) => d.key !== key);
      // If we closed the active doc, fall back to the last remaining doc, else
      // Home (the browse surface).
      if (key === activeKey) {
        if (next.length > 0) {
          setActiveKey(next[next.length - 1].key);
        } else {
          setActiveKey(null);
          setHome(true);
        }
      }
      return next;
    });
    // Closing the focused tab removed the focused element. Restore focus so a
    // keyboard user keeps their place (Codex W8 R4/R5/R11). PlannerHub owns this —
    // HubDocTabs unmounts entirely at zero docs, so its own ref would be null.
    // A fallback cascade covers every post-close state: an active doc button,
    // else the Home button (strip still shown), else the browse nav (strip
    // gone). Works whether or not Browse was already active.
    requestAnimationFrame(() => {
      const shell = shellRef.current;
      if (!shell) return;
      const target =
        shell.querySelector<HTMLElement>("[data-doctab-active]") ??
        shell.querySelector<HTMLElement>("[data-hub-home]") ??
        shell.querySelector<HTMLElement>(`.${styles.areaNav} button`);
      target?.focus();
    });
  }

  const activeDoc = useMemo(
    () => docs.find((d) => d.key === activeKey) ?? null,
    [docs, activeKey],
  );

  return (
    <div className={styles.shell} ref={shellRef}>
      <HubTopBar query={query} onQueryChange={setQuery} onOpenDoc={openDoc} />

      {docs.length > 0 && (
        <HubDocTabs
          docs={docs}
          activeKey={activeKey}
          homeActive={home}
          onActivate={(k) => {
            setActiveKey(k);
            setHome(false);
          }}
          onClose={closeDoc}
          onHome={() => setHome(true)}
          onAdd={() => {
            setHome(true);
            setArea("lessons");
          }}
        />
      )}

      <div className={styles.scroll}>
        {home || !activeDoc ? (
          <div className={styles.page}>
            {/* Plain section navigation (NOT an ARIA tablist — the browse
                content below is not a tabpanel, and roving-tab semantics would
                over-promise; Codex W8 R4). aria-current marks the active area. */}
            <nav aria-label="Browse" className={styles.areaNav}>
              {AREAS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  aria-current={area === a.key ? "page" : undefined}
                  className={`${styles.areaTab} ${area === a.key ? styles.areaTabOn : ""}`}
                  onClick={() => setArea(a.key)}
                >
                  {a.label}
                </button>
              ))}
            </nav>
            {area === "lessons" && <LessonBrowse query={query} onOpenDoc={openDoc} />}
            {area === "units" && <UnitBrowse query={query} onOpenDoc={openDoc} />}
            {area === "resources" && <ResourceBrowse query={query} onOpenDoc={openDoc} />}
            {area === "catchup" && <CatchUpBrowse query={query} onOpenDoc={openDoc} />}
          </div>
        ) : (
          <HubDocHost
            doc={activeDoc}
            unitModalOpen={!closedUnitModals.has(activeDoc.key)}
            onUnitModalOpenChange={(open) =>
              setClosedUnitModals((prev) => {
                const next = new Set(prev);
                if (open) next.delete(activeDoc.key);
                else next.add(activeDoc.key);
                return next;
              })
            }
          />
        )}
      </div>
    </div>
  );
}

// ── Area nav (Lessons / Units / Resources / Catch-up) ──────────────────────
const AREAS: ReadonlyArray<{ key: HubArea; label: string }> = [
  { key: "lessons", label: "Lessons" },
  { key: "units", label: "Units" },
  { key: "resources", label: "Resources" },
  { key: "catchup", label: "Catch-up" },
];
