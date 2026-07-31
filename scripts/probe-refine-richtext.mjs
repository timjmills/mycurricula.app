// scripts/probe-refine-richtext.mjs — the ONE check the unit tests cannot make.
//
// WHY THIS EXISTS SEPARATELY. `RichSafeCell` (RefineTab.tsx) stops the Refine
// table flattening rich-text titles/objectives. Two test files pin it — mine and
// a sibling lane's — but BOTH assert against a rendered STRING: they prove the
// cell paints `readOnly` with stripped text, not that a real keystroke in a real
// browser fails to reach `editLesson`. And neither can, because
// `renderToStaticMarkup` has no events.
//
// They also share a deeper blind spot the reviewers named explicitly: the markup
// in those tests is a FIXTURE STRING I wrote. Nothing proves the app's own rich
// editor produces the shape `isPlainText` tests for. If `RichTextEditor` emitted,
// say, a style attribute or a wrapping <div> that `stripHtml` handled
// differently, every unit test would still pass and the bug would be live.
//
// So this probe never types a fixture. It drives the REAL editor — the same
// <RichTextEditor singleLine> the Lesson Planner mounts at
// LessonWorkspace.tsx:259 — bolds a word, and then goes to Refine and tries to
// destroy it. The assertion is on the STORED VALUE, before and after: markup in,
// same markup out.
//
// Usage: CLAUDE_BYPASS_TOKEN=… node scripts/probe-refine-richtext.mjs
//        PROBE_BASE defaults to http://localhost:3010

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { bypassLogin } from "./lib/auth.mjs";

const BASE = process.env.PROBE_BASE ?? "http://localhost:3010";
const OUT = path.resolve("docs/screenshots/refine-richtext");
await mkdir(OUT, { recursive: true });

const failures = [];
const notes = [];
const check = (label, cond, detail = "") =>
  (cond ? notes : failures).push(
    `${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`,
  );
const info = (label, detail = "") =>
  notes.push(`INFO  ${label}${detail ? ` — ${detail}` : ""}`);

const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"])
  .toString()
  .trim();
const dirty = execFileSync("git", [
  "diff",
  "HEAD",
  "--name-only",
  "--",
  "components",
  "lib",
])
  .toString()
  .trim();
info("HEAD", sha);
info(
  "tree",
  dirty ? `DIRTY — measures the WORKING TREE, not ${sha}` : `clean — equals ${sha}`,
);

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({
  viewport: { width: 1440, height: 950 },
});
const page = await context.newPage();

try {
  // next:"/planner" mirrors probe-refine-tab.mjs EXACTLY. With next:"/daily" the
  // hop lands mid-bounce and the chip never mounts inside the wait window — the
  // only difference between this probe failing and that one passing.
  await bypassLogin(context, { base: BASE, next: "/planner", // retries:3 + a long timeout because this dev server is shared with several
  // build lanes; the hop times out whenever one of them is mid-compile.
  timeout: 180000, retries: 3 });
  await page.goto(`${BASE}/daily?lesson=m-11-1`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });

  // ── 0. Reach the rich editor ─────────────────────────────────────────────
  // It is NOT on /daily: <RichTextEditor singleLine> for the objective lives in
  // the Lesson Planner (LessonWorkspace.tsx:259), which is a MODE inside the unit
  // workspace. Route: UnitChip → workspace → Lessons tab → "Plan" on a row.
  const openWorkspace = async () => {
    const c = page
      .locator('button[aria-label^="Open the"][aria-label$="unit workspace"]')
      .first();
    await c.waitFor({ state: "visible", timeout: 75000 });
    await c.click();
    await page.locator('[role="dialog"]').first().waitFor({ timeout: 30000 });
  };
  await openWorkspace();
  // SCOPED TO THE DIALOG. Unscoped, getByRole("button", {name:"Plan"}) matched
  // the day view's "Lesson plan" button sitting BEHIND the modal, which is not
  // clickable and is not this surface.
  const dlg = page.locator('[role="dialog"]').first();
  await dlg.getByRole("tab", { name: "Lessons" }).click();
  await page.waitForTimeout(700);
  await dlg.getByRole("button", { name: "Plan", exact: true }).first().click();
  await page.waitForTimeout(1200);

  // ── 1. Author REAL markup through the app's own rich editor ──────────────
  const objective = page.getByRole("textbox", {
    name: /Lesson objective/i,
  });
  await objective.waitFor({ state: "visible", timeout: 60000 });

  await objective.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("compare two fractions");
  // Bold the whole thing through the editor's own selection toolbar path.
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.press("ControlOrMeta+b");
  await page.waitForTimeout(1200);

  const authored = await objective.innerHTML();
  info("what the real editor produced", authored.slice(0, 120));
  const hasMarkup = /<(b|strong|em|i|span)[\s>]/i.test(authored);
  check(
    "the app's own editor really does store markup (control — if this fails the rest proves nothing)",
    hasMarkup,
    authored.slice(0, 120),
  );
  if (!hasMarkup) throw new Error("control failed: no markup authored");

  // ── 2. Back to the unit roll-up, then Refine ─────────────────────────────
  // The Unit | Lesson switch is in the shell header; going back drops the
  // pinned lesson and re-renders the unit tabs.
  // The mode switch is a role="group" of plain buttons, NOT a tablist
  // (ExplorerShell.tsx:365-395) — getByRole("tab") can never match it. Target the
  // stable data attribute the component already exposes.
  await page.locator('[data-ue-mode="unit"]').first().click();
  await page.waitForTimeout(1000);
  await page.locator('[role="dialog"]').first().getByRole("tab", { name: "Refine" }).click();
  await page.waitForTimeout(900);

  // Locate by value rather than by index — the unit's row order is not this
  // probe's business.
  const target = await page.evaluate(() => {
    const inputs = [
      ...document.querySelectorAll(
        '[role="dialog"] tbody tr input[aria-label*="Objective"]',
      ),
    ];
    const el = inputs.find((i) =>
      (i.value || "").includes("compare two fractions"),
    );
    if (!el) return null;
    return {
      value: el.value,
      readOnly: el.readOnly,
      ariaReadonly: el.getAttribute("aria-readonly"),
      label: el.getAttribute("aria-label"),
      title: el.getAttribute("title"),
      index: inputs.indexOf(el),
    };
  });

  check("the bolded objective reached the Refine table", target !== null);
  if (!target) throw new Error("objective row not found in Refine");

  info("cell", JSON.stringify(target));
  check(
    "the cell shows the STRIPPED text, not the raw tags",
    !/[<>]/.test(target.value),
    `value = "${target.value}"`,
  );
  check("the cell is readOnly", target.readOnly === true);
  check(
    "the cell says WHY it is read-only rather than looking broken",
    (target.title ?? "").includes("Lesson Planner"),
    target.title ?? "(no title)",
  );

  await page.screenshot({ path: path.join(OUT, "refine-rich-readonly.png") });

  // ── 3. THE PROOF: try to destroy it, and confirm nothing moved ───────────
  // This is what no unit test in either file can do. A real focus, real
  // keystrokes, then read the value back OUT of the store via the surface that
  // renders HTML — not out of the table that stripped it.
  const cellHandle = page
    .locator('[role="dialog"] tbody tr input[aria-label*="Objective"]')
    .nth(target.index);
  await cellHandle.click();
  await page.keyboard.type("XXXX");
  await page.keyboard.press("End");
  await page.keyboard.type("YYYY");
  await page.waitForTimeout(1200);

  const afterTyping = await page.evaluate((i) => {
    const inputs = [
      ...document.querySelectorAll(
        '[role="dialog"] tbody tr input[aria-label*="Objective"]',
      ),
    ];
    return inputs[i]?.value ?? null;
  }, target.index);

  check(
    "typing into a formatted cell changes nothing in the table",
    afterTyping === target.value,
    `before "${target.value}" / after "${afterTyping}"`,
  );
  check(
    "the typed characters were not committed anywhere visible",
    !(afterTyping ?? "").includes("XXXX") &&
      !(afterTyping ?? "").includes("YYYY"),
    afterTyping ?? "",
  );

  // ── 4. And the markup itself survived, read back from the rich editor ────
  // The table STRIPS for display, so reading the table can never prove the
  // STORED value is intact — it would show clean text either way. Go back to the
  // editor that renders it as HTML.
  //
  // In-modal mode switch, NOT a page reload: a `page.goto` here timed out
  // repeatedly against this shared dev server, and it was never necessary — the
  // Lesson Planner is one click away and reads the same store.
  // NOT the bare mode switch. Returning to Unit mode deliberately DROPS the
  // pinned lesson (UnitExplorer's onModeChange), so flipping straight back to
  // Lesson mode lands on `fallbackLessonId` — the first NOT-YET-TAUGHT lesson,
  // which is lesson 2 here because lesson 1 is marked done. An earlier revision
  // did exactly that and read lesson 2's objective back, then reported the
  // markup as destroyed. Re-pin lesson 1 explicitly via its own row.
  const dlg2 = page.locator('[role="dialog"]').first();
  await dlg2.getByRole("tab", { name: "Lessons" }).click();
  await page.waitForTimeout(700);
  await dlg2.getByRole("button", { name: "Plan", exact: true }).first().click();
  await page.waitForTimeout(1500);
  const objective2 = page.getByRole("textbox", { name: /Lesson objective/i });
  await objective2.waitFor({ state: "visible", timeout: 60000 });
  const survived = await objective2.innerHTML();
  info("stored objective after the attack", survived.slice(0, 160));
  check(
    "the markup survived a typing attack in the Refine cell",
    /<(b|strong|em|i|span)[\s>]/i.test(survived),
    survived.slice(0, 160),
  );
  check(
    "and the text was not corrupted",
    survived.includes("compare two fractions") &&
      !survived.includes("XXXX") &&
      !survived.includes("YYYY"),
    survived.slice(0, 160),
  );

  // ── 5. Anti-overshoot — a PLAIN objective is still fully editable ────────
  // Without this, a fix that turned every cell read-only would pass everything
  // above while destroying the entire point of the tab.
  // textContent, not innerHTML — this only CLEARS the field, and clearing via
  // textContent cannot be an injection sink at all.
  await page.evaluate(() => {
    const el = document.querySelector('[contenteditable="true"]');
    if (el) el.textContent = "";
  });
  await objective2.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("write a plain objective");
  await page.waitForTimeout(1200);

  await page.locator('[data-ue-mode="unit"]').first().click();
  await page.waitForTimeout(1000);
  await page.locator('[role="dialog"]').first().getByRole("tab", { name: "Refine" }).click();
  await page.waitForTimeout(900);

  const plain = await page.evaluate(() => {
    const inputs = [
      ...document.querySelectorAll(
        '[role="dialog"] tbody tr input[aria-label*="Objective"]',
      ),
    ];
    const el = inputs.find((i) => (i.value || "").includes("plain objective"));
    return el ? { readOnly: el.readOnly, index: inputs.indexOf(el) } : null;
  });
  check("a plain objective is NOT read-only", plain?.readOnly === false, JSON.stringify(plain));

  if (plain && plain.readOnly === false) {
    const editable = page
      .locator('[role="dialog"] tbody tr input[aria-label*="Objective"]')
      .nth(plain.index);
    await editable.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" EDITED");
    await page.waitForTimeout(1000);
    const after = await editable.inputValue();
    check(
      "a plain objective is still fully editable from Refine",
      after.includes("EDITED"),
      after,
    );
  }
} catch (err) {
  failures.push(`FAIL  probe threw — ${String(err).slice(0, 400)}`);
} finally {
  await browser.close();
}

console.log("\n── Refine · rich-text data-loss proof ──────────────────────");
for (const n of notes) console.log(n);
if (failures.length) {
  console.log("");
  for (const f of failures) console.log(f);
}
console.log(
  `\n${failures.length === 0 ? "ALL CHECKS PASSED" : `${failures.length} FAILURE(S)`} · screenshots in ${OUT}\n`,
);
process.exit(failures.length === 0 ? 0 : 1);
