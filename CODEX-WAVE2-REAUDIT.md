# CODEX-WAVE2-REAUDIT — §4a Review 1 (Codex)

- **Reviewer:** Codex CLI v0.142.0 (model gpt-5.5, reasoning effort xhigh), `--sandbox read-only` (never weakened).
- **Inputs (stdin):** DIFF 1 = fix-only commit `580711b`; DIFF 2 = full engine diff `claude/v2-wave1-docs..claude/v2-wave2-engine`. Anchored to checked-out files for exact line refs.
- **Verdict:** **NO-GO**

## Findings

| # | File:line | Severity | Failure scenario | Suggested fix |
|---|---|---|---|---|
| 1 | `scripts/probe-theme-wave.mjs` ~620–790 | **High** | The `/login` redirect guard still permits a false green. If `/weekly` redirects to `/login`, the probe falls back to `/` and never verifies the final URL for the paint checks. Because `.stage` / `.theme-tint` live in `RootLayout`, the gate can PASS on `/login`, `/welcome`, or `/` while no authenticated app route was ever tested. | Fail the paint gate unless the final URL is an authenticated route (e.g. `/weekly`); check `page.url()` after every `goto`, and do NOT fall back to `/` for this contract. |
| 2 | `app/themes.css` `.theme-tint` rule | Medium | `.theme-tint` is `position:absolute; inset:0; z-index:90`, so the wash covers only the initial containing block and scrolls away on long pages — contradicts the "whole-app wash" + z-90 overlay intent. The mounted fix only repairs the first viewport. | If the wash should stay over the app during scroll, make `.theme-tint` `position: fixed; inset: 0`, then verify `/year` / a long route below the fold. **(= the R2 absolute-vs-fixed open question.)** |
| 3 | `scripts/probe-theme-wave.mjs` ~760–805 | Medium | `E:auto-tone-sampled` does not prove sampling occurred. `data-tone` starts as the valid fallback `"dark"`, so the loop exits immediately and passes even if the luminance sampler never runs. | Clear the per-photo tone cache and assert a sampling side effect (e.g. `localStorage["mycurricula:photo-tone:/stage/p1.webp"]` written), or independently sample `/stage/p1.webp` in the probe and assert the final tone equals the computed result. |
| 4 | `scripts/probe-theme-wave.mjs` ~670–690 | Medium | `C:photo-paints` only checks that computed CSS contains `url(p1.webp)`. A broken / 404 / blocked / non-decoded image still leaves the computed `backgroundImage` containing the URL, so the probe can pass without any photo pixels. | Assert the image request succeeds and/or sample screenshot pixels/canvas after load to prove non-flat photo content is actually visible. |
| 5 | `app/themes.css` photo-stage rules / `data-theme="off"` | Medium | `off` is presented as "true, ungraded photo," but the root `.stage::before` photo path always applies the four duotone radial gradients + soft-light blend. The only `off` overrides target `.home … .frame/.photo`, not the global `.stage`, so `data-theme="off"` still grades the background photo. | Add root-stage `off` rules removing the duotone gradient stack/filter/blend for `[data-theme="off"][data-bg="photo"] .stage::before`, or define transparent `--duo-*` / normal blend for `off`. |

## Must-fix before Wave 3
- **#1 (High)** — probe must assert it tested an authenticated route, not silently green on `/login`/`/`.
- **#2** — settle absolute vs fixed for `.theme-tint` (the standing R2 question).
- **#3, #4** — probe self-deception: tone-sampling side-effect proof + real photo-pixel proof.
- **#5** — `off` theme should actually deliver an ungraded photo, or the spec wording should change.

## Notes on the six fix-only focus points
- (i) body transparent — no token/contrast break flagged by Codex beyond the items above.
- (ii) `.theme-tint` static child + z-90 — flagged as **#2** (absolute → scrolls away).
- (iii) `@media print` nesting — Codex did not flag it as mis-nested (globals.css lines 92/150 show the print blocks; treated as correct).
- (iv) probe assertions — flagged as **#1/#3/#4** (multiple false-positive paths).
- (v) SSR/hydration — no mismatch flagged.
- (vi) lockstep — migration CHECK lists confirmed in lockstep with the frozen matrix (see the migration header Codex read); no frozen-array edits flagged in the fix.

_Raw Codex transcript: `$CLAUDE_JOB_DIR/tmp/codex-out.txt` (293 KB)._
