# Wave 2 — Frozen Appearance Value Matrix

> **Status: FROZEN (Wave 2 / Stage 1).** This document is the **single source of
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
**git-level rollback** to v1 still compiles. This is a CLEAN CUTOVER: there is
NO `NEXT_PUBLIC_V2` runtime flag and no runtime "v1 mode"; v2 is the only path.
v1 compatibility is STRUCTURAL only (preserved tokens + the deprecated
style/palette API). The v2 path simply stops emitting `data-style` to the DOM.

| Axis | Attribute | Values | Default | Persisted? | Notes |
|---|---|---|---|---|---|
| **Frame** | `data-frame` | `glass` · `paper` · `color` | `glass` | yes (`frame`) | Layout character + material + emphasis. Equivalent to `data-version ∈ A\|B\|C` (A=glass, B=paper, C=color) — same axis. Changes layout/material, never global tone. |
| **Glass register** | `data-glass` | `dark` · `light` | `dark` | yes (`glass`) | The two frosted registers of Frame A (dark = translucent-dark panels + white text; light = translucent-white panels + dark ink). Surface-only — flips a panel's fill AND text together; never washes the background. |
| **Background** | `data-bg` | `photo` · `wash` | `photo` | yes (`bg`) | What lives behind the glass. Frosted glass over Photo; Liquid v5 over Wash. **Canonical `wash`** = the handoff's legacy `data-bg="ambient"`. |
| **Theme** | `data-theme` | `clear` · `night` · `honey` · `blossom` · `mint` · `sky` · `off` | `clear` | yes (`theme`) | Washes the whole app (ambient palette + soft-light tint + `--accent`/glow). Subject + status colors never move. `off` = Photo, the true ungraded photo. **Canonical `clear`** = the handoff's legacy `data-theme="normal"` (and v1 `paper`/`cloud`). `system` is a stored sentinel resolved at runtime → `night`/`clear`. |
| **Photo brightness** | `data-dim` | `dim` · `normal` · `bright` | `normal` | yes (`dim`) | Photo prominence + text treatment (Photo only). `normal` is an **auto** mode — samples the active photo's average luminance to derive tone. |
| **Tone** | `data-tone` | `light` · `dark` | *(derived)* | **no** | **DERIVED, never chosen or persisted.** Every surface branches on `data-tone`, never on the theme. Derivation rule in §4. |
| **Canvas** *(supporting)* | `data-canvas` | `glass-dim` · `glass-light` | `glass-dim` | no | The home center panel only. Presentation state, not a teacher preference. |
| **Veil** *(supporting)* | `data-veil` | `photo-soft` · `photo-frost` · `ambient` · `recede` · `white` · `workspace` | per surface | no | Readability layer; set per-surface/per-frame by the bundle, not stored. |
| **Zoom / drift** *(supporting)* | `data-zoom` | `0` · `1` | `1` | no | Ambient drift on/off (`1` = drifting). Motion = Still / reduced-motion forces `0`. |

### Deprecated v1 compat axes (kept, not emitted on the v2 DOM path)

| Axis | Attribute | Values | Default | Persisted column | Status |
|---|---|---|---|---|---|
| Card style | `data-style` | `quiet` · `calm` · `vivid` | `vivid` | `theme_style` | **DEPRECATED** — kept for v1 rollback; seeds v2 `frame` (§ migration). Dropped from the v2 DOM. |
| Palette saturation | `data-palette` | `normal` · `highlight` | `highlight` | `theme_palette` | **DEPRECATED** — kept for v1 rollback. |

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
| `mycurricula:user:theme-style` | `quiet\|calm\|vivid` | **Kept (deprecated).** Still read for v1 rollback; also seeds the new `frame` key when `frame` is unset (`calm→glass`, `quiet→paper`, `vivid→color`). |
| `mycurricula:user:theme-palette` | `normal\|highlight` | **Kept (deprecated).** Read for v1 rollback only. |

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
