// scripts/probe-daily-cdp-sweep.mjs — CDP cascade sweep: for every daily
// control, report computed padding/border vs what its module rule declares,
// flagging declarations the .cp-root button reset (0,1,1) is overriding.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

let token = process.env.CLAUDE_BYPASS_TOKEN;
if (!token) {
  const env = readFileSync(".env.local", "utf8");
  token = env.match(/CLAUDE_BYPASS_TOKEN=(.+)/)?.[1]?.trim();
}
const BASE = process.env.PROBE_BASE ?? "http://localhost:3100";

const TARGETS = [
  ["phaseDel", 'button[aria-label^="Delete phase"]'],
  ["statusChip", 'button[aria-label^="Phase status"]'],
  ["min", 'button[aria-label^="Planned length"]'],
  ["dragGrip", 'button[aria-label^="Drag to reorder phase"]'],
  ["chipGrip", 'button[aria-label^="Drag to move resource"]'],
  ["resChipDel", 'button[aria-label^="Remove resource"]'],
  ["resChipOpen", 'button[aria-label^="Open Fraction"]'],
  ["phaseResAdd", 'button[aria-label^="Add a resource to this phase"]'],
  ["tabClose", 'button[aria-label^="Close Objective"]'],
  ["tabsAdd", 'button[aria-label^="Add a tool"]'],
  ["tmplBtn", 'button[aria-expanded][class*="tmplBtn"]'],
  ["agendaToggle", 'button[class*="agendaToggle"]'],
  ["agendaAdd", 'button[class*="agendaAdd"]'],
  ["addPhaseBtn", 'button[class*="addPhaseBtn"]'],
];

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext();
const boot = await context.newPage();
await boot.goto(
  `${BASE}/auth/claude-login?token=${encodeURIComponent(token)}&next=/daily`,
  { waitUntil: "domcontentloaded", timeout: 60000 },
);
await boot.waitForTimeout(2000);
await boot.close();

const page = await context.newPage();
await page.setViewportSize({ width: 1280, height: 900 });
await page.goto(`${BASE}/daily`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
await page.waitForTimeout(2500);
const row = page.locator('[data-planner-item^="lesson:"]').first();
const box = await row.boundingBox();
await page.mouse.click(box.x + box.width * 0.4, box.y + 12);
await page.waitForTimeout(1500);

const cdp = await context.newCDPSession(page);
await cdp.send("DOM.enable");
await cdp.send("CSS.enable");
const { root } = await cdp.send("DOM.getDocument", { depth: -1 });

for (const [name, selector] of TARGETS) {
  let nodeIds = [];
  try {
    ({ nodeIds } = await cdp.send("DOM.querySelectorAll", {
      nodeId: root.nodeId,
      selector,
    }));
  } catch {
    /* bad selector */
  }
  if (!nodeIds.length) {
    console.log(`${name}: NOT FOUND`);
    continue;
  }
  const { matchedCSSRules } = await cdp.send("CSS.getMatchedStylesForNode", {
    nodeId: nodeIds[0],
  });
  // The LAST padding/border declaration in cascade order wins among equal
  // origins; report module-declared values vs the reset.
  const findings = [];
  for (const m of matchedCSSRules) {
    const r = m.rule;
    if (r.origin !== "regular") continue;
    const sel = r.selectorList.text;
    const isReset = sel === ".cp-root button";
    const isModule = sel.includes("__"); // hashed module class
    const decls = (r.style.cssProperties ?? []).filter(
      (p) =>
        ["padding", "border", "background"].some((k) => p.name === k) &&
        p.value !== undefined,
    );
    if (decls.length && (isReset || isModule)) {
      findings.push(
        `${isReset ? "RESET" : "module"} ${sel.slice(0, 60)} → ${decls
          .map((p) => `${p.name}:${p.value}`)
          .join("; ")}`,
      );
    }
  }
  console.log(`\n${name}:`);
  for (const f of findings) console.log(`   ${f}`);
}
await browser.close();
