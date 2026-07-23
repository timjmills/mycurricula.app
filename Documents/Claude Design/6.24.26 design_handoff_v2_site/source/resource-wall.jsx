/* Resource Wall — built-in "Post" view. Padlet-style sectioned wall on the V2
   system. Reuses window.DS data + the V2 card/notecard language. */
(function(){
const { useState, useRef, useEffect } = React;
const DS = window.DS;
const cv = (x)=>`var(${x})`;

const W = {
  plus:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  search:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>,
  x:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>,
  chev:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>,
  chevL:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>,
  chevR:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>,
  grip:<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>,
  dots:<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>,
  open:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14L21 3"/></svg>,
  play:<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>,
  board:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v4M8 21h8"/></svg>,
  vLarge:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>,
  vMed:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="8" height="16" rx="1.6"/><rect x="13" y="4" width="8" height="16" rx="1.6"/></svg>,
  vIcon:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/></svg>,
  vList:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1.1" fill="currentColor"/><circle cx="4" cy="12" r="1.1" fill="currentColor"/><circle cx="4" cy="18" r="1.1" fill="currentColor"/></svg>,
  sliders:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h7M15 18h5"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="13" cy="18" r="2"/></svg>,
  check:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5 9-11"/></svg>,
  folder:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>,
  section:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="6" rx="1.6"/><rect x="3" y="14" width="18" height="6" rx="1.6"/></svg>,
  wall:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="7" height="7" rx="1.3"/><rect x="14" y="4" width="7" height="7" rx="1.3"/><rect x="3" y="15" width="7" height="5" rx="1.3"/><rect x="14" y="15" width="7" height="5" rx="1.3"/></svg>,
  expand:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>,
  compress:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="2.5" width="19" height="19" rx="4"/><path d="M6.5 6.5L9.5 9.5M9.5 6.5V9.5H6.5M17.5 6.5L14.5 9.5M14.5 6.5V9.5H17.5M6.5 17.5L9.5 14.5M9.5 17.5V14.5H6.5M17.5 17.5L14.5 14.5M14.5 17.5V14.5H17.5"/></svg>,
  share:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="2.4"/><circle cx="6" cy="12" r="2.4"/><circle cx="18" cy="19" r="2.4"/><path d="M8.1 10.8l7.8-4.6M8.1 13.2l7.8 4.6"/></svg>,
  edit:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>,
  copy:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>,
  trash:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></svg>,
};
const TI = {
  slides:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M12 17v4M8 21h8"/></svg>,
  doc:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>,
  worksheet:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>,
  image:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>,
  video:<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>,
  link:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>,
  note:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h10M7 13h7"/></svg>,
};
const TT = { slides:'--subj-1', doc:'--subj-7', worksheet:'--subj-10', image:'--subj-13', video:'--subj-3', link:'--honey-500', note:'--honey-500' };

/* ── rich mock previews per resource type (stand-ins for live thumbnails) ── */
function Mock({ r }){
  const s = DS.SUBJECTS[r.subjectId];
  if(r.type==='slides') return (
    <div className="rwm rwm-slides" style={{'--mc':cv(s?s.c:'--subj-1')}}>
      <div className="rwm-slk">{s?s.label:''} · Lesson</div>
      <div className="rwm-slt">{r.label.replace(/ — Slides$/,'')}</div>
      <div className="rwm-sldots"><i/><i/><i/></div>
    </div>);
  if(r.type==='worksheet') return (
    <div className="rwm rwm-sheet">
      <div className="rwm-sht">{r.label}</div>
      <div className="rwm-shrow"><span/><span/><span/></div>
      <div className="rwm-shrow"><span/><span/><span/></div>
      <div className="rwm-shgrid"><b>×</b><b>40</b><b>3</b><i/><i/><i/></div>
    </div>);
  if(r.type==='image') return (
    <div className="rwm rwm-photo" style={{'--mc':cv(s?s.c:'--subj-13')}}>
      <div className="rwm-phsun"/><div className="rwm-phhill"/>
      <span className="rwm-phcap">anchor chart · photo</span>
    </div>);
  if(r.type==='video') return (
    <div className="rwm rwm-video"><span className="rwm-vplay">{W.play}</span><span className="rwm-vdur">4:32</span></div>);
  if(r.type==='doc') return (
    <div className="rwm rwm-doc"><div className="rwm-docl"/><div className="rwm-docl"/><div className="rwm-docl sh"/><div className="rwm-docl"/><div className="rwm-docl sh"/></div>);
  if(r.type==='link') return (
    <div className="rwm rwm-link"><span className="rwm-lkfav" style={{background:cv(s?s.c:'--honey-500')}}>{(r.label[0]||'L')}</span><span className="rwm-lkdom">{(r.domain||'resource.org')}</span><span className="rwm-lkurl">/{r.label.toLowerCase().replace(/\s+/g,'-').slice(0,22)}</span></div>);
  return null;
}

/* ── notecard rich body (Padlet-style) ── */
function NoteBody({ r, clamp }){
  return (
    <div className={'rwm-note'+(clamp?' clamp':'')}>
      <p><b>{r.label}</b> — quick teaching notes.</p>
      <div className="rwm-nchecks">
        <span className="rwm-nchk on"><span className="bx">{W.check}</span>Print sentence-stem cards</span>
        <span className="rwm-nchk"><span className="bx"/>Queue partner-talk timer</span>
      </div>
      <p>Anchor on <mark>opinion vs. fact</mark>; gather examples from partners and chart the reason.</p>
    </div>
  );
}
const TYPE_FILTER = { Notes:'note', PDFs:'worksheet', Images:'image', Documents:'doc', Links:'link' };

const PRESETS = ['Current Lesson',"Today's Lessons (Mixed)",'This Week · Mixed','This Week · Subject','Subject View','Unit View'];
const CUSTOM_KEY='cc_customwalls';
function loadCustomWalls(){ try{ return JSON.parse(localStorage.getItem(CUSTOM_KEY)||'[]'); }catch(e){ return []; } }
function saveCustomWalls(w){ try{ localStorage.setItem(CUSTOM_KEY,JSON.stringify(w)); }catch(e){} }
const FILTERS = ['All','Notes','PDFs','Images','Documents','Links'];
const VIEWS = [['med','Medium',W.vMed],['large','Large',W.vLarge],['icon','Icon',W.vIcon],['list','List',W.vList]];

let _uid=1;
function buildSections(state){
  // Today's Lessons (Mixed): one section per subject taught today, with its resources + notecard
  const day = state.days[state.todayIdx];
  const segs = [];
  day.lessons.forEach(L=>{
    const s = DS.SUBJECTS[L.subjectId];
    const res = DS.resourcesFor(L).map(r=>({ ...r, type:String(r.type||'link').toLowerCase(), key:'k'+(_uid++), subjectId:L.subjectId }));
    // inject a notecard so each section mixes notes + resources
    res.splice(2,0,{ key:'k'+(_uid++), type:'note', label:s.full+' — Teaching notes', subjectId:L.subjectId });
    segs.push({ id:'sec-'+L.id, key:'s'+(_uid++), title:s.full, meta:DS.fmt(L.start), color:s.c, subjectId:L.subjectId, items:res });
  });
  return segs;
}

function Toast({ msg, onDone }){
  useEffect(()=>{ const t=setTimeout(onDone,2600); return ()=>clearTimeout(t); },[]);
  return <div className="rw-toast">{W.board}{msg}</div>;
}

function Card({ r, view, dragging, onDragState, onAttach, onOpen, onEnlarge, onBoard, onModal, secId, onDropBefore }){
  const isNote = r.type==='note';
  const composing = isNote && r.composing && !r.attached;
  const [text,setText]=React.useState(r.text||'');
  const [dropOver,setDropOver]=React.useState(false);
  const dropProps = {
    onDragOver:(e)=>{ if(e.dataTransfer.types.includes('text/card')){ e.preventDefault(); e.stopPropagation(); if(!dropOver)setDropOver(true); } },
    onDragLeave:()=>setDropOver(false),
    onDrop:(e)=>{ if(e.dataTransfer.types.includes('text/card')){ e.preventDefault(); e.stopPropagation(); const k=e.dataTransfer.getData('text/card'); setDropOver(false); onDropBefore&&onDropBefore(k, secId, r.key); } }
  };
  if(composing){
    return (
      <div className={'rw-card v-'+view+' note rw-composing'+(dragging?' rw-card-mini':'')+(dropOver?' rw-dropbefore':'')} draggable {...dropProps}
        onDragStart={(e)=>{ e.dataTransfer.setData('text/card', r.key); e.dataTransfer.effectAllowed='move'; onDragState&&onDragState(true); }}
        onDragEnd={()=>{ setDropOver(false); onDragState&&onDragState(false); }} onClick={e=>e.stopPropagation()}>
        <textarea className="rw-noteinput" value={text} placeholder="Type a note…" autoFocus
          onChange={e=>{ setText(e.target.value); r.text=e.target.value; r.label=e.target.value.split('\n')[0].slice(0,40)||'Note'; }}/>
        <div className="rw-noteacts">
          <button className="rw-noteadd" title="Attach a resource (note moves below)" onClick={()=>{ r.attached='doc'; if(onAttach)onAttach(r); }}>{W.plus} Resource</button>
          <button className="rw-notedone" onClick={()=>{ r.composing=false; if(onAttach)onAttach(r); }}>Done</button>
        </div>
      </div>
    );
  }
  return (
    <div className={'rw-card v-'+view+(isNote?' note':'')+(r.attached?' has-attach':'')+(dragging?' rw-card-mini':'')+(dropOver?' rw-dropbefore':'')} draggable {...dropProps}
      onDragStart={(e)=>{ e.dataTransfer.setData('text/card', r.key); e.dataTransfer.effectAllowed='move'; onDragState&&onDragState(true); }}
      onDragEnd={()=>{ setDropOver(false); onDragState&&onDragState(false); }}
      onClick={()=>onModal(r)}>
      <div className={'rw-thumb th-'+(r.attached||r.type)}>
        {r.attached ? <Mock r={{...r,type:r.attached}}/> : (isNote ? <NoteBody r={r} clamp/> : <Mock r={r}/>)}
        <span className="rw-badge" style={{color:cv(TT[r.attached||r.type])}}>{TI[r.attached||r.type]}</span>
        {view!=='list' && <div className="rw-actions" onClick={e=>e.stopPropagation()}>
          <button title="Open" onClick={()=>onModal(r)}>{W.open}</button>
          <button title="Slideshow" onClick={()=>onOpen(r)}>{W.play}</button>
          <button title="Enlarge" onClick={()=>onEnlarge(r)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7"/></svg></button>
          <button title="Send to Teaching Board" onClick={()=>onBoard(r, r.lessons&&r.lessons[0]&&r.lessons[0].id)}>{W.board}</button>
          {window.Share && <window.Share.Btn kind="resource" id={r.id} label={r.label} bare />}
        </div>}
      </div>
      <div className="rw-cbody">
        <div className="rw-ctitle">{r.label}</div>
        {r.attached && r.text && <div className="rw-attachnote">{r.text}</div>}
        {view!=='icon' && <div className="rw-cmeta"><span className="rw-type">{r.type==='note'?'NOTE':r.type.toUpperCase()}</span><span className="rw-spill" style={{background:`color-mix(in oklab,${cv(TT[r.type])} 18%,white)`,color:cv(TT[r.type])}}>{DS.SUBJECTS[r.subjectId]?DS.SUBJECTS[r.subjectId].label:'Resource'}</span></div>}
      </div>
      {view==='list' && <button className="rw-rowmenu" onClick={e=>{e.stopPropagation();onBoard(r, r.lessons&&r.lessons[0]&&r.lessons[0].id);}} title="Send to board">{W.board}</button>}
    </div>
  );
}

function secBgGet(sec){
  try{
    const s=localStorage.getItem('cc_secbg_'+sec.id); if(s) return JSON.parse(s);
    const sub=localStorage.getItem('cc_subjbg_'+sec.subjectId); if(sub) return JSON.parse(sub);
  }catch(e){}
  return null;
}
function secBgSet(sec, bg, scope){
  try{
    if(scope==='subject'){ localStorage.setItem('cc_subjbg_'+sec.subjectId, JSON.stringify(bg)); localStorage.removeItem('cc_secbg_'+sec.id); }
    else { localStorage.setItem('cc_secbg_'+sec.id, JSON.stringify(bg)); }
  }catch(e){}
}
const SECBG_WASH=[['--grad-dawn','Dawn'],['--grad-honey','Honey'],['--grad-mint','Mint'],['--grad-brand','Sky']];

function Section({ sec, view, layout, q, filter, dragging, cardDragging, onCardDragState, onForce, onOpen, onEnlarge, onBoard, onModal, onAdd, onAddSection, onDropCard, onDragStartSec, onDropSec, onDragEndSec, onSolo }){
  const [size,setSize]=useState('full');   // min | small | full — cycles on the chevron
  const collapsed = dragging ? true : size==='min';
  const cycle = ()=> setSize(s=> s==='min'?'small':s==='small'?'full':'min');
  const sizeTitle = size==='min'?'Minimized — click for two rows' : size==='small'?'Two rows — click to expand fully' : 'Expanded — click to minimize';
  const [bgOpen,setBgOpen]=useState(false);
  const [scope,setScope]=useState('section');
  const CHECKER="repeating-conic-gradient(#cfd2da 0% 25%, #fff 0% 50%) 50% / 12px 12px";
  const [tShade,setTShade]=useState(()=>cv(sec.color));
  const [tOp,setTOp]=useState(35);
  const tVal=(shade,op)=> shade==='__dark'?'rgba(20,19,30,'+(op/100)+')':'color-mix(in oklab, '+shade+' '+op+'%, transparent)';
  const [bg,setBg]=useState(()=>secBgGet(sec));
  const applyBg=(b)=>{ setBg(b); secBgSet(sec,b,scope); setBgOpen(false); };
  const resetBg=()=>{ setBg(null); try{ localStorage.removeItem('cc_secbg_'+sec.id); localStorage.removeItem('cc_subjbg_'+sec.subjectId); }catch(e){} setBgOpen(false); };
  const bgStyle = bg ? (
    bg.type==='color' ? { background:bg.value } :
    bg.type==='wash' ? { background:`var(${bg.value})` } :
    bg.type==='photo' ? { backgroundImage:`url('${bg.value}')`, backgroundSize:'cover', backgroundPosition:'center' } : {}
  ) : {};
  let items = sec.items;
  if(filter!=='All'){ const t=TYPE_FILTER[filter]; items=items.filter(r=>r.type===t); }
  if(q) items=items.filter(r=>r.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <section className={'rw-sec'+(bg?' has-bg':'')} data-size={size} style={{'--sc':cv(sec.color), ...bgStyle, ...(dragging?{transition:'all .18s ease'}:{})}}
      onDragOver={e=>{ if(e.dataTransfer.types.includes('text/card')||e.dataTransfer.types.includes('text/sec')) e.preventDefault(); }}
      onDrop={e=>{ if(e.dataTransfer.types.includes('text/card')){ onDropCard(e.dataTransfer.getData('text/card'),sec.id); } else if(e.dataTransfer.types.includes('text/sec')){ onDropSec(e.dataTransfer.getData('text/sec'),sec.id); onDragEndSec&&onDragEndSec(); } }}
      data-secdrag={dragging?'1':undefined}>
      <div className="rw-sechead" draggable onDragStart={e=>{ if(e.target.closest('.rw-secbgpop')){ e.preventDefault(); return; } e.dataTransfer.setData('text/sec',sec.id); e.dataTransfer.effectAllowed='move'; onDragStartSec&&onDragStartSec(sec.id); }}
        onDragEnd={()=>onDragEndSec&&onDragEndSec()}
        onClick={(e)=>{ if(e.target.closest('.rw-secactions')||e.target.closest('.rw-grip')||e.target.closest('.rw-collapse')) return; cycle(); }}>
        <span className="rw-grip">{W.grip}</span>
        <button className="rw-collapse" data-size={size} title={sizeTitle} onClick={(e)=>{ e.stopPropagation(); cycle(); }} style={{transform:size==='min'?'rotate(-90deg)':'none'}}>{W.chev}</button>
        <span className="rw-secdot" style={{background:cv(sec.color)}}/>
        <span className="rw-sectitle">{sec.title}</span>
        <span className="rw-secmeta">{sec.meta}</span>
        <span className="rw-seccount">{items.length}</span>
        <span className="rw-secactions">
          {window.Share && <window.Share.Btn kind="section" id={sec.id} label={sec.title} bare />}
          <span className="rw-secbgwrap">
            <button title="Section background" onClick={()=>setBgOpen(o=>!o)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15l5-5 4 4 3-3 6 6"/><circle cx="9" cy="9" r="1.4"/></svg></button>
            {bgOpen && <div className="rw-secbgpop" draggable={false} onClick={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()}>
              <div className="rw-bgtitle">Section background</div>
              <button className={'rw-bgfollow'+(!bg?' on':'')} onClick={resetBg}><span className="rw-bgfollow-ic">↺</span><span style={{minWidth:0}}><b>Follow page style</b><small>Uses the wall's Frame & background</small></span>{!bg&&<span className="rw-bgfollow-ck">✓</span>}</button>
              <div className="rw-bgor">or set a custom background</div>
              <div className="rw-bgscope">
                <button className={scope==='section'?'on':''} onClick={()=>setScope('section')}>This section</button>
                <button className={scope==='subject'?'on':''} onClick={()=>setScope('subject')}>Whole subject</button>
              </div>
              <div className="rw-bglbl">Subject color</div>
              <div className="rw-bgcolors">
                {[cv(sec.color),'color-mix(in oklab, '+cv(sec.color)+' 55%, #fff)','color-mix(in oklab, '+cv(sec.color)+' 26%, #fff)'].map((v,i)=><button key={'s'+i} title="Subject color" style={{background:v}} onClick={()=>applyBg({type:'color',value:v})}/>)}
                {['color-mix(in oklab, '+cv(sec.color)+' 55%, transparent)','color-mix(in oklab, '+cv(sec.color)+' 28%, transparent)'].map((v,i)=><button key={'st'+i} className="rw-bgtrans" title="Subject tint (see-through)" style={{backgroundImage:'linear-gradient('+v+','+v+'), '+CHECKER}} onClick={()=>applyBg({type:'color',value:v})}/>)}
              </div>
              <div className="rw-bglbl">Color</div>
              <div className="rw-bgcolors">{['#FFFFFF','#1C1B2E','#FFF6E6','#FFE9D6','#FCE4EF','#F3E6FB','#E6F1FF','#E3F6EE','#FBE9E7','#EEF1F4'].map(c=><button key={c} style={{background:c}} onClick={()=>applyBg({type:'color',value:c})}/>)}</div>
              <div className="rw-bglbl">Translucent — pick a shade + opacity</div>
              <div className="rw-bgshades">
                {[['subject',cv(sec.color)],['white','#FFFFFF'],['honey','#F4B740'],['sky','#5BA8FF'],['blossom','#E083B8'],['mint','#4FD7A6']].map(([k,c])=><button key={k} title={k} className={'rw-bgshade'+(tShade===c?' on':'')} style={{background:c}} onClick={()=>setTShade(c)}/>)}
              </div>
              <div className="rw-bgoprow">
                <input type="range" min="10" max="85" value={tOp} onChange={e=>setTOp(+e.target.value)} />
                <span className="rw-bgpreview" style={{backgroundImage:'linear-gradient('+tVal(tShade,tOp)+','+tVal(tShade,tOp)+'), '+CHECKER}}/>
                <span className="rw-bgopval">{tOp}%</span>
              </div>
              <div className="rw-bgtransbtns">
                <button className="rw-bgapply" onClick={()=>applyBg({type:'color',value:tVal(tShade,tOp)})}>Use this translucent</button>
                <button className="rw-bgdark" title="Dark glass only" onClick={()=>applyBg({type:'color',value:tVal('__dark',tOp)})}>Dark only</button>
              </div>
              <div className="rw-bglbl">Wash</div>
              <div className="rw-bgwashes">{SECBG_WASH.map(([g,n])=><button key={g} title={n} style={{background:`var(${g})`}} onClick={()=>applyBg({type:'wash',value:g})}/>)}</div>
              <div className="rw-bglbl">Photo</div>
              <div className="rw-bgphotos">{['photos/p1.png','photos/p2.png','photos/p3.png'].map(p=><button key={p} style={{backgroundImage:`url('${p}')`}} onClick={()=>applyBg({type:'photo',value:p})}/>)}
                <label className="rw-bgupload" title="Upload a photo">+
                  <input type="file" accept="image/*" style={{display:'none'}} onChange={(e)=>{ const f=e.target.files&&e.target.files[0]; if(f){ applyBg({type:'photo',value:URL.createObjectURL(f)}); } }}/>
                </label>
              </div>
            </div>}
          </span>
          <button title="Add a new section (auto-saved to the wall library)" onClick={()=>onAddSection&&onAddSection(sec)}>{W.plus}</button>
          <button title="Slideshow this section" onClick={()=>items[0]&&onOpen(items[0],items)}>{W.play}</button>
          <button title="Open just this section as its own board" onClick={()=>onSolo&&onSolo(sec)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M21 3l-8 8M9 21H3v-6M3 21l8-8"/></svg></button>
        </span>
      </div>
      {!collapsed
        ? <div className={'rw-grid '+(layout==='uniform'?'uniform ':'')+'v-'+view+(size==='small'?' rw-grid-two':'')}>
            {items.map(r=><Card key={r.key} r={r} view={view} dragging={cardDragging} onDragState={onCardDragState} secId={sec.id} onDropBefore={onDropCard} onAttach={onAddSection?(()=>onForce&&onForce()):undefined} onOpen={(rr)=>onOpen(rr,items)} onEnlarge={onEnlarge} onBoard={onBoard} onModal={onModal}/>)}
            <button className="rw-addcard" onClick={()=>onAdd(sec.id)}>{W.plus}<span>Add</span></button>
          </div>
        : null}
    </section>
  );
}

function Annotator({ stageRef }){
  const cv2=useRef(null); const drawing=useRef(false); const last=useRef(null);
  const [tool,setTool]=useState('pen'); const [color,setColor]=useState('#EF5A5A');
  const toolR=useRef(tool), colorR=useRef(color);
  useEffect(()=>{toolR.current=tool},[tool]); useEffect(()=>{colorR.current=color},[color]);
  const fit=()=>{ const c=cv2.current; if(!c) return; const b=c.parentElement.getBoundingClientRect(); if(!b.width) return; const d=c.toDataURL&&c.width?c.toDataURL():null; c.width=b.width; c.height=b.height; if(d){ const im=new Image(); im.onload=()=>c.getContext('2d').drawImage(im,0,0,c.width,c.height); im.src=d; } };
  useEffect(()=>{ fit(); const ro=('ResizeObserver'in window)?new ResizeObserver(()=>fit()):null; const p=cv2.current&&cv2.current.parentElement; if(ro&&p)ro.observe(p); return ()=>ro&&ro.disconnect(); },[]);
  const pos=(e)=>{ const b=cv2.current.getBoundingClientRect(); return {x:e.clientX-b.left,y:e.clientY-b.top}; };
  const apply=(ctx)=>{ ctx.lineCap='round'; ctx.lineJoin='round';
    if(toolR.current==='erase'){ ctx.globalCompositeOperation='destination-out'; ctx.globalAlpha=1; ctx.lineWidth=28; }
    else if(toolR.current==='mark'){ ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=.3; ctx.strokeStyle=colorR.current; ctx.lineWidth=18; }
    else { ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=1; ctx.strokeStyle=colorR.current; ctx.lineWidth=3.5; } };
  const down=(e)=>{ drawing.current=true; last.current=pos(e); try{e.target.setPointerCapture(e.pointerId);}catch(x){} };
  const move=(e)=>{ if(!drawing.current)return; const ctx=cv2.current.getContext('2d'); const p=pos(e); apply(ctx); ctx.beginPath(); ctx.moveTo(last.current.x,last.current.y); ctx.lineTo(p.x,p.y); ctx.stroke(); last.current=p; };
  const up=()=>{ drawing.current=false; };
  const clear=()=>{ const c=cv2.current; if(c)c.getContext('2d').clearRect(0,0,c.width,c.height); };
  const COLORS=['#EF5A5A','#3B6CF6','#16A06B','#F4B740','#1C1B2E'];
  return (
    <React.Fragment>
      <canvas ref={cv2} className="rw-annot" style={{cursor:tool==='erase'?'cell':'crosshair'}}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}/>
      <div className="rw-pens" onClick={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}>
        {[['pen','M5 19l3-1L19 7a2 2 0 0 0-3-3L5 15l-1 3 1 1Z'],['mark','M4 19h6M9 14l6-9 4 3-6 9H8l-2-2 3-1Z'],['erase','M4 15l7-7 6 6-4 4H8zM14 20h6']].map(([k,d])=>(
          <button key={k} className={'rw-pen'+(tool===k?' on':'')} title={k} onClick={()=>setTool(k)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d}/></svg></button>
        ))}
        <span className="rw-pendiv"/>
        {COLORS.map(c=>(<button key={c} className={'rw-penc'+(color===c?' on':'')} style={{background:c}} onClick={()=>setColor(c)}/>))}
        <span className="rw-pendiv"/>
        <button className="rw-pen" title="Clear" onClick={clear}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg></button>
      </div>
    </React.Fragment>
  );
}

function Lightbox({ slides, idx, setIdx, onClose, onBoard, mode }){
  const r = slides[idx];
  const enlarge = mode==='enlarge';
  useEffect(()=>{ const k=(e)=>{ if(e.key==='Escape')onClose(); if(e.key==='ArrowRight')setIdx(i=>Math.min(slides.length-1,i+1)); if(e.key==='ArrowLeft')setIdx(i=>Math.max(0,i-1)); }; document.addEventListener('keydown',k); return ()=>document.removeEventListener('keydown',k); },[slides.length]);
  return (
    <div className={'rw-lightbox'+(enlarge?' rw-enlarge':'')} onClick={onClose}>
      <div className={'rw-lbframe'+(enlarge?' resizable':'')} onClick={e=>e.stopPropagation()}>
        <div className="rw-lbtop"><span className="rw-lbtitle">{r.label}</span>{slides.length>1&&<span className="rw-lbct">{idx+1} of {slides.length}</span>}<button className="rw-lbx" onClick={onClose}>{W.x}</button></div>
        <div className="rw-lbstage">
          {idx>0 && <button className="rw-lbnav l" onClick={()=>setIdx(i=>i-1)}>{W.chevL}</button>}
          <div className={'rw-lbmedia th-'+r.type}>{TI[r.type]}<Annotator/></div>
          {idx<slides.length-1 && <button className="rw-lbnav r" onClick={()=>setIdx(i=>i+1)}>{W.chevR}</button>}
        </div>
        <div className="rw-lbbar"><button onClick={()=>window.open('#','_blank')}>{W.open} Open in new tab</button><button onClick={()=>onBoard(r)}>{W.board} Send to Teaching Board</button></div>
      </div>
    </div>
  );
}


function ResourceWall({ state, focus, onTeach }){
  const [preset,setPreset]=useState(focus?'Current Lesson':"Today's Lessons (Mixed)");
  const [q,setQ]=useState('');
  const [filter,setFilter]=useState('All');
  const [view,setView]=useState('med');
  const [layout,setLayout]=useState('masonry');
  const [secs,setSecs]=useState(()=>buildSections(state));
  const [modal,setModal]=useState(null);
  const [light,setLight]=useState(null);
  const [toast,setToast]=useState(null);
  const [chooser,setChooser]=useState(null);
  const [fs,setFs]=useState(false);

  const doBoard=(r,lesson)=>{
    setChooser(null);
    setToast(lesson?('Teaching Board · '+lesson.title):'Untagged Teaching Board');
    if(lesson && onTeach){ setTimeout(()=>onTeach(lesson),350); }
  };
  // fromLessonId = the lesson context the resource was opened from (a wall card knows
  // its lesson; the library passes none). Decides which board to open.
  const board=(r,fromLessonId)=>{
    const ls = r.lessons || [];
    const from = fromLessonId && ls.find(l=>l.id===fromLessonId);
    if(from) return doBoard(r,from);
    if(ls.length===1) return doBoard(r,ls[0]);
    if(ls.length>1) return setChooser({ r, lessons:ls });
    return doBoard(r,null);
  };
  const openLight=(r,list)=>{ const arr=list||[r]; setLight({slides:arr, idx:Math.max(0,arr.findIndex(x=>x.key===r.key))}); };
  const enlarge=(r)=>{ setLight({slides:[r], idx:0, mode:'enlarge'}); };

  const moveCard=(cardKey,toSecId,beforeKey)=>{
    if(cardKey===beforeKey) return;
    setSecs(prev=>{ let moved=null; const stripped=prev.map(s=>({...s,items:s.items.filter(it=>{ if(it.key===cardKey){moved=it;return false;} return true; })})); if(!moved) return prev;
      return stripped.map(s=>{ if(s.id!==toSecId) return s; if(!beforeKey) return {...s,items:[...s.items,moved]}; const idx=s.items.findIndex(it=>it.key===beforeKey); if(idx<0) return {...s,items:[...s.items,moved]}; const items=[...s.items]; items.splice(idx,0,moved); return {...s,items}; }); });
  };
  const moveSec=(fromId,toId)=>{ if(fromId===toId) return; setSecs(prev=>{ const a=[...prev]; const fi=a.findIndex(s=>s.id===fromId), ti=a.findIndex(s=>s.id===toId); if(fi<0||ti<0)return prev; a.splice(ti,0,a.splice(fi,1)[0]); return a; }); };
  const addItem=(secId)=>{ setSecs(prev=>prev.map(s=>s.id===secId?{...s,items:[...s.items,{key:'k'+(_uid++),type:'note',label:'Note',composing:true,text:'',subjectId:s.subjectId}]}:s)); };
  const addSection=()=>{ setSecs(prev=>[...prev,{id:'sec-new'+(_uid++),key:'s'+(_uid++),title:'New section',meta:'',color:'--subj-9',subjectId:'spelling',items:[]}]); };
  const addSectionSaved=(after)=>{
    const name = prompt('Name this new section', 'New section'); if(name===null) return;
    const newSec={ id:'sec-new'+(_uid++), key:'s'+(_uid++), title:name||'New section', meta:'', color:(after&&after.color)||'--subj-9', subjectId:(after&&after.subjectId)||'spelling', items:[] };
    setSecs(prev=>{ const idx=after?prev.findIndex(s=>s.id===after.id)+1:prev.length; const a=[...prev]; a.splice(idx,0,newSec); return a; });
    // auto-save the section as its own single-section wall in the library
    const walls=loadCustomWalls();
    const w={ id:'cw'+Date.now(), name, anchor:'section', layout:[{ id:newSec.id, title:newSec.title, meta:'', color:newSec.color, subjectId:newSec.subjectId, items:[] }], view, secCount:1, isSection:true, created:Date.now() };
    const next=[w, ...walls]; setCustomWalls(next); saveCustomWalls(next);
    setToast('Section saved to wall library ✓');
  };
  const saveLayout=(intoActive)=>{
    const name = intoActive&&activeCustom ? activeCustom.name : (prompt('Name this wall layout', activeCustom?activeCustom.name:('Wall — '+preset))||'Saved wall');
    const layoutSnap = secs.map(s=>({ id:s.id, title:s.title, meta:s.meta, color:s.color, subjectId:s.subjectId, items:s.items }));
    let id = intoActive&&activeCustom ? activeCustom.id : 'cw'+Date.now();
    const w={ id, name, anchor:(activeCustom&&activeCustom.anchor)||'unanchored', layout:layoutSnap, view, secCount:secs.length, created:Date.now() };
    const updating = !!(intoActive&&activeCustom);
    const next=[w, ...customWalls.filter(x=>x.id!==id)];
    setCustomWalls(next); saveCustomWalls(next); setActiveCustom(w); setWallMode('custom');
    setToast(updating ? ('Updated “'+name+'” in My Walls ✓') : ('Added “'+name+'” to My Walls ✓'));
  };
  const loadLayout=(w)=>{ if(w.layout){ setSecs(w.layout.map(s=>({ ...s, key:'s'+(_uid++), items:(s.items||[]).map(it=>({...it,key:it.key||('k'+(_uid++))})) }))); if(w.view)setView(w.view); } setActiveCustom(w); };

  const date = state.now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  const [presetOpen,setPresetOpen]=useState(false);
  const [wallMode,setWallMode]=useState('preset');           // preset | custom
  const [customWalls,setCustomWalls]=useState(()=>loadCustomWalls());
  const [activeCustom,setActiveCustom]=useState(null);       // {id,name,anchor}
  const [secDragging,setSecDragging]=useState(false);
  const [cardDragging,setCardDragging]=useState(false);
  const [soloSec,setSoloSec]=useState(null);
  const [customOpen,setCustomOpen]=useState(false);
  const [libOpen,setLibOpen]=useState(false);
  const [libTab,setLibTab]=useState('presets');
  useEffect(()=>{ const h=(e)=>{ setLibTab((e.detail&&e.detail.tab==='walls')?'my':'presets'); setLibOpen(true); }; window.addEventListener('cc-open-library',h); return ()=>window.removeEventListener('cc-open-library',h); },[]);
  const newCustom=(seed)=>{ const w={ id:'cw'+Date.now(), name:seed?'Copy of '+preset:'New wall', anchor:'unanchored', seeded:!!seed, created:Date.now() }; const next=[w,...customWalls]; setCustomWalls(next); saveCustomWalls(next); setActiveCustom(w); setCustomOpen(false); };
  const [searchOpen,setSearchOpen]=useState(false);
  const [menuOpen,setMenuOpen]=useState(false);
  const [switchOpen,setSwitchOpen]=useState(false);
  const [switchTab,setSwitchTab]=useState('presets');
  const [addOpen,setAddOpen]=useState(false);
  const [wallMenuOpen,setWallMenuOpen]=useState(false);
  const [subjColor,setSubjColor]=useState(()=>{ try{ return localStorage.getItem('cc_rw_subjcolor')==='1'; }catch(e){ return false; } });
  const toggleSubjColor=()=>{ setSubjColor(v=>{ const nv=!v; try{ localStorage.setItem('cc_rw_subjcolor', nv?'1':'0'); }catch(e){} return nv; }); };
  React.useEffect(()=>{ const h=(e)=>setSubjColor(!!e.detail); window.addEventListener('cc-rw-subjcolor',h); return ()=>window.removeEventListener('cc-rw-subjcolor',h); },[]);

  const snapshot=()=> secs.map(s=>({ title:s.title, color:s.color, subjectId:s.subjectId, items:s.items }));
  // auto-save: write current layout back to the active custom wall whenever it changes
  useEffect(()=>{
    if(wallMode!=='custom' || !activeCustom) return;
    setCustomWalls(prev=>{ const n=prev.map(w=>w.id===activeCustom.id?{...w, layout:snapshot(), secCount:secs.length, view}:w); saveCustomWalls(n); return n; });
  // eslint-disable-next-line
  },[secs, view]);
  // editing a preset auto-forks into a personal copy in My Walls
  const ensurePersonal=()=>{
    if(wallMode!=='preset') return;
    const w={ id:'cw'+Date.now(), name:'My '+preset, anchor:'forked', forkedFrom:preset, created:Date.now(), layout:snapshot(), secCount:secs.length, view };
    const next=[w,...customWalls]; setCustomWalls(next); saveCustomWalls(next);
    setActiveCustom(w); setWallMode('custom');
    setToast && setToast('Copied to My Walls — editing your version ✓');
  };
  const E=(fn)=>(...a)=>{ ensurePersonal(); return fn(...a); };
  const addItemP=E(addItem), moveCardP=E(moveCard), moveSecP=E(moveSec), addSectionP=E(addSectionSaved);
  const renameWall=()=>{ if(!activeCustom) return; const n=prompt('Rename wall', activeCustom.name); if(n==null) return; const upd={...activeCustom,name:n||activeCustom.name}; setActiveCustom(upd); setCustomWalls(prev=>{ const x=prev.map(w=>w.id===upd.id?upd:w); saveCustomWalls(x); return x; }); };
  const duplicateWall=()=>{ const src=activeCustom; const w={ ...(src||{}), id:'cw'+Date.now(), name:'Copy of '+(src?src.name:preset), created:Date.now(), layout:(src&&src.layout)||snapshot(), secCount:secs.length }; const next=[w,...customWalls]; setCustomWalls(next); saveCustomWalls(next); setActiveCustom(w); setWallMode('custom'); setToast && setToast('Duplicated ✓'); };
  const deleteWall=()=>{ if(!activeCustom){ setToast && setToast('Presets can’t be deleted'); return; } if(!confirm('Delete “'+activeCustom.name+'”?')) return; const next=customWalls.filter(w=>w.id!==activeCustom.id); setCustomWalls(next); saveCustomWalls(next); setActiveCustom(null); setWallMode('preset'); setToast && setToast('Deleted'); };
  const wallName = wallMode==='custom' ? (activeCustom?activeCustom.name:'Choose a wall') : preset;

  return (
    <div className={'viewbody rw-root'+(subjColor?' rw-subjcolor':'')}>
      <div className="rw-bar">
        <div className="rw-titlewrap">
          <h2 className="rw-title">Resource Wall</h2>
          <div className="rw-subtitle">{date}</div>
        </div>

        {/* Dropdown 1 — Wall switcher (presets · my walls · library) */}
        <div className="rw-dd rw-switch">
          <button className="rw-ddbtn" title="Switch walls — presets, your saved walls, and the library" onClick={()=>{ setSwitchTab(wallMode==='custom'?'my':'presets'); setSwitchOpen(o=>!o); }}>
            <span className="rw-ddfolder">{W.folder||W.chev}</span>
            <span className="rw-ddname">{wallName}</span>
            {wallMode==='custom' && activeCustom && activeCustom.forkedFrom && <span className="rw-ddtag">Personal</span>}
            {W.chev}
          </button>
          {switchOpen && <div className="rw-pop rw-switchpop" onMouseLeave={()=>setSwitchOpen(false)}>
            <div className="rw-switchtabs">
              <button className={switchTab==='presets'?'on':''} onClick={()=>setSwitchTab('presets')}>Presets</button>
              <button className={switchTab==='my'?'on':''} onClick={()=>setSwitchTab('my')}>My Walls</button>
            </div>
            <div className="rw-switchlist">
              {switchTab==='presets'
                ? PRESETS.map(p=><button key={p} className={wallMode==='preset'&&preset===p?'on':''} onClick={()=>{ setWallMode('preset'); setPreset(p); setActiveCustom(null); setSwitchOpen(false); }}>{wallMode==='preset'&&preset===p?W.check:<span className="sp"/>}{p}</button>)
                : (customWalls.length? customWalls.slice(0,8).map(w=>(
                    <button key={w.id} className={activeCustom&&activeCustom.id===w.id?'on':''} onClick={()=>{ loadLayout(w); setWallMode('custom'); setSwitchOpen(false); }}>{activeCustom&&activeCustom.id===w.id?W.check:<span className="sp"/>}{w.name}<span className="rw-custanchor">{w.layout?(w.secCount+' sec'):w.anchor}</span></button>
                  )) : <div className="rw-custempty">No saved walls yet</div>)}
            </div>
            <button className="rw-custbrowse" onClick={()=>{ setSwitchOpen(false); window.dispatchEvent(new CustomEvent('cc-open-library',{detail:{tab:switchTab==='my'?'walls':'presets'}})); }}>Browse all in Library →</button>
          </div>}
        </div>

        {libOpen && window.WallLibrary && <window.WallLibrary state={state} initialTab={libTab} customWalls={customWalls} setCustomWalls={setCustomWalls} onOpenPreset={(p)=>{ setWallMode('preset'); setPreset(p); setActiveCustom(null); setLibOpen(false); }} onOpenCustom={(w)=>{ loadLayout(w); setWallMode('custom'); setLibOpen(false); }} onClose={()=>setLibOpen(false)} />}

        <div className="rw-spacer"/>

        {/* View mode — its own segmented control */}
        <div className="rw-viewseg" title="View mode">
          {VIEWS.map(([k,lab,ic])=><button key={k} className={view===k?'on':''} title={lab} onClick={()=>setView(k)}>{ic}</button>)}
        </div>

        {/* Search — own expanding icon */}
        {searchOpen
          ? <div className="rw-search open">{W.search}<input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search resources…"/><button onClick={()=>{setQ('');setSearchOpen(false);}}>{W.x}</button></div>
          : <button className={'rw-iconbtn'+(q?' active':'')} title="Search" onClick={()=>setSearchOpen(true)}>{W.search}</button>}

        {/* Present / fullscreen — expand normally, minimize when full-screen */}
        <button className="rw-iconbtn" title={fs?'Exit fullscreen':'Present · Fullscreen'} onClick={()=>{ const el=document.querySelector('.rw-root'); if(el){ el.classList.toggle('rw-fs'); setFs(el.classList.contains('rw-fs')); } }}>{fs?W.compress:W.expand}</button>

        {/* Add — split menu */}
        <div className="rw-dd rw-adddd">
          <button className="rw-addtop" onClick={()=>setAddOpen(o=>!o)} title="Add">{W.plus}<span>Add</span>{W.chev}</button>
          {addOpen && <div className="rw-pop rw-addpop" onMouseLeave={()=>setAddOpen(false)}>
            <button onClick={()=>{ setAddOpen(false); secs[0]&&addItemP(secs[0].id); }}>{W.plus}<span>Resource / note</span></button>
            <button onClick={()=>{ setAddOpen(false); addSectionP(secs[secs.length-1]); }}>{W.section||W.plus}<span>Section</span></button>
            <button onClick={()=>{ setAddOpen(false); newCustom(); }}>{W.wall||W.plus}<span>New wall</span></button>
          </div>}
        </div>

        {/* Dropdown 2 — Wall menu (acts on the current wall) */}
        <div className="rw-dd rw-wallmenu">
          <button className="rw-ddbtn rw-ddkebab" onClick={()=>setWallMenuOpen(o=>!o)} title="Wall menu">{W.dots||W.sliders}</button>
          {wallMenuOpen && <div className="rw-pop rw-wallmenupop" onMouseLeave={()=>setWallMenuOpen(false)}>
            <div className="rw-savestate">{W.check}<span>All changes saved</span></div>
            <div className="rw-popdiv"/>
            {window.Share && <div className="rw-mrow rw-mshare">{W.share||W.board}<span>Share wall</span><window.Share.Btn kind="wall" id={activeCustom?activeCustom.id:preset} label={wallName+' · Resource Wall'} bare /></div>}
            <div className="rw-popdiv"/>
            <div className="rw-popsec">Filter by type</div>
            <div className="rw-popfilters">{FILTERS.map(f=><button key={f} className={filter===f?'on':''} onClick={()=>setFilter(f)}>{f}</button>)}</div>
            <div className="rw-popsec">Layout</div>
            <div className="rw-popseg"><button className={layout==='masonry'?'on':''} onClick={()=>setLayout('masonry')}>Masonry</button><button className={layout==='uniform'?'on':''} onClick={()=>setLayout('uniform')}>Uniform</button></div>
            <div className="rw-popdiv"/>
            <button className="rw-mrow rw-subjrow" onClick={toggleSubjColor}><span className={'rw-subjsw'+(subjColor?' on':'')}/><span>Color sections by subject</span></button>
            <div className="rw-popdiv"/>
            <button className="rw-mrow" onClick={()=>{ setWallMenuOpen(false); renameWall(); }} disabled={wallMode!=='custom'}>{W.edit||W.open}<span>Rename</span></button>
            <button className="rw-mrow" onClick={()=>{ setWallMenuOpen(false); duplicateWall(); }}>{W.copy||W.plus}<span>Duplicate</span></button>
            <button className="rw-mrow del" onClick={()=>{ setWallMenuOpen(false); deleteWall(); }} disabled={wallMode!=='custom'}>{W.trash||W.x}<span>Delete</span></button>
          </div>}
        </div>
      </div>

      <div className="rw-sections">
        {secs.map(sec=><Section key={sec.key} sec={sec} view={view} layout={layout} q={q} filter={filter} dragging={secDragging} cardDragging={cardDragging} onCardDragState={setCardDragging}
          onOpen={openLight} onEnlarge={enlarge} onBoard={board} onModal={setModal} onAdd={addItemP} onAddSection={addSectionP} onForce={()=>setSecs(s=>[...s])} onDropCard={moveCardP} onDropSec={moveSecP}
          onDragStartSec={()=>setSecDragging(true)} onDragEndSec={()=>setSecDragging(false)} onSolo={(s)=>setSoloSec(s.id)}/>)}
        <button className="rw-addsec" onClick={()=>{ ensurePersonal(); addSection(); }}>{W.plus} Add section</button>
      </div>

      {soloSec && (()=>{ const s=secs.find(x=>x.id===soloSec); if(!s) return null; return (
        <div className="rw-soloscrim">
          <div className="rw-solo">
            <div className="rw-solohead"><span className="rw-secdot" style={{background:cv(s.color)}}/><span className="rw-solotitle">{s.title}</span><span className="rw-solometa">{(s.items||[]).length} resources</span>
              <button className="rw-soloplay" title="Slideshow this section" onClick={()=>s.items[0]&&openLight(s.items[0],s.items)}>{W.play}</button>
              <button className="rw-soloclose" title="Close" onClick={()=>setSoloSec(null)}>{W.x}</button>
            </div>
            <div className={'rw-grid v-'+view}>
              {(s.items||[]).map(r=><Card key={r.key} r={r} view={view} secId={s.id} onDropBefore={moveCard} onOpen={(rr)=>openLight(rr,s.items)} onEnlarge={enlarge} onBoard={board} onModal={setModal}/>)}
            </div>
          </div>
        </div>); })()}

      {modal && <div className="rw-modalscrim" onClick={()=>setModal(null)}>
        <div className="rw-modal" onClick={e=>e.stopPropagation()}>
          <div className="rw-modalhead"><span className="ti" style={{color:cv(TT[modal.type])}}>{TI[modal.type]}</span><span className="rw-modaltitle">{modal.label}</span><button onClick={()=>setModal(null)}>{W.x}</button></div>
          <div className={'rw-modalbody th-'+modal.type}>{TI[modal.type]}</div>
          <div className="rw-modalbar"><button onClick={()=>{ setModal(null); openLight(modal, [modal]); }}>{W.play} Slideshow</button><button onClick={()=>{ const m=modal; setModal(null); enlarge(m); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg> Enlarge</button><button onClick={()=>window.open('#','_blank')}>{W.open} New tab</button><button onClick={()=>{ if(window.Share){ const url=window.Share.mintLink('resource',modal.id,modal.label); try{navigator.clipboard&&navigator.clipboard.writeText(url);}catch(e){} setToast('Share link copied ✓'); } }}>Share link</button><button onClick={()=>{board(modal);setModal(null);}}>{W.board} Teaching Board</button></div>
        </div>
      </div>}
      {light && <Lightbox slides={light.slides} idx={light.idx} mode={light.mode} setIdx={(f)=>setLight(l=>({...l,idx:typeof f==='function'?f(l.idx):f}))} onClose={()=>setLight(null)} onBoard={board}/>}
      {toast && <Toast msg={toast} onDone={()=>setToast(null)}/>}
      {chooser && <div className="rw-modalscrim" onClick={()=>setChooser(null)}>
        <div className="rw-chooser" onClick={e=>e.stopPropagation()}>
          <div className="rw-choosehead">Open Teaching Board for…<button onClick={()=>setChooser(null)}>{W.x}</button></div>
          <div className="rw-choosesub">“{chooser.r.label}” is tagged in more than one lesson.</div>
          {chooser.lessons.map(l=>(
            <button key={l.id} className="rw-chooserow" onClick={()=>doBoard(chooser.r,l)}>{W.board}<span>{l.title}</span></button>
          ))}
          <button className="rw-chooserow untag" onClick={()=>doBoard(chooser.r,null)}>{W.open}<span>Untagged board</span></button>
        </div>
      </div>}
    </div>
  );
}
window.ResourceWall = ResourceWall;
})();
