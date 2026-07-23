/* Shared curriculum data + live status — Awsaj Academy · Grade 5.
   Plain JS (loads before the Babel view modules). Exposes window.DS. */
(function(){

  // 8 locked subjects → brand subject-color scale
  const SUBJECTS = {
    ufli:      { label:'UFLI',      full:'UFLI Foundations', c:'--subj-2',  tint:'--subj-2-tint',  ink:'--subj-2-ink'  },
    reading:   { label:'Reading',   full:'Reading',          c:'--subj-10', tint:'--subj-10-tint', ink:'--subj-10-ink' },
    math:      { label:'Math',      full:'Math',             c:'--subj-1',  tint:'--subj-1-tint',  ink:'--subj-1-ink'  },
    writing:   { label:'Writing',   full:'Writing',          c:'--subj-5',  tint:'--subj-5-tint',  ink:'--subj-5-ink'  },
    grammar:   { label:'Grammar',   full:'Grammar',          c:'--subj-7',  tint:'--subj-7-tint',  ink:'--subj-7-ink'  },
    spelling:  { label:'Spelling',  full:'Spelling',         c:'--subj-9',  tint:'--subj-9-tint',  ink:'--subj-9-ink'  },
    explorers: { label:'Explorers', full:'Explorers',        c:'--subj-13', tint:'--subj-13-tint', ink:'--subj-13-ink' },
    sel:       { label:'SEL',       full:'SEL',              c:'--subj-12', tint:'--subj-12-tint', ink:'--subj-12-ink' },
  };

  const PERIODS = [
    { label:'Period 1', start:'08:00', end:'08:45' },
    { label:'Period 2', start:'08:50', end:'09:35' },
    { label:'Period 3', start:'09:40', end:'10:25' },
    { label:'Period 4', start:'10:45', end:'11:30' },
    { label:'Period 5', start:'11:35', end:'12:20' },
    { label:'Period 6', start:'13:10', end:'13:55' },
  ];

  const DAYS = [
    { key:'sun', name:'Sunday',    short:'Sun', date:'Jun 14' },
    { key:'mon', name:'Monday',    short:'Mon', date:'Jun 15' },
    { key:'tue', name:'Tuesday',   short:'Tue', date:'Jun 16' },
    { key:'wed', name:'Wednesday', short:'Wed', date:'Jun 17' },
    { key:'thu', name:'Thursday',  short:'Thu', date:'Jun 18' },
  ];

  // which subject meets each period, per day
  const PLAN = {
    sun:['ufli','reading','math','writing','explorers','sel'],
    mon:['ufli','reading','math','grammar','explorers','sel'],
    tue:['ufli','reading','math','writing','explorers','sel'],
    wed:['ufli','reading','math','spelling','explorers','sel'],
    thu:['ufli','reading','math','writing','explorers','sel'],
  };

  // lesson pools per subject — progress across the week
  const POOL = {
    math:     { unit:'Unit 3 · Multiplication & Division', std:'4.NBT.5', items:[
      {t:'Model 2-Digit Multiplication', o:'I can model 2-digit × 1-digit using area models.'},
      {t:'Partial Products Strategy',    o:'I can multiply using partial products.'},
      {t:'Area Model Multiplication',    o:'I can use an area model to multiply 2-digit numbers.'},
      {t:'Solve with the Algorithm',     o:'I can multiply using the standard algorithm.'},
      {t:'Practice & Exit Ticket',       o:'I can multiply 2-digit numbers fluently.'} ]},
    reading:  { unit:'Unit 4 · Inference', std:'RL.4.1', items:[
      {t:'Making Inferences',     o:'I can infer meaning from clues in the text.'},
      {t:'Citing Text Evidence',  o:'I can support an inference with text evidence.'},
      {t:'Character Motivation',  o:'I can infer why a character acts as they do.'},
      {t:'Theme & Inference',     o:'I can infer a theme across a passage.'},
      {t:'Inference Quiz',        o:'I can apply inference skills independently.'} ]},
    ufli:     { unit:'Foundations · Vowel Teams', std:'RF.4.3', items:[
      {t:'Vowel Team /ai/ · ay',  o:'I can read and spell words with ai / ay.'},
      {t:'Vowel Team /ee/ · ea',  o:'I can read and spell words with ee / ea.'},
      {t:'Vowel Team /oa/ · ow',  o:'I can read and spell words with oa / ow.'},
      {t:'Diphthongs oi / oy',    o:'I can read and spell words with oi / oy.'},
      {t:'Review & Dictation',    o:'I can apply vowel-team patterns in dictation.'} ]},
    writing:  { unit:'Unit 4 · Narrative', std:'W.4.3', items:[
      {t:'Crafting the Lead',  o:'I can write a lead that hooks the reader.'},
      {t:'Show, Don\u2019t Tell', o:'I can show feelings through action and detail.'},
      {t:'Revising for Voice', o:'I can revise a draft to strengthen voice.'} ]},
    grammar:  { unit:'Unit 2 · Clauses', std:'L.4.1', items:[
      {t:'Independent & Dependent Clauses', o:'I can identify independent and dependent clauses.'} ]},
    spelling: { unit:'Pattern · Vowel Teams', std:'L.4.2', items:[
      {t:'Vowel-Team Spelling List 12', o:'I can spell this week\u2019s vowel-team words.'} ]},
    explorers:{ unit:'Unit 3 · Energy & Motion', std:'4-PS3', items:[
      {t:'Forms of Energy',       o:'I can identify forms of energy around me.'},
      {t:'Potential vs. Kinetic', o:'I can distinguish potential and kinetic energy.'},
      {t:'Energy Transfer',       o:'I can explain how energy transfers between objects.'},
      {t:'Build a Roller Coaster',o:'I can design a model showing energy transfer.'},
      {t:'Energy in Our World',   o:'I can connect energy concepts to real life.'} ]},
    sel:      { unit:'Self-Awareness', std:'CASEL', items:[
      {t:'Naming Emotions',     o:'I can name what I feel and why.'},
      {t:'Calm-Down Strategies',o:'I can use a strategy to regulate big feelings.'},
      {t:'Empathy Circle',      o:'I can listen and respond with empathy.'},
      {t:'Growth Mindset',      o:'I can reframe a setback as a chance to grow.'},
      {t:'Weekly Reflection',   o:'I can reflect on my week and set a goal.'} ]},
  };

  // build the static week (lessons aligned to periods), stable lesson ids
  function buildWeek(){
    const counters = {};
    return DAYS.map((day, di) => {
      const lessons = PLAN[day.key].map((sid, pi) => {
        const pool = POOL[sid];
        const n = counters[sid] = (counters[sid] || 0);
        counters[sid]++;
        const item = pool.items[n % pool.items.length];
        return {
          id: `${day.key}-${pi}`,
          dayIdx: di, periodIdx: pi,
          subjectId: sid,
          unit: pool.unit, std: pool.std,
          title: item.t, objective: item.o,
          start: PERIODS[pi].start, end: PERIODS[pi].end,
          room: ['Rm 5A','Rm 5A','Rm 5A','Library','Lab 2','Rm 5A'][pi],
        };
      });
      return { ...day, lessons };
    });
  }
  const WEEK = buildWeek();

  const toMin = (hhmm)=>{ const [h,m]=hhmm.split(':').map(Number); return h*60+m; };
  const fmt = (hhmm)=>{ let [h,m]=hhmm.split(':').map(Number); const ap=h>=12?'PM':'AM'; h=h%12||12; return `${h}:${String(m).padStart(2,'0')} ${ap}`; };

  // live status across the week, plus now / next refs
  function getState(now){
    const dow = now.getDay();                 // Sun=0 … Thu=4
    const todayIdx = (dow>=0 && dow<=4) ? dow : 0;
    const cur = now.getHours()*60 + now.getMinutes();
    let current=null, next=null;

    const days = WEEK.map((day, di)=>{
      const lessons = day.lessons.map(L=>{
        let status='idle';
        if(di < todayIdx) status='done';
        else if(di > todayIdx) status='idle';
        else { // today
          if(cur >= toMin(L.end)) status='done';
          else if(cur >= toMin(L.start)) status='now';
          else status='upcoming';
        }
        const ov = (function(){ try{ return localStorage.getItem('cc_title_'+L.id); }catch(e){ return null; } })();
        const out = { ...L, title: ov || L.title, status };
        if(status==='now') current = out;
        if(status==='upcoming' && !next && di===todayIdx) next = out;
        return out;
      });
      return { ...day, dayIdx:di, lessons };
    });
    if(!current && !next){ // before/after school → first upcoming today, else Sunday P1
      const today = days[todayIdx];
      next = today.lessons.find(l=>l.status==='upcoming') || days[0].lessons[0];
    }
    // chronological remaining lessons from "now" (today's now+upcoming, then future days)
    const remaining = [];
    for(let di=0; di<days.length; di++){
      for(const L of days[di].lessons){
        if(di > todayIdx || (di === todayIdx && L.status !== 'done')) remaining.push(L);
      }
    }
    return { days, todayIdx, current, next, remaining, now };
  }

  // year roadmap — per subject, sequence of units with progress
  const ROADMAP = {
    math:      [['Place Value',1],['Addition & Subtraction',1],['Multiplication & Division',0.55],['Fractions',0],['Measurement',0],['Geometry',0]],
    reading:   [['Building Readers',1],['Character & Setting',1],['Main Idea',1],['Inference',0.4],['Fact & Opinion',0],['Summarizing',0]],
    ufli:      [['Closed Syllables',1],['Open Syllables',1],['Vowel Teams',0.5],['R-Controlled',0],['Suffixes',0],['Prefixes',0]],
    writing:   [['Personal Essay',1],['Opinion',1],['Informative',0.7],['Narrative',0.3],['Poetry',0],['Research',0]],
    grammar:   [['Nouns & Verbs',1],['Clauses',0.6],['Punctuation',0],['Modifiers',0],['Agreement',0],['Conventions',0]],
    spelling:  [['Short Vowels',1],['Long Vowels',1],['Vowel Teams',0.6],['R-Controlled',0],['Plurals',0],['Affixes',0]],
    explorers: [['Life Cycles',1],['Habitats',1],['Energy & Motion',0.5],['Forces',0],['Weather',0],['Earth Systems',0]],
    sel:       [['Belonging',1],['Self-Awareness',0.6],['Self-Management',0],['Relationships',0],['Decisions',0],['Community',0]],
  };
  const MONTHS = ['Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun'];

  // resources — sample attachments per lesson (shared by planner + teach board)
  const RESTYPES = { Slides:'--subj-1', Worksheet:'--subj-10', Image:'--subj-13', Doc:'--subj-7', Video:'--subj-3', Link:'--subj-11' };
  function typeFromUrl(u){
    u=(u||'').toLowerCase();
    if(/\.(png|jpe?g|gif|webp|svg)$/.test(u)||u.includes('photos/')) return 'Image';
    if(u.includes('youtube')||u.includes('vimeo')||/\.(mp4|mov)$/.test(u)) return 'Video';
    if(u.includes('presentation')||u.includes('slides')) return 'Slides';
    if(u.includes('document')||u.includes('/doc')) return 'Doc';
    return 'Link';
  }
  function customRes(id){ try{ return JSON.parse(localStorage.getItem('cc_res_'+id))||[]; }catch(e){ return []; } }
  function addCustomRes(id,r){ const a=customRes(id); a.push(r); try{ localStorage.setItem('cc_res_'+id,JSON.stringify(a)); }catch(e){} return a; }
  function removeCustomRes(id,rid){ const a=customRes(id).filter(r=>r.id!==rid); try{ localStorage.setItem('cc_res_'+id,JSON.stringify(a)); }catch(e){} return a; }
  function resourcesFor(lesson){
    const sl = lesson.title.replace(/\s+/g,'-').toLowerCase();
    const base = [
      { id:lesson.id+'-r1', label:lesson.title+' — Slides', type:'Slides',    url:'https://docs.google.com/presentation/d/'+sl },
      { id:lesson.id+'-r2', label:'Practice Worksheet',      type:'Worksheet', url:'https://drive.google.com/file/worksheet-'+sl },
      { id:lesson.id+'-r3', label:'Anchor Chart',            type:'Image',     url:'photos/p2.png' },
      { id:lesson.id+'-r4', label:'Exit Ticket',             type:'Doc',       url:'https://docs.google.com/document/exit-'+sl },
      { id:lesson.id+'-r5', label:'Read-Aloud Video',        type:'Video',     url:'https://youtube.com/watch?v='+sl },
    ];
    // lesson tags — most belong to this lesson; some are shared across two (multi-tag)
    const here={ id:lesson.id, title:lesson.title };
    const shared={ id:'sh-sel', title:'SEL · Naming Emotions' };
    base.forEach((r,i)=>{ r.lessons = (i===0||i===2) && lesson.subjectId!=='sel' ? [here, shared] : [here]; });
    return [...base, ...customRes(lesson.id)];
  }

  // ── unit detail (for the Unit Explorer) ──
  function unitDetail(sid, uname, progress){
    const s=SUBJECTS[sid], pool=POOL[sid]||{items:[],std:'STD'};
    const total=6;
    const taughtN=Math.round((progress||0)*total);
    const baseStd=pool.std||'STD';
    const titles=['Introduce & Explore','Model the Strategy','Guided Practice','Apply Independently','Extend & Connect','Assess & Reflect'];
    const reasons=['Bumped — snow day','Moved to catch-up','Ran short on time'];
    const dates=['Jun 2','Jun 4','Jun 9','Jun 11','Jun 16','Jun 18'];
    const lessons=[];
    for(let i=0;i<total;i++){
      const taught=i<taughtN;
      lessons.push({
        id:sid+'-u-'+i, subjectId:sid, unit:uname,
        title:titles[i]+' · '+uname.split(' ').slice(-1)[0],
        objective:'I can '+['identify','model','practice','apply','extend','demonstrate'][i]+' the key skill of this unit.',
        std:baseStd+'.'+String.fromCharCode(97+(i%4)),
        start:'09:40', end:'10:25', room:'Rm 5A',
        taught, date:taught?dates[i]:null, reason:taught?null:reasons[i%3],
      });
    }
    const stds=[baseStd+'.a',baseStd+'.b',baseStd+'.c',baseStd+'.d'].map((code,i)=>({
      code, desc:['Foundational concept','Strategy application','Independent transfer','Synthesis & reflection'][i],
      hits: i<Math.ceil(progress*4)?(i+1):0,
    }));
    const covered=stds.filter(x=>x.hits>0).length, gaps=stds.length-covered;
    const plannedMin=total*45, actualMin=taughtN*45+ (taughtN?Math.round(Math.random()*0)*0:0);
    const pace= progress>=0.66?'On pace': progress>=0.34?'Slightly behind':'Behind';
    return {
      subject:s, sid, name:uname, progress:progress||0,
      taughtN, total, lessons, standards:stds, covered, gaps,
      resourceCount: total*2 + 3,
      weeksRemaining: Math.max(0, Math.round((1-(progress||0))*5)),
      projectedFinish: ['Jun 20','Jun 24','Jun 27','Jul 2'][Math.min(3,Math.round((1-(progress||0))*3))],
      plannedMin, actualMin,
      pace,
      teamProgress: Math.min(1, (progress||0)+0.12),
      summary:'This unit develops '+uname.toLowerCase()+' through a model→guided→independent arc, building toward '+baseStd+'. Students move from exploration to independent transfer and a reflective assessment.',
    };
  }

  // ── catch-up: untaught/overdue lessons + standard gaps rolled up by scope ──
  const SUBJ_ORDER=['ufli','reading','math','writing','grammar','spelling','explorers','sel'];
  function catchUp(){
    const out=[];
    SUBJ_ORDER.forEach(sid=>{
      const units=(ROADMAP[sid]||[]);
      units.forEach(([uname,prog])=>{
        if(prog>=1) return;
        const d=unitDetail(sid,uname,prog);
        d.lessons.filter(l=>!l.taught).forEach(l=>{
          out.push({ ...l, subjectId:sid, unit:uname, overdue: prog>0.2 });
        });
      });
    });
    // standards gaps
    const gaps=[];
    SUBJ_ORDER.forEach(sid=>{
      const units=(ROADMAP[sid]||[]);
      const cur=units.find(u=>u[1]>0&&u[1]<1);
      if(cur){ const d=unitDetail(sid,cur[0],cur[1]); d.standards.filter(st=>!st.hits).forEach(st=>gaps.push({ subjectId:sid, unit:cur[0], code:st.code, desc:st.desc })); }
    });
    return { lessons:out, gaps };
  }

  // ── hierarchy naming (global, configurable) ──
  const DEFAULT_LABELS={ curriculum:['Curriculum','Curriculums'], subject:['Subject','Subjects'], unit:['Unit','Units'], lesson:['Lesson','Lessons'] };
  function labels(){ try{ return {...DEFAULT_LABELS, ...JSON.parse(localStorage.getItem('cc_labels')||'{}')}; }catch(e){ return DEFAULT_LABELS; } }
  function label(level,plural){ const L=labels()[level]||DEFAULT_LABELS[level]||[level,level]; return plural?L[1]:L[0]; }
  function setLabel(level,sing,plur){ const all=labels(); all[level]=[sing,plur]; try{ localStorage.setItem('cc_labels',JSON.stringify(all)); }catch(e){} window.dispatchEvent(new Event('cc-labels')); }

  // custom subjects — teacher-added, persisted locally (prototype of the curriculum hub)
  try{ Object.entries(JSON.parse(localStorage.getItem('cc_subjects')||'{}')).forEach(([id,s])=>{ SUBJECTS[id]=s; if(!SUBJ_ORDER.includes(id)) SUBJ_ORDER.push(id); }); }catch(e){}
  function addSubject(id,def){
    SUBJECTS[id]=def; if(!SUBJ_ORDER.includes(id)) SUBJ_ORDER.push(id);
    try{ const all=JSON.parse(localStorage.getItem('cc_subjects')||'{}'); all[id]=def; localStorage.setItem('cc_subjects',JSON.stringify(all)); }catch(e){}
    window.dispatchEvent(new Event('cc-labels'));
  }

  window.DS = { SUBJECTS, PERIODS, DAYS, WEEK, POOL, ROADMAP, MONTHS, RESTYPES, getState, fmt, toMin, resourcesFor,
                typeFromUrl, addCustomRes, removeCustomRes, unitDetail, catchUp, labels, label, setLabel, addSubject,
                SUBJECT_ORDER:SUBJ_ORDER };
})();
