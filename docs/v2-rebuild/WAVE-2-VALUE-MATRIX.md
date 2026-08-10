# Wave 2 — Frozen Appearance Value Matrix

> **⚠ STATUS CORRECTED 2026-08-10 — THE VALUE TABLES ARE STILL GOOD; SEVERAL
> PROSE CLAIMS AROUND THEM ARE NOT.** Verified against `f77acd6`.
>
> This file self-declared itself the "single source of truth" for the appearance
> engine, and `docs/project-context.md:76-79` points contributors here — so its
> errors propagate. The **axis value lists below are correct** and match the
> shipped guards; they are now mechanically enforced by
> `tests/theme-derivation-parity.test.ts`, which compares them across the
> lockstep surfaces on every run. **Trust the tables. Do not trust the prose
> without checking it against the code.**
>
> Corrected below, each marked inline with `⚠ SUPERSEDED 2026-08-10`. The
> original wording is left VISIBLE rather than rewritten, because this repo has
> repeatedly been bitten by documents that read as current:
>
> | # | Claim | Reality |
> |---|---|---|
> | 1 | §1 "there is NO `NEXT_PUBLIC_V2` runtime flag … v2 is the only path" | The flag EXISTS (`lib/v2-flag.ts:64`) and `NEXT_PUBLIC_V2=0` selects v1 |
> | 2 | Frame row: "Equivalent to `data-version ∈ A\|B\|C` — same axis" | No `data-version` is emitted anywhere in the app |
> | 3 | Zoom row: "Motion = Still" | No motion axis and no Motion control exist |
> | 4 | Zoom/Veil rows presented as live axes | Neither is emitted by `lib/theme.tsx` |
> | 5 | `data-style` "kept for v1 rollback" | Nothing stamps it on the root in EITHER flag state |
> | 6 | `data-palette` "kept for v1 rollback" | Stamped, but read by nothing |
>
> **Sequencing note:** items 1, 5 and 6 are true-today statements that change the
> moment the v1 deletion (task #7) lands. Where a claim below is only valid until
> then, it says so explicitly rather than silently expiring.

> **Status: FROZEN (Wave 2 / Stage 1).** *(Original header, preserved.)* This
> document is the **single source of
> truth** for the v2 appearance-engine axis values. Every later Wave-2 stage and
> every lockstep surface (§5) references THIS matrix. Do not change a value here
> without changing all five lockstep surfaces in the same commit.
>
> **Design truth:** `Documents/Claude Design/6.24.26 design_handoff_v2_site/design-system/`
> (`V2 Framework.md`, `themes.css`, `modes.css`, `colors_and_type.css`). The
> handoff CSS still uses the legacy DOM values `data-theme="normal"` and
> `data-bg="ambient"`; we **canonicalize** those to `clear` and `wash`
> respectively (see §1, §3). Where code and the handoff disagree, the handoff
> wins for look/behavior — but the canonical *value strings* are the ones frozen
> below.

---

## 1. The frozen matrix

Each axis is set as a data attribute on the app root (`<html>` / `.home`) by
`lib/theme.tsx`. **Additive / back-compatible:** the v1 axes (`data-style`,
`data-palette`) are NOT deleted — they are kept as **deprecated compat** so a
**git-level rollback** to v1 still compiles. ~~This is a CLEAN CUTOVER: there is
NO `NEXT_PUBLIC_V2` runtime flag and no runtime "v1 mode"; v2 is the only path.
v1 compatibility is STRUCTURAL only (preserved tokens + the deprecated
style/palette API).~~ The v2 path simply stops emitting `data-style` to the DOM.

> **⚠ SUPERSEDED 2026-08-10 (claim 1).** The struck sentence is wrong in the way
> that matters, and it is the single most consequential error in this file.
>
> `NEXT_PUBLIC_V2` **exists** — `lib/v2-flag.ts:64`:
> `export const V2: boolean = process.env.NEXT_PUBLIC_V2 !== "0"`. It is
> **default-ON**, and `NEXT_PUBLIC_V2=0` selects the v1 path. It is enforced at
> build time by `scripts/check-v2-flag.mjs`, and it gates both halves of the
> shell: the chrome (`app/(planner)/layout.tsx`) and the router
> (`lib/v2-flag.ts:120` `V2_ROUTER_GATED = true`).
>
> **Be precise about the one word that was defensible:** the flag is *inlined by
> `next build` and frozen into the artifact*, so it is genuinely **not
> runtime-switchable** — flipping the env var on a running deploy does nothing.
> If "runtime flag" was meant that narrowly, it was right. But the conclusions
> drawn from it — "no v1 mode", "v2 is the only path", "compatibility is
> STRUCTURAL only" — are false. A contributor who believes this paragraph will
> conclude the v1 build path does not exist. It does.
>
> **⚠ THE CORRECTION HAS TWO HALVES, AND ONLY THE FIRST IS PROVEN. Do not cite
> `NEXT_PUBLIC_V2=0` as "the production rollback lever" without the second.**
> An earlier draft of this very note did exactly that, and it was caught in
> review — which is worth recording, because it is the same failure this file
> documents elsewhere: *correcting* a false claim is precisely where the next
> false claim gets introduced, since the correction feels like the careful part.
>
> **(a) IT BUILDS — verified.** Both gate halves landed
> (`V2_ROUTER_GATED = true`, `lib/v2-flag.ts:120`), and the `die()` in
> `scripts/check-v2-flag.mjs:181` is guarded at `:179` by
> `RAW === "0" && !routerGated`, so it does not fire. A `NEXT_PUBLIC_V2=0` build
> is shippable today.
>
> **(b) IT IS NOT VERIFIED FAITHFUL — the flag-OFF build is a HYBRID.** Nothing
> in the codebase assigns `documentElement.dataset.style`, in **either** flag
> state — `lib/theme.tsx:867` takes `root = document.documentElement` and stamps
> frame / glass / bg / theme / dim / tone / canvas / palette, never `style`. So
> `app/tokens.css:1646-1656`'s three `:root[data-style="quiet|calm|vivid"]` rules
> never match, and a flag-OFF deploy restores the v1 chrome and route canvases
> **without the v1 style axis**.
>
> **Scope that honestly — the gap is real, its blast radius is small, and the
> reason matters more than the size.** Those three rules define only
> `--card-fill` and `--card-stripe-w`; both are declared *nowhere else* (no
> `:root` default) and read by *nothing* (zero `var(--card-fill)` /
> `var(--card-stripe-w)` consumers anywhere). v1 card styling in fact flows
> through `useTheme().style` in JS — `lesson-card.tsx` branches on `isVivid` —
> which works fine under flag-OFF. So there is **no known visual regression** from
> this specific gap. What is missing is not a proven breakage but the **proof of
> fidelity**: nobody has built a flag-OFF artifact and walked it. "Restores v1" is
> therefore UNVERIFIED, not proven-broken, and neither word may be dropped.
>
> **This gap is deliberately NOT being fixed.** Stamping `data-style` under
> `!V2` would be new v1 fidelity work with a known expiry — v1 is being deleted
> this cycle (task #7). Documenting it is the right disposition; recording the
> *choice* is what keeps it from reading as an oversight later.
>
> **Valid as of `f77acd6`, and deliberately time-boxed:** the build path works
> today and **stops working the moment task #7 deletes v1**. That deletion must
> update `docs/7.16.26-cutover-readiness.md` in the same commit, or the
> documented rollback path disappears silently — the kind of gap that only
> surfaces during an incident.

| Axis | Attribute | Values | Default | Persisted? | Notes |
|---|---|---|---|---|---|
| **Frame** | `data-frame` | `glass` · `paper` · `color` | `glass` | yes (`frame`) | Layout character + material + emphasis. ~~Equivalent to `data-version ∈ A\|B\|C` (A=glass, B=paper, C=color) — same axis.~~ **⚠ SUPERSEDED 2026-08-10 (claim 2) — see note below the table.** Changes material and colour; the user retired frame-driven *layout* on 2026-08-01. |
| **Glass register** | `data-glass` | `dark` · `light` | `dark` | yes (`glass`) | The two frosted registers of Frame A (dark = translucent-dark panels + white text; light = translucent-white panels + dark ink). Surface-only — flips a panel's fill AND text together; never washes the background. |
| **Background** | `data-bg` | `photo` · `wash` | `photo` | yes (`bg`) | What lives behind the glass. Frosted glass over Photo; Liquid v5 over Wash. **Canonical `wash`** = the handoff's legacy `data-bg="ambient"`. |
| **Theme** | `data-theme` | `clear` · `night` · `honey` · `blossom` · `mint` · `sky` · `off` | `clear` | yes (`theme`) | Washes the whole app (ambient palette + soft-light tint + `--accent`/glow). Subject + status colors never move. `off` = Photo, the true ungraded photo. **Canonical `clear`** = the handoff's legacy `data-theme="normal"` (and v1 `paper`/`cloud`). `system` is a stored sentinel resolved at runtime → `night`/`clear`. |
| **Photo brightness** | `data-dim` | `dim` · `normal` · `bright` | `normal` | yes (`dim`) | Photo prominence + text treatment (Photo only). `normal` is an **auto** mode — samples the active photo's average luminance to derive tone. |
| **Tone** | `data-tone` | `light` · `dark` | *(derived)* | **no** | **DERIVED, never chosen or persisted.** Every surface branches on `data-tone`, never on the theme. Derivation rule in §4. |
| **Canvas** *(supporting)* | `data-canvas` | `glass-dim` · `glass-light` | `glass-dim` | no | The home center panel only. Presentation state, not a teacher preference. |
| **Veil** *(supporting)* | `data-veil` | `photo-soft` · `photo-frost` · `ambient` · `recede` · `white` · `workspace` | per surface | no | ~~Readability layer; set per-surface/per-frame by the bundle, not stored.~~ **⚠ SUPERSEDED 2026-08-10 (claim 4) — NOT EMITTED. See below.** |
| **Zoom / drift** *(supporting)* | `data-zoom` | `0` · `1` | `1` | no | ~~Ambient drift on/off (`1` = drifting). Motion = Still / reduced-motion forces `0`.~~ **⚠ SUPERSEDED 2026-08-10 (claims 3 + 4) — NOT EMITTED, and there is no Motion setting. See below.** |

> **⚠ SUPERSEDED 2026-08-10 — claims 2, 3 and 4.** Three rows above describe
> attributes the engine does not actually emit. Grouped here because they share
> one root cause: this matrix was written from the **handoff mockup's** DOM, and
> parts of that DOM were never ported.
>
> **Claim 2 — `data-frame` is NOT "the same axis" as `data-version`, because
> `data-version` does not exist in this app.** `lib/theme.tsx` stamps
> `frame / glass / bg / theme / dim / tone / canvas / palette` and nothing else.
> A repo-wide search finds `data-version` in exactly six places, **all of them
> CSS comments** citing the handoff bundle (`app/themes.css:19,28`,
> `components/day-v2/day-v2.module.css:451`,
> `components/year/YearConstellation.module.css:6,39`,
> `components/year-v2/YearC.module.css:4`). Any selector written against
> `[data-version]` is dead — that was a large part of why Frame C rendered
> almost identically to Frame A before `de7a904`. **Branch on `data-frame`.**
> Leave those six comments alone: they are accurate provenance citations, and
> rewriting them onto `data-frame` would turn six true statements into six
> selectors of unknown correctness.
>
> **Claim 3 — there is no "Motion = Still".** No motion axis exists in
> `lib/theme-values.ts` (the axes are frame / glass / bg / dim / tone / canvas,
> plus the deprecated style / palette), and no Motion control ships in
> `components/appearance/`. The handoff's equivalent was `photoMotion`, which was
> never ported. What DOES exist is the OS-level `prefers-reduced-motion` media
> query, honoured throughout the CSS. **Consequence for teachers:** someone who
> finds the ambient drift distracting but does not want to change an OS-wide
> accessibility setting currently has no in-app recourse. That is a real gap, not
> a documentation nit.
>
> **Claim 4 — `data-veil` and `data-zoom` are not emitted.** No `.ts`/`.tsx`
> writes either attribute. `app/themes.css` carries live-looking readers for both
> (`[data-veil="photo-frost"]` at :1050, `[data-zoom="1"]` at :943 and four more)
> and none of them can match. ⚠ **Do not "fix" this by grepping for `data-zoom`
> and assuming it is wired:** `components/hub-v2/timeline/` uses a
> component-local `data-zoom` whose values are `cozy|roomy` — an unrelated
> attribute that happens to share the name. Same class of collision as
> `resource-tile.module.css`'s component-local `data-frame`
> (`video|slides|document|image|url`). Match on the VALUE SPACE, not the
> attribute name.

### Deprecated v1 compat axes (kept, not emitted on the v2 DOM path)

| Axis | Attribute | Values | Default | Persisted column | Status |
|---|---|---|---|---|---|
| Card style | `data-style` | `quiet` · `calm` · `vivid` | `vivid` | `theme_style` | **DEPRECATED** — ~~kept for v1 rollback;~~ seeds v2 `frame` (§ migration). Dropped from the v2 DOM. **⚠ SUPERSEDED 2026-08-10 (claim 5) — see below.** |
| Palette saturation | `data-palette` | `normal` · `highlight` | `highlight` | `theme_palette` | **DEPRECATED** — ~~kept for v1 rollback.~~ **⚠ SUPERSEDED 2026-08-10 (claim 6) — stamped, but read by nothing. See below.** |

> **⚠ SUPERSEDED 2026-08-10 — claims 5 and 6.** Both rows say "kept for v1
> rollback". That phrasing implies the attributes are doing a job. Measured
> against `f77acd6`, neither is — but they fail differently, and the difference
> decides what may be deleted:
>
> **`data-style` is never stamped on the root, in EITHER flag state.** Nothing in
> `lib/`, `app/` or `components/` assigns `documentElement.dataset.style`. So the
> three `:root[data-style="quiet|calm|vivid"]` rules in `app/tokens.css:1646-1656`
> match nothing today — not under v2, and not under a flag-OFF v1 build either.
> The row's own "Dropped from the v2 DOM" is correct; "kept for v1 rollback" is
> not, because the v1 path does not stamp it either. Note the attribute IS still
> emitted **per-card** by `components/lesson-card/lesson-card.tsx:250` — that is a
> component-local attribute, not the root axis this table describes.
>
> **`data-palette` IS stamped — and read by nothing.** `lib/theme.tsx:901` writes
> it and `app/layout.tsx:131` renders it server-side, so it genuinely appears on
> `<html>`. But there are **zero `[data-palette]` selectors in any stylesheet**,
> and the TypeScript that supposedly consumes it says otherwise in two places:
> `lib/palette.tsx:136-137` ("nothing here reads it") and
> `lib/palette-data.ts:220` ("`type` is accepted but NO LONGER read"). The axis
> was retired 2026-08-07 (decision 4).
>
> **What this means for the v1 deletion (task #7):** removing the `data-palette`
> stamp is safe on the evidence above — but it is on the five-surface lockstep
> list, so it must move with `app/layout.tsx`, the boot arrays, the SQL CHECK and
> the probe, in one commit. `tests/theme-derivation-parity.test.ts` will fail if
> they drift apart.

---

## 2. Theme canonicalization (v1 → v2)

| v1 `data-theme` | v2 `data-theme` | Note |
|---|---|---|
| `paper` | `clear` | The resting theme. The plain `:root` look folds into Clear. |
| `cloud` | `clear` | Folded into Clear. |
| `night` | `night` | Unchanged — the only dark theme; forces `data-tone="dark"`. |
| `mint` | `mint` | Unchanged. |
| `sky` | `sky` | Unchanged. |
| `blossom` | `blossom` | Unchanged. |
| *(new)* | `honey` | New v2 theme (warm gold/amber/coral). |
| *(new)* | `off` | New v2 value — Photo with no wash/grade (true original). |
| `system` | `system` | Stored sentinel; resolved at runtime → `night` (OS dark) / `clear` (else). |

The handoff CSS's legacy DOM token `data-theme="normal"` is the same look as
canonical `clear`. The handoff's `data-bg="ambient"` is the same as canonical
`wash`.

---

## 3. localStorage key migration plan

The three v1 keys are unchanged in name; the **theme value** migrates and the
four new v2 axes get their own keys. All keys keep the `mycurricula:user:*`
convention and are read through allowlist guards (an unrecognized value is
ignored, never painted).

### Existing keys (v1 → v2)

| Key | v1 value space | v2 action |
|---|---|---|
| `mycurricula:user:theme` | `paper\|cloud\|night\|mint\|sky\|blossom\|system` | **Remap on read:** `paper`/`cloud` → `clear`; `night`/`mint`/`sky`/`blossom`/`system` unchanged. The guard accepts both the v1 and v2 sets during transition; the remap normalizes to a v2 value before paint. |
| `mycurricula:user:theme-style` | `quiet\|calm\|vivid` | **Kept (deprecated).** ~~Still read for v1 rollback;~~ seeds the new `frame` key when `frame` is unset (`calm→glass`, `quiet→paper`, `vivid→color`) — that seeding IS live, in the boot script. **⚠ SUPERSEDED 2026-08-10 — the "read for v1 rollback" half; see claims 5–6 above.** |
| `mycurricula:user:theme-palette` | `normal\|highlight` | **Kept (deprecated).** ~~Read for v1 rollback only.~~ **⚠ SUPERSEDED 2026-08-10 — the persisted key is still written, but no surface reads the resulting axis. See claim 6.** |

### New v2 keys

| Key | Values | Default when absent |
|---|---|---|
| `mycurricula:user:theme-frame` | `glass\|paper\|color` | `glass` (or seeded from `theme-style`: `calm→glass`, `quiet→paper`, `vivid→color`) |
| `mycurricula:user:theme-glass` | `dark\|light` | `dark` |
| `mycurricula:user:theme-bg` | `photo\|wash` | `photo` |
| `mycurricula:user:theme-dim` | `dim\|normal\|bright` | `normal` |

> `data-tone` is derived (§4) and **never** persisted to localStorage. The
> supporting `canvas`/`veil`/`zoom` axes are runtime presentation state and are
> not persisted as teacher preferences in this stage.
>
> **Non-axis key (W3.1):** `mycurricula:user:theme-updated-at` — epoch-ms stamp
> of the last local write that CHANGED the synced triple (a user edit, or an
> applied remote value; plain reloads, fresh-store default writes, and v1
> migration rewrites never stamp). The local half of the last-writer-wins gate
> on the theme-sync remote pull. Never validated, not in the SQL/boot lockstep;
> tests/probes that seed axis keys must seed it too.
>
> **Migration is one-way and lossless for rollback:** the v1 keys are never
> deleted, so a **git-level rollback** to the v1 build still finds the
> teacher's original v1 values intact (the cutover is structural — there is no
> runtime flag to flip). The theme remap is idempotent (reading `clear` again
> yields `clear`).

---

## 4. `data-tone` derivation rule (DERIVED — never persisted)

Tone is computed from the theme + glass register + background + brightness at
paint time. Every surface branches on `data-tone`, never on the theme — this is
what keeps a new surface correct across all seven themes automatically (the
legibility contract).

Evaluate top-to-bottom; first match wins:

1. **`theme === "night"` → `dark`.** Night is the only dark theme; it forces
   dark tone app-wide regardless of register or background.
2. **`glass === "light"` → `light`.** The White-frosted register is a light
   surface (translucent-white panels + dark ink), so it forces light tone
   app-wide (Night still wins, rule 1). It sets the surface/text register, not
   the background, so "glass must never wash the background" still holds.
   *(Added by the Wave-2 re-audit — White-frosted previously could not select
   the light register because `deriveTone` ignored `glass`.)*
3. **`bg === "wash"` → `light`.** Wash is always light tone (Night + White-frosted
   already handled in rules 1–2).
4. **`bg === "photo"`** — branch on `data-dim`:
   - **`dim` → `dark`** — heavy scrim, white text. Manual override.
   - **`bright` → `light`** — light tone, dark text on white frosted cards.
     Manual override.
   - **`normal` → auto** — sample the active photo's average luminance
     (32×32 canvas read). **`lum > 0.6` → `light`** (light photo → dark text);
     otherwise **→ `dark`** (dark photo → white text). Until a sample is
     available, default to `dark` (the safe white-text-on-scrim state).

Compact form:

```
night                         → dark
glass=light                   → light
dim                           → dark
bright                        → light
wash                          → light
normal (photo, auto):
   photoLuminance > 0.6       → light
   else                       → dark
```

---

## 5. The five lockstep surfaces

The frozen matrix in §1 is mirrored across exactly five surfaces. **Change one,
change all — in the same commit.** A drift fails silently (a value one surface
accepts and another rejects breaks with no error, just a wrong attribute or a
dropped sync write).

1. **`lib/theme.tsx`** — the canonical exported guard arrays (`isThemeSetting`,
   `isThemeStyle`, `isThemePalette`, and the new frame/glass/bg/dim guards) +
   the defaults. This is the *origin* of the matrix.
2. **`lib/theme-init.tsx`** — the no-FOUC boot script's inline allowlist arrays
   (a literal copy; the boot script runs before any module loads, so it cannot
   import the guards).
3. **`supabase/migrations/20260624120000_v2_theme_axes.sql`** — the SQL `CHECK`
   constraints on `frame`/`glass`/`bg`/`dim`/`theme` (+ the kept legacy
   `theme_style`/`theme_palette` checks).
4. **`app/layout.tsx`** — the SSR root data attributes (server-rendered
   defaults, painted before hydration).
5. **`scripts/probe-theme-wave.mjs`** — the per-wave verification probe (themes
   list + axis assertions).

> **Stage note:** Stage 1 (this stage) freezes the matrix and writes surface #3
> (the migration) only. Surfaces #1, #2, #4, #5 are updated in later Wave-2
> stages, each of which MUST mirror this matrix exactly. `tokens.css`,
> `theme.tsx`, and `themes.css` are intentionally NOT touched this stage.
