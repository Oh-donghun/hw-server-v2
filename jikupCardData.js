// ═══════════════════════════════════════════════════════
// jikupCardData.js — 직업패(무료) 데이터
// 5직업군 × 9현재직업 × 3라벨 (천직/동행/잠재)
// ═══════════════════════════════════════════════════════

const JIKUP_IMG_BASE = 'https://audio.readmelab.co.kr/howang/jikup/';

// ───────────────────────────────────────
// 1. 5직업군 정체 (메인 + 부제 + 이미지)
// ───────────────────────────────────────
const JIKUP_TYPES = {
  geosang: {
    main: '사업가',
    sub: '거상의 운명',
    sipseong: '재성',
    img: JIKUP_IMG_BASE + 'geosang.png',
    essence: '거래·인맥·시스템으로 부를 쌓는 사람',
    destiny: '하나의 가게를 다점포로, 후대에 남길 사업체로'
  },
  gwannok: {
    main: '임원·리더',
    sub: '관록의 운명',
    sipseong: '관성',
    img: JIKUP_IMG_BASE + 'gwannok.png',
    essence: '조직의 정점에서 사람을 움직이는 사람',
    destiny: '연차로 권위가 쌓이고, 정년 후 멘토·자문으로 빛나는 자리'
  },
  hakja: {
    main: '전문가',
    sub: '학자의 운명',
    sipseong: '인성',
    img: JIKUP_IMG_BASE + 'hakja.png',
    essence: '지식·자격·전문성으로 이름값을 쌓는 사람',
    destiny: '연차가 곧 단가가 되는 자리, 평생 갈 전문직'
  },
  yein: {
    main: '크리에이터',
    sub: '예인의 운명',
    sipseong: '식상',
    img: JIKUP_IMG_BASE + 'yein.png',
    essence: '이름과 작품으로 사람을 움직이는 사람',
    destiny: '이름값이 곧 자산이 되는 자리, 폭발의 시기가 정해진 운'
  },
  dokrip: {
    main: '1인 장인',
    sub: '독립의 운명',
    sipseong: '비겁',
    img: JIKUP_IMG_BASE + 'dokrip.png',
    essence: '혼자의 힘과 기술로 길을 만드는 사람',
    destiny: '단판 승부로 값이 매겨지는 자리, 연차가 무기가 되는 운'
  }
};

// ───────────────────────────────────────
// 2. 십성 → 직업군 매핑
// ───────────────────────────────────────
const SIPSEONG_TO_JIKUP = {
  '관성': 'gwannok',
  '재성': 'geosang',
  '식상': 'yein',
  '인성': 'hakja',
  '비겁': 'dokrip'
};

// ───────────────────────────────────────
// 3. 9직종 × 5직업군 = 45 매트릭스 (양극화)
// 95(천직) / 75(동행) / 35(잠재)
// ───────────────────────────────────────
const GUNGHAP_MATRIX = {
  '직장인':   { gwannok: 95, geosang: 35, hakja: 75, yein: 35, dokrip: 35 },
  '기술직':   { gwannok: 75, geosang: 75, hakja: 95, yein: 35, dokrip: 95 },
  '자영업':   { gwannok: 35, geosang: 95, hakja: 75, yein: 75, dokrip: 75 },
  '프리랜서': { gwannok: 35, geosang: 75, hakja: 75, yein: 95, dokrip: 95 },
  '공무원':   { gwannok: 95, geosang: 35, hakja: 75, yein: 35, dokrip: 35 },
  '주부':     { gwannok: 35, geosang: 75, hakja: 75, yein: 95, dokrip: 75 },
  '구직중':   { gwannok: 75, geosang: 75, hakja: 75, yein: 75, dokrip: 75 },
  '학생':     { gwannok: 75, geosang: 75, hakja: 95, yein: 95, dokrip: 75 },
  '은퇴':     { gwannok: 75, geosang: 75, hakja: 95, yein: 75, dokrip: 75 }
};

// ───────────────────────────────────────
// 4. 라벨 (3등급)
// ───────────────────────────────────────
const LABELS = {
  cheonjik:   { code: 'cheonjik',   main: '천직', sub: '타고난 자리',     emoji: '🟢', color: '#1A4A3A', accent: '#C8A96E' },
  donghaeng:  { code: 'donghaeng',  main: '동행', sub: '어울리는 자리',   emoji: '🟡', color: '#C8A96E', accent: '#F0E5D0' },
  jamjae:     { code: 'jamjae',     main: '잠재', sub: '아직 못 쓴 자리', emoji: '🔴', color: '#8B1A1A', accent: '#C8A96E' }
};

function getLabelByScore(score) {
  if (score >= 90) return LABELS.cheonjik;
  if (score >= 60) return LABELS.donghaeng;
  return LABELS.jamjae;
}

// ───────────────────────────────────────
// 5. 직종 평균 연봉 (통계청 KEIS 기준 단위:만원)
// ───────────────────────────────────────
const JOB_AVG_INCOME = {
  '직장인':   5200,
  '기술직':   6400,
  '자영업':   8400,
  '프리랜서': 6200,
  '공무원':   5800,
  '주부':     0,
  '구직중':   0,
  '학생':     0,
  '은퇴':     3600
};

// 직종 상위 10%
const JOB_TOP10_INCOME = {
  '직장인':   9800,
  '기술직':  11200,
  '자영업':  16800,
  '프리랜서': 12400,
  '공무원':  10600,
  '주부':     0,
  '구직중':   0,
  '학생':     0,
  '은퇴':     7200
};

// ───────────────────────────────────────
// 6. 5직업군 평균/상위10% (운이 열렸을 때)
// ───────────────────────────────────────
const JIKUP_AVG_INCOME = {
  geosang:  8400,
  gwannok:  7400,
  hakja:    6300,
  yein:     5000,
  dokrip:   5600
};

const JIKUP_TOP10_INCOME = {
  geosang: 18400,
  gwannok: 14800,
  hakja:   12600,
  yein:    15000,
  dokrip:  11200
};

// ───────────────────────────────────────
// 7. 라벨별 메인 카피 (3종)
// ───────────────────────────────────────
const LABEL_COPY = {
  cheonjik: {
    title: '타고난 자리에 있다',
    body: '당신의 사주는 {jikupSub}이고, 지금 자리는 {jikupMain}에 가장 부합한다. 5천 명 중 1명 나오는 매칭이다. 같은 길도 어디까지 갈지는 운에 달렸다.',
    cta: '{jikupMain}의 운이 폭발하는 시기, 그 길의 끝까지 가는 법'
  },
  donghaeng: {
    title: '어울리는 자리에 있다',
    body: '당신의 사주는 {jikupSub}이고, 지금 자리는 {jikupMain}의 결을 따른다. 같은 결, 다른 길이다.',
    cta: '이 결을 어디까지 키울 수 있는지, {jikupMain}의 운이 풀리는 시기'
  },
  jamjae: {
    title: '아직 못 쓴 자리가 있다',
    body: '당신의 사주는 {jikupSub}이지만, 지금 자리는 {jikupMain}의 결과 다르다. 지금 자리는 헛되지 않다. 여기서 쌓은 것이 {jikupMain}의 운이 열릴 때 자산이다.',
    cta: '지금 자리에서 {jikupMain}의 운을 살리는 법, 그 운이 언제 열리는지'
  }
};

// ───────────────────────────────────────
// 8. 직업처방 업셀 카피 (공통)
// ───────────────────────────────────────
const UPSELL_COPY = {
  title: '{jikupMain} 운명에 대해 직업처방이 답하는 4가지',
  items: [
    '{jikupMain} 운이 열리는 시기 (커리어 타이밍)',
    '지금 자리에서 {jikupMain} 운을 살리는 5가지 행동',
    '{jikupMain} 운이 막힐 때 풀어내는 법',
    '{jikupMain} 운이 폭발하는 10년 로드맵'
  ],
  closer: '운을 모르고 가면 그 자리에서만 머문다.',
  price: '직업처방 9,900원',
  disclaimer: '본 결과는 사주 기반 참고 자료이며, 이직·창업을 권유하지 않습니다.'
};

// ───────────────────────────────────────
// EXPORT
// ───────────────────────────────────────
module.exports = {
  JIKUP_TYPES,
  SIPSEONG_TO_JIKUP,
  GUNGHAP_MATRIX,
  LABELS,
  getLabelByScore,
  JOB_AVG_INCOME,
  JOB_TOP10_INCOME,
  JIKUP_AVG_INCOME,
  JIKUP_TOP10_INCOME,
  LABEL_COPY,
  UPSELL_COPY
};
