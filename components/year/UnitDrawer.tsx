"use client";

// UnitDrawer — the tabbed Year drill-down drawer.
//
// This extracts + upgrades the inline `renderDetail` block that used to live in
// TimelineYear: the old expand-under-row detail showed only the Unit Overview
// (weeks → days). Here that same Overview becomes ONE tab of a five-tab drawer
// whose left mini-nav also surfaces the unit's Resources, Standards,
// Assessments, and Notes. The Overview tab preserves the original behavior
// byte-for-byte — the week cards, the day cards, the WeekCircle status marker,
// and every aria-label / sr-only status string the accessibility pass added.
//
// The non-Overview tabs derive their content from the unit's OWN lessons via
// the pure helpers in `lib/year-unit-aggregate.ts` — there is no unit-level
// resource/standard/note entity in the data model yet (Phase 1B+), so these are
// REAL data rolled up from the lessons, never fabricated placeholders. The
// Assessments tab is an honest stub (no assessment data exists yet).
//
// Visual contract: the PARENT wraps this in `.cp-subj.<subject.cls>` so the
// palette bridge's --c / --cl / --cd tokens cascade; this module derives every
// accent from those three tokens via color-mix toward --surface. Tokens only —
// no hex, no px font sizes. The drawer mirrors TimelineYear's `.dhead` / `.wk`
// / `.day` / `.dhint` idioms in a separate module.

import { useMemo, useState, type ReactNode, type SVGProps } from "react";
import type { Lesson, LessonStatus, Subject } from "@/lib/types";
import {
  unitResources,
  unitStandards,
  unitNotes,
} from "@/lib/year-unit-aggregate";
import { StandardPill } from "@/components/ui";
import styles from "./unit-drawer.module.css";

// Weekday short labels keyed by `Lesson.day` (0 = Sunday). Hard-coded per the
// component contract — a self-contained map so the drawer needs no week-config
// import; an out-of-range day degrades to "Day N".
const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** The short weekday label for a 0-based day index (Sun…Sat), falling back to
 *  "Day N" for any out-of-range index. */
function dayShort(day: number): string {
  return DAY_SHORT[day] ?? `Day ${day + 1}`;
}

// ── Inline icons (Lucide-family, currentColor) ──────────────────────────────
// Mirrors TimelineYear's `Svg`/Icon idiom: a 24×24 viewBox, stroke currentColor,
// stroke-width 2, aria-hidden. The drawer adds a few tab glyphs on top of the
// Overview icons it shares with TimelineYear.

type IconProps = SVGProps<SVGSVGElement> & { sw?: number };
function Svg({
  sw = 2,
  children,
  ...rest
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}
const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 13 4 4 10-11" />
  </Svg>
);
const IconChevUp = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 15 6-6 6 6" />
  </Svg>
);
const IconArrowR = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);
const IconInfo = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8h.01M11 12h1v4h1" />
  </Svg>
);
const IconDoc = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3v4a1 1 0 0 0 1 1h4" />
    <path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
  </Svg>
);
// Tab glyphs ───────────────────────────────────────────────────────────────
const IconGrid = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </Svg>
);
const IconFolder = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </Svg>
);
const IconRibbon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="9" r="6" />
    <path d="m8.5 13.5-2 7 5.5-3 5.5 3-2-7" />
  </Svg>
);
const IconCheckCircle = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5L16 9" />
  </Svg>
);
const IconNote = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6" />
    <path d="M14 21l3-3 4-4-3-3-4 4-3 3v3z" />
  </Svg>
);
const IconLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
    <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
  </Svg>
);

// ── Public contract ─────────────────────────────────────────────────────────
// DrawerWeek / UnitDrawerProps are defined LOCALLY (not imported from
// TimelineYear) so the two files never form an import cycle — the integrator
// adapts TimelineYear's WeekGroup into this DrawerWeek at the callsite.

export interface DrawerWeek {
  /** 1-based curriculum week number. */
  week: number;
  /** This week's lessons, already sorted by day. */
  lessons: Lesson[];
  /** Rolled-up status for the week's circle marker. */
  state: "done" | "cur" | "todo";
}

export interface UnitDrawerProps {
  /** The unit's subject — carries `.icon` (ReactNode), `.name`, `.cls`, `.id`. */
  subject: Subject;
  /** Raw unit name; may carry a "Prefix · Real Name" lead-in (split below). */
  unitName: string;
  /** Week-span label, e.g. "Wk 11–16". */
  spanLabel: string;
  /** Total lessons planned in this unit. */
  totalLessons: number;
  /** This unit's weeks, each with its sorted lessons + rolled-up state. */
  weeks: DrawerWeek[];
  /** Flat list of THIS unit's lessons (drives the aggregation tabs). */
  lessons: Lesson[];
  /** The currently open week (1-based), or null when none is selected. */
  openWeek: number | null;
  /** Toggle a week open/closed. */
  onPickWeek: (week: number) => void;
  /** Open a lesson in the app's lesson-detail surface. */
  onOpenLesson: (lessonId: string) => void;
  /** Collapse the whole drawer. */
  onClose: () => void;
}

/** The drawer's five tab ids. */
type TabKey = "overview" | "resources" | "standards" | "assessments" | "notes";

/** Tab metadata for the left mini-nav. `icon` is rendered at 24×24. */
const TABS: ReadonlyArray<{
  key: TabKey;
  label: string;
  icon: (p: IconProps) => ReactNode;
}> = [
  { key: "overview", label: "Unit Overview", icon: IconGrid },
  { key: "resources", label: "Resources", icon: IconFolder },
  { key: "standards", label: "Standards", icon: IconRibbon },
  { key: "assessments", label: "Assessments", icon: IconCheckCircle },
  { key: "notes", label: "Notes", icon: IconNote },
];

// ── Local helpers (mirror TimelineYear's) ────────────────────────────────────

/** Strip a "Unit N · " / "List N · " lead-in so the title can show a bold
 *  prefix + a lighter remainder. Mirrors TimelineYear's splitUnitName so the
 *  drawer header reads identically. */
function splitUnitName(name: string): { prefix: string; rest: string } {
  const idx = name.indexOf("·");
  if (idx === -1) return { prefix: "", rest: name.trim() };
  return {
    prefix: name.slice(0, idx).trim(),
    rest: name.slice(idx + 1).trim(),
  };
}

/** Week-chip secondary line — the first lesson's objective with a leading
 *  "I can " stripped, else the first lesson's title with the unit-name prefix
 *  peeled off, else empty. Mirrors TimelineYear's weekChipText so the Overview
 *  reads the same. Always a single ellipsized line (see `.wd`). */
function weekChipText(week: DrawerWeek, unitName: string): string {
  const first = week.lessons[0];
  if (!first) return "";

  const objective = first.objective?.trim();
  if (objective) {
    const stripped = objective.replace(/^i\s+can\s+/i, "").trim();
    if (stripped) return stripped.charAt(0).toUpperCase() + stripped.slice(1);
  }

  const title = first.title?.trim() ?? "";
  if (!title) return "";
  const { rest: unitReal } = splitUnitName(unitName);
  for (const prefix of [unitReal, unitName]) {
    const p = prefix.trim();
    if (!p || p.length >= title.length) continue;
    if (title.toLowerCase().startsWith(p.toLowerCase())) {
      const tail = title
        .slice(p.length)
        .replace(/^[\s·–—:-]+/, "")
        .trim();
      if (tail) return tail;
    }
  }
  return title;
}

/** Human label for a week's rolled-up status — the accessible text behind the
 *  colour-only WeekCircle. Mirrors TimelineYear's weekStateLabel. */
function weekStateLabel(state: DrawerWeek["state"]): string {
  switch (state) {
    case "done":
      return "Completed";
    case "cur":
      return "In progress";
    default:
      return "Not started";
  }
}

/** Human label for a lesson's status — the accessible text behind the colour-
 *  only day dot. Mirrors TimelineYear's dayStatusLabel. */
function dayStatusLabel(status: LessonStatus): string {
  switch (status) {
    case "done":
      return "Completed";
    case "skipped":
      return "Skipped";
    case "partial":
    case "carried":
      return "In progress";
    default:
      return "Not started";
  }
}

/** Per-lesson status → the small day-dot class suffix. Mirrors
 *  TimelineYear's dayDotClass. */
function dayDotClass(status: LessonStatus): string {
  switch (status) {
    case "done":
      return styles.done;
    case "skipped":
      return styles.skipped;
    case "partial":
    case "carried":
      return styles.cur;
    default:
      return "";
  }
}

// ── Safe href guard ──────────────────────────────────────────────────────────
// Copied from LessonPhasePanel.safeHref (which mirrors the canonical isSafeUrl
// in ResourceEmbed): a resource URL can come from free-text input or imported
// rows, so every rendered link routes through this so an unsafe scheme
// (javascript:, data:, …) yields plain text rather than a clickable script
// vector. Allows http(s)/blob: and same-origin root-relative paths; rejects
// protocol-relative ("//host") and backslash ("/\host") tricks.
function safeHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(https?|blob):/i.test(url)) return url;
  return /^\/(?![/\\])/.test(url) ? url : undefined;
}

// ── Week circle marker (ported from TimelineYear.WeekCircle) ─────────────────

function WeekCircle({ state }: { state: DrawerWeek["state"] }): ReactNode {
  // The circle is colour-only, so it carries a visually-hidden status label for
  // screen readers — "Completed / In progress / Not started".
  const sr = <span className={styles.sr}>{weekStateLabel(state)}</span>;
  if (state === "done")
    return (
      <span className={`${styles.cir} ${styles.done}`}>
        <IconCheck sw={3} aria-hidden="true" />
        {sr}
      </span>
    );
  if (state === "cur")
    return <span className={`${styles.cir} ${styles.cur}`}>{sr}</span>;
  return <span className={styles.cir}>{sr}</span>;
}

// ── Component ────────────────────────────────────────────────────────────────

export function UnitDrawer({
  subject,
  unitName,
  spanLabel,
  totalLessons,
  weeks,
  lessons,
  openWeek,
  onPickWeek,
  onOpenLesson,
  onClose,
}: UnitDrawerProps): ReactNode {
  const [tab, setTab] = useState<TabKey>("overview");

  // The aggregation tabs derive from the unit's lessons — memoized since the
  // helpers are pure + side-effect-free (each recomputes only when `lessons`
  // changes, e.g. a new edit lands).
  const resources = useMemo(() => unitResources(lessons), [lessons]);
  const standards = useMemo(() => unitStandards(lessons), [lessons]);
  const notes = useMemo(() => unitNotes(lessons), [lessons]);

  const { prefix, rest } = splitUnitName(unitName);
  const activeTabLabel =
    TABS.find((t) => t.key === tab)?.label ?? "Unit Overview";

  return (
    <div className={styles.drawer}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className={styles.dhead}>
        <span className={styles.di} aria-hidden="true">
          {subject.icon}
        </span>
        <div className={styles.htext}>
          <div className={styles.dt}>
            {prefix ? (
              <>
                <b>{prefix}</b>&nbsp;&nbsp;{rest}
              </>
            ) : (
              <b>{rest}</b>
            )}
          </div>
          <div className={styles.dd}>
            {spanLabel} · {totalLessons}{" "}
            {totalLessons === 1 ? "lesson" : "lessons"} planned
          </div>
        </div>
        <button
          type="button"
          className={styles.dclose}
          onClick={onClose}
          aria-label="Collapse unit"
        >
          <IconChevUp />
        </button>
      </div>

      {/* ── Body: left tab nav + main panel ──────────────────────────────── */}
      <div className={styles.dbody}>
        {/* Left mini-nav — a vertical tablist on desktop, a horizontal
            scrollable strip on phone (see the CSS module's ≤640px rules). */}
        <div className={styles.dnav} role="tablist" aria-label="Unit details">
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = key === tab;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                id={`unit-tab-${key}`}
                aria-selected={active}
                aria-controls="unit-tabpanel"
                className={`${styles.tabBtn} ${active ? styles.tabActive : ""}`}
                onClick={() => setTab(key)}
              >
                <Icon className={styles.tabIcon} aria-hidden="true" />
                <span className={styles.tabLabel}>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Main panel — one tabpanel re-labelled per active tab. */}
        <div
          className={styles.dmain}
          role="tabpanel"
          id="unit-tabpanel"
          aria-label={activeTabLabel}
        >
          {tab === "overview" && (
            <OverviewTab
              unitName={unitName}
              weeks={weeks}
              openWeek={openWeek}
              onPickWeek={onPickWeek}
              onOpenLesson={onOpenLesson}
            />
          )}
          {tab === "resources" && <ResourcesTab resources={resources} />}
          {tab === "standards" && <StandardsTab standards={standards} />}
          {tab === "assessments" && <AssessmentsTab />}
          {tab === "notes" && <NotesTab notes={notes} />}
        </div>
      </div>
    </div>
  );
}

// ── Overview tab (the ported weeks → days drill-down) ────────────────────────

function OverviewTab({
  unitName,
  weeks,
  openWeek,
  onPickWeek,
  onOpenLesson,
}: {
  unitName: string;
  weeks: DrawerWeek[];
  openWeek: number | null;
  onPickWeek: (week: number) => void;
  onOpenLesson: (lessonId: string) => void;
}): ReactNode {
  const openGroup =
    openWeek == null ? null : (weeks.find((w) => w.week === openWeek) ?? null);

  return (
    <>
      <div className={styles.weeksLabel}>Weeks</div>

      {weeks.length === 0 ? (
        <div className={styles.empty}>No lessons planned for this unit yet.</div>
      ) : (
        <div className={styles.weeks}>
          {weeks.map((w) => (
            <button
              key={w.week}
              type="button"
              className={`${styles.wk} ${w.week === openWeek ? styles.sel : ""}`}
              onClick={() => onPickWeek(w.week)}
              aria-expanded={w.week === openWeek}
            >
              <div className={styles.wst}>
                <WeekCircle state={w.state} />
              </div>
              <div className={styles.wn}>Week {w.week}</div>
              <div className={styles.wd}>{weekChipText(w, unitName)}</div>
              <div className={styles.wdt}>
                {w.lessons.length}{" "}
                {w.lessons.length === 1 ? "lesson" : "lessons"}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Days for the selected week */}
      {openWeek == null ? (
        weeks.length > 0 ? (
          <div className={styles.daysrow}>
            <div className={styles.dhint}>
              <IconInfo /> Select a week above to see its daily lessons.
            </div>
          </div>
        ) : null
      ) : openGroup ? (
        <div className={styles.daysrow}>
          <div className={styles.daysHeadRow}>
            <div className={styles.dlabel}>
              <b>Week {openGroup.week}</b>
              {/* The hint is dropped once a week is open + has days — the day
                  cards' "Open lesson →" affordance makes the action obvious. It
                  stays only when the week has lessons but reads ambiguous. */}
              {openGroup.lessons.length > 0 ? (
                <span>Select a day to open its lesson</span>
              ) : null}
            </div>
            {/* Plan Week + overflow — VISUAL AFFORDANCES for a later phase
                (week-level planning isn't wired yet). They render so the toolbar
                reads complete; neither carries a handler today. */}
            <div className={styles.weekActions}>
              <button
                type="button"
                className={styles.planWeek}
                title="Plan this week"
              >
                <IconCalendar className={styles.planIcon} aria-hidden="true" />
                <span>Plan Week</span>
              </button>
              <button
                type="button"
                className={styles.weekMore}
                aria-label="More week actions"
                title="More week actions"
              >
                <IconMore aria-hidden="true" />
              </button>
            </div>
          </div>

          {openGroup.lessons.length === 0 ? (
            <div className={styles.empty}>No lessons planned for this week.</div>
          ) : (
            <div className={styles.days}>
              {openGroup.lessons.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={styles.day}
                  onClick={() => onOpenLesson(l.id)}
                  title={l.title}
                  // Spell the whole action + status out for screen readers: the
                  // dot, day, and "Open" hint are all visual, so the button
                  // itself names the lesson, its day, its status, and the click.
                  aria-label={`Open lesson: ${l.title} — ${dayShort(
                    l.day,
                  )}, ${dayStatusLabel(l.status)}`}
                >
                  <div className={styles.dtop}>
                    <div className={styles.dn}>{dayShort(l.day)}</div>
                    <span
                      className={`${styles.statusDot} ${dayDotClass(l.status)}`}
                      aria-hidden="true"
                    />
                  </div>
                  <div className={styles.dttl}>{l.title}</div>
                  {/* "Open lesson" affordance — the document icon + label are
                      always visible at rest; only the arrow animates on hover. */}
                  <div className={styles.dfoot}>
                    <IconDoc aria-hidden="true" />
                    <span className={styles.dopen}>
                      Open lesson
                      <IconArrowR className={styles.dgo} sw={2.4} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </>
  );
}

// Extra Overview-toolbar glyphs (calendar + overflow), defined here since they
// are used only by the Overview tab's placeholder week actions.
const IconCalendar = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M3 9h18M8 2v4M16 2v4" />
  </Svg>
);
const IconMore = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5" cy="12" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="19" cy="12" r="1" />
  </Svg>
);

// ── Resources tab ────────────────────────────────────────────────────────────

function ResourcesTab({
  resources,
}: {
  resources: ReturnType<typeof unitResources>;
}): ReactNode {
  if (resources.length === 0) {
    return (
      <EmptyState
        icon={<IconFolder />}
        text="No resources attached to this unit's lessons yet."
      />
    );
  }
  return (
    <ul className={styles.aggList}>
      {resources.map((ref, i) => {
        const isNote = ref.resource.type === "notecard";
        const href = isNote ? undefined : safeHref(ref.resource.url);
        return (
          // Resources are NOT de-duplicated across lessons (a recurring anchor
          // chart legitimately repeats), so a composite key keeps each row
          // stable even when the same label appears under two lessons.
          <li
            key={`${ref.lessonId}-${i}`}
            className={styles.aggRow}
          >
            <span className={styles.aggGlyph} aria-hidden="true">
              {isNote ? <IconNote /> : <IconLink />}
            </span>
            <span className={styles.aggBody}>
              <span className={styles.aggLabel}>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.aggLink}
                  >
                    {ref.resource.label}
                  </a>
                ) : (
                  ref.resource.label
                )}
              </span>
              <span className={styles.aggMeta}>
                Wk {ref.week} · {dayShort(ref.day)}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ── Standards tab ────────────────────────────────────────────────────────────

function StandardsTab({
  standards,
}: {
  standards: ReturnType<typeof unitStandards>;
}): ReactNode {
  if (standards.length === 0) {
    return (
      <EmptyState
        icon={<IconRibbon />}
        text="No standards tagged on this unit's lessons yet."
      />
    );
  }
  return (
    <ul className={styles.aggList}>
      {standards.map((ref) => (
        <li key={ref.code} className={styles.aggRow}>
          <StandardPill code={ref.code} />
          <span className={styles.aggMeta}>
            in {ref.lessonCount} {ref.lessonCount === 1 ? "lesson" : "lessons"}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Assessments tab (honest stub — no assessment data exists yet) ────────────

function AssessmentsTab(): ReactNode {
  return (
    <div className={styles.stub}>
      <span className={styles.stubIcon} aria-hidden="true">
        <IconCheckCircle />
      </span>
      <div className={styles.stubTitle}>
        Assessments are coming in a later phase.
      </div>
      <div className={styles.stubLine}>
        Track quizzes, rubrics, and unit checks here.
      </div>
    </div>
  );
}

// ── Notes tab ────────────────────────────────────────────────────────────────

function NotesTab({
  notes,
}: {
  notes: ReturnType<typeof unitNotes>;
}): ReactNode {
  if (notes.length === 0) {
    return (
      <EmptyState
        icon={<IconNote />}
        text="No teacher notes for this unit yet."
      />
    );
  }
  return (
    <ul className={styles.aggList}>
      {notes.map((ref, i) => (
        <li key={`${ref.lessonId}-${i}`} className={styles.aggRow}>
          <span className={styles.aggGlyph} aria-hidden="true">
            <IconNote />
          </span>
          <span className={styles.aggBody}>
            <span className={styles.aggNoteText}>{ref.text}</span>
            <span className={styles.aggMeta}>
              Wk {ref.week} · {dayShort(ref.day)} · {ref.lessonTitle}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ── Shared empty state ───────────────────────────────────────────────────────

function EmptyState({
  icon,
  text,
}: {
  icon: ReactNode;
  text: string;
}): ReactNode {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon} aria-hidden="true">
        {icon}
      </span>
      <div className={styles.emptyText}>{text}</div>
    </div>
  );
}
