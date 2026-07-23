/* Planning Hub — Units: Timeline hub (unit-band drag, lesson-dot drag, missed chip,
   bench) + Unit view (Plan strip / Refine table, editor with pinned unit plan,
   Insights incl. resources, bulk bar). Exposes window.PHUnits. */
(function(){
const {useState,useRef,useEffect}=React;
const {cv,Dots,AssessMark}=window.PWC;
const {I,SubjChip,KindTag}=window.PHC;
const PW=window.PW, DS=window.DS, FW=window.FW;
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
const FlowOpts=()=>PW.FLOW_GROUPS.map(g=><optgroup key={g.label} label={g.label}>{g.flows.map(f=><option key={f}>{f}</option>)}</optgroup>);
const FlowSteps=({name})=>{ const st=PW.flowSteps(name); if(!st) return null;
  return <span className="ph-flowsteps">{st.map((s2,i2)=><React.Fragment key={s2+i2}>{i2>0&&<i className="fsep">→</i>}<em className="fstep">{s2}</em></React.Fragment>)}</span>; };
const LBL=190;

const qMatchL=(l,u,q)=>!q||(l.title+' '+l.objective+' '+u.name+' '+l.std).toLowerCase().includes(q.toLowerCase());
const resTypeOf=(n)=>{ n=(n||'').toLowerCase();
  if(/slide|deck|ppt|present/.test(n)) return 'Slides';
  if(/video|youtube|film|clip/.test(n)) return 'Video';
  if(/sheet|worksheet|packet|practice|hw/.test(n)) return 'Worksheet';
  if(/image|chart|photo|poster|anchor/.test(n)) return 'Image';
  if(/doc|reading|article|text|book/.test(n)) return 'Doc';
  return 'Link'; };

/* ── resource pills + quick-add (used by Editor and BenchPop) ── */
function ResPills({l,actions}){
  const [draft,setDraft]=useState('');
  const [rv,setRv]=useState((window.__phTLMem||{}).resView||'pills');
  const setV=(v)=>{ setRv(v); (window.__phTLMem=window.__phTLMem||{}).resView=v; };
  const rs=l.resources||[];
  return <div className="ph-respills-wrap">
    {rs.length>1 && <span className="ph-uiseg rv" title="How attached resources display">{[['pills','Pills'],['list','List']].map(([k,lab])=><button key={k} type="button" className={rv===k?'on':''} onClick={()=>setV(k)}>{lab}</button>)}</span>}
    {rv==='list' && rs.length>0
      ? <div className="ph-reslist">
        {rs.map(r=><div key={r.id} className="rl-row" style={{'--rc':cv(DS.RESTYPES[r.type]||'--subj-11')}}>
          <i>{r.type}</i><span className="nm">{r.name}</span>
          <button type="button" title="Remove this resource" onClick={()=>actions.removeRes(l.id,r.id)}>{I.x}</button>
        </div>)}
      </div>
      : <div className="ph-respills">
        {rs.map(r=><span key={r.id} className="ph-respill" style={{'--rc':cv(DS.RESTYPES[r.type]||'--subj-11')}}>
          <i>{r.type}</i><span className="nm">{r.name}</span>
          <button type="button" title="Remove this resource" onClick={()=>actions.removeRes(l.id,r.id)}>{I.x}</button>
        </span>)}
      </div>}
    <input className="ph-resin" value={draft}
      placeholder={rs.length?'Add another… (Enter)':'Add a resource — e.g. Fraction slides (Enter)'}
      onChange={e=>setDraft(e.target.value)}
      onKeyDown={e=>{ if(e.key==='Enter'&&draft.trim()){ actions.addRes(l.id,draft.trim(),resTypeOf(draft)); setDraft(''); } }}/>
  </div>;
}

/* ── date popover — move a lesson or stack it on the previous day ── */
function DatePop({info,l,dated,canStack,actions,onClose}){
  return <React.Fragment>
    <div className="ph-pop-scrim trans" onClick={onClose}></div>
    <div className="ph-datepop" style={{left:info.x+'px',top:info.y+'px'}} data-screen-label="Hub — Move lesson" role="dialog">
      <div className="cur">{dated?(l.status==='today'?'Today · '+l.date:l.date):('Position '+(l.slot+1))}{l.stack?' · stacked':''}</div>
      <div className="row">
        <button disabled={(l.pad||0)<=0&&!l.stack}
          title={(l.pad||0)>0||l.stack?'Pull one school day earlier':'Packed tight — no gap before it. Stack it instead.'}
          onClick={()=>actions.padLesson(l.id,-1)}>{I.back} Earlier</button>
        <button title="Push one school day later — later lessons ripple"
          onClick={()=>actions.padLesson(l.id,1)}><span style={{display:'inline-flex',transform:'scaleX(-1)'}}>{I.back}</span> Later</button>
      </div>
      {canStack && <label className="stk" title="Two lessons share one day — same subject">
        <input type="checkbox" checked={!!l.stack} onChange={()=>actions.toggleStack(l.id)}/> Share the day with the previous lesson
      </label>}
      <div className="cap">Everything after ripples automatically{dated?'':' — positions renumber'}.</div>
    </div>
  </React.Fragment>;
}

/* ════════ BENCH POPUP — edit a dateless draft in place ════════ */
function BenchPop({b,state,anyCur,actions,onOpenUnit,onClose}){
  const ed=(patch)=>actions.edit(b.id,patch);
  const units=(state?state.units:[]).filter(u=>!u.archived);
  const [tuid,setTuid]=React.useState((anyCur&&anyCur.id)||(units[0]&&units[0].id)||'');
  const steps=b.flowName&&PW.flowSteps?PW.flowSteps(b.flowName):null;
  return <React.Fragment>
    <div className="ph-pop-scrim" onClick={onClose}></div>
    <div className="ph-benchws" data-screen-label="Hub — Draft lesson" role="dialog" aria-label="Dateless draft lesson">
      <div className="bws-h"><span className="eb">DRAFT · NO DATE YET</span>
        <button className="ph-panel-x" title="Close" onClick={onClose}>{I.x}</button></div>
      <div className="wsed bws-body">
        <input className="wstitle" value={b.title} placeholder="Untitled draft" onChange={e=>ed({title:e.target.value})}/>
        <div className="wslbl">{DS.label('lesson',false)} objective</div>
        <textarea className="wsobj" value={b.objective||''} placeholder="I can…"
          onChange={e=>ed({objective:e.target.value,done:{...b.done,obj:!!e.target.value.trim()}})}></textarea>
        <div className="wsfields">
          <label><span>Duration</span><input type="number" min="5" step="5" value={b.dur||''} placeholder="—"
            onChange={e=>{ const v=Number(e.target.value); ed({dur:v>0?v:null}); }}/></label>
          <label><span>Flow template</span>
            <select value={b.flowName||''} onChange={e=>{ const v=e.target.value||null; ed({flowName:v,done:{...b.done,flow:!!v}}); }}>
              <option value="">None yet…</option><FlowOpts/></select></label>
        </div>
        {steps && <React.Fragment><div className="wslbl">Sequence{b.dur?' ('+b.dur+' min)':''}</div>
          <div className="wsseq">{steps.map((st,i)=><React.Fragment key={st+i}>{i>0&&<i>›</i>}<span className="stp"><b>{st}</b></span></React.Fragment>)}</div></React.Fragment>}
        <div className="wsecs">
          <div className="wsec open"><div className="wsec-h" style={{cursor:'default'}}><b>Assessment</b><span className="sum">{b.assessment?(b.assessment==='summative'?'Summative':'Formative check'):'—'}</span></div>
            <div className="wsec-b"><span className="ph-aseg">
              {[[null,'None'],['formative','Formative'],['summative','Summative']].map(([v,lab])=>(
                <button key={lab} className={b.assessment===v?'on':''}
                  onClick={()=>ed({assessment:v,assessTitle:v?(b.assessTitle||(v==='summative'?'Unit assessment':'Exit ticket')):'',done:{...b.done,assess:v!=null}})}>{lab}</button>))}
            </span>
            {b.assessment && <input className="wsin" value={b.assessTitle||''} placeholder="Name it — e.g. Exit ticket" onChange={e=>ed({assessTitle:e.target.value})}/>}</div>
          </div>
          <div className="wsec open"><div className="wsec-h" style={{cursor:'default'}}><b>Resources</b><span className="sum">{((b.resources||[]).length||'No')+' items'}</span></div>
            <div className="wsec-b"><ResPills l={b} actions={actions}/></div></div>
          <div className="wsec open"><div className="wsec-h" style={{cursor:'default'}}><b>Differentiation</b><span className="sum">{b.diffText?'Added':'—'}</span></div>
            <div className="wsec-b"><textarea className="wsta" value={b.diffText} placeholder="Support · on-level · extension notes…"
              onChange={e=>{ const v=e.target.value; ed({diffText:v,done:{...b.done,diff:!!v.trim()}}); }}></textarea></div></div>
        </div>
      </div>
      <div className="bws-foot">
        <button className="del" title="Delete this draft" onClick={()=>{ actions.remove(b.id); onClose(); }}>Delete draft</button>
        <div className="sch">
          <select value={tuid} title={'Which '+DS.label('unit',false).toLowerCase()+' to schedule it into'} onChange={e=>setTuid(e.target.value)}>
            {units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <button className="go" disabled={!tuid} title="Give it a date — drops into the next thin spot in that unit"
            onClick={()=>{ if(!tuid) return; actions.benchToUnit(b.id,tuid); onClose(); onOpenUnit(tuid); }}>Schedule →</button>
        </div>
      </div>
    </div>
  </React.Fragment>;
}

/* ════════ LIST LENS (same axis, flattened — no clock times) ════════ */
function ListLens({state,dated,query,group,onOpenLesson}){
  const SW=PW.SWLEN;
  const upcoming=[];
  state.units.forEach(u=>u.lessons.forEach(l=>{ if(l.slot>=PW.TODAY_SLOT && qMatchL(l,u,query)) upcoming.push({l,u}); }));
  upcoming.sort((a,b)=>a.l.slot-b.l.slot);
  const dayLbl=(sl)=>{
    if(!dated) return 'DAY '+(sl+1)+' · WEEK '+(Math.floor(sl/SW)+1)+(sl===PW.TODAY_SLOT?' · TODAY':'');
    const d=PW.SLOTS[sl];
    const wd=new Date(d.iso+'T12:00:00').toLocaleDateString('en-US',{weekday:'long'}).toUpperCase();
    return wd+' · '+PW.fmtSlot(sl).toUpperCase()+(sl===PW.TODAY_SLOT?' · TODAY':'');
  };
  const wkLbl=(w)=>{ const lo=w*SW, hi=Math.min(PW.SLOTS.length-1,lo+SW-1);
    return 'WEEK '+(w+1)+(dated?(' · '+PW.fmtSlot(lo).toUpperCase()+' – '+PW.fmtSlot(hi).toUpperCase()):''); };
  let blocks=[];
  if(group==='day'){
    const m=new Map();
    upcoming.forEach(r=>{ if(!m.has(r.l.slot)) m.set(r.l.slot,[]); m.get(r.l.slot).push(r); });
    blocks=[...m.entries()].map(([sl,rows])=>({key:'d'+sl,label:dayLbl(sl),rows}));
  } else if(group==='week'){
    const m=new Map();
    upcoming.forEach(r=>{ const w=Math.floor(r.l.slot/SW); if(!m.has(w)) m.set(w,[]); m.get(w).push(r); });
    blocks=[...m.entries()].map(([w,rows])=>({key:'w'+w,label:wkLbl(w),rows}));
  } else if(group==='unit'){
    state.units.forEach(u=>{ const rows=upcoming.filter(r=>r.u.id===u.id); if(rows.length) blocks.push({key:u.id,label:u.name.toUpperCase()+' · '+DS.SUBJECTS[u.sid].label.toUpperCase(),rows}); });
  } else {
    [...new Set(state.units.map(x=>x.sid))].forEach(sid=>{ const rows=upcoming.filter(r=>r.u.sid===sid); if(rows.length) blocks.push({key:sid,label:DS.SUBJECTS[sid].full.toUpperCase(),rows}); });
  }
  return <div className="ph-listlens" data-screen-label="Hub — List lens">
    {blocks.map(({key,label,rows})=><section key={key} className="ph-dayblock">
      <div className="ph-daybar"><span>{label}</span><span className="n">{rows.length} {rows.length===1?'lesson':'lessons'}</span></div>
      {rows.map(({l,u})=>{
        const s=DS.SUBJECTS[u.sid];
        const thin=l.status!=='taught'&&PW.comp(l)<=2;
        const when=group!=='day'?((dated?(l.status==='today'?'Today':PW.fmtSlot(l.slot)):('Day '+(l.slot+1)))+' · '):'';
        return <div key={l.id} className="ph-lrow" style={{'--lc':cv(s.c),'--lt':cv(s.tint)}} title={'Open in '+u.name}
          onClick={()=>onOpenLesson(u.id,l.id)}>
          <span className="time"><SubjChip sid={u.sid}/></span>
          <div className="main">
            <span className="t">{l.title}{l.modified && <em className="ph-modpill">Modified</em>}</span>
            <span className="meta">{when}{u.name}{l.std?(' · '+l.std):''} · {l.dur} min</span>
          </div>
          <AssessMark a={l.assessment}/>
          <Dots l={l}/>
          {l.status==='today' && <button className="ph-teachbtn" title="Open today's teach board (site)" onClick={e=>{e.stopPropagation(); location.href='V2 Site Design.html';}}>Teach →</button>}
          {l.status==='today' ? <span className="ph-status now">Today</span>
            : thin ? <span className="ph-status thin">Needs work</span>
            : PW.comp(l)>=4 ? <span className="ph-status done">Ready</span>
            : <span className="ph-status plan">Planned</span>}
        </div>;
      })}
    </section>)}
    {blocks.length===0 && <div className="ph-dayblock"><div className="ph-empty">Nothing upcoming matches.</div></div>}
  </div>;
}

/* ── selection context panel — stats + options for the picked unit/subject ── */
function CtxPanel({state,dated,selKey,actions,onOpenUnit,openWall,onClose}){
  if(selKey.startsWith('s:')){
    const sid=selKey.slice(2); const s=DS.SUBJECTS[sid];
    const units=state.units.filter(x=>x.sid===sid);
    const ls=units.flatMap(x=>x.lessons);
    const taught=ls.filter(l=>l.status==='taught').length;
    const ready=ls.filter(l=>PW.comp(l)>=4).length;
    const missed=ls.filter(l=>window.PHMore.isMissed(l)).length;
    const cur=units.find(x=>x.endSlot>=PW.TODAY_SLOT)||units[0];
    return <div className="ph-ctxpanel" data-screen-label="Hub — Subject details">
      <span className="d" style={{background:cv(s.c)}}></span>
      <b>{s.full}</b><KindTag level="subject"/>
      <span className="st">{units.length} {DS.label('unit',true).toLowerCase()}</span>
      <span className="st">{ls.length} {DS.label('lesson',true).toLowerCase()}</span>
      <span className="st">{taught} taught</span><span className="st ok">{ready} ready</span>
      {missed>0 && <span className="st bad">{missed} missed</span>}
      <span className="grow"></span>
      <button className="act" title="Every resource across this subject, on one wall" onClick={()=>openWall({kind:'subject',sid})}>{I.box} Wall</button>
      <button className="act go" title="Open the unit in progress" onClick={()=>onOpenUnit(cur.id)}>Open {cur.name} {I.chevR}</button>
      <button className="x" title="Dismiss" onClick={onClose}>{I.x}</button>
    </div>;
  }
  const u=state.units.find(x=>x.id===selKey); if(!u) return null;
  const s=DS.SUBJECTS[u.sid];
  const pac=PW.pacing(u);
  const sibs=state.units.filter(x=>x.sid===u.sid); const si=sibs.indexOf(u);
  const missed=u.lessons.filter(l=>window.PHMore.isMissed(l)).length;
  return <div className="ph-ctxpanel" data-screen-label="Hub — Unit details">
    <span className="d" style={{background:cv(s.c)}}></span>
    <b>{u.name}</b><KindTag level="unit"/><span className="su">{s.full}</span>
    <span className="st">{u.lessons.filter(l=>l.status==='taught').length}/{pac.total} taught</span>
    <span className="st ok">{pac.ready} ready</span>
    {pac.thin>0 && <span className="st warn">{pac.thin} need work</span>}
    {missed>0 && <span className="st bad">{missed} missed</span>}
    <span className="st">{dated?('ends '+pac.end):(pac.total+' lessons')}</span>
    {pac.slack!=null && <span className={'st '+(pac.slack>=0?'ok':'bad')}>{dated?(pac.slack>=0?(pac.slack+'d slack'):(Math.abs(pac.slack)+'d over')):(pac.slack>=0?(pac.slack+' room'):(Math.abs(pac.slack)+' over'))}</span>}
    <span className="grow"></span>
    <span className="ph-umove">
      <button title="Move this whole unit earlier — before the previous unit" disabled={si<=0} onClick={()=>actions.moveUnit(u.id,-1)}>{I.back}</button>
      <button title="Move this whole unit later — after the next unit" disabled={si>=sibs.length-1} onClick={()=>actions.moveUnit(u.id,1)} style={{transform:'scaleX(-1)'}}>{I.back}</button>
    </span>
    <button className="act" title="Every resource in this unit, on one wall" onClick={()=>openWall({kind:'unit',id:u.id})}>{I.box} Wall</button>
    <button className="act" title="Copy this whole unit — lessons, resources and all — right after itself" onClick={()=>actions.duplicateUnit(u.id)}>Duplicate</button>
    <button className="act go" title="Open this unit to plan inside" onClick={()=>onOpenUnit(u.id)}>Open {I.chevR}</button>
    <button className="x" title="Dismiss" onClick={onClose}>{I.x}</button>
  </div>;
}

/* new-subject popup — name + a swatch from the unused subject palette */
const SUBJ_VARS=Array.from({length:13},(_,i)=>'--subj-'+(i+1));
function NewSubjPop({range,onClose,onCreate}){
  const [name,setName]=useState('');
  const [unit2,setUnit2]=useState('');
  const used=new Set(Object.values(DS.SUBJECTS).map(s=>s.c));
  const opts=SUBJ_VARS.filter(v=>!used.has(v)).length?SUBJ_VARS.filter(v=>!used.has(v)):SUBJ_VARS;
  const [c,setC]=useState(opts[0]);
  const go=()=>{ const n=name.trim(); if(!n) return;
    onCreate({label:n.length>10?(n.slice(0,9)+'…'):n, full:n, c, tint:c+'-tint', ink:c+'-ink'}, unit2.trim()||null); };
  return <React.Fragment>
    <div className="ph-pop-scrim" onClick={onClose}></div>
    <div className="ph-misspanel ph-newsubj" role="dialog" aria-label="New subject" data-screen-label="Hub — New subject">
      <div className="ph-panel-h"><h3>New {DS.label('subject',false).toLowerCase()}</h3><button className="ph-panel-x" title="Close" onClick={onClose}>{I.x}</button></div>
      <label className="ph-fld"><span>Name</span>
        <input autoFocus value={name} placeholder="e.g. Science" onChange={e=>setName(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter') go(); }}/>
      </label>
      <label className="ph-fld"><span>First {DS.label('unit',false).toLowerCase()} {range?('— '+(range.s2-range.s1+1)+' days, right where you painted'):''}</span>
        <input value={unit2} placeholder={'e.g. Forces & Motion (optional)'} onChange={e=>setUnit2(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter') go(); }}/>
      </label>
      <div className="ph-fld"><span>Color</span>
        <div className="sw-row">{opts.map(v=><button key={v} type="button" className={'sw'+(c===v?' on':'')} style={{background:'var('+v+')'}} title="Pick this color" onClick={()=>setC(v)}></button>)}</div>
      </div>
      <div style={{display:'flex',justifyContent:'flex-end',marginTop:'14px'}}>
        <button className="ph-teachbtn" disabled={!name.trim()} style={!name.trim()?{opacity:.5,cursor:'default'}:null}
          onClick={go}>Create — a first {DS.label('unit',false).toLowerCase()} is added</button>
      </div>
    </div>
  </React.Fragment>;
}

/* ════════ TIMELINE (the hub) ════════ */
/* hub view prefs + open panels persist across visits — the Back button restores them */
const TLMEM=window.__phTLMem=window.__phTLMem||{};

/* any popup crash shows a card instead of unmounting the whole hub */
class PHBoundary extends React.Component{
  constructor(p){ super(p); this.state={err:null}; }
  static getDerivedStateFromError(e){ return {err:e}; }
  componentDidCatch(e,info){ try{ console.error('PH panel crash:',e,info&&info.componentStack); }catch(x){} }
  render(){ if(this.state.err){ return <div className="ph-crash"><b>This panel hit an error.</b><div className="m">{String((this.state.err&&this.state.err.message)||this.state.err)}</div><button onClick={this.props.onClose}>Close</button></div>; }
    return this.props.children; }
}

/* Units + List — every unit as a row, grouped by subject; click opens its planner */
function UnitsListAll({state,dated,onOpenUnitPop}){
  const sids=[...new Set(state.units.filter(u=>!u.archived).map(u=>u.sid))];
  return <div className="ph-unitslist">
    {sids.map(sid=>{ const s=DS.SUBJECTS[sid]; if(!s) return null;
      const units=state.units.filter(u=>u.sid===sid&&!u.archived);
      return <section key={sid} className="ph-ul-sec">
        <div className="ph-ul-h"><span className="d" style={{background:cv(s.c)}}></span><b>{s.full}</b><span className="n">{units.length}</span></div>
        <table className="ph-table ph-docktable ph-ul-table">
          <thead><tr><th>{DS.label('unit',false)}</th><th>{dated?'Dates':'Position'}</th><th>Taught</th><th>Status</th><th></th></tr></thead>
          <tbody>{units.map(u=>{ const tg=u.lessons.filter(l=>l.status==='taught').length;
            const st=(u.lessons.length&&tg>=u.lessons.length)||u.endSlot<PW.TODAY_SLOT?'done':(u.startSlot<=PW.TODAY_SLOT?'now':'plan');
            return <tr key={u.id} title={u.name+' — open its planner'} onClick={()=>onOpenUnitPop(u.id)}>
              <td className="c-nm"><span className="d" style={{background:cv(s.c)}}></span>{u.name}</td>
              <td>{dated?(PW.fmtSlot(u.startSlot)+' – '+PW.fmtSlot(u.endSlot)):('#'+(u.startSlot+1)+'–'+(u.endSlot+1))}</td>
              <td>{tg}/{u.lessons.length}</td>
              <td><span className={'ph-status '+(st==='done'?'done':st==='now'?'now':'plan')}>{st==='done'?'Done':st==='now'?'Now':'Upcoming'}</span></td>
              <td className="c-go"><button className="go" onClick={(e)=>{e.stopPropagation();onOpenUnitPop(u.id);}}>Open</button></td>
            </tr>; })}</tbody>
        </table>
      </section>; })}
  </div>;
}
function Timeline({state,dated,query,onOpenUnit,onOpenLesson,onFocusNew,openWall,actions,sel,setSel,expanded,setExpanded}){
  const [zoom,setZoom]=useState(TLMEM.zoom||'cozy');
  const [colw,setColw]=useState(TLMEM.colw||34);
  useEffect(()=>{ TLMEM.colw=colw; },[colw]);
  const [lens,setLens]=useState(TLMEM.lens||'bars');
  const [vmode,setVmode]=useState(TLMEM.vmode||'timeline');
  useEffect(()=>{ TLMEM.vmode=vmode; },[vmode]);
  const [org,setOrg]=useState(TLMEM.org||'subject');
  const [statusF,setStatusF]=useState(TLMEM.statusF||'all');
  const [density,setDensity]=useState(TLMEM.density||'comfort');
  const [benchOpen,setBenchOpen]=useState(null);
  const [selUnit,setSelUnit]=useState(TLMEM.selUnit||null);
  const zoomName=colw>=80?'roomy':colw>=30?'cozy':'compact';
  const wrap=useRef(null);
  const suppress=useRef(false);
  const [drag,setDrag]=useState(null);
  const [hov,setHov]=useState(null);            // {lid,uid,x,y} — rich dot preview
  const [newSubj,setNewSubj]=useState(false);
  const [selLid,setSelLid]=useState(null);      // lesson to preselect in the unit workspace
  const [selTab,setSelTab]=useState(null);      // workspace tab to land on (unitplan for unit-level entries)
  const [missOpen,setMissOpen]=useState(!!TLMEM.missOpen);
  const sids=[...new Set(state.units.map(u=>u.sid))];
  const SW=PW.SWLEN;
  const missed=window.PHMore.missedOf(state);

  const axis=dated
    ? PW.CAL.map(d=>({col:d.col,dnum:d.dnum,dowL:d.dowL,month:d.month,holiday:d.holiday,weekStart:d.weekStart}))
    : PW.SLOTS.map((d,i)=>({col:i,ord:i+1,weekStart:i%SW===0,week:Math.floor(i/SW)}));
  const cols=axis.length;
  const colOf=(slot)=>dated?PW.slotCol(slot):PW.clampSlot(slot);
  const todayCol=colOf(PW.TODAY_SLOT);
  const width=LBL+cols*colw;

  useEffect(()=>{ Object.assign(TLMEM,{zoom,lens,org,statusF,density,selUnit,missOpen}); });
  useEffect(()=>{ const el=wrap.current; if(el) el.scrollLeft=Math.max(0,todayCol*colw-el.clientWidth*0.45); },[zoom,dated,lens]);

  const groups=[];
  axis.forEach(d=>{
    const key=dated?d.month:d.week;
    const g=groups[groups.length-1];
    if(!g||g.key!==key) groups.push({key,label:dated?MONTHS[d.month]:('Week '+(d.week+1)),n:1});
    else g.n++;
  });

  const colFromEvent=(e)=>{
    const el=wrap.current,r=el.getBoundingClientRect();
    return Math.floor((e.clientX-r.left+el.scrollLeft-LBL)/colw);
  };
  const colToSlot=(c)=>{
    c=Math.max(0,Math.min(c,cols-1));
    if(!dated) return c;
    for(let i=c;i<PW.CAL.length;i++){ if(PW.CAL[i].slot!=null) return PW.CAL[i].slot; }
    return PW.SLOTS.length-1;
  };

  /* lesson-dot drag (ripples later lessons) */
  const tickDrag=(l,isMissed)=>(e)=>{
    e.preventDefault(); e.stopPropagation();
    let moved=false, ck=false; const x0=e.clientX;
    const move=(ev)=>{
      if(Math.abs(ev.clientX-x0)>4) moved=true;
      if(moved&&!ck){ ck=true; actions.checkpoint(); }
      if(moved){ actions.setSlot(l.id,colToSlot(colFromEvent(ev))); setDrag({kind:'lesson',id:l.id,x:ev.clientX,y:ev.clientY}); }
    };
    const up=()=>{
      window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up);
      setDrag(null);
      if(moved) actions.toast('Lesson moved — everything after rippled');
      if(!moved){ if(isMissed) setMissOpen(true);
        else { const fu=state.units.find(x=>x.lessons.some(y=>y.id===l.id)); if(fu){ setSelUnit(fu.id); setSelLid(l.id); } } }
    };
    window.addEventListener('pointermove',move); window.addEventListener('pointerup',up);
  };

  /* click-drag on empty track — paint a brand-new unit across those days (touch: long-press plants a 3-day unit) */
  const newUnitDrag=(sid)=>(e)=>{
    if(e.button!==0||e.target!==e.currentTarget) return;
    if(e.pointerType==='touch'){
      const c0=colFromEvent(e), x0=e.clientX, y0=e.clientY;
      const cleanup=()=>{ clearTimeout(tm); window.removeEventListener('pointermove',mv); window.removeEventListener('pointerup',cleanup); window.removeEventListener('pointercancel',cleanup); };
      const mv=(ev)=>{ if(Math.abs(ev.clientX-x0)>8||Math.abs(ev.clientY-y0)>8) cleanup(); };
      const tm=setTimeout(()=>{ cleanup(); const s1=colToSlot(c0);
        const at=state.units.filter(x=>x.sid===sid&&!x.archived&&x.startSlot<s1).length;
        actions.addUnit(sid,at,(nid)=>{ setTimeout(()=>{ (actions.anchorUnit||actions.setUnitStart)(nid,s1);
          setTimeout(()=>{ actions.resizeUnit(nid,s1+2); setSelUnit(nid); actions.toast('New '+DS.label('unit',false).toLowerCase()+' planted — drag its right edge to size it'); },0); },0); });
      },500);
      window.addEventListener('pointermove',mv); window.addEventListener('pointerup',cleanup); window.addEventListener('pointercancel',cleanup);
      return;
    }
    e.preventDefault();
    const c0=colFromEvent(e);
    setDrag({kind:'new',sid,a:c0,b:c0,x:e.clientX,y:e.clientY});
    const move=(ev)=>setDrag({kind:'new',sid,a:c0,b:colFromEvent(ev),x:ev.clientX,y:ev.clientY});
    const up=(ev)=>{
      window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up);
      setDrag(null);
      if(Math.abs(ev.clientX-e.clientX)<6) return;                    /* a bare click — not a paint */
      const c1=colFromEvent(ev);
      const s1=colToSlot(Math.min(c0,c1)), s2=colToSlot(Math.max(c0,c1));
      const at=state.units.filter(x=>x.sid===sid&&!x.archived&&x.startSlot<s1).length;
      actions.addUnit(sid,at,(nid)=>{ setTimeout(()=>{ (actions.anchorUnit||actions.setUnitStart)(nid,s1);
        setTimeout(()=>{ actions.resizeUnit(nid,s2); setSelUnit(nid); actions.toast('New '+DS.label('unit',false).toLowerCase()+' painted — name it'); },0); },0); });
    };
    window.addEventListener('pointermove',move); window.addEventListener('pointerup',up);
  };

  const locateUnit=(uid)=>{ const u=state.units.find(x=>x.id===uid); if(!u) return;
    setVmode('timeline');
    setTimeout(()=>{ const el=wrap.current; if(!el) return;
      el.scrollTo({left:Math.max(0,PW.slotCol(u.startSlot)*colw-160),behavior:'smooth'});
      actions.toast('→ '+u.name); },60); };

  /* drag on the empty add-subject lane — paint a unit for a subject that doesn't exist yet */
  const newSubjPaint=(e)=>{
    if(e.button!==0||e.target!==e.currentTarget) return;
    e.preventDefault();
    const c0=colFromEvent(e);
    setDrag({kind:'newsubj',a:c0,b:c0});
    const move=(ev)=>setDrag({kind:'newsubj',a:c0,b:colFromEvent(ev)});
    const up=(ev)=>{
      window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up);
      setDrag(null);
      if(Math.abs(ev.clientX-e.clientX)<6) return;
      const c1=colFromEvent(ev);
      setNewSubj({s1:colToSlot(Math.min(c0,c1)),s2:colToSlot(Math.max(c0,c1))});
    };
    window.addEventListener('pointermove',move); window.addEventListener('pointerup',up);
  };

  /* whole-unit drag (re-pace: lessons follow, later units bump) */
  const bandDrag=(u)=>(e)=>{
    if(e.button!==0) return;
    e.preventDefault();
    const startSlot=colToSlot(colFromEvent(e));
    const first=u.lessons[0]; if(!first) return;
    const basePad=first.pad||0;
    let moved=false, ck=false; const x0=e.clientX;
    const move=(ev)=>{
      if(Math.abs(ev.clientX-x0)>4) moved=true;
      if(moved&&!ck){ ck=true; actions.checkpoint(); }
      if(moved){ actions.padUnit(u.id, basePad + (colToSlot(colFromEvent(ev))-startSlot)); setDrag({kind:'unit',id:u.id,x:ev.clientX,y:ev.clientY}); }
    };
    const up=()=>{
      window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up);
      setDrag(null);
      if(moved){ actions.toast('Unit re-paced — later units bumped'); suppress.current=true; setTimeout(()=>{ suppress.current=false; },60); }
    };
    window.addEventListener('pointermove',move); window.addEventListener('pointerup',up);
  };

  /* right-edge drag — extend the unit with blank lessons (or pull freshly-added ones back off) */
  const resizeDrag=(u)=>(e)=>{
    if(e.button!==0) return;
    e.preventDefault(); e.stopPropagation();
    let ck=false;
    const move=(ev)=>{ if(!ck){ ck=true; actions.checkpoint(); }
      actions.resizeUnit(u.id, colToSlot(colFromEvent(ev))); setDrag({kind:'resize',id:u.id,x:ev.clientX,y:ev.clientY}); };
    const up=()=>{ window.removeEventListener('pointermove',move); window.removeEventListener('pointerup',up);
      setDrag(null); if(ck) actions.toast('Unit resized — blank lessons adjusted');
      suppress.current=true; setTimeout(()=>{ suppress.current=false; },60); };
    window.addEventListener('pointermove',move); window.addEventListener('pointerup',up);
  };

  const dragInfo=(()=>{ 
    if(!drag) return null;
    if(drag.kind==='lesson'){ let f=null,fu=null; state.units.forEach(u=>u.lessons.forEach(l=>{ if(l.id===drag.id){f=l;fu=u;} })); 
      return f?{a:dated?f.date:('Position '+(f.slot+1)),b:'ripples '+PW.laterCount(state,f)+' later '+(PW.laterCount(state,f)===1?'lesson':'lessons')}:null; }
    if(drag.kind==='resize'){ const u=state.units.find(x=>x.id===drag.id);
      return u?{a:u.lessons.length+' '+DS.label('lesson',true).toLowerCase(),b:'drag right to add blank lessons · left to remove them'}:null; }
    const u=state.units.find(x=>x.id===drag.id);
    return u?{a:(dated?(PW.fmtSlot(u.startSlot)+' – '+PW.fmtSlot(u.endSlot)):('Positions '+(u.startSlot+1)+'–'+(u.endSlot+1))),b:'later units bump automatically'}:null;
  })();
  const curUnitFor=(units)=>units.find(u=>u.endSlot>=PW.TODAY_SLOT)||units[0];
  const anyCur=curUnitFor(state.units.filter(u=>!u.archived));

  return <div data-screen-label="Hub — Timeline">
    <div className="ph-hubline">
      <div className="ph-bigseg" role="tablist" title="What to plan">
        <button className={lens==='bars'?'on':''} onClick={()=>setLens('bars')}>{DS.label('unit',true)}</button>
        <button className={lens==='list'?'on':''} onClick={()=>setLens('list')}>{DS.label('lesson',true)}</button>
      </div>
      {lens==='bars' && <div className="ph-bigseg mode" role="tablist" title="How to see them">
        <button className={vmode==='timeline'?'on':''} onClick={()=>setVmode('timeline')}>Timeline</button>
        <button className={vmode==='list'?'on':''} onClick={()=>setVmode('list')}>List</button>
      </div>}
      <span className="sub">{lens==='bars'
        ?(vmode==='timeline'?'Click a bar to open its '+DS.label('unit',false).toLowerCase()+' planner · click a dot for its '+DS.label('lesson',false).toLowerCase()+' · click-hold and drag to move'
          :'Every '+DS.label('unit',false).toLowerCase()+' as a row — click one to open its planner')
        :('Every '+DS.label('lesson',false).toLowerCase()+', grouped your way — expand any row to plan it right there')}</span>
    </div>
    <div className={'ph-tlcard'+(lens==='list'?' lens-list':'')}>
      <div className="ph-tl-toolbar">
        {lens==='bars' && vmode==='timeline' && <div className="ph-zoom" title="Magnify the timeline — wide days show lesson titles; narrow days show the most weeks">
          <span className="zi">−</span>
          <input type="range" min="16" max="130" step="2" value={colw} aria-label="Timeline magnification"
            onChange={e=>setColw(Number(e.target.value))}/>
          <span className="zi big">+</span>
        </div>}
        {lens==='list' && <React.Fragment>
          <label className="ph-pick" title="How the list is organized">Organize
            <select value={org} onChange={e=>setOrg(e.target.value)}>
              <option value="subject">By subject</option>
              <option value="unit">By {DS.label('unit',false).toLowerCase()}</option>
              <option value="schedule">By schedule</option>
              <option value="catchup">Catch-up{missed.length?(' ('+missed.length+')'):''}</option>
            </select>{I.chev}
          </label>
          <label className="ph-pick" title="Filter by how complete each lesson is">Status
            <select value={statusF} onChange={e=>setStatusF(e.target.value)}>
              <option value="all">All</option><option value="ready">Ready</option><option value="thin">Needs work</option>
              <option value="taught">Taught</option><option value="untaught">Not yet</option>
            </select>{I.chev}
          </label>
          <div className="ph-seg" title="Row density">
            {[['comfort','Comfort'],['compact','Compact']].map(([k,lab])=>(
              <button key={k} className={density===k?'on':''} onClick={()=>setDensity(k)}>{lab}</button>
            ))}
          </div>
        </React.Fragment>}
        <span className="ph-tbright">
          {missed.length>0 && <button className="ph-misschip" title="Lessons whose day passed with barely a plan — triage them in Catch-up"
            onClick={()=>{ setLens('list'); setOrg('catchup'); }}><span className="dot"></span>{missed.length} missed</button>}
          <span className="ph-legend"><i className="lg-done"></i>taught <i className="lg-plan"></i>planned <i className="lg-thin"></i>needs work <i style={{background:'var(--danger)'}}></i>missed <i className="lg-tgt"></i>target</span>
        </span>
      </div>
      {lens==='list'
        ? <window.PHLessonsLens state={state} dated={dated} query={query} org={org} statusF={statusF} density={density}
            sel={sel} setSel={setSel} expanded={expanded} setExpanded={setExpanded} actions={actions}
            onOpenUnit={onOpenUnit} onFocus={(uid2,lid2)=>{ setSelUnit(uid2); setSelLid(lid2); }} openWall={openWall}/>
        : vmode==='list'
        ? <UnitsListAll state={state} dated={dated} onOpenUnitPop={(uid2)=>setSelUnit(uid2)}/>
        : <div className="ph-tl" data-zoom={zoomName} data-lens="units" ref={wrap}>
        <div className="ph-tlnavrow"><button title="Scroll the timeline earlier" onClick={()=>{ const el=wrap.current; if(el) el.scrollBy({left:-el.clientWidth*0.7,behavior:'smooth'}); }}>{'‹'}</button><button title="Scroll the timeline later" onClick={()=>{ const el=wrap.current; if(el) el.scrollBy({left:el.clientWidth*0.7,behavior:'smooth'}); }}>{'›'}</button></div>
        <div className="ph-tl-in" style={{width:width+'px'}}>
          <div className="ph-tl-head">
            <div className="ph-tl-mrow"><div className="ph-tl-spacer"></div>
              {groups.map(g=><div key={g.key} className="ph-tl-month" style={{width:g.n*colw+'px'}}>{g.label}</div>)}
            </div>
            <div className="ph-tl-drow"><div className="ph-tl-spacer"></div>
              {axis.map(d=><div key={d.col} className={'ph-tl-day'+(d.weekStart?' wk':'')+(d.holiday?' hol':'')+(d.col===todayCol?' today':'')}
                style={{width:colw+'px'}} title={d.holiday||''}>
                {dated?<React.Fragment><span className="w">{d.dowL}</span><span className="n">{d.dnum}</span></React.Fragment>
                      :<span className="n">{d.ord}</span>}
              </div>)}
            </div>
          </div>
          <div className="ph-lanes">
            <div className="ph-gridlayer" style={{left:LBL+'px',width:cols*colw+'px',
              backgroundImage:'linear-gradient(90deg,var(--phx-hair) 1px,transparent 1px)',backgroundSize:colw+'px 100%'}}>
              {(()=>{ const wkLo=PW.TODAY_SLOT-(PW.TODAY_SLOT%SW); const wkHi=Math.min(wkLo+SW-1,PW.SLOTS.length-1);
                const wl=colOf(wkLo)*colw; return <div className="ph-curweek" style={{left:wl+'px',width:((colOf(wkHi)+1)*colw-wl)+'px'}} title="This week"></div>; })()}
              {axis.map(d=>{
                if(d.holiday) return <div key={d.col} className="ph-holcol" style={{left:d.col*colw+'px',width:colw+'px'}} title={d.holiday}></div>;
                if(d.weekStart) return <div key={d.col} className="ph-weekline" style={{left:d.col*colw+'px'}}></div>;
                return null;
              })}
              <div className="ph-todayline" style={{left:todayCol*colw+colw/2+'px'}}></div>
            </div>
            {sids.map(sid=>{
              const s=DS.SUBJECTS[sid];
              const units=state.units.filter(u=>u.sid===sid&&!u.archived);
              const cur=curUnitFor(units);
              const srt=units.slice().sort((a,b)=>a.startSlot-b.startSlot||a.endSlot-b.endSlot);
              const lvl={}; const levEnd=[];
              srt.forEach(u2=>{ let k=levEnd.findIndex(e2=>e2<u2.startSlot); if(k<0){ k=levEnd.length; levEnd.push(u2.endSlot); } else { levEnd[k]=u2.endSlot; } lvl[u2.id]=k; });
              const maxLvl=Math.max(0,levEnd.length-1);
              return <div className="ph-lane" key={sid} style={maxLvl?{paddingBottom:(maxLvl*46)+'px'}:null}>
                <div className="ph-lane-lbl" role="button" title={'Click for '+s.full+' details and options'}
                  onClick={()=>setSelUnit(selUnit===('s:'+sid)?null:('s:'+sid))}>
                  <span className="d" style={{background:cv(s.c)}}></span>
                  <span><span className="nm">{s.full}</span><br/><span className="cu">{cur?('Now: '+cur.name):''}</span></span>
                </div>
                <div className="ph-lane-track" style={{width:cols*colw+'px'}} onPointerDown={newUnitDrag(sid)}
                  onDragOver={(e)=>{ try{ const t=[...e.dataTransfer.types]; if(t.includes('text/ph-unit')||t.includes('text/ws-lesson')) e.preventDefault(); }catch(x){} }}
                  onDrop={(e)=>{ let lid2=''; try{ lid2=e.dataTransfer.getData('text/ws-lesson'); }catch(x){}
                    if(lid2){ e.preventDefault(); actions.setSlot(lid2, colToSlot(colFromEvent(e))); actions.toast('Lesson moved — everything after rippled'); return; }
                    let uid2=''; try{ uid2=e.dataTransfer.getData('text/ph-unit'); }catch(x){} if(!uid2) return; e.preventDefault();
                    const u2=state.units.find(x=>x.id===uid2); if(!u2) return;
                    actions.setUnitStart(uid2, colToSlot(colFromEvent(e)));
                    actions.toast(u2.name+' → rescheduled'); }}
                  title="Drag across empty days to paint a new unit">
                  {drag&&drag.kind==='new'&&drag.sid===sid && (()=>{ const lo=Math.min(drag.a,drag.b), hi=Math.max(drag.a,drag.b);
                    return <div className="ph-band ghostnew" style={{left:lo*colw+'px',width:(hi-lo+1)*colw+'px','--bc':cv(s.c)}}><span className="bnm">New {DS.label('unit',false).toLowerCase()}</span></div>; })()}
                  {units.map(u=>{
                    const x1=colOf(u.startSlot)*colw, x2=(colOf(u.endSlot)+1)*colw;
                    const ready=u.lessons.filter(l=>PW.comp(l)>=4).length;
                    const dim=query&&!u.lessons.some(l=>qMatchL(l,u,query))&&!u.name.toLowerCase().includes(query.toLowerCase());
                    return <div key={u.id} className={'ph-band'+(dim?' dim':'')+(selUnit===u.id?' sel':'')+(drag&&(drag.kind==='unit'||drag.kind==='resize')&&drag.id===u.id?' dragging':'')}
                      style={{left:x1+'px',width:(x2-x1)+'px','--bc':cv(s.c),'--btint':cv(s.tint),transform:lvl[u.id]?('translateY('+(lvl[u.id]*46)+'px)'):undefined}}
                      title={u.name+' · '+u.lessons.length+' lessons · '+ready+' fully planned — stacked units overlap until you move one · drag to re-pace · click to open'}
                      onPointerDown={bandDrag(u)}
                      onClick={()=>{ if(suppress.current) return; setSelLid(null); setSelTab('unitplan'); setSelUnit(u.id); }}>
                      <span className="bnm">{u.name}</span>
                      <span className="bpct">{ready}/{u.lessons.length}</span>
                      <span className="bhandle" title="Drag to grow this unit — new blank lessons fill the days"
                        onPointerDown={resizeDrag(u)} onClick={e=>e.stopPropagation()}></span>
                      {u.target!=null && <span className="btarget" style={{left:(colOf(u.target)*colw-x1+colw/2)+'px'}} title={'Target end'+(dated?(' · '+PW.fmtSlot(u.target)):'')}></span>}
                    </div>;
                  })}
                  {(()=>{ const laneLs=units.flatMap(u=>u.lessons.map(l=>({l,u})));
                    const bySlot={}; laneLs.forEach(({l})=>{ (bySlot[l.slot]=bySlot[l.slot]||[]).push(l.id); });
                    return laneLs.map(({l,u})=>{
                    const grp=bySlot[l.slot];
                    const topPos=grp.length>1?((24+36*(grp.indexOf(l.id)/(grp.length-1)))+'%'):'36%';
                    const miss=window.PHMore.isMissed(l);
                    const thin=!miss&&l.status!=='taught'&&PW.comp(l)<=2;
                    const dim=query&&!qMatchL(l,u,query);
                    return <button key={l.id}
                      className={'ph-tick st-'+l.status+(miss?' missed':'')+(thin?' thin':'')+(drag&&drag.kind==='lesson'&&drag.id===l.id?' drag':'')+(dim?' dim':'')}
                      style={{left:(colOf(l.slot)*colw+colw/2)+'px',top:topPos,'--tc':cv(s.c)}}
                      onMouseEnter={e=>{ const r=e.currentTarget.getBoundingClientRect(); setHov({lid:l.id,uid:u.id,x:r.left+r.width/2,y:r.top}); }}
                      onMouseLeave={()=>setHov(null)}
                      onPointerDown={e=>{ setHov(null); tickDrag(l,miss)(e); }}>
                      {l.assessment && <AssessMark a={l.assessment} size={8}/>}
                      {colw>=80 && <i className="tt">{l.title||'Untitled'}</i>}
                    </button>;
                  }); })()}
                  {(()=>{ const occ=new Set(); units.forEach(x=>x.lessons.forEach(l=>occ.add(l.slot)));
                    const btns=[];
                    for(let sl2=0; sl2<PW.SLOTS.length; sl2++){
                      if(occ.has(sl2)) continue;
                      btns.push(<button key={'add'+sl2} className="ph-addslot"
                        style={{left:(colOf(sl2)*colw+colw/2)+'px'}}
                        title={'Add a lesson here — '+(dated?PW.fmtSlot(sl2):('day '+(sl2+1)))}
                        onClick={e=>{ e.stopPropagation(); actions.addAt(sid,sl2,(uid2,nid)=>{ setSelUnit(uid2); setSelLid(nid); }); }}>+</button>);
                    }
                    return btns; })()}
                </div>
              </div>;
            })}
            <div className="ph-lane addlane">
              <button className="ph-addsubj" title={'Add another '+DS.label('subject',false).toLowerCase()+' — or just drag across days to paint its first '+DS.label('unit',false).toLowerCase()} onClick={()=>setNewSubj(true)}>{I.plus} New {DS.label('subject',false).toLowerCase()}</button>
              <div className="ph-lane-track addtrack" style={{width:cols*colw+'px'}} onPointerDown={newSubjPaint}
                title="Drag across days here — paint the first unit of a brand-new subject, then name both">
                {drag&&drag.kind==='newsubj' && (()=>{ const lo=Math.min(drag.a,drag.b), hi=Math.max(drag.a,drag.b);
                  return <div className="ph-band ghostnew" style={{left:lo*colw+'px',width:(hi-lo+1)*colw+'px','--bc':'var(--brand-500)'}}><span className="bnm">New {DS.label('subject',false).toLowerCase()}</span></div>; })()}
              </div>
            </div>
          </div>
        </div>
      </div>}
      {window.PHDrawer && <window.PHDrawer state={state} dated={dated} actions={actions} anyCur={anyCur}
        openUnitPop={(uid)=>{ setSelLid(null); setSelTab('unitplan'); setSelUnit(uid); }} openLesson={(uid,lid)=>{ setSelTab(null); setSelUnit(uid); setSelLid(lid); }}
        openBench={(id)=>setBenchOpen(id)} locate={locateUnit}/>}
      {!window.PHDrawer && <div className="ph-benchrow">
        <span className="lbl">{I.bench} Bench — {DS.label('lesson',true).toLowerCase()} with no date yet</span>
        {state.bench.map(b=><span key={b.id} className="ph-benchchip">
          <button className="bt" title="Open this draft — plan it right here without leaving" onClick={()=>setBenchOpen(b.id)}>{b.title}</button>
          <button title={'Slot it into '+(anyCur?anyCur.name:'the current unit')+' at the next thin spot'} onClick={()=>{ if(!anyCur) return; actions.benchToUnit(b.id,anyCur.id); onOpenUnit(anyCur.id); }}>Plan it</button>
        </span>)}
        <button className="ph-benchadd" title="Draft a lesson with no date — schedule it later" onClick={()=>actions.addBench()}>{'+ Draft one'}</button>
      </div>}
    </div>
    {selUnit && String(selUnit).indexOf('s:')!==0 && window.PHWorkspace && <div><window.PHWorkspace state={state} uid={selUnit} lid={selLid} tab0={selLid?null:(selTab||'lessons')} dated={dated} actions={actions} onClose={()=>{ setSelUnit(null); setSelLid(null); setSelTab(null); }}/></div>}
    {selUnit && (String(selUnit).indexOf('s:')===0 || !window.PHWorkspace) && window.PHDock && <React.Fragment><div className="ph-pop-scrim" onClick={()=>setSelUnit(null)}></div><div className="ph-misspanel ph-dockpop" data-screen-label="Hub — Unit dock popup" role="dialog" aria-label="Unit editor"><PHBoundary onClose={()=>setSelUnit(null)}><window.PHDock key={selUnit} state={state} selKey={selUnit} dated={dated} actions={actions}
      onOpenUnit={onOpenUnit} openWall={openWall}
      onOpenInLessons={(uid2)=>{ setLens('list'); setVmode('list'); setOrg('unit'); setTimeout(()=>{ const el=document.getElementById('ph-lg-'+uid2); if(el) document.scrollingElement.scrollTop += el.getBoundingClientRect().top-180; },140); }}
      onClose={()=>setSelUnit(null)}/></PHBoundary></div></React.Fragment>}
    {newSubj && <NewSubjPop range={typeof newSubj==='object'?newSubj:null} onClose={()=>setNewSubj(false)} onCreate={(def,unitName)=>{
      const id='cs'+Date.now().toString(36); DS.addSubject(id,def);
      const rng=typeof newSubj==='object'?newSubj:null; setNewSubj(false);
      actions.addUnit(id,0,(nid)=>{
        if(unitName&&actions.editUnit) actions.editUnit(nid,{name:unitName});
        if(rng){ setTimeout(()=>{ (actions.anchorUnit||actions.setUnitStart)(nid,rng.s1);
          setTimeout(()=>{ actions.resizeUnit(nid,rng.s2); setSelUnit(nid); },0); },0); }
        else setSelUnit(nid);
      }); }}/>}
    {hov && !drag && (()=>{ const hu=state.units.find(x=>x.id===hov.uid); const hl=hu&&hu.lessons.find(x=>x.id===hov.lid);
      if(!hu||!hl) return null; const hs=DS.SUBJECTS[hu.sid]; const hc=PW.comp(hl); const hm=window.PHMore.isMissed(hl);
      const host=document.querySelector('.ph-app'); if(!host) return null;
      return ReactDOM.createPortal(<div className={'ph-tickpop'+(hov.y<250?' below':'')} style={{left:Math.max(140,Math.min(window.innerWidth-140,hov.x))+'px',top:hov.y+'px'}}>
        <div className="tp-h"><span className="d" style={{background:cv(hs.c)}}></span><b>{hl.title||'Untitled'}</b><KindTag level="lesson"/></div>
        <div className="tp-sub">{DS.label('lesson',false)} {hu.lessons.indexOf(hl)+1} of {hu.lessons.length} · {hu.name} · {dated?hl.date:('#'+(hl.slot+1))}{hl.dur?(' · '+hl.dur+'m'):''}</div>
        {hl.objective && <div className="tp-obj">{hl.objective}</div>}
        <div className="tp-stats">
          <span className={'tp-badge '+(hm?'bad':hl.status)}>{hm?'Missed':hl.status==='taught'?'Taught':hl.status==='today'?'Today':'Upcoming'}</span>
          <span className="tp-badge">{hc}/5 planned</span>
          {hl.flowName && <span className="tp-badge">{hl.flowName}</span>}
          {hl.assessment && <span className="tp-badge">{hl.assessment}{hl.assessTitle?(': '+hl.assessTitle):''}</span>}
          {(hl.resN||0)>0 && <span className="tp-badge">{hl.resN} resources</span>}
          {hl.tags.slice(0,3).map(t=><span key={t} className="tp-badge">{t}</span>)}
        </div>
        <div className="tp-cap">{hm?'Click to catch up':'Click to plan · drag to move'}</div>
      </div>, host); })()}
    {drag && dragInfo && <div className="ph-draghint" style={{left:drag.x+16+'px',top:drag.y-36+'px'}}>
      <b>{dragInfo.a}</b> · {dragInfo.b}
    </div>}
    {lens==='list' && <BulkBar sel={sel} setSel={setSel} dated={dated} actions={actions}/>}
    {missOpen && <window.PHMore.MissedPanel state={state} dated={dated} actions={actions}
      onOpenLesson={(uid,lid)=>{ setMissOpen(false); onOpenLesson(uid,lid); }} onClose={()=>setMissOpen(false)}/>}
    {benchOpen && (()=>{ const b=state.bench.find(x=>x.id===benchOpen);
      return b?<BenchPop b={b} anyCur={anyCur} actions={actions} onOpenUnit={onOpenUnit} onClose={()=>setBenchOpen(null)}/>:null; })()}
  </div>;
}

/* ════════ UNIT VIEW ════════ */
const EQS={
  'math-md':'How do place-value strategies make big multiplication and division manageable?',
  'read-inf':'What do good readers do when the text doesn\u2019t say it directly?',
  'writ-op':'How do writers make people care about their opinion?',
  'exp-en':'Where does energy come from, and where does it go?',
};
const compClass=(l)=>{ const c=PW.comp(l); return c<=1?'c1':c<=3?'c2':c===4?'c3':'c4'; };

function UnitContext({u,l,actions}){
  const stds=(u.stds&&u.stds.length)?u.stds:null;
  return <aside className="ph-uctx">
    <div className="h">{I.target} Unit plan · {u.name}</div>
    <textarea className="eqedit" rows="2"
      value={u.eq!=null?u.eq:(EQS[u.id]||'')}
      placeholder={'Essential question — what should every student walk away from '+u.name+' able to do?'}
      onChange={e=>actions.editUnit(u.id,{eq:e.target.value})}></textarea>
    {stds && <div className="stds">
      {stds.map(([code,desc])=>{
        const on=l.tags.includes(code);
        return <button key={code} className={'stdrow'+(on?' on':'')} title={(on?'Untag ':'Tag ')+code+' for this lesson'}
          onClick={()=>actions.toggleTag(l.id,code)}>
          <span><span className="code">{code}</span><div className="desc">{desc}</div></span>
          {on && <span className="tick">{I.check}</span>}
        </button>;
      })}
    </div>}
    <div className="cap">Backwards planning: tap a standard to tag this lesson. The unit\u2019s goals stay beside you while you write.</div>
  </aside>;
}

function Editor({u,l,dated,actions,openWall}){
  const ed=(patch)=>actions.edit(l.id,patch);
  const lidx=u.lessons.indexOf(l);
  const unitFw=FW.effective(u,window.__phSettings||{});
  const fwId=l.fwId||unitFw;
  const fw=FW.get(fwId);
  const objBody=l.objective.replace(/^I can\s*/i,'');
  const taught=l.status==='taught';
  const [reveal,setReveal]=useState([]);
  const S=window.__phSettings||{};
  const cfDefs=[...(S.customFields||[]),...(((S.subjectCF||{})[u.sid])||[]),...(u.customFields||[])];
  const show=(k,has)=>S.uiLevel==='advanced'||has||reveal.includes(k);
  const vis={
    flow: show('flow', !!l.flowName),
    res:  true,
    assess: show('assess', l.assessment!=null),
    diff: show('diff', !!(l.diffText&&l.diffText.trim())),
    notes: show('notes', !!(l.notes&&l.notes.trim())),
  };
  const fwShown=(fw.lessonFields||[]).filter(fd=>show('fw_'+fd.k, !FW.isEmpty((l.fwData||{})[fd.k])));
  const fwHidden=(fw.lessonFields||[]).filter(fd=>!fwShown.includes(fd));
  const cfShown=cfDefs.filter(d=>show('cf_'+d.id, !FW.isEmpty((l.fwData||{})[d.id])));
  const cfHidden=cfDefs.filter(d=>!cfShown.includes(d));
  const hiddenChips=[
    ...(!vis.flow?[['flow','Flow template']]:[]),
    ...(!vis.res?[['res','Resources']]:[]),
    ...(!vis.assess?[['assess','Assessment']]:[]),
    ...(!vis.diff?[['diff','Differentiation']]:[]),
    ...(!vis.notes?[['notes','Notes']]:[]),
    ...fwHidden.map(fd=>['fw_'+fd.k,fd.label]),
    ...cfHidden.map(d=>['cf_'+d.id,d.label]),
  ];
  return <div className="ph-ed" style={{'--sc':cv(DS.SUBJECTS[u.sid].c)}}>
    <div>
      <div className="ph-ed-head"><b>{DS.label('lesson',false)} {lidx+1}</b><span>of {u.lessons.length}</span><span className="sep">·</span><span>{u.name}</span>{dated&&<React.Fragment><span className="sep">·</span><span>{l.date}</span></React.Fragment>}<span className="grow"></span><span className="ph-uiseg" title="Simple shows the essentials — Advanced shows every field">{[['simple','Simple'],['advanced','Advanced']].map(([k,lab])=><button key={k} className={(S.uiLevel||'simple')===k?'on':''} onClick={()=>window.__phSetUiLevel&&window.__phSetUiLevel(k)}>{lab}</button>)}</span></div>
      <div className="ph-ed-form">
        <label className="ph-fld wide"><span>Title</span>
          <input value={l.title} onChange={e=>ed({title:e.target.value})} placeholder="Lesson title…"/>
        </label>
        <label className="ph-fld"><span>{fw.lessonObjective}</span>
          <span className="ph-obj"><em>I can</em>
            <input value={objBody} placeholder="state what students will be able to do…"
              onChange={e=>{ const v=e.target.value; ed({objective:v?('I can '+v):'', done:{...l.done,obj:!!v.trim()}}); }}/>
          </span>
        </label>
        <label className="ph-fld" style={{maxWidth:'110px'}}><span>Duration <em className="opt">optional</em></span>
          <input type="number" min="5" step="5" value={l.dur||''} placeholder="—" onChange={e=>{ const v=Number(e.target.value); ed({dur:v>0?v:null}); }}/>
        </label>
        {vis.flow && <label className="ph-fld"><span>Flow template</span>
          <select value={l.flowName||''} onChange={e=>{ const v=e.target.value||null; ed({flowName:v, done:{...l.done,flow:!!v}}); }}>
            <option value="">None yet…</option>
            <FlowOpts/>
          </select>
          {l.flowName && <FlowSteps name={l.flowName}/>}
        </label>}
        {vis.assess && <label className="ph-fld"><span>Assessment</span>
          <span className="ph-aseg">
            {[[null,'None'],['formative','Formative'],['summative','Summative']].map(([v,lab])=>(
              <button key={lab} className={l.assessment===v?'on':''}
                onClick={()=>ed({assessment:v, assessTitle:v?(l.assessTitle||(v==='summative'?'Unit assessment':'Exit ticket')):'', done:{...l.done,assess:v!=null}})}>{lab}</button>
            ))}
          </span>
          {l.assessment && <input className="ph-assname" value={l.assessTitle||''} placeholder="Name it — e.g. Exit ticket 4.NBT.5"
            onChange={e=>ed({assessTitle:e.target.value})}/>}
        </label>}
        {vis.res && <label className="ph-fld wide"><span>Resources <button type="button" className="ph-walllink" title="This lesson's resources — full-screen wall" onClick={e=>{e.preventDefault(); openWall&&openWall({kind:'lesson',uid:u.id,lid:l.id,fs:true});}}>lesson wall ↗</button><button type="button" className="ph-walllink" title="Every resource in this unit — full-screen wall" onClick={e=>{e.preventDefault(); openWall&&openWall({kind:'unit',id:u.id,fs:true});}}>unit wall ↗</button></span>
          <ResPills l={l} actions={actions}/>
        </label>}
        {vis.diff && <label className="ph-fld wide"><span>Differentiation</span>
          <textarea rows="2" value={l.diffText} placeholder="Support · on-level · extension notes…"
            onChange={e=>{ const v=e.target.value; ed({diffText:v, done:{...l.done,diff:!!v.trim()}}); }}></textarea>
        </label>}
        {vis.notes && <label className="ph-fld wide"><span>Notes</span>
          <textarea rows="2" value={l.notes||''} placeholder="Anything else about this lesson…"
            onChange={e=>ed({notes:e.target.value})}></textarea>
        </label>}
        {fwShown.map(fd=><div key={fd.k} className="ph-fld wide">
          <window.PHW.Field def={fd} value={(l.fwData||{})[fd.k]} unit={u} dated={dated}
            onChange={(v)=>actions.editLessonFw(l.id,{[fd.k]:v})}/>
        </div>)}
        {cfShown.map(d=><div key={d.id} className="ph-fld wide">
          <window.PHW.Field def={{k:d.id,label:d.label,type:d.type,help:'Custom field'}} value={(l.fwData||{})[d.id]}
            onChange={(v)=>actions.editLessonFw(l.id,{[d.id]:v})}/>
        </div>)}
        <div className="ph-fld wide ph-fwsec">
          <span className="fwbadge" title={fw.blurb}>{fw.short} format{l.fwId&&l.fwId!==unitFw?' — older than the unit':''}</span>
          {l.fwId&&l.fwId!==unitFw && <button type="button" className="fwconv" title="Convert this lesson to the unit's current format — anything extra goes to Carried over, nothing is deleted"
            onClick={()=>actions.convertLesson(l.id)}>Update to {FW.get(unitFw).short} {I.chevR}</button>}
          {hiddenChips.length>0 && <span className="ph-addrow">
            <span className="al">Add</span>
            {hiddenChips.map(([k,lab])=><button key={k} type="button" title={'Show the '+lab+' field'}
              onClick={()=>setReveal(r=>[...r,k])}>{lab}</button>)}
          </span>}
        </div>
        {l.carried&&l.carried.length>0 && <div className="ph-fld wide">
          <window.PHW.Carried items={l.carried}
            onRemove={(i)=>ed({carried:l.carried.filter((_,j)=>j!==i)})}/>
        </div>}
      </div>
      <div className="ph-ed-foot">
        <button className={'ph-taughtbtn'+(taught?' on':'')} title="Mark this lesson taught — completion is independent of editing"
          onClick={()=>actions.markTaught(l.id)}>{I.check} {taught?'Taught':'Mark taught'}</button>
        <span style={{display:'flex',gap:'14px',alignItems:'center'}}>
          <button className="ph-removebtn" style={{color:'var(--brand-600)'}} title="Copy this lesson right after itself" onClick={()=>actions.duplicate(l.id)}>Duplicate</button>
          <button className="ph-removebtn" onClick={()=>actions.remove(l.id)}>Remove lesson</button>
        </span>
      </div>
    </div>
    <UnitContext u={u} l={l} actions={actions}/>
  </div>;
}

function InsertZone({onClick}){
  return <div className="ph-insert" onClick={onClick} title="Insert a lesson here"><span>{I.plus} Insert</span></div>;
}

/* one editable lesson row + its inline editor — shared by the unit Strip and the Lessons lens */
function LessonRow({l,u,idx,dated,sel,setSel,expanded,setExpanded,actions,onFocus,openWall,dim,openDatePop,unitTag,onOpenUnit,draggable,onDragStart,onDragOver,onDrop}){
  const s=DS.SUBJECTS[u.sid];
  const open=expanded===l.id;
  const toggle=(id)=>setSel(x=>x.includes(id)?x.filter(y=>y!==id):[...x,id]);
  return <React.Fragment>
    <div id={'ph-l-'+l.id} className={'ph-urow'+(open?' open':'')+(sel.includes(l.id)?' sel':'')+(l.modified?' mod':'')+(dim?' dim':'')+' st-'+l.status}
         style={{'--sc':cv(s.c),'--st':cv(s.tint)}} draggable={draggable}
         onDragStart={onDragStart} onDragOver={onDragOver} onDrop={onDrop}
         onClick={()=>setExpanded(open?null:l.id)}>
      <input type="checkbox" checked={sel.includes(l.id)} onClick={e=>e.stopPropagation()} onChange={()=>toggle(l.id)}
        title="Select for bulk actions"/>
      <span className={'num '+l.status}>{l.status==='taught'?I.check:(l.status==='today'?'\u2022':idx+1)}</span>
      <span className="main">
        <span className="t">{l.title||'Untitled lesson'}{l.modified && <em className="ph-modpill">Modified</em>}
          {unitTag && <em className="ph-unittag" style={{color:cv(s.ink)}} title={'Open '+u.name}
            onClick={e=>{ e.stopPropagation(); onOpenUnit&&onOpenUnit(u.id); }}>{u.name}</em>}</span>
        <span className="o">{l.objective||'No objective yet'}</span>
      </span>
      <span className="chips">{l.tags.slice(0,2).map(c=><span key={c} className="std">{c}</span>)}{l.resN>0 && <span className="res" title={(l.resources||[]).map(r=>r.name).join('\n')}>{l.resN} res</span>}</span>
      {l.assessment ? <span className={'ph-asspill '+l.assessment} title={(l.assessTitle||l.assessment)+' — open the lesson to edit'}><AssessMark a={l.assessment} size={8}/><i>{l.assessTitle||l.assessment}</i></span> : <span className="ph-asspill none"></span>}
      <Dots l={l}/>
      <button className={'date btn'+(l.stack?' stacked':'')} title="Change when this lesson happens — move it, or stack two on one day"
        onClick={e=>{ e.stopPropagation(); const r=e.currentTarget.getBoundingClientRect();
          openDatePop({id:l.id, x:Math.max(10,Math.min(r.right-250, window.innerWidth-270)), y:r.bottom+8}); }}>
        {l.stack && <i className="stkic">⇉</i>}{dated?(l.status==='today'?'Today':l.date):('#'+(idx+1)+(l.dur?(' · '+l.dur+'m'):''))}
      </button>
      <button className="chev focusbtn" title="Plan in a focus window" onClick={e=>{e.stopPropagation(); onFocus(l.id);}}>{I.open}</button>
      <button className="chev" title={open?'Collapse':'Plan this lesson'} style={{transform:open?'rotate(180deg)':'none'}}
        onClick={e=>{e.stopPropagation();setExpanded(open?null:l.id);}}>{I.chev}</button>
    </div>
    {open && <Editor u={u} l={l} dated={dated} actions={actions} openWall={openWall}/>}
  </React.Fragment>;
}

function Strip({state,u,dated,query,expanded,setExpanded,sel,setSel,actions,onFocus,openWall}){
  const dragIdx=useRef(null);
  const [datePop,setDatePop]=useState(null);
  useEffect(()=>{
    const h=(e)=>{
      if(!expanded) return;
      if(e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const i=u.lessons.findIndex(x=>x.id===expanded);
      if(i<0) return;
      if(e.key==='Escape') setExpanded(null);
      else if(e.key==='ArrowDown'&&i<u.lessons.length-1){ e.preventDefault(); setExpanded(u.lessons[i+1].id); }
      else if(e.key==='ArrowUp'&&i>0){ e.preventDefault(); setExpanded(u.lessons[i-1].id); }
    };
    window.addEventListener('keydown',h); return ()=>window.removeEventListener('keydown',h);
  },[expanded,u,setExpanded]);
  return <div className="ph-rows">
    {u.lessons.map((l,i)=>(
      <React.Fragment key={l.id}>
        <InsertZone onClick={()=>actions.insert(u.id,i,setExpanded)}/>
        <LessonRow l={l} u={u} idx={i} dated={dated} sel={sel} setSel={setSel} expanded={expanded} setExpanded={setExpanded}
          actions={actions} onFocus={onFocus} openWall={openWall} dim={query&&!qMatchL(l,u,query)} openDatePop={setDatePop}
          draggable onDragStart={e=>{ dragIdx.current=i; try{e.dataTransfer.effectAllowed='move';}catch(x){} }}
          onDragOver={e=>e.preventDefault()}
          onDrop={e=>{ e.preventDefault(); if(dragIdx.current!=null&&dragIdx.current!==i) actions.reorder(u.id,dragIdx.current,i); dragIdx.current=null; }}/>
      </React.Fragment>
    ))}
    <InsertZone onClick={()=>actions.insert(u.id,u.lessons.length,setExpanded)}/>
    {datePop && (()=>{ const dl=u.lessons.find(x=>x.id===datePop.id); if(!dl) return null;
      const di=u.lessons.indexOf(dl);
      return <DatePop info={datePop} l={dl} dated={dated} canStack={di>0||u.startSlot>0} actions={actions} onClose={()=>setDatePop(null)}/>; })()}
  </div>;
}

/* Refine table */
const PASSES=[['none','No pass'],['objective','Objectives'],['std','Standards'],['dur','Durations'],['flow','Flow'],['assess','Assessments']];
function Table({u,dated,actions}){
  const [pass,setPass]=useState('none');
  const refs=useRef({});
  const reg=(k,i)=>(el)=>{ refs.current[k+':'+i]=el; };
  const advance=(k,i)=>(e)=>{ if(e.key!=='Enter') return; e.preventDefault(); const n=refs.current[k+':'+(i+1)]; if(n){ n.focus(); if(n.select) n.select(); } };
  const stdOpts=(u.stds&&u.stds.length)?u.stds.map(x=>x[0]):[...new Set(u.lessons.map(l=>l.std).filter(Boolean))];
  const fillDown=(k)=>{
    const first=u.lessons[0]; if(!first) return;
    const ids=u.lessons.map(l=>l.id);
    if(k==='dur') actions.bulk(ids,l=>{ l.dur=first.dur; });
    if(k==='flow') actions.bulk(ids,l=>{ l.flowName=first.flowName; l.done.flow=!!first.flowName; });
    if(k==='std') actions.bulk(ids,l=>{ l.std=first.std; l.tags=first.std?[first.std]:[]; });
  };
  const passDone=(k)=>u.lessons.filter(l=>k==='objective'?!!l.objective.trim():k==='std'?!!l.std:k==='flow'?!!l.flowName:k==='assess'?l.assessment!=null:true).length;
  const hl=(k)=>pass===k?' focus':'';
  return <div>
    <div className="ph-controls" style={{marginTop:0}}>
      <label className="ph-pick">Pass
        <select value={pass} onChange={e=>setPass(e.target.value)}>
          {PASSES.map(([k,lab])=><option key={k} value={k}>{lab}</option>)}
        </select>{I.chev}
      </label>
      {pass!=='none' && <span className="ph-passprog">{passDone(pass)}/{u.lessons.length} done — Enter jumps to the next lesson</span>}
    </div>
    <div className="ph-tablecard">
      <table className="ph-table">
        <thead><tr>
          <th className="c-num">#</th>
          <th className="c-title">Lesson</th>
          <th className={'c-obj'+hl('objective')}>Objective</th>
          <th className={'c-std'+hl('std')}>Standard <button className="fd" title="Fill first value down" onClick={()=>fillDown('std')}>{I.chev}</button></th>
          <th className={'c-flow'+hl('flow')}>Flow <button className="fd" title="Fill first value down" onClick={()=>fillDown('flow')}>{I.chev}</button></th>
          <th className={'c-dur'+hl('dur')}>Min <button className="fd" title="Fill first value down" onClick={()=>fillDown('dur')}>{I.chev}</button></th>
          <th className={'c-ass'+hl('assess')}>Assessment</th>
          <th className="c-res">Res</th>
          <th className="c-done">Planned</th>
        </tr></thead>
        <tbody>
          {u.lessons.map((l,i)=>(
            <tr key={l.id}>
              <td className="c-num"><span className={'num '+l.status}>{l.status==='taught'?I.check:(l.status==='today'?'\u2022':i+1)}</span></td>
              <td className="c-title">
                <input ref={reg('title',i)} value={l.title} onKeyDown={advance('title',i)}
                  onChange={e=>actions.edit(l.id,{title:e.target.value})} placeholder="Lesson title…"/>
                <span className="dt">{dated?(l.status==='today'?'Today':l.date):('#'+(i+1))}</span>
              </td>
              <td className={'c-obj'+hl('objective')}>
                <input ref={reg('objective',i)} value={l.objective} onKeyDown={advance('objective',i)}
                  onChange={e=>{ const v=e.target.value; actions.edit(l.id,{objective:v, done:{...l.done,obj:!!v.trim()}}); }} placeholder="I can…"/>
              </td>
              <td className={'c-std'+hl('std')}>
                <select ref={reg('std',i)} value={l.std} onKeyDown={advance('std',i)}
                  onChange={e=>{ const v=e.target.value; actions.edit(l.id,{std:v, tags:v?[v]:[]}); }}>
                  <option value="">—</option>{stdOpts.map(c=><option key={c}>{c}</option>)}
                </select>
              </td>
              <td className={'c-flow'+hl('flow')}>
                <select ref={reg('flow',i)} value={l.flowName||''} onKeyDown={advance('flow',i)}
                  onChange={e=>{ const v=e.target.value||null; actions.edit(l.id,{flowName:v, done:{...l.done,flow:!!v}}); }}>
                  <option value="">—</option><FlowOpts/>
                </select>
              </td>
              <td className={'c-dur'+hl('dur')}>
                <input ref={reg('dur',i)} type="number" min="5" step="5" value={l.dur||''} placeholder="—" onKeyDown={advance('dur',i)}
                  onChange={e=>{ const v=Number(e.target.value); actions.edit(l.id,{dur:v>0?v:null}); }}/>
              </td>
              <td className={'c-ass'+hl('assess')}>
                <select ref={reg('assess',i)} value={l.assessment||''} onKeyDown={advance('assess',i)}
                  onChange={e=>{ const v=e.target.value||null; actions.edit(l.id,{assessment:v, done:{...l.done,assess:v!=null}}); }}>
                  <option value="">—</option><option value="formative">Formative</option><option value="summative">Summative</option>
                </select>
              </td>
              <td className="c-res">
                <button className="resbtn" title="Add a resource or note" onClick={()=>window.openComposer&&window.openComposer({kind:'lesson',id:l.id,field:'resources',subject:u.sid,unitId:u.id,unitName:u.name,lessonTitle:l.title||'This lesson',lessonId:l.id})}>{l.resN>0?l.resN:I.plus}</button>
              </td>
              <td className="c-done"><Dots l={l}/></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>;
}

/* Assessments lens — every formative + summative in the unit */
function AssessLens({u,dated,actions,openLesson}){
  const s=DS.SUBJECTS[u.sid];
  const groups=[['formative','Formative checks'],['summative','Summative assessments']];
  const [av,setAv]=useState(TLMEM.assessView||'list');
  useEffect(()=>{ TLMEM.assessView=av; },[av]);
  return <div data-screen-label="Hub — Unit assessments">
    <div className="ph-assarc" title="The unit at a glance — diamonds are checks. Click any cell to open that lesson.">
      <span className="lbl">Arc</span>
      {u.lessons.map((l)=><button key={l.id} className={'a-cell st-'+l.status} style={{'--sc':cv(s.c)}} title={l.title}
        onClick={()=>openLesson(l.id)}>{l.assessment && <AssessMark a={l.assessment} size={9}/>}</button>)}
      <span className="grow"></span>
      <div className="ph-seg" role="group" aria-label="Assessments view">
        <button className={av==='list'?'on':''} title="Rows — rename checks in place" onClick={()=>setAv('list')}>List</button>
        <button className={av==='thumbs'?'on':''} title="Thumbnail cards" onClick={()=>setAv('thumbs')}>Thumbnails</button>
      </div>
    </div>
    {groups.map(([k,lab])=>{
      const rows=u.lessons.map((l,i)=>({l,i})).filter(x=>x.l.assessment===k);
      const urows=(u.assessments||[]).filter(a=>a.type===k);
      return <section key={k} className="ph-dayblock">
        <div className="ph-daybar"><span>{lab.toUpperCase()}</span><span className="n">{rows.length+urows.length}</span></div>
        {av==='thumbs' && (rows.length>0||urows.length>0) && <div className="ph-resgrid ph-assgrid">
          {urows.map(a=><button key={a.id} className="ph-rescard thumbed" style={{'--rc':k==='formative'?'var(--warn)':'var(--brand-500)'}}
            title={'On the '+DS.label('unit',false).toLowerCase()+' — not tied to a '+DS.label('lesson',false).toLowerCase()}>
            <span className="thumb"><span className="ti"><AssessMark a={k} size={20}/></span><span className="rtype" style={{background:k==='formative'?'var(--warn)':'var(--brand-500)'}}>{k}</span></span>
            <span className="bd"><span className="rt">{a.title||'Unnamed check'}</span><span className="rm">On the {DS.label('unit',false).toLowerCase()}</span></span>
          </button>)}
          {rows.map(({l,i})=><button key={l.id} className="ph-rescard thumbed" style={{'--rc':k==='formative'?'var(--warn)':'var(--brand-500)'}}
            title={'Open '+(l.title||'Untitled')} onClick={()=>openLesson(l.id)}>
            <span className="thumb"><span className="ti"><AssessMark a={k} size={20}/></span><span className="rtype" style={{background:k==='formative'?'var(--warn)':'var(--brand-500)'}}>{k}</span></span>
            <span className="bd"><span className="rt">{l.assessTitle||'Unnamed check'}</span><span className="rm">{l.title}{dated?(' · '+l.date):''}</span></span>
          </button>)}
        </div>}
        {av==='list' && urows.map(a=><div key={a.id} className="ph-assrow">
          <span className="num">{I.box}</span>
          <AssessMark a={k}/>
          <input className="ph-assinput" value={a.title} placeholder="Name this assessment…"
            onChange={e=>actions.editUnitAssess(u.id,a.id,{title:e.target.value})}/>
          <span className="lt static">On the {DS.label('unit',false).toLowerCase()} — no {DS.label('lesson',false).toLowerCase()}</span>
          <span className="dt"></span>
          <button className="rm" title="Remove this assessment from the unit"
            onClick={()=>actions.removeUnitAssess(u.id,a.id)}>{I.x}</button>
        </div>)}
        {av==='list' && rows.map(({l,i})=><div key={l.id} className="ph-assrow">
          <span className={'num '+l.status}>{l.status==='taught'?I.check:(l.status==='today'?'\u2022':i+1)}</span>
          <AssessMark a={l.assessment}/>
          <input className="ph-assinput" value={l.assessTitle||''} placeholder="Name this assessment…"
            onChange={e=>actions.edit(l.id,{assessTitle:e.target.value})}/>
          <button className="lt" title="Open this lesson" onClick={()=>openLesson(l.id)}>{l.title}</button>
          <span className="dt">{dated?l.date:('#'+(i+1))}</span>
          <button className="rm" title="Remove this assessment from the lesson"
            onClick={()=>actions.edit(l.id,{assessment:null,assessTitle:'',done:{...l.done,assess:false}})}>{I.x}</button>
        </div>)}
        {rows.length===0 && urows.length===0 && <div className="ph-empty">None yet — mark any lesson {k} from its editor.</div>}
        <div className="ph-assadd">
          {I.plus}
          <select value="" onChange={e=>{ const id=e.target.value; if(!id) return;
            if(id==='__unit'){ actions.addUnitAssess(u.id,k); return; }
            actions.edit(id,{assessment:k, assessTitle:k==='summative'?'Unit assessment':'Exit ticket', done:{assess:true}}); }}>
            <option value="">Add a {k==='summative'?'summative':'formative'} check…</option>
            <option value="__unit">On the {DS.label('unit',false).toLowerCase()} itself — no {DS.label('lesson',false).toLowerCase()}</option>
            {u.lessons.filter(l=>!l.assessment).map(l=><option key={l.id} value={l.id}>{l.title||'Untitled'}</option>)}
          </select>
        </div>
      </section>;
    })}
    <div className="ph-cap" style={{margin:'4px 6px'}}>Every check lives on a lesson — name it here, open the lesson to build it.</div>
  </div>;
}

/* Insights slide-in (pacing · standards · arc · needs-work · resources) */
function Insights({u,dated,actions,setExpanded,openWall,onClose}){
  const s=DS.SUBJECTS[u.sid];
  const pac=PW.pacing(u);
  const thin=u.lessons.filter(l=>l.status!=='taught'&&PW.comp(l)<=2);
  const res=window.PHMore.resourcesOf(u);
  return <React.Fragment>
    <div className="ph-panel-scrim" onClick={onClose}></div>
    <aside className="ph-panel" data-screen-label="Hub — Unit insights">
      <div className="ph-panel-h"><h3>{u.name} <KindTag level="unit"/> — insights</h3><button className="ph-panel-x" title="Close" onClick={onClose}>{I.x}</button></div>
      <div className="ph-card">
        <h4>{I.cal} Pacing</h4>
        <div className="ph-kv"><span>Lessons left</span><b>{pac.remaining} of {pac.total}</b></div>
        {dated ? <div className="ph-kv"><span>Ends</span><b>{pac.end}</b></div>
               : <div className="ph-kv"><span>Length</span><b>{pac.total} lessons</b></div>}
        {pac.slack!=null && (dated ? <div className="ph-kv"><span>Target end</span><b>{pac.target}</b></div>
                                   : <div className="ph-kv"><span>Budget</span><b>{pac.budget} lessons</b></div>)}
        {pac.slack!=null && <div className={'ph-pacebadge '+(pac.slack>=0?'ok':'over')}>
          {dated ? (pac.slack>=0?(pac.slack+' school days of slack'):(Math.abs(pac.slack)+' school days over — trim or move the target'))
                 : (pac.slack>=0?(pac.slack+' lessons of room in the budget'):(Math.abs(pac.slack)+' lessons over budget — trim or extend'))}
        </div>}
        {(()=>{ if(u.target==null) return null;
          const rem=pac.remaining, days=Math.max(0,u.target-PW.TODAY_SLOT+1);
          const v=rem>days?['Too ambitious — '+rem+' lessons left, '+days+' school days to target','over']
            :rem<Math.ceil(days*0.6)?['Room to breathe — '+rem+' lessons left across '+days+' days','ok']
            :['Just right — '+rem+' lessons across '+days+' days','ok'];
          return <div className={'ph-pacebadge '+v[1]}>{v[0]}</div>; })()}
      </div>
      {u.stds && u.stds.length>0 && <div className="ph-card">
        <h4>{I.target} Standards × lessons</h4>
        <div className="ph-matrix"><table>
          <thead><tr><th></th>{u.lessons.map((l,i)=><th key={l.id} title={l.title}>{i+1}</th>)}</tr></thead>
          <tbody>
            {u.stds.map(([code,desc])=>{
              const hits=u.lessons.filter(l=>l.tags.includes(code)).length;
              return <tr key={code}>
                <th title={desc}><span className="code">{code}</span>{hits===0?<em className="gap">gap</em>:<em className={'hitn h'+Math.min(hits,3)} title={'Targeted in '+hits+' lessons'}>{hits}×</em>}</th>
                {u.lessons.map(l=><td key={l.id}>
                  <button className={'cell'+(l.tags.includes(code)?' on':'')} title={(l.tags.includes(code)?'Untag ':'Tag ')+code+' — '+l.title}
                    onClick={()=>actions.toggleTag(l.id,code)}></button>
                </td>)}
              </tr>;
            })}
          </tbody>
        </table></div>
        <div className="ph-cap">Click a cell to tag a standard. An empty row is a coverage gap.</div>
      </div>}
      {(()=>{ const owed=(u.stds||[]).map(([code])=>({code,ass:u.lessons.filter(l=>l.assessment&&l.tags.includes(code)).length}));
        const tagKeys=['keyConcepts','atl','criteria','learnerProfile'];
        const chips=tagKeys.flatMap(k=>(((u.fwData||{})[k])||[]).map(x=>({k,x,n:u.lessons.filter(l=>(((l.fwData||{})[k])||[]).includes(x)).length})));
        if(!owed.length&&!chips.length) return null;
        return <div className="ph-card">
          <h4>{I.layers} Coverage — assessed & skills</h4>
          {owed.map(o=><div key={o.code} className="ph-kv"><span>{o.code} assessed</span><b className={o.ass?'':'owe'}>{o.ass?(o.ass+'×'):'owed'}</b></div>)}
          {chips.length>0 && <div className="cov-chips">{chips.map((c,i)=><span key={i} className={'cch'+(c.n?' on':'')} title={c.n+' lessons tag this'}>{c.x}<i>{c.n}</i></span>)}</div>}
          <div className="ph-cap">“Owed” = a standard with no assessment lesson yet. Chips count lessons tagging each concept or skill.</div>
        </div>; })()}
      <div className="ph-card">
        <h4>{I.layers} Assessment arc</h4>
        <div className="ph-arc">
          {u.lessons.map(l=><span key={l.id} className={'a-cell st-'+l.status} title={l.title} style={{'--sc':cv(s.c)}}>
            {l.assessment && <AssessMark a={l.assessment} size={9}/>}
          </span>)}
        </div>
        <div className="ph-cap">Honey = formative check · blue = summative.</div>
      </div>
      {thin.length>0 && <div className="ph-card">
        <h4>{I.warn} Needs work</h4>
        {thin.map(l=><button key={l.id} className="ph-thinrow" onClick={()=>{ setExpanded(l.id); onClose(); }}>
          <span className="t">{l.title||'Untitled lesson'}</span><span className="c">{PW.comp(l)}/5</span>{I.chevR}
        </button>)}
        <div className="ph-cap">Upcoming lessons with 2 or fewer sections planned.</div>
      </div>}
      {res.length>0 && <div className="ph-card">
        <h4>{I.box} Resources in this unit <button className="ph-walllink" title="See them all on one wall" onClick={()=>{ onClose(); openWall({kind:'unit',id:u.id}); }}>wall ↗</button></h4>
        {res.map(r=><button key={r.id} className="ph-rchiprow" title={r.l?('From '+r.l.title+' — open the lesson'):('On the '+DS.label('unit',false).toLowerCase())} onClick={()=>{ if(r.l){ setExpanded(r.l.id); onClose(); } }}>
          <span className="ty" style={{background:cv(r.c)}}>{r.type}</span>
          <span className="t">{r.name}</span>
          {I.chevR}
        </button>)}
        <div className="ph-cap">Attached lesson by lesson — open one to manage its files.</div>
      </div>}
    </aside>
  </React.Fragment>;
}

function BulkBar({sel,setSel,dated,actions}){
  if(sel.length<2) return null;
  return <div className="ph-bulk" data-screen-label="Hub — Bulk actions">
    <span className="n">{sel.length} selected</span>
    <div className="acts">
      <button onClick={()=>actions.bulkShift(sel,1)} title="Push later — everything after ripples">{dated?'+1 day':'+1 spot'}</button>
      <button onClick={()=>actions.bulkShift(sel,-1)} title="Pull earlier">{dated?'−1 day':'−1 spot'}</button>
      <label className="pk">Flow
        <select defaultValue="" onChange={e=>{ if(e.target.value){ actions.bulkFlow(sel,e.target.value); e.target.value=''; } }}>
          <option value="" disabled>Apply…</option>
          <FlowOpts/>
        </select>
      </label>
      <button onClick={()=>actions.bulkRes(sel)} title="Attach one resource to each">+ Resource</button>
      <button onClick={()=>actions.bulkDuplicate(sel)} title="Copy each selected lesson right after itself">Duplicate</button>
      <button onClick={()=>actions.bulkTaught(sel)} title="Mark all taught">Mark taught</button>
      <button className="danger" onClick={()=>actions.bulkRemove(sel)}>Remove</button>
    </div>
    <button className="clear" title="Clear selection" onClick={()=>setSel([])}>{I.x}</button>
  </div>;
}

function UnitView({state,u,dated,query,view,setView,expanded,setExpanded,sel,setSel,insights,setInsights,actions,onBack,backTo,onFocus,openWall}){
  const s=DS.SUBJECTS[u.sid];
  const pac=PW.pacing(u);
  const sibs=state.units.filter(x=>x.sid===u.sid);
  const si=sibs.indexOf(u);
  const taught=u.lessons.filter(l=>l.status==='taught').length;
  const jumpTo=(id)=>{ setView('strip'); setExpanded(id); setTimeout(()=>{ const el=document.getElementById('ph-l-'+id);
    if(el) document.scrollingElement.scrollTop += el.getBoundingClientRect().top-170; },140); };
  return <div data-screen-label="Hub — Unit view">
    <div className="ph-unithead">
      <button className="ph-backunit" title={'Back to '+(backTo||'the timeline')+' — everything as you left it'} onClick={onBack}>{I.back} {backTo||('All '+DS.label('unit',true).toLowerCase())}</button>
      <div className="ph-unittitle"><span className="d" style={{background:cv(s.c)}}></span><h2>{u.name}</h2><KindTag level="unit"/><span className="sub">{s.full}</span><KindTag level="subject"/></div>
      <span className="grow"></span>
      {(window.__phSettings||{}).uiLevel==='advanced'
        ? <div className="ph-seg">
        {[['strip','Plan'],['table','Refine'],['assess','Assessments'],['design','Design']].map(([k,lab])=>(
          <button key={k} className={view===k?'on':''} title={k==='strip'?'The unit as an ordered strip — expand any lesson to plan it':k==='table'?'Every lesson as a row — sweep one field at a time':k==='assess'?'All formative and summative checks in this unit':'Framework, goals, reflection — the unit designer'} onClick={()=>setView(k)}>{lab}</button>
        ))}
      </div>
        : <div className="ph-seg">
        <button className={view==='strip'?'on':''} title="The unit as an ordered strip — expand any lesson to plan it" onClick={()=>setView('strip')}>Plan</button>
        <select className="ph-moreviews" value={view==='strip'?'':view} title="Refine, Assessments and the unit Designer" onChange={e=>{ if(e.target.value) setView(e.target.value); }}>
          <option value="">More views…</option>
          <option value="table">Refine</option><option value="assess">Assessments</option><option value="design">Design</option>
        </select>
      </div>}
      <button className={'ph-insightsbtn'+(insights?' on':'')} title="Pacing, coverage, assessment arc, resources & wall" onClick={()=>setInsights(!insights)}>{I.insight} Insights</button>
    </div>
    <div className="ph-unitline">
      <span>{taught}/{pac.total} taught</span><span>·</span>
      {dated ? <span>ends {pac.end}</span> : <span>{pac.total} lessons</span>}
      {pac.slack!=null && <span className={'ph-slack '+(pac.slack>=0?'ok':'over')}>
        {dated ? (pac.slack>=0?(pac.slack+' days ahead of target'):(Math.abs(pac.slack)+' days past target'))
               : (pac.slack>=0?(pac.slack+' lessons of room'):(Math.abs(pac.slack)+' lessons over budget'))}
      </span>}
      <span className="ph-heat" title="One cell per lesson — red = empty, honey = started, green = ready · white bar = taught. Click a cell to open that lesson.">
        <span className="hlbl">Plan</span>
        {u.lessons.map(l=><button key={l.id} className={'hcell '+compClass(l)+(l.status==='taught'?' taught':'')}
          title={l.title+' · '+PW.comp(l)+'/5 planned'+(l.status==='taught'?' · taught':'')}
          onClick={()=>jumpTo(l.id)}></button>)}
      </span>
    </div>
    {view==='strip'
      ? <Strip state={state} u={u} dated={dated} query={query} expanded={expanded} setExpanded={setExpanded}
               sel={sel} setSel={setSel} actions={actions} onFocus={onFocus} openWall={openWall}/>
      : view==='table'
      ? <Table u={u} dated={dated} actions={actions}/>
      : view==='design'
      ? <window.PHDesign state={state} u={u} dated={dated} settings={window.__phSettings||{}} actions={actions}/>
      : <AssessLens u={u} dated={dated} actions={actions} openLesson={jumpTo}/>}
    {insights && <Insights u={u} dated={dated} actions={actions} setExpanded={jumpTo} openWall={openWall} onClose={()=>setInsights(false)}/>}
    <BulkBar sel={sel} setSel={setSel} dated={dated} actions={actions}/>
  </div>;
}

window.PHUnits={ Timeline, UnitView, Editor, LessonRow, InsertZone, DatePop, Table };
})();
