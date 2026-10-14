// app.js 에서 발췌한 참고용 조각(그대로 복사, 실행하지 않는다). 쓰앵님에 붙일 때 이 함수들이 쓰는 app.js 의 지역 변수·헬퍼를 함께 옮겨야 한다.

// ── acct36Is3to5 (js/app.js 1438~1444행, 원본 HEAD 기준)
  function acct36Is3to5() {
    if (!profile || isPregnant()) return false;
    const m = ChildTimeline.completedMonths(profile.birthDate, new Date());
    if (m < ChildTimeline.OVER36_FROM_MONTHS) return false;
    const g = EduTrend.gradeOf(profile.birthDate, new Date(), { policy: schoolPolicy, enrollmentYearOverride: profile.enrollmentYearOverride });
    return !(g >= 1) && m < 72; // 3~5세(36~71개월)만 — 6~7세(취학 전 1년 이후)는 지금 화면 그대로(명세)
  }

// ── acct36Edu3to5State (js/app.js 1446~1458행, 원본 HEAD 기준)
  function acct36Edu3to5State(pv, docs, keys) {
    const today = new Date(), months = ChildTimeline.completedMonths(profile.birthDate, today);
    const shown = visibleSchedule(true);
    const byBase = (id) => shown.find((e) => String(e.id).split("__")[0] === id);
    const decide = [];
    const cr = byBase("CR-03"); // 만3세반(유아반) 전환 준비(명세 B1) — CR-02 는 만1세반 전환(12개월)이라 쓰지 않는다
    if (cr) decide.push({ id: cr.id, title: cr.title.replace(/^(?:⚠️ )?확인 필요 · /, ""), why: cr.dateLabel || "" });
    const support = [];
    const nat = byBase("NAT-020") || byBase("SB-08"); // 같은 제도 한 건만(06 §4-1 묶기)
    if (nat) { const ap = usApplyLinkOf(nat); support.push({ id: nat.id, title: nat.title.replace(/^(?:⚠️ )?확인 필요 · /, ""), applyUrl: ap && ap.url ? ap.url : "", officialUrl: nat.officialUrl || (nat.detail && nat.detail.officialUrl) || "" }); }
    const regional = ((dataset.subsidy && dataset.subsidy.subsidies) || []).some((x) => !/^NAT-/.test(x.id));
    return { region: profile.district || (pv && pv.name) || "", ageLabel: ChildTimeline.ageLabelAt(profile.birthDate, new Date()), decide, support, supportRegionPending: !regional, find: eduLinks ? { links: eduLinks.links } : null, firstschoolNote: (() => { const kg = byBase("KG-01"), td = kg && kg.detail && kg.detail.definition; return kg && td && td.triggerType === "AGE_WINDOW" && eduLinks && eduLinks.notices && eduLinks.notices.firstschoolNotYet ? eduLinks.notices.firstschoolNotYet : ""; })(), mine: EduTrend.myLessons(docs, keys), canAdd: usActive(), nextSchool: months >= 60, nextSchoolOpen: (() => { try { return !!nsModel(); } catch (e) { return false; } })(), };
  }

// ── acct36RenderTrend (js/app.js 1460~1477행, 원본 HEAD 기준)
  function acct36RenderTrend() {
    const panel = el("tab-trend");
    if (!panel || !profile) return;
    if(typeof EducationInfo!=="undefined") EducationInfo.unmount();
    const g = EduTrend.gradeOf(profile.birthDate, new Date(), { policy: schoolPolicy, enrollmentYearOverride: profile.enrollmentYearOverride });
    const keys = [acct36LinkKey(), familyCode].filter(Boolean);
    const docs = typeof usDocs === "function" && usActive() ? usDocs() : [];
    const pv = regionsData && regionsData.provinces.find((x) => x.code === profile.province);
    if (acct36Is3to5() && typeof Edu3to5View !== "undefined") { panel.innerHTML = Edu3to5View.render(acct36Edu3to5State(pv, docs, keys)); return; }
    const legacy = Over36View.renderTrend({ region: profile.district || (pv && pv.name) || "", gradeLabel: EduTrend.gradeLabel(g), inRange: g >= 0 && g <= 6, mine: EduTrend.myLessons(docs, keys), status: EduTrend.statusFor(null), canAdd: usActive() });
    if (typeof EducationInfo === "undefined") { panel.innerHTML = legacy; return; }
    const educationScope=JSON.stringify([acct.user&&acct.user.uid||"local",familyCode||usActiveChildKey()]), educationFamily=hh.hid;
    EducationInfo.mount(panel, {scope:educationScope,familyId:hh.hid||null,reader:activeGrowthBackend(),isCurrent:()=>currentTab==="trend"&&educationFamily===hh.hid&&educationScope===JSON.stringify([acct.user&&acct.user.uid||"local",familyCode||usActiveChildKey()]),legacy, name: childDisplayName(), region: [pv && pv.name, profile.district].filter(Boolean).join(" "), ageLabel: ChildTimeline.ageLabelAt(profile.birthDate, new Date()), months: ChildTimeline.completedMonths(profile.birthDate,new Date()), subject: educationRequestedSubject,
      birthDate:toISODate(profile.birthDate),dong:profile.dong||"",grade:g,provinceName:pv&&pv.name||"",district:profile.district||"",canPlan:usActive()&&usActiveChildKey()!=null,
      onPlan:(draft)=>{if(!usActive()||usActiveChildKey()==null)return;usOpenForm(null,"",{scope:"CHILD"});if(us.form){Object.assign(us.form,{title:draft.title,titleTouched:true,charText:(draft.title+'\n'+draft.memo).slice(0,500),category:"ETC",categoryLabel:"체험",charCategory:"체험",eventDate:"",startTime:"",endTime:"",location:draft.location,memo:draft.memo});usShowForm();}},
      onHistory:()=>{growthRequestedView="history";switchTab("growth");}, onCheck:()=>{growthRequestedView="check";switchTab("growth");}});
    educationRequestedSubject="";
  }

// ── acct36EnsureTrend (js/app.js 1418~1436행, 원본 HEAD 기준)
  function acct36EnsureTrend() {
    if (el("tab-trend")) return;
    const ck = document.querySelector('.nav-item[data-nav="checklist"]');
    const places = document.querySelector('.nav-item[data-nav="places"]');
    const panel = document.createElement("div");
    panel.id = "tab-trend";
    panel.className = "tab-panel hidden";
    const host = el("tab-checklist");
    if (!host || !host.parentNode || !ck) return;
    host.parentNode.insertBefore(panel, host.nextSibling);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-item hidden";
    btn.dataset.nav = "trend";
    btn.innerHTML = `<span class="nav-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg></span><span>${typeof EducationInfo!=="undefined"?"교육정보":Over36View.TREND.nav}</span>`;
    ck.parentNode.insertBefore(btn, places || ck.nextSibling);
    btn.addEventListener("click", () => switchTab("trend"));
    if (!TAB_NAMES.includes("trend")) TAB_NAMES.push("trend");
  }
