# dev-note — 1-0 연결 준비(curate() → 홈) 설계 메모 (플래그 OFF 기본, 코드 연결 금지)

> 작성 hn_dev 2026-10-05 · 설계 메모만. **6명 리포트 v2 통과 전에는 앱 코드(app.js·index.html·home.js·over36-view.js)에 연결하지 않는다.** 현재 새 파일 3개(js/curation.js, js/home-slots-view.js, css/home-slots.css)는 어디서도 로드되지 않는다.

## 1. 한 줄 구조
`events(visibleSchedule(true))` + `state` + `policy(curation.json)` + `today` → `Curation.curate()` → 결과 + 머리 줄·가족 일정·혜택·다음 단계·탐색 입력 → `HomeSlotsView.render()` → 홈 패널 innerHTML.

## 2. curate() 호출 위치
| 항목 | 위치 | 비고 |
|---|---|---|
| 호출 지점 | 홈을 그리는 두 함수의 **앞단에서 한 곳으로 모은다**: 0~35개월 `renderHome`(app.js:2391 → `HNHome.render(hnCtx())`)와 36+ `renderHome` 래퍼(app.js:1339~1396, `Over36View.renderHome`). 새 함수 `curatedHomeHtml()`을 app.js에 두고 두 곳이 플래그가 켜졌을 때만 이것을 부른다 | 두 벌 렌더 통합이 1-1 명세의 원칙 |
| events | `visibleSchedule(true)` — 이미 `HNLogic.visibleSchedule` 순수 함수(v1.12.100) | 36+는 `ChildTimeline.isEventShown`(허용 목록 포함)이 이미 걸러 줌 |
| state 조립 | `completed`=app의 `completed` 맵, `isNA`=`isNotApplicable`, `ageMonths`=`ChildTimeline.completedMonths`(임신이면 null), `pregnant`, `birthDate`, `linkDateOf(e)`=`AutoSteps.linkOf(autoLinks(), e).date`(G2), `applyOf`=`usApplyLinkOf`, `canSchedule`=`CalendarModel.isLinkableAuto(e) \|\| AutoSteps.isFamilyLinkable(e, …, new Date())`, `subsidyStatusOf`=`HNLogic.subsidyStatus(e, completed, {today, ageNow, pregnant, birthDate})`(n4 테스트가 호출부 목록을 고정하므로 이 감싸기는 허용 파일에 두거나 테스트의 허용 목록 갱신이 같이 필요), `unknown`=`buildEligibilityUnknown(profile, todoDefinitions, {aliases: policy.aliases, present, ageMonths, today})` | 조건 답(D14)이 저장되면 `unknown`에서 빠지도록(해당 없음=G1, 해당=일반 후보) 1-4에서 확장 |
| policy | `loadAll()`에 `data/policy/curation.json` 읽기 한 줄 + `Curation.normalizePolicy` — 못 읽으면 **null → 플래그가 켜져 있어도 기존 홈**(폴백) | 경고(`policy.warnings`, expandMax 누락)는 콘솔에만 |
| today | `new Date()`를 앱이 만들어 인자로 넘긴다(curate는 시계를 읽지 않음) | 자정 넘김은 기존 홈 갱신 경로(`usRefreshHome`)가 처리 |
| 렌더 입력 | `head`(이름·`ageLabelAt`·지역), `family`(7일 안 USER 일정·연결된 AUTO — 기존 `usHomeCardHtml` 데이터), `benefits`(`cur.moreCounts.benefits`, 확인형 수), `nextStage`(`NextStage.pick` 결과), `explore`(어디갈까는 임신 중 제외 D8, 교육 트렌드는 초등) | |

## 3. 플래그와 공존
- 플래그 `curation`(기본 OFF): `js/feature-flags.js`에 추가. 기존 플래그 테스트(c2b1·d1·g18·household-sync)가 플래그 집합을 정확히 고정하므로 **연결 때 같은 묶음에서 테스트도 같이 갱신**. 켜는 방법은 개발용 `hannun_feature_curation="1"`만(autoLink과 같은 방식). OFF면 현재 코드 경로가 한 줄도 달라지지 않는다(기존 테스트 전부 그대로).
- 공존 방식: OFF → `HNHome.render`/`Over36View.renderHome` 그대로. ON → `curatedHomeHtml()` 결과로 홈 패널 대체. 두 렌더러를 한 화면에 섞지 않는다(영역 순서가 하나라서).
- 이벤트 위임: 렌더러는 `data-hs-act`(apply·schedule·done·confirm-yes/no·review)·`data-hs-go`(calendar·benefits·checklist·month·next-stage·add-schedule)·`data-hs-url`·`data-hs-key`만 단다. app.js 홈 클릭 핸들러에 `[data-hs-act]`·`[data-hs-go]` 분기를 한 곳에 추가: apply→공식 링크 열기(+돌아오면 신청 완료 확인), schedule→기존 일정 넣기 시트(`asOpenSheet` 계열), done→기존 완료 처리(`toggleComplete`), confirm-yes/no→D14 항목 단위 답 저장(기기 저장 우선, 가구 동기화는 Firestore 규칙이라 별도 묶음), review→체크리스트 탭, go→`switchTab`.
- 기존 홈과 겹치는 상태: `home-reappear.json`(7일 전 재등장)은 curate의 `thresholds.reappearDays`와 같은 값이라 G2가 대신한다. 홈 순서(`HomeOrder`)는 한 렌더러로 합치면 불필요 — 가구 기능 OFF 기기도 ON 대상에서 **제외하지 않는다**(hn_pm 2026-10-05, 설계서 §15: 큐레이션 홈은 가족 기능과 무관한 핵심 경험). 가구가 꺼진 기기는 '우리 가족 일정' 영역에 그 기기의 직접 일정을 보여 주고, 그것도 없으면 영역을 숨긴다(06 §4-3 빈 섹션 숨김) — 렌더러 `family` 입력이 null/빈 배열이어도 영역 안내 대신 숨기는 옵션이 필요(아직 없음, 연결 때 추가).
- 데이터 불변: 엔진·schedule.js 판단 로직·Firestore 필드·규칙 변경 없음. 저장이 필요한 건 D14 답뿐(이번 연결 범위 밖).

## 4. 연결 전 게이트(순서)
1. 6명 리포트 v2(curation.json에 bundles·PREG-005·expandMax 반영 뒤 1회) → hn_pm·사용자 판정.
2. 판정 반영(숫자·규칙 조정은 정책 파일, 코드 변경은 최소) → 6명 결과를 테스트 기대값으로 고정(지시서 ⑥).
3. `curation` 플래그 + `curatedHomeHtml()` + 클릭 분기 + 폴백 테스트를 한 묶음으로, 0~36개월 회귀(auto-diff 36·72) 포함, hn_test T2.
4. 플래그 ON 기본 전환은 사용자 확인 후 별도.

## 5. 위험·확인 필요
- (승인됨) 36+ 홈의 '메모장 할 일'(맨 아래로 이동)·'자주 쓰는 일정 칩'은 명세 §1에서 위치만 바뀐다 — 렌더러 입력에 `todosHtml`(기존 마크업)을 받아 맨 아래에 붙이는 훅이 필요(아직 렌더러에 없음).
- 아이가 여럿일 때(아이 칩) curate는 **현재 보는 아이 한 명** 기준 — 칩 전환이 `renderHome`을 다시 부르므로 호출 비용은 칩 전환당 1회.
- 완료 기록이 없는 아이는 오래된 L3가 많아 D18 묶음(REVIEW_PAST)이 첫 화면의 신호가 된다 — 리포트 v2에서 확인.
- 임신 프로필은 `ageMonths=null`이라 나이 게이트가 꺼진다(임신 항목은 별도 판정).

- 임신 프로필(ageMonths=null)은 나이 게이트가 꺼지는 대신 임신 전용 필터를 거치는지 리포트 v2 임신 행으로 확인(hn_pm).

## 6. 커밋 직후 적용할 패치(v1.12.102, 플래그 OFF 기본) — 새 파일 준비 완료
새 파일(앱 미로드): `js/curation.js` · `js/home-slots-view.js` · `css/home-slots.css` · **`js/curated-home.js`**(render 폴백 null·dispatch 클릭 분기·unitOf, 의존성 주입, 테스트 4개 통과 — test/ 밖 pending). 6명 기대값 테스트는 pending/curate-six.test.js(+expected.json).
| # | 파일 | 패치 |
|---|---|---|
| 1 | `js/feature-flags.js` | `flags.curation = false`(기본 OFF), 개발용 `hannun_feature_curation="1"`일 때만 true. **기존 플래그 테스트 4개(c2b1·d1·g18·household-sync) 기대에 `curation` 키 추가** |
| 2 | `index.html` · `sw.js` | `<link href="css/home-slots.css?v=1">`, `<script>` 3개(curation → home-slots-view → curated-home, hn-logic·child-timeline 뒤). sw 캐시 목록에 4개 추가. g1·g13d 등 index 줄 비교 테스트에 새 줄을 정규화에서 빼는 한 줄(2-5와 같은 방식) |
| 3 | `js/app.js` loadAll | `data/policy/curation.json`을 `loadJsonOrNull`로 읽어 `curationPolicy = Curation.normalizePolicy(raw)`(못 읽으면 null → 기존 홈). `policy.warnings`는 `console.warn` |
| 4 | `js/app.js` 새 함수 `curatedHomeHtml()` | 플래그 ON·`curationPolicy`·프로필이 있고 임신 아닌/임신 모두 대상. `events=visibleSchedule(true)`, `state`(연결 메모 §2 표 그대로: completed·isNA·ageMonths·pregnant·birthDate·linkDateOf·applyOf=usApplyLinkOf·canSchedule·subsidyStatusOf·unknown=buildEligibilityUnknown), `head`=아이 이름·ageLabelAt·지역, `family`=가구 ON이면 `usHomeCardHtml` 데이터 7일 일정, **가구 OFF면 이 기기 직접 일정(없으면 null → 영역 숨김)**, `nextStage`=`NextStage.pick`, `explore`=어디갈까(임신 중 제외 D8)/교육 트렌드(초등), `todosHtml`=36+ 메모장 마크업(맨 아래). 결과가 null 이면 기존 경로 |
| 5 | `js/app.js` 홈 두 렌더 | 0~35개월 `renderHome`(app.js:2391)와 36+ 래퍼(app.js:1339~)의 맨 앞에서 `const h = curatedHomeHtml(); if (h) { 홈 패널 innerHTML = h; return; }` 한 줄씩. OFF면 이 줄은 `false`라 기존 코드가 그대로 |
| 6 | `js/app.js` 클릭 | 홈 패널 클릭 위임 한 곳에 `CuratedHome.dispatch(ev.target, handlers)`. handlers: `apply(url,key)`=`window.open(url,"_blank","noopener")`(돌아오면 신청 완료 확인은 기존 시트) · `schedule(key)`=해당 이벤트로 `asOpenSheet`/`usOpenFormFromAuto` · `done(key)`=기존 완료 처리 · `confirm(key,yes)`=`SubsidyTiers.saveAnswers`(키 `hannun_subsidy_answers`, 기기 저장 — 1-4와 같은 저장) 후 홈 다시 그리기 · `review()`=`switchTab("checklist")` · `go(name)`=calendar·benefits(혜택 탭)·checklist·month(월령 탭)·next-stage(시트)·add-schedule |
| 7 | `js/n4 테스트` | `subsidyStatus` 호출부 목록(허용 파일)에 `app.js`의 `subsidyStatusOf` 감싸기 한 곳을 추가 |
| 8 | 테스트 이동 | pending의 curate-six·curated-home·curation unit(m1~m3은 이미 test/)·home-slots 테스트를 test/로, 경로를 상대 경로로 |
- 위 8줄은 한 묶음이지만 **플래그 OFF라 사용자 화면 변화 없음**. 켜는 것(기본 ON 전환)은 hn_test T2(0~36개월 회귀 포함)·사용자 확인 뒤 별도.
- 묶음 5항목 규칙: v1.12.102 = ① 2-5 '가족' 분류 숨김 제거(1줄) ② 1-0 연결(플래그 OFF) ③ 1-4 지원 3단 ④ 1-6 ③ 초등 카드 ⑤ 1-0 테스트 test/ 이동 — hn_main과 나눔 협의.
