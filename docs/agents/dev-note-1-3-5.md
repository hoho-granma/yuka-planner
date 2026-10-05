# dev-note 1-3 + 1-5 — D3(정보·관찰형은 달력 칸에서 빼고 목록만)·D6(자동 항목 접기 기본 접힘, 일정형 항상 표시) 사전 분석

> 작성 hn_dev 2026-10-05 · 읽기 전용(코드 수정 없음) · 기준 작업 트리 v1.12.98. 가정: `actionType`은 1-0 초안의 3분류(ACT=일정형/행동, CHECK=확인, KNOW=정보·관찰). 정책 파일 `data/policy/curation.json`은 아직 저장소에 없음(hn_data 초안 단계) — 아래는 "그 파일이 생겼을 때"의 변경 지도.

## 1. 지금 달력·월령 탭이 AUTO를 다루는 방식 (분기점)
| 영역 | 위치 | 현재 규칙 |
|---|---|---|
| 일정 유형(3종) | `schedule.js:168-171` | 지원금+시작일=`fixed`, 기간이 좁음(`computeIsDateSpecific`)=`window`, 넓거나 열림=`monthly`. **분류는 날짜 폭 기준**이지 행동·정보 구분이 아님 |
| 추천일 배치 | `hn-logic.js:99-155` `assignDisplayDays` | 지원금 제외 **모든** window·monthly 항목에 추천일 칸을 배정(VX는 같은 창끼리 묶음). 결과 `Map(eventId→Date[])`가 달력 칸·날짜 패널·진행 현황의 유일한 출처 |
| 월 단위 반복 노출 | `app.js:2204-2241` `repeatMonthRangeOf` | 넓은 AGE_WINDOW 관찰·생활 항목을 그 기간의 모든 달 체크리스트 그룹에 반복(완료는 공유) |
| 달력 칸 계산 | `app.js:1690-1693` `computeCalendarDays`, `1696-1700` `calendarDayItems`, `calendar-model.js:193` `cell.planned = plannedOnDay(...)` | `planned`(추천일 표식)와 `benefit`(지원금 기간) 둘 다 칸 표식·`+N`에 들어감(최대 3개, `MAX_MARKS`) |
| 칸 칩 | `user-schedule-view.js:407-424` `cellChips` | 직접=꽉 찬 칩, 자동(t:"a")=옅은 칩+테두리, 칸당 2개+`+N` |
| 월 목록·진행 | `app.js:1708` `calendarMonthProgress`, `1733` `calendarMonthItems`, `1917` `monthlyInMonth` | 같은 `calDisplayDays`·`calendarDotSchedule()`을 읽음 → 칸 표식 개수와 진행률이 같은 출처 |
| 월령(체크리스트) 탭 | `app.js:2318-2345` | 월령 그룹 카드, 열림은 `openMonthGroups`(사용자가 연 것·지금 그룹). 모든 항목이 같은 카드 안에 같은 모양 |
| 칸 안내 문구·토글 | `user-schedule-view.js:76,81-82`, `app.js:4693-4696,4783-4788` | '꽉 찬 칩=직접, 테두리=자동' 안내, '직접 등록한 일정만 보기'·'카테고리별 색' 토글 |

## 2. D3 적용 시 바뀌는 곳 (정보·관찰형 = 칸 제외, 목록은 유지)
핵심은 **`assignDisplayDays` 한 곳에서 걸러내는 것**이다. 출력 Map에 항목이 없으면 `plannedOnDay`·`calendar-model`·`calendarMonthProgress`·`calendarMonthItems`·`asDateFor`가 모두 따라서 바뀐다(소스 하나).
| # | 파일·함수 | 변경 | 비고 |
|---|---|---|---|
| 1 | `hn-logic.js` `assignDisplayDays(events, opts)` | `opts.inCalendar(e)` 술어 추가(없으면 지금과 동일). false인 항목은 슬롯을 만들지 않는다 | **기본값이 현재 동작 → 0~36개월 회귀는 술어를 안 줄 때 0** |
| 2 | `app.js` `computeCalendarDays` (1692) | 술어로 `actionType==="ACT"`(또는 지원금 아님·window형 ACT) 판정 함수를 넘김 | 판정 함수 한 줄, 정책 값 읽기 |
| 3 | `app.js` 월 목록 `calendarMonthItems`(1733)·`monthlyInMonth`(1917) | **그대로 두면 KNOW 항목이 칸에서는 사라지고 목록에는 남는다 = D3 의도.** 단 `calendarMonthItems`가 `plannedInMonth`(추천일 있는 것)을 쓰므로 KNOW는 이 목록에서도 사라질 수 있음 → KNOW를 `monthlyInMonth` 쪽(월 단위 목록)으로 보내는 분기 확인 필요 | 목록 위치 결정은 1-3 설계(월 단위 목록 vs 월령 탭) |
| 4 | `calendar-model.js:193` | 변경 없음(맵을 그대로 읽음) | `cell.planned`가 줄면 칸 `+N`·`counts.planned`·월 요약 문구 숫자가 바뀜 |
| 5 | `app.js:2842` `asDateFor` | 변경 없음: 추천일이 없어도 `fixedDate||windowStart||date`로 대체(KNOW는 일정 넣기 대상 아님) | — |
| 6 | `user-schedule-view.js` 안내문·토글 | 칸에 자동 칩이 줄면 '꽉 찬 칩=직접, 테두리=자동' 안내·'직접 입력만 보기' 토글의 의미가 약해짐. **삭제하지 않기로 한 W0 지시**와 충돌 없게 문구만 조정(가시성 조건 `usKidsAre36Plus` 유지) | 결정은 홈 구조 정리 후(W0) |
| 7 | 36+ `acct36AutoItems`(홈 카드) | 이미 별도 목록(달력 칸 아님) → D3와 무관 | 허용 목록 항목은 대부분 ACT·CHECK |

## 3. D6 적용 시 바뀌는 곳 (자동 항목 접기 기본 접힘, 일정형 항상 표시)
- 월령 탭은 **그룹(월령 카드) 단위**로만 열림/접힘을 안다(`openMonthGroups`, `app.js:2327-2333`). D6의 "항목 단위 접힘"은 **카드 안에 접이식 하위 묶음**이 필요 → `app.js` 체크리스트 렌더(`2328-2345` 부근, 항목 HTML `eventItemHtml` 2085)에서 카드 내부를 `ACT(항상 보임)` + `KNOW·CHECK(<details>식, 기본 접힘)`으로 분기. 마크업 변경이므로 **1-1과 같은 화면 작업에 묶는 것이 안전**(디자인 확정 후).
- 접힘 상태 저장: 기기 저장(기존 `openMonthGroups`는 메모리, `A36.hideDone`은 localStorage 방식 재사용 가능). Firestore 변경 없음.
- 진행률(`monthProgress`)·완료 체크는 항목 id 단위라 접어도 그대로(보이지 않는 항목은 분모에서 뺄지 결정 필요 — 분모를 바꾸면 진행률 수치가 변함).

## 4. actionType 하나로 달력·월령 탭 분기를 대체할 수 있나
- **대체 가능한 것**: (a) 칸 표시 여부(§2-1·2), (b) 월령 탭 접힘 분기(§3). 둘 다 "이 항목이 ACT인가"의 한 술어이므로 `curation.json`의 actionType 한 곳으로 모을 수 있다(1-0의 `curate`가 쓰는 같은 표).
- **지금 분기가 날짜 폭(`isDateSpecific`/`scheduleKind`)이라 완전 대체는 불가**: 같은 ACT라도 window(좁은 기간, 칸 배치)·monthly(넓은 기간)가 있어 **칸 배치 방식(추천일 계산)은 scheduleKind가 계속 필요**하다. actionType은 "칸에 올릴지/접을지"를, scheduleKind는 "어느 날짜 칸에 올릴지"를 맡는 **직교 두 축**.
- **id 매핑 위험**: actionType이 접두사 기본값+예외라(06 §5-1) 미분류 id(신규·지역 지원금 `GG-*`·`GGM-*`·`SEOUL-*`)는 기본값 폴백이 필요. 지원금은 이미 `fixed`(칸)·별도 카드 경로라 D3 대상이 아님(`assignDisplayDays`가 지원금 제외) — 지원금에는 actionType을 적용하지 않는 것이 안전.
- **정책 파일 로딩**: 앱(`loadAll`)에 읽기 한 줄 추가, 못 읽으면 "술어 없음=현재 동작"으로 폴백(기존 허용 목록 로더 `AutoAfter36.load`와 같은 방식).

## 5. 0~36개월 회귀 위험과 보호
| 위험 | 수준 | 보호 |
|---|---|---|
| D3로 칸 표식·진행률 숫자가 바뀜(관찰·생활 항목이 칸에서 빠짐) | **높음(의도된 변화)** — 0~36개월 달력이 가장 크게 달라짐 | 술어 기본값=현재 동작이므로 코드 변경 자체는 0 회귀. 정책 적용은 **별도 플래그/단계**로 켜고, `test/qa-month-compare.js`(월별 비교 도구)·auto-diff 36·72개월로 "빠진 항목이 전부 KNOW인지, ACT가 하나도 안 빠졌는지" 검증 |
| VX 묶음(`gkey`)이 술어와 얽힘 | 중 | 술어 통과 후 묶음 계산(순서 고정). `hn-logic` 테스트 + h6 |
| 진행률 분모 변경 | 중 | 분모 정의를 먼저 결정(KNOW 포함/제외) 후 테스트 기대값 갱신 |
| `repeatMonthRangeOf` 반복 노출과 D6 접힘 상호작용 | 낮음~중 | 반복 항목은 KNOW라 접힘 안에 들어감 — 완료 공유 규칙 그대로 |
| 36개월 이상은 이미 허용 목록 | 낮음 | 영향 거의 없음(칸에 점이 없음, G21·G22) |
- 권장 순서: ① `assignDisplayDays` 술어 추가(기본 무변경)+테스트 → ② 정책 읽기+술어 연결(플래그 OFF 기본) → ③ 6명 리포트·월별 비교로 빠지는 항목 검토 → ④ 사용자 확인 후 ON → ⑤ D6 접힘은 1-1 홈·월령 마크업과 함께.
- 예상 규모: D3 코드 S~M(함수 1개+연결+테스트), D6 M(체크리스트 마크업·CSS·접힘 상태), 6명·월별 검증 S.

## 6. 막히는 점·결정 필요
1. `calendarMonthItems`(추천일 기반)와 `monthlyInMonth`(월 단위) 중 KNOW를 어디서 목록으로 보여 줄지(1-3 설계) — 현재는 둘 다 칸과 같은 `calDisplayDays`를 읽는 경로가 섞여 있다.
2. 진행률 분모에서 KNOW를 뺄지.
3. `actionType` 미분류 id 폴백값(ACT로 두면 칸이 현재 그대로, KNOW로 두면 빠짐 → **ACT 폴백 권장**: 안전한 쪽=현재 동작).
4. D3와 W0 지시('직접 입력만 보기'·범례 삭제 금지) 정합: 안내 문구만 조정.

## 7. 커밋 뒤 패치(1-3+1-5 연결, v1.12.103 이후 — 앱 파일은 지금 무변경)
새 파일(앱 미로드): `js/month-tiers.js`(순수: classify·inCalendarOf·whyOf·group·groupFold·calendarCard) + `js/curation.js`에 `classify`·`describe` 내보내기 추가(판정 동작 불변, curate 6명 기대값 7/7 통과 유지). 테스트 7개 pending(month-tiers.test.js).
| # | 파일 | 패치 |
|---|---|---|
| 1 | `js/hn-logic.js` | `assignDisplayDays(opts.inCalendar)`는 이미 들어 있음(v1.12.99). 변경 없음 |
| 2 | `js/app.js` computeCalendarDays(1692) | `HNLogic.assignDisplayDays(events, { …, inCalendar: curationOn ? MonthTiers.inCalendarOf(tierCtx) : undefined })` — **플래그(curation) OFF면 술어 없음 = 지금과 동일**. tierCtx = { policy: curationPolicy, today, state, startOf }. 정책이 null이면 술어 없음(폴백) |
| 3 | `js/app.js` 월령 탭 렌더(2318~2345 부근, `eventItemHtml`) | 그룹 카드 안을 `MonthTiers.group(items, ctx)`로 분기: 머리 배지 "남은 N개"(0이면 숨김, `MSG.remaining`), 1층 `.mg-sec-h` '이번 달 챙길 것'(할 것·곧 준비 'M월 D일부터') + 항목 아래 `.ev-why`, 2층 `<details class="mg-know">` '이 시기 알아두기 N개 ›'(기본 접힘, 관찰·해볼 것·주의 구분 머리), 주의 [확인했어요]→`mg-acked` 접힘('확인한 것 N개', 기기 저장 `hannun_month_acked`). KNOW 목록 출처는 기존 `monthlyInMonth` 그대로 |
| 4 | `js/app.js` calendarMonthProgress·진행 현황 | 분모에서 KNOW 제외(`MonthTiers.classify(e).layer===1`만 센다) — **테스트 기대값 갱신 필요**(k5·a6-6·hn-logic 진행률) |
| 5 | `js/app.js` 달력 위 카드(1733 `calendarMonthItems`) | `MonthTiers.calendarCard(items, ctx)`의 head·list·knowLabel 사용. '직접 등록한 일정만 보기'·범례 문구는 그대로 |
| 6 | 마감형 지원 칩 "마감 " 글자 | `UserScheduleView.cellChips`의 자동 칩 title 앞에 "마감 "(마감일 칸 이동은 `schedule.js:299` fixedDate를 마감일로 — 별도 항목, 엔진 판단 로직 변경이라 hn_pm 확인 후) |
| 7 | 그룹 접기 | `MonthTiers.groupFold(keys, nowKey, ['check','school'])`로 지금 다음 1개만 접힘 표시, 나머지는 목록 맨 아래 "나중 시기 N개 그룹 보기 ›" |
| 8 | CSS | `.mg-sec-h`·`.ev-why`·`.mg-know`·`.mg-ack` 기존 클래스 모양 재사용(새 색 없음) — scoped 추가는 연결 때 |
- 위험: ②는 플래그가 ON일 때만 달력 칸이 줄어든다(0~36개월 회귀는 hn_test T2 범위: 칸 수가 줄어든 항목이 전부 KNOW인지 qa-month-compare로 확인).
