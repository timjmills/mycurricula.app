// artboards-shell.jsx — Themed chrome demos.
//
// The user's latest direction: the chosen Normal/Highlight palette
// should also tint the menus, sidebars, and top bar — not just the
// cards. This file builds a realistic in-app shell (top bar + left
// sidebar + content area) and renders it in:
//
//   • 3 card styles  (Quiet · Mid-Calm · Mid-Vivid)
//   • × 2 palettes   (Normal · Highlight)
//   = 6 themed shells the team can compare.
//
// Crucially, the 3 view modes (Advanced grid / Simple / Task) live
// INSIDE the shell as a neutral toggle in the top bar — they do NOT
// re-skin when the palette changes. That separation is shown by an
// explicit Mode-toggle that stays the same across all 6 themed shells.

// ── Small primitives ──────────────────────────────────────────────
const ShellTopBar = ({ chrome, mode, onMode, paletteLabel, styleLabel }) => (
  <div style={{
    display: "flex", alignItems: "center", gap: 14,
    padding: "12px 18px", background: chrome.topbar,
    borderBottom: `1px solid ${chrome.topbarBd}`,
  }}>
    <span style={{
      width: 26, height: 26, borderRadius: 8,
      background: chrome.accent, color: "#fff",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: 13, fontWeight: 700, letterSpacing: -0.3,
    }}>CP</span>
    <span style={{ fontSize: 14, fontWeight: 700, color: chrome.ink, letterSpacing: -0.3 }}>Curriculum Planner</span>
    <span style={{ flex: 1 }} />
    <div style={{
      display: "inline-flex", padding: 3, background: "#F2F4F8", borderRadius: 999,
    }}>
      {[
        { id: "advanced", label: "Advanced" },
        { id: "simple",   label: "Simple" },
        { id: "task",     label: "Task" },
      ].map(m => (
        <button key={m.id} onClick={() => onMode(m.id)} style={{
          padding: "5px 13px", fontSize: 11.5, fontWeight: 600, borderRadius: 999,
          background: mode === m.id ? "#0B181E" : "transparent",
          color: mode === m.id ? "#fff" : "#475569",
          border: 0, cursor: "pointer",
        }}>{m.label}</button>
      ))}
    </div>
    <span style={{ fontSize: 10.5, color: chrome.muted, padding: "2px 9px", borderRadius: 999, background: "#F2F4F8" }}>
      {styleLabel} · {paletteLabel}
    </span>
  </div>
);

const ShellSidebar = ({ chrome, paletteType, mapping, activeSubject = "math" }) => {
  const items = [
    { id: "today",   label: "Today",        glyph: "·" },
    { id: "weekly",  label: "This week",    glyph: "·" },
    { id: "schedule", label: "Schedule",    glyph: "·" },
    { id: "tasks",   label: "Tasks",        glyph: "·" },
    { id: "catchup", label: "Catch up",     glyph: "·", badge: 3 },
  ];
  return (
    <div style={{
      width: 220, flex: "0 0 auto",
      background: chrome.sidebar,
      borderRight: `1px solid ${chrome.topbarBd}`,
      padding: "14px 10px", display: "flex", flexDirection: "column", gap: 14,
    }}>
      {/* Primary nav */}
      <div>
        <div style={{ fontSize: 10, color: chrome.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, padding: "4px 10px 6px" }}>Plan</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {items.map((it, i) => {
            const active = i === 1;
            return (
              <div key={it.id} style={{
                display: "flex", alignItems: "center", gap: 9,
                padding: "7px 10px", borderRadius: 8,
                background: active ? chrome.navActiveBg : "transparent",
                color: active ? chrome.navActiveFg : chrome.sidebarFg,
                fontSize: 13, fontWeight: active ? 600 : 500,
                cursor: "pointer",
              }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: active ? chrome.accentDeep : "#CBD5E1" }} />
                <span style={{ flex: 1 }}>{it.label}</span>
                {it.badge && (
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    padding: "1px 7px", borderRadius: 999,
                    background: chrome.accent, color: chrome.accentDeep,
                  }}>{it.badge}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Subject list — uses palette colors */}
      <div>
        <div style={{ fontSize: 10, color: chrome.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, padding: "4px 10px 6px" }}>Subjects</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <window.PaletteProvider type={paletteType} mapping={mapping}>
            {SUBJECTS.map(s => (
              <window.SidebarSubjectRow key={s.id} subject={s} active={s.id === activeSubject} />
            ))}
          </window.PaletteProvider>
        </div>
      </div>
    </div>
  );
};

// Subject row in the sidebar — pulls color from palette context so it
// re-tints automatically when palette switches.
const SidebarSubjectRow = ({ subject, active }) => {
  const swatch = window.useSubjectColor(subject.id);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "5px 10px", borderRadius: 7,
      background: active ? swatch.bg : "transparent",
      cursor: "pointer",
    }}>
      <span style={{
        width: 14, height: 14, borderRadius: 4,
        background: swatch.stripe, flex: "0 0 auto",
      }} />
      <span style={{ fontSize: 12.5, fontWeight: active ? 600 : 500, color: swatch.deep }}>{subject.name}</span>
    </div>
  );
};

Object.assign(window, { SidebarSubjectRow });

// ── A single themed shell — top bar + sidebar + content ────────────
const ThemedShell = ({ styleId, paletteType, mapping = window.DEFAULT_SUBJECT_MAPPING, accentSubject = "math", contentSubject = "math" }) => {
  const [mode, setMode] = React.useState("advanced");
  return (
    <window.PaletteProvider type={paletteType} mapping={mapping}>
      <ThemedShellInner styleId={styleId} paletteType={paletteType} mapping={mapping}
        accentSubject={accentSubject} contentSubject={contentSubject}
        mode={mode} onMode={setMode} />
    </window.PaletteProvider>
  );
};

const ThemedShellInner = ({ styleId, paletteType, mapping, accentSubject, contentSubject, mode, onMode }) => {
  const chrome = window.useChromeTokens(accentSubject);
  const styleLabel = styleId === "quiet" ? "Quiet" : styleId === "calm" ? "Mid-Calm" : "Mid-Vivid";
  const paletteLabel = paletteType === "normal" ? "Normal" : "Highlight";
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: chrome.pageBg }}>
      <ShellTopBar chrome={chrome} mode={mode} onMode={onMode} paletteLabel={paletteLabel} styleLabel={styleLabel} />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <ShellSidebar chrome={chrome} paletteType={paletteType} mapping={mapping} activeSubject={contentSubject} />
        <div style={{ flex: 1, overflow: "auto", padding: 16 }}>
          <ShellContent styleId={styleId} mode={mode} contentSubject={contentSubject} />
        </div>
      </div>
    </div>
  );
};

// Content area renders the lessons in the chosen card style. View mode
// (advanced/simple/task) changes the LAYOUT but not the palette — that
// separation is the whole point of the new system.
const ShellContent = ({ styleId, mode, contentSubject }) => {
  // grab a handful of lessons across subjects so the page feels alive
  const lessons = SUBJECTS.slice(0, 5).map(s =>
    LESSONS.find(l => l.subject === s.id && l.day === 1) || LESSONS.find(l => l.subject === s.id)
  ).filter(Boolean);

  const Card = ({ lesson, dense }) => {
    if (styleId === "quiet") return <CPLessonCard lesson={lesson} narrow />;
    if (styleId === "calm")  return <window.MidCalmCardV1 lesson={lesson} dense={dense} />;
    if (styleId === "vivid") return <window.MidVividCardV1 lesson={lesson} dense={dense} />;
    return null;
  };

  if (mode === "task") {
    // Task mode — flat checklist. Same layout regardless of palette;
    // only the card colors change because the palette is active.
    return (
      <div>
        <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Monday · {lessons.length} tasks</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {lessons.map(l => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 12px", background: "#fff", border: "1px solid #ECEFF4", borderRadius: 8 }}>
              <span style={{ width: 18, height: 18, borderRadius: 4, border: "2px solid #CBD5E1", flex: "0 0 auto" }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "#0B181E" }}>{l.title}</div>
                <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 1 }}>{SUBJECT_BY_ID[l.subject].name}</div>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "#475569", background: "#F2F4F8", padding: "2px 8px", borderRadius: 999, letterSpacing: 0.4, textTransform: "uppercase" }}>To do</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (mode === "simple") {
    // Simple mode — bigger cards, single column, generous spacing.
    return (
      <div style={{ maxWidth: 620 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#0B181E", letterSpacing: -0.3, marginBottom: 12 }}>Today's lessons</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {lessons.slice(0, 3).map(l => <Card key={l.id} lesson={l} />)}
        </div>
      </div>
    );
  }

  // Advanced — week-grid feel, dense layout
  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "#0B181E", letterSpacing: -0.3, marginBottom: 12 }}>This week</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {lessons.map(l => <Card key={l.id} lesson={l} dense />)}
        {lessons.length > 0 && (
          <Card lesson={{ ...lessons[0], id: "modded", modified: true, title: "Modified — bar models extension" }} dense />
        )}
      </div>
    </div>
  );
};

Object.assign(window, { ThemedShell, ShellContent });

// ── Artboards ──────────────────────────────────────────────────────

// Six-shell grid: three styles × two palettes. The big payoff —
// every theme rendered with its own chrome, all on the same screen.
const ABSixShells = () => {
  const styles = ["quiet", "calm", "vivid"];
  const palettes = ["normal", "highlight"];
  return (
    <div style={{ height: "100%", overflow: "auto", background: "#F6F7F9", padding: 22 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Six themed shells</div>
          <h2 style={{ margin: "4px 0 6px", fontSize: 22, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4 }}>Each style × each palette, with themed chrome</h2>
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.55, textWrap: "pretty" }}>
            Sidebar, top bar, and subject rows now follow the chosen palette. The Mode toggle (Advanced · Simple · Task) sits in the top bar of every shell and stays neutral — it's a structural switch, not a color one. Each shell starts in Advanced mode; click the toggle to confirm it doesn't re-skin.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {styles.map(s => palettes.map(p => (
            <div key={s + p} style={{
              background: "#fff", border: "1px solid #ECEFF4", borderRadius: 14, overflow: "hidden",
              boxShadow: "0 4px 14px rgba(11,24,30,.06)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid #ECEFF4", background: "#FAFBFD" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: "#0B181E", padding: "2px 8px", borderRadius: 999, letterSpacing: 0.5, textTransform: "uppercase" }}>{s}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: p === "highlight" ? "#9C1377" : "#1A4ED9", padding: "2px 8px", borderRadius: 999, letterSpacing: 0.5, textTransform: "uppercase" }}>{p}</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: "#64748B" }}>shell · sidebar · subjects · content</span>
              </div>
              <div style={{ height: 460 }}>
                <ThemedShell styleId={s} paletteType={p} />
              </div>
            </div>
          )))}
        </div>
      </div>
    </div>
  );
};

// Mode separation — same shell at three view modes; palette stays constant.
const ABModeSeparation = () => {
  const [shell, setShell] = React.useState({ style: "vivid", palette: "normal" });
  return (
    <div style={{ height: "100%", overflow: "auto", background: "#F6F7F9", padding: 22 }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>Modes stay neutral</div>
          <h2 style={{ margin: "4px 0 6px", fontSize: 22, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4 }}>Theme controls the look; Mode controls the layout</h2>
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.55, textWrap: "pretty" }}>
            Same theme (<strong>Mid-Vivid · Normal</strong> below), three different view modes. The palette colors carry through, but the mode toggle changes layout density and primary actions — not chrome color.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {[["quiet","Quiet"],["calm","Mid-Calm"],["vivid","Mid-Vivid"]].map(([id, lbl]) => (
            <button key={id} onClick={() => setShell(s => ({ ...s, style: id }))}
              style={pillBtn(shell.style === id)}>{lbl}</button>
          ))}
          <span style={{ width: 8 }} />
          {[["normal","Normal"],["highlight","Highlight"]].map(([id, lbl]) => (
            <button key={id} onClick={() => setShell(s => ({ ...s, palette: id }))}
              style={pillBtn(shell.palette === id)}>{lbl}</button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {["advanced", "simple", "task"].map(m => (
            <div key={m} style={{ background: "#fff", border: "1px solid #ECEFF4", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", borderBottom: "1px solid #ECEFF4", background: "#FAFBFD" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#fff", background: "#0B181E", padding: "2px 8px", borderRadius: 999, letterSpacing: 0.5, textTransform: "uppercase" }}>{m}</span>
              </div>
              <div style={{ height: 460 }}>
                <ForcedModeShell styleId={shell.style} paletteType={shell.palette} mode={m} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ForcedModeShell = ({ styleId, paletteType, mode }) => (
  <window.PaletteProvider type={paletteType}>
    <ThemedShellInner styleId={styleId} paletteType={paletteType}
      mapping={window.DEFAULT_SUBJECT_MAPPING} accentSubject="math" contentSubject="math"
      mode={mode} onMode={() => {}} />
  </window.PaletteProvider>
);

const pillBtn = (active) => ({
  padding: "6px 13px", fontSize: 12, fontWeight: 600, borderRadius: 999,
  background: active ? "#0B181E" : "#fff", color: active ? "#fff" : "#475569",
  border: active ? "1px solid #0B181E" : "1px solid #ECEFF4", cursor: "pointer",
});

// 25-color palette reference — Normal and Highlight columns side-by-side
const AB25Palette = () => {
  return (
    <div style={{ height: "100%", overflow: "auto", background: "#FAFBFD", padding: 22 }}>
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>The 25-color paired palette</div>
          <h2 style={{ margin: "4px 0 6px", fontSize: 22, fontWeight: 700, color: "#0B181E", letterSpacing: -0.4 }}>Normal vs Highlight — two distinct aesthetics</h2>
          <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.55, textWrap: "pretty" }}>
            Each swatch has a confident <strong>Normal</strong> tone (school-workbook saturated) and a candy-bright <strong>Highlight</strong> tone (Stabilo / Mildliner). They're paired but the hue and intensity shift between them so the two read as genuinely different palettes, not light and dark of the same color.
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #ECEFF4", borderRadius: 14, padding: 16, boxShadow: "0 1px 2px rgba(11,24,30,.04)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr", gap: 0 }}>
            <Hdr>Color</Hdr><Hdr>Normal</Hdr><Hdr>Highlight</Hdr><Hdr>Deep (text)</Hdr>
            {window.PALETTE_25.map(s => (
              <React.Fragment key={s.id}>
                <Cell><span style={{ width: 18, height: 18, borderRadius: 5, background: s.normal, border: `1px solid ${s.deep}33` }} />{s.name}</Cell>
                <SwCell color={s.normal} deep={s.deep} hex={s.normal} />
                <SwCell color={s.highlight} deep={s.deep} hex={s.highlight} />
                <SwCell color={s.deep} deep={s.deep} hex={s.deep} />
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
const Hdr = ({ children }) => <div style={{ fontSize: 10.5, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.6, padding: "8px 6px", borderBottom: "1px solid #ECEFF4" }}>{children}</div>;
const Cell = ({ children }) => <div style={{ padding: "9px 6px", fontSize: 12.5, fontWeight: 600, color: "#0B181E", borderBottom: "1px solid #F2F4F8", display: "flex", alignItems: "center", gap: 8 }}>{children}</div>;
const SwCell = ({ color, deep, hex }) => (
  <div style={{ padding: "9px 6px", borderBottom: "1px solid #F2F4F8", display: "flex", alignItems: "center", gap: 7 }}>
    <span style={{ width: 32, height: 22, borderRadius: 5, background: color, border: `1px solid ${deep}33` }} />
    <span className="cp-mono" style={{ fontSize: 11, color: "#64748B" }}>{hex}</span>
  </div>
);

Object.assign(window, { ABSixShells, ABModeSeparation, AB25Palette });
