# Output Formats

Omit any section that does not apply. Never fill a heading with "N/A" or a
restatement of the heading — padding buries the findings that matter.

Write audit and plan outputs to `docs/audits/YYYY-MM-DD-<scope>.md` and give the
user the path.

Every report opens with an evidence line:

> **Evidence:** 9 findings — 6 observed, 2 inferred, 1 unverified. Rendered at
> 360 / 768 / 1280 / 1920 via Playwright. axe-core and `tsc --noEmit` run.
> Screen-reader behaviour not tested.

---

## §A — New build

1. **Creative direction** — the concept in a sentence, then the system
2. **Key implementation decisions** and why
3. **Advanced techniques used** and what each earns
4. **Files created or changed**
5. **Accessibility** — what was implemented, what was verified, what was not
6. **Performance** — measures taken and measurements made
7. **Responsive behaviour** — how each width differs
8. **Assumptions made** where information was missing
9. **Known limitations**
10. **Recommended next steps**

---

## §B — Improvement

1. **Problem addressed** — restated from the original observation
2. **What changed and why**
3. **What was deliberately preserved**
4. **Before / after** — screenshots where available
5. **Files changed**
6. **Validation performed** — and what was skipped
7. **Risks introduced**
8. **Remaining work**

---

## §C — Audit

**A. Scope and evidence** — what was reviewed, at what widths, with what tools,
and what was excluded or unavailable.

**B. Executive summary** — overall state, biggest problems, biggest
opportunities, and the three things to do first. Written for someone who will
read only this section.

**C. What is working well** — specific components, patterns, and decisions worth
protecting.

**D. Prioritised findings**

| ID | Area | Finding | Evidence | Tier | Severity | User impact | Recommendation |
|---|---|---|---|---|---|---|---|

Max 12. If more were found, state the count and character of what was omitted.

**E. Page-by-page notes** — only for pages with findings. Purpose, what works,
problems, recommended changes.

**F. Component consistency** — repeated components that diverge, and how.

**G. Responsive summary** — behaviour by viewport range.

**H. Accessibility summary** — confirmed failures, likely failures needing manual
verification, best-practice improvements. Kept separate.

**I. Performance and technical summary** — measured findings vs. code-level risks
requiring profiling.

**J. Action plan** — immediate fixes, short-term improvements, structural work,
optional enhancements.

**K. Implementation order** — the safest, highest-value sequence, with reasoning.

**L. Improvement directions** — where requested. Recommended direction, one or
two alternatives, findings each addresses, techniques and why, staged plan,
accessibility/responsive/performance requirements, risks, effort, validation.
Separate corrections from enhancements from experiments.

**M. Follow-up observations** — out-of-scope issues noticed but not pursued.

---

## §D — New-work review

**A. Scope statement** — change set, baseline, primary scope, integration
surfaces, deliberate exclusions.

**B. Intended outcome** — requirement, expected value, acceptance criteria.

**C. Change and impact map** — files and systems changed, dependencies altered,
user flows affected, highest-risk integration points.

**D. What is working well.**

**E. Prioritised findings**

| ID | Changed area | Finding | Evidence | Tier | Impact radius | Severity | Required action |
|---|---|---|---|---|---|---|---|

**F. Regression matrix**

| Area | Previous behaviour | New behaviour | Risk | Verification | Result |
|---|---|---|---|---|---|

**G. Required before merge** — only genuine blockers.

**H. Follow-up improvements** — non-blocking debt and enhancements.

**I. Proposed next work wave** — where improvements are requested or justified.

**J. Release decision** — exactly one:

- **Approved** — safe to merge based on completed checks
- **Approved with follow-up** — safe, with recorded non-blocking work
- **Changes required before merge** — specific issues must be resolved first
- **Blocked** — critical risk, or insufficient evidence to approve

State the evidence behind the decision and name every check not completed. An
approval that hides missing checks is worse than a blocked review.

---

## §E — Future work plan

**A. Recommendation summary** — the capability, why it matters, the recommended
direction.

**B. Existing-product context** — patterns, workflows, constraints, and
integration points that shape the proposal.

**C. User and product definition** — users, problem, goals, tasks, entry points,
roles, data, success criteria.

**D. Proposed IA and user flows** — where it belongs and how users move through
it.

**E. Screen and state inventory** — pages, panels, components, dialogs, and
required states to design and build.

**F. Visual and interaction directions** — genuinely distinct options.

**G. Recommended direction** — and why it beats the alternatives.

**H. Technical blueprint** — routes, components, design-system changes, data,
state, permissions, dependencies, analytics, testing.

**I. Phased delivery plan** — sequence, dependencies, review points, completion
criteria.

**J. Open questions** — genuinely unresolved decisions, kept separate from
assumptions already made.

**K. Next build brief** — a concise, implementation-ready brief for the next
working session. This is the section that gets used most; make it self-contained.

---

## Closing block — every mode

End every response with:

1. What was reviewed or built
2. What changed
3. Files affected
4. Checks run — and checks *not* run
5. Remaining risks and unknowns
6. Recommended next step

Do not claim the work is accessible, responsive, performant, tested, or
production-ready without completed checks supporting it.
