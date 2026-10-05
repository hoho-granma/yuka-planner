# dev-note — 1-6 ③ 다음 단계 '무엇이 달라지나' 카드 연결 메모 (v1.12.102 이후, 앱 파일 무변경)

> 새 파일 `js/next-stage-card.js`(순수: cardOf·infoVisible·firstOpenItem·render, 앱 미로드). 테스트 4개 통과(test/ 밖). 명세 docs/한눈육아-디자인명세-다음단계카드.md.

## 데이터(hn_data 반영 완료 확인 필요)
- `next-stage.json` 단계에 `changes: [문장 1~3개]` · `changesSource`(선택). **문장이 없는 단계는 카드를 만들지 않는다(비노출)**. TO_3_5는 `infoWindowMonths: 6`(hn_data 반영됨, md5 3f7852fa) — 정보 카드만 30개월부터(배너 `windowMonths`는 그대로).
- `changes` 문장은 아직 data에 없다(① 30개월 3줄·③ 6~7세 3줄은 명세에 있으나 JSON에는 미입력) → hn_data 재요청 대상: TO_3_5 changes 3줄 + TO_SCHOOL changes 3줄(교육부 보도자료 2025-11-26 근거 changesSource).

## 연결(패치 목록)
| 파일 | 변경 |
|---|---|
| `js/next-stage.js` `normalizePolicy` | 단계에 `infoWindowMonths`(정수), `changes`(문자열 배열), `changesSource`(문자열)를 통과시킨다(없으면 생략) |
| `js/next-stage.js` `proposal` | 지금은 '배너가 보이는 단계'만 반환 → 정보 카드 창(30~32개월)에는 배너 없이 시트만 열 수 있어야 하므로, 정보 카드가 필요한 경우 `cardOnly`로 제안을 만든다: age 단계에서 `infoWindowMonths`는 있고 `windowMonths`는 아직 아니면 `proposal.cardOnly = true`(배너 숨김, 홈에 정보 카드 한 줄 진입점이 없으면 이 경우는 시트 진입이 없다 — **진입점이 필요한지 hn_design/hn_pm 결정 필요**. 명세는 "배너를 누르면 카드가 맨 위에 있는 시트"라 30~32개월에는 보이는 곳이 없음) |
| `js/next-stage.js` `renderSheet` | intro 아래·`.ns-chain` 위에 `NextStageCard.render(stagePolicy, kid, m.items)` 삽입. 행동 버튼은 `data-ns-first` 항목(첫 미완료)의 기존 [링크]/[일정 넣기] 재사용 |
| `index.html`·`sw.js` | `js/next-stage-card.js` 추가(next-stage.js 앞), CSS `.ns-change`는 기존 시트 카드 규칙 재사용(+ `.ns-change h4`·`ul`만 style.css에 scoped 추가) |
| 테스트 | k3 단계 목록 고정·시트 마크업 비교가 있으면 카드가 없는 입력에서 변화 0(데이터에 changes 없으면 완전 동일) 확인 |

## 위험·결정 필요
1. 30개월 정보 창에는 홈 배너가 없다 → 카드를 볼 진입점이 없다(위 표). 배너 창 33개월로 합치거나 홈 '알아두기'에 카드 진입 한 줄을 두는 결정이 필요.
2. `changes` 문장 데이터(hn_data)가 먼저 있어야 화면에 나온다 — 없으면 코드가 들어가도 변화 0.
