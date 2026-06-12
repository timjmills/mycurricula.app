# Code Review Gate — Cloud / Remote Environment Note

> **Snapshot disclaimer:** dated 2026-06-04. Describes how the
> CLAUDE.md §4a "Code Review Gate (Claude Code → Codex)" is satisfied when
> Claude Code runs in the **managed remote execution environment** (Claude
> Code on the web / mobile / GitHub-triggered sessions) rather than on a
> local workstation.

## The constraint

CLAUDE.md §4a requires an adversarial Codex review (`codex exec --sandbox
read-only`) before committing a logic / security / data-handling /
public-interface change. **The Codex CLI is not installed in the Claude
Code cloud container** — `command -v codex` returns nothing. The container
is ephemeral and has no Codex binary or auth, and the §4a hard rule
forbids weakening the sandbox or routing code through another channel as a
workaround.

Per the §4a failure protocol ("If the gate cannot run … report the blocker
to the user and fall back to the strongest available local verification"),
the gate is satisfied in the cloud by:

1. **The full local verification stack** — run on every gated change:
   - `npm run lint` (ESLint — catches unused vars, hook-rule violations)
   - `npx tsc --noEmit` (full typecheck)
   - `npm run build` (production build — catches SSR/route errors)
   - `npx prettier --check` on the changed files
2. **A written structured self-review** recorded in this file (or the PR
   description) using the §4a review checklist: logic errors, security
   flaws, race conditions, unhandled edge cases, broken error handling,
   missing/wrong tests. Each gated change appends an entry below.
3. **The responsive contract** verified per CLAUDE.md §4 at the three
   viewport tiers when the change is visual (documented in the commit
   message).

When a change later flows through a **local** session or a PR where Codex
_is_ available, run the real gate there — this fallback does not exempt the
work from adversarial review, it records that the cloud run was blocked and
what substituted for it.

---

## Self-review log

### 2026-06-04 — Restore Subjects panel + per-instance rename feature

**Scope reviewed (staged diff):** `app/layout.tsx`,
`components/rename/*` (new), `components/subject/SubjectView.tsx`,
`components/subject/SubjectWorkspace.module.css`, `lib/instance-labels.tsx`.

**Checklist findings:**

- **React hook ordering (correctness).** `InstanceRenameLabel` calls all
  hooks (`useInstanceLabels`, `useState`, `useRef`) _before_ the
  `if (readOnly) return` early exit; `RenamePopover` calls all hooks before
  the `typeof document === "undefined"` portal guard. No conditional-hook
  violation. ESLint `react-hooks/rules-of-hooks` passes. ✓
- **SSR / hydration.** `InstanceLabelsProvider` initializes empty, so
  `resolve()` returns the default name on the server and first client paint
  → HTML matches. The pencil renders unconditionally (not state-gated); the
  only post-mount change is the `pencilOn` class once overrides load, which
  is a benign second-render class flip (same pattern as `LabelsProvider`). ✓
- **Nested interactive elements.** Rename labels are placed only in
  non-button containers (`<h2>`, `<h3>`, `.rtitle` div) — never inside the
  unit/week/day `<button>` cards — so there are no invalid
  button-in-button nestings. The pencil `stopPropagation`/`preventDefault`
  is defensive belt-and-braces. ✓
- **Save-button edge cases.** `disabled={!isChanged && currentName ===
defaultName}` keeps Save inert when nothing changed and no override
  exists; clearing the input on an existing override is treated as a valid
  change and routes through `rename(..., "")`, which the store maps to
  "clear this scope's override" → falls back to the other scope or default.
  No silent no-op, no way to persist an empty name (store trims + drops
  empties). ✓
- **Popover dismissal / listeners.** Outside-click uses `pointerdown`
  capture checking both `panelRef` and `anchorRef`; Escape stops
  propagation and restores focus to the trigger. Listeners are cleaned up
  in the effect teardown. The effect re-subscribes when the parent's inline
  callbacks change identity — harmless churn, not a leak (teardown always
  runs first). ✓
- **Positioning robustness.** The portal panel is fixed-positioned from the
  anchor's `getBoundingClientRect`, clamped to the viewport, recomputed on
  capture-phase scroll + resize — so it survives the Subject workspace's
  nested scroll containers without clipping. First paint is
  `visibility:hidden` until the layout effect sets coordinates (no 0,0
  flash). ✓
- **Persistence / data handling.** `lib/instance-labels.tsx` localStorage
  read/write is wrapped in try/catch (private-mode / quota safe) and SSR
  guarded (`typeof window`). Malformed JSON falls back to an empty record.
  Personal/team scopes are separate keys; `resolve` precedence is
  personal → team → default. This is the documented Phase-1B seam for the
  Supabase swap. ✓
- **Panel restore (regression check).** The left Subjects panel + its CSS
  were restored verbatim from commit `68782eb` (the pre-removal state); the
  Subject **roadmap** card stays removed (the user's actual request); the
  clickable Year-overview units and the site-wide label wiring are
  preserved. No orphaned `.subjtab*` chip references remain (grep clean). ✓
- **Tests.** No automated test harness exists in-repo for these
  components; verification is lint + tsc + build + manual responsive probe.
  Noted as a standing gap, not introduced by this change.

**Local verification:** `npm run lint` ✓ · `npx tsc --noEmit` ✓ ·
`npm run build` ✓ · `prettier --check` ✓ (changed files).

**Responsive:** Subjects panel CSS is the proven original (272px rail →
slide-over ≤1000px). Rename popover clamps to `calc(100vw - 16px)` and
repositions within the viewport at all tiers.

**Result:** No Critical/High issues found in self-review. Codex gate
blocked (binary absent in cloud container) — recorded here per §4a
fallback.

### 2026-06-12 — 6.12.26 UX Roadmap + Resources build (waves 1–3)

**Scope:** the full 6.12.26 handoff build — six commits across
`claude/ux-roadmap-resources-wave-{1,2,3}`.

**Reviewers on record:** one freshly-spawned independent review agent per
wave (did not author the diffs) + lead disposition of every finding;
implementation agents additionally ran self-administered passes. Codex
unavailable in this container per the §4a cloud protocol.

**Findings/fixes:** 0 Critical · 3 High · 20 Medium across the three
waves — all fixed before their commits (full disposition in each commit
message); ~30 Lows fixed or deferred with in-code notes. Highlights: a
stale-toast wrong-undo path, an Esc-in-drawer capture loss, a
remove-after-dedup targeting bug, a `javascript:` link-popover gap, and a
restoreLesson that didn't restore.

**Local verification stack:** tsc 0 · 282 vitest passed · lint ·
prettier · `next build` · responsive probes (360/768/1280) · Playwright
behavioral probes + artboard screenshot comparison in mock mode.
See `docs/6.12.26 UX Roadmap + Resources Build Record.md`.
