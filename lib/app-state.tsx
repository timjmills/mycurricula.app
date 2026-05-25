"use client";

// app-state.tsx — the planner-wide UI state shared by the app shell and
// every view. This is the contract the top bar, side panels, and the
// Weekly / Daily / Subject views all read and write.
//
// It holds *view state*, not domain data: which week is showing, which
// day is selected, the active filters, the Personal/Master edit mode, the
// Grid/List view mode, and which panels are open. Domain data still comes
// from `lib/mock`.
//
// Routing owns the *active view* (Weekly vs Daily vs …) — read it with
// `usePathname()`; it is intentionally not duplicated here.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import type { LessonStatus, SubjectId } from "@/lib/types";
import { CURRENT_WEEK, ME } from "@/lib/mock";
import { createClient } from "@/lib/supabase/client";

/**
 * Grid (matrix/canvas view of lessons in a subject × day grid) vs
 * List (flat list of lessons for the focused week or day). The active view
 * component (WeeklyGrid / WeeklyList, DailyView / DailyList) is chosen by
 * the shell based on this value; it does not affect filtering or edit mode.
 *
 * Note: the new Schedule view (planning-doc §5.4) is **not** a value here.
 * Schedule mode is controlled by inline pills inside each view's own
 * chrome (`useWeeklyLayout` / `useDailyLayout` state) so the top-bar
 * Grid/List toggle stays focused on the lesson-card layout choice. The
 * dedicated `/schedule` route renders the Schedule day-pane directly.
 */
export type ViewMode = "grid" | "list";

/** Personal-first (default) vs. the gated team-wide Master surface. */
export type EditMode = "personal" | "master";

/** Left-panel filter state. An empty array means "no filter — show all". */
export interface PlannerFilters {
  subjects: SubjectId[];
  units: string[];
  statuses: LessonStatus[];
  standards: string[];
  /** Holiday / Ramadan markers visible in the calendar surfaces. */
  showHolidays: boolean;
}

const EMPTY_FILTERS: PlannerFilters = {
  subjects: [],
  units: [],
  statuses: [],
  standards: [],
  showHolidays: true,
};

/**
 * localStorage key for the team's curriculum label.
 *
 * SCOPE NOTE (2026-05-25 clarification): the curriculum label is
 * TEAM-scoped — it appears in the top-bar wordmark for every member of
 * the grade-level team (e.g. "Grade 5" is the team's grade, not one
 * teacher's preference). Per CLAUDE.md §2 the Master/Personal forking
 * model already separates team-shared content from per-teacher overrides;
 * Settings extends that distinction to configuration:
 *
 *   • TEAM   (mycurricula:team:*) — curriculumLabel, school-months,
 *            school-week, holidays.
 *   • USER   (mycurricula:user:*) — theme, palette, view mode, schedules.
 *
 * Today there is no backend, so the team-scoped keys still live in
 * localStorage. When Supabase lands the team keys MIGRATE to a
 * `team_settings` row keyed on the team's grade+school; this storage key
 * names the eventual destination so the migration is grep-able.
 *
 * The legacy v1 key (`mycurricula:curriculum-label`) is read as a
 * fallback for one release so existing teachers don't lose their label.
 */
const CURRICULUM_LABEL_KEY = "mycurricula:team:curriculum-label";
const CURRICULUM_LABEL_KEY_LEGACY = "mycurricula:curriculum-label";

/**
 * Read the stored curriculum label. Prefers the new team-scoped key and
 * falls back to the legacy unscoped key so existing teachers don't lose
 * their label across the rename.
 */
function readCurriculumLabel(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CURRICULUM_LABEL_KEY);
    if (raw != null) return raw;
    // Legacy fallback — read once; the next write under the new key
    // supersedes this, and the legacy entry is harmless if it lingers.
    const legacy = window.localStorage.getItem(CURRICULUM_LABEL_KEY_LEGACY);
    if (legacy != null) return legacy;
    return null;
  } catch {
    return null;
  }
}

/**
 * The signed-in teacher, derived from the Supabase Auth session. Until the
 * session resolves — and whenever the prototype runs without a backend — this
 * falls back to the mock `ME` so the shell still renders a populated avatar.
 */
export interface CurrentUser {
  /** Supabase auth user id. `null` while loading or when signed out. */
  id: string | null;
  name: string;
  email: string;
  /** Two-letter monogram for the top-bar avatar. */
  initials: string;
  /** Google profile photo URL, when the provider supplies one. */
  avatarUrl: string | null;
  /**
   * Free-text curriculum label shown next to the wordmark in the top bar
   * (e.g. "Grade 5", "K-12 Math", "Year 7 Science"). Per CLAUDE.md §1 the
   * app is multi-grade by design — this label is NOT a grade enum, it is
   * whatever the team types in Settings. Optional so the wordmark suffix
   * simply disappears when no label is configured.
   *
   * SCOPE (2026-05-25): TEAM-shared, not user-private. Every teacher on
   * the same grade-level team sees the same wordmark suffix. The field
   * lives on CurrentUser today for read-side convenience, but when
   * Supabase lands it MIGRATES to a `team_settings.curriculum_label`
   * row — see the localStorage comment near `CURRICULUM_LABEL_KEY` for
   * the migration plan. Until then the value is persisted under
   * `mycurricula:team:curriculum-label` (with a one-release legacy
   * fallback for the unscoped v1 key).
   */
  curriculumLabel?: string;
}

// Pre-session placeholder — the mock lead teacher. Keeps the avatar populated
// during the first paint and in backend-less prototype runs. The hard-coded
// "Grade 5" here is SAMPLE DATA matching the beta school's teacher — not a
// product assumption; see the curriculumLabel docstring above.
const FALLBACK_USER: CurrentUser = {
  id: null,
  name: ME.name,
  email: "",
  initials: ME.initials,
  avatarUrl: null,
  curriculumLabel: "Grade 5",
};

/** Derive a two-letter monogram from a display name, falling back to email. */
function initialsFrom(name: string, email: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (email.slice(0, 2) || "?").toUpperCase();
}

/** Map a Supabase Auth user onto the shell's CurrentUser shape. */
function toCurrentUser(user: User): CurrentUser {
  // Google returns the display name and photo under user_metadata; the keys
  // vary by provider (full_name / name, avatar_url / picture) so we try both.
  const meta = user.user_metadata ?? {};
  const email = user.email ?? "";
  const name =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    email ||
    "Teacher";
  const avatarUrl =
    (typeof meta.avatar_url === "string" && meta.avatar_url) ||
    (typeof meta.picture === "string" && meta.picture) ||
    null;
  return {
    id: user.id,
    name,
    email,
    initials: initialsFrom(name, email),
    avatarUrl,
  };
}

export interface AppStateValue {
  /** Grid (matrix/canvas) vs List (flat list of lessons) — persists per teacher. */
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;

  /** Personal vs. Master. Master triggers the heads-up banner sequence. */
  editMode: EditMode;
  setEditMode: (m: EditMode) => void;

  /** The week shown by week-scoped views (Weekly, Daily). */
  week: number;
  setWeek: (w: number) => void;

  /** Day index into the configured school week (0-based) — the Daily view's
   * focused day. The day count comes from the school-week config, not a
   * fixed 5. */
  selectedDay: number;
  setSelectedDay: (d: number) => void;

  /** The subject the Subject view is scoped to. */
  subjectView: SubjectId;
  setSubjectView: (s: SubjectId) => void;

  /** Left-panel filters. Use `updateFilters` for partial changes. */
  filters: PlannerFilters;
  updateFilters: (patch: Partial<PlannerFilters>) => void;
  resetFilters: () => void;

  /** Collapsible left filter panel — open by default. */
  leftPanelOpen: boolean;
  toggleLeftPanel: () => void;

  /** Right-side to-do slide-out. */
  todoPanelOpen: boolean;
  toggleTodoPanel: () => void;

  /** Right-side comments slide-out. */
  commentsPanelOpen: boolean;
  toggleCommentsPanel: () => void;

  /**
   * The lesson whose detail the contextual right panel shows. `null` means
   * the panel is closed (or showing a non-lesson state).
   */
  selectedLessonId: string | null;
  setSelectedLessonId: (id: string | null) => void;

  /** Top-bar search query (the results surface is a later increment). */
  search: string;
  setSearch: (q: string) => void;

  /** The signed-in teacher, derived from the Supabase Auth session. */
  currentUser: CurrentUser;

  /**
   * Update the teacher's curriculum label (the wordmark suffix). Persists to
   * localStorage under `mycurricula:curriculum-label` so the value survives
   * reloads in the prototype; the real Supabase column will pick this up
   * when the backend lands. Passing the empty string clears the label so
   * the wordmark falls back to just "MyCurricula".
   */
  updateCurriculumLabel: (label: string) => void;
}

const AppStateContext = createContext<AppStateValue | null>(null);

/** Read the planner-wide UI state. Throws outside an <AppStateProvider>. */
export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used within an <AppStateProvider>");
  }
  return ctx;
}

interface AppStateProviderProps {
  children: ReactNode;
}

/** Hosts the planner-wide UI state for everything under the shell layout. */
export function AppStateProvider({
  children,
}: AppStateProviderProps): ReactNode {
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [editMode, setEditMode] = useState<EditMode>("personal");
  const [week, setWeek] = useState<number>(CURRENT_WEEK);
  const [selectedDay, setSelectedDay] = useState<number>(0);
  const [subjectView, setSubjectView] = useState<SubjectId>("math");
  const [filters, setFilters] = useState<PlannerFilters>(EMPTY_FILTERS);
  const [leftPanelOpen, setLeftPanelOpen] = useState<boolean>(true);
  const [todoPanelOpen, setTodoPanelOpen] = useState<boolean>(false);
  const [commentsPanelOpen, setCommentsPanelOpen] = useState<boolean>(false);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [search, setSearch] = useState<string>("");

  // Current user — hydrated from the Supabase Auth session on mount and kept
  // in sync via onAuthStateChange (sign-in, sign-out, token refresh).
  const [currentUser, setCurrentUser] = useState<CurrentUser>(FALLBACK_USER);

  // Post-mount: overlay any teacher-edited curriculum label from
  // localStorage so the wordmark reflects what the teacher last typed in
  // Settings → Curriculum. Done in a layout-effect-equivalent post-mount
  // pass to avoid an SSR/CSR hydration mismatch on the wordmark suffix.
  useEffect(() => {
    const stored = readCurriculumLabel();
    if (stored == null) return;
    setCurrentUser((prev) => ({ ...prev, curriculumLabel: stored }));
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const apply = (user: User | null): void => {
      if (active) {
        const next = user ? toCurrentUser(user) : FALLBACK_USER;
        // Preserve any teacher-edited curriculum label from localStorage
        // when the Supabase session resolves — the auth user shape does
        // not carry a curriculumLabel yet (no DB column), so without this
        // overlay the wordmark would lose the teacher's edit on every
        // auth event (initial read, refresh, sign-in).
        const stored = readCurriculumLabel();
        if (stored != null) next.curriculumLabel = stored;
        setCurrentUser(next);
      }
    };

    // Initial read, then subscribe to subsequent auth changes.
    supabase.auth.getUser().then(({ data }) => apply(data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session?.user ?? null);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // Cross-tab sync — when another tab writes a new curriculum label, pick
  // it up here so the top-bar wordmark stays consistent.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent): void => {
      if (e.key !== CURRICULUM_LABEL_KEY) return;
      const next = e.newValue == null ? undefined : e.newValue;
      setCurrentUser((prev) => ({ ...prev, curriculumLabel: next }));
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  // Setter exposed via the context. Writes through to localStorage and
  // updates the in-memory user so consumers (the top-bar wordmark, future
  // export footers, etc.) reflect the change immediately.
  const updateCurriculumLabel = useCallback((label: string): void => {
    const trimmed = label.trim();
    setCurrentUser((prev) => ({
      ...prev,
      curriculumLabel: trimmed === "" ? undefined : trimmed,
    }));
    if (typeof window === "undefined") return;
    try {
      if (trimmed === "") {
        window.localStorage.removeItem(CURRICULUM_LABEL_KEY);
      } else {
        window.localStorage.setItem(CURRICULUM_LABEL_KEY, trimmed);
      }
    } catch {
      // Storage disabled / quota exceeded — state still updates in memory.
    }
  }, []);

  const updateFilters = useCallback((patch: Partial<PlannerFilters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);
  const resetFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);
  const toggleLeftPanel = useCallback(() => setLeftPanelOpen((v) => !v), []);
  // The to-do and comments slide-outs are mutually exclusive — opening one
  // closes the other so the right rail only ever has one job.
  const toggleTodoPanel = useCallback(() => {
    setTodoPanelOpen((v) => !v);
    setCommentsPanelOpen(false);
  }, []);
  const toggleCommentsPanel = useCallback(() => {
    setCommentsPanelOpen((v) => !v);
    setTodoPanelOpen(false);
  }, []);

  const value = useMemo<AppStateValue>(
    () => ({
      viewMode,
      setViewMode,
      editMode,
      setEditMode,
      week,
      setWeek,
      selectedDay,
      setSelectedDay,
      subjectView,
      setSubjectView,
      filters,
      updateFilters,
      resetFilters,
      leftPanelOpen,
      toggleLeftPanel,
      todoPanelOpen,
      toggleTodoPanel,
      commentsPanelOpen,
      toggleCommentsPanel,
      selectedLessonId,
      setSelectedLessonId,
      search,
      setSearch,
      currentUser,
      updateCurriculumLabel,
    }),
    [
      viewMode,
      editMode,
      week,
      selectedDay,
      subjectView,
      filters,
      updateFilters,
      resetFilters,
      leftPanelOpen,
      toggleLeftPanel,
      todoPanelOpen,
      toggleTodoPanel,
      commentsPanelOpen,
      toggleCommentsPanel,
      selectedLessonId,
      search,
      currentUser,
      updateCurriculumLabel,
    ],
  );

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}
