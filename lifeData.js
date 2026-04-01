// lifeData.js
// 가정상황 기반 팩트 데이터 - 모든 퍼널에서 공통 사용
// 결혼/자녀 상태는 가변 데이터이므로 타임스탬프와 함께 저장

module.exports = {

  // ── 가정상황 분류 (3개) ──
  types: {
    single: {
      label: '미혼',
      financialFocus: '자기 투자 + 종잣돈',
      mustSpend: ['주거(월세/전세)', '식비', '교통'],
      flexSpend: ['여가', '쇼핑', '자기계발', '저축'],
      riskTolerance: 'high',          // 가정 부담 없으므로 리스크 허용
      savingPotential: 'high',        // 저축 여력
      leakVulnerability: '자기보상형 소비, 유흥, 충동구매',
      investPriority: '공격적 자산 증식 가능',
      emergencyMonths: 3,             // 최소 비상금 개월 수
      insuranceNeed: 'low'
    },
    married_no_child: {
      label: '기혼(자녀 없음)',
      financialFocus: '내 집 마련 + 자산 기반',
      mustSpend: ['주거', '식비', '보험', '경조사'],
      flexSpend: ['여행', '외식', '취미', '저축'],
      riskTolerance: 'medium',
      savingPotential: 'high',        // 맞벌이면 저축 여력 높음
      leakVulnerability: '부부 외식, 여행, 상호 선물, 양가 경조사',
      investPriority: '내 집 마련 우선, 여유분 투자',
      emergencyMonths: 6,
      insuranceNeed: 'medium'
    },
    married_with_child: {
      label: '기혼(자녀 있음)',
      financialFocus: '교육 + 안정 + 노후',
      mustSpend: ['주거', '교육', '식비', '보험', '의료'],
      flexSpend: ['여가', '외식', '자기계발'],
      riskTolerance: 'low',
      savingPotential: 'low',         // 고정지출 많아 여력 적음
      leakVulnerability: '아이 관련 과소비, 학원비 경쟁, 엄마/아빠 모임',
      investPriority: '안전자산 중심, 교육자금 별도 확보',
      emergencyMonths: 6,
      insuranceNeed: 'high'
    }
  },

  // ── 가정상황 키 변환 함수 ──
  getLifeKey(marriage, hasChild) {
    const hasKid = hasChild && hasChild !== '없음';
    const isMarried = marriage === '기혼' || marriage === '이혼·사별';
    if (isMarried && hasKid) return 'married_with_child';
    if (isMarried && !hasKid) return 'married_no_child';
    return 'single';
  }
};