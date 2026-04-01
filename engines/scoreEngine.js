// 재물 관련 키/점수 계산 공통 (v3 - 정규분포 보정)

function calcVesselKey(counts) {
  var jae = counts.jae, jeongJae = counts.jeongJae, pyeonJae = counts.pyeonJae;
  var bigyeop = counts.bigyeop, siksang = counts.siksang, gwansung = counts.gwansung, insung = counts.insung;
  if (bigyeop >= 3 && jae >= 1) return 'leak';
  if (jeongJae >= 1 && pyeonJae >= 1) return 'both_strong';
  if (siksang >= 2 && jae >= 1) return 'skill';
  if (jeongJae >= 2) return 'jeong_strong';
  if (pyeonJae >= 2) return 'pyeon_strong';
  if (jeongJae >= 1) return 'jeong_moderate';
  if (pyeonJae >= 1) return 'pyeon_moderate';
  if (siksang >= 2) return 'skill_potential';
  if (bigyeop >= 2 && jae >= 1) return 'leak_mild';
  if (gwansung >= 2) return 'official_wealth';
  if (insung >= 3) return 'knowledge_wealth';
  return 'both_weak';
}

function calcWealthGrade(counts, strength) {
  var jae = counts.jae, jeongJae = counts.jeongJae, pyeonJae = counts.pyeonJae;
  var bigyeop = counts.bigyeop, siksang = counts.siksang, gwansung = counts.gwansung, insung = counts.insung;
  var score = 2.5;
  if (jeongJae >= 1 && pyeonJae >= 1) score += 1.2;
  else if (jae >= 2) score += 0.8;
  else if (jae >= 1) score += 0.4;
  if (siksang >= 1 && jae >= 1) score += 0.3;
  if (siksang >= 2 && jae >= 2) score += 0.3;
  if (gwansung >= 1 && jae >= 1) score += 0.2;
  if (bigyeop >= 3) score -= 0.8;
  else if (bigyeop >= 2) score -= 0.3;
  if (insung >= 4 && jae === 0) score -= 0.3;
  if (strength === 'strong' && jae >= 1) score += 0.3;
  if (strength === 'weak' && jae >= 2) score += 0.2;
  if (jae === 0) score -= 0.5;
  score = Math.max(1, Math.min(5, Math.round(score)));
  var map = { 5: 'S', 4: 'A', 3: 'B', 2: 'C', 1: 'D' };
  return { wealthScore: score, wealthGrade: map[score] || 'B' };
}

function calcVesselSize(counts, strength, dayElement) {
  var jae = counts.jae, jeongJae = counts.jeongJae, pyeonJae = counts.pyeonJae;
  var bigyeop = counts.bigyeop, siksang = counts.siksang, gwansung = counts.gwansung, insung = counts.insung;
  var size = 35;
  size += jae * 8;
  if (siksang >= 1 && jae >= 1) size += 5;
  if (jeongJae >= 1 && pyeonJae >= 1) size += 4;
  if (gwansung >= 1 && jae >= 1) size += 2;
  if (strength === 'strong') size += 3;
  if (bigyeop >= 3) size -= 8;
  else if (bigyeop >= 2) size -= 4;
  if (insung >= 4 && jae === 0) size -= 5;
  if (jae === 0) size -= 5;
  var elBonus = { wood: 2, fire: 0, earth: 4, metal: 3, water: 1 };
  size += elBonus[dayElement] || 0;
  return Math.max(15, Math.min(95, size));
}

function calcChannelKey(counts) {
  var gwansung = counts.gwansung, siksang = counts.siksang, bigyeop = counts.bigyeop;
  var insung = counts.insung, jae = counts.jae;
  if (gwansung >= 4) return 'official';
  if (siksang >= 4) return 'creative';
  if (bigyeop >= 4) return 'network';
  if (insung >= 4) return 'knowledge';
  if (jae >= 4) return 'finance';
  var maxCount = Math.max(gwansung, siksang, bigyeop, insung, jae);
  if (maxCount >= 2) {
    if (gwansung === maxCount) return 'official';
    if (siksang === maxCount) return 'creative';
    if (bigyeop === maxCount) return 'network';
    if (insung === maxCount) return 'knowledge';
    if (jae === maxCount) return 'finance';
  }
  return 'mixed';
}

function calcChannelGauge(counts, dayElement) {
  var base = {
    official: counts.gwansung * 10,
    creative: counts.siksang * 10,
    network: counts.bigyeop * 10,
    knowledge: counts.insung * 10,
    finance: counts.jae * 10
  };
  var bonus = {
    wood:  { official: 15, creative: 30, network: 25, knowledge: 25, finance: 20 },
    fire:  { official: 20, creative: 30, network: 25, knowledge: 20, finance: 15 },
    earth: { official: 30, creative: 15, network: 20, knowledge: 20, finance: 30 },
    metal: { official: 25, creative: 20, network: 20, knowledge: 25, finance: 30 },
    water: { official: 20, creative: 25, network: 30, knowledge: 30, finance: 20 }
  };
  var b = bonus[dayElement] || bonus['wood'];
  return {
    official: Math.min(100, base.official + b.official),
    creative: Math.min(100, base.creative + b.creative),
    network: Math.min(100, base.network + b.network),
    knowledge: Math.min(100, base.knowledge + b.knowledge),
    finance: Math.min(100, base.finance + b.finance)
  };
}

function calcLeakInfo(counts) {
  var leakScores = {
    people: counts.bigyeop >= 3 ? counts.bigyeop * 2 : counts.bigyeop,
    desire: counts.siksang >= 3 ? counts.siksang * 2 : counts.siksang,
    pride: counts.gwansung >= 3 ? counts.gwansung * 2 : counts.gwansung,
    learning: counts.insung >= 3 ? counts.insung * 2 : counts.insung
  };
  var sorted = Object.entries(leakScores).sort(function(a,b){ return b[1]-a[1]; });
  var topScore = sorted[0][1];
  var leakKey = topScore >= 4 ? sorted[0][0] : 'unconscious';
  var totalPressure = Object.values(leakScores).reduce(function(a,b){ return a+b; }, 0);
  var defense = Math.min(counts.jae * 2, 6);
  var finalScore = Math.max(0, topScore + Math.floor(totalPressure / 4) - defense);
  var leakLevel;
  if (finalScore <= 1) leakLevel = 1;
  else if (finalScore <= 4) leakLevel = 2;
  else if (finalScore <= 7) leakLevel = 3;
  else if (finalScore <= 10) leakLevel = 4;
  else leakLevel = 5;
  var labelMap = { 1: '\uc591\ud638', 2: '\uc8fc\uc758', 3: '\uacbd\uace0', 4: '\uc704\ud5d8', 5: '\uc2ec\uac01' };
  return { leakKey: leakKey, leakLevel: leakLevel, leakLabel: labelMap[leakLevel], leakScores: leakScores };
}

function calcHabitKey(elementGauge) {
  var sorted = Object.entries(elementGauge).sort(function(a,b){ return b[1]-a[1]; });
  if (sorted[0][1] >= 38) {
    var map = { wood: 'wood_excess', fire: 'fire_excess', earth: 'earth_excess', metal: 'metal_excess', water: 'water_excess' };
    return map[sorted[0][0]] || 'balanced';
  }
  return 'balanced';
}

module.exports = {
  calcVesselKey: calcVesselKey,
  calcWealthGrade: calcWealthGrade,
  calcVesselSize: calcVesselSize,
  calcChannelKey: calcChannelKey,
  calcChannelGauge: calcChannelGauge,
  calcLeakInfo: calcLeakInfo,
  calcHabitKey: calcHabitKey
};