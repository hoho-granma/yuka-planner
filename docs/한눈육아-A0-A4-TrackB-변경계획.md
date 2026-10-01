# A0~A4 / Track B 변경 계획 (구현 전 검토용)

작성: 2026-09-30 · **기준선 = `479d68e`(v1.12.6, Q-A 완료)** · 상위 문서: `한눈육아-확장설계-2단계-상세.md` §13·§15, `한눈육아-이슈기록.md`
**이 문서는 계획이다(작성 당시 코드·데이터·규칙은 바꾸지 않았다).** 이후 A0~A4와 B0~B5가 구현·커밋되었다 — 아래 "진행 현황" 참고. 각 단계는 "테스트 통과 + 기준선 대비 차이 목록 승인 + 선별 커밋"으로 끝난다.

순서: ① 현재 상태 → ② 바꾸는 파일 → ③ 파일별 변경 내용 → ④ 기존 0~36개월 결과 영향 → ⑤ 새 연령/학년 데이터 필요 여부 → ⑥ 테스트 계획 → ⑦ 기존 기능 보존 방법 → ⑧ 결정 요청

---

## 진행 현황 (2026-10-01 기준 — 계획 대비 실제 결과 기록)

| 단계 | 실제 | 커밋 |
|---|---|---|
| A0 | 완료(auto-diff 도구 커밋) | `c8405f1` |
| A1 | 완료 | `e6d6db3` |
| A2 | 완료(결과 불변 방식) | `24b1051` |
| A3 | 완료(값 36 유지) | `fc9a9dc` |
| A4 | 완료(결과 불변) | `2d7fd88` |
| B0 | 완료 | `3ad690d` |
| B1 | 완료 | `63d6b9d` |
| B2 | 완료 | `e3be606` |
| B3 | 완료 | `395e266` |
| B4 | 부분 구현: 가족 일정 입력·캘린더 통합 완료. **미구현**: 온보딩 칩(`care`·`academy`), `records*.js` `scheduleRef`, 주간 보기 | `50720b8` |
| B5 | 구현·검증·커밋 완료 | `f0d7c5b` |
| B6 | 계획 상태(미착수) | — |
| B7~B11 | 이 계획 범위 밖(미착수) | — |

## 1. 현재 상태 (479d68e)

### 1-1. 테스트 기준선

| 테스트 | 통과 수 |
|---|---|
| `date-calc` | 40 |
| `hn-logic` | 43 |
| `todo-engine` | 40 |
| `sync-v2.logic` | 14 |
| `firestore-rules.logic` | 9 |
| `data-month-integers` | 통과(알려진 위반 2건 I-4 허용) |

### 1-2. 연령 관련 코드 현황 (실측)

| 위치 | 내용 | 종류 |
|---|---|---|
| `schedule.js:62` `ageInMonths` | 달력 월 차이 − (오늘 일자 < 출생 일자이면 1). **말일 규칙과 다름(I-1)** | 개월 수 계산 |
| `hn-logic.js:372` `ageMonthsAt` | 위와 같은 방식 | 개월 수 계산 |
| `app.js` 호출 11곳 | `:764` 표시 범위 필터, `:799/820/841` 헤더·프로필 표기, `:1274` 혜택 카드, `:1308/1450/2351` 체크리스트 현재 월령, `:1383` 회차 항목 월령, `:1786` 상세, `:2303` 홈 컨텍스트 | 소비자 |
| `app.js:764` | `ageInMonths(birth, e.date) <= 36` — **이벤트 시점 월령**이 36 이하만 표시 | **36 리터럴 ①** |
| `app.js:1318` | `LATE_BUCKETS` 마지막 구간 `24~36`, `checklistBucket` 폴백이 마지막 구간 | **36 리터럴 ②** |
| `app.js:1412` | `endMonth==null ? 36 : Math.min(36, …)` | **36 리터럴 ③④** |
| `app.js:618` | 생년월일 선택기 `thisYear-8`(9개 연도) | 범위 상수 |
| 표기 | `app.js:805/841` "생후 N개월", `:1327` 체크리스트 그룹 라벨, `records-view.js:65/120/181` "생후 N개월" | 표기 |
| `todo-engine.js:24` | `MONTH_DAYS=30` | **Q-G 조건에 따라 불변** |

### 1-3. 이번 조사로 새로 알게 된 사실 (계획에 반영)

1. **상한을 올리면 기존 사용자에게 보이는 것이 늘어난다.** 고정 테스트 프로필(은찬, 구로구) 이벤트 133건 중 **128건이 이벤트 시점 월령 ≤36**이고, 37개월 이후는 **5건**이다: `VX-DTAP[dose-5]`, `VX-IPV[dose-4]`, `VX-MMR[dose-2]`, `VX-JEV[dose-4]`, `VX-JEV[dose-5]`(추가접종). 지금은 필터에 걸려 **숨겨져 있다.** → 상한을 균일하게 올리면 **모든 0~36개월 사용자의 캘린더·체크리스트에 이 5건이 새로 나타난다.**
2. **그 5건은 지금 그대로 열면 체크리스트에서 잘못 묶인다.** 회차 항목의 대표 월령은 `occurrenceStartMonth`(회차 시작월, 48·60개월 등)를 쓰는데 `checklistBucket`의 폴백이 "만 2세 (24~36개월)"이라 **라벨이 틀린 그룹에 들어간다.** → 상한 해제는 A4의 그룹 일반화와 **반드시 함께** 가야 한다.
3. `data/todos`의 `displayMonth` 최댓값은 36 이하(37 이상 0건, null 10건). **36개월 이후용 콘텐츠가 데이터에 없다.**
4. `app.js`(2,500줄 IIFE)는 Node에서 실행할 수 없어 **테스트 불가**다. 순수 로직을 새 모듈로 빼서 테스트하고, `app.js`는 "호출 교체"만 하는 방식이 필수다.

---

## 2. 바꾸는 파일 (단계별)

범례: 🟢 신규(기존 동작 무영향) · 🟡 소규모 수정 · 🔴 위험 큰 수정(`app.js` 등) · ⚪ 테스트/문서만

### 트랙 A — 연령/학년 엔진

| 단계 | 목적 | 파일 |
|---|---|---|
| **A0** | 기준선 확정·비교 도구 | ⚪ `test/tools/auto-diff.js`(신규, `qa-month-compare.js` 일반화). **제품 코드 0** |
| **A1** | 연령 계산 단일 모듈(소비자 없음) | 🟢 `js/child-timeline.js`, ⚪ `test/child-timeline.test.js`, 🟡 `index.html`·`sw.js`·`version.js`(등록만), `www/` |
| **A2** | 개월 수 계산 위임 | 🟡 `schedule.js`(`ageInMonths` 본문), 🟡 `hn-logic.js`(`ageMonthsAt` 본문), 등록 파일들 |
| **A3** | 36 리터럴 제거(**값은 36 유지**) | 🔴 `app.js`(3곳), 🟡 `child-timeline.js`(설정·판정 함수), 등록 파일들 |
| **A4** | 체크리스트 그룹·표기·선택기 범위 일반화(**기본값은 현재와 동일**) | 🔴 `app.js`(그룹 함수 제거→위임, 표기 3곳, 선택기 1곳), 🟡 `records-view.js`(표기 3곳), 🟡 `child-timeline.js` |

### 트랙 B — 가족 일정

| 단계 | 목적 | 파일 |
|---|---|---|
| **B0** | 사전 확인·테스트 뼈대 | ⚪ 문서, `test/fixtures/family-doc.json`(개인정보 제거 골든), 사용자 작업(§8) |
| **B1** | 동기화 기반(기능 플래그 OFF) | 🟡 `firestore.rules`(**추가만**), 🟢 `js/household-sync.js`, ⚪ `test/firestore-rules.logic.test.js`, ⚪ `test/household-sync.logic.test.js` (계획 당시 이름 `household-sync.test.js` → 실제 파일명) |
| **B2** | 순수 로직(표시·저장 연결 없음) | 🟢 `js/user-schedule.js`(검증·단발 일정 변환), 🟢 `js/calendar-model.js`, ⚪ 테스트 2개 |
| **B3** | 가구 생성·참여·아이 목록 | 🔴 `app.js`(프로필 시트, 아이 전환 3함수, init), 🟡 `index.html`, `css` |
| **B4** | 직접 입력 + 캘린더 통합 + 온보딩 칩 | 🔴 `app.js`(캘린더 3함수·`renderAll`·프로필 직렬화), 🟢 `js/user-schedule-view.js`, 🟡 `index.html`, `css`, 🟡 `records*.js`(`scheduleRef`) — **구현됨: 입력·캘린더 통합. 미구현: 온보딩 칩(`care`·`academy`), `records*.js` `scheduleRef`** |
| **B5** | 반복·예외 | 🟡 `user-schedule.js`(전개), 🟢 입력 UI 확장 — **구현·검증·커밋 완료(`f0d7c5b`)** |
| **B6** | 담당자 | 🟡 `household-sync.js`(members), 🟢 UI |
| B7~B11 | 알림·충돌/공백·OCR·음성·외부 | **이 계획 범위 밖**(B6까지 안정화 후 별도 계획) |

모든 단계 공통 부수 변경: `index.html`(스크립트 태그·`?v=`), `sw.js`(SHELL_ASSETS), `js/version.js`(증가), `www/`(iOS용 변형이므로 통째 복사 금지 — 스크립트 태그와 JS 파일만 반영).

---

## 3. 파일별 변경 내용

### A0 — 기준선과 비교 도구 (제품 변경 없음)
- `test/tools/auto-diff.js`: 현재 `qa-month-compare.js`를 일반화. `BASE` 커밋(기본 `479d68e`)의 소스를 `git show`로 읽어 **같은 데이터**로 전/후를 계산·비교(데이터 파일이 다른 트랙에서 계속 바뀌므로 저장 골든에 의존하지 않는다).
  - 비교 대상 확대: 기존(이벤트 날짜 필드·`displayDate`·홈 분류) + **`visibleSchedule` 결과 id 목록**, **체크리스트 그룹 키/라벨**, **헤더 "생후 N개월" 문자열**(app.js 로직은 Node 실행 불가 → 도구 안에 **기준선 공식을 복제**해 "전" 값을 만들고, "후"는 새 모듈을 호출).
  - 픽스처: 고정 테스트 계정(은찬 2026-06-20·구로구), 20일·28일생 대조군, **36개월 경계**(출생 3년 전 같은 날, 36개월 직전/직후), 말일생 5종(1/29·1/30·1/31·3/31·2/29), 임신 중(예정일), 시도 다른 지역 1~2곳.
  - 불변식: ① 엔진 `windowStart/End` 불변 ② 이벤트 집합 불변 ③ 대조군 완전 불변 ④ 허용 차이는 "단계별 승인 목록"에 있는 것만.
- **커밋 여부**: 이 도구는 이번에 **커밋하도록 제안**(Q-A 때는 데이터 결합 골든 때문에 제외했으나, 도구 자체는 `BASE`를 입력받아 골든 JSON 없이 동작하므로 A1~A4 재사용에 필요). 골든 JSON은 계속 미커밋.

### A1 — `js/child-timeline.js` (신규, UMD 순수 모듈, `DateCalc`에 의존)
API(설계 §13-3의 A 단계 부분집합 — **학교/학년 계층은 넣지 않는다**):
```text
ChildTimeline.completedMonths(birthDate, asOf)      → 정수  (말일 규칙: addMonthsClamped(birth, m) ≤ asOf 를 만족하는 최대 m, 하한 0)
ChildTimeline.compute({ birthDate, asOf, stage })   → { age:{years, months, days, totalMonths}, label, school: null }
ChildTimeline.ageLabel(totalMonths)                 → "생후 N개월"  (A1~A4 범위에서는 ≤36에서 현재 문자열과 동일)
ChildTimeline.SERVICE_RANGE                         → { maxMonths: 36, pickerYearsBack: 8 }   ← 현재 값 그대로
ChildTimeline.isWithinServiceRange(birthDate, eventDate, range?) → boolean  (현재 app.js:764 판정과 동일 공식)
ChildTimeline.CHECKLIST_BUCKETS / checklistBucket(m) / checklistGroupLabel(key)  → 현재 LATE_BUCKETS 값 그대로(24~36 포함)
```
- 소비자가 없으므로 앱 동작은 그대로. 새 파일 등록(`index.html`·`sw.js`·`version.js`·`www/`)만 한다.
- **동등성 스윕(V1)**: 출생일(2019~2030 전 일자) × 기준일 격자에서 `completedMonths`와 기존 `ageInMonths`를 비교해 **차이 목록**을 만든다. 예상 차이 = I-1 해당(출생 일자 29~31, 월말 1~3일)뿐이다.
- `todo-engine.js`(30일 근사)는 **호출도 참조도 하지 않는다.**

### A2 — 개월 수 계산 위임 (결정 D1 필요)
- `schedule.js` `ageInMonths(birth, today)` 본문 → `ChildTimeline.completedMonths(...)`. `hn-logic.js` `ageMonthsAt` 본문 → 같은 함수. **함수 이름·서명·`app.js` 호출부 11곳은 무수정.**
- **2-b(추천, 말일 규칙 통일)**: I-1 해소. 결과가 바뀌는 것 = 출생 일자 29~31의 개월 수가 최대 3일 일찍 오름. 영향: 헤더/프로필 "생후 N개월", 혜택 상태 판정(`ageNow` vs `minAgeMonths`), 체크리스트 현재 월령 그룹, `visibleSchedule` 경계, 기록 탭 "생후 N개월".
- **2-a(대안, 결과 불변)**: `ChildTimeline`에 "기존 규칙" 함수를 두고 위임만 한다(통일은 하지 않음). 결과는 바이트 단위로 동일하지만 I-1이 남고 `ChildTimeline`이 두 규칙을 가진다.

### A3 — 36 리터럴 제거 (값은 그대로 36)
- `app.js:764`: `ageInMonths(...) <= 36` → `ChildTimeline.isWithinServiceRange(profile.birthDate, e.date)`(값 36).
- `app.js:1412`: `tp.endMonth == null ? 36 : Math.min(36, …)` → `ChildTimeline.SERVICE_RANGE.maxMonths`(값 36).
- 주석(`:760-761`, `:1439`) 정정. `LATE_BUCKETS`(`:1318`)는 A4에서.
- **상한 값을 올리지 않는다.** 이유: §1-3 ①②. 올리는 것은 **해제 단계(A4 이후, 콘텐츠와 함께)**의 별도 승인 사항이다.

### A4 — 그룹·표기·선택기 일반화 (기본값은 현재와 동일)
- `app.js:1314-1330`(`LATE_BUCKETS`·`checklistBucket`·`checklistGroupLabel`) 삭제 → `ChildTimeline.CHECKLIST_BUCKETS/checklistBucket/checklistGroupLabel` 호출로 교체. 표는 **데이터 주도**(현재 3구간 그대로)라서 나중에 구간만 추가하면 된다.
- `app.js:805/841` 헤더·프로필 표기 → `ChildTimeline.compute(...).label`(≤36에서 문자열 동일). 임신 중(`pregnant`)은 기존 경로 유지.
- `records-view.js:65/120/181` "생후 N개월" → `ChildTimeline.ageLabel`.
- `app.js:618` 선택기 연도 수 → `SERVICE_RANGE.pickerYearsBack`(값 8 = 현재).
- **하지 않는 것**: 36개월 이후 라벨 체계(만 3세… 문구), 학년 구분, `displayGroup` 데이터 필드 — 콘텐츠·정책값이 없으므로 **메커니즘만**. 문구는 UX 결정(§8 D3).

### B0 — 사전 확인 (제품 변경 없음)
- 배포된 Firestore 규칙 **실제 내용 확인**(§8 사용자 작업), 골든 가족 문서(개인정보 제거) 확보, T1(쓰기 페이로드 캡처)·T4(메타모픽) 테스트 뼈대 작성.

### B1 — 동기화 기반 (기능 플래그 `FEATURES.household = false`)
- `firestore.rules`: 기존 블록은 **한 글자도 수정하지 않고** `householdCodes`·`households/**` 블록만 **추가**(설계 §11-3).
- `js/household-sync.js`: 가구·아이 링크·담당자·일정 읽기/쓰기, 로컬 미러(`hannun_household:<hid>`), 대기열(`hannun_household_pending:<hid>`), 재시도, 실패 표시. **Firestore 어댑터를 주입 가능하게 만들어 Node에서 가짜 어댑터로 테스트**한다.
- `js/sync.js`는 **무변경.** 규칙 미배포 상태에서는 `permission-denied`를 감지해 UI를 숨긴다.

### B2 — 순수 로직 (연결 없음)
- `js/user-schedule.js`: `validate`(불변식 I1~I12), `normalizeFromCandidate`, 단발 일정→Occurrence 변환(FIXED/PERIOD/`endDate`). 반복 전개는 B5.
- `js/calendar-model.js`: `buildCalendarModel`(설계 §9-1). 입력은 `autoEvents`·`displayDate` Map·USER 일정·필터. **`app.js`에 연결하지 않는다.**

### B3 — 가구 UI
- `app.js`: `showProfileSheet`(가구 만들기·코드 표시·복사), `rememberChild/loadChildren/switchToChild`(서버 링크와 로컬 목록 합집합), `init`(가구 로드), 새 아이 추가 시 링크 생성. 플래그 OFF면 기존 동작.
- 아이 문서(`families/{코드}`)는 **쓰지 않는다**(동결 계약).

### B4 — 직접 입력 + 캘린더 통합
- `app.js`: `calendarDayItems`·`renderSelectedDayPanel`의 데이터 소스에 `CalendarModel` 결과 합류(3묶음: 내 일정 / 혜택 시작 / 추천 항목), 그리드 아래 "이 달 기간 일정" 섹션, `[월][주]`·필터(주간은 별도 하위 단계 — **주간 보기 미구현**, 월간·필터만 구현), `renderAll`에 호출 1줄, `profileToPlain/FromPlain`에 `care`·`academy`(**미구현**).
- `js/user-schedule-view.js`: 입력 시트(제목·아이·날짜/기간·시간), 확인 화면.
- **AUTO 배열·`displayDate`·`visibleSchedule`은 건드리지 않는다**(USER는 별도 경로 — CATEGORY_META 6그룹 가정 충돌 회피).
- 선행: 아이별 색·USER 표식은 **UX 스펙 문서**(마크다운, 디자인 캔버스 미사용)를 먼저 확정(Q-I).

### B5 — 반복 / B6 — 담당자
- (B5 구현·검증·커밋 완료 `f0d7c5b`. B6는 계획 상태 유지.)
- B5: `expandOccurrences`(WEEKLY, `interval`, `byDay`, `until`, 예외: CANCELLED/RESCHEDULED/DONE, 예외 편집은 dot-path 필드 쓰기), 로컬 날짜 산술만.
- B6: `members` 서브컬렉션 CRUD, `assigneeMemberId`, 담당 미정 표시(경고 로직은 B8).

---

## 4. 기존 0~36개월 결과 영향

| 단계 | 영향 | 근거·조건 |
|---|---|---|
| A0 | **없음** | 제품 코드 무변경 |
| A1 | **없음** | 소비자 없는 신규 모듈 |
| A2 | **2-b: 출생 일자 29~31일생만 개월 수 최대 3일 앞당김**(I-1) / 2-a: 없음 | 28일 이하 출생은 속성 테스트로 전수 동일 확인 예정. 차이 목록 승인 후에만 진행 |
| A3 | **없음** | 상한 값 36 유지. 판정 공식 동일(테스트: 모든 픽스처의 표시 id 목록 동일) |
| A4 | **없음(기본값)** | ≤36 구간에서 그룹 키·순서·라벨, 헤더 문자열 동일. 선택기 연도 수 동일 |
| **(상한 해제, 별도 단계)** | **있음** — 은찬 기준 37개월 이후 접종 5건이 모든 0~36개월 사용자에게 새로 나타남 | §1-3. 해제는 A4 + 콘텐츠 + 명시 승인 후 |
| B0~B2 | 없음 | 플래그 OFF·연결 없음 |
| B3~B6 | **플래그 ON일 때 UI 요소 추가**(가구 시트, 필터, 기간 섹션, 입력 버튼). **AUTO 일정 내용·`displayDate`·완료·기록은 불변** | 배열 분리 + 메타모픽 테스트(T4) + 기준선 diff |

---

## 5. 새로운 연령/학년 데이터가 필요한가

| 단계 | 필요 여부 | 내용 |
|---|---|---|
| A0~A4 | **필요 없음** | 새 Todo·정책값·학년 데이터 없음. `SERVICE_RANGE`는 **설정 상수**(현재 값 그대로). `school: null` 유지 — 입학 학년도·학기 경계·반 나이 기준은 **공식 확인 전이라 코드/데이터에 넣지 않는다**(Q-C 조건) |
| A4의 라벨 문구 | **결정 필요(데이터 아님)** | 36개월 이후 그룹 라벨("만 3세 …")은 문구 결정이며 콘텐츠가 생길 때 확정 |
| B0~B6 | **필요 없음** | 새 Todo 데이터 없음. 필요한 것은 **UI 문구·색**(사용자 일정 분류 5종 라벨, 아이별 색) = UX 스펙(Q-I) |
| 이후(A5~A6) | **필요** | 예비초등·초1~2 콘텐츠와 정책값 = **공식 출처 조사 트랙**(이 계획과 병렬 진행 가능, A0~A4에 선행 조건 아님) |

---

## 6. 테스트 계획

### 6-1. 공통 게이트(모든 단계)
1. 기준선 71→현재 스위트 전부 통과(계획 시점의 수치이며 역사적 기준 — 현재는 `test/*.test.js` 16개 파일 전체가 게이트; `date-calc` 40, `hn-logic` 43, `todo-engine` 40, `sync-v2` 14, `rules` 9, 데이터 가드).
2. `auto-diff`(BASE=`479d68e`): 엔진 `windowStart/End` 불변, 이벤트 집합 불변, 대조군 완전 불변, **허용 차이는 승인 목록만**.
3. 문법 검사, 고정 테스트 계정(은찬) 화면 점검.

### 6-2. 단계별

| 단계 | 추가 테스트 |
|---|---|
| A1 | `child-timeline.test.js`: `completedMonths`(말일·윤일 표), `label`, 버킷 표 동등성(현재 `LATE_BUCKETS`와 값 동일), `SERVICE_RANGE` 현재값. **V1 스윕**(신·구 개월 수 차이 목록 = I-1만인지) |
| A2 | 2-b: I-1 차이 목록 승인(출생 29~31일만, ≤3일) / 2-a: 결과 동일. 28일 이하 전수 동일 속성 |
| A3 | 모든 픽스처에서 `isWithinServiceRange` 결과 = 기존 인라인 공식(`ageInMonths(birth,e.date) <= 36`) — **표시 id 목록 동일** |
| A4 | ≤36 전 월령(0~36) 그룹 키·라벨·순서가 기준선과 동일, 헤더 문자열 동일(0·11·12·13·35·36개월), 선택기 연도 목록 동일 |
| B0 | T1: 가구 기능을 쓰지 않은 세션이 **아이 문서에 아무 필드도 쓰지 않음**(페이로드 캡처) |
| B1 | 규칙 논리 테스트(새 블록 허용/거부, 기존 블록 무변경 — 기존 9개 통과), 대기열·재시도·오프라인·`permission-denied` 표시(가짜 어댑터) |
| B2 | 불변식 I1~I12, `dateKind` 별 날짜 규칙(원본에 없는 날짜 생성 금지), `CalendarModel` 정렬·`+N`·기간 목록·필터, **T4 메타모픽**(USER 임의 추가/삭제해도 `autoEvents`·`displayDate` Map 불변) |
| B3~B6 | 가구 생성/참여/분리 흐름, 플래그 ON/OFF 동작 동등성, 2기기 수동 프로토콜(옛 빌드 + 새 빌드), 반복 전개(요일·`interval`·`until`·예외·이동·범위 상한), 로컬 날짜 산술(UTC 금지) |

### 6-3. `app.js` 테스트 불가 문제의 대응
`app.js`는 순수 함수만 Node에서 검증 가능하다. 그래서 (a) 판정·그룹·라벨 로직은 **모듈로 이동해 테스트**하고 (b) `app.js`에는 "호출 교체"만 남기며 (c) 교체 전후를 **`auto-diff`의 복제 공식**으로 비교하고 (d) 나머지는 **화면 수동 점검표**(5개 탭 × 은찬 계정)로 확인한다. 이 한계는 남는다.

---

## 7. 기존 기능 보존 방법

| 장치 | 내용 |
|---|---|
| 기준선 고정 | `479d68e`. 모든 diff는 이 커밋 대비 |
| **값 불변 원칙** | A3·A4는 리터럴을 **설정으로 옮기되 값은 현재와 동일**. 값 변경(해제)은 별도 승인 |
| 래퍼 유지 | `ageInMonths`·`ageMonthsAt`·`addMonths`의 이름·서명·호출부 불변 |
| 새 파일 우선 | 로직은 신규 모듈에, `app.js`는 호출 교체만(가장 위험한 파일의 변경 최소화) |
| 배열 분리 | USER 일정은 AUTO 배열과 **섞지 않음**(카테고리 6그룹 가정 충돌·진행률 오염·기록 orphan 구조적 차단) |
| 플래그 OFF 기본 | `FEATURES.household`, 캘린더 통합은 플래그 뒤. 규칙 미배포·권한 거부 시 UI 숨김 |
| 동결 계약 | 아이 문서·`completed`·`records` 모양 불변(설계 §1). Firestore는 **추가만** |
| 엔진 무접촉 | `todo-engine.js` A0~A4에서 수정 0. 엔진 `windowStart/End` 불변을 모든 단계의 중단 조건으로 |
| 승인 게이트 | 각 단계: 차이 목록 → 승인 → 선별 커밋 → 다음 단계. "차이가 발견됐다고 추가 수정하지 않는다" |
| 커밋 위생 | 이 폴더는 다른 트랙(`data/subsidies`, `css`, `index.html` 일부)이 동시에 수정 중 → **파일/hunk 선별 스테이징**(`index.html`은 HEAD 사본에 내 변경만 적용해 인덱스에 직접 올림) |
| `www/` | iOS용 변형 → 통째 복사 금지, 스크립트 태그·JS 파일만 반영 |
| 롤백 | 단계마다 독립 커밋. 새 데이터는 추가뿐이라 플래그 OFF·커밋 되돌리기로 복구(데이터 복구 작업 없음) |

---

## 8. 결정 요청

| # | 질문 | 추천 | 영향 |
|---|---|---|---|
| **D1** | **A2**: 개월 수 계산을 말일 규칙으로 통일할까? (I-1 해소) | **2-b 통일**, 단 독립 커밋 + 차이 목록 승인. 결과를 절대 바꾸지 않으려면 2-a | 29~31일생 개월 표기 ≤3일 |
| **D2** | **A3**: 상한 값 36을 유지하고 리터럴만 설정으로 옮길까? | **유지**. 해제는 A4 + 콘텐츠와 함께 별도 승인(해제 시 접종 5건이 기존 사용자에게 나타남) | 없음 |
| **D3** | **A4**: 36개월 이후 라벨·`displayGroup`·학년은 **메커니즘만** 만들고 문구는 콘텐츠 트랙에서 정할까? | **예** | 없음 |
| **D4** | `test/tools/auto-diff.js`를 A0에서 **커밋**할까? (골든 JSON은 계속 미커밋) | **예** | 테스트 도구 1개 |
| **D5** | **말일생 임시 프로필**로 화면 검증(Q-A5, 미답변): A2 검증에 필요. 은찬 계정(20일생)은 재현 불가 | **승인 요청** — 프로필 생성 시 Firestore 문서 1건 생기고 검증 후 삭제 | 테스트 문서 1건 |
| **D6** | **B0 사용자 작업**: ① 배포된 Firestore 규칙 export(콘솔 또는 `firebase` CLI) ② 개인정보 제거한 실제 가족 문서 1건(또는 은찬 문서) 제공 | **필요**(B1 착수 전) | B1 이후 |
| **D7** | **B4 선행**: 사용자 일정 분류 5종 라벨·아이별 색·USER 표식은 **UX 스펙 마크다운**으로 먼저 확정(디자인 캔버스 사용 안 함) | **예**, B3와 병행해 제가 초안 작성 | 디자인 |
| **D8** | 진행 순서 | **A0 → A1 → (D1 승인) A2 → A3 → A4**, **B0은 A0와 병행**, B1은 D6 이후. A5(새 트리거)·A6(콘텐츠)은 정책 조사 후 별도 계획 | |

## 부록 — 확인하지 못한 것
1. 배포된 Firestore 규칙 실제 내용(B0/D6).
2. `app.js` 화면 동작(Node 불가 — 수동 점검 의존).
3. 아이 N명 합산 계산 성능·Firestore 과금(B3 이후 실측).
4. `www/` 복사 절차(현재까지는 파일 단위 수동 반영).
5. 37개월 이후 접종 5건이 기존 사용자에게 나타났을 때의 제품 판단(보여줄지 여부) — 사용자 결정 사항.
