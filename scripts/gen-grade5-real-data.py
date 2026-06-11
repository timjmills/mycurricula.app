# NOTE: set DATA_DIR (the Grade 5 Curriculum folder) and OUT_PATH for your
# machine before re-running. Generates scripts/_grade5-real-data.sql.
# Mirrors scripts/gen-planner-sql.mjs id scheme (lib/planner/id-bridge.ts).

#!/usr/bin/env python3
# Generate idempotent SQL seeding the REAL Grade 5 2026-2027 curriculum into the
# mycurricula Supabase schema. Mirrors scripts/gen-planner-sql.mjs id scheme.

import json, re, csv, hashlib, io, datetime

DATA_DIR = "/sessions/gallant-youthful-pascal/mnt/Grade 5 Curriculum"
JSON_PATH = f"{DATA_DIR}/_tooling/master_index_data.json"
CSV_PATH  = f"{DATA_DIR}/_publish/sheet_csv/Grade 5.csv"
OUT_PATH  = "/sessions/gallant-youthful-pascal/mnt/outputs/_grade5-real-data.sql"

# ── id bridge (port of lib/planner/id-bridge.ts) ────────────────────────────
NS = re.sub(r'[^0-9a-f]', '0', "6f1d2c84-3b6a-4e2f-9a77-planner000000").replace('-', '')
NS_BYTES = bytes.fromhex(NS[: len(NS) // 2 * 2])   # match Node odd-nibble drop
KIND_SALT = {"lesson":"lesson:","unit":"unit:","subject":"subject:",
             "standard":"standard:","framework":"framework:"}
def uuid_v5(name):
    h = hashlib.sha1(NS_BYTES + name.encode("utf-8")).digest()
    b = bytearray(h[:16]); b[6] = (b[6] & 0x0f) | 0x50; b[8] = (b[8] & 0x3f) | 0x80
    x = b.hex(); return f"{x[0:8]}-{x[8:12]}-{x[12:16]}-{x[16:20]}-{x[20:]}"
def slug_uuid(kind, slug): return uuid_v5(f"{KIND_SALT.get(kind, kind + ':')}{slug}")

# ── fixed ids from supabase/seed.sql ────────────────────────────────────────
SCHOOL="00000000-0000-0000-0000-0000000000a1"; GRADE="00000000-0000-0000-0000-0000000000b5"
YEAR_2526="00000000-0000-0000-0000-0000000000c1"; YEAR_2627="00000000-0000-0000-0000-0000000000c2"
SUBJECT_ID={"math":"00000000-0000-0000-0000-0000000005d1","reading":"00000000-0000-0000-0000-0000000005d2",
            "writing":"00000000-0000-0000-0000-0000000005d3","grammar":"00000000-0000-0000-0000-0000000005d4",
            "explorers":"00000000-0000-0000-0000-0000000005d7"}
SUBJECT_ORDER={"math":0,"reading":1,"writing":2,"grammar":3,"explorers":4}

def q(s):  return "'" + str(s).replace("'", "''") + "'"
def jq(o): return "'" + json.dumps(o, ensure_ascii=False).replace("'", "''") + "'::jsonb"
def dateq(d): return q(d.isoformat()) + "::date"

# ── calendar ────────────────────────────────────────────────────────────────
def yr(m): return 2026 if m >= 8 else 2027
def mk(m, day): return datetime.date(yr(m), m, day)
def school_days(d0, d1):
    out, d = [], d0
    while d <= d1:
        if d.weekday() in (6,0,1,2,3): out.append(d)
        d += datetime.timedelta(days=1)
    return out
HOLIDAY_SINGLE=[mk(9,27),mk(10,6),mk(11,29),mk(2,9),mk(3,31),mk(4,1),mk(4,18)]
HOLIDAY_RANGES=[(mk(10,25),mk(10,29)),(mk(12,20),mk(1,3)),(mk(3,8),mk(3,14)),(mk(5,16),mk(5,20))]
def build_holidays():
    days=set(d for d in HOLIDAY_SINGLE if d.weekday() in (6,0,1,2,3))
    for a,b in HOLIDAY_RANGES: days.update(school_days(a,b))
    return sorted(days)
START_DATE=mk(8,30); END_DATE=mk(6,24); RAMADAN_START=mk(2,8); RAMADAN_END=mk(3,7); YEAR_WEEKS=40

# ── cell parsing ────────────────────────────────────────────────────────────
def split_std(cell):
    m = re.search(r'\n?\s*Std:\s*', cell)
    return (cell.strip(), "") if not m else (cell[:m.start()].strip(), cell[m.end():].strip())
CODE_RE = re.compile(r'^(?:EE\.?)?[A-Za-z]{1,5}\.?\d[A-Za-z0-9.]*$')
def parse_standards(std_text):
    codes=[]
    for piece in re.split(r'[,\n]', std_text):
        p=re.sub(r'^(CCSS|CC|Std)\s*:\s*', '', piece.strip(), flags=re.I).strip()
        p=normalize_code(p)
        if not p or ' ' in p: continue
        if any(c.isdigit() for c in p) and any(c.isalpha() for c in p) and CODE_RE.match(p):
            codes.append(p)
    seen,out=set(),[]
    for c in codes:
        if c not in seen: seen.add(c); out.append(c)
    return out
def normalize_code(c):
    c=c.strip()
    if c.upper().startswith("CCSS"):
        c=re.sub(r'^CCSS[.:]?\s*','',c,flags=re.I)
    elif c.upper().startswith("CC") and len(c)>2 and c[2].isalpha():
        c=c[2:]
    return c.strip(" .")
def is_ee(code): return "EE" in code.upper().split(".") or code.upper().startswith("EE")
def make_title(body, fallback):
    if not body: return fallback
    line = re.sub(r'^Week\s*\d+\s*:?\s*', '', body.split("\n",1)[0].strip()).strip()
    line = re.sub(r'^Testing/\s*', '', line)
    if ":" in line:
        head=line.split(":",1)[0].strip()
        if 3 <= len(head) <= 70: line=head
    line=re.split(r'\s+[-–]\s+', line)[0].strip()
    line=re.sub(r'\s{2,}', ' ', line)
    if not line: return fallback
    return (line[:60].rsplit(" ",1)[0] + "…") if len(line) > 62 else line

# ── load sources ────────────────────────────────────────────────────────────
data=json.load(open(JSON_PATH,encoding="utf-8")); unit_maps=data["unit_maps"]
rows=list(csv.DictReader(open(CSV_PATH,encoding="utf-8")))
units_csv=[]; cur=None
for r in rows:
    sec=r["Section"].strip()
    if sec=="Resources": continue
    if r["Type"]=="Section":
        cur={"section":sec,"weeks":[],"padlet":{}}; units_csv.append(cur)
    elif r["Type"]=="Link" and cur is not None:
        label,url=r["Label"].strip(),r["URL"].strip()
        mp=re.match(r'(Math|Reading|Writing|Grammar|IPC)\s*\(', label)
        if mp and "padlet.com" in url:
            subj={"IPC":"explorers"}.get(mp.group(1), mp.group(1).lower())
            inner=re.search(r'\((.*)\)', label)
            cur["padlet"][subj]=(inner.group(1) if inner else label, url)
        else:
            cur["weeks"].append((label,url))
def unit_short(section):
    n=re.sub(r'^Unit\s*\d+:\s*', '', section)
    n=re.split(r'\s+[A-Z][a-z]{2}\s+\d', n)[0]
    n=re.sub(r'\s*\([^)]*weeks[^)]*\)\s*$', '', n, flags=re.I)
    return n.strip().rstrip("(").strip()
def explore_title(label):
    t=re.sub(r'^Week\s*\d+\s*', '', label)
    t=re.sub(r'^[A-Z][a-z]{2}\s*\d+\s*[-–]\s*[A-Z]?[a-z]*\s*\d+\s*', '', t)
    t=re.sub(r'^[A-Z][a-z]{2}\s*\d+\s*', '', t)
    return t.strip() or label

# ── assemble ────────────────────────────────────────────────────────────────
abs_week=0; units_out={}; lessons_out=[]; standards_map={}; NUM_UNITS=len(units_csv)
for ui,ucsv in enumerate(units_csv):
    short=unit_short(ucsv["section"]); week_rows=ucsv["weeks"]; n_weeks=len(week_rows)
    start_w=abs_week+1; end_w=abs_week+n_weeks
    jtable=unit_maps[ui] if ui<len(unit_maps) else None
    jhdr=jtable[0] if jtable else []; jbody=jtable[1:] if jtable else []
    def subj_unit_name(subj):
        if subj=="explorers": return short
        if subj in ucsv["padlet"]: return ucsv["padlet"][subj][0]
        colname={"math":"Math","reading":"Reading","writing":"Writing","grammar":"Grammar"}[subj]
        if jbody and colname in jhdr:
            body,_=split_std(jbody[0][jhdr.index(colname)] or "")
            t=make_title(body,"")
            if t and len(t)>=4 and t.lower() not in ("ramadan","spiral review","math review"):
                return t
        return f"{short} — {colname}"
    for subj in ["explorers","math","reading","writing","grammar"]:
        units_out[(subj,ui)]={"id":slug_uuid("unit",f"g5-2627-{subj}-u{ui+1}"),
            "subject":subj,"name":subj_unit_name(subj),"start_week":start_w,"end_week":end_w}
    for wi in range(n_weeks):
        wabs=start_w+wi; wk_label,wk_url=week_rows[wi]; ex_std=""; ex_body=""
        if jbody and "Explore" in jhdr and wi<len(jbody):
            ex_body,ex_std=split_std(jbody[wi][jhdr.index("Explore")] or "")
        ex_res=[]
        if wk_url:
            prov="gdocs" if "docs.google.com" in wk_url else ("gdrive" if "drive.google" in wk_url else "website")
            ex_res.append({"type":"doc" if prov in ("gdocs","gdrive") else "link",
                "label":f"Week {wi+1} plan","url":wk_url,"provider":prov,"displayMode":"hyperlink"})
        lessons_out.append({"slug":f"g5-2627-explorers-w{wabs}","unit_idx":ui,"subject":"explorers",
            "week":wabs,"title":explore_title(wk_label) or short,"directions":ex_body,
            "notes":("Std: "+ex_std) if ex_std else "","resources":ex_res,"standards":parse_standards(ex_std)})
        if jbody and wi<len(jbody):
            for subj,colname in [("math","Math"),("reading","Reading"),("writing","Writing"),("grammar","Grammar")]:
                if colname not in jhdr: continue
                cell=jbody[wi][jhdr.index(colname)] or ""
                if not cell.strip(): continue
                body,std=split_std(cell); codes=parse_standards(std); res=[]
                if subj in ucsv["padlet"]:
                    plabel,purl=ucsv["padlet"][subj]
                    res.append({"type":"link","label":f"{colname}: {plabel}","url":purl,
                        "provider":"website","displayMode":"hyperlink"})
                lessons_out.append({"slug":f"g5-2627-{subj}-w{wabs}","unit_idx":ui,"subject":subj,
                    "week":wabs,"title":make_title(body,f"Week {wi+1}"),"directions":body,
                    "notes":("Std: "+std) if std else "","resources":res,"standards":codes})
        else:
            for subj in ["math","reading","writing","grammar"]:
                lessons_out.append({"slug":f"g5-2627-{subj}-w{wabs}","unit_idx":ui,"subject":subj,
                    "week":wabs,"title":"Spiral Review","directions":"End-of-year spiral review.",
                    "notes":"","resources":[],"standards":[]})
    abs_week=end_w
for L in lessons_out:
    for c in L["standards"]: standards_map.setdefault(c,"ee" if is_ee(c) else "ccss")

# ── emit SQL ────────────────────────────────────────────────────────────────
o=io.StringIO(); w=o.write
w("-- =============================================================================\n")
w("-- Grade 5 — REAL 2026-2027 curriculum seed (school year + calendar + units +\n")
w("-- standards + weekly lessons). Generated from the Grade 5 Curriculum folder.\n")
w("-- Idempotent: re-running inserts nothing new. Does NOT modify schema, seed.sql,\n")
w("-- or lib/mock. Targets the seeded Grade 5 + 8 team subjects.\n")
w("-- =============================================================================\n\n")
holidays=build_holidays(); hol_arr="array["+", ".join(dateq(d) for d in holidays)+"]::date[]"
w("-- 2026-2027 school year (real calendar: term dates, breaks, Ramadan).\n")
w(f"""insert into school_years
  (id, school_id, label, start_date, end_date, weeks, is_active,
   holidays, ramadan_start, ramadan_end, active_cycle_pattern)
values
  ({q(YEAR_2627)}, {q(SCHOOL)}, '2026–2027', {dateq(START_DATE)}, {dateq(END_DATE)},
   {YEAR_WEEKS}, true, {hol_arr}, {dateq(RAMADAN_START)}, {dateq(RAMADAN_END)}, 'one_week')
on conflict (id) do update set
  start_date=excluded.start_date, end_date=excluded.end_date, weeks=excluded.weeks,
  is_active=excluded.is_active, holidays=excluded.holidays,
  ramadan_start=excluded.ramadan_start, ramadan_end=excluded.ramadan_end, updated_at=now();\n""")
w("-- make 2026-2027 the only active year\n")
w(f"update school_years set is_active=false, updated_at=now() where id={q(YEAR_2526)};\n\n")
FW_CCSS=slug_uuid("framework","ccss"); FW_EE=slug_uuid("framework","ee")
w("-- Standards frameworks + grade assignment\n")
w(f"insert into standards_frameworks (id, name, short_code, provenance)\n  values ({q(FW_CCSS)}, 'Common Core State Standards', 'CCSS', 'catalog')\n  on conflict (id) do nothing;\n")
w(f"insert into standards_frameworks (id, name, short_code, provenance)\n  values ({q(FW_EE)}, 'DLM Essential Elements', 'EE', 'catalog')\n  on conflict (id) do nothing;\n")
for fw,slug in [(FW_CCSS,"gfa:ccss"),(FW_EE,"gfa:ee")]:
    w(f"insert into grade_framework_assignments (id, grade_level_id, framework_id)\n  values ({q(slug_uuid('framework',slug))}, {q(GRADE)}, {q(fw)})\n  on conflict (grade_level_id, framework_id) do nothing;\n")
w("\n")
w(f"-- Standards ({len(standards_map)})\n")
for code in sorted(standards_map):
    fw=FW_EE if standards_map[code]=="ee" else FW_CCSS
    w(f"insert into standards (id, framework_id, grade_level_id, code)\n  values ({q(slug_uuid('standard',code))}, {q(fw)}, {q(GRADE)}, {q(code)})\n  on conflict (framework_id, code) do nothing;\n")
w("\n")
unit_list=[units_out[k] for k in sorted(units_out,key=lambda k:(SUBJECT_ORDER[k[0]],k[1]))]
w(f"-- Units ({len(unit_list)} = {NUM_UNITS} thematic bands x 5 subjects)\n")
for u in unit_list:
    w(f"insert into units (id, grade_level_id, subject_id, school_year_id, name, start_week, end_week)\n  values ({q(u['id'])}, {q(GRADE)}, {q(SUBJECT_ID[u['subject']])}, {q(YEAR_2627)}, {q(u['name'])}, {u['start_week']}, {u['end_week']})\n  on conflict (id) do nothing;\n")
w("\n")
w(f"-- Lessons / master core lesson events ({len(lessons_out)})\n")
for L in lessons_out:
    uid=units_out[(L["subject"],L["unit_idx"])]["id"]; sid=SUBJECT_ID[L["subject"]]
    std_uuids=[slug_uuid("standard",c) for c in L["standards"]]
    std_arr=("array["+", ".join(q(u) for u in std_uuids)+"]::uuid[]") if std_uuids else "'{}'::uuid[]"
    w(f"insert into master_core_lesson_events\n  (id, unit_id, subject_id, week_number, day_of_week, title, directions, learning_objectives, notes, resources, standards, display_order_within_day)\n  values ({q(slug_uuid('lesson',L['slug']))}, {q(uid)}, {q(sid)}, {L['week']}, 'sun'::weekday, {q(L['title'])}, {q(L['directions'])}, '[]'::jsonb, {q(L['notes'])}, {jq(L['resources'])}, {std_arr}, {SUBJECT_ORDER[L['subject']]})\n  on conflict (id) do nothing;\n")
w(f"\n-- Done: 1 school year (2026-2027), {len(standards_map)} standards, {len(unit_list)} units, {len(lessons_out)} lessons.\n")
open(OUT_PATH,"w",encoding="utf-8").write(o.getvalue())
print(f"units={len(unit_list)} standards={len(standards_map)} lessons={len(lessons_out)} holidays={len(holidays)}")
print("OK")
