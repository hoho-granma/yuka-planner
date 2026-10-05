# dev-note — 1-4 지원 목록 3단 연결 메모 (v1.12.102 이후, 검증 동결 중이라 앱 파일 무변경)

> 작성 hn_dev 2026-10-05. 새 파일: `js/subsidy-tiers.js`(순수 모델, 앱 미로드). 테스트는 test/ 밖(`~/Documents/hannun-test-harness/pending/subsidy-tiers.test.js`, 5개 통과) — 검증 끝나면 test/로 이동.

## 1. 한 줄 구조
`HNLogic.subsidyBuckets(...)`(기존, 변경 없음) → `SubsidyTiers.tiers(buckets, {answers, deadlineOf: HNLogic.subsidyDeadline, isUrgent, expandMax})` → 단별 카드 `SubsidyTiers.rowModel(e, ctx)` → `subsidy-view.js`가 마크업(기존 `cardHtml`·`.sub-group-title`·`.sub-cond-toggle` 재사용).

## 2. subsidy-view.js 변경 지도(연결 때)
| 위치 | 변경 |
|---|---|
| 신청 가능 탭 본문(subsidy-view.js:65~) | '지금 신청할 수 있어요' 한 목록 → ① 마감 임박 / ② 확실히 받는 것 두 `.sub-group-title`(비면 제목까지 숨김, 숫자·개수 요약 없음 D16). ② 5개 초과분은 `sureMore` → "N개 더 보기"+'전체 보기 →' |
| 조건형 접이식 | 문구 "조건 확인 N개 보기"(`MSG.condToggle`), 펼치면 카드마다 [해당돼요][아니에요]. 맨 아래 '해당 없음 N개' 접힘(되돌리기 버튼) |
| 카드(`cardHtml`) | 상세 시트는 그대로. 카드 줄은 rowModel: 이름·뱃지 / 대상(조건: …) / 언제(① 와인 `--hn-deadline` 굵게 'D-N · M월 D일까지') / 금액(`amountText` 원문만) / 어디서(`applyPlaceText` 없으면 줄 숨김) / 버튼(신청하러 가기 > 신청 방법 보기, [일정 넣기]는 마감+`isFamilyLinkable`일 때, 마지막 날=`AutoSteps.lastDayOf`) |
| 답 저장 | `SubsidyTiers.loadAnswers/withAnswer/saveAnswers(localStorage)` — 키 `hannun_subsidy_answers`, 항목 단위, Firestore·필드 변경 없음(D14). '해당돼요'는 '신청 완료'(기존 `completed`)와 별개 — 같은 줄에 두지 않음 |
| 36개월 이상(D7) | 혜택 탭 숨김 유지. 홈 한 줄 → 같은 렌더러를 시트로(상태 탭·범위 칩 없이 ①②③만): `render(ctx, {sheet:true})` 옵션 필요 |
| 지역 지원금 '일정 넣기' | 지금 `isFamilyLinkable`은 마감일 있는 지역 지원금만 true(v1.12.99) → 요구와 같음, 변경 없음 |

## 3. 데이터·훅
- `applyPlaceText`·`applyChannel`은 hn_data 트랙(재개 대기). 없으면 '어디서' 줄 숨김 + 공식 안내 링크만(rowModel이 이미 null 처리).
- 1-0 curate와의 관계: 같은 분류(`urgent`=L1·L2, ②=L4·L5, ③=CHECK)지만 서로 호출하지 않는다(3단은 `subsidyBuckets`, 홈은 curate). 홈 한 줄 '받을 수 있는 혜택 N개 · 확인할 것 M개'는 curate `moreCounts.benefits`와 `tiers().conditional.length`를 쓴다.

## 4. 위험·확인
- '해당 없음'은 기존 '미해당'(`completed[id__na]`, 가구 동기화됨)과 다르다: 3단의 '아니에요'는 **기기 저장 별도 답**으로 두었다(spec: "기존 미해당 저장 재사용"이라 적혀 있어 확인 필요 — 재사용하면 가구 동기화로 가족에게 전파된다, 기기 저장 원칙(D14)과 충돌 가능). 이 결정은 hn_pm.
- 36+ 시트에 쓸 후보(D7(a) 마감·신청 행동 있는 지원)는 `auto-after36.json` 확대가 필요 — 이번 범위 밖(hn_data).
