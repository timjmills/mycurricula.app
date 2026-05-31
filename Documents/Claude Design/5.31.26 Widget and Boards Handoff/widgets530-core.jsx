// widgets530-core.jsx — shared chrome, icon set, primitives
// Lucide-style line icons (stroke=currentColor) used for widget chrome + accents.

const I = (() => {
  const S = (p, kids) => (
    <svg width={p.s || 20} height={p.s || 20} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={p.sw || 2} strokeLinecap="round" strokeLinejoin="round"
      style={p.style}>{kids}</svg>
  );
  return {
    menu:  (p={}) => S(p, <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>),
    pin:   (p={}) => S(p, <><path d="M12 17v5"/><path d="M9 10.76V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6.76a2 2 0 0 0 .54 1.36l1.1 1.18A2 2 0 0 1 18 14.7V16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-1.3a2 2 0 0 1 .36-1.4l1.1-1.18A2 2 0 0 0 9 10.76Z"/></>),
    expand:(p={}) => S(p, <><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></>),
    sun:   (p={}) => S(p, <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>),
    moreH: (p={}) => S(p, <><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></>),
    moreV: (p={}) => S(p, <><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></>),
    x:     (p={}) => S(p, <><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></>),
    chevD: (p={}) => S(p, <polyline points="6 9 12 15 18 9"/>),
    arrowL:(p={}) => S(p, <><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></>),
    headph:(p={}) => S(p, <path d="M3 14v-2a9 9 0 0 1 18 0v2M3 14a3 3 0 0 0 3 3v-6a3 3 0 0 0-3 3Zm18 0a3 3 0 0 1-3 3v-6a3 3 0 0 1 3 3Z"/>),
    volMute:(p={}) => S(p, <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/></>),
    vol1:  (p={}) => S(p, <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></>),
    vol2:  (p={}) => S(p, <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12"/></>),
    users: (p={}) => S(p, <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>),
    user:  (p={}) => S(p, <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>),
    hand:  (p={}) => S(p, <path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2M14 10V4a2 2 0 0 0-2-2 2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>),
    handPt:(p={}) => S(p, <path d="M7 11.5V6a2 2 0 0 1 4 0v4M11 10V4.5a2 2 0 0 1 4 0V10M15 10.5V7a2 2 0 0 1 4 0v8a7 7 0 0 1-7 7h-1.5a6.5 6.5 0 0 1-4.6-1.9l-3.7-3.7a2 2 0 0 1 2.8-2.8L7 13.5"/>),
    mic:   (p={}) => S(p, <><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8"/></>),
    trophy:(p={}) => S(p, <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z"/></>),
    cube:  (p={}) => S(p, <><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>),
    refresh:(p={}) => S(p, <><path d="M3 2v6h6M21 12a9 9 0 0 1-15 6.7L3 16M21 22v-6h-6M3 12a9 9 0 0 1 15-6.7L21 8"/></>),
    plus:  (p={}) => S(p, <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>),
    minus: (p={}) => S(p, <line x1="5" y1="12" x2="19" y2="12"/>),
    msg:   (p={}) => S(p, <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/>),
    bars:  (p={}) => S(p, <><line x1="6" y1="20" x2="6" y2="13"/><line x1="12" y1="20" x2="12" y2="8"/><line x1="18" y1="20" x2="18" y2="11"/></>),
    grid:  (p={}) => S(p, <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>),
    gear:  (p={}) => S(p, <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></>),
    play:  (p={}) => S(p, <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/>),
    undo:  (p={}) => S(p, <><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></>),
    redo:  (p={}) => S(p, <><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/></>),
    clock: (p={}) => S(p, <><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 13.5"/></>),
    grip:  (p={}) => S(p, <><circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none"/></>),
    check: (p={}) => S(p, <polyline points="20 6 9 17 4 12"/>),
    pencil:(p={}) => S(p, <><path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><line x1="15" y1="5" x2="19" y2="9"/></>),
    droplet:(p={}) => S(p, <path d="M12 2.7 6.3 8.4a8 8 0 1 0 11.4 0Z"/>),
    image: (p={}) => S(p, <><rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="8.5" cy="8.5" r="1.6"/><polyline points="21 15 16 10 5 21"/></>),
    ban:   (p={}) => S(p, <><circle cx="12" cy="12" r="9"/><line x1="5.6" y1="5.6" x2="18.4" y2="18.4"/></>),
    alert: (p={}) => S(p, <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></>),
    lock:  (p={}) => S(p, <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>),
    pinLoc:(p={}) => S(p, <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z"/><circle cx="12" cy="10" r="3"/></>),
    list:  (p={}) => S(p, <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none"/></>),
    spark: (p={}) => S(p, <path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6Z"/>),
    gamepad:(p={}) => S(p, <><line x1="6" y1="11" x2="10" y2="11"/><line x1="8" y1="9" x2="8" y2="13"/><line x1="15" y1="12" x2="15.01" y2="12"/><line x1="18" y1="10" x2="18.01" y2="10"/><rect x="2" y="6" width="20" height="12" rx="5"/></>),
    star:  (p={}) => S(p, <path d="M12 2.5l2.9 6.06 6.6.92-4.8 4.62 1.16 6.55L12 18.1 6.14 20.65 7.3 14.1 2.5 9.48l6.6-.92Z"/>),
    book:  (p={}) => S(p, <><path d="M12 7c-1.6-1.3-3.7-2-6.2-2H3v13h2.8c2.5 0 4.6.7 6.2 2 1.6-1.3 3.7-2 6.2-2H21V5h-2.8c-2.5 0-4.6.7-6.2 2Z"/><line x1="12" y1="7" x2="12" y2="20"/></>),
    plusCirc:(p={}) => S(p, <><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></>),
    share: (p={}) => S(p, <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></>),
    search:(p={}) => S(p, <><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>),
    target:(p={}) => S(p, <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/></>),
    bell:  (p={}) => S(p, <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></>),
    chair: (p={}) => S(p, <><path d="M6 19v-3h12v3M6 16V4h2v6h8V4h2v12M6 10h12M8 19v2M16 19v2"/></>),
    backpack:(p={}) => S(p, <><path d="M5 10a7 7 0 0 1 14 0v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z"/><path d="M9 7a3 3 0 0 1 6 0M8 21v-7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v7M9 13h6"/></>),
    mega:  (p={}) => S(p, <><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12"/></>),
    pause: (p={}) => S(p, <><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/></>),
    heart: (p={}) => S(p, <path d="M19.5 5.5a5 5 0 0 0-7.5.6 5 5 0 0 0-7.5-.6 5.2 5.2 0 0 0 0 7.3L12 20l7.5-7.2a5.2 5.2 0 0 0 0-7.3Z"/>),
    wrench:(p={}) => S(p, <path d="M14.7 6.3a4 4 0 0 0 5 5l-9.9 9.9a2.1 2.1 0 0 1-3-3l9.9-9.9a4 4 0 0 0-1.9-1.9 4 4 0 0 1 5 5"/>),
    beaker:(p={}) => S(p, <><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><line x1="7" y1="14" x2="17" y2="14"/></>),
    calc:  (p={}) => S(p, <><rect x="5" y="3" width="14" height="18" rx="2"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="8.01" y2="11"/><line x1="12" y1="11" x2="12.01" y2="11"/><line x1="16" y1="11" x2="16.01" y2="11"/><line x1="8" y1="15" x2="8.01" y2="15"/><line x1="12" y1="15" x2="12.01" y2="15"/><line x1="16" y1="15" x2="16.01" y2="15"/></>),
    clipChk:(p={}) => S(p, <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a3 3 0 0 1 6 0"/><polyline points="9 13 11 15 15 11"/></>),
    ticket:(p={}) => S(p, <><path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4Z"/><path d="M11 6v12" strokeDasharray="2 2"/></>),
    puzzle:(p={}) => S(p, <path d="M9 4a2 2 0 0 1 4 0c0 .7.5 1 1 1h3v3c0 .5.3 1 1 1a2 2 0 0 1 0 4c-.7 0-1 .5-1 1v3h-3c-.5 0-1 .3-1 1a2 2 0 0 1-4 0c0-.7-.5-1-1-1H4v-3c0-.5-.3-1-1-1a2 2 0 0 1 0-4c.7 0 1-.5 1-1V5h3c.5 0 1-.3 1-1Z"/>),
    scale: (p={}) => S(p, <><line x1="12" y1="4" x2="12" y2="21"/><line x1="7" y1="21" x2="17" y2="21"/><path d="M5 7h14M5 7l-3 6a3 3 0 0 0 6 0Zm14 0-3 6a3 3 0 0 0 6 0Z"/><path d="M12 4 7 7M12 4l5 3"/></>),
    bulb:  (p={}) => S(p, <><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.3 1 2.5h6c0-1.2.2-1.7 1-2.5A6 6 0 0 0 12 3Z"/></>),
    marker:(p={}) => S(p, <><path d="M15 3l6 6-9.5 9.5-6 1.5 1.5-6Z"/><line x1="13" y1="5" x2="19" y2="11"/></>),
    eraser:(p={}) => S(p, <><path d="M8 20H4l-.7-.7a2 2 0 0 1 0-2.8L14 6.3a2 2 0 0 1 2.8 0l3.9 3.9a2 2 0 0 1 0 2.8L13 20Z"/><line x1="8" y1="20" x2="20" y2="20"/></>),
    easel: (p={}) => S(p, <><rect x="4" y="3" width="16" height="11" rx="1.5"/><path d="M12 14v3M8 21l4-4 4 4"/></>),
    flag:  (p={}) => S(p, <><path d="M5 21V4M5 4h11l-1.5 3L16 10H5"/></>),
    boxIco:(p={}) => S(p, <><path d="M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="M3 8l9 5 9-5M12 13v8"/></>),
    laptop:(p={}) => S(p, <><rect x="4" y="5" width="16" height="11" rx="1.5"/><line x1="2" y1="20" x2="22" y2="20"/></>),
    gift:  (p={}) => S(p, <><rect x="4" y="9" width="16" height="12" rx="1.5"/><line x1="12" y1="9" x2="12" y2="21"/><path d="M3 9h18M12 9S10 3 7.5 4.5 9.5 9 12 9Zm0 0s2-6 4.5-4.5S14.5 9 12 9Z"/></>),
    note:  (p={}) => S(p, <><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="13" y2="16"/></>),
    download:(p={}) => S(p, <><path d="M12 3v12"/><polyline points="7 11 12 16 17 11"/><path d="M4 20h16"/></>),
    external:(p={}) => S(p, <><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/></>),
    trash: (p={}) => S(p, <><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>),
    figure:(p={}) => S(p, <><circle cx="12" cy="5" r="2.2"/><path d="M12 8v6M12 14l-3 6M12 14l3 6M6 10l6-1 6 1"/></>),
    lotus: (p={}) => S(p, <><path d="M12 20c-4-1.2-7-4.2-7-8.2 2 0 4.2 1 7 4 2.8-3 5-4 7-4 0 4-3 7-7 8.2Z"/><path d="M12 20c-2.2-2-3.4-5-3.4-8.8 1.6 1 3.4 3.2 3.4 6 0-2.8 1.8-5 3.4-6 0 3.8-1.2 6.8-3.4 8.8Z"/></>),
    arrowR:(p={}) => S(p, <><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></>),
    chevR: (p={}) => S(p, <polyline points="9 6 15 12 9 18"/>),
    chevL: (p={}) => S(p, <polyline points="15 6 9 12 15 18"/>),
    headset:(p={}) => S(p, <><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14a2 2 0 0 1 2-2h1v5H6a2 2 0 0 1-2-2Zm16 0a2 2 0 0 0-2-2h-1v5h1a2 2 0 0 0 2-2Z"/><path d="M18 17v1a3 3 0 0 1-3 3h-3"/></>),
    copy:  (p={}) => S(p, <><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>),
    shareUp:(p={}) => S(p, <><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><polyline points="8 7 12 3 16 7"/><line x1="12" y1="3" x2="12" y2="15"/></>),
    folder:(p={}) => S(p, <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>),
    archive:(p={}) => S(p, <><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><line x1="10" y1="12" x2="14" y2="12"/></>),
    calDay:(p={}) => S(p, <><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/><circle cx="12" cy="15" r="2" fill="currentColor" stroke="none"/></>),
    calWeek:(p={}) => S(p, <><rect x="3" y="4" width="18" height="17" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="7" y1="14" x2="17" y2="14"/></>),
    scribble:(p={}) => S(p, <path d="M3 14c2-4 3-1 5-3s1-5 3-5 1 6 3 6 2-4 4-3"/>),
    info:  (p={}) => S(p, <><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/></>),
    school:(p={}) => S(p, <><path d="M3 21h18M5 21V9l7-4 7 4v12M9 21v-5h6v5"/><line x1="12" y1="2" x2="12" y2="5"/><path d="M12 3l3 1-3 1"/></>),
    leaf:  (p={}) => S(p, <path d="M11 20A7 7 0 0 1 4 13c0-5 5-9 16-9 0 11-4 16-9 16ZM4 20c4-7 8-9 12-10"/>),
    cloud: (p={}) => S(p, <path d="M6 18a4 4 0 0 1-.6-7.96 5.5 5.5 0 0 1 10.8-.54A3.5 3.5 0 0 1 18 18Z"/>),
  };
})();

// pips layout for dice faces 1-6
const DIE_PIPS = {
  1:[[1,1]], 2:[[0,0],[2,2]], 3:[[0,0],[1,1],[2,2]],
  4:[[0,0],[0,2],[2,0],[2,2]], 5:[[0,0],[0,2],[1,1],[2,0],[2,2]],
  6:[[0,0],[0,2],[1,0],[1,2],[2,0],[2,2]],
};
function DieFace({ value, size = 78, color = "#101729" }) {
  const cells = DIE_PIPS[value] || [];
  const r = size * 0.10;
  const pad = size * 0.22;
  const span = size - pad * 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {cells.map(([row, col], i) => (
        <circle key={i} cx={pad + (col/2)*span} cy={pad + (row/2)*span} r={r} fill={color} />
      ))}
    </svg>
  );
}

// ── Widget chrome (top-right control row) ──────────────────────
function Chrome({ items = ["pin","expand","sun","more","x"], dense }) {
  const map = { pin:I.pin, expand:I.expand, sun:I.sun, more:I.moreV, moreH:I.moreH, x:I.x };
  return (
    <div className="w-chrome">
      {items.map((k,i) => {
        const Ico = map[k];
        return <button key={i} tabIndex={-1} aria-hidden="true">{Ico({ s: dense ? 16 : 17, sw: 2 })}</button>;
      })}
    </div>
  );
}

// colored icon chip
function Chip({ family, children }) {
  return (
    <span className="w-chip" style={{ background:`var(--${family}-chip)`, color:`var(--${family}-accent)` }}>
      {children}
    </span>
  );
}

Object.assign(window, { I, DieFace, Chrome, Chip });
