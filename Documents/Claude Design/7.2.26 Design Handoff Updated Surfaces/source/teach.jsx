/* Teach board — minimizable/pinnable lesson pane, fullscreen board, slides,
   annotation (writing) bar, and resources you can click or drag onto the board. */
(function(){
const { useState, useRef, useEffect, useCallback } = React;
const { SUBJECTS, RESTYPES, fmt } = window.DS;
const cv = (x)=>`var(${x})`;
const SEQ = ['Warm-up','Mini-lesson','Guided practice','Exit ticket'];
const COLORS = ['#3B6CF6','#EF5A5A','#16A06B','#1C1B2E'];

function TI({k}){
  const p={strokeWidth:2,strokeLinecap:'round',strokeLinejoin:'round',fill:'none',stroke:'currentColor',viewBox:'0 0 24 24','aria-hidden':true};
  switch(k){
    case 'pin':   return <svg {...p}><path d="M9 4h6l-1 6 3 3v2H7v-2l3-3-1-6Z"/><path d="M12 15v5"/></svg>;
    case 'min':   return <svg {...p}><path d="M15 5l-6 7 6 7"/></svg>;
    case 'expand':return <svg {...p}><path d="M9 5l6 7-6 7"/></svg>;
    case 'full':  return <svg {...p}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>;
    case 'exit':  return <svg {...p}><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5"/></svg>;
    case 'slide': return <svg {...p}><rect x="3" y="5" width="18" height="13" rx="2"/><path d="M12 9v5M9.5 11.5h5"/></svg>;
    case 'play':  return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z"/></svg>;
    case 'pause': return <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>;
    case 'reset': return <svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/></svg>;
    case 'pen':   return <svg {...p}><path d="M5 19l3-1L19 7a2 2 0 0 0-3-3L5 15l-1 3 1 1Z"/></svg>;
    case 'mark':  return <svg {...p}><path d="M4 19h6M9 14l6-9 4 3-6 9H8l-2-2 3-1Z"/></svg>;
    case 'erase': return <svg {...p}><path d="M4 15l7-7 6 6-4 4H8zM14 20h6"/></svg>;
    case 'text':  return <svg {...p}><path d="M5 6h14M12 6v13M9 19h6"/></svg>;
    case 'trash': return <svg {...p}><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>;
    case 'plus':  return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
    case 'x':     return <svg {...p}><path d="M18 6 6 18M6 6l12 12"/></svg>;
    case 'grip':  return <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="7" r="1.4"/><circle cx="15" cy="7" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="17" r="1.4"/><circle cx="15" cy="17" r="1.4"/></svg>;
    case 'folder':return <svg {...p}><path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h3.6l1.8 1.8h7.6A1.5 1.5 0 0 1 20 9.3v7.2A1.5 1.5 0 0 1 18.5 18h-13A1.5 1.5 0 0 1 4 16.5Z"/></svg>;
    case 'ext':   return <svg {...p}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>;
    default: return null;
  }
}
const resColor = (type)=>cv(RESTYPES[type]||'--subj-11');

function ResChip({ r, onAdd }){
  return (
    <div className="lp-res-item" draggable
      onDragStart={(e)=>{ try{ e.dataTransfer.setData('text/resource', r.id); e.dataTransfer.effectAllowed='copy'; }catch(x){} }}
      title="Click to add to board · drag onto board · ↗ opens in a new tab">
      <span className="lp-res-grip"><TI k="grip"/></span>
      <span className="lp-res-pill" style={{background:`color-mix(in oklab, ${resColor(r.type)} 18%, white)`, color:resColor(r.type)}}>{r.type}</span>
      <span className="lp-res-label" onClick={()=>onAdd(r)}>{r.label}</span>
      <button className="lp-res-tab" title="Open in a new tab" onClick={(e)=>{ e.stopPropagation(); window.open(r.url,'_blank','noopener'); }}><TI k="ext"/></button>
      <button className="lp-res-add2" title="Add to board" onClick={(e)=>{ e.stopPropagation(); onAdd(r); }}><TI k="plus"/></button>
    </div>
  );
}

function TeachView({ lesson, state, onPlan, onPick }){
  const s = SUBJECTS[lesson.subjectId];
  const resources = window.DS.resourcesFor(lesson);
  const [minimized,setMin]=useState(false);
  const [pinned,setPinned]=useState(false);
  const [fullscreen,setFull]=useState(false);
  const [mobLesson,setMobLesson]=useState(false);
  const [trueFull,setTrueFull]=useState(false);
  const [sec,setSec]=useState(600);
  const [run,setRun]=useState(false);
  const [slides,setSlides]=useState([{ id:'s1', title:'Learning target', items:[] }]);
  const [bg,setBg]=useState({type:'none'});
  const [bgOpen,setBgOpen]=useState(false);
  const [bgW,setBgW]=useState(1);
  const [bgY,setBgY]=useState(0);
  const bgDrag=useRef(null);
  const [active,setActive]=useState(0);
  const [tool,setTool]=useState('pen');
  const [color,setColor]=useState('#3B6CF6');
  const [resOpen,setResOpen]=useState(false);
  const [navTab,setNavTab]=useState('lessons');
  const [lessonW,setLessonW]=useState(320);

  useEffect(()=>{ // reset when lesson changes
    setSlides([{ id:'s1', title:'Learning target', items:[] }]); setActive(0);
  },[lesson.id]);

  useEffect(()=>{ if(!run) return; const id=setInterval(()=>setSec(x=>x>0?x-1:0),1000); return ()=>clearInterval(id); },[run]);
  useEffect(()=>{ if(!trueFull) return; const k=(e)=>{ if(e.key==='Escape') setTrueFull(false); }; document.addEventListener('keydown',k); return ()=>document.removeEventListener('keydown',k); },[trueFull]);
  const mm=String(Math.floor(sec/60)).padStart(2,'0'), ss=String(sec%60).padStart(2,'0');

  const lessonHidden = fullscreen && !pinned;

  // ── drawing canvas ─────────────────────────────────────────
  const canvasRef=useRef(null);
  const store=useRef({});            // slideId -> dataURL
  const drawing=useRef(false);
  const last=useRef(null);
  const toolRef=useRef(tool), colorRef=useRef(color), prevSlide=useRef(0);
  useEffect(()=>{toolRef.current=tool},[tool]);
  useEffect(()=>{colorRef.current=color},[color]);

  const saveCur=()=>{ const c=canvasRef.current; if(c) store.current[slides[prevSlide.current]?.id]=c.toDataURL(); };
  const loadCur=()=>{ const c=canvasRef.current; if(!c) return; const ctx=c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height); const url=store.current[slides[active]?.id]; if(url){ const img=new Image(); img.onload=()=>ctx.drawImage(img,0,0,c.width,c.height); img.src=url; } };
  const fit=()=>{ const c=canvasRef.current; if(!c) return; const r=c.parentElement.getBoundingClientRect(); if(!r.width) return; c.width=r.width; c.height=r.height; loadCur(); };

  useEffect(()=>{ fit(); const ro=('ResizeObserver'in window)?new ResizeObserver(()=>fit()):null; const stage=canvasRef.current?.parentElement; if(ro&&stage) ro.observe(stage); return ()=>ro&&ro.disconnect(); },[]); // eslint-disable-line
  useEffect(()=>{ // layout changed → refit (size shift)
    const c=canvasRef.current; if(!c) return; saveCur(); const r=c.parentElement.getBoundingClientRect(); if(r.width){ c.width=r.width; c.height=r.height; loadCur(); }
  },[fullscreen,minimized,pinned]); // eslint-disable-line
  useEffect(()=>{ loadCur(); prevSlide.current=active; },[active]); // eslint-disable-line

  const pos=(e)=>{ const r=canvasRef.current.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top }; };
  const applyTool=(ctx)=>{
    ctx.lineCap='round'; ctx.lineJoin='round';
    if(toolRef.current==='erase'){ ctx.globalCompositeOperation='destination-out'; ctx.globalAlpha=1; ctx.lineWidth=26; }
    else if(toolRef.current==='mark'){ ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=.3; ctx.strokeStyle=colorRef.current; ctx.lineWidth=16; }
    else { ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1; ctx.strokeStyle=colorRef.current; ctx.lineWidth=3; }
  };
  const down=(e)=>{ if(toolRef.current==='text') return; drawing.current=true; last.current=pos(e); try{e.target.setPointerCapture(e.pointerId);}catch(x){} };
  const moveDraw=(e)=>{ if(!drawing.current) return; const ctx=canvasRef.current.getContext('2d'); const p=pos(e); applyTool(ctx); ctx.beginPath(); ctx.moveTo(last.current.x,last.current.y); ctx.lineTo(p.x,p.y); ctx.stroke(); last.current=p; };
  const up=()=>{ if(drawing.current){ drawing.current=false; saveCur(); } };
  const clearBoard=()=>{ const c=canvasRef.current; if(c){ c.getContext('2d').clearRect(0,0,c.width,c.height); store.current[slides[active].id]=null; } };

  // ── slides ─────────────────────────────────────────────────
  const goSlide=(i)=>{ saveCur(); setActive(i); };
  const addSlide=()=>{ saveCur(); setSlides(prev=>{ const n=prev.length+1; return [...prev,{ id:'s'+Date.now(), title:'Slide '+n, items:[] }]; }); setActive(slides.length); };

  // ── resources → board ──────────────────────────────────────
  const addRes=(r,xy)=>{ setSlides(prev=>prev.map((sl,i)=> i!==active ? sl : { ...sl, items:[...sl.items, { key:Date.now()+''+Math.random(), rid:r.id, label:r.label, type:r.type, x:(xy?xy.x:70+sl.items.length*28), y:(xy?xy.y:90+sl.items.length*28) }] })); };
  const onDrop=(e)=>{ e.preventDefault(); let id=''; try{ id=e.dataTransfer.getData('text/resource'); }catch(x){} const r=resources.find(x=>x.id===id); if(!r) return; const stage=e.currentTarget.getBoundingClientRect(); addRes(r,{ x:e.clientX-stage.left-70, y:e.clientY-stage.top-22 }); };
  const moveCard=(e,key)=>{
    e.preventDefault();
    const stage=canvasRef.current.parentElement.getBoundingClientRect();
    const onMove=(ev)=>{ const x=ev.clientX-stage.left-70, y=ev.clientY-stage.top-22; setSlides(prev=>prev.map((sl,i)=> i!==active ? sl : { ...sl, items:sl.items.map(it=> it.key===key?{...it,x,y}:it) })); };
    const onUp=()=>{ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); };
    document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
  };
  const removeCard=(key)=> setSlides(prev=>prev.map((sl,i)=> i!==active ? sl : { ...sl, items:sl.items.filter(it=>it.key!==key) }));

  // ── invisible resizer between lesson pane and board ────────
  const startResize=(e)=>{
    e.preventDefault();
    const teach=e.currentTarget.parentElement.getBoundingClientRect();
    const onMove=(ev)=>{ let w=ev.clientX-teach.left; w=Math.max(210, Math.min(teach.width*0.62, w)); setLessonW(w); };
    const onUp=()=>{ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); document.body.style.cursor=''; document.body.style.userSelect=''; };
    document.body.style.cursor='col-resize'; document.body.style.userSelect='none';
    document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
  };

  const slide=slides[active];
  const showLT = active===0 && slide.items.length===0;

  return (
    <div className={'teach'+(fullscreen?' full':'')+(trueFull?' truefull':'')} data-mob={mobLesson?'lesson':'board'} style={{gridTemplateColumns: lessonHidden ? '1fr' : (minimized ? '64px 1fr' : lessonW+'px 1fr'), '--subj':cv(s.c), '--subjink':cv(s.ink)}}>
      <button className="teach-mobtoggle" onClick={()=>setMobLesson(v=>!v)} title={mobLesson?'Show the board':'Show the lesson'}>{mobLesson?'‹ Board':'Lesson ›'}</button>
      {/* lesson pane / rail */}
      {!lessonHidden && (minimized ? (
        <div className="teach-rail" style={{borderTopColor:cv(s.c)}}>
          <window.VS.SubjGlyph id={lesson.subjectId} size={34} radius={11}/>
          <button className="trail-btn" title="Expand lesson plan" onClick={()=>setMin(false)}><TI k="expand"/></button>
          <span className="trail-name">{s.label}</span>
        </div>
      ) : (
        <div className="teach-lesson">
          <div className="lb" style={{background:cv(s.c)}}/>
          <div className="teach-lhead">
            <span className="lhead-btns">
              <button className={'tbtn sm'+(pinned?' on':'')} title={pinned?'Unpin':'Pin (keeps it open in fullscreen)'} onClick={()=>setPinned(p=>!p)}><TI k="pin"/></button>
              <button className="tbtn sm" title="Minimize to the side" onClick={()=>setMin(true)}><TI k="min"/></button>
            </span>
          </div>
          <window.LessonNav state={state} tab={navTab} onTab={setNavTab}
            activeLesson={lesson} activeId={lesson.id} version="A"
            onPickLesson={(l)=>onPick&&onPick(l)}
            onPlanLesson={(l)=>onPlan&&onPlan(l)}
            onPostLesson={(l)=>window.dispatchEvent(new CustomEvent('cc-open-post',{detail:{lesson:l}}))}
            onPickResource={(r)=>addRes(r)} onTeach={(l)=>onPick&&onPick(l)} />
        </div>
      ))}

      {/* board */}
      <div className="teach-board">
        <div className="bdhead">
          <div className="bdtitle">
            {lessonHidden && <button className="tbtn sm" title="Show lesson plan" onClick={()=>setFull(false)}><TI k="expand"/></button>}
            <window.VS.SubjGlyph id={lesson.subjectId} size={28} radius={9}/>
            <span className="nm">{s.full} · {lesson.title}</span>
          </div>
          <div className="bdtools">
            <div className="timer"><span className="tt">{mm}:{ss}</span>
              <button className="tbtn" onClick={()=>setRun(r=>!r)} title={run?'Pause timer':'Start timer'}><TI k={run?'pause':'play'}/></button>
              <button className="tbtn" onClick={()=>{setRun(false);setSec(600);}} title="Reset timer"><TI k="reset"/></button>
            </div>
            <span className="bd-div"/>
            {window.Share && <window.Share.Btn kind="board" id={lesson.id} label={s.full+' · '+lesson.title+' board'} />}
            <button className="tbtn" onClick={()=>setFull(f=>!f)} title={fullscreen?'Exit fullscreen':'Expand board to fullscreen'}><TI k={fullscreen?'exit':'full'}/></button>
            <button className="tbtn" onClick={()=>setTrueFull(f=>!f)} title={trueFull?'Exit fullscreen (Esc)':'Present — true fullscreen (Esc to exit)'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={trueFull?"M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5":"M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3"}/></svg></button>
          </div>
        </div>

        {/* slide filmstrip */}
        <div className="slide-rail">
          {slides.map((sl,i)=>(
            <button key={sl.id} className={'slide-thumb'+(i===active?' on':'')} onClick={()=>goSlide(i)} title={sl.title}>
              <span className="st-n">{i+1}</span><span className="st-t">{sl.title}</span>
            </button>
          ))}
          <button className="slide-addbtn" onClick={addSlide} title="Add a slide"><TI k="plus"/></button>
        </div>

        {/* stage */}
        <div className="board-stage" onDragOver={(e)=>e.preventDefault()} onDrop={onDrop}>
          {bg.type!=='none' && <div className="board-bg">
            {bg.type==='color' && <div className="board-bgfill" style={{background:bg.value}}/>}
            {bg.type==='wash' && <div className="board-bgfill" style={{background:'var(--grad-dawn)'}}/>}
            {bg.type==='photo' && <div className="board-bgfill" style={{backgroundImage:"url('photos/p1.png')",backgroundSize:'cover',backgroundPosition:'center'}}/>}
            {bg.type==='resource' && <div className="board-bgres" style={{width:(bgW*100)+'%',transform:`translateX(-50%) translateY(${bgY}px)`,background:`linear-gradient(160deg, color-mix(in oklab, ${resColor(bg.r.type)} 24%, white), color-mix(in oklab, ${resColor(bg.r.type)} 8%, white))`}}
              onWheel={(e)=>{ setBgY(y=>y - e.deltaY*0.5); }}
              onPointerDown={(e)=>{ bgDrag.current={y:e.clientY,b:bgY}; try{e.target.setPointerCapture(e.pointerId);}catch(x){} }}
              onPointerMove={(e)=>{ if(bgDrag.current){ setBgY(bgDrag.current.b + (e.clientY-bgDrag.current.y)); } }}
              onPointerUp={()=>{ bgDrag.current=null; }}>
              <span className="board-bgres-pill" style={{color:resColor(bg.r.type)}}>{bg.r.type}</span>
              <span className="board-bgres-label">{bg.r.label}</span>
              <span className="board-bgres-hint">drag or scroll to pan</span>
            </div>}
          </div>}
          {bg.type==='resource' && <div className="board-bgwidth">
            <button onClick={()=>setBgW(w=>Math.max(0.6,+(w-0.1).toFixed(2)))} title="Narrower">–</button>
            <span>width</span>
            <button onClick={()=>setBgW(w=>Math.min(1.8,+(w+0.1).toFixed(2)))} title="Wider — fill margins">+</button>
          </div>}
          <canvas ref={canvasRef} className="draw-layer"
            onPointerDown={down} onPointerMove={moveDraw} onPointerUp={up} onPointerLeave={up}
            style={{cursor: tool==='erase'?'cell':'crosshair'}} />
          <div className="slide-content">
            {showLT && <><span className="bsub">Learning target</span><div className="bobj">{lesson.objective}</div></>}
            {slide.items.map(it=>(
              <div key={it.key} className="board-card" style={{left:it.x,top:it.y}} onMouseDown={(e)=>moveCard(e,it.key)}>
                <span className="bc-pill" style={{background:`color-mix(in oklab, ${resColor(it.type)} 18%, white)`, color:resColor(it.type)}}>{it.type}</span>
                <span className="bc-label">{it.label}</span>
                <button className="bc-x" title="Remove" onMouseDown={(e)=>e.stopPropagation()} onClick={()=>removeCard(it.key)}><TI k="x"/></button>
              </div>
            ))}
          </div>
        </div>

        {/* writing bar */}
        <div className="write-bar">
          {[['pen','Pen'],['mark','Highlighter'],['erase','Eraser'],['text','Text']].map(([k,lab])=>(
            <button key={k} className={'wb-btn'+(tool===k?' on':'')} title={lab} onClick={()=>setTool(k)}><TI k={k}/></button>
          ))}
          <span className="wb-div"/>
          {COLORS.map(c=>(
            <button key={c} className={'wb-color'+(color===c?' on':'')} style={{background:c}} title="Ink color" onClick={()=>setColor(c)}/>
          ))}
          <span className="wb-div"/>
          <button className="wb-btn" title="Clear the board" onClick={clearBoard}><TI k="trash"/></button>
          <span style={{flex:1}}/>
          <div className="wb-respop-wrap">
            <button className="wb-btn lbl" title="Add a resource to the board" onClick={()=>setResOpen(o=>!o)}><TI k="plus"/>Resource</button>
            {resOpen &&
              <div className="wb-respop">
                {resources.map(r=>(
                  <button key={r.id} className="wb-resrow" onClick={()=>{ addRes(r); setResOpen(false); }}>
                    <span className="lp-res-pill" style={{background:`color-mix(in oklab, ${resColor(r.type)} 18%, white)`, color:resColor(r.type)}}>{r.type}</span>{r.label}
                  </button>
                ))}
              </div>}
          </div>
          <div className="wb-respop-wrap bgwrap">
            <button className="wb-btn lbl" title="Board background" onClick={()=>setBgOpen(o=>!o)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15l5-5 4 4 3-3 6 6"/><circle cx="9" cy="9" r="1.4"/></svg>Background</button>
            {bgOpen && <div className="bgpop up" onMouseLeave={()=>setBgOpen(false)}>
              <div className="bgpop-lbl">Color</div>
              <div className="bgcolors">{['#FFFFFF','#1C1B2E',`var(${s.c})`,'#FFF6E6','#E6F1FF','#FCE4EF'].map(c=><button key={c} style={{background:c}} title="Solid color" onClick={()=>{setBg({type:'color',value:c});setBgOpen(false);}}/>)}</div>
              <div className="bgpop-lbl">Wash</div>
              <div className="bgwashes">{[['--grad-dawn','Dawn'],['--grad-honey','Honey'],['--grad-mint','Mint'],['--grad-brand','Sky'],['--grad-hero','Hero']].map(([g,n])=>(
                <button key={g} title={n} style={{background:`var(${g})`}} onClick={()=>{setBg({type:'wash',value:`var(${g})`});setBgOpen(false);}}/>
              ))}</div>
              <div className="bgpop-lbl">Photo</div>
              <div className="bgphotos">
                {['photos/p1.png','photos/p2.png','photos/p3.png','photos/p4.png'].map(p=>(
                  <button key={p} title="Photo library" style={{backgroundImage:`url('${p}')`}} onClick={()=>{setBg({type:'photo',value:p});setBgOpen(false);}}/>
                ))}
                <label className="bgupload" title="Upload an image">+
                  <input type="file" accept="image/*" style={{display:'none'}} onChange={(e)=>{ const f=e.target.files&&e.target.files[0]; if(f){ const u=URL.createObjectURL(f); setBg({type:'photo',value:u}); setBgOpen(false); } }}/>
                </label>
              </div>
              {resources.filter(r=>r.type==='Image').length>0 && <React.Fragment>
                <div className="bgpop-lbl">From lesson images</div>
                {resources.filter(r=>r.type==='Image').map(r=>(
                  <button key={r.id} className="bgpop-row" onClick={()=>{setBg({type:'photo',value:r.url});setBgOpen(false);}}><span className="bgpop-pill" style={{background:`color-mix(in oklab, ${resColor(r.type)} 18%, white)`,color:resColor(r.type)}}>IMG</span>{r.label}</button>
                ))}
              </React.Fragment>}
              <div className="bgpop-lbl">Resource</div>
              {resources.slice(0,5).map(r=><button key={r.id} className="bgpop-row res" onClick={()=>{setBg({type:'resource',r});setBgW(1);setBgY(0);setBgOpen(false);}}><span className="bgpop-pill" style={{background:`color-mix(in oklab, ${resColor(r.type)} 18%, white)`,color:resColor(r.type)}}>{r.type}</span>{r.label}</button>)}
              <button className="bgpop-row off" onClick={()=>{setBg({type:'none'});setBgOpen(false);}}>None</button>
            </div>}
          </div>
        </div>
      </div>
      {!minimized && !lessonHidden &&
        <div className="teach-resizer" style={{left:lessonW}} onMouseDown={startResize} title="Drag to resize the lesson plan and board"/>}
    </div>
  );
}

window.TeachView = TeachView;
})();
