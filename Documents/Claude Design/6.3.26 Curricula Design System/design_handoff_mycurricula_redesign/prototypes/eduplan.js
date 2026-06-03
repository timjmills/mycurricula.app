/* mycurricula workspace prototype (v1.3) — all subjects, per-subject color
   cascade through unit/week/day, right-hand lesson detail with overview +
   unit assessments. */
(function () {
  const I = {
    home:'<path d="M3 11l9-7 9 7"/><path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9"/>',
    planner:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16"/>',
    curriculum:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    assess:'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
    standards:'<path d="M4 19.5V6a2 2 0 0 1 2-2h12v15"/><path d="M6 17h12v3H6a2 2 0 0 1 0-3z"/>',
    folder:'<path d="M4 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
    reports:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    calendar:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2.5v2.5M12 19v2.5M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2.5 12H5M19 12h2.5M4.2 19.8 6 18M18 6l1.8-1.8"/>',
    book:'<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
    pencil:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
    list:'<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    sparkle:'<path d="M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/>',
    flask:'<path d="M9 3h6M10 3v6l-5 8a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8V3M7 14h10"/>',
    globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/>',
    heart:'<path d="M12 20s-7-4.4-9.2-8.2C1.3 9 2.6 5.5 6 5.5c2 0 3.2 1.3 4 2.4.8-1.1 2-2.4 4-2.4 3.4 0 4.7 3.5 3.2 6.3C19 15.6 12 20 12 20z"/>',
    bell:'<path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 8-2.5 8h17S18 15 18 9z"/><path d="M10.5 21a2 2 0 0 0 3 0"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7"/><path d="M12 17h.01"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3-3"/>',
    x:'<path d="M6 6l12 12M18 6 6 18"/>', chD:'<path d="m6 9 6 6 6-6"/>', chL:'<path d="m15 6-6 6 6 6"/>', chR:'<path d="m9 6 6 6-6 6"/>',
    plus:'<path d="M12 5v14M5 12h14"/>', arrowR:'<path d="M5 12h14M13 6l6 6-6 6"/>', arrowU:'<path d="M12 19V5M6 11l6-6 6 6"/>',
    check:'<path d="m5 13 4 4 10-11"/>', clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
    roadmap:'<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H16a2 2 0 0 1 2 2v7M6 8.5V16a2 2 0 0 0 2 2h7.5"/>',
    grid:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16"/>',
    more:'<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
    chart:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 14v3M12 10v7M16 7v10"/>',
    target:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.3"/>',
    clipboard:'<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/>',
    edit:'<path d="M11 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><path d="M18.5 3.5a2.1 2.1 0 0 1 3 3L12 16l-4 1 1-4z"/>',
  };
  const sv = (n, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${I[n]||""}</svg>`;

  /* v1.3 subject scale: c=bright, d=ink, t=tint, s=solid */
  const SUBJECTS = [
    { id:"reading", name:"Reading", icon:"book",     c:"#4788D1", d:"#244A75", t:"#E2E9F0", s:"#7A9EC7" },
    { id:"math",    name:"Math",    icon:"grid",     c:"#E8BB17", d:"#7A671F", t:"#F4EFDF", s:"#DCC674" },
    { id:"writing", name:"Writing", icon:"pencil",   c:"#E87917", d:"#7A491F", t:"#F4E9DF", s:"#DCA574" },
    { id:"grammar", name:"Grammar", icon:"list",     c:"#9F47D1", d:"#572475", t:"#EBE2F0", s:"#AB7AC7" },
    { id:"spelling",name:"Spelling",icon:"sparkle",  c:"#E8179B", d:"#7A1F59", t:"#F2E1EC", s:"#CF77AF" },
    { id:"science", name:"Science", icon:"flask",    c:"#47D183", d:"#247547", t:"#E2F0E8", s:"#7AC79B" },
    { id:"social",  name:"Social Studies", icon:"globe", c:"#47B6D1", d:"#246575", t:"#E2EEF0", s:"#7AB8C7" },
    { id:"sel",     name:"SEL",     icon:"heart",    c:"#4751D1", d:"#242975", t:"#E2E3F0", s:"#7A7FC7" },
  ];
  const COL = SUBJECTS.map((s) => s.c);

  /* Rich unit/week/day content for Reading; generated for the rest. */
  const READING_UNITS = [
    { n:"Unit 1", name:"Building Strong Readers", st:"done", dates:"Aug 12 – Sep 27" },
    { n:"Unit 2", name:"Exploring Theme & Message", st:"cur", dates:"Sep 30 – Nov 8" },
    { n:"Unit 3", name:"Character & Perspective", st:"todo", dates:"Nov 11 – Jan 17" },
    { n:"Unit 4", name:"Inform & Persuade", st:"todo", dates:"Jan 21 – Mar 14" },
    { n:"Unit 5", name:"Research & Inquiry", st:"todo", dates:"Mar 17 – May 23" },
  ];
  const READING_WEEKS = [
    { n:"Week 1", name:"Theme Basics", dates:"Sep 30 – Oct 4", st:"done" },
    { n:"Week 2", name:"Identifying Theme", dates:"Oct 7 – Oct 11", st:"cur" },
    { n:"Week 3", name:"Theme in Depth", dates:"Oct 14 – Oct 18", st:"todo" },
    { n:"Week 4", name:"Analyzing Multiple Themes", dates:"Oct 21 – Oct 25", st:"todo" },
    { n:"Week 5", name:"Theme Across Genres", dates:"Oct 28 – Nov 1", st:"todo" },
  ];
  const READING_DAYS = [
    { dy:"Mon, Oct 7", title:"What Is Theme?", items:["Introduce Theme","Read Aloud","Exit Ticket"], st:"done",
      overview:"Students understand the definition of theme and identify common themes in a short text." },
    { dy:"Tue, Oct 8", title:"Finding Theme in Literature", items:["Mini Lesson","Guided Practice","Quick Write"], st:"done",
      overview:"Students locate evidence of theme across a short literary passage and explain their thinking." },
    { dy:"Wed, Oct 9", title:"Theme vs. Main Idea", items:["Compare","Group Activity","Reflection"], st:"cur",
      overview:"Students distinguish theme from main idea and sort examples of each in small groups." },
    { dy:"Thu, Oct 10", title:"Citing Text Evidence", items:["Model","Independent Work","Share Out"], st:"todo",
      overview:"Students cite specific textual evidence to support a stated theme in writing." },
    { dy:"Fri, Oct 11", title:"Theme Review & Synthesis", items:["Review Game","Writing Task","Wrap-Up"], st:"todo",
      overview:"Students synthesize the week's learning and apply theme analysis to a new text." },
  ];

  function genUnits(s) {
    const names = {
      math:["Place Value","Addition & Subtraction","Multiplication & Division","Fractions","Measurement & Geometry"],
      writing:["Personal Narrative","Opinion Writing","Informative Writing","Research Reports","Poetry & Voice"],
      grammar:["Parts of Speech","Sentence Structure","Punctuation","Verb Tenses","Editing & Revising"],
      spelling:["Short & Long Vowels","Blends & Digraphs","Greek & Latin Roots","Prefixes & Suffixes","Tricky Words"],
      science:["Life Cycles","Habitats & Ecosystems","Rocks & Minerals","Forces & Motion","Weather & Climate"],
      social:["Communities","Our Country","Regions & Geography","Early People","Government & Economics"],
      sel:["Self-Awareness","Managing Emotions","Building Relationships","Responsible Choices","Goal Setting"],
    }[s.id] || ["Unit One","Unit Two","Unit Three","Unit Four","Unit Five"];
    return names.map((nm, i) => ({ n:"Unit "+(i+1), name:nm, st: i===0?"done": i===1?"cur":"todo",
      dates:["Aug – Sep","Sep – Nov","Nov – Jan","Jan – Mar","Mar – May"][i] }));
  }
  function genWeeks(unitName) {
    return ["Launch & Hook","Core Concepts","Guided Practice","Apply & Extend","Review & Assess"].map((d, i) => ({
      n:"Week "+(i+1), name:d, dates:"", st: i===0?"done": i===1?"cur":"todo" }));
  }
  function genDays(weekName, unitName) {
    return ["Mon","Tue","Wed","Thu","Fri"].map((dy, i) => ({
      dy, title:[`Launch: ${weekName}`,"Mini-lesson & model","Guided practice","Independent work","Wrap-up & exit ticket"][i],
      items:["Warm-up","Main activity","Exit ticket"], st: i<2?"done": i===2?"cur":"todo",
      overview:`Students engage with ${unitName.toLowerCase()} through a focused ${dy} lesson with modeling and practice.`,
    }));
  }

  /* Unit-level assessments by subject (shown in the right rail). */
  function unitAssessments(s, unitName) {
    return [
      { t:`${unitName} — Diagnostic`, m:"Pre-assessment · 10 items", st:"done", ic:"clipboard" },
      { t:`${unitName} — Mid-Unit Quiz`, m:"Formative · due Oct 18", st:"due", ic:"assess" },
      { t:`${unitName} — Performance Task`, m:"Summative · end of unit", st:"up", ic:"target" },
      { t:`${unitName} — Exit Tickets`, m:"Daily checks · ongoing", st:"up", ic:"edit" },
    ];
  }

  const RES = [
    { t:"Mini-Lesson Slides", k:"Google Slides", c:"#C9871A", bg:"var(--honey-t)", ic:"grid" },
    { t:'Anchor Text Passage', k:"PDF", c:"#EF5A5A", bg:"#FDECEC", ic:"standards" },
    { t:"Anchor Chart", k:"PNG Image", c:"#16A06B", bg:"var(--done-t)", ic:"chart" },
  ];

  let st = { subject: 0, unit: 1, week: 1, day: 2, tab: "Overview" };

  const cur = () => SUBJECTS[st.subject];
  function units() { return cur().id === "reading" ? READING_UNITS : (cur()._u || (cur()._u = genUnits(cur()))); }
  function weeks() { return cur().id === "reading" ? READING_WEEKS : genWeeks(units()[st.unit].name); }
  function days() {
    if (cur().id === "reading") return READING_DAYS;
    return genDays(weeks()[st.week].name, units()[st.unit].name);
  }

  function setAccentVars() {
    const s = cur();
    const r = document.documentElement.style;
    r.setProperty("--ac", s.c); r.setProperty("--ac-d", s.d); r.setProperty("--ac-t", s.t); r.setProperty("--ac-s", s.s);
  }

  /* ---- Left nav ---- */
  function renderSide() {
    const nav = [["home","Home"],["planner","Planner"],["curriculum","Curriculum",1],["assess","Assessments"],["standards","Standards"],["folder","Resources"],["reports","Reports"],["calendar","Calendar"]];
    document.getElementById("side").innerHTML = `
      <div class="elogo"><span class="bk"><svg viewBox="0 0 24 24" fill="none"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" fill="#fff"/><path d="M13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13z" fill="#3A2A05" opacity=".5"/></svg></span><b>mycurricula<span style="color:#C9871A">.app</span></b></div>
      ${nav.map(([ic, t, on]) => `<a class="enav ${on?"on":""}">${sv(ic)}<span class="lbl">${t}</span></a>`).join("")}
      <div class="grow"></div>
      <a class="enav">${sv("settings")}<span class="lbl">Settings</span></a>
      <div class="ediv"></div>
      <div class="euser"><span class="av">MH</span><div><div class="nm">Ms. Harper</div><div class="rl">Grade 5 · Room 12</div></div><span class="ch">${sv("chD")}</span></div>`;
  }

  /* ---- Top bar ---- */
  function renderTop() {
    document.getElementById("etop").innerHTML = `
      <button class="topbtn subjects" data-act="menu-subjects" title="Subjects">${sv("curriculum")}</button>
      <div class="eyear">${sv("calendar")}2024–2025 <span class="g">School Year</span> ${sv("chD")}</div>
      <div class="esearch">${sv("search")}<input placeholder="Search units, lessons, standards..."><span class="kbd">⌘K</span></div>
      <button class="etbtn">${sv("bell")}<span class="bd">3</span></button>
      <button class="etbtn">${sv("help")}</button>
      <div class="euser2"><span class="av">MH</span><div><div class="nm">Ms. Harper</div><div class="rl">Teacher</div></div>${sv("chD")}</div>`;
  }

  /* ---- Secondary panel: all subjects + cascade ---- */
  function renderSnav() {
    const subj = SUBJECTS.map((s, i) => {
      const open = i === st.subject;
      const svars = `--s-c:${s.c};--s-d:${s.d};--s-t:${s.t};--s-s:${s.s}`;
      const head = `
        <div class="subj ${open?"on":""}" style="${svars}" data-act="subject" data-i="${i}">
          <span class="si">${sv(s.icon)}</span>
          <div><div class="sn">${s.name}</div><div class="sg">Grade 5</div></div>
          <span class="sc"></span>
        </div>`;
      if (!open) return head;
      const us = units().map((u, ui) => `
        <div class="uitem ${ui===st.unit?"on":""} ${u.st==="done"?"done":""}" data-act="unit" data-i="${ui}">
          <span class="uc">${u.st==="done"?sv("check",3):""}</span>
          <div><span class="un">${u.n}</span> · <span class="ut">${u.name}</span></div>
        </div>`).join("");
      return head + `<div class="subwrap">${us}</div>`;
    }).join("");
    document.getElementById("snav").innerHTML = `
      <div class="snhead">Subjects <span class="n">${SUBJECTS.length}</span><button class="pclose" data-act="pclose" style="margin-left:10px">${sv("x")}</button></div>
      ${subj}
      <div class="collapse2">${sv("chL")}Collapse panel</div>`;
  }

  /* ---- Center ---- */
  function renderCenter() {
    const s = cur();
    const months = ["AUG","SEP","OCT","NOV","DEC","JAN","FEB","MAR","APR","MAY","JUN"];
    const us = units();
    const yearBars = us.map((u, i) => {
      const mk = i <= 1 ? `<span class="mk" style="color:${s.c}">${sv(i===0?"check":"plus",2.6)}</span>` : "";
      return `<div class="ybar" style="background:${i<=st.unit?s.c:s.s};opacity:${i<=st.unit?1:.5}">${mk}</div>`;
    }).join("");
    const yLegend = us.map((u) => `
      <div class="uleg"><div class="ud"><span class="d" style="background:${s.c}"></span>${u.n}</div>
      <div class="un">${u.name}</div><div class="udt">${u.dates}</div></div>`).join("");

    const road = us.map((u, i) => {
      const arrow = i === st.unit ? `<div class="arr">${sv("arrowR")}</div>` : "";
      return `<div class="rcard ${i===st.unit?"on":""}" data-act="unit" data-i="${i}">
        <div class="rn" style="color:${s.d}">${u.n}</div><div class="rnm">${u.name}</div><div class="rdt">${u.dates}</div>${arrow}</div>${i<us.length-1?'<div class="rconn"></div>':""}`;
    }).join("");

    const ws = weeks();
    const weekCards = ws.map((w, i) => `
      <div class="wkcard ${i===st.week?"on":""}" data-act="week" data-i="${i}">
        <div class="wn">${w.n}</div><div class="wt">${w.name}</div>
        <div class="wd"><span class="wdt">${w.dates||""}</span>${w.st==="done"?`<span style="color:var(--done)">${sv("check",3)}</span>`:""}</div>
      </div>`).join("");

    const u = us[st.unit], w = ws[st.week];
    const ds = days();
    const dayCards = ds.map((d, i) => `
      <div class="daycard ${i===st.day?"on":""}" data-act="day" data-i="${i}">
        <div class="dh">${d.dy.split(",")[0]}</div><div class="dt2">${d.title}</div>
        ${d.items.map((it) => `<div class="it">${sv("check",3)}${it}</div>`).join("")}
        <div class="df"><span class="min">45 min</span><span class="dots">${sv("more")}</span></div>
      </div>`).join("");

    document.getElementById("center").innerHTML = `
      <div class="ecard">
        <div class="ech"><span class="ci">${sv("calendar")}</span><h3>Year Overview — ${s.name}</h3><div class="vsel"><span class="vl">View:</span> Year ${sv("chD")}</div></div>
        <div class="months2">${months.map((m,i)=>`<span class="${i===8?"on":""}">${m}</span>`).join("")}</div>
        <div class="ybars">${yearBars}</div>
        <div class="ulegend">${yLegend}</div>
      </div>
      <div class="ecard">
        <div class="ech"><span class="ci">${sv("roadmap")}</span><h3>Subject Roadmap</h3><div class="vsel"><span class="vl">View:</span> Units ${sv("chD")}</div></div>
        <div class="roadmap">${road}</div>
      </div>
      <div class="ecard">
        <div class="ech"><span class="ci">${sv("grid")}</span><h3>Week Breakdown — ${u.n}: ${u.name}</h3><div class="vsel"><span class="vl">View:</span> Weeks ${sv("chD")}</div></div>
        <div class="hscroll">${weekCards}</div>
      </div>
      <div class="ecard">
        <div class="ech"><span class="ci">${sv("calendar")}</span><h3>Daily Lessons — ${w.n}: ${w.name}</h3><div class="vsel"><span class="vl">View:</span> Days ${sv("chD")}</div></div>
        <div class="hscroll">${dayCards}</div>
        <div class="elegend" style="margin-top:14px">
          <span class="elg" style="color:var(--done)">${sv("assess")}<span style="color:var(--muted)">Completed</span></span>
          <span class="elg">${sv("clock")}In Progress</span>
          <span class="elg"><span class="rc0"></span>Upcoming</span>
        </div>
      </div>`;
  }

  /* ---- Right panel ---- */
  function renderRight() {
    const s = cur(), u = units()[st.unit], d = days()[st.day];
    const badge = d.st === "done" ? `<span class="rb d">${sv("check",3)}Completed</span>`
      : d.st === "cur" ? `<span class="rb g">${sv("clock")}In Progress</span>` : `<span class="rb g">${sv("clock")}Upcoming</span>`;
    const tabs = ["Overview","Standards","Resources","Assessments","Progress"];
    const tabLabel = (t) => (t === "Assessments" ? "Assess" : t);
    const asmt = unitAssessments(s, u.name);
    const asmtRows = asmt.map((a) => `
      <div class="uasmt"><span class="ai">${sv(a.ic)}</span>
        <div><div class="at">${a.t}</div><div class="am">${a.m}</div></div>
        <span class="ab ${a.st}">${a.st==="done"?"Done":a.st==="due"?"Due soon":"Upcoming"}</span></div>`).join("");

    let content = "";
    if (st.tab === "Overview") {
      content = `
        <div class="rsec"><h4>${sv("book")}Lesson Overview</h4><p>${d.overview}</p></div>
        <div class="rsec"><h4>${sv("target")}Learning Objectives</h4>
          ${["Define the focus concept","Identify it with evidence","Explain thinking in writing"].map((o)=>`<div class="robj">${sv("check",3)}${o}</div>`).join("")}
        </div>
        <div class="rsec"><h4>${sv("clipboard")}Unit Assessments</h4>${asmtRows}<div class="rlink">Open assessment planner →</div></div>`;
    } else if (st.tab === "Standards") {
      content = `<div class="rsec"><h4>${sv("standards")}Standards <span class="ccgs">CCSS</span></h4>
        <div class="rstd"><div class="code">RL.5.2</div><div class="txt">Determine a theme of a story from details, including how characters respond to challenges.</div></div>
        <div class="rstd"><div class="code">RL.5.3</div><div class="txt">Compare and contrast two characters, settings, or events, drawing on specific details.</div></div>
        <div class="rlink">View all standards (2) →</div></div>`;
    } else if (st.tab === "Resources") {
      content = `<div class="rsec"><h4>${sv("folder")}Resources</h4>
        ${RES.map((r)=>`<div class="rres"><span class="ri" style="background:${r.bg};color:${r.c}">${sv(r.ic)}</span><div><div class="rt">${r.t}</div><div class="rk">${r.k}</div></div></div>`).join("")}
        <div class="rlink">View all resources (6) →</div></div>`;
    } else if (st.tab === "Assessments") {
      content = `<div class="rsec"><h4>${sv("clipboard")}Unit Assessments — ${u.n}</h4>${asmtRows}
        <button class="rbtn">${sv("plus")}Add assessment</button></div>`;
    } else {
      content = `<div class="rsec rprog"><h4>${sv("chart")}Class Progress</h4>
        <div class="bar"><i style="width:75%"></i></div>
        <div class="pm"><span><b>75%</b> on track</span><span>18 of 24 students</span></div>
        <button class="rbtn">${sv("chart")}View class report</button></div>`;
    }
    document.getElementById("rpanel").innerHTML = `
      <div class="rback"><button class="b">${sv("chL")}Back to ${weeks()[st.week].n}</button><div class="nav"><button>${sv("chL")}</button><button>${sv("chR")}</button><button class="pclose" data-act="pclose">${sv("x")}</button></div></div>
      <div class="rdate">${d.dy}</div>
      <div class="rtitle">${d.title}</div>
      <div class="rbadges"><span class="rb p">${sv(s.icon)}${s.name}</span><span class="rb g">${sv("clock")}45 min</span>${badge}</div>
      <div class="rtabs">${tabs.map((t)=>`<button class="rtab ${t===st.tab?"on":""}" data-act="tab" data-t="${t}">${tabLabel(t)}</button>`).join("")}</div>
      ${content}`;
  }

  function renderAll() { setAccentVars(); renderSnav(); renderCenter(); renderRight(); }

  const mscrim = document.createElement("div");
  mscrim.className = "mscrim";
  document.body.appendChild(mscrim);
  const snav = document.getElementById("snav");
  const rpanel = document.getElementById("rpanel");
  const closePanels = () => { snav.classList.remove("open"); rpanel.classList.remove("open"); mscrim.classList.remove("on"); };
  const openPanel = (el) => { el.classList.add("open"); mscrim.classList.add("on"); };
  mscrim.addEventListener("click", closePanels);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanels(); });

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const a = el.dataset.act;
    if (a === "menu-subjects") { snav.classList.contains("open") ? closePanels() : openPanel(snav); return; }
    if (a === "pclose") { closePanels(); return; }
    if (a === "subject") {
      st.subject = +el.dataset.i; st.unit = 1; st.week = 1; st.day = 2; st.tab = "Overview";
      renderAll(); if (window.innerWidth <= 1000) closePanels(); return;
    }
    else if (a === "unit") { st.unit = +el.dataset.i; st.week = 1; st.day = 2; }
    else if (a === "week") { st.week = +el.dataset.i; st.day = 2; }
    else if (a === "day") {
      st.day = +el.dataset.i; st.tab = "Overview";
      renderAll(); if (window.innerWidth <= 1240) openPanel(rpanel); return;
    }
    else if (a === "tab") st.tab = el.dataset.t;
    renderAll();
  });

  renderSide(); renderTop(); renderAll();
})();
