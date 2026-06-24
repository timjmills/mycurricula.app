/* Settings / configuration page — large centered modal with left nav.
   Fully interactive mock; persists to localStorage under cc_cfg.
   window.ConfigPage({ onClose, t, setTweak }) */
(function(){
const { useState, useEffect } = React;
const cv=(x)=>`var(${x})`;
const DS=window.DS;

const LOAD=()=>{ try{ return JSON.parse(localStorage.getItem('cc_cfg')||'{}'); }catch(e){ return {}; } };
const SAVE=(c)=>{ try{ localStorage.setItem('cc_cfg',JSON.stringify(c)); }catch(e){} };

const DEFAULT={
  profile:{ name:'Tim Mills', email:'tim@awsaj.edu', role:'team' },
  team:{ name:'Grade 5 Team', school:'Awsaj Academy', members:['Tim Mills','Sara K.','Omar R.','Lena P.'] },
  workspaces:{ active:'Grade 5 Team', personal:['My Drafts'], teams:['Grade 5 Team'] },
  curriculums:{ active:'Grade 5 · 2025–26', list:['Grade 5 · 2025–26','Grade 5 · 2024–25 (archive)'] },
  week:{ days:['sun','mon','tue','wed','thu'] },
  periods:[ {label:'Period 1',start:'08:00',end:'08:45'},{label:'Period 2',start:'08:50',end:'09:35'},{label:'Period 3',start:'09:40',end:'10:25'},{label:'Period 4',start:'10:45',end:'11:30'},{label:'Period 5',start:'11:35',end:'12:20'},{label:'Period 6',start:'13:10',end:'13:55'} ],
  nonacademic:[ {label:'Morning Arrival',start:'07:40',end:'08:00'},{label:'Recess',start:'10:25',end:'10:45'},{label:'Lunch',start:'12:20',end:'13:10'} ],
  rotation:{ on:false, cycle:2 },
  perDayOverride:{},
  standards:{}, // per subject
  year:{ termStart:'2025-08-18', termEnd:'2026-06-12', holidays:[{name:'Winter Break',date:'2025-12-15'},{name:'Spring Break',date:'2026-03-23'}] },
};

const NAV=[
  ['profile','Profile & role'],
  ['team','Team / school'],
  ['workspaces','Workspaces'],
  ['curriculums','Curriculums'],
  ['subjects','Subjects'],
  ['week','School week'],
  ['daily','Daily times'],
  ['nonacademic','Non-academic times'],
  ['rotation','Rotation cycles'],
  ['year','Yearly schedule'],
  ['standards','Standards'],
  ['appearance','Appearance'],
];
const WD=[['sun','Sun'],['mon','Mon'],['tue','Tue'],['wed','Wed'],['thu','Thu'],['fri','Fri'],['sat','Sat']];
const FRAMEWORKS=['CCSS','NGSS','State standards','IB','Custom'];

function Field({ label, children, hint }){ return <label className="cfg-field"><span className="cfg-flabel">{label}</span>{children}{hint&&<span className="cfg-fhint">{hint}</span>}</label>; }

function ConfigPage({ onClose, t, setTweak }){
  const [cfg,setCfg]=useState(()=>({ ...DEFAULT, ...LOAD() }));
  const [sec,setSec]=useState('profile');
  useEffect(()=>{ SAVE(cfg); },[cfg]);
  useEffect(()=>{ const k=(e)=>{ if(e.key==='Escape')onClose(); }; document.addEventListener('keydown',k); return ()=>document.removeEventListener('keydown',k); },[]);
  const up=(path,val)=>setCfg(c=>{ const n=JSON.parse(JSON.stringify(c)); let o=n; const ks=path.split('.'); for(let i=0;i<ks.length-1;i++)o=o[ks[i]]; o[ks[ks.length-1]]=val; return n; });

  return (
    <div className="cfg-scrim" onClick={onClose}>
      <div className="cfg-modal" onClick={e=>e.stopPropagation()}>
        <aside className="cfg-nav">
          <div className="cfg-navhead"><div className="cfg-navtitle">Setup</div><div className="cfg-navsub">{cfg.team.school}</div></div>
          <div className="cfg-navlist">
            {NAV.map(([k,l])=>(<button key={k} className={'cfg-navitem'+(sec===k?' on':'')} onClick={()=>setSec(k)}>{l}</button>))}
          </div>
          <button className="cfg-close2" onClick={onClose}>Done</button>
        </aside>
        <main className="cfg-main">
          <button className="cfg-x" onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>

          {sec==='profile' && <Sec title="Profile & role" desc="Your name and whether you teach solo or on a team.">
            <Field label="Your name"><input value={cfg.profile.name} onChange={e=>up('profile.name',e.target.value)}/></Field>
            <Field label="Email"><input value={cfg.profile.email} onChange={e=>up('profile.email',e.target.value)}/></Field>
            <Field label="Role">
              <div className="cfg-seg">
                {[['team','On a team'],['solo','Solo teacher']].map(([v,l])=><button key={v} className={cfg.profile.role===v?'on':''} onClick={()=>up('profile.role',v)}>{l}</button>)}
              </div>
            </Field>
            <div className="cfg-note">{cfg.profile.role==='solo'?'Solo: your personal plans are your curriculum — no team-share gate.':'On a team: editing the shared Team Curriculum affects everyone (pink-glow gate).'}</div>
          </Sec>}

          {sec==='team' && <Sec title="Team / school" desc="Your school, team name, and members.">
            <Field label="School"><input value={cfg.team.school} onChange={e=>up('team.school',e.target.value)}/></Field>
            <Field label="Team name"><input value={cfg.team.name} onChange={e=>up('team.name',e.target.value)}/></Field>
            <div className="cfg-flabel">Members</div>
            <div className="cfg-chiplist">
              {cfg.team.members.map((m,i)=>(<span key={i} className="cfg-member">{m}<button onClick={()=>up('team.members',cfg.team.members.filter((_,j)=>j!==i))}>×</button></span>))}
              <button className="cfg-addchip" onClick={()=>{ const n=prompt('Member name'); if(n)up('team.members',[...cfg.team.members,n]); }}>+ Add member</button>
            </div>
          </Sec>}

          {sec==='workspaces' && <Sec title="Workspaces" desc="Personal workspaces and the teams you belong to.">
            <div className="cfg-flabel">Active workspace</div>
            <div className="cfg-cards">
              {[...cfg.workspaces.teams.map(t=>['team',t]),...cfg.workspaces.personal.map(p=>['personal',p])].map(([type,name])=>(
                <button key={name} className={'cfg-wcard'+(cfg.workspaces.active===name?' on':'')} onClick={()=>up('workspaces.active',name)}>
                  <span className={'cfg-wtag '+type}>{type==='team'?'Team':'Personal'}</span><span className="cfg-wname">{name}</span>
                </button>
              ))}
            </div>
            <div className="cfg-row2">
              <button className="cfg-btn" onClick={()=>{ const n=prompt('New personal workspace'); if(n)up('workspaces.personal',[...cfg.workspaces.personal,n]); }}>+ Personal workspace</button>
              <button className="cfg-btn" onClick={()=>{ const n=prompt('Join / create team'); if(n)up('workspaces.teams',[...cfg.workspaces.teams,n]); }}>+ Team</button>
            </div>
          </Sec>}

          {sec==='curriculums' && <Sec title="Curriculums" desc="Create or select the active curriculum.">
            <div className="cfg-list">
              {cfg.curriculums.list.map((c,i)=>(<button key={i} className={'cfg-listrow'+(cfg.curriculums.active===c?' on':'')} onClick={()=>up('curriculums.active',c)}><span className="cfg-radio"/>{c}</button>))}
            </div>
            <button className="cfg-btn" onClick={()=>{ const n=prompt('New curriculum name'); if(n){ up('curriculums.list',[...cfg.curriculums.list,n]); } }}>+ New curriculum</button>
          </Sec>}

          {sec==='subjects' && <Sec title="Subjects" desc="The locked team subjects, their colors, order, and labels.">
            <div className="cfg-subjlist">
              {DS.SUBJECT_ORDER.map((sid,i)=>{ const s=DS.SUBJECTS[sid]; return (
                <div key={sid} className="cfg-subjrow">
                  <span className="cfg-subjswatch" style={{background:cv(s.c)}}/>
                  <input className="cfg-subjname" defaultValue={s.full}/>
                  <span className="cfg-subjmeta">{s.label}</span>
                  <span className="cfg-subjmove">↕</span>
                </div>
              ); })}
            </div>
            <button className="cfg-btn" onClick={()=>alert('Add subject — wired in a later pass')}>+ Add subject</button>
            <div className="cfg-note">Subject→color mapping is locked team-wide; names/order are editable here.</div>
          </Sec>}

          {sec==='week' && <Sec title="School week" desc="Which weekdays your school runs.">
            <div className="cfg-weekdays">
              {WD.map(([k,l])=>(<button key={k} className={'cfg-day'+(cfg.week.days.includes(k)?' on':'')} onClick={()=>up('week.days',cfg.week.days.includes(k)?cfg.week.days.filter(d=>d!==k):[...cfg.week.days,k])}>{l}</button>))}
            </div>
            <div className="cfg-row2">
              <button className="cfg-btn" onClick={()=>up('week.days',['sun','mon','tue','wed','thu'])}>Sun–Thu</button>
              <button className="cfg-btn" onClick={()=>up('week.days',['mon','tue','wed','thu','fri'])}>Mon–Fri</button>
            </div>
          </Sec>}

          {sec==='daily' && <Sec title="Daily times" desc="A default daily template; override per weekday if needed.">
            <div className="cfg-flabel">Default period template</div>
            <div className="cfg-periods">
              {cfg.periods.map((p,i)=>(
                <div key={i} className="cfg-period">
                  <input className="cfg-plabel" value={p.label} onChange={e=>{ const n=[...cfg.periods]; n[i]={...p,label:e.target.value}; up('periods',n); }}/>
                  <input type="time" value={p.start} onChange={e=>{ const n=[...cfg.periods]; n[i]={...p,start:e.target.value}; up('periods',n); }}/>
                  <span>–</span>
                  <input type="time" value={p.end} onChange={e=>{ const n=[...cfg.periods]; n[i]={...p,end:e.target.value}; up('periods',n); }}/>
                  <button className="cfg-del" onClick={()=>up('periods',cfg.periods.filter((_,j)=>j!==i))}>×</button>
                </div>
              ))}
            </div>
            <button className="cfg-btn" onClick={()=>up('periods',[...cfg.periods,{label:'Period '+(cfg.periods.length+1),start:'14:00',end:'14:45'}])}>+ Add period</button>
            <div className="cfg-note">Time blocks are generic — subjects get placed onto them in the schedule. Per-weekday overrides apply on top of this template.</div>
          </Sec>}

          {sec==='nonacademic' && <Sec title="Non-academic times" desc="Arrival, recess, lunch, specials — protected from lesson scheduling.">
            <div className="cfg-periods">
              {cfg.nonacademic.map((p,i)=>(
                <div key={i} className="cfg-period">
                  <input className="cfg-plabel" value={p.label} onChange={e=>{ const n=[...cfg.nonacademic]; n[i]={...p,label:e.target.value}; up('nonacademic',n); }}/>
                  <input type="time" value={p.start} onChange={e=>{ const n=[...cfg.nonacademic]; n[i]={...p,start:e.target.value}; up('nonacademic',n); }}/>
                  <span>–</span>
                  <input type="time" value={p.end} onChange={e=>{ const n=[...cfg.nonacademic]; n[i]={...p,end:e.target.value}; up('nonacademic',n); }}/>
                  <button className="cfg-del" onClick={()=>up('nonacademic',cfg.nonacademic.filter((_,j)=>j!==i))}>×</button>
                </div>
              ))}
            </div>
            <button className="cfg-btn" onClick={()=>up('nonacademic',[...cfg.nonacademic,{label:'New block',start:'10:00',end:'10:15'}])}>+ Add block</button>
          </Sec>}

          {sec==='rotation' && <Sec title="Rotation cycles" desc="Optional A/B (or longer) day cycles independent of the week.">
            <Field label="Rotating schedule">
              <button className={'cfg-toggle'+(cfg.rotation.on?' on':'')} onClick={()=>up('rotation.on',!cfg.rotation.on)}><span/></button>
            </Field>
            {cfg.rotation.on && <Field label="Cycle length (days)" hint="e.g. 2 = A/B, 6 = six-day rotation">
              <input type="number" min="2" max="10" value={cfg.rotation.cycle} onChange={e=>up('rotation.cycle',+e.target.value)}/>
            </Field>}
            {cfg.rotation.on && <div className="cfg-cyclechips">{Array.from({length:cfg.rotation.cycle}).map((_,i)=><span key={i} className="cfg-cyclechip">Day {String.fromCharCode(65+i)}</span>)}</div>}
          </Sec>}

          {sec==='year' && <Sec title="Yearly schedule" desc="Terms, holidays, and no-school days.">
            <div className="cfg-row2">
              <Field label="Term start"><input type="date" value={cfg.year.termStart} onChange={e=>up('year.termStart',e.target.value)}/></Field>
              <Field label="Term end"><input type="date" value={cfg.year.termEnd} onChange={e=>up('year.termEnd',e.target.value)}/></Field>
            </div>
            <div className="cfg-flabel">Holidays / no-school days</div>
            <div className="cfg-list">
              {cfg.year.holidays.map((h,i)=>(<div key={i} className="cfg-holiday"><input value={h.name} onChange={e=>{ const n=[...cfg.year.holidays]; n[i]={...h,name:e.target.value}; up('year.holidays',n); }}/><input type="date" value={h.date} onChange={e=>{ const n=[...cfg.year.holidays]; n[i]={...h,date:e.target.value}; up('year.holidays',n); }}/><button className="cfg-del" onClick={()=>up('year.holidays',cfg.year.holidays.filter((_,j)=>j!==i))}>×</button></div>))}
            </div>
            <button className="cfg-btn" onClick={()=>up('year.holidays',[...cfg.year.holidays,{name:'New holiday',date:'2026-01-01'}])}>+ Add holiday</button>
          </Sec>}

          {sec==='standards' && <Sec title="Standards" desc="Choose a standards framework per subject.">
            <div className="cfg-stdlist">
              {DS.SUBJECT_ORDER.map(sid=>{ const s=DS.SUBJECTS[sid]; return (
                <div key={sid} className="cfg-stdrow">
                  <span className="cfg-subjswatch sm" style={{background:cv(s.c)}}/>
                  <span className="cfg-stdsubj">{s.full}</span>
                  <select value={cfg.standards[sid]||'CCSS'} onChange={e=>up('standards.'+sid,e.target.value)}>
                    {FRAMEWORKS.map(f=><option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
              ); })}
            </div>
          </Sec>}
          {sec==='appearance' && <Sec title="Appearance" desc="Theme, background, and the look of the whole app — applies everywhere.">
            {window.AppearanceControls && <window.AppearanceControls t={t} setTweak={setTweak} />}
          </Sec>}
        </main>
      </div>
    </div>
  );
}

function Sec({ title, desc, children }){
  return (
    <div className="cfg-sec">
      <div className="cfg-sechead"><h2>{title}</h2><p>{desc}</p></div>
      <div className="cfg-secbody">{children}</div>
    </div>
  );
}

window.ConfigPage = ConfigPage;
})();
