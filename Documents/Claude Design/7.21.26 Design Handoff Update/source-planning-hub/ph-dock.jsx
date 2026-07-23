/* Planning Hub — Unit Dock: click a unit band or a subject lane label and every
   unit in that subject lists below the timeline. Rows expand into an inline
   unit editor (settings, schedule, standards bank, stats). Exposes window.PHDock. */
(function(){
const {useState,useRef,useEffect}=React;
const {cv,AssessMark}=window.PWC;
const {I,KindTag}=window.PHC;
const PW=window.PW, DS=window.DS, FW=window.FW;

const isoToSlot=(iso)=>{ const i=PW.SLOTS.findIndex(d=>d.iso>=iso); return i<0?PW.SLOTS.length-1:i; };
const slotIso=(sl)=>PW.SLOTS[PW.clampSlot(Math.max(0,sl))].iso;
const fCount=(u)=>u.lessons.filter(l=>l.assessment==='formative').length+((u.assessments||[]).filter(a=>a.type==='formative').length);
const sCount=(u)=>u.lessons.filter(l=>l.assessment==='summative').length+((u.assessments||[]).filter(a=>a.type==='summative').length);
const taughtN=(u)=>u.lessons.filter(l=>l.status==='taught').length;
const minutesOf=(u)=>({plan:u.lessons.reduce((a,l)=>a+(l.dur||0),0), done:u.lessons.filter(l=>l.status==='taught').reduce((a,l)=>a+(l.dur||0),0)});
const resOf=(u)=>u.lessons.reduce((a,l)=>a+(l.resN||0),0)+((u.resources||[]).length);
const missedN=(u)=>u.lessons.filter(l=>window.PHMore.isMissed(l)).length;
const bankOf=(u)=>((u.stds&&u.stds.length)?u.stds:[...new Set(u.lessons.flatMap(l=>l.tags))].map(c=>[c,'']));
const stdRows=(u)=>bankOf(u).map(([code,desc])=>({code,desc,hits:u.lessons.filter(l=>l.tags.includes(code)).length}));
const statusOf=(u)=>{
  if(u.lessons.length && taughtN(u)>=u.lessons.length) return 'done';
  if(u.endSlot<PW.TODAY_SLOT) return 'done';
  return (u.startSlot<=PW.TODAY_SLOT)?'now':'upcoming';
};

function Ins({onClick}){
  return <div className="ph-dins" title="Insert a new unit here" onClick={onClick}><span>{I.plus} unit</span></div>;
}

/* ── expanded inline editor ── */
const guessType=(n)=>{ n=(n||'').toLowerCase();
  if(/slide|deck|ppt|present/.test(n)) return 'Slides';
  if(/video|youtube|film|clip/.test(n)) return 'Video';
  if(/worksheet|practice|packet|page/.test(n)) return 'Worksheet';
  if(/image|chart|poster|photo|anchor/.test(n)) return 'Image';
  if(/doc|rubric|plan|letter|ticket/.test(n)) return 'Doc';
  return 'Link'; };

/* scope-level resource pills + quick-add — shared by the unit editor and the subject strip */
function ScopeResPills({resources,placeholder,onAdd,onRemove,compose}){
  const [draft,setDraft]=useState('');
  return <div className="ph-respills">
    {(resources||[]).map(r=><span key={r.id} className="ph-respill" style={{'--rc':cv(DS.RESTYPES[r.type]||'--subj-11')}}>
      <i>{r.type}</i><span className="nm">{r.name}</span>
      <button title="Remove this resource" onClick={()=>onRemove(r.id)}>{I.x}</button>
    </span>)}
    {compose
      ? <button className="ph-resadd" title="Add a resource or note" onClick={compose}>+ Add resource or note</button>
      : <input className="ph-resin" value={draft}
          placeholder={(resources||[]).length?'Add another… (Enter)':placeholder}
          onChange={e=>setDraft(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter'&&draft.trim()){ onAdd(draft.trim(),guessType(draft)); setDraft(''); } }}/>}
  </div>;
}
/* scope-level assessments — checks that live on the unit or subject itself, no lesson */
function ScopeAssess({list,onAdd,onEdit,onRemove}){
  return <div className="ph-scopeass">
    {(list||[]).map(a=><div key={a.id} className="sa-row">
      <AssessMark a={a.type} size={9}/>
      <input value={a.title} placeholder="Name it…" onChange={e=>onEdit(a.id,{title:e.target.value})}/>
      <button title="Remove" onClick={()=>onRemove(a.id)}>{I.x}</button>
    </div>)}
    <div className="sa-add">
      <button title="Add a formative check at this level" onClick={()=>onAdd('formative')}>{I.plus} Formative</button>
      <button title="Add a summative assessment at this level" onClick={()=>onAdd('summative')}>{I.plus} Summative</button>
    </div>
  </div>;
}

/* unit-level resource pills + quick-add — these live on the unit itself and join the wall */
function UnitResPills({u,actions}){
  return <ScopeResPills resources={u.resources} placeholder="Add a unit resource — e.g. Novel class set (Enter)"
    onAdd={(n2,t)=>actions.addUnitRes(u.id,n2,t)} onRemove={(rid)=>actions.removeUnitRes(u.id,rid)}
    compose={window.openComposer?()=>window.openComposer({kind:'unit',id:u.id,field:'resources',subject:u.sid,unitId:u.id,unitName:u.name}):null}/>;
}

function UnitEd({state,u,dated,actions,onOpenUnit,openWall,onOpenInLessons}){
  const s=DS.SUBJECTS[u.sid];
  const [vocabDraft,setVocabDraft]=useState('');
  const [stdDraft,setStdDraft]=useState('');
  const ed=(patch)=>actions.editUnit(u.id,patch);
  const pac=PW.pacing(u);
  const mins=minutesOf(u);
  const rows=stdRows(u);
  const sibs=state.units.filter(x=>x.sid===u.sid&&!x.archived);
  const si=sibs.indexOf(u);
  const budget=u.target!=null?(u.target-u.startSlot+1):null;
  const otherSids=[...new Set(state.units.map(x=>x.sid))].filter(x=>x!==u.sid);
  return <div className="ph-dock-ed" style={{'--sc':cv(s.c)}} onClick={e=>e.stopPropagation()}>
    <div className="ded-col">
      <label className="ph-fld"><span>Unit name</span>
        <input value={u.name} onChange={e=>ed({name:e.target.value})}/>
      </label>
      <div className="ded-card">
        <div className="dch">{I.cal} Schedule</div>
        {dated
          ? <label className="ph-fld"><span>Starts</span>
              <input type="date" value={slotIso(u.startSlot)} min={PW.SLOTS[0].iso} max={PW.SLOTS[PW.SLOTS.length-1].iso}
                onChange={e=>{ if(e.target.value) actions.setUnitStart(u.id,isoToSlot(e.target.value)); }}/>
            </label>
          : <div className="ph-fld"><span>Position</span><div className="dkv-b">{(u.startSlot+1)+' – '+(u.endSlot+1)}</div></div>}
        <div className="ded-btnrow">
          <button title="Start one school day earlier" disabled={(u.lessons[0]&&(u.lessons[0].pad||0))<=0}
            onClick={()=>actions.padUnit(u.id,Math.max(0,(u.lessons[0].pad||0)-1))}>− day</button>
          <button title="Start one school day later — later units bump"
            onClick={()=>actions.padUnit(u.id,(u.lessons[0].pad||0)+1)}>+ day</button>
          <button title="Swap with the previous unit" disabled={si<=0} onClick={()=>actions.moveUnit(u.id,-1)}>{I.back}</button>
          <button title="Swap with the next unit" disabled={si>=sibs.length-1} onClick={()=>actions.moveUnit(u.id,1)} style={{transform:'scaleX(-1)'}}>{I.back}</button>
          <button className="wide" title="Push the NEXT unit a school week later — testing week, review buffer" disabled={si>=sibs.length-1}
            onClick={()=>actions.insertGapWeek(u.id)}>+ Gap week after</button>
        </div>
        {dated
          ? <label className="ph-fld"><span>Target end {u.target!=null && <button className="dclear" onClick={()=>ed({target:null})}>clear</button>}</span>
              <input type="date" value={u.target!=null?slotIso(u.target):''} min={PW.SLOTS[0].iso} max={PW.SLOTS[PW.SLOTS.length-1].iso}
                onChange={e=>{ if(e.target.value) ed({target:isoToSlot(e.target.value)}); }}/>
            </label>
          : <label className="ph-fld"><span>Lesson budget {u.target!=null && <button className="dclear" onClick={()=>ed({target:null})}>clear</button>}</span>
              <input type="number" min="1" value={budget!=null?budget:''} placeholder="—"
                onChange={e=>{ const v=Number(e.target.value); if(v>0) ed({target:u.startSlot+v-1}); }}/>
            </label>}
        <div className="dcap">Moves ripple — every later lesson and unit re-flows automatically.</div>
      </div>
      <div className="ded-card">
        <div className="dch">{I.logo} Notes</div>
        <textarea className="ded-notes" rows="3" value={u.notes||''} placeholder={'Anything about this '+DS.label('unit',false).toLowerCase()+' as a whole — not tied to a '+DS.label('lesson',false).toLowerCase()+'…'}
          onChange={e=>ed({notes:e.target.value})}></textarea>
      </div>
    </div>

    <div className="ded-col">
      <div className="ded-card">
        <div className="dch">{I.seq} Defaults for new lessons</div>
        <div className="ded-2col">
          <label className="ph-fld"><span>Duration <em className="opt">optional</em></span>
            <input type="number" min="5" step="5" value={u.defaultDur||''} placeholder="—" onChange={e=>{ const v=Number(e.target.value); ed({defaultDur:v>0?v:null}); }}/>
          </label>
          <label className="ph-fld"><span>Flow template</span>
            <select value={u.defaultFlow||''} onChange={e=>ed({defaultFlow:e.target.value||null})}>
              <option value="">None</option>
              {PW.FLOW_GROUPS.map(g=><optgroup key={g.label} label={g.label}>{g.flows.map(f=><option key={f}>{f}</option>)}</optgroup>)}
            </select>
          </label>
        </div>
      </div>
      <div className="ded-card">
        <div className="dch">{I.insight} Stats</div>
        <div className="dkv"><span>Minutes</span><b>{mins.done} / {mins.plan} taught</b></div>
        <div className="dkv"><span>Pace</span><b>{pac.slack==null?'no target':(pac.slack>=0?(pac.slack+(dated?' days ahead':' lessons of room')):(Math.abs(pac.slack)+(dated?' days behind':' over budget')))}</b></div>
        <div className="dkv"><span>Projected finish</span><b>{dated?pac.end:(pac.total+' lessons')}</b></div>
        <div className="dkv"><span>Resources</span><b>{resOf(u)}</b></div>
        <div className="dkv"><span>vs last year</span><b>+3 days ahead <i className="dsample">sample</i></b></div>
      </div>
      <div className="ded-card ded-hint">
        {I.spark} <span>Big idea, goals, vocabulary, notes & the standards bank live in <b>Design</b> — one home, no drift.</span>
      </div>
    </div>

    <div className="ded-col">
      <div className="ded-card">
        <div className="dch">{I.box} {DS.label('unit',false)} resources</div>
        <UnitResPills u={u} actions={actions}/>
        <div className="dcap">Live on the {DS.label('unit',false).toLowerCase()} itself — they join the wall next to every {DS.label('lesson',false).toLowerCase()} resource.</div>
      </div>
      <div className="ded-card">
        <div className="dch">{I.target} Assessments <span className="dcount">{fCount(u)} formative · {sCount(u)} summative</span></div>
        <ScopeAssess list={u.assessments} onAdd={(k)=>actions.addUnitAssess(u.id,k)}
          onEdit={(aid,p)=>actions.editUnitAssess(u.id,aid,p)} onRemove={(aid)=>actions.removeUnitAssess(u.id,aid)}/>
        <div className="dcap" style={{marginBottom:'6px'}}>These live on the {DS.label('unit',false).toLowerCase()} itself. Or attach a check to a {DS.label('lesson',false).toLowerCase()}:</div>
        {[['formative','Formative check'],['summative','Summative assessment']].map(([k,lab])=>
          <label key={k} className="ph-fld"><span>{lab}</span>
            <select value="" onChange={e=>{ const id=e.target.value; if(!id) return;
              actions.edit(id,{assessment:k, assessTitle:k==='summative'?'Unit assessment':'Exit ticket', done:{assess:true}}); }}>
              <option value="">Add to a {DS.label('lesson',false).toLowerCase()}…</option>
              {u.lessons.filter(l=>!l.assessment).map(l=><option key={l.id} value={l.id}>{l.title||'Untitled'}</option>)}
            </select>
          </label>)}
        <div className="dcap">Every check lives on a {DS.label('lesson',false).toLowerCase()} — see them all in <b>Assessments</b>.</div>
      </div>
      <div className="ded-danger">
        <button onClick={()=>actions.duplicateUnit(u.id)} title="Copy this whole unit right after itself">Duplicate</button>
        <button onClick={()=>actions.archiveUnit(u.id)} title="Hide from every view — kept for next year">Archive</button>
        <button className="del" onClick={()=>actions.deleteUnit(u.id)} title="Delete this unit and its lessons">Delete</button>
        <label className="dmove" title="Move this unit to another subject">Move to
          <select value="" onChange={e=>{ if(e.target.value) actions.moveUnitToSubject(u.id,e.target.value); }}>
            <option value="">…</option>
            {otherSids.map(x=><option key={x} value={x}>{DS.SUBJECTS[x].full}</option>)}
          </select>
        </label>
      </div>
      <div className="ded-foot">
        <span className="dfl">Open:</span>
        <button className="lnk" onClick={()=>onOpenUnit(u.id,'strip')} title="The unit as an ordered strip — plan lesson by lesson">Plan</button>
        <button className="lnk" onClick={()=>onOpenUnit(u.id,'table')} title="Every lesson as a row — sweep one field at a time">Refine</button>
        <button className="lnk" onClick={()=>onOpenUnit(u.id,'assess')} title="All formative and summative checks in this unit">Assessments</button>
        <button className="lnk" onClick={()=>onOpenUnit(u.id,'design')} title="Framework, goals, reflection — the full unit designer">{I.spark} Design</button>
        <span className="grow"></span>
        <button className="lnk" onClick={()=>onOpenInLessons(u.id)} title="See this unit's lessons in the Lessons view">In Lessons {I.chevR}</button>
        <button className="lnk" onClick={()=>openWall({kind:'unit',id:u.id})} title="Every resource in this unit">{I.box} Wall</button>
        <button className="pri" onClick={()=>onOpenUnit(u.id)} title="Full screen — Plan · Refine · Assessments · Design">Open {I.chevR}</button>
      </div>
    </div>
  </div>;
}

/* ── one unit row ── */
function Row({state,u,i,open,setOpen,dated,actions,onOpenUnit,openWall,onOpenInLessons,dragIdx}){
  const s=DS.SUBJECTS[u.sid];
  const st=statusOf(u);
  const t=taughtN(u), tot=u.lessons.length;
  const f=fCount(u), sm=sCount(u);
  const miss=missedN(u);
  const pac=PW.pacing(u);
  const rows=stdRows(u);
  const gaps=rows.filter(r=>r.hits===0).length;
  const slim=st==='done'&&!open;
  return <React.Fragment>
    <div className={'ph-drow'+(open?' open':'')+(slim?' slim':'')} style={{'--sc':cv(s.c),'--st':cv(s.tint)}} data-uid={u.id}
      draggable onDragStart={e=>{ dragIdx.current=i; try{e.dataTransfer.effectAllowed='move';}catch(x){} }}
      onDragOver={e=>e.preventDefault()}
      onDrop={e=>{ e.preventDefault(); if(dragIdx.current!=null&&dragIdx.current!==i) actions.reorderUnits(u.sid,dragIdx.current,i); dragIdx.current=null; }}
      onClick={()=>setOpen(open?null:u.id)}
      title={u.name+' — click to edit settings · drag to reorder'}>
      <span className="grab">{I.grip}</span>
      <span className="d" style={{background:cv(s.c)}}></span>
      <b className="nm">{u.name}</b>
      <span className={'ph-status '+(st==='done'?'done':st==='now'?'now':'plan')}>{st==='done'?'Done':st==='now'?'Now':'Upcoming'}</span>
      <span className="fwtag" title={'Designed in '+FW.get(FW.effective(u,window.__phSettings||{})).name}>{FW.get(FW.effective(u,window.__phSettings||{})).short}</span>
      <span className="rng">{dated?(PW.fmtSlot(u.startSlot)+' – '+PW.fmtSlot(u.endSlot)):('#'+(u.startSlot+1)+' – '+(u.endSlot+1))}</span>
      <span className="prog" title={t+'/'+tot+' taught'}><i style={{width:(tot?Math.round(t/tot*100):0)+'%',background:cv(s.c)}}></i></span>
      <span className="tt">{t}/{tot}</span>
      <span className="fs" title={f+' formative · '+sm+' summative'}>
        <AssessMark a="formative" size={9}/>{f} <AssessMark a="summative" size={9}/>{sm}
      </span>
      <span className="stds">
        {rows.slice(0,3).map(r=><i key={r.code} className={r.hits===0?'gap':''} title={r.desc||r.code}>{r.code}</i>)}
        {rows.length>3 && <i className="more">+{rows.length-3}</i>}
        {gaps>0 && <i className="gapn" title={gaps+' standards not yet tagged in any lesson'}>{gaps} gap{gaps>1?'s':''}</i>}
      </span>
      {pac.slack!=null && <span className={'ph-slack '+(pac.slack>=0?'ok':'over')}>{pac.slack>=0?(pac.slack+(dated?'d ahead':' room')):(Math.abs(pac.slack)+(dated?'d behind':' over'))}</span>}
      {miss>0 && <span className="missn">{miss} missed</span>}
      <span className="grow"></span>
      <span className="acts" onClick={e=>e.stopPropagation()}>
        <button title="Resource wall" onClick={()=>openWall({kind:'unit',id:u.id})}>{I.box}</button>
        <button title="Duplicate unit" onClick={()=>actions.duplicateUnit(u.id)}>{I.copy||I.plus}</button>
        <button className="go" title="Open — Plan · Refine · Assessments" onClick={()=>onOpenUnit(u.id)}>Open</button>
      </span>
      <button className="chev" title={open?'Collapse':'Unit settings'} style={{transform:open?'rotate(180deg)':'none'}}
        onClick={e=>{e.stopPropagation(); setOpen(open?null:u.id);}}>{I.chev}</button>
    </div>
    {open && <UnitEd state={state} u={u} dated={dated} actions={actions}
      onOpenUnit={onOpenUnit} openWall={openWall} onOpenInLessons={onOpenInLessons}/>}
  </React.Fragment>;
}

/* ── the dock ── */
function Dock({state,selKey,dated,actions,onOpenUnit,openWall,onOpenInLessons,onClose}){
  let sid,uid=null;
  if(selKey.startsWith('s:')) sid=selKey.slice(2);
  else { const u0=state.units.find(x=>x.id===selKey); if(!u0) return null; sid=u0.sid; uid=u0.id; }
  const s=DS.SUBJECTS[sid];
  const [open,setOpen]=useState(uid);
  const [dockView,setDockView]=useState(()=>(window.__phTLMem||{}).dockView||'rows');
  const setDV=(v)=>{ setDockView(v); (window.__phTLMem=window.__phTLMem||{}).dockView=v; };
  const dragIdx=useRef(null);
  const rootRef=useRef(null);
  /* opened on a specific unit — bring its row to the top of the popup */
  useEffect(()=>{ const t=setTimeout(()=>{ if(!uid||!rootRef.current) return;
    const el=rootRef.current.querySelector('[data-uid="'+uid+'"]');
    const sc=rootRef.current.closest('.ph-dockpop');
    if(el&&sc){ sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 62; }
  },90); return ()=>clearTimeout(t); },[]);
  const units=state.units.filter(u=>u.sid===sid&&!u.archived);
  const archived=state.units.filter(u=>u.sid===sid&&u.archived);
  if(!units.length&&!archived.length) return null;

  const curIdx=Math.max(0,units.findIndex(u=>u.endSlot>=PW.TODAY_SLOT));
  const meta=(state.subjects||{})[sid]||{notes:'',resources:[],assessments:[]};
  const t=units.reduce((a,u)=>a+taughtN(u),0), tot=units.reduce((a,u)=>a+u.lessons.length,0);
  const f=units.reduce((a,u)=>a+fCount(u),0)+((meta.assessments||[]).filter(a=>a.type==='formative').length),
        sm=units.reduce((a,u)=>a+sCount(u),0)+((meta.assessments||[]).filter(a=>a.type==='summative').length);
  const banks=units.map(stdRows);
  const covered=banks.reduce((a,r)=>a+r.filter(x=>x.hits>0).length,0);
  const bankTotal=banks.reduce((a,r)=>a+r.length,0);
  const gaps=bankTotal-covered;
  const mins=units.reduce((a,u)=>{ const m=minutesOf(u); return {plan:a.plan+m.plan,done:a.done+m.done}; },{plan:0,done:0});
  const res=units.reduce((a,u)=>a+resOf(u),0)+((meta.resources||[]).length);
  const cur=units[curIdx];
  const pac=cur?PW.pacing(cur):null;
  const lastEnd=units.length?units[units.length-1].endSlot:0;

  return <div className="ph-dock" ref={rootRef} data-screen-label="Hub — Unit dock">
    <div className="ph-dock-strip">
      <span className="d" style={{background:cv(s.c)}}></span>
      <b>{s.full}</b><KindTag level="subject"/>
      <span className="dstat"><b>{DS.label('unit',false)} {curIdx+1}</b> of {units.length}</span>
      <span className="dstat"><b>{t}/{tot}</b> taught</span>
      <span className="dstat" title={f+' formative · '+sm+' summative checks across the subject'}><AssessMark a="formative" size={9}/><b>{f}</b> <AssessMark a="summative" size={9}/><b>{sm}</b></span>
      <span className="dstat" title="Standards tagged in at least one lesson / total in the banks"><b>{covered}/{bankTotal}</b> standards{gaps>0 && <em className="gapn"> · {gaps} gaps</em>}</span>
      <span className="dstat"><b>{mins.done}</b>/{mins.plan} min</span>
      {pac&&pac.slack!=null && <span className={'ph-slack '+(pac.slack>=0?'ok':'over')}>{pac.slack>=0?(pac.slack+(dated?' days ahead':' lessons of room')):(Math.abs(pac.slack)+(dated?' days behind':' over budget'))}</span>}
      <span className="dstat">finish <b>{dated?PW.fmtSlot(lastEnd):('#'+(lastEnd+1))}</b></span>
      <span className="dstat"><b>{res}</b> resources</span>
      <span className="dstat" title="Sample data until year-over-year history exists"><b>+3d</b> vs last year <i className="dsample">sample</i></span>
      <span className="grow"></span>
      <span className="ph-uiseg" title="Simple shows the essentials — Advanced shows every field">{[['simple','Simple'],['advanced','Advanced']].map(([k,lab])=><button key={k} className={((window.__phSettings||{}).uiLevel||'simple')===k?'on':''} onClick={()=>window.__phSetUiLevel&&window.__phSetUiLevel(k)}>{lab}</button>)}</span>
      <span className="ph-uiseg" title="Rich rows, or a compact table of every unit">{[['rows','Rows'],['list','List']].map(([k,lab])=><button key={k} className={dockView===k?'on':''} onClick={()=>setDV(k)}>{lab}</button>)}</span>
      <button className="dwall" title={'Every resource across '+s.full+' — on one wall'} onClick={()=>openWall({kind:'subject',sid})}>{I.box} Wall</button>
      <button className="x" title="Close" onClick={onClose}>{I.x}</button>
    </div>
    <div className="ph-dock-rows">
      {dockView==='list'
        ? <table className="ph-table ph-docktable">
            <thead><tr><th>{DS.label('unit',false)}</th><th>{dated?'Dates':'Position'}</th><th>Taught</th><th>Status</th><th>Checks</th><th>Res</th><th></th></tr></thead>
            <tbody>{units.map((u,i)=>{ const st2=statusOf(u),tg=taughtN(u),tot=u.lessons.length;
              return <React.Fragment key={u.id}>
                <tr className={open===u.id?'open':''} data-uid={u.id} onClick={()=>setOpen(open===u.id?null:u.id)} title={u.name+' — click to edit'}>
                  <td className="c-nm"><span className="d" style={{background:cv(s.c)}}></span>{u.name}</td>
                  <td>{dated?(PW.fmtSlot(u.startSlot)+' – '+PW.fmtSlot(u.endSlot)):('#'+(u.startSlot+1)+'–'+(u.endSlot+1))}</td>
                  <td>{tg}/{tot}</td>
                  <td><span className={'ph-status '+(st2==='done'?'done':st2==='now'?'now':'plan')}>{st2==='done'?'Done':st2==='now'?'Now':'Upcoming'}</span></td>
                  <td className="c-fs"><AssessMark a="formative" size={9}/>{fCount(u)} <AssessMark a="summative" size={9}/>{sCount(u)}</td>
                  <td>{resOf(u)}</td>
                  <td className="c-go"><button className="go" onClick={e=>{e.stopPropagation();onOpenUnit(u.id);}}>Open</button></td>
                </tr>
                {open===u.id && <tr className="ded-tr"><td colSpan="7"><UnitEd state={state} u={u} dated={dated} actions={actions} onOpenUnit={onOpenUnit} openWall={openWall} onOpenInLessons={onOpenInLessons}/></td></tr>}
              </React.Fragment>; })}</tbody>
          </table>
        : units.map((u,i)=><React.Fragment key={u.id}>
            <Ins onClick={()=>actions.addUnit(sid,i,(nid)=>setOpen(nid))}/>
            <Row state={state} u={u} i={i} open={open===u.id} setOpen={setOpen} dated={dated} actions={actions}
              onOpenUnit={onOpenUnit} openWall={openWall} onOpenInLessons={onOpenInLessons} dragIdx={dragIdx}/>
          </React.Fragment>)}
      <button className="ph-dock-add" title="Add a unit at the end of this subject"
        onClick={()=>actions.addUnit(sid,units.length,(nid)=>setOpen(nid))}>{I.plus} New {DS.label('unit',false).toLowerCase()}</button>
      {archived.length>0 && <div className="ph-dock-arch">
        <div className="ah">Archived — kept for next year</div>
        {archived.map(u=><div key={u.id} className="ph-drow slim arch">
          <span className="d" style={{background:cv(s.c)}}></span>
          <b className="nm">{u.name}</b>
          <span className="tt">{u.lessons.length} lessons</span>
          <span className="grow"></span>
          <span className="acts">
            <button className="go" onClick={()=>actions.restoreUnit(u.id)}>Restore</button>
            <button title="Delete forever" onClick={()=>actions.deleteUnit(u.id)}>{I.x}</button>
          </span>
        </div>)}
      </div>}
    </div>
    <div className="ph-dock-subj">
      <div className="ded-card">
        <div className="dch">{I.box} {DS.label('subject',false)} resources</div>
        <ScopeResPills resources={meta.resources} placeholder={'Add a '+DS.label('subject',false).toLowerCase()+'-wide resource — e.g. Math manipulatives kit (Enter)'}
          onAdd={(n2,t)=>actions.addSubjRes(sid,n2,t)} onRemove={(rid)=>actions.removeSubjRes(sid,rid)}/>
        <div className="dcap">Whole-{DS.label('subject',false).toLowerCase()} materials — not tied to a {DS.label('unit',false).toLowerCase()}; they join the {DS.label('subject',false).toLowerCase()} wall.</div>
      </div>
      <div className="ded-card">
        <div className="dch">{I.target} {DS.label('subject',false)} assessments</div>
        <ScopeAssess list={meta.assessments} onAdd={(k)=>actions.addSubjAssess(sid,k)}
          onEdit={(aid,p)=>actions.editSubjAssess(sid,aid,p)} onRemove={(aid)=>actions.removeSubjAssess(sid,aid)}/>
        <div className="dcap">Benchmarks, MAP windows — checks that belong to the whole {DS.label('subject',false).toLowerCase()}.</div>
      </div>
      <div className="ded-card">
        <div className="dch">{I.logo} {DS.label('subject',false)} notes</div>
        <textarea className="ded-notes" rows="3" value={meta.notes||''} placeholder={'Anything about '+s.full+' as a whole…'}
          onChange={e=>actions.setSubjNotes(sid,e.target.value)}></textarea>
      </div>
    </div>
  </div>;
}
window.PHDock=Dock;
})();
