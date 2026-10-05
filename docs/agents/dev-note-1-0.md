# dev-note 1-0 — 판단 규칙(큐레이션 레이어) 사전 분석 + 0-C2b 구현 계획

> 작성 hn_dev 2026-10-05 · 읽기 전용 분석(코드 수정 없음) · 기준: 작업 트리 v1.12.98 · 근거 지시서: `docs/agents/지시서-1-0-판단규칙.md`, 설계 `docs/ux-review/06-큐레이션-엔진-설계.md`

## 1. 재사용 가능성 — 함수별 표
| 대상 | 위치 | 시그니처·부작용 | curate 재사용 | 36+ 허용 목록과의 관계 |
|---|---|---|---|---|
| `visibleSchedule(true)` | `js/app.js:776-779` | 인자 `ignoreCategoryFilter`. **앱 모듈 상태(`schedule`·`profile`·`isNotApplicable`) 클로저**, 내보내지 않음 | **그대로는 불가**(Node 불가). 같은 식을 순수 함수로 복제: `events.filter(e => ChildTimeline.isEventShown(birth, e, today) && !isNA(e.id))` | `isEventShown`(`child-timeline.js:166-182`)이 36개월 이상이면 `autoAfter36` 표식 항목만 통과 + 끝이 이번 달 1일 이전이면 제외. **curate 입력은 이미 허용 목록을 통과한 것** → 36+ 후보는 원래 얇다(초등 3~6건) |
| `todayItems(events, completed)` | `js/hn-logic.js:317-335`(export 600) | 순수. 조건: 엔진 이벤트·`scheduleKind==="window"`·지원금 아님·`engineStatus` DUE/OVERDUE_CATCHUP·미완료. 정렬: 지난 것→`priorityOf`(없으면 2)→`windowEnd` | **지금 꼭(L3·L4) 후보 추출에 재사용 가능**. 단 UPCOMING·monthly(`scheduleKind:"monthly"`)는 안 줌 → 곧·알아두기는 curate가 직접 거른다 | 36+에서 허용 목록 항목 중 window형만 해당 |
| `subsidyDeadline(e)` | `hn-logic.js:343-` | 순수. 지역 지원금=`deadlineDate`, 엔진 지원금=`applicationDeadline`(소급)→`windowEnd` | 재사용 | — |
| `subsidyStatus(e, completed, ctx)` | `hn-logic.js:~375` | 순수. ctx=`{today, ageNow, pregnant, birthDate}` → applied/available/upcoming/expired. 나이 상한(`ageCapExceeded`)·지역 지원금 min/max 월령 반영 | 재사용(G·L 판정의 지원금 축) | 36+ 지원금(NAT-020·GG-016·SEOUL-S01 등)도 같은 함수 |
| `isUrgent(e, completed, ctx, days)` | `hn-logic.js:402-408` | 순수. available이고 마감 0~N일 이내(`daysLeft`). 기본 30 | 재사용, **N은 정책 `deadlineSoonDays`로 주입** | — |
| 엔진 status | `todo-engine.js:209-220` `computeStatus` | 순수. DONE/SCHEDULED/UPCOMING/DUE/OVERDUE_CATCHUP/OVERDUE_FINAL. `NOT_APPLICABLE`은 기한 지나도 DUE 유지 | 재사용: 이벤트에 `engineStatus`로 이미 실려 있음(`schedule.js` 이벤트 생성부). 지역 지원금(`isLegacySubsidy`)에는 `engineStatus`가 없으므로 `subsidyStatus`로 판정(**이원 구조**) | — |
| 소급 판정 | `todo-engine.js:277-290` `attachRetroactiveInfo` | 순수. `retroactiveDeadline`이 있는 정의(SB-01~04 등)만 `applicationDeadline/Passed/retroactiveEligible`을 인스턴스에 덧붙임. status는 그대로 | 재사용(읽기): `e.detail.instance.*`. L의 "신청 기한" 근거로 `subsidyDeadline`이 이미 사용 | — |
| VX 묶음 키 | `hn-logic.js:108-117` `assignDisplayDays` 내부 `gkey` | **내부 변수, 미공개**. window형 `VX|ymd(시작)|ymd(끝)`, monthly형 `VXM|월령` | **복제 필요 또는 소폭 추출**. 권장: `vxGroupKey(e, opts)`로 추출·export(동작 불변, h6·hn-logic 테스트로 보호). 복제하면 두 곳이 어긋날 위험 | 36+ VX(TDAP·HPV·4~6세 추가)는 같은 키 규칙 |
| `isDone(completed, id)` | `hn-logic.js:23` | 순수 | 재사용 | — |

결론: **엔진·schedule.js·hn-logic 판단 로직은 고치지 않고 재사용 가능**. 새로 필요한 것은 (a) `visibleSchedule` 순수 복제, (b) VX 키 추출(작은 export), (c) 곧·알아두기·UNKNOWN 후보 추출, (d) 정책 읽기.

## 2. SB-06~09 UNKNOWN을 curate 안에서만 CHECK로 내보낼 수 있나
- 현재 흐름: SB-06~09는 `eligibilityCondition`이 있고 `familyDeclaredAttributes`는 앱이 항상 `{}`를 넘기므로(`schedule.js:~140`) 엔진이 `status:null + eligibility:"UNKNOWN"` 인스턴스를 돌려준다(`todo-engine.js:358-368`). `buildTodoEngineEvents`가 `schedule.js:152`에서 `status===null`이면 건너뛴다 → **이벤트가 되지 못한다.**
- 따라서 **`curate(events…)`만으로는 SB-06~09를 볼 수 없다**(이벤트에 없음). `schedule.js:152`를 안 바꾸는 전제에서 가능한 방법:
  - **A(권장)**: `schedule.js`에 별도 함수 `buildEligibilityUnknown(profile, todoDefinitions)`를 **추가**(기존 `buildSchedule`·이벤트 경로 불변). 같은 `calculateTodoInstances`를 호출해 `eligibility==="UNKNOWN" && status===null && 정의에 eligibilityCondition 있음 && verificationStatus!=="확인필요"`만 돌려준다. curate는 `state.unknown`으로 받아 CHECK 후보로만 쓴다.
  - B: curate 호출부(리포트 스크립트·나중의 홈)가 위와 같은 필터를 직접 수행해 `state.unknown`을 만든다(schedule.js 무변경, 코드 중복).
- 주의 1: `eligibility:"UNKNOWN"`은 **학교 정보가 없는 SCHOOL_TERM_WINDOW**(`todo-engine.js:243-247`)도 같은 값이므로 `eligibilityCondition` 유무로 구분해야 한다(안 하면 SC 항목이 CHECK로 새어 나옴).
- 주의 2: 같은 제도가 지역 지원금 쪽에도 있다(별칭 4쌍 SB-06↔NAT-031, SB-07↔NAT-007, SB-08↔NAT-020, SB-09↔NAT-018). NAT-0xx는 이벤트로 이미 존재 → curate의 별칭 묶기에서 **이벤트가 있으면 UNKNOWN 쪽을 버린다**(1건만 보이게).

## 3. 6명 리포트 스크립트 설계
- 경로 제안: `test/tools/curate-report.js`(node 단독, `node test/tools/curate-report.js [--today=2026-10-05]`), 출력은 `docs/ux-review/07-큐레이션-6명-결과.md`(+ 콘솔 요약).
- 날짜 고정: 엔진(`schedule.js:131 const today = new Date()`)·`ChildTimeline.compute`가 `new Date()`를 직접 읽으므로 **`Date` 전역을 고정하는 `withToday`**(k3 테스트 방식)로 감싸고, `curate`·`isEventShown`·`subsidyStatus`에는 `today`를 인자로 주입. 3개 날짜(2026-10-05·2026-11-20·2027-01-10)는 같은 함수를 날짜만 바꿔 호출.
- 데이터셋 조립(앱 `loadAll`·`loadSubsidyDataForRegion`과 같은 규칙을 **한 곳에서 읽어** 어긋남을 줄임):
  - 할 일 정의: `app.js`의 `TODO_CATEGORY_FILES`(`app.js:106`)를 **소스 텍스트에서 파싱**(목록 복제 금지) + `data/subsidies/national-todos.json`.
  - 지원금: `national.json` + 시·도 슬러그 폴더(`app.js:168-182`의 `PROVINCE_SLUG`·`SPLIT_SUBSIDY_PROVINCES`·`DISTRICT_FOLDER_PROVINCES` 상수를 소스에서 파싱) — 서울은 `city.json`+`districts/구로구.json`, 경기는 `city.json`+`성남시/subsidies.json`. **`applyBirthRule`(2027 개편 `reform-2027.json`, `app.js:157-166`) 적용 필수**(출생일에 따라 항목이 사라짐).
  - 정책: `school.json`(학교 정책 normalize), `auto-after36.json`(`AutoAfter36.normalize`), `pregnancy-timing.json`, `curation.json`(hn_data 산출). 완료 기록 없음(`completions=[]`), `birthOrder:"first"`, 미해당 없음.
- 프로필 6개(지시서 §3): 임신(예정일 2027-01-15, `stage:"pregnant"`, 구로구) / 은찬 2026-06-20 / 2024-12-10 / 2022-03-15 경기 성남시 / 2020-05-10 / 2017-09-01(초3). 출생 프로필은 `stage:"born"`.
- 출력 표(아이마다): 슬롯(지금 꼭/곧/알아두기/N개 더)·id·제목·걸린 규칙(G/L)·이유 문장·06 §8-2 기대와 같음/다름. 기대는 06 §8-2 표를 **JSON 기대표(스크립트 옆 `curate-expect.json`)로 옮겨 자동 비교**(손으로 비교하지 않음). 끝에 "어색해 보이는 것" 후보 5개(의견).
- 보호: 스크립트는 읽기 전용(데이터·앱 코드 수정 없음), 같은 입력이면 항상 같은 출력(정렬 키에 id).

## 4. 예상 위험·막히는 점 (최대 5)
1. **UNKNOWN 이벤트 부재**: SB-06~09는 이벤트가 아니라 curate 입력에 없다(위 §2). schedule.js에 함수 추가(A) 또는 호출부 중복(B) 결정 필요. 학교 UNKNOWN 혼입 방지 필수.
2. **36+ 후보가 허용 목록으로 이미 얇음**: 초등 후보 3~6건. "초등 학기 중 비어야 함"(§4-4)과 "데이터가 없어서 빔"을 구분할 수 없다 → 리포트에 **허용 목록 통과 전/후 후보 수**를 같이 적어 구분(허용 목록 확대는 hn_data·D7 미결).
3. **날짜 고정의 숨은 `new Date()`**: 엔진·`ChildTimeline`·`app.js` 일부가 직접 현재 시각을 읽는다. 스크립트는 전역 Date 고정으로 해결하되, curate 안에서는 `new Date()`를 절대 호출하지 않는 규칙(테스트로 고정)이 필요.
4. **VX 묶음 키 비공개 + 지원금 이원 구조**: `gkey`가 `assignDisplayDays` 내부라 복제하면 어긋남(추출 권장). 지원금은 엔진 지원금(SB/PG/NAT 엔진, `engineStatus`)과 지역 지원금(`isLegacySubsidy`, `subsidyStatus`)이 판정 경로가 달라 curate가 두 경로를 합쳐야 한다. `priority`는 엔진 정의에만 있어 지역 지원금은 기본 2(`priorityOf`) — 지시서가 `priority` 대신 명시 목록(`urgentLongWindowIds`)을 쓰는 이유와 일치.
5. **임신 프로필의 가정값**: 임신 항목의 시작·끝은 가정값(`pregnancy-timing.json`, 확인일 미입력)이라 L3·L4가 '확인 필요' 꼬리표 없이는 오해 소지. 리포트의 임신 행은 "가정 기준"을 표시. (부가: 지역 데이터는 서울·경기만 있어 6명이 지역 편중 — 타 지역 결과는 미검증.)

## 5. 0-C2b — 비계정 빠른 칩 '예방접종' → AUTO 후보 (구현 계획 메모)
- 현황: 계정 모드 G13 폼은 v1.12.98(0-C2)에서 '예방접종' **종류 선택** 시 후보 칩이 나온다. 비계정 폼(`UserScheduleView.renderForm`, `user-schedule-view.js` ~999-1045, 호출 `app.js:4800`)은 빠른 칩 `data-us-quick="vaccine"`(`renderQuickChips`, ~1195)이 **제목·분류만 채우고 폼을 다시 그리지 않는다**(`app.js:~5405-5420`).
- 변경 계획:
  1. `user-schedule-view.js`: 후보 마크업을 함수 `renderAutoCandidates(f, cands)`로 추출해 G13·비계정 폼이 공유(동작 불변). 노출 조건에 `f.quickKey === "vaccine"`를 더한다. `renderForm`이 `o.autoCandidates`를 받아 빠른 칩 아래에 그린다.
  2. `app.js`: `usAutoCandidates()` 조건을 `kindPick==="예방접종" || quickKey==="vaccine"`로 일반화. 빠른 칩 핸들러에서 `vaccine`일 때만 `usShowForm()`으로 폼을 다시 그림(입력 중인 시간·장소·메모는 폼 상태에 이미 있어 보존되는지 확인 필요). 후보 선택 → 기존 `usOpenFormFromAuto(e)`(제목·분류·아이·autoRef, 날짜 비움).
  3. 테스트: `k11`에 비계정 폼 후보 노출·자동 선택 없음·직접 입력 유지·다른 칩(병원·치과)에는 후보 없음 추가.
- **막힘 가능**: 후보 연결은 `autoLinkOn()`(`app.js:4444` = 가구 활성 + `FEATURES.autoLink`)이 켜져 있어야 한다. 진짜 '계정 없는(플래그 OFF·가구 없는)' 사용자는 후보를 볼 수 없다 → 0-C2b의 대상이 "가구만 켠 기기(비계정 폼)"인지 "완전 비가구 사용자"인지 **hn_pm 확인 필요**(후자면 연결 자체가 불가해 범위가 달라짐).
- 규모: S~M(파일 2개 + 테스트, 반나절). 위험 낮음(마크업 추출은 동작 불변, h6·k5·g13d 등 폼 테스트로 보호).
