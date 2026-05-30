# Claude Design Brief — Grade 5 Curriculum Planner

> **What this is:** instructions for what to build next in Claude Design (artifact mockups), paired with the full planning document. Use both together. The planning document is the spec; this brief tells you what to prioritize.

---

Hi Claude — I'm continuing work on the Grade 5 Curriculum Planner. The planning document attached (planning_document.md) is the spec. Before any new design work, I need an audit of where the existing mockups stand against the current spec. Then the build brief follows.

Read this whole message before starting. The audit comes first; the build brief tells you what comes after.

---

# Part 1 — Audit request (do this first, before any new design work)

The mockups you've built so far look strong in their current aesthetic — the goal here isn't to rework anything. It's to inventory what's done and what's still pending so we both know exactly where to start. The planning document has moved ahead of the prototypes in several places, and §5.16 specifically is a list of cross-cutting UX improvements that haven't landed in any mockup yet.

## What I need

A structured audit, delivered as a single artifact or document, with three sections:

### Section 1 — What's been built

For each component you've designed so far, list:
- The component name as you've labeled it in the mockups
- The matching §6.4 prototype number from the planning document (e.g. "your '8 — Subject view' = planning doc §6.4 component 5"). If you can't find a match, flag it.
- A one-line description of the state captured (e.g. "Lesson card — collapsed and expanded states, no hover state yet")

Your current numbering may not match the planning doc's order — that's fine. Just provide the cross-reference so we have one map.

### Section 2 — §5.16 improvements audit

Section 5.16 of the planning document lists cross-cutting UX improvements that should be reflected in every component. For each item below, mark **✅ implemented**, **⚠️ partially implemented** (and describe what's missing), or **❌ not implemented**, with a one-line note pointing to where it should show up:

- [ ] Right-click `⋯` hover affordance on every lesson card
- [ ] Personal-mode three-tier visual differentiation (solid stripe / dashed stripe + "Modified" pill / solid stripe + move-arrow icon). Replaces the old 9px lock icon.
- [ ] Master-mode entry banner sequence (flashing red heads-up message that fades to a small persistent red banner)
- [ ] Collapsed comment thread ("💬 N comments" badge by default)
- [ ] Keyboard shortcuts (`j/k/h/l`, `e`, `Space`, `⌘D`, `⌘K`, `Delete`, `/`, `?`, `Esc`, `g c`) and the `?`-triggered cheat sheet modal
- [ ] Empty-day affordance ("Drag a lesson here or click +" hint on empty grid cells)
- [ ] Catch-up three-layer system: (a) global on/off toggle in Settings, (b) per-week dismissible in-grid bar with top-bar flame badge, (c) dedicated Catch-up screen (§5.17)
- [ ] Today/Now indicator on Schedule view (2px subject-color top border + pulsing "▶ NOW" badge + horizontal red now-line)
- [ ] Print pagination stress-test (9-subject week with full directions)
- [ ] Carry-over stat on Today dashboard becomes a clickable link that opens the Catch-up screen filtered to last week
- [ ] Standards code drill-through (chips clickable, open a side panel listing every lesson tagged with that standard)
- [ ] Daily Notes are personal-only (the team-visible-by-date surface is the Day Shoutbox). Urgent priority is solid red, NOT pulsing.

Also flag the following NEW Phase 1 features that were added in the latest planning round and are almost certainly not in any current mockup:

- [ ] **Personal subjects** — teachers create their own subject rows (Morning Meeting, Afternoon Circle) in Settings; appear in their own views only, invisible to teammates. **Behave like team subjects for the owner** (can have units, weekly structure, all event types).
- [ ] **Time-slot vs. personal-subject creation flow** — the Schedule view setup form asks "Time slot or Personal subject?" when adding a new block; conversion in both directions later via context menu.
- [ ] **Personal subject promotion to team** — Settings "Share with team" action; lead approval queue (delegatable to `grade_admin`); on approval, subject becomes team-visible but owner's existing events stay personal.
- [ ] **Year-over-year persistence of personal subjects** — subject definition + curriculum structure (units, core lesson events, recurrence patterns) clone to the new year at rollover; completion records archive with the prior year. **Every teacher with personal subjects is asked at rollover.** Each subject has a `rollover_preference` (Ask me / Roll over / Archive), default Ask me — this only **pre-selects** the radio on the rollover prompt; it never skips the prompt. (Year rollover itself is Phase 2; the per-subject preference control ships in Phase 1.)
- [ ] **Recurring Extra Lesson Events** — daily / weekly / every-N recurrence pattern on extra events; 🔁 icon on recurring instances; edit-instance-vs-future-vs-all dialog.
- [ ] **Print Center (§5.9)** — unified print interface with scope chips (Day / Week / Month / Year / Subject / Unit / Not-done), completion filters, content toggles, format toggles, live preview, year-overview default.
- [ ] **Missed-events task-list mode** — Subject / Unit / Standards-drill views show missed events as a task list at the top in Month / Unit / All scopes (inline-with-red-highlight stays the behavior for Day / Week scopes).
- [ ] **Quick standards tagging** — "Tag standards" entry on the right-click / ⋯ menu opens a compact picker filtered to the subject's default frameworks (with a "Show all frameworks" override).
- [ ] **Per-subject default frameworks** — Settings → "Standards framework defaults per subject" lets each teacher pick which frameworks the picker defaults to per subject.
- [ ] **SubjectTeamMembership (Phase 1 data; Phase 2 UI)** — by default any teacher on a subject's team can edit that subject's master; lead can restrict or extend per-subject. Phase 2 UI is the per-subject "Who can edit master" panel in Settings → Team subjects.
- [ ] **Undo affordance** — right-click menu shows "Undo last edit (N available)"; `⌘Z` / `Ctrl+Z` scoped to focused entity; 5-deep stack.
- [ ] **Copy from archived years** — Settings → Year management → Copy from archive opens a read-only archived-year browser with per-item "Copy to active year" actions.
- [ ] **AB-week cycle (Phase 2 UI; Phase 1 data)** — Settings "Cycle pattern" toggle; Weekly/Schedule navigator shows Week A / Week B badges in AB schools; per-Time-Block `week_cycle` selector.
- [ ] **Permissions Admin page (Phase 3, sketch in Phase 1)** — roster + per-teacher profile (Roles / Subject memberships / Feature overrides tabs); permission matrix.
- [ ] **AI budget management (Phase 3 — moved from Phase 1)** — AI Spend dashboard and Caps management with sentence-builder form. **Important: all AI features (curriculum import, auto-tagging, intervention suggestions) moved to Phase 3.** There's no AI in Phase 1A or 1B. The teacher seeds the database via Claude Code translating their existing planning documents into seed scripts directly.
- [ ] **Teaching Reminders banner (Phase 1A — the new feature)** — slim banner on Daily/Weekly/Schedule views with category-tint stripe, click-to-expand inline reveal, **session-close × in the right corner** (closes for this session only; Settings toggle is the permanent off); Today dashboard widget with same close-× behavior; two categories (Behavioral / Academic) with per-category Settings toggles + master "Hide all" override.
- [ ] **Resource attachments (Phase 1B — moved up from Phase 3)** — hosted files (PDF, DOCX, RTF, images, image stacks) up to 25 MB / max 10 per lesson, plus unlimited links (external + YouTube + Drive) with auto-fetched preview banners. Cloudflare R2 storage backend. Lesson card displays type-indicator icons. Two-pane resource viewer with persistent lesson sidebar (other resources + scrollable notes + standards chips). Drag-and-drop attachment from desktop and address bar. School-admin "Resource hosting mode" toggle (default: Links only).
- [ ] **View modes (Phase 1A — the three-way pill is already built; Simple needs design depth)** — three-way pill (Grid/Timeline · Task · Simple) is in place. **What's missing: a designed low-floor Simple mode for the four most-trafficked views.** Current build's Simple mode is flag-hidden chrome (Modified pill / move-arrow / comment count / I-Can / tasks pill hide). The deeper pass needs: bigger touch targets (24px checkbox, 88px card height, 6px stripe, 16px title), plain-language labels ("Weeks 9 to 12" not "Wk 9–12"), single primary action per surface, simpler "+ Add lesson" modal (3 fields not 12), suppressed Master/Core mode, plain-language status words. Build this for Lesson card, Weekly, Daily, Subject. Other views stay flag-hidden in 1A.
- [ ] **Phase 1A vs Phase 1B split** — the team now targets a late-August Grade 5 beta. Phase 1A is the beta-ready subset; Phase 1B fills in catch-up screen, to-dos, comments, full keyboard shortcuts, full Print Center, etc. through the fall. Audit should distinguish which work is Phase 1A (urgent — beta gate) vs 1B (after beta).

### Section 3 — What's pending

A clean list of:
- §6.4 components that haven't been built yet
- §5.16 improvements that are unimplemented or partial
- §5.17 Catch-up screen work — this is a new screen, almost certainly not built
- The six new Phase 1 features listed at the end of Section 2
- The single **Vivid direction-setting prototype** (described in Part 2)

Order this list by what you think makes sense to tackle first. I'll review and we'll lock priorities together.

**Important: don't start new design work yet. Just the audit. Once it comes back I'll confirm priorities, and then the build brief below takes over.**

---

# Part 2 — Build brief (after the audit is locked)

Once we've agreed on what's pending, here's the framework for the new work.

## Project context

A web-based curriculum planner for a Grade 5 teaching team in Qatar (4–6 teachers). It consolidates five separate planning documents into one app. Multi-grade-ready data model, Phase 1 launches with Grade 5 only.

**Phase 1 is being shipped lean to launch earlier.** The full feature surface is in the planning doc; Phase 1 deliberately omits the Schedule view, full personal/master forking, year rollover, the Vivid theme in production, and a few other heavier features. Those wait for Phase 2-3.

## The two themes — and what changed in the last round

**Theme A — Quiet** (the existing aesthetic; ships in Phase 1 production):
- Clean, flat, calm — not playful. Visual restraint throughout.
- Lesson cards have near-white backgrounds.
- Subject color appears only as a thin (4px) left-edge stripe on each card.
- Unit shading uses subtle grayscale steps.
- Chrome and content read at similar visual weight.
- Reference points: Asana, Linear's lighter modes, Notion's default workspace.
- Continue producing remaining components in this style for all Phase 1 production work.

**Theme B — Vivid** (one direction-setting prototype only; production deferred to Phase 2):
- Vibrant where color carries meaning; calm in supporting chrome.
- Each subject has a three-step color scale: full-saturation **stripe** (~500-600 weight), light **tint** (~50-100 weight), and **deep** (~700-800 weight) for hover/emphasis.
- Lesson cards use **subject tint as background fill** (NOT pure white). The 4px full-saturation stripe sits on the left edge.
- Unit rows in the weekly grid use light tints of the subject color, not gray.
- Top bar, side panels, body text, navigation chrome remain restrained.
- Reference points: Padlet, Notion's gallery view with colored cards, Linear's project labels.
- **Anti-pattern to avoid:** gray-on-white density. If Vivid looks like Asana, it has drifted toward Quiet.

**Visual test for Vivid:** at a one-meter glance, can you tell which row is Math and which is Writing without reading the title? In Vivid, the answer must be yes.

**Important change from the prior brief:** I'm NOT asking you to build every component in both themes. Build one Vivid prototype to capture the design direction — that's it. All other Phase 1 production components are Quiet only. Vivid production-build waits for Phase 2.

## What I need from you, in this order

### Step 0 — Vivid direction-setting prototype (one artifact, not the full grid)

Build a **single Vivid weekly-grid prototype** so I have a captured design direction for Phase 2. Don't build the whole product in Vivid — just this one artifact.

Use realistic fake data:
- Full week (Sun–Thu).
- ~7 subjects per day (Math, Reading, Writing, Grammar, Spelling, UFLI, Explorers, SEL — vary the daily count).
- 3-4 distinct units across the week so unit shading is visible.
- Realistic lesson titles ("Multiplying multi-digit numbers", "Character arc analysis: protagonist motivations", not "Lesson 1").
- 2-3 line preview paragraphs.
- A few completion checkmarks, a few resource icons, a standards count badge.
- **Mix of personal-modification states** (critical for the three-tier differentiation system):
  - Some unedited-from-master lessons (solid stripe, no marker)
  - Some personally-modified lessons (dashed stripe + "Modified" pill in top-right)
  - Some personally-moved lessons (solid stripe + move-arrow ↔ or ⤴ icon)
  - At least one composed both-modified-and-moved card (dashed stripe + Modified pill + move-arrow)

Label this artifact clearly: **"Vivid — Phase 2 direction prototype (Phase 1 production stays Quiet)."**

**Deliverable:** one artifact, Vivid theme, capturing the design direction so it's not lost. Don't build other Vivid components after this — they wait for Phase 2.

### Step 1 onward — Phase 1 production components (Quiet only)

After Step 0, the rest of the Phase 1 work is all in the Quiet theme.

Priority order — covers both what's already started (audit will tell us state) and what's new:

**Already partially built (per audit) — extend with §5.16 improvements:**
1. Lesson card with all states (collapsed, hover, selected, expanded-inline, **plus the three personal-mode differentiation states**)
2. Weekly grid (3 sample weeks with drag-and-drop, **including the empty-day affordance and the catch-up bar's dismissible state**)
3. Daily notes banner — **personal-only now**, urgent solid red NOT pulsing
4. Right-side detail panel — **including the collapsed-comment-thread "💬 N comments" badge**
5. Subject view — **including the missed-events task-list mode at top**
6. Unit summary card — **including missed-events task list**
7. Master/personal toggle + **master-mode entry banner sequence (flashing → small persistent red banner)**
8. Catch-up filter affordance — **including the dismissed state with top-bar flame badge**

**New Phase 1 components (likely not built yet):**
9. **Catch-up screen (§5.17)** — full-page view with scope chips (Last week / Last 4 weeks / This term / All year), group-by, per-item and bulk actions, carry-over destination picker, celebratory empty state.
10. **Print Center (§5.9)** — left config pane + right live preview; scope chips (Day / Week / Month / Year / Subject / Unit / Not-done); completion filters; content toggles; format toggles; year-overview default + full-detail confirmation.
11. **Time block creation flow** — the form that asks "Time slot or Personal subject?" when a teacher adds a new block in Schedule view setup, with the personal-subject sub-form (name, color, display order, default frameworks). Plus the context-menu Convert actions in both directions ("Convert to personal subject" on a time slot; "Convert to time slot" on a personal subject with a warning).
12. **Personal subjects management in Settings** — list of teacher's personal subjects with cards showing name/color/promotion-status; add/remove/reorder controls; "Share with team" action; promotion-status badges ("Pending lead approval" / "Approved" / "Rejected"). **Also include the "End of year:" rollover-preference control on each card (Ask me / Roll over / Archive) and an "Archived subjects" collapsible subsection with Restore action.**
13. **Subject promotion approval queue (Settings, lead/grade_admin view)** — list of pending personal-subject share requests with requester, subject preview, "View existing events" read-only link, Approve / Reject buttons. Plus a "Delegate approvals to…" picker for the lead.
14. **Year-end Rollover Decision screen (Phase 2 design, sketch now in Phase 1)** — full-page list of **every** personal subject the teacher owns (not just `ask_me` ones), with per-row Roll over / Archive radios pre-selected from each subject's `rollover_preference` (no pre-selection for `ask_me` rows), preference badges per row ("You chose: Roll over" etc.), year-end stats per subject (units, events, completed, not-done), bulk-action bar (Roll over all / Archive all / Reset to my preferences), Skip-for-now option in footer, and the Weekly-view banner that surfaces while a teacher's rollover decisions are pending. Sketch this even though year rollover ships in Phase 2 — the design direction should be locked now.
15. **Personal subject row in Weekly view** — show how a teacher's personal subject (e.g. "Morning Meeting" in orange) renders as a subject row alongside team subjects, with the same color/stripe treatment and units/events structure.
16. **Recurring Extra Lesson Events** — authoring UI for the recurrence pattern (frequency, days-of-week, end condition); the edit-instance-vs-future-vs-all dialog; the 🔁 indicator on recurring instances.
17. **Quick standards tagging** — the compact standards picker that opens from right-click / ⋯ menu, filtered to subject default frameworks with "Show all frameworks" override.
18. **Per-subject default frameworks (Settings)** — UI for selecting which frameworks the picker shows by default per subject; per-teacher preference.
19. **Standards code chip drill-through** — clickable chip on lesson detail opens the side panel listing every lesson tagged with that standard. Include the missed-events section at the top of the panel.
20. **Today / now indicator (Schedule view)** — 2px subject-color top border + pulsing "▶ NOW" badge + horizontal red "now line." Show both `prefers-reduced-motion` on and off. (Note: full Schedule view is Phase 2; the Now indicator design can still be sketched.)
21. **Keyboard shortcut cheat sheet modal** — triggered by `?`; two-column layout with shortcut on left, action on right, grouped by category.
22. Settings panel layout (Profile / Catch-up / Year / Subjects [team + personal, with rollover-preference and Archived subjects subsections] / Time-blocks / Recurring events / Master change log / Tags / Standards framework defaults / Standards frameworks management / Subject promotion approval queue / Grade-level management)
23. To-do slide-out panel (if not already built — per audit)
24. Two-pane Daily layout (Schedule view itself is Phase 2; the two-pane Daily is Phase 1)
25. Today dashboard — **carry-over stat is clickable, opens the Catch-up screen filtered to last week**
26. Grade-level switcher (if not already)
27. Export Center modal
28. **Undo affordance** — right-click menu "Undo last edit (N available)" + post-undo toast confirmation. Quiet only.
29. **Copy-from-archive browser (Phase 1)** — Settings → Year management → archived-year picker → read-only browser of that year's content with right-click "Copy to active year." Quiet only.
30. **SubjectTeamMembership panel (Phase 2 design, sketch now in Phase 1)** — Settings → Team subjects → per-subject "Who can edit master" panel with toggle list. Quiet only.
31. **AB-week cycle navigator badge (Phase 2 design, sketch now in Phase 1)** — Weekly and Schedule navigators with Week A / Week B badges; per-Time-Block week_cycle selector mockup. Quiet only.
32. **Permissions Admin page (Phase 3 design, sketch now in Phase 1)** — roster panel + per-teacher profile (three tabs); permission matrix UI; bulk operations bar. Quiet only.
33. **AI Spend dashboard + Caps management (Phase 3 design, sketch now in Phase 1)** — admin section view with current spend by scope/feature; Caps management with sentence-builder form. Quiet only.
34. **Teaching Reminders banner (Phase 1A — high priority)** — slim banner on Daily/Weekly/Schedule views, category-tint stripe, click-to-expand inline reveal (quote → summary → source link), refresh affordance on hover, **session-close × in the right corner**. Show both Behavioral (amber) and Academic (blue) versions. Plus the Today dashboard widget variant (same content + close-×). Quiet only.
35. **Teaching Reminders library management in Settings (Phase 1A)** — list of reminders with category/quote/source columns; add/edit/delete; CSV import flow. Quiet only.
36. **Resource viewer + lesson sidebar (Phase 1B)** — two-pane focused view: main canvas shows the resource (PDF / image / image-stack / link preview / video-link preview / Drive-link preview); persistent right sidebar (~30% width) shows other resources + scrollable lesson notes + standards chips. Top bar with breadcrumb + close + enlarge + open-in-new-tab. Sketch both the inline-in-Weekly-card variant and the full-screen variant. Quiet only.
37. **Lesson card resource indicator icons (Phase 1B)** — horizontal row of resource-type icons (📄 PDF / 🖼️ image / 🔗 link / 📺 video / 📁 Drive / 📝 DOCX) on collapsed lesson cards; hover tooltip showing per-type counts; "N+" badge for >5 resources. Quiet only.
38. **Resource attachment modal + drag-and-drop (Phase 1B)** — "+ Add resource" modal with Hosted file or Link paths; file path with browse + size validation; link path with live preview banner as URL is pasted. Plus the drag-and-drop landing state on a lesson card (dashed border + subject-tint glow during drag-over). Quiet only.
39. **Image-stack slideshow viewer (Phase 1B)** — main-canvas slideshow with previous/next arrows, page indicator, thumbnail strip. Show inline and full-screen states. Quiet only.
40. **Resource hosting mode toggle (Phase 1B)** — school-admin Settings → School library → "Resource hosting mode" toggle (Links-only vs Files+links) with a small storage-usage gauge once files exist. Quiet only.
41. **Simple Lesson card (Phase 1A — high priority)** — 88px height, 6px subject stripe, 16px title weight 500, 24px completion checkbox, single resource-count icon + count, single standards-count chip. Show side-by-side with Advanced lesson card for direct comparison. Note: this replaces the current flag-hidden Simple pass for the Lesson card. Quiet only.
42. **Simple Weekly grid (Phase 1A)** — Weekly view with: no catch-up bar, no Master/Core banner, larger lesson cards (per Simple Lesson card spec), 40×40 + button on empty cells with "Drag a lesson here or tap +" hint. Show alongside Advanced Weekly. Quiet only.
43. **Simple Daily two-pane (Phase 1A)** — left list with 64px row height; right pane with 14px directions, single "Mark done" button + "More options" disclosure; no keyboard-shortcut hints in empty states. Quiet only.
44. **Simple Subject view (Phase 1A)** — plain-language status words ("Not done yet" / "Done" / "Skipped"), plain-language week ranges ("Weeks 9 to 12"), no standards drill-through chips, no missed-events task list. Quiet only.
45. **Simple "+ Add lesson" modal (Phase 1A)** — simplified modal with only Subject / Title / Day fields; "More fields" disclosure for advanced options. Compare to Advanced's full modal. Quiet only.
46. **Task mode — Weekly (Phase 1A)** — flat checklist grouped by day, filter chips at top, bulk-select toggle, bulk-action bar (Mark done / Mark skipped / Carry over / Add to to-do) appears with selection. Quiet only.
47. **Task mode — Daily / Subject / Unit / Schedule (Phase 1A)** — same flat-checklist pattern across the other views; show one of these with active bulk selection. Quiet only.

## Cross-cutting improvements to apply to every component going forward

> **IMPORTANT — IMPLEMENTATION STATUS:** None of the improvements in this section have been implemented in the current mockups. Treat this as a fresh to-do list. Every prototype going forward should reflect these, and existing prototypes need to be updated.

**Personal-mode visual differentiation (three-tier system):**
- Unedited-from-master: solid subject-color left stripe, no extra marker.
- Personally-modified: **dashed** subject-color left stripe + "Modified" pill in card's top-right corner.
- Personally-moved: solid stripe + move-arrow icon (↔ same-week, ⤴ across weeks) in top-right.
- Both modified AND moved: compose all three (dashed stripe + Modified pill + move-arrow).
- This replaces the old 9px lock icon, which is retired.

**Right-click discoverability:**
- Every lesson card shows a "⋯" affordance on hover (always visible on touch devices) at the top-right.
- Clicking it opens the same context menu as right-click.
- The context menu now includes a **"Tag standards"** entry — opens the compact standards picker filtered to subject defaults.

**Comment threads collapsed by default:**
- On lesson detail (Weekly expanded card, Daily right pane, Unit page), the comment thread renders as a "💬 N comments" count badge by default.
- An unread dot appears on the badge if there are unread comments.
- Clicking the badge expands the thread inline.

**Daily notes are personal-only:**
- Removed the shared/team scope from Daily Notes. Only the author sees their own notes.
- The team-visible-by-date surface is the Day Shoutbox.
- Urgent priority is solid red, NOT pulsing — pulsing is reserved for team-wide alerts; daily notes are private now.

**Empty-day affordance:**
- Empty grid cells in Weekly view show faint hint text: "Drag a lesson here or click +"
- Subject-tinted cell border appears on hover.
- Clicking `+` opens the "+ Add to day" chooser pre-populated with that subject and day.

**Catch-up — three layers of control:**
- **Layer 1 — Global on/off toggle in Settings.** When off, no in-grid bar, no top-bar flame badge, no ambient catch-up affordances anywhere.
- **Layer 2 — Per-week dismissible in-grid bar.** The "🔥 N items not covered" bar has a ✕ to dismiss for the current week. After dismissal, a flame icon with count appears in the top bar.
- **Layer 3 — Catch-up screen (§5.17).** Full-page view of every uncovered/incomplete event across the school year.

**Master-mode entry banner sequence:**
- Toggling to Master mode triggers a **flashing red heads-up message** at the top of the viewport: "Heads up — changes here affect the whole team." Flashes for ~3 seconds.
- Resolves into a **small persistent red banner** at the top of the viewport for the entire Master-mode session.
- No confirm dialog.
- `prefers-reduced-motion`: solid (no fade), then persistent.

**Now indicator (Schedule view):**
- 2px subject-color top border + pulsing "▶ NOW" badge on current block.
- Horizontal red 2px "now line" spans the timeline at the current minute.

**Carry-over click-through:**
- The "N from last week" stat on the Today dashboard is a clickable link.
- Clicking opens the Catch-up screen filtered to last week's items.

**Standards code chips are clickable:**
- On lesson detail, every standards code is a clickable chip.
- Clicking opens a side panel listing every lesson tagged with that standard, with a missed-events section at the top.

**Missed-events task-list mode:**
- Subject view, Unit view, Standards-drill side panel — at Month / Unit / All scopes — surface missed events as a structured task list at the top.
- Day and Week scopes keep the inline-with-red-highlight behavior.
- Each task-list item: title, original date, days-overdue badge, quick actions (Mark done, Mark skipped, Carry over to…, Jump to lesson).

**Quick standards tagging:**
- Right-click / ⋯ menu now has "Tag standards" entry.
- Opens compact picker filtered to subject's default frameworks; "Show all frameworks" override.
- Typing filters; click to add; Escape or click-outside closes.

**Keyboard shortcut cheat sheet:**
- `?` opens a modal listing all shortcuts grouped by category. Includes `g c` for opening Catch-up screen.

## Hard constraints (don't violate these)

1. **No new behavior or layout changes** — the planning document is the spec. Flag ambiguities; don't redesign unilaterally.
2. **Phase 1 production is Quiet only.** Don't drift Vivid components into Phase 1 work.
3. **Accessibility floor:** WCAG AA contrast for text on any colored background.
4. **Color-blind safety:** the eight-subject palette must remain distinguishable under deuteranopia and protanopia simulators.
5. **iPad-friendly:** touch targets ≥ 44px. The "⋯" context menu affordance is visible (not hover-only) on touch.
6. **No emojis in lesson content.** Emojis only in: the "+ Add to day" chooser (📘 ✨ 📅), priority indicators (🔴 🟡 🔵), notification badges (💬 🔥), the Now indicator (▶), and the recurring-instance marker (🔁). Never elsewhere.
7. **No bounce, parallax, page-flip, or decorative motion.** Allowed: 200ms ease-out for card expand, slide-out transitions, drag ghosting, focus indicators, master-mode banner flash, and the pulsing "▶ NOW" badge.
8. **Use real subject names from the spec** (Math, Reading, Writing, Grammar, Spelling, UFLI, Explorers, SEL) — not generic "Subject 1, Subject 2." Plus the teacher's personal subjects (Morning Meeting, Afternoon Circle) where relevant.

## Things to call out as you work

When delivering a prototype, briefly note:
- Which theme it is (Quiet for Phase 1 production; Vivid only for the Step 0 direction prototype).
- Any judgment calls you made that weren't fully specified.
- Anything in the planning document that contradicted itself or was ambiguous — I'd rather know now than discover it in build.

## Tone

The teachers using this tool spend 6+ hours a day in it. The work is serious — curriculum planning for real children — but the tool itself should feel like a craft object, not a database.

## Reference points

**For Quiet:** Linear (light mode), Notion (default workspace), Asana (in moderation).

**For Vivid (Step 0 only):** Padlet (the warmth and color-recognition target), Notion's gallery view with colored cards, Linear's project label chips.

**Anti-references:** Asana at its most muted, generic admin-panel SaaS, anything with rainbow chrome that distracts from content.

---

That's the full brief. **Start with the audit (Part 1). Don't begin Part 2 work until I've reviewed the audit and locked priorities with you. When you do start Part 2, Step 0 is the one Vivid direction-setting prototype, and then everything else is Quiet for Phase 1 production.**
