# dev-note — v1.12.103 한 묶음 패치 순서안 (1-3+1-5 month-tiers · 1-4 subsidy-tiers · 3~5세 교육 탭 · 1-6 카드), 메모만

> 작성 hn_dev 2026-10-05. v1.12.102가 hn_test 검증·커밋을 통과한 뒤 적용(앱 파일 동결 유지 중). 새 파일(앱 미로드): `js/month-tiers.js`·`js/subsidy-tiers.js`·`js/next-stage-card.js`·`js/edu-3to5-view.js`(+ 2단계 `js/capture/*`). 묶음은 5항목 이내(운영규칙).

## 1. app.js 겹침 점검(같은 파일·같은 영역을 건드리는가)
| 연결 | app.js 영역(현재 줄) | 다른 파일 | 겹침 |
|---|---|---|---|
| 1-3+1-5 month-tiers | `computeCalendarDays`(1781, `assignDisplayDays` 호출에 `inCalendar` 술어), `renderChecklistTab`(2363, 월령 그룹 카드), 진행률·달력 위 카드(`calendarMonthProgress`·`calendarMonthItems`), `loadAll`의 policy 읽기(이미 v1.12.102에서 `curationPolicy`) | user-schedule-view.js(칩 '마감 ' 글자), style.css(`.mg-*`·`.ev-why` scoped), hn-logic 변경 없음 | **영역은 다름** — 단 `curationPolicy`와 플래그에 의존 |
| 1-4 subsidy-tiers | `renderSubsidyTab`(2490, `HNSubsidyView.render(hnCtx())`)에 ctx 필드 추가(answers·isNA·deadlineOf·expandMax·applyOf·canSchedule) — **app.js는 몇 줄**, 본체 변경은 **subsidy-view.js** | subsidy-view.js(3단 렌더), 36+ 홈 한 줄 → 시트(`curated-home`의 `go:"benefits"` 처리) | month-tiers와 **다른 영역**. 다만 `hnCtx()`(5656 부근, 두 곳 공유)에 필드를 추가하므로 같은 함수를 건드림 |
| 3~5세 교육 탭 | `acct36RenderTrend`(1329, `Over36View.renderTrend` 호출 분기) — 3~5세면 `Edu3to5View.render(st)` | over36-view.js(변경 없음, TREND 재사용), 처음학교로·기관 링크는 데이터 확인 전 비노출 | 다른 영역. **36+ 홈 한 줄 시트**(1-4)와는 별개 |
| 1-6 카드 | app.js 변경 없음(`nsOpenSheet`→`NextStage.renderSheet`) | next-stage.js(normalizePolicy 통과 키·renderSheet에 카드 삽입), next-stage.json(hn_data `changes`) | **app.js 겹침 없음**, 데이터가 선행 |
- 결론: **같은 줄·같은 함수 본문을 두 연결이 동시에 고치는 곳은 없다.** 공유 지점은 3곳뿐: ① `hnCtx()`(1-4가 필드 추가, month-tiers는 별도 ctx 사용) ② `index.html`·`sw.js` 스크립트 목록 ③ 기존 테스트의 소스 일치 단언(h5·g22·k5·a6-6·hn-logic 진행률 등 — 항목별 갱신, 서로 다른 테스트).

## 2. 제안 순서(v1.12.103, 5항목)
| 순서 | 항목 | 이유 |
|---|---|---|
| ① | 1-4 지원 목록 3단(subsidy-view.js + `hnCtx` 필드 + subsidy-tiers.js 로드) | 플래그 불필요(정책 없이 `subsidyBuckets` 기반, expandMax 없으면 제한 없음). 영역이 가장 독립적이고 hn_data 선행 없음 |
| ② | 3~5세 교육 탭(Edu3to5View, `acct36RenderTrend` 분기) | 독립(over36-view 무변경). B1은 CR 유아반 시기 항목만, B2는 NAT-020·SB-08, B3·처음학교로는 링크 확인 전 비노출 |
| ③ | 1-3+1-5 달력 칸 술어(`inCalendar`, 플래그 curation ON일 때만) + 마감 칩 글자 | **0~36개월 달력 칸이 줄어드는 유일한 변경**이라 단독 검증(hn_test T2·qa-month-compare)이 필요 — 플래그 OFF 기본으로 넣고 별도 켜기 |
| ④ | 월령 탭 그룹 카드 두 층·남은 N개·접힘(month-tiers) | ③과 같은 플래그·같은 정책. 진행률 분모 테스트 기대값 갱신이 있어 ③과 분리하면 테스트 갱신 범위가 작아진다 |
| ⑤ | 1-6 카드(`next-stage-card`)·3-5세·초등 changes 문장 | **hn_data 문장 선행**(next-stage.json `changes`). 문장이 없으면 코드 들어가도 변화 0이라 맨 뒤 |
- 2단계(붙여넣기·음성: js/capture/*)는 단계 1 연결이 끝난 뒤 별도 묶음(진입점 칩이 일정 추가 시트를 건드림 — `renderFormG13`/`renderForm`).
- 5항목을 넘기지 않으려면 ③④를 한 묶음으로, ⑤를 v1.12.104로 미룰 수 있다(⑤는 데이터 의존).

## 3. 위험·선행조건
- ③④는 `curation` 플래그(ON일 때만 정책을 읽음) 안에서 동작해야 0~36개월 회귀가 0 — month-tiers는 정책 없으면 모두 1층(현재 동작)이라 안전하지만, 플래그 OFF에서는 아예 호출하지 않는 쪽이 더 단순(술어 없음).
- ① subsidy-tiers의 '아니에요' 저장 키(`hannun_subsidy_answers`)는 v1.12.102 큐레이션 홈의 확인 답과 **같은 키**다 — 두 화면의 답이 공유된다(의도, hn_pm 확인).
- ② 처음학교로·B3 공식 링크는 조사 결과(hn_research→hn_data) 전 비노출: 코드에 URL을 넣지 않는다(`find.links`는 주입).
