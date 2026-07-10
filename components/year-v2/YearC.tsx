"use client";

// YearC — the /year COLOR frame (Wave 6). A subject "constellation": one
// cluster card per subject, each subject's units rendered as a chain of
// progress discs (solid = complete, ringed wash + percent = partial, faint
// wash = unstarted) joined by connector dashes.
//
// Ported from the legacy components/year/YearConstellation (W3.7) so the
// year-v2 module carries NO dependency on the legacy folder — the constellation
// source stays in place, untouched, for TimelineYear's now-dead internal color
// swap (see YearShell's dead-branch note). Two upgrades over the port:
//   1. a disc click opens the shared Unit Explorer modal (was: drill to unit
//      scope) — YearC is standalone, with no drill/scope dependency;
//   2. the cluster % + per-unit progress come from the shared lane derivation
//      (real taught/total), not a local recompute.
// Subject color arrives through the `.cp-subj.<cls>` cascade; the module CSS
// maps --clc → var(--c). Tone-aware; keyboard operable.

import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { Tooltip } from "@/components/ui";
import type { SubjectId } from "@/lib/types";
import type { YearSubjectLane } from "./YearShell";
import styles from "./YearC.module.css";

export interface YearCProps {
  lanes: YearSubjectLane[];
  onOpenUnit: (subjectId: SubjectId, unit: string) => void;
}

export function YearC({ lanes, onOpenUnit }: YearCProps): ReactNode {
  // ?subject= deep link — scroll the named subject's cluster into view + a
  // brief highlight, so the retired /subject/[slug] redirect stays meaningful
  // on the color frame. Applied once, when the cluster exists; reduced motion
  // respected. Mirrors YearA's deep-link effect.
  const clusterEls = useRef<Map<string, HTMLElement>>(new Map());
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || typeof window === "undefined") return;
    const param = new URLSearchParams(window.location.search).get("subject");
    if (!param) {
      deepLinkDone.current = true;
      return;
    }
    const el = clusterEls.current.get(param);
    if (!el) return; // wait for the cluster to render
    deepLinkDone.current = true;
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "center",
      inline: "nearest",
    });
    el.setAttribute("data-deeplink-focus", "");
    // Deliberately NOT cleared on cleanup: a re-render (or StrictMode's
    // mount→cleanup→mount) within the window would otherwise clear the timer
    // while the ref-guard blocks re-arming it, leaving the highlight stuck on.
    // Removing a stale attribute from a detached node is a harmless no-op.
    setTimeout(() => el.removeAttribute("data-deeplink-focus"), 2200);
  }, [lanes]);

  return (
    <div className={styles.grid} data-year-frame="color">
      {lanes.map(({ subject, units, hadUnits, pct }) => (
        <div
          key={subject.id}
          ref={(el) => {
            if (el) clusterEls.current.set(subject.id, el);
            else clusterEls.current.delete(subject.id);
          }}
          data-year-cluster={subject.id}
          // `.cp-subj.<id>` cascades --c/--cl/--cd; the module maps
          // --clc: var(--c) so every color-mix follows the live palette.
          className={`${styles.cluster} cp-subj ${subject.cls}`}
        >
          <div className={styles.clhead}>
            <span className={styles.glyph} aria-hidden="true">
              {subject.icon}
            </span>
            <span className={styles.nm}>{subject.name}</span>
            <span className={styles.pc}>{pct}%</span>
          </div>

          {units.length === 0 ? (
            <div className={styles.empty}>
              {hadUnits
                ? "No units match the current view."
                : "No units planned yet."}
            </div>
          ) : (
            <div className={styles.nodes}>
              {units.map((u, i) => {
                const progress = u.total > 0 ? u.done / u.total : 0;
                const complete = u.total > 0 && u.done === u.total;
                const partial = progress > 0 && progress < 1;
                const unitPct = Math.round(progress * 100);
                return (
                  <Fragment key={u.id}>
                    {i > 0 ? (
                      <span className={styles.link} aria-hidden="true" />
                    ) : null}
                    {/* String content mirrors to native title= automatically
                        (Tooltip primitive), covering the touch long-press
                        path per CLAUDE.md §4. */}
                    <Tooltip
                      content={`Open ${u.fullName} — ${unitPct}% taught · ${u.done}/${u.total} lessons`}
                      tooltipId="year-c-node"
                    >
                      <button
                        type="button"
                        className={styles.node}
                        onClick={() => onOpenUnit(subject.id, u.id)}
                      >
                        {/* Disc glyphs are decorative — the accessible name is
                            the label; the numbers live in the tooltip's
                            aria-describedby. */}
                        <span
                          className={`${styles.disc} ${
                            complete
                              ? styles.discDone
                              : partial
                                ? styles.discPartial
                                : styles.discTodo
                          }`}
                          aria-hidden="true"
                        >
                          {complete ? (
                            <span className={styles.check}>✓</span>
                          ) : partial ? (
                            <span className={styles.pctNum}>{unitPct}</span>
                          ) : null}
                        </span>
                        <span className={styles.nl}>{u.label}</span>
                      </button>
                    </Tooltip>
                  </Fragment>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
