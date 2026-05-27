# Cross-Cutting Phase 2 Findings

> **⚠ Snapshot disclaimer** — this is a dated audit/research artifact (2026-05-24).
> Findings and recommendations may have shipped, regressed, or been superseded by
> later work. Verify against current code (`git log -- <file>`) before treating any
> finding as open or any recommendation as binding. The canonical project guide is
> `CLAUDE.md`.

**Scope:** Improvements spanning the entire product, informed by shell components, design system (`lib/theme.tsx`, `lib/palette.tsx`, `app/tokens.css`), and CLAUDE.md §4.

---

## 1. Information Density & Visual Hierarchy

### Theme: Dense mode for power users; default stays calm

**Current state:**
- App ships in `vivid` style + `highlight` palette by default (BUILD_STANDARD §4)
- `calm` and `quiet` modes exist in code but are not surfaced in Appearance settings
- Top bar is sticky but responsive collapse cascade (BUILD_STANDARD §8) limits label visibility at phone
- Right-rail (Resources, To-do, Chat) hides below 1280px; no mobile drawer alternative yet

**Phase 2 opportunities:**

🟧 **Add "Dense" checkbox to Appearance settings** (Medium impact, Medium effort)
- Allow teachers working on large screens to toggle a `data-density="compact"` mode
- Reduce card padding from 16px → 12px, section gaps from 24px → 16px, margins throughout
- Affects: `app/tokens.css` (new `--spacing-compact-*` tokens), `components/appearance/` decision tree
- **Why:** Teachers planning 200+ lessons/year benefit from more-at-once; default calm view protects new users
- **Effort:** 20 min (token definitions) + 10 min (settings toggle) + 10 min (spot-check responsive)

🟧 **Add right-rail drawer for tablet/phone** (High impact, High effort)
- Currently hidden below 1280px; restore access via hamburger menu
- Mount drawer in `components/shell/` as a mobile-only surface
- **Why:** Resources, To-do, Chat are core to the daily workflow; hiding them on 70% of devices degrades UX
- **Effort:** 45 min (drawer component) + 20 min (integration with top bar) + 10 min (verify focus trap)

🟨 **Surface `quiet` and `calm` card styles in Appearance** (Low impact, Low effort)
- Styles exist but are buried in code; teachers can't discover them
- Add three radio buttons: `Vivid` (default) / `Calm` / `Quiet`
- **Why:** Supports diverse teacher accessibility needs; Quiet is WCAG AAA-ready
- **Effort:** 10 min

---

## 2. Accessibility Beyond WCAG AA

### Theme: Passive accessibility (for assistive tech) + active accessibility (for keyboardists)

**Current state:**
- Core WCAG AA: landmarks, ARIA, button semantics, 44px targets all present
- Gaps: missing `aria-describedby` on form errors, span-based checkbox, no AAA color contrast goal
- Keyboard: view tabs, filters, master/personal toggle all keyboard-reachable; no documented keyboard shortcuts

**Phase 2 opportunities:**

🟧 **Audit and upgrade to WCAG AAA contrast (4.5:1 text / 3:1 graphics)** (Medium impact, Medium effort)
- Current palette meets AA; some status colors (`--important`, `--fyi`) may not meet AAA
- Requires spot-checking component renderings; may need palette adjustment
- **Why:** Teachers with low vision (up to 8% of users) benefit; competitive advantage for school market
- **Effort:** 30 min (contrast audit) + 15 min (palette refinement)

🟧 **Keyboard shortcut system (help overlay + discoverable hotkeys)** (Medium impact, High effort)
- `components/shell/shortcuts-overlay.tsx` and `global-shortcuts.tsx` exist but are stub-level
- Implement: `Cmd+/` for help, `Cmd+K` for command palette, `Cmd+Z`/`Y` for undo/redo (already working via reducer)
- Wire keyboard context in `app/layout.tsx` to capture globally
- **Why:** Power users 4–5× faster; teachers with motor control benefit; industry standard
- **Effort:** 60 min (hotkey routing) + 20 min (help overlay content) + 10 min (test focus traps)

🟨 **Add `aria-describedby` to all form error messages** (Low impact, Low effort)
- Audit: `AddEventForm.tsx`, `AddLessonForm.tsx`, future forms
- Link inputs to error `<span id="…">` via `aria-describedby`
- **Why:** Screen reader users hear errors tied to the field, not floating
- **Effort:** 15 min

🟦 **Document accessible color combinations for custom unit/subject colors (Phase 2B)** (Low impact, Low effort)
- Teachers may customize subject colors in future; document AA contrast checks
- Add a validator: warn if fg + bg don't meet AA
- **Why:** Protects teachers from misconfiguration
- **Effort:** 20 min (validator) + 5 min (docs)

---

## 3. Mobile-First Wins

### Theme: Tablet & phone are primary; desktop is secondary

**Current state:**
- Lists default on phone; grid on desktop (WeeklyShell checks `max-width: 900px`)
- Right rail hides; sticky chrome ≤30% of phone viewport
- All touch targets 44px on phone/tablet (via hit-area inflation or real size)

**Phase 2 opportunities:**

🟧 **Add collapsible week-strip navigation on phone** (Medium impact, Medium effort)
- Currently phone lists lessons by day with horizontal week-strip nav above (DailyView)
- Add a "Week [-] W12 [+]" widget that expands to a date picker
- **Why:** Jumping weeks on phone requires scrolling left to the nav; modal picker is faster
- **Effort:** 25 min (date picker component) + 15 min (state integration)

🟧 **Bottom sheet for Catch-up / To-do on mobile** (Medium impact, Medium effort)
- Top bar has catch-up flame button but Catch-up view is full-screen
- Add swipe-up sheet that shows the top 5 catch-up items with a "View All" link
- **Why:** Teachers can triage catch-up without navigating away from the planner
- **Effort:** 40 min (bottom-sheet component) + 10 min (integration)

🟨 **Add phone-specific menu (icon → burger menu → actions)** (Low impact, Medium effort)
- Top-bar is dense; icon rail is visual-only; menu lives in a drawer
- Include: Settings, Sign Out, Feedback, Help
- **Why:** Cleans up top bar; standard mobile pattern
- **Effort:** 30 min

---

## 4. Personalization & Preferences

### Theme: Save every preference; adapt to individual workflows

**Current state:**
- Theme (style + palette) saved in localStorage
- View mode (Grid | List) saved per teacher
- Collapsed sections in lesson-flow saved per section
- Master/Personal toggle state is not persisted (resets on nav)

**Phase 2 opportunities:**

🟧 **Persist Master/Personal toggle in user session/profile** (Medium impact, Low effort)
- Currently re-reads on every page load; should "stick" to teacher's choice
- Move from URL state to user profile (once Supabase auth lands)
- **Why:** Teachers editing Master want it remembered; reduces accidental personal edits
- **Effort:** 10 min (when backend auth ships)

🟧 **Add "Expand all lessons" / "Collapse all lessons" session toggle** (Medium impact, Low effort)
- Lesson cards (Weekly, Daily) can expand to show full text + resources
- Add top-bar button to toggle all cards at once, remember choice
- **Why:** Teachers scanning ~40 cards/week benefit from batch expand/collapse
- **Effort:** 15 min (toggle hook) + 10 min (component state lifting)

🟨 **Remember teacher's preferred filter set per view** (Low impact, Medium effort)
- Left filter panel (Subject, Unit, Status, Standards) can be saved as named presets
- "Show me Reading + Unit 3 + Modified only" → save as "My Draft" and re-apply
- **Why:** Teachers reuse the same filter; reduces navigation friction
- **Effort:** 25 min (preset store actions) + 15 min (UI for save/load)

---

## 5. Collaboration & Awareness

### Theme: Async-first; optional real-time signals

**Current state:**
- Master/Personal forking is the collaboration model (CLAUDE.md §2)
- No real-time presence (who's viewing what, live typing)
- No comment threads or annotations
- Save indicator in top bar shows "All changes saved" (mocked)

**Phase 2 opportunities:**

🟧 **Add lesson-level comments (inline annotations)** (High impact, High effort)
- Teachers can leave feedback on Master lessons before their teammates fork
- Click a lesson → sidebar with comment thread
- Requires backend (Supabase insert + real-time subscription)
- **Why:** Closes the feedback loop; teachers see critique before personalizing
- **Effort:** 60 min (UI) + 40 min (Supabase schema + wiring)

🟧 **Activity feed: "Jane added Reading lesson" / "Bob marked Unit 2 done"** (Medium impact, High effort)
- Right-panel tab or sidebar showing recent team actions
- Real-time updates via Supabase listen
- **Why:** Teachers stay aware of team progress without explicit check-ins
- **Effort:** 50 min (feed UI) + 30 min (Supabase schema + subscription)

🟨 **Presence indicator in top bar (who's online, viewing what)** (Low impact, High effort)
- Show avatar stack of teachers currently viewing the planner
- Click to see "Jane: viewing W12", "Bob: in Settings"
- Requires backend session tracking
- **Why:** Async team awareness; reduces duplicate work
- **Effort:** 45 min (backend session API) + 25 min (UI)

🟦 **Share-by-link (invite non-account users to view)** (Low impact, Medium effort)
- Generate a read-only shareable link to a lesson or week
- Useful for parent communication (Phase 1B)
- **Effort:** 30 min (link generation) + 20 min (middleware auth)

---

## 6. Workflow Automation & Smart Defaults

### Theme: Reduce toil; smart suggestions

**Current state:**
- Lessons are manually created and scheduled
- No recurring lesson templates or bulk actions
- Master/Personal forking is manual (lazy forking on first edit)

**Phase 2 opportunities:**

🟧 **Recurring lesson templates (weekly, bi-weekly, monthly)** (High impact, High effort)
- Teacher clicks "Repeat" on a lesson → configure pattern → auto-populate calendar
- Requires: scheduler service (cron-like), template store actions
- **Why:** Reading happens Tue+Thu every week; reduces ~10 clicks/week per teacher
- **Effort:** 50 min (template UI) + 30 min (scheduler backend)

🟧 **Smart Master suggestions based on prior years** (Medium impact, High effort)
- Teacher imports last year's plan; app suggests "Did you mean to add Reading on W12?"
- Requires prior-year data + similarity matching
- **Why:** 80% of curriculum repeats year-over-year; teachers shouldn't re-invent
- **Effort:** 60 min (diff algorithm) + 20 min (UI suggestion modal)

🟨 **Bulk mark done (select 5 lessons → "Mark Done")** (Low impact, Low effort)
- Multi-select checkboxes in list view; bulk action bar
- **Why:** End of quarter, teacher marks 20 lessons done at once
- **Effort:** 20 min

🟨 **Copy week (duplicate a successful week to the next month)** (Low impact, Medium effort)
- Teacher right-clicks W12 → "Copy to W16" → auto-adjusts dates
- **Why:** Math block is the same every month; one click vs. 7 days of manual copying
- **Effort:** 30 min

---

## 7. Analytics & Observability

### Theme: Understand pacing, effort, and usage patterns

**Current state:**
- No metrics tracking (by design — Phase 1A ships without telemetry)
- Save events are mocked (top bar shows "All changes saved")
- No visibility into: how long lessons take, which standards are covered, team progress

**Phase 2 opportunities:**

🟧 **Coverage dashboard (which CCSS standards have lessons assigned)** (Medium impact, Medium effort)
- Left sidebar or Settings pane: "Reading" → see list of standards mapped, % coverage
- Highlights gaps (e.g., "RL.5.3 — not covered this semester")
- **Why:** Teachers ensure standards alignment; solves state compliance pain
- **Effort:** 30 min (UI component) + 20 min (query for standards coverage)

🟧 **Pacing analytics (days spent per unit, lessons per week trend)** (Medium impact, High effort)
- Chart in Settings / Yearly view: lessons per week over time, unit completion dates
- "Unit 2 took 6 weeks this year, 4 weeks last year" — inform next year's planning
- Requires historical data + charting library (recharts already in stack?)
- **Effort:** 40 min (data aggregation) + 30 min (chart UI)

🟨 **Team effort snapshot (active teachers, edits this week, Master vs. Personal ratio)** (Low impact, Medium effort)
- Grade 5 team lead sees "4 teachers, 120 edits, 40% Personal forks"
- Detects: who's actively planning, early adopters of Personal forking
- **Effort:** 25 min (store queries) + 15 min (dashboard UI)

🟦 **Audit log (who changed what, when, with what context)** (Low impact, High effort)
- Required for school accountability / compliance
- Supabase RLS + audit table (DDL already drafted in docs/claude-bypass.sql)
- **Effort:** 40 min (audit table + trigger) + 20 min (viewer UI — deferrable to Phase 3)

---

## Summary by Impact × Effort

### 🟥 High Impact, Low Effort (Do First)
- Add "Dense" mode toggle (20 min)
- Surface `quiet` and `calm` styles in Appearance (10 min)
- Persist Master/Personal toggle (10 min, backend-dependent)

### 🟧 High Impact, Medium Effort (Do Next)
- Add right-rail drawer for mobile (75 min)
- WCAG AAA contrast upgrade (45 min)
- Keyboard shortcut system (90 min)
- Recurring lesson templates (80 min)
- Coverage dashboard (50 min)

### 🟨 Medium Impact, Low Effort (Polish)
- Add phone week-picker (40 min)
- Expand all/Collapse all toggle (25 min)
- Add "aria-describedby" to forms (15 min)
- Bulk mark done (20 min)
- Copy week (30 min)

### 🟦 Medium/Low Impact, High Effort (Phase 2B+)
- Bottom sheet for Catch-up (50 min)
- Phone burger menu (30 min)
- Lesson-level comments (100 min backend)
- Activity feed (80 min backend)
- Presence indicators (70 min backend)
- Smart Master suggestions (80 min)
- Pacing analytics (70 min)
- Audit log viewer (60 min)

---

## Accessibility Debt from Phase 1A

| Item | Severity | Fix Time | Impact |
|------|----------|----------|--------|
| ListRow `<span role="checkbox">` | 🟥 | 10 min | Keyboard blocks all lists |
| Hard-coded colors (hex) | 🟧 | 30 min | Design system violation |
| Missing `<h1>` on Daily/Schedule | 🟧 | 15 min | WCAG 1.3.1 |
| Form `aria-describedby` | 🟨 | 15 min | Screen reader UX |

**These must ship in Phase 1B (hot-fix wave) before Phase 2 work begins.**

---

## Recommended Phase 2 Roadmap

**Wave 1 (Week 1):** Dense mode, Style picker UI, Keyboard shortcuts, WCAG AAA audit  
**Wave 2 (Week 2):** Mobile drawer, Phone week picker, Bulk actions, Coverage dashboard  
**Wave 3 (Week 3):** Repeat templates, Smart suggestions, Pacing analytics  
**Wave 4 (Week 4+):** Collaboration (comments, activity feed, presence)  

Total estimated: 25–30 engineering days across a 2-person team working 4 weeks.
