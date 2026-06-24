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
import {
  PROFILE_EVENT,
  PROFILE_STORAGE_KEY,
  deriveInitials,
  readStoredDisplayName,
} from "@/lib/use-account-settings";

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
 * Per-view Grid/List preference.
 *
 * Each primary view (Weekly, Daily, Yearly, Subject/Curriculum, Catch-up)
 * remembers its OWN Grid↔List choice — flipping Weekly to List does not change
 * Yearly. USER-scoped (a per-teacher preference), persisted to localStorage and
 * synced across tabs. SSR-safe: the server and the first client paint both use
 * DEFAULT_VIEW_MODES; the stored values arrive in a post-mount effect, so there
 * is no hydration mismatch on the rendered layout.
 */
export type ViewKey = "weekly" | "daily" | "year" | "subject" | "catchup";

const VIEW_KEYS: readonly ViewKey[] = [
  "weekly",
  "daily",
  "year",
  "subject",
  "catchup",
];

const VIEW_MODE_KEY = "mycurricula:user:view-mode-by-view";

const DEFAULT_VIEW_MODES: Record<ViewKey, ViewMode> = {
  weekly: "grid",
  daily: "grid",
  year: "grid",
  subject: "grid",
  // Catch-up's original/primary surface is the grouped row list (where note
  // editing lives); Grid is the alternate. Default to "list" so first-load
  // matches the established Catch-up experience.
  catchup: "list",
};

/**
 * Read the per-view mode map from localStorage, falling back to the default
 * for any missing or invalid entry. SSR-safe (returns defaults with no window).
 */
function readViewModes(): Record<ViewKey, ViewMode> {
  if (typeof window === "undefined") return { ...DEFAULT_VIEW_MODES };
  try {
    const raw = window.localStorage.getItem(VIEW_MODE_KEY);
    if (!raw) return { ...DEFAULT_VIEW_MODES };
    const parsed = JSON.parse(raw) as Partial<Record<ViewKey, unknown>>;
    const result = { ...DEFAULT_VIEW_MODES };
    for (const key of VIEW_KEYS) {
      const v = parsed[key];
      if (v === "grid" || v === "list") result[key] = v;
    }
    return result;
  } catch {
    return { ...DEFAULT_VIEW_MODES };
  }
}

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
  /**
   * Per-view Grid (matrix/canvas) vs List (flat list) preference. Each primary
   * view remembers its own choice independently, persisted per teacher. Read a
   * view's mode with `getViewMode(view)`; change it with `setViewMode(view, m)`.
   */
  getViewMode: (view: ViewKey) => ViewMode;
  setViewMode: (view: ViewKey, mode: ViewMode) => void;

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
   * The Schedule side-drawer (components/schedule/SchedulePanel). Lives on
   * app-state rather than local-to-rail because the trigger sits in the
   * GlobalRail (mounted by the planner shell) while the panel is mounted
   * by the same shell — two siblings that need to share open/close. Same
   * cross-component ownership rationale as todoPanelOpen / commentsPanelOpen.
   *
   * NOT mutually exclusive with the todo/comments drawers — the schedule
   * is a left-side, top-anchored peek at "what's next" rather than a
   * right-side lesson-scoped panel, so a teacher can have it open while
   * also looking at to-dos or comments.
   */
  scheduleOpen: boolean;
  toggleSchedulePanel: () => void;
  closeSchedulePanel: () => void;

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
  const [viewModes, setViewModes] =
    useState<Record<ViewKey, ViewMode>>(DEFAULT_VIEW_MODES);
  const [editMode, setEditMode] = useState<EditMode>("personal");
  const [week, setWeek] = useState<number>(CURRENT_WEEK);
  const [selectedDay, setSelectedDay] = useState<number>(0);
  const [subjectView, setSubjectView] = useState<SubjectId>("math");
  const [filters, setFilters] = useState<PlannerFilters>(EMPTY_FILTERS);
  const [leftPanelOpen, setLeftPanelOpen] = useState<boolean>(true);
  const [todoPanelOpen, setTodoPanelOpen] = useState<boolean>(false);
  const [commentsPanelOpen, setCommentsPanelOpen] = useState<boolean>(false);
  // Schedule side-drawer open state. Cross-component (GlobalRail trigger +
  // SchedulePanel mount both live in the shell layout), so it lives here
  // alongside the other planner-wide panel toggles.
  const [scheduleOpen, setScheduleOpen] = useState<boolean>(false);
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

  // Post-mount: overlay the teacher-chosen display name (Settings →
  // Account, persisted under `mycurricula:user:profile`) over the mock
  // fallback so the top-bar / SideNav avatar reflects the chosen name.
  // Same SSR-safety rationale as the curriculum-label overlay above —
  // the initial render must use ME so server HTML matches first paint.
  useEffect(() => {
    const stored = readStoredDisplayName();
    if (stored == null) return;
    setCurrentUser((prev) => ({
      ...prev,
      name: stored,
      initials: deriveInitials(stored),
    }));
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
        // Same overlay for the Settings → Account display name: the
        // locally-chosen name (and its derived initials) wins over the
        // auth-profile name until Supabase profile rows land (Phase 1B).
        // Without this, any auth event (initial read, token refresh,
        // sign-in) would clobber the teacher's rename.
        const storedName = readStoredDisplayName();
        if (storedName != null) {
          next.name = storedName;
          next.initials = deriveInitials(storedName);
        }
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

  // Display-name sync — two channels for the same key:
  //   • `storage` event  — a rename in ANOTHER tab (Settings → Account
  //     open in tab B while /weekly sits in tab A).
  //   • PROFILE_EVENT    — a rename in THIS tab (the `storage` event never
  //     fires on the writing tab; lib/use-account-settings dispatches the
  //     custom event after each write so the avatar updates live).
  // Both re-read storage so there is a single source of truth. Clearing
  // falls back to the mock ME name — when real Supabase profiles land
  // (Phase 1B) the fallback becomes the auth-profile name instead.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const applyStoredName = (): void => {
      const stored = readStoredDisplayName();
      setCurrentUser((prev) => ({
        ...prev,
        name: stored ?? ME.name,
        initials: stored != null ? deriveInitials(stored) : ME.initials,
      }));
    };
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== PROFILE_STORAGE_KEY) return;
      applyStoredName();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(PROFILE_EVENT, applyStoredName);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(PROFILE_EVENT, applyStoredName);
    };
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
  // Schedule drawer toggle. Intentionally does NOT close the todo/comments
  // drawers — see the scheduleOpen docstring on AppStateValue: the schedule
  // is a different anchor (left rail trigger vs right rail) so it can
  // coexist with the right-side panels.
  const toggleSchedulePanel = useCallback(() => {
    setScheduleOpen((v) => !v);
  }, []);
  const closeSchedulePanel = useCallback(() => {
    setScheduleOpen(false);
  }, []);

  // Per-view Grid/List preference — hydrate from localStorage post-mount so the
  // server + first client paint match (DEFAULT_VIEW_MODES), then overlay the
  // stored choices. Also sync across tabs (a flip in Settings/another tab).
  useEffect(() => {
    setViewModes(readViewModes());
    const onStorage = (e: StorageEvent) => {
      if (e.key !== VIEW_MODE_KEY) return;
      setViewModes(readViewModes());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const getViewMode = useCallback(
    (view: ViewKey): ViewMode => viewModes[view] ?? "grid",
    [viewModes],
  );

  const setViewMode = useCallback((view: ViewKey, mode: ViewMode): void => {
    setViewModes((prev) => {
      if (prev[view] === mode) return prev;
      const next = { ...prev, [view]: mode };
      try {
        window.localStorage.setItem(VIEW_MODE_KEY, JSON.stringify(next));
      } catch {
        // Storage disabled / quota exceeded — in-memory state still updates.
      }
      return next;
    });
  }, []);

  const value = useMemo<AppStateValue>(
    () => ({
      getViewMode,
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
      scheduleOpen,
      toggleSchedulePanel,
      closeSchedulePanel,
      selectedLessonId,
      setSelectedLessonId,
      search,
      setSearch,
      currentUser,
      updateCurriculumLabel,
    }),
    [
      getViewMode,
      setViewMode,
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
      scheduleOpen,
      toggleSchedulePanel,
      closeSchedulePanel,
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
