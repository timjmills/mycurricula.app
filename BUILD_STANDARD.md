# mycurricula.app — Build Standard

The visual, structural, and responsive contract every page must follow.
Read this file at the start of every build session. CLAUDE.md links to it.

> **One-sentence rule:** build every new page so it looks and behaves like
> the **Weekly view** (`/weekly`) — the canonical reference for color,
> spacing, typography, card surface, interaction, and motion.

---

## 1. How to use this file

When building a new page, redesigning an existing one, or reviewing work:

1. Read this file in full.
2. Open `/weekly` in the running app at desktop, tablet, and phone widths.
   That is the reference for what "looks right" means in this product.
3. Use the canonical primitives in `components/ui/` (§7). Do not re-build
   a button, card, list row, header, badge, or toggle inline.
4. Run the new-page prompt template in §10 verbatim. Edit only the
   bracketed slots.
5. Verify at three viewport tiers (§8) before declaring work done.
6. Include the per-tier verification line (§11) in every commit that
   touches a primary surface.

CLAUDE.md §4 (the responsive hard rule) and §5 (the verification step)
are the policy backbone behind this doc. This file is the _content_ —
what the design actually is.

---

## 2. The gold-standard reference: Weekly view (`/weekly`)

The Weekly grid card is the canonical visual unit for the entire app.
Every other surface — Daily, Subject, Year, Settings, modals, the rail
widgets — must read as the same product family as a Weekly card. Match
the same:

- **Color tinting** — per-subject `var(--cl)` background via the
  `.cp-subj.<subjectId>` cascade. Same recipe everywhere a subject is
  represented.
- **Card surface treatment** — white-ish body, soft subject-tinted
  header gradient, 4px subject-deep left border, rounded `var(--r-12)`
  corners, hairline subject border on the other three sides, soft drop
  shadow `var(--shadow-card)`.
- **Typography hierarchy** — muted "Subject · time" metadata line on
  top, dominant title H3 (`var(--t-16)` weight 700), optional em-dash
  subtitle, neutral body text.
- **Interaction patterns** — hover-revealed controls (drag handle,
  menu, status pills are `opacity:0` at rest; the dashed left edge stays
  visible as the always-on signal for modified lessons); three-tier
  visual differentiation (unedited / modified / moved).

**Reference citation for new pages:** every prompt should say
"Match the visual style of `/weekly`" so the agent has a concrete
anchor instead of interpreting abstract guidance.

---

## 3. Design tokens — the single source of truth

**Tokens live in `app/tokens.css`.** Every color, type size, radius,
shadow, and z-index must come from a token — `var(--token)` — referenced
in components. Tailwind is used only for layout/spacing utilities; never
for color, type, or semantic spacing.

**Absolute rules:**

- Zero hex anywhere in `components/` or `lib/`. Period.
- Zero raw `rgb()` / `hsl()` for color anywhere in components. Use
  `var(--token)` directly, or `color-mix(in srgb, var(--token) X%,
white|transparent)` if you need a derived variant.
- Mechanical pixel math (`44`, `28`, `8` for hit-area inflation; `1px`
  hairlines; absolute positioning offsets) **is allowed** in CSS files
  for layout math. Color/font/spacing values must come from tokens.
- Subject colors **only** through the `.cp-subj.<id>` cascade (which
  injects `--c`, `--cl`, `--cd`, plus the role tokens `--c-surface`,
  `--c-surface-strong`, `--c-border`, `--c-progress-track`,
  `--c-progress-fill`, `--c-deep`).
- New tokens are added to `app/tokens.css`, never inlined.

---

## 4. Color system

### Subject palette (8 subjects × 3 base + 6 role tokens = 30 per subject)

Every subject (`math`, `reading`, `writing`, `grammar`, `spelling`,
`ufli`, `explorers`, `sel`) has:

| Token                     | Use                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| `var(--<id>)`             | Mid-tone — the saturated subject color. Use for accents, progress bar fills, dots, buttons. |
| `var(--<id>-light)`       | Light tint — surface fills.                                                                 |
| `var(--<id>-deep)`        | Deep — text on light, borders, deep accents.                                                |
| `var(--c-surface)`        | Light card surface (via cp-subj cascade).                                                   |
| `var(--c-surface-strong)` | Slightly more saturated card header tint.                                                   |
| `var(--c-border)`         | Hairline subject-tinted border.                                                             |
| `var(--c-progress-track)` | Progress bar track.                                                                         |
| `var(--c-progress-fill)`  | Progress bar fill.                                                                          |
| `var(--c-deep)`           | Deep accent (left border, title text).                                                      |

The cp-subj cascade is set by `lib/palette.tsx`; any element with
`className="cp-subj <subjectId>"` inherits the full set as `--c`,
`--cl`, `--cd`, etc.

### Semantic palette

Non-subject status colors are NOT subject colors. Use:

| Token                                  | Meaning                 |
| -------------------------------------- | ----------------------- |
| `var(--done)`                          | Completion, success     |
| `var(--fyi)` / `var(--fyi-bg)`         | Informational           |
| `var(--important)`                     | Modified, attention     |
| `var(--catchup)` / `var(--catchup-bg)` | Behind, needs catch-up  |
| `var(--ink-50…900)`                    | Neutral ink ramp        |
| `var(--paper)`                         | The card body surface   |
| `var(--tag-*)`                         | 10 tag colors for chips |

A blue ring on a Reading card means "this is math" — never use a
subject color for a non-subject signal. Selection states, focus rings,
and informational accents use `--fyi`, `--ink-900`, or a tag color.

### Themes — neutrals are theme-RELATIVE, not colors

The app ships six selectable themes (`data-theme` on `<html>`: `paper`
default, `cloud`, `night` dark mode, `mint`, `sky`, `blossom` — see
CLAUDE.md §4). Every neutral above is re-mapped per theme, which changes
what some tokens MEAN on a dark surface:

- **`--paper` and the `--ink-*` ramp are theme-relative.** On Night,
  `--paper` is a DARK surface and `--ink-900` is near-white. Never use
  `color: var(--paper)` to mean "white ink on a saturated solid" — that
  flips dark-on-dark under Night. Use **`var(--on-solid)`** (always
  white) for text/icons over `--brand-500/600`, status solids, subject
  solids, and other saturated theme-stable fills.
- **Tint/deep pairs adapt; mid-solids don't.** `--brand-50/100/700` and
  `--honey-50/100/600` re-mix on Night (tint surfaces darken, their text
  members lighten); `--brand-500/600` and `--honey-300..500` stay
  saturated. Pair text-on-tint with the ramp's TEXT member (`--brand-700`,
  `--honey-600`), never the solid members.
- **Subject tints flow through `--tint-base`.** Recipes that mix toward
  white must mix toward `var(--tint-base)` so dark themes re-tint them.
- **Chrome states use the `--chrome-accent-*` tier, never raw `--brand-*`.**
  Active/selected chrome (nav items, tabs, rail icons, filter chips) and
  chrome surfaces (`--rail-bg`, `--panel-bg`, `--panel-header-bg`) re-hue
  per theme; Paper's defaults resolve to the original indigo, so using the
  tier costs nothing and keeps every theme's chrome in its own accent.
- **Verify every new surface across all six themes** — `paper`, `cloud`,
  `night`, `mint`, `sky`, `blossom` — before calling it done, the same way
  the responsive contract requires three viewport tiers. Night (the dark
  mode) and at least one wash are the non-negotiable floor; an app-wide
  change covers all six. On each, confirm chrome re-hues through the
  `--chrome-accent-*` tier, no surface goes dark-on-dark or light-on-light,
  and text holds WCAG AA contrast. Settings → Appearance switches instantly;
  persisted per device. This is the §Themes half of the CLAUDE.md §4b
  Live QA Audit gate's cross-theme verification — both run before "done".

---

## 5. Typography

### Hierarchy on every card-style surface

| Role                               | Token         | Weight      | Color                                                                |
| ---------------------------------- | ------------- | ----------- | -------------------------------------------------------------------- |
| Metadata top line (Subject · time) | `var(--t-11)` | 400 (muted) | `var(--cd)` or `var(--ink-500)`                                      |
| Dominant title                     | `var(--t-16)` | 700         | `var(--cd)` on subject card, else `var(--ink-900)`                   |
| Subtitle (em-dash split)           | `var(--t-11)` | 400         | `var(--ink-500)`, opacity 0.75                                       |
| Body / preview                     | `var(--t-13)` | 400         | `var(--ink-700)`                                                     |
| Eyebrow / section label            | `var(--t-11)` | 800         | `var(--ink-400)` or `--ink-600`, uppercase, `letter-spacing: 0.12em` |

### Em-dash subtitle split

If a lesson title contains `—` (em-dash with spaces), split on it:
the part before is the dominant title, the part after becomes the
small subtitle below. Heading-cleanup pattern; apply on Weekly card,
ListRow, and any other surface that displays a lesson title.

### Page-level type

| Role                            | Token                     | Weight |
| ------------------------------- | ------------------------- | ------ |
| Page title (e.g. "Yearly View") | `var(--t-24)` or `--t-22` | 800    |
| Page subtitle                   | `var(--t-13)`             | 400    |
| Section header                  | `var(--t-15)`             | 700    |

---

## 6. Spacing rhythm

Use a strict 4px-base scale only:

**4 · 8 · 12 · 16 · 24 · 32** (px equivalents from spacing tokens).

Larger surface paddings (32, 40, 48) are OK at the page level, but
inside cards and list rows: stick to the scale. No 6, 10, 14, 18, 22
— these create the "almost-aligned" feeling that telegraphs
inconsistent design.

Common spacing applications:

- Card padding: 16 (desktop), 14 (tablet), 12 (phone)
- Title ↔ metadata gap: 4
- Title ↔ body gap: 8
- Body ↔ progress gap: 8
- Progress ↔ pacing gap: 12
- Group ↔ group gap: 24
- Page section ↔ section gap: 32

---

## 7. Canonical primitives — `components/ui/`

The 8–12 reusable building blocks every page imports from. **No new
page may re-create any of these inline.** Add a missing variant to the
primitive instead of inventing one locally.

### Existing primitives (already in the repo — use these)

| Primitive                                           | Location                            | What it does                                                                                                           |
| --------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `LessonCard`                                        | `components/lesson-card/`           | The weekly card. Subject-tinted body, title band, status, fork indicator.                                              |
| `ListRow`                                           | `components/list/ListRow.tsx`       | The shared list row. Subject monogram + time + title + chip + count + completion check; dashed left edge for modified. |
| `LaneCard`                                          | `components/year/LaneCard.tsx`      | The Year subject lane card. White body + tinted header + 4px subject-deep border + chip.                               |
| `StatusBadge`                                       | `components/year/StatusBadge.tsx`   | Status pill: completed / in_progress / modified / skipped / not_started / behind.                                      |
| `PaneSplitter`                                      | `components/daily/PaneSplitter.tsx` | Resizable separator. Vertical or horizontal.                                                                           |
| `ResourceComposer`, `AddLessonForm`, `AddEventForm` | `components/daily/`                 | Modal patterns. Focus-trap, Esc-close, ≥44px controls.                                                                 |

### To build (next wave) — `components/ui/`

| Primitive     | Variants                                              | Purpose                                                                                                                              |
| ------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `Button`      | primary / secondary / ghost / icon-only / destructive | Single source for every button. Tokens, ≥44px on phone/tablet.                                                                       |
| `Card`        | subject-tinted / neutral                              | The layered Weekly recipe, generic. Wraps any content with the same border / shadow / header treatment.                              |
| `PageHeader`  | with-actions / plain                                  | Page title + subtitle + right-aligned action buttons. Used on every route page.                                                      |
| `EmptyState`  | centered illustration + heading + CTA                 | Standard empty pattern for empty days, empty subject filters, empty search.                                                          |
| `Chip`        | static / removable / filterable                       | Inline tag chip (used by ListRow, ResourcesSort, StatusFilterBar).                                                                   |
| `Badge`       | success / info / warn / danger / neutral              | Status badge primitive (StatusBadge becomes a subject-aware specialization).                                                         |
| `ToggleGroup` | 2-button / 3-button segmented                         | The Personal/Master, By-Unit/By-Week, Grid/List, Roadmap/Progression pattern. **Toggle redesign is in flight — see §12 open items.** |
| `Tooltip`     | hover / focus                                         | Replaces ad-hoc `title=""` everywhere. Keyboard-reachable.                                                                           |

When you need a new primitive variant: add to the existing component
with a new prop. Do not duplicate.

---

## 7a. Buttons & pills

Every button in the app is the **`components/ui/Button`** primitive
(`Button.tsx` + `Button.module.css`). There is no other button. The
variants are `primary` · `honey` · `secondary` · `ghost` · `icon` ·
`destructive`; the sizes are `sm` / `md` / `lg`. **Never hand-roll a pill
CTA** — a `<button>` with its own background, border, and radius — outside
this primitive. If you need a new look, add a variant to `Button.module.css`,
do not invent one at the callsite.

### The DON'T (the bug this section codifies)

1. **No oversized colored glow as the resting shadow.** Do not set
   `box-shadow: var(--sh-brand)` / `var(--sh-honey)` (or any other
   color-glow token) on a button at rest. At rest a colored bloom reads as
   a blurry halo — a "glitch", not a crisp control. Those color-glow tokens
   are rationed to non-button accents (hero lockups, focus emphasis); a
   button's resting shadow is a tight neutral elevation, never a color
   wash.
2. **No bare single-class variant/size rule for fill, border, or padding.**
   A rule like `.primary { background … }` or `.md { padding … }` is
   specificity **(0,1,0)**. The Settings UI and several slide-out panels
   render inside `.cp-root`, whose base reset
   `.cp-root button { background: none; border: none; padding: 0 }` is
   **(0,1,1)** — so inside those contexts the reset WINS and silently
   strips the fill, border, and padding. The visible failure: floating
   label text with a leftover shadow halo at rest, and a zero-padding,
   cramped pill on hover (the fill returns, the padding doesn't).
   **Fix:** qualify every variant and size rule with the base class —
   `.btn.primary`, `.btn.md` → **(0,2,0)** — so it outranks the reset and
   the primitive renders identically in every context. (The double-class
   trick — `.foo.foo` — is the same fix where there is no base class to
   lean on; see CLAUDE.md "cp-root button reset trap" lesson.) Do not
   de-qualify these rules.
3. **No raw `--brand-*` for a button's hover/active color.** Raw brand
   ignores the active theme. Active/hover button color routes through the
   `--chrome-accent-*` tier (§4 "Chrome states"), so every theme re-hues
   its own buttons.

### The DO (the crisp, theme-recoloured design)

- **Crisp solid pill.** The resting shadow is a tight neutral elevation —
  `var(--sh-sm)` (filled variants) / `var(--sh-xs)` (secondary) — never a
  color glow. Pill radius `var(--r-pill)`; label weight 700.
- **Recolour per theme.** Filled `primary` uses `var(--chrome-accent)` at
  rest and `var(--chrome-accent-strong)` on hover; the token contract
  guarantees both clear **≥4.5:1** against `var(--on-solid)` (always-white
  ink) on all six themes. `secondary` hover routes its border through
  `var(--chrome-accent-mid)` and its text through `var(--chrome-accent-deep)`.
  The `honey` marketing CTA stays warm (`var(--grad-honey)` + `var(--on-honey)`)
  — deliberately NOT theme-recoloured — but uses the same neutral shadow
  scale. `destructive` stays semantic catch-up red, also NOT theme-recoloured.
- **Distinct rest vs hover.** Hover deepens the fill one shade, steps the
  shadow up to `var(--sh-md)`, and lifts with `transform: translateY(-1px)`;
  `:active` returns to `translateY(0)` with `var(--sh-xs)`. Both the
  transition and the lift are dropped under
  `@media (prefers-reduced-motion: reduce)`.
- **Generous pill padding** so the label never crowds the edge:
  `sm` ~14px / `md` ~20px / `lg` ~26px horizontal. On phone/tablet (≤900px),
  `sm` and `md` inflate to a ≥44px hit area via a transparent `::before`
  overlay (§8) — the visual stays compact, the touch target meets WCAG 2.5.5.
- **Tokens only, zero raw hex** — color, type, radius, and shadow all come
  from `var(--…)`.

### Before / after (so the anti-pattern is recognisable)

```
/* ✗ BEFORE — the bug: (0,1,0) loses to .cp-root's reset; colored glow blooms */
.primary {
  background: var(--brand-500);          /* raw brand — ignores theme */
  box-shadow: var(--sh-brand);           /* oversized colored halo at rest */
}
/* Inside .cp-root: background + padding stripped → floating text + halo;
   on hover the fill returns with zero padding → cramped pill. */

/* ✓ AFTER — crisp, theme-recoloured, survives the reset */
.btn.primary {                            /* (0,2,0) outranks the reset */
  background: var(--chrome-accent);       /* re-hues per theme */
  color: var(--on-solid);
  box-shadow: var(--sh-sm);               /* tight neutral elevation */
}
.btn.primary:hover:not(:disabled) {
  background: var(--chrome-accent-strong);
  box-shadow: var(--sh-md);
  transform: translateY(-1px);            /* deepen one shade + lift */
}
```

---

## 8. Responsive contract

Three viewport tiers. Every page works at every tier.

| Tier        | Width range   | Primary device                   |
| ----------- | ------------- | -------------------------------- |
| **Phone**   | 360 – 480px   | Phone portrait                   |
| **Tablet**  | 600 – 900px   | Tablet portrait, phone landscape |
| **Desktop** | 1024 – 1920px | Laptop, monitor                  |

### Hard rules at every tier

- **No document-level horizontal scroll.** Internal element scroll
  (a contained `overflow-x: auto`) is fine; the document body must
  not scroll sideways.
- **All primary controls reachable.** Hiding a primary control behind
  a responsive collapse without an alternative path is a critical bug.
- **Touch target sizes:**
  - Phone + tablet: **≥44 × 44px** hit area. Visual size can stay
    smaller if the padding-with-negative-margin trick inflates the
    target.
  - Desktop: ≥36 × 36px visual is acceptable when the same
    padding-trick inflates the hit area to ≥44 × 44.
- **Sticky chrome ≤30% of viewport height on phone** (so a 600px-tall
  phone gets at most ~180px of sticky header).

### Mobile defaults

- **Phone always renders in List mode** regardless of the user's
  saved `viewMode`. The user's Grid preference is preserved for
  desktop. Implemented in `WeeklyShell.tsx` via
  `window.matchMedia("(max-width: 900px)")`.
- **Right rail (Resources / To-do / Chat) hides entirely below
  1280px.** Codify the Wave-1 behavior. Rail content stays reachable
  on tablet/phone via the planned top-bar drawer.
- **Master/Personal toggle stays visible at every width.** Below
  480px, labels collapse to "P | M". Never hide the toggle.

### Top-bar collapse cascade (do not regress)

| Breakpoint | Behavior                                                       |
| ---------- | -------------------------------------------------------------- |
| ≤ 1280px   | "Soon" view tabs hidden                                        |
| ≤ 1024px   | Save indicator + view-mode pill hidden                         |
| ≤ 768px    | Week label + undo/redo hidden                                  |
| ≤ 540px    | View-tab + edit-toggle padding compressed                      |
| ≤ 480px    | Master/Personal labels become `P \| M`; bar padding tightens   |

### Verification

Before declaring work done, eyeball the surface at **~400px**,
**~768px**, and **~1280px** in DevTools device emulation. Phone is
the riskiest tier — do not skip it.

---

## 9. Interaction patterns

- **Hover-reveal:** secondary controls (drag handles, ⋯ menus, status
  pills, chevrons) are `opacity: 0` at rest. Reveal on `:hover` /
  `:focus-within` over a 120ms transition. Touch devices (`@media
(hover: none)`) show everything. Reduced motion skips the transition.
- **Modified lesson signal:** dashed left edge in `var(--c-deep)` is
  the always-on signal. The "MODIFIED" pill is hover-revealed on the
  Weekly card; absent on the ListRow (the dashed edge alone carries
  the signal in list mode).
- **Moved lesson signal:** inline move-arrow icon (↔ same-week,
  ⤴ across-weeks) near the title. Visible at rest.
- **Three-tier visual differentiation:**
  1. Unedited (from Master) — solid 4px subject-deep left stripe.
  2. Personally modified — dashed stripe + (on Weekly) MODIFIED pill
     hover-revealed.
  3. Personally moved — move-arrow icon + (on Weekly) the lesson's
     prior placement shown in the MODIFIED pill tooltip.
- **Reduced motion:** every transition has a `@media
(prefers-reduced-motion: reduce)` block that drops it. No bounce,
  parallax, confetti, or surprise motion.

---

## 10. New-page prompt template

Copy-paste this exactly. Edit only the bracketed slots.

```
Build a new page at `app/[route-segment]/page.tsx`.

Read `BUILD_STANDARD.md` and `CLAUDE.md` in the repo root before starting.
Use primitives from `components/ui/` and existing reusable components
under `components/`. Do not re-create a button, card, list row, header,
badge, chip, toggle group, or tooltip inline.

Match the visual style of `/weekly` exactly:
  - Subject color tinting via the `.cp-subj.<id>` cascade.
  - Card surface recipe — white body + soft tinted header + 4px
    subject-deep left border + rounded `var(--r-12)` + soft shadow.
  - Typography hierarchy — muted metadata on top, dominant
    `var(--t-16)` weight-700 title, em-dash subtitle if applicable,
    neutral body.
  - Hover-revealed secondary controls; dashed left edge for modified.

Tokens only — zero hex in components or lib. Spacing on the 4-8-12-16-24-32
scale only.

Responsive contract:
  - Phone (360–480px) must work as a single-column list. No
    document-level horizontal scroll.
  - Tablet (600–900px) — verify primary controls reach.
  - Desktop (1024–1920px) — full layout.
  - All touch targets ≥44 × 44 on phone / tablet.

Verify at 360px, 768px, and 1280px in DevTools device emulation.
Report the verification with one line per tier in the commit message:
  Verified: 360 OK / 768 OK / 1280 OK

Theme contract:
  - Verify across all six themes (paper, cloud, night, mint, sky, blossom)
    via Settings → Appearance. Chrome must re-hue through --chrome-accent-*;
    no dark-on-dark / light-on-light; text holds WCAG AA — especially Night.

The page is: [one sentence describing what the page does and who uses it]
The data source is: [path to mock data or store]
The reference for layout is: [existing page or design handoff if any]
```

---

## 11. PR / commit responsive verification line

Every commit that touches a primary surface (any `app/**/page.tsx` or
`components/**`) must end with a one-line responsive verification:

```
Verified: 360 OK / 768 OK / 1280 OK
```

If a tier has a known issue or is intentionally not verified yet,
state it:

```
Verified: 360 NEEDS WORK (week-strip overflow at 360–400px), 768 OK, 1280 OK
```

The honesty here matters more than the boast. A `NEEDS WORK` note that
becomes the next task is better than a `OK` that was never checked.

---

## 12. Known open items

### Toggle button redesign (queued as a follow-up wave)

The current segmented toggle treatment (Personal/Master, By-Unit/By-Week,
Grid/List, Roadmap/Progression, the Year sub-nav toggles) is flagged for
a unified redesign. The new `ToggleGroup` primitive in §7 should ship
with the redesigned visual, then every existing toggle migrates to it.

Until that wave lands: do not invent new toggle styles. Use the existing
inline pattern in `top-bar.tsx` so the redesign migration is mechanical.

### Master-snapshot diff data

`Restore from Master` and `Compare to Master` actions in the lesson
context menu currently render a "Master snapshot not available yet"
stub. Real diffs land once the backend supplies a master snapshot per
lesson. Don't build the snapshot UI ahead of the data — the stub is
documented in `components/lesson-card/compare-to-master.tsx`.

### Add-lesson / add-event persistence

The `AddLessonForm` and `AddEventForm` modals are fully wired UI-side
but persistence is stubbed pending the backend (no `addLesson` or
`addBlock` planner-store action yet). The wire-up is commented in code
and will be a one-wave task when the store gains the actions.

---

## 13. Doc maintenance

Update this file when:

- A new primitive lands in `components/ui/`.
- A token is added to `app/tokens.css`.
- A responsive breakpoint or behavior is intentionally changed.
- A new interaction pattern is established across more than one
  surface.

The doc and the code should always agree. If they disagree, the code is
the truth; update the doc immediately.
