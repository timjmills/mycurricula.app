# Adversarial Audit Prompt — Frontend v2 Rebuild + Backend Rewiring Plan

> Paste this to an independent auditor (a fresh Claude instance with codebase access, or a
> reviewing engineer). **Attach the plan** (`i-want-plan-toasty-puddle.md`) — it is NOT on
> GitHub, so the auditor cannot fetch it; provide its full text. Give the auditor read access to
> the repo if at all possible — claims must be verified against code, not taken on faith.

---

You are an **independent adversarial auditor**. Another AI agent wrote the attached implementation
plan for rebuilding a Next.js app's frontend to a new "v2" design while rewiring its backend. Your
job is **not** to improve or endorse the plan — it is to **break it**: find every false assumption,
over-claim, hidden risk, scope gap, and sequencing error **before any code is written**. Assume the
plan's author may have over-claimed what exists and under-estimated what's hard. Default to skeptical:
treat each factual claim as **unproven until you verify it against the actual codebase**.

## Rules of engagement
- **Verify, don't trust.** For every concrete claim (files exist, seams exist, "zero live imports",
  "backend already seamed", token system shape), open the code and confirm. Cite `file:line`.
- **Read-only.** Do not modify anything. This is an audit, not an implementation.
- **Separate fact from inference.** Label each finding as VERIFIED-AGAINST-CODE, UNVERIFIABLE
  (couldn't check — say why), or CONTRADICTED-BY-CODE.
- **No rubber-stamping.** If you find nothing wrong in a section, state what you checked and why
  you're confident — don't just say "looks fine."

## Attack these specific load-bearing claims (highest risk first)
1. **"Re-skin only / preserve all plumbing" is feasible.** A v2 *redesign* often forces structural
   and state changes. Probe: are presentation and logic actually separable here, given CSS-module
   coupling and token usage? Find concrete surfaces where a faithful v2 redesign would require
   changing state/hooks/types/markup structure — not just CSS. Is the core premise sound?
2. **"Backend is already seamed; rewiring = completing sources + flipping flags."** Verify the
   feature-flag seams, `mock-source.ts` ↔ `supabase-source.ts` contract, Supabase clients, auth
   bypass, and API routes the plan names. Is `supabase-source.ts` a real contract or an aspirational
   stub? Estimate the true gap between "seam exists" and "live data works."
3. **Base-branch decision: build ON the uncommitted WIP branch.** This is the riskiest call. The WIP
   is uncommitted and its own tip commit says it is "not standalone-buildable." Attack: Does the
   working tree actually `npm run build`? What happens if the WIP author never finishes the partial
   settings modal? Is building a v2 re-skin on top of an in-flight Wave-1 appearance rework a
   sound foundation or a two-moving-targets trap? Quantify the collision concretely.
4. **"`main` and the v2 branch are unreachable (GitHub 403)."** Is this truly an absolute blocker,
   or is there a workaround (existing local refs, reflog, stashes, an alternate remote, files already
   in the working tree)? How much of the plan is reasoning around design content it has **never seen**?
   Flag every place the plan bluffs around the missing v2 design.
5. **Dynamic-workflow execution (per-surface fan-out with worktree isolation).** All surfaces share
   `app/tokens.css` and `components/ui/*`. Will parallel per-surface agents collide on these shared
   files despite worktree isolation? Is the token-migration-first ordering actually a hard barrier
   the pipeline ignores? Is the verification adversarial enough to catch silent regressions?
6. **Theme system preservation.** The plan preserves the 3-axis theme model — but v2 may replace it.
   What breaks if v2 redefines the token vocabulary the plan assumes is stable?
7. **Verification adequacy.** Is "build + lint + test + Playwright + manual" sufficient to catch
   visual regressions across 6 themes × 3 styles × 2 palettes × responsive tiers? What's missing
   (visual diffing, a11y gates, data round-trip tests per surface)?

## Also check
- Unstated dependencies and ordering hazards between the phases (§6).
- The §9 merge-points and §10 open questions — are any of them actually blockers mislabeled as
  "to reconcile later"?
- Anything the plan omits entirely (rollback strategy, feature-flag kill-switch, data migration
  safety, CSP/env changes, performance budgets, error-boundary coverage during partial rollout).

## Deliverable
1. **Verdict:** GO / GO-WITH-CHANGES / NO-GO, one paragraph.
2. **Findings table:** each row = {severity: BLOCKER | MAJOR | MINOR, claim audited, status
   (VERIFIED / UNVERIFIABLE / CONTRADICTED), evidence with `file:line`, recommended fix}.
3. **Must-resolve-before-coding list:** the minimal set of items that have to be settled first.
4. **Unverifiable list:** everything you could not check, and exactly what's needed to check it.
5. **Strongest counter-plan:** if you think a materially different approach beats this one
   (e.g., base from a clean branch, or rebuild rather than re-skin), argue it in 5–8 lines.
