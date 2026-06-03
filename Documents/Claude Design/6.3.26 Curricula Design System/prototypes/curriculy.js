/* Curriculy timeline — expand-under-row + progressive selection + lesson drawer.
   Nothing is auto-selected: open a unit → pick a week → pick a day → lesson opens. */
(function () {
  const rows = document.getElementById("rows");
  const scrim = document.getElementById("scrim");
  const ldraw = document.getElementById("ldraw");
  const { SUBJECTS, COLORS, ICONS } = window;
  rows.style.position = "relative";

  // inline icons for the drawer
  const D = {
    book:'<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>',
    target:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="1.2"/>',
    list:'<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    doc:'<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
    check:'<path d="m5 13 4 4 10-11"/>',
    x:'<path d="M6 6l12 12M18 6 6 18"/>',
    standards:'<path d="M4 19.5V6a2 2 0 0 1 2-2h12v15"/><path d="M6 17h12v3H6a2 2 0 0 1 0-3z"/>',
    folder:'<path d="M4 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/>',
    grid:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v16"/>',
    chart:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 14v3M12 10v7M16 7v10"/>',
    arrowR:'<path d="M5 12h14M13 6l6 6-6 6"/>', hand:'<path d="M9 11V4.5a1.5 1.5 0 0 1 3 0V11M12 10V3.5a1.5 1.5 0 0 1 3 0V12a6 6 0 0 1-6 6 6 6 0 0 1-5.2-3l-1.5-2.6a1.5 1.5 0 0 1 2.6-1.5L7 13"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>',
  };
  const ic = (n, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${D[n] || ""}</svg>`;

  // state — nothing selected by default
  let openKey = null;   // "si-ui"
  let selWeek = null;   // index or null
  let selDay = null;    // index or null
  let drawer = false;

  const STD = { blue:"RL.5.3", orange:"5.NBT.5", green:"5-PS1-3", purple:"SS.5.2" };
  const STD2 = { blue:"RL.5.2", orange:"5.NBT.6", green:"5-PS1-4", purple:"SS.5.3" };

  const circle = (st) =>
    st === "done"
      ? `<span class="cir done">${ic("check", 3)}</span>`
      : st === "cur"
      ? `<span class="cir cur"></span>`
      : `<span class="cir"></span>`;

  function genDays(week) {
    return ["Mon", "Tue", "Wed", "Thu", "Fri"].map((dy) => ({
      dy, dt: "", doc: true,
      t: [`Launch: ${week.d}`, "Mini-lesson & model", "Guided practice", "Independent work", "Wrap-up & exit ticket"]["MTWTF".indexOf(dy[0]) === -1 ? 0 : ["Mon","Tue","Wed","Thu","Fri"].indexOf(dy)],
    }));
  }

  function getOpen() {
    if (!openKey) return null;
    const [si, ui] = openKey.split("-").map(Number);
    return { si, ui, s: SUBJECTS[si], u: SUBJECTS[si].units[ui] };
  }
  function daysFor() {
    const o = getOpen(); if (!o || selWeek == null) return [];
    const det = o.u.detail;
    const dw = det.dayweeks[selWeek] || { days: genDays(det.weeks[selWeek]) };
    return dw.days;
  }

  /* ---------- expanded detail under a row ---------- */
  function renderDetail(s, u) {
    const det = u.detail;
    const weeksHtml = det.weeks.map((w, i) => `
      <div class="wk ${i === selWeek ? "sel" : ""}" data-act="week" data-w="${i}">
        <div class="wst">${circle(w.st)}</div>
        <div class="wn">${w.n}</div>
        <div class="wd">${w.d}</div>
        <div class="wdt">${w.dates || ""}</div>
      </div>`).join("");

    let daysBlock;
    if (selWeek == null) {
      daysBlock = `<div class="daysrow"><div class="dhint">${ic("info")} Select a week above to see its daily lessons.</div></div>`;
    } else {
      const week = det.weeks[selWeek];
      const dw = det.dayweeks[selWeek] || { label: week.dates || "", days: genDays(week) };
      const daysHtml = dw.days.map((d, di) => `
        <div class="day ${di === selDay ? "sel" : ""}" data-act="day" data-d="${di}">
          <div class="dtop"><div class="dn">${d.dy}</div>
            <div style="display:flex;align-items:center;gap:6px">${d.dt ? `<span class="ddt">${d.dt}</span>` : ""}${d.x ? `<svg class="dx" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${D.x}</svg>` : ""}</div>
          </div>
          <div class="dttl">${d.t}</div>
          <div class="dfoot">${d.doc ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${D.doc}</svg>` : ""}<span class="dopen">Open lesson ${ic("arrowR", 2.4)}</span></div>
        </div>`).join("");
      daysBlock = `<div class="daysrow">
        <div class="dlabel"><b>${week.n}</b><span>${dw.label || week.dates || ""}${selDay == null ? " · select a day to open its lesson" : ""}</span></div>
        <div class="days">${daysHtml}</div>
      </div>`;
    }

    return `
      <div class="dhead">
        <span class="di">${ICONS[s.icon]}</span>
        <div class="htext"><div class="dt"><b>${u.n}</b>&nbsp;&nbsp;${u.name}</div><div class="dd">${det.dates}</div></div>
        <button class="ov">Unit Overview <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg></button>
        <button class="dclose" data-act="close" title="Collapse"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg></button>
      </div>
      <div class="dbody" style="grid-template-columns:1fr">
        <div class="dmain">
          <div class="dlabel" style="font-size:12px;font-weight:800;color:var(--ud);margin-bottom:10px">Weeks</div>
          <div class="weeks">${weeksHtml}</div>
          ${daysBlock}
        </div>
      </div>`;
  }

  function render() {
    const oc = openKey;
    rows.innerHTML = SUBJECTS.map((s, si) => {
      const col = COLORS[s.color];
      const vars = `--uc:${col.c};--ud:${col.d};--ut:${col.t};--ui:${col.i};--ush:${col.sh};--rt:${col.rt};--us:${col.s}`;
      const open = oc && oc.startsWith(si + "-");
      const openU = open ? +oc.split("-")[1] : -1;
      const units = s.units.map((u, ui) => `
        <div class="unit ${ui === openU ? "sel" : ""}" data-act="unit" data-s="${si}" data-u="${ui}">
          <div class="un">${u.n}</div><div class="us">${u.name}</div>
        </div>`).join("");
      const chev = `<button class="chev" data-act="chev" data-s="${si}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(${open ? 180 : 0}deg)"><path d="m6 9 6 6 6-6"/></svg></button>`;
      const detail = open ? renderDetail(s, s.units[openU]) : "";
      return `<div class="rowwrap">
        <div class="subrow ${open ? "hot" : ""}" style="${vars}">
          <div class="slabel"><span class="si" style="background:${col.t};color:${col.c}">${ICONS[s.icon]}</span><div><div class="sn">${s.name}</div><div class="sg">${s.grade}</div></div></div>
          <div class="units">${units}${chev}</div>
        </div>
        <div class="detail ${open ? "open" : ""}" style="${vars}">${detail}</div>
      </div>`;
    }).join("");

    const line = document.createElement("div");
    line.style.cssText = "position:absolute;top:0;bottom:0;left:calc(230px + (100% - 230px)*0.855);width:2px;background:linear-gradient(#3B6CF6,rgba(59,108,246,.10));pointer-events:none;z-index:3";
    const dot = document.createElement("div");
    dot.style.cssText = "position:absolute;top:-3px;left:-3px;width:8px;height:8px;border-radius:50%;background:#3B6CF6;box-shadow:0 0 0 3px rgba(59,108,246,.18)";
    line.appendChild(dot);
    rows.appendChild(line);
  }

  /* ---------- right lesson drawer ---------- */
  function renderDrawer() {
    const o = getOpen();
    if (!o || selDay == null) return;
    const s = o.s, u = o.u, col = COLORS[s.color];
    const week = u.detail.weeks[selWeek];
    const day = daysFor()[selDay];
    if (!day) return;
    ldraw.style.cssText = `--uc:${col.c};--ud:${col.d};--ut:${col.t};--us:${col.s};--ush:${col.sh}`;

    const status = day.ch ? ["done", "Taught"] : day.x ? ["g", "Moved this week"] : ["g", "Planned"];
    const acts = [
      ["Warm-up", "5 min"], [`Mini-lesson · ${day.t}`, "15 min"],
      ["Guided practice", "15 min"], ["Independent work", "8 min"], ["Exit ticket", "2 min"],
    ];
    const objectives = {
      blue: ["Infer using text evidence", "Explain thinking in writing", "Discuss with a partner"],
      orange: ["Model the strategy with place value", "Solve multi-digit problems", "Check answers for reasonableness"],
      green: ["Make an observation", "Record data accurately", "Draw a conclusion from evidence"],
      purple: ["Locate key facts in a source", "Compare two perspectives", "Summarize the main idea"],
    }[s.color];
    const resources = [
      ["grid", "Mini-Lesson Slides", "Google Slides"],
      ["doc", "Practice Pages", "PDF · 2 pages"],
      ["chart", "Anchor Chart", "PNG image"],
    ];

    ldraw.innerHTML = `
      <div class="lh">
        <span class="lhi">${ICONS[s.icon]}</span>
        <div><div class="lsub">${s.name}</div><div class="lwk">${u.n} · ${week.n}</div></div>
        <button class="lx" data-act="ldraw-close">${ic("x")}</button>
      </div>
      <div class="lbody">
        <div class="lday">${day.dy}${day.dt ? " · " + day.dt : ""}</div>
        <div class="ltitle">${day.t}</div>
        <div class="lbadges">
          <span class="lb s">${ICONS[s.icon]}${s.name}</span>
          <span class="lb g">${ic("clock")}45 min</span>
          <span class="lb ${status[0]}">${status[0] === "done" ? ic("check", 3) : ic("clock")}${status[1]}</span>
        </div>
        <div class="lsec"><h4>${ic("info")}Lesson overview</h4>
          <p>Students work toward “${day.t.toLowerCase()}” through a short mini-lesson, guided practice, and an independent task, finishing with a quick exit ticket to check understanding.</p></div>
        <div class="lsec"><h4>${ic("hand")}Activities</h4>
          ${acts.map(([n, m], i) => `<div class="lact"><span class="ln">${i + 1}</span>${n}<span class="lm">${m}</span></div>`).join("")}</div>
        <div class="lsec"><h4>${ic("target")}Objectives</h4>
          ${objectives.map((o) => `<div class="lobj">${ic("check", 3)}${o}</div>`).join("")}</div>
        <div class="lsec"><h4>${ic("standards")}Standards</h4>
          <div class="lstd"><div class="code">${STD[s.color]}</div><div class="txt">Grade 5 standard addressed by today's lesson and practice.</div></div>
          <div class="lstd"><div class="code">${STD2[s.color]}</div><div class="txt">Supporting standard reinforced through guided work.</div></div></div>
        <div class="lsec"><h4>${ic("folder")}Resources</h4>
          ${resources.map(([i, t, k]) => `<div class="lres"><span class="ri">${ic(i)}</span><div><div class="rt">${t}</div><div class="rk">${k}</div></div></div>`).join("")}</div>
      </div>
      <div class="lfoot">
        <button class="lbtn lprimary">${ic("check", 3)}Mark complete</button>
        <button class="lbtn lsecondary">${ic("doc")}Edit</button>
      </div>`;
  }
  function openDrawer() { renderDrawer(); drawer = true; ldraw.classList.add("on"); scrim.classList.add("on"); }
  function closeDrawer() { drawer = false; ldraw.classList.remove("on"); scrim.classList.remove("on"); }

  /* ---------- events ---------- */
  rows.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (!el) return;
    const act = el.dataset.act;
    if (act === "unit" || act === "chev") {
      const si = el.dataset.s;
      const sameRow = openKey && openKey.startsWith(si + "-");
      if (act === "chev") {
        if (sameRow) { openKey = null; }
        else { openKey = si + "-0"; }
      } else {
        const key = si + "-" + el.dataset.u;
        openKey = openKey === key ? null : key;
      }
      // opening/closing a unit clears downstream selection
      selWeek = null; selDay = null; closeDrawer();
      render();
    } else if (act === "close") {
      openKey = null; selWeek = null; selDay = null; closeDrawer(); render();
    } else if (act === "week") {
      const w = +el.dataset.w;
      selWeek = selWeek === w ? null : w;
      selDay = null; closeDrawer();
      render();
    } else if (act === "day") {
      selDay = +el.dataset.d;
      render();
      openDrawer();
    }
  });
  ldraw.addEventListener("click", (e) => {
    if (e.target.closest('[data-act="ldraw-close"]')) closeDrawer();
  });
  scrim.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drawer) closeDrawer(); });

  render(); // nothing open by default
})();
