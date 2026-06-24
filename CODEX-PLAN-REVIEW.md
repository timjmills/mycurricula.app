# CODEX-PLAN-REVIEW.md — Codex adversarial review (REVIEW 2)

**Invocation (per CLAUDE.md §4a, sandbox never weakened):**
```
codex exec --sandbox read-only "$(cat docs/v2-rebuild/_codex-review-prompt.txt)"
```
Codex CLI **0.139.0**, run against the committed base (HEAD `882a1f4`). The prompt is preserved verbatim at `docs/v2-rebuild/_codex-review-prompt.txt`.

## Outcome: Codex did NOT converge on a clean review — terminated; substitute applied

Codex started the review but **could not produce a findings table or verdict within the run.** Root cause, observed in its own captured output:

- The prompt asks the reviewer to verify claim 5 ("does `npm run build` pass?"). Codex attempted `npm run build` inside its **read-only sandbox**, which **caps each command at ~120 s**. `next build` on this repo does not finish in 120 s from cold (it exceeds the budget), so Codex hit `Exit code: 124` (timeout) and **repeatedly retried the build "with a longer timeout"** — which the sandbox cannot grant. It looped on build-verification and emitted ~2 MB of build logs + file dumps without reaching its own deliverable (no `GO/GO-WITH-CHANGES/NO-GO`, no findings table).
- After it was clear Codex would not converge (the sandbox can't run a >120 s build), the process was **terminated** to stop the loop. This is a genuine `codex exec` limitation on this repo's build time under the read-only sandbox on Windows (consistent with the §4a "known sandbox limitations" note), **not** a weakening of the gate.

**The one substantive signal from the Codex run:** `next build` exceeds a 120 s sandbox budget. NOTE: this is a **sandbox artifact, not a build failure** — the build/backend lens ran the same build *without* the sandbox and it **passes clean in ~60 s** (tsc + lint + `next build` all exit 0 at HEAD `882a1f4`, no error suppression). So claim 5 resolves **PASS**; the Codex timeout only tells us the build is too slow to verify inside the read-only sandbox.

## Substitute (required by CLAUDE.md §4a)

When Codex cannot run the gate, the gate is satisfied by an **independent adversarial review by a reviewer that did not author the artifact.** That is exactly REVIEW 1 in **`CLAUDE-PLAN-REVIEW.md`** — a 5-agent team (feasibility · appearance-engine · build/backend · sequencing/data-model · forking/omissions), each adopting the strict-skeptical Senior Security & QA Engineer persona and **verifying every claim against the actual code**, independent of the plan's author. Treat `CLAUDE-PLAN-REVIEW.md` as the authoritative adversarial findings for this plan.

## Verdict (REVIEW 2)

**GO-WITH-CHANGES** — concurring with REVIEW 1 by adoption (Codex produced no independent contrary findings before timing out). The blocking items are the ones enumerated in `CLAUDE-PLAN-REVIEW.md` → "MUST-RESOLVE-BEFORE-CODING" (F1 theme-migration Critical; F2/F3 presentation-rebuild + data-style typed-API break; F4 forking cue; F5 tone-flash; F7/F8 backend reframing).

## If a true second independent engine is required

Re-run Codex with the build-verification step **removed from its prompt** (claim 5 is already resolved PASS by the build lens), so it reviews the plan + code without attempting the >120 s build that defeats the sandbox. That single change should let `codex exec --sandbox read-only` converge on its own findings table.
