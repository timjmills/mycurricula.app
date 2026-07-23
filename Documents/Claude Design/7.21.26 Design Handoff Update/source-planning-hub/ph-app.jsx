/* Planning Hub — app: state engine + history/undo, toast, focus planner.
   Exposes window.PHApp. */
(function(){
const {useState,useMemo,useCallback,useEffect,useRef}=React;
const PW=window.PW, DS=window.DS, FW=window.FW;
const {I,KindTag}=window.PHC;
const {cv}=window.PWC;
const {PHTop,PHSettings}=window.PHShell;
const EMBED=/[?&]embed=/.test(location.search)||(function(){try{return window.self!==window.top;}catch(e){return true;}})();
const BARE=/[?&]bare=1/.test(location.search);

function clone(state){
  const cl=(l)=>({...l, done:{...l.done}, tags:[...l.tags], resources:(l.resources||[]).map(r=>({...r})),
    fwData:{...(l.fwData||{})}, carried:[...(l.carried||[])]});
  return {
    units:state.units.map(u=>({...u, stds:(u.stds||[]).map(x=>x.slice()), vocab:[...(u.vocab||[])],
      resources:(u.resources||[]).map(r=>({...r})), assessments:(u.assessments||[]).map(a=>({...a})),
      fwData:{...(u.fwData||{})}, carried:[...(u.carried||[])], customFields:[...(u.customFields||[])],
      hiddenGroups:[...(u.hiddenGroups||[])], kud:u.kud?{k:[...(u.kud.k||[])],u:[...(u.kud.u||[])],d:[...(u.kud.d||[])]}:{k:[],u:[],d:[]},
      reflect:{...(u.reflect||{})}, lessons:u.lessons.map(cl)})),
    bench:state.bench.map(cl),
    subjects:Object.fromEntries(Object.entries(state.subjects||{}).map(([k,v])=>[k,
      {notes:v.notes||'', resources:(v.resources||[]).map(r=>({...r})), assessments:(v.assessments||[]).map(a=>({...a}))}])),
  };
}
/* per-subject meta — resources, notes & assessments not tied to a unit */
const subjMeta=(n,sid)=>{ n.subjects=n.subjects||{}; return n.subjects[sid]=n.subjects[sid]||{notes:'',resources:[],assessments:[]}; };
const rid=()=>'R'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const aid=()=>'A'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
function locate(state,id){
  for(const u of state.units){ const idx=u.lessons.findIndex(l=>l.id===id); if(idx>=0) return {u,idx,l:u.lessons[idx]}; }
  const bi=state.bench.findIndex(b=>b.id===id); if(bi>=0) return {bench:true,idx:bi,l:state.bench[bi]};
  return null;
}
function moveSlot(n,id,slot){
  const f=locate(n,id); if(!f||!f.u) return;
  const u=f.u, moving=f.l;
  const sameSid=n.units.filter(x=>x.sid===u.sid);
  const flat=[]; sameSid.forEach(x=>x.lessons.forEach(l=>{ if(l.id!==id) flat.push(l); }));
  moving.slot=slot; flat.push(moving);
  flat.sort((a,b)=>a.slot-b.slot);
  const order=flat.map(l=>l.id);
  sameSid.forEach(x=>{ x.lessons.sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id)); });
  moving.modified=true;
}
function copyLesson(src){
  const b=PW.blank(src.title+' (copy)');
  Object.assign(b,{objective:src.objective,std:src.std,tags:[...src.tags],dur:src.dur,flowName:src.flowName,
    assessment:src.assessment,assessTitle:src.assessTitle,diffText:src.diffText,done:{...src.done},stack:false,pad:0,
    resources:(src.resources||[]).map((r,i)=>({...r,id:'R'+Date.now().toString(36)+Math.random().toString(36).slice(2,4)+i})),modified:true});
  b.resN=b.resources.length;
  return b;
}
function loadSettings(){
  const DEF={dated:true,bg:'ambient',framework:'pyp',subjectFw:{math:'ubd'},customFields:[],subjectCF:{},uiLevel:'simple'};
  try{ return {...DEF,...JSON.parse(localStorage.getItem('ph_settings')||'{}')}; }
  catch(e){ return DEF; }
}

function App(){
  const [state,setState]=useState(()=>PW.build());
  const [scope,setScope]=useState('personal');
  useEffect(()=>{ const h=(e)=>{ if(e.data&&e.data.type==='cc-scope'&&(e.data.scope==='personal'||e.data.scope==='team')) setScope(e.data.scope); }; window.addEventListener('message',h); return ()=>window.removeEventListener('message',h); },[]);
  const [settings,setSettings]=useState(loadSettings);
  const [query,setQuery]=useState('');
  const [openUnit,setOpenUnit]=useState(null);
  const [expanded,setExpanded]=useState(null);
  const [sel,setSel]=useState([]);
  const [view,setView]=useState('strip');
  const [insights,setInsights]=useState(false);
  const [cog,setCog]=useState(false);
  const [focus,setFocus]=useState(null);           // {uid,lid} — focus planner popup
  const [toast,setToast]=useState(null);           // {label,key}
  const [wall,setWall]=useState(null);             // {kind:'unit'|'subject', id|sid}
  const [,force]=useState(0);
  const stateRef=useRef(state); useEffect(()=>{ stateRef.current=state; });
  const history=useRef([]);
  const nav=useRef([]);                            // UI snapshots — the Back button restores them
  useEffect(()=>{ const f=()=>force(x=>x+1); window.addEventListener('cc-labels',f); return ()=>window.removeEventListener('cc-labels',f); },[]);
  useEffect(()=>{ if(!toast) return; const t=setTimeout(()=>setToast(null),5200); return ()=>clearTimeout(t); },[toast]);
  const update=(k,v)=>setSettings(s=>{ const n={...s,[k]:v}; try{ localStorage.setItem('ph_settings',JSON.stringify(n)); }catch(e){} return n; });

  const say=(label)=>setToast({label,key:Date.now()});
  const push=()=>{ history.current.push(stateRef.current); if(history.current.length>25) history.current.shift(); };
  const undo=()=>{ const prev=history.current.pop(); if(prev) setState(prev); setToast(null); };

  const apply=useCallback((mut,label,skipHist)=>{
    if(!skipHist) push();
    setState(prev=>{ const n=clone(prev); mut(n); return PW.schedule(n); });
    if(label) say(label);
  },[]);

  const actions=useMemo(()=>({
    /* checkpoint for continuous drags: one history entry per gesture */
    checkpoint:()=>push(),
    toast:say,
    undoAvailable:()=>history.current.length>0,
    edit:(id,patch)=>apply(n=>{ const f=locate(n,id); if(f){ Object.assign(f.l,patch); if(patch.done) f.l.done={...f.l.done,...patch.done}; f.l.modified=true; } },null,true),
    editUnit:(uid,patch)=>apply(n=>{ const u=n.units.find(x=>x.id===uid); if(u) Object.assign(u,patch); },null,true),
    remove:(id)=>{ apply(n=>{ const f=locate(n,id); if(f&&f.u) f.u.lessons.splice(f.idx,1); else if(f&&f.bench) n.bench.splice(f.idx,1); },'Lesson removed'); setExpanded(null); setFocus(null); setSel(s=>s.filter(x=>x!==id)); },
    reorder:(uid,from,to)=>apply(n=>{ const u=n.units.find(x=>x.id===uid); if(!u) return; const [m]=u.lessons.splice(from,1); u.lessons.splice(to,0,m); m.modified=true; },'Reordered'),
    insert:(uid,at,done)=>{ let nid=null; apply(n=>{ const u=n.units.find(x=>x.id===uid); if(!u) return; const nl=PW.blank(); nid=nl.id; u.lessons.splice(at,0,nl); },'Lesson added'); if(done&&nid) setTimeout(()=>done(nid),0); },
    toggleTag:(id,code)=>apply(n=>{ const f=locate(n,id); if(!f) return; const l=f.l;
      if(l.tags.includes(code)){ l.tags=l.tags.filter(c=>c!==code); if(l.std===code) l.std=l.tags[0]||''; }
      else { l.tags=[...l.tags,code]; if(!l.std) l.std=code; } l.modified=true; },null,true),
    setSlot:(id,slot)=>apply(n=>moveSlot(n,id,slot),null,true),
    padUnit:(uid,pad)=>apply(n=>{ const u=n.units.find(x=>x.id===uid); if(!u||!u.lessons.length) return; u.lessons[0].pad=Math.max(0,pad); u.lessons[0].modified=true; },null,true),
    padLesson:(id,d)=>apply(n=>{ const f=locate(n,id); if(!f) return; f.l.pad=Math.max(0,(f.l.pad||0)+d); f.l.stack=false; f.l.modified=true; },d>0?'Moved later':'Moved earlier'),
    toggleStack:(id)=>apply(n=>{ const f=locate(n,id); if(!f) return; f.l.stack=!f.l.stack; if(f.l.stack) f.l.pad=0; f.l.modified=true; },'Day sharing updated'),
    benchToUnit:(bid,uid)=>apply(n=>{ const bi=n.bench.findIndex(b=>b.id===bid); const u=n.units.find(x=>x.id===uid); if(bi<0||!u) return;
      const [b]=n.bench.splice(bi,1); const at=u.lessons.findIndex(l=>l.status!=='taught'&&PW.comp(l)<=2); u.lessons.splice(at<0?u.lessons.length:at,0,b); },'Planned from the bench'),
    addBench:()=>apply(n=>{ n.bench.push(PW.blank('Untitled bench lesson')); },'Draft added to the bench'),
    addAt:(sid,slot,done)=>{ let nid=null,uidOut=null; apply(n=>{
      const units=n.units.filter(x=>x.sid===sid); if(!units.length) return;
      const flat=[]; units.forEach(x=>x.lessons.forEach(l=>flat.push({l,u:x})));
      flat.sort((a,b)=>a.l.slot-b.l.slot);
      const next=flat.find(x=>x.l.slot>slot);
      const prev=[...flat].reverse().find(x=>x.l.slot<slot);
      const nl=PW.blank(); nid=nl.id;
      nl.pad=slot-(prev?prev.l.slot:-1)-1;
      if(next){
        next.l.pad=Math.max(0,next.l.slot-slot-1); next.l.stack=false;
        const tu=next.u; uidOut=tu.id;
        tu.lessons.splice(tu.lessons.indexOf(next.l),0,nl);
      } else {
        const tu=prev?prev.u:units[units.length-1]; uidOut=tu.id;
        tu.lessons.push(nl);
      }
    },'Lesson added'); if(done&&nid) setTimeout(()=>done(uidOut,nid),0); },
    bulk:(ids,fn)=>apply(n=>{ ids.forEach(id=>{ const f=locate(n,id); if(f){ fn(f.l); f.l.modified=true; } }); },'Updated '+ids.length),
    bulkShift:(ids,d)=>apply(n=>{ ids.map(id=>locate(n,id)).filter(Boolean).forEach(f=>{ f.l.slot=PW.clampSlot(f.l.slot+d); f.l.modified=true; }); n.units.forEach(u=>u.lessons.sort((a,b)=>a.slot-b.slot)); },'Shifted '+ids.length),
    bulkFlow:(ids,flow)=>apply(n=>{ ids.forEach(id=>{ const f=locate(n,id); if(f){ f.l.flowName=flow; f.l.done.flow=true; f.l.modified=true; } }); },'Flow applied'),
    bulkRes:(ids)=>apply(n=>{ ids.forEach(id=>{ const f=locate(n,id); if(f){ f.l.resources.push({id:'R'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),name:'Shared resource',type:'Link'}); f.l.resN=f.l.resources.length; f.l.done.res=true; f.l.modified=true; } }); },'Resource attached'),
    bulkTaught:(ids)=>apply(n=>{ ids.forEach(id=>{ const f=locate(n,id); if(f) f.l.forceTaught=true; }); },'Marked taught'),
    bulkRemove:(ids)=>{ apply(n=>{ ids.forEach(id=>{ const f=locate(n,id); if(f&&f.u) f.u.lessons.splice(f.u.lessons.indexOf(f.l),1); }); },'Removed '+ids.length); setSel([]); },
    bulkDuplicate:(ids)=>apply(n=>{ ids.map(id=>locate(n,id)).filter(f=>f&&f.u).sort((a,b)=>b.idx-a.idx).forEach(f=>{ f.u.lessons.splice(f.idx+1,0,copyLesson(f.l)); }); },'Duplicated '+ids.length),
    duplicate:(id)=>apply(n=>{ const f=locate(n,id); if(!f||!f.u) return; f.u.lessons.splice(f.idx+1,0,copyLesson(f.l)); },'Lesson duplicated'),
    duplicateUnit:(uid)=>apply(n=>{ const u=n.units.find(x=>x.id===uid); if(!u) return;
      const nu={...u,id:'U'+Date.now().toString(36),name:u.name+' (copy)',target:null,eq:u.eq,
        resources:(u.resources||[]).map((r,i)=>({...r,id:rid()+i})),
        assessments:(u.assessments||[]).map((a,i)=>({...a,id:aid()+i})),
        lessons:u.lessons.map(l=>{ const c=copyLesson(l); c.title=l.title; c.forceTaught=false; return c; })};
      if(nu.lessons.length){ nu.lessons[0].pad=0; }
      n.units.splice(n.units.indexOf(u)+1,0,nu); },'Unit duplicated after the original'),
    moveUnit:(uid,dir)=>apply(n=>{ const u=n.units.find(x=>x.id===uid); if(!u) return;
      const sibs=n.units.filter(x=>x.sid===u.sid);
      const si=sibs.indexOf(u), ti=si+dir;
      if(ti<0||ti>=sibs.length) return;
      const a=n.units.indexOf(sibs[si]), b2=n.units.indexOf(sibs[ti]);
      n.units[a]=sibs[ti]; n.units[b2]=sibs[si];
      u.lessons.forEach(l=>l.modified=true); },'Unit moved'),
    resizeUnit:(uid,toSlot)=>apply(n=>{ const u=n.units.find(x=>x.id===uid); if(!u||!u.lessons.length) return;
      const tc=Math.max(1,u.lessons.length+(toSlot-u.endSlot));
      if(tc>u.lessons.length){
        for(let k=u.lessons.length;k<tc;k++){ const nl=PW.blank('Untitled lesson');
          if(u.defaultDur) nl.dur=u.defaultDur; if(u.defaultFlow){ nl.flowName=u.defaultFlow; nl.done.flow=true; }
          u.lessons.push(nl); }
      } else if(tc<u.lessons.length){
        let rm=u.lessons.length-tc;
        while(rm>0){ const last=u.lessons[u.lessons.length-1];
          if(last && last.status!=='taught' && PW.comp(last)<=1 && (last.title==='Untitled lesson'||last.title==='New lesson'||!last.title)){ u.lessons.pop(); rm--; }
          else break; }
      } },null,true),
    setUnitStart:(uid,slot)=>apply(n=>{ const u=n.units.find(x=>x.id===uid); if(!u||!u.lessons.length) return;
      if(u.anchor!=null){ u.anchor=Math.max(0,slot); u.lessons[0].modified=true; return; }
      const f=u.lessons[0]; f.pad=Math.max(0,(f.pad||0)+(slot-u.startSlot)); f.modified=true; },'Unit rescheduled — later units bump'),
    anchorUnit:(uid,slot)=>apply(n=>{ const u=n.units.find(x=>x.id===uid); if(!u) return;
      u.anchor=Math.max(0,slot); if(u.lessons[0]) u.lessons[0].pad=0; },null,true),
    insertGapWeek:(uid)=>apply(n=>{ const u=n.units.find(x=>x.id===uid); if(!u) return;
      const sibs=n.units.filter(x=>x.sid===u.sid&&!x.archived); const i=sibs.indexOf(u); const nx=sibs[i+1];
      if(nx&&nx.lessons.length){ nx.lessons[0].pad=(nx.lessons[0].pad||0)+PW.SWLEN; nx.lessons[0].modified=true; } },'Gap week inserted after the unit'),
    archiveUnit:(uid)=>apply(n=>{ const u=n.units.find(x=>x.id===uid); if(u) u.archived=true; },'Unit archived — hidden but kept for next year'),
    restoreUnit:(uid)=>apply(n=>{ const u=n.units.find(x=>x.id===uid); if(u){ u.archived=false; if(u.lessons.length) u.lessons[0].pad=0; } },'Unit restored'),
    deleteUnit:(uid)=>{ apply(n=>{ const i=n.units.findIndex(x=>x.id===uid); if(i>=0) n.units.splice(i,1); },'Unit deleted'); setOpenUnit(o=>o===uid?null:o); },
    moveUnitToSubject:(uid,sid2)=>apply(n=>{ const i=n.units.findIndex(x=>x.id===uid); if(i<0) return;
      const [u]=n.units.splice(i,1); u.sid=sid2; if(u.lessons.length){ u.lessons[0].pad=0; u.lessons.forEach(l=>l.modified=true); }
      let at=-1; n.units.forEach((x,j)=>{ if(x.sid===sid2) at=j; });
      n.units.splice(at<0?n.units.length:at+1,0,u); },'Unit moved to its new subject'),
    reorderUnits:(sid,from,to)=>apply(n=>{ const sibs=n.units.filter(x=>x.sid===sid&&!x.archived);
      if(from<0||from>=sibs.length||to<0||to>=sibs.length) return;
      const [m]=sibs.splice(from,1); sibs.splice(to,0,m); m.lessons.forEach(l=>l.modified=true);
      let k=0; for(let j=0;j<n.units.length;j++){ if(n.units[j].sid===sid&&!n.units[j].archived) n.units[j]=sibs[k++]; } },'Units reordered'),
    addUnit:(sid,at,done)=>{ let nid=null; apply(n=>{
      const nu={ id:'U'+Date.now().toString(36), sid, name:'New unit', target:null, stds:[], eq:null, summary:'', vocab:[],
        notes:'', defaultDur:45, defaultFlow:null, archived:false, lessons:[PW.blank()] };
      nid=nu.id;
      const sibs=n.units.filter(x=>x.sid===sid&&!x.archived);
      const anchor=(at>=sibs.length)?null:sibs[at];
      const idx=anchor?n.units.indexOf(anchor):(sibs.length?n.units.indexOf(sibs[sibs.length-1])+1:n.units.length);
      n.units.splice(idx,0,nu); },'Unit added'); if(done&&nid) setTimeout(()=>done(nid),0); },
    markTaught:(id)=>apply(n=>{ const f=locate(n,id); if(f) f.l.forceTaught=f.l.status!=='taught'; },'Updated'),
    reschedule:(id)=>apply(n=>{
      const f=locate(n,id); if(!f||!f.u) return;
      const l=f.u.lessons.splice(f.idx,1)[0];
      const cur=n.units.find(x=>x.sid===f.u.sid&&x.endSlot>=PW.TODAY_SLOT)||f.u;
      let at=cur.lessons.findIndex(x=>x.slot>PW.TODAY_SLOT); if(at<0) at=cur.lessons.length;
      l.pad=0; l.stack=false; l.modified=true; cur.lessons.splice(at,0,l);
    },'Bumped to the next school day'),
    skipCatchup:(id)=>apply(n=>{ const f=locate(n,id); if(f) f.l.cuHandled=true; },'Skipped'),
    editFw:(uid,patch)=>apply(n=>{ const u2=n.units.find(x=>x.id===uid); if(u2) u2.fwData={...(u2.fwData||{}),...patch}; },null,true),
    editLessonFw:(lid,patch)=>apply(n=>{ const f=locate(n,lid); if(f){ f.l.fwData={...(f.l.fwData||{}),...patch}; f.l.modified=true; } },null,true),
    setCustomDefs:(sc,sid,defs)=>{ const S=window.__phSettings||{};
      if(sc==='planner') update('customFields',defs);
      else update('subjectCF',{...(S.subjectCF||{}),[sid]:defs}); },
    convertLesson:(lid)=>apply(n=>{ const f=locate(n,lid); if(!f||!f.u) return; const S=window.__phSettings||{};
      const to=FW.effective(f.u,S); const from=f.l.fwId||to;
      const r=FW.convert(f.l.fwData,f.l.carried,from,to,true);
      f.l.fwData=r.fwData; f.l.carried=r.carried; f.l.fwId=to; f.l.modified=true; },'Lesson updated — extras kept in Carried over'),
    setFramework:(scope,id,fwId,convertLessons)=>{ const S=window.__phSettings||{};
      apply(n=>{
        const affected = scope==='unit' ? n.units.filter(x=>x.id===id)
          : scope==='subject' ? n.units.filter(x=>x.sid===id&&!x.framework)
          : n.units.filter(x=>!x.framework&&!((S.subjectFw||{})[x.sid]));
        affected.forEach(u2=>{
          const from=FW.effective(u2,S);
          const r=FW.convert(u2.fwData,u2.carried,from,fwId,false);
          u2.fwData=r.fwData; u2.carried=r.carried;
          if(scope==='unit') u2.framework=fwId;
          u2.lessons.forEach(l=>{ const fromL=l.fwId||from;
            if(convertLessons){ const rl=FW.convert(l.fwData,l.carried,fromL,fwId,true);
              l.fwData=rl.fwData; l.carried=rl.carried; l.fwId=fwId; }
            else l.fwId=fromL; });
        });
      },'Framework switched — nothing thrown away');
      if(scope==='subject') update('subjectFw',{...(S.subjectFw||{}),[id]:fwId});
      if(scope==='planner') update('framework',fwId);
    },
    addRes:(id,name,type)=>apply(n=>{ const f=locate(n,id); if(!f) return;
      f.l.resources.push({id:'R'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),name:name||'Resource',type:type||'Link'});
      f.l.resN=f.l.resources.length; f.l.done.res=true; f.l.modified=true; },null,true),
    removeRes:(id,rid)=>apply(n=>{ const f=locate(n,id); if(!f) return;
      f.l.resources=f.l.resources.filter(r=>r.id!==rid);
      f.l.resN=f.l.resources.length; f.l.done.res=f.l.resN>0; f.l.modified=true; },null,true),
    addUnitRes:(uid,name,type)=>apply(n=>{ const u2=n.units.find(x=>x.id===uid); if(!u2) return;
      u2.resources=[...(u2.resources||[]),{id:rid(),name:name||'Resource',type:type||'Link'}]; },null,true),
    /* composer save — each attachment is its OWN stacked resource; a written note is its own too.
       target: {kind:'lesson'|'unit'|'subject', id, field:'resources'|'diffRes'} */
    addResources:(target,list)=>apply(n=>{ if(!list||!list.length) return;
      const stamp=(r,i)=>({id:'R'+Date.now().toString(36)+i+Math.random().toString(36).slice(2,5),
        name:r.name||'Resource',type:r.type||'Link',url:r.url||'',note:r.note||'',bg:r.bg||'',sec:r.sec||'',wall:r.wall||''});
      const items=list.map(stamp);
      if(target.kind==='unit'){ const u2=n.units.find(x=>x.id===target.id); if(!u2) return; u2.resources=[...(u2.resources||[]),...items]; return; }
      if(target.kind==='subject'){ const sm=subjMeta(n,target.id); sm.resources=[...(sm.resources||[]),...items]; return; }
      const f=locate(n,target.id); if(!f) return; const fld=target.field==='diffRes'?'diffRes':'resources';
      f.l[fld]=[...(f.l[fld]||[]),...items];
      if(fld==='resources'){ f.l.resN=f.l.resources.length; f.l.done.res=true; } else { f.l.done.diff=true; }
      f.l.modified=true; },null,true),
    removeUnitRes:(uid,rid2)=>apply(n=>{ const u2=n.units.find(x=>x.id===uid); if(!u2) return;
      u2.resources=(u2.resources||[]).filter(r=>r.id!==rid2); },null,true),
    moveLessonTo:(id,uid2,idx2)=>apply(n=>{ let su=null,i=-1; n.units.forEach(x=>{ const j=x.lessons.findIndex(y=>y.id===id); if(j>=0){ su=x; i=j; } });
      const tu=n.units.find(x=>x.id===uid2); if(!su||!tu) return;
      const [m]=su.lessons.splice(i,1); m.pad=0; m.stack=false; m.modified=true;
      const at=(idx2==null||idx2<0||idx2>tu.lessons.length)?tu.lessons.length:idx2;
      tu.lessons.splice(at,0,m); },'Lesson moved — the schedule rippled',true),
    lessonToBench:(id)=>apply(n=>{ let su=null,i=-1; n.units.forEach(x=>{ const j=x.lessons.findIndex(y=>y.id===id); if(j>=0){ su=x; i=j; } });
      if(!su) return; const [m]=su.lessons.splice(i,1);
      n.bench.push({id:m.id,title:m.title||'Draft',objective:m.objective||'',dur:m.dur||null}); },'Sent to Unscheduled — it keeps its plan, loses its date',true),
    deleteLesson:(id)=>apply(n=>{ let su=null,i=-1; n.units.forEach(x=>{ const j=x.lessons.findIndex(y=>y.id===id); if(j>=0){ su=x; i=j; } });
      if(!su) return; su.lessons.splice(i,1); },'Lesson deleted',true),
    addUnitAssess:(uid,type)=>apply(n=>{ const u2=n.units.find(x=>x.id===uid); if(!u2) return;
      u2.assessments=[...(u2.assessments||[]),{id:aid(),type,title:type==='summative'?'Unit assessment':'Check-in'}]; },'Assessment added to the unit'),
    editUnitAssess:(uid,aid2,patch)=>apply(n=>{ const u2=n.units.find(x=>x.id===uid); if(!u2) return;
      u2.assessments=(u2.assessments||[]).map(a=>a.id===aid2?{...a,...patch}:a); },null,true),
    removeUnitAssess:(uid,aid2)=>apply(n=>{ const u2=n.units.find(x=>x.id===uid); if(!u2) return;
      u2.assessments=(u2.assessments||[]).filter(a=>a.id!==aid2); },'Removed'),
    addSubjRes:(sid,name,type)=>apply(n=>{ const m=subjMeta(n,sid);
      m.resources=[...m.resources,{id:rid(),name:name||'Resource',type:type||'Link'}]; },null,true),
    removeSubjRes:(sid,rid2)=>apply(n=>{ const m=subjMeta(n,sid);
      m.resources=m.resources.filter(r=>r.id!==rid2); },null,true),
    setSubjNotes:(sid,text)=>apply(n=>{ subjMeta(n,sid).notes=text; },null,true),
    addSubjAssess:(sid,type)=>apply(n=>{ const m=subjMeta(n,sid);
      m.assessments=[...m.assessments,{id:aid(),type,title:type==='summative'?'Benchmark assessment':'Check-in'}]; },'Assessment added to the subject'),
    editSubjAssess:(sid,aid2,patch)=>apply(n=>{ const m=subjMeta(n,sid);
      m.assessments=m.assessments.map(a=>a.id===aid2?{...a,...patch}:a); },null,true),
    removeSubjAssess:(sid,aid2)=>apply(n=>{ const m=subjMeta(n,sid);
      m.assessments=m.assessments.filter(a=>a.id!==aid2); },'Removed'),
  }),[apply]);

  const snapNav=()=>{ nav.current.push({openUnit,view,expanded,sel:[...sel],insights,wall,
    scrollY:(document.scrollingElement||document.documentElement).scrollTop,
    tl:{...(window.__phTLMem||{})}});
    if(nav.current.length>30) nav.current.shift(); };
  const goBack=()=>{
    const s=nav.current.pop();
    if(!s){ setOpenUnit(null); setSel([]); setExpanded(null); setInsights(false); return; }
    const m=window.__phTLMem=window.__phTLMem||{};
    Object.keys(m).forEach(k=>delete m[k]); Object.assign(m,s.tl);
    setOpenUnit(s.openUnit); setView(s.view); setExpanded(s.expanded); setSel(s.sel); setInsights(s.insights); setWall(s.wall||null);
    setTimeout(()=>{ (document.scrollingElement||document.documentElement).scrollTop=s.scrollY; },120);
  };
  useEffect(()=>{ try{ if(window.parent&&window.parent!==window) window.parent.postMessage({type:'cc-hub-ready'},'*'); }catch(e){} },[]);
  const goToLesson=(uid,lid)=>{ snapNav(); setOpenUnit(uid); setView('strip'); setExpanded(lid); setSel([]); };
  useEffect(()=>{ const h=(e)=>{ const d=e.data||{}; if(d.type!=='cc-open-unit') return;
    const nm=String(d.name||'').trim().toLowerCase(); const uid=d.uid||null; const sid=String(d.sid||'').trim().toLowerCase();
    const live=state.units.filter(x=>!x.archived);
    const u=(uid&&state.units.find(x=>x.id===uid))
      || (nm&&live.find(x=>(x.name||'').trim().toLowerCase()===nm))
      || (nm&&live.find(x=>(x.name||'').trim().toLowerCase().indexOf(nm)===0))
      || (nm&&live.find(x=>nm.indexOf((x.name||'').trim().toLowerCase())===0))
      || (sid&&live.find(x=>String(x.sid).toLowerCase()===sid&&x.startSlot<=PW.TODAY_SLOT&&x.endSlot>=PW.TODAY_SLOT))
      || (sid&&live.find(x=>String(x.sid).toLowerCase()===sid));
    if(u){ setOpenUnit(u.id); setView('strip'); if(d.lid) setExpanded(d.lid); } };
    window.addEventListener('message',h); return ()=>window.removeEventListener('message',h); },[state]);
  window.__phSettings=settings;
  window.__phSetUiLevel=(v)=>update('uiLevel',v);
  const hits=query?state.units.reduce((a,u)=>a+u.lessons.filter(l=>(l.title+' '+l.objective+' '+u.name+' '+l.std).toLowerCase().includes(query.toLowerCase())).length,0):0;
  const u=state.units.find(x=>x.id===openUnit)||null;

  return <div className="ph-app" data-bg={settings.bg} data-scope={scope} data-ui={settings.uiLevel||'simple'} data-embed={EMBED?'1':undefined} data-bare={BARE?'1':undefined}>
    <div className="ph-bg"></div>
    {!EMBED && <PHTop scope={scope} setScope={setScope} query={query} setQuery={setQuery} hits={hits} onCog={()=>setCog(true)}/>}
    {scope==='team' && <div className="ph-teambar">{I.warn} Heads up — you are in the team’s shared plan. Changes here affect everyone.</div>}
    <div className="ph-scroll">
      <div className="ph-page">
        {!BARE && <window.PHUnits.Timeline state={state} dated={settings.dated} query={query}
              onOpenUnit={(id2,v2)=>{ snapNav(); setOpenUnit(id2); if(v2) setView(v2); }} onOpenLesson={goToLesson}
              onFocusNew={(uid,lid)=>setFocus({uid,lid})} openWall={setWall} actions={actions}
              sel={sel} setSel={setSel} expanded={expanded} setExpanded={setExpanded}/>}
        {BARE && !u && <div className="ph-bareload">Opening planner…</div>}
        {u && window.PHWorkspace && <window.PHWorkspace state={state} uid={u.id} dated={settings.dated} actions={actions}
              lid={view==='strip'?expanded:null}
              tab0={({strip:'lessons',table:'refine',assess:'assessments',design:'unitplan'})[view]||'lessons'}
              onClose={()=>{ if(BARE){ try{ window.parent.postMessage({type:'cc-close-unitpop'},'*'); }catch(e){} } else goBack(); }}/>}
      </div>
    </div>
    {focus && window.PHWorkspace && (()=>{ const fu=state.units.find(x=>x.id===focus.uid); const fl=fu&&fu.lessons.find(x=>x.id===focus.lid);
      if(!fu) return null;
      return <window.PHWorkspace state={state} uid={fu.id} lid={fl?fl.id:null} dated={settings.dated} actions={actions} onClose={()=>setFocus(null)}/>; })()}
    {false && (()=>{ const fu=state.units.find(x=>x.id===focus.uid); const fl=fu&&fu.lessons.find(x=>x.id===focus.lid);
      if(!fu||!fl) return null;
      const E=window.PHUnits.Editor;
      return <React.Fragment>
        <div className="ph-pop-scrim" onClick={()=>setFocus(null)}></div>
        <div className="ph-misspanel ph-focuspop" data-screen-label="Hub — Focus planner" role="dialog" aria-label="Plan lesson">
          <div className="ph-panel-h">
            <h3><span className="fdot" style={{background:cv(DS.SUBJECTS[fu.sid].c)}}></span>{fl.title||'New lesson'} <KindTag level="lesson"/> <span className="fu">· {fu.name} <KindTag level="unit"/> · {settings.dated?fl.date:('#'+(fu.lessons.indexOf(fl)+1))}</span></h3>
            <button className="ph-panel-x" title="Close" onClick={()=>setFocus(null)}>{I.x}</button>
          </div>
          <div className="ph-focusgrid">
            <div className="ph-focusrail" ref={el=>{ if(el&&!el.__scrolled){ el.__scrolled=true; const cur=el.querySelector('.fr-l.on'); if(cur){ el.scrollTop=Math.max(0,cur.offsetTop-el.clientHeight/2+20); } } }}>
              {state.units.filter(x=>x.sid===fu.sid&&!x.archived).map(u2=><div key={u2.id} className="fr-unit">
                <div className={'fr-uh'+(u2.id===fu.id?' cur':'')}>{u2.name}</div>
                {u2.lessons.map((l2,i2)=><button key={l2.id} className={'fr-l'+(l2.id===fl.id?' on':'')} title={'Plan '+(l2.title||'Untitled')}
                  onClick={()=>setFocus({uid:u2.id,lid:l2.id})}>
                  <i className={'st-'+l2.status}></i><span className="n">{i2+1}</span><span className="t">{l2.title||'Untitled'}</span>
                </button>)}
              </div>)}
            </div>
            <div className="ph-focusmain">
              <E u={fu} l={fl} dated={settings.dated} actions={actions} openWall={(s)=>{ setFocus(null); setWall(s); }}/>
              <div className="ph-focusfoot">
                <span className="dfl">Open the {DS.label('unit',false).toLowerCase()}:</span>
                {[['strip','Plan'],['table','Refine'],['assess','Assessments'],['design','Design']].map(([k,lab])=>
                  <button key={k} title={'Open '+fu.name+' — '+lab} onClick={()=>{ setFocus(null); snapNav(); setOpenUnit(fu.id); setView(k); }}>{lab}</button>)}
              </div>
            </div>
          </div>
        </div>
      </React.Fragment>; })()}
    {wall && <window.PHMore.WallOverlay state={state} scope={wall} dated={settings.dated}
      onOpenLesson={(uid,lid)=>{ setWall(null); goToLesson(uid,lid); }} onClose={()=>setWall(null)}/>}
    {toast && <div className="ph-toast" key={toast.key}>
      <span className="lb">{toast.label}</span>
      <button className="un" onClick={undo}>Undo</button>
      <button className="x" title="Dismiss" onClick={()=>setToast(null)}>{I.x}</button>
    </div>}
    {cog && <PHSettings settings={settings} update={update} onClose={()=>setCog(false)}/>}
    {window.PHComposer && <window.PHComposer state={state} actions={actions} dated={settings.dated}/>}
    {window.PHResMenu && <window.PHResMenu/>}
  </div>;
}
window.PHApp=App;
})();
