# Mode C — Audit an Existing Interface

**Read first:** `evidence-protocol.md`.
**Read alongside:** the criteria files matching the requested audit type.

## 1. Set the scope

Agree what is being audited before starting: which routes, which audit types
(visual, UX, responsive, accessibility, performance, code), and what is
explicitly excluded. An unbounded audit produces breadth without depth.

State the scope in the report.

## 2. Gather evidence

Follow `evidence-protocol.md`. Capture screens across the viewport set, drive the
state matrix, run the automated checks, and do the keyboard pass. Run the build,
lint, and type check — a failing type check reframes the whole review.

Note which evidence you could not obtain. That belongs in the report too.

## 3. Review against criteria

Work through the criteria files relevant to the agreed scope. Use them as a
checklist for *looking*, not as a template for *writing* — the report contains
findings, not a walkthrough of every criterion.

Order of attention, when scope is broad:

1. Anything blocking task completion
2. Accessibility barriers
3. Responsive failures at common widths
4. Hierarchy and clarity in the highest-traffic flows
5. Consistency and polish

## 4. Write findings

Every finding needs: stable ID, area, what is wrong, evidence and its tier, user
impact, severity, and a specific recommendation.

Two habits that separate a useful audit from a generic one:

- **Cite something.** A screenshot, a filename and line, a tool output. A finding
  with no evidence is an opinion.
- **Recommend something specific.** "Improve visual hierarchy" is not a
  recommendation. "Reduce the four competing headings on the dashboard to one
  page title at 24px and three section labels at 13px uppercase" is.

Maximum 12 findings (see SKILL.md). If you found more, say how many you omitted.

## 5. Identify what is working

Name specific components, patterns, and decisions worth protecting. This is not
politeness — it tells whoever implements the fixes what not to touch, and
prevents the common failure where a redesign silently regresses things nobody
complained about.

## 6. Improvement directions (when requested)

If the user wants directions rather than only findings, read the relevant
technique toolkit and produce two or three **genuinely distinct** options — not
three colour variations of one idea. Frame as:

- **Restrained refinement** — solves the findings with minimal disruption
- **Strong redesign** — restructures for a clearly better result
- **Experimental** — high-ambition, prototype first

Do not force all three when one answer is obviously correct. For each direction,
cover only the fields that apply from:

trigger (which finding or request) · problem · desired user outcome · concept ·
techniques and why each fits · integration with the existing system · responsive
behaviour · accessibility and reduced-motion plan · performance strategy ·
implementation stages · risks and dependencies · success criteria

If advanced technique would not solve the underlying problem, say so directly and
propose the structural, content, or interaction fix instead.

## Deliverable

See `output-formats.md` §C. Write it to `docs/audits/YYYY-MM-DD-<scope>.md`.
