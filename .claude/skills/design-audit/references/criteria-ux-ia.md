# Criteria — UX and Information Architecture

## Task-level review

Structure the UX review around tasks, not screens. For each significant user
task, document:

1. Goal — what the user is trying to accomplish
2. Current path — every step, click, and decision
3. Friction points — where they hesitate, backtrack, or guess
4. Unnecessary steps — what could be removed or defaulted
5. Missing information — what they need at each step but do not have
6. Recommended path — the revised sequence

Counting steps is useful but not sufficient. Three obvious steps beat one step
hidden behind a menu nobody opens.

## Navigation and orientation

- Are labels named for what users want, or for how the system is organised?
- Can the user always tell where they are within the structure?
- Are there competing navigation systems — a sidebar, a top bar, and breadcrumbs
  disagreeing about the hierarchy?
- Is depth justified? Every additional level costs discoverability.
- Do back, browser back, and in-app back all behave sensibly?

## Discoverability

- Functions buried behind hover, right-click, long-press, or nested menus with no
  visible entry point
- Features that exist but nobody finds, because the entry point is where the
  developer put it rather than where the task happens
- Controls placed far from the content they affect
- Progressive disclosure that hides something essential rather than something
  advanced

## Forms and input

- Labels always visible, not placeholder-only — placeholders vanish on focus,
  exactly when the user needs them
- Required vs. optional marked consistently
- Validation timing: on blur or submit, not on every keystroke while typing
- Errors placed next to the field, phrased as what to do rather than what went
  wrong
- Input types and autocomplete attributes correct, so mobile keyboards match
- Destructive actions confirmed, and the confirmation naming the specific thing
  being destroyed
- Work preserved on error, navigation, or refresh — losing a half-filled form is
  among the most damaging things an interface can do

## States and edge conditions

For every view, confirm the design covers: first use, empty, loading, partial
load, success, validation error, server error, offline, no permission,
read-only, disabled, unsaved changes, stale or conflicting data, no search
results, very long content, very short content, and large data volumes.

Empty states deserve particular attention — they are the first thing a new user
sees and are usually the least designed screen in the product. An empty state
should explain what belongs here and offer the action that fills it.

## Content and language

- Headings, labels, and buttons phrased in the user's vocabulary rather than the
  database's
- Button text naming the outcome ("Save changes") not the mechanism ("Submit")
- Error messages that say what to do next
- Terminology consistent across the product — one concept, one name
- Reading level and tone matched to the audience

## Mobile task completion

Not "does it fit on a phone" but "can the primary task be completed on a phone
without frustration". Check that dense tables, multi-column editors, drag
interactions, and keyboard-dependent flows have a genuine mobile path or an
honest statement that they are desktop-only.
