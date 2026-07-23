/* Planning Hub — Design tab: framework-driven unit designer.
   Framework picker (scope: unit / subject / planner) + convert flow (no data loss),
   spine (big idea + KUD), framework field groups, UDL overlay, reflection log,
   custom fields, carried-over drawer. Exposes window.PHDesign. */
(function(){
const {useState}=React;
const {cv}=window.PWC;
const {I}=window.PHC;
const PW=window.PW, DS=window.DS, FW=window.FW;
const W=window.PHW;

/* convert confirmation — the "no information is thrown away" gate */
function ConvertModal({fw,scope,scopeLabel,nLessons,onGo,onClose}){
  return <React.Fragment>
    <div className="ph-pop-scrim" onClick={onClose}></div>
    <div className="ph-misspanel ph-convpop" role="dialog" aria-label="Switch framework" data-screen-label="Hub — Switch framework">
      <div className="ph-panel-h"><h3>Switch {scopeLabel} to {fw.name}?</h3>
        <button className="ph-panel-x" title="Close" onClick={onClose}>{I.x}</button></div>
      <p className="cap">{fw.blurb}</p>
      <p className="cap"><b>Nothing is thrown away.</b> Fields that map across move automatically; anything the new format
        doesn't use lands in a <b>Carried over</b> drawer on the unit and lesson — visible until you deal with it.</p>
      <div className="conv-acts">
        <button className="pri" title="Existing lessons get the new format; unmapped fields go to Carried over"
          onClick={()=>onGo(true)}>Convert {nLessons} existing {DS.label('lesson',nLessons!==1).toLowerCase()}</button>
        <button className="sec" title="Old lessons keep the format they were written in; only new lessons use the new format"
          onClick={()=>onGo(false)}>Keep old {DS.label('lesson',true).toLowerCase()} as they are</button>
        <button className="ghost" onClick={onClose}>Cancel</button>
      </div>
      <p className="note">New {DS.label('lesson',true).toLowerCase()} always use the new format either way.</p>
    </div>
  </React.Fragment>;
}

function Design({state,u,dated,settings,actions}){
  const s=DS.SUBJECTS[u.sid];
  const fwId=FW.effective(u,settings);
  const fw=FW.get(fwId);
  const source=u.framework?'set on this unit':(settings.subjectFw&&settings.subjectFw[u.sid])?('inherited from '+s.full):'inherited from the planner default';
  const [pick,setPick]=useState(null);          // {fwId, scope}
  const [scope,setScope]=useState('unit');
  const hidden=u.hiddenGroups||[];
  const ed=(patch)=>actions.editUnit(u.id,patch);
  const edFw=(k,v)=>actions.editFw(u.id,{[k]:v});
  const groups=[...(fw.groups||[])];
  const toggleGroup=(g)=>ed({hiddenGroups:hidden.includes(g)?hidden.filter(x=>x!==g):[...hidden,g]});
  const nLessons=scope==='unit'?u.lessons.length
    :scope==='subject'?state.units.filter(x=>x.sid===u.sid).reduce((a,x)=>a+x.lessons.length,0)
    :state.units.reduce((a,x)=>a+x.lessons.length,0);

  const plannerCF=settings.customFields||[];
  const subjCF=(settings.subjectCF||{})[u.sid]||[];
  const unitCF=u.customFields||[];

  return <div className="ph-design" data-screen-label="Hub — Unit design">

    {/* framework card */}
    <div className="dsg-card dsg-fw">
      <div className="dsg-h">Framework <span className="src" title="Frameworks can be set for the whole planner, one subject, or one unit">{source}</span></div>
      <div className="dsg-fwrow">
        <select value={fwId} title="Pick the pedagogical model this unit is designed in"
          onChange={e=>{ const v=e.target.value; if(v!==fwId) setPick({fwId:v}); }}>
          {FW.ORDER.map(id=>{ const x=FW.get(id);
            return <option key={id} value={id}>{x.name}{x.built?'':' · spine only'}</option>; })}
        </select>
        <div className="ph-seg sm" title="How widely the switch applies">
          {[['unit','This unit'],['subject',s.label],['planner','Whole planner']].map(([k,lab])=>(
            <button key={k} className={scope===k?'on':''} onClick={()=>setScope(k)}>{lab}</button>
          ))}
        </div>
      </div>
      <p className="dsg-blurb">{fw.blurb}</p>
      {groups.length>0 && <div className="dsg-groups" title="Show or hide field groups — show only what your team uses">
        <span className="gl">Field groups</span>
        {groups.map(g=><button key={g} className={hidden.includes(g)?'':'on'} onClick={()=>toggleGroup(g)}>{g}</button>)}
        <button className={u.udlOn?'on':''} onClick={()=>ed({udlOn:!u.udlOn})}>UDL overlay</button>
      </div>}
      {groups.length===0 && <div className="dsg-groups"><span className="gl">Overlays</span>
        <button className={u.udlOn?'on':''} onClick={()=>ed({udlOn:!u.udlOn})}>UDL overlay</button>
      </div>}
    </div>

    {/* spine: big idea + KUD */}
    <div className="dsg-card">
      <div className="dsg-h">{fw.bigIdea}</div>
      <W.Lbl label="" help={fw.bigIdeaHelp||'The one idea that gives this unit coherence.'}/>
      <textarea className="dsg-big" rows="2" value={u.eq||''} placeholder={fw.bigIdea+'…'}
        onChange={e=>ed({eq:e.target.value})}></textarea>
    </div>
    <div className="dsg-card">
      <div className="dsg-h">Learning goals <span className="src">Know · Understand · Do</span></div>
      <W.KUD value={u.kud} labels={fw.kudLabels} onChange={(v)=>ed({kud:v})}/>
    </div>

    {/* framework field groups */}
    {groups.filter(g=>!hidden.includes(g)).map(g=><div className="dsg-card" key={g}>
      <div className="dsg-h">{g}</div>
      <div className="dsg-fields">
        {(fw.unitFields||[]).filter(fd=>fd.group===g).map(fd=>(
          <W.Field key={fd.k} def={fd} value={(u.fwData||{})[fd.k]} unit={u} dated={dated}
            onChange={(v)=>edFw(fd.k,v)}/>
        ))}
      </div>
    </div>)}

    {/* UDL overlay */}
    {u.udlOn && <div className="dsg-card">
      <div className="dsg-h">UDL — multiple means <span className="src">works with any framework</span></div>
      <W.UDLCheck value={(u.fwData||{}).udl} onChange={(v)=>edFw('udl',v)}/>
    </div>}

    {/* reflection */}
    <div className="dsg-card">
      <div className="dsg-h">Reflection <span className="src">before · during · after</span></div>
      <W.Reflection value={u.reflect} lastYear={FW.LAST_YEAR[u.id]} onChange={(v)=>ed({reflect:v})}/>
    </div>

    {/* custom fields */}
    <div className="dsg-card">
      <div className="dsg-h">Custom lesson fields <span className="src">appear in every lesson editor at their level</span></div>
      <div className="dsg-cfrow"><span className="sc">Planner-wide</span>
        <W.CustomDefs defs={plannerCF} scopeLabel="planner" onChange={(d)=>actions.setCustomDefs('planner',null,d)}/></div>
      <div className="dsg-cfrow"><span className="sc">{s.full}</span>
        <W.CustomDefs defs={subjCF} scopeLabel="subject" onChange={(d)=>actions.setCustomDefs('subject',u.sid,d)}/></div>
      <div className="dsg-cfrow"><span className="sc">This unit</span>
        <W.CustomDefs defs={unitCF} scopeLabel="unit" onChange={(d)=>actions.editUnit(u.id,{customFields:d})}/></div>
    </div>

    {/* carried over */}
    <W.Carried items={u.carried}
      onCopyToNotes={(it)=>{ ed({notes:(u.notes?u.notes+'\n':'')+'['+it.fw+' · '+it.label+'] '+it.text,
        carried:(u.carried||[]).filter(x=>x!==it)}); }}
      onRemove={(i)=>ed({carried:(u.carried||[]).filter((_,j)=>j!==i)})}/>

    {pick && <ConvertModal fw={FW.get(pick.fwId)} scope={scope}
      scopeLabel={scope==='unit'?('“'+u.name+'”'):scope==='subject'?s.full:'the whole planner'}
      nLessons={nLessons}
      onGo={(convertLessons)=>{ actions.setFramework(scope, scope==='unit'?u.id:u.sid, pick.fwId, convertLessons); setPick(null); }}
      onClose={()=>setPick(null)}/>}
  </div>;
}
window.PHDesign=Design;
})();
