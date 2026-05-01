// engines/nusuCardEngine.js
// 누수카드 합성 엔진 (사주 API 호출 + 누수 점수 계산)
// 사용처:
//   - /api/v2/nusu-card (무료 진단 라우터) — TODO: 향후 리팩토링으로 이 엔진 호출하도록 변경
//   - /api/v2/nusu-treat (유료 처방) fallback — order.nusuCard 없을 때 자동 합성

const axios = require('axios');
const KoreanLunarCalendar = require('korean-lunar-calendar');
const ageData = require('../ageData');
const nusuData = require('../nusuData');

const SAJU_API = 'https://naread-saju-1075269376260.asia-northeast3.run.app/saju';

const GAN_HANGUL_MAP = {
  '\u7532':'\uAC11','\u4E59':'\uC744','\u4E19':'\uBCD1','\u4E01':'\uC815','\u620A':'\uBB34',
  '\u5DF1':'\uAE30','\u5E9A':'\uACBD','\u8F9B':'\uC2E0','\u58EC':'\uC784','\u7678':'\uACC4'
};
const OHENG_MAP = { '\uBAA9':'wood','\uD654':'fire','\uD1A0':'earth','\uAE08':'metal','\uC218':'water' };

function normalizeGender(g) {
  if (g === 'female' || g === 'f' || g === '\uC5EC' || g === '\uC5EC\uC131') return 'female';
  return 'male';
}

/**
 * 누수카드 합성
 * @param {Object} input
 * @param {string} input.name
 * @param {string} input.gender 'male'|'female'|'\uB0A8'|'\uC5EC'
 * @param {number} input.birthYear
 * @param {number} input.birthMonth
 * @param {number} input.birthDay
 * @param {number} [input.birthHour=12]
 * @param {number} [input.birthMinute=0]
 * @param {string} [input.calendarType='solar'] 'solar'|'lunar'
 * @returns {Promise<Object>} card 객체 (nusu-card 라우터 응답의 card와 동일)
 */
async function computeNusuCard(input) {
  if (!input || !input.birthYear || !input.birthMonth || !input.birthDay) {
    throw new Error('birth date required');
  }

  const gv = normalizeGender(input.gender);
  let solarYear = Number(input.birthYear);
  let solarMonth = Number(input.birthMonth);
  let solarDay = Number(input.birthDay);

  if (input.calendarType === 'lunar') {
    const cal = new KoreanLunarCalendar();
    cal.setLunarDate(solarYear, solarMonth, solarDay, false);
    const sol = cal.getSolarCalendar();
    solarYear = sol.year; solarMonth = sol.month; solarDay = sol.day;
  }

  const sajuRes = await axios.post(SAJU_API, {
    name: input.name || 'nusu',
    year: solarYear, month: solarMonth, day: solarDay,
    hour: (input.birthHour !== undefined && input.birthHour !== null) ? Number(input.birthHour) : 12,
    minute: (input.birthMinute !== undefined && input.birthMinute !== null) ? Number(input.birthMinute) : 0,
    gender: gv === 'male' ? '\uB0A8' : '\uC5EC',
    calendarType: 'solar'
  });
  const saju = sajuRes.data.data;

  const dayGan = saju.dayMaster.gan;
  const dayOheng = saju.dayMaster.oheng;
  const dayElement = OHENG_MAP[dayOheng] || 'wood';

  const oh = saju.oheng;
  const total = (oh['\uBAA9']||0)+(oh['\uD654']||0)+(oh['\uD1A0']||0)+(oh['\uAE08']||0)+(oh['\uC218']||0);
  const dayPct = total ? Math.round(((oh[dayOheng]||0) / total) * 100) : 0;
  const strength = dayPct >= 25 ? 'strong' : 'weak';
  const elementGauge = {
    wood:  total ? Math.round(((oh['\uBAA9']||0)/total)*100) : 0,
    fire:  total ? Math.round(((oh['\uD654']||0)/total)*100) : 0,
    earth: total ? Math.round(((oh['\uD1A0']||0)/total)*100) : 0,
    metal: total ? Math.round(((oh['\uAE08']||0)/total)*100) : 0,
    water: total ? Math.round(((oh['\uC218']||0)/total)*100) : 0
  };

  // 십성 카운트
  const sipseong = saju.sipseong || {};
  const allSipsin = [];
  ['year','month','day','hour'].forEach(p => {
    if (sipseong[p]) {
      if (sipseong[p].gan && sipseong[p].gan !== '\uC77C\uAC04') allSipsin.push(sipseong[p].gan);
      if (sipseong[p].ji) sipseong[p].ji.forEach(j => { if (j.sipseong) allSipsin.push(j.sipseong); });
    }
  });
  const gwansungCount = allSipsin.filter(s => s && (s.includes('\uC815\uAD00') || s.includes('\uD3B8\uAD00'))).length;
  const siksangCount  = allSipsin.filter(s => s && (s.includes('\uC2DD\uC2E0') || s.includes('\uC0C1\uAD00'))).length;
  const insungCount   = allSipsin.filter(s => s && (s.includes('\uC815\uC778') || s.includes('\uD3B8\uC778'))).length;
  const jaeCount      = allSipsin.filter(s => s && (s.includes('\uC815\uC7AC') || s.includes('\uD3B8\uC7AC'))).length;
  const bigyeopCount  = allSipsin.filter(s => s && (s.includes('\uBE44\uACAC') || s.includes('\uACA9\uC7AC'))).length;

  let leakKey = 'unconscious';
  const leakScores = {
    people:   bigyeopCount >= 3 ? bigyeopCount * 2 : bigyeopCount,
    desire:   siksangCount >= 3 ? siksangCount * 2 : siksangCount,
    pride:    gwansungCount >= 3 ? gwansungCount * 2 : gwansungCount,
    learning: insungCount   >= 3 ? insungCount   * 2 : insungCount
  };
  const maxLeak = Object.entries(leakScores).sort((a,b) => b[1] - a[1])[0];
  const topScore = maxLeak[1];
  if (topScore >= 4) leakKey = maxLeak[0];

  const totalPressure = Object.values(leakScores).reduce((a,b) => a+b, 0);
  const defense = Math.min(jaeCount * 2, 6);
  const finalLeakScore = Math.max(0, topScore + Math.floor(totalPressure / 4) - defense);
  let leakLevel;
  if (finalLeakScore <= 1) leakLevel = 1;
  else if (finalLeakScore <= 4) leakLevel = 2;
  else if (finalLeakScore <= 7) leakLevel = 3;
  else if (finalLeakScore <= 10) leakLevel = 4;
  else leakLevel = 5;

  const birthDateStr = solarYear + '-' + String(solarMonth).padStart(2,'0') + '-' + String(solarDay).padStart(2,'0');
  const age = ageData.calcAge(birthDateStr);
  const ageGroup = ageData.getAgeGroup(age);
  const leakAmount = ageData.calcLeakAmount(age, leakLevel);

  const ganKey = GAN_HANGUL_MAP[dayGan] || '\uAC11';
  const strengthKey = strength === 'strong' ? 'strong' : 'weak';

  const cardBase = nusuData.card_base[leakKey] || '';
  const cardTail = nusuData.card_tail[ganKey + '_' + strengthKey] || '';
  const cardText = cardBase + ' ' + cardTail;

  const fourPillars = {
    year:  saju.fourPillars.year.hanja,
    month: saju.fourPillars.month.hanja,
    day:   saju.fourPillars.day.hanja,
    hour:  saju.fourPillars.hour.hanja
  };
  const fourPillarsHangul = {
    year:  saju.fourPillars.year.hangul,
    month: saju.fourPillars.month.hangul,
    day:   saju.fourPillars.day.hangul,
    hour:  saju.fourPillars.hour.hangul
  };

  return {
    name: input.name || '',
    gender: gv,
    age,
    ageGroup,
    ageLabel: ageData.groups[ageGroup].label,
    dayGan,
    dayGanOheng: dayElement,
    strength,
    fourPillars,
    fourPillarsHangul,
    elementGauge,
    leakKey,
    leakLevel,
    leakLabel: nusuData.levelLabel[leakLevel],
    leakDesc:  nusuData.levelDesc[leakLevel],
    leakScores,
    leakAmount,
    cardText
  };
}

/**
 * order 객체에서 입력값을 추출해 누수카드 합성 (fallback용 헬퍼)
 * @param {Object} order hw-orders 문서
 * @returns {Promise<Object>} card 객체
 */
async function computeNusuCardFromOrder(order) {
  const u = order.user || {};

  // birthDate 파싱: '1989년 5월 5일' or '1989-05-05'
  const birth = parseBirthDate(u.birthDate);
  if (!birth) throw new Error('cannot parse birthDate: ' + u.birthDate);

  // birthTime: '15:30' or null
  let birthHour = 12, birthMinute = 0;
  if (u.birthTime && u.birthTime.includes(':')) {
    const parts = u.birthTime.split(':');
    birthHour = parseInt(parts[0], 10) || 12;
    birthMinute = parseInt(parts[1], 10) || 0;
  }

  return computeNusuCard({
    name: u.name,
    gender: u.gender,
    birthYear: birth.year,
    birthMonth: birth.month,
    birthDay: birth.day,
    birthHour,
    birthMinute,
    calendarType: u.calendar || 'solar'
  });
}

function parseBirthDate(str) {
  if (!str) return null;
  // '1989년 5월 5일' or '1989년 05월 05일'
  let m = str.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) return { year: +m[1], month: +m[2], day: +m[3] };
  // '1989-05-05'
  m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { year: +m[1], month: +m[2], day: +m[3] };
  return null;
}

module.exports = { computeNusuCard, computeNusuCardFromOrder };