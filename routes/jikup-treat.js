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