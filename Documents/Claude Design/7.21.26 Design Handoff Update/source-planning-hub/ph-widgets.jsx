/* Planning Hub — framework widgets. Reusable editors the Design tab and lesson
   editor render from FW field defs. Exposes window.PHW. */
(function(){
const {useState}=React;
const {I}=window.PHC;
const FW=window.FW;

/* field label with short inline help + fuller tooltip */
function Lbl({label,help,tip,hint}){
  return <span className="phw-lbl" title={tip||help||''}>
    <span className="t">{label}{(tip||help) && <i className="q" title={tip||help}>?</i>}</span>
    {help && <span className="h">{help}</span>}
    {hint && <span className="hint">{hint}</span>}
  </span>;
}

/* simple growing list of one-line inputs */
function ListEd({value,onChange,placeholder}){
  const v=(value&&value.length?value:['']);
  const set=(i,t)=>{ const n=[...v]; n[i]=t; onChange(n.filter((x,j)=>x!==''||j===n.length-1)); };
  return <div className="phw-list">
    {v.map((x,i)=><div className="row" key={i}>
      <span className="n">{i+1}</span>
      <input value={x} placeholder={placeholder||'…'} onChange={e=>set(i,e.target.value)}/>
      {v.length>1 && <button className="rm" title="Remove" onClick={()=>onChange(v.filter((_,j)=>j!==i))}>{I.x}</button>}
    </div>)}
    <button className="add" onClick={()=>onChange([...v,''])}>{I.plus} Add</button>
  </div>;
}

function Tags({value,opts,onChange}){
  const v=value||[];
  return <div className="phw-tags">
    {opts.map(o=><button key={o} className={v.includes(o)?'on':''}
      onClick={()=>onChange(v.includes(o)?v.filter(x=>x!==o):[...v,o])}>{o}</button>)}
  </div>;
}

/* F/C/D tagged questions */
function Questions({value,onChange}){
  const v=value&&value.length?value:[{t:'F',q:''}];
  const set=(i,patch)=>{ const n=v.map((x,j)=>j===i?{...x,...patch}:x); onChange(n); };
  const TYPES=[['F','Factual'],['C','Conceptual'],['D','Debatable']];
  return <div className="phw-qs">
    {v.map((x,i)=><div className="row" key={i}>
      <span className="seg">
        {TYPES.map(([k,lab])=><button key={k} className={x.t===k?'on t'+k:'t'+k} title={lab} onClick={()=>set(i,{t:k})}>{k}</button>)}
      </span>
      <input value={x.q} placeholder={x.t==='F'?'Factual — grounds the facts…':x.t==='C'?'Conceptual — bridges to the big idea…':'Debatable — provokes argument…'}
        onChange={e=>set(i,{q:e.target.value})}/>
      {v.length>1 && <button className="rm" title="Remove" onClick={()=>onChange(v.filter((_,j)=>j!==i))}>{I.x}</button>}
    </div>)}
    <button className="add" onClick={()=>onChange([...v,{t:'C',q:''}])}>{I.plus} Add question</button>
  </div>;
}

/* PYP lines of inquiry (3–4) */
function LOI({value,onChange}){
  return <div>
    <ListEd value={value&&value.length?value:['','','']} onChange={onChange} placeholder="A phrase, not a question — e.g. “how place value organizes numbers”"/>
    {(value||[]).filter(Boolean).length>4 && <div className="phw-warn">PYP recommends 3–4 lines of inquiry.</div>}
  </div>;
}

/* MYP statement-of-inquiry builder */
function SOI({value,onChange}){
  const v=value||{concept:'',related:'',context:'',sentence:''};
  const set=(k,t)=>onChange({...v,[k]:t});
  const suggested=(v.concept||v.related||v.context)
    ? ((v.concept||'…')+(v.related?(' and '+v.related):'')+' shape how we act within '+(v.context||'…')+'.')
    : '';
  return <div className="phw-soi">
    <div className="cols">
      <label><span>Key concept</span><input value={v.concept} placeholder="Systems" onChange={e=>set('concept',e.target.value)}/></label>
      <label><span>Related concept(s)</span><input value={v.related} placeholder="operations, patterns" onChange={e=>set('related',e.target.value)}/></label>
      <label><span>Global context</span><input value={v.context} placeholder="Scientific and technical innovation" onChange={e=>set('context',e.target.value)}/></label>
    </div>
    {suggested && !v.sentence && <button className="sugg" title="Use the suggested sentence as a starting point" onClick={()=>set('sentence',suggested)}>Suggestion: “{suggested}”</button>}
    <textarea rows="2" value={v.sentence} placeholder="Statement of inquiry — one meaningful, student-friendly sentence…" onChange={e=>set('sentence',e.target.value)}></textarea>
  </div>;
}

/* UbD GRASPS sub-form */
const GRASPS_KEYS=[['g','Goal','What the task asks students to accomplish'],['r','Role','Who students are in the scenario'],['a','Audience','Who the work is for'],['s','Situation','The real-world context'],['p','Product','What students make or perform'],['st','Standards for success','Criteria / rubric the work is judged by']];
function GRASPS({value,onChange}){
  const v=value||{};
  return <div className="phw-grasps">
    {GRASPS_KEYS.map(([k,lab,tip])=><label key={k} title={tip}>
      <span><b>{lab[0]}</b>{lab.slice(1)}</span>
      <input value={v[k]||''} placeholder={tip} onChange={e=>onChange({...v,[k]:e.target.value})}/>
    </label>)}
  </div>;
}

/* CBCI generalizations with weak-verb warnings */
function Generalizations({value,onChange}){
  const v=value&&value.length?value:[''];
  const weak=(t)=>FW.WEAK_VERBS.filter(w=>new RegExp('\\b'+w+'\\b','i').test(t||''));
  return <div className="phw-list">
    {v.map((x,i)=>{
      const w=weak(x);
      return <div key={i}>
        <div className="row">
          <span className="n">{i+1}</span>
          <input value={x} placeholder="Students will understand that…" onChange={e=>{ const n=[...v]; n[i]=e.target.value; onChange(n); }}/>
          {v.length>1 && <button className="rm" title="Remove" onClick={()=>onChange(v.filter((_,j)=>j!==i))}>{I.x}</button>}
        </div>
        {w.length>0 && <div className="phw-warn">Weak verb{w.length>1?'s':''}: <b>{w.join(', ')}</b> — state the conceptual relationship instead.</div>}
      </div>;
    })}
    <button className="add" onClick={()=>onChange([...v,''])}>{I.plus} Add generalization</button>
    {v.filter(Boolean).length>0 && v.filter(Boolean).length<5 && <div className="phw-note">CBCI recommends 5–9 per unit.</div>}
  </div>;
}

/* 5E / Murdoch phase sequencer with looping */
function Phases({value,onChange,opts}){
  const v=value&&value.length?value:opts.map(p=>({ph:p,note:''}));
  const set=(i,patch)=>onChange(v.map((x,j)=>j===i?{...x,...patch}:x));
  return <div className="phw-phases">
    {v.map((x,i)=><div className="row" key={i}>
      <select value={x.ph} onChange={e=>set(i,{ph:e.target.value})}>
        {opts.map(p=><option key={p}>{p}</option>)}
      </select>
      <input value={x.note} placeholder="What happens in this phase…" onChange={e=>set(i,{note:e.target.value})}/>
      <button className="rm" title="Remove" onClick={()=>onChange(v.filter((_,j)=>j!==i))}>{I.x}</button>
    </div>)}
    <button className="add" title="Phases can repeat — loop Explore → Explain as needed" onClick={()=>onChange([...v,{ph:opts[1]||opts[0],note:''}])}>{I.plus} Add phase (loops allowed)</button>
  </div>;
}

/* PBL milestones */
function Milestones({value,onChange,dated}){
  const v=value&&value.length?value:[{t:'',date:''}];
  const set=(i,patch)=>onChange(v.map((x,j)=>j===i?{...x,...patch}:x));
  return <div className="phw-phases">
    {v.map((x,i)=><div className="row" key={i}>
      <span className="n">{i+1}</span>
      <input value={x.t} placeholder="Milestone — e.g. First prototype critiqued" onChange={e=>set(i,{t:e.target.value})}/>
      {dated!==false && <input className="dt" type="date" value={x.date||''} onChange={e=>set(i,{date:e.target.value})}/>}
      <button className="rm" title="Remove" onClick={()=>onChange(v.filter((_,j)=>j!==i))}>{I.x}</button>
    </div>)}
    <button className="add" onClick={()=>onChange([...v,{t:'',date:''}])}>{I.plus} Add milestone</button>
  </div>;
}

/* proficiency scale 4→1 */
const SCALE_ROWS=[['4','Advanced'],['3','Proficient — the target'],['2','Basic'],['1','Below basic']];
function ProfScale({value,onChange}){
  const v=value||{};
  return <div className="phw-scale">
    {SCALE_ROWS.map(([k,lab])=><label key={k}>
      <span className={'lv l'+k}>{k}</span>
      <input value={v[k]||''} placeholder={lab+' looks like…'} onChange={e=>onChange({...v,[k]:e.target.value})}/>
    </label>)}
  </div>;
}

/* UDL checklist */
function UDLCheck({value,onChange}){
  const v=value||{};
  return <div className="phw-udl">
    {Object.entries(FW.UDL).map(([gk,g])=><div className="grp" key={gk}>
      <div className="gl">{g.label}</div>
      {g.items.map(it=>{
        const on=(v[gk]||[]).includes(it);
        return <label key={it} className={on?'on':''}>
          <input type="checkbox" checked={on} onChange={()=>{
            const cur=v[gk]||[]; onChange({...v,[gk]:on?cur.filter(x=>x!==it):[...cur,it]}); }}/>
          {it}
        </label>;
      })}
    </div>)}
  </div>;
}

/* KUD three-column goals */
function KUD({value,onChange,labels}){
  const v=value||{k:[],u:[],d:[]};
  return <div className="phw-kud">
    {['k','u','d'].map((col,i)=><div className="col" key={col}>
      <div className="ch">{labels[i]}</div>
      <ListEd value={v[col]} onChange={(n)=>onChange({...v,[col]:n})} placeholder={i===1?'Students will understand that…':'…'}/>
    </div>)}
  </div>;
}

/* before/during/after reflection with last-year surfacing */
function Reflection({value,onChange,lastYear}){
  const v=value||{};
  const ROWS=[['before','Before teaching','Predictions, prerequisites, what to prep.'],['during','During teaching','What is emerging — wonderings, pace, regroupings.'],['after','After teaching','What worked, what to change — next year reads this.']];
  return <div className="phw-reflect">
    {lastYear && <div className="ly" title="Sample of year-over-year memory — real history lands with the backend">
      <b>Last year said…</b> “{lastYear}”</div>}
    {ROWS.map(([k,lab,ph])=><label key={k}>
      <span>{lab}</span>
      <textarea rows="2" value={v[k]||''} placeholder={ph} onChange={e=>onChange({...v,[k]:e.target.value})}></textarea>
    </label>)}
  </div>;
}

/* carried-over drawer — nothing is ever thrown away */
function Carried({items,onCopyToNotes,onRemove}){
  const [open,setOpen]=useState(false);
  if(!items||!items.length) return null;
  return <div className="phw-carried">
    <button className="head" onClick={()=>setOpen(!open)}>
      {I.chev} Carried over — {items.length} field{items.length>1?'s':''} from earlier formats
      <span className="cap">nothing was deleted</span>
    </button>
    {open && <div className="body">
      {items.map((it,i)=><div className="row" key={i}>
        <span className="fw">{it.fw}</span>
        <span className="lb">{it.label}</span>
        <span className="tx">{it.text}</span>
        <span className="acts">
          {onCopyToNotes && <button title="Append this into Notes" onClick={()=>onCopyToNotes(it)}>→ notes</button>}
          {onRemove && <button title="Discard for good" onClick={()=>onRemove(i)}>{I.x}</button>}
        </span>
      </div>)}
    </div>}
  </div>;
}

/* custom fields: defs manager + value renderer */
function CustomDefs({defs,onChange,scopeLabel}){
  const [draft,setDraft]=useState('');
  const v=defs||[];
  return <div className="phw-cfm">
    {v.map(d=><span key={d.id} className="cf">
      {d.label}<i>{d.type}</i>
      <button title="Remove this field definition" onClick={()=>onChange(v.filter(x=>x.id!==d.id))}>{I.x}</button>
    </span>)}
    <input value={draft} placeholder={'Add a '+scopeLabel+' field — name (Enter = short, Shift+Enter = long text)'}
      onChange={e=>setDraft(e.target.value)}
      onKeyDown={e=>{ if(e.key==='Enter'&&draft.trim()){
        onChange([...v,{id:'cf'+Date.now().toString(36),label:draft.trim(),type:e.shiftKey?'textarea':'text'}]); setDraft(''); } }}/>
  </div>;
}

/* generic field renderer from a FW def */
function Field({def,value,onChange,unit,dated}){
  const t=def.type;
  let body=null;
  if(t==='text') body=<input value={value||''} onChange={e=>onChange(e.target.value)}/>;
  else if(t==='textarea') body=<textarea rows="2" value={value||''} onChange={e=>onChange(e.target.value)}></textarea>;
  else if(t==='select') body=<select value={value||''} onChange={e=>onChange(e.target.value||null)}>
      <option value="">—</option>{def.opts.map(o=><option key={o}>{o}</option>)}</select>;
  else if(t==='tags') body=<Tags value={value} opts={def.opts} onChange={onChange}/>;
  else if(t==='list') body=<ListEd value={value} onChange={onChange}/>;
  else if(t==='questions') body=<Questions value={value} onChange={onChange}/>;
  else if(t==='loi') body=<LOI value={value} onChange={onChange}/>;
  else if(t==='soi') body=<SOI value={value} onChange={onChange}/>;
  else if(t==='grasps') body=<GRASPS value={value} onChange={onChange}/>;
  else if(t==='generalizations') body=<Generalizations value={value} onChange={onChange}/>;
  else if(t==='phases') body=<Phases value={value} onChange={onChange} opts={def.opts}/>;
  else if(t==='milestones') body=<Milestones value={value} onChange={onChange} dated={dated}/>;
  else if(t==='profscale') body=<ProfScale value={value} onChange={onChange}/>;
  else if(t==='unit-loi'||t==='unit-questions'||t==='unit-milestones'){
    const src=t==='unit-loi'?((unit&&unit.fwData&&unit.fwData.loi)||[]).filter(Boolean)
      :t==='unit-questions'?(((unit&&unit.fwData&&unit.fwData.questions)||[]).map(q=>q.q).filter(Boolean))
      :(((unit&&unit.fwData&&unit.fwData.milestones)||[]).map(m=>m.t).filter(Boolean));
    body=<select value={value||''} onChange={e=>onChange(e.target.value||null)}>
      <option value="">—</option>{src.map(o=><option key={o}>{o}</option>)}
      {src.length===0 && <option disabled>Define these on the unit's Design tab…</option>}
    </select>;
  }
  else body=<input value={value||''} onChange={e=>onChange(e.target.value)}/>;
  return <div className="phw-field">
    <Lbl label={def.label} help={def.help} tip={def.tip} hint={def.hint}/>
    {body}
  </div>;
}

window.PHW={ Lbl, ListEd, Tags, Questions, LOI, SOI, GRASPS, Generalizations, Phases,
  Milestones, ProfScale, UDLCheck, KUD, Reflection, Carried, CustomDefs, Field };
})();
