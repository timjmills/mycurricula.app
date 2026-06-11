/* S3 — Resource composer: two entries, one capture engine, staged flow (P2) */
const { RNI: C_I, RNCallout: C_Co } = window;

function CaptureRow() {
  const caps = [
    ["upload", "Upload", "Any file", "var(--brand-400)"],
    ["photo", "Photo", "Image files", "var(--tag-pink)"],
    ["link", "Link", "Paste a URL", "var(--tag-indigo)"],
    ["search", "Search", "Resource board", "var(--honey-500)"],
  ];
  return (
    <div className="rn-capRow">
      {caps.map(([ic, t, s, c]) => (
        <button key={t} className="rn-capBtn">
          <span className="cb-ic" style={{ background: c }}>{C_I[ic]}</span>
          <span className="cb-t">{t}</span>
          <span className="cb-s">{s}</span>
        </button>
      ))}
    </div>
  );
}

function CapturedStrip({ err }) {
  return (
    <div className="rn-capturedStrip">
      {[
        ["image", "wall-photo.jpg", "th-image"],
        ["pdf", "warmup.pdf", "th-pdf"],
        ["link", "khanacademy.org", "th-link"],
      ].map(([t, l, th]) => (
        <div key={l} className="rn-capItem">
          <div className={"ci-th " + th}>{C_I[t]}</div>
          <button className="rn-capX" title="Remove from this add">{C_I.x}</button>
          <div className="ci-l">{l}</div>
        </div>
      ))}
      {err ? (
        <div className="rn-capItem" style={{ borderColor: "color-mix(in srgb, var(--danger) 40%, var(--border))" }}>
          <div className="ci-th" style={{ background: "var(--danger-tint)", color: "var(--danger)" }}>{C_I.warn}</div>
          <div className="ci-l">video.mp4</div>
        </div>
      ) : null}
    </div>
  );
}

function Routing({ locked }) {
  return (
    <div className="rn-field" style={{ marginTop: 14 }}>
      <label>Destination</label>
      <div className="rn-routeRow">
        {[["Subject", "Math"], ["Unit", "u-m3"], ["Lesson", "Equivalent fractions…"], ["Section", "Standards"]].map(([k, v]) => (
          <span key={k} className={"rn-select" + (locked ? " locked" : "")} title={locked ? "Routing is locked while editing an existing card" : "Choose where this lands"}>
            <span className="sel-k">{k}</span>{v}{C_I.chevD}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Artboard 1 · Add resources — Step 1 (capture) ── */
function ComposerCapture() {
  return (
    <div className="rn" style={{ width: 520, padding: 14, position: "relative" }}>
      <div className="rn-dialog">
        <div className="rn-dlgHead">
          <span className="rn-modeBadge res">{C_I.upload} Add resources</span>
          <span className="rn-stepper">
            <span className="rn-stepDot on">1</span> Capture
            <span style={{ color: "var(--faint)" }}>→</span>
            <span className="rn-stepDot">2</span> Review &amp; route
          </span>
          <button className="rn-iconBtn rn-44" title="Close — uncommitted items are discarded">{C_I.x}</button>
        </div>
        <div className="rn-dlgBody">
          <CaptureRow />
          <button className="rn-allTools">{C_I.dots} All tools</button>
          <div className="rn-dropHint">…or drop files anywhere in this dialog</div>
          <CapturedStrip />
        </div>
        <div className="rn-dlgFoot">
          <span className="rn-sessionBadge"><span className="dot"></span> Session only</span>
          <span style={{ marginLeft: "auto" }} />
          <button className="rn-btn ghost">Cancel</button>
          <button className="rn-btn primary">Next · 3 items {C_I.chevR}</button>
        </div>
      </div>
      <C_Co n="1" top={10} left={-10} w={185} fix>Mode identity is ALWAYS visible (P2): header badge names the job. Two entry points — "Add resources" and "New notecard" — share this capture engine.</C_Co>
      <C_Co n="2" top={86} right={-12} w={180}>Capture methods unchanged: Upload / Photo / Link / Search + All-tools wall. SOON tools visibly disabled with why-tooltips.</C_Co>
      <C_Co n="3" top={332} left={-10} w={195} fix>Calm persistence messaging (P7): quiet "Session only" badge in the footer + amber dot on affected tiles. Tap = one explanation popover. No red banner in the flow.</C_Co>
    </div>
  );
}

/* ── Artboard 2 · Add resources — Step 2 (review & route) ── */
function ComposerReview() {
  return (
    <div className="rn" style={{ width: 520, padding: 14, position: "relative" }}>
      <div className="rn-dialog">
        <div className="rn-dlgHead">
          <span className="rn-modeBadge res">{C_I.upload} Add resources</span>
          <span className="rn-stepper">
            <span className="rn-stepDot done">{C_I.check}</span> Capture
            <span style={{ color: "var(--faint)" }}>→</span>
            <span className="rn-stepDot on">2</span> Review &amp; route
          </span>
          <button className="rn-iconBtn rn-44" title="Close">{C_I.x}</button>
        </div>
        <div className="rn-dlgBody">
          <div className="rn-errStrip">
            {C_I.warn}
            <span><b>video.mp4</b> failed to upload — the other 3 are saved and won't re-upload.</span>
            <button className="rn-retry">Retry</button>
          </div>
          <div style={{ marginTop: 12 }}><CapturedStrip err /></div>
          <div className="rn-field" style={{ marginTop: 14 }}>
            <label>Title <span style={{ textTransform: "none", letterSpacing: 0, color: "var(--faint)", fontWeight: 600 }}>(single item only — steers its label)</span></label>
            <input className="rn-input" defaultValue="" placeholder="Keep each item's own name" />
          </div>
          <button style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: "var(--brand-600)", minHeight: 36 }}>+ Add a note to an item (optional)</button>
          <Routing />
        </div>
        <div className="rn-dlgFoot">
          <span className="rn-sessionBadge"><span className="dot"></span> Session only</span>
          <span style={{ marginLeft: "auto" }} />
          <button className="rn-btn ghost">{C_I.chevL} Back</button>
          <button className="rn-btn primary">Add 3 resources</button>
        </div>
      </div>
      <C_Co n="4" top={78} right={-12} w={190}>Upload error = per-file strip with Retry. Succeeded uploads stay cached — never re-uploaded. Dialog never closes on failure.</C_Co>
      <C_Co n="5" top={262} left={-10} w={185}>Per-item notes collapsed by default; routing prefilled from context. Commit label counts the items.</C_Co>
    </div>
  );
}

/* ── Artboard 3 · New notecard mode ── */
function ComposerNotecard() {
  return (
    <div className="rn" style={{ width: 520, padding: 14, position: "relative" }}>
      <div className="rn-dialog">
        <div className="rn-dlgHead">
          <span className="rn-modeBadge note">{C_I.noteCard} New notecard</span>
          <button className="rn-iconBtn rn-44" style={{ marginLeft: "auto" }} title="Close">{C_I.x}</button>
        </div>
        <div className="rn-dlgBody">
          <div className="rn-field">
            <label>Card title</label>
            <input className="rn-input" defaultValue="Fraction Basics" />
          </div>
          <div className="rn-field" style={{ marginTop: 12 }}>
            <label>Media · drag to reorder — first item is the poster</label>
            <div className="rn-galEdit">
              <div className="rn-galItem poster th-image">
                <span className="gi-grip">{C_I.grip}</span>{C_I.image}
                <span className="rn-posterStar">POSTER</span>
                <button className="rn-capX" title="Remove from card">{C_I.x}</button>
              </div>
              <div className="rn-galItem th-pdf">
                <span className="gi-grip">{C_I.grip}</span>{C_I.pdf}
                <button className="rn-capX" title="Remove from card">{C_I.x}</button>
              </div>
              <div className="rn-galItem th-youtube">
                <span className="gi-grip">{C_I.grip}</span>{C_I.play}
                <button className="rn-capX" title="Remove from card">{C_I.x}</button>
              </div>
              <button className="rn-galItem" style={{ borderStyle: "dashed", color: "var(--muted)" }} title="Add media — opens the capture methods">{C_I.plus}</button>
            </div>
          </div>
          <div className="rn-field" style={{ marginTop: 12 }}>
            <label>Notes</label>
            <div className="rn-rte">
              <div className="rn-rteBar">
                <button className="rn-rteBtn">{C_I.bold}</button>
                <button className="rn-rteBtn"><i>I</i></button>
                <button className="rn-rteBtn" style={{ textDecoration: "underline" }}>U</button>
                <span className="rn-rteSep"></span>
                <button className="rn-rteBtn">{C_I.list}</button>
                <button className="rn-rteBtn">{C_I.link}</button>
                <button className="rn-rteBtn">{C_I.image}</button>
              </div>
              <div className="rn-rteBody" style={{ color: "var(--faint)" }}>Write the notes for this card — formatting, links, and images all work.</div>
            </div>
          </div>
          <Routing />
        </div>
        <div className="rn-dlgFoot">
          <span className="rn-sessionBadge"><span className="dot"></span> Session only</span>
          <span style={{ marginLeft: "auto" }} />
          <button className="rn-btn ghost">Cancel</button>
          <button className="rn-btn honey">Create notecard</button>
        </div>
      </div>
      <C_Co n="6" top={10} left={-10} w={185} fix>Notecard mode = honey identity, single screen: title · gallery · notes · route. "Edit note" on any resource opens THIS, prefilled, routing locked.</C_Co>
      <C_Co n="7" top={188} right={-12} w={190} fix>Gallery is finally editable: drag-reorder + per-item remove (AC-7). Poster = gallery[0]; reorder to change it — POSTER tag makes the rule visible.</C_Co>
    </div>
  );
}

/* ── Artboard 4 · Phone sheet (390) ── */
function ComposerPhone() {
  return (
    <div className="rn" style={{ width: 390, borderRadius: 18, overflow: "hidden", background: "rgba(28,27,46,.32)", padding: "56px 0 0" }}>
      <div style={{ background: "var(--surface)", borderRadius: "18px 18px 0 0", boxShadow: "var(--sh-lg)" }}>
        <div style={{ width: 36, height: 4, borderRadius: 999, background: "var(--ink-200)", margin: "8px auto 0" }} />
        <div className="rn-dlgHead" style={{ borderBottom: "1px solid var(--hairline)" }}>
          <span className="rn-modeBadge res">{C_I.upload} Add resources</span>
          <span className="rn-stepper"><span className="rn-stepDot on">1</span>/2</span>
          <button className="rn-iconBtn rn-44" title="Close">{C_I.x}</button>
        </div>
        <div className="rn-dlgBody" style={{ padding: 12 }}>
          <div className="rn-capRow" style={{ gridTemplateColumns: "1fr 1fr" }}>
            {[["upload", "Upload", "var(--brand-400)"], ["photo", "Photo", "var(--tag-pink)"], ["link", "Link", "var(--tag-indigo)"], ["search", "Search", "var(--honey-500)"]].map(([ic, t, c]) => (
              <button key={t} className="rn-capBtn" style={{ flexDirection: "row", justifyContent: "flex-start", padding: "10px 12px" }}>
                <span className="cb-ic" style={{ background: c, width: 30, height: 30 }}>{C_I[ic]}</span>
                <span className="cb-t">{t}</span>
              </button>
            ))}
          </div>
          <CapturedStrip />
        </div>
        <div className="rn-dlgFoot">
          <span className="rn-sessionBadge"><span className="dot"></span> Session only</span>
          <span style={{ marginLeft: "auto" }} />
          <button className="rn-btn primary" style={{ minHeight: 48 }}>Next · 3 {C_I.chevR}</button>
        </div>
      </div>
      <div style={{ padding: "10px 14px", fontSize: 11, color: "var(--paper)" }}>
        <b>Phone:</b> bottom sheet, 2-up capture buttons (44px+), sticky footer. Step 2 scrolls; routing selects go full-width stacked.
      </div>
    </div>
  );
}

function RNSectionComposer() {
  const { DCSection, DCArtboard } = window;
  return (
    <DCSection id="composer" title="3 · Composer" subtitle="Two entries, one capture engine, staged capture → review (P2) · calm session messaging (P7) · editable gallery (AC-7)">
      <DCArtboard id="comp-capture" label="Add resources · step 1 capture" width={560}><ComposerCapture /></DCArtboard>
      <DCArtboard id="comp-review" label="Add resources · step 2 review & route" width={560}><ComposerReview /></DCArtboard>
      <DCArtboard id="comp-note" label="New notecard / edit note" width={560}><ComposerNotecard /></DCArtboard>
      <DCArtboard id="comp-phone" label="Phone sheet · 390" width={390}><ComposerPhone /></DCArtboard>
    </DCSection>
  );
}
window.RNSectionComposer = RNSectionComposer;
