// artboards-edit.jsx — Inline editing demo
// Showcases the CPEditableText component + floating color/highlight toolbar
// across the surfaces it touches: lesson title, daily note body, day shoutbox.

function ABEditingDemo() {
  return (
    <div className="cp-root" style={{ height: "100%", display: "flex", flexDirection: "column", background: "var(--ink-50)" }}>
      <div style={{ padding: "16px 22px 12px", background: "var(--paper)", borderBottom: "1px solid var(--ink-100)" }}>
        <div style={{ fontSize: 11, color: "var(--ink-400)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600 }}>Inline editing</div>
        <h1 style={{ margin: "3px 0 0", fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>Color-code titles &amp; text anywhere</h1>
        <div style={{ fontSize: 12.5, color: "var(--ink-500)", marginTop: 4, textWrap: "pretty" }}>
          Click any title, body, or note. A floating toolbar appears with bold / italic / underline, text color, and highlight swatches. Works in every view and every mode.
        </div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 24, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 18, maxWidth: 1180 }}>
        {/* Lesson title demo */}
        <DemoCard num="01" label="Lesson title">
          <div style={{ padding: 16, background: "var(--paper)", border: "1px solid var(--ink-150)", borderRadius: 6 }}>
            <div style={{ fontSize: 10, color: "var(--math)", fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>Math · Unit 3</div>
            <h3 style={{ margin: "4px 0 6px", fontSize: 18, fontWeight: 600, letterSpacing: -0.2, lineHeight: 1.25 }}>
              <CPEditableText value={`Fractions as <span style="color: #2b6cff">division</span> — <span style="background-color: #fdf3c0">bake sale</span> problem`} />
            </h3>
            <div style={{ fontSize: 12.5, color: "var(--ink-500)", lineHeight: 1.5 }}>
              <CPEditableText multiline value={`Anchor problem: <strong>5 cookies shared by 4 friends</strong>. Students use bar models then long division to connect the two representations.`} />
            </div>
          </div>
        </DemoCard>

        {/* Daily note demo */}
        <DemoCard num="02" label="Daily note · personal">
          <div style={{ padding: "10px 12px", borderRadius: 5, background: "var(--urgent-bg)", borderLeft: "3px solid var(--urgent)" }}>
            <div style={{ fontSize: 10, color: "var(--urgent)", fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 4 }}>Urgent · personal</div>
            <div style={{ fontSize: 13, color: "var(--ink-900)" }}>
              <CPEditableText multiline value={`Sub for Lena <span style="background-color: #fde6e8">12:30–1:30</span> — leave printed bell ringer.`} />
            </div>
          </div>
        </DemoCard>

        {/* Day shoutbox demo */}
        <DemoCard num="03" label="Day shoutbox · team">
          <div style={{ padding: 12, background: "var(--paper)", border: "1px solid var(--ink-150)", borderRadius: 6 }}>
            <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
              <CPAvatar teacher={{ id: "om", name: "Omar Bishara", initials: "OM" }} size={26} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>Omar Bishara <span style={{ color: "var(--ink-400)", fontWeight: 400 }}>· 8:14 AM</span></div>
                <div style={{ fontSize: 13, color: "var(--ink-900)", marginTop: 2, lineHeight: 1.45 }}>
                  <CPEditableText multiline value={`Fire drill at <span style="background-color: #fdf3c0">9:45 sharp</span> today — please end whatever you're in <strong>2 min early</strong>.`} />
                </div>
              </div>
            </div>
          </div>
        </DemoCard>

        {/* Unit name demo */}
        <DemoCard num="04" label="Unit name">
          <div style={{ padding: 14, background: "var(--paper)", border: "1px solid var(--ink-150)", borderRadius: 6, borderLeft: "4px solid var(--reading)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--reading)", padding: "2px 7px", borderRadius: 3, border: "1px solid var(--reading)", fontWeight: 600 }}>UNIT 2</span>
              <span style={{ fontSize: 11, color: "var(--reading)", fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase" }}>Reading</span>
            </div>
            <h3 style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 600, letterSpacing: -0.4 }}>
              <CPEditableText value={`<span style="background-color: #d8f0d8">Realistic Fiction</span> — <em>Wonder</em>`} />
            </h3>
          </div>
        </DemoCard>

        {/* Long-form note */}
        <DemoCard num="05" label="Long-form notes" cols={2}>
          <div style={{ padding: 16, background: "var(--paper)", border: "1px solid var(--ink-150)", borderRadius: 6 }}>
            <div style={{ fontSize: 10, color: "var(--ink-500)", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>Lesson notes · private</div>
            <div style={{ fontSize: 13, color: "var(--ink-700)", lineHeight: 1.6 }}>
              <CPEditableText multiline value={`Pull aside <span style="background-color: #fdf3c0"><strong>Aya, Tariq, Lara</strong></span> if they're still on the array model. Aya needs the <span style="color: #2b6cff">bar-model handout</span>; Tariq does best with <span style="background-color: #d8f0d8">verbal prompting</span>; Lara should partner with Sofia who can mentor.`} />
            </div>
          </div>
        </DemoCard>
      </div>
    </div>
  );
}

function DemoCard({ num, label, children, cols }) {
  return (
    <div style={{ gridColumn: cols === 2 ? "1 / -1" : "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ink-400)", fontWeight: 500 }}>{num}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-500)", letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

Object.assign(window, { ABEditingDemo });
