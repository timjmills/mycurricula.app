# Settings / Setup — handoff conformance + improvement audit

**Date:** 2026-07-31
**Surface:** `app/settings/**` vs the v2 handoff `ConfigPage`
**Method:** read-only source audit. No dev server, no rendering, no writes outside this file.

## Precondition — which tree was measured

```
git rev-parse --short HEAD                → 6ba6ae8
git diff HEAD --stat -- app/settings components/settings lib supabase → empty
```

Every claim below is about **commit `6ba6ae8`**, not a dirty working tree.

> Snapshot disclaimer (CLAUDE.md §8): this is a dated audit. Verify against current
> code before treating any finding as open.

> ⚠ **SUPERSEDED IN PART — 2026-08-09.** Every claim below about **Frame C · Pastel**
> — the "Color" → "Pastel" rename, the locked-note theme picker, the Pastel palette
> lock — accurately reported the **7.21 handoff's** spec on 2026-07-31. It is **no
> longer the target.** On **2026-08-07 the user ruled: Pastel is DROPPED; Frame C =
> COLOR-FORWARD.** The port was built, **staged, and never committed**; its shelved
> patch was deleted 2026-08-09. Frame C keeps the "Color" label and the normal
> seven-theme picker. The **Hero theme** half of the same 7.21 delta is a separate
> question this ruling did not touch — see §C7.

**Evidence tags used throughout:**

- **Observed** — a literal value at a cited `file:line`. I could not render the app, so no
  claim about appearance, layout, or interaction is Observed unless the value is in source.
- **Inferred** — a conclusion drawn from Observed facts.
- **Unverified** — stated for completeness; not checked.

---

## §0 Handoff provenance — the "byte-identical" claim is half true

The plan records that `config.jsx` is byte-identical across all four handoff packages.
**Verified by checksum** (Observed):

| File | 6.24 | 7.2 | 7.21 |
| --- | --- | --- | --- |
| `config.jsx` | `17234ed2` | `17234ed2` | `17234ed2` |
| `config.css` | `42657035` | `42657035` | `42657035` |
| `settings.jsx` | `d670d5c2` | `d670d5c2` | **`b71d269b`** |

The claim **holds for `config.jsx` / `config.css`** — the Setup page spec has been stable
since 6.24. This is pure execution; no spec archaeology needed.

The claim is **wrong for the settings surface as a whole**. `settings.jsx` — the appearance
tweaks panel that `config.jsx:201` embeds as its Appearance section via
`window.AppearanceControls` — changed in 7.21. Authority is 7.21 > 7.2 > 6.24, so the delta
wins. Two changes, neither shipped (see C7):

- An **8th theme, "Hero"** — `settings.jsx:17` (gradient) + `:25` (picker entry).
- ~~**Frame C renamed "Color" → "Pastel"** with its theme picker **replaced by a locked
  note** — `settings.jsx:79-80` and `:185-187`, styled by `.set-lockednote`
  (`settings.css:83`).~~ **SUPERSEDED 2026-08-07 by USER RULING: Pastel DROPPED,
  Frame C = COLOR-FORWARD.** The handoff reading was correct; the design was
  rejected. Frame C keeps the "Color" label and the ordinary seven-theme picker —
  **do not build the rename or the locked note.**

Anyone sizing this surface off the "byte-identical" summary would have missed both.

Reference paths (all under `Documents/Claude Design/`):

- `7.21.26 Design Handoff Update/source-home/config.jsx` — the Setup spec
- `7.21.26 Design Handoff Update/source-home/settings.jsx` — the Appearance panel spec
- Handoff sources are **browser prototypes, not shippable code** (README §"The design files
  are references, not shippable code").

---

## §A Section-by-section map — handoff vs shipped

All rows **Observed**. Handoff line numbers are `config.jsx`.

| # | Handoff section | Shipped location | Verdict | Size |
| --- | --- | --- | --- | --- |
| 1 | `:65` **Profile & role** — name, email, solo/team | `app/settings/account/page.tsx` (437 ln) — display name, default view, completion privacy, sign-in | Partial. **Email absent** (0 hits). Role toggle deliberately dropped — see §E | S |
| 2 | `:76` **Team / school** — school, team name, members | `app/settings/workspace/page.tsx` + `components/team` — live Supabase members / invites / notebook-admin | **Exceeds handoff** | — |
| 3 | `:86` **Workspaces** — personal + teams, active | `components/settings/workspace-switcher.tsx`; `MULTI_WORKSPACE` live in prod | Done | — |
| 4 | `:101` **Curriculums** — create / select active | `app/settings/curriculum/page.tsx:58` is **only a label text field**. Nearest relative is the read-only `/archive` shelf (`lib/archive/school-years.ts`) | **Absent** | M |
| 5 | `:108` **Subjects** — colors, **order**, labels | `app/settings/subjects/page.tsx:249` + `:484` (790 ln) — rename, academic flag, archive, personal subjects, hide-list, course sharing | Exceeds handoff except **reorder (`↕`, `:117`) absent** | S |
| 6 | `:123` **School week** | `app/settings/calendar/page.tsx:515` — **DB-backed** (`schools.school_week`), 29 consumers | Done | — |
| 7 | `:133` **Daily times** | `app/settings/schedule/page.tsx:385` — per-day block editor + copy-to-all-days | Present; **nothing reads it** (§B1) | L |
| 8 | `:150` **Non-academic times** | Folded into the same editor as `type: non-academic` (`schedule/page.tsx:380`) | Done — correct consolidation | — |
| 9 | `:165` **Rotation cycles** | `app/settings/schedule/page.tsx:129` | Control present; **nothing reads it** (§B2) | L |
| 10 | `:175` **Yearly schedule** — terms, holidays | `calendar/page.tsx:387` (year dates) + `:685` (holidays) + `:262` (school months, extra) | Present; localStorage-scoped (§B3) | S |
| 11 | `:187` **Standards — per subject** | `app/settings/standards/page.tsx` — 174-framework catalog, school default + per-teacher override | Present but **not per-subject** | M |
| 12 | `:201` **Appearance** | `app/settings/appearance/page.tsx` (584 ln) + `AppearanceControls` | Present; 7.21 delta unshipped (C7) | S |

**Shipped with no handoff counterpart** (do not delete in a rebuild): Lesson templates,
Catch-up, settings search (`lib/settings-search-index.ts`), the overview dashboard
(`app/settings/page.tsx`), course sharing.

**Net:** the shipped tree is a superset of the handoff in **8 of 12** rows.

---

## §B Conformance gaps, ranked by teacher need

### B1 — A teacher's own timetable is invisible everywhere in the app — **L** — Observed

`lib/use-my-schedule.ts:7-14` states it in its own header: *"NOT ADOPTED YET"*. Its only
consumer is the settings page's own preview (`app/settings/schedule/page.tsx:401`).

Eight files still read the hand-authored fixture `getDayBlocks()`:

- `components/schedule/ScheduleColumn.tsx:90`
- `components/schedule/ScheduleDayPane.tsx:117`
- `components/week-v2/WeekA.tsx:121`
- `components/weekly/WeekEditBoard.tsx:243`
- `components/daily/NowLine.tsx:61`
- `components/daily/DayEditSplit.tsx:259`
- `components/chrome/ChromeClock.tsx:131`
- `lib/home/today.ts:29`

A teacher configures their entire day and nothing changes — including the now-line and the
clock's next-period chip. The seam is already built and shape-compatible (`TimelineBlock`);
this is a swap in eight callsites, not a redesign.

### B2 — Rotation is a write-only setting — **L** — Observed

`useScheduleRotation` has exactly two references: `app/settings/schedule/page.tsx` and its
own lib. Nothing maps a calendar date to a cycle day, and the block store is keyed by
weekday alone — so with A/B **on**, there is no way to author a different Day-B timetable.
CLAUDE.md §1 names rotating cycles as non-negotiable. See §D1 for the schema this needs.

### B3 — Team settings are not team settings — **M** — Observed

Holidays, academic year, school months and rotation all persist to `localStorage`:

- `lib/use-holidays.ts:57` — `mycurricula:team:holidays`
- `lib/use-academic-year.ts:56-57` — `mycurricula:team:academic-year-{start,end}`
- `lib/use-school-months.ts:42` — `mycurricula:team:school-months`
- `lib/use-schedule-settings.ts:91` — `mycurricula:team:schedule-rotation`

`app/settings/calendar/page.tsx:20-27` is admirably honest about this (*"Do not read a
`team:` key name as evidence a value is shared"*), but the product consequence is real: one
teacher adds Eid, no teammate sees it, and that teacher loses it on their second device.
Only **school week** is genuinely shared. Blocked on §D2.

### B4 — Subject configuration doesn't reach the planner either — **L** — Observed

`useVisibleSubjects` is referenced only by `app/settings/subjects/page.tsx` and its own lib;
43 component files still import the `SUBJECTS` fixture from `@/lib/mock`.
`app/settings/subjects/page.tsx:41-44` admits it. Renaming a subject, hiding one you don't
teach, or adding a personal subject changes nothing outside Settings.

### B5 — "Curriculums" has no home — **M** — Observed

The handoff's create/select-active-curriculum (`config.jsx:101`) has no shipped surface.
`/archive` is read-only; `school_years.is_active` exists in the schema and nothing writes
it. A school entering its second year cannot start a new curriculum.

### B6 — Subject reorder missing — **S** — Observed

`config.jsx:117` shows a `↕` move handle. The shipped page has rename / archive /
academic-flag but no ordering control — despite `subjects.display_order` already existing
(`20260518102823_initial_schema.sql:303`).

### B7 — Per-subject standards framework — **M** — Observed

The handoff binds a framework to each subject (`config.jsx:189-199`); shipped is
school-default + per-teacher override, framework-list-shaped. **Not a migration** —
`subjects.default_framework_ids uuid[]` already exists (`initial_schema.sql:311`).

### B8 — No email field on Account — **S** — Observed

`config.jsx:68`. Zero hits for `email` in `app/settings/account/page.tsx`.

### B9 — 7.21 appearance delta unshipped — **S** — Observed — **HALF RETIRED 2026-08-07**

See §0 and C7. `lib/theme.tsx:10` still lists seven themes; no `hero`, ~~no Pastel palette
lock~~. **Ownership unverified** — this may belong to the appearance lane.

**The Pastel half is RETIRED, not open** (user ruling 2026-08-07: Pastel DROPPED,
Frame C = COLOR-FORWARD). "No Pastel palette lock" is now the *correct* state, not a
gap. Only the **Hero theme** remains an unshipped delta — and it is the one that
would hit the `teacher_preferences` `CHECK` constraint and the full 5-surface
ALLOWLIST LOCKSTEP, so it is not small.

### B10 — Stale link — **trivial** — Observed

`components/chrome/ChromeContext.tsx:282` targets `/settings/team`, which 307s to
`/settings/workspace` (`app/settings/team/page.tsx`). One wasted hop.

---

## §C Improvement findings

Kept strictly separate from §B. None of these are handoff-conformance items — several are
places the **handoff itself** is too thin.

### C1 — **Correction** — The two widest-blast-radius pages lack both required safety mechanisms — **S** — Observed

`app/settings/calendar/page.tsx` (872 ln — school week, academic year, holidays, school
months) contains:

- **zero** `required` Tooltips. The `required` hits at `:739` and `:759` are HTML
  `<input required>` attributes, not the Tooltip prop.
- **zero** `useConsequenceToast` / Undo — the identifier does not appear in the file.

`app/settings/curriculum/page.tsx` likewise has **zero** `required` hits.

CLAUDE.md §4's always-on list names these explicitly: *"Team-wide settings — every
SettingsCard whose change affects every teacher (**curriculum-label save, holidays,
academic year, school week**, …)"*. The pattern is established and applied elsewhere —
`app/settings/subjects/page.tsx:225, 315, 364, 652, 706, 770` and
`app/settings/schedule/page.tsx:183` — it was simply never applied to the two pages the
rule cites by name. Removing a holiday today is a silent, undoable, team-wide write.

### C2 — **Correction** — A holiday cannot span more than one day — **S–M** — Observed

`lib/use-holidays.ts:32-39` defines `Holiday` as `{ id, date, name }` — one ISO date, no
end. `initial_schema.sql:278` (`holidays date[]`) has the same shape, so this is the model,
not a UI shortcut. A two-week Winter Break is fourteen hand-typed rows; Ramadan and Eid
ranges likewise. For the launch school — Qatar, long religious breaks — this is the
most-used control in Settings and the most tedious.

**This is also on rotation's critical path** — see §D1: an instructional-day cycle count
cannot be computed without an authoritative holiday set.

### C3 — **Correction** — Ramadan timetable mode is unreachable after setup — **S** — Observed (source) / Inferred (impact)

Zero hits for `ramadan` under `app/settings/`. The data model supports it fully —
`schools.ramadan_timetable_enabled` (`initial_schema.sql:191`),
`time_blocks.ramadan_start_time` / `ramadan_end_time` (`:586-587`) — and the only UI is
`components/onboarding/steps/schedule-step.tsx`, which belongs to the **v1** wizard.
CLAUDE.md §1 names Ramadan mode as a launch-school requirement. A weeks-long annual
timetable change with no control surface.

### C4 — **Correction** — No term / semester structure — **M** — Observed

`lib/use-academic-year.ts:56-57` stores exactly two values; `school_years` has one
`start_date` / `end_date` pair. Zero hits for `semester` / `trimester` / `term` under
`app/settings`. A school running two semesters or three terms cannot express reporting
periods, and Year/Progression have no term boundary to divide against. **Missing from the
handoff too** (`config.jsx:176-178` is also just termStart/termEnd).

### C5 — **Correction** — No timezone anywhere — **S** to store, **M** to adopt — Observed

Zero hits for `timezone` / `timeZone` in `app/settings` or `lib/now-anchor.ts`. Every "now"
computation — `components/daily/NowLine.tsx`, `ChromeClock.tsx:131`, catch-up overdue logic
— resolves in the browser's local zone, and `time_blocks` columns carry no zone. Rare, but
when it bites the now-line silently points at the wrong period with no way to correct it.

### C6 — **Enhancement** — Settings has no route-level loading or error boundary — **S** — Observed

`find app/settings -name error.tsx -o -name loading.tsx` returns nothing; only
`app/error.tsx` exists. `app/settings/standards/page.tsx:22-27` awaits four Supabase queries
in a `Promise.all` before rendering anything — so one failed or slow query takes out **the
entire Settings modal**, not just the Standards pane, and drops the teacher on the app-wide
error page with the modal gone. The right pattern is two files away:
`app/settings/workspace/page.tsx` wraps `TeamData` in `<Suspense>`.

Fix together: add `app/settings/loading.tsx` + `app/settings/error.tsx`, and replace the
fallback at `workspace/page.tsx:50-56` — a bare "Loading team…" line with an inline
hardcoded `padding: 24` — with a tokenised skeleton like every other settings surface.

### C7 — **Enhancement** — Ship the 7.21 appearance delta — **S** — Observed — **SCOPE HALVED 2026-08-07**

The Hero theme and ~~the Frame-C Pastel palette lock (§0). Note the lock is a *behaviour*
change, not a palette addition: in Frame C the theme picker is **replaced** by an
explanatory note (`settings.jsx:185-187`). If Frame C ships without it, a teacher can pick
a theme that Pastel then ignores.~~

**SUPERSEDED 2026-08-07 by USER RULING — the palette-lock half is cancelled.** Pastel
is DROPPED; Frame C = COLOR-FORWARD, and a colour-forward Frame C honours the theme
picker like every other frame, so there is no lock to build and no "theme the frame
ignores" hazard to guard. The lock *was* built (`PastelThemeLock`) and staged; it was
never committed and its patch was deleted 2026-08-09. **What remains of C7 is the
Hero theme alone** — and per §D that one needs a `teacher_preferences` `CHECK`
migration plus the 5-surface lockstep, so it is no longer an "S".

### C8 — **Enhancement** — The Setup IA splits one question across two pages — **M** — Inferred

"When does school run" lives in **Calendar** (week, year dates, holidays, months); "when do
my classes meet" lives in **Schedule** (periods, rotation). The handoff is worse — `week` /
`daily` / `nonacademic` / `rotation` / `year` are five separate nav rows
(`config.jsx:126, 133, 150, 165, 175`) for one mental model. Neither is right, so this is
not a conformance question.

Suggest one **"School time"** page, four cards in causal order — Year dates → School week →
Daily times → Rotation — since each answer constrains the next. Split **Holidays** out as
its own page: it is the one thing here edited all year rather than once at setup. Pure
re-composition; no logic moves.

### C9 — **Enhancement** — Nothing tells a teacher their setup is incomplete — **S** — Observed

`app/settings/page.tsx:5-8` renders a live one-line summary per section ("Sun–Thu · 3
holidays") — good — but every tile reads the same whether the value was configured or
defaulted. Given B1–B4, a large share of Settings is currently *decorative* configuration,
and the overview is the one place a teacher would notice. A "Setup: 6 of 9 configured" band
with unconfigured tiles marked would surface it. **Defer until the adoption gaps close**, or
it merely advertises them.

### C10 — **Experiment** — Daily-times presets — **S** — Inferred

Both the handoff (`config.jsx:128-131`) and the shipped calendar (`page.tsx:515`) give the
school week one-click presets, but daily times start from a fixed 6-period default
(`config.jsx:20`) with no presets — and it is the most typing in Setup. A small starter set
(primary homeroom / 8-period / block A-B / Gulf Sun–Thu) could remove the worst friction.
Low confidence it beats the existing "add period, copy to all days"; hence Experiment.

---

## §D Data-model gaps requiring a migration

**Agents never apply migrations in this repo** (CLAUDE.md / memory). Reported only.

### D1 — Rotation cannot be stored at all — the largest migration on this surface

**Observed — current state:**

```sql
-- initial_schema.sql:49
create type cycle_pattern as enum ('one_week', 'ab_two_week');
-- initial_schema.sql:79
create type week_cycle    as enum ('every_week', 'week_a', 'week_b');
-- initial_schema.sql:282-284
active_cycle_pattern cycle_pattern not null default 'one_week',
cycle_anchor_date    date,
-- initial_schema.sql:589
week_cycle           week_cycle not null default 'every_week',
```

Both primitives are **weekly-anchored**. `week_cycle` is a three-valued enum on the block;
there is no key space for "day 3 of 6". Meanwhile the shipped UI already offers an arbitrary
N-day cycle — `CYCLE_LENGTH_MIN = 2 … CYCLE_LENGTH_MAX = 10`
(`lib/use-schedule-settings.ts:75-76`) — and CLAUDE.md §1 requires *"every 4 instructional
days, a 6-day rotation"* and forbids assuming a weekly cycle. **Whatever a teacher picks
today is unstorable.**

**Inferred — the shape rotation actually needs.** Three separable pieces:

**(a) The cycle definition** — on `school_years` (or a new `schedule_cycles` row if a school
ever needs more than one):

```sql
cycle_unit    enum ('week', 'instructional_day')  -- what a "cycle step" counts
cycle_length  smallint check (cycle_length between 1 and 20)
cycle_anchor_date date not null   -- the date that IS cycle position 1
cycle_day_labels  text[]          -- ['A','B'] or ['1'..'6']; length = cycle_length
```

`cycle_unit` is the piece a naive rename would lose: the existing `ab_two_week` means
**alternating weeks** (week A, then week B), *not* alternating days. Both patterns are real
and schools use both, so the unit must be explicit rather than implied by the enum name.
`cycle_kind = 'none'` is just `cycle_length = 1`.

**(b) The date → cycle-position function.** For `cycle_unit = 'instructional_day'` this
**cannot** be `(date − anchor) % n`: holidays and non-school weekdays must not consume a
cycle slot ("every 4 *instructional* days"). It must be

```
position = (count of instructional days in [anchor, date)) mod cycle_length
where an instructional day = weekday ∈ schools.school_week AND date ∉ holidays
```

Two consequences worth flagging before anyone sizes this:

1. **The mapping is a function of the holiday list.** C2 (holiday ranges) and D2 (a real
   home for team holidays) are therefore on rotation's critical path, not adjacent to it.
   You cannot compute a cycle day from a per-browser localStorage holiday array.
2. **It should be a SQL function, not client arithmetic** — e.g.
   `cycle_position_for(school_year_id, date) returns smallint`, SECURITY DEFINER with
   `search_path = public, pg_temp` (per the standing search_path rule). A running count
   across a school year is O(days) per lookup; every planner surface needs it per-date, so
   client-side recomputation will not hold up. Consider a materialised
   `instructional_days(school_year_id, date, ordinal, cycle_position)` table refreshed when
   the week or holidays change — it also gives Year/Progression a real instructional-day
   count, which nothing has today.

**(c) Block keying** — `time_blocks`:

```sql
alter table time_blocks
  add column cycle_day smallint,        -- null = fires on every cycle position
  alter column day_of_week drop not null,
  add constraint time_block_slot_chk
    check (day_of_week is not null or cycle_day is not null);
```

Three legal modes, all real: weekly-only (`day_of_week` set, `cycle_day` null); pure N-day
rotation (`cycle_day` set, `day_of_week` null — the block belongs to cycle day 3, not to
Tuesday); and A/B-layered-on-a-week (both set). A cross-table `cycle_day ≤ cycle_length`
check needs a trigger, or denormalise `cycle_length` onto the owning row.

**Backfill is lossless:** `every_week → cycle_day null`; `week_a → cycle_day 1`;
`week_b → cycle_day 2`; `one_week → (cycle_unit 'week', length 1)`;
`ab_two_week → (cycle_unit 'week', length 2)`. Keep `week_cycle` as a generated/legacy
column for one release if anything still reads it — **Unverified** whether anything does
outside the settings lane.

**Client-side corollary** (sibling lane owns it): the block store
`Partial<Record<Weekday, StoredBlock[]>>` must become keyed by a composite slot token —
`` `w:${weekday}` `` or `` `c:${cycleDay}` `` — which follows directly from (c).

### D2 — No home for team-level configuration — Observed

School months has no column anywhere. Holidays / term start / term end **do** exist on
`school_years` (`holidays date[]`, `start_date`, `end_date`, `initial_schema.sql:270-286`)
but no app code reads or writes them (`school_years` appears only in `lib/archive/`,
`lib/planner/*`, `lib/supabase/ensure-teacher.ts`). Either wire `school_years` or add
`team_settings`. This is the unblock for B3, and a prerequisite for D1(b).

Fold in while you're there: holiday **end date** (C2), **term/semester** rows (C4), and a
**timezone** column (C5). Three separate migrations otherwise.

### D3 — Not gaps — verified storable today — Observed

- Per-subject frameworks → `subjects.default_framework_ids uuid[]` (`:311`)
- Subject ordering → `subjects.display_order` (`:303`)
- Non-academic blocks → `time_block_type` enum (`:78`)
- Ramadan times → `time_blocks.ramadan_start_time` / `_end_time` (`:586-587`)
- Personal subject scope → `subjects.scope` + `owner_id` (`:304-306`)

---

## §E Deliberately dropped — do NOT count as gaps

| Item | Ruling |
| --- | --- |
| **Role: `[On a team \| Solo teacher]`** (`config.jsx:69-73`) | `agent_shared_log.md:1395` — USER decision: solo/team is **derived from workspace membership**, not a user-facing toggle. Correctly absent. |
| **The full ConfigPage build** | `agent_shared_log.md:1422` + `:1486` — W12a was scoped as a **re-skin, behaviour untouched**. It was never claimed as built; this is not a regression. |
| **Non-academic as its own nav section** (`config.jsx:150`) | Shipped folds it into the block editor as a block `type` (`schedule/page.tsx:380`). Better IA than the handoff; leave it. |

---

## §F What already works and must not regress

All **Observed**.

- **School week** — the one genuinely team-scoped, DB-backed, RLS-gated setting
  (`schools.school_week`), 29 consumers, with a save-outcome reporter
  (`calendar/page.tsx:642`) because the write can be refused by RLS.
- **Holidays render** — adopted across 8 planner surfaces (`WeeklyGrid`, `WeeklyList`,
  `WeekA`, `WeekC`, `WeekColumns`, `DailyViewV1`, `year/UnitBar`, `use-day-holiday`).
  Broken storage, working consumption — fix the storage, keep the consumers.
- **Team / invite flow** — live Supabase RPCs with server-side re-authorization
  (`app/settings/team/actions.ts`, `components/team`). The handoff equivalent is a
  `prompt()` and an array push (`config.jsx:83`). A rebuild must not touch this.
- **Standards** — 174-framework catalog, school default + per-teacher override, tagging
  picker scoped to the effective set.
- **Course sharing** (`components/settings/course-sharing-manager.tsx`) — the only
  live-wired card on the Subjects page, with its own async load + pending/error states.
- **Modal shell mechanics** (`app/settings/layout.tsx`) — pointer-down/up-verified click-out
  (`:266`, deliberately not trusting `click`'s common-ancestor target), dirty-gated save
  prompt, Tab focus trap (`:319`), `inert` on the outer dialog while the confirm is open
  (`:387`), refcounted body-scroll lock, focus restore on unmount. More careful than
  anything in the handoff and easy to lose in a rebuild.
- **Settings search** (`lib/settings-search-index.ts`) and the **overview dashboard** — no
  handoff counterpart; both are net additions.

---

## §G Recommendation — extend in place; do not create `components/settings-v2`

**Inferred**, from the Observed facts above.

1. **The v2 seam already exists.** `app/settings/layout.module.css:409` carries a
   "v2 ConfigPage skin" block; `layout.tsx:438` gates `SECTION_ICONS` on `V2`; `:485` gates
   the artboard's "Done" button. The cheap half of the job is done, and a parallel folder
   would orphan it.

2. **The handoff is the weaker artifact.** `config.jsx` is a ~300-line localStorage mock:
   `prompt()` for adding members (`:83`), a `defaultValue` input that discards subject
   renames (`:114`), `alert('wired in a later pass')` (`:119`), no scope model, no team
   persistence, no RLS. Shipped beats it on 8 of 12 sections. Treating it as the build
   target would be a regression. Take it as the spec for the three sections it wins on
   (Curriculums, subject reorder, per-subject standards) and as IA input — nothing more.

3. **The gap is plumbing, not markup.** B1–B4 — the gaps a teacher actually hits — are all
   "the setting saves and nothing consumes it", and every one is fixed *outside*
   `app/settings/`: swap `getDayBlocks` → `useMySchedule` in 8 files, adopt
   `useVisibleSubjects` in the planner, land the D1 cycle model, move `team:*` keys to a
   server row. A `settings-v2` rebuild would spend the wave on markup and leave all four
   untouched.

**Concretely:** add one page (`/settings/curriculums`) into the existing Planning group, add
the reorder control and the email field, apply C1's `required` tooltips + Undo, then spend
the rest of the wave on adoption and the two migrations.

**Sequencing note:** C1, C2 and C6 are cheap and independent of the adoption work — they can
ship in any wave. C3, C4, C5 all want the same thing D2 provides. If you are writing that
migration anyway, land the holiday end-date, the term structure and the timezone in it
rather than three times over.

---

## Open / unverified

- **Ownership of the 7.21 appearance delta** (B9 / C7) — I did not check other lanes' file
  claims in `agent_shared_log.md` beyond searching for settings rulings.
- **Whether anything outside the settings lane reads `time_blocks.week_cycle`** — relevant
  to whether D1's backfill can drop the column immediately or must keep it for a release.
- Nothing in this audit was rendered. No visual, layout, responsive, or interaction claim is
  made beyond literal source values.
