/* Planning Hub — shared icons + atoms. Extends window.PWC (pw-shared.jsx must load first).
   Exposes window.PHC. */
(function(){
const P={fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round',strokeLinejoin:'round',viewBox:'0 0 24 24'};
const I={
  ...window.PWC.I,
  search:<svg {...P}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>,
  cog:<svg {...P}><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 0 0 .32 1.76l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.97 1.47V21a2 2 0 1 1-4 0v-.09a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.76.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.47-.97H3a2 2 0 1 1 0-4h.09a1.6 1.6 0 0 0 1.47-1.05 1.6 1.6 0 0 0-.32-1.76l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.6 1.6 0 0 0 1.76.32h.01a1.6 1.6 0 0 0 .96-1.47V3a2 2 0 1 1 4 0v.09a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.76-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.76v.01a1.6 1.6 0 0 0 1.47.96H21a2 2 0 1 1 0 4h-.09a1.6 1.6 0 0 0-1.47.97z"/></svg>,
  back:<svg {...P}><path d="M15 18l-6-6 6-6"/></svg>,
  user:<svg {...P}><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-3.6 4.5-5.4 8-5.4s6.5 1.8 8 5.4"/></svg>,
  users:<svg {...P}><circle cx="9" cy="8.5" r="3.4"/><path d="M2.5 20c1.2-3 3.7-4.6 6.5-4.6s5.3 1.6 6.5 4.6"/><path d="M16 5.6a3.4 3.4 0 0 1 0 5.8M18.5 15.9c1.4.7 2.5 2 3 3.8"/></svg>,
  logo:<svg {...P} strokeWidth={2.2}><rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>,
  box:<svg {...P}><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>,
  ring:<svg {...P}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.6"/><path d="M5.7 5.7l3.5 3.5M14.8 14.8l3.5 3.5M18.3 5.7l-3.5 3.5M9.2 14.8l-3.5 3.5"/></svg>,
  spark:<svg {...P}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>,
  clockI:<svg {...P}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>,
  insight:<svg {...P}><path d="M3 20h18M7 16v-5M12 16V6M17 16v-8"/></svg>,
};

/* iOS-style switch */
function Toggle({on,onChange,title}){
  return <button className={'ph-toggle'+(on?' on':'')} title={title} onClick={()=>onChange(!on)} role="switch" aria-checked={on}></button>;
}
/* subject chip */
function SubjChip({sid}){
  const s=window.DS.SUBJECTS[sid], cv=window.PWC.cv;
  return <span className="ph-subj" style={{color:cv(s.ink)}}><i style={{background:cv(s.c)}}></i>{s.label}</span>;
}
/* kind tag — says what a name IS (Unit, Lesson, Subject…); follows the custom naming */
function KindTag({level}){
  return <span className="ph-kind">{window.DS.label(level,false)}</span>;
}
window.PHC={ I, Toggle, SubjChip, KindTag };
})();
