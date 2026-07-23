/* Lesson-planning page — tabbed tools (Objective/Standards/Notes/Differentiation/
   Resources) + an expandable, richly-editable lesson flow. Each flow section opens
   into a formatted body (a formatting bar appears at the bottom while editing) and
   can have resources tagged to it. Resources tab = gallery (thumbnails) or list.
   Persists per-lesson to localStorage. Tab treatment adapts per direction (A/B/C). */
(function(){
const { useState, useEffect, useRef, useCallback } = React;
const { SUBJECTS, fmt } = window.DS;
const cv = (x)=>`var(${x})`;
const resColor = (type)=>`var(${window.DS.RESTYPES[type]||'--subj-11'})`;

const PTOOLS = [
  { k:'objective', label:'Objective',      color:'--brand-500' },
  { k:'standards', label:'Standards',       color:'--done' },
  { k:'notes',     label:'Lesson notes',    color:'--subj-5-bright' },
  { k:'diff',      label:'Differentiation', color:'--subj-7-bright' },
  { k:'resources', label:'Resources',        color:'--subj-13-bright' },
  { k:'details',   label:'Details',         color:'--subj-9-bright' },
];

function PIcon({ k }){
  const p = {strokeWidth:2,strokeLinecap:'round',strokeLinejoin:'round',fill:'none',stroke:'currentColor',viewBox:'0 0 24 24'};
  if(k==='objective') return <svg {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>;
  if(k==='standards') return <svg {...p}><path d="M12 7c-1.5-1.2-3.5-2-6-2v13c2.5 0 4.5.8 6 2 1.5-1.2 3.5-2 6-2V5c-2.5 0-4.5.8-6 2Z"/><path d="M12 7v13"/></svg>;
  if(k==='notes')     return <svg {...p}><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M16 3v5h5M8 12h6M8 16h4"/></svg>;
  if(k==='diff')      return <svg {...p}><circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M8.2 7.4 15.5 11M8.2 16.6 15.5 13"/></svg>;
  if(k==='resources') return <svg {...p}><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h3.6l1.8 1.8h7.6A1.5 1.5 0 0 1 20 9.3v7.2A1.5 1.5 0 0 1 18.5 18h-13A1.5 1.5 0 0 1 4 16.5Z"/></svg>;
  if(k==='flow')      return <svg {...p}><path d="M4 6h16M4 12h16M4 18h10"/></svg>;
  if(k==='teach')     return <svg {...p}><path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none"/></svg>;
  if(k==='x')         return <svg {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>;
  if(k==='plus')      return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
  if(k==='back')      return <svg {...p}><path d="M15 18l-6-6 6-6"/></svg>;
  if(k==='chev')      return <svg {...p}><path d="M6 9l6 6 6-6"/></svg>;
  if(k==='film')      return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 15h18M8 4v16M16 4v16"/></svg>;
  if(k==='list')      return <svg {...p}><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>;
  if(k==='tag')       return <svg {...p}><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Z"/><circle cx="7.5" cy="7.5" r="1.3" fill="currentColor"/></svg>;
  if(k==='ext')       return <svg {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>;
  return null;
}

const stripICan = (s)=> (s||'').replace(/^I can\s+/i,'');
const KEY = (id)=>`cc_plan_v1_${id}`;

function seedPlan(lesson){
  return {
    objective: stripICan(lesson.objective),
    notes: '',
    diff: { support:'', onLevel:'', extension:'' },
    lessonRes: [],
    flow: [
      { t:'Warm-up',         m:5,  body:'', res:[] },
      { t:'Mini-lesson',     m:15, body:'', res:[] },
      { t:'Guided practice', m:15, body:'', res:[] },
      { t:'Exit ticket',     m:5,  body:'', res:[] },
    ],
    modified: false,
  };
}
function loadPlan(lesson){
  try{ const raw=localStorage.getItem(KEY(lesson.id)); if(raw){ const p={ ...seedPlan(lesson), ...JSON.parse(raw) };
    p.flow=(p.flow||[]).map(st=>({ body:'', res:[], ...st })); return p; } }catch(e){}
  return seedPlan(lesson);
}
function persist(id,plan){ try{ localStorage.setItem(KEY(id),JSON.stringify(plan)); }catch(e){} }

/* plain single/multi-line text (innerText) */
function Editable({ initial, onChange, placeholder, single, className }){
  const ref=useRef(null);
  useEffect(()=>{ if(ref.current && ref.current.innerText!==(initial||'')) ref.current.innerText = initial||''; },[]);
  return (
    <div ref={ref} className={'pl-edit '+(single?'single ':'')+(className||'')}
      contentEditable suppressContentEditableWarning data-ph={placeholder}
      onInput={(e)=>onChange(e.currentTarget.innerText)}
      onKeyDown={single?(e)=>{ if(e.key==='Enter'){ e.preventDefault(); e.currentTarget.blur(); } }:undefined} />
  );
}

/* rich text (innerHTML) — raises the formatting bar while focused */
function RichEditable({ initialHtml, onChange, onFocusBar, onBlurBar, placeholder, className }){
  const ref=useRef(null);
  useEffect(()=>{ if(ref.current && ref.current.innerHTML!==(initialHtml||'')) ref.current.innerHTML = initialHtml||''; },[]);
  return (
    <div ref={ref} className={'pl-edit pl-rich '+(className||'')}
      contentEditable suppressContentEditableWarning data-ph={placeholder}
      onFocus={onFocusBar} onBlur={onBlurBar}
      onInput={(e)=>onChange(e.currentTarget.innerHTML)} />
  );
}

function ResThumb({ r, onOpen, onTag, tagged }){
  const isImg = r.type==='Image';
  return (
    <div className="pl-gcard">
      <div className="pl-gthumb" style={isImg?{backgroundImage:`url('${r.url}')`}:{background:`linear-gradient(140deg, ${resColor(r.type)}, color-mix(in oklab, ${resColor(r.type)} 60%, #15131f))`}}>
        {!isImg && <span className="pl-gtype">{r.type}</span>}
        <div className="pl-gactions">
          <button title="Open in a new tab" onClick={()=>window.open(r.url,'_blank','noopener')}><PIcon k="ext"/></button>
          {onTag && <button title="Tag to a lesson step" onClick={()=>onTag(r)}><PIcon k="tag"/></button>}
        </div>
      </div>
      <div className="pl-gmeta"><span className="pl-respill" style={{background:`color-mix(in oklab, ${resColor(r.type)} 18%, white)`, color:resColor(r.type)}}>{r.type}</span><span className="pl-glabel">{r.label}</span></div>
    </div>
  );
}

function PlanPage({ lesson, version, showForking, onTeach, embedded }){
  const s = SUBJECTS[lesson.subjectId];
  const [plan,setPlan] = useState(()=>loadPlan(lesson));
  const [active,setActive] = useState('objective');
  const [details,setDetails] = useState(false);
  const [resView,setResView] = useState('gallery');
  const [openStep,setOpenStep] = useState(0);
  const [fmtOpen,setFmtOpen] = useState(false);
  const [tagFor,setTagFor] = useState(-1);   // step index awaiting a resource tag
  const [saveAsk,setSaveAsk] = useState(false);
  const [tplOpen,setTplOpen] = useState(false);
  const [newOpen,setNewOpen] = useState(false);
  const askedRef = useRef(false);

  const TEMPLATES = {
    'Gradual release':[{t:'Warm-up',m:5},{t:'I do — Model',m:10},{t:'We do — Guided',m:15},{t:'You do — Independent',m:10},{t:'Exit ticket',m:5}],
    '5E inquiry':[{t:'Engage',m:8},{t:'Explore',m:12},{t:'Explain',m:10},{t:'Elaborate',m:10},{t:'Evaluate',m:5}],
    'Workshop':[{t:'Mini-lesson',m:12},{t:'Independent work',m:25},{t:'Conferring',m:8},{t:'Share',m:5}],
    'Direct instruction':[{t:'Review',m:5},{t:'Present',m:15},{t:'Guided practice',m:15},{t:'Independent practice',m:10}],
    'Simple':[{t:'Warm-up',m:5},{t:'Mini-lesson',m:15},{t:'Guided practice',m:15},{t:'Exit ticket',m:5}],
  };
  const applyTemplate = (name)=>{ const f=TEMPLATES[name]; if(!f) return; commit(p=>{ p.flow=f.map(x=>({t:x.t,m:x.m,body:'',res:[]})); p.template=name; return p; }); setTplOpen(false); setOpenStep(0); };
  const [dragKey,setDragKey] = useState(null);
  const dragRef = useRef(null);
  const fmtTimer = useRef();

  useEffect(()=>{ setPlan(loadPlan(lesson)); setActive('objective'); setDetails(false); setOpenStep(0); },[lesson.id]);

  const commit = useCallback((mut)=>{
    setPlan(p=>{ const np = mut({ ...p }); np.modified = true; persist(lesson.id, np); return np; });
    if(!askedRef.current){ try{ if(localStorage.getItem('cc_savePrompt')!=='off'){ askedRef.current=true; setSaveAsk(true); } }catch(e){} }
  },[lesson.id]);

  const onFocusBar = ()=>{ clearTimeout(fmtTimer.current); setFmtOpen(true); };
  const onBlurBar  = ()=>{ fmtTimer.current=setTimeout(()=>setFmtOpen(false),180); };
  const exec = (cmd,val)=>{ document.execCommand(cmd,false,val||null); };

  const resources = window.DS.resourcesFor(lesson);
  const resById = (id)=>resources.find(r=>r.id===id);

  // tab order (persisted, draggable) — falls back to default PTOOLS order
  const orderedTools = (()=>{
    const ord = plan.tabOrder || PTOOLS.map(t=>t.k);
    const seen = ord.filter(k=>PTOOLS.some(t=>t.k===k));
    PTOOLS.forEach(t=>{ if(!seen.includes(t.k)) seen.push(t.k); });
    return seen.map(k=>PTOOLS.find(t=>t.k===k)).filter(Boolean);
  })();
  const reorder = (fromK,toK)=>{
    if(fromK===toK) return;
    const ks = orderedTools.map(t=>t.k);
    const fi = ks.indexOf(fromK), ti = ks.indexOf(toK);
    ks.splice(ti,0,ks.splice(fi,1)[0]);
    commit(p=>{ p.tabOrder = ks; return p; });
  };

  const tabStyle = version==='B'?'console':version==='C'?'pill':'glass';
  const totalMin = plan.flow.reduce((a,st)=>a+(Number(st.m)||0),0);
  const objPreview = plan.objective ? `I can ${plan.objective}` : lesson.objective;

  const renderPane = ()=>{
    if(active==='objective') return (
      <div className="pl-objrow">
        <span className="pl-ican">I can</span>
        <Editable key={lesson.id+':obj'} initial={plan.objective} single
          placeholder="state the lesson objective…"
          onChange={(v)=>commit(p=>{p.objective=v;return p;})} />
      </div>
    );
    if(active==='standards') return (
      <div>
        <div className="pl-stdlist">
          <div className="pl-stdrow"><span className="pl-stdcode">{lesson.std}</span><span className="pl-stddesc">{lesson.unit}</span></div>
          <div className="pl-stdrow"><span className="pl-stdcode">{lesson.std}.a</span><span className="pl-stddesc">{lesson.objective}</span></div>
        </div>
        <button className="pl-btn sm" title="The standards picker isn’t wired in this prototype yet — it will let you search your frameworks and tag standards.">Edit standards</button>
      </div>
    );
    if(active==='notes') return (
      <RichEditable key={lesson.id+':notes'} initialHtml={plan.notes}
        placeholder="Add private notes for yourself… (select text to format)"
        onFocusBar={onFocusBar} onBlurBar={onBlurBar}
        onChange={(v)=>commit(p=>{p.notes=v;return p;})} />
    );
    if(active==='diff') return (
      <div className="pl-diff">
        {[['support','Support','--subj-3-bright'],['onLevel','On level','--subj-10-bright'],['extension','Extension','--subj-13-bright']].map(([key,label,col])=>(
          <div key={key} className="pl-tier" style={{'--tc':cv(col)}}>
            <h5 style={{color:cv(col)}}>{label}</h5>
            <Editable key={lesson.id+':'+key} initial={plan.diff[key]}
              placeholder={`Plan the ${label.toLowerCase()} tier…`}
              onChange={(v)=>commit(p=>{p.diff={...p.diff,[key]:v};return p;})} />
          </div>
        ))}
      </div>
    );
    if(active==='resources') return (
      <div>
        <div className="pl-resbar">
          <div className="pl-viewtog">
            <button className={resView==='gallery'?'on':''} onClick={()=>setResView('gallery')} title="Gallery view"><PIcon k="film"/></button>
            <button className={resView==='list'?'on':''} onClick={()=>setResView('list')} title="List view"><PIcon k="list"/></button>
          </div>
          <button className="pl-btn sm" onClick={()=>{
            const url=prompt('Paste a link, or a path to an image/doc:'); if(!url) return;
            const label=prompt('Name this resource:', url.split('/').pop()||'Resource')||'Resource';
            window.DS.addCustomRes(lesson.id,{ id:'c'+Date.now(), label, type:window.DS.typeFromUrl(url), url, custom:true });
            commit(p=>{p.resBump=(p.resBump||0)+1;return p;});
          }}>+ Add resource / link / picture</button>
        </div>
        {resView==='gallery'
          ? <div className="pl-gallery">{resources.map(r=><ResThumb key={r.id} r={r} />)}</div>
          : <div className="pl-rlist">
              {resources.map(r=>(
                <div key={r.id} className="pl-rrow">
                  <span className="pl-rdot" style={{background:resColor(r.type)}}/>
                  <span className="pl-rtype" style={{color:resColor(r.type)}}>{r.type}</span>
                  <span className="pl-rlabel">{r.label}</span>
                  <button className="pl-rtab" title="Open in a new tab" onClick={()=>window.open(r.url,'_blank','noopener')}><PIcon k="ext"/></button>
                  {r.custom && <button className="pl-rrm" title="Remove resource" onClick={()=>{ window.DS.removeCustomRes(lesson.id,r.id); commit(p=>{p.resBump=(p.resBump||0)+1;return p;}); }}>×</button>}
                </div>
              ))}
            </div>}
      </div>
    );
    if(active==='details') return (
      <div className="pl-details" style={{padding:0}}>
        <div className="pl-drow"><span className="dk">Subject</span><span className="dv">{s.full}</span></div>
        <div className="pl-drow"><span className="dk">Unit</span><span className="dv">{lesson.unit}</span></div>
        <div className="pl-drow"><span className="dk">Time</span><span className="dv">{fmt(lesson.start)}–{fmt(lesson.end)}</span></div>
        <div className="pl-drow"><span className="dk">Room</span><span className="dv">{lesson.room}</span></div>
        <div className="pl-drow"><span className="dk">Standard</span><span className="dv">{lesson.std}</span></div>
        <div className="pl-drow"><span className="dk">Status</span><span className="dv">{lesson.status==='now'?'In progress':lesson.status==='done'?'Complete':'Planned'}</span></div>
      </div>
    );
    return null;
  };

  const meta = PTOOLS.find(x=>x.k===active);

  return (
    <div className="plan" style={{'--subj':cv(s.c), '--subjink':cv(s.ink)}}>
      {/* header */}
      <div className="pl-card pl-head"
           style={{borderLeftColor:cv(s.c), borderLeftStyle:(showForking && plan.modified)?'dashed':'solid'}}>
        <div className="pl-id">
          <window.VS.SubjGlyph id={lesson.subjectId} size={40} radius={12}/>
          <div className="pl-tt">
            <div className="pl-title">{lesson.title}</div>
            <div className="pl-objprev">{objPreview}</div>
          </div>
        </div>
        <div/>
        <div className="pl-right">
          {showForking &&
            <div className="pl-badges">
              {plan.modified && <span className="pl-pill mod"><span className="pd"/>Modified</span>}
              <span className="pl-pill personal">Personal copy</span>
            </div>}
          {!embedded && <button className="pl-btn ghost sm" title="Create a brand-new lesson" onClick={()=>setNewOpen(true)}><PIcon k="plus"/>Make new lesson</button>}
          {!embedded && <button className="pl-btn pri" onClick={()=>onTeach(lesson)}><PIcon k="teach"/>Teach</button>}
          {embedded && <button className="pl-btn ghost sm icon" title="Open the resource wall for this lesson" onClick={()=>window.dispatchEvent(new CustomEvent('cc-open-post',{detail:{lesson}}))}><PIcon k="resources"/></button>}
          {embedded && <button className="pl-btn ghost sm icon" title="Open the full lesson plan page" onClick={()=>window.dispatchEvent(new CustomEvent('cc-open-plan',{detail:{lesson}}))}><PIcon k="notes"/></button>}
        </div>
      </div>

      {/* tool tabs + active pane — connected tabbed card */}
      <div className="pl-folder" style={{'--pc':cv(meta.color)}}>
        <div className="pl-tabs">
          {orderedTools.map(tool=>(
            <button key={tool.k} draggable
                    className={'pl-tab'+(active===tool.k?' on':'')+(dragKey===tool.k?' dragging':'')}
                    style={{'--pc':cv(tool.color)}} onClick={()=>setActive(tool.k)}
                    onDragStart={(e)=>{ dragRef.current=tool.k; setDragKey(tool.k); try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',tool.k);}catch(x){} }}
                    onDragOver={(e)=>{ e.preventDefault(); }}
                    onDrop={(e)=>{ e.preventDefault(); if(dragRef.current) reorder(dragRef.current,tool.k); dragRef.current=null; setDragKey(null); }}
                    onDragEnd={()=>{ dragRef.current=null; setDragKey(null); }}
                    title="Drag to reorder">
              <span className="pdot"/><PIcon k={tool.k}/>{tool.label}
            </button>
          ))}
        </div>
        <div className="pl-pane">
          {renderPane()}
        </div>
      </div>

      {/* expandable, richly-editable lesson flow */}
      <div className="pl-card pl-flowcard">
        <div className="pl-flowhead">
          <span className="nm"><PIcon k="flow"/>Lesson flow{plan.template && <span className="pl-tplname">· {plan.template}</span>}</span>
          <span className="pl-flowtools">
            <button className="pl-flowadd" title="Add resources to this lesson" onClick={()=>setActive('resources')}><PIcon k="plus"/>Add resources</button>
            <div className="pl-tplwrap">
              <button className="pl-tplbtn" title="Choose a lesson structure" onClick={()=>setTplOpen(o=>!o)}>Template<PIcon k="chev"/></button>
              {tplOpen && <div className="pl-tplpop" onMouseLeave={()=>setTplOpen(false)}>
                <div className="pl-tpllbl">Change template</div>
                {Object.keys(TEMPLATES).map(name=>(
                  <button key={name} className={'pl-tplrow'+(plan.template===name?' on':'')} onClick={()=>applyTemplate(name)}>{name}<span className="pl-tplsteps">{TEMPLATES[name].length} steps</span></button>
                ))}
                <button className="pl-tplrow add" onClick={()=>{ setTplOpen(false); }}><PIcon k="plus"/>Add current as template…</button>
              </div>}
            </div>
            <button className="pl-flowbtn" title="Expand all" onClick={()=>setOpenStep('all')}><PIcon k="chev"/></button>
            <button className="pl-flowbtn up" title="Collapse all" onClick={()=>setOpenStep(-1)}><PIcon k="chev"/></button>
            <span className="tot">{totalMin} min · {plan.flow.length} steps</span>
          </span>
        </div>
        {plan.flow.map((st,i)=>{
          const open = openStep==='all' || openStep===i;
          const tagged = (st.res||[]).map(resById).filter(Boolean);
          return (
            <div key={i} className={'pl-step2'+(open?' open':'')}>
              <div className="pl-step-row">
                <button className="pl-stepn" onClick={()=>setOpenStep(open?-1:i)} title={open?'Collapse':'Expand'}>{i+1}</button>
                <Editable key={lesson.id+':flow:'+i+':'+st.t.length} initial={st.t} single
                  placeholder="Step name…"
                  onChange={(v)=>commit(p=>{ const flow=[...p.flow]; flow[i]={...flow[i],t:v}; p.flow=flow; return p; })} />
                <span className="pl-min">
                  <input type="number" min="0" value={st.m}
                    onChange={(e)=>commit(p=>{ const flow=[...p.flow]; flow[i]={...flow[i],m:e.target.value===''?'':Number(e.target.value)}; p.flow=flow; return p; })}/>
                  min
                </span>
                <button className="pl-stepchev" onClick={()=>setOpenStep(open?-1:i)} title={open?'Collapse':'Expand'} style={{transform:open?'rotate(180deg)':'none'}}><PIcon k="chev"/></button>
                <button className="pl-stepadd" title="Add resources" onClick={()=>{ setOpenStep(i); setTagFor(i); }}><PIcon k="plus"/></button>
                <button className="pl-x" title="Remove step"
                  onClick={()=>commit(p=>{ p.flow=p.flow.filter((_,j)=>j!==i); return p; })}><PIcon k="x"/></button>
              </div>
              {open &&
                <div className="pl-step-body">
                  <RichEditable key={lesson.id+':body:'+i} initialHtml={st.body}
                    placeholder="Describe this part of the lesson — steps, prompts, questions… (select text to format)"
                    onFocusBar={onFocusBar} onBlurBar={onBlurBar}
                    onChange={(v)=>commit(p=>{ const flow=[...p.flow]; flow[i]={...flow[i],body:v}; p.flow=flow; return p; })} />
                  <div className="pl-step-res">
                    {tagged.map(r=>(
                      <span key={r.id} className="pl-tagchip" style={{borderColor:`color-mix(in oklab, ${resColor(r.type)} 50%, transparent)`}}>
                        <span className="pl-tagdot" style={{background:resColor(r.type)}}/>
                        <span className="pl-taglbl" onClick={()=>window.open(r.url,'_blank','noopener')} title="Open in a new tab">{r.label}</span>
                        <button className="pl-tagx" title="Untag" onClick={()=>commit(p=>{ const flow=[...p.flow]; flow[i]={...flow[i],res:(flow[i].res||[]).filter(x=>x!==r.id)}; p.flow=flow; return p; })}><PIcon k="x"/></button>
                      </span>
                    ))}
                    <div className="pl-tagwrap">
                      <button className="pl-tagadd" onClick={()=>setTagFor(tagFor===i?-1:i)}><PIcon k="tag"/>Tag resource</button>
                      {tagFor===i &&
                        <div className="pl-tagpop">
                          {resources.filter(r=>!(st.res||[]).includes(r.id)).map(r=>(
                            <button key={r.id} className="pl-tagrow" onClick={()=>{ commit(p=>{ const flow=[...p.flow]; flow[i]={...flow[i],res:[...(flow[i].res||[]),r.id]}; p.flow=flow; return p; }); setTagFor(-1); setActive('resources'); }}>
                              <span className="pl-respill" style={{background:`color-mix(in oklab, ${resColor(r.type)} 18%, white)`, color:resColor(r.type)}}>{r.type}</span>{r.label}
                            </button>
                          ))}
                          {resources.filter(r=>!(st.res||[]).includes(r.id)).length===0 && <div className="pl-tagempty">All resources tagged</div>}
                        </div>}
                    </div>
                  </div>
                </div>}
            </div>
          );
        })}
        <button className="pl-addstep" onClick={()=>commit(p=>{ p.flow=[...p.flow,{t:'New step',m:5,body:'',res:[]}]; setOpenStep(p.flow.length); return p; })}><PIcon k="plus"/>Add step</button>
        <div style={{marginTop:10,paddingTop:14,borderTop:'1px dashed var(--border)'}}>
          <div style={{display:'flex',alignItems:'center',gap:7,fontSize:12,fontWeight:800,letterSpacing:'.04em',textTransform:'uppercase',color:'var(--muted)',marginBottom:10}}><PIcon k="resources"/>Whole-lesson resources</div>
          <div className="pl-step-res">
            {(plan.lessonRes||[]).map(resById).filter(Boolean).map(r=>(
              <span key={r.id} className="pl-tag">
                <span className="pl-tagdot" style={{background:resColor(r.type)}}/>
                <span className="pl-taglbl" onClick={()=>window.open(r.url,'_blank','noopener')} title="Open in a new tab">{r.label}</span>
                <button className="pl-tagx" title="Untag" onClick={()=>commit(p=>{ p.lessonRes=(p.lessonRes||[]).filter(x=>x!==r.id); return p; })}>×</button>
              </span>
            ))}
            <div className="pl-tagwrap">
              <button className="pl-tagadd" onClick={()=>setTagFor(tagFor==='whole'?-1:'whole')}><PIcon k="tag"/>Tag resource</button>
              {tagFor==='whole' &&
                <div className="pl-tagpop">
                  {resources.filter(r=>!(plan.lessonRes||[]).includes(r.id)).map(r=>(
                    <button key={r.id} className="pl-tagrow" onClick={()=>{ commit(p=>{ p.lessonRes=[...(p.lessonRes||[]),r.id]; return p; }); setTagFor(-1); }}>
                      <span className="pl-respill" style={{background:`color-mix(in oklab, ${resColor(r.type)} 18%, white)`, color:resColor(r.type)}}>{r.type}</span>{r.label}
                    </button>
                  ))}
                  {resources.filter(r=>!(plan.lessonRes||[]).includes(r.id)).length===0 && <div className="pl-tagempty">All resources tagged</div>}
                </div>}
            </div>
          </div>
        </div>
      </div>

      {/* formatting bar — appears while editing a rich field */}
      {fmtOpen &&
        <div className="pl-fmtbar" onMouseDown={(e)=>e.preventDefault()}>
          <button title="Bold" onClick={()=>exec('bold')}><b>B</b></button>
          <button title="Italic" onClick={()=>exec('italic')}><i>I</i></button>
          <button title="Underline" onClick={()=>exec('underline')}><u>U</u></button>
          <span className="pl-fmtdiv"/>
          <button title="Heading" onClick={()=>exec('formatBlock','H3')}>H</button>
          <button title="Bulleted list" onClick={()=>exec('insertUnorderedList')}>• List</button>
          <button title="Numbered list" onClick={()=>exec('insertOrderedList')}>1. List</button>
          <span className="pl-fmtdiv"/>
          <button title="Clear formatting" onClick={()=>exec('removeFormat')}>Clear</button>
        </div>}

      {saveAsk && (()=>{ const team = (typeof document!=='undefined') && document.querySelector('.home') && document.querySelector('.home').dataset.mode==='team';
        return (
        <div className={'pl-saveask'+(team?' team':'')}>
          {team
            ? <React.Fragment>
                <div className="pl-saveask-h">Saving to Team Curriculum</div>
                <div className="pl-saveask-sub">Team Curriculum is on — these edits save to the <strong>shared team plan</strong> and affect everyone, not just your personal copy.</div>
                <div className="pl-saveask-btns">
                  <button className="pri team" onClick={()=>setSaveAsk(false)}>Save to team curriculum</button>
                  <button onClick={()=>setSaveAsk(false)}>Save as personal copy instead</button>
                </div>
              </React.Fragment>
            : <React.Fragment>
                <div className="pl-saveask-h">Save your changes</div>
                <div className="pl-saveask-sub">You edited this lesson. Who should see it?</div>
                <div className="pl-saveask-btns">
                  <button className="pri" onClick={()=>setSaveAsk(false)}>Save for team</button>
                  <button onClick={()=>setSaveAsk(false)}>Share with team</button>
                  <button onClick={()=>setSaveAsk(false)}>Keep personal</button>
                </div>
              </React.Fragment>}
          <button className="pl-saveask-off" onClick={()=>{ try{localStorage.setItem('cc_savePrompt','off');}catch(e){} setSaveAsk(false); }}>Don't ask again</button>
        </div>); })()}

      {newOpen && <NewLessonDialog lesson={lesson} onClose={()=>setNewOpen(false)} />}
    </div>
  );
}

function NewLessonDialog({ lesson, onClose }){
  const SUBS=window.DS.SUBJECT_ORDER;
  const today=new Date().toISOString().slice(0,10);
  const [f,setF]=useState({ date:today, subjectId:lesson.subjectId, unit:'', title:'', order:1, type:'Standard', standalone:false });
  const set=(k,v)=>setF(p=>({...p,[k]:v}));
  const save=()=>{
    try{
      const arr=JSON.parse(localStorage.getItem('cc_newlessons')||'[]');
      arr.push({ ...f, id:'nl'+Date.now(), subjectId:f.standalone?null:f.subjectId });
      localStorage.setItem('cc_newlessons',JSON.stringify(arr));
    }catch(e){}
    onClose();
  };
  return (
    <div className="pl-dlg-scrim" onClick={onClose}>
      <div className="pl-dlg" onClick={e=>e.stopPropagation()}>
        <div className="pl-dlg-h">Make a new lesson<button onClick={onClose}><PIcon k="x"/></button></div>
        <div className="pl-dlg-body">
          <label className="pl-fld"><span>Title</span><input value={f.title} onChange={e=>set('title',e.target.value)} placeholder="Lesson title…" autoFocus/></label>
          <div className="pl-fld2">
            <label className="pl-fld"><span>Date</span><input type="date" value={f.date} onChange={e=>set('date',e.target.value)}/></label>
            <label className="pl-fld"><span>Lesson order</span><input type="number" min="1" value={f.order} onChange={e=>set('order',e.target.value)}/></label>
          </div>
          <label className={'pl-fld'+(f.standalone?' off':'')}><span>Subject</span>
            <select value={f.subjectId} disabled={f.standalone} onChange={e=>set('subjectId',e.target.value)}>
              {SUBS.map(s=><option key={s} value={s}>{window.DS.SUBJECTS[s].full}</option>)}
            </select>
          </label>
          <label className={'pl-fld'+(f.standalone?' off':'')}><span>Unit</span><input value={f.unit} disabled={f.standalone} onChange={e=>set('unit',e.target.value)} placeholder="Unit name…"/></label>
          <label className="pl-fld"><span>Type of lesson</span>
            <select value={f.type} onChange={e=>set('type',e.target.value)}>
              {['Standard','Introduction','Practice','Assessment','Review','Project'].map(t=><option key={t}>{t}</option>)}
            </select>
          </label>
          <label className="pl-check"><input type="checkbox" checked={f.standalone} onChange={e=>set('standalone',e.target.checked)}/><span>Standalone lesson <em>— not tied to a subject or unit; shows in the library's Standalone lessons</em></span></label>
        </div>
        <div className="pl-dlg-foot">
          <button className="pl-btn ghost sm" onClick={onClose}>Cancel</button>
          <button className="pl-btn pri" onClick={save} disabled={!f.title.trim()}>Create lesson</button>
        </div>
      </div>
    </div>
  );
}

window.PlanPage = PlanPage;
window.PlanBack = function PlanBack(props){ return <button className="pl-back" onClick={props.onClick}><window.PlanIco k="back"/>Back</button>; };
window.PlanIco = function(p){ return <PIcon k={p.k}/>; };
})();
