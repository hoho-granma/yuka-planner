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
