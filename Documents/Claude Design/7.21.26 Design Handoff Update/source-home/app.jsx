/* Reimagined mycurricula — one seamless app.
   Home + Day/Week/Year/Teach navigate in place over the rotating photo.
   Three full design directions (A/B/C) live in the Tweaks panel. */
const { useState, useEffect, useRef } = React;

const LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" width="24" height="24"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" fill="#fff"></path><path d="M13 4h5.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H13V4Z" fill="#3A2A05"></path></svg>';

const PHOTOS = ['photos/p1.png','photos/p2.png','photos/p3.png','photos/p4.png','photos/p5.png'];
const BUILTIN_PHOTOS = PHOTOS.map((url,i)=>({ id:'p'+(i+1), url, builtin:true }));
const BUILTIN_IDS = BUILTIN_PHOTOS.map(p=>p.id);
const ljson=(k,f)=>{ try{ const v=localStorage.getItem(k); return v?JSON.parse(v):f; }catch(e){ return f; } };
const sjson=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };
const NAV = ['Day','Week','Year','Plan','Post','Teach'];
const NAV_SUB = { Day:'Today', Week:'This week', Year:'Curricular\nplan', Plan:'Planning\nhub', Post:'Resource\nwall', Teach:'Present' };
const NAV_TIP = {
  Day:'The Day — today’s schedule, lesson by lesson',
  Week:'The Week — all your lessons across this week',
  Year:'The Year — your curriculum plan at a glance',
  Plan:'Plan — the planning hub: every unit and lesson across the year',
  Post:'Resource Wall — collections of resources for your lessons',
  Teach:'Teach Board — present your lesson and resources to the class',
};
const VIEW_TITLES = { Day:'The Day', Week:'The Week', Year:'The Year', Plan:'The Plan', Post:'Resource Wall', Teach:'Teach Board' };
function ViewTitle({ view, t, setTweak, pageBg, setPageBg }){
  const { useState, useRef, useEffect } = React;
  const title = VIEW_TITLES[view];
  const [open,setOpen]=useState(false);
  const [scope,setScope]=useState('page');
  const [pos,setPos]=useState({x:0,y:0});
  const ref=useRef(null), popRef=useRef(null);
  useEffect(()=>{
    if(!open) return;
    const onDoc=(e)=>{ if((ref.current&&ref.current.contains(e.target))||(popRef.current&&popRef.current.contains(e.target))) return; setOpen(false); };
    const onEsc=(e)=>{ if(e.key==='Escape') setOpen(false); };
    document.addEventListener('mousedown',onDoc); document.addEventListener('keydown',onEsc);
    return ()=>{ document.removeEventListener('mousedown',onDoc); document.removeEventListener('keydown',onEsc); };
  },[open]);
  if(!title) return null;
  const UI=window.SettingsUI||{}; const Sg=UI.Seg||(()=>null);
  const ov=(pageBg&&pageBg[view])||{};
  const mode = scope==='page' ? (ov.mode||t.bgMode) : t.bgMode;
  const ver = scope==='page' ? (ov.version||t.version) : t.version;
  const setMode=(m)=>{ if(scope==='page'){ const n={...pageBg,[view]:{...ov,mode:m}}; setPageBg(n); sjson('cc_pagebg',n);} else setTweak('bgMode',m); };
  const setVer=(v)=>{ if(scope==='page'){ const n={...pageBg,[view]:{...ov,version:v}}; setPageBg(n); sjson('cc_pagebg',n);} else setTweak('version',v); };
  const hasOv=!!(ov.mode||ov.version||ov.photos);
  const clearPage=()=>{ const n={...pageBg}; delete n[view]; setPageBg(n); sjson('cc_pagebg',n); };
  /* scope the per-view cog to THIS view: read+write its own override so it's never masked by a stale one */
  const _vmap={version:'version',bgMode:'mode',glass:'glass',photoSel:'photos'};
  const tScoped={...t, version:ov.version||t.version, bgMode:ov.mode||t.bgMode, glass:ov.glass||t.glass, photoSel:ov.photos||t.photoSel};
  const setTweakScoped=(k,v)=>{ if(_vmap[k]){ const n={...pageBg,[view]:{...ov,[_vmap[k]]:v}}; setPageBg(n); sjson('cc_pagebg',n); } else setTweak(k,v); };
  const setTweakSite=(k,v)=>{ setTweak(k,v); if(_vmap[k]&&ov[_vmap[k]]!==undefined){ const no={...ov}; delete no[_vmap[k]]; const n={...pageBg,[view]:no}; setPageBg(n); sjson('cc_pagebg',n); } };
  const toggle=()=>{ if(!open && ref.current){ const r=ref.current.getBoundingClientRect(); setPos({x:Math.min(r.left, window.innerWidth-264), y:Math.min(r.bottom+8, window.innerHeight-280)}); } setOpen(o=>!o); };
  return (
    <div className="view-titlebar">
      <h1 className="view-title">{title}</h1>
      <span className="vt-cog" ref={ref}>
        <button className="vt-cogbtn" title="Style this page — background & frame" onClick={toggle}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>
        </button>
        {open && ReactDOM.createPortal(<div className="vt-menuwrap"><div className="vt-menu vt-menu-full" ref={popRef} style={{left:pos.x, top:pos.y}}>
          <div className="vt-menuh">Style this {VIEW_TITLES[view]}</div>
          <div className="vt-scope"><button className={scope==='page'?'on':''} onClick={()=>setScope('page')}>This page</button><button className={scope==='site'?'on':''} onClick={()=>{ setScope('site'); clearPage(); }}>Whole site</button></div>
          {window.AppearanceControls && <window.AppearanceControls t={scope==='page'?tScoped:t} setTweak={scope==='page'?setTweakScoped:setTweakSite} />}
          {(ov.mode||ov.version||ov.glass||ov.photos) && <button className="vt-clearpage" onClick={clearPage} style={{marginTop:10,width:'100%',border:'1px solid var(--border)',background:'none',borderRadius:'var(--r-pill)',padding:'8px 12px',font:'700 12px var(--font-sans)',color:'var(--accent)',cursor:'pointer'}}>Reset this page to app default</button>}
        </div></div>, document.body)}
      </span>
    </div>
  );
}

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "version": "A",
  "theme": "normal",
  "bgMode": "photo",
  "bgDim": "normal",
  "glass": "dark",
  "viewStyle": "console",
  "canvas": "glass-light",
  "photoMotion": "fade-zoom",
  "mesh": "wash",
  "frame": "float",
  "headFont": "brand",
  "showCaptions": true,
  "showQuote": true,
  "userName": "Tim",
  "userPic": "",
  "showClock": true,
  "clock24": false,
  "showDate": true,
  "showDay": true,
  "classCount": 2,
  "photoSel": ["p1","p2","p3","p4","p5"],
  "showForking": true,
  "compactBar": true,
  "compactBrand": "icon",
  "barAutoHide": true
}/*EDITMODE-END*/;

function Icon({d}){ return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>; }
const DotsIcon  = <Icon d={<g fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></g>} />;
const HelpIcon  = <Icon d={<g><circle cx="12" cy="12" r="9"/><path d="M9.2 9.2a2.8 2.8 0 0 1 5.4 1c0 1.8-2.6 2-2.6 3.6"/><circle cx="12" cy="17.4" r=".6" fill="currentColor"/></g>} />;
const GridIcon  = <Icon d={<g><rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/></g>} />;
const ChatIcon  = <svg viewBox="0 0 1024 1024" fill="currentColor"><path d="M224 505.6h192c12.8 0 25.6-12.8 25.6-25.6s-12.8-25.6-25.6-25.6h-192c-12.8 0-25.6 12.8-25.6 25.6s12.8 25.6 25.6 25.6zM608 582.4h-384c-12.8 0-25.6 12.8-25.6 25.6s12.8 25.6 25.6 25.6h384c12.8 0 25.6-12.8 25.6-25.6s-12.8-25.6-25.6-25.6z"/><path d="M819.2 96H268.8c-57.6 0-108.8 57.6-108.8 121.6v6.4c-57.6 6.4-96 51.2-96 115.2v396.8c0 64 44.8 108.8 102.4 115.2v76.8c0 12.8 6.4 19.2 12.8 25.6 6.4 6.4 12.8 6.4 19.2 6.4h6.4l409.6-108.8h76.8c44.8 0 83.2-25.6 96-64 6.4 6.4 12.8 19.2 25.6 19.2 57.6 0 108.8-57.6 108.8-121.6V217.6c6.4-64-44.8-121.6-102.4-121.6z m-83.2 640c0 25.6-19.2 44.8-38.4 44.8H614.4h-6.4l-371.2 102.4v-70.4c0-19.2-12.8-32-32-32h-32c-19.2 0-38.4-19.2-38.4-44.8V339.2c0-25.6 19.2-44.8 38.4-44.8h524.8c19.2 0 38.4 19.2 38.4 44.8v396.8z m128-57.6c0 32-19.2 57.6-44.8 57.6-6.4 0-12.8 0-19.2 6.4V339.2c0-64-51.2-115.2-108.8-115.2H224c0-32 19.2-57.6 44.8-57.6h550.4c25.6 0 44.8 25.6 44.8 57.6v454.4z"/></svg>;
const ShoutIcon = <Icon d={<g><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></g>} />;
const TodoIcon  = <Icon d={<g><rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="M8 12l3 3 5-6"/></g>} />;
const NotesIcon = <Icon d={<g><path d="M6 3h8l4 4v14H6z"/><path d="M9 10h6M9 14h6M9 18h3"/></g>} />;
const CatchIcon = <Icon d={<g><path d="M6 21V4"/><path d="M6 4h11l-2 4 2 4H6"/></g>} />;
const FolderIcon= <Icon d={<path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h3.6l1.8 1.8h7.6A1.5 1.5 0 0 1 20 9.3v7.2A1.5 1.5 0 0 1 18.5 18h-13A1.5 1.5 0 0 1 4 16.5Z"/>} />;
const PlayIcon  = <Icon d={<path d="M7 5l12 7-12 7z" fill="currentColor" stroke="none"/>} />;
const PauseIcon = <Icon d={<g fill="currentColor" stroke="none"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></g>} />;
const ResetIcon = <Icon d={<g><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v4h4"/></g>} />;

const TOOLS = [
  { k:'shout', label:'Shout Box', icon:ShoutIcon },
  { k:'todo',  label:'To-Do',    icon:TodoIcon  },
  { k:'notes', label:'Notes',    icon:NotesIcon },
  { k:'catch', label:'Catch-up', icon:CatchIcon },
];

function ToolsBar({ onCatch, onTool }){
  const [open,setOpen]=useState(false);
  const ref=useRef(null);
  useEffect(()=>{
    if(!open) return;
    const onDoc=(e)=>{ if(ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown',onDoc);
    return ()=>document.removeEventListener('mousedown',onDoc);
  },[open]);
  return (
    <div className="toolswrap" ref={ref}>
      <button className={'toolsbtn toolsbtn-circle glass'+(open?' open':'')} onClick={()=>setOpen(o=>!o)}
              title="Tools — quick access to Shout Box, To-Do and more">
        {ChatIcon}
        {(()=>{ let m=0; try{ m=(window.NotifStore?window.NotifStore.unread():[]).filter(n=>n.type==='message').length; }catch(e){} return m>0?<span className="toolsbtn-badge">{m>9?'9+':m}</span>:null; })()}
      </button>
      {open &&
        <div className="toolspop">
          {TOOLS.map(tl=>(
            <button key={tl.k} className="tool" onClick={()=>{ setOpen(false); if(tl.k==='catch'&&onCatch){onCatch();} else if(onTool){onTool(tl.k);} }}>{tl.icon}<span>{tl.label}</span></button>
          ))}
        </div>}
    </div>
  );
}

function Photos({ motion, list }){
  const photos = (list && list.length) ? list : PHOTOS;
  const key = photos.join('|');
  const [idx,setIdx]=useState(0);
  useEffect(()=>{ setIdx(0); },[key]);
  useEffect(()=>{
    if(motion==='static') return;
    const id=setInterval(()=>setIdx(i=>(i+1)%photos.length), 7000);
    return ()=>clearInterval(id);
  },[motion,photos.length]);
  return (
    <React.Fragment>
      {photos.map((src,i)=>(
        <div key={src+'|'+i} className={'photo'+(i===idx?' on':'')} style={{backgroundImage:`url('${src}')`}} />
      ))}
    </React.Fragment>
  );
}

const THEME_CYCLE = ['honey','blossom','mint','sky'];
function Ambient({ theme, motion }){
  const drift  = motion==='fade-zoom';
  const change = motion!=='static';
  // Normal is its own standalone brand-mesh wash — it does NOT cycle.
  // 'off' (theme disabled, photo only) falls back to the normal wash if someone
  // switches to Wash, so the background is never blank.
  const palette = (theme==='normal'||theme==='off') ? 'normal' : theme;
  const layers = [palette];
  const cycling = false;
  const [idx,setIdx]=useState(0);
  useEffect(()=>{
    if(!cycling) return;
    const id=setInterval(()=>setIdx(i=>(i+1)%layers.length), 26000);
    return ()=>clearInterval(id);
  },[cycling,layers.length]);
  if(!cycling){
    return <div className={'ambient t-'+layers[0]+' on'+(drift?' drift':'')} />;
  }
  return (
    <React.Fragment>
      {layers.map((p,i)=>(
        <div key={p} className={'ambient t-'+p+(i===idx?' on':'')+(drift?' drift':'')} />
      ))}
    </React.Fragment>
  );
}

function ClockHover({ L, x, y }){
  const s = window.DS.SUBJECTS[L.subjectId];
  const res = window.DS.resourcesFor ? window.DS.resourcesFor(L).length : 0;
  return ReactDOM.createPortal(
    <div className="clock-hov" style={{left:x, top:y}}>
      <div className="clock-hov-h"><span className="clock-hov-dot" style={{background:`var(${s.c})`}} />{s.full}</div>
      <div className="clock-hov-title">{L.title}</div>
      {L.objective && <div className="clock-hov-obj">{L.objective}</div>}
      <div className="clock-hov-meta">{L.std && <span className="clock-hov-std">{L.std}</span>}<span className="clock-hov-res">{res} resources</span></div>
      <div className="clock-hov-hint">Click for plan · post · teach · planner</div>
    </div>, document.body);
}

function Clock({ state, t, onPick }){
  const { now } = state;
  const c24 = !!t.clock24;
  const day = now.toLocaleDateString('en-US',{weekday:'long'});
  const date = now.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  const time = now.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit',hour12:!c24});
  const ftime = (hhmm)=> c24 ? hhmm : window.DS.fmt(hhmm);
  const n = Math.max(1, Math.min(4, t.classCount||2));
  const rem = state.remaining || [];
  const hasToday = rem.some(l=>l.dayIdx===state.todayIdx && l.status!=='done');
  const list = rem.slice(0, n);
  const [hov,setHov]=useState(null);
  useEffect(()=>{ if(!hov) return; const off=(e)=>{ if(!(e.target&&e.target.closest&&e.target.closest('.per-btn'))) setHov(null); }; document.addEventListener('mousemove',off); window.addEventListener('scroll',off,true); return ()=>{ document.removeEventListener('mousemove',off); window.removeEventListener('scroll',off,true); }; },[hov]);
  const showDay = t.showDay!==false, showDate = t.showDate!==false;
  const Row = ({ L, first })=>{
    const s = window.DS.SUBJECTS[L.subjectId];
    const isNow = L.status==='now';
    const label = isNow ? 'Now' : (first && hasToday ? 'Up next' : 'Next');
    return (
      <button className="per per-btn"
        onMouseEnter={e=>{ const r=e.currentTarget.getBoundingClientRect(); setHov({ L, x:r.left, y:r.top }); }}
        onMouseLeave={()=>setHov(h=>h&&h.L===L?null:h)}
        onClick={e=>{ setHov(null); onPick&&onPick(L,e); }}>
        <span className="pdot" style={{background:`var(${s.c})`}} />
        <span className="pmeta">
          <span className="plabel">{label}</span>
          <span className="psub">
            <span className="pname">{L.title}</span>
            <span className="ptime">{isNow?`${ftime(L.start)}–${ftime(L.end)}`:ftime(L.start)}</span>
          </span>
        </span>
      </button>
    );
  };
  return (
    <div className="clock glass">
      <div className="now-time" title="Your day at a glance — the current time and your upcoming classes. Click a class to open it."><span className="tt">{time}</span>{(showDay||showDate) && <span className="dd">{[showDay?day:null, showDate?date:null].filter(Boolean).join(' · ')}</span>}</div>
      <div className="hr" />
      {!hasToday && <div className="clock-done">Done for today · up next tomorrow</div>}
      {list.length ? list.map((L,i)=><Row key={L.id||i} L={L} first={i===0} />) : <div className="clock-empty">No classes scheduled</div>}
      {hov && <ClockHover L={hov.L} x={hov.x} y={hov.y} />}
    </div>
  );
}

/* Teach board lives in teach.jsx → window.TeachView */

const TEACH_QUOTES = [
  { short:'Good teachers teach from the heart, not from the book. Great teachers teach from the heart and the book.',
    author:'Anonymous',
    context:'A reminder that connection comes before content — but the best teaching marries genuine care with deep command of the material, drawing on both heart and book.',
    source:'Teaching folklore', url:'https://www.edutopia.org/' },
  { short:'Children are not vessels to be filled, but lamps to be lit.',
    author:'Rabindranath Tagore',
    context:'Tagore, who founded the school at Santiniketan, believed education should awaken curiosity and imagination rather than pour in facts — the teacher’s role is to kindle, not to fill.',
    source:'On Tagore’s philosophy of education', url:'https://en.wikipedia.org/wiki/Rabindranath_Tagore' },
  { short:'Education is the most powerful weapon which you can use to change the world.',
    author:'Nelson Mandela',
    context:'Mandela spoke often about education as the surest path out of poverty and injustice — a force capable of transforming individuals and, through them, whole societies.',
    source:'Speech, University of the Witwatersrand', url:'https://en.wikipedia.org/wiki/Nelson_Mandela' },
  { short:'Tell me and I forget, teach me and I may remember, involve me and I learn.',
    author:'Xunzi',
    context:'Often attributed to Benjamin Franklin, this idea traces back to the Confucian philosopher Xunzi. It captures active learning: students understand most deeply when they do, not just listen.',
    source:'Attributed · Xunzi', url:'https://en.wikipedia.org/wiki/Xunzi_(book)' },
  { short:'Teaching is the one profession that creates all other professions.',
    author:'Anonymous',
    context:'A tribute to the multiplier effect of teaching — every doctor, engineer, and artist was first guided by a teacher, making the classroom the origin point of all other work.',
    source:'Teaching folklore', url:'https://www.edutopia.org/' },
];

function Hero({ state, t, onNav, onQuote, cog }){
  const greetHour = state.now.getHours();
  const greet = greetHour<12?'Good morning':greetHour<17?'Good afternoon':'Good evening';
  const fullDate = state.now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}).toUpperCase();
  const quote = TEACH_QUOTES[state.now.getDate() % TEACH_QUOTES.length];
  // keep the visible line to one short line; longer quotes truncate with … (full text in popup)
  const WORDS=11;
  const words=quote.short.split(' ');
  const display = words.length>WORDS ? words.slice(0,WORDS).join(' ').replace(/[.,;:]$/,'')+'…' : quote.short;
  return (
    <div className="center">
      <div className={'canvas '+t.canvas}>
        <h1 className="greeting">{greet}, {t.userName||'Tim'}</h1>
        <div className="console-row">
          <div className={'views '+t.viewStyle}>
            {NAV.map(w=>(
              <button key={w} className="view" title={NAV_TIP[w]} onClick={()=>onNav(w)}>
                <span className="vw-word">{w}</span>
                {t.showCaptions && <span className="vw-sub">{NAV_SUB[w]}</span>}
              </button>
            ))}
          </div>
          {t.showDate===false && cog}
        </div>
        {t.showDate!==false && <span className="eyebrow">{fullDate}{cog}</span>}
      </div>
    </div>
  );
}

/* bottom-centered airy quote line + frosted context popup */
function QuoteLine({ now, onOpen }){
  const quote = TEACH_QUOTES[now.getDate() % TEACH_QUOTES.length];
  return (
    <button className="hero-quote" onClick={()=>onOpen(quote)} title="Read the context">
      <span className="hero-quote-rule"/>
      <span className="hero-quote-text">{quote.short}</span>
      <span className="hero-quote-by">{quote.author}</span>
    </button>
  );
}

function QuotePopup({ quote, onClose }){
  useEffect(()=>{
    const onKey=(e)=>{ if(e.key==='Escape') onClose(); };
    document.addEventListener('keydown',onKey); return ()=>document.removeEventListener('keydown',onKey);
  },[onClose]);
  if(!quote) return null;
  return (
    <div className="qpop-scrim" onClick={onClose}>
      <div className="qpop" onClick={(e)=>e.stopPropagation()}>
        <span className="qpop-mark">“</span>
        <p className="qpop-quote">{quote.short}</p>
        <p className="qpop-by">{quote.author}</p>
        <p className="qpop-context">{quote.context}</p>
        <a className="qpop-link" href={quote.url} target="_blank" rel="noopener">{quote.source} ↗</a>
      </div>
    </div>
  );
}

function HomeCog({ t, setTweak, view, pageBg, setPageBg, customPhotos, setCustomPhotos, open, setOpen }){
  const [scope,setScope]=useState('site');
  const ref=useRef(null), fileRef=useRef(null), popRef=useRef(null), picRef=useRef(null);
  useEffect(()=>{
    if(!open) return;
    const onDoc=(e)=>{ if((ref.current&&ref.current.contains(e.target))||(popRef.current&&popRef.current.contains(e.target))) return; setOpen(false); };
    const onEsc=(e)=>{ if(e.key==='Escape') setOpen(false); };
    document.addEventListener('mousedown',onDoc); document.addEventListener('keydown',onEsc);
    return ()=>{ document.removeEventListener('mousedown',onDoc); document.removeEventListener('keydown',onEsc); };
  },[open]);
  const UI = window.SettingsUI || {};
  const ov = pageBg[view] || {};
  const mode = scope==='page' ? (ov.mode||t.bgMode) : t.bgMode;
  const sel = (scope==='page' ? (ov.photos||t.photoSel) : t.photoSel) || BUILTIN_IDS;
  const setMode=(m)=>{ if(scope==='page'){ const n={...pageBg,[view]:{...ov,mode:m}}; setPageBg(n); sjson('cc_pagebg',n); } else setTweak('bgMode',m); };
  const toggleSel=(id)=>{ const cur=sel.includes(id)?sel.filter(x=>x!==id):[...sel,id]; const nn=cur.length?cur:[id];
    if(scope==='page'){ const n={...pageBg,[view]:{...ov,photos:nn}}; setPageBg(n); sjson('cc_pagebg',n); } else setTweak('photoSel',nn); };
  const clearPage=()=>{ const n={...pageBg}; delete n[view]; setPageBg(n); sjson('cc_pagebg',n); };
  const addPhoto=(file)=>{ const rd=new FileReader(); rd.onload=()=>{ const np=[...customPhotos,{id:'c'+Date.now().toString(36),url:rd.result}]; setCustomPhotos(np); sjson('cc_photos',np); }; rd.readAsDataURL(file); };
  const removePhoto=(id)=>{ const np=customPhotos.filter(p=>p.id!==id); setCustomPhotos(np); sjson('cc_photos',np); };
  const allP=[...BUILTIN_PHOTOS, ...customPhotos];
  const hasOv = !!(ov.mode||ov.photos);
  const _hvmap={version:'version',bgMode:'mode',glass:'glass',photoSel:'photos'};
  const hcScoped={...t, version:ov.version||t.version, bgMode:ov.mode||t.bgMode, glass:ov.glass||t.glass, photoSel:ov.photos||t.photoSel};
  const hcSetScoped=(k,v)=>{ if(_hvmap[k]){ const n={...pageBg,[view]:{...ov,[_hvmap[k]]:v}}; setPageBg(n); sjson('cc_pagebg',n); } else setTweak(k,v); };
  const hcSetSite=(k,v)=>{ setTweak(k,v); if(_hvmap[k]&&ov[_hvmap[k]]!==undefined){ const no={...ov}; delete no[_hvmap[k]]; const n={...pageBg,[view]:no}; setPageBg(n); sjson('cc_pagebg',n); } };
  const R=UI.Row||(()=>null), Sg=UI.Seg||(()=>null), Tg=UI.Toggle||(()=>null), TP=UI.ThemePicker||(()=>null), FP=UI.FramePicker||(()=>null), GP=UI.GlassPicker||(()=>null), BP=UI.BgPicker||(()=>null);
  return (
    <span className="homecog" ref={ref}>
      <button className="homecog-btn" title="Landing page menu — your profile, theme, background, clock" onClick={()=>setOpen(o=>!o)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>
      </button>
      {open && ReactDOM.createPortal(<div className="homecog-portal"><div className="homecog-pop" ref={popRef}>
        <div className="hc-title">Landing Page Menu</div>
        <div className="hc-sec hc-you">
          <div className="hc-sechead"><span className="hc-seclbl">You</span></div>
          <div className="hc-yourow">
            <button className="hc-avatar" title="Change your picture" onClick={()=>picRef.current&&picRef.current.click()} style={t.userPic?{backgroundImage:`url('${t.userPic}')`,backgroundSize:'cover',backgroundPosition:'center'}:undefined}>
              {!t.userPic && (t.userName||'T').trim().charAt(0).toUpperCase()}
              <span className="hc-avatar-edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></span>
              <input ref={picRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>{ const f=e.target.files&&e.target.files[0]; if(f){ const rd=new FileReader(); rd.onload=()=>setTweak('userPic',rd.result); rd.readAsDataURL(f); } e.target.value=''; }} />
            </button>
            <div className="hc-youfields">
              <input className="hc-nameinput" value={t.userName||''} onChange={e=>setTweak('userName',e.target.value)} placeholder="Your name" />
              <div className="hc-youhint">{t.userPic?<button className="hc-piclink" onClick={()=>setTweak('userPic','')}>Use default picture</button>:'Defaults to your Google picture'}</div>
            </div>
          </div>
        </div>
        <div className="vt-scope" style={{margin:'0 0 12px'}}><button className={scope==='page'?'on':''} onClick={()=>setScope('page')}>This page</button><button className={scope==='site'?'on':''} onClick={()=>{ setScope('site'); clearPage(); }}>Whole site</button></div>
        {window.AppearanceControls && <window.AppearanceControls t={scope==='page'?hcScoped:t} setTweak={scope==='page'?hcSetScoped:hcSetSite} />}
        <R label="Panel"><Sg value={t.canvas} options={[{value:'glass-dim',label:'Glass'},{value:'glass-light',label:'Light'},{value:'min',label:'Minimal'}]} onChange={v=>setTweak('canvas',v)} /></R>
        <R label="Buttons"><Sg value={t.viewStyle} options={[{value:'light',label:'Light'},{value:'dark',label:'Dark'},{value:'console',label:'Segmented'}]} onChange={v=>setTweak('viewStyle',v)} /></R>
        <R label="Quote"><Tg value={t.showQuote} onChange={v=>setTweak('showQuote',v)} /></R>
        <div className="hc-sec">
          <div className="hc-sechead"><span className="hc-seclbl">Date &amp; time</span></div>
          <R label="Show Clock / Upcoming Lesson Panel"><Tg value={t.showClock!==false} onChange={v=>setTweak('showClock',v)} /></R>
          <R label="24-hour time"><Tg value={!!t.clock24} onChange={v=>setTweak('clock24',v)} /></R>
          <R label="Classes shown" hint="up-next panel"><Sg value={String(t.classCount||2)} options={[1,2,3,4].map(x=>({value:String(x),label:String(x)}))} onChange={v=>setTweak('classCount',+v)} /></R>
        </div>
      </div></div>, document.body)}
    </span>
  );
}

const _lumCache={};
function measureLum(url){
  return new Promise(res=>{
    if(url in _lumCache) return res(_lumCache[url]);
    const img=new Image(); try{img.crossOrigin='anonymous';}catch(e){}
    img.onload=()=>{ try{
      const c=document.createElement('canvas'); const w=c.width=32, h=c.height=32;
      const ctx=c.getContext('2d'); ctx.drawImage(img,0,0,w,h);
      const d=ctx.getImageData(0,0,w,h).data; let sum=0,n=0;
      for(let i=0;i<d.length;i+=4){ sum+=(0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2])/255; n++; }
      const lum=sum/n; _lumCache[url]=lum; res(lum);
    }catch(e){ res(null); } };
    img.onerror=()=>res(null);
    img.src=url;
  });
}
function App(){
  const [t,setTweak]=useTweaks(TWEAK_DEFAULTS);
  const [shared]=useState(()=>window.Share?window.Share.getShared():null);
  const [shareView,setShareView]=useState(()=>!!(window.Share&&window.Share.getShared()));
  const [mode,setMode]=useState('personal');
  const [view,setViewRaw]=useState('home');           // home | Day | Week | Year | Teach | Plan
  const histRef=useRef([]);
  const [canBack,setCanBack]=useState(false);
  const setView=(v)=>{ setViewRaw(cur=>{ if(v!==cur){ histRef.current.push(cur); setCanBack(true); } return v; }); };
  const goBack=()=>{ const h=histRef.current; if(h.length){ const prev=h.pop(); setViewRaw(prev); setCanBack(h.length>0); } else { setViewRaw('home'); setCanBack(false); } };
  const [prevView,setPrevView]=useState('Day');
  const [lesson,setLesson]=useState(null);
  const now = window.VS.useNow();
  const state = window.DS.getState(now);

  const openLesson=(L)=>{ if(L) setLesson(L); setView('Teach'); };
  const viewRef=useRef(view); viewRef.current=view;
  const hubRef=useRef(null);
  const [hubSrc,setHubSrc]=useState('../V2%20Planning%20Hub.html?embed=1');
  const hubTry=useRef(0);
  const pendingUnit=useRef(null);
  const popHubRef=useRef(null);
  const [unitPop,setUnitPop]=useState(null);
  const openUnitInHub=(sid,uname)=>{ pendingUnit.current={name:String(uname||''),sid:String(sid||'')}; setUnitPop({sid,uname});
    let n=0; const iv=setInterval(()=>{ n++;
      const w=popHubRef.current&&popHubRef.current.contentWindow;
      if(w&&pendingUnit.current){ try{ w.postMessage({type:'cc-open-unit',name:pendingUnit.current.name,sid:pendingUnit.current.sid},'*'); }catch(e){} }
      if(n>=30){ clearInterval(iv); } },400); };
  useEffect(()=>{ const h=(e)=>{ const dd=e.data||{};
      if(dd.type==='cc-close-unitpop'){ setUnitPop(null); return; }
      if(dd.type==='cc-hub-ready'&&pendingUnit.current){
      const w=popHubRef.current&&popHubRef.current.contentWindow; if(w){ try{ w.postMessage({type:'cc-open-unit',name:pendingUnit.current.name,sid:pendingUnit.current.sid},'*'); }catch(_){} } } };
    window.addEventListener('message',h); return ()=>window.removeEventListener('message',h); },[]);
  useEffect(()=>{ const w=hubRef.current&&hubRef.current.contentWindow; if(w){ try{ w.postMessage({type:'cc-scope',scope:mode==='team'?'team':'personal'},'*'); }catch(e){} } },[mode]);
  const [editMode,setEditMode]=useState(()=>ljson('cc_editmode',{}));
  const setEdit=(v,on)=>setEditMode(m=>{ const n={...m,[v]:on}; sjson('cc_editmode',n); return n; });
  const [planModal,setPlanModal]=useState(null);
  const [planSel,setPlanSel]=useState(null);
  const openPlan=(L)=>{ const tgt=L||teachLesson; if(!tgt) return;
    if(viewRef.current==='Day'){ setEdit('Day',true); setPlanSel(tgt.id); setTimeout(()=>setPlanSel(null),80); }
    else { setPlanModal(tgt); } };
  const openPost=(L)=>{ if(L) setLesson(L); setView('Post'); };
  useEffect(()=>{ const h=(e)=>{ if(e.detail&&e.detail.lesson) openPost(e.detail.lesson); }; window.addEventListener('cc-open-post',h); return ()=>window.removeEventListener('cc-open-post',h); },[]);
  useEffect(()=>{ const h=(e)=>{ if(e.detail&&e.detail.lesson) openPlan(e.detail.lesson); }; window.addEventListener('cc-open-plan',h); return ()=>window.removeEventListener('cc-open-plan',h); },[]);
  useEffect(()=>{ const h=(e)=>{ if(e.detail&&e.detail.k) setTweak(e.detail.k, e.detail.v); }; window.addEventListener('cc-global-tweak',h); return ()=>window.removeEventListener('cc-global-tweak',h); },[]);
  useEffect(()=>{ const h=(e)=>{ const r=e.detail||{}; if(r.tool){ setDockTool(r.tool); } if(r.view){ setView(r.view); } }; window.addEventListener('cc-notif-nav',h); return ()=>window.removeEventListener('cc-notif-nav',h); },[]);
  const teachLesson = lesson || state.current || state.next;

  const [menu,setMenu]=useState(null);
  const [configOpen,setConfigOpen]=useState(false);
  const [catchOpen,setCatchOpen]=useState(false);
  const [dockTool,setDockTool]=useState(null);
  const [unit,setUnit]=useState(null);
  const [libOpen,setLibOpen]=useState(false);
  const [quotePop,setQuotePop]=useState(null);
  const [customPhotos,setCustomPhotos]=useState(()=>ljson('cc_photos',[]));
  const [pageBg,setPageBg]=useState(()=>ljson('cc_pagebg',{}));
  const [cogOpen,setCogOpen]=useState(false);
  const pickLesson=(L,e)=>{ if(L) setLesson(L); setMenu({ lesson:L, x:(e?e.clientX:window.innerWidth/2), y:(e?e.clientY:window.innerHeight/2) }); };
  useEffect(()=>{
    if(!menu) return;
    const onDoc=(e)=>{ if(!e.target.closest('.lesson-menu')) setMenu(null); };
    const onEsc=(e)=>{ if(e.key==='Escape') setMenu(null); };
    document.addEventListener('mousedown',onDoc); document.addEventListener('keydown',onEsc);
    return ()=>{ document.removeEventListener('mousedown',onDoc); document.removeEventListener('keydown',onEsc); };
  },[menu]);

  const ovBg = pageBg[view] || {};
  const effBgMode = ovBg.mode || t.bgMode;
  const effVersion = ovBg.version || t.version;
  const effGlass = ovBg.glass || t.glass || 'dark';
  const photoSel = ovBg.photos || t.photoSel || BUILTIN_IDS;
  const photoList = [...BUILTIN_PHOTOS, ...customPhotos].filter(p=>photoSel.includes(p.id)).map(p=>p.url);
  const ambient = effBgMode==='ambient';   // Wash shows whenever Background=Wash, regardless of theme
  const night = t.theme==='night';
  const off = t.theme==='off';
  const photoShowing = !ambient;          // a teaching photo is the background
  // Auto-detect background brightness: sample the photo(s) and average luminance (0–1).
  const [photoLum,setPhotoLum]=React.useState(null);
  React.useEffect(()=>{ let stop=false; if(!photoShowing||!photoList.length){ setPhotoLum(null); return; }
    Promise.all(photoList.slice(0,6).map(measureLum)).then(vs=>{ if(stop)return; const ok=vs.filter(v=>v!=null); setPhotoLum(ok.length? ok.reduce((a,b)=>a+b,0)/ok.length : null); });
    return ()=>{ stop=true; }; }, [photoList.join('|'), photoShowing]);
  // Bright themed photo → light tone with a soft frosted photo behind white cards.
  // The frosted-glass register (data-glass) is a SURFACE-ONLY choice — it must NOT
  // alter the background. Tone/scrim stay driven purely by background + brightness.
  // 'bright'/'dim' are manual overrides; 'normal' (default) auto-detects from photo luminance.
  const autoBright = photoShowing && photoLum!=null && photoLum>0.6;
  const photoBright = photoShowing && !off && (t.bgDim==='bright' ? true : (t.bgDim==='dim' ? false : autoBright));

  // ONE tone for the whole app so every page matches the home screen.
  const tone = night ? 'dark' : photoBright ? 'light' : photoShowing ? 'dark' : 'light';
  const scrimClass = ambient ? 'none' : (night ? 'dim' : photoBright ? 'frost' : 'min');
  const veil = view==='home' ? 'none'
             : photoBright ? 'photo-frost'
             : photoShowing ? 'photo-soft'
             : night ? 'recede'
             : 'ambient';

  const headFont = t.headFont==='neutral'
    ? '-apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,Arial,sans-serif'
    : 'var(--font-display)';

  /* Bright (B) adopts the subject-led views (tinted week cells, color day panel,
     Year constellation) — the old "Color" views on Bright's white paper.
     Pastel (C) reskins the same views via pastel-frame.css. */
  const ViewSet = { A:window.ViewsA, B:window.ViewsC, C:window.ViewsC }[effVersion];
  let ViewComp = null;
  if(view!=='home' && view!=='Teach' && view!=='Post' && ViewSet) ViewComp = ViewSet[view];

  const isEdit = (view==='Day'||view==='Week') && !!editMode[view];
  const showBot = (view==='home' || view==='Day') && !isEdit;
  const compact = (t.compactBar!==false) && (view==='Teach'||view==='Plan'||view==='Post');
  const [dots,setDots]=useState(false);
  const dotsRef=useRef(false); dotsRef.current=dots;
  const [barHidden,setBarHidden]=useState(false);
  useEffect(()=>{ setDots(false); },[view]);
  useEffect(()=>{
    if(!(compact && t.barAutoHide!==false)){ setBarHidden(false); return; }
    if(window.innerWidth<640){ setBarHidden(false); return; }  /* phones: bar IS the nav */
    const touch=!!(window.matchMedia&&window.matchMedia('(hover: none)').matches);
    let tm=null; const arm=()=>{ clearTimeout(tm); tm=setTimeout(()=>{ if(!dotsRef.current) setBarHidden(true); },touch?5000:3200); };
    const move=(e)=>{ if(e.clientY<70||dotsRef.current){ setBarHidden(false); arm(); } };
    const ts=(e)=>{ const y=e.touches&&e.touches[0]&&e.touches[0].clientY; if(y!=null&&y<28){ setBarHidden(false); } arm(); };
    arm(); window.addEventListener('mousemove',move); window.addEventListener('touchstart',ts,{passive:true});
    return ()=>{ clearTimeout(tm); window.removeEventListener('mousemove',move); window.removeEventListener('touchstart',ts); };
  },[compact,t.barAutoHide,view]);
  useEffect(()=>{ if(!dots) return; const h=(e)=>{ if(!e.target.closest('.cb-menuwrap')) setDots(false); }; document.addEventListener('mousedown',h); return ()=>document.removeEventListener('mousedown',h); },[dots]);

  return (
    <div className="home" data-tone={tone} data-mode={mode} data-version={effVersion} data-theme={t.theme} data-canvas={t.canvas} data-bg={ambient?'ambient':'photo'} data-glass={effGlass} data-dim={t.bgDim} data-zoom={t.photoMotion==='fade-zoom'?'1':'0'} data-dense={view!=='home'?'1':'0'} style={{'--head-font':headFont}}>
      {shareView && shared && <window.Share.Viewer data={shared} onClose={()=>setShareView(false)} />}
      <div className={'mesh '+(t.mesh==='off'?'':t.mesh)} />
      <div className={'frame'+(t.frame==='fullbleed'?' fullbleed':'')} data-veil={veil}>
        {ambient ? <Ambient theme={t.theme} motion={t.photoMotion} /> : <Photos motion={t.photoMotion} list={photoList} />}
        <div className={'scrim '+scrimClass} />
        <div className="veil" />
      </div>
      <div className="theme-tint" />

      <div className={'overlay'+(t.frame==='fullbleed'?' fb':'')} style={t.frame==='fullbleed'?{inset:0}:undefined}>
        {compact ? (<React.Fragment>
        <div className={'cbar'+(barHidden?' hidden':'')} onMouseEnter={()=>setBarHidden(false)}>
          <div className="cb-left">
            <button className="cb-glyph" title="Home" onClick={()=>setView('home')} dangerouslySetInnerHTML={{__html:LOGO_SVG}}></button>
            {t.compactBrand==='wordmark' && <span className="wm cb-wm" title="Home" onClick={()=>setView('home')}>mycurricula<span className="tld">.app</span></span>}
            <span className="cb-div"></span>
            <ViewTitle view={view} t={t} setTweak={setTweak} pageBg={pageBg} setPageBg={setPageBg} />
          </div>
          <div className="cb-center">
            <button className="navback" title="Back to the previous screen" onClick={goBack}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
            <div className="views nav">
              {NAV.map(w=>(
                <button key={w} className={'nav-item'+(view===w?' active':'')} title={NAV_TIP[w]} onClick={()=>{ if(w==='Day'){ setEdit('Day',false); } setView(w); }}>{w}</button>
              ))}
            </div>
          </div>
          <div className="cb-right">
            <div className="modesw modesw-icon glass">
              <button className={'modesw-ib'+(mode==='personal'?' active':'')} title="Personal — view and edit your own copy of each lesson. Edits here only affect you." onClick={()=>setMode('personal')} aria-label="Personal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0"/></svg></button>
              <button className={'modesw-ib team'+(mode==='team'?' active':'')} title="Team Curriculum — edit the shared master plan. Changes here affect the whole team." onClick={()=>setMode('team')} aria-label="Team Curriculum"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="7.5" r="2.9"/><path d="M7.6 18.5a4.4 4.4 0 0 1 8.8 0"/><circle cx="5" cy="9.5" r="2"/><path d="M1.8 17.8a3.2 3.2 0 0 1 3.2-2.3"/><circle cx="19" cy="9.5" r="2"/><path d="M22.2 17.8a3.2 3.2 0 0 0-3.2-2.3"/></svg></button>
            </div>
            {window.NotifBell && <window.NotifBell />}
            <div className="cb-menuwrap">
              <button className="cb-dots" title="More — tools, planner hub, and bar options" onClick={()=>setDots(o=>!o)}><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>
              {dots && <div className="cb-menu">
                <div className="cb-mh">Tools</div>
                {TOOLS.map(tl=><button key={tl.k} className="cb-mi" onClick={()=>{ setDots(false); if(tl.k==='catch'){ setCatchOpen(true); } else { setDockTool(tl.k); } }}>{tl.icon}<span>{tl.label}</span></button>)}
                <button className="cb-mi" onClick={()=>{ setDots(false); setLibOpen(true); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/></svg>Planner hub</button>
                <div className="cb-mh">This bar</div>
                <button className="cb-mi" title="Switch between the icon alone and icon + wordmark" onClick={()=>setTweak('compactBrand',t.compactBrand==='wordmark'?'icon':'wordmark')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="8" height="14" rx="2"/><path d="M14 7h7M14 12h7M14 17h5"/></svg>Brand: {t.compactBrand==='wordmark'?'icon + wordmark':'icon only'}</button>
                <button className="cb-mi" title="Slide the bar away when idle; bring it back by moving the mouse to the top" onClick={()=>setTweak('barAutoHide',!(t.barAutoHide!==false))}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V9M7 14l5 5 5-5" transform="rotate(180 12 14)"/></svg>{t.barAutoHide!==false?'✓ Auto-hide on idle':'Auto-hide on idle'}</button>
                <button className="cb-mi" title="Back to the full top bar and page title" onClick={()=>{ setDots(false); setTweak('compactBar',false); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9h18"/></svg>Exit compact bar</button>
              </div>}
            </div>
          </div>
        </div>
        {barHidden && <button className="cb-peek" title="Show the top bar" onClick={()=>setBarHidden(false)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>}
        </React.Fragment>
        ) : (
        <div className="topbar">
          <div className="brand glass" style={{cursor:'pointer'}} onClick={()=>setView('home')} title="Home">
            <span className="glyph" dangerouslySetInnerHTML={{__html:LOGO_SVG}} />
            <span className="wm">mycurricula<span className="tld">.app</span></span>
          </div>
          <div className="tools">
            {(view==='Day'||view==='Week') &&
              <div className="modesw modesw-icon glass" role="tablist" title="View or edit this plan">
                <button className={'modesw-ib'+(!editMode[view]?' active':'')} title="View — the polished read view" onClick={()=>setEdit(view,false)} aria-label="View"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg></button>
                <button className={'modesw-ib'+(editMode[view]?' active':'')} title="Edit — plan, rearrange, and write lessons" onClick={()=>setEdit(view,true)} aria-label="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button>
              </div>}
            <div className="modesw modesw-icon glass">
              <button className={'modesw-ib'+(mode==='personal'?' active':'')} title="Personal — view and edit your own copy of each lesson. Edits here only affect you." onClick={()=>setMode('personal')} aria-label="Personal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0"/></svg></button>
              <button className={'modesw-ib team'+(mode==='team'?' active':'')} title="Team Curriculum — edit the shared master plan. Changes here affect the whole team." onClick={()=>setMode('team')} aria-label="Team Curriculum"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="7.5" r="2.9"/><path d="M7.6 18.5a4.4 4.4 0 0 1 8.8 0"/><circle cx="5" cy="9.5" r="2"/><path d="M1.8 17.8a3.2 3.2 0 0 1 3.2-2.3"/><circle cx="19" cy="9.5" r="2"/><path d="M22.2 17.8a3.2 3.2 0 0 0-3.2-2.3"/></svg></button>
            </div>
            <ToolsBar onCatch={()=>setCatchOpen(true)} onTool={(k)=>{ if(k==='resources'){ setView('Post'); } else { setDockTool(k); } }} />
            {window.NotifBell && <window.NotifBell />}
            <button className="iconbtn iconbtn-planner" title="Planner hub — lessons, units, resources, catch-up" onClick={()=>setLibOpen(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.2"/><path d="M3.5 9.5h17"/><path d="M8 3.5v3.5M16 3.5v3.5"/><rect x="7" y="12.5" width="2.6" height="2.6" rx="0.5" fill="currentColor" stroke="none"/><rect x="11" y="12.5" width="2.6" height="2.6" rx="0.5" fill="currentColor" stroke="none"/><rect x="15" y="12.5" width="2.6" height="2.6" rx="0.5" fill="currentColor" stroke="none"/><rect x="7" y="16" width="2.6" height="2.6" rx="0.5" fill="currentColor" stroke="none"/><rect x="11" y="16" width="2.6" height="2.6" rx="0.5" fill="currentColor" stroke="none"/></svg></button>
            {(view==='Teach'||view==='Plan'||view==='Post') && <button className="iconbtn" title="Compact top bar — one slim row, more room for the work" onClick={()=>setTweak('compactBar',true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9h18"/></svg></button>}
          </div>
        </div>
        )}

        {view==='home'
          ? <Hero state={state} t={t} onNav={(w)=>{ if(w==='Day'){ setEdit('Day',false); } setView(w); }} cog={<HomeCog t={t} setTweak={setTweak} view={view} pageBg={pageBg} setPageBg={setPageBg} customPhotos={customPhotos} setCustomPhotos={setCustomPhotos} open={cogOpen} setOpen={setCogOpen} />} />
          : <div className={'viewwrap'+(isEdit?' pb-editing':'')} data-view={view}>
              {!compact && <div className="navwrap">
                <div className={'navwrap-row'+(view==='Plan'?' pl-navrow':'')}>
                  {view==='Plan' && <button className="pl-back" onClick={goBack}>‹ Back</button>}
                  {view!=='Plan' && <button className="navback" title="Back to the previous screen" onClick={goBack}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>}
                  <div className="views nav">
                    {NAV.map(w=>(
                      <button key={w} className={'nav-item'+(view===w?' active':'')} onClick={()=>{ if(w==='Day'){ setEdit('Day',false); } setView(w); }}>{w}</button>
                    ))}
                  </div>
                  {view==='Year' && <button className="glass" title="Open this year in the Planning Hub — every unit and lesson, pacing, and the timeline" onClick={()=>setView('Plan')}
                    style={{marginLeft:'auto',display:'inline-flex',alignItems:'center',gap:'7px',border:'1px solid rgba(255,255,255,.35)',borderRadius:'999px',padding:'9px 16px',font:'700 12.5px var(--font-sans)',cursor:'pointer',color:'inherit'}}>Open in Planning Hub ↗</button>}
                </div>
              </div>}
              {!compact && <ViewTitle view={view} t={t} setTweak={setTweak} pageBg={pageBg} setPageBg={setPageBg} />}
              {view==='Teach'
                ? <div className="viewbody"><window.TeachView lesson={teachLesson} state={state} onPlan={openPlan} onPick={openLesson} /></div>
                : view==='Post'
                ? <window.ResourceWall state={state} focus={teachLesson} onTeach={openLesson} />
                : view==='Plan'
                ? <div style={{borderRadius:'18px',overflow:'hidden',transform:'translateZ(0)'}}><iframe ref={hubRef} className="hub-frame" src={hubSrc} aria-label="Planning Hub"
                    onLoad={()=>{ try{ hubRef.current.contentWindow.postMessage({type:'cc-scope',scope:mode==='team'?'team':'personal'},'*'); }catch(e){}
                      /* self-heal ONLY on genuine load failure (blocked/expired/404) — a slow Babel boot is normal, so poll patiently and never declare failure just because the app hasn't rendered yet */
                      let polls=0; const iv=setInterval(()=>{ polls++;
                        let broken=false, ok=false;
                        try{ const hd=hubRef.current&&hubRef.current.contentDocument;
                          if(!hd) broken=true;
                          else { ok=!!hd.querySelector('.ph-app');
                            const txt=(hd.body&&hd.body.textContent||'').slice(0,200).toLowerCase();
                            if(!ok&&txt.includes('file not found')) broken=true; } }
                        catch(e){ broken=true; }
                        if(ok){ clearInterval(iv); return; }
                        if(broken&&hubTry.current<2){ clearInterval(iv); hubTry.current++; setHubSrc('../V2%20Planning%20Hub.html?embed=1&r='+Date.now()); return; }
                        if(polls>=10) clearInterval(iv);
                      },2000); }}
                    style={{width:'100%',height:compact?'calc(100vh - 120px)':'calc(100vh - 210px)',minHeight:'540px',border:0,borderRadius:'18px',display:'block',background:'transparent'}}></iframe></div>
                : ((view==='Day'||view==='Week') && editMode[view] && window.PBEdit
                  ? <div className="viewbody">{view==='Week'
                      ? <window.PBEdit.WeekEdit state={state} mode={mode} onOpen={openPlan} />
                      : <window.PBEdit.DayEdit state={state} mode={mode} onOpen={openPlan} onTeach={openLesson} onExit={()=>setEdit('Day',false)} initialSel={planSel} dayIdx={Math.max(0,Math.min(state.days.length-1, state.todayIdx+(parseInt((typeof localStorage!=='undefined'&&localStorage.getItem('cc_dayoff'))||'0',10)||0)))} />}</div>
                  : (ViewComp ? <ViewComp state={state} open={openLesson} plan={openPlan} pick={pickLesson} post={openPost} unit={(sid,uname,prog)=>openUnitInHub(sid,uname)} /> : null))}
            </div>}

        {showBot &&
          <div className="botbar">
            <div className="ctx glass" title="Your school, grade and where you are in the year">
              <span className="cdot cdot-av" style={t.userPic?{backgroundImage:`url('${t.userPic}')`,backgroundSize:'cover',backgroundPosition:'center'}:undefined}>{!t.userPic && (t.userName||'T').trim().charAt(0).toUpperCase()}</span>
              <span className="cstack">
                <span className="ctop">Awsaj Academy</span>
                <span className="csub">Grade 5 · Unit 3 · Week 12</span>
              </span>
              <button className="ctx-gear" title="Help — hover any control to learn what it does">{HelpIcon}</button>
              <button className="ctx-gear" title="Settings — set up your curriculum, school week, academic year, holidays, appearance and more" onClick={()=>setConfigOpen(true)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg></button>
            </div>
            {t.showClock!==false && <Clock state={state} t={t} onPick={pickLesson} />}
          </div>}

        {view==='home' && t.showQuote && <QuoteLine now={state.now} onOpen={setQuotePop} />}
      </div>

      {menu &&
        <div className="lesson-menu" style={{left:Math.max(8, Math.min(menu.x, window.innerWidth-190)), top:Math.max(8, Math.min(menu.y, window.innerHeight-228))}}>
          <div className="lm-title"><span className="lm-dot" style={{background:`var(${window.DS.SUBJECTS[menu.lesson.subjectId].c})`}}/>{menu.lesson.title}</div>
          <button onClick={()=>{ openPlan(menu.lesson); setMenu(null); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M16 3v5h5M8 12h6M8 16h4"/></svg>Plan
          </button>
          <button className="teach" onClick={()=>{ openLesson(menu.lesson); setMenu(null); }}>
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z"/></svg>Teach
          </button>
          <button onClick={()=>{ openPost(menu.lesson); setMenu(null); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 14h5"/></svg>Post
          </button>
          <button onClick={()=>{ setLesson(menu.lesson); setLibOpen(true); setMenu(null); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/></svg>Planner
          </button>
        </div>}

      {configOpen && window.ConfigPage && <window.ConfigPage t={t} setTweak={setTweak} onClose={()=>setConfigOpen(false)} />}
      {catchOpen && window.CatchUp && <window.CatchUp onClose={()=>setCatchOpen(false)} onTeach={openLesson} onPlan={openPlan} onPost={openPost} />}
      {window.ToolsDock && <window.ToolsDock tool={dockTool} onTool={setDockTool} onClose={()=>setDockTool(null)} />}
      {window.Toasts && <window.Toasts />}
      {unit && <window.UE.Explorer sid={unit.sid} uname={unit.uname} progress={unit.prog} onClose={()=>setUnit(null)} onTeach={openLesson} onPlan={openPlan} onPost={openPost} />}
      {libOpen && window.PlannerHub && <window.PlannerHub state={state}
        onClose={()=>setLibOpen(false)}
        onPlan={(L)=>{setLibOpen(false);openPlan(L);}} onPost={(L)=>{setLibOpen(false);openPost(L);}} onTeach={(L)=>{setLibOpen(false);openLesson(L);}}
        onUnit={(u)=>{setLibOpen(false);openUnitInHub(u.sid,u.uname);}} />}
      <QuotePopup quote={quotePop} onClose={()=>setQuotePop(null)} />
      {planModal && window.PBEdit && <window.PBEdit.LessonModal L={planModal} mode={mode} readOnly={false} onClose={()=>setPlanModal(null)} onTeach={openLesson} />}
      {window.PBEdit && <window.PBEdit.SelectionToolbar />}
      {unitPop && <div className="unitpop-scrim" style={{position:'fixed',inset:0,zIndex:130,background:'rgba(12,11,22,.5)',WebkitBackdropFilter:'blur(4px)',backdropFilter:'blur(4px)',display:'grid',placeItems:'center',padding:'20px'}} onClick={(e)=>{ if(e.target===e.currentTarget) setUnitPop(null); }}>
        <div style={{position:'relative',width:'min(1120px,97vw)',height:'min(90vh,900px)',borderRadius:'20px',overflow:'hidden',boxShadow:'0 40px 100px -30px rgba(8,8,18,.7)',background:'var(--surface,#f7f7fb)'}}>
          <div style={{position:'absolute',inset:0,display:'grid',placeItems:'center',color:'var(--muted,#8b8ba3)',font:'600 13px system-ui',pointerEvents:'none'}}>Opening planner…</div>
          <iframe ref={popHubRef} src={hubSrc+'&bare=1'} title="Unit planner" style={{position:'relative',width:'100%',height:'100%',border:0,background:'transparent'}}
            onLoad={()=>{ try{ const w=popHubRef.current.contentWindow; w.postMessage({type:'cc-scope',scope:mode==='team'?'team':'personal'},'*'); if(pendingUnit.current) w.postMessage({type:'cc-open-unit',name:pendingUnit.current.name,sid:pendingUnit.current.sid},'*'); }catch(e){} }} />
          <button onClick={()=>setUnitPop(null)} title="Close planner" style={{position:'absolute',top:12,right:12,zIndex:3,width:34,height:34,borderRadius:'99px',border:'0',background:'rgba(10,10,20,.55)',color:'#fff',cursor:'pointer',fontSize:16,lineHeight:1}}>×</button>
        </div>
      </div>}
      {window.PHComposer && <window.PHComposer/>}
      {window.PHResMenu && <window.PHResMenu/>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
