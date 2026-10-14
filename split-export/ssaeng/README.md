# 쓰앵님으로 옮길 코드 보관본 (성장기록·교육)

원본은 한눈육아 리포의 같은 경로에 그대로 있다(이 폴더는 복사본). 한눈육아 빌드는 `tools/build-dist.py --app hannun`으로 이 묶음을 뺀다. 쓰앵님에 붙일 때 이 폴더를 기준으로 하고, 한눈육아에서의 삭제는 붙인 뒤에 한다.
분리 계획: `docs/서비스분리-마이그레이션계획.md` · 파일 목록: `tools/app-profiles.json`(ssaeng).

## 구성
- `js/` 16개 — growth-(evidence·sync·records·learning-view), learning-check(-bank), education-(reference·research·reference-view·interests·public-programs·directory·info), edu-(trend·3to5-view), curriculum-map-data
- `css/` 3개, `learning-check-paper.html`, `curriculum-map.html`, `data/education/`
- `test/` 14개 — 위 파일들의 단위 테스트
- `app-fragments/` — `app.js`에서 이 기능을 부르는 함수 발췌(참고용, 실행 안 함): `education.js`(교육 트렌드 탭), `growth.js`(성장 탭·기록 입력)
- Cloud Functions `functions/education-directory/`는 폴더가 이미 독립이라 복사하지 않았다(원본 그대로).

## 이 묶음이 기대는 공통 코어 (쓰앵님 리포가 코어로 받아야 함)
`js/child-timeline.js`, `js/over36-view.js`, `js/capture/photo-compress.js` — 이 외 공통 파일은 직접 쓰지 않는다 (`test/app-profiles.test.js`가 검사).

## app.js 결합 지점 (붙일 때 다시 만들어야 하는 것)
- 탭 이름 `growth`·`trend`(`TAB_NAMES`), 하단 내비 버튼(`data-nav="growth"`), `applyTabLayout()`, `growthActive()` 분기
- 홈의 성장기록 카드(`gr-home-card`, `data-growth-home`), 성장 입력 시트(`hnOpenGrowthForm`)
- 36개월 이상 교육 탭(`acct36EnsureTrend`·`acct36RenderTrend`·`acct36Edu3to5State`)
- 위 조각들이 쓰는 `app.js` 지역 변수(`profile`, `acct`, `hh`, `currentTab`, `schoolPolicy`, `familyCode` 등)와 헬퍼(`el`, `esc`, `childDisplayName` 등)

## 저장소·데이터 (경로는 바꾸지 않는다 — 한눈육아와 같은 Firebase 프로젝트·가구를 공유)
- Firestore: `families/{hid}/growthRecords/{recordId}` (규칙: `firestore.rules`의 growthRecords 블록)
- Storage: `families/{hid}/growthRecords/{recordId}/image_<sha256>`·`thumb_<sha256>` (규칙: `storage.rules`)
- 브라우저 로컬: IndexedDB `hannun-growth-records`, `hannun-learning-checks`, localStorage `hn-growth-hidden-lessons|…`
- 규칙·저장소 설정은 규칙 소유 리포(한눈육아)에서 관리 — 쓰앵님에 붙인 뒤 필요하면 조정한다 (지금은 건드리지 않음).
