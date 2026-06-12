/* S4 — Notecard fullscreen + gallery · S5 — Preview/link-card/annotation · S6 — Rich text */
const { RNI: N_I, RNCallout: N_Co } = window;

/* ── S4 Artboard 1 · Fullscreen split ── */
function NotecardFullscreen() {
  return (
    <div className="rn" style={{ width: 640, padding: 14, position: "relative" }}>
      <div className="rn-fs" style={{ height: 380 }}>
        <div className="rn-fsHead">
          <span className="rn-modeBadge note">{N_I.noteCard} Fraction Basics</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>2 / 3</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            <button className="rn-iconBtn rn-44" title="Edit this card — gallery and notes" style={{ color: "var(--honey-600)", background: "var(--honey-50)" }}>{N_I.note}</button>
            <button className="rn-iconBtn rn-44" title="Close (Esc)">{N_I.x}</button>
          </span>
        </div>
        <div className="rn-fsBody">
          <div className="rn-fsMedia">
            <span className="th-image" style={{ width: 120, height: 90, borderRadius: 10, display: "grid", placeItems: "center" }}>{N_I.image}</span>
            <button className="rn-chev" style={{ left: 10 }} title="Previous (←)">{N_I.chevL}</button>
            <button className="rn-chev" style={{ right: 10 }} title="Next (→)">{N_I.chevR}</button>
            <button className="rn-iconBtn rn-44" title="Enlarge this item" style={{ position: "absolute", top: 8, right: 8, background: "var(--paper)", boxShadow: "var(--sh-xs)" }}>{N_I.enlarge}</button>
            <div className="rn-dots"><i></i><i className="on"></i><i></i></div>
          </div>
          <div className="rn-fsNotes">
            <div className="rn-notesBody">
              <h3 style={{ marginTop: 0 }}>Key teaching points</h3>
              <p>Compare unit fractions using the <a href="#">fraction wall</a>. Ask students to find two ways to show <mark>3/4 = 6/8</mark>.</p>
              <ul>
                <li>Start with halves and quarters</li>
                <li>Use the wall photo for the warm-up</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
      <N_Co n="1" top={8} right={-12} w={190} fix>Explicit <b>Edit</b> affordance in fullscreen — opens the notecard editor without closing and hunting for the pencil.</N_Co>
      <N_Co n="2" top={150} left={-10} w={185}>Carousel kept: 44px chevrons, wrap-around, ←/→ keys, 40px swipe threshold, dots ≤8 → "n / total" counter. Stacks top/bottom ≤640px.</N_Co>
      <N_Co n="3" top={250} right={-12} w={190} fix>Notes pane gets a real typographic spec (tokens): DM Sans h3, 13px body, brand links, lemon-pastel highlights — no more flat HTML dump.</N_Co>
    </div>
  );
}

/* ── S5 Artboard 1 · Link-card fallback (P5) ── */
function LinkCardState() {
  return (
    <div className="rn" style={{ width: 420, padding: 14, position: "relative" }}>
      <div className="rn-linkCard">
        <div className="rn-linkThumb">{N_I.globe}</div>
        <div className="rn-linkBody">
          <div className="rn-linkTitle">Equivalent Fractions — Khan Academy</div>
          <div className="rn-linkDesc">Practice identifying equivalent fractions with visual models…</div>
          <div className="rn-linkDomain">
            {N_I.link} khanacademy.org
            <button className="rn-btn primary" style={{ marginLeft: "auto", minHeight: 36, padding: "0 14px", fontSize: 12 }}>Open {N_I.open}</button>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: "var(--body)" }}>
        <b>Single embed authority (P5):</b> <code>canEmbed</code> from <code>/api/og-preview</code> ∧ the CSP
        frame allowlist = one shared predicate. False ⇒ THIS card — OG thumb (globe glyph fallback),
        title, description, domain, Open. An iframe is never attempted; zero blank frames.
        Loading = skeleton shimmer; OG fetch failure = same card with URL as title.
      </div>
    </div>
  );
}

/* ── S5 Artboard 2 · Preview chrome: loading / error / annotation ── */
function PreviewStates() {
  return (
    <div className="rn" style={{ width: 520, padding: 14, position: "relative" }}>
      <div className="rn-fs" style={{ height: 320 }}>
        <div className="rn-fsHead">
          <span style={{ fontWeight: 700, fontSize: 13 }}>warmup.pdf</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            <button className="rn-iconBtn rn-44" title="Open original">{N_I.open}</button>
            <button className="rn-iconBtn rn-44" title="Close (Esc)">{N_I.x}</button>
          </span>
        </div>
        <div style={{ flex: 1, background: "var(--ink-50)", position: "relative", display: "grid", placeItems: "center" }}>
          <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
            <div style={{ width: 28, height: 28, border: "3px solid var(--ink-200)", borderTopColor: "var(--brand-500)", borderRadius: "50%", margin: "0 auto 8px" }} />
            Loading preview…
          </div>
          <div style={{ position: "absolute", left: "50%", bottom: 14, transform: "translateX(-50%)" }}>
            <div className="rn-annoBar">
              <button className="rn-annoBtn on" title="Annotate — ink is temporary and clears when you close">{N_I.pen}</button>
              <button className="rn-annoBtn" title="Highlighter">{N_I.hl}</button>
              <button className="rn-annoBtn" title="Eraser">{N_I.eraser}</button>
              <span className="rn-annoSep"></span>
              <span className="rn-swatch on" style={{ background: "var(--ink-900)" }}></span>
              <span className="rn-swatch" style={{ background: "var(--urgent)" }}></span>
              <span className="rn-swatch" style={{ background: "var(--done)" }}></span>
              <span className="rn-swatch" style={{ background: "var(--hl-lemon)" }}></span>
              <span className="rn-annoSep"></span>
              <button className="rn-annoBtn" title="Undo">{N_I.undo}</button>
              <button className="rn-annoBtn" title="Redo" style={{ opacity: .4 }}>{N_I.redo}</button>
              <button className="rn-annoBtn" title="Clear all ink — cannot be undone">{N_I.trash}</button>
            </div>
          </div>
          <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)" }}>
            <span className="rn-ephemeral">{N_I.pen} Ink is live-only — it clears when you close</span>
          </div>
        </div>
      </div>
      <N_Co n="4" top={96} left={-10} w={185} fix>Designed loading state (spinner) + error state: "Couldn't load — Open original". PDF + iframe both get them.</N_Co>
      <N_Co n="5" top={216} right={-12} w={190} fix>First-annotate hint makes wipe-on-close legible (frozen rule #3). Clear = destructive → required tooltip. Token swatches + widths 2/4/8 kept.</N_Co>
    </div>
  );
}

/* ── S6 · Rich-text editor toolbar spec ── */
function RteSpec() {
  return (
    <div className="rn" style={{ width: 480, padding: 14, position: "relative" }}>
      <div className="rn-rte">
        <div className="rn-rteBar">
          <button className="rn-rteBtn on" title="Bold (⌘B)">{N_I.bold}</button>
          <button className="rn-rteBtn" title="Italic (⌘I)"><i>I</i></button>
          <button className="rn-rteBtn" title="Underline (⌘U)" style={{ textDecoration: "underline" }}>U</button>
          <button className="rn-rteBtn" title="Highlight — pick a pen color"><span style={{ width: 14, height: 14, borderRadius: 3, background: "var(--hl-lemon)", display: "inline-block" }} /></button>
          <span className="rn-rteSep"></span>
          <button className="rn-rteBtn" title="Heading">H</button>
          <button className="rn-rteBtn" title="Bulleted list">{N_I.list}</button>
          <span className="rn-rteSep"></span>
          <button className="rn-rteBtn" title="Insert link (⌘K)">{N_I.link}</button>
          <button className="rn-rteBtn" title="Insert image — upload or paste">{N_I.image}</button>
        </div>
        <div className="rn-rteBody rn-notesBody">
          <p>Compare unit fractions using the <a href="#">fraction wall</a> and ask…</p>
        </div>
      </div>
      <div style={{ marginTop: 12 }} className="rn-linkPop">
        <input className="rn-input" style={{ minHeight: 36, width: 200, padding: "6px 10px", fontSize: 12 }} defaultValue="https://khanacademy.org/…" />
        <button className="rn-btn primary" style={{ minHeight: 36, padding: "0 12px", fontSize: 12 }}>Save</button>
        <button className="rn-iconBtn rn-44" title="Open link">{N_I.open}</button>
        <button className="rn-iconBtn rn-44" title="Remove link" style={{ color: "var(--danger)" }}>{N_I.trash}</button>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: "var(--body)" }}>
        <b>Finite toolbar, this order:</b> B · I · U · Highlight (10 pens) ‖ H · List ‖ Link · Image.
        Click an existing link → the edit popover above (edit / open / remove). Insert-image routes
        through the same capture methods (sanitizer untouched — <code>SAFE_IMG_SRC</code>, trusted iframes only).
      </div>
      <N_Co n="6" top={6} right={-12} w={180} fix>Every control 44px-hit (inflated), keyboard shortcuts in tooltips, sanitize on load + emit — contract §5.4 untouched.</N_Co>
    </div>
  );
}

function RNSectionNotecard() {
  const { DCSection, DCArtboard } = window;
  return (
    <DCSection id="notecard" title="4 · Notecard fullscreen & gallery" subtitle="Split view kept — adds Edit affordance, notes typography, editable gallery (in composer)">
      <DCArtboard id="nc-fullscreen" label="Fullscreen split · desktop" width={680}><NotecardFullscreen /></DCArtboard>
    </DCSection>
  );
}

function RNSectionPreview() {
  const { DCSection, DCArtboard } = window;
  return (
    <DCSection id="preview" title="5 · Preview, link card & annotation · 6 · Rich text" subtitle="canEmbed+CSP single authority (P5) · loading/error states · live-only ink legible · finite RTE toolbar">
      <DCArtboard id="pv-linkcard" label="Link-card fallback (P5)" width={450}><LinkCardState /></DCArtboard>
      <DCArtboard id="pv-states" label="Preview chrome + annotation" width={560}><PreviewStates /></DCArtboard>
      <DCArtboard id="rte" label="Rich-text editor spec" width={520}><RteSpec /></DCArtboard>
    </DCSection>
  );
}
Object.assign(window, { RNSectionNotecard, RNSectionPreview });
