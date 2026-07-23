/* Plan Workbench — data + scheduling engine.
   Calendar derives from a configurable school week (Sun–Thu here — sample data,
   never an assumption). Lessons occupy consecutive instructional slots per
   subject lane; `pad` = skipped school days before a lesson, so dragging one
   lesson ripples every later lesson automatically. Exposes window.PW. */
(function(){
  const MONN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DOWL=['S','M','T','W','T','F','S'];

  /* ── school calendar (from school config) ── */
  const SCHOOL_WEEK=[0,1,2,3,4];            // Sun–Thu
  const SWLEN=SCHOOL_WEEK.length;           // school days per week
  const TERM_START='2026-10-25';            // a Sunday
  const WEEKS=9;
  const TODAY_ISO='2026-11-18';
  const HOLIDAYS={
    '2026-11-10':'PD Day',
    '2026-12-13':'National Day',
    '2026-12-14':'National Day',
    '2026-12-15':'National Day',
  };

  const iso=(d)=>{ const p=n=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); };
  const CAL=[]; let slotN=0;
  (function(){
    const start=new Date(TERM_START+'T12:00:00');
    for(let i=0;i<WEEKS*7;i++){
      const d=new Date(start); d.setDate(start.getDate()+i);
      if(!SCHOOL_WEEK.includes(d.getDay())) continue;   // weekends collapsed away
      const s=iso(d); const hol=HOLIDAYS[s]||null;
      CAL.push({ iso:s, dnum:d.getDate(), month:d.getMonth(), dowL:DOWL[d.getDay()],
                 holiday:hol, slot:hol?null:slotN, col:CAL.length,
                 weekStart:d.getDay()===SCHOOL_WEEK[0] });
      if(!hol) slotN++;
    }
  })();
  const SLOTS=CAL.filter(d=>d.slot!=null);
  const SLOT_COL=SLOTS.map(d=>d.col);
  const TODAY_SLOT=(CAL.find(d=>d.iso===TODAY_ISO)||{slot:20}).slot;
  const clampSlot=(s)=>Math.max(0,Math.min(s,SLOTS.length-1));
  const fmtSlot=(s)=>{ const d=SLOTS[clampSlot(s)]; return MONN[d.month]+' '+d.dnum; };
  const slotCol=(s)=>SLOT_COL[clampSlot(s)];

  /* ── lesson sections (completeness axes) ── */
  const SECS=[['obj','Objective'],['flow','Flow'],['res','Resources'],['diff','Differentiation'],['assess','Assessment']];
  const comp=(l)=>SECS.reduce((a,[k])=>a+(l.done[k]?1:0),0);
  /* lesson-flow templates — 3 general + one per curricular approach (mirrors FW.ORDER) */
  const FLOW_DEFS=[
    { name:'Gradual release',          fw:null,        steps:['Hook','I do','We do','You do','Reflect'] },
    { name:'Direct instruction',       fw:null,        steps:['Review','Present','Guided practice','Independent practice','Check for understanding'] },
    { name:'Workshop',                 fw:null,        steps:['Mini-lesson','Status of the class','Work time','Confer','Share'] },
    { name:'Universal spine (Custom)', fw:'custom',    steps:['Open','New learning','Practice','Show you know','Close'] },
    { name:'PYP inquiry',              fw:'pyp',       steps:['Provocation','Investigate','Sort out','Go further','Share','Act'] },
    { name:'UbD — WHERETO',            fw:'ubd',       steps:['Where & why','Hook & hold','Equip & explore','Rethink & revise','Self-evaluate'] },
    { name:'Concept-based (CBCI)',     fw:'cbci',      steps:['Facts first','Apply the lens','Synergistic thinking','Generalize','Transfer'] },
    { name:'MYP inquiry',              fw:'myp',       steps:['Inquire into the SOI','Build ATL skills','Apply to criteria','Reflect'] },
    { name:'DP seminar',               fw:'dp',        steps:['Activate prior knowledge','New content','Discuss & connect (TOK)','Apply','Exam-style check'] },
    { name:'5E inquiry',               fw:'fivee',     steps:['Engage','Explore','Explain','Elaborate','Evaluate'] },
    { name:'PBL work session',         fw:'pbl',       steps:['Need-to-knows','Mini-workshop','Project work','Critique & revise','Milestone check'] },
    { name:'Cambridge objective loop', fw:'cambridge', steps:['Recap & objective','Model','Practice','Misconception check','Review'] },
    { name:'Standards-based',          fw:'stdbased',  steps:['Unpack the target','Instruction','Practice at level','Collect evidence','Self-rate on the scale'] },
    { name:'KUD differentiated',       fw:'kud',       steps:['Pre-check','Whole-group KUD','Tiered practice','Choice product','Exit ticket'] },
    { name:'Murdoch cycle',            fw:'murdoch',   steps:['Tune in','Find out','Sort out','Go further','Conclude','Act'] },
    { name:'TfU performance',          fw:'tfu',       steps:['Generative hook','Build understanding','Perform understanding','Ongoing feedback','Reflect'] },
    { name:'Inquiry + UDL',            fw:'inqudl',    steps:['Multi-entry hook','Choice investigation','Make thinking visible','Express 2+ ways','Reflect'] },
  ];
  const FLOWS=FLOW_DEFS.map(x=>x.name);
  const FLOW_GROUPS=[
    { label:'General',               flows:FLOW_DEFS.filter(x=>!x.fw).map(x=>x.name) },
    { label:'Curricular approaches', flows:FLOW_DEFS.filter(x=>x.fw).map(x=>x.name) },
  ];
  const flowSteps=(name)=>{ const d=FLOW_DEFS.find(x=>x.name===name); return d?d.steps:null; };
  const flowFw=(name)=>{ const d=FLOW_DEFS.find(x=>x.name===name); return d?d.fw:null; };

  let idc=1;
  const RES_SEED=[['Slide deck','Slides'],['Practice worksheet','Worksheet'],['Anchor chart','Image']];
  function L(title,objective,std,fill,extra){
    const map={o:'obj',f:'flow',r:'res',d:'diff',a:'assess'};
    const done={}; (fill||'').split('').forEach(ch=>{ if(map[ch]) done[map[ch]]=true; });
    const o={ id:'L'+(idc++), title, objective:objective||'', std:std||'', tags:std?[std]:[],
             dur:45, pad:0, stack:false, assessment:null, assessTitle:'', modified:false, diffText:'',
             resources:done.res?RES_SEED.map((r,i)=>({id:'R'+idc+'-'+i,name:r[0],type:r[1]})):[],
             resN:done.res?3:0, flowName:done.flow?'Gradual release':null,
             fwData:{}, carried:[], fwId:null,
             done, ...(extra||{}) };
    if(o.assessment&&!o.assessTitle) o.assessTitle=o.assessment==='summative'?'Unit assessment':'Exit ticket';
    o.resN=o.resources.length;
    return o;
  }
  const blank=(title)=>L(title||'New lesson','', '', '');

  /* generated lane filler — first `full` lessons complete, rest thin out */
  const FILLS=['ofrd','ofra','ofr','of','o',''];
  function gen(titles,std,full){
    return titles.map((t,i)=>{
      const fill=i<full?'ofrda':FILLS[i%FILLS.length];
      const objective=fill.includes('o')?('I can '+t.replace(/Unit Assessment.*/,'show what I learned').toLowerCase()+'.'):'';
      const extra={};
      if(/assessment/i.test(t)) extra.assessment='summative';
      else if(i===Math.floor(titles.length/2)) extra.assessment='formative';
      return L(t,objective,std,fill,extra);
    });
  }

  /* ── standards banks ── */
  const STDS={
    'math-md':[
      ['4.NBT.5','Multiply multi-digit whole numbers using strategies and the standard algorithm.'],
      ['4.NBT.6','Find whole-number quotients using strategies based on place value.'],
      ['4.OA.3','Solve multistep word problems using the four operations.'],
      ['4.OA.2','Multiply or divide to solve word problems.'],
    ],
    'read-inf':[
      ['RL.4.1','Refer to details and examples when drawing inferences.'],
      ['RL.4.2','Determine a theme; summarize the text.'],
      ['RL.4.3','Describe a character, setting, or event in depth.'],
    ],
  };

  /* ── unit factory ── */
  function U(id,sid,name,lessons,target,stds){
    return { id, sid, name, lessons, target:target==null?null:target, stds:stds||[],
             eq:null, summary:'', vocab:[], notes:'', defaultDur:45, defaultFlow:null, archived:false,
             framework:null, fwData:{}, carried:[], customFields:[], hiddenGroups:[], udlOn:false,
             kud:{k:[],u:[],d:[]}, reflect:{before:'',during:'',after:''} };
  }

  function build(){
    idc=1;
    /* Math · Multiplication & Division — the hand-authored primary unit */
    const MD=[
      L('Model 2-Digit Multiplication','I can model 2-digit \u00d7 1-digit products with base-ten blocks.','4.NBT.5','ofrda'),
      L('Partial Products Strategy','I can multiply using partial products.','4.NBT.5','ofrda',{assessment:'formative'}),
      L('Area Model Multiplication','I can use an area model to multiply 2-digit numbers.','4.NBT.5','ofrd',{modified:true}),
      L('Multiply by Multiples of 10','I can use place-value patterns to multiply by tens.','4.NBT.5','ofrd'),
      L('The Standard Algorithm','I can multiply using the standard algorithm.','4.NBT.5','ofa'),
      L('Two-Step Word Problems','I can solve two-step problems involving multiplication.','4.OA.3','o',{assessment:'formative'}),
      L('Estimate to Check Reasonableness','I can estimate products to check my answers.','4.OA.3','o'),
      L('Division with Area Models','I can divide using area models and partial quotients.','4.NBT.6','of',{modified:true}),
      L('Interpreting Remainders','','4.NBT.6',''),
      L('Unit Assessment \u2014 Mult. & Division','I can show mastery of multiplication and division.','4.NBT.5','oa',{assessment:'summative',dur:60}),
    ];
    const units=[
      U('math-as','math','Addition & Subtraction',
        gen(['Rounding & Estimation','Add Multi-Digit Numbers','Subtract Across Zeros','Estimate Sums & Differences','Word Problems: Addition','Word Problems: Subtraction','Two-Step Problems','Mental Math Strategies','Error Analysis','Bar Models','Review Stations','Unit Assessment \u2014 Add & Subtract'],'4.NBT.4',11), null),
      U('math-md','math','Multiplication & Division', MD, 24, STDS['math-md']),
      U('math-fr','math','Fractions',
        gen(['Equivalent Fractions','Simplest Form','Compare Fractions','Common Denominators','Add Like Fractions','Subtract Like Fractions','Add Unlike Fractions','Mixed Numbers','Improper Fractions','Fractions on a Number Line','Review & Games','Unit Assessment \u2014 Fractions'],'4.NF.1',0), null),

      U('read-po','reading','Poetry & Figurative Language',
        gen(['Similes & Metaphors','Personification','Imagery','Rhyme & Rhythm','Stanza & Structure','Tone','Word Choice','Free Verse','Reading Poems Aloud','Poetry Caf\u00e9 Prep','Poetry Caf\u00e9','Unit Assessment \u2014 Poetry'],'RL.4.4',10), null),
      U('read-inf','reading','Inference',
        gen(['Making Inferences','Citing Text Evidence','Character Motivation','Theme & Inference','Inference with Nonfiction','Inference Gallery Walk','Socratic Seminar','Review Stations','Unit Assessment \u2014 Inference'],'RL.4.1',5), 22, STDS['read-inf']),
      U('read-th','reading','Theme & Summary',
        gen(['What Is Theme?','Theme vs. Topic','Evidence for Theme','Summarizing Fiction','Somebody-Wanted-But-So','Summarizing Nonfiction','Main Idea & Details','Theme Across Texts','Review Stations','Unit Assessment \u2014 Theme'],'RL.4.2',0), null),

      U('writ-pn','writing','Personal Narrative',
        gen(['Generating Seed Ideas','Small Moments','Storytelling Arc','Crafting the Lead','Show, Don\u2019t Tell','Sensory Details','Drafting the Middle','Dialogue Rules','Transitions','Strong Endings','Peer Revision','Revising for Voice','Editing Pass','Publishing Party'],'W.4.3',14), null),
      U('writ-op','writing','Opinion Writing',
        gen(['Opinion vs. Fact','Strong Claims','Reasons & Evidence','Counterarguments','Drafting Introductions','Linking Words','Drafting Body','Strong Conclusions','Peer Review','Revision','Editing','Publish & Share'],'W.4.1',3), 27),

      U('exp-fo','explorers','Forces',
        gen(['What Is a Force?','Push & Pull','Gravity','Friction','Balanced Forces','Unbalanced Forces','Magnets','Force Investigations','Design Challenge','Unit Assessment \u2014 Forces'],'4-PS2',8), null),
      U('exp-en','explorers','Energy & Motion',
        gen(['Forms of Energy','Potential vs. Kinetic','Energy Transfer','Heat Energy','Sound Energy','Build a Roller Coaster','Energy in Our World','Design Review','Unit Assessment \u2014 Energy'],'4-PS3',7), 20),
      U('exp-wa','explorers','Waves & Information',
        gen(['What Are Waves?','Amplitude & Wavelength','Waves Move Energy','Sound Waves','Light Waves','Information Transfer','Patterns & Codes','Build a Communicator','Unit Assessment \u2014 Waves'],'4-PS4',0), null),
    ];
    const bench=[
      L('Multiplication Games Rotation','I can build fluency through math games.','4.NBT.5','ofr'),
      L('Re-teach: Partial Products (small group)','I can multiply using partial products.','4.NBT.5','of'),
    ];
    return schedule({ units, bench });
  }

  /* ── scheduling: per-subject lane, sequential slots + pads → ripple ── */
  function schedule(state){
    const bySid={};
    state.units.forEach(u=>{ (bySid[u.sid]=bySid[u.sid]||[]).push(u); });
    Object.keys(bySid).forEach(sid=>{
      let cur=0, last=null;
      bySid[sid].forEach(u=>{
        if(u.archived){ u.startSlot=-1; u.endSlot=-1; u.lessons.forEach(l=>{ l.slot=-1; l.date='—'; l.status='planned'; }); return; }
        if(u.anchor!=null&&u.anchor>=0){ cur=Math.max(0,u.anchor); last=null; }  /* anchored: starts exactly where painted — may overlap its neighbors until moved */
        u.lessons.forEach(l=>{
          cur+=(l.pad||0);
          if(l.stack && last!=null){ l.slot=last; }
          else { l.slot=cur; cur++; }
          last=l.slot;
          l.date=fmtSlot(l.slot);
          l.status=l.forceTaught?'taught':(l.slot<TODAY_SLOT?'taught':(l.slot===TODAY_SLOT?'today':'planned'));
        });
        u.startSlot=u.lessons.length?u.lessons[0].slot:cur;
        u.endSlot=u.lessons.length?u.lessons[u.lessons.length-1].slot:cur;
      });
    });
    return state;
  }

  function pacing(u){
    const remaining=u.lessons.filter(l=>l.status!=='taught').length;
    const thin=u.lessons.filter(l=>l.status!=='taught'&&comp(l)<=2).length;
    const ready=u.lessons.filter(l=>comp(l)>=4).length;
    const out={ remaining, thin, ready, total:u.lessons.length, end:fmtSlot(u.endSlot), endSlot:u.endSlot };
    if(u.target!=null){ out.target=fmtSlot(u.target); out.slack=u.target-u.endSlot; out.budget=u.target-u.startSlot+1; }
    return out;
  }

  const laterCount=(state,l)=>{
    let sid=null;
    state.units.forEach(u=>{ if(u.lessons.some(x=>x.id===l.id)) sid=u.sid; });
    let n=0;
    state.units.forEach(u=>{ if(u.sid===sid) u.lessons.forEach(x=>{ if(x.slot>l.slot) n++; }); });
    return n;
  };

  window.PW={ CAL, SLOTS, SWLEN, TODAY_SLOT, TODAY_ISO, SECS, FLOWS, FLOW_DEFS, FLOW_GROUPS, flowSteps, flowFw,
              fmtSlot, slotCol, clampSlot, comp, pacing, laterCount,
              build, schedule, blank, L };
})();
