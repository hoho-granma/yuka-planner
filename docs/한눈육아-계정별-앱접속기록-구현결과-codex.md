# 계정별 최근 앱 접속 기록

작성일: 2026-10-09. 사용자 승인으로 Firestore 규칙 배포 완료. 앱 v2.0.28로 저장소에 반영한다. 이전 접속은 복구하지 않으며 새 버전 사용 후 기록한다.

## 저장과 조회

- 저장 경로: `accounts/{uid}/appAccess/{자동생성ID}`. 계정 정보의 `updatedAt`과 분리한다.
- 필드: `schemaVersion: 1`, `accessedAt`(Firestore 서버 timestamp), `appVersion`(실행 중인 APP_VERSION), `reason`(`app_open` 또는 `resume`).
- 기존 계정이 확인된 인증 세션의 시작·로그인과 화면 복귀를 기록한다. 가입·계정 복원 후에도 다시 시도한다.
- 실행 중 같은 계정은 성공한 기록 기준 30분 이내 재기록하지 않는다. 새로고침·앱 재실행은 새 실행이므로 다시 기록한다. 계정 전환은 별개다.
- 동시 요청은 공유하고, 실패 후 1분 이내 요청은 제한한다. 다음 인증·복원·화면 복귀 시 재시도한다. 실패가 로그인·복원·화면 사용을 중단하지 않는다.
- 서버 저장 시각은 정확한 오프라인 실행 시각과 다를 수 있다. 기록은 모든 방문을 보장하는 감사 로그가 아니며 브라우저 종료 시각·머문 시간은 측정하지 않는다.
- IP, 위치, 기기 식별자, 화면별 이동, 아이 정보·이메일·사용자 답변은 넣지 않는다.
- 관리자 SDK 또는 Firebase 콘솔에서 해당 계정 하위 컬렉션을 `accessedAt` 내림차순으로 조회할 수 있다. 최신 한 건은 `orderBy('accessedAt', 'desc').limit(1)`로 조회한다. 사용자용·관리자용 조회 UI는 이번 범위에 없다.

## 권한

본인만 읽기·목록 조회·생성이 가능하다. 계정 없는 UID, 다른 계정 경로, 임의 과거 시각, 추가 필드, 허용하지 않은 reason은 거부한다. 이미 저장한 이벤트의 수정·삭제는 클라이언트에 허용하지 않는다. 관리자 정리는 별도 서버 권한으로 처리한다. 자동 보관기한·TTL은 설정하지 않았으므로 이력은 누적된다.

규칙 변경은 기존 계정 프로필 필드 권한을 넓히지 않고 `accounts/{uid}/appAccess/{eventId}`에만 적용한다. 운영 배포 전 현재 배포 규칙과 로컬 규칙을 diff하고, 다른 미배포 초안이 있다면 배포 사본에서 제외한다.

## 변경 파일과 검증

- `js/app-access.js`: 계정 확인·시각/버전 기록·중복 및 실패 처리.
- `js/app.js`: 인증, 계정 복원/가입, 화면 복귀 연결. 기존 다른 작업 변경은 보존한다.
- `index.html`, `sw.js`: 새 모듈 로딩·오프라인 캐시 대상 추가.
- `firestore.rules`: 본인 접속 이벤트 생성·조회 규칙.
- `test/app-access.test.js`: 기록 필드, 중복 제한, 계정 격리, 실패 재시도, 동시 요청·계정 전환 검사.
- `test/app-access-rules.test.py`: 로컬 에뮬레이터의 별도 `demo-hannun-appaccess` 프로젝트에서 실제 규칙 검사. 운영 데이터에 접근하지 않는다.

`node --test test/app-access.test.js test/account-email.test.js test/family-approval-app.test.js`: 14개 통과. `python3 test/app-access-rules.test.py`: 권한 검사 14개 통과. JavaScript 구문·diff 공백 검사 통과. 운영 규칙 배포 성공 후 API로 정확한 일치를 확인했다. 실제 로그인 기기의 접속 이벤트 저장은 새 버전 실행 후 확인해야 한다.

## 운영 반영

사용자가 push와 Firestore 규칙 배포를 승인했다. firebaserules API로 조회한 이전 운영 규칙은 HEAD와 일치했고, 배포 diff는 접속 로그 블록 13줄 추가뿐이었다. 기존 규칙 백업: `~/Documents/firestore.rules.backup-20261009-122550-before-app-access`(권한 600). `/tmp/hannun-app-access-deploy`에 운영 규칙+접속 기록 블록만 포함한 배포본과 firebase.json을 생성했다.

해당 임시 폴더에서 `firebase deploy --only firestore:rules --project yuka-planner` 성공. 기존 미사용 함수 경고가 있었지만 규칙 컴파일·업로드·릴리스는 성공했다. 배포 후 API로 운영 규칙이 검토한 배포본과 정확히 일치함을 확인했다. 다른 함수·Storage 규칙·계정 데이터는 배포·변경하지 않았다. 앱 버전은 2.0.27에서 **2.0.28**, app.js 캐시 키는 204에서 205로 올렸다. 실제 기기가 새 버전을 실행하면 접속 이벤트의 서버 시각과 appVersion을 확인할 수 있다.
