# 한눈육아 2.0.99

## 반영
- 홈·캘린더·할일·육아혜택·어디갈까 고정. 성장기록 진입 제거.
- 챙길 것 아래 36개월 미만 전용 체크리스트. 기본 접힘·동일 너비·혜택형 필터.
- 여러 아이 선택은 가족 캘린더 위. 한 명이면 숨김.
- 대표 퍼플과 차콜 혜택 라벨. 역할별 아이콘 3종 및 프로필 수정 폼의 선택·저장·취소.
- 작업 트리의 네이티브 로그인·위젯 구현 및 개인 조사 자료는 이 릴리스에서 제외.

## Firebase 운영 확인 (2026-10-21)
- 운영 familyAccess 소스를 읽어 확인: 마지막 갱신 2026-10-12, setAvatar 액션 없음.
- 운영 Firestore 규칙은 로컬 firestore.rules와 일치. 규칙 파일 수정·배포 없음.
- 이모지는 Admin SDK를 사용하는 familyAccess.setAvatar에서 가족 권한·역할·성별을 검증해 저장한다. 클라이언트 직접 쓰기 권한 확대 불필요.
- 저장 위치: families/{familyId}/members/{memberId}.avatarId, families/{familyId}/childLinks/{childKey}.avatarId.
- avatarId가 없으면 역할별 기본 이미지를 표시하므로 기존 문서 일괄 변경·추가 인덱스·Storage 규칙 변경은 필요 없다.
- 역할은 members.role, 아이 성별은 children/{familyCode}.profile.gender를 기준으로 검증한다.
- 웹 push는 Hosting만 자동 배포한다. 아이콘 저장을 운영에서 사용하려면 familyAccess 함수의 별도 배포가 필요하다. 이번 작업에서는 함수·규칙 배포나 운영 DB 쓰기를 하지 않는다.
- 배포 시 승인된 소스에서 familyAccess 함수만 선택한다: firebase deploy --config firebase.approval.json --only functions:familyAccess --project yuka-planner. 규칙이나 다른 함수는 포함하지 않는다.

## 검증
- 커밋에 등록된 파일만 별도 폴더로 추출해 JS 구문·관련 Node 회귀 검사.
- 고정 메뉴·연령 경계·접기·동일 너비·아이 선택: 실제 Chrome 235개 검사.
- 홈·할일 글자 크기: 실제 Chrome 15개 검사.
- 성장기록 제외 hannun 산출물의 파일 경계 및 로그인 전 부팅 검사.
