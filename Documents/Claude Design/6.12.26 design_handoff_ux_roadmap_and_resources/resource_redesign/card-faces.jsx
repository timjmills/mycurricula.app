/* S0 — Finished card faces: resource cards + notecards.
   Canonical Weekly-card recipe, VIVID style (the app default): subject tint
   fills the body via the .cp-subj cascade; --c-surface-strong header band
   with an icon tile; 4px subject-deep left stripe. The teacher's wash
   (free pastel choice) overrides only the body — band + stripe stay locked. */
const { RNI: F_I } = window;

/* small icons local to this surface */
const F_X = {
  copy: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  copyTo: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/><path d="M12 15h6M15 12l3 3-3 3"/></svg>,
  spk: <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 10v4h4l5 4V6L7 10zM16 8a4.5 4.5 0 0 1 0 8M18.5 5.5a8 8 0 0 1 0 13"/></svg>,
};

/* ── The card shell ──
   subject: cp-subj id (locked). wash: undefined = subject tint (vivid
   default) · "paper" = white · number = --subj-N-tint pastel.
   icon: resource-type glyph for the header tile.
   Em-dash titles split into title + subtitle (BUILD_STANDARD §5). */
function CFCard({ subject, wash, icon, meta, title, width, children, style }) {
  const [t, sub] = title.includes(" — ") ? title.split(" — ") : [title, null];
  const washVal =
    wash === "paper" ? "var(--paper)" :
    typeof wash === "number" ? `var(--subj-${wash}-tint)` : null;
  return (
    <div
      className={`cfc cp-subj ${subject}`}
      style={{ ...(washVal ? { "--wash": washVal } : null), ...(width ? { width } : null), ...style }}
    >
      <div className="cfc-head">
        <span className="cfc-ic">{icon || F_I.link}</span>
        <div className="cfc-hgroup">
          <div className="cfc-meta">{meta}</div>
          <div className="cfc-title">{t}</div>
          {sub ? <div className="cfc-subtitle">{sub}</div> : null}
        </div>
        <button className="cfc-kebab" title="Card actions">{F_I.dots}</button>
      </div>
      {children}
    </div>
  );
}

function CFSrc({ ini, color, domain }) {
  return (
    <span className="cfc-src">
      <span className="fv" style={{ background: color }}>{ini}</span>
      <span className="dm">{domain}</span>
    </span>
  );
}

/* ── mock previews (stand-ins for live thumbnails) ── */
function MockIxl() {
  return (
    <div className="cfm-ixl">
      <div className="q">{F_X.spk}<span>Use the area model to find <b>3 × 15</b>.</span></div>
      <div className="model">
        <div className="seg" style={{ width: 96, background: "#fcd9b8" }}>10</div>
        <div className="seg" style={{ width: 48, background: "#f9c2dc" }}>5</div>
      </div>
      <span className="submit">Submit</span>
    </div>
  );
}
function MockSheet() {
  return (
    <div className="cfm-sheet">
      <div className="t">Multiplication Grids</div>
      <div className="s">Multiplying 4-digit numbers using the grid method</div>
      <table><tbody>
        <tr><td>×</td><td>6000</td><td>100</td><td>30</td><td>9</td></tr>
        <tr><td>7</td><td></td><td></td><td></td><td></td></tr>
      </tbody></table>
      <table><tbody>
        <tr><td>×</td><td>6000</td><td>900</td><td>70</td><td>5</td></tr>
        <tr><td>3</td><td></td><td></td><td></td><td></td></tr>
      </tbody></table>
    </div>
  );
}
function MockVideo({ dur }) {
  return (
    <div className="cfm-video">
      <div className="pb">{F_I.play}</div>
      <span className="dur">{dur || "4:32"}</span>
    </div>
  );
}

/* ════ Artboard 1 · The three finished faces ════ */
function FaceResource() {
  return (
    <CFCard subject="math" icon={F_I.link} meta="Math · Link" title="Area Model Multiplication">
      <div className="cfc-preview"><MockIxl /></div>
      <div className="cfc-caption">IXL · Multiply 1-digit by 2-digit numbers using area models II</div>
      <div className="cfc-foot">
        <CFSrc ini="ixl" color="#59b210" domain="ixl.com" />
        <span className="cfc-type">LINK</span>
      </div>
    </CFCard>
  );
}

function FaceResourceNotes() {
  return (
    <CFCard subject="math" wash={11} icon={F_I.pdf} meta="Math · PDF" title="Extra Practice 1×4">
      <div className="cfc-preview"><MockSheet /></div>
      <div className="cfc-notes">
        <div className="tx">
          Print 2-up for table groups. Early finishers move to the challenge row —
          remind them to estimate FIRST, then check with the grid. Aisha &amp; Omar
          pair up; they still need the place-value mat from Tuesday.
        </div>
        <button className="cfc-more">…more</button>
      </div>
      <div className="cfc-foot">
        <CFSrc ini="P" color="#d4453a" domain="2 pages" />
        <span className="cfc-noteFlag">{F_I.note} notes</span>
        <span className="cfc-type">PDF</span>
      </div>
    </CFCard>
  );
}

function FaceNotecard() {
  return (
    <CFCard subject="writing" icon={F_I.noteCard} meta="Writing · Notecard" title="Day 1 — Opinion Writing">
      <div className="cfc-body clamped">
        <p><b>Linked to IPC this week</b> to strengthen understanding of the unit.</p>
        <h4>Guiding questions</h4>
        <ul>
          <li>What do <i>you</i> think?</li>
          <li>Why do you think that way?</li>
          <li>How can your ideas help others?</li>
        </ul>
        <h4>What is an opinion?</h4>
        <p>Start simple: <mark>"An opinion is what YOU think or feel about something."</mark> Contrast with facts ("The sky is blue" vs. "Blue is the best color"). Anchor examples on the <a>Opinion Writing Unit</a> minilessons.</p>
        <div className="cfc-check on"><span className="bx">{F_I.check}</span><span>Print sentence-stem cards</span></div>
        <div className="cfc-check"><span className="bx"></span><span>Queue partner-talk timer (3 min)</span></div>
        <div className="cfc-inlineImg"><div className="cfm-photo"><span>pasted image · opinion vs fact chart</span></div></div>
        <p><b>Class discussion:</b> gather examples from the partners; highlight the <b>opinion</b> and the <b>reason</b>.</p>
      </div>
      <button className="cfc-readmore">Read more {F_I.chevD}</button>
      <div className="cfc-foot">
        <span className="cfc-noteFlag">{F_I.noteCard} notecard</span>
        <span className="cfc-type">NOTE</span>
      </div>
    </CFCard>
  );
}

/* ════ Artboard 2 · Preview is never broken ════ */
function FallbackStates() {
  return (
    <div className="cf-row">
      <CFCard subject="math" icon={F_I.link} meta="Math · Link" title="Equivalent Fractions">
        <div className="cfc-preview">
          <div className="cfm-link">
            <span className="ini" style={{ background: "#14bf96" }}>K</span>
            <span className="dom">khanacademy.org</span>
            <span className="url">/math/cc-fifth-grade/equivalent-fractions</span>
          </div>
        </div>
        <div className="cfc-caption">Site offers no thumbnail → designed link card. Never a broken-image frame.</div>
        <div className="cfc-foot"><CFSrc ini="K" color="#14bf96" domain="khanacademy.org" /><span className="cfc-type">LINK</span></div>
      </CFCard>
      <CFCard subject="math" icon={F_I.image} meta="Math · Image" title="Anchor Chart — Area Method">
        <div className="cfc-preview"><div className="cfm-photo"><span>teacher photo upload</span></div></div>
        <div className="cfc-caption">Teacher pastes / uploads a custom thumbnail — overrides the site's.</div>
        <div className="cfc-foot"><CFSrc ini="P" color="#8a64d6" domain="photo" /><span className="cfc-type">IMAGE</span></div>
      </CFCard>
      <CFCard subject="math" icon={F_I.link} meta="Math · Link" title="Divide by 1 Digit">
        <div className="cfc-preview"><MockIxl /></div>
        <div className="cfc-caption">Page allows it → auto-screenshot of the live exercise, refreshed weekly.</div>
        <div className="cfc-foot"><CFSrc ini="ixl" color="#59b210" domain="ixl.com" /><span className="cfc-type">LINK</span></div>
      </CFCard>
    </div>
  );
}

/* ════ Artboard 3 · Kebab menu — duplicate + recolor ════ */
function CardMenu() {
  const tints = [1, 2, 5, 7, 10, 11, 12, 13, 9];
  return (
    <div className="cf-row">
      <FaceResource />
      <div>
        <div className="cf-lblRow">card ⋯ menu</div>
        <div className="cfc-menu cp-subj math">
          <button className="cfc-menuItem">{F_I.enlarge} Enlarge</button>
          <button className="cfc-menuItem">{F_I.open} Open original</button>
          <button className="cfc-menuItem">{F_I.note} Add / edit note</button>
          <div className="cfc-menuSep"></div>
          <button className="cfc-menuItem">{F_X.copy} Duplicate</button>
          <button className="cfc-menuItem">{F_X.copyTo} Duplicate to…</button>
          <div className="cfc-menuSep"></div>
          <div className="cfc-menuLbl">Card color</div>
          <div className="cfc-swatches">
            <button className="cfc-sw subj on" title="Subject color (default)"></button>
            <button className="cfc-sw" title="White" style={{ background: "var(--paper)" }}></button>
            {tints.map((n) => (
              <button key={n} className="cfc-sw" title="Set card color"
                style={{ background: `var(--subj-${n}-tint)`, borderColor: `var(--subj-${n})` }}></button>
            ))}
          </div>
          <div className="cfc-menuSep"></div>
          <button className="cfc-menuItem danger">{F_I.trash} Remove from lesson</button>
        </div>
      </div>
    </div>
  );
}

/* ════ Artboard 4 · Same card, subject default + teacher washes ════ */
function WashVariants() {
  const variants = [
    [undefined, "subject (default)"],
    ["paper", "white"],
    [2, "apricot wash"],
    [11, "cyan wash"],
  ];
  return (
    <div className="cf-row">
      {variants.map(([w, lbl], i) => (
        <div key={i} className="cf-col">
          <CFCard subject="math" wash={w} icon={F_I.youtube} meta="Math · Video" title="Division Patterns">
            <div className="cfc-preview"><MockVideo /></div>
            <div className="cfc-foot">
              <CFSrc ini="▶" color="#e03d3d" domain="youtube.com" />
              <span className="cfc-type">VIDEO</span>
            </div>
          </CFCard>
          <span className="cf-lbl">{lbl}</span>
        </div>
      ))}
    </div>
  );
}

/* ════ Artboard 5 · Lightbox (one click) ════ */
function Lightbox() {
  return (
    <div className="cfc-lightbox cp-subj math" style={{ width: 600 }}>
      <div className="cfc-lbCard">
        <div className="cfc-lbHead">
          <span className="cfc-lbTitle">Division Patterns</span>
          <button className="rn-iconBtn rn-44" title="Previous resource">{F_I.chevL}</button>
          <button className="rn-iconBtn rn-44" title="Next resource">{F_I.chevR}</button>
          <button className="rn-iconBtn rn-44" title="Close (Esc)">{F_I.x}</button>
        </div>
        <div className="cfc-lbStage">
          <div className="cfm-video" style={{ position: "absolute", inset: 0 }}>
            <div className="pb">{F_I.play}</div>
            <span className="dur">1:08 / 4:32</span>
          </div>
          <div className="cfc-lbTools">
            <button className="on" title="Pen — annotate over the media">{F_I.pen}</button>
            <button title="Highlighter">{F_I.hl}</button>
            <button title="Eraser">{F_I.eraser}</button>
            <button title="Undo">{F_I.undo}</button>
            <button title="Redo">{F_I.redo}</button>
          </div>
        </div>
        <div className="cfc-lbFoot">
          <span>Plays video · steps through gallery · ink is live-only</span>
          <span className="cfc-lbHint">{F_I.enlarge} Double-click → fullscreen</span>
        </div>
      </div>
    </div>
  );
}

/* ════ Artboard 6 · The rail, rebuilt with cards ════ */
function RailWithCards() {
  return (
    <div className="rn" style={{ width: 312, padding: 16 }}>
      <div className="rn-panel">
        <div className="rn-panelHead">
          <span className="rn-panelTitle">Resources</span>
          <span className="rn-countChip">9</span>
          <div className="rn-panelActions">
            <button className="rn-iconBtn rn-44" title="Add resources to this lesson">{F_I.plus}</button>
            <button className="rn-iconBtn rn-44" title="Collapse panel">{F_I.chevD}</button>
          </div>
        </div>
        <div className="rn-tabs">
          {[["All", 9], ["Slides", 2], ["Handouts", 4], ["Tools", 2], ["Notes", 1]].map(([t, c]) => (
            <button key={t} className={"rn-tab" + (t === "All" ? " on" : "")}>{t}<span className="ct">{c}</span></button>
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 12px 12px" }}>
          <CFCard subject="math" icon={F_I.link} meta="Math · Link" title="Area Model Multiplication" width="100%">
            <div className="cfc-preview" style={{ height: 104 }}><MockIxl /></div>
            <div className="cfc-foot"><CFSrc ini="ixl" color="#59b210" domain="ixl.com" /><span className="cfc-type">LINK</span></div>
          </CFCard>
          <CFCard subject="writing" icon={F_I.noteCard} meta="Writing · Notecard" title="Day 1 — Opinion Writing" width="100%">
            <div className="cfc-body clamped" style={{ maxHeight: 88 }}>
              <p><b>Linked to IPC this week.</b> Start simple: an opinion is what YOU think or feel. Contrast opinions with facts, partner-talk, then chart opinion vs. reason from the discussion.</p>
            </div>
            <button className="cfc-readmore">Read more {F_I.chevD}</button>
            <div className="cfc-foot"><span className="cfc-noteFlag">{F_I.noteCard} notecard</span><span className="cfc-type">NOTE</span></div>
          </CFCard>
          <CFCard subject="math" wash={11} icon={F_I.pdf} meta="Math · PDF" title="Extra Practice 1×4" width="100%">
            <div className="cfc-preview" style={{ height: 104 }}><MockSheet /></div>
            <div className="cfc-foot"><CFSrc ini="P" color="#d4453a" domain="2 pages" /><span className="cfc-noteFlag">{F_I.note} notes</span><span className="cfc-type">PDF</span></div>
          </CFCard>
        </div>
      </div>
    </div>
  );
}

function RNSectionCards() {
  const { DCSection, DCArtboard } = window;
  return (
    <DCSection id="cards" title="0 · Card faces — finished" subtitle="Vivid Weekly-card recipe: subject tint fills the body, --c-surface-strong header band + icon tile, 4px deep left stripe (locked) · teacher wash overrides the body only · uniform inset preview · click = lightbox, double-click = fullscreen">
      <DCArtboard id="cards-faces" label="Resource · Resource + notes · Notecard" width={840}>
        <div className="rn cf-row" style={{ padding: 24 }}>
          <FaceResource />
          <FaceResourceNotes />
          <FaceNotecard />
        </div>
      </DCArtboard>
      <DCArtboard id="cards-fallback" label="Preview is never broken — 3 sources" width={840}>
        <div className="rn" style={{ padding: 24 }}><FallbackStates /></div>
      </DCArtboard>
      <DCArtboard id="cards-menu" label="⋯ menu — duplicate + card color" width={540}>
        <div className="rn" style={{ padding: 24 }}><CardMenu /></div>
      </DCArtboard>
      <DCArtboard id="cards-washes" label="Subject default · white · teacher washes" width={1110}>
        <div className="rn" style={{ padding: 24 }}><WashVariants /></div>
      </DCArtboard>
      <DCArtboard id="cards-lightbox" label="Click → functional lightbox" width={650}>
        <div className="rn" style={{ padding: 24 }}><Lightbox /></div>
      </DCArtboard>
      <DCArtboard id="cards-rail" label="Resources rail, rebuilt with cards" width={344}>
        <RailWithCards />
      </DCArtboard>
    </DCSection>
  );
}
window.RNSectionCards = RNSectionCards;
