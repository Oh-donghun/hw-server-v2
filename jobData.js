// jobData.js
// 직업 기반 팩트 데이터 - 모든 퍼널에서 공통 사용
// 직업은 가변 데이터이므로 고객 프로필에 타임스탬프와 함께 저장

module.exports = {

  // ── 직업 분류 (8개) ──
  types: {
    office: {
      label: '직장인(사무직)',
      incomeType: 'fixed',           // fixed: 고정급 / variable: 변동 / mixed: 혼합
      incomeStability: 'high',       // high / medium / low
      spendPattern: ['점심', '회식', '출퇴근교통', '경조사', '커피'],
      peakSpendTrigger: '회식·야근·연말',
      investWindow: '월급일 직후',    // 투자 가능 타이밍
      riskTolerance: 'medium',       // 직업 특성상 감당 가능한 리스크 수준
      sideIncomeChance: 'low',       // 부수입 가능성
      careerRisk: '구조조정·이직 리스크'
    },
    technical: {
      label: '직장인(현장/기술직)',
      incomeType: 'fixed',
      incomeStability: 'high',
      spendPattern: ['장비', '작업복', '회식', '담배·간식', '교통'],
      peakSpendTrigger: '장비 교체·회식',
      investWindow: '월급일 직후',
      riskTolerance: 'medium',
      sideIncomeChance: 'medium',
      careerRisk: '산재·체력 저하 리스크'
    },
    business: {
      label: '자영업자',
      incomeType: 'variable',
      incomeStability: 'low',
      spendPattern: ['재투자', '접대비', '임대료', '인건비', '세금'],
      peakSpendTrigger: '비수기·세금 시즌',
      investWindow: '매출 성수기 직후',
      riskTolerance: 'high',
      sideIncomeChance: 'high',
      careerRisk: '폐업·매출 하락 리스크'
    },
    freelance: {
      label: '프리랜서/크리에이터',
      incomeType: 'variable',
      incomeStability: 'low',
      spendPattern: ['장비', '자기브랜딩', '외주비', '작업공간', '네트워킹'],
      peakSpendTrigger: '프로젝트 공백기·장비 업그레이드',
      investWindow: '프로젝트 정산 직후',
      riskTolerance: 'medium',
      sideIncomeChance: 'high',
      careerRisk: '수입 공백·건강 리스크'
    },
    student: {
      label: '학생/취준생',
      incomeType: 'variable',
      incomeStability: 'low',
      spendPattern: ['학비', '교재', '식비', '친구모임', '교통'],
      peakSpendTrigger: '개강·시험기간·방학',
      investWindow: '알바비 수령 직후',
      riskTolerance: 'low',
      sideIncomeChance: 'low',
      careerRisk: '취업 불확실성'
    },
    homemaker: {
      label: '주부/육아',
      incomeType: 'none',
      incomeStability: 'none',
      spendPattern: ['육아용품', '식료품', '아이교육', '경조사', '생활용품'],
      peakSpendTrigger: '아이 입학·명절·환절기',
      investWindow: '가정 여유자금 발생 시',
      riskTolerance: 'low',
      sideIncomeChance: 'medium',
      careerRisk: '경력 단절·재취업 리스크'
    },
    public: {
      label: '공무원/공기업',
      incomeType: 'fixed',
      incomeStability: 'very_high',
      spendPattern: ['동기모임', '자기계발', '재테크', '경조사', '여가'],
      peakSpendTrigger: '승진 시즌·동기 모임',
      investWindow: '월급일 직후 (안정적 자동이체)',
      riskTolerance: 'medium',
      sideIncomeChance: 'low',
      careerRisk: '낮음 (정년 보장)'
    },
    retired: {
      label: '은퇴/무직',
      incomeType: 'none',
      incomeStability: 'none',
      spendPattern: ['건강', '생활비', '자녀지원', '경조사', '여가'],
      peakSpendTrigger: '자녀 결혼·건강 이슈',
      investWindow: '연금 수령 직후',
      riskTolerance: 'very_low',
      sideIncomeChance: 'low',
      careerRisk: '재취업 어려움'
    }
  },

  // 프론트에서 받은 한글 직업명을 표준 9개 한글 키로 정규화
  // 표준 9키: 직장인 · 기술직 · 자영업 · 프리랜서 · 공무원 · 주부 · 구직중 · 학생 · 은퇴
  getJobKey(jobLabel) {
    const map = {
      '직장인(사무직)': '직장인',
      '사무직': '직장인',
      '직장인': '직장인',
      '직장인(현장직)': '기술직',
      '현장직': '기술직',
      '기술직': '기술직',
      '자영업자': '자영업',
      '자영업': '자영업',
      '사업': '자영업',
      '프리랜서': '프리랜서',
      '크리에이터': '프리랜서',
      '전문직': '프리랜서',
      '학생': '학생',
      '취준생': '구직중',
      '구직중': '구직중',
      '주부': '주부',
      '육아': '주부',
      '공무원': '공무원',
      '공기업': '공무원',
      '은퇴': '은퇴',
      '무직': '은퇴'
    };
    return map[jobLabel] || '직장인';
  },
  // 누수처방 호환용 — 한글 직업명을 영문 키로 변환 (legacy)
  // Phase 3에서 nusuData 한글화 후 제거 예정
  getJobKeyEn(jobLabel) {
    const map = {
      '직장인(사무직)': 'office',
      '사무직': 'office',
      '직장인': 'office',
      '직장인(현장직)': 'technical',
      '현장직': 'technical',
      '기술직': 'technical',
      '자영업자': 'business',
      '자영업': 'business',
      '사업': 'business',
      '프리랜서': 'freelance',
      '크리에이터': 'freelance',
      '전문직': 'freelance',
      '학생': 'student',
      '취준생': 'jobseeker',
      '구직중': 'jobseeker',
      '주부': 'homemaker',
      '육아': 'homemaker',
      '공무원': 'public',
      '공기업': 'public',
      '은퇴': 'retired',
      '무직': 'retired'
    };
    return map[jobLabel] || 'office';
  }
};