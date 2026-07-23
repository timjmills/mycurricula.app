/* Teach board — minimizable/pinnable lesson pane, fullscreen board, slides,
   annotation (writing) bar, and resources you can click or drag onto the board. */
(function(){
const { useState, useRef, useEffect, useCallback } = React;
const { SUBJECTS, RESTYPES, fmt } = window.DS;
const cv = (x)=>`var(${x})`;
const SEQ = ['Warm-up','Mini-lesson','Guided practice','Exit ticket'];
const SEQ_MIN=[5,15,20,5];
const chime=()=>{ try{ const a=new (window.AudioContext||window.webkitAudioContext)(); [0,0.35].forEach(t=>{ const o=a.createOscillator(),g=a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value=t?660:880; g.gain.setValueAtTime(.12,a.currentTime+t); g.gain.exponentialRampToValueAtTime(.001,a.currentTime+t+.8); o.start(a.currentTime+t); o.stop(a.currentTime+t+.85); }); }catch(e){} };
const seedSlides=(lesson)=>{ let dur=45; try{ dur=Math.max(15, window.DS.toMin(lesson.end)-window.DS.toMin(lesson.start)); }catch(e){}
  return [{ id:'s1-'+lesson.id, title:'Learning target', items:[], min:Math.max(3,Math.round(5/45*dur)) },
    ...SEQ.map((t,i)=>({ id:'sq'+(i+1)+'-'+lesson.id, title:t, items:[], min:Math.max(3,Math.round(SEQ_MIN[i]/45*dur)) }))];
};
const COLORS = ['#3B6CF6','#EF5A5A','#16A06B','#1C1B2E'];
const TL=()=>{ try{ return JSON.parse(localStorage.getItem('cc_teach_layout'))||{}; }catch(e){ return {}; } };

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
    case 'laser': return <svg {...p}><circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3M6.2 6.2l2 2M15.8 15.8l2 2M17.8 6.2l-2 2M8.2 15.8l-2 2"/></svg>;
    case 'fade':  return <svg {...p}><path d="M4 16c3-6 5 4 8-2s5 0 8-6" strokeDasharray="3 3"/></svg>;
    case 'awake': return <svg {...p}><circle cx="12" cy="12" r="3.4"/><path d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7"/></svg>;
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
const isImgRes=(r)=>!!r&&(r.type==='Image'||/\.(png|jpe?g|gif|webp)(\?|$)/i.test(r.url||''));
const isPdfRes=(r)=>!!r&&(r.type==='PDF'||/\.pdf(\?|$)/i.test(r.url||''));
const liveUrl=(r)=>!!(r&&r.url&&r.url!=='#');
let _upn=1;
const fileToRes=(f)=>({ id:'up'+Date.now()+'-'+(_upn++), label:f.name.replace(/\.[a-z0-9]+$/i,''), type:(f.type.startsWith('image/')?'Image':f.type==='application/pdf'?'PDF':'Doc'), url:URL.createObjectURL(f), uploaded:true });

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
  const [uploads,setUploads]=useState([]);
  const [editingText,setEditingText]=useState(null);
  const [sizes,setSizes]=useState({pen:'m',mark:'m',fade:'m'});
  const [keepAwake,setKeepAwake]=useState(()=>!!TL().awake);
  const [inkRev,setInkRev]=useState(0);
  const resources = [...window.DS.resourcesFor(lesson), ...uploads];
  const [minimized,setMin]=useState(()=>!!TL().min);
  const [pinned,setPinned]=useState(()=>!!TL().pin);
  const [fullscreen,setFull]=useState(false);
  const [mobLesson,setMobLesson]=useState(false);
  const [trueFull,setTrueFull]=useState(false);
  const [sec,setSec]=useState(600);
  const [run,setRun]=useState(false);
  const [slides,setSlides]=useState(()=>seedSlides(lesson));
  const [bg,setBg]=useState({type:'none'});
  const [bgOpen,setBgOpen]=useState(false);
  const [bgW,setBgW]=useState(1);
  const [bgY,setBgY]=useState(0);
  const bgDrag=useRef(null);
  const [active,setActive]=useState(0);
  const [tool,setTool]=useState('pen');
  const [color,setColor]=useState('#3B6CF6');
  const [resOpen,setResOpen]=useState(false);
  const [lessonW,setLessonW]=useState(()=>TL().w||320);
  const [split,setSplit]=useState(()=>TL().split||0.55);
  const [cA,setCA]=useState(()=>!!TL().cA);
  const [cB,setCB]=useState(()=>!!TL().cB);
  const [peek,setPeek]=useState(false);
  const splitRef=useRef(null);
  useEffect(()=>{ try{ localStorage.setItem('cc_teach_layout',JSON.stringify({min:minimized,pin:pinned,w:lessonW,split,cA,cB,awake:keepAwake})); }catch(e){} },[minimized,pinned,lessonW,split,cA,cB,keepAwake]);
  useEffect(()=>{ if(!peek) return; const h=(e)=>{ const t2=e.target; if(t2&&t2.closest&&!t2.closest('.teach-lesson.peekpane')&&!t2.closest('.teach-peektab')) setPeek(false); }; document.addEventListener('pointerdown',h); return ()=>document.removeEventListener('pointerdown',h); },[peek]);

  useEffect(()=>{ // lesson changes — restore its saved board, else seed from the flow
    let loaded=null; try{ loaded=JSON.parse(localStorage.getItem('cc_board_'+lesson.id)); }catch(e){}
    if(loaded&&loaded.slides&&loaded.slides.length){ setSlides(loaded.slides); store.current=loaded.ink||{}; setActive(Math.min(loaded.active||0,loaded.slides.length-1)); setBg(loaded.bg||{type:'none'}); }
    else { setSlides(seedSlides(lesson)); setActive(0); store.current={}; setBg({type:'none'}); }
    undoStack.current=[]; redoStack.current=[]; setEditingText(null);
  },[lesson.id]);

  useEffect(()=>{ if(!run) return; const id=setInterval(()=>setSec(x=>{ if(x<=1){ setRun(false); chime(); return 0; } return x-1; }),1000); return ()=>clearInterval(id); },[run]);
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
  const sizeRef=useRef(sizes); useEffect(()=>{sizeRef.current=sizes},[sizes]);
  const fadeRef=useRef(null); const laserRef=useRef(null);
  const undoStack=useRef([]); const redoStack=useRef([]);
  const lineMode=useRef(false); const baseImg=useRef(null);
  const prevBgRef=useRef(null); const kbRef=useRef({});
  const SZ={pen:{s:1.6,m:3,l:6},mark:{s:9,m:16,l:26},fade:{s:3,m:5,l:8}};

  const saveCur=()=>{ const c=canvasRef.current; if(c) store.current[slides[prevSlide.current]?.id]=c.toDataURL(); };
  const loadCur=()=>{ const c=canvasRef.current; if(!c) return; const ctx=c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height); const url=store.current[slides[active]?.id]; if(url){ const img=new Image(); img.onload=()=>ctx.drawImage(img,0,0,c.width,c.height); img.src=url; } };
  const fit=()=>{ const c=canvasRef.current; if(!c) return; const r=c.parentElement.getBoundingClientRect(); if(!r.width) return;
    const W=Math.max(1,Math.round(r.width)), H=Math.max(1,Math.round(r.height));
    const fc=fadeRef.current;
    if(c.width===W&&c.height===H&&(!fc||(fc.width===W&&fc.height===H))) return;   /* size unchanged — break RO feedback loop (fractional rects never === int canvas attrs) */
    [canvasRef,fadeRef].forEach(ref=>{ const cc=ref.current; if(cc){ cc.width=W; cc.height=H; } }); loadCur(); };

  useEffect(()=>{ fit(); const ro=('ResizeObserver'in window)?new ResizeObserver(()=>fit()):null; const stage=canvasRef.current?.parentElement; if(ro&&stage) ro.observe(stage); return ()=>ro&&ro.disconnect(); },[]); // eslint-disable-line
  useEffect(()=>{ // layout changed → refit (size shift)
    const c=canvasRef.current; if(!c) return; saveCur(); const r=c.parentElement.getBoundingClientRect();
    if(r.width){ const W=Math.round(r.width),H=Math.round(r.height); if(c.width!==W||c.height!==H){ c.width=W; c.height=H; loadCur(); } }
  },[fullscreen,minimized,pinned]); // eslint-disable-line
  useEffect(()=>{ loadCur(); prevSlide.current=active; },[active]); // eslint-disable-line

  const pos=(e)=>{ const r=canvasRef.current.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top }; };
  const applyTool=(ctx)=>{
    ctx.lineCap='round'; ctx.lineJoin='round';
    const z=sizeRef.current;
    if(toolRef.current==='erase'){ ctx.globalCompositeOperation='destination-out'; ctx.globalAlpha=1; ctx.lineWidth=26; }
    else if(toolRef.current==='mark'){ ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=.3; ctx.strokeStyle=colorRef.current; ctx.lineWidth=SZ.mark[z.mark]||16; }
    else if(toolRef.current==='fade'){ ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=.95; ctx.strokeStyle=colorRef.current; ctx.lineWidth=SZ.fade[z.fade]||5; }
    else { ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1; ctx.strokeStyle=colorRef.current; ctx.lineWidth=SZ.pen[z.pen]||3; }
  };
  const pushUndo=()=>{ const c=canvasRef.current; if(!c) return; undoStack.current.push({sid:slides[active]&&slides[active].id,url:c.toDataURL()}); if(undoStack.current.length>40) undoStack.current.shift(); redoStack.current=[]; };
  const restoreInk=(url)=>{ const c=canvasRef.current; if(!c) return; const ctx=c.getContext('2d'); ctx.clearRect(0,0,c.width,c.height); if(url){ const img=new Image(); img.onload=()=>ctx.drawImage(img,0,0,c.width,c.height); img.src=url; } store.current[slides[active].id]=url; setInkRev(v=>v+1); };
  const doUndo=()=>{ const u=undoStack.current, sid=slides[active]&&slides[active].id;
    for(let i=u.length-1;i>=0;i--){ if(u[i].sid===sid){ const [e]=u.splice(i,1); redoStack.current.push({sid,url:canvasRef.current.toDataURL()}); restoreInk(e.url); return; } } };
  const doRedo=()=>{ const r2=redoStack.current, sid=slides[active]&&slides[active].id;
    for(let i=r2.length-1;i>=0;i--){ if(r2[i].sid===sid){ const [e]=r2.splice(i,1); undoStack.current.push({sid,url:canvasRef.current.toDataURL()}); restoreInk(e.url); return; } } };
  const down=(e)=>{
    if(toolRef.current==='laser') return;
    if(toolRef.current==='text'){ const p=pos(e); const key=Date.now()+''+Math.random();
      setSlides(prev=>prev.map((sl,i)=>i!==active?sl:{...sl,items:[...sl.items,{key,kind:'text',text:'',x:p.x,y:Math.max(4,p.y-14),color:colorRef.current}]}));
      setEditingText(key); return; }
    if(toolRef.current!=='fade') pushUndo();
    drawing.current=true; last.current=pos(e);
    lineMode.current=e.shiftKey&&(toolRef.current==='pen'||toolRef.current==='mark');
    if(lineMode.current){ const im=new Image(); im.src=canvasRef.current.toDataURL(); baseImg.current=im; }
    try{e.target.setPointerCapture(e.pointerId);}catch(x){} };
  const moveDraw=(e)=>{
    const p=pos(e);
    if(toolRef.current==='laser'){ const d=laserRef.current; if(d){ d.style.display='block'; d.style.transform='translate('+(p.x-9)+'px,'+(p.y-9)+'px)'; } return; }
    if(!drawing.current) return;
    const onFade=toolRef.current==='fade';
    const c=(onFade?fadeRef:canvasRef).current; if(!c) return; const ctx=c.getContext('2d');
    if(lineMode.current){ ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1; ctx.clearRect(0,0,c.width,c.height);
      if(baseImg.current&&baseImg.current.complete) ctx.drawImage(baseImg.current,0,0,c.width,c.height);
      applyTool(ctx); ctx.beginPath(); ctx.moveTo(last.current.x,last.current.y); ctx.lineTo(p.x,p.y); ctx.stroke(); return; }
    applyTool(ctx); ctx.beginPath(); ctx.moveTo(last.current.x,last.current.y); ctx.lineTo(p.x,p.y); ctx.stroke(); last.current=p; };
  const up=()=>{ if(drawing.current){ drawing.current=false; lineMode.current=false;
    if(toolRef.current!=='fade'&&toolRef.current!=='laser'){ saveCur(); setInkRev(v=>v+1); } } };
  const clearBoard=()=>{ pushUndo(); const c=canvasRef.current; if(c){ c.getContext('2d').clearRect(0,0,c.width,c.height); store.current[slides[active].id]=null; setInkRev(v=>v+1); } const f=fadeRef.current; if(f){ f.getContext('2d').clearRect(0,0,f.width,f.height); } };
  const updateItem=(key,patch)=>setSlides(prev=>prev.map((sl,i)=>i!==active?sl:{...sl,items:sl.items.map(x=>x.key===key?{...x,...patch}:x)}));
  const textToBoard=(txt)=>{ if(!txt) return; const key=Date.now()+''+Math.random();
    setSlides(prev=>prev.map((sl,i)=>i!==active?sl:{...sl,items:[...sl.items,{key,kind:'text',text:txt,x:110,y:120,color:'#1C1B2E'}]})); };
  useEffect(()=>{ const iv=setInterval(()=>{ const c=fadeRef.current; if(!c||!c.width) return; const ctx=c.getContext('2d'); ctx.globalCompositeOperation='destination-out'; ctx.fillStyle='rgba(0,0,0,.10)'; ctx.fillRect(0,0,c.width,c.height); },90); return ()=>clearInterval(iv); },[]);
  useEffect(()=>{ const d=laserRef.current; if(d&&tool!=='laser') d.style.display='none'; },[tool]);
  useEffect(()=>{ if(!keepAwake) return; let lock=null;
    const req=async()=>{ try{ if('wakeLock' in navigator){ lock=await navigator.wakeLock.request('screen'); } }catch(e){} };
    req();
    const iv=setInterval(()=>{ if(document.visibilityState==='visible'&&(!lock||lock.released)) req(); },30000);
    const vis=()=>{ if(document.visibilityState==='visible') req(); };
    document.addEventListener('visibilitychange',vis);
    return ()=>{ clearInterval(iv); document.removeEventListener('visibilitychange',vis); try{ lock&&lock.release(); }catch(e){} };
  },[keepAwake]);
  useEffect(()=>{ const h=(e)=>{ const t=e.target;
    if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable)) return;
    const K=kbRef.current;
    if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'){ e.preventDefault(); K.doUndo&&K.doUndo(); return; }
    if((e.ctrlKey||e.metaKey)&&(e.key.toLowerCase()==='y'||(e.shiftKey&&e.key.toLowerCase()==='z'))){ e.preventDefault(); K.doRedo&&K.doRedo(); return; }
    if(e.ctrlKey||e.metaKey||e.altKey) return;
    if(e.key==='ArrowRight'&&K.goSlide&&K.active<K.slides.length-1){ K.goSlide(K.active+1); }
    else if(e.key==='ArrowLeft'&&K.goSlide&&K.active>0){ K.goSlide(K.active-1); }
    else if(e.key==='f'||e.key==='F'){ setFull(f=>!f); }
    else if(e.key==='t'||e.key==='T'){ setRun(r=>!r); }
    else if(e.key==='1'){ setTool('pen'); } else if(e.key==='2'){ setTool('mark'); }
    else if(e.key==='3'){ setTool('erase'); } else if(e.key==='4'){ setTool('text'); }
    else if(e.key==='b'||e.key==='B'){ setBg(prev=>{ if(prev.type==='color'&&prev.value==='#14131F'){ return prevBgRef.current||{type:'none'}; } prevBgRef.current=prev; return {type:'color',value:'#14131F'}; }); }
    else if(e.key==='w'||e.key==='W'){ setBg(prev=>{ if(prev.type==='color'&&prev.value==='#FFFFFF'){ return prevBgRef.current||{type:'none'}; } prevBgRef.current=prev; return {type:'color',value:'#FFFFFF'}; }); }
  }; document.addEventListener('keydown',h); return ()=>document.removeEventListener('keydown',h); },[]);
  useEffect(()=>{ const t=setTimeout(()=>{ try{
    const clean=slides.map(sl=>({...sl,items:sl.items.map(it=> it.url&&String(it.url).startsWith('blob:')?{...it,url:undefined}:it)}));
    const bgSafe=(bg&&bg.value&&String(bg.value).startsWith('blob:'))?{type:'none'}:(bg&&bg.r&&bg.r.url&&String(bg.r.url).startsWith('blob:')?{type:'none'}:bg);
    localStorage.setItem('cc_board_'+lesson.id, JSON.stringify({v:1,slides:clean,bg:bgSafe,ink:store.current,active}));
  }catch(e){} },600); return ()=>clearTimeout(t); },[slides,bg,active,inkRev,lesson.id]);

  // ── slides ─────────────────────────────────────────────────
  const goSlide=(i)=>{ saveCur(); setActive(i); const m=slides[i]&&slides[i].min; if(m){ setRun(false); setSec(m*60); } };
  const addSlide=()=>{ saveCur(); setSlides(prev=>{ const n=prev.length+1; return [...prev,{ id:'s'+Date.now(), title:'Slide '+n, items:[], min:10 }]; }); setActive(slides.length); };
  const dragSlide=useRef(null);
  const dropSlide=(to)=>{ const from=dragSlide.current; dragSlide.current=null; if(from==null||from===to) return; saveCur();
    setSlides(prev=>{ const a=prev.slice(); const [m]=a.splice(from,1); a.splice(to,0,m); return a; });
    setActive(p=> from===p ? to : (from<p&&to>=p ? p-1 : (from>p&&to<=p ? p+1 : p))); };
  const moveSlide=(i,d)=>{ const to=i+d; if(to<0||to>=slides.length) return; saveCur();
    setSlides(prev=>{ const a=prev.slice(); const [m]=a.splice(i,1); a.splice(to,0,m); return a; });
    setActive(p=> i===p ? to : (i<p&&to>=p ? p-1 : (i>p&&to<=p ? p+1 : p))); };
  const renameSlide=(i)=>{ const t=prompt('Slide name:',slides[i].title); if(t&&t.trim()) setSlides(prev=>prev.map((sl,j)=>j===i?{...sl,title:t.trim()}:sl)); };
  const dupSlide=(i)=>{ saveCur(); const nid='s'+Date.now(); const src=slides[i];
    if(store.current[src.id]) store.current[nid]=store.current[src.id];
    setSlides(prev=>[...prev.slice(0,i+1),{...src,id:nid,title:src.title+' copy',items:src.items.map(it=>({...it,key:it.key+'c'}))},...prev.slice(i+1)]);
    setActive(i+1); };
  const delSlide=(i)=>{ if(slides.length<2) return; delete store.current[slides[i].id];
    setSlides(prev=>prev.filter((_,j)=>j!==i));
    setActive(p=> p===i ? Math.max(0,i-1) : (p>i ? p-1 : p)); };
  kbRef.current={active,slides,goSlide,doUndo,doRedo};

  // ── resources → board ──────────────────────────────────────
  const addRes=(r,xy)=>{ const doc=r.type!=='Link';
    setSlides(prev=>prev.map((sl,i)=> i!==active ? sl : { ...sl, items:[...sl.items, { key:Date.now()+''+Math.random(), rid:r.id, label:r.label, type:r.type, url:r.url, kind:doc?'doc':'chip', w:doc?340:undefined, h:doc?250:undefined, x:(xy?xy.x:70+sl.items.length*28), y:(xy?xy.y:90+sl.items.length*28) }] })); };
  const presentRes=(r)=>{ setBg({type:'resource',r}); setBgW(1); setBgY(0); };
  const onDrop=(e)=>{ e.preventDefault();
    const stage=e.currentTarget.getBoundingClientRect();
    const fs=e.dataTransfer&&e.dataTransfer.files;
    if(fs&&fs.length){ [...fs].forEach((f,i)=>{ const r=fileToRes(f); setUploads(u=>[...u,r]); addRes(r,{ x:e.clientX-stage.left-70+i*24, y:e.clientY-stage.top-22+i*24 }); }); return; }
    let id=''; try{ id=e.dataTransfer.getData('text/resource'); }catch(x){} const r=resources.find(x=>x.id===id); if(!r) return; addRes(r,{ x:e.clientX-stage.left-70, y:e.clientY-stage.top-22 }); };
  useEffect(()=>{ const h=(e)=>{ const fs=e.clipboardData&&e.clipboardData.files; if(fs&&fs.length){ const r=fileToRes(fs[0]); setUploads(u=>[...u,r]); addRes(r,{x:120,y:110}); } };
    document.addEventListener('paste',h); return ()=>document.removeEventListener('paste',h); },[active]); // eslint-disable-line
  const moveCard=(e,key)=>{
    e.preventDefault();
    const stage=canvasRef.current.parentElement.getBoundingClientRect();
    const onMove=(ev)=>{ const x=ev.clientX-stage.left-70, y=ev.clientY-stage.top-22; setSlides(prev=>prev.map((sl,i)=> i!==active ? sl : { ...sl, items:sl.items.map(it=> it.key===key?{...it,x,y}:it) })); };
    const onUp=()=>{ document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp); };
    document.addEventListener('pointermove',onMove); document.addEventListener('pointerup',onUp);
  };
  const removeCard=(key)=> setSlides(prev=>prev.map((sl,i)=> i!==active ? sl : { ...sl, items:sl.items.filter(it=>it.key!==key) }));
  const resizeCard=(e,key)=>{ e.stopPropagation(); e.preventDefault();
    const it=slides[active].items.find(i=>i.key===key); if(!it) return;
    const x0=e.clientX,y0=e.clientY,w0=it.w||340,h0=it.h||250;
    const onMove=(ev)=>{ const w=Math.max(180,w0+(ev.clientX-x0)), h=Math.max(120,h0+(ev.clientY-y0));
      setSlides(prev=>prev.map((sl,i)=> i!==active ? sl : { ...sl, items:sl.items.map(x=> x.key===key?{...x,w,h}:x) })); };
    const onUp=()=>{ document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp); };
    document.addEventListener('pointermove',onMove); document.addEventListener('pointerup',onUp); };

  // ── invisible resizer between lesson pane and board ────────
  const startResize=(e)=>{
    e.preventDefault();
    const teach=e.currentTarget.parentElement.getBoundingClientRect();
    const onMove=(ev)=>{ let w=ev.clientX-teach.left; w=Math.max(210, Math.min(teach.width*0.62, w)); setLessonW(w); };
    const onUp=()=>{ document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp); document.body.style.cursor=''; document.body.style.userSelect=''; };
    document.body.style.cursor='col-resize'; document.body.style.userSelect='none';
    document.addEventListener('pointermove',onMove); document.addEventListener('pointerup',onUp);
  };
  const snapCycle=(e)=>{ const tw=e.currentTarget.parentElement.getBoundingClientRect().width;
    if(lessonW < tw*0.4){ setLessonW(Math.round(tw*0.48)); } else { setMin(true); } };
  const splitDrag=(e)=>{ e.preventDefault(); if(!splitRef.current) return;
    const rect=splitRef.current.getBoundingClientRect();
    const onMove=(ev)=>{ let f=(ev.clientY-rect.top)/rect.height; f=Math.max(0.15,Math.min(0.85,f)); setSplit(f); };
    const onUp=()=>{ document.removeEventListener('pointermove',onMove); document.removeEventListener('pointerup',onUp); document.body.style.cursor=''; document.body.style.userSelect=''; };
    document.body.style.cursor='row-resize'; document.body.style.userSelect='none';
    document.addEventListener('pointermove',onMove); document.addEventListener('pointerup',onUp);
  };

  /* merged side panel — lesson plan on top, resources below, draggable split */
  const paneInner=(
    <React.Fragment>
      <div className="lb" style={{background:cv(s.c)}}/>
      <div className="teach-lhead">
        <span className="lhead-btns">
          <button className={'tbtn sm'+(pinned?' on':'')} title={pinned?'Unpin':'Pin (keeps it open in fullscreen)'} onClick={()=>setPinned(p=>!p)}><TI k="pin"/></button>
          <button className="tbtn sm" title="Minimize to the side" onClick={()=>setMin(true)}><TI k="min"/></button>
        </span>
      </div>
      <div className="tl-split" ref={splitRef}>
        <div className={'tl-sec'+(cA?' closed':'')} style={cA?undefined:{flexGrow:split*100}}>
          <button className="tl-sechead" title={cA?'Show the lesson plan':'Collapse the lesson plan'} onClick={()=>setCA(v=>!v)}><i className={'ch'+(cA?'':' open')}>▸</i>Lesson plan</button>
          {!cA && <window.LessonNav state={state} tab="lessons" hideTabs
            activeLesson={lesson} activeId={lesson.id} version="A"
            onPickLesson={(l)=>onPick&&onPick(l)}
            onPlanLesson={(l)=>onPlan&&onPlan(l)}
            onPostLesson={(l)=>window.dispatchEvent(new CustomEvent('cc-open-post',{detail:{lesson:l}}))}
            onToBoard={(l)=>textToBoard(l.objective||l.title)}
            onTeach={(l)=>onPick&&onPick(l)} />}
        </div>
        <div className="tl-divider" title="Drag to resize · double-click to even out" onPointerDown={splitDrag} onDoubleClick={()=>setSplit(0.55)}><span></span></div>
        <div className={'tl-sec'+(cB?' closed':'')} style={cB?undefined:{flexGrow:(1-split)*100}}>
          <button className="tl-sechead" title={cB?'Show resources':'Collapse resources'} onClick={()=>setCB(v=>!v)}><i className={'ch'+(cB?'':' open')}>▸</i>Resources</button>
          {!cB && <window.LessonNav state={state} tab="resources" hideTabs
            onPickResource={(r)=>addRes(r)} onPresentResource={presentRes} />}
        </div>
      </div>
    </React.Fragment>
  );

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
        <div className="teach-lesson">{paneInner}</div>
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
            {(()=>{ const day=state.days[state.todayIdx]; const i=day.lessons.findIndex(l=>l.id===lesson.id);
              const nx = (i>=0&&i<day.lessons.length-1) ? day.lessons[i+1] : null;
              return nx ? <button className="upnext" title={'Up next · '+fmt(nx.start)+' — switch the board to it'} onClick={()=>onPick&&onPick(nx)}>
                <span className="un-k">Up next</span><span className="un-t">{nx.title}</span>›</button> : null; })()}
            <div className="timer"><span className="tt">{mm}:{ss}</span>
              <button className="tbtn" onClick={()=>setRun(r=>!r)} title={run?'Pause timer':'Start timer'}><TI k={run?'pause':'play'}/></button>
              <button className="tbtn" onClick={()=>{setRun(false);setSec((slide.min||10)*60);}} title={'Reset to this step\u2019s '+(slide.min||10)+' minutes'}><TI k="reset"/></button>
              {[5,10,15].map(n=><button key={n} className="timer-chip" title={n+' minutes'} onClick={()=>{ setRun(false); setSec(n*60); }}>{n}</button>)}
            </div>
            <button className={'tbtn'+(keepAwake?' on':'')} title={keepAwake?'Screen staying awake — uses the browser\u2019s wake lock so the display doesn\u2019t sleep mid-lesson (school policies can still override). Click to turn off.':'Keep the screen awake during class — stops the display sleeping mid-lesson (browser wake lock)'}
              onClick={()=>setKeepAwake(v=>!v)}><TI k="awake"/></button>
            <span className="bd-div"/>
            {window.Share && <window.Share.Btn kind="board" id={lesson.id} label={s.full+' · '+lesson.title+' board'} />}
            <button className="tbtn" onClick={()=>setFull(f=>!f)} title={fullscreen?'Exit fullscreen':'Expand board to fullscreen'}><TI k={fullscreen?'exit':'full'}/></button>
            <button className="tbtn" onClick={()=>setTrueFull(f=>!f)} title={trueFull?'Exit fullscreen (Esc)':'Present — true fullscreen (Esc to exit)'}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={trueFull?"M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5":"M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3"}/></svg></button>
          </div>
        </div>

        {/* slide filmstrip */}
        <div className="slide-rail">
          {slides.map((sl,i)=>(
            <div key={sl.id} className={'slide-thumb'+(i===active?' on':'')} role="button" tabIndex={0}
              onClick={()=>goSlide(i)} onDoubleClick={()=>renameSlide(i)}
              title={sl.title+' — click to open · double-click to rename · drag to reorder'}
              draggable onDragStart={()=>{ dragSlide.current=i; }} onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>{ e.preventDefault(); dropSlide(i); }}>
              <span className="st-n">{i+1}</span><span className="st-t">{sl.title}</span>
              {sl.min?<span className="st-min">{sl.min}m</span>:null}
              <span className="st-acts">
                {i>0 && <button title="Move earlier" onClick={(e)=>{ e.stopPropagation(); moveSlide(i,-1); }}>‹</button>}
                {i<slides.length-1 && <button title="Move later" onClick={(e)=>{ e.stopPropagation(); moveSlide(i,1); }}>›</button>}
                <button title="Duplicate slide" onClick={(e)=>{ e.stopPropagation(); dupSlide(i); }}>⧉</button>
                {slides.length>1 && <button title="Delete slide" onClick={(e)=>{ e.stopPropagation(); delSlide(i); }}>×</button>}
              </span>
            </div>
          ))}
          <button className="slide-addbtn" onClick={addSlide} title="Add a slide"><TI k="plus"/></button>
        </div>

        {/* stage */}
        <div className="board-stage" onDragOver={(e)=>e.preventDefault()} onDrop={onDrop}>
          {bg.type!=='none' && <div className="board-bg">
            {bg.type==='color' && <div className="board-bgfill" style={{background:bg.value}}/>}
            {bg.type==='wash' && <div className="board-bgfill" style={{background:'var(--grad-dawn)'}}/>}
            {bg.type==='photo' && <div className="board-bgfill" style={{backgroundImage:"url('photos/p1.png')",backgroundSize:'cover',backgroundPosition:'center'}}/>}
            {bg.type==='resource' && <div className="board-bgres real" style={{width:(bgW*100)+'%',transform:`translateX(-50%) translateY(${bgY}px)`}}
              onWheel={(e)=>{ setBgY(y=>y - e.deltaY*0.5); }}
              onPointerDown={(e)=>{ if(e.target&&e.target.closest&&e.target.closest('iframe')) return; bgDrag.current={y:e.clientY,b:bgY}; try{e.target.setPointerCapture(e.pointerId);}catch(x){} }}
              onPointerMove={(e)=>{ if(bgDrag.current){ setBgY(bgDrag.current.b + (e.clientY-bgDrag.current.y)); } }}
              onPointerUp={()=>{ bgDrag.current=null; }}>
              {isImgRes(bg.r)&&liveUrl(bg.r) ? <img className="bgres-img" src={bg.r.url} alt={bg.r.label} draggable={false}/>
               : isPdfRes(bg.r)&&liveUrl(bg.r) ? <iframe className="bgres-frame" src={bg.r.url} title={bg.r.label}></iframe>
               : <div className="bgres-page">
                   <div className="bp-head"><span className="board-bgres-pill" style={{color:resColor(bg.r.type)}}>{bg.r.type}</span><b>{bg.r.label}</b></div>
                   <div className="bp-lines">{Array.from({length:16}).map((_,i)=><i key={i} style={{width:(88-(i%4)*14)+'%'}}></i>)}</div>
                 </div>}
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
            style={{cursor: tool==='erase'?'cell':tool==='laser'?'none':tool==='text'?'text':'crosshair'}} />
          <canvas ref={fadeRef} className="draw-layer fade-layer" />
          <div ref={laserRef} className="laser-dot"></div>
          <div className="slide-content">
            {showLT && <><span className="bsub">Learning target</span><div className="bobj">{lesson.objective}</div>
              {resources.length>0 && <div className="bc-ghosts">
                {resources.slice(0,3).map(r=>(
                  <button key={r.id} className="bc-ghost" title="Staged from this lesson — tap to place on the board" onClick={()=>addRes(r)}>
                    <span className="bc-pill" style={{background:`color-mix(in oklab, ${resColor(r.type)} 18%, white)`, color:resColor(r.type)}}>{r.type}</span>
                    <span className="bg-lab">{r.label}</span><i>tap to add</i>
                  </button>))}
              </div>}
            </>}
            {slide.items.map(it=> it.kind==='text' ? (
              <div key={it.key} className="board-text" style={{left:it.x,top:it.y,color:it.color||'#1C1B2E'}}>
                <span className="bt-grip" title="Drag to move" onPointerDown={(e)=>moveCard(e,it.key)}><TI k="grip"/></span>
                <div className="bt-body" contentEditable suppressContentEditableWarning
                  ref={el=>{ if(el&&!el.__init){ el.__init=true; el.textContent=it.text||''; if(editingText===it.key){ setTimeout(()=>el.focus(),30); } } }}
                  onPointerDown={(e)=>e.stopPropagation()}
                  onBlur={(e)=>{ const t2=e.currentTarget.textContent.trim(); if(!t2){ removeCard(it.key); } else { updateItem(it.key,{text:t2}); } if(editingText===it.key) setEditingText(null); }}></div>
                <button className="bc-x" title="Remove" onPointerDown={(e)=>e.stopPropagation()} onClick={()=>removeCard(it.key)}><TI k="x"/></button>
              </div>
            ) : it.kind==='doc' ? (
              <div key={it.key} className="board-doc" style={{left:it.x,top:it.y,width:it.w||340,height:it.h||250}}>
                <div className="bd-dochead" onPointerDown={(e)=>moveCard(e,it.key)} title="Drag to move">
                  <span className="bc-pill" style={{background:`color-mix(in oklab, ${resColor(it.type)} 18%, white)`, color:resColor(it.type)}}>{it.type}</span>
                  <span className="bd-doclabel">{it.label}</span>
                  <button className="bd-docbtn" title="Present — fill the board" onPointerDown={(e)=>e.stopPropagation()} onClick={()=>presentRes(it)}><TI k="full"/></button>
                  {liveUrl(it) && <button className="bd-docbtn" title="Open in a new tab" onPointerDown={(e)=>e.stopPropagation()} onClick={()=>window.open(it.url,'_blank','noopener')}><TI k="ext"/></button>}
                  <button className="bd-docbtn" title="Remove" onPointerDown={(e)=>e.stopPropagation()} onClick={()=>removeCard(it.key)}><TI k="x"/></button>
                </div>
                <div className="bd-docbody">
                  {isImgRes(it)&&liveUrl(it) ? <img src={it.url} alt={it.label} draggable={false}/>
                   : isPdfRes(it)&&liveUrl(it) ? <iframe src={it.url} title={it.label}></iframe>
                   : <div className="bd-mockpage"><b>{it.label}</b>{Array.from({length:8}).map((_,i)=><i key={i} style={{width:(90-(i%4)*16)+'%'}}></i>)}</div>}
                </div>
                <span className="bd-resize" title="Drag to resize" onPointerDown={(e)=>resizeCard(e,it.key)}></span>
              </div>
            ) : (
              <div key={it.key} className="board-card" style={{left:it.x,top:it.y}} onPointerDown={(e)=>moveCard(e,it.key)}>
                <span className="bc-pill" style={{background:`color-mix(in oklab, ${resColor(it.type)} 18%, white)`, color:resColor(it.type)}}>{it.type}</span>
                <span className="bc-label">{it.label}</span>
                <button className="bc-x" title="Remove" onPointerDown={(e)=>e.stopPropagation()} onClick={()=>removeCard(it.key)}><TI k="x"/></button>
              </div>
            ))}
          </div>
        </div>

        {/* writing bar */}
        <div className="write-bar">
          {[['pen','Pen (1)'],['mark','Highlighter (2)'],['erase','Eraser (3)'],['text','Text (4)'],['laser','Laser pointer'],['fade','Fade-away ink — marks vanish on their own']].map(([k,lab])=>(
            <button key={k} className={'wb-btn'+(tool===k?' on':'')} title={lab} onClick={()=>setTool(k)}><TI k={k}/></button>
          ))}
          <span className="wb-div"/>
          {COLORS.map(c=>(
            <button key={c} className={'wb-color'+(color===c?' on':'')} style={{background:c}} title="Ink color" onClick={()=>setColor(c)}/>
          ))}
          {(tool==='pen'||tool==='mark'||tool==='fade') && <span className="wb-sizes" title="Stroke size — hold Shift while drawing for a straight line">
            {['s','m','l'].map(z=><button key={z} className={'wb-size '+z+(sizes[tool]===z?' on':'')} onClick={()=>setSizes(p=>({...p,[tool]:z}))}></button>)}
          </span>}
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
        <div className="teach-resizer" style={{left:lessonW}} onPointerDown={startResize} onDoubleClick={snapCycle} title="Drag to resize · double-click to snap wider / to the rail"/>}
      {lessonHidden && <div className="teach-peekzone" title="Lesson plan — slides out" onMouseEnter={()=>setPeek(true)}></div>}
      {lessonHidden && !peek && <button className="teach-peektab" title="Lesson plan" onClick={()=>setPeek(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg></button>}
      {lessonHidden && peek && <div className="teach-lesson peekpane" onMouseLeave={()=>setPeek(false)}>{paneInner}</div>}
    </div>
  );
}

window.TeachView = TeachView;
})();
