// ═══════════════════════════════════════════════════════
// routes/jikup-card.js — 직업패 (무료)
// 입력: 이름·성별·생년월일·시간·달력·현재직업
// 출력: 5직업군 판정 + 매치도 + 라벨 + 잠재수입 범위
// ═══════════════════════════════════════════════════════

const express = require('express');
const axios = require('axios');
const KoreanLunarCalendar = require('korean-lunar-calendar');
const router = express.Router();

const D = require('../jikupCardData');

// ───────────────────────────────────────
// 유틸
// ───────────────────────────────────────
function normalizeGender(g) {
  if (!g) return 'male';
  const s = String(g).toLowerCase();
  if (s === 'female' || s === 'f' || s === '여' || s === '여자') return 'female';
  return 'male';
}

// 사주 응답에서 십성 카운트 → groups 합산
function buildSipseongGroups(saju) {
  // saju.sipseongCounts.groups가 있으면 그대로
  if (saju.sipseongCounts && saju.sipseongCounts.groups) {
    return saju.sipseongCounts.groups;
  }
  // 없으면 detail에서 직접 계산
  const d = (saju.sipseongCounts && saju.sipseongCounts.detail) || {};
  return {
    '비겁': (d['비견']||0) + (d['겁재']||0),
    '식상': (d['식신']||0) + (d['상관']||0),
    '재성': (d['정재']||0) + (d['편재']||0),
    '관성': (d['정관']||0) + (d['편관']||0),
    '인성': (d['정인']||0) + (d['편인']||0)
  };
}

// 격국에서 십성 추출
function extractFromGyeokguk(g) {
  if (!g) return null;
  // gyeokguk이 객체일 수도 있음 → name/label/type 등에서 문자열 추출
  let s = '';
  if (typeof g === 'string') s = g;
  else if (typeof g === 'object') s = g.name || g.label || g.type || g.gyeokguk || JSON.stringify(g);
  else s = String(g);
  if (!s) return null;
  if (s.includes('관')) return '관성';
  if (s.includes('재')) return '재성';
  if (s.includes('식') || s.includes('상')) return '식상';
  if (s.includes('인')) return '인성';
  if (s.includes('비') || s.includes('겁')) return '비겁';
  return null;
}

// ───────────────────────────────────────
// 5직업군 판정
// ───────────────────────────────────────
function judgeJikup(saju) {
  const groups = buildSipseongGroups(saju);
  const sorted = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  const [top1, c1] = sorted[0];
  const [top2, c2] = sorted[1] || [null, 0];

  // 1·2순위 차이 1 이하 → 격국 우선
  if (top2 && c1 - c2 <= 1) {
    const fromGyeok = extractFromGyeokguk(saju.gyeokguk);
    if (fromGyeok && (fromGyeok === top1 || fromGyeok === top2)) {
      return D.SIPSEONG_TO_JIKUP[fromGyeok];
    }
    // 격국 미일치 → 강약 순서로
    const strengthType = (saju.strength && saju.strength.type) || 'balanced';
    if (strengthType === 'strong') {
      const order = ['관성', '재성', '식상', '비겁', '인성'];
      for (const s of order) if (s === top1 || s === top2) return D.SIPSEONG_TO_JIKUP[s];
    } else {
      const order = ['인성', '관성', '비겁', '재성', '식상'];
      for (const s of order) if (s === top1 || s === top2) return D.SIPSEONG_TO_JIKUP[s];
    }
  }
  return D.SIPSEONG_TO_JIKUP[top1] || 'geosang';
}

// ───────────────────────────────────────
// 카피 치환
// ───────────────────────────────────────
function fillTemplate(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (_, k) => vars[k] || '');
}

// ───────────────────────────────────────
// 메인 라우트
// ───────────────────────────────────────
router.post('/api/jikup', async (req, res) => {
  try {
    const {
      name, gender, birthYear, birthMonth, birthDay,
      birthHour, birthMinute, calendarType, currentJob
    } = req.body;

    if (!birthYear || !birthMonth || !birthDay) {
      return res.status(400).json({ success: false, error: 'birth date required' });
    }
    if (!currentJob || !D.GUNGHAP_MATRIX[currentJob]) {
      return res.status(400).json({ success: false, error: 'currentJob required (직장인/기술직/자영업/프리랜서/공무원/주부/구직중/학생/은퇴)' });
    }

    const gv = normalizeGender(gender);
    let solarYear = Number(birthYear);
    let solarMonth = Number(birthMonth);
    let solarDay = Number(birthDay);

    if (calendarType === 'lunar') {
      const cal = new KoreanLunarCalendar();
      cal.setLunarDate(Number(birthYear), Number(birthMonth), Number(birthDay), false);
      const sol = cal.getSolarCalendar();
      solarYear = sol.year;
      solarMonth = sol.month;
      solarDay = sol.day;
    }

    // 사주 API 호출
    const sajuRes = await axios.post('https://naread-saju-1075269376260.asia-northeast3.run.app/saju', {
      name: name || 'jikup',
      year: solarYear, month: solarMonth, day: solarDay,
      hour: (birthHour !== undefined && birthHour !== null) ? birthHour : 12,
      minute: (birthMinute !== undefined && birthMinute !== null) ? birthMinute : 0,
      gender: gv === 'male' ? '\uB0A8' : '\uC5EC',
      calendarType: calendarType || 'solar'
    });
    const saju = sajuRes.data.data;

    // 5직업군 판정
    const jikupKey = judgeJikup(saju);
    const jikupInfo = D.JIKUP_TYPES[jikupKey];

    // 직업 궁합 점수 + 라벨
    const score = (D.GUNGHAP_MATRIX[currentJob] && D.GUNGHAP_MATRIX[currentJob][jikupKey]) || 75;
    const label = D.getLabelByScore(score);

    // 잠재수입 (현재직업 / 사주직업)
    const currentAvg = D.JOB_AVG_INCOME[currentJob] || 0;
    const currentTop = D.JOB_TOP10_INCOME[currentJob] || 0;
    const jikupAvg = D.JIKUP_AVG_INCOME[jikupKey];
    const jikupTop = D.JIKUP_TOP10_INCOME[jikupKey];

    const incomeRange = {
      currentJob: {
        label: currentJob,
        year:  { min: currentAvg, max: currentTop },
        year3: { min: currentAvg*3, max: currentTop*3 },
        year5: { min: currentAvg*5, max: currentTop*5 },
        year10:{ min: currentAvg*10, max: currentTop*10 },
        isPreparing: currentAvg === 0
      },
      jikupDestiny: {
        label: jikupInfo.main,
        year:  { min: jikupAvg, max: jikupTop },
        year3: { min: jikupAvg*3, max: jikupTop*3 },
        year5: { min: jikupAvg*5, max: jikupTop*5 },
        year10:{ min: jikupAvg*10, max: jikupTop*10 }
      }
    };

    // 카피 채움
    const vars = { jikupMain: jikupInfo.main, jikupSub: jikupInfo.sub };
    const copy = D.LABEL_COPY[label.code];
    const filledCopy = {
      title: fillTemplate(copy.title, vars),
      body:  fillTemplate(copy.body, vars),
      cta:   fillTemplate(copy.cta, vars)
    };

    // 업셀 카피 채움
    const upsell = {
      title:   fillTemplate(D.UPSELL_COPY.title, vars),
      items:   D.UPSELL_COPY.items.map(s => fillTemplate(s, vars)),
      closer:  D.UPSELL_COPY.closer,
      price:   D.UPSELL_COPY.price,
      disclaimer: D.UPSELL_COPY.disclaimer
    };

    // 사주 보조 (시각화용)
    const oh = saju.oheng || {};
    const tt = (oh['\uBAA9']||0)+(oh['\uD654']||0)+(oh['\uD1A0']||0)+(oh['\uAE08']||0)+(oh['\uC218']||0);
    const elementGauge = {
      wood:  tt ? Math.round(((oh['\uBAA9']||0)/tt)*100) : 0,
      fire:  tt ? Math.round(((oh['\uD654']||0)/tt)*100) : 0,
      earth: tt ? Math.round(((oh['\uD1A0']||0)/tt)*100) : 0,
      metal: tt ? Math.round(((oh['\uAE08']||0)/tt)*100) : 0,
      water: tt ? Math.round(((oh['\uC218']||0)/tt)*100) : 0
    };

    res.json({
      success: true,
      card: {
        jikupKey,
        main:    jikupInfo.main,
        sub:     jikupInfo.sub,
        sipseong: jikupInfo.sipseong,
        essence: jikupInfo.essence,
        destiny: jikupInfo.destiny,
        imageUrl: jikupInfo.img
      },
      gunghap: {
        score,
        label: label.main,
        labelSub: label.sub,
        labelCode: label.code,
        emoji: label.emoji,
        color: label.color,
        accent: label.accent,
        currentJob
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
    });
  } catch (err) {
    console.error('jikup-card error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
