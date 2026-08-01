// lib/planner/paged-read.ts — ceiling-safe reads for the planner repository.
//
// WHY THIS EXISTS (task #48, measured on production 2026-08-01)
//   PostgREST caps every response at the project's `db-max-rows`. On this
//   project that ceiling is EXACTLY 1000, and it is enforced globally — a
//   `.range(0, 4999)` still comes back with 1000 rows, and `standards` (1.1M
//   rows) caps identically. The cap is applied SILENTLY: HTTP 200, a partial
//   body, and a `content-range: 0-999/1069` header that nothing in the app
//   read. supabase-js does not paginate on your behalf.
//
//   The planner's year-wide lesson read
//   (`listLessons` → `master_core_lesson_events`) crossed that ceiling on the
//   beta grade: 1069 rows matched, 1000 came back. The deployed app received
//   exactly 1000 lessons with a maximum `week_number` of 33 while the database
//   held lessons through week 37 — weeks 34–37 reached NO surface (Weekly,
//   Daily, Year, Catch-Up, Print) with no error and nothing a teacher could
//   notice. `loadStandardsIndex` was over the same ceiling (1884 standards in
//   the grade's 7 frameworks, 1000 returned).
//
// KEYSET, NOT OFFSET — and this is the part worth reading.
//   The obvious fix is `.range(0,999)`, `.range(1000,1999)`, … It is wrong in a
//   way that reintroduces the very bug being fixed. OFFSET is positional, and
//   the pages are separate transactions, so a row inserted or deleted ahead of
//   the boundary between two pages shifts every later row: a delete at position
//   3 makes row 1000 slide to 999 and the next page starts at 1000, SKIPPING it
//   — a lesson silently missing from the planner, which is exactly the symptom
//   this file exists to eliminate. (An insert duplicates a row instead.) On a
//   shared team curriculum, another teacher saving during a hydrate is not an
//   exotic scenario.
//
//   So pagination is by CURSOR: each page asks for rows whose unique cursor
//   column is strictly greater than the last row of the previous page. That is
//   positionless — an insert or delete elsewhere in the table cannot move the
//   boundary — so no row is skipped or served twice because of a boundary shift.
//
//   WHAT THIS IS AND IS NOT. It is a scan, not a snapshot — and paginating is
//   what costs the snapshot. The single request it replaces ran inside ONE
//   statement, so it saw one consistent instant; this reads across several, so
//   it can observe writes that land between pages. A row INSERTED mid-read
//   whose cursor sorts BELOW the current position is not in the result (it
//   arrives on the next hydrate); one inserted above it may be, even though the
//   first page's count predates it; and a row DELETED after it was read is
//   still in the result. The guarantee being made is narrower and precise: no
//   row is lost to PAGINATION. Cross-page visibility is the price, and it is
//   the right trade — a stale row corrects itself on the next hydrate, whereas
//   the 69 lessons the ceiling ate never came back at all.
//
//   THE CURSOR COLUMN MUST BE UNIQUE UNDER THE QUERY'S FILTERS, and that is a
//   DATABASE guarantee, not a runtime one. A non-unique cursor does not repeat
//   rows, it loses them — `.gt(boundary)` skips past every row sharing the
//   boundary value — and no amount of client-side checking can prove uniqueness
//   across a boundary it never sees. So each call site cites the constraint it
//   relies on, all of them verified against production on 2026-08-01:
//     master_core_lesson_events.id            PRIMARY KEY
//     personal_authored_lessons.id            PRIMARY KEY
//     personal_core_lesson_event_copies.id    PRIMARY KEY
//     standards.id                            PRIMARY KEY
//     lesson_sections.id                      PRIMARY KEY
//     unit_assessments.id                     PRIMARY KEY
//     completion_status.core_lesson_event_id  UNIQUE (teacher_id, …), and that
//                                             read is already scoped to one teacher
//   The runtime checks below (repeated values within a page; a cursor that
//   fails to advance) are fast failures for a MISWIRED call site, not proof.
//
//   Consequence for call sites: the DB-side ordering is now the cursor's, not
//   the domain's. Reads that care about presentation order sort in memory after
//   the read (a few thousand rows — nothing).
//
// THE TWO TOOLS HERE
//   • `pagedSelect` — reads a query COMPLETELY, cursor page by cursor page. The
//     first page carries `count: "exact"`, which rides along on the same
//     round-trip (`content-range`) and makes completeness checkable rather than
//     assumed. Measured cost of that count on the master read: ~5ms, inside the
//     noise of the request itself.
//   • `assertNotTruncated` — the guard for reads that are NOT paginated. A read
//     that comes back with exactly `POSTGREST_MAX_ROWS` rows is, on this
//     project, indistinguishable from a truncated one — so it is treated as a
//     truncation and THROWS. A partial curriculum that looks complete is the
//     failure mode this whole task exists to kill; a loud error that a teacher
//     and the logs can both see is strictly better than silent loss.
//
// This module is a pure leaf — no Supabase import, no `next/headers` — so it is
// unit-testable without the server-only repository, matching the
// `lesson-track-b.ts` / `unit-assessments.ts` pattern.

/** The measured PostgREST `db-max-rows` ceiling for this Supabase project.
 *
 *  MEASURED, not assumed (1000 is also the common default, which is exactly why
 *  it had to be measured): against production on 2026-08-01, `.range(0, 999)`,
 *  `.range(0, 1499)`, `.range(0, 4999)` and `.range(0, 99999)` all returned
 *  1000 rows on `master_core_lesson_events`, and a bare `select` on `standards`
 *  (1,113,420 rows) returned 1000 as well.
 *
 *  `pagedSelect` never reads this constant — it advances by the rows it
 *  actually received — so a changed ceiling cannot affect it. Only
 *  `assertNotTruncated`'s COUNTLESS fallback path is calibrated to this number,
 *  and only in one direction: a raised ceiling costs at most a false alarm, but
 *  a LOWERED `db-max-rows` would truncate below the threshold and slip through.
 *  Lowering it therefore requires updating this constant in the same change. */
export const POSTGREST_MAX_ROWS = 1000;

/** Rows requested per page. Deliberately equal to the ceiling: asking for more
 *  is wasted URL, asking for less is wasted round-trips. Nothing depends on
 *  this matching the real ceiling. */
export const PAGE_SIZE = POSTGREST_MAX_ROWS;

/** Hard stop on the page loop so a pathological server can never spin forever.
 *  500 pages × 1000 rows = 500k rows, far beyond any planner read. */
const MAX_PAGES = 500;

/** Thrown when a read could not be proven complete. Distinct from a transport
 *  error: the query SUCCEEDED and returned rows — there were just fewer of them
 *  than the database said matched. Callers must not treat this as "no data". */
export class PlannerReadTruncatedError extends Error {
  readonly context: string;
  readonly received: number;
  readonly expected: number | null;

  constructor(context: string, received: number, expected: number | null) {
    super(
      `Planner repository ${context} was TRUNCATED: received ${received} rows` +
        (expected == null
          ? ` (exactly the ${POSTGREST_MAX_ROWS}-row PostgREST ceiling, so the` +
            ` set is almost certainly larger)`
          : ` but the database reports ${expected} match`) +
        `. This read must paginate (lib/planner/paged-read.ts) — a partial` +
        ` result here silently hides curriculum from every planner surface.`,
    );
    this.name = "PlannerReadTruncatedError";
    this.context = context;
    this.received = received;
    this.expected = expected;
  }
}

/** The shape supabase-js returns for a `.select()` — `count` is populated only
 *  when the query asked for it. */
export type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
  count?: number | null;
};

/** One page's request. Call sites translate this to
 *  `.gt(cursorColumn, after)` + `.order(cursorColumn)` + `.limit(limit)`, and
 *  ask for `{ count: "exact" }` when `withCount`. */
export type PageRequest = {
  /** Cursor: return only rows whose cursor column is strictly greater than
   *  this. `null` on the first page (no lower bound). */
  after: string | null;
  limit: number;
  /** True for the first page only — the exact row total is worth one COUNT,
   *  not one per page. */
  withCount: boolean;
};

export type RunPage<T> = (page: PageRequest) => PromiseLike<PageResult<T>>;

/**
 * Read a query COMPLETELY, one cursor page at a time.
 *
 * Terminates when the authoritative row total has been reached or when a page
 * comes back empty. It deliberately does NOT stop on a merely SHORT page: a
 * short page is exactly what an unknown, lower-than-`pageSize` ceiling looks
 * like, so treating it as the end would silently truncate on any project whose
 * `db-max-rows` is below `PAGE_SIZE`.
 *
 * ENDING SHORT OF THE COUNT IS ADJUDICATED, NOT GUESSED. Two very different
 * things produce a deficit, and the difference is the whole point of this file:
 *   • rows were DELETED while the read was in flight — the read is complete for
 *     what exists, and failing hydrate over it would be a worse bug; or
 *   • rows were LOST — a call site that forgot its `.gt`, a ceiling nobody
 *     anticipated, a cursor that is not unique. This is the silent partial read
 *     that must never ship.
 * Guessing between them is what got the planner here, so on a deficit the row
 * total is re-read (`limit: 0` — one count, no rows, ~370ms and only on this
 * rare path). If the table really did shrink to what was read, it was a delete
 * race: log and return. If the rows are still there, they were lost: THROW.
 *
 * The limit of that adjudication, stated plainly: it compares TOTALS, so a
 * contrived combination — a duplicate cursor value straddling a page boundary,
 * plus exactly enough concurrent deletes to make the totals agree — would read
 * as a delete race. Runtime arithmetic cannot close that; the DATABASE
 * uniqueness constraint listed in the header is what rules it out, and every
 * cursor here has one. What the adjudication does buy is that the ordinary
 * causes are told apart correctly instead of both being logged and waved on.
 *
 * Otherwise the check is fail-CLOSED: a read that both deleted and inserted
 * rows mid-flight can land on the throw even though nothing was lost — a rare,
 * loud, retryable false alarm, which is the right side to err on when the
 * alternative is a curriculum that renders as though it were whole.
 *
 * @param context   human-readable read name, used in errors ("list master lessons")
 * @param cursorOf  reads the cursor column off a row. MUST be unique under the
 *                  query's filters, and MUST be the column the call site orders
 *                  and filters by.
 * @param runPage   runs one page (see {@link RunPage})
 */
export async function pagedSelect<T>(
  context: string,
  cursorOf: (row: T) => string,
  runPage: RunPage<T>,
  opts?: { pageSize?: number },
): Promise<T[]> {
  const pageSize = opts?.pageSize ?? PAGE_SIZE;
  const rows: T[] = [];
  /** Authoritative total from the first page's `content-range`; null if the
   *  server declined to report one. */
  let expected: number | null = null;
  let after: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await runPage({ after, limit: pageSize, withCount: page === 0 });
    if (res.error) {
      throw new Error(
        `Planner repository ${context} failed: ${res.error.message}`,
      );
    }
    const batch = res.data ?? [];
    if (page === 0) {
      expected = res.count ?? null;
      if (expected == null) {
        // No `content-range` total. The read can still complete, but its
        // completeness is no longer provable — say so rather than let an
        // unverifiable read pass for a verified one.
        console.error(
          `[planner] ${context} got no exact row count from PostgREST, so its` +
            ` completeness cannot be verified. Paging until an empty page.`,
        );
      }
    }
    if (batch.length === 0) break; // server has nothing past the cursor

    // THE ONE INVARIANT: cursor values walk STRICTLY UPWARD, within a page and
    // across the boundary between pages. Fast failure for a MISWIRED call site
    // — not a proof of uniqueness, which only the database can give (see the
    // header). Every way of getting the page builder wrong lands here:
    //   • `.gte(col, after)` instead of `.gt` — the boundary row comes back a
    //     second time, so a lesson is DUPLICATED and the count is overshot;
    //   • no cursor filter at all — every page re-serves the first one;
    //   • `.order()` on the wrong column, or missing — the cursor jumps around
    //     and pages overlap;
    //   • a cursor column that is not unique — equal neighbours.
    // What it cannot see is a duplicate STRADDLING a page boundary: `.gt` has
    // already skipped the twin, so no page ever holds a repeat. That case falls
    // to the completeness check at the end.
    let prev = after;
    for (const row of batch) {
      const c = cursorOf(row);
      if (prev != null && !(c > prev)) {
        throw new Error(
          `Planner repository ${context} read a cursor that did not increase` +
            ` (${JSON.stringify(c)} after ${JSON.stringify(prev)}). The page` +
            ` builder must apply .gt(cursorColumn, page.after) — not .gte —` +
            ` order ascending by that SAME column, and use a column that is` +
            ` unique under this query's filters.` +
            ` See lib/planner/paged-read.ts.`,
        );
      }
      prev = c;
    }

    rows.push(...batch);
    after = cursorOf(batch[batch.length - 1]);

    // Stop only when BOTH hold: the count has been satisfied, AND this page
    // came back short of what was asked for. The second half is not belt and
    // braces — `expected` is the total as of page 1, so a bulk insert above the
    // cursor mid-read (a unit import, say) can push `rows.length` past it while
    // pre-existing tail rows are still unread. A FULL page never proves the
    // server has run out, whatever the arithmetic says.
    if (expected != null && rows.length >= expected && batch.length < pageSize)
      break;
    if (page === MAX_PAGES - 1) {
      // Never reached by a sane server; if it is, the set is bigger than this
      // loop will read and the result MUST NOT be handed back as complete.
      throw new PlannerReadTruncatedError(context, rows.length, expected);
    }
  }

  if (expected != null && rows.length < expected) {
    // Adjudicate: did the rows go away, or did we lose them? See the doc block.
    const recount = await runPage({ after: null, limit: 0, withCount: true });
    const nowTotal = recount.error ? null : (recount.count ?? null);
    if (nowTotal != null && nowTotal <= rows.length) {
      // Holding at least as many rows as the table now contains means nothing
      // was lost to PAGINATION — which is the only thing this loop is
      // responsible for. It does NOT mean the result matches the table: rows
      // deleted after they were read are still in it. Deliberately NOT
      // tightened to `nowTotal === rows.length`, because deleting a row that an
      // earlier page had already returned is the ordinary shape of this race,
      // and turning that into a failed hydrate is the harm being avoided.
      console.error(
        `[planner] ${context} read ${rows.length} of the ${expected} rows the` +
          ` first page reported, and the table now holds ${nowTotal}. Rows were` +
          ` deleted mid-read: nothing was lost to paging, though the result may` +
          ` still carry rows deleted after it read them (this is a scan, not a` +
          ` snapshot). Not failing the read.`,
      );
      return rows;
    }
    // Either the rows are still there (they were LOST) or the re-count itself
    // failed, in which case completeness is unknown — and unknown must not be
    // reported as complete.
    throw new PlannerReadTruncatedError(context, rows.length, nowTotal ?? expected);
  }
  return rows;
}

/**
 * Guard for a read that is NOT paginated.
 *
 * Pass the `count` from a `{ count: "exact" }` select and the check is EXACT
 * and ceiling-independent: fewer rows than the database says match is a
 * truncation, full stop. That is the form every call site should use — the
 * count rides along on the same request, and these reads are small enough
 * (a grade's subjects, its units, one lesson's sections) that counting them is
 * free.
 *
 * With no count (`null`/`undefined`) it falls back to comparing against
 * {@link POSTGREST_MAX_ROWS}, which is strictly weaker and worth being precise
 * about: it catches the ceiling as measured today, and would NOT catch a
 * `db-max-rows` that had been LOWERED — a 500-row cap would sail through. So
 * the fallback is a backstop, not a guarantee, and lowering the project's
 * `db-max-rows` requires updating {@link POSTGREST_MAX_ROWS} with it.
 *
 * A set of exactly {@link POSTGREST_MAX_ROWS} rows raises a false alarm on the
 * fallback path. That trade is deliberate and one-directional: the cost is a
 * visible error on a read that should have been paginated anyway; the cost of
 * staying quiet is a curriculum that renders as if it were whole.
 *
 * Returns `rows` so it can wrap an expression in place.
 */
export function assertNotTruncated<T>(
  rows: T[],
  context: string,
  count?: number | null,
): T[] {
  if (count != null) {
    if (rows.length < count) {
      throw new PlannerReadTruncatedError(context, rows.length, count);
    }
    return rows;
  }
  if (rows.length === POSTGREST_MAX_ROWS) {
    throw new PlannerReadTruncatedError(context, rows.length, null);
  }
  return rows;
}
