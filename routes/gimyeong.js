// routes/gimyeong.js — 기명패 (무료 돈 그릇 카드)
const express = require('express');
const router = express.Router();
const axios = require('axios');
const KoreanLunarCalendar = require('korean-lunar-calendar');
const { calcVesselKey, calcWealthGrade, calcVesselSize, calcVesselGrade, calcChannelKey, calcChannelGauge } = require('../engines/scoreEngine');

function normalizeGender(raw) {
  if (!raw || raw === '') return 'male';
  const v = String(raw).trim().toLowerCase();
  if (['male','m'].includes(v)) return 'male';
  if (['female','f'].includes(v)) return 'female';
  if (v === '남') return 'male';
  if (v === '여') return 'female';
  return 'male';
}

router.post('/api/v2/gimyeong-card', async (req, res) => {
  try {
    const { name, gender, birthYear, birthMonth, birthDay, birthHour, birthMinute, calendarType } = req.body;
    if (!birthYear || !birthMonth || !birthDay) return res.status(400).json({ success: false, error: 'birth date required' });

    const gv = normalizeGender(gender) === 'female' ? 'female' : 'male';
    let solarYear = Number(birthYear);
    let solarMonth = Number(birthMonth);
    let solarDay = Number(birthDay);

    if (calendarType === 'lunar') {
      const cal = new KoreanLunarCalendar();
      cal.setLunarDate(Number(birthYear), Number(birthMonth), Number(birthDay), false);
      const sol = cal.getSolarCalendar();
      solarYear = sol.year; solarMonth = sol.month; solarDay = sol.day;
    }

    // ── 사주 API 호출 (누수패와 동일) ──
    const sajuRes = await axios.post('https://naread-saju-1075269376260.asia-northeast3.run.app/saju', {
      name: name || 'gimyeong',
      year: solarYear, month: solarMonth, day: solarDay,
      hour: (birthHour !== undefined && birthHour !== null) ? Number(birthHour) : 12,
      minute: (birthMinute !== undefined && birthMinute !== null) ? Number(birthMinute) : 0,
      gender: gv === 'male' ? '남' : '여',
      calendarType: 'solar'
    });
    const saju = sajuRes.data.data;
    const dayGan = saju.dayMaster.gan;
    const dayOheng = saju.dayMaster.oheng;
    const ohengMap = { '목': 'wood', '화': 'fire', '토': 'earth', '금': 'metal', '수': 'water' };
    const dayElement = ohengMap[dayOheng] || 'wood';

    // ── 오행 비율 (누수패와 동일 로직) ──
    const oh = saju.oheng;
    const total = (oh['목']||0) + (oh['화']||0) + (oh['토']||0) + (oh['금']||0) + (oh['수']||0);
    const dayPct = total ? Math.round(((oh[dayOheng]||0) / total) * 100) : 0;
    const strength = dayPct >= 25 ? 'strong' : 'weak';
    const elementGauge = {
      wood: total ? Math.round(((oh['목']||0)/total)*100) : 0,
      fire: total ? Math.round(((oh['화']||0)/total)*100) : 0,
      earth: total ? Math.round(((oh['토']||0)/total)*100) : 0,
      metal: total ? Math.round(((oh['금']||0)/total)*100) : 0,
      water: total ? Math.round(((oh['수']||0)/total)*100) : 0
    };

    // ── 십신 분석 (재물풀이와 동일 로직) ──
    const sipseong = saju.sipseong || {};
    const allSipsin = [];
    ['year','month','day','hour'].forEach(p => {
      if (sipseong[p]) {
        if (sipseong[p].gan && sipseong[p].gan !== '일간') allSipsin.push(sipseong[p].gan);
        if (sipseong[p].ji) sipseong[p].ji.forEach(j => { if (j.sipseong) allSipsin.push(j.sipseong); });
      }
    });

    const jeongJaeCount = allSipsin.filter(s => s && s.includes('정재')).length;
    const pyeonJaeCount = allSipsin.filter(s => s && s.includes('편재')).length;
    const jaeCount = jeongJaeCount + pyeonJaeCount;
    const bigyeopCount = allSipsin.filter(s => s && (s.includes('비견') || s.includes('겁재'))).length;
    const siksangCount = allSipsin.filter(s => s && (s.includes('식신') || s.includes('상관'))).length;
    const gwansungCount = allSipsin.filter(s => s && (s.includes('정관') || s.includes('편관'))).length;
    const insungCount = allSipsin.filter(s => s && (s.includes('정인') || s.includes('편인'))).length;

    // ── scoreEngine 호출 (재물풀이와 동일한 엔진) ──
    const counts = {
      jae: jaeCount,
      jeongJae: jeongJaeCount,
      pyeonJae: pyeonJaeCount,
      bigyeop: bigyeopCount,
      siksang: siksangCount,
      gwansung: gwansungCount,
      insung: insungCount
    };

    const vesselKey = calcVesselKey(counts);
    const { wealthScore, wealthGrade } = calcWealthGrade(counts, strength);
    const vesselSize = calcVesselSize(counts, strength, dayElement);
    const { grade: vesselGrade, vesselLabel } = calcVesselGrade(vesselSize);
    const channelKey = calcChannelKey(counts);
    const channelGauge = calcChannelGauge(counts, dayElement);

    // ── 사주 원국 ──
    const fourPillars = {
      year: saju.fourPillars.year.hanja,
      month: saju.fourPillars.month.hanja,
      day: saju.fourPillars.day.hanja,
      hour: saju.fourPillars.hour.hanja
    };
    const fourPillarsHangul = {
      year: saju.fourPillars.year.hangul,
      month: saju.fourPillars.month.hangul,
      day: saju.fourPillars.day.hangul,
      hour: saju.fourPillars.hour.hangul
    };

    // ── 등급별 한 줄 설명 ──
    const gradeDesc = {
      grade_1: '벌어들이는 힘과 지키는 힘, 모두 최상급이다.',
      grade_2: '재주가 돈이 되는 구조다. 방향만 잡으면 크게 번다.',
      grade_3: '크게 벌 수 있지만, 크게 쓰기도 한다.',
      grade_4: '꾸준히 모으는 힘이 있다. 급하게 굴리지 마라.',
      grade_5: '새는 구멍부터 막아야 한다. 돈이 머물지 못하는 구조다.',
      grade_6: '작지만 전략이 필요하다. 아는 만큼 지킨다.'
    };

    // ── 등급별 퍼센트 라벨 ──
    const gradePercentLabel = {
      grade_1: '상위 5%',
      grade_2: '상위 17%',
      grade_3: '상위 40%',
      grade_4: '상위 70%',
      grade_5: '하위 30%',
      grade_6: '하위 10%'
    };

    res.json({
      success: true,
      card: {
        name: name || '',
        gender: gv,
        dayGan: dayGan,
        dayGanOheng: dayElement,
        strength: strength,
        fourPillars: fourPillars,
        fourPillarsHangul: fourPillarsHangul,
        elementGauge: elementGauge,
        vesselKey: vesselKey,
        vesselSize: vesselSize,
        vesselGrade: vesselGrade,
        vesselLabel: vesselLabel,
        wealthScore: wealthScore,
        wealthGrade: wealthGrade,
        channelKey: channelKey,
        channelGauge: channelGauge,
        gradeDesc: gradeDesc[vesselGrade] || '',
        gradePercentLabel: gradePercentLabel[vesselGrade] || '',
        cardText: gradeDesc[vesselGrade] || ''
      }
    });

  } catch (e) {
    console.error('gimyeong-card error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
