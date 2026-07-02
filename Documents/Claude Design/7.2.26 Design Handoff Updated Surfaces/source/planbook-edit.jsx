/* Planbook Edit mode for V2 — Common-Planner-style editor bound to the app's
   real lessons (window.DS) and the app's appearance (frame/glass/theme/tone).
   Exposes window.PBEdit = { WeekEdit, DayEdit, LessonModal, SelectionToolbar }.
   Week  → time-aligned period grid (days × periods), drag to move/reorder, expand inline.
   Day   → single stacked column (no rail), drag to reorder, expand inline.
   Lesson popup → rich-text section editor with presets, add/delete/reorder sections. */
(function(){
const { useState, useRef, useEffect, useLayoutEffect } = React;
const DS = window.DS;
const SUBJ = DS.SUBJECTS;
const fmt = DS.fmt;
const sc = (id)=>{ const s=SUBJ[id]; return s? 'var('+s.c+')' : 'var(--brand-500)'; };
const slabel = (id)=>{ const s=SUBJ[id]; return s? s.label : 'Lesson'; };
const toMin = (t)=>{ const [h,m]=t.split(':').map(Number); return h*60+m; };
const fromMin = (m)=>{ m=Math.max(0,Math.round(m)); return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); };
const pbHost = ()=> document.querySelector('.home') || document.body;

/* period rows come straight from the app's configured schedule */
const PERIODS = (DS.PERIODS||[]).map((p,i)=>({ key:'p'+i, idx:i, label:p.label, time:p.start, end:p.end }));
const periodKeyOf = (L)=> 'p'+(L.periodIdx!=null ? L.periodIdx : 0);

const TEXT_COLORS = ['#1C1B2E','#2E6FD6','#C53F7B','#4E9A5B','#C8961A','#7A5BD6'];
const HILITE_COLORS = ['#FFF1A6','#CFEFD8','#FAD4E4','#D6E4FF','#EADBFF','transparent'];
const DOT_COLORS = ['#2E6FD6','#3FA7C5','#4E9A5B','#8FB339','#C8961A','#E07A3E','#E0566B','#C53F7B','#7A5BD6','#6E6C82'];
/* default per-section header washes — each section a different hue unless a default template overrides */
const SECTION_WASHES = ['#2E6FD6','#4E9A5B','#C8961A','#E07A3E','#7A5BD6','#3FA7C5','#E0566B','#8FB339'];
function defaultTemplate(){ try{ const r=localStorage.getItem('cc_pbdefaulttpl'); return r?JSON.parse(r):null; }catch(e){ return null; } }

const BUILTIN_TPL = [
  { name:'Gradual Release', labels:['Warm-up','I Do — Model','We Do — Guided','You Do — Independent','Exit Ticket'] },
  { name:'5E Inquiry', labels:['Engage','Explore','Explain','Elaborate','Evaluate'] },
  { name:'Workshop', labels:['Mini-lesson','Work time','Conferring','Share-out'] },
  { name:'Standards-based', labels:['Standards','Objective','Procedures','Homework','Accommodations & Modifications'] },
];
function savedTemplates(){ try{ return JSON.parse(localStorage.getItem('cc_pbtemplates')||'[]'); }catch(e){ return []; } }
const SAMPLE_STD = [
  {code:'RL.5.2', desc:'Determine a theme from details in a text; summarize.'},
  {code:'RL.5.3', desc:'Compare and contrast two characters, settings, or events.'},
  {code:'RI.5.1', desc:'Quote accurately when explaining and drawing inferences.'},
  {code:'5.NBT.A.3', desc:'Read, write, and compare decimals to thousandths.'},
  {code:'5.NBT.B.7', desc:'Add, subtract, multiply, and divide decimals to hundredths.'},
  {code:'W.5.1', desc:'Write opinion pieces supporting a point of view with reasons.'},
  {code:'5-PS1-1', desc:'Develop a model to describe that matter is made of particles.'},
  {code:'SEL.2', desc:'Recognize and name emotions and their intensity.'},
];

/* title — persists to the SAME key the View-mode editable title uses (cc_title_<id>) */
function EditTitle({ L, big }){
  const k='cc_title_'+L.id; const ref=useRef(); const uid=useRef('t'+Math.random());
  const initial=(()=>{ try{ const s=localStorage.getItem(k); return s!=null?s:L.title; }catch(e){ return L.title; } })();
  useEffect(()=>{ if(ref.current) ref.current.textContent=initial; },[]);
  useEffect(()=>{ const h=(e)=>{ if(e.detail&&e.detail.id===L.id&&e.detail.src!==uid.current&&ref.current) ref.current.textContent=e.detail.v; }; window.addEventListener('pb-title',h); return ()=>window.removeEventListener('pb-title',h); },[]);
  const commit=(e)=>{ const t=e.currentTarget.textContent; try{ if(t) localStorage.setItem(k,t); }catch(_){} window.dispatchEvent(new CustomEvent('pb-title',{detail:{id:L.id,v:t,src:uid.current}})); };
  return <div className={big?'pb-mtitle':'pb-title'} contentEditable suppressContentEditableWarning ref={ref}
    onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}
    onInput={commit} onBlur={commit} />;
}

/* rich-text field (uncontrolled; formatting via the floating SelectionToolbar) */
function RichField({ initial, onCommit, ph, onFocusField, onBlurField, readOnly }){
  const ref = useRef();
  useEffect(()=>{ if(ref.current) ref.current.innerHTML = initial || ''; }, []);
  const commit = ()=>{ if(ref.current) onCommit(ref.current.innerHTML); };
  return (
    <div className="pb-field" contentEditable={!readOnly} suppressContentEditableWarning ref={ref} data-ph={ph}
      onInput={commit} onFocus={onFocusField} onBlur={()=>{ commit(); onBlurField&&onBlurField(); }} />
  );
}

/* one floating formatting toolbar, shown only while a section field has selection/focus */
function SelectionToolbar(){
  const [st,setSt]=useState({show:false,x:0,y:0});
  const [picker,setPicker]=useState(null);
  useEffect(()=>{
    let curField=null;
    const place=()=>{
      const field=curField;
      if(!field){ setSt(s=>s.show?{...s,show:false}:s); setPicker(null); return; }
      const sel=document.getSelection();
      let r=null;
      if(sel && sel.rangeCount){
        let n=sel.anchorNode; n=n&&(n.nodeType===3?n.parentElement:n);
        if(n && n.closest && n.closest('.pb-field')===field){
          const rg=sel.getRangeAt(0); const rects=rg.getClientRects();
          r = (rects && rects.length) ? rects[0] : rg.getBoundingClientRect();
        }
      }
      if(!r || (!r.width && !r.height)){ const fr=field.getBoundingClientRect(); r={left:fr.left+Math.min(fr.width/2,120), width:0, top:fr.top}; }
      setSt({show:true, x:r.left+(r.width||0)/2, y:r.top});
    };
    const onSel=()=>{ if(curField) place(); };
    const onFocusIn=(e)=>{ const f=e.target.closest&&e.target.closest('.pb-field'); if(f){ curField=f; place(); } };
    const onFocusOut=()=>{ setTimeout(()=>{ const a=document.activeElement; if(!a || !(a.closest&&a.closest('.pb-field'))){ curField=null; setSt(s=>s.show?{...s,show:false}:s); setPicker(null); } },60); };
    document.addEventListener('selectionchange',onSel);
    document.addEventListener('focusin',onFocusIn);
    document.addEventListener('focusout',onFocusOut);
    return ()=>{ document.removeEventListener('selectionchange',onSel); document.removeEventListener('focusin',onFocusIn); document.removeEventListener('focusout',onFocusOut); };
  },[]);
  if(!st.show) return null;
  const exec=(c,v)=>{ try{ document.execCommand('styleWithCSS',false,true); }catch(e){} document.execCommand(c,false,v); };
  const insert=(h)=>document.execCommand('insertHTML',false,h);
  const left=Math.max(140, Math.min(window.innerWidth-140, st.x));
  return ReactDOM.createPortal(
    <div className="pb-fbar pb-portal" style={{left, top:st.y}} onMouseDown={e=>e.preventDefault()}>
      <button className="pb-tb" title="Bold" onClick={()=>exec('bold')} style={{fontWeight:800}}>B</button>
      <button className="pb-tb" title="Italic" onClick={()=>exec('italic')} style={{fontStyle:'italic',fontWeight:700}}>I</button>
      <button className="pb-tb" title="Underline" onClick={()=>exec('underline')} style={{textDecoration:'underline',fontWeight:700}}>U</button>
      <span className="pb-tbsep"/>
      <button className="pb-tb" title="Small" onClick={()=>exec('fontSize',2)} style={{fontSize:11}}>A</button>
      <button className="pb-tb" title="Normal" onClick={()=>exec('fontSize',3)} style={{fontSize:13}}>A</button>
      <button className="pb-tb" title="Large" onClick={()=>exec('fontSize',5)} style={{fontSize:16}}>A</button>
      <span className="pb-tbsep"/>
      <button className="pb-tb" title="Text color" onClick={()=>setPicker(picker==='text'?null:'text')} style={{color:'#2E6FD6'}}>A<span style={{fontSize:8,marginLeft:1}}>▾</span></button>
      <button className="pb-tb" title="Highlight" onClick={()=>setPicker(picker==='hl'?null:'hl')}>🖍<span style={{fontSize:8,marginLeft:1}}>▾</span></button>
      {picker==='text' && <span className="pb-fpop">{TEXT_COLORS.map(c=><button key={c} className="pb-sw" style={{background:c}} onClick={()=>{ exec('foreColor',c); setPicker(null); }}/>)}</span>}
      {picker==='hl' && <span className="pb-fpop">{HILITE_COLORS.map(c=><button key={c} className="pb-sw" style={{background:c==='transparent'?'#fff':c, backgroundImage:c==='transparent'?'linear-gradient(45deg,#ddd 25%,transparent 25%,transparent 75%,#ddd 75%)':'none', backgroundSize:'8px 8px'}} onClick={()=>{ exec('hiliteColor',c); setPicker(null); }}/>)}</span>}
      <span className="pb-tbsep"/>
      <button className="pb-tb" title="Bulleted list" onClick={()=>exec('insertUnorderedList')}>•</button>
      <button className="pb-tb" title="Numbered list" onClick={()=>exec('insertOrderedList')}>1.</button>
      <button className="pb-tb" title="Decrease level" onClick={()=>exec('outdent')}>⇤</button>
      <button className="pb-tb" title="Increase level" onClick={()=>exec('indent')}>⇥</button>
      <span className="pb-tbsep"/>
      <button className="pb-tb" title="Link" onClick={()=>{ const u=prompt('Link URL:','https://'); if(u) exec('createLink',u); }}>🔗</button>
      <button className="pb-tb" title="Resource chip" onClick={()=>{ const nm=prompt('Resource name:','Slides'); if(nm) insert('<span class="pb-rchip" contenteditable="false">📎 '+nm+'</span>&nbsp;'); }}>📎</button>
    </div>, pbHost());
}

function ColorDot({ value, onPick, tint, onTint }){
  const [open,setOpen]=useState(false);
  const [pos,setPos]=useState(null);
  const btnRef=useRef();
  const toggle=()=>{ if(!open && btnRef.current){ const r=btnRef.current.getBoundingClientRect(); setPos({left:Math.min(r.left, window.innerWidth-176), top:r.bottom+6}); } setOpen(o=>!o); };
  return (
    <span style={{display:'inline-flex'}}>
      <button ref={btnRef} className="pb-secdot" title="Section color" style={{'--rc':value}} onClick={toggle} onPointerDown={e=>e.stopPropagation()} />
      {open && pos && ReactDOM.createPortal(
        <span className="pb-popcolors pb-portal" style={{position:'fixed', left:pos.left, top:pos.top}} onMouseLeave={()=>setOpen(false)}>
          <span className="pb-popsw">{DOT_COLORS.map(c=><button key={c} style={{background:c}} onClick={()=>{ onPick(c); }}/>)}</span>
          {onTint && <button className={'pb-tinttoggle'+(tint?' on':'')} onClick={()=>onTint(!tint)}>{tint?'✓ Background tinted':'Tint text background'}</button>}
        </span>, pbHost())}
    </span>
  );
}

/* re-seed legacy uniform (subject-coloured) sections to distinct per-heading washes,
   and repair legacy resource chips that were persisted as "📎 undefined" */
function migrateSecColors(arr, L){
  if(!Array.isArray(arr)) return arr;
  const subj=String(sc(L.subjectId)||'').toLowerCase();
  let resHtml=null;
  const buildRes=()=>{ if(resHtml!=null) return resHtml; try{ resHtml=(DS.resourcesFor(L)||[]).slice(0,4).map(r=>'<span class="pb-rchip" contenteditable="false">📎 '+(r.label||r.title||'Resource')+'</span>').join('&nbsp;'); }catch(e){ resHtml=''; } return resHtml; };
  return arr.map((s,i)=>{ const c=String(s.color||'').toLowerCase();
    let next=s;
    if(!c || c===subj) next={...next, color: SECTION_WASHES[i%SECTION_WASHES.length]};
    if((s.label||'').trim().toLowerCase()==='resources') next={...next, label:'Lesson Resources'};
    if(/📎\s*undefined/.test(s.html||'')) next={...next, html: buildRes()};
    if(next.tintText===undefined) next={...next, tintText:true};
    return next; });
}
/* default plan sections, seeded from the lesson's own fields */
function loadSections(L){
  try{ const raw=localStorage.getItem('cc_pbsec_'+L.id); if(raw) return migrateSecColors(JSON.parse(raw), L); }catch(e){}
  const c=sc(L.subjectId);
  const stdHtml = '<div><b>'+(L.std||'')+'</b>&nbsp; '+(L.objective||'')+'</div>';
  let resHtml='';
  try{ resHtml=(DS.resourcesFor(L)||[]).slice(0,4).map(r=>'<span class="pb-rchip" contenteditable="false">📎 '+(r.label||r.title||'Resource')+'</span>').join('&nbsp;'); }catch(e){}
  // a default template set in lesson-template settings overrides the per-section washes
  const dt=defaultTemplate();
  if(dt && (dt.secs||dt.labels)){
    const items = dt.labels ? dt.labels.map(l=>({label:l})) : dt.secs;
    return items.map((s,i)=>({ id:'s'+(i+1), label:s.label, color:s.color || SECTION_WASHES[i%SECTION_WASHES.length], tintText:s.tintText!==false,
      html: /standard/i.test(s.label)?stdHtml : /objective/i.test(s.label)?(L.objective||'') : /resource/i.test(s.label)?resHtml : (s.html||'') }));
  }
  const w=(i)=>SECTION_WASHES[i%SECTION_WASHES.length];
  return [
    {id:'s1',label:'Standards',color:w(0),html:stdHtml,tintText:true},
    {id:'s2',label:'Objective',color:w(1),html:L.objective||'',tintText:true},
    {id:'s3',label:'Procedures',color:w(2),html:'',tintText:true},
    {id:'s4',label:'Homework',color:w(3),html:'',tintText:true},
    {id:'s5',label:'Accommodations & Modifications',color:w(4),html:'',tintText:true},
    {id:'s6',label:'Lesson Resources',color:w(5),html:resHtml,tintText:true},
  ];
}
function LessonSections({ L, readOnly }){
  const [secs,setSecs]=useState(()=>loadSections(L));
  const [editing,setEditing]=useState(null);
  const [dropIdx,setDropIdx]=useState(null);
  const [dragging,setDragging]=useState(false);
  const [settleId,setSettleId]=useState(null);
  const [syncRev,setSyncRev]=useState(0);
  const uid=useRef('s'+Math.random());
  const wrapRef=useRef();
  const dropRef=useRef(null);
  const ensureRes=(arr)=> arr.some(s=>(s.label||'').trim().toLowerCase().includes('resource')) ? arr : [...arr,{id:'s-res'+Date.now(),label:'Lesson Resources',color:sc(L.subjectId),html:'',tintText:true}];
  const broadcast=(a)=>{ try{ localStorage.setItem('cc_pbsec_'+L.id, JSON.stringify(a)); }catch(e){} window.dispatchEvent(new CustomEvent('pb-sec',{detail:{id:L.id,secs:a,src:uid.current}})); };
  const save=(arr)=>{ const a=ensureRes(arr); setSecs(a); broadcast(a); };
  useEffect(()=>{ const h=(e)=>{ if(e.detail&&e.detail.id===L.id&&e.detail.src!==uid.current){ setSecs(e.detail.secs); setSyncRev(v=>v+1); } }; window.addEventListener('pb-sec',h); return ()=>window.removeEventListener('pb-sec',h); },[]);
  const update=(id,patch)=>save(secs.map(s=>s.id===id?{...s,...patch}:s));
  const del=(id)=>save(secs.filter(s=>s.id!==id));
  const duplicate=(id)=>{ const i=secs.findIndex(s=>s.id===id); if(i<0)return; const src=secs[i]; const copy={...src,id:'s'+Date.now(),label:src.label+' copy',rev:0}; save([...secs.slice(0,i+1),copy,...secs.slice(i+1)]); };
  const add=()=>save([...secs,{id:'s'+Date.now(),label:'New section',color:SECTION_WASHES[secs.length%SECTION_WASHES.length],html:'',tintText:true}]);
  const [tplOpen,setTplOpen]=useState(false);
  const [stdOpenFor,setStdOpenFor]=useState(null);
  const [activeSec,setActiveSec]=useState(null);
  const [menuFor,setMenuFor]=useState(null);
  const [resMenuFor,setResMenuFor]=useState(null);
  const [saved,setSaved]=useState(savedTemplates);
  const loadTpl=(t)=>{ const arr=(t.labels?t.labels.map(l=>({label:l,html:''})):t.secs).map((s,i)=>({id:'s'+Date.now()+'-'+i,label:s.label,color:s.color||SECTION_WASHES[i%SECTION_WASHES.length],html:s.html||'',tintText:s.tintText!==false})); save(arr); setTplOpen(false); };
  const saveTpl=()=>{ const name=prompt('Save this lesson structure as a template named:'); if(!name) return; const t={name,secs:secs.map(({label,color,html,tintText})=>({label,color,html,tintText:!!tintText}))}; const next=[...savedTemplates().filter(x=>x.name!==name),t]; try{ localStorage.setItem('cc_pbtemplates',JSON.stringify(next)); }catch(e){} setSaved(next); };
  const addStandardTo=(secId,st)=>{ const row='<div><b>'+st.code+'</b>&nbsp; '+st.desc+'</div>';
    const arr=secs.map(s=> s.id===secId ? {...s, html:(s.html||'')+row, rev:(s.rev||0)+1} : s ); save(arr); setStdOpenFor(null); };
  const RES_ICON={Image:'\uD83D\uDDBC',Link:'\uD83D\uDD17',Note:'\uD83D\uDCDD',Drive:'\u25B2',File:'\uD83D\uDCCE',Slides:'\uD83D\uDCD1',Doc:'\uD83D\uDCC4'};
  const addRes=(secId,res)=>{ const icon=RES_ICON[res.type]||'\uD83D\uDCCE'; const chip='<span class="pb-rchip" contenteditable="false">'+icon+' '+res.title+'</span>&nbsp;';
    const arr=secs.map(s=> s.id===secId ? {...s, html:(s.html||'')+chip, rev:(s.rev||0)+1} : s ); save(arr);
    try{ const k='cc_lessonres_'+L.id; const cur=JSON.parse(localStorage.getItem(k)||'[]'); cur.push({id:'r'+Date.now(),...res}); localStorage.setItem(k,JSON.stringify(cur)); }catch(e){}
    try{ window.dispatchEvent(new CustomEvent('cc-addresource',{detail:{lessonId:L.id, subjectId:L.subjectId, unit:L.unit, res}})); }catch(e){}
    setResMenuFor(null); };
  const pickFile=(secId,kind)=>{ const inp=document.createElement('input'); inp.type='file'; if(kind==='Image') inp.accept='image/*'; inp.onchange=()=>{ const f=inp.files&&inp.files[0]; if(f) addRes(secId,{title:f.name,type:kind}); }; inp.click(); };
  const libraryItems=()=>{ try{ return (DS.resourcesFor(L)||[]).slice(0,6); }catch(e){ return []; } };
  const reorder=(from,to)=>{ const a=secs.slice(); const [m]=a.splice(from,1); let t=to; if(from<to)t=to-1; if(t<0||t>a.length)t=a.length; a.splice(t,0,m); save(a); };

  const startDrag=(e, idx)=>{
    if(editing||readOnly) return;
    if(e.target.closest('button') || e.target.getAttribute('contenteditable')==='true') return;
    const el=e.currentTarget; const startY=e.clientY; let started=false;
    try{ el.setPointerCapture(e.pointerId); }catch(_){}
    const targetAt=(y)=>{ const els=Array.from(wrapRef.current.querySelectorAll('.pb-sec')); let t=els.length; for(let i=0;i<els.length;i++){ const r=els[i].getBoundingClientRect(); if(y < r.top + r.height/2){ t=i; break; } } return t; };
    const move=(ev)=>{ if(!started){ if(Math.abs(ev.clientY-startY)<6) return; started=true; el.classList.add('dragging'); setDragging(true); } const t=targetAt(ev.clientY); dropRef.current=t; setDropIdx(t); };
    const up=()=>{ el.removeEventListener('pointermove',move); el.removeEventListener('pointerup',up); el.classList.remove('dragging'); setDragging(false); if(started && dropRef.current!=null){ const movedId=secs[idx]&&secs[idx].id; reorder(idx, dropRef.current); if(movedId){ setSettleId(movedId); setTimeout(()=>setSettleId(null),440); } } dropRef.current=null; setDropIdx(null); };
    el.addEventListener('pointermove',move); el.addEventListener('pointerup',up);
  };

  return (
    <div className={'pb-exp'+(dragging?' reordering':'')} ref={wrapRef}>
      {secs.map((s,idx)=>(
        <div className={'pb-sec'+(dropIdx===idx?' drop':'')+(settleId===s.id?' settling':'')+(s.tintText?' tinted':'')} key={s.id} style={{'--rc':s.color||sc(L.subjectId)}}>
          <div className="pb-sechead" onPointerDown={e=>startDrag(e,idx)} onDoubleClick={()=>{ if(!readOnly) setEditing(s.id); }} title={readOnly?undefined:"Hold to drag · double-click to rename"}>
            <span style={{position:'relative',display:'inline-flex'}}>
              {!readOnly && <button className="pb-secmenu" title="Section options" onPointerDown={e=>e.stopPropagation()} onClick={()=>setMenuFor(m=>m===s.id?null:s.id)}>⋯</button>}
              {menuFor===s.id && (
                <span className="pb-secmenupop" onMouseLeave={()=>setMenuFor(null)}>
                  <button onClick={()=>{ setEditing(s.id); setMenuFor(null); }}>Rename</button>
                  <button onClick={()=>{ duplicate(s.id); setMenuFor(null); }}>Duplicate</button>
                  {!(s.label||'').trim().toLowerCase().includes('resource') && <button className="del" onClick={()=>{ del(s.id); setMenuFor(null); }}>Delete</button>}
                </span>
              )}
            </span>
            <span className="pb-seclbl-ed" contentEditable={!readOnly && editing===s.id} suppressContentEditableWarning
              ref={el=>{ if(el && editing===s.id && document.activeElement!==el){ el.focus(); document.getSelection && (function(){ const r=document.createRange(); r.selectNodeContents(el); const sel=document.getSelection(); sel.removeAllRanges(); sel.addRange(r); })(); } }}
              onPointerDown={e=>{ if(editing===s.id) e.stopPropagation(); }}
              onBlur={e=>{ update(s.id,{label:e.currentTarget.textContent.trim()||'Section'}); setEditing(null); }}
              onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); e.currentTarget.blur(); } }}>{s.label}</span>
            {!readOnly && <ColorDot value={s.color} onPick={c=>update(s.id,{color:c})} tint={!!s.tintText} onTint={v=>update(s.id,{tintText:v})} />}
          </div>
          <RichField key={s.id+':'+(s.rev||0)+':'+syncRev} initial={s.html} readOnly={readOnly} ph="Type here…  (select text for the formatting toolbar)"
            onCommit={html=>update(s.id,{html})}
            onFocusField={()=>setActiveSec(s.id)}
            onBlurField={()=>setTimeout(()=>setActiveSec(c=>c===s.id?null:c),160)} />
          {!readOnly && (s.label||'').trim().toLowerCase()==='standards' && activeSec===s.id && (
            <div className="pb-stdadd" onMouseDown={e=>e.preventDefault()}>
              <button className="pb-tplbtn" onClick={()=>setStdOpenFor(o=>o===s.id?null:s.id)}>+ Add standard</button>
              {stdOpenFor===s.id && (
                <div className="pb-tplmenu pb-tplmenu-inline" onMouseLeave={()=>setStdOpenFor(null)}>
                  <div className="hd">Add a standard</div>
                  {SAMPLE_STD.map(st=><button key={st.code} onClick={()=>addStandardTo(s.id,st)}><b>{st.code}</b> — {st.desc}</button>)}
                </div>
              )}
            </div>
          )}
          {!readOnly && (s.label||'').trim().toLowerCase().includes('resource') && activeSec===s.id && (
            <div className="pb-stdadd" onMouseDown={e=>e.preventDefault()}>
              <button className="pb-tplbtn" onClick={()=>setResMenuFor(o=>o===s.id?null:s.id)}>+ Add resource ▾</button>
              {resMenuFor===s.id && (
                <div className="pb-tplmenu pb-tplmenu-inline" onMouseLeave={()=>setResMenuFor(null)}>
                  <div className="hd">Add from</div>
                  <button onClick={()=>pickFile(s.id,'File')}>💻 From computer</button>
                  <button onClick={()=>pickFile(s.id,'Image')}>🖼 Image</button>
                  <button onClick={()=>{ const u=prompt('Paste a link URL:','https://'); if(u&&u!=='https://') addRes(s.id,{title:u.replace(/^https?:\/\//,'').slice(0,42),type:'Link',url:u}); else setResMenuFor(null); }}>🔗 Link</button>
                  <button onClick={()=>{ const t=prompt('Note text:'); if(t) addRes(s.id,{title:t.slice(0,42),type:'Note',body:t}); else setResMenuFor(null); }}>📝 Note</button>
                  <button onClick={()=>{ const u=prompt('Google Drive link:','https://drive.google.com/'); if(u&&!/\/$/.test(u)) addRes(s.id,{title:'Drive file',type:'Drive',url:u}); else setResMenuFor(null); }}>▲ Google Drive</button>
                  <div className="hd">Resource library</div>
                  {libraryItems().map((r,i)=><button key={i} onClick={()=>addRes(s.id,{title:r.title,type:r.type||'File',url:r.url})}>📚 {r.title}</button>)}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      {!readOnly && <div className="pb-secfoot">
        <button className="pb-addsec" onClick={add}>+ Add section</button>
        <div className="pb-tplwrap">
          <button className="pb-tplbtn" onClick={()=>setTplOpen(o=>!o)}>Load preset ▾</button>
          {tplOpen && (
            <div className="pb-tplmenu" onMouseLeave={()=>setTplOpen(false)}>
              <div className="hd">Built-in</div>
              {BUILTIN_TPL.map(t=><button key={t.name} onClick={()=>loadTpl(t)}>{t.name}</button>)}
              {saved.length>0 && <div className="hd">Saved</div>}
              {saved.map(t=><button key={t.name} onClick={()=>loadTpl(t)}>{t.name}</button>)}
            </div>
          )}
        </div>
        <button className="pb-tplbtn" onClick={saveTpl}>Save as preset</button>
      </div>}
    </div>
  );
}

/* single-lesson popup planner — opened from View-mode "Plan" and Edit-mode "Open" */
function LessonModal({ L, mode, readOnly, onClose, onTeach }){
  const [savedTeam,setSavedTeam]=useState(false);
  useEffect(()=>{ const k=e=>{ if(e.key==='Escape') onClose(); }; document.addEventListener('keydown',k); return ()=>document.removeEventListener('keydown',k); },[]);
  const team = mode==='team';
  const saveToTeam=()=>{ setSavedTeam(true); try{ window.dispatchEvent(new CustomEvent('cc-toast',{detail:{id:'t'+Date.now(),type:'team',title:'Pushed to the team curriculum',body:L.title+' — it moved from your personal copy to the shared team plan.'}})); }catch(e){} setTimeout(()=>setSavedTeam(false),2200); };
  return ReactDOM.createPortal(
    <div className="pb-scrim pb-portal">
      <div className="pb-modal" onClick={e=>e.stopPropagation()}>
        <div className="pb-mhead" style={{background:sc(L.subjectId)}}>
          <div style={{minWidth:0}}>
            <div className="pb-msubj">{slabel(L.subjectId)} · {fmt(L.start)} – {fmt(L.end)}</div>
            <EditTitle L={L} big />
          </div>
          <div className="pb-mheadr">
            {team
              ? <span className="pb-teampill" title="You are editing the team curriculum — changes affect every teacher.">● Team curriculum</span>
              : <button className={'pb-saveteam'+(savedTeam?' done':'')} title="Push this lesson to the shared team curriculum — it moves from your personal copy to the team plan everyone sees" onClick={saveToTeam}>{savedTeam?'✓ Pushed to Team':'Push to Team'}</button>}
            {onTeach && <button className="pb-teachbtn" title="Open this lesson on the Teach board" onClick={()=>{ onClose(); onTeach(L); }}>Teach</button>}
            <button className="pb-exitbtn" title="Exit (Esc)" onClick={onClose}>Exit</button>
          </div>
        </div>
        {team && <div className="pb-teambanner">Heads up — changes here affect the whole team.</div>}
        <div className="pb-mbody">
          <div className="pb-mmeta"><span>Standard {L.std}</span><span>{slabel(L.subjectId)}</span><span>{L.unit||'Planned'}</span></div>
          <LessonSections L={L} readOnly={readOnly} />
        </div>
      </div>
    </div>, pbHost());
}

/* lesson cell (board) */
function Cell({ L, dayKey, expanded, onToggle, onOpen, drag, onBusy, register, min, onDrag }){
  return (
    <div className={'pb-cell'+(L.status==='now'?' now':'')+(min?' min':'')} style={{'--rc':sc(L.subjectId)}} ref={el=>register&&register(L.id, el)}>
      <div className="pb-cellh" draggable style={{background:sc(L.subjectId), cursor:'grab'}} title="Drag to move · click to expand / collapse"
        onDragStart={(e)=>{ drag.current={id:L.id, dayKey}; onBusy&&onBusy(true); onDrag&&onDrag(L.id);
          const cell=e.currentTarget.closest('.pb-cell');
          try{
            e.dataTransfer.effectAllowed='move';
            const g=document.createElement('div');
            g.style.cssText='position:fixed;top:-9999px;left:-9999px;width:'+Math.max(cell.offsetWidth,150)+'px;border-radius:14px;overflow:hidden;background:'+sc(L.subjectId)+';color:#fff;box-shadow:0 26px 54px -16px rgba(8,8,18,.55);transform:rotate(1.2deg);font:700 13px var(--font-sans);padding:10px 13px;pointer-events:none';
            g.textContent=(e.currentTarget.querySelector('.pb-subj')?e.currentTarget.querySelector('.pb-subj').textContent:'Lesson');
            document.body.appendChild(g);
            e.dataTransfer.setDragImage(g, 26, 18);
            setTimeout(()=>{ try{ document.body.removeChild(g); }catch(_){} }, 0);
          }catch(_){}
          cell.classList.add('dragging'); }}
        onDragEnd={(e)=>{ e.currentTarget.closest('.pb-cell').classList.remove('dragging'); onBusy&&onBusy(false); onDrag&&onDrag(null); }}
        onClick={onToggle}>
        <span className="pb-grip" title="Drag to move">⋮⋮</span>
        <span className="pb-subj">{slabel(L.subjectId)}</span>
        <span className="pb-time">{fmt(L.start)} – {fmt(L.end)}</span>
      </div>
      <div className="pb-cellb">
        <EditTitle L={L} />
        <div className="pb-cellacts">
          <button title="Open the full lesson planner" onClick={()=>onOpen(L)}>Open</button>
          <button title={expanded?'Collapse':'Expand inline'} onClick={onToggle}>{expanded?'Collapse':'Expand'}</button>
        </div>
      </div>
      {expanded && <LessonSections L={L} />}
    </div>
  );
}

/* FLIP helper hook for smooth reordering */
function useFlip(){
  const cellRefs = useRef(new Map());
  const prevRects = useRef(new Map());
  const register = (id, el)=>{ if(el) cellRefs.current.set(id, el); else cellRefs.current.delete(id); };
  useLayoutEffect(()=>{
    const map = cellRefs.current;
    map.forEach((el, id)=>{
      if(!el) return;
      const last = el.getBoundingClientRect();
      const first = prevRects.current.get(id);
      if(first){ const dx=first.left-last.left, dy=first.top-last.top;
        if(dx||dy){ el.style.transition='none'; el.style.transform=`translate(${dx}px, ${dy}px)`;
          requestAnimationFrame(()=>{ el.style.transition='transform .28s cubic-bezier(.2,.8,.2,1)'; el.style.transform=''; }); } }
    });
    const nr=new Map(); map.forEach((el,id)=>{ if(el) nr.set(id, el.getBoundingClientRect()); }); prevRects.current=nr;
  });
  return register;
}

/* time-aligned period grid (days × period rows) — WEEK edit */
function SlotBoard({ days, board, expanded, toggle, onOpen, drag, register, busy, onBusy, over, onOver, commit, onAdd, layout, dragId, onDrag }){
  const cols = '52px repeat('+days.length+', minmax(120px,1fr))';
  const stacked = layout==='stacked';
  const rows = stacked
    ? Array.from({length: Math.max(1, ...days.map(d=>(board[d.key]||[]).length+1))}, (_,i)=>i)
    : PERIODS;
  return (
    <div className={'pb-grid'+(busy?' dragging':'')+(stacked?' stacked':'')} style={{gridTemplateColumns:cols}}>
      <div className="pb-railhead"/>
      {days.map(d=>(
        <div key={'h'+d.key} className={'pb-dhead'+(d._today?' today':'')}>
          <span className="pb-cd">{d.name||d.short}</span><span className="pb-cdt">{d.date}</span>
        </div>
      ))}
      {rows.map((p,ri)=>([
        <div key={'r'+(stacked?ri:p.key)} className="pb-rail">
          {stacked
            ? null
            : <React.Fragment><span className="pb-rlbl">{p.label}</span><span className="pb-rtime">{fmt(p.time)}</span></React.Fragment>}
        </div>,
        ...days.map(d=>{
          const arr = board[d.key]||[];
          const items = stacked ? (arr[ri]?[arr[ri]]:[]) : arr.filter(l=>periodKeyOf(l)===p.key);
          const tgt = stacked ? {dayKey:d.key, index:ri} : {dayKey:d.key, periodKey:p.key};
          const isOver = over && over.dayKey===d.key && (stacked ? over.index===ri : over.periodKey===p.key);
          return (
            <div key={d.key+(stacked?ri:p.key)} className={'pb-slot'+(items.length?'':' empty')+(isOver?' over':'')}
              onDragOver={(e)=>{ e.preventDefault(); onOver(tgt); }}
              onDrop={(e)=>{ e.preventDefault(); commit(); }}>
              {items.length ? items.map(L=>(
                <Cell key={L.id} L={L} dayKey={d.key} expanded={!!expanded[L.id]}
                  onToggle={()=>toggle(L.id)} onOpen={onOpen} drag={drag} onBusy={onBusy} register={register} min={dragId===L.id} onDrag={onDrag} />
              )) : <span className="pb-slotghost">{busy?'Drop here':''}</span>}
            </div>
          );
        })
      ]))}
      {[
        <div key="arail" className="pb-rail"/>,
        ...days.map(d=>(<button key={'a'+d.key} className="pb-add" onClick={()=>onAdd(d.key)}>+ Add</button>))
      ]}
    </div>
  );
}

let _n=1;
function mkLesson(dayIdx){ const p=PERIODS[0]||{idx:0,time:'08:00',end:'08:45'}; return { id:'pb-new-'+(_n++), subjectId:'math', unit:'', std:'—', title:'New lesson', objective:'', start:p.time, end:p.end, periodIdx:p.idx, status:'idle' }; }

/* WEEK edit — period grid across day columns + Aligned/Stacked inline toggle */
function WeekEdit({ state, mode, onOpen }){
  const days = state.days;
  const [board,setBoard]=useState(()=>{ const m={}; days.forEach(d=>m[d.key]=d.lessons.slice()); return m; });
  const [expanded,setExpanded]=useState({});
  const [over,setOver]=useState(null);
  const [busy,setBusy]=useState(false);
  const [dragId,setDragId]=useState(null);
  const [layout,setLayout]=useState(()=>{ try{ return localStorage.getItem('cc_pblayout')||'aligned'; }catch(e){ return 'aligned'; } });
  const setLayoutP=(v)=>{ setLayout(v); try{ localStorage.setItem('cc_pblayout',v); }catch(e){} };
  React.useEffect(()=>{ const h=(e)=>{ if(e&&e.detail) setLayout(e.detail); }; window.addEventListener('cc-pblayout',h); return ()=>window.removeEventListener('cc-pblayout',h); },[]);
  const drag=useRef(null);
  const register=useFlip();
  const toggle=(id)=>setExpanded(p=>({ ...p, [id]:!p[id] }));
  const onOver=(tgt)=>{ setOver(o=>(o&&o.dayKey===tgt.dayKey&&o.periodKey===tgt.periodKey&&o.index===tgt.index)?o:tgt); };
  const commitDrop=()=>{
    const src=drag.current, tgt=over;
    if(src && src.id!==undefined && tgt){
      setBoard(prev=>{
        const next={}; Object.keys(prev).forEach(k=>next[k]=prev[k].slice());
        const fromArr=next[src.dayKey]; const si=fromArr.findIndex(l=>l.id===src.id);
        if(si<0) return prev;
        const [moved]=fromArr.splice(si,1);
        if(tgt.index!==undefined){
          let ti=tgt.index; if(src.dayKey===tgt.dayKey && si<ti) ti-=1;
          const arr=next[tgt.dayKey]; if(ti<0||ti>arr.length) ti=arr.length; arr.splice(ti,0,moved);
        } else {
          const p=PERIODS.find(x=>x.key===tgt.periodKey);
          if(p){ const dur=Math.max(toMin(moved.end)-toMin(moved.start),30); moved.start=p.time; moved.end=fromMin(toMin(p.time)+dur); moved.periodIdx=p.idx; }
          next[tgt.dayKey].push(moved);
          next[tgt.dayKey].sort((a,b)=>toMin(a.start)-toMin(b.start));
        }
        return next;
      });
    }
    drag.current=null; setOver(null); setBusy(false); setDragId(null);
  };
  const onAdd=(dayKey)=>setBoard(prev=>({ ...prev, [dayKey]:[...prev[dayKey], mkLesson()] }));
  return (
    <div className="pb-editwrap">
      <SlotBoard days={days.map((d,i)=>({ ...d, _today: i===state.todayIdx }))} board={board}
        expanded={expanded} toggle={toggle} onOpen={onOpen} drag={drag} register={register}
        busy={busy} onBusy={setBusy} over={over} onOver={onOver} commit={commitDrop} onAdd={onAdd} layout={layout} dragId={dragId} onDrag={setDragId} />
    </div>
  );
}

/* DAY edit — two-pane: fixed agenda list (left) + scrolling fill-in template (right), resizable */
function DayEdit({ state, mode, onOpen, onTeach, dayIdx, initialSel, onExit }){
  const di = dayIdx!=null ? dayIdx : state.todayIdx;
  const day = state.days[di] || state.days[0];
  const [list,setList]=useState(()=>day.lessons.slice());
  const pickDefault=(arr)=>{ const now=arr.find(l=>l.status==='now'); if(now) return now.id; const up=arr.find(l=>l.status==='upcoming'||l.status==='idle'); return (up||arr[0]||{}).id; };
  const [selId,setSelId]=useState(()=>(initialSel && day.lessons.some(l=>l.id===initialSel)) ? initialSel : pickDefault(day.lessons));
  const sel = list.find(l=>l.id===selId) || list[0];
  useEffect(()=>{ if(initialSel && day.lessons.some(l=>l.id===initialSel)) setSelId(initialSel); },[initialSel]);
  const [leftW,setLeftW]=useState(()=>{ const v=parseInt((typeof localStorage!=='undefined'&&localStorage.getItem('cc_deLeftW'))||'',10); return (v>=220&&v<=520)?v:300; });
  const leftWRef=useRef(leftW); leftWRef.current=leftW;
  const onAdd=()=>{ const L=mkLesson(di); setList(prev=>[...prev,L]); setSelId(L.id); };
  const team = mode==='team';
  const [savedTeam,setSavedTeam]=useState(false);
  const saveToTeam=()=>{ setSavedTeam(true); try{ window.dispatchEvent(new CustomEvent('cc-toast',{detail:{id:'t'+Date.now(),type:'team',title:'Pushed to the team curriculum',body:(sel?sel.title:'')+' — it moved from your personal copy to the shared team plan.'}})); }catch(e){} setTimeout(()=>setSavedTeam(false),2200); };
  const startDrag=(e)=>{ e.preventDefault(); const sx=e.clientX, sw=leftWRef.current;
    const move=(ev)=>{ let w=sw+(ev.clientX-sx); w=Math.max(220,Math.min(520,w)); setLeftW(w); };
    const up=()=>{ document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up); try{ localStorage.setItem('cc_deLeftW',String(Math.round(leftWRef.current))); }catch(_){}};
    document.addEventListener('mousemove',move); document.addEventListener('mouseup',up); };
  if(!sel) return <div className="pb-editwrap pb-dayedit2"/>;
  return (
    <div className="pb-editwrap pb-dayedit2">
      <div className="de-split">
        <div className="de-left" style={{width:leftW+'px'}}>
          <div className="de-listhead">{day.name||day.short}</div>
          <div className="de-list">
            {list.map(L=>{ const ls=SUBJ[L.subjectId]||{}; return (
              <button key={L.id} className={'de-item'+(L.id===selId?' sel':'')} onClick={()=>setSelId(L.id)} title={'Edit '+L.title}>
                <span className="de-time">{fmt(L.start)}</span>
                <span className="de-dot" style={{background:sc(L.subjectId)}}/>
                <span className="de-tx"><span className="de-name">{L.title}</span><span className="de-subj">{ls.full||slabel(L.subjectId)}</span></span>
              </button>
            ); })}
            <button className="de-add" onClick={onAdd} title="Add a new lesson to this day"><span className="rplus">+</span><span>Add lesson</span></button>
          </div>
        </div>
        <div className="de-divider" onMouseDown={startDrag} title="Drag to resize"><span/></div>
        <div className="de-right">
          <div className="de-template" key={sel.id} style={{'--rc':sc(sel.subjectId)}}>
            <div className="de-thead" style={{background:sc(sel.subjectId)}}>
              <div style={{minWidth:0}}>
                <div className="de-tsubj">{slabel(sel.subjectId)} · {fmt(sel.start)} – {fmt(sel.end)}</div>
                <EditTitle L={sel} big />
              </div>
              <div className="de-theadr">
                {team
                  ? <span className="pb-teampill" title="You are editing the team curriculum — changes affect every teacher.">● Team curriculum</span>
                  : <button className={'pb-saveteam'+(savedTeam?' done':'')} title="Push this lesson to the shared team curriculum — it moves from your personal copy to the team plan everyone sees" onClick={saveToTeam}>{savedTeam?'✓ Pushed to Team':'Push to Team'}</button>}
                {onTeach && <button className="pb-teachbtn" title="Open this lesson on the Teach board" onClick={()=>onTeach(sel)}>Teach</button>}
                {onExit && <button className="pb-exitbtn" title="Exit editing and return to the view" onClick={onExit}>Exit</button>}
              </div>
            </div>
            {team && <div className="pb-teambanner">Heads up — changes here affect the whole team.</div>}
            <div className="pb-mbody de-tbody">
              <div className="pb-mmeta"><span>Standard {sel.std}</span><span>{slabel(sel.subjectId)}</span><span>{sel.unit||'Planned'}</span></div>
              <LessonSections L={sel} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* embedded (no-scrim) lesson editor — used in the Teach board's left lesson pane */
function LessonEditor({ L, onTeach }){
  if(!L) return null;
  return (
    <div className="pb-embededitor">
      <div className="pb-embedhead" style={{'--rc':sc(L.subjectId)}}>
        <div className="pb-embedsubj">{slabel(L.subjectId)} · {fmt(L.start)} – {fmt(L.end)}</div>
        <EditTitle L={L} big />
        {onTeach && <button className="pb-embedteach" title="Teach this lesson" onClick={()=>onTeach(L)}>Teach</button>}
      </div>
      <div className="pb-mmeta"><span>Standard {L.std}</span><span>{slabel(L.subjectId)}</span><span>{L.unit||'Planned'}</span></div>
      <LessonSections L={L} />
    </div>
  );
}
window.PBEdit = { WeekEdit, DayEdit, LessonModal, LessonEditor, SelectionToolbar };
})();
