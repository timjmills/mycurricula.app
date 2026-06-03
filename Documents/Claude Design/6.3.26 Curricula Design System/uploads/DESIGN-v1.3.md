# Curricula Design System

Version 1.3

A design language that merges two references:

1. A **curriculum planning dashboard**: dense, structured, navigated by color, with a timeline of subjects, units, weeks and days.
2. A **creative studio landing page**: soft gradients, rounded forms, generous whitespace, a honey-yellow call to action.

It keeps the dashboard's clarity while borrowing the landing page's warmth.

## What changed in 1.3

- **Brighter chip accents.** Cascade and planner chips now use a brighter accent (a more saturated version of each subject) for outlines, icon tiles and dots, while the chip fill stays the soft tint. The 15-slot scale gains a `-bright` variant per subject for this.
- **Outline and shadow on every chip.** Following the reference, every chip (unit, week and lesson) carries a colored outline and a soft drop shadow. The active unit and week take a heavier 2px outline.
- **Icon tiles.** Unit chips lead with a solid bright icon tile, week chips with a soft neutral tile, and lessons with a bright dot, matching the reference layout.
- **Dark text kept.** Titles and subtitles stay dark ink for legibility, as in 1.2.
- **Brand and subjects unchanged from 1.2.** Indigo brand, the muted 15-subject scale and the White Rose grade bands all carry over.

For the earlier history: 1.2 returned the brand to the v1 blue and switched chips to dark text with a dark active outline; 1.1 expanded subjects from 4 to 15 and introduced the muted color style and the cascade; 1.0 was the original 4-subject indigo system.

## Design principles

1. **Two voices, one palette.** Indigo is the functional primary (actions, links, focus). Honey is the warm accent (marketing, highlights, celebration). They never compete.
2. **Color is navigation, and it cascades.** A subject's hue flows down to its units, weeks and lessons. Status (done, in progress, idle) stays a separate, semantic layer so it reads the same on every subject.
3. **Muted and harmonious.** Subject colors sit at moderate saturation and a shared lightness, in the White Rose register, so 15 of them coexist without clashing.
4. **Warm neutrals.** White surfaces sit on a cream canvas, so the dense planner still feels soft.
5. **Gradients are atmosphere.** Hero areas, empty states, onboarding and CTAs, not every surface.

## Color

### Brand, Indigo (functional primary)

Buttons, links, focus rings, active navigation and the "in progress" status. White text on the brand button meets AA (about 4.5 on 500, higher on the 600 hover).

| Step | Hex |
|------|-----|
| 50 | `#EEF3FF` |
| 100 | `#DCE6FF` |
| 200 | `#BACCFF` |
| 300 | `#8FA8FF` |
| 400 | `#6383FB` |
| **500 (default)** | **`#3B6CF6`** |
| 600 (button hover) | `#2E55DB` |
| 700 | `#2543B0` |

### Accent, Honey (warmth and CTA)

Marketing hero CTA, highlighted headings, celebratory moments, "needs review" warnings. Honey buttons use dark text (`#3A2A05`) because the yellow is too light for white text.

| Step | Hex |
|------|-----|
| 50 | `#FFF8E7` |
| 100 | `#FFEFC2` |
| 200 | `#FCE095` |
| 300 | `#F8CC5C` |
| **400 (default)** | **`#F4B740`** |
| 500 | `#E9A526` |
| 600 | `#C9871A` |

### Subject scale (15 slots)

The planner's core. Each slot has a **solid** (headers, icons, accents), a **tint** (backgrounds, lanes, chips) and an **ink** (text on tint). Every subject's ink clears AA both on its tint and on white. Assign any subject to any slot; the named labels are defaults.

| Slot | Suggested subject | Solid | Tint | Ink |
|------|-------------------|-------|------|-----|
| subj-1 | Math | `#DCC674` | `#F4EFDF` | `#7A671F` |
| subj-2 | Writing | `#DCA574` | `#F4E9DF` | `#7A491F` |
| subj-3 | Phonics | `#DC8274` | `#F4E2DF` | `#7A2B1F` |
| subj-4 | Spelling | `#CF778D` | `#F2E1E5` | `#7A1F36` |
| subj-5 | Art | `#CF77AF` | `#F2E1EC` | `#7A1F59` |
| subj-6 | Music | `#C77AC7` | `#F0E2F0` | `#752475` |
| subj-7 | Social Studies | `#AB7AC7` | `#EBE2F0` | `#572475` |
| subj-8 | World Language | `#917AC7` | `#E6E2F0` | `#3C2475` |
| subj-9 | SEL | `#7A7FC7` | `#E2E3F0` | `#242975` |
| subj-10 | Reading | `#7A9EC7` | `#E2E9F0` | `#244A75` |
| subj-11 | Technology | `#7AB8C7` | `#E2EEF0` | `#246575` |
| subj-12 | Health | `#7AC7B8` | `#E2F0EE` | `#247565` |
| subj-13 | Science | `#7AC79B` | `#E2F0E8` | `#247547` |
| subj-14 | PE | `#7AC77A` | `#E2F0E2` | `#257425` |
| subj-15 | Library | `#9AC77A` | `#E8F0E2` | `#467524` |

Four convenience aliases map onto the scale and can be repointed in one line:

```
--math    -> subj-1     --reading -> subj-10
--science -> subj-13    --social  -> subj-7
```

Each slot also has a **`-bright`** variant (a more saturated version of the solid). It is used only for chip outlines, icon tiles and dots in the cascade and planner; the muted solids still drive palette cards and tint fills.

### Grade bands (White Rose years)

A separate fixed set, kept exactly as in your reference. Used for grade-level tagging, not subjects.

| Grade | WR year | Solid | Tint |
|-------|---------|-------|------|
| Kindergarten | Year 1 | `#F6C96A` | `#FFF1C9` |
| Grade 1 | Year 2 | `#E86A5C` | `#FADBD5` |
| Grade 2 | Year 3 | `#9AB88B` | `#DDE8D3` |
| Grade 3 | Year 4 | `#7A9AC2` | `#D5E1EF` |
| Grade 4 | Year 5 | `#C291B8` | `#ECD7E7` |
| Grade 5 | Year 6 | `#8B7FC0` | `#DCD7EE` |

### Status (semantic, kept distinct from subjects)

Status colors are deliberately more saturated than subject colors so a marker always reads as progress, never as a subject.

| State | Color | Tint |
|-------|-------|------|
| Completed | `#16A06B` | `#E4F6EE` |
| In Progress | `#3B6CF6` (brand) | `#EEF3FF` |
| Not Started | `#B6B5C6` | `#F1F0F4` |
| Needs Review | `#E9A526` | `#FFF8E7` |
| Danger | `#EF5A5A` | `#FDECEC` |

### Neutrals and surfaces

| Token | Hex | Use |
|-------|-----|-----|
| Canvas | `#FCFAF6` | App background (warm cream) |
| Surface | `#FFFFFF` | Cards, panels |
| Surface warm | `#FFFDF8` | Inputs, secondary panels |
| Ink | `#1C1B2E` | Headings |
| Ink soft | `#3A3950` | Strong UI text |
| Body | `#57566B` | Body copy |
| Muted | `#908FA3` | Secondary text, metadata |
| Faint | `#BFBED0` | Placeholders, disabled |
| Border | `#ECEAE3` | Card and input borders |
| Border cool | `#E8EAF2` | Borders next to brand color |
| Hairline | `#F4F2EC` | Internal dividers |

## The color cascade

This is the system's signature pattern. A planning column (unit, then its weeks, then its lessons) is colored by exposing one trio of CSS variables on the container:

```css
.column { --c: var(--subj-1-bright); --ct: var(--subj-1-tint); --ck: var(--subj-1-ink); }
```

Every chip inside reads `--c` (the bright accent, used for the outline, icon tile and dots) and `--ct` (the tint fill). Chip text is dark ink, not the subject color, for legibility. Swapping the subject is a one-line change that re-themes the entire column. The rules:

- **Unit chip:** soft tint fill, a 1.5px outline in the bright accent, a soft shadow, and a leading solid icon tile (bright, with a white glyph). Dark-ink title and subtitle. The active unit uses a 2px outline and a slightly larger shadow.
- **Week chip:** same, smaller, with a leading soft neutral icon tile (bright glyph). The active week uses the 2px outline.
- **Lesson chip:** soft tint fill, bright outline and shadow, a leading bright dot, dark-ink label.
- **Status overlays on top:** the colored chip shows the subject; a separate ring or badge (green, brand, grey) shows progress. They do not share color.

## Gradients

| Name | Definition | Use |
|------|-----------|-----|
| Hero mesh | `linear-gradient(118deg,#FFE7C2,#FDEAD9,#F4E7FF,#DCF5EC)` | Hero, onboarding, empty states |
| Honey CTA | `linear-gradient(135deg,#F8CC5C,#F4B740)` | Primary marketing button |
| Brand soft | `linear-gradient(135deg,#EEF3FF,#F4E7FF)` | Feature tiles, soft fills |
| Dawn | `linear-gradient(135deg,#FFD8A8,#FFB3C7,#C9B6FF)` | Avatars without a photo |
| Mint | `linear-gradient(135deg,#BFF0DC,#A8E3FF)` | Decorative accents |

A page-level atmospheric mesh (low-opacity honey, purple and green radial glows) sits behind the whole canvas for depth.

## Typography

- **Display and headings: Bricolage Grotesque**, weights 700 and 800. Warm, slightly editorial.
- **UI, body and data: Plus Jakarta Sans**, weights 400 to 700. Clean and professional.

| Role | Family | Weight | Size / line |
|------|--------|--------|-------------|
| Display | Bricolage | 800 | 44 / 1.0 |
| H1 | Bricolage | 800 | 28 / 1.1 |
| H2 | Bricolage | 700 | 22 / 1.2 |
| H3 | Plus Jakarta | 700 | 18 / 1.3 |
| Body L | Plus Jakarta | 400 | 16 / 1.6 |
| Body | Plus Jakarta | 400 | 14 / 1.5 |
| Small | Plus Jakarta | 500 | 13 / 1.4 |
| Label | Plus Jakarta | 700 | 11 / +0.09em, uppercase |

Headings use tight tracking (about `-0.02em` to `-0.03em`). Labels use positive tracking and uppercase.

## Space and radius

**Spacing** runs on a 4px base scale: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`. Common rhythm: 16px inside small components, 24px inside cards, 48px to 64px between sections.

**Radius** is generous to carry the soft feel:

| Token | Value | Use |
|-------|-------|-----|
| `--r-sm` | 10px | Small and week chips |
| `--r-md` | 14px | Inputs, unit chips |
| `--r-lg` | 18px | Cards, palette cards |
| `--r-xl` | 24px | Panels, previews |
| `--r-2xl` | 32px | Cover, hero |
| `--r-pill` | 999px | Buttons, badges, search |

## Elevation

Soft, low-contrast shadows cast cool over the warm canvas.

| Token | Definition |
|-------|-----------|
| `--sh-xs` | `0 1px 2px rgba(28,27,46,.05)` |
| `--sh-sm` | `0 2px 6px rgba(28,27,46,.06)` |
| `--sh-md` | `0 10px 24px -10px rgba(28,27,46,.14)` |
| `--sh-lg` | `0 22px 48px -16px rgba(28,27,46,.20)` |
| `--sh-brand` | `0 12px 26px -10px rgba(59,108,246,.45)` |
| `--sh-honey` | `0 12px 26px -10px rgba(233,165,38,.55)` |

Color glows are reserved for primary buttons. Cascade and planner chips use a soft neutral drop shadow plus a bright colored outline; the active unit and week deepen both.

## Components

### Buttons
Pill-shaped at every size. **Primary** is solid indigo with a brand glow (hover deepens to 600). **Honey** is the gradient marketing CTA with dark text. **Secondary** is a white pill with a warm border. **Ghost** is text only. Sizes: small (13px), default (14px), large (15px).

### Inputs
Sit on the warm surface, brighten to white on focus, with a 4px brand-50 focus ring. Search is pill-shaped with a leading icon.

### Status and badges
**Badges** (pill with a leading dot) for lists and tables. **Rings** for the timeline: filled green ring with a check (completed), brand ring with a center fill (in progress), hollow grey ring (not started).

### Tabs and avatar
A **segmented control** (pill track, white active tab) switches Timeline and Table. **Avatars** use the dawn gradient with white initials when no photo is set.

### Cards and chips
**Subject cards**: icon tile in the subject tint, title, progress line, subject-colored bar; lift on hover. **Palette cards** (the White Rose layout): a solid header band with a large badge and a small tint swatch top-right, then the name, the token name and the hex pair. **Unit, week and lesson chips**: color-driven via the cascade trio described above; each has a bright outline, a soft shadow, dark text, and a leading icon tile (unit, week) or dot (lesson).

### Metrics
A tinted icon tile, a display-weight number and a quiet label. For overview footers and headers.

## Patterns

- **Planner shell.** Sidebar plus segmented header plus color-coded subject lanes. Each lane sets its subject trio so its chips inherit the color; the current unit is outlined.
- **Marketing hero.** The hero mesh, display type, honey CTA and a floating product card.

## Implementation notes

- All tokens are CSS custom properties on `:root` in `design-system.html`. Copy that block to inherit the full system.
- The cascade needs only `--c` (set to a subject `-bright` value) and `--ct` per container; `--ck` remains available for any colored-text use. The chip classes (`.uchip`, `.wchip`, `.lchip`) carry sensible fallbacks and use dark ink for text.
- Fonts load from Google Fonts (Bricolage Grotesque, Plus Jakarta Sans). Self-host for production.
- Contrast: every subject ink clears AA on its tint and on white. Cascade chip text uses ink (`#1C1B2E`) or ink-soft (`#3A3950`) for strong legibility; the bright accent drives outlines, dots and icon glyphs (the glyphs are decorative, with meaning carried by the dark text). White text on the brand button meets AA (about 4.5 on 500, higher on 600). Honey uses dark text.
- The system is theme-ready: a dark theme would only need a second token block.

## Naming quick reference

```
Brand     --brand-50 ... --brand-700        (default 500 = #3B6CF6)
Honey      --honey-50 ... --honey-600        (default 400 = #F4B740)
Subjects   --subj-1 ... --subj-15            (+ -tint, -ink, -bright)
Aliases    --math --reading --science --social   (map onto the scale)
Grades     --gK --g1 --g2 --g3 --g4 --g5     (+ -tint)
Status     --done --progress --idle --warn --danger   (+ -tint)
Cascade    --c (bright accent: outline/tile/dot)  --ct (tint fill)   set per container; chip text is --ink
Neutral    --canvas --surface --surface-warm --ink --ink-soft --body --muted --faint --border --border-cool --hairline
Gradient   --grad-hero --grad-honey --grad-brand --grad-dawn --grad-mint
Radius     --r-sm --r-md --r-lg --r-xl --r-2xl --r-pill
Shadow     --sh-xs --sh-sm --sh-md --sh-lg --sh-brand --sh-honey
Space      --s1 ... --s16   (4px base)
Type       --font-display (Bricolage)   --font-sans (Plus Jakarta)
```
