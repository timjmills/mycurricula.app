/* Shared Composer: the single way to add a resource/note anywhere in the app.
   Portable — depends only on React + window.DS. Centered modal, app-themed.
   A rich note that can hold attachments; note optional; each attachment is its
   own stacked resource. window.openComposer(opts) opens it; mount
   <window.PHComposer/> once per React tree (hub + home). opts.onSave(list) gets
   the composed items; if omitted, the host's actions.addResources(target,list) is used. */
(function(){
const {useState,useEffect,useRef}=React;
const cv=(x)=>'var('+x+')'; const XIC='\u2715'; const DS=window.DS;
const RESTYPES=(DS&&DS.RESTYPES)||{Slides:'--subj-1',Worksheet:'--subj-10',Image:'--subj-13',Doc:'--subj-7',Video:'--subj-3',Link:'--subj-11'};

let notify=null;
window.openComposer=(opts)=>{ if(notify) notify(opts||{}); };

const guessType=(n,url)=>{ const s=((url||'')+' '+(n||'')).toLowerCase();
  if(/youtube|youtu\.be|vimeo|\.mp4|video/.test(s)) return 'Video';
  if(/\.(png|jpe?g|gif|webp|svg|avif)/.test(s)||/image|photo|drawing/.test(s)) return 'Image';
  if(/slide|deck|ppt|present|\.key/.test(s)) return 'Slides';
  if(/worksheet|practice|packet|handout/.test(s)) return 'Worksheet';
  if(/\.pdf|\.docx?|doc|rubric/.test(s)) return 'Doc';
  return 'Link'; };
const ytId=(u)=>{ const m=(u||'').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/); return m?m[1]:null; };
const BG=[['','Default','var(--phx-panel,#fff)'],['sun','Butter','#FFF4D6'],['mint','Mint','#DDF3E4'],['sky','Sky','#DCEBFB'],['rose','Rose','#FBE0EA'],['lav','Lavender','#EAE2FB'],['slate','Slate','#E7EAF0']];
const BGVAL={sun:'#FFF4D6',mint:'#DDF3E4',sky:'#DCEBFB',rose:'#FBE0EA',lav:'#EAE2FB',slate:'#E7EAF0'};
const FONTS=[['','Default'],['Georgia, serif','Serif'],['"Source Sans 3",system-ui,sans-serif','Sans'],['"Courier New",monospace','Mono'],['"Comic Sans MS",cursive','Casual']];
const HILITES=['#FFE08A','#B6F0C2','#AFD8FF','#FBC0D6','#D8C7FF'];
const TCOLORS=['#1c1b2e','#C6402F','#1F7A4D','#1D5FB0','#8352C7'];

/* the All-tools picker grid — real tools truly work; others are honest visual placeholders */
const TOOLGROUPS=[
  {tone:'purple',items:[['Upload','upload',1],['Padlet','padlet',0],['Link','link',1]]},
  {tone:'blue',items:[['Camera','cam',0],['Video recorder','vidrec',0],['Audio recorder','audrec',0],['Screen recorder','scrrec',0],['Draw','draw',1]]},
  {tone:'green',items:[['Image from URL','imgurl',1],['Google Drive','gdrive',0],['OneDrive','onedrive',0],['Poll','poll',0],['AI image','aiimg',0],['Photo album','album',0]]},
  {tone:'orange',items:[['Image search','imgsearch',0],['GIF','gif',0],['YouTube','yt',1],['Spotify','spotify',0],['Web search','websearch',0],['Location','loc',0]]},
];
const TOOLICON={upload:'⭱',padlet:'▦',link:'🔗',cam:'📷',vidrec:'🎥',audrec:'🎙',scrrec:'⛶',draw:'✎',imgurl:'🖼',gdrive:'▲',onedrive:'☁',poll:'▥',aiimg:'✨',album:'▦',imgsearch:'🔍',gif:'GIF',yt:'▶',spotify:'♫',websearch:'⦿',loc:'📍'};

function Composer({state,actions,dated}){
  const [req,setReq]=useState(null);
  const [title,setTitle]=useState('');
  const [atts,setAtts]=useState([]);          // {id,name,type,url}
  const [bg,setBg]=useState('');
  const [fileTo,setFileTo]=useState('lesson');
  const [wall,setWall]=useState('Resources');
  const [picker,setPicker]=useState(false);   // All-tools overlay
  const [adder,setAdder]=useState(null);       // inline tool input: {tool}
  const [adv,setAdv]=useState('');              // adder text value
  const bodyRef=useRef(null); const fileRef=useRef(null); const drawRef=useRef(null); const drawState=useRef({on:false,last:null});
  useEffect(()=>{ notify=(opts)=>{ const e=opts.edit; setReq(opts);
    setTitle(e?(e.name||''):''); setBg((e&&e.bg)||'');
    setAtts((e&&e.type&&e.type!=='Note'&&(e.url||e.name))?[{id:'a0',name:e.name,type:e.type,url:e.url||''}]:[]);
    setPicker(false); setAdder(null); setAdv('');
    setFileTo(opts.kind==='unit'?'unit':'lesson'); setWall(opts.field==='diffRes'?'Differentiation':((e&&e.wall)||'Resources'));
    setTimeout(()=>{ if(bodyRef.current) bodyRef.current.innerHTML=(e&&e.note)?e.note:''; },0); }; return ()=>{ notify=null; }; },[]);
  if(!req) return null;
  const subjColor=(req.subject&&DS&&DS.SUBJECTS&&DS.SUBJECTS[req.subject])?cv(DS.SUBJECTS[req.subject].c):(req.subjectColor||'var(--brand-500)');
  const canUnit=!!req.unitId, canLesson=!!(req.kind==='lesson'||req.lessonId);
  const addAtt=(a)=>{ setAtts(p=>[...p,{id:'a'+Date.now().toString(36)+p.length,...a}]); setAdder(null); setAdv(''); setPicker(false); };
  const onFiles=(files)=>{ [...files].forEach(f=>{ const isImg=/^image\//.test(f.type);
    if(isImg){ const rd=new FileReader(); rd.onload=()=>addAtt({name:f.name,type:'Image',url:rd.result}); rd.readAsDataURL(f); }
    else addAtt({name:f.name,type:guessType(f.name),url:''}); }); };
  const runTool=(tool,real)=>{ if(!real){ setAdder({tool,ph:true}); return; }
    if(tool==='upload'){ if(fileRef.current) fileRef.current.click(); return; }
    if(tool==='draw'){ setAdder({tool:'draw'}); setPicker(false); setTimeout(()=>initDraw(),40); return; }
    setAdder({tool}); setAdv(''); setPicker(false); };
  const commitAdder=()=>{ const t=adder.tool, v=adv.trim(); if(!v) return;
    if(t==='link') addAtt({name:v.replace(/^https?:\/\//,'').slice(0,40),type:'Link',url:/^https?:\/\//.test(v)?v:('https://'+v)});
    else if(t==='imgurl') addAtt({name:v.split('/').pop()||'Image',type:'Image',url:v});
    else if(t==='yt'){ const id=ytId(v); addAtt({name:'YouTube video',type:'Video',url:v}); }
    else addAtt({name:v,type:guessType(v)}); };
  let initDraw=()=>{ const c=drawRef.current; if(!c) return; const ctx=c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height); ctx.strokeStyle='#1c1b2e'; ctx.lineWidth=3; ctx.lineCap='round';
    const pos=(e)=>{ const r=c.getBoundingClientRect(); return {x:(e.clientX-r.left)*(c.width/r.width),y:(e.clientY-r.top)*(c.height/r.height)}; };
    c.onpointerdown=(e)=>{ drawState.current={on:true,last:pos(e)}; c.setPointerCapture(e.pointerId); };
    c.onpointermove=(e)=>{ const d=drawState.current; if(!d.on) return; const p=pos(e); ctx.beginPath(); ctx.moveTo(d.last.x,d.last.y); ctx.lineTo(p.x,p.y); ctx.stroke(); d.last=p; };
    c.onpointerup=()=>{ drawState.current.on=false; }; };
  const exec=(cmd,val)=>{ if(bodyRef.current) bodyRef.current.focus(); document.execCommand(cmd,false,val); };
  const publish=()=>{ const html=bodyRef.current?bodyRef.current.innerHTML.trim():'';
    const list=atts.map(a=>({name:a.name,type:a.type,url:a.url,bg,wall,sec:req.sectionLabel||''}));
    const plain=(bodyRef.current&&bodyRef.current.textContent||'').trim();
    if(html&&plain) list.push({name:title.trim()||plain.slice(0,40)||'Note',type:'Note',note:html,bg,wall,sec:req.sectionLabel||''});
    if(!list.length&&title.trim()) list.push({name:title.trim(),type:'Note',note:'',bg,wall});
    if(!list.length) return;
    const target={kind:fileTo==='unit'?'unit':(req.kind==='subject'?'subject':'lesson'),
      id:fileTo==='unit'?(req.unitId||req.id):req.id, field:req.field};
    if(req.onSave){ req.onSave(list); }
    else if(actions&&actions.addResources){ actions.addResources(target,list); }
    if(actions&&actions.toast) actions.toast((list.length===1?'1 resource':list.length+' resources')+' added');
    setReq(null); };

  return <React.Fragment>
    <div className="ph-cmp-scrim" onClick={()=>setReq(null)}></div>
    <div className="ph-cmp" role="dialog" aria-label="Add resource or note" data-screen-label="Composer" style={{background:bg?BGVAL[bg]:'var(--phx-panel,#fff)'}}>
      <div className="cmp-top">
        <button className="ic" title="Close without saving" onClick={()=>setReq(null)}>{XIC}</button>
        <button className="ic" title="Collapse to a smaller window" onClick={()=>setReq(null)}>—</button>
        <span className="grow"></span>
        <button className="pub" disabled={!atts.length && !(bodyRef.current&&bodyRef.current.textContent.trim()) && !title.trim()} onClick={publish}>Publish</button>
      </div>
      <div className="cmp-body">
        <input className="cmp-title" style={{color:subjColor}} value={title} placeholder="Subject" onChange={e=>setTitle(e.target.value)}/>
        <div className="cmp-rail" onDragOver={e=>{ e.preventDefault(); }} onDrop={e=>{ e.preventDefault(); if(e.dataTransfer.files&&e.dataTransfer.files.length) onFiles(e.dataTransfer.files); }}>
          <button className="rl" title="Upload a file (or drag one here)" onClick={()=>runTool('upload',1)}><b>⭱</b><span>Upload</span></button>
          <button className="rl" title="Add an image from a URL" onClick={()=>runTool('imgurl',1)}><b>🖼</b><span>Image</span></button>
          <button className="rl" title="Draw a quick sketch" onClick={()=>runTool('draw',1)}><b>✎</b><span>Draw</span></button>
          <button className="rl" title="Paste or type a link" onClick={()=>runTool('link',1)}><b>🔗</b><span>Link</span></button>
          <button className="rl" title="Embed a YouTube video" onClick={()=>runTool('yt',1)}><b>▶</b><span>Video</span></button>
          <button className="rl alltools" title="Every kind of attachment" onClick={()=>{ setPicker(true); setAdder(null); }}><b>⋯</b><span>All tools</span></button>
        </div>
        <p className="cmp-cap">Add an image, video, audio, link, or file. Each one stacks as its own resource.</p>
        <input ref={fileRef} type="file" multiple style={{display:'none'}} onChange={e=>{ if(e.target.files) onFiles(e.target.files); e.target.value=''; }}/>
        {adder && adder.tool==='draw' && <div className="cmp-draw">
          <canvas ref={drawRef} width="440" height="200"></canvas>
          <div className="dr-acts"><button onClick={()=>{ const c=drawRef.current; if(c){ const ctx=c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height); } }}>Clear</button>
            <button className="pri" onClick={()=>{ const c=drawRef.current; if(c) addAtt({name:'Sketch',type:'Image',url:c.toDataURL()}); }}>Add sketch</button>
            <button onClick={()=>setAdder(null)}>Cancel</button></div>
        </div>}
        {adder && adder.tool!=='draw' && !adder.ph && <div className="cmp-adder">
          <input autoFocus value={adv} placeholder={adder.tool==='yt'?'Paste a YouTube URL…':adder.tool==='imgurl'?'Paste an image URL…':'Paste or type a link…'}
            onChange={e=>setAdv(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') commitAdder(); }}/>
          <button className="pri" onClick={commitAdder}>Add</button>
          <button onClick={()=>setAdder(null)}>Cancel</button>
        </div>}
        {adder && adder.ph && <div className="cmp-ph">This tool is a preview in this prototype — <button onClick={()=>{ addAtt({name:adder.tool,type:'Link'}); }}>add a placeholder</button> or <button onClick={()=>setAdder(null)}>cancel</button>.</div>}
        {atts.length>0 && <div className="cmp-atts">{atts.map(a=><div key={a.id} className="cmp-att" style={{'--rc':cv(RESTYPES[a.type]||'--subj-11')}}>
          <span className="th">{a.type==='Image'&&a.url?<img src={a.url} alt=""/>:a.type==='Video'?'▶':a.type==='Link'?'🔗':a.type==='Slides'?'▦':a.type==='Note'?'✎':'📄'}</span>
          <span className="mid"><i>{a.type}</i><b title={a.name}>{a.name}</b></span>
          <button className="rm" title="Remove" onClick={()=>setAtts(p=>p.filter(x=>x.id!==a.id))}>{XIC}</button>
        </div>)}</div>}
        <div className="cmp-fmt">
          <button title="Bold" onMouseDown={e=>{ e.preventDefault(); exec('bold'); }}><b>B</b></button>
          <button title="Italic" onMouseDown={e=>{ e.preventDefault(); exec('italic'); }}><i>I</i></button>
          <button title="Underline" onMouseDown={e=>{ e.preventDefault(); exec('underline'); }}><u>U</u></button>
          <span className="sep"></span>
          <select title="Text size" onChange={e=>{ exec('formatBlock',e.target.value); e.target.value=''; }}>
            <option value="">Size</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option><option value="p">Body</option></select>
          <select title="Font" onChange={e=>{ if(e.target.value) exec('fontName',e.target.value); e.target.value=''; }}>
            <option value="">Font</option>{FONTS.filter(f=>f[0]).map(f=><option key={f[1]} value={f[0]}>{f[1]}</option>)}</select>
          <span className="sep"></span>
          <span className="swk" title="Highlight">{HILITES.map(c=><button key={c} style={{background:c}} onMouseDown={e=>{ e.preventDefault(); exec('hiliteColor',c); }}></button>)}
            <button className="clr" title="No highlight" onMouseDown={e=>{ e.preventDefault(); exec('hiliteColor','transparent'); }}>⌀</button></span>
          <span className="swk" title="Text color">{TCOLORS.map(c=><button key={c} className="tc" style={{color:c}} onMouseDown={e=>{ e.preventDefault(); exec('foreColor',c); }}>A</button>)}</span>
          <span className="sep"></span>
          <button title="Bulleted list" onMouseDown={e=>{ e.preventDefault(); exec('insertUnorderedList'); }}>•≡</button>
          <button title="Numbered list" onMouseDown={e=>{ e.preventDefault(); exec('insertOrderedList'); }}>1.≡</button>
          <button title="Checklist" onMouseDown={e=>{ e.preventDefault(); exec('insertHTML','<div>☐ </div>'); }}>☐</button>
          <button title="Add link" onMouseDown={e=>{ e.preventDefault(); const u=prompt('Link URL'); if(u) exec('createLink',u); }}>🔗</button>
        </div>
        <div className="cmp-write" ref={bodyRef} contentEditable="true" data-ph="Write something incredible…" suppressContentEditableWarning={true}></div>
      </div>
      <div className="cmp-foot">
        <label className="ff" title="Card background color">
          <span className="dot" style={{background:bg?BGVAL[bg]:'#fff',borderColor:bg?BGVAL[bg]:'var(--phx-chip-border)'}}></span>
          <select value={bg} onChange={e=>setBg(e.target.value)}>{BG.map(b=><option key={b[0]} value={b[0]}>{b[1]}</option>)}</select>
        </label>
        <div className="fmid" title="Where this is filed and which wall column it lands in">
          <span className="sect">§</span>
          {(canUnit&&canLesson)
            ? <select value={fileTo} onChange={e=>setFileTo(e.target.value)}><option value="lesson">{req.lessonTitle||'This lesson'}</option><option value="unit">{req.unitName||'Whole unit'}</option></select>
            : <span className="fixed">{fileTo==='unit'?(req.unitName||'Whole unit'):(req.lessonTitle||req.unitName||'Here')}</span>}
          <span className="arrow">›</span>
          <select value={wall} title="Wall column" onChange={e=>setWall(e.target.value)}>
            {['Resources','Differentiation','Do Now','Homework','Notes','Assessment'].map(w=><option key={w} value={w}>{w}</option>)}
          </select>
        </div>
        <span className="grow"></span>
        <button className="fields" title="Attach structured fields (coming soon)" onClick={()=>actions&&actions.toast&&actions.toast('Fields — coming soon')}>+ Fields</button>
      </div>
      {picker && <div className="cmp-picker">
        <div className="pk-top"><button className="ic" title="Back" onClick={()=>setPicker(false)}>{XIC}</button>
          <input className="pk-search" placeholder="Search web or paste URL" onKeyDown={e=>{ if(e.key==='Enter'&&e.target.value.trim()){ const v=e.target.value.trim(); addAtt({name:v.replace(/^https?:\/\//,'').slice(0,40),type:guessType(v,v),url:/^https?:\/\//.test(v)?v:''}); } }}/></div>
        <div className="pk-grid">
          {TOOLGROUPS.map((g,gi)=><div key={gi} className={'pk-grp '+g.tone}>
            {g.items.map(([lab,tool,real])=><button key={tool} className={'pk-tile'+(real?' real':'')} title={real?lab:(lab+' — preview only in this prototype')} onClick={()=>runTool(tool,real)}>
              <span className="ti">{TOOLICON[tool]||'▦'}</span><span className="tl">{lab}</span>{!real&&<em className="soon">preview</em>}</button>)}
          </div>)}
        </div>
      </div>}
    </div>
  </React.Fragment>;
}
window.PHComposer=Composer;

/* Shared resource action menu — window.openResMenu({res,x,y,edit,remove}).
   Mount <window.PHResMenu/> once per React tree (next to PHComposer). */
function ResMenu(){
  const [m,setM]=useState(null);
  useEffect(()=>{ window.openResMenu=(o)=>setM(o||null); return ()=>{ window.openResMenu=null; }; },[]);
  if(!m) return null;
  const r=m.res||{}; const close=()=>setM(null);
  const isNote=r.type==='Note'&&!r.url;
  return <React.Fragment>
    <div className="ph-rmenu-scrim" onClick={close} onContextMenu={e=>{ e.preventDefault(); close(); }}></div>
    <div className="ph-rmenu" style={{left:Math.min(m.x,(window.innerWidth||1200)-224)+'px',top:Math.min(m.y,(window.innerHeight||800)-234)+'px','--rc':cv(RESTYPES[r.type]||'--subj-11')}}>
      <div className="rm-head"><i>{r.type||'Link'}</i><b title={r.name}>{r.name||'Resource'}</b></div>
      <button onClick={()=>{ close(); if(r.url) window.open(r.url,'_blank','noopener'); else if(m.edit) m.edit(); }}>{isNote?'View note':'Open resource'}</button>
      <button disabled={!r.url} onClick={()=>{ close(); if(r.url) window.open(r.url,'_blank','noopener'); }}>Open in new tab ↗</button>
      {r.url && <button onClick={()=>{ try{ navigator.clipboard.writeText(r.url); }catch(e){} close(); }}>Copy link</button>}
      {m.edit && <button onClick={()=>{ close(); m.edit(); }}>Edit resource / note</button>}
      {m.remove && <button className="dngr" onClick={()=>{ close(); m.remove(); }}>Remove</button>}
    </div>
  </React.Fragment>;
}
window.PHResMenu=ResMenu;
})();
