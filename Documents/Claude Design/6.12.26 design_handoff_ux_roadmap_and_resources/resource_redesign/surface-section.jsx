/* S2 — Section resources (lesson-flow center column) */
const { RNI: S_I, RNCallout: S_Co } = window;

function SecHead({ minimized }) {
  return (
    <div className="rn-secHead">
      <span className="rn-eyebrow">{minimized ? "Resource quick access" : "Resources"}</span>
      <span style={{ marginLeft: "auto" }} />
      <button className="rn-iconBtn rn-44" title={minimized ? "Expand resources" : "Minimize to quick access"}>{S_I.enlarge}</button>
    </div>
  );
}

function NoteRow({ title, meta }) {
  return (
    <button className="rn-noteRow">
      <span className="nr-poster">{S_I.noteCard}</span>
      <span className="nr-body">
        <span className="nr-title" style={{ display: "block" }}>{title}</span>
        <span className="nr-meta" style={{ display: "block" }}>{meta}</span>
      </span>
      <span className="rn-iconBtn rn-44" title="Edit this notecard" style={{ color: "var(--honey-600)" }}>{S_I.note}</span>
      <span className="rn-iconBtn rn-44" title="Open full card">{S_I.enlarge}</span>
    </button>
  );
}

/* ── Artboard 1 · Expanded — 2×2 kept, notecards as a compact row BELOW ── */
function SectionExpanded() {
  return (
    <div className="rn" style={{ width: 332, padding: 14, position: "relative" }}>
      <div className="rn-secCard">
        <SecHead />
        <div className="rn-2x2">
          {[
            ["s1", "Equivalent fractions deck"],
            ["s2", "Warm-up sheet"],
            ["s3", "Fraction Wall Diagram"],
            ["s4", "Khan Academy practice"],
          ].map(([cls, label]) => (
            <div key={cls} className={"rn-slot " + cls}>
              <button className="rn-slotEdit" title="Add or edit notes for this resource">{S_I.note}</button>
              <span className="sl-label">{label}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <NoteRow title="Fraction Basics" meta="3 media · notes" />
        </div>
        <div className="rn-moreList">
          <div className="rn-row" style={{ padding: "6px 4px" }}>
            <span className="rn-rowIc th-doc">{S_I.doc}</span>
            <span className="rn-rowLabel">Anchor Chart</span>
            <span className="rn-typeTag">DOCX</span>
            <button className="rn-iconBtn rn-44" title="Add or edit notes">{S_I.note}</button>
          </div>
          <div className="rn-row" style={{ padding: "6px 4px" }}>
            <span className="rn-rowIc th-pdf">{S_I.pdf}</span>
            <span className="rn-rowLabel">Fraction Examples</span>
            <span className="rn-typeTag">PDF</span>
            <button className="rn-iconBtn rn-44" title="Add or edit notes">{S_I.note}</button>
          </div>
        </div>
        <button className="rn-addRes">{S_I.plus} Add resource</button>
      </div>
      <S_Co n="1" top={64} left={-10} w={185} fix>2×2 slot-fill grid kept exactly per spec §4.2 (liked). Notecards never enter the grid — the 2×2 keeps its rhythm (P3).</S_Co>
      <S_Co n="2" top={236} right={-12} w={185} fix>Notecards = one compact row each, under the grid: poster chip + title + "n media · notes". Full card only on demand (open).</S_Co>
      <S_Co n="3" top={300} right={-12} w={185} fix>Every pencil + row action ≥44px hit area on phone/tablet (P4) — visual 32px, inflated target.</S_Co>
    </div>
  );
}

/* ── Artboard 2 · Minimized quick access ── */
function SectionMinimized() {
  return (
    <div className="rn" style={{ width: 332, padding: 14 }}>
      <div className="rn-secCard">
        <SecHead minimized />
        {[
          ["slides", "Equivalent fractions deck", "SLIDES"],
          ["image", "Fraction Wall Diagram", "IMAGE"],
          ["link", "Khan Academy practice", "LINK"],
        ].map(([t, l, tag]) => (
          <div key={l} className="rn-row" style={{ padding: "6px 4px" }}>
            <span className={"rn-rowIc th-" + t}>{S_I[t]}</span>
            <span className="rn-rowLabel">{l}</span>
            <span className="rn-typeTag">{tag}</span>
            <button className="rn-iconBtn rn-44" title="Add or edit notes">{S_I.note}</button>
          </div>
        ))}
        <div style={{ marginTop: 6 }}>
          <NoteRow title="Fraction Basics" meta="3 media · notes" />
        </div>
        <button className="rn-addRes">{S_I.plus} Add quick resource</button>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: "var(--body)" }}>
        Minimized state persists per (lesson, section) — unchanged. Notecard row identical in both states,
        so the card never "jumps shape" when toggling.
      </div>
    </div>
  );
}

/* ── Artboard 3 · Phone tier (360) ── */
function SectionPhone() {
  return (
    <div className="rn" style={{ width: 360, padding: 12, background: "var(--canvas)", borderRadius: 18 }}>
      <div className="rn-secCard" style={{ padding: 10 }}>
        <SecHead />
        <div className="rn-2x2" style={{ gap: 6 }}>
          {[["s1", "Equivalent fractions deck"], ["s2", "Warm-up sheet"], ["s3", "Fraction Wall"], ["s4", "Khan Academy"]].map(([cls, label]) => (
            <div key={cls} className={"rn-slot " + cls} style={{ minHeight: 76 }}>
              <button className="rn-slotEdit" title="Add or edit notes">{S_I.note}</button>
              <span className="sl-label">{label}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <NoteRow title="Fraction Basics" meta="3 media · notes" />
        </div>
        <button className="rn-addRes">{S_I.plus} Add resource</button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: "var(--body)" }}>
        <b>Phone 360:</b> 2×2 stays 2-up (slots compress, never stack 1-up unless &lt;330px content width).
        Pencils render at rest (no hover on touch) with full 44px targets.
      </div>
    </div>
  );
}

function RNSectionSection() {
  const { DCSection, DCArtboard } = window;
  return (
    <DCSection id="section-res" title="2 · Section resources" subtitle="Center column — 2×2 kept, notecard row replaces the strip (P3), 44px notes affordance (P4)">
      <DCArtboard id="sec-expanded" label="Expanded · desktop" width={560}><SectionExpanded /></DCArtboard>
      <DCArtboard id="sec-min" label="Minimized quick access" width={380}><SectionMinimized /></DCArtboard>
      <DCArtboard id="sec-phone" label="Phone · 360" width={384}><SectionPhone /></DCArtboard>
    </DCSection>
  );
}
window.RNSectionSection = RNSectionSection;
