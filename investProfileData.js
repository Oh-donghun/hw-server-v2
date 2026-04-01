// investProfileData.js
// 투자 프로필 기반 팩트 데이터 - 심화 투자 풀이용
// 현재는 뼈대만 잡아놓고, 심화 상품 개발 시 채워넣음

module.exports = {

  // ── 월 투자 가능 금액 구간 ──
  investBudget: {
    under_30: { label: '30만 원 미만', strategy: 'micro' },
    under_100: { label: '30~100만 원', strategy: 'basic' },
    under_300: { label: '100~300만 원', strategy: 'standard' },
    under_500: { label: '300~500만 원', strategy: 'active' },
    over_500: { label: '500만 원 이상', strategy: 'aggressive' }
  },

  // ── 투자 성향 분류 ──
  investStyle: {
    conservative: { label: '안정형', riskLevel: 1 },
    balanced: { label: '균형형', riskLevel: 2 },
    growth: { label: '성장형', riskLevel: 3 },
    aggressive: { label: '공격형', riskLevel: 4 }
  },

  // ── 투자 분야 ──
  investField: {
    stock: { label: '주식' },
    realEstate: { label: '부동산' },
    crypto: { label: '코인/가상자산' },
    fund: { label: '펀드/ETF' },
    savings: { label: '예적금/채권' }
  }

  // TODO: 심화 투자 풀이 개발 시 아래 추가 예정
  // - 투자 성향 × 사주 오행 매칭 로직
  // - 월 금액 × 나이대 × 가정상황별 포트폴리오 기준
  // - 투자 분야별 사주 궁합도
  // - 시기별 투자 강도 조절 기준
};