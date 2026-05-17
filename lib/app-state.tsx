"use client";

// app-state.tsx — the planner-wide UI state shared by the app shell and
// every view. This is the contract the top bar, side panels, and the
// Weekly / Daily / Subject views all read and write.
//
// It holds *view state*, not domain data: which week is showing, which
// day is selected, the active filters, the Personal/Master edit mode, the
// Simple/Task/Advanced view mode, and which panels are open. Domain data
// still comes from `lib/mock`.
//
// Routing owns the *active view* (Weekly vs Daily vs …) — read it with
// `usePathname()`; it is intentionally not duplicated here.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { LessonStatus, SubjectId } from "@/lib/types";
import { CURRENT_WEEK } from "@/lib/mock";

/** Low-floor / high-ceiling UI complexity — the top-bar three-way pill. */
export type ViewMode = "simple" | "task" | "advanced";

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

export interface AppStateValue {
  /** Simple / Task / Advanced — persists per teacher in a real backend. */
  viewMode: ViewMode;
  setViewMode: (m: ViewMode) => void;

  /** Personal vs. Master. Master triggers the heads-up banner sequence. */
  editMode: EditMode;
  setEditMode: (m: EditMode) => void;

  /** The week shown by week-scoped views (Weekly, Daily). */
  week: number;
  setWeek: (w: number) => void;

  /** Day index 0–4 (Sun–Thu) — the Daily view's focused day. */
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
  const [viewMode, setViewMode] = useState<ViewMode>("advanced");
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
    ],
  );

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}
