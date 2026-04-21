# V2 기존 코드 주의사항

> 호왕당 V2 서버 코드 수정 시 반드시 참조.
> 기존 작동을 깨뜨리지 않으면서 신규 기능 붙이기 위한 가이드.

---

## 핵심 원칙: V2 호환성 유지

V2는 **현재 실서비스 중**이며 **최고 매출 발생 중**.
신규 기능 추가 시 기존 흐름 절대 건드리지 말 것.

### 건드리면 안 되는 것
- ❌ **프론트 API 호출 패턴** (nusu.html, jaemul-result.html 등이 기대하는 응답 형식)
- ❌ **주문 필드명** (orderId, product, phone 등)
- ❌ **Toss 결제 콜백 URL**
- ❌ **Firestore 컬렉션 이름** (orders, results 등)
- ❌ **기존 함수의 return 형식** (다른 곳에서 쓰고 있음)

### 건드려도 되는 것
- ✅ **새 라우터 파일 추가** (`routes/jikup.js` 등)
- ✅ **새 데이터 파일 추가** (`jikupCardData.js` 등)
- ✅ **engines에 새 함수 추가** (기존 함수는 유지하고 새 함수 추가만)
- ✅ **새 Firestore 컬렉션** (`jikup-results` 등)

---

## 핵심 판정 함수 (engines/scoreEngine.js)

현재 V2에서 작동 중인 판정 함수들. **수정 금지, 추가만 가능.**

| 함수 | 판정 결과 | 용도 |
|---|---|---|
| `calcVesselKey(counts)` | 돈 그릇 12종 | 기명패, 재물풀이 Ch.2 |
| `calcWealthGrade(counts)` | S/A/B/C/D | 재물풀이 총평 |
| `calcVesselSize(counts)` | 12~95 숫자 | 재물풀이 그릇 크기 |
| `calcVesselGrade(counts)` | 6등급 (가마솥~찻잔) | 그릇 이미지 매핑 |
| `calcChannelKey(counts)` | 6종 (official/creative/network/knowledge/finance/mixed) | 재물풀이 Ch.3 |
| `calcLeakInfo(counts)` | leakKey 5종 + 레벨 5단 | 누수패, 누수처방 |
| `calcHabitKey(counts)` | 오행 excess 6종 | 재물풀이 Ch.9 |

### 신규 추가 예정
- `calcJobPaeKey(counts)` — 직업체질 5종 (직업패, 직업처방)
- 자세한 로직은 `.claude/rules/jobpae.md` 참조

---

## ⚠️ 중요 발견: 재물풀이의 "직업 챕터" 주의

재물풀이 Ch.6 (jobMatch)은 **사주로 직업체질을 판정하지 않는다.**

### 현재 로직
- 사용자가 **드롭다운에서 고른 직업** (사업/직장인/프리랜서/주부/취준생/학생) × **일간 오행** (목/화/토/금/수)
- 키 형식: `"사업_wood"`, `"직장인_fire"` 등
- 6 × 5 = 30개 텍스트 블록

### 함정
- `jobMatch` 키는 직업체질(jobPaeKey)과 **다른 축**임
- 새로 만들 직업체질 판정(jobPaeKey)과 **이름이 비슷해서 헷갈리기 쉬움**
- 코드 검색할 때 `jobMatch`와 `jobPaeKey` 구분 확실히 할 것

---

## channelKey ↔ jobPaeKey 충돌 주의

재물풀이의 `calcChannelKey`가 이미 6종 판정 중:
- official (관성) ≈ 월급 체질
- creative (식상) ≈ 장사 체질 일부
- network (비겁) ≈ 독고다이 체질
- knowledge (인성) ≈ 전문가 체질
- finance (재성) ≈ 장사 체질 일부
- mixed ≈ 한방 체질

### 해결 방안 (사장님 선택 대기 중)
- **A안:** channelKey를 jobPaeKey로 통합 → 최소 공수
- **B안:** 양쪽 공존 + 재물풀이에 체질 뱃지만 추가
- **C안:** 완전 분리 (위험, 비추천)

**결정 전까지는 이 두 판정을 동시에 건드리지 말 것.**

---

## 파일 구조 및 용도

### engines/ (핵심 엔진)
- `sajuEngine.js` — 사주 API 호출, 생년월일 → 십신 카운트
- `scoreEngine.js` — 판정 함수들 (위 표 참조)
- `textEngine.js` — 텍스트 블록 조합 (base + 꼬리)

### routes/ (라우터)
- `gimyeong.js` — 기명패(무료 돈 그릇 카드)
- `jaemul.js` — 재물풀이 (10챕터)
- **신규 예정:** `jikup.js` — 직업패/직업처방

### 데이터 파일 (서버 루트)
- `nusuData.js` — 누수처방 7챕터 텍스트
- `jaemulData.js` — 재물풀이 10챕터 텍스트 (매우 큼)
- `chogyeonData.js` — 초견(구버전) 텍스트
- `howangpaeData.js` — 호왕패 텍스트
- `jobData.js` — 직업별 텍스트 (재물풀이 Ch.6용)
- `ageData.js` — 나이별 꼬리 텍스트
- `investProfileData.js` — 투자 성향 텍스트
- **신규 예정:** `jikupCardData.js`, `jikupTreatData.js`

### 루트 파일
- `index.js` — **1,200줄 짜리 거대 메인 파일, 건드리지 말 것**
- `package.json` — 의존성
- `Dockerfile` — Cloud Run 배포용
- `.env` — 환경변수 (API 키 등, 절대 커밋 금지)

---

## 쓰레기 파일 정리 (나중에)

현재 서버에 백업/임시 파일이 많음. **당장 건드릴 필요는 없지만** 정리 필요.

### 백업 파일 (.bak)
- `index.js.bak_20260401_104922`
- `index.js.bak_20260401_113522`
- `index.js.bak_20260401_122514`
- `index.js.bak_20260401_152004`
- `index.js.bak_20260402_130232`
- `ageData.js.bak_20260401_141321`
- `ageData.js.bak_20260401_141447`
- `jaemulData.js.bak_20260401_145144`
- `jaemulData.js.bak_20260401_145424`
- `index.js.backup`

### 임시 수정 파일
- `fix.js`, `fix2.js`, `fix3.js`
- `fix_env.js`
- `find.js`

### 테스트 파일
- `createTestOrder.js`
- `createTestOrders.js`
- `debug_result.json`

### 정리 계획 (나중)
1. Git 히스토리로 버전 관리하므로 로컬 .bak 파일은 불필요
2. 한 번에 정리 → 커밋 메시지 `refactor: 백업/임시 파일 정리`
3. 정리 전 사장님 확인 필수

---

## hw-server-v3 폴더 존재

서버 루트 안에 **`hw-server-v3/`** 라는 폴더가 있음.

### 추정 정체
- V3 초기 설계 작업 중단된 흔적
- 현재 실서비스와 무관
- **당장 건드릴 필요 없음**

### 처리 방향
- V3 전면 전환보다 **V2 위에 점진적으로 V3 구조 얹는** 방향이 사장님 결정
- 이 폴더는 추후 참고용으로만 사용 (참조 코드 있으면 활용)
- 언젠가 정리하거나 통합 필요

---

## 외부 API 의존성

호왕당 V2는 외부 API에 의존. **이것들 없으면 서비스 전체 중단.**

### 1. 사주 API
- URL: `https://naread-saju-1075269376260.asia-northeast3.run.app/saju`
- 용도: 생년월일시 → 십신 카운트, 오행 등 반환
- **별도 프로젝트** (naread-saju 레포)
- 변경 시 호왕당 서버도 영향 받음

### 2. Toss Payments
- Client Key: `live_ck_yL0qZ4G1VOjWoLAzw5LY3oWb2MQY`
- 결제 콜백 URL: 호왕당 서버의 `/payment/callback`
- 카카오 초기화 키: `e10b076b8b32f081e2563cc1b3f6c815`

### 3. Solapi (알림톡)
- 결제 완료 후 알림톡 발송
- `solapi.js`에 설정

### 4. Firebase (Firestore)
- `firebase.js`로 초기화
- 컬렉션: `orders`, `results` 등

---

## 환경변수 (.env)

루트의 `.env` 파일에 민감정보 저장. **절대 커밋 금지.**

```
TOSS_SECRET_KEY=...
SOLAPI_API_KEY=...
SOLAPI_API_SECRET=...
CLAUDE_API_KEY=...
FIREBASE_PROJECT_ID=...
```

### 관리자 비밀번호
- 관리자 페이지 접근 PW: **2991**
- 이건 CLAUDE.md에 적어두고 필요시 참조

---

## 흔한 실수 방지 체크리스트

새 기능 추가할 때 확인:

- [ ] `index.js` 건드리지 않았는가? (새 파일로 분리했는가)
- [ ] 기존 `scoreEngine.js` 함수를 수정하지 않고 **추가만** 했는가?
- [ ] 프론트가 기대하는 API 응답 형식을 유지했는가?
- [ ] 새 Firestore 컬렉션 이름이 기존과 충돌하지 않는가?
- [ ] `.env`를 커밋하지 않았는가?
- [ ] 한국어 주석을 충분히 달았는가?
- [ ] 사장님에게 변경사항을 설명했는가?

---

## 긴급 상황 대응

### 실서버 장애 발생 시
1. Cloud Run 로그 확인: `gcloud run services logs read hw-server-v2`
2. 최근 커밋 확인: `git log -5`
3. 필요시 이전 커밋으로 롤백: `git revert [커밋ID]`
4. 재배포: `gcloud run deploy ...`

### 결제 관련 문제
- Toss 대시보드 확인: https://developers.tosspayments.com
- Firestore `orders` 컬렉션 직접 확인
- 관리자 페이지 `/admin` (PW: 2991)

### 알림톡 미발송
- Solapi 대시보드에서 로그 확인
- 잔액 부족 가능성 체크