/* Planner Hub v2 — document surfaces: Lesson Planner (multi-pane) + Unit Planner
   (Overview / Lessons / Standards / Resources). Frame B. Customizable tabs.
   window.HubPlanner = { Lesson, Unit }  — rendered inside the hub shell. */
(function(){
const { useState, useRef, useEffect } = React;
const DS = window.DS;
const cv = (x)=> (typeof x==='string' && x.startsWith('--')) ? `var(${x})` : x;

const I = {
  dots:<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>,
  teach:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4l14 8-14 8z" fill="currentColor"/></svg>,
  plus:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  check:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>,
  chev:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>,
  gear:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.2A1.6 1.6 0 0 0 6.8 19l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H2a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 5 6.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 11 4.6V4a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H22a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z"/></svg>,
  open:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M8 7h9v9"/></svg>,
  x:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>,
  chevL:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>,
  chevR:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>,
  grid:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/></svg>,
  list:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>,
};

const RESCOLORS = { Slides:'--subj-1', Worksheet:'--subj-10', Image:'--subj-13', Doc:'--subj-7', Video:'--subj-3', Link:'--subj-11' };

function statusMeta(st){
  return ({
    done:{label:'Done',tk:'--done',tint:'--done-tint'},
    now:{label:'In class now',tk:'--progress',tint:'--progress-tint'},
    upcoming:{label:'Upcoming',tk:'--idle',tint:'--idle-tint'},
    idle:{label:'Not started',tk:'--idle',tint:'--idle-tint'},
  })[st] || {label:'Not started',tk:'--idle',tint:'--idle-tint'};
}
function Badge({st,label}){ const m=statusMeta(st); return <span className="ph-badge" style={{background:cv(m.tint),color:cv(m.tk)}}>{label||m.label}</span>; }

/* small dropdown menu (More) */
function More({items}){
  const [open,setOpen]=useState(false); const ref=useRef(null);
  useEffect(()=>{ if(!open) return; const h=e=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown',h); return ()=>document.removeEventListener('mousedown',h); },[open]);
  return <span className="ph-menu" ref={ref}>
    <button className="ph-rowmore" title="More" onClick={()=>setOpen(o=>!o)}>{I.dots}</button>
    {open && <div className="ph-menupop" style={{right:0,left:'auto'}} onMouseLeave={()=>setOpen(false)}>
      {items.map((it,i)=> it.div ? <div key={i} className="ph-popdiv" style={{height:1,background:'var(--ph-hairline)',margin:'5px 0'}}/> :
        <button key={i} onClick={()=>{setOpen(false);it.fn&&it.fn();}} style={it.danger?{color:'var(--danger)'}:undefined}>{it.label}</button>)}
    </div>}
  </span>;
}

/* tab bar with working overflow "More" dropdown */
function DocTabs({tabs, active, onPick, optional, visible, setVisible}){
  const [more,setMore]=useState(false); const [pos,setPos]=useState(null); const ref=useRef(null);
  useEffect(()=>{ if(!more) return; const h=e=>{ if(ref.current&&!ref.current.contains(e.target)) setMore(false); }; document.addEventListener('mousedown',h); return ()=>document.removeEventListener('mousedown',h); },[more]);
  const shown = tabs;
  const hidden = [];
  const moreActive = hidden.some(t=>t.k===active);
  const openMore=(e)=>{ const r=e.currentTarget.getBoundingClientRect(); setPos({x:Math.min(r.left,window.innerWidth-220), y:r.bottom+6}); setMore(m=>!m); };
  const pick=(k)=>{ if(setVisible) setVisible(v=>v&&v.includes(k)?v:[...(v||[]),k]); onPick(k); setMore(false); };
  return <div className="ph-doctabnav">
    {shown.map(t=> <button key={t.k} className={'ph-navitem'+(active===t.k?' on':'')} onClick={()=>onPick(t.k)}>{t.label}</button>)}
    {hidden.length>0 && <span className="ph-menu ph-tabgear" ref={ref}>
      <button className={'ph-navitem'+(moreActive?' on':'')} onClick={openMore}>More <span style={{fontSize:9,opacity:.6}}>▾</span></button>
      {more && pos && ReactDOM.createPortal(<div className="ph-menupop ph-moremenu" style={{position:'fixed',left:pos.x,top:pos.y,right:'auto',zIndex:400}}>
        {hidden.map(t=> <button key={t.k} className={active===t.k?'on':''} onClick={()=>pick(t.k)}>{t.label}</button>)}
      </div>, document.body)}
    </span>}
  </div>;
}

/* ======================= LESSON PLANNER ======================= */
const FLOW = [
  {k:'target', n:'Learning target', ph:'State the objective in student-friendly “I can…” language.'},
  {k:'intro', n:'Introduction / hook', ph:'How will you activate prior knowledge and frame today’s skill?'},
  {k:'model', n:'Model (I do)', ph:'Demonstrate the strategy with a worked example and think-aloud.'},
  {k:'guided', n:'Guided practice (we do)', ph:'Work a problem together; check for understanding.'},
  {k:'independent', n:'Independent (you do)', ph:'Students apply the skill on their own; circulate and confer.'},
  {k:'assessment', n:'Assessment / exit ticket', ph:'How will you know they got it? Capture the evidence.'},
  {k:'homework', n:'Homework / extension', ph:'Optional practice or an extension for early finishers.'},
];

const FLOW_PRESETS = {
  'Standard lesson': FLOW,
  'Gradual release': [
    {k:'warm',n:'Warm-up',ph:'Activate prior knowledge and set the purpose.'},
    {k:'ido',n:'I do — Model',ph:'Demonstrate the strategy with a think-aloud.'},
    {k:'wedo',n:'We do — Guided',ph:'Work a problem together; check for understanding.'},
    {k:'youdo',n:'You do — Independent',ph:'Students apply the skill on their own.'},
    {k:'exit',n:'Exit ticket',ph:'Capture quick evidence of learning.'},
  ],
  '5E inquiry': [
    {k:'engage',n:'Engage',ph:'Spark curiosity and surface prior ideas.'},
    {k:'explore',n:'Explore',ph:'Hands-on investigation before the explanation.'},
    {k:'explain',n:'Explain',ph:'Formalize the concept and vocabulary.'},
    {k:'elaborate',n:'Elaborate',ph:'Apply the idea to a new context.'},
    {k:'evaluate',n:'Evaluate',ph:'Assess understanding.'},
  ],
  'Reading workshop': [
    {k:'mini',n:'Mini-lesson',ph:'Short, focused teaching point.'},
    {k:'work',n:'Independent reading / work',ph:'Students practice; you confer.'},
    {k:'confer',n:'Conferring',ph:'Targeted 1:1 or small-group check-ins.'},
    {k:'share',n:'Share',ph:'Students share their thinking.'},
  ],
};

/* tiny "tag a resource to this section" picker */
function PHTagAdd({ untagged, onAdd }){
  const [open,setOpen]=useState(false); const ref=useRef(null);
  useEffect(()=>{ if(!open) return; const h=e=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown',h); return ()=>document.removeEventListener('mousedown',h); },[open]);
  return <span className="ph-tagadd" ref={ref}>
    <button className="ph-tagaddbtn" onClick={()=>setOpen(o=>!o)}>{I.plus}Tag resource</button>
    {open && <div className="ph-tagpop">
      {untagged.length===0 && <div className="ph-tagempty">All resources tagged</div>}
      {untagged.map(r=><button key={r.id} className="ph-tagrow" onClick={()=>{ onAdd(r.id); setOpen(false); }}><span className="ic" style={{background:cv(RESCOLORS[r.type]||'--subj-9')}}>{(r.type||'·')[0]}</span>{r.label}</button>)}
    </div>}
  </span>;
}

/* formatting bar — operates on the currently-focused rich editor via execCommand */
const HL_COLORS=['#FFE9A8','#BDE8C4','#BFE0FF','#FAC8DC','#E4D2FB'];
function PHFmtBar(){
  const [hl,setHl]=useState(false);
  const cmd=(c,v)=>(e)=>{ e.preventDefault(); try{document.execCommand('styleWithCSS',false,true);}catch(_){} document.execCommand(c,false,v); };
  const highlight=(color)=>(e)=>{ e.preventDefault(); try{document.execCommand('styleWithCSS',false,true);}catch(_){} if(!document.execCommand('hiliteColor',false,color)) document.execCommand('backColor',false,color); setHl(false); };
  const link=(e)=>{ e.preventDefault(); const u=prompt('Link URL:'); if(u) document.execCommand('createLink',false,/^https?:/.test(u)?u:'https://'+u); };
  return <div className="ph-fmtbar" onMouseDown={e=>e.preventDefault()}>
    <button title="Bold" onMouseDown={cmd('bold')}><b>B</b></button>
    <button title="Italic" onMouseDown={cmd('italic')}><i>I</i></button>
    <button title="Underline" onMouseDown={cmd('underline')}><u>U</u></button>
    <span className="ph-hlwrap">
      <button title="Highlight" onMouseDown={(e)=>{ e.preventDefault(); setHl(h=>!h); }}><span className="ph-fmthl">H</span></button>
      {hl && <span className="ph-hlpop" onMouseDown={e=>e.preventDefault()}>
        {HL_COLORS.map(c=><button key={c} className="ph-hlsw" style={{background:c}} onMouseDown={highlight(c)} title="Highlight"/>)}
        <button className="ph-hlsw ph-hlnone" onMouseDown={(e)=>{ e.preventDefault(); try{document.execCommand('styleWithCSS',false,true);}catch(_){} document.execCommand('hiliteColor',false,'transparent'); setHl(false); }} title="Remove highlight">{'×'}</button>
      </span>}
    </span>
    <button title="Bulleted list" onMouseDown={cmd('insertUnorderedList')}>{'•'}</button>
    <button title="Numbered list" onMouseDown={cmd('insertOrderedList')}>1.</button>
    <button title="Heading" onMouseDown={(e)=>{ e.preventDefault(); document.execCommand('formatBlock',false,'H3'); }}>H</button>
    <select className="ph-fmtfont" title="Font" onMouseDown={e=>e.stopPropagation()} onChange={(e)=>{ if(e.target.value)document.execCommand('fontName',false,e.target.value); e.target.selectedIndex=0; }} defaultValue=""><option value="" disabled>Aa</option><option value="var(--font-sans)">Sans</option><option value="var(--font-display-sm)">Display</option><option value="Georgia, serif">Serif</option><option value="var(--font-mono)">Mono</option></select>
    <select className="ph-fmtsize" title="Size" onMouseDown={e=>e.stopPropagation()} onChange={(e)=>{ if(e.target.value)document.execCommand('fontSize',false,e.target.value); e.target.selectedIndex=0; }} defaultValue=""><option value="" disabled>Size</option><option value="2">S</option><option value="3">M</option><option value="5">L</option><option value="6">XL</option></select>
    <button title="Add link" onMouseDown={link}>{'🔗'}</button>
    <button title="Clear formatting" onMouseDown={cmd('removeFormat')}>{'⌫'}</button>
  </div>;
}

function LessonDoc({ ctx, markEdited, onTeach, onPost, onOpenUnit, onOpenLesson }){
  const allTabs=[{k:'plan',label:'Plan'},{k:'flow',label:'Flow'},{k:'resources',label:'Resources',optional:true},{k:'support',label:'Support',optional:true},{k:'stats',label:'Stats',optional:true},{k:'notes',label:'Notes',optional:true}];
  const optional=allTabs.filter(t=>t.optional);
  const [visible,setVisible]=useState(()=>{ try{ return JSON.parse(localStorage.getItem('cc_hub_lesstabs'))||['resources','support']; }catch(e){ return ['resources','support']; } });
  useEffect(()=>{ try{ localStorage.setItem('cc_hub_lesstabs',JSON.stringify(visible)); }catch(e){} },[visible]);
  const [tab,setTab]=useState('plan');
  const [flowK,setFlowK]=useState('target');
  const _lk='cc_hub_ld_'+(ctx.lesson.id||ctx.lesson.title);
  const [flow,setFlow]=useState(()=>{ try{ const v=JSON.parse(localStorage.getItem(_lk+'_flow')); if(v&&v.steps&&v.steps.length) return v; }catch(e){} return {name:'Standard lesson',steps:FLOW.map(f=>({...f}))}; });
  const [pbody,setPbody]=useState(()=>{ try{ return JSON.parse(localStorage.getItem(_lk+'_body'))||{}; }catch(e){ return {}; } });
  const [psecres,setPsecres]=useState(()=>{ try{ return JSON.parse(localStorage.getItem(_lk+'_res'))||{}; }catch(e){ return {}; } });
  const [custPresets,setCustPresets]=useState(()=>{ try{ return JSON.parse(localStorage.getItem('cc_hub_flowpresets'))||{}; }catch(e){ return {}; } });
  const allPresets={...FLOW_PRESETS,...custPresets};
  const persistFlow=(nf)=>{ setFlow(nf); try{ localStorage.setItem(_lk+'_flow',JSON.stringify(nf)); }catch(e){} markEdited&&markEdited(); };
  const persistBody=(nb)=>{ setPbody(nb); try{ localStorage.setItem(_lk+'_body',JSON.stringify(nb)); }catch(e){} };
  const persistRes=(nr)=>{ setPsecres(nr); try{ localStorage.setItem(_lk+'_res',JSON.stringify(nr)); }catch(e){} };
  const [pstds,setPstds]=useState(()=>{ try{ return JSON.parse(localStorage.getItem(_lk+'_stds'))||null; }catch(e){ return null; } });
  const persistStds=(n)=>{ setPstds(n); try{ localStorage.setItem(_lk+'_stds',JSON.stringify(n)); }catch(e){} markEdited&&markEdited(); };
  const [newStd,setNewStd]=useState({code:'',desc:''});
  const fSteps=flow.steps;
  const addStep=()=>{ const k='s'+Date.now().toString(36); persistFlow({name:'Custom',steps:[...fSteps,{k,n:'New section',ph:'Describe this part of the lesson.'}]}); setFlowK(k); };
  const delStep=(k)=>{ if(fSteps.length<=1)return; const ns=fSteps.filter(x=>x.k!==k); persistFlow({name:'Custom',steps:ns}); if(flowK===k&&ns[0]) setFlowK(ns[0].k); };
  const renameStep=(k,n)=>{ persistFlow({name:flow.name==='Standard lesson'?'Custom':flow.name,steps:fSteps.map(x=>x.k===k?{...x,n}:x)}); };
  const moveStep=(k,d)=>{ const i=fSteps.findIndex(x=>x.k===k),j=i+d; if(j<0||j>=fSteps.length)return; const ns=[...fSteps]; const tmp=ns[i]; ns[i]=ns[j]; ns[j]=tmp; persistFlow({name:flow.name,steps:ns}); };
  const loadPreset=(name)=>{ const p=allPresets[name]; if(!p)return; persistFlow({name,steps:p.map(f=>({...f}))}); setFlowK(p[0]?p[0].k:'target'); };
  const saveAsPreset=()=>{ const nm=(prompt('Save this lesson flow as a preset named:')||'').trim(); if(!nm)return; const cps={...custPresets,[nm]:fSteps.map(f=>({...f}))}; setCustPresets(cps); try{ localStorage.setItem('cc_hub_flowpresets',JSON.stringify(cps)); }catch(e){} persistFlow({name:nm,steps:fSteps}); };

  const L = ctx.lesson;
  const s = DS.SUBJECTS[L.subjectId];
  const det = DS.unitDetail(L.subjectId, ctx.uname, ctx.prog);
  const idx = Math.max(0, det.lessons.findIndex(x=>x.title===L.title));
  const lessonNo = (idx>=0?idx:0)+1;
  const status = L.status || (idx < det.taughtN ? 'done' : 'upcoming');
  const res = DS.resourcesFor(L);
  const dur = (DS.toMin(L.end)-DS.toMin(L.start))||48;
  const day = DS.DAYS[L.dayIdx!=null?L.dayIdx:2];
  const stds = det.standards;

  const onEdit = ()=>markEdited&&markEdited();

  const head = (
    <div className="ph-dochead">
      <div className="ph-dochead-in">
        <div className="ph-kicker">Lesson Planner</div>
        <div className="ph-crumb">
          <button onClick={()=>onOpenUnit&&onOpenUnit(ctx)}>{s.label}</button><span className="sep">/</span>
          <button onClick={()=>onOpenUnit&&onOpenUnit(ctx)}>{ctx.uname}</button><span className="sep">/</span>
          <span className="cur">{L.title}</span>
        </div>
        <div className="ph-doch-row">
          <div className="ph-doch-l">
            <div className="ph-doctitle"><span className="rail" style={{background:cv(s.c)}}/>{L.title}</div>
            <div className="ph-docmeta">
              <Badge st={status} label={status==='done'?'Taught '+(det.lessons[idx]&&det.lessons[idx].date||''):('Scheduled '+day.short+' '+DS.fmt(L.start))}/>
              <span className="sep">·</span>{DS.label('lesson')} {lessonNo} of {det.total}
              <span className="sep">·</span><span className="ph-tag"><span className="d" style={{background:cv(s.c)}}/>{stds[idx%stds.length]?stds[idx%stds.length].code:L.std}</span>
              <span className="sep">·</span>{dur} min
            </div>
          </div>
          <div className="ph-doch-actions">
            <button className="ph-btn ghost sm" onClick={()=>onPost&&onPost(L)}>Resource wall</button>
            <button className="ph-btn primary sm" onClick={()=>onTeach&&onTeach(L)}>{I.teach}Teach</button>
            <More items={[{label:'Duplicate'},{label:'Reschedule'},{label:'Mark taught'},{div:true},{label:'Archive',danger:true}]}/>
          </div>
        </div>
        <DocTabs tabs={allTabs} active={tab} optional={optional} visible={visible}
          onPick={(k)=>{ if(k!=='__more') setTab(k); }} setVisible={setVisible}/>
      </div>
    </div>
  );

  const sectionContent = (fk)=>{
    const f = fSteps.find(x=>x.k===fk)||fSteps[0];
    const seed = pbody[fk]!=null ? pbody[fk] : (fk==='target'?(L.objective||''):'');
    const tagged=(psecres[fk]||[]).map(id=>res.find(r=>r.id===id)).filter(Boolean);
    const untagged=res.filter(r=>!(psecres[fk]||[]).includes(r.id));
    return <div className="ph-pane-center" key={fk}>
      <input className="ph-sectitle-edit" value={f.n} onChange={e=>renameStep(fk,e.target.value)} placeholder="Section name…" />
      <div className="ph-secsub">{f.ph}</div>
      <div className="ph-field">
        <div className="ph-fieldlbl">Plan</div>
        <PHFmtBar/>
        <div className="ph-edit ph-edit-rich" contentEditable suppressContentEditableWarning data-ph="Write this section — type, format, add links…" dangerouslySetInnerHTML={{__html:seed}} onBlur={e=>persistBody({...pbody,[fk]:e.currentTarget.innerHTML})} />
      </div>
      <div className="ph-field">
        <div className="ph-fieldlbl">Teacher notes</div>
        <PHFmtBar/>
        <div className="ph-edit ph-edit-rich" contentEditable suppressContentEditableWarning data-ph="Reminders, grouping, timing…" dangerouslySetInnerHTML={{__html:pbody[fk+':n']||''}} onBlur={e=>persistBody({...pbody,[fk+':n']:e.currentTarget.innerHTML})} />
      </div>
      <div className="ph-field">
        <div className="ph-fieldlbl">Resources for this section</div>
        <div className="ph-secres">
          {tagged.map(r=><span key={r.id} className="ph-secrestag"><span className="ic" style={{background:cv(RESCOLORS[r.type]||'--subj-9')}}>{(r.type||'·')[0]}</span><span className="lbl" onClick={()=>r.url&&window.open(r.url,'_blank','noopener')}>{r.label}</span><button title="Untag" onClick={()=>persistRes({...psecres,[fk]:(psecres[fk]||[]).filter(x=>x!==r.id)})}>{'×'}</button></span>)}
          <PHTagAdd untagged={untagged} onAdd={(id)=>persistRes({...psecres,[fk]:[...(psecres[fk]||[]),id]})} />
          <button className="ph-tagaddbtn ph-tagnew" onClick={()=>onPost&&onPost(L)}>{I.plus}New resource</button>
        </div>
      </div>
    </div>;
  };

  return <div className="ph-doc" style={{'--dc':cv(s.c)}}>
    {head}
    {tab==='flow' && <div className="ph-panes">
      <nav className="ph-pane-rail">
        <div className="ph-railh">Lesson flow{flow.name?<span className="ph-railh-name">{flow.name}</span>:null}</div>
        {fSteps.map((f,i)=>(
          <div key={f.k} className={'ph-flowitem'+(flowK===f.k?' on':'')}>
            <button className="ph-flowitem-main" onClick={()=>setFlowK(f.k)}><span className="num">{i+1}</span><span className="fl">{f.n}</span></button>
            <span className="ph-flowedit">
              <button title="Move up" onClick={()=>moveStep(f.k,-1)} disabled={i===0}>{'↑'}</button>
              <button title="Move down" onClick={()=>moveStep(f.k,1)} disabled={i===fSteps.length-1}>{'↓'}</button>
              <button title="Delete section" onClick={()=>delStep(f.k)}>{'×'}</button>
            </span>
          </div>
        ))}
        <button className="ph-flowadd" onClick={addStep}>{I.plus}Add section</button>
        <div className="ph-flowpreset">
          <select value={allPresets[flow.name]?flow.name:''} onChange={e=>e.target.value&&loadPreset(e.target.value)}>
            <option value="">Load a preset…</option>
            {Object.keys(allPresets).map(n=><option key={n} value={n}>{n}</option>)}
          </select>
          <button onClick={saveAsPreset}>Save as preset</button>
        </div>
      </nav>
      {sectionContent(flowK)}
      <aside className="ph-pane-insp">
        <div className="ph-inspsec">
          <div className="ph-insph">Standards</div>
          {stds.map(st=>(<div className="ph-stdrow" key={st.code}><span className="ph-stdcode">{st.code}</span><span className="ph-stddesc">{st.desc}</span></div>))}
        </div>
        <div className="ph-inspsec">
          <div className="ph-insph">Resources</div>
          {res.slice(0,4).map(r=>(<div className="ph-resrow" key={r.id}><span className="ic" style={{background:cv(RESCOLORS[r.type]||'--subj-9')}}>{(r.type||'·')[0]}</span>{r.label}</div>))}
          <button className="ph-btn ghost sm" style={{marginTop:10}} onClick={()=>onPost&&onPost(L)}>{I.plus}Add resource</button>
        </div>
        <div className="ph-inspsec">
          <div className="ph-insph">Differentiation</div>
          <div className="ph-edit" contentEditable suppressContentEditableWarning data-ph="Supports & extensions…" onInput={onEdit}></div>
        </div>
      </aside>
    </div>}

    {tab==='plan' && <div className="ph-page ph-flowall">
      <div className="ph-flowallhead">
        <div className="ph-sectitle">All sections · {flow.name}</div>
        <div className="ph-flowpreset">
          <select value={allPresets[flow.name]?flow.name:''} onChange={e=>e.target.value&&loadPreset(e.target.value)}><option value="">Load a preset…</option>{Object.keys(allPresets).map(n=><option key={n} value={n}>{n}</option>)}</select>
          <button onClick={saveAsPreset}>Save as preset</button>
        </div>
      </div>
      {fSteps.map((f,i)=>{ const seed=pbody[f.k]!=null?pbody[f.k]:(f.k==='target'?(L.objective||''):''); const tagged=(psecres[f.k]||[]).map(id=>res.find(r=>r.id===id)).filter(Boolean); const untagged=res.filter(r=>!(psecres[f.k]||[]).includes(r.id)); return (
        <div className="ph-flowallsec" key={f.k}>
          <div className="ph-flowallnum">{i+1}</div>
          <div className="ph-flowallbody">
            <input className="ph-sectitle-edit" value={f.n} onChange={e=>renameStep(f.k,e.target.value)} />
            <PHFmtBar/>
            <div className="ph-edit ph-edit-rich" contentEditable suppressContentEditableWarning data-ph={f.ph} dangerouslySetInnerHTML={{__html:seed}} onBlur={e=>persistBody({...pbody,[f.k]:e.currentTarget.innerHTML})} />
            <div className="ph-secres"><span className="ph-secreslbl">Resources:</span>
              {tagged.map(r=><span key={r.id} className="ph-secrestag"><span className="ic" style={{background:cv(RESCOLORS[r.type]||'--subj-9')}}>{(r.type||'·')[0]}</span><span className="lbl" onClick={()=>r.url&&window.open(r.url,'_blank','noopener')}>{r.label}</span><button onClick={()=>persistRes({...psecres,[f.k]:(psecres[f.k]||[]).filter(x=>x!==r.id)})}>{'×'}</button></span>)}
              <PHTagAdd untagged={untagged} onAdd={(id)=>persistRes({...psecres,[f.k]:[...(psecres[f.k]||[]),id]})} />
              <button className="ph-tagaddbtn ph-tagnew" onClick={()=>onPost&&onPost(L)}>{I.plus}New resource</button>
            </div>
            <span className="ph-flowdel"><button title="Delete section" onClick={()=>delStep(f.k)}>{'×'} Remove section</button></span>
          </div>
        </div>
      ); })}
      <button className="ph-flowadd" onClick={addStep}>{I.plus}Add section</button>
    </div>}

    {tab==='resources' && <div className="ph-page">
      <div className="ph-list">
        <div className="ph-grouphead">Resources<span className="meta">{res.length} items</span></div>
        {res.map(r=>(<div className="ph-row" key={r.id} onClick={()=>onPost&&onPost(L)}>
          <span className="ic" style={{width:28,height:28,borderRadius:7,display:'grid',placeItems:'center',font:'700 10px/1 var(--font-sans)',color:'#fff',background:cv(RESCOLORS[r.type]||'--subj-9'),flex:'0 0 auto'}}>{(r.type||'·').slice(0,3).toUpperCase()}</span>
          <div className="main"><div className="t">{r.label}</div><div className="m">{r.type}</div></div>
          <div className="acts"><button className="ph-btn ghost sm">Open</button></div>
        </div>))}
      </div>
      {(()=>{ let lw=null; try{ lw=(JSON.parse(localStorage.getItem('cc_customwalls')||'[]')).find(w=>w.anchor==='lesson'&&w.lessonId===L.id); }catch(e){}
        if(!lw||!lw.layout) return null;
        const secCount=lw.layout.length, moreRes=lw.layout.slice(1).reduce((n,s)=>n+((s.items||[]).length),0);
        if(secCount<=1 && moreRes<=0) return null;
        return <button className="ph-linkedwall" onClick={()=>{ window.__openWallId=lw.id; onPost&&onPost(L); }} title={'Open “'+lw.name+'” in the Resource Wall'}>
          <span className="ph-lw-ic"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg></span>
          <span className="ph-lw-main"><b>{lw.name}</b><span>{secCount} sections · {moreRes} more resources</span></span>
          <span className="ph-lw-go">Open ›</span>
        </button>;
      })()}
      <button className="ph-btn ghost sm" style={{marginTop:14}} onClick={()=>onPost&&onPost(L)}>{I.plus}Add resource</button>
    </div>}

    {tab==='support' && <div className="ph-page">
      <div className="ph-difflbl">Differentiation</div>
      <div className="ph-difftiers">
        {[['su','Support','--subj-3'],['on','On level','--subj-10'],['ab','Extension','--subj-7']].map(([k,lab,col])=>(
          <div className="ph-difftier" key={k} style={{'--tier':'var('+col+')'}}>
            <div className="ph-difftier-h">{lab}</div>
            <PHFmtBar/>
            <div className="ph-edit ph-edit-rich" contentEditable suppressContentEditableWarning data-ph="Add steps, scaffolds, a checklist…" dangerouslySetInnerHTML={{__html:pbody['diff:'+k]||''}} onBlur={e=>persistBody({...pbody,['diff:'+k]:e.currentTarget.innerHTML})} />
          </div>
        ))}
      </div>
    </div>}

    {tab==='materials' && <div className="ph-page">
      <div className="ph-ovcard"><h4>Materials</h4>
        <PHFmtBar/>
        <div className="ph-edit ph-edit-rich" contentEditable suppressContentEditableWarning data-ph="What you need ready before class — make a checklist…" dangerouslySetInnerHTML={{__html:pbody['materials']||''}} onBlur={e=>persistBody({...pbody,['materials']:e.currentTarget.innerHTML})} />
      </div>
    </div>}

    {tab==='standards' && <div className="ph-page">
      <div className="ph-ovcard"><h4>Standards covered</h4>
        {(pstds||stds.map(x=>({code:x.code,desc:x.desc}))).map((st,i)=>(<div className="ph-stdrow ph-stdrow-edit" key={st.code+':'+i}><span className="ph-stdcode">{st.code}</span><span className="ph-stddesc">{st.desc}</span><button className="ph-stddel" title="Remove standard" onClick={()=>{ const base=pstds||stds.map(x=>({code:x.code,desc:x.desc})); persistStds(base.filter((_,j)=>j!==i)); }}>{I.x}</button></div>))}
        <div className="ph-stdadd">
          <input className="ph-stdcodein" value={newStd.code} onChange={e=>setNewStd(s=>({...s,code:e.target.value}))} placeholder="Code (e.g. RF.4.3.a)" />
          <input className="ph-stddescin" value={newStd.desc} onChange={e=>setNewStd(s=>({...s,desc:e.target.value}))} placeholder="Description" onKeyDown={e=>{ if(e.key==='Enter'&&newStd.code.trim()){ const base=pstds||stds.map(x=>({code:x.code,desc:x.desc})); persistStds([...base,{code:newStd.code.trim(),desc:newStd.desc.trim()}]); setNewStd({code:'',desc:''}); } }} />
          <button className="ph-btn ghost sm" disabled={!newStd.code.trim()} onClick={()=>{ const base=pstds||stds.map(x=>({code:x.code,desc:x.desc})); persistStds([...base,{code:newStd.code.trim(),desc:newStd.desc.trim()}]); setNewStd({code:'',desc:''}); }}>{I.plus}Add standard</button>
        </div>
      </div>
    </div>}

    {tab==='stats' && <div className="ph-page">
      <div className="ph-ovgrid">
        <div className="ph-ovcard"><h4>Pacing</h4><div className="ph-statusline"><span className="dot" style={{background:cv(det.pace==='On pace'?'--done':'--warn')}}/>{det.pace}</div></div>
        <div className="ph-ovcard"><h4>Duration</h4><div className="ph-statusline">{dur} min planned</div></div>
        <div className="ph-ovcard"><h4>Position</h4><div className="ph-statusline">{DS.label('lesson')} {lessonNo} of {det.total}</div></div>
      </div>
    </div>}

    {tab==='notes' && <div className="ph-page">
      <div className="ph-field"><div className="ph-fieldlbl">Lesson notes</div>
        <div className="ph-edit" contentEditable suppressContentEditableWarning data-ph="Anything to remember for next time…" style={{minHeight:160}} onInput={onEdit}></div></div>
    </div>}
  </div>;
}

/* ======================= UNIT PLANNER ======================= */
function UnitDoc({ ctx, markEdited, onTeach, onPost, onOpenLesson }){
  const allTabs=[{k:'overview',label:'Overview'},{k:'lessons',label:'Lessons'},{k:'standards',label:'Standards'},{k:'resources',label:'Resources',optional:true},{k:'notes',label:'Notes',optional:true}];
  const optional=allTabs.filter(t=>t.optional);
  const [visible,setVisible]=useState(()=>{ try{ return JSON.parse(localStorage.getItem('cc_hub_unittabs'))||['resources']; }catch(e){ return ['resources']; } });
  useEffect(()=>{ try{ localStorage.setItem('cc_hub_unittabs',JSON.stringify(visible)); }catch(e){} },[visible]);
  const [tab,setTab]=useState('overview');
  const onEdit=()=>markEdited&&markEdited();

  const det = DS.unitDetail(ctx.sid, ctx.uname, ctx.prog);
  const s = det.subject;
  const pct = Math.round(det.progress*100);
  const complete = det.progress>=1;
  const nextL = det.lessons.find(l=>!l.taught) || det.lessons[0];
  const RTYPES=['Slides','Worksheet','Anchor Chart','Video','Doc'];
  const unitRes = det.lessons.slice(0,6).flatMap((l,li)=> RTYPES.slice(0,(li%3)+1).map((tp)=>({type:tp,label:l.title.split(' · ')[0]+' — '+tp,lesson:l.title.split(' · ')[0]})) );
  const statusLine = complete
    ? `Completed · ${det.total} of ${det.total} lessons taught · ${det.covered} standards covered · Finished ${det.projectedFinish}`
    : `In progress · ${det.taughtN} of ${det.total} lessons taught · ${det.pace} · Projected finish ${det.projectedFinish}`;

  const head = (
    <div className="ph-dochead">
      <div className="ph-dochead-in">
        <div className="ph-kicker">Unit Planner</div>
        <div className="ph-crumb"><button>{DS.label('curriculum')}</button><span className="sep">/</span><button>{s.full}</button><span className="sep">/</span><span className="cur">{ctx.uname}</span></div>
        <div className="ph-doch-row">
          <div className="ph-doch-l">
            <div className="ph-doctitle"><span className="rail" style={{background:cv(s.c)}}/>{ctx.uname}</div>
            <div className="ph-docmeta"><span className="ph-tag"><span className="d" style={{background:cv(s.c)}}/>{s.full}</span><span className="sep">·</span>{statusLine}</div>
          </div>
          <div className="ph-doch-actions">
            <button className="ph-btn primary sm" onClick={()=>onOpenLesson&&onOpenLesson(nextL,ctx)}>{complete?'Review unit':'Open next lesson'}</button>
            <More items={[{label:'Edit sequence'},{label:'Duplicate unit'},{label:'Export'},{div:true},{label:'Archive',danger:true}]}/>
          </div>
        </div>
        <DocTabs tabs={allTabs} active={tab} optional={optional} visible={visible} onPick={(k)=>{ if(k!=='__more') setTab(k); }} setVisible={setVisible}/>
      </div>
    </div>
  );

  return <div className="ph-doc" style={{'--dc':cv(s.c)}}>
    {head}
    {tab==='overview' && <div className="ph-page">
      <div className="ph-ovcard" style={{marginBottom:16}}>
        <div className="ph-statusline" style={{fontWeight:600}}><span className="dot" style={{background:cv(complete?'--done':(det.pace==='On pace'?'--progress':'--warn'))}}/>{statusLine}</div>
        <div className="ph-bigbar"><i style={{width:pct+'%',background:cv(complete?'--done':s.c)}}/></div>
      </div>
      <div className="ph-ovgrid">
        <div className="ph-ovcard"><h4>Purpose</h4><div className="ph-ovtext">{det.summary}</div></div>
        <div className="ph-ovcard"><h4>Essential question</h4><div className="ph-ovtext">How does {ctx.uname.toLowerCase()} help us read, think, and communicate more precisely?</div></div>
      </div>
      <div className="ph-ovgrid" style={{marginTop:16}}>
        <div className="ph-ovcard"><h4>Standards · {det.covered}/{det.standards.length} covered</h4>
          {det.standards.map(st=>(<div className="ph-stdrow" key={st.code}><span className="ph-stdcode">{st.code}</span><span className="ph-stddesc">{st.desc}</span>{st.hits>0 && <span style={{marginLeft:'auto',color:'var(--done)',width:14}}>{I.check}</span>}</div>))}
        </div>
        <div className="ph-ovcard"><h4>Key assessments</h4>
          <div className="ph-resrow">Mid-unit check · {det.standards[1]?det.standards[1].code:''}</div>
          <div className="ph-resrow">End-of-unit assessment · {det.standards[det.standards.length-1]?det.standards[det.standards.length-1].code:''}</div>
          <div className="ph-resrow">Reflection · {det.total>0?'Lesson '+det.total:''}</div>
        </div>
      </div>
      <div className="ph-ovcard" style={{marginTop:16}}><h4>Lesson sequence</h4>
        <div className="ph-ovlist">
          {det.lessons.map((l,i)=>(<div className={'ph-ovlrow'+(l.taught?' taught':'')} key={l.id}>
            <span className="num">{l.taught?I.check:i+1}</span>
            <span className="t">{l.title}</span>
            <span className="dt">{l.taught?l.date:(l.reason||'Not scheduled')}</span>
            <button className="ph-btn ghost sm" onClick={()=>onOpenLesson&&onOpenLesson(l,ctx)}>Open</button>
          </div>))}
        </div>
      </div>
    </div>}

    {tab==='lessons' && <div className="ph-page">
      <div className="ph-list">
        <div className="ph-grouphead">{ctx.uname}<span className="meta">{det.taughtN}/{det.total} taught</span></div>
        {det.lessons.map((l,i)=>(<div className="ph-row" key={l.id} style={{borderLeftColor:cv(s.c),'--rc':cv(s.c)}} onClick={()=>onOpenLesson&&onOpenLesson(l,ctx)}>
          <span className="num" style={{width:24,height:24,borderRadius:'50%',display:'grid',placeItems:'center',font:'700 11px/1 var(--font-sans)',flex:'0 0 auto',background:l.taught?cv('--done-tint'):'var(--ph-glass)',color:l.taught?cv('--done'):'var(--ph-text-2)'}}>{l.taught?I.check:i+1}</span>
          <div className="main"><div className="t">{l.title}</div><div className="m">{l.std}<span className="sep">·</span>{l.taught?('Taught '+l.date):(l.reason||'Not scheduled')}</div></div>
          <Badge st={l.taught?'done':'upcoming'} label={l.taught?'Taught':'Upcoming'}/>
          <div className="acts"><button className="ph-btn ghost sm">Open</button></div>
        </div>))}
      </div>
    </div>}

    {tab==='standards' && <div className="ph-page">
      <div className="ph-list">
        <div className="ph-grouphead">Standards<span className="meta">{det.covered} covered · {det.gaps} gaps</span></div>
        {det.standards.map(st=>(<div className="ph-row" key={st.code}>
          <span className="ph-stdcode" style={{width:64}}>{st.code}</span>
          <div className="main"><div className="t" style={{fontWeight:500}}>{st.desc}</div></div>
          <Badge st={st.hits>0?'done':'idle'} label={st.hits>0?'Covered':'Gap'}/>
        </div>))}
      </div>
    </div>}

    {tab==='resources' && <div className="ph-page">
      <div className="ph-list">
        <div className="ph-grouphead">Resources<span className="meta">{unitRes.length} items</span></div>
        {unitRes.map((r,i)=>(<div className="ph-row" key={i} onClick={()=>onPost&&onPost()}>
          <span className="ic" style={{width:28,height:28,borderRadius:7,display:'grid',placeItems:'center',font:'700 10px/1 var(--font-sans)',color:'#fff',background:cv(RESCOLORS[r.type]||'--subj-9'),flex:'0 0 auto'}}>{r.type.slice(0,3).toUpperCase()}</span>
          <div className="main"><div className="t">{r.label}</div><div className="m">{r.type}<span className="sep"> · </span>{r.lesson}</div></div>
          <div className="acts"><button className="ph-btn ghost sm">Open</button></div>
        </div>))}
      </div>
      <button className="ph-btn ghost sm" style={{marginTop:14}} onClick={()=>onPost&&onPost()}>{I.plus}Add resource</button>
    </div>}

    {tab==='notes' && <div className="ph-page">
      <div className="ph-field"><div className="ph-fieldlbl">Unit notes</div><div className="ph-edit" contentEditable suppressContentEditableWarning data-ph="Reflections, adjustments for next year…" style={{minHeight:160}} onInput={onEdit}></div></div>
    </div>}
  </div>;
}

/* ======================= WALL VIEWER ======================= */
function ResThumb({ r }){
  if(r.type==='Image' && /photos\//.test(r.url)) return <div className="ph-resthumb" style={{backgroundImage:`url('${r.url}')`}}/>;
  if(r.type==='Video') return <div className="ph-resthumb" style={{background:'linear-gradient(150deg,#1C1B2E,#3A3950)'}}><span className="ph-resplay">{I.teach}</span><span className="ph-resdur">4:32</span></div>;
  const tk=RESCOLORS[r.type]||'--subj-9';
  const mark={Slides:'SLD',Worksheet:'WKST',Image:'IMG',Doc:'DOC',Link:'LINK'}[r.type]||'RES';
  return <div className="ph-resthumb" style={{background:`linear-gradient(150deg, color-mix(in oklab, ${cv(tk)} 92%, #15131f), color-mix(in oklab, ${cv(tk)} 58%, #15131f))`}}><span className="tmark">{mark}</span></div>;
}
function ResCard({ r, onOpen }){
  const tk=RESCOLORS[r.type]||'--subj-9';
  return <button className="ph-rescard" onClick={onOpen}><ResThumb r={r}/><span className="ph-resbody"><span className="ph-reslabel">{r.label}</span><span className="ph-restype" style={{color:cv(tk)}}>{r.type}</span></span></button>;
}
function resPreview(r){
  if(r.type==='Image') return /photos\//.test(r.url)
    ? <img className="ph-lbimg" src={r.url} alt={r.label}/>
    : <div className="ph-lbpaper"><div className="pt">{r.label}</div>{[88,72].map((w,i)=><div key={i} className="ln" style={{width:w+'%'}}/>)}</div>;
  if(r.type==='Video') return <div className="ph-lbvideo"><span className="pp">{I.teach}</span></div>;
  if(r.type==='Link'){ const tk=RESCOLORS.Link; return <div className="ph-lblink"><div className="fav" style={{background:cv(tk)}}>{(r.label[0]||'L').toUpperCase()}</div><div style={{fontWeight:700,marginBottom:6,color:'var(--ph-text)'}}>{r.label}</div><div className="dom">{r.url}</div></div>; }
  return <div className="ph-lbpaper"><div className="pt">{r.label}</div>{[94,86,96,70,90,62].map((w,i)=><div key={i} className="ln" style={{width:w+'%'}}/>)}</div>;
}
function Lightbox({ flat, idx, setIdx, onClose, onTeach, setToast }){
  const r=flat[idx];
  const prev=()=>setIdx(i=>Math.max(0,i-1)), next=()=>setIdx(i=>Math.min(flat.length-1,i+1));
  useEffect(()=>{ const k=e=>{ if(e.key==='Escape'){e.stopPropagation();onClose();} if(e.key==='ArrowLeft')prev(); if(e.key==='ArrowRight')next(); }; document.addEventListener('keydown',k,true); return ()=>document.removeEventListener('keydown',k,true); },[flat.length]);
  if(!r) return null;
  const tk=RESCOLORS[r.type]||'--subj-9';
  return <div className="ph-lb" onClick={onClose}>
    <div className="ph-lbframe" onClick={e=>e.stopPropagation()}>
      <div className="ph-lbtop">
        <span className="tg" style={{background:cv(tk)}}>{(r.type||'·').slice(0,3).toUpperCase()}</span>
        <span className="ph-lbtitle"><b>{r.label}</b><span>{r._sec?r._sec.title+' · ':''}{r.type}</span></span>
        <span className="ph-lbct">{idx+1} / {flat.length}</span>
        <button className="ph-iconbtn" title="Close" onClick={onClose}>{I.x}</button>
      </div>
      <div className="ph-lbstage">
        {flat.length>1 && idx>0 && <button className="ph-lbnav l" onClick={prev}>{I.chevL}</button>}
        {resPreview(r)}
        {flat.length>1 && idx<flat.length-1 && <button className="ph-lbnav r" onClick={next}>{I.chevR}</button>}
      </div>
      <div className="ph-lbbot">
        <button className="ph-btn ghost sm" onClick={()=>{ try{window.open(r.url,'_blank');}catch(e){} }}>{I.open}Open original</button>
        <button className="ph-btn ghost sm" onClick={()=>setToast&&setToast('Added to this lesson')}>{I.plus}Add to lesson</button>
        <span className="grow"/>
        <button className="ph-btn primary sm" onClick={()=>{ onClose(); onTeach&&onTeach(r._sec&&r._sec.lesson); }}>{I.teach}Send to board</button>
      </div>
    </div>
  </div>;
}
function WallDoc({ ctx, onPost, onTeach, setToast }){
  const { wall, sections }=ctx;
  const [layout,setLayout]=useState('grid');
  const [filter,setFilter]=useState('All');
  const [lbIdx,setLbIdx]=useState(null);
  const TYPES=['All','Slides','Worksheet','Image','Doc','Video','Link'];
  const total=sections.reduce((a,s)=>a+s.items.length,0);
  const flat=[]; sections.forEach(s=>s.items.forEach(r=>{ if(filter==='All'||r.type===filter) flat.push({...r,_sec:s}); }));
  const openRes=(r)=>{ const i=flat.findIndex(x=>x.id===r.id); setLbIdx(i<0?0:i); };
  return <div className="ph-doc">
    <div className="ph-dochead"><div className="ph-dochead-in">
      <div className="ph-kicker">Resource Wall</div>
      <div className="ph-crumb"><button onClick={onPost}>Resources</button><span className="sep">/</span><span className="cur">{wall.name}</span></div>
      <div className="ph-doch-row">
        <div className="ph-doch-l">
          <div className="ph-doctitle"><span className="rail" style={{background:'var(--accent)'}}/>{wall.name}</div>
          <div className="ph-docmeta">{wall.kind||'Wall'}<span className="sep">·</span>{sections.length} sections<span className="sep">·</span>{total} resources<span className="sep">·</span>{wall.anchor||'Custom'}</div>
        </div>
        <div className="ph-doch-actions">
          <button className="ph-btn ghost sm" onClick={onPost}>{I.open}Open full wall</button>
          <More items={[{label:'Present',fn:onPost},{label:'Share'},{label:'Duplicate'}]}/>
        </div>
      </div>
      <div className="ph-doctabnav" style={{marginTop:14,gap:12,alignItems:'center'}}>
        <div className="ph-chips">{TYPES.map(t=><button key={t} className="ph-chip" style={filter===t?{background:'var(--accent-50)',color:'var(--accent)'}:undefined} onClick={()=>setFilter(t)}>{t}</button>)}</div>
        <span className="ph-tabgear ph-seg"><button className={layout==='grid'?'on':''} title="Grid" onClick={()=>setLayout('grid')}>{I.grid}</button><button className={layout==='list'?'on':''} title="List" onClick={()=>setLayout('list')}>{I.list}</button></span>
      </div>
    </div></div>
    <div className="ph-page">
      {sections.map((s,si)=>{ const items=filter==='All'?s.items:s.items.filter(r=>r.type===filter); if(!items.length) return null; const sub=DS.SUBJECTS[s.sid]; return (
        <div className="ph-wallsec" key={si}>
          <div className="ph-wallsechead"><span className="d" style={{background:cv(sub.c)}}/><span className="nm">{s.title}</span><span className="su">{sub.label}</span><span className="ct">{items.length} resources</span></div>
          <div className={'ph-resgrid'+(layout==='list'?' list':'')}>{items.map(r=><ResCard key={r.id} r={r} onOpen={()=>openRes(r)}/>)}</div>
        </div>
      ); })}
      {!total && <div className="ph-empty"><div className="ttl">Empty wall</div><div className="ds">No resources here yet.</div></div>}
    </div>
    {lbIdx!=null && <Lightbox flat={flat} idx={lbIdx} setIdx={setLbIdx} onClose={()=>setLbIdx(null)} onTeach={onTeach} setToast={setToast}/>}
  </div>;
}

window.HubPlanner = { Lesson: LessonDoc, Unit: UnitDoc, Wall: WallDoc };
})();
