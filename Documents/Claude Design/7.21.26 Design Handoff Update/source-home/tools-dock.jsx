/* Tools Dock — right-side dock (overlay) opened from the Tools menu. Tabbed,
   resizable, pop-out to float. Houses Shout Box (team chat), To-Do, Notes.
   window.ToolsDock({ tool, onTool, onClose, mode }) — tool = active tool key or null */
(function(){
const { useState, useEffect, useRef } = React;
const cv=(x)=>`var(${x})`;
const DS=window.DS;

const TOOLS=[
  ['shout','Shout Box'],
  ['todo','To-Do'],
  ['notes','Notes'],
];
const load=(k,f)=>{ try{ return JSON.parse(localStorage.getItem(k)||JSON.stringify(f)); }catch(e){ return f; } };
const save=(k,v)=>{ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} };

function ShoutBox({ mode }){
  const [msgs,setMsgs]=useState(()=>load('cc_shout',[
    {who:'Sara K.',text:'Anyone have the inference anchor chart?',t:'9:02'},
    {who:'Omar R.',text:'Posted it to the Reading wall @Tim',t:'9:05'},
  ]));
  const [v,setV]=useState('');
  const endRef=useRef(null);
  useEffect(()=>{ endRef.current&&endRef.current.scrollIntoView&&endRef.current.scrollIntoView({block:'end'}); },[msgs]);
  const send=()=>{ if(!v.trim())return; const m=[...msgs,{who:'Tim',text:v,t:new Date().toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}]; setMsgs(m); save('cc_shout',m); setV(''); };
  return (
    <div className="td-shout">
      <div className="td-chatscroll">
        {msgs.map((m,i)=>(
          <div key={i} className={'td-msg'+(m.who==='Tim'?' me':'')}>
            <span className="td-msgwho">{m.who}<span className="td-msgt">{m.t}</span></span>
            <span className="td-msgbody" dangerouslySetInnerHTML={{__html:m.text.replace(/@(\w+)/g,'<b>@$1</b>')}}/>
          </div>
        ))}
        <div ref={endRef}/>
      </div>
      <div className="td-chatbar">
        <input value={v} onChange={e=>setV(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter')send(); }} placeholder="Message your team… @name to mention"/>
        <button onClick={send}>Send</button>
      </div>
    </div>
  );
}

/* ===== Notifications store + scheduler (local; Phase-1B realtime-ready) ===== */
const N_TEAM=['Tim Mills','Sara K.','Omar R.','Lena P.'];
const N_ME='Tim Mills';
const N_TYPE={
  message:{c:'var(--brand-500)', label:'Message'},
  todo:{c:'#D9A441', label:'To-do'},
  overdue:{c:'#E0564B', label:'Overdue'},
  team:{c:'#D9568B', label:'Team curriculum'},
};
function nInitials(n){ return (n||'?').split(' ').map(p=>p[0]).slice(0,2).join('').toUpperCase(); }
function nAvatarColor(n){ let h=0; for(const ch of (n||'')) h=(h*31+ch.charCodeAt(0))%360; return 'hsl('+h+' 48% 52%)'; }
function nRel(ts){ const d=(Date.now()-ts)/1000; if(d<60)return 'just now'; if(d<3600)return Math.floor(d/60)+'m ago'; if(d<86400)return Math.floor(d/3600)+'h ago'; return Math.floor(d/86400)+'d ago'; }
function nDue(due){ if(!due)return null; const ms=due-Date.now(), day=86400000; if(ms<0){ const o=Math.ceil(-ms/day); return {cls:'over',label:o<=1?'Overdue':o+'d overdue'}; } if(ms<3600000)return {cls:'soon',label:'Due in '+Math.max(1,Math.round(ms/60000))+'m'}; if(ms<day)return {cls:'soon',label:'Due in '+Math.round(ms/3600000)+'h'}; const d=Math.round(ms/day); return {cls:'up',label:'Due in '+d+'d'}; }

const NotifStore=(()=>{
  let list=load('cc_notifs',null);
  if(!Array.isArray(list)){ const now=Date.now();
    list=[
      {id:'n1',type:'message',title:'Sara K. messaged you',meta:'"Anyone have the inference anchor chart?"',who:'Sara K.',ref:{tool:'shout'},ts:now-1000*60*4,read:false},
      {id:'n2',type:'team',title:'Omar R. edited the team plan',meta:'Reading · Theme & Inference',who:'Omar R.',ref:{view:'Week'},ts:now-1000*60*52,read:false},
      {id:'n3',type:'todo',title:'Exit tickets for Math',meta:'Due in 1h · assigned to you',ref:{tool:'todo'},ts:now-1000*60*120,read:true},
    ];
    save('cc_notifs',list);
  }
  const subs=new Set();
  const emit=()=>{ save('cc_notifs',list); subs.forEach(f=>{try{f();}catch(e){}}); };
  return {
    all:()=>list,
    unread:()=>list.filter(n=>!n.read),
    sub:(f)=>{ subs.add(f); return ()=>subs.delete(f); },
    add:(n)=>{ const item={id:'n'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),ts:Date.now(),read:false,...n}; list=[item,...list]; emit(); try{ window.dispatchEvent(new CustomEvent('cc-toast',{detail:item})); }catch(e){} return item; },
    markRead:(id)=>{ list=list.map(n=>n.id===id?{...n,read:true}:n); emit(); },
    markAll:()=>{ list=list.map(n=>({...n,read:true})); emit(); },
    remove:(id)=>{ list=list.filter(n=>n.id!==id); emit(); },
  };
})();
window.NotifStore=NotifStore;
function useNotifs(){ const [,bump]=useState(0); useEffect(()=>NotifStore.sub(()=>bump(x=>x+1)),[]); return NotifStore; }

/* scheduler: promote due-soon / overdue personal tasks into notifications */
function nRunScheduler(){
  const todos=load('cc_todo',[]); const fired=load('cc_todo_notified',{}); let changed=false;
  todos.forEach(t=>{
    if(t.done||!t.due) return;
    const di=nDue(t.due); if(!di||di.cls==='up') return;
    const mine=(t.assignee?t.assignee===N_ME:t.who==='me');
    if(!mine) return;
    const key=t.id+':'+di.cls;
    if(!fired[key]){ NotifStore.add({type:di.cls==='over'?'overdue':'todo', title:t.text, meta:di.label+(t.assignee?' · '+t.assignee:''), ref:{tool:'todo'}}); fired[key]=1; changed=true; }
  });
  if(changed) save('cc_todo_notified',fired);
}
try{ setTimeout(nRunScheduler,1800); setInterval(nRunScheduler,60000); }catch(e){}

/* ===== Enriched To-Do ===== */
const PRIO={ high:{c:'#E0564B',l:'High'}, med:{c:'#D9A441',l:'Med'}, low:{c:'#7C8089',l:'Low'} };
function Todo(){
  const [items,setItems]=useState(()=>load('cc_todo',[
    {id:1,text:'Copy exit tickets for Math',done:false,who:'me',tag:'Math',assignee:'Tim Mills',due:Date.now()+1000*60*60,priority:'high'},
    {id:2,text:'Share inference slides with team',done:false,who:'team',tag:'Reading',assignee:'Sara K.',due:Date.now()+1000*60*60*26,priority:'med'},
  ]));
  const [v,setV]=useState(''); const [filter,setFilter]=useState('mine');
  const [assignee,setAssignee]=useState(N_ME); const [due,setDue]=useState(''); const [prio,setPrio]=useState('med');
  const [showAdv,setShowAdv]=useState(false);
  const persist=(n)=>{ setItems(n); save('cc_todo',n); };
  const add=()=>{ if(!v.trim())return; const tagm=v.match(/#(\w+)/); const dueMs=due?new Date(due).getTime():null;
    const it={id:Date.now(),text:v.replace(/#\w+/,'').trim(),done:false,who:assignee===N_ME?'me':'team',tag:tagm?tagm[1]:'',assignee,due:dueMs,priority:prio,status:'open'};
    persist([it,...items]); setV(''); setDue('');
    if(assignee!==N_ME) NotifStore.add({type:'todo',title:it.text,meta:'Assigned to '+assignee+(dueMs?' · '+(nDue(dueMs)||{}).label:''),who:N_ME,ref:{tool:'todo'}});
  };
  const toggle=(id)=>persist(items.map(x=>x.id===id?{...x,done:!x.done,status:!x.done?'done':'open'}:x));
  const rank=(t)=>{ if(t.done)return 9e15; const d=nDue(t.due); if(d&&d.cls==='over')return -1e15+(t.due||0); if(d&&d.cls==='soon')return -1e14+(t.due||0); return t.due||8e14; };
  const shown=items.filter(t=>filter==='all'?true:(t.assignee?t.assignee===N_ME:t.who==='me')).slice().sort((a,b)=>rank(a)-rank(b));
  return (
    <div className="td-todo">
      <div className="td-todoadd">
        <div className="td-whoseg">{[['mine','Mine'],['all','Everyone']].map(([k,l])=><button key={k} className={filter===k?'on':''} onClick={()=>setFilter(k)}>{l}</button>)}</div>
        <div className="td-addrow"><input value={v} onChange={e=>setV(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter')add(); }} onFocus={()=>setShowAdv(true)} placeholder="New task… #tag a lesson"/><button onClick={add}>+</button></div>
        {showAdv && <div className="td-addmeta">
          <label className="td-mf"><span>Who</span><select value={assignee} onChange={e=>setAssignee(e.target.value)}>{N_TEAM.map(n=><option key={n} value={n}>{n===N_ME?'Me':n}</option>)}</select></label>
          <label className="td-mf"><span>Due</span><input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)} /></label>
          <label className="td-mf"><span>Priority</span><select value={prio} onChange={e=>setPrio(e.target.value)}>{Object.keys(PRIO).map(p=><option key={p} value={p}>{PRIO[p].l}</option>)}</select></label>
        </div>}
      </div>
      <div className="td-todolist">
        {shown.length===0 && <div className="td-todoempty">No tasks{filter==='mine'?' assigned to you':''}.</div>}
        {shown.map(it=>{ const di=nDue(it.due); const pr=PRIO[it.priority||'med'];
          return (
          <div key={it.id} className={'td-todoitem'+(it.done?' done':'')}>
            <button className="td-check" onClick={()=>toggle(it.id)}>{it.done?'✓':''}</button>
            <div className="td-titem">
              <div className="td-tirow"><span className="td-todotext">{it.text}{it.tag&&<span className="td-tag">#{it.tag}</span>}</span></div>
              <div className="td-timeta">
                {it.assignee && <span className="td-tav" title={it.assignee} style={{background:nAvatarColor(it.assignee)}}>{nInitials(it.assignee)}</span>}
                {di && <span className={'td-due '+di.cls}>{di.label}</span>}
                {!it.done && <span className="td-prio" style={{color:pr.c}}>● {pr.l}</span>}
              </div>
            </div>
            <button className="td-todox" onClick={()=>persist(items.filter(x=>x.id!==it.id))}>×</button>
          </div>
        ); })}
      </div>
    </div>
  );
}

function Notes(){
  const [text,setText]=useState(()=>load('cc_quicknotes',''));
  return <textarea className="td-notes" value={text} onChange={e=>{ setText(e.target.value); save('cc_quicknotes',e.target.value); }} placeholder="Quick notes — autosaved…"/>;
}

function NotifRow({ n, onNav }){
  const ty=N_TYPE[n.type]||N_TYPE.message;
  return (
    <div className={'nc-row'+(n.read?'':' unread')} onClick={()=>onNav(n)}>
      <span className="nc-rail" style={{background:ty.c}} />
      {n.who ? <span className="nc-av" style={{background:nAvatarColor(n.who)}}>{nInitials(n.who)}</span>
             : <span className="nc-ic" style={{color:ty.c,background:'color-mix(in oklab,'+ty.c+' 16%,transparent)'}}>{n.type==='overdue'?'!':(n.type==='todo'?'◷':'◆')}</span>}
      <div className="nc-body">
        <div className="nc-title">{n.title}</div>
        {n.meta && <div className="nc-meta">{n.meta}</div>}
        <div className="nc-time">{nRel(n.ts)}</div>
      </div>
      {!n.read && <span className="nc-dot" />}
    </div>
  );
}
function NotifBell(){
  const store=useNotifs();
  const [open,setOpen]=useState(false); const [chip,setChip]=useState('all');
  const ref=useRef(null);
  useEffect(()=>{ if(!open)return; const h=(e)=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown',h); return ()=>document.removeEventListener('mousedown',h); },[open]);
  const all=store.all(); const unread=all.filter(n=>!n.read).length;
  const nav=(n)=>{ store.markRead(n.id); setOpen(false); try{ window.dispatchEvent(new CustomEvent('cc-notif-nav',{detail:n.ref||{}})); }catch(e){} };
  const filt=all.filter(n=> chip==='all'?true : chip==='message'?n.type==='message' : chip==='todo'?(n.type==='todo'||n.type==='overdue') : n.type==='team');
  const today=filt.filter(n=>Date.now()-n.ts<86400000), earlier=filt.filter(n=>Date.now()-n.ts>=86400000);
  return (
    <span className="nc-wrap" ref={ref}>
      <button className="iconbtn nc-bell" title="Notifications — messages, to-dos & team-plan changes" onClick={()=>setOpen(o=>!o)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
        {unread>0 && <span className="nc-badge">{unread>9?'9+':unread}</span>}
      </button>
      {open && <div className="nc-pop">
        <div className="nc-head"><span className="nc-h">Notifications</span><button className="nc-markall" onClick={()=>store.markAll()} disabled={!unread}>Mark all read</button></div>
        <div className="nc-chips">{[['all','All'],['message','Messages'],['todo','To-dos'],['team','Team']].map(([k,l])=><button key={k} className={chip===k?'on':''} onClick={()=>setChip(k)}>{l}</button>)}</div>
        <div className="nc-list">
          {filt.length===0 && <div className="nc-empty">You're all caught up.</div>}
          {today.length>0 && <div className="nc-grp">Today</div>}
          {today.map(n=><NotifRow key={n.id} n={n} onNav={nav} />)}
          {earlier.length>0 && <div className="nc-grp">Earlier</div>}
          {earlier.map(n=><NotifRow key={n.id} n={n} onNav={nav} />)}
        </div>
      </div>}
    </span>
  );
}
window.NotifBell=NotifBell;

function Toasts(){
  const [toasts,setToasts]=useState([]);
  useEffect(()=>{ const h=(e)=>{ const n=e.detail; setToasts(t=>[...t,n].slice(-3)); setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==n.id)),6000); }; window.addEventListener('cc-toast',h); return ()=>window.removeEventListener('cc-toast',h); },[]);
  const dismiss=(id)=>setToasts(t=>t.filter(x=>x.id!==id));
  const nav=(n)=>{ dismiss(n.id); try{ window.NotifStore.markRead(n.id); window.dispatchEvent(new CustomEvent('cc-notif-nav',{detail:n.ref||{}})); }catch(e){} };
  if(!toasts.length) return null;
  return ReactDOM.createPortal(
    <div className="toast-wrap">
      {toasts.map(n=>{ const ty=N_TYPE[n.type]||N_TYPE.message; const act=n.type==='message'?'Reply':(n.type==='team'?'Open':'View');
        return (
        <div key={n.id} className="toast" onClick={()=>nav(n)}>
          <span className="toast-rail" style={{background:ty.c}} />
          {n.who ? <span className="toast-av" style={{background:nAvatarColor(n.who)}}>{nInitials(n.who)}</span>
                 : <span className="toast-ic" style={{color:ty.c,background:'color-mix(in oklab,'+ty.c+' 16%,transparent)'}}>{n.type==='overdue'?'!':'◷'}</span>}
          <div className="toast-body"><div className="toast-title">{n.title}</div>{n.meta&&<div className="toast-meta">{n.meta}</div>}</div>
          <button className="toast-act" onClick={(e)=>{e.stopPropagation();nav(n);}}>{act}</button>
          <button className="toast-x" onClick={(e)=>{e.stopPropagation();dismiss(n.id);}}>×</button>
        </div>
      ); })}
    </div>, document.body);
}
window.Toasts=Toasts;

const RENDER={ shout:<ShoutBox/>, todo:<Todo/>, notes:<Notes/> };

(function(){ try{ if(!localStorage.getItem('cc_dockm2')){ localStorage.setItem('cc_dockm2','1'); localStorage.setItem('cc_dockmode','float'); localStorage.setItem('cc_dockw','340'); localStorage.setItem('cc_dockh','380'); localStorage.removeItem('cc_dockpos'); } }catch(e){} })();
function ToolsDock({ tool, onTool, onClose }){
  const [mode,setMode]=useState(()=>{ const m=load('cc_dockmode','float'); return m==='rail'?'rail':'float'; });
  const [w,setW]=useState(()=>load('cc_dockw',340));
  const [h,setH]=useState(()=>load('cc_dockh',380));
  const [pos,setPos]=useState(()=>load('cc_dockpos',{x:Math.max(20,window.innerWidth-372),y:72}));
  const [railPos,setRailPos]=useState(()=>load('cc_dockrailpos',{x:window.innerWidth-70,y:74}));
  const [railDir,setRailDir]=useState(()=>load('cc_dockraildir','v'));
  const dragRef=useRef(null);
  useEffect(()=>{ const k=(e)=>{ if(e.key==='Escape'&&tool) onClose(); }; document.addEventListener('keydown',k); return ()=>document.removeEventListener('keydown',k); },[tool,onClose]);
  if(!tool) return null;
  const rail=mode==='rail', floating=!rail;
  const setModeP=(m)=>{ setMode(m); save('cc_dockmode',m); };
  const toggleRailDir=()=>{ setRailDir(d=>{ const nd=d==='v'?'h':'v'; save('cc_dockraildir',nd); return nd; }); };
  const startRailMove=(e)=>{ e.preventDefault(); const ox=e.clientX-railPos.x, oy=e.clientY-railPos.y; let last=railPos; const mv=(ev)=>{ last={x:Math.max(6,Math.min(window.innerWidth-60,ev.clientX-ox)),y:Math.max(56,Math.min(window.innerHeight-60,ev.clientY-oy))}; setRailPos(last); }; const up=()=>{ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); save('cc_dockrailpos',last); }; document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up); };
  const startResize=(e,dir)=>{ e.preventDefault(); e.stopPropagation(); const sx=e.clientX,sy=e.clientY,sw=w,sh=h;
    const mv=(ev)=>{ const nw=Math.max(300,Math.min(680, sw+(floating?(ev.clientX-sx):(sx-ev.clientX)))); setW(nw); save('cc_dockw',nw); if(dir==='wh'){ const nh=Math.max(360,Math.min(window.innerHeight-70, sh+(ev.clientY-sy))); setH(nh); save('cc_dockh',nh);} };
    const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);}; document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up); };
  const startMove=(e)=>{ if(!floating||e.target.closest('button'))return; dragRef.current={x:e.clientX-pos.x,y:e.clientY-pos.y}; let last=pos;
    const mv=(ev)=>{ last={x:Math.max(6,Math.min(window.innerWidth-90,ev.clientX-dragRef.current.x)),y:Math.max(58,Math.min(window.innerHeight-70,ev.clientY-dragRef.current.y))}; setPos(last); };
    const up=()=>{ document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); save('cc_dockpos',last); };
    document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up); };

  if(rail) return (
    <div className={'td-dock td-rail td-rail-'+railDir} style={{left:railPos.x,top:railPos.y,right:'auto'}}>
      <button className="td-railgrip" title="Drag to move" onMouseDown={startRailMove}>{railDir==='v'?'⋮':'⋯'}</button>
      {TOOLS.map(([k,l])=><button key={k} className={'td-railbtn'+(tool===k?' on':'')} title={l} onClick={()=>{ onTool(k); setModeP('float'); }}><span className="td-railg">{l[0]}</span></button>)}
      <div className="td-railsp"/>
      <button className="td-railbtn td-railact" title={railDir==='v'?'Make horizontal':'Make vertical'} onClick={toggleRailDir}>{railDir==='v'?'↔':'↕'}</button>
      <button className="td-railbtn td-railact" title="Open" onClick={()=>setModeP('float')}>{'‹'}</button>
      <button className="td-railbtn td-railact" title="Close (Esc)" onClick={onClose}>{'×'}</button>
    </div>
  );

  return (
    <div className={'td-dock'+(floating?' floating':'')} style={floating?{left:pos.x,top:pos.y,width:w,height:h}:{width:w}}>
      {!floating && <div className="td-resizer" onMouseDown={(e)=>startResize(e,'w')}/>}
      <div className="td-head" onMouseDown={startMove} style={floating?{cursor:'grab'}:undefined}>
        <span className="td-title">Tools</span>
        <div className="td-tabs">
          {TOOLS.map(([k,l])=>{ let badge=0; if(k==='todo'){ try{ badge=(load('cc_todo',[])||[]).filter(t=>!t.done&&t.due&&(t.assignee?t.assignee===N_ME:t.who==='me')&&(t.due-Date.now())<86400000).length; }catch(e){} } return <button key={k} className={'td-tab'+(tool===k?' on':'')} title={l} onClick={()=>{ onTool(k); save('cc_docktab',k); }}><span className="td-tabg">{l[0]}</span><span className="td-tablbl">{l}</span>{badge>0 && <span className="td-tabbadge">{badge}</span>}</button>; })}
        </div>
        <div className="td-headacts">
          <button title="Collapse to rail" onClick={()=>{ const rp=floating?{x:Math.max(6,Math.min(window.innerWidth-60,pos.x)),y:Math.max(56,pos.y)}:{x:window.innerWidth-70,y:74}; setRailPos(rp); save('cc_dockrailpos',rp); setModeP('rail'); }}>{'–'}</button>
          <button title="Close (Esc)" onClick={onClose}>{'×'}</button>
        </div>
      </div>
      <div className="td-content">{RENDER[tool]}</div>
      {floating && <div className="td-resizecorner" onMouseDown={(e)=>startResize(e,'wh')} title="Drag to resize"/>}
    </div>
  );
}
window.ToolsDock = ToolsDock;
})();
