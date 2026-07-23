/* Planning Hub — shell: slim top bar + settings popover. (No tabs, no header card —
   the timeline IS the hub.) Exposes window.PHShell = { PHTop, PHSettings }. */
(function(){
const {useState}=React;
const {I,Toggle}=window.PHC;
const DS=window.DS;

function PHTop({scope,setScope,query,setQuery,hits,onCog}){
  return <header className="ph-top">
    <button className="ph-back" title="Back to Home" onClick={()=>{ location.href='V2 Site Design.html'; }}>{I.back}</button>
    <div className="ph-brand"><span className="glyph">{I.logo}</span><b>Planner</b></div>
    <button className="ph-cog" title="Planner settings — dates, background, and what each level is called" onClick={onCog}>{I.cog}</button>
    <div className="ph-search">
      {I.search}
      <input value={query} placeholder="Search lessons, units, resources…" onChange={e=>setQuery(e.target.value)}/>
      {query && <span className="hits">{hits} found</span>}
      {query && <button className="clr" title="Clear search" onClick={()=>setQuery('')}>{I.x}</button>}
    </div>
    <div className="ph-topR">
      <div className="ph-scopesw" title="Personal plan or the team's shared plan — editing Team affects everyone">
        <button className={scope==='personal'?'on':''} title="Your personal plan" onClick={()=>setScope('personal')}>{I.user}</button>
        <button className={'team'+(scope==='team'?' on':'')} title="Team plan — changes affect the whole team" onClick={()=>setScope('team')}>{I.users}</button>
      </div>
    </div>
  </header>;
}

function PHSettings({settings,update,onClose}){
  const [lab,setLab]=useState(()=>DS.labels());
  const rename=(level,plur)=>{
    const sing=plur.replace(/s$/i,'')||plur;
    DS.setLabel(level,sing,plur);
    setLab(DS.labels());
  };
  return <React.Fragment>
    <div className="ph-pop-scrim" onClick={onClose}></div>
    <div className="ph-pop" role="dialog" aria-label="Planner settings">
      <h3>Planner settings</h3>
      <p className="cap">These change how the planner looks and speaks — never what it can do.</p>
      <div className="ph-set">
        <div className="lbl">Planning style</div>
        <div className="ph-setrow">
          <div><div className="t">Plan with dates</div><div className="d">Off = pure sequence (Lesson 1, 2, 3…) for teachers who don't schedule to the day. Order and ripple still work.</div></div>
          <Toggle on={settings.dated} onChange={v=>update('dated',v)} title="Plan with calendar dates on or off"/>
        </div>
      </div>
      <div className="ph-set">
        <div className="lbl">Unit framework — planner default</div>
        <div className="ph-setrow">
          <div><div className="t">How units are designed</div><div className="d">Subjects and single units can override this from any unit's Design tab. Switching never deletes anything.</div></div>
        </div>
        <select className="ph-fwsel" value={settings.framework||'custom'} onChange={e=>update('framework',e.target.value)}>
          {window.FW.ORDER.map(id=>{ const x=window.FW.get(id);
            return <option key={id} value={id}>{x.name}{x.built?'':' · spine only'}</option>; })}
        </select>
      </div>
      <div className="ph-set">
        <div className="lbl">Background</div>
        <div className="ph-bgseg">
          {[['white','Clean'],['ambient','Warm'],['photo','Photo']].map(([k,lab2])=>(
            <button key={k} className={settings.bg===k?'on':''} onClick={()=>update('bg',k)}>{lab2}</button>
          ))}
        </div>
      </div>
      <div className="ph-set">
        <div className="lbl">Detail level</div>
        <div className="ph-setrow">
          <div><div className="t">How much each editor shows</div><div className="d">Simple keeps the essentials in view; Advanced reveals every field — flow, standards, differentiation, custom fields. Switch anytime; nothing is deleted.</div></div>
        </div>
        <div className="ph-bgseg">
          {[['simple','Simple'],['advanced','Advanced']].map(([k,lab2])=>(
            <button key={k} className={(settings.uiLevel||'simple')===k?'on':''} onClick={()=>update('uiLevel',k)}>{lab2}</button>
          ))}
        </div>
      </div>
      <div className="ph-set">
        <div className="lbl">What each level is called</div>
        <div className="ph-renames">
          <label className="ph-rename"><span>Lessons are…</span><input defaultValue={lab.lesson[1]} onBlur={e=>rename('lesson',e.target.value||'Lessons')}/></label>
          <label className="ph-rename"><span>Units are…</span><input defaultValue={lab.unit[1]} onBlur={e=>rename('unit',e.target.value||'Units')}/></label>
          <label className="ph-rename"><span>Courses are…</span><input defaultValue={lab.curriculum[1]} onBlur={e=>rename('curriculum',e.target.value||'Courses')}/></label>
        </div>
        <p className="note">Rename the levels to match how your school talks — Sessions, Modules, Journeys… The tools stay the same, everywhere including Day · Week · Year.</p>
      </div>
    </div>
  </React.Fragment>;
}

window.PHShell={ PHTop, PHSettings };
})();
