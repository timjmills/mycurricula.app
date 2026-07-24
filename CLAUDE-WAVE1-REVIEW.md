# CLAUDE-WAVE1-REVIEW.md — Independent Code-Review-Gate pass (§4a substitute, REVIEW 2)

**Wave:** v2 Wave 1 — docs-only rewrite to the v2 design contract.
**Branch / commit:** `claude/v2-wave1-docs` @ `773f67d` ("docs(v2 Wave 1): rewrite project docs to the v2 design contract").
**Diff range:** `master..claude/v2-wave1-docs` — **exactly 4 files, all `M`**: `AGENTS.md`, `BUILD_STANDARD.md`, `CLAUDE.md`, `Documents/Project Files/5.16.26 planning_document.md`. Zero app code.
**Source of truth:** v2 handoff `Documents/Claude Design/6.24.26 design_handoff_v2_site/design-system/` (`V2 Framework.md`, `colors_and_type.css`, `themes.css`, `modes.css`, `styles.css`) + `origin/claude/v2-merged-plan:docs/v2-rebuild/CANONICAL-MERGED-PLAN.md`.

**Method.** On this cloud-style docs wave the primary `claude -p` CLI was unavailable (ConnectionRefused — see the prior stub this file replaces), so the §4a-substitute review ran as an **agent team** of three independent reviewers that did NOT author the docs — DesignFidelity, GovernanceGate, ConsistencyCheck — each in the strict-skeptical Senior-Security-&-QA persona, every claim verified against the handoff (NOT trusting the docs). The orchestrator (this session) independently re-verified the highest-consequence + every Medium+ structural finding before adjudicating, and **cross-referenced the prior blocked attempt's findings** (folded in as M6-corroboration and A6). Codex DID run as REVIEW 1 (`CODEX-WAVE1-REVIEW.md`); this file is REVIEW 2. The sandbox was never weakened; no source file was modified.

---

## Verdict: **GO-WITH-CHANGES**

The wave is substantively sound and the load-bearing contracts are faithful to the handoff. No Critical; no security/logic/data risk (docs-only). The §4a/§4b gates, folder/naming conventions, and the forking value space are **byte-identical to master / verified against the handoff**. The blocking items are localized **doc self-contradictions, broken section-pointers, and design-contract wording errors** — all trivial text edits, but real, and they must be fixed before these docs serve as the Wave-2 implementation contract.

---

## Consolidated findings (orchestrator-adjudicated severity)

### MUST-FIX before Wave 2 (the docs are the contract Wave 2 builds from)

| # | Sev | File:loc | Problem | Fix | Source |
|---|-----|----------|---------|-----|--------|
| M1 | High | `CLAUDE.md:775` (§8 phasing reminder) | Self-contradiction: lists Phase 1A as "Weekly/Daily/**Subject**/Year/Schedule/Catch-up" — naming `/subject` a live shipped view, while the same file's §1 (line 49) + route-alias table (line 822) say `/subject` is "a legacy redirect to `/year` (already retired on master)." Exactly the stale residue this wave was meant to remove. | Drop "Subject" from the list, or annotate "(folded into Year)." | ConsistencyCheck |
| M2 | Medium | `CLAUDE.md:291` (§4 Buttons bullet) | Broken cross-ref: "See **BUILD_STANDARD.md §7a** (Buttons & pills)." The rewritten BUILD_STANDARD has no §7a — Buttons is now **§8** (§7 = "Color, type & tokens"). | `§7a` → `§8`. | ConsistencyCheck |
| M3 | Medium | `BUILD_STANDARD.md:474` (§11 prompt template) | Broken pointer: "see **§12** surface-theming." §12 is "The forking model"; the surface-theming tier table is **§15** (line 640). | `§12` → `§15`. | ConsistencyCheck |
| M4 | Medium | `CLAUDE.md:777` (§8 phasing reminder) | Stale v1 residue: "**Vivid theme as default**." The rewrite drops the entire `data-style` axis (§4) and §1 sets the new default to "Theme Clear · Frame A (Calm Glass)." | "Vivid theme as default" → "Theme Clear / Frame A default" (or delete). | ConsistencyCheck |
| M5 | Medium | `BUILD_STANDARD.md:47`, `CLAUDE.md:195`, `AGENTS.md:80`, `planning:1941` (data-tone derivation) | The derived-tone summary "Photo **Dim/Normal → dark**" contradicts the adjacent rule that `normal` is the **auto** mode (samples photo luminance). Coded literally, light photos in Normal force dark-tone/white text → WCAG AA contrast failure. Canonical plan + `modes.css` confirm Normal = sampled. | "Dim forces dark; Bright forces light; **Normal samples photo luminance** to derive light/dark tone." | Codex #2 (validated) |
| M6 | Medium | `BUILD_STANDARD.md:37`, `CLAUDE.md:179`, `AGENTS.md:75`, `planning:1939` (Night) | Wording "`night` is now the dark **tone**, not a peer theme" risks a Wave-2 migration/CHECK constraint dropping `night` from the `data-theme` enum (stranding persisted Night users). Handoff `V2 Framework.md:575`: "**Night is the only dark theme** and forces dark tone." Night must stay a `data-theme` value AND force `data-tone=dark`. (Severity reduced from Codex's High: the docs DO list `night` in the `data-theme` enum in all four places and DesignFidelity confirmed the decomposition is stated correctly — but the "not a peer theme" phrasing is genuinely misleading. **Independently corroborated by the prior blocked attempt.**) | "Night is a `data-theme` value that forces `data-tone="dark"`; dark rendering branches on `data-tone`." | Codex #1 + prior attempt (validated) |

### SHOULD-FIX before the button/overlay waves (not blocking the docs wave)

| # | Sev | File:loc | Problem | Fix | Source |
|---|-----|----------|---------|-----|--------|
| S1 | Medium | `BUILD_STANDARD.md:§8` + `CLAUDE.md:291` (button guidance) | The carried-over v1 rule "never a colored-glow resting shadow / route through `--chrome-accent-*`" conflicts with the v2 handoff (`V2 Framework.md:404` "Primary = `--accent` fill + colored shadow"; `:285` "colored `--sh-brand`/`--sh-honey` for primary actions") — AND with BUILD_STANDARD's own §5 Elevation ("colored `--sh-brand`/`--sh-honey` rationed to primary actions"). | KEEP the `.btn.<variant>` double-class specificity fix (still a valid code rule). UPDATE the visual guidance to v2: primary = `--accent` fill + rationed colored shadow. | Codex #4 (validated) |
| S2 | Low–Med | `BUILD_STANDARD.md:9-13/674-677`; `CLAUDE.md:§8 (line 796)` | Doc-authority wording undercuts the handoff: "When this doc and the code disagree, the **code is the truth**" + §8 "BUILD_STANDARD … the **only** authoritative visual contract." Both read against "the handoff wins for look/behavior." | Carve out: "the handoff wins for v2 look/behavior (fix the code to match); code is the truth for current-state implementation facts. BUILD_STANDARD is the authoritative *checked-in* contract; the handoff is its upstream origin." | Codex #3 + ConsistencyCheck Low (validated) |

### ADVISORY / non-blocking (porter notes — optional, improve Wave-2 ergonomics)

| # | Sev | File:loc | Note | Source |
|---|-----|----------|------|--------|
| A1 | Low | axis tables (all 4 docs) | Handoff CSS still emits `data-theme="normal"` / `data-bg="ambient"`; the docs' forward values are `clear` / `wash`. Add a porter note: "rename `[data-theme=normal]`→`clear`, `[data-bg=ambient]`→`wash` when porting `themes.css`/`modes.css`, or every theme dead-styles." Already disclosed in BUILD_STANDARD §14; this hardens it. | DesignFidelity |
| A2 | Low | `BUILD_STANDARD.md:488` (Recipe A rail) | States photo-card rail `border-left: 4px`; handoff `modes.css` is itself inconsistent (3px badge / 4px subject-rail / 5px `.lane`). Optional note "(rail 3–5px per element/register; see modes.css §2)." Ambiguity originates in the handoff. | DesignFidelity |
| A3 | Low | `CLAUDE.md:38`, `AGENTS.md:33` | `/planner` is labeled "the v2 planning **home** / hub surface." Canonical plan is emphatic the default landing route is **`/weekly`, not `/home`/hub**. Neither doc affirmatively pins `/weekly`. Add: "`/planner` is the planning hub — NOT the default route; the default landing route remains `/weekly`." | GovernanceGate |
| A4 | Low | `CLAUDE.md:776` (§8) | "Master/Personal toggle" wording lags the §2 relabel to "Personal \| Team Curriculum" (defensible — internal names stay master/core — but inconsistent). | ConsistencyCheck |
| A5 | Low | `planning_document.md:§6.1` | Stale subject palette ("Math blue, Reading green, …") contradicts the v2 map asserted in the same file's §3/§6 banners. Covered by the "SUPERSEDED BY v2" banner; this is the explicitly-demoted reference doc, so acceptable as-is; optionally strike. | ConsistencyCheck |
| A6 | Low–Med | `planning_document.md:3122, 3383` | Stale "Master-mode **requires confirmation**" language (Phase-2 acceptance + glossary "Editing master: Requires confirmation button") sits **outside** the v2 supersession banners and contradicts the forking no-confirm-dialog rule — AND the planning doc's *own* line 3303 ("**Resolved.** … No confirm dialog"). Risk: an implementer rebuilds a Master-mode confirm gate. Mitigated (demoted reference doc; CLAUDE.md authoritative + emphatic; the doc self-resolves at 3303). | Strike "Requires confirmation button" / "Now editing master confirmation," or add a supersession pointer to the no-confirm Team Curriculum + pink-glow model. | Prior blocked-attempt sub-agent (validated) |

### DISMISSED (false positive — orchestrator-validated)

| # | Claim | Why dismissed |
|---|-------|---------------|
| D1 | ConsistencyCheck [Medium]: BUILD_STANDARD §15.7 + CLAUDE §4 cite a "SURFACE THEMING CONTRACT" rule + a class registry (`.hub-modal`, `.cfg-modal`, `.set-panel`, `.td-dock`, …) in `themes.css`, but "grepping the cited `design-system/themes.css` finds neither." | **The cited content EXISTS in the cited file.** Direct grep of `origin/claude/design-handoff-v2-site:…/design-system/themes.css`: the rule is at **line 99** ("SURFACE THEMING CONTRACT — overlays carry the active theme") and the full class registry (`.hub-modal, .cfg-modal, .cu-modal, .ue-modal, .set-panel, .ll-dlg, .ll-overlay .ll-root, .td-dock`) at **lines 108–109**; line 105 notes "Mirrored in design/V2 Design System.html." The docs' reference is grounded and correct. No action. |

---

## Verified CORRECT (independently re-checked — no action)

- **Subject→slot map** `math1·ufli2·writing5·grammar7·spelling9·reading10·sel12·explorers13` — identical across all 4 docs AND matches handoff `V2 Framework.md:186-193` exactly. **Zero off-by-one** (the highest-consequence, team-wide-color check). Slot colours (gold/apricot/pink/purple/periwinkle/blue/teal/green) match `colors_and_type.css` comments byte-for-byte. Confirmed by all 3 reviewers + orchestrator.
- **Pink Team caution glow `#E8179B` = `--subj-5-bright`** — exact match `colors_and_type.css:49`; selector `[data-mode="team"]` grounded in the handoff mockup (`home.css`/`app.jsx`). Confirmed by GovernanceGate + orchestrator.
- **§4a Code Review Gate + §4b Live QA Audit Gate** (CLAUDE.md) and their **AGENTS.md mirror** — **byte-identical to master** (GovernanceGate extracted + `diff` exit 0; orchestrator diff-grep for gate keywords = empty). No sandbox rule, Codex-invocation rule, or failure protocol weakened. Block shifted +100 lines solely from the new §4 appearance-engine subsection inserted earlier.
- **Folder conventions + naming rules (§3)** — byte-identical to master.
- **No app code** — diff = 4 docs (`M` only); code-file-extension scan over the diff = zero matches; no "change app code in Wave 1" directive.
- **Forking value space** — `editMode ∈ personal|master`, `SaveTarget ∈ personal|core` (internal, unchanged); UI relabel Master → "Team Curriculum"; completion never forks; no-confirm-dialog ("the glow IS the safety mechanism"); three-tier visual differentiation preserved; two-pulse-then-persist + reduced-motion-solid match handoff `home.css`. Verified against the handoff by GovernanceGate. (Note A6 — stale residue in the *demoted* planning doc, not in the authoritative docs.)
- **7 themes** (Clear · Night · Honey · Blossom · Mint · Sky · Off/Photo) — consistent across all 4 docs; matches `V2 Framework.md` §7 + canonical plan ("7-theme set, no 8th theme"). `clear`-vs-`normal` legacy gap correctly disclosed.
- **Axis vocabulary** `data-frame|glass|bg|theme|dim|(derived)tone` + `canvas/veil/zoom` — every axis name + value set verified against `modes.css`/`themes.css`. None misnamed/invented.
- **RULE #1 "NO SHARP CORNERS, EVER"** — verbatim vs `V2 Framework.md:280-281`. **Both glass recipes** (Frosted-on-photo, Liquid-v5-on-wash, dark+white registers) — checked value-by-value vs `modes.css`, exact match. **Legibility contract** ("branch on `data-tone`, never the theme") — faithful.
- **Additive token migration** — all 4 docs say "ADDITIVE … do not delete a v1 tier"; grep for "replace :root"/"overwrite"/"wholesale" = zero destructive instructions. v1-only tiers enumerated as preserved.
- **`/subject` retired** + **base = clean master** + **`NEXT_PUBLIC_V2` flag-gating** — honored consistently (the §8-phasing slip M1 is the lone exception).

---

## Per-reviewer summary

- **DesignFidelity** — `NO BLOCKING ISSUES (this slice)`. 2 Low (A1, A2), both tracing to pre-existing contradictions inside the handoff itself, not doc errors. Subject map clean, both glass recipes value-exact, additive tokens confirmed.
- **GovernanceGate** — `NO BLOCKING ISSUES (this slice)`. Gates byte-identical to master (diff exit 0); folder/naming intact; docs-only confirmed at the Critical bar; forking value space verified against the handoff. 1 Low (A3, default-route clarity).
- **ConsistencyCheck** — `BLOCKING: 5 Medium+` (2 High, 3 Medium). Orchestrator adjudication: 4 confirmed (M1, M2, M3, M4) + 1 **dismissed as a false positive** (D1). Plus 2 Low (A4, A5).
- **Codex (REVIEW 1)** — 2 High + 2 Medium, no Critical. Orchestrator adjudication: all 4 legitimate; the 2 Highs reduced to Medium with rationale (M5, M6); the 2 Mediums kept as should-fix reconciliations (S1, S2).
- **Prior blocked attempt (stub)** — corroborated M6 (Night) and surfaced A6 (stale planning-doc master-confirm language). Folded in.

---

## Must-fix-before-Wave-2 checklist (the GO-WITH-CHANGES conditions)

1. **M1** — Remove `/subject` from the CLAUDE.md §8 phasing "shipped" list (self-contradiction with §1).
2. **M2** — CLAUDE.md:291 `§7a` → `§8`.
3. **M3** — BUILD_STANDARD.md:474 `§12` → `§15`.
4. **M4** — CLAUDE.md:777 drop "Vivid theme as default."
5. **M5** — Fix the data-tone derivation line: Normal = auto-luminance, not forced dark.
6. **M6** — Reword Night from "not a peer theme" to "a `data-theme` value that forces `data-tone=dark`."

Recommended in the same pass: **S1** (button visual guidance → v2 `--accent` + colored shadow, keep the specificity fix) and **S2** (doc-authority carve-out). Optional polish: **A1–A6**. All are doc-text edits; none touches code. No re-run of the gate is required once applied — these are mechanical corrections, not design changes.
