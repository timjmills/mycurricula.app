/* Share links — a reusable icon button that mints + copies a read-only share
   link for any artifact, and a read-only viewer the link opens into.
   window.Share.Btn({ kind, id, label })  · window.Share.openFromUrl() */
(function(){
const { useState } = React;

const ICON = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>;
const CHECK = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 6"/></svg>;

function mintLink(kind, id, label){
  const tok = btoa(unescape(encodeURIComponent(JSON.stringify({k:kind,id:id||'',t:label||''})))).replace(/=+$/,'');
  const base = location.origin + location.pathname;
  return base + '?share=' + tok;
}

function ShareBtn({ kind, id, label, size, bare }){
  const [done,setDone]=useState(false);
  const copy=(e)=>{
    if(e){ e.stopPropagation(); e.preventDefault(); }
    const url=mintLink(kind,id,label);
    const ok=()=>{ setDone(true); setTimeout(()=>setDone(false),1600); };
    try{
      if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(url).then(ok,ok); }
      else { const ta=document.createElement('textarea'); ta.value=url; ta.style.position='fixed'; ta.style.opacity='0'; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy');}catch(x){} document.body.removeChild(ta); ok(); }
    }catch(x){ ok(); }
  };
  return (
    <button className={'share-btn'+(bare?' bare':'')+(done?' done':'')} style={size?{width:size,height:size}:null}
      title={done?'Link copied ✓':('Copy read-only share link'+(label?(' · '+label):''))}
      onClick={copy}>{done?CHECK:ICON}</button>
  );
}

/* read-only viewer (opens when the page is loaded with ?share=…) */
function decode(tok){ try{ return JSON.parse(decodeURIComponent(escape(atob(tok)))); }catch(e){ return null; } }
const KIND_LABEL={resource:'Resource',section:'Section',wall:'Resource Wall',lesson:'Lesson',unit:'Unit',subject:'Subject',board:'Teaching Board'};

function Viewer({ data, onClose }){
  const kindLabel=KIND_LABEL[data.k]||'Shared item';
  return (
    <div className="share-view">
      <div className="share-vbar">
        <span className="share-vkind">{kindLabel} · read-only</span>
        <span className="share-vtitle">{data.t||'Shared '+kindLabel}</span>
        <div className="share-vacts">
          <button onClick={()=>window.print()} title="Print">Print</button>
          <button onClick={onClose} title="Close read-only view">Open full app</button>
        </div>
      </div>
      <div className="share-vbody">
        <div className="share-vcard">
          <div className="share-vicon">{KIND_LABEL[data.k]?KIND_LABEL[data.k][0]:'?'}</div>
          <h1>{data.t||'Shared '+kindLabel}</h1>
          <p>This is a read-only copy of a {kindLabel.toLowerCase()} shared from mycurricula. You can read it, and open, download, or print its resources.</p>
          <div className="share-vres">
            {['Slides','Worksheet','Anchor Chart','Exit Ticket','Read-Aloud'].map((r,i)=>(
              <div key={i} className="share-vresrow">
                <span className="share-vrespill">{['SL','WS','IM','DOC','VID'][i]}</span>
                <span className="share-vreslabel">{r}</span>
                <span className="share-vresacts"><button>Open</button><button>Download</button><button onClick={()=>window.print()}>Print</button></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

window.Share = {
  Btn: ShareBtn,
  mintLink,
  getShared(){ const m=/[?&]share=([^&]+)/.exec(location.search); return m?decode(m[1]):null; },
  Viewer,
};
})();
