// widgets530-p4.jsx — Panel 4: Small Groups & Language Support
const { I } = window;
const { WHead, Avatar, FootNote, StepNum } = window;

/* 1 — CENTER ROTATION */
function CenterRotation() {
  const groups = [
    { n:1, name:"Blue Group",   hue:212, now:[I.book,"Read & Respond"], next:[I.msg,"Turn and Talk"] },
    { n:2, name:"Green Group",  hue:145, now:[I.pencil,"Write It"],     next:[I.search,"Research"] },
    { n:3, name:"Purple Group", hue:262, now:[I.headset,"Listen & Learn"], next:[I.users,"Small Group"] },
    { n:4, name:"Orange Group", hue:28,  now:[I.puzzle,"Word Work"],    next:[I.book,"Read & Respond"] },
  ];
  return (
    <div className="w" style={{ background:"var(--blue-grad)" }}>
      <WHead label="Center Rotation" />
      <div style={{ display:"flex", gap:16 }}>
        <div style={{ width:152, flex:"none" }}>
          <div className="sub" style={{ padding:"16px 12px", textAlign:"center", background:"var(--blue-soft)", boxShadow:"none" }}>
            <div style={{ fontSize:13, fontWeight:800, color:"var(--blue-accent)", marginBottom:8 }}>NOW</div>
            <div style={{ display:"flex", justifyContent:"center", marginBottom:6, color:"var(--blue-accent)" }}>{I.clock({ s:46, sw:1.8 })}</div>
            <div style={{ fontSize:30, fontWeight:800, letterSpacing:"-1px" }}>12:00</div>
            <div style={{ fontSize:12.5, color:"var(--ink-mute)", fontWeight:600, marginTop:2 }}>Time Remaining</div>
          </div>
          <div style={{ display:"flex", gap:8, padding:"12px 12px 0", fontSize:13, fontWeight:600, color:"var(--ink-soft)", lineHeight:1.4 }}>
            <span style={{ color:"var(--purple-accent)", flex:"none" }}>{I.spark({ s:16 })}</span>
            Stay focused, work together, use kind voices!
          </div>
        </div>
        <div className="sub" style={{ flex:1, minWidth:0, padding:"4px 14px", overflow:"hidden" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1.1fr 1.2fr 1.2fr", padding:"11px 4px", borderBottom:"1px solid var(--line)", fontSize:12.5, fontWeight:700, color:"var(--ink-mute)" }}>
            <span>Group</span><span style={{ color:"var(--blue-accent)" }}>NOW (Station)</span><span style={{ color:"var(--blue-accent)" }}>NEXT (Station)</span>
          </div>
          {groups.map((g,i)=>(
            <div key={i} style={{ display:"grid", gridTemplateColumns:"1.1fr 1.2fr 1.2fr", alignItems:"center", padding:"12px 4px", borderBottom: i<3?"1px solid var(--line)":"none" }}>
              <span style={{ display:"flex", alignItems:"center", gap:9 }}><StepNum n={g.n} hue={g.hue} s={26} /><span style={{ fontSize:13.5, fontWeight:700 }}>{g.name}</span></span>
              <span style={{ display:"flex", alignItems:"center", gap:8, color:"var(--ink-soft)" }}><span style={{ color:`hsl(${g.hue} 55% 48%)` }}>{g.now[0]({ s:19 })}</span><span style={{ fontSize:13.5, fontWeight:700 }}>{g.now[1]}</span></span>
              <span style={{ display:"flex", alignItems:"center", gap:8, color:"var(--ink-soft)" }}><span style={{ color:`hsl(${g.hue} 55% 48%)` }}>{g.next[0]({ s:19 })}</span><span style={{ fontSize:13.5, fontWeight:700 }}>{g.next[1]}</span></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* 2 — SMALL GROUP TEACHER TABLE */
function Check() {
  return <span style={{ width:22, height:22, borderRadius:6, border:"1.6px solid #cfd5df", display:"inline-block" }} />;
}
function TeacherTable() {
  const cols = ["Beginning","Developing","Proficient","Extending"];
  const students = ["Ava","Ben","Chloe","Diego"];
  return (
    <div className="w" style={{ background:"var(--green-grad)" }}>
      <WHead label="Small Group Teacher Table" />
      <div className="sub" style={{ padding:"14px 16px", marginBottom:14, display:"flex", gap:14 }}>
        <div style={{ display:"flex", alignItems:"center", gap:11, flex:1 }}>
          <span style={{ width:38, height:38, borderRadius:11, background:"var(--purple-chip)", color:"var(--purple-accent)", display:"grid", placeItems:"center", flex:"none" }}>{I.target({ s:20 })}</span>
          <div><div style={{ fontSize:12, fontWeight:700, color:"var(--ink-mute)" }}>Focus Skill</div><div style={{ fontSize:16, fontWeight:800 }}>Text Evidence</div></div>
        </div>
        <div style={{ width:1, background:"var(--line)" }} />
        <div style={{ display:"flex", alignItems:"center", gap:11, flex:1 }}>
          <span style={{ width:38, height:38, borderRadius:11, background:"var(--green-chip)", color:"var(--green-accent)", display:"grid", placeItems:"center", flex:"none" }}>{I.users({ s:20 })}</span>
          <div><div style={{ fontSize:12, fontWeight:700, color:"var(--ink-mute)" }}>Group</div><div style={{ fontSize:16, fontWeight:800 }}>Blue Group</div></div>
        </div>
      </div>
      <div className="sub" style={{ padding:"4px 14px", overflow:"hidden" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1.2fr repeat(4,1fr)", padding:"10px 4px 8px", borderBottom:"1px solid var(--line)" }}>
          <span style={{ fontSize:12.5, fontWeight:700, color:"var(--ink-mute)" }}>Students</span>
          <span style={{ gridColumn:"span 4", textAlign:"center", fontSize:12.5, fontWeight:700, color:"var(--ink-mute)" }}>Mastery Check</span>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1.2fr repeat(4,1fr)", padding:"6px 4px", borderBottom:"1px solid var(--line)" }}>
          <span/>{cols.map(c=><span key={c} style={{ textAlign:"center", fontSize:11.5, fontWeight:700, color:"var(--ink-mute)" }}>{c}</span>)}
        </div>
        {students.map((s,i)=>(
          <div key={i} style={{ display:"grid", gridTemplateColumns:"1.2fr repeat(4,1fr)", alignItems:"center", padding:"9px 4px", borderBottom: i<3?"1px solid var(--line)":"none" }}>
            <span style={{ display:"flex", alignItems:"center", gap:9 }}><Avatar name={s} s={28} /><span style={{ fontSize:14, fontWeight:700 }}>{s}</span></span>
            {cols.map(c=><span key={c} style={{ display:"grid", placeItems:"center" }}><Check/></span>)}
          </div>
        ))}
      </div>
      <FootNote tone="green" icon={I.star({ s:16 })}>Great thinking! Keep using evidence from the text. 🎉</FootNote>
    </div>
  );
}

/* 3 — VOCABULARY / KEY WORDS */
function VocabCard({ icon, word, def, color }) {
  return (
    <div className="sub" style={{ padding:"14px 15px", display:"flex", gap:12 }}>
      <span style={{ color, flex:"none" }}>{icon({ s:26 })}</span>
      <div><div style={{ fontSize:16, fontWeight:800 }}>{word}</div><div style={{ fontSize:12.5, color:"var(--ink-mute)", fontWeight:500, marginTop:2, lineHeight:1.35 }}>{def}</div></div>
    </div>
  );
}
function Vocabulary() {
  return (
    <div className="w" style={{ background:"var(--blue-grad)" }}>
      <WHead label="Vocabulary / Key Words" />
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,minmax(0,1fr))", gap:12 }}>
        <VocabCard icon={I.book}   word="analyze"  def="to look at something closely to understand its parts." color="var(--blue-accent)" />
        <VocabCard icon={I.search} word="evidence" def="information or details that support a claim or idea." color="var(--green-accent)" />
        <VocabCard icon={I.scale}  word="compare"  def="to tell how things are alike or different." color="var(--orange-accent)" />
        <VocabCard icon={I.bulb}   word="infer"    def="to use clues to figure something out." color="#e8a91a" />
      </div>
      <FootNote tone="purple" icon={I.star({ s:16 })}>Use these words in your reading and discussions! 🎉</FootNote>
    </div>
  );
}

/* 4 — SENTENCE FRAMES */
function SentenceFrames() {
  const frames = [
    { icon:I.msg,   color:"var(--green-accent)", parts:["I think ", "______", " because in the text it says ", "______", "."] },
    { icon:I.users, color:"var(--orange-accent)", parts:["I agree/disagree with ", "______", " because ", "______", "."] },
    { icon:I.bulb,  color:"#e8a91a", parts:["Another example is ", "______", " which shows ", "______", "."] },
  ];
  return (
    <div className="w" style={{ background:"var(--orange-grad)" }}>
      <WHead label="Sentence Frames" />
      <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
        {frames.map((f,i)=>(
          <div key={i} className="sub" style={{ display:"flex", gap:13, padding:"15px 16px", alignItems:"center" }}>
            <span style={{ color:f.color, flex:"none" }}>{f.icon({ s:24 })}</span>
            <span style={{ fontSize:15, fontWeight:600, color:"var(--ink-soft)", lineHeight:1.5 }}>
              {f.parts.map((p,j)=> p==="______"
                ? <span key={j} style={{ fontWeight:800, color:"var(--ink-faint)", letterSpacing:"-1px" }}>______</span>
                : <span key={j}>{p}</span>)}
            </span>
          </div>
        ))}
      </div>
      <FootNote tone="orange" icon={I.star({ s:16 })}>Use these frames to share your ideas! 🖊️</FootNote>
    </div>
  );
}

/* 5 — DISCUSSION PROTOCOL */
function DiscussionProtocol() {
  const steps = ["Partner A shares their idea.","Partner B restates what they heard.","Switch roles and repeat."];
  return (
    <div className="w" style={{ background:"var(--blue-grad)" }}>
      <WHead label="Discussion Protocol" />
      <div style={{ display:"flex", gap:12, marginBottom:14 }}>
        <div className="sub" style={{ flex:1, padding:"13px 14px", display:"flex", alignItems:"center", gap:11 }}>
          <span style={{ color:"var(--blue-accent)" }}>{I.user({ s:22 })}</span>
          <div><div style={{ fontSize:15, fontWeight:800, color:"var(--blue-accent)" }}>Partner A</div><div style={{ fontSize:12.5, color:"var(--ink-mute)", fontWeight:600 }}>Shares First</div></div>
        </div>
        <div className="sub" style={{ flex:1, padding:"13px 14px", display:"flex", alignItems:"center", gap:11 }}>
          <span style={{ color:"var(--green-accent)" }}>{I.user({ s:22 })}</span>
          <div><div style={{ fontSize:15, fontWeight:800, color:"var(--green-accent)" }}>Partner B</div><div style={{ fontSize:12.5, color:"var(--ink-mute)", fontWeight:600 }}>Listens First</div></div>
        </div>
      </div>
      <div style={{ display:"flex", gap:14 }}>
        <div style={{ flex:1, display:"flex", flexDirection:"column", gap:14, justifyContent:"center" }}>
          {steps.map((s,i)=>(
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12 }}><StepNum n={i+1} hue={212} s={28} /><span style={{ fontSize:14, fontWeight:600, color:"var(--ink-soft)" }}>{s}</span></div>
          ))}
        </div>
        <div className="sub" style={{ width:160, flex:"none", padding:"16px 12px", textAlign:"center", background:"var(--blue-soft)", boxShadow:"none" }}>
          <div style={{ fontSize:13.5, fontWeight:800, color:"var(--blue-accent)", marginBottom:8 }}>Turn & Talk Time</div>
          <div style={{ display:"flex", justifyContent:"center", marginBottom:6, color:"var(--blue-accent)" }}>{I.clock({ s:42, sw:1.8 })}</div>
          <div style={{ fontSize:28, fontWeight:800, letterSpacing:"-1px" }}>02:00</div>
        </div>
      </div>
      <FootNote tone="blue" icon={I.star({ s:16 })}>Listen actively. Build on each other's ideas! 💬</FootNote>
    </div>
  );
}

Object.assign(window, { CenterRotation, TeacherTable, Vocabulary, SentenceFrames, DiscussionProtocol });
