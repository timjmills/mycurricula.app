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
   * whatever the teacher (or school) types in Settings. Optional so the
   * wordmark suffix simply disappears when no label is configured.
   *
   * No DB column exists yet — real Supabase users currently resolve as
   * `undefined`; the FALLBACK_USER seeds "Grade 5" so the prototype's
   * wordmark still reads "MyCurricula Grade 5" until Lane S lands the
   * Settings UI + Supabase column.
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

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const apply = (user: User | null): void => {
      if (active) setCurrentUser(user ? toCurrentUser(user) : FALLBACK_USER);
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
    ],
  );

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}
