"use client";

// StandardsTaggingPicker — the scoped, searchable dialog for tagging a lesson's
// curriculum standards.
//
// WHAT IT DOES. A portaled modal that searches the 1.11M-row catalog SERVER-SIDE
// (POST /api/standards/search) constrained to the teacher's EFFECTIVE framework
// set (school default ± personal overrides) — a teacher only ever sees and tags
// standards from their own frameworks. Filters: framework (their effective set),
// then Stage / Subject / Strand (the band_label segments, from the facets route),
// then free-text over code OR description. Results toggle into a working
// selection shown as a chip tray; "Done" hands the host the final CODE list plus
// a code→description map so it can persist (editLesson) and describe instantly
// (mergeStandards) with no reload.
//
// CONTROLLED + HOST-OWNED PERSISTENCE. The dialog never writes the lesson or the
// store; it returns the result via onApply. The host owns editLesson +
// mergeStandards (see the /daily PlanningTabs standards pane). Codes are treated
// as OPAQUE strings (the catalog uses a non-ASCII hyphen U+2010 in some codes —
// no normalisation).
//
// Accessibility (mirrors AddUnitDialog): role="dialog" + aria-modal, Esc + scrim
// close, focus trap, body-scroll lock, first-field autofocus, ≥44px targets.
// Tokens only; six themes; three viewport tiers.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Badge, Button, Tooltip } from "@/components/ui";
import { formatStandardCode } from "@/lib/mock/standards";
import type { FrameworkSummary } from "@/lib/standards/queries";
import type { StandardsMap } from "@/lib/types";
import styles from "./StandardsTaggingPicker.module.css";

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const SEARCH_DEBOUNCE_MS = 250;
const PAGE_SIZE = 30;

/** One catalog hit from the search route. */
interface StandardHit {
  id: string;
  frameworkId: string;
  shortCode: string | null;
  code: string;
  description: string | null;
  bandLabel: string | null;
}

/** A standard held in the working selection. `id` is the REAL `standards.id`
 *  uuid (known for searched results via the hit, and for seeded chips via
 *  initialIds) — carried so persistence is exact and collision-free. null when
 *  unknown (a seeded code with no initialId — only under the mock flag). */
interface PickedStandard {
  code: string;
  description: string;
  frameworkId: string | null;
  id: string | null;
}

export interface StandardsTaggingPickerProps {
  open: boolean;
  /** The lesson's current standard codes (seed the selection). */
  initialCodes: string[];
  /** The real `standards.id` uuids for `initialCodes`, index-aligned, so already-
   *  tagged chips carry their exact identity (collision-safe). Optional — absent
   *  under the mock flag, in which case persistence falls back to code resolution. */
  initialIds?: string[];
  /** Known descriptions for the initial codes (from the store's describeStandard),
   *  so already-tagged chips read with wording even before a search. */
  initialDescriptions?: StandardsMap;
  onClose: () => void;
  /** Hand the host the final code list (selection order), a code→description map,
   *  and the index-aligned real `standards.id` uuids — or null for `ids` when any
   *  selected code's id is unknown (the host then persists by code instead). */
  onApply: (
    codes: string[],
    descriptions: StandardsMap,
    ids: string[] | null,
  ) => void;
}

interface FrameworksPayload {
  frameworks: FrameworkSummary[];
  effectiveIds: string[];
  /** True when the caller configured nothing and `effectiveIds` is the featured
   *  fallback — the picker then nudges them to narrow it in Settings. */
  usingDefault?: boolean;
}

interface FacetsPayload {
  stages: string[];
  subjects: string[];
  strands: string[];
}

export function StandardsTaggingPicker({
  open,
  initialCodes,
  initialIds,
  initialDescriptions,
  onClose,
  onApply,
}: StandardsTaggingPickerProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // Monotonic id of the latest search request; a slower earlier response whose
  // id is stale is ignored so it can't overwrite newer results (M1 race fix).
  const searchSeqRef = useRef(0);

  // ── Framework catalog (effective set) — loaded once on first open ────────
  const [frameworks, setFrameworks] = useState<FrameworkSummary[] | null>(null);
  const [effectiveIds, setEffectiveIds] = useState<string[]>([]);
  const [usingDefault, setUsingDefault] = useState(false);
  const [catalogError, setCatalogError] = useState(false);

  // ── Filters ─────────────────────────────────────────────────────────────
  const [frameworkFilter, setFrameworkFilter] = useState<string>(""); // "" = all effective
  const [stage, setStage] = useState("");
  const [subject, setSubject] = useState("");
  const [strand, setStrand] = useState("");
  const [query, setQuery] = useState("");
  const [facets, setFacets] = useState<FacetsPayload>({
    stages: [],
    subjects: [],
    strands: [],
  });

  // ── Results ───────────────────────────────────────────────────────────────
  const [results, setResults] = useState<StandardHit[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);

  // ── Working selection (code → picked) ─────────────────────────────────────
  const [picked, setPicked] = useState<Map<string, PickedStandard>>(new Map());

  // The effective frameworks for the filter dropdown (featured first, then name).
  const effectiveFrameworks = useMemo(() => {
    if (!frameworks) return [];
    const eff = new Set(effectiveIds);
    return frameworks
      .filter((f) => eff.has(f.id))
      .sort((a, b) => {
        if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [frameworks, effectiveIds]);

  // ── Seed selection + reset filters whenever the dialog opens ──────────────
  useEffect(() => {
    if (!open) return;
    const seed = new Map<string, PickedStandard>();
    initialCodes.forEach((code, i) => {
      if (typeof code !== "string" || code.length === 0) return;
      seed.set(code, {
        code,
        description: initialDescriptions?.[code] ?? code,
        frameworkId: null,
        // The real uuid for this already-tagged code (index-aligned), so a kept
        // chip persists by its exact id rather than an ambiguous code re-resolve.
        id: initialIds?.[i] ?? null,
      });
    });
    setPicked(seed);
    setFrameworkFilter("");
    setStage("");
    setSubject("");
    setStrand("");
    setQuery("");
    setResults([]);
    setHasMore(false);
    setSearchError(false);
    requestAnimationFrame(() => searchRef.current?.focus());
    // initialCodes/initialDescriptions are captured at open; intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Load the framework catalog once on first open ─────────────────────────
  useEffect(() => {
    if (!open || frameworks !== null) return;
    let alive = true;
    fetch("/api/standards/frameworks")
      .then((r) => r.json())
      .then((d: FrameworksPayload) => {
        if (!alive) return;
        setFrameworks(Array.isArray(d.frameworks) ? d.frameworks : []);
        setEffectiveIds(Array.isArray(d.effectiveIds) ? d.effectiveIds : []);
        setUsingDefault(d.usingDefault === true);
      })
      .catch(() => {
        if (alive) {
          setFrameworks([]);
          setCatalogError(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [open, frameworks]);

  // ── Load facets when the framework filter changes (scoped to it) ──────────
  useEffect(() => {
    if (!open) return;
    let alive = true;
    const qs = frameworkFilter ? `?frameworkIds=${frameworkFilter}` : "";
    fetch(`/api/standards/facets${qs}`)
      .then((r) => r.json())
      .then((d: FacetsPayload) => {
        if (!alive) return;
        setFacets({
          stages: Array.isArray(d.stages) ? d.stages : [],
          subjects: Array.isArray(d.subjects) ? d.subjects : [],
          strands: Array.isArray(d.strands) ? d.strands : [],
        });
      })
      .catch(() => {
        if (alive) setFacets({ stages: [], subjects: [], strands: [] });
      });
    return () => {
      alive = false;
    };
  }, [open, frameworkFilter]);

  // A segment filter no longer offered by the new framework scope is cleared.
  useEffect(() => {
    if (stage && !facets.stages.includes(stage)) setStage("");
    if (subject && !facets.subjects.includes(subject)) setSubject("");
    if (strand && !facets.strands.includes(strand)) setStrand("");
  }, [facets, stage, subject, strand]);

  // ── Run the search (debounced) whenever a filter changes ──────────────────
  const runSearch = useCallback(
    async (offset: number, append: boolean) => {
      const seq = ++searchSeqRef.current;
      const isStale = (): boolean => searchSeqRef.current !== seq;
      setLoading(true);
      setSearchError(false);
      try {
        const res = await fetch("/api/standards/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            frameworkIds: frameworkFilter ? [frameworkFilter] : undefined,
            stage: stage || undefined,
            subject: subject || undefined,
            strand: strand || undefined,
            q: query.trim() || undefined,
            limit: PAGE_SIZE,
            offset,
          }),
        });
        const d = (await res.json()) as {
          rows?: StandardHit[];
          hasMore?: boolean;
          error?: string;
        };
        // A newer search superseded this one — drop the response entirely so an
        // out-of-order arrival can't show results for a stale filter set.
        if (isStale()) return;
        const rows = Array.isArray(d.rows) ? d.rows : [];
        setResults((prev) => (append ? [...prev, ...rows] : rows));
        setHasMore(d.hasMore === true);
        if (d.error) setSearchError(true);
      } catch {
        if (isStale()) return;
        if (!append) setResults([]);
        setSearchError(true);
      } finally {
        if (!isStale()) setLoading(false);
      }
    },
    [frameworkFilter, stage, subject, strand, query],
  );

  // Debounce the first page; effective-set absence short-circuits to empty.
  useEffect(() => {
    if (!open) return;
    if (effectiveIds.length === 0) {
      setResults([]);
      setHasMore(false);
      return;
    }
    const t = setTimeout(() => void runSearch(0, false), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [open, effectiveIds.length, runSearch]);

  // ── Selection toggle ──────────────────────────────────────────────────────
  const toggle = useCallback((hit: StandardHit) => {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(hit.code)) {
        next.delete(hit.code);
      } else {
        next.set(hit.code, {
          code: hit.code,
          description: hit.description ?? hit.code,
          frameworkId: hit.frameworkId,
          id: hit.id, // the REAL standards.id — exact, collision-free persistence
        });
      }
      return next;
    });
  }, []);

  const removeCode = useCallback((code: string) => {
    setPicked((prev) => {
      if (!prev.has(code)) return prev;
      const next = new Map(prev);
      next.delete(code);
      return next;
    });
  }, []);

  // ── Body-scroll lock + Esc/Tab trap ───────────────────────────────────────
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const els = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((el) => !el.hasAttribute("aria-hidden") || el.tabIndex >= 0);
        if (els.length === 0) return;
        const first = els[0];
        const last = els[els.length - 1];
        const active = document.activeElement;
        if (e.shiftKey) {
          if (active === first || !dialogRef.current.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose],
  );

  const handleApply = useCallback(() => {
    const codes: string[] = [];
    const ids: string[] = [];
    const descriptions: StandardsMap = {};
    let everyIdKnown = true;
    for (const [code, p] of picked) {
      codes.push(code);
      descriptions[code] = p.description;
      if (p.id) ids.push(p.id);
      else everyIdKnown = false;
    }
    // Persist by exact id ONLY when every selected code has a known uuid
    // (index-aligned with `codes`); otherwise hand back null and let the host
    // fall back to code resolution (mock flag / a chip seeded without an id).
    onApply(codes, descriptions, everyIdKnown ? ids : null);
    onClose();
  }, [picked, onApply, onClose]);

  if (!open || typeof document === "undefined") return null;

  const noFrameworks = frameworks !== null && effectiveFrameworks.length === 0;
  const selectedCount = picked.size;

  return createPortal(
    <div className={styles.scrim} onClick={onClose} aria-hidden="true">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="standards-picker-title"
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <h2 id="standards-picker-title" className={styles.title}>
              Tag standards
            </h2>
            <p className={styles.subtitle}>
              Search within your frameworks. Set which frameworks you use in
              Settings → Standards.
            </p>
          </div>
          <Tooltip content="Close without applying changes" side="bottom">
            <button
              type="button"
              className={styles.closeBtn}
              aria-label="Close standards picker"
              onClick={onClose}
              title="Close without applying changes"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </Tooltip>
        </header>

        {noFrameworks ? (
          <div className={styles.bodyEmpty}>
            <p className={styles.emptyTitle}>No frameworks selected yet</p>
            <p className={styles.emptyHint}>
              {catalogError
                ? "We couldn’t load your frameworks right now. Try again, or set them in Settings → Standards."
                : "Choose the curriculum frameworks you teach in Settings → Standards, then come back to tag lessons."}
            </p>
            <Link
              href="/settings/standards"
              className={`${styles.emptyAction} cp-focusable`}
              onClick={onClose}
            >
              Choose your frameworks
            </Link>
          </div>
        ) : (
          <>
            {/* Fallback nudge: shown only when the teacher has configured nothing
                and is searching the major frameworks by default, so they know they
                can narrow the scope to just what they teach. */}
            {usingDefault && (
              <p className={styles.defaultHint}>
                Showing the major frameworks.{" "}
                <Link
                  href="/settings/standards"
                  className={styles.defaultHintLink}
                  onClick={onClose}
                >
                  Pick the ones you teach
                </Link>{" "}
                in Settings to narrow these.
              </p>
            )}

            {/* Filters */}
            <div className={styles.filters}>
              <div className={styles.filterRow}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Framework</span>
                  <select
                    className={`${styles.select} cp-focusable`}
                    value={frameworkFilter}
                    onChange={(e) => setFrameworkFilter(e.target.value)}
                    aria-label="Filter by framework"
                  >
                    <option value="">All my frameworks</option>
                    {effectiveFrameworks.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name} ({f.shortCode})
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className={styles.filterRow}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Stage</span>
                  <select
                    className={`${styles.select} cp-focusable`}
                    value={stage}
                    onChange={(e) => setStage(e.target.value)}
                    disabled={facets.stages.length === 0}
                    aria-label="Filter by stage or grade"
                  >
                    <option value="">Any stage</option>
                    {facets.stages.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Subject</span>
                  <select
                    className={`${styles.select} cp-focusable`}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    disabled={facets.subjects.length === 0}
                    aria-label="Filter by subject"
                  >
                    <option value="">Any subject</option>
                    {facets.subjects.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Strand</span>
                  <select
                    className={`${styles.select} cp-focusable`}
                    value={strand}
                    onChange={(e) => setStrand(e.target.value)}
                    disabled={facets.strands.length === 0}
                    aria-label="Filter by strand"
                  >
                    <option value="">Any strand</option>
                    {facets.strands.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <input
                ref={searchRef}
                type="search"
                className={`${styles.search} cp-focusable`}
                placeholder="Search by code or wording…"
                aria-label="Search standards by code or wording"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            {/* Selected tray */}
            {selectedCount > 0 && (
              <div className={styles.tray} aria-label="Selected standards">
                <span className={styles.trayLabel}>
                  <Badge variant="info" size="sm">
                    {selectedCount} selected
                  </Badge>
                </span>
                <ul className={styles.trayList}>
                  {[...picked.values()].map((p) => (
                    <li key={p.code} className={styles.trayChip}>
                      <Tooltip content={p.description} side="top">
                        <span className={`cp-mono ${styles.trayCode}`}>
                          {formatStandardCode(p.code)}
                        </span>
                      </Tooltip>
                      <button
                        type="button"
                        className={`cp-focusable ${styles.trayRemove}`}
                        onClick={() => removeCode(p.code)}
                        aria-label={`Remove ${formatStandardCode(p.code)}`}
                        title={`Remove ${formatStandardCode(p.code)}`}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M1.5 1.5L8.5 8.5M8.5 1.5L1.5 8.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Results */}
            <div className={styles.results}>
              {loading && results.length === 0 ? (
                <p className={styles.resultsNote}>Searching…</p>
              ) : searchError ? (
                <p className={styles.resultsNote}>
                  Something went wrong searching. Adjust a filter and try again.
                </p>
              ) : results.length === 0 ? (
                <p className={styles.resultsNote}>
                  No standards match these filters. Try a broader search.
                </p>
              ) : (
                <ul className={styles.resultsList} role="listbox" aria-multiselectable="true">
                  {results.map((hit) => {
                    const on = picked.has(hit.code);
                    return (
                      <li key={hit.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={on}
                          className={`${styles.result} ${on ? styles.resultOn : ""} cp-focusable`}
                          onClick={() => toggle(hit)}
                        >
                          <span
                            className={styles.resultCheck}
                            aria-hidden
                            data-checked={on}
                          />
                          <span className={styles.resultText}>
                            <span className={styles.resultTop}>
                              <span className={`cp-mono ${styles.resultCode}`}>
                                {formatStandardCode(hit.code)}
                              </span>
                              {hit.shortCode && (
                                <span className={styles.resultFramework}>
                                  {hit.shortCode}
                                </span>
                              )}
                            </span>
                            {hit.description && (
                              <span className={styles.resultDesc}>
                                {hit.description}
                              </span>
                            )}
                            {hit.bandLabel && (
                              <span className={styles.resultBand}>
                                {hit.bandLabel}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              {hasMore && !loading && (
                <button
                  type="button"
                  className={`${styles.loadMore} cp-focusable`}
                  onClick={() => void runSearch(results.length, true)}
                >
                  Load more
                </button>
              )}
              {loading && results.length > 0 && (
                <p className={styles.resultsNote}>Loading…</p>
              )}
            </div>
          </>
        )}

        {/* Actions. When the teacher has NO frameworks selected, "Done" is
            disabled: applying would resolve every code to nothing and silently
            wipe the lesson's existing tags (H1). They must pick frameworks in
            Settings → Standards first; Cancel still closes harmlessly. */}
        <div className={styles.actions}>
          <Button variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleApply}
            disabled={noFrameworks}
            tooltip={
              noFrameworks
                ? "Select your frameworks in Settings → Standards before tagging"
                : "Apply these standards to the lesson"
            }
          >
            {selectedCount > 0 ? `Done · ${selectedCount}` : "Done"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
