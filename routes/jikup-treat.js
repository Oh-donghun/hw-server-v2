// ═══════════════════════════════════════════════════════
// routes/jikup-treat.js — 직업처방 (₩9,900)
// 누수처방 패턴: 무료 카드에서 저장한 jikupCard 재활용
// 사주 API 재호출 없음, 7챕터 텍스트 블록 조립만
// ═══════════════════════════════════════════════════════

const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const router = express.Router();

const D = require('../jikupCardData');
const T = require('../jikupTreatData');

function getDb() { return admin.firestore(); }

// 인생 단계 판정
function getLifeStage(age) {
  if (age < 30) return 'young';
  if (age < 45) return 'middle';
  if (age < 60) return 'jang';
  return 'late';
}

// birthDate 문자열에서 연도만 추출 (나이 계산용)
function extractBirthYear(birthStr) {
  const m = String(birthStr || '').match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

// ───────────────────────────────────────
// 생애 직업운 그래프 계산 (1살~80세)
// ───────────────────────────────────────

// 천간 → 오행
const GAN_TO_OHENG = {
  '甲':'wood','乙':'wood','丙':'fire','丁':'fire','戊':'earth',
  '己':'earth','庚':'metal','辛':'metal','壬':'water','癸':'water'
};
// 천간 → 음양
const GAN_TO_YINYANG = {
  '甲':'yang','丙':'yang','戊':'yang','庚':'yang','壬':'yang',
  '乙':'yin','丁':'yin','己':'yin','辛':'yin','癸':'yin'
};

// 일간(dayGan) 기준 상대 천간의 십성 판정
function getSipseongFromGan(dayGan, targetGan) {
  const dayOheng = GAN_TO_OHENG[dayGan];
  const dayYinyang = GAN_TO_YINYANG[dayGan];
  const tOheng = GAN_TO_OHENG[targetGan];
  const tYinyang = GAN_TO_YINYANG[targetGan];
  if (!dayOheng || !tOheng) return null;

  const samePol = (dayYinyang === tYinyang);

  // 오행 관계
  const relation = {
    wood:  { wood: 'self',   fire: 'output', earth: 'control', metal: 'restrict', water: 'source' },
    fire:  { fire: 'self',   earth:'output', metal: 'control', water: 'restrict', wood:  'source' },
    earth: { earth:'self',   metal:'output', water: 'control', wood:  'restrict', fire:  'source' },
    metal: { metal:'self',   water:'output', wood:  'control', fire:  'restrict', earth: 'source' },
    water: { water:'self',   wood: 'output', fire:  'control', earth: 'restrict', metal: 'source' }
  };
  const rel = relation[dayOheng][tOheng];

  if (rel === 'self')     return samePol ? '비견' : '겁재';
  if (rel === 'output')   return samePol ? '식신' : '상관';
  if (rel === 'control')  return samePol ? '편재' : '정재';
  if (rel === 'restrict') return samePol ? '편관' : '정관';
  if (rel === 'source')   return samePol ? '편인' : '정인';
  return null;
}

// 십성 → 직업운 점수
const SIPSEONG_CAREER_SCORE = {
  '정관': 88, '편관': 85,   // 관성 = 피크
  '정재': 78, '편재': 75,   // 재성
  '정인': 72, '편인': 68,   // 인성
  '식신': 65, '상관': 62,   // 식상
  '비견': 55, '겁재': 50    // 비겁
};

// Catmull-Rom 기반 부드러운 보간
function smoothInterpolate(before, after, age) {
  if (before.age === after.age) return before.score;
  const t = (age - before.age) / (after.age - before.age);
  // smoothstep: t가 경계에서 부드럽게
  const smoothT = t * t * (3 - 2 * t);
  return before.score + (after.score - before.score) * smoothT;
}

// 생애 직업운 계산 (1~90세)
function calcLifetimeCareer(dayGan, daeunData, currentAge) {
  if (!daeunData || !daeunData.daeuns || daeunData.daeuns.length === 0) return null;

  const daeuns = daeunData.daeuns;
  const startAge = daeunData.startAge || daeuns[0].age || 8;

  // 1) 각 대운의 원점수
  const daeunScores = daeuns.map(d => {
    const sipseong = getSipseongFromGan(dayGan, d.gan);
    const score = SIPSEONG_CAREER_SCORE[sipseong] || 60;
    return { age: d.age, score, sipseong, pillar: d.pillar };
  });

  // 2) 사주 기반 피크 배치 (40~55세 황금기 원칙)
  // 원칙: 과거는 원점수 그대로. 현재 이후는 "피크를 향해 오르고, 피크 후 완만한 고원"
  const currentDaeunIdx = daeunScores.findIndex(
    (d, i) => d.age <= currentAge && (i === daeunScores.length - 1 || daeunScores[i+1].age > currentAge)
  );

  // 피크 목표 연령 구간 결정 (현재 나이별 분기)
  let peakMinAge, peakMaxAge;
  if (currentAge < 35)        { peakMinAge = 40; peakMaxAge = 55; }
  else if (currentAge < 45)   { peakMinAge = currentAge + 5; peakMaxAge = Math.max(60, currentAge + 15); }
  else if (currentAge < 55)   { peakMinAge = currentAge + 5; peakMaxAge = currentAge + 15; }
  else                        { peakMinAge = currentAge + 3; peakMaxAge = currentAge + 12; }

  // 십성별 피크 점수 (우선순위)
  const SIPSEONG_PEAK_SCORE = {
    '정관': 93, '편관': 92, '정재': 91, '편재': 90,
    '정인': 89, '편인': 88, '식신': 87, '상관': 86,
    '비견': 85, '겁재': 84
  };
  const SIPSEONG_RANK = {
    '정관': 1, '편관': 2, '정재': 3, '편재': 4,
    '정인': 5, '편인': 6, '식신': 7, '상관': 8,
    '비견': 9, '겁재': 10
  };

  // 피크 구간 안의 대운 중 가장 좋은 십성을 가진 대운을 선택
  const peakCandidates = daeunScores
    .map((d, i) => ({ ...d, idx: i }))
    .filter(d => d.age >= peakMinAge && d.age <= peakMaxAge);

  let peakIdx = -1;
  let peakScoreTarget = 87; // fallback
  if (peakCandidates.length > 0) {
    // 십성 순위가 가장 좋은(숫자가 작은) 대운 선택, 동률이면 가까운 쪽
    peakCandidates.sort((a, b) => {
      const rankA = SIPSEONG_RANK[a.sipseong] || 99;
      const rankB = SIPSEONG_RANK[b.sipseong] || 99;
      if (rankA !== rankB) return rankA - rankB;
      return a.age - b.age;
    });
    const picked = peakCandidates[0];
    peakIdx = picked.idx;
    peakScoreTarget = SIPSEONG_PEAK_SCORE[picked.sipseong] || 87;
  } else {
    // 피크 구간에 대운이 없으면 현재 이후 첫 대운을 피크로
    const firstFuture = daeunScores.findIndex(d => d.age > currentAge);
    if (firstFuture >= 0) {
      peakIdx = firstFuture;
      peakScoreTarget = SIPSEONG_PEAK_SCORE[daeunScores[firstFuture].sipseong] || 87;
    }
  }

  // 미래 대운 점수 재배치
  if (peakIdx >= 0) {
    const peakAgeTarget = daeunScores[peakIdx].age;

    // 현재가 속한 대운 점수 (기준점)
    const baseScore = currentDaeunIdx >= 0 ? Math.min(daeunScores[currentDaeunIdx].score, 76) : 70;
    if (currentDaeunIdx >= 0) daeunScores[currentDaeunIdx].score = baseScore;

    daeunScores.forEach((d, i) => {
      if (d.age <= currentAge) return; // 과거는 건드리지 않음
      if (d.age > 90) return;

      if (i < peakIdx) {
        // 현재 ~ 피크: 등차로 가파르게 상승
        const stepsTotal = peakIdx - currentDaeunIdx;
        const stepPos = i - currentDaeunIdx;
        const ratio = stepPos / stepsTotal;
        d.score = Math.round(baseScore + (peakScoreTarget - baseScore) * ratio);
      } else if (i === peakIdx) {
        // 피크
        d.score = peakScoreTarget;
      } else {
        // 피크 이후: 매우 완만한 하강 (대운마다 -1~-2)
        const declineSteps = i - peakIdx;
        d.score = Math.max(peakScoreTarget - 10, peakScoreTarget - declineSteps * 2);
      }
    });

    // 플로어: 미래 구간 최저 80점 (피크 후에도 너무 안 떨어지게)
    daeunScores.forEach(d => {
      if (d.age > currentAge && d.age <= 90) {
        d.score = Math.max(d.score, Math.min(80, peakScoreTarget - 10));
      }
    });
  }

  // 4) 1살 단위 부드러운 보간 (1~90세)
  const lifetime = [];
  for (let age = 1; age <= 90; age++) {
    let score;
    if (age < startAge) {
      const first = daeunScores[0].score;
      score = first * (0.65 + 0.35 * (age / startAge));
    } else {
      let before = daeunScores[0];
      let after = daeunScores[daeunScores.length - 1];
      for (let i = 0; i < daeunScores.length; i++) {
        if (daeunScores[i].age <= age) before = daeunScores[i];
        if (daeunScores[i].age > age) { after = daeunScores[i]; break; }
      }
      score = smoothInterpolate(before, after, age);
    }
    lifetime.push({ age, score: Math.round(score * 10) / 10 });
  }

  // 5) 피크/저점 찾기 (1~90세 범위)
  const peakPoint = lifetime.reduce((a, b) => b.score > a.score ? b : a, lifetime[0]);
  const troughPoint = lifetime.reduce((a, b) => b.score < a.score ? b : a, lifetime[0]);

  // 6) 대운별 십성 라벨 (UI용)
  const daeunLabels = daeunScores.map(d => ({
    age: d.age,
    pillar: d.pillar,
    sipseong: d.sipseong,
    score: Math.round(d.score)
  }));

  return {
    points: lifetime,
    peakAge: peakPoint.age,
    peakScore: peakPoint.score,
    troughAge: troughPoint.age,
    troughScore: troughPoint.score,
    currentAge,
    daeunLabels
  };
}

// ───────────────────────────────────────
// 7챕터 조립
// ───────────────────────────────────────
function buildTreatChapters(jikupKey, labelCode, currentJob, gender, age, sajuMeta) {
  const jikupInfo = D.JIKUP_TYPES[jikupKey];
  const strengthType = sajuMeta.strength || 'balanced';
  const dayElement = sajuMeta.dayElement || 'wood';
  const dayElementKey = { '목':'wood','화':'fire','토':'earth','금':'metal','수':'water' }[dayElement] || dayElement;
  const lifeStage = getLifeStage(age);

  const ch1 = {
    title: `Ch1. ${jikupInfo.main}의 정체성`,
    body: T.ch1_base[jikupKey] + '\n\n' + T.ch1_match_tail[labelCode]
  };

  const ch2 = {
    title: 'Ch2. 사주가 너를 이렇게 본다',
    body: T.ch2_sipseong[jikupKey] + '\n\n' + T.ch2_dayElement[dayElementKey] + '\n\n' + T.ch2_strength[strengthType]
  };

  const ch3Key = `${currentJob}_${gender}`;
  const ch3 = {
    title: 'Ch3. 너의 현실',
    body: T.ch3_reality[ch3Key] || T.ch3_reality[`${currentJob}_male`] || '지금의 자리에서 너의 사주가 작동하고 있다.'
  };

  const ch4Key = `${labelCode}_${jikupKey}`;
  const ch4 = {
    title: 'Ch4. 막힘의 이유',
    body: T.ch4_block[ch4Key] || ''
  };

  const ch5Key = `${jikupKey}_${lifeStage}`;
  const ch5 = {
    title: `Ch5. ${jikupInfo.main}의 운이 열리는 시기`,
    body: T.ch5_timing[ch5Key] || ''
  };

  const ch6 = {
    title: `Ch6. ${jikupInfo.main}의 운을 살리는 5가지 행동`,
    actions: T.ch6_practice[jikupKey] || []
  };

  const ch7 = {
    title: 'Ch7. 다음 — 재물풀이로',
    body: T.ch7_bridge[jikupKey] + '\n\n' + T.ch7_closer
  };

  return [ch1, ch2, ch3, ch4, ch5, ch6, ch7];
}

// ───────────────────────────────────────
// 자동 트리거 라우트 (결제 직후 호출)
// ───────────────────────────────────────
router.post('/api/v2/jikup-treat', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, error: 'orderId required' });

    const orderRef = getDb().collection('hw-orders').doc(orderId);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) return res.status(404).json({ success: false, error: 'order not found' });

    const order = orderDoc.data();
    if (order.product !== 'JIKUP') return res.status(400).json({ success: false, error: 'not JIKUP order' });

    // 이미 결과 있으면 그대로 반환
    const resultRef = getDb().collection('hw-results').doc(orderId);
    const existing = await resultRef.get();
    if (existing.exists) {
      return res.json({ success: true, cached: true, result: existing.data() });
    }

    // 무료 카드 데이터 필수
    const cardData = order.jikupCard;
    if (!cardData) return res.status(400).json({ success: false, error: 'jikupCard not found in order' });

    // 카드 데이터에서 꺼내기 (이미 무료 카드에서 분석 완료)
    const card = cardData.card || {};
    const gunghap = cardData.gunghap || {};
    const incomeRange = cardData.incomeRange || {};
    const sajuMeta = cardData.sajuMeta || {};

    const jikupKey = card.jikupKey;
    const labelCode = gunghap.labelCode;
    const currentJob = gunghap.currentJob || order.currentJob || order.job || '직장인';
    const u = order.user || {};
    const gender = u.gender === 'female' ? 'female' : 'male';

    // 나이 계산 (birthDate 문자열에서 연도 추출)
    const nowYear = new Date().getFullYear();
    const birthYear = extractBirthYear(u.birthDate);
    const age = birthYear ? (nowYear - birthYear + 1) : 30;

    if (!jikupKey || !labelCode) {
      return res.status(400).json({ success: false, error: 'invalid jikupCard (missing jikupKey or labelCode)' });
    }

    // 7챕터 조립
    const chapters = buildTreatChapters(jikupKey, labelCode, currentJob, gender, age, sajuMeta);

    // 생애 직업운 그래프 (1살~80세)
    const lifetimeCareer = calcLifetimeCareer(
      sajuMeta.dayGan,
      sajuMeta.daeun,
      age
    );

    // 카드 정보
    const jikupInfo = D.JIKUP_TYPES[jikupKey];

    const result = {
      orderId,
      product: 'JIKUP',
      productName: '직업처방',
      userName: u.name || '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      user: {
        name: u.name, gender, age, currentJob,
        birthYear: birthYear, birthDate: u.birthDate || '', birthTime: u.birthTime || ''
      },
      card: card,
      gunghap: gunghap,
      incomeRange: incomeRange,
      chapters,
      lifetimeCareer,
      sajuMeta: sajuMeta,
      jikupKey,
      labelCode,
      marriage: order.marriage || '',
      hasChild: order.hasChild || ''
    };

    await resultRef.set(result);

    // hw-orders에도 jikupTreat 미러링 (재물풀이 업그레이드 시 참조용)
    await orderRef.update({
      jikupTreat: {
        jikupKey, labelCode, age, currentJob, gender,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      }
    });

    res.json({ success: true, cached: false, result });
  } catch (err) {
    console.error('jikup-treat error:', err.message, err.stack);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ───────────────────────────────────────
// 결과 조회 라우트 (결과 페이지에서 호출)
// ───────────────────────────────────────
router.get('/api/v2/jikup-treat/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const resultRef = getDb().collection('hw-results').doc(orderId);
    const doc = await resultRef.get();

    if (!doc.exists) {
      // 자동 생성 트리거
      const trigger = await axios.post('https://hw-server-v2-1075269376260.asia-northeast3.run.app/api/v2/jikup-treat', { orderId });
      return res.json(trigger.data);
    }

    res.json({ success: true, result: doc.data() });
  } catch (err) {
    console.error('jikup-treat get error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;