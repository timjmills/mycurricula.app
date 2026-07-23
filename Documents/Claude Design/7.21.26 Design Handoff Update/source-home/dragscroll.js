/* dragscroll.js — pan any overflow region by click-dragging it (no scrollbars).
   Skips real controls so clicks, drawing, HTML5-drag, and text editing still work. */
(function(){
  var SKIP = 'button, a, input, textarea, select, canvas, [contenteditable], [draggable="true"], .board-card, .lesson-menu, .twk-panel, .slide-thumb, .lp-res-item, .pl-tab, .view, .nav-item, .teach-resizer';
  function scrollable(el){
    while(el && el !== document.body && el.nodeType === 1){
      var cs = getComputedStyle(el);
      var ox = /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth  > el.clientWidth  + 2;
      var oy = /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 2;
      if(ox || oy) return { el:el, ox:ox, oy:oy };
      el = el.parentElement;
    }
    return null;
  }
  var drag = null;
  document.addEventListener('mousedown', function(e){
    if(e.button !== 0) return;
    if(e.target.closest && e.target.closest(SKIP)) return;
    var s = scrollable(e.target);
    if(!s) return;
    drag = { s:s, x:e.clientX, y:e.clientY, sl:s.el.scrollLeft, st:s.el.scrollTop, moved:false };
  });
  document.addEventListener('mousemove', function(e){
    if(!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if(!drag.moved && Math.abs(dx) + Math.abs(dy) > 5){ drag.moved = true; document.body.style.cursor = 'grabbing'; document.body.style.userSelect = 'none'; }
    if(drag.moved){
      if(drag.s.ox) drag.s.el.scrollLeft = drag.sl - dx;
      if(drag.s.oy) drag.s.el.scrollTop  = drag.st - dy;
      e.preventDefault();
    }
  });
  document.addEventListener('mouseup', function(){
    if(!drag) return;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if(drag.moved){
      // swallow the click that follows a drag so it doesn't open a menu / select
      var cap = function(ev){ ev.stopPropagation(); ev.preventDefault(); document.removeEventListener('click', cap, true); };
      document.addEventListener('click', cap, true);
      setTimeout(function(){ document.removeEventListener('click', cap, true); }, 0);
    }
    drag = null;
  });
})();
