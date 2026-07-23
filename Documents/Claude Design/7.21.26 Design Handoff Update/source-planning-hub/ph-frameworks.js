/* Planning Hub — Framework engine (plain JS, no JSX). Encodes the unit-design research:
   universal spine + 13 framework presets. Field defs drive the Design tab, the lesson
   editor, conversion (no data thrown away → carried[]), and coverage reports.
   Exposes window.FW. */
(function(){

const WEAK_VERBS=['is','are','have','has','affect','affects','influence','influences','impact','impacts'];

/* option banks */
const PYP_THEMES=['Who We Are','Where We Are in Place and Time','How We Express Ourselves','How the World Works','How We Organize Ourselves','Sharing the Planet'];
const PYP_KEYCONCEPTS=['Form','Function','Causation','Change','Connection','Perspective','Responsibility'];
const LEARNER_PROFILE=['Inquirers','Knowledgeable','Thinkers','Communicators','Principled','Open-minded','Caring','Risk-takers','Balanced','Reflective'];
const ATL=['Thinking','Communication','Social','Self-management','Research'];
const MYP_CONTEXTS=['Identities and relationships','Orientation in space and time','Personal and cultural expression','Scientific and technical innovation','Globalization and sustainability','Fairness and development'];
const MYP_CONCEPTS=['Aesthetics','Change','Communication','Communities','Connections','Creativity','Culture','Development','Form','Global interactions','Identity','Logic','Perspective','Relationships','Systems','Time, place and space'];
const WHERETO=['W — Where & why','H — Hook & hold','E — Equip & explore','R — Rethink & revise','E — Evaluate','T — Tailored','O — Organized'];
const FIVE_E=['Engage','Explore','Explain','Elaborate','Evaluate'];
const MURDOCH=['Tuning In','Finding Out','Sorting Out','Going Further','Making Conclusions','Taking Action'];
const APPROACHES_TT=['Inquiry-based','Conceptual','Local & global contexts','Teamwork & collaboration','Differentiated','Assessment-informed'];

/* UDL checklist (CAST 3.0, trimmed) */
const UDL={
  eng:{label:'Multiple means of Engagement — the “why”',items:['Offer choice in topic or tools','Connect to student interests & lives','Vary challenge level / scaffolds','Foster collaboration & belonging']},
  rep:{label:'Multiple means of Representation — the “what”',items:['Present content in 2+ formats (text, visual, audio)','Pre-teach vocabulary & symbols','Activate prior knowledge','Highlight patterns & big ideas']},
  act:{label:'Multiple means of Action & Expression — the “how”',items:['Offer 2+ ways to show understanding','Provide planning & pacing supports','Allow assistive tools & media','Build in practice with feedback']},
};

/* "last year said…" sample surfacing (until real history exists) */
const LAST_YEAR={
  'math-md':'Ran two days long — trim Interpreting Remainders. The area-model anchor chart was gold; laminate it.',
  'read-inf':'Socratic seminar needed a full extra day. Pre-teach “inference vs. guess” earlier.',
  'writ-op':'Counterarguments lesson landed flat — try the debate warm-up first this year.',
};

/* ── field definition helpers ──
   {k,label,type,group,help,tip,opts,hint,lessonOnly}
   types: text · textarea · list · tags · select · questions(F/C/D) · loi · soi · grasps ·
          generalizations · phases · milestones · profscale */
const f=(k,label,type,group,help,tip,opts,hint)=>({k,label,type,group,help,tip:tip||help,opts,hint});

/* ── framework presets ── */
const FWS={

custom:{ id:'custom', name:'Custom — universal spine', short:'Custom', built:true,
  blurb:'The research-backed core every model shares. Add field groups as you need them.',
  bigIdea:'Big idea / essential question',
  kudLabels:['Know — facts & vocabulary','Understand — transferable ideas','Do — skills'],
  unitFields:[], groups:[],
  lessonObjective:'Objective', lessonFields:[] },

pyp:{ id:'pyp', name:'IB PYP — Unit of Inquiry', short:'PYP', built:true,
  blurb:'Transdisciplinary, concept-driven, student-led inquiry. The value is in the process.',
  bigIdea:'Central idea',
  bigIdeaHelp:'One sentence — broad, timeless, universal. Something students can debate.',
  kudLabels:['Know — facts & vocabulary','Understand — conceptual understandings','Do — ATL skills in action'],
  groups:['Inquiry','Concepts & learners','Learning & action'],
  unitFields:[
    f('theme','Transdisciplinary theme','select','Inquiry','One of six globally significant lenses.','Anchors the unit so learning transcends single subjects.',PYP_THEMES),
    f('loi','Lines of inquiry','loi','Inquiry','3–4 phrases (not questions) that break the central idea into investigable chunks.'),
    f('keyConcepts','Key concepts','tags','Concepts & learners','Choosing concepts makes the unit inquiry-based rather than a list of facts.',null,PYP_KEYCONCEPTS),
    f('relatedConcepts','Related concepts','list','Concepts & learners','Subject-specific concepts that deepen the key concepts.'),
    f('learnerProfile','Learner profile attributes','tags','Concepts & learners','Which attributes this unit develops.',null,LEARNER_PROFILE),
    f('atl','Approaches to learning (ATL)','tags','Concepts & learners','Name the skills students will practice.',null,ATL),
    f('provocations','Provocations & learning experiences','textarea','Learning & action','Hooks and engagements that spark wonderings — plans stay responsive.'),
    f('action','Action','textarea','Learning & action','Inquiry should lead to authentic, student-initiated action.'),
  ],
  lessonObjective:'Learning intention',
  lessonFields:[
    f('engagement','Engagement type','select',null,'What kind of learning engagement this is.',null,['Provocation','Investigation','Sorting out','Going further','Sharing','Action']),
    f('loiLink','Line of inquiry','unit-loi',null,'Which line of inquiry this lesson feeds.'),
  ]},

ubd:{ id:'ubd', name:'UbD — Backward Design (Wiggins & McTighe)', short:'UbD', built:true,
  blurb:'Design backward from desired results: understanding first, evidence second, activities last.',
  bigIdea:'Essential questions',
  bigIdeaHelp:'Open, recurring questions that drive inquiry across the whole unit — not answerable in one lesson.',
  kudLabels:['Know — students will know…','Understand — enduring understandings','Do — students will be able to…'],
  groups:['Stage 1 — Desired results','Stage 2 — Evidence','Stage 3 — Learning plan'],
  unitFields:[
    f('transferGoals','Transfer goals','list','Stage 1 — Desired results','The big things students should do on their own, without scaffolding, after the unit.'),
    f('grasps','Performance task (GRASPS)','grasps','Stage 2 — Evidence','Authentic evidence that students can transfer learning to a real-world situation.'),
    f('otherEvidence','Other evidence','textarea','Stage 2 — Evidence','Quizzes, observations, work samples that round out the picture.'),
    f('whereto','W.H.E.R.E.T.O. check','tags','Stage 3 — Learning plan','A checklist so the learning plan hooks, equips, and lets students rethink and self-evaluate.',null,WHERETO),
  ],
  lessonObjective:'Lesson objective',
  lessonFields:[
    f('whereto','W.H.E.R.E.T.O.','tags',null,'Which elements this lesson delivers.',null,WHERETO),
    f('stageLink','Builds toward','select',null,'Position every lesson as a step toward the evidence.',null,['Performance task','Other evidence','Both']),
  ]},

cbci:{ id:'cbci', name:'Concept-Based (Erickson, Lanning & French)', short:'CBCI', built:true,
  blurb:'Synergistic thinking: facts and skills in interplay with concepts, toward transferable generalizations.',
  bigIdea:'Conceptual lens',
  bigIdeaHelp:'A macroconcept (interdependence, change, perspective…) that forces thinking about the topic through a big idea.',
  kudLabels:['Critical content — students will KNOW','Generalizations — students will UNDERSTAND that…','Key skills — students will be able to DO'],
  groups:['Concepts','Generalizations & questions','Overview'],
  unitFields:[
    f('strands','Unit strands','list','Concepts','The organizing strands (process subjects use Understanding, Responding, Critiquing, Producing).'),
    f('generalizations','Generalizations','generalizations','Generalizations & questions','5–9 per unit. Two or more concepts stated as a relationship. Avoid weak verbs: is, are, have, affect, influence, impact.'),
    f('questions','Guiding questions','questions','Generalizations & questions','Factual questions ground the facts; conceptual bridge to the generalization; debatable provoke argument.','3–5 F+C per generalization · 2–3 debatable per unit'),
    f('overview','Unit overview (student-facing hook)','textarea','Overview','How you will pitch this unit to students.'),
  ],
  lessonObjective:'Learning target',
  lessonFields:[
    f('gqLink','Guiding question','unit-questions',null,'Which guiding question this lesson works on.'),
    f('synergy','Synergistic-thinking note','text',null,'Where facts meet concepts in this lesson.'),
  ]},

myp:{ id:'myp', name:'IB MYP — Statement of Inquiry', short:'MYP', built:true,
  blurb:'Backward design in an IB context: concept + global context → statement of inquiry → criterion-based assessment.',
  bigIdea:'Statement of inquiry',
  bigIdeaHelp:'Key concept + related concept(s) + global context in one student-friendly sentence.',
  kudLabels:['Know — content','Understand — conceptual understanding','Do — ATL skills'],
  groups:['Inquiry','Action','Reflection'],
  unitFields:[
    f('soi','Statement of inquiry builder','soi','Inquiry','Combine a key concept, related concept and global context into one meaningful sentence.'),
    f('globalContext','Global context','select','Inquiry','Sets the real-world reason students should care.',null,MYP_CONTEXTS),
    f('keyConcept','Key concept','select','Inquiry','One big idea that drives the unit and connects across subjects.',null,MYP_CONCEPTS),
    f('questions','Inquiry questions','questions','Inquiry','Factual build knowledge; conceptual build transfer; debatable spark discussion.'),
    f('criteria','MYP criteria assessed','tags','Action','Which criteria the summative task assesses.',null,['A','B','C','D']),
    f('atl','ATL skills','tags','Action','Tie each skill to an objective, experience, or the task.',null,ATL),
    f('soiRel','Relationship: summative task ↔ SOI','textarea','Action','Ensures the assessment actually measures the unit’s big idea.'),
  ],
  lessonObjective:'Learning objective',
  lessonFields:[
    f('criteria','Criteria touched','tags',null,'Criteria this lesson builds toward.',null,['A','B','C','D']),
    f('atl','ATL focus','tags',null,'Skills practiced this lesson.',null,ATL),
  ]},

dp:{ id:'dp', name:'IB DP — Unit Planner', short:'DP', built:false,
  blurb:'Course-focused inquiry/action/reflection, connected to TOK, CAS and DP assessment.',
  bigIdea:'Essential understandings',
  kudLabels:['Know — content','Understand — essential understandings','Do — skills'],
  groups:['Inquiry','Connections','Reflection'],
  unitFields:[
    f('transferGoals','Transfer goals','list','Inquiry','The big, long-term things students should do unaided after the unit.'),
    f('tok','TOK connections','textarea','Connections','Ways of knowing and knowledge questions this unit raises.'),
    f('cas','CAS connections','textarea','Connections','Creativity, activity, service links.'),
    f('approaches','Approaches to teaching','tags','Reflection','Quick self-check against the six IB pedagogical principles.',null,APPROACHES_TT),
  ],
  lessonObjective:'Lesson objective', lessonFields:[] },

fivee:{ id:'fivee', name:'5E Instructional Model (BSCS)', short:'5E', built:true,
  blurb:'A constructivist learning cycle — Engage, Explore, Explain, Elaborate, Evaluate — spanning the unit, loops allowed.',
  bigIdea:'Unit concept / phenomenon',
  kudLabels:['Know — facts & vocabulary','Understand — core concept','Do — practices & skills'],
  groups:['Phases'],
  unitFields:[
    f('phases','5E sequence','phases','Phases','Order matters (Explain never before Explore) but phases can repeat and loop.',null,FIVE_E),
  ],
  lessonObjective:'Objective',
  lessonFields:[
    f('phase','5E phase','select',null,'Which phase this lesson serves — phases may span lessons and loop.',null,FIVE_E),
  ]},

pbl:{ id:'pbl', name:'Project-Based Learning (Gold Standard)', short:'PBL', built:true,
  blurb:'A sustained, authentic project culminating in a public product.',
  bigIdea:'Driving question',
  bigIdeaHelp:'A meaningful, open problem at the right level of challenge that frames the whole project.',
  kudLabels:['Know — key knowledge','Understand — key understanding','Do — success skills'],
  groups:['Project design'],
  unitFields:[
    f('milestones','Milestones & timeline','milestones','Project design','Checkpoints that structure sustained inquiry toward the product.'),
    f('publicProduct','Public product','textarea','Project design','Students share work with an audience beyond the classroom — it raises stakes and quality.'),
    f('authenticity','Authenticity','textarea','Project design','Real-world context, tools, impact — or personal relevance.'),
    f('voice','Student voice & choice','textarea','Project design','Where students make real decisions.'),
    f('critique','Critique & revision plan','textarea','Project design','Structured feedback cycles so students improve their work.'),
  ],
  lessonObjective:'Workshop objective',
  lessonFields:[
    f('milestoneLink','Milestone','unit-milestones',null,'Which milestone this workshop moves forward.'),
    f('needToKnow','Need-to-know addressed','text',null,'The student question this session answers.'),
  ]},

cambridge:{ id:'cambridge', name:'Cambridge Scheme of Work', short:'Cambridge', built:false,
  blurb:'Objectives-coded long/medium/short-term planning; codes flow through to test reporting.',
  bigIdea:'Unit focus',
  kudLabels:['Know — content objectives','Understand — key ideas','Do — skills objectives'],
  groups:['Objectives','Support'],
  unitFields:[
    f('codedObjectives','Learning objectives (coded)','list','Objectives','e.g. 9Bs.01 — codes map to Checkpoint reporting.'),
    f('misconceptions','Possible misconceptions','textarea','Support','Anticipate where students commonly go wrong.'),
    f('models','Models & representations','textarea','Support','Concrete ways to make abstract ideas visible.'),
  ],
  lessonObjective:'Learning objective', lessonFields:[] },

stdbased:{ id:'stdbased', name:'Standards-Based (priority standards + scales)', short:'Standards', built:true,
  blurb:'From fragmentation to focus: a few enduring standards, proficiency scales, everything aligned.',
  bigIdea:'Essential questions',
  kudLabels:['Know — knowledge (by week)','Understand — enduring understandings','Do — skills (by week)'],
  groups:['Standards & scales'],
  unitFields:[
    f('priority','Priority standards','list','Standards & scales','You can’t teach every standard deeply — name the enduring few (supporting ones stay in the bank).'),
    f('scale','Proficiency scale','profscale','Standards & scales','Define below-basic to advanced so expectations are transparent.'),
  ],
  lessonObjective:'Success criterion targeted',
  lessonFields:[
    f('scaleLevel','Scale level targeted','select',null,'Which proficiency level this lesson works at.',null,['1 — Below basic','2 — Basic','3 — Proficient (target)','4 — Advanced']),
  ]},

kud:{ id:'kud', name:'KUD (Tomlinson)', short:'KUD', built:false,
  blurb:'Know / Understand / Do goals anchoring differentiation by readiness, interest and profile.',
  bigIdea:'Unit focus',
  kudLabels:['Know — facts, vocabulary, dates','Understand — “students will understand that…”','Do — skills'],
  groups:['Differentiation'],
  unitFields:[
    f('preassess','Pre-assessment','textarea','Differentiation','Find where each student is relative to the KUDs before planning groups.'),
    f('diffMatrix','Differentiation plan','textarea','Differentiation','Vary content / process / product by readiness, interest, learning profile. Teach up, then scaffold.'),
  ],
  lessonObjective:'Objective', lessonFields:[] },

murdoch:{ id:'murdoch', name:'Kath Murdoch Inquiry Cycle', short:'Murdoch', built:false,
  blurb:'Student-led cyclical inquiry — more a web than a line; revisit phases as questions emerge.',
  bigIdea:'Inquiry focus',
  kudLabels:['Know','Understand','Do — thinking skills'],
  groups:['Phases'],
  unitFields:[
    f('phases','Inquiry phases','phases','Phases','Non-linear — loop back as new questions arise.',null,MURDOCH),
  ],
  lessonObjective:'Learning intention',
  lessonFields:[ f('phase','Inquiry phase','select',null,'Which phase this lesson sits in.',null,MURDOCH) ]},

tfu:{ id:'tfu', name:'Teaching for Understanding (Project Zero)', short:'TfU', built:false,
  blurb:'Understanding is something students DO — performances of understanding against year-long throughlines.',
  bigIdea:'Generative topic',
  kudLabels:['Know','Understand — understanding goals','Do — performances'],
  groups:['Understanding'],
  unitFields:[
    f('throughline','Year-long throughline','text','Understanding','The year question this unit’s goals nest inside.'),
    f('performances','Performances of understanding','list','Understanding','Visible things students do to build and show understanding.'),
    f('ongoing','Ongoing assessment plan','textarea','Understanding','Continuous, criteria-based — not just at the end.'),
  ],
  lessonObjective:'Performance of understanding', lessonFields:[] },

inqudl:{ id:'inqudl', name:'Inquiry + UDL', short:'Inquiry/UDL', built:false,
  blurb:'General inquiry design with Universal Design for Learning checkpoints for inclusive access.',
  bigIdea:'Driving / essential question',
  kudLabels:['Know','Understand','Do'],
  groups:['Inquiry'],
  unitFields:[
    f('successCriteria','Learning intentions & success criteria','list','Inquiry','Student-facing “we are learning to / I can” statements.'),
    f('investigations','Investigations & provocations','textarea','Inquiry','The research and hands-on work that drives the unit.'),
  ],
  lessonObjective:'Learning intention', lessonFields:[] },
};

const ORDER=['custom','pyp','ubd','cbci','myp','dp','fivee','pbl','cambridge','stdbased','kud','murdoch','tfu','inqudl'];

/* ── resolution: planner default → subject override → unit override ── */
function effective(u,settings){
  return (u&&u.framework) || (settings&&settings.subjectFw&&settings.subjectFw[u?u.sid:''])
      || (settings&&settings.framework) || 'custom';
}
const get=(id)=>FWS[id]||FWS.custom;

/* readable text for any stored value (for Carried over) */
function toText(v){
  if(v==null||v==='') return '';
  if(Array.isArray(v)) return v.map(x=>typeof x==='object'?toText(x):x).filter(Boolean).join(' · ');
  if(typeof v==='object'){
    if(v.q!=null) return (v.t?('['+v.t+'] '):'')+v.q;
    if(v.ph!=null) return v.ph+(v.note?(': '+v.note):'');
    if(v.t!=null&&v.date!==undefined) return v.t+(v.date?(' — '+v.date):'');
    return Object.entries(v).map(([k2,v2])=>v2?(k2.toUpperCase()+': '+toText(v2)):'').filter(Boolean).join(' · ');
  }
  return String(v);
}
const isEmpty=(v)=>v==null||v===''||(Array.isArray(v)&&v.every(x=>isEmpty(typeof x==='object'?toText(x):x)))||(typeof v==='object'&&!Array.isArray(v)&&toText(v)==='');

/* label lookup for a stored key in a framework */
function labelOf(fwId,k,lesson){
  const fw=get(fwId);
  const list=lesson?fw.lessonFields:fw.unitFields;
  const d=(list||[]).find(x=>x.k===k);
  return d?d.label:k;
}

/* ── conversion: nothing thrown away ── */
function convert(fwData,carried,fromId,toId,lesson){
  const tgt=new Set(((get(toId)[lesson?'lessonFields':'unitFields'])||[]).map(x=>x.k));
  const keep={}, out=[...(carried||[])];
  Object.entries(fwData||{}).forEach(([k,v])=>{
    if(k.startsWith('cf_')||tgt.has(k)) keep[k]=v;             // custom fields always survive
    else if(!isEmpty(v)) out.push({fw:get(fromId).short,label:labelOf(fromId,k,lesson),text:toText(v)});
  });
  return {fwData:keep,carried:out};
}

window.FW={ FWS, ORDER, get, effective, convert, toText, isEmpty, labelOf,
  WEAK_VERBS, UDL, LAST_YEAR, FIVE_E, MURDOCH };
})();
