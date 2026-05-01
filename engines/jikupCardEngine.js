// engines/jikupCardEngine.js
// 직업카드 합성 엔진 (사주 API 호출 + 5직업군 판정 + 궁합 점수 + 잠재수입)
// 사용처:
//   - /api/jikup (무료 진단 라우터) — TODO: 향후 리팩토링으로 이 엔진 호출하도록 변경
//   - /api/v2/jikup-treat (유료 처방) fallback — order.jikupCard 없을 때 자동 합성

const axios = require('axios');
const KoreanLunarCalendar = require('korean-lunar-calendar');
const D = require('../jikupCardData');

const SAJU_API = 'https://naread-saju-1075269376260.asia-northeast3.run.app/saju';
const VALID_JOBS = ['직장인','기술직','자영업','프리랜서','공무원','주부','구직중','학생','은퇴'];

function normalizeGender(g) {
  if (!g) return 'male';
  const s = String(g).toLowerCase();
  if (s === 'female' || s === 'f' || s === '\uC5EC' || s === '\uC5EC\uC790') return 'female';
  return 'male';
}

function buildSipseongGroups(saju) {
  if (saju.sipseongCounts && saju.sipseongCounts.groups) return saju.sipseongCounts.groups;
  const d = (saju.sipseongCounts && saju.sipseongCounts.detail) || {};
  return {
    '\uBE44\uACBB': (d['\uBE44\uACAC']||0) + (d['\uACA9\uC7AC']||0),
    '\uC2DD\uC0C1': (d['\uC2DD\uC2E0']||0) + (d['\uC0C1\uAD00']||0),
    '\uC7AC\uC131': (d['\uC815\uC7AC']||0) + (d['\uD3B8\uC7AC']||0),
    '\uAD00\uC131': (d['\uC815\uAD00']||0) + (d['\uD3B8\uAD00']||0),
    '\uC778\uC131': (d['\uC815\uC778']||0) + (d['\uD3B8\uC778']||0)
  };
}

function extractFromGyeokguk(g) {
  if (!g) return null;
  let s = '';
  if (typeof g === 'string') s = g;
  else if (typeof g === 'object') s = g.name || g.label || g.type || g.gyeokguk || JSON.stringify(g);
  else s = String(g);
  if (!s) return null;
  if (s.includes('\uAD00')) return '\uAD00\uC131';
  if (s.includes('\uC7AC')) return '\uC7AC\uC131';
  if (s.includes('\uC2DD') || s.includes('\uC0C1')) return '\uC2DD\uC0C1';
  if (s.includes('\uC778')) return '\uC778\uC131';
  if (s.includes('\uBE44') || s.includes('\uACA9')) return '\uBE44\uACBB';
  return null;
}

function judgeJikup(saju) {
  const groups = buildSipseongGroups(saju);
  const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  const [top1, c1] = sorted[0];
  const [top2, c2] = sorted[1] || [null, 0];

  if (top2 && c1 - c2 <= 1) {
    const fromGyeok = extractFromGyeokguk(saju.gyeokguk);
    if (fromGyeok && (fromGyeok === top1 || fromGyeok === top2)) {
      return D.SIPSEONG_TO_JIKUP[fromGyeok];
    }
    const strengthType = (saju.strength && saju.strength.type) || 'balanced';
    if (strengthType === 'strong') {
      const order = ['\uAD00\uC131','\uC7AC\uC131','\uC2DD\uC0C1','\uBE44\uACBB','\uC778\uC131'];
      for (const s of order) if (s === top1 || s === top2) return D.SIPSEONG_TO_JIKUP[s];
    } else {
      const order = ['\uC778\uC131','\uAD00\uC131','\uBE44\uACBB','\uC7AC\uC131','\uC2DD\uC0C1'];
      for (const s of order) if (s === top1 || s === top2) return D.SIPSEONG_TO_JIKUP[s];
    }
  }
  return D.SIPSEONG_TO_JIKUP[top1] || 'geosang';
}

function fillTemplate(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (_, k) => vars[k] || '');
}

/**
 * 직업카드 합성
 * @param {Object} input
 * @returns {Promise<Object>} jikup-card 라우터 응답 통째 (success 필드 제외)
 */
async function computeJikupCard(input) {
  if (!input || !input.birthYear || !input.birthMonth || !input.birthDay) {
    throw new Error('birth date required');
  }
  if (!input.currentJob || !D.GUNGHAP_MATRIX[input.currentJob]) {
    throw new Error('currentJob required (' + VALID_JOBS.join('/') + ')');
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
    name: input.name || 'jikup',
    year: solarYear, month: solarMonth, day: solarDay,
    hour: (input.birthHour !== undefined && input.birthHour !== null) ? input.birthHour : 12,
    minute: (input.birthMinute !== undefined && input.birthMinute !== null) ? input.birthMinute : 0,
    gender: gv === 'male' ? '\uB0A8' : '\uC5EC',
    calendarType: input.calendarType || 'solar'
  });
  const saju = sajuRes.data.data;

  const jikupKey = judgeJikup(saju);
  const jikupInfo = D.JIKUP_TYPES[jikupKey];

  const score = (D.GUNGHAP_MATRIX[input.currentJob] && D.GUNGHAP_MATRIX[input.currentJob][jikupKey]) || 75;
  const label = D.getLabelByScore(score);

  const currentAvg = D.JOB_AVG_INCOME[input.currentJob] || 0;
  const currentTop = D.JOB_TOP10_INCOME[input.currentJob] || 0;
  const jikupAvg = D.JIKUP_AVG_INCOME[jikupKey];
  const jikupTop = D.JIKUP_TOP10_INCOME[jikupKey];

  const incomeRange = {
    currentJob: {
      label: input.currentJob,
      year:   { min: currentAvg,    max: currentTop    },
      year3:  { min: currentAvg*3,  max: currentTop*3  },
      year5:  { min: currentAvg*5,  max: currentTop*5  },
      year10: { min: currentAvg*10, max: currentTop*10 },
      isPreparing: currentAvg === 0
    },
    jikupDestiny: {
      label: jikupInfo.main,
      year:   { min: jikupAvg,    max: jikupTop    },
      year3:  { min: jikupAvg*3,  max: jikupTop*3  },
      year5:  { min: jikupAvg*5,  max: jikupTop*5  },
      year10: { min: jikupAvg*10, max: jikupTop*10 }
    }
  };

  const vars = { jikupMain: jikupInfo.main, jikupSub: jikupInfo.sub };
  const copy = D.LABEL_COPY[label.code];
  const filledCopy = {
    title: fillTemplate(copy.title, vars),
    body:  fillTemplate(copy.body, vars),
    cta:   fillTemplate(copy.cta, vars)
  };

  const upsell = {
    title:      fillTemplate(D.UPSELL_COPY.title, vars),
    items:      D.UPSELL_COPY.items.map(s => fillTemplate(s, vars)),
    closer:     D.UPSELL_COPY.closer,
    price:      D.UPSELL_COPY.price,
    disclaimer: D.UPSELL_COPY.disclaimer
  };

  const oh = saju.oheng || {};
  const tt = (oh['\uBAA9']||0)+(oh['\uD654']||0)+(oh['\uD1A0']||0)+(oh['\uAE08']||0)+(oh['\uC218']||0);
  const elementGauge = {
    wood:  tt ? Math.round(((oh['\uBAA9']||0)/tt)*100) : 0,
    fire:  tt ? Math.round(((oh['\uD654']||0)/tt)*100) : 0,
    earth: tt ? Math.round(((oh['\uD1A0']||0)/tt)*100) : 0,
    metal: tt ? Math.round(((oh['\uAE08']||0)/tt)*100) : 0,
    water: tt ? Math.round(((oh['\uC218']||0)/tt)*100) : 0
  };

  return {
    card: {
      jikupKey,
      main:    jikupInfo.main,
      sub:     jikupInfo.sub,
      sipseong:jikupInfo.sipseong,
      essence: jikupInfo.essence,
      destiny: jikupInfo.destiny,
      imageUrl:jikupInfo.img
    },
    gunghap: {
      score,
      label:    label.main,
      labelSub: label.sub,
      labelCode:label.code,
      emoji:    label.emoji,
      color:    label.color,
      accent:   label.accent,
      currentJob: input.currentJob
    },
    copy: filledCopy,
    incomeRange,
    upsell,
    sajuMeta: {
      dayGan:    saju.dayMaster && saju.dayMaster.gan,
      dayElement:saju.dayMaster && saju.dayMaster.oheng,
      strength:  saju.strength && saju.strength.type,
      gyeokguk:  saju.gyeokguk,
      sipseongGroups: buildSipseongGroups(saju),
      elementGauge,
      daeun: saju.daeun || [],
      fourPillars: {
        year:  saju.fourPillars.year.hanja,
        month: saju.fourPillars.month.hanja,
        day:   saju.fourPillars.day.hanja,
        hour:  saju.fourPillars.hour.hanja
      },
      fourPillarsHangul: {
        year:  saju.fourPillars.year.hangul,
        month: saju.fourPillars.month.hangul,
        day:   saju.fourPillars.day.hangul,
        hour:  saju.fourPillars.hour.hangul
      }
    }
  };
}

/**
 * order 객체에서 입력값을 추출해 직업카드 합성 (fallback용 헬퍼)
 * currentJob 우선순위: order.currentJob → order.job → '직장인'
 */
async function computeJikupCardFromOrder(order) {
  const u = order.user || {};

  const birth = parseBirthDate(u.birthDate);
  if (!birth) throw new Error('cannot parse birthDate: ' + u.birthDate);

  let birthHour = 12, birthMinute = 0;
  if (u.birthTime && u.birthTime.includes(':')) {
    const parts = u.birthTime.split(':');
    birthHour = parseInt(parts[0], 10) || 12;
    birthMinute = parseInt(parts[1], 10) || 0;
  }

  let currentJob = order.currentJob || order.job || '\uC9C1\uC7A5\uC778';
  if (!D.GUNGHAP_MATRIX[currentJob]) currentJob = '\uC9C1\uC7A5\uC778';

  return computeJikupCard({
    name: u.name,
    gender: u.gender,
    birthYear: birth.year,
    birthMonth: birth.month,
    birthDay: birth.day,
    birthHour,
    birthMinute,
    calendarType: u.calendar || 'solar',
    currentJob
  });
}

function parseBirthDate(str) {
  if (!str) return null;
  let m = str.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) return { year: +m[1], month: +m[2], day: +m[3] };
  m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { year: +m[1], month: +m[2], day: +m[3] };
  return null;
}

module.exports = { computeJikupCard, computeJikupCardFromOrder };