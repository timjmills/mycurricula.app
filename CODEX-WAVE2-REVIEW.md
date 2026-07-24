# CODEX-WAVE2-REVIEW.md

Verdict: NO-GO

Scope: Wave 2 appearance-engine re-audit at `origin/claude/v2-wave2-engine`
tip `86c792857f4046f1f43d1bd4c59d357a1087625a`, diff range
`origin/claude/v2-wave1-docs..origin/claude/v2-wave2-engine`.

Primary `codex exec --sandbox read-only` was attempted with the requested diff
pipe, but the sandbox blocked outbound WebSocket/HTTPS transport to the Codex
API. Sandbox was not weakened. This file is the local Codex review result,
verified against the frozen matrix and handoff files available in git.

## Findings

| Severity | File / line | Issue | Failure scenario | Fix |
| --- | --- | --- | --- | --- |
| High | `app/themes.css:197-203`, `app/globals.css:25-48` | `.stage` is behind the opaque root/body background. | The v2 photo/wash host exists and `--stage-photo` resolves, but the fixed `.stage` is `z-index:-2` inside `body` while `html, body`/`body` paint `var(--canvas)` and the mesh background. The required handoff photo/wash can be hidden behind the body canvas; the probe still passes because it checks DOM/CSS, not pixels. | Make the stage the visible background layer: move the canvas/mesh into `.stage`, make the screen body background transparent in the v2 path, or use an isolated non-negative stacking model with app chrome above it. |
| Medium | `app/themes.css:505-590`, `app/layout.tsx:143` | Required `.theme-tint` layer is defined but never rendered. | Handoff says themes wash over the whole app through `.theme-tint`; code defines the layer and overlay stacking assumptions, but no root element mounts it. Honey/Blossom/Mint/Sky/Night miss the intended whole-app soft-light wash. | Render `<div className="theme-tint" aria-hidden="true" />` at the root with the intended stacking order and verify overlays remain above it. |
| Medium | `scripts/probe-theme-wave.mjs:121-187` | Probe passes protected-route redirects as route success. | In live run, `/weekly`, `/daily`, and `/settings/appearance` all redirected to `/login?next=...`, but the probe still reported every route OK because it only inspected root attrs. This can green-light the wrong page. | Assert `new URL(page.url()).pathname` equals the expected route and check a route-specific surface marker before scoring axes/screenshots. |
| Medium | `scripts/probe-theme-wave.mjs:393-421` | Auto-tone probe does not prove luminance sampling executed. | `photo-normal-auto` passes if `data-tone` is any stable `light|dark`. The SSR/pre-sample fallback is already stable `dark`, so a broken sampler, missing photo URL, or tainted canvas can pass. | Assert a sampling side effect such as `mycurricula:photo-tone:/stage/p1.webp`, or precompute `/stage/p1.webp` expected tone and require that exact post-hydration value. |
| Medium | `lib/theme-sync.ts:101-119`, `lib/theme-sync.ts:149-155`, `lib/theme.tsx:521-573`, `lib/theme.tsx:758-764` | Remote theme sync still persists only the legacy triple. | The matrix marks `frame/glass/bg/dim` as persisted and the migration adds columns, but `NEXT_PUBLIC_THEME_SYNC=1` reads/writes only `theme/theme_style/theme_palette`. A teacher's v2 appearance axes do not follow them across devices. | Widen `RemoteThemePrefs`, selects, upserts, validation, and save payloads to include `frame/glass/bg/dim`, or explicitly change the matrix to local-only for this wave. |
| Medium | `lib/theme.tsx:255-264`, `lib/theme-init.tsx:57-61`, `supabase/migrations/20260624120000_v2_theme_axes.sql:135-143` | SQL and client theme allowlists are not lockstep for `paper/cloud`. | SQL accepts transitional `paper/cloud`, but the client guard and boot arrays reject/remap them. A legacy remote write can be accepted by DB and then dropped by v2 remote read instead of canonicalizing to `clear`. | Either make SQL canonical-only after migration, or explicitly model the transitional SQL superset and remap `paper/cloud -> clear` in `theme-sync` and probes. |

## Verified

`npm run lint` passed on an exported copy of the exact branch tip.
`npx tsc --noEmit` passed on the same export.
`npm run build` did not complete in this sandbox because `next/font` could not fetch Google Fonts (`EACCES`). This is an environment/network blocker, not a TypeScript finding.

## Must Fix Before Wave 3

1. Make the stage/photo/wash layer visibly paint, not just exist in DOM.
2. Mount the `.theme-tint` layer required by the handoff.
3. Fix the probe so it fails on auth redirects and proves auto-tone sampling.
4. Resolve v2-axis remote persistence versus the frozen matrix.
5. Resolve the SQL/client transitional theme allowlist mismatch.
