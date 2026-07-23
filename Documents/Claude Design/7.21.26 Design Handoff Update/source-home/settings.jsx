/* Appearance controls — the look-of-the-whole-app settings.
   Lives INSIDE the gear "Setup" modal (config.jsx → Appearance section).
   A single visual panel for every appearance axis:
     Frame (Calm Glass · Bright · Color) · Frosted glass (Dark · White, Calm Glass only)
     · Background (Photo · Wash) · Theme (6 + Photo) · Photo brightness.
   Drives the persisted tweak state.  window.AppearanceControls({ t, setTweak }) */
(function(){

/* mini wash previews for the Theme swatches (condensed from themes.css) */
const SWATCH = {
  normal:'linear-gradient(135deg,#FFFFFF,#EFEFF3)',
  night:'radial-gradient(60% 60% at 16% 14%, #6076C8, transparent 64%),radial-gradient(60% 60% at 88% 90%, #3C82BE, transparent 64%),linear-gradient(135deg,#10131D,#161B28)',
  honey:'radial-gradient(62% 62% at 12% 10%, #FACE46, transparent 62%),radial-gradient(60% 60% at 88% 12%, #FF8446, transparent 60%),radial-gradient(60% 60% at 84% 90%, #F4606E, transparent 62%),linear-gradient(135deg,#FFEFC4,#FFEEDA)',
  blossom:'radial-gradient(62% 62% at 12% 10%, #FF96C4, transparent 62%),radial-gradient(60% 60% at 88% 12%, #BEA0FF, transparent 62%),radial-gradient(60% 60% at 84% 90%, #FFA08C, transparent 62%),linear-gradient(135deg,#FCE4EF,#F3E6FB)',
  mint:'radial-gradient(62% 62% at 12% 10%, #96D4FF, transparent 62%),radial-gradient(60% 60% at 88% 10%, #96EAC2, transparent 62%),radial-gradient(60% 60% at 84% 90%, #D8F096, transparent 62%),linear-gradient(135deg,#E6F7F1,#EDF8E6)',
  sky:'radial-gradient(62% 62% at 12% 10%, #60A6FF, transparent 62%),radial-gradient(60% 60% at 88% 8%, #96D2FF, transparent 60%),radial-gradient(60% 60% at 84% 90%, #4678EB, transparent 62%),linear-gradient(135deg,#E2EEFF,#EDF6FF)',
  hero:'radial-gradient(62% 62% at 12% 10%, #FFD9A8, transparent 62%),radial-gradient(60% 60% at 88% 12%, #E3C4FF, transparent 62%),radial-gradient(60% 60% at 84% 90%, #A8EBCF, transparent 62%),linear-gradient(118deg,#FFE7C2,#FDEAD9 30%,#F4E7FF 64%,#DCF5EC)',
};
const THEMES = [
  { k:'normal', label:'Clear' },
  { k:'honey',  label:'Honey'  },
  { k:'blossom',label:'Blossom'},
  { k:'mint',   label:'Mint'   },
  { k:'sky',    label:'Sky'    },
  { k:'hero',   label:'Hero'   },
  { k:'night',  label:'Night'  },
  { k:'off',    label:'Photo'  },
];

function Row({ label, hint, children }){
  return (
    <div className="set-row">
      <div className="set-row-h"><span className="set-lbl">{label}</span>{hint && <span className="set-hint">{hint}</span>}</div>
      {children}
    </div>
  );
}

function Seg({ value, options, onChange }){
  return (
    <div className="set-seg" role="radiogroup">
      {options.map(o=>(
        <button key={o.value} role="radio" aria-checked={value===o.value}
          className={'set-seg-btn'+(value===o.value?' on':'')} onClick={()=>onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

function Toggle({ value, onChange }){
  return (
    <button className={'set-toggle'+(value?' on':'')} role="switch" aria-checked={value} onClick={()=>onChange(!value)}>
      <span className="set-knob"/>
    </button>
  );
}

function ThemePicker({ value, onChange }){
  return (
    <div className="set-themes">
      {THEMES.map(th=>(
        <button key={th.k} className={'set-swatch'+(value===th.k?' on':'')} onClick={()=>onChange(th.k)} title={th.label}>
          <span className="set-sw-chip" style={th.k==='off'
            ? {backgroundImage:"url('photos/p1.png')",backgroundSize:'cover',backgroundPosition:'center'}
            : {backgroundImage:SWATCH[th.k]}}>
            {th.k==='off' && <span className="set-sw-photo">photo</span>}
          </span>
          <span className="set-sw-name">{th.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Frame picker — 3 visual mini-previews of each frame's character ── */
function FramePicker({ value, onChange }){
  const frames=[
    { k:'A', label:'Calm Glass', note:'Frosted · floating' },
    { k:'B', label:'Bright',     note:'White paper · subject color' },
    { k:'C', label:'Pastel',     note:'Soft tints · Common Planner' },
  ];
  return (
    <div className="set-frames">
      {frames.map(f=>(
        <button key={f.k} className={'set-frame'+(value===f.k?' on':'')} onClick={()=>onChange(f.k)} title={f.label}>
          <span className={'set-frame-pv pv-'+f.k}>
            <span className="pv-card a"/><span className="pv-card b"/>
          </span>
          <span className="set-frame-nm">{f.label}</span>
          <span className="set-frame-note">{f.note}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Frosted-glass register — Dark vs White, as two glass swatches ── */
function GlassPicker({ value, onChange }){
  const opts=[ { k:'dark', label:'Dark' }, { k:'light', label:'White' } ];
  return (
    <div className="set-glass">
      {opts.map(o=>(
        <button key={o.k} className={'set-glasssw '+o.k+(value===o.k?' on':'')} onClick={()=>onChange(o.k)} title={o.label+' frosted'}>
          <span className="set-glasssw-pane"><span className="rail"/></span>
          <span className="set-glasssw-nm">{o.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Background — Photo vs Wash, visual ── */
function BgPicker({ value, onChange }){
  return (
    <div className="set-bgs">
      <button className={'set-bg'+(value==='photo'?' on':'')} onClick={()=>onChange('photo')} title="Photo">
        <span className="set-bg-pv" style={{backgroundImage:"url('photos/p1.png')",backgroundSize:'cover',backgroundPosition:'center'}}/>
        <span className="set-bg-nm">Photo</span>
      </button>
      <button className={'set-bg'+(value==='ambient'?' on':'')} onClick={()=>onChange('ambient')} title="Wash">
        <span className="set-bg-pv" style={{backgroundImage:SWATCH.normal}}/>
        <span className="set-bg-nm">Wash</span>
      </button>
    </div>
  );
}

/* ── Photo picker — multi-select built-in + custom, with upload (site-level) ── */
const BUILTIN_PH = ['p1','p2','p3','p4','p5'];
function ljPhotos(){ try{ const v=localStorage.getItem('cc_photos'); return v?JSON.parse(v):[]; }catch(e){ return []; } }
function PhotoPicker({ t, setTweak }){
  const [custom,setCustom]=React.useState(ljPhotos);
  const fileRef=React.useRef(null);
  const sel=(t.photoSel&&t.photoSel.length?t.photoSel:BUILTIN_PH);
  const all=[...BUILTIN_PH.map(id=>({id,url:'photos/'+id+'.png',builtin:true})), ...custom];
  const toggle=(id)=>{ const cur=sel.includes(id)?sel.filter(x=>x!==id):[...sel,id]; setTweak('photoSel',cur.length?cur:[id]); };
  const add=(file)=>{ const rd=new FileReader(); rd.onload=()=>{ const np=[...custom,{id:'c'+Date.now().toString(36),url:rd.result}]; setCustom(np); try{localStorage.setItem('cc_photos',JSON.stringify(np));}catch(e){} }; rd.readAsDataURL(file); };
  const remove=(id)=>{ const np=custom.filter(p=>p.id!==id); setCustom(np); try{localStorage.setItem('cc_photos',JSON.stringify(np));}catch(e){} };
  return (
    <div className="set-photos">
      {all.map(p=>(
        <button key={p.id} className={'set-photo'+(sel.includes(p.id)?' on':'')} style={{backgroundImage:`url('${p.url}')`}} onClick={()=>toggle(p.id)} title={p.builtin?'Built-in photo':'Custom photo'}>
          {sel.includes(p.id) && <span className="set-photo-chk">✓</span>}
          {!p.builtin && <span className="set-photo-x" onClick={e=>{ e.stopPropagation(); remove(p.id); }}>×</span>}
        </button>
      ))}
      <button className="set-photo set-photo-add" onClick={()=>fileRef.current&&fileRef.current.click()} title="Upload a picture">＋
        <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=>{ const f=e.target.files&&e.target.files[0]; if(f) add(f); e.target.value=''; }} />
      </button>
    </div>
  );
}

/* The appearance controls, embedded directly in the Setup modal's Appearance section. */
function AppearanceControls({ t, setTweak }){
  const [adv,setAdv]=React.useState(false);
  const isPhoto = (t.bgMode!=='ambient') && t.theme!=='off' ? (t.bgMode==='photo') : t.bgMode==='photo';
  return (
    <div className="set-appearance">
      <div className="set-group">Frame</div>
      <FramePicker value={t.version} onChange={v=>setTweak('version',v)} />
      {t.version==='A' && (
        <Row label="Frosted glass" hint="surface only — the background is unchanged">
          <GlassPicker value={t.glass||'dark'} onChange={v=>setTweak('glass',v)} />
        </Row>
      )}

      <div className="set-group">Background</div>
      <BgPicker value={t.bgMode==='ambient'?'ambient':'photo'} onChange={v=>setTweak('bgMode',v)} />
      {t.bgMode!=='ambient' && t.theme!=='off' && <PhotoPicker t={t} setTweak={setTweak} />}
      {t.bgMode!=='ambient' && (
        <Row label="Photo light" hint="dark · normal · light">
          <Seg value={t.bgDim||'normal'} onChange={v=>setTweak('bgDim',v)}
            options={[{value:'dim',label:'Dark'},{value:'normal',label:'Normal'},{value:'bright',label:'Light'}]} />
        </Row>
      )}
      {t.bgMode!=='ambient' && (
        <Row label="Motion" hint="rotate · zoom · still">
          <Seg value={t.photoMotion} onChange={v=>setTweak('photoMotion',v)}
            options={[{value:'fade-zoom',label:'Drift'},{value:'fade',label:'Fade'},{value:'static',label:'Still'}]} />
        </Row>
      )}

      <div className="set-group">Theme</div>
      {t.version==='C'
        ? <div className="set-lockednote">Pastel locks its own palette — cool gray canvas, teal accents. Switch to Calm Glass or Bright to use themes.</div>
        : <ThemePicker value={t.theme} onChange={v=>setTweak('theme',v)} />}

      <button className={'set-adv-toggle'+(adv?' open':'')} onClick={()=>setAdv(a=>!a)}>
        <span>More</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      {adv &&
        <div className="set-adv">
          <Row label="Caption words" hint="labels under Day · Week · Year">
            <Toggle value={t.showCaptions} onChange={v=>setTweak('showCaptions',v)} />
          </Row>
          <Row label="Mesh" hint="edge accents">
            <Seg value={t.mesh} onChange={v=>setTweak('mesh',v)}
              options={[{value:'wash',label:'Wash'},{value:'glow',label:'Glow'},{value:'off',label:'Off'}]} />
          </Row>
          <Row label="Edges">
            <Seg value={t.frame} onChange={v=>setTweak('frame',v)}
              options={[{value:'float',label:'Floating'},{value:'fullbleed',label:'Full-bleed'}]} />
          </Row>
          <Row label="Save prompt" hint="ask team / personal after editing a lesson">
            <Toggle value={t.savePrompt!==false} onChange={v=>{ setTweak('savePrompt',v); try{localStorage.setItem('cc_savePrompt', v?'on':'off');}catch(e){} }} />
          </Row>
        </div>}
    </div>
  );
}

window.AppearanceControls = AppearanceControls;
window.SettingsUI = { Row, Seg, Toggle, ThemePicker, FramePicker, GlassPicker, BgPicker, PhotoPicker };
})();
