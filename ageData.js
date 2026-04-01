// ageData.js
// 나이 기반 팩트 데이터 - 모든 퍼널에서 공통 사용
// 나이는 저장하지 않고, 생년월일 기준으로 조회 시점에 실시간 계산

module.exports = {

  // ── 나이 계산 함수 ──
  // 생년월일(YYYY-MM-DD)을 받아서 현재 시점의 만 나이를 반환
  calcAge(birthDate) {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  },

  // ── 나이대 구간 판별 함수 ──
  // 만 나이를 받아서 구간 키를 반환
  getAgeGroup(age) {
    if (age <= 24) return 'age_20_24';
    if (age <= 29) return 'age_25_29';
    if (age <= 34) return 'age_30_34';
    if (age <= 39) return 'age_35_39';
    if (age <= 49) return 'age_40_49';
    
    if (age <= 54) return 'age_50_54';
    return 'age_55_plus';
  },

  // ── 나이대별 팩트 데이터 ──
  groups: {
    age_20_24: {
      label: '19~24세',
      lifeStage: '시작',
      monthlySpend: 1200000,        // 월 평균 지출 (원)
      monthlyIncome: 1500000,       // 월 평균 소득 추정 (원)
      assetStage: '종잣돈 형성기',
      spendCategories: ['식비', '교통', '구독서비스', '외모/패션'],
      financialGoal: '첫 500만 원 모으기',
      investCapacity: 'minimal',     // 투자 여력: minimal / low / medium / high
      riskContext: '소득 불안정, 경험 부족'
    },
    age_25_29: {
      label: '25~29세',
      lifeStage: '정착 준비',
      monthlySpend: 1800000,
      monthlyIncome: 2500000,
      assetStage: '종잣돈 확보기',
      spendCategories: ['주거', '식비', '경조사', '자기계발'],
      financialGoal: '전세자금 / 1,000만 원 돌파',
      investCapacity: 'low',
      riskContext: '첫 목돈, 결혼 준비 가능성'
    },
    age_30_34: {
      label: '30~34세',
      lifeStage: '확장',
      monthlySpend: 2300000,
      monthlyIncome: 3200000,
      assetStage: '자산 형성 초기',
      spendCategories: ['주거', '육아', '보험', '차량'],
      financialGoal: '내 집 마련 / 3,000만 원 자산',
      investCapacity: 'medium',
      riskContext: '가정 형성기, 고정지출 급증'
    },
    age_35_39: {
      label: '35~39세',
      lifeStage: '확장 정점',
      monthlySpend: 2800000,
      monthlyIncome: 3800000,
      assetStage: '자산 형성 가속기',
      spendCategories: ['교육', '주거', '보험', '여가'],
      financialGoal: '순자산 1억 돌파',
      investCapacity: 'medium',
      riskContext: '교육비 증가, 커리어 피크'
    },
    age_40_49: {
      label: '40~44세',
      lifeStage: '안정',
      monthlySpend: 3200000,
      monthlyIncome: 4200000,
      assetStage: '자산 관리기',
      spendCategories: ['교육', '건강', '경조사', '노후준비'],
      financialGoal: '교육비 통제 + 노후자금 시작',
      investCapacity: 'high',
      riskContext: '소득 정점이지만 지출도 정점'
    },
    age_50_54: {
      label: '50~54세',
      lifeStage: '정리',
      monthlySpend: 3000000,
      monthlyIncome: 3500000,
      assetStage: '은퇴 준비 본격기',
      spendCategories: ['건강', '가족지원', '생활비', '경조사'],
      financialGoal: '은퇴 후 월 생활비 확보',
      investCapacity: 'medium',
      riskContext: '은퇴 10년 이내, 안전자산 비중 확대'
    },
    age_55_plus: {
      label: '55세 이상',
      lifeStage: '마무리',
      monthlySpend: 2500000,
      monthlyIncome: 2800000,
      assetStage: '자산 보전기',
      spendCategories: ['건강', '생활비', '손주', '여가'],
      financialGoal: '자산 보전 + 월 현금흐름 유지',
      investCapacity: 'low',
      riskContext: '원금 보전 최우선, 유동성 확보'
    }
  },

  // ── 누수 금액 계산 함수 ──
  // 나이대 월 지출 × 누수 비율 × 기간
  calcLeakAmount(age, leakLevel) {
    const group = this.groups[this.getAgeGroup(age)];
    const leakRate = { 1: 0.05, 2: 0.08, 3: 0.12, 4: 0.18, 5: 0.25 };
    const monthlyLeak = Math.round(group.monthlySpend * (leakRate[leakLevel] || 0.12));
    return {
      monthly: monthlyLeak,
      year1: monthlyLeak * 12,
      year3: monthlyLeak * 36,
      year5: monthlyLeak * 60,
      year10: monthlyLeak * 120
    };
  }
};
