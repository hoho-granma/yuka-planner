// app.js 에서 발췌한 참고용 조각(그대로 복사, 실행하지 않는다). 쓰앵님에 붙일 때 이 함수들이 쓰는 app.js 의 지역 변수·헬퍼를 함께 옮겨야 한다.

// ── growthActive (js/app.js 3532~3534행, 원본 HEAD 기준)
  function growthActive() {
    return typeof GrowthRecords !== "undefined" && GrowthRecords.eligible(profile, profile && !isPregnant() ? ChildTimeline.completedMonths(profile.birthDate, new Date()) : null);
  }

// ── activeGrowthBackend (js/app.js 3535~3539행, 원본 HEAD 기준)
  function activeGrowthBackend() {
    const child=familyCode||usActiveChildKey();
    const link=usActive()?usLinks().find(l=>l.familyCode===child&&!l.removedAt):null;
    return DBPaths.deployment.growthServer&&acct.user&&link?GrowthSync.create({getContext:()=>({uid:acct.user&&acct.user.uid,familyId:hh.hid,childKey:(usLinks().find(l=>l.familyCode===familyCode&&!l.removedAt)||{}).childKey,childCode:familyCode})}):null;
  }

// ── growthNeedsRender (js/app.js 3546~3550행, 원본 HEAD 기준)
  function growthNeedsRender() {
    const body = el("growth-body");
    if (body.querySelector(".gr-editor, .gr-manage-form")) return false;
    return !body.querySelector(".gr-page") || growthRenderLessons !== JSON.stringify(growthLessonRows()) || growthRenderScope !== JSON.stringify([acct.user && acct.user.uid || "local", familyCode || usActiveChildKey()]) + "|" + (hh.hid || "");
  }

// ── renderGrowthTab (js/app.js 3551~3569행, 원본 HEAD 기준)
  function renderGrowthTab() {
    if (!growthActive()) return;
    if (growthHomeCountCache) growthHomeCountCache.at = 0; // 기록이 바뀌었을 수 있으니 다음 홈에서 건수를 새로 읽는다
    const child = familyCode || usActiveChildKey();
    if (!child) { el("growth-body").innerHTML = '<p class="empty">아이 정보를 확인한 뒤 다시 시도해 주세요.</p>'; return; }
    const owner = acct.user && acct.user.uid || "local";
    const lessons = growthLessonRows();
    const backend = activeGrowthBackend();
    const scope = JSON.stringify([owner, child]);
    growthRenderScope=scope+"|"+(hh.hid||"");
    growthRenderLessons=JSON.stringify(lessons);
    const currentFamily=hh.hid;
    const mountGrowth=typeof GrowthLearningView!=="undefined"?GrowthLearningView.mount:GrowthRecords.mount;
    mountGrowth(el("growth-body"), { backend, name: childDisplayName(), scope, familyId: hh.hid || null, grade:EduTrend.gradeOf(profile.birthDate,new Date(),{policy:schoolPolicy,enrollmentYearOverride:profile.enrollmentYearOverride}), semester:new Date().getMonth()<7?1:2, months: ChildTimeline.completedMonths(profile.birthDate,new Date()), initialView:growthRequestedView, lessons,
      isCurrent:()=>currentTab==="growth" && currentFamily===hh.hid && scope===JSON.stringify([acct.user&&acct.user.uid||"local",familyCode||usActiveChildKey()]),
      onEducation:(subject)=>{educationRequestedSubject=subject||"";switchTab("trend");},onCalendar: () => switchTab("calendar"),
      onOpenForm:(record,d)=>hnOpenGrowthForm(record,d),onChanged:()=>{if(growthHomeCountCache)growthHomeCountCache.at=0;},onOpenPaper:(subject,url)=>hnOpenFrameSheet(subject+" 문제지",url),onOpenCurriculum:(url)=>hnOpenFrameSheet("학기별 배우는 내용",url) });
    growthRequestedView="history";
  }

// ── growthHomeLoadCount (js/app.js 3579~3591행, 원본 HEAD 기준)
  async function growthHomeLoadCount() {
    if (!growthActive() || typeof GrowthRecords === "undefined" || !GrowthRecords.count) return;
    const scope = growthHomeScope();
    if (!scope) return;
    const c = growthHomeCountCache;
    if (c && c.scope === scope && c.n != null && Date.now() - c.at < 60000) return;
    try {
      const n = await GrowthRecords.count(scope, activeGrowthBackend(), hh.hid || null);
      growthHomeCountCache = { scope, n, at: Date.now() };
    } catch (e) { if (!growthHomeCountCache || growthHomeCountCache.scope !== scope) growthHomeCountCache = { scope, n: null, failed: true, at: Date.now() }; }
    const box = el("gr-home-count");
    if (box && growthHomeScope() === scope) box.textContent = growthHomeCountText();
  }

// ── hnOpenGrowthForm (js/app.js 3606~3632행, 원본 HEAD 기준)
  function hnOpenGrowthForm(record, defaults) {
    const scope = growthHomeScope();
    if (!scope || typeof GrowthRecords === "undefined" || !GrowthRecords.openForm) return;
    const editing = !!(record && record.id);
    const body = hnOpenSheet(editing ? "성장기록 수정" : "성장기록 남기기", "");
    hnSheetDispose = GrowthRecords.openForm(body, {
      backend: activeGrowthBackend(), scope, familyId: hh.hid || null, lessons: growthLessonRows(), record: record || null, group: defaults && defaults.group, activity: defaults && defaults.activity,
      onClose: () => hnCloseSheet(),
      onDeleted: () => {
        hnSheetDispose = null; closeDetail();
        growthRenderScope = "";
        const c = growthHomeCountCache;
        growthHomeCountCache = { scope, n: c && c.scope === scope && c.n != null ? Math.max(0, c.n - 1) : null, at: 0 };
        const box = el("gr-home-count"); if (box) box.textContent = growthHomeCountText();
        growthHomeLoadCount();
        if (currentTab === "growth") renderGrowthTab();
      },
      onSaved: () => {
        hnSheetDispose = null; closeDetail();
        growthRenderScope = ""; // 성장기록 탭은 다음에 열 때 새로 불러온다
        const c = growthHomeCountCache;
        growthHomeCountCache = { scope, n: c && c.scope === scope && c.n != null ? c.n + (editing ? 0 : 1) : null, at: 0 }; // 저장한 1건을 바로 더해 보여 주고, 곧 서버 건수로 다시 맞춘다
        const box = el("gr-home-count"); if (box) box.textContent = growthHomeCountText();
        growthHomeLoadCount();
        if (currentTab === "growth") renderGrowthTab();
      } });
  }
