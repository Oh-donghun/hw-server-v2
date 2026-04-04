const express = require('express');
const router = express.Router();
const { db, FieldValue } = require('../utils/firestore');
const { normalizeGender } = require('../utils/gender');
const { parseBirth, analyze } = require('../engines/sajuEngine');
const { calcVesselKey, calcWealthGrade, calcVesselSize, calcVesselGrade, calcChannelKey, calcChannelGauge, calcLeakInfo, calcHabitKey } = require('../engines/scoreEngine');
const { appendTail } = require('../engines/textEngine');
const jaemulData = require('../jaemulData');
const ageData = require('../ageData');
const jobData = require('../jobData');
const lifeData = require('../lifeData');

router.post('/api/jaemul', async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ success: false, error: 'orderId required' });
    const orderDoc = await db.collection('hw-orders').doc(orderId).get();
    if (!orderDoc.exists) return res.status(404).json({ success: false, error: 'order not found' });
    const order = orderDoc.data();
    if (order.paymentStatus !== 'confirmed') return res.status(400).json({ success: false, error: 'payment not confirmed' });
    if (order.product !== 'HW2') return res.status(400).json({ success: false, error: 'not HW2 order, skip jaemul' });


    // -- birthDate fallback: upgradeFrom 주문에서 가져오기 --
    if ((!order.user.birthDate || !order.user.birthTime) && order.upgradeFrom) {
      const prevDoc = await db.collection('hw-orders').doc(order.upgradeFrom).get();
      if (prevDoc.exists) {
        const prev = prevDoc.data();
        if (!order.user.birthDate && prev.user && prev.user.birthDate) order.user.birthDate = prev.user.birthDate;
        if (!order.user.birthTime && prev.user && prev.user.birthTime) order.user.birthTime = prev.user.birthTime;
        if (!order.user.calendar && prev.user && prev.user.calendar) order.user.calendar = prev.user.calendar;
        if (!order.user.gender && prev.user && prev.user.gender) order.user.gender = prev.user.gender;
        if (!order.marriage || order.marriage === 'undefined') order.marriage = prev.marriage || order.marriage;
        if (!order.hasChild || order.hasChild === 'undefined') order.hasChild = prev.hasChild || order.hasChild;
        console.log('[jaemul] fallback from upgradeFrom:', order.upgradeFrom, 'birthDate:', order.user.birthDate);
      }
    }
    // ── 파싱 + 사주 분석 (엔진) ──
    const birth = parseBirth(order.user.birthDate || '', order.user.birthTime || '', order.user.calendar);
    if (!birth) return res.status(400).json({ success: false, error: 'birth date parse failed' });

    const gender = normalizeGender(order.user.gender);
    const saju = await analyze({
      name: order.user.name || 'jaemul',
      solarYear: birth.solarYear, solarMonth: birth.solarMonth, solarDay: birth.solarDay,
      hour: birth.hour, minute: 0, gender
    });

    // ── 나이/성별/직업/가정상황 ──
    const birthDateStr = saju.solarYear + '-' + String(saju.solarMonth).padStart(2,'0') + '-' + String(saju.solarDay).padStart(2,'0');
    const age = ageData.calcAge(birthDateStr);
    const ageGroup = ageData.getAgeGroup(age);
    const genderKey = gender;
    const job = order.job || '직장인';
    const jobKey = jobData.getJobKey(job);
    const jobKorMap = {
      '직장인': '직장인', '사무직': '직장인', '직장인(사무직)': '직장인',
      '현장직': '직장인', '기술직': '직장인', '직장인(현장직)': '직장인',
      '자영업': '사업', '자영업자': '사업', '사업': '사업',
      '프리랜서': '프리랜서', '크리에이터': '프리랜서',
      '주부': '주부', '육아': '주부',
      '취준생': '취준생', '무직': '취준생',
      '학생': '학생',
      '공무원': '직장인', '공기업': '직장인',
      '은퇴': '주부'
    };
    const jobKor = jobKorMap[job] || '직장인';
    const lifeKey = lifeData.getLifeKey(order.marriage || '미혼', order.hasChild || '없음');

    // ── 점수 계산 (엔진) ──
    const vesselKeyRaw = calcVesselKey(saju.counts);
const vesselKeyFallback = {
  jeong_moderate: 'jeong_strong',
  pyeon_moderate: 'pyeon_strong',
  skill_potential: 'skill',
  leak_mild: 'leak',
  official_wealth: 'both_strong',
  knowledge_wealth: 'both_weak'
};
const vesselKey = vesselKeyFallback[vesselKeyRaw] || vesselKeyRaw;
    const { wealthScore, wealthGrade } = calcWealthGrade(saju.counts, saju.strength);
    const channelKey = calcChannelKey(saju.counts);
    const channelGauge = calcChannelGauge(saju.counts, saju.dayElement);
    const habitKey = calcHabitKey(saju.elementGauge);

    // ── 섹션 4: 누수 패턴 ── (NUSU 연동 or 자체 계산)
    let leakKey, leakLevel, leakLabel, leakScores;
    let usedNusuData = false;
    const upgradeFromId = order.upgradeFrom || '';

    if (upgradeFromId) {
      try {
        // 1) hw-orders에서 이전 주문 확인
        const prevOrderDoc = await db.collection('hw-orders').doc(upgradeFromId).get();
        if (prevOrderDoc.exists) {
          const prevOrder = prevOrderDoc.data();

          // 2) hw-results에서 누수처방 결과 조회 (nusu-treat은 여기에 저장)
          const prevResultDoc = await db.collection('hw-results').doc(upgradeFromId).get();

          if (prevResultDoc.exists) {
            const prevResult = prevResultDoc.data();

            // 경로 A: NUSU 주문 + hw-results에 leakKey 존재
            if (prevOrder.product === 'NUSU' && prevResult.leakKey) {
              leakKey = prevResult.leakKey;
              leakLevel = prevResult.leakLevel;
              leakLabel = prevResult.leakLabel || { 1: '양호', 2: '주의', 3: '경고', 4: '위험', 5: '심각' }[leakLevel] || '보통';
              leakScores = prevResult.nusuCard?.leakScores || {};
              usedNusuData = true;
              console.log(`[jaemul] 누수처방(hw-results) 연동 성공: leakKey=${leakKey}, leakLevel=${leakLevel}`);
            }
          }

          // 경로 B: hw-results에 없으면 hw-orders의 nusuTreat에서 시도
          if (!usedNusuData && prevOrder.product === 'NUSU' && prevOrder.nusuTreat) {
            leakKey = prevOrder.nusuTreat.leakKey;
            leakLevel = prevOrder.nusuTreat.leakLevel;
            leakLabel = { 1: '양호', 2: '주의', 3: '경고', 4: '위험', 5: '심각' }[leakLevel] || '보통';
            leakScores = prevOrder.nusuCard?.leakScores || {};
            usedNusuData = true;
            console.log(`[jaemul] 누수처방(hw-orders.nusuTreat) 연동 성공: leakKey=${leakKey}, leakLevel=${leakLevel}`);
          }

          // 경로 C: nusuCard만 있는 경우 (누수처방 생성 전 업그레이드)
          if (!usedNusuData && prevOrder.nusuCard && prevOrder.nusuCard.leakKey) {
            leakKey = prevOrder.nusuCard.leakKey;
            leakLevel = prevOrder.nusuCard.leakLevel;
            leakLabel = { 1: '양호', 2: '주의', 3: '경고', 4: '위험', 5: '심각' }[leakLevel] || '보통';
            leakScores = prevOrder.nusuCard.leakScores || {};
            usedNusuData = true;
            console.log(`[jaemul] 누수카드(hw-orders.nusuCard) 연동 성공: leakKey=${leakKey}, leakLevel=${leakLevel}`);
          }
        }
      } catch (e) {
        console.log(`[jaemul] 이전 주문 조회 실패, 자체 계산으로 전환: ${e.message}`);
      }
    }

    // NUSU 데이터가 없으면 자체 계산
    if (!usedNusuData) {
      const selfLeak = calcLeakInfo(saju.counts);
      leakKey = selfLeak.leakKey;
      leakLevel = selfLeak.leakLevel;
      leakLabel = selfLeak.leakLabel;
      leakScores = selfLeak.leakScores;
      console.log(`[jaemul] 자체 계산: leakKey=${leakKey}, leakLevel=${leakLevel}`);
    }

    // ── 시각화 데이터 ──
    const vesselSize = calcVesselSize(saju.counts, saju.strength, saju.dayElement);
    const { grade: vesselGrade, vesselLabel } = calcVesselGrade(vesselSize);


    const investRadarMap = {
      wood:  { realestate: 40, stock: 70, business: 60, saving: 30, crypto: 50 },
      fire:  { realestate: 30, stock: 80, business: 70, saving: 20, crypto: 60 },
      earth: { realestate: 90, stock: 30, business: 50, saving: 70, crypto: 20 },
      metal: { realestate: 60, stock: 80, business: 40, saving: 60, crypto: 30 },
      water: { realestate: 50, stock: 60, business: 50, saving: 50, crypto: 40 }
    };
    const investRadar = investRadarMap[saju.dayElement] || investRadarMap['wood'];

    const jobMatchKey = jobKor + '_' + saju.dayElement;
    const jobScoreBase = {
      '사업_fire': 92, '사업_earth': 85, '사업_wood': 78, '사업_water': 75, '사업_metal': 80,
      '직장인_earth': 90, '직장인_metal': 88, '직장인_wood': 82, '직장인_water': 78, '직장인_fire': 75,
      '프리랜서_fire': 90, '프리랜서_metal': 88, '프리랜서_water': 82, '프리랜서_wood': 80, '프리랜서_earth': 72,
      '주부_earth': 88, '주부_water': 85, '주부_fire': 80, '주부_metal': 78, '주부_wood': 75,
      '취준생_wood': 85, '취준생_fire': 82, '취준생_earth': 80, '취준생_metal': 88, '취준생_water': 78,
      '학생_wood': 85, '학생_water': 82, '학생_metal': 88, '학생_fire': 78, '학생_earth': 80
    };
    const jobScore = jobScoreBase[jobMatchKey] || 75;

    const habitChecklist = {
      fire_excess: ['큰 지출 앞에서 3일 냉각기', '매주 물가 산책 30분', '충동구매 금지 앱 설치'],
      water_excess: ['매일 아침 재무 할 일 1개 정하기', '주 1회 등산 또는 텃밭', '생각 전에 행동 먼저'],
      wood_excess: ['한 달 재무 목표 1개만', '주 1회 정리정돈', '안 되는 건 과감히 포기'],
      metal_excess: ['한 달 1회 새로운 경험', '70% 확신이면 실행', '완벽주의 내려놓기'],
      earth_excess: ['매달 고정비 10% 줄이기', '안 쓰는 구독 전부 해지', '새로운 배움 1개 시작'],
      balanced: ['수입의 20% 자동이체 저축', '분기별 재무 점검', '가계부 주 1회 작성']
    };
    const checklist = habitChecklist[habitKey] || habitChecklist['balanced'];

    const hoTongIntensityMap = { grade_6: 5, grade_5: 4, grade_4: 4, grade_3: 3, grade_2: 3, grade_1: 3 };
    const hoTongIntensity = hoTongIntensityMap[vesselGrade] || 3;

    // ── 텍스트 조립 ──
    const overviewKey = saju.dayGan + '_' + saju.strength;
    let overview = jaemulData.overview[overviewKey] || jaemulData.overview['甲_strong'];

let moneyVessel = (jaemulData.moneyVessel[vesselKey] || '').replace(/\{vesselLabel\}/g, vesselLabel);
    let moneyChannel = jaemulData.moneyChannel[channelKey] || '';
    let leakPattern = jaemulData.leakPattern[leakKey] || jaemulData.leakPattern['unconscious'] || '';
    let investType = jaemulData.investType[saju.dayElement] || jaemulData.investType['wood'];
    let jobMatch = jaemulData.jobMatch[jobMatchKey] || jaemulData.jobMatch['직장인_wood'];
    const monthlyFortune = jaemulData.monthlyFortune[saju.dayGan] || jaemulData.monthlyFortune['甲'];
    const threeYear = jaemulData.threeYearFlow[saju.dayGan] || jaemulData.threeYearFlow['甲'];
    let moneyHabit = jaemulData.moneyHabit[habitKey] || '';
    let wealthHoTong = (jaemulData.wealthHoTong[vesselKey] || '').replace(/\{vesselLabel\}/g, vesselLabel);

    // ── ageGroup 매핑 (공통) ──
    const ageMap = { age_40_44: 'age_40_49', age_45_49: 'age_40_49' };
    const mappedAge = ageMap[ageGroup] || ageGroup;

    // ── 1. overview 꼬리 (gender + age + job + life) ──
    if (jaemulData.overviewGender) {
      const gTail = jaemulData.overviewGender[saju.dayElement + '_' + genderKey] || '';
      if (gTail) overview = overview + ' ' + gTail;
    }
    if (jaemulData.overviewAge) {
      const aTail = jaemulData.overviewAge[saju.dayElement + '_' + mappedAge] || '';
      if (aTail) overview = overview + ' ' + aTail;
    }
    if (jaemulData.overviewJob) {
      const jTail = jaemulData.overviewJob[saju.dayElement + '_' + jobKor] || '';
      if (jTail) overview = overview + ' ' + jTail;
    }
    if (jaemulData.overviewLife) {
      const lTail = jaemulData.overviewLife[saju.dayElement + '_' + lifeKey] || '';
      if (lTail) overview = overview + ' ' + lTail;
    }

    // ── 2. moneyVessel 꼬리 (life + gender + age + job) ──
    moneyVessel = appendTail(moneyVessel, jaemulData.vesselLife, vesselKey + '_' + lifeKey);
    if (jaemulData.vesselGender) {
      moneyVessel = appendTail(moneyVessel, jaemulData.vesselGender, vesselKey + '_' + genderKey);
    }
    if (jaemulData.vesselAge) {
      moneyVessel = appendTail(moneyVessel, jaemulData.vesselAge, vesselKey + '_' + mappedAge);
    }
    if (jaemulData.vesselJob) {
     moneyVessel = appendTail(moneyVessel, jaemulData.vesselJob, vesselKey + '_' + jobKor);
    }
   moneyVessel = moneyVessel.replace(/\{vesselLabel\}/g, vesselLabel);



    // ── 3. moneyChannel 꼬리 (gender + age + job + life) ──
    if (jaemulData.channelGender) {
      moneyChannel = appendTail(moneyChannel, jaemulData.channelGender, channelKey + '_' + genderKey);
    }
    if (jaemulData.channelAge) {
      moneyChannel = appendTail(moneyChannel, jaemulData.channelAge, channelKey + '_' + mappedAge);
    }
    if (jaemulData.channelJob) {
      moneyChannel = appendTail(moneyChannel, jaemulData.channelJob, channelKey + '_' + jobKor);
    }
    if (jaemulData.channelLife) {
      moneyChannel = appendTail(moneyChannel, jaemulData.channelLife, channelKey + '_' + lifeKey);
    }

    // ── 3-1. leakPattern 꼬리 (life + gender + age + job) ──
    leakPattern = appendTail(leakPattern, jaemulData.leakLife, leakKey + '_' + lifeKey);
    if (jaemulData.leakGender) {
      leakPattern = appendTail(leakPattern, jaemulData.leakGender, leakKey + '_' + genderKey);
    }
    if (jaemulData.leakAge) {
      leakPattern = appendTail(leakPattern, jaemulData.leakAge, leakKey + '_' + mappedAge);
    }
    if (jaemulData.leakJob) {
      leakPattern = appendTail(leakPattern, jaemulData.leakJob, leakKey + '_' + jobKor);
    }

    // ── 5. investType 꼬리 (gender + age + job + life) ──
    if (jaemulData.investGender) {
      investType = appendTail(investType, jaemulData.investGender, saju.dayElement + '_' + genderKey);
    }
    if (jaemulData.investAge) {
      investType = appendTail(investType, jaemulData.investAge, saju.dayElement + '_' + mappedAge);
    }
    if (jaemulData.investJob) {
      investType = appendTail(investType, jaemulData.investJob, saju.dayElement + '_' + jobKor);
    }
    if (jaemulData.investLife) {
      investType = appendTail(investType, jaemulData.investLife, saju.dayElement + '_' + lifeKey);
    }

    // ── 6. moneyHabit 꼬리 (life + gender + age + job) ──
    moneyHabit = appendTail(moneyHabit, jaemulData.habitLife, habitKey + '_' + lifeKey);
    if (jaemulData.habitGender) {
      moneyHabit = appendTail(moneyHabit, jaemulData.habitGender, habitKey + '_' + genderKey);
    }
    if (jaemulData.habitAge) {
      moneyHabit = appendTail(moneyHabit, jaemulData.habitAge, habitKey + '_' + mappedAge);
    }
    if (jaemulData.habitJob) {
      moneyHabit = appendTail(moneyHabit, jaemulData.habitJob, habitKey + '_' + jobKor);
    }

    // ── 7. jobMatch 꼬리 (gender + life) ──
    if (jaemulData.jobGender) {
      const jmGenderKey = jobKor + '_' + saju.dayElement + '_' + genderKey;
      jobMatch = appendTail(jobMatch, jaemulData.jobGender, jmGenderKey);
    }
    if (jaemulData.jobLife) {
      const jmLifeKey = jobKor + '_' + saju.dayElement + '_' + lifeKey;
      jobMatch = appendTail(jobMatch, jaemulData.jobLife, jmLifeKey);
    }

    // ── 8. wealthHoTong 꼬리 (life + gender + age + job) ──
    wealthHoTong = appendTail(wealthHoTong, jaemulData.hoTongLife, vesselKey + '_' + lifeKey);
    if (jaemulData.hoTongGender) {
      wealthHoTong = appendTail(wealthHoTong, jaemulData.hoTongGender, vesselKey + '_' + genderKey);
    }
    if (jaemulData.hoTongAge) {
      wealthHoTong = appendTail(wealthHoTong, jaemulData.hoTongAge, vesselKey + '_' + mappedAge);
    }
    if (jaemulData.hoTongJob) {
      wealthHoTong = appendTail(wealthHoTong, jaemulData.hoTongJob, vesselKey + '_' + jobKor);
    }
    wealthHoTong = wealthHoTong.replace(/\{vesselLabel\}/g, vesselLabel);


    // ── 초견 결과 참조 ──
    let chogyeonRef = null;
    const chogyeonDoc = await db.collection('hw-results').doc(order.upgradeFrom || orderId).get();
    if (chogyeonDoc.exists) {
      const cData = chogyeonDoc.data();
      chogyeonRef = { dayGan: cData.dayGan || '', strength: cData.strength || '', wealthType: cData.wealthType || '' };
    }

    // ── 결과 조립 ──
    const resultData = {
      orderId,
      productName: '재물풀이',
      userName: order.user.name,
      job, jobKey, jobKor, age, ageGroup, genderKey, lifeKey,
      dayGan: saju.dayGan, dayGanOheng: saju.dayOheng, dayElement: saju.dayElement, strength: saju.strength,
      fourPillars: saju.fourPillars,
      fourPillarsHangul: saju.fourPillarsHangul,
      elementGauge: saju.elementGauge,
      wealthGrade, wealthScore,
      vesselKey, vesselKeyRaw, vesselGrade, vesselSize, vesselLabel,
      channelKey, channelGauge,
      leakKey, leakLevel, leakLabel,
      investRadar, jobScore, hoTongIntensity, checklist,
      sections: {
        overview, moneyVessel, moneyChannel, leakPattern,
        investType, jobMatch, monthlyFortune,
        threeYearFlow: threeYear,
        moneyHabit, wealthHoTong
      },
      chogyeonRef,
      createdAt: FieldValue.serverTimestamp()
    };

    await db.collection('hw-results').doc(orderId).set(resultData);
    res.json({ success: true, result: resultData });

  } catch (e) {
    console.error('jaemul error:', e.response?.data || e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
