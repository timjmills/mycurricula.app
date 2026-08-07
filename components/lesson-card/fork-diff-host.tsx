"use client";

// fork-diff-host.tsx — the ONE always-mounted listener that makes the fork
// diff reachable on the v2 build (F2).
//
// ── THE BUG THIS FIXES ────────────────────────────────────────────────────
// <ForkDiffPanel> had no live host under NEXT_PUBLIC_V2 (default ON, in prod
// since 2026-07-23). Both documented entry points fell on the floor:
//
//   1. `/daily?lesson=<id>&compare=1` — the only reader of `compare` was
//      components/daily/LessonDetail.tsx:309, and LessonDetail is imported
//      ONLY by DailyViewV1 (:122). Under V2, app/(planner)/daily/page.tsx
//      renders <DailyView> (the day-v2 canvas), which never mounts
//      LessonDetail. Same for COMPARE_REQUEST_EVENT: its only listener was
//      LessonDetail.tsx:297.
//   2. The legacy <CompareToMaster> mount in weekly-lesson-card.tsx is gated
//      on the `"compare-master"` action, which nothing has fired since
//      context-menu.tsx:330-361 replaced that wiring with a self-contained
//      router.push + requestCompare().
//
// So the menu item navigated to /daily, the day surface stripped the query
// (DailyView.tsx:356 `router.replace("/daily")`), and nothing ever opened.
//
// ── THE SHAPE ─────────────────────────────────────────────────────────────
// One singleton in the planner layout rather than a prop threaded through
// Weekly, Day and Year. That is what context-menu.tsx:330-333 already
// promised — the compare item is "self-contained … so every host of this menu
// gets the diff for free" — and it keeps that promise true for hosts that do
// not exist yet. Precedent for a render-nothing singleton in this layout:
// UndoToastBridge, WriteFailureBridge, UnitWorkspaceProvider.
//
// Bundle cost is ZERO: lib/fork-diff and components/lesson-card/index.ts are
// both ALREADY reachable from app/(planner)/layout.tsx (via
// UnitWorkspaceProvider → UnitExplorer → lesson-plan-v2 → components/daily's
// barrel → LessonDetail), so nothing new joins the shared chunk. Measured on
// the module graph, not assumed — if that path is ever cut, re-measure before
// trusting this note.
//
// ── V2 ONLY, AND THAT IS LOAD-BEARING ─────────────────────────────────────
// The layout mounts this behind the same `V2` const the router half uses. On
// the flag-OFF build LessonDetail is live again and consumes BOTH the URL and
// the event itself, inline in the lesson body — which is what the item-01
// spec asks for. Mounting this unconditionally would give the v1 path TWO
// panels for one request.

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useAppState } from "@/lib/app-state";
import { usePlanner } from "@/lib/planner-store";
import {
  COMPARE_REQUEST_EVENT,
  canCompareWithTeam,
  type CompareRequestDetail,
} from "@/lib/fork-diff";
import { CompareToMaster } from "./compare-to-master";

export function ForkDiffHost(): ReactNode {
  const { lessons } = usePlanner();
  const { editMode } = useAppState();

  // `requested` is what someone ASKED for; `openId` is what actually passed
  // the gates. They are separate because a request routinely arrives BEFORE
  // the document does: on a cold deep link the store is still hydrating, so
  // the id resolves to nothing for seconds. Collapsing them would mean either
  // dropping the request (the deep link silently does nothing) or opening a
  // dialog around a lesson we have not read yet.
  const [requested, setRequested] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // ── WARM path — the card menu dispatches alongside its router.push ───────
  // Covers the case the push cannot: the target may already be the selected
  // lesson, and the App Router commits the URL only after the RSC round trip,
  // so reading window.location right after a push is racy (lib/fork-diff.ts
  // :135-145 records the reasoning).
  useEffect(() => {
    const onCompare = (e: Event): void => {
      const detail = (e as CustomEvent<CompareRequestDetail>).detail;
      if (typeof detail?.lessonId === "string") setRequested(detail.lessonId);
    };
    window.addEventListener(COMPARE_REQUEST_EVENT, onCompare);
    return () => window.removeEventListener(COMPARE_REQUEST_EVENT, onCompare);
  }, []);

  // ── COLD path — a deep link or refresh on ?lesson=<id>&compare=1 ─────────
  //
  // Read ONCE on mount, plus on popstate. Never on a dependency that changes
  // later, and that restraint is the whole trick: DailyView.tsx:356 strips the
  // entire query (`router.replace("/daily")`) as soon as its lesson seed
  // commits, so a re-reading effect would see the stripped URL and cancel a
  // request it had already accepted.
  //
  // The mount read wins that race by construction, not by luck: DailyView's
  // strip is gated on `seededFor === initialLessonId`, and `seededFor` is
  // STATE set by a different effect — so the strip cannot run before a second
  // render, while this runs in the first effect flush. (It also needs the
  // document, which on a cold load has not arrived yet.)
  //
  // popstate is authoritative in BOTH directions: the menu's push adds a
  // history entry, so Back returns to the same page WITHOUT compare=1 and the
  // dialog must close.
  const syncFromUrl = useCallback((authoritative: boolean): void => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("lesson");
    if (params.get("compare") === "1" && id) {
      setRequested(id);
    } else if (authoritative) {
      setRequested(null);
      setOpenId(null);
    }
  }, []);

  useEffect(() => {
    syncFromUrl(false);
    const onPop = (): void => syncFromUrl(true);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [syncFromUrl]);

  // ── The gate ─────────────────────────────────────────────────────────────
  // Every guard the menu item applies, re-applied here, because a deep link
  // is a SECOND entry point that never passed through the menu: a hand-typed
  // (or stale, or shared) `?compare=1` must not open a diff on an unedited
  // lesson, and must not open one in Team-Curriculum mode where the panel's
  // per-field reverts would write against the shared save target.
  //
  // Latched at the OPEN transition, not re-evaluated while open: a per-field
  // revert can legitimately flip canCompareWithTeam false mid-session (revert
  // the scheduling row of a moved-only lesson and `moved` clears), and the
  // dialog vanishing out from under the click that caused it would read as a
  // crash. ForkDiffPanel keeps its own belt-and-braces early returns for that
  // window and renders its empty state.
  useEffect(() => {
    if (requested == null) {
      setOpenId(null);
      return;
    }
    if (openId === requested) return;
    const lesson = lessons.find((l) => l.id === requested);
    // Not found YET is not the same as not found. Stay armed — the store may
    // still be hydrating (this is the normal cold-deep-link shape). A
    // genuinely bogus id simply never opens anything, which is the same
    // outcome the v1 path gives it.
    if (!lesson) return;
    if (editMode !== "personal" || !canCompareWithTeam(lesson)) {
      setRequested(null);
      return;
    }
    setOpenId(requested);
  }, [requested, openId, lessons, editMode]);

  // Leaving personal mode retires the request outright rather than merely
  // hiding it — otherwise the footer's "Edit the Team version" (which switches
  // to master and closes) would leave a live request that re-opened the moment
  // the teacher switched back.
  useEffect(() => {
    if (editMode !== "personal") {
      setRequested(null);
      setOpenId(null);
    }
  }, [editMode]);

  const close = useCallback((): void => {
    setRequested(null);
    setOpenId(null);
    // Drop the consumed param so a refresh (or Back into this entry) doesn't
    // reopen a diff that was just dismissed. replaceState, not router.replace:
    // no RSC round trip for a URL tidy-up — the same choice LessonDetail
    // :326-334 makes. Usually a no-op on /daily, where DailyView has already
    // stripped the whole query.
    //
    // The first argument is the EXISTING history state, not null (§4a finding).
    // The App Router keeps its own routing metadata in history.state; writing
    // null over it leaves an entry the router can't recognise, so a later
    // Back/Forward can fall out to a hard navigation. We are only editing the
    // URL here, so the state must be carried through untouched.
    // (components/daily/LessonDetail.tsx:332 still passes null — same latent
    // bug on the flag-OFF v1 path, left alone here to keep this diff scoped.)
    const url = new URL(window.location.href);
    if (url.searchParams.has("compare")) {
      url.searchParams.delete("compare");
      window.history.replaceState(window.history.state, "", url);
    }
  }, []);

  const lesson = openId ? (lessons.find((l) => l.id === openId) ?? null) : null;
  if (!lesson) return null;

  return <CompareToMaster lesson={lesson} onClose={close} />;
}
