/* Curriculy prototype — subjects, units, and unit detail data. */
window.COLORS = {
  blue:   { c:"#4788D1", d:"#244A75", t:"#E2E9F0", i:"#4A6A95", sh:"rgba(71,136,209,.32)", rt:"#F5F9FC", s:"#7A9EC7" },
  orange: { c:"#E8BB17", d:"#7A671F", t:"#F4EFDF", i:"#927A2E", sh:"rgba(232,187,23,.38)", rt:"#FCFAF1", s:"#DCC674" },
  green:  { c:"#47D183", d:"#247547", t:"#E2F0E8", i:"#3E8A60", sh:"rgba(71,209,131,.32)", rt:"#F4FBF7", s:"#7AC79B" },
  purple: { c:"#9F47D1", d:"#572475", t:"#EBE2F0", i:"#7A5AA0", sh:"rgba(159,71,209,.30)", rt:"#FAF6FD", s:"#AB7AC7" },
};

const ICONS = {
  book:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z"/><path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/></svg>',
  calc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h.01M12 11h.01M16 11h4M8 15h.01M12 15h.01M8 19h.01M12 19h.01M16 15v4"/></svg>',
  flask:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6l-5 8a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-8V3"/><path d="M7 14h10"/></svg>',
  globe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18"/></svg>',
  doc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M9 13h6M9 17h4"/></svg>',
};
window.ICONS = ICONS;

const SUBJECTS = [
  { id:"reading", name:"Reading", grade:"Grade 3", color:"blue", icon:"book",
    units:["Building Strong Readers","Character & Setting","Main Idea & Details","Compare & Contrast","Fact & Opinion","Summarizing"] },
  { id:"math", name:"Math", grade:"Grade 3", color:"orange", icon:"calc",
    units:["Place Value","Addition & Subtraction","Multiplication & Division","Fractions","Measurement","Geometry"] },
  { id:"science", name:"Science", grade:"Grade 3", color:"green", icon:"flask",
    units:["Life Cycles","Habitats","Rocks & Minerals","Forces & Motion","Weather & Climate","Energy"] },
  { id:"social", name:"Social Studies", grade:"Grade 3", color:"purple", icon:"globe",
    units:["Communities","Our Country","Regions","Early People","Government","Economics"] },
];

/* The richly-specified unit: Math · Unit 3 · Multiplication & Division */
const MATH_U3 = {
  dates: "January 13 – February 14, 2025 · 7 Weeks",
  weeks: [
    { n:"Week 1", d:"Multiplication as Repeated Addition", dates:"Dec 30 – Jan 3", st:"done" },
    { n:"Week 2", d:"Multiply by 1-Digit Numbers", dates:"Jan 6 – Jan 10", st:"done" },
    { n:"Week 3", d:"Multiply by 2-Digit Numbers", dates:"Jan 13 – Jan 17", st:"cur" },
    { n:"Week 4", d:"Division as Grouping", dates:"Jan 20 – Jan 24", st:"todo" },
    { n:"Week 5", d:"Divide by 1-Digit Numbers", dates:"Jan 27 – Jan 31", st:"todo" },
    { n:"Week 6", d:"Word Problems", dates:"Feb 3 – Feb 7", st:"todo" },
    { n:"Week 7", d:"Review & Assessment", dates:"Feb 10 – Feb 14", st:"todo" },
  ],
  sel: 2,
  dayweeks: {
    2: { label:"Jan 13 – Jan 17", days:[
      { dy:"Mon", dt:"Jan 13", t:"Model 2-Digit Multiplication", doc:true, sel:true },
      { dy:"Tue", dt:"Jan 14", t:"Partial Products Strategy", doc:true },
      { dy:"Wed", dt:"Jan 15", t:"Area Model Multiplication", x:true },
      { dy:"Thu", dt:"Jan 16", t:"Solve with Numbers", ch:true },
      { dy:"Fri", dt:"Jan 17", t:"Practice & Exit Ticket", doc:true },
    ]},
  },
};

/* Build a generic detail for any other unit so every cell is functional. */
function genDetail(subjectName, unitName, idx) {
  const baseW = ["Introduction & Hook","Core Concepts","Guided Practice","Apply & Extend","Review & Assessment"];
  const weeks = baseW.map((d, i) => ({ n:"Week "+(i+1), d, dates:"", st: i<1?"done": i===1?"cur":"todo" }));
  const days = ["Mon","Tue","Wed","Thu","Fri"].map((dy,i)=>({
    dy, dt:"", t:[`Launch: ${unitName}`,"Mini-lesson & model","Guided practice","Independent work","Wrap-up & exit ticket"][i],
    doc:true, sel:i===0,
  }));
  return { dates:`${unitName} · 5 Weeks`, weeks, sel:1, dayweeks:{ 1:{ label:"", days } }, generic:true };
}

SUBJECTS.forEach((s) => {
  s.units = s.units.map((name, i) => {
    const isMath3 = s.id === "math" && i === 2;
    return { n:"Unit "+(i+1), name, detail: isMath3 ? MATH_U3 : genDetail(s.name, name, i) };
  });
});
window.SUBJECTS = SUBJECTS;
