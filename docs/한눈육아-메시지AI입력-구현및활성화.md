# 메시지 AI 입력 — 구현 및 활성화

2026-10-08. 메시지 붙여넣기만 담당. 사진 비전·음성 전사는 이번 범위 밖이다.

## 현재 상태

로컬 코드 구현 및 모의 테스트 완료. 운영 함수 배포, API 키 설정, 실제 모델 품질·실기기 화면 검증은 하지 않았다. commit/push·규칙 배포 없음. 다른 세션 미커밋 변경을 보존했다.

## 사용자 흐름

일정/할일 추가 → 메시지 붙여넣기 → 메시지 입력 → `메시지에서 찾아 채우기` → 후보·원문 근거 확인 → 하나를 골라 해당 종류 폼에 반영 → 제목/날짜/시간/대상/분류 확인 → 기존 저장 버튼.

분석 버튼 아래 OpenRouter 및 모델 제공사 전송 안내를 표시한다. 자동 전송·자동 저장·자동 일괄 등록 없음. 일정과 준비 할일을 각각 후보로 반환하고 하나씩 폼에 적용한다. 다른 종류 후보를 누르면 새 입력폼으로 이동하므로 기존 미저장 폼을 대체한다. 반복·대상은 자동 변경하지 않으며 직접 확인한다. 카테고리는 현재 선택한 사람의 허용 목록과 일치할 때만 반영한다.

원문을 description/memo에 보존. 분석 제목을 별도 수정할 수 있다. 현재 기존 입력란 제한은 500자이고 서버 입력 상한은 4,000자다. 긴 안내문 입력란 확대는 별도 범위다.

## 데이터 계약과 보호

`parseFamilyMessage({text,baseDate,familyId})` → `{ok:true,candidates:[{kind,title,date,startTime,endTime,ownerName,category,evidence,requiresReview:true}]}`.

- kind: schedule/todo. 후보 최대 12개, 제목 최대 60자.
- date: YYYY-MM-DD 또는 null. 시간 HH:MM 또는 null.
- 원문에 연도 없이 월/일만 있으면 날짜 null. 상대 날짜는 기준일(한국 날짜)로 해석한 후보이며 확인 필요.
- 준비물 기한을 행사 날짜로 임의 설정하지 않도록 지시한다.
- 실제 달력 날짜·시간·종료 순서·원문 근거 포함을 서버에서 검증한다. 의미의 정확성까지 보장하지 않는다.
- 대상 이름·카테고리는 후보 표시용이다. 대상은 현재 폼 선택 유지. 불확실한 시간은 종일 상태로 표시되므로 안내에 따라 사용자 확인 필요.
- 요청 중 원문/폼/가족/로그인 계정이 바뀌거나 폼을 닫으면 응답을 반영하지 않는다.
- Firebase 인증 토큰과 서버의 accounts/families 구성원 연결을 검사한다. 삭제 구성원·다른 가족 거부.
- 서버 사용량 `accounts/{uid}/privateUsage/messageParser`: 한국 날짜·카운트만 기록, 하루 계정당 20회. 실패한 외부 호출도 횟수 소모. 해당 하위 경로는 현재 클라이언트 규칙에서 허용하지 않는다.
- API 키는 서버 Secret Manager만 사용. 원문·응답 서버 로그 없음, OpenRouter provider.require_parameters:true로 스키마 지원 엔드포인트만 허용하고 data_collection:deny로 수집 허용 공급자를 제외한다. 이는 공급자의 전체 보관 정책이나 무보관을 보장한다는 뜻은 아니다. 지원 공급자가 없으면 요청은 실패하며 다른 모델로 자동 변경하지 않는다.
- App Check 강제 적용은 현재 하지 않음. 인증·가족 확인·사용량 제한을 적용하며 출시 전에 App Check 적용 여부와 실기기 검증 필요.

## 활성화에 필요한 작업

API 키 값을 채팅·소스·localStorage에 넣지 않는다. 사용자 환경에서 Firebase 비밀 입력 프롬프트에 등록한다:

```sh
firebase functions:secrets:set OPENROUTER_API_KEY --project yuka-planner
```

키 등록과 함수 배포는 이번 실행에서 수행하지 않았다. 배포 승인 후 기존 함수 변경 없이 아래 단일 함수만 배포한다. functions 폴더에서 실행:

```sh
npm --prefix message-input ci
firebase deploy --config firebase-message.json --only functions:parseFamilyMessage --project yuka-planner
```

기본 모델 qwen/qwen3.8-flash, MESSAGE_PARSER_MODEL로 서버 변경 가능. OpenRouter Chat Completions API + JSON Schema Structured Outputs 사용. API 결제·모델 접근 권한을 실제 계정에서 확인해야 한다. 함수 배포 후 앱 파일 배포도 필요하며 firebase.json의 기존 규칙 설정은 변경하지 않는다.

## 검증

`node --test test/message-parser.test.js test/k6-time-wheel.test.js`: 신규 7개 테스트와 기존 시간 입력 17개 내부 검증 통과.

신규: 날짜/시간/원문 근거, 연도 없는 날짜, 가족 권한, 삭제 구성원, 사용량 상한, 모의 OpenRouter 요청/출력, 정규화 로그인 계정의 실제 Firebase 토큰 사용, 네트워크 실패 반환.

미검증: 실제 Functions 배포 및 Secret 연결, 실제 모델이 안내문 의미를 정확히 추출하는지, Safari/Chrome 화면 흐름, 후보 반영 후 서버 저장, 사용자 전환/입력 변경의 실제 브라우저 동작. 운영 데이터에 쓰지 않았다.

## OpenRouter 전환

요청 모델을 qwen/qwen3.8-flash로 유지. API 키 값은 파일·테스트·로그에 넣지 않았다. 채팅에 제공된 키는 사용하지 않았으며 폐기/재발급 후 OPENROUTER_API_KEY 서버 비밀 설정에 직접 등록해야 한다. 기존 OPENAI_API_KEY 비밀 삭제·변경은 하지 않는다. 실제 API 호출·키 등록·배포 없음.

공식 근거: https://openrouter.ai/qwen/qwen3.8-flash , https://openrouter.ai/docs/guides/features/structured-outputs

## 2026-10-08 사용자 승인 후 함수 배포 결과

- 사용자: OpenRouter 키 등록 완료 및 함수 배포 승인.
- `parseFamilyMessage(asia-northeast3)` Node.js 22 / 2nd Gen 생성 성공. 기존 familyAccess 함수·Firestore/Storage 규칙·앱 push는 수행하지 않았다.
- `MESSAGE_PARSER_MODEL=qwen/qwen3.8-flash`를 functions/.env.yuka-planner에 명시. 비밀 값은 파일이나 로그에 출력하지 않았다.
- 함수 실행 계정에 OPENROUTER_API_KEY 비밀의 secretAccessor 권한을 Firebase CLI가 연결했다.
- 배포 CLI는 함수 생성 성공 후 Artifact Registry 자동 정리 정책 미설정으로 종료 코드 1을 반환했다. 함수 배포 성공과 후속 정리 정책 실패를 구분한다. 이미지 정리 정책은 아직 설정하지 않았다.
- 배포 주소: https://asia-northeast3-yuka-planner.cloudfunctions.net/parseFamilyMessage
- 운영 주소에 비로그인 요청으로 HTTP 401 / UNAUTHENTICATED / 로그인 필요 응답 확인. 인증 전 차단되어 OpenRouter 호출이나 사용량 기록은 발생하지 않는다.
- 신규 모의 테스트 7개 통과. 로그인된 실제 메시지 분석·OpenRouter 응답·후보 적용 후 저장은 미검증. 서버 배포만 했으므로 실제 앱의 버튼 반영에는 앱 배포가 별도로 필요하다.


## 제공사 확정 및 커밋 범위

사용자가 OpenRouter/qwen/qwen3.8-flash를 재확정했다. functions/message-input의 독립 진입점·서버 파서·모델 환경 파일·의존성 잠금·functions/firebase-message.json과 서버 테스트를 커밋한다. 모델 ID만 환경 파일에 저장하고 API 키는 Secret Manager만 사용한다.

다른 세션의 가족 승인 서버 초안(functions/index.js, family-access.js)은 미커밋으로 보존한다. 독립 메시지 함수는 앞서 배포한 accounts/families 인증 계약을 유지하며, 미배포 familyAccess 승인 데이터에 의존하는 추가 제한은 이번에 포함하지 않는다. 해당 제한과 App Check는 가족 승인 기능 배포와 함께 별도로 연결해야 한다. 기존 함수·규칙은 변경하지 않았다.

실제 배포한 함수는 OpenRouter 버전이었다. 이번에는 코드 위치만 정리하며 추가 재배포·push는 하지 않는다. 배포 재실행 명령은 functions 폴더에서 위 firebase-message.json을 사용한다.

독립 서버 계약 테스트: `node --test test/message-input-server.test.js test/message-ai-client.test.js` (10개). 다른 세션의 familyAccess 승인 상태 테스트가 포함된 test/message-parser.test.js는 별도로 보존한다.
