"use client";

// course-sharing-manager.tsx — Settings → Subjects → "Course sharing" section.
//
// The manage-sharing surface for the per-course sharing model (product
// decisions 7.17.26): inside a team workspace, sharing is per-COURSE (a
// `subjects` row). A PERSONAL course is invisible to teammates; SHARING a
// course publishes it to every teacher's planner; RECLAIMING it (unshare)
// pulls it back to personal. Both are consequential + TEAM-affecting, so this
// card wears the team scope stripe, every control carries a `required` tooltip
// (non-dismissible, CLAUDE.md §4), and every successful mutation fires a
// ConsequenceToast naming the blast radius with an Undo that runs the inverse
// RPC.
//
// DATA SEAM (W12b-1, shipped + applied on prod):
//   • lib/subjects/client.ts — listCourseSharing / shareCourse / unshareCourse
//     / listSubjectsForGrade. Each unwraps the server action's envelope and
//     THROWS the friendly, client-safe message on failure (we surface it, never
//     swallow it).
//   • The SECURITY DEFINER RPCs (20260717120000_course_sharing_rpcs.sql) are the
//     REAL gate — they re-check every capability off auth.uid(). The
//     `canShare` / `canUnshare` flags on CourseSharingState are those same
//     predicates evaluated server-side (they MIRROR lib/subjects/authz.ts'
//     canShareCourse / canUnshareCourse). We use them ONLY to show/hide the
//     affordance (cosmetic); a denied action still fails closed at the RPC, and
//     `can_unshare` deliberately omits the content-orphan block — that block is
//     evaluated at unshare time and reaches us as the RPC's error string, which
//     we render inline. (Re-calling the pure authz functions here would be
//     redundant AND less accurate: the client lacks the admin flag and the
//     dependent-content roster the RPC resolves server-side.)
//
// GRADE RESOLUTION: the sharing RPCs are keyed on a real grade uuid. The
// settings tree's NotebookProvider carries MOCK ids ("g5"), so we resolve the
// caller's active grade the same way the planner store does —
// plannerClient.getActiveGradeLevelId(ownerId), with ownerId = the Supabase
// auth uid from app-state. Gated on the planner Supabase flag (the same switch
// lib/subjects/actions.ts gates on via isPlannerSupabaseConfigured): OFF
// (prototype / local dev) short-circuits to a calm empty state with no network
// call; ON waits for the auth session to resolve, then loads.
//
// SSR-safe: the first render is always the "loading" branch (no reads that
// differ between server and client), and every tooltip is `required` (dismissal
// state is never read), so there is no hydration mismatch.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button, Skeleton, Tooltip } from "@/components/ui";
import { SettingsCard } from "@/components/appearance/settings-card";
import { SECTION_ICONS } from "@/components/settings/section-icons";
import { useConsequenceToast } from "@/lib/consequence-toast";
import { useAppState } from "@/lib/app-state";
import { plannerClient } from "@/lib/planner/client";
import {
  listCourseSharing,
  listSubjectsForGrade,
  shareCourse,
  unshareCourse,
} from "@/lib/subjects/client";
import type { CourseSharingState } from "@/lib/subjects/row";
// CourseScope is authz.ts' shared scope union — imported so a row's scope stays
// type-locked to the same source the (server-mirrored) canShare/canUnshare gate
// is derived from. authz.ts is READ-ONLY here (never modified).
import type { CourseScope } from "@/lib/subjects/authz";
import type { SubjectId } from "@/lib/types";
import styles from "./course-sharing-manager.module.css";

// Whether the planner persists to Supabase — the same NEXT_PUBLIC switch
// lib/planner/client.ts reads and lib/subjects/actions.ts gates on
// (isPlannerSupabaseConfigured). OFF ⇒ the sharing seam returns nothing, so we
// render the empty state without a round-trip instead of resolving a mock grade.
const PLANNER_SUPABASE = process.env.NEXT_PUBLIC_PLANNER_USE_SUPABASE === "1";

/** Friendly message from a thrown seam error (client.ts throws real Errors with
 *  the action's client-safe message). Never leak an unexpected shape. */
function errorMessage(e: unknown): string {
  return e instanceof Error && e.message
    ? e.message
    : "That didn't work — please try again.";
}

type LoadStatus = "loading" | "ready" | "error";

/** A course's display identity (name + color slug), resolved from the ordinary
 *  grade course list and joined onto the gated sharing state by subjects-row id. */
interface CourseMeta {
  name: string;
  slug: SubjectId;
}

/** The manage-sharing card. Self-contained: resolves its own grade, loads its
 *  own state, and owns its pending/success/error feedback (these are
 *  server-action writes — they never touch localStorage, so they correctly do
 *  NOT trip useSettingsDirty / the click-out save prompt). */
export function CourseSharingManager(): ReactNode {
  const { currentUser } = useAppState();
  const ownerId = currentUser.id; // Supabase auth uid; null while loading / mock
  const { showConsequence } = useConsequenceToast();

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gradeLevelId, setGradeLevelId] = useState<string | null>(null);
  const [sharing, setSharing] = useState<CourseSharingState[]>([]);
  const [metaById, setMetaById] = useState<Map<string, CourseMeta>>(new Map());

  // Per-row transient feedback. Pending is keyed by subject id (a Set) so two
  // concurrent actions on different courses stay independent — one finishing
  // never clears another's spinner. The acting row's Button is disabled while
  // busy, so the same course can't be double-submitted. rowError shows the most
  // recent failure against its row.
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const [rowError, setRowError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const startPending = (id: string): void =>
    setPendingIds((prev) => new Set(prev).add(id));
  const endPending = (id: string): void =>
    setPendingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  // Bumped after each successful mutation → the SettingsCard header flashes its
  // "Saved" chip (these writes have no Save button, so the chip is the
  // confirmation a change landed). Reload counter re-runs the initial load.
  const [savedTick, setSavedTick] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  // ── Initial load ──────────────────────────────────────────────────────────
  // Re-runs when the auth session resolves (ownerId null → uid) or on Retry.
  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      // Backend OFF (prototype / local dev): the seam returns nothing anyway —
      // render the empty state directly, no mock-grade round-trip.
      if (!PLANNER_SUPABASE) {
        if (cancelled) return;
        setSharing([]);
        setMetaById(new Map());
        setGradeLevelId(null);
        setStatus("ready");
        return;
      }
      // Backend ON but the auth session hasn't resolved yet — stay in loading;
      // this effect re-runs the moment ownerId becomes the real uid.
      if (ownerId == null) {
        if (!cancelled) setStatus("loading");
        return;
      }

      setStatus("loading");
      setLoadError(null);
      try {
        // Canonical grade resolver — the exact path lib/planner/grade.ts uses.
        const grade = await plannerClient.getActiveGradeLevelId(ownerId);
        if (cancelled) return;
        if (!grade) {
          // A real teacher with no configured grade → nothing to manage yet.
          setGradeLevelId(null);
          setSharing([]);
          setMetaById(new Map());
          setStatus("ready");
          return;
        }
        // Sharing state (gated, provenance-bearing) + the ordinary course list
        // (names + color slugs) in parallel; joined by subjects-row id below.
        const [sharingRows, courseRows] = await Promise.all([
          listCourseSharing(grade),
          listSubjectsForGrade(grade),
        ]);
        if (cancelled) return;
        const meta = new Map<string, CourseMeta>();
        for (const c of courseRows) {
          meta.set(c.id, { name: c.name, slug: c.subjectId });
        }
        setGradeLevelId(grade);
        setMetaById(meta);
        setSharing(sharingRows);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setLoadError(errorMessage(e));
        setStatus("error");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [ownerId, reloadKey]);

  // ── Optimistic flip + background reconcile ──────────────────────────────────
  // After a confirmed mutation we flip the acting row locally for instant
  // feedback, then re-fetch the sharing state to reconcile. A failed reconcile
  // keeps the optimistic row (the write already succeeded); the next full load
  // corrects any drift.
  const applyOptimistic = (id: string, dir: "share" | "unshare"): void => {
    setSharing((prev) =>
      prev.map((s) => {
        if (s.subjectId !== id) return s;
        if (dir === "share") {
          return {
            ...s,
            scope: "team" as CourseScope,
            sharedFromPersonal: true,
            sharedByTeacherId: ownerId,
            sharedByName: currentUser.name,
            canShare: false,
            canUnshare: true,
          };
        }
        return {
          ...s,
          scope: "personal" as CourseScope,
          sharedByName: null,
          canShare: true,
          canUnshare: false,
        };
      }),
    );
  };

  const reconcile = async (): Promise<void> => {
    if (!gradeLevelId) return;
    try {
      const next = await listCourseSharing(gradeLevelId);
      setSharing(next);
    } catch {
      // Keep the optimistic state — the mutation itself already committed.
    }
  };

  // Unified share / unshare runner. Also serves the toast's Undo (which runs the
  // inverse direction) — so an undo that the RPC now blocks (e.g. a teammate
  // built on the course between share and undo) surfaces its error inline too.
  const runAction = async (
    id: string,
    name: string,
    dir: "share" | "unshare",
  ): Promise<void> => {
    setRowError(null);
    startPending(id);
    let ok = false;
    try {
      if (dir === "share") await shareCourse(id);
      else await unshareCourse(id);
      ok = true;
    } catch (e) {
      // Surface the RPC's client-safe message on the acting row — never swallow.
      setRowError({ id, message: errorMessage(e) });
    }
    if (ok) {
      applyOptimistic(id, dir);
      setSavedTick((t) => t + 1);
      showConsequence({
        message:
          dir === "share"
            ? `“${name}” is now shared with your whole team — every teacher can see it and plan lessons in it.`
            : `“${name}” is personal again — it left every teammate’s planner and only you can see it now.`,
        onUndo: () => {
          void runAction(id, name, dir === "share" ? "unshare" : "share");
        },
      });
      void reconcile();
    }
    endPending(id);
  };

  // ── Display rows: join sharing state ⇄ course meta (name + color) ────────────
  const rows = useMemo(
    () =>
      sharing.map((s) => {
        const meta = metaById.get(s.subjectId);
        return {
          state: s,
          // Fallback keeps an admin-managed course the caller can't SEE via the
          // ordinary (RLS-scoped) list from rendering a bare uuid.
          name:
            meta?.name ??
            (s.scope === "team" ? "Shared course" : "Personal course"),
          slug: meta?.slug ?? null,
        };
      }),
    [sharing, metaById],
  );

  const cardTitle = (
    <Tooltip
      content="Choose which of your personal courses your team can see. Sharing a course adds it to every teammate’s planner; making it personal again removes it. Subject colors stay locked, so a course means the same thing on everyone’s screen."
      side="bottom"
      required
    >
      <span>Course sharing</span>
    </Tooltip>
  );

  return (
    <SettingsCard
      glyph={SECTION_ICONS.subjects({ size: 14 })}
      tone="brand"
      anchorId="course-sharing"
      scope="team"
      eyebrow="Sharing"
      savedTick={savedTick}
      title={cardTitle}
      hint="Share a personal course to add it to your whole team’s planner, or reclaim a shared course back to personal. Sharing changes what every teammate sees."
    >
      {status === "loading" && (
        <div className={styles.loading}>
          <Skeleton lines={3} label="Loading course sharing…" />
        </div>
      )}

      {status === "error" && (
        <div className={styles.error} role="alert">
          <p className={styles.errorText}>
            {loadError ?? "Couldn’t load course sharing."}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setReloadKey((k) => k + 1)}
            tooltip="Try loading your team’s course sharing again."
          >
            Try again
          </Button>
        </div>
      )}

      {status === "ready" && rows.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyHeading}>No courses to share yet</p>
          <p className={styles.emptyBody}>
            When you create a personal course, it appears here so you can share
            it with your team.
          </p>
        </div>
      )}

      {status === "ready" && rows.length > 0 && (
        <ul className={styles.list}>
          {rows.map(({ state, name, slug }) => (
            <CourseRow
              key={state.subjectId}
              state={state}
              name={name}
              slug={slug}
              busy={pendingIds.has(state.subjectId)}
              error={rowError?.id === state.subjectId ? rowError.message : null}
              onShare={() => void runAction(state.subjectId, name, "share")}
              onUnshare={() => void runAction(state.subjectId, name, "unshare")}
            />
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}

// ── One course row ────────────────────────────────────────────────────────────
// swatch | name + status (+ inline error) | contextual control.

interface CourseRowProps {
  state: CourseSharingState;
  name: string;
  slug: SubjectId | null;
  busy: boolean;
  error: string | null;
  onShare: () => void;
  onUnshare: () => void;
}

function CourseRow({
  state,
  name,
  slug,
  busy,
  error,
  onShare,
  onUnshare,
}: CourseRowProps): ReactNode {
  const swatchClass = slug
    ? ["cp-subj", slug, styles.swatch].join(" ")
    : [styles.swatch, styles.swatchNeutral].join(" ");

  return (
    <li className={styles.row}>
      <span className={swatchClass} aria-hidden="true" />

      <div className={styles.main}>
        <span className={styles.name}>{name}</span>
        <span className={styles.status}>
          {state.scope === "team" ? (
            state.sharedByName ? (
              <>
                Shared with the team · by{" "}
                <strong className={styles.statusStrong}>
                  {state.sharedByName}
                </strong>
              </>
            ) : (
              "Shared with the whole team"
            )
          ) : (
            "Personal — only you can see it"
          )}
        </span>
        {error && (
          <span className={styles.rowError} role="alert">
            {error}
          </span>
        )}
      </div>

      <div className={styles.control}>
        {state.scope === "personal" ? (
          state.canShare ? (
            <Tooltip
              content={`Share “${name}” with your whole team — it appears on every teacher’s planner and they can build lessons in it. You can make it personal again anytime.`}
              side="top"
              required
            >
              <Button
                variant="secondary"
                size="sm"
                loading={busy}
                onClick={onShare}
                aria-label={`Share ${name} with your team`}
              >
                Share with team
              </Button>
            </Tooltip>
          ) : (
            // Cosmetic disabled affordance (admin-only edge) — explains WHY.
            <Tooltip
              content="Only the course’s owner or a workspace admin can share it with the team."
              side="top"
              required
            >
              <Button
                variant="secondary"
                size="sm"
                disabled
                aria-label={`Share ${name} with your team`}
              >
                Share with team
              </Button>
            </Tooltip>
          )
        ) : state.canUnshare ? (
          <Tooltip
            content={`Make “${name}” personal again — it leaves every teammate’s planner and only you keep it. If teammates already built lessons in it, they’ll need to reset those copies first.`}
            side="top"
            required
          >
            <Button
              variant="secondary"
              size="sm"
              loading={busy}
              onClick={onUnshare}
              aria-label={`Make ${name} personal`}
            >
              Make personal
            </Button>
          </Tooltip>
        ) : (
          // Founding / team-native course — permanently shared, no control.
          // The status line already reads "Shared with the whole team"; this
          // note names why there's nothing to do (touch users get the title).
          <span
            className={styles.coreNote}
            title="This is a core team subject — it’s shared with everyone and can’t be made personal."
          >
            Core subject
          </span>
        )}
      </div>
    </li>
  );
}
