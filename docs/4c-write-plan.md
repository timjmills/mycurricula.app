# §4c write round-trip — executable runbook

**Authored by the QA lane; executed by the orchestrator** under the orchestrator+user
rule for prod writes. The author of this file wrote no data.

**Target:** production (`https://mycurricula.app`) + prod Supabase
(`xuukfpvonsbvvbspsrsl`).
**Why it exists:** every Track-B column is null on all 1,256 lesson rows and all 57
units, and `unit_assessments` is empty. With no source values, a correctly-widened read
and a completely-unwidened one render identically. **Only a write can tell them apart.**

---

## ⛔ EXECUTION HALTED 2026-07-31 — READ BEFORE RUNNING ANY STEP

Pre-flight recon against `f5d8540` found two defects in this plan. **STEP 1 ran and
passed. STEP 2 must not be attempted. STEP 3's headline assertion does not work.**
Both were found by reading the code, before a single write. Verify against current
code before assuming either is still true.

### 1. STEP 2 IS NOT EXECUTABLE — there is no Add-unit flow, and no unit archive

STEP 2a says "Use the app's Add-unit flow (`/year` → add unit)". **That flow does not
exist**, in any frame:

- The `Add unit` button lives only in `components/year/YearView.tsx:377-386`, and
  `YearView` is imported by **zero** files — dead code, never mounted by any route.
- `AddUnitDialog` persists to `window.localStorage`
  (`lib/use-custom-units.ts:398`), **never to Supabase**.
- There is **no `createUnit` in `lib/planner/` at all**, and no `.insert()` against
  `public.units` anywhere in the repo. The only write that touches `units` is
  `patchUnit` — an `UPDATE` (`supabase-source.ts:2657-2666`).

**This plan's own STOP condition is therefore met.** STEP 2's reversal says: "Archive
the scratch unit through the UI if an archive control exists. **If none exists, STOP
and tell me.**" No archive control exists — the `archived` arm of `UnitPatch` is fully
implemented server-side (`supabase-source.ts:2124-2127`) with **zero UI callers**, so
`patch.archived` is always `undefined`.

Creating the scratch unit would therefore require raw SQL against production — which
agents must never do — and would strand a row with **no reviewed way to remove it**,
since this plan deliberately refuses a raw `DELETE` on `units` with unaudited FK
cascades. Do not work around this by writing the row directly.

### 2. STEP 3's ASSERTION 1 IS VACUOUS — it cannot detect the four-callsite bug

STEP 3 says assertion 1 ("value visible in the editor immediately after the write, no
reload") proves "the post-mutation reload path returned it", and instructs **"Do not
shortcut assertion 1."** That reasoning is wrong.

Every field write is **fully optimistic**: `editLesson` dispatches the patch into the
reducer unconditionally, and the serial write queue's `send` **discards** the `Lesson`
that `updateLesson` returns — `lib/planner-store.tsx:3045-3046`:

```ts
send: (p) => plannerClient.updateLesson(p.lessonId, p.patch, p.ownerId, p.saveTarget),
```

That queue is the **only** caller of `plannerClient.updateLesson` in the entire app.
So the values built by `reloadLesson` (`:2777`) and `reloadAuthoredLesson` (`:2877`) —
the exact pair the four-callsite rule exists to protect — **are never rendered**. The
editor shows the optimistic reducer value either way, so **assertion 1 passes whether
or not those two callsites spread `trackBArgsFromRow`.** Running it as written yields a
confident false "verified".

Two consequences:

- **"The value is on screen" is not evidence of a write, anywhere in this plan.** Only
  a full page reload (assertion 3) or the DB (assertion 4) tests persistence.
- **The four-callsite invariant is better covered statically than live.**
  `tests/track-b-workspace-fields.test.ts` pins all three `*_COLS` select strings by
  exact snapshot and asserts the spread count per callsite (`02996e6`). Keep that as
  the real gate. If a live check is still wanted, assert on the **network response** of
  the post-write reload SELECT, not on the rendered editor.

### Also corrected in code, same pass

Four stale comments that asserted the opposite of reality were fixed alongside this:
the `*_COLS` note at `supabase-source.ts:398` and the three per-row-shape comments
(`:436/:471/:505`) claimed Track-B was "NOT in" the selects — B2 put it in.
`PlanPage.tsx:334` claimed "B2's fields debounce" — there is no debounce; every
keystroke writes.

---

## 0. Preamble — traps that will otherwise cost you an hour

These are measured facts from the read pass, not cautions.

1. **Hydrate runs through Next server actions** — POSTs to the page route itself. Reads
   and writes therefore share a method *and* a URL. A "block every non-GET" safety gate
   kills the data load and produces a false *"prod has no data"*. Do not add one.
2. **Cookie-only auth.** A global `Authorization: Bearer` header overrides Supabase's
   session key and manufactures ~21 false `403`s plus a false `hydrate failed` cascade.
   Use the claude-login hop (a GET) and let the session cookies do the work; do **not**
   set `extraHTTPHeaders`.
3. **This account's saved frame is `paper`.** `/year` then renders `TimelineYear`, which
   has no `[data-year-chip]`. Any opener must be frame-agnostic:
   `[data-year-chip], [data-year-unit-workspace]`.
4. **Do not write theme `localStorage`** to pin a frame — theme-sync will POST it to
   `teacher_preferences`, which is a real write to a real teacher's account.
5. **Hydrate is ~10 s.** Poll for a real signal; never sleep a fixed 2 s and judge.
6. **`net::ERR_ABORTED` on prefetch/navigation is normal** and is not a failure signal.

**Precondition block to paste into the result** (per CLAUDE.md §4b):

```sh
git rev-parse --short HEAD
git status --short | wc -l          # state plainly if the tree is dirty
gh run list --limit 3 --json headSha,conclusion,workflowName   # what prod ACTUALLY serves
```

Record the deployed sha. Prod has been one deploy ahead of the assumed sha once already
this wave.

---

## Global rules

- **Every step has a PRECONDITION and an ABORT rule. Guards abort, they do not report.**
  If a precondition fails, stop that step — do not proceed and do not emit a number
  about a state you never reached.
- **Verification is SELECT-only and independent of the UI under test.** The SQL below is
  the arbiter; the browser is the subject.
- **Non-destructive by construction.** Steps 1–3 operate on scratch content created by
  the step itself. Step 4 is the only one that touches seeded curriculum, and it is last.
- **Reversal is specified per step**, not left as "clean up afterwards".
- Run steps **in order**. Aborting after any completed step leaves prod clean.

### Baseline snapshot — run FIRST, keep the output

```sql
-- BASELINE. Re-run after the whole plan; every number must return to these values.
select 'units'                             as t, count(*) from public.units
union all select 'units_archived',                count(*) from public.units where archived_at is not null
union all select 'master_core_lesson_events',     count(*) from public.master_core_lesson_events
union all select 'personal_authored_lessons',     count(*) from public.personal_authored_lessons
union all select 'personal_core_lesson_event_copies', count(*) from public.personal_core_lesson_event_copies
union all select 'unit_assessments',              count(*) from public.unit_assessments;
```

Expected at authoring time: units 57 / archived ? / master 1254 / authored 0 / copies 2 /
unit_assessments 0.

---

## STEP 1 — `taught_at` (no write at all; free, do it first)

**Proves:** whether the Insights copy *"The app doesn't record the date a lesson was
actually taught"* is still true.

```sql
select
  (select count(*) from public.master_core_lesson_events        where taught_at is not null) as master_taught,
  (select count(*) from public.personal_authored_lessons        where taught_at is not null) as authored_taught,
  (select count(*) from public.personal_core_lesson_event_copies where taught_at is not null) as copies_taught;
```

**Pass:** all three are `0` → the copy is honest, no action.
**Fail:** any non-zero → the copy is now a lie; file it and hand the wording to the
Insights owner.
**Reversal:** none needed — nothing is written.

---

## STEP 2 — `unit_assessments` end to end, on a SCRATCH unit

**Proves:** B3's insert / read-back / reorder / delete against the real table, including
a **partial-renumber detector**.

**Why a scratch unit:** assessments hang off a unit. Creating them on a seeded unit
would put rows a real teacher can see into their live curriculum. A scratch unit is
invisible to the taught plan (no lessons reference it) and is archivable.

**PRECONDITION**

```sql
select count(*) as must_be_zero from public.unit_assessments;
```
**ABORT if ≠ 0** — someone else is mid-write; a non-empty table makes the ordering
assertions below meaningless.

**2a. Create the scratch unit.** Use the app's Add-unit flow (`/year` → add unit), name
it exactly `ZZ-QA-SCRATCH-4c`. Capture its id:

```sql
select id, name, archived_at from public.units where name = 'ZZ-QA-SCRATCH-4c';
```
**ABORT if 0 or >1 rows.**

**2b. Create three unit assessments** through the drawer (Assessments pane → Add unit
assessment), titled `QA-A`, `QA-B`, `QA-C`, kinds formative / summative / formative.

Verify **insert + read-back**:

```sql
select id, title, kind, purpose, notes, display_order
from public.unit_assessments
where unit_id = '<SCRATCH_UNIT_ID>'
order by display_order;
```
**Pass:** 3 rows; titles and kinds exactly as entered; `display_order` = 0,1,2.
**This is the B3 read path proven** — the pane rendered what the table holds.

**2c. Edit one** — change `QA-B`'s title to `QA-B-edited` and set its purpose. Assert in
the UI **without reloading**, then reload and assert again.

```sql
select title, purpose from public.unit_assessments
where unit_id = '<SCRATCH_UNIT_ID>' and title like 'QA-B%';
```

**2d. Reorder** — move `QA-C` to first via the ↑ control.

**The partial-renumber detector.** The seam throws only on `rpc.error` and merely warns
on a short count, so assert the *resulting order set* rather than the return value. The
RPC pre-checks duplicates and ownership before updating, but the check and the `UPDATE`
are separate statements with **no row lock**, so a concurrent delete between them can
renumber a subset:

```sql
-- Must be EXACTLY 0..n-1, no duplicates, no gaps. Any other shape = partial renumber.
select
  count(*)                                             as rows,
  count(distinct display_order)                        as distinct_orders,
  min(display_order)                                   as min_ord,
  max(display_order)                                   as max_ord,
  bool_and(display_order = expected)                   as contiguous_from_zero
from (
  select display_order,
         row_number() over (order by display_order) - 1 as expected
  from public.unit_assessments
  where unit_id = '<SCRATCH_UNIT_ID>'
) s;
```
**Pass:** `rows = distinct_orders = 3`, `min_ord = 0`, `max_ord = 2`,
`contiguous_from_zero = true`, and `QA-C` is the row with `display_order = 0`.
**Fail:** any duplicate or gap → partial renumber; capture the full row set before
touching anything.

**2e. Delete** one assessment via the drawer's Delete, then verify:

```sql
select count(*) as remaining, array_agg(display_order order by display_order) as orders
from public.unit_assessments where unit_id = '<SCRATCH_UNIT_ID>';
```
**Note:** check whether the surviving rows are renumbered `0..n-2` or left gappy. Either
may be intended — record which, because a gappy order is what makes a later reorder
ambiguous.

**REVERSAL (specified, run in this order)**

1. Delete the remaining scratch assessments through the UI (exercises the delete path
   again — free extra coverage).
2. Confirm zero: `select count(*) from public.unit_assessments where unit_id = '<SCRATCH_UNIT_ID>';`
3. Archive the scratch unit through the UI if an archive control exists.
   **If none exists, STOP and tell me** — I have deliberately not specified a raw SQL
   delete of a `units` row, because I do not know what FKs cascade off it. Leaving one
   archived, clearly-named scratch unit is safer than an unreviewed cascade.

---

## STEP 3 — Track-B lesson fields on a SCRATCH lesson (the four-callsite test)

**Proves:** the read wiring through the **post-mutation reload** path
(`reloadAuthoredLesson`, `supabase-source.ts:2857`) and the list hydrate — the pair the
four-callsite rule exists to protect.

**PRECONDITION**

```sql
select count(*) as authored_rows from public.personal_authored_lessons;
```
Record it. **ABORT if it changes** underneath you mid-step.

**3a. Create a scratch lesson** via the app's Add-lesson flow, title
`ZZ-QA-SCRATCH-lesson`, filed under the scratch unit from Step 2 if that unit still
exists, otherwise unfiled. Capture:

```sql
select id, title, unit_id, duration_minutes, assessment_kind, assessment_title,
       assessment_purpose, assessment_notes, prep, builds, fw_id
from public.personal_authored_lessons
where title = 'ZZ-QA-SCRATCH-lesson';
```
**All Track-B columns must be null here** — that is the `createLesson` insert shape, and
it is *why* callsite 5 is currently harmless (see Step 5).

**3b. Write each Track-B field, one at a time**, through the lesson workspace: duration,
assessment kind, assessment title, assessment purpose, assessment notes, prep, builds.

**For each field, assert in this exact order — the order is the whole point:**

| # | Assertion | What it proves |
| --- | --- | --- |
| 1 | value visible in the editor **immediately after the write, no reload** | the post-mutation reload path returned it |
| 2 | value visible after **collapse + re-expand** (no page reload) | in-memory store mapping |
| 3 | value visible after a **full page reload** | the list-hydrate path returned it |
| 4 | value present in the DB | it was actually persisted |

**A field that passes 4 and 3 but fails 1 is the four-callsite bug**, and it is invisible
to any test that reloads before asserting. Do not shortcut assertion 1.

```sql
select duration_minutes, assessment_kind, assessment_title, assessment_purpose,
       assessment_notes, prep, builds, fw_id
from public.personal_authored_lessons
where title = 'ZZ-QA-SCRATCH-lesson';
```

**3c. Lesson-level assessment via the B3 drawer** — add an assessment to the scratch
lesson from the Assessments pane, then Remove it. Assert the pane empties **and** that
all four `assessment_*` columns return to null:

```sql
select assessment_kind, assessment_title, assessment_purpose, assessment_notes
from public.personal_authored_lessons where title = 'ZZ-QA-SCRATCH-lesson';
```
All four null → Remove clears the whole assessment rather than orphaning columns.

**REVERSAL:** soft-delete the scratch lesson through the UI. Verify:

```sql
select id, deleted_at from public.personal_authored_lessons
where title = 'ZZ-QA-SCRATCH-lesson';
```
`deleted_at` non-null. **Note:** this leaves a soft-deleted row. That is the app's own
delete semantics and I have not specified a hard delete — say the word if you want the
row gone and I will write the statement for you to review.

---

## STEP 4 — fork-per-field on a MASTER-derived lesson — **RISKIEST, RUN LAST**

**Proves:** the fork branch — editing a master-derived lesson in Personal mode lazily
creates a `personal_core_lesson_event_copies` row carrying the Track-B field. Not
verifiable on mock (single doc, no master/personal split).

**This is the only step that touches seeded Grade-5 curriculum.** It is last so that an
abort anywhere above leaves prod untouched.

**PRECONDITION — capture before you write anything**

```sql
-- Pick ONE master lesson and RECORD this row verbatim. It is your restore source.
select id, title, duration_minutes, assessment_kind, assessment_title, prep, builds
from public.master_core_lesson_events
where id = '<CHOSEN_MASTER_LESSON_ID>';

-- And the copy state for this teacher, so you can tell a NEW copy from a pre-existing one.
select id, master_core_lesson_event_id, teacher_id, duration_minutes, archived_at
from public.personal_core_lesson_event_copies
where master_core_lesson_event_id = '<CHOSEN_MASTER_LESSON_ID>';
```
**ABORT if a copy already exists for this lesson+teacher** — pick a different lesson.
There are only 2 copies in the whole database; do not reuse one.

**Choose a lesson in a unit the school is NOT currently teaching** (Week 12 is current;
pick something far from it) to minimise the blast radius if restore misbehaves.

**4a.** In **Personal** mode, set `duration_minutes` on that lesson.

**4b. Assert the fork happened and the master is untouched:**

```sql
-- A NEW copy row must exist, carrying the value.
select id, duration_minutes, is_diverged_from_master
from public.personal_core_lesson_event_copies
where master_core_lesson_event_id = '<CHOSEN_MASTER_LESSON_ID>';

-- The MASTER row must be BYTE-IDENTICAL to the precondition capture.
select id, title, duration_minutes, assessment_kind, assessment_title, prep, builds
from public.master_core_lesson_events
where id = '<CHOSEN_MASTER_LESSON_ID>';
```
**Pass:** copy exists with the value; master unchanged.
**Fail — STOP THE WHOLE PLAN:** if `master_core_lesson_events.duration_minutes` changed,
a Personal edit wrote to the shared plan. That is a data-integrity defect affecting every
teacher, and it outranks everything else in this runbook.

**4c.** Assert assertion-order 1–4 from Step 3 on this forked field, which exercises
`reloadLesson` (`supabase-source.ts:2787`) — the *other* post-mutation callsite.

**REVERSAL**

1. Delete the copy row the step created — it did not exist before (precondition proved
   that), so removing it restores the prior state exactly:
   ```sql
   -- REVIEW BEFORE RUNNING. Deletes ONLY the copy created by this step.
   delete from public.personal_core_lesson_event_copies
   where master_core_lesson_event_id = '<CHOSEN_MASTER_LESSON_ID>'
     and id = '<COPY_ID_CAPTURED_IN_4b>';
   ```
2. **Verify the restore**, don't assume it:
   ```sql
   select count(*) as must_be_zero from public.personal_core_lesson_event_copies
   where master_core_lesson_event_id = '<CHOSEN_MASTER_LESSON_ID>';
   ```
3. Re-run the **baseline snapshot**. `copies` must be back to its starting value.

---

## STEP 5 — the fifth callsite: **NOT RUNNABLE TODAY. Do not attempt.**

`createLesson` (`supabase-source.ts:1961`) omits `...trackBArgsFromRow(inserted)`.

**I checked whether it is reachable and it is not.** `defaultFlow` / `defaultDuration`
are read by the mapper (`:994-995`) and writable through `updateUnit` (`:2058-2060`), but
**no create path consumes them** — `git grep` shows only the type, the mapper, and the
update. `createLesson`'s insert sets no Track-B column, so the omitted spread is a
provable no-op and there is nothing to observe.

**Specify it as a guard, not a test.** The moment anyone makes `createLesson` inherit a
unit default, the returned `Lesson` drops it until a full re-hydrate. The cheapest
durable protection is a unit test asserting that every `buildLesson` callsite spreads
`trackBArgsFromRow` — that fails at authoring time instead of in a teacher's face.

---

## What I recommend you do NOT run

1. **Any write in Team Curriculum mode against seeded curriculum.** `setSaveTarget(id,
   "core")` is a confirmed no-op at `HEAD` (`planner-store.tsx:961` returns `doc`
   unchanged for any target other than `"personal"`), so a Team-scoped save is *expected*
   to do nothing — but if any path does reach `master_core_lesson_events`, it edits a real
   school's shared plan with no per-field undo. Step 4b's master-unchanged assertion is
   the safe way to learn this; a deliberate Team write is not.
2. **The "Delete from Team Curriculum" context item.** Confirmed inert (the `"delete"`
   action has no handler anywhere), so clicking it proves nothing — and if a lane wires it
   up while you are testing, you would be firing an unreviewed permanent team-wide delete.
3. **A hard `DELETE` on `public.units`** for the scratch unit. I have not specified one
   because I have not audited what cascades off a unit row. Archive it; if you want it
   truly gone, ask me to write the statement and audit the FKs first.
4. **Steps 2–4 while another lane is mid-write on prod.** The Step-2 precondition
   (`unit_assessments` empty) and the Step-4 precondition (no pre-existing copy) both
   assume you are the only writer. Check the lane board first.

## Result template

For each step record: precondition output → action taken → the four assertions →
verification SQL output → reversal output → baseline re-check. State the deployed sha and
whether the tree was dirty. Where a step aborted, say at which precondition and what the
value was — an aborted step is a result, not a gap.
