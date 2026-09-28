# 한눈육아 Firestore 스키마 설계

작성일: 2026-09-28
전제: `Todo-데이터모델-설계.md` v2(MODEL: GO)를 실제 Firebase 서비스 구조로 변환한다. 코드/배포/UI 변경 없음. 새 조사·새 기능 없음.

---

## 1. 현재 Firebase 구조 분석 (코드 기준, 문서보다 우선)

`js/sync.js`, `js/app.js`, `index.html`을 직접 확인한 결과:

- SDK: `firebase-app-compat.js` / `firebase-firestore-compat.js` v10.14.1 (compat 방식)
- **collection은 `families` 딱 하나뿐이다.**
- **document ID가 곧 가족코드(6자리) 그 자체다** — `db.collection("families").doc(code)`. 별도 내부 ID 없음.
- 문서 하나에 `{ profile, completed, updatedAt }`을 통째로 저장(서브컬렉션 없음). `profile`은 `{birthDate, gender, province, district}` — **아이는 딱 1명만 가정**, `ChildProfile`이라는 개념이 코드상 존재하지 않는다.
- `completed`는 `{ [일정id]: true }` 형태의 **플랫 맵**이다 — 완료 "날짜"가 저장되지 않는다(불리언만 있음). `recordType`, `recordedAt` 개념 전혀 없음.
- 코드 생성 시 중복 확인은 `families/{code}` 문서 존재 여부를 최대 3회 재시도하는 방식(`createFamily()`) — 완전한 원자적 보장은 아니지만 지금 규모에선 충돌 가능성이 사실상 0에 가깝다.
- `onSnapshot`은 family 문서 하나에만 걸려 있다(`listen()`).
- **Firestore 보안 규칙 파일(`firestore.rules`)이 리포지토리에 없다** — 즉 현재 배포된 규칙이 무엇인지 이 리포로는 알 수 없고, Firebase 콘솔에서 직접 설정했거나 테스트 모드(전체 공개)일 가능성이 있다. 이번 설계에서 반드시 짚어야 할 위험 요소다(섹션 10).
- `TodoDefinition`에 해당하는 데이터는 전부 `data/*.json` 정적 파일이다(Firestore에 없음). `schedule.js`가 이 JSON들 + profile을 조합해 클라이언트에서 통합 일정 배열을 만든다 — **"계산은 클라이언트에서, 저장은 최소한만"이라는 지금 패턴이 이미 새 데이터 모델의 방향과 일치한다.**

**결론: 새 스키마는 기존 구조를 갈아엎는 게 아니라, `families/{code}` 단일 문서 안에 뭉쳐 있던 것을 서브컬렉션으로 풀어내고, `completed` 플랫 맵을 `CompletionRecord`로 승격하는 확장이다.**

---

## 2. 최종 Firestore 구조 (요약)

```
familyCodes/{code}                              ← 코드 조회·중복방지 전용, 값은 familyId 하나
families/{familyId}                             ← 가족 단위 데이터(지역, 가족단위 조건, 현재코드)
  └ children/{childId}                          ← 아이 단위 데이터(생년월일, 성별, 아이단위 조건)
       └ completions/{completionId}             ← CompletionRecord (핵심)

(TodoDefinition, 지역/지원금 데이터는 Firestore에 두지 않는다 — 섹션 7)
```

가족코드(`code`)와 내부 ID(`familyId`)를 분리한 것이 v1(현재 서비스)과 가장 큰 차이다. 이유는 섹션 5·10에서 설명한다.

---

## 3. Collection / Document 구조

### 3-1. `familyCodes/{code}`
- **document ID**: 가족코드 문자열 그 자체(예: `A3F9K2`)
- **역할**: (a) 코드 중복 방지의 유일한 진입점, (b) 코드→familyId 조회, (c) 코드 재발급 시 이력 관리
- 필드: `familyId`(string), `active`(boolean), `createdAt`(timestamp), `revokedAt`(timestamp\|null)

### 3-2. `families/{familyId}`
- **document ID**: Firestore auto-ID(추측 불가능한 랜덤 문자열)
- 필드: `currentCode`(string, 현재 유효한 가족코드 — `familyCodes`와 이중관리 아님, 여기 값이 정본이고 `familyCodes`는 조회용 인덱스), `province`(string), `district`(string), `familyDeclaredAttributes`(map, 예: `incomeBracket`), `createdAt`, `updatedAt`

### 3-3. `families/{familyId}/children/{childId}`
- **document ID**: Firestore auto-ID
- 필드: `birthDate`(string, `YYYY-MM-DD`), `gender`(string\|null), `childDeclaredAttributes`(map, 예: `prematureBirth`, `rotaProductType`, `jevProductType`), `createdAt`, `updatedAt`

### 3-4. `families/{familyId}/children/{childId}/completions/{completionId}`
- 섹션 6에서 상세.

**"Family 단위 설정"이 별도로 필요한가?** — 지금은 `families` 문서 자체가 그 역할을 한다(코드, 지역, 가족단위 속성). 별도 컬렉션을 더 만들 필요는 없다.

---

## 4. 각 필드 정의

| 컬렉션 | 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|---|
| familyCodes | `familyId` | string | ✅ | families 문서 참조 |
| familyCodes | `active` | boolean | ✅ | 재발급 시 과거 코드는 `false` |
| families | `currentCode` | string | ✅ | 지금 유효한 6자리 코드 |
| families | `province`/`district` | string | ✅ | 기존과 동일 |
| families | `familyDeclaredAttributes` | map | 선택 | 비어있어도 됨(값 없으면 해당 Todo는 `UNKNOWN` 필터) |
| children | `birthDate` | string | ✅ | 기존과 동일 |
| children | `gender` | string\|null | 선택 | 기존과 동일 |
| children | `childDeclaredAttributes` | map | 선택 | 비어있어도 됨 |
| completions | `todo_id` | string | ✅ | 정적 TodoDefinition의 ID (섹션 7) |
| completions | `occurrenceKey` | string | ✅ | `"default"` / `"dose-2"` / `"2027"` 등 |
| completions | `recordType` | enum | ✅ | `MILESTONE_REPORTED` \| `TODO_COMPLETED` |
| completions | `recordedAt` | timestamp | ✅ | 이벤트발생일 또는 완료일 |
| completions | `createdAt` | timestamp | ✅ | 서버 기록 시각(감사용, 아래 참고) |

---

## 5. ID 전략 (섹션 3 요청사항 정면 대응)

- **가족코드가 document ID가 되어도 되는가?** → **아니오, 분리한다.** `families` 문서 ID는 Firestore auto-ID로 하고, 코드는 `familyCodes/{code} → {familyId}`라는 별도의 작은 조회용 컬렉션으로 둔다.
- **왜 분리하는가?**
  1. **재발급**: 코드가 유출됐을 때 "같은 가족 데이터를 유지한 채 코드만 바꾸는" 것이 지금 구조(코드=문서ID)로는 불가능하다(전체 문서를 새 ID로 복사·삭제해야 함). 분리하면 `familyCodes`에 새 코드 문서 하나 추가하고 기존 것을 `active:false`로 바꾸는 것으로 끝난다.
  2. **우발적 전체 열람 방지**: 코드가 문서ID이면 `families` 컬렉션을 실수로라도 `list`(전체 목록 조회) 하도록 규칙을 잘못 설정했을 때 **코드 자체가 그대로 노출**된다. `familyId`가 코드와 무관한 랜덤값이면, `list`가 실수로 열려도 코드를 알아낼 수는 없다(섹션 10에서 이게 왜 제일 중요한지 다룬다).
  3. **다자녀 구조와도 자연스럽게 맞는다** — 가족(코드)과 아이(children 서브컬렉션)가 원래 1:N 관계이므로, "코드=아이 문서"가 아니라 "코드=가족 문서, 그 아래 아이들"이 구조적으로 맞다.
- **가족코드 중복 가능성**: `familyCodes/{code}`를 만들 때 `create`(신규 생성만 허용, `set`이 아니라)로 시도해서 이미 존재하면 실패 → 재시도. 지금(3회 재시도)과 같은 패턴을 유지하되, 문서 존재 자체가 유일성 보장 수단이 되므로 로직은 오히려 더 명확해진다.
- **코드를 아는 사람이 다른 가족 데이터에 접근할 위험**: 이 위험은 ID 분리로 없어지지 않는다 — **코드 자체가 유일한 인증 수단**이라는 제품 설계상 원래 감수하는 위험이다(섹션 10에서 "가장 위험한 부분"으로 별도 표기).
- **아이가 1명 vs 여러 명**: `children` 서브컬렉션이라 자연 지원된다. **다만 지금 UI/기능은 여전히 아이 1명만 가정해도 된다** — 스키마만 N명을 수용하고, 실제로 여러 명을 등록하는 화면을 만드는 건 이번 범위 밖(새 기능 추가 금지)이다.
- **가족코드 변경/재발급**: 섹션 5-2 그대로. `families.currentCode`를 갱신하고 `familyCodes`에 새 문서를 추가하면 된다.

---

## 6. CompletionRecord 구조 (상세)

### 6-1. Document ID 전략 — 합성 키를 그대로 문서 ID로 쓴다

```
completionId = `${todo_id}__${occurrenceKey}__${recordType}`
예: "VX-DTAP__dose-1__TODO_COMPLETED"
    "SF-04__default__MILESTONE_REPORTED"
```

이렇게 하면:
- **같은 Todo를 여러 번 "완료" 눌러도** 같은 문서를 덮어쓸 뿐 중복이 생기지 않는다(요청하신 "같은 Todo를 여러 번 완료" 상황에 대한 답 — 누적 로그가 아니라 최신 상태 하나만 유지하는 것이 이 서비스 목적에 맞다).
- **완료 여부 확인이 쿼리 없이 즉시 가능하다** — `completions/VX-DTAP__dose-1__TODO_COMPLETED` 문서가 존재하는지만 보면 된다.
- **반복 Todo, 다회차 접종**은 `occurrenceKey`만 다르게(`dose-1`, `dose-2`…, `2027`, `2028`…) 하면 각각 독립된 문서가 된다.
- **마일스톤 이벤트**는 `recordType`이 다르므로 같은 `todo_id`에 `..._MILESTONE_REPORTED`와 `..._TODO_COMPLETED` 두 문서가 공존할 수 있다 — 섹션 4(데이터모델)의 3단계(대기→보고됨→완료) 전이가 그대로 표현된다.

### 6-2. "누가 기록했는지" 구분이 필요한가?

**지금은 필요 없다.** 이 서비스는 회원가입·개인 계정이 없고, 가족코드 하나를 여러 기기가 공유하는 구조라 "엄마가 기록/아빠가 기록"을 구분할 인증 수단 자체가 없다. 억지로 `recordedBy` 필드를 넣어도 채울 값이 없다 — 넣지 않는다.

### 6-3. TodoDefinition이 나중에 바뀌어도 과거 기록이 깨지지 않는 이유

`CompletionRecord`는 `todo_id`와 `occurrenceKey`라는 **식별자만** 참조하고, 그 시점의 `startMonth`/`endMonth`/`triggerParams` 같은 **값을 복사해서 저장하지 않는다**(스냅샷 없음). 따라서 나중에 구강검진 차수 정보를 고치든, 우선순위를 바꾸든, 완료 기록 자체는 전혀 영향받지 않는다. **단 하나의 규칙만 지키면 된다: `todo_id`는 한 번 만들면 이름을 바꾸거나 삭제하지 않는다**(더는 안 쓰는 Todo는 `exposureLevel: EXCLUDED`로만 바꾼다). 이건 코드 규칙이라 스키마에 강제 필드를 추가하진 않는다.

---

## 7. TodoDefinition 저장 방식

**Firestore에 두지 않고, 지금처럼 정적 JSON 파일로 유지한다.**

| 판단 기준 | 결과 |
|---|---|
| 규모(73개) | 파일 하나로도 충분히 작다(전체 합쳐도 수십 KB 수준) |
| 변경 빈도 | 이번 조사에서 확인했듯 "검증 완료 후 안정" — 데이터 자체가 자주 바뀌지 않는다 |
| 관리자 수정 필요성 | 관리자가 별도로 있는 서비스가 아니라 개발자 본인이 직접 데이터를 고친다 — Firestore 콘솔 편집이 코드 편집보다 더 쉬운 상황이 아니다 |
| 앱 배포 없이 수정 필요성 | 정적 사이트라 배포(재업로드)가 이미 매우 가볍다 — Firestore로 옮겨서 얻는 이점이 적다 |
| Firestore 읽기 비용/성능 | 73개를 문서 73개로 쪼개면 세션마다 73회 read가 발생 — 정적 파일 fetch 1회보다 비싸고 느리다 |
| 지역별 데이터 확장 가능성 | `subsidies.json`처럼 지역별로 늘어나는 데이터도 지금처럼 정적 JSON 분리 파일 패턴(카테고리별 파일)로 충분히 대응 가능 |

**정리**: `data/health_checkup.json`, `vaccination.json`, `development.json`, `subsidies.json`, `regions.json`에 새 데이터모델 필드(`triggerType`, `eligibilityCondition`, `variants` 등)를 추가하고, 새 카테고리 6개(이유식/구강/수면/안전/생활/보육)를 같은 패턴의 JSON 파일로 추가한다. Firestore는 손대지 않는다. (나중에 "관리자가 앱 밖에서 직접 콘텐츠를 편집해야 한다"는 요구가 생기면 그때 재검토 — 지금은 아니다.)

---

## 8. TodoInstance 처리 방식

**저장하지 않는다.** 클라이언트가 세션마다 아래를 조합해 즉시 계산한다:

```
정적 TodoDefinition(73개, fetch 1회, 캐시 가능)
  + families/{familyId} 문서(1회 read 또는 onSnapshot)
  + children/{childId} 문서(1회 read 또는 onSnapshot)
  + children/{childId}/completions 전체(컬렉션 1회 read 또는 onSnapshot, 보통 수십 건 이내)
  + 오늘 날짜
  = TodoInstance 배열(상태 포함) — 매번 새로 계산, 어디에도 저장 안 함
```

**"놓친 Todo"를 계산하려고 TodoInstance를 저장해야 하는가?** → **아니오.** 놓침 여부(`OVERDUE_CATCHUP`/`OVERDUE_FINAL`)는 "오늘 날짜"라는 순수 함수 입력값 하나만 바뀌면 되는 계산이라, 저장해두면 오히려 매일 갱신하는 배치 작업이 필요해지고 기기 간 불일치 위험만 커진다. 지금 규모(가족당 완료기록 최대 수백 건)에서 클라이언트 계산 비용은 무시할 수준이다.

---

## 9. 주요 조회/계산 방식

| 질문 | Firestore 쿼리 필요? | 방식 |
|---|---|---|
| 1. 이 가족의 아이 프로필은? | ✅ 단순 조회 | `families/{familyId}/children` 컬렉션 전체 get (조건절 없는 단순 조회, N이 작아 `where` 불필요) |
| 2. 이 아이의 완료 기록은? | ✅ 단순 조회 | `.../children/{childId}/completions` 컬렉션 전체 get 또는 `onSnapshot`(실시간 동기화 대상) |
| 3. 이번 달 Todo는? | ❌ 클라이언트 계산 | 정적 TodoDefinition × 위 1,2 결과를 로컬에서 필터링(Firestore가 모를 개념) |
| 4. 아직 완료하지 않은 Todo는? | ❌ 클라이언트 계산 | 상동 |
| 5. 놓친 Todo는? | ❌ 클라이언트 계산 | 상동(섹션 8) |
| 6. 마일스톤 기록은? | ❌ 클라이언트 계산 | 이미 받아온 completions 전체에서 `recordType=="MILESTONE_REPORTED"`만 필터(별도 Firestore `where` 불필요할 정도로 소규모) |
| 7. 가족의 declaredAttributes는? | ✅ 단순 조회 | `families/{familyId}` 문서 안에 이미 포함(1번과 같은 read) |
| 8. 가족 구성원이 완료한 기록은? | ✅ 단순 조회 | 2번과 동일(이 서비스에 "구성원별" 구분이 없으므로 "아이 기준" 완료기록이 곧 답) |

**결론: Firestore 쪽은 항상 "조건 없는 전체 조회"만 하고, 조건(월령, 지역, 상태)이 들어가는 모든 판단은 클라이언트에서 한다.** 이게 인덱스가 거의 필요 없는 이유이기도 하다(섹션 11).

---

## 10. 보안 구조 (데이터 구조 관점)

- **6자리 코드만 아는 사용자가 다른 가족 데이터를 읽을 수 없는가?** → 구조적으로 막을 수 있는 부분과 막을 수 없는 부분이 있다.
  - 막을 수 있는 것: `families`/`children`/`completions` 세 컬렉션 전부 **`list`(조건 없는 컬렉션 전체 열람)를 금지**하고 **정확한 문서 경로를 아는 경우의 `get`만 허용**하면, "무작위로 전체 가족 목록을 훑어보는" 공격은 막힌다.
  - 막을 수 없는 것: **코드 자체를 아는 사람은 원래 설계상 그 가족의 전체 데이터를 볼 권한이 있는 사람**이다(회원가입이 없으므로 코드=자격증명). 코드를 알아낸 제3자를 막는 방법은 스키마가 아니라 "코드의 무작위성(32^6 ≈ 10억 경우의 수)"과 "코드 재발급"뿐이다 — 이번 설계에서 재발급 구조(섹션 5)를 만든 이유가 이것이다.
- **family 단위 접근 제어가 가능한가?** → 가능하다. Firestore 보안 규칙을 경로 기준으로(`match /families/{familyId}/{document=**}`) 걸면, 클라이언트가 가진 `familyId`로만 그 가족 서브트리에 접근하게 만들 수 있다. 단, `familyId`를 얻는 유일한 경로가 `familyCodes/{code}` 조회이므로, **이 조회 컬렉션에도 `list` 금지가 똑같이 적용돼야 한다** — 안 그러면 `familyCodes` 전체를 훑어서 모든 가족의 `familyId`를 한 번에 다 얻어갈 수 있다.
- **CompletionRecord를 임의로 다른 family에 추가할 수 없는가?** → 경로 기반 규칙(`completions` 문서 경로 안에 `familyId`가 박혀 있음)으로 구조적으로 막힌다 — 클라이언트가 `familyId`를 모르면 그 경로 자체를 구성할 수 없다.
- **TodoDefinition 같은 공용 데이터는 누구나 읽어도 되는가?** → 그렇다. 애초에 Firestore에 없고 정적 파일이라 이 질문 자체가 해당 없음(누구나 읽어도 상관없는 데이터라는 판단은 맞다).

**현재 구조에서 가장 위험한 부분**: **리포지토리에 `firestore.rules`가 아예 없다는 것.** 규칙이 무엇인지 모른다는 것 자체가 지금 "위험도 평가 불가" 상태라는 뜻이다. 새 스키마를 배포하기 전에 최소한 "`list` 전면 금지 + 정확한 경로의 `get`/`create`/`update`만 허용"이라는 규칙부터 명문화해야 한다(코드 작성은 이번 범위 밖이지만, **다음 구현 단계의 최우선 항목**으로 못 박아둔다).

---

## 11. Index

**복합 인덱스가 필요 없다.** 섹션 9에서 확인했듯 모든 Firestore 접근이 "조건 없는 컬렉션 전체 조회" 또는 "정확한 문서 ID로 get"뿐이라, `where` 절을 여러 필드에 거는 쿼리가 없다. Firestore 자동 생성 단일 필드 인덱스만으로 충분하다.

---

## 12. 비용/성능

- **필요한 index**: 없음(11번)
- **불필요한 실시간 listener**: 지금처럼 family 문서 하나에만 걸지 말고, ① `families/{familyId}` 문서, ② `children/{childId}` 문서, ③ `completions` 컬렉션 — 이 3곳에만 `onSnapshot`을 걸면 된다. `familyCodes`는 **최초 로그인(코드 입력) 순간에만 1회 `get`하고 리스너를 걸 필요가 없다**(코드 자체가 실시간으로 바뀔 이유가 없으므로).
- **한 번에 읽어야 하는 데이터**: 앱 시작 시 정적 JSON(73개 Todo 정의) fetch 1회(캐시 가능) + family 문서 1회 + children 문서들 1회 + completions 컬렉션 1회 — 총 Firestore read는 세션당 3~4회 수준(가족코드 조회 1회 포함 4~5회)로 지금(1회)보다 늘지만 여전히 무시할 수준이다.
- **완료기록이 많아졌을 때 문제가 될 부분**: 이 서비스는 아이 1명당 완료기록이 최대 200건 내외(73개 Todo × 다회차 포함)로 상한이 명확해서 "무한정 쌓이는" 데이터가 아니다. 문제가 될 여지는 사실상 없다.
- **TodoDefinition을 Firestore에 둘 경우 발생하는 읽기 비용**: (참고용, 채택 안 함) 73개를 문서 73개로 쪼개면 세션당 73 read, 문서 1개(배열 통째로)로 합쳐도 매 세션 1 read가 추가된다 — 정적 파일 fetch(과금 없음, CDN 캐시)보다 항상 더 비싸다. 섹션 7 판단의 근거.

---

## 13. 기존 코드와의 변경점

| 파일 | 지금 | 바뀌는 것 |
|---|---|---|
| `js/sync.js` | `families/{code}` 단일 문서, `createFamily/fetchFamily/updateProfile/updateCompleted/listen` | `familyCodes/{code}` 조회 후 `families/{familyId}` + `children/{childId}` + `completions` 서브컬렉션 구조로 전환. `updateCompleted`(플랫 맵 덮어쓰기)는 폐기하고 `completions` 문서 단위 upsert로 대체. 코드 재발급 함수 신규 |
| `js/app.js` | `profile`/`completed`를 로컬 객체 하나로 관리 | `ChildProfile`(1명 가정 유지) + `CompletionRecord` 배열로 관리. `completed[id]=true`였던 토글 로직이 `(todo_id, occurrenceKey, recordType)` 조합의 upsert로 바뀜 |
| `js/schedule.js` | JSON 4종 + profile → 통합 일정 배열 | 새 필드(`triggerType`/`eligibilityCondition`/`variants`) 해석 로직 추가, 상태계산 함수를 섹션 3(데이터모델 문서)의 7개 상태로 일반화 |
| `data/*.json` | 4개 파일, 필드가 `minMonths`/`maxMonths` 등 v1 방식 | `triggerType`/`triggerParams`/`eligibilityCondition`/`variants`/`catchUp` 필드 추가 + 새 카테고리 6개 파일 신설 |
| (신규) `firestore.rules` | 없음 | `list` 전면 금지 + 경로기반 `get`/`create`/`update` 규칙 신설(섹션 10) |

---

## 14. 구현 순서

1. `firestore.rules` 신설(보안 규칙이 없는 지금 상태가 가장 위험하므로 최우선)
2. `data/*.json` 5개 파일에 새 필드 추가 + 신규 6개 카테고리 파일 작성
3. `js/schedule.js`의 상태계산 로직을 새 7개 상태 + variants/eligibility 필터로 확장
4. `js/sync.js`를 `familyCodes`/`families`/`children`/`completions` 구조로 전환(코드 재발급 함수 포함)
5. `js/app.js`를 새 `ChildProfile`/`CompletionRecord` 구조에 맞게 프로필·완료처리 로직 수정
6. (선택, 이번 범위 밖) 다자녀 UI — 스키마는 이미 지원하므로 필요해지면 그때 추가

---

## 최종 판정

**DB SCHEMA: GO**

수정해야 할 파일(파일명만, 구현은 다음 단계):
- `firestore.rules` (신규)
- `js/sync.js`
- `js/app.js`
- `js/schedule.js`
- `data/health_checkup.json`
- `data/vaccination.json`
- `data/development.json`
- `data/subsidies.json`
- `data/regions.json`
- `data/feeding.json` (신규)
- `data/oral.json` (신규)
- `data/sleep.json` (신규)
- `data/safety.json` (신규)
- `data/life.json` (신규)
- `data/childcare.json` (신규)
