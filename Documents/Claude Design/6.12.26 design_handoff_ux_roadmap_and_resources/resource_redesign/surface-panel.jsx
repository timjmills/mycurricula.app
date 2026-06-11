/* S1 — Resources panel (Daily/Weekly right rail) */
const { RNI: P_I, RNCallout: P_Co, RNTile: P_Tile, RNNoteFaceTile: P_Note, RNMenuItem: P_MI } = window;

function PanelChrome({ children, width }) {
  return <div className="rn" style={{ width: width || 312, padding: 14 }}>{children}</div>;
}

function PanelHeader({ count, title }) {
  return (
    <div className="rn-panelHead">
      <span className="rn-panelTitle">{title || "Resources"}</span>
      <span className="rn-countChip">{count}</span>
      <div className="rn-panelActions">
        <button className="rn-iconBtn rn-44" title="Add resources to this lesson">{P_I.plus}</button>
        <span className="rn-segmented">
          <button title="List view">{P_I.list}</button>
          <button className="on" title="Grid view">{P_I.grid}</button>
        </span>
        <button className="rn-iconBtn rn-44" title="Collapse panel">{P_I.chevD}</button>
      </div>
    </div>
  );
}

function PanelTabs({ active }) {
  const tabs = [["All", 9], ["Slides", 2], ["Handouts", 4], ["Tools", 2], ["Notes", 1]];
  return (
    <div className="rn-tabs">
      {tabs.map(([t, c]) => (
        <button key={t} className={"rn-tab" + (t === active ? " on" : "")}>{t}<span className="ct">{c}</span></button>
      ))}
    </div>
  );
}

/* ── Artboard 1 · Desktop grid, all fixes applied ── */
function PanelDesktop() {
  return (
    <PanelChrome>
      <div className="rn-panel" style={{ position: "relative" }}>
        <PanelHeader count="9" />
        <PanelTabs active="All" />
        <button className="rn-newNote">
          <span className="nn-ic">{P_I.noteCard}</span>
          New notecard
          <span style={{ marginLeft: "auto", color: "var(--faint)" }}>{P_I.plus}</span>
        </button>
        <div className="rn-grid">
          <P_Tile type="youtube" label="Fraction strips intro" tag="YOUTUBE" />
          <P_Tile type="doc" label="Anchor Chart" tag="DOC" />
          <P_Tile type="slides" label="Equivalent fractions" tag="SLIDES" />
          <P_Tile type="pdf" label="Fraction Examples" tag="PDF" />
          <P_Note label="Fraction Basics" count="3" />
          <P_Tile type="image" label="Fraction Wall Diagram" tag="IMAGE" />
          <P_Tile type="link" label="Khan Academy — Equiv…" tag="LINK" />
          <P_Tile type="pdf" label="Fraction Warm-up" tag="PDF" />
          <P_Tile type="slides" label="Number talk deck" tag="SLIDES" />
        </div>
      </div>
      <P_Co n="1" top={56} left={-10} w={190}>Count chip = FULL combined count, stable across tabs. One canonical source — sections own resources; lesson-level array merges by content identity at read time. <b>No duplicates (P1).</b></P_Co>
      <P_Co n="2" top={118} right={-12} w={180} fix>New <b>Notes</b> tab — notecards roll up here AND in All. Every other tab excludes them.</P_Co>
      <P_Co n="3" top={176} right={-12} w={180} fix>First-class <b>New notecard</b> entry (P6). Opens the composer in notecard mode, routed to this lesson.</P_Co>
      <P_Co n="4" top={420} left={-10} w={190} fix>Notecard renders as a <b>tile face</b> — identical footprint to plain tiles (P3): poster + NOTES glyph + gallery count. Click = fullscreen split view.</P_Co>
    </PanelChrome>
  );
}

/* ── Artboard 2 · Overflow menu (the "···" is now real) ── */
function PanelMenu() {
  return (
    <PanelChrome width={300}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ width: 132 }}>
          <P_Tile type="pdf" label="Fraction Examples" tag="PDF" />
        </div>
        <div className="rn-menu">
          <P_MI icon="open" label="Open" />
          <P_MI icon="enlarge" label="Enlarge" />
          <P_MI icon="note" label="Add / edit note" />
          <div className="rn-menuSep"></div>
          <P_MI icon="trash" label="Remove from lesson" danger />
        </div>
      </div>
      <div style={{ marginTop: 14 }} className="rn-eyebrow">tile overflow menu</div>
      <p style={{ fontSize: 12, color: "var(--body)", margin: "6px 0 0" }}>
        Hover-revealed on desktop (120ms), always visible on touch. 44px hit area via inflation.
        "Remove" is destructive → <b>required</b> tooltip, never dismissible.
        On a notecard tile the menu reads: Open card / Enlarge poster / Edit card / Remove.
      </p>
    </PanelChrome>
  );
}

/* ── Artboard 3 · List mode ── */
function PanelList() {
  const rows = [
    ["youtube", "Fraction strips intro", "YOUTUBE"],
    ["slides", "Equivalent fractions", "SLIDES"],
    ["pdf", "Fraction Examples", "PDF"],
  ];
  return (
    <PanelChrome>
      <div className="rn-panel">
        <PanelHeader count="9" />
        <PanelTabs active="All" />
        <div style={{ padding: "0 6px 10px" }}>
          {rows.map(([t, l, tag]) => (
            <div key={l} className="rn-row">
              <span className={"rn-rowIc th-" + t}>{t === "youtube" ? P_I.play : P_I[t]}</span>
              <span className="rn-rowLabel">{l}</span>
              <span className="rn-typeTag">{tag}</span>
              <button className="rn-iconBtn rn-44" title="Resource actions">{P_I.dots}</button>
            </div>
          ))}
          <div className="rn-row" style={{ background: "var(--honey-50)", borderRadius: "var(--r-sm)" }}>
            <span className="rn-rowIc" style={{ background: "var(--honey-100)", color: "var(--honey-600)" }}>{P_I.noteCard}</span>
            <span className="rn-rowLabel">Fraction Basics</span>
            <span className="rn-galleryCt" style={{ position: "static" }}>3</span>
            <span className="rn-typeTag">NOTE</span>
            <button className="rn-iconBtn rn-44" title="Notecard actions">{P_I.dots}</button>
          </div>
        </div>
      </div>
      <P_Co n="5" top={236} left={-10} w={190}>List mode: notecard row carries the honey wash + count — same 44px row height as every other row. View choice persists per teacher.</P_Co>
    </PanelChrome>
  );
}

/* ── Artboard 4 · Tablet/phone — drawer (rail hides below 1280) ── */
function PanelDrawer() {
  return (
    <div className="rn" style={{ width: 390, padding: 0, background: "var(--canvas)", borderRadius: 18, overflow: "hidden" }}>
      <div style={{ height: 44, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontWeight: 800, fontSize: 13 }}>Daily View</span>
        <span style={{ marginLeft: "auto" }} />
        <button className="rn-iconBtn rn-44" title="Open resources drawer" style={{ background: "var(--brand-50)", color: "var(--brand-600)" }}>{P_I.grid}</button>
      </div>
      <div style={{ position: "relative", height: 430 }}>
        <div style={{ position: "absolute", inset: 0, background: "rgba(28,27,46,.32)" }} />
        <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 320, background: "var(--surface)", borderLeft: "1px solid var(--border)", boxShadow: "var(--sh-lg)", display: "flex", flexDirection: "column" }}>
          <div className="rn-panelHead">
            <span className="rn-panelTitle">Resources</span>
            <span className="rn-countChip">9</span>
            <div className="rn-panelActions">
              <button className="rn-iconBtn rn-44" title="Add resources">{P_I.plus}</button>
              <button className="rn-iconBtn rn-44" title="Close drawer">{P_I.x}</button>
            </div>
          </div>
          <PanelTabs active="All" />
          <div className="rn-grid" style={{ paddingBottom: 10 }}>
            <P_Tile type="youtube" label="Fraction strips intro" tag="YT" />
            <P_Tile type="slides" label="Equivalent fractions" tag="SLIDES" />
            <P_Note label="Fraction Basics" count="3" />
            <P_Tile type="pdf" label="Fraction Examples" tag="PDF" />
          </div>
        </div>
      </div>
      <div style={{ padding: "10px 14px", fontSize: 11, color: "var(--body)", background: "var(--surface)" }}>
        <b>Tablet / phone (≤1280px):</b> the rail hides; the panel becomes a right drawer from the top bar.
        Slide-in 250ms (fade under reduced motion). Identical content + tabs; tiles stay 2-up at ≥360px.
      </div>
    </div>
  );
}

function RNSectionPanel() {
  const { DCSection, DCArtboard } = window;
  return (
    <DCSection id="panel" title="1 · Resources panel" subtitle="Right rail — P1 dedup, Notes tab, New notecard entry, notecard tile face, real overflow menu">
      <DCArtboard id="panel-desktop" label="Desktop rail · grid" width={560}><PanelDesktop /></DCArtboard>
      <DCArtboard id="panel-menu" label="Tile overflow menu" width={380}><PanelMenu /></DCArtboard>
      <DCArtboard id="panel-list" label="Desktop rail · list" width={560}><PanelList /></DCArtboard>
      <DCArtboard id="panel-drawer" label="Tablet/phone drawer · 390" width={390}><PanelDrawer /></DCArtboard>
    </DCSection>
  );
}
window.RNSectionPanel = RNSectionPanel;
