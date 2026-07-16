# First-paint frame flash — SSR cookie-mirror design

> **Status: REVIEWED — SOUND-WITH-CHANGES folded in (2026-07-09).** The W3
> backlog's "dedicated boot-attributes pass." Author: Redesign-1 session.
> Grounded in a two-agent investigation (persistence/boot/SSR contract +
> component-flash inventory) on `claude/v2-wave3-chrome` at `22ce5a9`, then
> adversarially design-reviewed (independent §4a persona, claims verified
> against source). All 3 must-change findings are incorporated below (§3b
> renewal, §3e cache invariant, §3a codec pairing); Lows folded into §4/§6.

## 1. The problem

The no-FOUC boot script (`lib/theme-init.tsx`) fully solves the **attribute**
flash: `<html data-*>` carries the teacher's persisted axes before first paint,
so every CSS-keyed surface renders correctly from frame one.

What still flashes is the **React component tree**. `ThemeProvider` state
initializes from compile-time defaults (`glass`/`dark`/`photo`/`clear`/`normal`)
regardless of what the attributes say, because its `useState` initializers never
read localStorage (the SSR-consistency contract). Every component that branches
on `useTheme()` state therefore renders the DEFAULT branch on the server AND on
the first client render, then swaps after the post-mount seeding effect:

- `WeeklyShell` (`frame === "paper" ? <WeekColumns/> : <WeeklyGrid/>`) — a Paper
  teacher sees the glass subject-grid, then the day-column layout snaps in.
- The W3.7/W3.8 surfaces compound it: Year Frame-C constellation, the Day EDIT
  split, the Week EDIT board — every frame-branched canvas added from here on
  flashes wrong-frame for its non-default teachers.
- In prod the swap is sub-second; in dev it's 5–9s (which twice fooled live
  audits this cycle — see `dev-hydration-audit-trap` memory).

## 2. The fix in one sentence

Mirror the five persisted axes into a compact, **validated** cookie so the
server layout can (a) render the true `<html data-*>` attributes and (b) pass
true `initial*` props to `ThemeProvider` — making the server HTML, the boot
paint, and the first client render all agree on the teacher's real axes.

localStorage remains the client source of truth; the cookie is a best-effort
SSR hint that self-heals (boot script overwrites attrs from localStorage
unconditionally; the provider's seeding effect reconciles state).

## 3. Design

### 3a. New leaf module — `lib/theme-values.ts` (no "use client", zero imports)

Extract from `lib/theme.tsx`: the five value arrays (`FRAME_VALUES`,
`GLASS_VALUES`, `BG_VALUES`, `APP_THEMES`, `DIM_VALUES`), their guards
(`isThemeFrame` … `isThemeSetting`), the `DEFAULT_*` consts, the pure
`deriveTone(theme, glass, bg, dim, autoTone)`, and the cookie codec (below).
`lib/theme.tsx` re-exports them (no call-site churn). Rationale: the server
layout must validate cookie input against the frozen allowlists WITHOUT
dragging theme.tsx's transitive `theme-sync → supabase/client` +
`photo-luminance` graph into the server bundle. This module becomes the
canonical origin of the ALLOWLIST LOCKSTEP (theme.tsx, theme-init.tsx inline
copies, the SQL CHECKs, layout.tsx SSR attrs, and the probe all mirror it —
update the lockstep comments to name it).

**Codec pairing (review must-change #3):** the cookie ENCODE and DECODE live
ONLY in `theme-values.ts` as a matched pair (`encodeThemeAxesCookie` /
`decodeThemeAxesCookie`); neither call site may hand-inline the join/split.
The dot-field ORDER is itself a lockstep — note the trap explicitly:
`"normal"` is a legal value in BOTH the `dim` and `palette` slots, so an
encode/decode order drift validates into the WRONG axis silently. A
round-trip unit test (`decode(encode(axes)) === axes`, plus a fixture
asserting the literal field order) ships with the module.

### 3b. Cookie

- **Name** `mc-theme-axes`. **Value**
  `v1.<frame>.<glass>.<bg>.<theme>.<dim>.<style>.<palette>` (dot-packed,
  values are lowercase alpha only — no encoding needed; leading version tag so
  the format can evolve). The two trailing fields are the deprecated v1-compat
  axes — still carried because they drive live inline-style surfaces (§5);
  drop them (bump to `v2.`) when the v1 surfaces retire.
- **Attributes**: `Path=/; Max-Age=31536000; SameSite=Lax` (+ `Secure` when
  `location.protocol === "https:"`). NOT HttpOnly — the client writes it. It
  carries zero secrets (pure presentation prefs).
- **Written** in the provider's mirror/persist effect (`lib/theme.tsx` ~871,
  immediately after the `writeKey` block) — synchronous, un-debounced,
  alongside localStorage. Placement inherits the effect's first-run skip (no
  cookie until a real state change), and all three writer paths (load-effect
  seeding, cross-tab storage events, remote-sync apply) converge through this
  effect, so the cookie can never miss a change. Stores the theme **setting**
  (may be `"system"`), same as localStorage.
- **Renewal (review must-change #2)**: change-gated writes alone would let the
  cookie lapse at Max-Age for a teacher who set their look once and never
  touched it again (the steady-state load's `setX(same)` no-ops, so the mirror
  effect never re-runs). So in ADDITION to the mirror-effect write, a tiny
  mount effect re-writes the cookie unconditionally once per load from current
  state (idempotent value, renewed Max-Age) — after the seeding effect's reads
  so it serializes the reconciled axes. Cheap (one Set-Cookie-equivalent per
  session) and makes "flash-free after the first load" actually permanent.
- **Convergence**: existing users have no cookie until their first post-deploy
  load (the mount renewal writes it). First load behaves exactly as today;
  every load after is flash-free. Pure-default users get a default-valued
  cookie from the renewal — harmless (SSR emits defaults either way).

### 3c. Server read — `app/layout.tsx`

- Make `RootLayout` async; read `cookies()` (next/headers), parse
  `mc-theme-axes`, and validate EVERY field through the theme-values guards.
  Unknown/missing/malformed → that axis falls to its `DEFAULT_*`. **No
  unvalidated byte ever reaches an HTML attribute** (preserves the boot
  script's XSS-safe-by-construction posture; the emitted values are always
  members of the frozen literal sets).
- `theme === "system"` → SSR emits `clear` exactly as today (the server cannot
  know OS scheme); the boot script's `matchMedia` resolution repaints
  pre-paint, and React reconciles. `system` teachers keep today's behavior; no
  regression.
- Render the six SSR attrs from the validated axes: `data-frame/glass/bg/
  theme/dim` + **`data-tone` derived server-side** via the shared
  `deriveTone(theme, glass, bg, dim, null)` (the exact five-rule derivation the
  boot script replicates — one source of truth once 3a lands).
- Pass `initialFrame/initialGlass/initialBg/initialTheme/initialDim` to
  `<ThemeProvider>` from the same validated values (today only `initialTheme`
  is passed). Verified safe: no effect assumes defaults; `setX(sameValue)`
  no-ops; the cross-fade guard reads the DOM, not initial state.

### 3e. Cache-isolation invariant (review must-change #1 — HIGHEST-CONSEQUENCE)

**SSR HTML now varies on the `mc-theme-axes` cookie → it MUST NEVER enter a
shared cache.** Today this holds implicitly (Next renders dynamic pages
`no-store`; Cloudflare doesn't cache Worker HTML by default), but the design
makes it a STANDING INVARIANT that future work must not silently break: no
Cloudflare "Cache Everything" rule, no `cacheEverything` fetch, no
`revalidate`/ISR/`force-static` opt-in anywhere under the root layout —
any of those would edge-cache teacher A's frame and serve it to teacher B
(cosmetic blast radius — frozen-set values, no data leak — but app-wide).
Enforcement: (a) this section + a comment at the layout's `cookies()` read;
(b) §6's §4b gate asserts the deployed SSR response carries
`Cache-Control: private, no-store` (or equivalent) and that no HTML response
is shared-cacheable without `Vary: Cookie`; (c) grep-gate that no route sets
`force-static`/`revalidate` beneath the root layout.

### 3d. What deliberately does NOT change

- `lib/theme-init.tsx` — byte-identical. It remains the authority that repaints
  attrs from localStorage pre-paint (the stale-cookie self-heal) and the only
  `system` resolver.
- localStorage keys, theme-sync, the migration SQL, the frozen value sets.
- `data-stage-photo` / `--stage-photo` (already SSR-correct).

## 4. Accepted trade-offs (call-outs)

1. **`cookies()` in the root layout opts the whole app into dynamic
   rendering.** Cost: `/welcome` (the only truly-public page) AND the
   `generateStaticParams` subject pages (`app/(planner)/subject/[slug]`)
   render per-request. Everything else is already per-request behind the auth
   middleware on OpenNext/Cloudflare. Accepted; §6 verifies the build stays
   green and greps that no route under the root sets
   `force-static`/`revalidate` (those would now throw).
2. **Divergence transient (precise wording per review):** in the rare
   cookie≠localStorage case, the component tree briefly follows the cookie
   while the attrs follow localStorage (boot-painted), then the seeding effect
   reconciles the tree — no worse than today's default-flash (whose tree also
   disagrees with the boot-painted attrs), and the common cookie==localStorage
   case is strictly better.
3. **`system` teachers** still get the boot-script repaint for data-theme (as
   today). Verified: no first-paint canvas branches on `theme`/`resolvedTheme`
   (only Settings pickers/live-preview/command-palette), so no component
   flash.
4. **Probes/tests** that seed localStorage directly must ALSO seed the cookie,
   or they only exercise the cookie-absent heal path and would miss an SSR-path
   regression. probe-theme-wave gains: seed the cookie, `curl` the RAW SSR
   HTML (pre-JS), assert the `data-*` attrs match — not a post-hydration DOM
   read.
5. **Shared-device hygiene:** the cookie carries the departing teacher's look
   into the next login's first paint — the same presentation-only carry-over
   localStorage already has, now also server-visible. Optional fast-follow:
   clear `mc-theme-axes` (and the theme localStorage keys) on logout. Policy
   note: it is a strictly-functional preferences cookie (ePrivacy
   consent-exempt).

## 5. Flash-surface inventory (what this buys)

From the flash-surfaces sweep of the wave3 tip (every `useTheme()` read that
affects first render):

**Component-tree flashes (kind a) — eliminated entirely by this design:**
| Seam | What flashes today | Route |
|---|---|---|
| `WeeklyShell.tsx:585,1201` (`frame`) | Paper teacher sees the glass subject-grid, then `<WeekColumns>` snaps in | /weekly |
| `TimelineYear.tsx:265,618,820` (`frame`) | Color teacher sees the timeline, then `<YearConstellation>` snaps in | /year |
| `DailyView.tsx:947,1584` (`frame`) | Paper/color teacher's dashed add-lesson row pops in late | /daily |

**Cosmetic JS-inline-style flashes (kind b) — ALSO eliminated** (these are
`style={}` computed from axis state, NOT expressible via `data-*` CSS, so the
boot script cannot fix them):
- `weekly-lesson-card.tsx:264,446-511` — card material/border/band tint keyed
  on `frame` + `style` (glass frost paints first, re-skins after seed).
- `lesson-card.tsx:104-170`, `ListRow.tsx:211`, `WeeklyGrid.tsx:133,1063` —
  `style==="vivid"` (the default) fills flash for quiet/calm teachers.

**Scope consequence:** the deprecated v1 `style` (and cheaply `palette`) axes
still drive live surfaces, so the cookie carries them too — `initialStyle` /
`initialPalette` props already exist. Drop the fields when v1 surfaces retire.

**Confirmed residuals (not fixable by initial props, unchanged from today):**
the `dim==="normal"` AUTO tone (async photo-luminance sample; dormant this
wave) and `theme==="system"` OS resolution (client-only `matchMedia`; SSR
falls back to `clear` exactly as today).

**Negative findings worth recording:** WeekColumns / YearConstellation /
LessonModal / DayEditSplit do NOT read `useTheme()` themselves — all gating
lives in the three parent seams above, so fixing the seams fixes every current
and pending W3.7/W3.8 surface.

## 6. Verification plan

- **§4a**: Codex (read-only sandbox) + independent reviewer on the diff —
  security focus: cookie parsing/validation, XSS posture of SSR attrs,
  hydration-mismatch reasoning, lockstep integrity.
- **§4b live**: with a seeded cookie, `curl` the RAW SSR HTML and assert
  `data-frame="paper"` etc. present pre-JS; Playwright first-frame screenshot
  (Method A video if needed) proving WeekColumns renders on FIRST paint with no
  glass-grid flash; regression pass on default users (no cookie → today's
  HTML); `/welcome` + print + build green; probe re-run with cookie seeding.
- **Cache-isolation gate (must-pass)**: assert the SSR response carries
  `Cache-Control: private, no-store` (or equivalent non-shared-cacheable
  headers) on an authed route AND on `/welcome`; grep-gate zero
  `force-static`/`revalidate` under the root layout; confirm no HTML response
  is shared-cacheable without `Vary: Cookie`.
- **Unit**: the codec round-trip test + literal field-order fixture (the
  `normal` dim/palette collision).
