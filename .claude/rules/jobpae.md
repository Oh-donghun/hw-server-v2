이론상 조합 = 5 × 5 × 2 × 4 × 2 × 5 × 6 × 3 = **36,000가지**

### 실제 텍스트 블록 수 (base + 꼬리 방식)
- base 본문: jobPaeKey × dayGan × strength = **50개**
- 세부십신 꼬리: 4종 × 5 = **20개**
- gender/age/job/life 꼬리: 합쳐서 약 **380개**
- **총 약 450~500개 블록**

블록 조합 → 1인당 고유한 3,000자 리포트 생성

---

## 직업패 (무료) 구조

- 1줄 한방 훅 (체질별 카피)
- 시각화 1장 (체질 뱃지 + 일간 오행 게이지)
- "직업처방에서 더 보기" CTA 버튼
- 소비 시간: 15초 이내

### 직업패 → 직업처방 전환율 목표
- 누수패 → 누수처방 전환율 벤치마크 기준
- 초기 목표: 3~5%

---

## 재물풀이와의 관계 (중요!)

### 충돌 포인트
재물풀이의 `calcChannelKey` 함수가 이미 6종 채널(official/creative/network/knowledge/finance/mixed)로 판정 중.

**같은 축인데 이름만 다름:**
| 재물풀이 channelKey | 직업체질 jobPaeKey |
|---|---|
| official (관성) | 월급 |
| creative (식상) | 장사 (일부) |
| network (비겁) | 독고다이 |
| knowledge (인성) | 전문가 |
| finance (재성) | 장사 (일부) |
| mixed | 한방 |

### 해결 방안 (사장님 선택 대기 중)
- **A안:** channelKey → jobPaeKey 통합 (최소 공수)
- **B안:** 양쪽 공존 + 재물풀이에 체질 뱃지 추가
- **C안:** 완전 분리 (위험)

**결정 후 이 섹션 업데이트 예정**

---

## 포인트 컬러

- **직업처방 전용:** 강철블루 `#5a7a8a`
- **직업패 뱃지:** 검정 배경 + 강철블루 테두리
- **시각화 톤:** 전문성·단단함 강조 (vs 재물풀이 따뜻함)

---

## scoreEngine.js 확정 함수 (2026-04-21 검증 완료)

```javascript
// 2026-04-21 시뮬레이션 검증 완료 (N=500, 편차 ±5% 이내)
function calcJobPaeKey(counts) {
  var jeongGwan = counts.jeongGwan || 0;
  var gwansung  = counts.gwansung  || 0;
  var insung    = counts.insung    || 0;
  var siksang   = counts.siksang   || 0;
  var jae       = counts.jae       || 0;
  var bigyeop   = counts.bigyeop   || 0;
  var sanggwan  = counts.sanggwan  || 0;
  var pyeonIn   = counts.pyeonIn   || 0;

  // 1. 월급 체질: 정관 2개 이상 + (관성 2+ 또는 인성 2+)
  if (jeongGwan >= 2 && (gwansung >= 2 || insung >= 2)) return 'wolgeup';

  // 2. 장사 체질: 식상 2개 이상 + 재성 2개 이상
  if (siksang >= 2 && jae >= 2) return 'jangsa';

  // 3. 전문가 체질: (상관 1+ + 인성 2+) 또는 편인 2+
  if ((sanggwan >= 1 && insung >= 2) || pyeonIn >= 2) return 'jeonmun';

  // 4. 독고다이 체질: 비겁 2+ + 관성 2 이하
  if (bigyeop >= 2 && gwansung <= 2) return 'dokgo';

  // 5. 한방 체질 (기본값)
  return 'hanbang';
}
```

**우선순위:** 월급 → 장사 → 전문가 → 독고다이 → 한방 순으로 판정.

### 시뮬레이션 검증 결과 (N=500, 2026-04-21)

| 체질 | 실제% | 목표% | 편차 | 판정 |
|---|---|---|---|---|
| 월급 (wolgeup) | 26.8% | 30% | -3.2% | ✅ |
| 장사 (jangsa) | 27.4% | 25% | +2.4% | ✅ |
| 전문가 (jeonmun) | 18.8% | 15% | +3.8% | ✅ |
| 독고다이 (dokgo) | 16.8% | 15% | +1.8% | ✅ |
| 한방 (hanbang) | 10.2% | 15% | -4.8% | ✅ |

검증 스크립트: `scripts/simulate_jobpae.js`