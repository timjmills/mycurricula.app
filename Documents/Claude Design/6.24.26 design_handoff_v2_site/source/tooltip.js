/* Global styled tooltips — replaces native title= bubbles app-wide.
   On hover/focus of any [title] (or [data-tip]) element, shows a styled
   glass bubble and suppresses the browser's default tooltip. */
(function(){
  var tip=document.createElement('div');
  tip.className='app-tip'; tip.setAttribute('role','tooltip');
  var ready=false;
  function mount(){ if(!ready){ document.body.appendChild(tip); ready=true; } }
  var cur=null;

  function show(el){
    var txt=el.getAttribute('data-tip');
    if(!txt){ txt=el.getAttribute('title'); if(txt){ el.setAttribute('data-tip',txt); el.removeAttribute('title'); } }
    if(!txt) return;
    mount(); cur=el;
    tip.textContent=txt; tip.classList.add('on');
    position(el);
  }
  function position(el){
    var r=el.getBoundingClientRect();
    var tr=tip.getBoundingClientRect();
    var x=r.left+r.width/2-tr.width/2;
    var y=r.top-tr.height-9;
    var below=false;
    if(y<6){ y=r.bottom+9; below=true; }
    x=Math.max(8,Math.min(window.innerWidth-tr.width-8,x));
    tip.style.left=x+'px'; tip.style.top=y+'px';
    tip.setAttribute('data-below',below?'1':'0');
  }
  function hide(){ tip.classList.remove('on'); cur=null; }

  document.addEventListener('mouseover',function(e){
    var el=e.target.closest&&e.target.closest('[title],[data-tip]');
    if(el&&el!==cur) show(el);
  });
  document.addEventListener('mouseout',function(e){
    if(!cur) return;
    var to=e.relatedTarget;
    if(!to||!cur.contains(to)){ if(!(to&&to.closest&&to.closest('[title],[data-tip]')===cur)) hide(); }
  });
  document.addEventListener('focusin',function(e){
    var el=e.target.closest&&e.target.closest('[title],[data-tip]');
    if(el) show(el);
  });
  document.addEventListener('focusout',hide);
  document.addEventListener('click',hide,true);
  window.addEventListener('scroll',function(){ if(cur) position(cur); },true);
})();
