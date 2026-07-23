# mycurricula.app — Design System Brief
> Feed this to a new Claude Co-work session to onboard it to the visual language, component system, and codebase conventions for mycurricula.app.

---

## 1. What This Product Is

**mycurricula.app** is a Learning Management System (LMS) for school teaching teams. It consolidates five fragmented planning tools — resource boards, week-by-week lesson docs, standards docs, and per-teacher personal copies — into one filterable, editable curriculum operating system.

**Core mental model: Git-style forking applied to curriculum.**
- One **Master** (team) plan. Each teacher gets a **Personal** copy, auto-forked on first edit.
- A top-bar toggle (Personal | Team Curriculum) switches modes. Editing Master is gated by a persistent red banner.
- **Users:** teachers only. No student/parent/admin surfaces.

**Primary question the app answers:** "What are we teaching this week, and where am I in the plan?"

---

## 2. Design North Star

**Three words govern every decision: Calm · Light · Alive.**

- **Calm** — generous whitespace, one clear action per surface, nothing competing for attention.
- **Light** — warm cream canvas, soft daylight, frosted glass. Content floats over a living background.
- **Alive** — a slow-drifting background photo or ambient mesh. Movement is ambient, never demanding.

**Aesthetic feel:** Morning light through a window. Apple-product restraint. Premium via what's left out.

**Hard rules:**
- Color carries meaning, never decoration. Subjects own fixed colors. Status owns fixed colors. Neutral is the default.
- Motion clarifies — never decorates. ~200–350ms transitions. No bounce, parallax, or confetti. Always respect `prefers-reduced-motion`.
- One surface, one job. Toggles change content, never the surface's purpose.
- No hard-coded hex colors or px font sizes in components — always `var(--token)`.

---

## 3. Token System

All tokens live in `home/colors_and_type.css` (imported via `styles.css`). **Never hard-code values.**

### 3a. Brand Colors

| Token | Value | Use |
|---|---|---|
| `--brand-500` | `#3B6CF6` | Primary actions, links, focus, "in progress" |
| `--brand-600` | `#2E55DB` | Hover/pressed states |
| `--honey-500` | `#E9A526` | Warm accent: CTAs, highlights, "needs review" |
| `--accent` | per theme | Theme-driven primary (auto-animates on photo+normal) |

### 3b. Subject Color System (15 slots, White Rose register)

Each subject gets three tokens:
- `--subj-N` — solid header/icon/accent
- `--subj-N-tint` — fill/lane background
- `--subj-N-ink` — text on tint

**Subject → slot mapping (locked team-wide):**
```
math      → subj-1  (gold)
reading   → subj-10 (blue)
writing   → subj-3  (coral)      [set via app data layer]
grammar   → subj-4  (rose)
spelling  → subj-2  (apricot)
ufli      → subj-6  (magenta)
explorers → subj-12 (teal)
sel       → subj-5  (pink)
```
Also available: `--math`, `--reading`, `--science`, `--social` as semantic aliases.

**Bright chips** (outlines/dots only, never fills): `--subj-N-bright`

**Grade bands:** `--gK` through `--g5` (gold → slate → green → blue → mauve → periwinkle) + `-tint` variants.

### 3c. Status Colors

| Token | Use |
|---|---|
| `--done` / `--done-tint` | Completed lessons |
| `--progress` / `--progress-tint` | In progress |
| `--warn` / `--warn-tint` | Needs review |
| `--danger` / `--danger-tint` | Errors, destructive states |
| `--idle` / `--idle-tint` | Not started |

### 3d. Neutrals (warm cream)

```css
--canvas:   #FCFAF6   /* page background */
--surface:  #FFFFFF   /* card/panel background */
--ink:      #1C1B2E   /* primary text */
--ink-soft: #3A3950   /* secondary headings */
--body:     #57566B   /* body text */
--muted:    #908FA3   /* placeholder, hints */
--border:   #ECEAE3   /* dividers */
--hairline: #F4F2EC   /* very subtle rule */
```

### 3e. Spacing (4px base scale)

`--s1:4px` · `--s2:8px` · `--s3:12px` · `--s4:16px` · `--s5:20px` · `--s6:24px` · `--s8:32px` · `--s10:40px` · `--s12:48px` · `--s16:64px`

### 3f. Radius

`--r-xs:6px` · `--r-sm:10px` · `--r-md:14px` · `--r-lg:18px` · `--r-xl:24px` · `--r-2xl:32px` · `--r-pill:999px`

### 3g. Elevation

```css
--sh-xs  /* 0 1px 2px — hairline lift */
--sh-sm  /* 0 2px 6px — subtle card */
--sh-md  /* 0 10px 24px — floating panel */
--sh-lg  /* 0 22px 48px — modal */
--sh-brand /* indigo glow */
--sh-honey /* amber glow */
```

---

## 4. Typography

**Three fonts (Google Fonts):**
- `--font-display`: **Poppins** — large headings, H1, display moments
- `--font-display-sm`: **DM Sans** — smaller headings, logo wordmark
- `--font-sans`: **Plus Jakarta Sans** — all UI text, body, data, labels

**Type role tokens** (use these on elements; don't invent new sizes):

| Class | Family | Weight | Size | Use |
|---|---|---|---|---|
| `.ds-display` | Poppins | 700 | 44px | Hero titles |
| `.ds-h1` | Poppins | 700 | 28px | Page titles |
| `.ds-h2` | DM Sans | 700 | 22px | Section headings |
| `.ds-h3` | DM Sans | 700 | 18px | Card headings |
| `.ds-body-l` | Plus Jakarta | 400 | 16px | Lead body |
| `.ds-body` | Plus Jakarta | 400 | 14px | Standard body |
| `.ds-small` | Plus Jakarta | 500 | 13px | Supporting text |
| `.ds-label` | Plus Jakarta | 700 | 11px | Uppercase labels |

---

## 5. Theme System

Two independent axes set as `data-*` on `<html>` (managed by `lib/theme.tsx`):

- **`data-style`** ∈ `quiet | calm | vivid` — card treatment. **Default: vivid**
- **`data-palette`** ∈ `normal | highlight` — subject-color saturation. **Default: highlight**

**Six themes** (set as `data-theme` on `.home`):

| Theme | Accent | Mood |
|---|---|---|
| `normal` | `#3B6CF6` (animates on photo) | Neutral brand blue |
| `night` | `#8FA8FF` | Dark slate-navy wash |
| `honey` | `#E59A12` | Warm amber |
| `blossom` | `#E8629C` | Rose pink |
| `mint` | `#1FA06B` | Fresh green |
| `sky` | `#2E86D8` | Clear blue |

**Background modes:**
- `data-bg="ambient"` — brand-mesh wash (radial gradients, per-theme palette)
- `data-bg="photo"` — rotating teaching photos with duotone color-grade

**Tone:** `data-tone="light"` (all non-night themes) | `data-tone="dark"` (night). Every surface reads tone for text color decisions.

**Theme tint:** `.theme-tint` (z-index 90, pointer-events none, soft-light blend) washes over the whole app for Honey/Blossom/Mint/Sky. Normal = no tint. Overlays/modals sit above z-index 90 and must self-apply a `radial-gradient(… var(--accent) 14% …)` wash to stay themed.

---

## 6. Material System — Glass

The primary UI material is **frosted glass**. Key patterns:

```css
/* Standard glass panel */
background: rgba(255,255,255,.72);
-webkit-backdrop-filter: blur(24px) saturate(1.2);
backdrop-filter: blur(24px) saturate(1.2);
border: 1px solid rgba(255,255,255,.85);
box-shadow: var(--sh-md);
border-radius: var(--r-xl);
```

In Night mode: `rgba(28,30,44,.92)` with white borders at 14% opacity.  
In photo mode: deeper shadow, white inner highlight.

**Surface hierarchy:**
1. Background (photo/mesh) — always alive, always behind
2. `.frame` — full-bleed container with veil/scrim layers
3. `.glass` panels — frosted, floating content containers
4. Overlays (modals, drawers) — above `.theme-tint`; self-themed

---

## 7. Component Patterns

All components are bespoke — no UI kit. Components live in `home/*.jsx` + `home/*.css`.

### Buttons
- **Primary**: `background: var(--accent)`, `border-radius: var(--r-pill)`, pill shape, `box-shadow: var(--sh-brand)`. Text: white.
- **Honey CTA**: `background: var(--honey-500)`, `box-shadow: var(--sh-honey)`.
- **Secondary**: bordered ghost pill, `color: var(--ink)`.
- **Ghost**: transparent, border on hover only.
- Min touch target: 44px on phone/tablet.

### Subject Dots / Chips
- Dot: 10–12px circle, `background: var(--subj-N)` (or `--subj-N-bright` for outline chip)
- Chip: `background: var(--subj-N-tint)`, `color: var(--subj-N-ink)`, `border-radius: var(--r-pill)`, 11px label weight 700 uppercase

### Lesson Cards (three-tier forking visual)
- **Unedited from Master** → solid 4px left stripe in subject color
- **Personally modified** → dashed stripe + "Modified" pill
- **Personally moved** → solid stripe + move-arrow icon (↔ / ⤴)
- **Both** → compose all three

### Segmented Controls
- Pill container: `background: var(--hairline)`, `border: 1px solid var(--border)`, `border-radius: var(--r-pill)`
- Active pill: white background, shadow, `color: var(--ink)`

### Navigation
- Top bar: brand logo (left), Personal|Team toggle + tools (right), glass pill
- Nav tabs: Day · Week · Year · Plan · Post · Teach — pill row below topbar
- Back arrow: always visible on non-home views (falls back to Home if no history)
- View title: big display heading top-left (`Poppins 700`) in accent color

---

## 8. Views & Their Jobs

| View | Route | Question Answered |
|---|---|---|
| Home | `/` | Today at a glance, quick launch |
| Day | `/day` | What am I teaching right now? |
| Week | `/week` | What's the shape of this week? |
| Year | `/year` | Where am I in the curriculum plan? |
| Plan | `/plan` | What's in this specific lesson? |
| Post (Resource Wall) | `/post` | What resources are attached to this lesson? |
| Teach | `/teach` | Project this lesson to the class |

**Resource Wall specifics:**
- Padlet-style sectioned wall, per-subject sections
- View modes: Mosaic (default) · Single · Grid · List
- Fullscreen mode (`.rw-fs`) via toolbar expand button — toggles to compress icon when active
- Back navigation: app nav tabs remain visible in normal mode; fullscreen uses compress icon to exit
- Section `>` stray characters are a known-fixed bug (removed June 2026)

---

## 9. Code Architecture

```
home/                   ← All frontend source
  app.jsx               ← Root app shell, view routing, theme state
  views-a/b/c.jsx       ← Day/Week/Year view frames
  resource-wall.jsx     ← Post / Resource Wall view
  planning.jsx          ← Lesson Plan view
  teach.jsx             ← Teach Board view
  colors_and_type.css   ← ALL design tokens (source of truth)
  themes.css            ← Theme + photo-mode overrides
  views.css             ← View-level layout
  home.css              ← App shell chrome
  [view].css            ← Per-component styles

lib/mock/               ← All data fixtures (Phase 1A — no backend yet)
```

**Key rules:**
- **Tailwind: layout + spacing utilities only.** No theme colors in `tailwind.config.ts`.
- All tokens in `tokens.css` (app). Reference with `var(--token)`.
- Subject colors via `useSubjectColor(subjectId)` hook or `.cp-subj.<subject>` classes. Never invent colors.
- School week is configurable (default: Sun–Thu). Never hard-code weekdays.

---

## 10. Current Build State (June 2026)

**Phase 1A is shipped** to `mycurricula.app` (Cloudflare). All primary views render against `lib/mock/` fixtures.

| Feature | Status |
|---|---|
| Weekly / Daily / Yearly views | ✅ Shipped |
| Resource Wall (Post) | ✅ Shipped |
| Lesson Plan (Plan) | ✅ Shipped |
| Teach Board | ✅ Shipped |
| Schedule, Catch-up, Settings | ✅ Shipped |
| Master/Personal forking (visual) | ✅ Shipped |
| Supabase backend | ⏳ Phase 1B |
| Multi-school config | ⏳ Phase 1B |

**Do NOT build:** gradebook, attendance, student/parent portals, AI features, LMS integrations, or anything outside Phase 1A/1B scope.

---

## 11. Quick Reference — What to Ask For

When starting a new feature or screen in a new chat:
1. **Read `home/colors_and_type.css`** for all token values
2. **Read `home/themes.css`** for theme/photo-mode overrides
3. **Read `home/views.css` + relevant `[view].css`** for layout patterns to match
4. **Match the surrounding component vocabulary** — density, hover states, shadow levels, type sizes, button styles
5. **Never hard-code** — every color, size, and radius should reference a `var(--token)`
6. **Check the forking model** — does your feature touch lesson editing? Respect Personal/Master rules.
7. **Verify responsive** at 400px, 768px, 1280px before declaring done
