const KoreanLunarCalendar = require('korean-lunar-calendar');
const axios = require('axios');
const { normalizeGender } = require('../utils/gender');

const SAJU_API = 'https://naread-saju-1075269376260.asia-northeast3.run.app/saju';

const ohengMap = { '목': 'wood', '화': 'fire', '토': 'earth', '금': 'metal', '수': 'water' };
const ganToElement = { '甲':'wood','乙':'wood','丙':'fire','丁':'fire','戊':'earth','己':'earth','庚':'metal','辛':'metal','壬':'water','癸':'water' };
const ganHangulMap = { '甲':'갑','乙':'을','丙':'병','丁':'정','戊':'무','己':'기','庚':'경','辛':'신','壬':'임','癸':'계' };

// 생년월일 문자열 파싱 (주문서 형식)
function parseBirth(birthStr, timeStr, calendarType) {
  let yearMatch = birthStr.match(/(\d{4})/);
  let monthMatch = birthStr.match(/(\d{1,2})월/);
  let dayMatch = birthStr.match(/(\d{1,2})일/);
  const isLunar = (birthStr.includes('음력') || calendarType === 'lunar');

  if (!monthMatch || !dayMatch) {
    const fallback = birthStr.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (fallback) {
      yearMatch = [null, fallback[1]];
      monthMatch = [null, fallback[2]];
      dayMatch = [null, fallback[3]];
    }
  }

  if (!yearMatch || !monthMatch || !dayMatch) return null;

  let solarYear = Number(yearMatch[1]);
  let solarMonth = Number(monthMatch[1]);
  let solarDay = Number(dayMatch[1]);

  if (isLunar) {
    const cal = new KoreanLunarCalendar();
    cal.setLunarDate(solarYear, solarMonth, solarDay, false);
    const sol = cal.getSolarCalendar();
    solarYear = sol.year; solarMonth = sol.month; solarDay = sol.day;
  }

  let hour = 12;
  if (timeStr) {
    const hourMatch = timeStr.match(/(\d{1,2})시/);
    if (hourMatch) hour = Number(hourMatch[1]);
  }

  return { solarYear, solarMonth, solarDay, hour, isLunar };
}

// 누수카드용 파싱 (숫자 직접 입력)
function parseBirthDirect(birthYear, birthMonth, birthDay, birthHour, birthMinute, calendarType) {
  let solarYear = Number(birthYear);
  let solarMonth = Number(birthMonth);
  let solarDay = Number(birthDay);

  if (calendarType === 'lunar') {
    const cal = new KoreanLunarCalendar();
    cal.setLunarDate(solarYear, solarMonth, solarDay, false);
    const sol = cal.getSolarCalendar();
    solarYear = sol.year; solarMonth = sol.month; solarDay = sol.day;
  }

  const hour = (birthHour !== undefined && birthHour !== null) ? Number(birthHour) : 12;
  const minute = (birthMinute !== undefined && birthMinute !== null) ? Number(birthMinute) : 0;

  return { solarYear, solarMonth, solarDay, hour, minute };
}

// 사주 API 호출 + 공통 분석
async function analyze(opts) {
  const { name, solarYear, solarMonth, solarDay, hour, minute, gender } = opts;
  const gv = normalizeGender(gender);

  const sajuRes = await axios.post(SAJU_API, {
    name: name || 'user',
    year: solarYear, month: solarMonth, day: solarDay,
    hour: hour || 12, minute: minute || 0,
    gender: gv === 'male' ? '남' : '여',
    calendarType: 'solar'
  });

  const saju = sajuRes.data.data;
  const dayGan = saju.dayMaster.gan;
  const dayOheng = saju.dayMaster.oheng;
  const dayElement = ohengMap[dayOheng] || 'wood';
  const ganKey = ganHangulMap[dayGan] || '갑';

  // 오행 비율
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

  // 사주 기둥
  const pillars = saju.fourPillars;
  const fourPillars = {
    year: pillars.year.hanja, month: pillars.month.hanja,
    day: pillars.day.hanja, hour: pillars.hour.hanja
  };
  const fourPillarsHangul = {
    year: pillars.year.hangul, month: pillars.month.hangul,
    day: pillars.day.hangul, hour: pillars.hour.hangul
  };

  // 십신 수집
  const sipseong = saju.sipseong || {};
  const allSipsin = [];
  ['year','month','day','hour'].forEach(p => {
    if (sipseong[p]) {
      if (sipseong[p].gan && sipseong[p].gan !== '일간') allSipsin.push(sipseong[p].gan);
      if (sipseong[p].ji) sipseong[p].ji.forEach(j => { if (j.sipseong) allSipsin.push(j.sipseong); });
    }
  });

  // 십신 카운트
  const counts = {
    jae: allSipsin.filter(s => s && (s.includes('정재') || s.includes('편재'))).length,
    jeongJae: allSipsin.filter(s => s && s.includes('정재')).length,
    pyeonJae: allSipsin.filter(s => s && s.includes('편재')).length,
    bigyeop: allSipsin.filter(s => s && (s.includes('비견') || s.includes('겁재'))).length,
    siksang: allSipsin.filter(s => s && (s.includes('식신') || s.includes('상관'))).length,
    gwansung: allSipsin.filter(s => s && (s.includes('정관') || s.includes('편관'))).length,
    insung: allSipsin.filter(s => s && (s.includes('정인') || s.includes('편인'))).length
  };
  counts.hasJeongJae = counts.jeongJae >= 1;
  counts.hasPyeonJae = counts.pyeonJae >= 1;
  counts.hasBigyeop = counts.bigyeop >= 2;
  counts.hasSiksang = counts.siksang >= 2;
  counts.hasGwansung = counts.gwansung >= 1;
  counts.hasInsung = counts.insung >= 1;
  counts.jeongGwan = allSipsin.filter(s => s && s.includes('정관')).length;
  counts.sanggwan  = allSipsin.filter(s => s && s.includes('상관')).length;
  counts.pyeonIn   = allSipsin.filter(s => s && s.includes('편인')).length;

  return {
    raw: saju,
    dayGan, dayOheng, dayElement, ganKey,
    strength, dayPct,
    elementGauge,
    fourPillars, fourPillarsHangul,
    allSipsin, counts,
    solarYear, solarMonth, solarDay
  };
}

module.exports = {
  parseBirth, parseBirthDirect, analyze,
  ohengMap, ganToElement, ganHangulMap
};
