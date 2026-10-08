# D 계정(회원가입·로그인·가족 연결) 배포·검증·켜기 절차

대상: Firebase 프로젝트 `yuka-planner` (Authentication + Firestore). 사용자가 직접 실행합니다(이 문서의 명령은 Claude 세션이 대신 실행하지 않습니다).
목적: 계정 기능(`hannun_feature_accounts`)에 필요한 Auth 설정과 보안 규칙을 올리고, 서버 PASS를 확인한 뒤 실기기에서 시나리오를 확인합니다.

> 한 줄 요약: **Auth 켜기 → 규칙 백업 → 규칙 배포 → 서버 검증 2종 PASS → 테스트 문서·계정 정리 → 플래그 켜고 실기기 확인 → 문제 시 롤백.**
> 규칙은 운영 데이터 전체(`families`, `households`, `accounts`)에 적용됩니다. 5·6번이 전부 PASS가 아니면 플래그를 켜지 마세요.
> 현재 repo의 `firestore.rules`에는 **C2 autoRef 규칙과 D2 accounts·members.uid 규칙이 함께** 들어 있어, 한 번의 배포로 둘 다 올라갑니다. C2 절차서: [한눈육아-C2-규칙배포-절차.md](한눈육아-C2-규칙배포-절차.md) (C2 규칙을 이미 배포했다면 이번 배포는 accounts 블록과 uid 규칙만 추가됩니다).

## 0. 준비
- `cd ~/Documents/10-workspaces/14-육아지기/04-자체서비스/한눈육아`
- `firebase login:list`로 로그인 확인(없으면 `firebase login`). `.firebaserc` default = `yuka-planner`.
- `git status`에서 `firestore.rules`가 수정 상태가 아니고, D2 이후 커밋(accounts 블록 포함)인지 확인합니다.

## 1. Firebase 콘솔: Authentication 설정
1. 콘솔 → 프로젝트 `yuka-planner` → **Authentication** → **시작하기**.
2. **Sign-in method** → **이메일/비밀번호** → 사용 설정(이메일 링크 없이 비밀번호만) → 저장.
3. **설정 → 승인된 도메인**에 `hoho-granma.github.io`가 있는지 확인(없으면 추가). `localhost`는 기본 포함입니다.
4. (선택) 템플릿 탭에서 비밀번호 재설정 메일 문구·발신 이름을 확인합니다 — 앱의 '비밀번호를 잊으셨나요?'가 이 메일을 씁니다.

## 2. 현재 배포된 규칙 백업 (가장 중요)
1. 콘솔 → Firestore Database → **규칙** 탭의 내용 전체를 복사해 `~/Documents/firestore.rules.backup-YYYYMMDD`로 저장합니다(repo 파일이 아니라 **지금 게시된 규칙**).
2. 파일이 비어 있지 않은지 열어 확인합니다.

## 3. 배포 전 로컬 확인 (1분)
- `for t in test/*.test.js; do node $t >/dev/null || echo FAIL $t; done` — 출력이 없으면 통과(서버 호출 없는 테스트).

## 4. 규칙 배포
- `firebase deploy --only firestore:rules --project yuka-planner`
- `Deploy complete!`가 보이면 성공. 에러가 나면 5번으로 가지 말고 메시지를 전달하세요(규칙은 바뀌지 않은 상태).
- 배포 직후 기존 기능 스폿 확인: 가족 코드로 불러오기, 완료 체크, 가족 캘린더 일정이 평소처럼 되는지 봅니다.

## 5. 서버 검증 ① 계정 규칙 — 전부 PASS여야 함
1. `python3 -m http.server 8765` 실행(그대로 둡니다).
2. 브라우저로 `http://127.0.0.1:8765/test/firestore-account-manual-test.html`을 엽니다(`file://` 금지).
3. 확인란 체크 → **[실행]**. 일회용 이메일 `zz-hannun-test-…@example.com` 2개와 `accounts/<uid>`·`households/zz-acct-…` 문서를 운영에 실제로 만듭니다.
4. 요약이 **PASS만 있고 FAIL 0 · ERROR 0**이어야 합니다. 복사용 JSON을 그대로 전달해 주세요.
5. FAIL/ERROR가 하나라도 있으면 **9번 롤백**으로 가고 이후 단계는 하지 않습니다.

## 6. 서버 검증 ② autoRef 규칙
- 같은 서버에서 `http://127.0.0.1:8765/test/firestore-autoref-manual-test.html` → 체크 → [실행] → 전부 PASS 확인(상세는 C2 절차서 4번). 끝나면 터미널에서 `Ctrl+C`로 서버를 종료합니다.

## 7. 콘솔의 테스트 문서·계정 정리 (직접)
보안 규칙상 문서 삭제는 앱/페이지에서 불가하므로 콘솔에서만 지웁니다.
1. Firestore 데이터 탭: 5·6번 화면 맨 아래에 표시된 경로(`households/zz-acct-…/members`, `households/zz-autoref-…/schedules`)와 `accounts/<테스트 uid>` 문서를 삭제합니다. 이전 검증의 `zz-c1test-…` 등 `zz-`로 시작하는 문서도 확인하고 지웁니다(진짜 가구·가족 문서는 `zz-`로 시작하지 않으니 이름을 확인하세요).
2. Authentication → 사용자 탭: `zz-hannun-test-…@example.com` 계정이 남아 있으면 삭제합니다(페이지가 지우지만 중간에 멈췄다면 남을 수 있음).

## 8. 계정 플래그 켜고 실기기 확인 (이 기기·브라우저에서만)
플래그는 서버가 아니라 **각 기기 브라우저의 localStorage**입니다. 개발자 도구 콘솔에서 `localStorage.setItem("hannun_feature_accounts", "1")` 후 새로고침(가족 캘린더 플래그도 함께 켜집니다).
준비물: 본인 폰 2대, 또는 일반 창 + 시크릿 창(각각 다른 이메일 사용).

체크 항목 (전부 확인):
1. 랜딩에 '회원가입·로그인'이 보인다(플래그를 끈 기기엔 안 보인다).
2. 기기 A(엄마): 이메일 가입 → 가입 안내가 보이고 로그인 상태가 된다. 가족 코드는 비워 새 가족을 만든다.
3. A: 이름·생년월일 미리 채워진 아이 입력 화면 → 지역·출생순서 입력 → 체크리스트가 정상 표시된다.
4. A: 내 정보 시트에 이름·'나(엄마)'·이메일·로그아웃·'가족 캘린더 코드(8자리)'가 보이고, 아이 코드는 접힌 '아이 기록 코드'에 있다.
5. A: + 메뉴 → '가족 초대하기'에서 8자리 코드 복사.
6. 기기 B(아빠): 가입 시 그 코드를 입력해 합류 → 가족의 아이가 불러와진다.
7. A·B 캘린더에 서로의 칩('나(엄마)'/'아빠' 등)이 보이고, A에서 담당자 아빠로 일정을 만들면 B의 '나' 기본 화면에 보인다.
8. B 로그아웃 → 다시 로그인하면 같은 가족·일정이 복원된다. 로그아웃 후 가족 캘린더 연결만 해제되고 아이·체크 기록은 남아 있다.
9. 가입 없이 쓰던 기기(아이·가족 캘린더가 이미 있는 기기)에서 가입/로그인 → 데이터가 사라지지 않고, 가족이 다르면 '내 계정 가족 쓰기 / 이 기기 아이를 가족에 추가' 선택 시트가 뜬다.
10. 플래그를 끄고(`localStorage.removeItem("hannun_feature_accounts")`) 새로고침하면 계정 UI가 사라지고 기존 동작 그대로다.

## 9. 롤백
1. **플래그부터 끕니다**: `localStorage.removeItem("hannun_feature_accounts")` → 새로고침(앱은 계정 없이 기존 동작으로 돌아갑니다. 앱 코드는 규칙과 독립).
2. **규칙 되돌리기**: 2번 백업을 콘솔 규칙 탭에 붙여넣고 **게시**하거나, 백업을 `firestore.rules`로 복사해 4번 명령을 다시 실행합니다(덮어쓰기 전에 repo 파일은 복사로 보관). 콘솔의 이전 게시 버전 복원 기능은 — 추가검증 필요(사용 가능 여부).
3. 이미 만들어진 계정·accounts 문서는 규칙을 되돌려도 삭제되지 않습니다(Authentication 사용자 탭에서만 삭제 가능). 롤백 후 5번 페이지를 다시 돌리면 FAIL이 정상입니다(옛 규칙).

## 출시 전 결정 (열린 질문)
- 모든 사용자에게 계정 기능을 켜는 시점과 방법: 지금은 기기별 localStorage 플래그뿐이다. 기본값을 켤지, 먼저 일부 사용자에게만(초대·링크 쿼리 등) 열지, 한 번에 전환할지.
- iOS 홈 화면 앱·TestFlight 사용자는 개발자 도구가 없어 localStorage 플래그를 켜기 어렵다 — 켜는 방법(앱 내 숨은 스위치 등)이 필요한가 — 추가검증 필요.
- 비밀번호 분실·이메일 변경·계정 삭제를 앱 안에서 어디까지 제공할지(현재는 재설정 메일만).
- 가입 없이 쓰는 기존 이용자를 가입으로 이끌지(안내·배너), 계속 비가입 사용을 허용할지.

## 2026-10-08 검증 데이터·구 컬렉션 정리

- 사용자 삭제 승인 후 이번 운영 검증용 Auth 계정 2개 삭제 및 조회 시 부재 확인. 해당 검증 가족·아이·초대·참여 요청·권한·성장기록 문서와 테스트 이미지도 삭제했다.
- 현재 복사본과 필드가 동일하고 하위 문서가 없는 예전 아이 프로필 `families` 4개를 삭제했다. 현재 가족 루트 4개는 유지한다.
- 현재 복사본과 동일한 `householdCodes` 4개, `placeStats` 1개 및 만료된 `familyRateLimits` 4개를 삭제했다. 삭제 시 원본 updateTime 조건으로 동시 변경을 보호했다.
- 삭제 전 비공개 백업: `/private/tmp/hannun-family-rollout/legacy-backup.json`. 이 파일은 운영 데이터이므로 Git에 등록하지 않는다. 임시 폴더이므로 영구 백업으로 간주하지 않는다.
- `households`는 일괄 삭제하지 않았다. 55개 문서/상위 경로 중 38개가 현재 경로와 동일하지만 일정 5개는 내용이 다르고 12개 경로는 직접 대응하지 않는다(상위 빈 경로 2개·아이 연결 10개). 데이터 이전 여부를 확인한 뒤 정리해야 한다.
- `familyInviteCodes`는 이전 방식의 코드 매핑이다. 승인 기능에서는 사용하지 않으며 접근 차단 상태지만, 호환 코드와 롤백 범위를 확인하기 전까지 유지한다.
- `familyAccess`, `childAccess`, `familyJoinRequests`, `privateFamilyInvites`, `familyRateLimits`는 승인·권한·초대·요청 제한을 위한 새 구조다. 테스트 삭제 후 빈 컬렉션은 콘솔 목록에서 사라질 수 있고 실제 사용자 동작 시 다시 생성된다. `familyAccess`는 루트 문서가 없어도 하위 members가 있는 정상 구조다.
- 원본 스냅샷과 비교했을 때 이번 정리 전부터 accounts 2개가 없었다. 나머지 원본 families 17개·children 5개·familyInviteCodes 4개·accounts 4개는 정리 전 동일했다. 이전의 '원본 32개 보존'은 배포 검증 당시 결과이며 현재 전체 불변을 뜻하지 않는다.
- App Check는 사용자 요청대로 보류한다. 요청 제한 기록의 TTL 자동 삭제 설정은 별도 미완료 항목이다.

## 2026-10-08 후속 실데이터 비교·최적화 설계

전체 컬렉션과 하위 경로를 페이지네이션하여 다시 조회했다. 현재 최상위 컬렉션 8종: accounts(4), children(5), families(루트 4/하위 포함 53), familyAccess(상위 빈 경로 4/권한 문서 5), childAccess(4), placeUsageStats(1), households(루트 4/상위 빈 경로 2/하위 포함 53), familyInviteCodes(4). 괄호의 문서 수는 이 조회 시점 값이다.

기존 일정 5개는 모두 현재 families의 updatedAt이 더 최근이다. 영도·Wellness day는 현재 삭제 표시가 있으며, 영도에는 반복 회차 취소도 있다. 서윤레이나생파는 종일에서 15:00~22:00 및 친구 분류로 변경됐다. 가족 행사(진부)는 엄마 생파로 이름·메모·행사 분류가 바뀌었다. DBT 미팅 (광화문)은 회사 분류가 추가됐다. 구 데이터를 현재 데이터에 덮어쓰면 삭제된 일정을 되살리거나 수정을 되돌리므로 병합하지 않는다.

직접 대응하지 않는 구 아이 연결 10개는 은찬 9개·아이1 1개이며 연결된 children 프로필이 없다. 전체 구 아이 연결 14개 중 나머지 4개는 현 childLinks와 동일하다. 상위 빈 households 경로 2개는 하위 기록 때문에 콘솔에 보이는 경로다.

최적화 순서(큰 구조 변경은 먼저 설계 보고):
1. 구 households 전체 및 familyInviteCodes 정리: 구 일정의 최신성 비교를 확인했고, 남은 연결은 프로필 없는 테스트 흔적이다. 구 코드 생성·조회가 승인 기능 분기에서 실행되지 않는지 및 구 앱/롤백 범위를 확인한 뒤 비공개 백업과 수정 시점 조건을 적용하여 삭제한다. 현재 가족/아이/일정은 변경하지 않는다.
2. familyRateLimits.expiresAt은 Timestamp이므로 TTL 자동 삭제 대상으로 설정한다. privateFamilyInvites.expiresAt은 숫자 밀리초이므로 그대로 TTL 필드로 사용할 수 없다. 초대 기록을 정리하려면 별도의 Timestamp 정리 필드와 승인 대기 요청 처리 정책을 먼저 설계한다.
3. families/members와 familyAccess/members는 표시 데이터와 권한 데이터를 분리한 구조다. 컬렉션 수를 줄이려고 합치지 않는다. 서버 트랜잭션의 일관성을 유지한다.
4. DBPaths의 구 명칭 변환·승인 이전 분기는 호환성 확인 후 정리한다. 코드의 households 문자열이 실제 구 컬렉션 접근을 의미하지는 않는다.
5. 월별 일정 조회·리스너 중복 여부를 측정한 뒤 쿼리를 최적화한다. 반복 일정과 예외를 누락하지 않는 조회 기준이 필요하다. 단순 컬렉션 수 축소 자체를 비용 최적화의 근거로 삼지 않는다.

최종 구조는 상시 6종(accounts, children, families, familyAccess, childAccess, placeUsageStats)과 동작 시 생기는 3종(privateFamilyInvites, familyJoinRequests, familyRateLimits)을 유지하는 설계다. App Check는 계속 보류한다. 이 후속 확인에서는 추가 삭제나 규칙 배포를 하지 않았다.

## 2026-10-08 최적화 1~4 적용 결과

사용자가 1~4 전체 진행을 승인했다.

| 작업 | 결과 |
|---|---|
| 1. 구 컬렉션 정리 | households 문서 53개·familyInviteCodes 4개 삭제. 실제 삭제는 하위 문서까지 포함했고 모든 삭제에 updateTime 조건을 걸었다. 현재 사용하는 문서 72개는 삭제 전후 필드 동일 확인. 현재 최상위 컬렉션 6종. |
| 2. 임시 기록 자동 정리 | familyRateLimits.expiresAt, privateFamilyInvites.purgeAt, familyJoinRequests.purgeAt의 TTL 모두 ACTIVE 확인. 세 필드는 단일 필드 인덱스 제외. 가족 승인 서버 업데이트 후 ACTIVE·Node22·App Check false 확인. |
| 3. 조회·구독 최적화 | 승인된 가입/로그인에서 일정·할 일 전체 조회 후 즉시 같은 목록을 구독하던 중복 제거(먼저 가족·아이·구성원만 조회). 같은 가족의 구독 재등록은 기존 5개 리스너를 재사용. 가족 전환 후 이전 리스너 콜백 무시. 동시 flush는 하나로 합치고 재전송 중 추가된 변경을 보존. 반복·예외·삭제 표시 문서는 구독에서 유지. |
| 4. 구 호환 코드 정리 | 일반 Firestore I/O는 canonical 경로를 직접 사용한다. DBPaths.map 제거, 클라이언트의 옛 코드 매핑 조회·생성·재발급과 자체 가입/멤버 연결 fallback 제거. UID 소유가 확인된 오프라인 대기열의 경로 변환만 queuedPath로 유지. 타 계정/소유 미확인 대기열은 비공개 로컬 보관 후 재전송 차단. |

정리 전 백업은 저장소의 `.local-backups/firestore/20261008-optimization/`에 권한 700 디렉터리·600 파일로 보관한다. `.gitignore`에 제외했고 Git 등록하지 않았다. 이 백업은 구 문서와 삭제 직전 canonical 문서를 포함하며 계정 토큰은 포함하지 않는다.

현재 최상위 컬렉션: accounts, children, families, familyAccess, childAccess, placeUsageStats. 초대/참여 요청/요청 제한의 세 컬렉션은 실제 사용 시 다시 생성되는 정상 구조다. 새 임시 테스트 계정을 운영에 만들지 않았다.

정리 정책: 요청 제한은 기존 만료 Timestamp를 사용한다. 초대는 유효기간 종료 후 30일, 참여 요청은 초대 만료 후 30일(대기)/승인·거절·취소 후 30일을 purgeAt(Date/Timestamp)으로 기록한다. purgeAt은 보안 판정 기준이 아니다. 실제 사용 가능 여부는 기존 expiresAt·status·권한으로 즉시 판단한다. TTL은 비동기 삭제이므로 만료 시각에 즉시 지워지는 기능은 아니다. 초대 문서가 TTL로 사라져도 가족 루트의 옛 currentInviteHash 때문에 재발급·취소가 실패하지 않도록 처리했다. 승인 완료 요청이 지워져도 실제 권한은 familyAccess에 남아 정상 동작한다.

정책 재현: `security/firestore.retention.json`에 대상 필드를 선언하고 `python3 tools/family-retention.py`로 읽기 전용 점검, `--apply`로 세 필드만 적용한다. 보안 규칙·다른 인덱스는 배포하지 않는다. 공식 근거: https://firebase.google.com/docs/firestore/ttl .

검증: Node 관련 검사 66개, 가입/Auth 흐름 21개, 완료/연결 회귀 26개 통과. demo 프로젝트의 localhost 분리 에뮬레이터에서 실제 동시 트랜잭션·요청 제한·권한 회수·TTL Timestamp 필드 검사 통과, Firestore 권한 114개·Storage 권한 22개 통과. 구 D1 검사의 배포 전제 두 항목은 작업 전 HEAD에서도 동일하게 실패했으므로 현재 승인 구조에 맞게 갱신한 뒤 21개 통과 확인했다. 모든 과거 단계별 테스트를 전부 재작성/실행한 것은 아니다.

서버는 family-access 코드베이스만 분리 배포했다. 별도 AI/API 함수와 다른 세션의 root functions/index.js 변경은 포함하지 않았다. CLI는 함수 업데이트 성공 후 Artifact Registry 정리 정책 미설정 때문에 exit 1을 반환했지만, 실제 함수 ACTIVE·업데이트 시각 2026-10-08T09:57:27.325486526Z를 별도 API로 확인했다. 저장소 전체에 --force를 적용하지 않았다.

앱은 v2.0.24와 변경한 스크립트 캐시 키로 준비했다. 현재 앱 코드 수정은 로컬 반영 상태이며 커밋·push·GitHub Pages 게시를 하지 않았다. App Check와 보안 규칙은 이번 최적화에서 변경하지 않았다. www/네이티브 앱 복사본의 동기화도 별도 출시 작업이다.
