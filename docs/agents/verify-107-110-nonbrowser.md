# 107·108·110 묶음 — 비브라우저 검증 준비 (실행은 v1.12.106 커밋 뒤 1회, 지금은 준비만)
작성 hn_dev 2026-10-05. 기준 복사본 /tmp/hn-r110(106 반영본 위 107→108+QA 3건→1-1b 링크).
## ① 적용 순서·diff md5 대조 (저장소 루트, data/ 변경은 포함 안 됨)
```
cd <repo> && git log --oneline | head -1        # 106 커밋이 맨 위여야 함
md5 -q docs/agents/v1.12.107-108-qa-patch-all.diff   # e46062e199765cbe7649c634aac5fc10
md5 -q docs/agents/v1.12.110-1-1b-link.diff          # 184464974b78454039b06c13c7d121ef
git apply --check docs/agents/v1.12.107-108-qa-patch-all.diff && git apply docs/agents/v1.12.107-108-qa-patch-all.diff
git apply --check docs/agents/v1.12.110-1-1b-link.diff        && git apply docs/agents/v1.12.110-1-1b-link.diff   # 반드시 합본 다음
```
## ② 변경 파일과 적용 후 예상 md5 (106 반영본 기준; 신규는 *)
| 파일 | md5 |
|---|---|
| css/style.css | c91f83757d4d2341af71dced30c09fba |
| js/app.js | 3d852e52f612c8336e781f777d00257e |
| js/home-slots-view.js | 878772b1d69e6a5dbc73f54b6c9631b5 |
| js/home-switch.js | cead70a288dd98b868f3843465dbe209 |
| js/month-tiers.js | 9f79f6414ab41c88b501efa5717255c5 |
| js/places-view.js | cbea999b947263d48a5d8a623d233851 |
| test/k10-onboarding-home-design.test.js | ec03cff58f19f1bf60a674c5cf29fd1b |
| test/m12-deadline-text.test.js | 4d8936aa83562ecfa7ab7feeba7163fa |
| test/m14-home-switch.test.js | 2000a33c4fb56730e0bdd7b9f4baca95 |
| test/m15-calendar-deadline-day.test.js* | 53b24d5e19e21001395eb20c98599277 |
| test/m16-sheet-unify.test.js* | c408aa73726d3b80d747ad9e05b70400 |
| test/m17-places-age-basis.test.js* | cb519bb46059e656375e03539c9670b8 |
(대조: `md5 -q <파일>`. index.html·sw.js·데이터 파일은 이 묶음에서 바뀌지 않음. 기준 데이터 places-age-basis.json 68aa80e0 필요.)
## ③ 실행 명령과 36개월 미만 회귀 기준
```
node --test test/*.test.js                                 # 기대 295/295 (106 반영본 280 + 새 테스트 15)
node test/tools/auto-diff.js --base <106 커밋> --scope-months 36 --report /tmp/ad36.txt
node test/tools/auto-diff.js --base <106 커밋> --scope-months 72 --report /tmp/ad72.txt
```
기대: STOP 0·승인 범위 밖 차이 0(이 묶음은 엔진·schedule.js 불변, 도구는 코드만 비교). **36개월 미만 회귀 기준**: ① auto-diff 36 차이 0 ② test/a6-3-cap·h6-under36-head-parity·m5-curate-six(0~12·12~36개월 항목 불변)·f2-week-view·e13 통과 ③ 1-5b·마감 표기·4-2·3-1은 36개월 미만 일정 목록을 만들지 않음(표시 층·CSS·places-view만).
## ④ 플래그 OFF·스위치 안 켠 화면 불변을 단위 테스트로 볼 수 있는 항목
| 테스트 | 고정하는 불변 |
|---|---|
| m15 '앱 연결' | 플래그 OFF·정책 없음·MonthTiers 없음이면 `calendarDeadlineViews`가 목록을 그대로 돌려줌(달력 마감일 칸 이동 없음) |
| m14 '앱 연결' | 키 없음·단계 ①이면 `homeSwitchDecorate`가 아무것도 안 붙임, 링크는 키 "1"에서만, 폴백엔 링크 없음 |
| m6(OFF) | 혜택 탭이 871cac1 문구·구조 그대로(조건 접힘 포함) |
| m12 | 마감·나이 상한·빈 상태 '다음' 월은 home-slots-view(큐레이션 홈 전용) 안에서만 |
| k10·m16 | 새 CSS는 세 시트 범위(`:has(.us-form|.as-steps|.acct-prof-head)`) 안뿐, 새 색 없음(직접 쓴 색 #fff뿐) |
| m17 | 기준표를 못 읽으면(null) '방문 전 확인' 그대로, 나이 필터(ageFits) 결과 불변 |
| 일반 사용자 화면이 바뀌는 곳(OFF에서도) | 4-2 시트 3종(일정·상세·프로필), 어디갈까 도서관·박물관 권장 나이 줄 — 이 둘은 단위 테스트가 아니라 화면 확인 대상 |
