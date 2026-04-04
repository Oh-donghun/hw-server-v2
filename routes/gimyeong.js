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

    // ── 사주 API 호출 ──
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

    // ── 오행 비율 ──
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

    // ── 십신 분석 ──
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

    // ── scoreEngine 호출 ──
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

    // ── 사주 근거 텍스트 동적 조합 ──
    const ganNameMap = {
      '甲': '갑목(甲木)', '乙': '을목(乙木)', '丙': '병화(丙火)', '丁': '정화(丁火)',
      '戊': '무토(戊土)', '己': '기토(己土)', '庚': '경금(庚金)', '辛': '신금(辛金)',
      '壬': '임수(壬水)', '癸': '계수(癸水)'
    };
    const strengthKor = strength === 'strong' ? '신강' : '신약';
    const ganDesc = ganNameMap[dayGan] || dayGan;

    let jaeSummary = '';
    if (jeongJaeCount > 0 && pyeonJaeCount > 0) {
      jaeSummary = `정재 ${jeongJaeCount}개, 편재 ${pyeonJaeCount}개로 안정 수입과 변동 수입이 공존한다.`;
    } else if (jeongJaeCount > 0) {
      jaeSummary = `정재가 ${jeongJaeCount}개로 안정적인 수입 구조를 갖고 있다.`;
    } else if (pyeonJaeCount > 0) {
      jaeSummary = `편재가 ${pyeonJaeCount}개로 큰 돈이 한 번에 들어오는 구조다.`;
    } else {
      jaeSummary = '사주에 재성이 없어 돈과의 인연을 직접 만들어야 한다.';
    }

    const vesselKeyFallbackGm = {
      jeong_moderate: 'jeong_strong',
      pyeon_moderate: 'pyeon_strong',
      skill_potential: 'skill',
      leak_mild: 'leak',
      official_wealth: 'both_strong',
      knowledge_wealth: 'both_weak'
    };
    const mappedVesselKey = vesselKeyFallbackGm[vesselKey] || vesselKey;

    const vesselReasonMap = {
      both_strong: `정재와 편재가 모두 자리 잡고 있어, 월급 같은 고정 수입과 투자·부업 같은 유동 수입을 동시에 담을 수 있는 구조다. ${strengthKor} 사주라 그릇을 채울 체력도 충분하다.`,
      jeong_strong: `정재가 단단하게 자리 잡고 있어 꾸준히 쌓이는 돈에 강하다. 한 번에 크게 벌기보다 시간이 지날수록 두둑해지는 구조다. ${strengthKor} 사주가 이 안정성을 뒷받침한다.`,
      pyeon_strong: `편재가 강해서 돈이 올 때 크게 온다. 사업 수익, 투자 수익처럼 한 방에 들어오는 돈에 인연이 있다. 다만 ${strengthKor} 사주라 들어온 돈을 지키는 힘${strength === 'strong' ? '은 있다. 뚜껑만 잘 덮으면 된다.' : '이 약하다. 반드시 시스템으로 잡아야 한다.'}`,
      skill: `식상이 재성을 살리는 구조다. 네 손에서 나오는 결과물이 곧 돈이 된다. ${strengthKor} 사주에 식상 ${siksangCount}개가 재성을 밀어주고 있어, 재주를 상품화하면 그릇이 빠르게 찬다.`,
      leak: `비겁이 ${bigyeopCount}개로 강해서 돈이 들어와도 주변으로 빠진다. 재성이 ${jaeCount > 0 ? jaeCount + '개 있어 벌 수는 있지만' : '없어 벌기도 어려운데'}, 새는 속도가 채우는 속도를 이긴다. ${strengthKor} 사주라 에너지는 ${strength === 'strong' ? '넘치는데 그 에너지가 남을 위해 쓰이고 있다.' : '부족한데 남까지 챙기느라 내 몫이 없다.'}`,
      both_weak: `사주에 재성이 약해서 돈이 저절로 굴러들어오는 팔자는 아니다. 하지만 ${strengthKor} 사주라 ${strength === 'strong' ? '체력은 있으니 전문성으로 그릇을 키울 수 있다.' : '에너지도 부족하니 한 분야에 집중해서 효율을 높여야 한다.'} ${insungCount >= 2 ? '인성이 ' + insungCount + '개로 학습 능력이 뛰어나니, 공부로 몸값을 올리는 게 가장 빠른 길이다.' : gwansungCount >= 2 ? '관성이 ' + gwansungCount + '개로 조직 안에서 인정받는 구조다. 승진이 곧 재물운이다.' : '식상이나 관성을 활용해 돈의 통로를 직접 만들어야 한다.'}`
    };
    const vesselReason = vesselReasonMap[mappedVesselKey] || vesselReasonMap['both_weak'];

    const sipsinSummary = [];
    if (jeongJaeCount > 0) sipsinSummary.push(`정재 ${jeongJaeCount}`);
    if (pyeonJaeCount > 0) sipsinSummary.push(`편재 ${pyeonJaeCount}`);
    if (bigyeopCount > 0) sipsinSummary.push(`비겁 ${bigyeopCount}`);
    if (siksangCount > 0) sipsinSummary.push(`식상 ${siksangCount}`);
    if (gwansungCount > 0) sipsinSummary.push(`관성 ${gwansungCount}`);
    if (insungCount > 0) sipsinSummary.push(`인성 ${insungCount}`);

    // ── 응답 ──
    res.json({
      success: true,
      card: {
        name: name || '',
        gender: gv,
        dayGan: dayGan,
        dayGanOheng: dayElement,
        strength: strength,
        strengthKor: strengthKor,
        ganDesc: ganDesc,
        fourPillars: fourPillars,
        fourPillarsHangul: fourPillarsHangul,
        elementGauge: elementGauge,
        vesselKey: vesselKey,
        mappedVesselKey: mappedVesselKey,
        vesselSize: vesselSize,
        vesselGrade: vesselGrade,
        vesselLabel: vesselLabel,
        wealthScore: wealthScore,
        wealthGrade: wealthGrade,
        channelKey: channelKey,
        channelGauge: channelGauge,
        gradeDesc: gradeDesc[vesselGrade] || '',
        gradePercentLabel: gradePercentLabel[vesselGrade] || '',
        cardText: gradeDesc[vesselGrade] || '',
        jaeSummary: jaeSummary,
        vesselReason: vesselReason,
        sipsinSummary: sipsinSummary.join(' · ')
      }
    });

  } catch (e) {
    console.error('gimyeong-card error:', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
