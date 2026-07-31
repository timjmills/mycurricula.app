# Project Context

Copy to `docs/project-context.md` and fill in. Filled once per project, read at
the start of every design-audit session. Delete lines that do not apply — a file
of blanks is worse than a short file.

## Product

- **Product:**
- **What it does, in one sentence:**
- **Primary users:**
- **Primary user tasks:**
- **Surfaces:** (application / marketing site / both — determines which technique
  toolkit applies)

## Stack

- **Framework:**
- **Styling:** (Tailwind, CSS modules, styled-components, etc.)
- **Component library:**
- **State / data:**
- **Animation and DnD libraries:**
- **Backend / data layer:**
- **Hosting:**

## Design system

- **Token source:** (file path)
- **Type scale:**
- **Spacing scale:**
- **Colour roles:** (primary, surface levels, semantic states)
- **Radius / elevation conventions:**
- **Motion conventions:** (standard duration and easing)
- **Icon set:**
- **Dark mode:** supported / not supported

## Targets

- **Browser support:**
- **Accessibility target:** (e.g. WCAG 2.2 AA)
- **Performance budget:**
- **Viewports that matter most:**
- **RTL required:** yes / no
- **Print or PDF output:** yes / no — where
- **Offline behaviour:**
- **Localisation:**

## Commands

```bash
# dev server
npm run dev              # port:

# checks
npm run build
npm run lint
npx tsc --noEmit
npm test
```

## Conventions and constraints

- **Component location and naming:**
- **Files that must not be modified without discussion:**
- **Known technical debt to work around rather than fix:**
- **Areas permanently out of scope:**

## Product-specific review criteria

Things a generic audit would miss. Examples:

- dense grid or table ergonomics that matter more than visual polish
- drag-and-drop affordances and their keyboard equivalents
- keyboard-first operation for power users
- unsaved-state and autosave behaviour
- print / export fidelity
- unusual calendar, scheduling, or locale rules
- role- or permission-dependent views that must be checked separately

## Current design debt

Screens known to need work, so an audit does not spend its finding budget
re-reporting them.

| Screen / area | Known issue | Deliberate for now? |
|---|---|---|
