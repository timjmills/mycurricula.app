/* Wall Library — popup to browse / present / manage Resource Walls.
   Tabs: Presets · My Walls. Personal/Team filter, search, sort, 16:10 cards.
   window.WallLibrary({ state, customWalls, setCustomWalls, onOpenPreset, onOpenCustom, onClose }) */
(function(){
const { useState, useEffect, useMemo, useRef } = React;
const DS = window.DS;
const cv = (x)=>`var(${x})`;

/* preset cards map to the ResourceWall preset strings (the `raw` value) */
const PRESET_DEFS = [
  { raw:'Current Lesson',            name:'Current Lesson', sub:'' },
  { raw:"Today's Lessons (Mixed)",   name:"Today's Lessons", sub:'Mixed', mixed:true },
  { raw:'This Week · Mixed',         name:'This Week', sub:'Mixed', mixed:true },
  { raw:'This Week · Subject',       name:'This Week', sub:'By subject', mixed:true },
  { raw:'Subject View',              name:'By Subject', sub:'', mixed:true },
  { raw:'Unit View',                 name:'By Unit', sub:'', mixed:true },
];
const GRADIENTS = [['--grad-dawn','Dawn'],['--grad-honey','Honey'],['--grad-mint','Mint'],['--grad-brand','Sky'],['--grad-blossom','Blossom']];
const SOLIDS = ['--subj-1','--subj-10','--subj-13','--subj-7','--subj-5','--subj-12'];

const LU_KEY='cc_wall_lastused', PIN_KEY='cc_wall_pins', PB_KEY='cc_wall_presetbg';
const load=(k,f)=>{ try{ return JSON.parse(localStorage.getItem(k))??f; }catch(e){ return f; } };
const save=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };

/* a wall's representative subject color (first section) — null if mixed/none */
function wallSubject(w){
  const sid = w && w.layout && w.layout[0] && w.layout[0].subjectId;
  return sid && DS.SUBJECTS[sid] ? sid : null;
}
function bgStyleFor(bg, sid){
  if(bg){
    if(bg.type==='color')   return { background:bg.value };
    if(bg.type==='gradient')return { background:cv(bg.value) };
    if(bg.type==='photo')   return { backgroundImage:`url('${bg.value}')`, backgroundSize:'cover', backgroundPosition:'center' };
    if(bg.type==='wash')    return { background:cv('--grad-dawn') };
  }
  if(sid){ const c=cv(DS.SUBJECTS[sid].c); return { background:`linear-gradient(135deg, color-mix(in oklab, ${c} 34%, white), color-mix(in oklab, ${c} 12%, white))` }; }
  return { background:cv('--grad-dawn') };
}

const I = {
  x:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>,
  search:<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>,
  dots:<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>,
  pin:<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 6.9 7.1.3-5.6 4.4 2 6.8L12 16.9 6.1 20.4l2-6.8L2.5 9.2l7.1-.3z"/></svg>,
};

function WallLibrary({ state, initialTab, customWalls, setCustomWalls, onOpenPreset, onOpenCustom, onClose }){
  const [tab,setTab]=useState(initialTab==='my'?'my':'presets');     // presets | my
  const [scopeF,setScopeF]=useState('all');   // all | personal | team
  const [q,setQ]=useState('');
  const [sort,setSort]=useState('recent');
  const [menu,setMenu]=useState(null);        // wall id with open ⋯ menu
  const [bgFor,setBgFor]=useState(null);      // wall id with open bg picker
  const [lu,setLu]=useState(()=>load(LU_KEY,{}));
  const [pins,setPins]=useState(()=>load(PIN_KEY,[]));
  const [presetBg,setPresetBg]=useState(()=>load(PB_KEY,{}));
  const fileRef=useRef(null);

  useEffect(()=>{ const k=(e)=>{ if(e.key==='Escape'){ if(menu)setMenu(null); else if(bgFor)setBgFor(null); else onClose(); } }; document.addEventListener('keydown',k); return ()=>document.removeEventListener('keydown',k); },[menu,bgFor,onClose]);
  useEffect(()=>{ if(!menu && !bgFor) return; const d=(e)=>{ if(!(e.target.closest && e.target.closest('.wl-menuwrap'))){ setMenu(null); setBgFor(null); } }; document.addEventListener('mousedown',d); return ()=>document.removeEventListener('mousedown',d); },[menu,bgFor]);

  const persist=(next)=>{ setCustomWalls(next); save('cc_customwalls',next); };
  const touch=(id)=>{ const m={...lu,[id]:Date.now()}; setLu(m); save(LU_KEY,m); };
  const togglePin=(id)=>{ const n=pins.includes(id)?pins.filter(x=>x!==id):[...pins,id]; setPins(n); save(PIN_KEY,n); };

  const openPreset=(p)=>{ touch(p.raw); onOpenPreset(p.raw); };
  const openCustom=(w)=>{ touch(w.id); onOpenCustom(w); };
  const rename=(w)=>{ const n=prompt('Rename wall', w.name); if(n==null) return; persist(customWalls.map(x=>x.id===w.id?{...x,name:n||x.name}:x)); setMenu(null); };
  const duplicate=(w)=>{ const c={...w, id:'cw'+Date.now(), name:'Copy of '+w.name, created:Date.now()}; persist([c,...customWalls]); setMenu(null); };
  const del=(w)=>{ if(!confirm('Delete "'+w.name+'"?')) return; persist(customWalls.filter(x=>x.id!==w.id)); setMenu(null); };
  const setBg=(w,bg,preset)=>{ if(preset){ const m={...presetBg,[w.raw]:bg}; setPresetBg(m); save(PB_KEY,m); } else { persist(customWalls.map(x=>x.id===w.id?{...x,bg}:x)); } setBgFor(null); };
  const resetBg=(w)=>{ const m={...presetBg}; delete m[w.raw]; setPresetBg(m); save(PB_KEY,m); setMenu(null); };

  const sortFn = (a,b)=>{
    const pa=pins.includes(a.id||a.raw), pb=pins.includes(b.id||b.raw);
    if(pa!==pb) return pa?-1:1;
    if(sort==='alpha') return (a.name||'').localeCompare(b.name||'');
    if(sort==='subject') return String(wallSubject(a)||a.sub||'').localeCompare(String(wallSubject(b)||b.sub||''));
    if(sort==='unit') return String((a.anchor||'')+'').localeCompare(String((b.anchor||'')+''));
    if(sort==='created') return (b.created||0)-(a.created||0);
    // recent (last used) — default
    return (lu[b.id||b.raw]||b.created||0) - (lu[a.id||a.raw]||a.created||0);
  };

  const presetCards = useMemo(()=>{
    let arr=[...PRESET_DEFS];
    if(q.trim()){ const s=q.toLowerCase(); arr=arr.filter(p=>(p.name+' '+p.sub).toLowerCase().includes(s)); }
    if(sort==='manual') return arr;
    return arr.slice().sort(sortFn);
  },[q,sort,lu,pins]);

  const myCards = useMemo(()=>{
    let arr=[...(customWalls||[])];
    if(scopeF!=='all') arr=arr.filter(w=> scopeF==='team' ? !!w.team : !w.team );
    if(q.trim()){ const s=q.toLowerCase(); arr=arr.filter(w=>(w.name||'').toLowerCase().includes(s)); }
    if(sort==='manual') return arr;
    return arr.sort(sortFn);
  },[customWalls,scopeF,q,sort,lu,pins]);

  const Card = ({ w, preset })=>{
    const sid = preset ? null : wallSubject(w);
    const cid = preset ? w.raw : w.id;
    const pinned = pins.includes(cid);
    const name = preset ? w.name : w.name;
    const sub  = preset ? w.sub : ((w.secCount||(w.layout?w.layout.length:0))+' section'+(((w.secCount||1)!==1)?'s':''));
    return (
      <div className="wl-card">
        <button className="wl-thumb" style={bgStyleFor(preset?presetBg[w.raw]:w.bg, sid)} onClick={()=>preset?openPreset(w):openCustom(w)}>
          <span className="wl-name">{name}{sub?<span className="wl-sub">{sub}</span>:null}</span>
          {pinned && <span className="wl-pinflag" title="Pinned">{I.pin}</span>}
          {w.team && <span className="wl-teamflag">Team</span>}
        </button>
        <div className="wl-cardbar">
          <button className="wl-open" onClick={()=>preset?openPreset(w):openCustom(w)}>Present</button>
          <button className="wl-ic" title={pinned?'Unpin':'Pin'} onClick={()=>togglePin(cid)} style={pinned?{color:'var(--honey-500)'}:undefined}>{I.pin}</button>
          <div className="wl-menuwrap">
            <button className="wl-ic" title="More" onClick={()=>setMenu(menu===cid?null:cid)}>{I.dots}</button>
            {menu===cid && <div className="wl-menu">
              {!preset && <button onClick={()=>rename(w)}>Rename</button>}
              <button onClick={()=>{ setMenu(null); setBgFor(cid); }}>Set background</button>
              {preset && presetBg[w.raw] && <button onClick={()=>resetBg(w)}>Reset background</button>}
              {!preset && <button onClick={()=>duplicate(w)}>Duplicate</button>}
              {!preset && window.Share && <button onClick={()=>{ setMenu(null); window.dispatchEvent(new CustomEvent('cc-share',{detail:{kind:'wall',id:w.id,label:w.name}})); }}>Share</button>}
              {!preset && <button className="del" onClick={()=>del(w)}>Delete</button>}
            </div>}
            {bgFor===cid && <div className="wl-bgpop">
              <div className="wl-bglbl">Wash</div>
              <button className="wl-bgrow" onClick={()=>setBg(w,{type:'wash'},preset)}>Theme wash</button>
              <div className="wl-bglbl">Gradient</div>
              <div className="wl-bgswatches">{GRADIENTS.map(([t,n])=><button key={t} title={n} style={{background:cv(t)}} onClick={()=>setBg(w,{type:'gradient',value:t},preset)}/>)}</div>
              <div className="wl-bglbl">Solid</div>
              <div className="wl-bgswatches">{SOLIDS.map(t=><button key={t} title={t} style={{background:cv(t)}} onClick={()=>setBg(w,{type:'color',value:cv(t)},preset)}/>)}</div>
              <label className="wl-bgupload">Upload image
                <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>{ const f=e.target.files&&e.target.files[0]; if(f) setBg(w,{type:'photo',value:URL.createObjectURL(f)},preset); }}/>
              </label>
            </div>}
          </div>
        </div>
      </div>
    );
  };

  const SORTS=[['recent','Last used'],['alpha','A–Z'],['subject','Subject'],['unit','Unit'],['created','Date created'],['manual','Manual']];

  return (
    <div className="wl-scrim" onClick={onClose}>
      <div className="wl-modal" onClick={e=>e.stopPropagation()}>
        <div className="wl-head">
          <div className="wl-tabs">
            <button className={tab==='presets'?'on':''} onClick={()=>setTab('presets')}>Presets</button>
            <button className={tab==='my'?'on':''} onClick={()=>setTab('my')}>My Walls</button>
          </div>
          <button className="wl-x" onClick={onClose}>{I.x}</button>
        </div>
        <div className="wl-controls">
          <div className="wl-search">{I.search}<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search walls…"/></div>
          {tab==='my' && <div className="wl-scope">
            {[['all','All'],['personal','Personal'],['team','Team']].map(([k,l])=><button key={k} className={scopeF===k?'on':''} onClick={()=>setScopeF(k)}>{l}</button>)}
          </div>}
          <label className="wl-sortwrap">Sort
            <select className="wl-sort" value={sort} onChange={e=>setSort(e.target.value)}>{SORTS.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
          </label>
        </div>
        <div className="wl-grid">
          {tab==='presets'
            ? presetCards.map(p=><Card key={p.raw} w={p} preset/>)
            : (myCards.length ? myCards.map(w=><Card key={w.id} w={w}/>) : <div className="wl-empty">No saved walls yet — build one on the wall and Save it.</div>)}
        </div>
      </div>
    </div>
  );
}
window.WallLibrary = WallLibrary;
})();
