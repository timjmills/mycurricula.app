# UI/UX audit fragment — /curriculum, /yearly, /auth/claude-login, /, /login

**Auditor:** sub-agent (priorities 5–8)
**Spec:** `docs/5.24.26 ui-ux-audit-prompt-for-claude-code.md`
**Method:** source review + live curl against `https://mycurricula.app` with Bearer auth at desktop (default UA) and iPhone UA (`Mozilla/5.0 (iPhone; …)`). Source citations are `file:line`. Live behaviour checked 2026-05-25.

## Route-name divergence (read this first)

The audit spec names `/curriculum` and `/yearly`. Those routes do not exist:

- `/curriculum` returns `307 → /login?next=%2Fcurriculum` (the SSO middleware bounces unknown protected paths to login — see `lib/supabase/middleware.ts:88`). The route is reachable from `app/(planner)` only as **`/subject` (→ `/subject/math`)** — see `app/(planner)/subject/page.tsx:9`, `app/(planner)/subject/[slug]/page.tsx`.
- `/yearly` returns `404`. The route is **`/year`** — see `app/(planner)/year/page.tsx`.
- The **top-bar tab labels** are "Yearly" and "Curriculum" but route to `/year` and `/subject` (see `components/shell/top-bar.tsx:55-56`). The audit author was likely echoing the visible labels. **All findings below are against the real routes.**

This naming gap is itself a Phase 2 finding (see `[Medium / Small] Route names diverge from tab labels`).

---

## Phase 1 — Defects

### /subject (priority 5 — "/curriculum")

#### Blockers
None.

#### Majors

##### [Major] Subject + Year views are unreachable on phone via the top-bar
**Route:** /subject, /year
**File:** components/shell/top-bar.module.css:563-573, components/shell/top-bar.tsx:230-235
**What I saw:** At `≤480px` the Yearly + Curriculum tabs are hidden (`data-narrow-hide="true"` → `display:none`). The code comment claims phone teachers can still reach the routes "via `3` keyboard nav, a deep link, or by widening the viewport" — none of those are usable on a phone in a Tuesday-morning classroom.
**Why it matters:** A teacher checking their phone before a sub-period cannot reach Curriculum (the long-form planning surface) or Yearly (the roadmap) at all. The product's stated purpose ("git-style forking applied to curriculum") becomes invisible.
**Reproduction:** Open `https://mycurricula.app/weekly?claude=…` in a phone-width window or with the iPhone UA. The top-bar shows only Daily / Weekly / Schedule.
**Proposed fix:** Tracked by existing pending task #82 (hamburger menu / profile reachability at phone). Either a hamburger drawer with all five tabs, or a horizontal-scroll tab strip. Don't ship Phase 1A without one of those.
**Verified against live site:** yes (compared desktop UA vs iPhone UA HTML; the data-narrow-hide attribute is identical in both, so the hide is purely CSS-driven on viewport).

##### [Major] "Filters" and "Export" buttons on /year do nothing
**Route:** /year
**File:** components/year/YearView.tsx:326-340
**What I saw:** Two `<button>`s in the page-header action row — "Filters" and "Export" — render with the action chrome, focus ring, and 44px hit target, but neither has an `onClick`. The Filters button has `aria-label="Open filters"`; Export has `aria-label="Export data"`. Clicking either is a no-op with no visible feedback.
**Why it matters:** "Buttons that do nothing" is the first item in the spec's §1.1 functional-bug list. A teacher trying to filter or export from this view assumes the click failed silently, then either retries or gives up. The Export button is especially load-bearing because Yearly is the route teachers want to print/save (planning doc §10 mentions MOEHE-compliant exports).
**Reproduction:** `curl -L -H "Authorization: Bearer $TOKEN" https://mycurricula.app/year` and inspect the two `<button class="YearView_actionBtn__OwKbm">` instances — no on-page wiring.
**Proposed fix:** Either remove the buttons until Phase 1B, or wire them to the existing left filter panel (`leftPanelOpen` in app-state) and a basic CSV/PDF print stub. If they must stay decorative, add `aria-disabled="true" disabled` and a "Coming soon" tooltip like the YearSidebar already does — the precedent exists in `components/year/YearSidebar.tsx:160-168`.
**Verified against live site:** yes.

##### [Major] /year has no print stylesheet — Roadmap clips to viewport width on paper
**Route:** /year
**File:** components/year/YearView.module.css:113-120, app/globals.css:51-68
**What I saw:** The Roadmap view's timeline lives in `.timelineScroll { overflow-x: auto }`. At 120px per week × ~36 weeks the inner content is ~4320px wide. The global `@media print` rule (`app/globals.css:51`) only hides shell chrome; it does not adjust `.timelineScroll`. When a teacher prints `/year`, the browser renders only the slice currently scrolled into view inside the overflow container — the rest is clipped because `overflow-x:auto` keeps its scroll offset on paper.
**Why it matters:** The audit spec explicitly calls out priority 6 "/yearly — high-level zoom; print-friendliness matters." Teachers print the year view to share with admin, post on classroom doors, or save offline. A clipped printout fails the use case.
**Reproduction:** With the dev server running, open `/year` in Chrome → File → Print → Save as PDF at Letter portrait. The output shows only the weeks scrolled into view; the right edge is cut.
**Proposed fix:** Add a `@media print` block to `YearView.module.css` that (a) sets `.timelineScroll { overflow: visible }`, (b) scales the timeline horizontally to fit the page (e.g. `transform: scale(...)` with `transform-origin: top left`), or (c) re-flows the timeline as a vertical list of months. Option (c) is most reliable for paper. Either way: hide the bottom statStrip, the curriculum filter popover, and the YearSidebar's "coming soon" rail under print — they're noise on paper.
**Verified against live site:** confirmed by inspecting source; not visually verified because that needs a real browser.

##### [Major] /auth/claude-login returns 401 with a valid token (URL-param bypass also broken)
**Route:** /auth/claude-login (and the `?claude=` URL-param variant on protected routes)
**File:** app/auth/claude-login/route.ts:22-24, lib/claude-bypass.ts:383-416, lib/claude-bypass.ts:304-362
**What I saw:** With the value of `CLAUDE_BYPASS_TOKEN` from `.env.local`:
  - `Authorization: Bearer <token>` against any protected route → `200 OK`. **Works.**
  - `GET /auth/claude-login?token=<token>&next=/weekly` → `401 Unauthorized` ("Invalid token", based on the response body length and the `extractToken` / `isValidToken` paths in `lib/claude-bypass.ts:97-135`).
  - `GET /weekly?claude=<token>` → `307 → /login?next=…` (middleware `tryClaudeBypassInMiddleware` returned `{bypassed: false}` so the request fell through to the SSO gate; the token failed `isValidToken`).
**Why it matters:** The team lead's instructions to me say "verify 307 + cookies behaviour" on this route. The live behaviour is that **two of the three documented bypass paths are broken in production**. This affects every Claude surface that uses the URL-param flow (WebFetch, Co-work cookie-jar agents, browser-based crawlers). Only the Bearer header path works.
**Reproduction:**
```bash
TOKEN="$(grep '^CLAUDE_BYPASS_TOKEN=' .env.local | cut -d= -f2-)"
curl -s -o /dev/null -w "%{http_code}\n" "https://mycurricula.app/auth/claude-login?token=$TOKEN&next=/weekly"
# → 401
curl -s -o /dev/null -w "%{http_code}\n" "https://mycurricula.app/weekly?claude=$TOKEN"
# → 307 (bounces to /login)
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" "https://mycurricula.app/weekly"
# → 200
```
**Proposed fix:** Not within this audit's scope (spec says "don't audit the bypass itself"). Most likely cause: the Cloudflare Wrangler secret for `CLAUDE_BYPASS_TOKEN` was rotated/re-uploaded with whitespace, a different base64 encoding, or a trailing newline relative to `.env.local`. The token compare uses `sha256` constant-time eq (`lib/claude-bypass.ts:130-135`), so a one-byte difference fails silently. Re-sync the Cloudflare secret from `.env.local` and re-test.
**Verified against live site:** yes — three curl probes above.

#### Minors

##### [Minor] Two `<h1 id="login-heading">Sign in to your planner</h1>` is fine, but /year double-renders YearView + YearMobile in the DOM
**Route:** /year
**File:** app/(planner)/year/page.tsx:21-49, components/year/YearView.tsx:299, components/year/YearMobile.tsx:136
**What I saw:** Both `<YearView>` (desktop, with `<h1>Yearly View</h1>`) and `<YearMobile>` (with its own `<h1>Yearly View</h1>`) are always mounted; only display is toggled via a CSS `display:contents` / `display:none` switch on a wrapper. The HTML delivered by SSR contains *both* trees. Source code is set up to render the desktop view first (`useState<boolean>(false)`) and only swap to mobile after `useEffect` runs.
**Why it matters:** (1) Phone visitors see the desktop view for one paint then a layout shift to mobile — small CLS hit, possibly noticeable on aging Chromebooks where hydration is slow. (2) Both `<h1>`s are real in the DOM tree — a screen reader using `display:contents` semantics may still announce both depending on AT. (3) Bundles ship 2× the year-view JS to every visitor.
**Reproduction:** `curl -sL -H "Authorization: Bearer $TOKEN" https://mycurricula.app/year | grep -c "Yearly View"` returns at least 3 (page title + both h1s). The plain `grep -c "<h1"` returns 1 because the mobile h1 is inside the wrapper's `style="display:none"` subtree, but in the live DOM after hydration the wrapper flips to `display:contents`.
**Proposed fix:** Use a CSS media query to pick the variant at render time (e.g. an SSR-safe `matchMedia` ahead of mount, or conditionally render only one tree based on a user-agent hint header). Or, if both must stay mounted, give the hidden one `aria-hidden="true"` and remove its h1.
**Verified against live site:** yes (HTML inspection).

##### [Minor] /year shows fake "24 students" badge per subject lane
**Route:** /year
**File:** components/year/LaneCard.tsx:83 (default `students = 24`), components/year/YearMobile.tsx:118 (`students: 24,`)
**What I saw:** Every subject lane card shows "24 students" beneath the subject name. The value is a hard-coded literal — `LaneCard`'s `students` prop defaults to 24, and `YearMobile` always passes 24.
**Why it matters:** The product is teacher-only (CLAUDE.md §1: "Users: teachers only. No student, parent, or admin-facing product in scope"). Showing a student count fakes a feature that doesn't exist and contradicts the spec. Also: a teacher who is curious enough to scan it will assume "24" is real and lose trust when it's the same for every subject.
**Reproduction:** Open `/year`, scan the lane cards. Every subject says "24 students".
**Proposed fix:** Remove the prop and the cell entirely until/unless the product gains a roster. Failing that, replace with a metric that's actually computed (e.g. "27 lessons" using `subjectLessons.length`).
**Verified against live site:** yes (HTML carries the `24 students` literal).

##### [Minor] /subject "% of the year" caption misrepresents the COMPLETE stat
**Route:** /subject
**File:** components/subject/StatStrip.tsx:111-116, comment at 83-85
**What I saw:** The COMPLETE cell shows `{completePct}%` with the caption "of the year". The component's own comment at line 83-85 explicitly notes: "the mock data for this subject has one active unit and three weeks of lessons — not a full-year scope. The ratio reflects the loaded mock window, not a 36-week count." The label is wrong relative to what the number actually measures.
**Why it matters:** A teacher seeing "67% of the year" with three weeks of mock data will assume the team is 2/3 done with Grade 5. When real data lands, this lie becomes a *bigger* lie if the lessons table doesn't span the full year.
**Reproduction:** Open `/subject/math`; the COMPLETE stat reads `%` "of the year".
**Proposed fix:** Change the caption to "of loaded lessons" or just "complete" until the data model includes a year-total denominator. Alternatively, divide by a year-total constant pulled from the unit catalogue.
**Verified against live site:** yes (rendered HTML carries "of the year").

##### [Minor] /subject ResourcesSort overflow message leaks internal phase naming
**Route:** /subject
**File:** components/subject/ResourcesSort.tsx:201-205
**What I saw:** When more than 20 resources match, the footer reads `+{N} more resource(s) — pagination coming in Phase 1B.`
**Why it matters:** Spec §1.11 "Copy bugs" — "TODO / FIXME / placeholder text shipped to production". A teacher does not know what "Phase 1B" means; it's developer-facing language in the user-facing UI.
**Reproduction:** Open `/subject/math` in a state where there are >20 resources (the current mock may not trigger it, but the string is shipped). Confirmed in source.
**Proposed fix:** "+N more resources" or "+N more — view in detail" without the phase reference.
**Verified against live site:** source only (mock doesn't currently exceed 20).

##### [Minor] /subject UnitHealthCard keyboard-shortcut hint uses ⌘ unconditionally
**Route:** /subject
**File:** components/subject/UnitHealthCard.tsx:250-252
**What I saw:** The edit-callout textarea shows the hint "⌘↵ to save · Esc to cancel". The `handleKeyDown` accepts both `metaKey` and `ctrlKey` (line 110), so the binding is correct — but the hint always shows ⌘. Windows / Chromebook teachers (the school deployment hardware per the spec context) will not recognise ⌘ as their key.
**Why it matters:** This is a school running on aging laptops (audit prompt: "busy, often interrupted, often on mediocre school wifi and aging laptops"). Most of those will be Windows/ChromeOS. Showing a Mac-only symbol makes the shortcut feel inapplicable.
**Reproduction:** Open `/subject/math` → click pencil on a unit health card to enter edit mode → bottom of textarea shows "⌘↵ to save · Esc to cancel".
**Proposed fix:** Detect platform at render and show "Ctrl + Enter" on non-Mac, or use a neutral phrasing ("Cmd/Ctrl + Enter to save").
**Verified against live site:** source only (would need to click pencil to confirm — not visited live during this audit).

##### [Minor] /subject UnitHealthCard "draft" state goes stale if `unit.dontMiss` changes after mount
**Route:** /subject
**File:** components/subject/UnitHealthCard.tsx:85, 121
**What I saw:** `const [draft, setDraft] = useState(unit.dontMiss);` initializes once. If another tab or another component updates the unit note, the editing teacher's draft still reflects the prior value until they cancel and re-open. The displayed note (`displayNote = unit.dontMiss`) does update — so the user sees one value in the card and a stale value in the textarea.
**Why it matters:** Edit-then-save in this scenario silently overwrites the other tab's update. The audit prompt's §1.1 lists "save-then-reload data loss" and "race conditions when typing-then-clicking-too-fast" as the kind of failure to flag.
**Reproduction:** Open `/subject/math` in two browser tabs. In tab A, click pencil on Unit 1, start typing. In tab B, edit the same note via the pencil and save. In tab A, save — tab A's stale draft overwrites tab B's update.
**Proposed fix:** Reset `draft` when `unit.dontMiss` changes while not editing, or warn on save if the prop value diverges from the draft's initial value. Simpler: pull the latest value from the localStorage hook into `draft` via `useEffect([unit.dontMiss])` when `!editing`.
**Verified against live site:** source only.

##### [Minor] /subject + /year sidebars contain 8 disabled "coming soon" buttons
**Route:** /year (also other planner routes via the shell — but YearSidebar is unique to /year)
**File:** components/year/YearSidebar.tsx:136-145
**What I saw:** The YearSidebar renders 8 icon-only `<button disabled aria-disabled="true">`s: Calendar, Units, Lessons, Checkpoints, Reports, Students, Settings, Help. They occupy ~250px of vertical space and are decoratively a permanent rail. Tooltips read "Calendar — coming soon" etc.
**Why it matters:** "Students" violates the teacher-only product mandate (CLAUDE.md §1). 7 visible-but-inert affordances on a primary view is heavy chrome cost for zero value. The audit prompt's §2.4 calls out "reduce visual noise" — the rail is mostly noise today.
**Reproduction:** Open `/year`; left sidebar has 8 grey icon buttons that don't do anything on hover or click.
**Proposed fix:** Hide the rail until at least one item is wired up. Or collapse it to a single "More views — coming soon" hint. At minimum remove the "Students" item, which contradicts the product brief.
**Verified against live site:** yes.

##### [Minor] /subject StatStrip has a no-op CSS rule
**Route:** /subject
**File:** components/subject/StatStrip.module.css:92-93
**What I saw:**
```css
.cell:nth-child(4),
.cell:nth-child(5) {
  border-right: none;
  border-right: 1px solid var(--ink-100);  /* this line wins */
}
```
Two `border-right` declarations in the same selector — the second overrides the first, so the `none` is dead code. The visual outcome is "border-right: 1px solid" on cells 4 and 5 at `≤720px`, but the author's intent (per the next selector at line 96-98 forcing `:nth-child(5)` to `none`) reads like they meant to *remove* the border on 4 and 5.
**Why it matters:** Tiny visual bug. At `481–720px` the cell after the wrap shows an unexpected right border. Not visible at default content; visible on narrower laptop widths.
**Reproduction:** Resize browser to ~700px on `/subject/math`; cells 4 and 5 in the stat strip retain a right border that shouldn't be there.
**Proposed fix:** Delete line 93. Or, if the *kept* rule is intentional, delete line 92 and update the comment.
**Verified against live site:** source only.

#### Auth-flow & /, /login (priority 7 + 8, sanity audit)

##### [Minor] No domain restriction on Google SSO callback
**Route:** /auth/callback (and the resulting /weekly landing)
**File:** app/auth/callback/route.ts (entire file — no email-domain check)
**What I saw:** The OAuth callback exchanges any Google ID token via `supabase.auth.exchangeCodeForSession(code)` and redirects to `next`. There's no `if (email.endsWith("@school.example.qa")) …` gate. A teacher signing in with a personal Gmail succeeds and lands on `/weekly`.
**Why it matters:** Planning doc §7 ("Auth (later) — Supabase Auth — Google SSO, restricted to the school domain") + CLAUDE.md §1 mark this as required. The product brief assumes school-domain accounts only. Today any Google account works.
**Reproduction:** Sign in with a personal Gmail (no claude bypass); land on `/weekly` with full edit access.
**Proposed fix:** Add domain allow-list as a post-`exchangeCodeForSession` check; if email doesn't match, sign out + redirect to `/login?error=domain&domain=<allowed>` with a copy explaining which domain to use. Planning doc says this is a "later" phase item; the audit prompt's §1.12 explicitly flags it ("wrong-domain SSO login: cryptic Google error vs friendly explanation"). Mark as required for Phase 1A if your beta is going live to a school, deferred otherwise.
**Verified against live site:** no live test (would require provisioning a second account). Verified by source review.

##### [Minor] /login error message conflates all sign-in failures
**Route:** /login (rendered after callback failure)
**File:** app/login/page.tsx:56-59, components/auth/google-sign-in-button.tsx:144-155
**What I saw:** Any sign-in failure renders "We couldn't sign you in. Please try again." The same message fires for: network failure, invalid nonce, Supabase 5xx, OAuth code reuse, and (per the missing check above) a future domain rejection.
**Why it matters:** Spec §1.12 names this explicitly. A teacher with a wrong-domain account gets the same opaque message a teacher with a network blip gets — the first one retries forever, the second one figures it out.
**Reproduction:** Visit `https://mycurricula.app/login?error=auth` directly to see the rendered alert.
**Proposed fix:** Pass an `error_reason` query parameter from the callback (`error=auth&reason=domain` etc.) and switch the copy based on `reason`. Pair with the domain-restriction fix above.
**Verified against live site:** yes (curl GET on `?error=auth`).

##### [Minor] /login wordmark says "MyCurricula" while top-bar elsewhere says "MyCurricula · Grade 5"
**Route:** /login
**File:** app/login/page.tsx:40-48, components/shell/top-bar.tsx (renders Grade 5 in the wordmark)
**What I saw:** Inconsistent product naming. The login screen omits the grade suffix; every authenticated page includes it. Per CLAUDE.md §1 ("Multi-grade ready by design") the grade is a per-school configuration, not a brand assertion — so the login screen's omission is arguably correct and the top-bar's inclusion is the bug. But the inconsistency is the bug worth flagging now.
**Why it matters:** A teacher's first visit lands on `/login` (clean wordmark), signs in, and lands on `/weekly` where suddenly the wordmark says "Grade 5". Looks like two products.
**Reproduction:** Visit `/login` (signed out) and `/weekly` (signed in) and compare the top-left wordmark.
**Proposed fix:** Resolve the grade scope first (per-school configuration → not in the wordmark), then make both surfaces match.
**Verified against live site:** yes.

#### Visual / layout
None new for these routes beyond the ones already enumerated above. The "already shipped" notes from the team lead (horizontal scroll, schedule tab padding) hold.

#### Missing states
- /year has no "no lessons in this subject" empty state on desktop. A subject with zero lessons would render an empty timeline column with no message. Edge case for now; flag for backend data.
- /subject empty state exists ("No lessons for this period." at SubjectView.tsx:879, 900). Good.
- /login has no loading state for the post-credential exchange UI other than `pending` text "Signing you in…" (`components/auth/google-sign-in-button.tsx:293`). Acceptable.

#### Console / network errors
No `console.error`/`console.warn` in `components/year/**` or `components/subject/**` source. The shipped HTML for `/year` and `/subject/math` contains no embedded error/warning strings.

---

## Phase 2 — Improvements

### /subject

##### [High / Medium] Make resource rows actually openable
**Route:** /subject
**File:** components/subject/ResourcesSort.tsx:162-197
**Today's behavior:** Each resource is a `<div>` showing type · label · unit · lesson. Not a link, not clickable.
**Proposed behavior:** Make each row an `<a href={resource.url}>` (or a `<button>` opening a side-drawer preview) so a teacher can hit "All Math resources" → click → open the slide deck. The resource type already encodes URL semantics (slides, video, link, doc, pdf, image) — wire it.
**Why it's worth doing:** The bottom of the Subject view is positioned as "all resources you need for this subject"; if the only way to actually open one is to navigate to the source lesson, the section's reason to exist collapses. A teacher prepping Math Friday wants to click "U1 · Fraction Circles · Slides" and have it open.
**Implementation sketch:** Extend `ResourceEntry` with a `url: string` field; the LessonResource type likely already carries it. Wrap each row in `<a>` with `target="_blank" rel="noopener"`.
**Open questions:** Where does the URL come from once the backend lands — is it the existing Padlet link, an R2 file, or a Supabase storage URL? Probably all three depending on type.

##### [Medium / Medium] Tighten the COMPLETE stat to mean what it says
**Route:** /subject
**File:** components/subject/StatStrip.tsx:80-85, 111-116
**Today's behavior:** "of the year" caption lies (see Phase 1 minor above).
**Proposed behavior:** Either fix the denominator (need a `lessonsExpectedThisYear` from the data model) or change the caption to honest local scope ("of loaded lessons"). The proper fix is the former — but small-step right now is to add a hover-tooltip ("Counted across N lessons loaded for the current term") so the data is self-explaining until the backend lands.
**Why it's worth doing:** A planner that lies about pacing erodes confidence faster than any other defect. Pacing is the *only* number a busy teacher checks.
**Implementation sketch:** Add an `expectedTotal` prop to StatStrip from the year-calendar module; default to `lessons.length` when missing.
**Open questions:** Is "year" the right scope, or should it be "term" (a school may have 3 terms)? Planning doc mentions term-aware data shapes.

##### [Medium / Small] Replace SubjectView's hard-coded "Grade 5" subheader
**Route:** /subject
**File:** components/subject/SubjectView.tsx:792
**Today's behavior:** `<p>Grade 5 · {activeUnit.weeks}</p>` always renders "Grade 5".
**Proposed behavior:** Read the current user's grade-scope from app-state (already grade-aware per CLAUDE.md). Render the user's actual grade(s). If multiple, "Grade 4–5" or similar.
**Why it's worth doing:** CLAUDE.md §1: "Multi-grade ready by design… never assume a single grade." This is a recurring hard-coding that will silently break the moment the second school onboards.
**Implementation sketch:** Add a `currentGrade` selector to `useAppState()` (or `useCurrentUser()`); render `${currentGrade.label}`.
**Open questions:** How is a multi-grade teacher's "current grade" picked — last viewed, or per-tab?

### /year

##### [High / Medium] Wire Filters + Export, or remove them
**Route:** /year
**File:** components/year/YearView.tsx:326-340
**Today's behavior:** Decorative buttons, no handlers.
**Proposed behavior:** Filters opens the global left filter panel (the chrome already exists in app-state via `leftPanelOpen` — see how /subject uses it at SubjectView.tsx:956-971). Export pops a small menu: "Export as PDF (this year)", "Export as CSV (all lessons)".
**Why it's worth doing:** Yearly is the "share with admin / print for staff room" view. Without an export it's a screen-only artifact. Filters lets a teacher zoom to just the subjects they teach. Both are zero-novelty asks for a planner.
**Implementation sketch:** Filters: `onClick={() => toggleLeftPanel()}`. Export: a small popover with two `<a download>` links — CSV is trivial (already have the lesson array), PDF is the harder of the two; the codebase already uses `@react-pdf/renderer` per CLAUDE.md.
**Open questions:** What does the user expect a PDF of /year to look like? The screen layout doesn't fit a Letter sheet — see the Phase 1 print issue.

##### [High / Large] Replace the dead "coming soon" sidebar with something useful
**Route:** /year
**File:** components/year/YearSidebar.tsx
**Today's behavior:** 8 disabled icon-buttons in a permanent left rail. Visual clutter, no value, "Students" violates product brief.
**Proposed behavior:** Either delete the rail entirely (re-allocate the width to the timeline, which is the most data-dense surface in the app) or replace it with a useful per-subject quick-jump strip — clicking "Math" scrolls the timeline to the next Math unit, "Reading" to the next Reading unit, etc.
**Why it's worth doing:** The audit prompt explicitly names "reduce visual noise on the weekly grid" (§2.4) and the same principle applies to /year. Dead UI is anti-feature.
**Implementation sketch:** Drop NAV_ITEMS, replace with `SUBJECTS.map(s => <SubjectJumpButton subjectId={s.id} onClick={() => scrollToNextUnit(s.id)} />)`. The `scrollToWeek` function already exists in YearView.tsx:235.
**Open questions:** If the teacher only teaches some subjects, does the strip hide the others (probably yes)?

##### [High / Medium] Add an /year print stylesheet
**Route:** /year
**File:** components/year/YearView.module.css, components/year/RoadmapView.module.css
**Today's behavior:** Hidden timeline content beyond the visible scroll position is clipped on paper (see Phase 1 finding).
**Proposed behavior:** Under `@media print`: vertical-stack the months as discrete blocks ("November", "December", …), each month a small grid of weeks with subject lanes inside. Drop chrome, drop the YearSidebar, drop the curriculum filter button. Result is a printable poster.
**Why it's worth doing:** Teachers print this. Today's printout is unusable.
**Implementation sketch:** Add a wrapper class (e.g. `<div data-print-year>` on the page) and a print stylesheet that re-flows `.timelineScroll` from horizontal scroll into a vertical month-band layout. Heavy lift but contained — the Weekly view already has a separate print route precedent (`app/(planner)/weekly/print/page.tsx`).
**Open questions:** Should /year have its own `/year/print` route like Weekly does, or just print stylesheet under `@media print`?

##### [Medium / Small] Render only one of YearView / YearMobile per page
**Route:** /year
**File:** app/(planner)/year/page.tsx:39-48
**Today's behavior:** Both trees are SSR'd, then JS swaps which is visible. Phone visitors see desktop briefly.
**Proposed behavior:** Use a CSS-driven switch only — render both wrappers but with `display: none` purely via media queries (no JS, no `useState`). Or, use the `user-agent` header on the server to pick one.
**Why it's worth doing:** Saves bundle size, eliminates the post-hydration flash on phone, removes the double-h1.
**Implementation sketch:** Move the swap entirely into CSS: a single `<MinimizedSubjectsProvider><div className="show-on-desktop"><YearView /></div><div className="show-on-phone"><YearMobile /></div></MinimizedSubjectsProvider>` with `@media (max-width: 480px) { .show-on-desktop { display: none } }` and inverse.
**Open questions:** None — pure refactor.

### /auth/claude-login (priority 7)

##### [Medium / Small] Surface the bypass-broken state somewhere observable
**Route:** /auth/claude-login (and the URL-param variant)
**File:** lib/claude-bypass.ts (audit log paths)
**Today's behavior:** Bypass fails silently (per the spec note about the schema mismatch, the audit table isn't actually receiving inserts). A new sub-agent showing up tomorrow will hit the same 401 with no breadcrumb.
**Proposed behavior:** Either (a) fix the audit table schema so we can `SELECT * FROM claude_access_log WHERE ok = false` to triage, or (b) add a `/admin/bypass-status` route guarded by Bearer that returns the last N audit hits.
**Why it's worth doing:** The audit prompt itself warns about this exact case — token rotation, schema mismatch, observability. Today the only signal is "Claude said 401, halp."
**Implementation sketch:** Fix `claude_access_log` schema (per docs/claude-bypass.sql vs the middleware insert shape — out of this audit's scope).
**Open questions:** Out of scope for this audit; flagged because the team lead asked me to "verify 307 + cookies behaviour" and the answer is "no 307, no cookies."

### / and /login (priority 8)

##### [High / Medium] Friendlier wrong-domain story
**Route:** /login, /auth/callback
**File:** components/auth/google-sign-in-button.tsx:144-155, app/auth/callback/route.ts:48-49
**Today's behavior:** Personal Gmail signs in successfully (no domain check); a future domain check would render the same opaque "couldn't sign you in" alert.
**Proposed behavior:** Tied to the Phase 1 minor above. After the domain gate is added, callback redirects to `/login?error=domain&allowed=school.example.qa&got=user@gmail.com`. The login page renders: "We can only sign you in with a `@school.example.qa` Google account. You used `user@gmail.com`. Sign out of Google and try again."
**Why it's worth doing:** A teacher denied at the gate today has no idea why. They'll email IT. With a friendly message they figure it out in 5 seconds.
**Implementation sketch:** Domain allow-list comes from an env var or supabase row. Pass `reason` + `details` query params on rejection. Switch login alert copy on `reason`.
**Open questions:** Should the allow-list support multiple domains (a co-school deployment), and is "got=" leaking email PII in the URL acceptable?

##### [Medium / Small] /login wordmark needs the second motto on one line at narrow width
**Route:** /login
**File:** app/login/page.module.css (the `.mottoSecondary` block), app/login/page.tsx:43-47
**Today's behavior:** The second motto is hard-broken into two lines via `<br />`: "Connecting curriculum / to your teaching and their learning." At very narrow widths (e.g. 320px phone), the first half wraps awkwardly mid-word.
**Proposed behavior:** Drop the `<br />` and let CSS handle the line break, OR use `text-wrap: balance` and shorter copy on phone.
**Why it's worth doing:** A teacher's first impression of the product is the login screen.
**Implementation sketch:** Remove the `<br />` from the JSX, add `text-wrap: balance` to `.mottoSecondary` (already supported in Chromium + Safari 17+).
**Open questions:** Is the load-bearing line-break intentional brand language? If yes, keep it.

##### [Medium / Small] /login: middle of the page on a tall phone wastes vertical real estate
**Route:** /login
**File:** app/login/page.module.css:7-15
**Today's behavior:** `.page { flex: 1; min-height: 0; display: flex; align-items: center; }` — the sign-in card sits dead-centred on the page. On a tall phone (~800px h, ~360px w), the card is ~400px tall and the user has to thumb-reach the centred Google button.
**Proposed behavior:** At `≤480px height ≤ 700px`, anchor the card near the top with comfortable thumb padding from the keyboard. Or just `align-items: flex-start; padding-top: 12vh` on phone.
**Why it's worth doing:** The sign-in button should be in easy thumb-reach on the world's most common device profile.
**Implementation sketch:** Add `@media (max-width: 480px) { .page { align-items: flex-start; padding-top: 10vh; } }`.
**Open questions:** None.

### Cross-cutting (apply to multiple of my routes)

##### [Medium / Small] Route names diverge from top-bar tab labels
**Route(s):** /subject (labeled "Curriculum"), /year (labeled "Yearly")
**File(s):** components/shell/top-bar.tsx:46-56
**Today's behavior:** Tab says "Curriculum" but bookmarks/URL say "subject". Tab says "Yearly" but URL says "year".
**Proposed behavior:** Pick one and align. Either rename the routes to `/curriculum` and `/yearly` (with 301 from old) or rename the tabs to "Subject" and "Year". The audit prompt itself called them by the tab labels — that's not the team lead's mistake, it's the inconsistency biting.
**Why it's worth doing:** Cognitive cost is small per incident but compounds across every teacher and every onboarding doc.
**Implementation sketch:** If you rename routes, also update `top-bar.tsx:55-56` `href`s; if you rename tabs, just update the `label`s. Either way: align the file path under `app/(planner)/` and the route in the planning doc §3 IA.
**Open questions:** Which name does the planning doc treat as canonical?

---

## What I couldn't get to

- **Live click-through verification.** I did not actually open a browser at 400 / 768 / 1280; all "what I saw" notes for visual rendering are from inspecting the SSR'd HTML + the source CSS. The horizontal-scroll regressions you already shipped fixes for are not re-checked.
- **/subject/[slug] for each of the 8 slugs.** I spot-checked `math` and `reading`. Other slugs may differ if the mock has subject-specific overrides — none jumped out in source.
- **Print PDF rendering for /year.** Confirmed *via source* that there's no print stylesheet, did not actually try Save-as-PDF in a real browser.
- **Drag-and-drop on /subject (any DnD interactions).** The Subject view doesn't appear to expose DnD in the source I read; if there are any DnD affordances I missed them.
- **Real OAuth round-trip.** Couldn't sign in with a real Google account to verify the wrong-domain / no-domain-restriction behaviour empirically; reasoned from `app/auth/callback/route.ts` source.
- **The audit-log table schema mismatch + the /auth/claude-login 401.** Spec said skip the bypass; team lead said "verify 307 + cookies behaviour." I verified the live behaviour (401) and noted it, but did not dig further (per spec).
- **Hover / focus visible verification.** Source has focus-visible rules everywhere I looked. Not visually confirmed in a real browser at each viewport tier.

## Appendix

### Files referenced
- `app/(planner)/subject/page.tsx`, `app/(planner)/subject/[slug]/page.tsx`
- `app/(planner)/year/page.tsx`
- `app/auth/claude-login/route.ts`, `app/auth/callback/route.ts`
- `app/page.tsx`, `app/login/page.tsx`, `app/login/page.module.css`
- `components/subject/{SubjectView,StatStrip,ResourcesSort,UnitHealthCard}.{tsx,module.css}`
- `components/year/{YearView,YearMobile,YearSidebar,RoadmapView,ProgressionView,LaneCard,CurriculumFilter}.{tsx,module.css}`
- `components/auth/google-sign-in-button.tsx`
- `components/shell/top-bar.{tsx,module.css}`
- `lib/claude-bypass.ts`, `lib/supabase/middleware.ts`
- `app/globals.css`

### Live URLs probed
- `https://mycurricula.app/curriculum` (does not exist — bounces to login)
- `https://mycurricula.app/yearly` (does not exist — 404)
- `https://mycurricula.app/subject` (307 → /subject/math)
- `https://mycurricula.app/subject/math`, `/subject/reading` (200)
- `https://mycurricula.app/year` (200)
- `https://mycurricula.app/auth/claude-login?token=…&next=/weekly` (**401** — broken)
- `https://mycurricula.app/weekly?claude=…` (**307 → /login** — broken)
- `https://mycurricula.app/weekly` with Bearer auth (200 — works)
- `https://mycurricula.app/` (307 → /login?next=/)
- `https://mycurricula.app/login`, `/login?error=auth` (200)

Both desktop UA and iPhone UA fetched for /year and /subject/math; delivered HTML was byte-identical (responsiveness is purely CSS, no server-side variant).
