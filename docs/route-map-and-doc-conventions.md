# Route map, canonical names, and the audit-doc disclaimer

> Reference lookup, split out of `CLAUDE.md` §8 (2026-07-31) to keep the
> always-loaded policy file lean. Nothing here changed in the move — this is
> the same content, relocated. `CLAUDE.md` and `BUILD_STANDARD.md` remain the
> authoritative contracts.

## App name — canonical spelling

**`mycurricula.app`** (plural). The GitHub repo is `timjmills/mycurricula.app`
and the deployed Cloudflare custom domain is the same. Older docs that use the
singular `mycurriculum.app` predate the canonical name; treat those as
historical.

## Route aliases (planning-doc names vs. current routes)

The planning doc and some older artifacts name routes that have since been
renamed in the codebase. Older docs that say `/curriculum`, `/yearly`, or
`/subject` refer to the same surfaces; v2 added the Planner Hub and Resource Wall.

| Planning-doc / older name | Current route | v2 console / tab label |
| --- | --- | --- |
| `/curriculum`, `/subject` (→ `/subject/<id>`) | `/year` (`/subject` is a legacy redirect to `/year`) | "Year" (the v2 "Curricular plan") |
| `/yearly` | `/year` | "Year" |
| (the unit/lesson planner) | Lesson Plan | "Lesson Plan" |
| (the projection board) | Teach | "Teach" |
| (new in v2) | `/planner` | "Planner Hub" |
| (new in v2 — resource board) | `/post` | "Resource Wall" |

## Audit-doc disclaimer

Every `docs/*audit*.md` and `docs/research-*.md` is a **dated snapshot**.
Findings, recommendations, and "open questions" recorded in those docs may
already be fixed, deferred, regressed, or superseded by later work. Each
audit doc carries a snapshot-disclaimer header noting its date. **Verify
against current code before treating any finding as open or any
recommendation as binding.** A quick check:

```
git log --oneline -- <relevant-file-path>
```

The canonical project guide for what's true today is **`CLAUDE.md`** plus
`BUILD_STANDARD.md`.
