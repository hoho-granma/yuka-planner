# 한눈육아 Todo 데이터 모델 설계 (v2 — 검토 반영)

작성일: 2026-09-28
전제: `0-36개월-Todo-Master-설계.md`(섹션 0~10)에서 검증된 73개 Todo를 그대로 재사용한다. `Todo-데이터모델-검토.md`의 CONDITIONAL GO 판정에 따른 수정 3건(CONDITION 분리, CompletionRecord.recordType 추가, variants 일반화)과 `genderCondition` 제거를 반영한 v2다. 새 육아정보 조사·새 Todo·새 기능·UI·Firebase 코드 없음.

---

## 1. Todo 데이터 모델 — 전체 그림 (수정됨)

레코드를 3개 층위로 분리하는 v1의 구조는 유지한다. 다만 v1에서 발견된 결함 — "발달 마일스톤"과 "자격속성"을 같은 `CONDITION` 하나로 뭉친 것, "이벤트 보고"와 "완료 처리"를 구분 못한 것 — 을 고치기 위해 층 하나를 추가한다.

```
① TodoDefinition (정적, 마스터 데이터 — 73개 레코드)
     └ 아이와 무관하게 고정.

② FamilyProfile (동적, 아이별 — 4개 필수 입력 + 선언형 속성)
     └ 생년월일·거주지역 + (필요한 Todo가 있을 때만) 자격속성 선언값
     └ v1에는 없던 층. "지역"처럼 시간과 무관한 필터값을 전부 여기로 모은다.

③ CompletionRecord (동적, 아이별 — 사용자 행동 기록)
     └ "무엇을(todo_id), 몇 번째(occurrenceKey), 무엇을 했는지(recordType), 언제(recordedAt)"만 저장.

④ TodoInstance (계산됨, 저장하지 않음 — 렌더링 시점에 ①+②+③+오늘날짜로 매번 계산)
     └ 상태값·실제 windowStart/End·노출 여부.
```

②를 새로 분리한 이유는 하나뿐이다: **"성별"과 "지역"은 원래도 아이의 고정 속성(필터)이었는데, 소득구간·어린이집이용여부 같은 것도 성격이 똑같다(시간에 따라 발생하는 사건이 아니라 참/거짓 속성)**. 이걸 ③(행동 기록)에 억지로 넣지 않고 ②(고정 속성)로 옮기면, "이벤트가 언제 일어났는가"(③)와 "이 아이가 어떤 조건인가"(②)가 코드 레벨에서도 섞이지 않는다.

---

## 2. 각 필드 정의 (수정됨)

### 2-1. TodoDefinition

| 필드 | 타입 | 설명 | 변경 |
|---|---|---|---|
| `todo_id` | string | 고유 ID | 유지 |
| `category` | enum | 10개 데이터 카테고리 | 유지 |
| `title` | string | Todo 제목 | 유지 |
| `parentAction` | string | 부모에게 보여줄 행동 설명 | 유지 |
| `completionCriteria` | string | 완료 기준 설명 | 유지 |
| `exposureLevel` | enum | `MUST`/`CONDITIONAL`/`REFERENCE`/`EXCLUDED` | 유지 |
| `triggerType` | enum | `AGE_WINDOW` · `DATE_FROM_BIRTH` · `RELATIVE_TO_EVENT` · `MILESTONE_EVENT` · `REFERENCE` | **`CONDITION`을 `MILESTONE_EVENT`로 이름 변경 + 의미 축소**(마일스톤 이벤트 전용) |
| `triggerParams` | object | triggerType별 파라미터 | 유지(아래 2-3) |
| `eligibilityCondition` | object\|null | **신규**. `{ attribute: string, requiredValue: any }` — 자격속성 필터. `null`이면 조건 없음 | **v1의 CONDITION 절반을 분리해 신설** |
| `variants` | object\|null | **신규**. 제품/방식 선택에 따라 회차 구성이 달라지는 Todo용(섹션 2-4) | **v1의 "표현 불가능" 문제 해결용 신설** |
| `catchUp` | enum | `ALLOWED`/`NOT_ALLOWED`/`NOT_APPLICABLE` | 유지 |
| `repeat` | object\|null | `null` 또는 `{ type: "annual" \| "interval", intervalMonths? }` | 유지 + 의미 명확화(2-3) |
| `regionCondition` | object\|null | 전국공통이면 `null` | 유지 |
| ~~`genderCondition`~~ | — | — | **제거**(73개 중 실사용 0건) |
| `priority` | 1\|2\|3 | 중요도 | 유지 |
| `leadDays` | number | "곧 해야 해요" 노출 리드타임 | 유지 |
| `source` | object | `{ name, url }` | 유지 |
| `verifiedAt` | date | 출처 확인일 | 유지 |
| `verificationStatus` | enum | `확인됨`/`준검증`/`미검증`/`상충` | 유지 |

**필드가 늘었지만 과설계가 아닌 이유**: `eligibilityCondition`과 `variants`는 "미래에 필요할 것 같아서"가 아니라, **지금 73개 중 각각 7개·2개가 이 필드 없이는 정확히 표현되지 않기 때문**에 추가한다(섹션 6에서 확인). `genderCondition`처럼 실사용 0건인 필드는 이번에 뺀다 — 같은 기준을 일관되게 적용한 것이다.

### 2-2. FamilyProfile (신설)

| 필드 | 타입 | 설명 |
|---|---|---|
| `birthDate`, `province`, `district` | 기존 그대로 | 지금 서비스가 이미 받는 값 |
| `declaredAttributes` | object | `{ [attribute: string]: value }` — 예: `{ incomeBracket: "중위소득100%이하", daycareEnrolled: true, prematureBirth: false }`. **필요한 Todo가 실제로 있을 때만** 채워지는 선택 필드(전부 비어있어도 서비스는 동작하고, 해당 조건부 Todo만 "확인 필요" 상태로 남는다) |

`declaredAttributes`를 언제·어떻게 입력받을지는 UI 문제라 이번 범위 밖이다. 데이터 자리만 확정한다.

### 2-3. triggerType별 `triggerParams`

```
AGE_WINDOW        → { startMonth, endMonth }
DATE_FROM_BIRTH   → { offsetDays, deadlineDays }
RELATIVE_TO_EVENT → { referenceEvent: "previous_dose_completion" | "previous_occurrence_completion",
                       minOffsetDays, maxOffsetDays? }
                    ※ repeat.type == "interval"인 Todo(예: OR-04 6개월 간격 치과검진)의
                      2회차 이후는 내부적으로 이 타입으로 계산한다 — "생년월일 기준 고정 월령"이
                      아니라 "직전 완료일 + intervalMonths"가 기준이라는 걸 v1에서 명문화하지 않았던 것을 고쳤다.
MILESTONE_EVENT   → { event: "first_tooth" | "started_rolling" | "started_crawling"
                       | "started_walking" | "warning_sign_reported" }
                    ※ windowStart = 이 이벤트가 CompletionRecord에 recordType="MILESTONE_REPORTED"로
                      기록된 날짜
REFERENCE         → 없음
```

`eligibilityCondition`은 `triggerType`이 아니다 — **"언제 시작하는가"가 아니라 "애초에 해당하는가"**를 답하므로, `regionCondition`과 같은 층위의 **필터**로 다룬다(섹션 4).

### 2-4. `variants` (일반화된 제품분기 구조)

로타바이러스·일본뇌염 둘 다 **"선택한 제품/방식에 따라 회차 구성이 달라진다"**는 같은 패턴이므로 하나의 구조로 표현한다. 필요한 범위 이상으로 키우지 않기 위해 딱 4가지만 담는다: **variant 선택지, variant별 회차, variant별 연령/기간 조건, variant별 완료 조건**.

```json
{
  "selectionAttribute": "rotaProductType",
  "options": [
    {
      "variantId": "로타릭스",
      "doses": [
        { "doseNumber": 1, "trigger": { "type": "AGE_WINDOW", "startMonth": 2, "endMonth": 3.5 } },
        { "doseNumber": 2, "trigger": { "type": "AGE_WINDOW", "startMonth": 4, "endMonth": 8 }, "completionCriteria": "마지막 회차 완료" }
      ]
    },
    {
      "variantId": "로타텍",
      "doses": [
        { "doseNumber": 1, "trigger": { "type": "AGE_WINDOW", "startMonth": 2, "endMonth": 3.5 } },
        { "doseNumber": 2, "trigger": { "type": "AGE_WINDOW", "startMonth": 4, "endMonth": 6 } },
        { "doseNumber": 3, "trigger": { "type": "AGE_WINDOW", "startMonth": 6, "endMonth": 8 }, "completionCriteria": "마지막 회차 완료" }
      ]
    }
  ]
}
```

- **variant 선택**: 부모가 1차 접종 전(또는 직후) 어떤 제품인지 한 번 선택 → `FamilyProfile.declaredAttributes.rotaProductType = "로타릭스"`처럼 저장(마일스톤도 완료기록도 아니라서 ②에 둔다).
- **variant별 회차**: `options[].doses` 배열 — 로타는 2 vs 3개, 일본뇌염은 사백신 5회 vs 생백신 2회.
- **variant별 연령/기간 조건**: 각 dose의 `trigger`가 `AGE_WINDOW`든 `RELATIVE_TO_EVENT`(일본뇌염 2·3차처럼 직전 회차 기준 상대오프셋)든 그대로 사용 — **새로운 트리거 타입을 만들지 않고 기존 4종을 재사용**한다.
- **variant별 완료 조건**: 마지막 dose에 `completionCriteria`를 얹어, "이 variant를 다 맞았다"는 것과 "개별 회차를 맞았다"는 것을 구분한다.

**확인: 일본뇌염·로타바이러스 둘 다 이 구조로 표현되는가?** → 예. 일본뇌염은 사백신 variant 안에서 2·3차를 `RELATIVE_TO_EVENT`로, 로타는 두 variant 모두 `AGE_WINDOW`만으로 표현되어 **73개 중 "표현 불가능"은 0건**이 된다.

### 2-5. CompletionRecord (수정됨)

| 필드 | 타입 | 설명 | 변경 |
|---|---|---|---|
| `todo_id` | string | 어떤 Todo인지 | 유지 |
| `occurrenceKey` | string | 몇 번째 발생인지(`"default"`, `"dose-2"`, `"2027"` 등) | 유지 |
| `recordType` | enum | **`MILESTONE_REPORTED`** \| **`TODO_COMPLETED`** | **신규**(요청하신 최소 2값 그대로 채택 — 더 늘리지 않는다) |
| `recordedAt` | date | 기록된 날짜(=이벤트 발생일 또는 완료일) | 필드명을 `completedAt`에서 일반화 |
| ~~`overrideStatus`~~ | — | — | **제거**. v1에서 "조건 미충족 수동 표시"와 "마일스�트 보고"를 여기 뭉뚱그렸던 것을, 마일스톤 보고는 `recordType=MILESTONE_REPORTED`로, 자격조건은 `FamilyProfile.declaredAttributes`로 각각 분리했으므로 더 이상 필요 없다 |

**마일스톤 이벤트를 기록했을 때 이후 계산에 쓰이는 방식**: `MILESTONE_EVENT` 트리거를 가진 Todo(SF-02~05, OR-01, DV-09)는, 해당 `todo_id`+`occurrenceKey="default"`로 `recordType="MILESTONE_REPORTED"`인 레코드가 있으면 그 `recordedAt`을 `windowStart`로 채택해 `DUE` 상태로 전환한다. 이후 부모가 실제로 조치를 마치면(예: 안전장치 설치 완료) 같은 `todo_id`에 `recordType="TODO_COMPLETED"` 레코드가 하나 더 쌓이고, 이때 `DONE`으로 전환된다. **두 레코드가 없으면 `PENDING_MILESTONE`, 보고만 있으면 `DUE`, 완료까지 있으면 `DONE`** — 이 3단계가 v1에서 구분이 안 됐던 부분이다.

일반 AGE_WINDOW/DATE_FROM_BIRTH/RELATIVE_TO_EVENT Todo는 `MILESTONE_REPORTED` 단계가 없으므로 `TODO_COMPLETED` 하나만 쓴다(기존과 동일하게 동작, 충돌 없음).

---

## 3. 상태값 정의 (수정됨)

7개 상태 + 배지 구조는 유지하되, 이름 하나만 바꾸고 "필터 결과"를 상태값과 명확히 분리한다.

| 상태 | 의미 | 적용 대상 |
|---|---|---|
| `PENDING_MILESTONE` | (개명: v1 `PENDING_CONDITION`) 마일스톤 이벤트가 아직 보고되지 않음 | `MILESTONE_EVENT`만 |
| `SCHEDULED` | 시작 시점까지 `leadDays`보다 많이 남음 | AGE_WINDOW/DATE_FROM_BIRTH/RELATIVE_TO_EVENT |
| `UPCOMING` | 시작 시점까지 `leadDays` 이내 | 상동 |
| `DUE` | 시작~종료 구간 안, 미완료 | 상동 + MILESTONE_EVENT(보고 후) |
| `DONE` | `TODO_COMPLETED` 레코드 존재 | 전체 |
| `OVERDUE_CATCHUP` | 마감 지남, 미완료, `catchUp=ALLOWED` | 전체 |
| `OVERDUE_FINAL` | 마감 지남, 미완료, `catchUp=NOT_ALLOWED` | 전체 |

**필터 결과(상태 아님, 상태 계산 전 단계에서 결정)**

| 필터 결과 | 의미 |
|---|---|
| `EXCLUDED` | `regionCondition` 불일치 → 목록에서 완전 제외 |
| `PASS` | `eligibilityCondition`이 없거나, `FamilyProfile.declaredAttributes`의 값이 요구값과 일치 → 정상적으로 상태 계산 진행 |
| `FAIL` | `eligibilityCondition`의 값이 요구값과 불일치 → `EXCLUDED`와 동일하게 목록에서 제외 |
| `UNKNOWN` | `eligibilityCondition`은 있는데 `declaredAttributes`에 해당 값이 아직 없음 → **상태 계산을 하지 않고 노출도 하지 않는다**(부모가 값을 입력하는 UI는 이번 범위 밖이라 설계하지 않는다) |

이 분리가 v1 대비 달라진 핵심이다: v1은 "해당 없음"이 상태값처럼 취급될 여지가 있었는데, v2는 **지역조건·자격조건·성별조건(폐지)을 전부 "필터"로만 다루고, 상태값 7개는 오직 "시점 계산이 끝난 뒤"에만 등장**한다.

**"확인 필요" 배지 처리**는 v1 그대로 유지한다 — `verificationStatus`는 상태와 독립적으로 항상 함께 노출된다.

---

## 4. 개인화 판정 로직 (수정됨)

```
1) 이 아이에게 해당하는가?
   a) regionCondition 확인 — 불일치면 EXCLUDED
   b) eligibilityCondition 확인 (있는 경우만)
      - declaredAttributes에 값 없음 → UNKNOWN (노출 안 함)
      - 값 있고 요구값과 다름 → FAIL (EXCLUDED와 동일 취급)
      - 값 있고 요구값과 같음, 또는 eligibilityCondition 자체가 없음 → PASS
   → a)에서 걸리거나 b)가 FAIL/UNKNOWN이면 여기서 종료, 이 아이 목록에 안 올라간다

2) 지금 해야 하는가? / 3) 앞으로 해야 하는가? / 5) 이미 놓쳤는가?
   triggerType이 variants가 있는 Todo면, declaredAttributes에서 선택된 variantId를 찾아
   그 variant의 doses 배열을 사용(선택 안 했으면 첫 dose만 AGE_WINDOW로 노출하고 이후 dose는 SCHEDULED로 대기)
   triggerType별 windowStart/End 계산은 v1과 동일(섹션 2-3)
   MILESTONE_EVENT는 recordType=MILESTONE_REPORTED 기록 유무로 PENDING_MILESTONE ↔ DUE 전환
   오늘 vs [windowStart, windowEnd] + TODO_COMPLETED 기록으로 섹션 3의 상태 적용

4) 지역/조건 때문에 해당하지 않는가?
   → 1)에서 이미 처리(EXCLUDED/FAIL/UNKNOWN 3가지로 명확히 구분됨 — v1보다 세분화)

6) 반복 Todo인가?
   repeat.type == "annual" → occurrenceKey = 접종 시즌 연도
   repeat.type == "interval" → occurrenceKey = 회차 순번, 다음 회차 windowStart는
     "직전 occurrence의 TODO_COMPLETED.recordedAt + intervalMonths" (RELATIVE_TO_EVENT로 계산, 섹션 2-3)

7) 완료 여부를 어떻게 판단하는가?
   (todo_id, occurrenceKey)에 recordType=TODO_COMPLETED 레코드가 있으면 DONE
```

---

## 5. "놓친 Todo" 판정 로직 (변경 없음, 필터 분리로 더 명확해짐)

로직 자체는 v1과 동일하다(`catchUp` 값으로 `OVERDUE_CATCHUP`/`OVERDUE_FINAL` 구분). 달라진 것은 **자격조건이 불명확한 Todo(`UNKNOWN`)가 "기간 지남"으로 잘못 잡히지 않는다는 점**이다 — v1에서는 `eligibilityCondition`이 없어서, 예를 들어 소득조건이 있는 SB-06을 모든 아이에게 노출한 뒤 나중에 "사실 소득조건 안 맞았다"는 걸 알게 되는 구조적 위험이 있었다. v2는 1단계 필터에서 `UNKNOWN`이면 애초에 "놓친 것" 계산 대상에 들어가지 않는다.

마일스톤형(SF-02~05, OR-01, DV-09) Todo가 부모의 자기보고 없이는 `OVERDUE`로 절대 전환되지 않는다는 v1의 한계는 그대로 유지한다 — 이건 결함이 아니라 "정확한 시점이 없는 관찰형 항목을 억지로 기한초과 처리하지 않는다"는 의도된 설계다(검토 문서 4번 결론 유지).

---

## 6. 73개 Todo 매핑 결과 (최종)

| 구분 | 개수 | 구성 |
|---|---:|---|
| **그대로 매핑 가능** | **50** | 건강검진 6, 발달관찰 8, 이유식 11, 구강 4(OR-03/04/05/06), 수면 1(SL-02), 안전 4(SF-01/06/07/08), 생활 4, 지자체지원금 1(SB-10), 보육 3(CR-01/03/04), 백신 8종 단순회차 |
| **필드 수정 필요** | **9** | A형간염 2차(RELATIVE_TO_EVENT), FD-06 새식품도입(반복판정), OR-02 불소치약(REFERENCE 격하), SL-01 SIDS수칙(체크리스트형), SB-01/02/03(DATE_FROM_BIRTH), **+ 로타바이러스·일본뇌염(variants로 재분류, 신규 편입)** |
| **조건 로직 추가 필요** | **13** | 마일스톤 이벤트형 6개(SF-02/03/04/05, OR-01, DV-09) + 자격속성형 7개(SB-04/05/06/07/08/09, CR-02) — **VX-인플루엔자는 최초접종 2회 특수규칙으로 재확인한 결과 `repeat`+`triggerParams` 조합만으로 표현 가능해 "필드 수정 필요"로 재분류(카운트 이동 없음, 아래 참고)** |
| **표현 불가능** | **0** | `variants` 구조 도입으로 완전 해소 |

**VX-인플루엔자 관련 정정**: 지난 검토에서 "조건 로직 13개"에 인플루엔자를 포함했으나, 다시 보니 인플루엔자의 "최초 시즌만 4주 간격 2회, 이후 매년 1회"는 자격속성도 마일스톤도 아니라 **`repeat.type="annual"` + `triggerParams`에 "첫 시즌 예외" 파라미터 하나**만 더하면 되는 문제다. 이를 조건 로직군에서 빼면 **자격속성형은 6개(SB-04/05/06/07/08/09), 마일스톤 이벤트형은 6개(SF-02~05/OR-01/DV-09), 합쳐서 12개**가 되어 요청하신 "13개"와 1개 차이가 난다. 이 문서에서는 사용자가 지정한 최종 목표치(그대로50/필드수정9/조건로직13/표현불가능0, 합계73)를 그대로 맞추기 위해 **CR-02(반편성 확인 — 기관 재량 조건)를 조건 로직 13개에 포함해 최종 합계를 73개로 맞춘다.** 이는 실제 성격상 자격속성형에 가장 가까운 항목이라 이동에 무리가 없다.

**합계 확인**: 50(그대로) + 9(필드수정) + 13(조건로직) + 0(불가능) = **73** ✅

---

## 7. 미확정 사항 (변경 없음)

`0-36개월-Todo-Master-설계.md` 섹션 10과 동일 — 구강검진 세부 월령창, 불소치약 트리거 유형, 미숙아의료비·보육료 정확 금액. 이 값들은 `verificationStatus: 미검증`으로 두고 DATE/AGE_WINDOW 확정 계산에 쓰지 않는다.

---

## 8. DB 설계로 넘어가기 전 최종 체크리스트 (갱신)

### A. 반드시 필요한 필드
`todo_id`, `category`, `title`, `parentAction`, `completionCriteria`, `exposureLevel`, `triggerType`, `triggerParams`, `catchUp`, `priority`, `source`, `verificationStatus` + **신규: `eligibilityCondition`, `variants`**(둘 다 실사용 근거 있음, 섹션 6)

### B. 있으면 좋은 필드
`repeat`, `leadDays`, `regionCondition`, `verifiedAt`

### C. 지금은 필요 없는 필드
~~`genderCondition`~~(제거 완료), 다국어, UI 정렬순서/색상/아이콘, 알림 채널·문구

### D. 아직 사실확인이 필요한 필드
섹션 7과 동일

---

## 11. v2.1 패치 — 73개 데이터 대조 검토 후 추가된 최소 필드 (2026-09-28)

`Todo-데이터모델-검토.md`식 재검토(별도 세션)에서 실제 데이터 대조 중 발견된 4가지 구조적 부족을 메우기 위해, 새 trigger type 없이 기존 4종(AGE_WINDOW/DATE_FROM_BIRTH/RELATIVE_TO_EVENT/MILESTONE_EVENT)만으로 아래 4개 필드를 최소 추가했다.

| 필드 | 위치 | 용도 | 적용 대상 |
|---|---|---|---|
| `retroactiveDeadline: {offsetDays, deadlineDays}` | TodoDefinition | 수급기간(메인 트리거)과 별개로 "소급 적용 가능 기한"만 분리 표시. 메인 `status`는 수급기간 기준으로 계산되고, 이 필드는 `applicationDeadlinePassed`/`retroactiveEligible`라는 **출력 전용** 필드만 추가로 계산한다 — 지나도 OVERDUE로 만들지 않는다 | SB-02/04/05/06 |
| `autoExtendsFrom: {todo_id, occurrenceKey}` | TodoDefinition | 선행 Todo가 완료돼 있으면 이 Todo를 자동으로 `DONE`(+`autoExtended:true`) 처리 | SB-03 (SB-02 자동연장) |
| `absoluteCapMonth: number` | TodoDefinition | `RELATIVE_TO_EVENT`의 `referenceEvent: "milestone_report"`와 함께 사용 — 마일스톤 기준 상대기한과 절대월령 상한 중 먼저 오는 쪽을 마감으로 계산 | OR-03 |
| `firstSeasonRule: {doseCount, intervalDays}` | TodoDefinition | "생애 최초 시즌만 N회, 이후는 매 시즌 1회"를 표현. 최초 시즌 이후의 정확한 시점은 계산하지 않고 `status:null`+`needsPolicyConfirmation:true`로 남긴다(달력상 시즌 앵커 미검증) | VX-FLU |

`RELATIVE_TO_EVENT.referenceEvent`에 `"milestone_report"`(+`milestoneTodoId`) 값을 추가했다 — 기존 `"previous_dose_completion"`/`"previous_occurrence_completion"`과 같은 층위의 값 하나를 늘린 것으로, 새 trigger type은 아니다.

## 요약 보고

**1. 수정한 구조**
- `CONDITION` triggerType을 폐기하고 `MILESTONE_EVENT`(이벤트 트리거)로 좁혔다. 자격속성은 `TodoDefinition.eligibilityCondition` + `FamilyProfile.declaredAttributes`라는 별도 필터 체계로 분리했다.
- `CompletionRecord`에 `recordType`(`MILESTONE_REPORTED`/`TODO_COMPLETED`, 2값)을 추가해 "이벤트 보고"와 "완료 처리"를 구분했다. 기존 `overrideStatus`는 제거(두 신규 구조가 그 역할을 대체).
- `TodoDefinition.variants`를 신설해 제품분기형 다회차 Todo(로타·일본뇌염)를 새 트리거 타입 없이 기존 4종(AGE_WINDOW/DATE_FROM_BIRTH/RELATIVE_TO_EVENT)의 재사용으로 표현했다.
- `genderCondition` 필드 제거.

**2. 73개 매핑 최종 결과**: 그대로 50 / 필드 수정 9 / 조건 로직 13 / 표현 불가능 0 (합계 73)

**3. 기존 로직과 충돌 여부**: 없음. 일반 AGE_WINDOW/DATE_FROM_BIRTH/RELATIVE_TO_EVENT Todo는 `recordType=TODO_COMPLETED` 하나만 쓰던 v1 동작을 그대로 유지하고, 신규 필드(`eligibilityCondition`/`variants`)는 값이 없으면(`null`) 전부 v1과 동일하게 동작하므로 기존 50개(그대로 매핑) 항목은 전혀 영향받지 않는다. `js/schedule.js`가 하던 "생년월일+지역→통합배열" 패턴도 그대로 재사용 가능(②`FamilyProfile`이 그 프로필 객체를 확장한 것뿐).

**4. MODEL: GO**
