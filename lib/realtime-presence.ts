"use client";

// realtime-presence.ts — team-awareness presence + notification subscription.
//
// W4-D1 (Decision #9, minimal viable): build the consumer surface for
// concurrent-teacher awareness now, mock the realtime backend, swap the
// internals for Supabase Realtime in Phase 1B without touching the hook
// contracts.
//
// Two public hooks today:
//
//   • useTeacherPresence()
//       → { activeEditors: Map<lessonId, TeacherIdentity[]> }
//     Returns the set of OTHER teachers (not the current user) actively
//     editing each lesson. Lesson cards consume this via
//     <EditingIndicator lessonId={lesson.id} /> to render the "Sara is
//     editing — last change wins" pill.
//
//   • useNotifications()
//       → { count, items, dismiss(id), dismissAll() }
//     Returns the inbox feed surfaced by the top-bar notification bell.
//     Dismissals persist to localStorage under
//     `mycurricula:user:notif-dismissed` so a teacher's "I read it" state
//     survives reloads. The mock seeds 4 items at boot (see SEED below).
//
// SSR safety:
//   The initial render of both hooks must match server-rendered HTML —
//   no `Math.random()`, no `Date.now()`, no `localStorage` reads during
//   render. Mock data is a frozen module constant; the dismissed-ids
//   set hydrates from localStorage inside a post-mount useEffect, same
//   pattern as lib/tooltip-dismissal.ts.
//
// Phase-1B migration plan:
//   • useTeacherPresence becomes a thin wrapper around a Supabase Realtime
//     channel (`presence:lessons:<teamId>`) emitting `JOIN` / `LEAVE`
//     events keyed by lesson id. The Map shape stays identical.
//   • useNotifications becomes a paginated query against a
//     `team_notifications` table + a Realtime subscription on inserts.
//     The NotificationItem shape stays identical; only `link` becomes a
//     deep-link computed server-side.

import { useCallback, useEffect, useMemo, useState } from "react";
import { TEACHERS, ME } from "./mock/teachers";

// ── Storage key ──────────────────────────────────────────────────────────

const DISMISSED_KEY = "mycurricula:user:notif-dismissed";

// ── Types ────────────────────────────────────────────────────────────────

/**
 * The minimum identity surface every team-awareness UI needs: a stable id,
 * a display name, two-letter initials for the avatar chip, and a color
 * token to tint the chip. Per Decision #9 we defer real avatars; the
 * initials-in-colored-chip is enough for W4-D1.
 *
 * `avatarColor` is a CSS color VALUE (typically a `var(--tag-*)` token
 * resolved to its hex) so consumers can drop it straight into
 * `background:`. Stable per teacher id so the chip is recognisable
 * across surfaces.
 */
export interface TeacherIdentity {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
}

/** Categories of notification — used by the bell row icon + voice. */
export type NotificationKind =
  | "edit" // another teacher edited a lesson you also teach
  | "resource" // another teacher added a resource to a shared lesson
  | "comment" // a Lesson Comment was posted on a lesson you teach
  | "system"; // catch-all for app-level nudges (e.g. wizard prompts)

/**
 * A single row in the notification dropdown. `ts` is an ISO string so it
 * serialises cleanly and we can format relative-time client-side without
 * exposing `Date` objects across the hook boundary.
 */
export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  /** Headline — appears as the bold first line of the dropdown row. */
  title: string;
  /** Optional one-line body shown below the headline in muted text. */
  body?: string;
  /** ISO timestamp; rendered as "5m ago" / "2h ago" by the consumer. */
  ts: string;
  /**
   * Optional deep link. Clicking the row routes here AND dismisses the
   * item. When absent, clicking the row only dismisses.
   */
  link?: string;
  /**
   * The teacher who produced the notification, when applicable. Drives
   * the row's avatar chip. `null` for system rows.
   */
  actor: TeacherIdentity | null;
}

// ── Avatar color assignment ──────────────────────────────────────────────
// Stable per-teacher color drawn from the --tag-* palette in tokens.css.
// Tokens that resolve to mid-saturation hues — readable as white-on-color
// for the initials chip at the size we render (18–22px). NOT subject
// colors: a teacher's identity must not be conflated with the subject
// they teach, and the tag palette is the documented "identity, not
// content" register (see app/tokens.css §Tag palette).
//
// Resolved to hex values here so the consumer can use them via inline
// `background:` without re-reading from CSS — these are tokens we own
// and won't change without a coordinated update.

const TAG_COLORS: readonly string[] = [
  "var(--tag-indigo)",
  "var(--tag-teal)",
  "var(--tag-purple)",
  "var(--tag-amber)",
  "var(--tag-pink)",
] as const;

function colorForTeacherId(id: string): string {
  // Deterministic hash → bucket. Tiny FNV-ish mixer; sufficient for
  // 5-bucket distribution across the team and stable across reloads.
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) >>> 0;
  }
  return TAG_COLORS[h % TAG_COLORS.length];
}

/** Build a TeacherIdentity for a Teacher fixture (id-stable color). */
function toIdentity(t: {
  id: string;
  name: string;
  initials: string;
}): TeacherIdentity {
  return {
    id: t.id,
    name: t.name,
    initials: t.initials,
    avatarColor: colorForTeacherId(t.id),
  };
}

/** Pre-built identities, indexed by teacher id. Stable module constant. */
const IDENTITIES: Record<string, TeacherIdentity> = Object.fromEntries(
  TEACHERS.map((t) => [t.id, toIdentity(t)]),
);

// ── Mock seed: who is editing what ───────────────────────────────────────
// Stable seed — NOT Math.random / Date.now. The lesson ids come from
// lib/mock/lessons.ts; the teachers come from lib/mock/teachers.ts. We
// deliberately exclude `ME` (Lena) from every editor list so the current
// user never sees a "you are editing" warning on her own card.
//
// Three lessons selected for variety:
//   • m-12-1     — Sarah editing alone (single-editor case)
//   • r-12-1     — Maya editing alone (different teacher, different subject)
//   • g-11-1     — Jonas + Omar together (two-editor case → "+N" suffix)
//
// Lessons NOT listed have no active editors and the indicator never paints.

const ACTIVE_EDITORS_SEED: ReadonlyArray<[string, readonly string[]]> = [
  ["m-12-1", ["sk"]],
  ["r-12-1", ["ma"]],
  ["g-11-1", ["jd", "om"]],
] as const;

/** Pre-built Map exposed by useTeacherPresence. Frozen at module load. */
const ACTIVE_EDITORS: Map<string, TeacherIdentity[]> = new Map(
  ACTIVE_EDITORS_SEED.map(([lessonId, teacherIds]) => [
    lessonId,
    teacherIds
      // Defensive: skip ME if a future seed accidentally includes her.
      .filter((tid) => tid !== ME.id)
      .map((tid) => IDENTITIES[tid])
      .filter((id): id is TeacherIdentity => id !== undefined),
  ]),
);

// ── Mock seed: notification inbox ────────────────────────────────────────
// Four items at boot — one of each kind so the dropdown showcases the row
// variants. Timestamps are STATIC offsets from a fixed anchor (today's
// date is held constant at the W4-D1 commit time so the seed renders
// identically server-side and client-side; we re-anchor in useEffect on
// mount to keep "5m ago" / "2h ago" reading sensible across deploys).
//
// The anchor is chosen during mount, not import, so the page hydrates
// with the SSR copy first and then the relative-time labels refresh once
// JS runs. That avoids a hydration mismatch on the `ts` strings.

interface NotificationSeed {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  /** Minutes ago at the anchor time. */
  offsetMin: number;
  link?: string;
  actorId: string | null;
}

const NOTIFICATION_SEED: readonly NotificationSeed[] = [
  {
    id: "n-1",
    kind: "edit",
    title: "Sarah edited 'Fractions as division — bake sale problem'",
    body: "Updated directions in the Team Curriculum",
    offsetMin: 4,
    link: "/weekly",
    actorId: "sk",
  },
  {
    id: "n-2",
    kind: "resource",
    title: "Omar added a resource to 'Lead sentences — three rewrites'",
    body: "Slides — Three lead-sentence rewrites",
    offsetMin: 32,
    link: "/weekly",
    actorId: "om",
  },
  {
    id: "n-3",
    kind: "comment",
    title: "You have 2 new Lesson Comments",
    body: "On 'Wonder, chs 14–17' and 'Theme mapping'",
    offsetMin: 95,
    link: "/weekly",
    actorId: "ma",
  },
  {
    id: "n-4",
    kind: "system",
    title: "Welcome to your team's curriculum",
    body: "Hover any control for a quick explanation — the ? button opens the full guide.",
    offsetMin: 60 * 22,
    actorId: null,
  },
] as const;

// ── localStorage helpers ─────────────────────────────────────────────────
// SSR-guarded: every call returns a safe default when window is undefined.

function readDismissedSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((x): x is string => typeof x === "string"));
    }
  } catch {
    // Malformed JSON or storage unavailable — start fresh.
  }
  return new Set();
}

function writeDismissedSet(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    // Quota or private-mode failure — state still correct for this tab.
  }
}

// ── useTeacherPresence ───────────────────────────────────────────────────

/** Hook-local return type — kept narrow so the consumer surface stays small. */
export interface TeacherPresenceState {
  /** lessonId → other teachers currently editing. Empty map = nobody. */
  activeEditors: Map<string, TeacherIdentity[]>;
}

/**
 * Subscribe to per-lesson editor presence. Today the source is a frozen
 * module map; in Phase 1B this swaps to a Supabase Realtime channel keyed
 * by teamId. The return shape will not change — the lesson card consumer
 * already speaks `Map<lessonId, TeacherIdentity[]>`.
 *
 * SSR-safe: returns the same Map reference on every render, so server
 * and first-client render produce identical output.
 */
export function useTeacherPresence(): TeacherPresenceState {
  // The map is a stable module constant — no reactive state needed today.
  // Phase 1B will introduce a useState backed by Realtime; the hook will
  // re-render on JOIN / LEAVE events but the contract stays the same.
  return { activeEditors: ACTIVE_EDITORS };
}

// ── useNotifications ─────────────────────────────────────────────────────

export interface NotificationsState {
  /** Number of NON-dismissed items — drives the bell badge. */
  count: number;
  /** Non-dismissed items, newest first. */
  items: NotificationItem[];
  /** Dismiss a single item by id. Persists to localStorage. */
  dismiss: (id: string) => void;
  /** Dismiss every currently-visible item. Persists to localStorage. */
  dismissAll: () => void;
}

/**
 * Subscribe to the team notification feed. Today: a frozen seed minus any
 * ids the teacher has previously dismissed. In Phase 1B this becomes a
 * paginated Supabase query + Realtime subscription on insert.
 *
 * Hydration contract: the first render uses an EMPTY dismissed set so the
 * server-rendered HTML (all 4 seed items) matches the first client paint.
 * A post-mount useEffect overlays the persisted dismissals; React then
 * re-renders with the trimmed list. This mirrors the SSR pattern in
 * `lib/tooltip-dismissal.ts` and `lib/app-state.tsx`.
 */
export function useNotifications(): NotificationsState {
  // Dismissed-ids state. Initial value MUST be deterministic across SSR
  // and CSR — start empty, hydrate from localStorage on mount.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(
    () => new Set(),
  );

  // Anchor time for relative-time formatting. Set on mount so the seed
  // timestamps always read sensibly regardless of when the bundle shipped.
  // SSR uses a stable epoch fallback (the W4-D1 anchor) so the server
  // HTML matches the first client render BEFORE this effect fires.
  const [anchor, setAnchor] = useState<number>(() => W4_D1_ANCHOR_MS);

  // Post-mount: hydrate dismissed set from storage + anchor relative time.
  useEffect(() => {
    setDismissedIds(readDismissedSet());
    setAnchor(Date.now());
  }, []);

  // Build the visible items. Memoised on dismissedIds + anchor so the
  // consumer's referential-equality checks stay cheap. The seed itself is
  // module-frozen so callers see a stable item identity across re-renders.
  const items = useMemo<NotificationItem[]>(() => {
    return NOTIFICATION_SEED.filter((s) => !dismissedIds.has(s.id))
      .map<NotificationItem>((s) => ({
        id: s.id,
        kind: s.kind,
        title: s.title,
        body: s.body,
        ts: new Date(anchor - s.offsetMin * 60_000).toISOString(),
        link: s.link,
        actor: s.actorId !== null ? (IDENTITIES[s.actorId] ?? null) : null,
      }))
      .sort((a, b) => b.ts.localeCompare(a.ts));
  }, [dismissedIds, anchor]);

  const dismiss = useCallback((id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      writeDismissedSet(next);
      return next;
    });
  }, []);

  const dismissAll = useCallback(() => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      for (const s of NOTIFICATION_SEED) {
        next.add(s.id);
      }
      writeDismissedSet(next);
      return next;
    });
  }, []);

  return {
    count: items.length,
    items,
    dismiss,
    dismissAll,
  };
}

// ── Internals ────────────────────────────────────────────────────────────

/**
 * Stable epoch anchor used when window.Date is unavailable (server render).
 * Picked at the W4-D1 commit — a few hours before the live deploy clock
 * so relative-time labels read sensibly even before the post-mount
 * `Date.now()` swap. The value is arbitrary; the effect overrides it.
 */
const W4_D1_ANCHOR_MS = Date.UTC(2026, 4, 28, 12, 0, 0); // 2026-05-28T12:00:00Z

// ── Re-exports ───────────────────────────────────────────────────────────
// Re-export the teacher fixture so consumers don't double-import from two
// places — `realtime-presence` is the canonical entry point for any
// team-identity surface even when the source today is a static fixture.

export { TEACHERS as MOCK_TEACHERS, ME as MOCK_ME };
