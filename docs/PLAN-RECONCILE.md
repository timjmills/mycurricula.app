# Plan vs. reality — `docs/7.23.26-unified-v2-plan.md` reconciled against `HEAD`

**Verified against:** `git show HEAD:` at **`c1190f7`**. Working tree was dirty (41 files,
six lanes) and **nothing was read from it**. Migration state read live from prod Supabase
(`list_migrations`, read-only). Code claims are code-traced; where I did not verify
something live, I say so.

Three verdicts: **DONE** · **NOT DONE** · **WRONG/AMBIGUOUS AS WRITTEN**.

---

## The headline: one item is wrong in a way that changes what the gate *is*

### §0.1 "Next:" — "the B1.7+B2 Track-B read wiring rides ONE shared §4c flag-ON preview gate **before its promote**" → **WRONG AS WRITTEN**

**There is no "before its promote". It promoted itself.**

- Every push to master auto-deploys (GitHub Actions "Deploy to Cloudflare"; last three
  runs `f76bcae`, `21e511d`, `c1190f7`, all success).
- The planner Supabase flag is **ON in production**.
- All four Track-B migrations are **applied on prod**: `20260728120000`
  `track_b_workspace_fields`, `20260729120000` `unit_assessments`, `…130000`
  `unit_assessments_anon_revoke`, `…140000` `unit_assessments_policy_split`.
- The §4c read pass confirmed the wiring is **live and serving real Supabase data** —
  real unit "Place Value Architects", 1,254 master lesson rows, UUID ids.

So B1.7 + B2 + B3's read/write wiring has been **in production, unverified, since it
merged**. §4c is not a pre-promote gate; it is a **catch-up verification of already-shipped
code**, and its write half has still never been run.

**Should say:** "The Track-B read/write wiring is ALREADY LIVE in production (master
auto-deploys; the flag is on). §4c is a post-hoc verification, not a gate — the read half
is done (`QA-REPORT-4c-read.md`), the write half is authored (`docs/4c-write-plan.md`) and
unrun."

This is the single most consequential correction in the file, because the word "before"
implies a safety margin that does not exist.

---

## §0.1 "Next:" — the rest

| Claim | Verdict | Evidence |
| --- | --- | --- |
| "B5 pop-in overlay" remains | **DONE** | `8c11a83` (global host), `ee34749` (`/year` + paper), `f76bcae` (`/daily`+`/weekly`), `94e57fd` (paper Week). Live-verified 9/9 entry points, exactly one dialog each. |
| "B4.5/B4.6" remain | **NOT DONE** | Still open; lane in flight. |

---

## §5.1 Settings / Config wave

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Full Setup ConfigPage remains | **NOT DONE** | No `ConfigPage` / `config-page` / `settings/setup` file exists at `HEAD`. Accurate as written. |
| **12b-2 multi-workspace** remains | **DONE — the plan contradicts itself** | §0.1 records the cutover as EXECUTED with `20260724120000` / `20260725120000` / `20260726120000` applied (confirmed present in prod). §5.1 still lists it as remaining. |
| **Settings sharing-management UI** remains | **NOT DONE — and this is a "shipped but unreachable" case** | The backend is complete and applied: `20260717120000_course_sharing_rpcs` is on prod, and `lib/subjects/actions.ts` exposes `shareCourseAction` / `unshareCourseAction` / `listCourseSharingAction`. **No component anywhere imports any of them** — `git grep` over `components/**` + `app/**` returns nothing. Per-course sharing is a user-locked model decision that a teacher currently has no way to use. |
| "Wire the onboarding activation gate **after** the remote column lands" | **DONE — the plan contradicts itself** | `FirstRunRedirect` is mounted at `app/(planner)/layout.tsx:196`; `useFirstRunRedirect` lives in `lib/onboarding-v2-state`; migration `20260727120000 teacher_onboarded_at` is applied. §0.1 says shipped; §5.1 still lists it as remaining with a "latent foot-gun until then" caveat that no longer applies. |

---

## §5.2 Track B workspace

| Claim | Verdict | Evidence |
| --- | --- | --- |
| "this needs an additive, nullable migration (timestamp after `20260717120000`)" | **DONE** | `20260728120000` applied on prod. The sentence still reads as future work. |
| **`UnitDrawer` — DONE (`a121863`)** | **CORRECT** | File absent at `HEAD`. |
| **`/subject` — KEEP** | **CORRECT** | `app/(planner)/subject/page.tsx` present at `HEAD`; reasoning still holds. |
| **"the focus-lesson path" — AMBIGUOUS, not started** | **STALE** | The ambiguity was resolved by user ruling: it is `LessonModal`. `components/lesson-editor/LessonModal.tsx` still exists at `HEAD`, so *not started* remains true — but "ambiguous" no longer is, and the doc still tells a reader to "confirm which before scoping". Should record the ruling. |
| **`TimelineYear` NOT retireable; "B5 WIRES the paper frame"** | **CORRECT, and the wiring is now DONE** | `TimelineYear.tsx` present; `YearShell.tsx` routes `frame === "paper"` to it; it reaches the workspace via its own `[data-year-unit-workspace]` opener (`TimelineYear.tsx:609-617`), live-verified opening exactly one dialog. |

### The porting hazard the plan predicted — and that shipped anyway

§5.2 lists, verbatim: *"`setSaveTarget(id,"core")` is a store **no-op** (never ship a
Team-save button that claims it reached the team)."*

**The hazard is still real** — `lib/planner-store.tsx:961` returns `doc` unchanged for any
target other than `"personal"`, confirmed at `HEAD`. **And it was shipped anyway, four
times:**

1. `save-target-dialog` — "Team Curriculum / Updates the shared plan for the whole team".
2. `fork-diff-panel` — "Propose to Team" (sets edit mode, closes, proposes nothing).
3. `/post` Section tooltip — promises "a resource or a note" for a notes-only control.
4. **`context-menu.tsx:352` "Delete from Team Curriculum"** — `danger: true`,
   *"Permanently remove this lesson from the Team Curriculum — affects every teacher's
   plan"*, and the `"delete"` action has **no handler anywhere** (`WeeklyGrid`'s
   `handleContextAction` branches only on duplicate/move/mark-status).

The plan named this exact failure mode as a hazard to avoid, and four controls shipped
that do it. That is worth recording in the plan itself, not just in the defect log —
a documented hazard that four separate lanes walked into is a process signal, not four
coincidences.

---

## §5.3 "Verify at build time"

| Question | Answer |
| --- | --- |
| Is `20260717120000_course_sharing_rpcs.sql` applied on prod? | **YES.** Present in `list_migrations`. **This section can be closed** — but see §5.1: applied backend, no UI. |
| Live state of the 7-17 workspace-model decisions | **Partly answered** — §0.1 records the cutover as executed and the migrations are present. I did **not** verify the decisions themselves against `docs/6.6.26 Workspace-Notebook-Team Model.md`; that comparison is still open. |

---

## §6 Non-blocking backlog

| Item | Verdict |
| --- | --- |
| **`/home` "Today's lessons" reads a mock helper → real fix needed** | **TRUE BUT MIS-SCOPED — see the correction below.** `lib/home/today.ts` does import straight from `@/lib/mock/lessons|todos|notes|shoutbox|calendar` with no Supabase branch. But it is reached only by `HomeV1`, and `app/(planner)/home/page.tsx` is flag-gated: `V2 ? <HomeConsole /> : <HomeV1 />`. **Production runs V2 ON**, so prod `/home` renders `HomeConsole`, which imports no mock data and no planner store. The mock helper is therefore a **flag-OFF rollback-path** defect, not a live one. Still worth fixing — the rollback path has to work if it is ever used — but it is not showing fabricated curriculum to teachers today. |
| "school admin" → "workspace admin"; single-source `seat_cap` | **DONE per §0.1**, still listed in §6. Contradiction. |
| `/settings/account` seeded "Lena Haddad" | **STILL PRESENT** at `HEAD` (`lib/mock/teachers.ts` and two consumers). Accurate as written. |
| `/welcome` pricing hardcode + forbidden School tier | **NOT VERIFIED** — my grep for `School tier` found nothing, but that is weak evidence (the string may differ). Treat as unverified rather than done. |
| Perf items, deferred 9b share-links, AI platform | **Not checked** — no reason to believe they moved. |

---

## A correction to MY OWN report, which the same standard requires

`QA-REPORT-classes.md` ranks **`components/home/rows.tsx:152`** as *"Class A's worst
sibling — the post-login landing screen, the first thing the app says each morning"*.

**That ranking is wrong on production.** `/home` is flag-gated and prod serves
`HomeConsole`; `rows.tsx` is only reachable on the flag-OFF rollback path. The defect is
real but its consequence is far lower than I stated, and **`/daily` remains the worst
confirmed Class A instance**, not `/home`.

I made exactly the error this reconciliation exists to catch: I traced the component and
its data source, but not the route gate above it. The class sweep should be re-read with
`/home` demoted from "highest consequence" to "flag-OFF path".

---

## Pattern worth naming, since it caused five of today's surprises

Every stale item in this file is one of two shapes:

1. **Backend/data landed, UI never did** — course-sharing RPCs applied since 17 July with
   zero consumers; Track-B columns applied and live with no way to populate most of them.
   Reads as "shipped" in a migration list, is unreachable to a teacher.
2. **A later addendum contradicts an earlier section instead of editing it** — §0.1 says
   multi-workspace, the onboarding gate, workspace-admin copy and `seat_cap` shipped;
   §5.1 and §6 still list all four as remaining. A reader who starts at §5 gets the wrong
   answer, and "the latest addendum wins" only helps someone who knows to look.

The second shape is cheap to fix and is why this reconciliation was needed at all. The
first is the one that hurts: **a migration being applied is not evidence that a feature
is reachable**, and this plan has repeatedly used the former as proof of the latter.
