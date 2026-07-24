# CLAUDE-WAVE2-REVIEW.md

Verdict: NO-GO

Reviewer: independent spawned review agent `019efa70-bdb5-7592-8684-b661e07a9f2c`
(`Aristotle`). The reviewer did not author the Wave 2 engine. Scope was the
same diff and checklist as the Codex pass:
`origin/claude/v2-wave1-docs..origin/claude/v2-wave2-engine` at tip
`86c792857f4046f1f43d1bd4c59d357a1087625a`.

## Findings

| Severity | File / line | Issue | Failure scenario | Fix |
| --- | --- | --- | --- | --- |
| High | `app/themes.css:197`, `app/globals.css:26`, `app/globals.css:43` | `.stage` is visually hidden by root/body backgrounds. | `.stage` is fixed at `z-index:-2`, while `html, body` and `body` paint opaque backgrounds. The stage host and `--stage-photo` can be present while the handoff photo/wash is not visible. | Make `.stage` the real visible root background layer, or move to a non-negative isolated stack with app content above it. |
| Medium | `app/themes.css:502`, `app/layout.tsx:143` | `.theme-tint` handoff layer is not mounted. | The CSS defines the whole-app soft-light theme wash, but no `.theme-tint` element exists, so color themes miss the intended wash and overlay stacking contract. | Render the `.theme-tint` element in root layout and verify overlay stacking. |
| Medium | `scripts/probe-theme-wave.mjs:365`, `scripts/probe-theme-wave.mjs:399`, `scripts/probe-theme-wave.mjs:421` | Auto-tone proof is insufficient. | The probe accepts any stable `light|dark`, so the default dark fallback passes even if the luminance chain never runs. | Assert the sample side effect or expected `/stage/p1.webp` derived tone. |
| Medium | `lib/theme.tsx:255`, `lib/theme-init.tsx:57`, `supabase/migrations/20260624120000_v2_theme_axes.sql:136` | Theme allowlists are not strictly lockstep. | SQL accepts `paper/cloud`, but client allowlists only accept canonical v2 values plus `system`. Legacy DB values can be accepted then dropped by v2 reads. | Either make SQL canonical-only or document/test the transitional superset and remap remote `paper/cloud` to `clear`. |

## Verification

The independent reviewer did not run `tsc --noEmit`, lint, or build directly.
The main audit run verified lint and TypeScript separately; production build is
blocked in the sandbox by Google Fonts network fetches.

## Must Fix Before Wave 3

1. Visible stage/background stacking.
2. Mounted `.theme-tint`.
3. Real auto-tone probe proof.
4. Explicit SQL/client allowlist transition handling.
