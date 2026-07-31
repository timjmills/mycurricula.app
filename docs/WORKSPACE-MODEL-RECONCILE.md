# Workspace model — live state vs. `docs/6.6.26 Workspace-Notebook-Team Model.md` and the 2026-07-17 locked decisions

Closes the last open item in `docs/7.23.26-unified-v2-plan.md` §5.3.

## PRECONDITION BLOCK

| Precondition | Value |
| --- | --- |
| Brief said | `c1190f7` |
| **Actual `HEAD` when measured** | **`e8f403f`** — HEAD moved during the assignment (your own plan-correction commit). I measured `e8f403f` and say so rather than quoting the brief's sha. |
| Working tree | dirty across six lanes; **nothing read from it** (`git show HEAD:` only) |
| Database | prod Supabase `xuukfpvonsbvvbspsrsl`, **read-only** (`pg_policy` / `pg_proc` / `information_schema` / counts). No writes. |
| Not credited | any in-flight lane work |

Ranked by **what a teacher can actually do**, not by what exists in the schema.

---

## Decision 1 — "solo/team is DERIVED per workspace, not a stored flag" → **LIVE**

**Schema proves the negative.** No `is_solo` / `is_team` / `workspace_kind` / `mode`
column exists on `schools`, `teams`, or `grade_levels`. `schools` carries only
`name`/`school_week`/`ramadan_timetable_enabled`/`resource_hosting_mode`; `teams` carries
`school_id`/`name`/`owner_teacher_id`/`seat_cap`. Nothing stores solo-vs-team.

**And the code derives it, at the workspace grain**, as the decision requires —
`lib/workspaces/row.ts:38`: *"Derived: a workspace with one member (or fewer) is solo,
not a team"*, with `:80` naming the decision verbatim. `lib/workspace-limits.ts:10`
handles the legacy/no-`teams`-row case.

No action. This one is implemented as locked.

---

## Decision 2 — "per-course sharing: personal course INVISIBLE to the team; control = creator + admin" → **PARTIALLY LIVE, and INVERTED ON BOTH HALVES**

This is the finding that matters. It is the archetypal *backend landed, UI never did*
case — **plus** the shipped RLS does close to the opposite of what was locked.

### 2a. A teacher cannot share or unshare a course at all — no UI exists

- Migration `20260717120000_course_sharing_rpcs` **applied on prod** (confirmed in
  `list_migrations`).
- `lib/subjects/actions.ts` exports `shareCourseAction`, `unshareCourseAction`,
  `listCourseSharingAction` — all three complete, all returning proper
  `{ ok, error }` Results.
- **Zero component importers.** `git grep` for all three across `components/**` and
  `app/**` at `e8f403f` returns nothing.

**In the terms you asked for: the data model supports per-course sharing and no UI
reaches it. The missing surface is a sharing control on the course/subject — most
naturally in Settings → Subjects (or the course row itself) — calling
`listCourseSharingAction` to render current state and `shareCourseAction` /
`unshareCourseAction` to change it.** That is the whole gap; nothing else is missing.

A locked user decision that nothing surfaces is a promise the product does not keep.

### 2b. The RLS inverts both halves of the decision

`subjects_read` (live policy on prod):

```sql
(scope = 'team'     AND can_read_grade(grade_level_id))
OR (scope = 'personal' AND owner_id = auth.uid())
OR is_grade_lead(grade_level_id)          -- ← no scope condition
```

The third arm has **no `scope` predicate**, so a lead reads **every** personal subject in
the grade. `is_grade_lead` = `role in ('lead','grade_admin')` — i.e. the admin.

Meanwhile `subjects_update` and `subjects_delete` both read:

```sql
(scope = 'team'     AND is_grade_lead(grade_level_id))
OR (scope = 'personal' AND owner_id = auth.uid())
```

— the lead gets **no** control over personal rows.

| Locked decision | Implemented |
| --- | --- |
| personal course **INVISIBLE** to the team | **visible to any lead / grade_admin** |
| control = creator **+ an admin** | control = **creator only** |

Both halves are backwards: the admin has **visibility but no control**, where the
decision granted **control but not visibility to the team**.

**Currently latent, and that is the only good news:** `select count(*) from subjects
where scope='personal'` → **0**. There are 24 team subjects and 3 lead assignments. So
nothing leaks today — but the leak is armed, and it arms fully the moment 2a's UI ships
and teachers start creating personal courses. **Fix the policy before, not after,
building the sharing surface.**

### 2c. Adjacent security note — `is_grade_lead` is missing `pg_temp`

`is_grade_lead` is `SECURITY DEFINER` with `SET search_path TO 'public'` — **no
`pg_temp`**. Its siblings get this right: `auth_teacher_school_id` and
`is_workspace_member` both pin `'public', 'pg_temp'`.

This is already known work (the 26-function `search_path` migration), but flagging it
here specifically: `is_grade_lead` is **load-bearing for the very policies above**, on
`subjects` read/update/delete. If that migration is prioritised at all, this function
should be near the front.

---

## Decision 3 — "W12 = full multi-workspace + the v2 wizard (workspace-first, optional screen tour)" → **LIVE**

### 3a. Multi-workspace — live, and the 6.6.26 doc is now STALE on it

The doc's §8 lists "Multi-workspace per teacher" as *"No, but not free"*, requiring that
the scalar `teachers.school_id` become junction-derived — its "must-fix #1". **That work
is done.** Live definition:

```sql
-- auth_teacher_school_id()
select coalesce(
  (select t.active_school_id from teachers t
    where t.id = auth.uid() and t.active_school_id is not null
      and exists (select 1 from workspace_members wm
                   where wm.teacher_id = auth.uid() and wm.school_id = t.active_school_id)),
  (select t2.school_id from teachers t2 where t2.id = auth.uid())   -- legacy fallback
);
```

It resolves the **active** workspace and validates membership through
`workspace_members`; `is_workspace_member(uuid)` exists alongside it. Migrations
`20260724120000 multi_workspace`, `20260725120000 workspace_roster`,
`20260726120000 rename_workspace` are all applied.

**Doc correction needed:** §8's multi-workspace row and §7's "NOT yet wired" list both
predate this and now read as false. The `coalesce` to the legacy scalar is a deliberate
transitional fallback for teachers with no `active_school_id`, and is worth documenting
as such rather than leaving it to look like the old behaviour.

### 3b. The v2 wizard — workspace-first and tour-optional, both confirmed

- **Workspace-first:** `wizard-v2.tsx`'s `RAIL` is ordered
  `workspace → courses → schedule → year → appearance → summary`. Workspace is step 1.
- **Optional screen tour:** `startScreenTour` is imported by the wizard;
  `summary-step.tsx` offers *"Take a quick tour of the app, or jump straight into
  planning"* — the footer owns "Take the tour" vs "Start planning". Optional, as locked.

**One caveat worth recording, because it limits what the wizard actually delivers:**
`lib/onboarding-v2-remote.ts` persists only the **activation flag** — the
"has this teacher onboarded?" read and the `onboarded_at` write. The wizard's **collected
configuration** (workspace name, subjects, schedule, year, appearance) is device-local;
`summary-step.tsx`'s own comment says so: *"the config persists to THIS device until the
backend lands."* So the wizard's shape matches the decision, while its output does not
travel between a teacher's devices. **I did not trace whether each individual setting
later syncs through its own settings hook** (appearance does, via theme-sync) — so treat
this as "the wizard does not itself persist config", not as "none of it persists".

---

## Vocabulary drift — where the doc's words and the code's words diverge

The doc's §9 rules are explicit: *"Don't say 'school' in the teacher-facing UI"* and keep
Team/Personal matching `subjects.scope`.

| Concept | 6.6.26 doc | Database | UI copy | Verdict |
| --- | --- | --- | --- | --- |
| The roof | **Workspace** | `schools` | "Workspace" | **Fine.** The doc explicitly allows `schools` as the hidden container. |
| One curriculum | **Notebook** | `grade_levels` | "notebook" appears in `workspace-settings.tsx` | Fine, though "Notebook" is barely surfaced. |
| Shared layer | **Team** | `subjects.scope='team'` | "Team Curriculum" | **Fine** — the Master→Team migration held. |
| **The admin role** | (not named) | `role in ('lead','grade_admin')` | **"workspace admin"** | **DRIFT — three words for one role.** `lead`, `grade_admin`, and "workspace admin" all denote the same authority. This is exactly how two people end up meaning different things; worth settling on one and noting the DB values are legacy. |

**One live "school" leak in teacher-facing copy:** `settings/workspace-settings.tsx:255`
— *"**Your school's workspace** — the home every notebook and teammate belongs to."*
That says "school" to a teacher, against §9. (Other hits — "school day", "school week",
"school year", "no-school days" — are the calendar vocabulary and are fine; I excluded
them.)

---

## Summary

| Locked decision | Verdict | What's missing |
| --- | --- | --- |
| 1 — solo/team derived per workspace | **LIVE** | nothing |
| 2 — per-course sharing: personal invisible, control = creator + admin | **PARTIALLY LIVE** | **the entire UI** (backend complete, zero importers) **and** the RLS grants a lead read-without-control, the inverse of the decision on both halves |
| 3 — W12 multi-workspace + v2 wizard | **LIVE (with caveats — see the addendum)** | multi-workspace is live; wizard SHAPE is live; **wizard OUTPUT is largely not persisted** and the screen tour is a stub. `6.6.26` §7/§8 are stale. |

**The one thing I would act on first:** decision 2's RLS, *before* anyone builds the
sharing UI. Today it is harmless because zero personal subjects exist. Ship the surface
first and every personal course a teacher creates is readable by their grade lead from
the moment it exists — while the admin still cannot do the one thing the decision said
they should be able to.

---

# Addendum — does onboarding config survive a device change?

Closing the loose thread from decision 3. **Measured at `HEAD` = `e8f403f`** (unchanged
since the previous section); dirty tree excluded; read-only.

## The short answer: NO — and it is the defect shape you named

**A teacher who completes onboarding on their laptop and opens the app on their phone
gets an app that believes it is configured and is not.** `onboarded_at` persists to
Supabase, so the wizard never runs again — while three of the five steps' output existed
only in the first device's `localStorage`.

The flag and the data **are persisted at different grains**, exactly as you feared.

## Per step — where each one's output actually lands

| Step | Writes to | Survives a device change? |
| --- | --- | --- |
| **workspace** | `renameWorkspace(targetId, name)` — a real RPC (`workspace-step.tsx:75`), with revert-on-error | **YES — real DB row** |
| **courses** | `useOnboardingV2` only. No settings hook, no `subjects` write. | **NO — local state** |
| **schedule** | `use-school-week` + `use-schedule-settings` — both **`localStorage`-only** (no `supabase`, no `.from(`, no `rpc(`) | **NO** |
| **year** | `useOnboardingV2` only | **NO** |
| **appearance** | `AppearanceControls` → theme provider → `saveRemotePrefs` → `teacher_preferences` (gated on `NEXT_PUBLIC_THEME_SYNC=1`, which is on in prod) | **YES** |
| *(the gate itself)* | `markOnboardedRemote()` → `teachers.onboarded_at` | **YES** |

`finish()` (`lib/onboarding-v2-state.tsx:134`) calls **only** `markOnboardedRemote()`.
It does not persist any collected configuration. So the summary step's own caveat —
*"the config persists to THIS device until the backend lands"* — is accurate, and the
answer to your question is **not** "a staging buffer that each hook later syncs". Two of
five steps sync, through their own mechanisms, and they are the two that were already
wired for other reasons.

## The sharper problem underneath: school week has two sources of truth

This is worse than "the setting didn't travel", and I would fix it ahead of the rest.

- **The planner reads the DB.** `lib/planner/supabase-source.ts:163-231` derives the
  weekday mapping from **`schools.school_week`** via `resolveSchoolWeek`, cached per
  request. The column exists and is live.
- **The wizard writes `localStorage`.** `lib/use-school-week.ts` is `localStorage`-only.

So a teacher setting their school week during onboarding writes to a store **the planner
never reads**. On the same device, in the same session, the setting and the surface it is
supposed to govern disagree.

Both hooks also assert a scope their storage cannot deliver:
`use-school-week.ts:130` — *"School week is TEAM-scoped — every teacher on the team"*;
`use-schedule-settings.ts:74` — *"Rotation is TEAM-scoped — the whole grade-level team"*.
A team-scoped setting living in one teacher's browser is per-device by construction. The
comments describe the intended model; the storage implements a different one.

## Mitigation — partial, and not where anyone would look

There **is** a way back into the wizard: `/onboarding` is a live route and
`app/onboarding/page.tsx` gates it `V2 ? <OnboardingWizardV2 /> : <OnboardingWizard />`,
so the v2 wizard is reachable on prod by URL. The only in-app link to it is
**`components/shell/shortcuts-overlay.tsx:254`** — inside the keyboard-shortcuts overlay.

That lowers the severity from "unrecoverable" to "recoverable if you know", but a
keyboard-shortcuts panel is not where a teacher looks for "redo my setup". There is no
Settings entry, no prompt, and nothing detects that the config is missing.

## One correction to my own earlier verdict in this file

Above, I recorded decision 3's *"optional screen tour"* as **live**. More precisely:
**the choice is live, the tour is a stub.** `lib/screen-tour.ts` says so in its own
header — *"Wave 12c STUB … For now `startScreenTour()` just navigates to /home"* — and
is written so the real tour can replace the body without changing the signature. The
wizard genuinely offers "Take the tour" vs "Start planning"; taking the tour currently
just lands you on `/home`. The seam matches the locked decision; the feature does not
exist yet.

## Verdict for the plan

**Decision 3 — W12: multi-workspace LIVE; wizard shape LIVE; wizard OUTPUT largely
not persisted.** Three sub-items to carry, in the order I would fix them:

1. **`schools.school_week` vs `use-school-week` split-brain** — a live disagreement
   between what a teacher sets and what the planner obeys, on the same device. Not a
   sync issue; a wrong-store issue.
2. **Onboarding config does not persist** (courses, schedule, year) while
   `onboarded_at` does — so a device change or a cleared site-data yields a
   silently-unconfigured app that will not re-offer setup.
3. **The screen tour is a stub**, and the plan should say "seam shipped, tour
   commissioned" rather than implying the tour exists.
