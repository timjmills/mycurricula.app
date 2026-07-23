/* Planning Hub — Planning Drawer: Unit Library (cards → Unit Plan) · Lesson Library
   (every lesson, grouped/filtered, rows or cards → Lessons tab) · Needs Attention
   (issues + dateless drafts as an expandable summary). Exposes window.PHDrawer. */
(function(){
const {useState,useEffect}=React;
const {cv}=window.PWC;
const {I}=window.PHC;
const PW=window.PW, DS=window.DS;
const MEM=window.__phTLMem=window.__phTLMem||{};

const unitStatus=(u)=>{
  const tg=u.lessons.filter(l=>l.status==='taught').length;
  if((u.lessons.length&&tg>=u.lessons.length)||u.endSlot<PW.TODAY_SLOT) return ['done','Done'];
  const missed=u.lessons.filter(l=>window.PHMore&&window.PHMore.isMissed&&window.PHMore.isMissed(l)).length;
  const remaining=u.lessons.filter(l=>l.status!=='taught'&&l.slot>=PW.TODAY_SLOT).length;
  const daysLeft=Math.max(0,u.endSlot-PW.TODAY_SLOT+1);
  if(u.startSlot>PW.TODAY_SLOT) return ['plan','Upcoming'];
  if(missed>0||remaining>daysLeft) return ['risk','Needs work'];
  return ['now','On track'];
};
const isMissed=(l)=>!!(window.PHMore&&window.PHMore.isMissed&&window.PHMore.isMissed(l));
const lStatus=(l)=>{ if(isMissed(l)) return ['missed','Missed','var(--danger)'];
  if(l.status==='taught') return ['taught','Taught','var(--done)'];
  if(l.slot===PW.TODAY_SLOT) return ['today','Today','var(--brand-600)'];
  if(PW.comp(l)<=2) return ['thin','Needs work','var(--warn)'];
  return ['planned','Planned','var(--phx-muted)']; };

function issuesOf(state){
  const out=[];
  state.units.filter(u=>!u.archived).forEach(u=>{
    u.lessons.forEach(l=>{ if(isMissed(l)){
      out.push({sev:'urgent',key:'m'+l.id,uid:u.id,lid:l.id,
        msg:(l.title||'Untitled')+' ('+u.name+') passed without being marked taught',act:'Review'}); } });
    const remaining=u.lessons.filter(l=>l.status!=='taught'&&l.slot>=PW.TODAY_SLOT).length;
    const daysLeft=Math.max(0,u.endSlot-PW.TODAY_SLOT+1);
    if(u.startSlot<=PW.TODAY_SLOT&&u.endSlot>=PW.TODAY_SLOT&&remaining>daysLeft)
      out.push({sev:'soon',key:'p'+u.id,uid:u.id,
        msg:u.name+' is at risk of running late — '+remaining+' '+DS.label('lesson',true).toLowerCase()+' remain but only '+daysLeft+' day'+(daysLeft===1?'':'s')+' before it ends',act:'Open '+DS.label('unit',false).toLowerCase()});
    const thin=u.lessons.filter(l=>l.slot>=PW.TODAY_SLOT&&l.status!=='taught'&&PW.comp(l)<=1).length;
    if(thin>=2&&u.endSlot>=PW.TODAY_SLOT)
      out.push({sev:'quality',key:'t'+u.id,uid:u.id,
        msg:thin+' upcoming '+DS.label('lesson',true).toLowerCase()+' in '+u.name+' are barely planned (2 sections or fewer)',act:'Plan them'});
  });
  if(state.bench.length)
    out.push({sev:'quality',key:'bench',bench:true,
      msg:state.bench.length+' draft '+DS.label('lesson',true).toLowerCase()+(state.bench.length===1?' has':' have')+' no date yet',act:'Schedule'});
  const rank={urgent:0,soon:1,quality:2};
  return out.sort((a,b)=>rank[a.sev]-rank[b.sev]);
}

function Drawer({state,dated,actions,anyCur,openUnitPop,openLesson,openBench,locate}){
  const [open,setOpen]=useState(MEM.drOpen!==undefined?MEM.drOpen:false);
  const issues=issuesOf(state);
  const [tab,setTab]=useState(()=>{ const t=MEM.drTab==='unsched'?'lessons':MEM.drTab; return t||(issues.length?'attn':'library'); });
  const [h,setH]=useState(MEM.drH||246);
  const [q,setQ]=useState('');
  const [subjF,setSubjF]=useState('all');
  const [unitF,setUnitF]=useState('all');
  const [statusF,setStatusF]=useState('all');
  const [grp,setGrp]=useState(MEM.drGrp||'unit');
  const [sort,setSort]=useState('date');
  const [look,setLook]=useState(MEM.drLook||'rows');
  const [menu,setMenu]=useState(null);            /* unit-card ⋯: uid · lesson: {lid,uid,x,y} */
  const [datePop,setDatePop]=useState(null);
  const [benchExp,setBenchExp]=useState(false);
  const [nl,setNl]=useState(null);                /* + new lesson popover {uid,day} */
  useEffect(()=>{ setMenu(null); setNl(null); },[tab,open]);
  useEffect(()=>{ MEM.drOpen=open; MEM.drTab=tab; MEM.drH=h; MEM.drGrp=grp; MEM.drLook=look; },[open,tab,h,grp,look]);
  const units=state.units.filter(u=>!u.archived);
  const sids=[...new Set(units.map(u=>u.sid))];
  const allL=units.flatMap(u=>u.lessons.map(l=>({l,u})));
  const nowFirst=(a,b)=>{ const cur=(u)=>u.startSlot<=PW.TODAY_SLOT&&u.endSlot>=PW.TODAY_SLOT?0:(u.startSlot>PW.TODAY_SLOT?1:2); return cur(a)-cur(b)||a.startSlot-b.startSlot; };
  const pool = subjF==='__arch' ? state.units.filter(u=>u.archived) : units.filter(u=>subjF==='all'||u.sid===subjF);
  const shown=pool.filter(u=>(!q||u.name.toLowerCase().includes(q.toLowerCase()))).sort(nowFirst);
  const go=(t)=>{ setTab(t); setOpen(true); };
  const dragH=(e)=>{ e.preventDefault(); const y0=e.clientY,h0=h;
    const mv=(ev)=>setH(Math.max(150,Math.min(Math.round(window.innerHeight*0.62),h0+(y0-ev.clientY))));
    const up=()=>{ document.removeEventListener('pointermove',mv); document.removeEventListener('pointerup',up); };
    document.addEventListener('pointermove',mv); document.addEventListener('pointerup',up); };
  const fmtD=(slot)=>dated?PW.fmtSlot(slot):('#'+(slot+1));
  const SEV={urgent:['Urgent','var(--danger)'],soon:['Upcoming','var(--warn)'],quality:['Planning quality','var(--phx-muted)']};

  /* ── lesson library data ── */
  const uOrder=units.slice().sort((a,b)=>String(a.sid).localeCompare(String(b.sid))||a.startSlot-b.startSlot);
  const passL=({l,u})=>(subjF==='all'||u.sid===subjF)&&(unitF==='all'||u.id===unitF)
    &&(statusF==='all'||lStatus(l)[0]===statusF||(statusF==='planned'&&lStatus(l)[0]==='today'))
    &&(!q||(l.title||'').toLowerCase().includes(q.toLowerCase()));
  const srt=(rows)=>rows.slice().sort((a,b)=>sort==='date'?a.l.slot-b.l.slot
    :(uOrder.indexOf(a.u)-uOrder.indexOf(b.u))||(a.u.lessons.indexOf(a.l)-b.u.lessons.indexOf(b.l)));
  const fl=allL.filter(passL);
  const groups=(()=>{ if(grp==='none') return [{k:'all',label:null,rows:srt(fl)}];
    if(grp==='unit') return uOrder.map(u=>({k:u.id,label:u.name,c:cv((DS.SUBJECTS[u.sid]||{}).c),rows:srt(fl.filter(r=>r.u.id===u.id))})).filter(g=>g.rows.length);
    if(grp==='subject') return sids.map(s=>({k:s,label:(DS.SUBJECTS[s]||{}).full||s,c:cv((DS.SUBJECTS[s]||{}).c),rows:srt(fl.filter(r=>r.u.sid===s))})).filter(g=>g.rows.length);
    if(grp==='status') return [['missed','Missed'],['thin','Needs work'],['today','Today'],['planned','Planned'],['taught','Taught']]
      .map(([k,lab])=>({k,label:lab,rows:srt(fl.filter(r=>lStatus(r.l)[0]===k))})).filter(g=>g.rows.length);
    return [['today','Today'],['up','Upcoming'],['past','Past']].map(([k,lab])=>({k,label:lab,
      rows:srt(fl.filter(r=>k==='today'?r.l.slot===PW.TODAY_SLOT:k==='up'?r.l.slot>PW.TODAY_SLOT:r.l.slot<PW.TODAY_SLOT))})).filter(g=>g.rows.length); })();
  const openMenu=(e,r)=>{ e.preventDefault(); e.stopPropagation(); setMenu({lid:r.l.id,uid:r.u.id,x:Math.min(e.clientX,window.innerWidth-210),y:Math.min(e.clientY,window.innerHeight-190)}); };
  const dup=(uid,lid)=>{ const u=state.units.find(x=>x.id===uid); const l=u&&u.lessons.find(x=>x.id===lid); if(!l) return;
    actions.insert(u.id,u.lessons.indexOf(l)+1,(nid)=>{ actions.edit(nid,{title:(l.title||'Untitled')+' (copy)',objective:l.objective,dur:l.dur,flowName:l.flowName,std:l.std,diff:l.diff,notes:l.notes,resources:(l.resources||[]).map((r,ri)=>({...r,id:'R'+Date.now().toString(36)+ri})),resN:(l.resources||[]).length,done:{...l.done}}); openLesson(u.id,nid); }); };
  const addNew=()=>{ const uid=nl.uid; const u=state.units.find(x=>x.id===uid); if(!u){ setNl(null); return; }
    let idx=u.lessons.length;
    if(nl.day){ const slot=dated?PW.SLOTS.findIndex(s=>s.iso===nl.day):(Number(nl.day)-1);
      if(slot>=0) idx=u.lessons.filter(l=>l.slot<slot).length; }
    setNl(null); actions.insert(uid,idx,(nid)=>openLesson(uid,nid)); };
  const LMenu=()=>{ if(!menu||!menu.lid) return null; const r=fl.find(x=>x.l.id===menu.lid)||allL.find(x=>x.l.id===menu.lid); if(!r) return null;
    return <React.Fragment><div className="ph-pop-scrim trans" onClick={()=>setMenu(null)}></div>
      <div className="ph-llmenu" style={{left:menu.x+'px',top:menu.y+'px'}}>
        <button onClick={()=>{ setMenu(null); openLesson(r.u.id,r.l.id); }}>Open</button>
        <button onClick={()=>{ setDatePop({id:r.l.id,x:menu.x,y:menu.y}); setMenu(null); }}>Move to date…</button>
        <button title="Next open school day — later lessons ripple" onClick={()=>{ setMenu(null); actions.reschedule(r.l.id); }}>Bump to next open day</button>
        <button onClick={()=>{ setMenu(null); dup(r.u.id,r.l.id); }}>Duplicate</button>
      </div></React.Fragment>; };

  return <div className={'ph-drawer'+(open?' open':'')} data-screen-label="Hub — Planning drawer">
    {open && <div className="ph-dr-grip" title="Drag to resize · double-click to collapse" onPointerDown={dragH} onDoubleClick={()=>setOpen(false)}><span></span></div>}
    <div className="ph-dr-bar">
      <button className={'ph-dr-tab'+(open&&tab==='library'?' on':'')} title={'Every '+DS.label('unit',false).toLowerCase()+' — pick one to open its plan'} onClick={()=>go('library')}>
        {I.cal} {DS.label('unit',false)} Library <i>{units.length}</i></button>
      <button className={'ph-dr-tab'+(open&&tab==='lessons'?' on':'')} title={'Every '+DS.label('lesson',false).toLowerCase()+' — narrow, group, move, add; pick one to plan it'} onClick={()=>go('lessons')}>
        {I.bench} {DS.label('lesson',false)} Library <i>{allL.length}</i></button>
      <button className={'ph-dr-tab'+(open&&tab==='attn'?' on':'')} title="Specific problems you can act on — missed, running late, barely planned, dateless drafts" onClick={()=>go('attn')}>
        {I.warn||I.target} Needs Attention <i className={issues.some(x=>x.sev==='urgent')?'hot':''}>{issues.length}</i></button>
      <span className="grow"></span>
      {open && (tab==='library'||tab==='lessons') && <React.Fragment>
        <input className="ph-dr-q" value={q} placeholder={tab==='library'?('Search '+DS.label('unit',true).toLowerCase()+'…'):('Search '+DS.label('lesson',true).toLowerCase()+'…')} onChange={e=>setQ(e.target.value)}/>
        <select className="ph-dr-f" value={subjF} title="Filter by subject" onChange={e=>{ setSubjF(e.target.value); setUnitF('all'); }}>
          <option value="all">All subjects</option>
          {sids.map(s=><option key={s} value={s}>{(DS.SUBJECTS[s]||{}).full||s}</option>)}
          {tab==='library' && <option value="__arch">Archived</option>}
        </select>
      </React.Fragment>}
      <button className="ph-dr-coll" title={open?'Collapse the drawer':'Expand the drawer'} onClick={()=>setOpen(o=>!o)}>{open?'⌄':'⌃'}</button>
    </div>
    {open && <div className="ph-dr-body" style={{minHeight:h+'px'}}>
      {tab==='library' && <div className="ph-dr-cards">
        {shown.map(u=>{ const s=DS.SUBJECTS[u.sid]||{}; const tg=u.lessons.filter(l=>l.status==='taught').length;
          const pct=u.lessons.length?Math.round(tg/u.lessons.length*100):0; const [sk,sl]=unitStatus(u);
          return <div key={u.id} className="ph-dr-card click" style={{'--uc':cv(s.c)}} draggable
            title={'Open '+u.name+'\u2019s plan · drag onto the timeline to reschedule it'}
            onClick={()=>openUnitPop(u.id)}
            onDragStart={(e)=>{ try{ e.dataTransfer.setData('text/ph-unit',u.id); e.dataTransfer.effectAllowed='move'; }catch(x){} }}>
            <div className="h"><span className="d"></span><span className="sj">{s.full||u.sid}</span><span className={'st '+(u.archived?'done':sk)}>{u.archived?'Archived':sl}</span>
              <button className="kb" title="More — duplicate or archive" onClick={(e)=>{ e.stopPropagation(); setMenu(m=>m===u.id?null:u.id); }}>⋯</button>
              {menu===u.id && <div className="ph-dr-menu" onClick={(e)=>e.stopPropagation()}>
                <button onClick={()=>{ setMenu(null); actions.duplicateUnit(u.id); }}>Duplicate</button>
                {u.archived
                  ? <button onClick={()=>{ setMenu(null); actions.restoreUnit(u.id); }}>Restore to timeline</button>
                  : <button onClick={()=>{ setMenu(null); actions.archiveUnit(u.id); }}>Archive</button>}
              </div>}
            </div>
            <div className="nm" title={u.name}>{u.name}</div>
            <div className="meta">{u.lessons.length} {DS.label('lesson',true).toLowerCase()} · {tg} taught</div>
            <div className="meta">{dated?(PW.fmtSlot(u.startSlot)+' – '+PW.fmtSlot(u.endSlot)):('#'+(u.startSlot+1)+' – #'+(u.endSlot+1))}</div>
            <div className="bar"><span style={{width:pct+'%'}}></span><i>{pct}%</i></div>
            <div className="acts">
              <button className="pri" title="Open this unit's plan" onClick={(e)=>{ e.stopPropagation(); openUnitPop(u.id); }}>Open</button>
              <button title="Scroll the timeline to this unit" onClick={(e)=>{ e.stopPropagation(); locate(u.id); }}>{I.pin} Locate</button>
            </div>
          </div>; })}
        {!shown.length && <div className="ph-dr-empty">No {DS.label('unit',true).toLowerCase()} match.</div>}
      </div>}
      {tab==='lessons' && <div className="ph-ll">
        <div className="ph-ll-bar">
          <select className="ph-dr-f" value={unitF} title={'Filter by '+DS.label('unit',false).toLowerCase()} onChange={e=>setUnitF(e.target.value)}>
            <option value="all">All {DS.label('unit',true).toLowerCase()}</option>
            {uOrder.filter(u=>subjF==='all'||u.sid===subjF).map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select className="ph-dr-f" value={statusF} title="Filter by status" onChange={e=>setStatusF(e.target.value)}>
            {[['all','Any status'],['planned','Planned'],['taught','Taught'],['missed','Missed'],['thin','Needs work']].map(([k,lab])=><option key={k} value={k}>{lab}</option>)}
          </select>
          <select className="ph-dr-f" value={grp} title="Group the list" onChange={e=>setGrp(e.target.value)}>
            {[['unit','By '+DS.label('unit',false).toLowerCase()],['subject','By '+DS.label('subject',false).toLowerCase()],['status','By status'],['timing','By timing'],['none','No groups']].map(([k,lab])=><option key={k} value={k}>{lab}</option>)}
          </select>
          <select className="ph-dr-f" value={sort} title="Order within groups" onChange={e=>setSort(e.target.value)}>
            <option value="date">By date</option><option value="seq">By sequence</option>
          </select>
          <span className="ph-uiseg look">{[['rows','Rows'],['cards','Cards']].map(([k,lab])=><button key={k} className={look===k?'on':''} onClick={()=>setLook(k)}>{lab}</button>)}</span>
          <span className="grow"></span>
          <button className="ph-ll-new" title={'Add a '+DS.label('lesson',false).toLowerCase()+' — pick the '+DS.label('unit',false).toLowerCase()+' and day'} onClick={()=>setNl(nl?null:{uid:(anyCur||uOrder[0]||{}).id,day:''})}>+ New {DS.label('lesson',false).toLowerCase()}</button>
          {nl && <div className="ph-ll-newpop">
            <label><span>{DS.label('unit',false)}</span>
              <select value={nl.uid||''} onChange={e=>setNl({...nl,uid:e.target.value})}>{uOrder.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
            <label><span>Day <em>(blank = end)</em></span>
              {dated?<input type="date" value={nl.day} onChange={e=>setNl({...nl,day:e.target.value})}/>
                :<input type="number" min="1" value={nl.day} placeholder="#" onChange={e=>setNl({...nl,day:e.target.value})}/>}</label>
            <div className="r"><button className="pri" onClick={addNew}>Add & open</button>
              <button title="No date yet — it lands in Needs Attention as a draft" onClick={()=>{ setNl(null); actions.addBench(); setTab('attn'); setBenchExp(true); }}>Draft without a date</button></div>
          </div>}
        </div>
        {groups.map(g=><div key={g.k} className="ph-ll-grp">
          {g.label && <div className="gh">{g.c&&<span className="gd" style={{background:g.c}}></span>}{g.label}<em>{g.rows.length}</em></div>}
          {look==='rows'
            ? g.rows.map(r=>{ const [sk,sl2,sc]=lStatus(r.l); const s=DS.SUBJECTS[r.u.sid]||{};
                return <div key={r.l.id} className="ph-ll-row" draggable role="button" tabIndex={0}
                  title={'Open '+(r.l.title||'this '+DS.label('lesson',false).toLowerCase())+' · drag onto the timeline to move its day · right-click for more'}
                  onClick={()=>openLesson(r.u.id,r.l.id)} onContextMenu={(e)=>openMenu(e,r)}
                  onDragStart={(e)=>{ try{ e.dataTransfer.setData('text/ws-lesson',r.l.id); e.dataTransfer.effectAllowed='move'; }catch(x){} }}>
                  <span className="n">{r.u.lessons.indexOf(r.l)+1}</span>
                  <span className="sd" style={{background:cv(s.c)}}></span>
                  <span className="t">{r.l.title||'Untitled'}</span>
                  {grp!=='unit' && <span className="un">{r.u.name}</span>}
                  <span className="dt">{fmtD(r.l.slot)}</span>
                  <span className="st" style={{color:sc}}>{sl2}</span>
                  <button className="kb" title="Move, bump, duplicate…" onClick={(e)=>openMenu(e,r)}>⋯</button>
                </div>; })
            : <div className="ph-dr-cards in">{g.rows.map(r=>{ const [sk,sl2,sc]=lStatus(r.l); const s=DS.SUBJECTS[r.u.sid]||{};
                return <div key={r.l.id} className="ph-dr-card lesson click" style={{'--uc':cv(s.c)}} draggable
                  title={'Open '+(r.l.title||'this '+DS.label('lesson',false).toLowerCase())+' · drag onto the timeline to move its day'}
                  onClick={()=>openLesson(r.u.id,r.l.id)} onContextMenu={(e)=>openMenu(e,r)}
                  onDragStart={(e)=>{ try{ e.dataTransfer.setData('text/ws-lesson',r.l.id); e.dataTransfer.effectAllowed='move'; }catch(x){} }}>
                  <div className="h"><span className="d"></span><span className="sj">{r.u.name}</span>
                    <button className="kb" title="Move, bump, duplicate…" onClick={(e)=>openMenu(e,r)}>⋯</button></div>
                  <div className="nm" title={r.l.title}>{r.l.title||'Untitled'}</div>
                  <div className="meta">{fmtD(r.l.slot)} · <b style={{color:sc}}>{sl2}</b></div>
                </div>; })}</div>}
        </div>)}
        {!fl.length && <div className="ph-dr-empty">No {DS.label('lesson',true).toLowerCase()} match these filters.</div>}
      </div>}
      {tab==='attn' && <div className="ph-dr-issues">
        {['urgent','soon','quality'].map(sev=>{ const grp2=issues.filter(x=>x.sev===sev); if(!grp2.length) return null;
          return <div key={sev} className="ph-dr-sev">
            <div className="sh" style={{color:SEV[sev][1]}}>{SEV[sev][0]}</div>
            {grp2.map(is=><React.Fragment key={is.key}>
              <div className={'ph-dr-issue'+(is.bench?' bench':'')} onClick={is.bench?()=>setBenchExp(v=>!v):undefined}>
                <span className="dot" style={{background:SEV[is.sev][1]}}></span>
                <span className="m">{is.msg}</span>
                <button title={is.act} onClick={(e)=>{ e.stopPropagation();
                  if(is.bench){ setBenchExp(v=>!v); }
                  else if(is.lid){ openLesson(is.uid,is.lid); }
                  else { openUnitPop(is.uid); } }}>{is.bench?(benchExp?'Hide':is.act):is.act}</button>
              </div>
              {is.bench && benchExp && <div className="ph-dr-subrows">
                {state.bench.map(b=><div key={b.id} className="sr" role="button" tabIndex={0} title="Open this draft — plan it and give it a date" onClick={()=>openBench(b.id)}>
                  <span className="t">{b.title}</span><span className="ob">{b.objective||'No objective yet'}</span>
                  {anyCur && <button title={'Slot it into '+anyCur.name+' at the next thin spot'} onClick={(e)=>{ e.stopPropagation(); actions.benchToUnit(b.id,anyCur.id); openLesson(anyCur.id,b.id); }}>→ {anyCur.name.length>14?anyCur.name.slice(0,13)+'…':anyCur.name}</button>}
                </div>)}
                <div className="sr foot">
                  <button onClick={()=>actions.addBench()}>+ Draft a {DS.label('lesson',false).toLowerCase()}</button>
                  {anyCur && state.bench.length>1 && <button title={'Place every draft into '+anyCur.name+' at its next thin spots'}
                    onClick={()=>{ const ids=state.bench.map(b=>b.id); ids.forEach(id=>actions.benchToUnit(id,anyCur.id)); openUnitPop(anyCur.id); }}>Auto-schedule all</button>}
                </div>
              </div>}
            </React.Fragment>)}
          </div>; })}
        {!issues.length && <div className="ph-dr-empty">Nothing needs attention — the plan is clean. ✓</div>}
      </div>}
    </div>}
    <LMenu/>
    {datePop && (()=>{ let dl=null,du=null; state.units.forEach(x=>x.lessons.forEach(y=>{ if(y.id===datePop.id){ dl=y; du=x; } }));
      if(!dl||!window.PHUnits.DatePop) return null; const di=du.lessons.indexOf(dl);
      return <window.PHUnits.DatePop info={datePop} l={dl} dated={dated} canStack={di>0||du.startSlot>0} actions={actions} onClose={()=>setDatePop(null)}/>; })()}
  </div>;
}
window.PHDrawer=Drawer;
})();
