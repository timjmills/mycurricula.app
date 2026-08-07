"use client";

// DayFocus.tsx — THE Day view. One layout, every frame, every theme.
//
// ── WHY THERE IS ONLY ONE ──────────────────────────────────────────────────
// /daily used to branch its LAYOUT on the appearance frame: DayA (glass) was a
// vertical timeline of full-width rows, DayB (paper) a subject rail + a white
// focus panel, DayC (color) an agenda + a subject-tinted hero. A teacher who
// changed their background material got a different INFORMATION ARCHITECTURE,
// which is not what an appearance axis is for. The user settled it on
// 2026-08-01: one Day view, for every frame and every theme. This file is
// DayC's agenda + hero — the handoff's focus-card shape — promoted to the Day
// view /daily renders.
//
// THE HANDOFF SPECIFIES TWO DAYS, NOT ONE. An earlier version of this comment
// claimed "the handoff only ever specifies one Day", and that is false: 7.21
// source-home/app.jsx:522 dispatches `{A: ViewsA, B: ViewsC, C: ViewsC}`, so
// frame A gets its own DayA (views-a.jsx:8-54) — a vertical timeline with a
// per-row Finish pill (:33-40) and a per-row Plan|Post|Teach split (:41-45) —
// while B and C share DayC. Shipping ONE Day is the user's decision above and
// it stands; it is a deliberate divergence from the handoff, not conformance
// with it, and the difference matters if anyone later re-reads the handoff to
// settle a question about this view.
//
// DayA and DayB are still in the folder, at the user's request, until they
// decide what to merge or delete ("keep all three of the views until later").
// They render only for an explicit `?dayview=a|b`; see DayViewV2. Nothing in
// THIS file should grow a branch for them. DayC itself is GONE — it was this
// card's parent and rendered the same information architecture from a second,
// already-diverged copy, so `?dayview=c` compared nothing and showed a card
// missing the resource count.
//
// ── "ONE LAYOUT" IS NOT "ONE APPEARANCE" ───────────────────────────────────
// Frame, theme and tone still drive MATERIAL and COLOUR — they just no longer
// move a single box. Everything here reads `data-tone` through the token set
// (never the theme, CLAUDE.md §4) and the subject scale through the `.cp-subj`
// cascade, so the same DOM survives Wash / Photo-Dim / Photo-Bright / Night.
//
// ── EVERYTHING FLOATS ON THE PHOTOGRAPH ────────────────────────────────────
// There is no containing panel: the day-nav bar, the rail and the focus card
// float independently. That is a readability hazard, not a free win — commits
// d92a50d and be181cc were spent on text that sat on the stage photo with no
// surface of its own (ratios as low as 2.7:1). The handoff answers it three
// DIFFERENT ways, and day-v2.module.css follows each: the day-nav bar is bare
// and buys legibility with a text-shadow halo, the rail is a filled panel, and
// the focus card is an opaque subject gradient. Read the notes on each there —
// including which of them may not `backdrop-filter` — before thinning any.
//
// ── ONE PLACE TO ACT ───────────────────────────────────────────────────────
// The rail is pure navigation: a row click focuses that lesson and nothing
// else. Plan / Post / Open in Teach live only on the focus card, so there is
// exactly one place to act on the day's lessons (the retired DayA put a
// Plan|Post|Teach split on every row — six copies of three buttons).
//
// Selection is SHELL-OWNED (props selectedId / onSelect), seeded
// current → next → first. Bundle: views-c.jsx DayC (B:6231-6288), CSS
// B:969-1000.

import { type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { usePlanner } from "@/lib/planner-store";
import {
  deriveDayStatus,
  currentAndNext,
  type DayStatus,
} from "@/lib/day-status";
import { lessonTime } from "@/lib/mock/schedule";
import { stripHtml } from "@/lib/html-text";
import { unitDisplayName } from "@/lib/unit-name";
import { lessonResourceCount } from "@/lib/lesson-resources";
import { Tooltip } from "@/components/ui";
import { UnitChip } from "@/components/unit-chip";
import type { Lesson } from "@/lib/types";
import { ForkCues, FinishPill, AddLessonMenu, SelectTitle } from "./atoms";
import {
  useNowMin,
  fromInteractive,
  lessonFlowSteps,
  splitStandardChips,
} from "./util";
import { DayEmptyState } from "./DayEmptyState";
import { DayHeader } from "./DayHeader";
import type { DayViewV2Props } from "./DayViewV2";
import styles from "./day-v2.module.css";

/**
 * The footer's status chip — or `null` when the Finish pill beside it already
 * says the same thing.
 *
 * THE CARD USED TO STATE ITS STATUS TWICE, SIDE BY SIDE. This returned a word
 * for every status and the chip rendered unconditionally, immediately before
 * `<FinishPill>` — which carries its own status word (atoms.tsx `STATUS_WORD`
 * + the "Done" branch). The pairs were:
 *
 *   done      chip "Complete"    · pill "Done"      → same fact, two words
 *   idle      chip "Planned"     · pill "Planned"   → the IDENTICAL string,
 *                                                     twice, 8px apart
 *   upcoming  chip "Planned"     · pill "Up next"   → the pill is strictly
 *                                                     more informative
 *   now       chip "In progress" · pill "Finish"    → state + ACTION; these
 *                                                     are different jobs
 *
 * So the rule is not "hide it when done" (the audit only caught that pair);
 * it is: THE CHIP SPEAKS ONLY WHEN THE PILL DOES NOT. The pill wins because it
 * is both the label and the control — a teacher reads the status off the thing
 * that changes it — and because the handoff has no Finish pill at all and puts
 * status in a single chip (7.21 source-home/views-c.jsx:52, byte-identical in
 * the 7.2 and 6.24 bundles). Dropping the duplicate is a RETURN to the
 * handoff's one-status-statement footer, not a divergence from it.
 *
 * `now` is the one state where both earn their place: the pill has stopped
 * reporting and started asking ("Finish"), so nothing else on the card would
 * say the lesson is under way.
 */
function statusLine(status: DayStatus): string | null {
  return status === "now" ? "In progress" : null;
}

/** Pick the focused lesson: global selection when in this day, else the
 *  current → next → first fallback (decision 1). Off-today the current/next
 *  collapse, so the fallback becomes selectedId → first. */
function pickFocus(
  dayLessons: Lesson[],
  selectedId: string | null,
  nowMin: number,
  isToday: boolean,
): Lesson | undefined {
  if (dayLessons.length === 0) return undefined;
  if (selectedId && dayLessons.some((l) => l.id === selectedId)) {
    return dayLessons.find((l) => l.id === selectedId);
  }
  const { currentId, nextId } = currentAndNext(dayLessons, nowMin, isToday);
  const seed = currentId ?? nextId ?? dayLessons[0].id;
  return dayLessons.find((l) => l.id === seed) ?? dayLessons[0];
}

export function DayFocus(props: DayViewV2Props): ReactNode {
  const {
    dayLessons,
    dayLabel,
    dateLabel,
    isToday,
    selectedId,
    onSelect,
    holidayNode,
    onShiftDay,
    onPlan,
    onQuickAdd,
    quickAdding,
    quickAddError,
    onAddEvent,
  } = props;
  const router = useRouter();
  const { subjectById } = usePlanner();
  const nowMin = useNowMin();

  const sel = pickFocus(dayLessons, selectedId, nowMin, isToday);

  return (
    <div className={styles.viewbody}>
      <DayHeader
        dayLabel={dayLabel}
        onShiftDay={onShiftDay}
        extra={<span className={styles.vsub}>{dateLabel}</span>}
      />

      {/* Lessons present → holiday is a banner above; no lessons → it takes the
          focus area (below). */}
      {holidayNode && dayLessons.length > 0 && (
        <div className={styles.holiday}>{holidayNode}</div>
      )}

      <div className={styles.vcDay}>
        <div className={styles.vcAgenda}>
          {dayLessons.map((lesson) => {
            const subject = subjectById[lesson.subject];
            const selected = sel?.id === lesson.id;
            const [start] = lessonTime(lesson).split(/[–—-]/);
            return (
              // Row onClick = redundant pointer convenience; the accessible
              // keyboard select path is the SelectTitle <button>. NOT a
              // role="button" (the moved-arrow cue is a focusable descendant —
              // invalid AT nesting; Codex R2). Double-click opens the planner.
              //
              // A row SELECTS and does nothing else — the settled decision that
              // Plan/Post/Teach live only on the focus card. Anything added here
              // later has to earn its place against that.
              <div
                key={lesson.id}
                // Stable probe/e2e hook (parity with weekly/catch-up rows;
                // cutover follow-up #3).
                data-planner-item={`lesson:${lesson.id}`}
                className={`cp-subj ${subject.cls} ${styles.vcAitem} ${
                  selected ? styles.vcAitemSel : ""
                }`}
                onClick={() => onSelect(lesson.id)}
                onDoubleClick={(e) => {
                  if (fromInteractive(e)) return;
                  onPlan(lesson.id);
                }}
                title="Double-click to open the daily planner"
              >
                <span className={styles.at}>{start.trim()}</span>
                <span
                  className={`${styles.ad} ${
                    lesson.modified ? styles.stripeModified : ""
                  }`}
                />
                <div className={styles.vcAtext}>
                  <SelectTitle
                    selected={selected}
                    onSelect={() => onSelect(lesson.id)}
                    titleClassName={styles.an}
                  >
                    {stripHtml(lesson.title)}
                  </SelectTitle>
                  <div className={`cp-subj ${subject.cls} ${styles.au}`}>
                    {subject.name}
                  </div>
                  <ForkCues lesson={lesson} />
                </div>
              </div>
            );
          })}
          <AddLessonMenu
            triggerClassName={styles.vcAadd}
            tooltipId="day-v2-agenda-add"
            tooltipContent="Add a lesson or a non-instructional event to this day"
            align="start"
            onQuickAdd={onQuickAdd}
            onAddEvent={onAddEvent}
            quickAdding={quickAdding}
            quickAddError={quickAddError}
            triggerContent={
              <>
                <span className={styles.rplus} aria-hidden="true">
                  +
                </span>
                <span>Add lesson</span>
              </>
            }
          />
        </div>

        {sel ? (
          // PALETTE CLASS = `Subject.cls`, NEVER `lesson.subject`. The agenda
          // row above has always painted `cp-subj ${subject.cls}`; this card
          // painted `cp-subj ${lesson.subject}`, and one surface reading a
          // subject's colour two different ways is a bug waiting for the day
          // the two stop agreeing.
          //
          // THEY AGREE TODAY, and that is the whole point of fixing it now
          // rather than later: `Subject.cls` is documented as "equals `id`"
          // (lib/types.ts:20) and every producer honours that — the fixtures
          // (lib/mock/subjects.ts), the backend mapper (planner/supabase-source
          // :1898 `cls: id`) and the roster hook's team branch
          // (use-visible-subjects:148 `cls: s.id`). So this change is invisible
          // in the render and cannot be caught by a screenshot.
          //
          // It stops being invisible for PERSONAL subjects. Those carry a
          // `p-…` slug id and BORROW a locked palette slot
          // (use-visible-subjects:163 `cls: p.swatch`, "ALWAYS one of the 8
          // locked SubjectIds… never any other color source"). The moment a
          // lesson can hold one, `cp-subj p-abc123` matches no rule in the
          // palette cascade and the card loses `var(--c)` — i.e. loses the
          // subject gradient this card is built out of — while the rail beside
          // it stays correctly coloured. `cls` is the field that is defined to
          // be a palette class; `lesson.subject` is an identifier that happens
          // to look like one.
          <FocusCard
            lesson={sel}
            subjectName={subjectById[sel.subject].name}
            subjectCls={subjectById[sel.subject].cls}
            status={deriveDayStatus(sel, nowMin, isToday)}
            onPlan={onPlan}
            onTeach={(id) => router.push(`/teach?lesson=${id}`)}
            onPost={(id) => router.push(`/post?lesson=${id}`)}
          />
        ) : (
          <div className={styles.heroEmpty}>
            {/* `sel` is undefined both when the day is empty AND for the whole
                hydrate, so this branch must not assert emptiness on its own —
                see ./day-empty. `hasLessons` is passed rather than inferred from
                `sel` being undefined: that implication holds today (pickFocus
                above) but is exactly the kind of transitive reasoning that
                shipped the bug. */}
            {holidayNode ?? (
              <DayEmptyState
                hasLessons={dayLessons.length > 0}
                skeletonLines={2}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Focus card — the subject-tinted detail panel (bundle .vc-detail) ────────
// The ONLY place the day's lessons can be acted on: Finish, Plan, Post, Open in
// Teach. It is an opaque subject gradient in every tone, so it is its own
// floating surface and needs no frosting.
//
// ── IT SHOWS THE LESSON'S OWN CONTENT, NOT THE MOCKUP'S ────────────────────
// Every piece of this card is read from the lesson the teacher selected. Two
// pieces were not, and both said something false:
//
//   • the flow strip painted a module constant ("Warm-up · Mini-lesson ·
//     Guided practice · Exit ticket") on every lesson in the app. See
//     ./util `lessonFlowSteps` for the full account; it now renders
//     `getSections(lesson.id)` — the same phases Plan and Teach show.
//   • the footer painted `lesson.standards[0] ?? "—"`, so a lesson tagged
//     with four standards showed one and gave no sign of the other three.
//     `splitStandardChips` paints them all, collapsing past the fourth.
//
// Neither read costs a round trip: sections hydrate with the document
// (planner-store `getSectionsBatch` + the synthetic fill beside it) and the
// standards catalog is already in the same context. If either is genuinely
// empty the card SAYS so — there is no fallback that fills the space with
// something plausible, because that is precisely the defect being removed.
function FocusCard({
  lesson,
  subjectName,
  subjectCls,
  status,
  onPlan,
  onTeach,
  onPost,
}: {
  lesson: Lesson;
  subjectName: string;
  /** The `.cp-subj.<cls>` palette class — `Subject.cls`, NOT `lesson.subject`.
   *  See the note at the callsite; the two are equal today and the difference
   *  is the whole reason this is a prop rather than an inline read. */
  subjectCls: string;
  status: DayStatus;
  onPlan: (id: string) => void;
  onTeach: (id: string) => void;
  onPost: (id: string) => void;
}): ReactNode {
  const { setLessonStatus, units, getSections, describeStandard } = usePlanner();
  const isDone = lesson.status === "done";
  const statusChip = statusLine(status);
  const unitName = unitDisplayName(units, lesson.subject, lesson.unit);
  const sections = getSections(lesson.id);
  const flow = lessonFlowSteps(sections);
  const standards = splitStandardChips(lesson.standards);
  // Counted off the SECTIONS, not `lesson.resources`, so the number agrees with
  // what Post and Teach open (lib/lesson-resources is the one canonical view).
  const resourceCount = lessonResourceCount(sections);
  return (
    <div
      className={`cp-subj ${subjectCls} ${styles.vcDetail} ${
        lesson.modified ? styles.vcDetailModified : ""
      }`}
    >
      <div className={styles.dcTop}>
        <div className={styles.dcTopHead}>
          <div className={styles.dlab}>
            {subjectName} · {lessonTime(lesson)}
          </div>
          <ForkCues lesson={lesson} />
        </div>
        <h3 className={styles.detailTitle}>{stripHtml(lesson.title)}</h3>
        {/* Inert unit text → the pop-in chip, recoloured for the card (see
            `.dunChip`). The `unitName &&` guard stays at the callsite so the
            row's own spacing doesn't linger when there is no unit. */}
        {unitName && (
          <div className={styles.dun}>
            <UnitChip
              subjectId={lesson.subject}
              unit={lesson.unit}
              className={styles.dunChip}
            />
          </div>
        )}
      </div>
      <div className={styles.dcTarget}>
        <span className={styles.dcTl}>Learning target</span>
        <div className={styles.dobj}>{stripHtml(lesson.objective)}</div>
      </div>
      <div className={styles.dcFlow}>
        {flow.length > 0 ? (
          flow.map((step) => (
            // `title` carries the full phase name, its planned length, and
            // whatever the teacher has written into that phase — the only
            // recovery for the label's ellipsis on a narrow card, and the
            // phase's actual content on a wide one. A chip is a leaf <span>, so
            // this is a plain native tooltip, not an onboarding one (CLAUDE.md
            // §4 scopes those to controls and named panels).
            //
            // The minutes are repeated in here so a desktop hover gets the
            // whole phase in one place. They are NOT the phone's only copy:
            // ≤480px hides the visible minutes VISUALLY (day-v2.module.css
            // `.dcStepMin` uses the repo's visually-hidden recipe, not
            // `display: none`), so the text stays in the accessibility tree and
            // a screen reader still announces the pacing. A native `title` is
            // not a dependable accessible name on touch — it must never be the
            // only carrier of information a teacher needs.
            <span
              key={step.key}
              className={styles.dcStep}
              title={[
                step.label,
                step.minutes !== null ? ` · ${step.minutes} min` : "",
                step.detail ? ` — ${step.detail}` : "",
              ].join("")}
            >
              <b>{step.n}</b>
              <span className={styles.dcStepLabel}>{step.label}</span>
              {/* Minutes are optional per phase and the separator goes with
                  them — never a dangling "·" (lib/lesson-flow, 6.11.26 §7). */}
              {step.minutes !== null && (
                <span className={styles.dcStepMin}>{step.minutes} min</span>
              )}
            </span>
          ))
        ) : (
          // ── IS THIS REACHABLE? NOT TODAY — AND IT STAYS ANYWAY ────────────
          // Traced for the 8.01 audit's "unreachable shipped state" item. Every
          // path that can put sections in front of this card produces at least
          // one:
          //   • flag OFF — `seedSections` / `ensureSections` call
          //     `buildInitialSections` (planner-store:629), which instantiates
          //     the `gradual-release` template (5 phases) or, if the registry
          //     were ever empty, ONE blank section. Never zero.
          //   • flag ON  — `getSectionsBatch` OMITS a lesson with no persisted
          //     rows (`if (resolved.length > 0)`, supabase-source:1970) and
          //     `fillSyntheticSections` (planner-store:692) then seeds it from
          //     the same builder. An empty array is not a value the batch can
          //     return.
          //   • editing  — `removeSection` refuses the last one
          //     (planner-store:1238 `if (current.length <= 1) return doc`) and
          //     the editor hides the control to match
          //     (lesson-flow.tsx:1087 `canRemove={sections.length > 1}`).
          // So NO fixture can produce this state, and one was deliberately NOT
          // invented for it: a fixture the product cannot generate would make
          // the mock data lie about what the app can do, which is the same
          // defect class as the placeholder flow this card was built to remove.
          //
          // It is NOT dead code to delete. The alternative to this paragraph is
          // an empty `.dcFlow` div — the card would silently show a lesson with
          // no phases and no explanation, which is precisely the failure the
          // three-invariant chain above is all that prevents. Any one of those
          // invariants relaxing (a template with no sections, a backend read
          // that returns an empty list rather than omitting the key, a future
          // "clear all phases") lands here, and it should land on a sentence
          // rather than on a hole. Four lines to keep an unreachable state
          // honest is the right price; `tests/day-card-content.test.ts` is
          // where it is exercised, because a test can express what the product
          // cannot.
          <p className={styles.dcFlowEmpty}>
            No lesson flow yet — open Plan to add the phases you&rsquo;ll teach.
          </p>
        )}
      </div>
      <div className={styles.dfoot}>
        {/* The handoff puts a single standard chip here (7.21
            source-home/views-c.jsx:51, `sel.std` — its fixture lessons carry
            exactly one). Real lessons carry a list, so the chip becomes a
            bounded GROUP in the same slot: it keeps the handoff's placement
            while making the footer's width predictable however many standards a
            teacher tags. */}
        <div className={styles.dcStds}>
          {standards.shown.length > 0 ? (
            <>
              {standards.shown.map((code) => {
                const wording = describeStandard(code);
                return (
                  <span
                    key={code}
                    className={`${styles.dchip} cp-mono`}
                    // describeStandard echoes the code back when the catalog
                    // doesn't know it — a title identical to the visible text
                    // teaches nothing, so it is omitted instead.
                    title={wording === code ? undefined : wording}
                  >
                    {code}
                  </span>
                );
              })}
              {standards.hidden.length > 0 && (
                <span
                  className={styles.dchip}
                  title={standards.hidden
                    .map((code) => {
                      const wording = describeStandard(code);
                      return wording === code ? code : `${code} — ${wording}`;
                    })
                    .join("\n")}
                >
                  +{standards.hidden.length} more
                </span>
              )}
            </>
          ) : (
            <span
              className={`${styles.dchip} ${styles.dchipQuiet}`}
              title="This lesson has no standards tagged yet — tag them on its planning page."
            >
              No standards
            </span>
          )}
        </div>
        {resourceCount > 0 && (
          <span
            className={styles.dchip}
            title={`${resourceCount} resource${resourceCount === 1 ? "" : "s"} attached to this lesson's phases — open Post to see them.`}
          >
            {resourceCount} resource{resourceCount === 1 ? "" : "s"}
          </span>
        )}
        {statusChip && <span className={styles.dchip}>{statusChip}</span>}
        <FinishPill
          status={status}
          isDone={isDone}
          onToggle={() =>
            setLessonStatus(lesson.id, isDone ? "not_done" : "done")
          }
          className={styles.dfootFinish}
        />
        {/* ── The action row's tooltips are DISMISSIBLE (CLAUDE.md §4) ────────
            All three already explained themselves; what they lacked was a
            `tooltipId`, so a teacher who had learned the row could never turn
            the bubbles off and the "shown ONCE, then dismissible" contract was
            only half met.

            Each carries its OWN id rather than one shared "day action" id,
            because each teaches a DIFFERENT surface — dismissing "what Post
            is" should not also silence "what Teach is".

            All three earn a tooltip under §4's self-evident-label carve-out.
            "Plan" and "Post" are bare nouns that name destinations a
            first-time teacher has never seen (Post is the Resource Wall, which
            the word "Post" does not say), and "Open in Teach" names a surface
            rather than what it does with the lesson. None of them restates its
            label. None is destructive or team-wide, so none is `required`. */}
        <Tooltip
          content="Open this lesson's planning page"
          tooltipId="day-v2-focus-plan"
          side="top"
        >
          <button
            type="button"
            className={`${styles.vbBtn} ${styles.dfootPlan}`}
            onClick={() => onPlan(lesson.id)}
          >
            Plan
          </button>
        </Tooltip>
        {/* Handoff order is Plan · Post · Teach — 7.21
            source-home/views-c.jsx:53-55. */}
        <Tooltip
          content="Open this lesson's resources on the wall"
          tooltipId="day-v2-focus-post"
          side="top"
        >
          <button
            type="button"
            className={styles.vbBtn}
            onClick={() => onPost(lesson.id)}
          >
            Post
          </button>
        </Tooltip>
        <Tooltip
          content="Open this lesson on the teaching board"
          tooltipId="day-v2-focus-teach"
          side="top"
        >
          <button
            type="button"
            className={`${styles.vbBtn} ${styles.vbBtnPri}`}
            onClick={() => onTeach(lesson.id)}
          >
            Open in Teach
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
