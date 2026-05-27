# Wave 0 — audit notes (2026-05-27)

## Gate result: ✓ pass

- Build clean: `npm run build` succeeds; all 31 routes generate (`/weekly` 24.4 kB, `/daily` 936 B, `/year` 19.4 kB, etc.).
- Dev clean: dev server serves all 7 probed routes with no 500.
- Probe: `scripts/probe-uxa.mjs <wave>` captures 360×800, 768×1024, 1280×900 screenshots of `/weekly`, `/daily`, `/year`, `/subject/math`, `/schedule`, `/catch-up`, `/settings/curriculum` → 21 screenshots into `docs/screenshots/uxa-2026-05-27/<wave>/`.
- No document-level horizontal scroll at any tier.

## Errors / bugs / omissions / gaps surfaced

1. **FIXED — stale `.next/` artifact** (was: SSR 500 on every route): the prior `.next/server/webpack-runtime.js` referenced chunks (`./611.js`, `./vendor-chunks/@swc.js`) that no longer existed because the dev server (PID 35128) was concurrently writing to `.next/` during a prior `next build` invocation. Killing dev server → `rm -rf .next` → `npm run build` → restart dev produced a consistent runtime + chunks state. Routes now SSR cleanly.

2. **CONFIRMS A1 (Wave 1)** — `/subject/math` fires 3 hydration warnings per tier: `<button> cannot be a descendant of <button>` + `<button> cannot contain a nested <button>` + `Hydration failed because the server rendered HTML didn't match the client.` This is the nested-button bug the audit calls out (`components/subject/SubjectView.tsx`). Wave 1 fix will resolve all three.

3. **NEW (not in original audit) — `/weekly` hydration mismatch warning**: "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties." Fires at all three tiers. Likely a `data-*` attribute or class composed from client-only state (theme/palette/master-mode/edit-cue) that isn't applied SSR-side. Non-blocking (React regenerates client-side) but should be traced — file for Wave 5 polish or fix inline if it surfaces during Wave 2 master-banner/team-mode work.

4. **Infrastructure omission resolved**: the audit was code-only because no probe infra existed for the 360/768/1280 sweep. `scripts/probe-uxa.mjs` now closes that gap; reusable as `node scripts/probe-uxa.mjs <wave-name>`.

## Probe script — how to re-run per wave

```bash
CLAUDE_BYPASS_TOKEN=$(grep '^CLAUDE_BYPASS_TOKEN=' .env.local | cut -d= -f2-) \
  node scripts/probe-uxa.mjs <wave-name>
```

Output: `docs/screenshots/uxa-2026-05-27/<wave-name>/`. Console report includes per-route hScroll status + console-error count.

## Baseline screenshots

`docs/screenshots/uxa-2026-05-27/wave-0-clean/` — 21 screenshots, captured post-rebuild against the cleaned dev server.
